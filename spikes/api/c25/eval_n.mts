// Evaluate round 2 arm N (read-only): production extraction, cleanup and QA on the new Studio bodies, walk per drawn view.
import fs from 'node:fs';
import { readOnly, OUT, load, exists } from './lib.mts';
readOnly();
import { evaluate, sheetOf, type Case } from './evaluate.mts';
import { N_ITEMS, nCase, fileOf } from './arm_n.mts';
const frames = async (f: string) => { if (!exists(`${f}.json`)) return null; const n = JSON.parse(fs.readFileSync(`${f}.json`, 'utf8')).frames; return Promise.all(Array.from({ length: n }, (_, i) => load(`${f}.${i}.png`))); };
for (const item of Object.keys(N_ITEMS)) {
  const dress = await frames(fileOf(item, 'dress'));
  if (!dress) continue;
  const { b, slot, key, pad } = nCase(item), c: Case = { name: item, slot, key: key as any, pad, rig: b.rig, rest: {}, dress: {}, clips: [] };
  for (const [i, d] of b.drawn.entries()) {
    c.rest[d] = await b.rest(d); c.dress[d] = dress[i];
    const w = await frames(fileOf(item, `walk_${d}`));
    if (w) c.clips.push({ anim: 'walk', dir: d, frames: await Promise.all(w.slice(0, 8).map(async (o, k) => ({ base: await b.base(d, 'walk', k), out: o }))) });
  }
  const r = evaluate(c);
  await sheetOf(`${OUT}/N/${item}/eval.sheet.png`, r, c, b.rig.cell.w > 96 ? 2 : 4);
  console.log(`${item} (${key}): ${r.status} | fails ${JSON.stringify(r.fails).slice(0, 300)} | warn ${JSON.stringify([...new Set(r.warnings.map((w: string) => w.replace(/[0-9.]+/g, '#')))]).slice(0, 300)}\n   kf ${r.keyframes.map((k: any) => `${k.dir}:${k.keyKept}/${k.keyOutside}/${k.area}`).join(' ')}\n   ${r.clips.map((x: any) => `${x.clip} cv ${x.areaCV} kk ${x.keyKeptMin} stray ${x.stray} empty ${x.empty}`).join(' | ')}`);
}
