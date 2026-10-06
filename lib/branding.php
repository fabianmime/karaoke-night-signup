<?php

/**
 * Branding (Logo, Banner, Event-Name) ist komplett über die Settings
 * steuerbar - die App selbst enthält kein fixes Veranstalter-Logo mehr.
 * Hochgeladene Bilder liegen als Dateien im Ordner uploads/ (im Repo
 * public/uploads/, live direkt im Webroot), der Settings-Wert hält nur die
 * öffentliche URL. Kein Upload gesetzt -> neutrales Default-Logo bzw. ein
 * per HTML zusammengesetzter Banner auf dem Display.
 */

const BRANDING_TYPES = [
    // Setting-Key, maximale Dateigrösse
    'logo' => ['key' => 'brand_logo_url', 'max_bytes' => 5 * 1024 * 1024],
    'banner' => ['key' => 'brand_banner_url', 'max_bytes' => 10 * 1024 * 1024],
];

/**
 * Bewusst kein SVG: ein SVG kann Skript enthalten und würde von derselben
 * Origin wie das Admin-Panel ausgeliefert. Die Dateiendung wird immer aus
 * dem tatsächlich erkannten Bildtyp abgeleitet, nie aus dem Upload-Namen.
 */
const BRANDING_MIME_EXTENSIONS = [
    'image/png' => 'png',
    'image/jpeg' => 'jpg',
    'image/webp' => 'webp',
    'image/gif' => 'gif',
];

const DEFAULT_LOGO_URL = '/img/default-logo.svg';

// Schutz vor "Pixel-Bomben": eine kleine, stark komprimierte Datei mit
// riesigen Abmessungen würde sonst auf jedem Gäste-Handy den Speicher
// sprengen, das das Logo anzeigt.
const BRANDING_MAX_DIMENSION = 8000;
const BRANDING_MAX_PIXELS = 40000000;

/**
 * Zusätzlicher CSRF-Schutz für die Upload-Endpoints: SameSite=Lax deckt
 * Cross-Site-Requests ab, aber nicht Requests von einer anderen Subdomain
 * derselben Site. Schickt der Browser einen Origin-Header mit, muss er zum
 * eigenen Host passen (fehlt er, z.B. bei alten Browsern, wird nicht
 * blockiert - die Admin-Session bleibt dann die Hürde).
 */
function requireSameOrigin(): void
{
    $origin = $_SERVER['HTTP_ORIGIN'] ?? '';
    if ($origin === '') {
        return;
    }
    $originHost = parse_url($origin, PHP_URL_HOST);
    $ownHost = preg_replace('/:\d+$/', '', (string) ($_SERVER['HTTP_HOST'] ?? ''));
    if (!is_string($originHost) || strcasecmp($originHost, $ownHost) !== 0) {
        http_response_code(403);
        header('Content-Type: application/json');
        echo json_encode(['error' => 'Ungültige Herkunft der Anfrage']);
        exit;
    }
}

/**
 * Deployt wird flach (Inhalt von public/ direkt im Webroot, lib/ daneben -
 * siehe README "Projektstruktur & Deployment"), uploads/ liegt also im
 * Webroot neben lib/. Im Repo entspricht das public/uploads/.
 */
function resolveBrandingUploadDir(): string
{
    return dirname(__DIR__) . '/uploads';
}

function brandingFilePathFromUrl(string $url): ?string
{
    // Nur eigene, vom Server generierte Dateinamen anfassen - nie einen
    // beliebigen Pfad aus der DB löschen.
    if (!preg_match('#^/uploads/((?:logo|banner)-[a-f0-9]{16}\.(?:png|jpg|webp|gif))$#', $url, $m)) {
        return null;
    }
    return resolveBrandingUploadDir() . '/' . $m[1];
}

function deleteBrandingFile(string $url): void
{
    $path = brandingFilePathFromUrl($url);
    if ($path !== null && is_file($path)) {
        @unlink($path);
    }
}
