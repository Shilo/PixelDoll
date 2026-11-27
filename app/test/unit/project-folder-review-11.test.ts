import { afterEach, expect, it, vi } from 'vitest';
import type { FolderLink } from '../../src/lib/project-folder/links.ts';
import type { FolderRecord } from '../../src/lib/project-folder/plan.ts';
import { files, memoryFolder } from './project-folder-memory.ts';

type UpdateLink = (
	id: string,
	linkedAt: string,
	patch: Partial<FolderLink>
) => Promise<FolderLink | null>;

const studio = vi.hoisted(() => ({
	getLink: vi.fn<(id: string) => Promise<FolderLink | null>>(),
	replaceLink: vi.fn<(link: FolderLink) => Promise<FolderLink>>(),
	updateLink: vi.fn<UpdateLink>(),
	readRecord: vi.fn<() => Promise<FolderRecord>>(),
	recordWritten: vi.fn<(key: string, path: string, hash: string | null) => Promise<void>>(),
	build: vi.fn<(project: unknown, options: { exportedAt: string }) => unknown>(),
	target: vi.fn()
}));

const character = { images: new Map(), manifest: { name: 'Hero', rig: { animations: [] } } };

vi.mock('../../src/studio/state.svelte.ts', () => ({
	doc: { id: 'hero' },
	store: { project: character, projects: [{ id: 'hero' }] },
	prepareWorkspaceExport: async () => {},
	dismissToast: vi.fn(),
	toast: vi.fn(),
	ui: {}
}));
vi.mock('../../src/studio/download.svelte.ts', () => ({
	characterZipId: () => 'hero',
	editableData: vi.fn(),
	exportSource: async () => ({ project: character, look: { items: {}, variants: {} } })
}));
vi.mock('../../src/studio/exportLayering.ts', () => ({ exportActionLayering: vi.fn() }));
vi.mock('../../src/studio/settingsNavigation.svelte.ts', () => ({ openSettings: vi.fn() }));
vi.mock('../../src/lib/export/build.ts', () => ({ buildExport: studio.build }));
vi.mock('../../src/lib/project-folder/support.ts', () => ({
	folderSupport: async () => 'supported'
}));
vi.mock('../../src/lib/store/export-settings.ts', () => ({
	readExportSettings: async () => ({ engine: 'generic' })
}));
vi.mock('../../src/lib/project-folder/links.ts', () => ({
	...studio,
	allLinks: async () => [],
	recordKey: (link: FolderLink) => link.linkedAt
}));
vi.mock('../../src/lib/project-folder/target.ts', async (importOriginal) => ({
	...(await importOriginal<typeof import('../../src/lib/project-folder/target.ts')>()),
	directoryTarget: studio.target
}));

const sprite = 'sprite.png';
const extra = 'extra.png';
const manifest = 'manifest.json';
const earlier = '2025-02-02T00:00:00.000Z';
const manifestText = (exportedAt: string) => JSON.stringify({ export: { exportedAt } });

function gate() {
	let open!: () => void;
	const wait = new Promise<void>((resolve) => (open = resolve));
	return { open, wait };
}

async function setup(initial: Record<string, string>) {
	vi.resetAllMocks();
	vi.stubGlobal('__APP_VERSION__', 'test');
	vi.stubGlobal('__APP_COMMIT__', 'test');
	const identity = <T>(value: T) => value;
	vi.stubGlobal('$state', Object.assign(identity, { raw: identity }));
	vi.stubGlobal('navigator', {
		locks: { request: (_name: string, work: () => Promise<unknown>) => work() }
	});
	vi.stubGlobal('showDirectoryPicker', async () => ({
		name: 'Game',
		queryPermission: async () => 'granted'
	}));
	const folder = memoryFolder(initial);
	let link: FolderLink | null = null;
	studio.getLink.mockImplementation(async (id) => (link?.characterId === id ? link : null));
	studio.replaceLink.mockImplementation(async (fresh) => (link = fresh));
	studio.updateLink.mockImplementation(async (id, linkedAt, patch) =>
		link?.characterId === id && link.linkedAt === linkedAt ? (link = { ...link, ...patch }) : null
	);
	studio.readRecord.mockImplementation(async () => structuredClone(folder.record));
	studio.recordWritten.mockImplementation(async (_key, path, hash) => {
		if (hash === null) delete folder.record.written[path];
		else folder.record.written[path] = hash;
	});
	studio.target.mockReturnValue(folder.target);
	studio.build.mockImplementation(async (_, { exportedAt }) => ({
		kind: 'requested',
		entries: files({ [sprite]: 'sprite', [extra]: 'extra', [manifest]: manifestText(exportedAt) })
	}));
	const openTab = async () => {
		vi.resetModules();
		const api = await import('../../src/studio/projectFolder.svelte.ts');
		await api.loadFolderLink('hero');
		return api;
	};
	return { api: await openTab(), openTab, folder, link: () => link };
}

afterEach(() => {
	vi.restoreAllMocks();
	vi.unstubAllGlobals();
});

it('keeps a persisted decline when the picker tab has yet to start its first publish', async () => {
	const { api, openTab, folder, link } = await setup({
		[sprite]: 'sprite',
		[extra]: 'extra',
		[manifest]: manifestText(earlier)
	});
	const committed = gate();
	const resume = gate();
	const replace = studio.replaceLink.getMockImplementation()!;
	studio.replaceLink.mockImplementationOnce(async (fresh) => {
		const saved = await replace(fresh);
		committed.open();
		await resume.wait;
		return saved;
	});

	const linking = api.linkProjectFolder('generic');
	await committed.wait;
	try {
		const second = await openTab();
		await second.publishProjectFolder();
		expect(second.projectFolder.offer?.files).toHaveLength(3);
		await second.leaveMatchingFiles();
		expect(second.projectFolder.offer).toBeNull();
		expect(link()?.offered).toEqual([]);
	} finally {
		resume.open();
		await linking;
	}

	expect(folder.log).toEqual([]);
	expect(folder.record.written).toEqual({});
	expect({ shown: api.projectFolder.offer, stored: link()?.offered }).toEqual({
		shown: null,
		stored: []
	});
});

it('uses the on-disk manifest time for an established link when only its time differs', async () => {
	const { api, folder, link } = await setup({});
	await api.linkProjectFolder('generic');
	expect(api.projectFolder.status.kind).toBe('done');
	expect(link()?.exportedAt).toBeDefined();
	expect(link()?.exportedAt).not.toBe(earlier);

	folder.set(sprite, 'game edit');
	folder.set(manifest, manifestText(earlier));
	const writes = [...folder.log];
	await api.publishProjectFolder();
	const status = api.projectFolder.status;
	if (status.kind !== 'blocked') throw new Error('Expected the sprite conflict');
	expect(status.conflicts.map(({ path }) => path)).toContain(sprite);
	expect(folder.text(sprite)).toBe('game edit');
	expect(folder.text(manifest)).toBe(manifestText(earlier));
	expect(folder.log).toEqual(writes);

	const spriteConflict = status.conflicts.find(({ path }) => path === sprite)!;
	await api.publishProjectFolder(new Map([[sprite, spriteConflict.found!]]), status.linkedAt);

	expect({
		status: api.projectFolder.status.kind,
		initialConflicts: status.conflicts.map(({ path }) => path),
		manifest: folder.text(manifest),
		writes: folder.log.slice(writes.length)
	}).toEqual({
		status: 'done',
		initialConflicts: [sprite],
		manifest: manifestText(earlier),
		writes: [`write ${sprite}`]
	});
});

it('keeps the replacement link and its offer when a pre-relink refresh finishes late', async () => {
	const { api, link } = await setup({
		[sprite]: 'sprite',
		[extra]: 'extra',
		[manifest]: manifestText(earlier)
	});
	await api.linkProjectFolder('generic');
	const oldId = link()?.linkedAt;
	await api.leaveMatchingFiles();
	expect(link()?.offered).toEqual([]);

	const reading = gate();
	const resume = gate();
	const getLink = studio.getLink.getMockImplementation()!;
	studio.getLink.mockImplementationOnce(async (id) => {
		const stale = await getLink(id);
		reading.open();
		await resume.wait;
		return stale;
	});
	const refresh = api.loadFolderLink('hero');
	await reading.wait;
	let newId: string | undefined;
	try {
		await api.linkProjectFolder('generic');
		newId = link()?.linkedAt;
		expect(newId).toBeDefined();
		expect(newId).not.toBe(oldId);
		expect(api.projectFolder.link?.linkedAt).toBe(newId);
		expect(api.projectFolder.offer?.linkedAt).toBe(newId);
	} finally {
		resume.open();
		await refresh;
	}

	expect({
		stored: link()?.linkedAt,
		shown: api.projectFolder.link?.linkedAt,
		offer: api.projectFolder.offer?.linkedAt
	}).toEqual({ stored: newId, shown: newId, offer: newId });
});
