<?php
require __DIR__ . '/../lib/db.php';
header('Content-Type: application/json');
requireAdmin();

if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
    http_response_code(405);
    echo json_encode(['error' => 'Methode nicht erlaubt']);
    return;
}

$input = jsonInput();

try {
    if (array_key_exists('registration_locked', $input)) {
        setSetting('registration_locked', $input['registration_locked'] ? '1' : '0');
    }
    if (array_key_exists('voting_locked', $input)) {
        setSetting('voting_locked', $input['voting_locked'] ? '1' : '0');
    }
    if (array_key_exists('announcement', $input)) {
        setSetting('announcement', trim((string) $input['announcement']));
    }
    if (array_key_exists('banner_mode', $input)) {
        setSetting('banner_mode', $input['banner_mode'] ? '1' : '0');
    }
    if (array_key_exists('footer_html', $input)) {
        setSetting('footer_html', trim((string) $input['footer_html']));
    }
    if (array_key_exists('show_votes_on_display', $input)) {
        setSetting('show_votes_on_display', $input['show_votes_on_display'] ? '1' : '0');
    }
    // Branding-Texte werden auf den Seiten per textContent gesetzt (kein
    // HTML), Länge trotzdem begrenzen, damit das Layout nicht gesprengt wird.
    if (array_key_exists('event_name', $input)) {
        setSetting('event_name', mb_substr(trim((string) $input['event_name']), 0, 60));
    }
    if (array_key_exists('event_subtitle', $input)) {
        setSetting('event_subtitle', mb_substr(trim((string) $input['event_subtitle']), 0, 100));
    }

    echo json_encode(['success' => true]);
} catch (Throwable $e) {
    http_response_code(500);
    echo json_encode(['error' => 'Fehler beim Speichern']);
}
