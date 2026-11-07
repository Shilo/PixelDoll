// Review of 735b92d3: would a temporal-consensus check (as trimToKeyframe uses for head items) keep every worn part the new
// keyframe exemption restored, while rejecting one-frame ghosts? For each component kept only by the current code, the share
// of the other frames of its clip whose current mask (dilated 2 px, no alignment) covers at least half of it.
// Also injects a one-frame synthetic smear (a 3x4 block of cape color) on the rest cape area of a frame where the posed cape
// has left it, to show the exemption keeps it. Run from the repo root:
//   node docs/research/2026-11-07-paperdoll-cycle/scripts/review/worn-consensus.ts
import { readFileSync } from 'node:fs';
import { components } from '../../../../../app/src/lib/image/chroma.ts';
import { FIX } from '../extraction/lib.ts';
import { NEW, OLD, run, type Case } from './compare-735b.ts';

const dil = (m: Uint8Array, w: number, r: number) => { const h = m.length / w, o = new Uint8Array(m.length); for (let p = 0; p < m.length; p++) if (m[p]) { const x = p % w, y = (p / w) | 0; for (let dy = -r; dy <= r; dy++) for (let dx = -r; dx <= r; dx++) { const X = x + dx, Y = y + dy; if (X >= 0 && Y >= 0 && X < w && Y < h) o[Y * w + X] = 1; } } return o; };
const cases: Case[] = JSON.parse(readFileSync(new URL('cases.json', FIX), 'utf8')).filter((c: Case) => c.clips.length && NEW.slotOf(c.slot).class !== 'held');
const shares: number[] = [];
for (const c of cases) {
  const a = await run(OLD, c), b = await run(NEW, c);
  for (const [i, cn] of b.cells.entries()) {
    const co = a.cells[i], w = cn.layer.w, add = new Uint8Array(cn.mask.length);
    for (let p = 0; p < add.length; p++) if (cn.mask[p] && !co.mask[p]) add[p] = 1;
    const clip = cn.key.split('/').slice(0, 2).join('/'), others = b.cells.filter((x: any) => x !== cn && x.key.startsWith(clip + '/')).map((x: any) => dil(x.mask, w, 2));
    for (const comp of components(add, w, add.length / w)) {
      const s = others.filter((m: Uint8Array) => 2 * comp.filter((p) => m[p]).length >= comp.length).length / others.length;
      shares.push(s);
      if (s < 0.5) console.log('low consensus', c.id, cn.key, comp.length, s.toFixed(2));
    }
  }
}
shares.sort((x, y) => x - y);
console.log('restored worn parts', shares.length, 'min consensus', shares[0]?.toFixed(2), 'median', shares[shares.length >> 1]?.toFixed(2), 'below 0.5:', shares.filter((s) => s < 0.5).length);
