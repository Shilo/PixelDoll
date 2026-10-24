// Turn frozen imported artwork into the same rig contract used by creation, without repainting its existing layers.
import { cellImg } from '../compose/compose.ts';
import { DIRECTIONS, cellHash, cellKey, type DirectionName, type Keypoint, type Rig, type Sha256 } from './rig.ts';
import { HEADROOM_MIN, anchorTracks, type Built } from './freeze.ts';
import { clipQa } from './clips.ts';
import { opaqueBox } from './normalize.ts';
import { fromApi, hasAll } from './poses.ts';
import { flipSkeleton, type Skeleton } from './skeleton.ts';
import type { Img } from '../image/png.ts';
import type { Project, Provenance } from '../store/manifest.ts';
import type { StoredProject } from '../store/project.ts';

export interface SetupPlan { restAnim: string; fixedRest: boolean; rest: Partial<Record<DirectionName, Img>>; registrationDirections: 4 | 8; frames: Map<Sha256, Img>; gens: number; warnings: string[] }
export function rigReady(rec?: Pick<StoredProject, 'manifest' | 'character'> | null): boolean {
  const r = rec?.manifest.rig;
  if (!r || !rec?.character?.id || !rec.character.looks?.trim()) return false;
  const base = rec.manifest.items.find((i) => i.id === r.baseItem)?.layers[0];
  return !!base && r.directions.every((d) => d.mirrorOf || hasAll(r.rest?.[d.id]?.keypoints)) && r.animations.every((a) => r.directions.every((d) => {
    if (d.mirrorOf || !base.cells?.[a.id]?.[d.id]?.some(Boolean)) return true;
    const poses = a.sources?.[d.id]?.keypoints;
    return poses?.length === a.cells && poses.every(hasAll);
  }));
}

/** Preflight happens offline and before any spending. A source rest clip can be explicitly selected in the UI. */
export async function setupPlan(p: Project, restAnim?: string): Promise<SetupPlan> {
  const m = p.manifest, rig = m.rig, warnings: string[] = [];
  if (rig.cell.w !== rig.cell.h || !Number.isInteger(rig.cell.w) || rig.cell.w < 32 || rig.cell.w > 256) throw new Error('Rig setup needs a square frame of 32–256 whole pixels.');
  if (rig.template && rig.template !== 'mannequin') throw new Error('Rig setup currently supports humanoid characters. This character uses a different body template.');
  const base = m.items.find((i) => i.id === rig.baseItem)!;
  if (base.layers.length !== 1) throw new Error('Rig setup needs a single frozen base-body layer.');
  const a = restAnim ? rig.animations.find((a) => a.id === restAnim) : rig.animations.find((a) => /^(rest|idle|standing)$/.test(a.id)) ?? rig.animations[0];
  if (!a) throw new Error('Choose a standing reference move.');
  const rest: SetupPlan['rest'] = {}, frames: SetupPlan['frames'] = new Map();
  for (const d of DIRECTIONS) {
    const hash = rig.rest?.[d]?.image, im = hash && p.images.get(hash);
    if (im) rest[d] = im;
  }
  for (const d of rig.directions) {
    const existing = rig.rest?.[d.id]?.image && p.images.get(rig.rest[d.id]!.image);
    const im = existing || cellImg(p, base.layers[0], a.id, d.id, 0);
    if (!im || !opaqueBox(im)) throw new Error(`${a.id} has no ${d.id} standing reference. Choose a move with every view.`);
    const top = opaqueBox(im)!.y0;
    if (top < HEADROOM_MIN) warnings.push(`${d.id} leaves ${top} px above the head; tall hair or hats may need a larger frame.`);
    rest[d.id] = im;
    if (!d.mirrorOf) frames.set(await cellHash(im), im);
  }
  const registrationDirections = DIRECTIONS.every(d => rest[d]) ? 8 : 4;
  const required = registrationDirections === 8 ? DIRECTIONS : ['south', 'east', 'north', 'west'] as const;
  if (required.some(d => !rest[d])) throw new Error('Rig setup needs saved original standing views or all four cardinal views. Import the missing rotations first.');
  for (const a of rig.animations) for (const d of rig.directions.filter((d) => !d.mirrorOf)) {
    const cells = Array.from({ length: a.cells }, (_, i) => cellImg(p, base.layers[0], a.id, d.id, i));
    if (!cells.some((im) => im && opaqueBox(im))) continue; // genuine sparse clip
    if (cells.some((im) => !im || !opaqueBox(im))) throw new Error(`${a.id}/${d.id} contains an empty body frame.`);
    for (const im of cells as Img[]) frames.set(await cellHash(im), im);
  }
  for (const it of m.items.filter((i) => i.slot !== 'body' && !i.dressed)) warnings.push(`${it.name} keeps its existing frames. Make it again after setup to animate it onto future moves.`);
  const fixedRest = rig.directions.some((d) => !!rig.rest?.[d.id]?.image && p.images.has(rig.rest[d.id]!.image));
  return { restAnim: a.id, fixedRest, rest, registrationDirections, frames, gens: +(0.25 + frames.size * 0.1).toFixed(2), warnings };
}

/** Assemble real measurements; imported originals have no requested pose to score against. */
export async function attachImportedRig(p: Project, plan: SetupPlan, measured: Map<string, Keypoint[]>, provenance: Provenance[]): Promise<{ manifest: Project['manifest']; images: Project['images']; skeletons: Record<string, Skeleton>; rigQa: unknown }> {
  const manifest = structuredClone(p.manifest), rig = manifest.rig, images = new Map(p.images), skeletons: Record<string, Skeleton> = {};
  const base = manifest.items.find((i) => i.id === rig.baseItem)!;
  const start = base.provenance.length;
  base.provenance.push(...provenance);
  const get = async (im: Img) => {
    const hash = await cellHash(im), k = measured.get(hash);
    if (!hasAll(k)) throw new Error('PixelLab could not find valid joints on every body frame. The existing character was left unchanged.');
    return { hash, keypoints: k! };
  };
  rig.rest = { ...rig.rest };
  for (const d of rig.directions.filter((d) => !d.mirrorOf)) {
    const im = plan.rest[d.id]!, { hash, keypoints } = await get(im);
    images.set(hash, im); rig.rest[d.id] = { image: hash, keypoints };
  }
  const built: Built = { rig, cells: {}, pivotFrom: cellKey(plan.restAnim, rig.directions.find(d => !d.mirrorOf)!.id, 0), errors: [], warnings: [] };
  const byHash: Record<string, Skeleton> = {}, clips: Record<string, ReturnType<typeof clipQa>> = {}, warnings = [...plan.warnings];
  for (const a of rig.animations) {
    a.sources = {};
    for (const d of rig.directions.filter((d) => !d.mirrorOf)) {
      const frames = Array.from({ length: a.cells }, (_, i) => cellImg(p, base.layers[0], a.id, d.id, i));
      if (!frames.some(Boolean)) continue;
      const poses: Keypoint[][] = [];
      for (const [i, im] of (frames as Img[]).entries()) {
        const { hash, keypoints } = await get(im), s = fromApi(keypoints, rig.cell), key = cellKey(a.id, d.id, i);
        poses.push(keypoints); skeletons[key] = s; byHash[hash] = s;
        built.cells[key] = { img: im, hash, box: opaqueBox(im), offset: [0, 0] };
      }
      const reference = rig.rest[d.id]!;
      const isRest = a.cells === 1 && await cellHash(frames[0]!) === reference.image;
      a.sources[d.id] = { route: 'import', reference: reference.image, keypoints: poses, measured: poses, motion: isRest ? 'imported-rest' : 'estimated:frozen-import', provenance: provenance.map((_, i) => start + i) };
      const qa = clipQa({ anim: a.id, rest: plan.rest[d.id]!, frames: frames as Img[], measured: poses, stray: 0 });
      clips[`${a.id}/${d.id}`] = qa;
      warnings.push(...[...qa.fails, ...qa.warnings].map((f) => `${a.id}/${d.id}: ${f}`));
    }
  }
  for (const d of rig.directions.filter((d) => d.mirrorOf)) for (const a of rig.animations) for (let i = 0; i < a.cells; i++) {
    const src = skeletons[cellKey(a.id, d.mirrorOf!, i)];
    if (src) skeletons[cellKey(a.id, d.id, i)] = flipSkeleton(src, rig.cell.w);
  }
  const tracks = anchorTracks(built, byHash);
  rig.anchors = tracks.anchors;
  return { manifest, images, skeletons, rigQa: { warnings, pivotFrom: built.pivotFrom, clips, tracks: tracks.stats.map(({ points: _, ...t }) => t) } };
}
