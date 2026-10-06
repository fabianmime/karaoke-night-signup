<?php
require __DIR__ . '/../lib/db.php';
header('Content-Type: application/json');
requireAdmin();

if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
    http_response_code(405);
    echo json_encode(['error' => 'Methode nicht erlaubt']);
    return;
}

// Löscht ALLE Anmeldungen (Warteschlange + Verlauf) unwiderruflich - die
// zugehörigen Stimmen hängen per FOREIGN KEY ... ON DELETE CASCADE mit dran
// und verschwinden automatisch mit. Song-Katalog (inkl. Filter-Markierungen)
// und alle Settings/Passwörter bleiben bewusst unangetastet - das ist kein
// "Werkseinstellungen"-Reset, nur ein Zurücksetzen der Anmeldungen (z.B. vor
// dem echten Event-Start, um Testdaten loszuwerden).
try {
    $deleted = db()->exec('DELETE FROM queue_entries');

    echo json_encode(['success' => true, 'deleted' => $deleted]);
} catch (Throwable $e) {
    http_response_code(500);
    echo json_encode(['error' => 'Fehler beim Löschen']);
}
