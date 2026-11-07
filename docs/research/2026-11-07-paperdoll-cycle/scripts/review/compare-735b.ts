// Review of 735b92d3: replays the frozen bench through the parent (735b92d3^) and current items.ts and reports every cell whose
// kept px changed, with per-component facts and a zoomed diff sheet. Run from the repo root:
//   node docs/research/2026-11-07-paperdoll-cycle/scripts/review/compare-735b.ts [case substring]
// The parent copy is written to app/test-results-review/ (gitignored) with its relative imports rewritten to app/src.
// Sheet panels: raw output | parent result | current result | diff (magenta = kept only now, cyan = kept only before).
import { execSync } from 'node:child_process';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { encodePngBytes } from '../../../../../app/src/lib/image/pngraw.ts';
import { components } from '../../../../../app/src/lib/image/chroma.ts';
import { fromApi } from '../../../../../app/src/lib/rig/poses.ts';
import type { Keypoint, Rig } from '../../../../../app/src/lib/rig/rig.ts';
import { body, cell, FIX, load, makeImg, type Img } from '../extraction/lib.ts';

const ROOT = new URL('../../../../../', import.meta.url), OUTDIR = new URL('app/test-results-review/735b/', ROOT);
mkdirSync(new URL('app/test-results-review/items-parent/', ROOT), { recursive: true });
mkdirSync(OUTDIR, { recursive: true });
const parentSrc = execSync('git show 735b92d3~1:app/src/lib/items/items.ts', { cwd: ROOT, encoding: 'utf8', maxBuffer: 1 << 26 })
  .replace(/from '\.\.\//g, "from '../../src/lib/").replace(/from '\.\//g, "from '../../src/lib/items/");
writeFileSync(new URL('app/test-results-review/items-parent/items.ts', ROOT), parentSrc);
export const OLD = await import(new URL('app/test-results-review/items-parent/items.ts', ROOT).href);
export const NEW = await import(new URL('app/src/lib/items/items.ts', ROOT).href);

export interface Case { id: string; body: string; slot: string; key: string; pad: number; clips: string[]; role?: string }
const skel = (rig: Rig, k: Keypoint[] | undefined) => k && fromApi(k, rig.cell);

export async function run(M: typeof NEW, c: Case, post = true) {
  const { body: b, sheet: bodySheet } = await body(c.body), rig = b.rig, N = rig.cell.w, C = N + 2 * c.pad, slot = M.slotOf(c.slot), sheet = await load(`${c.id}.png`), held = slot.class === 'held';
  const base = (dir: string, col: string) => M.padImg(cell(bodySheet, N, b.rows.indexOf(dir), b.cols.indexOf(col)), c.pad);
  const dirsOf = c.clips.length ? [...new Set(c.clips.map((k) => k.split('/')[1]))] : b.rows;
  const kfRow = (d: string) => (c.clips.length ? c.clips.findIndex((k) => k.endsWith(`/${d}`)) : 0), kfCol = (d: string) => (c.clips.length ? 0 : b.rows.indexOf(d));
  const keys: Record<string, Img> = {}, keyCut: Record<string, Uint8Array | undefined> = {}, kf: any[] = [], raws = new Map<string, Img>();
  for (const d of dirsOf) {
    const s0 = c.pad ? undefined : skel(rig, rig.rest?.[d as 'south']?.keypoints), maxY = M.cutRows(c.slot, s0, C), o = cell(sheet, C, kfRow(d), kfCol(d));
    const k = M.extractCell({ key: `rest/${d}/0`, call: 0, base: base(d, 'rest'), out: o, route: c.key, band: M.bandOf(c.slot, s0, C), ...(maxY != null ? { cut: { maxY } } : {}) });
    keys[d] = k.layer; keyCut[d] = k.cut; kf.push(k); raws.set(k.key, o);
  }
  const cells: any[] = [];
  c.clips.forEach((clip, r) => {
    const [anim, dir] = clip.split('/'), a = rig.animations.find((x) => x.id === anim)!;
    for (let i = 0; i < a.cells; i++) {
      const s1 = c.pad ? undefined : skel(rig, a.sources?.[dir as 'south']?.keypoints?.[i]), maxY = M.cutRows(c.slot, s1, C), allow = maxY != null ? M.cutAllow(rig, `${clip}/${i}`, keyCut[dir], N, M.posedTol(N, N)) : undefined;
      const o = cell(sheet, C, r, 1 + i);
      cells.push(M.extractCell({ key: `${clip}/${i}`, call: 1 + r, base: base(dir, `${anim}/${i}`), out: o, route: c.key, band: M.bandOf(c.slot, s1, C), posed: true, clip: slot.band, held, pad: c.pad, ...(allow ? { cut: { maxY: maxY!, allow } } : {}) }));
      raws.set(`${clip}/${i}`, o);
    }
  });
  if (cells.length && post) M.postProcess(rig, slot, cells, keys, c.pad);
  let qa: { fails: string[]; warnings: string[] } = { fails: [], warnings: [] };
  if (cells.length && post) {
    const q = M.itemQa(rig, slot, c.key, cells, 0, M.GATES.keyOutsidePosed, c.pad), h = M.dirGate(slot, cells, keys, rig);
    qa = { fails: [...q.failCalls.values(), ...h.fails.values()].flat(), warnings: [...q.warnings, ...h.warnings] };
  }
  return { rig, kf, cells, keys, raws, qa };
}

const Z = 6;
function panel(imgs: Img[]) {
  const w = imgs[0].w, h = imgs[0].h, o = makeImg((w * Z + 4) * imgs.length, h * Z);
  imgs.forEach((im, k) => { for (let y = 0; y < h * Z; y++) for (let x = 0; x < w * Z; x++) o.data.set(im.data.subarray((((y / Z) | 0) * w + ((x / Z) | 0)) * 4, (((y / Z) | 0) * w + ((x / Z) | 0)) * 4 + 4), (y * o.w + k * (w * Z + 4) + x) * 4); });
  return o;
}
function compose(base: Img, layer: Img, mask: Uint8Array, add?: Uint8Array, rem?: Uint8Array) {
  const o = makeImg(base.w, base.h);
  for (let p = 0; p < mask.length; p++) {
    let px = [32, 32, 40, 255];
    if (base.data[p * 4 + 3]) { const g = (base.data[p * 4] + base.data[p * 4 + 1] + base.data[p * 4 + 2]) / 3; px = [60 + g * 0.25, 60 + g * 0.25, 60 + g * 0.25, 255]; }
    if (mask[p]) px = add || rem ? [layer.data[p * 4] * 0.5 + 60, layer.data[p * 4 + 1] * 0.5 + 60, layer.data[p * 4 + 2] * 0.5 + 60, 255] : [layer.data[p * 4], layer.data[p * 4 + 1], layer.data[p * 4 + 2], 255];
    if (add?.[p]) px = [255, 0, 255, 255];
    if (rem?.[p]) px = [0, 255, 255, 255];
    o.data.set(px, p * 4);
  }
  return o;
}

if (import.meta.main) {
  const only = process.argv[2];
  const cases: Case[] = JSON.parse(readFileSync(new URL('cases.json', FIX), 'utf8')).filter((c: Case) => c.clips.length && (!only || c.id.includes(only)));
  const report: Record<string, unknown>[] = [];
  for (const c of cases) {
    const a = await run(OLD, c), b = await run(NEW, c);
    let addT = 0, remT = 0;
    for (const [i, cn] of b.cells.entries()) {
      const co = a.cells[i], w = cn.layer.w, add = new Uint8Array(cn.mask.length), rem = new Uint8Array(cn.mask.length);
      let na = 0, nr = 0;
      for (let p = 0; p < add.length; p++) { if (cn.mask[p] && !co.mask[p]) { add[p] = 1; na++; } if (!cn.mask[p] && co.mask[p]) { rem[p] = 1; nr++; } }
      if (!na && !nr) continue;
      addT += na; remT += nr;
      const comps = components(add, w, add.length / w).map((comp) => {
        const onBody = comp.filter((p) => cn.base.data[p * 4 + 3]).length, xs = comp.map((p) => p % w), ys = comp.map((p) => (p / w) | 0);
        return { n: comp.length, onBody, box: [Math.min(...xs), Math.min(...ys), Math.max(...xs), Math.max(...ys)] };
      });
      report.push({ case: c.id, cell: cn.key, added: na, removed: nr, oldArea: co.area, newArea: cn.area, comps });
      const raw = b.raws.get(cn.key)!, tag = `${c.id}-${cn.key.replaceAll('/', '_')}`;
      writeFileSync(new URL(`${tag}.png`, OUTDIR), await encodePngBytes(panel([raw, compose(co.base, co.layer, co.mask), compose(cn.base, cn.layer, cn.mask), compose(cn.base, cn.layer, cn.mask, add, rem)])));
    }
    const qd = { goneFails: a.qa.fails.filter((f) => !b.qa.fails.includes(f)), newFails: b.qa.fails.filter((f) => !a.qa.fails.includes(f)), goneWarn: a.qa.warnings.filter((f) => !b.qa.warnings.includes(f)), newWarn: b.qa.warnings.filter((f) => !a.qa.warnings.includes(f)) };
    console.log(`${c.id.padEnd(18)} added ${addT} removed ${remT} | fails ${a.qa.fails.length}->${b.qa.fails.length} warns ${a.qa.warnings.length}->${b.qa.warnings.length}`);
    if (qd.goneFails.length || qd.newFails.length || qd.goneWarn.length || qd.newWarn.length) console.log('   ', JSON.stringify(qd));
  }
  for (const r of report) console.log(JSON.stringify(r));
  writeFileSync(new URL('report.json', OUTDIR), JSON.stringify(report, null, 1));
}
