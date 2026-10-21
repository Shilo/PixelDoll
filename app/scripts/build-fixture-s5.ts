// One-off: builds app/public/fixtures/s5/ (B8 oversize-layer fixture) from S5's accepted 96 px sword. `node scripts/build-fixture-s5.ts`
// Base = the exact frames S5 posed against: S3/S4 raw skeleton-v3 walk + slash S/E/N on the 64 rig (out/s4_items/sk_<dir>.base0-15).
// Sword = S5 'fsw' (walk seed 7, slash S/N frame-0-last, slash E seed 11): out/s5_held/export_fsw_<clip>.png, 8 x 96 cells by
// S/E/N, pivot = rig pivot + (16, 16). West mirrors east at load (flip of the 96 cell about x = 48). Split fg/bg at load.
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { decodePngBytes, encodePngBytes } from '../src/lib/image/pngraw.ts';
import { makeImg } from '../src/lib/image/png.ts';
import { over } from '../src/lib/compose/compose.ts';
import { pivotOf } from '../src/lib/rig/normalize.ts';

const SPIKE = new URL('../../spikes/api/out/', import.meta.url);
const OUT = new URL('../public/fixtures/s5/', import.meta.url);
const load = (p: string) => decodePngBytes(readFileSync(new URL(p, SPIKE)));
const DIRS = ['south', 'east', 'north'], CLIPS = { walk: 0, slash: 8 };
const save = async (name: string, data: Uint8Array) => {
  mkdirSync(new URL(name.replace(/[^/]+$/, ''), OUT), { recursive: true });
  writeFileSync(new URL(name, OUT), data);
  return name;
};

const base: Record<string, string> = {}, sword: Record<string, string> = {};
for (const [clip, first] of Object.entries(CLIPS)) {
  const s = makeImg(8 * 64, DIRS.length * 64);
  for (const [r, d] of DIRS.entries()) for (let i = 0; i < 8; i++) over(s, await load(`s4_items/sk_${d}.base${first + i}.png`), i * 64, r * 64);
  base[clip] = await save(`layers/body/base/main/${clip}.png`, await encodePngBytes(s));
  const sw = await load(`s5_held/export_fsw_${clip}.png`);
  if (sw.w !== 8 * 96 || sw.h !== DIRS.length * 96) throw new Error(`${clip}: sword sheet ${sw.w}x${sw.h}`);
  sword[clip] = await save(`layers/main_hand/sword_fsw/main/${clip}.png`, readFileSync(new URL(`s5_held/export_fsw_${clip}.png`, SPIKE)));
}
const pivot = pivotOf(await load('s4_items/sk_south.base0.png'));

const fixture = {
  format: 'pixeldoll/1',
  name: 's5_sword',
  app: 'PixelDoll 0.1.0 (B8 oversize fixture from S5 spike outputs)',
  rig: {
    cell: { w: 64, h: 64 },
    pivot,
    directions: [{ id: 'south' }, { id: 'east' }, { id: 'north' }, { id: 'west', mirrorOf: 'east' }],
    animations: [
      { id: 'walk', cells: 8, loop: true, frames: [0, 1, 2, 3, 4, 5, 6, 7].map((cell) => ({ cell, ms: 100 })), sources: {} },
      { id: 'slash', cells: 8, loop: false, frames: [80, 80, 60, 60, 60, 80, 100, 120].map((ms, cell) => ({ cell, ms })), sources: {} },
    ],
    baseItem: 'base',
    baseHash: '',
  },
  materials: [],
  slots: [
    { id: 'body', z: 10, class: 'base', required: true },
    // fg z 45 on walk/south/4 is visually neutral (only the body is below) but proves per-cell z on an oversize layer
    { id: 'main_hand', z: 150, bgZ: 6, class: 'held', anchor: 'hand_r', zOverrides: [{ layer: 'bg', dir: 'north', z: 1 }, { layer: 'fg', z: 45, anim: 'walk', dir: 'south', cell: 4 }] },
  ],
  items: [
    { id: 'base', name: 'Base body', slot: 'body', status: 'accepted', mirror: 'flip', materials: [], prompt: 'S2 48 px clothed character, S3/S4 skeleton-v3 walk + slash', baseHash: '', provenance: [],
      layers: [{ id: 'main', role: 'fg', z: 10, sheets: base }] },
    { id: 'sword_fsw', name: 'Longsword (96 px)', slot: 'main_hand', status: 'accepted', mirror: 'flip', materials: [], route: 'skeleton-pose', key: 'green', baseHash: '', provenance: [],
      prompt: 'a steel longsword in the right hand, pointing down and slightly outward (S5 d96 dress, 96x96 oversize canvas)',
      layers: [{ id: 'main', role: 'fg', z: 150, cell: { w: 96, h: 96 }, pivot: { x: pivot.x + 16, y: pivot.y + 16 }, sheets: sword }] },
  ],
  presets: [
    { id: 'armed', name: 'Armed', items: { body: 'base', main_hand: 'sword_fsw' }, variants: {} },
    { id: 'bare', name: 'Base only', items: { body: 'base', main_hand: null }, variants: {} },
  ],
};
writeFileSync(new URL('fixture.json', OUT), JSON.stringify(fixture, null, 2) + '\n');
console.log('fixture s5 written, pivot', pivot);
