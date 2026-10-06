<?php
require __DIR__ . '/../lib/db.php';
header('Content-Type: application/json');
requireAdmin();

if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
    http_response_code(405);
    echo json_encode(['error' => 'Methode nicht erlaubt']);
    return;
}

// Löscht ausnahmslos ALLE Stimmen - "allen 3 neue Stimmen geben" und "alle
// Song-Zähler auf 0 setzen" sind mechanisch dieselbe Aktion, weil sowohl die
// verbleibenden Stimmen pro Gast als auch die Zähler pro Song direkt aus
// derselben `votes`-Tabelle gezählt werden (kein separates Konto pro Gast).
try {
    $pdo = db();
    $deleted = $pdo->exec('DELETE FROM votes');

    echo json_encode(['success' => true, 'deleted' => $deleted]);
} catch (Throwable $e) {
    http_response_code(500);
    echo json_encode(['error' => 'Fehler beim Zurücksetzen']);
}
