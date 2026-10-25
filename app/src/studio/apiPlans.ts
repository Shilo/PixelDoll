// Offline explanations only. These never encode images, submit work or invent dependent payloads.
import { routes, BASE_ANIMS, baseAnimation, type Req } from '../lib/pixellab/routes.ts'
import { type CreateSpec, type MoveSpec, creationDirections, creationLooks, moveDirections, moveFrames } from './create.ts'
import { basePrompt } from './model.ts'
import { ACTIONS } from '../lib/rig/poses.ts'
import { actionOf, poseBatches } from '../lib/rig/clips.ts'
import { pickKey } from '../lib/image/chroma.ts'
import { gridEstimate, planItem, itemPrompt, planGens, slotOf, padOf, heldPhrase, type ItemSpec } from '../lib/items/items.ts'
import { defaultMethod, type Draft, type RigCtx } from '../lib/items/run.ts'
import { coverage, type NewItemInput } from './itemRoute.ts'
import type { StoredProject } from '../lib/store/project.ts'
import type { SetupPlan } from '../lib/rig/setup.ts'
import type { FitDraft, FitPlan } from '../lib/equipment/types.ts'
import type { JobRec } from '../lib/pixellab/queue.ts'
import { characterId } from '../lib/pixellab/library.ts'
import type { Manifest } from '../lib/store/manifest.ts'

export interface PeekCall {
  method: Req['method']; path: string; body?: unknown; label?: string; background?: boolean; generations?: number; note?: string
}
const dependent = 'Payload unavailable until the preceding result is ready. Actual sent data is shown when available.'
const selectedSeed = 'A fresh seed is selected when you run this action.'
const lifecycle = (): PeekCall[] => [
  { method: 'GET', path: '/background-jobs/{job_id}', label: 'Check generation progress', background: true, note: 'Repeated for each returned job ID; no generation is submitted by polling.' },
  { method: 'GET', path: '{result image URL}', label: 'Download result images', background: true, note: 'Only when PixelLab returns image URLs. No account token is sent to artwork URLs.' },
  { method: 'GET', path: '/balance', label: 'Update account balance', background: true, note: 'Runs after jobs settle.' },
]
export const balancePlan = (): PeekCall[] => [{ method: 'GET', path: '/balance', label: 'Read account balance', note: 'No generation request. Your key is sent as authorization and is never included in this view.' }]
export const libraryPlan = (offset = 0): PeekCall[] => [{ method: 'GET', path: `/characters?limit=20&offset=${offset}`, label: 'List your characters', note: 'Account-authorized read; no generations. Preview thumbnails may also download from returned artwork URLs without your token.' }]
export function characterZipPlan(value: string): PeekCall[] {
  let id = ''
  try { id = characterId(value) } catch { /* Invalid input cannot send a request. Show the route pattern. */ }
  return [{ method: 'GET', path: id ? `/characters/${id}/zip?states=${id}` : '/characters/{character_id}/zip?states={character_id}', label: 'Download character ZIP', note: 'Requires a valid character UUID or PixelLab creator link. Public download without an account token; no generations. The ZIP is inspected and saved locally.' }]
}

export function createPlan(spec: CreateSpec, freshSeed = false): PeekCall[] {
  const seed = freshSeed ? undefined : spec.seed
  const view = spec.view ?? 'low top-down', looks = creationLooks(spec)
  const modern = !!spec.exactPrompt || spec.frame !== undefined || spec.directions !== undefined
  const calls: PeekCall[] = [
    { ...routes.createCharacterV3({ description: spec.exactPrompt ? spec.description : basePrompt(spec.description), image_size: { width: spec.size, height: spec.size }, view, template_id: 'mannequin', ...(seed === undefined ? {} : { seed }), no_background: true }), label: 'Create base character', generations: 1 + Math.ceil(spec.size * spec.size * 8 / 65536), ...(freshSeed ? { note: `Known fields only. ${selectedSeed}` } : {}) },
    { method: 'POST', path: '/create-character-v3', label: 'Register padded standing views', generations: 0.25, body: { description: looks, n_directions: modern ? 8 : spec.dirs ?? 4, view, template_id: 'mannequin', ...(seed === undefined ? {} : { seed }), no_background: true }, note: `Known fields only. ${dependent} Adds ${modern ? 'all eight original' : 'saved-plan'} standing views as reference_image and direction_images, padded to ${spec.frame ?? 64} px without rescaling.` },
    { method: 'GET', path: '/characters/{character_id}', label: 'Read standing skeletons', note: 'Character ID comes from registration. Cached when available. Missing standing joints conditionally add POST /estimate-skeleton at 0.1 gen per uncached standing image.' },
  ]
  for (const anim of BASE_ANIMS) for (const { id: direction } of creationDirections(spec).filter(d => !d.mirrorOf)) {
    if (!ACTIONS[anim.name]) {
      const { character_id: _unknown, ...known } = baseAnimation('skeleton-v3', '', anim, [direction], seed)
      calls.push({ method: 'POST', path: '/characters/animations', label: `${anim.name} ${direction} · motion`, body: known, generations: 3, note: 'Known fields only. character_id comes from standing-view registration.' })
      for (let frame = 0; frame < anim.frames; frame++) calls.push({ method: 'POST', path: '/estimate-skeleton', label: `${anim.name} ${direction} · motion frame ${frame + 1}`, generations: 0.1, note: 'Sends this generated motion frame as image (base64 PNG). Matching measurements are reused.' })
    }
    calls.push({ method: 'POST', path: '/animate-with-skeleton-v3', label: `${anim.name} ${direction} · render ${anim.frames} frames`, generations: 3,
      body: { description: looks, action: actionOf(anim.name), direction, view, ...(seed === undefined ? {} : { seed: seed + 101 }), no_background: true },
      note: `Known fields only. ${dependent} Adds first_frame, first_frame_keypoints and ${ACTIONS[anim.name] ? 'locally authored' : 'measured motion'} keypoints. Empty output or a wrong frame count can add one re-roll. Pose, silhouette, palette and border observations never redraw the body automatically.` })
    for (let frame = 0; frame < anim.frames; frame++) calls.push({ method: 'POST', path: '/estimate-skeleton', label: `${anim.name} ${direction} · check frame ${frame + 1}`, generations: 0.1, note: 'Sends this rendered body frame as image (base64 PNG) for pose observations. Matching measurements are reused.' })
  }
  return [...calls, ...lifecycle()]
}

function itemCalls(spec: Pick<ItemSpec, 'prompt' | 'key' | 'slot' | 'method'>, calls: { kind?: string; cells: string[]; seed?: number }[], cell?: { w: number; h: number }): PeekCall[] {
  const pad = padOf(spec.slot, spec.method, cell)
  return calls.map((call, index) => {
    const pose = call.kind === 'pose', anchor = index > 0 && !pose ? calls[0].cells[0] : undefined
    return { method: 'POST', path: pose ? '/animate-with-skeleton-v3' : '/edit-animation-v2', label: `${pose ? 'Pose equipment' : call.kind === 'dress' ? 'Dress standing views' : 'Edit packed frames'} · ${call.cells.length} frames`,
      ...(pose ? {} : { body: { description: itemPrompt(pad ? heldPhrase(spec.prompt, spec.slot) : spec.prompt, spec.key, call.cells, anchor), ...(call.seed === undefined ? {} : { seed: call.seed }), ...(cell ? { image_size: { width: cell.w + 2 * pad, height: cell.h + 2 * pad } } : {}), no_background: true } }),
      generations: planGens([{ kind: pose ? 'pose' : 'edit', cells: call.cells }], cell && { w: cell.w + 2 * pad, h: cell.h + 2 * pad }),
      note: `Known fields only. ${pose ? 'Sends the dressed reference image, exact stored poses, appearance, action, direction and seed.' : 'Frames and image_size are prepared from this character on submission.'} ${call.seed === undefined ? selectedSeed : ''} Coverage: ${call.cells.join(', ')}.` }
  })
}
export function itemPlan(ctx: RigCtx | null, input: NewItemInput): PeekCall[] {
  if (!ctx) return []
  try {
    const spec = { prompt: input.prompt, slot: input.slot, key: pickKey(input.prompt), ...coverage(ctx) }
    const method = defaultMethod(ctx, spec)
    const calls = planItem(ctx.rec.manifest.rig, { ...spec, method })
    const fallback: PeekCall[] = calls.some(call => call.kind === 'pose') && slotOf(spec.slot).class !== 'held' ? [{ method: 'POST', path: '/inpaint-v3', label: 'Conditional packed-grid fallback', note: 'Only if skeleton posing fails quality gates. Sends a packed image grid, mask, final prompt and seed; unavailable before that result. Failed checks may re-roll up to twice or switch chroma key.' }] : []
    return [...itemCalls({ ...spec, method }, calls, ctx.rec.manifest.rig.cell), ...fallback, ...lifecycle()]
  } catch { return [] }
}
export const draftPlan = (draft: Draft): PeekCall[] => [...itemCalls(draft.spec, draft.calls.map(call => ({ ...call, kind: call.kind === 'grid' ? 'pose' : call.kind, seed: undefined }))), ...(draft.spec.method === 'skel' && slotOf(draft.spec.slot).class !== 'held' ? [{ method: 'POST' as const, path: '/inpaint-v3', label: 'Conditional grid fallback', note: dependent }] : []), ...lifecycle()]
export const draftQueueIds = (draft: Draft): string[] => draft.calls.flatMap(call => [...(call.recId ? [call.recId] : []), ...call.old, ...(call.fallback ? [call.fallback.recId] : [])])

export function movePlan(rec: Pick<StoredProject, 'manifest' | 'character'> | null, spec: Omit<MoveSpec, 'seed'> & { seed?: number }): PeekCall[] {
  if (!rec) return []
  const m = rec.manifest, bodyNeeded = spec.itemMethod !== 'grid' && (spec.replace || !m.rig.animations.some(a => a.id === spec.id)), calls: PeekCall[] = [], frames = moveFrames(m, spec)
  const generatedDirections = moveDirections(m, spec.dirs)
  if (bodyNeeded) {
    for (const direction of generatedDirections) {
      if (!spec.action || !ACTIONS[spec.action]) {
        const b = spec.action === 'walk' ? baseAnimation('skeleton-v3', rec.character?.id ?? '', BASE_ANIMS.find(a => a.name === 'walk')!, [direction], spec.seed)
          : { character_id: rec.character?.id ?? '', mode: 'pixminimax' as const, action_description: `${spec.text}, unarmed, no weapon, no props, no other people, no effects`, frame_count: frames, keep_first_frame: false, animation_name: spec.id, directions: [direction], ...(spec.seed === undefined ? {} : { seed: spec.seed }) }
        calls.push({ ...routes.animateCharacter(b), label: `Create motion · ${direction}`, generations: spec.action === 'walk' ? 3 : 1, note: spec.seed === undefined ? `Known fields only. ${selectedSeed}` : undefined })
        for (let frame = 0; frame < frames; frame++) calls.push({ method: 'POST', path: '/estimate-skeleton', label: `${spec.id} ${direction} · motion frame ${frame + 1}`, generations: 0.1, note: 'Sends the generated motion frame as image (base64 PNG), unless already measured.' })
      }
      calls.push({ method: 'POST', path: '/animate-with-skeleton-v3', label: `${spec.id} ${direction} · render body`, generations: 3,
        body: { description: rec.character?.looks, action: actionOf(spec.id) + (spec.poseStyle === 'visible-side-v1' ? ', empty hands, no weapon, no props, no effects' : ''), direction, view: m.rig.view ?? 'low top-down', ...(spec.seed === undefined ? {} : { seed: spec.seed + 101 }), no_background: true },
        note: `Known fields only. Adds standing first_frame, first_frame_keypoints and ${spec.action && ACTIONS[spec.action] ? 'locally authored' : 'generated motion'} keypoints. Empty output or a wrong frame count can add one re-roll; review observations do not.` })
      for (let frame = 0; frame < frames; frame++) calls.push({ method: 'POST', path: '/estimate-skeleton', label: `${spec.id} ${direction} · check frame ${frame + 1}`, generations: 0.1, note: 'Sends the rendered body frame as image (base64 PNG), unless already measured.' })
    }
  }
  for (const item of m.items.filter(item => spec.items.includes(item.id) && !item.design)) {
    for (const direction of generatedDirections.filter(d => item.dressed?.[d] && (spec.replace || spec.itemMethod === 'grid' || !item.layers.every(layer => layer.cells?.[spec.id]?.[d]?.length === frames)))) {
      if (spec.itemMethod === 'grid') {
        calls.push({ method: 'POST', path: '/inpaint-v3', label: `${item.name} ${direction} · repair equipment`, generations: gridEstimate(item.layers[0]?.cell ?? m.rig.cell, frames, Object.keys(item.dressed ?? {}).length).gens, note: 'Edits only the selected equipment frames on a packed grid with protected standing references. The body remains unchanged; results are retained only when quality improves.' })
      } else for (const batch of poseBatches(frames)) calls.push({ method: 'POST', path: '/animate-with-skeleton-v3', label: `${item.name} ${direction} · frames ${batch.start + 1}–${batch.start + batch.count}`, generations: planGens([{ kind: 'pose', cells: Array.from({ length: batch.count }, () => '') }]), note: 'Sends this item’s dressed reference, stored base rest keypoints and selected move poses, appearance, action, direction and seed. A failed gate may add one re-roll; a packed-grid /inpaint-v3 fallback is conditional.' })
    }
  }
  return [...calls, ...lifecycle()]
}
  export function setupPeekPlan(plan: SetupPlan | null, looks: string): PeekCall[] {
  if (!plan) return []
  return [...[...plan.frames.keys()].map((hash, index): PeekCall => ({ method: 'POST', path: '/estimate-skeleton', label: `Measure body frame ${index + 1} of ${plan.frames.size}`, generations: 0.1, note: `Sends existing frame ${hash} as image (base64 PNG). Matching saved measurements are reused.` })),
      { method: 'POST', path: '/create-character-v3', label: 'Register existing standing views', generations: 0.25, body: { description: looks.trim(), n_directions: plan.registrationDirections, template_id: 'mannequin', no_background: true }, note: `Known fields only. Existing standing reference images and camera view are added on submission. ${selectedSeed} Existing artwork is preserved.` }, ...lifecycle()]
}
export function cancelPlan(job: JobRec): PeekCall[] {
  if (job.state !== 'running') return []
  return job.jobs.filter(s => !s.done && !s.remoteDone).map(s => ({ method: 'DELETE', path: `/background-jobs/${encodeURIComponent(s.id)}`, label: 'Stop submitted generation', note: 'Cancellation can fail if the job has already finished; charges may already apply.' }))
}
export const queuedPlan = (jobs: JobRec[]): PeekCall[] => jobs.filter(job => job.state === 'queued' || job.state === 'running').flatMap<PeekCall>(job => job.state === 'queued'
  ? [{ method: job.method, path: job.endpoint, body: job.params, label: job.label, note: 'Resuming permits this waiting request to submit when eligible. Image references shown here are stored locally; the original image data is sent.' }]
  : job.jobs.filter(sub => !sub.done).map(sub => ({ method: 'GET' as const, path: `/background-jobs/${encodeURIComponent(sub.id)}`, label: job.label, background: true, note: 'Continues checking this submitted job.' })))
export function fitPlan(plan: FitPlan | null, stage: 'rest' | 'pose', draft?: FitDraft | null, resume = false, target?: Manifest): PeekCall[] {
  if (resume) return (draft?.calls.filter(c => c.stage === stage && !c.superseded) ?? []).map(c => ({ method: 'GET', path: '/background-jobs/{job_id}', label: 'Continue checking submitted fit', background: true, note: `No new paid submission. Reattaches to saved request ${c.recId ?? 'record'} and checks its returned job IDs.` }))
  if (!plan) return []
  if (stage === 'rest') return plan.previewGens ? [{ method: 'POST', path: '/transfer-outfit-v2', label: 'Transfer the saved standing design', generations: plan.previewGens, note: `Sends the saved source reference and ${plan.directions.length} target standing images, transfer instructions and a fresh seed. The complete payload is prepared on submission. No automatic paid retry.` }, ...lifecycle()] : []
  if (!target) return [{ method: 'POST', path: '/animate-with-skeleton-v3', label: 'Animation request count unavailable', note: 'Target move coverage must finish loading before individual requests can be listed. Payloads depend on approved fitted references.' }]
  const calls: PeekCall[] = [], rig = target.rig, base = target.items.find(item => item.id === rig.baseItem)
  const selected = plan.extension ? new Set(plan.extension.cells) : null
  for (const anim of rig.animations) for (const direction of plan.directions) {
    if (!base?.layers[0].cells?.[anim.id]?.[direction]?.some(Boolean) || (anim.cells === 1 && anim.sources?.[direction]?.motion === 'imported-rest')) continue
    const indices = Array.from({ length: anim.cells }, (_, index) => index).filter(index => !selected || selected.has(`${anim.id}/${direction}/${index}`))
    if (!indices.length) continue
    for (const batch of poseBatches(indices.length)) {
      const cells = indices.slice(batch.start, batch.start + batch.count).map(index => `${anim.id}/${direction}/${index}`)
      calls.push({ method: 'POST', path: '/animate-with-skeleton-v3', label: `${anim.id} ${direction} · ${batch.count} fitted frames`, generations: planGens([{ kind: 'pose', cells }]), note: `Sends approved fitted standing image, stored target rest and animation keypoints, appearance, action, direction and a fresh seed. No automatic paid retry. Coverage: ${cells.join(', ')}.` })
    }
  }
  return [...calls, ...lifecycle()]
}
export function fitRetryPlan(draft: FitDraft | null): PeekCall[] {
  if (!draft?.retryStage) return []
  const stage = draft.retryStage
  return [...draft.calls.filter(call => call.stage === stage && !call.superseded && (stage === 'rest' || call.cells.some(cell => draft.failedCells?.includes(cell)))).map((call): PeekCall => ({ method: 'POST', path: stage === 'rest' ? '/transfer-outfit-v2' : '/animate-with-skeleton-v3', label: `Retry ${stage} · ${call.cells.length} frames`, generations: call.limit, note: `New paid attempt for approved failed coverage only, with a fresh seed. The complete image and keypoint payload is prepared on submission. Coverage: ${call.cells.join(', ')}.` })), ...lifecycle()]
}
