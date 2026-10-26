// Item runner (architecture §3): drafts -> calls through the queue -> extraction + QA from the ledger -> auto re-roll -> accept.
// UI-free; ui/M3.svelte and the Studio use this. A Draft is mutated in place (pass a Svelte $state proxy to get reactivity)
// and persisted through the `persist` hook. Everything is re-derived from the job ledger, so reloads resume.
import { queue, type JobRec } from '../pixellab/queue.ts';
import { binaryAlpha, bytesToBase64, decodePng, type Img } from '../image/png.ts';
import { sha256, stableStringify } from '../image/hash.ts';
import { cellHash, type Sha256 } from '../rig/rig.ts';
import { itemPaletteMatcher, ITEM_PALETTE_POLICY, validPaletteRepairs } from '../dress/item-palette.ts';
import { encodePngBytes } from '../image/pngraw.ts';
import * as db from '../store/db.ts';
import { loadProject, saveItem, type StoredProject } from '../store/project.ts';
import type { Item, Manifest, Project, Provenance, Slot } from '../store/manifest.ts';
import { dropCut } from '../compose/compose.ts';
import type { DirectionName, Keypoint, Rig } from '../rig/rig.ts';
import { fromApi, hasAll } from '../rig/poses.ts';
import { paddedPoses, poseBatches, poseGensFor } from '../rig/clips.ts';
import { acceptQa, clipOf, mergeQa } from './qa-summary.ts';
import { switchTo, type Key } from '../image/chroma.ts';
import { editFrameCap, png, routes, type Req } from '../pixellab/routes.ts';
import { DESIGN, GATES, GRID_COLS, anchored, planGens, GRAYISH, SLOTS, gridEstimate, bandMask, cutGrid, g2Fails, grayShare, gridPrompt, packGrid, bandOf, buildItem, gridFits, hiddenViews, callAnim, callParts, canPose, cellKeypoints, clipKeypoints, cutAllow, cutRows, dirGate, extractCell, posedTol, f0Last, heldPhrase, inputCell, itemPrompt, itemQa, itemRoute, padImg, padOf, planItem, postProcess, restKey, slotOf, unrotate, type CallKind, type CellOut, type ItemSpec, type QaResult } from './items.ts';

/** kind: 'edit' (packed edit-animation-v2, anchor cell after the first), 'dress' (rest keyframes), 'pose' (one clip x dir). */
/** fallback: B14, a pose call redone as an inpaint-v3 grid keeps its best pose roll (and that roll's failed-check count). */
export interface CallState { cells: string[]; seed: number; recId?: string; rerolls: number; old: string[]; kind?: CallKind; fallback?: { recId: string; fails: number } }
export interface Draft { spec: ItemSpec; rigId: string; calls: CallState[]; keySwitched: boolean; log: string[]; acceptedAt?: string }
export interface ItemResult { cells: CellOut[]; qa: QaResult | null; g1: Map<number, string>; preview: Project | null }
/** G1 is structural; this legacy map also carries ordinary keyframe-art warnings. */
const structuralReason = (why: string) => /(?:^|;\s*)G1\b/.test(why);
export const hasStructuralFailure = (r: Pick<ItemResult, 'g1'>) => [...r.g1.values()].some(structuralReason);
/** A frozen rig opened with store/project.ts loadProject(). */
export interface RigCtx { rec: StoredProject; project: Project }

export const MAX_REROLLS = 2;
const seed = () => 1 + Math.floor(Math.random() * 2_000_000);
const slug = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '') || 'item';

/** Default method for a rig: skeleton posing when every needed cell has keypoints (S4 Q4), else the anchor-cell edit route. */
export const defaultMethod = (ctx: RigCtx, spec: Pick<ItemSpec, 'anims' | 'dirs' | 'clipDirs'>) => (canPose(ctx.rec.manifest.rig, spec) ? 'skel' : 'anchor');

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
/** Outputs of call k in cell order (an anchored call's first output is the anchor's: dropped). */
const cellOuts = (k: number, c: CallState, r: JobRec) => outputsOf(r).slice(anchored(k, c.kind) ? 1 : 0);
/** B16: the dressed keyframe output per rest cell over every dress chunk (all must be done). */
export function dressedOf(calls: CallState[], rec: (id?: string) => JobRec | undefined = recOf): Map<string, { sha: string }> {
  const m = new Map<string, { sha: string }>();
  for (const [k, c] of calls.entries()) {
    if (c.kind !== 'dress') continue;
    const r = rec(c.recId);
    if (r?.state !== 'done') throw new Error('dress call not done');
    cellOuts(k, c, r).forEach((o, i) => c.cells[i] && m.set(c.cells[i], o));
  }
  return m;
}
/** Generations spent on a draft, re-rolls included. */
const draftRecords = (d: Draft) => [...new Set(d.calls.flatMap((c) => [c.recId, ...c.old]).filter((id): id is string => !!id))];
export const gensOf = (d: Draft, list = jobs) => draftRecords(d).reduce((s, id) => s + (recIn(list, id)?.gens ?? 0), 0);
export const usdOf = (d: Draft, list = jobs) => draftRecords(d).reduce((s, id) => s + (recIn(list, id)?.usd ?? 0), 0);
export const callState = (c: CallState, list = jobs) => recIn(list, c.recId)?.state ?? 'not submitted';

/** A frozen base cell, or a rest view for the pseudo key "rest/<dir>/0". */
export function baseCell(ctx: RigCtx, k: string, restView = false): Img {
  const [a, d, i] = k.split('/') as [string, DirectionName, string], m = ctx.rec.manifest;
  const h = (restView ? m.rig.rest?.[d]?.image : undefined) ?? m.items.find((x) => x.slot === 'body')!.layers[0].cells?.[a]?.[d]?.[+i] ?? (a === 'rest' ? m.rig.rest?.[d]?.image : undefined);
  const im = h && ctx.project.images.get(h);
  if (!im) throw new Error(`base cell ${k} not loaded`);
  return im;
}
/** Keypoints of a base cell (measured) or a rest view (px). */
const skelOf = (ctx: RigCtx, k: string, restView = false) => {
  const [a, d] = k.split('/') as [string, DirectionName], rest = ctx.rec.manifest.rig.rest?.[d];
  return restView ? rest && fromApi(rest.keypoints, ctx.rec.manifest.rig.cell) : ctx.rec.skeletons?.[k] ?? (a === 'rest' && rest ? fromApi(rest.keypoints, ctx.rec.manifest.rig.cell) : undefined);
};
type Cuts = Partial<Record<DirectionName, Uint8Array>>;
/** Round 3 cut options of a cell: dressed keyframes cut on their own, posed frames only inside their keyframe's cut. */
const cutFor = (ctx: RigCtx, slot: string, k: string, posed: boolean, keyCut: Cuts, restView = false) => {
  const { rig } = ctx.rec.manifest, maxY = cutRows(slot, skelOf(ctx, k, restView), rig.cell.h);
  if (maxY == null) return undefined;
  if (!posed) return restView ? { maxY } : undefined; // in-place edit cells never cut on their own: untested for drift
  const allow = cutAllow(rig, k, keyCut[k.split('/')[1] as DirectionName], rig.cell.w, posedTol(rig.cell.w, rig.cell.h));
  return allow && { maxY, allow };
};
/** Dressed keyframe layers (H4, trims) and the body px they hide, per direction, for later moves and grid repairs. Every dressed
 * view, also when only some directions are posed: hidden views are judged over all of them. */
async function dressedKeys(ctx: RigCtx, item: Item, pad: number) {
  const keys: Partial<Record<DirectionName, Img>> = {}, cuts: Cuts = {}, H = ctx.rec.manifest.rig.cell.h + 2 * pad, cells: CellOut[] = [];
  for (const d of Object.keys(item.dressed ?? {}) as DirectionName[]) {
    const k = restKey(d), c = extractCell({ key: k, call: 0, base: padImg(baseCell(ctx, k, true), pad), out: await img(item.dressed![d]!.slice(7)), route: item.key!, band: bandOf(item.slot, pad ? undefined : skelOf(ctx, k, true), H), cut: cutFor(ctx, item.slot, k, false, {}, true) });
    keys[d] = c.layer;
    if (c.cut) cuts[d] = c.cut;
    cells.push(c);
  }
  return { keys, cuts, hidden: hiddenViews(cells, keys) };
}

// ---------- calls ----------
/** B14 grid request (S4 inv3 / S5 H3): the clip-direction's chroma cells masked to the slot band, then the dressed keyframes
 *  (kept, black mask) as the reference design. Rig cell only (held items keep their oversize S5 route). */
async function gridReq(ctx: RigCtx, spec: Pick<ItemSpec, 'slot' | 'prompt' | 'key'>, cells: string[], refs: { dir: DirectionName; im: Img }[], seed: number, pad = 0): Promise<Req> {
  const { rig } = ctx.rec.manifest, w = rig.cell.w + 2 * pad, h = rig.cell.h + 2 * pad, [anim, dir] = cells[0].split('/') as [string, DirectionName];
  gridEstimate({ w, h }, cells.length, refs.length); // same packed geometry used by the displayed estimate
  if (refs.some(r => r.im.w !== w || r.im.h !== h)) throw new Error('Equipment reference dimensions do not match its repair canvas.');
  const held = slotOf(spec.slot).class === 'held';
  const masks = cells.map(k => {
    if (!held) return bandMask(bandOf(spec.slot, skelOf(ctx, k), h), w, h);
    const [a, d, i] = k.split('/') as [string, DirectionName, string], measured = rig.animations.find(a0 => a0.id === a)?.sources?.[d]?.measured?.[+i];
    const observed = skelOf(ctx, k) ?? (hasAll(measured) ? fromApi(measured!, rig.cell) : undefined);
    const point = observed?.[spec.slot === 'off_hand' ? 'LEFT ARM' : 'RIGHT ARM'];
    if (!point || !Number.isFinite(point.x) || !Number.isFinite(point.y) || point.x < 0 || point.x > rig.cell.w || point.y < 0 || point.y > rig.cell.h) throw new Error('Held-item repair needs valid measured hand positions on every frozen body frame.');
    const mask = new Uint8Array(w * h);
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) if (Math.hypot(x + 0.5 - point.x - pad, y + 0.5 - point.y - pad) <= 34) mask[y * w + x] = 1;
    return mask;
  });
  const g = packGrid([...cells.map((k) => inputCell(padImg(baseCell(ctx, k), pad), spec.key)), ...refs.map((r) => r.im)], [...masks, ...refs.map(() => null)]);
  const b64 = async (im: Img) => png(bytesToBase64(await encodePngBytes(im)));
  return routes.inpaintV3({
    description: gridPrompt({ item: spec.prompt, slot: spec.slot, key: spec.key as Key, anim, dir, n: cells.length, refs: refs.map((r) => r.dir), cell: { w, h }, parts: callParts(cells) }),
    inpainting_image: { image: await b64(g.image), size: { width: g.image.w, height: g.image.h } }, mask_image: { image: await b64(g.mask), size: { width: g.mask.w, height: g.mask.h } }, no_background: true, seed,
  });
}
/** Can a failing pose call fall back to the grid? Worn/rigid items on a chroma key (held items stay on their S5 route). */
const gridable = (spec: { slot: string; key?: ItemSpec['key'] }) => !!spec.key && spec.key !== 'none' && slotOf(spec.slot).class !== 'held';

const blobB64 = async (sha: string) => bytesToBase64(new Uint8Array(await (await db.getBlob(sha))!.arrayBuffer()));
async function submit(d: Draft, k: number, ctx: RigCtx) {
  const c = d.calls[k], route = d.spec.key, { rig } = ctx.rec.manifest, pad = padOf(d.spec.slot, d.spec.method, rig.cell);
  const label = `M3 ${d.spec.id} call ${k + 1}/${d.calls.length} (${route}${c.kind === 'pose' ? `, pose ${callParts(c.cells).map((p) => p.anim).join(' + ')}/${c.cells[0].split('/')[1]}` : ''})`;
  let req;
  if (c.kind === 'grid') { // B14: the clip-direction as one inpaint-v3 grid, the dress call's keyframes as reference cells
    req = await gridReq(ctx, d.spec, c.cells, await Promise.all([...dressedOf(d.calls)].map(async ([k, o]) => ({ dir: k.split('/')[1] as DirectionName, im: await img(o.sha) }))), c.seed);
  } else if (c.kind === 'pose') { // the direction's dressed keyframe (from the dress call) posed through the base clip's STORED keypoints
    if (route === 'none') throw new Error('posing needs a chroma key');
    const dir = c.cells[0].split('/')[1] as DirectionName, anim = callAnim(c.cells), kf = dressedOf(d.calls).get(restKey(dir));
    if (!kf) throw new Error(`${dir}: no dressed keyframe`);
    const poses = c.cells.map((key) => cellKeypoints(rig, key)), rest = rig.rest?.[dir]?.keypoints;
    if (poses.some((p) => !p) || !rest) throw new Error(`${anim}/${dir}: the rig has no stored keypoints (rig v1.3)`);
    req = itemRoute.pose({ keyframePngB64: await blobB64(kf.sha), rest, poses: poses as Keypoint[][], item: d.spec.prompt, slot: d.spec.slot, key: route, anim, dir, seed: c.seed, cell: rig.cell, pad, view: rig.view });
  } else {
    const frames: string[] = [];
    if (anchored(k, c.kind)) { // anchor cell: the design call's dressed cell 0 (cross-call design lock, S2; B16: dress chunks too)
      const a = recOf(d.calls[0].recId);
      if (a?.state !== 'done') throw new Error('design call not done');
      frames.push(await blobB64(outputsOf(a)[0].sha));
    }
    for (const key of c.cells) frames.push(bytesToBase64(await encodePngBytes(padImg(inputCell(baseCell(ctx, key, c.kind === 'dress'), route), pad))));
    // held (S5): dress the rest views on the 96 canvas, "pointing down and slightly outward", one weapon
    req = itemRoute.edit(frames, itemPrompt(pad ? heldPhrase(d.spec.prompt, d.spec.slot) : d.spec.prompt, route, c.cells, anchored(k, c.kind) ? d.calls[0].cells[0] : undefined), c.seed, { w: rig.cell.w + 2 * pad, h: rig.cell.h + 2 * pad });
  }
  c.recId = (await queue.enqueue(req, { label, tag: 'm3', minimumTier: d.spec.method === 'skel' ? 1 : 0 })).id;
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
  // k = 0 drops every later call (their anchor / keyframes came from the old design); a later dress chunk drops its directions' poses
  const dirs = c.cells.map((x) => x.split('/')[1]), stale = k === 0 ? d.calls.slice(1) : c.kind === 'dress' ? d.calls.filter((l) => l.kind === 'pose' || l.kind === 'grid' ? dirs.includes(l.cells[0].split('/')[1]) : false) : [];
  for (const l of stale) { if (l.recId) l.old.push(l.recId); l.recId = undefined; }
}
function switchKey(d: Draft, to: Key, why: string) {
  d.spec.key = to;
  d.keySwitched = true;
  d.log.push(`switch key to ${d.spec.key} (${why})`);
  // every call restarts on the new key; a grid fallback goes back to a pose call (its kept roll used the old key)
  for (const c of d.calls) { if (c.recId) c.old.push(c.recId); c.recId = undefined; c.rerolls = 0; c.seed = seed(); if (c.kind === 'grid') c.kind = 'pose'; delete c.fallback; }
}
export const failsOf = (res: ItemResult, k: number) => [...(res.g1.has(k) ? [res.g1.get(k)!] : []), ...(res.qa?.failCalls.get(k) ?? [])];
/**
 * Re-roll a failing call (2×), else hand it to review. A design call whose keyframe has key px outside the body (G3) is a key/item
 * color collision: another seed on the same key cannot fix it, so it switches key at once. G2 never signals a collision (key-
 * colored item px count as kept); it fails on erased or moved body px, which a new key cannot fix (round 3 review: the 8
 * collision keyframes on the benchmark keep G2 at 1.000 and fail G3 at 0.023–0.217).
 */
export function retry(d: Draft, k: number, why: string[]): boolean {
  const reasons = why.flatMap((w) => w.split('; ')), c = d.calls[k];
  const to = !d.keySwitched && d.spec.key !== 'none' && (k === 0 || c.kind === 'dress') && reasons.some((w) => w.startsWith('G3')) ? switchTo(d.spec.prompt, d.spec.key) : undefined;
  if (to) switchKey(d, to, reasons.find((w) => w.startsWith('G3'))!);
  else if (c.rerolls < MAX_REROLLS) rerollCall(d, k, reasons.join('; '));
  else { d.log.push(`call ${k + 1} still fails after re-rolls: ${reasons.join('; ')} -> needs review`); return false; }
  return true;
}

/** A pose/edit call that still fails after its re-rolls keeps the roll with the fewest failed checks (free: ledger re-evaluation).
 * Not the dress call (the poses were made from its keyframes); only rolls with the same input images (same dressed keyframe and
 * key: a re-dressed design or a key switch leaves older rolls behind). */
export async function keepBestRoll(d: Draft, k: number, ctx: RigCtx) {
  const c = d.calls[k], same = JSON.stringify(recOf(c.recId)?.inputs);
  const rolls = [...c.old, c.recId].filter((id): id is string => recOf(id)?.state === 'done' && JSON.stringify(recOf(id)!.inputs) === same);
  if (!k || c.kind === 'dress' || rolls.length < 2) return;
  const all = [...c.old, c.recId!];
  let best = c.recId!, n = Infinity;
  for (const id of rolls) { c.recId = id; const f = failsOf(await evaluateItem(d, ctx), k).length; if (f < n) { best = id; n = f; } }
  c.recId = best;
  c.old = all.filter((id) => id !== best); // every paid roll stays in `old` (gensOf counts them)
  d.log.push(`call ${k + 1}: kept roll ${rolls.indexOf(best) + 1} of ${rolls.length} (fewest failed checks: ${n})`);
}

/**
 * B14 per clip-direction fallback: a pose call still failing after its re-rolls (its best roll already kept) is redone ONCE as a
 * Pro inpaint-v3 packed masked grid (S4/S5). When the grid comes back, it stays only if it has fewer failed checks than the
 * kept pose roll; otherwise the pose roll returns (both paid rolls stay in the ledger counts). Returns true when a grid was queued.
 */
async function gridFallback(d: Draft, k: number, ctx: RigCtx): Promise<boolean> {
  const c = d.calls[k];
  // a packed idle + walk call with 5 reference views on a 128 px cell needs 640 px: no grid then, the pose roll is kept
  if (c.kind === 'pose' && !c.fallback && c.recId && gridable(d.spec) && gridFits(ctx.rec.manifest.rig.cell, c.cells.length, dressedOf(d.calls).size)) {
    c.fallback = { recId: c.recId, fails: failsOf(await evaluateItem(d, ctx), k).length };
    c.old.push(c.recId);
    Object.assign(c, { recId: undefined, kind: 'grid', seed: seed(), rerolls: MAX_REROLLS }); // one size-priced grid, no re-rolls
    d.log.push(`call ${k + 1}: still failing after ${MAX_REROLLS} re-rolls, redo as an inpaint-v3 grid`);
    return true;
  }
  if (c.kind === 'grid' && c.fallback && c.recId && recOf(c.recId)?.state === 'done') {
    const n = failsOf(await evaluateItem(d, ctx), k).length, f = c.fallback;
    if (n >= f.fails) {
      c.old = [...c.old.filter((id) => id !== f.recId), c.recId];
      Object.assign(c, { recId: f.recId, kind: 'pose' });
      d.log.push(`call ${k + 1}: the grid was no better (${n} vs ${f.fails} failed checks), kept the pose roll`);
    } else d.log.push(`call ${k + 1}: kept the grid (${n} vs ${f.fails} failed checks)`);
  }
  return false;
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
      // design calls: call 1, then the other dress chunks (B16: they carry call 1's dressed cell 0 as their anchor)
      const nd = Math.max(1, d.calls.filter((c) => c.kind === 'dress').length);
      status('design call');
      const r0 = await runCall(d, 0, ctx, persist);
      if (r0.state !== 'done') { d.log.push(`call 1 ${r0.state}: ${r0.error ?? ''}`); break; }
      const rd = await Promise.all(d.calls.slice(1, nd).map((_, i) => runCall(d, i + 1, ctx, persist)));
      const bd = rd.findIndex((r) => r.state !== 'done');
      if (bd >= 0) { d.log.push(`call ${bd + 2} ${rd[bd].state}: ${rd[bd].error ?? ''}`); break; }
      res = await evalItem();
      const r1 = res, fd = d.calls.slice(0, nd).map((_, k) => k).filter((k) => failsOf(r1, k).length);
      if (fd.map((k) => retry(d, k, failsOf(r1, k))).some(Boolean)) { await persist(); continue; } // out of re-rolls: keep the design (flagged), finish coverage
      status(`calls ${nd + 1}–${d.calls.length}`);
      const rs = await Promise.all(d.calls.slice(nd).map((_, i) => runCall(d, i + nd, ctx, persist)));
      const broken = rs.findIndex((r) => r.state !== 'done');
      if (broken >= 0) { d.log.push(`call ${broken + nd + 1} ${rs[broken].state}: ${rs[broken].error ?? ''}`); break; }
      res = await evalItem();
      const r = res;
      // soft gate (G6 palette drift): re-roll while re-rolls are left, then keep with a warning
      const soft = d.calls.map((_, k) => k).filter((k) => !failsOf(r, k).length && r.qa?.softCalls.has(k) && d.calls[k].rerolls < MAX_REROLLS);
      for (const k of soft) rerollCall(d, k, r.qa!.softCalls.get(k)!.join('; '));
      const bad = d.calls.map((_, k) => k).filter((k) => failsOf(r, k).length);
      if (!bad.length && !soft.length) { d.log.push(`gates passed (${r.qa?.qa.status})`); break; }
      const retried = bad.map((k) => retry(d, k, failsOf(r, k))); // every failing call decides on its own
      // out of re-rolls: keep the call's least-bad roll, not the last one (T3: cape slash N roll 1 had 1 failed check, roll 3 two)
      let grid = false;
      for (const [i, k] of bad.entries()) if (!retried[i]) { await keepBestRoll(d, k, ctx); if (await gridFallback(d, k, ctx)) grid = true; }
      await persist();
      if (!soft.length && !retried.some(Boolean) && !grid) { res = await evalItem(); break; } // nothing left to re-roll: needs review
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
  const pad = padOf(d.spec.slot, d.spec.method, rig.cell), slot = slotOf(d.spec.slot), W = rig.cell.w + 2 * pad, H = rig.cell.h + 2 * pad;
  for (const [k, c] of d.calls.entries()) {
    const r = recOf(c.recId);
    if (r?.state !== 'done') continue;
    if (c.kind === 'grid') { // B14: cut the cells out of the returned grid
      const g = await img(outputsOf(r)[0].sha), rows = Math.ceil((c.cells.length + d.spec.dirs.length) / GRID_COLS);
      if (g.w !== GRID_COLS * W || g.h !== rows * H) { g1.set(k, `G1 grid ${g.w}x${g.h}, expected ${GRID_COLS * W}x${rows * H}`); continue; }
      const cut = cutGrid(g, c.cells.length, W, H);
      c.cells.forEach((key, i) => outs.push({ k, key, out: cut[i], posed: true }));
      continue;
    }
    let o = cellOuts(k, c, r);
    const expected = c.kind === 'pose' ? Math.max(3, c.cells.length) : c.cells.length;
    if (o.length !== expected) { g1.set(k, `G1 ${o.length} outputs for ${expected} requested frames`); continue; }
    if (c.kind === 'pose') {
      const dir = c.cells[0].split('/')[1] as DirectionName;
      const poses = paddedPoses(c.cells.map((key) => cellKeypoints(rig, key)!));
      o = unrotate(o, f0Last(d.spec.slot, rig.rest?.[dir]?.keypoints ?? [], poses, rig.cell)).slice(0, c.cells.length);
    }
    for (const [i, key] of c.cells.entries()) {
      const im = await img(o[i].sha);
      if (im.w !== W || im.h !== H) { g1.set(k, `G1 output ${im.w}x${im.h}`); break; }
      (c.kind === 'dress' ? dressOuts : outs).push({ k, key, out: im, posed: c.kind === 'pose' });
    }
  }
  for (const o of dressOuts) {
    const dir = o.key.split('/')[1] as DirectionName;
    for (const a of rig.animations) if (d.spec.anims.includes(a.id) && (d.spec.clipDirs?.[a.id] ?? d.spec.dirs).includes(dir) && a.cells === 1 && a.sources?.[dir]?.motion === 'imported-rest') outs.push({ ...o, key: `${a.id}/${dir}/0`, posed: true });
  }
  const keyCut: Cuts = {};
  const ex = (o: Out, useCc?: boolean, restView = false) =>
    // ponytail: padded (held) slots have no keypoint band, so the rig-cell skeleton is not shifted
    extractCell({ key: o.key, call: o.k, base: padImg(baseCell(ctx, o.key, restView), pad), out: o.out, route, band: bandOf(d.spec.slot, pad ? undefined : skelOf(ctx, o.key, restView), H), useCc, posed: o.posed, clip: slot.band, held: slot.class === 'held', pad, cut: cutFor(ctx, d.spec.slot, o.key, o.posed, keyCut, restView) });
  // the dress call only makes keyframes: gate them (G2, G3, presence); they are not item cells themselves
  const keys: Partial<Record<DirectionName, Img>> = {}; // dressed keyframe layers per direction (H4)
  const kfCells = dressOuts.map((o) => ex(o, undefined, true));
  for (const [i, c] of kfCells.entries()) { keys[dressOuts[i].key.split('/')[1] as DirectionName] = c.layer; if (c.cut) keyCut[dressOuts[i].key.split('/')[1] as DirectionName] = c.cut; }
  const hidden = hiddenViews(kfCells, keys), hiddenWarnings: string[] = [];
  for (const [i, c] of kfCells.entries()) {
    const o = dressOuts[i];
    if (!c.area && hidden.has(o.key.split('/')[1])) hiddenWarnings.push(`G4 keyframe ${o.key}: no item in this view; check that the view hides it`);
    const bad = [g2Fails(c) && `G2 keyframe ${o.key} key kept ${c.keyKept!.toFixed(3)} (${c.keyLost} px)`,
      c.keyOutside != null && c.keyOutside > GATES.keyOutside && `G3 keyframe ${o.key} key outside ${c.keyOutside.toFixed(3)}`,
      !c.area && !hidden.has(o.key.split('/')[1]) && `G4 keyframe ${o.key}: item missing`,
      // B14: re-roll a smudged design (10 gens) before 36 gens of poses copy it (T3: red cape north hem)
      !GRAYISH.test(d.spec.prompt) && grayShare(c.layer) > DESIGN.gray && `D1 keyframe ${o.key}: ${(grayShare(c.layer) * 100).toFixed(0)} % gray smudges in a colorful design`].filter(Boolean);
    if (bad.length) g1.set(o.k, [g1.get(o.k), ...bad].filter(Boolean).join('; '));
  }
  const run = (useCc?: boolean) => outs.filter((o) => !structuralReason(g1.get(o.k) ?? '')).map((o) => ex(o, useCc));
  let cells = run();
  if (route === 'none' && cells.length) { // per-item novel_cc decision (S1): novel2 lost > 25 % of the area over all cells
    const cc = run(true);
    if (cc.reduce((s, c) => s + c.area, 0) * 0.75 > cells.reduce((s, c) => s + c.area, 0)) cells = cc;
  }
  postProcess(rig, slot, cells, keys, pad);
  const kOut = d.spec.method === 'skel' ? GATES.keyOutsidePosed : GATES.keyOutside;
  const qa = cells.length ? withH4(itemQa(rig, slot, route, cells, d.calls.reduce((s, c) => s + c.old.length, 0), kOut, pad, hidden), slot, cells, keys, rig) : null;
  if (qa && hiddenWarnings.length) { qa.warnings.push(...hiddenWarnings); if (qa.qa.status === 'pass') qa.qa.status = 'warn'; }
  return { cells, qa, g1, preview: qa ? await previewProject(d, ctx, cells, qa) : null };
}
/** itemQa + the H4 keyframe-consistency gate (posed cells only). */
export function withH4(q: QaResult, slot: Slot, cells: CellOut[], keys: Partial<Record<DirectionName, Img>>, rig: Rig): QaResult {
  const h = dirGate(slot, cells, keys, rig);
  for (const [k, why] of h.fails) q.failCalls.set(k, [...(q.failCalls.get(k) ?? []), ...why]);
  q.warnings.push(...h.warnings);
  if (h.fails.size) q.qa.status = 'fail';
  else if (h.warnings.length && q.qa.status === 'pass') q.qa.status = 'warn';
  for (const [clip, summary] of Object.entries(q.qa.clips ?? {})) {
    const part = dirGate(slot, cells.filter((c) => clipOf(c.key) === clip), keys, rig);
    if (part.fails.size) summary.status = 'fail';
    else if (part.warnings.length && summary.status === 'pass') summary.status = 'warn';
  }
  return q;
}
/** The rig project with this draft equipped (for compose previews in every direction, mirrored ones included). */
async function previewProject(d: Draft, ctx: RigCtx, cells: CellOut[], qa: QaResult): Promise<Project> {
  const { item, images } = await buildItem({ spec: JSON.parse(JSON.stringify(d.spec)) as ItemSpec, rig: ctx.rec.manifest.rig, cells, route: d.spec.key, provenance: [], qa: qa.qa, pad: padOf(d.spec.slot, d.spec.method, ctx.rec.manifest.rig.cell) });
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
  if (hasStructuralFailure(r)) throw new Error(`${d.spec.id}: a batch has missing or malformed frames. Try again before keeping this item.`);
  const covered = new Set(r.cells.map((c) => c.key));
  for (const a of d.spec.anims) for (const dir of d.spec.clipDirs?.[a] ?? d.spec.dirs) {
    const clip = ctx.rec.manifest.rig.animations.find((c) => c.id === a);
    if (!clip || Array.from({ length: clip.cells }, (_, i) => `${a}/${dir}/${i}`).some((key) => !covered.has(key))) throw new Error(`${d.spec.id}: a batch has missing or malformed frames. Try again before keeping this item.`);
  }
  if (!r.qa || d.calls.some((c) => recOf(c.recId)?.state !== 'done')) throw new Error(`${d.spec.id}: not all calls are done`);
  const qa = acceptQa(r.qa.qa);
  const dress = d.calls[0].kind === 'dress', dressed: Partial<Record<DirectionName, Img>> = {};
  if (dress) for (const [k, o] of dressedOf(d.calls)) dressed[k.split('/')[1] as DirectionName] = await img(o.sha);
  const { item, images } = await buildItem({
    spec: JSON.parse(JSON.stringify(d.spec)) as ItemSpec, rig: ctx.rec.manifest.rig, cells: r.cells, route: d.spec.key, qa, ...(dress ? { dressed } : {}), pad: padOf(d.spec.slot, d.spec.method, ctx.rec.manifest.rig.cell),
    provenance: d.calls.map((c) => toProv(recOf(c.recId)!, c)), anchorCell: d.calls.length > 1 ? d.calls[0].cells[0] : undefined,
  });
  const designWarnings = [...new Set([...r.g1.values()].flatMap((why) => why.split(/;\s*/)))];
  if (designWarnings.length) item.designWarnings = designWarnings;
  await saveItem(d.rigId, item, images, SLOTS);
  d.acceptedAt = new Date().toISOString();
  return { item, cells: images.size };
}

// ---------- new clips on accepted items (architecture §4.1: "adding a clip later = one pose call per item-direction") ----------
/** Accepted skeleton-pose items that can be posed onto a new clip (dressed keyframes + key, made for this base). */
export const posable = (m: Manifest) => m.items.filter((i) => i.slot !== 'body' && i.route === 'skeleton-pose' && i.key && i.dressed && i.baseHash === m.rig.baseHash);
/** Gens for posing `n` items onto a clip of `cells` frames in `dirs` directions. */
export const poseGens = (n: number, cells: number, dirs: number) => n * dirs * poseGensFor(cells);
const seedOf = (s: string) => 1 + ([...s].reduce((h, c) => (h * 31 + c.charCodeAt(0)) >>> 0, 7) % 2_000_000);

/**
 * Pose an accepted item's dressed keyframes through a clip's stored keypoints (one call per generated direction, one re-roll
 * on a failed gate), extract the layer and write the clip's cells into the item. Seeds derive from item/clip/direction, so a
 * reload re-attaches to the ledger. `moveSeed` (the move's seed) joins the seed, so a move's "Try again" re-rolls the poses
 * instead of re-reading the cached ones (R6 P2-7). Returns the clip QA.
 */
export async function poseItemClip(ctx: RigCtx, item: Item, anim: string, onCall: () => void = () => {}, moveSeed?: number, selectedDirs?: DirectionName[], activityScope?: string): Promise<QaResult> {
  const { rig } = ctx.rec.manifest, slot = slotOf(item.slot), key = item.key!, pad = ((item.layers[0].cell?.w ?? rig.cell.w) - rig.cell.w) / 2;
  const available = rig.directions.filter((d) => !d.mirrorOf && item.dressed?.[d.id]).map((d) => d.id);
  if (selectedDirs && (!selectedDirs.length || new Set(selectedDirs).size !== selectedDirs.length || selectedDirs.some(d => !available.includes(d)))) throw new Error('Choose supported independently drawn equipment directions.');
  const dirs = selectedDirs ?? available;
  const prov: Provenance[] = [], keys: Partial<Record<DirectionName, Img>> = {};
  let rerolls = 0; // actual additional attempted calls, independent of which candidate wins
  const { keys: k0, cuts, hidden } = await dressedKeys(ctx, item, pad);
  Object.assign(keys, k0);
  const perDir = await Promise.all(dirs.map(async (dir, k) => {
    const allPoses = clipKeypoints(rig, anim, dir), rest = rig.rest?.[dir]?.keypoints;
    if (!allPoses || !rest) throw new Error(`${anim}/${dir}: no stored keypoints`);
    const collected: CellOut[] = [];
    for (const { start, count } of poseBatches(allPoses.length)) {
    const poses = allPoses.slice(start, start + count), cells = poses.map((_, i) => `${anim}/${dir}/${start + i}`);
    let best: CellOut[] = [], bestProv: Provenance | undefined, bestFails = Infinity;
    for (let attempt = 0; attempt < 2; attempt++) {
      const seed = seedOf(`${item.id}/${anim}/${dir}/${attempt}${allPoses.length > 15 ? `/batch-${start}` : ''}${moveSeed ? `/${moveSeed}` : ''}`);
      const req = itemRoute.pose({ keyframePngB64: await blobB64(item.dressed![dir]!.slice(7)), rest, poses, item: item.prompt, slot: item.slot, key, anim, dir, seed, cell: rig.cell, pad, view: rig.view });
      const rec = await queue.enqueue(req, { label: `pose ${item.name} · ${anim} ${dir}`, tag: 'studio-move', activityScope, minimumTier: 1 });
      const r = terminal(rec) ? rec : await settled(rec.id);
      onCall();
      if (attempt) rerolls++;
      if (r.state !== 'done') throw new Error(`${item.name} ${anim} ${dir}: ${r.state} ${r.error ?? ''}`);
      const outputs = outputsOf(r);
      if (outputs.length !== Math.max(3, cells.length)) continue; // G1: re-roll
      const outs = unrotate(outputs, f0Last(item.slot, rest, paddedPoses(poses), rig.cell)).slice(0, cells.length);
      const images = await Promise.all(outs.map((o) => img(o.sha)));
      if (images.some((im) => im.w !== rig.cell.w + 2 * pad || im.h !== rig.cell.h + 2 * pad)) continue; // G1: wrong geometry is not a candidate
      const candidate = cells.map((c, i) => extractCell({ key: c, call: k, base: padImg(baseCell(ctx, c), pad), out: images[i], route: key, band: bandOf(item.slot, pad ? undefined : skelOf(ctx, c), rig.cell.h + 2 * pad), posed: true, clip: slot.band, held: slot.class === 'held', pad, cut: cutFor(ctx, item.slot, c, true, cuts) }));
      postProcess(rig, slot, candidate, keys, pad);
      const fails = failCount(withH4(itemQa(rig, slot, key, candidate, attempt, GATES.keyOutsidePosed, pad, hidden), slot, candidate, keys, rig));
      // Keep pixels and provenance together. A later equal/worse or malformed roll cannot replace the earlier candidate.
      if (fails < bestFails) { best = candidate; bestFails = fails; bestProv = toProv(r, { cells, seed, rerolls: attempt, old: [] }); }
      if (!fails) break;
    }
    if (!best.length) throw new Error(`${item.name} ${anim} ${dir}: PixelLab returned missing or malformed frames twice. Try again.`); // R6 P2-13: never save a direction with empty cells
    if (bestFails && gridable(item)) { // B14: still failing after the re-roll -> one inpaint-v3 grid, kept only if it is better
      const g = await gridItemClip(ctx, item, anim, dir, k, keys, cuts, seedOf(`${item.id}/${anim}/${dir}/grid-${start}${moveSeed ? `/${moveSeed}` : ''}`), cells, activityScope);
      onCall();
      rerolls++;
      if (failCount(withH4(itemQa(rig, slot, key, g.cells, 2, GATES.keyOutsidePosed, pad, hidden), slot, g.cells, keys, rig)) < bestFails) { best = g.cells; bestProv = g.prov; }
    }
    prov.push(bestProv!);
    collected.push(...best);
    }
    return collected;
  }));
  const cells = perDir.flat();
  if (!cells.length) throw new Error(`${item.name}: PixelLab returned no usable ${anim} frames`);
  const q = withH4(itemQa(rig, slot, key, cells, rerolls, GATES.keyOutsidePosed, pad, hidden), slot, cells, keys, rig);
  await mergeClip(ctx, item, anim, dirs, cells, prov, q, pad);
  return q;
}
const failCount = (q: QaResult) => [...q.failCalls.values()].flat().length;
/** Write a clip's cells (the given directions only) into an accepted item, with their provenance and QA. */
export async function mergeClip(ctx: RigCtx, item: Item, anim: string, dirs: DirectionName[], cells: CellOut[], prov: Provenance[], q: QaResult, pad = 0) {
  const { rig } = ctx.rec.manifest, key = item.key!;
  const version = stableStringify({ rig, character: ctx.rec.character }), originalItem = stableStringify(item);
  const count = rig.animations.find((a) => a.id === anim)?.cells;
  const expected = new Set(dirs.flatMap((d) => Array.from({ length: count ?? 0 }, (_, i) => `${anim}/${d}/${i}`)));
  if (!count || !expected.size || cells.length !== expected.size || new Set(cells.map((c) => c.key)).size !== expected.size || cells.some((c) => !expected.has(c.key))
    || Object.keys(q.qa.cells).length !== expected.size || Object.keys(q.qa.cells).some((k) => !expected.has(k))
    || dirs.some((d) => !q.qa.clips?.[`${anim}/${d}`]) || Object.keys(q.qa.clips ?? {}).length !== new Set(dirs).size)
    throw new Error('Move QA requires every frame of each replaced direction');
  const spec: ItemSpec = { id: item.id, name: item.name, slot: item.slot, prompt: item.prompt, key, anims: [anim], dirs, method: 'skel' };
  const built = await buildItem({ spec, rig, cells, route: key, provenance: [], qa: q.qa, pad });
  const out: Item = structuredClone(item);
  out.layers.forEach((l, j) => { l.cells = { ...l.cells, [anim]: { ...l.cells?.[anim], ...built.item.layers[j].cells![anim] } }; });
  dropCut(out, anim, dirs); // replaced directions take their new cut, never a stale one
  for (const d of dirs) { const c = built.item.baseCut?.[anim]?.[d]; if (c) ((out.baseCut ??= {})[anim] ??= {})[d] = c; }
  // Per-direction call numbers are local to this move; records arrive in completion order (and may be grid fallbacks).
  // Resolve the selected record by its produced keys, then offset into the item's full provenance history.
  const source = new Map(prov.flatMap((p, i) => p.produced.map((k) => [k, item.provenance.length + i] as const)));
  const qaCells = Object.fromEntries(Object.entries(q.qa.cells).map(([k, c]) => {
    const provenance = source.get(k as keyof typeof q.qa.cells);
    if (provenance == null) throw new Error(`No source record for ${k}`);
    return [k, { ...c, provenance }];
  }));
  out.provenance = [...out.provenance, ...prov];
  out.qa = mergeQa(item, q.qa, qaCells);
  await saveItem(ctx.rec.id, out, built.images, SLOTS, current => {
    if (stableStringify({ rig: current.manifest.rig, character: current.character }) !== version || stableStringify(current.manifest.items.find(i => i.id === item.id)) !== originalItem) throw new Error('This character or item changed while the repair was generating. Existing artwork was kept. Reopen it before trying again.');
  });
}
/** Prepare a bounded frozen-frame edit without making an API call, for visible review and execution. */
export async function gridRepairRequest(ctx: RigCtx, item: Item, anim: string, dir: DirectionName, seed: number, selectedCells?: string[]): Promise<Req> {
  const { rig } = ctx.rec.manifest;
  if (!item.key || !item.dressed?.[dir] || !rig.directions.some(d => d.id === dir && !d.mirrorOf) || item.baseHash !== rig.baseHash) throw new Error('This equipment cannot be repaired against the current character view.');
  const cells = selectedCells ?? Array.from({ length: rig.animations.find(a => a.id === anim)?.cells ?? 0 }, (_, i) => `${anim}/${dir}/${i}`);
  const count = rig.animations.find(a => a.id === anim)?.cells ?? 0;
  if (!cells.length || new Set(cells).size !== cells.length || cells.some(k => { const parts = k.split('/'); return parts.length !== 3 || parts[0] !== anim || parts[1] !== dir || !/^(0|[1-9][0-9]*)$/.test(parts[2]) || +parts[2] >= count; })) throw new Error('Choose unique existing frames from this move and direction to repair.');
  const pad = ((item.layers[0].cell?.w ?? rig.cell.w) - rig.cell.w) / 2;
  if (!Number.isInteger(pad) || pad < 0 || item.layers.some(l => (l.cell?.w ?? rig.cell.w) !== rig.cell.w + 2 * pad || (l.cell?.h ?? rig.cell.h) !== rig.cell.h + 2 * pad)) throw new Error('Equipment layers use incompatible repair dimensions.');
  const refs = await Promise.all((Object.entries(item.dressed) as [DirectionName, string][]).map(async ([d, h]) => ({ dir: d, im: await img(h.slice(7)) })));
  return gridReq(ctx, { slot: item.slot, prompt: item.prompt, key: item.key }, cells, refs, seed, pad);
}
/** One clip-direction edited on its own canvas; body frames remain frozen and reference cells are protected. */
async function gridItemClip(ctx: RigCtx, item: Item, anim: string, dir: DirectionName, call: number, keys: Partial<Record<DirectionName, Img>>, cuts: Cuts, seed: number, selectedCells?: string[], activityScope?: string): Promise<{ cells: CellOut[]; prov: Provenance }> {
  const { rig } = ctx.rec.manifest, slot = slotOf(item.slot), pad = ((item.layers[0].cell?.w ?? rig.cell.w) - rig.cell.w) / 2;
  const cells = selectedCells ?? Array.from({ length: rig.animations.find(a => a.id === anim)!.cells }, (_, i) => `${anim}/${dir}/${i}`), n = cells.length;
  const rec = await queue.enqueue(await gridRepairRequest(ctx, item, anim, dir, seed, cells), { label: `grid ${item.name} · ${anim} ${dir}`, tag: 'studio-move', activityScope, minimumTier: 1 });
  const r = terminal(rec) ? rec : await settled(rec.id);
  if (r.state !== 'done') throw new Error(`${item.name} ${anim} ${dir} grid: ${r.state} ${r.error ?? ''}`);
  if (outputsOf(r).length !== 1) throw new Error('PixelLab returned a malformed repair grid. Existing artwork was kept.');
  const g = await img(outputsOf(r)[0].sha), w = rig.cell.w + 2 * pad, h = rig.cell.h + 2 * pad, rows = Math.ceil((n + Object.keys(item.dressed!).length) / GRID_COLS);
  if (g.w !== GRID_COLS * w || g.h !== rows * h) throw new Error(`${item.name} ${anim} ${dir}: PixelLab returned a grid with the wrong frame layout`);
  const cut = cutGrid(g, n, w, h);
  const out = cells.map((c, i) => extractCell({ key: c, call, base: padImg(baseCell(ctx, c), pad), out: cut[i], route: item.key!, band: bandOf(item.slot, pad ? undefined : skelOf(ctx, c), h), posed: true, clip: slot.band, held: slot.class === 'held', pad, cut: cutFor(ctx, item.slot, c, true, cuts) }));
  postProcess(rig, slot, out, keys, pad);
  return { cells: out, prov: toProv(r, { cells, seed, rerolls: 0, old: [] }) };
}
/**
 * B14: redo one clip-direction of an accepted (rig-cell) item as an inpaint-v3 grid and keep it when it passes every gate
 * (the stored clip failed QA after its re-rolls, e.g. T3's cape wrapping the raised arm in slash north). Returns the grid's QA.
 */
export async function regridClip(ctx: RigCtx, item: Item, anim: string, dir: DirectionName, seedN = seed()): Promise<{ qa: QaResult; saved: boolean; cells: CellOut[] }> {
  const { rig } = ctx.rec.manifest, slot = slotOf(item.slot), key = item.key!;
  if (!item.key || !item.dressed?.[dir]) throw new Error(`${item.name}: no grid reference for this item`);
  const pad = ((item.layers[0].cell?.w ?? rig.cell.w) - rig.cell.w) / 2;
  const { keys, cuts, hidden } = await dressedKeys(ctx, item, pad);
  const g = await gridItemClip(ctx, item, anim, dir, 0, keys, cuts, seedN);
  const qa = withH4(itemQa(rig, slot, key, g.cells, 0, GATES.keyOutsidePosed, pad, hidden), slot, g.cells, keys, rig);
  const saved = !qa.failCalls.size;
  if (saved) await mergeClip(ctx, item, anim, [dir], g.cells, [g.prov], qa, pad);
  return { qa, saved, cells: g.cells };
}

/** B16 fake-API check: an 8-direction held dress never sends edit-animation-v2 more frames than its size takes, every direction
 *  gets its own dressed keyframe back (the anchor's output is dropped), and re-rolling a later chunk only redoes its poses. */
export function selfTest() {
  const rig = { cell: { w: 64, h: 64 }, animations: [{ id: 'idle', cells: 4 }, { id: 'walk', cells: 8 }] } as unknown as Manifest['rig'];
  const dirs: DirectionName[] = ['south', 'south-east', 'east', 'north-east', 'north'], pad = padOf('main_hand', 'skel');
  const plan = planItem(rig, { anims: ['idle', 'walk'], dirs, method: 'skel', key: 'green', slot: 'main_hand' });
  const calls: CallState[] = plan.map((c, i) => ({ ...c, seed: i, rerolls: 0, old: [], recId: `r${i}` }));
  const recs = new Map<string, JobRec>();
  for (const [k, c] of calls.entries()) {
    if (c.kind !== 'dress') continue;
    // the frames submit() sends: [anchor], then the chunk's padded rest cells; the fake API answers one output per frame
    const frames = [...(anchored(k, c.kind) ? ['anchor'] : []), ...c.cells];
    const req = itemRoute.edit(frames, 'x', 1, { w: rig.cell.w + 2 * pad, h: rig.cell.h + 2 * pad }), body = req.body as { frames: unknown[]; image_size: { width: number } };
    console.assert(body.frames.length >= 2 && body.frames.length <= editFrameCap(body.image_size.width), `dress call ${k + 1}: ${body.frames.length} frames at ${body.image_size.width} px (cap ${editFrameCap(body.image_size.width)})`);
    recs.set(c.recId!, { id: c.recId, state: 'done', jobs: [{ results: frames.map((f, i) => ({ label: String(i), sha: f })) }] } as unknown as JobRec);
  }
  const m = dressedOf(calls, (id) => recs.get(id!));
  console.assert(calls.filter((c) => c.kind === 'dress').length === 2 && dirs.every((d) => m.get(restKey(d))?.sha === restKey(d)), `8-dir held dress: every direction dressed once (${[...m.keys()]})`);
  console.assert(planGens(plan) === 2 * 10 + 10 * 3, `8-dir held cost ${planGens(plan)}`);
  const d = { spec: {}, calls, log: [] } as unknown as Draft;
  rerollCall(d, 1, 'test');
  console.assert(calls.filter((c) => !c.recId).map((c) => c.cells[0].split('/').slice(0, 2).join('/')).join() === 'rest/north,idle/north,walk/north', 'a later dress chunk re-roll redoes only its poses');
}


export interface ItemPaletteRepairPlan {
  version: typeof ITEM_PALETTE_POLICY;
  fingerprint: string;
  materialId: string;
  changedPixels: number;
  changedFrames: number[];
  unmatchedPixels: number;
}
const paletteVersion = (rec: StoredProject, itemId: string) => stableStringify({
  rig: rec.manifest.rig, character: rec.character,
  item: rec.manifest.items.find(i => i.id === itemId), materials: rec.manifest.materials,
});
/** Inspect only stored equipment pixels. No queue, PixelLab call, material membership edit or image mutation. */
async function prepareItemPalette(projectId: string, itemId: string, anim: string, dir: DirectionName) {
  const ctx = await loadProject(projectId), { rig } = ctx.rec.manifest, item = ctx.rec.manifest.items.find(i => i.id === itemId);
  const count = rig.animations.find(a => a.id === anim)?.cells;
  if (!item || item.slot === 'body' || item.status !== 'accepted' || item.baseHash !== rig.baseHash || !count || !rig.directions.some(d => d.id === dir && !d.mirrorOf)) throw new Error('Choose an accepted item and an authored view of an existing move to match colors.');
  const matcher = itemPaletteMatcher(item, ctx.rec.manifest.materials), next = structuredClone(item), images = new Map<Sha256, Img>();
  const frames = new Map<number, { cell: number; changedPixels: number; layers: { id: string; before: Sha256; after: Sha256 }[] }>();
  let changedPixels = 0, unmatchedPixels = 0;
  for (const [j, layer] of item.layers.entries()) {
    const row = layer.cells?.[anim]?.[dir];
    if (!row || row.length !== count) throw new Error('Color matching needs every stored frame in this view.');
    for (const [i, before] of row.entries()) {
      if (!before) continue;
      const original = ctx.project.images.get(before);
      if (!original) throw new Error('An equipment frame is missing. Existing colors were kept.');
      const r = matcher.apply(original); unmatchedPixels += r.unmatchedPixels;
      if (!r.changedPixels) continue;
      // Only RGB can change; exact dimensions, alpha and all pixel positions are retained.
      if (r.image.w !== original.w || r.image.h !== original.h || r.image.data.some((v, k) => k % 4 === 3 && v !== original.data[k])) throw new Error('Color matching cannot change equipment geometry.');
      const after = await cellHash(r.image); images.set(after, r.image); next.layers[j].cells![anim][dir]![i] = after;
      const frame = frames.get(i) ?? { cell: i, changedPixels: 0, layers: [] };
      frame.changedPixels += r.changedPixels; frame.layers.push({ id: layer.id, before, after }); frames.set(i, frame); changedPixels += r.changedPixels;
    }
  }
  if (!changedPixels) throw new Error('No eligible colors need matching in this view.');
  const version = paletteVersion(ctx.rec, itemId), edits = [...frames.values()].sort((a, b) => a.cell - b.cell);
  const plan: ItemPaletteRepairPlan = { version: ITEM_PALETTE_POLICY, fingerprint: await sha256(stableStringify({ projectId, anim, dir, version })), materialId: matcher.materialId, changedPixels, changedFrames: edits.map(f => f.cell), unmatchedPixels };
  next.paletteRepairs = [...(next.paletteRepairs ?? []), { version: ITEM_PALETTE_POLICY, materialId: matcher.materialId, anim, dir, frames: edits }];
  if (!validPaletteRepairs(next.paletteRepairs)) throw new Error('This color correction exceeds the supported history format. Existing colors were kept.');
  return { plan, version, next, images };
}
/** A free, explicit preview; unsupported/ambiguous color families remain unchanged. */
export async function itemPaletteRepairPlan(projectId: string, itemId: string, anim: string, dir: DirectionName): Promise<ItemPaletteRepairPlan> {
  return (await prepareItemPalette(projectId, itemId, anim, dir)).plan;
}
/** Apply exactly the reviewed free edit, atomically. Historical QA flags and original paid provenance are preserved. */
export async function matchItemColors(projectId: string, itemId: string, anim: string, dir: DirectionName, reviewed: ItemPaletteRepairPlan): Promise<void> {
  const prepared = await prepareItemPalette(projectId, itemId, anim, dir);
  if (stableStringify(prepared.plan) !== stableStringify(reviewed)) throw new Error('This item or its colors changed. Review the color match again.');
  await saveItem(projectId, prepared.next, prepared.images, [], current => {
    if (paletteVersion(current, itemId) !== prepared.version) throw new Error('This item, body or material changed. Existing colors were kept; review again.');
  });
}
