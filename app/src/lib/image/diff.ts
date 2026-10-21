// Fallback extractor (architecture §3.2 "Fallback"): item generated on the REAL base, layer = composite − base.
// S1 `auto` (slot_novel2_grow1, else slot ∩ novel_cc when novel2 lost > 25 %) + S2 skin-only rejection + pinhole fill.
// Port of spikes/api/lib/{diff,extract,clean}.mjs. Leaves ≈ 9–12 false body px per cell [S2 X3]: always human-reviewed.
import { components, fillHoles } from './chroma.ts';
import { makeImg, type Img } from './png.ts';

export interface Rect { x: number; y: number; w: number; h: number }
type Rgb = [number, number, number];

const inR = (r: Rect, p: number, w: number) => { const x = p % w, y = (p / w) | 0; return x >= r.x && y >= r.y && x < r.x + r.w && y < r.y + r.h; };
const rgb = (im: Img, i: number): Rgb => [im.data[i], im.data[i + 1], im.data[i + 2]];

/** Premultiplied max-channel delta and alpha delta per pixel. */
function deltas(B: Img, C: Img) {
  const n = B.w * B.h, dm = new Float32Array(n), da = new Float32Array(n);
  for (let p = 0, i = 0; p < n; p++, i += 4) {
    const ab = B.data[i + 3] / 255, ac = C.data[i + 3] / 255;
    for (let c = 0; c < 3; c++) dm[p] = Math.max(dm[p], Math.abs(B.data[i + c] * ab - C.data[i + c] * ac));
    da[p] = Math.abs(B.data[i + 3] - C.data[i + 3]);
  }
  return { dm, da };
}
function palette(im: Img, keep: (p: number) => boolean = () => true): Rgb[] {
  const s = new Map<number, Rgb>();
  for (let p = 0, i = 0; p < im.w * im.h; p++, i += 4) if (im.data[i + 3] && keep(p)) s.set((im.data[i] << 16) | (im.data[i + 1] << 8) | im.data[i + 2], rgb(im, i));
  return [...s.values()];
}
const palDist = (pal: Rgb[], [r, g, b]: Rgb) => pal.reduce((m, [R, G, Bl]) => Math.min(m, Math.max(Math.abs(R - r), Math.abs(G - g), Math.abs(Bl - b))), 1e9);

function keepComponents(m: Uint8Array, w: number, h: number, minArea: number, region: Rect): Uint8Array {
  const o = new Uint8Array(m.length);
  for (const c of components(m, w, h)) if (c.length >= minArea && c.some((p) => inR(region, p, w))) for (const p of c) o[p] = 1;
  return o;
}
function dilate(m: Uint8Array, w: number, h: number): Uint8Array {
  const o = new Uint8Array(m.length);
  for (let p = 0; p < m.length; p++) {
    if (!m[p]) continue;
    const x = p % w, y = (p / w) | 0;
    for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) { const X = x + dx, Y = y + dy; if (X >= 0 && Y >= 0 && X < w && Y < h) o[Y * w + X] = 1; }
  }
  return o;
}

/** Changed px that are new on empty canvas, a big change, or off the base palette. */
function maskNovel(B: Img, C: Img, { t = 8, big = 60, palT = 12 } = {}) {
  const { dm, da } = deltas(B, C), pal = palette(B), m = new Uint8Array(dm.length);
  for (let p = 0, i = 0; p < m.length; p++, i += 4)
    if ((dm[p] > t || da[p] > 16) && C.data[i + 3] && (!B.data[i + 3] || dm[p] > big || palDist(pal, rgb(C, i)) > palT)) m[p] = 1;
  return m;
}
/** novel2: also learns the redrawn-body palette outside the region and the item core palette (added on empty canvas inside). */
function maskNovel2(B: Img, C: Img, r: Rect, { t = 8, palT = 12, coreT = 6 } = {}) {
  const w = B.w, { dm, da } = deltas(B, C), basePal = palette(B), m = new Uint8Array(dm.length);
  const body = palette(C, (p) => !inR(r, p, w) && !!B.data[p * 4 + 3]);
  const core = palette(C, (p) => inR(r, p, w) && !B.data[p * 4 + 3]).filter((c) => palDist(body, c) > 0);
  for (let p = 0, i = 0; p < m.length; p++, i += 4) {
    if (!inR(r, p, w) || !(dm[p] > t || da[p] > 16) || !C.data[i + 3]) continue;
    const c = rgb(C, i);
    if (!B.data[i + 3] || (core.length && palDist(core, c) <= coreT) || (palDist(basePal, c) > palT && palDist(body, c) > palT)) m[p] = 1;
  }
  return m;
}
function growInto(seed: Uint8Array, B: Img, C: Img, t = 18) {
  const { dm, da } = deltas(B, C), d = dilate(seed, B.w, B.h), o = new Uint8Array(seed);
  for (let p = 0; p < o.length; p++) if (d[p] && (dm[p] > t || da[p] > 16) && C.data[p * 4 + 3]) o[p] = 1;
  return o;
}
const clip = (m: Uint8Array, w: number, r: Rect) => m.map((v, p) => (v && inR(r, p, w) ? 1 : 0));
const count = (m: Uint8Array) => m.reduce((a, b) => a + b, 0);

/** S1 `auto` + skin-only rejection (base colours with r−b > 30, Δ <= 10) + pinhole fill. `useCc` = per-item novel_cc fallback. */
export function diffLayer(B: Img, C: Img, region: Rect, useCc?: boolean): { layer: Img; mask: Uint8Array; novel2Ratio: number } {
  const { w, h } = B;
  const cc = clip(keepComponents(maskNovel(B, C), w, h, 3, region), w, region);
  const n2 = clip(growInto(keepComponents(maskNovel2(B, C, region), w, h, 3, region), B, C), w, region);
  const novel2Ratio = count(cc) ? count(n2) / count(cc) : 1;
  let m: Uint8Array = (useCc ?? novel2Ratio < 0.75) ? cc : n2;
  const skin = palette(B).filter(([r, , b]) => r - b > 30);
  m = m.map((v, p) => (v && B.data[p * 4 + 3] && palDist(skin, rgb(C, p * 4)) <= 10 ? 0 : v));
  m = fillHoles(m, C, 4);
  const L = makeImg(w, h);
  for (let p = 0; p < m.length; p++) if (m[p]) L.data.set(C.data.subarray(p * 4, p * 4 + 4), p * 4);
  return { layer: L, mask: m, novel2Ratio };
}

export function selfTest() {
  const B = makeImg(8, 8), C = makeImg(8, 8);
  for (let p = 0; p < 64; p++) if (p % 8 > 1 && p % 8 < 6) { B.data.set([200, 140, 110, 255], p * 4); C.data.set([201, 140, 110, 255], p * 4); } // skin + drift
  for (const p of [10, 11, 12, 18, 20, 26, 27, 28]) C.data.set([60, 60, 70, 255], p * 4); // a grey ring (item) with a skin hole at 19
  C.data.set([0, 200, 0, 255], 1); // new px on empty canvas, outside the region
  const { mask } = diffLayer(B, C, { x: 0, y: 0, w: 8, h: 4 });
  console.assert([10, 11, 12, 18, 20, 26, 27, 28].every((p) => mask[p]) && mask[19] === 1, 'ring kept, skin pinhole filled');
  console.assert(!mask[1] && count(mask) === 9, `speck dropped, no body px (got ${count(mask)})`);
  console.assert(count(diffLayer(B, C, { x: 0, y: 0, w: 8, h: 3 }).mask) === 5, 'region clips');
}
