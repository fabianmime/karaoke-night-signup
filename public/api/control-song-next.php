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

$pdo = db();

try {
    $pdo->beginTransaction();

    // Alle aktiven Einträge (inkl. pending) sperren (FOR UPDATE) - gleiches
    // Muster wie queue-reorder.php, verhindert dass ein doppelter/gleich-
    // zeitiger Aufruf (z.B. Doppelklick im Companion-Modul) zweimal denselben
    // Song startet, UND liefert gleich die vollständige, konsistente
    // Positions-Reihenfolge fürs Umsortieren weiter unten (keine zweite
    // Abfrage nötig).
    $active = $pdo->query(
        "SELECT id, status FROM queue_entries WHERE status IN ('pending', 'approved', 'playing') ORDER BY position ASC FOR UPDATE"
    )->fetchAll();

    $playing = null;
    $nextApproved = null;
    foreach ($active as $entry) {
        if ($entry['status'] === 'playing' && $playing === null) {
            $playing = $entry;
        } elseif ($entry['status'] === 'approved' && $nextApproved === null) {
            $nextApproved = $entry;
        }
    }

    if ($nextApproved === null) {
        $pdo->rollBack();
        http_response_code(404);
        echo json_encode(['error' => 'Keine genehmigten Songs in der Warteschlange']);
        return;
    }

    if ($playing !== null) {
        $pdo->prepare("UPDATE queue_entries SET status = 'completed' WHERE id = ?")->execute([$playing['id']]);
    }
    $pdo->prepare("UPDATE queue_entries SET status = 'playing' WHERE id = ?")->execute([$nextApproved['id']]);

    // Neu gestarteten Song ganz nach vorne - gleiche Logik wie moveToTop() in
    // admin.js, hier serverseitig in derselben Transaktion wie der
    // Statuswechsel, damit das Display nie kurz eine falsche Reihenfolge
    // zeigt. $active ist bereits vollständig und nach Position sortiert.
    $remainingIds = array_map('intval', array_column($active, 'id'));
    $newId = (int) $nextApproved['id'];
    $orderedIds = array_merge([$newId], array_values(array_filter($remainingIds, fn ($id) => $id !== $newId)));

    $stmt = $pdo->prepare('UPDATE queue_entries SET position = ? WHERE id = ?');
    $position = 1;
    foreach ($orderedIds as $id) {
        $stmt->execute([$position, $id]);
        $position++;
    }

    $pdo->commit();

    if ($playing !== null) {
        logStatusChange((int) $playing['id'], 'completed');
    }
    logStatusChange($newId, 'playing');

    $songStmt = $pdo->prepare(
        'SELECT q.id, s.title, s.artist, q.first_name, q.last_name, q.duet_first_name, q.duet_last_name
         FROM queue_entries q JOIN songs s ON q.song_id = s.id WHERE q.id = ?'
    );
    $songStmt->execute([$newId]);
    $entry = $songStmt->fetch();
    $singer = $entry['duet_first_name']
        ? "{$entry['first_name']} {$entry['last_name']} & {$entry['duet_first_name']} {$entry['duet_last_name']}"
        : "{$entry['first_name']} {$entry['last_name']}";

    echo json_encode([
        'success' => true,
        'playing' => [
            'id' => (int) $entry['id'],
            'title' => $entry['title'],
            'artist' => $entry['artist'],
            'singer' => $singer,
        ],
    ]);
} catch (Throwable $e) {
    if ($pdo->inTransaction()) {
        $pdo->rollBack();
    }
    http_response_code(500);
    echo json_encode(['error' => 'Fehler beim Songwechsel']);
}
