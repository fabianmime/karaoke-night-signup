<?php
require __DIR__ . '/../lib/db.php';
header('Content-Type: application/json');
requireAdmin();

if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
    http_response_code(405);
    echo json_encode(['error' => 'Methode nicht erlaubt']);
    return;
}

try {
    // 20 Bytes -> 40 Hex-Zeichen, wie ein bin2hex(random_bytes(...))-Token an
    // anderer Stelle im Projekt (z.B. voter_token) - reines Zufalls-Secret,
    // kein von Menschen getipptes Passwort, deshalb kein bcrypt-Hash nötig
    // (siehe requireApiKey() in lib/db.php).
    $key = bin2hex(random_bytes(20));
    setSetting('control_api_key', $key);
    echo json_encode(['success' => true, 'api_key' => $key]);
} catch (Throwable $e) {
    http_response_code(500);
    echo json_encode(['error' => 'Fehler beim Erzeugen des Schlüssels']);
}
