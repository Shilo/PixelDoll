// S4/Q3: item-route challenge on the chroma mannequin. Newer-model alternatives vs edit-animation-v2 (S2 baseline).
// usage: node --env-file=../../.env s4_items.mjs <name> <item> <route> <src> [ref] [key=green]
//        node s4_items.mjs eval <name> <item> <src> [key]                     (offline re-eval)
//  src   = cell set prefix in out/, S2 x4 format: <src>.base{j}.png + <src>.cells.json (e.g. s2_x4/helmet48_A)
//  route = pfgrid    : pack all cells into one grid (4 cols) -> edit-image-pro-flash (text) -> unpack
//          pfinp     : same grid -> inpaint-image-pro-flash, mask = per-cell slot band (outside mask must stay exact)
//          pfref     : per cell edit-image-pro-flash method=reference, ref = dressed key cell of the same group from <ref> run
//          animpm|animv3 : raw /animate-pixminimax | /animate-with-text-v3 of <ref>'s dressed first cell of each group
//          ea2       : edit-animation-v2 (S2 recipe), or 'copy' = reuse an existing S2 run's outputs (no call)
import fs from 'node:fs';
import { experiment, imagesOf } from './lib/run.mjs';
import { toB64, over, make, bbox, canvasTo } from './lib/img.mjs';
import { b64img } from './lib/api.mjs';
import { layerFrom, layerStats, paletteDist } from './lib/diff.mjs';
import { dropKeyOutline, toChroma, chromaMask, keyKept, keyOutside, despill, chromaPrompt, NAME, WHAT, KEY } from './lib/chroma.mjs';
import { minArea } from './lib/clean.mjs';
import { summarize } from './s2_x1_eval.mjs';
import { sheet } from './lib/sheet.mjs';

const X = experiment('s4_items');
const args = process.argv.slice(2), offline = args[0] === 'eval';
const [name, item, route, src, ref, key = 'green'] = offline ? [args[1], args[2], 'eval', args[3], null, args[4] || 'green'] : args;
const W = 64, COLS = 4;
const cells = JSON.parse(fs.readFileSync(`${X.dir}/../${src}.cells.json`));
const B = cells.map((_, j) => X.load(`../${src}.base${j}.png`)), K = B.map(b => toChroma(b, key));
const groups = [...new Set(cells.map(c => c.group))];
const dirOf = g => g.replace(/^.*?_?(south|east|north|west).*$/, '$1');
const sz = { width: W, height: W };

// grid pack/unpack (row-major, COLS per row); no resampling. Gutter layout (routes ending in 'g'): crop each cell to
// x 4..60, y 6..64 and leave 8 px transparent gutters -> 248x256 for 16 cells (S4 saw bleed across touching 64 px cells).
const GUT = /^pf(grid|inp)g$/.test(route) || (offline && fs.existsSync(`${X.dir}/${name}.gutter`));
const LY = GUT ? { cx: 4, cy: 6, cw: 56, ch: 58, g: 8 } : { cx: 0, cy: 0, cw: W, ch: W, g: 0 };
const cellXY = j => [(j % COLS) * (LY.cw + LY.g), (j / COLS | 0) * (LY.ch + LY.g)];
const gridOf = ims => { const rows = Math.ceil(ims.length / COLS), G = make(COLS * LY.cw + (COLS - 1) * LY.g, rows * LY.ch + (rows - 1) * LY.g); ims.forEach((im, j) => { const [gx, gy] = cellXY(j); for (let y = 0; y < LY.ch; y++) G.d.set(im.d.subarray(((LY.cy + y) * W + LY.cx) * 4, ((LY.cy + y) * W + LY.cx + LY.cw) * 4), ((gy + y) * G.w + gx) * 4); }); return G; };
const unpack = (G, n) => [...Array(n).keys()].map(j => { const o = make(W, W), [gx, gy] = cellXY(j); for (let y = 0; y < LY.ch; y++) o.d.set(G.d.subarray(((gy + y) * G.w + gx) * 4, ((gy + y) * G.w + gx + LY.cw) * 4), ((LY.cy + y) * W + LY.cx) * 4); return o; });

// slot masks per cell (white = generate). Bands from the base silhouette bbox (48 px figure padded into 64).
function slotMask(b) {
  const bb = bbox(b), m = new Uint8Array(W * W), headH = Math.round(bb.h * 0.30);
  for (let y = 0; y < W; y++) for (let x = 0; x < W; x++) {
    const inX = x >= bb.x - 6 && x < bb.x + bb.w + 6;
    const ok = item === 'helmet' || item === 'wizardhat' || item === 'hair' ? inX && y >= Math.max(0, bb.y - (item === 'wizardhat' ? 16 : 6)) && y < bb.y + headH
      : item === 'cape' ? inX && y >= bb.y + Math.round(bb.h * 0.2) - 2 && y < bb.y + bb.h + 2
      : item === 'chest' ? inX && y >= bb.y + Math.round(bb.h * 0.2) - 2 && y < bb.y + Math.round(bb.h * 0.62)
      : item === 'boots' ? inX && y >= bb.y + Math.round(bb.h * 0.68)
      : true; // held / unknown: whole cell
    if (ok) m[y * W + x] = 1;
  }
  return m;
}
const maskImg = (masks) => { const G = gridOf(masks.map(m => { const o = make(W, W); for (let p = 0; p < m.length; p++) { const v = m[p] ? 255 : 0; o.d.set([v, v, v, 255], p * 4); } return o; })); return G; };

const dirsNote = `Cells in order: ${groups.map(g => `${cells.filter(c => c.group === g).length} cells ${/slash/.test(g) ? 'of a right-arm slash attack' : 'walking'} facing ${dirOf(g)}`).join(', ')}. `;
const gridPrompt = n => `This image is a sprite sheet: a ${COLS}x${Math.ceil(n / COLS)} grid of ${n} animation frames (${GUT ? 'separated by transparent gutters' : `each ${W}x${W} px`}) of the same pixel art character, a solid ${NAME[key]} mannequin. ${dirsNote.replace('Cells', 'Frames, left to right then top to bottom,')}The ${NAME[key]} colour is intentional (a chroma key) and must stay exactly the same ${NAME[key]} in every frame. Add only ${WHAT[item]} to the character in EVERY frame, drawn in its own natural colours (no ${NAME[key]} on the item), with the identical design, size and colours in all frames, following each frame's pose. Keep every other pixel, the poses, the outlines, the grid layout and the transparent background unchanged.`;

let outs, meta = { name, item, route, src, ref, key, cells: cells.length }, t0 = Date.now(), usage = [];
const job = async (path, body) => { const r = await X.api.run(path, body); usage.push(r.jobs[0]?.usage ?? r.res?.usage); return r; };
const firstImg = async r => (await imagesOf(r.jobs[0].last_response, sz))[0].im;
if (!offline) {
  K.forEach((k, j) => X.save(`${name}.key${j}.png`, k));
  if (route === 'copy') { outs = cells.map((_, j) => X.load(`../${ref}.out${j}.png`)); meta.copiedFrom = ref; }
  else if (route === 'ea2') {
    const r = await job('/edit-animation-v2', { description: chromaPrompt(item, key, dirsNote), frames: K.map(k => ({ image: b64img(toB64(k)), size: sz })), image_size: sz, no_background: true, seed: 7 });
    outs = (await imagesOf(r.jobs[0].last_response, sz)).map(x => x.im);
  } else if (route === 'eiv2') { // Pro batch editor #2: edit-images-v2 edit_with_text (same 4x4 grid limit as ea2)
    const r = await job('/edit-images-v2', { method: 'edit_with_text', edit_images: K.map(k => ({ image: b64img(toB64(k)), width: W, height: W })), image_size: sz, description: chromaPrompt(item, key, dirsNote), no_background: true, seed: 7 });
    outs = (await imagesOf(r.jobs[0].last_response, sz)).map(x => x.im);
  } else if (/^(pf(grid|inp)g?|inv3|pixen)$/.test(route)) {
    if (GUT) fs.writeFileSync(`${X.dir}/${name}.gutter`, '1');
    const G = gridOf(K); X.save(`${name}.grid_in.png`, G); meta.grid = `${G.w}x${G.h}`;
    let r;
    if (route === 'pixen') r = await job('/edit-image-pixen', { image: b64img(toB64(G)), description: `Sprite sheet grid of ${K.length} animation frames of one solid bright green chroma-key mannequin; keep the green exactly. Add only ${WHAT[item]} in its own natural colours to every frame, identical design. Keep poses, outlines, grid and transparent background unchanged.`.slice(0, 500), no_background: true, seed: 7 });
    else if (route === 'inv3') { const M = maskImg(B.map(slotMask)); X.save(`${name}.grid_mask.png`, M); r = await job('/inpaint-v3', { inpainting_image: { image: b64img(toB64(G)), size: { width: G.w, height: G.h } }, mask_image: { image: b64img(toB64(M)), size: { width: M.w, height: M.h } }, description: gridPrompt(K.length), no_background: true, seed: 7 }); }
    else if (route.startsWith('pfgrid')) r = await job('/edit-image-pro-flash', { image: b64img(toB64(G)), method: 'text', description: gridPrompt(K.length), no_background: true, seed: 7 });
    else { const masks = B.map(slotMask), M = maskImg(masks); X.save(`${name}.grid_mask.png`, M); r = await job('/inpaint-image-pro-flash', { image: b64img(toB64(G)), mask_image: b64img(toB64(M)), description: gridPrompt(K.length), no_background: true, output_method: 'Modify current layer', seed: 7 }); }
    X.saveJson(`${name}.job.json`, r.jobs[0]);
    const O = await firstImg(r); X.save(`${name}.grid_out.png`, O); meta.gridOut = `${O.w}x${O.h}`;
    outs = unpack(O.w === G.w && O.h === G.h ? O : canvasTo(O, G.w, G.h), K.length);
  } else if (route === 'pfref') {
    // reference = the ref run's dressed key cell for this cell's group (its first cell); that cell is reused as-is
    const first = Object.fromEntries(groups.map(g => [g, cells.findIndex(c => c.group === g)]));
    outs = await Promise.all(cells.map(async (c, j) => {
      const R = X.load(`../${ref}.out${first[c.group]}.png`);
      if (j === first[c.group]) return R;
      const r = await job('/edit-image-pro-flash', { image: b64img(toB64(K[j])), method: 'reference', reference_image: b64img(toB64(R)), description: `${chromaPrompt(item, key, `Copy exactly the ${item} worn in the reference image (same design, colours and size) onto this frame, following its pose. `)}`, no_background: true, seed: 7 });
      return firstImg(r);
    }));
  } else if (route === 'animpm' || route === 'animv3') {
    // animate the dressed first cell of each group; frames are NOT the base frames -> alignment measured against all base cells
    outs = [];
    for (const g of groups) {
      const idx = cells.map((c, j) => c.group === g ? j : -1).filter(j => j >= 0), D = X.load(`../${ref}.out${idx[0]}.png`), n = idx.length;
      const desc = `walking in place facing ${dirOf(g)}, a natural looping walk cycle; start moving on the first frame`;
      const r = route === 'animpm'
        ? await job('/animate-pixminimax', { first_frame: b64img(toB64(D)), description: desc, frame_count: n, seed: 7, no_background: true, direction: dirOf(g), view: 'low top-down', subject_description: `a solid bright green mannequin wearing ${WHAT[item]}`, initial_pose: 'mid-walk' })
        : await job('/animate-with-text-v3', { first_frame: b64img(toB64(D)), action: desc, frame_count: n, seed: 7, no_background: true });
      const ims = (await imagesOf(r.jobs[0].last_response, sz)).map(x => x.im); meta[`returned_${g}`] = ims.length;
      outs.push(D, ...ims.slice(2, n + 1)); // frame0 = our dressed cell, then generated frames 2..n (index 1 ~ first generated)
    }
  }
  outs.forEach((o, j) => X.save(`${name}.out${j}.png`, o.w === W ? o : canvasTo(o, W, W)));
  meta.ms = Date.now() - t0; meta.usage = usage; meta.calls = usage.length;
  fs.appendFileSync(`${X.dir}/costs.jsonl`, JSON.stringify(meta) + '\n'); console.log('COST', JSON.stringify(meta));
}
// ---- eval ----
const C = cells.map((_, j) => X.load(`${name}.out${j}.png`));
const isInp = fs.existsSync(`${X.dir}/${name}.grid_mask.png`), masks = isInp ? B.map(slotMask) : null;
const per = cells.map((c, j) => {
  const m = minArea(dropKeyOutline(chromaMask(C[j], key), B[j], C[j], key), W, W, 2), L = despill(layerFrom(C[j], m), key);
  X.save(`${name}.layer${j}.png`, L);
  // exactness outside the inpaint mask (vs the key cell we sent)
  let ex = null; if (masks) { let n = 0, s = 0; for (let p = 0; p < W * W; p++) if (!masks[j][p]) { n++; const i = p * 4; if ([0, 1, 2, 3].every(k => C[j].d[i + k] === K[j].d[i + k]) || (!C[j].d[i + 3] && !K[j].d[i + 3])) s++; } ex = +(s / n).toFixed(4); }
  // silhouette alignment: IoU of the composite's opaque px vs the base alpha (best over all base cells of this group for anim routes)
  const iou = (A, Bb) => { let i = 0, u = 0; for (let p = 3; p < A.d.length; p += 4) { const a = A.d[p] >= 128, b = Bb.d[p] > 0; if (a && b) i++; if (a || b) u++; } return u ? i / u : 1; };
  const keyOnly = make(W, W); for (let p = 0; p < W * W; p++) if (C[j].d[p * 4 + 3] >= 128 && KEY[key](C[j].d[p * 4], C[j].d[p * 4 + 1], C[j].d[p * 4 + 2]) >= 35) keyOnly.d[p * 4 + 3] = 255;
  const own = iou(keyOnly, B[j]), best = Math.max(...cells.map((cc, k) => cc.group === c.group ? iou(keyOnly, B[k]) : 0));
  return { L, kept: keyKept(B[j], C[j], key, m).kept, outside: keyOutside(B[j], C[j], key), exactOut: ex, iouOwn: own, iouBest: best };
});
const table = [], rows = [], refPal = {};
for (const g of groups) {
  const idx = cells.map((c, j) => c.group === g ? j : -1).filter(j => j >= 0), Ls = idx.map(j => per[j].L);
  rows.push(idx.map(j => B[j]), idx.map(j => C[j]), Ls, idx.map(j => over(B[j], per[j].L)));
  const anchors = idx.map(j => { const b = bbox(B[j]); return [b.x + b.w / 2, b.y]; });
  const pal0 = [...layerStats(Ls[0]).palette].map(c => [c >> 16, (c >> 8) & 255, c & 255]); refPal[g] = pal0;
  const pd = Ls.slice(1).map(L => { const p = [...layerStats(L).palette]; return p.reduce((s, c) => s + paletteDist(pal0, c >> 16, (c >> 8) & 255, c & 255), 0) / (p.length || 1); });
  const avg = k => +(idx.reduce((s, j) => s + (per[j][k] ?? 0), 0) / idx.length).toFixed(3);
  table.push({ name, group: dirOf(g), n: idx.length, ...summarize(Ls, anchors), keyKept: avg('kept'), keyOutside: avg('outside'), exactOutMask: masks ? avg('exactOut') : null, iouOwn: avg('iouOwn'), iouBest: avg('iouBest'), palDistToCell0: +(pd.reduce((a, b) => a + b, 0) / (pd.length || 1)).toFixed(1), emptyCells: Ls.filter(L => !bbox(L)).length });
}
if (groups.length > 1) { // cross-direction design lock: palette distance group1 cell0 -> group0 cell0
  const [g0, g1] = groups; table[1].palDistToOtherDir = +(refPal[g1].reduce((s, c) => s + paletteDist(refPal[g0], ...c), 0) / (refPal[g1].length || 1)).toFixed(1);
}
X.save(`${name}.final_sheet.png`, sheet(rows, { s: 3 }));
console.table(table); fs.appendFileSync(`${X.dir}/table.jsonl`, table.map(t => JSON.stringify(t)).join('\n') + '\n');
