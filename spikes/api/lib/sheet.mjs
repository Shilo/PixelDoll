// Contact sheet: rows of images, nearest-neighbour scaled, on checkerboard cells. Browser-portable (pure arrays).
import { make, scale, blit } from './img.mjs';

export function sheet(rows, { s = 4, gap = 4, checker = 8 } = {}) {
  const cw = Math.max(...rows.flat().filter(Boolean).map(i => i.w)) * s, ch = Math.max(...rows.flat().filter(Boolean).map(i => i.h)) * s;
  const cols = Math.max(...rows.map(r => r.length));
  const S = make(cols * (cw + gap) + gap, rows.length * (ch + gap) + gap);
  S.d.fill(40); for (let i = 3; i < S.d.length; i += 4) S.d[i] = 255;
  rows.forEach((r, ri) => r.forEach((im, ci) => {
    const ox = gap + ci * (cw + gap), oy = gap + ri * (ch + gap);
    for (let y = 0; y < ch; y++) for (let x = 0; x < cw; x++) { const v = ((x / checker | 0) + (y / checker | 0)) % 2 ? 200 : 235, i = ((oy + y) * S.w + ox + x) * 4; S.d[i] = S.d[i + 1] = S.d[i + 2] = v; }
    if (im) blit(S, scale(im, s), ox, oy);
  }));
  return S;
}
