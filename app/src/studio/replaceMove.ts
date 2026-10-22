import { stableStringify } from '../lib/image/hash.ts';
import type { StoredProject } from '../lib/store/project.ts';
import { mergeQa, summaryOf } from '../lib/items/qa-summary.ts';
import type { Skeleton } from '../lib/rig/skeleton.ts';
import type { ItemQa, Manifest } from '../lib/store/manifest.ts';

/** A replaced body clip invalidates every fitted item, including items not selected for re-posing. */
export function invalidateMoveItems(manifest: Manifest, anim: string): void {
  const belongs = (key: string) => key.split('/')[0] === anim;
  for (const item of manifest.items) {
    if (item.id === manifest.rig.baseItem) continue;
    const original = [...new Set(item.layers.flatMap((l) => Object.entries(l.cells ?? {}).flatMap(([a, dirs]) => Object.keys(dirs).map((d) => `${a}/${d}`))))];
    for (const layer of item.layers) {
      if (layer.cells) delete layer.cells[anim];
      if (layer.sheets) delete layer.sheets[anim];
    }
    if (item.anchorCell && belongs(item.anchorCell)) delete item.anchorCell;
    const old = item.qa;
    if (!old) continue;
    const remaining = original.filter((key) => !belongs(key));
    if (!remaining.length) { delete item.qa; continue; }
    const baseline = old.legacy ?? (!old.clips ? { clips: original, summary: summaryOf(old) } : undefined);
    const legacyClips = baseline?.clips.filter((key) => !belongs(key));
    const filtered: ItemQa = {
      ...old,
      clips: Object.fromEntries(Object.entries(old.clips ?? {}).filter(([key]) => !belongs(key))),
      cells: Object.fromEntries(Object.entries(old.cells).filter(([key]) => !belongs(key))),
      ...(legacyClips?.length ? { legacy: { ...baseline!, clips: legacyClips } } : {}),
    };
    if (!legacyClips?.length) delete filtered.legacy;
    // mergeQa aggregates the retained parts, including explicitly incomplete historical summaries.
    const empty: ItemQa = { minKeyKept: 1, maxKeyOutside: 0, minAreaRatio: 1, maxAreaCV: 0, maxPaletteDist: 0, clipPx: 0, status: 'pass', rerolls: 0, clips: {}, cells: {} };
    item.qa = mergeQa({ ...item, qa: filtered }, empty, {});
  }
}

/** Old joints must not stand in for measurements missing from a replacement clip. */
export function clearMovePoseData(rig: Manifest['rig'], skeletons: Record<string, Skeleton>, anim: string): void {
  for (const key of Object.keys(skeletons)) if (key.split('/')[0] === anim) delete skeletons[key];
  for (const track of Object.values(rig.anchors ?? {})) if (track) delete track[anim];
}


/** Optimistic generation input version: excludes outfits/materials, includes same-body rig setup/reference changes. */
export const moveRigVersion = (record: Pick<StoredProject, 'manifest' | 'character'>): string =>
  stableStringify({ rig: record.manifest.rig, character: record.character });
