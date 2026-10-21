// E8 (offline, answers architecture O2): propagate a rigid item layer made on walk frame 0 to frames 1..7 by integer
// translation found by patch-tracking the head (or hand) region of the frozen base. Zero AI calls.
import fs from 'node:fs';
import { experiment } from './lib/run.mjs';
import { make, over } from './lib/img.mjs';
import { layerFrom, deltas } from './lib/diff.mjs';
import { VARIANTS } from './lib/extract.mjs';
import { ITEMS } from './e3_static.mjs';
import { sheet } from './lib/sheet.mjs';
const X = experiment('e8_propagate');
const F = [...Array(8).keys()].map(i => X.load(`../e2_anim/walk_south_${i}.png`));
const shift = (L, dx, dy) => { const o = make(L.w, L.h); for (let y = 0; y < L.h; y++) for (let x = 0; x < L.w; x++) { const sx = x - dx, sy = y - dy; if (sx < 0 || sy < 0 || sx >= L.w || sy >= L.h) continue; o.d.set(L.d.subarray((sy * L.w + sx) * 4, (sy * L.w + sx) * 4 + 4), (y * L.w + x) * 4); } return o; };
// SAD over a patch (premultiplied RGB + alpha) between frame0 patch and frame i shifted by (dx,dy)
function track(A, B, r, R = 4) {
  let best = [0, 0, 1e18];
  for (let dy = -R; dy <= R; dy++) for (let dx = -R; dx <= R; dx++) {
    let s = 0;
    for (let y = r.y; y < r.y + r.h; y++) for (let x = r.x; x < r.x + r.w; x++) { const X2 = x + dx, Y2 = y + dy; const i = (y * A.w + x) * 4; if (X2 < 0 || Y2 < 0 || X2 >= B.w || Y2 >= B.h) { s += 255 * 4; continue; } const j = (Y2 * B.w + X2) * 4; for (let c = 0; c < 4; c++) s += Math.abs(A.d[i + c] * (c < 3 ? A.d[i + 3] / 255 : 1) - B.d[j + c] * (c < 3 ? B.d[j + 3] / 255 : 1)); }
    if (s < best[2]) best = [dx, dy, s];
  }
  return best;
}
const ea2 = JSON.parse('[' + fs.readFileSync(`${X.dir}/../e4_anim/results.jsonl`, 'utf8').trim().split('\n').join(',') + ']');
for (const [item, patch] of [['helmet', { x: 24, y: 6, w: 17, h: 16 }], ['sword', { x: 17, y: 34, w: 10, h: 10 }]]) {
  const L0 = layerFrom(X.load(`../e3_static/${item}__inpaint-v3.out0.png`), VARIANTS.slot_novel2_grow1(F[0], X.load(`../e3_static/${item}__inpaint-v3.out0.png`), ITEMS[item].region));
  const rows = [[], []], offs = [];
  for (let i = 0; i < 8; i++) {
    const [dx, dy, sad] = i ? track(F[0], F[i], patch) : [0, 0, 0]; offs.push([dx, dy, +(sad / (patch.w * patch.h)).toFixed(1)]);
    const Li = shift(L0, dx, dy); X.save(`${item}_prop_layer${i}.png`, Li); rows[0].push(Li); rows[1].push(over(F[i], Li));
  }
  // compare with where edit-animation-v2 put the item (centroid of its extracted layer)
  const gen = ea2.find(r => r.item === item && r.dir === 'south' && r.route === 'ea2');
  console.log(item, 'offsets [dx,dy,meanSAD/px]', JSON.stringify(offs), '| ea2 layer centroid rel. anchor per frame', JSON.stringify(gen?.frames.map(f => f.centroidRelAnchor)));
  X.save(`${item}_prop_sheet.png`, sheet(rows, { s: 3 }));
}
