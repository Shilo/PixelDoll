import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import type { FolderLink } from '../../src/lib/project-folder/links.ts';
import { DELETED, type FolderRecord } from '../../src/lib/project-folder/plan.ts';
import { domError, files, memoryFolder } from './project-folder-memory.ts';

const studio = vi.hoisted(() => ({
	doc: { id: '', items: { hat: '' }, variants: {}, loading: false },
	store: {
		project: { manifest: { name: '', rig: { animations: [] } } },
		projects: [{ id: 'hero' }, { id: 'mage' }]
	},
	ui: { toast: null as unknown },
	toast: vi.fn(),
	prepareWorkspaceExport: vi.fn(),
	readCharacterForExport: vi.fn(),
	openProject: vi.fn(),
	openingProjectId: vi.fn(() => ''),
	openSettings: vi.fn(),
	buildExport: vi.fn(),
	getLink: vi.fn(),
	allLinks: vi.fn(),
	updateLink: vi.fn(),
	replaceLink: vi.fn(),
	deleteLink: vi.fn(),
	deleteRecord: vi.fn(),
	readRecord: vi.fn(),
	recordWritten: vi.fn()
}));

vi.mock('../../src/studio/state.svelte.ts', () => ({
	...studio,
	dismissToast: () => (studio.ui.toast = null)
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
vi.mock('../../src/lib/store/export-settings.ts', () => ({ readExportSettings: async () => ({}) }));
vi.mock('../../src/lib/project-folder/support.ts', () => ({
	folderSupport: async () => 'supported'
}));
vi.mock('../../src/lib/project-folder/links.ts', () => ({
	...studio,
	recordKey: (link: FolderLink) => `${link.characterId}:${link.linkedAt}`
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
	const queryPermission = vi.fn<() => Promise<PermissionState>>(async () => 'granted');
	const requestPermission = vi.fn<() => Promise<PermissionState>>(async () => 'granted');
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
	const handle = {
		name: `${subfolder} game`,
		keys: directory.keys,
		queryPermission,
		requestPermission,
		isSameEntry: async (other: unknown) => other === handle,
		getDirectoryHandle: async () => directory
	} as unknown as FileSystemDirectoryHandle;
	const link: FolderLink = {
		characterId,
		handle,
		subfolder,
		engine: 'generic',
		auto: true,
		linkedAt: `link-${subfolder}`
	};
	return { disk, link, queryPermission, requestPermission };
}

beforeEach(() => {
	vi.resetModules();
	vi.resetAllMocks();
	vi.useFakeTimers();
	studio.doc.loading = false;
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
	const lock = vi.fn((_name: string, work: () => Promise<unknown>) => work());
	const pending: Promise<unknown>[] = [];
	vi.stubGlobal('navigator', {
		locks: {
			request(name: string, work: () => Promise<unknown>) {
				const result = lock(name, work);
				pending.push(result);
				return result;
			}
		}
	});
	const hero = destination('hero');
	const mage = destination('mage');
	const links = new Map([
		['hero', hero.link],
		['mage', mage.link]
	]);
	const records = new Map<string, { written: Record<string, string>; kept: string[] }>();
	const record = (key: string) => records.get(key) ?? { written: {}, kept: [] };
	studio.getLink.mockImplementation(async (id: string) => links.get(id) ?? null);
	studio.allLinks.mockImplementation(async () => [...links.values()]);
	studio.updateLink.mockImplementation(async (id: string, linkedAt: string, patch: FolderLink) => {
		const link = links.get(id);
		if (link?.linkedAt !== linkedAt) return null;
		const next = { ...link, ...patch };
		links.set(id, next);
		return next;
	});
	studio.replaceLink.mockImplementation(
		async (next: FolderLink, previous: FolderLink | null, keepRecord: boolean) => {
			if (previous) {
				const key = `${previous.characterId}:${previous.linkedAt}`;
				if (keepRecord) records.set(`${next.characterId}:${next.linkedAt}`, record(key));
				records.delete(key);
			}
			links.set(next.characterId, next);
			return next;
		}
	);
	studio.deleteLink.mockImplementation(async (id: string) => void links.delete(id));
	studio.deleteRecord.mockImplementation(async (key: string) => void records.delete(key));
	studio.readRecord.mockImplementation(async (key: string): Promise<FolderRecord> =>
		structuredClone(record(key))
	);
	const recordWritten = async (key: string, path: string, hash: string | null) => {
		const entry = record(key);
		if (hash === null) delete entry.written[path];
		else entry.written[path] = hash;
		records.set(key, entry);
	};
	studio.recordWritten.mockImplementation(recordWritten);
	studio.readCharacterForExport.mockImplementation(async (id: string) => ({
		project: { manifest: { name: id, rig: { animations: [] } } },
		current: { items: { hat: id }, variants: {} }
	}));
	studio.buildExport.mockImplementation(async (_, options: { look: { items: { hat: string } } }) =>
		exported(options.look.items.hat)
	);
	const api = await import('../../src/studio/projectFolder.svelte.ts');
	const open = async (id: string) => {
		studio.doc.id = id;
		studio.doc.items = { hat: id };
		studio.store.project = { manifest: { name: id, rig: { animations: [] } } };
		await api.loadFolderLink(id);
	};
	studio.openProject.mockImplementation(open);
	await open('hero');
	const settle = async () => {
		await vi.runAllTimersAsync();
		await Promise.all(pending);
	};
	return { api, hero, mage, links, lock, open, record, settle };
}

it('does not show an old folder’s conflict and approval controls under a replacement link', async () => {
	const { api, hero, links, open } = await linkedStudio();
	hero.disk.set(sprite, 'old folder edit');
	await api.publishProjectFolder();
	expect(api.projectFolder.status).toMatchObject({ kind: 'blocked', linkedAt: hero.link.linkedAt });
	await open('mage');
	const replacement = destination('hero', 'new-hero');
	links.set('hero', { ...replacement.link, auto: false });

	await open('hero');

	expect(api.projectFolder.link?.linkedAt).toBe(replacement.link.linkedAt);
	expect(api.projectFolder.status.kind).toBe('idle');
});

it('does not clear the replacement folder’s conflict when an obsolete publish finally gets its lock', async () => {
	const { api, hero, links, lock, open } = await linkedStudio();
	const waiting = gate();
	const enter = gate();
	lock.mockImplementation(async (name, work) => {
		if (name.endsWith(`:${hero.link.subfolder}`)) {
			waiting.release();
			await enter.wait;
		}
		return work();
	});
	const obsolete = api.publishProjectFolder();
	await waiting.wait;
	const replacement = destination('hero', 'new-hero');
	replacement.disk.set(sprite, 'new folder edit');
	links.set('hero', replacement.link);
	await open('mage');
	await open('hero');
	await api.publishProjectFolder();
	const conflict = api.projectFolder.status;
	expect(conflict).toMatchObject({ kind: 'blocked', linkedAt: replacement.link.linkedAt });
	expect(hero.queryPermission).not.toHaveBeenCalled();

	enter.release();
	await obsolete;

	expect(api.projectFolder.link?.linkedAt).toBe(replacement.link.linkedAt);
	expect(replacement.disk.text(sprite)).toBe('new folder edit');
	expect(api.projectFolder.status).toEqual(conflict);
});

it('reports a manual publish as complete when only a different character falls behind', async () => {
	const { api, hero, links, open } = await linkedStudio();
	links.set('mage', { ...links.get('mage')!, auto: false });
	const building = gate();
	const finish = gate();
	studio.buildExport.mockImplementationOnce(async () => {
		building.release();
		await finish.wait;
		return exported('hero');
	});
	const publish = api.publishProjectFolder();
	await building.wait;
	expect(api.projectFolder.status.kind).toBe('publishing');
	await open('mage');
	expect(api.projectFolder.link).toMatchObject({ characterId: 'mage', auto: false });
	studio.doc.items.hat = 'new mage look';
	api.folderFallsBehind();
	await open('hero');

	finish.release();
	await publish;

	expect(hero.disk.text(sprite)).toBe('hero');
	expect(api.projectFolder.status.kind).toBe('done');
});

it('takes the user to the affected character when Reconnect is clicked from a different character', async () => {
	const { api, hero, mage, open, settle } = await linkedStudio();
	hero.queryPermission.mockResolvedValue('prompt');
	api.scheduleFolderPublish();
	await settle();
	expect(api.projectFolder.status.kind).toBe('reconnect');
	const action = studio.toast.mock.lastCall?.[1].action as () => void | Promise<void>;
	expect(action).toBeTypeOf('function');
	await open('mage');

	await action();

	expect(mage.requestPermission).not.toHaveBeenCalled();
	expect(studio.openSettings).toHaveBeenCalledWith('export', 'project-folder');
	expect(studio.doc.id).toBe('hero');
});

it('opens the paused character when Review is clicked while another character is loading', async () => {
	const { api, hero, open, settle } = await linkedStudio();
	hero.disk.set(sprite, 'game edit');
	api.scheduleFolderPublish();
	await settle();
	expect(api.projectFolder.status.kind).toBe('blocked');
	const action = studio.toast.mock.lastCall?.[1].action as () => void | Promise<void>;
	expect(action).toBeTypeOf('function');

	const read = gate();
	let newestOpen = 0;
	studio.openProject.mockImplementation(async (id: string) => {
		const request = ++newestOpen;
		studio.doc.loading = true;
		studio.openingProjectId.mockReturnValue(id);
		if (id === 'mage') await read.wait;
		if (request !== newestOpen) return;
		studio.doc.loading = false;
		studio.openingProjectId.mockReturnValue('');
		await open(id);
	});
	const opening = studio.openProject('mage');
	expect(studio.doc).toMatchObject({ id: 'hero', loading: true });
	expect(studio.openingProjectId()).toBe('mage');

	const reviewing = action();
	read.release();
	await Promise.all([opening, reviewing]);

	expect(studio.openSettings).toHaveBeenCalledWith('export', 'project-folder');
	expect(studio.doc.id).toBe('hero');
});

it('retries a background conflict notice that was suppressed by a higher priority toast', async () => {
	const { api, hero, settle } = await linkedStudio();
	hero.disk.set(sprite, 'game edit');
	studio.toast.mockReturnValueOnce(false);
	api.scheduleFolderPublish();
	await settle();
	expect(api.projectFolder.status.kind).toBe('blocked');
	expect(studio.toast).toHaveBeenCalledTimes(1);
	expect(studio.ui.toast).toBeNull();
	studio.doc.items.hat = 'another saved look';

	api.scheduleFolderPublish();
	await settle();

	expect(hero.disk.text(sprite)).toBe('game edit');
	expect(api.projectFolder.status.kind).toBe('blocked');
	expect(studio.ui.toast).toBeTruthy();
});

it('keeps a known conflict across a failed character save and rechecks the disk after recovery', async () => {
	const { api, hero, settle } = await linkedStudio();
	await api.publishProjectFolder();
	expect(hero.disk.text(sprite)).toBe('hero');
	expect(api.projectFolder.link?.exportedAt).toBeTruthy();
	hero.disk.set(sprite, 'game edit');
	studio.doc.items.hat = 'second look';
	api.scheduleFolderPublish();
	await settle();
	expect(api.projectFolder.status.kind).toBe('blocked');
	const warning = studio.ui.toast;
	expect(warning).toBeTruthy();

	studio.doc.items.hat = 'hero';
	studio.prepareWorkspaceExport.mockRejectedValueOnce(new Error('Character save failed'));
	api.scheduleFolderPublish();
	await settle();
	expect(studio.ui.toast).toBe(warning);

	api.scheduleFolderPublish();
	await settle();

	expect(hero.disk.text(sprite)).toBe('game edit');
	expect(api.projectFolder.status.kind).toBe('blocked');
	expect(studio.ui.toast).toBe(warning);
});
