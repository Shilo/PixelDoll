// Free: how far each joint moves from the standing pose, per clip, on real bench rigs and the app's authored actions.
// Run from the repo root: node docs/research/2026-11-07-paperdoll-cycle/scripts/moves/motion-stats.ts
import { readFileSync } from 'node:fs';
import { ACTIONS, authoredPoses, fromApi, LABELS } from '../../../../../app/src/lib/rig/poses.ts';
import type { Keypoint } from '../../../../../app/src/lib/rig/rig.ts';
type P = Record<string, { x: number; y: number }>;
const FIX = new URL('../../../../../app/test/fixtures/bench/', import.meta.url);
const rows: { src: string; clip: string; stat: Record<string, number> }[] = [];
const mid = (p: P, a: string, b: string) => ({ x: (p[a].x + p[b].x) / 2, y: (p[a].y + p[b].y) / 2 });
function stats(rest: P, seq: P[]) {
  const ank = mid(rest, 'RIGHT LEG', 'LEFT LEG'), H = Math.hypot(ank.x - rest.NOSE.x, ank.y - rest.NOSE.y);
  const d = (j: string[]) => Math.max(...seq.map((p) => Math.max(...j.map((l) => Math.hypot(p[l].x - rest[l].x, p[l].y - rest[l].y))))) / H;
  const up = Math.max(...seq.map((p) => Math.max(...['RIGHT ARM', 'LEFT ARM'].map((l) => (rest[l].y - p[l].y) / H))));
  const lean = Math.max(...seq.map((p) => { const h = mid(p, 'RIGHT HIP', 'LEFT HIP'); return Math.abs(Math.atan2(p.NECK.x - h.x, h.y - p.NECK.y)) * 180 / Math.PI; }));
  const hipMove = Math.max(...seq.map((p) => { const h = mid(p, 'RIGHT HIP', 'LEFT HIP'), r = mid(rest, 'RIGHT HIP', 'LEFT HIP'); return Math.hypot(h.x - r.x, h.y - r.y); })) / H;
  return { all: +d(LABELS as unknown as string[]).toFixed(2), wrists: +d(['RIGHT ARM', 'LEFT ARM']).toFixed(2), ankles: +d(['RIGHT LEG', 'LEFT LEG']).toFixed(2), wristRise: +up.toFixed(2), lean: Math.round(lean), hips: +hipMove.toFixed(2) };
}
for (const b of ['A', 'B', 'C', 'N']) {
  const rig = JSON.parse(readFileSync(new URL(`body${b}.json`, FIX), 'utf8')).rig, cell = rig.cell;
  for (const [dir, r] of Object.entries(rig.rest ?? {}) as [string, { keypoints: Keypoint[] }][]) {
    const rest = fromApi(r.keypoints, cell) as unknown as P;
    for (const a of rig.animations) { const k = a.sources?.[dir]?.keypoints; if (k) rows.push({ src: `bench${b}`, clip: `${a.id}/${dir}`, stat: stats(rest, k.map((f: Keypoint[]) => fromApi(f, cell) as unknown as P)) }); }
    for (const act of Object.keys(ACTIONS)) rows.push({ src: `authored${b}`, clip: `${act}/${dir}`, stat: stats(rest, authoredPoses(act, fromApi(r.keypoints, cell), dir as never, cell.w) as unknown as P[]) });
  }
}
if (process.argv.includes("--rows")) for (const r of rows) if (r.clip.startsWith(process.argv.at(-1)!)) console.log(r.src, r.clip, JSON.stringify(r.stat));
const byMove = new Map<string, typeof rows>();
for (const r of rows) { const m = `${r.src.replace(/[A-Z]$/, '')}:${r.clip.split('/')[0]}`; (byMove.get(m) ?? (byMove.set(m, []), byMove.get(m)!)).push(r); }
for (const [m, rs] of [...byMove].sort()) {
  const k = Object.keys(rs[0].stat), range = (key: string) => `${Math.min(...rs.map((r) => r.stat[key]))}-${Math.max(...rs.map((r) => r.stat[key]))}`;
  console.log(m.padEnd(22), String(rs.length).padStart(3), k.map((key) => `${key} ${range(key)}`).join('  '));
}
