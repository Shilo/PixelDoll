// IndexedDB project records (B2 format, SHARED_NOTES): projects/rig-<baseHash 12 hex> = { id, savedAt, manifest, skeletons, rigQa }.
// Cell PNGs live in `blobs` keyed by the RGBA sha256 hex (without "sha256:"). M3 adds accepted items to the same record.
import { decodePng, type Img } from '../image/png.ts';
import { encodePngBytes } from '../image/pngraw.ts';
import type { Skeleton } from '../rig/skeleton.ts';
import * as db from './db.ts';
import type { Item, Manifest, Project, Sha256, Slot } from './manifest.ts';

export interface StoredProject {
  id: string;
  savedAt: string;
  manifest: Manifest;
  skeletons?: Record<string, Skeleton>; // cell key -> keypoints (mirrored cells flipped)
  rigQa?: unknown;
}

export const listProjects = async () =>
  (await db.all<StoredProject>('projects')).filter((p) => p?.manifest?.format === 'pixeldoll/1' && p.id?.startsWith('rig-'));

/** Decode every cell referenced by the manifest's layers into Project.images. */
export async function loadProject(id: string): Promise<{ rec: StoredProject; project: Project }> {
  const rec = await db.get<StoredProject>('projects', id);
  if (!rec) throw new Error(`project ${id} not found`);
  const images = new Map<string, Img>();
  for (const it of rec.manifest.items)
    for (const l of it.layers)
      for (const dirs of Object.values(l.cells ?? {}))
        for (const cells of Object.values(dirs ?? {}))
          for (const h of cells ?? []) {
            if (!h || images.has(h)) continue;
            const b = await db.getBlob(h.slice(7));
            if (!b) throw new Error(`${it.id}: cell blob ${h.slice(0, 19)} missing`);
            images.set(h, await decodePng(b));
          }
  return { rec, project: { manifest: rec.manifest, images } };
}

/**
 * Add or replace an item (same id) in the project record, store its cell PNGs, and insert its slot (ladder order) if missing.
 * Re-reads the record right before writing so concurrent edits by other pages (M4 presets) survive.
 */
export async function saveItem(id: string, item: Item, images: Map<Sha256, Img>, ladder: Slot[]): Promise<void> {
  for (const [h, im] of images) if (!(await db.getBlob(h.slice(7)))) await db.put('blobs', h.slice(7), new Blob([(await encodePngBytes(im)) as Uint8Array<ArrayBuffer>], { type: 'image/png' }));
  const rec = await db.get<StoredProject>('projects', id);
  if (!rec) throw new Error(`project ${id} not found`);
  const m = rec.manifest;
  m.items = [...m.items.filter((i) => i.id !== item.id), item];
  if (!m.slots.some((s) => s.id === item.slot)) {
    const order = (s: string) => ladder.findIndex((x) => x.id === s);
    m.slots = [...m.slots, ladder.find((s) => s.id === item.slot)!].sort((a, b) => order(a.id) - order(b.id));
  }
  rec.savedAt = new Date().toISOString();
  await db.put('projects', id, rec);
}

export async function deleteItem(id: string, itemId: string): Promise<void> {
  const rec = await db.get<StoredProject>('projects', id);
  if (!rec) return;
  rec.manifest.items = rec.manifest.items.filter((i) => i.id !== itemId || i.slot === 'body');
  await db.put('projects', id, rec);
}
