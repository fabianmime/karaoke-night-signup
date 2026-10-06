<?php
require __DIR__ . '/../lib/db.php';
header('Content-Type: application/json');
requireAdmin();

if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
    http_response_code(405);
    echo json_encode(['error' => 'Methode nicht erlaubt']);
    return;
}

$input = jsonInput();
$songId = (int) ($input['song_id'] ?? 0);
$filterStatus = (string) ($input['filter_status'] ?? '');
$filterReason = trim((string) ($input['filter_reason'] ?? ''));

$validStatuses = ['none', 'review', 'blocked'];
if ($songId <= 0 || !in_array($filterStatus, $validStatuses, true)) {
    http_response_code(400);
    echo json_encode(['error' => 'Ungültige Eingabe']);
    return;
}

// "Keine Sperre" räumt den Grund gleich mit auf - sonst bliebe ein alter
// Freitext-Grund an einem eigentlich wieder freigegebenen Song kleben.
if ($filterStatus === 'none') {
    $filterReason = '';
}

try {
    $stmt = db()->prepare(
        'UPDATE songs SET filter_status = ?, filter_reason = ? WHERE id = ?'
    );
    $stmt->execute([$filterStatus, $filterReason !== '' ? $filterReason : null, $songId]);

    $checkStmt = db()->prepare('SELECT id FROM songs WHERE id = ?');
    $checkStmt->execute([$songId]);
    if (!$checkStmt->fetch()) {
        http_response_code(404);
        echo json_encode(['error' => 'Song nicht gefunden']);
        return;
    }

    echo json_encode(['success' => true]);
} catch (Throwable $e) {
    http_response_code(500);
    echo json_encode(['error' => 'Fehler beim Speichern']);
}
