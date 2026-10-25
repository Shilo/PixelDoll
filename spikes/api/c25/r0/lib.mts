// Offline harness helpers: load v0.1.0 evidence and run PixelDoll's production item functions on it.
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
export const APP = 'file:///C:/Programming_Files/Shilocity/PixelLab/PixelDoll/app/src/lib/';
export const EV = 'C:/Programming_Files/Shilocity/PixelLab/PixelDoll/spikes/api/out/'; // v0.1.0 evidence (local, git-ignored)
export const OUTR0 = EV + 'c25/r0/';
const { decodePngBytes, encodePngBytes } = await import(APP + 'image/pngraw.ts');
export const items = await import(APP + 'items/items.ts');
export const chroma = await import(APP + 'image/chroma.ts');
export type Img = { w: number; h: number; data: Uint8ClampedArray };
export const load = async (p: string): Promise<Img> => decodePngBytes(new Uint8Array(readFileSync(p.startsWith('C:') ? p : EV + p)));
export const has = (p: string) => existsSync(EV + p);
export const save = async (p: string, im: Img) => writeFileSync(p, await encodePngBytes(im));
export const blank = (w: number, h: number): Img => ({ w, h, data: new Uint8ClampedArray(w * h * 4) });
export function padTo(im: Img, C: number): Img {
  if (im.w === C) return im;
  const o = blank(C, C), dx = (C - im.w) / 2, dy = (C - im.h) / 2;
  for (let y = 0; y < im.h; y++) o.data.set(im.data.subarray(y * im.w * 4, (y + 1) * im.w * 4), ((y + dy) * C + dx) * 4);
  return o;
}
/** S3 request keypoints (px on the 64 rig, {LABEL: {x, y}}) -> rig keypoints (0-1, {label, x, y}). */
export const toRig = (k: Record<string, { x: number; y: number }>, cell = 64) => Object.entries(k).map(([label, p]) => ({ label, x: p.x / cell, y: p.y / cell }));
/** The S3/S4 rig (48 -> 64 body, S/E/N, walk + slash, 8 frames each) as a production Rig object. */
export function s4Rig() {
  const dirs = ['south', 'east', 'north'] as const;
  const req = (clip: string, d: string) => JSON.parse(readFileSync(EV + `s3_k1/${clip === 'walk' ? `walk_${d}_v3tpl_s7` : `slash_${d}_v3_s7`}.req.json`, 'utf8'));
  const rest: any = {}, anims: any[] = [];
  for (const d of dirs) rest[d] = { image: 'sha256:x', keypoints: toRig(req('walk', d).rest) };
  for (const clip of ['walk', 'slash']) {
    const sources: any = {};
    for (const d of dirs) sources[d] = { keypoints: req(clip, d).poses.map((p: any) => toRig(p)) };
    anims.push({ id: clip, cells: 8, loop: true, frames: Array.from({ length: 8 }, (_, cell) => ({ cell, ms: 100 })), sources });
  }
  return { cell: { w: 64, h: 64 }, pivot: { x: 32, y: 60 }, directions: dirs.map((id) => ({ id })), animations: anims, baseItem: 'base', baseHash: 'sha256:x', rest };
}
export const s4Base = (d: string, clip: string, i: number) => load(`s4_items/sk_${d}.base${(clip === 'slash' ? 8 : 0) + i}.png`);
export const s4Rest = (d: string) => load(`s3_k6/rot_base_${d}.png`);
export const count = (m: Uint8Array) => m.reduce((a, b) => a + b, 0);
/** Contact sheet: rows of images scaled s×, checkerboard background. */
export function sheet(rows: (Img | null)[][], s = 3, gap = 2): Img {
  const w = Math.max(...rows.flat().filter(Boolean).map((i) => i!.w)), h = Math.max(...rows.flat().filter(Boolean).map((i) => i!.h));
  const cols = Math.max(...rows.map((r) => r.length)), W = cols * (w * s + gap), H = rows.length * (h * s + gap), o = blank(W, H);
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) { const c = ((x >> 3) + (y >> 3)) & 1 ? 200 : 160; o.data.set([c, c, c, 255], (y * W + x) * 4); }
  rows.forEach((r, ri) => r.forEach((im, ci) => {
    if (!im) return;
    for (let y = 0; y < im.h * s; y++) for (let x = 0; x < im.w * s; x++) {
      const i = (((y / s) | 0) * im.w + ((x / s) | 0)) * 4;
      if (!im.data[i + 3]) continue;
      o.data.set(im.data.subarray(i, i + 4), ((ri * (h * s + gap) + y) * W + ci * (w * s + gap) + x) * 4);
    }
  }));
  return o;
}
