<?php
require __DIR__ . '/../lib/db.php';
header('Content-Type: application/json');
startSession();

unset($_SESSION['stats']);
echo json_encode(['success' => true]);
