// S5: held items (sword) on the skeleton-pose route, with an OVERSIZE canvas (H1) and pose-friendly dressing (H2).
// Base = S3/S4 raw skeleton-v3 walk + slash S/E/N on the 64 rig (out/s4_items/sk_<dir>.base0-15, rest = out/s3_k6/rot_base_*).
// Oversize: every 64 frame is padded to C×C around the same pivot (offset o = (C-64)/2 on both axes); keypoints shift by o.
// usage: node --env-file=../../.env s5_held.mjs dress <tag> <C> <promptKey> [seed]
//        node --env-file=../../.env s5_held.mjs pose  <tag> <C> <clips csv> <dirs csv> [seed]
//        node s5_held.mjs eval <tag> <C> [seed]          (offline; tag "s4" = S4's 64 px skel_ea2 sword as control)
import fs from 'node:fs';
import { experiment, imagesOf } from './lib/run.mjs';
import { toB64, over, make, canvasTo, clone } from './lib/img.mjs';
import { b64img } from './lib/api.mjs';
import { layerFrom, layerStats, paletteDist, components } from './lib/diff.mjs';
import { dropKeyOutline, toChroma, chromaMask, keyKept, keyOutside, despill } from './lib/chroma.mjs';
import { minArea } from './lib/clean.mjs';
import { toApi, gripSide } from './lib/skel.mjs';
import { sheet } from './lib/sheet.mjs';

const X = experiment('s5_held');
const [cmd, tag, cArg, a3, a4, a5] = process.argv.slice(2);
const C = +cArg || 64, o = (C - 64) / 2, DIRS = ['south', 'east', 'north'], CLIPS = ['walk', 'slash'];
const CAP = 200; // hard budget (gens) for S5
const spent = () => fs.existsSync(`${X.dir}/costs.jsonl`) ? fs.readFileSync(`${X.dir}/costs.jsonl`, 'utf8').trim().split('\n').filter(Boolean).map(l => JSON.parse(l)).reduce((s, c) => s + (c.gens || 0), 0) : 0;
const guard = est => { const s = spent(); if (s + est > CAP) { console.log(`BUDGET STOP: spent ${s} + ${est} > ${CAP}`); process.exit(2); } console.log(`budget: spent ${s}, this call ~${est}`); };
const log = c => { fs.appendFileSync(`${X.dir}/costs.jsonl`, JSON.stringify({ t: new Date().toISOString(), ...c }) + '\n'); console.log('COST', JSON.stringify(c)); };
const gensOf = u => [u].flat().reduce((s, x) => s + (x?.generations || 0), 0);

const pad = im => im.w === C ? im : canvasTo(im, C, C, (C - im.w) / 2, (C - im.h) / 2);
const req = (clip, d) => JSON.parse(fs.readFileSync(`${X.dir}/../s3_k1/${clip === 'walk' ? `walk_${d}_v3tpl_s7` : `slash_${d}_v3_s7`}.req.json`));
const sh = p => Object.fromEntries(Object.entries(p).map(([l, k]) => [l, { ...k, x: k.x + o, y: k.y + o }]));
const restBase = d => pad(X.load(`../s3_k6/rot_base_${d}.png`));
const baseCell = (d, clip, i) => pad(X.load(`../s4_items/sk_${d}.base${(clip === 'slash' ? 8 : 0) + i}.png`));

const SWORD = {
  down: "a steel longsword held in the character's right hand, blade pointing down and slightly outward",
  axe: "a steel battle axe with a wooden handle held in the character's right hand, the handle pointing down and slightly outward, the axe head at the bottom end",
  up: "a steel longsword held upright in the character's right hand, the grip in the fist and the blade pointing straight up",
};
// S5_ACT=grip: action wording variant; S5_DRESS=<tag>: pose another tag's dressed keyframes (re-rolls / variants under a new tag)
const ACTION = { walk: 'walking', slash: process.env.S5_ACT === 'grip' ? 'overhead slash attack with the right arm, the sword stays gripped in the right hand in every frame' : 'overhead slash attack with the right arm' };
const DTAG = process.env.S5_DRESS || tag, ROT = !!process.env.S5_ROT; // S5_ROT=1: send frame 0 LAST (tests whether the f0 sword loss is positional)
const ONE = process.env.S5_ONE === 'weapon' ? 'exactly one held weapon, no other weapons, no scabbard, no shield' : 'exactly one sword, no other weapons, no scabbard, no shield'; // S5_ONE=weapon for non-sword items (the a96 dress call still used the sword wording)
const dressPrompt = k => `This pixel art character is a solid bright green mannequin. The bright green colour is intentional (a chroma key) and must stay exactly the same bright green in every frame. Add only ${SWORD[k]}, drawn in its own natural colours (no green on the item), identical design in all frames; ${ONE}. Frame 1 faces south (front view), frame 2 faces east (side view, facing right), frame 3 faces north (back view). Keep every other pixel, the pose, the outline, the arms and the transparent background unchanged.`;
const meta = () => JSON.parse(fs.readFileSync(`${X.dir}/dress_${DTAG}.json`, 'utf8'));

// file names; tag "s4" reads S4's control run (64 px, seed 7)
const dressFile = d => tag === 's4' ? `../s4_q3e/dress_ea2_sword_${d}.png` : `dress_${DTAG}_${d}.png`;
const poseFile = (clip, d, seed, i) => tag === 's4' ? `../s4_q3e/pose_ea2_sword_${clip}_${d}_${i}.png` : `pose_${tag}_${clip}_${d}_s${seed}_${i}.png`;

if (cmd === 'dress') {
  const k = a3, seed = +a4 || 7; guard(10);
  const K = DIRS.map(d => toChroma(restBase(d), 'green')), t0 = Date.now();
  const r = await X.api.run('/edit-animation-v2', { description: dressPrompt(k), frames: K.map(im => ({ image: b64img(toB64(im)), size: { width: C, height: C } })), image_size: { width: C, height: C }, no_background: true, seed });
  const D = (await imagesOf(r.jobs[0].last_response, { w: C, h: C })).map(x => x.im).slice(0, 3);
  D.forEach((im, j) => X.save(`dress_${tag}_${DIRS[j]}.png`, im));
  fs.writeFileSync(`${X.dir}/dress_${tag}.json`, JSON.stringify({ C, prompt: k, seed }));
  const Bs = DIRS.map(restBase), Ls = D.map((Cc, j) => despill(layerFrom(Cc, minArea(dropKeyOutline(chromaMask(Cc), Bs[j], Cc), C, C, 2))));
  X.save(`dress_${tag}.sheet.png`, sheet([Bs, D, Ls, Ls.map((L, j) => over(Bs[j], L))], { s: 4 }));
  log({ cmd, tag, C, k, seed, sizes: D.map(d => `${d.w}x${d.h}`), ms: Date.now() - t0, gens: gensOf(r.jobs[0].usage), keyKept: D.map((Cc, j) => keyKept(Bs[j], Cc, 'green', chromaMask(Cc)).kept), keyOutside: D.map((Cc, j) => keyOutside(Bs[j], Cc)) });
} else if (cmd === 'pose') {
  const clips = a3.split(','), dirs = a4.split(','), seed = +a5 || 7, k = meta().prompt; guard(3 * clips.length * dirs.length);
  await Promise.all(dirs.flatMap(d => clips.map(async clip => {
    const { rest, poses } = req(clip, d), F = X.load(dressFile(d)), t1 = Date.now();
    let r; try {
      r = await X.api.run('/animate-with-skeleton-v3', { description: `solid bright green mannequin (chroma key colour) with ${SWORD[k]}; ${ONE}`, action: ACTION[clip], direction: d, view: 'low top-down', first_frame: b64img(toB64(F)), first_frame_keypoints: toApi(sh(rest), C, C, false), keypoints: (ROT ? [...poses.slice(1), poses[0]] : poses).map(p => toApi(sh(p), C, C, false)), seed, no_background: true });
    } catch (e) { log({ cmd, tag, clip, d, seed, error: String(e).slice(0, 300), gens: 0 }); return; }
    let ims = (await imagesOf(r.jobs[0].last_response.images)).map(f => f.im);
    if (ROT) ims = [ims[7], ...ims.slice(0, 7)]; // undo the rotation: frame 0 was sent last
    ims.forEach((im, i) => X.save(poseFile(clip, d, seed, i), pad(im)));
    log({ cmd, tag, dress: DTAG, act: process.env.S5_ACT || '', rot: ROT, C, clip, d, seed, n: ims.length, size: `${ims[0].w}x${ims[0].h}`, ms: Date.now() - t1, gens: gensOf(r.jobs[0].usage) });
  })));
} else if (cmd === 'repair') {
  // Free local repair for frames whose pose ~= the rest pose (mean joint distance <= 1 px) but whose item came back (nearly)
  // empty (< 50 % of the clip median): paste the dressed keyframe's layer, shifted by the rounded right-wrist delta, over
  // that frame's chroma base. Writes a full copy under tag <tag>fix (eval it with S5_DRESS=<tag>).
  const seed = a3 || '7', fixed = [];
  const layerOf = (F, B) => despill(layerFrom(F, minArea(dropKeyOutline(chromaMask(F), B, F), C, C, 2)));
  for (const d of DIRS) for (const clip of CLIPS) {
    if (!fs.existsSync(`${X.dir}/${poseFile(clip, d, seed, 7)}`)) continue;
    const { rest, poses } = req(clip, d), K = layerOf(pad(X.load(dressFile(d))), restBase(d));
    const Fs = [...Array(8).keys()].map(i => X.load(poseFile(clip, d, seed, i))), areas = Fs.map((F, i) => layerStats(layerOf(F, baseCell(d, clip, i))).area), med = [...areas].sort((x, y) => x - y)[4];
    Fs.forEach((F, i) => {
      const near = Object.keys(rest).reduce((s, l) => s + Math.hypot(rest[l].x - poses[i][l].x, rest[l].y - poses[i][l].y), 0) / Object.keys(rest).length;
      let out = F;
      if (near <= 1 && areas[i] < 0.5 * med) {
        const dx = Math.round(poses[i]['RIGHT ARM'].x - rest['RIGHT ARM'].x), dy = Math.round(poses[i]['RIGHT ARM'].y - rest['RIGHT ARM'].y);
        out = over(toChroma(baseCell(d, clip, i), 'green'), canvasTo(K, C, C, dx, dy)); fixed.push({ clip, d, i, near: +near.toFixed(2), dx, dy, area: areas[i], med });
      }
      X.save(`pose_${tag}fix_${clip}_${d}_s${seed}_${i}.png`, out);
    });
  }
  console.log('repaired', JSON.stringify(fixed));
} else if (cmd === 'eval') {
  const seedArg = a3 || '7', table = [], rows = [], layersOut = {};
  const keyL = {}; // dressed keyframe layers per dir (design reference)
  for (const d of DIRS) { const B = restBase(d), D = pad(X.load(dressFile(d))); keyL[d] = despill(layerFrom(D, minArea(dropKeyOutline(chromaMask(D), B, D), C, C, 2))); }
  const palOf = L => { const s = new Map(); for (let i = 0; i < L.d.length; i += 4) if (L.d[i + 3]) s.set((L.d[i] << 16) | (L.d[i + 1] << 8) | L.d[i + 2], [L.d[i], L.d[i + 1], L.d[i + 2]]); return [...s.values()]; };
  for (const d of DIRS) for (const clip of CLIPS) {
    const seed = seedArg.includes(':') ? (seedArg.split(',').find(s => s.startsWith(`${clip}_${d}:`)) || ':7').split(':')[1] : seedArg;
    if (!fs.existsSync(`${X.dir}/${poseFile(clip, d, seed, 7)}`)) continue;
    const { poses } = req(clip, d), refPal = palOf(keyL[d]), per = [], masks = [], comp = [];
    for (let i = 0; i < 8; i++) {
      const B = baseCell(d, clip, i); let F = X.load(poseFile(clip, d, seed, i));
      // stray filter (M3 rule): drop opaque components < max(4 px, 15 % of the largest)
      const op = new Uint8Array(C * C); for (let p = 0; p < op.length; p++) op[p] = F.d[p * 4 + 3] >= 128 ? 1 : 0;
      const { labels, comps } = components(op, C, C), big = Math.max(...comps.map(c => c.area)), keep = new Set(comps.filter(c => c.area >= Math.max(4, 0.15 * big)).map(c => c.id));
      F = clone(F); let stray = 0; for (let p = 0; p < op.length; p++) if (op[p] && !keep.has(labels[p])) { F.d[p * 4 + 3] = 0; stray++; }
      const m = minArea(dropKeyOutline(chromaMask(F), B, F), C, C, 2), L = despill(layerFrom(F, m)), st = layerStats(L);
      // registration: best integer shift of the composite silhouette vs the base alpha (±3)
      const iouAt = (sx, sy) => { let a = 0, u = 0; for (let y = 0; y < C; y++) for (let x = 0; x < C; x++) { const c = F.d[(y * C + x) * 4 + 3] >= 128 && !m[y * C + x], X2 = x - sx, Y2 = y - sy, b = X2 >= 0 && Y2 >= 0 && X2 < C && Y2 < C && B.d[(Y2 * C + X2) * 4 + 3] > 0; if (c && b) a++; if (c || b) u++; } return u ? a / u : 1; };
      let best = [0, 0, iouAt(0, 0)]; for (let sy = -3; sy <= 3; sy++) for (let sx = -3; sx <= 3; sx++) { const v = iouAt(sx, sy); if (v > best[2] + 1e-9) best = [sx, sy, v]; }
      // clipping: item px on the canvas border; px outside the central 64 window; overflow per side
      let border = 0, out64 = 0, ov = [0, 0, 0, 0]; const pts = [];
      for (let p = 0; p < m.length; p++) if (L.d[p * 4 + 3]) {
        const x = p % C, y = p / C | 0; pts.push([x + 0.5, y + 0.5]);
        if (x === 0 || y === 0 || x === C - 1 || y === C - 1) border++;
        if (x < o || y < o || x >= o + 64 || y >= o + 64) out64++;
        ov = [Math.max(ov[0], o - x), Math.max(ov[1], o - y), Math.max(ov[2], x - (o + 63)), Math.max(ov[3], y - (o + 63))];
      }
      const P = sh(poses[i]), dm = k => pts.length ? Math.min(...pts.map(([x, y]) => Math.hypot(x - P[k].x, y - P[k].y))) : 99;
      const gs = gripSide(dm('RIGHT ARM'), dm('LEFT ARM'), Math.hypot(P['RIGHT ARM'].x - P['LEFT ARM'].x, P['RIGHT ARM'].y - P['LEFT ARM'].y));
      const pd = pts.length ? palOf(L).reduce((s, c) => s + paletteDist(refPal, ...c), 0) / palOf(L).length : 99;
      per.push({ area: st.area, iou0: best[2] === iouAt(0, 0) ? 1 : 0, shift: [best[0], best[1]], kOut: keyOutside(B, F), kept: keyKept(B, F, 'green', m).kept, border, out64, ov, gs, pd, stray, cx: st.cx, cy: st.cy });
      masks.push(m); (layersOut[clip] ??= {})[d] = [...(layersOut[clip]?.[d] || []), L]; const Lv = over(B, L);
      for (let t = 0; t < 64; t++) for (const [x, y] of [[o + t, o - 1], [o + t, o + 64], [o - 1, o + t], [o + 64, o + t]]) if (o && x >= 0 && y >= 0 && x < C && y < C && !Lv.d[(y * C + x) * 4 + 3]) Lv.d.set([255, 0, 255, 255], (y * C + x) * 4); // 64-window marker
      comp.push(Lv);
    }
    // G9: rigid held item keeps its shape between adjacent frames (centroid-aligned IoU), locomotion
    const g9 = []; for (let i = 1; i < 8; i++) { const a = per[i - 1], b = per[i]; if (!a.area || !b.area) { g9.push(0); continue; } const dx = Math.round(b.cx - a.cx), dy = Math.round(b.cy - a.cy); let I = 0, U = 0; for (let p = 0; p < C * C; p++) { const x = p % C, y = p / C | 0, q = (y - dy) * C + (x - dx), A = x - dx >= 0 && y - dy >= 0 && x - dx < C && y - dy < C && masks[i - 1][q], Bm = masks[i][p]; if (A && Bm) I++; if (A || Bm) U++; } g9.push(U ? I / U : 0); }
    const a = per.map(p => p.area), mu = a.reduce((s, v) => s + v, 0) / 8, cnt = s => per.filter(p => p.gs === s).length;
    table.push({ tag, d, clip, seed, areaMin: Math.min(...a), areaMed: [...a].sort((x, y) => x - y)[4], cv: +(Math.sqrt(a.reduce((s, v) => s + (v - mu) ** 2, 0) / 8) / mu).toFixed(2),
      kKeptMin: Math.min(...per.map(p => p.kept)), kOutMax: Math.max(...per.map(p => p.kOut)), shifted: per.filter(p => p.shift[0] || p.shift[1]).length,
      borderPx: per.reduce((s, p) => s + p.border, 0), out64px: per.reduce((s, p) => s + p.out64, 0), out64frames: per.filter(p => p.out64).length, overflow: [0, 1, 2, 3].map(j => Math.max(...per.map(p => p.ov[j]))).join('/'),
      grip: `${cnt('R')}/${cnt('L')}/${cnt('amb')}/${cnt('none')}`, g9min: +Math.min(...g9).toFixed(2), palDist: +Math.max(...per.map(p => p.pd)).toFixed(1), stray: per.reduce((s, p) => s + p.stray, 0) });
    rows.push([over(restBase(d), keyL[d]), ...comp]);
  }
  // export-shaped layer sheets: one PNG per clip, rows = S/E/N, cols = cells, C×C cells (pivot = rig pivot + o), untrimmed;
  // union bbox of the item over every cell, relative to the 64 window -> smallest centred oversize cell that holds it
  let u = [C, C, -1, -1];
  for (const [clip, byDir] of Object.entries(layersOut)) {
    const S = make(8 * C, DIRS.length * C);
    DIRS.forEach((d, r) => (byDir[d] || []).forEach((L, i) => { for (let y = 0; y < C; y++) for (let x = 0; x < C; x++) { const k = (y * C + x) * 4; if (!L.d[k + 3]) continue; S.d.set(L.d.subarray(k, k + 4), ((r * C + y) * S.w + i * C + x) * 4); u = [Math.min(u[0], x), Math.min(u[1], y), Math.max(u[2], x), Math.max(u[3], y)]; } }));
    if (process.env.S5_EXPORT) X.save(`export_${tag}_${clip}.png`, S);
  }
  const need = Math.max(o - u[0], o - u[1], u[2] - (o + 63), u[3] - (o + 63), 0);
  console.log('union bbox (canvas px)', u.join(','), 'max overflow beyond the 64 window', need, '-> centred oversize cell', 64 + 2 * need);
  console.table(table);
  fs.writeFileSync(`${X.dir}/eval_${tag}.json`, JSON.stringify(table, null, 1));
  X.save(`eval_${tag}.sheet.png`, sheet(rows, { s: C > 64 ? 2 : 3, gap: 4 }));
}
