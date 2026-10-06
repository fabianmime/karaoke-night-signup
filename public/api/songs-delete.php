<?php
require __DIR__ . '/../lib/db.php';
header('Content-Type: application/json');
requireAdmin();

if ($_SERVER['REQUEST_METHOD'] !== 'DELETE') {
    http_response_code(405);
    echo json_encode(['error' => 'Methode nicht erlaubt']);
    return;
}

$id = (int) ($_GET['id'] ?? 0);

try {
    $stmt = db()->prepare('DELETE FROM songs WHERE id = ?');
    $stmt->execute([$id]);

    if ($stmt->rowCount() === 0) {
        http_response_code(404);
        echo json_encode(['error' => 'Song nicht gefunden']);
        return;
    }

    echo json_encode(['success' => true, 'message' => 'Song gelöscht']);
} catch (Throwable $e) {
    http_response_code(500);
    echo json_encode(['error' => 'Fehler beim Löschen']);
}
