// Sheets (manifest-spec §3 inv. 1–2, §5): one UNTRIMMED sheet per layer per animation. Rows = rig.directions (mirrored
// rows baked), cols = cells. Transparent cells stay in the grid.
import { makeImg, type Img } from '../image/png.ts';
import { cellImg, composeCell, over } from '../compose/compose.ts';
import type { DirectionName, Item, Layer, Preset, Project } from '../store/manifest.ts';

export const sheetPath = (item: Pick<Item, 'id' | 'slot'>, layer: Pick<Layer, 'id'>, anim: string) => `layers/${item.slot}/${item.id}/${layer.id}/${anim}.png`;

function grid(p: Project, anim: string, cell: (dir: DirectionName, i: number) => Img | null): Img {
  const { rig } = p.manifest, { w, h } = rig.cell;
  const a = rig.animations.find((x) => x.id === anim)!;
  const out = makeImg(a.cells * w, rig.directions.length * h);
  rig.directions.forEach((d, r) => {
    for (let c = 0; c < a.cells; c++) {
      const im = cell(d.id, c);
      if (im) over(out, im, c * w, r * h);
    }
  });
  return out;
}

export const layerSheet = (p: Project, layer: Layer, anim: string) => grid(p, anim, (d, i) => cellImg(p, layer, anim, d, i));
export const bakedSheet = (p: Project, items: Preset['items'], anim: string) => grid(p, anim, (d, i) => composeCell(p, items, anim, d, i));

/** One sheet row (= one direction) as a strip image. */
export function sheetRow(sheet: Img, row: number, h: number): Img {
  const w = sheet.w;
  return { w, h, data: sheet.data.slice(row * h * w * 4, (row + 1) * h * w * 4) };
}

export function selfTest() {
  const im: Img = { w: 2, h: 1, data: new Uint8ClampedArray([1, 0, 0, 255, 0, 0, 0, 0]) };
  const m = {
    rig: { cell: { w: 2, h: 1 }, baseItem: 'base', directions: [{ id: 'south' }, { id: 'east' }, { id: 'west', mirrorOf: 'east' }], animations: [{ id: 'walk', cells: 3 }] },
    slots: [{ id: 'body', z: 10 }],
    items: [],
  };
  const layer = { id: 'main', role: 'fg', z: 10, cells: { walk: { east: [null, 'sha256:a', null] } } } as Layer;
  const p = { manifest: m, images: new Map([['sha256:a', im]]) } as unknown as Project;
  const s = layerSheet(p, layer, 'walk');
  console.assert(s.w === 6 && s.h === 3, `sheet size ${s.w}x${s.h} = cells*w x dirs*h`);
  const at = (x: number, y: number) => s.data.slice((y * s.w + x) * 4, (y * s.w + x) * 4 + 4).join();
  console.assert(at(2, 1) === '1,0,0,255' && at(3, 1) === '0,0,0,0', 'east cell 1 placed at col 1');
  console.assert(at(3, 2) === '1,0,0,255' && at(2, 2) === '0,0,0,0', 'west row = baked flip of east');
  console.assert([...s.data.slice(0, 6 * 4)].every((v) => v === 0), 'south row transparent (no cells), still present');
  console.assert(sheetRow(s, 1, 1).data.join() === s.data.slice(24, 48).join(), 'sheetRow');
  console.assert(sheetPath({ id: 'cape', slot: 'back' }, { id: 'bg' }, 'walk') === 'layers/back/cape/bg/walk.png', 'sheetPath');
}
