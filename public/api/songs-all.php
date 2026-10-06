<?php
require __DIR__ . '/../lib/db.php';
header('Content-Type: application/json');

$page = max(1, (int) ($_GET['page'] ?? 1));
$limit = max(1, min(200, (int) ($_GET['limit'] ?? 50)));
$offset = ($page - 1) * $limit;

try {
    $pdo = db();

    $stmt = $pdo->prepare('SELECT id, title, artist, genre, year FROM songs LIMIT :limit OFFSET :offset');
    $stmt->bindValue(':limit', $limit, PDO::PARAM_INT);
    $stmt->bindValue(':offset', $offset, PDO::PARAM_INT);
    $stmt->execute();
    $songs = $stmt->fetchAll();

    $total = (int) $pdo->query('SELECT COUNT(*) FROM songs')->fetchColumn();

    echo json_encode([
        'songs' => $songs,
        'total' => $total,
        'page' => $page,
        'limit' => $limit,
    ]);
} catch (Throwable $e) {
    http_response_code(500);
    echo json_encode(['error' => 'Fehler beim Abrufen der Songs']);
}
