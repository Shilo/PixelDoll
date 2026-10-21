// Create character (D1 S1): create-character-v3 at 48 px -> managed skeleton-v3 idle + walk per generated direction ->
// cells placed like the S2 base (48 -> 64, x+8 y+16) -> rig (M2 buildRig) -> estimate-skeleton per cell -> anchors ->
// frozen project record in IndexedDB. Every call goes through the queue with an explicit seed, so re-running the same spec
// after a reload re-attaches to the ledger records (request-hash cache) instead of paying again.
import { queue, type JobRec } from '../lib/pixellab/queue.ts';
import { BASE_ANIMS, baseAnimation, png as b64png, routes, type Direction } from '../lib/pixellab/routes.ts';
import { bytesToBase64, decodePng, type Img } from '../lib/image/png.ts';
import { encodePngBytes } from '../lib/image/pngraw.ts';
import * as db from '../lib/store/db.ts';
import { anchorTracks, buildRig, type Built, type SourceAnim } from '../lib/rig/freeze.ts';
import { cellKey, cellKeys, validateRig, type DirectionName, type Sha256 } from '../lib/rig/rig.ts';
import { parseSkeleton, type Skeleton } from '../lib/rig/skeleton.ts';
import type { CellKey, Manifest, Provenance } from '../lib/store/manifest.ts';
import type { StoredProject } from '../lib/store/project.ts';
import { basePrompt, place } from './model.ts';

export interface CreateSpec { description: string; name: string; seed: number; size: number }
export type CreateStep = 'draw' | 'animate' | 'joints' | 'save';
export const STEPS: { id: CreateStep; label: string }[] = [
  { id: 'draw', label: 'Drawing your character' },
  { id: 'animate', label: 'Animating idle and walk' },
  { id: 'joints', label: 'Finding joints' },
  { id: 'save', label: 'Saving' },
];
const DIRS: Direction[] = ['south', 'east', 'north']; // west = mirror of east (architecture §2)
const MODE = 'skeleton-v3' as const; // allowed animation model (PLAN D8)

/** Cost estimate from measured prices: v3 base 2 gens, managed skeleton-v3 3 gens per direction (S3), skeleton 0.1 per cell. */
export function estimate() {
  const cells = BASE_ANIMS.reduce((s, a) => s + a.frames, 0) * DIRS.length;
  return { gens: 2 + BASE_ANIMS.length * DIRS.length * 3 + cells * 0.1, minutes: 8 };
}

const terminal = (r?: JobRec) => !!r && !['queued', 'submitting', 'running'].includes(r.state);
export function settled(id: string): Promise<JobRec> {
  return new Promise((res) => {
    let done = false;
    const un = queue.subscribe((s) => {
      const r = s.jobs.find((j) => j.id === id);
      if (!done && terminal(r)) { done = true; res(r!); queueMicrotask(() => un()); }
    });
  });
}
const must = (r: JobRec, what: string) => {
  if (r.state !== 'done') throw new Error(`${what}: ${r.state}${r.error ? ` (${r.error.slice(0, 160)})` : ''}`);
  return r;
};

export interface Progress { step: CreateStep; done: number; total: number; recIds: string[] }

export async function createCharacter(spec: CreateSpec, onProgress: (p: Progress) => void = () => {}): Promise<string> {
  // 1. base character (8 rotations; text-only v3 needs 8 directions)
  const baseReq = routes.createCharacterV3({ description: basePrompt(spec.description), image_size: { width: spec.size, height: spec.size }, view: 'low top-down', template_id: 'mannequin', seed: spec.seed, no_background: true });
  const baseRec = await queue.enqueue(baseReq, { label: `${spec.name} · drawing`, tag: 'studio-base' });
  onProgress({ step: 'draw', done: 0, total: 1, recIds: [baseRec.id] });
  const base = must(terminal(baseRec) ? baseRec : await settled(baseRec.id), 'Drawing the character');
  const charId = (base.response as { character_id?: string })?.character_id;
  if (!charId) throw new Error('PixelLab did not return a character id');

  // 2. one call per (animation, direction): near the job cap a multi-direction call is silently truncated (S4)
  const pairs = BASE_ANIMS.flatMap((a) => DIRS.map((d) => ({ a, d })));
  const recs = await Promise.all(pairs.map(({ a, d }) => queue.enqueue(routes.animateCharacter(baseAnimation(MODE, charId, a, [d], spec.seed)), { label: `${spec.name} · ${a.name} ${d}`, tag: 'studio-anim' })));
  let n = 0;
  const report = () => onProgress({ step: 'animate', done: n, total: recs.length, recIds: recs.map((r) => r.id) });
  report();
  const doneRecs = await Promise.all(recs.map(async (r, i) => {
    const d = must(terminal(r) ? r : await settled(r.id), `Animating ${pairs[i].a.name} ${pairs[i].d}`);
    n++;
    report();
    return d;
  }));

  // 3. frames -> cells (placed like the S2 base) -> rig
  const cut: string[] = [];
  const anims: SourceAnim[] = BASE_ANIMS.map((a) => ({ id: a.name, dirs: {}, source: { endpoint: '/characters/animations', mode: MODE, template_animation_id: a.template } }));
  for (const [i, r] of doneRecs.entries()) {
    const a = anims.find((x) => x.id === pairs[i].a.name)!;
    for (const res of r.jobs.flatMap((s) => s.results)) {
      const [dir, k] = res.label.split('/') as [DirectionName, string];
      const blob = await db.getBlob(res.sha);
      if (!blob) throw new Error(`frame ${res.label} missing in storage`);
      const p = place(await decodePng(blob), spec.size);
      if (p.cut) cut.push(`${a.id}/${dir}/${k}`);
      (a.dirs[dir] ??= [])[+k] = p.img;
    }
  }
  const built = await buildRig(anims, { size: 64, mode: '4' });
  if (built.errors.length) throw new Error(`The animation frames do not fit together: ${built.errors.slice(0, 3).join('; ')}`);
  built.rig.pad = { x: (64 - spec.size) / 2, y: 64 - spec.size };
  if (cut.length) built.warnings.push(`${cut.length} frames had pixels outside the 64 px cell (cut): ${cut.slice(0, 4).join(', ')}`);

  // 4. skeletons per generated cell (0.1 gen each; results are reused by label, like M2)
  const generated = [...new Map(Object.values(built.cells).filter((c) => !c.mirrorOf).map((c) => [c.hash, c])).values()];
  const label = (h: string) => `skeleton ${h}`;
  let k = 0;
  const skel: Record<string, Skeleton> = {};
  const jobs = generated.map(async (c) => {
    let r = queue.snapshot().jobs.find((j) => j.tag === 'm2-skel' && j.state === 'done' && j.label === label(c.hash));
    if (!r) {
      const rec = await queue.enqueue(routes.estimateSkeleton(b64png(bytesToBase64(await encodePngBytes(c.img)))), { label: label(c.hash), tag: 'm2-skel' });
      r = terminal(rec) ? rec : await settled(rec.id);
    }
    const kps = (r.response as { keypoints?: never[] } | undefined)?.keypoints;
    if (r.state === 'done' && kps) skel[c.hash] = parseSkeleton(kps, 64, 64);
    k++;
    onProgress({ step: 'joints', done: k, total: generated.length, recIds: [] });
  });
  onProgress({ step: 'joints', done: 0, total: generated.length, recIds: [] });
  await Promise.all(jobs);
  if (Object.keys(skel).length < generated.length) built.warnings.push(`${generated.length - Object.keys(skel).length} cells without joints (anchors incomplete)`);

  // 5. freeze
  onProgress({ step: 'save', done: 0, total: 1, recIds: [] });
  const prov = [base, ...doneRecs].map((r) => provOf(r));
  const rec = makeRecord(built, skel, spec.name, prov);
  const errs = validateRig(rec.manifest.rig, Object.fromEntries(Object.entries(built.cells).map(([key, c]) => [key, c.hash])));
  if (errs.length) throw new Error(`rig not valid: ${errs.join('; ')}`);
  for (const c of Object.values(built.cells))
    if (!(await db.getBlob(c.hash.slice(7)))) await db.put('blobs', c.hash.slice(7), new Blob([(await encodePngBytes(c.img)) as Uint8Array<ArrayBuffer>], { type: 'image/png' }));
  await db.put('projects', rec.id, rec);
  db.askPersist();
  return rec.id;
}

function provOf(r: JobRec): Provenance {
  const params = r.params as Record<string, unknown>;
  const produced = r.jobs.flatMap((s) => s.results.map((x) => { const [d, i] = x.label.split('/'); return i != null ? cellKey((params.animation_name as string) ?? 'base', d as DirectionName, +i) : null; })).filter(Boolean) as CellKey[];
  return {
    endpoint: r.endpoint, params, seed: (params.seed as number) ?? 0, requestHash: `sha256:${r.requestHash}`, jobId: r.jobs[0]?.id,
    usage: { generations: r.gens, usd: r.usd }, createdAt: new Date(r.submittedAt ?? r.createdAt).toISOString(), produced,
  };
}

/** Same record layout as M2's "Freeze rig" (projects/rig-<baseHash 12 hex>). */
function makeRecord(b: Built, skel: Record<string, Skeleton>, name: string, provenance: Provenance[]): StoredProject {
  const tracks = anchorTracks(b, skel);
  const rig = { ...b.rig, anchors: tracks.anchors };
  const cells: Record<string, Partial<Record<DirectionName, Sha256[]>>> = {};
  const skeletons: Record<string, Skeleton> = {};
  for (const k of cellKeys(rig)) {
    const [a, d, i] = k.split('/') as [string, DirectionName, string];
    ((cells[a] ??= {})[d] ??= [])[+i] = b.cells[k].hash;
    const c = b.cells[k];
    const s = c.mirrorOf ? undefined : skel[c.hash];
    if (s) skeletons[k] = s;
  }
  const manifest: Manifest = {
    format: 'pixeldoll/1', name, app: 'PixelDoll 0.1.0', rig, materials: [],
    slots: [{ id: 'body', z: 10, class: 'base', required: true }],
    items: [{ id: 'base', name: 'Base body', slot: 'body', status: 'accepted', mirror: 'flip', materials: [], prompt: '', baseHash: rig.baseHash, layers: [{ id: 'main', role: 'fg', z: 10, cells }], provenance }],
    presets: [{ id: 'default', name: 'Base', items: { body: 'base' }, variants: {} }],
  };
  return { id: `rig-${rig.baseHash.slice(7, 19)}`, savedAt: new Date().toISOString(), manifest, skeletons, rigQa: { warnings: b.warnings, pivotFrom: b.pivotFrom, tracks: tracks.stats.map(({ points: _, ...t }) => t) } };
}

/** Copy a loaded (fixture) project into IndexedDB as an editable rig project, so items can be generated for it. */
export async function saveCopy(p: { manifest: Manifest; images: Map<string, Img> }, name: string): Promise<string> {
  const m: Manifest = structuredClone(p.manifest);
  m.name = name;
  const id = `rig-${m.rig.baseHash.slice(7, 19)}`;
  if (await db.get('projects', id)) return id;
  for (const [h, im] of p.images)
    if (!(await db.getBlob(h.slice(7)))) await db.put('blobs', h.slice(7), new Blob([(await encodePngBytes(im)) as Uint8Array<ArrayBuffer>], { type: 'image/png' }));
  await db.put('projects', id, { id, savedAt: new Date().toISOString(), manifest: m, skeletons: {}, rigQa: { warnings: [], pivotFrom: '', tracks: [] } });
  return id;
}
