// E7: frame-cap limits and images vs quantized_images; 16-frame cross-direction edit-animation-v2.
import { experiment } from './lib/run.mjs';
import { toB64, fromB64, colors } from './lib/img.mjs';
import { b64img } from './lib/api.mjs';
import { maskExact, layerFrom, layerStats, paletteJaccard } from './lib/diff.mjs';
import { VARIANTS } from './lib/extract.mjs';
import { sheet } from './lib/sheet.mjs';
const X = experiment('e7_limits');
const fr = F => ({ image: b64img(toB64(F)), size: { width: F.w, height: F.h } });
const S = [...Array(8).keys()].map(i => X.load(`../e2_anim/walk_south_${i}.png`)), E = [...Array(8).keys()].map(i => X.load(`../e2_anim/walk_east_${i}.png`));
const D4 = [...Array(8).keys()].map(i => X.load(`../e2_anim/d4walk_south_${i}.png`));
const desc = 'Add only a simple grey steel knight helmet covering the top and sides of the head to this pixel art character in every frame, identical design in all frames. Keep everything else unchanged.';
const tryCall = async (label, p, b) => { const t0 = Date.now(); try { const r = await X.api.run(p, b); console.log(label, 'OK', Date.now() - t0, 'ms', JSON.stringify(r.jobs[0]?.usage)); return r; } catch (e) { console.log(label, 'ERR', e.status, e.message.slice(0, 300)); } };
// limits (expected rejections should be free)
await tryCall('ea2 5 frames @92px (cap 4)', '/edit-animation-v2', { description: desc, frames: D4.slice(0, 5).map(fr), image_size: { width: 92, height: 92 }, no_background: true });
await tryCall('to2 16 frames @64 (cap 15)', '/transfer-outfit-v2', { reference_image: fr(X.load('../e3_static/helmet__inpaint-v3.out0.png')), frames: [...S, ...E].map(fr), image_size: { width: 64, height: 64 }, no_background: true });
await tryCall('ea2 17 frames @64 (cap 16)', '/edit-animation-v2', { description: desc, frames: [...S, ...E, S[0]].map(fr), image_size: { width: 64, height: 64 }, no_background: true });
// 16 frames, south+east in one call: is the helmet consistent across both directions? also images vs quantized_images
const r = await tryCall('ea2 16 frames south+east', '/edit-animation-v2', { description: desc, frames: [...S, ...E].map(fr), image_size: { width: 64, height: 64 }, no_background: true, seed: 7 });
if (r) {
  const lr = r.jobs[0].last_response, outs = lr.images.map(i => fromB64(i.base64)), q = (lr.quantized_images || []).map(i => fromB64(i.base64));
  console.log('n images', outs.length, 'n quantized', q.length, 'n_colors orig/quant', lr.original_image_n_colors, lr.quantized_image_n_colors);
  if (q.length) console.log('images vs quantized: px differing frame0', maskExact(outs[0], q[0]).reduce((a, b) => a + b, 0), 'colors', colors(outs[0]).size, colors(q[0]).size);
  const base = [...S, ...E]; let L0; const rows = [[], []];
  outs.forEach((o, i) => { X.save(`ea2_16_out${i}.png`, o); const L = layerFrom(o, VARIANTS.novel_cc(base[i], o, { x: 0, y: 0, w: 64, h: 24 })); const s = layerStats(L); L0 ??= s; console.log(i < 8 ? 'S' : 'E', i % 8, 'changed', maskExact(base[i], o).reduce((a, b) => a + b, 0), 'headLayerPx', s.area, 'palJ0', paletteJaccard(s.palette, L0.palette)); rows[i < 8 ? 0 : 1].push(o); });
  X.save('ea2_16_sheet.png', sheet(rows, { s: 3 }));
}
