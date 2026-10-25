// Judge calibration pairs from S4's visual verdicts (docs/spikes/S4_model_routing.md Q3): ea2 is the known better route.
import path from 'node:path';
import { load, items, type Img } from './lib.mts';
import type { Pair } from './blind.mts';
const S4 = path.resolve(import.meta.dirname, '../out/s4_items');
// item, worse route, direction, why (S4 visual column). Round r1 used every item in S and E and both judges "missed" exactly the
// clips S4 documents as weak for ea2 itself (helmet E thin, vest E thin, sword E faint) plus the subtle pixen face: those labels
// were wrong, not the judges. Only clips with a documented defect in the worse route and none in ea2 stay.
const KNOWN: [string, string, string, string][] = [
  ['helmet', 'eiv2', 'south', 'helmet floats above the head'], ['helmet', 'eiv2', 'east', 'helmet floats above the head'],
  ['boots', 'eiv2', 'south', 'ghost body outlines'], ['boots', 'eiv2', 'east', 'ghost body outlines'],
  ['cape', 'pfgrid', 'south', 'thin outline only'], ['cape', 'pfgrid', 'east', 'thin outline only'],
  ['sword', 'pixen', 'south', 'sword missing, swaps sides'], ['chest', 'pixen', 'south', 'body redrawn'],
  // round 2: two S4 verdicts no judge has seen yet
  ['helmet', 'pfgrid', 'south', 'adds unrequested pauldrons'], ['cape', 'pfinp', 'south', 'thin red outline only'],
];
async function clip(item: string, route: string, dir: string): Promise<Img[]> {
  const off = dir === 'south' ? 0 : 8; // cells 0-7 walk, 8-15 slash
  return Promise.all(Array.from({ length: 8 }, async (_, i) => items.recompose({ base: await load(`${S4}/sk_${dir}.base${off + i}.png`), layer: await load(`${S4}/sk_${route}_${item}_${dir}.layer${off + i}.png`) })));
}
export async function calibPairs(): Promise<Pair[]> {
  const out: Pair[] = [];
  for (const [item, worse, dir] of KNOWN) out.push({ id: `calib ${item} ea2>${worse} ${dir}`, kind: 'calib', a: await clip(item, 'ea2', dir), b: await clip(item, worse, dir), armA: 'ea2', armB: worse, expected: 'a' });
  return out;
}
