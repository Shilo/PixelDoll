// Offline helpers for reading human-drawn LPC sprites (OGA-BY 3.0 / CC-BY-SA 3.0 / GPL 3.0, see the checkout's CREDITS.csv)
// from the local lpc-generator checkout. The images are read for measurement only and are never copied into this repo.
import { readFileSync } from 'node:fs';
import { inflateSync } from 'node:zlib';
import { makeImg, type Img } from '../../../../../app/src/lib/image/png.ts';

export const LPC = 'C:/Programming_Files/Shilocity/PixelLab/checkouts/lpc-generator/';
export const SHEETS = LPC + 'spritesheets/';
/** LPC sheets: 64 px cells, rows north, west, south, east. */
export const CELL = 64, ROW = { north: 0, west: 1, south: 2, east: 3 } as const;

/** Minimal PNG decoder for LPC sheets: 8-bit gray/RGB/RGBA, indexed (1, 2, 4, 8 bit) with tRNS, non-interlaced. */
export function decodeLpcPng(path: string): Img {
  const b = readFileSync(path), v = new DataView(b.buffer, b.byteOffset, b.byteLength);
  let o = 8, w = 0, h = 0, depth = 0, type = 0, inter = 0;
  const idat: Buffer[] = [];
  let plte: Uint8Array | undefined, trns: Uint8Array | undefined;
  while (o < b.length) {
    const len = v.getUint32(o), t = b.toString('latin1', o + 4, o + 8), d = b.subarray(o + 8, o + 8 + len);
    if (t === 'IHDR') { w = v.getUint32(o + 8); h = v.getUint32(o + 12); depth = d[8]; type = d[9]; inter = d[12]; }
    else if (t === 'PLTE') plte = d;
    else if (t === 'tRNS') trns = d;
    else if (t === 'IDAT') idat.push(d);
    o += 12 + len;
  }
  if (inter) throw new Error(`${path}: interlaced PNG`);
  const ch = { 0: 1, 2: 3, 3: 1, 4: 2, 6: 4 }[type as 0 | 2 | 3 | 4 | 6];
  if (!ch || (type !== 3 && depth !== 8)) throw new Error(`${path}: unsupported PNG type ${type} depth ${depth}`);
  const raw = inflateSync(Buffer.concat(idat)), bpp = Math.max(1, (ch * depth) >> 3), stride = Math.ceil((w * ch * depth) / 8);
  const rows = new Uint8Array(stride * h);
  let prev = new Uint8Array(stride);
  for (let y = 0; y < h; y++) {
    const f = raw[y * (stride + 1)], src = raw.subarray(y * (stride + 1) + 1, (y + 1) * (stride + 1)), cur = new Uint8Array(stride);
    for (let i = 0; i < stride; i++) {
      const a = i >= bpp ? cur[i - bpp] : 0, up = prev[i], c = i >= bpp ? prev[i - bpp] : 0;
      const p = a + up - c, pa = Math.abs(p - a), pb = Math.abs(p - up), pc = Math.abs(p - c);
      cur[i] = (src[i] + (f === 0 ? 0 : f === 1 ? a : f === 2 ? up : f === 3 ? (a + up) >> 1 : pa <= pb && pa <= pc ? a : pb <= pc ? up : c)) & 255;
    }
    rows.set(cur, y * stride);
    prev = cur;
  }
  const im = makeImg(w, h);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const i = (y * w + x) * 4, r = rows.subarray(y * stride);
    if (type === 3) {
      const bit = x * depth, idx = (r[bit >> 3] >> (8 - depth - (bit & 7))) & ((1 << depth) - 1);
      im.data.set([plte![idx * 3], plte![idx * 3 + 1], plte![idx * 3 + 2], trns && idx < trns.length ? trns[idx] : 255], i);
    } else if (type === 6) im.data.set(r.subarray(x * 4, x * 4 + 4), i);
    else if (type === 2) im.data.set([r[x * 3], r[x * 3 + 1], r[x * 3 + 2], 255], i);
    else if (type === 0) im.data.set([r[x], r[x], r[x], 255], i);
    else im.data.set([r[x * 2], r[x * 2], r[x * 2], r[x * 2 + 1]], i);
  }
  return im;
}

const sheets = new Map<string, Img>();
export const sheet = (rel: string): Img => { let s = sheets.get(rel); if (!s) sheets.set(rel, (s = decodeLpcPng(SHEETS + rel))); return s; };
/** One 64 px cell of a sheet. */
export function lpcCell(rel: string, dir: keyof typeof ROW, frame: number): Img {
  const s = sheet(rel), o = makeImg(CELL, CELL);
  for (let y = 0; y < CELL; y++) { const sy = ROW[dir] * CELL + y, sx = frame * CELL; o.data.set(s.data.subarray((sy * s.w + sx) * 4, (sy * s.w + sx + CELL) * 4), y * CELL * 4); }
  return o;
}
const hex = (h: string) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16));
export const palettes = (rel: string): Record<string, number[][]> =>
  Object.fromEntries(Object.entries(JSON.parse(readFileSync(LPC + 'palette_definitions/' + rel, 'utf8')) as Record<string, string[]>).map(([k, v]) => [k, v.map(hex)]));
/** The generator's recolor: each px within 1 per channel of source color i becomes target color i. Returns the px it could not map. */
export function recolor(im: Img, source: number[][], target: number[][]): { img: Img; unmapped: number } {
  const o: Img = { w: im.w, h: im.h, data: new Uint8ClampedArray(im.data) };
  let unmapped = 0;
  for (let i = 0; i < o.data.length; i += 4) {
    if (!o.data[i + 3]) continue;
    const j = source.findIndex((s) => Math.abs(s[0] - o.data[i]) <= 1 && Math.abs(s[1] - o.data[i + 1]) <= 1 && Math.abs(s[2] - o.data[i + 2]) <= 1);
    if (j < 0) unmapped++; else o.data.set(target[j], i);
  }
  return { img: o, unmapped };
}
/** Source-over of b onto a (both straight alpha); LPC sprites are 0/255 alpha, so this is a plain overwrite. */
export function over(a: Img, b: Img): Img {
  const o: Img = { w: a.w, h: a.h, data: new Uint8ClampedArray(a.data) };
  for (let i = 0; i < o.data.length; i += 4) if (b.data[i + 3]) o.data.set(b.data.subarray(i, i + 4), i);
  return o;
}
