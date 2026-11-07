// Review of 735b92d3: the held repair disc radius (run.ts heldRepairRadius) on the bench's held keyframes, measured with the
// parent rule (largest component only) and the current rule (heldParts: near 3 px or body-bridged, no size floor), and which
// component sets the reach. Mirrors heldRepairRadius line for line on bench data (no RigCtx offline).
// Run from the repo root: node docs/research/2026-11-07-paperdoll-cycle/scripts/review/held-radius.ts
import { readFileSync } from 'node:fs';
import { chromaLayer, components, type Key } from '../../../../../app/src/lib/image/chroma.ts';
import { heldParts, padImg } from '../../../../../app/src/lib/items/items.ts';
import { fromApi } from '../../../../../app/src/lib/rig/poses.ts';
import { body, cell, FIX, load } from '../extraction/lib.ts';

interface Case { id: string; body: string; slot: string; key: string; pad: number; clips: string[] }
const cases: Case[] = JSON.parse(readFileSync(new URL('cases.json', FIX), 'utf8')).filter((c: Case) => c.slot === 'main_hand' || c.slot === 'off_hand');
for (const c of cases) {
  const { body: b, sheet: bs } = await body(c.body), rig = b.rig, N = rig.cell.w, C = N + 2 * c.pad, sheet = await load(`${c.id}.png`);
  const dirs = [...new Set(c.clips.map((k) => k.split('/')[1]))];
  let oldReach = 0, newReach = 0;
  for (const d of dirs) {
    const s = fromApi(rig.rest![d as 'south']!.keypoints, rig.cell), wrist = s[c.slot === 'off_hand' ? 'LEFT ARM' : 'RIGHT ARM'];
    const im = cell(sheet, C, c.clips.findIndex((k) => k.endsWith(`/${d}`)), 0), base = padImg(cell(bs, N, b.rows.indexOf(d), b.cols.indexOf('rest')), c.pad);
    const { mask } = chromaLayer(im, c.key as Key, base), w = im.w;
    const dist = (p: number) => Math.hypot((p % w) + 0.5 - wrist.x - c.pad, ((p / w) | 0) + 0.5 - wrist.y - c.pad);
    const largest = components(mask, w, im.h).reduce((a, x) => (x.length > a.length ? x : a), [] as number[]);
    const { comps, keep } = heldParts(mask, base), parts = comps.filter((_, i) => keep[i]);
    const o = Math.max(0, ...largest.map(dist)), n = Math.max(0, ...parts.flat().map(dist));
    oldReach = Math.max(oldReach, o); newReach = Math.max(newReach, n);
    console.log(c.id, d, 'components', comps.length, 'kept', parts.length, 'sizes', parts.map((x) => x.length).join('/'), 'reach old', o.toFixed(1), 'new', n.toFixed(1));
  }
  const r = (x: number) => Math.max(34, x + Math.max(4, 0.1 * x)).toFixed(1);
  console.log(c.id, 'radius old', r(oldReach), 'new', r(newReach));
}
