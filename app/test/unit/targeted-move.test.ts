import { afterEach, expect, test, vi } from 'vitest';
import { addMove, moveDirections, moveEstimate, reviewItemMove } from '../../src/studio/create.ts';
import { movePlan } from '../../src/studio/apiPlans.ts';
import { queue, type JobRec } from '../../src/lib/pixellab/queue.ts';
import * as db from '../../src/lib/store/db.ts';
import * as projects from '../../src/lib/store/project.ts';
import { makeImg } from '../../src/lib/image/png.ts';
import { encodePngBytes } from '../../src/lib/image/pngraw.ts';
import { LABELS } from '../../src/lib/rig/poses.ts';
import { cellHash, type Keypoint, type DirectionName } from '../../src/lib/rig/rig.ts';
import type { Manifest } from '../../src/lib/store/manifest.ts';
afterEach(() => vi.restoreAllMocks());
async function fixture(fail = false) {
	const dirs: DirectionName[] = ['south', 'east', 'north', 'west'],
		im = makeImg(64, 64);
	for (let y = 10; y < 60; y++)
		for (let x = 25; x < 39; x++) im.data.set([180, 140, 120, 255], (y * 64 + x) * 4);
	const hash = await cellHash(im),
		points: Keypoint[] = LABELS.map((label, i) => ({
			label,
			x: 0.3 + i * 0.01,
			y: 0.3 + i * 0.015
		}));
	const rig: Manifest['rig'] = {
		cell: { w: 64, h: 64 },
		pivot: { x: 32, y: 60 },
		baseHash: hash,
		baseItem: 'base',
		directions: dirs.map((id) => ({ id })),
		animations: [
			{
				id: 'idle',
				cells: 4,
				loop: true,
				frames: [0, 1, 2, 3].map((cell) => ({ cell, ms: 100 })),
				sources: Object.fromEntries(
					dirs.map((d) => [
						d,
						{
							route: 'skeleton-v3',
							reference: hash,
							keypoints: [points, points, points, points],
							measured: [points, points, points, points],
							motion: 'old',
							provenance: []
						}
					])
				)
			}
		],
		rest: Object.fromEntries(dirs.map((d) => [d, { image: hash, keypoints: points }])),
		anchors: {
			hand_r: {
				idle: Object.fromEntries(dirs.map((d) => [d, Array.from({ length: 4 }, () => [3, 4])]))
			}
		}
	};
	const cells = { idle: Object.fromEntries(dirs.map((d) => [d, [hash, hash, hash, hash]])) };
	const manifest: Manifest = {
		format: 'pixeldoll/1',
		name: 'Test',
		app: '',
		rig,
		slots: [],
		materials: [],
		presets: [],
		items: [
			{
				id: 'base',
				name: 'Body',
				slot: 'body',
				status: 'accepted',
				mirror: 'generate',
				prompt: 'body',
				materials: [],
				baseHash: hash,
				provenance: [],
				layers: [{ id: 'main', role: 'fg', z: 0, cells: structuredClone(cells) }]
			},
			{
				id: 'hat',
				name: 'Hat',
				slot: 'head',
				status: 'accepted',
				mirror: 'generate',
				prompt: 'hat',
				materials: [],
				baseHash: hash,
				provenance: [],
				layers: [{ id: 'main', role: 'fg', z: 10, cells: structuredClone(cells) }]
			}
		]
	};
	let saved: projects.StoredProject = {
		id: 'rig-target',
		savedAt: 'original',
		manifest,
		character: { id: 'managed', looks: 'body' },
		skeletons: Object.fromEntries(
			dirs.flatMap((d) =>
				[0, 1, 2, 3].map((i) => [`idle/${d}/${i}`, { NOSE: { x: 3, y: 4, z: 0 } }])
			)
		),
		rigQa: {
			warnings: ['idle/east: old failure', 'idle/south: retained'],
			clips: Object.fromEntries(
				dirs.map((d) => [
					`idle/${d}`,
					{ adherence: 1, feetDrift: 0, paletteFit: 1, border: 0, stray: 0, fails: [] }
				])
			)
		}
	};
	const original = structuredClone(saved),
		blobs = new Map<string, Blob>();
	let requested: Keypoint[][] = [];
	vi.spyOn(projects, 'loadProject').mockImplementation(async () => {
		const rec = structuredClone(saved);
		return { rec, project: { manifest: rec.manifest, images: new Map([[hash, im]]) } };
	});
	vi.spyOn(db, 'updateCharacter').mockImplementation(async (_id, _blobs, change) => {
		saved = change(structuredClone(saved)) as projects.StoredProject;
	});
	vi.spyOn(db, 'get').mockImplementation(async () => structuredClone(saved));
	vi.spyOn(db, 'getBlob').mockImplementation(async (h) => blobs.get(h));
	const put = vi.spyOn(db, 'put').mockResolvedValue(undefined),
		update = vi.spyOn(db, 'update').mockImplementation(async (_s, _id, change) => {
			saved = change(structuredClone(saved)) as projects.StoredProject;
		});
	const enqueue = vi.spyOn(queue, 'enqueue').mockImplementation(async (req) => {
		if (req.path === '/animate-with-skeleton-v3') {
			requested = (req.body as { keypoints: Keypoint[][] }).keypoints;
			const outputs = await Promise.all(
				requested.map(async (_, i) => {
					const image = structuredClone(im);
					image.data[(10 * 64 + 25) * 4] = 180 + i;
					const sha = 'frame-' + i;
					blobs.set(
						sha,
						new Blob([(await encodePngBytes(image)) as Uint8Array<ArrayBuffer>], {
							type: 'image/png'
						})
					);
					return { label: String(i), sha };
				})
			);
			return {
				id: 'raw',
				state: 'done',
				endpoint: req.path,
				params: req.body,
				requestHash: 'raw',
				createdAt: 0,
				gens: 3,
				usd: 0,
				jobs: [{ id: 'job', results: outputs }]
			} as unknown as JobRec;
		}
		if (req.path === '/estimate-skeleton')
			return {
				state: 'done',
				response: {
					keypoints: requested[0].map((p) => ({
						...p,
						x: p.x + (fail && p.label.includes('ARM') ? 0.3 : 0)
					}))
				},
				jobs: []
			} as unknown as JobRec;
		throw Error('Unexpected route');
	});
	return {
		saved: () => saved,
		original,
		enqueue,
		put,
		update,
		run: (change: Record<string, unknown> = {}) =>
			addMove('rig-target', {
				id: 'idle',
				action: 'idle',
				frames: 4,
				items: [],
				seed: 23,
				replace: true,
				poseStyle: 'visible-side-v1',
				dirs: ['east'],
				...change
			})
	};
}
test('targeted replacement preserves every unselected body/item/pose row and clears only stale target diagnostics', async () => {
	const f = await fixture();
	await f.run();
	const next = f.saved(),
		before = f.original;
	expect(f.enqueue.mock.calls.filter(([r]) => r.path === '/animate-with-skeleton-v3')).toHaveLength(
		1
	);
	expect((f.enqueue.mock.calls[0][0].body as { direction: string; action: string }).direction).toBe(
		'east'
	);
	expect((f.enqueue.mock.calls[0][0].body as { action: string }).action).toContain('no weapon');
	for (const d of ['south', 'north', 'west'] as const) {
		expect(next.manifest.items[0].layers[0].cells!.idle![d]).toEqual(
			before.manifest.items[0].layers[0].cells!.idle![d]
		);
		expect(next.manifest.items[1].layers[0].cells!.idle![d]).toEqual(
			before.manifest.items[1].layers[0].cells!.idle![d]
		);
		expect(next.manifest.rig.animations[0].sources![d]).toEqual(
			before.manifest.rig.animations[0].sources![d]
		);
		expect(next.manifest.rig.anchors!.hand_r!.idle![d]).toEqual(
			before.manifest.rig.anchors!.hand_r!.idle![d]
		);
		expect(next.skeletons![`idle/${d}/0`]).toEqual(before.skeletons![`idle/${d}/0`]);
	}
	expect(next.manifest.items[1].layers[0].cells!.idle!.east).toBeUndefined();
	expect((next.rigQa as { warnings: string[] }).warnings).toEqual(['idle/south: retained']);
});

test('regeneration keeps explicit play-once preferences, including choices changed during frame publication', async () => {
	const f = await fixture();
	f.saved().manifest.rig.animations[0].loop = false;
	await f.run();
	expect(f.saved().manifest.rig.animations[0].loop).toBe(false);
	vi.restoreAllMocks();
	const g = await fixture(),
		m = g.saved().manifest;
	m.rig.animations.push({ ...structuredClone(m.rig.animations[0]), id: 'cast' });
	for (const item of m.items)
		item.layers[0].cells!.cast = structuredClone(item.layers[0].cells!.idle);
	g.put.mockImplementation(async (store) => {
		if (store === 'blobs')
			for (const animation of g.saved().manifest.rig.animations) animation.loop = false;
	});
	await g.run();
	expect(g.saved().manifest.rig.animations.map((a) => [a.id, a.loop])).toEqual([
		['idle', false],
		['cast', false]
	]);
});
test('failed genuine measurements cannot publish a targeted replacement or invalidate prior equipment', async () => {
	const f = await fixture(true);
	await expect(f.run()).rejects.toThrow('still fails body-pose');
	expect(f.put).not.toHaveBeenCalled();
	expect(f.update).not.toHaveBeenCalled();
	expect(f.saved()).toEqual(f.original);
});
test('invalid subset, new partial move and changed partial frame count are rejected before spending', async () => {
	for (const change of [
		{ dirs: [] },
		{ dirs: ['east', 'east'] },
		{ dirs: ['bad'] },
		{ id: 'cast', dirs: ['east'] },
		{ action: 'slash' }
	]) {
		const f = await fixture();
		await expect(f.run(change)).rejects.toThrow();
		expect(f.enqueue).not.toHaveBeenCalled();
		vi.restoreAllMocks();
	}
});
test('selected direction costs distinguish body replacement from frozen-frame equipment repair', async () => {
	const f = await fixture(),
		m = f.original.manifest;
	expect(moveDirections(m, ['west', 'east'])).toEqual(['east', 'west']);
	expect(
		moveEstimate(m, {
			id: 'idle',
			action: 'idle',
			frames: 4,
			items: ['hat'],
			dirs: ['east', 'west']
		}).gens
	).toBeCloseTo(12.8);
	expect(
		moveEstimate(m, {
			id: 'idle',
			action: 'idle',
			frames: 4,
			items: ['hat'],
			dirs: ['west'],
			itemMethod: 'grid'
		})
	).toMatchObject({ body: 0, items: 10, gens: 10 });
});

test('unrecognized move names and incompatible described frame counts fail before PixelLab', async () => {
	const f = await fixture();
	await expect(f.run({ action: 'quiet-step' })).rejects.toThrow(
		'Describe this move before generating it'
	);
	await expect(
		f.run({
			id: 'new-motion',
			action: undefined,
			text: 'A quick step',
			frames: 16,
			dirs: undefined,
			replace: false
		})
	).rejects.toThrow('This move has 16');
	expect(f.enqueue).not.toHaveBeenCalled();
	expect(
		movePlan(f.original, {
			id: 'idle',
			action: 'quiet-step',
			frames: 4,
			items: [],
			dirs: ['east'],
			replace: true
		})
	).toEqual([]);
});

test('a valid custom description includes motion costs and wrong provider cardinality stops before joint checks', async () => {
	const f = await fixture(),
		spec = {
			id: 'idle',
			action: 'quiet-step',
			text: ' Step softly ',
			frames: 4,
			items: [],
			dirs: ['east' as const],
			replace: true
		};
	const plan = movePlan(f.original, spec);
	expect(plan.reduce((sum, call) => sum + (call.generations ?? 0), 0)).toBeCloseTo(
		moveEstimate(f.original.manifest, spec).gens
	);
	f.enqueue.mockResolvedValueOnce({ state: 'done', jobs: [{ results: [] }] } as unknown as JobRec);
	await expect(f.run(spec)).rejects.toThrow('PixelLab returned 0 motion frames for 4 requested');
	expect(f.enqueue).toHaveBeenCalledOnce();
	expect(f.enqueue.mock.calls[0][0]).toMatchObject({
		path: '/characters/animations',
		body: {
			mode: 'pixminimax',
			action_description: 'Step softly, unarmed, no weapon, no props, no other people, no effects',
			frame_count: 4
		}
	});
	expect(f.put).not.toHaveBeenCalled();
});

test('an extra motion frame is accepted only when it is the unstripped standing view', async () => {
	const motionWith = async (first: 'standing' | 'other') => {
		const f = await fixture(),
			standing = (await projects.loadProject('rig-target')).project.images.values().next().value!,
			frame = (shade: number) => {
				const im = structuredClone(standing);
				im.data[(30 * 64 + 30) * 4] = shade; // inside the body: a distinct motion frame
				return im;
			},
			images = [
				first === 'standing' ? standing : frame(7),
				frame(11),
				frame(12),
				frame(13),
				frame(14)
			],
			blobs = new Map<string, Blob>();
		for (const [i, im] of images.entries())
			blobs.set(`m${i}`, new Blob([(await encodePngBytes(im)) as Uint8Array<ArrayBuffer>]));
		vi.spyOn(db, 'getBlob').mockImplementation(async (h) => blobs.get(h));
		const results = images.map((_, i) => ({ label: `east/${i}`, sha: `m${i}` }));
		const joints = LABELS.map((label, i) => ({ label, x: 0.3 + i * 0.01, y: 0.3 + i * 0.015 }));
		f.enqueue.mockResolvedValueOnce({ state: 'done', jobs: [{ results }] } as unknown as JobRec);
		// one joint answer per expected motion frame; a fifth check would fall through to the fixture and fail
		for (let i = 0; i < 4; i++)
			f.enqueue.mockResolvedValueOnce({
				state: 'done',
				response: { keypoints: joints },
				jobs: []
			} as unknown as JobRec);
		const before = f.enqueue.mock.calls.length;
		const error = await f
			.run({ text: 'step softly', action: 'quiet-step', frames: 4 })
			.catch((e: Error) => e);
		return {
			error,
			measured: f.enqueue.mock.calls.slice(before).filter(([r]) => r.path === '/estimate-skeleton')
				.length
		};
	};
	// 5 for 4 with the standing view first: that frame is dropped and exactly the 4 motion frames are measured
	const kept = await motionWith('standing');
	expect(String(kept.error)).not.toContain('motion frames for');
	expect(kept.measured).toBe(4);
	// any other extra frame still fails before joint checks
	const odd = await motionWith('other');
	expect(String(odd.error)).toContain('PixelLab returned 5 motion frames for 4 requested');
	expect(odd.measured).toBe(0);
});

test('item review binds artwork and cost while unrelated queued clips and playback choices can change', async () => {
	const f = await fixture(),
		m = f.original.manifest;
	const spec = {
		id: 'idle',
		frames: 4,
		items: ['hat'],
		dirs: ['south' as const],
		itemsOnly: true as const,
		itemMethod: 'grid' as const,
		seed: 1
	};
	const reviewed = reviewItemMove(m, spec).itemReview!;
	expect(reviewed.gens).toBe(10);
	const item = m.items[1];
	item.layers[0].cells!.walk = { south: ['sha256:new'] };
	item.provenance.push({
		endpoint: 'synthetic',
		params: {},
		seed: 1,
		requestHash: 'sha256:test',
		createdAt: '',
		produced: ['walk/south/0']
	});
	m.rig.animations[0].loop = false;
	expect(reviewItemMove(m, spec).itemReview).toEqual(reviewed);
	item.materials = ['display-only-dye'];
	item.hides = ['back'];
	expect(reviewItemMove(m, spec).itemReview).toEqual(reviewed);
	item.layers[0].cells!.idle!.south![0] = 'sha256:changed';
	expect(reviewItemMove(m, spec).itemReview!.artwork).not.toBe(reviewed.artwork);
	// a larger canvas re-prices the review (96 px now packs 4 frames + 1 reference into a 10-gen 288x192 grid, so use 128 px)
	item.layers[0].cell = { w: 128, h: 128 };
	expect(reviewItemMove(m, spec).itemReview!.gens).toBe(15);
});

test('missing-item pricing skips coverage already present for each item', async () => {
	const f = await fixture(),
		m = f.original.manifest;
	const item = m.items[1];
	delete item.layers[0].cells!.idle!.south;
	expect(
		moveEstimate(m, {
			id: 'idle',
			frames: 4,
			items: ['hat'],
			dirs: ['south', 'east'],
			itemsOnly: true
		}).items
	).toBe(3);
});

async function reviewedItemFixture() {
	const f = await fixture(),
		m = f.saved().manifest,
		item = m.items[1];
	m.items[0].regions = 'shirt-shorts';
	item.key = 'green';
	item.route = 'skeleton-pose';
	item.dressed = { south: m.rig.rest!.south!.image };
	delete item.layers[0].cells!.idle!.south;
	const bytes = await encodePngBytes(makeImg(64, 64));
	vi.mocked(db.getBlob).mockResolvedValue(
		new Blob([bytes as Uint8Array<ArrayBuffer>], { type: 'image/png' })
	);
	const spec = reviewItemMove(m, {
		id: 'idle',
		frames: 4,
		items: ['hat'],
		dirs: ['south'],
		itemsOnly: true,
		seed: 1
	});
	return { ...f, spec };
}

test.each(['initial load', 'post-normalization reload'] as const)(
	'reviewed item rejects changed artwork at %s before paid work',
	async (boundary) => {
		const f = await reviewedItemFixture(),
			reviewed = structuredClone(f.spec.itemReview),
			consumed = vi.fn(async () => {});
		if (boundary === 'initial load') f.saved().manifest.items[1].prompt = 'Replacement hat';
		else {
			const load = vi.mocked(projects.loadProject).getMockImplementation()!;
			let reads = 0;
			vi.mocked(projects.loadProject).mockImplementation(async (id) => {
				const ctx = await load(id);
				if (++reads === 2) f.saved().manifest.items[1].prompt = 'Replacement hat';
				return ctx;
			});
		}
		await expect(addMove('rig-target', f.spec, undefined, consumed)).rejects.toThrow(
			'review its current estimate'
		);
		expect(f.enqueue).not.toHaveBeenCalled();
		expect(consumed).not.toHaveBeenCalled();
		expect(f.spec.itemReview).toEqual(reviewed);
	}
);

test('reviewed item waits for durable consumption before preparing exactly one paid request', async () => {
	const f = await reviewedItemFixture();
	let release!: () => void;
	const stored = new Promise<void>((resolve) => {
		release = resolve;
	});
	const consumed = vi.fn(async () => {
		expect(f.spec).not.toHaveProperty('itemReview');
		await stored;
	});
	f.enqueue.mockRejectedValue(new Error('Synthetic request boundary reached'));
	const run = addMove('rig-target', f.spec, undefined, consumed);
	const stopped = expect(run).rejects.toThrow('Synthetic request boundary reached');
	await vi.waitFor(() => expect(consumed).toHaveBeenCalledOnce());
	expect(f.enqueue).not.toHaveBeenCalled();
	release();
	await stopped;
	expect(f.enqueue).toHaveBeenCalledOnce();
	expect(f.enqueue.mock.calls[0][0].path).toBe('/animate-with-skeleton-v3');
	expect(f.spec).not.toHaveProperty('itemReview');
});

test('failed durable review consumption sends no paid request', async () => {
	const f = await reviewedItemFixture(),
		reviewed = structuredClone(f.spec.itemReview);
	const consumed = vi.fn(async () => {
		throw new Error('Review receipt storage failed');
	});
	await expect(addMove('rig-target', f.spec, undefined, consumed)).rejects.toThrow(
		'Review receipt storage failed'
	);
	expect(consumed).toHaveBeenCalledOnce();
	expect(f.enqueue).not.toHaveBeenCalled();
	expect(f.spec.itemReview).toEqual(reviewed);
});

test('artwork replaced during durable consumption cannot enter the subsequent request context', async () => {
	const f = await reviewedItemFixture();
	const consumed = vi.fn(async () => {
		f.saved().manifest.items[1].prompt = 'Replacement after review persistence';
	});
	await expect(addMove('rig-target', f.spec, undefined, consumed)).rejects.toThrow(
		'changed before generation'
	);
	expect(consumed).toHaveBeenCalledOnce();
	expect(f.enqueue).not.toHaveBeenCalled();
});
