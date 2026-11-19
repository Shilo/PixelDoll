import { SvelteMap } from 'svelte/reactivity';

const globalKey = 'pixeldoll.wardrobe.hideShared';
const characterKey = (characterId: string) => `${globalKey}:${characterId}`;
const choices = new SvelteMap<string, boolean>();

function hidden(key: string) {
	const choice = choices.get(key);
	if (choice !== undefined) return choice;
	try {
		return localStorage.getItem(key) === '1';
	} catch {
		return false;
	}
}

function setHidden(key: string, hide: boolean) {
	choices.set(key, hide);
	try {
		if (hide) localStorage.setItem(key, '1');
		else localStorage.removeItem(key);
		return true;
	} catch {
		return false;
	}
}

export const sharedItemsHiddenForAll = () => hidden(globalKey);
export const setSharedItemsHiddenForAll = (hide: boolean) => setHidden(globalKey, hide);
export const setSharedItemsHiddenForCharacter = (characterId: string, hide: boolean) =>
	setHidden(characterKey(characterId), hide);

export function sharedItemsHidden(characterId: string) {
	return sharedItemsHiddenForAll() || hidden(characterKey(characterId));
}
