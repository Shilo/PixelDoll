// G8 grip-side mirror invariance check (2026-11-07 cycle, motion). Offline, no network.
// Production G8 (app/src/lib/items/items.ts evaluateQa) compares item pixel INDICES with continuous keypoint coordinates
// (`nearest`, items.ts:795) while attachHeld/repairDropped use pixel centers (+0.5). This replays the bench held frames and their
// exact horizontal mirror (pixel-edge axis at the padded pivot, keypoints mirrored with labels kept, as rig/skeleton.ts
// flipSkeleton does) and counts R/L/amb/none decisions under both distance conventions.
// Run from the repo root: node docs/research/2026-11-07-paperdoll-cycle/scripts/motion/grip-mirror-check.ts
import { readFileSync } from 'node:fs';
import { runCase } from '../../../../../app/scripts/bench.ts';
import type { Keypoint, Rig } from '../../../../../app/src/lib/rig/rig.ts';

const FIX = new URL('../../../../../app/test/fixtures/bench/', import.meta.url);
const cases = (JSON.parse(readFileSync(new URL('cases.json', FIX), 'utf8')) as { id: string; body: string; pad: number; slot: string }[]).filter((c) => c.pad);
const dist = (m: Uint8Array, w: number, [x, y]: [number, number], half: number) => { let d = 1e9; for (let p = 0; p < m.length; p++) if (m[p]) d = Math.min(d, Math.hypot((p % w) + half - x, ((p / w) | 0) + half - y)); return d; };
const decide = (dr: number, dl: number) => (Math.min(dr, dl) > 6 ? 'none' : dr + 2 < dl ? 'R' : dl + 2 < dr ? 'L' : 'amb');
const rows: Record<string, unknown>[] = [];
let flips = { production: 0, centered: 0, frames: 0 };
for (const c of cases) {
  const res = await runCase(c as never), rig = JSON.parse(readFileSync(new URL(`body${c.body}.json`, FIX), 'utf8')).rig as Rig, pad = c.pad, W = rig.cell.w + 2 * pad, axis = rig.pivot.x + pad;
  for (const x of res.cells.filter((y) => !y.key.startsWith('rest/') && y.area)) {
    const [a, d, i] = x.key.split('/'), k = rig.animations.find((q) => q.id === a)!.sources![d as 'south']!.keypoints![+i] as Keypoint[];
    const at = (l: string): [number, number] => { const q = k.find((p) => p.label === l)!; return [q.x * rig.cell.w + pad, q.y * rig.cell.h + pad]; };
    const R = at('RIGHT ARM'), L = at('LEFT ARM'), mR: [number, number] = [2 * axis - R[0], R[1]], mL: [number, number] = [2 * axis - L[0], L[1]];
    const fm = new Uint8Array(x.mask.length);
    for (let p = 0; p < x.mask.length; p++) if (x.mask[p]) { const X = 2 * axis - 1 - (p % W), Y = (p / W) | 0; if (X >= 0 && X < W) fm[Y * W + X] = 1; }
    const out: Record<string, string> = {};
    for (const [name, half] of [['production', 0], ['centered', 0.5]] as const) {
      const o = decide(dist(x.mask, W, R, half), dist(x.mask, W, L, half)), f = decide(dist(fm, W, mR, half), dist(fm, W, mL, half));
      out[name] = `${o}->${f}`;
      if (o !== f) flips[name]++;
    }
    flips.frames++;
    if (out.production.split('->')[0] !== out.production.split('->')[1] || out.centered.split('->')[0] !== out.centered.split('->')[1]) rows.push({ case: c.id, key: x.key, ...out });
  }
}
console.log(JSON.stringify({ flips, changed: rows }, null, 1));
