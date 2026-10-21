// S2/X2: two-pass batch remove. Feed S1's dressed composites back into edit-animation-v2 and ask it to delete the character,
// keeping only the item on transparency. Then clamp to the slot and composite over the frozen base.
// usage: node --env-file=../../.env s2_x2.mjs [run]   (offline re-eval: node s2_x2.mjs eval)
import fs from 'node:fs';
import { experiment } from './lib/run.mjs';
import { toB64, fromB64, over } from './lib/img.mjs';
import { b64img } from './lib/api.mjs';
import { layerFrom } from './lib/diff.mjs';
import { clipRect, minArea } from './lib/clean.mjs';
import { summarize, ANCHOR } from './s2_x1_eval.mjs';
import { sheet } from './lib/sheet.mjs';

const X = experiment('s2_x2');
const SK = JSON.parse(fs.readFileSync(`${X.dir}/../e4_anim/walk_skeletons.json`));
const cl = (x0, y0, x1, y1) => { x0 = Math.max(0, Math.floor(x0)); y0 = Math.max(0, Math.floor(y0)); x1 = Math.min(64, Math.ceil(x1)); y1 = Math.min(64, Math.ceil(y1)); return { x: x0, y: y0, w: x1 - x0, h: y1 - y0 }; };
const HEAD = ['NOSE', 'LEFT EYE', 'RIGHT EYE', 'LEFT EAR', 'RIGHT EAR'];
const REG = { // S1 e4_reextract slots
  helmet: k => { const cx = HEAD.reduce((a, l) => a + k[l][0], 0) / 5; return cl(cx - 12, 0, cx + 12, k.NECK[1] + 2); },
  sword: (k, d) => d === 'south' ? cl(0, k['RIGHT ARM'][1] - 22, k['RIGHT ARM'][0] + 6, 64) : cl(0, 10, 64, 64),
  chest: k => { const xs = ['LEFT SHOULDER', 'RIGHT SHOULDER', 'LEFT ELBOW', 'RIGHT ELBOW'].map(l => k[l][0]); return cl(Math.min(...xs) - 2, k.NECK[1] - 2, Math.max(...xs) + 3, Math.max(k['LEFT HIP'][1], k['RIGHT HIP'][1]) + 3); },
};
const WHAT = { helmet: 'steel helmet', chest: 'brown leather chest armor vest', sword: 'steel longsword' };
// jobs: name -> [item, [[dir, S1 run tag], ...]]
const JOBS = { helmet: ['helmet', [['south', 'helmet_south__ea2'], ['east', 'helmet_east__ea2']]], chest: ['chest', [['south', 'chest_south__ea2']]], sword: ['sword', [['south', 'sword_south__to2']]] };
const sz = { width: 64, height: 64 };
const frames = js => js.flatMap(([d, tag]) => [...Array(8).keys()].map(i => ({ d, i, C: X.load(`../e4_anim/${tag}.out${i}.png`), B: X.load(`../e2_anim/walk_${d}_${i}.png`), S1: X.load(`../e4_anim/${tag}.final_layer${i}.png`) })));

if (process.argv[2] !== 'eval') {
  await Promise.all(Object.entries(JOBS).map(async ([name, [item, js]]) => {
    const F = frames(js), t0 = Date.now();
    try {
      const r = await X.api.run('/edit-animation-v2', { description: `Remove the character completely: delete the head, face, arms, legs and torso. Keep ONLY the ${WHAT[item]} the character wears, exactly as drawn, in exactly the same position, size and shape in every frame, on a fully transparent background. Draw the hidden parts of the ${WHAT[item]} that the character covered.`, frames: F.map(f => ({ image: b64img(toB64(f.C)), size: sz })), image_size: sz, no_background: true, seed: 7 });
      const outs = r.jobs[0].last_response.images.map(a => fromB64(a.base64)); outs.forEach((o, j) => X.save(`${name}.out${j}.png`, o));
      fs.appendFileSync(`${X.dir}/costs.jsonl`, JSON.stringify({ name, ms: Date.now() - t0, usage: r.jobs[0].usage, nOut: outs.length }) + '\n');
    } catch (e) { fs.appendFileSync(`${X.dir}/costs.jsonl`, JSON.stringify({ name, error: e.message.slice(0, 600) }) + '\n'); }
  }));
}
// eval
const table = [];
for (const [name, [item, js]] of Object.entries(JOBS)) {
  if (!fs.existsSync(`${X.dir}/${name}.out0.png`)) continue;
  const F = frames(js), rows = { south: [[], [], [], [], []], east: [[], [], [], [], []] }, per = { south: [], east: [] };
  F.forEach((f, j) => {
    const O = X.load(`${name}.out${j}.png`), k = SK[`${f.d}_${f.i}`], all = Uint8Array.from({ length: 4096 }, (_, p) => O.d[p * 4 + 3] >= 128 ? 1 : 0);
    const m = minArea(clipRect(all, 64, REG[item](k, f.d)), 64, 64, 3), L = layerFrom(O, m);
    let outside = 0; for (let p = 0; p < 4096; p++) if (all[p] && !m[p]) outside++;
    // alignment vs S1 layer: IoU and centroid offset
    let I = 0, U = 0, sx = [0, 0, 0], sy = [0, 0, 0]; for (let p = 0; p < 4096; p++) { const a = m[p], b = f.S1.d[p * 4 + 3] > 0; if (a && b) I++; if (a || b) U++; if (a) { sx[0] += p % 64; sy[0] += p / 64 | 0; sx[2]++; } if (b) { sx[1] += p % 64; sy[1] += p / 64 | 0; sy[2]++; } }
    per[f.d].push({ L, outside, iou: I / U, dc: [sx[0] / sx[2] - sx[1] / sy[2], sy[0] / sx[2] - sy[1] / sy[2]] });
    X.save(`${name}_${f.d}.layer${f.i}.png`, L);
    const R = rows[f.d]; R[0].push(f.C); R[1].push(O); R[2].push(L); R[3].push(f.S1); R[4].push(over(f.B, L));
  });
  for (const d of ['south', 'east']) if (per[d].length) {
    X.save(`${name}_${d}.final_sheet.png`, sheet(rows[d], { s: 3 }));
    const P = per[d];
    table.push({ name, dir: d, ...summarize(P.map(p => p.L), P.map((_, i) => SK[`${d}_${i}`][ANCHOR[item]])), outsideSlotPx: +(P.reduce((a, p) => a + p.outside, 0) / 8).toFixed(1), iouVsS1: +(P.reduce((a, p) => a + p.iou, 0) / 8).toFixed(2), centroidShiftVsS1: P.map(p => p.dc.map(v => +v.toFixed(1)).join(',')).join(' ') });
  }
}
console.table(table); X.saveJson('x2_table.json', table);
