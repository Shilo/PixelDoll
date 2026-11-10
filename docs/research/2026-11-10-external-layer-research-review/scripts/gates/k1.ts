// Task 4: a garment colored close to the KEY in one whole direction (keyframe + all posed frames of that direction).
// part: 'lower' = lower half of the item's rows; 'all' = the whole item. tone: 'key' scores ~70 (>= KT 35, keyed out as
// background), 'near' scores ~28 (NEAR_KEY 20 <= s < KT, kept; K1 counts it). Production evaluation decides.
import { cases, evaluate, CH } from './pipe.ts';
import { stats, crossView } from './proto.ts';
type Img = { w: number; h: number; data: Uint8ClampedArray };
const sig = (m: string) => m.replace(/-?\d+(\.\d+)?/g, '#');
const tone = (key: string, L: number, f: number) => {
	L = Math.max(90, L); const lo = Math.round(L * f);
	return key === 'green' ? [lo, L, lo] : key === 'magenta' ? [L, lo, L] : key === 'blue' ? [lo, lo, L] : [lo, L, L];
};
for (const id of ['b-cloak', 'b-tunic', 'a-chest', 'a-cape', 'n-cloak128']) {
	const c = cases.find((x) => x.id === id)!, base = await evaluate(c), masks = new Map<string, Uint8Array>();
	for (const x of base.kf) masks.set(x.key, x.mask);
	for (const x of base.cells) if (!x.key.startsWith('default/')) masks.set(x.key, x.mask);
	const before = new Set([...base.g1, ...base.fails, ...base.warnings].map(sig));
	for (const d of Object.keys(base.keys))
		for (const part of ['lower', 'all'])
			for (const [tn, f] of [['key', 0.3], ['near', 0.72]] as const) {
				let painted = 0, onBody = 0;
				const e = await evaluate(c, (raw, bse, key, dir) => {
					if (dir !== d) return undefined;
					const m = masks.get(key); if (!m) return undefined;
					const o: Img = { w: raw.w, h: raw.h, data: new Uint8ClampedArray(raw.data) };
					let y0 = 1e9, y1 = -1; for (let p = 0; p < m.length; p++) if (m[p]) { const y = (p / raw.w) | 0; y0 = Math.min(y0, y); y1 = Math.max(y1, y); }
					const cut = part === 'all' ? -1 : (y0 + y1) / 2;
					for (let p = 0; p < m.length; p++) if (m[p] && ((p / raw.w) | 0) > cut) {
						const L = Math.max(o.data[p * 4], o.data[p * 4 + 1], o.data[p * 4 + 2]);
						o.data.set(tone(c.key, L, f), p * 4);
						if (key === `rest/${d}/0`) { painted++; if (bse.data[p * 4 + 3]) onBody++; }
					}
					return o;
				});
				const kf0 = base.kf.find((x: any) => x.key === `rest/${d}/0`), kf1 = e.kf.find((x: any) => x.key === `rest/${d}/0`);
				const msgs = [...e.g1.map((m) => 'H:' + m), ...e.fails.map((m) => 'H:' + m), ...e.warnings.map((m) => 'R:' + m)].filter((m) => !before.has(sig(m.slice(2))));
				const codes = [...new Set(msgs.map((m) => m.slice(0, 2) + ((m.match(/\b(G\d+|H4|D\d|K1|R1)\b/) ?? ['?'])[0])))];
				const share = CH.nearKeyShare(kf1.out, kf1.mask, c.key);
				const pv = crossView(stats(e.keys, e.bodies, c.pad))[d];
				console.log(`${id.padEnd(11)} ${c.key.padEnd(7)} ${d.padEnd(10)} ${part.padEnd(5)} ${tn.padEnd(4)} painted ${painted} (on body ${painted ? Math.round((100 * onBody) / painted) : 0} %) kf area ${kf0.area}->${kf1.area} keyOut ${kf1.keyOutside?.toFixed(3)} near ${(share * 100).toFixed(0)} % ${e.clean ? 'CLEAN' : base.clean ? 'flagged' : 'base-dirty'} new:${codes.join(',') || '-'} proto:${pv ? pv.join('|') : '-'}`);
			}
}
