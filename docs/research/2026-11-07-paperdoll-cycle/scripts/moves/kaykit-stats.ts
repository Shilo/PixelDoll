// Free: the same motion statistics on the licensed KayKit 3D clips (dev-fixtures/motion-lab), projected to 2D views.
import { readFileSync } from 'node:fs';
const dir = new URL('../../../../../app/dev-fixtures/motion-lab/', import.meta.url);
type V = [number, number, number];
const views: Record<string, (p: V) => [number, number]> = { south: ([x, y]) => [x, -y], east: ([, y, z]) => [z, -y], north: ([x, y]) => [-x, -y], 'south-east': ([x, y, z]) => [(x + z) / Math.SQRT2, -y] };
const idle = JSON.parse(readFileSync(new URL('kaykit-idle.json', dir), 'utf8')).clip.samples[0].points as Record<string, V>;
for (const name of ['idle', 'walk', 'run', 'attack', 'hurt', 'death']) {
  const samples = JSON.parse(readFileSync(new URL(`kaykit-${name}.json`, dir), 'utf8')).clip.samples as { points: Record<string, V> }[];
  const out: string[] = [];
  for (const [v, proj] of Object.entries(views)) {
    const P = (pts: Record<string, V>) => Object.fromEntries(Object.entries(pts).map(([k, p]) => [k, proj(p)])) as Record<string, [number, number]>;
    const rest = P(idle), ank: [number, number] = [(rest['RIGHT LEG'][0] + rest['LEFT LEG'][0]) / 2, (rest['RIGHT LEG'][1] + rest['LEFT LEG'][1]) / 2];
    const top = rest.NOSE ?? rest.NECK, H = Math.hypot(ank[0] - top[0], ank[1] - top[1]), labels = Object.keys(rest);
    const seq = samples.map((s) => P(s.points));
    const all = Math.max(...seq.map((p) => Math.max(...labels.filter((l) => p[l]).map((l) => Math.hypot(p[l][0] - rest[l][0], p[l][1] - rest[l][1]))))) / H;
    const rise = Math.max(...seq.map((p) => Math.max(...['RIGHT ARM', 'LEFT ARM'].map((l) => (rest[l][1] - p[l][1]) / H))));
    const lean = Math.max(...seq.map((p) => { const h = [(p['RIGHT HIP'][0] + p['LEFT HIP'][0]) / 2, (p['RIGHT HIP'][1] + p['LEFT HIP'][1]) / 2]; return Math.abs(Math.atan2(p.NECK[0] - h[0], h[1] - p.NECK[1])) * 180 / Math.PI; }));
    out.push(`${v}: all ${all.toFixed(2)} rise ${rise.toFixed(2)} lean ${Math.round(lean)}`);
  }
  console.log(name.padEnd(7), out.join(' | '));
}
