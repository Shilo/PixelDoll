// S3/K6: item layers from the "pose the dressed chroma keyframe" route, drawn over the BASE frames of the same keypoints+seed.
// Offline. QA: specks, area CV, grip side vs base-frame wrist keypoints, helmet head-anchor offset spread, key px outside base.
import fs from 'node:fs';
import { experiment } from './lib/run.mjs';
import { over } from './lib/img.mjs';
import { chromaMask, dropKeyOutline, despill, keyOutside } from './lib/chroma.mjs';
import { layerFrom, components } from './lib/diff.mjs';
import { minArea } from './lib/clean.mjs';
import { fromApi, mid, HEAD, gripSide } from './lib/skel.mjs';
import { sheet } from './lib/sheet.mjs';
const X = experiment('s3_k6');
const db = JSON.parse(fs.readFileSync(`${X.dir}/../s3_skel/skel.json`));
const clip = pre => { const o = []; for (let i = 0; fs.existsSync(`${X.dir}/${pre}_${i}.png`); i++) o.push(X.load(`${pre}_${i}.png`)); return o; };
const res = {};
for (const k of ['raw_%_slash_south_s7', 'raw_%_slash_east_s7', '%_walking-8-frames_south_s7', '%_walking-8-frames_east_s7', '%_cross-punch_south_s7', '%_cross-punch_east_s7']) {
  const B = clip(k.replace('%', 'base')), D = clip(k.replace('%', 'dressed')); if (!B.length || D.length !== B.length) continue;
  const rows = [B, D, [], []], per = [];
  B.forEach((Bi, i) => {
    const m = minArea(dropKeyOutline(chromaMask(D[i], 'green'), Bi, D[i], 'green'), 64, 64, 2), L = despill(layerFrom(D[i], m), 'green');
    rows[2].push(L); rows[3].push(over(Bi, L));
    const P = fromApi(db[`s3_k6/${k.replace('%', 'base')}_${i}`].kps, 64, 64), px = [];
    for (let p = 0; p < m.length; p++) if (L.d[p * 4 + 3]) px.push([p % 64 + 0.5, ((p / 64) | 0) + 0.5]);
    // split helmet / sword by connected component: a component whose centroid is within 8 px of the head centre is helmet
    const H = mid(P, HEAD), { labels, comps } = components(m, 64, 64), cen = comps.map(() => [0, 0, 0]);
    for (let p = 0; p < m.length; p++) if (labels[p] >= 0) { const c = cen[labels[p]]; c[0] += p % 64 + 0.5; c[1] += ((p / 64) | 0) + 0.5; c[2]++; }
    const isHel = cen.map(([x, y, n]) => Math.hypot(x / n - H.x, y / n - H.y) <= 8);
    const hel = [], sw = []; for (let p = 0; p < m.length; p++) if (labels[p] >= 0 && L.d[p * 4 + 3]) (isHel[labels[p]] ? hel : sw).push([p % 64 + 0.5, ((p / 64) | 0) + 0.5]);
    const dmin = (pts, kk) => pts.length ? Math.min(...pts.map(([x, y]) => Math.hypot(x - P[kk].x, y - P[kk].y))) : 99;
    const hc = hel.length ? hel.reduce((a, [x]) => a + x, 0) / hel.length - mid(P, HEAD).x : null;
    const spk = components(m, 64, 64).comps.filter(c => c.area <= 2).length;
    per.push({ area: px.length, side: gripSide(dmin(sw, 'RIGHT ARM'), dmin(sw, 'LEFT ARM'), Math.hypot(P['RIGHT ARM'].x - P['LEFT ARM'].x, P['RIGHT ARM'].y - P['LEFT ARM'].y)), hdx: hc, keyOut: keyOutside(Bi, D[i], 'green'), specks: spk });
  });
  const a = per.map(p => p.area), mu = a.reduce((s, v) => s + v, 0) / a.length, cv = Math.sqrt(a.reduce((s, v) => s + (v - mu) ** 2, 0) / a.length) / mu, hd = per.map(p => p.hdx).filter(v => v != null);
  res[k.replace('%_', '')] = { n: B.length, areaCV: +cv.toFixed(2), grip_R_L_amb_none: ['R', 'L', 'amb', 'none'].map(s => per.filter(p => p.side === s).length).join('/'), helmetDxSpread: +(Math.max(...hd) - Math.min(...hd)).toFixed(1), keyOutsideMax: Math.max(...per.map(p => p.keyOut)), specks: per.reduce((s, p) => s + p.specks, 0) };
  X.save(`items_${k.replace('%_', '')}.png`, sheet(rows, { s: 3 }));
}
console.table(res); fs.writeFileSync(`${X.dir}/k6_items.json`, JSON.stringify(res, null, 1));
