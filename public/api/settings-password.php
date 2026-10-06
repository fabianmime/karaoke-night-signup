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
$currentPassword = (string) ($input['current_password'] ?? '');
$newPassword = (string) ($input['new_password'] ?? '');

if (!verifyAdminPassword($currentPassword)) {
    http_response_code(401);
    echo json_encode(['error' => 'Aktuelles Passwort ist falsch']);
    return;
}

if (strlen($newPassword) < 4) {
    http_response_code(400);
    echo json_encode(['error' => 'Neues Passwort ist zu kurz']);
    return;
}

try {
    setSetting('admin_password_hash', password_hash($newPassword, PASSWORD_DEFAULT));
    echo json_encode(['success' => true, 'message' => 'Passwort geändert']);
} catch (Throwable $e) {
    http_response_code(500);
    echo json_encode(['error' => 'Fehler beim Ändern']);
}
