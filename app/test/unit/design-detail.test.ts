import { expect, test } from 'vitest';
import { makeImg, type Img } from '../../src/lib/image/png.ts';
import { detailMinPx, dirGate, slotOf, type CellOut } from '../../src/lib/items/items.ts';
import { plainReason, qaReasons } from '../../src/studio/model.ts';
import type { ItemQa } from '../../src/lib/store/manifest.ts';

// A 20 x 24 red tunic in three shades with a dark outline and an optional emblem (code-map section 4 repro).
const w = 64,
	GOLD = [230, 190, 60],
	BLUE = [60, 90, 210];
function tunic(emblem: number[] | null, size = 4): Img {
	const im = makeImg(w, w);
	for (let y = 30; y < 54; y++)
		for (let x = 22; x < 42; x++) {
			const edge = x === 22 || x === 41 || y === 30 || y === 53;
			im.data.set(
				edge
					? [40, 20, 20, 255]
					: (x + y) % 3
						? [170, 40, 40, 255]
						: y > 46
							? [120, 25, 25, 255]
							: [200, 70, 60, 255],
				(y * w + x) * 4
			);
		}
	// a 4 x 4 block for 16 px, otherwise a 2 px wide strip of `size` px
	if (emblem)
		for (let i = 0; i < size; i++)
			im.data.set(
				[...emblem, 255],
				(size === 16 ? (38 + (i >> 2)) * w + 30 + (i & 3) : (38 + (i >> 1)) * w + 30 + (i & 1)) * 4
			);
	return im;
}
const cell = (layer: Img, key = 'walk/south/2'): CellOut => {
	const mask = new Uint8Array(w * w);
	let area = 0;
	for (let p = 0; p < mask.length; p++)
		if (layer.data[p * 4 + 3]) {
			mask[p] = 1;
			area++;
		}
	return {
		key,
		call: 1,
		base: makeImg(w, w),
		input: makeImg(w, w),
		out: layer,
		layer,
		mask,
		area,
		outBand: 0,
		baseBand: 0,
		specks: 0,
		pinholes: 0,
		shifted: false,
		offset: [0, 0],
		stray: 0,
		posed: true
	};
};
const check = (design: Img, frame: Img, slot = 'torso_outer', key?: string) =>
	dirGate(slotOf(slot), [cell(frame, key)], { south: design });

test('a lost or recolored emblem is a review note; an intact one is not', () => {
	const design = tunic(GOLD, 16);
	expect(check(design, tunic(GOLD, 16)).detailReviewFrames).toBe(0);
	for (const frame of [tunic(null), tunic(BLUE, 16)]) {
		const r = check(design, frame);
		expect(r.detailReviewFrames).toBe(1);
		expect(r.fails.size).toBe(0); // a note for review, never a failure
		expect(r.warnings).toContain(
			'G15 walk/south/2: a detail of the dressed design (16 px) is missing or recolored'
		);
	}
	expect(
		plainReason('G15 walk/south/2: a detail of the dressed design (16 px) is missing or recolored')
	).toBe('A detail of the design is missing or recolored in some frames');
});

test('a 4 px detail counts; a 3 px speck and slight shading changes do not', () => {
	expect(check(tunic(GOLD, 4), tunic(null)).detailReviewFrames).toBe(1);
	expect(check(tunic(GOLD, 3), tunic(null)).detailReviewFrames).toBe(0);
	const shaded = tunic(GOLD, 16);
	for (let p = 0; p < w * w; p++)
		if (shaded.data[p * 4 + 3])
			for (let c = 0; c < 3; c++) shaded.data[p * 4 + c] = Math.max(0, shaded.data[p * 4 + c] - 20);
	expect(check(tunic(GOLD, 16), shaded).detailReviewFrames).toBe(0); // within the per-channel tolerance
});

test('a detail in a color the body also has is not judged', () => {
	// skin the provider drew inside the item: it can rightly vanish in a posed frame (bench b-tunic)
	const SKIN = [195, 141, 97],
		frame = cell(tunic(null));
	frame.base.data.set([...SKIN, 255], (5 * w + 5) * 4);
	expect(
		dirGate(slotOf('torso_outer'), [frame], { south: tunic(SKIN, 16) }).detailReviewFrames
	).toBe(0);
	expect(check(tunic(SKIN, 16), tunic(null)).detailReviewFrames).toBe(1); // the same color with no body px is still judged
});

test('held items are not checked', () => {
	expect(check(tunic(GOLD, 16), tunic(null), 'main_hand').detailReviewFrames).toBe(0);
});

test('the slash is judged for items over the body only, other actions are not, and the detail size scales with the cell', () => {
	// capes and hair swing to their darker side in an attack (bench a-cape slash/north/3); they are judged in walks
	for (const slot of ['back', 'hair']) {
		expect(
			check(tunic(GOLD, 16), tunic(null), slot, 'slash/south/2').detailReviewFrames,
			slot
		).toBe(0);
		expect(check(tunic(GOLD, 16), tunic(null), slot, 'walk/south/2').detailReviewFrames, slot).toBe(
			1
		);
	}
	expect(
		check(tunic(GOLD, 16), tunic(null), 'torso_outer', 'slash/south/2').detailReviewFrames
	).toBe(1);
	// a cast, a death or a described move can turn the front away
	for (const move of ['cast', 'death', 'spin-around'])
		expect(
			check(tunic(GOLD, 16), tunic(null), 'torso_outer', `${move}/south/2`).detailReviewFrames,
			move
		).toBe(0);
	expect(detailMinPx(makeImg(64, 64))).toBe(4);
	expect(detailMinPx(makeImg(128, 128))).toBe(16); // a 4 px highlight scaled 2x is not a new detail
});

test('a saved item names the detail note for review', () => {
	const q = {
		minKeyKept: 1,
		maxKeyOutside: 0,
		minAreaRatio: 1,
		maxAreaCV: 0,
		maxPaletteDist: 0,
		clipPx: 0,
		status: 'warn',
		rerolls: 0,
		cells: {},
		clips: {},
		detailReviewFrames: 2
	} as ItemQa;
	expect(qaReasons(q, false, true)).toContain(
		'A detail of the design is missing or recolored in some frames'
	);
});
