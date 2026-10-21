// S3/K2+K3: S2 chroma-mannequin item route on the NEW clips, with a cross-call anchor cell from the S2 walk design call.
// usage: node --env-file=../../.env s3_k2.mjs <run> <item> <variant> <dir> <clipSpec>
//   item: sword | helmet ; variant: v0 (S2 prompt) | v1 (image-side hand phrasing) | v2 (magenta hand mark) | v3 (v1+v2)
//   clipSpec: comma list of  k1:<s3_k1 clip name>  |  punch  (S2 cross-punch template frames of <dir>)
//   anchor = S2 X4 <item>48_A dressed key cell (walk south cell 0 / walk east cell 8; north: <item>48_Ba cell 0). Output 0 (anchor) is dropped.
//        node s3_k2.mjs eval <run>   (offline)
import fs from 'node:fs';
import { experiment } from './lib/run.mjs';
import { toB64, fromB64, canvasTo, over } from './lib/img.mjs';
import { b64img } from './lib/api.mjs';
import { toChroma, chromaMask, dropKeyOutline, despill, keyKept, keyOutside, KEY, NAME } from './lib/chroma.mjs';
import { layerFrom } from './lib/diff.mjs';
import { minArea } from './lib/clean.mjs';
import { fromApi, mid, HEAD, gripSide } from './lib/skel.mjs';
import { sheet } from './lib/sheet.mjs';

const X = experiment('s3_k2');
const skel = () => JSON.parse(fs.readFileSync(`${X.dir}/../s3_skel/skel.json`));
const pad = B => B.w === 48 ? canvasTo(B, 64, 64, 8, 16) : B;
const MARK = [255, 0, 255]; // hand mark colour on the green mannequin: separable by a second (magenta) key test
const R_MARK = 2.5;
const ITEM = {
  sword: { v0: 'a steel longsword with a brown leather grip', side: "a steel longsword with a brown leather grip, gripped in the character's RIGHT hand (the swinging hand)" },
  helmet: { v0: 'a simple grey steel knight helmet covering the top and sides of the head, face visible' },
};
const SIDE = { south: "Facing south (front view) the character's right hand is on the viewer's LEFT side of the image.", east: "Facing east (side view) the character's right hand is the near hand, in front of the body.", north: "Facing north (back view) the character's right hand is on the viewer's RIGHT side of the image." };

if (process.argv[2] !== 'eval') {
  const [run, item, variant, dir, clipSpec] = process.argv.slice(2), db = skel();
  const cells = [];
  for (const c of clipSpec.split(',')) {
    if (c === 'punch') for (let i = 0; fs.existsSync(`${X.dir}/../s2_base/b48punch_${dir}_${i}.png`); i++) cells.push({ id: `punch_${dir}_${i}`, clip: 'cross-punch', B: pad(X.load(`../s2_base/b48punch_${dir}_${i}.png`)), sk: `punch_${dir}_${i}` });
    else { const n = c.slice(3); for (let i = 0; fs.existsSync(`${X.dir}/../s3_k1/${n}_${i}.png`); i++) cells.push({ id: `${n}_${i}`, clip: n.split('_')[0], B: X.load(`../s3_k1/${n}_${i}.png`), sk: `s3_k1/${n}_${i}` }); }
  }
  if (cells.length > 15) throw new Error(`${cells.length} cells > 15 (+anchor)`);
  const mark = variant === 'v2' || variant === 'v3';
  const K = cells.map(c => {
    const k = toChroma(c.B, 'green');
    if (mark) { const h = fromApi(db[c.sk].kps, 64, 64)['RIGHT ARM']; c.hand = h; for (let y = 0; y < 64; y++) for (let x = 0; x < 64; x++) if (c.B.d[(y * 64 + x) * 4 + 3] && Math.hypot(x + 0.5 - h.x, y + 0.5 - h.y) <= R_MARK) k.d.set(MARK, (y * 64 + x) * 4); }
    return k;
  });
  const anchor = X.load(dir === "north" ? `../s2_x4/${item}48_Ba.out0.png` : `../s2_x4/${item}48_A.out${dir === "east" ? 8 : 0}.png`); // north anchor = S2 anchor-cell north walk call
  const what = (variant === 'v0' || variant === 'v2' || !ITEM[item].side) ? ITEM[item].v0 : ITEM[item].side;
  const clipsNote = [...new Set(cells.map(c => c.clip))].map(cl => `${cells.filter(c => c.clip === cl).length} frames of a ${cl} animation`).join(', then ');
  const desc = [
    `This pixel art character is a solid ${NAME.green} mannequin. The ${NAME.green} colour is intentional (a chroma key) and must stay exactly the same ${NAME.green} in every frame.`,
    `Frame 1 already wears ${what}: copy exactly that design, colours and size onto the other frames.`,
    `Add only ${what}, drawn in its own natural colours (no ${NAME.green} on the item), identical design in all frames.`,
    variant === 'v1' || variant === 'v3' ? SIDE[dir] + (item === 'sword' ? ' The sword stays in that same right hand in every frame and follows it as the arm swings.' : '') : '',
    mark ? 'In frames 2 and later a small bright magenta patch marks the right hand: that hand grips the sword. Draw the grip over the magenta patch; magenta is never part of the sword.' : '',
    `Frames 2 onward, all facing ${dir}: ${clipsNote}. Keep every other pixel, the pose, the outline and the transparent background unchanged.`,
  ].filter(Boolean).join(' ');
  const t0 = Date.now(), fr = F => ({ image: b64img(toB64(F)), size: { width: 64, height: 64 } });
  const r = await X.api.run('/edit-animation-v2', { description: desc, frames: [fr(anchor), ...K.map(fr)], image_size: { width: 64, height: 64 }, no_background: true, seed: 7 });
  const outs = r.jobs[0].last_response.images.map(a => fromB64(a.base64)).slice(1);
  cells.forEach((c, j) => { X.save(`${run}.base${j}.png`, c.B); X.save(`${run}.key${j}.png`, K[j]); X.save(`${run}.out${j}.png`, outs[j]); });
  fs.writeFileSync(`${X.dir}/${run}.json`, JSON.stringify({ run, item, variant, dir, desc, cells: cells.map(c => ({ id: c.id, clip: c.clip, sk: c.sk, hand: c.hand })) }, null, 1));
  const cost = { run, item, variant, dir, cells: cells.length, ms: Date.now() - t0, usage: r.jobs[0].usage };
  fs.appendFileSync(`${X.dir}/costs.jsonl`, JSON.stringify(cost) + '\n'); console.log('COST', JSON.stringify(cost));
}

// ---------- eval (K4 QA metrics on the extracted layers) ----------
const runName = process.argv[2] === 'eval' ? process.argv[3] : process.argv[2];
const meta = JSON.parse(fs.readFileSync(`${X.dir}/${runName}.json`)), db = skel();
const isMarkKey = (r, g, b) => KEY.magenta(r, g, b) >= 35;
const rows = [[], [], [], []], per = [];
meta.cells.forEach((c, j) => {
  const B = X.load(`${runName}.base${j}.png`), C = X.load(`${runName}.out${j}.png`);
  let m = minArea(dropKeyOutline(chromaMask(C, 'green'), B, C, 'green'), 64, 64, 2);
  if (meta.variant === 'v2' || meta.variant === 'v3') for (let p = 0; p < m.length; p++) if (m[p] && isMarkKey(C.d[p * 4], C.d[p * 4 + 1], C.d[p * 4 + 2])) m[p] = 0; // mark is key, not item
  const L = despill(layerFrom(C, m), 'green'); X.save(`${runName}.layer${j}.png`, L);
  const P = fromApi(db[c.sk].kps, 64, 64);
  // QA: distances from item pixels to hand keypoints (sword) / head centring (helmet)
  const px = []; for (let p = 0; p < m.length; p++) if (L.d[p * 4 + 3]) px.push([p % 64 + 0.5, ((p / 64) | 0) + 0.5]);
  const dmin = k => px.length ? Math.min(...px.map(([x, y]) => Math.hypot(x - P[k].x, y - P[k].y))) : 99;
  const markLeft = meta.variant === 'v2' || meta.variant === 'v3' ? (() => { let n = 0; for (let i = 0; i < C.d.length; i += 4) if (C.d[i + 3] > 127 && isMarkKey(C.d[i], C.d[i + 1], C.d[i + 2])) n++; return n; })() : null;
  const head = mid(P, HEAD), cx = px.length ? px.reduce((a, [x]) => a + x, 0) / px.length : null;
  per.push({ id: c.id, clip: c.clip, area: px.length, dR: +dmin('RIGHT ARM').toFixed(1), dL: +dmin('LEFT ARM').toFixed(1), side: gripSide(dmin('RIGHT ARM'), dmin('LEFT ARM'), Math.hypot(P['RIGHT ARM'].x - P['LEFT ARM'].x, P['RIGHT ARM'].y - P['LEFT ARM'].y)), keyKept: keyKept(B, C, 'green', m).kept, keyOut: keyOutside(B, C, 'green'), markPx: markLeft, helmetDx: meta.item === 'helmet' && cx != null ? +(cx - head.x).toFixed(1) : null, helmetTop: meta.item === 'helmet' && px.length ? Math.min(...px.map(p => p[1])) : null, eyeY: +mid(P, ['RIGHT EYE', 'LEFT EYE']).y.toFixed(1) });
  rows[0].push(B); rows[1].push(C); rows[2].push(L); rows[3].push(over(B, L));
});
// held-item handedness gate (lib/skel gripSide): grip within 6 px of a wrist keypoint, nearer the right one
const clips = [...new Set(per.map(p => p.clip))].map(cl => { const ps = per.filter(p => p.clip === cl), areas = ps.map(p => p.area), mean = areas.reduce((a, b) => a + b, 0) / areas.length, sd = Math.sqrt(areas.reduce((a, b) => a + (b - mean) ** 2, 0) / areas.length);
  return { run: runName, item: meta.item, variant: meta.variant, dir: meta.dir, clip: cl, n: ps.length, meanArea: Math.round(mean), areaCV: +(sd / (mean || 1)).toFixed(2), grip_R_L_amb_none: meta.item === 'sword' ? ['R', 'L', 'amb', 'none'].map(k => ps.filter(p => p.side === k).length).join('/') : null, missing: ps.filter(p => p.area < 0.5 * mean).length, keyKept: +(ps.reduce((a, p) => a + p.keyKept, 0) / ps.length).toFixed(3), keyOut: Math.max(...ps.map(p => p.keyOut)), markPxLeft: meta.variant === 'v2' || meta.variant === 'v3' ? ps.reduce((a, p) => a + p.markPx, 0) : null, helmetDxMax: meta.item === 'helmet' ? Math.max(...ps.map(p => Math.abs(p.helmetDx ?? 0))) : null }; });
X.save(`${runName}.final_sheet.png`, sheet(rows, { s: 3 }));
fs.writeFileSync(`${X.dir}/${runName}.qa.json`, JSON.stringify({ clips, per }, null, 1));
console.table(clips);
fs.appendFileSync(`${X.dir}/qa_table.jsonl`, clips.map(c => JSON.stringify(c)).join('\n') + '\n');
