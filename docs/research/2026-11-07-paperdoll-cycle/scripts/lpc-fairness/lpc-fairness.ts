// Free, offline: the rim guard (dropKeyOutline) on human-drawn LPC bodies in the generator's own skin-tone palettes, with real
// LPC thin items (belts, sashes, straps, necklaces, ties) composited on top, so the owner of every pixel is known. The input the
// extractor sees is toChroma(body, 'green') with the item px painted over it, plus provider redraw modes (none, olive rim,
// olive outline 50 %, scattered redraw colors over dark key shades at 15 % and 30 %). Every rule runs through the production
// mask chain (chromaMask -> rule -> absorbOutline -> components >= 2); the production rule is cross-checked against
// extractCell and dropKeyOutline on every cell.
// Run from the repo root: node docs/research/2026-11-07-paperdoll-cycle/scripts/lpc-fairness/lpc-fairness.ts
// Writes C:/Programming_Files/Shilocity/PixelLab/checkouts/cycle-2026-11-07/lpc-fairness/results.json
import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { absorbOutline, chromaMask, components, dropKeyOutline, keyScore, KT, toChroma, type Key } from '../../../../../app/src/lib/image/chroma.ts';
import { extractCell } from '../../../../../app/src/lib/items/items.ts';
import type { Img } from '../../../../../app/src/lib/image/png.ts';
import { lpcCell, over, palettes, recolor, SHEETS } from './lpc.ts';

export const OUT = 'C:/Programming_Files/Shilocity/PixelLab/checkouts/cycle-2026-11-07/lpc-fairness/';
const KEY: Key = 'green';
const lum = (r: number, g: number, b: number) => (0.299 * r + 0.587 * g + 0.114 * b) / 255;
const L = (im: Img, p: number) => lum(im.data[p * 4], im.data[p * 4 + 1], im.data[p * 4 + 2]);
const isKey = (C: Img, p: number, key: Key) => C.data[p * 4 + 3] >= 128 && keyScore(key, C.data[p * 4], C.data[p * 4 + 1], C.data[p * 4 + 2]) >= KT;

// ---------- rules: the "dark outline" clause of dropKeyOutline, everything else is the production guard ----------
export interface Px { B: Img; C: Img; p: number; x: number; y: number; mean: number; lB: number; lC: number; top: () => number; mask: Uint8Array }
export type Rule = (q: Px) => boolean;
const lineByContrast = (q: Px) => q.lB < 0.06 || q.lB < 0.5 * q.top();
/** Hue in degrees and chroma of a color in the key's frame (only the green key is measured here, so the frame is RGB). */
const hueChroma = (r: number, g: number, b: number): [number, number] => {
  const mx = Math.max(r, g, b), mn = Math.min(r, g, b), d = mx - mn;
  if (!d) return [0, 0];
  const h = mx === r ? ((g - b) / d) % 6 : mx === g ? (b - r) / d + 2 : (r - g) / d + 4;
  return [(h * 60 + 360) % 360, d];
};
/** Leans toward the key: the mannequin redraw colors named in fairness.md (48,46,11 at 57 deg, 27,40,4 and 36,49,12 at 82 deg)
 * sit within 75 deg of the green key's 120 deg with a channel spread of at least 12 (keyScore's own excess floor). */
export const keyFamily = (r: number, g: number, b: number) => { const [h, c] = hueChroma(r, g, b); return c >= 12 && Math.abs(h - 120) <= 75; };
/** A straight run (row, column or diagonal) of at least 4 dark, non-key-leaning mask px through p: a drawn stroke, not a
 * scattered redraw px. Production counts only such px since the 2026-11-07 review (a redraw cannot borrow light item px). */
export const stroke = (q: Px, n = 4) => {
  const { w, h } = q.B, C = q.C.data;
  const ok = (i: number) => q.mask[i] && L(q.C, i) < 0.25 && !keyFamily(C[i * 4], C[i * 4 + 1], C[i * 4 + 2]);
  for (const [dx, dy] of [[1, 0], [0, 1], [1, 1], [1, -1]]) {
    let len = 1;
    for (const s of [1, -1]) for (let k = 1; k < n; k++) { const X = q.x + s * k * dx, Y = q.y + s * k * dy; if (X < 0 || Y < 0 || X >= w || Y >= h || !ok(Y * w + X)) break; len++; }
    if (len >= n) return true;
  }
  return false;
};
export const RULES: Record<string, Rule> = {
  /** Before 77b863e9: mean RGB under 60. */
  old: (q) => q.mean < 60,
  /** Production (77b863e9): a light generated px also needs a real line under it. */
  prod: (q) => q.mean < 60 && (q.lC < 0.25 || lineByContrast(q)),
  /** The reviewer's relaxation: every generated px needs a real line (shown to ship more olive on deep skin). */
  allLocal: (q) => q.mean < 60 && lineByContrast(q),
  /** Candidate A: a dark generated px keeps the old test only when its color leans toward the key (a redraw-like color). */
  hueGate: (q) => q.mean < 60 && (lineByContrast(q) || (q.lC < 0.25 && keyFamily(q.C.data[q.p * 4], q.C.data[q.p * 4 + 1], q.C.data[q.p * 4 + 2]))),
  /** Candidate B: a dark generated px keeps the old test unless it lies on a straight stroke of 4+ non-key px. */
  stroke: (q) => q.mean < 60 && (lineByContrast(q) || (q.lC < 0.25 && !stroke(q))),
  /** Candidates A and B together: the old test is lifted only for a dark px that is neither redraw-colored nor off a stroke. */
  hueStroke: (q) => q.mean < 60 && (lineByContrast(q) || (q.lC < 0.25 && (keyFamily(q.C.data[q.p * 4], q.C.data[q.p * 4 + 1], q.C.data[q.p * 4 + 2]) || !stroke(q)))),
};
/** dropKeyOutline with its outline clause swapped for `rule` (same ring, key-neighbor and anchoring logic as production). */
export function guard(mask: Uint8Array, B: Img, C: Img, rule: Rule, key: Key = KEY): Uint8Array {
  const { w, h } = B, cand = new Uint8Array(mask.length), op = (p: number) => B.data[p * 4 + 3] > 0;
  for (let p = 0; p < mask.length; p++) {
    if (!mask[p] || !op(p)) continue;
    const x = p % w, y = (p / w) | 0;
    const nb = [[x - 1, y], [x + 1, y], [x, y - 1], [x, y + 1]].filter(([X, Y]) => X >= 0 && Y >= 0 && X < w && Y < h).map(([X, Y]) => Y * w + X);
    if (nb.filter((q) => op(q) && isKey(C, q, key)).length < 2) continue;
    if (nb.length < 4 || nb.some((q) => !op(q))) { cand[p] = 1; continue; }
    let t = -1;
    const top = () => { if (t < 0) { t = 0; for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) { const X = x + dx, Y = y + dy; if ((dx || dy) && X >= 0 && Y >= 0 && X < w && Y < h && op(Y * w + X)) t = Math.max(t, L(B, Y * w + X)); } } return t; };
    if (rule({ B, C, p, x, y, mean: (B.data[p * 4] + B.data[p * 4 + 1] + B.data[p * 4 + 2]) / 3, lB: L(B, p), lC: L(C, p), top, mask })) cand[p] = 1;
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
}
/** The production mask chain of chromaLayer with the guard swapped. */
export function pipe(C: Img, B: Img, rule: Rule, key: Key = KEY): { guarded: Uint8Array; mask: Uint8Array } {
  const guarded = guard(chromaMask(C, key), B, C, rule, key), m0 = absorbOutline(guarded, B, C, key), mask = new Uint8Array(m0.length);
  for (const comp of components(m0, C.w, C.h)) if (comp.length >= 2) for (const p of comp) mask[p] = 1;
  return { guarded, mask };
}

// ---------- LPC inputs ----------
const BODY = palettes('body/body_ulpc.json'), LPCR = palettes('body/body_lpcr.json'), CLOTH = palettes('cloth/cloth_ulpc.json');
/** Dev tones (ULPC palettes) and held-out tones (LPCR palettes); every palette is index-mapped from ULPC light, the sheets' own colors. */
export const TONES: [string, string, number[][]][] = [
  ...(['light', 'amber', 'olive', 'taupe', 'bronze', 'brown', 'black'] as const).map((t) => ['dev', 'ulpc ' + t, BODY[t]] as [string, string, number[][]]),
  ...(['porcelain', 'peach', 'tan', 'tawny', 'honey', 'bronze', 'brown', 'coffee'] as const).map((t) => ['holdout', 'lpcr ' + t, LPCR[t]] as [string, string, number[][]]),
];
const SEXES = { male: { pants: 'legs/pants/male/walk.png' }, female: { pants: 'legs/pants/thin/walk.png' } } as const;
/** Thin items: [set, name, path template with {sex}, colors]. Dev items shaped the candidates; held-out items only measure them. */
export const ITEMS: [string, string, string, string[]][] = [
  ['dev', 'belt leather', 'torso/waist/belt_leather/{sex}/walk/{c}.png', ['charcoal', 'white']],
  ['dev', 'sash', 'torso/waist/sash/{sex}/walk/{c}.png', ['black', 'white']],
  ['dev', 'chain necklace', 'neck/necklace/chain/{sex}/walk/{c}.png', ['iron', 'silver']],
  ['dev', 'cape tie', 'neck/capetie/{sex}/walk/{c}.png', ['black', 'white']],
  ['holdout', 'belt loose', 'torso/waist/belt_loose/{sex}/walk/{c}.png', ['charcoal', 'tan']],
  ['holdout', 'belt double', 'torso/waist/belt_double/{sex}/walk/{c}.png', ['brown', 'slate']],
  ['holdout', 'suspenders', 'torso/aprons/suspenders/{sex}/walk/{c}.png', ['black', 'white']],
  ['holdout', 'scarf', 'neck/scarf/walk/{c}.png', ['black', 'white']],
  ['holdout', 'bowtie', 'neck/tie/bowtie/adult/walk/{c}.png', ['black', 'white']],
  ['holdout', 'simple necklace', 'neck/necklace/simple/{sex}/walk/{c}.png', ['gold', 'steel']],
  ['holdout', 'box charm', 'neck/charm/box/{sex}/walk/{c}.png', ['steel', 'bronze']],
];
const DIRS = ['south', 'east'] as const, FRAMES = (process.env.LPC_FRAMES ?? '0,2,4,6').split(',').map(Number);
/** Redraw colors: olive 48,46,11 (the reviewer's), 27,40,4 and 36,49,12 (fairness.md), and the dark colors the production
 * guard drops most on the real green bench (bench-drops.ts); the last two (brown) come from the red cape cases and may be cape px. */
export const REDRAWS = [[48, 46, 11], [27, 40, 4], [36, 49, 12], [26, 29, 4], [19, 28, 3], [29, 36, 12], [47, 63, 22], [45, 33, 7], [46, 24, 6]];
export const MODES = ['none', 'rim olive', 'outline olive 50%', 'scatter olive 15%', 'scatter olive 30%', 'scatter family 30%', 'scatter brown 30%'] as const;
/** Scatter palettes: the reviewer's olive; the olive family (the first seven REDRAWS, hue 57 to 82 deg); the two brown bench drops
 * (45,33,7 and 46,24,6, from the a-cape and b-cloak cases: possibly cape px, possibly redraws drifting to brown). */
const SCATTER: Record<string, number[][]> = { olive: REDRAWS.slice(0, 1), family: REDRAWS.slice(0, 7), brown: REDRAWS.slice(7) };
const hash = (n: number) => { let h = Math.imul(n ^ (n >>> 16), 0x45d9f3b); h = Math.imul(h ^ (h >>> 16), 0x45d9f3b); return ((h ^ (h >>> 16)) >>> 0) / 4294967296; };

export interface Tally { darkTruth: number; darkKept: number; lightTruth: number; lightKept: number; fp: number; fpNoItem: number }
const tally = (): Tally => ({ darkTruth: 0, darkKept: 0, lightTruth: 0, lightKept: 0, fp: 0, fpNoItem: 0 });

export async function run(rules: Record<string, Rule>, opts: { save?: boolean } = {}) {
  const res: Record<string, Tally> = {}, skinLum: Record<string, number> = {}, check = { inputs: 0, cells: 0, extractMismatch: 0, guardMismatch: 0 };
  const add = (k: string, f: (t: Tally) => void) => f((res[k] ??= tally()));
  let cellIdx = 0;
  for (const [toneSet, tone, pal] of TONES) {
    const skin: number[] = [];
    for (const [sex, { pants }] of Object.entries(SEXES))
      for (const base of ['bare', 'dark pants'])
        for (const dir of DIRS)
          for (const f of FRAMES) {
            cellIdx++;
            let src = over(lpcCell(`body/bodies/${sex}/walk.png`, dir, f), lpcCell(`head/heads/human/${sex}/walk.png`, dir, f));
            const srcBody = src;
            const r = recolor(src, BODY.light, pal);
            let B = r.img;
            if (base === 'dark pants') { const pc = lpcCell(pants, dir, f); B = over(B, recolor(pc, CLOTH.white, CLOTH.charcoal).img); src = over(src, pc); }
            if (base === 'bare' && dir === 'south' && f === 0) for (let p = 0; p < B.w * B.h; p++) if (srcBody.data[p * 4 + 3] && !(srcBody.data[p * 4] === 39 && srcBody.data[p * 4 + 1] === 25)) skin.push(L(B, p));
            const W = B.w, H = B.h, op = (p: number) => B.data[p * 4 + 3] > 0;
            const ring = (p: number) => { const x = p % W, y = (p / W) | 0; return [[x - 1, y], [x + 1, y], [x, y - 1], [x, y + 1]].some(([X, Y]) => X < 0 || Y < 0 || X >= W || Y >= H || !op(Y * W + X)); };
            // outline px known by construction: the darkest palette entry of the source sheets (body 39,25,32, cloth white 40,24,32)
            const outline = (p: number) => { const d = src.data; return d[p * 4 + 3] > 0 && ((d[p * 4] === 39 && d[p * 4 + 1] === 25 && d[p * 4 + 2] === 32) || (d[p * 4] === 40 && d[p * 4 + 1] === 24 && d[p * 4 + 2] === 32)); };
            const K = toChroma(B, KEY);
            const darkKey = (p: number) => op(p) && lum(K.data[p * 4], K.data[p * 4 + 1], K.data[p * 4 + 2]) <= 0.3;
            for (const mode of MODES) {
              const redrawn = new Uint8Array(W * H), Cm: Img = { w: W, h: H, data: new Uint8ClampedArray(K.data) };
              for (let p = 0; p < W * H; p++) {
                if (!op(p)) continue;
                const u = hash(p + 7919 * cellIdx);
                let c: number[] | undefined;
                if (mode === 'rim olive' && ring(p)) c = REDRAWS[0];
                else if (mode === 'outline olive 50%' && !ring(p) && outline(p) && u < 0.5) c = REDRAWS[0];
                else if (mode.startsWith('scatter') && darkKey(p) && u < (mode.endsWith('15%') ? 0.15 : 0.3)) { const pal = SCATTER[mode.split(' ')[1]]; c = pal[Math.floor(hash(p * 31 + cellIdx) * pal.length)]; }
                if (c) { Cm.data.set([...c, 255], p * 4); redrawn[p] = 1; }
              }
              const items: [string, string, string, Img | null][] = [['-', 'none', '-', null]];
              for (const [set, name, tpl, colors] of ITEMS) for (const c of colors) {
                const rel = tpl.replace('{sex}', sex).replace('{c}', c);
                if (existsSync(SHEETS + rel)) items.push([set, name, c, lpcCell(rel, dir, f)]);
              }
              // 1 px synthetic straps as in fairness.md (black 40,34,36 is dark, brown 112,72,40 light), placed by the LPC belt
              const belt = lpcCell(`torso/waist/belt_leather/${sex}/walk/charcoal.png`, dir, f);
              let y0 = H, sx = 0, n = 0;
              for (let p = 0; p < W * H; p++) if (belt.data[p * 4 + 3]) { y0 = Math.min(y0, (p / W) | 0); sx += p % W; n++; }
              const cx = Math.round(sx / n), synth = (pts: [number, number][], c: number[]) => { const im: Img = { w: W, h: H, data: new Uint8ClampedArray(W * H * 4) }; for (const [x, y] of pts) if (op(y * W + x)) im.data.set([...c, 255], (y * W + x) * 4); return im; };
              const row = Array.from({ length: 21 }, (_, i) => [cx - 10 + i, y0 + 1] as [number, number]), diag = Array.from({ length: 15 }, (_, i) => [cx - 7 + i, y0 - 13 + i] as [number, number]);
              items.push(['synthetic', 'strap 1px', 'black', synth(row, [40, 34, 36])], ['synthetic', 'baldric 1px', 'black', synth(diag, [40, 34, 36])], ['synthetic', 'strap 1px', 'brown', synth(row, [112, 72, 40])]);
              for (const [set, name, color, item] of items) {
                const C: Img = { w: W, h: H, data: new Uint8ClampedArray(Cm.data) }, own = new Uint8Array(W * H);
                if (item) for (let p = 0; p < W * H; p++) if (item.data[p * 4 + 3]) { C.data.set(item.data.subarray(p * 4, p * 4 + 4), p * 4); C.data[p * 4 + 3] = 255; own[p] = 1; }
                if (item && !own.some(Boolean)) continue;
                const outs: Record<string, Uint8Array> = {};
                for (const [rn, rule] of Object.entries(rules)) outs[rn] = pipe(C, B, rule).mask;
                // Cross-check the reimplementation against production on every fifth input. Production adopted hueStroke on
                // 2026-11-07 (before that it was `prod`, commit 77b863e9).
                if (rules.hueStroke && check.inputs++ % 5 === 0) {
                  check.cells++;
                  const gp = guard(chromaMask(C, KEY), B, C, RULES.hueStroke), gd = dropKeyOutline(chromaMask(C, KEY), B, C, KEY);
                  if (gp.some((v, i) => v !== gd[i])) check.guardMismatch++;
                  const x = extractCell({ key: 'walk/' + dir + '/' + f, call: 0, base: B, out: C, route: KEY, band: { x: 0, y: 0, w: W, h: H } });
                  if (outs.hueStroke.some((v, i) => v !== x.mask[i])) check.extractMismatch++;
                }
                for (const [rn, m] of Object.entries(outs)) {
                  const k = [toneSet, tone, base, mode, item ? set : '-', item ? name + ' ' + color : 'none', rn].join('|');
                  add(k, (t) => {
                    for (let p = 0; p < W * H; p++) {
                      if (own[p]) { const dark = L(C, p) < 0.25; if (dark) { t.darkTruth++; if (m[p]) t.darkKept++; } else { t.lightTruth++; if (m[p]) t.lightKept++; } }
                      else if (m[p]) { if (item) t.fp++; else t.fpNoItem++; }
                    }
                  });
                }
              }
            }
          }
    skinLum[tone] = skin.reduce((a, b) => a + b, 0) / skin.length;
  }
  if (opts.save) { mkdirSync(OUT, { recursive: true }); writeFileSync(OUT + 'results.json', JSON.stringify({ check, skinLum, res })); }
  return { res, skinLum, check };
}

if (import.meta.main) {
  const t0 = Date.now(), { check, skinLum } = await run(RULES, { save: true });
  console.log('cross-check', JSON.stringify(check), 'skin lum', JSON.stringify(skinLum), ((Date.now() - t0) / 1000).toFixed(0) + ' s');
}
