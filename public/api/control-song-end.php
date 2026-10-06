<?php
require __DIR__ . '/../lib/db.php';
require_once __DIR__ . '/../lib/stats.php';
header('Content-Type: application/json');
requireApiKey();

if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
    http_response_code(405);
    echo json_encode(['error' => 'Methode nicht erlaubt']);
    return;
}

try {
    // Bewusst ohne WHERE auf eine einzelne id - beendet den/die aktuell
    // laufenden Song(s), ohne dass das Companion-Modul dessen id kennen muss
    // (die letzte control-status.php-Antwort reicht als Anzeige, nicht als
    // Voraussetzung für diese Action).
    // Ids vorab merken - nach dem UPDATE lässt sich nicht mehr unterscheiden,
    // welche Einträge gerade erst (und nicht schon früher) beendet wurden.
    $playingIds = db()->query("SELECT id FROM queue_entries WHERE status = 'playing'")->fetchAll(PDO::FETCH_COLUMN);

    $stmt = db()->prepare("UPDATE queue_entries SET status = 'completed' WHERE status = 'playing'");
    $stmt->execute();

    if ($stmt->rowCount() === 0) {
        http_response_code(404);
        echo json_encode(['error' => 'Kein Song läuft gerade']);
        return;
    }

    foreach ($playingIds as $playingId) {
        logStatusChange((int) $playingId, 'completed');
    }

    echo json_encode(['success' => true]);
} catch (Throwable $e) {
    http_response_code(500);
    echo json_encode(['error' => 'Fehler beim Beenden']);
}
