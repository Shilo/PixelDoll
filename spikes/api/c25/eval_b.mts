// Evaluate round 2 arm B (read-only): dress keyframes for each slot × seed as one sheet (rows main s7, s11, s23, off s7, s11, s23),
// plus production QA on the seed 7 walk for each slot.
import fs from 'node:fs';
import { readOnly, OUT, load, items, save, exists, type Img } from './lib.mts';
readOnly();
import { evaluate, sheet, sheetOf, padTo, type Case } from './evaluate.mts';
import { rigA, restA, baseA, DIRS } from './s4rig.mts';
import { B_SLOTS, B_SEEDS, padB, fileOf } from './arm_b.mts';
const rig: any = rigA();
const frames = async (f: string) => { if (!exists(`${f}.json`)) return null; const n = JSON.parse(fs.readFileSync(`${f}.json`, 'utf8')).frames; return Promise.all(Array.from({ length: n }, (_, i) => load(`${f}.${i}.png`))); };
const rows: Img[][] = [];
for (const slot of B_SLOTS) {
  const p = padB(slot), C = rig.cell.w + 2 * p;
  for (const s of B_SEEDS) {
    const d = await frames(fileOf(slot, `dress_s${s}`)); if (!d) continue;
    rows.push(await Promise.all(DIRS.map(async (dir, i) => items.recompose(items.extractCell({ key: `rest/${dir}/0`, call: 0, base: padTo(await restA(dir), C), out: d[i], route: 'green', band: items.bandOf(slot, undefined, C) })))));
  }
  const kf = await frames(fileOf(slot, 'dress_s7')); if (!kf) continue;
  const c: Case = { name: slot, slot, key: 'green', pad: p, rig, rest: {}, dress: {}, clips: [] };
  for (const [i, d] of DIRS.entries()) {
    c.rest[d] = await restA(d); c.dress[d] = kf[i];
    const w = await frames(fileOf(slot, `walk_${d}`));
    if (w) c.clips.push({ anim: 'walk', dir: d, frames: await Promise.all(w.slice(0, 8).map(async (o, k) => ({ base: await baseA(d, 'walk', k), out: o }))) });
  }
  const r = evaluate(c);
  await sheetOf(`${OUT}/B/${slot}/walk.sheet.png`, r, c, 3);
  console.log(`${slot}: ${r.status} | fails ${JSON.stringify(r.fails).slice(0, 400)} | warn ${JSON.stringify([...new Set(r.warnings.map((w: string) => w.replace(/[0-9.]+/g, '#')))]).slice(0, 300)}`);
}
await save(`${OUT}/B/dress.sheet.png`, sheet(rows, 3));
