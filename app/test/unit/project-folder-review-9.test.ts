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
