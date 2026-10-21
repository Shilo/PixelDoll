// Body drift distribution for earlier no-palette runs (below head, y>=24), for comparison.
import { experiment } from './lib/run.mjs';
import { deltas } from './lib/diff.mjs';
const X = experiment('e7_limits');
for (const tag of ['helmet_south__ea2', 'helmet_south__to2', 'helmet_south__pfi', 'helmet_south__pfe-ref']) {
  let exact = 0, le8 = 0, le18 = 0, body = 0;
  for (let i = 0; i < 8; i++) { const B = X.load(`../e2_anim/walk_south_${i}.png`), o = X.load(`../e4_anim/${tag}.out${i}.png`), { dm } = deltas(B, o); for (let p = 0; p < dm.length; p++) { if (!B.d[p * 4 + 3] || p / 64 < 24) continue; body++; if (dm[p] === 0 && o.d[p * 4 + 3] === B.d[p * 4 + 3]) exact++; if (dm[p] <= 8) le8++; if (dm[p] <= 18) le18++; } }
  console.log(tag, 'exact', (100 * exact / body).toFixed(1) + '%', '<=8', (100 * le8 / body).toFixed(1) + '%', '<=18', (100 * le18 / body).toFixed(1) + '%');
}
