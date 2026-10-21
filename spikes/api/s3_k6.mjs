// S3/K6: does skeleton-v3 animate DIFFERENT keyframes (base / chroma mannequin / dressed chroma) into pixel-ALIGNED frames?
// If yes, items could be animated by posing a dressed keyframe instead of editing every base frame.
// usage: node --env-file=../../.env s3_k6.mjs import <base|chroma|dressed>
//        node --env-file=../../.env s3_k6.mjs anim <tag> <template> <dir> [seed=7] [rep]   (characters/animations mode skeleton-v3)
//        node --env-file=../../.env s3_k6.mjs raw <tag> <action> <dir> [seed=7]           (animate-with-skeleton-v3, K1 keypoints)
// Rig: the S2 b48 rotations padded to 64 (x+8, y+16). Dressed = chroma + S2 helmet/sword layers moved onto the rotation by
// keypoint anchors (head centre / right wrist) — no AI call.
import fs from 'node:fs';
import { experiment, imagesOf } from './lib/run.mjs';
import { toB64, canvasTo, over, make } from './lib/img.mjs';
import { b64img } from './lib/api.mjs';
import { toChroma } from './lib/chroma.mjs';
import { fromApi, toApi, mid, HEAD } from './lib/skel.mjs';
import { sheet } from './lib/sheet.mjs';
import { ACTIONS } from './s3_poses.mjs';

const X = experiment('s3_k6');
const db = JSON.parse(fs.readFileSync(`${X.dir}/../s3_skel/skel.json`));
const charsFile = `${X.dir}/chars.json`, chars = fs.existsSync(charsFile) ? JSON.parse(fs.readFileSync(charsFile)) : {};
const W = 64, pad48 = B => canvasTo(B, 64, 64, 8, 16);
const P = id => fromApi(db[id].kps, W, W);
const shiftIm = (L, dx, dy) => canvasTo(L, L.w, L.h, Math.round(dx), Math.round(dy));
const flip = B => { const o = make(B.w, B.h); for (let y = 0; y < B.h; y++) for (let x = 0; x < B.w; x++) o.d.set(B.d.subarray((y * B.w + x) * 4, (y * B.w + x) * 4 + 4), (y * B.w + B.w - 1 - x) * 4); return o; };
const DESC = { base: 'bald man in a plain grey t-shirt and grey shorts, barefoot', chroma: 'solid bright green mannequin (chroma key colour), bald, featureless', dressed: 'solid bright green mannequin (chroma key colour) wearing a grey steel knight helmet and holding a steel longsword in the right hand' };

function rotation(tag, dir) { // padded 64 rotation for south/east/north; west = flip(east)
  if (dir === 'west') return flip(rotation(tag, 'east'));
  const B = pad48(X.load(`../s2_base/b48_${dir}.png`));
  if (tag === 'base') return B;
  let K = toChroma(B, 'green');
  if (tag === 'dressed') {
    const run = dir === 'north' ? 'Ba' : 'A', cell = dir === 'east' ? 8 : 0, walk = P(`walk_${dir}_0`), rot = P(`rot_${dir}`);
    const h = mid(rot, HEAD), hw = mid(walk, HEAD), r = rot['RIGHT ARM'], rw = walk['RIGHT ARM'];
    K = over(K, shiftIm(X.load(`../s2_x4/helmet48_${run}.layer${cell}.png`), h.x - hw.x, h.y - hw.y)); // head anchor
    K = over(K, shiftIm(X.load(`../s2_x4/sword48_${run}.layer${cell}.png`), r.x - rw.x, r.y - rw.y));  // right-hand anchor
  }
  return K;
}
// managed outputs come back centred on a larger canvas -> re-centre onto the 64 rig (ponytail: assumes centring; checked in eval)
const norm = B => B.w === 64 ? B : canvasTo(B, 64, 64, (64 - B.w) / 2, (64 - B.h) / 2);
const log = o => { fs.appendFileSync(`${X.dir}/costs.jsonl`, JSON.stringify({ t: new Date().toISOString(), ...o }) + '\n'); console.log('COST', JSON.stringify(o)); };
const [cmd, tag, a3, a4, a5 = '7', a6 = ''] = process.argv.slice(2);

if (cmd === 'import') {
  const rots = Object.fromEntries(['south', 'east', 'north', 'west'].map(d => [d, rotation(tag, d)]));
  Object.entries(rots).forEach(([d, im]) => X.save(`rot_${tag}_${d}.png`, im));
  const t0 = Date.now();
  const r = await X.api.run('/create-character-v3', { description: DESC[tag], reference_image: b64img(toB64(rots.south)), direction_images: { east: b64img(toB64(rots.east)), north: b64img(toB64(rots.north)), west: b64img(toB64(rots.west)) }, n_directions: 4, view: 'low top-down', template_id: 'mannequin', no_background: true, seed: 7 });
  const cid = r.res.character_id, ch = await X.api.get(`/characters/${cid}`);
  X.saveJson(`char_${tag}.json`, ch);
  // did the import keep our pixels exactly?
  const exact = {};
  for (const [d, u] of Object.entries(ch.rotation_urls || {}).filter(([, u]) => u)) { const [{ im }] = await imagesOf(u); X.save(`imported_${tag}_${d}.png`, im); const R = rots[d]; let same = 0, n = 0; if (R && im.w === R.w) { for (let i = 0; i < im.d.length; i += 4) if (R.d[i + 3] || im.d[i + 3]) { n++; if (R.d[i] === im.d[i] && R.d[i + 1] === im.d[i + 1] && R.d[i + 2] === im.d[i + 2] && R.d[i + 3] === im.d[i + 3]) same++; } } exact[d] = `${im.w}x${im.h} exact ${n ? (same / n).toFixed(3) : 'n/a'}`; }
  chars[tag] = cid; fs.writeFileSync(charsFile, JSON.stringify(chars, null, 1));
  log({ cmd, tag, cid, ms: Date.now() - t0, usage: r.jobs?.[0]?.usage ?? r.res?.usage, exact });
} else if (cmd === 'anim') {
  const [tpl, dir, seed, rep] = [a3, a4, a5, a6], name = `${tag}_${tpl}_${dir}_s${seed}${rep ? '_' + rep : ''}`, t0 = Date.now();
  const r = process.env.JOB ? { res: {}, jobs: [(await X.api.waitJob(process.env.JOB)).job] } : await X.api.run('/characters/animations', { character_id: chars[tag], mode: 'skeleton-v3', template_animation_id: tpl, directions: [dir], seed: +seed, animation_name: name });
  const lr = r.jobs[0].last_response, ims = (await imagesOf(lr.images, { w: W, h: W })).map(f => f.im);
  ims.forEach((im, i) => X.save(`${name}_${i}.png`, norm(im)));
  X.save(`${name}.sheet.png`, sheet([ims.map(norm)], { s: 4 }));
  log({ cmd, name, tag, tpl, dir, seed: +seed, ms: Date.now() - t0, nFrames: ims.length, size: `${ims[0].w}x${ims[0].h}`, usage: r.jobs[0].usage, job: r.res.background_job_ids?.[0] });
} else if (cmd === 'raw') {
  const [action, dir, seed] = [a3, a4, a5], name = `raw_${tag}_${action}_${dir}_s${seed}`, rest = P(`rot_${dir}`), t0 = Date.now();
  const r = await X.api.run('/animate-with-skeleton-v3', { description: DESC[tag], action: action === 'slash' ? 'overhead slash attack with the right arm' : action, direction: dir, view: 'low top-down', first_frame: b64img(toB64(rotation(tag, dir))), first_frame_keypoints: toApi(rest, W, W, false), keypoints: ACTIONS[action](rest, dir).map(p => toApi(p, W, W, false)), seed: +seed, no_background: true });
  const ims = (await imagesOf(r.jobs[0].last_response.images)).map(f => f.im);
  ims.forEach((im, i) => X.save(`${name}_${i}.png`, im));
  X.save(`${name}.sheet.png`, sheet([[rotation(tag, dir), ...ims]], { s: 4 }));
  log({ cmd, name, tag, action, dir, seed: +seed, ms: Date.now() - t0, nFrames: ims.length, usage: r.jobs[0].usage });
} else if (cmd === 'preview') {
  X.save('preview_rotations.png', sheet(['base', 'chroma', 'dressed'].map(t => ['south', 'east', 'north', 'west'].map(d => rotation(t, d))), { s: 4 }));
}
