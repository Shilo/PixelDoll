// Evaluate round 3 (read-only): arm V counts failing walk clips per wording and seed (production QA, off hand, 96 px canvas)
// and saves a dress sheet (rows off_hand s7, s11, s23, vert s7, s11, s23); arm S runs production QA on the steel items.
import fs from 'node:fs';
import { readOnly, OUT, load, items, save, exists, type Img } from './lib.mts';
readOnly();
import { evaluate, sheet, sheetOf, padTo, type Case } from './evaluate.mts';
import { rigA, restA, baseA, DIRS } from './s4rig.mts';
import { S_ITEMS, fileOf } from './arm_r3.mts';
const V_SEEDS = [7, 11, 23, 31, 47, 59];
const rig: any = rigA(), pad = items.padOf('off_hand', 'skel', rig.cell), C = rig.cell.w + 2 * pad;
const frames = async (f: string) => { if (!exists(`${f}.json`)) return null; const n = JSON.parse(fs.readFileSync(`${f}.json`, 'utf8')).frames; return Promise.all(Array.from({ length: n }, (_, i) => load(`${f}.${i}.png`))); };
async function run(c: Case, walk: (d: string) => string, sheetFile: string) {
  for (const d of DIRS) { const w = await frames(walk(d)); if (w) c.clips.push({ anim: 'walk', dir: d, frames: await Promise.all(w.slice(0, 8).map(async (o, k) => ({ base: await baseA(d, 'walk', k), out: o }))) }); }
  const r = evaluate(c); await sheetOf(sheetFile, r, c, 3); return r;
}
const rows: Img[][] = [];
for (const v of ['off_hand', 'vert']) { let failing = 0, n = 0;
  for (const s of V_SEEDS) {
    const kf = await frames(fileOf('B', v, `dress_s${s}`)); if (!kf) continue;
    rows.push(await Promise.all(DIRS.map(async (d, i) => items.recompose(items.extractCell({ key: `rest/${d}/0`, call: 0, base: padTo(await restA(d), C), out: kf[i], route: 'green', band: items.bandOf('off_hand', undefined, C) })))));
    const c: Case = { name: `${v} s${s}`, slot: 'off_hand', key: 'green', pad, rig, rest: {}, dress: {}, clips: [] };
    for (const [i, d] of DIRS.entries()) { c.rest[d] = await restA(d); c.dress[d] = kf[i]; }
    const r = await run(c, (d) => fileOf('B', v, s === 7 ? `walk_${d}` : `walk_${d}_s${s}`), `${OUT}/B/${v}/walk_s${s}.sheet.png`);
    const bad = DIRS.filter((d) => r.fails.some((f: string) => f.includes(`walk/${d}`))); failing += bad.length; n += c.clips.length;
    console.log(`V ${v.padEnd(8)} s${s}: failing clips ${bad.join(',') || '-'} | ${JSON.stringify([...new Set(r.fails.map((f: string) => f.split(':')[0]))]).slice(0, 220)}`);
  }
  console.log(`V ${v}: ${failing}/${n} walk clips fail`);
}
await save(`${OUT}/B/dress.sheet.png`, sheet(rows, 3));
for (const item of Object.keys(S_ITEMS)) for (const s of [7, 11]) {
  const kf = await frames(fileOf('S', item, `dress_s${s}`)); if (!kf) continue;
  const { slot, prompt } = S_ITEMS[item], key = (await import('./lib.mts')).chroma.pickKey(prompt) as any;
  const c: Case = { name: `${item} s${s}`, slot, key, pad: 0, rig, rest: {}, dress: {}, clips: [] };
  for (const [i, d] of DIRS.entries()) { c.rest[d] = await restA(d); c.dress[d] = kf[i]; }
  const r = await run(c, (d) => (s === 7 ? fileOf('S', item, `walk_${d}`) : '__none__'), `${OUT}/S/${item}/s${s}.sheet.png`);
  console.log(`S ${item} s${s} (${key}): ${r.status} | kf ${r.keyframes.map((k: any) => `${k.dir}:${k.keyKept}/${k.keyOutside}`).join(' ')} | fails ${JSON.stringify(r.fails).slice(0, 250)}`);
}
