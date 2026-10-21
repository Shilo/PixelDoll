// Item runner (architecture §3): drafts -> calls through the queue -> extraction + QA from the ledger -> auto re-roll -> accept.
// UI-free; ui/M3.svelte and the Studio use this. A Draft is mutated in place (pass a Svelte $state proxy to get reactivity)
// and persisted through the `persist` hook. Everything is re-derived from the job ledger, so reloads resume.
import { queue, type JobRec } from '../pixellab/queue.ts';
import { keyAllowed, other } from '../image/chroma.ts';
import { binaryAlpha, bytesToBase64, decodePng, type Img } from '../image/png.ts';
import { encodePngBytes } from '../image/pngraw.ts';
import * as db from '../store/db.ts';
import { saveItem, type StoredProject } from '../store/project.ts';
import type { Item, Manifest, Project, Provenance, Slot } from '../store/manifest.ts';
import type { DirectionName } from '../rig/rig.ts';
import { fromApi } from '../rig/poses.ts';
import { chromaLayer } from '../image/chroma.ts';
import { GATES, SLOTS, bandOf, buildItem, canPose, clipKeypoints, dirGate, extractCell, f0Last, heldPhrase, inputCell, itemPrompt, itemQa, itemRoute, padImg, padOf, planItem, postProcess, restKey, slotOf, unrotate, type CallKind, type CellOut, type ItemSpec, type QaResult } from './items.ts';

/** kind: 'edit' (packed edit-animation-v2, anchor cell after the first), 'dress' (rest keyframes), 'pose' (one clip x dir). */
export interface CallState { cells: string[]; seed: number; recId?: string; rerolls: number; old: string[]; kind?: CallKind }
export interface Draft { spec: ItemSpec; rigId: string; calls: CallState[]; keySwitched: boolean; log: string[]; acceptedAt?: string }
export interface ItemResult { cells: CellOut[]; qa: QaResult | null; g1: Map<number, string>; preview: Project | null }
/** A frozen rig opened with store/project.ts loadProject(). */
export interface RigCtx { rec: StoredProject; project: Project }

export const MAX_REROLLS = 2;
const seed = () => 1 + Math.floor(Math.random() * 2_000_000);
const slug = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '') || 'item';

// ---------- drafts (persisted at projects/m3-drafts: no `manifest`, so rig listings ignore it) ----------
const DRAFTS = 'm3-drafts';
export const loadDrafts = async () => (await db.get<{ drafts: Draft[] }>('projects', DRAFTS))?.drafts ?? [];
export const saveDrafts = (drafts: Draft[]) => db.put('projects', DRAFTS, { id: DRAFTS, drafts });

/** Default method for a rig: skeleton posing when every needed cell has keypoints (S4 Q4), else the anchor-cell edit route. */
export const defaultMethod = (ctx: RigCtx, spec: Pick<ItemSpec, 'anims' | 'dirs'>) => (canPose(ctx.rec.manifest.rig, spec) ? 'skel' : 'anchor');

/** New draft with a unique id and its call plan (spec.id is derived from name/prompt when empty; method defaults per rig). */
export function newDraft(ctx: RigCtx, spec: Omit<ItemSpec, 'id'> & { id?: string }, taken: string[] = []): Draft {
  let id = spec.id || slug(spec.name || spec.prompt.split(/\s+/).slice(0, 3).join(' '));
  while (taken.includes(id) || ctx.rec.manifest.items.some((i) => i.id === id)) id += '_2';
  const s: ItemSpec = { ...spec, id, name: spec.name || id, method: spec.method ?? defaultMethod(ctx, spec) };
  if (s.method === 'skel' && (s.key === 'none' || !canPose(ctx.rec.manifest.rig, s))) s.method = 'anchor';
  return { spec: s, rigId: ctx.rec.id, calls: planItem(ctx.rec.manifest.rig, s).map((c) => ({ ...c, seed: seed(), rerolls: 0, old: [] })), keySwitched: false, log: [] };
}

// ---------- ledger access ----------
let jobs: JobRec[] = [];
queue.subscribe((s) => (jobs = s.jobs));
export const recIn = (list: JobRec[], id?: string) => (id ? list.find((j) => j.id === id) : undefined);
const recOf = (id?: string) => recIn(jobs, id);
const terminal = (r?: JobRec) => !!r && !['queued', 'submitting', 'running'].includes(r.state);
const settled = (id: string) =>
  new Promise<JobRec>((res) => {
    let done = false;
    const un = queue.subscribe((s) => {
      const r = s.jobs.find((j) => j.id === id);
      if (!done && terminal(r)) { done = true; res(r!); queueMicrotask(() => un()); }
    });
  });
const outputsOf = (r: JobRec) => [...(r.jobs[0]?.results ?? [])].sort((a, b) => +a.label - +b.label);
/** Generations spent on a draft, re-rolls included. */
export const gensOf = (d: Draft, list = jobs) => d.calls.flatMap((c) => [c.recId, ...c.old]).reduce((s, id) => s + (recIn(list, id)?.gens ?? 0), 0);
export const callState = (c: CallState, list = jobs) => recIn(list, c.recId)?.state ?? 'not submitted';

/** A frozen base cell, or a rest view for the pseudo key "rest/<dir>/0". */
export function baseCell(ctx: RigCtx, k: string): Img {
  const [a, d, i] = k.split('/') as [string, DirectionName, string], m = ctx.rec.manifest;
  const h = a === 'rest' ? m.rig.rest?.[d]?.image : m.items.find((x) => x.slot === 'body')!.layers[0].cells![a]![d]![+i]!;
  const im = h && ctx.project.images.get(h);
  if (!im) throw new Error(`base cell ${k} not loaded`);
  return im;
}
/** Keypoints of a base cell (measured) or a rest view (px). */
const skelOf = (ctx: RigCtx, k: string) => {
  const [a, d] = k.split('/') as [string, DirectionName], rest = ctx.rec.manifest.rig.rest?.[d];
  return a === 'rest' ? rest && fromApi(rest.keypoints, ctx.rec.manifest.rig.cell) : ctx.rec.skeletons?.[k];
};

// ---------- calls ----------
const blobB64 = async (sha: string) => bytesToBase64(new Uint8Array(await (await db.getBlob(sha))!.arrayBuffer()));
async function submit(d: Draft, k: number, ctx: RigCtx) {
  const c = d.calls[k], route = d.spec.key, { rig } = ctx.rec.manifest, pad = padOf(d.spec.slot, d.spec.method);
  const label = `M3 ${d.spec.id} call ${k + 1}/${d.calls.length} (${route}${c.kind === 'pose' ? `, pose ${c.cells[0].split('/').slice(0, 2).join('/')}` : ''})`;
  let req;
  if (c.kind === 'pose') { // the direction's dressed keyframe (from the dress call) posed through the base clip's STORED keypoints
    if (route === 'none') throw new Error('posing needs a chroma key');
    const dress = d.calls[0], a = recOf(dress.recId), [anim, dir] = c.cells[0].split('/') as [string, DirectionName];
    if (a?.state !== 'done') throw new Error('dress call not done');
    const kf = outputsOf(a)[dress.cells.indexOf(restKey(dir))], poses = clipKeypoints(rig, anim, dir), rest = rig.rest?.[dir]?.keypoints;
    if (!poses || !rest) throw new Error(`${anim}/${dir}: the rig has no stored keypoints (rig v1.3)`);
    req = itemRoute.pose({ keyframePngB64: await blobB64(kf.sha), rest, poses, item: d.spec.prompt, slot: d.spec.slot, key: route, anim, dir, seed: c.seed, cell: rig.cell, pad });
  } else {
    const frames: string[] = [];
    if (k > 0) { // anchor cell: the design call's dressed cell 0 (cross-call design lock, S2)
      const a = recOf(d.calls[0].recId);
      if (a?.state !== 'done') throw new Error('design call not done');
      frames.push(await blobB64(outputsOf(a)[0].sha));
    }
    for (const key of c.cells) frames.push(bytesToBase64(await encodePngBytes(padImg(inputCell(baseCell(ctx, key), route), pad))));
    // held (S5): dress the rest views on the 96 canvas, "pointing down and slightly outward", one weapon
    req = itemRoute.edit(frames, itemPrompt(pad ? heldPhrase(d.spec.prompt, d.spec.slot) : d.spec.prompt, route, c.cells, k > 0 ? d.calls[0].cells[0] : undefined), c.seed, { w: rig.cell.w + 2 * pad, h: rig.cell.h + 2 * pad });
  }
  c.recId = (await queue.enqueue(req, { label, tag: 'm3' })).id;
}
async function runCall(d: Draft, k: number, ctx: RigCtx, persist: () => Promise<unknown>): Promise<JobRec> {
  if (!recOf(d.calls[k].recId)) { await submit(d, k, ctx); await persist(); }
  const r = recOf(d.calls[k].recId)!;
  return terminal(r) ? r : settled(r.id);
}

/** New seed for call k (k = 0 also drops the later calls: their anchor came from the old design). */
export function rerollCall(d: Draft, k: number, why: string) {
  const c = d.calls[k];
  if (c.recId) c.old.push(c.recId);
  c.recId = undefined;
  c.seed = seed();
  c.rerolls++;
  d.log.push(`re-roll call ${k + 1} (${why})`);
  if (k === 0) for (const l of d.calls.slice(1)) { if (l.recId) l.old.push(l.recId); l.recId = undefined; }
}
function switchKey(d: Draft) {
  if (d.spec.key === 'none') return;
  d.spec.key = other(d.spec.key);
  d.keySwitched = true;
  d.log.push(`switch key to ${d.spec.key} after ${MAX_REROLLS} failed re-rolls`);
  for (const c of d.calls) { if (c.recId) c.old.push(c.recId); c.recId = undefined; c.rerolls = 0; c.seed = seed(); }
}
export const failsOf = (res: ItemResult, k: number) => [...(res.g1.has(k) ? [res.g1.get(k)!] : []), ...(res.qa?.failCalls.get(k) ?? [])];
function retry(d: Draft, k: number, why: string[]): boolean {
  if (d.calls[k].rerolls < MAX_REROLLS) rerollCall(d, k, why.join('; '));
  // the other key only helps a key/item colour collision (G2); moved arms, missing or clipped items are generation problems
  else if (!d.keySwitched && d.spec.key !== 'none' && why.some((w) => w.startsWith('G2')) && keyAllowed(d.spec.prompt, other(d.spec.key))) switchKey(d);
  else { d.log.push(`call ${k + 1} still fails after re-rolls and key switch: ${why.join('; ')} -> needs review`); return false; }
  return true;
}

export interface RunHooks { status?: (s: string) => void; persist?: () => Promise<unknown>; result?: (r: ItemResult) => void }

/** Auto loop: design call -> later calls (anchor cell) -> gates; failing calls re-roll (2×), then the other key, then the user. */
export async function runItem(d: Draft, ctx: RigCtx, h: RunHooks = {}): Promise<ItemResult | null> {
  if (d.rigId !== ctx.rec.id) throw new Error(`${d.spec.id} belongs to ${d.rigId}, not ${ctx.rec.id}`);
  const persist = h.persist ?? (async () => {}), status = h.status ?? (() => {});
  const evalItem = async () => { const r = await evaluateItem(d, ctx); h.result?.(r); return r; };
  let res: ItemResult | null = null;
  try {
    for (let guard = 0; guard < 20; guard++) {
      status('design call');
      const r0 = await runCall(d, 0, ctx, persist);
      if (r0.state !== 'done') { d.log.push(`call 1 ${r0.state}: ${r0.error ?? ''}`); break; }
      res = await evalItem();
      const f0 = failsOf(res, 0);
      if (f0.length && retry(d, 0, f0)) { await persist(); continue; } // out of re-rolls: keep the design (flagged), finish coverage
      status(`calls 2–${d.calls.length}`);
      const rs = await Promise.all(d.calls.slice(1).map((_, i) => runCall(d, i + 1, ctx, persist)));
      const broken = rs.findIndex((r) => r.state !== 'done');
      if (broken >= 0) { d.log.push(`call ${broken + 2} ${rs[broken].state}: ${rs[broken].error ?? ''}`); break; }
      res = await evalItem();
      const r = res;
      // soft gate (G6 palette drift): re-roll while re-rolls are left, then keep with a warning
      const soft = d.calls.map((_, k) => k).filter((k) => !failsOf(r, k).length && r.qa?.softCalls.has(k) && d.calls[k].rerolls < MAX_REROLLS);
      for (const k of soft) rerollCall(d, k, r.qa!.softCalls.get(k)!.join('; '));
      const bad = d.calls.map((_, k) => k).filter((k) => failsOf(r, k).length);
      if (!bad.length && !soft.length) { d.log.push(`gates passed (${r.qa?.qa.status})`); break; }
      const retried = bad.map((k) => retry(d, k, failsOf(r, k))); // every failing call decides on its own
      await persist();
      if (!soft.length && !retried.some(Boolean)) break; // nothing left to re-roll: needs review
    }
  } catch (e) {
    d.log.push(`error: ${(e as Error).message}`);
  } finally {
    await persist();
  }
  return res;
}

// ---------- extraction + QA (re-derived from the ledger) ----------
const decoded = new Map<string, Img>();
async function img(sha: string) {
  let im = decoded.get(sha);
  if (!im) { im = binaryAlpha(await decodePng((await db.getBlob(sha))!)); decoded.set(sha, im); }
  return im;
}
export async function evaluateItem(d: Draft, ctx: RigCtx): Promise<ItemResult> {
  if (d.rigId !== ctx.rec.id) throw new Error(`${d.spec.id} belongs to ${d.rigId}, not ${ctx.rec.id}`);
  type Out = { k: number; key: string; out: Img; posed: boolean };
  const { rig } = ctx.rec.manifest, route = d.spec.key, g1 = new Map<number, string>(), outs: Out[] = [], dressOuts: Out[] = [];
  const pad = padOf(d.spec.slot, d.spec.method), slot = slotOf(d.spec.slot), W = rig.cell.w + 2 * pad, H = rig.cell.h + 2 * pad;
  for (const [k, c] of d.calls.entries()) {
    const r = recOf(c.recId);
    if (r?.state !== 'done') continue;
    let o = outputsOf(r).slice(k > 0 && (c.kind ?? 'edit') === 'edit' ? 1 : 0);
    if (o.length !== c.cells.length) { g1.set(k, `G1 ${o.length} outputs for ${c.cells.length} cells`); continue; }
    if (c.kind === 'pose') { const [a, dir] = c.cells[0].split('/') as [string, DirectionName]; o = unrotate(o, f0Last(d.spec.slot, rig.rest?.[dir]?.keypoints ?? [], clipKeypoints(rig, a, dir) ?? [], rig.cell)); }
    for (const [i, key] of c.cells.entries()) {
      const im = await img(o[i].sha);
      if (im.w !== W || im.h !== H) { g1.set(k, `G1 output ${im.w}x${im.h}`); break; }
      (c.kind === 'dress' ? dressOuts : outs).push({ k, key, out: im, posed: c.kind === 'pose' });
    }
  }
  const ex = (o: Out, useCc?: boolean) =>
    // ponytail: padded (held) slots have no keypoint band, so the rig-cell skeleton is not shifted
    extractCell({ key: o.key, call: o.k, base: padImg(baseCell(ctx, o.key), pad), out: o.out, route, band: bandOf(d.spec.slot, pad ? undefined : skelOf(ctx, o.key), H), useCc, posed: o.posed, clip: slot.band });
  // the dress call only makes keyframes: gate them (G2, G3, presence); they are not item cells themselves
  const keys: Partial<Record<DirectionName, Img>> = {}; // dressed keyframe layers per direction (H4)
  for (const o of dressOuts) {
    const c = ex(o);
    keys[o.key.split('/')[1] as DirectionName] = c.layer;
    const bad = [c.keyKept != null && c.keyKept < GATES.keyKept && `G2 keyframe ${o.key} key kept ${c.keyKept.toFixed(3)}`,
      c.keyOutside != null && c.keyOutside > GATES.keyOutside && `G3 keyframe ${o.key} key outside ${c.keyOutside.toFixed(3)}`,
      !c.area && `G4 keyframe ${o.key}: item missing`].filter(Boolean);
    if (bad.length) g1.set(o.k, [g1.get(o.k), ...bad].filter(Boolean).join('; '));
  }
  const run = (useCc?: boolean) => outs.filter((o) => !g1.has(o.k)).map((o) => ex(o, useCc));
  let cells = run();
  if (route === 'none' && cells.length) { // per-item novel_cc decision (S1): novel2 lost > 25 % of the area over all cells
    const cc = run(true);
    if (cc.reduce((s, c) => s + c.area, 0) * 0.75 > cells.reduce((s, c) => s + c.area, 0)) cells = cc;
  }
  postProcess(rig, slot, cells, keys, pad);
  const kOut = d.spec.method === 'skel' ? GATES.keyOutsidePosed : GATES.keyOutside;
  const qa = cells.length ? withH4(itemQa(rig, slot, route, cells, d.calls.reduce((s, c) => s + c.old.length, 0), kOut, pad), slot, cells, keys) : null;
  return { cells, qa, g1, preview: qa ? await previewProject(d, ctx, cells, qa) : null };
}
/** itemQa + the H4 keyframe-consistency gate (posed cells only). */
function withH4(q: QaResult, slot: Slot, cells: CellOut[], keys: Partial<Record<DirectionName, Img>>): QaResult {
  const h = dirGate(slot, cells, keys);
  for (const [k, why] of h.fails) q.failCalls.set(k, [...(q.failCalls.get(k) ?? []), ...why]);
  q.warnings.push(...h.warnings);
  if (h.fails.size) q.qa.status = 'fail';
  else if (h.warnings.length && q.qa.status === 'pass') q.qa.status = 'warn';
  return q;
}
/** The rig project with this draft equipped (for compose previews in every direction, mirrored ones included). */
async function previewProject(d: Draft, ctx: RigCtx, cells: CellOut[], qa: QaResult): Promise<Project> {
  const { item, images } = await buildItem({ spec: JSON.parse(JSON.stringify(d.spec)) as ItemSpec, rig: ctx.rec.manifest.rig, cells, route: d.spec.key, provenance: [], qa: qa.qa, pad: padOf(d.spec.slot, d.spec.method) });
  const m: Manifest = structuredClone(ctx.rec.manifest);
  m.items = [...m.items.filter((i) => i.id !== item.id), item];
  if (!m.slots.some((s) => s.id === item.slot)) m.slots = [...m.slots, slotOf(item.slot)];
  return { manifest: m, images: new Map([...ctx.project.images, ...images]) };
}

// ---------- accept ----------
const toProv = (r: JobRec, c: CallState): Provenance => ({
  endpoint: r.endpoint,
  params: JSON.parse(JSON.stringify(r.params, (_k, v) => (v && typeof v === 'object' && '$blob' in v ? { sha256: v.$blob } : v))),
  seed: c.seed, requestHash: `sha256:${r.requestHash}`, jobId: r.jobs[0]?.id, usage: { generations: r.gens, usd: r.usd },
  createdAt: new Date(r.submittedAt ?? r.createdAt).toISOString(), produced: [...c.cells] as Provenance['produced'],
});
/** Write the item (layers + cell blobs + provenance + QA) into the rig's project record. A non-pass QA becomes "accepted". */
export async function acceptItem(d: Draft, ctx: RigCtx, res?: ItemResult): Promise<{ item: Item; cells: number }> {
  if (d.rigId !== ctx.rec.id) throw new Error(`${d.spec.id} belongs to ${d.rigId}, not ${ctx.rec.id}`);
  const r = res ?? (await evaluateItem(d, ctx));
  if (!r.qa || d.calls.some((c) => recOf(c.recId)?.state !== 'done')) throw new Error(`${d.spec.id}: not all calls are done`);
  const qa = { ...r.qa.qa, status: r.qa.qa.status === 'pass' ? 'pass' : 'accepted' } as const;
  const dress = d.calls[0].kind === 'dress' ? recOf(d.calls[0].recId) : undefined, dressed: Partial<Record<DirectionName, Img>> = {};
  if (dress) for (const [i, k] of d.calls[0].cells.entries()) dressed[k.split('/')[1] as DirectionName] = await img(outputsOf(dress)[i].sha);
  const { item, images } = await buildItem({
    spec: JSON.parse(JSON.stringify(d.spec)) as ItemSpec, rig: ctx.rec.manifest.rig, cells: r.cells, route: d.spec.key, qa, ...(dress ? { dressed } : {}), pad: padOf(d.spec.slot, d.spec.method),
    provenance: d.calls.map((c) => toProv(recOf(c.recId)!, c)), anchorCell: d.calls.length > 1 ? d.calls[0].cells[0] : undefined,
  });
  await saveItem(d.rigId, item, images, SLOTS);
  d.acceptedAt = new Date().toISOString();
  return { item, cells: images.size };
}

// ---------- new clips on accepted items (architecture §4.1: "adding a clip later = one pose call per item-direction") ----------
/** Accepted skeleton-pose items that can be posed onto a new clip (dressed keyframes + key, made for this base). */
export const posable = (m: Manifest) => m.items.filter((i) => i.slot !== 'body' && i.route === 'skeleton-pose' && i.key && i.dressed && i.baseHash === m.rig.baseHash);
/** Gens for posing `n` items onto a clip of `cells` frames in `dirs` directions (raw skeleton-v3: 3 gens for ≤ 8 frames). */
export const poseGens = (n: number, cells: number, dirs: number) => n * dirs * (cells <= 3 ? 2 : cells <= 8 ? 3 : 4);
const seedOf = (s: string) => 1 + ([...s].reduce((h, c) => (h * 31 + c.charCodeAt(0)) >>> 0, 7) % 2_000_000);

/**
 * Pose an accepted item's dressed keyframes through a clip's stored keypoints (one call per generated direction, one re-roll
 * on a failed gate), extract the layer and write the clip's cells into the item. Seeds derive from item/clip/direction, so a
 * reload re-attaches to the ledger. Returns the clip QA.
 */
export async function poseItemClip(ctx: RigCtx, item: Item, anim: string, onCall: () => void = () => {}): Promise<QaResult> {
  const { rig } = ctx.rec.manifest, slot = slotOf(item.slot), key = item.key!, pad = ((item.layers[0].cell?.w ?? rig.cell.w) - rig.cell.w) / 2;
  const dirs = rig.directions.filter((d) => !d.mirrorOf && item.dressed?.[d.id]).map((d) => d.id);
  const prov: Provenance[] = [], keys: Partial<Record<DirectionName, Img>> = {};
  for (const d of dirs) keys[d] = chromaLayer(await img(item.dressed![d]!.slice(7)), key, padImg(baseCell(ctx, restKey(d)), pad)).layer;
  const perDir = await Promise.all(dirs.map(async (dir, k) => {
    const poses = clipKeypoints(rig, anim, dir), rest = rig.rest?.[dir]?.keypoints;
    if (!poses || !rest) throw new Error(`${anim}/${dir}: no stored keypoints`);
    const cells = poses.map((_, i) => `${anim}/${dir}/${i}`);
    let last: CellOut[] = [];
    for (let attempt = 0; attempt < 2; attempt++) {
      const seed = seedOf(`${item.id}/${anim}/${dir}/${attempt}`);
      const req = itemRoute.pose({ keyframePngB64: await blobB64(item.dressed![dir]!.slice(7)), rest, poses, item: item.prompt, slot: item.slot, key, anim, dir, seed, cell: rig.cell, pad });
      const rec = await queue.enqueue(req, { label: `pose ${item.name} · ${anim} ${dir}`, tag: 'studio-move' });
      const r = terminal(rec) ? rec : await settled(rec.id);
      onCall();
      if (r.state !== 'done') throw new Error(`${item.name} ${anim} ${dir}: ${r.state} ${r.error ?? ''}`);
      const outs = unrotate(outputsOf(r), f0Last(item.slot, rest, poses, rig.cell));
      if (outs.length !== cells.length) continue; // G1: re-roll
      last = await Promise.all(cells.map(async (c, i) => extractCell({ key: c, call: k, base: padImg(baseCell(ctx, c), pad), out: await img(outs[i].sha), route: key, band: bandOf(item.slot, pad ? undefined : skelOf(ctx, c), rig.cell.h + 2 * pad), posed: true, clip: slot.band })));
      postProcess(rig, slot, last, keys, pad);
      const pass = !withH4(itemQa(rig, slot, key, last, attempt, GATES.keyOutsidePosed, pad), slot, last, keys).failCalls.size;
      if (pass || attempt) { prov.push(toProv(r, { cells, seed, rerolls: attempt, old: [] })); break; }
    }
    return last;
  }));
  const cells = perDir.flat();
  if (!cells.length) throw new Error(`${item.name}: PixelLab returned no usable ${anim} frames`);
  const q = withH4(itemQa(rig, slot, key, cells, 0, GATES.keyOutsidePosed, pad), slot, cells, keys);
  const spec: ItemSpec = { id: item.id, name: item.name, slot: item.slot, prompt: item.prompt, key, anims: [anim], dirs, method: 'skel' };
  const built = await buildItem({ spec, rig, cells, route: key, provenance: [], qa: q.qa, pad });
  const out: Item = structuredClone(item);
  out.layers.forEach((l, j) => { l.cells = { ...l.cells, [anim]: built.item.layers[j].cells![anim] }; });
  out.provenance = [...out.provenance, ...prov];
  if (out.qa) out.qa = { ...out.qa, cells: { ...out.qa.cells, ...q.qa.cells }, status: q.qa.status === 'pass' || out.qa.status !== 'pass' ? out.qa.status : 'warn' };
  await saveItem(ctx.rec.id, out, built.images, SLOTS);
  return q;
}
