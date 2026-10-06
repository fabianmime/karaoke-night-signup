<?php
require __DIR__ . '/../lib/db.php';
require_once __DIR__ . '/../lib/stats.php';
header('Content-Type: application/json');
startSession();
checkLoginRateLimit('stats_login_state');

$input = jsonInput();
$password = (string) ($input['password'] ?? '');

if ($password !== '' && verifyStatsPassword($password)) {
    clearLoginFailures('stats_login_state');
    $_SESSION['stats'] = true;
    echo json_encode(['success' => true, 'message' => 'Login erfolgreich']);
    return;
}

registerLoginFailure('stats_login_state');
http_response_code(401);
echo json_encode(['success' => false, 'message' => 'Falsches Passwort']);
