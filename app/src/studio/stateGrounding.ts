import { makeImg, type Img } from '../lib/image/png.ts';
import { opaqueBox } from '../lib/rig/normalize.ts';

/** Conservative starting thresholds: when in doubt the view is left exactly as PixelLab returned it. */
const SOLID = 128;
const FOOT_ROWS = 4;
const LEG_ROWS = 8;
/** Share of the source's foot soles (bottom edges) that must land on bottom edges in the generated view. */
const SOLES = 0.6;
/** The best offset must beat every other offset's sole match by this much. */
const MARGIN = 0.25;
/** Shares of the source's feet and of its legs above them that must also line up at that offset. */
const SHAPE = 0.6;
const MIN_RUN = 3;
const MAX_UNMATCHED_BELOW = 4;

type Mask = (x: number, y: number) => boolean;

/** Solid pixels that touch another solid pixel; isolated specks never count as feet. */
function solid(image: Img): Mask {
	const at = (x: number, y: number) =>
		x >= 0 &&
		y >= 0 &&
		x < image.w &&
		y < image.h &&
		image.data[(y * image.w + x) * 4 + 3] >= SOLID;
	return (x, y) => {
		if (!at(x, y)) return false;
		for (let dy = -1; dy <= 1; dy++)
			for (let dx = -1; dx <= 1; dx++) if ((dx || dy) && at(x + dx, y + dy)) return true;
		return false;
	};
}

function points(mask: Mask, w: number, top: number, bottom: number) {
	const out: [number, number][] = [];
	for (let y = Math.max(0, top); y <= bottom; y++)
		for (let x = 0; x < w; x++) if (mask(x, y)) out.push([x, y]);
	return out;
}

/** Share of `from` found in `to` when moved down by `dy`. */
function overlap(from: readonly [number, number][], to: Mask, dy: number) {
	if (!from.length) return 0;
	let hits = 0;
	for (const [x, y] of from) if (to(x, y + dy)) hits++;
	return hits / from.length;
}

/**
 * The vertical move that puts a generated State view's feet back where the source's are, or 0 when that cannot be
 * established. Image edits can return the character shifted in its cell (measured: 9 px high), which would make the
 * State float and misalign equipment, but a jump, sit or prop can also change the lowest pixels on purpose. So the
 * move is only proposed when the source's feet and lower legs are found in the generated view at exactly one offset,
 * matched both ways, with nothing substantial left below the feet and nothing pushed out of the cell. Never resizes
 * or moves sideways.
 */
export function groundingShift(generated: Img, source: Img): number {
	if (generated.w !== source.w || generated.h !== source.h) return 0;
	const was = solid(source);
	const now = solid(generated);
	const w = source.w;
	let sole = -1;
	for (let y = source.h - 1; y >= 0 && sole < 0; y--)
		for (let x = 0; x < w; x++) if (was(x, y)) sole = y;
	if (sole < 0) return 0;
	let run = 0;
	let longest = 0;
	for (let x = 0; x < w; x++) {
		run = was(x, sole) ? run + 1 : 0;
		longest = Math.max(longest, run);
	}
	if (longest < MIN_RUN) return 0;
	const feet = points(was, w, sole - FOOT_ROWS - 1, sole);
	const legs = points(was, w, sole - FOOT_ROWS - LEG_ROWS + 1, sole - FOOT_ROWS);
	// Bottom edges pin the height: straight legs match at many heights, but soles only at one.
	const soles = feet.filter(([x, y]) => !was(x, y + 1));
	const range = Math.round(source.h * 0.15);
	let best = 0;
	let bestScore = -1;
	let runnerUp = -1;
	for (let dy = -range; dy <= range; dy++) {
		let hits = 0;
		for (const [x, y] of soles) if (now(x, y + dy) && !now(x, y + dy + 1)) hits++;
		const score = hits / soles.length;
		if (score > bestScore) {
			runnerUp = bestScore;
			bestScore = score;
			best = dy;
		} else runnerUp = Math.max(runnerUp, score);
	}
	// One clear answer only: a weak, contested or "already in place" match leaves the view alone.
	if (
		!best ||
		bestScore < SOLES ||
		bestScore - runnerUp < MARGIN ||
		overlap(feet, now, best) < SHAPE ||
		overlap(legs, now, best) < SHAPE
	)
		return 0;
	const shift = -best;
	let below = 0;
	for (const [, y] of points(now, w, sole - shift + 1, generated.h - 1))
		if (y > sole - shift) below++;
	if (below > MAX_UNMATCHED_BELOW) return 0;
	const box = opaqueBox(generated);
	if (!box || box.y0 + shift < 0 || box.y1 + shift >= generated.h) return 0;
	return shift;
}

/** A lossless whole-row move of the view by `shift` rows (positive is down). */
export function shiftRows(image: Img, shift: number): Img {
	if (!shift) return image;
	const out = makeImg(image.w, image.h);
	const row = image.w * 4;
	for (let y = 0; y < image.h; y++) {
		const to = y + shift;
		if (to >= 0 && to < image.h)
			out.data.set(image.data.subarray(y * row, (y + 1) * row), to * row);
	}
	return out;
}

/** The view with its feet put back on the source's, when that match is certain; otherwise unchanged. */
export function groundToSource(generated: Img, source: Img): { image: Img; shift: number } {
	const shift = groundingShift(generated, source);
	return { image: shiftRows(generated, shift), shift };
}
