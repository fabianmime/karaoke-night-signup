<?php
require __DIR__ . '/../lib/db.php';
require __DIR__ . '/../lib/branding.php';
header('Content-Type: application/json');
requireAdmin();
requireSameOrigin();

if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
    http_response_code(405);
    echo json_encode(['error' => 'Methode nicht erlaubt']);
    return;
}

$input = jsonInput();
$type = (string) ($input['type'] ?? '');
if (!isset(BRANDING_TYPES[$type])) {
    http_response_code(400);
    echo json_encode(['error' => 'Unbekannter Bildtyp']);
    return;
}
$key = BRANDING_TYPES[$type]['key'];

try {
    $previous = getSetting($key, '');
    setSetting($key, '');
    if ($previous !== '') {
        deleteBrandingFile($previous);
    }
    echo json_encode(['success' => true]);
} catch (Throwable $e) {
    http_response_code(500);
    echo json_encode(['error' => 'Fehler beim Zurücksetzen']);
}
