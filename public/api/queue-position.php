<?php
require __DIR__ . '/../lib/db.php';
header('Content-Type: application/json');
requireAdmin();

if ($_SERVER['REQUEST_METHOD'] !== 'PATCH') {
    http_response_code(405);
    echo json_encode(['error' => 'Methode nicht erlaubt']);
    return;
}

$id = (int) ($_GET['id'] ?? 0);
$input = jsonInput();
$newPosition = $input['new_position'] ?? null;

if (!is_numeric($newPosition)) {
    http_response_code(400);
    echo json_encode(['error' => 'Ungültige Position']);
    return;
}

try {
    $stmt = db()->prepare('UPDATE queue_entries SET position = ? WHERE id = ?');
    $stmt->execute([(int) $newPosition, $id]);

    if ($stmt->rowCount() === 0) {
        http_response_code(404);
        echo json_encode(['error' => 'Eintrag nicht gefunden']);
        return;
    }

    echo json_encode(['success' => true, 'message' => 'Position aktualisiert']);
} catch (Throwable $e) {
    http_response_code(500);
    echo json_encode(['error' => 'Fehler beim Aktualisieren']);
}
