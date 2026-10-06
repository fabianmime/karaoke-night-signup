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
$order = $input['order'] ?? null;

if (!is_array($order) || !$order) {
    http_response_code(400);
    echo json_encode(['error' => 'Ungültige Reihenfolge']);
    return;
}

$pdo = db();

try {
    $pdo->beginTransaction();

    // Alle aktuell aktiven IDs in ihrer bisherigen Reihenfolge holen (FOR
    // UPDATE sperrt sie gegen gleichzeitige Änderungen): falls der
    // Admin-Bildschirm beim Ziehen schon ein paar Sekunden alt war und
    // zwischenzeitlich eine neue Anmeldung dazukam, bleibt die erhalten
    // und wird hinten angehängt statt eine doppelte Position zu bekommen.
    $activeIds = array_map('intval', $pdo->query(
        "SELECT id FROM queue_entries WHERE status IN ('pending', 'approved', 'playing') ORDER BY position ASC FOR UPDATE"
    )->fetchAll(PDO::FETCH_COLUMN));

    $orderedIds = array_values(array_unique(array_map('intval', $order)));
    $orderedSet = array_flip($orderedIds);
    $missing = array_values(array_filter($activeIds, fn ($id) => !isset($orderedSet[$id])));
    $finalOrder = array_merge($orderedIds, $missing);

    $stmt = $pdo->prepare('UPDATE queue_entries SET position = ? WHERE id = ?');
    $position = 1;
    foreach ($finalOrder as $id) {
        $stmt->execute([$position, $id]);
        $position++;
    }

    $pdo->commit();
    echo json_encode(['success' => true]);
} catch (Throwable $e) {
    if ($pdo->inTransaction()) {
        $pdo->rollBack();
    }
    http_response_code(500);
    echo json_encode(['error' => 'Fehler beim Umsortieren']);
}
