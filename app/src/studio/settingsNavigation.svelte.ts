import { doc, ui } from './state.svelte.ts';
import type { WhisperKey } from 'svelte-whisper';
import type { CreationSection } from './creationSettings.ts';

export type SettingsSection =
	| 'general'
	| 'audio'
	| 'wardrobe'
	| 'mount'
	| 'live'
	| 'export'
	| 'pixellab'
	| 'library'
	| 'trash'
	| 'developer'
	| 'about'
	| CreationSection;

export const settingsLabels = {
	general: 'settings.appearance',
	audio: 'settings.audio.title',
	wardrobe: 'experience.tabWardrobe',
	mount: 'settings.mount',
	live: 'liveViews.title',
	characters: 'creationSettings.character',
	moves: 'creationSettings.move',
	states: 'creationSettings.state',
	items: 'creationSettings.item',
	export: 'export.sheet.title',
	pixellab: 'settings.connection',
	library: 'librarySettings.title',
	trash: 'settings.trash',
	developer: 'developer.title',
	about: 'settings.about'
} satisfies Record<SettingsSection, WhisperKey>;

export const settingsNavigation = $state<{
	section: SettingsSection | null;
	fromExport: boolean;
	accountOpen: boolean;
	/** Account opens straight into Replace key and returns to Settings when it ends. */
	accountReplace: boolean;
	activityOpen: boolean;
	costOpen: boolean;
	exportOpen: boolean;
	/** A row to bring into view once its page shows (openSettings(section, entry)); `id` makes a repeat request new. */
	reveal: { section: SettingsSection; entry: string; id: number } | null;
}>({
	section: null,
	fromExport: false,
	accountOpen: false,
	accountReplace: false,
	activityOpen: false,
	costOpen: false,
	exportOpen: false,
	reveal: null
});
let revealCount = 0;

let returnFocus: 'connection' | 'recent-activity' | 'cost-estimate' | undefined;

export function takeSettingsReturnFocus() {
	const entry = returnFocus;
	returnFocus = undefined;
	return entry;
}

/** Ctrl+, or Command+, the usual settings shortcut on every platform; "Mod" is Command on Apple devices. */
export const SETTINGS_KEYS = ['Mod', ','] as const;
export const isSettingsShortcut = (e: KeyboardEvent) =>
	(e.ctrlKey || e.metaKey) && !e.altKey && !e.shiftKey && e.key === ',';

/** Without a section, Settings reopens on the page last shown; kept in memory only, so a reload starts at the index.
 *  With an `entry` (a row's data-setting id, as Settings search uses), that row is scrolled into view, focused and
 *  briefly highlighted once the page shows. */
export function openSettings(section?: SettingsSection, entry?: string) {
	returnFocus = undefined;
	settingsNavigation.reveal = section && entry ? { section, entry, id: ++revealCount } : null;
	// Opening Export's page again from inside Export's Settings (a notice's Review) keeps Back to Export.
	settingsNavigation.fromExport =
		section === 'export' &&
		(ui.sheet === 'export' || (ui.sheet === 'settings' && settingsNavigation.fromExport));
	if (section) settingsNavigation.section = section;
	if (ui.sheet && ui.sheet !== 'settings' && !settingsNavigation.fromExport)
		ui.settingsOverlay = true;
	else ui.sheet = 'settings';
}

export function closeSettings() {
	settingsNavigation.reveal = null;
	if (ui.settingsOverlay) ui.settingsOverlay = false;
	else ui.sheet = null;
}

export function openSettingsAccount(replace = false) {
	ui.settingsOverlay = false;
	settingsNavigation.accountOpen = true;
	settingsNavigation.accountReplace = replace;
	ui.sheet = 'connect';
}

export function closeSettingsAccount(): boolean {
	if (ui.sheet !== 'connect' || !settingsNavigation.accountOpen) return false;
	settingsNavigation.accountOpen = false;
	settingsNavigation.section = 'pixellab';
	returnFocus = 'connection';
	ui.sheet = 'settings';
	return true;
}

export function openSettingsActivity() {
	ui.settingsOverlay = false;
	settingsNavigation.activityOpen = true;
	ui.sheet = 'activity';
}

export function closeSettingsActivity(): boolean {
	if (ui.sheet !== 'activity' || !settingsNavigation.activityOpen) return false;
	settingsNavigation.activityOpen = false;
	settingsNavigation.section = 'pixellab';
	returnFocus = 'recent-activity';
	ui.sheet = 'settings';
	return true;
}

/** Cost estimate for the open character, returning to Settings when it closes. */
export function openSettingsCost() {
	ui.settingsOverlay = false;
	settingsNavigation.costOpen = true;
	ui.costProject = doc.id;
	ui.sheet = 'cost';
}

export function closeSettingsCost(): boolean {
	if (ui.sheet !== 'cost' || !settingsNavigation.costOpen) return false;
	settingsNavigation.costOpen = false;
	settingsNavigation.section = 'pixellab';
	returnFocus = 'cost-estimate';
	ui.sheet = 'settings';
	return true;
}

export function openSettingsExport() {
	ui.settingsOverlay = false;
	settingsNavigation.exportOpen = true;
	ui.sheet = 'export';
}

export function closeSettingsExport(): boolean {
	if (ui.sheet !== 'export' || !settingsNavigation.exportOpen) return false;
	settingsNavigation.exportOpen = false;
	settingsNavigation.fromExport = false;
	settingsNavigation.section = 'export';
	ui.sheet = 'settings';
	return true;
}
