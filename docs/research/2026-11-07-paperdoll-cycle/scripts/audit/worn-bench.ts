// Audit (audit-worn.md): what the non-held cleanup removes from REAL benchmark outputs (app/test/fixtures/bench), stage by
// stage, and how close the real worn clips sit to the name/shape-based gate thresholds. Production code only.
// Run from the repo root: node docs/research/2026-11-07-paperdoll-cycle/scripts/audit/worn-bench.ts [outDir]
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { bandOf, cutAllow, cutRows, dirGate, dropOffBody, extractCell, grayShare, isAction, itemQa, posedTol, postProcess, sizeFloor, slotOf, trimToKeyframe, type CellOut, type Route } from '../../../../../app/src/lib/items/items.ts';
import { fromApi } from '../../../../../app/src/lib/rig/poses.ts';
import { encodePngBytes } from '../../../../../app/src/lib/image/pngraw.ts';
import type { Keypoint, Rig } from '../../../../../app/src/lib/rig/rig.ts';
import { body, cell, FIX, load, makeImg, type Img } from '../extraction/lib.ts';

interface Case { id: string; body: string; slot: string; key: Route; pad: number; clips: string[]; role?: string }
const skel = (rig: Rig, k: Keypoint[] | undefined) => k && fromApi(k, rig.cell);
const OUT = process.argv[2];
const cnt = (m: ArrayLike<number>) => { let n = 0; for (let i = 0; i < m.length; i++) if (m[i]) n++; return n; };
const snap = (cs: CellOut[]) => cs.map((c) => new Uint8Array(c.mask));
const diff = (before: Uint8Array[], cs: CellOut[]) => before.reduce((s, m, i) => s + cnt(m.map((v, p) => (v && !cs[i].mask[p] ? 1 : 0))), 0);

const cases: Case[] = JSON.parse(readFileSync(new URL('cases.json', FIX), 'utf8')).filter((c: Case) => c.key !== 'none' && slotOf(c.slot).class !== 'held');
const rows: Record<string, unknown>[] = [], gray: Record<string, unknown>[] = [], cv: Record<string, unknown>[] = [];
for (const c of cases) {
  const { body: b, sheet: bodySheet } = await body(c.body), rig = b.rig, N = rig.cell.w, slot = slotOf(c.slot), sheet = await load(`${c.id}.png`);
  const base = (dir: string, col: string) => cell(bodySheet, N, b.rows.indexOf(dir), b.cols.indexOf(col));
  const dirs = c.clips.length ? [...new Set(c.clips.map((k) => k.split('/')[1]))] : b.rows;
  const keys: Record<string, Img> = {}, keyCut: Record<string, Uint8Array | undefined> = {};
  for (const d of dirs) {
    const s0 = skel(rig, rig.rest?.[d as 'south']?.keypoints), maxY = cutRows(c.slot, s0, N), row = c.clips.length ? c.clips.findIndex((k) => k.endsWith(`/${d}`)) : 0, col = c.clips.length ? 0 : b.rows.indexOf(d);
    const k = extractCell({ key: `rest/${d}/0`, call: 0, base: base(d, 'rest'), out: cell(sheet, N, row, col), route: c.key, band: bandOf(c.slot, s0, N), ...(maxY != null ? { cut: { maxY } } : {}) });
    keys[d] = k.layer; keyCut[d] = k.cut;
    gray.push({ case: c.id, dir: d, area: k.area, grayShare: +grayShare(k.layer).toFixed(3) });
  }
  if (!c.clips.length) continue;
  const cells: CellOut[] = [], raw: Img[] = [];
  let bandClip = 0;
  c.clips.forEach((clip, r) => {
    const [anim, dir] = clip.split('/'), a = rig.animations.find((x) => x.id === anim)!;
    for (let i = 0; i < a.cells; i++) {
      const s1 = skel(rig, a.sources?.[dir as 'south']?.keypoints?.[i]), maxY = cutRows(c.slot, s1, N), allow = maxY != null ? cutAllow(rig, `${clip}/${i}`, keyCut[dir], N, posedTol(N, N)) : undefined;
      const o = { key: `${clip}/${i}`, call: 1 + r, base: base(dir, `${anim}/${i}`), out: cell(sheet, N, r, 1 + i), route: c.key, band: bandOf(c.slot, s1, N), posed: true, held: false, pad: 0, ...(allow ? { cut: { maxY: maxY!, allow } } : {}) };
      const x = extractCell({ ...o, clip: slot.band }), noClip = extractCell({ ...o, clip: false });
      bandClip += noClip.area - x.area;
      cells.push(x); raw.push(noClip.layer);
    }
  });
  // stage by stage, in postProcess order (sizeFloor, then trim or dropOffBody, then the clipY band floor)
  let m = snap(cells); sizeFloor(cells, keys); const floor = diff(m, cells);
  m = snap(cells); if (slot.band) trimToKeyframe(rig, cells, keys); else if (slot.class === 'worn' && slot.bgZ == null) dropOffBody(cells); const trim = diff(m, cells);
  m = snap(cells); postProcess(rig, slot, cells, keys); const rest = diff(m, cells);
  const qa = itemQa(rig, slot, c.key, cells, 0);
  const h4 = dirGate(slot, cells, keys, rig);
  const fails = [...qa.failCalls.values(), ...h4.fails.values()].flat();
  rows.push({ case: c.id, slot: c.slot, cells: cells.length, area: cells.reduce((s, x) => s + x.area, 0), bandClip, sizeFloor: floor, trimOrOffBody: trim, clipFloor: rest, fails: fails.length, firstFail: fails[0]?.slice(0, 60) ?? '' });
  for (const k of qa.clips) cv.push({ case: c.id, clip: k.clip, action: isAction(k.clip), cv: k.cv, cvMax: +Math.max(0.15, 2 * k.baseCv).toFixed(3), minRatio: k.minRatio });
  if (OUT) { // removed px in cyan over the raw (unclipped) extraction, one row per clip
    mkdirSync(OUT, { recursive: true });
    const S = 4, per = cells.length / c.clips.length, sh = makeImg(per * N * S, c.clips.length * N * S);
    cells.forEach((x, i) => {
      const ox = (i % per) * N * S, oy = ((i / per) | 0) * N * S;
      for (let y = 0; y < N * S; y++) for (let X = 0; X < N * S; X++) {
        const p = ((y / S) | 0) * N + ((X / S) | 0), q = ((oy + y) * sh.w + ox + X) * 4, kept = x.mask[p], had = raw[i].data[p * 4 + 3];
        sh.data.set(kept ? [...raw[i].data.subarray(p * 4, p * 4 + 3), 255] : had ? [0, 255, 255, 255] : x.base.data[p * 4 + 3] ? [70, 70, 80, 255] : [30, 30, 36, 255], q);
      }
    });
    writeFileSync(`${OUT}/${c.id}-removed.png`, await encodePngBytes(sh));
  }
}
console.log('Removed px per stage on real bench outputs (posed cells; bandClip = extractCell head-band clip)'); console.table(rows);
console.log('Keyframe grayShare (D1 fires above 0.05 unless the prompt names a gray word)'); console.table(gray);
console.log('Clip area CV vs the G5 limit (G5 skipped when action = true)'); console.table(cv);
