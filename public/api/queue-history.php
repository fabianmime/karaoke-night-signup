<?php
require __DIR__ . '/../lib/db.php';
header('Content-Type: application/json');
requireAdmin();

try {
    $stmt = db()->query(
        "SELECT q.id, s.title, s.artist, s.duo,
                q.first_name, q.last_name, q.duet_first_name, q.duet_last_name,
                q.phone, q.email, q.comment, q.status, q.created_at
         FROM queue_entries q
         JOIN songs s ON q.song_id = s.id
         WHERE q.status IN ('completed', 'cancelled')
         ORDER BY q.created_at DESC"
    );

    echo json_encode($stmt->fetchAll());
} catch (Throwable $e) {
    http_response_code(500);
    echo json_encode(['error' => 'Fehler beim Abrufen des Verlaufs']);
}
