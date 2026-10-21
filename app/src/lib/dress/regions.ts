// Base colour regions (B15, architecture §6): shirt vs shorts on the base body. PixelLab draws both garments from one grey
// ramp (M4), so no exact-colour material can tell them apart. Here the base's garment px are split by POSITION (per garment
// component, above / below the hip line) and the answer is written into the pixels: shirt greys get an even blue channel,
// shorts greys an odd one (a 1/255 nudge, invisible). Everything downstream stays exact-colour: Shirt = even garment greys,
// Shorts = odd ones, Skin = the rest; ramps are disjoint (spec inv. 5), engine swap shaders keep working.
// Idempotent: garment-ness is judged with the region bit cleared, so splitting a split cell changes nothing.
import { components } from '../image/chroma.ts';
import type { Img } from '../image/png.ts';
import { opaqueBox } from '../rig/normalize.ts';
import { baseHashOf, cellHash, cellKeys, type DirectionName, type Sha256 } from '../rig/rig.ts';
import type { Project } from '../store/manifest.ts';
import { lab } from './palette.ts';

/** Garment greys: low chroma (skin is warm, C ≥ 0.09; eye whites 0.044) and not the near-black outline (B15 probe on S4 rig). */
export const GARMENT = { minL: 0.18, maxC: 0.04 };
/** Shorts start ~1.3 px above the hip keypoint (S4 rig, south/east/north): px at or below hip − CUT along the body axis. */
const CUT = 1.5;
const memo = new Map<number, boolean>();
export function isGarment(c: number): boolean {
  c &= ~1; // the region bit
  let v = memo.get(c);
  if (v === undefined) { const [L, a, b] = lab(c); memo.set(c, (v = L >= GARMENT.minL && Math.hypot(a, b) < GARMENT.maxC)); }
  return v;
}
export const isShorts = (c: number) => (c & 1) === 1;

/** Hip (and neck: the body axis, so a falling body splits along itself) in pixel indices of the cell. */
export interface BodyLine { hip: [number, number]; neck?: [number, number] }
/** No keypoints (fixtures): hip at 60 % of the figure's height (S4 rig: 41.4 vs keypoint 41.2 S, 41.8 vs 43.3 E). */
export function guessLine(im: Img): BodyLine | null {
  const b = opaqueBox(im);
  return b && { hip: [(b.x0 + b.x1) / 2, b.y0 + 0.6 * (b.y1 - b.y0)] };
}

/** Split one base cell. Garment px form 4-connected components (outlines and skin separate shirt from shorts); a component
 * keeps one region by the majority of its px; only one that straddles the line (no outline in between) is cut px by px. */
export function splitCell(im: Img, line: BodyLine): Img {
  const { w, h } = im, d = im.data, m = new Uint8Array(w * h);
  for (let p = 0; p < m.length; p++) if (d[p * 4 + 3] && isGarment((d[p * 4] << 16) | (d[p * 4 + 1] << 8) | d[p * 4 + 2])) m[p] = 1;
  const [hx, hy] = line.hip, [nx, ny] = line.neck ?? [hx, hy - 1], len = Math.hypot(hx - nx, hy - ny) || 1;
  const ax = (hx - nx) / len, ay = (hy - ny) / len;
  const below = (p: number) => ((p % w) - hx) * ax + (((p / w) | 0) - hy) * ay >= -CUT;
  const out: Img = { w, h, data: new Uint8ClampedArray(d) };
  for (const c of components(m, w, h, true)) {
    const share = c.filter(below).length / c.length, all = share >= 0.75 ? 1 : share <= 0.25 ? 0 : -1;
    for (const p of c) {
      const shorts = all < 0 ? below(p) : all === 1, i = p * 4 + 2;
      out.data[i] = shorts ? d[i] | 1 : d[i] & ~1;
    }
  }
  return out;
}

const lineAt = (p: Project, anim: string, dir: DirectionName, i: number, im: Img): BodyLine | null => {
  const a = p.manifest.rig.anchors, hip = a?.hip?.[anim]?.[dir]?.[i], neck = a?.neck?.[anim]?.[dir]?.[i];
  return hip ? { hip, neck } : guessLine(im);
};

/** The line moved `t` px along the body axis (down = +). */
const shifted = (l: BodyLine, t: number): BodyLine => {
  const [hx, hy] = l.hip, [nx, ny] = l.neck ?? [hx, hy - 1], len = Math.hypot(hx - nx, hy - ny) || 1, dx = ((hx - nx) / len) * t, dy = ((hy - ny) / len) * t;
  return { hip: [hx + dx, hy + dy], neck: [nx + dx, ny + dy] };
};
const rgbAt = (im: Img, p: number) => (im.data[p * 4] << 16) | (im.data[p * 4 + 1] << 8) | im.data[p * 4 + 2];
/** Per garment colour (region bit cleared): [shirt px, shorts px] over the given split cells. */
function tally(pairs: [Img, Img][], t = new Map<number, [number, number]>()) {
  for (const [im, s] of pairs)
    for (let p = 0; p < im.w * im.h; p++) {
      if (!im.data[p * 4 + 3]) continue;
      const c = rgbAt(s, p);
      if (!isGarment(c)) continue;
      const e = t.get(c & ~1) ?? [0, 0];
      e[isShorts(c) ? 1 : 0]++;
      t.set(c & ~1, e);
    }
  return t;
}
/**
 * B15 live (8-dir rig, walk/east/1): a patch-tracked hip anchor sat 4 px below the shorts, so the shorts went to the shirt.
 * Colours that are clearly one garment over the whole rig (>= 75 % of their px) vote: per cell the line moves up to 6 px
 * up / 4 px down to where most of those px agree, ties to the anchor line. Shared shades still split by position.
 */
function fitLine(im: Img, line: BodyLine, votes: Map<number, [number, number]>): BodyLine {
  let best = line, bestScore = -1;
  for (const t of [0, -1, 1, -2, 2, -3, 3, -4, 4, -5, -6]) {
    const l = shifted(line, t), s = splitCell(im, l);
    let score = 0;
    for (let p = 0; p < im.w * im.h; p++) {
      if (!im.data[p * 4 + 3]) continue;
      const c = rgbAt(s, p), v = isGarment(c) && votes.get(c & ~1);
      if (!v) continue;
      const share = v[1] / (v[0] + v[1]);
      if ((share >= 0.75 && isShorts(c)) || (share <= 0.25 && !isShorts(c))) score++;
    }
    if (score > bestScore) { best = l; bestScore = score; }
  }
  return best;
}

/**
 * Split every base cell of `p` in place (Studio rigs: hip/neck anchor tracks; fixtures: guessLine; each line fitted by the
 * rig-wide colour votes, fitLine), mark the base `regions: 'shirt-shorts'`, move baseHash (and the items made for the old
 * base) when pixels changed, and drop the base's materials when they predate the split so deriveMaterials makes Shirt /
 * Shorts / Skin. `images`: the new cell images; `dirty`: something to persist (saveSplit). Idempotent: the votes come from
 * the anchor lines, which do not see the region bit.
 */
export async function splitBase(p: Project): Promise<{ changed: number; dirty: boolean; oldHash: Sha256; images: Map<Sha256, Img> }> {
  const m = p.manifest, rig = m.rig, base = m.items.find((i) => i.id === rig.baseItem), oldHash = rig.baseHash;
  const images = new Map<Sha256, Img>();
  let changed = 0;
  if (!base) return { changed, dirty: false, oldHash, images };
  const jobs: { cells: (Sha256 | null)[]; i: number; im: Img; line: BodyLine }[] = [];
  for (const l of base.layers)
    for (const [anim, dirs] of Object.entries(l.cells ?? {}))
      for (const [dir, cells] of Object.entries(dirs ?? {}) as [DirectionName, (Sha256 | null)[]][])
        for (const [i, h] of cells.entries()) {
          const im = h && p.images.get(h), line = im && lineAt(p, anim, dir, i, im);
          if (im && line) jobs.push({ cells, i, im, line });
        }
  const votes = tally(jobs.map((j) => [j.im, splitCell(j.im, j.line)]));
  for (const { cells, i, im, line } of jobs) {
    const out = splitCell(im, fitLine(im, line, votes)), k = await cellHash(out);
    if (k === cells[i]) continue;
    p.images.set(k, out);
    images.set(k, out);
    cells[i] = k;
    changed++;
  }
  if (changed) {
    const l = base.layers[0], hashes: Record<string, Sha256> = {};
    for (const key of cellKeys(rig)) { const [a, d, i] = key.split('/') as [string, DirectionName, string]; const h = l.cells?.[a]?.[d]?.[+i]; if (h) hashes[key] = h; }
    rig.baseHash = await baseHashOf(rig, hashes);
    for (const it of m.items) if (it.baseHash === oldHash) it.baseHash = rig.baseHash;
  }
  const dirty = !!changed || base.regions !== 'shirt-shorts';
  if (dirty) {
    base.regions = 'shirt-shorts';
    m.materials = m.materials.filter((x) => x.owner !== base.id);
    base.materials = [];
  }
  return { changed, dirty, oldHash, images };
}

export async function selfTest() {
  // 1 x 12 column: skin head, grey shirt (rows 2-5), outline row 6, grey shorts (rows 7-9) sharing the shirt's greys, skin legs
  const grey = [0x9eacb1, 0x6d7c87, 0x5f6162], col = [0xc96e4e, 0xc96e4e, ...grey, 0x9eacb1, 0x000000, ...grey, 0xc96e4e, 0xc96e4e];
  const im: Img = { w: 1, h: col.length, data: new Uint8ClampedArray(col.flatMap((c) => [c >> 16, (c >> 8) & 255, c & 255, 255])) };
  const at = (x: Img, y: number) => (x.data[y * 4] << 16) | (x.data[y * 4 + 1] << 8) | x.data[y * 4 + 2];
  const line = { hip: [0, 8.5] as [number, number], neck: [0, 1] as [number, number] };
  const s = splitCell(im, line);
  console.assert([2, 3, 4, 5].every((y) => !isShorts(at(s, y))) && [7, 8, 9].every((y) => isShorts(at(s, y))), 'shirt even, shorts odd');
  console.assert(at(s, 0) === 0xc96e4e && at(s, 6) === 0 && [2, 7].every((y) => Math.abs(at(s, y) - at(im, y)) <= 1), 'skin / outline untouched, garments nudged by <= 1');
  console.assert(splitCell(s, line).data.join() === s.data.join(), 'idempotent');
  console.assert(isGarment(0x9eacb1) && isGarment(0x31323d) && !isGarment(0x000000) && !isGarment(0xc96e4e) && !isGarment(0xf9e7c9), 'garment greys');
  // shirt and shorts touching (no outline): cut px by px at the line; a sleeve dipping below the line stays shirt
  const col2 = [...grey, ...grey, 0x9eacb1];
  const im2: Img = { w: 1, h: 7, data: new Uint8ClampedArray(col2.flatMap((c) => [c >> 16, (c >> 8) & 255, c & 255, 255])) };
  const s2 = splitCell(im2, { hip: [0, 5] });
  console.assert([0, 1, 2].every((y) => !isShorts(at(s2, y))) && [4, 5, 6].every((y) => isShorts(at(s2, y))), 'straddling component cut at hip - 1.5');
  const s3 = splitCell(im2, { hip: [0, 7.5] });
  console.assert([0, 1, 2, 3, 4, 5, 6].every((y) => !isShorts(at(s3, y))), 'a component mostly above the line stays shirt');
  // splitBase: a light shirt over dark shorts touching (one component); cell 3's hip anchor sits 3 px too low, the colour
  // votes of the other cells pull its line up (B15 live walk/east/1)
  const light = 0x9eacb0, dark = 0x403f44, colImg = (n: number) => { const c = [...Array(4).fill(light), ...Array(n).fill(dark)]; return { w: 1, h: c.length, data: new Uint8ClampedArray(c.flatMap((x) => [x >> 16, (x >> 8) & 255, x & 255, 255])) } as Img; };
  const proj = { images: new Map<string, Img>(['a', 'b', 'c', 'd'].map((k) => [`sha256:${k}`, colImg(4)])), manifest: {
    rig: { baseItem: 'b', baseHash: 'sha256:0', directions: [{ id: 'south' }], animations: [{ id: 'walk', cells: 4 }], anchors: { hip: { walk: { south: [[0, 5], [0, 5], [0, 5], [0, 8]] } }, neck: { walk: { south: [[0, 0], [0, 0], [0, 0], [0, 3]] } } } },
    materials: [], items: [{ id: 'b', baseHash: 'sha256:0', materials: [], layers: [{ cells: { walk: { south: ['sha256:a', 'sha256:b', 'sha256:c', 'sha256:d'] } } }] }] } } as unknown as Project;
  const r = await splitBase(proj);
  {
    const cells = proj.manifest.items[0].layers[0].cells!.walk.south!.map((h) => proj.images.get(h!)!);
    console.assert(r.changed === 4 && proj.manifest.items[0].regions === 'shirt-shorts' && proj.manifest.rig.baseHash !== 'sha256:0', 'splitBase marks and rehashes');
    console.assert(cells.every((c) => [0, 1, 2, 3].every((y) => !isShorts(at(c, y))) && [4, 5, 6, 7].every((y) => isShorts(at(c, y)))), 'the low anchor of cell 3 is pulled up by the colour votes');
  }
  console.assert(guessLine(im)!.hip[1] === 6.6 && guessLine({ w: 1, h: 1, data: new Uint8ClampedArray(4) }) === null, 'guessLine');
}
