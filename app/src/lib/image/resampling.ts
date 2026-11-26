// Compressed or resampled imports. Pixel art keeps a small palette whose colors repeat; JPEG-style damage and smooth
// rescales leave many colors that appear exactly once. Measured on the standing cells, the artwork every direction
// shares, and always only a warning: the import is kept as is. Pixels the importer will discard (alpha below the
// binarization threshold) are excluded, because their blended RGB is not part of the imported art; graded alpha has its
// own warning (import.warning.semiAlpha).
import type { Img } from './png.ts';

/** Matches the alpha cutoff `normalize` uses when it binarizes an imported cell. */
export const ALPHA_THRESHOLD = 128;
/** Below this many painted pixels a cell is too small to judge: a small icon can legitimately use many colors once each. */
export const MIN_PAINTED = 1024;
/** A compressed palette needs a real palette behind it; a handful of colors is never a compression signature. */
export const MIN_COLORS = 64;
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
 * Count distinct and single-use colors over a 24-bit palette. The state table is one byte per RGB value (16 MB), reused
 * across the cells of one import, so a large sheet costs bounded memory instead of one map entry per pixel.
 */
export function pooledPaletteStats(ims: readonly Img[], threshold = ALPHA_THRESHOLD): PaletteStats {
	const state = new Uint8Array(1 << 24);
	let painted = 0,
		colors = 0,
		singles = 0;
	for (const im of ims) {
		state.fill(0); // each cell is judged on its own palette: a color used once per direction is still a one-off
		for (let p = 0; p < im.w * im.h; p++) {
			if (im.data[p * 4 + 3] < threshold) continue;
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
	}
	return { painted, colors, singles };
}

export const paletteStats = (im: Img, threshold = ALPHA_THRESHOLD): PaletteStats =>
	pooledPaletteStats([im], threshold);

/** Whether these counts look compressed or resampled rather than drawn. */
export const looksCompressed = (stats: PaletteStats): boolean =>
	stats.painted >= MIN_PAINTED &&
	stats.colors >= MIN_COLORS &&
	stats.singles >= MIN_SINGLES &&
	stats.singles / stats.colors >= SINGLE_SHARE;

/** One cell's verdict; imports pool their directions first (see pooledPaletteStats). */
export const detectCompressedPalette = (im: Img): boolean => looksCompressed(paletteStats(im));
