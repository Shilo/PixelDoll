import { doc, ui } from './state.svelte.ts';
import type { WhisperKey } from 'svelte-whisper';
import type { CreationSection } from './creationSettings.ts';

export type SettingsSection =
	| 'general'
	| 'wardrobe'
	| 'mount'
	| 'export'
	| 'pixellab'
	| 'library'
	| 'developer'
	| 'about'
	| CreationSection;

export const settingsLabels = {
	general: 'settings.appearance',
	wardrobe: 'experience.tabWardrobe',
	mount: 'settings.mount',
	characters: 'creationSettings.character',
	moves: 'creationSettings.move',
	states: 'creationSettings.state',
	items: 'creationSettings.item',
	export: 'export.sheet.title',
	pixellab: 'settings.connection',
	library: 'librarySettings.title',
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
}>({
	section: null,
	fromExport: false,
	accountOpen: false,
	accountReplace: false,
	activityOpen: false,
	costOpen: false,
	exportOpen: false
});

let returnFocus: 'connection' | 'recent-activity' | 'cost-estimate' | undefined;

export function takeSettingsReturnFocus() {
	const entry = returnFocus;
	returnFocus = undefined;
	return entry;
}

export function openSettings(section: SettingsSection | null = null) {
	returnFocus = undefined;
	settingsNavigation.fromExport = ui.sheet === 'export';
	settingsNavigation.section = section;
	ui.sheet = 'settings';
}

export function backFromSettings(): boolean {
	if (
		closeSettingsAccount() ||
		closeSettingsActivity() ||
		closeSettingsCost() ||
		closeSettingsExport()
	)
		return true;
	if (ui.sheet !== 'settings') return false;
	if (settingsNavigation.fromExport) ui.sheet = 'export';
	else if (settingsNavigation.section) settingsNavigation.section = null;
	else return false;
	return true;
}

export function openSettingsAccount(replace = false) {
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
