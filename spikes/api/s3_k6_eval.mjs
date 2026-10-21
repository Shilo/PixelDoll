// S3/K6 eval: pixel alignment of skeleton-v3 outputs across keyframes (base / chroma / dressed) and repeat runs,
// plus intra-clip body stability vs the S2 template walk and raw v3. Offline.
import fs from 'node:fs';
import { experiment } from './lib/run.mjs';
import { canvasTo, over, colors } from './lib/img.mjs';
import { chromaMask, dropKeyOutline, despill, keyOutside } from './lib/chroma.mjs';
import { layerFrom } from './lib/diff.mjs';
import { minArea } from './lib/clean.mjs';
import { sheet } from './lib/sheet.mjs';
const X = experiment('s3_k6');
const has = f => fs.existsSync(`${X.dir}/${f}`);
const clip = (pre, dir = X.dir) => { const o = []; for (let i = 0; fs.existsSync(`${dir}/${pre}_${i}.png`); i++) o.push(X.load(`${dir}/${pre}_${i}.png`)); return o; };
const op = (im, p) => im.d[p * 4 + 3] > 127;
const iou = (A, B) => { let i = 0, u = 0; for (let p = 0; p < A.w * A.h; p++) { const a = op(A, p), b = op(B, p); if (a && b) i++; if (a || b) u++; } return u ? i / u : 1; };
const exact = (A, B) => { let s = 0, n = 0; for (let p = 0; p < A.w * A.h; p++) { if (!op(A, p) && !op(B, p)) continue; n++; const i = p * 4; if (A.d[i] === B.d[i] && A.d[i + 1] === B.d[i + 1] && A.d[i + 2] === B.d[i + 2] && op(A, p) === op(B, p)) s++; } return n ? s / n : 1; };
// best integer translation (|d|<=3) maximising silhouette IoU: separates "same pose, shifted" from "different pose"
const bestShift = (A, B) => { let best = [0, 0, iou(A, B)]; for (let dy = -3; dy <= 3; dy++) for (let dx = -3; dx <= 3; dx++) { const v = iou(A, canvasTo(B, B.w, B.h, dx, dy)); if (v > best[2]) best = [dx, dy, v]; } return best; };
const mean = a => a.reduce((s, v) => s + v, 0) / (a.length || 1), f3 = v => +v.toFixed(3);
const stab = fr => f3(mean(fr.slice(1).map((F, i) => exact(fr[i], F)))); // consecutive-frame exact-pixel share

const out = { intraClip: {}, align: {} };
// intra-clip stability references
const pad = B => B.w === 48 ? canvasTo(B, 64, 64, 8, 16) : B;
for (const d of ['south', 'east']) out.intraClip[`template walk ${d} (S2)`] = { stable: stab([...Array(8).keys()].map(i => pad(X.load(`../s2_base/b48walk_${d}_${i}.png`)))), colors: colors(pad(X.load(`../s2_base/b48walk_${d}_0.png`))).size };
for (const n of ['slash_south_v3_s7', 'slash_east_v3_s7', 'walk_south_v3tpl_s7', 'walk_east_v3tpl_s7']) out.intraClip[`raw v3 ${n} (K1)`] = { stable: stab(clip(n, `${X.dir}/../s3_k1`)) };
for (const n of ['walking-8-frames_south_charsk_s7', 'walking-8-frames_east_charsk_s7']) out.intraClip[`managed skeleton-v3 ${n} (K1, b48 char)`] = { stable: stab(clip(n, `${X.dir}/../s3_k1`)) };

const rows = [];
for (const [kind, pre] of [['anim', t => `${t}_walking-8-frames_south_s7`], ['anim', t => `${t}_walking-8-frames_east_s7`], ['anim', t => `${t}_cross-punch_south_s7`], ['anim', t => `${t}_cross-punch_east_s7`], ['raw', t => `raw_${t}_slash_south_s7`], ['raw', t => `raw_${t}_slash_east_s7`]]) {
  const B = clip(pre('base')); if (!B.length) continue;
  const C = clip(pre('chroma')), D = clip(pre('dressed')), R = has(`${pre('base')}_rep_0.png`) ? clip(`${pre('base')}_rep`) : [];
  const key = pre('base').replace(/^(raw_)?base_/, '$1');
  const r = { n: B.length, intraStable: stab(B) };
  if (R.length) Object.assign(r, { repIoU: f3(mean(B.map((F, i) => iou(F, R[i])))), repExact: f3(mean(B.map((F, i) => exact(F, R[i])))) });
  if (C.length === B.length) { r.chromaIoU = f3(mean(B.map((F, i) => iou(F, C[i])))); r.chromaIoUmin = f3(Math.min(...B.map((F, i) => iou(F, C[i])))); r.chromaBestShift = B.map((F, i) => bestShift(F, C[i]).slice(0, 2).join(',')).join(' '); }
  if (D.length === B.length) {
    // dressed: key body silhouette vs base silhouette; item = non-key px (S2 extractor) drawn over the BASE frame
    const L = D.map((F, i) => despill(layerFrom(F, minArea(dropKeyOutline(chromaMask(F, 'green'), B[i], F, 'green'), 64, 64, 2)), 'green'));
    r.dressedKeyOutside = f3(mean(B.map((F, i) => keyOutside(F, D[i], 'green'))));
    r.dressedIoU = f3(mean(B.map((F, i) => iou(F, D[i]))));
    rows.push(B, C.length ? C : B.map(() => null), D, B.map((F, i) => over(F, L[i])));
  }
  out.align[key] = r;
}
X.save('k6_align_sheet.png', sheet(rows, { s: 2 }));
fs.writeFileSync(`${X.dir}/k6_eval.json`, JSON.stringify(out, null, 1));
console.log(JSON.stringify(out, null, 1));
