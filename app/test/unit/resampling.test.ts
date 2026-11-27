import { readFileSync } from 'node:fs';
import { expect, test } from 'vitest';
import { makeImg, type Img } from '../../src/lib/image/png.ts';
import { decodePngBytes } from '../../src/lib/image/pngraw.ts';
import {
	detectCompressedPalette,
	MIN_COLORS,
	MIN_PAINTED_FLOOR,
	MIN_SINGLES,
	minPainted,
	paletteStats,
	SINGLE_SHARE
} from '../../src/lib/image/resampling.ts';
import { paletteImage, noisy } from './import-fixtures.ts';

/** Native pixel art with a small, repeating palette. */
function bands(): Img {
	const im = makeImg(32, 32);
	const colors = [
		[200, 48, 48, 255],
		[48, 180, 64, 255],
		[48, 72, 200, 255],
		[220, 196, 48, 255]
	];
	for (let y = 0; y < 32; y++)
		for (let x = 0; x < 32; x++)
			im.data.set(
				colors[(Math.floor(x / 8) + Math.floor(y / 8)) % colors.length],
				(y * 32 + x) * 4
			);
	return im;
}

/** Keep the first `keep` painted pixels and make the rest transparent. */
function withPainted(im: Img, keep: number): Img {
	let n = 0;
	for (let p = 0; p < im.w * im.h; p++)
		if (im.data[p * 4 + 3]) {
			if (n >= keep) im.data[p * 4 + 3] = 0;
			n++;
		}
	return im;
}

test('native pixel art passes: its palette repeats', () => {
	expect(detectCompressedPalette(bands())).toBe(false);
	const stats = paletteStats(bands());
	expect(stats.colors).toBe(4);
	expect(stats.singles).toBe(0);
});

test('a palette of mostly single-use colors is flagged as compressed or resampled', () => {
	expect(detectCompressedPalette(noisy())).toBe(true);
	expect(paletteStats(noisy())).toMatchObject({ painted: 1024, colors: 1024, singles: 1024 });
});

test('the painted floor scales with the cell and is exact', () => {
	const cell32 = noisy(32);
	expect(minPainted(cell32)).toBe(MIN_PAINTED_FLOOR);
	expect(detectCompressedPalette(withPainted(cell32, MIN_PAINTED_FLOOR))).toBe(true);
	expect(detectCompressedPalette(withPainted(cell32, MIN_PAINTED_FLOOR - 1))).toBe(false);
	// A 64x64 cell has an eighth as its floor, above the minimum.
	const cell64 = noisy(64);
	expect(minPainted(cell64)).toBe(512);
	expect(detectCompressedPalette(withPainted(cell64, 512))).toBe(true);
	expect(detectCompressedPalette(withPainted(cell64, 511))).toBe(false);
});

test('the color floor is exact', () => {
	const few = paletteImage(MIN_COLORS - 1, 80);
	expect(paletteStats(few)).toMatchObject({ colors: MIN_COLORS - 1, singles: 80 });
	expect(detectCompressedPalette(few)).toBe(false);
	expect(detectCompressedPalette(paletteImage(MIN_COLORS, 80))).toBe(true);
});

test('the single-use floor is exact', () => {
	const few = paletteImage(200, MIN_SINGLES - 1);
	expect(paletteStats(few)).toMatchObject({ colors: 200, singles: MIN_SINGLES - 1 });
	expect(detectCompressedPalette(few)).toBe(false);
	expect(detectCompressedPalette(paletteImage(200, MIN_SINGLES))).toBe(true);
});

test('the single-use share threshold is exact at 20%', () => {
	const atShare = paletteImage(400, 80);
	expect(paletteStats(atShare)).toEqual({ painted: 1024, colors: 400, singles: 80 });
	expect(80 / 400).toBeGreaterThanOrEqual(SINGLE_SHARE);
	expect(detectCompressedPalette(atShare)).toBe(true);
	expect(detectCompressedPalette(paletteImage(400, 79))).toBe(false);
});

test('pixels below the alpha cutoff are neither painted nor counted', () => {
	const im = bands();
	for (let p = 0; p < im.w * im.h; p++) im.data[p * 4 + 3] = 64; // all below the cutoff
	expect(paletteStats(im).painted).toBe(0);
	expect(detectCompressedPalette(im)).toBe(false);
	// Half kept at 128, half below: only the kept half counts.
	const mixed = bands();
	for (let p = 0; p < mixed.w * mixed.h; p++) mixed.data[p * 4 + 3] = p % 2 ? 128 : 64;
	expect(paletteStats(mixed).painted).toBe(512);
});

test('transparent pixels do not count toward the palette', () => {
	const im = makeImg(32, 32);
	expect(paletteStats(im)).toEqual({ painted: 0, colors: 0, singles: 0 });
	expect(detectCompressedPalette(im)).toBe(false);
});

test('real exported pixel art has no single-use colors', async () => {
	const body = await decodePngBytes(
		readFileSync(
			new URL('../../public/fixtures/s2/layers/body/base/main/walk.png', import.meta.url)
		)
	);
	const stats = paletteStats(body);
	expect(stats.singles).toBe(0);
	expect(detectCompressedPalette(body)).toBe(false);
});
