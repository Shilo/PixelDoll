// S3/K4: skeleton as anchors + QA. Offline over s3_skel/skel.json (run s3_skel.mjs first; repeat noise: s3_skel.mjs s2_base/b48walk_south_0 3).
// 1) estimator repeat noise, 2) head keypoint vs patch-tracked head, 3) left/right label consistency, 4) retro QA of S2 layers.
import fs from 'node:fs';
import { experiment } from './lib/run.mjs';
import { canvasTo, bbox } from './lib/img.mjs';
import { fromApi, mid, HEAD, LABELS, gripSide } from './lib/skel.mjs';
import { track } from './lib/clean.mjs';
const X = experiment('s3_k4');
const db = JSON.parse(fs.readFileSync(`${X.dir}/../s3_skel/skel.json`));
const pad = B => B.w === 48 ? canvasTo(B, 64, 64, 8, 16) : B;
const P = id => fromApi(db[id].kps, 64, 64);
const out = {};

// 1) repeat noise: same image estimated N times
const reps = {}; for (const k of Object.keys(db).filter(k => k.includes('#'))) (reps[k.split('#')[0]] ??= []).push(fromApi(db[k].kps, 64, 64));
out.repeatNoisePx = Object.fromEntries(Object.entries(reps).map(([id, ps]) => [id, +Math.max(...LABELS.map(l => Math.max(...ps.map(p => Math.hypot(p[l].x - ps[0][l].x, p[l].y - ps[0][l].y))))).toFixed(2)]));

// 2) head anchor: keypoint head centre vs patch tracking of the frame-0 head patch (13x13), per clip
const clips = { walk_south: 8, walk_east: 8, walk_north: 8, punch_south: 6, punch_east: 6 };
const img = id => { const m = id.match(/^(walk|punch)_(\w+)_(\d+)$/); return m ? pad(X.load(`../s2_base/b48${m[1]}_${m[2]}_${m[3]}.png`)) : X.load(`../${id}.png`); };
for (const n of fs.readdirSync(`${X.dir}/../s3_k1`).filter(f => /_v3_s7_0\.png$/.test(f))) clips[`s3_k1/${n.replace(/_0\.png$/, '')}`] = fs.readdirSync(`${X.dir}/../s3_k1`).filter(f => f.startsWith(n.replace(/0\.png$/, '')) && /_\d+\.png$/.test(f)).length;
out.head = {}; out.labels = {}; out.jitter = {};
for (const [c, n] of Object.entries(clips)) {
  const ids = [...Array(n).keys()].map(i => `${c}_${i}`).filter(id => db[id]); if (ids.length < 3) continue;
  const ims = ids.map(img), ps = ids.map(P), h0 = mid(ps[0], HEAD);
  const r = { x: Math.round(h0.x) - 6, y: Math.round(h0.y) - 6, w: 13, h: 13 };
  const errs = ids.map((_, i) => { const [dx, dy] = track(ims[0], ims[i], r, 6), h = mid(ps[i], HEAD); return Math.hypot(h.x - h0.x - dx, h.y - h0.y - dy); });
  const topErr = ids.map((_, i) => Math.abs((mid(ps[i], HEAD).y - h0.y) - (bbox(ims[i], 127).y - bbox(ims[0], 127).y)));
  out.head[c] = { meanErrPx: +(errs.reduce((a, b) => a + b, 0) / errs.length).toFixed(2), maxErrPx: +Math.max(...errs).toFixed(2), headY_vs_silhouetteTop_meanPx: +(topErr.reduce((a, b) => a + b, 0) / topErr.length).toFixed(2) };
  // 3) label consistency: south R.x < L.x, north R.x > L.x (shoulders and hips); east: right shoulder drawn in front (z_R >= z_L)
  const dir = c.includes('south') ? 'south' : c.includes('north') ? 'north' : 'east';
  const ok = ps.map(p => dir === 'south' ? p['RIGHT SHOULDER'].x < p['LEFT SHOULDER'].x && p['RIGHT HIP'].x < p['LEFT HIP'].x : dir === 'north' ? p['RIGHT SHOULDER'].x > p['LEFT SHOULDER'].x && p['RIGHT HIP'].x > p['LEFT HIP'].x : p['RIGHT SHOULDER'].z >= p['LEFT SHOULDER'].z);
  out.labels[c] = `${ok.filter(Boolean).length}/${ok.length}`;
  // temporal jitter of slow joints: mean |2nd difference| (px) of NECK and hip centre along the clip (lower = smoother)
  const sd = f => { const v = ps.map(f); let s = 0; for (let i = 1; i < v.length - 1; i++) s += Math.hypot(v[i + 1].x - 2 * v[i].x + v[i - 1].x, v[i + 1].y - 2 * v[i].y + v[i - 1].y); return +(s / (v.length - 2)).toFixed(2); };
  out.jitter[c] = { neck: sd(p => p.NECK), hips: sd(p => mid(p, ['LEFT HIP', 'RIGHT HIP'])), head: sd(p => mid(p, HEAD)) };
}

// 4) retro QA of S2 sword/helmet layers (padded 48->64 base, same coords as the skeletons)
const qa = {};
for (const run of ['sword48_A', 'sword48_Ba', 'sword48_B', 'sword48_C', 'helmet48_A', 'helmet48_Ba']) {
  const cells = JSON.parse(fs.readFileSync(`${X.dir}/../s2_x4/${run}.cells.json`));
  qa[run] = cells.map((c, j) => {
    const id = c.id.replace(/^b48/, ''), p = db[id] && P(id); if (!p) return null;
    const L = X.load(`../s2_x4/${run}.layer${j}.png`), px = [];
    for (let i = 0; i < L.d.length; i += 4) if (L.d[i + 3]) px.push([(i / 4) % 64 + 0.5, ((i / 4 / 64) | 0) + 0.5]);
    const dmin = k => px.length ? +Math.min(...px.map(([x, y]) => Math.hypot(x - p[k].x, y - p[k].y))).toFixed(1) : 99;
    const head = mid(p, HEAD), cx = px.length ? px.reduce((a, [x]) => a + x, 0) / px.length : 0;
    return run.startsWith('sword') ? { id, dR: dmin('RIGHT ARM'), dL: dmin('LEFT ARM'), side: gripSide(dmin('RIGHT ARM'), dmin('LEFT ARM'), Math.hypot(p['RIGHT ARM'].x - p['LEFT ARM'].x, p['RIGHT ARM'].y - p['LEFT ARM'].y)) } : { id, dx: +(cx - head.x).toFixed(1), topY: Math.min(...px.map(q => q[1])), eyeY: +mid(p, ['RIGHT EYE', 'LEFT EYE']).y.toFixed(1) };
  }).filter(Boolean);
}
out.retroQA = Object.fromEntries(Object.entries(qa).map(([run, rows]) => {
  const groups = {}; for (const r of rows) (groups[r.id.replace(/_\d+$/, '')] ??= []).push(r);
  return [run, Object.fromEntries(Object.entries(groups).map(([g, rs]) => [g, rs[0].dR !== undefined ? `R/L/amb/none ${['R', 'L', 'amb', 'none'].map(k => rs.filter(r => r.side === k).length).join('/')} (dR ${rs.map(r => r.dR).join(',')} | dL ${rs.map(r => r.dL).join(',')})` : `helmet |dx| max ${Math.max(...rs.map(r => Math.abs(r.dx)))} px, top-eye ${Math.min(...rs.map(r => r.eyeY - r.topY)).toFixed(1)}..${Math.max(...rs.map(r => r.eyeY - r.topY)).toFixed(1)} px`]))];
}));
fs.writeFileSync(`${X.dir}/k4.json`, JSON.stringify(out, null, 1));
console.log(JSON.stringify(out, null, 1));
