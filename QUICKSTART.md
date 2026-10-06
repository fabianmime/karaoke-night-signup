# 🚀 Quick Start

Kurzfassung - die vollständige Doku (Architektur, Datenbank, API,
Design-System, Wartung) steht im [README.md](./README.md).

## In 6 Schritten live

1. MySQL/MariaDB-Datenbank anlegen und `database.sql` ausführen.
2. `.env.example` nach `.env` kopieren und DB-Zugang + `ADMIN_PASSWORD`
   eintragen.
3. Dateien **flach** hochladen: Inhalt von `public/` direkt in den Webroot,
   alles andere (`lib/`, `scripts/`, `.env`, `.htaccess`, `config.php`,
   `database.sql`, `package.json`) daneben.
4. Sicherstellen, dass `uploads/` für PHP beschreibbar ist.
5. `/admin` öffnen, anmelden, Admin-Passwort ändern und unter
   **Einstellungen → Branding** Logo, Event-Name, Untertitel und optional
   ein Display-Banner setzen.
6. Songkatalog importieren: Einstellungen → "Songkatalog verwalten" →
   "Katalog aktualisieren" → KaraFun-CSV wählen → Importieren.

Optional: Moderations-Passwort setzen (Einstellungen → Moderations-Zugang),
API-Key fürs Companion-Modul erzeugen, `STATS_PASSWORD` für `/stats`.

## Der wichtigste Ablauf: Status-Workflow

Neue Anmeldungen sind zuerst nur **"Angemeldet"** - unsichtbar für Gäste
und Moderation. Erst **"Genehmigt"** (oder "Singt") lässt den Song auf dem
Display und in der Moderations-Liste erscheinen. Admin sieht immer alles.
Details siehe README → "Status-Workflow".

## Katalog per SSH statt im Browser

```bash
cd <webroot>
npm install
npm run import <dateiname>.csv
# danach node_modules/.htaccess wieder anlegen (siehe README) und die
# CSV-Datei wieder vom Server löschen
```

Aktuelles KaraFun-Format ist **semikolon-getrennt**
(`Id;Title;Artist;Year;Duo;Explicit;Date Added;Styles;Languages`) - falls
KaraFun das Format wieder ändert, betrifft das sowohl
`scripts/import-karafun.js` als auch `public/api/songs-import.php`.
