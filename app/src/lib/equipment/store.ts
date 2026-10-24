import * as db from '../store/db.ts';
import { decodePng, pngSize, type Img } from '../image/png.ts';
import { encodePngBytes } from '../image/pngraw.ts';
import { cellHash } from '../rig/rig.ts';
import { validate } from '../export/generic.ts';
import { recolor } from '../dress/dress.ts';
import { supportedFormat, type Project, type Sha256 } from '../store/manifest.ts';
import { unzip, zip } from '../store/zip.ts';
import { designRevision, imageHashes } from './design.ts';
import type { EquipmentDesign } from './types.ts';

const hashPattern = /^sha256:[a-f0-9]{64}$/;
export const snapshotDesign = (design: EquipmentDesign): Omit<EquipmentDesign, 'images'> => {
  const { images: _images, ...snapshot } = design;
  return structuredClone(snapshot);
};
export async function encodedImages(images: Map<string, Img>): Promise<Map<string, Blob>> {
  const out = new Map<string, Blob>();
  for (const [hash, im] of images) {
    if (!hashPattern.test(hash) || await cellHash(im) !== hash) throw new Error('An equipment image does not match its content hash.');
    out.set(hash.slice(7), new Blob([(await encodePngBytes(im)) as Uint8Array<ArrayBuffer>], { type: 'image/png' }));
  }
  return out;
}
export async function loadImages(hashes: readonly string[], source?: Map<string, Img>): Promise<Map<string, Img>> {
  const images = new Map<string, Img>();
  for (const h of new Set(hashes)) {
    if (!hashPattern.test(h)) throw new Error('The equipment contains an invalid image reference.');
    const im = source?.get(h);
    if (im) { images.set(h, im); continue; }
    const blob = await db.getBlob(h.slice(7));
    if (!blob) throw new Error(`An equipment image is missing (${h.slice(7, 19)}). Restore its design ZIP.`);
    images.set(h, await decodePng(blob));
  }
  return images;
}
export function assertDesign(design: EquipmentDesign) {
  if (!design || design.kind !== 'equipment-design' || design.format !== 'pixeldoll-design/1' || !design.id?.startsWith('equipment-design:') || !hashPattern.test(design.revision) || !design.name?.trim() || design.name.length > 60 || !supportedFormat(design.source?.format) || !Array.isArray(design.imageHashes) || design.imageHashes.length > 5000) throw new Error('This is not a supported equipment design.');
  if (!Array.isArray(design.source.items) || !Array.isArray(design.source.materials) || !Array.isArray(design.source.presets) || !Array.isArray(design.source.slots) || design.source.items.length !== 2) throw new Error('A design must contain one frozen body and one equipment item.');
  const item = design.source.items.find((it) => it.id === design.itemId);
  if (!item || item.slot === 'body' || item.slot !== design.slot || item.variantOf || item.design || design.source.items.some((it) => it.design)) throw new Error('The design source item is invalid or contains nested design snapshots.');
  const refs = imageHashes(design.source);
  if (refs.length !== new Set(design.imageHashes).size || refs.some((h) => !design.imageHashes.includes(h))) throw new Error('The design image inventory is incomplete.');
}
export const listDesigns = async (): Promise<EquipmentDesign[]> => (await db.all<EquipmentDesign>('projects')).filter((r) => r?.kind === 'equipment-design' && r.id?.startsWith('equipment-design:')).sort((a, b) => b.createdAt.localeCompare(a.createdAt));
export async function loadDesign(id: string): Promise<{ design: EquipmentDesign; project: Project }> {
  const design = await db.get<EquipmentDesign>('projects', id);
  if (!design) throw new Error('This saved design was removed.');
  assertDesign(design);
  return { design, project: { manifest: design.source, images: await loadImages(design.imageHashes, design.images) } };
}
export async function designPreview(design: EquipmentDesign): Promise<Project> {
  assertDesign(design);
  return recolor({ manifest: design.source, images: await loadImages(design.imageHashes, design.images) }, design.variants);
}
export async function saveCreatedDesign(design: EquipmentDesign): Promise<EquipmentDesign> {
  assertDesign(design);
  if (await designRevision(design.source, design.variants, design.imageHashes) !== design.revision) throw new Error('The equipment design does not match its immutable revision.');
  const images = await loadImages(design.imageHashes, design.images), errors = validate({ manifest: design.source, images });
  if (errors.length) throw new Error(`The design is incomplete: ${errors.slice(0, 3).join('; ')}`);
  const same = (await listDesigns()).find((d) => d.revision === design.revision);
  if (same) return same;
  const record = snapshotDesign(design);
  await db.putCharacter(record.id, record, await encodedImages(images));
  db.askPersist();
  return record;
}
export async function removeDesign(id: string): Promise<void> {
  if (!id.startsWith('equipment-design:')) throw new Error('Choose a saved equipment design.');
  await db.del('projects', id); // Target items/drafts pin their own snapshots. Never delete shared blobs directly.
}
export async function exportDesign(design: EquipmentDesign): Promise<Uint8Array> {
  assertDesign(design);
  const images = await loadImages(design.imageHashes, design.images), enc = new TextEncoder();
  return zip([
    { name: 'design.json', data: enc.encode(JSON.stringify(snapshotDesign(design), null, 2)) },
    { name: 'README.txt', data: enc.encode(`${design.name}\nPixelDoll equipment design, not a character. Import from Saved designs. Fitting to another body may require PixelLab generations. This archive contains the source body and item references required for independent reuse.\n`) },
    { name: 'ATTRIBUTION.txt', data: enc.encode('Artwork created or edited with PixelLab (https://pixellab.ai). Generating call provenance is retained in design.json. The app\'s MIT license does not grant a separate artwork license.\n') },
    ...await Promise.all([...images].map(async ([hash, im]) => ({ name: `cells/${hash.slice(7)}.png`, data: await encodePngBytes(im) }))),
  ], { deflate: true });
}
export async function importDesign(bytes: Uint8Array): Promise<EquipmentDesign> {
  const files = await unzip(bytes), entry = files.get('design.json');
  if (!entry || entry.length > 8 * 1024 * 1024) throw new Error('Choose a PixelDoll design ZIP containing design.json. Character ZIPs open through Import character.');
  let design: EquipmentDesign;
  try { design = JSON.parse(new TextDecoder().decode(entry)) as EquipmentDesign; } catch { throw new Error('The design metadata is not valid JSON.'); }
  assertDesign(design);
  const images = new Map<string, Img>();
  let pixels = 0;
  for (const h of design.imageHashes) {
    const png = files.get(`cells/${h.slice(7)}.png`), size = png && pngSize(png);
    if (!png || !size || size.w > 8192 || size.h > 8192 || size.w < 1 || size.h < 1 || (pixels += size.w * size.h) > 64 * 1024 * 1024) throw new Error('The design has missing or oversized images.');
    const im = await decodePng(png);
    if (await cellHash(im) !== h) throw new Error('A design image failed its content hash check.');
    images.set(h, im);
  }
  // An incoming identity never overwrites a local entry. Immutable identical content can deduplicate safely.
  design.id = `equipment-design:${crypto.randomUUID()}`;
  design.createdAt = new Date().toISOString(); design.images = images;
  return saveCreatedDesign(design);
}
