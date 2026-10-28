import type { CompanionPresetDefinitions, CompanionPresetSection } from '@companion-module/base'
import type ModuleInstance from './main.js'
import type { ModuleSchema } from './main.js'

export function UpdatePresets(self: ModuleInstance): void {
	const presets: CompanionPresetDefinitions<ModuleSchema> = {
		songNext: {
			type: 'simple',
			name: 'Nächster Song',
			style: {
				text: '▶ Nächster\\nSong',
				size: 'auto',
				color: 0xffffff,
				bgcolor: 0x000000,
				alignment: 'center:center',
			},
			steps: [{ down: [{ actionId: 'songNext', options: {} }], up: [] }],
			feedbacks: [{ feedbackId: 'songPlaying', options: {}, style: { bgcolor: 0x00c800 } }],
		},
		songEnd: {
			type: 'simple',
			name: 'Song beenden',
			style: {
				text: '■ Song\\nbeenden',
				size: 'auto',
				color: 0xffffff,
				bgcolor: 0x000000,
				alignment: 'center:center',
			},
			steps: [{ down: [{ actionId: 'songEnd', options: {} }], up: [] }],
			feedbacks: [],
		},
		bannerToggle: {
			type: 'simple',
			name: 'Standbild umschalten',
			style: {
				text: 'Standbild',
				size: 'auto',
				color: 0xffffff,
				bgcolor: 0x000000,
				alignment: 'center:center',
			},
			steps: [{ down: [{ actionId: 'bannerSet', options: { mode: 'toggle' } }], up: [] }],
			feedbacks: [{ feedbackId: 'bannerActive', options: {}, style: { bgcolor: 0xc86400 } }],
		},
		registrationToggle: {
			type: 'simple',
			name: 'Anmeldung sperren/freigeben',
			style: {
				text: 'Anmeldung',
				size: 'auto',
				color: 0xffffff,
				bgcolor: 0x000000,
				alignment: 'center:center',
			},
			steps: [{ down: [{ actionId: 'registrationSet', options: { mode: 'toggle' } }], up: [] }],
			feedbacks: [{ feedbackId: 'registrationLocked', options: {}, style: { bgcolor: 0xc80000 } }],
		},
		votingToggle: {
			type: 'simple',
			name: 'Voting sperren/freigeben',
			style: {
				text: 'Voting',
				size: 'auto',
				color: 0xffffff,
				bgcolor: 0x000000,
				alignment: 'center:center',
			},
			steps: [{ down: [{ actionId: 'votingSet', options: { mode: 'toggle' } }], up: [] }],
			feedbacks: [{ feedbackId: 'votingLocked', options: {}, style: { bgcolor: 0xc80000 } }],
		},
	}

	const structure: CompanionPresetSection<ModuleSchema>[] = [
		{ id: 'main', name: 'Show-Steuerung', definitions: Object.keys(presets) },
	]

	self.setPresetDefinitions(structure, presets)
}
