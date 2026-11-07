// Replays the frozen benchmark corpus (real PixelLab outputs, app/test/fixtures/bench) through the production extractor and
// cleanup, with an optional sheet mutation, and measures:
//  A. key-ramp distance of every key-scoring raw px (is a key-colored px near the ramp the mannequin was painted with?)
//  B. despill: item px whose shipped RGB differs from the raw RGB; despill idempotence (despill(layer) vs layer)
//  C. stage volumes: px removed by dropKeyOutline, added by absorbOutline, removed by minPx and by postProcess
//  D. re-extraction idempotence: rebuild keyed body + shipped layer (with cut) and extract again
//  E. injected 1 px straps (independent labels) across bare mannequin rows with and without dark base px
// Orchestration mirrors app/scripts/bench.ts runCase; every pixel decision is production code.
import { readFileSync } from 'node:fs';
import { absorbOutline, chromaMask, despill, dropKeyOutline, keyScore, KT, toChroma, type Key } from '../../../../../app/src/lib/image/chroma.ts';
import { bandOf, cutAllow, cutRows, extractCell, padImg, posedTol, postProcess, recompose, slotOf, type CellOut, type Route } from '../../../../../app/src/lib/items/items.ts';
import { cutBase, over } from '../../../../../app/src/lib/compose/compose.ts';
import { fromApi } from '../../../../../app/src/lib/rig/poses.ts';
import type { Keypoint, Rig } from '../../../../../app/src/lib/rig/rig.ts';
import { body, cell, clone, FIX, load, makeImg, saveJson, type Img } from './lib.ts';

interface Case { id: string; body: string; slot: string; key: Route; pad: number; clips: string[]; role?: string }
export interface Run { c: Case; kf: CellOut[]; cells: CellOut[]; labels?: Map<CellOut, Uint8Array> }
const skel = (rig: Rig, k: Keypoint[] | undefined) => k && fromApi(k, rig.cell);

/** Production pipeline for one case; `mutate` may paint the raw output of each cell and return the painted px (labels). */
export async function runPipe(c: Case, mutate?: (out: Img, base: Img, key: string) => Uint8Array | undefined): Promise<Run> {
  const { body: b, sheet: bodySheet } = await body(c.body), rig = b.rig, N = rig.cell.w, C = N + 2 * c.pad, slot = slotOf(c.slot), sheet = await load(`${c.id}.png`), held = slot.class === 'held';
  const base = (dir: string, col: string) => padImg(cell(bodySheet, N, b.rows.indexOf(dir), b.cols.indexOf(col)), c.pad);
  const dirsOf = c.clips.length ? [...new Set(c.clips.map((k) => k.split('/')[1]))] : b.rows;
  const kfRow = (d: string) => (c.clips.length ? c.clips.findIndex((k) => k.endsWith(`/${d}`)) : 0), kfCol = (d: string) => (c.clips.length ? 0 : b.rows.indexOf(d));
  const keys: Record<string, Img> = {}, kf: CellOut[] = [], keyCut: Record<string, Uint8Array | undefined> = {}, labels = new Map<CellOut, Uint8Array>();
  const raw = (row: number, col: number, bse: Img, key: string) => { const o = cell(sheet, C, row, col), l = mutate?.(o, bse, key); return { o, l }; };
  for (const d of dirsOf) {
    const s0 = c.pad ? undefined : skel(rig, rig.rest?.[d as 'south']?.keypoints), maxY = cutRows(c.slot, s0, C), bse = base(d, 'rest'), { o, l } = raw(kfRow(d), kfCol(d), bse, `rest/${d}/0`);
    const k = extractCell({ key: `rest/${d}/0`, call: 0, base: bse, out: o, route: c.key, band: bandOf(c.slot, s0, C), ...(maxY != null ? { cut: { maxY } } : {}) });
    keys[d] = k.layer; kf.push(k); keyCut[d] = k.cut; if (l) labels.set(k, l);
  }
  const cells: CellOut[] = [];
  c.clips.forEach((clip, r) => {
    const [anim, dir] = clip.split('/'), a = rig.animations.find((x) => x.id === anim)!;
    for (let i = 0; i < a.cells; i++) {
      const s1 = c.pad ? undefined : skel(rig, a.sources?.[dir as 'south']?.keypoints?.[i]), maxY = cutRows(c.slot, s1, C), allow = maxY != null ? cutAllow(rig, `${clip}/${i}`, keyCut[dir], N, posedTol(N, N)) : undefined;
      const bse = base(dir, `${anim}/${i}`), { o, l } = raw(r, 1 + i, bse, `${clip}/${i}`);
      const x = extractCell({ key: `${clip}/${i}`, call: 1 + r, base: bse, out: o, route: c.key, band: bandOf(c.slot, s1, C), posed: true, clip: slot.band, held, pad: c.pad, ...(allow ? { cut: { maxY: maxY!, allow } } : {}) });
      cells.push(x); if (l) labels.set(x, l);
    }
  });
  if (cells.length) postProcess(rig, slot, cells, keys, c.pad);
  return { c, kf, cells, labels };
}

const RAMP: Record<Key, (t: number) => number[]> = {
  green: (t) => [110 * t * t, 60 + 195 * t, 110 * t * t],
  magenta: (t) => [70 + 185 * t, 110 * t * t, 70 + 185 * t],
  blue: (t) => [110 * t * t, 110 * t * t, 60 + 195 * t],
  azure: (t) => { const g = RAMP.green(t); return [g[0], (g[0] + g[2]) / 2 + 0 * g[1], g[2]]; }, // replaced below by the production toChroma samples
};
/** The exact production ramp, sampled by keying a 256 px gray gradient with toChroma. */
const rampOf = (key: Key) => { const g = makeImg(256, 1); for (let i = 0; i < 256; i++) g.data.set([i, i, i, 255], i * 4); const k = toChroma(g, key), o: number[][] = []; for (let i = 0; i < 256; i++) o.push([...k.data.subarray(i * 4, i * 4 + 3)]); return o; };
const ramps = Object.fromEntries((['green', 'magenta', 'blue', 'azure'] as Key[]).map((k) => [k, rampOf(k)])) as Record<Key, number[][]>;
void RAMP;
export const rampDist = (key: Key, r: number, g: number, b: number) => Math.min(...ramps[key].map((c) => Math.max(Math.abs(c[0] - r), Math.abs(c[1] - g), Math.abs(c[2] - b))));
const BUCKETS = [8, 16, 24, 32, 48, 999];
const bucket = (d: number) => BUCKETS.findIndex((b) => d <= b);

if (import.meta.main) {
  const cases: Case[] = JSON.parse(readFileSync(new URL('cases.json', FIX), 'utf8')).filter((c: Case) => !c.role && c.key !== 'none');
  const out: Record<string, unknown> = {};
  const A: Record<string, { inBody: number[]; outBody: number[]; itemRaw: number[] }> = {};
  const Bs: Record<string, unknown>[] = [], Cs: Record<string, unknown>[] = [], Ds: Record<string, unknown>[] = [];
  for (const c of cases) {
    const key = c.key as Key, run = await runPipe(c), all = [...run.kf, ...run.cells];
    const a = (A[c.id] = { inBody: BUCKETS.map(() => 0), outBody: BUCKETS.map(() => 0), itemRaw: BUCKETS.map(() => 0) });
    let itemPx = 0, changed = 0, idem = 0, dko = 0, abs = 0, ccRemoved = 0;
    for (const x of all) {
      const o = x.out.data, n = x.mask.length;
      for (let p = 0; p < n; p++) {
        if (o[p * 4 + 3] < 128) continue;
        const r = o[p * 4], g = o[p * 4 + 1], bl = o[p * 4 + 2];
        if (keyScore(key, r, g, bl) >= KT) (x.base.data[p * 4 + 3] ? a.inBody : a.outBody)[bucket(rampDist(key, r, g, bl))]++;
        if (x.mask[p]) { itemPx++; a.itemRaw[bucket(rampDist(key, r, g, bl))]++; if (x.layer.data[p * 4] !== r || x.layer.data[p * 4 + 1] !== g || x.layer.data[p * 4 + 2] !== bl) changed++; }
      }
      const again = despill(x.layer, key);
      for (let i = 0; i < again.data.length; i += 4) if (again.data[i] !== x.layer.data[i] || again.data[i + 1] !== x.layer.data[i + 1] || again.data[i + 2] !== x.layer.data[i + 2]) idem++;
      const m1 = chromaMask(x.out, key), m2 = dropKeyOutline(m1, x.base, x.out, key), m3 = absorbOutline(m2, x.base, x.out, key);
      for (let p = 0; p < n; p++) { if (m1[p] && !m2[p]) dko++; if (!m2[p] && m3[p]) abs++; }
      void ccRemoved;
    }
    Bs.push({ case: c.id, key, cells: all.length, itemPx, despillChanged: changed, share: +(changed / Math.max(1, itemPx)).toFixed(3), despillNotIdempotentPx: idem });
    Cs.push({ case: c.id, dropKeyOutlineRemoved: dko, absorbOutlineAdded: abs, stray: all.reduce((s, x) => s + x.stray, 0) });
    // D: rebuild every cell from the keyed body (cut applied) and the shipped layer, then extract again with the same options
    let lost = 0, added = 0, recolor = 0, cutDiff = 0;
    for (const x of run.kf) {
      const kb = toChroma(x.base, key), rebuilt = x.cut ? cutBase(kb, [[...x.cut.keys()].filter((p) => x.cut![p])]) : clone(kb);
      over(rebuilt, x.layer);
      const y = extractCell({ key: x.key, call: 0, base: x.base, out: rebuilt, route: key, band: { x: 0, y: 0, w: 1e3, h: x.base.h }, ...(x.cut ? { cut: { maxY: x.base.h } } : {}) });
      for (let p = 0; p < x.mask.length; p++) {
        if (x.mask[p] && !y.mask[p]) lost++;
        if (!x.mask[p] && y.mask[p]) added++;
        if (x.mask[p] && y.mask[p] && [0, 1, 2].some((j) => x.layer.data[p * 4 + j] !== y.layer.data[p * 4 + j])) recolor++;
        if ((x.cut?.[p] ?? 0) !== (y.cut?.[p] ?? 0)) cutDiff++;
      }
    }
    Ds.push({ case: c.id, keyframes: run.kf.length, reExtractLost: lost, reExtractAdded: added, reExtractRecolored: recolor, cutDiff });
  }
  console.log('A. key-ramp Chebyshev distance of key-scoring raw px (buckets <=8,<=16,<=24,<=32,<=48,>48)');
  const tot = { inBody: BUCKETS.map(() => 0), outBody: BUCKETS.map(() => 0), itemRaw: BUCKETS.map(() => 0) };
  for (const [id, a] of Object.entries(A)) { console.log(id.padEnd(18), 'in', a.inBody.join('/'), '| out', a.outBody.join('/'), '| item raw', a.itemRaw.join('/')); for (const k of ['inBody', 'outBody', 'itemRaw'] as const) a[k].forEach((v, i) => (tot[k][i] += v)); }
  console.log('TOTAL'.padEnd(18), 'in', tot.inBody.join('/'), '| out', tot.outBody.join('/'), '| item raw', tot.itemRaw.join('/'));
  console.log('B. despill'); console.table(Bs);
  console.log('C. stage volumes (no labels)'); console.table(Cs);
  console.log('D. keyframe re-extraction'); console.table(Ds);
  Object.assign(out, { A, tot, B: Bs, C: Cs, D: Ds });
  saveJson('bench-replay.json', out);
}
