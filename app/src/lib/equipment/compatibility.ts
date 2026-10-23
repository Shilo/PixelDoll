import { cellImg, layerFrame } from '../compose/compose.ts';
import { cellHash, cellKey, type DirectionName, type Sha256 } from '../rig/rig.ts';
import { sha256, stableStringify } from '../image/hash.ts';
import { canPose, SLOTS } from '../items/items.ts';
import type { Manifest, Project, Layer } from '../store/manifest.ts';
import type { Img } from '../image/png.ts';
import { designItem, type EquipmentDesign, type FitAssessment } from './types.ts';
import { loadImages } from './store.ts';

export async function targetAudit(project: Project): Promise<Sha256> {
  const m = project.manifest, base = m.items.find((it) => it.id === m.rig.baseItem);
  if (!base) throw new Error('The target has no frozen body.');
  const cells: Record<string, string | null> = {};
  for (const a of m.rig.animations) for (const d of m.rig.directions) for (let i = 0; i < a.cells; i++) {
    const im = cellImg(project, base.layers[0], a.id, d.id, i);
    cells[cellKey(a.id, d.id, i)] = im ? await cellHash(im) : null;
  }
  return `sha256:${await sha256(stableStringify({ cell: m.rig.cell, pivot: m.rig.pivot, view: m.rig.view, template: m.rig.template, directions: m.rig.directions, cells, rest: m.rig.rest, poses: m.rig.animations.map((a) => ({ id: a.id, sources: a.sources })) }))}`;
}
const geometry = (m: Manifest) => stableStringify({ cell: m.rig.cell, pivot: m.rig.pivot });
export async function assessDesign(design: EquipmentDesign, target: Project): Promise<FitAssessment> {
  const source: Project = { manifest: design.source, images: await loadImages(design.imageHashes, design.images) };
  const sm = source.manifest, tm = target.manifest, item = designItem(design), sb = sm.items.find((it) => it.id === sm.rig.baseItem), tb = tm.items.find((it) => it.id === tm.rig.baseItem);
  const reasons: string[] = [], warnings = [...design.warnings], matches: FitAssessment['matches'] = [];
  const coverage = item.coverage ? new Set<string>(item.coverage) : null;
  const hashes = new WeakMap<Img, Promise<Sha256>>(), cells = new WeakMap<Layer, Map<string, Img | null>>();
  const hash = (im: Img) => { let value = hashes.get(im); if (!value) { value = cellHash(im); hashes.set(im, value); } return value; };
  const frame = (p: Project, layer: Layer, anim: string, dir: DirectionName, i: number) => {
    let cache = cells.get(layer); if (!cache) { cache = new Map(); cells.set(layer, cache); }
    const key = cellKey(anim, dir, i); if (!cache.has(key)) cache.set(key, cellImg(p, layer, anim, dir, i)); return cache.get(key)!;
  };
  const indices = new Map<DirectionName, Promise<Map<Sha256, { key: string; signature: string }[]>>>();
  const sourceIndex = (dir: DirectionName) => {
    let index = indices.get(dir); if (index) return index;
    index = (async () => {
      const out = new Map<Sha256, { key: string; signature: string }[]>(), from = sm.rig.directions.find(d => d.id === dir)?.mirrorOf ?? dir;
      for (const a of sm.rig.animations) for (let i = 0; i < a.cells; i++) {
        if (coverage && !coverage.has(cellKey(a.id, dir, i)) && !coverage.has(cellKey(a.id, from, i))) continue;
        const base = frame(source, sb!.layers[0], a.id, dir, i);
        if (!base || !item.layers.some(l => (l.cells?.[a.id]?.[dir] ?? l.cells?.[a.id]?.[from])?.length === a.cells)) continue;
        const bodyHash = await hash(base), layers = await Promise.all(item.layers.map(async l => { const im = frame(source,l,a.id,dir,i); return { geometry: layerFrame(sm.rig,l), hash: im ? await hash(im) : null }; }));
        const entry = { key: cellKey(a.id,dir,i), signature: stableStringify(layers) }; out.set(bodyHash,[...(out.get(bodyHash) ?? []),entry]);
      } return out;
    })(); indices.set(dir,index); return index;
  };
  if (!sb || !tb) throw new Error('The source or target frozen body is missing.');
  const targetDirs = tm.rig.directions.filter((d) => !d.mirrorOf).map((d) => d.id);
  const clipDirs: Record<string, DirectionName[]> = {};
  let totalCells = 0, ambiguous = false;
  const geometricallyEqual = geometry(sm) === geometry(tm) && (!sm.rig.view || !tm.rig.view || sm.rig.view === tm.rig.view) && (!sm.rig.template || !tm.rig.template || sm.rig.template === tm.rig.template);
  const slot = tm.slots.find((s) => s.id === item.slot) ?? SLOTS.find((s) => s.id === item.slot), sourceSlot = sm.slots.find((s) => s.id === item.slot);
  const slotMatches = !!slot && !!sourceSlot && slot.class === sourceSlot.class && slot.anchor === sourceSlot.anchor;
  for (const ta of tm.rig.animations) {
    clipDirs[ta.id] = [];
    for (const dir of targetDirs) {
      const frames = Array.from({ length: ta.cells }, (_, i) => frame(target, tb.layers[0], ta.id, dir, i));
      if (!frames.some(Boolean)) continue;
      totalCells += ta.cells; clipDirs[ta.id].push(dir);
      if (frames.some((im) => !im) || !geometricallyEqual || !slotMatches) continue;
      const targetHashes = await Promise.all(frames.map((im) => hash(im!)));
      const possible: { anim: string; keys: string[]; signature: string }[] = [];
      for (const sa of sm.rig.animations.filter((a) => a.cells === ta.cells)) {
        const sourceFrames = frames.map((_, i) => frame(source, sb.layers[0], sa.id, dir, i));
        if (sourceFrames.some((im) => !im)) continue;
        if (!(await Promise.all(sourceFrames.map((im) => hash(im!)))).every((h, i) => h === targetHashes[i])) continue;
        if (coverage && frames.some((_, i) => !coverage.has(cellKey(sa.id, dir, i)) && !coverage.has(cellKey(sa.id, sm.rig.directions.find(d=>d.id===dir)?.mirrorOf??dir, i)))) continue;
        const from = sm.rig.directions.find((d) => d.id === dir)?.mirrorOf ?? dir;
        if (!item.layers.some((l) => (l.cells?.[sa.id]?.[dir] ?? l.cells?.[sa.id]?.[from])?.length === sa.cells)) continue;
        const layers = await Promise.all(item.layers.map(async (l) => ({ geometry: layerFrame(sm.rig, l), cells: await Promise.all(Array.from({ length: sa.cells }, async (_, i) => { const im = frame(source, l, sa.id, dir, i); return im ? hash(im) : null; })) })));
        possible.push({ anim: sa.id, keys: frames.map((_, i) => cellKey(sa.id, dir, i)), signature: stableStringify(layers) });
      }
      // An equal named clip still needs all frozen body cells to match. Different names are accepted only unambiguously.
      const chosen = possible.find((p) => p.anim === ta.id) ?? (new Set(possible.map((p) => p.signature)).size === 1 ? possible[0] : undefined);
      if (chosen) { chosen.keys.forEach((source, i) => matches.push({ source, target: cellKey(ta.id, dir, i) })); continue; }
      // Different clip lengths can still share an unambiguous frozen pose (including a repeated standing cell).
      // Require every matching source pose to agree on the complete equipment raster, not merely the body hash.
      for (const [i, bodyHash] of targetHashes.entries()) {
        const candidates = (await sourceIndex(dir)).get(bodyHash) ?? [];
        if (new Set(candidates.map((c) => c.signature)).size === 1) matches.push({ target: cellKey(ta.id, dir, i), source: candidates[0].key });
        else if (candidates.length) ambiguous = true;
      }
    }
  }
  const missingCells = totalCells - matches.length;
  if (missingCells) reasons.push('This body or its moves need a fitted copy of this design.');
  if (!slotMatches) reasons.push('The target slot or grip differs from the saved source.');
  if (ambiguous) reasons.push('Several source moves match these poses. Their equipment differs; automatic copying cannot choose safely.');
  if (!sm.rig.view || !tm.rig.view) warnings.push('Camera metadata is incomplete. Review the copied views before keeping them.');
  if (tm.rig.directions.some((d) => d.mirrorOf) && (slot?.class === 'held')) warnings.push('Mirrored character views also mirror the equipment and may swap its anatomical hand.');
  const targetRigReady = !!tm.rig.rest && canPose(tm.rig, { anims: tm.rig.animations.filter((a) => clipDirs[a.id].length).map((a) => a.id), dirs: targetDirs, clipDirs });
  const canExtend = targetRigReady && !!item.dressed && targetDirs.every((d) => item.dressed?.[d] && stableStringify(tm.rig.rest?.[d]) === stableStringify(sm.rig.rest?.[d]));
  if (matches.length && !canExtend) warnings.push('Ready for the copied frames. A target rest fit or setup is needed before adding new moves to this copy.');
  const status: FitAssessment['status'] = !totalCells || !slot || (ambiguous && !matches.length) ? 'unsupported' : !missingCells ? 'ready' : targetRigReady ? 'fit' : 'setup';
  if (status === 'setup') reasons.push('Set up the target character’s pose rig before fitting this design.');
  return { status, freeCells: matches.length, totalCells, missingCells, canExtend, targetRigReady, canCopy: matches.length > 0, reasons, warnings: [...new Set(warnings)], matches };
}
