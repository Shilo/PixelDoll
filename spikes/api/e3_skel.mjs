// Estimate skeleton on the canonical base frame (walk south frame 0) to derive item regions.
import { experiment } from './lib/run.mjs';
import { toB64 } from './lib/img.mjs';
import { b64img } from './lib/api.mjs';
const X = experiment('e3_static');
const B = X.load(process.argv[2] || '../e2_anim/walk_south_0.png');
const t0 = Date.now();
const r = await X.costed('estimate-skeleton', () => X.api.post('/estimate-skeleton', { image: b64img(toB64(B)) }));
console.log('ms', Date.now() - t0);
const kp = r.keypoints.map(k => ({ label: k.label, x: +(k.x * (k.x <= 1 ? B.w : 1)).toFixed(1), y: +(k.y * (k.y <= 1 ? B.h : 1)).toFixed(1), z: k.z_index }));
X.saveJson('skeleton_walk_south_0.json', { raw: r.keypoints, px: kp, usage: r.usage });
console.log(kp.map(k => `${k.label}:${k.x},${k.y},z${k.z}`).join('\n'));
