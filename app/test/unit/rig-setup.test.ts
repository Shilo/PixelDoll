import { expect, test } from 'vitest';
import { makeImg } from '../../src/lib/image/png.ts';
import { encodePngBytes } from '../../src/lib/image/pngraw.ts';
import { readCharacterZip } from '../../src/lib/store/import.ts';
import { zip } from '../../src/lib/store/zip.ts';
import { attachImportedRig, rigReady, setupPlan } from '../../src/lib/rig/setup.ts';
import {
	LABELS,
	ACTIONS,
	AUTHORED,
	authoredPoses,
	fromApi,
	hasAll
} from '../../src/lib/rig/poses.ts';
import { DIRECTIONS, cellHash, type Keypoint } from '../../src/lib/rig/rig.ts';
import { flipSkeleton } from '../../src/lib/rig/skeleton.ts';
import { paddedPoses, poseBatches, rawClip } from '../../src/lib/rig/clips.ts';
import { itemRoute, padOf, planItem } from '../../src/lib/items/items.ts';
import { baseCell, defaultMethod } from '../../src/lib/items/run.ts';
import { coverage } from '../../src/studio/itemRoute.ts';
import { Queue, type JobRec } from '../../src/lib/pixellab/queue.ts';
import { posable } from '../../src/lib/items/run.ts';

const pose = (dx = 0): Keypoint[] =>
	LABELS.map((label, i) => ({
		label,
		x: (25 + dx + (i % 4)) / 64,
		y: (12 + Math.floor(i / 4) * 8) / 64
	}));
async function source() {
	const im = makeImg(64, 64);
	for (let y = 10; y < 60; y++)
		for (let x = 25; x < 38; x++) im.data.set([180, 100, 90, 255], (y * 64 + x) * 4);
	const png = await encodePngBytes(im);
	return (
		await readCharacterZip(
			await zip([
				{
					name: 'metadata.json',
					data: new TextEncoder().encode(
						JSON.stringify({
							name: 'Red-haired hero',
							prompt: 'red hair, blue coat and boots',
							view: 'side'
						})
					)
				},
				...['south', 'east', 'north', 'west'].map((dir) => ({
					name: `rotations/${dir}.png`,
					data: png
				})),
				...Array.from({ length: 16 }, (_, i) => ({
					name: `animations/walk/south/frame_${i}.png`,
					data: png
				})),
				...Array.from({ length: 2 }, (_, i) => ({
					name: `animations/blink/south/frame_${i}.png`,
					data: png
				}))
			])
		)
	).project;
}

test('standing items bought before setup reuse their dressed references only for the exact registered standing body', async () => {
	const project = await source(),
		m = project.manifest,
		base = m.items[0],
		plan = await setupPlan(project);
	const dressed = Object.fromEntries(
		m.rig.directions.map((d) => [d.id, base.layers[0].cells!.default![d.id]![0]!])
	);
	const item = {
		...structuredClone(base),
		id: 'bought-hat',
		slot: 'head',
		route: 'ea2-anchor' as const,
		key: 'green' as const,
		standing: 'default',
		dressed
	};
	m.items.push(item);
	const result = await attachImportedRig(
		project,
		plan,
		new Map([...plan.frames].map(([h]) => [h, pose()])),
		[]
	);
	expect(result.manifest.items[1].route).toBe('skeleton-pose');
	expect(result.manifest.items[1].dressed).toEqual(dressed);
	expect(posable(result.manifest).map((i) => i.id)).toEqual(['bought-hat']);
	expect(item.route).toBe('ea2-anchor'); // the source is immutable
	item.standing = 'walk'; // an animated clip is never promoted, even if its first frame happens to match
	const wrong = await attachImportedRig(
		project,
		plan,
		new Map([...plan.frames].map(([h]) => [h, pose()])),
		[]
	);
	expect(wrong.manifest.items[1].route).toBe('ea2-anchor');
	item.standing = 'default';
	item.dressed = { south: dressed.south };
	const incomplete = await attachImportedRig(
		project,
		plan,
		new Map([...plan.frames].map(([h]) => [h, pose()])),
		[]
	);
	expect(incomplete.manifest.items[1].route).toBe('ea2-anchor');
});

test('setup attaches measured poses, anchors, independent QA and provenance without repainting pixels', async () => {
	const project = await source(),
		original = structuredClone(project.manifest);
	const plan = await setupPlan(project);
	expect(plan.frames.size).toBe(1); // identical images reuse a cached estimate
	expect(plan.gens).toBe(0.35);
	const measurements = new Map([...plan.frames].map(([h]) => [h, pose()]));
	const result = await attachImportedRig(project, plan, measurements, []);
	expect(project.manifest).toEqual(original);
	expect(result.manifest.rig.baseHash).toBe(original.rig.baseHash);
	expect(result.manifest.items[0].layers).toEqual(original.items[0].layers);
	expect(result.manifest.rig.view).toBe('side');
	expect(result.manifest.rig.directions.every((d) => !d.mirrorOf)).toBe(true);
	expect(result.manifest.rig.rest?.west?.keypoints).toEqual(pose());
	const qa = result.rigQa as { clips: Record<string, { adherence: number | null }> };
	expect(qa.clips['walk/south'].adherence).toBeNull(); // never self-score an estimated original as perfectly followed
	expect(result.skeletons['walk/south/15']).toBeDefined();
	expect(result.manifest.rig.anchors?.neck?.walk?.south).toHaveLength(16);
	expect(result.manifest.rig.anchors?.neck?.walk?.west).toBeUndefined(); // preserve sparse coverage
	const rec = {
		id: 'rig-fixture',
		savedAt: '',
		origin: 'studio' as const,
		manifest: result.manifest,
		character: { id: 'managed-fixture', looks: 'red hair, blue coat and boots' }
	};
	expect(rigReady(rec)).toBe(true);
	const ctx = { rec, project: { manifest: result.manifest, images: result.images } },
		selected = coverage(ctx);
	expect(defaultMethod(ctx, selected)).toBe('skel');
	expect(padOf('main_hand', defaultMethod(ctx, selected))).toBe(16);
	const calls = planItem(result.manifest.rig, {
		...selected,
		method: 'skel',
		slot: 'main_hand',
		key: 'green'
	});
	expect(calls.filter((c) => c.kind === 'pose').every((c) => c.cells.length <= 15)).toBe(true);
	expect(calls.filter((c) => c.kind === 'pose').flatMap((c) => c.cells)).toHaveLength(18);
	expect(calls.some((c) => c.kind === 'pose' && c.cells.some((k) => k.startsWith('rest/')))).toBe(
		false
	);
	expect(baseCell(ctx, 'walk/south/15')).toEqual(
		project.images.get(await cellHash([...plan.frames.values()][0]))
	);
});

test('setup refuses missing or invalid measurements and rejects unsupported input before spending', async () => {
	const p = await source(),
		plan = await setupPlan(p);
	await expect(attachImportedRig(p, plan, new Map(), [])).rejects.toThrow('valid joints');
	const bad = pose();
	bad[0].x = NaN;
	expect(hasAll(bad)).toBe(false);
	p.manifest.rig.template = 'cat';
	await expect(setupPlan(p)).rejects.toThrow('humanoid');
	p.manifest.rig.template = 'mannequin';
	p.manifest.rig.directions.pop();
	await expect(setupPlan(p)).rejects.toThrow('cardinal views');
});

test('skeleton batches cover every original frame once and obey PixelLab limits', () => {
	for (const n of [1, 2, 3, 15, 16, 29, 31, 120]) {
		const batches = poseBatches(n);
		expect(batches.flatMap((b) => Array.from({ length: b.count }, (_, i) => b.start + i))).toEqual(
			Array.from({ length: n }, (_, i) => i)
		);
		for (const b of batches)
			expect(
				paddedPoses(Array.from({ length: b.count }, () => pose())).length
			).toBeGreaterThanOrEqual(3);
		expect(batches.every((b) => b.count <= 15)).toBe(true);
	}
	const request = itemRoute.pose({
		keyframePngB64: 'fixture',
		rest: pose(),
		poses: [pose(), pose(1)],
		item: 'sword',
		slot: 'main_hand',
		key: 'green',
		anim: 'blink',
		dir: 'west',
		seed: 1,
		cell: { w: 64, h: 64 },
		pad: 16,
		view: 'side'
	}).body as { view: string; keypoints: Keypoint[][] };
	expect(request.view).toBe('side');
	expect(request.keypoints).toHaveLength(3);
	expect(
		(
			rawClip({
				first: 'fixture',
				rest: pose(),
				keypoints: [pose(), pose(), pose()],
				description: 'existing coat',
				action: 'idle',
				dir: 'west',
				seed: 1,
				view: 'high top-down'
			}).body as { view: string }
		).view
	).toBe('high top-down');
});

test('independent western authored moves use reflected math on their own rest skeleton', () => {
	const west = fromApi(pose(3), { w: 64, h: 64 });
	const expected = ACTIONS.slash(flipSkeleton(west, 64), 'east').map((p) => flipSkeleton(p, 64));
	expect(authoredPoses('slash', west, 'west')).toEqual(expected);
	expect(authoredPoses('slash', west, 'west')).not.toEqual(ACTIONS.slash(west, 'south'));
});

test('authored actions are invariant to frame padding in every direction', () => {
	const rest = fromApi(pose(), { w: 64, h: 64 });
	const padded = Object.fromEntries(
		Object.entries(rest).map(([label, k]) => [label, { ...k, x: k.x + 48, y: k.y + 48 }])
	);
	for (const action of Object.keys(ACTIONS))
		for (const dir of DIRECTIONS) {
			const a = authoredPoses(action, rest, dir),
				b = authoredPoses(action, padded, dir, 160);
			for (let i = 0; i < a.length; i++)
				for (const label of LABELS) {
					expect(b[i][label].x - a[i][label].x).toBeCloseTo(48);
					expect(b[i][label].y - a[i][label].y).toBeCloseTo(48);
				}
		}
});

const rideRest = () => {
	const rest = fromApi(pose(), { w: 64, h: 64 });
	for (const [side, x] of [
		['RIGHT', 26],
		['LEFT', 38]
	] as const) {
		rest[`${side} HIP`] = { x, y: 34, z: 0 };
		rest[`${side} KNEE`] = { x, y: 46, z: 0 };
		rest[`${side} LEG`] = { x, y: 58, z: 0 };
	}
	return rest;
};
const length = (a: { x: number; y: number }, b: { x: number; y: number }) =>
	Math.hypot(a.x - b.x, a.y - b.y);
const bend = (
	h: { x: number; y: number },
	k: { x: number; y: number },
	a: { x: number; y: number }
) =>
	(Math.acos(
		((h.x - k.x) * (a.x - k.x) + (h.y - k.y) * (a.y - k.y)) / (length(h, k) * length(k, a))
	) *
		180) /
	Math.PI;

test('ride is three equal seated frames with bent knees, stable hips and feet, and finite joints', () => {
	const rest = rideRest(),
		frames = authoredPoses('ride', rest, 'south', 64);
	expect(AUTHORED).toContain('ride');
	expect(frames).toHaveLength(3);
	for (const f of frames)
		for (const label of LABELS)
			expect(Number.isFinite(f[label].x) && Number.isFinite(f[label].y)).toBe(true);
	for (const f of frames.slice(1)) expect(f).toEqual(frames[0]);
	for (const side of ['RIGHT', 'LEFT'] as const) {
		expect(frames[0][`${side} HIP`]).toEqual(rest[`${side} HIP`]);
		for (const joint of ['KNEE', 'LEG'] as const)
			expect(frames[0][`${side} ${joint}`]).not.toEqual(rest[`${side} ${joint}`]);
		expect(length(frames[0][`${side} HIP`], frames[0][`${side} KNEE`])).toBeCloseTo(
			length(rest[`${side} HIP`], rest[`${side} KNEE`])
		);
		expect(length(frames[0][`${side} KNEE`], frames[0][`${side} LEG`])).toBeCloseTo(
			length(rest[`${side} KNEE`], rest[`${side} LEG`])
		);
		const knee = bend(
			frames[0][`${side} HIP`],
			frames[0][`${side} KNEE`],
			frames[0][`${side} LEG`]
		);
		expect(knee).toBeGreaterThan(30);
		expect(knee).toBeLessThan(140);
	}
	expect(frames[0]['RIGHT KNEE'].x).toBeLessThan(frames[0]['RIGHT HIP'].x);
	expect(frames[0]['LEFT KNEE'].x).toBeGreaterThan(frames[0]['LEFT HIP'].x);
	expect(frames[0]['RIGHT LEG'].y).toBeCloseTo(frames[0]['LEFT LEG'].y);
});

test('ride keeps its proportions when scaled and mirrors east to west and south to north', () => {
	const rest = rideRest(),
		scaled = Object.fromEntries(
			Object.entries(rest).map(([label, k]) => [label, { ...k, x: k.x * 2, y: k.y * 2 }])
		),
		south = authoredPoses('ride', rest, 'south', 64),
		large = authoredPoses('ride', scaled, 'south', 128);
	for (let i = 0; i < south.length; i++)
		for (const label of LABELS) {
			expect(large[i][label].x).toBeCloseTo(south[i][label].x * 2);
			expect(large[i][label].y).toBeCloseTo(south[i][label].y * 2);
		}
	for (const dir of DIRECTIONS)
		for (const f of authoredPoses('ride', rest, dir, 64))
			for (const side of ['RIGHT', 'LEFT'] as const) {
				const knee = bend(f[`${side} HIP`], f[`${side} KNEE`], f[`${side} LEG`]);
				expect(knee).toBeGreaterThan(30);
				expect(knee).toBeLessThan(140);
			}
	expect(authoredPoses('ride', rest, 'west', 64)).toEqual(
		ACTIONS.ride(flipSkeleton(rest, 64), 'east').map((p) => flipSkeleton(p, 64))
	);
	const north = authoredPoses('ride', rest, 'north', 64);
	for (const side of ['RIGHT', 'LEFT'] as const)
		for (const joint of ['KNEE', 'LEG'] as const) {
			expect(north[0][`${side} ${joint}`].x - north[0][`${side} HIP`].x).toBeCloseTo(
				-(south[0][`${side} ${joint}`].x - south[0][`${side} HIP`].x)
			);
			expect(north[0][`${side} ${joint}`].y - north[0][`${side} HIP`].y).toBeCloseTo(
				south[0][`${side} ${joint}`].y - south[0][`${side} HIP`].y
			);
		}
	expect(authoredPoses('ride', rest, 'east', 64)[0]['RIGHT KNEE']).not.toEqual(
		south[0]['RIGHT KNEE']
	);
});

test('death keeps each leg length when the large body falls and kneels at its own floor', () => {
	const rest = fromApi(pose(), { w: 64, h: 64 });
	for (const side of ['RIGHT', 'LEFT']) {
		rest[`${side} HIP`] = { x: 80, y: 95, z: 0 };
		rest[`${side} KNEE`] = { x: 80, y: 120, z: 0 };
		rest[`${side} LEG`] = { x: 80, y: 148, z: 0 };
	}
	const frames = authoredPoses('death', rest, 'south', 160);
	expect(frames[2]['RIGHT KNEE'].y).toBeCloseTo(122.8);
	expect(frames[2]['RIGHT LEG'].y).toBe(148);
	for (const p of frames.slice(5))
		for (const side of ['RIGHT', 'LEFT']) {
			const h = p[`${side} HIP`],
				k = p[`${side} KNEE`],
				a = p[`${side} LEG`];
			expect(Math.hypot(k.x - h.x, k.y - h.y)).toBeCloseTo(25);
			expect(Math.hypot(a.x - k.x, a.y - k.y)).toBeCloseTo(28);
		}
});

test('custom directions reconnect with retained originals at 160px without inventing missing views', async () => {
	const p = await source(),
		im = makeImg(160, 160);
	for (let y = 40; y < 148; y++)
		for (let x = 70; x < 90; x++) im.data.set([180, 100, 90, 255], (y * 160 + x) * 4);
	const hash = await cellHash(im);
	p.images.set(hash, im);
	const rig = p.manifest.rig;
	rig.cell = { w: 160, h: 160 };
	rig.directions = [{ id: 'east', mirrorOf: 'west' }, { id: 'west' }];
	rig.animations = [{ id: 'rest', cells: 1, loop: true, frames: [{ cell: 0, ms: 100 }] }];
	rig.rest = Object.fromEntries(DIRECTIONS.map((d) => [d, { image: hash, keypoints: [] }]));
	p.manifest.items[0].layers[0].cells = { rest: { east: [hash], west: [hash] } };
	const plan = await setupPlan(p);
	expect(plan.registrationDirections).toBe(8);
	expect(plan.frames.size).toBe(1);
	const result = await attachImportedRig(p, plan, new Map([[hash, pose()]]), []);
	expect(Object.keys(result.manifest.rig.rest!)).toHaveLength(8);
	expect(result.manifest.rig.rest?.south?.image).toBe(hash);
	expect(result.skeletons['rest/east/0']).toEqual(
		flipSkeleton(result.skeletons['rest/west/0'], 160)
	);
	delete rig.rest.south;
	await expect(setupPlan(p)).rejects.toThrow('cardinal views');
});

test('repair keeps saved reference pixels and declares them fixed for compatible equipment', async () => {
	const p = await source(),
		plan = await setupPlan(p);
	const changed = structuredClone(plan.rest.south!);
	changed.data[1000] = 99;
	const h = await cellHash(changed);
	p.images.set(h, changed);
	p.manifest.rig.rest = Object.fromEntries(
		p.manifest.rig.directions.map((d) => [d.id, { image: h, keypoints: pose() }])
	);
	const repair = await setupPlan(p, 'blink');
	expect(repair.fixedRest).toBe(true);
	expect(repair.rest.south).toEqual(changed);
});

test('reload-safe setup never replaces a lost or failed paid request', async () => {
	const records = new Map<string, JobRec>();
	let sent = 0;
	const deps = {
		put: async (id: string, r: JobRec) => {
			records.set(id, structuredClone(r));
		},
		all: async () => [...records.values()].map((r) => structuredClone(r)),
		api: async <T>() => {
			sent++;
			return {} as T;
		}
	};
	for (const state of ['lost', 'failed', 'canceled'] as const) {
		const q = new Queue(deps),
			req = { method: 'POST' as const, path: '/estimate-skeleton', body: { fixture: state } };
		const prior = await q.enqueue(req);
		prior.state = state;
		await deps.put(prior.id, prior);
		const reload = new Queue(deps);
		await reload.load();
		reload.key = 'test-only';
		expect((await reload.enqueue(req, { cache: true, resumeSafe: true })).id).toBe(prior.id);
		await reload.tick();
		expect(sent).toBe(0);
	}
});
