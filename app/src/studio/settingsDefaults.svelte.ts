import { fromStore } from 'svelte/store';
import { languagePreference } from '../lib/i18n.ts';
import {
	defaultExportSettings,
	readExportSettings,
	subscribeExportSettings,
	type ExportSettings
} from '../lib/store/export-settings.ts';
import { workspaceCopy } from '../lib/store/workspace-mode.ts';
import { developerModeEnabled } from './developerMode.svelte.ts';
import { mountAtDefaults, ridingPosesSaved } from './experience/riderPose.ts';
import {
	creationDefaults,
	creationSections,
	creationSettingsKey,
	readCreationSettings,
	type CreationSection
} from './creationSettings.ts';
import type { ResetScope } from './resetSettings.ts';
import { suggestionSectionAtDefaults } from './promptSuggestions.svelte.ts';
import { doc, ui } from './state.svelte.ts';
import {
	demoItemsShown,
	hasHiddenCharacterWardrobes,
	sharedItemsHiddenForAll,
	sharedItemsHiddenForCharacter
} from './wardrobeVisibility.svelte.ts';

const language = fromStore(languagePreference);
// Unknown until read; an unreadable record counts as changed so Reset stays available to repair it.
let exportDefaults = $state<boolean | null>(null);
let exportPagesShown = 0;

export function getCreationSettings<Section extends CreationSection>(section: Section) {
	try {
		return readCreationSettings(localStorage, section);
	} catch {
		return { values: creationDefaults[section], valid: false, unavailable: true } as const;
	}
}

let creationRevision = $state(0);
export const creationSettingsRevision = () => creationRevision;
export function noteCreationSettings() {
	creationRevision++;
}

export function currentCreationSettings<Section extends CreationSection>(section: Section) {
	void creationRevision;
	return getCreationSettings(section);
}

export function watchCreationSettings() {
	if (workspaceCopy) return () => {};
	noteCreationSettings();
	const onStorage = (event: StorageEvent) => {
		if (
			event.key === null ||
			creationSections.some((section) => creationSettingsKey(section) === event.key)
		)
			noteCreationSettings();
	};
	window.addEventListener('storage', onStorage);
	return () => window.removeEventListener('storage', onStorage);
}

function creationAtDefaults(section: CreationSection) {
	const current = currentCreationSettings(section);
	if ('unavailable' in current) return suggestionSectionAtDefaults(section);
	return (
		suggestionSectionAtDefaults(section) &&
		current.valid &&
		Object.entries(creationDefaults[section]).every(
			([key, value]) => (current.values as Record<string, unknown>)[key] === value
		)
	);
}

function isDefaultExport(settings: ExportSettings) {
	const defaults = defaultExportSettings();
	return (
		settings.engine === defaults.engine &&
		settings.dressedCharacterSheets === defaults.dressedCharacterSheets &&
		settings.playOnce.length === 0
	);
}

/** Export's own loaded preferences; `null` when they could not be read. */
export function noteExportSettings(settings: ExportSettings | null) {
	exportDefaults = settings ? isDefaultExport(settings) : false;
}

/** While Export's settings page is mounted it refreshes itself, so the watcher below skips its reads. */
export function showExportSettings() {
	exportPagesShown++;
	return () => void exportPagesShown--;
}

/** One read when Settings opens, then only on Export's change notifications. */
export function watchExportDefaults() {
	if (workspaceCopy) return () => {};
	let active = true,
		request = 0;
	async function refresh() {
		if (exportPagesShown) return;
		const current = ++request;
		try {
			const settings = await readExportSettings();
			if (active && current === request && !exportPagesShown) noteExportSettings(settings);
		} catch (error) {
			console.warn('Could not check export settings for Reset.', error);
			if (active && current === request && !exportPagesShown) noteExportSettings(null);
		}
	}
	void refresh();
	const unsubscribe = subscribeExportSettings(() => void refresh());
	return () => {
		active = false;
		unsubscribe();
	};
}

const atDefaults = {
	// An explicit language, even the detected one, is a saved choice that Reset clears.
	general: () => ui.theme === 'dark' && language.current === undefined,
	wardrobe: () =>
		!sharedItemsHiddenForAll() && !demoItemsShown() && !sharedItemsHiddenForCharacter(doc.id),
	mount: () => mountAtDefaults(doc.id),
	export: () => exportDefaults === true,
	developer: () => !developerModeEnabled(),
	characters: () => creationAtDefaults('characters'),
	moves: () => creationAtDefaults('moves'),
	states: () => creationAtDefaults('states'),
	items: () => creationAtDefaults('items')
};

export function settingsAtDefaults(scope: ResetScope) {
	return scope === 'all'
		? Object.values(atDefaults).every((check) => check()) &&
				!hasHiddenCharacterWardrobes() &&
				!ridingPosesSaved()
		: atDefaults[scope]();
}
