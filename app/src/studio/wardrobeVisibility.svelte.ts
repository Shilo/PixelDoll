import { SvelteMap } from 'svelte/reactivity';
import { workspaceCopy } from '../lib/store/workspace-mode.ts';

const globalKey = 'pixeldoll.wardrobe.hideShared';
const demoKey = 'pixeldoll.wardrobe.showDemo';
const characterPrefix = `${globalKey}:`;
const characterKey = (characterId: string) => `${characterPrefix}${characterId}`;
const choices = new SvelteMap<string, boolean>();

function enabled(key: string) {
	const choice = choices.get(key);
	if (choice !== undefined) return choice;
	try {
		return localStorage.getItem(key) === '1';
	} catch {
		return false;
	}
}

function setEnabled(key: string, value: boolean) {
	choices.set(key, value);
	if (workspaceCopy) return true;
	try {
		if (value) localStorage.setItem(key, '1');
		else localStorage.removeItem(key);
		return true;
	} catch {
		return false;
	}
}

export const demoItemsShown = () => enabled(demoKey);
export const setDemoItemsShown = (show: boolean) => setEnabled(demoKey, show);
export const sharedItemsHiddenForAll = () => enabled(globalKey);
export const setSharedItemsHiddenForAll = (hide: boolean) => setEnabled(globalKey, hide);
export const setSharedItemsHiddenForCharacter = (characterId: string, hide: boolean) =>
	setEnabled(characterKey(characterId), hide);
export const sharedItemsHiddenForCharacter = (characterId: string) =>
	!!characterId && enabled(characterKey(characterId));

export function sharedItemsHidden(characterId: string) {
	return sharedItemsHiddenForAll() || sharedItemsHiddenForCharacter(characterId);
}

function characterOverrides() {
	const keys = new Set([...choices.keys()].filter((key) => key.startsWith(characterPrefix)));
	if (!workspaceCopy) {
		for (let index = 0; index < localStorage.length; index++) {
			const key = localStorage.key(index);
			if (key?.startsWith(characterPrefix)) keys.add(key);
		}
	}
	return keys;
}

export function hasHiddenCharacterWardrobes() {
	try {
		return [...characterOverrides()].some(enabled);
	} catch {
		return true;
	}
}

export function resetHiddenCharacterWardrobes() {
	try {
		let saved = true;
		for (const key of characterOverrides()) if (!setEnabled(key, false)) saved = false;
		return saved;
	} catch {
		return false;
	}
}
