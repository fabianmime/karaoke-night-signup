import type ModuleInstance from './main.js'

export type ActionsSchema = {
	songNext: { options: Record<string, never> }
	songEnd: { options: Record<string, never> }
	bannerSet: { options: { mode: string } }
	registrationSet: { options: { mode: string } }
	votingSet: { options: { mode: string } }
	announcementSet: { options: { text: string } }
}

const ON_OFF_TOGGLE = [
	{ id: 'on', label: 'Ein' },
	{ id: 'off', label: 'Aus' },
	{ id: 'toggle', label: 'Umschalten' },
]

export function UpdateActions(self: ModuleInstance): void {
	self.setActionDefinitions({
		songNext: {
			name: 'Nächsten Song starten',
			description:
				'Beendet einen laufenden Song ("Fertig") und startet den obersten genehmigten Song ("Singt"), ' +
				'inkl. Umsortieren an Position 1 - entspricht dem "Singen (aktuellen Fertig)"-Button im Admin-Panel.',
			options: [],
			callback: async () => {
				await self.songNext()
			},
		},
		songEnd: {
			name: 'Aktuellen Song beenden (ohne Nachfolger)',
			description: 'Setzt einen laufenden Song auf "Fertig", ohne gleich einen neuen zu starten.',
			options: [],
			callback: async () => {
				await self.songEnd()
			},
		},
		bannerSet: {
			name: 'Standbild',
			description:
				'Blendet auf dem Display das Standbild (Social-Share-Banner) statt der Warteschlange ein/aus - ' +
				'entspricht dem Augen-Icon im Admin-Panel.',
			options: [{ type: 'dropdown', id: 'mode', label: 'Modus', choices: ON_OFF_TOGGLE, default: 'toggle' }],
			callback: async (action) => {
				await self.setBanner(String(action.options.mode))
			},
		},
		registrationSet: {
			name: 'Anmeldung sperren/freigeben',
			description: 'Sperrt oder öffnet die Song-Anmeldung für Gäste.',
			options: [{ type: 'dropdown', id: 'mode', label: 'Modus', choices: ON_OFF_TOGGLE, default: 'toggle' }],
			callback: async (action) => {
				await self.setRegistrationLocked(String(action.options.mode))
			},
		},
		votingSet: {
			name: 'Voting sperren/freigeben',
			description: 'Sperrt oder öffnet das Abstimmen über Songs.',
			options: [{ type: 'dropdown', id: 'mode', label: 'Modus', choices: ON_OFF_TOGGLE, default: 'toggle' }],
			callback: async (action) => {
				await self.setVotingLocked(String(action.options.mode))
			},
		},
		announcementSet: {
			name: 'Ansage-Text setzen',
			description: 'Setzt den Banner-Text auf Display + Anmeldeseite. Leeres Feld blendet ihn aus.',
			// useVariables: true lässt Companion Variablen im Text schon vor dem
			// Callback auflösen (seit @companion-module/base 1.x kein manuelles
			// parseVariablesInString() mehr nötig/verfügbar).
			options: [{ type: 'textinput', id: 'text', label: 'Text', useVariables: true, default: '' }],
			callback: async (action) => {
				await self.setAnnouncement(String(action.options.text ?? ''))
			},
		},
	})
}
