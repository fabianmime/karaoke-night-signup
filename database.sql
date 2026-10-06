-- Läuft gegen eine bereits bestehende Datenbank (z.B. cyon-Hosting: die DB
-- wird dort vorab im Kundencenter angelegt, der DB-User hat kein CREATE
-- DATABASE-Recht) - vor dem Ausführen also mit der Ziel-DB verbinden/sie
-- auswählen, z.B.: mysql -u <user> -p <db-name> < database.sql

-- Tabelle für KaraFun Songs
CREATE TABLE IF NOT EXISTS songs (
  id INT AUTO_INCREMENT PRIMARY KEY,
  karafun_id VARCHAR(50) UNIQUE,
  title VARCHAR(255) NOT NULL,
  artist VARCHAR(255) NOT NULL,
  genre VARCHAR(100),
  year INT,
  language VARCHAR(50),
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_title (title),
  INDEX idx_artist (artist),
  INDEX idx_genre (genre)
);

-- Tabelle für Song-Anmeldungen
CREATE TABLE IF NOT EXISTS queue_entries (
  id INT AUTO_INCREMENT PRIMARY KEY,
  song_id INT NOT NULL,
  first_name VARCHAR(100) NOT NULL,
  last_name VARCHAR(100) NOT NULL,
  phone VARCHAR(20) NOT NULL,
  email VARCHAR(255) NOT NULL,
  status ENUM('pending', 'playing', 'completed', 'cancelled') DEFAULT 'pending',
  position INT,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (song_id) REFERENCES songs(id) ON DELETE CASCADE,
  INDEX idx_status (status),
  INDEX idx_position (position)
);

-- Admin-Benutzer (optional für zukünftige Erweiterungen)
CREATE TABLE IF NOT EXISTS admins (
  id INT AUTO_INCREMENT PRIMARY KEY,
  username VARCHAR(100) UNIQUE NOT NULL,
  password_hash VARCHAR(255) NOT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Laufzeit-Einstellungen (Admin-/Moderations-Passwort-Hash, Anmeldesperre,
-- Display-Mitteilung) - bewusst in der DB statt in .env, damit sie sich übers
-- Admin-Panel ändern lassen, ohne die Datei auf dem Server anzufassen.
CREATE TABLE IF NOT EXISTS settings (
  `key` VARCHAR(64) PRIMARY KEY,
  value TEXT
);

-- Migrationen (MariaDB-Erweiterung "ADD COLUMN IF NOT EXISTS" - cyon läuft
-- MariaDB 10.6, darum hier bewusst statt eines separaten Migrationssystems).
ALTER TABLE songs ADD COLUMN IF NOT EXISTS duo TINYINT(1) NOT NULL DEFAULT 0;
ALTER TABLE queue_entries ADD COLUMN IF NOT EXISTS duet_first_name VARCHAR(100) NULL AFTER email;
ALTER TABLE queue_entries ADD COLUMN IF NOT EXISTS duet_last_name VARCHAR(100) NULL AFTER duet_first_name;
ALTER TABLE queue_entries ADD COLUMN IF NOT EXISTS comment TEXT NULL;

-- Neuer Status "approved" (Genehmigt) zwischen "pending" (Angemeldet) und
-- "playing" (Singt): erst ab hier erscheint der Song auf dem öffentlichen
-- Display - Admin/Moderation sehen weiterhin auch "pending".
ALTER TABLE queue_entries MODIFY COLUMN status
  ENUM('pending', 'approved', 'playing', 'completed', 'cancelled') DEFAULT 'pending';

-- Voting: Gäste können ohne Login bis zu 3 Stimmen auf genehmigte Songs
-- vergeben (anonym - kein Bezug zur Sängerin/zum Sänger). Die Stimme hängt
-- am konkreten Warteschlangen-Eintrag (nicht am Song), damit eine spätere
-- Neuanmeldung desselben Songs nicht alte Stimmen erbt. "voter_token" ist
-- ein zufälliger, per Cookie gehaltener Bezeichner ohne Login/Personenbezug.
CREATE TABLE IF NOT EXISTS votes (
  id INT AUTO_INCREMENT PRIMARY KEY,
  queue_entry_id INT NOT NULL,
  voter_token VARCHAR(32) NOT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (queue_entry_id) REFERENCES queue_entries(id) ON DELETE CASCADE,
  INDEX idx_queue_entry (queue_entry_id),
  INDEX idx_voter (voter_token)
);

-- Inhalts-Filter: einzelne Songs im Katalog als "zu prüfen" (Hinweis, aber
-- Anmeldung bleibt möglich) oder "gesperrt" (Anmeldung wird abgelehnt)
-- markieren, z.B. wegen vulgärer Sprache oder anstössigem Bandhintergrund.
-- Bewusst freier Text statt eines eigenen Kategorien-Tabellensystems - bei
-- diesem Umfang (einzelne Songs aus einem 89k-Katalog) reicht das und
-- bleibt jederzeit ohne Schema-Änderung erweiterbar/durchsuchbar.
ALTER TABLE songs ADD COLUMN IF NOT EXISTS filter_status
  ENUM('none', 'review', 'blocked') NOT NULL DEFAULT 'none';
ALTER TABLE songs ADD COLUMN IF NOT EXISTS filter_reason VARCHAR(255) NULL;
ALTER TABLE songs ADD INDEX IF NOT EXISTS idx_filter_status (filter_status);

-- KaraFun liefert pro Song ein "Explicit"-Flag mit (vulgäre Sprache etc.) -
-- wird beim Import übernommen und automatisch auf "review" (Prüfen) gemappt
-- (siehe songs-import.php/import-karafun.js), damit nicht der ganze
-- 89k-Katalog manuell durchsucht werden muss. Nur eine erste, grobe
-- Vorsortierung - bereits manuell gesetzter filter_status (!= 'none') wird
-- beim (Re-)Import nie überschrieben.
ALTER TABLE songs ADD COLUMN IF NOT EXISTS explicit TINYINT(1) NOT NULL DEFAULT 0;

-- Statistik: bewusst eigene, nur angehängte (append-only) Tabellen statt
-- Auswertung direkt auf queue_entries/votes - der Admin löscht dort im
-- Betrieb Verlauf/Stimmen/alles (queue-clear-history.php, votes-reset.php,
-- queue-delete-all.php), die Statistik soll davon unberührt bleiben. Darum
-- auch keine FOREIGN KEYs (sonst würden Löschungen per CASCADE mitlaufen)
-- und song_label als Momentaufnahme "Interpret – Titel".
-- Komplett anonym: keine IP, kein roher User-Agent, keine Namen/Kontakte -
-- visitor_id ist ein zufälliger Cookie-Wert (stats_vid), voter_hash ein
-- gekürzter SHA-256 des Voting-Tokens (nur zum Zählen verschiedener Voter).
CREATE TABLE IF NOT EXISTS stats_events (
  id BIGINT AUTO_INCREMENT PRIMARY KEY,
  event_type VARCHAR(32) NOT NULL,
  visitor_id CHAR(32) NULL,
  term VARCHAR(100) NULL,
  result_count INT NULL,
  song_id INT NULL,
  queue_entry_id INT NULL,
  song_label VARCHAR(255) NULL,
  detail VARCHAR(64) NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_type_time (event_type, created_at),
  INDEX idx_time (created_at),
  INDEX idx_visitor (visitor_id),
  INDEX idx_entry (queue_entry_id)
);

-- Ein Eintrag pro Seitenaufruf (visit_id wird pro Laden im Browser
-- gewürfelt), last_seen wird per Heartbeat (alle 30s, nur solange der Tab
-- sichtbar ist) nachgeführt - daraus "gerade online" und Verweildauer.
CREATE TABLE IF NOT EXISTS stats_visits (
  id BIGINT AUTO_INCREMENT PRIMARY KEY,
  visit_id CHAR(32) NOT NULL UNIQUE,
  visitor_id CHAR(32) NOT NULL,
  page VARCHAR(20) NOT NULL,
  is_new_visitor TINYINT(1) NOT NULL DEFAULT 0,
  device VARCHAR(16) NULL,
  os VARCHAR(16) NULL,
  browser VARCHAR(16) NULL,
  source VARCHAR(20) NULL,
  started_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  last_seen TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_page_started (page, started_at),
  INDEX idx_last_seen (last_seen),
  INDEX idx_visitor (visitor_id)
);

-- Einmalige Übernahme bereits vorhandener Anmeldungen/Stimmen (vor Einführung
-- der Statistik) - idempotent, mehrfaches Ausführen erzeugt keine Duplikate.
-- Wartezeiten/Statuswechsel lassen sich rückwirkend nicht rekonstruieren.
-- X'20E2809320' = " – " (Gedankenstrich) als Byte-Literal, damit das Label auch
-- dann stimmt, wenn der SQL-Client die Datei nicht als UTF-8 einliest.
INSERT INTO stats_events (event_type, song_id, queue_entry_id, song_label, detail, created_at)
SELECT 'registration', q.song_id, q.id, CONCAT(s.artist, _utf8mb4 X'20E2809320', s.title),
       IF(q.duet_first_name IS NULL OR q.duet_first_name = '', 'solo', 'duo'), q.created_at
FROM queue_entries q
JOIN songs s ON s.id = q.song_id
WHERE NOT EXISTS (
  SELECT 1 FROM stats_events e WHERE e.event_type = 'registration' AND e.queue_entry_id = q.id
);

INSERT INTO stats_events (event_type, song_id, queue_entry_id, song_label, detail, created_at)
SELECT 'vote', q.song_id, v.queue_entry_id, CONCAT(s.artist, _utf8mb4 X'20E2809320', s.title),
       LEFT(SHA2(v.voter_token, 256), 16), v.created_at
FROM votes v
JOIN queue_entries q ON q.id = v.queue_entry_id
JOIN songs s ON s.id = q.song_id
WHERE NOT EXISTS (SELECT 1 FROM stats_events e WHERE e.event_type = 'vote');
