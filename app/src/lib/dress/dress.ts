// Dress-up model (architecture §4, §6): per-item materials, variant resolution with linkTo, recoloured project view,
// random outfits, coverage and layer outlines. Pure over Project; the M4 UI and the baked export share recolour().
import type { Img } from '../image/png.ts';
import type { DirectionName, Hex, Item, Layer, Manifest, Material, Preset, Project } from '../store/manifest.ts';
import { applyIndex, autoRamps, colourCounts, deriveRamps, fromHex, hueName, indexImg, lab, tintRamp, toHex, variantRamp } from './palette.ts';
import { isGarment, isShorts } from './regions.ts';

export const SWATCHES: Record<string, Hex> = {
  crimson: '#b02832', ember: '#d9622b', gold: '#d9a92b', moss: '#5c8a2e', teal: '#2a9c8f', azure: '#2a63c4',
  royal: '#4a2ab0', plum: '#8a2a7d', rose: '#d96b9a', umber: '#6b4a2e', ash: '#8a8a8a', ink: '#2e2e3a',
};

export const SKIN_TONES: Hex[] = ['#5c3a21', '#8d5524', '#c68642', '#e0ac69', '#f1c27d', '#ffdbac'];

export const itemImgs = (p: Project, it: Item): Img[] =>
  it.layers.flatMap((l) => Object.values(l.cells ?? {}).flatMap((d) => Object.values(d ?? {}).flat())).flatMap((h) => (h && p.images.get(h)) || []);

// Material words (B7): from the item's description nouns, else its slot; the hue word is the last resort.
const WORDS: [RegExp, string][] = [
  [/\b(iron|steel|metal|chain\w*|plate|silver|golden|gold|bronze|copper|brass|armou?r|helmet|sword|blade|axe|crown|sabatons|greaves|knight)\b/, 'Metal'],
  [/\b(leather|boots?|belt|vest|satchel)\b/, 'Leather'],
  [/\b(hair|braid\w*|ponytail|beard|moustache|mustache|bun)\b/, 'Hair'],
  [/\b(wood\w*|staff|bow|club|shield)\b/, 'Wood'],
  [/\b(fur|pelt)\b/, 'Fur'],
  [/\b(gem|jewel\w*|crystal|ruby|emerald|sapphire)\b/, 'Gem'],
  [/\b(feathers?|plume)\b/, 'Feather'],
  [/\b(cloth|cotton|silk|wool|linen|tunic|robe|cape|cloak|hood|shirt|trousers|pants|scarf|hat|mask|sash|dress|skirt|bandana)\b/, 'Cloth'],
];
const SLOT_WORD: Record<string, string> = { hair: 'Hair', facial_hair: 'Hair', feet: 'Leather', legs: 'Cloth', waist: 'Leather', torso_inner: 'Cloth', torso_outer: 'Cloth', back: 'Cloth', head: 'Cloth', face_acc: 'Cloth', main_hand: 'Metal', off_hand: 'Wood' };
const COLOUR_HUE: Record<string, string[]> = { red: ['red'], crimson: ['red'], orange: ['orange'], brown: ['orange', 'red'], yellow: ['yellow', 'orange'], gold: ['yellow', 'orange'], golden: ['yellow', 'orange'], green: ['green'], teal: ['cyan', 'green'], cyan: ['cyan'], blue: ['blue', 'cyan'], azure: ['blue'], purple: ['purple'], violet: ['purple'], pink: ['pink'], black: ['grey'], white: ['grey'], grey: ['grey'], gray: ['grey'], silver: ['grey'] };
const title = (w: string) => w[0].toUpperCase() + w.slice(1);
const wordOf = (noun: string) => WORDS.find(([re]) => re.test(noun))?.[1];

/** Sensible material names for an item's ramps: "Skin"/"Clothes" on the base, else description nouns ("red plume" -> Feather),
 * then the slot's usual material, then the hue word. Repeats get a number ("Cloth 2"). */
export function materialNames(it: Pick<Item, 'slot' | 'prompt' | 'name'>, ramps: Hex[][]): string[] {
  const text = `${it.prompt} ${it.name}`.toLowerCase(), hues = ramps.map(hueName), used = new Set<string>();
  const words = WORDS.map(([re, w]) => [text.search(re), w] as const).filter(([i]) => i >= 0).sort((a, b) => a[0] - b[0]).map(([, w]) => w);
  const pairs = [...text.matchAll(/\b(\w+)\s+(\w+)/g)].filter((m) => COLOUR_HUE[m[1]]).map((m) => ({ hues: COLOUR_HUE[m[1]], noun: m[2] }));
  const free = (w?: string) => (w && !used.has(w) ? w : undefined);
  // B10 (T1 P2-10): a near-black ramp is the outline, and an unexplained ramp is a "Detail" (a hue word misnames it)
  const lum = (h: Hex) => { const n = fromHex(h); return (0.299 * (n >> 16) + 0.587 * ((n >> 8) & 255) + 0.114 * (n & 255)) / 255; };
  const names = ramps.map((r, i) => {
    const pair = pairs.find((p) => p.hues.includes(hues[i]));
    const n = it.slot !== 'body' && Math.max(...r.map(lum)) < 0.22 ? 'Outline' : it.slot === 'body'
      ? (hues[i] === 'grey' ? free('Clothes') : ['red', 'orange', 'yellow', 'pink'].includes(hues[i]) ? free('Skin') : undefined) ?? title(hues[i])
      : (pair && free(wordOf(pair.noun) ?? title(pair.noun))) ?? (hues[i] === 'grey' ? free(words.includes('Metal') ? 'Metal' : undefined) : undefined)
        ?? free(words.find((w) => !used.has(w))) ?? free(SLOT_WORD[it.slot]) ?? 'Detail';
    used.add(n);
    return n;
  });
  return names.map((n, i) => (names.indexOf(n) < i ? `${n} ${names.slice(0, i + 1).filter((x) => x === n).length}` : n));
}

/**
 * (Re)derive the materials of `items` (default: items without materials) and replace theirs in m.materials. Other materials'
 * colours are claimed first, so ramps stay disjoint. k = 0 -> autoRamps. Labels: materialNames().
 */
export function deriveMaterials(p: Project, items = p.manifest.items.filter((i) => !i.materials.length), k: Record<string, number> = {}) {
  const m = p.manifest, ids = new Set(items.map((i) => i.id));
  m.materials = m.materials.filter((x) => !ids.has(x.owner));
  const globalClaims = new Set(m.materials.flatMap((x) => x.ramp.map(fromHex)));
  for (const it of [...items].sort((a, b) => +(b.id === m.rig.baseItem) - +(a.id === m.rig.baseItem))) {
    const claimed = m.format === 'pixeldoll/2' ? new Set<number>() : globalClaims;
    const counts = colourCounts(itemImgs(p, it));
    let ramps: Hex[][], names: string[];
    if (it.regions === 'shirt-shorts') { // B15: garment greys by region bit (lib/dress/regions.ts), the rest as usual (Skin)
      const by = (pick: (c: number) => boolean) => [...counts.keys()].filter((c) => pick(c) && !claimed.has(c)).sort((x, y) => lab(x)[0] - lab(y)[0]).map(toHex);
      const rest = new Map([...counts].filter(([c]) => !isGarment(c)));
      const garments = ([['Shirt', by((c) => isGarment(c) && !isShorts(c))], ['Shorts', by((c) => isGarment(c) && isShorts(c))]] as [string, Hex[]][]).filter(([, r]) => r.length);
      const others = k[it.id] ? deriveRamps(rest, k[it.id], claimed) : autoRamps(rest, claimed);
      ramps = [...garments.map(([, r]) => r), ...others];
      names = [...garments.map(([n]) => n), ...materialNames(it, others)];
    } else {
      ramps = k[it.id] ? deriveRamps(counts, k[it.id], claimed) : autoRamps(counts, claimed);
      names = materialNames(it, ramps);
    }
    it.materials = ramps.map((ramp, i) => {
      ramp.forEach((h) => claimed.add(fromHex(h)));
      const id = `${it.id}_${i + 1}`;
      m.materials.push({ id, label: names[i], ramp, variants: {}, owner: it.id });
      return id;
    });
  }
}

/** Selected variant of a material, following linkTo (cycles stop). */
export function variantOf(m: Manifest, variants: Preset['variants'], id: string, seen = new Set<string>()): string | undefined {
  const mat = m.materials.find((x) => x.id === id);
  if (!mat || seen.has(id)) return undefined;
  seen.add(id);
  return mat.linkTo ? variantOf(m, variants, mat.linkTo, seen) : variants[id] ?? mat.defaultVariant;
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
export function recolour(p: Project, variants: Preset['variants']): Project {
  const m = p.manifest;
  let images: Map<string, Img> | null = null;
  const layerImages = new Map<Layer, Map<string, Img>>();
  for (const it of m.items) {
    const mats = it.materials.flatMap((id) => m.materials.find((x) => x.id === id && (x.owner === it.id || x.owner === it.variantOf)) ?? []);
    const ids = new Map<number, number>(), table: number[] = [];
    for (const mat of mats) {
      const name = variantOf(m, variants, mat.id), r = name ? variantRampOf(mat, name) : undefined;
      mat.ramp.forEach((h, i) => { ids.set(fromHex(h), table.length); table.push(r ? fromHex(r[i]) : -1); });
    }
    if (!table.some((c) => c >= 0)) continue;
    images ??= new Map(p.images);
    const sig = mats.map((x) => x.ramp.join()).join('|'), t = Int32Array.from(table);
    for (const l of it.layers) {
      const local = new Map<string, Img>();
      for (const d of Object.values(l.cells ?? {}))
        for (const h of Object.values(d ?? {}).flat()) {
          const im = h && p.images.get(h);
          if (!im) continue;
          let c = cache.get(im);
          if (!c || c.sig !== sig) cache.set(im, (c = { sig, idx: indexImg(im, ids) }));
          const rendered = applyIndex(im, c.idx, t);
          local.set(h!, rendered);
          // Preserve the traditional map for consumers inspecting a single item's images; composition uses owner-local refs.
          images.set(h!, rendered);
        }
      layerImages.set(l, local);
    }
  }
  // Every layer, including unmodified layers, gets an explicit raw override when any item is recoloured. Otherwise an
  // uncoloured copy sharing a hash with a coloured one would accidentally read that copy's palette from `images`.
  if (images) for (const it of m.items) for (const l of it.layers) if (!layerImages.has(l)) {
    const local = new Map<string, Img>();
    for (const dirs of Object.values(l.cells ?? {})) for (const cells of Object.values(dirs ?? {})) for (const h of cells ?? []) {
      const im = h && p.images.get(h); if (h && im) local.set(h, im);
    }
    layerImages.set(l, local);
  }
  return images ? { manifest: m, images, layerImages } : p;
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

/** The item has pixels in (anim, dir); a mirrored direction without its own cells follows its source. */
export function hasCells(m: Manifest, it: Item | undefined, anim: string, dir: DirectionName): boolean {
  const src = m.rig.directions.find((d) => d.id === dir)?.mirrorOf;
  return !!it?.layers.some((l) => (l.cells?.[anim]?.[dir] ?? (src ? l.cells?.[anim]?.[src] : undefined))?.some(Boolean));
}

/** "anim/dir" pairs where the base has cells but the item has none (mirrored directions follow their source). */
export function coverageGaps(m: Manifest, it: Item): string[] {
  const base = m.items.find((i) => i.id === m.rig.baseItem);
  return m.rig.animations.flatMap((a) =>
    m.rig.directions.filter((d) => !d.mirrorOf && hasCells(m, base, a.id, d.id) && !hasCells(m, it, a.id, d.id)).map((d) => `${a.id}/${d.id}`));
}

/** Directions a move has: the base body has frames there (B10: the demo's cross punch is south only). */
export const moveDirs = (m: Manifest, anim: string): DirectionName[] =>
  m.rig.directions.filter((d) => hasCells(m, m.items.find((i) => i.id === m.rig.baseItem), anim, d.id)).map((d) => d.id);

/** Worn, visible items with no frames in a view the move has: they would silently vanish there. */
export function missingAt(m: Manifest, worn: Preset['items'], anim: string, dir: DirectionName): Item[] {
  const on = m.items.filter((it) => it.id !== m.rig.baseItem && worn[it.slot] === it.id);
  const hidden = new Set(on.flatMap((it) => it.hides ?? m.slots.find((s) => s.id === it.slot)?.hides ?? []));
  return moveDirs(m, anim).includes(dir) ? on.filter((it) => !hidden.has(it.slot) && !hasCells(m, it, anim, dir)) : [];
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
  console.assert(moveDirs(m, 'walk').join() === 'south,east,west' && moveDirs(m, 'run').length === 0, `moveDirs ${moveDirs(m, 'walk')}`);
  console.assert(missingAt(m, { back: 'cape' }, 'walk', 'west')[0] === cape && missingAt(m, { back: 'cape' }, 'walk', 'south').length === 0, 'missingAt follows mirrors');
  const red = ['#4a0d12', '#7d1820', '#b02832'] as Hex[], grey = ['#2b2f36', '#4d535d', '#7a828e'] as Hex[];
  console.assert(materialNames({ slot: 'head', name: 'Iron helmet', prompt: 'iron knight helmet with a red plume' }, [grey, red]).join() === 'Metal,Feather', `names ${materialNames({ slot: 'head', name: 'Iron helmet', prompt: 'iron knight helmet with a red plume' }, [grey, red])}`);
  console.assert(materialNames({ slot: 'feet', name: 'Boots', prompt: 'tall boots' }, [red, grey]).join() === 'Leather,Detail' && materialNames({ slot: 'body', name: 'Base', prompt: '' }, [red, grey]).join() === 'Skin,Clothes', 'slot + base names');
  console.assert(materialNames({ slot: 'back', name: 'Cape', prompt: 'cape' }, [red, red, red]).join() === 'Cloth,Detail,Detail 2', 'no duplicate words');
  console.assert(materialNames({ slot: 'torso_inner', name: 'Vest', prompt: 'leather armor vest' }, [red, ['#101012', '#1c1c20'] as Hex[]]).join() === 'Leather,Outline', 'dark ramp = outline');
  // B15: a region-split base -> Shirt (even-blue garment greys), Shorts (odd), Skin (the rest)
  const rb = { manifest: { rig: { baseItem: 'b' }, materials: [], items: [{ id: 'b', name: 'Base', slot: 'body', prompt: '', regions: 'shirt-shorts', materials: [], layers: L('sha256:r') }] } as unknown as Manifest,
    images: new Map([['sha256:r', px(0x9eacb0, 0x6d7c86, 0x9eacb1, 0x6d7c87, 0xc96e4e, 0xe4976e, 0x000000)]]) } as Project;
  deriveMaterials(rb);
  console.assert(rb.manifest.materials.map((x) => `${x.label}:${x.ramp.join('+')}`).join() === 'Shirt:#6d7c86+#9eacb0,Shorts:#6d7c87+#9eacb1,Skin:#c96e4e+#e4976e', `region materials ${rb.manifest.materials.map((x) => x.label + ':' + x.ramp.join('+'))}`);
  console.assert(edges({ w: 3, h: 3, data: new Uint8ClampedArray(36).fill(255) }).join() === '0,1,2,3,5,6,7,8', 'edges');
}
