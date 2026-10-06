<?php
require __DIR__ . '/../lib/db.php';
header('Content-Type: application/json');
requireApiKey();

function formatControlEntry(array $entry): array
{
    $singer = $entry['duet_first_name']
        ? "{$entry['first_name']} {$entry['last_name']} & {$entry['duet_first_name']} {$entry['duet_last_name']}"
        : "{$entry['first_name']} {$entry['last_name']}";

    return [
        'id' => (int) $entry['id'],
        'title' => $entry['title'],
        'artist' => $entry['artist'],
        'singer' => $singer,
        'votes' => (int) $entry['votes'],
    ];
}

try {
    $stmt = db()->query(
        "SELECT q.id, q.status, s.title, s.artist,
                q.first_name, q.last_name, q.duet_first_name, q.duet_last_name,
                (SELECT COUNT(*) FROM votes v WHERE v.queue_entry_id = q.id) AS votes
         FROM queue_entries q
         JOIN songs s ON q.song_id = s.id
         WHERE q.status IN ('approved', 'playing')
         ORDER BY q.position ASC"
    );
    $queue = $stmt->fetchAll();

    // Erster "playing"/erster "approved" in Positions-Reihenfolge - dasselbe
    // Muster wie renderQueueActions() in admin.js (topmost approved = als
    // Nächstes dran).
    $playing = null;
    $next = null;
    foreach ($queue as $entry) {
        if ($entry['status'] === 'playing' && $playing === null) {
            $playing = $entry;
        } elseif ($entry['status'] === 'approved' && $next === null) {
            $next = $entry;
        }
    }

    $settings = getSettings(['banner_mode', 'registration_locked', 'voting_locked', 'announcement']);

    echo json_encode([
        'playing' => $playing ? formatControlEntry($playing) : null,
        'next' => $next ? formatControlEntry($next) : null,
        'queue_length' => count($queue),
        'banner_mode' => ($settings['banner_mode'] ?? '0') === '1',
        'registration_locked' => ($settings['registration_locked'] ?? '0') === '1',
        'voting_locked' => ($settings['voting_locked'] ?? '0') === '1',
        'announcement' => $settings['announcement'] ?? '',
    ]);
} catch (Throwable $e) {
    http_response_code(500);
    echo json_encode(['error' => 'Fehler beim Abrufen des Status']);
}
