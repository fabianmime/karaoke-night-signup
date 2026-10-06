<?php
require __DIR__ . '/../lib/db.php';
header('Content-Type: application/json');
startSession();

unset($_SESSION['moderator']);
echo json_encode(['success' => true]);
