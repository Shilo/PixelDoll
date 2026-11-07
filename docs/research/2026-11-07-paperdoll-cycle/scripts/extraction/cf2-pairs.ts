// Which raw colors CF2 (counterfactuals.ts despillCF) would keep where production despill changes them, per case:
// raw -> production -> CF2, with counts and the raw key score, plus a zoomed sheet (raw | production layer | CF2 layer).
import { readFileSync } from 'node:fs';
import { despill, keyScore, type Key } from '../../../../../app/src/lib/image/chroma.ts';
import { despillCF } from './counterfactuals.ts';
import { runPipe } from './bench-replay.ts';
import { FIX, makeImg, save, zoom } from './lib.ts';

for (const id of process.argv.slice(2)) {
  const c = JSON.parse(readFileSync(new URL('cases.json', FIX), 'utf8')).find((x: { id: string }) => x.id === id), key = c.key as Key, run = await runPipe(c);
  const pairs = new Map<string, number>(); let shown = 0; const S = run.kf[0].base.w, sheet = makeImg(S * 3, S * 3);
  for (const x of [...run.kf, ...run.cells]) {
    const L = makeImg(x.out.w, x.out.h); for (let p = 0; p < x.mask.length; p++) if (x.mask[p]) L.data.set(x.out.data.subarray(p * 4, p * 4 + 4), p * 4);
    const P = despill(L, key), Q = despillCF(L, key); let diff = 0;
    for (let i = 0; i < P.data.length; i += 4) if ([0, 1, 2].some((j) => P.data[i + j] !== Q.data[i + j])) { diff++; const k = `${[...L.data.subarray(i, i + 3)]} -> ${[...P.data.subarray(i, i + 3)]} | CF ${[...Q.data.subarray(i, i + 3)]} (score ${keyScore(key, L.data[i], L.data[i + 1], L.data[i + 2])})`; pairs.set(k, (pairs.get(k) ?? 0) + 1); }
    if (diff && shown < 3) { [x.out, P, Q].forEach((im, j) => { for (let y = 0; y < S; y++) sheet.data.set(im.data.subarray(y * S * 4, (y + 1) * S * 4), ((shown * S + y) * sheet.w + j * S) * 4); }); shown++; }
  }
  console.log(id); for (const [k, n] of [...pairs].sort((a, b) => b[1] - a[1]).slice(0, 8)) console.log(`  ${String(n).padStart(5)} ${k}`);
  await save(`cf2-${id}.png`, zoom(sheet, 5));
}
