<?php
// Liefert die komplette Auswertung für /stats in einem Aufruf. Zeiträume
// kommen als Unix-Sekunden (from/to) - so passt die Zeitzone unabhängig davon,
// in welcher Zeitzone die MariaDB-Session läuft (UNIX_TIMESTAMP/FROM_UNIXTIME
// rechnen immer korrekt um). from=0 bedeutet "seit Beginn der Aufzeichnung".
require __DIR__ . '/../lib/db.php';
require_once __DIR__ . '/../lib/stats.php';
header('Content-Type: application/json');
requireStats();

$pdo = db();

function rows(string $sql, array $params = []): array
{
    $stmt = db()->prepare($sql);
    $stmt->execute($params);
    return $stmt->fetchAll();
}

function one(string $sql, array $params = [])
{
    $stmt = db()->prepare($sql);
    $stmt->execute($params);
    return $stmt->fetchColumn();
}

function median(array $values): ?float
{
    if (!$values) {
        return null;
    }
    sort($values);
    $n = count($values);
    $mid = intdiv($n, 2);
    return $n % 2 ? (float) $values[$mid] : ($values[$mid - 1] + $values[$mid]) / 2;
}

function summary(array $values): array
{
    return [
        'n' => count($values),
        'avg' => $values ? array_sum($values) / count($values) : null,
        'median' => median($values),
        'min' => $values ? min($values) : null,
        'max' => $values ? max($values) : null,
    ];
}

try {
    $now = time();
    $to = (int) ($_GET['to'] ?? 0) ?: $now;
    $from = (int) ($_GET['from'] ?? 0);

    if ($from <= 0) {
        $firstEvent = one('SELECT UNIX_TIMESTAMP(MIN(created_at)) FROM stats_events');
        $firstVisit = one('SELECT UNIX_TIMESTAMP(MIN(started_at)) FROM stats_visits');
        $candidates = array_filter([(int) $firstEvent, (int) $firstVisit]);
        $from = $candidates ? min($candidates) : $now - 3600;
    }
    if ($to <= $from) {
        $to = $from + 3600;
    }

    // Bucket-Grösse so wählen, dass die Zeitachse lesbar bleibt (~50-100
    // Balken) - Tages-Buckets werden auf Schweizer Mitternacht ausgerichtet.
    $span = $to - $from;
    if ($span <= 4 * 3600) {
        $bucket = 300;
    } elseif ($span <= 12 * 3600) {
        $bucket = 900;
    } elseif ($span <= 4 * 86400) {
        $bucket = 3600;
    } else {
        $bucket = 86400;
    }
    $offset = (new DateTime('@' . $to))->setTimezone(new DateTimeZone('Europe/Zurich'))->getOffset();
    $firstKey = intdiv($from + $offset, $bucket);
    $lastKey = intdiv($to + $offset, $bucket);
    $keys = range($firstKey, $lastKey);
    $bucketStarts = array_map(fn ($k) => $k * $bucket - $offset, $keys);

    $range = [$from, $to];
    $evRange = 'created_at >= FROM_UNIXTIME(?) AND created_at < FROM_UNIXTIME(?)';
    $viRange = 'started_at >= FROM_UNIXTIME(?) AND started_at < FROM_UNIXTIME(?)';

    /* ---------- Besuche ---------- */

    $online = [];
    foreach (rows(
        "SELECT page, COUNT(*) AS n FROM stats_visits
         WHERE last_seen >= NOW() - INTERVAL 75 SECOND GROUP BY page"
    ) as $r) {
        $online[$r['page']] = (int) $r['n'];
    }

    $pages = array_map(fn ($r) => [
        'page' => $r['page'],
        'views' => (int) $r['views'],
        'visitors' => (int) $r['visitors'],
    ], rows(
        "SELECT page, COUNT(*) AS views, COUNT(DISTINCT visitor_id) AS visitors
         FROM stats_visits WHERE $viRange GROUP BY page ORDER BY views DESC",
        $range
    ));

    $guestVisits = rows(
        "SELECT visitor_id, is_new_visitor, UNIX_TIMESTAMP(started_at) AS s, UNIX_TIMESTAMP(last_seen) AS e
         FROM stats_visits WHERE page = 'guest' AND $viRange",
        $range
    );
    $durations = array_map(fn ($v) => max(0, (int) $v['e'] - (int) $v['s']), $guestVisits);
    $guestVisitors = count(array_unique(array_column($guestVisits, 'visitor_id')));
    $newVisitors = count(array_unique(array_column(
        array_filter($guestVisits, fn ($v) => (int) $v['is_new_visitor'] === 1),
        'visitor_id'
    )));

    // Gleichzeitig aktive Gäste pro Bucket: jeder Besuch zählt in allen
    // Buckets, die er zeitlich berührt (nur Besuche, die den Zeitraum
    // überlappen - also auch solche, die kurz vor "from" begonnen haben).
    $active = array_fill_keys($keys, []);
    foreach (rows(
        "SELECT visitor_id, UNIX_TIMESTAMP(started_at) AS s, UNIX_TIMESTAMP(last_seen) AS e
         FROM stats_visits WHERE page = 'guest'
           AND started_at < FROM_UNIXTIME(?) AND last_seen >= FROM_UNIXTIME(?)",
        [$to, $from]
    ) as $v) {
        $k0 = max($firstKey, intdiv((int) $v['s'] + $offset, $bucket));
        $k1 = min($lastKey, intdiv((int) $v['e'] + $offset, $bucket));
        for ($k = $k0; $k <= $k1; $k++) {
            $active[$k][$v['visitor_id']] = true;
        }
    }

    $pageviewBuckets = array_fill_keys($keys, 0);
    foreach ($guestVisits as $v) {
        $k = intdiv((int) $v['s'] + $offset, $bucket);
        if (isset($pageviewBuckets[$k])) {
            $pageviewBuckets[$k]++;
        }
    }

    /* ---------- Zeitverlauf der Ereignisse ---------- */

    $series = [
        'search' => array_fill_keys($keys, 0),
        'registration' => array_fill_keys($keys, 0),
        'vote' => array_fill_keys($keys, 0),
    ];
    foreach (rows(
        "SELECT FLOOR((UNIX_TIMESTAMP(created_at) + ?) / ?) AS k, event_type, COUNT(*) AS n
         FROM stats_events
         WHERE event_type IN ('search', 'registration', 'vote') AND $evRange
         GROUP BY k, event_type",
        [$offset, $bucket, $from, $to]
    ) as $r) {
        $k = (int) $r['k'];
        if (isset($series[$r['event_type']][$k])) {
            $series[$r['event_type']][$k] = (int) $r['n'];
        }
    }

    /* ---------- Ereignis-Zähler ---------- */

    $counts = [];
    foreach (rows(
        "SELECT event_type, COALESCE(detail, '') AS detail, COUNT(*) AS n
         FROM stats_events WHERE $evRange GROUP BY event_type, detail",
        $range
    ) as $r) {
        $counts[$r['event_type']][$r['detail']] = (int) $r['n'];
    }
    $sum = fn (string $type) => array_sum($counts[$type] ?? []);
    $distinctVisitors = function (string $type) use ($range, $evRange): int {
        return (int) one(
            "SELECT COUNT(DISTINCT visitor_id) FROM stats_events WHERE event_type = ? AND visitor_id IS NOT NULL AND $evRange",
            array_merge([$type], $range)
        );
    };

    $voters = (int) one(
        "SELECT COUNT(DISTINCT detail) FROM stats_events WHERE event_type = 'vote' AND $evRange",
        $range
    );

    /* ---------- Suche ---------- */

    $termRow = fn ($r) => [
        'term' => $r['term'],
        'count' => (int) $r['n'],
        'visitors' => (int) $r['visitors'],
        'avg_results' => $r['avg_results'] !== null ? round((float) $r['avg_results'], 1) : null,
    ];
    $topTerms = array_map($termRow, rows(
        "SELECT term, COUNT(*) AS n, COUNT(DISTINCT visitor_id) AS visitors, AVG(result_count) AS avg_results
         FROM stats_events WHERE event_type = 'search' AND $evRange
         GROUP BY term ORDER BY n DESC, term LIMIT 30",
        $range
    ));
    $zeroTerms = array_map($termRow, rows(
        "SELECT term, COUNT(*) AS n, COUNT(DISTINCT visitor_id) AS visitors, 0 AS avg_results
         FROM stats_events WHERE event_type = 'search' AND result_count = 0 AND $evRange
         GROUP BY term ORDER BY n DESC, term LIMIT 30",
        $range
    ));
    $zeroSearches = (int) one(
        "SELECT COUNT(*) FROM stats_events WHERE event_type = 'search' AND result_count = 0 AND $evRange",
        $range
    );
    $uniqueTerms = (int) one(
        "SELECT COUNT(DISTINCT term) FROM stats_events WHERE event_type = 'search' AND $evRange",
        $range
    );

    /* ---------- Songs ---------- */

    $labelList = fn (string $sql) => array_map(fn ($r) => [
        'label' => $r['label'] ?? 'Unbekannt',
        'count' => (int) $r['n'],
    ], rows($sql, $range));

    $topSelected = $labelList(
        "SELECT MAX(song_label) AS label, COUNT(*) AS n FROM stats_events
         WHERE event_type = 'song_select' AND song_id IS NOT NULL AND $evRange
         GROUP BY song_id ORDER BY n DESC LIMIT 15"
    );
    $wantedTaken = $labelList(
        "SELECT MAX(song_label) AS label, COUNT(*) AS n FROM stats_events
         WHERE event_type = 'registration_rejected' AND detail = 'taken' AND $evRange
         GROUP BY song_id ORDER BY n DESC LIMIT 15"
    );
    $topVoted = $labelList(
        "SELECT MAX(song_label) AS label,
                SUM(event_type = 'vote') - SUM(event_type = 'vote_remove') AS n
         FROM stats_events
         WHERE event_type IN ('vote', 'vote_remove') AND queue_entry_id IS NOT NULL AND $evRange
         GROUP BY queue_entry_id HAVING n > 0 ORDER BY n DESC LIMIT 15"
    );

    // Netto-Stimmen pro Voter (vergeben minus zurückgenommen) als Verteilung.
    $votesPerVoter = [1 => 0, 2 => 0, 3 => 0];
    foreach (rows(
        "SELECT SUM(event_type = 'vote') - SUM(event_type = 'vote_remove') AS n
         FROM stats_events WHERE event_type IN ('vote', 'vote_remove') AND $evRange
         GROUP BY detail",
        $range
    ) as $r) {
        $n = min(3, (int) $r['n']);
        if ($n > 0) {
            $votesPerVoter[$n]++;
        }
    }

    $breakdown = function (string $expr, int $limit = 10) use ($range): array {
        return array_map(fn ($r) => ['label' => (string) $r['label'], 'count' => (int) $r['n']], rows(
            "SELECT $expr AS label, COUNT(*) AS n
             FROM stats_events e LEFT JOIN songs s ON s.id = e.song_id
             WHERE e.event_type = 'registration'
               AND e.created_at >= FROM_UNIXTIME(?) AND e.created_at < FROM_UNIXTIME(?)
             GROUP BY label ORDER BY n DESC, label LIMIT $limit",
            $range
        ));
    };
    $breakdowns = [
        'genre' => $breakdown("COALESCE(NULLIF(s.genre, ''), 'Unbekannt')"),
        'language' => $breakdown("COALESCE(NULLIF(s.language, ''), 'Unbekannt')"),
        'decade' => $breakdown("IF(s.year IS NULL OR s.year < 1900, 'Unbekannt', CONCAT(FLOOR(s.year / 10) * 10, 'er'))", 12),
        'artist' => $breakdown("COALESCE(s.artist, 'Unbekannt')"),
    ];

    /* ---------- Ablauf: Freigabe-, Warte- und Bühnenzeit ---------- */

    $entries = [];
    foreach (rows(
        "SELECT queue_entry_id AS id, event_type, detail, song_label, UNIX_TIMESTAMP(created_at) AS t
         FROM stats_events
         WHERE event_type IN ('registration', 'status', 'vote', 'vote_remove')
           AND queue_entry_id IN (
             SELECT queue_entry_id FROM stats_events WHERE event_type = 'registration' AND $evRange
           )
         ORDER BY created_at, id",
        $range
    ) as $r) {
        $id = (int) $r['id'];
        $e = &$entries[$id];
        $e ??= ['label' => null, 'reg' => null, 'approved' => null, 'playing' => null, 'completed' => null, 'last' => null, 'votes' => 0];
        $t = (int) $r['t'];
        $e['label'] ??= $r['song_label'];
        if ($r['event_type'] === 'registration') {
            $e['reg'] = $t;
        } elseif ($r['event_type'] === 'vote') {
            $e['votes']++;
        } elseif ($r['event_type'] === 'vote_remove') {
            $e['votes']--;
        } else {
            $status = $r['detail'];
            $e['last'] = $status;
            if ($status === 'approved' && $e['approved'] === null) {
                $e['approved'] = $t;
            } elseif ($status === 'playing' && $e['playing'] === null) {
                $e['playing'] = $t;
            } elseif ($status === 'completed' && $e['playing'] !== null && $e['completed'] === null) {
                $e['completed'] = $t;
            }
        }
        unset($e);
    }

    $approval = $wait = $stage = [];
    $setlist = [];
    $cancelled = 0;
    foreach ($entries as $e) {
        if ($e['reg'] === null) {
            continue;
        }
        if (in_array($e['last'], ['cancelled', 'deleted'], true)) {
            $cancelled++;
        }
        if ($e['approved'] !== null) {
            $approval[] = $e['approved'] - $e['reg'];
        }
        if ($e['playing'] !== null) {
            $wait[] = $e['playing'] - $e['reg'];
            $stageTime = $e['completed'] !== null ? $e['completed'] - $e['playing'] : null;
            if ($stageTime !== null) {
                $stage[] = $stageTime;
            }
            $setlist[] = [
                'label' => $e['label'],
                'played_at' => $e['playing'],
                'wait_s' => $e['playing'] - $e['reg'],
                'stage_s' => $stageTime,
                'votes' => max(0, $e['votes']),
            ];
        }
    }
    usort($setlist, fn ($a, $b) => $a['played_at'] <=> $b['played_at']);

    /* ---------- Geräte & Quellen ---------- */

    $deviceBreakdown = function (string $column) use ($range, $viRange): array {
        return array_map(fn ($r) => ['label' => (string) $r['label'], 'count' => (int) $r['n']], rows(
            "SELECT COALESCE($column, 'Unbekannt') AS label, COUNT(DISTINCT visitor_id) AS n
             FROM stats_visits WHERE page = 'guest' AND $viRange
             GROUP BY label ORDER BY n DESC, label",
            $range
        ));
    };
    $sources = array_map(fn ($r) => ['label' => (string) $r['label'], 'count' => (int) $r['n']], rows(
        "SELECT COALESCE(source, 'direkt') AS label, COUNT(*) AS n
         FROM stats_visits WHERE page = 'guest' AND $viRange
         GROUP BY label ORDER BY n DESC, label",
        $range
    ));

    /* ---------- Antwort ---------- */

    $registrations = $sum('registration');

    echo json_encode([
        'range' => ['from' => $from, 'to' => $to, 'bucket' => $bucket],
        'now' => $now,
        'online' => $online,
        'kpis' => [
            'visitors' => $guestVisitors,
            'new_visitors' => $newVisitors,
            'pageviews' => count($guestVisits),
            'session' => summary($durations),
            'searches' => $sum('search'),
            'unique_terms' => $uniqueTerms,
            'zero_searches' => $zeroSearches,
            'song_selects' => $sum('song_select'),
            'form_errors' => $sum('form_error'),
            'registrations' => $registrations,
            'duo' => $counts['registration']['duo'] ?? 0,
            'rejected' => [
                'taken' => $counts['registration_rejected']['taken'] ?? 0,
                'blocked' => $counts['registration_rejected']['blocked'] ?? 0,
                'locked' => $counts['registration_rejected']['locked'] ?? 0,
            ],
            'cancelled' => $cancelled,
            'performed' => count($setlist),
            'votes' => $sum('vote'),
            'vote_removes' => $sum('vote_remove'),
            'voters' => $voters,
            'choose_register' => $sum('choose_register'),
            'choose_vote' => $sum('choose_vote'),
        ],
        'pages' => $pages,
        'timeline' => [
            'starts' => $bucketStarts,
            'active' => array_values(array_map('count', $active)),
            'pageviews' => array_values($pageviewBuckets),
            'searches' => array_values($series['search']),
            'registrations' => array_values($series['registration']),
            'votes' => array_values($series['vote']),
        ],
        'funnel' => [
            ['label' => 'Besucher', 'count' => $guestVisitors],
            ['label' => 'Song gesucht', 'count' => $distinctVisitors('search')],
            ['label' => 'Song ausgewählt', 'count' => $distinctVisitors('song_select')],
            ['label' => 'Angemeldet', 'count' => $distinctVisitors('registration')],
        ],
        'vote_funnel' => [
            ['label' => 'Besucher', 'count' => $guestVisitors],
            ['label' => 'Voting geöffnet', 'count' => $distinctVisitors('choose_vote')],
            ['label' => 'Mind. 1 Stimme', 'count' => $distinctVisitors('vote')],
        ],
        'top_terms' => $topTerms,
        'zero_terms' => $zeroTerms,
        'top_selected' => $topSelected,
        'wanted_taken' => $wantedTaken,
        'top_voted' => $topVoted,
        'votes_per_voter' => $votesPerVoter,
        'breakdowns' => $breakdowns,
        'timing' => [
            'approval' => summary($approval),
            'wait' => summary($wait),
            'stage' => summary($stage),
        ],
        'setlist' => $setlist,
        'devices' => [
            'device' => $deviceBreakdown('device'),
            'os' => $deviceBreakdown('os'),
            'browser' => $deviceBreakdown('browser'),
        ],
        'sources' => $sources,
    ]);
} catch (Throwable $e) {
    http_response_code(500);
    echo json_encode(['error' => 'Statistik konnte nicht geladen werden - ist die Migration (database.sql) gelaufen?']);
}
