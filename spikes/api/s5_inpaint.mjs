// S5 / H3: inpaint-v3 packed masked grid at the OVERSIZE cell (96) with a hand-side mask from the right-wrist keypoints.
// Grid 5×4 cells of 96 (480×384): cells 0-7 walk east f0-7, 8-15 slash east f0-7 (chroma key mannequin, padded 64→96),
// cells 16-18 = d96's dressed keyframes S/E/N as design anchors (mask black = preserved), cell 19 empty.
// Mask: disc of radius R around the right wrist (+ the cell's own key pixels stay key by prompt).
// usage: node --env-file=../../.env s5_inpaint.mjs [R=30] [seed=7]   -> out/s5_held/pose_inp96_<clip>_east_s<seed>_<i>.png
import fs from 'node:fs';
import { experiment, imagesOf } from './lib/run.mjs';
import { toB64, make, canvasTo } from './lib/img.mjs';
import { b64img } from './lib/api.mjs';
import { toChroma } from './lib/chroma.mjs';

const X = experiment('s5_held'), R = +(process.argv[2] || 30), seed = +(process.argv[3] || 7), C = 96, o = 16, COLS = 5, ROWS = 4;
const spent = fs.readFileSync(`${X.dir}/costs.jsonl`, 'utf8').trim().split('\n').map(l => JSON.parse(l)).reduce((s, c) => s + (c.gens || 0), 0);
if (spent + 15 > 200) { console.log('BUDGET STOP', spent); process.exit(2); }
const pad = im => canvasTo(im, C, C, o, o);
const req = clip => JSON.parse(fs.readFileSync(`${X.dir}/../s3_k1/${clip === 'walk' ? 'walk_east_v3tpl_s7' : 'slash_east_v3_s7'}.req.json`));
const cells = [], masks = [];
for (const clip of ['walk', 'slash']) for (let i = 0; i < 8; i++) {
  cells.push(toChroma(pad(X.load(`../s4_items/sk_east.base${(clip === 'slash' ? 8 : 0) + i}.png`)), 'green'));
  const w = req(clip).poses[i]['RIGHT ARM'], m = make(C, C);
  for (let y = 0; y < C; y++) for (let x = 0; x < C; x++) if (Math.hypot(x + 0.5 - (w.x + o), y + 0.5 - (w.y + o)) <= R) m.d.set([255, 255, 255, 255], (y * C + x) * 4);
  masks.push(m);
}
for (const d of ['south', 'east', 'north']) { cells.push(X.load(`dress_d96_${d}.png`)); masks.push(make(C, C)); }
const grid = ims => { const G = make(C * COLS, C * ROWS); ims.forEach((im, k) => { for (let y = 0; y < C; y++) G.d.set(im.d.subarray(y * C * 4, (y + 1) * C * 4), ((Math.floor(k / COLS) * C + y) * G.w + (k % COLS) * C) * 4); }); return G; };
const black = ims => { const G = grid(ims); for (let i = 0; i < G.d.length; i += 4) G.d[i + 3] = 255; return G; };
const G = grid(cells), M = black(masks);
X.save(`inp96_grid_in_R${R}.png`, G); X.save(`inp96_grid_mask_R${R}.png`, M);
const desc = `This image is a sprite sheet: a ${COLS}x${ROWS} grid of ${C}x${C} px frames of the same pixel art character, a solid bright green mannequin. The first sixteen frames (left to right, top to bottom) face east (side view, facing right): an 8-frame walk cycle, then an 8-frame overhead slash with the right arm. The next three frames (bottom row) show the reference design from the front, side and back: a steel longsword with a gold crossguard held in the right hand. The bright green colour is intentional (a chroma key) and must stay exactly the same bright green. Add the identical steel longsword to the right hand of every animation frame, gripped in the fist and following each frame's arm pose; exactly one sword per frame, no other weapons, no effects. Keep every other pixel, the poses, the outlines, the grid layout and the transparent background unchanged.`;
if (process.env.DRY) process.exit(0);
const t0 = Date.now();
const r = await X.api.run('/inpaint-v3', { inpainting_image: { image: b64img(toB64(G)), size: { width: G.w, height: G.h } }, mask_image: { image: b64img(toB64(M)), size: { width: M.w, height: M.h } }, description: desc, no_background: true, seed });
const out = (await imagesOf(r.jobs[0].last_response, { w: G.w, h: G.h }))[0].im;
X.save(`inp96_grid_out_R${R}_s${seed}.png`, out);
['walk', 'slash'].forEach((clip, c) => { for (let i = 0; i < 8; i++) { const k = c * 8 + i; X.save(`pose_inp96_${clip}_east_s${seed}_${i}.png`, canvasTo(out, C, C, -(k % COLS) * C, -Math.floor(k / COLS) * C)); } });
const gens = [r.jobs[0].usage].flat().reduce((s, x) => s + (x?.generations || 0), 0);
fs.appendFileSync(`${X.dir}/costs.jsonl`, JSON.stringify({ t: new Date().toISOString(), cmd: 'inpaint', tag: 'inp96', R, seed, size: `${out.w}x${out.h}`, ms: Date.now() - t0, gens, usage: r.jobs[0].usage }) + '\n');
console.log('done', gens, Date.now() - t0);
