import { expect, test } from 'vitest';
import { makeImg, type Img } from '../../src/lib/image/png.ts';
import {
	absorbOutline,
	chromaLayer,
	chromaMask,
	dropKeyOutline,
	keyScore,
	NEAR_KEY,
	toChroma,
	type Key
} from '../../src/lib/image/chroma.ts';

// 2026-11-09 key A/B (docs/research/2026-11-09-paperdoll-video-review/chroma-key.md): on the green mannequin the model draws a
// near-black item outline over the body tinted toward the key's darkest shade, (4,19,0). It scores as key, and as a 1-px edge
// it has only 2 to 4 item neighbors, so absorbOutline dropped it (braid outlines lost in every walk frame).
const W = 12,
	H = 12,
	ITEM = [210, 170, 60],
	ITEM_DARK = [40, 28, 12],
	OUTLINE_ROW = 5;

const swapGB = ([r, g, b]: number[]) => [r, b, g];
/** HSV hue rotation, the same frame production uses for azure (green ramp rotated +90). */
function rot([r, g, b]: number[], deg: number): number[] {
	const mx = Math.max(r, g, b),
		mn = Math.min(r, g, b),
		d = mx - mn;
	if (!d) return [r, g, b];
	let h = mx === r ? ((g - b) / d) % 6 : mx === g ? (b - r) / d + 2 : (r - g) / d + 4;
	h = (((h * 60 + deg) % 360) + 360) % 360;
	const x = d * (1 - Math.abs(((h / 60) % 2) - 1));
	const c =
		h < 60
			? [d, x, 0]
			: h < 120
				? [x, d, 0]
				: h < 180
					? [0, d, x]
					: h < 240
						? [0, x, d]
						: h < 300
							? [x, 0, d]
							: [d, 0, x];
	return c.map((v) => Math.round(v + mn));
}
// Colors are written in green's frame; magenta's colors are given as they are.
const inFrame: Record<Key, (c: number[]) => number[]> = {
	green: (c) => c,
	magenta: (c) => c,
	blue: swapGB,
	azure: (c) => rot(c, 90)
};

/** Opaque gray body B; C = B keyed, with an item (rows 1..4, dark trim in row 4's ends) and a 1-px row `line` under it. */
function scene(key: Key, line: number[], strayAt?: [number, number]) {
	const B = makeImg(W, H);
	for (let p = 0; p < W * H; p++) {
		const v = 60 + ((p * 37) % 120);
		B.data.set([v, v, v, 255], p * 4);
	}
	const C = toChroma(B, key);
	const to = inFrame[key];
	for (let y = 1; y <= 4; y++)
		for (let x = 2; x <= 9; x++)
			C.data.set([...(y === 4 && (x === 2 || x === 9) ? ITEM_DARK : ITEM), 255], (y * W + x) * 4);
	for (let x = 2; x <= 9; x++) C.data.set([...to(line), 255], (OUTLINE_ROW * W + x) * 4);
	if (strayAt) C.data.set([...to(line), 255], (strayAt[1] * W + strayAt[0]) * 4);
	return { B, C };
}
const mask = (key: Key, B: Img, C: Img) =>
	absorbOutline(dropKeyOutline(chromaMask(C, key), B, C, key), B, C, key);
const row = (m: Uint8Array, y: number) => [...m.subarray(y * W + 2, y * W + 10)];

// Magenta's mannequin outline came back as (35,14,28) on the bench tunic: off the ramp like green's (4,19,0).
const LINE: Record<Key, number[]> = {
	green: [4, 19, 0],
	blue: [4, 19, 0],
	azure: [4, 19, 0],
	magenta: [35, 14, 28]
};
const KEYS_ALL = Object.keys(LINE) as Key[];

test('a near-black outline tinted toward the darkest key shade is kept when it touches the item', () => {
	for (const key of KEYS_ALL) {
		const { B, C } = scene(key, LINE[key]);
		const [r, g, b] = C.data.subarray((OUTLINE_ROW * W + 4) * 4);
		expect(keyScore(key, r, g, b), key).toBeGreaterThanOrEqual(35); // it is key-scored, so only absorbOutline can keep it
		expect(row(mask(key, B, C), OUTLINE_ROW), key).toEqual(Array(8).fill(1));
	}
});

// The bench tunic on magenta: the model drew the mannequin's own outline in that color all over the body, and keeping it next
// to the item grew spikes up the neck. A color the bare mannequin uses 3+ px from the item is mannequin, even touching the item.
test('a color the bare mannequin also uses away from the item stays key everywhere', () => {
	for (const key of KEYS_ALL) {
		const { B, C } = scene(key, LINE[key], [6, 9]);
		const m = mask(key, B, C);
		expect(m[9 * W + 6], key).toBe(0);
		expect(row(m, OUTLINE_ROW), key).toEqual(Array(8).fill(0));
	}
});

test('outline px never count as item neighbors for the 5-of-8 rule', () => {
	const { B, C } = scene('green', LINE.green);
	// A mannequin shade at (10,4) with 3 item neighbors ((9,3), (10,3), (9,4)) and 3 outline neighbors on row 5.
	C.data.set([...ITEM, 255], (3 * W + 10) * 4);
	C.data.set([8, 74, 5, 255], (4 * W + 10) * 4);
	for (const x of [10, 11]) C.data.set([...LINE.green, 255], (OUTLINE_ROW * W + x) * 4);
	const m = mask('green', B, C);
	expect(m[OUTLINE_ROW * W + 11]).toBe(1);
	expect(m[4 * W + 10]).toBe(0);
});

// FAR is a cliff, not a margin: (4,19,0) is 41 from (0,60,0). A slightly lighter tint falls back to the old behavior (dropped).
test('a tint within FAR of the ramp is still keyed out', () => {
	const { B, C } = scene('green', [4, 21, 0]);
	expect(row(mask('green', B, C), OUTLINE_ROW)).toEqual(Array(8).fill(0));
});

test('mid-tone key blends and the darkest ramp shade itself are still keyed out next to the item', () => {
	for (const line of [
		[91, 146, 42],
		[0, 60, 0],
		[6, 64, 4]
	]) {
		const { B, C } = scene('green', line);
		expect(row(mask('green', B, C), OUTLINE_ROW), String(line)).toEqual(Array(8).fill(0));
	}
});

test('a kept outline px is despilled to an item color, not left key-tinted', () => {
	const { B, C } = scene('green', [4, 19, 0]);
	const { layer } = chromaLayer(C, 'green', B);
	for (let x = 2; x <= 9; x++) {
		const i = (OUTLINE_ROW * W + x) * 4;
		expect(layer.data[i + 3]).toBe(255);
		expect(keyScore('green', layer.data[i], layer.data[i + 1], layer.data[i + 2])).toBeLessThan(
			NEAR_KEY
		);
	}
});
