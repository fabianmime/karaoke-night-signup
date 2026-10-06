<?php
require __DIR__ . '/../lib/db.php';
require_once __DIR__ . '/../lib/stats.php';
header('Content-Type: application/json');
requireAdmin();

if ($_SERVER['REQUEST_METHOD'] !== 'PATCH') {
    http_response_code(405);
    echo json_encode(['error' => 'Methode nicht erlaubt']);
    return;
}

$id = (int) ($_GET['id'] ?? 0);
$input = jsonInput();
$status = (string) ($input['status'] ?? '');

$validStatuses = ['pending', 'approved', 'playing', 'completed', 'cancelled'];
if (!in_array($status, $validStatuses, true)) {
    http_response_code(400);
    echo json_encode(['error' => 'Ungültiger Status']);
    return;
}

try {
    $stmt = db()->prepare('UPDATE queue_entries SET status = ? WHERE id = ?');
    $stmt->execute([$status, $id]);

    if ($stmt->rowCount() === 0) {
        http_response_code(404);
        echo json_encode(['error' => 'Eintrag nicht gefunden']);
        return;
    }

    logStatusChange($id, $status);

    echo json_encode(['success' => true, 'message' => 'Status aktualisiert']);
} catch (Throwable $e) {
    http_response_code(500);
    echo json_encode(['error' => 'Fehler beim Aktualisieren']);
}
