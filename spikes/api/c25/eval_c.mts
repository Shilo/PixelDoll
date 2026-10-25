// Evaluate arm C (read-only): production extraction, cleanup and QA on body B (5 drawn views, walk), per item and variant.
import fs from 'node:fs';
import { readOnly, OUT, load, items, exists, type Img } from './lib.mts';
readOnly();
import { evaluate, sheetOf, type Case } from './evaluate.mts';
import { rigB, restB, baseB, DRAWN } from './bodyB.mts';
import { C_ITEMS, fileOf } from './arm_c.mts';
import { swapGB } from './arm_dk.mts';
const rig = rigB();
const frames = async (f: string) => { if (!exists(`${f}.json`)) return null; const n = JSON.parse(fs.readFileSync(`${f}.json`, 'utf8')).frames; return Promise.all(Array.from({ length: n }, (_, i) => load(`${f}.${i}.png`))); };
const report: any[] = [];
for (const item of Object.keys(C_ITEMS)) for (const v of ['ctrl', 'blue', 'view']) {
  const dress = await frames(fileOf(item, v, 'dress'));
  if (!dress) continue;
  const sw = (im: Img) => (v === 'blue' ? swapGB(im) : im);
  const c: Case = { name: `${item} ${v}`, slot: C_ITEMS[item].slot, key: v === 'blue' ? 'green' : (await import('./lib.mts')).chroma.pickKey(C_ITEMS[item].prompt), pad: 0, rig, rest: {}, dress: {}, clips: [] };
  for (const [i, d] of DRAWN.entries()) {
    c.rest[d] = await restB(d); c.dress[d] = sw(dress[i]);
    const w = await frames(fileOf(item, v, `walk_${d}`));
    if (w) c.clips.push({ anim: 'walk', dir: d, frames: await Promise.all(w.slice(0, 8).map(async (o, k) => ({ base: await baseB(d, 'walk', k), out: sw(o) }))) });
  }
  const r = evaluate(c);
  if (v === 'blue') { for (const x of r.cells) x.layer = swapGB(x.layer); for (const d of Object.keys(r.keys)) r.keys[d] = swapGB(r.keys[d]); }
  await sheetOf(`${OUT}/C/${item}/${v}.sheet.png`, r, c, 4);
  report.push({ item, v, status: r.status, fails: r.fails, warnings: [...new Set(r.warnings.map((w: string) => w.replace(/[0-9]+/g, '#')))], clips: r.clips.map((x) => `${x.clip} cv ${x.areaCV} kk ${x.keyKeptMin} stray ${x.stray} empty ${x.empty}`), kf: r.keyframes.map((k) => `${k.dir}:${k.keyKept}/${k.keyOutside}/${k.area}`) });
}
fs.writeFileSync(`${OUT}/C/eval.json`, JSON.stringify(report, null, 1));
for (const r of report) console.log(`${r.item} ${r.v}: ${r.status} | fails ${r.fails.length} ${JSON.stringify(r.fails).slice(0, 300)} | warn ${JSON.stringify(r.warnings).slice(0, 200)}\n   kf ${r.kf.join(' ')}`);
