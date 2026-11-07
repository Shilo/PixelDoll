// Review of 50cca648 (despill keeps a sub-key px's own color): which blends of a non-green item color with the green key now
// keep their raw, greener color instead of the despilled one. Each layer is a 10x10 item core plus one blend px; the
// parent result is the despilled color `c` (what the current code writes when `own` is false). Rows with a green excess of
// at most 10 are below the despill tint threshold and untouched by both versions.
// Run from the repo root: node docs/research/2026-11-07-paperdoll-cycle/scripts/review/despill-blend.ts
import { despill, keyScore, KT } from '../../../../../app/src/lib/image/chroma.ts';
import { makeImg } from '../../../../../app/src/lib/image/png.ts';

const KEY = [60, 200, 60], items: Record<string, number[]> = { red: [180, 40, 40], skin: [222, 160, 120], brown: [120, 72, 40], blue: [40, 70, 200], gold: [210, 170, 60] };
for (const [name, col] of Object.entries(items)) {
  const rows: string[] = [];
  for (let t = 0.1; t < 0.95; t += 0.1) {
    const px = col.map((v, j) => Math.round(v * (1 - t) + KEY[j] * t)), L = makeImg(11, 10);
    for (let p = 0; p < 110; p++) L.data.set(p % 11 === 10 && p === 54 ? [...px, 255] : p % 11 === 10 ? [0, 0, 0, 0] : [...col, 255], p * 4);
    const ks = keyScore('green', px[0], px[1], px[2]);
    if (ks >= KT) { rows.push(`${t.toFixed(1)} keyed out (score ${ks.toFixed(2)})`); continue; }
    const out = [...despill(L, 'green').data.subarray(54 * 4, 54 * 4 + 3)], c = [px[0], Math.max(px[0], px[2]), px[2]];
    const greenExcess = (v: number[]) => v[1] - Math.max(v[0], v[2]);
    rows.push(`${t.toFixed(1)} raw ${px} score ${ks.toFixed(2)} -> out ${out} (despilled ${c}) ${out.join() === px.join() && greenExcess(px) > 10 ? `KEPT RAW, green excess ${greenExcess(px)}` : ''}`);
  }
  console.log(name, col.join(','), '\n  ' + rows.join('\n  '));
}
