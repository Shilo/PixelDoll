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
  character?: { id: string; looks: string }; // v1.3: managed rest character (motion source) + the base's looks description
  origin?: 'studio' | 'dev'; // T2: who made it; the Studio's character menu lists only 'studio' rigs (dev rigs: M2 pages)
}

/** Records from before `origin`: v1.3 creates (`character`) and demo copies (empty `pivotFrom`) came from the Studio. */
export const originOf = (p: StoredProject): 'studio' | 'dev' =>
  p.origin ?? (p.character || (p.rigQa as { pivotFrom?: string } | undefined)?.pivotFrom === '' ? 'studio' : 'dev');

export const listProjects = async () =>
  (await db.all<StoredProject>('projects')).filter((p) => p?.manifest?.format === 'pixeldoll/1' && p.id?.startsWith('rig-'));

/** Decode every cell referenced by the manifest's layers (and the v1.3 rest views) into Project.images. */
export async function loadProject(id: string): Promise<{ rec: StoredProject; project: Project }> {
  const rec = await db.get<StoredProject>('projects', id);
  if (!rec) throw new Error(`project ${id} not found`);
  const images = new Map<string, Img>();
  const add = async (h: Sha256 | null | undefined, owner: string) => {
    if (!h || images.has(h)) return;
    const b = await db.getBlob(h.slice(7));
    if (!b) throw new Error(`${owner}: cell blob ${h.slice(0, 19)} missing`);
    images.set(h, await decodePng(b));
  };
  for (const v of Object.values(rec.manifest.rig.rest ?? {})) await add(v?.image, 'rest view');
  for (const it of rec.manifest.items)
    for (const l of it.layers)
      for (const dirs of Object.values(l.cells ?? {}))
        for (const cells of Object.values(dirs ?? {}))
          for (const h of cells ?? []) await add(h, it.id);
  return { rec, project: { manifest: rec.manifest, images } };
}

/**
 * Add or replace an item (same id) in the project record, store its cell PNGs, and insert its slot (ladder order) if missing.
 * Blobs first, then one atomic read-modify-write (db.update), so concurrent edits (autosave, another accept, a new move) survive.
 */
export async function saveItem(id: string, item: Item, images: Map<Sha256, Img>, ladder: Slot[]): Promise<void> {
  for (const [h, im] of images) if (!(await db.getBlob(h.slice(7)))) await db.put('blobs', h.slice(7), new Blob([(await encodePngBytes(im)) as Uint8Array<ArrayBuffer>], { type: 'image/png' }));
  await db.update<StoredProject>('projects', id, (rec) => {
    if (!rec) throw new Error(`project ${id} not found`);
    const m = rec.manifest;
    m.items = [...m.items.filter((i) => i.id !== item.id), item];
    // T3: slots stored before the ladder had default z overrides (held bg over the cape) get them; a user's own overrides stay
    for (const s of m.slots) { const d = ladder.find((x) => x.id === s.id)?.zOverrides; if (d?.length && !s.zOverrides?.length) s.zOverrides = structuredClone(d); }
    if (!m.slots.some((s) => s.id === item.slot)) {
      const order = (s: string) => ladder.findIndex((x) => x.id === s);
      m.slots = [...m.slots, ladder.find((s) => s.id === item.slot)!].sort((a, b) => order(a.id) - order(b.id));
    }
    rec.savedAt = new Date().toISOString();
    return rec;
  });
}

export async function deleteItem(id: string, itemId: string): Promise<void> {
  await db.update<StoredProject>('projects', id, (rec) => {
    if (!rec) throw new Error(`project ${id} not found`);
    rec.manifest.items = rec.manifest.items.filter((i) => i.id !== itemId || i.slot === 'body');
    return rec;
  });
}
