// S5 / H4: direction-consistency gate for posed item layers (offline, 0 gens).
// For each posed layer in a front/back view, compare it with the DRESSED KEYFRAME layer of every direction
// (centroid-aligned shape IoU + pixel-weighted palette distance). A frame whose best match is the OPPOSITE view
// (south <-> north) is flagged "wrong-facing" (e.g. a helmet visor on a back view).
// usage: node s5_dircheck.mjs m3helmet | m3sword | s5 <tag> <C> | s4 <item: helmet|cape|hair|chest|boots|sword>
import fs from 'node:fs';
import { experiment } from './lib/run.mjs';
import { make, decode, canvasTo, over } from './lib/img.mjs';
import { chromaMask, despill } from './lib/chroma.mjs';
import { layerFrom } from './lib/diff.mjs';
import { sheet } from './lib/sheet.mjs';
import { minArea } from './lib/clean.mjs';

const X = experiment('s5_held');
const [src, tag, cArg] = process.argv.slice(2);
const DIRS = ['south', 'east', 'north'], OPP = { south: 'north', north: 'south' };

// --- gate (pure) -------------------------------------------------------------------------------------------------
const maskOf = L => { const m = new Uint8Array(L.w * L.h); for (let p = 0; p < m.length; p++) m[p] = L.d[p * 4 + 3] ? 1 : 0; return m; };
const cen = (m, w) => { let n = 0, sx = 0, sy = 0; for (let p = 0; p < m.length; p++) if (m[p]) { n++; sx += p % w; sy += p / w | 0; } return n ? [sx / n, sy / n, n] : null; };
// Appearance similarity after centroid alignment (±1 px): over the union of both masks, a pixel scores
// 1 − maxChannelDiff/128 when both are opaque, 0 when only one is. Captures shape AND interior detail (visor slit, face hole).
// occ (optional): px where the posed frame shows the mannequin (key) — keyframe px landing there count as occluded, not missing.
function simAligned(A, Bl, occ = null) {
  const w = A.w, h = A.h, a = maskOf(A), b = maskOf(Bl), ca = cen(a, w), cb = cen(b, w); if (!ca || !cb) return 0; let best = 0;
  for (let ey = -1; ey <= 1; ey++) for (let ex = -1; ex <= 1; ex++) {
    const dx = Math.round(cb[0] - ca[0]) + ex, dy = Math.round(cb[1] - ca[1]) + ey; let S = 0, U = 0;
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
      const p = y * w + x, X2 = x + dx, Y2 = y + dy, q = Y2 * w + X2, inB = X2 >= 0 && Y2 >= 0 && X2 < w && Y2 < h && b[q];
      if (!a[p] && !inB) continue; if (!a[p] && occ && occ[p]) continue; U++;
      if (a[p] && inB) { const d = Math.max(...[0, 1, 2].map(c => Math.abs(A.d[p * 4 + c] - Bl.d[q * 4 + c]))); S += Math.max(0, 1 - d / 128); }
    }
    best = Math.max(best, U ? S / U : 0);
  }
  return best;
}
const clean = L => { const m = minArea(maskOf(L), L.w, L.h, 4), o = make(L.w, L.h); for (let p = 0; p < m.length; p++) if (m[p]) o.d.set(L.d.subarray(p * 4, p * 4 + 4), p * 4); return o; };
// Two tiers (front/back views only; side views are skipped): own-view similarity < REVIEW -> "review";
// additionally the opposite view's keyframe within OPPM of the own one -> "fail" (wrong-facing, re-roll).
// ponytail: thresholds tuned on one helmet run (M3) — recalibrate per slot class once more items have labels.
// held = rigid item that rotates with the hand: take the best match over keyframe rotations (15° steps).
const rot = (L, deg) => { const m = maskOf(L), c = cen(m, L.w), o = make(L.w, L.h), a = deg * Math.PI / 180, cs = Math.cos(a), sn = Math.sin(a);
  for (let y = 0; y < L.h; y++) for (let x = 0; x < L.w; x++) { const dx = x - c[0], dy = y - c[1], sx = Math.round(c[0] + dx * cs + dy * sn), sy = Math.round(c[1] - dx * sn + dy * cs); if (sx >= 0 && sy >= 0 && sx < L.w && sy < L.h && m[sy * L.w + sx]) o.d.set(L.d.subarray((sy * L.w + sx) * 4, (sy * L.w + sx) * 4 + 4), (y * L.w + x) * 4); }
  return o; };
export function dirGate(L, keyLayers, dir, { REVIEW = 0.75, OPPM = 0.1, held = false, occ = null } = {}) {
  const sc = {}; L = clean(L);
  for (const d of DIRS) { const K = clean(keyLayers[d]); sc[d] = +(held ? Math.max(...[...Array(24).keys()].map(k => simAligned(L, rot(K, k * 15), occ))) : simAligned(L, K, occ)).toFixed(2); }
  const opp = OPP[dir], low = opp && sc[dir] < REVIEW, flag = low ? (sc[opp] >= sc[dir] - OPPM ? 'fail' : 'review') : null;
  return { sc, flag };
}

// --- sources ------------------------------------------------------------------------------------------------------
const CHECK = (r, g, b) => (r === 200 && g === 200 && b === 200) || (r === 230 && g === 230 && b === 230);
function crop(S, ox, oy, s, w = 64) { const o = make(w, w); for (let y = 0; y < w; y++) for (let x = 0; x < w; x++) { const i = ((oy + y * s) * S.w + ox + x * s) * 4, r = S.d[i], g = S.d[i + 1], b = S.d[i + 2]; if (!CHECK(r, g, b)) o.d.set([r, g, b, 255], (y * w + x) * 4); } return o; }
let keyL = {}, clips = [];
const keyPx = F => { const m = chromaMask(F), o = new Uint8Array(m.length); for (let p = 0; p < m.length; p++) o[p] = F.d[p * 4 + 3] >= 128 && !m[p] ? 1 : 0; return o; }; // clips: [{name, dir, layers[]}]
if (src.startsWith('m3')) {
  const item = src === 'm3helmet' ? 'iron_helmet' : 'steel_sword', krow = src === 'm3helmet' ? 0 : 2;
  const K = decode(fs.readFileSync(`${X.dir}/../../../../docs/testing/img/m3_skel_dressed_keyframes.png`));
  DIRS.forEach((d, j) => { const Cc = crop(K, 2 + j * 258, 2 + krow * 258, 4); keyL[d] = despill(layerFrom(Cc, chromaMask(Cc))); });
  const S = decode(fs.readFileSync(`${X.dir}/../../../../docs/testing/img/m3_skel_${item}.png`));
  // M3 sheet: per clip 3 dirs × 4 rows (key, composite, layer, over base), then 4 compose rows (S/E/N/W)
  [['slash', 'south'], ['slash', 'east'], ['slash', 'north'], ['walk', 'south'], ['walk', 'east'], ['walk', 'north']].forEach(([clip, d], k) =>
    clips.push({ name: `${clip}_${d}`, dir: d, layers: [...Array(8).keys()].map(i => crop(S, 2 + i * 130, 2 + ((k > 2 ? 16 : 0) + (k % 3) * 4 + 2) * 130, 2)),
      occ: [...Array(8).keys()].map(i => keyPx(crop(S, 2 + i * 130, 2 + ((k > 2 ? 16 : 0) + (k % 3) * 4 + 1) * 130, 2))) }));
} else { // s5 posed run: tag, canvas
  const C = +cArg, o = (C - 64) / 2, pad = im => im.w === C ? im : canvasTo(im, C, C, o, o);
  DIRS.forEach(d => { const D = pad(X.load(src === 's4' ? `../s4_q3e/dress_ea2_${tag}_${d}.png` : `dress_${tag}_${d}.png`)); keyL[d] = despill(layerFrom(D, chromaMask(D))); });
  for (const d of DIRS) for (const clip of ['walk', 'slash']) {
    const f = i => src === 's4' ? `../s4_q3e/pose_ea2_${tag}_${clip}_${d}_${i}.png` : `pose_${tag}_${clip}_${d}_s7_${i}.png`;
    if (fs.existsSync(`${X.dir}/${f(0)}`)) clips.push({ name: `${clip}_${d}`, dir: d, layers: [...Array(8).keys()].map(i => { const F = pad(X.load(f(i))); return despill(layerFrom(F, chromaMask(F))); }), occ: [...Array(8).keys()].map(i => keyPx(pad(X.load(f(i))))) });
  }
}
const HELD = /sword/.test(src) || src === 's5' || tag === 'sword', out = [];
for (const c of clips) {
  const OCC = !process.env.NO_OCC, r = c.layers.map((L, i) => dirGate(L, keyL, c.dir, { held: HELD, occ: OCC ? c.occ[i] : null }));
  out.push({ clip: c.name, fail: r.map((g, i) => g.flag === 'fail' ? i : null).filter(v => v != null).join(',') || '-', review: r.map((g, i) => g.flag === 'review' ? i : null).filter(v => v != null).join(',') || '-',
    own: r.map(g => g.sc[c.dir]).join(' '), opp: OPP[c.dir] ? r.map(g => g.sc[OPP[c.dir]]).join(' ') : '' });
}
console.table(out);
fs.writeFileSync(`${X.dir}/dircheck_${src}${tag ? '_' + tag : ''}.json`, JSON.stringify({ out }, null, 1));
X.save(`dircheck_${src}${tag ? '_' + tag : ''}.sheet.png`, sheet([DIRS.map(d => keyL[d]), ...clips.map(c => c.layers)], { s: 3 }));
