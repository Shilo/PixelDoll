// Visual evidence for the held-geometry probe: recomposed bench frames (real) and synthetic reversals, nearest-neighbor x3.
// Run from the repo root: node docs/research/2026-11-07-paperdoll-cycle/scripts/motion/render-sheets.ts [outDir]
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { runCase } from '../../../../../app/scripts/bench.ts';
import { recompose, type CellOut } from '../../../../../app/src/lib/items/items.ts';
import { encodePngBytes } from '../../../../../app/src/lib/image/pngraw.ts';
import { makeImg, type Img } from '../../../../../app/src/lib/image/png.ts';
import type { Keypoint, Rig } from '../../../../../app/src/lib/rig/rig.ts';

const OUT = process.argv[2] ?? 'C:/Programming_Files/Shilocity/PixelLab/checkouts/cycle-2026-11-07/motion';
mkdirSync(OUT, { recursive: true });
const FIX = new URL('../../../../../app/test/fixtures/bench/', import.meta.url);
const cases = JSON.parse(readFileSync(new URL('cases.json', FIX), 'utf8')) as { id: string; body: string; pad: number }[];
const S = 3;
function sheet(rows: Img[][]): Img {
  const w = rows[0][0].w, h = rows[0][0].h, cols = Math.max(...rows.map((r) => r.length)), o = makeImg(cols * w * S, rows.length * h * S);
  rows.forEach((r, ry) => r.forEach((im, cx) => { for (let y = 0; y < h * S; y++) for (let x = 0; x < w * S; x++) {
    const s = (((y / S) | 0) * w + ((x / S) | 0)) * 4, d = ((ry * h * S + y) * o.w + cx * w * S + x) * 4, a = im.data[s + 3];
    const bg = ((((x / S) | 0) >> 2) + (((y / S) | 0) >> 2)) % 2 ? 200 : 230; // checker background
    for (let k = 0; k < 3; k++) o.data[d + k] = a ? im.data[s + k] : bg;
    o.data[d + 3] = 255;
  } }));
  return o;
}
const reflect = (c: CellOut, [px, py]: [number, number]): CellOut => {
  const { w, h } = c.layer, layer = makeImg(w, h);
  for (let p = 0; p < c.mask.length; p++) if (c.mask[p]) { const x = Math.floor(2 * px - ((p % w) + 0.5)), y = Math.floor(2 * py - (((p / w) | 0) + 0.5)); if (x >= 0 && y >= 0 && x < w && y < h) layer.data.set(c.layer.data.subarray(p * 4, p * 4 + 4), (y * w + x) * 4); }
  return { ...c, layer };
};
for (const id of ['a-sword96', 'a-axe96']) {
  const c = cases.find((x) => x.id === id)!, res = await runCase(c as never), rig = JSON.parse(readFileSync(new URL(`body${c.body}.json`, FIX), 'utf8')).rig as Rig;
  const clipRow = (clip: string, rev?: number) => Array.from({ length: 8 }, (_, i) => {
    const x = res.cells.find((y) => y.key === `${clip}/${i}`)!;
    if (i !== rev) return recompose(x);
    const [a, d] = clip.split('/'), k = rig.animations.find((q) => q.id === a)!.sources![d as 'south']!.keypoints![i] as Keypoint[], q = k.find((p) => p.label === 'RIGHT ARM')!;
    return recompose(reflect(x, [q.x * rig.cell.w + c.pad, q.y * rig.cell.h + c.pad]));
  });
  writeFileSync(`${OUT}/${id}-slash-south-real.png`, await encodePngBytes(sheet([clipRow('slash/south'), clipRow('slash/north')])));
  writeFileSync(`${OUT}/${id}-walk-reversal.png`, await encodePngBytes(sheet([clipRow('walk/south'), clipRow('walk/south', 3), clipRow('walk/east'), clipRow('walk/east', 3)])));
}
console.log('sheets written to', OUT);
