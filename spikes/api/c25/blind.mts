// Blind pair kit: each pair becomes one PNG (left | right at 5x, layers over the real base) under a hashed name; sides are
// random; the key is written to a sealed file the judges never see. Kinds: test, placebo (same arm, other seed), calib (known verdict).
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { save, type Img } from './lib.mts';
import { sheet } from './evaluate.mts';
export interface Pair { id: string; kind: 'test' | 'placebo' | 'calib'; a: Img[]; b: Img[]; armA: string; armB: string; expected?: 'a' | 'b' }
export async function writeKit(round: string, pairs: Pair[], s = 4) {
  const dir = path.resolve(import.meta.dirname, `../out/c25/blind/${round}`), sealed = path.resolve(import.meta.dirname, `../out/c25/sealed_${round}.json`);
  fs.mkdirSync(dir, { recursive: true });
  const key: any[] = [];
  const order = pairs.map((p) => ({ p, r: crypto.randomInt(1e9) })).sort((x, y) => x.r - y.r).map((x) => x.p);
  for (const p of order) {
    const flip = crypto.randomInt(2) === 1, left = flip ? p.b : p.a, right = flip ? p.a : p.b;
    const name = crypto.createHash('sha256').update(p.id + crypto.randomUUID()).digest('hex').slice(0, 10);
    await save(`${dir}/${name}.png`, sheet([left, right], s, 6));
    key.push({ file: name, id: p.id, kind: p.kind, top: flip ? p.armB : p.armA, bottom: flip ? p.armA : p.armB, expectedTop: p.expected ? ((p.expected === 'a') !== flip ? 'top' : 'bottom') : undefined });
  }
  fs.writeFileSync(sealed, JSON.stringify(key, null, 1));
  return { dir, n: key.length };
}
