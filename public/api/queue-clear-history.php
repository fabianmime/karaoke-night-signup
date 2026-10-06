<?php
require __DIR__ . '/../lib/db.php';
header('Content-Type: application/json');
requireAdmin();

if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
    http_response_code(405);
    echo json_encode(['error' => 'Methode nicht erlaubt']);
    return;
}

try {
    $count = (int) db()->query(
        "SELECT COUNT(*) FROM queue_entries WHERE status IN ('completed', 'cancelled')"
    )->fetchColumn();

    db()->exec("DELETE FROM queue_entries WHERE status IN ('completed', 'cancelled')");

    echo json_encode(['success' => true, 'deleted' => $count]);
} catch (Throwable $e) {
    http_response_code(500);
    echo json_encode(['error' => 'Fehler beim Löschen des Verlaufs']);
}
