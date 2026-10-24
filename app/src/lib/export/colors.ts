// Bake the palettes actually used by outfits into ordinary equipment layers. Engine runtimes need no color shader.
import { recolor, variantOf, variantRampOf } from '../dress/dress.ts';
import { sha256, stableStringify } from '../image/hash.ts';
import { cellHash } from '../rig/rig.ts';
import type { Project, Slot } from '../store/manifest.ts';

export async function withColorVariants(source: Project): Promise<Project> {
  const m = structuredClone(source.manifest), images = new Map(source.images);
  const originals = [...m.items], used = new Set(m.items.map((it) => it.id)), copies = new Map<string, string>();
  const paletteOf = (it: (typeof originals)[number], preset: (typeof m.presets)[number]) => it.materials.flatMap((id) => {
    const mat = m.materials.find((x) => x.id === id), name = variantOf(m, preset.variants, id);
    const ramp = mat && name ? variantRampOf(mat, name) : undefined;
    return mat && ramp && ramp.some((c, i) => c !== mat.ramp[i]) ? [[id, ramp]] : [];
  });
  const base = originals.find((it) => it.id === m.rig.baseItem)!;
  const overlayBody = m.presets.some((preset) => paletteOf(base, preset).length) || m.slots.some((slot) => slot.id !== 'body' && slot.clips?.includes('body'));
  const bodyCopies = new Set<string>();
  let bodySlot: string | undefined;
  for (const preset of m.presets) {
    preset.items.body = m.rig.baseItem;
    for (const it of originals) {
      if (it.id !== m.rig.baseItem && preset.items[it.slot] !== it.id) continue;
      if (it.baseHash !== m.rig.baseHash) continue;
      const palette = paletteOf(it, preset);
      if (!palette.length && !(overlayBody && it.id === m.rig.baseItem)) continue;
      const signature = stableStringify([it.id, palette]);
      let id = copies.get(signature);
      if (!id) {
        // Published export format: the -colour- copy IDs, "(coloured)" names and body_colour slot keep their spelling.
        const stem = `${it.id}-colour-${(await sha256(signature)).slice(0, 12)}`;
        id = stem;
        for (let i = 2; used.has(id); i++) id = `${stem}-${i}`;
        used.add(id); copies.set(signature, id);
        const copy = structuredClone(it);
        copy.id = id; copy.name = `${it.name} (coloured)`; copy.materials = [];
        delete copy.qa;
        if (it.id === m.rig.baseItem) {
          // Keep the canonical body's invisible animation clock. A normal synced layer draws its recolored pixels.
          if (!bodySlot) {
            bodySlot = 'body_colour';
            for (let i = 2; m.slots.some((s) => s.id === bodySlot); i++) bodySlot = `body_colour_${i}`;
            const body = m.slots.find((s) => s.id === 'body')!;
            const slot: Slot = { ...structuredClone(body), id: bodySlot, class: 'worn', required: false };
            m.slots.splice(m.slots.indexOf(body) + 1, 0, slot);
          }
          copy.slot = bodySlot;
          bodyCopies.add(id);
          const hides = it.hides ?? m.slots.find((s) => s.id === 'body')?.hides ?? [];
          copy.hides = [...new Set([...hides, ...(hides.includes('body') ? [bodySlot] : []), 'body'])];
        }
        const colored = recolor({ manifest: { ...m, items: [it] }, images: source.images }, preset.variants);
        for (const layer of copy.layers) for (const dirs of Object.values(layer.cells ?? {}))
          for (const cells of Object.values(dirs)) if (cells) for (let c = 0; c < cells.length; c++) {
            const image = cells[c] && colored.images.get(cells[c]!);
            if (!image) continue;
            const hash = await cellHash(image); images.set(hash, image); cells[c] = hash;
          }
        m.items.push(copy);
      }
      const copy = m.items.find((x) => x.id === id)!;
      preset.items[copy.slot] = id;
    }
    // The selected palettes now live in pixels; project.json retains the editable source selections.
    preset.variants = {};
  }
  if (bodySlot) {
    // Existing gear that hides/clips the body must target its visible outfit copy as well.
    const hide = (ids: string[] | undefined) => ids?.includes('body') ? [...new Set([...ids, bodySlot!])] : ids;
    for (const slot of m.slots) {
      if (slot.hides) slot.hides = hide(slot.hides);
      if (slot.clips) slot.clips = slot.clips.flatMap((id) => id === 'body' ? (slot.id === 'body' ? [] : [bodySlot!]) : [id]);
    }
    for (const item of m.items) if (!bodyCopies.has(item.id) && item.hides) item.hides = hide(item.hides);
  }
  return { manifest: m, images };
}
