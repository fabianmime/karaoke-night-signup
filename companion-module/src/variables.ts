import type {
	CompanionVariableDefinition,
	CompanionVariableDefinitions,
	CompanionVariableValue,
} from '@companion-module/base'
import type ModuleInstance from './main.js'

export type VariablesSchema = {
	connection_status: string
	current_title: string
	current_artist: string
	current_singer: string
	next_title: string
	next_artist: string
	next_singer: string
	queue_length: number
	banner_mode: string
	registration_locked: string
	voting_locked: string
	announcement: string
	last_action_result: string
	[key: string]: CompanionVariableValue
}

export function UpdateVariableDefinitions(self: ModuleInstance): void {
	const definitions: Record<string, CompanionVariableDefinition> = {
		connection_status: { name: 'Verbindungsstatus' },
		current_title: { name: 'Aktueller Song: Titel' },
		current_artist: { name: 'Aktueller Song: Interpret' },
		current_singer: { name: 'Aktueller Song: Sänger/in' },
		next_title: { name: 'Nächster Song: Titel' },
		next_artist: { name: 'Nächster Song: Interpret' },
		next_singer: { name: 'Nächster Song: Sänger/in' },
		queue_length: { name: 'Anzahl Songs in der Warteschlange (genehmigt + aktuell)' },
		banner_mode: { name: 'Standbild aktiv (Ja/Nein)' },
		registration_locked: { name: 'Anmeldung gesperrt (Ja/Nein)' },
		voting_locked: { name: 'Voting gesperrt (Ja/Nein)' },
		announcement: { name: 'Ansage-Text' },
		last_action_result: { name: 'Letztes Action-Ergebnis' },
	}

	self.setVariableDefinitions(definitions as CompanionVariableDefinitions<VariablesSchema>)
}
