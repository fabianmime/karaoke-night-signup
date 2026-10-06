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
$rawArtists = $input['artists'] ?? [];
$filterStatus = (string) ($input['filter_status'] ?? '');
$filterReason = trim((string) ($input['filter_reason'] ?? ''));

$validStatuses = ['none', 'review', 'blocked'];
if (!is_array($rawArtists) || !in_array($filterStatus, $validStatuses, true)) {
    http_response_code(400);
    echo json_encode(['error' => 'Ungültige Eingabe']);
    return;
}

// "Keine Sperre" räumt den Grund gleich mit auf - sonst bliebe ein alter
// Freitext-Grund an einem eigentlich wieder freigegebenen Song kleben.
if ($filterStatus === 'none') {
    $filterReason = '';
}
$reasonValue = $filterReason !== '' ? $filterReason : null;

// Dedupliziert, leere Zeilen raus - die Reihenfolge bleibt für die
// Rückmeldung erhalten (erste Nennung zählt).
$artists = [];
foreach ($rawArtists as $name) {
    $name = trim((string) $name);
    if ($name === '' || in_array($name, $artists, true)) {
        continue;
    }
    $artists[] = $name;
}

if (!$artists) {
    http_response_code(400);
    echo json_encode(['error' => 'Keine Bandnamen angegeben']);
    return;
}

$pdo = db();

// "Keine Sperre" überschreibt bewusst auch bestehende Markierungen (gezieltes
// Rückgängigmachen) - "Prüfen"/"Gesperrt" lassen bereits manuell
// klassifizierte Songs (filter_status != 'none') unangetastet, damit ein
// Sammel-Vorgang nie eine frühere Einzel-Entscheidung überschreibt.
$sql = $filterStatus === 'none'
    ? 'UPDATE songs SET filter_status = ?, filter_reason = ? WHERE artist = ?'
    : "UPDATE songs SET filter_status = ?, filter_reason = ? WHERE artist = ? AND filter_status = 'none'";
$stmt = $pdo->prepare($sql);

$perArtist = [];
$notFound = [];
$totalUpdated = 0;

try {
    foreach ($artists as $artist) {
        $stmt->execute([$filterStatus, $reasonValue, $artist]);
        $rows = $stmt->rowCount();
        $totalUpdated += $rows;
        $perArtist[] = ['artist' => $artist, 'rows_updated' => $rows];
        if ($rows === 0) {
            $notFound[] = $artist;
        }
    }

    echo json_encode([
        'success' => true,
        'total_artists' => count($artists),
        'total_rows_updated' => $totalUpdated,
        'per_artist' => $perArtist,
        'not_found' => $notFound,
    ]);
} catch (Throwable $e) {
    http_response_code(500);
    echo json_encode(['error' => 'Fehler beim Speichern']);
}
