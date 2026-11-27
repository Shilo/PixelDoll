// Project folder: The first-link offer across tabs, refreshes and retries, and reusing an export time that reproduces the
// manifest already in the folder.
import { afterEach, expect, it, vi } from 'vitest';
import type { FolderLink } from '../../src/lib/project-folder/links.ts';
import type { FolderRecord } from '../../src/lib/project-folder/plan.ts';
import { domError, files, memoryFolder } from './project-folder-memory.ts';

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

it('shows a newly persisted offer when a second tab refreshes the same link', async () => {
	const { api, openTab, link } = await setup({
		[sprite]: 'sprite',
		[extra]: 'extra',
		[manifest]: manifestText(earlier)
	});
	const building = gate();
	const resume = gate();
	const build = studio.build.getMockImplementation()!;
	studio.build.mockImplementationOnce(async (project, options) => {
		building.open();
		await resume.wait;
		return build(project, options);
	});
	const linking = api.linkProjectFolder('generic');
	await building.wait;
	const second = await openTab();
	expect(second.projectFolder.link?.linkedAt).toBe(link()?.linkedAt);
	expect(second.projectFolder.offer).toBeNull();
	resume.open();
	await linking;
	expect(link()?.offered).toHaveLength(3);

	await second.loadFolderLink('hero');

	expect(second.projectFolder.link?.offered).toHaveLength(3);
	expect(second.projectFolder.offer?.files).toHaveLength(3);
});

it('clears a declined offer when a second tab refreshes the same link', async () => {
	const { api, openTab, link, folder } = await setup({
		[sprite]: 'sprite',
		[extra]: 'extra',
		[manifest]: manifestText(earlier)
	});
	await api.linkProjectFolder('generic');
	const second = await openTab();
	expect(second.projectFolder.offer?.files).toHaveLength(3);
	await api.leaveMatchingFiles();
	// Declining is recorded as an empty offer, so a retry of the first publish does not ask again.
	expect(link()?.offered).toEqual([]);
	expect(folder.record.written).toEqual({});

	await second.loadFolderLink('hero');

	expect(second.projectFolder.link?.offered).toEqual([]);
	expect(second.projectFolder.offer).toBeNull();
});

it('offers matching foreign files after recovering from a failed first publish', async () => {
	const { api, folder, link } = await setup({ [sprite]: 'sprite', [extra]: 'extra' });
	vi.spyOn(console, 'warn').mockImplementation(() => {});
	folder.failRead = (path) => (path === extra ? domError('NotReadableError') : undefined);
	await api.linkProjectFolder('generic');
	expect(api.projectFolder.status).toEqual({ kind: 'failed', reason: 'locked' });
	expect(folder.text(manifest)).toBeNull();
	expect(folder.log).toEqual([]);
	expect(folder.record.written).toEqual({});
	folder.failRead = undefined;

	await api.publishProjectFolder();

	expect(api.projectFolder.status.kind).toBe('done');
	expect(folder.log).toEqual([`write ${manifest}`]);
	expect(Object.hasOwn(folder.record.written, sprite)).toBe(false);
	expect(Object.hasOwn(folder.record.written, extra)).toBe(false);
	expect(link()?.offered?.map(({ path }) => path)).toEqual([sprite, extra]);
});

it('fills a missing file on retry without requiring a timestamp-only replacement', async () => {
	const { api, folder, link } = await setup({
		[sprite]: 'game edit',
		[manifest]: manifestText(earlier)
	});
	await api.linkProjectFolder('generic');
	expect(api.projectFolder.status).toMatchObject({
		kind: 'blocked',
		conflicts: [{ path: sprite }]
	});
	expect(api.projectFolder.offer?.files.map(({ path }) => path)).toEqual([manifest]);
	expect(link()?.exportedAt).toBe(earlier);
	expect(folder.record.written).toEqual({});
	folder.set(sprite, 'sprite');

	await api.publishProjectFolder();

	expect(folder.text(manifest)).toBe(manifestText(earlier));
	const status = api.projectFolder.status;
	const conflicts = status.kind === 'blocked' ? status.conflicts.map(({ path }) => path) : [];
	expect({ status: status.kind, conflicts, writes: folder.log }).toEqual({
		status: 'done',
		conflicts: [],
		writes: [`write ${extra}`]
	});
});

it('offers matching files when the retry finds the entire earlier export already in place', async () => {
	const { api, folder, link } = await setup({
		[sprite]: 'sprite',
		[extra]: 'extra',
		[manifest]: manifestText(earlier)
	});
	vi.spyOn(console, 'warn').mockImplementation(() => {});
	folder.failRead = (path) => (path === extra ? domError('NotReadableError') : undefined);
	await api.linkProjectFolder('generic');
	expect(api.projectFolder.status).toEqual({ kind: 'failed', reason: 'locked' });
	expect(link()?.exportedAt).toBe(earlier);
	expect(link()?.files).toBeUndefined();
	expect(link()?.offered).toBeUndefined();
	expect(folder.record.written).toEqual({});
	folder.failRead = undefined;

	await api.publishProjectFolder();

	expect(api.projectFolder.status.kind).toBe('done');
	expect(folder.log).toEqual([]);
	expect(folder.record.written).toEqual({});
	expect(api.projectFolder.offer?.files.map(({ path }) => path)).toEqual([sprite, extra, manifest]);
});

it('honors an approved sprite replacement without requiring a timestamp-only manifest edit', async () => {
	const { api, folder } = await setup({
		[sprite]: 'game edit',
		[manifest]: manifestText(earlier)
	});
	await api.linkProjectFolder('generic');
	const status = api.projectFolder.status;
	expect(status).toMatchObject({ kind: 'blocked', conflicts: [{ path: sprite }] });
	expect(folder.log).toEqual([]);
	if (status.kind !== 'blocked') throw new Error('Expected the sprite conflict');

	await api.publishProjectFolder(
		new Map(status.conflicts.map(({ path, found }) => [path, found!])),
		status.linkedAt
	);

	expect(folder.text(manifest)).toBe(manifestText(earlier));
	const result = api.projectFolder.status;
	const conflicts = result.kind === 'blocked' ? result.conflicts.map(({ path }) => path) : [];
	expect({ status: result.kind, conflicts }).toEqual({ status: 'done', conflicts: [] });
	expect(folder.log).toEqual([`write ${sprite}`, `write ${extra}`]);
	expect(Object.hasOwn(folder.record.written, manifest)).toBe(false);
});

it('keeps the offer dismissed when a refresh reads it while the decline is being saved', async () => {
	const { api, folder, link } = await setup({
		[sprite]: 'sprite',
		[extra]: 'extra',
		[manifest]: manifestText(earlier)
	});
	await api.linkProjectFolder('generic');
	expect(api.projectFolder.offer?.files).toHaveLength(3);
	expect(link()?.offered).toHaveLength(3);
	const saving = gate();
	const resume = gate();
	const update = studio.updateLink.getMockImplementation()!;
	studio.updateLink.mockImplementationOnce(async (id, linkedAt, patch) => {
		saving.open();
		await resume.wait;
		return update(id, linkedAt, patch);
	});

	const decline = api.leaveMatchingFiles();
	await saving.wait;
	const clearedOnClick = api.projectFolder.offer === null;
	try {
		await api.loadFolderLink('hero');
	} finally {
		resume.open();
		await decline;
	}

	expect(clearedOnClick).toBe(true);
	expect(link()?.offered).toEqual([]);
	expect(api.projectFolder.link?.offered).toEqual([]);
	expect(folder.record.written).toEqual({});
	expect(api.projectFolder.offer).toBeNull();
});

it('does not read a kept manifest when publishing other changed files', async () => {
	const { api, folder, link } = await setup({});
	await api.linkProjectFolder('generic');
	expect(api.projectFolder.status.kind).toBe('done');
	expect(link()?.files).toHaveProperty([manifest]);
	expect(folder.log).toEqual([`write ${sprite}`, `write ${extra}`, `write ${manifest}`]);

	folder.record.kept.push(manifest);
	folder.set(manifest, 'user-owned manifest');
	const read = vi.spyOn(folder.target, 'read');
	studio.build.mockImplementation(async (_, { exportedAt }) => ({
		kind: 'requested',
		entries: files({
			[sprite]: 'new sprite',
			[extra]: 'extra',
			[manifest]: manifestText(exportedAt)
		})
	}));

	await api.publishProjectFolder();

	expect(api.projectFolder.status).toMatchObject({ kind: 'done', kept: 1 });
	expect(folder.text(sprite)).toBe('new sprite');
	expect(folder.text(manifest)).toBe('user-owned manifest');
	expect(read).not.toHaveBeenCalledWith(manifest);
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
