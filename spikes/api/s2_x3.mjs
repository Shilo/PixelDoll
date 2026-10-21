// S2/X3 (offline, free): better diff on S1 data. (a) S1's single-frame semi-synthetic GT (E6), (b) an 8-frame temporal
// semi-synthetic GT (E3 clean layer propagated by tracked offsets + REAL ea2 body drift).
import fs from 'node:fs';
import { experiment } from './lib/run.mjs';
import { over, clone, make } from './lib/img.mjs';
import { VARIANTS } from './lib/extract.mjs';
import { layerFrom, maskNovel2, growInto, deltas, basePalette } from './lib/diff.mjs';
import { maskNbr, rejectBody, fillHoles, minArea, clipRect, growOutline, track, temporalConsensus } from './lib/clean.mjs';
import { ITEMS } from './e3_static.mjs';
import { sheet } from './lib/sheet.mjs';

const X = experiment('s2_x3');
const F = d => [...Array(8).keys()].map(i => X.load(`../e2_anim/walk_${d}_${i}.png`));
const inR = (r, p, w) => { const x = p % w, y = (p / w) | 0; return x >= r.x && y >= r.y && x < r.x + r.w && y < r.y + r.h; };
const and = (a, b) => a.map((v, p) => v && b[p] ? 1 : 0), or = (a, b) => a.map((v, p) => v || b[p] ? 1 : 0);

// candidate per-frame extractors (B base, C composite, r slot rect)
export const V = {
  s1_novel2_grow1: (B, C, r) => VARIANTS.slot_novel2_grow1(B, C, r),
  s1_auto: (B, C, r) => VARIANTS.auto(B, C, r),
  // S1 auto + skin-only body-material rejection (warm base colours r-b>30) + pinhole fill
  s1_auto_skinrej: (B, C, r) => fillHoles(minArea(rejectBody(VARIANTS.auto(B, C, r), B, C, { t: 10, pal: basePalette(B).filter(([R, , Bl]) => R - Bl > 30) }), B.w, B.h, 2), C, 2),
  s1_auto_skinrej6: (B, C, r) => fillHoles(minArea(rejectBody(VARIANTS.auto(B, C, r), B, C, { t: 6, pal: basePalette(B).filter(([R, , Bl]) => R - Bl > 30) }), B.w, B.h, 2), C, 2),
  nbr: (B, C, r) => minArea(clipRect(maskNbr(B, C), B.w, r), B.w, B.h, 3),
  nbr_t24: (B, C, r) => minArea(clipRect(maskNbr(B, C, { t: 24 }), B.w, r), B.w, B.h, 3),
  nbr_rej: (B, C, r) => minArea(rejectBody(clipRect(maskNbr(B, C), B.w, r), B, C), B.w, B.h, 3),
  nbr_rej_fill: (B, C, r) => fillHoles(minArea(rejectBody(clipRect(maskNbr(B, C), B.w, r), B, C), B.w, B.h, 3), C, 4),
  nbr_grow_fill: (B, C, r) => clipRect(fillHoles(growInto(minArea(clipRect(maskNbr(B, C), B.w, r), B.w, B.h, 3), B, C, { steps: 1 }), C, 4), B.w, r),
  nbr_rej_grow_fill: (B, C, r) => clipRect(fillHoles(growInto(minArea(rejectBody(clipRect(maskNbr(B, C), B.w, r), B, C), B.w, B.h, 3), B, C, { steps: 1 }), C, 4), B.w, r),
  nbr_and_novel2_grow_fill: (B, C, r) => clipRect(fillHoles(growInto(minArea(and(clipRect(maskNbr(B, C), B.w, r), or(maskNovel2(B, C, r), maskNbr(B, C, { t: 40 }))), B.w, B.h, 3), B, C, { steps: 1 }), C, 4), B.w, r),
  nbr_rej_outline_fill: (B, C, r) => clipRect(fillHoles(growOutline(minArea(rejectBody(clipRect(maskNbr(B, C), B.w, r), B, C), B.w, B.h, 3), C), C, 4), B.w, r),
};
const score = (m, gt) => { let tp = 0, fp = 0, fn = 0; for (let p = 0; p < m.length; p++) { if (m[p] && gt[p]) tp++; else if (m[p]) fp++; else if (gt[p]) fn++; } return { tp, fp, fn }; };
const prf = a => { const P = a.tp / (a.tp + a.fp || 1), R = a.tp / (a.tp + a.fn || 1); return { P: +P.toFixed(3), R: +R.toFixed(3), F1: +(2 * P * R / (P + R || 1)).toFixed(3) }; };
const gtOf = (L, B) => { const g = new Uint8Array(B.w * B.h); for (let p = 0, i = 0; p < g.length; p++, i += 4) if (L.d[i + 3] && (B.d[i + 3] === 0 || L.d[i] !== B.d[i] || L.d[i + 1] !== B.d[i + 1] || L.d[i + 2] !== B.d[i + 2])) g[p] = 1; return g; };

if (import.meta.url.endsWith(process.argv[1].replace(/\\/g, '/').split('/').pop())) {
  // ---------- (a) single-frame GT (identical construction to E6) ----------
  const S = F('south'), B0 = S[0], E3 = f => X.load(`../e3_static/${f}`);
  const aggA = Object.fromEntries(Object.keys(V).map(n => [n, { tp: 0, fp: 0, fn: 0 }]));
  for (const item of Object.keys(ITEMS)) {
    const r = ITEMS[item].region, Ls = layerFrom(E3(`${item}__inpaint-v3.out0.png`), VARIANTS.slot_thr18(B0, E3(`${item}__inpaint-v3.out0.png`), r)), gt = gtOf(Ls, B0);
    for (const src of ['pf-edit', 'pf-inpaint', 'edit-images-v2']) {
      const other = Object.keys(ITEMS).find(k => k !== item && !['sword', 'cape'].includes(k)), D = E3(`${other}__${src}.out0.png`), Bd = clone(B0);
      for (let p = 0; p < 4096; p++) if (!inR(ITEMS[other].region, p, 64) && B0.d[p * 4 + 3] && D.d[p * 4 + 3]) Bd.d.set(D.d.subarray(p * 4, p * 4 + 4), p * 4);
      const C = over(Bd, Ls);
      for (const n of Object.keys(V)) { const s = score(V[n](B0, C, r), gt); for (const k in s) aggA[n][k] += s[k]; }
    }
  }
  const tabA = Object.fromEntries(Object.entries(aggA).map(([n, a]) => [n, prf(a)]));
  console.log('(a) single-frame semi-synthetic GT (5 items x 3 drift sources)'); console.table(tabA);

  // ---------- (b) 8-frame temporal GT ----------
  const PATCH = { helmet: { x: 24, y: 6, w: 17, h: 16 }, hair: { x: 24, y: 6, w: 17, h: 16 }, sword: { x: 17, y: 34, w: 10, h: 10 }, chest: { x: 24, y: 20, w: 17, h: 16 }, cape: { x: 24, y: 20, w: 17, h: 16 } };
  const DRIFT = { helmet: 'chest', hair: 'chest', chest: 'helmet', sword: 'helmet', cape: 'helmet' }; // ea2 run whose body (outside its slot) supplies real drift
  const SK = JSON.parse(fs.readFileSync(`${X.dir}/../e4_anim/walk_skeletons.json`));
  const REG4 = {
    helmet: k => { const H = ['NOSE', 'LEFT EYE', 'RIGHT EYE', 'LEFT EAR', 'RIGHT EAR'], cx = H.reduce((a, l) => a + k[l][0], 0) / 5; return { x: Math.floor(cx - 12), y: 0, w: 24, h: Math.ceil(k.NECK[1] + 2) }; },
    chest: k => { const xs = ['LEFT SHOULDER', 'RIGHT SHOULDER', 'LEFT ELBOW', 'RIGHT ELBOW'].map(l => k[l][0]), x0 = Math.floor(Math.min(...xs) - 2), y0 = Math.floor(k.NECK[1] - 2); return { x: x0, y: y0, w: Math.ceil(Math.max(...xs) + 3) - x0, h: Math.ceil(Math.max(k['LEFT HIP'][1], k['RIGHT HIP'][1]) + 3) - y0 }; },
  };
  const shiftIm = (L, dx, dy) => { const o = make(L.w, L.h); for (let y = 0; y < L.h; y++) for (let x = 0; x < L.w; x++) { const sx = x - dx, sy = y - dy; if (sx < 0 || sy < 0 || sx >= L.w || sy >= L.h) continue; o.d.set(L.d.subarray((sy * L.w + sx) * 4, (sy * L.w + sx) * 4 + 4), (y * L.w + x) * 4); } return o; };
  const BEST = ['s1_novel2_grow1', 's1_auto', 'nbr_grow_fill', 'nbr_rej_grow_fill', 'nbr_and_novel2_grow_fill'];
  const aggB = {}, add = (n, s) => { aggB[n] ??= { tp: 0, fp: 0, fn: 0 }; for (const k in s) aggB[n][k] += s[k]; };
  const rowsB = [];
  for (const item of Object.keys(ITEMS)) {
    const r0 = ITEMS[item].region, L0 = layerFrom(E3(`${item}__inpaint-v3.out0.png`), VARIANTS.slot_thr18(B0, E3(`${item}__inpaint-v3.out0.png`), r0));
    const offs = S.map((Bi, i) => i ? track(B0, Bi, PATCH[item]).slice(0, 2) : [0, 0]);
    const dr = DRIFT[item], Cs = [], gts = [], regs = [];
    for (let i = 0; i < 8; i++) {
      const Bi = S[i], D = X.load(`../e4_anim/${dr}_south__ea2.out${i}.png`), rd = REG4[dr](SK[`south_${i}`]), Bd = clone(Bi);
      for (let p = 0; p < 4096; p++) if (!inR(rd, p, 64) && Bi.d[p * 4 + 3] && D.d[p * 4 + 3]) Bd.d.set(D.d.subarray(p * 4, p * 4 + 4), p * 4);
      const Li = shiftIm(L0, ...offs[i]); Cs.push(over(Bd, Li)); gts.push(gtOf(Li, Bi)); regs.push({ ...r0, x: r0.x + offs[i][0], y: r0.y + offs[i][1] });
    }
    for (const n of BEST) {
      const ms = Cs.map((C, i) => V[n](S[i], C, regs[i]));
      ms.forEach((m, i) => add(n, score(m, gts[i])));
      const support = Cs.map((C, i) => { const { dm, da } = deltas(S[i], C); return clipRect(Uint8Array.from(dm, (v, p) => v > 8 || da[p] > 16 ? 1 : 0), 64, regs[i]); });
      const tc = temporalConsensus(ms, offs, 64, 64, { keepK: 3, fillK: 6, support });
      tc.forEach((m, i) => add(n + '+temporal', score(m, gts[i])));
      if (n === 'nbr_rej_grow_fill') rowsB.push([...Cs.slice(0, 4), ...gts.slice(0, 4).map((g, i) => layerFrom(Cs[i], g)), ...tc.slice(0, 4).map((m, i) => layerFrom(Cs[i], m))]);
    }
  }
  const tabB = Object.fromEntries(Object.entries(aggB).map(([n, a]) => [n, prf(a)]));
  console.log('(b) 8-frame temporal semi-synthetic GT (5 items x 8 frames, real ea2 drift)'); console.table(tabB);
  X.save('temporal_synth_sheet.png', sheet(rowsB, { s: 3 }));
  X.saveJson('x3_gt.json', { single: tabA, temporal: tabB });
}
