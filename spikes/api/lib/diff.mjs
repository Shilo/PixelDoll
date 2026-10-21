// Layer extraction: composite − base → transparent layer. Pure JS over RGBA arrays (browser-portable).
import { make, clone, over } from './img.mjs';

// Per-pixel delta between base B and composite C, premultiplied so transparent RGB is ignored.
// Returns Float32Array of max-channel premultiplied delta (0..255) and alpha delta.
export function deltas(B, C) {
  const n = B.w * B.h, dm = new Float32Array(n), da = new Float32Array(n);
  for (let p = 0, i = 0; p < n; p++, i += 4) {
    const ab = B.d[i + 3] / 255, ac = C.d[i + 3] / 255;
    let m = 0;
    for (let c = 0; c < 3; c++) m = Math.max(m, Math.abs(B.d[i + c] * ab - C.d[i + c] * ac));
    dm[p] = m; da[p] = Math.abs(B.d[i + 3] - C.d[i + 3]);
  }
  return { dm, da };
}

// Mask builders. Each returns Uint8Array(n) with 1 = layer pixel.
export function maskExact(B, C) {
  const n = B.w * B.h, m = new Uint8Array(n);
  for (let p = 0, i = 0; p < n; p++, i += 4) {
    const a = B.d[i + 3], b = C.d[i + 3];
    if (a === 0 && b === 0) continue;
    if (a !== b || B.d[i] !== C.d[i] || B.d[i + 1] !== C.d[i + 1] || B.d[i + 2] !== C.d[i + 2]) m[p] = 1;
  }
  return m;
}
export function maskThreshold(B, C, { t = 18, ta = 16 } = {}) {
  const { dm, da } = deltas(B, C), m = new Uint8Array(dm.length);
  for (let p = 0; p < m.length; p++) if (dm[p] > t || da[p] > ta) m[p] = 1;
  return m;
}
// Hysteresis: seed with high threshold, grow 4-connected into pixels above low threshold.
export function maskHysteresis(B, C, { hi = 40, lo = 8, ta = 16 } = {}) {
  const { dm, da } = deltas(B, C), n = dm.length, m = new Uint8Array(n), w = B.w, q = [];
  for (let p = 0; p < n; p++) if (dm[p] > hi || da[p] > ta) { m[p] = 1; q.push(p); }
  while (q.length) {
    const p = q.pop(), x = p % w, y = (p / w) | 0;
    for (const [nx, ny] of [[x - 1, y], [x + 1, y], [x, y - 1], [x, y + 1]]) {
      if (nx < 0 || ny < 0 || nx >= w || ny >= B.h) continue;
      const k = ny * w + nx; if (!m[k] && (dm[k] > lo || da[k] > lo)) { m[k] = 1; q.push(k); }
    }
  }
  return m;
}

// Connected components (8-conn). Returns { labels: Int32Array, comps: [{id, area, bbox}] }.
export function components(mask, w, h) {
  const labels = new Int32Array(mask.length).fill(-1), comps = [];
  for (let s = 0; s < mask.length; s++) {
    if (!mask[s] || labels[s] >= 0) continue;
    const id = comps.length, st = [s]; labels[s] = id;
    let area = 0, x0 = w, y0 = h, x1 = 0, y1 = 0;
    while (st.length) {
      const p = st.pop(), x = p % w, y = (p / w) | 0; area++;
      if (x < x0) x0 = x; if (y < y0) y0 = y; if (x > x1) x1 = x; if (y > y1) y1 = y;
      for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
        const nx = x + dx, ny = y + dy; if (nx < 0 || ny < 0 || nx >= w || ny >= h) continue;
        const k = ny * w + nx; if (mask[k] && labels[k] < 0) { labels[k] = id; st.push(k); }
      }
    }
    comps.push({ id, area, bbox: { x: x0, y: y0, w: x1 - x0 + 1, h: y1 - y0 + 1 } });
  }
  return { labels, comps };
}
// Keep components with area >= minArea (and, if region given, overlapping the region rect).
export function filterComponents(mask, w, h, { minArea = 4, region = null, keepLargestOnly = false } = {}) {
  const { labels, comps } = components(mask, w, h);
  const inR = (p) => { const x = p % w, y = (p / w) | 0; return x >= region.x && y >= region.y && x < region.x + region.w && y < region.y + region.h; };
  const overlap = new Map();
  if (region) for (let p = 0; p < mask.length; p++) if (labels[p] >= 0 && inR(p)) overlap.set(labels[p], 1);
  let keep = comps.filter(c => c.area >= minArea && (!region || overlap.has(c.id)));
  if (keepLargestOnly && keep.length) keep = [keep.reduce((a, b) => (a.area > b.area ? a : b))];
  const ids = new Set(keep.map(c => c.id)), out = new Uint8Array(mask.length);
  for (let p = 0; p < mask.length; p++) if (ids.has(labels[p])) out[p] = 1;
  return { mask: out, comps, kept: keep };
}
// 3x3 morphology.
function morph(mask, w, h, dilate) {
  const o = new Uint8Array(mask.length);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    let v = dilate ? 0 : 1;
    for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
      const nx = x + dx, ny = y + dy, s = nx < 0 || ny < 0 || nx >= w || ny >= h ? 0 : mask[ny * w + nx];
      if (dilate && s) v = 1; if (!dilate && !s) v = 0;
    }
    o[y * w + x] = v;
  }
  return o;
}
export const dilate = (m, w, h) => morph(m, w, h, true);
export const erode = (m, w, h) => morph(m, w, h, false);
export const close = (m, w, h) => erode(dilate(m, w, h), w, h);
// Close but only fill pixels that actually changed (never pull in identical base pixels).
export function closeChanged(mask, B, C) { const c = close(mask, B.w, B.h), ex = maskExact(B, C); for (let p = 0; p < c.length; p++) c[p] = mask[p] || (c[p] && ex[p]) ? 1 : 0; return c; }

// Build layer from mask: copy composite pixels where mask=1. Pixels where composite is transparent but base wasn't
// (item "erased" body) cannot be represented by an over-layer -> counted as `erasures`.
export function layerFrom(C, mask) {
  const L = make(C.w, C.h);
  for (let p = 0, i = 0; p < mask.length; p++, i += 4) if (mask[p]) L.d.set(C.d.subarray(i, i + 4), i);
  return L;
}

// Metrics for an extraction.
export function metrics(B, C, mask, { region = null } = {}) {
  const L = layerFrom(C, mask), R = over(B, L), n = mask.length, w = B.w;
  const ex = maskExact(B, C);
  let changed = 0, layerPx = 0, residual = 0, residualIn = 0, residualSum = 0, outside = 0, outsideChanged = 0, erasures = 0, bodyChanged = 0, addedOnEmpty = 0, smallDrift = 0;
  const { dm } = deltas(B, C), { dm: rdm } = deltas(R, C);
  for (let p = 0, i = 0; p < n; p++, i += 4) {
    const x = p % w, y = (p / w) | 0, inR = !region || (x >= region.x && y >= region.y && x < region.x + region.w && y < region.y + region.h);
    if (ex[p]) { changed++; if (!inR) outsideChanged++; if (B.d[i + 3] > 0) bodyChanged++; else addedOnEmpty++; if (dm[p] <= 18 && B.d[i + 3] > 0) smallDrift++; }
    if (mask[p]) { layerPx++; if (!inR) outside++; }
    if (rdm[p] > 0 || R.d[i + 3] !== C.d[i + 3]) { residual++; residualSum += rdm[p]; if (inR) residualIn++; }
    if (B.d[i + 3] > 0 && C.d[i + 3] === 0) erasures++;
  }
  return { changed, addedOnEmpty, bodyChanged, smallDrift, outsideChanged, layerPx, layerOutsideRegion: outside, erasures, residualPx: residual, residualInRegion: residualIn, residualMeanDelta: residual ? +(residualSum / residual).toFixed(1) : 0, recomposeExact: residual === 0 };
}

// Visual heatmap: green = added on empty, red = body pixel changed strongly (>18), blue = small drift (<=18), grey = base.
export function heatmap(B, C) {
  const H = make(B.w, B.h), { dm, da } = deltas(B, C), ex = maskExact(B, C);
  for (let p = 0, i = 0; p < ex.length; p++, i += 4) {
    if (!ex[p]) { if (B.d[i + 3]) { const g = (B.d[i] + B.d[i + 1] + B.d[i + 2]) / 3 * 0.4 | 0; H.d.set([g, g, g, 255], i); } continue; }
    if (B.d[i + 3] === 0) H.d.set([0, 230, 0, 255], i);
    else if (C.d[i + 3] === 0) H.d.set([255, 0, 255, 255], i);
    else if (dm[p] > 18 || da[p] > 16) H.d.set([255, 40, 40, 255], i);
    else H.d.set([60, 120, 255, 255], i);
  }
  return H;
}

// Temporal stats for a sequence of layers: area, bbox, centroid, colour count, IoU with previous (after aligning by nothing).
export function layerStats(L) {
  let a = 0, sx = 0, sy = 0; const cols = new Set();
  for (let p = 0, i = 0; p < L.w * L.h; p++, i += 4) if (L.d[i + 3]) { a++; sx += p % L.w; sy += (p / L.w) | 0; cols.add((L.d[i] << 16) | (L.d[i + 1] << 8) | L.d[i + 2]); }
  return { area: a, cx: a ? +(sx / a).toFixed(1) : null, cy: a ? +(sy / a).toFixed(1) : null, colors: cols.size, palette: cols };
}
export function paletteJaccard(a, b) { let i = 0; for (const c of a) if (b.has(c)) i++; const u = a.size + b.size - i; return u ? +(i / u).toFixed(2) : 1; }

// Self-check: synthetic base + item composite must round-trip exactly.
export function selfTest() {
  const B = make(8, 8), C = make(8, 8);
  for (let p = 0; p < 64; p++) if (p % 8 > 1 && p % 8 < 6) { B.d.set([100, 100, 100, 255], p * 4); C.d.set([100, 100, 100, 255], p * 4); }
  C.d.set([255, 0, 0, 255], 0); C.d.set([255, 0, 0, 255], 9 * 4 + 4); C.d.set([101, 100, 100, 255], 40 * 4 + 8); // 2 item px + 1 drift px
  const mx = maskExact(B, C), mt = maskThreshold(B, C);
  console.assert(mx.reduce((a, b) => a + b) === 3, 'exact finds 3');
  console.assert(mt.reduce((a, b) => a + b) === 2, 'threshold drops drift');
  const m = metrics(B, C, mt); console.assert(m.residualPx === 1 && m.layerPx === 2, 'residual = drift px');
  console.assert(metrics(B, C, mx).recomposeExact, 'exact mask recomposes exactly');
  return true;
}

// Palette-novelty mask: a changed pixel is "item" if base was empty there, the change is large, or its colour is
// not (near) any colour of the base palette. Small-delta, base-palette-coloured changes are treated as body redraw.
export function basePalette(B) { const s = new Map(); for (let i = 0; i < B.d.length; i += 4) if (B.d[i + 3]) s.set((B.d[i] << 16) | (B.d[i + 1] << 8) | B.d[i + 2], [B.d[i], B.d[i + 1], B.d[i + 2]]); return [...s.values()]; }
export function paletteDist(pal, r, g, b) { let m = 1e9; for (const [R, G, Bl] of pal) { const d = Math.max(Math.abs(R - r), Math.abs(G - g), Math.abs(Bl - b)); if (d < m) m = d; } return m; }
export function maskNovel(B, C, { t = 8, big = 60, palT = 12 } = {}) {
  const { dm, da } = deltas(B, C), pal = basePalette(B), m = new Uint8Array(dm.length);
  for (let p = 0, i = 0; p < m.length; p++, i += 4) {
    if (!(dm[p] > t || da[p] > 16) || C.d[i + 3] === 0) continue;
    if (B.d[i + 3] === 0 || dm[p] > big || paletteDist(pal, C.d[i], C.d[i + 1], C.d[i + 2]) > palT) m[p] = 1;
  }
  return m;
}
// Fraction of layer pixels whose colour is (near) a base-palette colour: proxy for body leakage into the layer.
export function leakage(B, L, palT = 6) { const pal = basePalette(B); let n = 0, k = 0; for (let i = 0; i < L.d.length; i += 4) if (L.d[i + 3]) { n++; if (paletteDist(pal, L.d[i], L.d[i + 1], L.d[i + 2]) <= palT) k++; } return n ? +(k / n).toFixed(3) : 0; }

// novel2: like maskNovel, but also learns the composite's REDRAWN body palette from pixels outside the slot region
// (where only body exists), and the item's core palette from pixels added on empty canvas inside the region.
// Changed in-slot pixel = item if colour is in the item core palette, or is novel vs BOTH base and redrawn-body palettes.
export function maskNovel2(B, C, region, { t = 8, palT = 12, coreT = 6 } = {}) {
  const w = B.w, inR = p => { const x = p % w, y = (p / w) | 0; return x >= region.x && y >= region.y && x < region.x + region.w && y < region.y + region.h; };
  const { dm, da } = deltas(B, C), basePal = basePalette(B), bodyPal = new Map(), core = new Map(), m = new Uint8Array(dm.length);
  for (let p = 0, i = 0; p < dm.length; p++, i += 4) { if (!C.d[i + 3]) continue; const key = (C.d[i] << 16) | (C.d[i + 1] << 8) | C.d[i + 2], rgb = [C.d[i], C.d[i + 1], C.d[i + 2]];
    if (!inR(p) && B.d[i + 3]) bodyPal.set(key, rgb); else if (inR(p) && !B.d[i + 3]) core.set(key, rgb); }
  const bp = [...bodyPal.values()], cp = [...core.values()].filter(c => paletteDist(bp, ...c) > 0); // core colours that also appear in body are ambiguous
  for (let p = 0, i = 0; p < m.length; p++, i += 4) {
    if (!inR(p) || !(dm[p] > t || da[p] > 16) || C.d[i + 3] === 0) continue;
    const r = C.d[i], g = C.d[i + 1], b = C.d[i + 2];
    if (!B.d[i + 3] || (cp.length && paletteDist(cp, r, g, b) <= coreT) || (paletteDist(basePal, r, g, b) > palT && paletteDist(bp, r, g, b) > palT)) m[p] = 1;
  }
  return m;
}
// Grow a seed mask by `steps` 8-neighbour rings, only into pixels that changed by more than t (recovers item outlines).
export function growInto(seed, B, C, { steps = 1, t = 18 } = {}) {
  const { dm, da } = deltas(B, C); let m = seed;
  for (let s = 0; s < steps; s++) { const d = dilate(m, B.w, B.h), o = new Uint8Array(m.length); for (let p = 0; p < m.length; p++) o[p] = m[p] || (d[p] && (dm[p] > t || da[p] > 16) && C.d[p * 4 + 3] > 0) ? 1 : 0; m = o; }
  return m;
}
