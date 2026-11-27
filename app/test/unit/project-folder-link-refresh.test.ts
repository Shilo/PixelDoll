// Project folder: Links changing underneath a tab: placeholder files from failed writes, obsolete links, another tab linking,
// conflicts surviving canceled publishes, Unlink notices and read failures.
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import type { FolderLink } from '../../src/lib/project-folder/links.ts';
import { PENDING, type FolderRecord } from '../../src/lib/project-folder/plan.ts';
import { publishFiles, sha256 } from '../../src/lib/project-folder/publish.ts';
import { directoryTarget } from '../../src/lib/project-folder/target.ts';
import { domError, files, memoryFolder } from './project-folder-memory.ts';

const studio = vi.hoisted(() => ({
	doc: { id: '', loading: false, items: { hat: 'original' }, variants: {} },
	store: {
		project: { images: new Map(), manifest: { rig: { animations: [] } } },
		projects: [{ id: 'hero' }, { id: 'mage' }]
	},
	ui: { toast: null as unknown },
	toast: vi.fn(),
	buildExport: vi.fn(),
	getLink: vi.fn(),
	updateLink: vi.fn(),
	readRecord: vi.fn(),
	recordWritten: vi.fn(),
	deleteLink: vi.fn(),
	deleteRecord: vi.fn()
}));

vi.mock('../../src/studio/state.svelte.ts', () => ({
	...studio,
	dismissToast: () => (studio.ui.toast = null),
	openingProjectId: () => '',
	prepareWorkspaceExport: async () => {}
}));
vi.mock('../../src/studio/settingsNavigation.svelte.ts', () => ({ openSettings: vi.fn() }));
vi.mock('../../src/studio/audio.svelte.ts', () => ({}));
vi.mock('../../src/studio/exportLayering.ts', () => ({ exportActionLayering: vi.fn() }));
vi.mock('../../src/lib/export/build.ts', () => ({ buildExport: studio.buildExport }));
vi.mock('../../src/lib/store/export-settings.ts', () => ({ readExportSettings: async () => ({}) }));

// Build stamps Vite defines for the app; the fingerprint of a publish includes them.
beforeEach(() => {
	vi.stubGlobal('__APP_VERSION__', 'test');
	vi.stubGlobal('__APP_COMMIT__', 'test');
});
vi.mock('../../src/lib/project-folder/support.ts', () => ({
	folderSupport: async () => 'supported'
}));
vi.mock('../../src/lib/project-folder/links.ts', () => ({
	...studio,
	allDestinations: async () => [],
	addDestination: async () => {},
	recordKey: (link: FolderLink) => link.linkedAt
}));

const sprite = 'sprite.png';
const exported = (look: string) => ({ kind: 'requested', entries: files({ [sprite]: look }) });

function gate() {
	let release!: () => void;
	const wait = new Promise<void>((resolve) => (release = resolve));
	return { release, wait };
}

function destination(characterId: string, subfolder = characterId) {
	const disk = memoryFolder();
	const stage = vi.fn();
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
					const bytes = disk.files.get(path);
					if (!bytes) throw domError('NotFoundError');
					return new File([new Uint8Array(bytes)], path, { lastModified: 1 });
				},
				async createWritable() {
					let staged = new Uint8Array();
					return {
						async write(bytes: Uint8Array) {
							staged = bytes.slice();
							stage(path);
						},
						async close() {
							disk.files.set(path, staged);
						},
						async abort() {}
					};
				}
			};
		},
		queryPermission: async () => 'granted'
	};
	const handle = {
		...directory,
		name: `${characterId} game`,
		getDirectoryHandle: async () => directory
	} as unknown as FileSystemDirectoryHandle;
	const link: FolderLink = {
		characterId,
		handle,
		subfolder,
		destinationId: 'game',
		engine: 'generic',
		auto: true,
		linkedAt: `link-${characterId}-${subfolder}`
	};
	return { disk, link, stage };
}

beforeEach(() => {
	vi.resetModules();
	vi.resetAllMocks();
	vi.useFakeTimers();
	studio.ui.toast = null;
	studio.toast.mockImplementation((message: unknown) => {
		studio.ui.toast = message;
		return true;
	});
});

afterEach(() => {
	vi.useRealTimers();
	vi.unstubAllGlobals();
});

async function linkedStudio() {
	const identity = <T>(value: T) => value;
	vi.stubGlobal('$state', Object.assign(identity, { raw: identity, snapshot: structuredClone }));
	const pending: Promise<unknown>[] = [];
	vi.stubGlobal('navigator', {
		locks: {
			request(_name: string, work: () => Promise<unknown>) {
				const result = work();
				pending.push(result.catch(() => {}));
				return result;
			}
		}
	});
	const hero = destination('hero');
	const links = new Map([['hero', hero.link]]);
	const records = new Map<string, { written: Record<string, string>; kept: string[] }>();
	const record = (key: string) => records.get(key) ?? { written: {}, kept: [] };
	studio.getLink.mockImplementation(async (id: string) => links.get(id) ?? null);
	studio.updateLink.mockImplementation(async (id: string, linkedAt: string, patch: object) => {
		const link = links.get(id);
		if (link?.linkedAt !== linkedAt) return null;
		const next = { ...link, ...patch };
		links.set(id, next);
		return next;
	});
	studio.deleteLink.mockImplementation(async (id: string, linkedAt: string) =>
		links.get(id)?.linkedAt === linkedAt ? links.delete(id) : false
	);
	studio.readRecord.mockImplementation(async (key: string): Promise<FolderRecord> =>
		structuredClone(record(key))
	);
	studio.recordWritten.mockImplementation(
		async (key: string, path: string, hash: string | null) => {
			const entry = record(key);
			if (hash === null) delete entry.written[path];
			else entry.written[path] = hash;
			records.set(key, entry);
		}
	);
	studio.buildExport.mockImplementation(async (_, options: { look: { items: { hat: string } } }) =>
		exported(options.look.items.hat)
	);
	const api = await import('../../src/studio/projectFolder.svelte.ts');
	const open = async (id: string) => {
		studio.doc.id = id;
		studio.doc.items.hat = 'original';
		await api.loadFolderLink(id);
	};
	await open('hero');
	const settle = async () => {
		await vi.runAllTimersAsync();
		await Promise.all(pending);
	};
	return { api, hero, links, open, settle };
}

it('requires approval to recreate a placeholder deleted during its first write', async () => {
	const { disk, link, stage } = destination('hero');
	const target = directoryTarget(link.handle, [link.subfolder]);
	const written: Record<string, string> = {};
	const publish = () =>
		publishFiles(target, files({ [sprite]: 'first export' }), {
			record: { written: { ...written }, kept: [] },
			onRecord: async (path, hash) => {
				if (hash === null) delete written[path];
				else written[path] = hash;
			}
		});
	stage.mockImplementationOnce((path: string) => {
		expect(disk.text(path)).toBe('');
		expect(written[path]).toBe(PENDING);
		disk.files.delete(path);
	});

	expect((await publish()).kind).toBe('failed');
	expect(stage).toHaveBeenCalledExactlyOnceWith(sprite);
	expect(disk.text(sprite)).toBeNull();

	const retry = await publish();

	expect({ retry: retry.kind, disk: disk.text(sprite) }).toEqual({ retry: 'blocked', disk: null });
});

it('drops an obsolete link’s conflict and notice when a timer finds its replacement', async () => {
	const { api, hero, links, settle } = await linkedStudio();
	hero.disk.set(sprite, 'game edit');
	api.scheduleFolderPublish();
	await settle();
	expect(api.projectFolder.status).toMatchObject({ kind: 'blocked', linkedAt: hero.link.linkedAt });
	expect(studio.ui.toast).toBeTruthy();
	const replacement = destination('hero', 'replacement');
	links.set('hero', { ...replacement.link, auto: false });
	studio.doc.items.hat = 'another edit';
	api.scheduleFolderPublish();

	await settle();

	expect(api.projectFolder.link?.linkedAt).toBe(replacement.link.linkedAt);
	expect(replacement.disk.text(sprite)).toBeNull();
	expect({ status: api.projectFolder.status.kind, notice: !!studio.ui.toast }).toEqual({
		status: 'idle',
		notice: false
	});
});

it('publishes edits from a tab already open when another tab links the character', async () => {
	const { api, hero, links, open, settle } = await linkedStudio();
	links.delete('hero');
	await open('mage');
	await open('hero');
	expect(api.projectFolder.link).toBeNull();

	// The other tab links Hero and completes the first publish while this tab stays on Hero.
	links.set('hero', { ...hero.link, exportedAt: 'first publish' });
	const [original] = files({ [sprite]: 'original' });
	await studio.recordWritten(hero.link.linkedAt, sprite, await sha256(original.data));
	hero.disk.set(sprite, 'original');
	expect(links.get('hero')).toMatchObject({ auto: true, linkedAt: hero.link.linkedAt });
	expect(hero.disk.text(sprite)).toBe('original');

	studio.doc.items.hat = 'second look';
	await api.loadFolderLink('hero'); // Export also asks for the link of the open character.
	api.scheduleFolderPublish();
	await settle();

	expect(hero.disk.text(sprite)).toBe('second look');
});

it('rechecks an external edit after auto is disabled mid-build and re-enabled', async () => {
	const { api, hero, settle } = await linkedStudio();
	await api.publishProjectFolder();
	expect(api.projectFolder.link?.exportedAt).toBeTruthy();
	expect(hero.disk.text(sprite)).toBe('original');
	hero.disk.set(sprite, 'game edit');
	studio.doc.items.hat = 'second look';
	api.scheduleFolderPublish();
	await settle();
	expect(api.projectFolder.status.kind).toBe('blocked');
	expect(studio.ui.toast).toBeTruthy();
	const building = gate();
	const finish = gate();
	studio.buildExport.mockImplementationOnce(async () => {
		building.release();
		await finish.wait;
		return exported('third look');
	});
	studio.doc.items.hat = 'third look';
	api.scheduleFolderPublish();
	const attempt = settle();
	await building.wait;
	expect(api.projectFolder.status.kind).toBe('publishing');
	await api.setFolderAutoPublish(false);
	expect(api.projectFolder.link?.auto).toBe(false);
	finish.release();
	await attempt;
	expect(hero.disk.text(sprite)).toBe('game edit');
	studio.doc.items.hat = 'original';
	await api.setFolderAutoPublish(true);
	await settle();

	expect(hero.disk.text(sprite)).toBe('game edit');
	expect({ status: api.projectFolder.status.kind, notice: !!studio.ui.toast }).toEqual({
		status: 'blocked',
		notice: true
	});
});

it('dismisses the lasting pause notice when the user unlinks that folder', async () => {
	const { api, hero, links, settle } = await linkedStudio();
	hero.disk.set(sprite, 'game edit');
	api.scheduleFolderPublish();
	await settle();
	expect(api.projectFolder.status.kind).toBe('blocked');
	expect(studio.ui.toast).toBeTruthy();

	await api.unlinkProjectFolder();

	expect(links.has('hero')).toBe(false);
	expect(api.projectFolder.link).toBeNull();
	expect(api.projectFolder.status.kind).toBe('idle');
	expect(studio.ui.toast).toBeNull();
});

it('retains the current link’s record read failure when returning to its character', async () => {
	const { api, hero, open, settle } = await linkedStudio();
	studio.readRecord.mockRejectedValueOnce(new DOMException('Storage read failed', 'UnknownError'));
	api.scheduleFolderPublish();
	await settle();
	expect(api.projectFolder.status.kind).toBe('failed');
	expect(studio.ui.toast).toBeTruthy();
	await open('mage');
	expect(api.projectFolder.link).toBeNull();

	await open('hero');

	expect(api.projectFolder.link?.linkedAt).toBe(hero.link.linkedAt);
	expect(api.projectFolder.status.kind).toBe('failed');
});
