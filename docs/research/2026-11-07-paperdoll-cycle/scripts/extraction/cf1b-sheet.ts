// Visual check of the real-corpus px CF1b (counterfactuals.ts rimGuardCF with bridge) would restore:
// raw output | raw with restored px marked magenta | production layer. Usage: node cf1b-sheet.ts <case>...
import { readFileSync } from 'node:fs';
import { chromaMask, dropKeyOutline, type Key } from '../../../../../app/src/lib/image/chroma.ts';
import { rimGuardCF } from './counterfactuals.ts';
import { runPipe } from './bench-replay.ts';
import { clone, FIX, makeImg, save, zoom } from './lib.ts';

for (const id of process.argv.slice(2)) {
  const c = JSON.parse(readFileSync(new URL('cases.json', FIX), 'utf8')).find((x: { id: string }) => x.id === id), key = c.key as Key, run = await runPipe(c), picked = [];
  for (const x of [...run.kf, ...run.cells]) {
    const m1 = chromaMask(x.out, key), a = dropKeyOutline(m1, x.base, x.out, key), b = rimGuardCF(m1, x.base, x.out, key, true), mark = clone(x.out), list: string[] = [];
    for (let p = 0; p < a.length; p++) if (b[p] && !a[p]) { mark.data.set([255, 0, 255, 255], p * 4); list.push(`(${p % x.base.w},${(p / x.base.w) | 0}) ${[...x.out.data.subarray(p * 4, p * 4 + 3)]}`); }
    if (list.length) { picked.push([x.out, mark, x.layer]); console.log(id, x.key, list.join('; ')); }
  }
  const S = run.kf[0].base.w, o = makeImg(S * 3, S * picked.length);
  picked.forEach((ims, r) => ims.forEach((im, j) => { for (let y = 0; y < S; y++) o.data.set(im.data.subarray(y * S * 4, (y + 1) * S * 4), ((r * S + y) * o.w + j * S) * 4); }));
  if (picked.length) await save(`cf1b-${id}.png`, zoom(o, 5));
}
