// Shared evaluator: production extraction, cleanup and QA plus palette metrics, for stored and campaign runs.
import { items, chroma, save, type Img } from './lib.mts';
const { normalizeItemPalette } = await import('file:///C:/Programming_Files/Shilocity/PixelLab/PixelDoll/app/src/lib/equipment/palette.ts');
export const count = (m: Uint8Array) => m.reduce((a, b) => a + b, 0);
const blank = (w: number, h: number): Img => ({ w, h, data: new Uint8ClampedArray(w * h * 4) });
export function padTo(im: Img, C: number): Img {
  if (im.w === C) return im;
  const o = blank(C, C), dx = (C - im.w) / 2, dy = (C - im.h) / 2;
  for (let y = 0; y < im.h; y++) o.data.set(im.data.subarray(y * im.w * 4, (y + 1) * im.w * 4), ((y + dy) * C + dx) * 4);
  return o;
}
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
export interface Case {
  name: string; slot: string; key: 'green' | 'magenta'; pad: number; rig: any;
  rest: Record<string, Img>; dress: Record<string, Img>; // rest base views and the dressed keyframe outputs (raw), per direction
  clips: { anim: string; dir: string; frames: { base: Img; out: Img }[] }[];
}
const rgb = (d: Uint8ClampedArray, i: number) => (d[i] << 16) | (d[i + 1] << 8) | d[i + 2];
const colorsOf = (L: Img) => { const s = new Set<number>(); for (let i = 0; i < L.data.length; i += 4) if (L.data[i + 3]) s.add(rgb(L.data, i)); return s; };
const dist = (a: number, b: number) => Math.max(Math.abs((a >> 16) - (b >> 16)), Math.abs(((a >> 8) & 255) - ((b >> 8) & 255)), Math.abs((a & 255) - (b & 255)));

export function evaluate(c: Case, opt: { snap?: number } = {}) {
  const slot = items.slotOf(c.slot), held = slot.class === 'held', C = c.rig.cell.w + 2 * c.pad;
  const keys: Record<string, Img> = {}, kfCells: any[] = [];
  for (const [d, out] of Object.entries(c.dress)) {
    const k = items.extractCell({ key: `rest/${d}/0`, call: 0, base: padTo(c.rest[d], C), out: padTo(out, C), route: c.key, band: items.bandOf(c.slot, undefined, C) });
    keys[d] = k.layer; kfCells.push(k);
  }
  const cells: any[] = [];
  for (const cl of c.clips) cl.frames.forEach((f, i) => cells.push(items.extractCell({
    key: `${cl.anim}/${cl.dir}/${i}`, call: 1 + c.clips.indexOf(cl), base: padTo(f.base, C), out: padTo(f.out, C), route: c.key,
    band: items.bandOf(c.slot, c.pad ? undefined : skel(c.rig, cl.anim, cl.dir, i), C), posed: true, clip: slot.band, held, pad: c.pad })));
  items.postProcess(c.rig, slot, cells, keys, c.pad);
  let snapped = 0;
  if (opt.snap != null) for (const cell of cells) { // P3 variant: snap each posed layer to its direction's keyframe palette
    const pal = colorsOf(keys[cell.key.split('/')[1]]), r = normalizeItemPalette(cell.layer, pal, opt.snap);
    cell.layer = r.image; snapped += r.changed;
  }
  const q = items.itemQa(c.rig, slot, c.key, cells, 0, items.GATES.keyOutsidePosed, c.pad), h = items.dirGate(slot, cells, keys, c.rig);
  const fails = [...q.failCalls.values(), ...h.fails.values()].flat();
  const clips = c.clips.map((cl) => {
    const cs = cells.filter((x) => x.key.startsWith(`${cl.anim}/${cl.dir}/`)), kp = colorsOf(keys[cl.dir]);
    const areas = cs.map((x) => count(x.mask)), m = areas.reduce((s, a) => s + a, 0) / areas.length;
    let off = 0, px = 0, dsum = 0; const all = new Set<number>();
    for (const x of cs) for (let i = 0; i < x.layer.data.length; i += 4) if (x.layer.data[i + 3]) {
      const col = rgb(x.layer.data, i); px++; all.add(col);
      if (!kp.has(col)) { off++; let best = 1e9; for (const k of kp) best = Math.min(best, dist(col, k)); dsum += best; }
    }
    return { clip: `${cl.anim}/${cl.dir}`, areaCV: +(Math.sqrt(areas.reduce((s, a) => s + (a - m) ** 2, 0) / areas.length) / (m || 1)).toFixed(3),
      colors: all.size, kfColors: kp.size, offPalette: +(off / (px || 1)).toFixed(3), offDist: +(dsum / (off || 1)).toFixed(1),
      keyKeptMin: +Math.min(...cs.map((x) => x.keyKept ?? 1)).toFixed(3), specks: cs.reduce((s, x) => s + x.specks, 0), pinholes: cs.reduce((s, x) => s + x.pinholes, 0), stray: cs.reduce((s, x) => s + x.stray, 0), empty: areas.filter((a) => !a).length };
  });
  const status = fails.length ? 'fail' : q.warnings.length || h.warnings.length ? 'warn' : 'pass';
  return { name: c.name, status, fails, warnings: [...q.warnings, ...h.warnings], keyframes: kfCells.map((k) => ({ dir: k.key.split('/')[1], keyKept: +(k.keyKept ?? 1).toFixed(3), keyOutside: +(k.keyOutside ?? 0).toFixed(3), area: k.area, colors: colorsOf(k.layer).size })), clips, snapped, cells, keys };
}
const skel = (rig: any, anim: string, dir: string, i: number) => {
  const k = rig.animations.find((a: any) => a.id === anim)?.sources?.[dir]?.keypoints?.[i];
  return k && Object.fromEntries(k.map((p: any) => [p.label, { x: p.x * rig.cell.w, y: p.y * rig.cell.h }]));
};
/** Contact sheet: per clip-direction one row of layers over the base, plus the keyframe at the start. */
export async function sheetOf(file: string, r: ReturnType<typeof evaluate>, c: Case, s = 3) {
  const rows: (Img | null)[][] = c.clips.map((cl) => [r.keys[cl.dir], ...r.cells.filter((x: any) => x.key.startsWith(`${cl.anim}/${cl.dir}/`)).map((x: any) => items.recompose(x))]);
  await save(file, sheet(rows, s));
}
