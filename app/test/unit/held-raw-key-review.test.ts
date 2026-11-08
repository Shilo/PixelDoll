import { expect, test } from 'vitest';
import { newKeyPixels, toChroma } from '../../src/lib/image/chroma.ts';
import { makeImg, type Img } from '../../src/lib/image/png.ts';
import { extractCell, GATES, itemQa, padImg, slotOf } from '../../src/lib/items/items.ts';
import { acceptQa, mergeQa } from '../../src/lib/items/qa-summary.ts';
import { isClean } from '../../src/lib/items/run.ts';
import { LABELS } from '../../src/lib/rig/poses.ts';
import type { Rig } from '../../src/lib/rig/rig.ts';
import type { CellKey, Item } from '../../src/lib/store/manifest.ts';

const pose = LABELS.map((label) => ({
	label,
	x: (label.startsWith('LEFT') ? 20 : label.endsWith('ELBOW') ? 34 : 39) / 64,
	y: 32 / 64
}));
const rig: Rig = {
	cell: { w: 64, h: 64 },
	pivot: { x: 32, y: 60 },
	baseItem: 'body',
	baseHash: 'sha256:synthetic',
	directions: [{ id: 'south' }, { id: 'east' }],
	animations: [
		{
			id: 'slash',
			cells: 1,
			loop: false,
			frames: [{ cell: 0, ms: 100 }],
			sources: {
				south: {
					route: 'skeleton-v3',
					reference: 'sha256:synthetic',
					keypoints: [pose],
					provenance: []
				},
				east: {
					route: 'skeleton-v3',
					reference: 'sha256:synthetic',
					keypoints: [pose],
					provenance: []
				}
			}
		}
	]
};
function fixture(left = false, pad = 0) {
	const native = makeImg(64, 64);
	for (let y = 12; y < 52; y++)
		for (let x = 20; x < 40; x++) native.data.set([180, 100, 60, 255], (y * 64 + x) * 4);
	const base = padImg(native, pad),
		out = toChroma(base, 'green'),
		start = left ? 14 : 38;
	for (let y = 32 + pad; y < 34 + pad; y++)
		for (let x = start + pad; x < start + pad + 9; x++)
			out.data.set([130, 130, 140, 255], (y * out.w + x) * 4);
	return {
		base,
		out,
		cell: (key: CellKey = 'slash/south/0') =>
			extractCell({
				key,
				call: 0,
				base,
				out,
				route: 'green',
				band: { x: 0, y: 0, w: base.w, h: base.h },
				posed: true,
				held: true,
				pad
			})
	};
}
function add(out: Img, x = 40, y = 30) {
	out.data.set([0, 180, 0, 255], (y * out.w + x) * 4);
}
function shift(im: Img) {
	const out = makeImg(im.w, im.h);
	for (let y = 0; y < im.h; y++)
		for (let x = 0; x < im.w - 1; x++)
			out.data.set(
				im.data.subarray((y * im.w + x) * 4, (y * im.w + x + 1) * 4),
				(y * im.w + x + 1) * 4
			);
	return out;
}
const check = (
	cells: ReturnType<ReturnType<typeof fixture>['cell']>[],
	r = rig,
	left = false,
	pad = 0
) =>
	itemQa(r, slotOf(left ? 'off_hand' : 'main_hand'), 'green', cells, 0, GATES.keyOutsidePosed, pad);
const item = (qa: ReturnType<typeof check>['qa']): Item => ({
	id: 'sword',
	name: 'Sword',
	slot: 'main_hand',
	status: 'accepted',
	mirror: 'generate',
	materials: [],
	prompt: 'steel sword',
	baseHash: rig.baseHash,
	provenance: [],
	layers: [{ id: 'main', role: 'fg', z: 150, cells: { slash: { south: [null], east: [null] } } }],
	qa
});

test('the exact raw comparison reuses key classification and ignores transparent, non-key, and already occupied pixels', () => {
	const base = makeImg(8, 8),
		out = makeImg(8, 8);
	base.data.set([120, 60, 30, 1], (2 * 8 + 2) * 4);
	for (const [x, y, color] of [
		[2, 2, [0, 180, 0, 255]],
		[3, 3, [0, 180, 0, 255]],
		[5, 4, [0, 180, 0, 255]],
		[1, 1, [0, 180, 0, 127]],
		[7, 7, [140, 140, 150, 255]]
	] as const)
		out.data.set(color, (y * 8 + x) * 4);
	const raw = newKeyPixels(base, out, 'green')!;
	expect(raw.pixels).toBe(2);
	expect(raw.bounds).toEqual({ x: 3, y: 3, w: 3, h: 2 });
	expect(raw.mask.reduce((n, v) => n + v, 0)).toBe(2);
	expect(() => newKeyPixels(base, makeImg(4, 4), 'green')).toThrow('matching cell dimensions');
});

test('a small raw addition below the current G3 threshold is informational without changing quality or clean-save decisions', () => {
	// Distances run from the keypoint (pixel-edge coordinates) to the pixel's center, so the corner-based sqrt(5) is now 1.5 * sqrt(2).
	const f = fixture();
	add(f.out);
	const c = f.cell(),
		q = check([c]);
	expect(c.keyOutside).toBeLessThan(GATES.keyOutsidePosed);
	expect(c.rawKeyOutside?.pixels).toBe(1);
	expect(q.qa).toMatchObject({
		status: 'pass',
		rawKeyReviewFrames: 1,
		cells: {
			'slash/south/0': {
				rawKeyOutside: {
					pixels: 1,
					bounds: { x: 40, y: 30, w: 1, h: 1 },
					space: 'raw-output-cell',
					nearestWristPx: 1.5 * Math.SQRT2
				}
			}
		}
	});
	expect(q.failCalls.size).toBe(0);
	expect(q.softCalls.size).toBe(0);
	expect(q.qa.rerolls).toBe(0);
	expect(q.warnings).toEqual([]);
	expect(q.qa.clips!['slash/south']).toMatchObject({ status: 'pass', rawKeyReviewFrames: 1 });
	expect(isClean({ cells: [c], qa: q, g1: new Map(), preview: null })).toBe(true);
});

test('unchanged key pixels and the non-key sword alone do not create a raw observation', () => {
	const f = fixture(),
		q = check([f.cell()]);
	expect(newKeyPixels(f.base, f.out, 'green')).toBeUndefined();
	expect(q.qa).not.toHaveProperty('rawKeyReviewFrames');
	expect(q.qa.cells['slash/south/0']).not.toHaveProperty('rawKeyOutside');
	expect(q.warnings.some((s) => s.startsWith('Grip review'))).toBe(false);
});

test('a normal one-pixel redraw shift retains raw evidence even after registration makes G3 clean', () => {
	const f = fixture(),
		raw = shift(f.out),
		c = extractCell({
			key: 'slash/south/0',
			call: 0,
			base: f.base,
			out: raw,
			route: 'green',
			band: { x: 0, y: 0, w: 64, h: 64 },
			posed: true,
			held: true
		}),
		q = check([c]);
	expect(c.offset).toEqual([-1, -0]);
	expect(c.keyOutside).toBe(0);
	expect(c.rawKeyOutside!.pixels).toBeGreaterThan(0);
	expect(c.rawKeyOutside!.bounds.x).toBe(40);
	expect(q.failCalls.size).toBe(0);
	expect(q.softCalls.size).toBe(0);
	expect(q.warnings).toEqual([]);
	expect(q.qa.status).toBe('pass');
});

test('the requested left wrist and padded raw coordinates override conflicting hand anchors', () => {
	const f = fixture(true, 16);
	add(f.out, 35, 47);
	const r = structuredClone(rig);
	r.anchors = { hand_l: { slash: { south: [[0, 0]] } }, hand_r: { slash: { south: [[0, 0]] } } };
	const q = check([f.cell()], r, true, 16),
		raw = q.qa.cells['slash/south/0'].rawKeyOutside!;
	expect(raw.bounds).toEqual({ x: 35, y: 47, w: 1, h: 1 });
	expect(raw.nearestWristPx).toBeCloseTo(Math.SQRT1_2, 12);
	expect(raw.space).toBe('raw-output-cell'); // pixel center: half a pixel nearer than the former corner distance
});

test('missing intended-wrist data keeps the observation and does not invent a distance', () => {
	const f = fixture();
	add(f.out);
	const r = structuredClone(rig);
	delete r.animations[0].sources;
	const q = check([f.cell()], r);
	expect(q.qa.rawKeyReviewFrames).toBe(1);
	expect(q.qa.cells['slash/south/0'].rawKeyOutside).not.toHaveProperty('nearestWristPx');
	expect(q.warnings.some((s) => s.startsWith('Grip review'))).toBe(false);
});

test('a held slot without an explicit intended hand does not silently choose the right wrist', () => {
	const f = fixture();
	add(f.out);
	const slot = { ...slotOf('main_hand') };
	delete slot.anchor;
	const q = itemQa(rig, slot, 'green', [f.cell()], 0, GATES.keyOutsidePosed);
	expect(q.qa.rawKeyReviewFrames).toBe(1);
	expect(q.qa.cells['slash/south/0'].rawKeyOutside).not.toHaveProperty('nearestWristPx');
});

test('unheld chroma and held difference extraction preserve their previous behavior', () => {
	const f = fixture();
	add(f.out);
	for (const options of [
		{ route: 'green' as const, held: false },
		{ route: 'none' as const, held: true }
	]) {
		const c = extractCell({
			key: 'slash/south/0',
			call: 0,
			base: f.base,
			out: f.out,
			band: { x: 0, y: 0, w: 64, h: 64 },
			...options
		});
		expect(c).not.toHaveProperty('rawKeyOutside');
	}
});

test('acceptance, JSON reload and clip replacement retain only the observations for current artwork', () => {
	const south = fixture(),
		east = fixture();
	add(south.out);
	add(east.out, 41, 30);
	const original = check([south.cell(), east.cell('slash/east/0')]).qa,
		accepted = acceptQa(original),
		loaded = JSON.parse(JSON.stringify(item(accepted))) as Item;
	expect(loaded.qa).toMatchObject({ status: 'pass', rawKeyReviewFrames: 2 });
	expect(loaded.qa!.cells['slash/south/0'].rawKeyOutside).toEqual(
		original.cells['slash/south/0'].rawKeyOutside
	);
	expect(loaded.qa!.cells['slash/south/0'].rawKeyOutside).not.toHaveProperty('mask');
	const clean = fixture(),
		next = check([clean.cell()]).qa,
		merged = mergeQa(loaded, next, next.cells);
	expect(merged).toMatchObject({ status: 'pass', rawKeyReviewFrames: 1 });
	expect(merged.cells['slash/south/0']).not.toHaveProperty('rawKeyOutside');
	expect(merged.cells['slash/east/0'].rawKeyOutside).toEqual(
		original.cells['slash/east/0'].rawKeyOutside
	);
	const final = check([clean.cell('slash/east/0')]).qa,
		fixed = mergeQa(item(merged), final, final.cells);
	expect(fixed).not.toHaveProperty('rawKeyReviewFrames');
	expect(fixed.cells['slash/east/0']).not.toHaveProperty('rawKeyOutside');
	expect(original.rawKeyReviewFrames).toBe(2);
});

test('ordinary raw differences preserve the same clean-save policy as the original output', () => {
	for (const shifted of [false, true]) {
		const f = fixture(),
			before = check([f.cell()]);
		add(f.out);
		if (shifted) f.out.data.set(shift(f.out).data);
		const c = f.cell(),
			after = check([c]);
		expect(after.qa.status).toBe(before.qa.status);
		expect(after.warnings).toEqual(before.warnings);
		expect(isClean({ cells: [c], qa: after, g1: new Map(), preview: null })).toBe(
			isClean({ cells: [], qa: before, g1: new Map(), preview: null })
		);
		expect(after.qa.rawKeyReviewFrames).toBe(1);
	}
});
