// One-off: builds app/dev-fixtures/s1/ from S1's real PixelLab outputs (spikes/api/out). `node scripts/build-fixture.ts`
// Sheets hold only generated directions (rows south, east); west is mirrored at load. Item sheets are walk only.
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { decodePngBytes, encodePngBytes } from '../src/lib/image/pngraw.ts';
import { makeImg, type Img } from '../src/lib/image/png.ts';
import { over } from '../src/lib/compose/compose.ts';
import { pivotOf } from '../src/lib/rig/normalize.ts';

const SPIKE = new URL('../../spikes/api/out/', import.meta.url);
const OUT = new URL('../dev-fixtures/s1/', import.meta.url);
const load = (p: string) => decodePngBytes(readFileSync(new URL(p, SPIKE)));
const DIRS = ['south', 'east'];

async function sheet(name: string, cells: number, file: (dir: string, i: number) => string | null) {
  const out = makeImg(cells * 64, DIRS.length * 64);
  for (const [r, d] of DIRS.entries())
    for (let i = 0; i < cells; i++) {
      const f = file(d, i);
      if (f) over(out, await load(f), i * 64, r * 64);
    }
  mkdirSync(new URL(name.replace(/[^/]+$/, ''), OUT), { recursive: true });
  writeFileSync(new URL(name, OUT), await encodePngBytes(out));
  return name;
}

const job = (f: string) => JSON.parse(readFileSync(new URL(f, SPIKE), 'utf8'));
const prov = (f: string, endpoint: string, description: string, produced: string[]) => {
  const j = job(f).job;
  return { endpoint, params: { description, image_size: { width: 64, height: 64 }, no_background: true }, seed: 7, requestHash: '', jobId: j.id, usage: { generations: j.usage.generations }, createdAt: j.created_at, produced };
};
const baseProv = (anim: string, template: string) => {
  const j = job(`e2_anim/${anim}_job_0.json`);
  return { endpoint: '/characters/animations', params: { mode: 'template', template_animation_id: template, directions: DIRS }, seed: j.last_response.seed, requestHash: '', jobId: j.id, usage: { usd: j.usage.usd }, createdAt: j.created_at, produced: [] };
};
const ask = (what: string) => `Add only ${what} to this low top-down pixel art character in every frame, identical design in all frames. Keep every other pixel of the body, pose, outline and the transparent background unchanged.`;
const WHAT = {
  helmet: 'a simple gray steel knight helmet covering the top and sides of the head, face visible',
  chest: 'a brown leather chest armor vest covering the torso',
  sword: "a steel longsword held in the character's right hand (on the left side of the image), blade pointing down and slightly outward",
};
const layer = (z: number, walk: string) => [{ id: 'main', role: 'fg', z, sheets: { walk } }];
const item = (id: string, name: string, slot: string, prompt: string, layers: unknown, provenance: unknown[], extra = {}) =>
  ({ id, name, slot, status: 'accepted', mirror: 'flip', materials: [], prompt, layers, baseHash: '', provenance, ...extra });

const idle0: Img = await load('e2_anim/idle_south_0.png');
const fixture = {
  format: 'pixeldoll/1',
  name: 's1_knight',
  app: 'PixelDoll 0.1.0 (fixture from S1 spike outputs)',
  rig: {
    cell: { w: 64, h: 64 },
    pivot: pivotOf(idle0),
    directions: [{ id: 'south' }, { id: 'east' }, { id: 'west', mirrorOf: 'east' }],
    animations: [
      { id: 'idle', cells: 4, loop: true, frames: [0, 1, 2, 3].map((cell) => ({ cell, ms: 150 })), source: { endpoint: '/characters/animations', mode: 'template', template_animation_id: 'breathing-idle' } },
      { id: 'walk', cells: 8, loop: true, frames: [0, 1, 2, 3, 4, 5, 6, 7].map((cell) => ({ cell, ms: 100 })), source: { endpoint: '/characters/animations', mode: 'template', template_animation_id: 'walking-8-frames' } },
    ],
    baseItem: 'base',
    baseHash: '',
  },
  materials: [],
  slots: [
    { id: 'body', z: 10, class: 'base', required: true },
    { id: 'torso_inner', z: 40, class: 'worn', anchor: 'neck' },
    { id: 'hair', z: 110, bgZ: 3, class: 'rigid', anchor: 'head' },
    { id: 'head', z: 130, class: 'rigid', anchor: 'head' },
    // the per-cell override is visually neutral (nothing between 45 and 150 overlaps the hand) but proves cell z in engines
    { id: 'main_hand', z: 150, bgZ: 1, class: 'held', anchor: 'hand_r', zOverrides: [{ layer: 'fg', z: 45, anim: 'walk', dir: 'south', cell: 4 }] },
  ],
  items: [
    item('base', 'Base body', 'body', 'plain bald human base body (S1 e1/e2)', [{ id: 'main', role: 'fg', z: 10, sheets: {
      idle: await sheet('layers/body/base/main/idle.png', 4, (d, i) => `e2_anim/idle_${d}_${i}.png`),
      walk: await sheet('layers/body/base/main/walk.png', 8, (d, i) => `e2_anim/walk_${d}_${i}.png`),
    } }], [baseProv('idle', 'breathing-idle'), baseProv('walk', 'walking-8-frames')]),
    item('chest_leather', 'Leather vest', 'torso_inner', WHAT.chest,
      layer(40, await sheet('layers/torso_inner/chest_leather/main/walk.png', 8, (d, i) => (d === 'south' ? `e4_anim/chest_south__ea2.final_layer${i}.png` : null))),
      [prov('e4_anim/chest_south__ea2.response.json', '/edit-animation-v2', ask(WHAT.chest), [])], { extractor: 'novel_cc' }),
    item('helmet_iron', 'Iron helmet', 'head', WHAT.helmet,
      layer(130, await sheet('layers/head/helmet_iron/main/walk.png', 8, (d, i) => `e4_anim/helmet_${d}__ea2.final_layer${i}.png`)),
      [prov('e4_anim/helmet_south__ea2.response.json', '/edit-animation-v2', ask(WHAT.helmet), []), prov('e4_anim/helmet_east__ea2.response.json', '/edit-animation-v2', ask(WHAT.helmet), [])],
      { hides: ['hair'], extractor: 'novel_cc' }),
    item('sword_steel', 'Steel longsword', 'main_hand', WHAT.sword,
      layer(150, await sheet('layers/main_hand/sword_steel/main/walk.png', 8, (d, i) => (d === 'south' ? `e4_anim/sword_south__to2.final_layer${i}.png` : null))),
      [prov('e4_anim/sword_south__to2.response.json', '/transfer-outfit-v2', WHAT.sword, [])], { extractor: 'novel_cc' }),
  ],
  presets: [
    { id: 'knight', name: 'Knight', items: { body: 'base', torso_inner: 'chest_leather', head: 'helmet_iron', main_hand: 'sword_steel', hair: null }, variants: {} },
    { id: 'bare', name: 'Base only', items: { body: 'base', torso_inner: null, head: null, main_hand: null, hair: null }, variants: {} },
  ],
};
writeFileSync(new URL('fixture.json', OUT), JSON.stringify(fixture, null, 2) + '\n');
console.log('fixture written, pivot', fixture.rig.pivot);
