<?php
require __DIR__ . '/../lib/db.php';
header('Content-Type: application/json');
requireAdmin();

// Zwei Modi in einem Endpoint (bewusst kombiniert, dieselbe Grundabfrage):
// - query gesetzt: Katalogsuche (Titel/Interpret), unabhängig vom aktuellen
//   Filter-Status - der Admin muss auch unauffällige Songs finden können,
//   um sie neu zu markieren.
// - kein query, aber status gesetzt: Liste der aktuell so markierten Songs
//   (für die Übersicht "Aktuell gesperrt"/"Aktuell zu prüfen").
$query = trim((string) ($_GET['query'] ?? ''));
$status = trim((string) ($_GET['status'] ?? ''));
$limit = (int) ($_GET['limit'] ?? 50);
if ($limit <= 0 || $limit > 200) {
    $limit = 50;
}

$validStatuses = ['none', 'review', 'blocked'];
$statusList = array_values(array_intersect(
    array_map('trim', explode(',', $status)),
    $validStatuses
));

if ($query === '' && empty($statusList)) {
    http_response_code(400);
    echo json_encode(['error' => 'Bitte Suchbegriff oder Status angeben']);
    return;
}

if ($query !== '' && mb_strlen($query) < 2) {
    http_response_code(400);
    echo json_encode(['error' => 'Suchtext zu kurz']);
    return;
}

try {
    $where = [];
    $params = [];

    if ($query !== '') {
        $where[] = '(title LIKE :term OR artist LIKE :term)';
        $params[':term'] = "%$query%";
    }
    if (!empty($statusList)) {
        $placeholders = [];
        foreach ($statusList as $i => $s) {
            $key = ":status$i";
            $placeholders[] = $key;
            $params[$key] = $s;
        }
        $where[] = 'filter_status IN (' . implode(',', $placeholders) . ')';
    }

    $sql = 'SELECT id, title, artist, genre, year, filter_status, filter_reason FROM songs';
    if ($where) {
        $sql .= ' WHERE ' . implode(' AND ', $where);
    }
    $sql .= ' ORDER BY title ASC LIMIT :limit';

    $stmt = db()->prepare($sql);
    foreach ($params as $key => $value) {
        $stmt->bindValue($key, $value, PDO::PARAM_STR);
    }
    $stmt->bindValue(':limit', $limit, PDO::PARAM_INT);
    $stmt->execute();

    echo json_encode($stmt->fetchAll());
} catch (Throwable $e) {
    http_response_code(500);
    echo json_encode(['error' => 'Suchfehler']);
}
