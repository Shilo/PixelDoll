import { expect, test } from 'vitest';
import { makeImg } from '../../src/lib/image/png.ts';
import { itemQa, slotOf, type CellOut } from '../../src/lib/items/items.ts';
import { LABELS } from '../../src/lib/rig/poses.ts';
import type { Rig } from '../../src/lib/rig/rig.ts';

// 64 px cell, off hand (left wrist). Each frame: the wrist position and the forearm direction (degrees, 90 = straight down).
const w = 64;
type Frame = {
	wrist: [number, number];
	fore: number;
	item: (x: number, y: number) => boolean;
	body?: (x: number, y: number) => boolean;
};
function run(frames: Frame[]) {
	const pose = (f: Frame) =>
		LABELS.map((label) => {
			const a = (f.fore * Math.PI) / 180;
			const [x, y] =
				label === 'LEFT ARM'
					? f.wrist
					: label === 'LEFT ELBOW'
						? [f.wrist[0] - 10 * Math.cos(a), f.wrist[1] - 10 * Math.sin(a)]
						: label === 'RIGHT ARM'
							? [44, 34]
							: label === 'RIGHT ELBOW'
								? [44, 24]
								: [32, 20];
			return { label, x: x / w, y: y / w };
		});
	const rig: Rig = {
		cell: { w, h: w },
		pivot: { x: 32, y: 60 },
		baseItem: 'base',
		baseHash: 'sha256:test',
		directions: [{ id: 'east' }],
		animations: [
			{
				id: 'walk',
				cells: frames.length,
				loop: false,
				frames: [],
				sources: {
					east: {
						route: 'skeleton-v3',
						reference: 'sha256:test',
						keypoints: frames.map(pose),
						provenance: []
					}
				}
			}
		]
	};
	const cells: CellOut[] = frames.map((f, i) => {
		const base = makeImg(w, w),
			layer = makeImg(w, w),
			mask = new Uint8Array(w * w);
		for (let y = 0; y < w; y++)
			for (let x = 0; x < w; x++) {
				const p = y * w + x;
				if (f.body?.(x, y)) base.data.set([90, 90, 90, 255], p * 4);
				else if (f.item(x, y)) {
					mask[p] = 1;
					layer.data.set([150, 90, 40, 255], p * 4);
				}
			}
		return {
			key: `walk/east/${i}`,
			call: 0,
			base,
			input: base,
			out: layer,
			layer,
			mask,
			area: mask.reduce((s, v) => s + v, 0),
			outBand: 0,
			baseBand: 0,
			specks: 0,
			pinholes: 0,
			shifted: false,
			offset: [0, 0],
			stray: 0,
			posed: true
		};
	});
	const q = itemQa(rig, slotOf('off_hand'), 'green', cells, 0);
	return { fails: [...q.failCalls.values()].flat(), warnings: q.warnings, qa: q.qa };
}
// A 3 px wide rod of `len` px from the wrist at angle `deg` (pixel centers).
const rod =
	(wrist: [number, number], deg: number, len = 16) =>
	(x: number, y: number) => {
		const a = (deg * Math.PI) / 180,
			dx = x + 0.5 - wrist[0],
			dy = y + 0.5 - wrist[1],
			along = dx * Math.cos(a) + dy * Math.sin(a);
		return along >= 0 && along <= len && Math.abs(-dx * Math.sin(a) + dy * Math.cos(a)) <= 1.3;
	};
const W: [number, number] = [20, 34],
	swing = [50, 90, 130, 90, 50, 90];

test('a lantern that hangs straight down while the forearm swings is a review note, not a failure', () => {
	const r = run(swing.map((fore) => ({ wrist: W, fore, item: rod(W, 90) })));
	expect(r.fails).toEqual([]);
	expect(r.warnings).toContain(
		'G9 walk/east: the held item keeps its own angle while the hand swings; check that it should hang or sway'
	);
	expect(r.qa).toMatchObject({ status: 'warn', heldHangReviewClips: 1 }); // the saved item keeps the reason
});

test('a sword turning against the forearm is not excused as hanging', () => {
	// counter-rotation: the arm swings 12 degrees per frame, the blade turns 20 the other way (2026-11-07 review)
	const r = run(
		[84, 96, 84, 96, 84, 96].map((fore, i) => ({
			wrist: W,
			fore,
			item: rod(W, 90 + (i % 2 ? -10 : 10))
		}))
	);
	expect(r.fails.some((f) => f.startsWith('G9 walk/east: the item turns'))).toBe(true);
});

test('a blade that loses its tip in a frame still fails G5', () => {
	const r = run(
		[20, 20, 12, 20, 20, 20].map((len) => ({ wrist: W, fore: 90, item: rod(W, 90, len) }))
	);
	expect(r.fails.some((f) => f.startsWith('G5'))).toBe(true);
});

test('a rigid item turning with the forearm passes, and one that flips still fails', () => {
	expect(run(swing.map((fore) => ({ wrist: W, fore, item: rod(W, fore) }))).fails).toEqual([]);
	const flips = run(
		swing.map((fore, i) => ({ wrist: W, fore, item: rod(W, i === 3 ? fore + 180 : fore) }))
	);
	expect(flips.fails.some((f) => f.startsWith('G9 walk/east: the item turns'))).toBe(true);
});

test('a banner whose cloth flaps between frames is a review note, not a failure', () => {
	// the pole keeps its length; the cloth beside its far end changes width
	const banner = (flap: number) => (x: number, y: number) =>
		rod(W, 90, 18)(x, y) ||
		(y >= W[1] + 10 && y <= W[1] + 18 && x > W[0] + 1 && x <= W[0] + 1 + flap);
	const r = run([12, 3, 12, 4, 12, 3].map((flap) => ({ wrist: W, fore: 90, item: banner(flap) })));
	expect(r.fails.filter((f) => f.startsWith('G5'))).toEqual([]);
	expect(r.warnings.some((m) => m.startsWith('G5 walk/east: area CV'))).toBe(true);
});

test('a buckler sliding behind the torso is an occlusion note; a vanished one still fails', () => {
	const torso = (x: number, y: number) => x >= 24 && x <= 40 && y >= 10 && y < 60;
	const disc = (c: [number, number]) => (x: number, y: number) =>
		Math.hypot(x + 0.5 - c[0], y + 0.5 - c[1]) <= 6;
	const shifts = [0, 0, 5, 9, 5, 0],
		frames = shifts.map((s) => {
			const wr: [number, number] = [18 + s, 34];
			return { wrist: wr, fore: 90, item: disc(wr), body: torso };
		});
	const r = run(frames);
	expect(r.fails.filter((f) => f.startsWith('G4'))).toEqual([]);
	expect(r.warnings.some((m) => m.startsWith('Occlusion walk/east'))).toBe(true);
	const gone = run(frames.map((f, i) => (i === 3 ? { ...f, item: () => false } : f)));
	expect(gone.fails.some((f) => f.startsWith('G4'))).toBe(true);
});
