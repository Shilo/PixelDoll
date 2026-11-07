// Audit (audit-worn.md): D1 on the benchmark's passing "green-and-pink jester hat" keyframes (blue key, campaign 2026-10-25
// arm K). The prompt names no gray word, so designGraySmudges decides on pixels alone. Prints which px read as gray and
// optionally writes a zoomed sheet (gray px marked red) for visual review. Production code only.
// Run from the repo root: node docs/research/2026-11-07-paperdoll-cycle/scripts/audit/worn-d1-jester.ts [outDir]
import { mkdirSync, writeFileSync } from 'node:fs';
import { bandOf, designGraySmudges, extractCell, grayShare } from '../../../../../app/src/lib/items/items.ts';
import { fromApi } from '../../../../../app/src/lib/rig/poses.ts';
import { encodePngBytes } from '../../../../../app/src/lib/image/pngraw.ts';
import { body, cell, load, makeImg } from '../extraction/lib.ts';

const OUT = process.argv[2], PROMPT = 'green-and-pink jester hat';
for (const id of ['a-jester-blue', 'b-jester-blue']) {
  const bodyId = id.startsWith('a') ? 'A' : 'B', { body: b, sheet: bs } = await body(bodyId), N = b.rig.cell.w, sheet = await load(`${id}.png`);
  const posed = id.startsWith('b'); // b-jester-blue rows are clips (keyframe in column 0); a-jester-blue is one rest row
  const dirs = posed ? ['south', 'south-east', 'east', 'north-east', 'north'] : b.rows;
  const S = 6, sh = makeImg(dirs.length * N * S, N * S);
  for (const [i, d] of dirs.entries()) {
    const out = posed ? cell(sheet, N, i, 0) : cell(sheet, N, 0, b.rows.indexOf(d)), base = cell(bs, N, b.rows.indexOf(d), b.cols.indexOf('rest'));
    const s = b.rig.rest?.[d as 'south'] && fromApi(b.rig.rest[d as 'south']!.keypoints, b.rig.cell);
    const k = extractCell({ key: `rest/${d}/0`, call: 0, base, out, route: 'blue', band: bandOf('head', s, N) });
    const L = k.layer, grays = new Map<string, number>();
    let lit = 0, litGray = 0; // candidate fix: near-black outline px (max channel < 48) are line art, not smudges
    for (let p = 0; p < L.data.length / 4; p++) {
      if (!L.data[p * 4 + 3]) continue;
      const [r, g, bl] = L.data.subarray(p * 4, p * 4 + 3), mx = Math.max(r, g, bl), mn = Math.min(r, g, bl), sat = mx ? (mx - mn) / mx : 0;
      if (mx >= 48) { lit++; if (sat < 0.25) litGray++; }
      if (sat < 0.25) grays.set(`${r},${g},${bl}`, (grays.get(`${r},${g},${bl}`) ?? 0) + 1);
      for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) {
        const q = ((((p / N) | 0) * S + y) * sh.w + i * N * S + (p % N) * S + x) * 4;
        sh.data.set(sat < 0.25 ? [255, 0, 0, 255] : [r, g, bl, 255], q);
      }
    }
    console.log(id, d, 'area', k.area, 'grayShare', grayShare(L).toFixed(3), 'D1 fires', designGraySmudges('head', PROMPT, L), 'share without near-black', (litGray / Math.max(1, lit)).toFixed(3), 'gray colors', [...grays].sort((a, c) => c[1] - a[1]).slice(0, 5).map(([c, n]) => `${c}x${n}`).join(' '));
  }
  if (OUT) { mkdirSync(OUT, { recursive: true }); writeFileSync(`${OUT}/${id}-d1.png`, await encodePngBytes(sh)); }
}
