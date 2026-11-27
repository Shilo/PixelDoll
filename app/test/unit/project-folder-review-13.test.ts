import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import type { FolderLink } from '../../src/lib/project-folder/links.ts';
import { files, memoryFolder } from './project-folder-memory.ts';

const studio = vi.hoisted(() => ({
	getLink: vi.fn<(id: string) => Promise<FolderLink | null>>(),
	updateLink: vi.fn(),
	target: vi.fn(),
	build: vi.fn()
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
	editableData: vi.fn(),
	exportSource: async () => ({ project: character, look: { items: {}, variants: {} } })
}));
vi.mock('../../src/studio/exportLayering.ts', () => ({ exportActionLayering: vi.fn() }));
vi.mock('../../src/studio/settingsNavigation.svelte.ts', () => ({}));
vi.mock('../../src/lib/export/build.ts', () => ({ buildExport: studio.build }));
vi.mock('../../src/lib/project-folder/support.ts', () => ({
	folderSupport: async () => 'supported'
}));
vi.mock('../../src/lib/store/export-settings.ts', () => ({ readExportSettings: async () => ({}) }));
vi.mock('../../src/lib/project-folder/links.ts', () => ({
	getLink: studio.getLink,
	updateLink: studio.updateLink,
	readRecord: async () => ({ written: {}, kept: [] }),
	recordKey: (link: FolderLink) => link.linkedAt
}));
vi.mock('../../src/lib/project-folder/target.ts', async (original) => ({
	...(await original<typeof import('../../src/lib/project-folder/target.ts')>()),
	directoryTarget: studio.target
}));

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
	vi.spyOn(console, 'warn').mockImplementation(() => {});
});

afterEach(() => {
	vi.restoreAllMocks();
	vi.unstubAllGlobals();
	vi.useRealTimers();
});

async function setup() {
	const folder = memoryFolder();
	let link: FolderLink = {
		characterId: 'hero',
		linkedAt: 'hero-link',
		handle: { name: 'Game', queryPermission: async () => 'granted' } as FileSystemDirectoryHandle,
		subfolder: 'hero',
		engine: 'generic',
		auto: true
	};
	studio.getLink.mockImplementation(async () => link);
	studio.updateLink.mockImplementation(async (_id, _linkedAt, patch: Partial<FolderLink>) => {
		link = { ...link, ...patch };
		return link;
	});
	studio.target.mockReturnValue(folder.target);
	studio.build.mockResolvedValue({ kind: 'requested', entries: files({ 'sprite.png': 'hero' }) });
	const api = await import('../../src/studio/projectFolder.svelte.ts');
	await api.loadFolderLink('hero');
	return { api, folder };
}

it('reports an interrupted Update now when its last link check fails', async () => {
	const { api, folder } = await setup();
	const checking = gate();
	const fail = gate();
	const read = folder.target.read;
	folder.target.read = async (path) => {
		if (path === 'sprite.png')
			studio.getLink.mockImplementationOnce(async () => {
				checking.open();
				await fail.wait;
				throw new Error('Link storage temporarily unavailable');
			});
		return read(path);
	};
	const updating = api.publishProjectFolder();
	await checking.wait;
	try {
		expect(api.projectFolder.status.kind).toBe('publishing');
		expect(folder.text('sprite.png')).toBeNull();
	} finally {
		fail.open();
		await updating;
	}
	expect(folder.log).toEqual([]);
	expect(api.projectFolder.status).toEqual({ kind: 'failed', reason: 'unknown' });
});

it('does not report a failed automatic read overtaken by turning off automatic updates', async () => {
	vi.useFakeTimers();
	const { api, folder } = await setup();
	const checking = gate();
	const fail = gate();
	studio.getLink.mockImplementationOnce(async () => {
		checking.open();
		await fail.wait;
		throw new Error('Link storage temporarily unavailable');
	});
	api.scheduleFolderPublish();
	await vi.advanceTimersByTimeAsync(1500);
	await checking.wait;
	try {
		await api.setFolderAutoPublish(false);
		expect(api.projectFolder.link?.auto).toBe(false);
		expect(api.projectFolder.status.kind).toBe('idle');
	} finally {
		fail.open();
		await vi.advanceTimersByTimeAsync(0);
	}
	expect(folder.log).toEqual([]);
	expect(api.projectFolder.status.kind).toBe('idle');
});
