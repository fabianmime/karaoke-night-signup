<?php
// Öffentlicher Erfassungs-Endpoint für js/track.js (Seitenaufrufe,
// Heartbeats, Suchbegriffe, Klickpfad). Antwortet immer mit 204 bzw. einem
// knappen JSON und bricht nie etwas im Frontend - auch nicht, wenn die
// Statistik-Tabellen fehlen. Nimmt auch navigator.sendBeacon() an (kommt als
// text/plain, jsonInput() liest den Rohinhalt trotzdem).
require __DIR__ . '/../lib/db.php';
require_once __DIR__ . '/../lib/stats.php';
header('Content-Type: application/json');

if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
    http_response_code(405);
    echo json_encode(['error' => 'Methode nicht erlaubt']);
    return;
}

$input = jsonInput();
$type = (string) ($input['type'] ?? '');
$visitId = (string) ($input['visit'] ?? '');

if (!preg_match('/^[a-f0-9]{32}$/', $visitId)) {
    http_response_code(400);
    echo json_encode(['error' => 'Ungültige Anfrage']);
    return;
}

const STATS_PAGES = ['guest', 'display', 'moderation'];
// Klickpfad-Ereignisse aus dem Frontend - alles andere (Anmeldung, Stimmen,
// Statuswechsel) wird serverseitig in den jeweiligen Endpoints erfasst und
// ist hier bewusst nicht fälschbar.
const STATS_CLIENT_EVENTS = ['choose_register', 'choose_vote', 'song_select', 'form_error'];

try {
    $pdo = db();

    if ($type === 'pageview') {
        $page = (string) ($input['page'] ?? '');
        if (!in_array($page, STATS_PAGES, true)) {
            http_response_code(400);
            echo json_encode(['error' => 'Ungültige Seite']);
            return;
        }

        $isNew = false;
        $visitorId = statsVisitorId(true, $isNew);
        $ua = statsClassifyUserAgent((string) ($_SERVER['HTTP_USER_AGENT'] ?? ''), !empty($input['touch']));
        $source = strtolower((string) ($input['source'] ?? ''));
        $source = preg_match('/^[a-z0-9_-]{1,20}$/', $source) ? $source : null;

        $pdo->prepare(
            'INSERT IGNORE INTO stats_visits (visit_id, visitor_id, page, is_new_visitor, device, os, browser, source)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?)'
        )->execute([$visitId, $visitorId, $page, $isNew ? 1 : 0, $ua['device'], $ua['os'], $ua['browser'], $source]);

        http_response_code(204);
        return;
    }

    $visitorId = statsVisitorId();

    if ($type === 'heartbeat') {
        // Nur der eigene Besuch lässt sich verlängern (visitor_id muss passen).
        $pdo->prepare('UPDATE stats_visits SET last_seen = CURRENT_TIMESTAMP WHERE visit_id = ? AND visitor_id = ?')
            ->execute([$visitId, (string) $visitorId]);
        http_response_code(204);
        return;
    }

    if ($type === 'search') {
        $term = statsNormalizeTerm((string) ($input['term'] ?? ''));
        if (mb_strlen($term) < 2) {
            http_response_code(204);
            return;
        }
        $results = max(0, min(1000, (int) ($input['results'] ?? 0)));
        logStatsEvent('search', ['visitor_id' => $visitorId, 'term' => $term, 'result_count' => $results]);
        http_response_code(204);
        return;
    }

    if (in_array($type, STATS_CLIENT_EVENTS, true)) {
        $songId = (int) ($input['song_id'] ?? 0);
        $detail = (string) ($input['detail'] ?? '');
        logStatsEvent($type, [
            'visitor_id' => $visitorId,
            'song_id' => $songId > 0 ? $songId : null,
            'song_label' => $songId > 0 ? statsSongLabel($songId) : null,
            'detail' => preg_match('/^[a-z0-9_]{1,64}$/', $detail) ? $detail : null,
        ]);
        http_response_code(204);
        return;
    }

    http_response_code(400);
    echo json_encode(['error' => 'Unbekannter Ereignistyp']);
} catch (Throwable $e) {
    http_response_code(204);
}
