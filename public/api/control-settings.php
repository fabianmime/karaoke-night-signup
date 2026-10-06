<?php
require __DIR__ . '/../lib/db.php';
header('Content-Type: application/json');
requireApiKey();

if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
    http_response_code(405);
    echo json_encode(['error' => 'Methode nicht erlaubt']);
    return;
}

// Bewusst nur die vier für die Show-Steuerung relevanten Keys - footer_html
// und show_votes_on_display bleiben absichtlich Admin-Browser-only, dafür
// gibt es keinen Companion-Anwendungsfall.
$input = jsonInput();

try {
    if (array_key_exists('banner_mode', $input)) {
        setSetting('banner_mode', $input['banner_mode'] ? '1' : '0');
    }
    if (array_key_exists('registration_locked', $input)) {
        setSetting('registration_locked', $input['registration_locked'] ? '1' : '0');
    }
    if (array_key_exists('voting_locked', $input)) {
        setSetting('voting_locked', $input['voting_locked'] ? '1' : '0');
    }
    if (array_key_exists('announcement', $input)) {
        setSetting('announcement', trim((string) $input['announcement']));
    }

    echo json_encode(['success' => true]);
} catch (Throwable $e) {
    http_response_code(500);
    echo json_encode(['error' => 'Fehler beim Speichern']);
}
