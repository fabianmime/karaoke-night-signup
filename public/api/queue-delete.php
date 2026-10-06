<?php
require __DIR__ . '/../lib/db.php';
require_once __DIR__ . '/../lib/stats.php';
header('Content-Type: application/json');
requireAdmin();

if ($_SERVER['REQUEST_METHOD'] !== 'DELETE') {
    http_response_code(405);
    echo json_encode(['error' => 'Methode nicht erlaubt']);
    return;
}

$id = (int) ($_GET['id'] ?? 0);

try {
    // Nur aktive Einträge zählen in der Statistik als "gelöscht" - wer bloss
    // den Verlauf (fertig/storniert) aufräumt, soll dort nichts verändern.
    $statusStmt = db()->prepare('SELECT status FROM queue_entries WHERE id = ?');
    $statusStmt->execute([$id]);
    $wasActive = in_array($statusStmt->fetchColumn(), ['pending', 'approved', 'playing'], true);
    if ($wasActive) {
        logStatusChange($id, 'deleted');
    }

    $stmt = db()->prepare('DELETE FROM queue_entries WHERE id = ?');
    $stmt->execute([$id]);

    if ($stmt->rowCount() === 0) {
        http_response_code(404);
        echo json_encode(['error' => 'Eintrag nicht gefunden']);
        return;
    }

    echo json_encode(['success' => true, 'message' => 'Eintrag gelöscht']);
} catch (Throwable $e) {
    http_response_code(500);
    echo json_encode(['error' => 'Fehler beim Löschen']);
}
