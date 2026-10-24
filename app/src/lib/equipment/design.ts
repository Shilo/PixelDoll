import { cellImg, layerFrame, over } from '../compose/compose.ts';
import { variantOf, variantRampOf } from '../dress/dress.ts';
import { fromHex, toHex, colorCounts, autoRamps } from '../dress/palette.ts';
import { chromaLayer, pickKey, toChroma, type Key } from '../image/chroma.ts';
import { makeImg, type Img } from '../image/png.ts';
import { sha256, stableStringify } from '../image/hash.ts';
import { flipH } from '../rig/mirror.ts';
import type { DirectionName, Item, Manifest, Project, Sha256, Preset } from '../store/manifest.ts';
import { CURRENT_FORMAT } from '../store/manifest.ts';
import type { EquipmentDesign } from './types.ts';
import { designItem } from './types.ts';

/** Explicit image references only: request hashes and baseHash are not image blob IDs. */
export function imageHashes(m: Manifest): Sha256[] {
  const refs = new Set<Sha256>();
  for (const rest of Object.values(m.rig.rest ?? {})) if (rest) refs.add(rest.image);
  for (const it of m.items) {
    for (const h of Object.values(it.dressed ?? {})) if (h) refs.add(h);
    for (const l of it.layers) for (const ds of Object.values(l.cells ?? {})) for (const cs of Object.values(ds ?? {})) for (const h of cs ?? []) if (h) refs.add(h);
    for (const h of it.design?.snapshot.imageHashes ?? []) refs.add(h);
  }
  return [...refs].sort();
}
export const designRevision = async (source: Manifest, variants: Preset['variants'], hashes: readonly Sha256[]): Promise<Sha256> =>
  `sha256:${await sha256(stableStringify({ source, variants, imageHashes: [...hashes].sort() }))}`;
export const restStamp = (m: Manifest): string => stableStringify({ rest: m.rig.rest, cell: m.rig.cell, pivot: m.rig.pivot, view: m.rig.view, template: m.rig.template });

export async function createDesign(project: Project, itemId: string, variants: Preset['variants'] = {}, name?: string): Promise<EquipmentDesign> {
  const original = project.manifest.items.find((it) => it.id === itemId);
  if (!original || original.slot === 'body' || original.status !== 'accepted' || original.variantOf) throw new Error('Save an accepted equipment item, not a body or baked export variant.');
  if (original.baseHash !== project.manifest.rig.baseHash) throw new Error('This equipment belongs to an older body. Fit it to the current character before saving.');
  const m = structuredClone(project.manifest), base = m.items.find((it) => it.id === m.rig.baseItem)!;
  const item = m.items.find((it) => it.id === itemId)!;
  if (original.design && original.design.dressedStamp !== restStamp(m)) { delete item.dressed; delete item.route; }
  delete base.design; delete item.design;
  const selected: Preset['variants'] = {};
  m.format = CURRENT_FORMAT;
  m.name = (name?.trim() || original.name).slice(0, 60);
  m.items = [base, item];
  m.slots = m.slots.filter((s) => s.id === 'body' || s.id === item.slot);
  m.materials = m.materials.filter((mat) => mat.owner === base.id || mat.owner === item.id);
  for (const mat of m.materials) {
    const sourceMat = project.manifest.materials.find((x) => x.id === mat.id)!;
    const variant = mat.owner === item.id ? variantOf(project.manifest, variants, mat.id) : undefined;
    if (variant) {
      const ramp = variantRampOf(sourceMat, variant);
      if (ramp) { mat.variants[variant] = ramp; selected[mat.id] = variant; }
    }
    // A design owns resolved appearance; links to other equipment/skin are target-local, never portable pointers.
    delete mat.linkTo;
  }
  // Legacy v1 derivation sometimes omitted RGBs claimed by the body. Make those item colors independently owned now.
  const claimed = new Set(m.materials.filter((x) => x.owner === item.id).flatMap((x) => x.ramp.map(fromHex)));
  const counts = colorCounts(item.layers.flatMap((l) => Object.values(l.cells ?? {}).flatMap((ds) => Object.values(ds ?? {}).flatMap((cs) => cs ?? []))).flatMap((h) => h && project.images.get(h) || []));
  let detail = 1;
  for (const ramp of autoRamps(counts, claimed)) {
    while (m.materials.some((mat) => mat.id === `${item.id}_saved_detail_${detail}`)) detail++;
    const id = `${item.id}_saved_detail_${detail++}`;
    m.materials.push({ id, owner: item.id, label: 'Detail', ramp, variants: {} }); item.materials.push(id);
  }
  m.presets = [{ id: 'design', name: m.name, items: { body: base.id, [item.slot]: item.id }, variants: selected }];
  delete m.export;
  const refs = imageHashes(m), images = new Map<string, Img>();
  for (const h of refs) {
    const im = project.images.get(h);
    if (!im) throw new Error(`The item is missing a reference image (${h.slice(7, 19)}). Reload the character before saving.`);
    images.set(h, im);
  }
  const warnings = item.dressed ? [] : ['The original dressed references are unavailable. Visible layer references may hide parts of the design.'];
  const revision = await designRevision(m, selected, refs);
  return { kind: 'equipment-design', format: 'pixeldoll-design/1', id: `equipment-design:${crypto.randomUUID()}`, revision, name: m.name, slot: item.slot, itemId, createdAt: new Date().toISOString(), source: m, imageHashes: refs, variants: selected, warnings, images };
}

function applyColorway(im: Img, design: EquipmentDesign): Img {
  const pixels = new Uint8ClampedArray(im.data), table = new Map<number, number>();
  for (const mat of design.source.materials.filter((m) => m.owner === design.itemId)) {
    const variant = design.variants[mat.id], ramp = variant && variantRampOf(mat, variant);
    if (ramp) mat.ramp.forEach((h, i) => table.set(fromHex(h), fromHex(ramp[i])));
  }
  for (let i = 0; i < pixels.length; i += 4) if (pixels[i + 3]) {
    const next = table.get((pixels[i] << 16) | (pixels[i + 1] << 8) | pixels[i + 2]);
    if (next != null) { pixels[i] = next >> 16; pixels[i + 1] = (next >> 8) & 255; pixels[i + 2] = next & 255; }
  }
  return { ...im, data: pixels };
}

export interface DesignReference { direction: DirectionName; image: Img; body: Img; key: Key; complete: boolean }
/** Pure source references for qualification and fitting. Never substitutes target joints onto source artwork. */
export function designRestReferences(design: EquipmentDesign, project: Project, key: Key = pickKey(designItem(design).prompt)): DesignReference[] {
  const m = project.manifest, item = designItem(design), body = m.items.find((it) => it.id === m.rig.baseItem)!;
  const refs: DesignReference[] = [];
  for (const d of m.rig.directions) {
    const from = d.mirrorOf ?? d.id;
    const rest = m.rig.rest?.[from], dressed = item.dressed?.[from];
    let base = rest && project.images.get(rest.image), layer: Img | undefined, frame = layerFrame(m.rig, item.layers[0]);
    if (base && dressed && item.key) {
      const saved = project.images.get(dressed);
      if (saved) {
        const padded = makeImg(frame.w, frame.h);
        over(padded, base, frame.x - m.rig.pivot.x, frame.y - m.rig.pivot.y);
        layer = chromaLayer(saved, item.key, padded).layer;
        base = padded;
      }
    }
    if (!layer) {
      const a = m.rig.animations.find((a) => item.layers.some((l) => l.cells?.[a.id]?.[from]?.some(Boolean)));
      if (!a) continue;
      const b = cellImg(project, body.layers[0], a.id, from, 0); if (!b) continue;
      base = makeImg(frame.w, frame.h); over(base, b, frame.x - m.rig.pivot.x, frame.y - m.rig.pivot.y);
      layer = makeImg(frame.w, frame.h);
      for (const l of item.layers) {
        const im = cellImg(project, l, a.id, from, 0), f = layerFrame(m.rig, l);
        if (im) over(layer, im, frame.x - f.x, frame.y - f.y);
      }
    }
    if (!base || !layer) continue;
    if (d.mirrorOf) { base = flipH(base); layer = flipH(layer); }
    const image = toChroma(base, key); over(image, applyColorway(layer, design));
    refs.push({ direction: d.id, image, body: base, key, complete: !!dressed });
  }
  return refs;
}

export const designColors = (design: EquipmentDesign) => design.source.materials.filter((m) => m.owner === design.itemId).flatMap((m) => (design.variants[m.id] && variantRampOf(m, design.variants[m.id])) || m.ramp).map((h) => toHex(fromHex(h)));
