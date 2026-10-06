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

$type = (string) ($_POST['type'] ?? '');
if (!isset(BRANDING_TYPES[$type])) {
    http_response_code(400);
    echo json_encode(['error' => 'Unbekannter Bildtyp']);
    return;
}
$spec = BRANDING_TYPES[$type];

$file = $_FILES['image'] ?? null;
if (!$file || !is_array($file) || ($file['error'] ?? UPLOAD_ERR_NO_FILE) !== UPLOAD_ERR_OK) {
    $tooBig = $file && in_array($file['error'] ?? null, [UPLOAD_ERR_INI_SIZE, UPLOAD_ERR_FORM_SIZE], true);
    http_response_code(400);
    echo json_encode(['error' => $tooBig ? 'Datei ist zu gross' : 'Keine gültige Bilddatei erhalten']);
    return;
}

if ($file['size'] > $spec['max_bytes']) {
    http_response_code(400);
    echo json_encode(['error' => 'Datei ist zu gross (max. ' . ($spec['max_bytes'] / 1024 / 1024) . ' MB)']);
    return;
}

$tmp = $file['tmp_name'];
if (!is_uploaded_file($tmp)) {
    http_response_code(400);
    echo json_encode(['error' => 'Ungültiger Upload']);
    return;
}

// Typ am Inhalt erkennen (nicht an Dateiname/Client-MIME) und zusätzlich
// prüfen, dass es sich wirklich als Bild öffnen lässt.
$finfo = new finfo(FILEINFO_MIME_TYPE);
$mime = (string) $finfo->file($tmp);
$imageInfo = @getimagesize($tmp);
if (!isset(BRANDING_MIME_EXTENSIONS[$mime]) || $imageInfo === false || ($imageInfo['mime'] ?? '') !== $mime) {
    http_response_code(400);
    echo json_encode(['error' => 'Nur PNG, JPG, WebP oder GIF erlaubt']);
    return;
}

[$width, $height] = $imageInfo;
if ($width < 1 || $height < 1 || $width > BRANDING_MAX_DIMENSION || $height > BRANDING_MAX_DIMENSION
    || $width * $height > BRANDING_MAX_PIXELS) {
    http_response_code(400);
    echo json_encode(['error' => 'Bild ist zu gross (max. ' . BRANDING_MAX_DIMENSION . ' Pixel pro Seite)']);
    return;
}

$dir = resolveBrandingUploadDir();
if (!is_dir($dir) && !mkdir($dir, 0755, true) && !is_dir($dir)) {
    http_response_code(500);
    echo json_encode(['error' => 'Upload-Ordner konnte nicht angelegt werden']);
    return;
}

$filename = $type . '-' . bin2hex(random_bytes(8)) . '.' . BRANDING_MIME_EXTENSIONS[$mime];
if (!move_uploaded_file($tmp, $dir . '/' . $filename)) {
    http_response_code(500);
    echo json_encode(['error' => 'Datei konnte nicht gespeichert werden']);
    return;
}
@chmod($dir . '/' . $filename, 0644);

$url = '/uploads/' . $filename;
$previous = getSetting($spec['key'], '');

try {
    setSetting($spec['key'], $url);
} catch (Throwable $e) {
    @unlink($dir . '/' . $filename);
    http_response_code(500);
    echo json_encode(['error' => 'Fehler beim Speichern']);
    return;
}

// Alte Datei erst nach erfolgreichem Setting-Update entfernen.
if ($previous !== '' && $previous !== $url) {
    deleteBrandingFile($previous);
}

echo json_encode(['success' => true, 'url' => $url]);
