import type { CompanionStaticUpgradeScript } from '@companion-module/base'
import type { ModuleConfig } from './config.js'

export const UpgradeScripts: CompanionStaticUpgradeScript<ModuleConfig>[] = [
	// Hier künftige Migrationsschritte ergänzen, wenn sich Config-/Action-/Feedback-Strukturen ändern.
	// Einmal hinzugefügte Schritte nie wieder entfernen (siehe Unifi-/LiveVoice-Modul für Beispiele)!
]
