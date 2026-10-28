const REQUEST_TIMEOUT_MS = 8000

export type KaraokeClientConfig = {
	host: string
	useHttps: boolean
	apiKey: string
}

export type KaraokeQueueEntry = {
	id: number
	title: string
	artist: string
	singer: string
	votes: number
}

export type KaraokeStatus = {
	playing: KaraokeQueueEntry | null
	next: KaraokeQueueEntry | null
	queueLength: number
	bannerMode: boolean
	registrationLocked: boolean
	votingLocked: boolean
	announcement: string
}

export type KaraokeResult<T> =
	| { outcome: 'ok'; data: T }
	| { outcome: 'unauthorized' }
	| { outcome: 'not-found'; message?: string }
	| { outcome: 'timeout' }
	| { outcome: 'error'; message: string }

function baseUrl(config: KaraokeClientConfig): string {
	const protocol = config.useHttps ? 'https' : 'http'
	return `${protocol}://${config.host}/api`
}

function errorMessage(err: unknown): string {
	if (err instanceof Error) {
		if (err.name === 'AbortError') return 'Zeitüberschreitung bei der Verbindung zur Karaoke-App'
		return err.message
	}
	return String(err)
}

async function request<T>(
	config: KaraokeClientConfig,
	path: string,
	method: 'GET' | 'POST',
	body?: unknown,
): Promise<KaraokeResult<T>> {
	const controller = new AbortController()
	const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS)
	try {
		const response = await fetch(`${baseUrl(config)}${path}`, {
			method,
			headers: {
				'X-API-Key': config.apiKey,
				Accept: 'application/json',
				...(body !== undefined ? { 'Content-Type': 'application/json' } : {}),
			},
			body: body !== undefined ? JSON.stringify(body) : undefined,
			signal: controller.signal,
		})

		if (response.status === 401) return { outcome: 'unauthorized' }
		if (response.status === 404) {
			const data = (await response.json().catch(() => null)) as { error?: string } | null
			return { outcome: 'not-found', message: data?.error }
		}
		if (!response.ok) {
			const text = await response.text().catch(() => '')
			return { outcome: 'error', message: `HTTP ${response.status}${text ? `: ${text}` : ''}` }
		}

		const data = (await response.json()) as T
		return { outcome: 'ok', data }
	} catch (err) {
		if (err instanceof Error && err.name === 'AbortError') return { outcome: 'timeout' }
		return { outcome: 'error', message: errorMessage(err) }
	} finally {
		clearTimeout(timeout)
	}
}

/** Ergebnis von control-status.php - snake_case wie von der PHP-API geliefert. */
type RawStatus = {
	playing: KaraokeQueueEntry | null
	next: KaraokeQueueEntry | null
	queue_length: number
	banner_mode: boolean
	registration_locked: boolean
	voting_locked: boolean
	announcement: string
}

export async function getStatus(config: KaraokeClientConfig): Promise<KaraokeResult<KaraokeStatus>> {
	const result = await request<RawStatus>(config, '/control-status.php', 'GET')
	if (result.outcome !== 'ok') return result

	const raw = result.data
	return {
		outcome: 'ok',
		data: {
			playing: raw.playing,
			next: raw.next,
			queueLength: raw.queue_length,
			bannerMode: raw.banner_mode,
			registrationLocked: raw.registration_locked,
			votingLocked: raw.voting_locked,
			announcement: raw.announcement,
		},
	}
}

export async function startNextSong(config: KaraokeClientConfig): Promise<KaraokeResult<void>> {
	const result = await request<unknown>(config, '/control-song-next.php', 'POST')
	return result.outcome === 'ok' ? { outcome: 'ok', data: undefined } : result
}

export async function endCurrentSong(config: KaraokeClientConfig): Promise<KaraokeResult<void>> {
	const result = await request<unknown>(config, '/control-song-end.php', 'POST')
	return result.outcome === 'ok' ? { outcome: 'ok', data: undefined } : result
}

export type ControlSettingsPatch = {
	banner_mode?: boolean
	registration_locked?: boolean
	voting_locked?: boolean
	announcement?: string
}

export async function updateSettings(
	config: KaraokeClientConfig,
	patch: ControlSettingsPatch,
): Promise<KaraokeResult<void>> {
	const result = await request<unknown>(config, '/control-settings.php', 'POST', patch)
	return result.outcome === 'ok' ? { outcome: 'ok', data: undefined } : result
}
