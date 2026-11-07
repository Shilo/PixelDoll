// Free: the rim guard's "dark base" clause with an absolute threshold (mean RGB < 60, HEAD before 2026-11-07) against one
// relative to the cell's own luminance range, one by local contrast and the two combined (see fairness.md for the adopted rule), on real
// bench bodies recolored to three skin tones, with provider redraw modes and thin
// items whose ownership is known by construction; then the pixel difference on the real frozen corpus.
// Run from the repo root: node docs/research/2026-11-07-paperdoll-cycle/scripts/fairness/rim-dark-relative.ts ['local 0.5']
// (the argument picks the variant whose changed real px are listed)
import { readFileSync } from 'node:fs';
import { chromaMask, keyScore, KT, toChroma, type Key } from '../../../../../app/src/lib/image/chroma.ts';
import { runPipe } from '../extraction/bench-replay.ts';
import { baseCell, clone, FIX, type Img } from '../extraction/lib.ts';

const lum = (c: ArrayLike<number>) => (0.299 * c[0] + 0.587 * c[1] + 0.114 * c[2]) / 255;
const isKey = (C: Img, p: number, key: Key) => C.data[p * 4 + 3] >= 128 && keyScore(key, C.data[p * 4], C.data[p * 4 + 1], C.data[p * 4 + 2]) >= KT;
type Dark = (B: Img, p: number) => boolean;
/** The production rim guard (dropKeyOutline) with its "dark base px" clause swapped for `dark` (built per cell). */
function guard(darkOf: (B: Img) => Dark) {
  return (mask: Uint8Array, B: Img, C: Img, key: Key): Uint8Array => {
    const { w, h } = B, cand = new Uint8Array(mask.length), op = (p: number) => B.data[p * 4 + 3] > 0, dark = darkOf(B);
    for (let p = 0; p < mask.length; p++) {
      if (!mask[p] || !op(p)) continue;
      const x = p % w, y = (p / w) | 0, nb = [[x - 1, y], [x + 1, y], [x, y - 1], [x, y + 1]].filter(([X, Y]) => X >= 0 && Y >= 0 && X < w && Y < h).map(([X, Y]) => Y * w + X);
      const edge = nb.length < 4 || nb.some((q) => !op(q));
      if ((edge || dark(B, p)) && nb.filter((q) => op(q) && isKey(C, q, key)).length >= 2) cand[p] = 1;
    }
    const o = new Uint8Array(mask);
    for (let p = 0; p < o.length; p++) {
      if (!cand[p]) continue;
      const x = p % w, y = (p / w) | 0;
      let anchored = false;
      for (let dy = -1; dy <= 1 && !anchored; dy++) for (let dx = -1; dx <= 1; dx++) { const X = x + dx, Y = y + dy, q = Y * w + X; if ((dx || dy) && X >= 0 && Y >= 0 && X < w && Y < h && mask[q] && !cand[q]) { anchored = true; break; } }
      if (!anchored) o[p] = 0;
    }
    return o;
  };
}
const L = (B: Img, p: number) => lum(B.data.subarray(p * 4, p * 4 + 3));
/** HEAD before this study: mean RGB below 60. */
const absolute = guard(() => (B, p) => (B.data[p * 4] + B.data[p * 4 + 1] + B.data[p * 4 + 2]) / 3 < 60);
/** Below lo + f * (hi - lo) of the cell's opaque px. */
const relative = (f: number) => guard((B) => {
  let lo = 1, hi = 0;
  for (let p = 0; p < B.w * B.h; p++) if (B.data[p * 4 + 3]) { lo = Math.min(lo, L(B, p)); hi = Math.max(hi, L(B, p)); }
  return (B2, p) => L(B2, p) < lo + f * (hi - lo);
});
/** Local contrast: an outline is much darker than its brightest opaque 8-neighbor (k of it), which a skin tone's own shading
 * ramp is not, whatever the tone; near-black (lum < 0.06) always counts. */
const localDark = (k: number): Dark => (B, p) => {
  const { w, h } = B, x = p % w, y = (p / w) | 0, l = L(B, p);
  if (l < 0.06) return true;
  let top = 0;
  for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) { const X = x + dx, Y = y + dy; if ((dx || dy) && X >= 0 && Y >= 0 && X < w && Y < h && B.data[(Y * w + X) * 4 + 3]) top = Math.max(top, L(B, Y * w + X)); }
  return l < k * top;
};
const local = (k: number) => guard(() => localDark(k));
/** The absolute rule narrowed by local contrast: a deep skin midtone is under RGB 60 but not much darker than its neighbors. */
const both = (k: number) => guard((B) => { const abs = (B2: Img, p: number) => (B2.data[p * 4] + B2.data[p * 4 + 1] + B2.data[p * 4 + 2]) / 3 < 60, loc = localDark(k); return (B2, p) => abs(B2, p) && loc(B2, p); });
const GUARDS: Record<string, (m: Uint8Array, B: Img, C: Img, k: Key) => Uint8Array> = { absolute, 'rel 0.20': relative(0.2), 'local 0.5': local(0.5), 'abs+local 0.5': both(0.5), 'abs+local 0.6': both(0.6) };

// ---------- skin variants and cases (as the challenge harness: warm skin px recolored, luminance order kept) ----------
const isSkin = (c: ArrayLike<number>) => c[0] > c[1] && c[1] > c[2] && c[0] - c[2] >= 40;
function skin(B: Img, light: number[] | null, dark: number[] | null): Img {
  if (!light || !dark) return B;
  const o = clone(B), ls: number[] = [];
  for (let i = 0; i < B.data.length; i += 4) if (B.data[i + 3] && isSkin(B.data.subarray(i, i + 3))) ls.push(lum(B.data.subarray(i, i + 3)));
  const lo = Math.min(...ls), hi = Math.max(...ls);
  for (let i = 0; i < B.data.length; i += 4) if (B.data[i + 3] && isSkin(B.data.subarray(i, i + 3))) { const t = (lum(B.data.subarray(i, i + 3)) - lo) / (hi - lo || 1); o.data.set([0, 1, 2].map((j) => Math.round(dark[j] + t * (light[j] - dark[j]))), i); }
  return o;
}
const SKINS: Record<string, [number[] | null, number[] | null]> = { light: [null, null], medium: [[196, 136, 98], [112, 68, 48]], deep: [[124, 80, 56], [48, 28, 22]] };
const hash = (p: number) => ((p * 2654435761) >>> 0) / 4294967296;
const BROWN = [112, 72, 40], SILVER = [178, 180, 192], BLACK = [40, 34, 36];
const rows: Record<string, Record<string, [number, number, number]>> = {};
for (const bodyId of ['A', 'N']) {
  const B0 = await baseCell(bodyId, 'south', 'rest'), W = B0.w, H = B0.h, s = W / 64, cx = Math.round(W / 2), half = Math.round(10 * s);
  const op = (x: number, y: number) => B0.data[(y * W + x) * 4 + 3] > 0, outlinePx = (p: number) => Math.max(B0.data[p * 4], B0.data[p * 4 + 1], B0.data[p * 4 + 2]) < 40;
  const ring = (p: number) => { const x = p % W, y = (p / W) | 0; return [[x - 1, y], [x + 1, y], [x, y - 1], [x, y + 1]].some(([X, Y]) => X < 0 || Y < 0 || X >= W || Y >= H || !B0.data[(Y * W + X) * 4 + 3]); };
  const items: Record<string, (pt: (x: number, y: number, c: number[]) => void) => void> = {
    none: () => {},
    belt: (pt) => { const y = Math.round(38 * s); for (let x = cx - half; x <= cx + half; x++) if (op(x, y)) pt(x, y, BROWN); },
    'black strap': (pt) => { const y = Math.round(40 * s); for (let x = cx - half; x <= cx + half; x++) if (op(x, y)) pt(x, y, BLACK); },
    necklace: (pt) => { const y = Math.round(28 * s); for (let x = cx - Math.round(6 * s); x <= cx + Math.round(5 * s); x++) if (op(x, y)) pt(x, y, SILVER); },
    baldric: (pt) => { for (let i = 0; i <= Math.round(14 * s); i++) pt(cx - Math.round(8 * s) + i, Math.round(30 * s) + i, BROWN); },
  };
  for (const [sk, [light, dark]] of Object.entries(SKINS)) {
    const B = skin(B0, light, dark);
    for (const [redraw, frac] of [['none', 0], ['rim olive', 1], ['outline olive 50%', 0.5]] as [string, number][])
      for (const paint of Object.values(items)) {
        const C = toChroma(B, 'green'), item = new Uint8Array(W * H);
        for (let p = 0; p < W * H; p++) { if (!B.data[p * 4 + 3] || hash(p) >= frac) continue; if (redraw.startsWith('rim') && ring(p)) C.data.set([48, 46, 11, 255], p * 4); if (redraw.startsWith('outline') && !ring(p) && outlinePx(p)) C.data.set([48, 46, 11, 255], p * 4); }
        paint((x, y, c) => { C.data.set([...c, 255], (y * W + x) * 4); item[y * W + x] = 1; });
        const m = chromaMask(C, 'green');
        for (const [g, fn] of Object.entries(GUARDS)) {
          const o = fn(m, B, C, 'green');
          let kept = 0, truth = 0, fp = 0;
          for (let p = 0; p < o.length; p++) { if (item[p]) { truth++; if (o[p]) kept++; } else if (o[p]) fp++; }
          const k = bodyId + ' ' + sk.padEnd(6) + ' ' + redraw.padEnd(17), cur = ((rows[k] ??= {})[g] ??= [0, 0, 0]);
          cur[0] += kept; cur[1] += truth; cur[2] += fp;
        }
      }
  }
}
console.log('Synthetic (kept item px / item px, false px), summed over items:');
for (const [k, r] of Object.entries(rows)) console.log(k, Object.entries(r).map(([g, [a, b, c]]) => g + ': ' + a + '/' + b + ' fp ' + c).join(' | '));

// ---------- real frozen corpus: pixels each variant changes against production ----------
const cases = JSON.parse(readFileSync(new URL('cases.json', FIX), 'utf8')).filter((c: { key: string; role?: string }) => c.key !== 'none' && !c.role);
const WATCH = process.argv[2] ?? 'local 0.5', diff: Record<string, number> = {}, added: string[] = [];
for (const c of cases) {
  const run = await runPipe(c);
  for (const x of [...run.kf, ...run.cells]) {
    const m = chromaMask(x.out, c.key), a = absolute(m, x.base, x.out, c.key);
    for (const [g, fn] of Object.entries(GUARDS)) {
      if (g === 'absolute') continue;
      const b = fn(m, x.base, x.out, c.key);
      let n = 0;
      for (let p = 0; p < a.length; p++) if (a[p] !== b[p]) {
        n++;
        if (g === WATCH) { const o = x.out.data, bd = x.base.data; added.push(c.id + ' ' + x.key + ' ' + (b[p] ? 'kept' : 'dropped') + ' rgb ' + [o[p * 4], o[p * 4 + 1], o[p * 4 + 2]].join(',') + ' over body ' + [bd[p * 4], bd[p * 4 + 1], bd[p * 4 + 2]].join(',')); }
      }
      if (n) diff[g + ' ' + c.id] = (diff[g + ' ' + c.id] ?? 0) + n;
    }
  }
}
console.log('Real corpus px changed vs absolute:', JSON.stringify(diff));
console.log(added.join(String.fromCharCode(10)));
