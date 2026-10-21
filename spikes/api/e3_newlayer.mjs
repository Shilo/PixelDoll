import fs from 'node:fs'; import { decode, over } from './lib/img.mjs'; import { maskExact } from './lib/diff.mjs';
const d = 'out/e3_static/', L = f => decode(fs.readFileSync(d + f));
const B = L('../e2_anim/walk_south_0.png'); const reg = { x: 22, y: 2, w: 21, h: 21 };
for (const t of process.argv.slice(2)) {
  const O = L(t); let opq = 0, same = 0, outside = 0, semi = 0;
  for (let p = 0; p < B.w * B.h; p++) { const i = p * 4, x = p % B.w, y = (p / B.w) | 0, inR = x >= reg.x && y >= reg.y && x < reg.x + reg.w && y < reg.y + reg.h;
    if (O.d[i + 3]) { opq++; if (!inR) outside++; if (O.d[i + 3] < 255) semi++; if (B.d[i + 3] && O.d[i] === B.d[i] && O.d[i + 1] === B.d[i + 1] && O.d[i + 2] === B.d[i + 2] && O.d[i + 3] === B.d[i + 3]) same++; } }
  const C = over(B, O); const ch = maskExact(B, C).reduce((a, b) => a + b, 0);
  console.log(t, { opaque: opq, identicalToBase: same, outsideMask: outside, semiAlpha: semi, changedAfterOver: ch });
}
