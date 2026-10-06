<?php
require __DIR__ . '/../lib/db.php';
require_once __DIR__ . '/../lib/stats.php';
header('Content-Type: application/json');

if (getSetting('registration_locked', '0') === '1') {
    logStatsEvent('registration_rejected', ['detail' => 'locked']);
    http_response_code(423);
    echo json_encode(['error' => 'Die Anmeldung ist derzeit geschlossen']);
    return;
}

$input = jsonInput();
$songId = $input['song_id'] ?? null;
$firstName = trim((string) ($input['first_name'] ?? ''));
$lastName = trim((string) ($input['last_name'] ?? ''));
$phone = trim((string) ($input['phone'] ?? ''));
$email = trim((string) ($input['email'] ?? ''));
$duetFirstName = trim((string) ($input['duet_first_name'] ?? ''));
$duetLastName = trim((string) ($input['duet_last_name'] ?? ''));
$comment = trim((string) ($input['comment'] ?? ''));

if (!$songId || $firstName === '' || $lastName === '' || $phone === '' || $email === '') {
    http_response_code(400);
    echo json_encode(['error' => 'Alle Felder erforderlich']);
    return;
}

$phone = normalizeSwissPhone($phone);

if (!isValidPhoneFormat($phone)) {
    http_response_code(400);
    echo json_encode(['error' => 'Bitte eine gültige Telefonnummer angeben.']);
    return;
}

$pdo = db();

try {
    $songStmt = $pdo->prepare('SELECT duo, filter_status FROM songs WHERE id = ?');
    $songStmt->execute([$songId]);
    $song = $songStmt->fetch();

    if (!$song) {
        http_response_code(404);
        echo json_encode(['error' => 'Song nicht gefunden']);
        return;
    }

    if ($song['filter_status'] === 'blocked') {
        logStatsEvent('registration_rejected', [
            'song_id' => (int) $songId,
            'song_label' => statsSongLabel((int) $songId),
            'detail' => 'blocked',
        ]);
        http_response_code(403);
        echo json_encode(['error' => 'Dieser Song ist durch die Moderation gesperrt.']);
        return;
    }

    $isDuo = (bool) $song['duo'];

    if ($isDuo) {
        if ($duetFirstName === '' || $duetLastName === '') {
            http_response_code(400);
            echo json_encode(['error' => 'Bitte Vor- und Nachname der Duett-Partnerin/des Duett-Partners angeben']);
            return;
        }
    } else {
        // Bei Nicht-Duett-Songs Duett-Felder ignorieren, auch falls welche
        // mitgeschickt wurden (z.B. nach Songwechsel im Formular).
        $duetFirstName = '';
        $duetLastName = '';
    }

    $pdo->beginTransaction();

    // FOR UPDATE sperrt nur die Zeile mit der aktuell höchsten Position (statt
    // wie zuvor alle aktiven Zeilen) - verhindert weiterhin, dass zwei
    // gleichzeitige Anmeldungen dieselbe Position bekommen (InnoDBs Next-Key-
    // Locking sperrt dabei auch die Lücke dahinter gegen neue Inserts), ohne
    // bei einem Anmelde-Ansturm alle Anmeldungen komplett zu serialisieren.
    $maxPosition = (int) $pdo->query(
        "SELECT position FROM queue_entries WHERE status != 'cancelled' ORDER BY position DESC LIMIT 1 FOR UPDATE"
    )->fetchColumn();
    $nextPosition = $maxPosition + 1;

    // Ein Song darf nur einmal aktiv/fertig angemeldet sein - erst
    // "storniert" gibt ihn wieder frei. Läuft innerhalb derselben
    // Transaktion wie die Positionssperre oben, damit zwei gleichzeitige
    // Anmeldungen desselben Songs sauber nacheinander geprüft werden.
    $dupStmt = $pdo->prepare(
        "SELECT 1 FROM queue_entries
         WHERE song_id = ? AND status IN ('pending', 'approved', 'playing', 'completed')
         FOR UPDATE"
    );
    $dupStmt->execute([$songId]);
    if ($dupStmt->fetch()) {
        $pdo->rollBack();
        // Zeigt in der Statistik, welche Songs mehrfach gewünscht waren.
        logStatsEvent('registration_rejected', [
            'song_id' => (int) $songId,
            'song_label' => statsSongLabel((int) $songId),
            'detail' => 'taken',
        ]);
        http_response_code(409);
        echo json_encode(['error' => 'Dieser Song wurde bereits ausgewählt. Bitte wähle einen anderen.']);
        return;
    }

    $stmt = $pdo->prepare(
        "INSERT INTO queue_entries
         (song_id, first_name, last_name, phone, email, duet_first_name, duet_last_name, comment, position, status)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'pending')"
    );
    $stmt->execute([
        $songId, $firstName, $lastName, $phone, $email,
        $duetFirstName ?: null, $duetLastName ?: null, $comment ?: null,
        $nextPosition,
    ]);
    $entryId = (int) $pdo->lastInsertId();

    $pdo->commit();

    logStatsEvent('registration', [
        'song_id' => (int) $songId,
        'queue_entry_id' => $entryId,
        'song_label' => statsSongLabel((int) $songId),
        'detail' => $isDuo ? 'duo' : 'solo',
    ]);
    logStatusChange($entryId, 'pending');

    echo json_encode([
        'success' => true,
        'message' => 'Song zur Queue hinzugefügt',
        'entry_id' => $entryId,
        'position' => $nextPosition,
    ]);
} catch (Throwable $e) {
    if ($pdo->inTransaction()) {
        $pdo->rollBack();
    }
    http_response_code(500);
    echo json_encode(['error' => 'Fehler beim Hinzufügen zur Queue']);
}
