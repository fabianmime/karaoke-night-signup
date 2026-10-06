<?php
// Setzt die komplette Statistik zurück (z.B. nach dem Testen, vor dem
// Event) - verlangt zur Sicherheit das Statistik-Passwort erneut.
require __DIR__ . '/../lib/db.php';
require_once __DIR__ . '/../lib/stats.php';
header('Content-Type: application/json');
requireStats();

if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
    http_response_code(405);
    echo json_encode(['error' => 'Methode nicht erlaubt']);
    return;
}

$input = jsonInput();
if (!verifyStatsPassword((string) ($input['password'] ?? ''))) {
    http_response_code(401);
    echo json_encode(['error' => 'Passwort ist falsch']);
    return;
}

try {
    $events = db()->exec('DELETE FROM stats_events');
    $visits = db()->exec('DELETE FROM stats_visits');
    echo json_encode(['success' => true, 'deleted_events' => $events, 'deleted_visits' => $visits]);
} catch (Throwable $e) {
    http_response_code(500);
    echo json_encode(['error' => 'Fehler beim Zurücksetzen']);
}
