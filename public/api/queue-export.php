<?php
require __DIR__ . '/../lib/db.php';
requireAdmin();

// Bewusst ALLE Anmeldungen (nicht nur die aktive Warteschlange) - fürs
// Team als Gesamt-Ablage nach dem Event, Status-Spalte macht klar, was
// wirklich stattgefunden hat.
$rows = db()->query(
    "SELECT q.status, q.created_at, s.title, s.artist,
            q.first_name, q.last_name, q.duet_first_name, q.duet_last_name,
            q.phone, q.email, q.comment,
            (SELECT COUNT(*) FROM votes v WHERE v.queue_entry_id = q.id) AS votes
     FROM queue_entries q
     JOIN songs s ON q.song_id = s.id
     ORDER BY q.created_at ASC"
)->fetchAll();

$statusLabels = [
    'pending' => 'Angemeldet',
    'approved' => 'Genehmigt',
    'playing' => 'Singt',
    'completed' => 'Fertig',
    'cancelled' => 'Storniert',
];

$filename = 'karaoke-anmeldungen-' . date('Y-m-d_H-i') . '.csv';
header('Content-Type: text/csv; charset=UTF-8');
header('Content-Disposition: attachment; filename="' . $filename . '"');

$out = fopen('php://output', 'w');
// UTF-8-BOM, damit Excel Umlaute korrekt anzeigt statt als Rohbytes.
fwrite($out, "\xEF\xBB\xBF");

// Semikolon statt Komma - Schweizer/deutsches Excel erwartet das als
// CSV-Trennzeichen standardmässig (gleiche Konvention wie der KaraFun-Export).
fputcsv($out, [
    'Status', 'Angemeldet am', 'Titel', 'Interpret',
    'Vorname', 'Nachname', 'Duett-Vorname', 'Duett-Nachname',
    'Telefon', 'E-Mail', 'Bemerkung', 'Stimmen',
], ';');

foreach ($rows as $row) {
    fputcsv($out, [
        $statusLabels[$row['status']] ?? $row['status'],
        $row['created_at'],
        $row['title'],
        $row['artist'],
        $row['first_name'],
        $row['last_name'],
        $row['duet_first_name'],
        $row['duet_last_name'],
        $row['phone'],
        $row['email'],
        $row['comment'],
        $row['votes'],
    ], ';');
}

fclose($out);
