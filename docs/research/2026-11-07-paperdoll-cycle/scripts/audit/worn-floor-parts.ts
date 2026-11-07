// Audit (audit-worn.md): are the parts sizeFloor (then dropOffBody, body-hugging slots) deletes from REAL posed bench frames parts of the dressed design?
// For every component sizeFloor removes, measure how much of it lies on the direction's dressed keyframe item mask
// (dilated by 1 px; head items get no head shift here, the bench bodies barely move the head in walk). A removed part that
// lies >= 50 % on the design is a design part the cleanup deleted, not a motion speck. Production code only.
// Run from the repo root: node docs/research/2026-11-07-paperdoll-cycle/scripts/audit/worn-floor-parts.ts
import { readFileSync } from 'node:fs';
import { components } from '../../../../../app/src/lib/image/chroma.ts';
import { maskOf } from '../../../../../app/src/lib/image/similarity.ts';
import { bandOf, cutAllow, cutRows, dropOffBody, extractCell, posedTol, sizeFloor, slotOf, type CellOut, type Route } from '../../../../../app/src/lib/items/items.ts';
import { fromApi } from '../../../../../app/src/lib/rig/poses.ts';
import type { Keypoint, Rig } from '../../../../../app/src/lib/rig/rig.ts';
import { body, cell, FIX, load, type Img } from '../extraction/lib.ts';

interface Case { id: string; body: string; slot: string; key: Route; pad: number; clips: string[]; role?: string }
const skel = (rig: Rig, k: Keypoint[] | undefined) => k && fromApi(k, rig.cell);
const dil = (m: Uint8Array, w: number) => { const h = m.length / w, o = new Uint8Array(m.length); for (let p = 0; p < m.length; p++) if (m[p]) for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) { const X = (p % w) + dx, Y = ((p / w) | 0) + dy; if (X >= 0 && Y >= 0 && X < w && Y < h) o[Y * w + X] = 1; } return o; };
const cases: Case[] = JSON.parse(readFileSync(new URL('cases.json', FIX), 'utf8')).filter((c: Case) => c.key !== 'none' && c.clips.length && !c.role && slotOf(c.slot).class !== 'held');
const rows: Record<string, unknown>[] = [];
for (const c of cases) {
  const { body: b, sheet: bs } = await body(c.body), rig = b.rig, N = rig.cell.w, slot = slotOf(c.slot), sheet = await load(`${c.id}.png`);
  const base = (dir: string, col: string) => cell(bs, N, b.rows.indexOf(dir), b.cols.indexOf(col));
  const keys: Record<string, Img> = {}, keyCut: Record<string, Uint8Array | undefined> = {};
  for (const d of new Set(c.clips.map((k) => k.split('/')[1]))) {
    const s0 = skel(rig, rig.rest?.[d as 'south']?.keypoints), maxY = cutRows(c.slot, s0, N);
    const k = extractCell({ key: `rest/${d}/0`, call: 0, base: base(d, 'rest'), out: cell(sheet, N, c.clips.findIndex((x) => x.endsWith(`/${d}`)), 0), route: c.key, band: bandOf(c.slot, s0, N), ...(maxY != null ? { cut: { maxY } } : {}) });
    keys[d] = k.layer; keyCut[d] = k.cut;
  }
  const cells: CellOut[] = [];
  c.clips.forEach((clip, r) => {
    const [anim, dir] = clip.split('/'), a = rig.animations.find((x) => x.id === anim)!;
    for (let i = 0; i < a.cells; i++) {
      const s1 = skel(rig, a.sources?.[dir as 'south']?.keypoints?.[i]), maxY = cutRows(c.slot, s1, N), allow = maxY != null ? cutAllow(rig, `${clip}/${i}`, keyCut[dir], N, posedTol(N, N)) : undefined;
      cells.push(extractCell({ key: `${clip}/${i}`, call: 1 + r, base: base(dir, `${anim}/${i}`), out: cell(sheet, N, r, 1 + i), route: c.key, band: bandOf(c.slot, s1, N), posed: true, clip: slot.band, held: false, pad: 0, ...(allow ? { cut: { maxY: maxY!, allow } } : {}) }));
    }
  });
  for (const stage of ['sizeFloor', 'dropOffBody'] as const) {
  if (stage === 'dropOffBody' && !(slot.class === 'worn' && slot.bgZ == null && !slot.band)) continue;
  const before = cells.map((x) => new Uint8Array(x.mask));
  if (stage === 'sizeFloor') sizeFloor(cells, keys, process.argv.includes('--rig') ? rig : undefined); else dropOffBody(cells);
  let parts = 0, partPx = 0, designParts = 0, designPx = 0, maxDesignPart = 0;
  const where = new Map<string, number>();
  cells.forEach((x, i) => {
    const gone = before[i].map((v, p) => (v && !x.mask[p] ? 1 : 0)), K = dil(maskOf(keys[x.key.split('/')[1]]), N);
    for (const comp of components(gone, N, N)) {
      parts++; partPx += comp.length;
      const on = comp.filter((p) => K[p]).length;
      if (on * 2 >= comp.length) { designParts++; designPx += comp.length; maxDesignPart = Math.max(maxDesignPart, comp.length); const clip = x.key.split('/').slice(0, 2).join('/'); where.set(clip, (where.get(clip) ?? 0) + comp.length); }
    }
  });
  rows.push({ stage, case: c.id, slot: c.slot, removedParts: parts, removedPx: partPx, onDesignParts: designParts, onDesignPx: designPx, largestOnDesign: maxDesignPart, byClip: [...where].map(([k, v]) => `${k}:${v}`).join(' ') });
  }
}
console.table(rows);
