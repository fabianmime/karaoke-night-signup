<?php
require __DIR__ . '/../lib/db.php';
require_once __DIR__ . '/../lib/stats.php';
header('Content-Type: application/json');
requireAdmin();

if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
    http_response_code(405);
    echo json_encode(['error' => 'Methode nicht erlaubt']);
    return;
}

$input = jsonInput();
$id = (int) ($input['id'] ?? 0);

$pdo = db();

try {
    $pdo->beginTransaction();

    $check = $pdo->prepare("SELECT status FROM queue_entries WHERE id = ? FOR UPDATE");
    $check->execute([$id]);
    $entry = $check->fetch();

    if (!$entry) {
        $pdo->rollBack();
        http_response_code(404);
        echo json_encode(['error' => 'Eintrag nicht gefunden']);
        return;
    }

    if (!in_array($entry['status'], ['completed', 'cancelled'], true)) {
        $pdo->rollBack();
        http_response_code(400);
        echo json_encode(['error' => 'Eintrag ist nicht im Verlauf']);
        return;
    }

    // Nur die Zeile mit der aktuell höchsten Position sperren statt aller
    // aktiven Zeilen (gleicher Grund wie in queue-add.php).
    $maxPosition = (int) $pdo->query(
        "SELECT position FROM queue_entries WHERE status IN ('pending', 'approved', 'playing') ORDER BY position DESC LIMIT 1 FOR UPDATE"
    )->fetchColumn();
    $nextPosition = $maxPosition + 1;

    $stmt = $pdo->prepare("UPDATE queue_entries SET status = 'pending', position = ? WHERE id = ?");
    $stmt->execute([$nextPosition, $id]);

    $pdo->commit();
    logStatusChange($id, 'pending');
    echo json_encode(['success' => true, 'position' => $nextPosition]);
} catch (Throwable $e) {
    if ($pdo->inTransaction()) {
        $pdo->rollBack();
    }
    http_response_code(500);
    echo json_encode(['error' => 'Fehler beim Wiederherstellen']);
}
