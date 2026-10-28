import type { SomeCompanionConfigField } from '@companion-module/base'

export type ModuleConfig = {
	host: string
	useHttps: boolean
	pollInterval: number
}

export type ModuleSecrets = {
	apiKey: string
}

export function GetConfigFields(): SomeCompanionConfigField[] {
	return [
		{
			type: 'static-text',
			id: 'info',
			label: 'Karaoke Night',
			width: 12,
			value:
				'Steuert die Karaoke-App im Admin-Teil über eine dedizierte <b>Control-API</b> (eigener API-Key, ' +
				'unabhängig vom Admin-Browser-Passwort). Den Schlüssel im Admin-Panel der App unter ' +
				'Einstellungen → "Companion-Modul (Show-Steuerung)" erzeugen und unten eintragen.',
		},
		{
			type: 'textinput',
			id: 'host',
			label: 'Host',
			tooltip: 'Domain der Karaoke-App, ohne "https://" und ohne Pfad, z.B. karaoke.example.ch',
			width: 8,
			default: '',
		},
		{
			type: 'checkbox',
			id: 'useHttps',
			label: 'HTTPS verwenden',
			width: 4,
			default: true,
		},
		{
			type: 'secret-text',
			id: 'apiKey',
			label: 'API-Key',
			tooltip: 'Admin-Panel der App → Einstellungen → "Companion-Modul (Show-Steuerung)" → Schlüssel kopieren',
			width: 12,
		},
		{
			type: 'number',
			id: 'pollInterval',
			label: 'Polling-Intervall (Sekunden, 0 = aus)',
			tooltip:
				'Wie oft aktueller/nächster Song, Warteschlangenlänge, Standbild- und Sperren-Status für ' +
				'Feedbacks/Variablen abgefragt werden.',
			width: 6,
			min: 0,
			max: 3600,
			default: 4,
		},
	]
}
