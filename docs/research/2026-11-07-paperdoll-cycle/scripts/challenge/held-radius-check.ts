// Re-review of heldRepairRadius (run.ts): it measures reach over the raw chromaLayer mask of each dressed view, so any
// detached component chromaLayer keeps (>= 2 px) widens the inpaint disc. Compares that with the reach of the largest
// component on the frozen held bench keyframes, then adds one 2 px speck on the body px farthest from the wrist.
// Run from the repo root: node docs/research/2026-11-07-paperdoll-cycle/scripts/challenge/held-radius-check.ts
import { readFileSync } from 'node:fs';
import { runCase } from '../../../../../app/scripts/bench.ts';
import { chromaLayer, components, toChroma } from '../../../../../app/src/lib/image/chroma.ts';
import type { Keypoint, Rig } from '../../../../../app/src/lib/rig/rig.ts';
const FIX = new URL('../../../../../app/test/fixtures/bench/', import.meta.url);
const cases = (JSON.parse(readFileSync(new URL('cases.json', FIX), 'utf8')) as { id: string; body: string; slot: string; pad: number; key: string; clips: string[] }[]).filter((c) => c.pad);
const radius = (reach: number) => Math.max(34, reach + Math.max(4, 0.1 * reach));
for (const c of cases) {
  const res = await runCase(c as never), rig = JSON.parse(readFileSync(new URL(`body${c.body}.json`, FIX), 'utf8')).rig as Rig, W = rig.cell.w + 2 * c.pad, side = c.slot === 'off_hand' ? 'LEFT' : 'RIGHT';
  let all = 0, big = 0, speck = 0;
  for (const x of res.cells.filter((y) => y.key.startsWith('rest/'))) {
    const d = x.key.split('/')[1], q = (rig.rest![d as 'south']!.keypoints as Keypoint[]).find((p) => p.label === `${side} ARM`)!, wr = [q.x * rig.cell.w + c.pad, q.y * rig.cell.h + c.pad];
    const dist = (p: number) => Math.hypot((p % W) + 0.5 - wr[0], ((p / W) | 0) + 0.5 - wr[1]);
    const { mask } = chromaLayer(x.out, c.key as never, x.base), comps = components(mask, W, W).sort((a, b) => b.length - a.length);
    for (let p = 0; p < mask.length; p++) if (mask[p]) all = Math.max(all, dist(p));
    for (const p of comps[0] ?? []) big = Math.max(big, dist(p));
    // a 2 px off-key speck on the interior body px farthest from the wrist (a fleck the prompt did not ask for)
    const op = (p: number) => p >= 0 && p < W * W && x.base.data[p * 4 + 3] > 0, inner = (p: number) => op(p) && op(p - 1) && op(p + 1) && op(p - 2) && op(p + 2) && op(p - W) && op(p + W);
    let top = -1; for (let p = 0; p < W * W; p++) if (inner(p) && (top < 0 || dist(p) > dist(top))) top = p;
    const out = { ...x.out, data: new Uint8ClampedArray(x.out.data) }; out.data.set([200, 40, 40, 255, 200, 40, 40, 255], top * 4);
    const m2 = chromaLayer(out, c.key as never, x.base).mask; for (let p = 0; p < m2.length; p++) if (m2[p]) speck = Math.max(speck, dist(p));
  }
  console.log(`${c.id}: radius from all components ${radius(all).toFixed(1)}, largest component ${radius(big).toFixed(1)}, with a 2 px body speck ${radius(speck).toFixed(1)} (canvas ${W})`);
}
void toChroma;
