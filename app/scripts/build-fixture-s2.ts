// One-off: builds app/public/fixtures/s2/ from S2's chroma-mannequin outputs (spikes/api/out/s2_base + s2_x4).
// Base = b48 clothed character padded 48 -> 64 (x+8, y+16, never rescaled); walk S/E/N + cross-punch S/E; west mirrored at load.
// Items = chroma layers (green key, edit-animation-v2; B runs = anchor-cell or transfer-outfit-v2 for N walk + punch S).
// Colors an item shares with an earlier item are nudged by ±1 in blue so material ramps can stay disjoint (spec §3 inv. 5).
// `node scripts/build-fixture-s2.ts`
import { existsSync, mkdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { decodePngBytes, encodePngBytes } from '../src/lib/image/pngraw.ts';
import { makeImg, type Img } from '../src/lib/image/png.ts';
import { over } from '../src/lib/compose/compose.ts';
import { pivotOf } from '../src/lib/rig/normalize.ts';

const SPIKE = new URL('../../spikes/api/out/', import.meta.url);
const OUT = new URL('../public/fixtures/s2/', import.meta.url);
const load = (p: string) => decodePngBytes(readFileSync(new URL(p, SPIKE)));
const DIRS = ['south', 'east', 'north'];
// B10: the S2 items only have cross-punch SOUTH (east was body + a doubled sword, north none), so the demo ships it south only.
const ANIMS = { walk: { cells: 8, src: 'b48walk', ms: 100, template: 'walking-8-frames', dirs: DIRS }, 'cross-punch': { cells: 6, src: 'b48punch', ms: 100, template: 'cross-punch', dirs: ['south'] } };
type Anim = keyof typeof ANIMS;

const pad = (im: Img) => { const o = makeImg(64, 64); over(o, im, 8, 16); return o; };
const baseCell = async (a: Anim, d: string, i: number) => {
  const f = `s2_base/${ANIMS[a].src}_${d}_${i}.png`;
  return existsSync(new URL(f, SPIKE)) ? pad(await load(f)) : null;
};
// sanity: the padded base equals what S2 fed to PixelLab
const ref = await load('s2_x4/cape48_A.base0.png'), mine = (await baseCell('walk', 'south', 0))!;
if (ref.data.join() !== mine.data.join()) throw new Error('padding differs from S2 base cells');

/** run name -> { "walk/south": [layer imgs] } via <run>.cells.json groups (b48walk_south -> walk/south). */
async function runCells(run: string) {
  const out: Record<string, Img[]> = {};
  const cells = JSON.parse(readFileSync(new URL(`s2_x4/${run}.cells.json`, SPIKE), 'utf8')) as { group: string }[];
  for (const [j, c] of cells.entries()) {
    const [src, dir] = c.group.split('_'), anim = (Object.keys(ANIMS) as Anim[]).find((a) => ANIMS[a].src === src)!;
    (out[`${anim}/${dir}`] ??= []).push(await load(`s2_x4/${run}.layer${j}.png`));
  }
  return out;
}

const ITEMS = [
  { id: 'vest_leather', name: 'Leather vest', slot: 'torso_inner', runs: ['b5_chest48_A', 'b5_chest48_Ba'], what: 'a brown leather chest armor vest covering the torso' },
  { id: 'cape_red', name: 'Red cape', slot: 'back', runs: ['cape48_A', 'cape48_B'], what: 'a long red cloth cape hanging from the shoulders behind the back, visible at both sides of the figure' },
  { id: 'hair_brown', name: 'Messy brown hair', slot: 'hair', runs: ['b5_hair48_A', 'b5_hair48_Ba'], what: 'short messy dark brown hair covering the top, back and sides of the head, face visible, no hat' },
  { id: 'helmet_steel', name: 'Steel helmet', slot: 'head', runs: ['helmet48_A', 'helmet48_Ba'], what: 'a simple grey steel knight helmet covering the top and sides of the head, face visible', hides: ['hair'] },
  { id: 'hat_wizard', name: 'Wizard hat', slot: 'head', runs: ['wizardhat48_A'], what: 'a tall pointed blue wizard hat with a wide brim', hides: [] },
  { id: 'sword_steel', name: 'Steel longsword', slot: 'main_hand', runs: ['sword48_A', 'sword48_Ba', 'sword48_C'], what: "a steel longsword held in the character's right hand, blade pointing down and slightly outward" },
];

const used = new Set<number>(); // colors of earlier items (base first)
const key = (d: Uint8ClampedArray, i: number) => (d[i] << 16) | (d[i + 1] << 8) | d[i + 2];
function claim(imgs: Img[]) {
  const mine = new Map<number, number>(); // original -> nudged
  for (const im of imgs)
    for (let i = 0; i < im.data.length; i += 4) {
      if (!im.data[i + 3]) continue;
      const c = key(im.data, i);
      if (!mine.has(c)) {
        let n = c;
        for (let k = 1; used.has(n) || [...mine.values()].includes(n); k++) n = (c & 0xffff00) | Math.min(255, Math.max(0, (c & 255) + (k % 2 ? 1 : -1) * Math.ceil(k / 2)));
        mine.set(c, n);
      }
      const n = mine.get(c)!;
      im.data.set([n >> 16, (n >> 8) & 255, n & 255], i);
    }
  for (const n of mine.values()) used.add(n);
  return [...mine].filter(([a, b]) => a !== b).length;
}

async function writeSheet(name: string, a: Anim, get: (dir: string, i: number) => Img | null | undefined) {
  const cells = ANIMS[a].cells, out = makeImg(cells * 64, DIRS.length * 64);
  DIRS.forEach((d, r) => { if (ANIMS[a].dirs.includes(d)) for (let i = 0; i < cells; i++) { const im = get(d, i); if (im) over(out, im, i * 64, r * 64); } });
  mkdirSync(new URL(name.replace(/[^/]+$/, ''), OUT), { recursive: true });
  writeFileSync(new URL(name, OUT), await encodePngBytes(out));
  return name;
}

const anims = Object.keys(ANIMS) as Anim[];
const base: Record<string, (Img | null)[]> = {};
for (const a of anims) for (const d of DIRS) base[`${a}/${d}`] = await Promise.all(Array.from({ length: ANIMS[a].cells }, (_, i) => baseCell(a, d, i)));
claim(Object.values(base).flat().filter((x): x is Img => !!x));

const items = [];
for (const it of ITEMS) {
  const cells: Record<string, Img[]> = {};
  for (const r of it.runs) for (const [k, v] of Object.entries(await runCells(r))) cells[k] ??= v; // first run wins per anim/dir
  const nudged = claim(Object.values(cells).flat());
  const sheets: Record<string, string> = {};
  for (const a of anims) if (DIRS.some((d) => cells[`${a}/${d}`])) sheets[a] = await writeSheet(`layers/${it.slot}/${it.id}/main/${a}.png`, a, (d, i) => cells[`${a}/${d}`]?.[i]);
  const mtime = statSync(new URL(`s2_x4/${it.runs[0]}.layer0.png`, SPIKE)).mtime.toISOString();
  items.push({
    id: it.id, name: it.name, slot: it.slot, status: 'accepted', mirror: 'flip', materials: [], prompt: it.what, baseHash: '',
    layers: [{ id: 'main', role: 'fg', z: 0, sheets }], ...(it.hides ? { hides: it.hides } : {}),
    provenance: it.runs.map((r) => ({ endpoint: r.endsWith('_B') || r.endsWith('_C') ? '/transfer-outfit-v2' : '/edit-animation-v2', params: { s2Run: r, chromaKey: 'green' }, seed: 7, requestHash: '', usage: { generations: 10 }, createdAt: mtime, produced: [] })),
  });
  console.log(it.id, Object.keys(cells).join(' '), nudged ? `(${nudged} colors nudged)` : '');
}

const SLOTS = [
  { id: 'body', z: 10, class: 'base', required: true },
  { id: 'torso_inner', z: 40, class: 'worn', anchor: 'neck' },
  { id: 'back', z: 90, bgZ: 4, class: 'worn', anchor: 'neck' },
  { id: 'hair', z: 110, bgZ: 3, class: 'rigid', anchor: 'head' },
  { id: 'head', z: 130, class: 'rigid', anchor: 'head', hides: ['hair'] },
  // M4 finding: the silhouette split puts the blade outside the body into bg (z1) under the cape's bg (z4) -> hidden in S/E/W.
  // Facing away (north) the cape must stay over the sword, so the fix is a sparse per-direction override, not a ladder change.
  { id: 'main_hand', z: 150, bgZ: 1, class: 'held', anchor: 'hand_r', zOverrides: ['south', 'east', 'west'].map((dir) => ({ layer: 'bg', z: 5, dir })) },
];
for (const it of items) it.layers[0].z = SLOTS.find((s) => s.id === it.slot)!.z;

const fixture = {
  format: 'pixeldoll/1',
  name: 'Adventurer',
  app: 'PixelDoll 0.1.0 (fixture from S2 chroma-mannequin outputs)',
  rig: {
    cell: { w: 64, h: 64 },
    pivot: pivotOf(mine),
    directions: [{ id: 'south' }, { id: 'east' }, { id: 'north' }, { id: 'west', mirrorOf: 'east' }],
    animations: anims.map((a) => ({ id: a, cells: ANIMS[a].cells, loop: true, frames: Array.from({ length: ANIMS[a].cells }, (_, cell) => ({ cell, ms: ANIMS[a].ms })), source: { endpoint: '/characters/animations', mode: 'template', template_animation_id: ANIMS[a].template } })),
    baseItem: 'base',
    baseHash: '',
  },
  materials: [],
  slots: SLOTS,
  items: [
    { id: 'base', name: 'Base body', slot: 'body', status: 'accepted', mirror: 'flip', materials: [], prompt: 'plain grey t-shirt and plain grey shorts, bald, barefoot (S2 b48, padded to 64)', baseHash: '',
      layers: [{ id: 'main', role: 'fg', z: 10, sheets: Object.fromEntries(await Promise.all(anims.map(async (a) => [a, await writeSheet(`layers/body/base/main/${a}.png`, a, (d, i) => base[`${a}/${d}`][i])]))) }],
      provenance: [{ endpoint: '/create-character-v3', params: { image_size: 48, seed: 4321 }, seed: 4321, requestHash: '', createdAt: '2026-10-21T05:00:00Z', produced: [] }] },
    ...items,
  ],
  presets: [
    { id: 'adventurer', name: 'Adventurer', items: { body: 'base', torso_inner: 'vest_leather', back: 'cape_red', hair: 'hair_brown', head: 'helmet_steel', main_hand: 'sword_steel' }, variants: {} },
    { id: 'base-only', name: 'Base only', items: { body: 'base', torso_inner: null, back: null, hair: null, head: null, main_hand: null }, variants: {} },
  ],
};
writeFileSync(new URL('fixture.json', OUT), JSON.stringify(fixture, null, 2) + '\n');
console.log('fixture written, pivot', fixture.rig.pivot);
