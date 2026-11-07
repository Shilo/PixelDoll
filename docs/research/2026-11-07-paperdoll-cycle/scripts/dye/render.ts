// Labeling sheets: for every corpus item, its standing views (full color) and one tile per palette color showing where
// that color sits (true color, everything else dimmed), numbered. No detector output is drawn, so labels stay blind.
// Usage (repo root): node docs/research/2026-11-07-paperdoll-cycle/scripts/dye/render.ts [id-substring]
import { colorCounts, lab } from '../../../../../app/src/lib/dress/palette.ts';
import { makeImg, type Img } from '../../../../../app/src/lib/image/png.ts';
import { displayOrder, loadItems, save, saveJson } from './lib.ts';

const DIG = ['111101101101111', '010110010010111', '111001111100111', '111001111001111', '101101111001001', '111100111001111', '111100111101111', '111001001001001', '111101111101111', '111101111001111'];
function text(im: Img, x: number, y: number, s: string, rgb: number[], k = 2) {
  for (const ch of s) {
    const g = DIG[+ch];
    if (g) for (let i = 0; i < 15; i++) if (g[i] === '1') for (let dy = 0; dy < k; dy++) for (let dx = 0; dx < k; dx++) {
      const px = x + (i % 3) * k + dx, py = y + ((i / 3) | 0) * k + dy;
      if (px < im.w && py < im.h) im.data.set([...rgb, 255], (py * im.w + px) * 4);
    }
    x += 4 * k;
  }
}
const fill = (im: Img, x0: number, y0: number, w: number, h: number, rgb: number[]) => { for (let y = y0; y < y0 + h; y++) for (let x = x0; x < x0 + w; x++) if (x < im.w && y < im.h) im.data.set([...rgb, 255], (y * im.w + x) * 4); };
const want = process.argv[2] ?? '';
const index: Record<string, { i: number; hex: string; L: number; C: number; h: number; n: number }[]> = {};
for (const it of await loadItems()) {
  if (!it.id.includes(want)) continue;
  const counts = colorCounts(it.frames), standingCounts = colorCounts(it.standing);
  const cols = displayOrder([...counts.keys()]);
  // views: the standing frames plus up to two posed frames that show colors absent from them; each cropped to its own bbox
  const views = [...it.standing], seen = new Set(standingCounts.keys());
  for (let extra = 0; extra < 2; extra++) {
    let best: Img | undefined, gain = 0;
    for (const f of it.frames) { const g = [...colorCounts([f]).keys()].filter((c) => !seen.has(c)).length; if (g > gain) { gain = g; best = f; } }
    if (!best) break;
    views.push(best); for (const c of colorCounts([best]).keys()) seen.add(c);
  }
  const boxes = views.map((im) => { let x0 = 1e9, y0 = 1e9, x1 = -1, y1 = -1;
    for (let y = 0; y < im.h; y++) for (let x = 0; x < im.w; x++) if (im.data[(y * im.w + x) * 4 + 3]) { x0 = Math.min(x0, x); y0 = Math.min(y0, y); x1 = Math.max(x1, x); y1 = Math.max(y1, y); }
    return { x0, y0, w: x1 - x0 + 1, h: y1 - y0 + 1 }; });
  const sumW = boxes.reduce((s, b) => s + b.w, 0), maxH = Math.max(...boxes.map((b) => b.h));
  const z = Math.max(3, Math.min(8, Math.floor(420 / sumW))), tw = sumW * z + 4 * views.length, th = maxH * z + 20;
  const per = Math.max(1, Math.floor(1500 / (tw + 8))), rowsN = Math.ceil(cols.length / per);
  const Z = Math.max(z, Math.min(12, Math.floor(1500 / sumW))), headH = maxH * Z + 8;
  const sheet = makeImg(Math.max(per * (tw + 8), sumW * Z + 4 * views.length), headH + rowsN * (th + 8));
  fill(sheet, 0, 0, sheet.w, sheet.h, [40, 40, 48]);
  const draw = (ox: number, oy: number, k: number, pick: (cc: number, p: number, im: Img) => number[]) => {
    let vx = ox;
    views.forEach((im, v) => { const b = boxes[v];
      for (let y = 0; y < b.h; y++) for (let x = 0; x < b.w; x++) { const p = ((y + b.y0) * im.w + x + b.x0) * 4;
        const rgb = im.data[p + 3] ? pick((im.data[p] << 16) | (im.data[p + 1] << 8) | im.data[p + 2], p, im) : null;
        if (rgb) fill(sheet, vx + x * k, oy + y * k, k, k, rgb); }
      vx += b.w * k + 4; });
  };
  draw(0, 0, Z, (cc) => [cc >> 16, (cc >> 8) & 255, cc & 255]);
  cols.forEach((c, k) => {
    const ox = (k % per) * (tw + 8), oy = headH + Math.floor(k / per) * (th + 8);
    fill(sheet, ox, oy, tw, th, [24, 24, 30]);
    fill(sheet, ox, oy, 16, 16, [c >> 16, (c >> 8) & 255, c & 255]);
    text(sheet, ox + 20, oy + 3, String(k), [255, 255, 255]);
    if (!standingCounts.has(c)) fill(sheet, ox + tw - 10, oy + 3, 8, 8, [255, 0, 0]); // color only in posed frames
    const dim = lab(c)[0] < 0.5 ? [175, 175, 185] : [62, 62, 72];
    draw(ox, oy + 18, z, (cc) => (cc === c ? [c >> 16, (c >> 8) & 255, c & 255] : dim));
  });
  const name = it.id.replace('/', '__');
  await save(`sheets/${name}.png`, sheet);
  index[it.id] = cols.map((c, i) => { const [L, a, b] = lab(c); return { i, hex: `#${c.toString(16).padStart(6, '0')}`, L: +L.toFixed(3), C: +Math.hypot(a, b).toFixed(3), h: Math.round(((Math.atan2(b, a) * 180) / Math.PI + 360) % 360), n: counts.get(c)!, standing: standingCounts.get(c) ?? 0 } as never; });
  console.log(it.id, cols.length, 'colors', `${sheet.w}x${sheet.h}`);
}
if (!want) saveJson('palette-index.json', index);
