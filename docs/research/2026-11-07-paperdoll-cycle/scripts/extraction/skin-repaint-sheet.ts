// Visual check for skin-repaint.ts on the real corpus: raw | shipped layer | flagged px (skin-only body palette, tol 24,
// off-body exclusion) in magenta, for the first cells of a case. Usage: node skin-repaint-sheet.ts <case> [maxCells]
import { readFileSync } from 'node:fs';
import { runPipe } from './bench-replay.ts';
import { clone, FIX, makeImg, save, zoom } from './lib.ts';

const id = process.argv[2] ?? 'a-chest', max = +(process.argv[3] ?? 3);
const c = JSON.parse(readFileSync(new URL('cases.json', FIX), 'utf8')).find((x: { id: string }) => x.id === id), run = await runPipe(c), rows = [];
for (const x of [...run.kf, ...run.cells].slice(0, max)) {
  const { w, h } = x.base, pal: number[][] = [];
  for (let p = 0; p < w * h; p++) { const i = p * 4, [r, g, b] = [x.base.data[i], x.base.data[i + 1], x.base.data[i + 2]]; if (x.base.data[i + 3] && r > g && g > b && r - b >= 24) pal.push([r, g, b]); }
  const off = new Set<string>(); for (let p = 0; p < w * h; p++) if (x.mask[p] && !x.base.data[p * 4 + 3]) off.add([...x.layer.data.subarray(p * 4, p * 4 + 3)].join());
  const mark = clone(x.layer); let n = 0;
  for (let p = 0; p < w * h; p++) { const i = p * 4, col = [...x.layer.data.subarray(i, i + 3)]; if (x.mask[p] && x.base.data[i + 3] && !off.has(col.join()) && pal.some((q) => Math.max(...q.map((v, j) => Math.abs(v - col[j]))) <= 24)) { mark.data.set([255, 0, 255, 255], i); n++; } }
  rows.push([x.out, x.layer, mark]); console.log(x.key, n, 'flagged');
}
const S = run.kf[0].base.w, o = makeImg(S * 3, S * rows.length);
rows.forEach((ims, r) => ims.forEach((im, j) => { for (let y = 0; y < S; y++) o.data.set(im.data.subarray(y * S * 4, (y + 1) * S * 4), ((r * S + y) * o.w + j * S) * 4); }));
await save(`skin-repaint-${id}.png`, zoom(o, 5));
