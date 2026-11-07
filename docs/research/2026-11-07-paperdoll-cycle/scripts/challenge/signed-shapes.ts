// Re-review of the implemented signed G9 (items.ts evaluateQa signedRel): which held-item shapes are "decisive", i.e. can
// have a reversal detected at all. The decisiveness rule is restated from items.ts (reach >= HELD_SIGNED_REACH, centroid
// offset >= 25 % of reach, centroid within 45 degrees of the principal axis); axisOf, centroid and HELD_SIGNED_REACH are
// imported from production. A reversal about the wrist is a point reflection, so it is decisive exactly when the original
// is: the decisive share is the share of frames where a reversal can fail G9 at all.
// Run from the repo root: node docs/research/2026-11-07-paperdoll-cycle/scripts/challenge/signed-shapes.ts
import { axisOf, HELD_SIGNED_REACH } from '../../../../../app/src/lib/items/items.ts';
import { centroid } from '../../../../../app/src/lib/image/similarity.ts';

const W = 128, WR: [number, number] = [64, 64];
type Pt = [number, number];
/** Rasterize item-local points (wrist at the origin, item along +x) rotated by deg. */
function raster(pts: Pt[], deg: number, scale = 1) {
  const m = new Uint8Array(W * W), a = (deg * Math.PI) / 180, c = Math.cos(a), s = Math.sin(a);
  for (const [x, y] of pts) { const X = Math.floor(WR[0] + scale * (x * c - y * s)), Y = Math.floor(WR[1] + scale * (x * s + y * c)); if (X >= 0 && Y >= 0 && X < W && Y < W) m[Y * W + X] = 1; }
  return m;
}
const line = (x0: number, y0: number, x1: number, y1: number, wdt = 1): Pt[] => { const o: Pt[] = [], n = Math.ceil(Math.hypot(x1 - x0, y1 - y0) * 4); for (let i = 0; i <= n; i++) for (let k = -wdt / 2; k <= wdt / 2; k += 0.25) { const t = i / n, dx = x1 - x0, dy = y1 - y0, l = Math.hypot(dx, dy) || 1; o.push([x0 + t * dx - (k * dy) / l, y0 + t * dy + (k * dx) / l]); } return o; };
const rect = (x0: number, y0: number, x1: number, y1: number): Pt[] => { const o: Pt[] = []; for (let x = x0; x <= x1; x += 0.25) for (let y = y0; y <= y1; y += 0.25) o.push([x, y]); return o; };
const arc = (cx: number, cy: number, r: number, a0: number, a1: number, wdt = 2): Pt[] => { const o: Pt[] = []; for (let a = a0; a <= a1; a += 0.5 / r) for (let k = -wdt / 2; k <= wdt / 2; k += 0.25) o.push([cx + (r + k) * Math.cos(a), cy + (r + k) * Math.sin(a)]); return o; };

const SHAPES: Record<string, Pt[]> = {
  'sword 30 px': [...line(-3, 0, 30, 0, 3), ...line(2, -5, 2, 5, 2)],
  'axe, haft 28 + head 8x10 one side': [...line(-3, 0, 28, 0, 2), ...rect(20, 1, 28, 10)],
  'axe, haft 28 + head 12x14 one side': [...line(-3, 0, 28, 0, 2), ...rect(16, 1, 28, 14)],
  'axe, haft 20 + head 14x18 one side': [...line(-3, 0, 20, 0, 2), ...rect(8, 1, 22, 18)],
  'hammer, haft 26 + head 6x16 centered': [...line(-3, 0, 26, 0, 2), ...rect(22, -8, 28, 8)],
  'war pick, haft 22 + spike 3x16 one side': [...line(-3, 0, 22, 0, 2), ...line(22, 0, 22, 16, 3)],
  'sickle, shaft 10 + hook r 9 back': [...line(-3, 0, 10, 0, 2), ...arc(10, 9, 9, -Math.PI / 2, Math.PI / 2)],
  'scimitar, arc r 40 over 45 deg': [...line(-3, 0, 2, 0, 3), ...arc(2, 40, 40, -Math.PI / 2, -Math.PI / 2 + Math.PI / 4, 3)],
  'khopesh, shaft 14 + hook r 8': [...line(-3, 0, 14, 0, 3), ...arc(14, 8, 8, -Math.PI / 2, Math.PI / 4, 3)],
  'spear gripped at 1/3, 45 px': [...line(-15, 0, 30, 0, 2), ...rect(28, -2, 34, 2)],
  'torch, haft 14 + flame 8x8': [...line(-3, 0, 14, 0, 2), ...rect(14, -4, 22, 4)],
  'crescent axe, haft 16 + head 10x26 one side': [...line(-3, 0, 16, 0, 2), ...rect(8, 1, 18, 26)],
  'sickle, shaft 4 + hook r 12 back': [...line(-3, 0, 4, 0, 2), ...arc(4, 12, 12, -Math.PI / 2, Math.PI / 2, 2)],
  'mace, haft 14 + ball r 7': [...line(-3, 0, 14, 0, 2), ...arc(20, 0, 3.5, 0, 2 * Math.PI, 7)],
  'kite shield on forearm 14x24': rect(-6, -4, 8, 20),
  'bow gripped at middle, 36 px': arc(-14, 0, 18, -1.1, 1.1, 2),
};
const rows: Record<string, unknown>[] = [];
for (const [name, pts] of Object.entries(SHAPES)) for (const scale of [1, 2]) {
  let decisive = 0, n = 0, why = { reach: 0, offset: 0, offAxis: 0, noAxis: 0 };
  for (let deg = 0; deg < 360; deg += 15) {
    n++;
    const m = raster(pts, deg, scale), ct = centroid(m, W), ax = axisOf(m, W);
    if (!ct || ax == null) { why.noAxis++; continue; }
    const cx = ct[0] + 0.5 - WR[0], cy = ct[1] + 0.5 - WR[1];
    let reach = 0; for (let p = 0; p < m.length; p++) if (m[p]) reach = Math.max(reach, Math.hypot((p % W) + 0.5 - WR[0], ((p / W) | 0) + 0.5 - WR[1]));
    const off = Math.hypot(cx, cy), along = Math.cos(ax) * cx + Math.sin(ax) * cy;
    if (reach < HELD_SIGNED_REACH) why.reach++; else if (off < 0.25 * reach) why.offset++; else if (Math.abs(along) < Math.SQRT1_2 * off) why.offAxis++; else decisive++;
  }
  rows.push({ shape: name, scale, decisive: `${decisive}/${n}`, ...why });
}
console.table(rows);
