import { afterEach, expect, test, vi } from 'vitest';
import { openSource } from '../../src/lib/dress/project.ts';
import {
	deleteOutdated,
	loadProject,
	OUTDATED,
	type StoredProject
} from '../../src/lib/store/project.ts';
import * as db from '../../src/lib/store/db.ts';
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
function fixture() {
	const first = `sha256:${'1'.repeat(64)}` as Sha256,
		second = `sha256:${'2'.repeat(64)}` as Sha256;
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

test('a fixture fetch receives the same cancellation signal and cannot continue after abort', async () => {
	const f = fixture(),
		controller = new AbortController();
	const fetch = vi.fn(
		(_url: string, options: RequestInit) =>
			new Promise<Response>((_resolve, reject) => {
				expect(options.signal).toBe(controller.signal);
				controller.signal.addEventListener('abort', () => reject(controller.signal.reason), {
					once: true
				});
			})
	);
	vi.stubGlobal('fetch', fetch);
	const loading = openSource('fixture:s2', controller.signal),
		rejected = expect(loading).rejects.toMatchObject({ name: 'AbortError' });
	expect(fetch).toHaveBeenCalledOnce();
	controller.abort();
	await rejected;
	expect(f.get).not.toHaveBeenCalled();
	expect(f.getBlob).not.toHaveBeenCalled();
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
	f.getBlob.mockRejectedValueOnce(new Error('Storage read failed'));
	await expect(loadProject(f.record.id)).rejects.toThrow('Storage read failed');
	f.decode.mockRejectedValueOnce(new Error('Malformed PNG'));
	await expect(loadProject(f.record.id)).rejects.toThrow('Malformed PNG');
});

test('a character saved in an earlier format is rejected before any cell read', async () => {
	const f = fixture();
	(f.record.manifest as { format: string }).format = 'pixeldoll/2';
	await expect(loadProject(f.record.id)).rejects.toThrow(OUTDATED);
	expect(f.getBlob).not.toHaveBeenCalled();
});

test('records in an earlier format are deleted, current records and other state stay', async () => {
	const old = 'pixeldoll/2',
		records = [
			{ id: 'rig-old', manifest: { format: old } },
			{ id: 'rig-new', manifest: { format: CURRENT_FORMAT } },
			{ id: 'equipment-design:old', kind: 'equipment-design', source: { format: old } },
			{ id: 'equipment-design:new', kind: 'equipment-design', source: { format: CURRENT_FORMAT } },
			{
				id: 'fit-old',
				kind: 'equipment-fit-draft',
				plan: { design: { source: { format: old } } }
			},
			{ id: 'dress-fixture:s2', kind: 'dress' },
			{ id: 'dress-fixture:new', kind: 'dress', format: CURRENT_FORMAT },
			{ id: 'studio-drafts', gens: [] }
		];
	vi.spyOn(db, 'all').mockResolvedValue(records);
	const del = vi.spyOn(db, 'del').mockResolvedValue(undefined);
	expect(await deleteOutdated()).toBe(4);
	expect(del.mock.calls.map(([, id]) => id)).toEqual([
		'rig-old',
		'equipment-design:old',
		'fit-old',
		'dress-fixture:s2'
	]);
});

test('an unfinished creation saved before direction plans is removed; a current one stays', async () => {
	vi.spyOn(db, 'all').mockResolvedValue([{ id: 'studio-create', spec: { name: 'Old', size: 48 } }]);
	const del = vi.spyOn(db, 'del').mockResolvedValue(undefined);
	expect(await deleteOutdated()).toBe(1);
	expect(del.mock.calls.map(([, id]) => id)).toEqual(['studio-create']);
	del.mockClear();
	vi.spyOn(db, 'all').mockResolvedValue([
		{ id: 'studio-create', spec: { name: 'New', size: 48, directions: [{ id: 'south' }] } }
	]);
	expect(await deleteOutdated()).toBe(0);
	expect(del).not.toHaveBeenCalled();
});

test('removing an outdated character also removes its drafts, as deleting it would', async () => {
	const drafts = {
		id: 'studio-drafts',
		gens: [{ draft: { rigId: 'rig-old' } }, { draft: { rigId: 'rig-current' } }]
	};
	const records = [
		{ id: 'rig-old', manifest: { format: 'pixeldoll/2' } },
		{ id: 'rig-current', manifest: { format: CURRENT_FORMAT } },
		drafts,
		{ id: 'm3-drafts', drafts: [{ rigId: 'rig-old' }] },
		{
			id: 'fit-done',
			kind: 'equipment-fit-draft',
			targetId: 'rig-old',
			stage: 'accepted',
			plan: { design: { source: { format: CURRENT_FORMAT } } }
		}
	];
	vi.spyOn(db, 'all').mockResolvedValue(records);
	const del = vi.spyOn(db, 'del').mockResolvedValue(undefined);
	const put = vi.spyOn(db, 'put').mockResolvedValue(undefined);
	expect(await deleteOutdated()).toBe(1);
	expect(del.mock.calls.map(([, id]) => id)).toEqual(['rig-old', 'fit-done']);
	expect(put.mock.calls).toEqual([
		['projects', 'studio-drafts', { ...drafts, gens: [drafts.gens[1]] }],
		['projects', 'm3-drafts', { id: 'm3-drafts', drafts: [] }]
	]);
});
