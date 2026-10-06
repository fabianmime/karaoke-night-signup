<?php
require __DIR__ . '/../lib/db.php';
require __DIR__ . '/../lib/branding.php';
header('Content-Type: application/json');

// Bewusst ohne requireAdmin() - Gäste-Seite und Display brauchen Sperrstatus
// und Mitteilungstext, aber nichts Sensibles wird hier ausgegeben.
//
// Eine einzige getSettings()-Query statt Einzel-getSetting()-Aufrufen:
// dieser Endpoint wird von jedem Gäste-Handy alle 4s gepollt (guest.js).
$rows = getSettings([
    'registration_locked', 'voting_locked', 'announcement',
    'banner_mode', 'footer_html', 'show_votes_on_display',
    'brand_logo_url', 'brand_banner_url', 'event_name', 'event_subtitle',
]);

$logoUrl = $rows['brand_logo_url'] ?? '';

echo json_encode([
    'registration_locked' => ($rows['registration_locked'] ?? '0') === '1',
    'voting_locked' => ($rows['voting_locked'] ?? '0') === '1',
    'announcement' => $rows['announcement'] ?? '',
    'banner_mode' => ($rows['banner_mode'] ?? '0') === '1',
    'footer_html' => $rows['footer_html'] ?? defaultFooterHtml(),
    'show_votes_on_display' => ($rows['show_votes_on_display'] ?? '0') === '1',
    'logo_url' => $logoUrl !== '' ? $logoUrl : DEFAULT_LOGO_URL,
    'banner_url' => $rows['brand_banner_url'] ?? '',
    'event_name' => $rows['event_name'] ?? '',
    'event_subtitle' => $rows['event_subtitle'] ?? '',
]);
