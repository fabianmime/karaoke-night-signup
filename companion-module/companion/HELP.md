## Karaoke Night

Steuert die Karaoke-App (Admin-Teil) über eine dedizierte **Control-API** der App selbst (eigener API-Key,
Header `X-API-Key`) - komplett unabhängig vom Admin-Browser-Passwort/-Login, kein Session-Cookie nötig.

### Konfiguration

- **Host** - Domain der App, ohne `https://` und ohne Pfad, z.B. `karaoke.example.ch`.
- **HTTPS verwenden** - Standardmässig an.
- **API-Key** - im Admin-Panel der App unter Einstellungen → "Companion-Modul (Show-Steuerung)" erzeugen und
  hier eintragen. Ein neu generierter Schlüssel macht den bisherigen sofort ungültig.
- **Polling-Intervall** - wie oft aktueller/nächster Song, Warteschlangenlänge, Standbild-/Sperren-Status für
  Feedbacks/Variablen abgefragt werden (0 = aus).

### Aktionen

- **Nächsten Song starten** - beendet einen laufenden Song ("Fertig") und startet den obersten genehmigten Song
  ("Singt"), inkl. Umsortieren an Position 1. Entspricht dem "Singen (aktuellen Fertig)"-Button im Admin-Panel.
- **Aktuellen Song beenden (ohne Nachfolger)** - setzt einen laufenden Song auf "Fertig", ohne einen neuen zu
  starten.
- **Standbild** - blendet auf dem Display das Standbild (Social-Share-Banner) statt der Warteschlange ein/aus.
  Dropdown Ein/Aus/Umschalten - "Umschalten" kehrt den zuletzt bekannten Status um (siehe Polling oben).
- **Anmeldung sperren/freigeben** - sperrt/öffnet die Song-Anmeldung für Gäste. Ein/Aus/Umschalten.
- **Voting sperren/freigeben** - sperrt/öffnet das Abstimmen über Songs. Ein/Aus/Umschalten.
- **Ansage-Text setzen** - setzt den Banner-Text auf Display + Anmeldeseite (z.B. "Pause bis 21 Uhr"). Leeres
  Feld blendet ihn wieder aus. Textfeld unterstützt Companion-Variablen.

Die Ein/Aus/Umschalten-Actions richten sich nach dem zuletzt per Polling bekannten Status - bei sehr kurzem
Polling-Intervall oder direkt nach dem Verbinden kann der erste "Umschalten"-Klick daher kurz den vorherigen,
noch nicht aktualisierten Zustand umkehren.

### Feedbacks

- **Standbild aktiv**
- **Anmeldung gesperrt**
- **Voting gesperrt**
- **Song läuft** - aktiv, sobald irgendein Song auf "Singt" steht.

### Variablen

`connection_status`, `current_title`/`current_artist`/`current_singer` (aktueller Song), `next_title`/
`next_artist`/`next_singer` (oberster genehmigter Song), `queue_length` (Anzahl genehmigter + aktueller Songs),
`banner_mode`/`registration_locked`/`voting_locked` (`Ja`/`Nein`), `announcement`, `last_action_result`.

### Presets

Fertige Buttons für "Nächster Song", "Song beenden" sowie Umschalt-Buttons für Standbild/Anmeldung/Voting mit
passendem Feedback (Button leuchtet, wenn der jeweilige Zustand aktiv ist) - einfach auf eine Seite ziehen.
