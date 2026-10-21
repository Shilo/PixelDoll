// S2/X4: chroma route on the NEW clothed base (out/s2_base): more directions, a non-walk clip, cross-call design lock, headroom.
// usage: node --env-file=../../.env s2_x4.mjs <name> <item> <anim_dir[:pad],...> <ea2|to2> [refName] [key=green]
//        node s2_x4.mjs eval <name> <item> [refName] [key]   (offline re-eval)
// to2 reference = output cell 0 of an earlier ea2 run (the key mannequin already wearing the item) -> same design in a new call.
import fs from 'node:fs';
import { experiment } from './lib/run.mjs';
import { toB64, fromB64, over, canvasTo, bbox } from './lib/img.mjs';
import { b64img } from './lib/api.mjs';
import { layerFrom, layerStats, paletteDist } from './lib/diff.mjs';
import { dropKeyOutline, toChroma, chromaMask, keyKept, despill, chromaPrompt, NAME } from './lib/chroma.mjs';
import { minArea } from './lib/clean.mjs';
import { summarize } from './s2_x1_eval.mjs';
import { sheet } from './lib/sheet.mjs';

const X = experiment('s2_x4');
const args = process.argv.slice(2), offline = args[0] === 'eval';
const [name, item, cellSpec, route, refName, key = 'green'] = offline ? [args[1], args[2], null, null, args[3], args[4] || 'green'] : args;
const sz = { width: 64, height: 64 }, fr = F => ({ image: b64img(toB64(F)), size: sz });
// cells: every frame of each anim_dir; ":pad" = 48 px base padded to 64 (x+8, y+16) — translation only, never rescaled
function loadCells(spec) {
  const cells = [];
  for (const s of spec.split(',')) { const [ad, pad] = s.split(':'); for (let i = 0; fs.existsSync(`${X.dir}/../s2_base/${ad}_${i}.png`); i++) { let B = X.load(`../s2_base/${ad}_${i}.png`); if (pad) B = canvasTo(B, 64, 64, 8, 16); cells.push({ id: `${ad}_${i}`, group: ad, B }); } }
  return cells;
}
if (!offline) {
  const cells = loadCells(cellSpec), K = cells.map(c => toChroma(c.B, key)), t0 = Date.now();
  cells.forEach((c, j) => X.save(`${name}.base${j}.png`, c.B));
  fs.writeFileSync(`${X.dir}/${name}.cells.json`, JSON.stringify(cells.map(c => ({ id: c.id, group: c.group }))));
  const groups = [...new Set(cells.map(c => c.group))].map(g => `${cells.filter(c => c.group === g).length} cells ${g.replace(/^b\d+/, '').replace('_', ' facing ')}`).join(', ');
  const note = `Cells in order: ${groups}. `;
  let r;
  if (route === 'ea2') r = await X.api.run('/edit-animation-v2', { description: chromaPrompt(item, key, note), frames: K.map(fr), image_size: sz, no_background: true, seed: 7 });
  // ea2a: anchor-cell design lock — frame 1 is the reference call's dressed cell 0, the rest are new key cells; output 0 is dropped
  else if (route === 'ea2a') r = await X.api.run('/edit-animation-v2', { description: chromaPrompt(item, key, `Frame 1 already wears the ${item}: copy exactly that ${item} design, colours and size onto the other frames. ${note}`), frames: [fr(X.load(`${refName}.out0.png`)), ...K.map(fr)], image_size: sz, no_background: true, seed: 7 });
  else r = await X.api.run('/transfer-outfit-v2', { reference_image: fr(X.load(`${refName}.out0.png`)), frames: K.map(fr), image_size: sz, no_background: true, seed: 7, additional_instructions: `Only add the ${item} from the reference, same design and colours. The ${NAME[key]} mannequin colour is intentional (chroma key) and must stay unchanged. ${note}` });
  let outs = r.jobs[0].last_response.images.map(a => fromB64(a.base64)); if (route === 'ea2a') outs = outs.slice(1); outs.forEach((o, j) => X.save(`${name}.out${j}.png`, o));
  const c = { name, item, route, ref: refName, key, cells: cells.length, ms: Date.now() - t0, usage: r.jobs[0].usage, nOut: outs.length };
  fs.appendFileSync(`${X.dir}/costs.jsonl`, JSON.stringify(c) + '\n'); console.log('COST', JSON.stringify(c));
}
// ---- eval ----
const cells = JSON.parse(fs.readFileSync(`${X.dir}/${name}.cells.json`)), refL = refName && fs.existsSync(`${X.dir}/${refName}.layer0.png`) ? X.load(`${refName}.layer0.png`) : null;
const groups = {}, table = [];
cells.forEach((c, j) => {
  const B = X.load(`${name}.base${j}.png`), C = X.load(`${name}.out${j}.png`), m = minArea(dropKeyOutline(chromaMask(C, key), B, C, key), 64, 64, 2), L = despill(layerFrom(C, m), key);
  X.save(`${name}.layer${j}.png`, L);
  const g = groups[c.group] ??= { rows: [[], [], [], []], L: [], kept: [], top: [], btop: [] };
  g.rows[0].push(B); g.rows[1].push(C); g.rows[2].push(L); g.rows[3].push(over(B, L)); g.L.push(L); g.kept.push(keyKept(B, C, key, m).kept);
  g.top.push(bbox(L)?.y ?? null); g.btop.push(bbox(B).y);
});
const allRows = [];
for (const [gname, g] of Object.entries(groups)) {
  allRows.push(...g.rows);
  const anchors = g.L.map((_, i) => { const b = bbox(X.load(`${name}.base${cells.findIndex(c => c.group === gname) + i}.png`)); return [b.x + b.w / 2, b.y]; });
  // design lock across calls: mean distance (max-channel RGB) from each layer colour to the nearest reference-call colour
  const refPal = refL ? [...layerStats(refL).palette].map(c => [c >> 16, (c >> 8) & 255, c & 255]) : null;
  const pj = refPal ? +(g.L.reduce((a, L) => { const p = [...layerStats(L).palette]; return a + p.reduce((s, c) => s + paletteDist(refPal, c >> 16, (c >> 8) & 255, c & 255), 0) / (p.length || 1); }, 0) / g.L.length).toFixed(1) : null;
  table.push({ name, group: gname, cells: g.L.length, ...summarize(g.L, anchors), keyKept: +(g.kept.reduce((a, b) => a + b) / g.kept.length).toFixed(3), baseTopY: Math.min(...g.btop), layerTopY: Math.min(...g.top.filter(v => v != null)), clippedAtTop: g.top.filter(v => v === 0).length, palDistToRefCall: pj });
}
X.save(`${name}.final_sheet.png`, sheet(allRows, { s: 2 }));
console.table(table); fs.appendFileSync(`${X.dir}/x4_table.jsonl`, table.map(t => JSON.stringify(t)).join('\n') + '\n');
