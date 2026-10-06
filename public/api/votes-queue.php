<?php
require __DIR__ . '/../lib/db.php';
header('Content-Type: application/json');

// Bewusst ohne requireAdmin()/requireModerator() - Gäste voten ohne Login.
// Zeigt absichtlich nur Titel/Interpret, keine Sänger-Angaben (Voting bleibt
// anonym, siehe database.sql).
$voterToken = getOrCreateVoterToken();

try {
    $pdo = db();

    // Höchste Stimmenzahl zuoberst, bei Gleichstand die zuletzt angemeldeten
    // Songs zuoberst - bewusst unabhängig von der Admin-Warteschlangen-
    // Reihenfolge (queue-current.php/Display bleiben bei q.position). Bereits
    // fertig gesungene Songs, für die diese/r Gast selbst gevotet hat, bleiben
    // zusätzlich (nur für sie/ihn) ganz oben sichtbar - sonst wirkten die
    // eigenen Stimmen nach dem Auftritt spurlos verschwunden. Andere
    // "completed"-Songs (ohne eigene Stimme) tauchen nicht auf, sonst würde
    // die Liste über den Abend hinweg immer länger.
    $songsStmt = $pdo->prepare(
        "SELECT q.id, q.status, s.title, s.artist,
                (SELECT COUNT(*) FROM votes v WHERE v.queue_entry_id = q.id) AS votes
         FROM queue_entries q
         JOIN songs s ON q.song_id = s.id
         WHERE q.status IN ('approved', 'playing')
            OR (q.status = 'completed' AND EXISTS (
                  SELECT 1 FROM votes v WHERE v.queue_entry_id = q.id AND v.voter_token = ?
                ))
         ORDER BY (q.status = 'completed') DESC, votes DESC, q.created_at DESC"
    );
    $songsStmt->execute([$voterToken]);
    $songs = $songsStmt->fetchAll();

    // Eigene Stimmen pro Song ergänzen - steuert im Frontend den
    // "Zurücknehmen"-Button (nur möglich, solange man selbst schon
    // mindestens eine Stimme dort hat).
    $myVotesStmt = $pdo->prepare(
        'SELECT queue_entry_id, COUNT(*) AS c FROM votes WHERE voter_token = ? GROUP BY queue_entry_id'
    );
    $myVotesStmt->execute([$voterToken]);
    $myVotesByEntry = [];
    foreach ($myVotesStmt->fetchAll() as $row) {
        $myVotesByEntry[(int) $row['queue_entry_id']] = (int) $row['c'];
    }
    foreach ($songs as &$song) {
        $song['my_votes'] = $myVotesByEntry[(int) $song['id']] ?? 0;
    }
    unset($song);

    $usedStmt = $pdo->prepare('SELECT COUNT(*) FROM votes WHERE voter_token = ?');
    $usedStmt->execute([$voterToken]);
    $used = (int) $usedStmt->fetchColumn();

    echo json_encode([
        'songs' => $songs,
        'remaining' => max(0, 3 - $used),
    ]);
} catch (Throwable $e) {
    http_response_code(500);
    echo json_encode(['error' => 'Fehler beim Abrufen der Songs']);
}
