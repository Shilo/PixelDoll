import { expect, test } from 'vitest'
import { balancePlan, cancelPlan, characterZipPlan, createPlan, draftQueueIds, fitPlan, fitRetryPlan, itemPlan, libraryPlan, movePlan, setupPeekPlan } from '../../src/studio/apiPlans.ts'
import { estimate, moveEstimate } from '../../src/studio/create.ts'
import { basePrompt } from '../../src/studio/model.ts'
import { itemRoute } from '../../src/studio/itemRoute.ts'
import type { Draft, RigCtx } from '../../src/lib/items/run.ts'
import type { JobRec } from '../../src/lib/pixellab/queue.ts'
import type { SetupPlan } from '../../src/lib/rig/setup.ts'
import { equipmentFixture } from './equipment-fixture.ts'
import { LABELS } from '../../src/lib/rig/poses.ts'
import { makeImg } from '../../src/lib/image/png.ts'
import type { FitPlan, FitDraft } from '../../src/lib/equipment/types.ts'

test.each([4, 8] as const)('create preflight baseline matches the %i-direction estimate and lists each measurement', (dirs) => {
  const spec = { description: 'friendly dwarf', name: 'Dwarf', size: 48, seed: 123, dirs }
  const plan = createPlan(spec), total = plan.reduce((sum, call) => sum + (call.generations ?? 0), 0)
  expect(total).toBeCloseTo(estimate(dirs).gens)
  const directions = dirs === 4 ? 3 : 5
  expect(plan.filter(c => c.path === '/estimate-skeleton')).toHaveLength(directions * (4 + 8 + 8))
  expect(plan.filter(c => c.path === '/animate-with-skeleton-v3')).toHaveLength(directions * 2)
  expect(plan[0].body).toEqual({ description: basePrompt(spec.description), image_size: { width: 48, height: 48 }, view: 'low top-down', template_id: 'mannequin', seed: 123, no_background: true })
  expect(plan[1].note).toContain('Known fields only')
  expect(plan[2].note).toContain('conditionally')
  expect(plan.filter(c => c.background).every(c => c.method === 'GET')).toBe(true)
  expect(createPlan(spec, true)[0].body).not.toHaveProperty('seed')
})

test('item preflight reuses the real planner and reports conditional fallback separately', async () => {
  const project = await equipmentFixture(), rec = { id: 'fixture', savedAt: '', manifest: project.manifest }
  const points = LABELS.map(label => ({ label, x: 0.5, y: 0.5 })), reference = project.manifest.items[0].layers[0].cells!.rest!.south![0]!
  project.manifest.rig.rest = { south: { image: reference, keypoints: points } }
  project.manifest.rig.animations[0].sources = { south: { route: 'skeleton-v3', reference, keypoints: [points], provenance: [] } }
  const ctx: RigCtx = { rec, project }, input = { name: 'Hood', slot: 'head', prompt: 'brown hood' }
  const plan = itemPlan(ctx, input), expected = itemRoute.plan(project.manifest.rig, ctx, input)
  const baseline = plan.filter(c => c.path === '/edit-animation-v2' || c.path === '/animate-with-skeleton-v3')
  expect(baseline).toHaveLength(expected.calls)
  expect(baseline.reduce((sum, call) => sum + (call.generations ?? 0), 0)).toBe(expected.gens)
  expect(baseline[0].body).toHaveProperty('description')
  expect(baseline[0].body).not.toHaveProperty('frames')
  expect(plan.find(c => c.path === '/inpaint-v3')).toMatchObject({ label: 'Conditional packed-grid fallback' })
  expect(plan.find(c => c.path === '/inpaint-v3')?.generations).toBeUndefined()
  expect(itemPlan(null, input)).toEqual([])
})

test('described move lists each generated direction and measurement at the displayed baseline cost', async () => {
  const project = await equipmentFixture(), rec = { manifest: project.manifest, character: { id: 'managed-id', looks: 'friendly dwarf' } }
  const spec = { id: 'jump', text: 'jump in place', frames: 8, items: [], seed: 72 }
  const plan = movePlan(rec, spec)
  expect(plan.reduce((sum, call) => sum + (call.generations ?? 0), 0)).toBeCloseTo(moveEstimate(project.manifest, spec).gens)
  expect(plan[0].body).toMatchObject({ character_id: 'managed-id', mode: 'pixminimax', action_description: 'jump in place, unarmed, no weapon, no props, no other people, no effects', seed: 72, frame_count: 8, keep_first_frame: false })
  expect(plan.filter(c => c.path === '/estimate-skeleton')).toHaveLength(16)
})

test('setup preflight prices each unique measurement and registration without inventing image data', () => {
  const plan: SetupPlan = { frames: new Map([['sha256:a', makeImg(64, 64)], ['sha256:b', makeImg(64, 64)]]), restAnim: 'rest', fixedRest: false, rest: {}, gens: 0.45, warnings: [] }
  const calls = setupPeekPlan(plan, 'existing blue body', 8)
  expect(calls.reduce((sum, call) => sum + (call.generations ?? 0), 0)).toBeCloseTo(0.45)
  expect(calls[2].body).toMatchObject({ description: 'existing blue body', n_directions: 8, no_background: true })
  expect(calls[2].body).not.toHaveProperty('reference_image')
})

test('read plans retain exact query values and public ZIP UUID normalization', () => {
  const id = '12345678-1234-1234-1234-123456789abc'
  expect(balancePlan()[0]).toMatchObject({ method: 'GET', path: '/balance' })
  expect(libraryPlan(40)[0].path).toBe('/characters?limit=20&offset=40')
  expect(characterZipPlan(`https://pixellab.ai/characters/${id}`)[0].path).toBe(`/characters/${id}/zip?states=${id}`)
  expect(characterZipPlan('invalid')[0].path).toContain('{character_id}')
})

test('cancellation depends on actual queue state and generation history retains replaced attempts', () => {
  const queued = { state: 'queued', jobs: [] } as unknown as JobRec
  expect(cancelPlan(queued)).toEqual([])
  const running = { state: 'running', jobs: [{ id: 'pending/id', done: false }, { id: 'remote-done', done: false, remoteDone: true }, { id: 'done', done: true }] } as unknown as JobRec
  expect(cancelPlan(running)).toEqual([{ method: 'DELETE', path: '/background-jobs/pending%2Fid', label: 'Stop submitted generation', note: expect.any(String) }])
  const draft = { calls: [{ recId: 'current', old: ['paid-first', 'paid-reroll'], fallback: { recId: 'grid' } }] } as Draft
  expect(draftQueueIds(draft)).toEqual(['current', 'paid-first', 'paid-reroll', 'grid'])
})

test('fitting lists each pose batch, excludes imported standing frames, and retries only failed batches', async () => {
  const project = await equipmentFixture(), m = project.manifest, reference = m.items[0].layers[0].cells!.rest!.south![0]!
  m.rig.animations[0].sources = { south: { route: 'import', motion: 'imported-rest', reference, provenance: [] } }
  m.rig.animations.push({ id: 'walk', cells: 16, frames: Array.from({ length: 16 }, (_, cell) => ({ cell, ms: 100 })), loop: true })
  m.items[0].layers[0].cells!.walk = { south: Array.from({ length: 16 }, () => reference) }
  const plan: FitPlan = {
    design: { kind: 'equipment-design', format: 'pixeldoll-design/1', id: 'hat', revision: reference, name: 'Hat', slot: 'head', itemId: 'hat', createdAt: '', source: m, imageHashes: [reference], variants: {}, warnings: [] },
    targetId: 'target', targetAudit: reference, targetStamp: 'stamp', previewGens: 10, poseGens: 6, directions: ['south'], createdAt: '',
    assessment: { status: 'fit', freeCells: 0, totalCells: 17, missingCells: 17, canExtend: true, targetRigReady: true, canCopy: false, reasons: [], warnings: [], matches: [] },
  }
  const baseline = fitPlan(plan, 'pose', undefined, false, m).filter(call => !call.background)
  expect(baseline).toHaveLength(2)
  expect(baseline.reduce((sum, call) => sum + (call.generations ?? 0), 0)).toBe(6)
  expect(baseline.every(call => call.label?.includes('walk south'))).toBe(true)
  plan.extension = { itemId: 'hat', anims: ['walk'], cells: ['walk/south/0', 'walk/south/1', 'walk/south/15'], stamp: 'extension', reuseRest: true }
  expect(fitPlan(plan, 'pose', undefined, false, m).filter(call => !call.background)).toMatchObject([{ generations: 2 }])
  const draft: FitDraft = { kind: 'equipment-fit-draft', format: 'pixeldoll-fit/1', id: 'fit', name: 'Fit hat', targetId: 'target', targetProjectId: 'target', plan, stage: 'needs-attention', updatedAt: '', error: '', previewGens: 10, poseGens: 6, spentGens: 16, budget: { previewGens: 10, poseGens: 6 }, retryStage: 'pose', retryGens: 3, failedCells: ['walk/south/15'], calls: [
    { id: 'ok', stage: 'pose', cells: ['walk/south/0'], seed: 1, limit: 3 },
    { id: 'failed', stage: 'pose', cells: ['walk/south/15'], seed: 2, limit: 3 },
    { id: 'old', stage: 'pose', cells: ['walk/south/15'], seed: 3, limit: 3, superseded: true },
  ] }
  const retry = fitRetryPlan(draft).filter(call => !call.background)
  expect(retry).toHaveLength(1)
  expect(retry[0]).toMatchObject({ generations: 3, path: '/animate-with-skeleton-v3' })
  expect(retry[0].note).toContain('walk/south/15')
})
