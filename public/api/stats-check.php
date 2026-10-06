<?php
require __DIR__ . '/../lib/db.php';
header('Content-Type: application/json');
startSession();

// Bewusst nur die eigene Statistik-Rolle - eine Admin-Session zählt hier nicht.
echo json_encode(['loggedIn' => !empty($_SESSION['stats'])]);
