import { afterEach, expect, test, vi } from 'vitest';

afterEach(() => vi.unstubAllGlobals());

test('the global filter masks individual wardrobes without changing their preferences', async () => {
	const storage = new Map([['pixeldoll.wardrobe.hideShared:', '1']]);
	vi.stubGlobal('localStorage', {
		getItem: (key: string) => storage.get(key) ?? null,
		setItem: (key: string, value: string) => void storage.set(key, value),
		removeItem: (key: string) => void storage.delete(key)
	});
	const {
		demoItemsShown,
		setDemoItemsShown,
		setSharedItemsHiddenForAll,
		setSharedItemsHiddenForCharacter,
		sharedItemsHidden
	} = await import('../../src/studio/wardrobeVisibility.svelte.ts');
	const demoId = 'fixture:s2';

	setSharedItemsHiddenForCharacter(demoId, true);
	setDemoItemsShown(true);
	expect(sharedItemsHidden(demoId)).toBe(true);
	expect(sharedItemsHidden('saved')).toBe(false);
	expect(sharedItemsHidden('')).toBe(false);

	setSharedItemsHiddenForAll(true);
	expect(sharedItemsHidden(demoId)).toBe(true);
	expect(sharedItemsHidden('saved')).toBe(true);
	expect(sharedItemsHidden('')).toBe(true);

	setSharedItemsHiddenForAll(false);
	expect(sharedItemsHidden(demoId)).toBe(true);
	expect(sharedItemsHidden('saved')).toBe(false);
	expect(demoItemsShown()).toBe(true);
});
