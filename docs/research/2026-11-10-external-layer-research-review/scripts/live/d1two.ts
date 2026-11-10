// Offline: "foreign share" cross-view check and a foreign-only D1 variant. 0 PixelLab calls.
// node --experimental-transform-types --import ./register.mjs foreign.ts
import { readFileSync, writeFileSync } from 'node:fs';
import { cases, evaluate, PNG } from './pipe.ts';
// D1 and helpers from HEAD (the worktree has another session's uncommitted D1 edits)
const I = await import('file:///<SCRATCH>/live/fs/head/app/src/lib/items/items.ts');
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

// ---------- two-view excuse variant ----------
const colorsOf = (L: Img) => { const s = new Set<number>(); for (let i = 0; i < L.data.length; i += 4) if (L.data[i + 3]) s.add((L.data[i] << 16) | (L.data[i + 1] << 8) | L.data[i + 2]); return [...s]; };
/** grayShare where a near-gray px is excused only if >= 2 other drawn views each hold a color within Chebyshev tol */
function twoViewGrayShare(L: Img, otherSets: number[][], tol = 16) {
	const memo = new Map<number, boolean>(), sat: number[] = [];
	let counted = 0;
	const dark = (x: number, y: number) => { if (x < 0 || y < 0 || x >= L.w || y >= L.h) return false; const q = (y * L.w + x) * 4; return !!L.data[q + 3] && Math.max(L.data[q], L.data[q + 1], L.data[q + 2]) < 48; };
	for (let i = 0; i < L.data.length; i += 4) {
		if (!L.data[i + 3]) continue;
		const r = L.data[i], g = L.data[i + 1], b = L.data[i + 2], M = Math.max(r, g, b), m = Math.min(r, g, b), p = i / 4, x = p % L.w, y = (p / L.w) | 0;
		let s: number | null = null;
		if (M >= 48) s = (M - m) / M;
		else if ([-1, 0, 1].every((dy) => [-1, 0, 1].every((dx) => dark(x + dx, y + dy)))) s = M ? (M - m) / M : 0;
		if (s == null) continue;
		sat.push(s);
		if (s >= 0.25) continue;
		const c = (r << 16) | (g << 8) | b;
		let ex = memo.get(c);
		if (ex == null) memo.set(c, (ex = otherSets.filter((set) => set.some((o) => cheb(c, o) <= tol)).length >= 2));
		if (!ex) counted++;
	}
	const med = [...sat].sort((a, b) => a - b), md = med.length ? (med[(med.length - 1) >> 1] + med[med.length >> 1]) / 2 : 0;
	return sat.length && md >= 0.4 ? counted / sat.length : 0;
}
function d1Two(slot: string, prompt: string, layers: Img[]): boolean[] {
	const drawn = layers.map(hasPx), sets = layers.map((l) => (hasPx(l) ? colorsOf(l) : []));
	const share = layers.map((l, i) => {
		if (!drawn[i]) return 0;
		const others = sets.filter((_, j) => j !== i && drawn[j]);
		return others.length >= 2 ? twoViewGrayShare(l, others) : I.grayShare(l);
	});
	return layers.map((l, i) => {
		if (!drawn[i] || !I.designGraySmudges(slot, prompt, l)) return false; // production exemptions + raw share > 5 %
		const others = share.filter((_, j) => j !== i && drawn[j]);
		return share[i] > I.DESIGN.gray && (others.length < 2 || share[i] - Math.min(...others) > I.DESIGN.gray);
	});
}
const U16 = VARIANTS.find((v) => v.name === 'cheb16 p0')!, U24 = VARIANTS.find((v) => v.name === 'cheb24 p0')!;
const RULES: Record<string, (s: string, p: string, L: Img[]) => boolean[]> = {
	prod: (s, p, L) => I.smudgedViews(s, p, L).map((x) => x === 'smudge'),
	prodAny: (s, p, L) => I.smudgedViews(s, p, L).map((x) => !!x),
	union16: (s, p, L) => d1Variant(s, p, L, U16),
	union24: (s, p, L) => d1Variant(s, p, L, U24),
	two16: (s, p, L) => d1Two(s, p, L)
};
// pair smudges: the same smudge in 2 views of one item
const pairs: Set_[] = [];
for (const s of sets.filter((x) => x.group === 'bench'))
	for (let a = 0; a < s.dirs.length; a++) for (let b = a + 1; b < s.dirs.length; b++) {
		if (!hasPx(s.layers[a]) || !hasPx(s.layers[b])) continue;
		pairs.push({ group: s.dirs.length === 5 ? 'pair-of-5' : 'pair-of-3', id: `${s.id}~smudge@${s.dirs[a]}+${s.dirs[b]}`, slot: s.slot, prompt: s.prompt, dirs: s.dirs, layers: s.layers.map((l, j) => (j === a || j === b ? MUT.smudge(l) : l)), bad: s.dirs.map((_, j) => j === a || j === b) });
	}
const R: any = {};
for (const [n, f] of Object.entries(RULES)) {
	const r: any = { liveFlags: [], benchFlags: [], targets: [], single: [0, 0, []], pair3: [0, 0], pair5: [0, 0], pairSiblingFlags: 0 };
	for (const s of sets) {
		const v = f(s.slot, s.prompt, s.layers);
		v.forEach((x, i) => {
			const k = `${s.id}/${s.dirs[i]}`;
			if (s.group.startsWith('live') && x) r.liveFlags.push(k);
			if (s.group === 'bench' && x) r.benchFlags.push(k);
			if (s.group === 'mut-smudge' && s.bad[i]) { r.single[1]++; if (x) { r.single[0]++; r.single[2].push(s.id); } }
		});
	}
	for (const s of pairs) {
		const v = f(s.slot, s.prompt, s.layers), key = s.group === 'pair-of-5' ? 'pair5' : 'pair3';
		v.forEach((x, i) => { if (s.bad[i]) { r[key][1]++; if (x) r[key][0]++; } else if (x) r.pairSiblingFlags++; });
	}
	for (const t of d1Targets) { const v = f(t.slot, t.prompt, t.layers); r.targets.push([t.id, JSON.stringify(v) === JSON.stringify(t.expect) ? 'PASS' : 'FAIL ' + JSON.stringify(v)]); }
	R[n] = r;
}
const lost24 = R.prod.single[2].filter((id: string) => !R.union24.single[2].includes(id));
console.log(JSON.stringify(Object.fromEntries(Object.entries<any>(R).map(([n, r]) => [n, { live: r.liveFlags, bench: r.benchFlags, targets: r.targets.map((t: any) => t[1]), single: `${r.single[0]}/${r.single[1]}`, pair3: r.pair3.join('/'), pair5: r.pair5.join('/'), pairSibling: r.pairSiblingFlags }])), null, 1));
console.log('lost under union24 vs prod:', lost24, '\n two16 catches:', lost24.filter((id: string) => R.two16.single[2].includes(id)), '\n union16 catches:', lost24.filter((id: string) => R.union16.single[2].includes(id)));
console.log('prod catches not two16:', R.prod.single[2].filter((id: string) => !R.two16.single[2].includes(id)), ' two16 not prod:', R.two16.single[2].filter((id: string) => !R.prod.single[2].includes(id)));
writeFileSync(LIVE + 'd1-twoview-results.json', JSON.stringify({ R, lost24 }, null, 1));
