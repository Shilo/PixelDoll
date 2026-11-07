// Free: a review sheet for lpc-fairness.md. Rows: LPC male south walk/0, light and coffee skin, with the LPC black suspenders and a
// synthetic 1 px black strap. Columns: body, extractor input (toChroma + item), shipped mask under prod, hueGate, stroke, hueStroke
// (item px kept white, item px lost red, false px yellow). Writes OUT/sheet.png, 4x zoom.
// Run from the repo root: node docs/research/2026-11-07-paperdoll-cycle/scripts/lpc-fairness/sheet.ts
import { mkdirSync, writeFileSync } from 'node:fs';
import { toChroma } from '../../../../../app/src/lib/image/chroma.ts';
import { encodePngBytes } from '../../../../../app/src/lib/image/pngraw.ts';
import { makeImg, type Img } from '../../../../../app/src/lib/image/png.ts';
import { lpcCell, over, palettes, recolor } from './lpc.ts';
import { OUT, pipe, RULES } from './lpc-fairness.ts';

const BODY = palettes('body/body_ulpc.json'), LPCR = palettes('body/body_lpcr.json'), Z = 4, N = 64, COLS = ['prod', 'hueGate', 'stroke', 'hueStroke'];
const rowsOut: Img[][] = [];
for (const pal of [BODY.light, LPCR.coffee]) {
  const B = recolor(over(lpcCell('body/bodies/male/walk.png', 'south', 0), lpcCell('head/heads/human/male/walk.png', 'south', 0)), BODY.light, pal).img;
  const belt = lpcCell('torso/waist/belt_leather/male/walk/charcoal.png', 'south', 0);
  let y0 = N, sx = 0, n = 0;
  for (let p = 0; p < N * N; p++) if (belt.data[p * 4 + 3]) { y0 = Math.min(y0, (p / N) | 0); sx += p % N; n++; }
  const strap = makeImg(N, N), cx = Math.round(sx / n);
  for (let x = cx - 10; x <= cx + 10; x++) if (B.data[((y0 + 1) * N + x) * 4 + 3]) strap.data.set([40, 34, 36, 255], ((y0 + 1) * N + x) * 4);
  for (const item of [lpcCell('torso/aprons/suspenders/male/walk/black.png', 'south', 0), strap]) {
    const C = over(toChroma(B, 'green'), item), row = [B, C];
    for (const r of COLS) {
      const m = pipe(C, B, RULES[r]).mask, v = makeImg(N, N);
      for (let p = 0; p < N * N; p++) {
        const own = item.data[p * 4 + 3] > 0;
        v.data.set(own ? (m[p] ? [255, 255, 255, 255] : [230, 40, 40, 255]) : m[p] ? [250, 220, 0, 255] : B.data[p * 4 + 3] ? [60, 60, 70, 255] : [20, 20, 24, 255], p * 4);
      }
      row.push(v);
    }
    rowsOut.push(row);
  }
}
const W = rowsOut[0].length * (N + 2) * Z, H = rowsOut.length * (N + 2) * Z, S = makeImg(W, H);
rowsOut.forEach((row, ry) => row.forEach((im, rx) => { for (let y = 0; y < N * Z; y++) for (let x = 0; x < N * Z; x++) { const s = (((y / Z) | 0) * N + ((x / Z) | 0)) * 4; if (im.data[s + 3]) S.data.set(im.data.subarray(s, s + 4), ((ry * (N + 2) * Z + y) * W + rx * (N + 2) * Z + x) * 4); } }));
mkdirSync(OUT, { recursive: true });
writeFileSync(OUT + 'sheet.png', await encodePngBytes(S));
console.log('wrote', OUT + 'sheet.png');
