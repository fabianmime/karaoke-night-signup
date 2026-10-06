<?php
// Statistik-Passwort ändern - nur aus der Statistik-Ansicht selbst (nicht
// übers Admin-Panel), aktuelles Passwort muss mitgeschickt werden.
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
$current = (string) ($input['current_password'] ?? '');
$newPassword = (string) ($input['new_password'] ?? '');

if (!verifyStatsPassword($current)) {
    http_response_code(401);
    echo json_encode(['error' => 'Aktuelles Passwort ist falsch']);
    return;
}

if (strlen($newPassword) < 8) {
    http_response_code(400);
    echo json_encode(['error' => 'Neues Passwort muss mindestens 8 Zeichen haben']);
    return;
}

try {
    setSetting('stats_password_hash', password_hash($newPassword, PASSWORD_DEFAULT));
    echo json_encode(['success' => true, 'message' => 'Statistik-Passwort geändert']);
} catch (Throwable $e) {
    http_response_code(500);
    echo json_encode(['error' => 'Fehler beim Speichern']);
}
