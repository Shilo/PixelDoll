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
	vi.resetModules();
	const api = await import('../../src/studio/projectFolder.svelte.ts');
	await api.loadFolderLink('hero');
	return { api, folder, link: () => link };
}

afterEach(() => {
	vi.restoreAllMocks();
	vi.unstubAllGlobals();
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
