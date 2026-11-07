// Independent challenge of extraction candidates D (rim guard restore, CF1b) and E (despill keep-raw, CF2b), plus the
// skin-tone dependence of absorbOutline. Offline: production chroma functions only; research code builds cases and scores.
// Skin variants recolor only the warm skin px of a real bench body (outlines, shorts and hair untouched), preserving their
// luminance order, matching the Studio skin traits (Light ... Deep brown, studio/characterConfig.ts TRAITS.skin).
// Provider behavior is modeled with colors production already documents: olive 48,46,11 (S2 rim redraw, chroma.ts L87) and
// 27,40,4 (T3 dark key shade returned off-key, items.ts g2Fails comment). Ownership truth is by construction.
// Run from the repo root: node docs/research/2026-11-07-paperdoll-cycle/scripts/challenge/rim-despill-challenge.ts
import { readFileSync } from 'node:fs';
import { absorbOutline, chromaMask, components, despill, dropKeyOutline, keyScore, KT, toChroma, type Key } from '../../../../../app/src/lib/image/chroma.ts';
import { makeImg } from '../../../../../app/src/lib/image/png.ts';
import { rimGuardCF, despillCF } from '../extraction/counterfactuals.ts';
import { runPipe } from '../extraction/bench-replay.ts';
import { baseCell, clone, FIX, type Img } from '../extraction/lib.ts';
import { mkdirSync, writeFileSync } from 'node:fs';

const OUT = 'C:/Programming_Files/Shilocity/PixelLab/checkouts/cycle-2026-11-07/challenge';
mkdirSync(OUT, { recursive: true });
const lum = (c: ArrayLike<number>) => (0.299 * c[0] + 0.587 * c[1] + 0.114 * c[2]) / 255;
const hash = (p: number) => ((p * 2654435761) >>> 0) / 4294967296;

// ---------- skin variants ----------
const isSkin = (c: ArrayLike<number>) => c[0] > c[1] && c[1] > c[2] && c[0] - c[2] >= 40;
function skin(B: Img, light: number[], dark: number[]): Img {
  const o = clone(B), ls: number[] = [];
  for (let i = 0; i < B.data.length; i += 4) if (B.data[i + 3] && isSkin(B.data.subarray(i, i + 3))) ls.push(lum(B.data.subarray(i, i + 3)));
  const lo = Math.min(...ls), hi = Math.max(...ls);
  for (let i = 0; i < B.data.length; i += 4) if (B.data[i + 3] && isSkin(B.data.subarray(i, i + 3))) {
    const t = (lum(B.data.subarray(i, i + 3)) - lo) / (hi - lo || 1);
    o.data.set([0, 1, 2].map((j) => Math.round(dark[j] + t * (light[j] - dark[j]))), i);
  }
  return o;
}
const SKINS: Record<string, [number[], number[]] | null> = { light: null, medium: [[196, 136, 98], [112, 68, 48]], deep: [[124, 80, 56], [48, 28, 22]] };

// ---------- cases on body A south rest (64 px) and body N south rest (160 px) ----------
type Case = { id: string; C: Img; B: Img; item: Uint8Array; body: string; skin: string; redraw: string };
const BROWN = [112, 72, 40], GOLD = [222, 186, 64], RED = [150, 34, 38], SILVER = [178, 180, 192], BLACKLEATHER = [40, 34, 36];
function cases(bodyId: string, B0: Img): Case[] {
  const W = B0.w, H = B0.h, s = W / 64, out: Case[] = [];
  const ring = (B: Img, p: number) => { const x = p % W, y = (p / W) | 0; return [[x - 1, y], [x + 1, y], [x, y - 1], [x, y + 1]].some(([X, Y]) => X < 0 || Y < 0 || X >= W || Y >= H || !B.data[(Y * W + X) * 4 + 3]); };
  // body rows: find the waist line as the darkest interior row band of the original (outline) body between 60 % and 72 % height
  const op = (x: number, y: number) => B0.data[(y * W + x) * 4 + 3] > 0;
  const outlinePx = (p: number) => Math.max(B0.data[p * 4], B0.data[p * 4 + 1], B0.data[p * 4 + 2]) < 40;
  let waist = Math.round(42 * s), best = -1;
  for (let y = Math.round(0.6 * H); y <= Math.round(0.72 * H); y++) { let n = 0; for (let x = 0; x < W; x++) if (op(x, y) && outlinePx(y * W + x)) n++; if (n > best) { best = n; waist = y; } }
  const cx = Math.round(W / 2), half = Math.round(10 * s);
  const items: Record<string, (paint: (x: number, y: number, c: number[]) => void) => void> = {
    none: () => {},
    'belt-waistline': (pt) => { for (let x = cx - half; x <= cx + half; x++) if (op(x, waist)) pt(x, waist, BROWN); },
    'belt-waistline+buckle': (pt) => { for (let x = cx - half; x <= cx + half; x++) if (op(x, waist)) pt(x, waist, BROWN); for (const [dx, dy] of [[0, 0], [1, 0], [0, 1], [1, 1]]) pt(cx + dx, waist + dy, GOLD); },
    'belt-row38': (pt) => { const y = Math.round(38 * s); for (let x = cx - half; x <= cx + half; x++) if (op(x, y)) pt(x, y, BROWN); },
    'black-strap-row38': (pt) => { const y = Math.round(38 * s); for (let x = cx - half; x <= cx + half; x++) if (op(x, y)) pt(x, y, BLACKLEATHER); },
    necklace: (pt) => { const y = Math.round(28 * s); for (let x = cx - Math.round(6 * s); x <= cx + Math.round(5 * s); x++) if (op(x, y)) pt(x, y, SILVER); },
    baldric: (pt) => { for (let i = 0; i <= Math.round(14 * s); i++) pt(cx - Math.round(8 * s) + i, Math.round(30 * s) + i, BROWN); },
    // 1 px holes (body visible through a garment): every hole is body truth, so absorbOutline fills count as false items
    'holes-panel': (pt) => { for (let y = Math.round(29 * s); y <= Math.round(44 * s); y++) for (let x = cx - Math.round(7 * s); x <= cx + Math.round(7 * s); x++) if (op(x, y) && !((y - Math.round(29 * s)) % 2 === 1 && (x - cx) % 3 === 0)) pt(x, y, RED); },
    'mesh-panel': (pt) => { for (let y = Math.round(29 * s); y <= Math.round(41 * s); y++) for (let x = cx - Math.round(7 * s); x <= cx + Math.round(7 * s); x++) if (op(x, y) && (x + y) % 2) pt(x, y, RED); },
  };
  for (const [sk, ramp] of Object.entries(SKINS)) {
    const B = ramp ? skin(B0, ramp[0], ramp[1]) : B0;
    for (const [redraw, frac] of [['none', 0], ['rim olive 100%', 1], ['outline olive 50%', 0.5], ['outline olive 100%', 1], ['dark key -> 27,40,4 50%', 0.5]] as [string, number][])
      for (const [iname, paintAll] of Object.entries(items)) {
        const C = toChroma(B, 'green'), item = new Uint8Array(W * H);
        // provider mannequin redraws first (owner: body), then the item on top (owner: item)
        for (let p = 0; p < W * H; p++) {
          if (!B.data[p * 4 + 3] || hash(p) >= frac) continue;
          const kl = lum(C.data.subarray(p * 4, p * 4 + 3));
          if (redraw.startsWith('rim') && ring(B, p)) C.data.set([48, 46, 11, 255], p * 4);
          if (redraw.startsWith('outline') && !ring(B, p) && outlinePx(p)) C.data.set([48, 46, 11, 255], p * 4);
          if (redraw.startsWith('dark key') && !ring(B, p) && kl <= 0.22) C.data.set([27, 40, 4, 255], p * 4);
        }
        paintAll((x, y, c) => { C.data.set([...c, 255], (y * W + x) * 4); item[y * W + x] = 1; });
        out.push({ id: `${bodyId} ${sk} | ${redraw} | ${iname}`, C, B, item, body: bodyId, skin: sk, redraw });
      }
  }
  return out;
}

// ---------- rim guard variants ----------
const outlineLike = (c: ArrayLike<number>) => lum(c) < 0.22;
/** Reviewer alternative: restore a removed component when most of its px reuse (Chebyshev <= 8) a non-outline color the cell's
 * kept, non-candidate item px already draw. The provider's off-key mannequin redraws are dark (olive), and need a witness. */
function witnessGuard(mask: Uint8Array, B: Img, C: Img, key: Key): Uint8Array {
  const o = dropKeyOutline(mask, B, C, key), { w, h } = B, rem = mask.map((v, p) => (v && !o[p] ? 1 : 0)) as Uint8Array, pal: number[][] = [];
  const seen = new Set<string>();
  for (let p = 0; p < o.length; p++) if (o[p]) { const c = [...C.data.subarray(p * 4, p * 4 + 3)], k = c.join(); if (!seen.has(k) && !outlineLike(c)) { seen.add(k); pal.push(c); } }
  for (const comp of components(rem, w, h)) {
    const ok = comp.filter((p) => { const c = C.data.subarray(p * 4, p * 4 + 3); return !outlineLike(c) && pal.some((q) => Math.max(Math.abs(q[0] - c[0]), Math.abs(q[1] - c[1]), Math.abs(q[2] - c[2])) <= 8); }).length;
    if (ok * 2 >= comp.length) for (const p of comp) o[p] = 1;
  }
  return o;
}
/** Bridge rule alone: restore a removed component touching two or more separate kept item components (rimGuardCF without the chain rule). */
function bridgeOnly(mask: Uint8Array, B: Img, C: Img, key: Key): Uint8Array {
  const o = dropKeyOutline(mask, B, C, key), { w, h } = B, rem = mask.map((v, p) => (v && !o[p] ? 1 : 0)) as Uint8Array, label = new Int32Array(o.length).fill(-1);
  components(o, w, h).forEach((comp, i) => { for (const p of comp) label[p] = i; });
  const add = new Uint8Array(o.length);
  for (const comp of components(rem, w, h)) {
    const t = new Set<number>();
    for (const p of comp) for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) { const X = (p % w) + dx, Y = ((p / w) | 0) + dy; if (X >= 0 && Y >= 0 && X < w && Y < h && label[Y * w + X] >= 0) t.add(label[Y * w + X]); }
    if (t.size >= 2) for (const p of comp) add[p] = 1;
  }
  for (let p = 0; p < o.length; p++) if (add[p]) o[p] = 1;
  return o;
}
/** Own-color veto: of what `g` restores over production, keep only components that are not mostly outline-dark. */
const veto = (g: (m: Uint8Array, B: Img, C: Img, k: Key) => Uint8Array) => (mask: Uint8Array, B: Img, C: Img, key: Key): Uint8Array => {
  const a = dropKeyOutline(mask, B, C, key), b = g(mask, B, C, key), { w, h } = B, add = b.map((v, p) => (v && !a[p] ? 1 : 0)) as Uint8Array;
  for (const comp of components(add, w, h)) { const dark = comp.filter((p) => outlineLike(C.data.subarray(p * 4, p * 4 + 3))).length; if (dark * 2 <= comp.length) for (const p of comp) a[p] = 1; }
  return a;
};
/** Reviewer alternative 3: restore a removed component that has an interior (dark-clause) px, touches a kept item px, and is
 * not mostly outline-dark by its own color. Ring-only removals (the S2 rim redraws and gray rim specks) stay as production. */
function attachedInterior(mask: Uint8Array, B: Img, C: Img, key: Key): Uint8Array {
  const o = dropKeyOutline(mask, B, C, key), { w, h } = B, rem = mask.map((v, p) => (v && !o[p] ? 1 : 0)) as Uint8Array, add: number[] = [];
  const op = (X: number, Y: number) => X >= 0 && Y >= 0 && X < w && Y < h && B.data[(Y * w + X) * 4 + 3] > 0;
  for (const comp of components(rem, w, h)) {
    const interior = comp.some((p) => { const X = p % w, Y = (p / w) | 0; return op(X - 1, Y) && op(X + 1, Y) && op(X, Y - 1) && op(X, Y + 1); });
    const touches = comp.some((p) => { for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) { const X = (p % w) + dx, Y = ((p / w) | 0) + dy; if (X >= 0 && Y >= 0 && X < w && Y < h && o[Y * w + X]) return true; } return false; });
    const dark = comp.filter((p) => outlineLike(C.data.subarray(p * 4, p * 4 + 3))).length;
    if (interior && touches && dark * 2 < comp.length) add.push(...comp);
  }
  for (const p of add) o[p] = 1;
  return o;
}
const chainOnly = (m: Uint8Array, B: Img, C: Img, k: Key) => rimGuardCF(m, B, C, k, false);
const cf1bVeto = veto((m, B, C, k) => rimGuardCF(m, B, C, k, true));
const GUARDS: Record<string, (m: Uint8Array, B: Img, C: Img, k: Key) => Uint8Array> = {
  prod: (m, B, C, k) => dropKeyOutline(m, B, C, k),
  CF1b: (m, B, C, k) => rimGuardCF(m, B, C, k, true),
  'CF1b+veto': cf1bVeto,
  chain: chainOnly,
  'chain+veto': veto(chainOnly),
  bridge: bridgeOnly,
  'bridge+veto': veto(bridgeOnly),
  witness: witnessGuard,
  attachedInterior,
};
function layerWith(C: Img, key: Key, B: Img, guard: (m: Uint8Array, B: Img, C: Img, k: Key) => Uint8Array) {
  const m0 = absorbOutline(guard(chromaMask(C, key), B, C, key), B, C, key), mask = new Uint8Array(m0.length), L = makeImg(C.w, C.h);
  for (const comp of components(m0, C.w, C.h)) if (comp.length >= 2) for (const p of comp) { mask[p] = 1; L.data.set(C.data.subarray(p * 4, p * 4 + 4), p * 4); }
  return { layer: despill(L, key), mask };
}

const A = await baseCell('A', 'south', 'rest'), N = await baseCell('N', 'south', 'rest');
const all = [...cases('A', A), ...cases('N', N)];
const darkShare: Record<string, string> = {};
for (const [bid, B0] of [['A', A], ['N', N]] as const) for (const [sk, ramp] of Object.entries(SKINS)) {
  const B = ramp ? skin(B0, ramp[0], ramp[1]) : B0, K = toChroma(B, 'green');
  let op = 0, dark = 0, darkKey = 0;
  for (let p = 0; p < B.w * B.h; p++) if (B.data[p * 4 + 3]) { op++; if ((B.data[p * 4] + B.data[p * 4 + 1] + B.data[p * 4 + 2]) / 3 < 60) dark++; if (lum(K.data.subarray(p * 4, p * 4 + 3)) <= 0.3) darkKey++; }
  darkShare[`${bid} ${sk}`] = `base mean<60: ${(100 * dark / op).toFixed(1)} %, keyed lum<=0.3 (absorbOutline-eligible): ${(100 * darkKey / op).toFixed(1)} %`;
}
const rows: Record<string, string | number>[] = [];
const agg: Record<string, Record<string, { kept: number; truth: number; fp: number }>> = {};
for (const c of all) {
  const truth = c.item.reduce((a, b) => a + b, 0), row: Record<string, string | number> = { case: c.id, truth };
  for (const [g, fn] of Object.entries(GUARDS)) {
    const r = layerWith(c.C, 'green', c.B, fn);
    let kept = 0, fp = 0;
    for (let p = 0; p < r.mask.length; p++) { if (r.mask[p] && c.item[p]) kept++; if (r.mask[p] && !c.item[p]) fp++; }
    row[g] = `${kept}/${fp}`;
    const k = `${c.body} ${c.skin} | ${c.redraw}`;
    const a = ((agg[k] ??= {})[g] ??= { kept: 0, truth: 0, fp: 0 }); a.kept += kept; a.truth += truth; a.fp += fp;
  }
  rows.push(row);
}

// ---------- real corpus: px each variant adds over production; overlap with the bench's independent drop/keep labels ----------
const benchCases = JSON.parse(readFileSync(new URL('cases.json', FIX), 'utf8')).filter((c: { role?: string; key: string }) => !c.role && c.key !== 'none');
const corpus: Record<string, Record<string, number>> = {}, cf2bColors: Record<string, Record<string, number>> = {};
const chroma3 = (c: ArrayLike<number>) => Math.max(c[0], c[1], c[2]) - Math.min(c[0], c[1], c[2]);
/** CF2b, except where production's partial despill left the px near-gray (chroma < 16): steel and outlines stay neutral. */
function cf2c(L: Img, key: Key): Img {
  const P = despill(L, key), Q = despillCF(L, key, true), o = { w: L.w, h: L.h, data: new Uint8ClampedArray(Q.data) };
  for (let i = 0; i < o.data.length; i += 4) if (chroma3(P.data.subarray(i, i + 3)) < 16) o.data.set(P.data.subarray(i, i + 4), i);
  return o;
}
for (const bc of benchCases) {
  const key = bc.key as Key, run = await runPipe(bc), drop = new Map<string, Set<number>>(), keep = new Map<string, Set<number>>();
  for (const [lab, m] of [['drop', drop], ['keep', keep]] as const) for (const [k, runs] of Object.entries((bc[lab] ?? {}) as Record<string, number[][]>)) { const s = new Set<number>(); for (const [st, len] of runs) for (let p = st; p < st + len; p++) s.add(p); m.set(k, s); }
  const row: Record<string, number> = {};
  for (const x of [...run.kf, ...run.cells]) {
    const m1 = chromaMask(x.out, key), a = dropKeyOutline(m1, x.base, x.out, key);
    for (const g of ['CF1b', 'CF1b+veto', 'chain', 'bridge', 'bridge+veto', 'witness', 'attachedInterior']) {
      const b = GUARDS[g](m1, x.base, x.out, key);
      for (let p = 0; p < a.length; p++) if (b[p] && !a[p]) { row[`${g} added`] = (row[`${g} added`] ?? 0) + 1; if (drop.get(x.key)?.has(p)) row[`${g} onDropLabel`] = (row[`${g} onDropLabel`] ?? 0) + 1; }
      for (let p = 0; p < a.length; p++) if (keep.get(x.key)?.has(p) && m1[p] && !a[p] && b[p]) row[`${g} keepRestored`] = (row[`${g} keepRestored`] ?? 0) + 1;
    }
    for (let p = 0; p < a.length; p++) if (keep.get(x.key)?.has(p) && m1[p] && !a[p]) row['prod keepLabelRemovedByGuard'] = (row['prod keepLabelRemovedByGuard'] ?? 0) + 1;
    // shipped item px on the silhouette ring that are olive-dark (the S2 redraw family): survivors of the guard
    const { w, h } = x.base, opq = (X: number, Y: number) => X >= 0 && Y >= 0 && X < w && Y < h && x.base.data[(Y * w + X) * 4 + 3] > 0;
    for (let p = 0; p < x.mask.length; p++) {
      if (!x.mask[p] || !x.base.data[p * 4 + 3]) continue;
      const X = p % w, Y = (p / w) | 0, c = x.out.data.subarray(p * 4, p * 4 + 3);
      const ringPx = !(opq(X - 1, Y) && opq(X + 1, Y) && opq(X, Y - 1) && opq(X, Y + 1));
      if (ringPx && lum(c) < 0.22 && Math.abs(c[0] - c[1]) <= 16 && Math.min(c[0], c[1]) - c[2] >= 20) row['shipped olive ring px'] = (row['shipped olive ring px'] ?? 0) + 1;
    }
    // CF2c: CF2b restricted to px whose production despill result is not near-gray (production's steel-stays-gray rule)
    const L = makeImg(x.out.w, x.out.h); for (let p = 0; p < x.mask.length; p++) if (x.mask[p]) L.data.set(x.out.data.subarray(p * 4, p * 4 + 4), p * 4);
    const P = despill(L, key), Q = despillCF(L, key, true), R2 = cf2c(L, key);
    for (let i = 0; i < P.data.length; i += 4) {
      const dq = P.data[i] !== Q.data[i] || P.data[i + 1] !== Q.data[i + 1] || P.data[i + 2] !== Q.data[i + 2], dr = P.data[i] !== R2.data[i] || P.data[i + 1] !== R2.data[i + 1] || P.data[i + 2] !== R2.data[i + 2];
      if (dq) { row['CF2b changed'] = (row['CF2b changed'] ?? 0) + 1; const c = [...Q.data.subarray(i, i + 3)].join(); (cf2bColors[bc.id] ??= {})[c] = ((cf2bColors[bc.id] ??= {})[c] ?? 0) + 1; }
      if (dr) row['CF2c changed'] = (row['CF2c changed'] ?? 0) + 1;
    }
  }
  if (Object.keys(row).length) corpus[bc.id] = row;
}

// ---------- E: despill on constructed layers with known intent ----------
// A red item (core 150,34,38 / 110,24,28 / 70,16,20 outline) plus test px; truth = what the provider intended.
const tests: [string, number[], number[]][] = [
  ['gray steel outline lightly tinted', [40, 52, 40], [40, 40, 40]],
  ['mid steel tinted', [120, 136, 120], [120, 120, 120]],
  ['dark fold, tinted gray', [52, 68, 50], [52, 52, 50]],
  ['50 % blend red + key mid', [85, 108, 31], RED],
  ['25 % blend red + key dark (absorbed fold)', [40, 62, 12], [110, 24, 28]],
  ['olive outline redraw kept as item', [48, 46, 11], [48, 46, 11]],
  ['T3 olive 27,40,4', [27, 40, 4], [27, 40, 4]],
  ['turquoise gear', [64, 224, 208], [64, 224, 208]],
  ['fern gear mid', [79, 121, 66], [79, 121, 66]],
  ['olive-drab gear', [85, 107, 47], [85, 107, 47]],
];
const E: Record<string, unknown>[] = [];
for (const [name, raw, intent] of tests) {
  const L = makeImg(5, 1);
  [[150, 34, 38], [110, 24, 28], [70, 16, 20], [178, 180, 192], raw].forEach((c, i) => L.data.set([...c, 255], i * 4));
  const P = despill(L, 'green'), Q = despillCF(L, 'green', true), R2 = cf2c(L, 'green'), got = (im: Img) => [...im.data.subarray(16, 19)];
  const t = (c: number[]) => { const ex = c[1] - Math.max(c[0], c[2]); return ex >= 5 ? +((100 * ex) / Math.max(c[1], 1)).toFixed(0) : 0; };
  const err = (c: number[]) => Math.max(...[0, 1, 2].map((j) => Math.abs(c[j] - intent[j])));
  E.push({ case: name, raw: raw.join(), score: keyScore('green', raw[0], raw[1], raw[2]), prod: got(P).join(), prodTint: t(got(P)), prodErr: err(got(P)), CF2b: got(Q).join(), cf2bTint: t(got(Q)), cf2bErr: err(got(Q)), CF2c: got(R2).join(), cf2cErr: err(got(R2)) });
}

const summary = Object.fromEntries(Object.entries(agg).map(([k, v]) => [k, Object.fromEntries(Object.entries(v).map(([g, a]) => [g, `kept ${a.kept}/${a.truth}, false ${a.fp}`]))]));
writeFileSync(`${OUT}/rim-despill-challenge.json`, JSON.stringify({ darkShare, summary, rows, corpus, cf2bColors, E }, null, 1));
console.log(JSON.stringify({ darkShare, summary, corpus, cf2bColors }, null, 1));
console.table(E);
console.table(rows.filter((r) => String(r.case).startsWith('A ')));
void KT;
