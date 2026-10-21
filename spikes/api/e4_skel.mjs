// Per-frame skeletons for the base walk (south, east) — free endpoint; used for per-frame slot regions.
import { experiment } from './lib/run.mjs';
import { toB64 } from './lib/img.mjs';
import { b64img } from './lib/api.mjs';
const X = experiment('e4_anim');
const out = {};
await Promise.all(['south', 'east'].flatMap(d => [...Array(8).keys()].map(async i => {
  const F = X.load(`../e2_anim/walk_${d}_${i}.png`);
  const r = await X.api.post('/estimate-skeleton', { image: b64img(toB64(F)) });
  out[`${d}_${i}`] = Object.fromEntries(r.keypoints.map(k => [k.label, [+(k.x * F.w).toFixed(1), +(k.y * F.h).toFixed(1), k.z_index]]));
})));
X.saveJson('walk_skeletons.json', out);
for (const k of Object.keys(out).sort()) console.log(k, 'NECK', out[k].NECK, 'R-ARM', out[k]['RIGHT ARM'], 'L-ARM', out[k]['LEFT ARM'], 'NOSE', out[k].NOSE);
