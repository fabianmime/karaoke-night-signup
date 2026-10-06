<?php
require __DIR__ . '/../lib/db.php';
header('Content-Type: application/json');
startSession();

echo json_encode(['loggedIn' => !empty($_SESSION['admin'])]);
