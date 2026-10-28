import type ModuleInstance from './main.js'

export type FeedbacksSchema = {
	bannerActive: { type: 'boolean'; options: Record<string, never> }
	registrationLocked: { type: 'boolean'; options: Record<string, never> }
	votingLocked: { type: 'boolean'; options: Record<string, never> }
	songPlaying: { type: 'boolean'; options: Record<string, never> }
}

export function UpdateFeedbacks(self: ModuleInstance): void {
	self.setFeedbackDefinitions({
		bannerActive: {
			type: 'boolean',
			name: 'Standbild aktiv',
			description:
				'Aktiv wenn auf dem Display gerade das Standbild (Banner-Modus) statt der Warteschlange gezeigt wird',
			defaultStyle: { bgcolor: 0xc86400, color: 0xffffff },
			options: [],
			callback: () => self.status.bannerMode,
		},
		registrationLocked: {
			type: 'boolean',
			name: 'Anmeldung gesperrt',
			description: 'Aktiv wenn Gäste aktuell keine neuen Songs anmelden können',
			defaultStyle: { bgcolor: 0xc80000, color: 0xffffff },
			options: [],
			callback: () => self.status.registrationLocked,
		},
		votingLocked: {
			type: 'boolean',
			name: 'Voting gesperrt',
			description: 'Aktiv wenn Gäste aktuell nicht voten können',
			defaultStyle: { bgcolor: 0xc80000, color: 0xffffff },
			options: [],
			callback: () => self.status.votingLocked,
		},
		songPlaying: {
			type: 'boolean',
			name: 'Song läuft',
			description: 'Aktiv wenn gerade ein Song auf "Singt" steht',
			defaultStyle: { bgcolor: 0x00c800, color: 0xffffff },
			options: [],
			callback: () => self.status.playing !== null,
		},
	})
}
