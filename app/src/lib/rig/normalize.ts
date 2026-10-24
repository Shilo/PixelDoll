// Source frame -> rig cell: center-align canvases, crop/pad (never rescale), binary alpha. Plus bbox / pivot / feet line.
import { binaryAlpha, makeImg, type Img } from '../image/png.ts';

export interface Box { x0: number; y0: number; x1: number; y1: number } // inclusive pixel indices
export interface Normalized {
  img: Img;
  offset: [number, number]; // where source (0,0) landed in the cell
  cutPx: number; // opaque source px that fell outside the cell (> 0 = crop failure)
  semiAlpha: number; // source px with 0 < alpha < 255 (before binarization)
}

// The ONE placement rule for every source (M2 imports, Studio create, managed/raw renders). `char` = size of the character
// canvas the source centers (default: the source itself, capped at the cell). A character canvas smaller than the cell is
// padded centered in x, bottom-aligned in y with a FLOOR px margin (48 -> 64 = x+8, y+12); a bigger render canvas around it
// (managed skeleton-v3 80/96, text modes 68, B6 saw 64 for a 48 character) is re-centered first. M3: with S2's y+16 the feet sat
// on row 63, blades pointing down were cut at the cell edge and PixelLab erased the outermost row.
// ponytail: no shift-to-fit for off-center larger canvases.
export const FLOOR = 4;
export function normalize(src: Img, w: number, h: number, thr = 128, char = Math.min(src.w, w)): Normalized {
  const ox = Math.floor((w - src.w) / 2), oy = Math.max(0, h - char - FLOOR) + Math.floor((char - src.h) / 2);
  const out = makeImg(w, h);
  let cutPx = 0, semiAlpha = 0;
  for (let y = 0; y < src.h; y++)
    for (let x = 0; x < src.w; x++) {
      const i = (y * src.w + x) * 4, a = src.data[i + 3];
      if (a > 0 && a < 255) semiAlpha++;
      const dx = x + ox, dy = y + oy;
      if (dx < 0 || dy < 0 || dx >= w || dy >= h) { if (a >= thr) cutPx++; continue; }
      out.data.set(src.data.subarray(i, i + 4), (dy * w + dx) * 4);
    }
  return { img: binaryAlpha(out, thr), offset: [ox, oy], cutPx, semiAlpha };
}

export function opaqueBox(im: Img): Box | null {
  let x0 = im.w, y0 = im.h, x1 = -1, y1 = -1;
  for (let y = 0; y < im.h; y++)
    for (let x = 0; x < im.w; x++)
      if (im.data[(y * im.w + x) * 4 + 3]) {
        if (x < x0) x0 = x;
        if (x > x1) x1 = x;
        if (y < y0) y0 = y;
        y1 = y;
      }
  return x1 < 0 ? null : { x0, y0, x1, y1 };
}

/** Historical name: bottom silhouette edge in pixel-edge coords, not an estimate of foot contact or rotation origin. */
export const feetY = (im: Img) => (opaqueBox(im)?.y1 ?? im.h - 1) + 1;
/** Shared frame pivot metadata from the reference cell; this does not estimate a physical rotation origin. */
export const pivotOf = (im: Img) => ({ x: Math.floor(im.w / 2), y: feetY(im) });

export function selfTest() {
  const src = makeImg(6, 6);
  src.data.set([9, 9, 9, 255], (4 * 6 + 2) * 4); // opaque at (2,4)
  src.data.set([9, 9, 9, 100], (1 * 6 + 1) * 4); // semi, below threshold
  const n = normalize(src, 4, 4);
  console.assert(n.offset.join() === '-1,-1' && n.cutPx === 0 && n.semiAlpha === 1, `crop offset ${n.offset} cut ${n.cutPx}`);
  console.assert(n.img.data[(3 * 4 + 1) * 4 + 3] === 255 && n.img.data[3] === 0, 'pixel moved by offset, semi alpha dropped');
  const big = normalize(src, 2, 2);
  console.assert(big.cutPx === 1, 'crop cutting opaque px is reported');
  const pad = normalize(makeImg(2, 2), 4, 4);
  console.assert(pad.offset.join() === '1,0' && pad.img.w === 4, 'pad: centered x, floor margin capped by the free space');
  console.assert(normalize(makeImg(48, 48), 64, 64).offset.join() === '8,12' && normalize(makeImg(64, 64), 64, 64).offset.join() === '0,0', '48 -> 64 pad keeps a 4 px floor');
  const at = (W: number, c: number) => normalize(makeImg(W, W), 64, 64, 128, c).offset.map((v) => v + (W - c) / 2).join(); // where the character canvas lands
  console.assert(at(80, 48) === '8,12' && at(68, 48) === '8,12' && at(64, 48) === '8,12' && at(96, 64) === '0,0' && at(80, 64) === '0,0', 'render canvases re-center onto the same floor pad');
  console.assert(JSON.stringify(opaqueBox(n.img)) === '{"x0":1,"y0":3,"x1":1,"y1":3}' && opaqueBox(makeImg(2, 2)) === null, 'opaqueBox');
  const p = pivotOf(n.img);
  console.assert(p.x === 2 && p.y === 4, `pivot ${p.x},${p.y}`);
}
