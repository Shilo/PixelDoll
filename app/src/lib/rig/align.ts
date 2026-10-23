// Lossless whole-direction translation. All animations/layers move together; source records and paid history stay frozen.
import { makeImg, type Img } from '../image/png.ts';
import { opaqueBox, feetY } from './normalize.ts';
import { baseHashOf, cellHash, cellKey, cellKeys, DIRECTIONS, validateRig, type DirectionName, type Keypoint, type Sha256 } from './rig.ts';
import type { Project } from '../store/manifest.ts';
import type { StoredProject } from '../store/project.ts';
import { cellImg } from '../compose/compose.ts';
import { buildRig } from './freeze.ts';
import { clipQa, type ClipQa } from './clips.ts';
import { targetAudit } from '../equipment/compatibility.ts';
import { targetStamp } from '../equipment/copy.ts';
import { restStamp } from '../equipment/design.ts';

export type DirectionOffsets = Partial<Record<DirectionName, number>>;
export interface AlignmentPlan {
  groups: { id: DirectionName; directions: DirectionName[]; offset: number }[];
  offsets: DirectionOffsets;
  errors: string[];
}
export interface AlignedCharacter { project: Project; record: StoredProject; offsets: DirectionOffsets }

export function managedMotionOffsets(character: StoredProject['character'], size: number): DirectionOffsets {
  const offsets = character?.motionOffsets ?? {};
  if (typeof offsets !== 'object' || Array.isArray(offsets)) throw new Error('The saved managed-motion alignment is invalid.');
  for (const [dir, dy] of Object.entries(offsets)) if (!DIRECTIONS.includes(dir as DirectionName) || !Number.isSafeInteger(dy) || Math.abs(dy!) > size) throw new Error('The saved managed-motion alignment is invalid.');
  return offsets;
}

export function planAlignment(project: Project): AlignmentPlan {
  const { manifest: m } = project, rig = m.rig;
  const plan: AlignmentPlan = { groups: [], offsets: {}, errors: [] };
  const body = m.items.find(it => it.id === rig.baseItem)?.layers[0];
  if (!body) { plan.errors.push('The character has no frozen body.'); return plan; }
  const idle = rig.animations.find(a => a.id === 'idle');
  for (const d of rig.directions.filter(d => !d.mirrorOf)) {
    try {
      let baseline: number;
      if (idle) {
        const frames = Array.from({ length: idle.cells }, (_, i) => cellImg(project, body, idle.id, d.id, i));
        if (!frames.length || frames.some(im => !im || !opaqueBox(im))) throw new Error('idle frames are missing or empty');
        const bottoms = frames.map(im => feetY(im!)).sort((a, b) => a - b);
        if (bottoms.at(-1)! - bottoms[0] > 1) throw new Error('idle has no stable standing baseline');
        baseline = bottoms[Math.floor(bottoms.length / 2)];
      } else {
        const rest = rig.rest?.[d.id], im = rest && project.images.get(rest.image);
        if (!im || !opaqueBox(im)) throw new Error('a standing reference or stable idle is required');
        baseline = feetY(im);
      }
      const offset = rig.pivot.y - baseline;
      if (!Number.isSafeInteger(offset)) throw new Error('the shared pivot must use whole pixels');
      const directions = rig.directions.filter(p => p.id === d.id || p.mirrorOf === d.id).map(p => p.id);
      plan.groups.push({ id: d.id, directions, offset });
      for (const id of directions) plan.offsets[id] = offset;
    } catch (e) { plan.errors.push(`${d.id}: ${(e as Error).message}.`); }
  }
  if (!rig.directions.length) plan.errors.push('The character has no directions.');
  return plan;
}

function point(x: number, y: number, dy: number, w: number, h: number, label: string) {
  if (!Number.isFinite(x) || !Number.isFinite(y) || x < 0 || x > w || y + dy < 0 || y + dy > h) throw new Error(`${label}: alignment moves a rig point outside its frame.`);
}

/** Server motion remains in its original coordinates. Only managed/text poses need this conversion; authored poses don't. */
export function shiftMotionPoses(poses: Keypoint[][], dy: number, size: number): Keypoint[][] {
  if (!Number.isSafeInteger(dy) || Math.abs(dy) > size) throw new Error('Invalid managed-motion alignment offset.');
  if (!dy) return poses;
  return poses.map(pose => pose.map(k => {
    point(k.x, k.y, dy / size, 1, 1, 'Managed motion');
    return { ...k, y: k.y + dy / size };
  }));
}

export async function alignCharacter(project: Project, record: StoredProject, requested: DirectionOffsets): Promise<AlignedCharacter> {
  const invalid = validateRig(project.manifest.rig);
  if (invalid.length) throw new Error(invalid.join(' '));
  const plan = planAlignment(project);
  if (plan.errors.length) throw new Error(plan.errors.join(' '));
  const offsets: DirectionOffsets = {};
  for (const [id, dy] of Object.entries(requested)) {
    if (!DIRECTIONS.includes(id as DirectionName) || !(id in plan.offsets) || !Number.isSafeInteger(dy) || (dy !== 0 && dy !== plan.offsets[id as DirectionName])) throw new Error('Choose a suggested whole-direction offset.');
  }
  for (const group of plan.groups) {
    const dy = requested[group.id] ?? 0;
    if (group.directions.some(d => (requested[d] ?? 0) !== dy)) throw new Error('Mirrored directions must stay aligned together.');
    for (const d of group.directions) offsets[d] = dy;
  }
  if (!Object.values(offsets).some(Boolean)) throw new Error('Choose at least one direction to align.');
  const result = structuredClone(record), m = result.manifest = structuredClone(project.manifest), rig = m.rig;
  const oldHash = project.manifest.rig.baseHash, oldRestStamp = restStamp(project.manifest);
  const images = new Map(project.images), cache = new Map<string, Sha256>();
  const shift = async (hash: Sha256, dy: number, label: string): Promise<Sha256> => {
    const src = project.images.get(hash);
    if (!src) throw new Error(`${label}: a source image is missing. Reload the character.`);
    if (!dy) return hash;
    const key = `${hash}:${dy}`, cached = cache.get(key);
    if (cached) return cached;
    const out = makeImg(src.w, src.h);
    for (let y = 0; y < src.h; y++) for (let x = 0; x < src.w; x++) {
      const at = (y * src.w + x) * 4, target = y + dy;
      if (target < 0 || target >= src.h) {
        if (src.data[at + 3]) throw new Error(`${label}: alignment would clip artwork. Leave this direction unchanged.`);
      } else out.data.set(src.data.subarray(at, at + 4), (target * src.w + x) * 4);
    }
    const next = await cellHash(out); images.set(next, out); cache.set(key, next); return next;
  };
  const pose = (ks: Keypoint[], dy: number, label: string) => ks.map(k => {
    point(k.x, k.y, dy / rig.cell.h, 1, 1, label);
    return { ...k, y: k.y + dy / rig.cell.h };
  });
  const normalized = (ks: Keypoint[] | undefined, dy: number, label: string) => !ks || !dy ? ks : pose(ks, dy, label);
  for (const it of m.items) {
    for (const layer of it.layers) for (const [anim, ds] of Object.entries(layer.cells ?? {})) for (const [dir, cells] of Object.entries(ds)) {
      if (!cells) continue;
      const dy = offsets[dir as DirectionName] ?? 0;
      ds[dir as DirectionName] = await Promise.all(cells.map((hash, i) => hash ? shift(hash, dy, `${it.name} ${anim}/${dir}/${i}`) : null));
    }
    for (const [dir, hash] of Object.entries(it.dressed ?? {})) if (hash) it.dressed![dir as DirectionName] = await shift(hash, offsets[dir as DirectionName] ?? 0, `${it.name} ${dir} dressed reference`);
  }
  for (const [dir, rest] of Object.entries(rig.rest ?? {})) if (rest) {
    const dy = offsets[dir as DirectionName] ?? 0;
    rest.image = await shift(rest.image, dy, `${dir} standing reference`);
    rest.keypoints = normalized(rest.keypoints, dy, `${dir} standing pose`)!;
  }
  for (const anim of rig.animations) for (const [dir, source] of Object.entries(anim.sources ?? {})) if (source) {
    const dy = offsets[dir as DirectionName] ?? 0;
    source.reference = await shift(source.reference, dy, `${anim.id}/${dir} pose reference`);
    source.keypoints = source.keypoints?.map(ks => normalized(ks, dy, `${anim.id}/${dir} requested pose`)!);
    source.measured = source.measured?.map(ks => normalized(ks, dy, `${anim.id}/${dir} measured pose`)!);
  }
  for (const [key, skeleton] of Object.entries(result.skeletons ?? {})) {
    const dy = offsets[key.split('/')[1] as DirectionName] ?? 0;
    if (!dy) continue;
    for (const p of Object.values(skeleton)) { point(p.x, p.y, dy, rig.cell.w, rig.cell.h, key); p.y += dy; }
  }
  for (const track of Object.values(rig.anchors ?? {})) for (const [anim, ds] of Object.entries(track)) for (const [dir, points] of Object.entries(ds)) {
    const dy = offsets[dir as DirectionName] ?? 0;
    if (!points || !dy) continue;
    ds[dir as DirectionName] = points.map(([x, y]) => { point(x, y, dy, rig.cell.w, rig.cell.h, `${anim}/${dir} anchor`); return [x, y + dy]; });
  }
  const body = m.items.find(it => it.id === rig.baseItem)!;
  const hashes: Record<string, Sha256> = {};
  for (const key of cellKeys(rig)) {
    const [anim, dir, i] = key.split('/'), im = cellImg({ manifest: m, images }, body.layers[0], anim, dir as DirectionName, +i);
    if (!im) throw new Error(`${key}: the frozen body frame is missing.`);
    hashes[key] = await cellHash(im);
  }
  rig.baseHash = await baseHashOf(rig, hashes);
  const errors = validateRig(rig, hashes);
  if (errors.length) throw new Error(errors.join(' '));
  for (const it of m.items) if (it.baseHash === oldHash) it.baseHash = rig.baseHash;
  const aligned: Project = { manifest: m, images }, audit = await targetAudit(aligned), newRestStamp = restStamp(m);
  for (const it of m.items) if (it.design) {
    const old = project.manifest.items.find(p => p.id === it.id)!;
    it.design.targetAudit = audit; it.design.targetStamp = targetStamp(m, it.slot);
    if (old.baseHash === oldHash && old.design?.dressedStamp === oldRestStamp && it.dressed) it.design.dressedStamp = newRestStamp;
    else delete it.design.dressedStamp;
  }
  if (result.character) {
    const previous = managedMotionOffsets(result.character, rig.cell.h);
    result.character.motionOffsets = { ...previous };
    for (const [dir, dy] of Object.entries(offsets)) {
      const total = (previous[dir as DirectionName] ?? 0) + dy!;
      if (Math.abs(total) > rig.cell.h) throw new Error(`${dir}: accumulated managed-motion alignment exceeds the frame.`);
      result.character.motionOffsets[dir as DirectionName] = total;
    }
  }
  const built = await buildRig(rig.animations.map(a => ({ id: a.id, dirs: Object.fromEntries(rig.directions.filter(d => !d.mirrorOf).map(d => [d.id, Array.from({ length: a.cells }, (_, i) => cellImg(aligned, body.layers[0], a.id, d.id, i)!)])) })), { size: rig.cell.w, directions: rig.directions });
  const qa = (result.rigQa && typeof result.rigQa === 'object' ? result.rigQa : {}) as { warnings?: string[]; clips?: Record<string, ClipQa>; alignment?: unknown[] };
  const clips = { ...qa.clips }, clipNotes: string[] = [], replaced = new Set<string>();
  for (const a of rig.animations) for (const d of rig.directions.filter(d => !d.mirrorOf)) {
    const source = a.sources?.[d.id], rest = rig.rest?.[d.id], key = `${a.id}/${d.id}`;
    if (!source?.measured || !rest) continue;
    for (const fail of qa.clips?.[key]?.fails ?? []) replaced.add(`${key}: ${fail}`);
    clips[key] = clipQa({ anim: a.id, rest: images.get(rest.image)!, frames: Array.from({ length: a.cells }, (_, i) => cellImg(aligned, body.layers[0], a.id, d.id, i)!), requested: source.keypoints, measured: source.measured, stray: qa.clips?.[key]?.stray ?? 0 });
    clipNotes.push(...clips[key].fails.map(f => `${key}: ${f}`));
  }
  // Keep non-geometric warnings and original API provenance; the local operation has its own audit trail.
  const retained = (qa.warnings ?? []).filter(w => !replaced.has(w) && !/feet drift \d+ px from (?:pivot y|the direction ground line)|ground line is|footprint differs|headroom \d+ px/.test(w));
  result.rigQa = { ...qa, clips, warnings: [...new Set([...clipNotes, ...built.warnings.filter(w => !w.includes('binarized')), ...retained])], alignment: [...(qa.alignment ?? []), { sourceId: record.id, sourceBaseHash: oldHash, offsets, createdAt: new Date().toISOString() }] };
  return { project: aligned, record: result, offsets };
}
