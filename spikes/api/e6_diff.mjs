// E6: compare extraction variants (offline, no API calls).
// (a) semi-synthetic benchmark with ground truth: C = over(B_drift, L*), where L* = clean item layer (inpaint-v3 slot_thr18)
//     and B_drift = base with REAL body-redraw drift taken from another route's composite outside the item region.
// (b) real composites: leakage / component count / residual per variant per route.
import fs from 'node:fs';
import { experiment } from './lib/run.mjs';
import { over, clone } from './lib/img.mjs';
import { VARIANTS, extractAll } from './lib/extract.mjs';
import { components, leakage } from './lib/diff.mjs';
import { ITEMS } from './e3_static.mjs';
import { sheet } from './lib/sheet.mjs';

const X = experiment('e6_diff');
const E3 = (f) => X.load(`../e3_static/${f}`);
const B = X.load('../e2_anim/walk_south_0.png');
const inR = (r, p, w) => { const x = p % w, y = (p / w) | 0; return x >= r.x && y >= r.y && x < r.x + r.w && y < r.y + r.h; };
const names = Object.keys(VARIANTS);

// (a) synthetic
const rows = [], agg = Object.fromEntries(names.map(n => [n, { tp: 0, fp: 0, fn: 0 }]));
const driftSources = ['pf-edit', 'pf-inpaint', 'edit-images-v2'];
for (const item of Object.keys(ITEMS)) {
  const r = ITEMS[item];
  const Ls = extractAll(B, E3(`${item}__inpaint-v3.out0.png`), r.region, ['slot_thr18']).slot_thr18.layer;
  for (const src of driftSources) {
    // drift field: take the source composite of a DIFFERENT item, outside that item's region (pure body redraw)
    const other = Object.keys(ITEMS).find(k => k !== item && !['sword', 'cape'].includes(k)) ; // helmet/chest/hair have compact regions
    const D = E3(`${other}__${src}.out0.png`), Bd = clone(B);
    for (let p = 0; p < B.w * B.h; p++) if (!inR(ITEMS[other].region, p, B.w) && B.d[p * 4 + 3] && D.d[p * 4 + 3]) Bd.d.set(D.d.subarray(p * 4, p * 4 + 4), p * 4);
    const C = over(Bd, Ls);
    const ex = extractAll(B, C, r.region);
    for (const n of names) {
      let tp = 0, fp = 0, fn = 0; const m = ex[n].mask;
      for (let p = 0; p < m.length; p++) { const g = Ls.d[p * 4 + 3] > 0 && (Ls.d[p * 4] !== B.d[p * 4] || Ls.d[p * 4 + 1] !== B.d[p * 4 + 1] || Ls.d[p * 4 + 2] !== B.d[p * 4 + 2] || B.d[p * 4 + 3] === 0); if (m[p] && g) tp++; else if (m[p]) fp++; else if (g) fn++; }
      agg[n].tp += tp; agg[n].fp += fp; agg[n].fn += fn;
    }
    if (src === 'pf-edit') rows.push([Ls, Bd, C, ex.thr18.layer, ex.novel_cc.layer, ex.slot_novel_cc.layer, ex.slot_hyst_cc.layer]);
  }
}
X.save('synthetic_sheet.png', sheet(rows));
const synth = Object.fromEntries(names.map(n => { const a = agg[n], P = a.tp / (a.tp + a.fp || 1), R = a.tp / (a.tp + a.fn || 1); return [n, { precision: +P.toFixed(3), recall: +R.toFixed(3), f1: +(2 * P * R / (P + R || 1)).toFixed(3) }]; }));
console.log('SYNTHETIC (5 items x 3 real drift sources)'); console.table(synth);

// (b) real composites
const routes = ['inpaint-v3', 'pf-inpaint', 'pf-edit', 'edit-images-v2', 'edit-image'];
const real = {};
for (const route of routes) {
  const acc = Object.fromEntries(names.map(n => [n, { layerPx: 0, leak: 0, comps: 0, residualIn: 0, outside: 0 }]));
  for (const item of Object.keys(ITEMS)) {
    const f = `${X.dir}/../e3_static/${item}__${route}.out0.png`; if (!fs.existsSync(f)) continue;
    const ex = extractAll(B, E3(`${item}__${route}.out0.png`), ITEMS[item].region);
    for (const n of names) { const e = ex[n]; acc[n].layerPx += e.m.layerPx; acc[n].leak += leakage(B, e.layer) / 5; acc[n].comps += components(e.mask, B.w, B.h).comps.length / 5; acc[n].residualIn += e.m.residualInRegion; acc[n].outside += e.m.layerOutsideRegion; }
  }
  real[route] = Object.fromEntries(Object.entries(acc).map(([n, v]) => [n, { layerPx: v.layerPx, leakPct: +(v.leak * 100).toFixed(1), meanComps: +v.comps.toFixed(1), residualInRegion: v.residualIn, layerOutsideRegion: v.outside }]));
  console.log('REAL', route); console.table(real[route]);
}
X.saveJson('e6_results.json', { synth, real });
