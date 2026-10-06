<?php
require __DIR__ . '/../lib/db.php';
header('Content-Type: application/json');
requireAdmin();

if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
    http_response_code(405);
    echo json_encode(['error' => 'Methode nicht erlaubt']);
    return;
}

if (empty($_FILES['csv']) || $_FILES['csv']['error'] !== UPLOAD_ERR_OK) {
    http_response_code(400);
    echo json_encode(['error' => 'Keine gültige CSV-Datei erhalten']);
    return;
}

set_time_limit(0);

$path = $_FILES['csv']['tmp_name'];
$handle = fopen($path, 'r');
if ($handle === false) {
    http_response_code(500);
    echo json_encode(['error' => 'Datei konnte nicht gelesen werden']);
    return;
}

// Trenner erkennen: aktuelles KaraFun-Format ist Semikolon-getrennt
// (Id;Title;Artist;Year;Duo;Explicit;Date Added;Styles;Languages), ältere
// Exporte/andere Quellen könnten Komma nutzen.
$firstLine = fgets($handle);
rewind($handle);
$delimiter = substr_count((string) $firstLine, ';') >= substr_count((string) $firstLine, ',') ? ';' : ',';

$header = fgetcsv($handle, 0, $delimiter);
if ($header === false) {
    fclose($handle);
    http_response_code(400);
    echo json_encode(['error' => 'CSV-Datei ist leer oder ungültig']);
    return;
}

$col = array_flip($header);
$colIndex = static function (array $names) use ($col) {
    foreach ($names as $name) {
        if (isset($col[$name])) {
            return $col[$name];
        }
    }
    return null;
};

$idxTitle = $colIndex(['Title', 'Song', 'title']);
$idxArtist = $colIndex(['Artist', 'artist']);
$idxGenre = $colIndex(['Styles', 'Genre', 'genre']);
$idxYear = $colIndex(['Year', 'year']);
$idxLanguage = $colIndex(['Languages', 'Language', 'language']);
$idxKarafunId = $colIndex(['Id', 'ID', 'id']);
$idxDuo = $colIndex(['Duo', 'duo']);
$idxExplicit = $colIndex(['Explicit', 'explicit']);

if ($idxTitle === null || $idxArtist === null) {
    fclose($handle);
    http_response_code(400);
    echo json_encode(['error' => 'CSV braucht mindestens Title/Artist-Spalten']);
    return;
}

$pdo = db();
$processed = 0;
$batch = [];
$batchSize = 500;

// ON DUPLICATE KEY UPDATE statt INSERT IGNORE: ein erneuter Import (z.B. zum
// Nachtragen des Duo-Felds für bereits importierte Songs) aktualisiert
// bestehende Zeilen mit, statt sie unverändert zu lassen.
$flush = static function () use (&$batch, $pdo) {
    if (!$batch) {
        return;
    }

    $placeholders = implode(',', array_fill(0, count($batch), '(?, ?, ?, ?, ?, ?, ?, ?)'));
    $values = [];
    foreach ($batch as $row) {
        array_push($values, ...$row);
    }

    $stmt = $pdo->prepare(
        "INSERT INTO songs (title, artist, genre, year, language, karafun_id, duo, explicit) VALUES $placeholders
         ON DUPLICATE KEY UPDATE genre = VALUES(genre), year = VALUES(year),
                                  language = VALUES(language), duo = VALUES(duo),
                                  explicit = VALUES(explicit)"
    );
    $stmt->execute($values);

    $batch = [];
};

$countBefore = (int) $pdo->query('SELECT COUNT(*) FROM songs')->fetchColumn();
$invalid = 0;

while (($row = fgetcsv($handle, 0, $delimiter)) !== false) {
    $title = trim((string) ($row[$idxTitle] ?? ''));
    $artist = trim((string) ($row[$idxArtist] ?? ''));

    if ($title === '' || $artist === '') {
        $invalid++;
        continue;
    }

    $genre = $idxGenre !== null ? trim((string) ($row[$idxGenre] ?? '')) : '';
    $yearRaw = $idxYear !== null ? trim((string) ($row[$idxYear] ?? '')) : '';
    $year = is_numeric($yearRaw) ? (int) $yearRaw : null;
    $language = $idxLanguage !== null ? trim((string) ($row[$idxLanguage] ?? '')) : '';
    $karafunId = $idxKarafunId !== null ? trim((string) ($row[$idxKarafunId] ?? '')) : '';
    $duo = $idxDuo !== null && trim((string) ($row[$idxDuo] ?? '0')) === '1' ? 1 : 0;
    $explicit = $idxExplicit !== null && trim((string) ($row[$idxExplicit] ?? '0')) === '1' ? 1 : 0;

    $processed++;
    $batch[] = [$title, $artist, $genre ?: null, $year, $language ?: null, $karafunId ?: null, $duo, $explicit];

    if (count($batch) >= $batchSize) {
        $flush();
    }
}
$flush();

fclose($handle);

// Von KaraFun als "explicit" markierte Songs automatisch zur Prüfung
// markieren (nicht sperren - Anmeldung bleibt möglich, nur ein Hinweis in
// der Warteschlange) - aber nur, wenn noch niemand den Song manuell
// klassifiziert hat (filter_status noch 'none'), damit ein erneuter Import
// nie eine bewusste Admin-Entscheidung überschreibt.
$reviewCount = $pdo->exec(
    "UPDATE songs SET filter_status = 'review', filter_reason = 'Explizit laut KaraFun-Katalog'
     WHERE explicit = 1 AND filter_status = 'none'"
);

$countAfter = (int) $pdo->query('SELECT COUNT(*) FROM songs')->fetchColumn();
$imported = $countAfter - $countBefore;
$skipped = $processed - $imported + $invalid;

echo json_encode([
    'success' => true,
    'imported' => $imported,
    'newly_review_explicit' => $reviewCount,
    'skipped' => $skipped,
]);
