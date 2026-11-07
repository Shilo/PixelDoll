// Audit (2026-11-07 color/prompt audit): an item the model colors like the key WITHOUT a color word in the prompt.
// 1. Synthetic: paint plausible model-chosen palettes on the exact keyed body A south rest (truth known by construction),
//    run the production keyframe extractor and gates, and count item px silently treated as body.
// 2. Detectors on the dressed keyframe (before posing): which measured signal sees the collision?
//    dev T  = px the extractor kept as body (mask 0) on the base silhouette that score as key but differ from the exact
//             key input px (toChroma of the base) by more than T (Chebyshev RGB); largest 8-connected component reported.
//    off    = key-scoring px off the base silhouette (raw G3 numerator, newKeyPixels).
// 3. Calibration on the frozen benchmark corpus (real PixelLab keyframes), including the two recorded collisions
//    (a-jester-magenta: pink keyed out on magenta; a-stripes-magenta: purple stripes keyed out on magenta).
// Offline, production functions imported. Run from the repo root:
//   node docs/research/2026-11-07-paperdoll-cycle/scripts/audit/key-collision.ts
import { readFileSync } from 'node:fs';
import { components, KEYS, KT, keyScore, newKeyPixels, pickKey, toChroma, type Key } from '../../../../../app/src/lib/image/chroma.ts';
import { extractCell, g2Fails, GATES, grayShare, padImg, designGraySmudges } from '../../../../../app/src/lib/items/items.ts';
import { baseCell, body, cell, FIX, load, set, type Img } from '../extraction/lib.ts';

const TS = [24, 32, 48];
function detect(B: Img, C: Img, key: Key, mask: Uint8Array) {
  const In = toChroma(B, key), n = B.w * B.h, out: Record<string, number> = {};
  for (const T of TS) {
    const m = new Uint8Array(n);
    let count = 0;
    for (let p = 0; p < n; p++) {
      const i = p * 4;
      if (mask[p] || !B.data[i + 3] || C.data[i + 3] < 128 || keyScore(key, C.data[i], C.data[i + 1], C.data[i + 2]) < KT) continue;
      if (Math.max(Math.abs(C.data[i] - In.data[i]), Math.abs(C.data[i + 1] - In.data[i + 1]), Math.abs(C.data[i + 2] - In.data[i + 2])) > T) { m[p] = 1; count++; }
    }
    out[`dev${T}`] = count;
    out[`dev${T}max`] = components(m, B.w, B.h).reduce((a, c) => Math.max(a, c.length), 0);
  }
  out.off = newKeyPixels(B, C, key)?.pixels ?? 0;
  // near-key share: kept item px whose raw color has a real key excess but scores below KT (the palette leans to the key)
  let item = 0, near = 0;
  for (let p = 0; p < n; p++) if (mask[p]) { item++; const s = keyScore(key, C.data[p * 4], C.data[p * 4 + 1], C.data[p * 4 + 2]); if (s >= 20 && s < KT) near++; }
  out.nearPct = item ? Math.round((100 * near) / item) : 0;
  return out;
}
/** Measured key: the first key (pickKey order) on which <= 1 % of the changed px (|C - In| > 32 or off-body) score as key. */
function measuredKey(B: Img, C: Img, key: Key): Key | undefined {
  const In = toChroma(B, key), px: number[][] = [];
  for (let p = 0; p < B.w * B.h; p++) {
    const i = p * 4;
    if (C.data[i + 3] < 128) continue;
    const d = Math.max(Math.abs(C.data[i] - In.data[i]), Math.abs(C.data[i + 1] - In.data[i + 1]), Math.abs(C.data[i + 2] - In.data[i + 2]));
    if (!B.data[i + 3] || d > 32) px.push([C.data[i], C.data[i + 1], C.data[i + 2]]);
  }
  return KEYS.find((k) => px.filter((c) => keyScore(k, c[0], c[1], c[2]) >= KT).length <= 0.01 * px.length);
}

// ---------- 1. synthetic ----------
const B = await baseCell('A', 'south', 'rest'), W = B.w, H = B.h, band = { x: 0, y: 0, w: 1e3, h: H };
const onBody = (x: number, y: number) => B.data[(y * W + x) * 4 + 3] > 0;
type Paint = (x: number, y: number) => number[] | undefined;
const torso: (pal: number[][]) => Paint = (pal) => (x, y) => (y >= 29 && y <= 45 && x >= 22 && x <= 41 && onBody(x, y) ? pal[(x + 2 * y) % pal.length] : undefined);
const cloak: (pal: number[][]) => Paint = (pal) => (x, y) => (y >= 27 && y <= 52 && x >= 16 && x <= 47 && (onBody(x, y) || x < 22 || x > 41) ? pal[(y + (x >> 2)) % pal.length] : undefined);
const cap: (pal: number[][]) => Paint = (pal) => (x, y) => (y >= 12 && y <= 19 && x >= 25 && x <= 38 ? pal[(x + y) % pal.length] : undefined);
const blade: (pal: number[][]) => Paint = (pal) => (x, y) => (x >= 44 && x <= 46 && y >= 30 && y <= 50 ? pal[y % pal.length] : undefined);
const stripes: (pal: number[][]) => Paint = (pal) => (x, y) => (y >= 29 && y <= 45 && x >= 22 && x <= 41 && onBody(x, y) ? pal[((y - 29) >> 1) % pal.length] : undefined);
const CASES: { id: string; prompt: string; paint: Paint }[] = [
  { id: 'goblin-armor (yellow-green)', prompt: 'goblin armor', paint: torso([[64, 98, 40], [86, 130, 52], [110, 160, 64], [140, 190, 80]]) },
  { id: 'elven-cloak (forest)', prompt: 'elven cloak', paint: cloak([[24, 64, 36], [34, 85, 51], [46, 110, 66], [70, 140, 90]]) },
  { id: 'poison-dagger (neon blade)', prompt: 'poison dagger', paint: blade([[57, 255, 20], [40, 200, 20], [30, 150, 20]]) },
  { id: 'ramp-like tunic (R = B)', prompt: 'Link tunic', paint: torso([[20, 110, 20], [40, 150, 40], [70, 195, 70]]) },
  { id: 'camo jacket', prompt: 'camo jacket', paint: torso([[120, 134, 107], [85, 107, 47], [60, 70, 40], [110, 90, 60]]) },
  { id: 'rainbow scarf', prompt: 'rainbow scarf', paint: stripes([[200, 30, 30], [230, 140, 30], [230, 220, 40], [30, 180, 30], [40, 60, 200], [130, 40, 160]]) },
  { id: 'capa verde (green cap)', prompt: 'capa verde', paint: cap([[30, 120, 40], [50, 160, 60], [80, 200, 90]]) },
  { id: 'control: red cap', prompt: 'a red cap', paint: cap([[150, 34, 38], [190, 50, 50], [110, 20, 25]]) },
  // D1: a colorful design with an intended neutral part that GRAYISH does not name (skull emblem, 9 of 112 px)
  { id: 'D1: red pirate hat + skull', prompt: 'red pirate hat with a skull emblem', paint: (x, y) => { const c = cap([[150, 34, 38], [190, 50, 50], [110, 20, 25]])(x, y); return c && y >= 14 && y <= 16 && x >= 30 && x <= 32 ? [225, 222, 215] : c; } },
  { id: 'D1: same, prompt says white', prompt: 'red pirate hat with a white skull emblem', paint: (x, y) => { const c = cap([[150, 34, 38], [190, 50, 50], [110, 20, 25]])(x, y); return c && y >= 14 && y <= 16 && x >= 30 && x <= 32 ? [225, 222, 215] : c; } },
  { id: 'control: brown vest', prompt: 'leather vest', paint: torso([[112, 72, 40], [140, 95, 55], [80, 50, 30]]) },
  { id: 'control: steel sword', prompt: 'steel sword', paint: blade([[178, 180, 192], [130, 132, 140], [90, 92, 100]]) },
];
console.log('Synthetic keyframes on body A south rest (key from pickKey(prompt)):');
for (const c of CASES) {
  const key = pickKey(c.prompt), C = toChroma(B, key), truth = new Uint8Array(W * H);
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) { const col = c.paint(x, y); if (col) { set(C, x, y, col); truth[y * W + x] = 1; } }
  const x = extractCell({ key: 'rest/south/0', call: 0, base: B, out: C, route: key, band });
  let n = 0, kept = 0;
  for (let p = 0; p < truth.length; p++) if (truth[p]) { n++; if (x.mask[p]) kept++; }
  const gates = [g2Fails(x) && 'G2', (x.keyOutside ?? 0) > GATES.keyOutside && `G3 ${x.keyOutside!.toFixed(3)}`, !x.area && 'G4', designGraySmudges('torso_outer', c.prompt, x.layer) && `D1 ${grayShare(x.layer).toFixed(2)}`].filter(Boolean);
  console.log(`  ${c.id.padEnd(28)} key ${key.padEnd(7)} item ${String(n).padStart(3)} kept ${String(kept).padStart(3)} lost ${String(n - kept).padStart(3)} gates [${gates.join(', ') || 'pass'}] ${JSON.stringify(detect(B, C, key, x.mask))} measuredKey ${measuredKey(B, C, key)}`);
}

// ---------- 3. real benchmark keyframes ----------
interface Case { id: string; body: string; slot: string; key: Key | 'none'; pad: number; clips: string[]; role?: string }
const cases: Case[] = JSON.parse(readFileSync(new URL('cases.json', FIX), 'utf8')).filter((c: Case) => c.key !== 'none');
console.log('\nReal benchmark keyframes (max over the case\'s dressed views):');
for (const c of cases) {
  const { body: b, sheet: bs } = await body(c.body), N = b.rig.cell.w, S = N + 2 * c.pad, sheet = await load(`${c.id}.png`), key = c.key as Key;
  const dirs = c.clips.length ? [...new Set(c.clips.map((k) => k.split('/')[1]))] : b.rows;
  const agg: Record<string, number> = {}, mk: string[] = [];
  for (const d of dirs) {
    const base = padImg(cell(bs, N, b.rows.indexOf(d), b.cols.indexOf('rest')), c.pad);
    const out = cell(sheet, S, c.clips.length ? c.clips.findIndex((k) => k.endsWith(`/${d}`)) : 0, c.clips.length ? 0 : b.rows.indexOf(d));
    const x = extractCell({ key: `rest/${d}/0`, call: 0, base, out, route: key, band: { x: 0, y: 0, w: 1e3, h: S } });
    for (const [k, v] of Object.entries(detect(base, out, key, x.mask))) agg[k] = Math.max(agg[k] ?? 0, v);
    mk.push(`${d}:${measuredKey(base, out, key) ?? '-'}`);
  }
  console.log(`  ${(c.id + (c.role ? ' [' + c.role + ']' : '')).padEnd(32)} ${key.padEnd(7)} ${JSON.stringify(agg)} measured ${mk.join(' ')}`);
}

// ---------- 4. alternative key from measured item colors (kept item px raw RGB + off-body key px), for flagged cases ----------
const altKey = (B: Img, C: Img, key: Key, mask: Uint8Array): Key | undefined => {
  const px: number[][] = [];
  for (let p = 0; p < B.w * B.h; p++) { const i = p * 4; if (C.data[i + 3] >= 128 && (mask[p] || (!B.data[i + 3] && keyScore(key, C.data[i], C.data[i + 1], C.data[i + 2]) >= KT))) px.push([C.data[i], C.data[i + 1], C.data[i + 2]]); }
  return KEYS.find((k) => k !== key && px.filter((c) => keyScore(k, c[0], c[1], c[2]) >= KT).length <= 0.01 * px.length);
};
console.log('\nAlternative key measured from item colors (first other key on which <= 1 % of item px score as key):');
for (const id of ['a-jester-magenta', 'a-stripes-magenta', 'b-jester', 'n-cloak128', 'a-chest', 'a-cape']) {
  const c = cases.find((x) => x.id === id)!, { body: b, sheet: bs } = await body(c.body), N = b.rig.cell.w, S = N + 2 * c.pad, sheet = await load(`${c.id}.png`), key = c.key as Key;
  const dirs = c.clips.length ? [...new Set(c.clips.map((k) => k.split('/')[1]))] : b.rows;
  const res = dirs.map((d) => {
    const base = padImg(cell(bs, N, b.rows.indexOf(d), b.cols.indexOf('rest')), c.pad), out = cell(sheet, S, c.clips.length ? c.clips.findIndex((k) => k.endsWith(`/${d}`)) : 0, c.clips.length ? 0 : b.rows.indexOf(d));
    return `${d}:${altKey(base, out, key, extractCell({ key: `rest/${d}/0`, call: 0, base, out, route: key, band: { x: 0, y: 0, w: 1e3, h: S } }).mask) ?? '-'}`;
  });
  console.log(`  ${id.padEnd(20)} ${key.padEnd(7)} ${res.join(' ')}`);
}
for (const c of CASES.slice(0, 7)) {
  const key = pickKey(c.prompt), C = toChroma(B, key);
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) { const col = c.paint(x, y); if (col) set(C, x, y, col); }
  console.log(`  ${c.id.padEnd(28)} ${key} -> ${altKey(B, C, key, extractCell({ key: 'rest/south/0', call: 0, base: B, out: C, route: key, band }).mask) ?? '-'}`);
}
