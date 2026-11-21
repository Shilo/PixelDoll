import type { WhisperKey } from 'svelte-whisper';
import { selectLanguage } from '../lib/i18n.ts';
import { resetExportSettings } from '../lib/store/export-settings.ts';
import { setDeveloperMode } from './developerMode.svelte.ts';
import { setTheme } from './state.svelte.ts';
import { setDemoItemsShown, setSharedItemsHiddenForAll } from './wardrobeVisibility.svelte.ts';

export async function resetSettings(): Promise<WhisperKey[]> {
	const failures: WhisperKey[] = [];
	if (!setTheme('dark')) failures.push('settings.theme');
	const shared = setSharedItemsHiddenForAll(false);
	const demo = setDemoItemsShown(false);
	if (!shared || !demo) failures.push('experience.tabWardrobe');
	if (!setDeveloperMode(false)) failures.push('developer.title');
	try {
		await resetExportSettings();
	} catch (error) {
		console.warn('Could not reset export settings.', error);
		failures.push('export.sheet.title');
	}
	try {
		if (!(await selectLanguage())) failures.push('language.label');
	} catch (error) {
		console.warn('Could not reset the language.', error);
		failures.push('language.label');
	}
	return failures;
}
