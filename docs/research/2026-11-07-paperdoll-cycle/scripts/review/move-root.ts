// Review of decisiveAction: the joint motion with the hip-center translation removed (root motion such as a jump or a slide
// is not a pose change), on the KayKit clips projected as in scripts/moves/kaykit-stats.ts. Run from the repo root:
//   node docs/research/2026-11-07-paperdoll-cycle/scripts/review/move-root.ts
import { readFileSync } from 'node:fs';
const dir = new URL('../../../../../app/dev-fixtures/motion-lab/', import.meta.url);
type V = [number, number, number];
const views: Record<string, (p: V) => [number, number]> = { south: ([x, y]) => [x, -y], east: ([, y, z]) => [z, -y], 'south-east': ([x, y, z]) => [(x + z) / Math.SQRT2, -y] };
const idle = JSON.parse(readFileSync(new URL('kaykit-idle.json', dir), 'utf8')).clip.samples[0].points as Record<string, V>;
for (const name of ['idle', 'walk', 'run', 'attack', 'hurt', 'death']) {
  const samples = JSON.parse(readFileSync(new URL(`kaykit-${name}.json`, dir), 'utf8')).clip.samples as { points: Record<string, V> }[];
  const out: string[] = [];
  for (const [v, proj] of Object.entries(views)) {
    const P = (pts: Record<string, V>) => Object.fromEntries(Object.entries(pts).map(([k, p]) => [k, proj(p)])) as Record<string, [number, number]>;
    const rest = P(idle), ank = [(rest['RIGHT LEG'][0] + rest['LEFT LEG'][0]) / 2, (rest['RIGHT LEG'][1] + rest['LEFT LEG'][1]) / 2];
    const top = rest.NOSE ?? rest.NECK, H = Math.hypot(ank[0] - top[0], ank[1] - top[1]), labels = Object.keys(rest).filter((l) => l !== 'NOSE' || rest.NOSE);
    const hip = (p: Record<string, [number, number]>) => [(p['RIGHT HIP'][0] + p['LEFT HIP'][0]) / 2, (p['RIGHT HIP'][1] + p['LEFT HIP'][1]) / 2];
    const seq = samples.map((s) => P(s.points)), r0 = hip(rest);
    const abs = Math.max(...seq.map((p) => Math.max(...labels.filter((l) => p[l]).map((l) => Math.hypot(p[l][0] - rest[l][0], p[l][1] - rest[l][1]))))) / H;
    const rel = Math.max(...seq.map((p) => { const h = hip(p), dx = h[0] - r0[0], dy = h[1] - r0[1]; return Math.max(...labels.filter((l) => p[l]).map((l) => Math.hypot(p[l][0] - dx - rest[l][0], p[l][1] - dy - rest[l][1]))); })) / H;
    out.push(`${v}: moved ${abs.toFixed(2)} root-free ${rel.toFixed(2)}`);
  }
  console.log(name.padEnd(7), out.join(' | '));
}
