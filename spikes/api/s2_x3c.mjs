// S2/X3c (offline): best offline diff variant on REAL S1 composites; sheet rows per run: S1 auto layer / s1_auto_skinrej layer / skinrej over base.
import fs from 'node:fs';
import { experiment } from './lib/run.mjs';
import { over } from './lib/img.mjs';
import { layerFrom } from './lib/diff.mjs';
import { V } from './s2_x3.mjs';
import { summarize, ANCHOR } from './s2_x1_eval.mjs';
import { sheet } from './lib/sheet.mjs';
const X = experiment('s2_x3');
const SK = JSON.parse(fs.readFileSync(`${X.dir}/../e4_anim/walk_skeletons.json`));
const cl = (x0, y0, x1, y1) => { x0 = Math.max(0, Math.floor(x0)); y0 = Math.max(0, Math.floor(y0)); x1 = Math.min(64, Math.ceil(x1)); y1 = Math.min(64, Math.ceil(y1)); return { x: x0, y: y0, w: x1 - x0, h: y1 - y0 }; };
const HEAD = ['NOSE', 'LEFT EYE', 'RIGHT EYE', 'LEFT EAR', 'RIGHT EAR'];
const REG = { helmet: k => { const cx = HEAD.reduce((a, l) => a + k[l][0], 0) / 5; return cl(cx - 12, 0, cx + 12, k.NECK[1] + 2); },
  chest: k => { const xs = ['LEFT SHOULDER', 'RIGHT SHOULDER', 'LEFT ELBOW', 'RIGHT ELBOW'].map(l => k[l][0]); return cl(Math.min(...xs) - 2, k.NECK[1] - 2, Math.max(...xs) + 3, Math.max(k['LEFT HIP'][1], k['RIGHT HIP'][1]) + 3); },
  sword: (k, d) => d === 'south' ? cl(0, k['RIGHT ARM'][1] - 22, k['RIGHT ARM'][0] + 6, 64) : cl(0, 10, 64, 64) };
const rows = [], table = [];
for (const tag of ['helmet_south__ea2', 'helmet_east__ea2', 'chest_south__ea2', 'chest_south__to2', 'sword_south__to2']) {
  const [, item, d] = tag.match(/^(\w+)_(\w+)__/), res = {};
  for (const n of ['s1_auto', 's1_auto_skinrej']) {
    const Ls = [], comp = [];
    for (let i = 0; i < 8; i++) { const B = X.load(`../e2_anim/walk_${d}_${i}.png`), C = X.load(`../e4_anim/${tag}.out${i}.png`), L = layerFrom(C, V[n](B, C, REG[item](SK[`${d}_${i}`], d))); Ls.push(L); comp.push(over(B, L)); }
    rows.push(Ls); if (n === 's1_auto_skinrej') rows.push(comp);
    table.push({ tag, variant: n, ...summarize(Ls, Ls.map((_, i) => SK[`${d}_${i}`][ANCHOR[item]])) });
  }
}
console.table(table.map(({ tag, variant, areaMean, specks, pinholes, comps }) => ({ tag, variant, areaMean, specks, pinholes, comps })));
X.save('real_s1_skinrej_sheet.png', sheet(rows, { s: 2 }));
X.saveJson('x3_real.json', table);
