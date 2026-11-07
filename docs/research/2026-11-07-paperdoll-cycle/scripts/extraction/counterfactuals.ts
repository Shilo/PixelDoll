// Offline counterfactuals for the three ranked candidates, each a thin wrapper around the production function (never a copy):
//  CF1 rim guard: restore a dropKeyOutline-removed 8-connected component of >= CHAIN px that has an interior (non-ring) px,
//      or (CF1b, with `bridge`) one that touches two or more separate kept item components (its removal splits the item).
//  CF2 despill: where production despill produced a color that is not one of the layer's clean colors (no snap) and the raw px
//      does not score as key, keep the raw RGB. CF2b additionally requires a real key excess (0 < keyScore, i.e. excess >= 12,
//      the same floor keyScore uses), so weakly tinted dark outlines stay neutralized as in production.
//  CF3 key-collision witness: key-scoring px far from the key family {s * ramp(t)} (s in [0.3, 1]); warn per cell at >= N px.
// Each is scored on the synthetic ground-truth cases (synthetic-mutations.ts) and on the real corpus (bench-replay.ts), where
// any change is a potential regression to inspect.
import { readFileSync } from 'node:fs';
import { absorbOutline, chromaMask, components, despill, dropKeyOutline, keyScore, KT, toChroma, type Key } from '../../../../../app/src/lib/image/chroma.ts';
import { makeImg } from '../../../../../app/src/lib/image/png.ts';
import { runPipe } from './bench-replay.ts';
import { cases as synth } from './synthetic-mutations.ts';
import { FIX, saveJson, type Img } from './lib.ts';

const CHAIN = 6, FAR = 32, WARN = 12;
export function rimGuardCF(mask: Uint8Array, B: Img, C: Img, key: Key, bridge = false): Uint8Array {
  const o = dropKeyOutline(mask, B, C, key), { w, h } = B, rem = mask.map((v, p) => (v && !o[p] ? 1 : 0)) as Uint8Array;
  const op = (X: number, Y: number) => X >= 0 && Y >= 0 && X < w && Y < h && B.data[(Y * w + X) * 4 + 3] > 0;
  const label = new Int32Array(o.length).fill(-1);
  components(o, w, h).forEach((comp, i) => { for (const p of comp) label[p] = i; });
  for (const comp of components(rem, w, h)) {
    const chain = comp.length >= CHAIN && comp.some((p) => { const X = p % w, Y = (p / w) | 0; return op(X - 1, Y) && op(X + 1, Y) && op(X, Y - 1) && op(X, Y + 1); });
    const touched = new Set<number>();
    if (bridge) for (const p of comp) for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) { const X = (p % w) + dx, Y = ((p / w) | 0) + dy; if (X >= 0 && Y >= 0 && X < w && Y < h && label[Y * w + X] >= 0) touched.add(label[Y * w + X]); }
    if (chain || touched.size >= 2) for (const p of comp) o[p] = 1;
  }
  return o;
}
export function despillCF(L: Img, key: Key, strong = false): Img {
  const o = despill(L, key), core = new Set<string>();
  for (let i = 0; i < L.data.length; i += 4) if (L.data[i + 3] && o.data[i] === L.data[i] && o.data[i + 1] === L.data[i + 1] && o.data[i + 2] === L.data[i + 2]) core.add(`${L.data[i]},${L.data[i + 1]},${L.data[i + 2]}`);
  for (let i = 0; i < L.data.length; i += 4) {
    if (!L.data[i + 3]) continue;
    const got = `${o.data[i]},${o.data[i + 1]},${o.data[i + 2]}`;
    const s = keyScore(key, L.data[i], L.data[i + 1], L.data[i + 2]);
    if (!core.has(got) && s < KT && (!strong || s > 0)) o.data.set(L.data.subarray(i, i + 3), i);
  }
  return o;
}
const family = (() => {
  const out: Record<string, number[][]> = {};
  for (const key of ['green', 'magenta', 'blue', 'azure'] as Key[]) {
    const g = makeImg(256, 1); for (let i = 0; i < 256; i++) g.data.set([i, i, i, 255], i * 4);
    const k = toChroma(g, key), cols: number[][] = [];
    for (let i = 0; i < 256; i += 4) for (let s = 0.3; s <= 1.0001; s += 0.05) cols.push([0, 1, 2].map((j) => k.data[i * 4 + j] * s));
    out[key] = cols;
  }
  return out;
})();
export const familyDist = (key: Key, r: number, g: number, b: number) => { let d = 1e9; for (const c of family[key]) d = Math.min(d, Math.max(Math.abs(c[0] - r), Math.abs(c[1] - g), Math.abs(c[2] - b))); return d; };
const farCount = (C: Img, key: Key, B?: Img) => { let n = 0; for (let p = 0; p < C.w * C.h; p++) { const i = p * 4; if (C.data[i + 3] >= 128 && (!B || B.data[i + 3]) && keyScore(key, C.data[i], C.data[i + 1], C.data[i + 2]) >= KT && familyDist(key, C.data[i], C.data[i + 1], C.data[i + 2]) > FAR) n++; } return n; };

/** Production chromaLayer with the rim guard swapped (CF1) and/or despill swapped (CF2); same minPx = 2. */
function layerWith(C: Img, key: Key, B: Img, cf1: boolean | 'bridge', cf2: boolean | 'strong') {
  const m1 = chromaMask(C, key), m0 = absorbOutline(cf1 ? rimGuardCF(m1, B, C, key, cf1 === 'bridge') : dropKeyOutline(m1, B, C, key), B, C, key);
  const mask = new Uint8Array(m0.length), L = makeImg(C.w, C.h);
  for (const comp of components(m0, C.w, C.h)) if (comp.length >= 2) for (const p of comp) { mask[p] = 1; L.data.set(C.data.subarray(p * 4, p * 4 + 4), p * 4); }
  return { layer: cf2 ? despillCF(L, key, cf2 === 'strong') : despill(L, key), mask };
}

if (import.meta.main) {
const synthRows = synth.map((c) => {
  const base = c.body ?? synth[0].body ?? undefined;
  const B = c.body ?? (globalThis as unknown as { __B?: Img }).__B;
  void base; void B;
  return c;
});
void synthRows;
const { B: BA } = await import('./synthetic-mutations.ts');
const rowsS: Record<string, unknown>[] = [];
for (const c of synth) {
  const B = c.body ?? BA, n = c.item.reduce((a, b) => a + b, 0);
  const score = (cf1: boolean | 'bridge', cf2: boolean | 'strong') => {
    const r = layerWith(c.C, c.key, B, cf1, cf2);
    let kept = 0, exact = 0, fp = 0;
    for (let p = 0; p < r.mask.length; p++) {
      if (r.mask[p] && !c.item[p]) fp++;
      if (!c.item[p] || !r.mask[p]) continue;
      kept++;
      if ([0, 1, 2].every((j) => r.layer.data[p * 4 + j] === c.rgb.get(p)![j])) exact++;
    }
    return `${kept}/${exact}/${fp}`;
  };
  rowsS.push({ case: c.id, itemPx: n, 'prod kept/exact/fp': score(false, false), 'CF1': score(true, false), 'CF1b': score('bridge', false), 'CF2': score(false, true), 'CF2b': score(false, 'strong'), 'CF3 far px': farCount(c.C, c.key, B) });
}
console.log(`Synthetic (CHAIN ${CHAIN}, FAR ${FAR}): kept / kept with exact painted RGB / false item px`);
console.table(rowsS);

const cases = JSON.parse(readFileSync(new URL('cases.json', FIX), 'utf8')).filter((c: { role?: string; key: string }) => !c.role && c.key !== 'none');
const rowsB: Record<string, unknown>[] = [];
let cells = 0, warnCells = 0;
const farHist = new Map<number, number>();
for (const c of cases) {
  const key = c.key as Key, run = await runPipe(c);
  let cf1Added = 0, cf1bAdded = 0, cf2Restored = 0, cf2bRestored = 0, farPx = 0, warn = 0, maxFar = 0;
  for (const x of [...run.kf, ...run.cells]) {
    cells++;
    const m1 = chromaMask(x.out, key), a = dropKeyOutline(m1, x.base, x.out, key), b = rimGuardCF(m1, x.base, x.out, key);
    const bb = rimGuardCF(m1, x.base, x.out, key, true);
    for (let p = 0; p < a.length; p++) { if (b[p] && !a[p]) cf1Added++; if (bb[p] && !a[p]) cf1bAdded++; }
    // CF2 on the shipped layer's pre-despill colors: rebuild the raw layer under the shipped mask
    const L = makeImg(x.out.w, x.out.h); for (let p = 0; p < x.mask.length; p++) if (x.mask[p]) L.data.set(x.out.data.subarray(p * 4, p * 4 + 4), p * 4);
    const P = despill(L, key), Q = despillCF(L, key), Q2 = despillCF(L, key, true);
    for (let i = 0; i < P.data.length; i += 4) { if (P.data[i] !== Q.data[i] || P.data[i + 1] !== Q.data[i + 1] || P.data[i + 2] !== Q.data[i + 2]) cf2Restored++; if (P.data[i] !== Q2.data[i] || P.data[i + 1] !== Q2.data[i + 1] || P.data[i + 2] !== Q2.data[i + 2]) cf2bRestored++; }
    const f = farCount(x.out, key, x.base); farPx += f; maxFar = Math.max(maxFar, f); farHist.set(Math.min(f, 50), (farHist.get(Math.min(f, 50)) ?? 0) + 1);
    if (f >= WARN) { warn++; warnCells++; }
  }
  rowsB.push({ case: c.id, key, cells: run.kf.length + run.cells.length, cf1AddedPx: cf1Added, cf1bAddedPx: cf1bAdded, cf2RestoredPx: cf2Restored, cf2bRestoredPx: cf2bRestored, cf3FarBodyKeyPx: farPx, cf3MaxPerCell: maxFar, cf3WarnCells: warn });
}
console.log(`Real corpus (${cells} cells): CF3 warns on ${warnCells} cells at >= ${WARN} far px`);
console.table(rowsB);
console.log('cells by far-px count (50 = >=50):', [...farHist].sort((a, b) => a[0] - b[0]).map(([k, v]) => `${k}:${v}`).join(' '));
saveJson('counterfactuals.json', { CHAIN, FAR, WARN, synthetic: rowsS, bench: rowsB, farHist: [...farHist] });
}
