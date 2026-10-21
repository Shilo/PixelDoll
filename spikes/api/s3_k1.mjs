// S3/K1: custom actions on the frozen 48->64 base.
// usage: node --env-file=../../.env s3_k1.mjs <route> <action> <dir> [seed=7] [tag]
//   route: preview (free) | v3 (animate-with-skeleton-v3) | legacy (animate-with-skeleton, 3 frames) | text (animate-with-text-v3)
//          | charv3 (/characters/animations mode v3, action text) | charsk (/characters/animations mode skeleton-v3, action = template id)
//          | chartpl (/characters/animations mode template, action = template id)
//          | v3tpl (animate-with-skeleton-v3 with the estimated skeletons of an S2 template clip: action = walk | punch)
// Frames -> out/s3_k1/<name>_<i>.png (64x64, padded to the rig canvas if needed), request keypoints -> <name>.req.json
import fs from 'node:fs';
import { experiment, imagesOf } from './lib/run.mjs';
import { toB64, canvasTo, make, scale, clone } from './lib/img.mjs';
import { b64img } from './lib/api.mjs';
import { fromApi, toApi, drawPose } from './lib/skel.mjs';
import { sheet } from './lib/sheet.mjs';
import { ACTIONS, legacySlash } from './s3_poses.mjs';

const X = experiment('s3_k1');
const [route, action, dir, seed = '7', tag = ''] = process.argv.slice(2);
const db = JSON.parse(fs.readFileSync(`${X.dir}/../s3_skel/skel.json`));
const CID = '5352683c-54aa-4617-b303-e942e472c66d'; // S2 b48 base character
// rig cell = 48 px character padded to 64 at (+8,+16). Managed character jobs return the 48 px character CENTRED on a bigger
// canvas (skeleton-v3 80x80, v3 68x68): re-centre to the rig. ponytail: assumes centring; verified by feet/head bbox in eval.
const W = 64, pad = B => B.w === 64 ? B : canvasTo(B, 64, 64, 8 - (B.w - 48) / 2, 16 - (B.h - 48) / 2);
const first = pad(X.load(`../s2_base/b48_${dir}.png`)), rest = fromApi(db[`rot_${dir}`].kps, W, W);
const name = `${action}_${dir}_${route}_s${seed}${tag ? '_' + tag : ''}`;
const DESC = 'bald man in a plain grey t-shirt and plain grey shorts, barefoot, light skin, empty hands, no weapon';
const ACT = { walk: 'walk', punch: 'cross punch', slash: 'overhead slash attack with the right arm', cast: 'cast a spell with both hands', hurt: 'hurt, recoil from a hit', death: 'die and fall to the ground' };
const log = o => { fs.appendFileSync(`${X.dir}/costs.jsonl`, JSON.stringify({ t: new Date().toISOString(), name, route, action, dir, seed: +seed, ...o }) + '\n'); console.log('COST', JSON.stringify(o)); };

// v3tpl: retarget a template clip onto the single reference image: keypoints = estimated skeletons of the template frames
const tplPoses = a => Object.keys(db).filter(k => k.startsWith(`${a}_${dir}_`) && !k.includes('#')).sort((x, y) => +x.split('_').pop() - +y.split('_').pop()).map(k => fromApi(db[k].kps, W, W));
let poses = route === 'legacy' ? legacySlash(rest, dir) : route === 'v3tpl' ? tplPoses(action) : ACTIONS[action]?.(rest, dir);
if (poses) X.saveJson(`${name}.req.json`, { rest, poses });

if (route === 'preview') {
  const rows = [[drawPose(scale(first, 6), rest, 6), ...poses.map(p => drawPose(scale(dim(first), 6), p, 6))]];
  X.save(`${name}.png`, sheet(rows, { s: 1, checker: 24 }));
  process.exit(0);
}
function dim(B) { const o = clone(B); for (let i = 3; i < o.d.length; i += 4) o.d[i] = o.d[i] ? 60 : 0; return o; }

const t0 = Date.now(); let r, frames;
if (process.env.JOB) r = { res: {}, jobs: [(await X.api.waitJob(process.env.JOB)).job] }; // recover a submitted job after a polling network error
else if (route === 'v3' || route === 'v3tpl') {
  r = await X.api.run('/animate-with-skeleton-v3', { description: DESC, action: ACT[action], direction: dir, view: 'low top-down', first_frame: b64img(toB64(first)), first_frame_keypoints: toApi(rest, W, W, false), keypoints: poses.map(p => toApi(p, W, W, false)), seed: +seed, no_background: true });
} else if (route === 'legacy') {
  const black = make(W, W), white = make(W, W); for (let i = 0; i < W * W * 4; i += 4) { black.d.set([0, 0, 0, 255], i); white.d.set([255, 255, 255, 255], i); }
  // ponytail: legacy Point has no 0-1 bounds; normalised coords like estimate-skeleton (pixel coords variant = tag 'px')
  const kp = p => tag === 'px' ? toApi(p, 1, 1) : toApi(p, W, W);
  r = { res: await X.api.post('/animate-with-skeleton', { image_size: { width: W, height: W }, view: 'low top-down', direction: dir, reference_image: b64img(toB64(first)), skeleton_keypoints: poses.map(kp), seed: +seed }) };
  r.jobs = [];
} else if (route === 'text') {
  r = await X.api.run('/animate-with-text-v3', { first_frame: b64img(toB64(first)), action: tag === 'plain' ? ACT[action] : `${ACT[action]}. Keep facing ${dir}. ${DESC}. No effects.`, frame_count: 8, no_background: true, seed: +seed });
} else if (route === 'charv3' || route === 'charsk' || route === 'chartpl') {
  const body = { character_id: CID, directions: [dir], animation_name: name };
  if (route === 'charv3') Object.assign(body, { mode: 'v3', action_description: `${ACT[action]}, empty hands, keep facing ${dir}`, frame_count: 8, keep_first_frame: false, seed: +seed });
  else Object.assign(body, { mode: route === 'charsk' ? 'skeleton-v3' : 'template', template_animation_id: action });
  r = await X.api.run('/characters/animations', body);
}
const ms = Date.now() - t0;
const payload = r.jobs?.[0]?.last_response ?? r.res;
const ims = (await imagesOf(payload.images ?? payload, { w: W, h: W })).map(f => f.im); // images only (storage_urls duplicate them)
frames = ims.map(pad);
frames.forEach((F, i) => X.save(`${name}_${i}.png`, F));
log({ ms, submitMs: r.submitMs, nFrames: frames.length, sizes: [...new Set(ims.map(i => `${i.w}x${i.h}`))], usage: r.jobs?.[0]?.usage ?? r.res?.usage, jobIds: r.res?.background_job_ids || r.res?.background_job_id });
X.save(`${name}.sheet.png`, sheet([[first, ...frames]], { s: 4 }));
