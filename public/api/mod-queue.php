<?php
require __DIR__ . '/../lib/db.php';
header('Content-Type: application/json');
requireModerator();

try {
    $pdo = db();

    $fields = 'q.id, q.position, s.title, s.artist, s.duo,
               q.first_name, q.last_name, q.duet_first_name, q.duet_last_name,
               q.comment, q.status';

    $current = $pdo->query(
        "SELECT $fields FROM queue_entries q
         JOIN songs s ON q.song_id = s.id
         WHERE q.status = 'playing'
         ORDER BY q.position ASC LIMIT 1"
    )->fetch();

    // Bewusst ohne LIMIT - die Moderation ist eine normale, scrollbare Seite
    // (kein fixer Display-Screen), da sollen alle genehmigten Songs
    // erscheinen statt nur die ersten 10.
    $next = $pdo->query(
        "SELECT $fields FROM queue_entries q
         JOIN songs s ON q.song_id = s.id
         WHERE q.status = 'approved'
         ORDER BY q.position ASC"
    )->fetchAll();

    echo json_encode([
        'current' => $current ?: null,
        'next' => $next,
    ]);
} catch (Throwable $e) {
    http_response_code(500);
    echo json_encode(['error' => 'Fehler beim Abrufen der Queue']);
}
