import { expect, test } from 'vitest';
import { makeImg, type Img } from '../../src/lib/image/png.ts';
import {
	detectCompressedPalette,
	looksCompressed,
	MIN_COLORS,
	MIN_PAINTED,
	MIN_SINGLES,
	paletteStats,
	SINGLE_SHARE
} from '../../src/lib/image/resampling.ts';

/** Blocky bands: native pixel art with a small, repeating palette. */
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

/** Checkerboard: two colors, both repeated. */
function checker(): Img {
	const im = makeImg(32, 32);
	for (let y = 0; y < 32; y++)
		for (let x = 0; x < 32; x++)
			im.data.set((x + y) % 2 ? [20, 20, 20, 255] : [230, 230, 230, 255], (y * 32 + x) * 4);
	return im;
}

const colorOf = (i: number) => [i & 255, (i >> 8) & 255, 0, 255] as const;

/**
 * A 32x32 (1024 px) image with exactly `singles` colors used once and `others` colors used more than once, plus one
 * repeated fill color. Returns the stats the image must produce, so a test asserts its own fixture first.
 */
function paletteImage(
	singles: number,
	others: number
): { im: Img; stats: { painted: number; colors: number; singles: number } } {
	const im = makeImg(32, 32);
	let p = 0;
	const put = (index: number) => im.data.set(colorOf(index), p++ * 4);
	for (let i = 0; i < singles; i++) put(i);
	for (let i = 0; i < others; i++) {
		put(singles + i);
		put(singles + i);
	}
	const fill = singles + others;
	while (p < 1024) put(fill);
	return { im, stats: { painted: 1024, colors: singles + others + 1, singles } };
}

test('native pixel art passes: its palette repeats', () => {
	expect(detectCompressedPalette(bands())).toBe(false);
	expect(detectCompressedPalette(checker())).toBe(false);
	const stats = paletteStats(bands());
	expect(stats.colors).toBe(4);
	expect(stats.singles).toBe(0);
});

test('a palette of mostly single-use colors is flagged as compressed or resampled', () => {
	const noisy = paletteImage(900, 60);
	expect(paletteStats(noisy.im)).toEqual(noisy.stats);
	expect(detectCompressedPalette(noisy.im)).toBe(true);
});

test('the painted-pixel floor is exact', () => {
	const atFloor = paletteImage(100, 301); // 100 singles of 402 colors: 24.9%
	expect(atFloor.stats.painted).toBe(MIN_PAINTED);
	expect(detectCompressedPalette(atFloor.im)).toBe(true);
	// One pixel fewer: below the floor even though every color is used once.
	const small = makeImg(31, 32); // 992 painted
	for (let p = 0; p < small.w * small.h; p++) small.data.set(colorOf(p), p * 4);
	expect(paletteStats(small).painted).toBeLessThan(MIN_PAINTED);
	expect(detectCompressedPalette(small)).toBe(false);
});

test('the single-use share threshold is exact at 20%', () => {
	const atShare = paletteImage(80, 319); // 80 / 400 = 20%
	expect(paletteStats(atShare.im)).toEqual(atShare.stats);
	expect(atShare.stats.singles / atShare.stats.colors).toBeGreaterThanOrEqual(SINGLE_SHARE);
	expect(detectCompressedPalette(atShare.im)).toBe(true);
	const below = paletteImage(79, 319); // 79 / 399 = 19.8%
	expect(paletteStats(below.im)).toEqual(below.stats);
	expect(detectCompressedPalette(below.im)).toBe(false);
});

test('a small palette is never flagged, however unique its colors', () => {
	const few = paletteImage(40, 10); // 51 colors, 40 singles
	expect(few.stats.colors).toBeLessThan(MIN_COLORS);
	expect(few.stats.singles).toBeLessThan(MIN_SINGLES);
	expect(detectCompressedPalette(few.im)).toBe(false);
});

test('graded alpha is not compression, so it is left to the transparency warning', () => {
	const im = bands();
	for (let p = 0; p < im.w * im.h; p++) im.data[p * 4 + 3] = 64; // below the import cutoff
	expect(paletteStats(im).painted).toBe(0);
	expect(detectCompressedPalette(im)).toBe(false);
});

test('pixels at the alpha cutoff are kept and counted', () => {
	const im = bands();
	for (let p = 0; p < im.w * im.h; p++) im.data[p * 4 + 3] = 128;
	expect(paletteStats(im).painted).toBe(1024);
});

test('transparent pixels do not count toward the palette', () => {
	const im = makeImg(32, 32);
	expect(paletteStats(im)).toEqual({ painted: 0, colors: 0, singles: 0 });
	expect(looksCompressed(paletteStats(im))).toBe(false);
});
