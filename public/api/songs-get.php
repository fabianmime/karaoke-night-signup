<?php
require __DIR__ . '/../lib/db.php';
header('Content-Type: application/json');

$id = (int) ($_GET['id'] ?? 0);

try {
    $stmt = db()->prepare('SELECT * FROM songs WHERE id = ?');
    $stmt->execute([$id]);
    $song = $stmt->fetch();

    if (!$song) {
        http_response_code(404);
        echo json_encode(['error' => 'Song nicht gefunden']);
        return;
    }

    echo json_encode($song);
} catch (Throwable $e) {
    http_response_code(500);
    echo json_encode(['error' => 'Fehler beim Abrufen des Songs']);
}
