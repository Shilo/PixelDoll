// Colour model (architecture §6): OKLab, material ramps by weighted k-means, variant ramps from a hue, exact index swap.
// Colours are 24-bit ints (0xRRGGBB) inside, Hex strings in the manifest.
import type { Img } from '../image/png.ts';

export type Hex = `#${string}`;
export type Lab = [number, number, number];

export const toHex = (c: number) => `#${c.toString(16).padStart(6, '0')}` as Hex;
export const fromHex = (h: string) => parseInt(h.slice(1), 16);
const lin = (c: number) => ((c /= 255) <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4);
const gam = (c: number) => 255 * (c <= 0.0031308 ? 12.92 * c : 1.055 * c ** (1 / 2.4) - 0.055);

export function lab(c: number): Lab {
  const r = lin(c >> 16), g = lin((c >> 8) & 255), b = lin(c & 255);
  const l = Math.cbrt(0.4122214708 * r + 0.5363325363 * g + 0.0514459929 * b);
  const m = Math.cbrt(0.2119034982 * r + 0.6806995451 * g + 0.1073969566 * b);
  const s = Math.cbrt(0.0883024619 * r + 0.2817188376 * g + 0.6299787005 * b);
  return [0.2104542553 * l + 0.793617785 * m - 0.0040720468 * s, 1.9779984951 * l - 2.428592205 * m + 0.4505937099 * s, 0.0259040371 * l + 0.7827717662 * m - 0.808675766 * s];
}

/** OKLab -> 0xRRGGBB, or -1 when out of the sRGB gamut. */
export function rgb([L, a, b]: Lab): number {
  const l = (L + 0.3963377774 * a + 0.2158037573 * b) ** 3, m = (L - 0.1055613458 * a - 0.0638541728 * b) ** 3, s = (L - 0.0894841775 * a - 1.291485548 * b) ** 3;
  const v = [4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s, -1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s, -0.0041960863 * l - 0.7034186147 * m + 1.707614701 * s];
  if (v.some((x) => x < -1e-4 || x > 1 + 1e-4)) return -1;
  return v.reduce((o, x) => (o << 8) | Math.round(gam(Math.min(1, Math.max(0, x)))), 0);
}

/** LCh -> rgb, chroma reduced until it fits the gamut. */
function lch(L: number, C: number, h: number): number {
  L = Math.min(1, Math.max(0, L));
  for (let c = C; ; c *= 0.9) {
    const v = rgb([L, c * Math.cos(h), c * Math.sin(h)]);
    if (v >= 0 || c < 1e-3) return v >= 0 ? v : rgb([L, 0, 0]);
  }
}
const chroma = ([, a, b]: Lab) => Math.hypot(a, b);

/** Opaque colour -> pixel count over a set of images. */
export function colourCounts(imgs: Iterable<Img>): Map<number, number> {
  const out = new Map<number, number>();
  for (const im of imgs)
    for (let i = 0; i < im.data.length; i += 4)
      if (im.data[i + 3]) { const c = (im.data[i] << 16) | (im.data[i + 1] << 8) | im.data[i + 2]; out.set(c, (out.get(c) ?? 0) + 1); }
  return out;
}

export const OUTLINE_L = 0.25, OUTLINE_C = 0.035;

/** Clustering space: hue on a circle (radius saturates at C 0.06, so a shading ramp is one point), L at 0.3 weight. */
function feat(c: number): number[] {
  const [L, a, b] = lab(c), C = Math.hypot(a, b), r = (Math.min(C, 0.06) / 0.06) * 0.25;
  return C ? [L * 0.3, (a / C) * r, (b / C) * r] : [L * 0.3, 0, 0];
}

/**
 * Material ramps (dark -> light) from a colour histogram: weighted k-means in OKLab hue space (feat), so a ramp is one
 * hue family. Near-neutral darks (L < OUTLINE_L and C < OUTLINE_C: shared outlines) and colours in `claimed` (other materials)
 * are left out, which keeps ramps disjoint across materials (spec §3 inv. 5). Tinted dark outlines (a red cape's) stay in.
 */
// ponytail: fixed thresholds; a black-hair item keeps its darkest shade unrecolourable.
export function deriveRamps(counts: Map<number, number>, k: number, claimed = new Set<number>()): Hex[][] {
  const cols = [...counts].filter(([c]) => !claimed.has(c) && (lab(c)[0] >= OUTLINE_L || chroma(lab(c)) >= OUTLINE_C)).sort((x, y) => y[1] - x[1]);
  if (!cols.length) return [];
  const pts = cols.map(([c]) => feat(c));
  const d2 = (p: number[], q: number[]) => (p[0] - q[0]) ** 2 + (p[1] - q[1]) ** 2 + (p[2] - q[2]) ** 2;
  const cent = [pts[0]]; // deterministic farthest-point init from the most used colour
  while (cent.length < Math.min(k, pts.length)) cent.push(pts.reduce((best, p) => (Math.min(...cent.map((c) => d2(p, c))) > Math.min(...cent.map((c) => d2(best, c))) ? p : best)));
  let as: number[] = [];
  for (let it = 0; it < 12; it++) {
    as = pts.map((p) => cent.reduce((bi, c, i) => (d2(p, c) < d2(p, cent[bi]) ? i : bi), 0));
    cent.forEach((_, j) => {
      let w = 0; const s = [0, 0, 0];
      as.forEach((a, i) => { if (a === j) { const n = cols[i][1]; w += n; for (let q = 0; q < 3; q++) s[q] += pts[i][q] * n; } });
      if (w) cent[j] = s.map((v) => v / w);
    });
  }
  const groups = cent.map((_, j) => cols.filter((_, i) => as[i] === j)).filter((g) => g.length);
  const px = (g: [number, number][]) => g.reduce((s, x) => s + x[1], 0);
  return groups.sort((x, y) => px(y) - px(x)).map((g) => g.map(([c]) => c).sort((x, y) => lab(x)[0] - lab(y)[0]).map(toHex));
}

/** deriveRamps with the largest k (<= 4) whose ramp centroids are all >= minDist apart in feat space. */
export function autoRamps(counts: Map<number, number>, claimed?: Set<number>, minDist = 0.15): Hex[][] {
  const cen = (r: Hex[]) => { const c = r.map((h) => feat(fromHex(h))); return [0, 1, 2].map((q) => c.reduce((s, x) => s + x[q], 0) / c.length); };
  let best = deriveRamps(counts, 1, claimed);
  for (let k = 2; k <= 4; k++) {
    const r = deriveRamps(counts, k, claimed), c = r.map(cen);
    if (r.length === k && c.every((p, i) => c.every((q, j) => i >= j || Math.hypot(p[0] - q[0], p[1] - q[1], p[2] - q[2]) >= minDist))) best = r;
  }
  return best;
}

/** Variant ramp from a picked colour: hue of the pick, the source's lightness steps shifted to the pick's mean, chroma scaled. */
export function variantRamp(ramp: Hex[], pick: Hex): Hex[] {
  const src = ramp.map((h) => lab(fromHex(h))), p = lab(fromHex(pick));
  const mL = src.reduce((s, c) => s + c[0], 0) / src.length, mC = src.reduce((s, c) => s + chroma(c), 0) / src.length;
  const h = Math.atan2(p[2], p[1]), pC = chroma(p);
  return src.map((c) => toHex(lch(c[0] + p[0] - mL, mC > 0.03 ? (pC * chroma(c)) / mC : pC, h)));
}

/** "Grayscale + tint" (multiply) ramp, for comparison with variantRamp: grey = source lightness, times the pick. */
export function tintRamp(ramp: Hex[], pick: Hex): Hex[] {
  const t = fromHex(pick);
  return ramp.map((h) => {
    const g = rgb([lab(fromHex(h))[0], 0, 0]) & 255;
    return toHex(((((t >> 16) * g) / 255) << 16) | (((((t >> 8) & 255) * g) / 255) << 8) | (((t & 255) * g) / 255));
  });
}

/** Pixel -> colour id (index into `ids` order) or -1. Precomputed once per (image, material set); recolour is then a table write. */
export function indexImg(im: Img, ids: Map<number, number>): Int16Array {
  const out = new Int16Array(im.w * im.h).fill(-1);
  for (let i = 0, p = 0; i < im.data.length; i += 4, p++)
    if (im.data[i + 3]) out[p] = ids.get((im.data[i] << 16) | (im.data[i + 1] << 8) | im.data[i + 2]) ?? -1;
  return out;
}

/** Exact swap: colour id j -> table[j] (0xRRGGBB, or -1 = keep). Only table colours are introduced. */
export function applyIndex(im: Img, idx: Int16Array, table: Int32Array): Img {
  const d = new Uint8ClampedArray(im.data);
  for (let p = 0; p < idx.length; p++) {
    const j = idx[p], c = j < 0 ? -1 : table[j];
    if (c >= 0) { d[p * 4] = c >> 16; d[p * 4 + 1] = (c >> 8) & 255; d[p * 4 + 2] = c & 255; }
  }
  return { w: im.w, h: im.h, data: d };
}

const HUES: [string, number][] = [['red', 20], ['orange', 60], ['yellow', 100], ['green', 140], ['cyan', 200], ['blue', 260], ['purple', 310], ['pink', 350]];
/** Short colour word for a ramp (used for default material labels). */
export function hueName(ramp: Hex[]): string {
  const c = ramp.map((h) => lab(fromHex(h))), a = c.reduce((s, x) => s + x[1], 0) / c.length, b = c.reduce((s, x) => s + x[2], 0) / c.length;
  if (Math.hypot(a, b) < 0.03) return 'grey';
  const deg = ((Math.atan2(b, a) * 180) / Math.PI + 360) % 360;
  return HUES.reduce((best, h) => (Math.abs(((deg - h[1] + 540) % 360) - 180) < Math.abs(((deg - best[1] + 540) % 360) - 180) ? h : best))[0];
}

export function selfTest() {
  for (const c of [0x000000, 0xffffff, 0xb02832, 0x2a48b0, 0x7a828e]) console.assert(rgb(lab(c)) === c, `oklab roundtrip ${toHex(c)}`);
  const counts = new Map([[0x4a0d12, 5], [0x7d1820, 9], [0xb02832, 7], [0x2b2f36, 1], [0x4d535d, 6], [0x7a828e, 6], [0x101010, 30], [0x360a06, 2]]);
  const ramps = deriveRamps(counts, 2);
  console.assert(ramps.length === 2 && ramps[0].join() === '#360a06,#4a0d12,#7d1820,#b02832' && ramps[1].join() === '#2b2f36,#4d535d,#7a828e', `ramps by hue, dark->light, outline out: ${JSON.stringify(ramps)}`);
  console.assert(!deriveRamps(counts, 2, new Set([0x4a0d12, 0x7d1820])).flat().some((h) => h === '#4a0d12' || h === '#7d1820'), 'claimed colours excluded');
  console.assert(autoRamps(counts).length === 2, `autoRamps finds 2 hue families: ${JSON.stringify(autoRamps(counts))}`);
  const v = variantRamp(ramps[0], '#2a48b0'), vl = v.map((h) => lab(fromHex(h))[0]);
  console.assert(v.length === 4 && vl.every((l, i) => !i || l > vl[i - 1]) && hueName(v) === 'blue', `variant keeps steps, takes hue: ${v}`);
  console.assert(hueName(variantRamp(ramps[1], '#b02832')) === 'red', 'grey ramp gets the pick chroma');
  console.assert(tintRamp(['#000000', '#ffffff'], '#ff8000').join() === '#000000,#ff8000', 'multiply tint');
  const im: Img = { w: 3, h: 1, data: new Uint8ClampedArray([0x7d, 0x18, 0x20, 255, 1, 2, 3, 255, 0x7d, 0x18, 0x20, 0]) };
  const idx = indexImg(im, new Map([[0x7d1820, 1]]));
  const out = applyIndex(im, idx, new Int32Array([-1, 0x1b2f7d]));
  console.assert(idx.join() === '1,-1,-1', `index ${idx.join()}`);
  console.assert(out.data.join() === '27,47,125,255,1,2,3,255,125,24,32,0', `exact swap, others untouched: ${out.data.join()}`);
  const outCols = new Set(colourCounts([out]).keys());
  console.assert([...outCols].every((c) => c === 0x1b2f7d || c === 0x010203), 'no colours beyond the ramp');
}
