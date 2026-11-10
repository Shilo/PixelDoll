// Wrapper around production chroma.ts (loaded as chroma.ts?real): re-exports everything, overrides chromaLayer to insert the
// prototype outline rule after absorbOutline. globalThis.__OUTLINE: 'off' | 'v1' | 'v2' | 'v3'.
const APP = 'file:///C:/Programming_Files/Shilocity/PixelLab/PixelDoll/app/src/lib/';
export * from 'file:///C:/Programming_Files/Shilocity/PixelLab/PixelDoll/app/src/lib/image/chroma.ts?real';
import * as R from 'file:///C:/Programming_Files/Shilocity/PixelLab/PixelDoll/app/src/lib/image/chroma.ts?real';
import { makeImg, type Img } from 'file:///C:/Programming_Files/Shilocity/PixelLab/PixelDoll/app/src/lib/image/png.ts';
void APP;
type Key = R.Key;
const lum = (r: number, g: number, b: number) => (0.299 * r + 0.587 * g + 0.114 * b) / 255;
/** Luminance in the key's frame (mirror of chroma.ts keyLum; blue = G/B swapped, azure = rotate -90). */
function keyLum(key: Key, r: number, g: number, b: number) {
  if (key === 'blue') return lum(r, b, g);
  if (key === 'azure') { const c = rot(r, g, b, -90); return lum(c[0], c[1], c[2]); }
  return lum(r, g, b);
}
function rot(r: number, g: number, b: number, deg: number): [number, number, number] {
  const mx = Math.max(r, g, b), mn = Math.min(r, g, b), d = mx - mn;
  if (!d) return [r, g, b];
  let h = mx === r ? ((g - b) / d) % 6 : mx === g ? (b - r) / d + 2 : (r - g) / d + 4;
  h = (((h * 60 + deg) % 360) + 360) % 360;
  const x = d * (1 - Math.abs(((h / 60) % 2) - 1));
  const [A, B, C] = h < 60 ? [d, x, 0] : h < 120 ? [x, d, 0] : h < 180 ? [0, d, x] : h < 240 ? [0, x, d] : h < 300 ? [x, 0, d] : [d, 0, x];
  return [Math.round(A + mn), Math.round(B + mn), Math.round(C + mn)];
}
/** Luminance of the key ramp's darkest shade, in the key's frame (green (0,60,0) = 0.138). */
export const DARKEST = 0.299 * 0 + (0.587 * 60) / 255;
export const RD = 40;
export const stats = { added: [] as { p: number; w: number }[] };
/**
 * Prototype rule: a key-scored opaque px far from the key ramp (rampDistance > RD) touching kept item px is item outline.
 * v1: 8-neighbor touch, 2 passes. v2: v1 + darker than the ramp's darkest shade (keyLum < DARKEST). v3: v2 + 4-neighbor touch.
 */
export function keepOutline(m: Uint8Array, B: Img, C: Img, key: Key, kT: number, v: string): Uint8Array {
  if (!v || v === 'off') return m;
  const { w, h } = C, d = C.data;
  let o = new Uint8Array(m);
  const cand = (p: number) => {
    if (d[p * 4 + 3] < 128 || R.keyScore(key, d[p * 4], d[p * 4 + 1], d[p * 4 + 2]) < kT) return false;
    if (R.rampDistance(key, d[p * 4], d[p * 4 + 1], d[p * 4 + 2]) <= RD) return false;
    if (v !== 'v1' && keyLum(key, d[p * 4], d[p * 4 + 1], d[p * 4 + 2]) >= DARKEST) return false;
    return true;
  };
  for (let pass = 0; pass < 2; pass++) {
    const prev = o;
    o = new Uint8Array(prev);
    for (let p = 0; p < o.length; p++) {
      if (prev[p] || !cand(p)) continue;
      const x = p % w, y = (p / w) | 0;
      let touch = false;
      for (let dy = -1; dy <= 1 && !touch; dy++)
        for (let dx = -1; dx <= 1; dx++) {
          if (!dx && !dy) continue;
          if (v === 'v3' && dx && dy) continue;
          const X = x + dx, Y = y + dy;
          if (X >= 0 && Y >= 0 && X < w && Y < h && prev[Y * w + X]) { touch = true; break; }
        }
      if (touch) o[p] = 1;
    }
  }
  return o;
}
export function chromaLayer(C: Img, key: Key, B: Img, { kT = R.KT, minPx = 2 } = {}): { layer: Img; mask: Uint8Array } {
  const m00 = R.absorbOutline(R.dropKeyOutline(R.chromaMask(C, key, kT), B, C, key, kT), B, C, key, kT);
  const m0 = keepOutline(m00, B, C, key, kT, (globalThis as any).__OUTLINE ?? 'off');
  for (let p = 0; p < m0.length; p++) if (m0[p] && !m00[p]) stats.added.push({ p, w: C.w });
  const mask = new Uint8Array(m0.length), L = makeImg(C.w, C.h);
  for (const comp of R.components(m0, C.w, C.h))
    if (comp.length >= minPx) for (const p of comp) { mask[p] = 1; L.data.set(C.data.subarray(p * 4, p * 4 + 4), p * 4); }
  return { layer: R.despill(L, key), mask };
}
