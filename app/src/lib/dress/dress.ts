// Dress-up model (architecture §4, §6): per-item materials, variant resolution with linkTo, recoloured project view,
// random outfits, coverage and layer outlines. Pure over Project; the M4 UI and the baked export share recolour().
import type { Img } from '../image/png.ts';
import type { DirectionName, Hex, Item, Manifest, Material, Preset, Project } from '../store/manifest.ts';
import { applyIndex, autoRamps, colourCounts, deriveRamps, fromHex, hueName, indexImg, tintRamp, variantRamp } from './palette.ts';

export const SWATCHES: Record<string, Hex> = {
  crimson: '#b02832', ember: '#d9622b', gold: '#d9a92b', moss: '#5c8a2e', teal: '#2a9c8f', azure: '#2a63c4',
  royal: '#4a2ab0', plum: '#8a2a7d', rose: '#d96b9a', umber: '#6b4a2e', ash: '#8a8a8a', ink: '#2e2e3a',
};

export const SKIN_TONES: Hex[] = ['#5c3a21', '#8d5524', '#c68642', '#e0ac69', '#f1c27d', '#ffdbac'];

export const itemImgs = (p: Project, it: Item): Img[] =>
  it.layers.flatMap((l) => Object.values(l.cells ?? {}).flatMap((d) => Object.values(d ?? {}).flat())).flatMap((h) => (h && p.images.get(h)) || []);

/**
 * (Re)derive the materials of `items` (default: items without materials) and replace theirs in m.materials. Other materials'
 * colours are claimed first, so ramps stay disjoint. k = 0 -> autoRamps. Labels: "<item name> <hue word>".
 */
export function deriveMaterials(p: Project, items = p.manifest.items.filter((i) => !i.materials.length), k: Record<string, number> = {}) {
  const m = p.manifest, ids = new Set(items.map((i) => i.id));
  m.materials = m.materials.filter((x) => !ids.has(x.owner));
  const claimed = new Set(m.materials.flatMap((x) => x.ramp.map(fromHex)));
  for (const it of [...items].sort((a, b) => +(b.id === m.rig.baseItem) - +(a.id === m.rig.baseItem))) {
    const counts = colourCounts(itemImgs(p, it));
    const ramps = k[it.id] ? deriveRamps(counts, k[it.id], claimed) : autoRamps(counts, claimed);
    it.materials = ramps.map((ramp, i) => {
      ramp.forEach((h) => claimed.add(fromHex(h)));
      const id = `${it.id}_${i + 1}`;
      m.materials.push({ id, label: `${it.name} ${hueName(ramp)}`, ramp, variants: {}, owner: it.id });
      return id;
    });
  }
}

/** Selected variant of a material, following linkTo (cycles stop). */
export function variantOf(m: Manifest, variants: Preset['variants'], id: string, seen = new Set<string>()): string | undefined {
  const mat = m.materials.find((x) => x.id === id);
  if (!mat || seen.has(id)) return undefined;
  seen.add(id);
  return mat.linkTo ? variantOf(m, variants, mat.linkTo, seen) : variants[id];
}

/** Variant names: a swatch name, "#rrggbb", or "tint:<swatch|#hex>" (grayscale × tint). Stored names win. */
export function variantRampOf(mat: Material, name: string): Hex[] | undefined {
  if (mat.variants[name]) return mat.variants[name];
  const tint = name.startsWith('tint:'), key = tint ? name.slice(5) : name;
  const pick = SWATCHES[key] ?? (/^#[0-9a-f]{6}$/i.test(key) ? (key as Hex) : undefined);
  return pick && (tint ? tintRamp : variantRamp)(mat.ramp, pick);
}

/** Store every ramp the given selections resolve to in mat.variants (so the manifest carries them for export). */
export function storeVariants(m: Manifest, ...selections: Preset['variants'][]) {
  for (const v of selections)
    for (const mat of m.materials) {
      const name = variantOf(m, v, mat.id), r = name && !mat.variants[name] && variantRampOf(mat, name);
      if (name && r) mat.variants[name] = r;
    }
}

// ponytail: index cache keyed by image object; a rebuilt project rebuilds its indices.
const cache = new WeakMap<Img, { sig: string; idx: Int16Array }>();

/** Project view with the selected variants swapped in (exact index swap). Same cell hashes, so compose is unchanged. */
// ponytail: images are replaced per hash; two items sharing an identical cell image would share its recolour.
export function recolour(p: Project, variants: Preset['variants']): Project {
  const m = p.manifest;
  let images: Map<string, Img> | null = null;
  for (const it of m.items) {
    const mats = it.materials.flatMap((id) => m.materials.find((x) => x.id === id) ?? []);
    const ids = new Map<number, number>(), table: number[] = [];
    for (const mat of mats) {
      const name = variantOf(m, variants, mat.id), r = name ? variantRampOf(mat, name) : undefined;
      mat.ramp.forEach((h, i) => { ids.set(fromHex(h), table.length); table.push(r ? fromHex(r[i]) : -1); });
    }
    if (!table.some((c) => c >= 0)) continue;
    images ??= new Map(p.images);
    const sig = mats.map((x) => x.ramp.join()).join('|'), t = Int32Array.from(table);
    for (const l of it.layers)
      for (const d of Object.values(l.cells ?? {}))
        for (const h of Object.values(d ?? {}).flat()) {
          const im = h && p.images.get(h);
          if (!im) continue;
          let c = cache.get(im);
          if (!c || c.sig !== sig) cache.set(im, (c = { sig, idx: indexImg(im, ids) }));
          images.set(h!, applyIndex(im, c.idx, t));
        }
  }
  return images ? { manifest: m, images } : p;
}

/** Random outfit: each non-body slot gets none or one of its items; each unlinked material keeps its source or gets a swatch. */
export function randomOutfit(m: Manifest, rnd = Math.random): Pick<Preset, 'items' | 'variants'> {
  const pick = <T>(xs: T[]) => xs[Math.floor(rnd() * xs.length)];
  const items: Preset['items'] = {};
  for (const s of m.slots) if (s.id !== 'body') items[s.id] = pick([null, ...m.items.filter((i) => i.slot === s.id).map((i) => i.id)]);
  const variants: Preset['variants'] = {};
  for (const mat of m.materials) {
    const skin = mat.owner === m.rig.baseItem && ['red', 'orange'].includes(hueName(mat.ramp)); // ponytail: hue guess for "skin"
    if (!mat.linkTo && rnd() < 0.6) variants[mat.id] = pick(skin ? SKIN_TONES : Object.keys(SWATCHES));
  }
  return { items, variants };
}

/** "anim/dir" pairs where the base has cells but the item has none (mirrored directions follow their source). */
export function coverageGaps(m: Manifest, it: Item): string[] {
  const has = (x: Item | undefined, a: string, d: DirectionName) => !!x?.layers.some((l) => l.cells?.[a]?.[d]?.some(Boolean));
  const base = m.items.find((i) => i.id === m.rig.baseItem);
  return m.rig.animations.flatMap((a) =>
    m.rig.directions.filter((d) => !d.mirrorOf && has(base, a.id, d.id) && !has(it, a.id, d.id)).map((d) => `${a.id}/${d.id}`));
}

/** Edge pixels of an image's opaque area (opaque with a transparent or out-of-bounds 4-neighbour). */
export function edges(im: Img): number[] {
  const out: number[] = [], a = (x: number, y: number) => x >= 0 && y >= 0 && x < im.w && y < im.h && im.data[(y * im.w + x) * 4 + 3] > 0;
  for (let y = 0; y < im.h; y++) for (let x = 0; x < im.w; x++) if (a(x, y) && !(a(x - 1, y) && a(x + 1, y) && a(x, y - 1) && a(x, y + 1))) out.push(y * im.w + x);
  return out;
}

export function selfTest() {
  const px = (...cs: number[]): Img => ({ w: cs.length, h: 1, data: new Uint8ClampedArray(cs.flatMap((c) => [c >> 16, (c >> 8) & 255, c & 255, 255])) });
  const images = new Map<string, Img>([['sha256:b', px(0xb65941, 0xf7bb8c, 0x101010)], ['sha256:c', px(0x7d1820, 0xb02832, 0xb65941)]]);
  const L = (h: string, east?: string) => [{ id: 'main', role: 'fg', z: 1, cells: { walk: { south: [h], ...(east ? { east: [east] } : {}) } } }];
  const m = {
    rig: { baseItem: 'base', directions: [{ id: 'south' }, { id: 'east' }, { id: 'west', mirrorOf: 'east' }], animations: [{ id: 'walk' }] },
    slots: [{ id: 'body' }, { id: 'back' }],
    materials: [],
    items: [{ id: 'cape', name: 'Cape', slot: 'back', materials: [], layers: L('sha256:c') }, { id: 'base', name: 'Base', slot: 'body', materials: [], layers: L('sha256:b', 'sha256:b') }],
  } as unknown as Manifest;
  const p: Project = { manifest: m, images };
  deriveMaterials(p);
  const [cape, base] = m.items;
  console.assert(base.materials.join() === 'base_1' && cape.materials.join() === 'cape_1', `materials per item: ${JSON.stringify(m.materials)}`);
  console.assert(!m.materials.find((x) => x.id === 'cape_1')!.ramp.includes('#b65941'), 'base claims its colours first');
  const v = { cape_1: 'azure' };
  const out = recolour(p, v);
  const cols = (im: Img) => [0, 1, 2].map((i) => (im.data[i * 4] << 16) | (im.data[i * 4 + 1] << 8) | im.data[i * 4 + 2]);
  const capeRamp = variantRampOf(m.materials.find((x) => x.id === 'cape_1')!, 'azure')!.map(fromHex);
  console.assert(cols(out.images.get('sha256:c')!).slice(0, 2).join() === capeRamp.join() && cols(out.images.get('sha256:c')!)[2] === 0xb65941, 'cape swapped, shared skin colour kept');
  console.assert(out.images.get('sha256:b') === images.get('sha256:b') && recolour(p, {}) === p, 'untouched items keep their images');
  m.materials.find((x) => x.id === 'base_1')!.linkTo = 'cape_1';
  console.assert(variantOf(m, v, 'base_1') === 'azure' && variantOf(m, {}, 'base_1') === undefined, 'linkTo follows');
  storeVariants(m, v);
  console.assert(m.materials.every((x) => x.variants.azure?.length === x.ramp.length), 'variants stored for linked materials too');
  console.assert(variantRampOf(m.materials[0], 'tint:#ff0000')!.every((h) => /^#[0-9a-f]{2}0000$/.test(h)), 'tint variant');
  const r = randomOutfit(m, () => 0.99);
  console.assert(r.items.back === 'cape' && !('body' in r.items), 'random outfit');
  console.assert(coverageGaps(m, cape).join() === 'walk/east', `coverage gaps ${coverageGaps(m, cape)}`);
  console.assert(edges({ w: 3, h: 3, data: new Uint8ClampedArray(36).fill(255) }).join() === '0,1,2,3,5,6,7,8', 'edges');
}
