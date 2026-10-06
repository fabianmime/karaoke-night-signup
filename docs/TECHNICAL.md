# 🎤 Karaoke Night – Technische Dokumentation

> Überblick, Screenshots und Schnellinstallation: siehe [README](../README.md).


Karaoke-Anmeldesystem für Event-Abende: Gäste suchen per Handy einen Song
und melden sich an, ein Admin-Panel verwaltet die Warteschlange, eine
Moderations-Ansicht zeigt dem Ansager aktuellen/nächste Sänger, ein
öffentliches Display zeigt die Warteschlange auf einem grossen Bildschirm.
Logo, Event-Name und Display-Banner werden im Admin-Panel gesetzt - die App
enthält kein fixes Veranstalter-Branding.

**Backend: PHP + MySQL/MariaDB**, läuft auf einfachem Shared-Webhosting
(entwickelt und im Einsatz auf cyon "Single"). Kein Node-Server nötig: nur
der optionale KaraFun-CSV-Import per SSH ist ein Node-Skript, das einmal
durchläuft und beendet - der Import geht aber auch direkt im Admin-Panel.

## Die Seiten

| Seite | URL | Zugang | Für wen |
|---|---|---|---|
| Anmeldung | `/` | Öffentlich | Gäste (Handy) |
| Display | `/display` | Öffentlich | Beamer/TV im Saal |
| Admin | `/admin` | Admin-Passwort | Team/Technik |
| Moderation | `/moderation` | eigenes Moderations-Passwort | Ansager/in |
| Statistik | `/stats` | eigenes Statistik-Passwort (kein Admin-Zugang) | Auswertung |

`/admin`, `/display`, `/moderation` sind saubere URLs (per `.htaccess`
intern auf die jeweilige `.html` umgeschrieben, kein Redirect). Ein
eingeloggter Admin sieht auch die Moderations-Ansicht ohne zweiten Login
(`requireModerator()` akzeptiert auch eine Admin-Session) - umgekehrt hat
ein Moderator keinen Admin-Zugriff. Die Statistik ist bewusst **komplett
getrennt**: eine Admin-Session öffnet `/stats` nicht, und ein
Statistik-Login gibt keinerlei Admin-Rechte (siehe Abschnitt
"Statistik").

Alle Seiten sind per "Zum Home-Bildschirm hinzufügen" installierbar
(App-Namen "Karaoke", "Karaoke MOD", "Karaoke STATS" via
`apple-mobile-web-app-title`/`application-name`).

## Installation

1. **Datenbank** anlegen (MySQL/MariaDB, `utf8mb4`) und `database.sql`
   einmal ausführen - legt alle Tabellen an und ist idempotent (kann bei
   Updates erneut laufen, enthält die Migrationen).
2. **`.env`** aus `.env.example` erstellen und ausfüllen
   (`DB_HOST`, `DB_USER`, `DB_PASSWORD`, `DB_NAME`, `ADMIN_PASSWORD` als
   Bootstrap-Passwort, optional `STATS_PASSWORD`).
3. **Hochladen - flach**, siehe "Projektstruktur & Deployment": Inhalt von
   `public/` direkt in den Webroot, `lib/`, `scripts/`, `.env`,
   `.htaccess`, `config.php`, `database.sql`, `package.json` daneben.
4. Der Ordner **`uploads/`** (aus `public/uploads/`, inkl. `.htaccess`) muss
   für PHP beschreibbar sein - dort landen Logo und Banner aus dem Admin.
5. `/admin` öffnen, mit `ADMIN_PASSWORD` anmelden, Passwort unter
   Einstellungen ändern, dann unter **Einstellungen → Branding** Logo,
   Event-Name, Untertitel und optional ein Display-Banner setzen.
6. Songkatalog importieren: Einstellungen → "Songkatalog verwalten" →
   KaraFun-CSV hochladen (oder Songs einzeln erfassen).

## Architektur

```text
Browser (statische Seiten + js/*.js)
        |
        v
public/api/*.php   (flache Endpoints, ein File pro Aktion, kein Router)
        |
        v
lib/db.php         (PDO-Verbindung, Session, Settings-Helper, Passwort-Hashing)
lib/branding.php   (Logo-/Banner-Upload: erlaubte Typen, Ablage in uploads/)
        |
        v
config.php         (liest .env - Host/User/Passwort/DB-Name/Admin-Bootstrap-PW)
        |
        v
MySQL/MariaDB
```

## Projektstruktur & Deployment

Kompletter Inhalt von `karaoke-app/` geht aufs Hosting - viele
Shared-Hostings (z.B. cyon Single) haben **keinen** von aussen
unerreichbaren Ordner "eine Ebene über dem Webroot". Sensible Dateien
liegen deshalb im selben Ordner wie die Webseite, aber per `.htaccess`
sauber gesperrt:

```text
karaoke-app/  (= Repo-Wurzel)
├── .htaccess          # sperrt .env/config.php/database.sql/package*.json,
│                       # kein Cache auf html/js/css, saubere URLs /admin
│                       # /display /moderation
├── .env.example        # Vorlage für .env (DB- und Bootstrap-Zugangsdaten, gesperrt)
├── README.md / LICENSE  # Repo-Doku, wird auf dem Server nicht gebraucht
├── docs/               # TECHNICAL.md + screenshots/ (nicht hochladen)
├── config.php           # liest .env (gesperrt)
├── database.sql          # Schema + Migrationen, nur fürs Setup (gesperrt)
├── package.json            # Abhängigkeiten NUR fürs Import-Skript (gesperrt)
├── lib/
│   ├── .htaccess              # sperrt den ganzen Ordner
│   ├── db.php                  # PDO/Session/Settings/Passwort-Helper
│   ├── branding.php            # Logo/Banner: Typen, Grössenlimits, Upload-Ordner
│   └── stats.php               # Statistik: Logging, requireStats(), Geräte-Erkennung
├── scripts/
│   ├── .htaccess              # sperrt den ganzen Ordner
│   └── import-karafun.js       # KaraFun-CSV-Import, läuft via SSH (node)
├── node_modules/                # von `npm install` erzeugt, NICHT in Git -
│   └── .htaccess                 # nach Neuinstallation manuell wieder anlegen!
└── public/                       # <- das hier ist effektiv der Web-Ordner
    ├── index.html                 # Anmeldung
    ├── admin.html                  # Admin-Panel
    ├── display.html                 # Public Display
    ├── moderation.html               # Moderations-Ansicht
    ├── stats.html                    # Statistik (eigener Login)
    ├── img/                            # neutrales Default-Logo, Favicon, App-Icon
    ├── uploads/                        # Logo/Banner aus dem Admin (nur .htaccess in Git)
    ├── css/
    │   ├── style.css                    # Anmeldung + Display
    │   ├── admin.css                     # Admin + Moderation + Statistik
    │   └── moderation.css                 # Moderation-spezifische Layout-Details
    ├── js/
    │   ├── branding.js                     # Logo/Event-Texte aus den Settings (alle Seiten)
    │   ├── guest.js / display.js / admin.js / moderation.js
    │   ├── track.js                        # anonyme Erfassung (vor dem Seiten-Skript geladen)
    │   └── stats.js                        # Statistik-Ansicht
    └── api/                                # PHP-Endpoints, siehe Tabelle unten
```

Die Serverstruktur ist **flach**: der Inhalt von lokal `public/` (also
`index.html`, `admin.html`, `css/`, `js/`, `api/`, `uploads/`, ...) liegt
auf dem Server **direkt im Webroot ohne den Ordner "public"**, während
`lib/`, `database.sql`, `config.php`, `.env` und `.htaccess` genauso wie
lokal auf oberster Ebene liegen (sichtbar z.B. an der `.htaccess`-Regel
`RewriteRule ^admin/?$ admin.html`, die nur ohne ein zusätzliches
`public/`-Präfix aufgeht, und an `require __DIR__ . '/../lib/db.php'` in
`public/api/*.php`, was nur mit dieser flachen Struktur auf `lib/db.php`
zeigt). Beim Hochladen also **`public/<rest>` → `<webroot>/<rest>`**
(den Ordnernamen "public" weglassen), alles andere 1:1.

**`node_modules/.htaccess` nach jeder Neuinstallation wieder anlegen**
(z.B. nach `npm install` für einen erneuten Katalog-Import):

```bash
cat > node_modules/.htaccess << 'EOF'
<IfModule mod_authz_core.c>
    Require all denied
</IfModule>
<IfModule !mod_authz_core.c>
    Order allow,deny
    Deny from all
</IfModule>
EOF
```

**Cache:** `.htaccess` setzt `Cache-Control: no-cache, must-revalidate` auf
alle `.html`/`.js`/`.css` - ein Hosting-Standard von 7 Tagen hat sonst dazu
geführt, dass Browser nach einem Deploy tagelang eine veraltete Version
weiterbenutzt haben, obwohl der Server längst aktualisiert war.

## Datenbank

Fünf Tabellen, siehe `database.sql` (idempotent: `CREATE TABLE IF NOT
EXISTS` + `ADD COLUMN IF NOT EXISTS`-Migrationen, MariaDB-Erweiterung -
kann jederzeit gefahrlos erneut ausgeführt werden).

**`songs`** - KaraFun-Katalog (aktuell 89'253 Einträge)
| Spalte | Bedeutung |
|---|---|
| `karafun_id` | eindeutige KaraFun-ID, `NULL` bei manuell hinzugefügten Songs |
| `title`, `artist`, `genre`, `year`, `language` | aus dem KaraFun-Export bzw. manueller Eingabe |
| `duo` | `1` = Duett-Song, steuert das Duett-Partner-Feld auf der Anmeldung |
| `explicit` | `1` = von KaraFun als "Explicit" markiert (übernommen aus der CSV-Spalte gleichen Namens) - steuert nur die automatische Erst-Einstufung beim Import, siehe `songs-import.php` |
| `filter_status` | `none`/`review`/`blocked` - Inhalts-Filter, siehe Abschnitt "Content-Filter" unten |
| `filter_reason` | freier Text (z.B. "vulgäre Sprache"), nur relevant wenn `filter_status != none` |

**`queue_entries`** - Anmeldungen
| Spalte | Bedeutung |
|---|---|
| `song_id` | FK auf `songs`, `ON DELETE CASCADE` |
| `first_name`, `last_name`, `phone`, `email` | Kontaktdaten der/des Anmeldenden - `phone` liegt immer normalisiert vor (siehe "Bekannte Eigenheiten") |
| `duet_first_name`, `duet_last_name` | nur bei Duett-Songs gefüllt |
| `comment` | "Information/Bemerkung für die Moderation", optional - im Admin über das Stift-Icon und in der Moderation über "✎ Bearbeiten"/"+" editierbar, speichert automatisch 700ms nach dem letzten Tastendruck (Moderation zusätzlich mit "Fertig"-Button zum Schliessen) |
| `status` | `pending` → `approved` → `playing` → `completed`/`cancelled` (siehe unten) |
| `position` | Reihenfolge in der Warteschlange, per Drag & Drop änderbar |

**`settings`** - Key-Value-Laufzeit-Einstellungen (siehe Tabelle weiter unten)

**`votes`** - Voting-Stimmen (siehe Abschnitt "Voting" unten)
| Spalte | Bedeutung |
|---|---|
| `queue_entry_id` | FK auf `queue_entries`, `ON DELETE CASCADE` - Stimme hängt am konkreten Warteschlangen-Eintrag, nicht am Song (eine spätere Neuanmeldung desselben Songs startet bei 0 Stimmen) |
| `voter_token` | zufälliger, per Cookie gehaltener Bezeichner - kein Login, kein Personenbezug |

### Song-Sperre nach Anmeldung

Ein Song kann nur **einmal aktiv oder fertig** angemeldet sein: `queue-add.php`
lehnt eine erneute Anmeldung (HTTP 409) ab, solange irgendein
`queue_entries`-Eintrag zu diesem Song `pending`/`approved`/`playing`/
`completed` ist. **Nur `cancelled` gibt den Song wieder frei.** Die
Gäste-Suche zeigt solche Songs weiterhin an (mit Hinweis "bereits
angemeldet"), blockt aber die Auswahl mit einer Meldung statt sie einfach
auszublenden - sonst wäre für Gäste nicht nachvollziehbar, warum ein
gesuchter Song "fehlt".

### Voting

Gäste können ohne Login auf der Startseite (`/` → Button "Song voten")
bis zu **3 Stimmen** auf bereits genehmigte Songs (`approved`/`playing`,
dieselbe Liste wie das Display) vergeben - anonym, ohne Sänger-Angabe.
Die 3 Stimmen dürfen auf einen einzelnen Song oder verteilt auf mehrere
gehen. Kein Login/keine IP-Bindung, nur ein zufälliger `voter_token`-Cookie
(30 Tage, siehe `getOrCreateVoterToken()` in `lib/db.php`) - bewusst
einfach und für ein einmaliges Event ausreichend, aber per Cookie-Löschen
umgehbar. Stimmen sind im Admin-Panel immer sichtbar (🗳️-Badge je
Warteschlangen-Eintrag); ob sie zusätzlich auf dem öffentlichen Display
erscheinen, steuert das Setting `show_votes_on_display` (Default aus).

Eine Stimme ist **nicht final**: solange der Song noch `approved` ist
(also noch nicht dran war), lässt sich eine eigene Stimme über den
"−"-Button wieder zurücknehmen (`votes-remove.php`, entfernt genau eine
Stimme dieses `voter_token` für den Song). Sobald der Song auf `playing`
wechselt, ist die Stimme final - der "−"-Button ist dann deaktiviert und
die Karte zeigt "(singt gerade)".

### Content-Filter (Gesperrt / Prüfen)

Admin → Tab "Filter": einzelne Songs im Katalog markieren, z.B. wegen
vulgärer Sprache oder anstössigem Bandhintergrund. Zwei Stufen
(`songs.filter_status`), bewusst mit unterschiedlicher Wirkung:

- **`blocked`** ("Gesperrt") - `queue-add.php` lehnt die Anmeldung mit
  HTTP 403 und der Meldung "Dieser Song ist durch die Moderation
  gesperrt." ab. Die Gäste-Suche zeigt den Song weiterhin (mit Hinweis
  "gesperrt"), damit nicht der Eindruck entsteht, die Suche sei defekt -
  der Block passiert erst beim Anklicken/Anmelden, wie beim
  "bereits angemeldet"-Fall.
- **`review`** ("Prüfen") - keine Auswirkung auf die Gäste-Seite, rein
  informativ. Taucht der Song trotzdem in der Warteschlange auf, zeigt
  die Admin-Karte einen ⚠️-Badge mit dem Grund als Tooltip.
- **`none`** (Default) - unauffällig, keine Einschränkung.

Der Grund (`filter_reason`) ist bewusst **freier Text** statt eines
eigenen Kategorien-Tabellensystems mit fixen Tags - bei diesem Umfang
(einzelne Songs aus einem 89'253-Song-Katalog, kein Multi-User-Redaktions-
team) reicht das, bleibt aber jederzeit durchsuchbar und ohne
Schema-Änderung erweiterbar. Der Filter-Tab durchsucht **den ganzen
Katalog** unabhängig vom aktuellen Status (`filter-search.php?query=`),
damit auch bisher unauffällige Songs gefunden und markiert werden können;
zusätzlich gibt es dort zwei Übersichtslisten ("Aktuell gesperrt"/"Aktuell
zu prüfen", `filter-search.php?status=blocked|review`) für die schnelle
Nachkontrolle, ohne jeden Song erneut suchen zu müssen. `filter-set.php`
setzt Status+Grund; Status `none` löscht den Grund automatisch mit.

**Wichtig:** Wird ein Song erst **nachträglich** gesperrt, nachdem er
schon angemeldet wurde, bleibt der bestehende Warteschlangen-Eintrag
unverändert (keine automatische Stornierung) - er bekommt aber sofort den
🚫-Badge in der Admin-Karte, damit der Admin ihn bewusst manuell
stornieren kann, statt dass er unbemerkt durchläuft.

### Status-Workflow (wichtig!)

```text
pending (Angemeldet) → approved (Genehmigt) → playing (Singt) → completed (Fertig)
                                                              ↘ cancelled (Storniert)
```

- Neue Anmeldungen starten immer als **`pending`** ("Angemeldet").
- **Erst ab `approved` ("Genehmigt") oder `playing` ("Singt") erscheint der
  Song auf dem öffentlichen Display UND in der Moderations-"Als
  Nächstes"-Liste.** `pending` ist bewusst nur im Admin sichtbar - so kann
  offensichtlicher Unsinn/Spam aussortiert werden, bevor er öffentlich
  auftaucht.
- Admin sieht **immer alle** aktiven Stati (`pending`, `approved`,
  `playing`) in der Warteschlange - volle Übersicht bleibt erhalten.
- `cancelled` braucht im Admin eine explizite Bestätigung direkt in der
  Karte (kein Browser-Popup) - versehentliches Stornieren während eines
  Auftritts wäre sonst zu leicht.
- `completed`/`cancelled` landen im **Verlauf** (eigener, einklappbarer
  Bereich unter der Warteschlange) und werden **nie automatisch gelöscht**.
  Von dort per Klick auch wieder zurück in die Warteschlange (`pending`)
  holbar, z.B. falls versehentlich auf "Fertig" geklickt wurde.
  Endgültiges Löschen geht nur über Einstellungen → "Verlauf löschen"
  (mit Bestätigung).

## Settings (Tabelle `settings`, key/value)

| Key | Wert | Bedeutung |
|---|---|---|
| `admin_password_hash` | bcrypt-Hash | Admin-Passwort, überschreibt `.env`-Bootstrap-Wert sobald einmal übers Panel geändert |
| `moderation_password_hash` | bcrypt-Hash | Moderations-Passwort, nur vom Admin setzbar, kein `.env`-Fallback (ohne gesetztes Passwort ist der Moderations-Login gesperrt) |
| `registration_locked` | `'1'`/`'0'` | sperrt `queue-add.php` (HTTP 423) und blendet auf der Anmeldeseite sofort das Formular gegen einen Hinweis aus (Polling alle 4s, bricht auch eine gerade laufende Anmeldung ab) |
| `voting_locked` | `'1'`/`'0'` | sperrt `votes-add.php` (HTTP 423, **nicht** `votes-remove.php` - Zurücknehmen bleibt möglich) und zeigt auf der Voting-Ansicht sofort einen Hinweis statt der Liste (gleiches Polling-Muster wie `registration_locked`, unabhängig davon) |
| `announcement` | Text | Banner auf Display **und** Anmeldeseite (z.B. "Pause bis 21 Uhr") |
| `banner_mode` | `'1'`/`'0'` | blendet auf dem Display die Warteschlange komplett aus und zeigt stattdessen den Banner im Vollbild (hochgeladenes Banner-Bild oder automatisch aus Logo + Event-Texten) - Umschalter ist das Augen-Icon oben in der Admin-Navigation |
| `footer_html` | HTML | kleiner Credit-Footer unten auf allen vier Seiten, Default siehe `defaultFooterHtml()` in `lib/db.php` |
| `show_votes_on_display` | `'1'`/`'0'` | zeigt die Voting-Stimmenzahl zusätzlich auf dem öffentlichen Display an (im Admin-Panel immer sichtbar, unabhängig von diesem Setting) - Default aus |
| `control_api_key` | 40-stelliger Hex-String | Maschinen-Auth fürs Companion-Modul (siehe Abschnitt "Companion-Modul" unten) - leer bis im Admin unter Einstellungen → "Companion-Modul" einmal "Neu generieren" geklickt wurde, danach dort jederzeit einsehbar/erneuerbar |
| `brand_logo_url` | URL (`/uploads/logo-<hex>.<ext>`) | eigenes Logo für alle Seiten, gesetzt über `branding-upload.php`. Leer = neutrales `img/default-logo.svg` |
| `brand_banner_url` | URL (`/uploads/banner-<hex>.<ext>`) | eigenes Vollbild-Banner fürs Display. Leer = Banner wird aus Logo, Event-Name und Untertitel zusammengesetzt |
| `event_name` | Text (max. 60) | Event-Name, steht klein über "Karaoke Night", im Seitentitel und als "<Event-Name> Karaoke" in den Login-Masken. Leer = ausgeblendet |
| `event_subtitle` | Text (max. 100) | Untertitel/Ort unter "Karaoke Night" (Anmeldung + Banner). Leer = ausgeblendet |
| `stats_password_hash` | bcrypt-Hash | Passwort der Statistik-Ansicht `/stats`, überschreibt `STATS_PASSWORD` aus `.env`. Nur in `/stats` → ⚙ änderbar, bewusst **nicht** übers Admin-Panel (siehe Abschnitt "Statistik") |

Alle Settings haben einen Code-Default (`getSetting($key, $default)`) -
die Tabelle muss nicht vorbefüllt sein, leere/fehlende Keys fallen sauber
auf den Default zurück.

## API-Referenz (`public/api/*.php`)

**Öffentlich (kein Login):**
| Endpoint | Methode | Zweck |
|---|---|---|
| `songs-search.php?query=&limit=` | GET | Song-Suche (Gäste), normalisiert "intelligente" Anführungszeichen von Smartphone-Tastaturen, liefert `registered`- und `blocked`-Flag (nicht `filter_status`/`review` - das bleibt intern) |
| `songs-get.php?id=` | GET | einzelner Song |
| `songs-all.php?page=&limit=` | GET | paginierte Liste + `total` (Katalog-Zähler im Admin) |
| `queue-add.php` | POST | Anmeldung erstellen (`song_id, first_name, last_name, phone, email, comment?, duet_first_name?, duet_last_name?`) - prüft `registration_locked`, validiert bei `+41`-Nummern das exakte Format `+41 XX XXX XX XX` (`isValidPhoneFormat()` in `lib/db.php`, andere Landesvorwahlen bleiben locker geprüft), prüft bei Duett-Songs die Partner-Pflichtfelder serverseitig nach, lehnt bereits aktiv/fertig angemeldete Songs mit HTTP 409 und gesperrte Songs (`filter_status = blocked`) mit HTTP 403 ab |
| `queue-current.php` | GET | Warteschlange für Display (`status IN (approved, playing)`), inkl. `votes`-Zähler je Eintrag |
| `settings-public.php` | GET | `registration_locked`, `voting_locked`, `announcement`, `banner_mode`, `footer_html`, `show_votes_on_display` + Branding: `logo_url` (immer gesetzt, Default-Logo als Fallback), `banner_url`, `event_name`, `event_subtitle` |
| `votes-queue.php` | GET | genehmigte/singende Songs zum Voten (nur `title`/`artist`/`votes`/`status`, keine Sänger-Angabe), sortiert nach `(status = completed) DESC, votes DESC, created_at DESC` (bereits fertig gesungene Songs mit eigener Stimme ganz oben, sonst höchste Stimmenzahl zuoberst, bei Gleichstand zuletzt Angemeldete zuoberst - unabhängig von der Admin-`position`). Fertig gesungene Songs erscheinen **nur**, wenn die/der Anfragende (`voter_token`) selbst dafür gevotet hat, sonst würde die Liste über den Abend hinweg immer länger - Frontend zeigt sie dezent ohne Buttons ("Du hast X Stimmen vergeben"). + eigene Stimmen je Song (`my_votes`) + eigene verbleibende Stimmen (Cookie `voter_token`) |
| `votes-add.php` | POST `{queue_entry_id}` | Stimme abgeben - prüft `voting_locked` (423), lehnt ab, wenn schon 3 Stimmen verbraucht (409) oder der Song nicht `approved`/`playing` ist (404) |
| `stats-track.php` | POST | anonyme Statistik-Erfassung aus `js/track.js` (`pageview`, `heartbeat`, `search`, Klickpfad-Ereignisse). Anmeldungen/Stimmen/Statuswechsel sind hier nicht annehmbar, die erfassen die jeweiligen Endpoints serverseitig. Übrige Statistik-Endpoints siehe Abschnitt "Statistik" |
| `votes-remove.php` | POST `{queue_entry_id}` | eigene Stimme zurücknehmen - nur solange der Song noch `approved` ist (409 sobald `playing` oder später), 404 falls keine eigene Stimme vorhanden |

**Admin (`requireAdmin()`, Session-Cookie):**
| Endpoint | Methode | Zweck |
|---|---|---|
| `auth-login.php` / `auth-logout.php` / `auth-check.php` | POST/POST/GET | Login-Flow |
| `queue-admin-all.php` | GET | alle aktiven Einträge (`pending`, `approved`, `playing`) inkl. Kontaktdaten/Kommentar/`votes`-Zähler/`filter_status`+`filter_reason` |
| `queue-status.php?id=` | PATCH `{status}` | Status ändern - setzt der Admin ihn auf `playing`, schiebt `admin.js` den Eintrag zusätzlich per `queue-reorder.php` auf Position 1 |
| `filter-search.php?query=&status=&limit=` | GET | Katalog nach Titel/Interpret durchsuchen (`query`) und/oder nach Filter-Status listen (`status`, kommasepariert, z.B. `blocked,review`) - mindestens eines der beiden ist Pflicht |
| `filter-set.php` | POST `{song_id, filter_status, filter_reason?}` | Filter-Status/-Grund eines einzelnen Songs setzen - `filter_status = none` löscht `filter_reason` automatisch mit; das Grund-Feld im Filter-Tab speichert automatisch 700ms nach dem letzten Tastendruck, auch ohne Klick auf einen Status-Button |
| `filter-bulk-set.php` | POST `{artists:[name,...], filter_status, filter_reason?}` | Setzt denselben Filter-Status/-Grund für **alle** Songs mehrerer Interpreten auf einmal (Admin-Tab "Filter" → "Bands sammelweise markieren") - bei `review`/`blocked` bleiben bereits manuell klassifizierte Songs (`filter_status != none`) unangetastet, `none` überschreibt dagegen bewusst auch bestehende Markierungen (gezieltes Rückgängigmachen); Antwort listet `not_found` (Bandnamen ohne Treffer, exakter String-Vergleich) |
| `queue-reorder.php` | POST `{order:[id,...]}` | Drag&Drop-Reihenfolge speichern - holt zusätzlich alle aktiven IDs und hängt vom Client übersehene (z.B. zeitgleiche neue Anmeldung) automatisch hinten an |
| `queue-history.php` | GET | `completed`/`cancelled`, neueste zuerst |
| `queue-restore.php` | POST `{id}` | Verlauf-Eintrag zurück auf `pending`, ans Ende der aktiven Warteschlange |
| `queue-clear-history.php` | POST | löscht **alle** `completed`/`cancelled` endgültig |
| `queue-export.php` | GET | Alle Anmeldungen (Warteschlange + Verlauf, jeder Status) als CSV-Download (`;`-getrennt, UTF-8-BOM für Excel) - Admin-Button "Anmeldeliste als CSV exportieren" unter Einstellungen → Verlauf |
| `queue-delete-all.php` | POST | **Gefahrenzone**: löscht ausnahmslos alle Zeilen aus `queue_entries` (Warteschlange + Verlauf) - Stimmen hängen per `ON DELETE CASCADE` mit dran. Song-Katalog (inkl. Filter-Markierungen) und Settings/Passwörter bleiben unangetastet. Admin-Button fragt **zweimal** per `confirm()` nach (gedacht z.B. zum Löschen von Testdaten vor dem echten Event-Start) |
| `queue-delete.php?id=` | DELETE | Notfall-Direktlöschung eines Eintrags (kein UI-Trigger mehr, siehe unten) |
| `songs-add.php` | POST `{title, artist, genre?, year?, language?, duo?}` | manueller Song |
| `songs-delete.php?id=` | DELETE | Song löschen (kaskadiert auf zugehörige Warteschlangen-Einträge!) |
| `songs-import.php` | POST multipart `csv` | CSV-Import direkt im Browser (Alternative zum SSH-Skript, Semikolon/Komma automatisch erkannt, `ON DUPLICATE KEY UPDATE` statt `INSERT IGNORE` - trägt z.B. `duo`/`explicit` bei bereits importierten Songs nach). Übernimmt KaraFuns `Explicit`-Spalte in `songs.explicit` und markiert danach automatisch alle `explicit=1`-Songs mit noch unangetastetem `filter_status` (`none`) auf `review` (Grund "Explizit laut KaraFun-Katalog") - bereits manuell klassifizierte Songs bleiben unangetastet. Antwort enthält `newly_review_explicit` |
| `settings-get.php` / `settings-update.php` | GET/POST | alle Settings (inkl. `voting_locked`) + `moderation_password_set`-Flag |
| `branding-upload.php` | POST multipart `type` (`logo`/`banner`) + `image` | Logo bzw. Banner hochladen. Typ wird am Dateiinhalt erkannt (`finfo` + `getimagesize`), erlaubt sind nur PNG/JPG/WebP/GIF (bewusst **kein SVG** - könnte Skript enthalten), max. 5 MB (Logo) / 10 MB (Banner). Dateiname wird serverseitig zufällig vergeben, die vorherige Datei wird nach erfolgreichem Speichern gelöscht |
| `branding-delete.php` | POST `{type}` | eigenes Logo/Banner entfernen (Datei + Setting) - zurück auf Default-Logo bzw. automatischen Banner |
| `settings-password.php` | POST `{current_password, new_password}` | Admin-Passwort ändern |
| `settings-mod-password.php` | POST `{new_password}` | Moderations-Passwort setzen (kein aktuelles PW nötig - Admin-Session reicht) |
| `votes-reset.php` | POST | Löscht **ausnahmslos alle** Stimmen (`DELETE FROM votes`) - gibt damit gleichzeitig jeder/jedem Gast wieder 3 neue Stimmen UND setzt alle Song-Zähler auf 0, weil beides direkt aus derselben Tabelle gezählt wird (kein separates Konto pro Gast, lässt sich technisch nicht trennen). Admin-Button fragt vorher per `confirm()` nach, da unwiderruflich |

**Moderation (`requireModerator()`, akzeptiert auch Admin-Session):**
| Endpoint | Methode | Zweck |
|---|---|---|
| `mod-login.php` / `mod-logout.php` / `mod-check.php` | POST/POST/GET | eigener Login-Flow |
| `mod-queue.php` | GET | `current` (Status `playing`) + `next` (Status `approved`, ohne Limit - Seite ist scrollbar) - **ohne** Telefon/E-Mail (Moderation braucht keine Kontaktdaten) |
| `queue-comment.php?id=` | PATCH `{comment}` | Moderationsnotiz setzen - von Admin-Panel **und** Moderationsansicht genutzt, automatisch 700ms nach dem letzten Tastendruck |

**Control/Companion (`requireApiKey()`, Header `X-API-Key`):** eigene, von
der Admin-Session komplett unabhängige Maschinen-Auth fürs
[Companion-Modul](#companion-modul-show-steuerung) - kein Session-Cookie,
kein Login-Flow, dauerhaft gültig bis im Admin-Panel "Neu generieren"
geklickt wird.
| Endpoint | Methode | Zweck |
|---|---|---|
| `control-status.php` | GET | Sammel-Status für Feedbacks/Variablen in einem Request: `playing`/`next` (je `id`/`title`/`artist`/`singer`/`votes` oder `null`), `queue_length` (Anzahl `approved`+`playing`), `banner_mode`, `registration_locked`, `voting_locked`, `announcement` |
| `control-song-next.php` | POST | Nächsten Song starten: beendet einen laufenden Song (`completed`) und setzt den obersten genehmigten Song auf `playing`, inkl. Umsortieren an Position 1 - serverseitige Entsprechung von `startNextSong()`+`moveToTop()` in `admin.js`, atomar in einer Transaktion. HTTP 404 falls keine genehmigten Songs warten |
| `control-song-end.php` | POST | Beendet einen laufenden Song (`completed`), **ohne** einen neuen zu starten. HTTP 404 falls gerade kein Song läuft |
| `control-settings.php` | POST `{banner_mode?, registration_locked?, voting_locked?, announcement?}` | Partial-Update derselben vier Settings wie `settings-update.php`, aber per API-Key statt Admin-Session - bewusst ohne `footer_html`/`show_votes_on_display`, dafür gibt es keinen Companion-Anwendungsfall |

**Veraltet/unbenutzt:** `queue-position.php` (Einzel-Positions-Update) ist
seit dem Drag&Drop-Feature (`queue-reorder.php`) durch kein Frontend mehr
referenziert - admin-geschützt und harmlos, aber toter Code.

## Design-System

- **Anmeldung + Display** (`css/style.css`): Schwarz
  `#0a0a0a`, Gold `#ffc933`, Pink `#ff3d7f`, Türkis `#21e6c1` (Equalizer-
  Trio, nur dekorativ z.B. bei der Erfolgsmeldung eingesetzt, nicht als
  beliebige UI-Farbcodierung), Grau `#a6a6a6` für Sekundärtext. Schriften
  Poppins (Headlines, kursiv/fett) + Inter (Fliesstext), von Google Fonts.
  Logo/Banner kommen aus den Settings (siehe "Branding" unten), nicht aus
  dem Code.
- **Admin + Moderation** (`css/admin.css`): eigenständiges, an das
  LiveVoice-Pi-Streamer-Projekt angelehntes Design (gleiche CSS-Variablen/
  Hell-Dunkel-Umschaltung/Komponenten) - warmes Beige/Dunkel mit Orange-
  Akzent, System-Schriftart. Bewusst *nicht* im Equalizer-Look der
  Gäste-Seite, nur das Logo ist dasselbe. Login-Titel "Admin Center" /
  "<Event-Name> Karaoke" (analog zur Moderations-Maske "Moderation"). `main` ist 1200px breit (statt 900px), Warteschlangen-
  Karten zeigen Titel links / Sänger rechts in einer Zeile (wie das Display)
  statt gestapelter Zeilen - weniger Höhe pro Song.
- **Admin-Navigation links:** Klick aufs Logo springt aus jedem Tab zurück
  zur Warteschlange (`switchTab('queue')`), das Bildschirm-Icon direkt
  daneben öffnet `/display` in einem neuen Tab.
- **Warteschlangen-Aktionen** (`renderQueueActions()` in `admin.js`): statt 5
  gleichwertiger Status-Pills gibt es pro Karte nur noch den nächstlogischen
  Schritt als grossen primären Button (Angemeldet → "Genehmigen") plus ein
  "⋮"-Menü für die selteneren übrigen Wechsel (inkl. Stornieren).
  `.status-pill` existiert als CSS-Klasse nur noch für den Filter-Tab
  (Status `none`/`review`/`blocked`). **"Singen" gibt es bewusst nur einmal
  im ganzen Screen**: nur der oberste genehmigte Song (erster
  `approved`-Eintrag in `lastQueue`, die API liefert schon nach `position`
  sortiert) bekommt diesen Button - alle anderen genehmigten Songs zeigen
  keinen Primär-Button, nur das "⋮"-Menü (kann "Singt" dort trotzdem manuell
  wählen, das ist eine bewusste Ausnahme). Läuft schon ein Song, heisst der
  Button beim nächsten "Singen (aktuellen Fertig)" und beendet den
  laufenden Song via `startNextSong()` gleich mit (zwei Requests
  nacheinander: erst `completed` fürs alte, dann `playing` fürs neue).
- **"Jetzt auf der Bühne"-Panel** (Admin): erscheint links neben der (immer
  zentriert bleibenden) Warteschlangen-Tabelle, sobald ein Song `playing`
  ist **und** das Fenster mindestens `ADMIN_PANEL_MIN_WIDTH` (1848px) breit
  ist - sitzt `position: fixed` in der Marge links von `main`, ohne die
  Tabelle zu verschieben. Der spielende Song fliegt dann aus der normalen
  Liste raus (sonst doppelt) - `persistQueueOrder()` hängt seine ID beim
  Drag&Drop-Speichern trotzdem vorne mit an, sonst würde ihn
  `queue-reorder.php` sonst ans Ende der Warteschlange schieben.
- **Display** (`display.html`/`display.js`): analoges "Jetzt auf der
  Bühne"-Panel, aber links **und** mit Vollbild-Spotlight beim Sängerwechsel
  (Dauer einstellbar, Default 5s) - der eigentliche Layout-Wechsel (Panel
  einblenden, Container von 1200px auf 1592px verbreitern) läuft dabei erst
  `LAYOUT_CHANGE_DELAY_MS` (900ms) verzögert, während das Spotlight schon
  deckend ist, damit das Publikum den Sprung nie live sieht. Ab
  `SPLIT_MIN_WIDTH` (1650px) aktiv, sonst bleibt die Liste zentriert wie
  bisher. Zusätzlich passt `fitDisplayToViewport()` per CSS-Variable
  `--stage-scale` Header/Liste laufend so an, dass **alle** genehmigten
  Songs ohne Scrollen aufs Display passen (bis minimal 55% Grösse, danach
  scrollt es normal) - es gibt bewusst kein festes Anzeige-Limit mehr.
- **Display-Toolbar** (wie Planning Center Live): Maus an den oberen Rand
  → Leiste mit "Ansicht" (`Warteschlange` / `Banner + Song-Einblendung`),
  "Einblenddauer" (5-60s) und "Einblendung testen". Gilt nur für diesen
  Browser (localStorage `karaokeDisplayPrefs`), mehrere Displays können also
  unterschiedlich laufen. In "Banner + Song-Einblendung" steht immer der
  Banner (hochgeladenes Bild oder automatisch aus Logo + Texten), bei Songwechsel blendet das Spotlight darüber ein und
  nach der Einblenddauer wieder aus. Das Admin-/Companion-**Standbild**
  (`banner_mode`) hat Vorrang und unterdrückt Einblendungen. Für
  Kiosk-/OBS-Browser ohne Maus per URL übersteuerbar (wird nicht
  gespeichert): `/display?ansicht=banner&dauer=10`. Mauszeiger blendet nach
  3s ohne Bewegung aus.
- Eigene Bestätigungs-Modals (`modal-overlay`/`modal-card` in `admin.css`)
  statt Browser-`confirm()` für Abmelden - "Verlauf löschen"/"Alle Stimmen
  zurücksetzen" (1x) und "Alle Daten löschen" (2x, siehe Gefahrenzone) nutzen
  bewusst native `confirm()`-Dialoge statt eigener Modals, weil sie selten
  und absichtlich unbequem sein sollen.
- **Ton/Vibration bei neuer Anmeldung** (Moderation, Zahnrad-Icon ⚙ oben
  rechts): `refreshQueue()` in `moderation.js` vergleicht bei jedem 3s-Poll
  die IDs der "Als Nächstes"-Liste mit der vorherigen - taucht eine wirklich
  neue ID auf, spielt ein kurzer Beep (Web Audio API, kein Audio-Asset
  nötig) und/oder vibriert das Gerät (`navigator.vibrate()`, auf iOS/Safari
  wirkungslos, da nicht unterstützt). Einstellung liegt in `localStorage`
  (`modNotifyPrefs`), also pro Gerät/Browser, nicht serverseitig - wie das
  Theme. Kein Ton beim allerersten Laden der Seite (sonst würde jede schon
  bestehende Anmeldung beim Öffnen einen Ton auslösen).

## Branding (Logo, Banner, Event-Texte)

Die App enthält kein fixes Veranstalter-Logo. Alles läuft über Admin →
Einstellungen → **Branding**:

- **Event-Name** und **Untertitel/Ort** (Text-Settings `event_name`,
  `event_subtitle`).
- **Logo** (PNG/JPG/WebP/GIF, max. 5 MB) - erscheint auf Anmeldung, Display,
  Admin, Moderation und Statistik. Ohne Upload: neutrales
  `img/default-logo.svg`.
- **Display-Banner** (ideal 1920×1080, max. 10 MB) für Standbild und
  Ansicht "Banner + Song-Einblendung". Ohne Upload baut das Display den
  Banner aus Logo + Event-Name + "Karaoke Night" + Untertitel.

Technik: `js/branding.js` wird auf allen Seiten vor dem Seiten-Skript
geladen, holt `settings-public.php` und befüllt Elemente mit
`data-brand-logo`, `data-brand-event-name`, `data-brand-subtitle`,
`data-brand-app-name`, `data-brand-banner`/`data-brand-banner-fallback`.
Das Display ruft `window.karaokeApplyBranding()` bei jedem Settings-Poll
erneut auf - ein neues Logo erscheint dort ohne Neuladen. Die Bilder
liegen als Dateien in `uploads/` (Webroot); `uploads/.htaccess` liefert
nur die vom Server vergebenen Dateinamen `logo-/banner-<16 hex>.<png|jpg|webp|gif>`
aus und sperrt alles andere.

## Wartung / häufige Aufgaben

**Katalog aktualisieren:** entweder im Admin unter Einstellungen →
"Songkatalog verwalten" → "Katalog aktualisieren" (CSV hochladen, läuft
direkt im Browser - der KaraFun-Katalog ist ~7 MB, `upload_max_filesize`/
`post_max_size` und `max_execution_time` des Hostings müssen das zulassen),
oder per SSH:

```bash
cd <webroot>
npm install   # nur beim ersten Mal / nach node_modules-Verlust
npm run import karafuncatalog.csv
# danach node_modules/.htaccess wieder anlegen (s.o.) und die CSV wieder löschen
```

Aktuelles KaraFun-Format ist **semikolon-getrennt**
(`Id;Title;Artist;Year;Duo;Explicit;Date Added;Styles;Languages`) - ändert
sich das wieder, betrifft es `scripts/import-karafun.js` UND
`public/api/songs-import.php` (beide erkennen den Trenner zwar automatisch
anhand der ersten Zeile, aber das Spalten-Mapping ist hart codiert).

**Admin-/Moderations-Passwort ändern:** im Admin-Panel unter Einstellungen
- kein Server-Zugriff nötig.

**Neuen Song manuell ergänzen / Song löschen:** Admin → Einstellungen →
"Songkatalog verwalten" (eingeklappt, da selten gebraucht).

## Companion-Modul (Show-Steuerung)

Eigenständiges Bitfocus-Companion-Modul (separates Repo "Karaoke-Companion-Module",
Node/TypeScript) - steuert die App im Admin-Teil
von einem Stream Deck/Companion-Buttongrid aus, ohne Browser:

- **Nächsten Song starten** / **Aktuellen Song beenden** (ohne Nachfolger)
- **Standbild** (Banner-Modus) ein/aus/umschalten
- **Anmeldung** und **Voting** sperren/freigeben/umschalten
- **Ansage-Text** setzen (Banner auf Display + Anmeldeseite)
- Feedbacks/Variablen: aktueller Song+Sänger, nächster Song, Warteschlangenlänge, Sperr-/Standbild-Status, Ansage-Text - per Polling über `control-status.php`

Nutzt ausschliesslich die "Control/Companion"-Endpoints oben
(`control-*.php`, Header `X-API-Key`) - komplett getrennt vom
Admin-Browser-Login. Den Schlüssel dafür im Admin-Panel unter
Einstellungen → "Companion-Modul (Show-Steuerung)" erzeugen/kopieren, dann
im Companion-Modul-Setup unter "API-Key" eintragen. Siehe
das README des Companion-Moduls für Config-Felder und Installation
des `.tgz`-Pakets in Companion.

## Statistik (`/stats`)

Eigene Auswertungsseite mit eigenem Login, unabhängig vom Admin-Panel
(`requireStats()` in `lib/stats.php`, Session-Flag `stats`, bewusst
ohne Admin-Fallback).

**Einrichtung (einmalig):**

1. `database.sql` erneut ausführen: legt `stats_events`/`stats_visits`
   an und übernimmt bereits vorhandene Anmeldungen/Stimmen (idempotent).
2. In `.env` `STATS_PASSWORD=...` setzen (Bootstrap-Passwort). Danach
   lässt es sich in `/stats` → ⚙ ändern (Hash in `settings`, Key
   `stats_password_hash`, hat dann Vorrang vor `.env`). Übers
   Admin-Panel ist es absichtlich nicht setzbar.

**Was erfasst wird:**

- Seitenaufrufe von Anmeldung, Display und Moderation inkl. Heartbeat alle
  30 s (nur bei sichtbarem Tab), daraus "gerade online" und Verweildauer.
  Gerät/OS/Browser nur als grobe Kategorie, Herkunft über `?src=...`
  (z.B. `/?src=plakat` für den QR-Code).
- Suchbegriffe erst nach **2 s Tipp-Pause**, beim Antippen eines Treffers
  oder beim Verlassen der Seite (`js/track.js`), damit Zwischenstände
  wie "qu", "que" nicht als eigene Begriffe zählen. Normalisiert auf
  Kleinbuchstaben, mit Trefferzahl, daraus auch "Suchen ohne Treffer".
- Klickpfad: Startauswahl, Song ausgewählt, Formularfehler.
- Serverseitig (nicht fälschbar): Anmeldungen, abgelehnte Anmeldungen
  (vergeben/gesperrt/geschlossen), Stimmen und Rücknahmen,
  Statuswechsel aus `queue-status.php`, `queue-restore.php`,
  `queue-delete.php` und den `control-song-*.php`-Endpoints. Daraus
  entstehen Freigabe-, Warte- und Bühnenzeit sowie die Setlist.

**Unabhängig von Löschungen im Admin:** Die Statistik-Tabellen haben
keine Foreign Keys und speichern das Song-Label als Momentaufnahme.
"Verlauf löschen", "Stimmen zurücksetzen" und "Alle Daten löschen" lassen
die Statistik also unberührt. Zurücksetzen geht nur in `/stats` → ⚙,
mit Passwortbestätigung.

**Datenschutz:** keine IP-Adressen, kein roher User-Agent, keine Namen
oder Kontaktdaten. `visitor_id` ist ein zufälliger Cookie-Wert
(`stats_vid`, 30 Tage), Stimmen werden nur über einen gekürzten
SHA-256 des Voting-Tokens gezählt. Der CSV-Export entschärft Werte, die
mit `= + - @` beginnen (Schutz vor CSV-/Formel-Injection in Excel).

**Endpoints:** `stats-track.php` (öffentlich, Erfassung),
`stats-login.php`/`stats-check.php`/`stats-logout.php`,
`stats-data.php` (komplette Auswertung, `from`/`to` in
Unix-Sekunden, `from=0` = alles), `stats-export.php` (CSV),
`stats-password.php`, `stats-reset.php`. Alle Logging-Aufrufe
schlucken Fehler, damit die Statistik den Anmelde-/Show-Ablauf nie
blockiert, auch nicht vor der Migration.

## Bekannte Eigenheiten

- `queue-status.php` meldet `404`, wenn der neue Status identisch zum
  bisherigen ist (MySQL zählt ein `UPDATE` ohne echte Wertänderung nicht
  als "betroffen"). Kein Datenverlust, nur eine ungenaue Fehlermeldung -
  im Admin unkritisch, da die Liste danach ohnehin neu lädt.
- `queue-add.php` sperrt beim Ermitteln der nächsten Position kurz die
  betroffenen Zeilen (`FOR UPDATE` in einer Transaktion), damit zwei
  gleichzeitige Anmeldungen nicht dieselbe Position bekommen.
- Songtitel/Interpreten mit Apostroph oder Anführungszeichen (z.B. "J'irai
  où tu iras", ~73 Songs mit eingebetteten Anführungszeichen im Katalog)
  werden über `data-*`-Attribute statt eingebetteter `onclick`-Strings
  gehandhabt - eine frühere Version brach an genau solchen Songs.
- iOS/Smartphone-Autokorrektur ersetzt `'` gerne durch ein geschwungenes
  `'` (U+2019) - `songs-search.php` normalisiert das serverseitig, sonst
  liefert die Suche 0 Treffer für betroffene Songs.
- Telefonnummern werden bei jeder neuen Anmeldung normalisiert
  (`normalizeSwissPhone()` in `lib/db.php`, gespiegelt in `guest.js` -
  Gäste sehen die Formatierung schon im Formular, direkt beim Verlassen
  des Telefonfeldes per `blur`-Event, nicht erst nach dem Absenden).
  Schweizer Nummern
  (egal ob als `0791234455`, `0041791234455` oder `+41 79 123 44 55`
  eingetippt) landen einheitlich als `+41 79 123 44 55`. Andere
  Landesvorwahlen werden über eine ITU-E.164-Tabelle (1-3-stellig)
  erkannt und ebenfalls in lesbare 2er-Blöcke gruppiert (z.B.
  `0049 176 1234567` → `+49 17 61 23 45 67`), unbekannte/zu kurze
  Nummern bleiben nur von Sonderzeichen bereinigt stehen. Gilt nur für
  neue Anmeldungen - bestehende historische Einträge (inkl. Spass-/
  Test-Nummern wie "324") werden nicht rückwirkend umgeschrieben.
  Zusätzlich wird bei `+41`-Nummern das Ergebnis validiert
  (`isValidPhoneFormat()`): nur exakt `+41 XX XXX XX XX` (9 Ziffern) gilt
  als gültig, unvollständige Eingaben wie `+41 79 123 44` werden abgelehnt
  (Frontend **und** Backend, `queue-add.php` gibt sonst HTTP 400). Andere
  Landesvorwahlen bleiben bewusst nur locker geprüft (Zeichen/Länge), da
  ihr genaues Format nicht bekannt ist.
- Admin-Login ist ein einzelnes globales Passwort (kein Multi-User),
  Vergleich über `hash_equals()`/`password_verify()` (timing-safe). Für
  ein einmaliges Event-Tool ausreichend.
- CSRF: keine expliziten Tokens, aber die Session-Cookies laufen mit
  `SameSite=Lax` - schützt die schreibenden (POST/PATCH/DELETE)
  Admin-Endpoints bereits gegen die gängigsten CSRF-Szenarien.
