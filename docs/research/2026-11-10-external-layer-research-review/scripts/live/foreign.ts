// Offline: "foreign share" cross-view check and a foreign-only D1 variant. 0 PixelLab calls.
// node --experimental-transform-types --import ./register.mjs foreign.ts
import { readFileSync, writeFileSync } from 'node:fs';
import { cases, evaluate, I, PNG } from './pipe.ts';
type Img = { w: number; h: number; data: Uint8ClampedArray };
const APP = '<REPO>/app/';
const LIVE = APP + 'test-results-crossview/';
const HERE = '<SCRATCH>/live/fs/';

// ---------- color helpers ----------
const lin = (c: number) => { c /= 255; return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4; };
const okCache = new Map<number, number[]>();
const oklab = (c: number) => {
	let v = okCache.get(c);
	if (v) return v;
	const r = lin(c >> 16), g = lin((c >> 8) & 255), b = lin(c & 255);
	const l = Math.cbrt(0.4122214708 * r + 0.5363325363 * g + 0.0514459929 * b), m = Math.cbrt(0.2119034982 * r + 0.6806995451 * g + 0.1073969566 * b), s = Math.cbrt(0.0883024619 * r + 0.2817188376 * g + 0.6299787005 * b);
	v = [0.2104542553 * l + 0.793617785 * m - 0.0040720468 * s, 1.9779984951 * l - 2.428592205 * m + 0.4505937099 * s, 0.0259040371 * l + 0.7827717662 * m - 0.808675766 * s];
	okCache.set(c, v);
	return v;
};
const cheb = (a: number, b: number) => Math.max(Math.abs((a >> 16) - (b >> 16)), Math.abs(((a >> 8) & 255) - ((b >> 8) & 255)), Math.abs((a & 255) - (b & 255)));
const dE = (a: number, b: number) => { const x = oklab(a), y = oklab(b); return Math.hypot(x[0] - y[0], x[1] - y[1], x[2] - y[2]); };
const mx = (c: number) => Math.max(c >> 16, (c >> 8) & 255, c & 255);
const NEAR_BLACK = 48;
type Variant = { name: string; p: number; tol: number; dist: (a: number, b: number) => number };
const VARIANTS: Variant[] = [];
for (const p of [0, 0.5, 1, 2]) {
	for (const tol of [16, 24, 32]) VARIANTS.push({ name: `cheb${tol} p${p}`, p, tol, dist: cheb });
	for (const tol of [0.05, 0.08]) VARIANTS.push({ name: `okΔE${tol} p${p}`, p, tol, dist: dE });
}

/** color -> px count of a layer (alpha > 0), optionally skipping near-black line art */
const hist = (L: Img, skipDark = true) => {
	const h = new Map<number, number>();
	for (let i = 0; i < L.data.length; i += 4) {
		if (!L.data[i + 3]) continue;
		const c = (L.data[i] << 16) | (L.data[i + 1] << 8) | L.data[i + 2];
		if (skipDark && mx(c) < NEAR_BLACK) continue;
		h.set(c, (h.get(c) ?? 0) + 1);
	}
	return h;
};
const refOf = (others: Img[], p: number, skipDark = true) => {
	const h = new Map<number, number>();
	let n = 0;
	for (const o of others) for (const [c, k] of hist(o, skipDark)) { h.set(c, (h.get(c) ?? 0) + k); n += k; }
	return [...h].filter(([, k]) => (k / n) * 100 >= p).map(([c]) => c);
};
const isForeign = (c: number, ref: number[], v: Variant, memo: Map<number, boolean>) => {
	let f = memo.get(c);
	if (f == null) memo.set(c, (f = !ref.some((r) => v.dist(c, r) <= v.tol)));
	return f;
};
/** share of V's (non-near-black) item px whose color has no close match in the other views' >= p % colors */
function foreignShare(views: Img[], i: number, v: Variant) {
	const ref = refOf(views.filter((_, j) => j !== i && hasPx(views[j])), v.p), memo = new Map<number, boolean>();
	let n = 0, f = 0;
	for (const [c, k] of hist(views[i])) { n += k; if (isForeign(c, ref, v, memo)) f += k; }
	return n ? f / n : 0;
}
const hasPx = (L: Img) => L.data.some((x, i) => i % 4 === 3 && x > 0);

// ---------- D1 variant: grayShare counting only foreign near-gray px (same median and dark-patch rules) ----------
function foreignGrayShare(L: Img, ref: number[], v: Variant) {
	const memo = new Map<number, boolean>(), sat: number[] = [];
	let grayForeign = 0;
	const dark = (x: number, y: number) => { if (x < 0 || y < 0 || x >= L.w || y >= L.h) return false; const q = (y * L.w + x) * 4; return !!L.data[q + 3] && Math.max(L.data[q], L.data[q + 1], L.data[q + 2]) < 48; };
	for (let i = 0; i < L.data.length; i += 4) {
		if (!L.data[i + 3]) continue;
		const r = L.data[i], g = L.data[i + 1], b = L.data[i + 2], M = Math.max(r, g, b), m = Math.min(r, g, b), p = i / 4, x = p % L.w, y = (p / L.w) | 0;
		let s: number | null = null;
		if (M >= 48) s = (M - m) / M;
		else if ([-1, 0, 1].every((dy) => [-1, 0, 1].every((dx) => dark(x + dx, y + dy)))) s = M ? (M - m) / M : 0;
		if (s == null) continue;
		sat.push(s);
		if (s < 0.25 && isForeign((r << 16) | (g << 8) | b, ref, v, memo)) grayForeign++;
	}
	const med = [...sat].sort((a, b) => a - b), md = med.length ? (med[(med.length - 1) >> 1] + med[med.length >> 1]) / 2 : 0;
	return sat.length && md >= 0.4 ? grayForeign / sat.length : 0;
}
/** smudgedViews structure (GRAYISH exemption, face glyph exemption, compare with the lowest other share) on the foreign gray share.
 *  Ref includes near-black colors here, so a dark blotch matches only another view's dark color. Smudge/dark split not kept. */
function d1Variant(slot: string, prompt: string, layers: Img[], v: Variant): boolean[] {
	const drawn = layers.map(hasPx);
	const share = layers.map((l, i) => (drawn[i] ? foreignGrayShare(l, refOf(layers.filter((_, j) => j !== i && drawn[j]), v.p, false), v) : 0));
	return layers.map((l, i) => {
		if (!drawn[i] || I.GRAYISH.test(prompt)) return false;
		if (!I.designGraySmudges(slot, prompt, l)) return false; // production pre-condition (exemptions, raw share > 5 %)
		const others = share.filter((_, j) => j !== i && drawn[j]);
		return share[i] > I.DESIGN.gray && (others.length < 2 || share[i] - Math.min(...others) > I.DESIGN.gray);
	});
}

// ---------- data sets ----------
type Set_ = { group: string; id: string; slot: string; prompt: string; dirs: string[]; layers: Img[]; bad: boolean[]; badWhy?: string[] };
const sets: Set_[] = [];
const dec = async (p: string) => PNG.decodePngBytes(new Uint8Array(readFileSync(p)));
// 1. live
const labels = JSON.parse(readFileSync(LIVE + 'labels.json', 'utf8')).labels, jobs = JSON.parse(readFileSync(LIVE + 'jobs.json', 'utf8'));
for (const j of jobs) {
	const dirs = j.body === 'B' ? ['south', 'south-east', 'east', 'north-east', 'north'] : ['south', 'east', 'north'];
	sets.push({ group: 'live-' + j.group, id: j.id, slot: j.slot, prompt: j.prompt, dirs, layers: await Promise.all(dirs.map((d) => dec(`${LIVE}calls/${j.id}/layer_${d}.png`))), bad: dirs.map((d) => labels[`${j.id}/${d}`].label !== 'OK') });
}
// 2. bench (non-held, real evaluate keyframes) + synthetic mutations on one view's keyframe layer
const hue = (r: number, g: number, b: number, deg: number) => {
	const a = (deg * Math.PI) / 180, c = Math.cos(a), s = Math.sin(a), k = (1 - c) / 3, q = Math.sqrt(1 / 3) * s;
	const m = [c + k, k - q, k + q, k + q, c + k, k - q, k - q, k + q, c + k];
	return [m[0] * r + m[1] * g + m[2] * b, m[3] * r + m[4] * g + m[5] * b, m[6] * r + m[7] * g + m[8] * b].map((v) => Math.max(0, Math.min(255, Math.round(v))));
};
const clone = (im: Img): Img => ({ w: im.w, h: im.h, data: new Uint8ClampedArray(im.data) });
const MUT: Record<string, (L: Img) => Img> = {
	hue90: (L) => { const o = clone(L); for (let i = 0; i < o.data.length; i += 4) if (o.data[i + 3]) o.data.set(hue(o.data[i], o.data[i + 1], o.data[i + 2], 90), i); return o; },
	hue180: (L) => { const o = clone(L); for (let i = 0; i < o.data.length; i += 4) if (o.data[i + 3]) o.data.set(hue(o.data[i], o.data[i + 1], o.data[i + 2], 180), i); return o; },
	// mild recolor like the live cape back: desaturate halfway toward the pixel's own luma
	desat50: (L) => { const o = clone(L); for (let i = 0; i < o.data.length; i += 4) if (o.data[i + 3]) { const y = 0.3 * o.data[i] + 0.59 * o.data[i + 1] + 0.11 * o.data[i + 2]; for (let k = 0; k < 3; k++) o.data[i + k] = Math.round((o.data[i + k] + y) / 2); } return o; },
	grayscale: (L) => { const o = clone(L); for (let i = 0; i < o.data.length; i += 4) if (o.data[i + 3]) { const y = Math.round(0.3 * o.data[i] + 0.59 * o.data[i + 1] + 0.11 * o.data[i + 2]); o.data[i] = o.data[i + 1] = o.data[i + 2] = y; } return o; },
	// T3-style hem smudge: the lowest 25 % of the item's rows painted (71,64,58) except near-black line art
	smudge: (L) => {
		const o = clone(L); let y0 = 1e9, y1 = -1;
		for (let p = 0; p < L.w * L.h; p++) if (L.data[p * 4 + 3]) { const y = (p / L.w) | 0; y0 = Math.min(y0, y); y1 = Math.max(y1, y); }
		const cut = y1 - 0.25 * (y1 - y0 + 1);
		for (let p = 0; p < L.w * L.h; p++) if (L.data[p * 4 + 3] && (p / L.w | 0) > cut && Math.max(L.data[p * 4], L.data[p * 4 + 1], L.data[p * 4 + 2]) >= 48) o.data.set([71, 64, 58, 255], p * 4);
		return o;
	}
};
for (const c of cases.filter((c) => c.clips.length && c.id !== 'b-jester' && I.slotOf(c.slot).class !== 'held')) {
	const e = await evaluate(c), dirs = Object.keys(e.keys), layers = dirs.map((d) => e.keys[d]);
	const prompt = ({ 'a-helmet': 'a knight helmet', 'a-cape': 'a red cape', 'a-chest': 'chest armor', 'a-boots': 'leather boots', 'a-hair': 'long hair', 'b-tunic': 'a tunic', 'b-cloak': 'a cloak', 'b-greathelm': 'a great helm', 'b-jester-blue': 'a jester hat', 'n-cloak128': 'a cloak', 'c-greathelm': 'a great helm' } as Record<string, string>)[c.id] ?? c.id;
	sets.push({ group: 'bench', id: c.id, slot: c.slot, prompt, dirs, layers, bad: dirs.map(() => false) });
	for (const [m, f] of Object.entries(MUT))
		dirs.forEach((d, i) => { if (hasPx(layers[i])) sets.push({ group: 'mut-' + m, id: `${c.id}~${m}@${d}`, slot: c.slot, prompt, dirs, layers: layers.map((l, j) => (j === i ? f(l) : l)), bad: dirs.map((_, j) => j === i) }); });
}
// 3. D1 regression targets
const fx = JSON.parse(readFileSync(APP + 'test/fixtures/helmet-occlusion.json', 'utf8'));
const decRuns = (im: { w: number; h: number; runs: number[][] }) => { const o: Img = { w: im.w, h: im.h, data: new Uint8ClampedArray(im.w * im.h * 4) }; for (const [s, n, ...rgba] of im.runs) for (let p = s; p < s + n; p++) o.data.set(rgba, p * 4); return o; };
const d1Targets: { id: string; slot: string; prompt: string; layers: Img[]; expect: boolean[] }[] = [
	{ id: 'T3 cape keys (helmet-occlusion.json)', slot: 'back', prompt: 'a red cape', layers: ['south', 'east', 'north'].map((d) => decRuns(fx.capeKeys[d])), expect: [false, false, true] }
];
const wv = (gray: number) => { const im: Img = { w: 32, h: 32, data: new Uint8ClampedArray(32 * 32 * 4) }; for (let p = 0; p < 200; p++) im.data.set(p < gray ? [225, 222, 215, 255] : [190, 40, 45, 255], p * 4); return im; };
d1Targets.push({ id: 'word-lists: skull emblem in every view', slot: 'head', prompt: 'red pirate hat with a skull emblem', layers: [wv(18), wv(16), wv(20)], expect: [false, false, false] });
d1Targets.push({ id: 'word-lists: smudge in one view (T3 shape)', slot: 'back', prompt: 'a red cape', layers: [wv(0), wv(0), wv(26)], expect: [false, false, true] });
d1Targets.push({ id: 'word-lists: single drawn view', slot: 'back', prompt: 'a red cape', layers: [wv(26), { w: 32, h: 32, data: new Uint8ClampedArray(32 * 32 * 4) }], expect: [true, false] });

// ---------- evaluate ----------
const out: any = { variants: {} };
for (const v of VARIANTS) {
	const vals: { group: string; key: string; bad: boolean; fs: number }[] = [];
	for (const s of sets) s.layers.forEach((_, i) => { if (hasPx(s.layers[i])) vals.push({ group: s.group, key: `${s.id}/${s.dirs[i]}`, bad: s.bad[i], fs: foreignShare(s.layers, i, v) }); });
	const by = (pred: (x: (typeof vals)[0]) => boolean) => vals.filter(pred);
	const maxOf = (a: typeof vals) => a.reduce((m, x) => (x.fs > m.fs ? x : m), { fs: -1, key: '-' } as any);
	const liveOK = by((x) => x.group.startsWith('live') && !x.bad), liveBad = by((x) => x.group.startsWith('live') && x.bad);
	const benchOK = by((x) => (x.group === 'bench' || x.group.startsWith('mut-')) && !x.bad);
	const mut = (m: string) => by((x) => x.group === 'mut-' + m && x.bad);
	const liveA = by((x) => x.group === 'live-A');
	const thr = (t: number) => ({ t, liveOKflag: liveOK.filter((x) => x.fs > t).length, liveA: liveA.filter((x) => x.fs > t).length, liveBad: liveBad.filter((x) => x.fs > t).length, benchOKflag: benchOK.filter((x) => x.fs > t).length, ...Object.fromEntries(Object.keys(MUT).map((m) => [m, mut(m).filter((x) => x.fs > t).length])) });
	out.variants[v.name] = {
		maxLiveOK: [maxOf(liveOK).key, +maxOf(liveOK).fs.toFixed(3)], maxBenchOK: [maxOf(benchOK).key, +maxOf(benchOK).fs.toFixed(3)],
		liveBad: liveBad.map((x) => [x.key, +x.fs.toFixed(3)]),
		counts: { liveOK: liveOK.length, liveA: liveA.length, benchOK: benchOK.length, ...Object.fromEntries(Object.keys(MUT).map((m) => [m, mut(m).length])) },
		sweep: [0.02, 0.05, 0.1, 0.15, 0.2, 0.3].map(thr),
		maxBenchClean: (() => { const a = by((x) => x.group === 'bench'); const m = maxOf(a); return [m.key, +m.fs.toFixed(3), a.length]; })(),
		benchCleanTop: by((x) => x.group === 'bench').sort((a, b) => b.fs - a.fs).slice(0, 4).map((x) => [x.key, +x.fs.toFixed(3)]),
		mutRecall: Object.fromEntries([0.1, 0.2, 0.27, 0.3].map((t) => [t, Object.fromEntries(Object.keys(MUT).map((m) => [m, `${mut(m).filter((x) => x.fs > t).length}/${mut(m).length}`]))])),
		siblingFlags: Object.fromEntries([0.27, 0.3].map((t) => [t, by((x) => x.group.startsWith('mut-') && !x.bad && x.fs > t).length + '/' + by((x) => x.group.startsWith('mut-') && !x.bad).length])),
		topLiveOK: [...liveOK].sort((a, b) => b.fs - a.fs).slice(0, 5).map((x) => [x.key, +x.fs.toFixed(3)])
	};
	// D1 variant
	const d1: any = { live: [], targets: [], benchOKflags: [], smudgeRecall: 0, smudgeN: 0, prodSmudgeRecall: 0 };
	for (const s of sets) {
		const vv = d1Variant(s.slot, s.prompt, s.layers, v), prod = I.smudgedViews(s.slot, s.prompt, s.layers);
		s.layers.forEach((_, i) => {
			const key = `${s.id}/${s.dirs[i]}`;
			if (s.group.startsWith('live') && (vv[i] || prod[i])) d1.live.push([key, `prod ${prod[i]}`, `variant ${vv[i]}`]);
			if ((s.group === 'bench' || s.group.startsWith('mut-')) && !s.bad[i] && vv[i]) d1.benchOKflags.push(key);
			if (s.group === 'mut-smudge' && s.bad[i]) { d1.smudgeN++; if (vv[i]) d1.smudgeRecall++; if (prod[i] === 'smudge') d1.prodSmudgeRecall++; }
		});
	}
	for (const t of d1Targets) { const r = d1Variant(t.slot, t.prompt, t.layers, v); d1.targets.push([t.id, JSON.stringify(r) === JSON.stringify(t.expect) ? 'PASS' : 'FAIL', r]); }
	out.variants[v.name].d1 = d1;
	console.error('variant', v.name);
}
writeFileSync(HERE + 'foreign-results.json', JSON.stringify(out, null, 1));
writeFileSync(LIVE + 'foreign-results.json', JSON.stringify(out, null, 1));
for (const [n, r] of Object.entries<any>(out.variants))
	console.log(n.padEnd(14), 'benchClean', r.maxBenchClean.join(' '), '| mut@0.27', JSON.stringify(r.mutRecall['0.27']), '| mut@0.1', JSON.stringify(r.mutRecall['0.1']), '| sib', JSON.stringify(r.siblingFlags), '| maxLiveOK', r.maxLiveOK.join(' '), '| maxBenchOK', r.maxBenchOK.join(' '), '| liveBad', r.liveBad.map((x: any) => x[1]).join(','), '| D1 targets', r.d1.targets.map((t: any) => t[1]).join(','), '| D1 live', r.d1.live.map((x: any) => x.join(' ')).join('; '), '| D1 benchOK flags', r.d1.benchOKflags.length, `| smudge recall ${r.d1.smudgeRecall}/${r.d1.smudgeN} (prod ${r.d1.prodSmudgeRecall})`);
