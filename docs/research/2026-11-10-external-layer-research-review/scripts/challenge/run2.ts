import { realEval } from './real.ts';
import { evaluate, cases, CH } from '../gates/pipe.ts';
type Img = { w: number; h: number; data: Uint8ClampedArray };
const clone = (im: Img): Img => ({ w: im.w, h: im.h, data: new Uint8ClampedArray(im.data) });
const erase = (o: Img, base: Img, key: string, keep: (p: number) => boolean, mask: Uint8Array) => {
	const k = CH.toChroma(base, key), bg = o.data.slice(0, 4);
	for (let p = 0; p < mask.length; p++) if (mask[p] && !keep(p)) o.data.set(base.data[p * 4 + 3] ? k.data.subarray(p * 4, p * 4 + 4) : bg, p * 4);
	return o;
};
const bbox = (mask: Uint8Array, w: number) => { let y0 = Infinity, y1 = -1; for (let p = 0; p < mask.length; p++) if (mask[p]) { const y = (p / w) | 0; y0 = Math.min(y0, y); y1 = Math.max(y1, y); } return { y0, y1 }; };
const hue = (r: number, g: number, b: number, deg: number) => { const a = (deg * Math.PI) / 180, c = Math.cos(a), s = Math.sin(a), k = (1 - c) / 3, q = Math.sqrt(1 / 3) * s;
	const m = [c + k, k - q, k + q, k + q, c + k, k - q, k - q, k + q, c + k];
	return [m[0] * r + m[1] * g + m[2] * b, m[3] * r + m[4] * g + m[5] * b, m[6] * r + m[7] * g + m[8] * b].map((v) => Math.max(0, Math.min(255, Math.round(v)))); };
const tone = (key: string, L: number, f: number) => { L = Math.max(90, L); const lo = Math.round(L * f); return key === 'green' ? [lo, L, lo] : key === 'magenta' ? [L, lo, L] : key === 'blue' ? [lo, lo, L] : [lo, L, L]; };
const E: Record<string, (raw: Img, base: Img, m: Uint8Array, key: string) => Img> = {
	lower40: (raw, base, m, key) => { const { y0, y1 } = bbox(m, raw.w), cut = y1 - 0.4 * (y1 - y0 + 1); return erase(clone(raw), base, key, (p) => ((p / raw.w) | 0) <= cut, m); },
	top50: (raw, base, m, key) => { const { y0, y1 } = bbox(m, raw.w), cut = y0 + 0.5 * (y1 - y0 + 1); return erase(clone(raw), base, key, (p) => ((p / raw.w) | 0) >= cut, m); },
	recolor180: (raw, _b, m) => { const o = clone(raw); for (let p = 0; p < m.length; p++) if (m[p]) o.data.set(hue(o.data[p * 4], o.data[p * 4 + 1], o.data[p * 4 + 2], 180), p * 4); return o; },
	lowerKey: (raw, _b, m, key) => { const o = clone(raw), { y0, y1 } = bbox(m, raw.w), cut = (y0 + y1) / 2;
		for (let p = 0; p < m.length; p++) if (m[p] && ((p / raw.w) | 0) > cut) { const L = Math.max(o.data[p * 4], o.data[p * 4 + 1], o.data[p * 4 + 2]); o.data.set(tone(key, L, 0.3), p * 4); } return o; }
};
const plan: [string, string, string][] = (process.argv[2] ? JSON.parse(process.argv[2]) : [
	['b-tunic', 'lower40', 'south'], ['b-tunic', 'lower40', 'east'], ['a-chest', 'lowerKey', 'south'], ['a-chest', 'lowerKey', 'east'],
	['b-cloak', 'top50', 'north'], ['b-tunic', 'recolor180', 'south'], ['a-chest', 'lower40', 'north']]);
for (const [id, mut, d] of plan) {
	const c = cases.find((x) => x.id === id)!, base = await evaluate(c), masks = new Map<string, Uint8Array>();
	for (const x of base.kf) masks.set(x.key, x.mask);
	for (const x of base.cells) if (!x.key.startsWith('default/')) masks.set(x.key, x.mask);
	const before = await realEval(id);
	let touched = 0;
	const after = await realEval(id, (raw, bse, key, dir) => { if (dir !== d) return undefined; const m = masks.get(key); if (!m || !m.some(Boolean)) return undefined; touched++; return E[mut](raw, bse, m, c.key); });
	const kf = (r: any) => r.res.cells.filter((x: any) => x.key === `default/${d}/0`).map((x: any) => x.area)[0];
	const posed = (r: any) => r.res.cells.filter((x: any) => x.key.split('/')[1] === d && !x.key.startsWith('default/')).reduce((s: number, x: any) => s + x.area, 0);
	const q = after.res.qa;
	console.log(`${id} ${mut} ${d}: touched ${touched} frames; default-cell area ${kf(before)}->${kf(after)}, posed area ${posed(before)}->${posed(after)}; baseline clean ${before.clean}; MUTATED clean ${after.clean} status ${q?.qa.status} g1 ${JSON.stringify([...after.res.g1.values()])} fails ${JSON.stringify([...(q?.failCalls.values() ?? [])].flat().slice(0, 3))} warn ${JSON.stringify(q?.warnings.slice(0, 4))}`);
}
