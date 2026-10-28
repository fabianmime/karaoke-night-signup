# Karaoke Night - Companion-Modul

Ein [Bitfocus Companion](https://bitfocus.io/companion) Connection-Modul für die
[Karaoke-Night-App](../README.md) - steuert den Admin-Teil (Songwechsel, Standbild, Anmelde-/Voting-Sperre,
Ansage-Text) über die Control-API der App, ohne Browser. Ideal für ein Stream Deck am Technikplatz.

## Features

- **Nächsten Song starten** / **Aktuellen Song beenden** (ohne Nachfolger)
- **Standbild** (Banner-Modus) ein/aus/umschalten
- **Anmeldung** und **Voting** sperren/freigeben/umschalten
- **Ansage-Text** setzen (Banner auf Display + Anmeldeseite), unterstützt Companion-Variablen
- Feedbacks + Variablen (aktueller/nächster Song, Sänger/in, Warteschlangenlänge, Sperr-/Standbild-Status,
  Ansage-Text) per Polling über einen einzigen Status-Request
- Fertige Presets für alle Actions oben, inkl. passender Feedbacks

Vollständige Referenz für Konfiguration, Aktionen, Feedbacks, Variablen und Presets:
[companion/HELP.md](./companion/HELP.md).

## Voraussetzung: API-Key in der App erzeugen

Im Admin-Panel der Karaoke-App unter Einstellungen → "Companion-Modul (Show-Steuerung)" einmal
"Neu generieren" klicken und den Schlüssel kopieren - siehe
[Show-Steuerung mit Companion](../README.md#show-steuerung-mit-companion).

## Installation

1. Das aktuelle `karaoke-<version>.tgz` von der
   [Releases-Seite](https://github.com/meyer-productions/karaoke-night-signup/releases) herunterladen oder selbst
   bauen (siehe unten).
2. In Companion: **Modules → Import module package** und die Datei auswählen.
3. Neue "Karaoke Night"-Connection anlegen, **Host** der App (z.B. `karaoke.example.ch`) und den
   **API-Key** aus dem Admin-Panel eintragen.

## Development

```sh
yarn install       # Abhängigkeiten installieren
yarn build         # einmalig nach dist/ kompilieren
yarn dev           # im Watch-Modus kompilieren
yarn lint          # eslint
yarn package       # build + erzeugt das importierbare .tgz via companion-module-build
```

Der Ordner `companion-module/` wird beim Deployment der App **nicht** auf den Webserver hochgeladen.

## License

[MIT](./LICENSE.md)
