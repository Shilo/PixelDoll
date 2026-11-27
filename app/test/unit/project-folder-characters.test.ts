// Project folder: Several linked characters: debounced and queued publishes, saved-state snapshots, deleted characters, relinks
// across switches, notices per character, and skipping the build of an unchanged character.
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import type { FolderLink } from '../../src/lib/project-folder/links.ts';
import type { FolderRecord } from '../../src/lib/project-folder/plan.ts';
import { publishFiles } from '../../src/lib/project-folder/publish.ts';
import { directoryTarget } from '../../src/lib/project-folder/target.ts';
import { domError, files } from './project-folder-memory.ts';

const studio = vi.hoisted(() => ({
	doc: { id: '', items: { hat: '' }, variants: {} },
	store: {
		project: { images: new Map(), manifest: { rig: { animations: [] } } },
		projects: [] as { id: string }[],
		exportRecord: undefined
	},
	saved: {} as Record<string, { hat: string }>,
	getLink: vi.fn<(id: string) => Promise<FolderLink | null>>(),
	updateLink: vi.fn(),
	replaceLink: vi.fn(),
	readRecord: vi.fn(),
	recordWritten: vi.fn(),
	prepareWorkspaceExport: vi.fn(),
	buildExport: vi.fn(),
	ui: { toast: null as unknown }
}));

vi.mock('../../src/studio/state.svelte.ts', () => ({
	...studio,
	toast: (message: unknown) => {
		studio.ui.toast = message;
		return true;
	},
	dismissToast: () => (studio.ui.toast = null)
}));
vi.mock('../../src/studio/settingsNavigation.svelte.ts', () => ({ openSettings: vi.fn() }));
vi.mock('../../src/studio/download.svelte.ts', () => ({
	editableData: vi.fn(),
	characterZipId: () => 'hero',
	exportSource: async (id: string) => ({
		project: studio.store.project,
		look: {
			items: structuredClone(id === studio.doc.id ? studio.doc.items : studio.saved[id]),
			variants: {}
		}
	})
}));
vi.mock('../../src/studio/exportLayering.ts', () => ({ exportActionLayering: vi.fn() }));
vi.mock('../../src/lib/export/build.ts', () => ({ buildExport: studio.buildExport }));
vi.mock('../../src/lib/export/export.ts', () => ({
	ACTION_LAYER_ENGINES: [],
	runtimeRevision: () => undefined
}));

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
	allLinks: async () => [],
	allDestinations: async () => [],
	addDestination: async () => {},
	recordKey: (link: FolderLink) => link.characterId
}));

const sprite = 'sprite.png';

function deferred() {
	let resolve!: () => void;
	const promise = new Promise<void>((done) => (resolve = done));
	return { promise, resolve };
}

function disk(name: string) {
	const contents = new Map<string, string>();
	const beforeClose = vi.fn<() => void>();
	const directory = {
		async *keys() {
			yield* contents.keys();
		},
		async getFileHandle(path: string, options?: FileSystemGetFileOptions) {
			if (!contents.has(path)) {
				if (!options?.create) throw domError('NotFoundError');
				contents.set(path, '');
			}
			return {
				async getFile() {
					if (!contents.has(path)) throw domError('NotFoundError');
					return new File([contents.get(path)!], path, { lastModified: 1 });
				},
				async createWritable() {
					let staged = '';
					return {
						async write(data: Uint8Array) {
							staged = new TextDecoder().decode(data);
						},
						async close() {
							beforeClose();
							contents.set(path, staged);
						},
						async abort() {}
					};
				}
			};
		}
	};
	const root = {
		name,
		queryPermission: async () => 'granted',
		isSameEntry: async (other: unknown) => other === root,
		keys: directory.keys,
		getDirectoryHandle: async () => directory
	} as unknown as FileSystemDirectoryHandle;
	return { contents, beforeClose, root, text: () => contents.get(sprite) };
}

function ownership() {
	const written: Record<string, string> = {};
	return {
		read: (): FolderRecord => ({ written: { ...written }, kept: [] }),
		async write(path: string, hash: string | null) {
			if (hash === null) delete written[path];
			else written[path] = hash;
		}
	};
}

beforeEach(() => {
	vi.resetModules();
	vi.resetAllMocks();
	studio.ui.toast = null;
});

afterEach(() => {
	vi.useRealTimers();
	vi.unstubAllGlobals();
});

it('preserves deletion of the empty file left by a failed first publish', async () => {
	const folder = disk('game');
	const target = directoryTarget(folder.root, ['hero']);
	const record = ownership();
	const publish = () =>
		publishFiles(target, files({ [sprite]: 'sprite data' }), {
			record: record.read(),
			onRecord: record.write
		});
	folder.beforeClose.mockImplementationOnce(() => {
		throw domError('InvalidStateError');
	});
	expect(await publish()).toMatchObject({ kind: 'failed', written: 0 });
	expect(folder.text()).toBe('');
	folder.contents.delete(sprite);

	const outcome = await publish();

	expect({ kind: outcome.kind, bytes: folder.text() }).toEqual({
		kind: 'blocked',
		bytes: undefined
	});
});

type TestFolder = ReturnType<typeof disk> & {
	link: FolderLink;
	record: ReturnType<typeof ownership>;
};

async function linkedStudio(...ids: string[]) {
	const identity = <T>(value: T) => value;
	vi.stubGlobal('$state', Object.assign(identity, { raw: identity, snapshot: structuredClone }));
	vi.useFakeTimers();
	const operations: Promise<unknown>[] = [];
	const lock = vi.fn((_name: string, work: () => Promise<unknown>) => work());
	vi.stubGlobal('navigator', {
		locks: {
			request(name: string, work: () => Promise<unknown>) {
				const operation = lock(name, work);
				operations.push(operation);
				return operation;
			}
		}
	});
	const destinations = new Map<string, TestFolder>();
	studio.store.projects = ids.map((id) => ({ id }));
	for (const id of ids) {
		const folder = disk(`${id}-game`);
		destinations.set(id, {
			...folder,
			link: {
				characterId: id,
				handle: folder.root,
				subfolder: id,
				destinationId: 'game',
				engine: 'generic',
				auto: true,
				linkedAt: `link-${id}`
			},
			record: ownership()
		});
	}
	const destination = (id: string) => destinations.get(id)!;
	studio.getLink.mockImplementation(async (id) => destinations.get(id)?.link ?? null);
	studio.updateLink.mockImplementation(async (id: string, _, patch: Partial<FolderLink>) => {
		const folder = destination(id);
		folder.link = { ...folder.link, ...patch };
		return folder.link;
	});
	// Like the real one: resolves to the stored link, keeping a still-stored previous link's automatic choice.
	const replaced = (link: FolderLink, previous: FolderLink | null) => {
		const folder = destination(link.characterId);
		folder.link =
			previous && folder.link.linkedAt === previous.linkedAt
				? { ...link, auto: folder.link.auto }
				: link;
		return folder.link;
	};
	studio.replaceLink.mockImplementation(async (link: FolderLink, previous: FolderLink | null) =>
		replaced(link, previous)
	);
	studio.readRecord.mockImplementation(async (id: string) => destination(id).record.read());
	studio.recordWritten.mockImplementation(async (id: string, path: string, hash: string | null) =>
		destination(id).record.write(path, hash)
	);
	studio.prepareWorkspaceExport.mockResolvedValue(undefined);
	studio.buildExport.mockImplementation(
		async (_, options: { look: { items: { hat: string } } }) => ({
			kind: 'requested',
			entries: files({ [sprite]: options.look.items.hat })
		})
	);
	for (const id of ids) studio.saved[id] = { hat: `${id} look` };
	const api = await import('../../src/studio/projectFolder.svelte.ts');
	const open = async (id: string, look = `${id} look`) => {
		// Opening another character saves the one being left, unless that save fails.
		const leaving = studio.doc.id;
		if (leaving && leaving !== id)
			await studio.prepareWorkspaceExport().then(
				() => (studio.saved[leaving] = { ...studio.doc.items }),
				() => {}
			);
		studio.doc.id = id;
		studio.doc.items = { hat: look };
		await api.loadFolderLink(id);
	};
	await open(ids[0]);
	// Runs timers and waits until no publish asks for a lock any more: a queued publish takes its lock only after the
	// one before it finishes, so waiting for the locks taken so far is not enough.
	const settle = async () => {
		for (let seen = -1; seen !== operations.length;) {
			seen = operations.length;
			await vi.runAllTimersAsync();
			await Promise.all(operations);
			await vi.runAllTimersAsync();
		}
	};
	return { api, destination, lock, open, operations, replaced, settle };
}

it('keeps both debounced publishes when switching between linked characters', async () => {
	const { api, destination, open, settle } = await linkedStudio('hero', 'mage');
	api.scheduleFolderPublish();
	await open('mage');
	api.scheduleFolderPublish();
	await settle();

	expect([destination('hero').text(), destination('mage').text()]).toEqual([
		'hero look',
		'mage look'
	]);
});

it('keeps separate queued publishes while a third character is actively publishing', async () => {
	const { api, destination, open, settle } = await linkedStudio('hero', 'mage', 'guard');
	const entered = deferred();
	const finish = deferred();
	studio.buildExport.mockImplementationOnce(async () => {
		entered.resolve();
		await finish.promise;
		return { kind: 'requested', entries: files({ [sprite]: 'hero look' }) };
	});
	const active = api.publishProjectFolder();
	await entered.promise;
	await open('mage');
	api.scheduleFolderPublish();
	await vi.runAllTimersAsync();
	await open('guard');
	api.scheduleFolderPublish();
	await vi.runAllTimersAsync();
	finish.resolve();
	await active;
	// Each folder publishes on its own, so the others may still be finishing.
	await settle();

	expect([destination('mage').text(), destination('guard').text()]).toEqual([
		'mage look',
		'guard look'
	]);
});

it('does not publish an unsaved look after switching away following a failed save', async () => {
	const { api, destination, open, operations } = await linkedStudio('hero');
	await api.publishProjectFolder();
	studio.doc.items.hat = 'unsaved look';
	studio.prepareWorkspaceExport.mockRejectedValue(new Error('The save failed'));
	api.scheduleFolderPublish();
	await open('unlinked');
	await vi.runAllTimersAsync();
	await Promise.all(operations);

	expect(destination('hero').text()).toBe('hero look');
});

it('does not replace a newer publish with a carried snapshot after a switch', async () => {
	const { api, destination, lock, open, operations } = await linkedStudio('hero');
	const folder = destination('hero');
	const finish = deferred();
	lock.mockImplementationOnce(async (_, work) => {
		await finish.promise;
		return work();
	});
	api.scheduleFolderPublish();
	await open('unlinked');
	await vi.runAllTimersAsync();
	const newer = await publishFiles(
		directoryTarget(folder.root, ['hero']),
		files({ [sprite]: 'newer save' }),
		{ record: folder.record.read(), onRecord: folder.record.write }
	);
	expect(newer.kind).toBe('published');
	studio.saved.hero = { hat: 'newer save' };
	folder.link = { ...folder.link, exportedAt: new Date().toISOString() };
	finish.resolve();
	await Promise.all(operations);

	expect(folder.text()).toBe('newer save');
});

it('drops a scheduled publish when its character is deleted', async () => {
	const { api, destination, open, operations } = await linkedStudio('hero');
	api.scheduleFolderPublish();
	// Library deletion removes the character and opens a replacement, leaving the link in storage.
	studio.store.projects = [];
	await open('unlinked');
	await vi.runAllTimersAsync();
	await Promise.all(operations);

	expect(destination('hero').text()).toBeUndefined();
});

it('does not publish a different character when a relink finishes after a switch', async () => {
	const { api, destination, lock, open } = await linkedStudio('hero', 'mage');
	vi.stubGlobal('showDirectoryPicker', async () => destination('hero').root);
	const entered = deferred();
	const finish = deferred();
	lock.mockImplementation(async (name, work) => {
		if (name.endsWith(':hero') && name.includes(':folder:')) {
			entered.resolve();
			await finish.promise;
		}
		return work();
	});
	destination('mage').link = { ...destination('mage').link, auto: false };
	const relinking = api.linkProjectFolder('generic');
	await entered.promise;
	await open('mage');
	finish.resolve();
	await relinking;

	expect(destination('mage').text()).toBeUndefined();
});

it('keeps an automatic-mode change made after the relink’s last read', async () => {
	const { api, destination, replaced } = await linkedStudio('hero');
	vi.stubGlobal('showDirectoryPicker', async () => destination('hero').root);
	const entered = deferred();
	const finish = deferred();
	studio.replaceLink.mockImplementationOnce(
		async (link: FolderLink, previous: FolderLink | null) => {
			entered.resolve();
			await finish.promise;
			return replaced(link, previous);
		}
	);
	const relinking = api.linkProjectFolder('generic');
	await entered.promise;
	await api.setFolderAutoPublish(false);
	finish.resolve();
	await relinking;

	expect(destination('hero').link.auto).toBe(false);
});

it('does not say up to date after auto is turned off and a newer edit lands', async () => {
	const { api, destination } = await linkedStudio('hero');
	const entered = deferred();
	const finish = deferred();
	studio.buildExport.mockImplementationOnce(async () => {
		entered.resolve();
		await finish.promise;
		return { kind: 'requested', entries: files({ [sprite]: 'hero look' }) };
	});
	const publishing = api.publishProjectFolder();
	await entered.promise;
	await api.setFolderAutoPublish(false);
	studio.doc.items.hat = 'newer saved look';
	api.folderFallsBehind();
	finish.resolve();
	await publishing;

	expect(destination('hero').text()).toBe('hero look');
	expect(api.projectFolder.status.kind).not.toBe('done');
});

it('keeps the conflict notice for one character when a different character publishes', async () => {
	const { api, destination, open, operations } = await linkedStudio('hero', 'mage');
	destination('hero').contents.set(sprite, 'game edit');
	api.scheduleFolderPublish();
	await vi.runAllTimersAsync();
	await Promise.all(operations);
	const warning = studio.ui.toast;
	expect(warning).toBeTruthy();

	await open('mage');
	await api.publishProjectFolder();

	expect(studio.ui.toast).toBe(warning);
});

it('clears a resolved notice when the existing export is already up to date', async () => {
	const { api, destination, operations } = await linkedStudio('hero');
	const folder = destination('hero');
	await api.publishProjectFolder();
	folder.contents.set(sprite, 'game edit');
	studio.doc.items.hat = 'different look';
	api.scheduleFolderPublish();
	await vi.runAllTimersAsync();
	await Promise.all(operations);
	await vi.advanceTimersByTimeAsync(0);
	expect(studio.ui.toast).toBeTruthy();

	folder.contents.set(sprite, 'hero look');
	studio.doc.items.hat = 'hero look';
	await api.publishProjectFolder();

	expect(api.projectFolder.status.kind).toBe('done');
	expect(studio.ui.toast).toBeNull();
});

it('skips building when a background check finds the character unchanged since its last publish', async () => {
	const { api, destination, settle } = await linkedStudio('hero');
	await api.publishProjectFolder();
	expect(destination('hero').text()).toBe('hero look');
	studio.buildExport.mockClear();

	api.scheduleFolderPublish();
	await settle();
	expect(studio.buildExport).not.toHaveBeenCalled();
	expect(api.projectFolder.status.kind).toBe('done');

	// A real change still publishes (first trying the last time, so an unchanged export would match what is there).
	studio.doc.items.hat = 'new look';
	api.scheduleFolderPublish();
	await settle();
	expect(destination('hero').text()).toBe('new look');
});
