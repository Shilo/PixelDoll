import { afterEach, expect, test, vi } from 'vitest';
import { createCharacter, estimate } from '../../src/studio/create.ts';
import { queue, type JobRec } from '../../src/lib/pixellab/queue.ts';
import * as db from '../../src/lib/store/db.ts';
import { DIRECTIONS, type DirectionName, type Rig } from '../../src/lib/rig/rig.ts';
import { authoredPoses, fromApi, hasAll, LABELS, toApi } from '../../src/lib/rig/poses.ts';
import { buildItem, planGens, planItem } from '../../src/lib/items/items.ts';
import type { Skeleton } from '../../src/lib/rig/skeleton.ts';
import fixture from '../fixtures/helmet-occlusion.json';

afterEach(() => vi.restoreAllMocks());
const options = { name: 'Fixture', description: 'fixture body', size: 48, seed: 741257 };
const plain = (n: 4 | 8) =>
	(n === 8 ? DIRECTIONS : (['south', 'east', 'north', 'west'] as const)).map((id) => ({ id }));

test.each([
	[4, 2.25, 2.65, 5],
	[8, 2.25, 3.05, 5]
] as const)(
	'independent %i view costs include the draw, re-import and rest fallback of every original direction',
	(n, gens, maxGens, minutes) => {
		expect(estimate({ size: options.size, directions: plain(n) })).toEqual({
			gens,
			maxGens,
			minutes
		});
	}
);

test('the direction plan never puts n_directions on the initial text-only v3 request, and can reuse the same base request', async () => {
	vi.spyOn(db, 'get').mockResolvedValue(undefined);
	const enqueue = vi
		.spyOn(queue, 'enqueue')
		.mockResolvedValue({ state: 'lost', error: 'synthetic stop before any API' } as JobRec);
	const plans = [
		plain(4),
		plain(8),
		[
			{ id: 'south' as const },
			{ id: 'east' as const },
			{ id: 'west' as const, mirrorOf: 'east' as const }
		]
	];
	for (const directions of plans)
		await expect(createCharacter({ ...options, directions })).rejects.toThrow('synthetic stop');
	const requests = enqueue.mock.calls.map(([req]) => req);
	expect(requests).toHaveLength(plans.length);
	for (const req of requests) {
		expect(req.path).toBe('/create-character-v3');
		expect(req.body).not.toHaveProperty('n_directions');
		expect(req).toEqual(requests[0]);
	}
});

const swapLabel = (label: string) =>
	label.startsWith('LEFT ')
		? label.replace('LEFT ', 'RIGHT ')
		: label.startsWith('RIGHT ')
			? label.replace('RIGHT ', 'LEFT ')
			: label;
const travel = (poses: Skeleton[], label: string) =>
	poses
		.slice(1)
		.reduce(
			(s, p, i) => s + Math.hypot(p[label].x - poses[i][label].x, p[label].y - poses[i][label].y),
			0
		);
test.each(['west', 'south-west', 'north-west'] as DirectionName[])(
	"%s authored slash drives anatomical right joints on that view's own rest pose",
	(dir) => {
		const east = fixture.rig.rest.east.keypoints;
		const rest = fromApi(
			east.map((p) => ({ ...p, label: swapLabel(p.label), x: 1 - p.x })),
			{ w: 64, h: 64 }
		);
		const poses = authoredPoses('slash', rest, dir);
		expect(travel(poses, 'RIGHT ARM')).toBeGreaterThan(2 * travel(poses, 'LEFT ARM'));
		expect(poses.map((p) => toApi(p, { w: 64, h: 64 })).every(hasAll)).toBe(true);
		expect(Object.keys(rest).sort()).toEqual([...LABELS].sort());
	}
);

test('eight independent held views obey 96px four-frame caps across three dressed batches', () => {
	const rig: Rig = {
		cell: { w: 64, h: 64 },
		pivot: { x: 32, y: 60 },
		directions: DIRECTIONS.map((id) => ({ id })),
		baseItem: 'base',
		baseHash: 'sha256:test',
		animations: [
			{ id: 'idle', cells: 4, loop: true, frames: [] },
			{ id: 'walk', cells: 8, loop: true, frames: [] }
		]
	};
	const calls = planItem(rig, {
		anims: ['idle', 'walk'],
		dirs: DIRECTIONS,
		method: 'skel',
		slot: 'main_hand',
		key: 'green'
	});
	const dress = calls.filter((c) => c.kind === 'dress');
	expect(dress.map((c) => c.cells.length)).toEqual([4, 3, 1]);
	expect(dress.map((c, i) => c.cells.length + Number(i > 0))).toEqual([4, 4, 2]);
	expect(dress.flatMap((c) => c.cells)).toEqual(DIRECTIONS.map((d) => `rest/${d}/0`));
	expect(calls.filter((c) => c.kind === 'pose')).toHaveLength(16);
	expect(planGens(calls)).toBe(78);
});

test('new items describe independent rows truthfully while mirrored rigs keep flip metadata', async () => {
	for (const mirrored of [false, true]) {
		const rig: Rig = {
			cell: { w: 64, h: 64 },
			pivot: { x: 32, y: 60 },
			directions: [
				{ id: 'east' },
				{ id: 'west', ...(mirrored ? { mirrorOf: 'east' as const } : {}) }
			],
			animations: [],
			baseItem: 'base',
			baseHash: 'sha256:test'
		};
		const { item } = await buildItem({
			spec: {
				id: 'helmet',
				name: 'Helmet',
				slot: 'head',
				prompt: '',
				key: 'green',
				anims: [],
				dirs: []
			},
			rig,
			cells: [],
			route: 'green',
			provenance: [],
			qa: {
				minKeyKept: 1,
				maxKeyOutside: 0,
				minAreaRatio: 1,
				maxAreaCV: 0,
				maxPaletteDist: 0,
				clipPx: 0,
				status: 'pass',
				cells: {},
				rerolls: 0
			}
		});
		expect(item.mirror).toBe(mirrored ? 'flip' : 'generate');
	}
});
