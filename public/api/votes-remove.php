<?php
require __DIR__ . '/../lib/db.php';
require_once __DIR__ . '/../lib/stats.php';
header('Content-Type: application/json');

if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
    http_response_code(405);
    echo json_encode(['error' => 'Methode nicht erlaubt']);
    return;
}

$voterToken = getOrCreateVoterToken();
$input = jsonInput();
$queueEntryId = (int) ($input['queue_entry_id'] ?? 0);

if ($queueEntryId <= 0) {
    http_response_code(400);
    echo json_encode(['error' => 'Ungültiger Song']);
    return;
}

try {
    $pdo = db();

    // Zurücknehmen nur, solange der Song noch nicht spielt - "approved" ist
    // der einzige Status, in dem eine Stimme noch nicht final ist.
    $entryStmt = $pdo->prepare('SELECT status FROM queue_entries WHERE id = ?');
    $entryStmt->execute([$queueEntryId]);
    $status = $entryStmt->fetchColumn();

    if ($status === false) {
        http_response_code(404);
        echo json_encode(['error' => 'Song nicht gefunden']);
        return;
    }

    if ($status !== 'approved') {
        http_response_code(409);
        echo json_encode(['error' => 'Diese Stimme kann nicht mehr zurückgenommen werden']);
        return;
    }

    $voteIdStmt = $pdo->prepare(
        'SELECT id FROM votes WHERE queue_entry_id = ? AND voter_token = ? ORDER BY id DESC LIMIT 1'
    );
    $voteIdStmt->execute([$queueEntryId, $voterToken]);
    $voteId = $voteIdStmt->fetchColumn();

    if ($voteId === false) {
        http_response_code(404);
        echo json_encode(['error' => 'Keine Stimme für diesen Song gefunden']);
        return;
    }

    $pdo->prepare('DELETE FROM votes WHERE id = ?')->execute([$voteId]);

    logStatsEvent('vote_remove', array_merge(statsEntrySong($queueEntryId), [
        'queue_entry_id' => $queueEntryId,
        'detail' => statsVoterHash($voterToken),
    ]));

    $countStmt = $pdo->prepare('SELECT COUNT(*) FROM votes WHERE queue_entry_id = ?');
    $countStmt->execute([$queueEntryId]);
    $votes = (int) $countStmt->fetchColumn();

    $usedStmt = $pdo->prepare('SELECT COUNT(*) FROM votes WHERE voter_token = ?');
    $usedStmt->execute([$voterToken]);
    $used = (int) $usedStmt->fetchColumn();

    echo json_encode([
        'success' => true,
        'votes' => $votes,
        'remaining' => max(0, 3 - $used),
    ]);
} catch (Throwable $e) {
    http_response_code(500);
    echo json_encode(['error' => 'Fehler beim Zurücknehmen']);
}
