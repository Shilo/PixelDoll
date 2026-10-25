// Chroma mannequin (S2, architecture §3.1–3.2): recolor the frozen base to a key ramp, let PixelLab dress the key mannequin,
// then item = opaque pixels that are not key-colored. Port of spikes/api/lib/chroma.mjs. Pure over Img; masks = Uint8Array(w*h).
import { makeImg, type Img } from './png.ts';

// Blue (2026-10-25 campaign, arm K) is the third key, for prompts whose colors collide with both green and magenta (green + pink
// or red). Azure (round 2, arm Z) is the fourth, for green + purple, violet or indigo: the green ramp rotated +90° in hue (210°);
// its score, luminance and despill work in that rotated frame, exactly as measured.
export type Key = 'green' | 'magenta' | 'blue' | 'azure';
export const KEYS: Key[] = ['green', 'magenta', 'blue', 'azure'];
export const KEY_NAME: Record<Key, string> = { green: 'bright green', magenta: 'magenta', blue: 'bright blue', azure: 'bright azure blue' };
/** The key a G2 key/item collision switches to: the first other key the prompt allows, in pickKey order. */
export const switchTo = (prompt: string, k: Key): Key | undefined => KEYS.find((x) => x !== k && keyAllowed(prompt, x));

const lum = (r: number, g: number, b: number) => (0.299 * r + 0.587 * g + 0.114 * b) / 255;
/** Rotate a color's hue by deg (HSV, saturation and value kept, rounded). */
function hueRot(r: number, g: number, b: number, deg: number): [number, number, number] {
  const mx = Math.max(r, g, b), mn = Math.min(r, g, b), d = mx - mn;
  if (!d) return [r, g, b];
  let h = mx === r ? ((g - b) / d) % 6 : mx === g ? (b - r) / d + 2 : (r - g) / d + 4;
  h = (((h * 60 + deg) % 360) + 360) % 360;
  const x = d * (1 - Math.abs(((h / 60) % 2) - 1));
  const [R, G, B] = h < 60 ? [d, x, 0] : h < 120 ? [x, d, 0] : h < 180 ? [0, d, x] : h < 240 ? [0, x, d] : h < 300 ? [x, 0, d] : [d, 0, x];
  return [Math.round(R + mn), Math.round(G + mn), Math.round(B + mn)];
}
/** Luminance in the key's frame: blue is the green ramp with G and B swapped, azure the green ramp rotated +90°, so their key px
 *  weigh like green's. */
const keyLum = (key: Key, r: number, g: number, b: number) => (key === 'blue' ? lum(r, b, g) : key === 'azure' ? lum(...hueRot(r, g, b, -90)) : lum(r, g, b));
const RAMP: Record<Key, (t: number) => [number, number, number]> = {
  green: (t) => [Math.round(110 * t * t), Math.round(60 + 195 * t), Math.round(110 * t * t)],
  magenta: (t) => [Math.round(70 + 185 * t), Math.round(110 * t * t), Math.round(70 + 185 * t)],
  blue: (t) => [Math.round(110 * t * t), Math.round(110 * t * t), Math.round(60 + 195 * t)], // the green ramp with G and B swapped
  azure: (t) => hueRot(...RAMP.green(t), 90), // G = (R + B) / 2
};

// Substrings, so compounds ("darkgreen", "bloodred") count; "red" after a vowel is a word ending (colored, covered, armored).
const HUES: Record<Key, RegExp> = {
  green: /green|emerald|lime|olive|jade|teal|mint|forest/i,
  magenta: /(?<![aeiou])red|crimson|scarlet|maroon|ruby|pink|rose|purple|violet|indigo|plum|orchid|grape|amethyst|lavender|lilac|mauve|magenta|fuchsia/i, // indigo 58, orchid 47, plum 45, grape 39 as magenta key
  // purples score as blue key too (blueviolet 39, indigo 42 against KT 35)
  blue: /blue|navy|azure|cyan|teal|sapphire|cobalt|indigo|turquoise|aqua|cerulean|purple|violet|lavender|lilac|plum|mauve|orchid|grape|amethyst/i,
  // blues and blue-greens score 50-67 as azure key; purples 0-12 and emerald 0
  azure: /blue|navy|azure|cyan|teal|\bsky|ocean|denim|sapphire|cobalt|turquoise|aqua|cerulean/i,
};
/** May this key be used for an item? A key must stay far from the item hue (magenta failed on a red cape, gray on steel [S2]). */
export const keyAllowed = (prompt: string, k: Key) => !HUES[k].test(prompt);
/**
 * Green unless the item's color words collide with green (S2 rule), then magenta, then blue (green + pink: magenta keyed out the
 * pink on every frame), then azure (green + purple: magenta removed the purple stripes while every gate passed). When all four
 * collide, magenta as before: still posable; the diff route would not be. Gray is never used.
 */
export const pickKey = (prompt: string): Key => KEYS.find((k) => keyAllowed(prompt, k)) ?? 'magenta';

/** Every opaque pixel -> key ramp by luminance normalized over the cell's opaque range. Alpha (silhouette) unchanged. */
export function toChroma(B: Img, key: Key): Img {
  const o: Img = { w: B.w, h: B.h, data: new Uint8ClampedArray(B.data) }, d = B.data;
  let lo = 1, hi = 0;
  for (let i = 0; i < d.length; i += 4) if (d[i + 3]) { const l = lum(d[i], d[i + 1], d[i + 2]); lo = Math.min(lo, l); hi = Math.max(hi, l); }
  for (let i = 0; i < d.length; i += 4) if (d[i + 3]) o.data.set(RAMP[key]((lum(d[i], d[i + 1], d[i + 2]) - lo) / (hi - lo || 1)), i);
  return o;
}

/** Key-likeness 0..100 as a RATIO (the returned dark outline 9,39,7 must still score as key). Excess < 12 = not key. */
/** The key's channel excess over the other channels, and the channel it is measured against. */
const excess = (key: Key, r: number, g: number, b: number): [number, number] =>
  key === 'azure' ? excess('green', ...hueRot(r, g, b, -90))
    : key === 'green' ? [g - Math.max(r, b), g] : key === 'blue' ? [b - Math.max(r, g), b] : [Math.min(r, b) - g, Math.max(r, b)];
export function keyScore(key: Key, r: number, g: number, b: number): number {
  const [ex, mx] = excess(key, r, g, b);
  return ex < 12 ? 0 : Math.round((100 * ex) / Math.max(mx, 1));
}
const tint = (key: Key, r: number, g: number, b: number) => {
  const [ex, mx] = excess(key, r, g, b);
  return ex >= 5 ? (100 * ex) / Math.max(mx, 1) : 0;
};
const isKey = (C: Img, p: number, key: Key, kT: number) => C.data[p * 4 + 3] >= 128 && keyScore(key, C.data[p * 4], C.data[p * 4 + 1], C.data[p * 4 + 2]) >= kT;

export const KT = 35;

export function chromaMask(C: Img, key: Key, kT = KT): Uint8Array {
  const m = new Uint8Array(C.w * C.h);
  for (let p = 0; p < m.length; p++) if (C.data[p * 4 + 3] >= 128 && !isKey(C, p, key, kT)) m[p] = 1;
  return m;
}

/**
 * Rim guard: drop mask px on the base silhouette ring (or a dark base px) whose base-opaque 4-neighbors are mostly key in C
 * (S2: a mannequin outline redrawn off-key, olive 48,46,11). M3 refinement: a candidate that touches item px which are not
 * candidates themselves is the item's own outline (hair tips, trouser edges over dark base lines) and is kept.
 */
export function dropKeyOutline(mask: Uint8Array, B: Img, C: Img, key: Key, kT = KT): Uint8Array {
  const { w, h } = B, cand = new Uint8Array(mask.length), op = (p: number) => B.data[p * 4 + 3] > 0;
  for (let p = 0; p < mask.length; p++) {
    if (!mask[p] || !op(p)) continue;
    const x = p % w, y = (p / w) | 0;
    const nb = [[x - 1, y], [x + 1, y], [x, y - 1], [x, y + 1]].filter(([X, Y]) => X >= 0 && Y >= 0 && X < w && Y < h).map(([X, Y]) => Y * w + X);
    const edge = nb.length < 4 || nb.some((q) => !op(q)), dark = (B.data[p * 4] + B.data[p * 4 + 1] + B.data[p * 4 + 2]) / 3 < 60;
    if ((edge || dark) && nb.filter((q) => op(q) && isKey(C, q, key, kT)).length >= 2) cand[p] = 1;
  }
  const o = new Uint8Array(mask);
  for (let p = 0; p < o.length; p++) {
    if (!cand[p]) continue;
    const x = p % w, y = (p / w) | 0;
    let anchored = false;
    for (let dy = -1; dy <= 1 && !anchored; dy++)
      for (let dx = -1; dx <= 1; dx++) {
        const X = x + dx, Y = y + dy, q = Y * w + X;
        if ((dx || dy) && X >= 0 && Y >= 0 && X < w && Y < h && mask[q] && !cand[q]) { anchored = true; break; }
      }
    if (!anchored) o[p] = 0;
  }
  return o;
}

/** 8-connected (or, with `four`, 4-connected) components of a mask. */
export function components(m: Uint8Array, w: number, h: number, four = false): number[][] {
  const seen = new Uint8Array(m.length), out: number[][] = [];
  for (let s = 0; s < m.length; s++) {
    if (!m[s] || seen[s]) continue;
    const st = [s], comp: number[] = [];
    seen[s] = 1;
    while (st.length) {
      const p = st.pop()!, x = p % w, y = (p / w) | 0;
      comp.push(p);
      for (let dy = -1; dy <= 1; dy++)
        for (let dx = -1; dx <= 1; dx++) {
          const X = x + dx, Y = y + dy, k = Y * w + X;
          if (four && dx && dy) continue;
          if (X >= 0 && Y >= 0 && X < w && Y < h && m[k] && !seen[k]) { seen[k] = 1; st.push(k); }
        }
    }
    out.push(comp);
  }
  return out;
}

/** Fill enclosed holes (4-connected, not touching the border) of <= maxArea px where C is opaque. */
export function fillHoles(m: Uint8Array, C: Img, maxArea = 4): Uint8Array {
  const { w, h } = C, o = new Uint8Array(m), seen = new Uint8Array(m.length);
  for (let s = 0; s < m.length; s++) {
    if (m[s] || seen[s]) continue;
    const st = [s], pix: number[] = [];
    let border = false;
    seen[s] = 1;
    while (st.length) {
      const p = st.pop()!, x = p % w, y = (p / w) | 0;
      pix.push(p);
      if (!x || !y || x === w - 1 || y === h - 1) border = true;
      for (const [X, Y] of [[x - 1, y], [x + 1, y], [x, y - 1], [x, y + 1]]) {
        const k = Y * w + X;
        if (X >= 0 && Y >= 0 && X < w && Y < h && !m[k] && !seen[k]) { seen[k] = 1; st.push(k); }
      }
    }
    if (!border && pix.length <= maxArea) for (const p of pix) if (C.data[p * 4 + 3] >= 128) o[p] = 1;
  }
  return o;
}

/**
 * De-spill: a key-tinted layer px loses the key excess (the key channel down to the next one), then snaps to the nearest
 * clean color (Chebyshev RGB distance <= SNAP) so the layer keeps the item's own palette. A px the de-spill left near-gray
 * (chroma < 16) only snaps to near-gray clean colors (chroma < 24): snapping by luminance moved blue-gray steel on the azure key
 * to the plume's purple (round 3 arm S: up to 84 of 147 steel px per view), and dark steel is within 40 of dark purple. With no
 * clean color that near, the luminance-nearest one (|Δlum| <= 0.08) wins unless the px is lightly tinted and de-spilled to
 * near-gray (steel stays gray): a cape fold drawn in the key's own darkest shade (it scores as key; absorbOutline kept it)
 * carries no item color and becomes the cape's dark red, not an off-palette black (round 3 review: 0 -> 1,355 px on a-cape).
 */
const SNAP = 40, chroma3 = (c: ArrayLike<number>) => Math.max(c[0], c[1], c[2]) - Math.min(c[0], c[1], c[2]);
export function despill(L: Img, key: Key, sT = 10): Img {
  const o: Img = { w: L.w, h: L.h, data: new Uint8ClampedArray(L.data) }, d = L.data, seen = new Set<number>(), core: number[][] = [];
  for (let i = 0; i < d.length; i += 4) {
    const k = (d[i] << 16) | (d[i + 1] << 8) | d[i + 2];
    if (d[i + 3] && !seen.has(k) && tint(key, d[i], d[i + 1], d[i + 2]) <= sT) { seen.add(k); core.push([d[i], d[i + 1], d[i + 2]]); }
  }
  const lc = core.map((c) => keyLum(key, c[0], c[1], c[2]));
  for (let i = 0; i < d.length; i += 4) {
    const r = d[i], g = d[i + 1], b = d[i + 2];
    if (!d[i + 3] || tint(key, r, g, b) <= sT) continue;
    const c: number[] = key === 'green' ? [r, Math.max(r, b), b] : key === 'blue' ? [r, g, Math.max(r, g)]
      : key === 'azure' ? (() => { const [x, , z] = hueRot(r, g, b, -90); return hueRot(x, Math.max(x, z), z, 90); })()
      : [Math.min(r, g + 4), g, Math.min(b, g + 4)];
    let best = -1, bd = SNAP + 1;
    const neutral = chroma3(c) < 16;
    for (const [j, k] of core.entries()) { if (neutral && chroma3(k) >= 24) continue; const dist = Math.max(Math.abs(k[0] - c[0]), Math.abs(k[1] - c[1]), Math.abs(k[2] - c[2])); if (dist < bd) { bd = dist; best = j; } }
    if (best < 0 && core.length && (!neutral || keyScore(key, r, g, b) >= KT)) { const l = keyLum(key, r, g, b); let j = 0; for (let n = 1; n < core.length; n++) if (Math.abs(lc[n] - l) < Math.abs(lc[j] - l)) j = n; if (Math.abs(lc[j] - l) <= 0.08) best = j; }
    o.data.set(best < 0 ? c : core[best], i);
  }
  return o;
}

/**
 * Item px drawn in the key's dark shade: edit-animation-v2 quantizes the grid to ~17–19 colors, so an item outline or fold
 * line (cape) can come back as the key ramp's darkest color and would be keyed out (holes over the body, missing outline).
 * A dark key px (lum <= 0.3) is item when (a) it lies outside the base silhouette and touches the item (the mannequin cannot be
 * there), or (b) at least 5 of its 8 neighbors are item (a 1-px line inside the item). Two passes.
 */
export function absorbOutline(mask: Uint8Array, B: Img, C: Img, key: Key, kT = KT, lumMax = 0.3): Uint8Array {
  const { w, h } = C;
  let o = new Uint8Array(mask);
  const dark = (p: number) => isKey(C, p, key, kT) && keyLum(key, C.data[p * 4], C.data[p * 4 + 1], C.data[p * 4 + 2]) <= lumMax;
  const itemNb = (m: Uint8Array, p: number) => {
    const x = p % w, y = (p / w) | 0;
    let n = 0;
    for (let k = 0; k < 9; k++) {
      const X = x + (k % 3) - 1, Y = y + ((k / 3) | 0) - 1;
      if (k !== 4 && X >= 0 && Y >= 0 && X < w && Y < h && m[Y * w + X]) n++;
    }
    return n;
  };
  for (let pass = 0; pass < 2; pass++) {
    const prev = o;
    o = new Uint8Array(prev);
    for (let p = 0; p < o.length; p++) {
      if (prev[p] || !dark(p)) continue;
      const n = itemNb(prev, p);
      if ((!B.data[p * 4 + 3] && n > 0) || n >= 5) o[p] = 1;
    }
  }
  return o; // ponytail: no blind pinhole fill — enclosed key px can be real body (fingers inside a hilt)
}

/** Dressed key composite C (+ its base cell B) -> clean item layer, to be drawn over the REAL base cell. */
export function chromaLayer(C: Img, key: Key, B: Img, { kT = KT, minPx = 2 } = {}): { layer: Img; mask: Uint8Array } {
  const m0 = absorbOutline(dropKeyOutline(chromaMask(C, key, kT), B, C, key, kT), B, C, key, kT);
  const mask = new Uint8Array(m0.length), L = makeImg(C.w, C.h);
  for (const comp of components(m0, C.w, C.h)) if (comp.length >= minPx) for (const p of comp) { mask[p] = 1; L.data.set(C.data.subarray(p * 4, p * 4 + 4), p * 4); }
  return { layer: despill(L, key), mask };
}

/**
 * Share of base-opaque, non-item px still key-colored (G2) and erased (alpha < 128). The 1-px cell border is skipped:
 * PixelLab drops the outermost row, and the padded 48 -> 64 rig puts walk feet on row 63 (12 erased px ≈ 3 % of a cell, M3).
 */
export function keyKept(B: Img, C: Img, key: Key, mask: Uint8Array, kT = KT, tol = 0) {
  let n = 0, kept = 0, gone = 0;
  const { w, h } = B;
  for (let p = 0; p < mask.length; p++) {
    if (!B.data[p * 4 + 3] || mask[p]) continue;
    const x = p % w, y = (p / w) | 0;
    if (!x || !y || x === w - 1 || y === h - 1) continue;
    n++;
    if (tol ? near(w, h, x, y, tol, (q) => isKey(C, q, key, kT)) : isKey(C, p, key, kT)) kept++;
    else if (C.data[p * 4 + 3] < 128) gone++;
  }
  return { kept: n ? kept / n : 1, erased: n ? gone / n : 0, lost: n - kept };
}

/** Share of the composite's key px outside the base silhouette (G3: the mannequin did not move). Item px (mask) excluded. */
export function keyOutside(B: Img, C: Img, key: Key, kT = KT, mask?: Uint8Array, tol = 0): number {
  let n = 0, o = 0;
  const { w, h } = B;
  for (let p = 0; p < w * h; p++) {
    if (!isKey(C, p, key, kT) || mask?.[p]) continue;
    n++;
    if (!(tol ? near(w, h, p % w, (p / w) | 0, tol, (q) => B.data[q * 4 + 3] > 0) : B.data[p * 4 + 3])) o++;
  }
  return n ? o / n : 0;
}
/** Any px within Chebyshev distance r of (x, y) satisfying f. Posed cells (skeleton-v3) redraw the mannequin ~1 px wider. */
function near(w: number, h: number, x: number, y: number, r: number, f: (q: number) => boolean) {
  for (let dy = -r; dy <= r; dy++) for (let dx = -r; dx <= r; dx++) { const X = x + dx, Y = y + dy; if (X >= 0 && Y >= 0 && X < w && Y < h && f(Y * w + X)) return true; }
  return false;
}

/** Heatmap of the key score: item px (score < kT) in their own color, key px from dark blue (score 35) to white (100). */
export function keyHeatmap(C: Img, key: Key, kT = KT): Img {
  const o = makeImg(C.w, C.h);
  for (let p = 0; p < C.w * C.h; p++) {
    const i = p * 4;
    if (C.data[i + 3] < 128) continue;
    const s = keyScore(key, C.data[i], C.data[i + 1], C.data[i + 2]);
    if (s < kT) o.data.set(s ? [255, 160, 0, 255] : [C.data[i], C.data[i + 1], C.data[i + 2], 255], i); // orange = weak key tint, item
    else { const v = Math.round(((s - kT) / (100 - kT)) * 200); o.data.set([v, v, 55 + v, 255], i); }
  }
  return o;
}

/** S2 prompt template (verbatim structure). `anchor` = frame 1 is a dressed reference cell from the design call. */
export function chromaPrompt(item: string, key: Key, cellsNote: string, anchor = false): string {
  const n = KEY_NAME[key];
  return (
    `This pixel art character is a solid ${n} mannequin. The ${n} color is intentional (a chroma key) and must stay exactly the same ${n} in every frame. ` +
    (anchor ? `Frame 1 already wears ${item}: copy exactly that design, colors and size onto the other frames. ` : '') +
    `Add only ${item}, drawn in its own natural colors (no ${n} on the item), identical design in all frames. ${cellsNote}` +
    'Keep every other pixel, the pose, the outline and the transparent background unchanged.'
  );
}

export function selfTest() {
  const B = makeImg(4, 4);
  for (let p = 0; p < 16; p++) B.data.set([200 - p * 8, 150 - p * 5, 120 - p * 4, 255], p * 4);
  for (const k of KEYS) {
    const K = toChroma(B, k), C = { ...K, data: new Uint8ClampedArray(K.data) };
    console.assert([...Array(16).keys()].every((p) => keyScore(k, K.data[p * 4], K.data[p * 4 + 1], K.data[p * 4 + 2]) >= KT), `${k}: whole ramp is key`);
    C.data.set([20, 20, 22, 255], 0);
    C.data.set([170, 120, 60, 255], 20);
    const m = chromaMask(C, k);
    console.assert([...m.keys()].filter((p) => m[p]).join() === '0,5', `${k} mask finds exactly the item`);
    const { layer, mask } = chromaLayer(C, k, B, { minPx: 1 });
    console.assert(!!mask[5] && layer.data[23] === 255 && layer.data[3] === 255, `${k} layer keeps the item px (px 0 is anchored by item px 5)`);
    console.assert(keyKept(B, C, k, mask).kept === 1 && keyOutside(B, C, k) === 0, `${k} keyKept (border px skipped) / keyOutside`);
  }
  // an off-key rim line along a key body is dropped; the same dark px next to a real item interior is kept
  const body = makeImg(5, 5);
  for (let y = 1; y < 5; y++) for (let x = 0; x < 5; x++) body.data.set([150, 150, 150, 255], (y * 5 + x) * 4);
  const kc = toChroma(body, 'green'), olive = { ...kc, data: new Uint8ClampedArray(kc.data) };
  olive.data.set([48, 46, 11, 255], (1 * 5 + 2) * 4); // one silhouette px redrawn olive
  console.assert(dropKeyOutline(chromaMask(olive, 'green'), body, olive, 'green').every((v) => !v), 'olive rim dropped');
  const hair = { ...olive, data: new Uint8ClampedArray(olive.data) };
  for (let x = 1; x < 4; x++) hair.data.set([90, 60, 30, 255], (0 * 5 + x) * 4); // hair above the rim, on empty canvas
  const kept = dropKeyOutline(chromaMask(hair, 'green'), body, hair, 'green');
  console.assert(kept[7] === 1, 'item outline next to item interior kept');
  const cape = makeImg(3, 1), capeB = makeImg(3, 1);
  cape.data.set([150, 30, 30, 255, 9, 39, 7, 255, 9, 39, 7, 255]); // red cape px, dark key outline, then one more dark px
  capeB.data.set([0, 0, 0, 0, 0, 0, 0, 0, 120, 120, 120, 255], 0);
  console.assert(absorbOutline(chromaMask(cape, 'green'), capeB, cape, 'green').join() === '1,1,0', 'dark key outline next to the item, off the body, is item');
  const fold = makeImg(3, 3), foldB = makeImg(3, 3);
  for (let p = 0; p < 9; p++) { fold.data.set(p % 3 === 1 ? [9, 39, 7, 255] : [150, 30, 30, 255], p * 4); foldB.data.set([120, 120, 120, 255], p * 4); }
  console.assert(absorbOutline(chromaMask(fold, 'green'), foldB, fold, 'green').every((v) => v === 1), 'dark key fold line inside the item is item');
  console.assert(keyScore('green', 9, 39, 7) >= KT, 'dark green outline is key (ratio score)');
  console.assert(pickKey('an emerald cloak') === 'magenta' && pickKey('a red cape') === 'green', 'pickKey');
  console.assert(!keyAllowed('a long red cloth cape', 'magenta') && keyAllowed('a steel sword', 'magenta'), 'keyAllowed');
  console.assert(keyAllowed('a leather cap, azure colored', 'magenta') && keyAllowed('an armored, fur covered hood', 'magenta') && !keyAllowed('a reddish cloak', 'magenta') && !keyAllowed('a darkred cloak', 'magenta') && !keyAllowed('a darkgreen hood', 'green') && !keyAllowed('a bluegreen hood', 'green') && keyAllowed('a steel helmet', 'green'), 'color words in compounds, not word endings');
  const sp: Img = { w: 2, h: 1, data: new Uint8ClampedArray([100, 60, 40, 255, 70, 85, 40, 255]) };
  console.assert(despill(sp, 'green').data.slice(4, 8).join() === '100,60,40,255', 'despill snaps olive edge to the core brown');
  console.assert(chromaPrompt('a hat', 'green', 'X. ', true).includes('Frame 1 already wears a hat'), 'anchor prompt');
}
