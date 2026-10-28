import { afterEach, expect, test, vi } from 'vitest';
import { assertImportedPoses, fixedFacingLocomotion, importedPoseIssues } from '../../src/lib/rig/pose-review.ts';
import { hasAll, LABELS } from '../../src/lib/rig/poses.ts';
import type { DirectionName, Keypoint, Rig } from '../../src/lib/rig/rig.ts';
import type { Item } from '../../src/lib/store/manifest.ts';
import { newDraft, poseItemClip, runItem, type Draft, type RigCtx } from '../../src/lib/items/run.ts';
import { queue } from '../../src/lib/pixellab/queue.ts';

afterEach(() => vi.restoreAllMocks());

const rest = (): Keypoint[] => LABELS.map(label => {
  const side = label.startsWith('LEFT') ? -1 : label.startsWith('RIGHT') ? 1 : 0;
  const joint = label.replace(/^(LEFT|RIGHT) /, '');
  const [spread, y] = ({ NOSE: [0, 0.2], NECK: [0, 0.35], SHOULDER: [0.15, 0.35], ELBOW: [0.2, 0.5], ARM: [0.22, 0.65], HIP: [0.1, 0.62], KNEE: [0.11, 0.77], LEG: [0.12, 0.93], EYE: [0.06, 0.17], EAR: [0.12, 0.19] } as Record<string, number[]>)[joint];
  return { label, x: 0.5 + side * spread, y };
});
const badPose = () => rest().map(p => {
  if (/SHOULDER|HIP/.test(p.label)) return { ...p, x: 1 - p.x };
  if (p.label === 'LEFT EAR') return { ...p, x: 0.62 };
  return p;
});
function rig(dir: DirectionName = 'south', anim = 'walking'): Rig {
  return { cell: { w: 80, h: 80 }, pivot: { x: 40, y: 78 }, baseItem: 'base', baseHash: 'sha256:fixture', directions: [{ id: dir }], rest: { [dir]: { image: 'sha256:reference', keypoints: rest() } }, animations: [{ id: anim, cells: 3, loop: true, frames: [], sources: { [dir]: { route: 'import', reference: 'sha256:reference', keypoints: [rest(), badPose(), rest()], provenance: [] } } }] };
}

test('reports corroborated bad imported estimates with a useful frame number without rewriting them', () => {
  const r = rig(), before = structuredClone(r);
  expect(hasAll(badPose())).toBe(true);
  expect(importedPoseIssues(r)).toEqual([expect.stringContaining('walking/south frame 2: suspicious estimated joints')]);
  expect(importedPoseIssues(r)[0]).toContain('ear joints collapse');
  expect(r).toEqual(before);
  expect(importedPoseIssues(r, { anims: ['idle'] })).toEqual([]);
  expect(importedPoseIssues(r, { dirs: ['north'] })).toEqual([]);
  expect(importedPoseIssues(r, { dirs: ['south'], clipDirs: { walking: ['north'] } })).toEqual([]);
  expect(importedPoseIssues(r, { cells: ['walking/south/0'] })).toEqual([]);
  expect(importedPoseIssues(r, { cells: ['walking/south/1'] })).toHaveLength(1);
  expect(() => assertImportedPoses(r)).toThrow('Equipment animation cannot continue');
  expect(() => assertImportedPoses(r, { cells: ['walking/south/0'] })).not.toThrow();
});

test('does not infer bad measurements from a torso reversal alone or ordinary walking', () => {
  const r = rig(), source = r.animations[0].sources!.south!;
  source.keypoints = [rest(), rest().map(p => ({ ...p, x: 1 - p.x })), rest()];
  expect(importedPoseIssues(r)).toEqual([]);
  source.keypoints = [rest(), rest().map(p => ({ ...p, y: p.y + 0.015 })), rest()];
  expect(importedPoseIssues(r)).toEqual([]);
});

test('limits diagnostics to imported fixed-facing front/back locomotion with a meaningful standing width', () => {
  expect(importedPoseIssues(rig('north'))).toHaveLength(1);
  for (const dir of ['east', 'west', 'south-east', 'north-west'] as const) expect(importedPoseIssues(rig(dir))).toEqual([]);
  for (const anim of ['slash', 'death', 'walking-turn-around', 'idle-turn']) expect(importedPoseIssues(rig('south', anim))).toEqual([]);
  const r = rig(); r.animations[0].sources!.south!.route = 'skeleton-v3';
  expect(importedPoseIssues(r)).toEqual([]);
  r.animations[0].sources!.south!.route = 'import';
  r.rest!.south!.keypoints = rest().map(p => /SHOULDER|HIP/.test(p.label) ? { ...p, x: 0.5 } : p);
  expect(importedPoseIssues(r)).toEqual([]);
  expect(['walk', 'walking', 'run', 'running', 'idle', 'breathing-idle', 'walking-8-frames'].every(fixedFacingLocomotion)).toBe(true);
});

test('does not replace structural validation for invalid estimates', () => {
  const r = rig(); r.animations[0].sources!.south!.keypoints![1][0].x = NaN;
  expect(hasAll(r.animations[0].sources!.south!.keypoints![1])).toBe(false);
  expect(importedPoseIssues(r)).toEqual([]);
});

function context(): RigCtx {
  const manifest: RigCtx['rec']['manifest'] = { format: 'pixeldoll/1', app: 'synthetic test', name: 'Synthetic character', rig: rig(), materials: [], items: [], slots: [], presets: [] };
  return { rec: { id: 'rig-test', savedAt: '', manifest }, project: { manifest, images: new Map() } };
}
const spec = { id: 'robe', name: 'Robe', slot: 'torso_inner', prompt: 'a long robe', key: 'green' as const, method: 'skel' as const, anims: ['walking'], dirs: ['south' as const] };

test('new default and explicitly skeleton-posed drafts stop before any paid dressing request', () => {
  const ctx = context(), enqueue = vi.spyOn(queue, 'enqueue').mockRejectedValue(new Error('Unexpected paid request'));
  expect(() => newDraft(ctx, spec)).toThrow('walking/south frame 2');
  expect(() => newDraft(ctx, { ...spec, method: undefined })).toThrow('walking/south frame 2');
  expect(enqueue).not.toHaveBeenCalled();
});

test('persisted skeleton drafts cannot bypass the imported-pose preflight on resume', async () => {
  const ctx = context(), enqueue = vi.spyOn(queue, 'enqueue').mockRejectedValue(new Error('Unexpected paid request'));
  const draft: Draft = { rigId: ctx.rec.id, spec, calls: [{ kind: 'dress', cells: ['rest/south/0'], seed: 1, rerolls: 0, old: [] }], keySwitched: false, log: [] };
  await expect(runItem(draft, ctx)).rejects.toThrow('walking/south frame 2');
  expect(enqueue).not.toHaveBeenCalled();
  expect(draft.calls[0].recId).toBeUndefined();
});

test('extending accepted equipment stops before pose or fallback requests for suspicious imported targets', async () => {
  const ctx = context(), enqueue = vi.spyOn(queue, 'enqueue').mockRejectedValue(new Error('Unexpected paid request'));
  const item: Item = { id: 'robe', name: 'Robe', slot: 'torso_inner', prompt: 'a long robe', status: 'accepted', mirror: 'generate', materials: [], baseHash: ctx.rec.manifest.rig.baseHash, key: 'green', route: 'skeleton-pose', dressed: { south: 'sha256:design' }, layers: [{ id: 'main', role: 'fg', z: 40, cells: {} }], provenance: [] };
  await expect(poseItemClip(ctx, item, 'walking')).rejects.toThrow('walking/south frame 2');
  expect(enqueue).not.toHaveBeenCalled();
});

test('equipment preflight does not block independently selected clean moves', () => {
  const ctx = context(), clean = rig('south', 'idle').animations[0];
  clean.sources!.south!.keypoints = [rest(), rest(), rest()];
  ctx.rec.manifest.rig.animations.push(clean);
  expect(newDraft(ctx, { ...spec, anims: ['idle'] }).calls[0].kind).toBe('dress');
  expect(() => newDraft(ctx, { ...spec, anims: ['walking', 'idle'] })).toThrow('walking/south frame 2');
});
