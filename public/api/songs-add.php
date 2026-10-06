<?php
require __DIR__ . '/../lib/db.php';
header('Content-Type: application/json');
requireAdmin();

$input = jsonInput();
$title = trim((string) ($input['title'] ?? ''));
$artist = trim((string) ($input['artist'] ?? ''));
$genre = trim((string) ($input['genre'] ?? ''));
$language = trim((string) ($input['language'] ?? ''));
$year = isset($input['year']) && is_numeric($input['year']) ? (int) $input['year'] : null;
$duo = !empty($input['duo']) ? 1 : 0;

if ($title === '' || $artist === '') {
    http_response_code(400);
    echo json_encode(['error' => 'Titel und Künstler sind Pflicht']);
    return;
}

try {
    $stmt = db()->prepare(
        'INSERT INTO songs (title, artist, genre, year, language, duo) VALUES (?, ?, ?, ?, ?, ?)'
    );
    $stmt->execute([$title, $artist, $genre ?: null, $year, $language ?: null, $duo]);

    echo json_encode([
        'success' => true,
        'id' => (int) db()->lastInsertId(),
        'message' => 'Song hinzugefügt',
    ]);
} catch (Throwable $e) {
    http_response_code(500);
    echo json_encode(['error' => 'Fehler beim Hinzufügen']);
}
