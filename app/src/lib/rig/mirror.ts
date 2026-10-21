// Direction plans and horizontal mirroring (architecture §2). Mirrored cells are flips of the source direction's cells.
import { makeImg, type Img } from '../image/png.ts';
import { DIRECTIONS, type DirectionName, type RigDirection } from './rig.ts';

export type DirMode = '4' | '8' | 'all';
const PLANS: Record<'4' | '8', [DirectionName, DirectionName?][]> = {
  '4': [['south'], ['east'], ['north'], ['west', 'east']],
  '8': [['south'], ['south-east'], ['east'], ['north-east'], ['north'], ['north-west', 'north-east'], ['west', 'east'], ['south-west', 'south-east']],
};

/** Rig directions for a mode from the generated ones; `missing` = planned but not producible. Order = DIRECTIONS. */
export function planDirections(mode: DirMode, generated: DirectionName[]): { dirs: RigDirection[]; missing: DirectionName[] } {
  const has = (d: DirectionName) => generated.includes(d);
  const byOrder = (a: RigDirection, b: RigDirection) => DIRECTIONS.indexOf(a.id) - DIRECTIONS.indexOf(b.id);
  if (mode === 'all') return { dirs: DIRECTIONS.filter(has).map((id) => ({ id })), missing: [] };
  const dirs: RigDirection[] = [], missing: DirectionName[] = [];
  for (const [id, src] of PLANS[mode]) {
    if (src ? has(src) : has(id)) dirs.push(src ? { id, mirrorOf: src } : { id });
    else missing.push(id);
  }
  return { dirs: dirs.sort(byOrder), missing };
}

export function flipH(im: Img): Img {
  const o = makeImg(im.w, im.h);
  for (let y = 0; y < im.h; y++)
    for (let x = 0; x < im.w; x++) {
      const s = (y * im.w + x) * 4;
      o.data.set(im.data.subarray(s, s + 4), (y * im.w + (im.w - 1 - x)) * 4);
    }
  return o;
}
/** Mirror a pixel index column. (Pixel-edge coords use w - x; the pivot x = w/2 is unchanged.) */
export const flipX = (x: number, w: number) => w - 1 - x;

export function selfTest() {
  const four = planDirections('4', ['south', 'east', 'north']);
  console.assert(four.dirs.map((d) => d.id + (d.mirrorOf ? `<${d.mirrorOf}` : '')).join() === 'south,east,north,west<east' && !four.missing.length, '4-dir plan');
  const partial = planDirections('4', ['south', 'east']);
  console.assert(partial.missing.join() === 'north' && partial.dirs.length === 3, '4-dir plan without north');
  const eight = planDirections('8', ['south', 'south-east', 'east', 'north-east', 'north']);
  console.assert(eight.dirs.length === 8 && eight.dirs.filter((d) => d.mirrorOf).length === 3 && eight.dirs[7].id === 'south-west', '8-dir plan');
  console.assert(planDirections('all', ['east', 'south']).dirs.map((d) => d.id).join() === 'south,east', 'all plan');
  const im = makeImg(3, 1);
  im.data.set([1, 0, 0, 255, 2, 0, 0, 255, 3, 0, 0, 255]);
  console.assert(flipH(im).data.join() === '3,0,0,255,2,0,0,255,1,0,0,255' && flipH(flipH(im)).data.join() === im.data.join(), 'flipH');
  console.assert(flipX(0, 64) === 63, 'flipX');
}
