// Candidate dye-material detectors for the 2026-11-07 cycle (research only; production stays autoRamps).
import { lab, OUTLINE_C, OUTLINE_L } from '../../../../../app/src/lib/dress/palette.ts';
import type { Img } from '../../../../../app/src/lib/image/png.ts';

const N4 = [[-1, 0], [1, 0], [0, -1], [0, 1]];
const rgbOf = (im: Img, p: number) => (im.data[p * 4] << 16) | (im.data[p * 4 + 1] << 8) | im.data[p * 4 + 2];

// ---- spritesplit replay (kotebibo/spritesplit f8ef9a6 ramps.py + outline.py, default parameters), ported from this
// cycle's ecosystem/_replay/ramps-replay.ts; adjacency is summed over several views instead of one image.
export function outlineMask(im: Img): Uint8Array {
  const { w, h } = im, idx = new Int32Array(w * h).fill(-1), keys = new Map<number, number>();
  for (let p = 0; p < w * h; p++) if (im.data[p * 4 + 3]) { const c = rgbOf(im, p); if (!keys.has(c)) keys.set(c, keys.size); idx[p] = keys.get(c)!; }
  const k = keys.size, maxT = 2, depth = new Int32Array(w * h), remaining = Uint8Array.from(idx, (v) => (v >= 0 ? 1 : 0));
  const at = (y: number, x: number) => (y < 0 || x < 0 || y >= h || x >= w ? -1 : y * w + x);
  for (let level = 1; level <= maxT + 1; level++) {
    const shell: number[] = [];
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) { const p = y * w + x; if (remaining[p] && N4.some(([dy, dx]) => { const q = at(y + dy, x + dx); return q < 0 || !remaining[q]; })) shell.push(p); }
    for (const p of shell) { depth[p] = level; remaining[p] = 0; }
  }
  for (let p = 0; p < w * h; p++) if (remaining[p]) depth[p] = maxT + 2;
  const perShell = Array.from({ length: maxT + 3 }, () => new Float64Array(k));
  for (let p = 0; p < w * h; p++) if (idx[p] >= 0 && depth[p] <= maxT + 1) perShell[depth[p]][idx[p]]++;
  const edge = new Uint8Array(w * h), edgeCount = new Float64Array(k); let nEdge = 0;
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) { const p = y * w + x; if (idx[p] >= 0 && N4.some(([dy, dx]) => { const q = at(y + dy, x + dx); return q >= 0 && idx[q] < 0; })) { edge[p] = 1; nEdge++; edgeCount[idx[p]]++; } }
  const mask = new Uint8Array(w * h);
  if (!nEdge) return mask;
  let band = Array.from({ length: k }, (_, c) => edgeCount[c] >= 0.25 * nEdge);
  for (let t = 1; t <= maxT; t++) {
    if (t > 1) band = band.map((b, c) => b && perShell[t][c] >= 0.5 * perShell[1][c]);
    const hasInside = perShell[t + 1].some((v) => v > 0);
    const colors = hasInside ? band.map((b, c) => (b && perShell[t + 1][c] <= 0.6 * perShell[t][c] ? c : -1)).filter((c) => c >= 0) : [];
    if (colors.length && encloses(idx, edge, w, h, new Set(colors))) {
      const set = new Set(colors);
      for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) { const p = y * w + x; if (idx[p] >= 0 && set.has(idx[p]) && (depth[p] <= t || !in2x2(idx, w, h, y, x))) mask[p] = 1; }
      return mask;
    }
  }
  return mask;
}
function in2x2(idx: Int32Array, w: number, h: number, y: number, x: number) {
  const c = idx[y * w + x];
  for (const [oy, ox] of [[0, 0], [-1, 0], [0, -1], [-1, -1]]) { const y0 = y + oy, x0 = x + ox; if (y0 < 0 || x0 < 0 || y0 + 1 >= h || x0 + 1 >= w) continue;
    if ([[0, 0], [1, 0], [0, 1], [1, 1]].every(([a, b]) => idx[(y0 + a) * w + x0 + b] === c)) return true; }
  return false;
}
function encloses(idx: Int32Array, edge: Uint8Array, w: number, h: number, set: Set<number>) {
  let sy = 0, sx = 0, n = 0; for (let p = 0; p < w * h; p++) if (edge[p]) { sy += (p / w) | 0; sx += p % w; n++; }
  const my = sy / n, mx = sx / n, tot = [0, 0, 0, 0], hit = [0, 0, 0, 0];
  for (let p = 0; p < w * h; p++) if (edge[p]) { const dy = ((p / w) | 0) - my, dx = (p % w) - mx;
    [dy <= -Math.abs(dx), dx >= Math.abs(dy), dy >= Math.abs(dx), dx <= -Math.abs(dy)].forEach((s, i) => { if (s) { tot[i]++; if (set.has(idx[p])) hit[i]++; } }); }
  return tot.every((t, i) => hit[i] >= 0.4 * t);
}
/** Mutual-best lighter/darker chains over touching, non-outline pixels of every given view. */
export function chains(views: Img[], removeOutline = true): number[][] {
  const adj = new Map<number, Map<number, number>>(), present = new Set<number>();
  const bump = (a: number, b: number) => { const m = adj.get(a) ?? adj.set(a, new Map()).get(a)!; m.set(b, (m.get(b) ?? 0) + 1); };
  for (const im of views) {
    const ol = removeOutline ? outlineMask(im) : new Uint8Array(im.w * im.h), fill = (p: number) => im.data[p * 4 + 3] > 0 && !ol[p];
    for (let y = 0; y < im.h; y++) for (let x = 0; x < im.w; x++) { const p = y * im.w + x; if (!fill(p)) continue; const c = rgbOf(im, p); present.add(c);
      for (const q of [x + 1 < im.w ? p + 1 : -1, y + 1 < im.h ? p + im.w : -1]) if (q >= 0 && fill(q)) { const d = rgbOf(im, q); if (d !== c) { bump(c, d); bump(d, c); } } }
  }
  const cols = [...present].sort((a, b) => a - b), labs = new Map(cols.map((c) => [c, lab(c)]));
  const cost = (i: number, j: number) => { // i darker -> j lighter
    const a = labs.get(i)!, b = labs.get(j)!, dl = b[0] - a[0], dab2 = (b[1] - a[1]) ** 2 + (b[2] - a[2]) ** 2;
    return dl >= 0.02 && dl <= 0.4 && dab2 <= 0.01 && (adj.get(i)?.get(j) ?? 0) >= 1 ? (dl / 0.4) ** 2 + dab2 / 0.01 : Infinity;
  };
  const best = (c: number, up: boolean) => { let b = -1, v = Infinity; for (const o of cols) { const x = up ? cost(c, o) : cost(o, c); if (x < v) { v = x; b = o; } } return b; };
  const nxt = new Map<number, number>(), prv = new Map<number, number>();
  for (const c of cols) { const j = best(c, true); if (j >= 0 && best(j, false) === c) { nxt.set(c, j); prv.set(j, c); } }
  return cols.filter((c) => !prv.has(c)).map((s) => { const ch = [s]; while (nxt.has(ch[ch.length - 1])) ch.push(nxt.get(ch[ch.length - 1])!); return ch; });
}
/** Production groups, unioned where a chain step links colors in two different groups (the ecosystem replay's hybrid). */
export function hybrid(prod: number[][], ch: number[][], guard?: (a: number[], b: number[]) => boolean): number[][] {
  const groups = prod.map((r) => [...r]), of = new Map<number, number>();
  groups.forEach((r, i) => r.forEach((c) => of.set(c, i)));
  const parent = groups.map((_, i) => i), root = (i: number): number => (parent[i] === i ? i : (parent[i] = root(parent[i])));
  const members = (r: number) => groups.flatMap((g, i) => (root(i) === r ? g : []));
  for (const c of ch) for (let i = 1; i < c.length; i++) {
    const a = of.get(c[i - 1]), b = of.get(c[i]); if (a === undefined || b === undefined) continue;
    const ra = root(a), rb = root(b); if (ra === rb) continue;
    if (guard && !guard(members(ra), members(rb))) continue;
    parent[rb] = ra;
  }
  const out = new Map<number, number[]>(); groups.forEach((g, i) => out.set(root(i), [...(out.get(root(i)) ?? []), ...g]));
  return [...out.values()].map((r) => r.sort((x, y) => lab(x)[0] - lab(y)[0]));
}
const hueDeg = (r: number[]) => { const a = r.reduce((s, c) => s + lab(c)[1], 0) / r.length, b = r.reduce((s, c) => s + lab(c)[2], 0) / r.length; return { C: Math.hypot(a, b), h: (Math.atan2(b, a) * 180) / Math.PI }; };
/** Candidate guard: only merge groups that are both near-neutral or whose mean hues are within 30 degrees. */
export const sameFamily = (x: number[], y: number[]) => { const p = hueDeg(x), q = hueDeg(y); if (p.C < 0.03 && q.C < 0.03) return true; if (p.C < 0.03 || q.C < 0.03) return false; return Math.abs(((p.h - q.h + 540) % 360) - 180) <= 30; };
export const neutralDark = (c: number) => { const [L, a, b] = lab(c); return L < OUTLINE_L && Math.hypot(a, b) < OUTLINE_C; };

/** Second guard, written after seeing both corpora (so it is fitted, not validated): near-neutral groups (mean chroma
 * below 0.045, which admits hue-shifted grays and whites) merge only with near-neutral groups; chromatic groups merge
 * only within 40 degrees of hue. Blocks gold-into-steel and skin-into-gray merges while allowing hue-shifted white ramps. */
export const NEUTRAL_C = 0.045;
export const neutralFamily = (x: number[], y: number[]) => {
  const p = hueDeg(x), q = hueDeg(y);
  if (p.C < NEUTRAL_C || q.C < NEUTRAL_C) return p.C < NEUTRAL_C && q.C < NEUTRAL_C;
  return Math.abs(((p.h - q.h + 540) % 360) - 180) <= 40;
};
