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
import { encodePngBytes } from '../lib/image/pngraw.ts';
import * as db from '../lib/store/db.ts';
import { loadProject, type StoredProject } from '../lib/store/project.ts';
import { anchorTracks, buildRig, type SourceAnim } from '../lib/rig/freeze.ts';
import { normalize } from '../lib/rig/normalize.ts';
import { flipH } from '../lib/rig/mirror.ts';
import { ANCHORS, baseHashOf, cellHash, cellKey, cellKeys, playlist, validateRig, type ClipSource, type DirectionName, type Keypoint, type RigAnimation, type Sha256 } from '../lib/rig/rig.ts';
import { anchorsOf, flipSkeleton, type Skeleton } from '../lib/rig/skeleton.ts';
import { ACTIONS, LABELS, fromApi, toApi } from '../lib/rig/poses.ts';
import { actionOf, clipQa, largestComponent, loops, rawClip, type ClipQa } from '../lib/rig/clips.ts';
import { poseGens, poseItemClip } from '../lib/items/run.ts';
import type { CellKey, Manifest, Provenance } from '../lib/store/manifest.ts';
import { basePrompt, looksOf } from './model.ts';

export interface CreateSpec { description: string; name: string; seed: number; size: number }
export type CreateStep = 'draw' | 'rest' | 'animate' | 'save';
export const STEPS: { id: CreateStep; label: string }[] = [
  { id: 'draw', label: 'Drawing your character' },
  { id: 'rest', label: 'Setting up the skeleton' },
  { id: 'animate', label: 'Animating idle and walk' },
  { id: 'save', label: 'Checking and saving' },
];
const DIRS: Direction[] = ['south', 'east', 'north']; // west = mirror of east (architecture §2)
const CELL = 64, RAW_GENS = 3, EST = 0.1;

/** Base clips whose keypoints are authored from the rest pose (B9: idle) instead of a managed skeleton-v3 motion source. */
const authoredBase = (anim: string) => (anim in ACTIONS ? ACTIONS[anim] : undefined);
/** Cost from measured prices: base 2 + import 0.25, per clip-direction raw 3 (+ managed motion 3 unless authored), joints 0.1
 * per raw frame (+ per managed motion frame). */
export function estimate() {
  const per = (a: (typeof BASE_ANIMS)[number]) => RAW_GENS + a.frames * EST + (authoredBase(a.name) ? 0 : 3 + a.frames * EST);
  return { gens: 2.25 + DIRS.length * BASE_ANIMS.reduce((s, a) => s + per(a), 0), minutes: 12 };
}

// ---------- queue helpers ----------
async function run(req: Req, label: string, tag: string, cache = false): Promise<JobRec> {
  const rec = await queue.enqueue(req, { label, tag, cache });
  const r = live(rec) ? await queue.settled(rec.id) : rec;
  if (r.state !== 'done') throw new Error(`${label}: ${r.state}${r.error ? ` (${r.error.slice(0, 160)})` : ''}`);
  return r;
}
const b64 = async (im: Img) => bytesToBase64(await encodePngBytes(im));
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
/** estimate-skeleton (deterministic, 0.1 gen, cached by request) -> API keypoints in LABELS order; undefined on failure. */
async function joints(im: Img): Promise<Keypoint[] | undefined> {
  try {
    const r = await run(routes.estimateSkeleton(png(await b64(im))), 'Finding joints', 'm2-skel', true);
    const ks = (r.response as { keypoints?: Keypoint[] } | undefined)?.keypoints ?? [];
    const out = LABELS.map((l) => ks.find((k) => k.label === l)).filter((k): k is Keypoint => !!k).map((k) => kp4(k.label, k.x, k.y));
    return out.length === LABELS.length ? out : undefined;
  } catch { return undefined; }
}

// ---------- one clip-direction: raw skeleton-v3 on the rest view + cleanup + gate ----------
interface ClipJob { anim: string; dir: Direction; rest: Img; restKps: Keypoint[]; keypoints: Keypoint[][]; looks: string; seed: number; name: string; tick: () => void }
interface ClipOut { frames: Img[]; measured: (Keypoint[] | undefined)[]; qa: ClipQa; recs: JobRec[] }
async function renderClip(j: ClipJob): Promise<ClipOut> {
  const restB64 = await b64(j.rest), recs: JobRec[] = [];
  let best: ClipOut | null = null;
  for (let attempt = 0; attempt < 2 && (!best || best.qa.fails.length); attempt++) { // fail -> one re-roll (new seed), keep the better
    const r = await run(rawClip({ first: restB64, rest: j.restKps, keypoints: j.keypoints, description: j.looks, action: actionOf(j.anim), dir: j.dir, seed: j.seed + attempt * 7919 }),
      `${j.name} · ${j.anim} ${j.dir}${attempt ? ' (re-roll)' : ''}`, 'studio-rig');
    recs.push(r);
    j.tick();
    const outs = await imagesOf(r);
    if (outs.length !== j.keypoints.length) continue;
    const clean = outs.map((o) => largestComponent(normalize(o.img, CELL, CELL, 128, CELL).img));
    const measured = await Promise.all(clean.map(async (c) => { const k = await joints(c.img); j.tick(); return k; }));
    const frames = clean.map((c) => c.img);
    const qa = clipQa({ anim: j.anim, rest: j.rest, frames, requested: j.keypoints, measured, stray: clean.reduce((s, c) => s + c.stray, 0) });
    if (!best || qa.fails.length < best.qa.fails.length) best = { frames, measured, qa, recs };
  }
  if (!best) throw new Error(`${j.anim} ${j.dir}: PixelLab returned the wrong number of frames`);
  return { ...best, recs };
}

/** Managed motion source on the rest character -> frames on the 64 cell -> estimated keypoint sequence. */
async function motion(req: Req, dir: Direction, label: string, tick: () => void): Promise<Keypoint[][]> {
  const r = await run(req, label, 'studio-rig');
  tick();
  const got = (r.response as SubmitResponse | undefined)?.directions;
  if (got && !got.includes(dir)) throw new Error(`${label}: PixelLab dropped the direction (busy). Try again.`); // S4 truncation
  const frames = (await imagesOf(r)).map((o) => normalize(o.img, CELL, CELL, 128, CELL).img); // 96/84 -> 64, centred
  const kps = await Promise.all(frames.map(async (f) => { const k = await joints(f); tick(); return k; }));
  if (kps.some((k) => !k)) throw new Error(`${label}: joints not found on every frame`);
  if (kps.length < 3 || kps.length > 15) throw new Error(`${label}: ${kps.length} frames (skeleton-v3 takes 3-15)`);
  return kps as Keypoint[][];
}

const provOf = (r: JobRec, produced: CellKey[] = []): Provenance => {
  const params = r.params as Record<string, unknown>;
  return {
    endpoint: r.endpoint, params, seed: (params.seed as number) ?? 0, requestHash: `sha256:${r.requestHash}`, jobId: r.jobs[0]?.id,
    usage: { generations: r.gens, usd: r.usd }, createdAt: new Date(r.submittedAt ?? r.createdAt).toISOString(), produced,
  };
};
const putCell = async (h: Sha256, im: Img) => { if (!(await db.getBlob(h.slice(7)))) await db.put('blobs', h.slice(7), new Blob([(await encodePngBytes(im)) as Uint8Array<ArrayBuffer>], { type: 'image/png' })); };
const warn = (clip: string, qa: ClipQa) => qa.fails.map((f) => `${clip}: ${f}`);

export interface Progress { step: string; done: number; total: number; recIds: string[] }

export async function createCharacter(spec: CreateSpec, onProgress: (p: Progress) => void = () => {}): Promise<string> {
  const looks = looksOf(spec.description), view = 'low top-down' as const;
  // 1. base character, text only (8 rotations)
  onProgress({ step: 'draw', done: 0, total: 1, recIds: [] });
  const base = await run(routes.createCharacterV3({ description: basePrompt(spec.description), image_size: { width: spec.size, height: spec.size }, view, template_id: 'mannequin', seed: spec.seed, no_background: true }), `${spec.name} · drawing`, 'studio-base');

  // 2. rest views: rotations on the 64 cell with the floor pad, west = flip(east); re-import for the rest keypoints
  onProgress({ step: 'rest', done: 0, total: 1, recIds: [] });
  const rots = await imagesOf(base), rest = {} as Record<DirectionName, Img>;
  let pad: [number, number] = [0, 0];
  for (const d of DIRS) {
    const r = rots.find((x) => x.label === d);
    if (!r) throw new Error(`PixelLab returned no ${d} view`);
    const n = normalize(r.img, CELL, CELL);
    if (n.cutPx) throw new Error(`the ${d} view does not fit the 64 px cell`);
    rest[d] = n.img;
    pad = n.offset;
  }
  rest.west = flipH(rest.east);
  const imp = await run(routes.createCharacterV3({ description: looks, reference_image: png(await b64(rest.south)), direction_images: { east: png(await b64(rest.east)), north: png(await b64(rest.north)), west: png(await b64(rest.west)) }, n_directions: 4, view, template_id: 'mannequin', no_background: true, seed: spec.seed }), `${spec.name} · rest views`, 'studio-base');
  const charId = (imp.response as { character_id?: string })?.character_id;
  if (!charId) throw new Error('PixelLab did not return a character id');
  const ch = await run(routes.getCharacter(charId), `${spec.name} · skeleton`, 'studio-base', true);
  const refs = (ch.response as { skeletons?: { '2d_references'?: Record<string, { keypoints?: Record<string, { x: number; y: number }> }> } })?.skeletons?.['2d_references'];
  const restKps = {} as Record<DirectionName, Keypoint[]>;
  for (const d of DIRS) {
    const k = refs?.[d]?.keypoints, fromChar = k && LABELS.every((l) => k[l]) ? LABELS.map((l) => kp4(l, k[l].x, k[l].y)) : undefined;
    const kps = fromChar ?? (await joints(rest[d])); // free from the managed character, else estimate (0.1)
    if (!kps) throw new Error(`no joints found on the ${d} view`);
    restKps[d] = kps;
  }

  // 3. per (clip, direction): managed skeleton-v3 motion -> keypoints -> raw re-render on the rest view
  const pairs = BASE_ANIMS.flatMap((a) => DIRS.map((d) => ({ a, d })));
  const total = pairs.reduce((s, { a }) => s + (authoredBase(a.name) ? 1 + a.frames : 2 + a.frames * 2), 0);
  let done = 0;
  const tick = () => onProgress({ step: 'animate', done: Math.min(total, ++done), total, recIds: [] });
  onProgress({ step: 'animate', done: 0, total, recIds: [] });
  const motions = new Map<string, JobRec>();
  const clips = await Promise.all(pairs.map(async ({ a, d }) => {
    const authored = authoredBase(a.name);
    let keypoints: Keypoint[][];
    if (authored) keypoints = authored(fromApi(restKps[d], { w: CELL, h: CELL }), d).map((p) => toApi(p, { w: CELL, h: CELL }));
    else {
      const req = routes.animateCharacter(baseAnimation('skeleton-v3', charId, a, [d], spec.seed));
      keypoints = await motion(req, d, `${spec.name} · ${a.name} ${d} (motion)`, tick);
      motions.set(`${a.name}/${d}`, (await queue.enqueue(req)) as JobRec); // cache hit: the record for provenance
    }
    return { a, d, keypoints, out: await renderClip({ anim: a.name, dir: d, rest: rest[d], restKps: restKps[d], keypoints, looks, seed: spec.seed + 101, name: spec.name, tick }) };
  }));

  // 4. freeze
  onProgress({ step: 'save', done: 0, total: 1, recIds: [] });
  const anims: SourceAnim[] = BASE_ANIMS.map((a) => ({ id: a.name, dirs: Object.fromEntries(clips.filter((c) => c.a === a).map((c) => [c.d, c.out.frames])) }));
  const built = await buildRig(anims, { size: CELL, mode: '4' });
  if (built.errors.length) throw new Error(`The animation frames do not fit together: ${built.errors.slice(0, 3).join('; ')}`);
  const rig = built.rig;
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
    items: [{ id: 'base', name: 'Base body', slot: 'body', status: 'accepted', mirror: 'flip', materials: [], prompt: spec.description, baseHash: rig.baseHash, layers: [{ id: 'main', role: 'fg', z: 10, cells }], provenance }],
    presets: [{ id: 'default', name: 'Base', items: { body: 'base' }, variants: {} }],
  };
  const rec: StoredProject = {
    id: `rig-${rig.baseHash.slice(7, 19)}`, savedAt: new Date().toISOString(), manifest, skeletons, character: { id: charId, looks }, origin: 'studio',
    rigQa: { warnings: built.warnings, pivotFrom: built.pivotFrom, clips: Object.fromEntries(clips.map((c) => [`${c.a.name}/${c.d}`, c.out.qa])), tracks: tracks.stats.map(({ points: _, ...t }) => t) },
  };
  for (const d of DIRS) await putCell(rig.rest[d]!.image, rest[d]);
  for (const c of Object.values(built.cells)) await putCell(c.hash, c.img);
  await db.put('projects', rec.id, rec);
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
export const isV13 = (rec?: Pick<StoredProject, 'character' | 'manifest'> | null) => !!rec?.character && !!rec.manifest.rig.rest && rec.manifest.rig.directions.every((d) => d.mirrorOf || rec.manifest.rig.rest?.[d.id]);
const genDirs = (m: Manifest) => m.rig.directions.filter((d) => !d.mirrorOf).map((d) => d.id);
/** Frames of a move: the authored table's length, or the text frame count. */
export const moveFrames = (m: Manifest, s: Pick<MoveSpec, 'action' | 'frames'>) => {
  const r = m.rig.rest?.south;
  return s.action && ACTIONS[s.action] && r ? ACTIONS[s.action](fromApi(r.keypoints, m.rig.cell), 'south').length : s.frames;
};
export function moveEstimate(m: Manifest, s: Pick<MoveSpec, 'action' | 'frames' | 'items'>) {
  const n = moveFrames(m, s), dirs = genDirs(m).length, body = dirs * (RAW_GENS + n * EST + (s.action ? 0 : 1 + n * EST));
  const items = poseGens(s.items.length, n, dirs);
  return { gens: body + items, body, items, frames: n, minutes: 4 + s.items.length * 3 };
}

/**
 * Authored (raw skeleton-v3 with keypoints from the rest pose) or text (pixminimax motion source -> raw re-render) move, then
 * the chosen items posed onto it. Resumable: a body clip already saved is kept, items that already have it are skipped.
 */
export async function addMove(projectId: string, spec: MoveSpec, onProgress: (p: Progress) => void = () => {}): Promise<void> {
  const { rec } = await loadProject(projectId);
  if (!isV13(rec)) throw new Error('This character was made before rig v1.3. Create a new character to add moves.');
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
  const dirs = genDirs(m) as Direction[], n = moveFrames(m, spec), name = m.name;
  const total = dirs.length * (1 + n + (spec.action ? 0 : 1 + n));
  let done = 0;
  const tick = () => onProgress({ step: 'animate', done: Math.min(total, ++done), total, recIds: [] });
  onProgress({ step: 'animate', done: 0, total, recIds: [] });
  const extra: JobRec[][] = [];
  const clips = await Promise.all(dirs.map(async (d, k) => {
    const restKps = rig.rest![d]!.keypoints, restImg = project.images.get(rig.rest![d]!.image)!;
    let keypoints: Keypoint[][];
    if (spec.action) keypoints = ACTIONS[spec.action](fromApi(restKps, rig.cell), d).map((p) => toApi(p, rig.cell));
    else {
      const req = routes.animateCharacter({ character_id: rec.character!.id, mode: 'pixminimax', action_description: `${spec.text}, unarmed, no weapon, no props, no other people, no effects`, frame_count: n, keep_first_frame: false, animation_name: spec.id, directions: [d], seed: spec.seed });
      keypoints = await motion(req, d, `${name} · ${spec.id} ${d} (motion)`, tick);
      extra[k] = [(await queue.enqueue(req)) as JobRec];
    }
    return { d, keypoints, out: await renderClip({ anim: spec.id, dir: d, rest: restImg, restKps, keypoints, looks: rec.character!.looks, seed: spec.seed + 101, name, tick }) };
  }));

  onProgress({ step: 'save', done: 0, total: 1, recIds: [] });
  const fresh = (await db.get<StoredProject>('projects', projectId))!, fm = fresh.manifest, frig = fm.rig, baseIt = fm.items.find((i) => i.id === frig.baseItem)!;
  const old = frig.animations.find((a) => a.id === spec.id);
  const anim: RigAnimation = { id: spec.id, cells: n, loop: loops(spec.id), frames: old?.cells === n ? old.frames : playlist(n, 100), sources: {} };
  const layer = baseIt.layers[0], cellMap: Partial<Record<DirectionName, Sha256[]>> = {};
  const skeletons = (fresh.skeletons ??= {}), warnings: string[] = [];
  for (const [k, c] of clips.entries()) {
    const produced = c.out.frames.map((_, i) => cellKey(spec.id, c.d, i) as CellKey);
    const idx = [...(extra[k] ?? []), ...c.out.recs].map((r, j) => baseIt.provenance.push(provOf(r, j >= (extra[k]?.length ?? 0) ? produced : [])) - 1);
    const src: ClipSource = { route: 'skeleton-v3', reference: frig.rest![c.d]!.image, keypoints: c.keypoints, motion: spec.action ? `authored:${spec.action}` : `pixminimax:${spec.text}`, measured: c.out.measured.map((x) => x ?? []), provenance: idx };
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
  // ponytail: on `replace`, items keep their old cells of that clip until addMove re-poses the chosen ones
  for (const it of fm.items) if (it.baseHash === oldHash) it.baseHash = frig.baseHash;
  const errs = validateRig(frig, hashes);
  if (errs.length) throw new Error(`rig not valid: ${errs.join('; ')}`);
  const qa = (fresh.rigQa ?? {}) as { warnings?: string[]; clips?: Record<string, ClipQa> };
  fresh.rigQa = { ...qa, warnings: [...(qa.warnings ?? []), ...warnings], clips: { ...qa.clips, ...Object.fromEntries(clips.map((c) => [`${spec.id}/${c.d}`, c.out.qa])) } };
  // R6 P1-5: `fresh` was read before ~30 cell writes; graft only what this clip changed onto the CURRENT record in one
  // transaction, so an item accepted or an outfit autosaved meanwhile survives.
  await db.update<StoredProject>('projects', projectId, (cur) => {
    if (!cur) throw new Error(`project ${projectId} vanished`);
    const cb = cur.manifest.items.find((i) => i.id === frig.baseItem)!;
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
