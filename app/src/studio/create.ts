// Create character + add a move: rig v1.3 (architecture §3). V3 originals are padded without scaling to the chosen cell
// with the floor pad (lib/rig/normalize), then registered as a managed character (0.25 gen,
// pixel-exact; its skeletons["2d_references"] are the rest keypoints) -> per clip x direction: a MOTION SOURCE (managed
// skeleton-v3 template, pixminimax text, or authored keypoints) -> keypoint sequence -> raw /animate-with-skeleton-v3 on the
// rest view (the request shape items are posed with) -> preserve normalized pixels -> re-estimate -> review notes -> stored
// frames + reference + keypoints + route + provenance. Every paid call is seeded and every free one cached, so re-running the
// same spec after a reload re-attaches to the ledger instead of paying again.
import { live, queue, requestIdentity, retryableEstimate, type EstimateRetryIntent, type JobRec } from '../lib/pixellab/queue.ts';
import { BASE_ANIMS, baseAnimation, png, routes, type Direction, type Req, type SubmitResponse } from '../lib/pixellab/routes.ts';
import { bytesToBase64, decodePng, type Img } from '../lib/image/png.ts';
import { sha256, stableStringify } from '../lib/image/hash.ts';
import { encodePngBytes } from '../lib/image/pngraw.ts';
import * as db from '../lib/store/db.ts';
import { loadProject, type StoredProject } from '../lib/store/project.ts';
import { HEADROOM_MIN, anchorTracks, buildRig } from '../lib/rig/freeze.ts';
import { normalize, opaqueBox } from '../lib/rig/normalize.ts';
import { flipH } from '../lib/rig/mirror.ts';
import { ANCHORS, DEFAULT_MOVE, DIRECTIONS, baseHashOf, cellHash, cellKey, cellKeys, defaultMs, playlist, retainPlaybackChoices, validateRig, type ClipSource, type DirectionName, type Keypoint, type RigAnimation, type RigDirection, type Rig, type Sha256 } from '../lib/rig/rig.ts';
import { anchorsOf, flipSkeleton, type Skeleton } from '../lib/rig/skeleton.ts';
import { ACTIONS, LABELS, authoredPoses, fromApi, hasAll, toApi } from '../lib/rig/poses.ts';
import { rigReady } from '../lib/rig/setup.ts';
import { PaletteRepairUnavailable, repairBodyPalette } from '../lib/rig/palette.ts';
import { RIG_GATES, actionOf, bodyComponents, clipQa, poseCallGens, rawClip, managedMotionOffsets, shiftMotionPoses, type ClipQa } from '../lib/rig/clips.ts';
import { gridEstimate } from '../lib/items/items.ts';
import { posable, poseGens, itemPoseGens, poseItemClip, regridClip, type RigCtx } from '../lib/items/run.ts';
import { coverage } from './itemRoute.ts';
import { CURRENT_FORMAT, type CellKey, type Manifest, type Provenance } from '../lib/store/manifest.ts';
import { baseClothesIn, basePrompt, looksOf, withoutBaseBody } from './model.ts';
import { affectedMoveDirections, clearMovePoseData, invalidateMoveItems, moveRigVersion } from './replaceMove.ts';
import { facingErrors, sizeErrors, validBodySize } from './characterConfig.ts';
import { skeletonInput, unpadSkeleton } from '../lib/rig/estimate.ts';
import { planDirections } from '../lib/rig/mirror.ts';
import { prepareExtensionFit } from '../lib/equipment/index.ts';
import { splitBase } from '../lib/dress/regions.ts';
import { deriveMaterials } from '../lib/dress/dress.ts';
import { saveSplit } from '../lib/dress/project.ts';

export type DirectionPolicy = 'independent' | 'mirrored';
/** New forms send an exact prompt, frame, camera and explicit direction plan. Old saved in-flight specs retain their
 * original 64 px / 4-or-8-direction registration payload so resuming does not create a differently keyed paid pipeline. */
export interface CreateSpec { description: string; name: string; seed: number; size: number; frame?: number; directions?: RigDirection[]; view?: Rig['view']; exactPrompt?: boolean; dirs?: 4 | 8; directionPolicy?: DirectionPolicy; activityScope?: string; projectId?: string }
export type CreateStep = 'draw' | 'rest' | 'save';
export const STEPS: { id: CreateStep; label: string }[] = [
  { id: 'draw', label: 'Drawing your character' },
  { id: 'rest', label: 'Setting up the skeleton' },
  { id: 'save', label: 'Checking and saving' },
];
/** Independently rendered directions. Legacy mirrored policy derives western views from their eastern counterpart. */
export const genDirsOf = (n: 4 | 8 = 4, policy: DirectionPolicy = 'mirrored'): Direction[] => policy === 'independent'
  ? n === 8 ? ['south', 'south-east', 'east', 'north-east', 'north', 'north-west', 'west', 'south-west'] : ['south', 'east', 'north', 'west']
  : n === 8 ? ['south', 'south-east', 'east', 'north-east', 'north'] : ['south', 'east', 'north'];
const MIRRORS: [Direction, Direction][] = [['west', 'east'], ['south-west', 'south-east'], ['north-west', 'north-east']];
const CELL = 64, EST = 0.1;
export const CLIP_ATTEMPTS = 2;
/** Base sizes in the 64 cell (D4): the 4 px floor stays, so 56 px leaves 4 px of canvas above the character's own canvas
 * and the rest views are checked for HEADROOM_MIN free px above the head. */
export const SIZES = [48, 56] as const;

/** Cost from measured prices: base 2 + import 0.25. Creation makes only the Default move (the standing views); idle, walk
 * and other moves are added later and priced by moveEstimate. */
export const creationDirections = (spec: Pick<CreateSpec, 'directions' | 'dirs' | 'directionPolicy'>): RigDirection[] => spec.directions ?? planDirections(spec.directionPolicy === 'independent' ? 'all' : spec.dirs === 8 ? '8' : '4', genDirsOf(spec.dirs, spec.directionPolicy)).dirs;
export const creationLooks = (spec: Pick<CreateSpec, 'description' | 'exactPrompt'>) => {
  if (!spec.exactPrompt) return looksOf(spec.description);
  return looksOf(withoutBaseBody(spec.description).trim() || 'humanoid base body', baseClothesIn(spec.description) ?? null);
};
export function estimate(choice: 4 | 8 | Pick<CreateSpec, 'directions' | 'dirs' | 'directionPolicy' | 'size'> = 4, policy: DirectionPolicy = 'mirrored') {
  const n = typeof choice === 'number' ? genDirsOf(choice, policy).length : creationDirections(choice).filter(d => !d.mirrorOf).length;
  const size = typeof choice === 'number' ? 48 : choice.size;
  const gens = +(1.25 + Math.ceil(size * size * 8 / 65536)).toFixed(2);
  // Missing managed rest joints may require one estimate per direction.
  return { gens, maxGens: +(gens + n * EST).toFixed(2), minutes: 5 };
}

/** Retain provider artwork for every independently requested view; legacy specs keep their original flips. */
export function prepareRestViews(rots: { label: string; img: Img }[], spec: Pick<CreateSpec, 'dirs' | 'directionPolicy' | 'size' | 'name'>) {
  const DIRS = genDirsOf(spec.dirs, spec.directionPolicy), rest = {} as Record<DirectionName, Img>;
  let pad: [number, number] = [0, 0];
  for (const d of DIRS) {
    const r = rots.find((x) => x.label === d);
    if (!r) throw new Error(`PixelLab returned no ${d} view`);
    const n = normalize(r.img, CELL, CELL);
    if (n.cutPx) throw new Error(`the ${d} view does not fit the 64 px cell`);
    const top = opaqueBox(n.img)?.y0 ?? CELL;
    if (top < HEADROOM_MIN) throw new Error(`${spec.name} is too tall for the 64 px cell at ${spec.size} px (${top} px above the head, hats need ${HEADROOM_MIN}). Try again with 48 px or another seed.`);
    rest[d] = n.img;
    pad = n.offset;
  }
  for (const [m, src] of MIRRORS) if (!DIRS.includes(m) && DIRS.includes(src)) rest[m] = flipH(rest[src]);
  return { rest, pad };
}

/** buildRig intersects source rows; creation must never publish a silently reduced direction set. */
export function assertCreatedDirections(rig: Pick<Rig, 'directions'>, dirs: 4 | 8 = 4, policy: DirectionPolicy = 'mirrored') {
  const expected = genDirsOf(dirs, 'independent'), mirrors = new Map(MIRRORS);
  if (rig.directions.length !== expected.length || new Set(rig.directions.map((d) => d.id)).size !== expected.length ||
    expected.some((id) => !rig.directions.some((d) => d.id === id && d.mirrorOf === (policy === 'mirrored' ? mirrors.get(id) : undefined)))) {
    throw new Error('The generated character is missing a requested direction or uses the wrong direction policy. No character was saved.');
  }
}

// ---------- queue helpers ----------
/** Cancel sibling continuations when one direction fails; already submitted jobs remain queue-owned. */
const generationAttempts = new WeakMap<AbortSignal, number>();
interface GenerationRecovery { intent: EstimateRetryIntent; rawHashes: Set<string>; checkHashes: Set<string>; tail: Promise<void> }
const measurementRecoveries = new WeakMap<AbortSignal, GenerationRecovery>();
export async function parallelGeneration<T>(tasks: ((signal: AbortSignal) => Promise<T>)[], attempt?: number, recovery?: GenerationRecovery): Promise<T[]> {
  const scope = new AbortController();
  if (Number.isSafeInteger(attempt)) generationAttempts.set(scope.signal, attempt!);
  if (recovery) measurementRecoveries.set(scope.signal, recovery);
  return Promise.all(tasks.map(async (task) => {
    try { scope.signal.throwIfAborted(); return await task(scope.signal); }
    catch (e) { scope.abort(e); throw e; }
  }));
}

export async function run(req: Req, label: string, tag: string, cache = false, resumeSafe = req.method === 'POST', signal?: AbortSignal, activityScope?: string): Promise<JobRec> {
  signal?.throwIfAborted();
  const recovery = signal ? measurementRecoveries.get(signal) : undefined;
  if (recovery) {
    const { requestHash } = await requestIdentity(req);
    const completed = queue.snapshot().jobs.find(record => record.requestHash === requestHash && record.state === 'done');
    if (req.path !== '/estimate-skeleton' && (!recovery.rawHashes.has(requestHash) || !completed)) throw new Error('Joint-check recovery cannot generate or re-roll body artwork. Existing results were kept.');
    signal?.throwIfAborted();
    // Consume a reviewed check once, including when another tab already completed it. Repeated frames cannot buy it twice.
    const allowed = req.path === '/estimate-skeleton' && recovery.checkHashes.delete(requestHash);
    if (completed) return completed;
    if (!allowed) throw new Error('Cached joint results changed. Review the body frames again before continuing. No replacement request was made.');
  }
  const rec = await queue.enqueue(req, { label, tag, cache, resumeSafe, signal, activityScope, minimumTier: 1, attempt: signal ? generationAttempts.get(signal) : undefined,
    ...(recovery && req.path === '/estimate-skeleton' ? { estimateRetry: recovery.intent } : {}) });
  // Queue cancellation is consumer-aware: a failed flow cannot cancel deduplicated work another flow still needs.
  signal?.throwIfAborted();
  const r = live(rec) ? await queue.settled(rec.id) : rec;
  signal?.throwIfAborted();
  if (r.state !== 'done') throw new Error(`${label}: ${r.state}${r.error ? ` (${r.error.slice(0, 160)})` : ''}${resumeSafe ? '. Generation stopped without resending. Review this request in Activity before starting again.' : ''}`);
  return r;
}
export const b64 = async (im: Img) => bytesToBase64(await encodePngBytes(im));
/** Result images of a record, in frame order (labels "south/3" or "3"; character rotations are labeled by direction). */
async function imagesOf(r: JobRec, read?: (sha: string) => Promise<Img>): Promise<{ label: string; img: Img }[]> {
  const res = r.jobs.flatMap((s) => s.results).sort((a, b) => +a.label.split('/').pop()! - +b.label.split('/').pop()!);
  return Promise.all(res.map(async (x) => {
    if (read) return { label: x.label, img: await read(x.sha) };
    const blob = await db.getBlob(x.sha);
    if (!blob) throw new Error(`result ${x.label} missing in storage`);
    return { label: x.label, img: await decodePng(blob) };
  }));
}
const kp4 = (label: string, x: number, y: number): Keypoint => ({ label, x: +x.toFixed(4), y: +y.toFixed(4) });
/** Validate original measurements before rounding/reordering can hide invalid values or duplicate labels. */
export function checkedKeypoints(raw: unknown): Keypoint[] | undefined {
  if (!hasAll(raw as Keypoint[])) return undefined;
  const points = raw as Keypoint[];
  return LABELS.map((label) => { const p = points.find((k) => k.label === label)!; return kp4(label, p.x, p.y); });
}
/** Check all present managed references before any missing-reference estimates or paid animations begin. */
export function managedRestKeypoints(refs: unknown, directions: readonly DirectionName[]): Partial<Record<DirectionName, Keypoint[]>> {
  const out: Partial<Record<DirectionName, Keypoint[]>> = {};
  if (refs == null) return out; // optional/untyped containers can be unavailable, not malformed coordinates
  for (const d of directions) {
    const invalid = () => new Error(`${d}: PixelLab returned incomplete or invalid standing joints. Animation was not started from these joints; existing results are kept.`);
    if (!refs || typeof refs !== 'object' || Array.isArray(refs)) throw invalid();
    if (!Object.hasOwn(refs, d)) continue; // a wholly absent reference retains the bounded estimate fallback
    const ref = (refs as Record<string, unknown>)[d];
    if (ref == null) continue;
    if (!ref || typeof ref !== 'object' || Array.isArray(ref)) throw invalid();
    const raw = (ref as { keypoints?: unknown }).keypoints;
    if (raw == null) continue;
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) throw invalid();
    const points = checkedKeypoints(LABELS.map((label) => {
      const p = (raw as Record<string, { x?: unknown; y?: unknown } | null>)[label];
      return { label, x: p?.x, y: p?.y };
    }));
    if (!points) throw invalid();
    out[d] = points;
  }
  return out;
}
/** estimate-skeleton (deterministic, 0.1 gen, cached by request) -> API keypoints in LABELS order; undefined on failure. */
export async function joints(im: Img, resumeSafe = true, signal?: AbortSignal, activityScope?: string): Promise<Keypoint[] | undefined> {
  try {
    const measure = async () => {
      const input = skeletonInput(im);
      const r = await run(routes.estimateSkeleton(png(await b64(input.image))), 'Finding joints', 'm2-skel', true, resumeSafe, signal, activityScope);
      const points = checkedKeypoints((r.response as { keypoints?: unknown } | undefined)?.keypoints);
      return points ? checkedKeypoints(unpadSkeleton(points, input, im)) : undefined;
    };
    const recovery = signal ? measurementRecoveries.get(signal) : undefined;
    if (!recovery) return await measure();
    const before = recovery.tail;
    let release!: () => void;
    recovery.tail = new Promise<void>(resolve => { release = resolve; });
    await before;
    try { signal?.throwIfAborted(); return await measure(); }
    finally { release(); }
  } catch (e) { if (resumeSafe) throw e; return undefined; }
}

/** A malformed managed reference must fall back to estimation, never become a fabricated/clamped pose. */
export function managedPose(points?: Record<string, { x: number; y: number }>): Keypoint[] | undefined {
  const pose = LABELS.map(label => ({ label, x: points?.[label]?.x, y: points?.[label]?.y })) as Keypoint[];
  return hasAll(pose) ? pose.map(k => kp4(k.label, k.x, k.y)) : undefined;
}
// ---------- one clip-direction: raw skeleton-v3 on the rest view + structural checks + observations ----------
interface ClipJob { anim: string; dir: Direction; rest: Img; restKps: Keypoint[]; keypoints: Keypoint[][]; looks: string; seed: number; name: string; tick: () => void; view?: Manifest['rig']['view']; activityScope?: string; signal?: AbortSignal; unarmed?: boolean; paletteRepair?: boolean; authored?: boolean }
interface ClipOut { frames: Img[]; measured: (Keypoint[] | undefined)[]; qa: ClipQa; recs: JobRec[]; processing?: ClipSource['processing'] }
async function renderClip(j: ClipJob): Promise<ClipOut> {
  const restB64 = await b64(j.rest), recs: JobRec[] = [];
  for (let attempt = 0; attempt < (j.paletteRepair ? 1 : CLIP_ATTEMPTS); attempt++) { // Only empty output or a wrong frame count may retry with a new seed.
    const r = await run(rawClip({ first: restB64, rest: j.restKps, keypoints: j.keypoints, description: j.looks, action: actionOf(j.anim) + (j.unarmed ? ', empty hands, no weapon, no props, no effects' : ''), dir: j.dir, seed: j.seed + attempt * 7919, view: j.view }),
      `${j.name} · ${j.anim} ${j.dir}${attempt ? ' (re-roll)' : ''}`, 'studio-rig', false, true, j.signal, j.activityScope);
    recs.push(r);
    j.tick();
    const outs = await imagesOf(r);
    if (outs.length !== j.keypoints.length) continue;
    const normalized = outs.map(o => normalize(o.img, j.rest.w, j.rest.h, 128, j.rest.w));
    if (normalized.some(n => n.cutPx)) throw new Error(`${j.anim} ${j.dir}: animation exceeds the ${j.rest.w} px frame. Increase Frame or reduce Body size before creating again.`);
    const rawFrames = normalized.map(n => n.img);
    // Empty art is a rendering failure; do not pay to estimate joints on it. One art re-roll is allowed.
    if (rawFrames.some(f => !opaqueBox(f))) continue;
    const candidate = j.paletteRepair ? await paletteCandidate(j.anim, j.dir, j.rest, rawFrames, j.keypoints, 0) : { frames: rawFrames };
    const frames = candidate.frames;
    // Observation failures retain the generated art. Never re-roll it or silently freeze an incomplete rig.
    const measured = await Promise.all(frames.map(async (f) => { const k = await joints(f, true, j.signal, j.activityScope); j.tick(); return k; }));
    if (measured.some(k => !hasAll(k))) throw new Error(`${j.anim} ${j.dir}: valid joints were not found on every frame. Generated images are retained in Activity; setup stopped without redrawing them.`);
    const qa = clipQa({ anim: j.anim, rest: j.rest, frames, requested: j.keypoints, measured, stray: 0, disconnectedPixels: frames.reduce((sum, f) => sum + bodyComponents(f).detachedPixels, 0), ...(j.authored ? {} : { facing: { dir: j.dir, rest: j.restKps } }) });
    return { frames, measured, qa, recs, ...('processing' in candidate ? { processing: candidate.processing } : {}) };
  }
  throw new Error(`${j.anim} ${j.dir}: PixelLab returned empty frames or the wrong number of frames`);
}

async function measurementInput(frame: Img) {
  const input = skeletonInput(frame);
  return { input, hash: (await requestIdentity(routes.estimateSkeleton(png(await b64(input.image))))).requestHash };
}
/** A palette repair is available only after complete original measurements prove every other body gate passed. */
async function paletteCandidate(anim: string, dir: DirectionName, rest: Img, frames: Img[], requested: Keypoint[][], stray: number, review?: RecoveryContext): Promise<{ frames: Img[]; processing?: ClipSource['processing'] }> {
  const jobs = review?.jobs ?? queue.snapshot().jobs;
  const measured = await Promise.all(frames.map(async frame => {
    const { input, hash } = await (review?.measurement(frame) ?? measurementInput(frame));
    const record = jobs.find(r => r.requestHash === hash && r.state === 'done');
    const points = record && checkedKeypoints((record.response as { keypoints?: unknown })?.keypoints);
    return points ? checkedKeypoints(unpadSkeleton(points, input, frame)) : undefined;
  }));
  if (measured.some(k => !hasAll(k))) throw new RecoveryUnavailable(`${dir}: match body colors only after all original joint checks have completed.`);
  const rawQa = clipQa({ anim, rest, frames, requested, measured, stray });
  if (rawQa.paletteFit >= RIG_GATES.paletteFit) return { frames }; // already-good views are bit-for-bit unchanged
  // Observations no longer trigger redraws, but an explicit palette-only repair still requires other checks to pass.
  if (rawQa.fails.length || rawQa.adherence === null || rawQa.adherence > RIG_GATES.adherence || rawQa.feetDrift > RIG_GATES.silhouetteBottomDelta || rawQa.border > RIG_GATES.border) throw new RecoveryUnavailable(`${dir}: color matching cannot repair pose, feet or border failures.`);
  let fixed: ReturnType<typeof repairBodyPalette>;
  try { fixed = repairBodyPalette(rest, frames); }
  catch (error) {
    if (error instanceof PaletteRepairUnavailable) throw new RecoveryUnavailable(error.message);
    throw error;
  }
  if (!fixed.changedPixels) throw new RecoveryUnavailable(`${dir}: the color drift is outside the bounded reference-palette repair.`);
  if (fixed.paletteFit < RIG_GATES.paletteFit) throw new RecoveryUnavailable(`${dir}: bounded color matching still fails the palette quality check. No new joint checks were started.`);
  return { frames: fixed.frames, processing: { version: 'near-rest-v1', rawPaletteFit: fixed.rawPaletteFit, rawOutliers: fixed.rawOutliers,
    changedPixels: fixed.changedPixels, remainingOutliers: fixed.remainingOutliers, changedFrames: fixed.changedFrames,
    rawInputHashes: await Promise.all(frames.map(async f => `sha256:${await sha256(await encodePngBytes(f))}` as Sha256)),
    inputHashes: await Promise.all(fixed.frames.map(async f => `sha256:${await sha256(await encodePngBytes(f))}` as Sha256)) } };
}

/** Managed motion source on the rest character -> frames on the 64 cell -> estimated keypoint sequence. */
async function motion(req: Req, dir: Direction, label: string, tick: () => void, signal?: AbortSignal, activityScope?: string, size = CELL): Promise<Keypoint[][]> {
  const r = await run(req, label, 'studio-rig', false, true, signal, activityScope);
  tick();
  const got = (r.response as SubmitResponse | undefined)?.directions;
  if (got && !got.includes(dir)) throw new Error(`${label}: PixelLab dropped the direction (busy). Try again.`); // S4 truncation
  const frames = (await imagesOf(r)).map((o) => {
    const normalized = normalize(o.img, size, size, 128, size);
    if (normalized.cutPx) throw new Error(`${label}: motion exceeds the ${size} px frame. Increase Frame or reduce Body size before creating again.`);
    return normalized.img;
  });
  if (frames.some(f => !opaqueBox(f))) throw new Error(`${label}: PixelLab returned an empty motion frame`);
  const kps = await Promise.all(frames.map(async (f) => { const k = await joints(f, true, signal, activityScope); tick(); return k; }));
  if (kps.some((k) => !k)) throw new Error(`${label}: joints not found on every frame`);
  if (kps.length < 3 || kps.length > 15) throw new Error(`${label}: ${kps.length} frames (skeleton-v3 takes 3-15)`);
  return kps as Keypoint[][];
}

export const provOf = (r: JobRec, produced: CellKey[] = []): Provenance => {
  const params = r.params as Record<string, unknown>;
  return {
    endpoint: r.endpoint, params, seed: (params.seed as number) ?? 0, requestHash: `sha256:${r.requestHash}`, jobId: r.jobs[0]?.id,
    usage: { generations: r.gens, usd: r.usd }, createdAt: new Date(r.submittedAt ?? r.createdAt).toISOString(), produced,
  };
};
const putCell = async (h: Sha256, im: Img) => { if (!(await db.getBlob(h.slice(7)))) await db.put('blobs', h.slice(7), new Blob([(await encodePngBytes(im)) as Uint8Array<ArrayBuffer>], { type: 'image/png' })); };
const warn = (clip: string, qa: ClipQa) => [...qa.fails, ...(qa.warnings ?? [])].map((f) => `${clip}: ${f}`);

/** A published attempt is authoritative even after its user changes outfits, equipment, name or body moves. */
async function completedCreation(id: string, creationSpec: string): Promise<StoredProject | undefined> {
  const saved = await db.get<StoredProject>('projects', id);
  if (saved && saved.creationSpec !== creationSpec) throw new Error('This creation identity belongs to another saved character. Start a new character to keep both.');
  return saved;
}

/** Insert-only publication. Concurrent/recovered completion can never replace an already customized character. */
export async function publishCreatedCharacter(rec: StoredProject, images: Map<Sha256, Img>): Promise<string> {
  if (!rec.creationSpec) throw new Error('This creation attempt has no saved fingerprint.');
  const blobs = new Map<string, Blob>();
  for (const [hash, im] of images) blobs.set(hash.slice(7), new Blob([(await encodePngBytes(im)) as Uint8Array<ArrayBuffer>], { type: 'image/png' }));
  try { await db.putCharacter(rec.id, rec, blobs); }
  catch (error) {
    if (!(await completedCreation(rec.id, rec.creationSpec))) throw error;
  }
  return rec.id;
}

export interface Progress { step: string; done: number; total: number; recIds: string[] }

/** Creation = draw -> padded standing views -> re-import -> rest keypoints -> a Default-only rig (no animation calls).
 * `onViews` receives the standing views of the chosen directions as soon as the draw is normalized. */
export async function createCharacter(spec: CreateSpec, onProgress: (p: Progress) => void = () => {}, onViews: (views: { id: DirectionName; img: Img }[]) => void = () => {}): Promise<string> {
  const projectId = spec.projectId ?? `rig-${crypto.randomUUID()}`;
  if (!/^rig-[a-z0-9-]+$/.test(projectId)) throw new Error('This creation attempt has an invalid project identity. Start a new character.');
  const cell = spec.frame ?? CELL, directions = creationDirections(spec), DIRS = directions.filter(d => !d.mirrorOf).map(d => d.id);
  const errors = [...facingErrors(directions), ...(spec.frame !== undefined ? sizeErrors(spec.size, cell) : []),
    ...(spec.frame === undefined && !validBodySize(spec.size) ? ['Body size must be 32–256 pixels in 4 px steps.'] : []),
    ...(!spec.description.trim() || spec.description.length > 2000 ? ['Enter a prompt of 1–2,000 characters.'] : []),
    ...(!Number.isSafeInteger(spec.seed) || spec.seed < 0 || spec.seed > Number.MAX_SAFE_INTEGER - 100_000 ? ['Invalid seed.'] : []),
    ...(spec.view && !['low top-down', 'high top-down', 'side'].includes(spec.view) ? ['Invalid camera.'] : [])];
  if (errors.length) throw new Error(errors.join(' '));
  const creationSpec = await sha256(stableStringify({ ...spec, projectId: undefined, activityScope: undefined }));
  if (await completedCreation(projectId, creationSpec)) return projectId; // completion may have committed before its UI acknowledgment
  const looks = creationLooks(spec), view = spec.view ?? 'low top-down';
  const modern = !!spec.exactPrompt || spec.frame !== undefined || spec.directions !== undefined;
  // 1. base character, text only (8 rotations)
  onProgress({ step: 'draw', done: 0, total: 1, recIds: [] });
  const base = await run(routes.createCharacterV3({ description: spec.exactPrompt ? spec.description : basePrompt(spec.description), image_size: { width: spec.size, height: spec.size }, view, template_id: 'mannequin', seed: spec.seed, no_background: true }), `${spec.name} · creating`, 'studio-base', false, true, undefined, spec.activityScope);

  // 2. selected original rotations on the 64 cell; legacy western views are flips. Re-import for rest keypoints.
  onProgress({ step: 'rest', done: 0, total: 1, recIds: [] });
  const rots = await imagesOf(base), rest = {} as Record<DirectionName, Img>, restWarnings: string[] = [];
  let pad: [number, number] = [0, 0];
  for (const d of DIRECTIONS) {
    const r = rots.find((x) => x.label === d);
    if (!r) throw new Error(`PixelLab returned no ${d} view`);
    const n = normalize(r.img, cell, cell);
    if (n.cutPx) throw new Error(`The ${d} view does not fit the ${cell} px frame. Increase Frame or reduce Body size before creating again.`);
    const top = opaqueBox(n.img)?.y0 ?? cell;
    if (!opaqueBox(n.img)) throw new Error(`PixelLab returned an empty ${d} view.`);
    if ((modern || DIRS.includes(d)) && top < HEADROOM_MIN) restWarnings.push(`${d}: standing headroom ${top} px; tall hair or hats may need a larger frame`);
    rest[d] = n.img;
    pad = n.offset;
  }
  onViews(directions.map(d => ({ id: d.id, img: d.mirrorOf ? flipH(rest[d.mirrorOf]) : rest[d.id] })));
  // Register all eight ORIGINAL views, including south when it isn't selected. Never overwrite these with mirrors.
  const registered = modern ? rest : Object.fromEntries(directions.map(d => [d.id, d.mirrorOf ? flipH(rest[d.mirrorOf]) : rest[d.id]])) as Record<DirectionName, Img>;
  const others = Object.fromEntries(await Promise.all((Object.keys(registered) as Direction[]).filter((d) => d !== 'south').map(async (d) => [d, png(await b64(registered[d]))])));
  const imp = await run(routes.createCharacterV3({ description: looks, reference_image: png(await b64(registered.south)), direction_images: others, n_directions: modern ? 8 : spec.dirs ?? 4, view, template_id: 'mannequin', no_background: true, seed: spec.seed }), `${spec.name} · rest views`, 'studio-base', false, true, undefined, spec.activityScope);
  const charId = (imp.response as { character_id?: string })?.character_id;
  if (!charId) throw new Error('PixelLab did not return a character ID');
  const ch = await run(routes.getCharacter(charId), `${spec.name} · skeleton`, 'studio-base', true, false, undefined, spec.activityScope);
  const refs = (ch.response as { skeletons?: { '2d_references'?: Record<string, { keypoints?: Record<string, { x: number; y: number }> }> } })?.skeletons?.['2d_references'];
  const restKps = {} as Record<DirectionName, Keypoint[]>, managed = managedRestKeypoints(refs, DIRS);
  for (const d of DIRS) {
    const kps = managed[d] ?? (await joints(rest[d], true, undefined, spec.activityScope)); // only absent references use the existing bounded estimate fallback
    if (!hasAll(kps)) throw new Error(`no valid joints found on the ${d} view`);
    restKps[d] = kps!;
  }

  // 3. freeze the Default move: one standing frame per direction, posed by its own rest keypoints (`imported-rest`, so items
  // reuse their dressed standing view for it). Idle, walk and other moves are added from Moves through addMove.
  onProgress({ step: 'save', done: 0, total: 1, recIds: [] });
  const built = await buildRig([{ id: DEFAULT_MOVE, dirs: Object.fromEntries(DIRS.map((d) => [d, [rest[d]]])) }], { size: cell, directions });
  if (!modern) assertCreatedDirections(built.rig, spec.dirs, spec.directionPolicy);
  if (built.errors.length) throw new Error(`The standing views do not fit together: ${built.errors.slice(0, 3).join('; ')}`);
  const rig = built.rig;
  rig.view = view;
  rig.template = 'mannequin';
  rig.pad = { x: pad[0], y: pad[1] };
  const provenance: Provenance[] = [provOf(base), provOf(imp)];
  rig.rest = {};
  for (const d of DIRS) rig.rest[d] = { image: await cellHash(rest[d]), keypoints: restKps[d] };
  // Retain unselected originals for a future account reconnection, without estimating unused joints or animating them.
  if (modern) for (const d of DIRECTIONS.filter(d => !DIRS.includes(d))) {
    rig.rest[d] = { image: await cellHash(rest[d]), keypoints: managedPose(refs?.[d]?.keypoints) ?? [] };
  }
  const anim = rig.animations[0];
  anim.sources = Object.fromEntries(DIRS.map((d) => [d, { route: 'v3', reference: rig.rest![d]!.image, keypoints: [restKps[d]], measured: [restKps[d]], motion: 'imported-rest', provenance: [0, 1] } satisfies ClipSource]));
  const skel: Record<string, Skeleton> = {};
  for (const d of DIRS) skel[built.cells[cellKey(DEFAULT_MOVE, d, 0)].hash] = fromApi(restKps[d], rig.cell);
  const tracks = anchorTracks(built, skel);
  rig.anchors = tracks.anchors;
  const cells: Record<string, Partial<Record<DirectionName, Sha256[]>>> = {};
  const skeletons: Record<string, Skeleton> = {};
  for (const k of cellKeys(rig)) {
    const [a, d, i] = k.split('/') as [string, DirectionName, string], c = built.cells[k];
    ((cells[a] ??= {})[d] ??= [])[+i] = c.hash;
    const s = c.mirrorOf ? skel[built.cells[cellKey(a, c.mirrorOf, +i)].hash] : skel[c.hash];
    if (s) skeletons[k] = c.mirrorOf ? flipSkeleton(s, cell) : s;
  }
  const errs = validateRig(rig, Object.fromEntries(Object.entries(built.cells).map(([key, c]) => [key, c.hash])));
  if (errs.length) throw new Error(`rig not valid: ${errs.join('; ')}`);
  const manifest: Manifest = {
    format: CURRENT_FORMAT, name: spec.name, app: 'PixelDoll 0.1.0', rig, materials: [],
    slots: [{ id: 'body', z: 10, class: 'base', required: true }],
    items: [{ id: 'base', name: 'Base body', slot: 'body', status: 'accepted', mirror: rig.directions.some((d) => d.mirrorOf) ? 'flip' : 'generate', materials: [], prompt: spec.description, baseHash: rig.baseHash, layers: [{ id: 'main', role: 'fg', z: 10, cells }], provenance }],
    presets: [{ id: 'default', name: 'Base', items: { body: 'base' }, variants: {} }],
  };
  const rec: StoredProject = {
    id: projectId, creationSpec, savedAt: new Date().toISOString(), manifest, skeletons, character: { id: charId, looks }, origin: 'studio',
    rigQa: { warnings: [...restWarnings, ...built.warnings], pivotFrom: built.pivotFrom, clips: {}, tracks: tracks.stats.map(({ points: _, ...t }) => t) },
  };
  const images = new Map<Sha256, Img>(Object.values(built.cells).map((c) => [c.hash, c.img]));
  for (const d of Object.keys(rig.rest) as DirectionName[]) images.set(rig.rest[d]!.image, rest[d]);
  await publishCreatedCharacter(rec, images);
  db.askPersist();
  return rec.id;
}

// ---------- add a move ----------
/** `replace`: re-render an existing clip (B9: the Ranger's managed idle -> authored idle) and re-pose `items` onto it. */
/** itemsOnly: the caller poses items onto a move the body already has (Make it, item frame repair); finishing changes no move. */
export interface MoveSpec { id: string; action?: string; text?: string; frames: number; items: string[]; sharedItems?: string[]; itemsOnly?: true; seed: number; replace?: boolean; activityScope?: string; dirs?: DirectionName[]; itemMethod?: 'grid'; poseStyle?: 'visible-side-v1'; measurementRecovery?: { id: string; recordIds: string[]; checkHashes: string[]; rigVersion: string }; bodyPaletteRepair?: { id: string; version: 'near-rest-v1'; checkHashes: string[]; rigVersion: string } }
const recoverySpecHash = (spec: MoveSpec) => sha256(stableStringify({ ...spec, measurementRecovery: undefined, activityScope: undefined }));
function approvedCheckHashes(value: unknown): Set<string> {
  const invalid = () => new Error('The reviewed joint-check hashes are invalid. Review the body frames and cost again.');
  if (!Array.isArray(value)) throw invalid();
  const hashes = new Set<string>();
  for (const hash of value) {
    if (typeof hash !== 'string' || !/^[a-f0-9]{64}$/.test(hash) || hashes.has(hash)) throw invalid();
    hashes.add(hash);
  }
  return hashes;
}
function approvedMeasurementIds(intent: unknown): string[] | undefined {
  if (intent === undefined) return undefined;
  const invalid = () => new Error('The joint-check recovery intent is invalid.');
  if (!intent || typeof intent !== 'object' || Array.isArray(intent)) throw invalid();
  const value = intent as Partial<NonNullable<MoveSpec['measurementRecovery']>>;
  if (typeof value.id !== 'string' || !value.id.trim() || typeof value.rigVersion !== 'string' || !value.rigVersion || !Array.isArray(value.recordIds)) throw invalid();
  const seen = new Set<string>();
  for (const id of value.recordIds) {
    if (typeof id !== 'string' || !id.trim() || seen.has(id)) throw invalid();
    seen.add(id);
  }
  approvedCheckHashes(value.checkHashes);
  return value.recordIds;
}
function checkedPaletteIntent(intent: unknown, checkHashes = true): void {
  if (intent === undefined) return;
  if (!intent || typeof intent !== 'object' || Array.isArray(intent)) throw new Error('The body color-repair intent is invalid.');
  const value = intent as Partial<NonNullable<MoveSpec['bodyPaletteRepair']>>;
  if (value.version !== 'near-rest-v1' || typeof value.id !== 'string' || !value.id.trim() || typeof value.rigVersion !== 'string' || !value.rigVersion) throw new Error('This character or color-repair policy changed since review.');
  if (checkHashes) approvedCheckHashes(value.checkHashes);
}
/** A completed body publication can outlive failed equipment work; only its exact durable receipt permits resuming. */
async function publishedMoveRecovery(rec: StoredProject, spec: MoveSpec): Promise<boolean> {
  const receipt = rec.moveRecovery, intent = spec.measurementRecovery ?? spec.bodyPaletteRepair;
  return !!intent && !!receipt && receipt.id === intent.id && receipt.originalRigVersion === intent.rigVersion &&
    receipt.specHash === await recoverySpecHash(spec) && receipt.bodyRigVersion === moveRigVersion(rec);
}
export const MOVE_STEPS = [
  { id: 'animate', label: 'Animating the body' },
  { id: 'items', label: 'Posing your items' },
  { id: 'save', label: 'Saving' },
];
export const isV13 = rigReady;
/** Why a move can't take this id: Default is every character's standing views, never generated or replaced. */
export const reservedMove = (id: string) => (id === DEFAULT_MOVE ? 'Default is the standing pose. Name the move something else.' : '');
const genDirs = (m: Manifest) => m.rig.directions.filter((d) => !d.mirrorOf).map((d) => d.id);
/** Explicit subsets name authored views; mirrored children are handled at publication. */
export function moveDirections(m: Manifest, dirs?: readonly DirectionName[]): DirectionName[] {
  const all = genDirs(m);
  if (dirs === undefined) return all;
  if (!dirs.length || new Set(dirs).size !== dirs.length || dirs.some(d => !all.includes(d))) throw new Error('Choose one or more independently drawn directions for this move.');
  return all.filter(d => dirs.includes(d));
}
interface BodyPaletteStats { directions: DirectionName[]; changedPixels: number; rawOutliers: number; remainingOutliers: number; changedFrames: number }
export interface MeasurementRecoveryPlan { recordIds: string[]; checkHashes: string[]; checks: number; gens: number; usd: number; rigVersion: string; rawHashes: string[]; palette?: BodyPaletteStats }
export interface BodyPaletteRepairPlan extends MeasurementRecoveryPlan, BodyPaletteStats { itemGens: number }
/** An expected eligibility limit, distinct from a failed storage read or malformed PNG. */
class RecoveryUnavailable extends Error {}
/** Review only the selected standing views and exact cached results, never unrelated equipment sheets. */
async function recoveryContext(projectId: string) {
  const rec = await db.get<StoredProject>('projects', projectId);
  if (!rec) throw new Error(`project ${projectId} not found`);
  const images = new Map<string, Promise<Img>>(), normalized = new WeakMap<Img, ReturnType<typeof normalize>>();
  const encoded = new WeakMap<Img, Promise<string>>(), measurements = new WeakMap<Img, ReturnType<typeof measurementInput>>();
  return {
    rec, jobs: queue.snapshot().jobs,
    read(sha: string): Promise<Img> {
      let image = images.get(sha);
      if (!image) {
        image = db.getBlob(sha).then(blob => {
          if (!blob) throw new Error(`Cached recovery image ${sha.slice(0, 12)} is missing in storage.`);
          return decodePng(blob);
        });
        images.set(sha, image);
      }
      return image;
    },
    normalize(image: Img) {
      let value = normalized.get(image);
      if (!value) { value = normalize(image, rec.manifest.rig.cell.w, rec.manifest.rig.cell.h, 128, rec.manifest.rig.cell.w); normalized.set(image, value); }
      return value;
    },
    encode(image: Img) {
      let value = encoded.get(image);
      if (!value) { value = b64(image); encoded.set(image, value); }
      return value;
    },
    measurement(image: Img) {
      let value = measurements.get(image);
      if (!value) { value = measurementInput(image); measurements.set(image, value); }
      return value;
    },
  };
}
type RecoveryContext = Awaited<ReturnType<typeof recoveryContext>>;
export interface MoveRecoveryReview { recovery?: MeasurementRecoveryPlan; colorRepair?: BodyPaletteRepairPlan; unavailable?: string }
/** One local review owns its memoized images. Reopening or executing always reads and validates fresh state. */
export async function reviewMoveRecovery(projectId: string, spec: MoveSpec): Promise<MoveRecoveryReview> {
  if (!spec.replace || spec.itemMethod || !spec.action || !ACTIONS[spec.action] || !spec.dirs?.length) return {};
  const context = await recoveryContext(projectId);
  if (await publishedMoveRecovery(context.rec, spec)) return {};
  // A new review grants no consent. Reconstruct the candidate against current inputs, keeping the exact color policy.
  const inspection = { ...spec, measurementRecovery: undefined,
    bodyPaletteRepair: spec.bodyPaletteRepair && { ...spec.bodyPaletteRepair, rigVersion: moveRigVersion(context.rec) } };
  try {
    const plan = await inspectMeasurementRecovery(context, inspection, true);
    if (plan.checks && plan.recordIds.length) return { recovery: plan };
    if (plan.checks) return { unavailable: 'Cached frames have no failed joint checks to retry.' };
    if (spec.bodyPaletteRepair) return { recovery: plan };
    const colorRepair = await inspectBodyPaletteRepair(context, inspection);
    return colorRepair ? { colorRepair } : spec.measurementRecovery ? { recovery: plan } : {};
  } catch (error) {
    if (error instanceof RecoveryUnavailable) return { unavailable: error.message };
    throw error;
  }
}
/** Preview the fixed, versioned color repair against cached raw art; no body or joint request is sent. */
export async function bodyPaletteRepairPlan(projectId: string, spec: MoveSpec): Promise<BodyPaletteRepairPlan> {
  const plan = await inspectBodyPaletteRepair(await recoveryContext(projectId), spec);
  if (!plan) throw new RecoveryUnavailable('No palette-only body failure can be matched safely.');
  return plan;
}
async function inspectBodyPaletteRepair(context: RecoveryContext, spec: MoveSpec): Promise<BodyPaletteRepairPlan | undefined> {
  const { rec } = context;
  const plan = await inspectMeasurementRecovery(context, { ...spec, measurementRecovery: undefined,
    bodyPaletteRepair: { id: 'palette-review', version: 'near-rest-v1', checkHashes: [], rigVersion: moveRigVersion(rec) } }, true);
  if (!plan.palette?.directions.length) return undefined;
  if (plan.recordIds.length) throw new RecoveryUnavailable('Review unknown joint-check outcomes before matching these body colors.');
  return { ...plan, ...plan.palette, itemGens: poseGens(spec.items.filter(id => !rec.manifest.items.find(item => item.id === id)?.design).length, moveFrames(rec.manifest, spec), moveDirections(rec.manifest, spec.dirs).length) };
}
/** API-free review of exact cached body renders. Consent never applies to an unrelated image or regenerated body. */
export async function measurementRecoveryPlan(projectId: string, spec: MoveSpec): Promise<MeasurementRecoveryPlan> {
  return inspectMeasurementRecovery(await recoveryContext(projectId), spec);
}
async function inspectMeasurementRecovery(context: RecoveryContext, spec: MoveSpec, reviewOnly = false): Promise<MeasurementRecoveryPlan> {
  const { rec, jobs } = context;
  const rig = rec.manifest.rig, rigVersion = moveRigVersion(rec);
  if (!spec.replace || spec.itemMethod || !spec.action || !ACTIONS[spec.action] || !spec.dirs?.length) throw new RecoveryUnavailable('Joint-check recovery needs the original authored body-repair settings.');
  const approved = reviewOnly ? undefined : approvedMeasurementIds(spec.measurementRecovery);
  checkedPaletteIntent(spec.bodyPaletteRepair, !reviewOnly);
  const intent = spec.measurementRecovery ?? spec.bodyPaletteRepair;
  const allowed = !reviewOnly && intent ? approvedCheckHashes(intent.checkHashes) : undefined;
  if (spec.bodyPaletteRepair && (spec.bodyPaletteRepair.version !== 'near-rest-v1' || !spec.bodyPaletteRepair.id || spec.bodyPaletteRepair.rigVersion !== rigVersion)) throw new Error('This character or color-repair policy changed since review.');
  if (spec.measurementRecovery && spec.measurementRecovery.rigVersion !== rigVersion) throw new Error('This character changed since these joint checks were reviewed.');
  const seen = new Set<string>(), needed = new Set<string>(), recordIds = new Set<string>(), rawHashes: string[] = [];
  const palette: BodyPaletteStats = { directions: [], changedPixels: 0, rawOutliers: 0, remainingOutliers: 0, changedFrames: 0 };
  for (const d of moveDirections(rec.manifest, spec.dirs)) {
    const rest = rig.rest?.[d];
    if (!rest || !hasAll(rest.keypoints)) throw new Error(`${d}: original standing artwork or joints are missing.`);
    const restImg = await context.read(rest.image.slice(7));
    const keypoints = authoredPoses(spec.action, fromApi(rest.keypoints, rig.cell), d, rig.cell.w, spec.poseStyle).map(p => toApi(p, rig.cell));
    for (let attempt = 0; attempt < (spec.bodyPaletteRepair ? 1 : CLIP_ATTEMPTS); attempt++) {
      const req = rawClip({ first: await context.encode(restImg), rest: rest.keypoints, keypoints, description: rec.character!.looks,
        action: actionOf(spec.id) + (spec.poseStyle === 'visible-side-v1' ? ', empty hands, no weapon, no props, no effects' : ''), dir: d,
        seed: spec.seed + 101 + attempt * 7919, view: rig.view });
      const rawHash = (await requestIdentity(req)).requestHash;
      const raw = jobs.find(r => r.requestHash === rawHash && r.state === 'done');
      if (!raw) { if (!attempt) throw new RecoveryUnavailable(`${d}: the original completed body render is unavailable. No body was regenerated.`); break; }
      const outputs = await imagesOf(raw, context.read);
      if (outputs.length !== keypoints.length || outputs.some(o => !o.img.w || !o.img.h)) throw new Error(`${d}: the cached body render is incomplete.`);
      rawHashes.push(rawHash);
      const normalized = outputs.map(out => context.normalize(out.img));
      if (normalized.some(n => n.cutPx || !opaqueBox(n.img))) throw new Error(`${d}: the cached body frames do not fit this character. No body was regenerated.`);
      const frames = normalized.map(n => n.img);
      const candidate = spec.bodyPaletteRepair ? await paletteCandidate(spec.id, d, restImg, frames, keypoints, 0, context) : { frames };
      if ('processing' in candidate && candidate.processing) {
        palette.directions.push(d); palette.changedPixels += candidate.processing.changedPixels; palette.rawOutliers += candidate.processing.rawOutliers;
        palette.remainingOutliers += candidate.processing.remainingOutliers; palette.changedFrames += candidate.processing.changedFrames.length;
      }
      for (const frame of candidate.frames) {
        const { input, hash } = await context.measurement(frame);
        if (seen.has(hash)) continue;
        seen.add(hash);
        const matches = jobs.filter(r => r.requestHash === hash).reverse().sort((a,b) => b.createdAt-a.createdAt);
        const reviewed = approved ? matches.filter(r => approved.includes(r.id)) : [];
        for (const old of reviewed) { if (!retryableEstimate(old)) throw new Error('A reviewed joint check is no longer eligible for explicit recovery.'); recordIds.add(old.id); }
        const done = matches.find(r => r.state === 'done');
        if (done) {
          const points = checkedKeypoints((done.response as {keypoints?:unknown})?.keypoints);
          if (!points || !checkedKeypoints(unpadSkeleton(points, input, frame))) throw new Error('A completed joint check has invalid measurements.');
          continue;
        }
        const active = matches.find(live);
        if (active) {
          if (!spec.measurementRecovery || active.estimateRecovery?.id !== spec.measurementRecovery.id) throw new RecoveryUnavailable('Wait for the current joint checks to finish before recovering them.');
          needed.add(hash); continue;
        }
        const latest = matches[0];
        if (latest) {
          if (spec.measurementRecovery && latest.estimateRecovery?.id === spec.measurementRecovery.id) { needed.add(hash); continue; }
          if (!retryableEstimate(latest) || (approved && !approved.includes(latest.id))) throw new Error('A joint-check outcome changed. Review the exact checks again before retrying.');
          recordIds.add(latest.id);
        }
        needed.add(hash);
      }
    }
  }
  if (approved && (recordIds.size !== approved.length || approved.some(id => !recordIds.has(id)))) throw new Error('The reviewed joint checks do not match these exact cached body frames.');
  if (approved && !approved.length && needed.size) throw new Error('Cached body reuse requires completed joint checks. Review the unfinished checks before continuing.');
  if (allowed && [...needed].some(hash => !allowed.has(hash))) throw new Error('The pending joint checks changed. Review their exact frames and cost again.');
  return { recordIds: [...recordIds].sort(), checkHashes: [...needed].sort(), checks: needed.size, gens: +(needed.size * EST).toFixed(2), usd: +(needed.size * .00513).toFixed(5), rigVersion, rawHashes, ...(spec.bodyPaletteRepair ? { palette } : {}) };
}

/** Moves a saved item lacks, e.g. idle and walk added after it was planned on the standing views, as items-only specs (addMove
 * keeps the body clip and poses only these directions, the same request "Make it" sends). Only directions the body has frames
 * and stored keypoints for count (the Default move's standing views are never posed). The user starts them from a priced offer; nothing is queued automatically (credits are real money). */
export function missingItemMoves(m: Manifest, itemId: string, seed = 1 + Math.floor(Math.random() * 1_000_000)): MoveSpec[] {
  const item = posable(m).find((i) => i.id === itemId && !i.design);
  if (!item) return [];
  const { clipDirs } = coverage({ rec: { manifest: m } } as RigCtx);
  const posableDir = (a: RigAnimation, d: DirectionName) => a.sources?.[d]?.motion !== 'imported-rest' && a.sources?.[d]?.keypoints?.length === a.cells;
  return m.rig.animations
    .map((a) => ({ a, dirs: (clipDirs?.[a.id] ?? []).filter((d) => posableDir(a, d) && !item.layers.every((l) => l.cells?.[a.id]?.[d]?.length === a.cells)) }))
    .filter(({ dirs }) => dirs.length)
    .map(({ a, dirs }) => ({ id: a.id, frames: a.cells, items: [item.id], dirs, itemsOnly: true, seed }));
}
/** Every posable item and accepted shared design of a character, as "Add a move" offers them. */
export const moveItems = (m: Manifest) => ({ items: posable(m).filter((i) => !i.design).map((i) => i.id), sharedItems: m.items.filter((i) => i.design && i.status === 'accepted').map((i) => i.id) });
/** The moves creation made before Default-first (authored idle, managed walk), for a one-tap "Add idle + walk". Same request
 * shapes as creation made them (no poseStyle), with the items the character has when the user taps (and is quoted for). */
export function baseMoveSpecs(m: Manifest, seed = 1 + Math.floor(Math.random() * 1_000_000)): MoveSpec[] {
  const have = new Set(m.rig.animations.map((a) => a.id));
  return BASE_ANIMS.filter((a) => !have.has(a.name)).map((a) => ({ id: a.name, action: a.name, frames: a.frames, ...moveItems(m), seed }));
}

/** Frames of a move: the authored table's length, or the text frame count. */
export const moveFrames = (m: Manifest, s: Pick<MoveSpec, 'action' | 'frames'>) => {
  const dir = m.rig.directions.find(d => !d.mirrorOf && m.rig.rest?.[d.id])?.id;
  const r = dir && m.rig.rest?.[dir];
  return s.action === 'walk' ? 8 : s.action && ACTIONS[s.action] && r && dir ? authoredPoses(s.action, fromApi(r.keypoints, m.rig.cell), dir, m.rig.cell.w).length : s.frames;
};
export function moveEstimate(m: Manifest, s: Pick<MoveSpec, 'id' | 'action' | 'frames' | 'items' | 'dirs' | 'itemMethod' | 'replace'>) {
  const n = moveFrames(m, s), dirs = moveDirections(m, s.dirs).length, body = s.itemMethod === 'grid' && !s.replace ? 0 : dirs * (poseCallGens(n) + n * EST + (s.action === 'walk' ? 3 + n * EST : s.action ? 0 : 1 + n * EST));
  const directItems = s.items.filter(id => !m.items.find(item => item.id === id)?.design);
  const items = s.itemMethod === 'grid' ? directItems.reduce((sum, id) => {
    const item = m.items.find(i => i.id === id);
    if (!item) throw new Error('The selected equipment is no longer available.');
    const cell = item.layers[0]?.cell ?? m.rig.cell;
    return sum + gridEstimate(cell, n, 1).gens * dirs;
  }, 0) : directItems.reduce((sum, id) => sum + itemPoseGens(m.rig, m.items.find(i => i.id === id)!, s.id, n, moveDirections(m, s.dirs)), 0);
  return { gens: body + items, body, items, frames: n, minutes: 4 + directItems.length * 3 };

}

/**
 * Authored (raw skeleton-v3 with keypoints from the rest pose) or text (pixminimax motion source -> raw re-render) move, then
 * the chosen items posed onto it. Resumable: a body clip already saved is kept, items that already have it are skipped.
 */
export async function addMove(projectId: string, spec: MoveSpec, onProgress: (p: Progress) => void = () => {}): Promise<{ fitIds: string[]; warnings: string[] }> {
  approvedMeasurementIds(spec.measurementRecovery);
  checkedPaletteIntent(spec.bodyPaletteRepair);
  const { rec } = await loadProject(projectId);
  if (!isV13(rec)) throw new Error('Set up this character’s pose rig before adding moves.');
  const dirs = moveDirections(rec.manifest, spec.dirs), existing = rec.manifest.rig.animations.find(a => a.id === spec.id);
  if (spec.itemMethod === 'grid' && !existing) throw new Error('Choose an existing move before repairing its equipment.');
  if (reservedMove(spec.id) && (spec.replace || !existing)) throw new Error(reservedMove(spec.id));
  if (!existing && dirs.length !== genDirs(rec.manifest).length) throw new Error('A new move needs every independently drawn direction.');
  if (existing && dirs.length !== genDirs(rec.manifest).length && existing.cells !== moveFrames(rec.manifest, spec)) throw new Error('A partial repair must keep the existing frame count.');
  const intent = spec.measurementRecovery ?? spec.bodyPaletteRepair;
  const published = await publishedMoveRecovery(rec, spec);
  const recovery = intent && !published ? await measurementRecoveryPlan(projectId, spec) : undefined;
  if (!published && (spec.replace || !existing)) await addBodyClip(projectId, spec, onProgress, recovery);
  // Freeze durable garment-region colors before either direct posing or shared-fit target stamps.
  // saveSplit also advances an exact audit recovery receipt, so interrupted equipment work can resume safely.
  const normalized = await loadProject(projectId), split = await splitBase(normalized.project);
  deriveMaterials(normalized.project);
  if (split.dirty) await saveSplit(projectId, normalized.project.manifest, split);
  const fresh = await loadProject(projectId), frames = fresh.rec.manifest.rig.animations.find(a => a.id === spec.id)!.cells;
  const plans = spec.items.flatMap(id => { const it = fresh.rec.manifest.items.find(i => i.id === id); return it && !it.design ? [{ id, dirs: dirs.filter(d => spec.itemMethod === 'grid' || !it.layers.every(l => l.cells?.[spec.id]?.[d]?.length === frames)) }] : []; });
  const itemTotal = plans.reduce((n, p) => n + p.dirs.length, 0); let posed = 0;
  onProgress({ step: 'items', done: 0, total: itemTotal, recIds: [] });
  const tick = () => onProgress({ step: 'items', done: Math.min(itemTotal, ++posed), total: itemTotal, recIds: [] });
  for (const plan of plans) {
    if (!plan.dirs.length) continue;
    const ctx = await loadProject(projectId), it = ctx.rec.manifest.items.find(i => i.id === plan.id);
    if (!it || it.design) throw new Error('This item changed or was removed while the move was being prepared.');
    if (spec.itemMethod === 'grid') for (const d of plan.dirs) {
      const current = await loadProject(projectId), item = current.rec.manifest.items.find(i => i.id === plan.id);
      if (!item || item.design) throw new Error('This item changed or was removed while the move was being prepared.');
      const result = await regridClip(current, item, spec.id, d, spec.seed); tick();
      if (!result.saved) throw new Error(`${item.name} ${spec.id} ${d}: the repair still fails quality checks. Existing artwork was kept; review Activity before trying again.`);
    }
    else await poseItemClip(ctx, it, spec.id, tick, spec.seed, plan.dirs, spec.activityScope);

  }
  // Shared copies require a separately priced, reviewed candidate. Preparing it never sends a paid request.
  const shared = (await loadProject(projectId)).rec;
  const sharedIds = [...new Set([...(spec.sharedItems ?? []), ...spec.items.filter((id) => shared.manifest.items.find((item) => item.id === id)?.design)])];
  const clipQa = (shared.rigQa as { clips?: Record<string, ClipQa> } | undefined)?.clips ?? {};
  // Include this move's current nested observations, including after resume. Flattened historical notes may be stale.
  const fitIds: string[] = [], warnings: string[] = Object.entries(clipQa).filter(([clip]) => clip.startsWith(`${spec.id}/`)).flatMap(([clip, qa]) => warn(clip, qa));
  for (const id of sharedIds) {
    const item = shared.manifest.items.find((i) => i.id === id);
    if (!item?.design) continue;
    try { fitIds.push((await prepareExtensionFit(projectId, id, { anims: [spec.id], dirs })).id); }
    catch (e) { warnings.push(`${item.name}: ${e instanceof Error ? e.message : 'The equipment fit could not be prepared.'}`); }
  }
  return { fitIds, warnings: [...new Set(warnings)] };
}

async function addBodyClip(projectId: string, spec: MoveSpec, onProgress: (p: Progress) => void, recovery?: MeasurementRecoveryPlan) {
  const { rec, project } = await loadProject(projectId), m = rec.manifest, rig = m.rig;
  const version = moveRigVersion(rec);
  if (recovery && recovery.rigVersion !== version) throw new Error('This character changed since these joint checks were reviewed.');
  const intent = spec.measurementRecovery ?? spec.bodyPaletteRepair;
  const receiptSpecHash = intent ? await recoverySpecHash(spec) : undefined;
  const dirs = moveDirections(m, spec.dirs) as Direction[], affected = affectedMoveDirections(rig, dirs), n = moveFrames(m, spec), name = m.name;
  const motionOffsets = managedMotionOffsets(rec.character, rig.cell.h);
  const total = dirs.length * (1 + n + (spec.action && ACTIONS[spec.action] ? 0 : 1 + n));
  let done = 0;
  const tick = () => onProgress({ step: 'animate', done: Math.min(total, ++done), total, recIds: [] });
  onProgress({ step: 'animate', done: 0, total, recIds: [] });
  const extra: JobRec[][] = [];
  const clips = await parallelGeneration(dirs.map((d, k) => async (signal) => {
    const checkedTick = () => { signal.throwIfAborted(); tick(); };
    const restKps = rig.rest![d]!.keypoints, restImg = project.images.get(rig.rest![d]!.image)!;
    let keypoints: Keypoint[][];
    if (spec.action && ACTIONS[spec.action]) keypoints = authoredPoses(spec.action, fromApi(restKps, rig.cell), d, rig.cell.w, spec.poseStyle).map((p) => toApi(p, rig.cell));
    else {
      const req = routes.animateCharacter(spec.action === 'walk' ? baseAnimation('skeleton-v3', rec.character!.id, BASE_ANIMS.find((a) => a.name === 'walk')!, [d], spec.seed) : { character_id: rec.character!.id, mode: 'pixminimax', action_description: `${spec.text}, unarmed, no weapon, no props, no other people, no effects`, frame_count: n, keep_first_frame: false, animation_name: spec.id, directions: [d], seed: spec.seed });
      keypoints = shiftMotionPoses(await motion(req, d, `${name} · ${spec.id} ${d} (motion)`, checkedTick, signal, spec.activityScope, rig.cell.w), motionOffsets[d] ?? 0, rig.cell.h);
      extra[k] = [(await queue.enqueue(req, { signal })) as JobRec];
    }
    return { d, keypoints, out: await renderClip({ anim: spec.id, dir: d, rest: restImg, restKps, keypoints, authored: !!(spec.action && ACTIONS[spec.action]), looks: rec.character!.looks, seed: spec.seed + 101, name, tick: checkedTick, view: rig.view, signal, activityScope: spec.activityScope, unarmed: spec.poseStyle === 'visible-side-v1', paletteRepair: !!spec.bodyPaletteRepair }) };
  }), spec.seed, recovery && { intent: spec.measurementRecovery ?? { id: spec.bodyPaletteRepair!.id, recordIds: [] }, rawHashes: new Set(recovery.rawHashes), checkHashes: new Set(recovery.checkHashes), tail: Promise.resolve() });

  onProgress({ step: 'save', done: 0, total: 1, recIds: [] });
  const fresh = (await db.get<StoredProject>('projects', projectId))!;
  if (!fresh || moveRigVersion(fresh) !== version) throw new Error('This character changed in another tab while the move was generating. Reopen it before trying again.');
  const fm = fresh.manifest, frig = fm.rig, baseIt = fm.items.find((i) => i.id === frig.baseItem)!;
  const old = frig.animations.find((a) => a.id === spec.id);
  const anim: RigAnimation = { ...old, id: spec.id, cells: n, loop: old?.loop ?? true, frames: old?.cells === n ? old.frames : playlist(n, defaultMs(spec.id)), sources: { ...old?.sources } };
  for (const d of affected) delete anim.sources![d];
  if (spec.dirs && clips.some(({ out: { qa } }) => qa.fails.length || qa.adherence === null || qa.adherence > RIG_GATES.adherence || qa.feetDrift > RIG_GATES.silhouetteBottomDelta || qa.paletteFit < RIG_GATES.paletteFit || qa.border > RIG_GATES.border)) throw new Error('The replacement still fails body-pose quality checks. Existing directions were kept. Review the results before trying again.');
  const layer = baseIt.layers[0], cellMap: Partial<Record<DirectionName, (Sha256 | null)[]>> = { ...baseIt.layers[0].cells?.[spec.id] };
  const skeletons = (fresh.skeletons ??= {}), warnings: string[] = [];
  clearMovePoseData(frig, skeletons, spec.id, dirs);
  for (const [k, c] of clips.entries()) {
    const produced = c.out.frames.map((_, i) => cellKey(spec.id, c.d, i) as CellKey);
    const idx = [...(extra[k] ?? []), ...c.out.recs].map((r, j) => baseIt.provenance.push(provOf(r, j >= (extra[k]?.length ?? 0) ? produced : [])) - 1);
    const src: ClipSource = { route: 'skeleton-v3', reference: frig.rest![c.d]!.image, keypoints: c.keypoints, motion: spec.action === 'walk' ? 'managed-skeleton-v3:walking-8-frames' : spec.action ? `authored:${spec.action}` : `pixminimax:${spec.text}`, measured: c.out.measured.map((x) => x ?? []), ...(c.out.processing ? { processing: c.out.processing } : {}), provenance: idx };
    anim.sources![c.d] = src;
    cellMap[c.d] = await Promise.all(c.out.frames.map(async (f, i) => { const h = await cellHash(f); await putCell(h, f); const s = c.out.measured[i]; if (s) skeletons[cellKey(spec.id, c.d, i)] = fromApi(s, frig.cell); return h; }));
    warnings.push(...warn(`${spec.id}/${c.d}`, c.out.qa));
  }
  for (const d of frig.directions.filter((x) => x.mirrorOf)) {
    const src = clips.find((c) => c.d === d.mirrorOf);
    if (!src) continue;
    cellMap[d.id] = await Promise.all(src.out.frames.map(async (f, i) => { const im = flipH(f), h = await cellHash(im); await putCell(h, im); const s = skeletons[cellKey(spec.id, src.d, i)]; if (s) skeletons[cellKey(spec.id, d.id, i)] = flipSkeleton(s, frig.cell.w); return h; }));
  }
  // anchors for the new clip straight from the measured keypoints (no patch tracking: the clip is posed, not redrawn)
  for (const id of ANCHORS) {
    const pts = (d: DirectionName) => Array.from({ length: n }, (_, i) => { const s = skeletons[cellKey(spec.id, d, i)]; return s ? anchorsOf(s)[id] : undefined; });
    const track = ((frig.anchors ??= {})[id] ??= {});
    for (const d of frig.directions.filter(d => affected.includes(d.id))) { const p = pts(d.id); if (p.every(Boolean)) (track[spec.id] ??= {})[d.id] = p as [number, number][]; }
  }
  frig.animations = old ? frig.animations.map((a) => (a === old ? anim : a)) : [...frig.animations, anim];
  (layer.cells ??= {})[spec.id] = cellMap;
  // adding a clip changes baseHash; items made against the old base keep every old cell, so they move to the new hash
  const hashes: Record<string, Sha256> = {};
  for (const k of cellKeys(frig)) { const [a, d, i] = k.split('/') as [string, DirectionName, string]; const h = layer.cells[a]?.[d]?.[+i]; if (h) hashes[k] = h; }
  const oldHash = frig.baseHash;
  frig.baseHash = await baseHashOf(frig, hashes);
  // Unchanged clips keep their hashes. Replaced clips lose item coverage in the publication transaction below.
  for (const it of fm.items) if (it.baseHash === oldHash) it.baseHash = frig.baseHash;
  const errs = validateRig(frig, hashes);
  if (errs.length) throw new Error(`rig not valid: ${errs.join('; ')}`);
  const qa = (fresh.rigQa ?? {}) as { warnings?: string[]; clips?: Record<string, ClipQa> };
  fresh.rigQa = { ...qa, warnings: [...(qa.warnings ?? []).filter(w => !affected.some(d => w.startsWith(`${spec.id}/${d}:`))), ...warnings], clips: { ...qa.clips, ...Object.fromEntries(clips.map((c) => [`${spec.id}/${c.d}`, c.out.qa])) } };
  // R6 P1-5: `fresh` was read before ~30 cell writes; graft only what this clip changed onto the CURRENT record in one
  // transaction, so an item accepted or an outfit autosaved meanwhile survives.
  await db.update<StoredProject>('projects', projectId, (cur) => {
    if (!cur) throw new Error(`project ${projectId} vanished`);
    if (moveRigVersion(cur) !== version) throw new Error('This character changed in another tab before the move could be saved. Reopen it before trying again.');
    clearMovePoseData(cur.manifest.rig, cur.skeletons ??= {}, spec.id, dirs);
    const cb = cur.manifest.items.find((i) => i.id === frig.baseItem)!;
    if (old) invalidateMoveItems(cur.manifest, spec.id, dirs);
    // Export choices can change while artwork is being generated. The current record owns those choices.
    retainPlaybackChoices(frig, cur.manifest.rig);
    cur.manifest.rig = frig;
    cb.provenance = baseIt.provenance;
    cb.layers[0].cells = layer.cells;
    for (const it of cur.manifest.items) if (it.baseHash === oldHash) it.baseHash = frig.baseHash;
    cur.skeletons = { ...cur.skeletons, ...skeletons };
    cur.rigQa = fresh.rigQa;
    if (intent) cur.moveRecovery = { id: intent.id, originalRigVersion: intent.rigVersion,
      bodyRigVersion: moveRigVersion(cur), specHash: receiptSpecHash! };
    cur.savedAt = new Date().toISOString();
    return cur;
  });

}

/** Copy a loaded (fixture) project into IndexedDB as an editable rig project, so items can be generated for it. */
export async function saveCopy(p: { manifest: Manifest; images: Map<string, Img> }, name: string): Promise<string> {
  const m: Manifest = structuredClone(p.manifest);
  m.name = name;
  const id = `rig-${m.rig.baseHash.slice(7, 19)}`;
  if (await db.get('projects', id)) return id;
  const blobs = new Map<string, Blob>();
  for (const [h, im] of p.images) blobs.set(h.slice(7), new Blob([(await encodePngBytes(im)) as Uint8Array<ArrayBuffer>], { type: 'image/png' }));
  await db.updateCharacter<StoredProject>(id, blobs, current => current ?? { id, savedAt: new Date().toISOString(), manifest: m, skeletons: {}, rigQa: { warnings: [], pivotFrom: '', tracks: [] }, origin: 'studio' });
  return id;
}
