import { stableStringify } from '../lib/image/hash.ts';
import type { StoredProject } from '../lib/store/project.ts';
import { mergeQa, summaryOf } from '../lib/items/qa-summary.ts';
import { dropCut } from '../lib/compose/compose.ts';
import type { DirectionName, Rig } from '../lib/rig/rig.ts';
import type { Skeleton } from '../lib/rig/skeleton.ts';
import type { ItemQa, Manifest } from '../lib/store/manifest.ts';

/** Include western mirror children whenever their authored source changes. */
export function affectedMoveDirections(rig: Pick<Rig, 'directions'>, dirs?: readonly DirectionName[]): DirectionName[] {
  const changed = new Set(dirs ?? rig.directions.map(d => d.id));
  for (let i = 0; i < rig.directions.length; i++) for (const d of rig.directions) if (d.mirrorOf && changed.has(d.mirrorOf)) changed.add(d.id);
  return rig.directions.filter(d => changed.has(d.id)).map(d => d.id);
}

/** A replaced body clip invalidates every fitted item, including items not selected for re-posing. */
export function invalidateMoveItems(manifest: Manifest, anim: string, dirs?: readonly DirectionName[]): void {
  const changed = new Set(affectedMoveDirections(manifest.rig, dirs));
  const belongs = (key: string) => { const [a, d] = key.split('/'); return a === anim && changed.has(d as DirectionName); };
  for (const item of manifest.items) {
    if (item.id === manifest.rig.baseItem) continue;
    const original = [...new Set(item.layers.flatMap((l) => Object.entries(l.cells ?? {}).flatMap(([a, dirs]) => Object.keys(dirs).map((d) => `${a}/${d}`))))];
    for (const layer of item.layers) {
      if (layer.cells?.[anim]) {
        for (const d of changed) delete layer.cells[anim]![d];
        if (!Object.keys(layer.cells[anim]!).length) delete layer.cells[anim];
      }
      if (layer.sheets) delete layer.sheets[anim];
    }
    dropCut(item, anim, changed); // the hidden ear px belong to the old body frames
    if (item.anchorCell && belongs(item.anchorCell)) delete item.anchorCell;
    if (item.coverage) item.coverage = item.coverage.filter((key) => !belongs(key));
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
export function clearMovePoseData(rig: Manifest['rig'], skeletons: Record<string, Skeleton>, anim: string, dirs?: readonly DirectionName[]): void {
  const changed = new Set(affectedMoveDirections(rig, dirs));
  for (const key of Object.keys(skeletons)) { const [a, d] = key.split('/'); if (a === anim && changed.has(d as DirectionName)) delete skeletons[key]; }
  for (const track of Object.values(rig.anchors ?? {})) if (track?.[anim]) {
    for (const d of changed) delete track[anim]![d];
    if (!Object.keys(track[anim]!).length) delete track[anim];
  }
}


/** Optimistic generation input version: excludes outfits/materials, includes same-body rig setup/reference changes. */
export const moveRigVersion = (record: Pick<StoredProject, 'manifest' | 'character'>): string =>
  stableStringify({ rig: record.manifest.rig, character: record.character });
