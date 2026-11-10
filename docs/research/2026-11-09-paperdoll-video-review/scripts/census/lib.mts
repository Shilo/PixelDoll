// Offline chroma-key census helpers. Imports production chroma code by absolute file URL; no PixelLab calls.
import fs from 'node:fs';
const APP = 'file:///C:/Programming_Files/Shilocity/PixelLab/PixelDoll/app/src/lib/';
export const chroma = await import(APP + 'image/chroma.ts');
const { decodePngBytes } = await import(APP + 'image/pngraw.ts');
export type Img = { w: number; h: number; data: Uint8ClampedArray };
export type RGB = [number, number, number];
export const load = async (f: string): Promise<Img> => decodePngBytes(new Uint8Array(fs.readFileSync(f)));
export const exists = (f: string) => fs.existsSync(f);

/** HSV hue rotation, identical to spikes/api/c25/hue.mts and chroma.ts hueRot. */
export function rot(r: number, g: number, b: number, deg: number): RGB {
  const mx = Math.max(r, g, b), mn = Math.min(r, g, b), d = mx - mn;
  if (!d) return [r, g, b];
  let h = mx === r ? ((g - b) / d) % 6 : mx === g ? (b - r) / d + 2 : (r - g) / d + 4;
  h = (((h * 60 + deg) % 360) + 360) % 360;
  const x = d * (1 - Math.abs(((h / 60) % 2) - 1));
  const [R, G, B] = h < 60 ? [d, x, 0] : h < 120 ? [x, d, 0] : h < 180 ? [0, d, x] : h < 240 ? [0, x, d] : h < 300 ? [x, 0, d] : [d, 0, x];
  return [Math.round(R + mn), Math.round(G + mn), Math.round(B + mn)];
}
export const hueOf = (r: number, g: number, b: number): number => {
  const mx = Math.max(r, g, b), d = mx - Math.min(r, g, b);
  if (!d) return -1;
  const h = mx === r ? ((g - b) / d) % 6 : mx === g ? (b - r) / d + 2 : (r - g) / d + 4;
  return (h * 60 + 360) % 360;
};
export const lum = (r: number, g: number, b: number) => (0.299 * r + 0.587 * g + 0.114 * b) / 255;
const greenRamp = (t: number): RGB => [Math.round(110 * t * t), Math.round(60 + 195 * t), Math.round(110 * t * t)];

/** Candidate keys. green/azure/blue/magenta use production keyScore; cyan and 195 are the green score after rotating back
 *  (exactly what a production hue key would do, as azure does). */
export interface KeyDef { id: string; hue: number; score: (c: RGB) => number; ramp: (t: number) => RGB }
const hueKey = (id: string, hue: number): KeyDef => ({
  id, hue,
  score: (c) => chroma.keyScore('green', ...rot(c[0], c[1], c[2], -(hue - 120))),
  ramp: (t) => { const g = greenRamp(t); return rot(g[0], g[1], g[2], hue - 120); },
});
export const KEYDEFS: KeyDef[] = [
  { id: 'green120', hue: 120, score: (c) => chroma.keyScore('green', ...c), ramp: greenRamp },
  hueKey('cyan180', 180),
  hueKey('h195', 195),
  { id: 'azure210', hue: 210, score: (c) => chroma.keyScore('azure', ...c), ramp: (t) => { const g = greenRamp(t); return rot(g[0], g[1], g[2], 90); } },
  { id: 'blue240', hue: 240, score: (c) => chroma.keyScore('blue', ...c), ramp: (t) => { const g = greenRamp(t); return [g[0], g[2], g[1]]; } },
  { id: 'magenta300', hue: 300, score: (c) => chroma.keyScore('magenta', ...c), ramp: (t) => [Math.round(70 + 185 * t), Math.round(110 * t * t), Math.round(70 + 185 * t)] },
];
export const KT = chroma.KT as number, NEAR = chroma.NEAR_KEY as number;
/** Production near-key rule (nearKeyShare): NEAR_KEY <= score < KT and brightest channel >= 64. */
export const classify = (k: KeyDef, c: RGB): 'lost' | 'near' | 'ok' => {
  const s = k.score(c);
  return s >= KT ? 'lost' : s >= NEAR && Math.max(...c) >= 64 ? 'near' : 'ok';
};
export const cheb = (a: ArrayLike<number>, i: number, b: ArrayLike<number>, j: number) =>
  Math.max(Math.abs(a[i] - b[j]), Math.abs(a[i + 1] - b[j + 1]), Math.abs(a[i + 2] - b[j + 2]));
export function pad(im: Img, w: number, h: number): Img {
  if (im.w === w && im.h === h) return im;
  const ox = (w - im.w) >> 1, oy = (h - im.h) >> 1, o: Img = { w, h, data: new Uint8ClampedArray(w * h * 4) };
  for (let y = 0; y < im.h; y++) o.data.set(im.data.subarray(y * im.w * 4, (y + 1) * im.w * 4), ((y + oy) * w + ox) * 4);
  return o;
}
