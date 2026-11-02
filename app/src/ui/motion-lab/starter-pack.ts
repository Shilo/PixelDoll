// Narrow managed-motion pilot. Uses the existing paid queue; no timers or automatic paid continuations.
import * as db from '../../lib/store/db.ts';
import { loadProject, type StoredProject } from '../../lib/store/project.ts';
import { api } from '../../lib/pixellab/client.ts';
import type { JobRec } from '../../lib/pixellab/queue.ts';
import { routes } from '../../lib/pixellab/routes.ts';
import { decodePngBytes, encodePngBytes } from '../../lib/image/pngraw.ts';
import { cellHash, DIRECTIONS, type DirectionName } from '../../lib/rig/rig.ts';
import { sha256, stableStringify } from '../../lib/image/hash.ts';
import { createStarterPlan, starterRequest, validateStarterReceipt, matchStarterFrames, type StarterPlan, type StarterPresetId, type StarterReceipt, type StarterNativeFrame } from '../../lib/rig/starter-presets.ts';
import { labQueue, LAB_TAG } from './run.ts';

export const STARTER_KEY = 'pixeldoll.starterPack.2026-11-02';
const SOURCE_PREFIX = 'starter-source-';
// Local motion cap. The owner's separate allowance ledgers are reconciled manually, not enforced by this counter.
export const STARTER_CAP = 150;
export interface StarterPilotReview { binding: string; animationGroupId: string; frames: { direction: DirectionName; index: number; hash: string }[]; notes: string }
export interface StarterCall { id: string; plan: StarterPlan; directions: DirectionName[]; units: number; recordId?: string; pilotReview?: StarterPilotReview; error?: string; resolvedNotSentAt?: string }
export interface StarterSelection { projectId: string; binding: string }
export interface StarterSession { version: 1; projectId: string; sourceSnapshotId?: string; plans: Partial<Record<StarterPresetId, StarterPlan>>; calls: StarterCall[] }
export const emptyStarter = (): StarterSession => ({ version: 1, projectId: '', plans: {}, calls: [] });
export function readStarter(): StarterSession {
  const raw = localStorage.getItem(STARTER_KEY);
  if (!raw) return emptyStarter();
  const value = JSON.parse(raw) as StarterSession;
  if (value.version !== 1 || typeof value.projectId !== 'string' || (value.sourceSnapshotId !== undefined && (typeof value.sourceSnapshotId !== 'string' || !value.sourceSnapshotId.startsWith(SOURCE_PREFIX))) || !value.plans || !Array.isArray(value.calls) || value.calls.some(c => !c.id || !Array.isArray(c.directions) || c.units !== c.directions.length * 4)) throw new Error('Invalid starter ledger. Preserve its evidence before replacing it.');
  for (const plan of Object.values(value.plans)) starterRequest(plan);
  for (const call of value.calls) starterRequest(call.plan);
  return value;
}
function save(value: StarterSession) { localStorage.setItem(STARTER_KEY, JSON.stringify(value)); }
async function locked<T>(fn: () => Promise<T>): Promise<T> {
  if (!navigator.locks) throw new Error('Starter generation requires browser Web Locks.');
  return navigator.locks.request(STARTER_KEY, fn);
}
async function sourceSnapshotId(state: Pick<StarterSession, 'projectId' | 'plans'>): Promise<string> {
  if (!state.projectId) throw new Error('Prepare an exact native source before loading its pinned artwork.');
  const plans = (['idle','walk','slash'] as const).map(id => {
    const plan = state.plans[id];
    if (!plan) throw new Error('All three starter plans are required to identify the pinned source.');
    starterRequest(plan);
    return [id, plan.binding];
  });
  return SOURCE_PREFIX + await sha256(stableStringify({ projectId: state.projectId, plans }));
}
async function checkedSource(state: StarterSession, loaded: Awaited<ReturnType<typeof loadProject>>): Promise<Awaited<ReturnType<typeof loadProject>>> {
  const { rec, project } = loaded;
  if (!rec.character || rec.id !== state.sourceSnapshotId || rec.origin !== 'dev') throw new Error('The pinned starter source identity is invalid. Preserve its evidence before replacing it.');
  for (const id of ['idle','walk','slash'] as const) {
    const plan = state.plans[id];
    if (!plan || createStarterPlan(rec.character.id, rec.manifest.rig, id, plan.directions, plan.seed).binding !== plan.binding) throw new Error('The pinned starter source metadata differs from its prepared plans.');
  }
  for (const reference of state.plans.idle!.source.rest) {
    const image = project.images.get(reference.image);
    if (!image || await cellHash(image) !== reference.image) throw new Error('The pinned starter standing pixels differ from their exact source binding.');
  }
  return loaded;
}
/** A project record, unlike localStorage hashes, keeps source blobs reachable by the existing garbage collector. */
async function pinSource(state: StarterSession, loaded: Awaited<ReturnType<typeof loadProject>>): Promise<string> {
  const id = await sourceSnapshotId(state), pinned = { ...state, sourceSnapshotId: id };
  if (await db.get<StoredProject>('projects', id)) {
    await checkedSource(pinned, await loadProject(id));
    return id;
  }
  const rec = structuredClone(loaded.rec), images = new Map<string, Blob>();
  rec.id = id; rec.origin = 'dev'; rec.savedAt = new Date().toISOString();
  delete rec.creationSpec; delete rec.moveRecovery;
  for (const [hash, image] of loaded.project.images) {
    if (await cellHash(image) !== hash) throw new Error('Stored source pixels differ from their image identity. The source was not pinned.');
    images.set(hash.slice(7), new Blob([await encodePngBytes(image) as Uint8Array<ArrayBuffer>], { type: 'image/png' }));
  }
  await checkedSource(pinned, { rec, project: { manifest: rec.manifest, images: loaded.project.images } });
  await db.putCharacter(id, rec, images); // Atomic snapshot and blobs; preparation never publishes a half-pinned source.
  return id;
}
/** Review/export uses immutable pinned art; paid submission deliberately rechecks the original selected project. */
export async function loadStarterSource(state: StarterSession): Promise<Awaited<ReturnType<typeof loadProject>>> {
  if (!state.sourceSnapshotId) throw new Error('Prepare the native source once to pin its artwork before reviewing or exporting. No regeneration is required.');
  if (state.sourceSnapshotId !== await sourceSnapshotId(state)) throw new Error('The pinned starter source does not match this exact prepared session.');
  return checkedSource(state, await loadProject(state.sourceSnapshotId));
}
export async function prepareStarter(projectId: string): Promise<StarterSession> {
  return locked(async () => {
    const loaded = await loadProject(projectId), { rec } = loaded;
    if (!rec.character?.id) throw new Error('Create or register an eight-view Unique 8 humanoid in Studio first.');
    const seed = crypto.getRandomValues(new Uint32Array(1))[0] % 1_000_000;
    const state = readStarter();
    const plans: StarterSession['plans'] = {};
    for (const id of ['idle','walk','slash'] as const) {
      const candidates = [state.plans[id], ...state.calls.filter(c=>c.plan.preset===id).map(c=>c.plan)].filter((p):p is StarterPlan=>!!p);
      const retained = candidates.find(p=>createStarterPlan(rec.character!.id,rec.manifest.rig,id,DIRECTIONS,p.seed).binding===p.binding);
      plans[id] = retained ?? createStarterPlan(rec.character.id,rec.manifest.rig,id,DIRECTIONS,seed);
    }
    const same = (['idle','walk','slash'] as const).every(id=>plans[id]!.binding===state.plans[id]?.binding);
    if (!same && state.calls.length) {
      const jobs = await starterJobs(state);
      if (state.calls.some(c=>!c.resolvedNotSentAt&&(!c.recordId||jobs.get(c.recordId)?.state!=='done'))) throw new Error('A reserved or uncertain starter attempt remains. Preserve and resolve its evidence before preparing different artwork; preparation cannot create a paid retry.');
    }
    state.projectId = projectId;
    state.plans = plans;
    state.sourceSnapshotId = await pinSource(state, loaded);
    save(state);
    return state;
  });
}
export async function starterJobs(state: StarterSession): Promise<Map<string, JobRec>> {
  const jobs = new Map<string, JobRec>();
  for (const row of state.calls) if (row.recordId && !row.resolvedNotSentAt) {
    const job = await db.get<JobRec>('jobs', row.recordId);
    if (!job) throw new Error('A reserved starter job is missing. It cannot be safely resent.');
    jobs.set(row.recordId, job);
  }
  return jobs;
}
export function starterHeld(state: StarterSession, jobs: Map<string, JobRec>): number {
  return state.calls.reduce((sum, call) => {
    if (call.resolvedNotSentAt) return sum;
    const job=call.recordId?jobs.get(call.recordId):undefined, billed=job?.gens??0;
    if(!Number.isFinite(call.units)||call.units<=0||!Number.isFinite(billed)||billed<0||(job&&(!Number.isFinite(job.usd)||job.usd<0)))throw new Error('Starter billing is invalid or unverified. No further paid work can be safely priced.');
    const total=sum+Math.max(call.units,billed);if(!Number.isFinite(total))throw new Error('Starter billing exceeds the supported numeric range.');return total;
  }, 0);
}
function history(state: StarterSession, plan: StarterPlan, jobs: Map<string, JobRec>): StarterReceipt[] {
  const receipts: StarterReceipt[] = [];
  for (const call of state.calls.filter(c => c.plan.binding === plan.binding && !c.resolvedNotSentAt)) {
    const job = call.recordId && jobs.get(call.recordId);
    if (!job || job.state !== 'done') throw new Error('Review the reserved or unfinished starter call. It will not be automatically resent or replaced.');
    receipts.push(validateStarterReceipt(plan, call.directions, job.response, receipts));
  }
  return receipts;
}
/** Verify exact standing art on the server before any motion is purchased. GET and CDN reads only. */
export async function verifyStarterSource(plan: StarterPlan, key: string): Promise<void> {
  const character = await api<{ id?: string; template_id?:string;view?:string|null; rotation_urls?: Partial<Record<DirectionName, string>> }>(key, 'GET', routes.getCharacter(plan.characterId).path);
  if (character.id !== plan.characterId) throw new Error('The server character identity differs from the prepared source.');
  if(character.template_id!==plan.source.template||character.view!==plan.source.view)throw new Error('The server camera or humanoid model differs from the prepared source, or is unverified. No motion was submitted.');
  for (const reference of plan.source.rest) {
    const address = character.rotation_urls?.[reference.direction];
    if (!address) throw new Error(`${reference.direction}: server standing artwork is missing.`);
    const url = new URL(address);
    if (url.protocol !== 'https:' || !url.hostname.endsWith('.pixellab.ai') || url.username || url.password) throw new Error('Unexpected standing-art download origin.');
    const response = await fetch(url);
    if (!response.ok) throw new Error(`Standing-art verification failed (${response.status}).`);
    const image = await decodePngBytes(new Uint8Array(await response.arrayBuffer()));
    if (image.w !== plan.source.cell.w || image.h !== plan.source.cell.h || await cellHash(image) !== reference.image) throw new Error(`${reference.direction}: server artwork differs from the exact prepared standing view. No motion was submitted.`);
  }
}
/** One explicit priced click. Pilot first; further directions require a reviewed completed receipt of the same group. */
export async function submitStarter(preset: StarterPresetId, directions: DirectionName[], expected: StarterSelection, pilotReview?: StarterPilotReview): Promise<StarterSession> {
  return locked(async () => {
    if (!labQueue.key) throw new Error('Connect the local agent server before purchasing starter motion.');
    const state = readStarter(), plan = state.plans[preset];
    if (!plan) throw new Error('Prepare an exact native source first.');
    if (!expected || state.projectId !== expected.projectId || plan.binding !== expected.binding) throw new Error('The prepared source changed in another tab. Refresh and review the displayed source before purchasing motion.');
    const { rec, project } = await loadProject(state.projectId);
    if (!rec.character || createStarterPlan(rec.character.id, rec.manifest.rig, preset, plan.directions, plan.seed).binding !== plan.binding) throw new Error('The source changed since preparation. No motion was submitted.');
    for(const reference of plan.source.rest){const image=project.images.get(reference.image);if(!image||await cellHash(image)!==reference.image)throw new Error('Stored standing pixels differ from their source binding. No motion was submitted.');}
    const jobs = await starterJobs(state), receipts = history(state, plan, jobs), request = starterRequest(plan, directions, receipts);
    if (!receipts.length && directions.join() !== 'south,east') throw new Error('Start with the south/east pilot before extending its shared motion.');
    if (receipts.length) {
      if (typeof pilotReview?.notes!=='string'||!pilotReview.notes.trim()) throw new Error('Record a visual review of the completed pilot before purchasing more directions.');
      const expected = await describeStarterPilot(await starterFrames(state, preset, jobs, false));
      const { notes, ...reviewed } = pilotReview;
      if(stableStringify(reviewed)!==stableStringify(expected)) throw new Error('The reviewed pilot source, group or native pixels changed. Inspect the exact completed action again before purchasing more views.');
    }
    const units = directions.length * 4;
    if (starterHeld(state, jobs) + units > STARTER_CAP) throw new Error('The bounded starter allocation is exhausted. No paid request was made.');
    await verifyStarterSource(plan, labQueue.key);
    const call: StarterCall = { id: crypto.randomUUID(), plan, directions: [...directions], units, ...(pilotReview?{pilotReview:structuredClone(pilotReview)}:{}) };
    state.calls.push(call);
    save(state); // A missing response or even a missing local job ID retains the hold and blocks replay.
    try {
      const resolved = state.calls.some(c=>c.plan.binding===plan.binding&&c.resolvedNotSentAt);
      const job = await labQueue.enqueue(request, { label: `Starter ${preset} · ${directions.join(', ')}`, tag: LAB_TAG, playerRequested: true, resumeSafe: !resolved });
      call.recordId = job.id;
      save(state);
    } catch (error) {
      call.error = error instanceof Error ? error.message : String(error);
      save(state);
      throw error;
    }
    return state;
  });
}
/** Terminal durable evidence only. Absence of a local job is not proof that a request was never sent. */
export function starterCallWasNotSent(call: StarterCall, job?: JobRec): boolean {
  return !call.resolvedNotSentAt && !!job && job.id===call.recordId && job.tag===LAB_TAG && job.endpoint==='/characters/animations' && ['failed','canceled'].includes(job.state) && job.requestStarted===false && job.submittedAt===undefined && job.jobs.length===0 && job.gens===0 && job.usd===0 && job.response===undefined;
}
/** Explicit local recovery. Retain the call and job; the next separately priced click is the only way to submit again. */
export async function resolveStarterNotSent(callId: string, expected: StarterSelection): Promise<StarterSession> {
  return locked(async()=>{
    const state=readStarter(),index=state.calls.findIndex(c=>c.id===callId),call=state.calls[index];
    if(!call||state.projectId!==expected.projectId||call.plan.binding!==expected.binding)throw new Error('The selected starter attempt changed. Refresh before resolving it.');
    const jobs=await starterJobs(state),job=call.recordId?jobs.get(call.recordId):undefined;
    const receipts=history({...state,calls:state.calls.slice(0,index)},call.plan,jobs),request=starterRequest(call.plan,call.directions,receipts);
    if(!starterCallWasNotSent(call,job)||stableStringify(job!.params)!==stableStringify(request.body))throw new Error('This attempt is not proven unsent. Keep its hold and inspect the existing receipt; no retry was authorized.');
    call.resolvedNotSentAt=new Date().toISOString();save(state);return state;
  });
}
/** Exact receipt/job/index mapping. No PNG is regenerated, aligned or recolored here. */
export async function starterFrames(state: StarterSession, preset: StarterPresetId, jobs: Map<string, JobRec>, complete = true) {
  const plan = state.plans[preset];
  if (!plan) throw new Error('The starter plan is missing.');
  const receipts = history(state, plan, jobs), entries: StarterNativeFrame[] = [];
  for (const call of state.calls.filter(c => c.plan.binding === plan.binding && !c.resolvedNotSentAt)) {
    const record = jobs.get(call.recordId!)!, receipt = receipts.find(r => r.jobs.some(j => j.jobId === record.jobs[0]?.id));
    if (!receipt) throw new Error('The saved starter receipt does not match its jobs.');
    for (const target of receipt.jobs) {
      const job = record.jobs.find(j => j.id === target.jobId);
      if (!job?.done || job.results.length !== plan.frames) throw new Error('A starter direction is missing exact native frame results.');
      for (const result of job.results) {
        const match = /^(?:(south-east|east|north-east|north|north-west|west|south-west|south)\/)?(\d+)$/.exec(result.label);
        if (!match || (match[1] && match[1] !== target.direction)) throw new Error('A starter frame label does not match its direction receipt.');
        const blob = await db.getBlob(result.sha);
        if (!blob) throw new Error('A native starter image is missing from storage.');
        entries.push({ direction: target.direction, index: Number(match[2]), image: await decodePngBytes(new Uint8Array(await blob.arrayBuffer())) });
      }
    }
  }
  const directions = complete ? [...plan.directions] : DIRECTIONS.filter(d => receipts.some(r => r.jobs.some(j => j.direction === d)));
  return { plan, receipts, entries, native: matchStarterFrames(plan, entries, directions) };
}
export async function describeStarterPilot(clip: Awaited<ReturnType<typeof starterFrames>>): Promise<Omit<StarterPilotReview,'notes'>> {
  if(clip.receipts.length!==1||clip.native.directions.join()!=='south,east') throw new Error('Review the original completed south/east pilot before extending its group.');
  const frames = await Promise.all(clip.entries.map(async e=>({direction:e.direction,index:e.index,hash:await cellHash(e.image)})));
  frames.sort((a,b)=>DIRECTIONS.indexOf(a.direction)-DIRECTIONS.indexOf(b.direction)||a.index-b.index);
  return {binding:clip.plan.binding,animationGroupId:clip.receipts[0].animationGroupId,frames};
}
