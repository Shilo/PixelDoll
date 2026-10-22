import * as db from '../store/db.ts';
import { cellHash, type DirectionName, type Sha256 } from '../rig/rig.ts';
import { cellImg } from '../compose/compose.ts';
import { stableStringify } from '../image/hash.ts';
import { CURRENT_FORMAT, type Item, type Manifest, type Project, type Preset } from '../store/manifest.ts';
import type { StoredProject } from '../store/project.ts';
import { SLOTS } from '../items/items.ts';
import { validate } from '../export/generic.ts';
import { mergeQa } from '../items/qa-summary.ts';
import { imageHashes } from './design.ts';
import { assessDesign, targetAudit } from './compatibility.ts';
import { encodedImages, loadImages, snapshotDesign } from './store.ts';
import { designItem, type AcceptOptions, type EquipmentDesign, type FitCandidate } from './types.ts';

export const targetStamp = (m: Manifest, slot?: string): string => {
  const slots = slot ? [m.slots.find((s) => s.id === slot) ?? SLOTS.find((s) => s.id === slot)] : m.slots;
  const { animations, ...rig } = m.rig;
  return stableStringify({ rig: { ...rig, animations: animations.map(({ frames: _frames, loop: _loop, ...a }) => a) }, body: m.items.find((it) => it.id === m.rig.baseItem)?.layers, slots: slots.map((s) => s && (({ id, class: kind, anchor, bgZ, clips, hides }) => ({ id, kind, anchor, bgZ, clips, hides }))(s)) });
};
export const extensionStamp = (m: Manifest, id: string): string => {
  const it = m.items.find(i => i.id === id);
  return stableStringify(it && { layers: it.layers, dressed: it.dressed, key: it.key, route: it.route, baseHash: it.baseHash, provenance: it.provenance, materials: m.materials.filter(mat => mat.owner === id).map(({ id, ramp }) => ({ id, ramp })) });
};
export async function prepareCopy(design: EquipmentDesign, target: Project): Promise<FitCandidate> {
  const assessment = await assessDesign(design, target);
  if (!assessment.canCopy) throw new Error(assessment.reasons[0] ?? 'This design needs fitting before it can be copied.');
  const source: Project = { manifest: design.source, images: await loadImages(design.imageHashes, design.images) };
  const item = structuredClone(designItem(design)), m = structuredClone(target.manifest), images = new Map([...target.images, ...source.images]);
  const oldId = item.id, id = `gear-${crypto.randomUUID()}`, audit = await targetAudit(target), stamp = targetStamp(m, item.slot);
  item.id = id; item.name = design.name; item.baseHash = m.rig.baseHash;
  item.coverage = assessment.matches.map(match => match.target as NonNullable<Item['coverage']>[number]);
  const materials = design.source.materials.filter((mat) => mat.owner === oldId).map((mat, i) => ({ ...structuredClone(mat), id: `${id}_${i + 1}`, owner: id, defaultVariant: design.variants[mat.id] ?? mat.defaultVariant }));
  const roles = Object.fromEntries(design.source.materials.filter((mat) => mat.owner === oldId).map((mat, i) => [mat.id, materials[i].id]));
  item.materials = materials.map((mat) => mat.id);
  const variants = Object.fromEntries(Object.entries(design.variants).flatMap(([mat, variant]) => roles[mat] ? [[roles[mat], variant]] : []));
  for (const mat of materials) delete mat.linkTo;
  item.design = { designId: design.id, revision: design.revision, snapshot: snapshotDesign(design), roleMaterials: roles, targetAudit: audit, targetStamp: stamp };
  const layerCells = item.layers.map(() => ({} as NonNullable<Item['layers'][number]['cells']>));
  for (const match of assessment.matches) {
    const [ta, td, ti] = match.target.split('/') as [string, DirectionName, string], [sa, sd, si] = match.source.split('/') as [string, DirectionName, string];
    for (const [i, layer] of designItem(design).layers.entries()) {
      const im = cellImg(source, layer, sa, sd, +si), h = im ? await cellHash(im) : null;
      if (h && im) images.set(h, im);
      const n = m.rig.animations.find((a) => a.id === ta)!.cells;
      (((layerCells[i][ta] ??= {})[td] ??= Array(n).fill(null)) as (Sha256 | null)[])[+ti] = h;
    }
  }
  item.layers.forEach((layer, i) => { layer.cells = layerCells[i]; delete layer.sheets; });
  // Frozen raster copying does not prove a source standing reference fits future target moves.
  if (!assessment.canExtend) { delete item.dressed; delete item.route; }
  if (item.qa) {
    item.qa.status = 'warn'; item.qa.cells = {}; delete item.qa.clips;
    const { cells: _cells, clips: _clips, legacy: _legacy, rerolls: _rerolls, ...summary } = item.qa;
    item.qa.legacy = { clips: [...new Set(assessment.matches.map((m) => m.target.split('/').slice(0, 2).join('/')))], summary: { ...summary, status: 'warn' } };
  }
  m.format = CURRENT_FORMAT;
  m.items.push(item); m.materials.push(...materials);
  if (!m.slots.some((s) => s.id === item.slot)) m.slots.push(structuredClone(SLOTS.find((s) => s.id === item.slot)!));
  m.presets = [{ id: 'fit-preview', name: 'Preview', items: { ...m.presets[0]?.items, body: m.rig.baseItem, [item.slot]: id }, variants: { ...m.presets[0]?.variants, ...variants } }, ...m.presets];
  return { project: { manifest: m, images }, itemId: id, designId: design.id, targetAudit: audit, targetStamp: stamp, materials, variants, assessment };
}

/** Pure transaction mutation shared by free-copy and paid-fit acceptance. */
export function publishCandidate(rec: StoredProject | undefined, candidate: FitCandidate, options: AcceptOptions): StoredProject {
  const item = candidate.project.manifest.items.find((it) => it.id === candidate.itemId)!;
  if (!rec || targetStamp(rec.manifest, item?.slot) !== candidate.targetStamp) throw new Error('The character changed. Review the fit again before keeping it.');
  if (!item?.design) throw new Error('The fitted candidate is incomplete.');
  if (candidate.extensionItemId) {
    const existing = rec.manifest.items.find(it => it.id === candidate.extensionItemId);
    if (!existing || extensionStamp(rec.manifest, existing.id) !== candidate.extensionStamp) throw new Error('This equipment changed. Review its missing-frame fit again.');
    for (const [i, layer] of item.layers.entries()) {
      const original = existing.layers[i];
      if (!original || original.id !== layer.id || original.role !== layer.role) throw new Error('The fitted layer layout changed.');
      original.cells = { ...original.cells, ...structuredClone(layer.cells) };
    }
    const history = item.design.snapshot.source.items.find(it => it.id === item.design!.snapshot.itemId)!.provenance.length;
    const produced = structuredClone(item.provenance.slice(history));
    const next = item.qa && structuredClone(item.qa);
    if (next) for (const q of Object.values(next.cells)) if (q.provenance !== undefined) q.provenance = q.provenance - history + existing.provenance.length;
    if (next) existing.qa = mergeQa(existing, next, next.cells);
    existing.provenance.push(...produced);
    existing.coverage = [...new Set([...(existing.coverage ?? []), ...(item.coverage ?? [])])];
    rec.savedAt = new Date().toISOString();
    return rec;
  }
  if (!rec.manifest.items.some((it) => it.id === item.id)) {
    rec.manifest.format = CURRENT_FORMAT;
    rec.manifest.items.push(structuredClone(item));
    rec.manifest.materials.push(...structuredClone(candidate.materials));
    if (!rec.manifest.slots.some((s) => s.id === item.slot)) rec.manifest.slots.push(structuredClone(candidate.project.manifest.slots.find((s) => s.id === item.slot)!));
  }
  if (options.wear) {
    const saved = rec as StoredProject & { dress?: { current?: Pick<Preset, 'items' | 'variants'> } };
    const current = saved.dress?.current ?? structuredClone(rec.manifest.presets[0] ?? { items: {}, variants: {} });
    saved.dress = { ...saved.dress, current: { items: { ...current.items, [item.slot]: item.id }, variants: { ...current.variants, ...candidate.variants } } };
  }
  rec.savedAt = new Date().toISOString();
  return rec;
}
export async function acceptCopy(targetId: string, candidate: FitCandidate, options: AcceptOptions): Promise<string> {
  if (!targetId.startsWith('rig-')) throw new Error('Make an editable copy of the demo before adding saved designs.');
  const errors = validate(candidate.project);
  if (errors.length) throw new Error(`The candidate failed validation: ${errors.slice(0, 3).join('; ')}`);
  const images = await loadImages(imageHashes(candidate.project.manifest), candidate.project.images);
  await db.updateCharacter<StoredProject>(targetId, await encodedImages(images), (rec) => publishCandidate(rec, candidate, options));
  return candidate.itemId;
}
