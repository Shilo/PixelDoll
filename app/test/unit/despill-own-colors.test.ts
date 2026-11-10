import { expect, test } from 'vitest';
import { despill, keyScore, KT, NEAR_KEY } from '../../src/lib/image/chroma.ts';

const layer = (colors: number[][]) => ({
	w: colors.length,
	h: 1,
	data: new Uint8ClampedArray(colors.flatMap((c) => [...c, 255]))
});
const rgb = (im: { data: Uint8ClampedArray }) =>
	Array.from({ length: im.data.length / 4 }, (_, i) => [...im.data.slice(i * 4, i * 4 + 3)]);

test('green-leaning gear below the key score keeps its exact colors on the green key', () => {
	// A turquoise ramp and a jade trim with a dark outline: every color has a key excess but scores below the key.
	const gear = [
		[40, 170, 150],
		[30, 130, 115],
		[20, 100, 85],
		[70, 140, 100],
		[24, 30, 28]
	];
	for (const c of gear.slice(0, 4)) expect(keyScore('green', c[0], c[1], c[2])).toBeGreaterThan(0);
	for (const c of gear) expect(keyScore('green', c[0], c[1], c[2])).toBeLessThan(KT);
	expect(rgb(despill(layer(gear), 'green'))).toEqual(gear);
});

test('a tint that despills to near-gray still follows the steel-stays-gray rule', () => {
	// (120,136,120) is lightly tinted gray steel next to a px extraction removed (key, opaque in the composite only); with no
	// gray core within reach it must not keep its green cast. Lightly tinted px are despilled only there since 2026-11-10.
	const L = layer([
		[150, 34, 38],
		[120, 136, 120],
		[0, 0, 0]
	]);
	L.data[11] = 0;
	const C = layer([
		[150, 34, 38],
		[120, 136, 120],
		[0, 200, 0]
	]);
	const out = rgb(despill(L, 'green', C))[1];
	expect(Math.max(...out) - Math.min(...out)).toBeLessThan(16);
});

// Blue-gray steel as PixelLab draws it on every mannequin (hue ~215, S 0.11 to 0.27): it scores a key excess on the azure key
// (13 to 24), and the excess-only despill flattened such helm steel to gray (2026-11-10 keys 3 review: 1,356 of 1,577 px).
const STEEL = [
	[70, 80, 96],
	[96, 108, 126],
	[122, 136, 156],
	[150, 164, 184],
	[178, 190, 206]
];
/** The colors as one row, with the last px removed by extraction (`removed`: opaque key in the composite) or transparent. */
const row = (colors: number[][], removed: boolean) => {
	const L = layer([...colors, [0, 0, 0]]),
		C = layer([...colors, [40, 140, 255]]);
	L.data[colors.length * 4 + 3] = 0;
	if (!removed) C.data[colors.length * 4 + 3] = 0;
	return { L, C };
};

test('blue-gray steel inside the item survives despill unchanged on the azure and blue keys', () => {
	for (const c of STEEL) expect(keyScore('azure', c[0], c[1], c[2])).toBeGreaterThan(0);
	for (const key of ['azure', 'blue'] as const) {
		const { L, C } = row(STEEL, false);
		expect(rgb(despill(L, key, C)).slice(0, STEEL.length), key).toEqual(STEEL);
	}
});

test('a saturated key-hued px inside the item is still despilled', () => {
	for (const [key, spill] of [
		['azure', [70, 150, 230]],
		['blue', [80, 90, 220]],
		['green', [90, 170, 80]]
	] as const) {
		const { L, C } = row([...STEEL.slice(0, 2), [...spill], ...STEEL.slice(2)], false);
		const out = rgb(despill(L, key, C))[2];
		expect(keyScore(key, spill[0], spill[1], spill[2]), key).toBeGreaterThanOrEqual(NEAR_KEY);
		expect(keyScore(key, out[0], out[1], out[2]), key).toBeLessThan(NEAR_KEY);
	}
});

test('a lightly tinted edge px next to a removed key px is still despilled', () => {
	const { L, C } = row(STEEL, true);
	const out = rgb(despill(L, 'azure', C)),
		edge = out[STEEL.length - 1];
	expect(Math.max(...edge) - Math.min(...edge)).toBeLessThan(16);
	expect(out.slice(0, -2)).toEqual(STEEL.slice(0, -1));
});
