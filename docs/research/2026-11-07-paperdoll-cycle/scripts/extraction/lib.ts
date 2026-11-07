// Shared offline helpers for the 2026-11-07 extraction probes. Production code is imported, never copied.
// Run any probe from the repo root: node docs/research/2026-11-07-paperdoll-cycle/scripts/extraction/<probe>.ts
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { decodePngBytes, encodePngBytes } from '../../../../../app/src/lib/image/pngraw.ts';
import { makeImg, type Img } from '../../../../../app/src/lib/image/png.ts';
import type { Rig } from '../../../../../app/src/lib/rig/rig.ts';

export const FIX = new URL('../../../../../app/test/fixtures/bench/', import.meta.url);
export const OUT = 'C:/Programming_Files/Shilocity/PixelLab/checkouts/cycle-2026-11-07/extraction/';

export const load = (name: string): Promise<Img> => decodePngBytes(new Uint8Array(readFileSync(new URL(name, FIX))));
export const cell = (sheet: Img, C: number, row: number, col: number): Img => {
  const o = makeImg(C, C);
  for (let y = 0; y < C; y++) o.data.set(sheet.data.subarray(((row * C + y) * sheet.w + col * C) * 4, ((row * C + y) * sheet.w + col * C + C) * 4), y * C * 4);
  return o;
};
export interface Body { rig: Rig; rows: string[]; cols: string[] }
export const body = async (id: string): Promise<{ body: Body; sheet: Img }> => ({ body: JSON.parse(readFileSync(new URL(`body${id}.json`, FIX), 'utf8')), sheet: await load(`body${id}.png`) });
export const baseCell = async (id: string, dir: string, col: string): Promise<Img> => {
  const { body: b, sheet } = await body(id), N = b.rig.cell.w;
  return cell(sheet, N, b.rows.indexOf(dir), b.cols.indexOf(col));
};
export const clone = (im: Img): Img => ({ w: im.w, h: im.h, data: new Uint8ClampedArray(im.data) });
export const px = (im: Img, x: number, y: number) => (y * im.w + x) * 4;
export const set = (im: Img, x: number, y: number, rgba: number[]) => im.data.set(rgba.length === 3 ? [...rgba, 255] : rgba, px(im, x, y));
export const opaque = (im: Img, p: number) => im.data[p * 4 + 3] > 0;
export const count = (m: ArrayLike<number>) => { let n = 0; for (let i = 0; i < m.length; i++) if (m[i]) n++; return n; };
export const save = async (name: string, im: Img) => { mkdirSync(OUT, { recursive: true }); writeFileSync(OUT + name, await encodePngBytes(im)); };
export const saveJson = (name: string, v: unknown) => { mkdirSync(OUT, { recursive: true }); writeFileSync(OUT + name, JSON.stringify(v, null, 1)); };
/** Nearest-neighbor upscale for visual review. */
export const zoom = (im: Img, s = 6): Img => {
  const o = makeImg(im.w * s, im.h * s);
  for (let y = 0; y < o.h; y++) for (let x = 0; x < o.w; x++) o.data.set(im.data.subarray(px(im, (x / s) | 0, (y / s) | 0), px(im, (x / s) | 0, (y / s) | 0) + 4), (y * o.w + x) * 4);
  return o;
};
export { makeImg, type Img };
