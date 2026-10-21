// S2/X3: better diff for skin-base composites. Browser-portable pure functions over RGBA {w,h,d}; masks are Uint8Array(w*h).
import { components, dilate, basePalette, paletteDist } from './diff.mjs';
import { make } from './img.mjs';

const pm = (im, i, c) => im.d[i + c] * im.d[i + 3] / 255;
// Neighbourhood-tolerant change: composite px p is UNCHANGED if some base px q within ±r matches it
// (premultiplied max-channel delta <= t and alpha delta <= ta). Transparent composite px are never layer px.
export function maskNbr(B, C, { t = 18, ta = 16, r = 1 } = {}) {
  const { w, h } = B, m = new Uint8Array(w * h);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const p = y * w + x, i = p * 4; if (C.d[i + 3] < 128) continue;
    let match = false;
    for (let dy = -r; dy <= r && !match; dy++) for (let dx = -r; dx <= r && !match; dx++) {
      const X = x + dx, Y = y + dy; if (X < 0 || Y < 0 || X >= w || Y >= h) continue;
      const j = (Y * w + X) * 4; if (Math.abs(B.d[j + 3] - C.d[i + 3]) > ta) continue;
      let d = 0; for (let c = 0; c < 3; c++) d = Math.max(d, Math.abs(pm(B, j, c) - pm(C, i, c)));
      if (d <= t) match = true;
    }
    if (!match) m[p] = 1;
  }
  return m;
}

// Body-material rejection: drop mask px that sit on base-opaque px and whose colour is within t of the body palette
// (skin/underwear ramps = base palette, optionally restricted). Item colours that collide with skin are lost -> holes,
// which fillHoles / temporal fill repair.
export function rejectBody(mask, B, C, { t = 10, pal = basePalette(B) } = {}) {
  const o = new Uint8Array(mask);
  for (let p = 0, i = 0; p < o.length; p++, i += 4) if (o[p] && B.d[i + 3] && paletteDist(pal, C.d[i], C.d[i + 1], C.d[i + 2]) <= t) o[p] = 0;
  return o;
}

// Fill enclosed holes (4-connected background regions not touching the image border) up to maxArea px,
// only where the composite is opaque.
export function fillHoles(mask, C, maxArea = 4) {
  const { w, h } = C, inv = new Uint8Array(mask.length); for (let p = 0; p < inv.length; p++) inv[p] = mask[p] ? 0 : 1;
  const lab = new Int32Array(mask.length).fill(-1), o = new Uint8Array(mask);
  for (let s = 0; s < inv.length; s++) {
    if (!inv[s] || lab[s] >= 0) continue;
    const st = [s], pix = []; lab[s] = s; let border = false;
    while (st.length) { const p = st.pop(), x = p % w, y = (p / w) | 0; pix.push(p); if (!x || !y || x === w - 1 || y === h - 1) border = true;
      for (const [X, Y] of [[x - 1, y], [x + 1, y], [x, y - 1], [x, y + 1]]) { if (X < 0 || Y < 0 || X >= w || Y >= h) continue; const k = Y * w + X; if (inv[k] && lab[k] < 0) { lab[k] = s; st.push(k); } } }
    if (!border && pix.length <= maxArea) for (const p of pix) if (C.d[p * 4 + 3] >= 128) o[p] = 1;
  }
  return o;
}

export function minArea(mask, w, h, a = 3) { const { labels, comps } = components(mask, w, h), ok = new Set(comps.filter(c => c.area >= a).map(c => c.id)), o = new Uint8Array(mask.length); for (let p = 0; p < o.length; p++) if (ok.has(labels[p])) o[p] = 1; return o; }
export function clipRect(mask, w, r) { const o = new Uint8Array(mask.length); for (let p = 0; p < o.length; p++) { const x = p % w, y = (p / w) | 0; if (mask[p] && x >= r.x && y >= r.y && x < r.x + r.w && y < r.y + r.h) o[p] = 1; } return o; }
// Grow `steps` rings into composite px that are "dark outline" (luminance < lT) — closes item outlines that coincide with
// the body outline (both dark, so the diff sees "unchanged").
export function growOutline(mask, C, { steps = 1, lT = 70 } = {}) {
  let m = mask;
  for (let s = 0; s < steps; s++) { const d = dilate(m, C.w, C.h), o = new Uint8Array(m); for (let p = 0, i = 0; p < o.length; p++, i += 4) if (!m[p] && d[p] && C.d[i + 3] >= 128 && (C.d[i] + C.d[i + 1] + C.d[i + 2]) / 3 < lT) o[p] = 1; m = o; }
  return m;
}

// Integer-translation tracker (SAD over premultiplied RGBA patch), from E8.
export function track(A, B, r, R = 4) {
  let best = [0, 0, 1e18];
  for (let dy = -R; dy <= R; dy++) for (let dx = -R; dx <= R; dx++) {
    let s = 0;
    for (let y = r.y; y < r.y + r.h; y++) for (let x = r.x; x < r.x + r.w; x++) { const X2 = x + dx, Y2 = y + dy, i = (y * A.w + x) * 4; if (X2 < 0 || Y2 < 0 || X2 >= B.w || Y2 >= B.h) { s += 1020; continue; } const j = (Y2 * B.w + X2) * 4; for (let c = 0; c < 4; c++) s += Math.abs((c < 3 ? pm(A, i, c) : A.d[i + 3]) - (c < 3 ? pm(B, j, c) : B.d[j + 3])); }
    if (s < best[2]) best = [dx, dy, s];
  }
  return best;
}
export const shiftMask = (m, w, h, dx, dy) => { const o = new Uint8Array(m.length); for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) { const sx = x - dx, sy = y - dy; if (sx >= 0 && sy >= 0 && sx < w && sy < h && m[sy * w + sx]) o[y * w + x] = 1; } return o; };

// Temporal consensus over n frames of one item. offs[i] = [dx,dy] of frame i relative to frame 0 (anchor tracking).
// Votes are counted in frame-0 coordinates with a ±1 px tolerance (dilated). A pixel of frame i survives if >= keepK frames
// vote for it; a missing px of frame i is ADDED if >= fillK frames vote for it AND `support[i][p]` (it changed in frame i).
export function temporalConsensus(masks, offs, w, h, { keepK = 3, fillK = 6, support = null } = {}) {
  const n = masks.length, votes = new Uint8Array(w * h);
  const aligned = masks.map((m, i) => shiftMask(m, w, h, -offs[i][0], -offs[i][1]));
  for (const a of aligned) { const d = dilate(a, w, h); for (let p = 0; p < d.length; p++) votes[p] += d[p]; }
  const strict = new Uint8Array(w * h); for (const a of aligned) for (let p = 0; p < a.length; p++) strict[p] += a[p];
  return masks.map((m, i) => {
    const vi = new Uint8Array(w * h), si = new Uint8Array(w * h);
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) { const sx = x - offs[i][0], sy = y - offs[i][1]; if (sx >= 0 && sy >= 0 && sx < w && sy < h) { vi[y * w + x] = votes[sy * w + sx]; si[y * w + x] = strict[sy * w + sx]; } }
    const o = new Uint8Array(w * h);
    for (let p = 0; p < o.length; p++) o[p] = (m[p] && vi[p] >= keepK) || (!m[p] && si[p] >= fillK && (!support || support[i][p])) ? 1 : 0;
    return o;
  });
}

// Layer cleanliness without ground truth: specks (components <= 2 px), pinholes (enclosed empty regions <= 2 px),
// colour count. Lower specks/pinholes = cleaner.
export function cleanliness(L) {
  const { w, h } = L, m = new Uint8Array(w * h); for (let p = 0; p < m.length; p++) m[p] = L.d[p * 4 + 3] >= 128 ? 1 : 0;
  const { comps } = components(m, w, h), specks = comps.filter(c => c.area <= 2);
  const filled = fillHoles(m, { w, h, d: new Uint8ClampedArray(w * h * 4).fill(255) }, 2); let pin = 0; for (let p = 0; p < m.length; p++) if (filled[p] && !m[p]) pin++;
  return { px: m.reduce((a, b) => a + b, 0), comps: comps.length, specks: specks.length, speckPx: specks.reduce((a, c) => a + c.area, 0), pinholes: pin };
}

export function selfTest() {
  const B = make(6, 6), C = make(6, 6);
  for (let p = 0; p < 36; p++) { B.d.set([200, 150, 120, 255], p * 4); C.d.set([200, 150, 120, 255], p * 4); }
  B.d.set([20, 20, 20, 255], 14 * 4); C.d.set([20, 20, 20, 255], 15 * 4); // eye moved by 1 px -> nbr says unchanged
  C.d.set([90, 90, 100, 255], 21 * 4);                                     // real item px
  const m = maskNbr(B, C); console.assert(m[21] && !m[15] && m.reduce((a, b) => a + b) === 1, 'nbr keeps item, drops 1px shift');
  const ring = new Uint8Array(36); for (const p of [7, 8, 9, 13, 15, 19, 20, 21]) ring[p] = 1; console.assert(fillHoles(ring, C, 2)[14] === 1, 'fills pinhole');
  const tc = temporalConsensus([ring, ring, ring, new Uint8Array(36)], [[0, 0], [0, 0], [0, 0], [0, 0]], 6, 6, { keepK: 2, fillK: 3 });
  console.assert(tc[3][7] === 1 && tc[0][7] === 1, 'consensus fills missing frame');
  return true;
}
