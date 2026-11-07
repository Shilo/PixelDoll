// Synthetic fixtures for the regression tests a production change would need (no corpus pixels).
// 1. A hue-shifted near-white cloth ramp (cool shadows to warm highlights, chroma 0.03): production splits it; the
//    neutral-guarded adjacency merge must make it one ramp. 2. A neutral steel blade touching a gold guard: must stay two.
// 3. Gray clothes touching a skin ramp: must stay two. Usage (repo root): node .../scripts/dye/synthetic.ts
import { autoRamps, colorCounts, rgb } from '../../../../../app/src/lib/dress/palette.ts';
import { makeImg } from '../../../../../app/src/lib/image/png.ts';
import { chains, hybrid, neutralFamily } from './detectors.ts';

const ramp = (n: number, L0: number, L1: number, C: number, h0: number, h1: number) =>
  Array.from({ length: n }, (_, i) => { const t = i / (n - 1), h = ((h0 + (h1 - h0) * t) * Math.PI) / 180, L = L0 + (L1 - L0) * t; return rgb([L, C * Math.cos(h), C * Math.sin(h)]); });
/** Vertical bands of 3 px per color (adjacent shades touch), several rows. */
const bands = (...groups: number[][]) => { const cs = groups.flat(), im = makeImg(cs.length * 3, 8);
  cs.forEach((c, i) => { for (let y = 0; y < 8; y++) for (let x = 0; x < 3; x++) im.data.set([c >> 16, (c >> 8) & 255, c & 255, 255], (y * im.w + i * 3 + x) * 4); }); return im; };
const run = (name: string, ...groups: number[][]) => {
  const im = bands(...groups), prod = autoRamps(colorCounts([im])).map((r) => r.map((h) => parseInt(h.slice(1), 16)));
  const out = hybrid(prod, chains([im], false), neutralFamily);
  const mixed = (rs: number[][]) => rs.some((r) => groups.filter((g) => r.some((c) => g.includes(c))).length > 1);
  const whole = (rs: number[][]) => groups.every((g) => rs.some((r) => g.every((c) => r.includes(c))));
  console.log(name.padEnd(26), `production ${prod.length} ramps, each material whole ${whole(prod)}, mixed ${mixed(prod)}`, `| candidate ${out.length} ramps, whole ${whole(out)}, mixed ${mixed(out)}`);
};
const white = ramp(6, 0.42, 0.95, 0.03, 300, 100); // cool purple shadow to warm cream highlight
run('hue-shifted white cloth', white);
run('uniform gray L 0.33-0.98', ramp(8, 0.33, 0.98, 0.006, 290, 290));
run('steel blade + gold guard', ramp(5, 0.4, 0.75, 0.02, 200, 200), ramp(2, 0.53, 0.7, 0.075, 95, 95));
run('gray clothes + skin', ramp(6, 0.35, 0.8, 0.02, 240, 240), ramp(6, 0.45, 0.88, 0.1, 45, 55));
