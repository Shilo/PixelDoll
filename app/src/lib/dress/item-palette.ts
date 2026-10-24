// Explicit, local color matching for an existing item. Source ramps and variants never change.
import type { Img } from '../image/png.ts';
import type { Item, Material } from '../store/manifest.ts';
import { fromHex, lab, OUTLINE_C, OUTLINE_L } from './palette.ts';

export const ITEM_PALETTE_POLICY = 'neutral-owned-v1' as const;
const neutral = (c: number) => {
  const [L, a, b] = lab(c), r = c >> 16, g = (c >> 8) & 255, blue = c & 255;
  // A small warm allowance includes off-white steel. Muted green/brown guards are excluded.
  return L >= OUTLINE_L && Math.hypot(a, b) <= OUTLINE_C && blue >= r - 4 && blue >= g - 4;
};
export function itemPaletteMatcher(item: Pick<Item, 'id' | 'materials'>, materials: Material[]) {
  const candidates = materials.filter(m => m.owner === item.id && item.materials.includes(m.id) && m.ramp.length && m.ramp.every(h => neutral(fromHex(h))));
  if (candidates.length !== 1) throw new Error('Color matching needs exactly one neutral material owned by this item. Existing colors were kept.');
  const material = candidates[0], ramp = material.ramp.map(fromHex), claimed = new Set(materials.flatMap(m => m.ramp.map(fromHex)));
  const cache = new Map<number, number | null | undefined>();
  const match = (c: number): number | null | undefined => {
    // undefined = already owned or outside the supported color family; null = eligible but unsafe/ambiguous.
    if (cache.has(c)) return cache.get(c);
    let result: number | null | undefined;
    if (!claimed.has(c) && neutral(c)) {
      const channels = (v: number) => [v >> 16, (v >> 8) & 255, v & 255], src = channels(c);
      const sorted = ramp.map(v => ({ v, ds: channels(v).map((x, i) => Math.abs(x - src[i])) }))
        .map(v => ({ ...v, d: v.ds.reduce((s, x) => s + x * x, 0) })).sort((a, b) => a.d - b.d);
      result = Math.max(...sorted[0].ds) <= 24 && (sorted.length === 1 || sorted[0].d !== sorted[1].d) ? sorted[0].v : null;
    }
    cache.set(c, result); return result;
  };
  return { materialId: material.id, apply(im: Img) {
    const image: Img = { ...im, data: im.data.slice() }; let changedPixels = 0, unmatchedPixels = 0;
    for (let i = 0; i < image.data.length; i += 4) if (image.data[i + 3]) {
      const c = (image.data[i] << 16) | (image.data[i + 1] << 8) | image.data[i + 2], next = match(c);
      if (next === null) unmatchedPixels++;
      else if (next !== undefined) { image.data[i] = next >> 16; image.data[i + 1] = (next >> 8) & 255; image.data[i + 2] = next & 255; changedPixels++; }
    }
    return { image, changedPixels, unmatchedPixels };
  } };
}

// History can outlive a removed move/material; validate its bounded shape rather than live references.
export function validPaletteRepairs(value: unknown): boolean {
  const record = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v);
  const safeId = (v: unknown) => typeof v === 'string' && v.length <= 200 && /^[a-z0-9][a-z0-9_-]*$/.test(v);
  const hash = (v: unknown) => typeof v === 'string' && /^sha256:[0-9a-f]{64}$/.test(v);
  if (!Array.isArray(value) || value.length > 1000) return false;
  return value.every((repair: unknown) => {
    if (!record(repair) || repair.version !== 'neutral-owned-v1' || !safeId(repair.materialId) || !safeId(repair.anim)
      || !['south', 'south-east', 'east', 'north-east', 'north', 'north-west', 'west', 'south-west'].includes(repair.dir as string)
      || !Array.isArray(repair.frames) || !repair.frames.length || repair.frames.length > 1000) return false;
    const cells = new Set<number>();
    return repair.frames.every((frame: unknown) => {
      if (!record(frame) || !Number.isSafeInteger(frame.cell) || (frame.cell as number) < 0 || cells.has(frame.cell as number)
        || !Array.isArray(frame.layers) || !frame.layers.length || frame.layers.length > 3
        || !Number.isInteger(frame.changedPixels) || (frame.changedPixels as number) < 1 || (frame.changedPixels as number) > frame.layers.length * 256 * 256) return false;
      cells.add(frame.cell as number);
      const layers = new Set<string>();
      return frame.layers.every((layer: unknown) => {
        if (!record(layer) || !['main', 'fg', 'bg'].includes(layer.id as string) || layers.has(layer.id as string)
          || !hash(layer.before) || !hash(layer.after) || layer.before === layer.after) return false;
        layers.add(layer.id as string);
        return true;
      });
    });
  });
}
