// Compressed or resampled imports. Pixel art keeps a small palette whose colors repeat; JPEG-style damage and smooth
// rescales leave many colors that appear exactly once. Each standing cell is judged on its own palette: pooling cells
// would let one clean direction hide a damaged one or let several small palettes pass the floors together. The import is
// always kept as is; this only produces a warning. Pixels the importer will discard (alpha below the binarization
// cutoff) are excluded, because their blended RGB is not part of the imported art; graded alpha has its own warning
// (import.warning.semiAlpha).
import type { Img } from './png.ts';

/** Must match the cutoff `normalize` binarizes with; import.ts passes this constant to it so the two cannot drift. */
export const ALPHA_THRESHOLD = 128;
/** Smallest painted area a cell needs before its palette means anything. */
export const MIN_PAINTED_FLOOR = 256;
/** A compressed palette needs a real palette behind it. Above the singles floor on purpose: a 100-color hand-anti-aliased
 *  sprite can have many one-off colors without being damaged, while JPEG noise lands in the hundreds. */
export const MIN_COLORS = 128;
/** An absolute floor, so the ratio is never asked to be meaningful on a tiny palette. */
export const MIN_SINGLES = 64;
/** Share of distinct colors used only once that means compression or resampling; native art repeats its palette. */
export const SINGLE_SHARE = 0.2;

export interface PaletteStats {
	/** Pixels at or above the alpha threshold. */
	painted: number;
	/** Distinct RGB values among painted pixels. */
	colors: number;
	/** Distinct RGB values that appear exactly once. */
	singles: number;
}

/**
 * Count distinct and single-use colors over a 24-bit palette. The state table is one byte per RGB value (16 MB), so a
 * large cell costs bounded memory instead of one map entry per pixel.
 */
export function paletteStats(im: Img): PaletteStats {
	const state = new Uint8Array(1 << 24);
	let painted = 0,
		colors = 0,
		singles = 0;
	for (let p = 0; p < im.w * im.h; p++) {
		if (im.data[p * 4 + 3] < ALPHA_THRESHOLD) continue;
		painted++;
		const key = (im.data[p * 4] << 16) | (im.data[p * 4 + 1] << 8) | im.data[p * 4 + 2];
		const seen = state[key];
		if (seen === 0) {
			state[key] = 1;
			colors++;
			singles++;
		} else if (seen === 1) {
			state[key] = 2;
			singles--;
		}
	}
	return { painted, colors, singles };
}

/**
 * Painted pixels a cell needs before it is judged. Scaled with the cell so a small, mostly transparent cell is not
 * rejected for being small, while an almost empty one still is: an eighth of the cell, never below the floor.
 */
export const minPainted = (im: Img) => Math.max(MIN_PAINTED_FLOOR, Math.floor((im.w * im.h) / 8));

/** Whether one cell's palette looks compressed or resampled rather than drawn. */
export function detectCompressedPalette(im: Img): boolean {
	const stats = paletteStats(im);
	return (
		stats.painted >= minPainted(im) &&
		stats.colors >= MIN_COLORS &&
		stats.singles >= MIN_SINGLES &&
		stats.singles / stats.colors >= SINGLE_SHARE
	);
}
