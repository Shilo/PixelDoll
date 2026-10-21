// Layered .aseprite export (manifest-spec §6.5; https://github.com/aseprite/aseprite/blob/main/docs/ase-file-specs.md).
// One RGBA file per character:
//  - one layer per (item, layer), named "<slot>.<item>" (+ ".fg"/".bg" for split items), stacked in PixelDoll's draw order
//    (static z, slot order, bg before fg, item id; bottom = first). Visible = equipped in presets[0] and not hidden.
//  - one frame per playlist entry of every move × direction the move has (rig order), duration = its ms; one tag
//    "<anim>_<dir>" each (repeat 1 when the move does not loop). A repeated cell (hold) is a linked cel.
//  - canvas = export.bakedCell (bakedFrame: every layer fits around the shared pivot); a layer's cel sits at
//    bakedPivot − layer.pivot, so a 96 sword and the 64 body line up by pivot. Slice "pivot" = canvas + bakedPivot.
//  - zOverrides become cel z-indexes (Aseprite ≥ 1.3: draw order = layer index + z-index), so the flattened frame equals
//    composeCell on the baked frame. Pixels come from the layer sheets (source ramps; preset variants are not applied).
import type { Img } from '../image/png.ts';
import type { DirectionName, Item, Layer, Manifest, Slot } from '../store/manifest.ts';
import { bakedFrame, equipped, hiddenSlots, layerFrame, resolveZ } from '../compose/compose.ts';
import type { OutFile } from './generic.ts';

type Bytes = ArrayLike<number>;
const w16 = (v: number) => [v & 255, (v >> 8) & 255]; // also SHORT (two's complement)
const w32 = (v: number) => [v & 255, (v >> 8) & 255, (v >> 16) & 255, (v >>> 24) & 255]; // also LONG
const str = (s: string) => { const b = new TextEncoder().encode(s); return [...w16(b.length), ...b]; };
function cat(parts: Bytes[]): Uint8Array {
  const out = new Uint8Array(parts.reduce((n, p) => n + p.length, 0));
  let o = 0;
  for (const p of parts) { out.set(p, o); o += p.length; }
  return out;
}
const chunk = (type: number, ...data: Bytes[]) => cat([w32(6 + data.reduce((n, d) => n + d.length, 0)), w16(type), ...data]);
const zlib = async (b: Uint8Array) => new Uint8Array(await new Response(new Blob([b as Uint8Array<ArrayBuffer>]).stream().pipeThrough(new CompressionStream('deflate'))).arrayBuffer());

interface L { item: Item; layer: Layer; slotIx: number; slot?: Slot }
const sortLayers = (ls: L[], z: (l: L) => number) => [...ls].sort((a, b) => z(a) - z(b) || a.slotIx - b.slotIx || (a.layer.role === b.layer.role ? 0 : a.layer.role === 'bg' ? -1 : 1) || a.item.id.localeCompare(b.item.id));

/** The .aseprite bytes for an exported manifest + its layer sheets (path -> Img, as built by coreFiles). */
export async function asepriteFile(m: Manifest, sheets: Map<string, Img>): Promise<Uint8Array> {
  const { rig } = m, bf = bakedFrame(m);
  const all: L[] = m.items.flatMap((item) => item.layers.map((layer) => ({ item, layer, slotIx: m.slots.findIndex((s) => s.id === item.slot), slot: m.slots.find((s) => s.id === item.slot) })));
  const stack = sortLayers(all, (l) => l.layer.z);
  const on = equipped(m, m.presets[0]?.items ?? {}), hidden = hiddenSlots(m, on);
  const visible = (l: L) => on.includes(l.item) && !hidden.has(l.item.slot);
  const layerChunks = stack.map((l) => chunk(0x2004, w16(visible(l) ? 3 : 2), w16(0), w16(0), w16(0), w16(0), w16(0), [255, 0, 0, 0],
    str(`${l.item.slot}.${l.item.id}${l.item.layers.length > 1 ? `.${l.layer.id}` : ''}`)));

  // timeline: playlist entries of every move × direction it has
  const frames: { anim: string; dir: DirectionName; row: number; cell: number; ms: number }[] = [], tags: Bytes[] = [];
  for (const a of rig.animations) {
    const dirs = (a as { directions?: DirectionName[] }).directions ?? rig.directions.map((d) => d.id);
    for (const dir of dirs) {
      const from = frames.length, row = rig.directions.findIndex((d) => d.id === dir);
      for (const f of a.frames) frames.push({ anim: a.id, dir, row, cell: f.cell, ms: f.ms });
      tags.push(cat([w16(from), w16(frames.length - 1), [0], w16(a.loop ? 0 : 1), [0, 0, 0, 0, 0, 0], [0, 0, 0], [0], str(`${a.id}_${dir}`)]));
    }
  }
  const first = new Map<string, number>(); // "<layer>/<anim>/<dir>/<cell>" -> first frame with that cel (linked cels)
  const out: Bytes[] = [];
  for (const [fi, fr] of frames.entries()) {
    const z = new Map(sortLayers(all, (l) => resolveZ(l.slot, l.layer, fr.anim, fr.dir, fr.cell)).map((l, i) => [l, i]));
    const chunks: Bytes[] = fi ? [] : [...layerChunks, chunk(0x2018, w16(tags.length), [0, 0, 0, 0, 0, 0, 0, 0], ...tags),
      chunk(0x2022, w32(1), w32(2), w32(0), str('pivot'), w32(0), w32(0), w32(0), w32(bf.w), w32(bf.h), w32(bf.x), w32(bf.y))];
    for (const [li, l] of stack.entries()) {
      const f = layerFrame(rig, l.layer), sheet = sheets.get(l.layer.sheets![fr.anim])!;
      const head = [w16(li), w16(bf.x - f.x), w16(bf.y - f.y), [255]], zi = w16(z.get(l)! - li), pad = [0, 0, 0, 0, 0];
      const key = `${li}/${fr.anim}/${fr.dir}/${fr.cell}`, link = first.get(key);
      if (link != null) { chunks.push(chunk(0x2005, ...head, w16(1), zi, pad, w16(link))); continue; }
      const px = new Uint8Array(f.w * f.h * 4);
      for (let y = 0; y < f.h; y++) px.set(sheet.data.subarray(((fr.row * f.h + y) * sheet.w + fr.cell * f.w) * 4, ((fr.row * f.h + y) * sheet.w + (fr.cell + 1) * f.w) * 4), y * f.w * 4);
      if (!px.some((v, i) => i % 4 === 3 && v)) continue; // transparent cell = no cel
      first.set(key, fi);
      chunks.push(chunk(0x2005, ...head, w16(2), zi, pad, w16(f.w), w16(f.h), await zlib(px)));
    }
    const size = 16 + chunks.reduce((n, c) => n + c.length, 0);
    out.push(cat([w32(size), w16(0xf1fa), w16(Math.min(chunks.length, 0xffff)), w16(fr.ms), [0, 0], w32(chunks.length), ...chunks]));
  }
  const body = cat(out);
  const header = cat([w32(128 + body.length), w16(0xa5e0), w16(frames.length), w16(bf.w), w16(bf.h), w16(32), w32(1), w16(100), w32(0), w32(0),
    [0, 0, 0, 0], w16(0), [1, 1], w16(0), w16(0), w16(bf.w), w16(bf.h), new Uint8Array(84)]);
  return cat([header, body]);
}

export async function asepriteFiles(m: Manifest, sheets: Map<string, Img>): Promise<OutFile[]> {
  const name = m.name.replace(/[^A-Za-z0-9_-]/g, '_') || 'paperdoll';
  return [
    { name: `aseprite/${name}.aseprite`, data: await asepriteFile(m, sheets) },
    {
      name: 'aseprite/README.txt',
      data: `${name}.aseprite: the whole paperdoll as one layered Aseprite file (Aseprite 1.3+), no code needed.
Layers: one per item layer, "<slot>.<item>" (".fg"/".bg" for items drawn in front of and behind the body), in draw order.
Visible = the first outfit in manifest.json; show or hide layers to dress the character. Tags: "<move>_<direction>".
Canvas ${bakedFrame(m).w}x${bakedFrame(m).h} (fits every layer); slice "pivot" marks the feet. Frame durations are the move's timing.
Per-frame draw-order exceptions (slots[].zOverrides) are cel z-indexes; Unity applies them, per-layer exports ignore them.
Unity: Aseprite Importer, Import Mode Individual Layers, Generate Model Prefab on, Pivot Space Canvas.
Godot: Aseprite Wizard, one SpriteFrames per layer. Colours are the source ramps (outfit recolours are not applied).
`,
    },
  ];
}

/** Tiny .aseprite reader for the self-test (and handy for debugging an export). */
export async function readAseprite(b: Uint8Array) {
  const v = new DataView(b.buffer, b.byteOffset, b.byteLength), dec = new TextDecoder();
  const s = (p: number) => dec.decode(b.subarray(p + 2, p + 2 + v.getUint16(p, true)));
  const r = { size: v.getUint32(0, true), magic: v.getUint16(4, true), w: v.getUint16(8, true), h: v.getUint16(10, true), depth: v.getUint16(12, true),
    frames: [] as { ms: number; cels: { layer: number; x: number; y: number; type: number; z: number; link?: number; img?: Img }[] }[],
    layers: [] as { name: string; visible: boolean }[], tags: [] as { name: string; from: number; to: number; repeat: number }[], slices: [] as { name: string; pivot: [number, number] }[] };
  let p = 128;
  for (let f = 0; f < v.getUint16(6, true); f++) {
    if (v.getUint16(p + 4, true) !== 0xf1fa) throw new Error(`frame ${f}: bad magic`);
    const end = p + v.getUint32(p, true), fr = { ms: v.getUint16(p + 8, true), cels: [] as (typeof r.frames)[0]['cels'] };
    for (let c = p + 16, n = v.getUint32(p + 12, true); n--; c += v.getUint32(c, true)) {
      const t = v.getUint16(c + 4, true), d = c + 6;
      if (t === 0x2004) r.layers.push({ name: s(d + 16), visible: !!(v.getUint16(d, true) & 1) });
      if (t === 0x2018) for (let i = 0, q = d + 10; i < v.getUint16(d, true); i++, q += 19 + v.getUint16(q + 17, true))
        r.tags.push({ name: s(q + 17), from: v.getUint16(q, true), to: v.getUint16(q + 2, true), repeat: v.getUint16(q + 5, true) });
      if (t === 0x2022) { const q = d + 12 + 2 + v.getUint16(d + 12, true); r.slices.push({ name: s(d + 12), pivot: [v.getInt32(q + 20, true), v.getInt32(q + 24, true)] }); }
      if (t === 0x2005) {
        const cel: (typeof fr.cels)[0] = { layer: v.getUint16(d, true), x: v.getInt16(d + 2, true), y: v.getInt16(d + 4, true), type: v.getUint16(d + 7, true), z: v.getInt16(d + 9, true) };
        if (cel.type === 1) cel.link = v.getUint16(d + 16, true);
        if (cel.type === 2) {
          const w = v.getUint16(d + 16, true), h = v.getUint16(d + 18, true), z = b.subarray(d + 20, c + v.getUint32(c, true));
          const px = new Uint8Array(await new Response(new Blob([z.slice() as Uint8Array<ArrayBuffer>]).stream().pipeThrough(new DecompressionStream('deflate'))).arrayBuffer());
          cel.img = { w, h, data: new Uint8ClampedArray(px) };
        }
        fr.cels.push(cel);
      }
    }
    r.frames.push(fr);
    p = end;
  }
  return r;
}

export async function selfTest() {
  // 2x2 rig, pivot (1,2); a 4x4 "sword" with pivot (2,3) -> canvas 4x4, body cel at (1,1); one move, 2 cells, playlist 0,1,1
  const px = (w: number, h: number, r: number) => ({ w, h, data: new Uint8ClampedArray(w * h * 4).map((_, i) => (i % 4 === 3 ? 255 : i % 4 === 0 ? r : 0)) });
  const two = (w: number, h: number, r: number): Img => { const s = px(2 * w, 2 * h, r); s.data.fill(0, 0, 2 * w * h * 4); return s; }; // 2 cells x 2 dirs, south row empty
  const m = {
    name: 'hero t', rig: { cell: { w: 2, h: 2 }, pivot: { x: 1, y: 2 }, baseItem: 'base', directions: [{ id: 'south' }, { id: 'east' }],
      animations: [{ id: 'walk', cells: 2, loop: false, frames: [{ cell: 0, ms: 100 }, { cell: 1, ms: 50 }, { cell: 1, ms: 70 }], directions: ['south', 'east'] }] },
    slots: [{ id: 'body', z: 10 }, { id: 'main_hand', z: 150, bgZ: 6, zOverrides: [{ layer: 'fg', z: 8, dir: 'east', cell: 1 }] }],
    items: [
      { id: 'base', slot: 'body', layers: [{ id: 'main', role: 'fg', z: 10, sheets: { walk: 'b.png' } }] },
      { id: 'sw', slot: 'main_hand', layers: [{ id: 'fg', role: 'fg', z: 150, cell: { w: 4, h: 4 }, pivot: { x: 2, y: 3 }, sheets: { walk: 'f.png' } }, { id: 'bg', role: 'bg', z: 6, cell: { w: 4, h: 4 }, pivot: { x: 2, y: 3 }, sheets: { walk: 'g.png' } }] },
    ],
    presets: [{ id: 'd', items: { main_hand: null } }],
  } as unknown as Manifest;
  const sheets = new Map<string, Img>([['b.png', two(2, 2, 1)], ['f.png', two(4, 4, 2)], ['g.png', two(4, 4, 3)]]);
  const bytes = await asepriteFile(m, sheets), a = await readAseprite(bytes);
  console.assert(a.magic === 0xa5e0 && a.size === bytes.length && a.depth === 32 && a.w === 4 && a.h === 4, `header ${JSON.stringify({ ...a, frames: a.frames.length })}`);
  console.assert(a.layers.map((l) => `${l.name}:${+l.visible}`).join() === 'main_hand.sw.bg:0,body.base:1,main_hand.sw.fg:0', `layers ${JSON.stringify(a.layers)}`);
  console.assert(a.frames.length === 6 && a.frames.map((f) => f.ms).join() === '100,50,70,100,50,70', 'one frame per playlist entry x dir, ms');
  console.assert(a.tags.map((t) => `${t.name}:${t.from}-${t.to}:${t.repeat}`).join() === 'walk_south:0-2:1,walk_east:3-5:1', `tags ${JSON.stringify(a.tags)}`);
  console.assert(a.slices[0]?.name === 'pivot' && a.slices[0].pivot.join() === '2,3', 'pivot slice');
  console.assert(a.frames[0].cels.length === 0 && a.frames[1].cels.length === 0, 'south row empty -> no cels');
  const e0 = a.frames[3].cels, body = e0.find((c) => c.layer === 1)!;
  console.assert(e0.length === 3 && body.x === 1 && body.y === 1 && body.img!.w === 2 && body.img!.data[0] === 1 && e0.find((c) => c.layer === 2)!.x === 0, 'cels aligned by pivot');
  console.assert(e0.every((c) => c.z === 0) && a.frames[4].cels.find((c) => c.layer === 2)!.z === -1, 'zOverride -> cel z-index (fg z8 lands between bg z6 and body z10)');
  console.assert(a.frames[5].cels.every((c) => c.type === 1 && c.link === 4), 'held cell = linked cel');
  m.presets[0].items.main_hand = 'sw';
  console.assert((await readAseprite(await asepriteFile(m, sheets))).layers.every((l) => l.visible), 'equipped layers visible');
}
