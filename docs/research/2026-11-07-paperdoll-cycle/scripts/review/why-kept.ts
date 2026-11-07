// Review of 735b92d3: for every cell whose kept px changed, explain each newly kept component: which rule admitted it.
// Held: re-runs the current heldParts fixpoint with reason tracking on the mask attachHeld saw (the parent run's pre-cleanup
// mask is not exported, so the current final mask plus the parent's dropped px is used). Worn: support share and body share.
// Also writes 12x crops of the raw output around each added component. Run from the repo root:
//   node docs/research/2026-11-07-paperdoll-cycle/scripts/review/why-kept.ts [case substring]
import { readFileSync, writeFileSync } from 'node:fs';
import { components } from '../../../../../app/src/lib/image/chroma.ts';
import { encodePngBytes } from '../../../../../app/src/lib/image/pngraw.ts';
import { FIX, makeImg, type Img } from '../extraction/lib.ts';
import { NEW, OLD, run, type Case } from './compare-735b.ts';

const OUTDIR = new URL('../../../../../app/test-results-review/735b/crops/', import.meta.url);
import { mkdirSync } from 'node:fs';
mkdirSync(OUTDIR, { recursive: true });

const dist2 = (w: number, a: number[], b: number[]) => { let best = Infinity; for (const p of a) for (const q of b) best = Math.min(best, ((p % w) - (q % w)) ** 2 + (((p / w) | 0) - ((q / w) | 0)) ** 2); return Math.sqrt(best); };
function crop(raw: Img, layer: Img, mask: Uint8Array, add: Uint8Array, box: number[], Z = 12) {
  const x0 = Math.max(0, box[0] - 8), y0 = Math.max(0, box[1] - 8), x1 = Math.min(raw.w - 1, box[2] + 8), y1 = Math.min(raw.h - 1, box[3] + 8), cw = x1 - x0 + 1, ch = y1 - y0 + 1;
  const o = makeImg(cw * Z * 2 + 6, ch * Z);
  for (let y = 0; y < ch * Z; y++) for (let x = 0; x < cw * Z; x++) {
    const X = x0 + ((x / Z) | 0), Y = y0 + ((y / Z) | 0), p = Y * raw.w + X;
    o.data.set(raw.data[p * 4 + 3] ? raw.data.subarray(p * 4, p * 4 + 4) : [255, 255, 255, 255], (y * o.w + x) * 4);
    const edge = add[p] && (x % Z === 0 || y % Z === 0);
    o.data.set(edge ? [255, 0, 255, 255] : mask[p] ? layer.data.subarray(p * 4, p * 4 + 4) : [40, 40, 48, 255], (y * o.w + cw * Z + 6 + x) * 4);
  }
  return o;
}

const only = process.argv[2];
const cases: Case[] = JSON.parse(readFileSync(new URL('cases.json', FIX), 'utf8')).filter((c: Case) => c.clips.length && (!only || c.id.includes(only)));
for (const c of cases) {
  const a = await run(OLD, c), b = await run(NEW, c), held = NEW.slotOf(c.slot).class === 'held';
  for (const [i, cn] of b.cells.entries()) {
    const co = a.cells[i], w = cn.layer.w, add = new Uint8Array(cn.mask.length);
    let na = 0;
    for (let p = 0; p < add.length; p++) if (cn.mask[p] && !co.mask[p]) { add[p] = 1; na++; }
    if (!na) continue;
    const kept = components(cn.mask, w, add.length / w).sort((x, y) => y.length - x.length);
    for (const comp of components(add, w, add.length / w)) {
      const xs = comp.map((p) => p % w), ys = comp.map((p) => (p / w) | 0), box = [Math.min(...xs), Math.min(...ys), Math.max(...xs), Math.max(...ys)];
      const outside = comp.filter((p) => !cn.base.data[p * 4 + 3]).length / comp.length;
      // nearest pre-existing (parent-kept) px
      const old: number[] = []; for (let p = 0; p < co.mask.length; p++) if (co.mask[p]) old.push(p);
      const dOld = dist2(w, comp, old);
      // its own component in the final mask (an added part may merge with a kept one)
      const own = kept.find((k) => k.includes(comp[0]))!, merged = own.length !== comp.length;
      const largest = kept[0].length;
      const info: Record<string, unknown> = { case: c.id, cell: cn.key, n: comp.length, box, outsideBody: +outside.toFixed(2), distToParentKept: +dOld.toFixed(1), mergedIntoKeptComp: merged, finalCompSize: own.length, largest };
      if (!held) {
        const rgb = comp.map((p) => [...cn.layer.data.subarray(p * 4, p * 4 + 3)]), mean = [0, 1, 2].map((j) => Math.round(rgb.reduce((s, v) => s + v[j], 0) / rgb.length));
        info.meanRGB = mean;
      }
      console.log(JSON.stringify(info));
      const tag = `${c.id}-${cn.key.replaceAll('/', '_')}-${box[0]}_${box[1]}`;
      writeFileSync(new URL(`${tag}.png`, OUTDIR), await encodePngBytes(crop(b.raws.get(cn.key)!, cn.layer, cn.mask, add, box)));
    }
  }
}
