import { afterEach, describe, expect, test, vi } from 'vitest';
import { readFile } from 'node:fs/promises';
import { openSource } from '../../src/lib/dress/project.ts';
import { splitBase } from '../../src/lib/dress/regions.ts';
import * as rig from '../../src/lib/rig/rig.ts';
import { rememberDecoded } from '../../src/lib/store/project.ts';
import { loadProject, OUTDATED, type StoredProject } from '../../src/lib/store/project.ts';
import * as db from '../../src/lib/store/db.ts';
import {
	blobReferences,
	incompatibleCounts,
	incompatibleKind,
	type IncompatibleKind
} from '../../src/lib/store/incompatible.ts';
import { packIncompatible, unpackIncompatible } from '../../src/lib/store/incompatible-archive.ts';
import { zip } from '../../src/lib/store/zip.ts';
import * as png from '../../src/lib/image/png.ts';
import type { Sha256 } from '../../src/lib/store/manifest.ts';
import { CURRENT_FORMAT } from '../../src/lib/store/manifest.ts';

afterEach(() => {
	vi.restoreAllMocks();
	vi.unstubAllGlobals();
});

function pending<T>() {
	let resolve!: (value: T) => void;
	const promise = new Promise<T>((done) => {
		resolve = done;
	});
	return { promise, resolve };
}
// Decoded cells are cached by hash for the page's lifetime, so each fixture gets cells no earlier test decoded.
let fixtures = 0;
function fixture() {
	const n = (++fixtures).toString(16).padStart(8, '0'),
		first = `sha256:${'1'.repeat(56)}${n}` as Sha256,
		second = `sha256:${'2'.repeat(56)}${n}` as Sha256;
	const record: StoredProject = {
		id: 'rig-load',
		savedAt: '',
		origin: 'studio',
		manifest: {
			format: CURRENT_FORMAT,
			name: 'Cancelable character',
			app: 'PixelDoll',
			slots: [],
			materials: [],
			presets: [],
			rig: {
				cell: { w: 32, h: 32 },
				pivot: { x: 16, y: 30 },
				baseItem: 'body',
				baseHash: first,
				directions: [{ id: 'south' }],
				animations: [
					{
						id: 'walk',
						cells: 2,
						loop: true,
						frames: [
							{ cell: 0, ms: 100 },
							{ cell: 1, ms: 100 }
						]
					}
				],
				rest: { south: { image: first, keypoints: [] } }
			},
			items: [
				{
					id: 'body',
					name: 'Body',
					slot: 'body',
					status: 'accepted',
					mirror: 'generate',
					baseHash: first,
					materials: [],
					prompt: '',
					provenance: [],
					layers: [
						{
							id: 'main',
							role: 'fg',
							z: 0,
							cells: { walk: { south: [first, second, first, null] } }
						}
					]
				}
			]
		}
	};
	const image = png.makeImg(32, 32),
		blob = new Blob(['stored image']);
	const get = vi.spyOn(db, 'get').mockResolvedValue(record),
		getBlob = vi.spyOn(db, 'getBlob').mockResolvedValue(blob);
	const decode = vi.spyOn(png, 'decodePng').mockResolvedValue(image);
	return { record, image, blob, get, getBlob, decode, first, second };
}

test('split results stop retaining pixels after decoded-cache eviction', async () => {
	const fixtureData = fixture();
	fixtureData.image.data.fill(128);
	const original = structuredClone(fixtureData.record.manifest);
	const project = () => ({
		manifest: structuredClone(original),
		images: new Map([
			[fixtureData.first, fixtureData.image],
			[fixtureData.second, fixtureData.image]
		])
	});
	const hash = vi.spyOn(rig, 'cellHash');
	const remember = vi.spyOn(await import('../../src/lib/store/project.ts'), 'rememberDecoded');
	await splitBase(project());
	expect(remember).toHaveBeenCalled();
	expect(new Set(remember.mock.calls.map(([, image]) => image)).size).toBe(1);
	hash.mockClear();
	await splitBase(project());
	expect(hash).not.toHaveBeenCalled();
	rememberDecoded('sha256:oversized', {
		w: 1,
		h: 1,
		data: new Uint8ClampedArray(96 * 1024 * 1024 + 1)
	});
	await splitBase(project());
	expect(hash).toHaveBeenCalled();
});

test('an unchanged split keeps the original shared pixel buffer', async () => {
	const fixtureData = fixture();
	for (let offset = 0; offset < fixtureData.image.data.length; offset += 4)
		fixtureData.image.data.set([200, 100, 50, 255], offset);
	const sourceHash = await rig.cellHash(fixtureData.image);
	const manifest = JSON.parse(
		JSON.stringify(fixtureData.record.manifest)
			.replaceAll(fixtureData.first, sourceHash)
			.replaceAll(fixtureData.second, sourceHash)
	) as typeof fixtureData.record.manifest;
	const remember = vi.spyOn(await import('../../src/lib/store/project.ts'), 'rememberDecoded');
	const split = await splitBase({ manifest, images: new Map([[sourceHash, fixtureData.image]]) });
	expect(split.changed).toBe(0);
	expect(remember).toHaveBeenCalled();
	for (const [, image] of remember.mock.calls) expect(image).toBe(fixtureData.image);
});

test('a canceled loader performs no metadata, blob or fixture fetch reads', async () => {
	const f = fixture(),
		controller = new AbortController(),
		fetch = vi.fn();
	vi.stubGlobal('fetch', fetch);
	controller.abort();
	await expect(loadProject(f.record.id, controller.signal)).rejects.toMatchObject({
		name: 'AbortError'
	});
	await expect(openSource('fixture:s2', controller.signal)).rejects.toMatchObject({
		name: 'AbortError'
	});
	expect(f.get).not.toHaveBeenCalled();
	expect(f.getBlob).not.toHaveBeenCalled();
	expect(f.decode).not.toHaveBeenCalled();
	expect(fetch).not.toHaveBeenCalled();
});

test('canceling during metadata loading never starts cell reads', async () => {
	const f = fixture(),
		metadata = pending<StoredProject>(),
		controller = new AbortController();
	f.get.mockReturnValueOnce(metadata.promise);
	const loading = loadProject(f.record.id, controller.signal),
		rejected = expect(loading).rejects.toMatchObject({ name: 'AbortError' });
	controller.abort();
	metadata.resolve(f.record);
	await rejected;
	expect(f.getBlob).not.toHaveBeenCalled();
	expect(f.decode).not.toHaveBeenCalled();
});

// The download is shared with other opens, so an abort ends this open, not the request.
test('an abandoned fixture open stops waiting for its pending download at once and reads nothing more', async () => {
	const f = fixture(),
		controller = new AbortController(),
		download = pending<Response>();
	const fetch = vi.fn(() => download.promise);
	vi.stubGlobal('fetch', fetch);
	const loading = openSource('fixture:s2', controller.signal),
		rejected = expect(loading).rejects.toMatchObject({ name: 'AbortError' });
	expect(fetch).toHaveBeenCalledOnce();
	controller.abort();
	await rejected;
	download.resolve(new Response(null, { status: 503 })); // fails, so the next test downloads again
	expect(fetch).toHaveBeenCalledOnce();
	expect(f.get).not.toHaveBeenCalled();
	expect(f.getBlob).not.toHaveBeenCalled();
});

/** A fresh module, so no download is cached yet; fetch serves the real demo files. */
async function freshSource(fail?: (path: string) => boolean) {
	vi.resetModules();
	const fetch = vi.fn(async (url: string) => {
		const path = new URL(url).pathname.slice(1);
		if (fail?.(path)) return new Response(null, { status: 503 });
		return new Response(await readFile(new URL(`../../public/${path}`, import.meta.url)));
	});
	vi.stubGlobal('fetch', fetch);
	const { openSource } = await import('../../src/lib/dress/project.ts');
	return { openSource, fetch };
}
const perUrl = (fetch: ReturnType<typeof vi.fn>) =>
	fetch.mock.calls.reduce<Record<string, number>>((n, [url]) => {
		n[url as string] = (n[url as string] ?? 0) + 1;
		return n;
	}, {});

test('concurrent and later demo opens download each file once and get separate projects', async () => {
	const { openSource, fetch } = await freshSource(),
		abandoned = new AbortController();
	const thumbnail = openSource('fixture:s2', abandoned.signal),
		opens = [openSource('fixture:s2'), openSource('fixture:s2')];
	expect(fetch).toHaveBeenCalledOnce(); // the thumbnail started the download; the others share it
	abandoned.abort(); // the thumbnail's abort does not cancel the others' download
	await expect(thumbnail).rejects.toMatchObject({ name: 'AbortError' });
	const [studio, list] = await Promise.all(opens);
	const reopened = await openSource('fixture:s2');
	const counts = perUrl(fetch);
	expect(Object.keys(counts)).toContain('http://localhost/fixtures/s2/fixture.json');
	expect(Object.keys(counts).length).toBeGreaterThan(1);
	expect(Object.values(counts).every((n) => n === 1)).toBe(true);
	// Each open gets its own manifest and image map: the Studio edits its project in place.
	expect(studio.project.manifest === list.project.manifest).toBe(false);
	expect(studio.project.images === reopened.project.images).toBe(false);
	expect(reopened.project.manifest.rig.baseHash).toBe(studio.project.manifest.rig.baseHash);
	// The artwork is built once: every open shares the same decoded images.
	const [hash, image] = [...studio.project.images][0];
	expect(reopened.project.images.get(hash)).toBe(image);
});

test('a demo whose saved outfits cannot be read still opens, with its defaults, marked unread', async () => {
	const { openSource } = await freshSource(); // no IndexedDB here: the outfit record read fails
	const opened = await openSource('fixture:s2');
	expect(opened.dressUnread).toBe(true);
	expect(opened.current).toBeUndefined();
	expect(opened.project.manifest.items.length).toBeGreaterThan(0);
});

test('a failed demo download is not kept: the next open downloads it again', async () => {
	let down = true;
	const { openSource, fetch } = await freshSource((path) => down && path.endsWith('walk.png'));
	await expect(openSource('fixture:s2')).rejects.toThrow(
		'The bundled character could not load (503)'
	);
	down = false;
	await openSource('fixture:s2');
	const counts = perUrl(fetch);
	expect(counts['http://localhost/fixtures/s2/fixture.json']).toBe(1);
	expect(Object.entries(counts).filter(([, n]) => n === 2)).toHaveLength(1);
});

for (const [name, read] of [
	['project', loadProject],
	['source', openSource]
] as const) {
	test(`an abandoned ${name} stops after its pending blob and never decodes or reads another cell`, async () => {
		const f = fixture(),
			blob = pending<Blob>(),
			controller = new AbortController();
		f.getBlob.mockReturnValueOnce(blob.promise);
		const loading = read(f.record.id, controller.signal),
			rejected = expect(loading).rejects.toMatchObject({ name: 'AbortError' });
		await vi.waitFor(() => expect(f.getBlob).toHaveBeenCalledOnce());
		controller.abort();
		blob.resolve(f.blob);
		await rejected;
		expect(f.getBlob).toHaveBeenCalledOnce();
		expect(f.decode).not.toHaveBeenCalled();
	});
}

test('canceling during PNG decoding prevents subsequent reads and project publication', async () => {
	const f = fixture(),
		image = pending<png.Img>(),
		controller = new AbortController();
	f.decode.mockReturnValueOnce(image.promise);
	const loading = loadProject(f.record.id, controller.signal),
		rejected = expect(loading).rejects.toMatchObject({ name: 'AbortError' });
	await vi.waitFor(() => expect(f.decode).toHaveBeenCalledOnce());
	controller.abort();
	image.resolve(f.image);
	await rejected;
	expect(f.getBlob).toHaveBeenCalledOnce();
	expect(f.decode).toHaveBeenCalledOnce();
});

test('an active load retains all unique cells and propagates genuine failures', async () => {
	const f = fixture(),
		loaded = await loadProject(f.record.id, new AbortController().signal);
	expect([...loaded.project.images.keys()]).toEqual([f.first, f.second]);
	expect(f.getBlob).toHaveBeenCalledTimes(2);
	expect(f.decode).toHaveBeenCalledTimes(2);
	// A later load (a thumbnail, then the open) shares the decoded cells instead of reading them again.
	const again = await loadProject(f.record.id);
	expect([...again.project.images.keys()]).toEqual([f.first, f.second]);
	expect(again.project.images.get(f.first)).toBe(loaded.project.images.get(f.first));
	expect(f.getBlob).toHaveBeenCalledTimes(2);
	expect(f.decode).toHaveBeenCalledTimes(2);
	const unread = fixture();
	unread.getBlob.mockRejectedValueOnce(new Error('Storage read failed'));
	await expect(loadProject(unread.record.id)).rejects.toThrow('Storage read failed');
	const malformed = fixture();
	malformed.decode.mockRejectedValueOnce(new Error('Malformed PNG'));
	await expect(loadProject(malformed.record.id)).rejects.toThrow('Malformed PNG');
});

test('concurrent loads share each cell read, and one abandoning it does not stop the other', async () => {
	const f = fixture();
	const [a, b] = await Promise.all([loadProject(f.record.id), loadProject(f.record.id)]);
	expect(f.getBlob).toHaveBeenCalledTimes(2);
	expect(f.decode).toHaveBeenCalledTimes(2);
	expect(a.project.images.get(f.second)).toBe(b.project.images.get(f.second));
	const g = fixture(),
		blob = pending<Blob>(),
		controller = new AbortController();
	g.getBlob.mockClear(); // the same spies as f's
	g.decode.mockClear();
	g.getBlob.mockReturnValueOnce(blob.promise);
	const abandoned = loadProject(g.record.id, controller.signal),
		rejected = expect(abandoned).rejects.toMatchObject({ name: 'AbortError' });
	await vi.waitFor(() => expect(g.getBlob).toHaveBeenCalledOnce());
	const kept = loadProject(g.record.id);
	controller.abort();
	await rejected;
	blob.resolve(g.blob);
	expect([...(await kept).project.images.keys()]).toEqual([g.first, g.second]);
	expect(g.getBlob).toHaveBeenCalledTimes(2);
	expect(g.decode).toHaveBeenCalledTimes(2);
});

test('a load arriving as an abandoned cell read is dropped starts its own read', async () => {
	// Start the later load a few microtasks apart, so one lands between the dropped read's rejection and its cleanup.
	for (let ticks = 0; ticks < 12; ticks++) {
		const f = fixture(),
			blob = pending<Blob>(),
			controller = new AbortController();
		f.getBlob.mockClear(); // fixture() reuses one spy
		f.getBlob.mockReturnValueOnce(blob.promise);
		const abandoned = loadProject(f.record.id, controller.signal),
			rejected = expect(abandoned).rejects.toMatchObject({ name: 'AbortError' });
		await vi.waitFor(() => expect(f.getBlob).toHaveBeenCalledOnce());
		controller.abort();
		await rejected;
		blob.resolve(f.blob);
		const later = (async () => {
			for (let i = 0; i < ticks; i++) await Promise.resolve();
			return loadProject(f.record.id);
		})();
		expect([...(await later).project.images.keys()]).toEqual([f.first, f.second]);
	}
});

test('a character saved in an earlier format is rejected before any cell read', async () => {
	const f = fixture();
	(f.record.manifest as { format: string }).format = 'pixeldoll/2';
	await expect(loadProject(f.record.id)).rejects.toThrow(OUTDATED);
	expect(f.getBlob).not.toHaveBeenCalled();
});

test('records an earlier version saved are classified by kind; current records and other state are not', () => {
	const old = 'pixeldoll/2';
	const expected: [Record<string, unknown>, IncompatibleKind | undefined][] = [
		[{ id: 'rig-old', manifest: { format: old } }, 'characters'],
		[{ id: 'rig-new', manifest: { format: CURRENT_FORMAT } }, undefined],
		[{ id: 'equipment-design:old', kind: 'equipment-design', source: { format: old } }, 'retired'],
		[
			{ id: 'equipment-design:new', kind: 'equipment-design', source: { format: CURRENT_FORMAT } },
			'retired'
		],
		[{ id: 'equipment-fit:old', kind: 'equipment-fit-draft' }, 'retired'],
		[{ id: 'dress-fixture:s2', kind: 'dress' }, 'outfits'],
		[{ id: 'dress-fixture:new', kind: 'dress', format: CURRENT_FORMAT }, undefined],
		[{ id: 'studio-create', spec: { name: 'Old', size: 48 } }, 'creations'],
		[{ id: 'studio-create:rig-old', spec: { name: 'Old', size: 48 } }, 'creations'],
		[
			{ id: 'studio-create:rig-new', spec: { name: 'New', directions: [{ id: 'south' }] } },
			undefined
		],
		[{ id: 'studio-drafts', gens: [{ draft: { rigId: 'rig-old' } }] }, undefined],
		[{ id: 'm3-drafts', drafts: [{ rigId: 'rig-old' }] }, undefined]
	];
	for (const [record, kind] of expected)
		expect([record.id, incompatibleKind(record)]).toEqual([record.id, kind]);
	expect(incompatibleCounts(expected.map(([record]) => record))).toEqual({
		characters: 1,
		outfits: 1,
		creations: 2,
		retired: 3,
		total: 7
	});
	for (const value of [null, 'rig-old', { manifest: { format: old } }])
		expect(incompatibleKind(value)).toBeUndefined();
});

test('blob collection keeps the artwork an incompatible record mentions, however deeply', () => {
	const cell = 'a'.repeat(64),
		rest = 'b'.repeat(64);
	const refs = blobReferences([
		{
			id: 'rig-old',
			manifest: { format: 'pixeldoll/2', rig: { rest: { south: { image: `sha256:${rest}` } } } },
			items: [{ layers: [{ cells: { idle: { south: [cell, null] } } }] }]
		}
	]);
	expect([...refs].sort()).toEqual([cell, rest]);
});

describe('saved data from earlier versions', () => {
	const cell = 'c'.repeat(64),
		gone = 'd'.repeat(64);
	const character = {
		id: 'rig-old',
		origin: 'studio',
		savedAt: '2026-01-01',
		manifest: { format: 'pixeldoll/2', name: 'Old', items: [{ cells: [`sha256:${cell}`, gone] }] }
	};
	const creation = { id: 'studio-create:rig-x', spec: { name: 'X', size: 48, empty: '' } };
	const snapshot = (projects: [string, unknown][], blobs: [string, Blob][] = []) =>
		vi.spyOn(db, 'readWorkspaceSnapshot').mockImplementation(async (select, references) => {
			const kept = new Map(projects.filter(([key, value]) => select(key, value)));
			const wanted = references(kept);
			return {
				projects: kept,
				blobs: new Map(blobs.filter(([hash]) => wanted.has(hash))),
				retainedIds: []
			};
		});
	const build = () => {
		vi.stubGlobal('__APP_VERSION__', 'test');
		vi.stubGlobal('__APP_COMMIT__', 'abc');
	};

	test('pack only incompatible records and their artwork, and read them back exactly on opt-in', async () => {
		build();
		const bytes = new Uint8Array([137, 80, 78, 71, 0, 255]);
		snapshot(
			[
				['rig-old', character],
				['studio-create:rig-x', creation],
				['rig-new', { id: 'rig-new', manifest: { format: CURRENT_FORMAT } }],
				['studio-drafts', { id: 'studio-drafts', gens: [] }]
			],
			[
				[cell, new Blob([bytes], { type: 'image/png' })],
				['e'.repeat(64), new Blob([new Uint8Array([1])])]
			]
		);
		const packed = (await packIncompatible([]))!;
		expect(packed.counts).toMatchObject({ characters: 1, creations: 1, total: 2 });
		expect(packed.missing).toBe(1);
		await expect(unpackIncompatible(packed.bytes, {} as { userOptIn: true }, [])).rejects.toThrow(
			'only when the user chooses it'
		);
		const back = await unpackIncompatible(packed.bytes, { userOptIn: true }, []);
		expect([...back.records]).toEqual([
			['rig-old', character],
			['studio-create:rig-x', creation]
		]);
		expect([...back.blobs.keys()]).toEqual([cell]);
		expect(back.blobs.get(cell)!.type).toBe('image/png');
		expect(new Uint8Array(await back.blobs.get(cell)!.arrayBuffer())).toEqual(bytes);
		expect(back.missing).toEqual([gone]);
		expect(back.counts).toEqual(packed.counts);
	});

	test('nothing stored packs nothing', async () => {
		snapshot([['rig-new', { id: 'rig-new', manifest: { format: CURRENT_FORMAT } }]]);
		expect(await packIncompatible([])).toBeUndefined();
	});

	test('a value JSON cannot keep exactly, or a record off its kind keys, fails the whole pack', async () => {
		build();
		const unsupported = { translation: { key: 'incompatible.error.unsupported' } };
		const holes: unknown[] = [1];
		holes[2] = 3;
		const cyclic: Record<string, unknown> = { ...character };
		cyclic.self = cyclic;
		for (const value of [
			{ ...character, gone: undefined },
			{ ...character, when: new Date(0) },
			{ ...character, n: Number.NaN },
			{ ...character, z: -0 },
			{ ...character, holes },
			{ ...character, image: new Uint8Array(1) },
			{ ...character, id: 'studio-move' },
			cyclic
		]) {
			snapshot([[value.id as string, value]]);
			await expect(packIncompatible([])).rejects.toMatchObject(unsupported);
		}
	});

	test('a pack holding the PixelLab key is refused', async () => {
		build();
		const key = '9f8e7d6c-5b4a-4321-8fed-0fedcba98765';
		snapshot([['rig-old', { ...character, note: key }]]);
		await expect(packIncompatible([key])).rejects.toMatchObject({
			translation: { key: 'backup.error.containsKey' }
		});
	});

	test('a restore accepts only incompatible records under their own keys and the artwork they mention', async () => {
		const index = (records: [string, unknown][], blobs: [string, string][] = []) => ({
			name: 'incompatible.json',
			data: new TextEncoder().encode(
				JSON.stringify({
					format: 'pixeldoll-incompatible/1',
					build: 't',
					records,
					blobs,
					missing: []
				})
			)
		});
		const stray = 'f'.repeat(64);
		const live = { id: 'studio-move', spec: { name: 'walk' }, status: 'running' };
		for (const entries of [
			[index([['studio-move', live]])],
			[index([['studio-move', { ...character, id: 'studio-move' }]])],
			[index([['rig-other', character]])],
			[index([['rig-new', { id: 'rig-new', manifest: { format: CURRENT_FORMAT } }]])],
			[
				index([['rig-old', character]], [[stray, 'image/png']]),
				{ name: `blobs/${stray}`, data: new Uint8Array(1) }
			],
			[index([['rig-old', character]]), { name: 'jobs/1', data: new Uint8Array(1) }]
		])
			await expect(
				unpackIncompatible(await zip(entries), { userOptIn: true }, [])
			).rejects.toMatchObject({ translation: { key: 'incompatible.error.invalid' } });
	});
});
