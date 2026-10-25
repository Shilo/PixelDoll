// Evaluate arm P (read-only): per item × seed × arm, production QA on the posed clips, then a paired comparison ctrl vs look.
import fs from 'node:fs';
import { readOnly, OUT } from './lib.mts';
readOnly();
import { evaluate, sheetOf, type Case } from './evaluate.mts';
import { rigA, baseA, restA, keyframeA, S4_ITEMS, padOf } from './s4rig.mts';
import { poseTask, CLIPS, SEEDS, ARMS } from './arm_p.mts';
const rig = rigA(), rows: any[] = [];
for (const item of Object.keys(S4_ITEMS)) for (const seed of SEEDS) {
  const res: any = {};
  for (const arm of ARMS) {
    const c: Case = { name: `${item} ${arm} s${seed}`, slot: S4_ITEMS[item].slot, key: 'green', pad: padOf(S4_ITEMS[item].slot), rig, rest: {}, dress: {}, clips: [] };
    let complete = true;
    for (const [anim, dir] of CLIPS) {
      const out = await poseTask(item, arm, seed, anim, dir);
      if (!out) { complete = false; continue; }
      c.rest[dir] ??= await restA(dir); c.dress[dir] ??= await keyframeA(item, dir);
      c.clips.push({ anim, dir, frames: await Promise.all(out.map(async (o, i) => ({ base: await baseA(dir, anim, i), out: o }))) });
    }
    if (!complete) continue;
    const r = evaluate(c);
    await sheetOf(`${OUT}/P/${item}/${arm}_s${seed}.sheet.png`, r, c, 4);
    res[arm] = { status: r.status, hard: r.fails.length, fails: r.fails, empty: r.clips.reduce((s, x) => s + x.empty, 0), offDist: +(r.clips.reduce((s, x) => s + x.offPalette * x.offDist, 0) / r.clips.length).toFixed(2), areaCV: r.clips.map((x) => x.areaCV) };
  }
  if (res.ctrl && res.look) rows.push({ item, seed, ...res });
}
fs.writeFileSync(`${OUT}/P/eval.json`, JSON.stringify(rows, null, 1));
let better = 0, worse = 0, tie = 0;
for (const r of rows) { const d = r.ctrl.hard - r.look.hard; if (d > 0) better++; else if (d < 0) worse++; else tie++; console.log(`${r.item.padEnd(7)} s${r.seed} hard fails ctrl ${r.ctrl.hard} look ${r.look.hard} | empty ${r.ctrl.empty}/${r.look.empty} | off-palette ${r.ctrl.offDist}/${r.look.offDist}`); }
console.log(`look vs ctrl on hard fails: better ${better}, worse ${worse}, tie ${tie} (n=${rows.length})`);
