// Create character + add a move: rig v1.3 (architecture §3). Base = create-character-v3 at 48 px -> rotations padded to the
// 64 cell with the floor pad (lib/rig/normalize: x+8, y+12) = rest views -> re-imported as a managed character (0.25 gen,
// pixel-exact; its skeletons["2d_references"] are the rest keypoints) -> per clip x direction: a MOTION SOURCE (managed
// skeleton-v3 template, pixminimax text, or authored keypoints) -> keypoint sequence -> raw /animate-with-skeleton-v3 on the
// rest view (the request shape items are posed with) -> largest component -> re-estimate -> freeze gate (1 re-roll) -> stored
// frames + reference + keypoints + route + provenance. Every paid call is seeded and every free one cached, so re-running the
// same spec after a reload re-attaches to the ledger instead of paying again.
import { live, queue, type JobRec } from '../lib/pixellab/queue.ts';
import { BASE_ANIMS, baseAnimation, png, routes, type Direction, type Req, type SubmitResponse } from '../lib/pixellab/routes.ts';
import { bytesToBase64, decodePng, type Img } from '../lib/image/png.ts';
import { sha256, stableStringify } from '../lib/image/hash.ts';
import { encodePngBytes } from '../lib/image/pngraw.ts';
import * as db from '../lib/store/db.ts';
import { loadProject, type StoredProject } from '../lib/store/project.ts';
import { HEADROOM_MIN, anchorTracks, buildRig, type SourceAnim } from '../lib/rig/freeze.ts';
import { normalize, opaqueBox } from '../lib/rig/normalize.ts';
import { flipH } from '../lib/rig/mirror.ts';
import { ANCHORS, baseHashOf, cellHash, cellKey, cellKeys, playlist, validateRig, type ClipSource, type DirectionName, type Keypoint, type RigAnimation, type Rig, type Sha256 } from '../lib/rig/rig.ts';
import { anchorsOf, flipSkeleton, type Skeleton } from '../lib/rig/skeleton.ts';
import { ACTIONS, LABELS, authoredPoses, fromApi, hasAll, toApi } from '../lib/rig/poses.ts';
import { rigReady } from '../lib/rig/setup.ts';
import { actionOf, clipQa, largestComponent, loops, rawClip, type ClipQa } from '../lib/rig/clips.ts';
import { poseGens, poseItemClip } from '../lib/items/run.ts';
import type { CellKey, Manifest, Provenance } from '../lib/store/manifest.ts';
import { basePrompt, looksOf } from './model.ts';
import { clearMovePoseData, invalidateMoveItems, moveRigVersion } from './replaceMove.ts';

/** Missing dirs means four views; missing directionPolicy preserves mirrored legacy recovery and its request hashes. */
export type DirectionPolicy = 'independent' | 'mirrored';
export interface CreateSpec { description: string; name: string; seed: number; size: number; dirs?: 4 | 8; directionPolicy?: DirectionPolicy; projectId?: string }
export type CreateStep = 'draw' | 'rest' | 'animate' | 'save';
export const STEPS: { id: CreateStep; label: string }[] = [
  { id: 'draw', label: 'Drawing your character' },
  { id: 'rest', label: 'Setting up the skeleton' },
  { id: 'animate', label: 'Animating idle and walk' },
  { id: 'save', label: 'Checking and saving' },
];
/** Independently rendered directions. Legacy mirrored policy derives western views from their eastern counterpart. */
export const genDirsOf = (n: 4 | 8 = 4, policy: DirectionPolicy = 'mirrored'): Direction[] => policy === 'independent'
  ? n === 8 ? ['south', 'south-east', 'east', 'north-east', 'north', 'north-west', 'west', 'south-west'] : ['south', 'east', 'north', 'west']
  : n === 8 ? ['south', 'south-east', 'east', 'north-east', 'north'] : ['south', 'east', 'north'];
const MIRRORS: [Direction, Direction][] = [['west', 'east'], ['south-west', 'south-east'], ['north-west', 'north-east']];
const CELL = 64, RAW_GENS = 3, EST = 0.1;
export const CLIP_ATTEMPTS = 2;
/** Base sizes in the 64 cell (D4): the 4 px floor stays, so 56 px leaves 4 px of canvas above the character's own canvas
 * and the rest views are checked for HEADROOM_MIN free px above the head. */
export const SIZES = [48, 56] as const;

/** Base clips whose keypoints are authored from the rest pose (B9: idle) instead of a managed skeleton-v3 motion source. */
const authoredBase = (anim: string) => (anim in ACTIONS ? ACTIONS[anim] : undefined);
/** Cost from measured prices: base 2 + import 0.25, per clip-direction raw 3 (+ managed motion 3 unless authored), joints 0.1
 * per raw frame (+ per managed motion frame). */
export function estimate(dirs: 4 | 8 = 4, policy: DirectionPolicy = 'mirrored') {
  const render = (a: (typeof BASE_ANIMS)[number]) => RAW_GENS + a.frames * EST;
  const per = (a: (typeof BASE_ANIMS)[number]) => render(a) + (authoredBase(a.name) ? 0 : 3 + a.frames * EST);
  const n = genDirsOf(dirs, policy).length; // base 2 + exact rest import 0.25; source motions are created once
  const gens = +(2.25 + n * BASE_ANIMS.reduce((sum, a) => sum + per(a), 0)).toFixed(2);
  // Every clip-direction can reroll, and missing managed rest joints may require one estimate per direction.
  const extra = n * ((CLIP_ATTEMPTS - 1) * BASE_ANIMS.reduce((sum, a) => sum + render(a), 0) + EST);
  return { gens, maxGens: +(gens + extra).toFixed(2), minutes: Math.ceil((dirs === 8 ? 18 : 12) * n / genDirsOf(dirs).length) };
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
export async function parallelGeneration<T>(tasks: ((signal: AbortSignal) => Promise<T>)[], attempt?: number): Promise<T[]> {
  const scope = new AbortController();
  if (Number.isSafeInteger(attempt)) generationAttempts.set(scope.signal, attempt!);
  return Promise.all(tasks.map(async (task) => {
    try { scope.signal.throwIfAborted(); return await task(scope.signal); }
    catch (e) { scope.abort(e); throw e; }
  }));
}

export async function run(req: Req, label: string, tag: string, cache = false, resumeSafe = req.method === 'POST', signal?: AbortSignal): Promise<JobRec> {
  signal?.throwIfAborted();
  const rec = await queue.enqueue(req, { label, tag, cache, resumeSafe, signal, attempt: signal ? generationAttempts.get(signal) : undefined });
  // Queue cancellation is consumer-aware: a failed flow cannot cancel deduplicated work another flow still needs.
  signal?.throwIfAborted();
  const r = live(rec) ? await queue.settled(rec.id) : rec;
  signal?.throwIfAborted();
  if (r.state !== 'done') throw new Error(`${label}: ${r.state}${r.error ? ` (${r.error.slice(0, 160)})` : ''}${resumeSafe ? '. Generation stopped without resending. Review this request in Activity before starting again.' : ''}`);
  return r;
}
export const b64 = async (im: Img) => bytesToBase64(await encodePngBytes(im));
/** Result images of a record, in frame order (labels "south/3" or "3"; character rotations are labelled by direction). */
async function imagesOf(r: JobRec): Promise<{ label: string; img: Img }[]> {
  const res = r.jobs.flatMap((s) => s.results).sort((a, b) => +a.label.split('/').pop()! - +b.label.split('/').pop()!);
  return Promise.all(res.map(async (x) => {
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
export async function joints(im: Img, resumeSafe = true, signal?: AbortSignal): Promise<Keypoint[] | undefined> {
  try {
    const r = await run(routes.estimateSkeleton(png(await b64(im))), 'Finding joints', 'm2-skel', true, resumeSafe, signal);
    return checkedKeypoints((r.response as { keypoints?: unknown } | undefined)?.keypoints);
  } catch (e) { if (resumeSafe) throw e; return undefined; }
}

// ---------- one clip-direction: raw skeleton-v3 on the rest view + cleanup + gate ----------
interface ClipJob { anim: string; dir: Direction; rest: Img; restKps: Keypoint[]; keypoints: Keypoint[][]; looks: string; seed: number; name: string; tick: () => void; view?: Manifest['rig']['view']; signal?: AbortSignal }
interface ClipOut { frames: Img[]; measured: (Keypoint[] | undefined)[]; qa: ClipQa; recs: JobRec[] }
async function renderClip(j: ClipJob): Promise<ClipOut> {
  const restB64 = await b64(j.rest), recs: JobRec[] = [];
  let best: ClipOut | null = null, measurementFailure = '';
  for (let attempt = 0; attempt < CLIP_ATTEMPTS && (!best || best.qa.fails.length); attempt++) { // fail -> one re-roll (new seed), keep the better
    const r = await run(rawClip({ first: restB64, rest: j.restKps, keypoints: j.keypoints, description: j.looks, action: actionOf(j.anim), dir: j.dir, seed: j.seed + attempt * 7919, view: j.view }),
      `${j.name} · ${j.anim} ${j.dir}${attempt ? ' (re-roll)' : ''}`, 'studio-rig', false, true, j.signal);
    recs.push(r);
    j.tick();
    const outs = await imagesOf(r);
    if (outs.length !== j.keypoints.length) continue;
    const clean = outs.map((o) => largestComponent(normalize(o.img, CELL, CELL, 128, CELL).img));
    const measured = await Promise.all(clean.map(async (c) => { const k = await joints(c.img, true, j.signal); j.tick(); return k; }));
    const missing = measured.findIndex((k) => !hasAll(k));
    if (measured.length !== j.keypoints.length || missing !== -1) {
      measurementFailure = `${j.anim} ${j.dir}: joints could not be measured on frame ${missing === -1 ? measured.length : missing}. No body clip was saved.`;
      continue; // incomplete measurements cannot outrank a complete clip with ordinary artwork warnings
    }
    const frames = clean.map((c) => c.img);
    const qa = clipQa({ anim: j.anim, rest: j.rest, frames, requested: j.keypoints, measured, stray: clean.reduce((s, c) => s + c.stray, 0) });
    if (!best || qa.fails.length < best.qa.fails.length) best = { frames, measured, qa, recs };
  }
  if (!best) throw new Error(measurementFailure || `${j.anim} ${j.dir}: PixelLab returned the wrong number of frames`);
  return { ...best, recs };
}

/** Managed motion source on the rest character -> frames on the 64 cell -> estimated keypoint sequence. */
async function motion(req: Req, dir: Direction, label: string, tick: () => void, signal?: AbortSignal): Promise<Keypoint[][]> {
  const r = await run(req, label, 'studio-rig', false, true, signal);
  tick();
  const got = (r.response as SubmitResponse | undefined)?.directions;
  if (got && !got.includes(dir)) throw new Error(`${label}: PixelLab dropped the direction (busy). Try again.`); // S4 truncation
  const frames = (await imagesOf(r)).map((o) => normalize(o.img, CELL, CELL, 128, CELL).img); // 96/84 -> 64, centred
  const kps = await Promise.all(frames.map(async (f) => { const k = await joints(f, true, signal); tick(); return k; }));
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
const warn = (clip: string, qa: ClipQa) => qa.fails.map((f) => `${clip}: ${f}`);

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

export async function createCharacter(spec: CreateSpec, onProgress: (p: Progress) => void = () => {}): Promise<string> {
  const projectId = spec.projectId ?? `rig-${crypto.randomUUID()}`;
  if (!/^rig-[a-z0-9-]+$/.test(projectId)) throw new Error('This creation attempt has an invalid project identity. Start a new character.');
  const creationSpec = await sha256(stableStringify({ ...spec, projectId: undefined }));
  if (await completedCreation(projectId, creationSpec)) return projectId; // completion may have committed before its UI acknowledgement
  const looks = looksOf(spec.description), view = 'low top-down' as const, DIRS = genDirsOf(spec.dirs, spec.directionPolicy);
  // 1. base character, text only (8 rotations)
  onProgress({ step: 'draw', done: 0, total: 1, recIds: [] });
  const base = await run(routes.createCharacterV3({ description: basePrompt(spec.description), image_size: { width: spec.size, height: spec.size }, view, template_id: 'mannequin', seed: spec.seed, no_background: true }), `${spec.name} · drawing`, 'studio-base');

  // 2. selected original rotations on the 64 cell; legacy western views are flips. Re-import for rest keypoints.
  onProgress({ step: 'rest', done: 0, total: 1, recIds: [] });
  const { rest, pad } = prepareRestViews(await imagesOf(base), spec);
  const others = Object.fromEntries(await Promise.all((Object.keys(rest) as Direction[]).filter((d) => d !== 'south').map(async (d) => [d, png(await b64(rest[d]))])));
  const imp = await run(routes.createCharacterV3({ description: looks, reference_image: png(await b64(rest.south)), direction_images: others, n_directions: spec.dirs === 8 ? 8 : 4, view, template_id: 'mannequin', no_background: true, seed: spec.seed }), `${spec.name} · rest views`, 'studio-base');
  const charId = (imp.response as { character_id?: string })?.character_id;
  if (!charId) throw new Error('PixelLab did not return a character id');
  const ch = await run(routes.getCharacter(charId), `${spec.name} · skeleton`, 'studio-base', true);
  const refs = (ch.response as { skeletons?: { '2d_references'?: Record<string, { keypoints?: Record<string, { x: number; y: number }> }> } })?.skeletons?.['2d_references'];
  const restKps = {} as Record<DirectionName, Keypoint[]>, managed = managedRestKeypoints(refs, DIRS);
  for (const d of DIRS) {
    const kps = managed[d] ?? (await joints(rest[d])); // only absent references use the existing bounded estimate fallback
    if (!hasAll(kps)) throw new Error(`no valid joints found on the ${d} view`);
    restKps[d] = kps!;
  }

  // 3. per (clip, direction): managed skeleton-v3 motion -> keypoints -> raw re-render on the rest view
  const pairs = BASE_ANIMS.flatMap((a) => DIRS.map((d) => ({ a, d })));
  const total = pairs.reduce((s, { a }) => s + (authoredBase(a.name) ? 1 + a.frames : 2 + a.frames * 2), 0);
  let done = 0;
  const tick = () => onProgress({ step: 'animate', done: Math.min(total, ++done), total, recIds: [] });
  onProgress({ step: 'animate', done: 0, total, recIds: [] });
  const motions = new Map<string, JobRec>();
  const clips = await parallelGeneration(pairs.map(({ a, d }) => async (signal) => {
    const checkedTick = () => { signal.throwIfAborted(); tick(); };
    const authored = authoredBase(a.name);
    let keypoints: Keypoint[][];
    if (authored) keypoints = authoredPoses(a.name, fromApi(restKps[d], { w: CELL, h: CELL }), d).map((p) => toApi(p, { w: CELL, h: CELL }));
    else {
      const req = routes.animateCharacter(baseAnimation('skeleton-v3', charId, a, [d], spec.seed));
      keypoints = await motion(req, d, `${spec.name} · ${a.name} ${d} (motion)`, checkedTick, signal);
      motions.set(`${a.name}/${d}`, (await queue.enqueue(req, { signal })) as JobRec); // cache hit: the record for provenance
    }
    return { a, d, keypoints, out: await renderClip({ anim: a.name, dir: d, rest: rest[d], restKps: restKps[d], keypoints, looks, seed: spec.seed + 101, name: spec.name, tick: checkedTick, signal }) };
  }), spec.seed);

  // 4. freeze
  onProgress({ step: 'save', done: 0, total: 1, recIds: [] });
  const anims: SourceAnim[] = BASE_ANIMS.map((a) => ({ id: a.name, dirs: Object.fromEntries(clips.filter((c) => c.a === a).map((c) => [c.d, c.out.frames])) }));
  const built = await buildRig(anims, { size: CELL, mode: spec.directionPolicy === 'independent' ? 'all' : spec.dirs === 8 ? '8' : '4' });
  assertCreatedDirections(built.rig, spec.dirs, spec.directionPolicy);
  if (built.errors.length) throw new Error(`The animation frames do not fit together: ${built.errors.slice(0, 3).join('; ')}`);
  const rig = built.rig;
  rig.view = view;
  rig.template = 'mannequin';
  rig.pad = { x: pad[0], y: pad[1] };
  const provenance: Provenance[] = [provOf(base), provOf(imp)];
  const at = (r: JobRec, produced: CellKey[] = []) => provenance.push(provOf(r, produced)) - 1;
  rig.rest = {};
  for (const d of DIRS) rig.rest[d] = { image: await cellHash(rest[d]), keypoints: restKps[d] };
  for (const c of clips) {
    const anim = rig.animations.find((x) => x.id === c.a.name)!;
    anim.loop = loops(anim.id);
    const produced = c.out.frames.map((_, i) => cellKey(anim.id, c.d, i) as CellKey);
    (anim.sources ??= {})[c.d] = {
      route: 'skeleton-v3', reference: rig.rest[c.d]!.image, keypoints: c.keypoints, motion: authoredBase(c.a.name) ? `authored:${c.a.name}` : `managed-skeleton-v3:${c.a.template}`, measured: c.out.measured.map((k) => k ?? []),
      provenance: [...(motions.has(`${c.a.name}/${c.d}`) ? [at(motions.get(`${c.a.name}/${c.d}`)!)] : []), ...c.out.recs.map((r) => at(r, produced))],
    };
    built.warnings.push(...warn(`${anim.id}/${c.d}`, c.out.qa));
  }
  const skel: Record<string, Skeleton> = {};
  for (const c of clips) c.out.frames.forEach((_, i) => { const k = c.out.measured[i], h = built.cells[cellKey(c.a.name, c.d, i)]?.hash; if (k && h) skel[h] = fromApi(k, rig.cell); });
  const tracks = anchorTracks(built, skel);
  rig.anchors = tracks.anchors;
  const cells: Record<string, Partial<Record<DirectionName, Sha256[]>>> = {};
  const skeletons: Record<string, Skeleton> = {};
  for (const k of cellKeys(rig)) {
    const [a, d, i] = k.split('/') as [string, DirectionName, string], c = built.cells[k];
    ((cells[a] ??= {})[d] ??= [])[+i] = c.hash;
    const s = c.mirrorOf ? skel[built.cells[cellKey(a, c.mirrorOf, +i)].hash] : skel[c.hash];
    if (s) skeletons[k] = c.mirrorOf ? flipSkeleton(s, CELL) : s;
  }
  const errs = validateRig(rig, Object.fromEntries(Object.entries(built.cells).map(([key, c]) => [key, c.hash])));
  if (errs.length) throw new Error(`rig not valid: ${errs.join('; ')}`);
  const manifest: Manifest = {
    format: 'pixeldoll/1', name: spec.name, app: 'PixelDoll 0.1.0', rig, materials: [],
    slots: [{ id: 'body', z: 10, class: 'base', required: true }],
    items: [{ id: 'base', name: 'Base body', slot: 'body', status: 'accepted', mirror: rig.directions.some((d) => d.mirrorOf) ? 'flip' : 'generate', materials: [], prompt: spec.description, baseHash: rig.baseHash, layers: [{ id: 'main', role: 'fg', z: 10, cells }], provenance }],
    presets: [{ id: 'default', name: 'Base', items: { body: 'base' }, variants: {} }],
  };
  const rec: StoredProject = {
    id: projectId, creationSpec, savedAt: new Date().toISOString(), manifest, skeletons, character: { id: charId, looks }, origin: 'studio',
    rigQa: { warnings: built.warnings, pivotFrom: built.pivotFrom, clips: Object.fromEntries(clips.map((c) => [`${c.a.name}/${c.d}`, c.out.qa])), tracks: tracks.stats.map(({ points: _, ...t }) => t) },
  };
  const images = new Map<Sha256, Img>(Object.values(built.cells).map((c) => [c.hash, c.img]));
  for (const d of DIRS) images.set(rig.rest[d]!.image, rest[d]);
  await publishCreatedCharacter(rec, images);
  db.askPersist();
  return rec.id;
}

// ---------- add a move ----------
/** `replace`: re-render an existing clip (B9: the Ranger's managed idle -> authored idle) and re-pose `items` onto it. */
export interface MoveSpec { id: string; action?: string; text?: string; frames: number; items: string[]; seed: number; replace?: boolean }
export const MOVE_STEPS = [
  { id: 'animate', label: 'Animating the body' },
  { id: 'items', label: 'Posing your items' },
  { id: 'save', label: 'Saving' },
];
export const isV13 = rigReady;
const genDirs = (m: Manifest) => m.rig.directions.filter((d) => !d.mirrorOf).map((d) => d.id);
/** Frames of a move: the authored table's length, or the text frame count. */
export const moveFrames = (m: Manifest, s: Pick<MoveSpec, 'action' | 'frames'>) => {
  const r = m.rig.rest?.south;
  return s.action === 'walk' ? 8 : s.action && ACTIONS[s.action] && r ? ACTIONS[s.action](fromApi(r.keypoints, m.rig.cell), 'south').length : s.frames;
};
export function moveEstimate(m: Manifest, s: Pick<MoveSpec, 'action' | 'frames' | 'items'>) {
  const n = moveFrames(m, s), dirs = genDirs(m).length, body = dirs * (RAW_GENS + n * EST + (s.action === 'walk' ? 3 + n * EST : s.action ? 0 : 1 + n * EST));
  const items = poseGens(s.items.length, n, dirs);
  return { gens: body + items, body, items, frames: n, minutes: 4 + s.items.length * 3 };
}

/**
 * Authored (raw skeleton-v3 with keypoints from the rest pose) or text (pixminimax motion source -> raw re-render) move, then
 * the chosen items posed onto it. Resumable: a body clip already saved is kept, items that already have it are skipped.
 */
export async function addMove(projectId: string, spec: MoveSpec, onProgress: (p: Progress) => void = () => {}): Promise<void> {
  const { rec } = await loadProject(projectId);
  if (!isV13(rec)) throw new Error('Set up this character’s pose rig before adding moves.');
  if (spec.replace || !rec.manifest.rig.animations.some((a) => a.id === spec.id)) await addBodyClip(projectId, spec, onProgress);
  // items: one pose call per item x direction with the clip's stored keypoints (sequential saves; the record is re-read each time)
  const dirs = genDirs(rec.manifest).length, itemTotal = spec.items.length * dirs;
  let posed = 0;
  onProgress({ step: 'items', done: 0, total: itemTotal, recIds: [] });
  for (const id of spec.items) {
    const ctx = await loadProject(projectId), it = ctx.rec.manifest.items.find((i) => i.id === id);
    if (it && (spec.replace || !it.layers.some((l) => l.cells?.[spec.id]))) await poseItemClip(ctx, it, spec.id, () => onProgress({ step: 'items', done: Math.min(itemTotal, ++posed), total: itemTotal, recIds: [] }), spec.seed);
  }
}

async function addBodyClip(projectId: string, spec: MoveSpec, onProgress: (p: Progress) => void) {
  const { rec, project } = await loadProject(projectId), m = rec.manifest, rig = m.rig;
  const version = moveRigVersion(rec);
  const dirs = genDirs(m) as Direction[], n = moveFrames(m, spec), name = m.name;
  const total = dirs.length * (1 + n + (spec.action && ACTIONS[spec.action] ? 0 : 1 + n));
  let done = 0;
  const tick = () => onProgress({ step: 'animate', done: Math.min(total, ++done), total, recIds: [] });
  onProgress({ step: 'animate', done: 0, total, recIds: [] });
  const extra: JobRec[][] = [];
  const clips = await parallelGeneration(dirs.map((d, k) => async (signal) => {
    const checkedTick = () => { signal.throwIfAborted(); tick(); };
    const restKps = rig.rest![d]!.keypoints, restImg = project.images.get(rig.rest![d]!.image)!;
    let keypoints: Keypoint[][];
    if (spec.action && ACTIONS[spec.action]) keypoints = authoredPoses(spec.action, fromApi(restKps, rig.cell), d, rig.cell.w).map((p) => toApi(p, rig.cell));
    else {
      const req = routes.animateCharacter(spec.action === 'walk' ? baseAnimation('skeleton-v3', rec.character!.id, BASE_ANIMS.find((a) => a.name === 'walk')!, [d], spec.seed) : { character_id: rec.character!.id, mode: 'pixminimax', action_description: `${spec.text}, unarmed, no weapon, no props, no other people, no effects`, frame_count: n, keep_first_frame: false, animation_name: spec.id, directions: [d], seed: spec.seed });
      keypoints = await motion(req, d, `${name} · ${spec.id} ${d} (motion)`, checkedTick, signal);
      extra[k] = [(await queue.enqueue(req, { signal })) as JobRec];
    }
    return { d, keypoints, out: await renderClip({ anim: spec.id, dir: d, rest: restImg, restKps, keypoints, looks: rec.character!.looks, seed: spec.seed + 101, name, tick: checkedTick, view: rig.view, signal }) };
  }), spec.seed);

  onProgress({ step: 'save', done: 0, total: 1, recIds: [] });
  const fresh = (await db.get<StoredProject>('projects', projectId))!;
  if (!fresh || moveRigVersion(fresh) !== version) throw new Error('This character changed in another tab while the move was generating. Reopen it before trying again.');
  const fm = fresh.manifest, frig = fm.rig, baseIt = fm.items.find((i) => i.id === frig.baseItem)!;
  const old = frig.animations.find((a) => a.id === spec.id);
  const anim: RigAnimation = { id: spec.id, cells: n, loop: loops(spec.id), frames: old?.cells === n ? old.frames : playlist(n, 100), sources: {} };
  const layer = baseIt.layers[0], cellMap: Partial<Record<DirectionName, Sha256[]>> = {};
  const skeletons = (fresh.skeletons ??= {}), warnings: string[] = [];
  clearMovePoseData(frig, skeletons, spec.id);
  for (const [k, c] of clips.entries()) {
    const produced = c.out.frames.map((_, i) => cellKey(spec.id, c.d, i) as CellKey);
    const idx = [...(extra[k] ?? []), ...c.out.recs].map((r, j) => baseIt.provenance.push(provOf(r, j >= (extra[k]?.length ?? 0) ? produced : [])) - 1);
    const src: ClipSource = { route: 'skeleton-v3', reference: frig.rest![c.d]!.image, keypoints: c.keypoints, motion: spec.action === 'walk' ? 'managed-skeleton-v3:walking-8-frames' : spec.action ? `authored:${spec.action}` : `pixminimax:${spec.text}`, measured: c.out.measured.map((x) => x ?? []), provenance: idx };
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
    for (const d of frig.directions) { const p = pts(d.id); if (p.every(Boolean)) (track[spec.id] ??= {})[d.id] = p as [number, number][]; }
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
  fresh.rigQa = { ...qa, warnings: [...(qa.warnings ?? []), ...warnings], clips: { ...qa.clips, ...Object.fromEntries(clips.map((c) => [`${spec.id}/${c.d}`, c.out.qa])) } };
  // R6 P1-5: `fresh` was read before ~30 cell writes; graft only what this clip changed onto the CURRENT record in one
  // transaction, so an item accepted or an outfit autosaved meanwhile survives.
  await db.update<StoredProject>('projects', projectId, (cur) => {
    if (!cur) throw new Error(`project ${projectId} vanished`);
    if (moveRigVersion(cur) !== version) throw new Error('This character changed in another tab before the move could be saved. Reopen it before trying again.');
    clearMovePoseData(cur.manifest.rig, cur.skeletons ??= {}, spec.id);
    const cb = cur.manifest.items.find((i) => i.id === frig.baseItem)!;
    if (old) invalidateMoveItems(cur.manifest, spec.id);
    cur.manifest.rig = frig;
    cb.provenance = baseIt.provenance;
    cb.layers[0].cells = layer.cells;
    for (const it of cur.manifest.items) if (it.baseHash === oldHash) it.baseHash = frig.baseHash;
    cur.skeletons = { ...cur.skeletons, ...skeletons };
    cur.rigQa = fresh.rigQa;
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
  for (const [h, im] of p.images) await putCell(h as Sha256, im);
  await db.put('projects', id, { id, savedAt: new Date().toISOString(), manifest: m, skeletons: {}, rigQa: { warnings: [], pivotFrom: '', tracks: [] }, origin: 'studio' });
  return id;
}
