// Project folder: Reads of a character's link racing another character's Unlink.
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import type { FolderLink } from '../../src/lib/project-folder/links.ts';

const studio = vi.hoisted(() => ({
	doc: { id: 'hero' },
	getLink: vi.fn<(id: string) => Promise<FolderLink | null>>(),
	deleteLink: vi.fn<(id: string, linkedAt: string) => Promise<void>>(),
	deleteRecord: vi.fn<() => Promise<void>>()
}));

const character = { images: new Map(), manifest: { name: 'Hero', rig: { animations: [] } } };

vi.mock('../../src/studio/state.svelte.ts', () => ({
	doc: studio.doc,
	store: { project: character, projects: [{ id: 'hero' }, { id: 'mage' }] },
	dismissToast: vi.fn(),
	ui: {}
}));
vi.mock('../../src/studio/download.svelte.ts', () => ({}));
vi.mock('../../src/studio/settingsNavigation.svelte.ts', () => ({}));
vi.mock('../../src/lib/project-folder/support.ts', () => ({
	folderSupport: async () => 'supported'
}));
vi.mock('../../src/lib/project-folder/links.ts', () => ({
	...studio,
	recordKey: (link: FolderLink) => link.linkedAt
}));

function makeLink(characterId: string): FolderLink {
	return {
		characterId,
		linkedAt: `${characterId}-link`,
		handle: { name: 'Game' } as FileSystemDirectoryHandle,
		subfolder: characterId,
		engine: 'generic',
		auto: true
	};
}

function gate() {
	let open!: () => void;
	const wait = new Promise<void>((resolve) => (open = resolve));
	return { open, wait };
}

beforeEach(() => {
	vi.resetModules();
	vi.resetAllMocks();
	vi.stubGlobal('__APP_VERSION__', 'test');
	vi.stubGlobal('__APP_COMMIT__', 'test');
	const identity = <T>(value: T) => value;
	vi.stubGlobal('$state', Object.assign(identity, { raw: identity }));
	vi.stubGlobal('navigator', {});
	studio.doc.id = 'hero';
});

afterEach(() => {
	vi.restoreAllMocks();
	vi.unstubAllGlobals();
	vi.useRealTimers();
});

it('loads the open character’s link even when an offscreen Unlink finishes during the read', async () => {
	vi.useFakeTimers();
	const hero = makeLink('hero');
	const mage = makeLink('mage');
	const links = new Map([
		[hero.characterId, hero],
		[mage.characterId, mage]
	]);
	const unlinkStarted = gate();
	const finishUnlink = gate();
	studio.deleteLink.mockImplementation(async (id, linkedAt) => {
		if (links.get(id)?.linkedAt === linkedAt) links.delete(id);
	});
	studio.deleteRecord.mockImplementation(async () => {
		unlinkStarted.open();
		await finishUnlink.wait;
	});
	const readStarted = gate();
	const finishRead = gate();
	studio.getLink.mockImplementation(async (id) => {
		if (id === mage.characterId) {
			readStarted.open();
			await finishRead.wait;
		}
		return links.get(id) ?? null;
	});
	const api = await import('../../src/studio/projectFolder.svelte.ts');
	await api.loadFolderLink(hero.characterId);
	expect(api.projectFolder.link).toEqual(hero);

	const unlinking = api.unlinkProjectFolder();
	await unlinkStarted.wait;
	studio.doc.id = mage.characterId;
	const opening = api.loadFolderLink(mage.characterId);
	await readStarted.wait;
	try {
		expect(api.projectFolder.link).toBeNull();
		expect(links.has(hero.characterId)).toBe(false);
		expect(links.get(mage.characterId)).toEqual(mage);
	} finally {
		finishUnlink.open();
		await unlinking;
		finishRead.open();
		await opening;
	}

	api.scheduleFolderPublish();
	expect({
		shown: api.projectFolder.link?.characterId,
		pendingPublishes: vi.getTimerCount()
	}).toEqual({ shown: mage.characterId, pendingPublishes: 1 });
});

it('keeps the unlinked status when an older refresh rejects', async () => {
	vi.spyOn(console, 'warn').mockImplementation(() => {});
	let stored: FolderLink | null = makeLink('hero');
	studio.getLink.mockImplementation(async () => stored);
	studio.deleteLink.mockImplementation(async () => {
		stored = null;
	});
	studio.deleteRecord.mockResolvedValue(undefined);
	const api = await import('../../src/studio/projectFolder.svelte.ts');
	await api.loadFolderLink('hero');
	expect(api.projectFolder.link).toEqual(stored);

	const started = gate();
	const fail = gate();
	studio.getLink.mockImplementationOnce(async () => {
		started.open();
		await fail.wait;
		throw new Error('Read failed');
	});
	const refresh = api.loadFolderLink('hero');
	await started.wait;
	try {
		await api.unlinkProjectFolder();
		expect(stored).toBeNull();
		expect(api.projectFolder.link).toBeNull();
		expect(api.projectFolder.status.kind).toBe('idle');
	} finally {
		fail.open();
		await refresh;
	}

	expect(api.projectFolder.link).toBeNull();
	expect(api.projectFolder.status.kind).toBe('idle');
});
