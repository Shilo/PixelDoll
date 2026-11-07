// Review of decisiveAction: (a) which left/right swaps alone flip a walk or idle to an action, (b) how often the estimator's
// measured frames are side-swapped against the requested pose in stored rigs (real estimator error rate), (c) arm span / H.
// Run from the repo root: node docs/research/2026-11-07-paperdoll-cycle/scripts/review/move-swaps.ts
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { decisiveAction } from '../../../../../app/src/lib/items/items.ts';
import { fromApi, hasAll } from '../../../../../app/src/lib/rig/poses.ts';
import type { DirectionName, Keypoint, Rig } from '../../../../../app/src/lib/rig/rig.ts';

const ROOT = new URL('../../../../../', import.meta.url);
const audit = 'docs/testing/img/audit-worktree-39533f7/testing-img/professional-audit/';
const files = [...['A', 'B', 'C', 'N'].map((b) => `app/test/fixtures/bench/body${b}.json`),
  ...(existsSync(new URL(audit, ROOT)) ? readdirSync(new URL(audit, ROOT)).map((x) => `${audit}${x}/export/manifest.json`).filter((f) => existsSync(new URL(f, ROOT))) : [])];
const rigOf = (f: string): Rig => { const j = JSON.parse(readFileSync(new URL(f, ROOT), 'utf8')); return j.rig ?? j.manifest?.rig; };
const SIDES = ['SHOULDER', 'ELBOW', 'ARM', 'HIP', 'KNEE', 'LEG', 'EYE', 'EAR'];
const swapKp = (f: Keypoint[], parts: string[]) => f.map((k) => { const m = /^(RIGHT|LEFT) (.+)$/.exec(k.label); if (!m || !parts.includes(m[2])) return k; const o = f.find((x) => x.label === `${m[1] === 'RIGHT' ? 'LEFT' : 'RIGHT'} ${m[2]}`)!; return { ...k, x: o.x, y: o.y }; });
const decide = (rig: Rig, dir: DirectionName, seq: Keypoint[][]) => {
  const r: Rig = { ...rig, animations: [...rig.animations, { id: '__probe', cells: seq.length, loop: true, frames: [], sources: { [dir]: { keypoints: seq } } } as never] };
  return decisiveAction(r, '__probe', dir);
};
const dist = (a: Keypoint[], b: Keypoint[], cell: Rig['cell']) => a.reduce((s, k) => { const o = b.find((x) => x.label === k.label)!; return s + Math.hypot((k.x - o.x) * cell.w, (k.y - o.y) * cell.h); }, 0);
let frames = 0, swapped = 0;
const flips: Record<string, number> = {}, total: Record<string, number> = {};
for (const f of files) {
  const rig = rigOf(f), short = f.split('/').slice(-3, -1).join('/');
  for (const a of rig.animations) for (const [d, s] of Object.entries(a.sources ?? {}) as [DirectionName, { keypoints?: Keypoint[][]; measured?: Keypoint[][] }][]) {
    const rest = rig.rest?.[d]?.keypoints; if (!rest || !hasAll(rest)) continue;
    // (b) measured vs requested: is the measured frame closer to the requested pose after swapping arms or legs?
    if (s.measured && s.keypoints) s.measured.forEach((m, i) => {
      const k = s.keypoints![i]; if (!hasAll(m) || !hasAll(k)) return; frames++;
      const d0 = dist(m, k, rig.cell), d1 = Math.min(dist(swapKp(m, ['SHOULDER', 'ELBOW', 'ARM']), k, rig.cell), dist(swapKp(m, ['HIP', 'KNEE', 'LEG']), k, rig.cell), dist(swapKp(m, SIDES), k, rig.cell));
      if (d1 < d0 * 0.7) { swapped++; console.log(`swap-like measured frame: ${short} ${a.id}/${d}/${i} sum err ${d0.toFixed(1)} px -> ${d1.toFixed(1)} px when swapped`); }
    });
    if (!/^(idle|walk)/.test(a.id)) continue;
    const seq = (s.measured?.length && s.measured.every(hasAll) ? s.measured : s.keypoints) as Keypoint[][]; if (!seq) continue;
    // (a) one frame with only arms, only legs, or only wrists swapped
    for (const [name, parts] of [['wrists', ['ARM']], ['arms', ['SHOULDER', 'ELBOW', 'ARM']], ['legs', ['HIP', 'KNEE', 'LEG']], ['all', SIDES]] as const) {
      const key = `${name} ${d.startsWith('north') ? 'back' : d.startsWith('south') ? 'front' : 'side'}`;
      total[key] = (total[key] ?? 0) + 1;
      if (decide(rig, d, seq.map((fr, i) => (i ? fr : swapKp(fr, [...parts]))))) flips[key] = (flips[key] ?? 0) + 1;
    }
    // (c) wrist span relative to H in the rest pose
    const p = fromApi(rest, rig.cell), feet = [(p['RIGHT LEG'].x + p['LEFT LEG'].x) / 2, (p['RIGHT LEG'].y + p['LEFT LEG'].y) / 2], H = Math.hypot(feet[0] - p.NOSE.x, feet[1] - p.NOSE.y);
    console.log(`span ${short} ${a.id}/${d}: wrist span ${(Math.hypot(p['RIGHT ARM'].x - p['LEFT ARM'].x, p['RIGHT ARM'].y - p['LEFT ARM'].y) / H).toFixed(2)} H, H ${H.toFixed(1)} px`);
  }
}
console.log(`\nmeasured frames compared with requested: ${frames}, swap-like: ${swapped}`);
for (const k of Object.keys(total).sort()) console.log(`one-frame ${k.padEnd(12)} swap flips walk/idle to action: ${flips[k] ?? 0} of ${total[k]}`);

// (d) candidate fix: measure each joint against the nearer of its own and its mirror joint's standing position (any partial
// left/right swap then moves nothing; rise and lean are swap-invariant already). Does every stored slash stay decisive, every stored walk/idle stay not, and do the swaps stop flipping?
const variant = (rig: Rig, seq: Keypoint[][], dir: DirectionName) => {
  const r = rig.rest?.[dir]?.keypoints; if (!r || !hasAll(r)) return false;
  const rest = fromApi(r, rig.cell), mid = (p: typeof rest, a: string, b: string) => [(p[a].x + p[b].x) / 2, (p[a].y + p[b].y) / 2];
  const feet = mid(rest, 'RIGHT LEG', 'LEFT LEG'), H = Math.hypot(feet[0] - rest.NOSE.x, feet[1] - rest.NOSE.y);
  return seq.some((k) => {
    const p = fromApi(k, rig.cell), twin = (l: string) => l.startsWith('RIGHT ') ? l.replace('RIGHT ', 'LEFT ') : l.startsWith('LEFT ') ? l.replace('LEFT ', 'RIGHT ') : l;
    const hips = mid(p, 'RIGHT HIP', 'LEFT HIP'), lean = Math.abs(Math.atan2(p.NECK.x - hips[0], hips[1] - p.NECK.y)) * 180 / Math.PI;
    const moved = Math.max(...Object.keys(rest).map((l) => Math.min(Math.hypot(p[l].x - rest[l].x, p[l].y - rest[l].y), Math.hypot(p[l].x - rest[twin(l)].x, p[l].y - rest[twin(l)].y)))) / H;
    const rise = Math.max(...['RIGHT ARM', 'LEFT ARM'].map((l) => (rest[l].y - p[l].y) / H));
    return moved >= 0.6 || rise >= 0.45 || lean >= 40;
  });
};
let agree = 0, differ = 0, swapFlips = 0, swapTotal = 0;
for (const f of files) {
  const rig = rigOf(f);
  for (const a of rig.animations) for (const [d, s] of Object.entries(a.sources ?? {}) as [DirectionName, { keypoints?: Keypoint[][]; measured?: Keypoint[][] }][]) {
    const seq = (s.measured?.length && s.measured.every(hasAll) ? s.measured : s.keypoints) as Keypoint[][]; if (!seq?.every(hasAll)) continue;
    if (variant(rig, seq, d) === decisiveAction(rig, a.id, d)) agree++; else { differ++; console.log(`variant differs: ${f} ${a.id}/${d}`); }
    if (/^(idle|walk)/.test(a.id)) for (const parts of [['ARM'], ['SHOULDER', 'ELBOW', 'ARM'], SIDES]) { swapTotal++; if (variant(rig, seq.map((fr, i) => (i ? fr : swapKp(fr, parts))), d)) swapFlips++; }
  }
}
console.log(`variant (mirror-tolerant moved): agrees with decisiveAction on ${agree} stored clips, differs on ${differ}; one-frame wrist, arm or full swaps flip ${swapFlips} of ${swapTotal} walk/idle cases`);
