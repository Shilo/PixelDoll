import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import type { FolderLink } from '../../src/lib/project-folder/links.ts';
import { domError, files, memoryFolder } from './project-folder-memory.ts';

const studio = vi.hoisted(() => ({
	doc: { id: '', items: { hat: '' }, variants: {}, loading: false },
	store: {
		project: { images: new Map(), manifest: { rig: { animations: [] } } },
		projects: [] as { id: string }[],
		exportRecord: undefined
	},
	ui: { toast: null as unknown, toastAction: undefined as (() => void) | undefined },
	getLink: vi.fn(),
	updateLink: vi.fn(),
	readRecord: vi.fn(),
	recordWritten: vi.fn(),
	replaceLink: vi.fn(),
	prepareWorkspaceExport: vi.fn(),
	readCharacterForExport: vi.fn(),
	openSettings: vi.fn(),
	openProject: vi.fn(),
	openingProjectId: () => '',
	buildExport: vi.fn()
}));

vi.mock('../../src/studio/state.svelte.ts', () => ({
	...studio,
	toast: (message: unknown, options: { action?: () => void }) => {
		studio.ui.toast = message;
		studio.ui.toastAction = options.action;
		return true;
	},
	dismissToast: () => {
		studio.ui.toast = null;
		studio.ui.toastAction = undefined;
	}
}));
vi.mock('../../src/studio/settingsNavigation.svelte.ts', () => ({
	openSettings: studio.openSettings
}));
vi.mock('../../src/studio/audio.svelte.ts', () => ({}));
vi.mock('../../src/studio/exportLayering.ts', () => ({ exportActionLayering: vi.fn() }));
vi.mock('../../src/lib/export/build.ts', () => ({ buildExport: studio.buildExport }));

// Build stamps Vite defines for the app; the fingerprint of a publish includes them.
beforeEach(() => {
	vi.stubGlobal('__APP_VERSION__', 'test');
	vi.stubGlobal('__APP_COMMIT__', 'test');
});
vi.mock('../../src/lib/store/export-settings.ts', async (importOriginal) => {
	const settings = await importOriginal<typeof import('../../src/lib/store/export-settings.ts')>();
	return { ...settings, readExportSettings: async () => settings.defaultExportSettings() };
});
vi.mock('../../src/lib/project-folder/support.ts', () => ({
	folderSupport: async () => 'supported'
}));
vi.mock('../../src/lib/project-folder/links.ts', () => ({
	...studio,
	allLinks: async () => [],
	recordKey: (link: FolderLink) => link.characterId
}));

const sprite = 'sprite.png';

function deferred() {
	let resolve!: () => void;
	const promise = new Promise<void>((done) => (resolve = done));
	return { promise, resolve };
}

function destination(id: string) {
	const disk = memoryFolder();
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
					return new File([bytes as Uint8Array<ArrayBuffer>], path, { lastModified: 1 });
				},
				async createWritable() {
					let staged = new Uint8Array();
					return {
						async write(data: Uint8Array) {
							staged = data.slice();
						},
						async close() {
							disk.files.set(path, staged);
						},
						async abort() {}
					};
				}
			};
		}
	};
	const root = {
		name: `${id} game`,
		isSameEntry: async (other: unknown) => other === root,
		queryPermission: async () => 'granted',
		keys: directory.keys,
		getDirectoryHandle: async () => directory
	} as unknown as FileSystemDirectoryHandle;
	const link: FolderLink = {
		characterId: id,
		handle: root,
		subfolder: id,
		engine: 'generic',
		auto: true,
		linkedAt: `link-${id}`
	};
	return { disk, link };
}

beforeEach(() => {
	vi.resetModules();
	vi.resetAllMocks();
	studio.ui.toast = null;
	studio.ui.toastAction = undefined;
});

afterEach(() => {
	vi.useRealTimers();
	vi.unstubAllGlobals();
});

async function linkedStudio() {
	const identity = <T>(value: T) => value;
	vi.stubGlobal('$state', Object.assign(identity, { raw: identity, snapshot: structuredClone }));
	vi.useFakeTimers();
	const locks: Promise<unknown>[] = [];
	const request = vi.fn((_name: string, work: () => Promise<unknown>) => work());
	vi.stubGlobal('navigator', {
		locks: {
			request(name: string, work: () => Promise<unknown>) {
				const pending = request(name, work);
				locks.push(pending);
				return pending;
			}
		}
	});
	const hero = destination('hero');
	const mage = destination('mage');
	studio.store.project = { images: new Map(), manifest: { rig: { animations: [] } } };
	const destinations = new Map([
		['hero', hero],
		['mage', mage]
	]);
	studio.store.projects = [{ id: 'hero' }, { id: 'mage' }];
	studio.getLink.mockImplementation(async (id: string) => destinations.get(id)?.link ?? null);
	studio.updateLink.mockImplementation(async (id: string, _, patch: Partial<FolderLink>) => {
		const entry = destinations.get(id)!;
		entry.link = { ...entry.link, ...patch };
		return entry.link;
	});
	studio.replaceLink.mockImplementation(async (link: FolderLink) => {
		destinations.get(link.characterId)!.link = link;
		return link;
	});
	studio.readRecord.mockImplementation(async (id: string) =>
		structuredClone(destinations.get(id)!.disk.record)
	);
	studio.recordWritten.mockImplementation(async (id: string, path: string, hash: string | null) => {
		const { written } = destinations.get(id)!.disk.record;
		if (hash === null) delete written[path];
		else written[path] = hash;
	});
	studio.readCharacterForExport.mockImplementation(async (id: string) => ({
		project: studio.store.project,
		current: { items: { hat: id }, variants: {} }
	}));
	studio.buildExport.mockImplementation(async (_, options: { look: { items: { hat: string } } }) =>
		exported(options.look.items.hat)
	);
	const api = await import('../../src/studio/projectFolder.svelte.ts');
	const open = async (id: string) => {
		studio.doc.id = id;
		studio.doc.items = { hat: id };
		await api.loadFolderLink(id);
	};
	const settle = async () => {
		for (let seen = -1; seen !== locks.length;) {
			seen = locks.length;
			await vi.runAllTimersAsync();
			await Promise.all(locks);
			await vi.runAllTimersAsync();
		}
	};
	await open('hero');
	return { api, hero, mage, open, request, settle };
}

const exported = (look: string) => ({ kind: 'requested', entries: files({ [sprite]: look }) });

it('does not write after a character is deleted during the export build', async () => {
	const { api, hero, open } = await linkedStudio();
	const building = deferred();
	const finish = deferred();
	studio.buildExport.mockImplementationOnce(async () => {
		building.resolve();
		await finish.promise;
		return exported('deleted character');
	});
	const publish = api.publishProjectFolder();
	await building.promise;
	studio.store.projects = [{ id: 'mage' }];
	await open('mage');
	finish.resolve();
	await publish;

	expect(hero.disk.text(sprite)).toBeNull();
});

it('keeps a paused notice if a later offscreen build matches the record but disk still differs', async () => {
	const { api, hero, open, settle } = await linkedStudio();
	await api.publishProjectFolder();
	hero.disk.set(sprite, 'game edit');
	studio.doc.items.hat = 'different outfit';
	api.scheduleFolderPublish();
	await settle();
	expect(api.projectFolder.status.kind).toBe('blocked');
	const warning = studio.ui.toast;
	expect(warning).toBeTruthy();

	studio.doc.items.hat = 'hero';
	api.scheduleFolderPublish();
	await open('mage');
	await settle();

	expect(hero.disk.text(sprite)).toBe('game edit');
	expect(studio.ui.toast).toBe(warning);
});

it('recovers the paused character’s conflict list when Review is clicked from another character', async () => {
	const { api, hero, open, settle } = await linkedStudio();
	studio.openProject.mockImplementation(open);
	hero.disk.set(sprite, 'game edit');
	api.scheduleFolderPublish();
	await open('mage');
	await settle();
	expect(studio.ui.toast).toBeTruthy();

	await studio.ui.toastAction?.();

	expect({ character: studio.doc.id, status: api.projectFolder.status.kind }).toEqual({
		character: 'hero',
		status: 'blocked'
	});
});

it('starts publishing a separate game folder while another folder lock is waiting', async () => {
	const { api, mage, open, request } = await linkedStudio();
	const releaseHero = deferred();
	const mageRequested = deferred();
	request.mockImplementation(async (name, work) => {
		if (name.endsWith(':hero')) await releaseHero.promise;
		else mageRequested.resolve();
		return work();
	});
	const heroPublish = api.publishProjectFolder();
	await open('mage');
	const magePublish = api.publishProjectFolder();
	const first = await Promise.race([
		mageRequested.promise.then(() => 'mage'),
		vi.advanceTimersByTimeAsync(1500).then(() => 'waiting')
	]);
	releaseHero.resolve();
	await Promise.all([heroPublish, magePublish]);
	expect(mage.disk.text(sprite)).toBe('mage');

	expect(first).toBe('mage');
});

it('does not read a character snapshot for an obsolete timer after relinking', async () => {
	const { api, hero, settle } = await linkedStudio();
	vi.stubGlobal('showDirectoryPicker', async () => hero.link.handle);
	api.scheduleFolderPublish();
	await api.linkProjectFolder('generic');
	studio.prepareWorkspaceExport.mockClear();

	await settle();

	expect(studio.prepareWorkspaceExport).not.toHaveBeenCalled();
});

it('keeps the last usable export when an offscreen save has unreadable equipment artwork', async () => {
	const { api, hero, open, settle } = await linkedStudio();
	await api.publishProjectFolder();
	expect(hero.disk.text(sprite)).toBe('hero');
	// The saved character reads back with an image missing: an export of it would be broken.
	studio.readCharacterForExport.mockResolvedValueOnce({
		project: studio.store.project,
		current: { items: { hat: 'broken export' }, variants: {} },
		missingImages: 1
	});

	api.scheduleFolderPublish();
	await open('mage');
	await settle();

	expect(hero.disk.text(sprite)).toBe('hero');
});
