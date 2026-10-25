// Where do magenta key scores of 10-49 fall? Raw output | ambiguous px (yellow: kept as item, cyan: dropped as key) | production layer over base.
import { chroma, items, load, blank, sheet, save, type Img } from './lib.mts';
const rows: Img[][] = []; const stat: Record<string, number[]> = {};
for (const it of ['helmet', 'chest', 'boots', 'cape', 'sword']) for (const f of [2, 11]) {
  const d = f < 8 ? 'south' : 'east', B = await load(`e2_anim/walk_${d}_${f % 8}.png`), O = await load(`s2_x1/${it}_magenta_ea2.out${f}.png`);
  const L = chroma.chromaLayer(O, 'magenta', B), hl = blank(64, 64); let kept = 0, drop = 0;
  for (let p = 0; p < 4096; p++) { const i = p * 4; if (O.data[i + 3] < 128) continue; const s = chroma.keyScore('magenta', O.data[i], O.data[i + 1], O.data[i + 2]); hl.data.set([60, 60, 60, 255], i);
    if (s >= 10 && s < 50) { if (L.mask[p]) { hl.data.set([255, 230, 0, 255], i); kept++; } else { hl.data.set([0, 220, 255, 255], i); drop++; } } }
  (stat[it] ??= [0, 0]); stat[it][0] += kept; stat[it][1] += drop;
  rows.push([O, hl, items.recompose({ base: B, layer: L.layer })]);
}
console.log(JSON.stringify(stat));
await save(OUTR0 + 'p1_magenta.png', sheet(rows, 4));
