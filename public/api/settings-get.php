<?php
require __DIR__ . '/../lib/db.php';
header('Content-Type: application/json');
requireAdmin();

echo json_encode([
    'registration_locked' => getSetting('registration_locked', '0') === '1',
    'voting_locked' => getSetting('voting_locked', '0') === '1',
    'announcement' => getSetting('announcement', ''),
    'banner_mode' => getSetting('banner_mode', '0') === '1',
    'footer_html' => getSetting('footer_html', defaultFooterHtml()),
    'show_votes_on_display' => getSetting('show_votes_on_display', '0') === '1',
    'moderation_password_set' => getSetting('moderation_password_hash') !== null,
    'control_api_key' => getSetting('control_api_key', ''),
    'brand_logo_url' => getSetting('brand_logo_url', ''),
    'brand_banner_url' => getSetting('brand_banner_url', ''),
    'event_name' => getSetting('event_name', ''),
    'event_subtitle' => getSetting('event_subtitle', ''),
]);
