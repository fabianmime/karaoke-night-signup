<?php
require __DIR__ . '/../lib/db.php';
require_once __DIR__ . '/../lib/stats.php';
header('Content-Type: application/json');

if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
    http_response_code(405);
    echo json_encode(['error' => 'Methode nicht erlaubt']);
    return;
}

if (getSetting('voting_locked', '0') === '1') {
    http_response_code(423);
    echo json_encode(['error' => 'Das Voten ist derzeit geschlossen']);
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

    $usedStmt = $pdo->prepare('SELECT COUNT(*) FROM votes WHERE voter_token = ?');
    $usedStmt->execute([$voterToken]);
    $used = (int) $usedStmt->fetchColumn();

    if ($used >= 3) {
        http_response_code(409);
        echo json_encode(['error' => 'Du hast bereits alle 3 Stimmen vergeben']);
        return;
    }

    // Voting ist nur für bereits genehmigte (öffentlich sichtbare) Songs
    // möglich - dieselbe Bedingung wie queue-current.php/das Display.
    $entryStmt = $pdo->prepare("SELECT status FROM queue_entries WHERE id = ?");
    $entryStmt->execute([$queueEntryId]);
    $status = $entryStmt->fetchColumn();

    if ($status === false || !in_array($status, ['approved', 'playing'], true)) {
        http_response_code(404);
        echo json_encode(['error' => 'Song ist aktuell nicht wählbar']);
        return;
    }

    $pdo->prepare('INSERT INTO votes (queue_entry_id, voter_token) VALUES (?, ?)')
        ->execute([$queueEntryId, $voterToken]);

    logStatsEvent('vote', array_merge(statsEntrySong($queueEntryId), [
        'queue_entry_id' => $queueEntryId,
        'detail' => statsVoterHash($voterToken),
    ]));

    $countStmt = $pdo->prepare('SELECT COUNT(*) FROM votes WHERE queue_entry_id = ?');
    $countStmt->execute([$queueEntryId]);
    $votes = (int) $countStmt->fetchColumn();

    echo json_encode([
        'success' => true,
        'votes' => $votes,
        'remaining' => 3 - ($used + 1),
    ]);
} catch (Throwable $e) {
    http_response_code(500);
    echo json_encode(['error' => 'Fehler beim Abstimmen']);
}
