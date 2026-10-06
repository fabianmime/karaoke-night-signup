<?php
require __DIR__ . '/../lib/db.php';
header('Content-Type: application/json');
startSession();
checkLoginRateLimit('admin_login_state');

$input = jsonInput();
$password = (string) ($input['password'] ?? '');

if ($password !== '' && verifyAdminPassword($password)) {
    clearLoginFailures('admin_login_state');
    $_SESSION['admin'] = true;
    echo json_encode(['success' => true, 'message' => 'Login erfolgreich']);
    return;
}

registerLoginFailure('admin_login_state');
http_response_code(401);
echo json_encode(['success' => false, 'message' => 'Falsches Passwort']);
