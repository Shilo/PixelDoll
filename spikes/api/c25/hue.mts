// Harness-only azure key (round 2, arm Z): the green chroma ramp rotated +90° in hue (120° -> 210°), extracted by rotating the
// output back -90° and running the production green code. Green's score after the rotation equals the hue-window score
// 100·S·(1 − |Δh| / 60) around 210°, so this measures exactly what a production azure key would do.
import { chroma, items, type Img } from './lib.mts';
function rot(r: number, g: number, b: number, deg: number): [number, number, number] {
  const mx = Math.max(r, g, b), mn = Math.min(r, g, b), d = mx - mn;
  if (!d) return [r, g, b];
  let h = mx === r ? ((g - b) / d) % 6 : mx === g ? (b - r) / d + 2 : (r - g) / d + 4;
  h = (((h * 60 + deg) % 360) + 360) % 360;
  const c = d, x = c * (1 - Math.abs(((h / 60) % 2) - 1)), m = mn;
  const [R, G, B] = h < 60 ? [c, x, 0] : h < 120 ? [x, c, 0] : h < 180 ? [0, c, x] : h < 240 ? [0, x, c] : h < 300 ? [x, 0, c] : [c, 0, x];
  return [Math.round(R + m), Math.round(G + m), Math.round(B + m)];
}
export const rotate = (im: Img, deg: number): Img => { const d = new Uint8ClampedArray(im.data); for (let i = 0; i < d.length; i += 4) if (d[i + 3]) d.set(rot(d[i], d[i + 1], d[i + 2], deg), i); return { ...im, data: d }; };
export const azureMannequin = (base: Img) => rotate(chroma.toChroma(base, 'green'), 90);
/** Production extraction on an azure output: rotate to green, extract, rotate the layer back. */
export function azureCell(o: Parameters<typeof items.extractCell>[0]) {
  const c: any = items.extractCell({ ...o, out: rotate(o.out, -90), route: 'green' });
  c.layer = rotate(c.layer, 90); c.out = rotate(c.out, 90);
  return c;
}
export const AZURE_NAME = 'bright azure blue';
if (import.meta.main) { // rounding check on the ramp: rotate +90 then -90 must return the green ramp within 1 per channel
  let worst = 0;
  for (let t = 0; t <= 1.0001; t += 1 / 255) {
    const g: [number, number, number] = [Math.round(110 * t * t), Math.round(60 + 195 * t), Math.round(110 * t * t)];
    const a = rot(...g, 90), back = rot(...a, -90);
    worst = Math.max(worst, ...back.map((v, i) => Math.abs(v - g[i])));
    if (Math.abs(a[1] - (a[0] + a[2]) / 2) > 1) console.log('not azure', g, a);
  }
  console.log('ramp round trip worst channel error', worst);
}
