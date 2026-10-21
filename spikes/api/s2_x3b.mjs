// S2/X3b (offline): CLEAN ground truth from chroma layers. L*_j = green-chroma ea2 layer (item-shaped, no body px by construction);
// C_j = over(B_j with REAL S1 ea2 body drift, L*_j). Scores S1 extractors vs X3 variants (+ temporal consensus) on 5 items x 16 cells.
import fs from 'node:fs';
import { experiment } from './lib/run.mjs';
import { over, clone } from './lib/img.mjs';
import { layerFrom, deltas } from './lib/diff.mjs';
import { clipRect, temporalConsensus } from './lib/clean.mjs';
import { V } from './s2_x3.mjs';
import { SLOT, ANCHOR } from './s2_x1_eval.mjs';
import { sheet } from './lib/sheet.mjs';

const X = experiment('s2_x3');
const SK = JSON.parse(fs.readFileSync(`${X.dir}/../e4_anim/walk_skeletons.json`));
const cl = (x0, y0, x1, y1) => { x0 = Math.max(0, Math.floor(x0)); y0 = Math.max(0, Math.floor(y0)); x1 = Math.min(64, Math.ceil(x1)); y1 = Math.min(64, Math.ceil(y1)); return { x: x0, y: y0, w: x1 - x0, h: y1 - y0 }; };
const HEAD = ['NOSE', 'LEFT EYE', 'RIGHT EYE', 'LEFT EAR', 'RIGHT EAR'];
const REG = { // S1 tight slots where S1 had them, chroma bands otherwise
  helmet: k => { const cx = HEAD.reduce((a, l) => a + k[l][0], 0) / 5; return cl(cx - 12, 0, cx + 12, k.NECK[1] + 2); },
  chest: k => { const xs = ['LEFT SHOULDER', 'RIGHT SHOULDER', 'LEFT ELBOW', 'RIGHT ELBOW'].map(l => k[l][0]); return cl(Math.min(...xs) - 2, k.NECK[1] - 2, Math.max(...xs) + 3, Math.max(k['LEFT HIP'][1], k['RIGHT HIP'][1]) + 3); },
  sword: (k, d) => d === 'south' ? cl(0, k['RIGHT ARM'][1] - 22, k['RIGHT ARM'][0] + 6, 64) : cl(0, 10, 64, 64),
  boots: k => SLOT.boots(k), cape: k => SLOT.cape(k),
};
const DRIFT = { south: { helmet: ['chest_south__ea2', 'chest'], default: ['helmet_south__ea2', 'helmet'] }, east: { helmet: ['helmet_east__to2', 'helmet'], default: ['helmet_east__ea2', 'helmet'] } };
const score = (m, gt) => { let tp = 0, fp = 0, fn = 0; for (let p = 0; p < m.length; p++) { if (m[p] && gt[p]) tp++; else if (m[p]) fp++; else if (gt[p]) fn++; } return { tp, fp, fn }; };
const prf = a => { const P = a.tp / (a.tp + a.fp || 1), R = a.tp / (a.tp + a.fn || 1); return { P: +P.toFixed(3), R: +R.toFixed(3), F1: +(2 * P * R / (P + R || 1)).toFixed(3), fpPerCell: +(a.fp / a.n).toFixed(1), fnPerCell: +(a.fn / a.n).toFixed(1) }; };
const gtOf = (L, B) => { const g = new Uint8Array(4096); for (let p = 0, i = 0; p < g.length; p++, i += 4) if (L.d[i + 3] && (B.d[i + 3] === 0 || L.d[i] !== B.d[i] || L.d[i + 1] !== B.d[i + 1] || L.d[i + 2] !== B.d[i + 2])) g[p] = 1; return g; };
const names = ['s1_novel2_grow1', 's1_auto', 's1_auto_skinrej', 's1_auto_skinrej6', 'nbr_grow_fill', 'nbr_rej_grow_fill', 'nbr_and_novel2_grow_fill'];
const agg = {}, perItem = {}, add = (n, it, s) => { for (const t of [agg, perItem[it] ??= {}]) { t[n] ??= { tp: 0, fp: 0, fn: 0, n: 0 }; for (const k in s) t[n][k] += s[k]; t[n].n++; } };
const rows = [];
for (const item of ['helmet', 'chest', 'boots', 'cape', 'sword']) for (const d of ['south', 'east']) {
  const [drun, ditem] = DRIFT[d][item] || DRIFT[d].default, Bs = [], Cs = [], gts = [], regs = [], ks = [];
  for (let i = 0; i < 8; i++) {
    const B = X.load(`../e2_anim/walk_${d}_${i}.png`), k = SK[`${d}_${i}`], L = X.load(`../s2_x1/${item}_green_ea2.layer${i + (d === 'east' ? 8 : 0)}.png`);
    const D = X.load(`../e4_anim/${drun}.out${i}.png`), rd = REG[ditem](k, d), Bd = clone(B);
    for (let p = 0; p < 4096; p++) { const x = p % 64, y = p / 64 | 0; if (!(x >= rd.x && y >= rd.y && x < rd.x + rd.w && y < rd.y + rd.h) && B.d[p * 4 + 3] && D.d[p * 4 + 3]) Bd.d.set(D.d.subarray(p * 4, p * 4 + 4), p * 4); }
    Bs.push(B); Cs.push(over(Bd, L)); gts.push(gtOf(L, B)); regs.push(REG[item](k, d)); ks.push(k[ANCHOR[item]]);
  }
  const offs = ks.map(a => [Math.round(a[0] - ks[0][0]), Math.round(a[1] - ks[0][1])]);
  for (const n of names) {
    const ms = Cs.map((C, i) => V[n](Bs[i], C, regs[i])); ms.forEach((m, i) => add(n, item, score(m, gts[i])));
    const support = Cs.map((C, i) => { const { dm, da } = deltas(Bs[i], C); return clipRect(Uint8Array.from(dm, (v, p) => v > 8 || da[p] > 16 ? 1 : 0), 64, regs[i]); });
    temporalConsensus(ms, offs, 64, 64, { keepK: 3, fillK: 6, support }).forEach((m, i) => add(n + '+temporal', item, score(m, gts[i])));
    if (d === 'south' && (n === 's1_novel2_grow1' || n === 'nbr_and_novel2_grow_fill')) rows.push(ms.map((m, i) => layerFrom(Cs[i], m)));
  }
  if (d === 'south') rows.push(Cs, gts.map((g, i) => layerFrom(Cs[i], g)));
}
const tab = Object.fromEntries(Object.entries(agg).map(([n, a]) => [n, prf(a)]));
console.log('(c) chroma-GT temporal semi-synthetic (5 items x 16 cells, real S1 ea2 drift)'); console.table(tab);
const byItem = Object.fromEntries(Object.entries(perItem).map(([it, t]) => [it, Object.fromEntries(['s1_novel2_grow1', 's1_auto', 's1_auto_skinrej', 'nbr_and_novel2_grow_fill', 'nbr_and_novel2_grow_fill+temporal'].map(n => [n, prf(t[n]).F1]))]));
console.table(byItem);
X.save('chromaGT_sheet.png', sheet(rows, { s: 2 }));
X.saveJson('x3_chromaGT.json', { all: tab, byItem });
