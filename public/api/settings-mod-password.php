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
$newPassword = (string) ($input['new_password'] ?? '');

if (strlen($newPassword) < 4) {
    http_response_code(400);
    echo json_encode(['error' => 'Passwort ist zu kurz']);
    return;
}

try {
    setSetting('moderation_password_hash', password_hash($newPassword, PASSWORD_DEFAULT));
    echo json_encode(['success' => true, 'message' => 'Moderations-Passwort gesetzt']);
} catch (Throwable $e) {
    http_response_code(500);
    echo json_encode(['error' => 'Fehler beim Speichern']);
}
