// Evaluate round 4 (read-only). G: dress keyframe gates (production extractCell) old vs new wording per item, and the cape grid
// (walk east) QA; sheets in out/c25d/G. I: production QA per clip, separate idle + walk calls vs one 12-frame call; sheets in out/c25d/I.
import fs from 'node:fs';
import path from 'node:path';
import { readOnly, OUT, load, items, chroma, save, exists, type Img } from './lib.mts';
readOnly();
import { evaluate, sheet, sheetOf, padTo, type Case } from './evaluate.mts';
import { rigA, restA, baseA, DIRS, S4_ITEMS, keyframeA } from './s4rig.mts';
import { studioBody } from './bodyB.mts';
import { fileOf } from './arm_r4.mts';
const frames = async (f: string) => { if (!exists(`${f}.json`)) return null; const n = JSON.parse(fs.readFileSync(`${f}.json`, 'utf8')).frames; return Promise.all(Array.from({ length: n }, (_, i) => load(`${f}.${i}.png`))); };
const rig: any = rigA(), rows: Img[][] = [];
for (const [item, slot] of [['helmet', 'head'], ['cape', 'back'], ['chest', 'torso_outer'], ['bow', 'off_hand']] as const) for (const v of ['old', 'new']) {
  const kf = await frames(fileOf('G', item, `${v}_dress`)); if (!kf) continue;
  const pad = items.padOf(slot, 'skel', rig.cell), C = 64 + 2 * pad;
  const cs = await Promise.all(DIRS.map(async (d, i) => items.extractCell({ key: `rest/${d}/0`, call: 0, base: padTo(await restA(d), C), out: kf[i], route: 'green', band: items.bandOf(slot, undefined, C) })));
  const bad = cs.flatMap((c) => [items.g2Fails(c) && `G2 ${c.key} ${c.keyKept!.toFixed(3)}`, (c.keyOutside ?? 0) > items.GATES.keyOutside && `G3 ${c.key} ${c.keyOutside!.toFixed(3)}`, !c.area && `G4 ${c.key}`].filter(Boolean));
  console.log(`G ${item.padEnd(7)} ${v}: ${bad.length ? bad.join('; ') : 'keyframes pass'} | areas ${cs.map((c) => c.area).join('/')}`);
  rows.push(cs.map((c) => padTo(items.recompose(c), 96)));
}
await save(`${OUT}/G/dress.sheet.png`, sheet(rows, 3));
for (const v of ['old', 'new']) {
  const g = await frames(fileOf('G', 'cape', `${v}_grid`)); if (!g) continue;
  const cut = items.cutGrid(g[0], 8, 64, 64), c: Case = { name: `cape grid ${v}`, slot: 'back', key: 'green', pad: 0, rig, rest: {}, dress: {}, clips: [] };
  for (const d of DIRS) { c.rest[d] = await restA(d); c.dress[d] = await keyframeA('cape', d); }
  c.clips.push({ anim: 'walk', dir: 'east', frames: await Promise.all(cut.map(async (o, i) => ({ base: await baseA('east', 'walk', i), out: o }))) });
  const r = evaluate(c); await sheetOf(`${OUT}/G/cape_${v}_grid.sheet.png`, r, c, 3);
  console.log(`G cape grid ${v}: ${r.status} | fails ${JSON.stringify(r.fails).slice(0, 200)}`);
}
const b = studioBody('chibi'), R2 = path.resolve(import.meta.dirname, '../out/c25b/N');
const I_ITEMS: Record<string, string> = { helmChibi: 'a steel great helm with a narrow eye slit, covering the whole head', jesterChibi: 'a green and purple jester hat with three bells' };
for (const item of Object.keys(I_ITEMS)) {
  const key = chroma.pickKey(I_ITEMS[item]) as any, dress = await frames(`${R2}/${item}/dress`);
  for (const v of ['separate', 'one call']) {
    const c: Case = { name: `${item} ${v}`, slot: 'head', key, pad: 0, rig: b.rig, rest: {}, dress: {}, clips: [] };
    for (const [i, d] of b.drawn.entries()) {
      c.rest[d] = await b.rest(d); c.dress[d] = dress![i];
      const both = v === 'one call' ? await frames(fileOf('I', item, `both_${d}`)) : null;
      const idle = both ? both.slice(0, 4) : await frames(fileOf('I', item, `idle_${d}`)), walk = both ? both.slice(4, 12) : await frames(`${R2}/${item}/walk_${d}`);
      c.clips.push({ anim: 'idle', dir: d, frames: await Promise.all(idle!.slice(0, 4).map(async (o, k) => ({ base: await b.base(d, 'idle', k), out: o }))) });
      c.clips.push({ anim: 'walk', dir: d, frames: await Promise.all(walk!.slice(0, 8).map(async (o, k) => ({ base: await b.base(d, 'walk', k), out: o }))) });
    }
    const r = evaluate(c); await sheetOf(`${OUT}/I/${item}_${v.replace(' ', '_')}.sheet.png`, r, c, 3);
    const failing = c.clips.map((cl) => `${cl.anim}/${cl.dir}`).filter((k) => r.fails.some((f: string) => f.includes(` ${k}`)));
    console.log(`I ${item.padEnd(11)} ${v.padEnd(8)}: ${r.status} | failing clips ${failing.join(',') || '-'} | ${JSON.stringify(r.fails).slice(0, 160)}`);
  }
}
