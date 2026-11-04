import { afterEach, beforeEach, expect, test, vi } from 'vitest'
import { makeImg, type Img } from '../../src/lib/image/png.ts'
import { PLAN_JOB_LIMITS } from '../../src/lib/pixellab/plans.ts'
import type { JobRec } from '../../src/lib/pixellab/queue.ts'
import type { Req } from '../../src/lib/pixellab/routes.ts'
import { LABELS } from '../../src/lib/rig/poses.ts'
import type { SetupPlan } from '../../src/lib/rig/setup.ts'
import type { Keypoint, Sha256 } from '../../src/lib/rig/rig.ts'
import type { Project, Provenance } from '../../src/lib/store/manifest.ts'
import type { StoredProject } from '../../src/lib/store/project.ts'
import { setupCharacter, type SetupSpec } from '../../src/studio/setup.ts'
import type { Progress } from '../../src/studio/create.ts'
import { equipmentFixture } from './equipment-fixture.ts'

const mocks = vi.hoisted(() => ({ joints: vi.fn(), run: vi.fn(), b64: vi.fn(), provenance: vi.fn(), load: vi.fn(), plan: vi.fn(), attach: vi.fn(), update: vi.fn() }))
vi.mock('../../src/studio/create.ts', () => ({ joints: mocks.joints, run: mocks.run, b64: mocks.b64, provOf: mocks.provenance }))
vi.mock('../../src/lib/store/project.ts', () => ({ loadProject: mocks.load }))
vi.mock('../../src/lib/rig/setup.ts', () => ({ setupPlan: mocks.plan, attachImportedRig: mocks.attach }))
vi.mock('../../src/lib/store/db.ts', () => ({ updateCharacter: mocks.update }))

const windowSize = Math.max(...Object.values(PLAN_JOB_LIMITS))
const frameId = (image: Img) => image.data[0] + 256 * image.data[1]
const points = (id: number): Keypoint[] => LABELS.map((label, index) => ({ label, x: .2 + id / 10_000, y: .1 + index / 30 }))
function deferred<T>() {
  let resolve!: (value: T) => void, reject!: (error: unknown) => void
  const promise = new Promise<T>((done, fail) => { resolve = done; reject = fail })
  return { promise, resolve, reject }
}
beforeEach(() => Object.values(mocks).forEach(mock => mock.mockReset()))
afterEach(() => vi.restoreAllMocks())

async function fixture(count: number) {
  const project = await equipmentFixture(), frames = new Map<Sha256, Img>()
  for (let index = 0; index < count; index++) {
    const image = makeImg(64, 64)
    image.data.set([index % 256, Math.floor(index / 256), 90, 255], 0)
    frames.set(`sha256:${index.toString(16).padStart(64, '0')}`, image)
  }
  const rest = Object.fromEntries(['south', 'east', 'north', 'west'].map(direction => [direction, frames.values().next().value ?? makeImg(64, 64)]))
  const plan: SetupPlan = { frames, rest, restAnim: 'default', fixedRest: false, registrationDirections: 4, gens: .25 + count / 10, warnings: [] }
  let saved: StoredProject = { id: 'rig-setup-test', savedAt: '', manifest: structuredClone(project.manifest) }
  const spec: SetupSpec = { projectId: saved.id, baseHash: saved.manifest.rig.baseHash, restAnim: 'default', looks: 'Existing blue base', seed: 321, activityScope: 'setup-test' }
  mocks.load.mockResolvedValue({ rec: structuredClone(saved), project })
  mocks.plan.mockResolvedValue(plan)
  mocks.joints.mockImplementation(async (image: Img) => points(frameId(image)))
  mocks.b64.mockImplementation(async (image: Img) => String(frameId(image)))
  const records = new Map<string, JobRec>()
  mocks.run.mockImplementation(async (request: Req) => {
    const id = request.path === '/estimate-skeleton' ? `frame-${(request.body as { image: { base64: string } }).image.base64}` : 'registration'
    let record = records.get(id)
    if (!record) { record = { id, endpoint: request.path, response: { character_id: 'managed-test' } } as JobRec; records.set(id, record) }
    return record
  })
  mocks.provenance.mockImplementation((record: JobRec): Provenance => ({ endpoint: record.endpoint, params: { record: record.id }, seed: 0, requestHash: `sha256:${record.id}`, usage: { generations: .1, usd: 0 }, createdAt: '', produced: [] }))
  mocks.attach.mockImplementation(async (source: Project, _plan: SetupPlan, _measured: Map<string, Keypoint[]>, provenance: Provenance[]) => {
    const manifest = structuredClone(source.manifest)
    manifest.items[0].provenance = provenance
    return { manifest, images: source.images, skeletons: {}, rigQa: { warnings: [] } }
  })
  mocks.update.mockImplementation(async (_id: string, _blobs: unknown, change: (current: StoredProject) => StoredProject) => { saved = change(structuredClone(saved)) })
  return { spec, plan, records, saved: () => saved }
}

test('411 distinct setup checks use a bounded window and preserve every frame, keypoint and provenance association', async () => {
  const f = await fixture(411), progress: Progress[] = []
  let active = 0, peak = 0
  mocks.joints.mockImplementation(async (image: Img) => {
    peak = Math.max(peak, ++active)
    try { return await Promise.resolve(points(frameId(image))) }
    finally { active-- }
  })
  await setupCharacter(f.spec, value => progress.push(value))
  expect(mocks.joints).toHaveBeenCalledTimes(411)
  expect(peak).toBe(windowSize)
  const measured = mocks.attach.mock.calls[0][2] as Map<string, Keypoint[]>
  for (const [hash, image] of f.plan.frames) expect(measured.get(hash)).toEqual(points(frameId(image)))
  const provenance = mocks.attach.mock.calls[0][3] as Provenance[]
  expect(provenance.map(value => value.params.record)).toEqual([...Array.from({ length: 411 }, (_, index) => `frame-${index}`), 'registration'])
  expect(progress.filter(value => value.step === 'joints').map(value => value.done)).toEqual(Array.from({ length: 412 }, (_, index) => index))
  expect(mocks.update).toHaveBeenCalledOnce()
})

test('a completed check refills the window before slower checks finish and completion order cannot reorder provenance', async () => {
  const f = await fixture(windowSize + 3), gates = Array.from({ length: windowSize + 3 }, () => deferred<Keypoint[]>())
  mocks.joints.mockImplementation((image: Img) => gates[frameId(image)].promise)
  const pending = setupCharacter(f.spec, () => {})
  await vi.waitFor(() => expect(mocks.joints).toHaveBeenCalledTimes(windowSize))
  expect(mocks.run).not.toHaveBeenCalled()
  gates[7].resolve(points(7))
  await vi.waitFor(() => expect(mocks.joints).toHaveBeenCalledTimes(windowSize + 1))
  expect(mocks.attach).not.toHaveBeenCalled()
  for (let index = gates.length - 1; index >= 0; index--) gates[index].resolve(points(index))
  await pending
  expect((mocks.attach.mock.calls[0][3] as Provenance[]).map(value => value.params.record)).toEqual([...gates.map((_, index) => `frame-${index}`), 'registration'])
})

test.each(['transport', 'invalid', 'undefined-rejection'] as const)('a %s failure stops new claims, drains admitted checks and never registers or publishes', async kind => {
  const f = await fixture(windowSize + 1), gates = Array.from({ length: windowSize }, () => deferred<Keypoint[] | undefined>())
  let active = 0, settled = false, activeAtRejection = -1
  const failure = kind === 'undefined-rejection' ? undefined : new Error('Synthetic transport failure')
  mocks.joints.mockImplementation(async (image: Img) => {
    active++
    try { return await gates[frameId(image)].promise }
    finally { active-- }
  })
  const progress: Progress[] = [], pending = setupCharacter(f.spec, value => progress.push(value))
  const observed = pending.then(() => { settled = true; return { resolved: true } }, error => { settled = true; activeAtRejection = active; return { error } })
  await vi.waitFor(() => expect(mocks.joints).toHaveBeenCalledTimes(windowSize))
  if (kind === 'invalid') gates[0].resolve(undefined)
  else gates[0].reject(failure)
  if (kind === 'invalid') await mocks.joints.mock.results[0].value
  else await expect(mocks.joints.mock.results[0].value).rejects.toBe(failure)
  expect(settled).toBe(false)
  for (let index = 1; index < gates.length; index++) gates[index].resolve(points(index))
  const result = await observed
  if (kind === 'invalid') expect(result).toMatchObject({ error: expect.objectContaining({ message: expect.stringContaining('all 18 valid joints') }) })
  else expect(result).toEqual({ error: failure })
  expect(activeAtRejection).toBe(0)
  expect(mocks.joints).toHaveBeenCalledTimes(windowSize)
  expect(progress).toEqual([{ step: 'joints', done: 0, total: windowSize + 1, recIds: [] }])
  expect(mocks.run).not.toHaveBeenCalled()
  expect(mocks.attach).not.toHaveBeenCalled()
  expect(mocks.update).not.toHaveBeenCalled()
})

test('a progress callback failure also drains siblings without further claims or publication', async () => {
  const f = await fixture(windowSize + 1), gates = Array.from({ length: windowSize }, () => deferred<Keypoint[]>())
  mocks.joints.mockImplementation((image: Img) => gates[frameId(image)].promise)
  const failure = new Error('Progress consumer stopped'), progress: Progress[] = []
  let settled = false
  const pending = setupCharacter(f.spec, value => {
    progress.push(value)
    if (value.step === 'joints' && value.done === 1) throw failure
  })
  const observed = pending.catch(error => { settled = true; return error })
  await vi.waitFor(() => expect(mocks.joints).toHaveBeenCalledTimes(windowSize))
  gates[0].resolve(points(0))
  await vi.waitFor(() => expect(progress).toHaveLength(2))
  expect(settled).toBe(false)
  for (let index = 1; index < gates.length; index++) gates[index].resolve(points(index))
  expect(await observed).toBe(failure)
  expect(mocks.joints).toHaveBeenCalledTimes(windowSize)
  expect(progress.map(value => value.done)).toEqual([0, 1])
  expect(mocks.run.mock.calls.map(call => call[0].path)).toEqual(['/estimate-skeleton'])
  expect(mocks.attach).not.toHaveBeenCalled()
  expect(mocks.update).not.toHaveBeenCalled()
})

test('setup keeps identical cached provenance requests and resume-safe flags when run again', async () => {
  const f = await fixture(3)
  await setupCharacter(f.spec, () => {})
  const requests = mocks.run.mock.calls.map(call => structuredClone(call))
  const provenance = structuredClone(mocks.attach.mock.calls[0][3])
  mocks.run.mockClear(); mocks.attach.mockClear()
  await setupCharacter(f.spec, () => {})
  expect(mocks.run.mock.calls).toEqual(requests)
  for (const call of mocks.run.mock.calls.filter(call => call[0].path === '/estimate-skeleton')) {
    expect(call.slice(1)).toEqual(['Finding joints', 'm2-skel', true, true, undefined, 'setup-test'])
  }
  expect(mocks.attach.mock.calls[0][3]).toEqual(provenance)
  expect(f.records.size).toBe(4)
})

test('an empty measurement plan stops before requests or publication', async () => {
  const f = await fixture(0)
  await expect(setupCharacter(f.spec, () => {})).rejects.toThrow('No body frames are available')
  expect(mocks.joints).not.toHaveBeenCalled()
  expect(mocks.run).not.toHaveBeenCalled()
  expect(mocks.update).not.toHaveBeenCalled()
})
