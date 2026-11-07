// How much of each real benchmark body is "dark" (mean RGB < 60, the dropKeyOutline trigger in chroma.ts) away from the rim.
// Every such px makes a crossing 1 px item a removal candidate. Prints an ASCII map of body A south rest.
import { baseCell, body, opaque } from './lib.ts';

const dark = (d: Uint8ClampedArray, p: number) => (d[p * 4] + d[p * 4 + 1] + d[p * 4 + 2]) / 3 < 60;
for (const id of ['A', 'B', 'C', 'N']) {
  const { body: b } = await body(id);
  for (const dir of b.rows) {
    const B = await baseCell(id, dir, 'rest'), { w, h } = B;
    let op = 0, ring = 0, darkIn = 0;
    for (let p = 0; p < w * h; p++) {
      if (!opaque(B, p)) continue;
      op++;
      const x = p % w, y = (p / w) | 0, nb = [[x - 1, y], [x + 1, y], [x, y - 1], [x, y + 1]];
      const edge = nb.some(([X, Y]) => X < 0 || Y < 0 || X >= w || Y >= h || !opaque(B, Y * w + X));
      if (edge) ring++; else if (dark(B.data, p)) darkIn++;
    }
    console.log(`${id} ${dir} ${w}px: opaque ${op}, rim ${ring}, dark interior ${darkIn} (${((100 * darkIn) / op).toFixed(1)} %)`);
  }
}
const B = await baseCell('A', 'south', 'rest');
const rows: string[] = [];
for (let y = 0; y < B.h; y++) {
  let s = '';
  for (let x = 0; x < B.w; x++) { const p = y * B.w + x; s += !opaque(B, p) ? '.' : dark(B.data, p) ? '#' : 'o'; }
  if (s.replace(/\./g, '')) rows.push(`${String(y).padStart(2)} ${s}`);
}
console.log(rows.join('\n'));
