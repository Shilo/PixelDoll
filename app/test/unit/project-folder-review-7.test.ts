import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import type { FolderLink } from '../../src/lib/project-folder/links.ts';
import type { FolderRecord } from '../../src/lib/project-folder/plan.ts';
import { domError, files, memoryFolder } from './project-folder-memory.ts';

type BuildOptions = { look: { items: { hat: string } }; exportedAt: string };

const studio = vi.hoisted(() => ({
	doc: { id: 'hero', items: { hat: 'original' }, variants: {} },
	store: { projects: [{ id: 'hero' }, { id: 'mage' }] },
	getLink: vi.fn(),
	replaceLink: vi.fn(),
	updateLink: vi.fn(),
	readRecord: vi.fn<(key: string) => Promise<FolderRecord>>(),
	recordWritten: vi.fn<(key: string, path: string, hash: string | null) => Promise<void>>(),
	buildExport: vi.fn<(project: unknown, options: BuildOptions) => unknown>(),
	toast: vi.fn()
}));

vi.mock('../../src/studio/state.svelte.ts', () => ({
	...studio,
	store: { ...studio.store, project: { images: new Map(), manifest: { rig: { animations: [] } } } },
	dismissToast: vi.fn(),
	ui: {},
	prepareWorkspaceExport: async () => {}
}));
vi.mock('../../src/studio/download.svelte.ts', () => ({
	characterZipId: () => 'hero',
	editableData: vi.fn(),
	exportSource: async (id: string) => ({
		project: { images: new Map(), manifest: { name: id, rig: { animations: [] } } },
		look: {
			items: { hat: id === studio.doc.id ? studio.doc.items.hat : 'original' },
			variants: {}
		}
	})
}));
vi.mock('../../src/studio/exportLayering.ts', () => ({ exportActionLayering: vi.fn() }));
vi.mock('../../src/studio/settingsNavigation.svelte.ts', () => ({ openSettings: vi.fn() }));
vi.mock('../../src/lib/export/build.ts', () => ({ buildExport: studio.buildExport }));
vi.mock('../../src/lib/project-folder/support.ts', () => ({
	folderSupport: async () => 'supported'
}));
vi.mock('../../src/lib/store/export-settings.ts', () => ({ readExportSettings: async () => ({}) }));

// Build stamps Vite defines for the app; the fingerprint of a publish includes them.
beforeEach(() => {
	vi.stubGlobal('__APP_VERSION__', 'test');
	vi.stubGlobal('__APP_COMMIT__', 'test');
});
vi.mock('../../src/lib/project-folder/links.ts', () => ({
	...studio,
	allLinks: async () => [],
	recordKey: (link: FolderLink) => link.linkedAt
}));

const sprite = 'sprite.png';
const manifest = 'manifest.json';
const earlier = '2025-02-02T00:00:00.000Z';
function manifestText(exportedAt: string) {
	return JSON.stringify({ name: 'hero', export: { exportedAt } });
}

const contents = (hat: string, exportedAt: string) => ({
	kind: 'requested',
	entries: files({ [sprite]: hat, [manifest]: manifestText(exportedAt) })
});

function gate() {
	let open!: () => void;
	const wait = new Promise<void>((resolve) => (open = resolve));
	return { open, wait };
}

async function setup(spriteText = 'original') {
	vi.resetModules();
	vi.resetAllMocks();
	vi.useFakeTimers();
	vi.setSystemTime(new Date('2026-11-26T00:00:00.000Z'));
	studio.doc.id = 'hero';
	studio.doc.items.hat = 'original';
	const identity = <T>(value: T) => value;
	vi.stubGlobal('$state', Object.assign(identity, { raw: identity }));
	const locks = new Map<string, Promise<unknown>>();
	vi.stubGlobal('navigator', {
		locks: {
			request(name: string, work: () => Promise<unknown>) {
				const result = (locks.get(name) ?? Promise.resolve()).then(work);
				locks.set(
					name,
					result.catch(() => {})
				);
				return result;
			}
		}
	});
	const disk = memoryFolder({ [sprite]: spriteText, [manifest]: manifestText(earlier) });
	const directory = {
		async *keys() {
			yield* disk.files.keys();
		},
		async getFileHandle(path: string, options?: FileSystemGetFileOptions) {
			if (!disk.files.has(path)) {
				if (!options?.create) throw domError('NotFoundError');
				disk.set(path, '');
			}
			return {
				async getFile() {
					const data = disk.files.get(path);
					if (!data) throw domError('NotFoundError');
					return new File([new Uint8Array(data)], path, { lastModified: 1 });
				},
				async createWritable() {
					let staged = new Uint8Array();
					return {
						async write(data: Uint8Array) {
							staged = data.slice();
						},
						async close() {
							disk.files.set(path, staged);
							disk.log.push(path);
						},
						async abort() {}
					};
				}
			};
		}
	};
	const handle = {
		...directory,
		name: 'Game',
		queryPermission: async () => 'granted',
		getDirectoryHandle: async () => directory
	};
	const picker = vi.fn().mockResolvedValue(handle);
	vi.stubGlobal('showDirectoryPicker', picker);
	const links = new Map<string, FolderLink>();
	const written = new Map<string, Record<string, string>>();
	studio.getLink.mockImplementation(async (id: string) => links.get(id) ?? null);
	studio.replaceLink.mockImplementation(async (link: FolderLink) => {
		links.set(link.characterId, link);
		return link;
	});
	studio.updateLink.mockImplementation(async (id: string, linkedAt: string, patch: object) => {
		const link = links.get(id);
		if (link?.linkedAt !== linkedAt) return null;
		const stored = { ...link, ...patch };
		links.set(id, stored);
		return stored;
	});
	studio.readRecord.mockImplementation(async (key) => ({
		written: { ...written.get(key) },
		kept: []
	}));
	studio.recordWritten.mockImplementation(async (key, path, hash) => {
		const record = written.get(key) ?? {};
		if (hash === null) delete record[path];
		else record[path] = hash;
		written.set(key, record);
	});
	studio.buildExport.mockImplementation(async (_, { look, exportedAt }) => {
		return contents(look.items.hat, exportedAt);
	});
	const api = await import('../../src/studio/projectFolder.svelte.ts');
	const open = async (id: string) => {
		studio.doc.id = id;
		await api.loadFolderLink(id);
	};
	await open('hero');
	return { api, disk, handle, links, open, picker };
}

afterEach(() => {
	vi.useRealTimers();
	vi.unstubAllGlobals();
});

it('does not recreate the trust record after another tab unlinks the folder', async () => {
	const { api, links } = await setup();
	await api.linkProjectFolder('generic');
	const link = links.get('hero')!;
	expect(api.projectFolder.offer).toMatchObject({ linkedAt: link.linkedAt });
	expect(api.projectFolder.offer?.files).toHaveLength(2);
	expect(studio.recordWritten).not.toHaveBeenCalled();
	links.delete('hero');
	expect(await studio.getLink('hero')).toBeNull();

	await api.adoptMatchingFiles();

	expect(studio.recordWritten).not.toHaveBeenCalled();
});

it('keeps the offer retryable after a transient link read failure', async () => {
	const { api, links } = await setup();
	await api.linkProjectFolder('generic');
	const offer = api.projectFolder.offer;
	expect(offer).toMatchObject({ linkedAt: links.get('hero')?.linkedAt });
	expect(offer?.files).toHaveLength(2);
	studio.getLink.mockRejectedValueOnce(domError('UnknownError'));

	await api.adoptMatchingFiles();

	expect(links.has('hero')).toBe(true);
	expect(studio.recordWritten).not.toHaveBeenCalled();
	expect(api.projectFolder.offer).toEqual(offer);
});

it('retains a matching-file offer for the character that opened the picker', async () => {
	const { api, disk, handle, links, open, picker } = await setup();
	const pick = gate();
	picker.mockImplementationOnce(async () => {
		await pick.wait;
		return handle;
	});
	const linking = api.linkProjectFolder('generic');
	expect(picker).toHaveBeenCalledOnce();
	await open('mage');
	expect(links.size).toBe(0);
	pick.open();
	await linking;
	expect(links.get('hero')?.exportedAt).toBe(earlier);
	expect(api.projectFolder.link).toBeNull();
	expect(api.projectFolder.offer).toBeNull();
	expect(disk.log).toEqual([]);

	await open('hero');

	expect(api.projectFolder.link?.linkedAt).toBe(links.get('hero')?.linkedAt);
	expect(api.projectFolder.offer?.files.map((file) => file.path)).toEqual([sprite, manifest]);
});

it('recognizes the earlier export after the user restores the changed file', async () => {
	const { api, disk } = await setup('game edit');
	await api.linkProjectFolder('generic');
	const blocked = api.projectFolder.status;
	expect(blocked).toMatchObject({ kind: 'blocked', conflicts: [{ path: sprite }] });
	expect(api.projectFolder.offer?.files.map((file) => file.path)).toEqual([manifest]);
	api.leaveMatchingFiles();
	expect(studio.recordWritten).not.toHaveBeenCalled();

	disk.set(sprite, 'original');
	await api.publishProjectFolder();

	expect(disk.log).toEqual([]);
	expect(api.projectFolder.status).toEqual({ kind: 'done', kept: 0, already: true });
});

it('does not finish an older publish as up to date with an edit waiting', async () => {
	const { api, disk } = await setup();
	await api.linkProjectFolder('generic');
	await api.adoptMatchingFiles();
	expect(api.projectFolder.status.kind).toBe('done');
	studio.doc.items.hat = 'next';
	const finish = gate();
	const building = gate();
	studio.buildExport.mockImplementationOnce(async () => {
		building.open();
		await finish.wait;
		return contents('next', earlier);
	});
	const previous = api.publishProjectFolder();
	await building.wait;
	expect(api.projectFolder.status.kind).toBe('publishing');
	studio.doc.items.hat = 'latest';
	api.scheduleFolderPublish();
	expect(vi.getTimerCount()).toBe(1);
	finish.open();
	await previous;
	expect(disk.text(sprite)).toBe('next');

	expect(api.projectFolder.status.kind).not.toBe('done');
});
