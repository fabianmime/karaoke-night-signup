<?php
require __DIR__ . '/../lib/db.php';
header('Content-Type: application/json');
startSession();
checkLoginRateLimit('mod_login_state');

$input = jsonInput();
$password = (string) ($input['password'] ?? '');

if ($password !== '' && verifyModeratorPassword($password)) {
    clearLoginFailures('mod_login_state');
    $_SESSION['moderator'] = true;
    echo json_encode(['success' => true, 'message' => 'Login erfolgreich']);
    return;
}

registerLoginFailure('mod_login_state');
http_response_code(401);
echo json_encode(['success' => false, 'message' => 'Falsches Passwort']);
