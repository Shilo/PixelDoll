// Integer upscale detector for imported artwork. A nearest-neighbor upscale repeats every source pixel over an s x s block, so
// the strong pixel-boundary positions on each axis fall on one mod-s lattice. Ported from the tested prototype in
// docs/research/2026-11-10-external-layer-research-review/scripts/imports/detector.part.ts (integer part only; nothing is
// rescaled). Native pixel art scores about 1/s per axis and a plain rectangle has too few edges to prove a lattice.
import type { Img } from './png.ts';

const MIN_FIT = 0.8;
const MIN_LINES = 6;

const px = (im: Img, x: number, y: number) =>
	im.data.subarray((y * im.w + x) * 4, (y * im.w + x) * 4 + 4);

/** votes[x] counts scan lines with a strong, locally maximal edge between x - 1 and x. */
function edgeVotes(im: Img, threshold = 32) {
	const vx = new Float64Array(im.w + 1),
		vy = new Float64Array(im.h + 1);
	const step = (a: Uint8ClampedArray, b: Uint8ClampedArray) => {
		const both = a[3] >= 128 && b[3] >= 128 ? 1 : 0;
		return Math.max(
			Math.abs(a[0] - b[0]) * both,
			Math.abs(a[1] - b[1]) * both,
			Math.abs(a[2] - b[2]) * both,
			Math.abs(a[3] - b[3])
		);
	};
	const scan = (
		lines: number,
		length: number,
		at: (line: number, k: number) => Uint8ClampedArray,
		out: Float64Array
	) => {
		for (let line = 0; line < lines; line++) {
			const diff = new Float64Array(length + 1);
			for (let k = 1; k < length; k++) diff[k] = step(at(line, k - 1), at(line, k));
			// Non-max suppression keeps one position per blurred edge.
			for (let k = 1; k < length; k++)
				if (diff[k] >= threshold && diff[k] >= diff[k - 1] && diff[k] > diff[k + 1]) out[k]++;
		}
	};
	scan(im.h, im.w, (y, x) => px(im, x, y), vx);
	scan(im.w, im.h, (x, y) => px(im, x, y), vy);
	return { vx, vy };
}

/** Best share of an axis's votes that fits one line of an s-wide lattice, and the distinct lattice positions that hold them. */
function axisFit(votes: Float64Array, scale: number) {
	let total = 0;
	for (let i = 0; i < votes.length; i++) total += votes[i];
	if (!total) return { fit: 0, lines: 0 };
	let best = { fit: 0, lines: 0 };
	for (let phase = 0; phase < scale; phase++) {
		let on = 0,
			lines = 0;
		for (let x = phase; x < votes.length; x += scale)
			if (votes[x]) {
				on += votes[x];
				lines++;
			}
		if (on / total > best.fit) best = { fit: on / total, lines };
	}
	return best;
}

/** Integer upscale factor of pixel art, or 1 when the edges do not fit a common lattice on both axes. */
export function detectUpscale(im: Img): number {
	const limit = Math.min(16, Math.floor(Math.min(im.w, im.h) / 8));
	if (limit < 2) return 1;
	const { vx, vy } = edgeVotes(im);
	let scale = 1;
	for (let s = 2; s <= limit; s++) {
		const x = axisFit(vx, s),
			y = axisFit(vy, s);
		if (x.fit >= MIN_FIT && y.fit >= MIN_FIT && x.lines >= MIN_LINES && y.lines >= MIN_LINES)
			scale = s;
	}
	return scale;
}
