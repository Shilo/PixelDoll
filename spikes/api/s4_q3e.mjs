// S4/Q3 (e): "skeleton-posed dressed chroma keyframe" vs edit-animation-v2 vs Pro Flash inpaint grid, head-to-head on the
// SAME base frames: S3's raw skeleton-v3 walk + slash, S/E/N (out/s4_items/sk_<dir>.base0-15: 0-7 walk, 8-15 slash).
// usage: node --env-file=../../.env s4_q3e.mjs dress <ea2|pfg|pfe|v3rot> <item>   dressed rest keyframes S/E/N
//        node --env-file=../../.env s4_q3e.mjs pose <variant> <item>              raw skeleton-v3, same keypoints as the base
//        node s4_q3e.mjs eval <item> [routes=ea2,pfinp,skel_ea2]                  unified metrics + sheet (offline)
import fs from 'node:fs';
import { experiment, imagesOf } from './lib/run.mjs';
import { toB64, over, make, bbox, canvasTo } from './lib/img.mjs';
import { b64img } from './lib/api.mjs';
import { layerFrom, layerStats, paletteDist, paletteJaccard } from './lib/diff.mjs';
import { dropKeyOutline, toChroma, chromaMask, keyKept, keyOutside, despill, chromaPrompt, WHAT } from './lib/chroma.mjs';
import { minArea, cleanliness } from './lib/clean.mjs';
import { toApi, mid, HEAD, gripSide } from './lib/skel.mjs';
import { sheet } from './lib/sheet.mjs';

const X = experiment('s4_q3e');
const [cmd, a1, a2, a3] = process.argv.slice(2);
const W = 64, DIRS = ['south', 'east', 'north'], CLIPS = ['walk', 'slash'];
const req = (clip, d) => JSON.parse(fs.readFileSync(`${X.dir}/../s3_k1/${clip === 'walk' ? `walk_${d}_v3tpl_s7` : `slash_${d}_v3_s7`}.req.json`));
const restBase = d => X.load(`../s3_k6/rot_base_${d}.png`); // padded 64 rotation (S3)
const baseCell = (d, clip, i) => X.load(`../s4_items/sk_${d}.base${(clip === 'slash' ? 8 : 0) + i}.png`);
const ACTION = { walk: 'walking', slash: 'overhead slash attack with the right arm' };
const DIRTXT = { south: 'south (front view)', east: 'east (side view, facing right)', north: 'north (back view)' };

// slot masks (white = generate), same bands as s4_items.mjs  ponytail: duplicated 10 lines instead of a shared module
function slotMask(b, item) {
  const bb = bbox(b), m = new Uint8Array(W * W), headH = Math.round(bb.h * 0.30);
  for (let y = 0; y < W; y++) for (let x = 0; x < W; x++) {
    const inX = x >= bb.x - 6 && x < bb.x + bb.w + 6;
    const ok = item === 'helmet' || item === 'hair' ? inX && y >= Math.max(0, bb.y - 6) && y < bb.y + headH
      : item === 'cape' ? inX && y >= bb.y + Math.round(bb.h * 0.2) - 2 && y < bb.y + bb.h + 2
      : item === 'chest' ? inX && y >= bb.y + Math.round(bb.h * 0.2) - 2 && y < bb.y + Math.round(bb.h * 0.62)
      : item === 'boots' ? inX && y >= bb.y + Math.round(bb.h * 0.68) : true;
    if (ok) m[y * W + x] = 1;
  }
  return m;
}
const row = ims => { const G = make(W * ims.length, W); ims.forEach((im, j) => { for (let y = 0; y < W; y++) G.d.set(im.d.subarray(y * W * 4, (y + 1) * W * 4), (y * G.w + j * W) * 4); }); return G; };
const unrow = (G, n) => [...Array(n).keys()].map(j => canvasTo(G, W, W, -j * W, 0));
const maskIm = m => { const o = make(W, W); for (let p = 0; p < m.length; p++) { const v = m[p] ? 255 : 0; o.d.set([v, v, v, 255], p * 4); } return o; };
const log = o => { fs.appendFileSync(`${X.dir}/costs.jsonl`, JSON.stringify({ t: new Date().toISOString(), ...o }) + '\n'); console.log('COST', JSON.stringify(o)); };
const first = async r => (await imagesOf(r.jobs[0].last_response, { w: W, h: W }))[0].im;

if (cmd === 'dress') {
  const [v, item] = [a1, a2], K = DIRS.map(d => toChroma(restBase(d), 'green')), t0 = Date.now(), usage = [];
  const note = 'Frame 1 faces south (front view), frame 2 faces east (side view, facing right), frame 3 faces north (back view). ';
  let D;
  const cached = DIRS.map(d => `dress_${v}_${item}_${d}.png`);
  if (cached.every(f => fs.existsSync(`${X.dir}/${f}`))) D = cached.map(f => X.load(f)); // ponytail: re-eval without paying again
  else if (v === 'ea2') {
    const r = await X.api.run('/edit-animation-v2', { description: chromaPrompt(item, 'green', note), frames: K.map(k => ({ image: b64img(toB64(k)), size: { width: W, height: W } })), image_size: { width: W, height: W }, no_background: true, seed: 7 });
    usage.push(r.jobs[0].usage); D = (await imagesOf(r.jobs[0].last_response, { w: W, h: W })).map(x => x.im);
  } else if (v === 'eiv2') { // Pro: edit-images-v2, 3 frames in one call
    const r = await X.api.run('/edit-images-v2', { method: 'edit_with_text', edit_images: K.map(k => ({ image: b64img(toB64(k)), width: W, height: W })), image_size: { width: W, height: W }, description: chromaPrompt(item, 'green', note), no_background: true, seed: 7 });
    usage.push(r.jobs[0].usage); D = (await imagesOf(r.jobs[0].last_response, { w: W, h: W })).map(x => x.im);
  } else if (v === 'pxe') { // Pixen per direction, 1 gen each
    D = await Promise.all(DIRS.map(async (d, j) => { const r = await X.api.run('/edit-image-pixen', { image: b64img(toB64(K[j])), description: `Solid bright green chroma-key mannequin facing ${DIRTXT[d]}; keep the green exactly. Add only ${WHAT[item]} in its natural colours. Keep pose, outline and transparent background.`.slice(0, 500), no_background: true, seed: 7 }); usage.push(r.jobs[0].usage); return first(r); }));
  } else if (v === 'pfg' || v === 'inv3' || v === 'pxg') { // one 192x64 row -> one design for all three views
    const M = row(DIRS.map(d => maskIm(slotMask(restBase(d), item))));
    const desc = `Three views of the same pixel art character side by side: left = facing south (front view), middle = facing east (side view, facing right), right = facing north (back view). The character is a solid bright green mannequin; the bright green is intentional (a chroma key) and must stay exactly the same. Add only ${WHAT[item]} to the character in all three views, drawn in its own natural colours (no green on the item), identical design, size and colours in every view. Keep the transparent background.`;
    const r = v === 'pfg' ? await X.api.run('/inpaint-image-pro-flash', { image: b64img(toB64(row(K))), mask_image: b64img(toB64(M)), description: desc, no_background: true, output_method: 'Modify current layer', seed: 7 })
      : v === 'inv3' ? await X.api.run('/inpaint-v3', { inpainting_image: { image: b64img(toB64(row(K))), size: { width: 3 * W, height: W } }, mask_image: { image: b64img(toB64(M)), size: { width: 3 * W, height: W } }, description: desc, no_background: true, seed: 7 })
      : await X.api.run('/edit-image-pixen', { image: b64img(toB64(row(K))), description: `Three views of one solid bright green chroma-key mannequin: left faces south, middle faces east, right faces north. Keep the green exactly. Add only ${WHAT[item]} in natural colours to all three views, identical design. Keep the transparent background.`.slice(0, 500), no_background: true, seed: 7 });
    usage.push(r.jobs[0].usage); D = unrow(await first(r), 3);
  } else if (v === 'pfe') { // independent per-direction edits (design may differ)
    D = await Promise.all(DIRS.map(async (d, j) => { const r = await X.api.run('/edit-image-pro-flash', { image: b64img(toB64(K[j])), method: 'text', description: chromaPrompt(item, 'green', `The character faces ${DIRTXT[d]}. `), no_background: true, seed: 7 }); usage.push(r.jobs[0].usage); return first(r); }));
  } else if (v === 'v3rot') { // dress SOUTH only (pfg result), let create-character-v3 rotate it to E/N
    const S = X.load(`dress_pfg_${item}_south.png`);
    const r = await X.api.run('/create-character-v3', { description: `solid bright green mannequin (chroma key colour) wearing ${WHAT[item]}`, reference_image: b64img(toB64(S)), n_directions: 4, view: 'low top-down', template_id: 'mannequin', no_background: true, seed: 7 });
    usage.push(r.jobs[0]?.usage ?? r.res?.usage); const ch = await X.api.get(`/characters/${r.res.character_id}`);
    D = [S]; for (const d of ['east', 'north']) { const [{ im }] = await imagesOf(ch.rotation_urls[d]); D.push(im.w === W ? im : canvasTo(im, W, W, (W - im.w) / 2, (W - im.h) / 2)); }
  }
  D = D.slice(0, 3); // ea2/eiv2 also return quantized_images -> findImages sees 2x
  D.forEach((im, j) => X.save(`dress_${v}_${item}_${DIRS[j]}.png`, im));
  const Bs = DIRS.map(restBase), Ls = D.map((C, j) => despill(layerFrom(C, minArea(dropKeyOutline(chromaMask(C), Bs[j], C), W, W, 2))));
  X.save(`dress_${v}_${item}.sheet.png`, sheet([Bs, D, Ls, Ls.map((L, j) => over(Bs[j], L))], { s: 4 }));
  log({ cmd, v, item, ms: Date.now() - t0, usage, keyKept: D.map((C, j) => keyKept(Bs[j], C, 'green', chromaMask(C)).kept), keyOutside: D.map((C, j) => keyOutside(Bs[j], C)), area: Ls.map(L => layerStats(L).area) });
} else if (cmd === 'pose') {
  const [v, item] = [a1, a2], t0 = Date.now();
  await Promise.all(DIRS.flatMap(d => CLIPS.map(async clip => {
    const { rest, poses } = req(clip, d), F = X.load(`dress_${v}_${item}_${d}.png`), t1 = Date.now();
    const r = await X.api.run('/animate-with-skeleton-v3', { description: `solid bright green mannequin (chroma key colour) wearing ${WHAT[item]}`, action: ACTION[clip], direction: d, view: 'low top-down', first_frame: b64img(toB64(F)), first_frame_keypoints: toApi(rest, W, W, false), keypoints: poses.map(p => toApi(p, W, W, false)), seed: 7, no_background: true });
    const ims = (await imagesOf(r.jobs[0].last_response.images)).map(f => f.im);
    ims.forEach((im, i) => X.save(`pose_${v}_${item}_${clip}_${d}_${i}.png`, im.w === W ? im : canvasTo(im, W, W, (W - im.w) / 2, (W - im.h) / 2)));
    log({ cmd, v, item, clip, d, n: ims.length, size: `${ims[0].w}x${ims[0].h}`, ms: Date.now() - t1, usage: r.jobs[0].usage });
  })));
  console.log('total ms', Date.now() - t0);
} else if (cmd === 'eval') {
  const item = a1, routes = (a2 || 'ea2,pfinp,skel_ea2').split(',');
  const out = (route, d, clip, i) => route.startsWith('skel_') ? `pose_${route.slice(5)}_${item}_${clip}_${d}_${i}.png` : `../s4_items/sk_${route}_${item}_${d}.out${(clip === 'slash' ? 8 : 0) + i}.png`;
  const anchor = (P) => item === 'helmet' || item === 'hair' ? mid(P, HEAD) : item === 'chest' ? mid(P, ['NECK', 'RIGHT HIP', 'LEFT HIP']) : item === 'boots' ? mid(P, ['RIGHT LEG', 'LEFT LEG']) : item === 'cape' ? mid(P, ['NECK']) : P['RIGHT ARM'];
  const table = [], rows = [];
  for (const route of routes) {
    if (!fs.existsSync(`${X.dir}/${out(route, 'south', 'walk', 0)}`)) { console.log('missing', route); continue; }
    let refPal = null; const rrows = [];
    for (const d of DIRS) for (const clip of CLIPS) {
      if (!fs.existsSync(`${X.dir}/${out(route, d, clip, 7)}`)) continue; // S/E-only editors
      const { poses } = req(clip, d), per = [], Ls = [];
      for (let i = 0; i < 8; i++) {
        const B = baseCell(d, clip, i), C = X.load(out(route, d, clip, i)), m = minArea(dropKeyOutline(chromaMask(C), B, C), W, W, 2), L = despill(layerFrom(C, m));
        const st = layerStats(L), cl = cleanliness(L), A = anchor(poses[i]);
        let gs = null; if (item === 'sword') { const pts = []; for (let p = 0; p < m.length; p++) if (L.d[p * 4 + 3]) pts.push([p % W + 0.5, (p / W | 0) + 0.5]); const dm = k => pts.length ? Math.min(...pts.map(([x, y]) => Math.hypot(x - poses[i][k].x, y - poses[i][k].y))) : 99; gs = gripSide(dm('RIGHT ARM'), dm('LEFT ARM'), Math.hypot(poses[i]['RIGHT ARM'].x - poses[i]['LEFT ARM'].x, poses[i]['RIGHT ARM'].y - poses[i]['LEFT ARM'].y)); }
        // body registration: IoU of the composite's opaque silhouette vs the base alpha, at 0 and at the best integer shift (±4)
        const iouAt = (sx, sy) => { let a = 0, u = 0; for (let y = 0; y < W; y++) for (let x = 0; x < W; x++) { const c = C.d[(y * W + x) * 4 + 3] >= 128, X2 = x - sx, Y2 = y - sy, b = X2 >= 0 && Y2 >= 0 && X2 < W && Y2 < W && B.d[(Y2 * W + X2) * 4 + 3] > 0; if (c && b) a++; if (c || b) u++; } return u ? a / u : 1; };
        let best = [0, 0, iouAt(0, 0)]; const iou0 = best[2]; for (let sy = -4; sy <= 4; sy++) for (let sx = -4; sx <= 4; sx++) { const v = iouAt(sx, sy); if (v > best[2] + 1e-9) best = [sx, sy, v]; }
        per.push({ iou0, shift: Math.abs(best[0]) + Math.abs(best[1]), area: st.area, dx: st.area ? st.cx - A.x : null, dy: st.area ? st.cy - A.y : null, kept: keyKept(B, C, 'green', m).kept, outside: keyOutside(B, C), specks: cl.specks, pinholes: cl.pinholes, pal: st.palette, gs });
        Ls.push(over(B, L));
      }
      if (!refPal) refPal = [...per[0].pal].map(c => [c >> 16, (c >> 8) & 255, c & 255]);
      const a = per.map(p => p.area), mu = a.reduce((s, v) => s + v, 0) / a.length, f = k => per.map(p => p[k]).filter(v => v != null), spread = v => v.length ? +(Math.max(...v) - Math.min(...v)).toFixed(1) : null, avg = v => +(v.reduce((s, x) => s + x, 0) / v.length).toFixed(3);
      const palD = avg(per.map(p => { const c = [...p.pal]; return c.length ? c.reduce((s, x) => s + paletteDist(refPal, x >> 16, (x >> 8) & 255, x & 255), 0) / c.length : 99; }));
      table.push({ item, route, dir: d, clip, areaMean: Math.round(mu), areaCV: +(Math.sqrt(a.reduce((s, v) => s + (v - mu) ** 2, 0) / a.length) / mu).toFixed(2), empty: a.filter(v => !v).length,
        anchorSpread: [spread(f('dx')), spread(f('dy'))], silIoU: avg(f('iou0')), shiftedFrames: per.filter(p => p.shift > 0).length, keyKept: avg(f('kept')), keyOutMax: Math.max(...f('outside')), specks: per.reduce((s, p) => s + p.specks, 0), pinholes: per.reduce((s, p) => s + p.pinholes, 0),
        adjPalJ: avg(per.slice(1).map((p, i) => paletteJaccard(p.pal, per[i].pal))), palDistToRef: palD, grip: item === 'sword' ? ['R', 'L', 'amb', 'none'].map(s => per.filter(p => p.gs === s).length).join('/') : '' });
      rows.push(Ls); rrows.push(Ls);
    }
    if (rrows.length) X.save(`h2h_${item}_${route}.sheet.png`, sheet(rrows, { s: 3 }));
  }
  console.table(table.map(t => ({ ...t, anchorSpread: t.anchorSpread.join(',') })));
  fs.appendFileSync(`${X.dir}/h2h.jsonl`, table.map(t => JSON.stringify(t)).join('\n') + '\n');
}
