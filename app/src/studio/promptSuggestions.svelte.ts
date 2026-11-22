import { t } from 'svelte-whisper';
import type { CreationSection } from './creationSettings.ts';
import { displayMove } from './displayMove.ts';
import { promptSuggestionDefaults, type SuggestionListKey } from './promptSuggestionDefaults.ts';
import {
	effectiveSuggestions,
	parseSuggestionStorage,
	saveSuggestionList,
	type StoredList,
	type StoredSuggestions
} from './promptSuggestions.ts';

const storageKey = 'pixeldoll.promptSuggestions.v1';
const sectionLists: Record<CreationSection, SuggestionListKey[]> = {
	characters: ['character.look'],
	moves: ['move'],
	states: ['state.pose'],
	items: Object.keys(promptSuggestionDefaults).filter(
		(key): key is Extract<SuggestionListKey, `item.${string}`> => key.startsWith('item.')
	)
};

function readSuggestions() {
	try {
		return parseSuggestionStorage(localStorage.getItem(storageKey));
	} catch {
		return null;
	}
}

let stored = $state.raw(readSuggestions());

export function watchPromptSuggestions() {
	stored = readSuggestions();
	const sync = (event: StorageEvent) => {
		if (event.key === storageKey || event.key === null) stored = readSuggestions();
	};
	window.addEventListener('storage', sync);
	return () => window.removeEventListener('storage', sync);
}

export const defaultSuggestions = (key: SuggestionListKey) =>
	promptSuggestionDefaults[key].map(({ id, action, prompt, titleKey }) => ({
		id,
		action,
		prompt,
		title: titleKey ? t(titleKey) : displayMove(id)
	}));

export const promptSuggestions = (key: SuggestionListKey) =>
	effectiveSuggestions(defaultSuggestions(key), stored?.[key]);

export const suggestionStorageUnreadable = () => stored === null;
export const suggestionListAtDefaults = (key: SuggestionListKey) => stored !== null && !stored[key];
export const suggestionSectionAtDefaults = (section: CreationSection) =>
	sectionLists[section].every(suggestionListAtDefaults);

function persist(next: StoredSuggestions) {
	try {
		if (Object.keys(next).length) localStorage.setItem(storageKey, JSON.stringify(next));
		else localStorage.removeItem(storageKey);
		stored = next;
		return true;
	} catch {
		stored = readSuggestions();
		return false;
	}
}

export function updateSuggestions(
	key: SuggestionListKey,
	update: (list: StoredList) => StoredList
) {
	const current = readSuggestions();
	if (!current) {
		stored = null;
		return false;
	}
	return persist(saveSuggestionList(current, key, update(current[key] ?? {})));
}

export function resetSuggestionLists(keys: readonly SuggestionListKey[]) {
	const next = readSuggestions() ?? {};
	for (const key of keys) delete next[key];
	return persist(next);
}

export function resetSuggestionSection(section: CreationSection) {
	return resetSuggestionLists(sectionLists[section]);
}

export const resetAllSuggestions = () => persist({});
