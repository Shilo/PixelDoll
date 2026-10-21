// S2: per-item overview sheet. Each run -> 2 rows (south, east): layer over the REAL base. S1 equivalents appended.
// usage: node s2_overview.mjs <item> <dir:tag,...>   tags are files "<dir>/<tag>.layer{j}.png" (j 0..15, 8..15 = east)
import fs from 'node:fs';
import { experiment } from './lib/run.mjs';
import { over } from './lib/img.mjs';
import { sheet } from './lib/sheet.mjs';
const X = experiment('s2_overview');
const [name, list] = process.argv.slice(2), rows = [];
const base = (d, i) => X.load(`../e2_anim/walk_${d}_${i}.png`);
for (const spec of list.split(',')) {
  const [dir, tag, mode = 'ea'] = spec.split(':');
  for (const [d, off] of [['south', 0], ['east', 8]]) {
    const f = i => mode === 's1' ? `../${dir}/${tag.replace('DIR', d)}.final_layer${i}.png` : mode === 'x2' ? `../${dir}/${tag}_${d}.layer${i}.png` : `../${dir}/${tag}.layer${i + off}.png`;
    if (!fs.existsSync(`${X.dir}/${f(7)}`)) continue;
    rows.push([...Array(8).keys()].map(i => X.load(f(i))), [...Array(8).keys()].map(i => over(base(d, i), X.load(f(i)))));
  }
}
X.save(`${name}.png`, sheet(rows, { s: 2 }));
console.log(name, rows.length / 2, 'runs');
