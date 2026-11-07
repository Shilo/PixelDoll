// Independent malformed-mask spill and valid-input parity controls; no provider or browser access.
import { readFileSync, writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { packGrid, cutGrid } from '../../../../app/src/lib/items/items.ts';
import { makeImg } from '../../../../app/src/lib/image/png.ts';

const sha = (bytes: Uint8Array) => createHash('sha256').update(bytes).digest('hex');
const cells = Array.from({ length: 3 }, (_, k) => {
  const image = makeImg(4, 4);
  for (let p = 0; p < 16; p++) image.data.set([20 + k * 50, 30 + p, 80, 255], p * 4);
  return image;
});
const inputsHash = sha(new Uint8Array(cells.flatMap(c => [...c.data])));
const bit = (value: number) => { const m = new Uint8Array(16); m[5] = value; return m; };
const expected = packGrid(cells, [bit(1), null, null], 2);
const at = (image: ReturnType<typeof makeImg>, x: number, y: number) => image.data[(y * image.w + x) * 4];
const valid = [1, 128, 255].map(value => {
  const packed = packGrid(cells, [bit(value), null, null], 2);
  const split = cutGrid(packed.image, 3, 4, 4, 2);
  return { value, sameMaskBytes: sha(packed.mask.data) === sha(expected.mask.data),
    exactSourceCells: split.every((image, i) => sha(image.data) === sha(cells[i].data)),
    nullReferenceProtected: Array.from({ length: 16 }, (_, p) => at(packed.mask, p % 4, 4 + Math.floor(p / 4))).every(v => v === 0),
    tailProtected: Array.from({ length: 16 }, (_, p) => at(packed.mask, 4 + p % 4, 4 + Math.floor(p / 4))).every(v => v === 0) };
});
const malformed: { name: string; rejected: boolean; error?: string; protectedCellEdited?: boolean; tailEdited?: boolean }[] = [];
function run(name: string, masks: (Uint8Array | null)[], cols = 2) {
  try {
    const packed = packGrid(cells, masks, cols);
    malformed.push({ name, rejected: false, protectedCellEdited: at(packed.mask, 0, 4) > 0, tailEdited: at(packed.mask, 4, 4) > 0 });
  } catch (error) { malformed.push({ name, rejected: true, error: (error as Error).message }); }
}
const overlong = new Uint8Array(17); overlong[16] = 1;
run('cell-zero mask spills onto protected reference', [overlong, null, null]);
run('cell-one mask spills onto protected tail', [null, overlong, null]);
run('short mask list', [null, null]);
run('extra mask list', [null, null, null, null]);
run('short frame mask', [new Uint8Array(15), null, null]);
run('fractional columns', [null, null, null], 1.5);
run('zero columns', [null, null, null], 0);
const report = { runtime: process.version, paidCalls: 0,
  itemSourceSha256: sha(readFileSync(new URL('../../../../app/src/lib/items/items.ts', import.meta.url))),
  sourceImagesUnchanged: inputsHash === sha(new Uint8Array(cells.flatMap(c => [...c.data]))), valid, malformed,
  limits: 'Synthetic direct-helper challenge. A real caller producing malformed masks or a submitted paid defect is not established.' };
writeFileSync(process.argv[2] ?? fileURLToPath(new URL('pack-grid-before.json', import.meta.url)), JSON.stringify(report, null, 2) + '\n');
console.log(JSON.stringify(report));
