<?php
// Statistik-Helper: Erfassung (von den normalen Endpoints aus aufgerufen) und
// Zugang zur separaten Statistik-Ansicht (/stats). Wird zusätzlich zu db.php
// eingebunden, damit db.php selbst schlank bleibt.

require_once __DIR__ . '/db.php';

/**
 * Statistik-Zugang: eigene Rolle, bewusst OHNE Admin-Fallback (anders als
 * requireModerator()) - ein eingeloggter Admin sieht die Statistik nicht
 * automatisch, und ein Statistik-Login gibt keinerlei Admin-Rechte.
 */
function requireStats(): void
{
    startSession();
    if (empty($_SESSION['stats'])) {
        http_response_code(403);
        header('Content-Type: application/json');
        echo json_encode(['error' => 'Nicht authentifiziert']);
        exit;
    }
}

/**
 * DB-Hash hat Vorrang (gesetzt, sobald das Passwort einmal in /stats
 * geändert wurde), sonst Bootstrap-Passwort STATS_PASSWORD aus .env - gleiches
 * Muster wie verifyAdminPassword(). Ohne beides bleibt der Zugang gesperrt.
 */
function verifyStatsPassword(string $password): bool
{
    $hash = getSetting('stats_password_hash');
    if ($hash !== null) {
        return password_verify($password, $hash);
    }

    $envPassword = (string) (config()['stats_password'] ?? '');
    return $envPassword !== '' && hash_equals($envPassword, $password);
}

/**
 * Anonymer Besucher-Bezeichner (Cookie stats_vid, 30 Tage) - wird nur von
 * stats-track.php beim Seitenaufruf erzeugt. Serverseitige Ereignisse
 * (Anmeldung, Voting) lesen ihn nur mit, damit sich der Ablauf Suche →
 * Songwahl → Anmeldung pro Besucher auswerten lässt; ohne Cookie bleibt er
 * einfach leer.
 */
function statsVisitorId(bool $create = false, bool &$isNew = false): ?string
{
    $existing = $_COOKIE['stats_vid'] ?? '';
    if (is_string($existing) && preg_match('/^[a-f0-9]{32}$/', $existing)) {
        return $existing;
    }
    if (!$create) {
        return null;
    }

    $id = bin2hex(random_bytes(16));
    setcookie('stats_vid', $id, [
        'expires' => time() + 60 * 60 * 24 * 30,
        'path' => '/',
        'httponly' => true,
        'samesite' => 'Lax',
    ]);
    $_COOKIE['stats_vid'] = $id;
    $isNew = true;

    return $id;
}

/**
 * Nur zum Zählen verschiedener Voter - der rohe Voting-Token (quasi ein
 * Cookie-Passwort für die eigenen Stimmen) landet so nie in der Statistik.
 * Muss mit LEFT(SHA2(voter_token, 256), 16) im Backfill (database.sql)
 * übereinstimmen.
 */
function statsVoterHash(string $voterToken): string
{
    return substr(hash('sha256', $voterToken), 0, 16);
}

/**
 * Schreibt ein Ereignis - schluckt jeden Fehler, weil die Statistik den
 * eigentlichen Ablauf (Anmeldung, Voting, Songwechsel) nie stören darf,
 * z.B. auch dann nicht, wenn die Migration noch gar nicht gelaufen ist.
 */
function logStatsEvent(string $type, array $data = []): void
{
    try {
        $stmt = db()->prepare(
            'INSERT INTO stats_events
             (event_type, visitor_id, term, result_count, song_id, queue_entry_id, song_label, detail)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?)'
        );
        $stmt->execute([
            $type,
            array_key_exists('visitor_id', $data) ? $data['visitor_id'] : statsVisitorId(),
            $data['term'] ?? null,
            $data['result_count'] ?? null,
            $data['song_id'] ?? null,
            $data['queue_entry_id'] ?? null,
            $data['song_label'] ?? null,
            $data['detail'] ?? null,
        ]);
    } catch (Throwable $e) {
        // bewusst ignoriert, siehe oben
    }
}

function statsSongLabel(int $songId): ?string
{
    try {
        $stmt = db()->prepare('SELECT artist, title FROM songs WHERE id = ?');
        $stmt->execute([$songId]);
        $song = $stmt->fetch();
        return $song ? "{$song['artist']} – {$song['title']}" : null;
    } catch (Throwable $e) {
        return null;
    }
}

/**
 * Statuswechsel eines Warteschlangen-Eintrags - Grundlage für Freigabezeit,
 * Wartezeit und Bühnenzeit pro Song (queue_entries selbst hat nur
 * created_at, und die Einträge werden später evtl. gelöscht).
 */
function logStatusChange(int $queueEntryId, string $status): void
{
    logStatsEvent('status', array_merge(statsEntrySong($queueEntryId), [
        'visitor_id' => null,
        'queue_entry_id' => $queueEntryId,
        'detail' => $status,
    ]));
}

/**
 * Song-Id + Label zu einem Warteschlangen-Eintrag, als Teil-Array für
 * logStatsEvent() (leer, falls der Eintrag nicht mehr existiert).
 */
function statsEntrySong(int $queueEntryId): array
{
    try {
        $stmt = db()->prepare(
            'SELECT q.song_id, s.artist, s.title FROM queue_entries q
             LEFT JOIN songs s ON s.id = q.song_id WHERE q.id = ?'
        );
        $stmt->execute([$queueEntryId]);
        $row = $stmt->fetch();
    } catch (Throwable $e) {
        $row = false;
    }

    if (!$row) {
        return [];
    }

    return [
        'song_id' => (int) $row['song_id'],
        'song_label' => $row['title'] !== null ? "{$row['artist']} – {$row['title']}" : null,
    ];
}

/**
 * Grobe Geräte-Einordnung statt Speicherung des rohen User-Agents
 * (Datensparsamkeit, und für die Auswertung reichen die Kategorien).
 * $touch kommt vom Browser (navigator.maxTouchPoints > 1): iPadOS meldet
 * sich serverseitig als "Macintosh", nur so lässt es sich vom Mac trennen.
 */
function statsClassifyUserAgent(string $ua, bool $touch): array
{
    $os = 'Andere';
    if (preg_match('/iPhone|iPad|iPod/i', $ua) || (stripos($ua, 'Macintosh') !== false && $touch)) {
        $os = 'iOS';
    } elseif (stripos($ua, 'Android') !== false) {
        $os = 'Android';
    } elseif (stripos($ua, 'Windows') !== false) {
        $os = 'Windows';
    } elseif (stripos($ua, 'Macintosh') !== false || stripos($ua, 'Mac OS X') !== false) {
        $os = 'macOS';
    } elseif (stripos($ua, 'CrOS') !== false) {
        $os = 'ChromeOS';
    } elseif (stripos($ua, 'Linux') !== false) {
        $os = 'Linux';
    }

    // Reihenfolge zählt: fast alle UAs enthalten "Safari", Chrome-Ableger
    // zusätzlich "Chrome" - die spezifischsten Kennungen deshalb zuerst.
    $browser = 'Andere';
    if (preg_match('/Instagram|FBAN|FBAV|FB_IAB|Snapchat|TikTok|musical_ly/i', $ua)) {
        $browser = 'In-App';
    } elseif (stripos($ua, 'SamsungBrowser') !== false) {
        $browser = 'Samsung';
    } elseif (preg_match('/Edg(e|A|iOS)?\//', $ua)) {
        $browser = 'Edge';
    } elseif (preg_match('/OPR\/|Opera/', $ua)) {
        $browser = 'Opera';
    } elseif (preg_match('/Firefox\/|FxiOS\//', $ua)) {
        $browser = 'Firefox';
    } elseif (preg_match('/Chrome\/|CriOS\//', $ua)) {
        $browser = 'Chrome';
    } elseif (stripos($ua, 'Safari') !== false) {
        $browser = 'Safari';
    }

    $device = 'Desktop';
    if (preg_match('/iPad|Tablet/i', $ua) || ($os === 'iOS' && stripos($ua, 'Macintosh') !== false)
        || ($os === 'Android' && stripos($ua, 'Mobile') === false)) {
        $device = 'Tablet';
    } elseif (preg_match('/Mobile|iPhone|iPod|Android/i', $ua)) {
        $device = 'Smartphone';
    }

    return ['os' => $os, 'browser' => $browser, 'device' => $device];
}

/**
 * Suchbegriffe vereinheitlichen, damit "Queen", "queen " und "QUEEN" in der
 * Rangliste zusammenfallen.
 */
function statsNormalizeTerm(string $term): string
{
    $term = preg_replace('/\s+/u', ' ', trim($term));
    return mb_substr(mb_strtolower((string) $term), 0, 100);
}
