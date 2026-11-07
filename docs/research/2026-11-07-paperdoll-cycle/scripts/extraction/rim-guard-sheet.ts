// Visual check for rim-guard.ts: for the cells of one case where dropKeyOutline removed px with luminance > 0.3, save
// raw output | raw with removed px marked magenta | shipped layer, zoomed. Usage: node rim-guard-sheet.ts <case> [maxCells]
import { readFileSync } from 'node:fs';
import { chromaMask, dropKeyOutline, type Key } from '../../../../../app/src/lib/image/chroma.ts';
import { runPipe } from './bench-replay.ts';
import { clone, FIX, makeImg, save, zoom } from './lib.ts';

const id = process.argv[2] ?? 'a-helmet', max = +(process.argv[3] ?? 4);
const c = JSON.parse(readFileSync(new URL('cases.json', FIX), 'utf8')).find((x: { id: string }) => x.id === id);
const run = await runPipe(c), key = c.key as Key, picked = [];
for (const x of [...run.kf, ...run.cells]) {
  const m1 = chromaMask(x.out, key), m2 = dropKeyOutline(m1, x.base, x.out, key), mark = clone(x.out);
  let bright = 0;
  for (let p = 0; p < m1.length; p++) if (m1[p] && !m2[p]) { const i = p * 4; if ((0.299 * x.out.data[i] + 0.587 * x.out.data[i + 1] + 0.114 * x.out.data[i + 2]) / 255 > 0.3) bright++; mark.data.set([255, 0, 255, 255], i); }
  if (bright) picked.push({ k: x.key, ims: [x.out, mark, x.layer], bright });
  if (picked.length >= max) break;
}
const S = run.kf[0].base.w, o = makeImg(S * 3, S * picked.length);
picked.forEach((q, r) => q.ims.forEach((im, j) => { for (let y = 0; y < S; y++) o.data.set(im.data.subarray(y * S * 4, (y + 1) * S * 4), ((r * S + y) * o.w + j * S) * 4); }));
await save(`rim-guard-${id}.png`, zoom(o, 5));
console.log(picked.map((q) => `${q.k}: ${q.bright} bright removed`).join('\n'));
