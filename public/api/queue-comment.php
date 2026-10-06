<?php
require __DIR__ . '/../lib/db.php';
header('Content-Type: application/json');
// Moderation darf die Notizen ebenfalls selbst pflegen (Ansager/in ergänzt
// z.B. Aussprache oder Hinweise vor Ort) - requireModerator() akzeptiert
// auch eine Admin-Session, das Admin-Panel funktioniert also unverändert.
requireModerator();

if ($_SERVER['REQUEST_METHOD'] !== 'PATCH') {
    http_response_code(405);
    echo json_encode(['error' => 'Methode nicht erlaubt']);
    return;
}

$id = (int) ($_GET['id'] ?? 0);
$input = jsonInput();
$comment = trim((string) ($input['comment'] ?? ''));

try {
    $pdo = db();

    $checkStmt = $pdo->prepare('SELECT id FROM queue_entries WHERE id = ?');
    $checkStmt->execute([$id]);
    if (!$checkStmt->fetch()) {
        http_response_code(404);
        echo json_encode(['error' => 'Eintrag nicht gefunden']);
        return;
    }

    $stmt = $pdo->prepare('UPDATE queue_entries SET comment = ? WHERE id = ?');
    $stmt->execute([$comment !== '' ? $comment : null, $id]);

    echo json_encode(['success' => true]);
} catch (Throwable $e) {
    http_response_code(500);
    echo json_encode(['error' => 'Fehler beim Speichern']);
}
