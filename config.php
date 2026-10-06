<?php
// Liest die .env-Datei (dieselbe, die auch scripts/import-karafun.js nutzt) -
// bewusst kein Composer/vlucas-dotenv, damit auf cyon-Hosting kein composer
// install nötig ist.

function loadEnv(string $path): array
{
    $values = [];
    if (!is_readable($path)) {
        return $values;
    }

    foreach (file($path, FILE_IGNORE_NEW_LINES | FILE_SKIP_EMPTY_LINES) as $line) {
        $line = trim($line);
        if ($line === '' || $line[0] === '#') {
            continue;
        }

        $parts = explode('=', $line, 2);
        if (count($parts) !== 2) {
            continue;
        }

        [$key, $value] = $parts;
        $values[trim($key)] = trim($value, " \t\n\r\0\x0B\"'");
    }

    return $values;
}

$env = loadEnv(__DIR__ . '/.env');

return [
    'db_host' => $env['DB_HOST'] ?? 'localhost',
    'db_user' => $env['DB_USER'] ?? '',
    'db_password' => $env['DB_PASSWORD'] ?? '',
    'db_name' => $env['DB_NAME'] ?? '',
    'admin_password' => $env['ADMIN_PASSWORD'] ?? '',
    // Bootstrap-Passwort der Statistik-Ansicht (/stats) - bewusst nur hier
    // und nicht übers Admin-Panel setzbar, damit die Statistik komplett vom
    // Admin-Zugang getrennt bleibt. Änderbar danach direkt in /stats.
    'stats_password' => $env['STATS_PASSWORD'] ?? '',
];
