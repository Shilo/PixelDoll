// Compose (architecture §3.5, manifest-spec §3 invariants 7–9): visible layers, resolved z, draw list, pixel compose.
// Pure over Img, so the preview, baked export and node scripts share one code path.
import { makeImg, type Img } from '../image/png.ts';
import { flipH } from '../rig/mirror.ts';
import { cellHash } from '../rig/rig.ts';
import type { DirectionName, Item, Layer, Manifest, Preset, Project, Rig, Sha256, Slot } from '../store/manifest.ts';

/** `under`: equipped items this item is tucked under (slot.clips, B14); compose clips its cells on the fly. */
export interface Draw { item: Item; layer: Layer; slot: Slot; z: number; under: Item[] }

/** A cell size plus the pivot inside it (pixel-edge coords). Layers line up by pivot: a layer's cell sits at
 *  (frame.x - layer.x, frame.y - layer.y) in a frame (manifest-spec v1.3.1 oversize layers). */
export interface Frame { w: number; h: number; x: number; y: number }
export const rigFrame = (rig: Pick<Rig, 'cell' | 'pivot'>): Frame => ({ ...rig.cell, ...rig.pivot });
export const layerFrame = (rig: Pick<Rig, 'cell' | 'pivot'>, l: Pick<Layer, 'cell' | 'pivot'>): Frame => ({ ...rig.cell, ...rig.pivot, ...l.cell, ...l.pivot });
/** Smallest frame that holds every given frame around a shared pivot (baked composites). */
export function unionFrame(fs: Frame[]): Frame {
  const x = Math.max(...fs.map((f) => f.x)), y = Math.max(...fs.map((f) => f.y));
  return { x, y, w: x + Math.max(...fs.map((f) => f.w - f.x)), h: y + Math.max(...fs.map((f) => f.h - f.y)) };
}
/** Frame for baked composites: the union of every layer of every item (one cell size per export, not per preset). */
export const bakedFrame = (m: Manifest): Frame => unionFrame([rigFrame(m.rig), ...m.items.flatMap((it) => it.layers.map((l) => layerFrame(m.rig, l)))]);

/** Equipped items of a preset (slot -> item); the base is always on. */
export function equipped(m: Manifest, items: Preset['items']): Item[] {
  return m.items.filter((it) => it.id === m.rig.baseItem || items[it.slot] === it.id);
}

/** Slots hidden by equipped items (item.hides ?? slot.hides). */
// ponytail: hides come from every equipped item, even one that is itself hidden; chains are not resolved.
export function hiddenSlots(m: Manifest, items: Item[]): Set<string> {
  const out = new Set<string>();
  for (const it of items) for (const s of it.hides ?? m.slots.find((x) => x.id === it.slot)?.hides ?? []) out.add(s);
  return out;
}

// ---------- B14 tuck-under (slot.clips): hair under a helmet keeps only what hangs below the brim ----------
/** Equipped items whose slot tucks `slot` under them (slot.clips). Hidden or not: every engine runtime uses the same rule. */
export const tuckers = (m: Manifest, on: Item[], slot: string) => on.filter((c) => c.slot !== slot && (m.slots.find((s) => s.id === c.slot)?.clips ?? []).includes(slot));
/** Variant id of `item` tucked under `over` (exports bake these: engines swap sheets, they never mask). */
export const tuckedId = (item: string, over: string) => `${item}~${over}`;
/** The equipped items as drawn: an item tucked under another uses its baked variant when the project has one. */
export const shownItems = (m: Manifest, on: Item[]): Item[] =>
  on.map((it) => tuckers(m, on, it.slot).map((c) => m.items.find((v) => v.id === tuckedId(it.id, c.id))).find(Boolean) ?? it);

/**
 * Drop the px of `im` (frame `f`) that sit under the covering layers' silhouette: per column, everything at or above the
 * cover's lowest opaque row (inside the helmet and hair poking out of its top); columns beside the cover use the nearest
 * covered column (hair cannot stick out sideways above the brim). Px below the brim stay (long hair). Idempotent.
 * ponytail: the cover is the whole item silhouette; a circlet or a hat with a hole would clip everything above its lowest row
 * (per-item clip masks if such items appear).
 */
export function tuck(im: Img, f: Frame, covers: [Img | null, Frame][]): Img {
  const brim = new Array<number>(im.w).fill(-1);
  for (const [c, g] of covers) {
    if (!c) continue;
    for (let y = 0; y < c.h; y++)
      for (let x = 0; x < c.w; x++) {
        if (!c.data[(y * c.w + x) * 4 + 3]) continue;
        const X = x - g.x + f.x, Y = y - g.y + f.y; // same body point (layers align by pivot)
        if (X >= 0 && X < im.w) brim[X] = Math.max(brim[X], Y);
      }
  }
  if (brim.every((b) => b < 0)) return im;
  for (let x = 1; x < im.w; x++) if (brim[x] < 0) brim[x] = brim[x - 1]; // beside the cover: nearest covered column
  for (let x = im.w - 2; x >= 0; x--) if (brim[x] < 0) brim[x] = brim[x + 1];
  const o: Img = { w: im.w, h: im.h, data: im.data.slice() };
  for (let y = 0; y < im.h; y++) for (let x = 0; x < im.w; x++) if (y <= brim[x]) o.data.fill(0, (y * im.w + x) * 4, (y * im.w + x) * 4 + 4);
  return o;
}
const tucked = (p: Project, im: Img | null, l: Layer, under: Item[], anim: string, dir: DirectionName, cell: number): Img | null =>
  im && under.length ? tuck(im, layerFrame(p.manifest.rig, l), under.flatMap((c) => c.layers.map((cl) => [cellImg(p, cl, anim, dir, cell), layerFrame(p.manifest.rig, cl)] as [Img | null, Frame]))) : im;

/** Export copy of `p` with a baked "<item>~<over>" variant per (tucked item, covering item) pair: engines swap to it when both
 *  are worn (stored directions only; a mirrored view is the flip of its source, and tucking commutes with the flip). */
export async function withTuckVariants(p: Project): Promise<Project> {
  const m = p.manifest, images = new Map(p.images), add: Item[] = [];
  for (const over of m.items)
    for (const slot of m.slots.find((s) => s.id === over.slot)?.clips ?? [])
      for (const it of m.items.filter((x) => x.slot === slot && !x.variantOf)) {
        const v: Item = { ...structuredClone(it), id: tuckedId(it.id, over.id), name: `${it.name} under ${over.name}`, variantOf: it.id, under: over.id };
        delete v.qa;
        for (const [li, l] of v.layers.entries())
          for (const [anim, dirs] of Object.entries(l.cells ?? {}))
            for (const [dir, cells] of Object.entries(dirs ?? {}) as [DirectionName, (Sha256 | null)[]][])
              dirs![dir] = await Promise.all(cells.map(async (h, i) => {
                const original = it.layers[li];
                const t = tucked(p, h ? cellImg(p, original, anim, dir, i) : null, original, [over], anim, dir, i);
                if (!t?.data.some((x, j) => j % 4 === 3 && x)) return null;
                const k = await cellHash(t);
                images.set(k, t);
                return k;
              }));
        add.push(v);
      }
  return add.length ? { manifest: { ...m, items: [...m.items, ...add] }, images, layerImages: p.layerImages } : p;
}

/** Most specific matching zOverride (cell > anim > dir > none; later wins on ties), else layer.z. */
export function resolveZ(slot: Slot | undefined, layer: Pick<Layer, 'role' | 'z'>, anim: string, dir: DirectionName, cell: number): number {
  let z = layer.z, best = -1;
  for (const o of slot?.zOverrides ?? []) {
    if (o.layer !== layer.role || (o.dir && o.dir !== dir) || (o.anim && o.anim !== anim) || (o.cell != null && o.cell !== cell)) continue;
    const rank = o.cell != null ? 3 : o.anim ? 2 : o.dir ? 1 : 0;
    if (rank >= best) { best = rank; z = o.z; }
  }
  return z;
}

/** Draw order for one cell: ascending z, then slot order, bg before fg, then item id. */
export function drawList(m: Manifest, items: Preset['items'], anim: string, dir: DirectionName, cell: number): Draw[] {
  const on = equipped(m, items), hidden = hiddenSlots(m, on);
  const slotIx = (id: string) => m.slots.findIndex((s) => s.id === id);
  const list: Draw[] = [];
  for (const item of shownItems(m, on)) {
    if (hidden.has(item.slot)) continue;
    const slot = m.slots.find((s) => s.id === item.slot)!, under = item.under ? [] : tuckers(m, on, item.slot); // a baked variant is already tucked
    for (const layer of item.layers) list.push({ item, layer, slot, z: resolveZ(slot, layer, anim, dir, cell), under });
  }
  return list.sort((a, b) => a.z - b.z || slotIx(a.item.slot) - slotIx(b.item.slot) || (a.layer.role === b.layer.role ? 0 : a.layer.role === 'bg' ? -1 : 1) || a.item.id.localeCompare(b.item.id));
}

/** A layer's cell image; null = transparent. A mirrored direction without stored cells is a flip of its source. */
export function cellImg(p: Project, layer: Layer, anim: string, dir: DirectionName, cell: number): Img | null {
  const stored = layer.cells?.[anim]?.[dir];
  if (stored) {
    const h = stored[cell];
    return h ? p.layerImages?.get(layer)?.get(h) ?? p.images.get(h) ?? null : null;
  }
  const src = p.manifest.rig.directions.find((d) => d.id === dir)?.mirrorOf;
  const im = src ? cellImg(p, layer, anim, src, cell) : null;
  return im && flipH(im);
}

/** Straight-alpha source-over of src onto dst at (x, y), in place, clipped to dst. Binary alpha = plain copy. */
export function over(dst: Img, src: Img, x = 0, y = 0) {
  for (let sy = Math.max(0, -y); sy < Math.min(src.h, dst.h - y); sy++)
    for (let sx = Math.max(0, -x); sx < Math.min(src.w, dst.w - x); sx++) {
      const s = (sy * src.w + sx) * 4, ta = src.data[s + 3];
      if (!ta) continue;
      const d = ((y + sy) * dst.w + x + sx) * 4;
      if (ta === 255) { dst.data.set(src.data.subarray(s, s + 4), d); continue; }
      const ba = dst.data[d + 3] / 255, a = ta / 255, oa = a + ba * (1 - a);
      for (let c = 0; c < 3; c++) dst.data[d + c] = Math.round((src.data[s + c] * a + dst.data[d + c] * ba * (1 - a)) / oa);
      dst.data[d + 3] = Math.round(oa * 255);
    }
}

/** Composite of one cell on `frame` (default the rig cell: oversize layers are clipped to it; bakedFrame() keeps them whole). */
export function composeCell(p: Project, items: Preset['items'], anim: string, dir: DirectionName, cell: number, frame = rigFrame(p.manifest.rig)): Img {
  const out = makeImg(frame.w, frame.h);
  for (const d of drawList(p.manifest, items, anim, dir, cell)) {
    const im = tucked(p, cellImg(p, d.layer, anim, dir, cell), d.layer, d.under, anim, dir, cell), f = layerFrame(p.manifest.rig, d.layer);
    if (im) over(out, im, frame.x - f.x, frame.y - f.y);
  }
  return out;
}

export function selfTest() {
  const px = (r: number): Img => ({ w: 1, h: 1, data: new Uint8ClampedArray([r, 0, 0, 255]) });
  const images = new Map<string, Img>([['sha256:b', px(1)], ['sha256:h', px(2)], ['sha256:c', px(3)], ['sha256:k', px(4)]]);
  const L = (role: 'fg' | 'bg', z: number, h: string) => ({ id: role === 'bg' ? 'bg' : 'main', role, z, cells: { walk: { south: [h as `sha256:${string}`, null] } } }) as Layer;
  const item = (id: string, slot: string, layers: Layer[], hides?: string[]) => ({ id, slot, layers, hides }) as Item;
  const m = {
    rig: { cell: { w: 1, h: 1 }, pivot: { x: 0, y: 0 }, baseItem: 'base', directions: [{ id: 'south' }, { id: 'east' }, { id: 'west', mirrorOf: 'east' }] },
    slots: [
      { id: 'body', z: 10 },
      { id: 'back', z: 90, bgZ: 4 },
      { id: 'hair', z: 110 },
      { id: 'head', z: 130, hides: ['hair'], zOverrides: [{ layer: 'fg', z: 5, dir: 'south' }, { layer: 'fg', z: 7, dir: 'south', cell: 1 }, { layer: 'fg', z: 6, anim: 'walk' }] },
    ],
    items: [
      item('base', 'body', [L('fg', 10, 'sha256:b')]),
      item('cape', 'back', [L('fg', 90, 'sha256:c'), L('bg', 4, 'sha256:k')]),
      item('hair1', 'hair', [L('fg', 110, 'sha256:h')]),
      item('helm', 'head', [L('fg', 130, 'sha256:h')]),
    ],
  } as unknown as Manifest;
  const p: Project = { manifest: m, images };
  const head = m.slots[3], fg = { role: 'fg' as const, z: 130 };
  console.assert(resolveZ(head, fg, 'idle', 'east', 0) === 130, 'z: no override');
  console.assert(resolveZ(head, fg, 'idle', 'south', 0) === 5, 'z: dir override');
  console.assert(resolveZ(head, fg, 'walk', 'south', 0) === 6, 'z: anim beats dir');
  console.assert(resolveZ(head, fg, 'walk', 'south', 1) === 7, 'z: cell beats anim');
  console.assert(resolveZ(head, { role: 'bg', z: 3 }, 'walk', 'south', 1) === 3, 'z: role must match');
  const order = (items: Preset['items'], dir: DirectionName = 'east') => drawList(m, items, 'idle', dir, 0).map((d) => `${d.item.id}.${d.layer.role}`).join();
  console.assert(order({ back: 'cape', hair: 'hair1' }) === 'cape.bg,base.fg,cape.fg,hair1.fg', `draw order ${order({ back: 'cape', hair: 'hair1' })}`);
  console.assert(order({ hair: 'hair1', head: 'helm' }) === 'base.fg,helm.fg', 'helmet hides hair');
  console.assert(order({ head: 'helm' }, 'south') === 'helm.fg,base.fg', 'dir override reorders');
  console.assert(order({ head: null }) === 'base.fg', 'empty slot');
  console.assert(composeCell(p, { back: 'cape' }, 'walk', 'south', 0).data[0] === 3, 'compose: fg cape over base');
  console.assert(composeCell(p, { back: 'cape' }, 'walk', 'south', 1).data[3] === 0, 'compose: transparent cell');
  const e = { id: 'main', role: 'fg', z: 1, cells: { walk: { east: ['sha256:b'] } } } as Layer;
  const two: Img = { w: 2, h: 1, data: new Uint8ClampedArray([1, 0, 0, 255, 2, 0, 0, 255]) };
  images.set('sha256:b', two);
  console.assert(cellImg(p, e, 'walk', 'west', 0)?.data.join() === '2,0,0,255,1,0,0,255', 'mirrored dir = flip of source');
  console.assert(cellImg(p, e, 'walk', 'south', 0) === null && cellImg(p, e, 'idle', 'east', 0) === null, 'missing anim/dir = transparent');

  // oversize: a 3x3 layer with pivot (2,2) over a 1x1 rig cell with pivot (1,1) -> its center pixel lands on the rig cell
  const big: Img = { w: 3, h: 3, data: new Uint8ClampedArray(36).map((_, i) => (i % 4 === 3 ? 255 : i % 4 === 0 ? 10 + (i >> 2) : 0)) };
  images.set('sha256:o', big);
  const sword = { id: 'main', role: 'fg', z: 150, cell: { w: 3, h: 3 }, pivot: { x: 2, y: 2 }, cells: { walk: { south: ['sha256:o', null] } } } as Layer;
  m.slots.push({ id: 'main_hand', z: 150 } as Slot);
  m.items.push(item('sw', 'main_hand', [sword]));
  m.rig.pivot = { x: 1, y: 1 };
  console.assert(composeCell(p, { main_hand: 'sw' }, 'walk', 'south', 0).data[0] === 14, 'oversize: aligned by pivot, clipped to the rig cell');
  const bf = bakedFrame(m);
  console.assert(bf.w === 3 && bf.h === 3 && bf.x === 2 && bf.y === 2, `bakedFrame = union around the pivot ${JSON.stringify(bf)}`);
  const baked = composeCell(p, { main_hand: 'sw' }, 'walk', 'south', 0, bf);
  console.assert(baked.data.filter((_, i) => i % 4 === 0).join() === '10,11,12,13,14,15,16,17,18', 'oversize: whole layer on the baked frame');
  const u = unionFrame([{ w: 64, h: 64, x: 32, y: 60 }, { w: 96, h: 96, x: 48, y: 76 }, { w: 64, h: 80, x: 32, y: 60 }]);
  console.assert(u.w === 96 && u.h === 96 && u.x === 48 && u.y === 76, 'unionFrame');
  // B14 tuck: hair 4x4 under a 2x2 helmet at columns 1-2, rows 0-1 -> rows 0-1 go everywhere (sides: nearest column), rows 2-3 stay
  const hair4 = makeImg(4, 4); hair4.data.fill(255);
  const helm4 = makeImg(4, 4); for (const q of [1, 2, 5, 6]) helm4.data.set([9, 9, 9, 255], q * 4);
  const f4 = { w: 4, h: 4, x: 2, y: 4 }, t4 = tuck(hair4, f4, [[helm4, f4]]), op = (im: Img) => im.data.filter((_, i) => i % 4 === 3 && _).length;
  console.assert(op(t4) === 8 && t4.data[(2 * 4) * 4 + 3] === 255 && !t4.data[3] && op(tuck(t4, f4, [[helm4, f4]])) === 8, 'tuck: drops px at/above the brim, keeps what hangs below, idempotent');
  console.assert(op(tuck(hair4, f4, [[helm4, { ...f4, y: 3 }]])) === 4 && tuck(hair4, f4, [[null, f4]]) === hair4, 'tuck: covers align by pivot; no cover = untouched');
  const tm = { slots: [{ id: 'hair', z: 110 }, { id: 'head', z: 130, clips: ['hair'] }], items: [{ id: 'h', slot: 'hair' }, { id: 'k', slot: 'head' }, { id: 'h~k', slot: 'hair', variantOf: 'h', under: 'k' }] } as unknown as Manifest;
  console.assert(shownItems(tm, [tm.items[0], tm.items[1]]).map((i) => i.id).join() === 'h~k,k' && shownItems(tm, [tm.items[0]])[0].id === 'h', 'tuck: the baked variant replaces its item only under its cover');
  const clip = makeImg(2, 2); over(clip, big, -1, -1);
  console.assert(clip.data[0] === 14 && clip.data[12] === 18, 'over clips negative offsets');
}
