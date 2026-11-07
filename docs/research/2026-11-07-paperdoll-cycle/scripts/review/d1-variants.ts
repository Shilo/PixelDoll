// Review of 735b92d3: D1 gray share under three rules on every real keyframe we have (T3 cape keys from the helmet-occlusion
// fixture, every bench keyframe of a colorful item) plus synthetic dark blotches.
//   parent:  every opaque px counts (outlines are gray by saturation)
//   current: near-black px (max channel < 48) never count
//   blob:    near-black px count only inside a near-black blob: px covered by some fully near-black 3x3 window (a 3x3
//            morphological opening), so outlines and interior lines up to 2 px thick never count and a dark blotch does
// Run from the repo root: node docs/research/2026-11-07-paperdoll-cycle/scripts/review/d1-variants.ts
import { readFileSync } from 'node:fs';
import { makeImg, type Img } from '../../../../../app/src/lib/image/png.ts';
import { FIX } from '../extraction/lib.ts';
import { NEW, OLD, run, type Case } from './compare-735b.ts';

const median = (a: number[]) => { const s = [...a].sort((x, y) => x - y); return s.length ? s[s.length >> 1] : 0; };
function lineShare(L: Img) {
  const w = L.w, h = L.h, op = (x: number, y: number) => x >= 0 && y >= 0 && x < w && y < h && L.data[(y * w + x) * 4 + 3] > 0;
  const dark = (x: number, y: number) => op(x, y) && Math.max(L.data[(y * w + x) * 4], L.data[(y * w + x) * 4 + 1], L.data[(y * w + x) * 4 + 2]) < 48;
  const sat: number[] = [];
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    if (!op(x, y)) continue;
    const i = (y * w + x) * 4, mx = Math.max(L.data[i], L.data[i + 1], L.data[i + 2]), mn = Math.min(L.data[i], L.data[i + 1], L.data[i + 2]);
    if (mx < 48) {
      let blob = false;
      for (let cy = y - 1; cy <= y + 1 && !blob; cy++) for (let cx = x - 1; cx <= x + 1 && !blob; cx++) {
        let all = true;
        for (let dy = -1; dy <= 1 && all; dy++) for (let dx = -1; dx <= 1 && all; dx++) all = dark(cx + dx, cy + dy);
        blob = all;
      }
      if (!blob) continue;
    }
    sat.push(mx ? (mx - mn) / mx : 0);
  }
  return sat.length && median(sat) >= 0.4 ? sat.filter((v) => v < 0.25).length / sat.length : 0;
}
const fx = JSON.parse(readFileSync(new URL('../helmet-occlusion.json', FIX), 'utf8'));
const decode = (im: { w: number; h: number; runs: number[][] }) => { const o = makeImg(im.w, im.h); for (const [s, n, ...rgba] of im.runs) for (let p = s; p < s + n; p++) o.data.set(rgba, p * 4); return o; };
const row = (name: string, L: Img) => console.log(name.padEnd(34), 'parent', OLD.grayShare(L).toFixed(3), 'current', NEW.grayShare(L).toFixed(3), 'blob', lineShare(L).toFixed(3));
for (const d of ['south', 'east', 'north']) row(`T3 red cape ${d}`, decode(fx.capeKeys[d]));
const cases: Case[] = JSON.parse(readFileSync(new URL('cases.json', FIX), 'utf8'));
for (const c of cases) { const r = await run(NEW, c, false); for (const k of r.kf) row(`${c.id} ${k.key}`, k.layer); }
// synthetic: a 24x24 blue design with a 1 px black outline, then with an interior dark blotch (6x6 = 6.25 % of the area)
const S = 26, design = (blotch?: number[]) => {
  const L = makeImg(S, S);
  for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) L.data.set(x === 0 || y === 0 || x === S - 1 || y === S - 1 ? [10, 10, 12, 255] : [40, 90, 220, 255], (y * S + x) * 4);
  if (blotch) for (let y = 9; y < 15; y++) for (let x = 9; x < 15; x++) L.data.set([...blotch, 255], (y * S + x) * 4);
  return L;
};
row('synthetic outlined', design());
row('synthetic outlined + black blotch', design([20, 20, 20]));
row('synthetic outlined + dark gray blotch', design([45, 42, 40]));
row('synthetic outlined + mid gray blotch', design([90, 88, 85]));
// a thick (2 px) black outline: the boundary ring is edge, the inner ring is not in a solid 2x2 block of its own? (it is)
const thick = makeImg(S, S);
for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) thick.data.set(x < 2 || y < 2 || x >= S - 2 || y >= S - 2 ? [10, 10, 12, 255] : [40, 90, 220, 255], (y * S + x) * 4);
row('synthetic 2 px black outline', thick);
