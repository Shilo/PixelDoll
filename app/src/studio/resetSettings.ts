import type { WhisperKey } from 'svelte-whisper';
import { selectLanguage } from '../lib/i18n.ts';
import { defaultExportSettings, resetExportSettings } from '../lib/store/export-settings.ts';
import { setDeveloperMode } from './developerMode.svelte.ts';
import { noteExportSettings } from './settingsDefaults.svelte.ts';
import { setTheme } from './state.svelte.ts';
import { setDemoItemsShown, setSharedItemsHiddenForAll } from './wardrobeVisibility.svelte.ts';

const resettableSections = ['general', 'wardrobe', 'export', 'developer'] as const;
type ResettableSection = (typeof resettableSections)[number];
export type ResetScope = ResettableSection | 'all';

export function isResettableSection(section: string | null): section is ResettableSection {
	return resettableSections.some((value) => value === section);
}

export async function resetSettings(scope: ResetScope): Promise<WhisperKey[]> {
	const failures: WhisperKey[] = [];
	if ((scope === 'all' || scope === 'general') && !setTheme('dark'))
		failures.push('settings.theme');
	if (scope === 'all' || scope === 'wardrobe') {
		const shared = setSharedItemsHiddenForAll(false);
		const demo = setDemoItemsShown(false);
		if (!shared || !demo) failures.push('experience.tabWardrobe');
	}
	if ((scope === 'all' || scope === 'developer') && !setDeveloperMode(false))
		failures.push('developer.title');
	if (scope === 'all' || scope === 'export') {
		try {
			await resetExportSettings();
			noteExportSettings(defaultExportSettings());
		} catch (error) {
			console.warn('Could not reset export settings.', error);
			failures.push('export.sheet.title');
		}
	}
	if (scope === 'all' || scope === 'general') {
		try {
			if (!(await selectLanguage())) failures.push('language.label');
		} catch (error) {
			console.warn('Could not reset the language.', error);
			failures.push('language.label');
		}
	}
	return failures;
}
