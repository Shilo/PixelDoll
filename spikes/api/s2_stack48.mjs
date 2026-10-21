// S2: final showcase on the clothed padded base: cape + helmet + sword layers (chroma route) stacked per clip/direction.
import fs from 'node:fs';
import { experiment } from './lib/run.mjs';
import { over } from './lib/img.mjs';
import { sheet } from './lib/sheet.mjs';
const X = experiment('s2_x4');
// [run name, cell group] per row-set; layers stacked back->front: cape, helmet, sword
const SETS = [['A', 'b48walk_south'], ['A', 'b48walk_east'], ['B', 'b48walk_north'], ['B', 'b48punch_south']];
const RUN = { A: { cape: 'cape48_A', helmet: 'helmet48_A', sword: 'sword48_A' }, B: { cape: 'cape48_B', helmet: 'helmet48_Ba', sword: 'sword48_Ba' } };
const rows = [];
for (const [k, g] of SETS) {
  const idx = r => JSON.parse(fs.readFileSync(`${X.dir}/${r}.cells.json`)).map((c, j) => [c.group, j]).filter(([gg]) => gg === g).map(([, j]) => j);
  const base = idx(RUN[k].cape).map(j => X.load(`${RUN[k].cape}.base${j}.png`));
  const stack = base.map((B, i) => ['cape', 'helmet', 'sword'].reduce((C, it) => over(C, X.load(`${RUN[k][it]}.layer${idx(RUN[k][it])[i]}.png`)), B));
  rows.push(base, stack);
}
X.save('showcase48_sheet.png', sheet(rows, { s: 3 }));
