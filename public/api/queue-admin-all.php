<?php
require __DIR__ . '/../lib/db.php';
header('Content-Type: application/json');
requireAdmin();

try {
    $stmt = db()->query(
        "SELECT q.id, q.position, s.title, s.artist, s.duo,
                s.filter_status, s.filter_reason,
                q.first_name, q.last_name, q.duet_first_name, q.duet_last_name,
                q.phone, q.email, q.comment, q.status, q.created_at,
                (SELECT COUNT(*) FROM votes v WHERE v.queue_entry_id = q.id) AS votes
         FROM queue_entries q
         JOIN songs s ON q.song_id = s.id
         WHERE q.status IN ('pending', 'approved', 'playing')
         ORDER BY q.position ASC"
    );

    echo json_encode($stmt->fetchAll());
} catch (Throwable $e) {
    http_response_code(500);
    echo json_encode(['error' => 'Fehler beim Abrufen der Queue']);
}
