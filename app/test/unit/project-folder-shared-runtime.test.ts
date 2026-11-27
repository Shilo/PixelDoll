// Project folder: characters linked to one folder share their engine's runtime in pixeldoll-<engine>/. One plan covers
// the runtime and the character before anything is written, an older tab never puts back an older runtime, and folders
// that overlap a managed one (or a second Unity runtime in one game) are refused.
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import type { FolderLink } from '../../src/lib/project-folder/links.ts';
import { keepable } from '../../src/lib/project-folder/layout.ts';
import { files, memoryFolder } from './project-folder-memory.ts';

const studio = vi.hoisted(() => ({
	doc: { id: 'a' },
	store: { project: null as unknown, projects: [{ id: 'a' }, { id: 'b' }, { id: 'PixelDoll' }] },
	links: new Map<string, FolderLink>(),
	destinations: new Map<string, { id: string; handle: FileSystemDirectoryHandle }>(),
	records: new Map<string, { written: Record<string, string>; kept: string[] }>(),
	floors: new Map<string, number>(),
	/** The runtime revision and bytes the next build has, as an older or newer app would. */
	runtime: { revision: 2, text: 'runtime v2' },
	bundle: true,
	/** Builds so far, so a test can tell a quiet check that rebuilt from one that did not. */
	builds: 0,
	/** Thrown by the next record write, as a newer PixelDoll's database upgrade would. */
	storageError: undefined as Error | undefined,
	/** Changes every character's scene, as an edit would. */
	edit: '',
	folder: null as unknown as ReturnType<typeof import('./project-folder-memory.ts').memoryFolder>
}));

const record = (key: string) => {
	if (!studio.records.has(key)) studio.records.set(key, { written: {}, kept: [] });
	return studio.records.get(key)!;
};

vi.mock('../../src/studio/state.svelte.ts', () => ({
	doc: studio.doc,
	store: studio.store,
	openingProjectId: () => '',
	prepareWorkspaceExport: async () => {},
	dismissToast: vi.fn(),
	toast: vi.fn(),
	ui: {}
}));
vi.mock('../../src/studio/download.svelte.ts', () => ({
	characterZipId: (manifest: { name: string }) => manifest.name,
	editableData: vi.fn(),
	exportSource: async (id: string) => ({
		project: { images: new Map(), manifest: { name: id, rig: { animations: [] } } },
		look: { items: {}, variants: {} }
	})
}));
vi.mock('../../src/studio/exportLayering.ts', () => ({ exportActionLayering: vi.fn() }));
vi.mock('../../src/studio/settingsNavigation.svelte.ts', () => ({ openSettings: vi.fn() }));
vi.mock('../../src/lib/export/build.ts', () => ({
	buildExport: async (
		project: { manifest: { name: string } },
		o: { engine: string; exportedAt: string }
	) => ({
		built: studio.builds++,
		kind: 'requested',
		entries: files({
			'godot/Paperdoll.tscn': `scene of ${project.manifest.name}${studio.edit}`,
			'manifest.json': JSON.stringify({ export: { exportedAt: o.exportedAt } })
		}),
		bundle: studio.bundle
			? {
					engine: o.engine,
					revision: studio.runtime.revision,
					files: files({ 'paperdoll.gd': studio.runtime.text })
				}
			: undefined
	})
}));
// The runtime revision this tab's build has, as an older or newer app would.
vi.mock('../../src/lib/export/export.ts', () => ({
	ACTION_LAYER_ENGINES: [],
	runtimeRevision: (engine: string) =>
		['godot', 'phaser', 'phaser-ae', 'unity'].includes(engine) ? studio.runtime.revision : undefined
}));
vi.mock('../../src/lib/project-folder/support.ts', () => ({
	folderSupport: async () => 'supported'
}));
vi.mock('../../src/lib/store/export-settings.ts', () => ({ readExportSettings: async () => ({}) }));
vi.mock('../../src/lib/project-folder/target.ts', async (importOriginal) => ({
	...(await importOriginal<typeof import('../../src/lib/project-folder/target.ts')>()),
	directoryTarget: () => studio.folder.target
}));
vi.mock('../../src/lib/project-folder/links.ts', () => ({
	recordKey: (link: FolderLink) => `${link.characterId}|${link.linkedAt}`,
	getLink: async (id: string) => studio.links.get(id) ?? null,
	allLinks: async () => [...studio.links.values()],
	replaceLink: async (link: FolderLink) => (studio.links.set(link.characterId, link), link),
	updateLink: async (id: string, linkedAt: string, patch: Partial<FolderLink>) => {
		const link = studio.links.get(id);
		if (!link || link.linkedAt !== linkedAt) return null;
		const next = { ...link, ...patch };
		studio.links.set(id, next);
		return next;
	},
	deleteLink: async (id: string, linkedAt: string) =>
		studio.links.get(id)?.linkedAt === linkedAt && studio.links.delete(id),
	allDestinations: async () => [...studio.destinations.values()],
	addDestination: async (d: { id: string; handle: FileSystemDirectoryHandle }) =>
		void studio.destinations.set(d.id, d),
	deleteRecord: async (key: string) => void studio.records.delete(key),
	readRecord: async (key: string) => structuredClone(record(key)),
	recordWritten: async (key: string, path: string, hash: string | null) => {
		if (studio.storageError) throw studio.storageError;
		if (hash === null) delete record(key).written[path];
		else record(key).written[path] = hash;
	},
	setKept: async (key: string, paths: string[], keep: boolean) => {
		record(key).kept = keep ? [...record(key).kept, ...paths] : [];
	},
	readFloor: async (key: string) => studio.floors.get(key) ?? 0,
	raiseFloor: async (key: string, revision: number) => {
		const floor = Math.max(studio.floors.get(key) ?? 0, revision);
		studio.floors.set(key, floor);
		return floor;
	}
}));

/** A picked folder, the same entry as `same` when given. */
function folderHandle(name: string, o: { same?: object } = {}) {
	const handle: Record<string, unknown> = {
		name,
		// Two picks of one folder are different objects that compare as the same entry.
		entry: (o.same as { entry?: unknown } | undefined)?.entry ?? Symbol(name),
		queryPermission: async () => 'granted',
		isSameEntry: async (other: { entry?: unknown }) => other?.entry === handle.entry,
		resolve: async () => null
	};
	return handle as unknown as FileSystemDirectoryHandle;
}

/** Makes `inner` read as being at `path` inside `outer`. */
function nest(outer: FileSystemDirectoryHandle, inner: FileSystemDirectoryHandle, path: string[]) {
	(outer as unknown as { resolve: (h: unknown) => Promise<string[] | null> }).resolve = async (
		h
	) => (h === inner ? path : null);
}

let api: typeof import('../../src/studio/projectFolder.svelte.ts');
const RUNTIME = 'pixeldoll-godot/paperdoll.gd';

beforeEach(async () => {
	vi.resetModules();
	vi.stubGlobal('__APP_VERSION__', 'test');
	vi.stubGlobal('__APP_COMMIT__', 'test');
	const identity = <T>(value: T) => value;
	vi.stubGlobal('$state', Object.assign(identity, { raw: identity }));
	vi.stubGlobal('navigator', {
		locks: { request: (_name: string, work: () => Promise<unknown>) => work() }
	});
	studio.links.clear();
	studio.destinations.clear();
	studio.records.clear();
	studio.floors.clear();
	studio.runtime = { revision: 2, text: 'runtime v2' };
	studio.bundle = true;
	studio.edit = '';
	studio.builds = 0;
	studio.storageError = undefined;
	studio.folder = memoryFolder();
	api = await import('../../src/studio/projectFolder.svelte.ts');
});

afterEach(() => {
	vi.restoreAllMocks();
	vi.unstubAllGlobals();
});

/** Opens a character and links it to `handle` as `engine`. */
async function link(id: string, handle: FileSystemDirectoryHandle, engine = 'godot') {
	studio.doc.id = id;
	studio.store.project = { images: new Map(), manifest: { name: id, rig: { animations: [] } } };
	vi.stubGlobal('showDirectoryPicker', async () => handle);
	await api.loadFolderLink(id);
	await api.linkProjectFolder(engine as never);
	return studio.links.get(id);
}

it('writes the runtime once for two characters in one folder, under one shared record', async () => {
	const game = folderHandle('Game');
	const a = await link('a', game);
	const b = await link('b', folderHandle('Game', { same: game }));

	expect(a?.destinationId).toBeTruthy();
	expect(b?.destinationId).toBe(a?.destinationId);
	expect(studio.folder.text(RUNTIME)).toBe('runtime v2');
	expect(studio.folder.text('a/godot/Paperdoll.tscn')).toBe('scene of a');
	expect(studio.folder.text('b/godot/Paperdoll.tscn')).toBe('scene of b');
	// The runtime comes before the files that name it, and the second character finds it already in place.
	expect(studio.folder.log.filter((entry) => entry.endsWith(RUNTIME))).toEqual([
		`write ${RUNTIME}`
	]);
	expect(studio.folder.log.indexOf(`write ${RUNTIME}`)).toBeLessThan(
		studio.folder.log.indexOf('write a/godot/Paperdoll.tscn')
	);
	const shared = `runtime|${a!.destinationId}|godot`;
	expect(Object.keys(studio.records.get(shared)!.written)).toEqual(['paperdoll.gd']);
	expect(Object.keys(studio.records.get(`a|${a!.linkedAt}`)!.written).sort()).toEqual([
		'godot/Paperdoll.tscn',
		'manifest.json'
	]);
	expect(studio.floors.get(shared)).toBe(2);
	expect(api.runtimePath(a!)).toBe('Game/pixeldoll-godot/');
});

it('pauses every write when the shared runtime was edited, and replaces only the approved bytes', async () => {
	const game = folderHandle('Game');
	await link('a', game);
	studio.folder.set(RUNTIME, 'my runtime edit');
	studio.runtime = { revision: 3, text: 'runtime v3' };
	const before = studio.folder.log.length;

	await api.publishProjectFolder();

	const status = api.projectFolder.status;
	expect(status).toMatchObject({
		kind: 'blocked',
		conflicts: [{ path: RUNTIME, reason: 'edited-outside' }]
	});
	expect(studio.folder.log.slice(before)).toEqual([]);
	if (status.kind !== 'blocked') return;
	await api.publishProjectFolder(
		new Map(status.conflicts.map((c) => [c.path, c.found!])),
		status.linkedAt
	);
	expect(studio.folder.text(RUNTIME)).toBe('runtime v3');
	expect(api.projectFolder.status.kind).toBe('done');
});

it('stops a tab with an older runtime instead of putting it back, even after a newer update stopped part way', async () => {
	const game = folderHandle('Game');
	await link('a', game);
	// A newer tab starts updating the runtime, writes it, then fails on the character's own file.
	studio.runtime = { revision: 3, text: 'runtime v3' };
	studio.edit = ' with a hat';
	studio.folder.failWrite = (path) =>
		path.startsWith('a/') ? new DOMException('x', 'NoModificationAllowedError') : undefined;
	await api.publishProjectFolder();
	expect(studio.folder.text(RUNTIME)).toBe('runtime v3');
	expect(api.projectFolder.status).toMatchObject({ kind: 'failed', reason: 'locked' });

	// This tab still has the older runtime: its record shows v3 as PixelDoll's own bytes, so only the floor stops it.
	studio.folder.failWrite = undefined;
	studio.runtime = { revision: 2, text: 'runtime v2' };
	const before = studio.folder.log.length;
	await api.publishProjectFolder();

	expect(api.projectFolder.status).toEqual({ kind: 'outdated' });
	expect(studio.folder.text(RUNTIME)).toBe('runtime v3');
	expect(studio.folder.log.slice(before)).toEqual([]);
});

it('raises the floor before writing the runtime, so a crash during the update still fences older tabs', async () => {
	const game = folderHandle('Game');
	studio.folder.failWrite = (path) =>
		path === RUNTIME ? new DOMException('x', 'NoModificationAllowedError') : undefined;
	const a = await link('a', game);
	expect(studio.folder.text(RUNTIME)).toBeNull();
	expect(studio.floors.get(`runtime|${a!.destinationId}|godot`)).toBe(2);
});

it('never publishes a build whose runtime does not match its engine', async () => {
	studio.bundle = false;
	await link('a', folderHandle('Game'));
	expect(api.projectFolder.status).toEqual({ kind: 'unavailable' });
	expect(studio.folder.log).toEqual([]);
});

it('publishes engines without a runtime into the character folder only', async () => {
	studio.bundle = false;
	const a = await link('a', folderHandle('Game'), 'generic');
	expect(api.runtimePath(a!)).toBeNull();
	expect(studio.folder.log).toEqual(['write a/godot/Paperdoll.tscn', 'write a/manifest.json']);
});

it('refuses a folder inside one PixelDoll manages', async () => {
	const game = folderHandle('Game');
	await link('a', game);
	const inside = folderHandle('a');
	nest(game, inside, ['a']);
	await link('b', inside);
	expect(studio.links.has('b')).toBe(false);
	expect(api.projectFolder.status).toEqual({ kind: 'overlap', unity: false });
});

it('refuses a second Unity runtime in one game, but allows nested folders for other engines', async () => {
	const assets = folderHandle('Assets');
	await link('a', assets, 'unity');
	const characters = folderHandle('Characters');
	nest(assets, characters, ['Characters']);
	await link('b', characters, 'unity');
	expect(studio.links.has('b')).toBe(false);
	expect(api.projectFolder.status).toEqual({ kind: 'overlap', unity: true });

	await link('b', characters, 'godot');
	expect(studio.links.get('b')?.destinationId).not.toBe(studio.links.get('a')?.destinationId);
});

it('keeps the folder and its revision floor after the last character there is unlinked', async () => {
	const game = folderHandle('Game');
	const a = await link('a', game);
	studio.runtime = { revision: 3, text: 'runtime v3' };
	studio.edit = ' with a hat';
	await api.publishProjectFolder();
	await api.unlinkProjectFolder();
	expect(studio.links.size).toBe(0);

	// An older tab links another character to the same folder: it is the same destination, so it stops.
	studio.runtime = { revision: 2, text: 'runtime v2' };
	const b = await link('b', folderHandle('Game', { same: game }));
	expect(b?.destinationId).toBe(a?.destinationId);
	expect(api.projectFolder.status).toEqual({ kind: 'outdated' });
	expect(studio.folder.text(RUNTIME)).toBe('runtime v3');
});

it('writes nothing of the character when the runtime write fails, and raises no floor for a paused publish', async () => {
	const game = folderHandle('Game');
	studio.folder.set('a/manifest.json', 'not PixelDoll');
	const a = await link('a', game);
	// The character's manifest is the user's: the whole publish pauses before the floor rises.
	expect(api.projectFolder.status).toMatchObject({ kind: 'blocked' });
	expect(studio.floors.get(`runtime|${a!.destinationId}|godot`)).toBeUndefined();

	studio.folder.files.delete('a/manifest.json');
	studio.folder.failWrite = (path) =>
		path === RUNTIME ? new DOMException('x', 'NoModificationAllowedError') : undefined;
	await api.publishProjectFolder();
	expect(studio.folder.log).toEqual([]);
});

it('refuses moving a Unity character to a folder nested in its own earlier one, whose runtime stays', async () => {
	const assets = folderHandle('Assets');
	await link('a', assets, 'unity');
	expect(studio.folder.text('pixeldoll-unity/paperdoll.gd')).toBe('runtime v2');
	const characters = folderHandle('Characters');
	nest(assets, characters, ['Characters']);
	vi.stubGlobal('showDirectoryPicker', async () => characters);
	await api.linkProjectFolder('unity');
	expect(api.projectFolder.status).toEqual({ kind: 'overlap', unity: true });
	expect(studio.links.get('a')?.handle).toBe(assets);
});

it('shows the newer link when Unlink finds another tab already replaced it', async () => {
	const a = await link('a', folderHandle('Game'));
	const newer = { ...a!, linkedAt: 'from another tab' };
	studio.links.set('a', newer);
	await api.unlinkProjectFolder();
	expect(studio.links.get('a')).toEqual(newer);
	expect(api.projectFolder.link).toEqual(newer);
});

it('reads the shared runtime on a quiet check: a deleted one pauses instead of reading as up to date', async () => {
	await link('a', folderHandle('Game'));
	expect(api.projectFolder.status.kind).toBe('done');
	studio.folder.files.delete(RUNTIME);
	vi.useFakeTimers();
	try {
		let pending: Promise<unknown> | undefined;
		vi.stubGlobal('navigator', {
			locks: { request: (_name: string, work: () => Promise<unknown>) => (pending = work()) }
		});
		api.scheduleFolderPublish();
		await vi.advanceTimersByTimeAsync(1500);
		await pending;
	} finally {
		vi.useRealTimers();
	}
	expect(api.projectFolder.status).toMatchObject({
		kind: 'blocked',
		conflicts: [{ path: RUNTIME, reason: 'deleted' }]
	});
});

it('keeps a kept runtime file for its revision, and asks again once a newer runtime arrives', async () => {
	const a = await link('a', folderHandle('Game'));
	const shared = `runtime|${a!.destinationId}|godot`;
	studio.folder.set(RUNTIME, 'my runtime');
	studio.edit = ' with a hat';
	await api.publishProjectFolder();
	const status = api.projectFolder.status;
	if (status.kind !== 'blocked') throw new Error('Expected the edited runtime conflict');
	await api.keepProjectFolderFiles([RUNTIME], status.linkedAt);
	// Kept under this revision: the character updates, the user's runtime stays, and no runtime write raised the floor.
	expect(studio.folder.text('a/godot/Paperdoll.tscn')).toBe('scene of a with a hat');
	expect(studio.folder.text(RUNTIME)).toBe('my runtime');
	expect(studio.floors.get(shared)).toBe(2);

	// A newer runtime is a new decision: the edited file is listed again instead of silently staying older.
	studio.runtime = { revision: 3, text: 'runtime v3' };
	studio.edit = ' with a cape';
	await api.publishProjectFolder();
	expect(api.projectFolder.status).toMatchObject({
		kind: 'blocked',
		conflicts: [{ path: RUNTIME, reason: 'edited-outside' }]
	});
	expect(studio.folder.text(RUNTIME)).toBe('my runtime');
});

it('stops a stale tab before it can keep a runtime file another tab has since updated', async () => {
	const a = await link('a', folderHandle('Game'));
	const shared = `runtime|${a!.destinationId}|godot`;
	studio.floors.set(shared, 3); // a newer tab installed revision 3 meanwhile
	await api.keepProjectFolderFiles([RUNTIME], a!.linkedAt);
	expect(api.projectFolder.status).toEqual({ kind: 'outdated' });
	expect(studio.records.get(shared)?.kept ?? []).toEqual([]);
});

it('refuses moving a Unity character into its own earlier folder even before that runtime was installed', async () => {
	const assets = folderHandle('Assets');
	await link('a', assets, 'unity');
	studio.floors.clear(); // as if its first publish were still running in another tab
	const characters = folderHandle('Characters');
	nest(assets, characters, ['Characters']);
	vi.stubGlobal('showDirectoryPicker', async () => characters);
	await api.linkProjectFolder('unity');
	expect(api.projectFolder.status).toEqual({ kind: 'overlap', unity: true });
});

it('only lets the user keep a shared runtime file that still exists', () => {
	expect(keepable({ path: RUNTIME, reason: 'edited-outside' })).toBe(true);
	expect(keepable({ path: RUNTIME, reason: 'deleted' })).toBe(false);
	expect(keepable({ path: RUNTIME, reason: 'folder' })).toBe(false);
	expect(keepable({ path: 'a/manifest.json', reason: 'deleted' })).toBe(true);
});

it('asks for a reload when a newer PixelDoll upgraded the project folder storage mid-publish', async () => {
	await link('a', folderHandle('Game'));
	studio.edit = ' with a hat';
	studio.storageError = new DOMException('newer', 'VersionError');
	await api.publishProjectFolder();
	expect(api.projectFolder.status).toEqual({ kind: 'outdated' });
});

it('uses a matching runtime found in a new folder as it is, without offering to adopt it', async () => {
	studio.folder.set(RUNTIME, 'runtime v2'); // as another browser profile left it
	const a = await link('a', folderHandle('Game'));
	expect(api.projectFolder.status.kind).toBe('done');
	expect(api.projectFolder.offer).toBeNull();
	expect(studio.folder.log).not.toContain(`write ${RUNTIME}`);
	expect(studio.records.get(`runtime|${a!.destinationId}|godot`)?.written ?? {}).toEqual({});
});

it('pauses to restore a kept shared runtime file once it is deleted', async () => {
	const a = await link('a', folderHandle('Game'));
	studio.folder.set(RUNTIME, 'my runtime');
	studio.records.get(`runtime|${a!.destinationId}|godot`)!.kept = ['paperdoll.gd'];
	studio.folder.files.delete(RUNTIME);
	studio.edit = ' with a hat';
	const before = studio.folder.log.length;
	await api.publishProjectFolder();
	expect(api.projectFolder.status).toMatchObject({
		kind: 'blocked',
		conflicts: [{ path: RUNTIME, reason: 'deleted' }]
	});
	expect(studio.folder.log.slice(before)).toEqual([]);
});

it('remembers a Unity folder after its last character goes, even with a runtime PixelDoll did not write', async () => {
	studio.folder.set('pixeldoll-unity/paperdoll.gd', 'runtime v2'); // left by another browser profile
	const assets = folderHandle('Assets');
	await link('a', assets, 'unity');
	expect(studio.floors.size).toBe(0);
	await api.unlinkProjectFolder();
	const characters = folderHandle('Characters');
	nest(assets, characters, ['Characters']);
	await link('b', characters, 'unity');
	expect(studio.links.has('b')).toBe(false);
	expect(api.projectFolder.status).toEqual({ kind: 'overlap', unity: true });
});

it('never gives a character a reserved PixelDoll folder name', async () => {
	const a = await link('PixelDoll', folderHandle('Game'));
	expect(a?.subfolder).toBe('character-PixelDoll');
	expect(studio.folder.text('character-PixelDoll/godot/Paperdoll.tscn')).toBe('scene of PixelDoll');
	expect(studio.folder.text(RUNTIME)).toBe('runtime v2');
});

it('reserves every PixelDoll- folder name, without case', async () => {
	const { characterFolder } = await import('../../src/lib/project-folder/layout.ts');
	expect(characterFolder('pixeldoll-godot')).toBe('character-pixeldoll-godot');
	expect(characterFolder('PIXELDOLL')).toBe('character-PIXELDOLL');
	expect(characterFolder('pixeldolls')).toBe('pixeldolls');
	expect(characterFolder('adventurer')).toBe('adventurer');
});

it('lists a deleted kept runtime file to restore, even one PixelDoll never wrote, and leaves other keeps alone', async () => {
	studio.folder.set(RUNTIME, 'their runtime'); // already there, not PixelDoll's
	const a = await link('a', folderHandle('Game'));
	const status = api.projectFolder.status;
	if (status.kind !== 'blocked') throw new Error('Expected the existing runtime conflict');
	await api.keepProjectFolderFiles([RUNTIME], status.linkedAt);
	const shared = `runtime|${a!.destinationId}|godot`;
	studio.records.get(`a|${a!.linkedAt}`)!.kept = ['manifest.json']; // a keep of the character's own
	studio.folder.files.delete(RUNTIME);
	await api.publishProjectFolder();
	const lost = api.projectFolder.status;
	expect(lost).toMatchObject({
		kind: 'blocked',
		conflicts: [{ path: RUNTIME, reason: 'deleted' }]
	});
	expect(studio.folder.text(RUNTIME)).toBeNull();
	if (lost.kind !== 'blocked') return;
	await api.publishProjectFolder(new Map([[RUNTIME, 'deleted']]), lost.linkedAt);
	expect(studio.folder.text(RUNTIME)).toBe('runtime v2');
	expect(studio.records.get(shared)!.kept).toEqual([]);
	expect(studio.records.get(`a|${a!.linkedAt}`)!.kept).toEqual(['manifest.json']);
	// The status counts only what is still kept: the character's manifest.
	expect(api.projectFolder.status).toMatchObject({ kind: 'done', kept: 1 });
});

it('records a kept runtime file against its revision, and a quiet check of a folder with one does not rebuild', async () => {
	studio.folder.set(RUNTIME, 'their runtime'); // already there: nothing written, so no floor yet
	const a = await link('a', folderHandle('Game'));
	const shared = `runtime|${a!.destinationId}|godot`;
	expect(studio.floors.get(shared)).toBeUndefined();
	const status = api.projectFolder.status;
	if (status.kind !== 'blocked') throw new Error('Expected the existing runtime conflict');
	await api.keepProjectFolderFiles([RUNTIME], status.linkedAt);
	expect(studio.floors.get(shared)).toBe(2);
	expect(api.projectFolder.status.kind).toBe('done');

	const before = studio.builds;
	vi.useFakeTimers();
	try {
		let pending: Promise<unknown> | undefined;
		vi.stubGlobal('navigator', {
			locks: { request: (_name: string, work: () => Promise<unknown>) => (pending = work()) }
		});
		api.scheduleFolderPublish();
		await vi.advanceTimersByTimeAsync(1500);
		await pending;
	} finally {
		vi.useRealTimers();
	}
	expect(api.projectFolder.status.kind).toBe('done');
	expect(studio.builds).toBe(before);
});

it('reports an unreadable kept runtime file instead of publishing past it', async () => {
	const a = await link('a', folderHandle('Game'));
	studio.records.get(`runtime|${a!.destinationId}|godot`)!.kept = ['paperdoll.gd'];
	studio.floors.set(`runtime|${a!.destinationId}|godot`, 2);
	studio.folder.failRead = (path) =>
		path === RUNTIME ? new DOMException('x', 'NotReadableError') : undefined;
	studio.edit = ' with a hat';
	const before = studio.folder.log.length;
	await api.publishProjectFolder();
	expect(api.projectFolder.status).toEqual({ kind: 'failed', reason: 'locked' });
	expect(studio.folder.log.slice(before)).toEqual([]);
});

it('stops keeping a restored runtime file once it is back, even when a character file then fails', async () => {
	studio.folder.set(RUNTIME, 'their runtime');
	const a = await link('a', folderHandle('Game'));
	const first = api.projectFolder.status;
	if (first.kind !== 'blocked') throw new Error('Expected the existing runtime conflict');
	await api.keepProjectFolderFiles([RUNTIME], first.linkedAt);
	studio.folder.files.delete(RUNTIME);
	studio.edit = ' with a hat';
	await api.publishProjectFolder();
	const lost = api.projectFolder.status;
	if (lost.kind !== 'blocked') throw new Error('Expected the deleted runtime conflict');
	studio.folder.failWrite = (path) =>
		path.startsWith('a/') ? new DOMException('x', 'NoModificationAllowedError') : undefined;
	await api.publishProjectFolder(new Map([[RUNTIME, 'deleted']]), lost.linkedAt);
	expect(api.projectFolder.status).toEqual({ kind: 'failed', reason: 'locked' });
	expect(studio.folder.text(RUNTIME)).toBe('runtime v2');
	expect(studio.records.get(`runtime|${a!.destinationId}|godot`)!.kept).toEqual([]);
});

it('lets a Unity folder nest with an earlier Unity folder whose runtime is gone', async () => {
	const assets = folderHandle('Assets');
	await link('a', assets, 'unity');
	await api.unlinkProjectFolder();
	// The user deleted pixeldoll-unity/ from the earlier folder: nothing there can collide any more.
	(assets as unknown as { getDirectoryHandle: () => Promise<never> }).getDirectoryHandle =
		async () => {
			throw new DOMException('gone', 'NotFoundError');
		};
	const characters = folderHandle('Characters');
	nest(assets, characters, ['Characters']);
	await link('b', characters, 'unity');
	expect(studio.links.get('b')?.handle).toBe(characters);
});
