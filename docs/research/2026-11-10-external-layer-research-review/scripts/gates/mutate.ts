// Mutation tests: one direction's dressed keyframe AND all its posed frames get the same edit of their raw outputs; the
// production evaluation decides. Output: results.json + a summary table.
import { writeFileSync } from 'node:fs';
import { cases, evaluate, CH, I, type Case } from './pipe.ts';
import { stats, crossView } from './proto.ts';
type Img = { w: number; h: number; data: Uint8ClampedArray };
const OUT = '<SCRATCH>/gates/';
const clone = (im: Img): Img => ({ w: im.w, h: im.h, data: new Uint8ClampedArray(im.data) });
const sig = (m: string) => m.replace(/-?\d+(\.\d+)?/g, '#');
const code = (m: string) => (m.match(/\b(G\d+|H4|D\d|K1|R1|Occlusion)\b/) ?? ['?'])[0];

type Edit = (raw: Img, base: Img, mask: Uint8Array, ctx: { key: string; shift: number }) => Img;
const erase = (o: Img, base: Img, key: string, keep: (p: number) => boolean, mask: Uint8Array) => {
	const k = CH.toChroma(base, key), bg = o.data.slice(0, 4);
	for (let p = 0; p < mask.length; p++) if (mask[p] && !keep(p)) o.data.set(base.data[p * 4 + 3] ? k.data.subarray(p * 4, p * 4 + 4) : bg, p * 4);
	return o;
};
const bbox = (mask: Uint8Array, w: number) => { let y0 = Infinity, y1 = -1; for (let p = 0; p < mask.length; p++) if (mask[p]) { const y = (p / w) | 0; y0 = Math.min(y0, y); y1 = Math.max(y1, y); } return { y0, y1 }; };
const hue = (r: number, g: number, b: number, deg: number) => {
	// rotate in RGB around the gray axis (preserves luminance-ish and saturation)
	const a = (deg * Math.PI) / 180, c = Math.cos(a), s = Math.sin(a), k = (1 - c) / 3, q = Math.sqrt(1 / 3) * s;
	const m = [c + k, k - q, k + q, k + q, c + k, k - q, k - q, k + q, c + k];
	return [m[0] * r + m[1] * g + m[2] * b, m[3] * r + m[4] * g + m[5] * b, m[6] * r + m[7] * g + m[8] * b].map((v) => Math.max(0, Math.min(255, Math.round(v))));
};
const EDITS: Record<string, Edit> = {
	lower40: (raw, base, mask, { key }) => { const o = clone(raw), { y0, y1 } = bbox(mask, raw.w), cut = y1 - 0.4 * (y1 - y0 + 1); return erase(o, base, key, (p) => ((p / raw.w) | 0) <= cut, mask); },
	remove: (raw, base, mask, { key }) => erase(clone(raw), base, key, () => false, mask),
	recolor: (raw, _b, mask, { shift }) => { const o = clone(raw); for (let p = 0; p < mask.length; p++) if (mask[p]) o.data.set(hue(o.data[p * 4], o.data[p * 4 + 1], o.data[p * 4 + 2], shift), p * 4); return o; },
	top50: (raw, base, mask, { key }) => { const o = clone(raw), { y0, y1 } = bbox(mask, raw.w), cut = y0 + 0.5 * (y1 - y0 + 1); return erase(o, base, key, (p) => ((p / raw.w) | 0) >= cut, mask); },
	shrink: (raw, base, mask, { key }) => {
		const o = erase(clone(raw), base, key, () => false, mask), w = raw.w;
		let cx = 0, cy = 0, n = 0; for (let p = 0; p < mask.length; p++) if (mask[p]) { cx += p % w; cy += (p / w) | 0; n++; }
		cx /= n; cy /= n; const f = Math.SQRT2;
		for (let p = 0; p < mask.length; p++) {
			const x = Math.round(cx + ((p % w) - cx) * f), y = Math.round(cy + (((p / w) | 0) - cy) * f);
			if (x < 0 || y < 0 || x >= w || y >= raw.h) continue;
			const q = y * w + x; if (mask[q]) o.data.set(raw.data.subarray(q * 4, q * 4 + 4), p * 4);
		}
		return o;
	}
};
const GARMENT = ['a-chest', 'b-tunic', 'a-cape', 'b-cloak', 'n-cloak128', 'a-hair'];
const HEADISH = ['a-helmet', 'b-greathelm', 'c-greathelm', 'b-jester-blue', 'a-hair', 'a-cape', 'b-cloak', 'n-cloak128'];
const plan: { mut: string; ids: (c: Case) => boolean; dirs: (d: string) => boolean }[] = [
	{ mut: 'lower40', ids: (c) => GARMENT.includes(c.id), dirs: () => true },
	{ mut: 'remove', ids: () => true, dirs: () => true },
	{ mut: 'recolor', ids: () => true, dirs: () => true },
	{ mut: 'top50', ids: (c) => HEADISH.includes(c.id), dirs: (d) => d.startsWith('north') },
	{ mut: 'shrink', ids: () => true, dirs: () => true }
];
const rows: any[] = [], baselines: any[] = [];
for (const c of cases.filter((c) => c.clips.length && c.id !== 'b-jester')) {
	const base = await evaluate(c), masks = new Map<string, Uint8Array>();
	for (const x of base.kf) masks.set(x.key, x.mask);
	for (const x of base.cells) if (!x.key.startsWith('default/')) masks.set(x.key, x.mask);
	const before = new Set([...base.g1, ...base.fails, ...base.warnings].map(sig));
	const protoBase = crossView(stats(base.keys, base.bodies, c.pad));
	baselines.push({ case: c.id, slot: c.slot, clean: base.clean, stats: stats(base.keys, base.bodies, c.pad) });
	const posedArea = (ev: any, d: string) => ev.cells.filter((x: any) => x.key.split('/')[1] === d && !x.key.startsWith('default/')).reduce((s: number, x: any) => s + x.area, 0);
	for (const d of Object.keys(base.keys)) {
		// recolor shift: the rotation whose recolored keyframe leans least toward the key
		const km = masks.get(`rest/${d}/0`)!, raw0 = base.kf.find((x: any) => x.key === `rest/${d}/0`).out;
		const shift = [90, 180, 270].map((s) => { let n = 0; for (let p = 0; p < km.length; p++) if (km[p]) { const [r, g, b] = hue(raw0.data[p * 4], raw0.data[p * 4 + 1], raw0.data[p * 4 + 2], s); if (CH.keyScore(c.key, r, g, b) >= 20) n++; } return { s, n }; }).sort((a, b) => a.n - b.n)[0].s;
		for (const p of plan.filter((p) => p.ids(c) && p.dirs(d))) {
			const e = await evaluate(c, (raw, bse, key, dir) => {
				if (dir !== d) return undefined;
				const m = masks.get(key); if (!m || !m.some(Boolean)) return undefined;
				return EDITS[p.mut](raw, bse, m, { key: c.key, shift });
			});
			const msgs = [...e.g1.map((m) => ['hard', m]), ...e.fails.map((m) => ['hard', m]), ...e.warnings.map((m) => ['review', m])].filter(([, m]) => !before.has(sig(m)));
			const proto = crossView(stats(e.keys, e.bodies, c.pad));
			const kfArea = (ev: any) => ev.kf.find((x: any) => x.key === `rest/${d}/0`).area;
			rows.push({ case: c.id, slot: c.slot, mut: p.mut, dir: d, shift: p.mut === 'recolor' ? shift : undefined, baseClean: base.clean, clean: e.clean,
				kfArea: `${kfArea(base)}->${kfArea(e)}`, posedArea: `${posedArea(base, d)}->${posedArea(e, d)}`, stats: stats(e.keys, e.bodies, c.pad),
				magnitude: +I.paletteDistance([...new Set(Array.from({ length: base.keys[d].data.length / 4 }, (_, i) => base.keys[d].data[i*4+3] ? (base.keys[d].data[i*4] << 16) | (base.keys[d].data[i*4+1] << 8) | base.keys[d].data[i*4+2] : -1).filter((v) => v >= 0))], [e.keys[d]]).toFixed(1),
				hard: [...new Set(msgs.filter(([t]) => t === 'hard').map(([, m]) => code(m)))], review: [...new Set(msgs.filter(([t]) => t === 'review').map(([, m]) => code(m)))],
				sample: msgs.slice(0, 3).map(([, m]) => m.slice(0, 110)),
				proto: proto[d] ?? null, protoOther: Object.fromEntries(Object.entries(proto).filter(([k]) => k !== d && !protoBase[k])) });
		}
	}
	console.error('done', c.id);
}
writeFileSync(OUT + 'results.json', JSON.stringify(rows, null, 1));
writeFileSync(OUT + 'baselines.json', JSON.stringify(baselines, null, 1));
for (const r of rows) console.log([r.case, r.mut, r.dir, r.baseClean ? 'baseClean' : 'baseDirty', r.clean ? 'CLEAN' : '-', 'kf ' + r.kfArea, 'posed ' + r.posedArea, 'mag ' + r.magnitude, 'hard:' + r.hard.join(','), 'review:' + r.review.join(','), 'proto:' + (r.proto ? r.proto.join('|') : '-'), Object.keys(r.protoOther).length ? 'protoOther:' + JSON.stringify(r.protoOther) : ''].join('  '));
