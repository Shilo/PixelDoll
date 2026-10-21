// E4: animated equipment over the 8-frame base walk. usage: node --env-file=../../.env e4_anim.mjs <item> <dir> <route,...>
// routes: ea2 (edit-animation-v2), to2 (transfer-outfit-v2), pfi (per-frame pro-flash inpaint), iv3 (per-frame inpaint-v3),
//         pfe-ref (per-frame pro-flash edit, method=reference, ref = E3 frame-0 composite)
import fs from 'node:fs';
import { experiment, imagesOf } from './lib/run.mjs';
import { make, toB64, fromB64, bbox } from './lib/img.mjs';
import { b64img, findImages } from './lib/api.mjs';
import { maskExact, heatmap, layerStats, paletteJaccard, metrics } from './lib/diff.mjs';
import { VARIANTS } from './lib/extract.mjs';
import { layerFrom } from './lib/diff.mjs';
import { sheet } from './lib/sheet.mjs';

const X = experiment('e4_anim');
const SK = JSON.parse(fs.readFileSync(`${X.dir}/walk_skeletons.json`));
const [item, dir = 'south', routeArg = 'ea2'] = process.argv.slice(2);
const N = 8, frames = [...Array(N).keys()].map(i => X.load(`../e2_anim/walk_${dir}_${i}.png`));
const W = frames[0].w, H = frames[0].h, sz = { width: W, height: H };
const clampR = (x0, y0, x1, y1) => { x0 = Math.max(0, Math.floor(x0)); y0 = Math.max(0, Math.floor(y0)); x1 = Math.min(W, Math.ceil(x1)); y1 = Math.min(H, Math.ceil(y1)); return { x: x0, y: y0, w: x1 - x0, h: y1 - y0 }; };
const HEAD = ['NOSE', 'LEFT EYE', 'RIGHT EYE', 'LEFT EAR', 'RIGHT EAR'];
const ITEM = {
  helmet: { what: 'a simple grey steel knight helmet covering the top and sides of the head, face visible', anchor: 'NECK',
    region: k => { const cx = HEAD.reduce((a, l) => a + k[l][0], 0) / 5; return clampR(cx - 11, 0, cx + 11, k.NECK[1] + 2); } },
  sword: { what: "a steel longsword held in the character's right hand, blade pointing down and slightly outward", anchor: 'RIGHT ARM',
    region: k => { const [x, y] = k['RIGHT ARM']; return dir === 'south' ? clampR(x - 14, y - 20, x + 7, H) : clampR(x - 16, y - 22, x + 16, H); } },
  chest: { what: 'a brown leather chest armor vest covering the torso', anchor: 'NECK',
    region: k => { const xs = ['LEFT SHOULDER', 'RIGHT SHOULDER', 'LEFT ELBOW', 'RIGHT ELBOW'].map(l => k[l][0]); return clampR(Math.min(...xs) - 2, k.NECK[1] - 2, Math.max(...xs) + 3, Math.max(k['LEFT HIP'][1], k['RIGHT HIP'][1]) + 3); } },
}[item];
const regions = frames.map((_, i) => ITEM.region(SK[`${dir}_${i}`]));
const maskImg = r => { const M = make(W, H); for (let p = 0; p < W * H; p++) { const x = p % W, y = (p / W) | 0, on = x >= r.x && y >= r.y && x < r.x + r.w && y < r.y + r.h; M.d.set(on ? [255, 255, 255, 255] : [0, 0, 0, 255], p * 4); } return M; };
const view = dir === 'south' ? 'south-facing (front view)' : `${dir}-facing (side view)`;
const prompt = `Add only ${ITEM.what} to this ${view} pixel art character in every frame, identical design in all frames. Keep every other pixel of the body, pose, outline and the transparent background unchanged.`;
const fr = F => ({ image: b64img(toB64(F)), size: sz });
const refPath = `${X.dir}/../e3_static/${item}__inpaint-v3.out0.png`;

// pick N output frames from a job payload
async function outFrames(payload) {
  const arr = payload.images || payload.frames;
  if (Array.isArray(arr)) return Promise.all(arr.map(async a => a.base64 ? fromB64(a.base64) : (await imagesOf(a, { w: W, h: H }))[0].im));
  return (await imagesOf(payload, { w: W, h: H })).map(f => f.im).filter(im => im.w === W && im.h === H).slice(0, N);
}
const ROUTES = {
  ea2: async () => { const r = await X.api.run('/edit-animation-v2', { description: prompt, frames: frames.map(fr), image_size: sz, no_background: true, seed: 7 }); return { outs: await outFrames(r.jobs[0].last_response), usage: [r.jobs[0].usage], raw: r }; },
  to2: async () => { const ref = X.load(refPath); const r = await X.api.run('/transfer-outfit-v2', { reference_image: fr(ref), frames: frames.map(fr), image_size: sz, no_background: true, seed: 7, additional_instructions: `Only add the ${item} from the reference; keep the body unchanged. Frames show the character ${view}.` }); return { outs: await outFrames(r.jobs[0].last_response), usage: [r.jobs[0].usage], raw: r }; },
  pfi: async () => { const rs = await Promise.all(frames.map((F, i) => X.api.run('/inpaint-image-pro-flash', { image: b64img(toB64(F)), mask_image: b64img(toB64(maskImg(regions[i]))), description: ITEM.what, no_background: true, seed: 7 }))); return { outs: await Promise.all(rs.map(r => outFrames(r.jobs[0].last_response).then(a => a[0]))), usage: rs.map(r => r.jobs[0].usage), raw: rs[0] }; },
  iv3: async () => { const rs = await Promise.all(frames.map((F, i) => X.api.run('/inpaint-v3', { description: ITEM.what, inpainting_image: fr(F), mask_image: fr(maskImg(regions[i])), no_background: true, crop_to_mask: true, seed: 7 }))); return { outs: await Promise.all(rs.map(r => outFrames(r.jobs[0].last_response).then(a => a[0]))), usage: rs.map(r => r.jobs[0].usage), raw: rs[0] }; },
  'pfe-ref': async () => { const ref = X.load(refPath); const rs = await Promise.all(frames.map(F => X.api.run('/edit-image-pro-flash', { image: b64img(toB64(F)), method: 'reference', reference_image: b64img(toB64(ref)), description: `Add exactly the same ${item} as worn in the reference image. ${prompt}`, no_background: true, seed: 7 }))); return { outs: await Promise.all(rs.map(r => outFrames(r.jobs[0].last_response).then(a => a[0]))), usage: rs.map(r => r.jobs[0].usage), raw: rs[0] }; },
};

async function runRoute(route) {
  const tag = `${item}_${dir}__${route}`, t0 = Date.now();
  try {
    const { outs, usage, raw } = await ROUTES[route]();
    X.saveJson(`${tag}.response.json`, { keys: Object.keys(raw.jobs[0].last_response || {}), job: raw.jobs[0] });
    const ms = Date.now() - t0;
    outs.forEach((o, i) => X.save(`${tag}.out${i}.png`, o));
    const info = { item, dir, route, ms, usage, nOut: outs.length, sizes: [...new Set(outs.map(o => `${o.w}x${o.h}`))] };
    if (outs.length !== N || outs.some(o => o.w !== W || o.h !== H)) { info.error = 'frame count/size mismatch'; return info; }
    // frame order: alpha IoU of output j vs each input frame
    const iou = (a, b) => { let i = 0, u = 0; for (let p = 3; p < a.d.length; p += 4) { const x = a.d[p] > 0, y = b.d[p] > 0; if (x && y) i++; if (x || y) u++; } return i / u; };
    info.orderOk = outs.map((o, j) => { const s = frames.map(F => iou(o, F)); return s.indexOf(Math.max(...s)) === j; });
    info.frames = [];
    const layers = [], rows = [[], [], [], []];
    for (let i = 0; i < N; i++) {
      const B = frames[i], C = outs[i], k = SK[`${dir}_${i}`];
      const ex = maskExact(B, C).reduce((a, b) => a + b, 0);
      const mask = VARIANTS.slot_novel_cc(B, C, regions[i]), L = layerFrom(C, mask), st = layerStats(L), m = metrics(B, C, mask, { region: regions[i] });
      layers.push({ L, st });
      const bb = bbox(L);
      info.frames.push({ i, changed: ex, outsideRegionChanged: m.outsideChanged, layerPx: st.area, colors: st.colors, bbox: bb && `${bb.x},${bb.y},${bb.w}x${bb.h}`, centroidRelAnchor: st.area ? [+(st.cx - k[ITEM.anchor][0]).toFixed(1), +(st.cy - k[ITEM.anchor][1]).toFixed(1)] : null, paletteJ0: paletteJaccard(st.palette, layers[0].st.palette), residualInRegion: m.residualInRegion });
      rows[0].push(B); rows[1].push(C); rows[2].push(heatmap(B, C)); rows[3].push(L);
      X.save(`${tag}.layer${i}.png`, L);
    }
    const areas = info.frames.map(f => f.layerPx);
    info.summary = { areaMean: +(areas.reduce((a, b) => a + b) / N).toFixed(1), areaCV: +(Math.sqrt(areas.reduce((a, b) => a + (b - areas.reduce((x, y) => x + y) / N) ** 2, 0) / N) / (areas.reduce((a, b) => a + b) / N)).toFixed(2), meanOutsideChanged: +(info.frames.reduce((a, f) => a + f.outsideRegionChanged, 0) / N).toFixed(1), meanPaletteJ0: +(info.frames.reduce((a, f) => a + f.paletteJ0, 0) / N).toFixed(2), centroidSpread: (() => { const c = info.frames.filter(f => f.centroidRelAnchor).map(f => f.centroidRelAnchor); const sx = Math.max(...c.map(v => v[0])) - Math.min(...c.map(v => v[0])), sy = Math.max(...c.map(v => v[1])) - Math.min(...c.map(v => v[1])); return [+sx.toFixed(1), +sy.toFixed(1)]; })(), orderOk: info.orderOk.every(Boolean) };
    X.save(`${tag}.sheet.png`, sheet(rows, { s: 3 }));
    return info;
  } catch (e) { return { item, dir, route, ms: Date.now() - t0, error: e.message.slice(0, 700) }; }
}

const results = await Promise.all(routeArg.split(',').map(runRoute));
for (const r of results) fs.appendFileSync(`${X.dir}/results.jsonl`, JSON.stringify(r) + '\n');
for (const r of results) console.log(JSON.stringify({ item: r.item, dir: r.dir, route: r.route, ms: r.ms, usage: r.usage, error: r.error, nOut: r.nOut, summary: r.summary }));
