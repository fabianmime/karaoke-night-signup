<?php
require __DIR__ . '/../lib/db.php';
header('Content-Type: application/json');
startSession();

$_SESSION = [];
session_destroy();

echo json_encode(['success' => true]);
