import { SvelteMap } from 'svelte/reactivity';

const globalKey = 'pixeldoll.wardrobe.hideShared';
const demoKey = 'pixeldoll.wardrobe.showDemo';
const characterKey = (characterId: string) => `${globalKey}:${characterId}`;
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

export function sharedItemsHidden(characterId: string) {
	return (
		sharedItemsHiddenForAll() ||
		(!characterId.startsWith('fixture:') && enabled(characterKey(characterId)))
	);
}
