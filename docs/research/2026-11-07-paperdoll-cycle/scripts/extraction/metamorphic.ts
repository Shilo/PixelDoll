// Metamorphic relations on the real corpus:
//  M1 input immutability: extractCell + postProcess never change the submitted base or raw output images.
//  M2 equip/unequip restoration: recompose(base, layer, cut) differs from the bare base only on layer or cut px, and the bare
//     base is byte-identical after equipping (no cut leaks into the canonical body).
//  M3 posed re-extraction: rebuild every posed cell from the keyed body (cut applied) and its shipped layer, extract again
//     with the same posed options and compare masks and RGB.
//  M4 cleanup idempotence: postProcess run a second time on its own output removes or repairs nothing more.
import { readFileSync } from 'node:fs';
import { toChroma, type Key } from '../../../../../app/src/lib/image/chroma.ts';
import { cutBase, over } from '../../../../../app/src/lib/compose/compose.ts';
import { extractCell, postProcess, recompose, slotOf } from '../../../../../app/src/lib/items/items.ts';
import { runPipe } from './bench-replay.ts';
import { body, clone, FIX, saveJson, type Img } from './lib.ts';

const same = (a: Img, b: Img) => a.data.length === b.data.length && a.data.every((v, i) => v === b.data[i]);
const cases = JSON.parse(readFileSync(new URL('cases.json', FIX), 'utf8')).filter((c: { role?: string; key: string }) => !c.role && c.key !== 'none');
const rows: Record<string, unknown>[] = [];
for (const c of cases) {
  const key = c.key as Key, inputs: [Img, Img, Img, Img][] = [];
  const run = await runPipe(c, (o, b) => { inputs.push([o, clone(o), b, clone(b)]); return undefined; });
  const m1 = inputs.filter(([o, oc, b, bc]) => !same(o, oc) || !same(b, bc)).length;
  let m2bad = 0, m2cut = 0;
  for (const x of [...run.kf, ...run.cells]) {
    const before = clone(x.base), shown = recompose(x);
    for (let p = 0; p < x.mask.length; p++) {
      const i = p * 4, changed = [0, 1, 2, 3].some((j) => shown.data[i + j] !== x.base.data[i + j]);
      if (changed && !x.layer.data[i + 3] && !x.cut?.[p]) m2bad++;
      if (x.cut?.[p]) m2cut++;
    }
    if (!same(before, x.base)) m2bad++;
  }
  let lost = 0, added = 0, recolor = 0;
  const band = (h: number) => ({ x: 0, y: 0, w: 1e3, h });
  const again = run.cells.map((x) => {
    const kb = toChroma(x.base, key), rebuilt = x.cut ? cutBase(kb, [[...x.cut.keys()].filter((p) => x.cut![p])]) : clone(kb);
    over(rebuilt, x.layer);
    return extractCell({ key: x.key, call: x.call, base: x.base, out: rebuilt, route: key, band: band(x.base.h), posed: true, held: slotOf(c.slot).class === 'held', pad: c.pad });
  });
  again.forEach((y, k) => { const x = run.cells[k]; for (let p = 0; p < x.mask.length; p++) { if (x.mask[p] && !y.mask[p]) lost++; if (!x.mask[p] && y.mask[p]) added++; if (x.mask[p] && y.mask[p] && [0, 1, 2].some((j) => x.layer.data[p * 4 + j] !== y.layer.data[p * 4 + j])) recolor++; } });
  let m4 = 0, m4rep = 0;
  if (run.cells.length) {
    const { body: b } = await body(c.body), keys = Object.fromEntries(run.kf.map((k) => [k.key.split('/')[1], k.layer]));
    const areas = run.cells.map((x) => x.area), r = postProcess(b.rig, slotOf(c.slot), run.cells, keys, c.pad);
    m4 = run.cells.reduce((s, x, i) => s + Math.abs(x.area - areas[i]), 0); m4rep = r.repaired.length;
  }
  rows.push({ case: c.id, cells: inputs.length, M1mutatedInputs: m1, M2leakPx: m2bad, M2cutPx: m2cut, M3posedLost: lost, M3posedAdded: added, M3posedRecolored: recolor, M4areaDelta: m4, M4repairedAgain: m4rep });
}
console.table(rows);
saveJson('metamorphic.json', rows);
