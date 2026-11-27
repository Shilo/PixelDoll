// Project folder: The unchanged-character shortcut and its record checks (partial publishes, released keeps, format preference,
// image sizes), plus adoption and save edge cases.
import { afterEach, expect, it, vi } from 'vitest';
import { makeImg } from '../../src/lib/image/png.ts';
import { decodePngBytes } from '../../src/lib/image/pngraw.ts';
import type { FolderLink } from '../../src/lib/project-folder/links.ts';
import type { FolderRecord } from '../../src/lib/project-folder/plan.ts';
import { cellHash } from '../../src/lib/rig/rig.ts';
import { readCharacterZip } from '../../src/lib/store/import.ts';
import { CURRENT_FORMAT, type Engine, type Project } from '../../src/lib/store/manifest.ts';
import { domError, files, memoryFolder } from './project-folder-memory.ts';

type BuildOptions = { engine: Engine; look: { items: { hat: string } }; exportedAt: string };

const studio = vi.hoisted(() => ({
	doc: { id: 'hero', items: { hat: 'original' } },
	source: undefined as Project | undefined,
	settings: { engine: 'generic' as Engine },
	getLink: vi.fn(),
	replaceLink: vi.fn(),
	updateLink: vi.fn(),
	readRecord: vi.fn<() => Promise<FolderRecord>>(),
	recordWritten: vi.fn<(key: string, path: string, hash: string | null) => Promise<void>>(),
	setKept: vi.fn<(key: string, paths: string[], keep: boolean) => Promise<void>>(),
	prepare: vi.fn<() => Promise<void>>(),
	build: vi.fn<(project: unknown, options: BuildOptions) => unknown>(),
	target: vi.fn()
}));

vi.mock('../../src/studio/state.svelte.ts', () => ({
	doc: studio.doc,
	store: {
		projects: [{ id: 'hero' }],
		project: { images: new Map(), manifest: { rig: { animations: [] } } }
	},
	prepareWorkspaceExport: studio.prepare,
	dismissToast: vi.fn(),
	toast: vi.fn(),
	ui: {}
}));
vi.mock('../../src/studio/download.svelte.ts', () => ({
	characterZipId: () => 'hero',
	editableData: vi.fn(),
	exportSource: async () => ({
		project: studio.source ?? {
			images: new Map(),
			manifest: { name: 'hero', rig: { animations: [] } }
		},
		look: { items: { ...studio.doc.items }, variants: {} }
	})
}));
vi.mock('../../src/studio/exportLayering.ts', () => ({ exportActionLayering: vi.fn() }));
vi.mock('../../src/studio/settingsNavigation.svelte.ts', () => ({ openSettings: vi.fn() }));
vi.mock('../../src/lib/export/build.ts', () => ({ buildExport: studio.build }));
vi.mock('../../src/lib/project-folder/support.ts', () => ({
	folderSupport: async () => 'supported'
}));
vi.mock('../../src/lib/store/export-settings.ts', async (importOriginal) => ({
	...(await importOriginal<typeof import('../../src/lib/store/export-settings.ts')>()),
	readExportSettings: async () => ({
		engine: studio.settings.engine,
		dressedCharacterSheets: true,
		actionLayers: false,
		playOnce: []
	})
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
const manifest = 'manifest.json';
const earlier = '2025-02-02T00:00:00.000Z';
// Like a real export manifest, it names the worn look, so a look change changes it.
const manifestText = (exportedAt: string, engine: Engine = 'generic', hat = 'original') =>
	JSON.stringify({ name: 'hero', look: hat, export: { exportedAt, engine } });

function gate() {
	let open!: () => void;
	const wait = new Promise<void>((resolve) => (open = resolve));
	return { open, wait };
}

async function setup(initial: Record<string, string> = {}) {
	vi.resetAllMocks();
	vi.useFakeTimers();
	vi.setSystemTime(new Date('2026-11-26T00:00:00.000Z'));
	vi.stubGlobal('__APP_VERSION__', 'test');
	vi.stubGlobal('__APP_COMMIT__', 'test');
	const identity = <T>(value: T) => value;
	vi.stubGlobal('$state', Object.assign(identity, { raw: identity }));
	let pending: Promise<unknown> | undefined;
	vi.stubGlobal('navigator', {
		locks: {
			request(_name: string, work: () => Promise<unknown>) {
				return (pending = work());
			}
		}
	});
	const handle = { name: 'Game', queryPermission: async () => 'granted' };
	vi.stubGlobal('showDirectoryPicker', async () => handle);
	studio.doc.items.hat = 'original';
	studio.source = undefined;
	studio.settings.engine = 'generic';
	const folder = memoryFolder(initial);
	studio.target.mockReturnValue(folder.target);
	studio.prepare.mockResolvedValue(undefined);
	let link: FolderLink | null = null;
	studio.getLink.mockImplementation(async (id: string) => (link?.characterId === id ? link : null));
	studio.replaceLink.mockImplementation(async (fresh: FolderLink) => (link = fresh));
	studio.updateLink.mockImplementation(async (id: string, linkedAt: string, patch: object) => {
		if (link?.characterId !== id || link.linkedAt !== linkedAt) return null;
		return (link = { ...link, ...patch });
	});
	studio.readRecord.mockImplementation(async () => structuredClone(folder.record));
	studio.recordWritten.mockImplementation(async (_key, path, hash) => {
		if (hash === null) delete folder.record.written[path];
		else folder.record.written[path] = hash;
	});
	studio.setKept.mockImplementation(async (_key, paths, keep) => {
		folder.record.kept = keep ? [...new Set([...folder.record.kept, ...paths])] : [];
	});
	studio.build.mockImplementation(async (_, { engine, look, exportedAt }) => ({
		kind: 'requested',
		entries: files({
			[sprite]: look.items.hat,
			[manifest]: manifestText(exportedAt, engine, look.items.hat)
		})
	}));
	const openTab = async () => {
		vi.resetModules();
		const api = await import('../../src/studio/projectFolder.svelte.ts');
		await api.loadFolderLink('hero');
		return api;
	};
	const background = async (api: Awaited<ReturnType<typeof openTab>>) => {
		pending = undefined;
		api.scheduleFolderPublish();
		await vi.advanceTimersByTimeAsync(1500);
		expect(pending).toBeInstanceOf(Promise);
		await pending;
	};
	return { api: await openTab(), folder, openTab, background, link: () => link };
}

afterEach(() => {
	vi.useRealTimers();
	vi.unstubAllGlobals();
});

it('reports an external edit to an unowned matching file on a background check', async () => {
	const { api, folder, background, link } = await setup({
		[sprite]: 'original',
		[manifest]: manifestText(earlier)
	});
	await api.linkProjectFolder('generic');
	expect(link()?.inputs).toEqual(expect.any(String));
	expect(api.projectFolder.offer?.files).toHaveLength(2);
	api.leaveMatchingFiles();
	expect(folder.record.written).toEqual({});
	folder.set(sprite, 'game edit');

	await background(api);

	expect(folder.text(sprite)).toBe('game edit');
	expect(api.projectFolder.status).toMatchObject({
		kind: 'blocked',
		conflicts: expect.arrayContaining([expect.objectContaining({ path: sprite })])
	});
});

it('restores the older look after a partial newer publish and a new tab', async () => {
	const { api, folder, openTab, background, link } = await setup();
	await api.linkProjectFolder('generic');
	const original = link();
	const originalSpriteHash = folder.record.written[sprite];
	expect(original?.inputs).toEqual(expect.any(String));
	vi.setSystemTime(new Date('2026-11-26T00:01:00.000Z'));
	studio.doc.items.hat = 'new look';
	folder.failWrite = (path) => (path === manifest ? domError('InvalidStateError') : undefined);
	await api.publishProjectFolder();
	expect(api.projectFolder.status).toEqual({ kind: 'failed', reason: 'locked' });
	expect(folder.text(sprite)).toBe('new look');
	expect(folder.record.written[sprite]).not.toBe(originalSpriteHash);
	expect(folder.text(manifest)).toBe(manifestText(original!.exportedAt!));
	expect(link()?.inputs).toBe(original?.inputs);

	folder.failWrite = undefined;
	studio.doc.items.hat = 'original';
	const fresh = await openTab();
	expect(fresh.projectFolder.status.kind).toBe('idle');
	await background(fresh);

	expect(folder.text(sprite)).toBe('original');
});

it('leaves an unchanged linked export alone when the global format preference changes', async () => {
	const { api, folder, background, link } = await setup({
		[sprite]: 'original',
		[manifest]: manifestText(earlier)
	});
	await api.linkProjectFolder('generic');
	api.leaveMatchingFiles();
	expect(api.projectFolder.status.kind).toBe('done');
	expect(link()?.engine).toBe('generic');
	expect(link()?.exportedAt).toBe(earlier);
	studio.settings.engine = 'godot';

	await background(api);

	expect(folder.log).toEqual([]);
	expect(api.projectFolder.status.kind).toBe('done');
});

it('reports a released file conflict on a background check in a new tab', async () => {
	const { api, folder, openTab, background, link } = await setup({
		[sprite]: 'custom sprite',
		[manifest]: manifestText(earlier)
	});
	await api.linkProjectFolder('generic');
	expect(api.projectFolder.status.kind).toBe('blocked');
	await api.keepProjectFolderFiles([sprite], link()!.linkedAt);
	expect(api.projectFolder.status).toMatchObject({ kind: 'done', kept: 1 });
	expect(link()?.inputs).toEqual(expect.any(String));
	await api.releaseKeptFiles();
	expect(api.projectFolder.status.kind).toBe('blocked');
	expect(folder.record.kept).toEqual([]);

	const fresh = await openTab();
	await background(fresh);

	expect(folder.text(sprite)).toBe('custom sprite');
	expect(fresh.projectFolder.status).toMatchObject({
		kind: 'blocked',
		conflicts: expect.arrayContaining([expect.objectContaining({ path: sprite })])
	});
});

it('rebuilds when the decoded reference dimensions change under the same RGBA hash', async () => {
	const { api, folder, openTab, background, link } = await setup();
	const { buildExport } = await vi.importActual<typeof import('../../src/lib/export/build.ts')>(
		'../../src/lib/export/build.ts'
	);
	const body = makeImg(32, 32);
	body.data.set([17, 34, 51, 255]);
	const bodyHash = await cellHash(body);
	const reference = makeImg(8, 4);
	reference.data.set([51, 34, 17, 255]);
	const referenceHash = await cellHash(reference);
	const reshaped = { ...reference, w: 4, h: 8 };
	expect(await cellHash(reshaped)).toBe(referenceHash);
	const project: Project = {
		images: new Map([
			[bodyHash, body],
			[referenceHash, reference]
		]),
		manifest: {
			format: CURRENT_FORMAT,
			app: 'PixelDoll',
			name: 'Review',
			rig: {
				cell: { w: 32, h: 32 },
				pivot: { x: 16, y: 31 },
				baseItem: 'base',
				baseHash: bodyHash,
				directions: [{ id: 'south' }],
				animations: [{ id: 'idle', cells: 1, loop: true, frames: [{ cell: 0, ms: 100 }] }],
				rest: { south: { image: referenceHash, keypoints: [] } }
			},
			slots: [{ id: 'body', z: 10, class: 'base' }],
			items: [
				{
					id: 'base',
					name: 'Body',
					slot: 'body',
					status: 'accepted',
					mirror: 'generate',
					materials: [],
					prompt: '',
					provenance: [],
					baseHash: bodyHash,
					layers: [{ id: 'main', role: 'fg', z: 10, cells: { idle: { south: [bodyHash] } } }]
				}
			],
			materials: [],
			presets: []
		}
	};
	const options = {
		engine: 'generic' as const,
		settings: {
			engine: 'generic' as const,
			dressedCharacterSheets: true,
			actionLayers: false,
			playOnce: []
		},
		baked: true,
		look: { items: {}, variants: {} }
	};
	studio.build.mockImplementation(async (input, { exportedAt }) =>
		buildExport(input as Project, { ...options, exportedAt, filesOnly: true })
	);
	studio.source = project;
	await api.linkProjectFolder('generic');
	expect(link()?.inputs).toEqual(expect.any(String));
	const path = `cells/${referenceHash.slice(7)}.png`;
	expect(await decodePngBytes(folder.files.get(path)!)).toMatchObject({ w: 8, h: 4 });

	// A valid editable ZIP can supply different PNG dimensions under the same RGBA hash. Import saves these blobs by
	// hash in shared storage. A later tab can therefore decode the new image for the original character's manifest.
	const changed = { ...project, images: new Map(project.images).set(referenceHash, reshaped) };
	const built = await buildExport(changed, options);
	expect(built.kind).toBe('requested');
	const imported = await readCharacterZip(built.zip!);
	expect(imported.project.images.get(referenceHash)).toMatchObject({ w: 4, h: 8 });
	studio.source = { ...project, images: imported.project.images };
	const fresh = await openTab();
	await background(fresh);

	expect(await decodePngBytes(folder.files.get(path)!)).toMatchObject({ w: 4, h: 8 });
});

it('clears the accepted offer after leaving and returning to the character during adoption', async () => {
	const { api, folder, link } = await setup({
		[sprite]: 'original',
		[manifest]: manifestText(earlier)
	});
	await api.linkProjectFolder('generic');
	const offer = api.projectFolder.offer;
	expect(offer?.files).toHaveLength(2);
	const reading = gate();
	const finish = gate();
	const read = folder.target.read;
	vi.spyOn(folder.target, 'read').mockImplementationOnce(async (path) => {
		reading.open();
		await finish.wait;
		return read(path);
	});
	const adopting = api.adoptMatchingFiles();
	await reading.wait;
	await api.loadFolderLink('mage');
	expect(api.projectFolder.offer).toBeNull();
	await api.loadFolderLink('hero');
	expect(api.projectFolder.offer).toMatchObject({ linkedAt: link()?.linkedAt });
	finish.open();
	await adopting;

	expect(Object.keys(folder.record.written)).toEqual([sprite, manifest]);
	expect(api.projectFolder.offer).toBeNull();
});

it('stops showing Updating after a waiting automatic update cannot save', async () => {
	const { api, folder } = await setup();
	await api.linkProjectFolder('generic');
	studio.doc.items.hat = 'next';
	vi.setSystemTime(new Date('2026-11-26T00:01:00.000Z'));
	folder.onStage = () => {
		studio.doc.items.hat = 'latest';
		api.scheduleFolderPublish();
		folder.onStage = undefined;
	};
	await api.publishProjectFolder();
	expect(folder.text(sprite)).toBe('next');
	expect(api.projectFolder.status.kind).toBe('publishing');
	expect(vi.getTimerCount()).toBe(1);
	studio.prepare.mockRejectedValueOnce(new Error('Save did not complete'));
	const warning = vi.spyOn(console, 'warn').mockImplementation(() => {});
	try {
		await vi.advanceTimersByTimeAsync(1500);
		await vi.waitFor(() => expect(warning).toHaveBeenCalled());
		expect(vi.getTimerCount()).toBe(0);
		expect(api.projectFolder.status.kind).not.toBe('publishing');
	} finally {
		warning.mockRestore();
	}
});
