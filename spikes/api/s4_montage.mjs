// S4: per-item montage of the head-to-head composites (base + extracted layer): per route two rows, S walk and E slash.
// usage: node s4_montage.mjs <item> [routes]   -> out/s4_q3e/m_<item>.png  (route order = row-pair order)
import fs from 'node:fs';
import { experiment } from './lib/run.mjs';
import { over } from './lib/img.mjs';
import { layerFrom } from './lib/diff.mjs';
import { dropKeyOutline, chromaMask, despill } from './lib/chroma.mjs';
import { minArea } from './lib/clean.mjs';
import { sheet } from './lib/sheet.mjs';
const X = experiment('s4_q3e'), [item, rs = 'ea2,eiv2,inv3,pfinp,pfgrid,pixen,skel_ea2,skel_pfg'] = process.argv.slice(2), rows = [], used = [];
const out = (route, d, clip, i) => route.startsWith('skel_') ? `pose_${route.slice(5)}_${item}_${clip}_${d}_${i}.png` : `../s4_items/sk_${route}_${item}_${d}.out${(clip === 'slash' ? 8 : 0) + i}.png`;
for (const route of rs.split(',')) {
  if (!fs.existsSync(`${X.dir}/${out(route, 'east', 'slash', 7)}`) || !fs.existsSync(`${X.dir}/${out(route, 'south', 'walk', 7)}`)) continue; used.push(route);
  for (const [d, clip] of [['south', 'walk'], ['east', 'slash']]) rows.push([...Array(8).keys()].map(i => { const B = X.load(`../s4_items/sk_${d}.base${(clip === 'slash' ? 8 : 0) + i}.png`), C = X.load(out(route, d, clip, i)); return over(B, despill(layerFrom(C, minArea(dropKeyOutline(chromaMask(C), B, C), 64, 64, 2)))); }));
}
X.save(`m_${item}.png`, sheet(rows, { s: 2, gap: 6 })); console.log(item, used.join(' | '));
