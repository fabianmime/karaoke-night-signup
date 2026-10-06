<?php

function config(): array
{
    static $config = null;
    if ($config === null) {
        $config = require __DIR__ . '/../config.php';
    }
    return $config;
}

function db(): PDO
{
    static $pdo = null;
    if ($pdo === null) {
        $config = config();
        $dsn = "mysql:host={$config['db_host']};dbname={$config['db_name']};charset=utf8mb4";
        $pdo = new PDO($dsn, $config['db_user'], $config['db_password'], [
            PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION,
            PDO::ATTR_DEFAULT_FETCH_MODE => PDO::FETCH_ASSOC,
        ]);
    }
    return $pdo;
}

function startSession(): void
{
    if (session_status() === PHP_SESSION_NONE) {
        session_set_cookie_params([
            'httponly' => true,
            'samesite' => 'Lax',
        ]);
        session_start();
    }
}

function requireAdmin(): void
{
    startSession();
    if (empty($_SESSION['admin'])) {
        http_response_code(403);
        header('Content-Type: application/json');
        echo json_encode(['error' => 'Nicht authentifiziert']);
        exit;
    }
}

/**
 * Moderations-Zugang: eigene, vom Admin-Passwort unabhängige Rolle. Ein
 * eingeloggter Admin darf die Moderationsansicht ebenfalls sehen (Bonus,
 * kein zweiter Login nötig), aber ein Moderator hat keinen Admin-Zugriff.
 */
function requireModerator(): void
{
    startSession();
    if (empty($_SESSION['moderator']) && empty($_SESSION['admin'])) {
        http_response_code(403);
        header('Content-Type: application/json');
        echo json_encode(['error' => 'Nicht authentifiziert']);
        exit;
    }
}

/**
 * Maschinen-Auth fürs Companion-Modul (Show-Steuerung): dedizierter, in den
 * Settings gespeicherter Schlüssel statt Admin-Session-Cookie, da ein
 * dauerhaft laufendes Steuergerät keinen Browser-Login-Flow offen halten
 * kann/soll. hash_equals() vergleicht zeitkonstant (wie beim Admin-Passwort).
 * Ohne gesetzten Schlüssel (leerer String, Bootstrap-Zustand) ist der Zugang
 * grundsätzlich gesperrt, auch bei leerem Header - sonst würde ein leerer
 * Header einen leeren Settings-Wert "matchen".
 */
function requireApiKey(): void
{
    $key = getSetting('control_api_key', '');
    $header = $_SERVER['HTTP_X_API_KEY'] ?? '';
    if ($key === '' || !hash_equals($key, (string) $header)) {
        http_response_code(401);
        header('Content-Type: application/json');
        echo json_encode(['error' => 'Ungültiger oder fehlender API-Key']);
        exit;
    }
}

function jsonInput(): array
{
    $raw = file_get_contents('php://input');
    $data = json_decode((string) $raw, true);
    return is_array($data) ? $data : [];
}

function getSetting(string $key, ?string $default = null): ?string
{
    $stmt = db()->prepare('SELECT value FROM settings WHERE `key` = ?');
    $stmt->execute([$key]);
    $value = $stmt->fetchColumn();
    return $value === false ? $default : $value;
}

/**
 * Holt mehrere Settings in einer einzigen Query statt einer pro Key -
 * settings-public.php wird von jedem Gäste-Handy alle 4s gepollt, bei
 * hunderten gleichzeitigen Gästen macht das sonst hunderte Einzel-SELECTs
 * pro Sekunde gegen dieselbe kleine Tabelle. Gibt nur die in der DB
 * vorhandenen Keys zurück (fehlende Keys fehlen im Ergebnis-Array) - der
 * Aufrufer wendet Defaults selbst an, wie bei getSetting().
 */
function getSettings(array $keys): array
{
    if (!$keys) {
        return [];
    }
    $placeholders = implode(',', array_fill(0, count($keys), '?'));
    $stmt = db()->prepare("SELECT `key`, value FROM settings WHERE `key` IN ($placeholders)");
    $stmt->execute(array_values($keys));
    return $stmt->fetchAll(PDO::FETCH_KEY_PAIR);
}

function setSetting(string $key, string $value): void
{
    $stmt = db()->prepare(
        'INSERT INTO settings (`key`, value) VALUES (?, ?)
         ON DUPLICATE KEY UPDATE value = VALUES(value)'
    );
    $stmt->execute([$key, $value]);
}

/**
 * Footer ist bewusst als rohes HTML gespeichert (nicht Text), damit der
 * Link darin funktioniert - der Admin ist die einzige Rolle, die ihn
 * schreiben kann (settings-update.php via requireAdmin()).
 */
function defaultFooterHtml(): string
{
    return 'AI Driven · Supported by <a href="https://computer-trend.ch" target="_blank" rel="noopener">Computer Trend IT-Solution GmbH</a>';
}

/**
 * Prüft das Admin-Passwort: DB-Hash hat Vorrang (wird gesetzt, sobald der
 * Admin das Passwort einmal übers Panel ändert), sonst Fallback auf das
 * Klartext-Passwort aus .env (Bootstrap-Zustand direkt nach dem Deployment).
 */
function verifyAdminPassword(string $password): bool
{
    $hash = getSetting('admin_password_hash');
    if ($hash !== null) {
        return password_verify($password, $hash);
    }

    $envPassword = (string) (config()['admin_password'] ?? '');
    return $envPassword !== '' && hash_equals($envPassword, $password);
}

/**
 * Moderations-Passwort wird ausschliesslich vom Admin gesetzt (settings-
 * mod-password.php) - kein .env-Fallback, ohne gesetztes Passwort ist der
 * Moderations-Login schlicht gesperrt.
 */
function verifyModeratorPassword(string $password): bool
{
    $hash = getSetting('moderation_password_hash');
    return $hash !== null && password_verify($password, $hash);
}

/**
 * Einfacher Session-basierter Brute-Force-Schutz für die Login-Endpoints:
 * nach 5 Fehlversuchen wird für 30s gesperrt. Bewusst simpel (Session statt
 * IP-Tracking) - reicht, um ein Skript zu stoppen, das im Sekundentakt ein
 * kurzes Passwort durchprobiert; wer Cookies löscht, umgeht es zwar, das ist
 * für ein einmaliges Event-Tool aber ein vertretbarer Kompromiss gegenüber
 * einem eigenen IP-Sperrsystem.
 */
function checkLoginRateLimit(string $sessionKey): void
{
    startSession();
    $state = $_SESSION[$sessionKey] ?? ['attempts' => 0, 'locked_until' => 0];

    if ($state['locked_until'] > time()) {
        http_response_code(429);
        header('Content-Type: application/json');
        echo json_encode(['success' => false, 'message' => 'Zu viele Fehlversuche. Bitte kurz warten und erneut versuchen.']);
        exit;
    }
}

function registerLoginFailure(string $sessionKey): void
{
    startSession();
    $state = $_SESSION[$sessionKey] ?? ['attempts' => 0, 'locked_until' => 0];
    $state['attempts']++;
    if ($state['attempts'] >= 5) {
        $state['locked_until'] = time() + 30;
        $state['attempts'] = 0;
    }
    $_SESSION[$sessionKey] = $state;
}

function clearLoginFailures(string $sessionKey): void
{
    startSession();
    unset($_SESSION[$sessionKey]);
}

/**
 * Anonyme Voter-Identität fürs Song-Voting: kein Login, nur ein
 * zufälliger, per Cookie gehaltener Token (30 Tage) - reicht für ein
 * einmaliges Event, ist aber bewusst durch Cookie-Löschen umgehbar (kein
 * Personenbezug/keine IP-Bindung gewünscht).
 */
function getOrCreateVoterToken(): string
{
    $existing = $_COOKIE['voter_token'] ?? '';
    if (is_string($existing) && preg_match('/^[a-f0-9]{32}$/', $existing)) {
        return $existing;
    }

    $token = bin2hex(random_bytes(16));
    setcookie('voter_token', $token, [
        'expires' => time() + 60 * 60 * 24 * 30,
        'path' => '/',
        'httponly' => true,
        'samesite' => 'Lax',
    ]);
    $_COOKIE['voter_token'] = $token;

    return $token;
}

/**
 * Normalisiert Telefonnummern auf Schweizer Format "+41 79 123 45 67" -
 * Gäste tippen sonst z.B. "0791234455" (nationales Format ohne
 * Landesvorwahl) oder mit Bindestrichen/Schrägstrichen. Nummern mit einer
 * anderen Landesvorwahl (z.B. deutsche Nummern für Lörrach) werden anhand
 * der ITU-Landesvorwahl erkannt und ebenfalls sauber gruppiert
 * formatiert, statt nur als ein Ziffernblock stehen zu bleiben.
 */
function normalizeSwissPhone(string $raw): string
{
    $trimmed = trim($raw);
    if ($trimmed === '') {
        return $trimmed;
    }

    $hasPlus = $trimmed[0] === '+';
    $digits = preg_replace('/\D/', '', $raw);
    if ($digits === '') {
        return $raw;
    }

    if (!$hasPlus) {
        if (substr($digits, 0, 4) === '0041') {
            $digits = substr($digits, 2);
        } elseif (substr($digits, 0, 2) === '00') {
            $digits = substr($digits, 2);
        } elseif (substr($digits, 0, 1) === '0') {
            $digits = '41' . substr($digits, 1);
        } else {
            $digits = '41' . $digits;
        }
    }

    if (substr($digits, 0, 2) === '41' && strlen($digits) === 11) {
        return formatSwissPhone($digits);
    }

    return formatInternationalPhone($digits);
}

function formatSwissPhone(string $digits): string
{
    $rest = substr($digits, 2);
    return sprintf(
        '+41 %s %s %s %s',
        substr($rest, 0, 2),
        substr($rest, 2, 3),
        substr($rest, 5, 2),
        substr($rest, 7, 2)
    );
}

/**
 * Für +41-Nummern reicht die generische Zeichen-/Längenprüfung nicht: z.B.
 * "+41 79 123 44" hat gültige Zeichen und Länge, aber zu wenige Ziffern -
 * normalizeSwissPhone() formatiert das dann als generische Auslandsnummer
 * ("+41 79 12 344" statt "+41 79 123 44 67"), was wie eine echte CH-Nummer
 * aussieht, aber unvollständig ist. Deshalb bei +41 zusätzlich exakt das
 * "+41 XX XXX XX XX"-Format erzwingen. Bei anderen Landesvorwahlen bewusst
 * keine strengere Prüfung (unbekannte Formate nicht zu stark einschränken).
 */
function isValidPhoneFormat(string $formatted): bool
{
    if (substr($formatted, 0, 4) === '+41 ') {
        return (bool) preg_match('/^\+41 \d{2} \d{3} \d{2} \d{2}$/', $formatted);
    }
    return (bool) preg_match('/^\+?[0-9 \-\/]{6,20}$/', $formatted);
}

/**
 * Generische internationale Formatierung für Nicht-CH-Nummern: erkennt die
 * ITU-Landesvorwahl (1-3-stellig) und gruppiert die restlichen Ziffern in
 * lesbare 2er-Blöcke (letzter Block 3, statt eine einzelne Ziffer allein
 * stehen zu lassen). Ohne erkannte Landesvorwahl bleibt die Nummer als
 * unformatierter, aber von Sonderzeichen bereinigter Block stehen.
 */
function formatInternationalPhone(string $digits): string
{
    $countryCode = detectCountryCallingCode($digits);
    if ($countryCode === null) {
        return '+' . $digits;
    }

    $national = substr($digits, strlen($countryCode));
    $grouped = groupPhoneDigits($national);

    return '+' . $countryCode . ($grouped !== '' ? ' ' . $grouped : '');
}

function groupPhoneDigits(string $digits): string
{
    $len = strlen($digits);
    if ($len === 0) {
        return '';
    }

    $chunks = [];
    $i = 0;
    while ($len - $i >= 2) {
        if ($len - $i === 3) {
            $chunks[] = substr($digits, $i, 3);
            $i += 3;
            break;
        }
        $chunks[] = substr($digits, $i, 2);
        $i += 2;
    }
    if ($i < $len) {
        $chunks[] = substr($digits, $i);
    }

    return implode(' ', $chunks);
}

/**
 * ITU-T E.164 Landesvorwahlen, längste zuerst geprüft (3-, dann 2-, dann
 * 1-stellig) - so gibt es keine Überschneidung zwischen z.B. "49"
 * (Deutschland) und dreistelligen Vorwahlen aus anderen Zonen.
 */
function detectCountryCallingCode(string $digits): ?string
{
    static $len3 = null;
    static $len2 = null;
    static $len1 = null;

    if ($len3 === null) {
        $len3 = array_flip([
            '211', '212', '213', '216', '218', '220', '221', '222', '223', '224',
            '225', '226', '227', '228', '229', '230', '231', '232', '233', '234',
            '235', '236', '237', '238', '239', '240', '241', '242', '243', '244',
            '245', '246', '247', '248', '249', '250', '251', '252', '253', '254',
            '255', '256', '257', '258', '260', '261', '262', '263', '264', '265',
            '266', '267', '268', '269', '290', '291', '297', '298', '299',
            '350', '351', '352', '353', '354', '355', '356', '357', '358', '359',
            '370', '371', '372', '373', '374', '375', '376', '377', '378', '379',
            '380', '381', '382', '383', '385', '386', '387', '389',
            '420', '421', '423',
            '500', '501', '502', '503', '504', '505', '506', '507', '508', '509',
            '590', '591', '592', '593', '594', '595', '596', '597', '598', '599',
            '670', '672', '673', '674', '675', '676', '677', '678', '679',
            '680', '681', '682', '683', '685', '686', '687', '688', '689',
            '690', '691', '692',
            '850', '852', '853', '855', '856', '880', '886',
            '960', '961', '962', '963', '964', '965', '966', '967', '968', '970',
            '971', '972', '973', '974', '975', '976', '977',
            '992', '993', '994', '995', '996', '998',
        ]);
        $len2 = array_flip([
            '20', '27', '30', '31', '32', '33', '34', '36', '39', '40', '41',
            '43', '44', '45', '46', '47', '48', '49', '51', '52', '53', '54',
            '55', '56', '57', '58', '60', '61', '62', '63', '64', '65', '66',
            '81', '82', '84', '86', '90', '91', '92', '93', '94', '95', '98',
        ]);
        $len1 = array_flip(['1', '7']);
    }

    $p3 = substr($digits, 0, 3);
    if (strlen($p3) === 3 && isset($len3[$p3])) {
        return $p3;
    }
    $p2 = substr($digits, 0, 2);
    if (strlen($p2) === 2 && isset($len2[$p2])) {
        return $p2;
    }
    $p1 = substr($digits, 0, 1);
    if (isset($len1[$p1])) {
        return $p1;
    }

    return null;
}
