<?php
// CSV-Rohdaten-Export der Statistik (Ereignisse oder Besuche) für die
// Auswertung nach dem Event, z.B. in Excel. Semikolon + UTF-8-BOM, damit
// Excel mit Schweizer/deutschen Ländereinstellungen es direkt sauber öffnet.
require __DIR__ . '/../lib/db.php';
require_once __DIR__ . '/../lib/stats.php';
requireStats();

$type = ($_GET['type'] ?? 'events') === 'visits' ? 'visits' : 'events';
$from = (int) ($_GET['from'] ?? 0);
$to = (int) ($_GET['to'] ?? 0) ?: time() + 60;

if ($type === 'visits') {
    $stmt = db()->prepare(
        'SELECT started_at, last_seen, TIMESTAMPDIFF(SECOND, started_at, last_seen) AS dauer_s,
                page, visitor_id, is_new_visitor, device, os, browser, source
         FROM stats_visits
         WHERE started_at >= FROM_UNIXTIME(?) AND started_at < FROM_UNIXTIME(?)
         ORDER BY started_at'
    );
} else {
    $stmt = db()->prepare(
        'SELECT created_at, event_type, visitor_id, term, result_count, song_id, queue_entry_id, song_label, detail
         FROM stats_events
         WHERE created_at >= FROM_UNIXTIME(?) AND created_at < FROM_UNIXTIME(?)
         ORDER BY created_at, id'
    );
}
$stmt->execute([$from, $to]);

header('Content-Type: text/csv; charset=utf-8');
header('Content-Disposition: attachment; filename="karaoke-statistik-' . $type . '-' . date('Y-m-d') . '.csv"');

$out = fopen('php://output', 'w');
fwrite($out, "\xEF\xBB\xBF");
$first = true;
while ($row = $stmt->fetch()) {
    if ($first) {
        fputcsv($out, array_keys($row), ';');
        $first = false;
    }
    // Suchbegriffe tippen Gäste frei ein - ein Wert wie "=HYPERLINK(...)"
    // würde Excel sonst als Formel ausführen (CSV-Injection).
    $row = array_map(
        fn ($v) => (is_string($v) && $v !== '' && strpbrk($v[0], "=+-@\t\r") !== false) ? "'" . $v : $v,
        $row
    );
    fputcsv($out, $row, ';');
}
if ($first) {
    fputcsv($out, ['keine Daten im gewählten Zeitraum'], ';');
}
fclose($out);
