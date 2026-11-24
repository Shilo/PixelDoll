import type { WhisperKey } from 'svelte-whisper';
import { selectLanguage } from '../lib/i18n.ts';
import { defaultExportSettings, resetExportSettings } from '../lib/store/export-settings.ts';
import { setDeveloperMode } from './developerMode.svelte.ts';
import { resetMount } from './experience/riderPose.ts';
import { resetLiveViews } from './experience/liveViews.ts';
import { applyRiderPose } from './mountPreview.ts';
import {
	getCreationSettings,
	noteCreationSettings,
	noteExportSettings
} from './settingsDefaults.svelte.ts';
import { creationSections, creationSettingsKey, isCreationSection } from './creationSettings.ts';
import { resetAllSuggestions, resetSuggestionSection } from './promptSuggestions.svelte.ts';
import { workspaceCopy } from '../lib/store/workspace-mode.ts';
import { settingsLabels } from './settingsNavigation.svelte.ts';
import { doc, isDemo, refreshShared, setTheme, store } from './state.svelte.ts';
import {
	demoItemsShown,
	resetHiddenCharacterWardrobes,
	setDemoItemsShown,
	setSharedItemsHiddenForAll,
	setSharedItemsHiddenForCharacter
} from './wardrobeVisibility.svelte.ts';

const resettableSections = [
	'general',
	'wardrobe',
	'mount',
	'live',
	'export',
	'developer',
	...creationSections
] as const;
type ResettableSection = (typeof resettableSections)[number];
export type ResetScope = ResettableSection | 'all';

export function isResettableSection(section: string | null): section is ResettableSection {
	return resettableSections.some((value) => value === section);
}

export async function resetSettings(scope: ResetScope): Promise<WhisperKey[]> {
	const failures: WhisperKey[] = [];
	const sections = scope === 'all' ? creationSections : isCreationSection(scope) ? [scope] : [];
	for (const section of workspaceCopy ? [] : sections) {
		if ('unavailable' in getCreationSettings(section)) continue;
		try {
			localStorage.removeItem(creationSettingsKey(section));
		} catch {
			failures.push(settingsLabels[section]);
		}
	}
	if (!workspaceCopy && sections.length) noteCreationSettings();
	if (!workspaceCopy) {
		if (scope === 'all' && !resetAllSuggestions()) failures.push('promptSuggestions.heading');
		else if (isCreationSection(scope) && !resetSuggestionSection(scope))
			failures.push('promptSuggestions.heading');
	}
	if ((scope === 'all' || scope === 'general') && !setTheme('dark'))
		failures.push('settings.theme');
	if (scope === 'all' || scope === 'wardrobe') {
		const refresh = demoItemsShown() && store.project && !isDemo();
		const shared = setSharedItemsHiddenForAll(false);
		const demo = setDemoItemsShown(false);
		const character =
			scope === 'all'
				? resetHiddenCharacterWardrobes()
				: !doc.id || setSharedItemsHiddenForCharacter(doc.id, false);
		if (refresh) await refreshShared();
		if (!shared || !demo || !character) failures.push('experience.tabWardrobe');
	}
	if (scope === 'all' || scope === 'mount') {
		const saved = resetMount(scope === 'all' ? null : doc.id);
		applyRiderPose();
		if (!saved) failures.push('settings.mount');
	}
	if ((scope === 'all' || scope === 'live') && !resetLiveViews(scope === 'all' ? null : doc.id))
		failures.push('liveViews.title');
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
