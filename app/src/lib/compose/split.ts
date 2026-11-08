// fg/bg split for wrap-around items (architecture §3.4): fg = layer ∩ base opaque, bg = the rest.
// Drawing bg → base → fg reproduces base + layer exactly [S1 E5].
import { components } from '../image/chroma.ts';
import { makeImg, type Img } from '../image/png.ts';

/** Reach of a strand's edge past the body outline: 3 px at 80 px (live 2026-11-07, every hidden edge px in east and north was
 *  within 3 px of the strand, the south hair seen between arm and torso 4 to 5 px away), scaled with the cell, at least 2. */
export const strandEdge = (w: number) => Math.max(2, Math.round((w * 3) / 80));

/** `frontBelow` (a pixel-edge y, the neck; used for hair): an fg piece reaching below it lies in front of the body (a strand
 *  over the chest or down the back facing the viewer), and off-body px within `strandEdge` of it go to fg too. Body alpha
 *  cannot tell a strand's edge just past the outline from hair behind the body, so without this, worn layers wider than the
 *  body (pauldrons, a flared back plate) cover the outer pixels of a strand drawn over them a pixel away. Farther off-body hair
 *  (a back mass beside the shoulders, hair seen between arm and torso) and hair covering only the head (it falls behind the
 *  body) stay behind, so pauldrons, collars, beards and an upright staff still cover them. Moved pixels are off the body, so
 *  recomposition stays exact. */
export function splitFgBg(layer: Img, base: Img, frontBelow?: number): { fg: Img; bg: Img } {
	const fg = makeImg(layer.w, layer.h),
		bg = makeImg(layer.w, layer.h);
	for (let i = 0; i < layer.data.length; i += 4)
		if (layer.data[i + 3]) (base.data[i + 3] ? fg : bg).data.set(layer.data.subarray(i, i + 4), i);
	if (frontBelow == null) return { fg, bg };
	const { w, h } = layer,
		r = strandEdge(w),
		on = new Uint8Array(w * h),
		near = new Uint8Array(w * h);
	for (let p = 0; p < on.length; p++) on[p] = fg.data[p * 4 + 3] ? 1 : 0;
	for (const piece of components(on, w, h)) {
		if (!piece.some((p) => Math.floor(p / w) + 0.5 > frontBelow)) continue;
		for (const p of piece) {
			const x = p % w,
				y = (p / w) | 0;
			for (let ny = Math.max(0, y - r); ny <= Math.min(h - 1, y + r); ny++)
				near.fill(1, ny * w + Math.max(0, x - r), ny * w + Math.min(w - 1, x + r) + 1);
		}
	}
	for (let p = 0; p < near.length; p++)
		if (near[p] && bg.data[p * 4 + 3]) {
			fg.data.set(bg.data.subarray(p * 4, p * 4 + 4), p * 4);
			bg.data.fill(0, p * 4, p * 4 + 4);
		}
	return { fg, bg };
}

export function selfTest() {
	const base: Img = {
		w: 3,
		h: 1,
		data: new Uint8ClampedArray([0, 0, 0, 0, 9, 9, 9, 255, 0, 0, 0, 0])
	};
	const layer: Img = {
		w: 3,
		h: 1,
		data: new Uint8ClampedArray([1, 1, 1, 255, 2, 2, 2, 255, 0, 0, 0, 0])
	};
	const { fg, bg } = splitFgBg(layer, base);
	console.assert(fg.data.join() === '0,0,0,0,2,2,2,255,0,0,0,0', 'fg = layer on base');
	console.assert(bg.data.join() === '1,1,1,255,0,0,0,0,0,0,0,0', 'bg = layer off base');
}
