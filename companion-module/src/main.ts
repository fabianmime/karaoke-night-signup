import { InstanceBase, InstanceStatus, type SomeCompanionConfigField } from '@companion-module/base'
import { GetConfigFields, type ModuleConfig, type ModuleSecrets } from './config.js'
import { UpdateVariableDefinitions, type VariablesSchema } from './variables.js'
import { UpgradeScripts } from './upgrades.js'
import { UpdateActions, type ActionsSchema } from './actions.js'
import { UpdateFeedbacks, type FeedbacksSchema } from './feedbacks.js'
import { UpdatePresets } from './presets.js'
import {
	getStatus,
	startNextSong,
	endCurrentSong,
	updateSettings,
	type KaraokeClientConfig,
	type KaraokeStatus,
	type KaraokeResult,
} from './karaoke-client.js'

export type ModuleSchema = {
	config: ModuleConfig
	secrets: ModuleSecrets
	actions: ActionsSchema
	feedbacks: FeedbacksSchema
	variables: VariablesSchema
}

export { UpgradeScripts }

const EMPTY_STATUS: KaraokeStatus = {
	playing: null,
	next: null,
	queueLength: 0,
	bannerMode: false,
	registrationLocked: false,
	votingLocked: false,
	announcement: '',
}

export default class ModuleInstance extends InstanceBase<ModuleSchema> {
	config!: ModuleConfig // Setup in init()
	secrets!: ModuleSecrets // Setup in init()

	/** Letzter erfolgreich abgefragter Status - von Feedbacks synchron gelesen (siehe feedbacks.ts). */
	status: KaraokeStatus = { ...EMPTY_STATUS }
	lastActionResult = ''

	private pollTimer: ReturnType<typeof setInterval> | undefined

	constructor(internal: unknown) {
		super(internal)
	}

	async init(config: ModuleConfig, _isFirstInit: boolean, secrets: ModuleSecrets): Promise<void> {
		this.config = config
		this.secrets = secrets

		this.setVariableValues({
			connection_status: 'connecting',
			current_title: '',
			current_artist: '',
			current_singer: '',
			next_title: '',
			next_artist: '',
			next_singer: '',
			queue_length: 0,
			banner_mode: 'Nein',
			registration_locked: 'Nein',
			voting_locked: 'Nein',
			announcement: '',
			last_action_result: '',
		})

		this.updateActions()
		this.updateFeedbacks()
		this.updatePresets()
		this.updateVariableDefinitions()

		await this.pollStatus()
		this.startPolling()
	}

	async destroy(): Promise<void> {
		this.stopPolling()
	}

	async configUpdated(config: ModuleConfig, secrets: ModuleSecrets): Promise<void> {
		this.config = config
		this.secrets = secrets

		await this.pollStatus()
		this.startPolling()
	}

	getConfigFields(): SomeCompanionConfigField[] {
		return GetConfigFields()
	}

	updateActions(): void {
		UpdateActions(this)
	}

	updateFeedbacks(): void {
		UpdateFeedbacks(this)
	}

	updatePresets(): void {
		UpdatePresets(this)
	}

	updateVariableDefinitions(): void {
		UpdateVariableDefinitions(this)
	}

	private clientConfig(): KaraokeClientConfig {
		return {
			host: this.config.host,
			useHttps: this.config.useHttps,
			apiKey: this.secrets.apiKey,
		}
	}

	private stopPolling(): void {
		if (this.pollTimer) {
			clearInterval(this.pollTimer)
			this.pollTimer = undefined
		}
	}

	private startPolling(): void {
		this.stopPolling()

		const seconds = this.config.pollInterval
		if (!seconds || seconds <= 0) {
			return
		}

		this.pollTimer = setInterval(() => {
			this.pollStatus().catch((error) => {
				this.log('error', `Polling fehlgeschlagen: ${error instanceof Error ? error.message : String(error)}`)
			})
		}, seconds * 1000)
	}

	/** Regelmässiger Poll: aktueller/nächster Song, Warteschlangenlänge, Standbild-/Sperren-Status. */
	async pollStatus(): Promise<void> {
		if (!this.config.host || !this.secrets.apiKey) {
			this.updateStatus(InstanceStatus.BadConfig, 'Host und API-Key sind erforderlich.')
			return
		}

		const result = await getStatus(this.clientConfig())
		if (result.outcome !== 'ok') {
			this.applyConnectionError(result, 'Status konnte nicht abgefragt werden.')
			return
		}

		this.status = result.data
		this.updateStatus(InstanceStatus.Ok)
		this.setVariableValues({ connection_status: 'ok' })
		this.checkFeedbacks('bannerActive', 'registrationLocked', 'votingLocked', 'songPlaying')
		this.updateStatusVariables()
	}

	async songNext(): Promise<void> {
		const result = await startNextSong(this.clientConfig())
		this.recordActionResult('Nächsten Song starten', result)
		if (result.outcome === 'ok') await this.pollStatus()
	}

	async songEnd(): Promise<void> {
		const result = await endCurrentSong(this.clientConfig())
		this.recordActionResult('Song beenden', result)
		if (result.outcome === 'ok') await this.pollStatus()
	}

	async setBanner(mode: string): Promise<void> {
		const target = this.resolveToggle(mode, this.status.bannerMode)
		const result = await updateSettings(this.clientConfig(), { banner_mode: target })
		this.recordActionResult(`Standbild ${target ? 'ein' : 'aus'}`, result)
		if (result.outcome === 'ok') await this.pollStatus()
	}

	async setRegistrationLocked(mode: string): Promise<void> {
		const target = this.resolveToggle(mode, this.status.registrationLocked)
		const result = await updateSettings(this.clientConfig(), { registration_locked: target })
		this.recordActionResult(`Anmeldung ${target ? 'gesperrt' : 'freigegeben'}`, result)
		if (result.outcome === 'ok') await this.pollStatus()
	}

	async setVotingLocked(mode: string): Promise<void> {
		const target = this.resolveToggle(mode, this.status.votingLocked)
		const result = await updateSettings(this.clientConfig(), { voting_locked: target })
		this.recordActionResult(`Voting ${target ? 'gesperrt' : 'freigegeben'}`, result)
		if (result.outcome === 'ok') await this.pollStatus()
	}

	async setAnnouncement(text: string): Promise<void> {
		const result = await updateSettings(this.clientConfig(), { announcement: text })
		this.recordActionResult('Ansage-Text setzen', result)
		if (result.outcome === 'ok') await this.pollStatus()
	}

	/** "on"/"off" setzen den Zielwert fest, "toggle" kehrt den zuletzt bekannten Status um. */
	private resolveToggle(mode: string, current: boolean): boolean {
		if (mode === 'on') return true
		if (mode === 'off') return false
		return !current
	}

	private updateStatusVariables(): void {
		this.setVariableValues({
			current_title: this.status.playing?.title ?? '',
			current_artist: this.status.playing?.artist ?? '',
			current_singer: this.status.playing?.singer ?? '',
			next_title: this.status.next?.title ?? '',
			next_artist: this.status.next?.artist ?? '',
			next_singer: this.status.next?.singer ?? '',
			queue_length: this.status.queueLength,
			banner_mode: this.status.bannerMode ? 'Ja' : 'Nein',
			registration_locked: this.status.registrationLocked ? 'Ja' : 'Nein',
			voting_locked: this.status.votingLocked ? 'Ja' : 'Nein',
			announcement: this.status.announcement,
		})
	}

	private applyConnectionError(result: KaraokeResult<unknown>, context: string): void {
		const detail =
			result.outcome === 'error'
				? result.message
				: result.outcome === 'not-found'
					? (result.message ?? 'not-found')
					: result.outcome
		const fullMessage = `${context} (${detail})`

		if (result.outcome === 'unauthorized') {
			this.updateStatus(InstanceStatus.AuthenticationFailure, fullMessage)
		} else {
			this.updateStatus(InstanceStatus.ConnectionFailure, fullMessage)
		}
		this.setVariableValues({ connection_status: result.outcome })
		this.log('warn', fullMessage)
	}

	private recordActionResult(label: string, result: { outcome: string; message?: string }): void {
		this.lastActionResult = `${label}: ${result.outcome}${result.message ? ` (${result.message})` : ''}`
		this.setVariableValues({ last_action_result: this.lastActionResult })

		if (result.outcome === 'ok') {
			this.log('info', `${label} erfolgreich.`)
		} else {
			this.log('warn', `${label} fehlgeschlagen: ${result.outcome}${result.message ? ` - ${result.message}` : ''}`)
		}
	}
}
