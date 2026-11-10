// Keys 3 (2026-11-10): the flat key construction, the window detector and the dark-skin body, shared by arm_k3.mts (paid) and
// eval_k3.mts (read-only). Loads no key and never spends: it imports production app code and hue.mts only, never y_env.mts.
// Flat mannequin = arm S fc/fg construction (five flat bright tones; base outline px drawn as the tone just under the skin) at
// any hue, with one fix: the outline cut is relative to the body's own skin lightness instead of an absolute OKLab L < 0.42,
// which turned 64 % of a dark-skinned body into the outline tone (keys3 CHALLENGE.md section 1).
import { rotate } from './hue.mts';
import { chroma, type Img } from './lib.mts';
const APP = new URL('../../../app/src/lib/', import.meta.url).href;
const { lab } = await import(APP + 'dress/palette.ts');

export type RGB = [number, number, number];
export function hsv(r: number, g: number, b: number): RGB {
  const mx = Math.max(r, g, b), mn = Math.min(r, g, b), d = mx - mn;
  if (!d) return [0, 0, mx / 255];
  const h = mx === r ? ((g - b) / d) % 6 : mx === g ? (b - r) / d + 2 : (r - g) / d + 4;
  return [(h * 60 + 360) % 360, d / mx, mx / 255];
}
function fromHsv(h: number, s: number, v: number): RGB {
  const c = v * s, x = c * (1 - Math.abs(((h / 60) % 2) - 1)), m = v - c;
  const [R, G, B] = h < 60 ? [c, x, 0] : h < 120 ? [x, c, 0] : h < 180 ? [0, c, x] : h < 240 ? [0, x, c] : h < 300 ? [x, 0, c] : [c, 0, x];
  return [Math.round((R + m) * 255), Math.round((G + m) * 255), Math.round((B + m) * 255)];
}
export const hgap = (h: number, H: number) => { const g = Math.abs(h - H) % 360; return Math.min(g, 360 - g); };
export const px = (im: Img, p: number): RGB => [im.data[p * 4], im.data[p * 4 + 1], im.data[p * 4 + 2]];
export const op = (im: Img, p: number) => im.data[p * 4 + 3] >= 128;
export function nb8(w: number, h: number, p: number, f: (q: number) => boolean, r = 1) {
  const x = p % w, y = (p / w) | 0;
  for (let dy = -r; dy <= r; dy++) for (let dx = -r; dx <= r; dx++) {
    const X = x + dx, Y = y + dy;
    if ((dx || dy) && X >= 0 && Y >= 0 && X < w && Y < h && f(Y * w + X)) return true;
  }
  return false;
}
const L = (r: number, g: number, b: number) => lab((r << 16) | (g << 8) | b)[0];

/** Third-party stand-in tones (outline, shadow, dark, main, light; all value >= 0.69) rotated to `hue` (arm S). */
const PINK = [[204, 22, 148], [176, 16, 128], [232, 28, 164], [255, 60, 188], [255, 128, 216]];
export const flatTones = (hue: number) => PINK.map(([r, g, b]) => { const [, s, v] = hsv(r, g, b); return fromHsv(hue, s, v); });
/** The arm S outline cut (OKLab L) for light skin and non-skin px. */
export const OUTLINE_L = 0.42;
/** Skin median L at or above which the cut stays OUTLINE_L. Light bodies measure 0.60 to 0.74 (A, B, body128 S/E/N), so their
 * mannequins stay byte-identical to arm S; deep skin (LPC 70,44,34 is L 0.32) scales the skin cut down with it. */
export const SKIN_REF = 0.55;
/** Skin-like px for the cut: warm hue, saturated, not near-black (HSV, so it still holds for deep skin, where OKLab chroma fades). */
export const warm = (r: number, g: number, b: number) => { const [h, s, v] = hsv(r, g, b); return (h <= 50 || h >= 340) && s >= 0.25 && v >= 0.12; };
const quant = (vals: number[], qs: number[]) => { const s = [...vals].sort((x, y) => x - y); return qs.map((q) => s[Math.min(s.length - 1, Math.floor(q * s.length))]); };
/** Per-view outline cuts: non-skin px OUTLINE_L, skin px OUTLINE_L x min(1, skin median L / SKIN_REF). */
export function outlineCut(base: Img): { other: number; skin: number; skinMedian: number } {
  const d = base.data, ls: number[] = [];
  for (let i = 0; i < d.length; i += 4) if (d[i + 3] && warm(d[i], d[i + 1], d[i + 2])) ls.push(L(d[i], d[i + 1], d[i + 2]));
  const skinMedian = ls.length ? quant(ls, [0.5])[0] : 1;
  return { other: OUTLINE_L, skin: OUTLINE_L * Math.min(1, skinMedian / SKIN_REF), skinMedian };
}
export const isOutline = (c: RGB, cut: ReturnType<typeof outlineCut>) => L(...c) < (warm(...c) ? cut.skin : cut.other);
/** Flat mannequin at `hue`: outline px (relative cut) get the tone just under the skin; the rest the shadow, dark, main, light
 * tone by the view's own lightness quartiles (arm S). */
export function flatMannequin(base: Img, hue: number): Img {
  const o: Img = { w: base.w, h: base.h, data: new Uint8ClampedArray(base.data) }, d = base.data, cut = outlineCut(base), tones = flatTones(hue);
  const c = (i: number): RGB => [d[i], d[i + 1], d[i + 2]], ls: number[] = [];
  for (let i = 0; i < d.length; i += 4) if (d[i + 3] && !isOutline(c(i), cut)) ls.push(L(...c(i)));
  const q = quant(ls, [0.25, 0.5, 0.75]);
  for (let i = 0; i < d.length; i += 4) {
    if (!d[i + 3]) continue;
    if (isOutline(c(i), cut)) { o.data.set(tones[0], i); continue; }
    const l = L(...c(i));
    o.data.set(tones[1 + (l < q[0] ? 0 : l < q[1] ? 1 : l < q[2] ? 2 : 3)], i);
  }
  return o;
}
/** Arm S skin class (OKLab): warm, chromatic, not near-black. */
const skinOf = (r: number, g: number, b: number) => { const [l, a, bb] = lab((r << 16) | (g << 8) | b), C = Math.hypot(a, bb), h = ((Math.atan2(bb, a) * 180) / Math.PI + 360) % 360; return l >= 0.25 && C >= 0.05 && h >= 15 && h <= 100; };
/** Deep skin stand-in: the base's skin px scaled by `f` in sRGB (0.42 puts body B's skin median at L 0.34, LPC deep 70,44,34 is 0.32). */
export const DARK_SKIN = 0.42;
export function darkSkin(base: Img, f = DARK_SKIN): Img {
  const o: Img = { w: base.w, h: base.h, data: new Uint8ClampedArray(base.data) }, d = base.data;
  for (let i = 0; i < d.length; i += 4) if (d[i + 3] && skinOf(d[i], d[i + 1], d[i + 2])) for (let k = 0; k < 3; k++) o.data[i + k] = Math.round(d[i + k] * f);
  return o;
}

/** Window detector settings. W20 decides for every hue (arm S pre-registration); W12 is a reported sensitivity only (O2 tuned it
 * on fg and fc outputs alone, so it carries no evidence at other hues). */
export const W20 = { win: 20, smin: 0.25, vmin: 0.3 } as const;
export const W12 = { win: 12, smin: 0.35, vmin: 0.5 } as const;
export type Win = { win: number; smin: number; vmin: number };
export const isFlatKey = (c: RGB, H: number, w: Win) => { const [h, s, v] = hsv(...c); return hgap(h, H) <= w.win && s >= w.smin && v >= w.vmin; };
/**
 * Arm S extraction for a flat key at hue H: key = inside the window; a key px darker than the mannequin's darkest key tone minus
 * 0.08 that touches the item is item (two passes); components under 2 px dropped. The layer is then despilled by the WORKING-TREE
 * production `despill` in the rotated frame (key moved to green, despilled with the composite, rotated back), so the evaluation
 * always measures what production despill does at run time. `absorbed` = px kept by the dark-touching rule.
 */
export function extractFlat(H: number, out: Img, input: Img, w: Win = W20) {
  const { w: W, h } = out, N = W * h, key = new Uint8Array(N);
  let vMin = 1;
  for (let p = 0; p < N; p++) if (op(input, p)) { const [hh, s, v] = hsv(...px(input, p)); if (hgap(hh, H) <= w.win && s >= w.smin) vMin = Math.min(vMin, v); }
  for (let p = 0; p < N; p++) if (op(out, p) && isFlatKey(px(out, p), H, w)) key[p] = 1;
  let m = new Uint8Array(N);
  for (let p = 0; p < N; p++) if (op(out, p) && !key[p]) m[p] = 1;
  const absorbed = new Uint8Array(N);
  for (let pass = 0; pass < 2; pass++) {
    const prev = m; m = new Uint8Array(prev);
    for (let p = 0; p < N; p++) if (key[p] && !prev[p] && hsv(...px(out, p))[2] < vMin - 0.08 && nb8(W, h, p, (q) => !!prev[q])) { m[p] = 1; absorbed[p] = 1; }
  }
  const mask = new Uint8Array(N), raw: Img = { w: W, h, data: new Uint8ClampedArray(N * 4) };
  for (const comp of chroma.components(m, W, h)) if (comp.length >= 2) for (const p of comp) { mask[p] = 1; raw.data.set(out.data.subarray(p * 4, p * 4 + 4), p * 4); }
  for (let p = 0; p < N; p++) if (!mask[p]) absorbed[p] = 0;
  const rot = 120 - H, layer = rot ? rotate(chroma.despill(rotate(raw, rot), 'green', rotate(out, rot)), -rot) : chroma.despill(raw, 'green', out);
  return { mask, raw, layer, key, absorbed };
}
/** CHALLENGE metric 10, "dark key-colored px kept": layer px on the base silhouette whose raw color is within 30 degrees of the
 * key hue, S >= 0.25 and V < 0.5. */
export const darkKeyKept = (c: RGB, H: number) => { const [h, s, v] = hsv(...c); return hgap(h, H) <= 30 && s >= 0.25 && v < 0.5; };
