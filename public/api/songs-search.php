<?php
require __DIR__ . '/../lib/db.php';
header('Content-Type: application/json');

$query = trim((string) ($_GET['query'] ?? ''));

// Smartphone-Tastaturen (v.a. iOS-Autokorrektur) ersetzen ' gerne durch ein
// geschwungenes Anführungszeichen (' U+2019) - der Katalog speichert Titel
// aber mit geradem Apostroph, darum sonst 0 Treffer für z.B. "J'irai".
$query = str_replace(
    ["\u{2018}", "\u{2019}", "\u{201A}", "\u{02BC}", "\u{201C}", "\u{201D}"],
    ["'", "'", "'", "'", '"', '"'],
    $query
);
$limit = (int) ($_GET['limit'] ?? 20);
if ($limit <= 0 || $limit > 100) {
    $limit = 20;
}

if (mb_strlen($query) < 2) {
    http_response_code(400);
    echo json_encode(['error' => 'Suchtext zu kurz']);
    return;
}

try {
    // "registered" markiert Songs, die bereits eine aktive oder fertige
    // Anmeldung haben (siehe queue-add.php) - nur "cancelled" gibt einen
    // Song wieder frei. Gäste-Seite blendet solche Songs nicht aus (Suche
    // bleibt vollständig), zeigt aber einen Hinweis und blockt die Auswahl.
    $stmt = db()->prepare(
        "SELECT s.id, s.title, s.artist, s.genre, s.year, s.language, s.duo,
                s.filter_status,
                EXISTS(
                    SELECT 1 FROM queue_entries q
                    WHERE q.song_id = s.id AND q.status IN ('pending', 'approved', 'playing', 'completed')
                ) AS registered
         FROM songs s
         WHERE s.title LIKE :term OR s.artist LIKE :term
         LIMIT :limit"
    );
    $stmt->bindValue(':term', "%$query%", PDO::PARAM_STR);
    $stmt->bindValue(':limit', $limit, PDO::PARAM_INT);
    $stmt->execute();

    $songs = $stmt->fetchAll();
    foreach ($songs as &$song) {
        $song['registered'] = (bool) $song['registered'];
        // Nur "blocked" nach aussen als Flag - "review" ist eine interne
        // Moderations-Info (siehe filter-search.php), nicht für Gäste
        // gedacht, und der Freitext-Grund bleibt hier komplett aussen vor.
        $song['blocked'] = $song['filter_status'] === 'blocked';
        unset($song['filter_status']);
    }
    unset($song);

    echo json_encode($songs);
} catch (Throwable $e) {
    http_response_code(500);
    echo json_encode(['error' => 'Suchfehler']);
}
