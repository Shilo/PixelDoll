// E7b: does target_palette = base palette reduce body drift in edit-animation-v2 / transfer-outfit-v2?
import { experiment } from './lib/run.mjs';
import { toB64, fromB64 } from './lib/img.mjs';
import { b64img } from './lib/api.mjs';
import { deltas, basePalette } from './lib/diff.mjs';
import { sheet } from './lib/sheet.mjs';
const X = experiment('e7_limits');
const S = [...Array(8).keys()].map(i => X.load(`../e2_anim/walk_south_${i}.png`));
const pal = new Set(); S.forEach(F => basePalette(F).forEach(c => pal.add('#' + c.map(v => v.toString(16).padStart(2, '0')).join(''))));
const hex = [...pal].slice(0, 256); console.log('base palette colours', pal.size);
const fr = F => ({ image: b64img(toB64(F)), size: { width: 64, height: 64 } });
const desc = 'Add only a simple grey steel knight helmet covering the top and sides of the head to this south-facing pixel art character in every frame, identical design in all frames. Keep everything else unchanged.';
const helmetGrey = ['#2b2d33', '#4a4e57', '#6d727c', '#9399a3', '#c3c8cf'];
const runs = {
  ea2_pal: ['/edit-animation-v2', { description: desc, frames: S.map(fr), image_size: { width: 64, height: 64 }, no_background: true, seed: 7, target_palette: { colors: [...hex, ...helmetGrey].slice(0, 256) } }],
  to2_pal: ['/transfer-outfit-v2', { reference_image: fr(X.load('../e3_static/helmet__inpaint-v3.out0.png')), frames: S.map(fr), image_size: { width: 64, height: 64 }, no_background: true, seed: 7, target_palette: { colors: [...hex, ...helmetGrey].slice(0, 256) }, additional_instructions: 'Only add the helmet from the reference; keep the body unchanged.' }],
};
const res = await Promise.all(Object.entries(runs).map(async ([k, [p, b]]) => { try { return [k, await X.api.run(p, b)]; } catch (e) { console.log(k, 'ERR', e.message.slice(0, 300)); return [k, null]; } }));
for (const [k, r] of res) {
  if (!r) continue; const outs = r.jobs[0].last_response.images.map(i => fromB64(i.base64));
  let exact = 0, le8 = 0, le18 = 0, body = 0;
  outs.forEach((o, i) => { X.save(`${k}_out${i}.png`, o); const { dm } = deltas(S[i], o); for (let p = 0; p < dm.length; p++) { const y = (p / 64) | 0; if (!S[i].d[p * 4 + 3] || y < 24) continue; body++; if (dm[p] === 0 && o.d[p * 4 + 3] === S[i].d[p * 4 + 3]) exact++; if (dm[p] <= 8) le8++; if (dm[p] <= 18) le18++; } });
  console.log(k, JSON.stringify(r.jobs[0].usage), r.totalMs + 'ms', 'body px below head (y>=24):', body, 'exact', (100 * exact / body).toFixed(1) + '%', '<=8', (100 * le8 / body).toFixed(1) + '%', '<=18', (100 * le18 / body).toFixed(1) + '%', 'n_colors', r.jobs[0].last_response.quantized_image_n_colors);
  X.save(`${k}_sheet.png`, sheet([S, outs], { s: 3 }));
}
