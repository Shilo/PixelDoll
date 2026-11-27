// Project folder: One character's publish from start to finish: staging conflicts, approvals of unreadable edits, snapshot
// freshness, Up to date after newer edits, automatic-mode changes during relinks and switches, and saves.
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import type { FolderLink } from '../../src/lib/project-folder/links.ts';
import { publishFiles } from '../../src/lib/project-folder/publish.ts';
import { directoryTarget } from '../../src/lib/project-folder/target.ts';
import { domError, files, memoryFolder } from './project-folder-memory.ts';

const studio = vi.hoisted(() => ({
	doc: { id: 'hero', items: { hat: 'saved' }, variants: {} },
	store: {
		project: { images: new Map(), manifest: { rig: { animations: [] } } },
		projects: [{ id: 'hero' }],
		exportRecord: undefined
	},
	saved: {} as Record<string, { hat: string }>,
	buildExport: vi.fn(),
	readExportSettings: vi.fn(),
	getLink: vi.fn<() => Promise<FolderLink | null>>(),
	readRecord: vi.fn(),
	recordWritten: vi.fn(),
	updateLink: vi.fn(),
	replaceLink: vi.fn(),
	prepareWorkspaceExport: vi.fn()
}));

vi.mock('../../src/studio/state.svelte.ts', () => ({
	...studio,
	toast: vi.fn(),
	ui: {},
	dismissToast: vi.fn()
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
vi.mock('../../src/lib/export/export.ts', () => ({ ACTION_LAYER_ENGINES: [] }));

// Build stamps Vite defines for the app; the fingerprint of a publish includes them.
beforeEach(() => {
	vi.stubGlobal('__APP_VERSION__', 'test');
	vi.stubGlobal('__APP_COMMIT__', 'test');
});
vi.mock('../../src/lib/store/export-settings.ts', () => ({
	readExportSettings: studio.readExportSettings
}));
vi.mock('../../src/lib/project-folder/support.ts', () => ({
	folderSupport: async () => 'supported'
}));
vi.mock('../../src/lib/project-folder/links.ts', () => ({
	...studio,
	allLinks: async () => [],
	recordKey: () => 'hero'
}));

const sprite = 'hero.png';

function deferred<T>() {
	let resolve!: (value: T) => void;
	const promise = new Promise<T>((done) => (resolve = done));
	return { promise, resolve };
}

beforeEach(() => {
	vi.resetModules();
	vi.resetAllMocks();
	studio.doc.id = 'hero';
	studio.doc.items.hat = 'saved';
});

afterEach(() => {
	vi.useRealTimers();
	vi.unstubAllGlobals();
});

it.each([false, true])(
	'preserves a deletion after a failed hash commit (previously published: %s)',
	async (previouslyPublished) => {
		const folder = memoryFolder();
		if (previouslyPublished) await folder.publish({ [sprite]: 'old' });
		folder.failRecord = () => domError('QuotaExceededError');
		expect(await folder.publish({ [sprite]: 'new' })).toMatchObject({ kind: 'failed', written: 1 });
		folder.files.delete(sprite);
		folder.failRecord = undefined;

		const outcome = await folder.publish({ [sprite]: 'next' });

		expect({ status: outcome.kind, onDisk: folder.text(sprite) }).toEqual({
			status: 'blocked',
			onDisk: null
		});
	}
);

it('reports a folder substituted during staging as an unreplaceable conflict', async () => {
	const folder = memoryFolder();
	await folder.publish({ [sprite]: 'old' });
	folder.onStage = (path) => {
		folder.files.delete(path);
		folder.dirs.add(path);
	};

	const outcome = await folder.publish({ [sprite]: 'new' });

	expect(outcome).toMatchObject({
		kind: 'blocked',
		conflicts: [{ path: sprite, reason: 'folder' }]
	});
});

it('does not treat approval of an unreadable edit as approval of a later deletion', async () => {
	const folder = memoryFolder();
	await folder.publish({ [sprite]: 'old' });
	folder.onStage = (path) => folder.set(path, 'edited in game');
	let reads = 0;
	folder.failRead = (path) =>
		path === sprite && ++reads === 3 ? domError('NotReadableError') : undefined;
	const review = await folder.publish({ [sprite]: 'new' });
	const approval = new Map<string, string>();
	if (review.kind === 'blocked') {
		for (const conflict of review.conflicts) {
			if (conflict.found) approval.set(conflict.path, conflict.found);
		}
	}
	folder.onStage = undefined;
	folder.failRead = undefined;
	folder.files.delete(sprite);
	await folder.publish({ [sprite]: 'new' }, approval);
	expect(folder.text(sprite)).toBeNull();
});

async function linkedStudio() {
	const identity = <T>(value: T) => value;
	vi.stubGlobal('$state', Object.assign(identity, { raw: identity, snapshot: structuredClone }));
	vi.stubGlobal('navigator', {});
	const contents = new Map<string, Uint8Array>();
	let exists = true;
	const checking = vi.fn();
	const directory = {
		async *keys() {
			yield* contents.keys();
		},
		async getFileHandle(name: string, options?: FileSystemGetFileOptions) {
			if (!contents.has(name)) {
				if (!options?.create) throw domError('NotFoundError');
				contents.set(name, new Uint8Array());
			}
			return {
				async getFile() {
					return new File([new Uint8Array(contents.get(name)!)], name, { lastModified: 1 });
				},
				async createWritable() {
					let staged = new Uint8Array();
					return {
						async write(data: Uint8Array) {
							staged = data.slice();
						},
						async close() {
							contents.set(name, staged);
						},
						async abort() {}
					};
				}
			};
		}
	};
	const handle = {
		name: 'game',
		queryPermission: async () => 'granted',
		isSameEntry: async (other: unknown) => other === handle,
		async *keys() {
			await checking();
		},
		async getDirectoryHandle(_name: string, options?: FileSystemGetDirectoryOptions) {
			if (!exists && !options?.create) throw domError('NotFoundError');
			exists = true;
			return directory;
		}
	} as unknown as FileSystemDirectoryHandle;
	let link: FolderLink = {
		characterId: 'hero',
		handle,
		subfolder: 'hero',
		engine: 'generic',
		auto: false,
		linkedAt: 'first'
	};
	const written: Record<string, string> = {};
	const recordWritten = async (path: string, hash: string | null) => {
		if (hash === null) delete written[path];
		else written[path] = hash;
	};
	studio.getLink.mockImplementation(async () => link);
	studio.updateLink.mockImplementation(async (_, __, patch: Partial<FolderLink>) => {
		link = { ...link, ...patch };
		return link;
	});
	studio.replaceLink.mockImplementation(
		async (next: FolderLink, previous: FolderLink | null, keepRecord: boolean) => {
			if (!keepRecord) {
				for (const path of Object.keys(written)) delete written[path];
			}
			link = previous && link.linkedAt === previous.linkedAt ? { ...next, auto: link.auto } : next;
			return link;
		}
	);
	studio.readRecord.mockImplementation(async () => ({ written: { ...written }, kept: [] }));
	studio.recordWritten.mockImplementation(async (_key, path: string, hash: string | null) =>
		recordWritten(path, hash)
	);
	studio.readExportSettings.mockResolvedValue({});
	studio.prepareWorkspaceExport.mockResolvedValue(undefined);
	studio.buildExport.mockImplementation(
		async (_project, options: { look: { items: { hat: string } } }) => ({
			kind: 'requested',
			entries: files({ [sprite]: options.look.items.hat })
		})
	);
	const api = await import('../../src/studio/projectFolder.svelte.ts');
	await api.loadFolderLink('hero');
	return {
		api,
		checking,
		handle,
		link: () => link,
		contents,
		removeDestination() {
			contents.clear();
			exists = false;
		},
		text: () => new TextDecoder().decode(contents.get(sprite)),
		async publishFromAnotherTab(value: string) {
			const outcome = await publishFiles(
				directoryTarget(handle, ['hero']),
				files({ [sprite]: value }),
				{ record: await studio.readRecord(), onRecord: recordWritten }
			);
			if (outcome.kind === 'published') {
				const now = new Date().toISOString();
				await studio.updateLink('hero', link.linkedAt, { exportedAt: now, publishedAt: now });
			}
			return outcome;
		}
	};
}

// A publish waiting for the folder takes the character as it is once it gets the folder, not as it was when it was
// asked for: here this tab's character became the newer save (as another tab's save reaches it) while it waited.
it('does not let an older snapshot roll back a newer publish from another tab', async () => {
	const folder = await linkedStudio();
	const waiting = deferred<void>();
	vi.stubGlobal('navigator', {
		locks: {
			async request(_name: string, work: () => Promise<unknown>) {
				await waiting.promise;
				return work();
			}
		}
	});
	const older = folder.api.publishProjectFolder();
	expect(await folder.publishFromAnotherTab('newer save')).toMatchObject({ kind: 'published' });
	studio.doc.items.hat = 'newer save';
	waiting.resolve();
	await older;

	expect(folder.text()).toBe('newer save');
});

it('does not say up to date when a manual publish finishes after another edit', async () => {
	const folder = await linkedStudio();
	const started = deferred<void>();
	const finish = deferred<void>();
	studio.buildExport.mockImplementationOnce(async () => {
		started.resolve();
		await finish.promise;
		return { kind: 'requested', entries: files({ [sprite]: 'saved' }) };
	});
	const publishing = folder.api.publishProjectFolder();
	await started.promise;
	studio.doc.items.hat = 'changed during publish';
	folder.api.folderFallsBehind();
	finish.resolve();
	await publishing;

	expect(folder.text()).toBe('saved');
	expect(folder.api.projectFolder.status.kind).not.toBe('done');
});

it('preserves an automatic-mode change while a relink waits for a publish', async () => {
	const folder = await linkedStudio();
	vi.useFakeTimers();
	const waiting = deferred<void>();
	const acquired = deferred<void>();
	vi.stubGlobal('showDirectoryPicker', async () => folder.handle);
	vi.stubGlobal('navigator', {
		locks: {
			async request(name: string, work: () => Promise<unknown>) {
				if (name.endsWith(':folder:hero')) {
					waiting.resolve();
					await acquired.promise;
				}
				return work();
			}
		}
	});
	const relinking = folder.api.linkProjectFolder('generic');
	await waiting.promise;
	await folder.api.setFolderAutoPublish(true);
	expect(folder.link().auto).toBe(true);
	acquired.resolve();
	await relinking;

	expect(folder.link().auto).toBe(true);
});

it('reviews deleted exports when the user picks the same project root again', async () => {
	const folder = await linkedStudio();
	await folder.api.publishProjectFolder();
	expect(folder.text()).toBe('saved');
	folder.removeDestination();
	vi.stubGlobal('showDirectoryPicker', async () => folder.handle);
	await folder.api.linkProjectFolder('generic');

	expect({
		status: folder.api.projectFolder.status.kind,
		hasFile: folder.contents.has(sprite)
	}).toEqual({
		status: 'blocked',
		hasFile: false
	});
});

it('stops before writing if automatic updates are turned off during planning', async () => {
	const folder = await linkedStudio();
	vi.useFakeTimers();
	const started = deferred<void>();
	const finish = deferred<void>();
	let publishing: Promise<void> | undefined;
	vi.stubGlobal('navigator', {
		locks: {
			request: (_name: string, work: () => Promise<void>) => (publishing = work())
		}
	});
	folder.checking.mockImplementationOnce(async () => {
		started.resolve();
		await finish.promise;
	});
	await folder.api.setFolderAutoPublish(true);
	await vi.runAllTimersAsync();
	await started.promise;
	await folder.api.setFolderAutoPublish(false);
	finish.resolve();
	await publishing;

	expect(folder.contents.has(sprite)).toBe(false);
});

it('keeps a newer automatic-mode choice after overlapping character switches', async () => {
	const folder = await linkedStudio();
	vi.useFakeTimers();
	const old = folder.link();
	const started = deferred<void>();
	const finish = deferred<FolderLink>();
	const loadOther = async () => {
		studio.doc.id = 'other';
		studio.getLink.mockResolvedValueOnce(null);
		await folder.api.loadFolderLink('other');
	};
	await loadOther();
	studio.getLink.mockImplementationOnce(() => {
		started.resolve();
		return finish.promise;
	});
	studio.doc.id = 'hero';
	const pending = folder.api.loadFolderLink('hero');
	await started.promise;
	await loadOther();
	studio.doc.id = 'hero';
	await folder.api.loadFolderLink('hero');
	await folder.api.setFolderAutoPublish(true);
	finish.resolve(old);
	await pending;

	expect(folder.api.projectFolder.link?.auto).toBe(true);
});

it('keeps a scheduled publish when the user switches to an unlinked character', async () => {
	const folder = await linkedStudio();
	vi.useFakeTimers();
	let publishing: Promise<void> | undefined;
	vi.stubGlobal('navigator', {
		locks: {
			request: (_name: string, work: () => Promise<void>) => (publishing = work())
		}
	});
	await folder.api.setFolderAutoPublish(true);
	studio.doc.items.hat = 'new saved look';
	folder.api.scheduleFolderPublish();
	// Opening another character saves this one first.
	studio.saved.hero = { ...studio.doc.items };
	studio.doc.id = 'other';
	studio.getLink.mockResolvedValueOnce(null);
	await folder.api.loadFolderLink('other');
	await vi.runAllTimersAsync();
	await publishing;

	expect(folder.text()).toBe('new saved look');
});

it('publishes the saved look when an in-memory change has not completed autosave', async () => {
	const folder = await linkedStudio();
	await folder.api.publishProjectFolder();
	vi.useFakeTimers();
	let publishing: Promise<void> | undefined;
	vi.stubGlobal('navigator', {
		locks: {
			request: (_name: string, work: () => Promise<void>) => (publishing = work())
		}
	});
	await folder.api.setFolderAutoPublish(true);
	studio.doc.items.hat = 'unsaved change';
	studio.prepareWorkspaceExport.mockRejectedValue(
		new Error('The latest changes could not be saved')
	);
	// The watcher schedules on changes to the live look, independently of the save result.
	folder.api.scheduleFolderPublish();
	await vi.runAllTimersAsync();
	await publishing;

	expect(folder.text()).toBe('saved');
});
