// Prototype cross-direction check on dressed keyframes (0 gens). Each drawn view is compared with the OTHER drawn views of
// the same dress, after normalizing by that view's own standing body (side views are narrower, so raw areas are not compared).
// A view is judged against its NEAREST other view (as D1 compares with the least gray other view), so one legit outlier pair
// (a cape seen from the front vs from behind) needs only one similar sibling to pass.
import { I } from './pipe.ts';
type Img = { w: number; h: number; data: Uint8ClampedArray };
export interface ViewStat { dir: string; area: number; share: number; top: number; bottom: number; pal: number }
const colors = (im: Img) => { const s = new Set<number>(); for (let i = 0; i < im.data.length; i += 4) if (im.data[i + 3]) s.add((im.data[i] << 16) | (im.data[i + 1] << 8) | im.data[i + 2]); return s; };
export function stats(keys: Record<string, Img>, bodies: Record<string, Img>, pad = 0): ViewStat[] {
	const dirs = Object.keys(keys);
	return dirs.map((d) => {
		const L = keys[d], B = I.padImg(bodies[d], pad);
		let bTop = Infinity, bBot = -1, bArea = 0, area = 0, top = Infinity, bottom = -1;
		for (let p = 0; p < L.w * L.h; p++) {
			const y = (p / L.w) | 0;
			if (B.data[p * 4 + 3]) { bArea++; bTop = Math.min(bTop, y); bBot = Math.max(bBot, y); }
			if (L.data[p * 4 + 3]) { area++; top = Math.min(top, y); bottom = Math.max(bottom, y); }
		}
		const H = bBot - bTop + 1;
		const others = new Set<number>(); for (const o of dirs) if (o !== d) for (const c of colors(keys[o])) others.add(c);
		return { dir: d, area, share: area / bArea, top: area ? (top - bTop) / H : NaN, bottom: area ? (bottom + 1 - bTop) / H : NaN, pal: +I.paletteDistance([...others], [L]).toFixed(1) };
	});
}
export interface Rule { shrink: number; extent: number; pal: number }
export const RULE: Rule = { shrink: 0.6, extent: 0.15, pal: 15 };
/** Reasons per view; a view needs >= 2 other drawn views (as D1). Nearest-sibling comparison. */
export function crossView(s: ViewStat[], r: Rule = RULE): Record<string, string[]> {
	const drawn = s.filter((v) => v.area > 0), out: Record<string, string[]> = {};
	if (drawn.length < 3) return out;
	for (const v of drawn) {
		const o = drawn.filter((x) => x !== v), why: string[] = [];
		const maxShare = Math.max(...o.map((x) => x.share));
		// smaller than EVERY other view by the factor (relative to its own body)
		if (v.share < r.shrink * Math.min(...o.map((x) => x.share))) why.push(`area ${(v.share / Math.min(...o.map((x) => x.share))).toFixed(2)}`);
		void maxShare;
		const db = Math.min(...o.map((x) => Math.abs(x.bottom - v.bottom))), dt = Math.min(...o.map((x) => Math.abs(x.top - v.top)));
		if (db > r.extent) why.push(`bottom ${db.toFixed(2)}`);
		if (dt > r.extent) why.push(`top ${dt.toFixed(2)}`);
		if (v.pal > r.pal) why.push(`palette ${v.pal}`);
		if (why.length) out[v.dir] = why;
	}
	return out;
}
