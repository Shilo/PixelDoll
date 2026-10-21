// S2: chroma-key mannequin. Browser-portable pure functions over RGBA images {w,h,d}.
// Idea: recolour the frozen base to a key colour ramp (shading kept via luminance), let PixelLab dress the KEY mannequin,
// then item pixels = opaque pixels that are NOT on the key ramp. The layer is composited over the REAL base.
import { make, clone } from './img.mjs';

const lum = (r, g, b) => (0.299 * r + 0.587 * g + 0.114 * b) / 255;
// Ramps: t in [0,1] (normalised base luminance) -> key RGB.
export const RAMPS = {
  green: t => [Math.round(110 * t * t), Math.round(60 + 195 * t), Math.round(110 * t * t)],
  magenta: t => [Math.round(70 + 185 * t), Math.round(110 * t * t), Math.round(70 + 185 * t)],
  // flat grey: body one mid grey, outline-dark pixels one dark grey (2 colours, no shading)
  grey: t => (t < 0.18 ? [48, 48, 48] : [128, 128, 128]),
};

// Recolour every opaque pixel of B onto the ramp; luminance normalised over B's opaque range so the whole ramp is used.
export function toChroma(B, variant = 'green') {
  const ramp = RAMPS[variant], o = clone(B); let lo = 1, hi = 0;
  for (let i = 0; i < B.d.length; i += 4) if (B.d[i + 3]) { const l = lum(B.d[i], B.d[i + 1], B.d[i + 2]); if (l < lo) lo = l; if (l > hi) hi = l; }
  for (let i = 0; i < B.d.length; i += 4) if (B.d[i + 3]) { const t = (lum(B.d[i], B.d[i + 1], B.d[i + 2]) - lo) / (hi - lo || 1); o.d.set(ramp(t), i); }
  return o;
}

// Key-likeness, 0..100: chroma RATIO (key-channel excess / brightest channel), so the DARK end of the ramp (outline,
// e.g. 9,39,7) still scores high, while neutral/brown item darks score ~0. Excess < 12 levels = not key (noise).
const ratio = (ex, mx) => (ex < 12 ? 0 : Math.round(100 * ex / Math.max(mx, 1)));
export const KEY = {
  green: (r, g, b) => ratio(g - Math.max(r, b), g),
  magenta: (r, g, b) => ratio(Math.min(r, b) - g, Math.max(r, b)),
  grey: (r, g, b) => (Math.max(Math.abs(r - g), Math.abs(g - b), Math.abs(r - b)) <= 10 && (Math.abs(g - 128) <= 22 || Math.abs(g - 48) <= 18) ? 99 : 0),
};

// Item mask from a dressed chroma composite C: opaque, inside region (rect or Uint8Array mask), not key-coloured.
export function chromaMask(C, variant = 'green', { region = null, kT = 35, aT = 128 } = {}) {
  const key = KEY[variant], n = C.w * C.h, m = new Uint8Array(n);
  for (let p = 0, i = 0; p < n; p++, i += 4) {
    if (C.d[i + 3] < aT) continue;
    if (region && !inRegion(region, p, C.w)) continue;
    if (key(C.d[i], C.d[i + 1], C.d[i + 2]) < kT) m[p] = 1;
  }
  return m;
}
export const inRegion = (r, p, w) => r instanceof Uint8Array ? !!r[p] : (p % w) >= r.x && ((p / w) | 0) >= r.y && (p % w) < r.x + r.w && ((p / w) | 0) < r.y + r.h;

// How much of the mannequin did PixelLab keep as key colour? (over base-opaque pixels outside the item mask)
export function keyKept(B, C, variant, itemMask, kT = 35) {
  const key = KEY[variant]; let n = 0, kept = 0, gone = 0;
  for (let p = 0, i = 0; p < itemMask.length; p++, i += 4) {
    if (!B.d[i + 3] || itemMask[p]) continue; n++;
    if (C.d[i + 3] < 128) gone++; else if (key(C.d[i], C.d[i + 1], C.d[i + 2]) >= kT) kept++;
  }
  return { n, kept: n ? +(kept / n).toFixed(3) : 1, erased: n ? +(gone / n).toFixed(3) : 0 };
}

// Key spill: item pixels tinted toward the key (anti-aliasing / shading picked up from the mannequin).
export function spill(C, mask, variant, sT = 12) { const key = KEY[variant]; let n = 0, s = 0; for (let p = 0, i = 0; p < mask.length; p++, i += 4) if (mask[p]) { n++; if (key(C.d[i], C.d[i + 1], C.d[i + 2]) > sT) s++; } return n ? +(s / n).toFixed(3) : 0; }

// Self-check: a 2-pixel item on a recoloured body must be recovered exactly.
export function selfTest() {
  const B = make(4, 4); for (let p = 0; p < 16; p++) B.d.set([200 - p * 8, 150 - p * 5, 120 - p * 4, 255], p * 4);
  for (const v of Object.keys(RAMPS)) {
    const K = toChroma(B, v), C = clone(K); C.d.set([20, 20, 22, 255], 0); C.d.set([170, 120, 60, 255], 20);
    const m = chromaMask(C, v), on = [...m.keys()].filter(p => m[p]);
    if (v !== 'grey') console.assert(on.join() === '0,5', `chroma ${v} finds exactly the item`, on);
  }
  return true;
}

// De-spill: item px whose key score is in (sT, kT) picked up key tint (anti-aliasing against the mannequin). Snap each to the
// luminance-nearest colour of the item's clean palette (item px with key score <= sT). Returns a new layer.
// Uses a RAW tint ratio (no 12-level floor) so faint olive/purple edge tints are caught too.
const TINT = { green: (r, g, b) => { const e = g - Math.max(r, b); return e >= 5 ? 100 * e / Math.max(g, 1) : 0; }, magenta: (r, g, b) => { const e = Math.min(r, b) - g; return e >= 5 ? 100 * e / Math.max(r, b, 1) : 0; }, grey: () => 0 };
export function despill(L, variant = 'green', { sT = 10 } = {}) {
  const key = TINT[variant], o = clone(L), core = [];
  for (let i = 0; i < L.d.length; i += 4) if (L.d[i + 3] && key(L.d[i], L.d[i + 1], L.d[i + 2]) <= sT) core.push([L.d[i], L.d[i + 1], L.d[i + 2]]);
  if (!core.length) return o;
  const lc = core.map(c => lum(...c));
  for (let i = 0; i < o.d.length; i += 4) if (o.d[i + 3] && key(o.d[i], o.d[i + 1], o.d[i + 2]) > sT) {
    const l = lum(o.d[i], o.d[i + 1], o.d[i + 2]); let b = 0; for (let k = 1; k < core.length; k++) if (Math.abs(lc[k] - l) < Math.abs(lc[b] - l)) b = k;
    if (Math.abs(lc[b] - l) <= 0.08) o.d.set(core[b], i);
    else if (variant === 'green') o.d[i + 1] = Math.max(o.d[i], o.d[i + 2]); // no close core colour: just remove the key excess
    else if (variant === 'magenta') { const m = o.d[i + 1]; o.d[i] = Math.min(o.d[i], m + 4); o.d[i + 2] = Math.min(o.d[i + 2], m + 4); }
  }
  return o;
}

// Prompt that keeps the key mannequin intact (S2: 98.9-100 % of key px kept on edit-animation-v2 / transfer-outfit-v2).
export const WHAT = {
  wizardhat: "a tall pointed blue wizard hat with a wide brim",
  helmet: 'a simple grey steel knight helmet covering the top and sides of the head, face visible',
  chest: 'a brown leather chest armor vest covering the torso',
  hair: 'short messy dark brown hair covering the top, back and sides of the head, face visible, no hat',
  boots: 'a pair of brown leather boots on the feet, reaching up to just below the knees',
  cape: 'a long red cloth cape hanging from the shoulders behind the back, visible at both sides of the figure',
  sword: "a steel longsword held in the character's right hand, blade pointing down and slightly outward",
};
export const NAME = { green: 'bright green', magenta: 'magenta', grey: 'flat grey' };
export const chromaPrompt = (item, v, dirsNote) => `This pixel art character is a solid ${NAME[v]} mannequin. The ${NAME[v]} colour is intentional (a chroma key) and must stay exactly the same ${NAME[v]} in every frame. Add only ${WHAT[item]}, drawn in its own natural colours (no ${NAME[v]} on the item), identical design in all frames. ${dirsNote}Keep every other pixel, the pose, the outline and the transparent background unchanged.`;


// Mannequin drift check: of the composite's KEY px, the fraction lying outside the base silhouette (0 = body did not move).
export function keyOutside(B, C, variant = 'green', kT = 35) { const key = KEY[variant]; let n = 0, o = 0; for (let i = 0; i < C.d.length; i += 4) if (C.d[i + 3] >= 128 && key(C.d[i], C.d[i + 1], C.d[i + 2]) >= kT) { n++; if (!B.d[i + 3]) o++; } return n ? +(o / n).toFixed(4) : 0; }

// One-call extractor for the app: dressed key composite C -> clean item layer (to be drawn over the REAL base cell).
export function chromaLayer(C, variant = 'green', { B = null, region = null, kT = 35, minPx = 2 } = {}) {
  let m = chromaMask(C, variant, { region, kT }); const { w, h } = C;
  if (B) m = dropKeyOutline(m, B, C, variant, kT);
  // drop components smaller than minPx (8-connected)
  const seen = new Uint8Array(m.length), L = make(w, h);
  for (let s = 0; s < m.length; s++) {
    if (!m[s] || seen[s]) continue;
    const st = [s], comp = []; seen[s] = 1;
    while (st.length) { const p = st.pop(); comp.push(p); const x = p % w, y = (p / w) | 0; for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) { const X = x + dx, Y = y + dy, k = Y * w + X; if (X >= 0 && Y >= 0 && X < w && Y < h && m[k] && !seen[k]) { seen[k] = 1; st.push(k); } } }
    if (comp.length >= minPx) for (const p of comp) L.d.set(C.d.subarray(p * 4, p * 4 + 4), p * 4);
  }
  return despill(L, variant);
}

// Mannequin-outline leak guard: PixelLab sometimes redraws the key's dark OUTLINE in a non-key hue (olive 48,46,11 seen in
// transfer-outfit-v2 punch frames). Drop mask px that sit on the base silhouette's edge ring (base-opaque with a transparent
// 4-neighbour) or on a dark base px, and whose base-opaque 4-neighbours are mostly KEY in C (>= 2): a 1-px rim hugging the body.
export function dropKeyOutline(mask, B, C, variant = 'green', kT = 35) {
  const key = KEY[variant], { w, h } = B, o = new Uint8Array(mask), op = p => B.d[p * 4 + 3] > 0;
  const isKey = p => C.d[p * 4 + 3] >= 128 && key(C.d[p * 4], C.d[p * 4 + 1], C.d[p * 4 + 2]) >= kT;
  for (let p = 0; p < o.length; p++) {
    if (!mask[p] || !op(p)) continue;
    const x = p % w, y = (p / w) | 0, nb = [[x - 1, y], [x + 1, y], [x, y - 1], [x, y + 1]].filter(([X, Y]) => X >= 0 && Y >= 0 && X < w && Y < h).map(([X, Y]) => Y * w + X);
    const edge = nb.length < 4 || nb.some(q => !op(q)), dark = (B.d[p * 4] + B.d[p * 4 + 1] + B.d[p * 4 + 2]) / 3 < 60;
    if ((edge || dark) && nb.filter(q => op(q) && isKey(q)).length >= 2) o[p] = 0;
  }
  return o;
}
