// S3/K1 eval: pose adherence (re-estimated skeleton vs requested), handedness, proportions, feet/canvas stability, palette.
// Needs skeletons of output frames first: node --env-file=../../.env s3_skel.mjs s3_k1/<name>_ (s3_k1_eval does it for you).
// usage: node --env-file=../../.env s3_k1_eval.mjs [nameFilterRegex]
import fs from 'node:fs';
import { execFileSync } from 'node:child_process';
import { experiment } from './lib/run.mjs';
import { canvasTo, bbox, scale, clone, colors } from './lib/img.mjs';
import { fromApi, poseErr, handOk, drawPose, mid } from './lib/skel.mjs';
import { sheet } from './lib/sheet.mjs';
import { components } from './lib/diff.mjs';

const X = experiment('s3_k1');
const re = new RegExp(process.argv[2] || '.');
const runs = fs.readFileSync(`${X.dir}/costs.jsonl`, 'utf8').trim().split('\n').map(l => JSON.parse(l)).filter(r => r.nFrames && re.test(r.name));
const names = [...new Map(runs.map(r => [r.name, r])).values()];
// skeletons for every output frame (cached in s3_skel/skel.json)
const skelFile = `${X.dir}/../s3_skel/skel.json`;
let db = JSON.parse(fs.readFileSync(skelFile));
const missing = names.filter(r => !db[`s3_k1/${r.name}_0`]).map(r => `s3_k1/${r.name}_`);
if (missing.length) { execFileSync(process.execPath, ['--env-file=../../.env', 's3_skel.mjs', missing.join(',')], { stdio: 'inherit' }); db = JSON.parse(fs.readFileSync(skelFile)); }

const pad = B => B.w === 48 ? canvasTo(B, 64, 64, 8, 16) : B;
const base = {}; for (const d of ['south', 'east', 'north']) base[d] = pad(X.load(`../s2_base/b48_${d}.png`));
// base palette: rotations + walk frames
const pal = new Set(); for (const d of ['south', 'east', 'north']) { colors(base[d]).forEach(c => pal.add(c)); for (let i = 0; i < 8; i++) colors(pad(X.load(`../s2_base/b48walk_${d}_${i}.png`))).forEach(c => pal.add(c)); }
const PAL = [...pal].map(c => [c >> 16, (c >> 8) & 255, c & 255]);
const palFit = F => { let n = 0, ok = 0; for (let i = 0; i < F.d.length; i += 4) if (F.d[i + 3] > 127) { n++; if (PAL.some(([r, g, b]) => Math.max(Math.abs(r - F.d[i]), Math.abs(g - F.d[i + 1]), Math.abs(b - F.d[i + 2])) <= 12)) ok++; } return +(ok / n).toFixed(3); };
// stray px: opaque px outside the largest 8-connected component (detached smears / FX the model adds)
const stray = F => { const m = new Uint8Array(F.w * F.h); for (let p = 0; p < m.length; p++) m[p] = F.d[p * 4 + 3] > 127 ? 1 : 0; const { comps } = components(m, F.w, F.h); const big = Math.max(...comps.map(c => c.area)); return comps.reduce((a, c) => a + c.area, 0) - big; };
const semi = F => { let n = 0; for (let i = 3; i < F.d.length; i += 4) if (F.d[i] > 0 && F.d[i] < 255) n++; return n; };
const feet = F => { const b = bbox(F, 127); let xs = 0, n = 0; for (let y = b.y + b.h - 3; y < b.y + b.h; y++) for (let x = 0; x < F.w; x++) if (F.d[(y * F.w + x) * 4 + 3] > 127) { xs += x; n++; } return { y: b.y + b.h - 1, x: xs / n, top: b.y, h: b.h }; };
const seg = p => { const H = mid(p, ['LEFT HIP', 'RIGHT HIP']), d = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);
  return { torso: d(p.NECK, H), shoulders: d(p['LEFT SHOULDER'], p['RIGHT SHOULDER']), upperR: d(p['RIGHT SHOULDER'], p['RIGHT ELBOW']), foreR: d(p['RIGHT ELBOW'], p['RIGHT ARM']), thighR: d(p['RIGHT HIP'], p['RIGHT KNEE']), shinR: d(p['RIGHT KNEE'], p['RIGHT LEG']), headNeck: d(p.NOSE, p.NECK) }; };
// lower-body silhouette IoU vs the rotation (rows below the rest hip line)
const lowIoU = (A, B, y0) => { let i = 0, u = 0; for (let y = y0; y < A.h; y++) for (let x = 0; x < A.w; x++) { const a = A.d[(y * A.w + x) * 4 + 3] > 127, b = B.d[(y * B.w + x) * 4 + 3] > 127; if (a && b) i++; if (a || b) u++; } return u ? +(i / u).toFixed(3) : 1; };
const ARMS = ['RIGHT SHOULDER', 'RIGHT ELBOW', 'RIGHT ARM', 'LEFT SHOULDER', 'LEFT ELBOW', 'LEFT ARM'];
const dim = B => { const o = clone(B); for (let i = 3; i < o.d.length; i += 4) o.d[i] = o.d[i] ? 90 : 0; return o; };

const table = [];
for (const r of names) {
  const frames = []; for (let i = 0; fs.existsSync(`${X.dir}/${r.name}_${i}.png`); i++) frames.push(X.load(`${r.name}_${i}.png`));
  const meas = frames.map((_, i) => db[`s3_k1/${r.name}_${i}`] && fromApi(db[`s3_k1/${r.name}_${i}`].kps, 64, 64));
  const req = fs.existsSync(`${X.dir}/${r.name}.req.json`) && ['v3', 'legacy', 'v3tpl'].includes(r.route) ? JSON.parse(fs.readFileSync(`${X.dir}/${r.name}.req.json`)) : null;
  const rest = fromApi(db[`rot_${r.dir}`].kps, 64, 64), B = base[r.dir], fB = feet(B), sB = seg(rest), hipY = Math.round(mid(rest, ['LEFT HIP', 'RIGHT HIP']).y);
  const reqPoses = req?.poses?.length === frames.length ? req.poses : null;
  const adh = reqPoses ? frames.map((_, i) => poseErr(reqPoses[i], meas[i])) : null;
  const adhArms = reqPoses ? frames.map((_, i) => poseErr(reqPoses[i], meas[i], ARMS)) : null;
  // handedness: frames where the requested right hand is >4 px from rest
  const hf = reqPoses ? frames.map((_, i) => i).filter(i => Math.hypot(reqPoses[i]['RIGHT ARM'].x - rest['RIGHT ARM'].x, reqPoses[i]['RIGHT ARM'].y - rest['RIGHT ARM'].y) > 4) : [];
  const hand = hf.length ? +(hf.filter(i => handOk(reqPoses[i], meas[i])).length / hf.length).toFixed(2) : null;
  // which hand actually moved (measured): total displacement from rest
  const mv = s => meas.reduce((a, p) => a + Math.hypot(p[`${s} ARM`].x - rest[`${s} ARM`].x, p[`${s} ARM`].y - rest[`${s} ARM`].y), 0);
  const ft = frames.map(feet);
  const standing = r.action !== 'death' && !/death|falling/.test(r.action);
  const segs = meas.map(seg), segDev = k => +(segs.reduce((a, s) => a + Math.abs(s[k] / sB[k] - 1), 0) / segs.length).toFixed(2);
  const row = {
    name: r.name, route: r.route, n: frames.length, size: r.sizes?.join(), usage: r.usage?.generations ?? r.usage?.usd ?? null, unit: r.usage?.type, min: +(r.ms / 60000).toFixed(1),
    adhMean: adh ? +(adh.reduce((a, e) => a + e.mean, 0) / adh.length).toFixed(1) : null, adhArms: adhArms ? +(adhArms.reduce((a, e) => a + e.mean, 0) / adhArms.length).toFixed(1) : null,
    handOk: hand, moveR_L: `${mv('RIGHT').toFixed(0)}/${mv('LEFT').toFixed(0)}`,
    hDev: +(ft.reduce((a, f) => a + Math.abs(f.h - fB.h), 0) / ft.length).toFixed(1), // mean |bbox height - rotation height| px
    feetDrift: standing ? +Math.max(...ft.map(f => Math.hypot(f.x - fB.x, f.y - fB.y))).toFixed(1) : null,
    lowIoU: standing ? +(frames.reduce((a, F) => a + lowIoU(F, B, hipY + 2), 0) / frames.length).toFixed(2) : null,
    torsoDev: segDev('torso'), shoulderDev: segDev('shoulders'), headNeckDev: segDev('headNeck'),
    palFit: +(frames.reduce((a, F) => a + palFit(F), 0) / frames.length).toFixed(2), colors: Math.round(frames.reduce((a, F) => a + colors(F).size, 0) / frames.length), semiA: frames.reduce((a, F) => a + semi(F), 0), strayPx: frames.map(stray).join(','),
  };
  table.push(row);
  const S = 4, rows = [[B, ...frames].map(F => scale(F, S)), [scale(B, S), ...frames.map((F, i) => drawPose(scale(dim(F), S), meas[i], S, null, 1))]];
  if (reqPoses) rows.push([drawPose(scale(dim(B), S), rest, S, [0, 200, 0, 255], 1), ...frames.map((F, i) => drawPose(scale(dim(F), S), reqPoses[i], S, [0, 200, 0, 255], 1))]);
  X.save(`${r.name}.eval.png`, sheet(rows, { s: 1, checker: 16 }));
}
console.table(table);
fs.writeFileSync(`${X.dir}/eval_table.json`, JSON.stringify(table, null, 1));
