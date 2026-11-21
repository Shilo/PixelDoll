import { ui } from './state.svelte.ts';
import type { WhisperKey } from 'svelte-whisper';

export type SettingsSection = 'general' | 'wardrobe' | 'export' | 'pixellab' | 'about';

export const settingsLabels = {
	general: 'settings.appearance',
	wardrobe: 'experience.tabWardrobe',
	export: 'export.sheet.title',
	pixellab: 'settings.connection',
	about: 'settings.about'
} satisfies Record<SettingsSection, WhisperKey>;

export const settingsNavigation = $state<{
	section: SettingsSection | null;
	fromExport: boolean;
	accountOpen: boolean;
}>({ section: null, fromExport: false, accountOpen: false });

export function openSettings(section: SettingsSection | null = null) {
	settingsNavigation.fromExport = ui.sheet === 'export';
	settingsNavigation.section = section;
	ui.sheet = 'settings';
}

export function backFromSettings(): boolean {
	if (closeSettingsAccount()) return true;
	if (ui.sheet !== 'settings') return false;
	if (settingsNavigation.fromExport) ui.sheet = 'export';
	else if (settingsNavigation.section) settingsNavigation.section = null;
	else return false;
	return true;
}

export function openSettingsAccount() {
	settingsNavigation.accountOpen = true;
	ui.sheet = 'connect';
}

export function closeSettingsAccount(): boolean {
	if (ui.sheet !== 'connect' || !settingsNavigation.accountOpen) return false;
	settingsNavigation.accountOpen = false;
	ui.sheet = 'settings';
	return true;
}
