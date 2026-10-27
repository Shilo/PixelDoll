/// <reference types="svelte" />
import { afterEach, beforeAll, beforeEach, describe, expect, test, vi } from 'vitest'
import type { Progress } from '../../src/studio/create.ts'
import { readFileSync } from 'node:fs'

const mocks = vi.hoisted(() => ({ create: vi.fn(), move: vi.fn(), moveItems: vi.fn(), setup: vi.fn(), recovery: vi.fn(), palette: vi.fn(), match: vi.fn(), load: vi.fn(), source: vi.fn(), fits: vi.fn(), put: vi.fn(), get: vi.fn(), del: vi.fn(), update: vi.fn(), clear: vi.fn() }))
vi.mock('../../src/studio/create.ts', () => ({ createCharacter: mocks.create, addMove: mocks.move, moveItems: mocks.moveItems, measurementRecoveryPlan: mocks.recovery, bodyPaletteRepairPlan: mocks.palette, saveCopy: vi.fn() }))
vi.mock('../../src/studio/setup.ts', () => ({ setupCharacter: mocks.setup }))
vi.mock('../../src/lib/items/run.ts', async original => ({ ...await original<typeof import('../../src/lib/items/run.ts')>(), matchItemColors: mocks.match }))
vi.mock('../../src/lib/store/project.ts', async original => ({ ...await original<typeof import('../../src/lib/store/project.ts')>(), loadProject: mocks.load }))
vi.mock('../../src/lib/dress/project.ts', async original => ({ ...await original<typeof import('../../src/lib/dress/project.ts')>(), openSource: mocks.source }))
vi.mock('../../src/lib/equipment/fits.ts', async original => ({ ...await original<typeof import('../../src/lib/equipment/fits.ts')>(), listFits: mocks.fits }))

vi.mock('../../src/lib/store/db.ts', () => ({ put: mocks.put, get: mocks.get, del: mocks.del, update: mocks.update }))
vi.mock('../../src/lib/app.svelte.ts', () => ({ app: { key: '' } }))
vi.mock('../../src/lib/pixellab/queue.ts', () => ({ queue: { role: 'leader', subscribe: () => () => {}, idle: () => true, clearFinished: mocks.clear } }))

function stubGlobals() {
  // Isolate asynchronous controller logic; no rendering or Svelte reactivity is under test.
  const identity = <T>(value: T) => value
  vi.stubGlobal('$state', Object.assign(identity, { raw: identity, snapshot: identity }))
  vi.stubGlobal('$derived', Object.assign(identity, { by: () => undefined }))
  vi.stubGlobal('innerWidth', 1440); vi.stubGlobal('innerHeight', 900); vi.stubGlobal('devicePixelRatio', 1)
  vi.stubGlobal('matchMedia', () => ({ matches: false }))
}
// Build the module graph once outside any test's timeout; each test's fresh import after resetModules is then fast.
beforeAll(async () => { stubGlobals(); await import('../../src/studio/state.svelte.ts'); vi.unstubAllGlobals() })
beforeEach(() => {
  vi.resetModules()
  Object.values(mocks).forEach((m) => m.mockReset())
  mocks.put.mockResolvedValue(undefined); mocks.get.mockResolvedValue(undefined); mocks.del.mockResolvedValue(undefined); mocks.fits.mockResolvedValue([]); mocks.clear.mockResolvedValue(0)
  stubGlobals()
})
afterEach(() => vi.unstubAllGlobals())
function pending<T>() { let resolve!: (value: T) => void, reject!: (error: unknown) => void; const promise = new Promise<T>((a, b) => { resolve = a; reject = b }); return { promise, resolve, reject } }
const progress = (step: string, done: number): Progress => ({ step, done, total: 69, recIds: [] })
/** The flow's progress callback: createCharacter takes a views callback after it, addMove and setup end with it. */
const progressOf = (kind: 'create' | 'move' | 'setup', args: unknown[]) => (kind === 'create' ? args[1] : args.at(-1)) as (p: Progress) => void

test.each(['create', 'move', 'setup'] as const)('%s ignores late sibling progress after failure, during retry, and after termination', async (kind) => {
  const first = pending<string>(), second = pending<string>(), callbacks: ((p: Progress) => void)[] = []
  const flow = mocks[kind]
  flow.mockImplementationOnce((...args: unknown[]) => { callbacks.push(progressOf(kind, args)); return first.promise })
    .mockImplementationOnce((...args: unknown[]) => { callbacks.push(progressOf(kind, args)); return second.promise })
  const s = await import('../../src/studio/state.svelte.ts')
  const state = kind === 'create' ? s.creating : kind === 'move' ? s.moving : s.settingUp
  const start = (seed: number) => kind === 'create'
    ? s.startCreate({ description: 'body', name: 'Fixture', seed, size: 48, dirs: 4 })
    : kind === 'move' ? s.startMove('project', { id: 'cast', action: 'cast', frames: 8, items: [], seed })
      : s.startSetup({ projectId: 'project', baseHash: 'sha256:' + 'a'.repeat(64), restAnim: 'idle', looks: 'body', seed })
  const initial = start(1)
  await vi.waitFor(() => expect(callbacks).toHaveLength(1))
  callbacks[0](progress('animate', 10))
  first.reject(new Error('First branch failed'))
  await initial
  callbacks[0](progress('animate', 47))
  expect(state.progress).toEqual(progress('animate', 10))
  expect(state.error).toBe('First branch failed')
  const retry = start(2)
  await vi.waitFor(() => expect(callbacks).toHaveLength(2))
  callbacks[1](progress('draw', 1))
  callbacks[0](progress('animate', 48))
  expect(state.progress).toEqual(progress('draw', 1))
  expect(state.error).toBe('')
  second.reject(new Error('Current branch failed'))
  await retry
  callbacks[0](progress('save', 69)); callbacks[1](progress('animate', 49))
  expect(state.progress).toEqual(progress('draw', 1))
  expect(state.error).toBe('Current branch failed')
})


test('creation identity is persisted before paid work, survives failed resume, and fresh attempts get a new identity', async () => {
  const persisted = pending<void>()
  mocks.put.mockImplementationOnce(() => persisted.promise)
  mocks.create.mockRejectedValue(new Error('fixture stops before paid work'))
  const s = await import('../../src/studio/state.svelte.ts')
  const legacy = { description: 'body', name: 'Legacy pending', seed: 1, size: 48, dirs: 4 as const }
  const run = s.startCreate(legacy)
  expect(mocks.create).not.toHaveBeenCalled()
  const migrated = mocks.put.mock.calls[0][2].spec
  expect(migrated.projectId).toMatch(/^rig-[a-f0-9-]+$/)
  expect(migrated).toEqual({ ...legacy, projectId: migrated.projectId, activityScope: expect.any(String) })
  persisted.resolve(); await run
  expect(mocks.create.mock.calls[0][0].projectId).toBe(migrated.projectId)
  await s.startCreate(structuredClone(migrated))
  expect(mocks.create.mock.calls[1][0].projectId).toBe(migrated.projectId)
  await s.startCreate({ ...migrated, seed: 2, projectId: undefined })
  expect(mocks.create.mock.calls[2][0].projectId).not.toBe(migrated.projectId)
})


for (const kind of ['create', 'move', 'setup'] as const) {
  const key = 'studio-' + kind
  const spec = kind === 'create' ? { description: 'body', name: 'Fixture', seed: 1, size: 48, dirs: 4 as const }
    : kind === 'move' ? { id: 'cast', action: 'cast', frames: 8, items: [], seed: 1 }
      : { projectId: 'project', baseHash: 'sha256:' + 'a'.repeat(64), restAnim: 'idle', looks: 'body', seed: 1 }
  const stateOf = (s: typeof import('../../src/studio/state.svelte.ts')) => kind === 'create' ? s.creating : kind === 'move' ? s.moving : s.settingUp
  const start = (s: typeof import('../../src/studio/state.svelte.ts'), next = spec) => kind === 'create'
    ? s.startCreate(next as Parameters<typeof s.startCreate>[0])
    : kind === 'move' ? s.startMove('project', next as Parameters<typeof s.startMove>[1]) : s.startSetup(next as Parameters<typeof s.startSetup>[0])
  const resume = (s: typeof import('../../src/studio/state.svelte.ts')) => kind === 'create' ? s.resumeCreate() : kind === 'move' ? s.resumeMove() : s.resumeSetup()

  test(`${kind} persists terminal failure, restores it after module reload without running, and explicit retry clears status`, async () => {
    const records = new Map<string, any>()
    mocks.put.mockImplementation(async (_store, id, value) => { records.set(id, structuredClone(value)) })
    mocks.get.mockImplementation(async (_store, id) => structuredClone(records.get(id)))
    mocks[kind].mockRejectedValue(new Error('Known terminal failure'))
    const first = await import('../../src/studio/state.svelte.ts')
    await start(first)
    const failed = structuredClone(records.get(key))
    expect(failed).toMatchObject({ status: 'failed', error: 'Known terminal failure', spec })
    expect(stateOf(first).error).toBe('Known terminal failure')
    mocks[kind].mockClear()
    vi.resetModules()
    const restored = await import('../../src/studio/state.svelte.ts')
    await resume(restored)
    expect(mocks[kind]).not.toHaveBeenCalled()
    expect(stateOf(restored)).toMatchObject({ spec: failed.spec, error: 'Known terminal failure', progress: null })
    const retry = pending<string>()
    mocks[kind].mockReturnValueOnce(retry.promise)
    const running = start(restored, { ...failed.spec, seed: 2 })
    await vi.waitFor(() => expect(mocks[kind]).toHaveBeenCalledOnce())
    expect(records.get(key)).toMatchObject({ status: 'running', spec: { seed: 2 } })
    expect(records.get(key).error).toBeUndefined()
    expect(stateOf(restored).error).toBe('')
    retry.reject(new Error('Explicit retry stopped')); await running
  })

  test.each([undefined, 'running'])(`${kind} retains interrupted recovery for status %s`, async (status) => {
    const s = await import('../../src/studio/state.svelte.ts')
    mocks.get.mockResolvedValue({ spec, projectId: 'project', requestText: s.REQUEST_TEXT, ...(status ? { status } : {}) })
    const wait = pending<string>(); mocks[kind].mockReturnValue(wait.promise)
    await resume(s)
    await vi.waitFor(() => expect(mocks[kind]).toHaveBeenCalledOnce())
    if (kind === 'move') expect(mocks.move.mock.calls[0][1]).not.toHaveProperty('poseStyle')
    wait.reject(new Error('Interrupted recovery stopped'))
    await vi.waitFor(() => expect(stateOf(s).error).toBe('Interrupted recovery stopped'))
  })

  test(`${kind} saved with older request wording waits for review instead of resending`, async () => {
    mocks.get.mockResolvedValue({ spec, projectId: 'project', status: 'running' })
    const s = await import('../../src/studio/state.svelte.ts')
    await resume(s)
    expect(mocks[kind]).not.toHaveBeenCalled()
    expect(stateOf(s).error).toMatch(/stopped\. Review Activity before trying again\./)
  })

  test.each(['Original failure', ''])(`${kind} reports failed-marker storage errors, freezes late progress, and releases its guard (%s)`, async (message) => {
    const saved = pending<void>(); let callback!: (p: Progress) => void
    mocks.put.mockImplementation((_store, _id, record) => record.status === 'failed' ? saved.promise : Promise.resolve())
    mocks[kind].mockImplementationOnce((...args: unknown[]) => { callback = progressOf(kind, args); callback(progress('animate', 4)); throw new Error(message) })
    const s = await import('../../src/studio/state.svelte.ts')
    const running = start(s)
    await vi.waitFor(() => expect(mocks.put).toHaveBeenCalledTimes(2))
    expect(stateOf(s).error).toBe(message)
    callback(progress('animate', 47))
    expect(stateOf(s).progress).toEqual(progress('animate', 4))
    saved.reject(new Error('Storage unavailable')); await running
    expect(stateOf(s).error).toContain(message)
    expect(stateOf(s).error).toContain('Dismiss this operation before reloading')
    mocks.put.mockResolvedValue(undefined); mocks[kind].mockRejectedValue(new Error('Retry entered'))
    await start(s)
    expect(mocks[kind]).toHaveBeenCalledTimes(2)
  })
}


const recoveryPlan = { recordIds: ['lost-west-0', 'canceled-west-1'], rigVersion: 'rig-fingerprint', checks: 2, gens: 0.2, usd: 0.01026, rawHashes: [] }
const recoverySpec = { id: 'slash', action: 'slash', frames: 8, items: ['sword'], seed: 2438, replace: true, dirs: ['east', 'west'] as import('../../src/lib/store/manifest.ts').DirectionName[], poseStyle: 'visible-side-v1' as const }

test('explicit joint-check recovery preserves the body identity and persists one reviewed intent before work', async () => {
  const persisted = pending<void>()
  mocks.put.mockImplementationOnce(() => persisted.promise)
  mocks.recovery.mockResolvedValue(recoveryPlan)
  mocks.move.mockRejectedValue(new Error('Offline recovery stopped'))
  const s = await import('../../src/studio/state.svelte.ts')
  Object.assign(s.moving, { projectId: 'project', spec: structuredClone(recoverySpec), error: 'Unknown joint check', done: false })
  const run = s.retryMoveMeasurements('project', structuredClone(recoverySpec), recoveryPlan)
  await vi.waitFor(() => expect(mocks.put).toHaveBeenCalledOnce())
  expect(mocks.move).not.toHaveBeenCalled()
  const stored = mocks.put.mock.calls[0][2]
  expect(stored).toMatchObject({ status: 'running', projectId: 'project', spec: { ...recoverySpec, measurementRecovery: { recordIds: recoveryPlan.recordIds, rigVersion: recoveryPlan.rigVersion } } })
  expect(stored.spec.measurementRecovery.id).toMatch(/^[a-f0-9-]{36}$/)
  expect(s.moving.error).toBe('')
  persisted.resolve(); await run
  expect(mocks.move).toHaveBeenCalledOnce()
  expect(mocks.move.mock.calls[0][1]).toEqual(stored.spec)
  expect(mocks.put.mock.calls[1][2]).toMatchObject({ status: 'failed', spec: stored.spec })
  mocks.move.mockClear(); mocks.recovery.mockClear(); vi.resetModules()
  mocks.get.mockResolvedValue(mocks.put.mock.calls[1][2])
  const reloaded = await import('../../src/studio/state.svelte.ts')
  await reloaded.resumeMove()
  expect(mocks.move).not.toHaveBeenCalled()
  expect(mocks.recovery).not.toHaveBeenCalled()
  expect(reloaded.moving.spec).toEqual(stored.spec)
})

test.each(['recordIds', 'rigVersion', 'checks', 'empty'] as const)('joint recovery rejects changed %s without clearing the failed operation or writing consent', async (field) => {
  mocks.recovery.mockResolvedValue(field === 'empty' ? { ...recoveryPlan, recordIds: [], checks: 0 } : { ...recoveryPlan, [field]: field === 'recordIds' ? ['another-record'] : field === 'checks' ? 3 : 'changed-rig' })
  const s = await import('../../src/studio/state.svelte.ts')
  Object.assign(s.moving, { projectId: 'project', spec: structuredClone(recoverySpec), error: 'Original failure', done: false })
  await expect(s.retryMoveMeasurements('project', structuredClone(recoverySpec), recoveryPlan)).rejects.toThrow('Review their cost again')
  expect(s.moving.error).toBe('Original failure')
  expect(mocks.move).not.toHaveBeenCalled(); expect(mocks.put).not.toHaveBeenCalled()
})

test('joint recovery refuses a superseded pending operation and a failed durable-intent write cannot start paid work', async () => {
  const check = pending<typeof recoveryPlan>()
  mocks.recovery.mockReturnValue(check.promise)
  const s = await import('../../src/studio/state.svelte.ts')
  Object.assign(s.moving, { projectId: 'project', spec: structuredClone(recoverySpec), error: 'Original failure', done: false })
  const run = s.retryMoveMeasurements('project', structuredClone(recoverySpec), recoveryPlan)
  s.moving.spec = { ...recoverySpec, seed: 9832 }
  check.resolve(recoveryPlan)
  await expect(run).rejects.toThrow('Review their cost again')
  expect(mocks.put).not.toHaveBeenCalled(); expect(mocks.move).not.toHaveBeenCalled()
  s.moving.spec = structuredClone(recoverySpec)
  mocks.recovery.mockResolvedValue(recoveryPlan); mocks.put.mockRejectedValue(new Error('Storage blocked'))
  await s.retryMoveMeasurements('project', structuredClone(recoverySpec), recoveryPlan)
  expect(mocks.move).not.toHaveBeenCalled()
  expect(s.moving.error).toContain('Storage blocked')
  expect(s.moving.error).toContain('Dismiss this operation before reloading')
})


const palettePlan = { ...recoveryPlan, recordIds: [], rawHashes: ['cached-body-hash'], checks: 4, gens: 0.4, usd: 0.02052, directions: ['west'] as import('../../src/lib/store/manifest.ts').DirectionName[], changedPixels: 39, rawOutliers: 177, remainingOutliers: 138, changedFrames: 4, itemGens: 6 }
const paletteSpec = { ...recoverySpec, measurementRecovery: { id: 'previous-joint-consent', recordIds: ['old-lost'], rigVersion: 'rig-fingerprint' } }

test('body color consent preserves the raw render identity, clears old check consent, and persists before work', async () => {
  const persisted = pending<void>()
  mocks.put.mockImplementationOnce(() => persisted.promise); mocks.palette.mockResolvedValue(palettePlan)
  mocks.move.mockRejectedValue(new Error('Offline corrected check stopped'))
  const s = await import('../../src/studio/state.svelte.ts')
  Object.assign(s.moving, { projectId: 'project', spec: structuredClone(paletteSpec), error: 'Palette fit failed', done: false })
  const run = s.matchMoveBodyColors('project', structuredClone(paletteSpec), palettePlan)
  await vi.waitFor(() => expect(mocks.put).toHaveBeenCalledOnce())
  expect(mocks.palette).toHaveBeenCalledWith('project', { ...paletteSpec, measurementRecovery: undefined })
  expect(mocks.move).not.toHaveBeenCalled()
  const stored = mocks.put.mock.calls[0][2]
  expect(stored).toMatchObject({ status: 'running', spec: { ...recoverySpec, bodyPaletteRepair: { version: 'near-rest-v1', rigVersion: palettePlan.rigVersion } } })
  expect(stored.spec.bodyPaletteRepair.id).toMatch(/^[a-f0-9-]{36}$/)
  expect(stored.spec.measurementRecovery).toBeUndefined()
  persisted.resolve(); await run
  expect(mocks.move.mock.calls[0][1]).toEqual(stored.spec)
  expect(mocks.put.mock.calls[1][2]).toMatchObject({ status: 'failed', spec: stored.spec })
  mocks.move.mockClear(); mocks.palette.mockClear(); vi.resetModules()
  mocks.get.mockResolvedValue(mocks.put.mock.calls[1][2])
  const restored = await import('../../src/studio/state.svelte.ts'); await restored.resumeMove()
  expect(mocks.move).not.toHaveBeenCalled(); expect(mocks.palette).not.toHaveBeenCalled()
  expect(restored.moving.spec).toEqual(stored.spec)
})

test.each(['rawHashes', 'rigVersion', 'changedPixels', 'checks', 'itemGens'] as const)('body color consent rejects changed %s without paid work', async field => {
  mocks.palette.mockResolvedValue({ ...palettePlan, [field]: field === 'rawHashes' ? ['different-body'] : field === 'rigVersion' ? 'changed-rig' : 999 })
  const s = await import('../../src/studio/state.svelte.ts')
  Object.assign(s.moving, { projectId: 'project', spec: structuredClone(paletteSpec), error: 'Palette fit failed', done: false })
  await expect(s.matchMoveBodyColors('project', structuredClone(paletteSpec), palettePlan)).rejects.toThrow('Review their cost again')
  expect(mocks.put).not.toHaveBeenCalled(); expect(mocks.move).not.toHaveBeenCalled()
  expect(s.moving.error).toBe('Palette fit failed')
})

test('existing body color intent cannot be applied twice and interrupted resume retains its identity', async () => {
  const spec = { ...recoverySpec, bodyPaletteRepair: { id: 'existing-color-consent', version: 'near-rest-v1' as const, rigVersion: palettePlan.rigVersion } }
  const s = await import('../../src/studio/state.svelte.ts')
  Object.assign(s.moving, { projectId: 'project', spec, error: 'A corrected check stopped', done: false })
  await expect(s.matchMoveBodyColors('project', spec, palettePlan)).rejects.toThrow('Review the body colors again')
  expect(mocks.palette).not.toHaveBeenCalled(); expect(mocks.move).not.toHaveBeenCalled()
  vi.resetModules(); mocks.get.mockResolvedValue({ id: 'studio-move', spec, projectId: 'project', status: 'running', requestText: s.REQUEST_TEXT })
  mocks.move.mockRejectedValue(new Error('Interrupted corrected check stopped'))
  const restored = await import('../../src/studio/state.svelte.ts'); await restored.resumeMove()
  await vi.waitFor(() => expect(mocks.move).toHaveBeenCalledOnce())
  expect(mocks.move.mock.calls[0][1]).toEqual({ ...spec, activityScope: expect.any(String) })
})

test('body color consent storage failure cannot start paid work', async () => {
  mocks.palette.mockResolvedValue(palettePlan); mocks.put.mockRejectedValue(new Error('Consent storage blocked'))
  const s = await import('../../src/studio/state.svelte.ts')
  Object.assign(s.moving, { projectId: 'project', spec: structuredClone(paletteSpec), error: 'Palette fit failed', done: false })
  await s.matchMoveBodyColors('project', structuredClone(paletteSpec), palettePlan)
  expect(mocks.move).not.toHaveBeenCalled()
  expect(s.moving.error).toContain('Consent storage blocked')
})


const itemColorPlan = { version: 'neutral-owned-v1' as const, fingerprint: 'reviewed-item-and-rig', materialId: 'sword-metal', changedPixels: 20, changedFrames: [0, 1], unmatchedPixels: 0 }

test('free item palette refresh preserves the outfit, selected view and inspector without invoking paid flow', async () => {
  const s = await import('../../src/studio/state.svelte.ts')
  s.doc.id = 'project'; s.doc.items = { main_hand: 'sword' }; s.doc.variants = { 'sword-metal': 'azure' }
  s.ui.selected = 'sword'; s.ui.anim = 'slash'; s.ui.dir = 'west'; s.ui.frame = 3
  const project = { manifest: { name: 'Refreshed palette' }, images: new Map() }
  mocks.match.mockResolvedValue(undefined); mocks.load.mockResolvedValue({ project })
  await s.matchItemPalette('project', 'sword', 'slash', 'west', itemColorPlan)
  expect(mocks.match).toHaveBeenCalledWith('project', 'sword', 'slash', 'west', itemColorPlan)
  expect(s.store.project).toBe(project)
  expect(s.doc.items).toEqual({ main_hand: 'sword' }); expect(s.doc.variants).toEqual({ 'sword-metal': 'azure' })
  expect(s.ui).toMatchObject({ selected: 'sword', anim: 'slash', dir: 'west', frame: 3 })
  expect(mocks.move).not.toHaveBeenCalled(); expect(mocks.create).not.toHaveBeenCalled(); expect(mocks.setup).not.toHaveBeenCalled()
})

test('free item palette cannot replace a newer pending navigation even while the old project remains displayed', async () => {
  const work = pending<void>(), navigation = pending<never>()
  mocks.match.mockReturnValue(work.promise); mocks.source.mockReturnValue(navigation.promise)
  const s = await import('../../src/studio/state.svelte.ts'); s.doc.id = 'old-project'
  const run = s.matchItemPalette('old-project', 'sword', 'slash', 'west', itemColorPlan)
  await vi.waitFor(() => expect(mocks.match).toHaveBeenCalledOnce())
  void s.openProject('new-project')
  await vi.waitFor(() => expect(mocks.source).toHaveBeenCalledOnce())
  expect(s.doc.id).toBe('old-project')
  work.resolve(); await run
  expect(mocks.load).not.toHaveBeenCalled()
})

test('free item palette applies only the newest refresh when two item corrections complete close together', async () => {
  const older = pending<{ project: any }>(), newer = pending<{ project: any }>()
  mocks.match.mockResolvedValue(undefined); mocks.load.mockReturnValueOnce(older.promise).mockReturnValueOnce(newer.promise)
  const s = await import('../../src/studio/state.svelte.ts'); s.doc.id = 'project'
  const first = s.matchItemPalette('project', 'first-item', 'slash', 'west', itemColorPlan)
  await vi.waitFor(() => expect(mocks.load).toHaveBeenCalledTimes(1))
  const second = s.matchItemPalette('project', 'second-item', 'slash', 'west', itemColorPlan)
  await vi.waitFor(() => expect(mocks.load).toHaveBeenCalledTimes(2))
  const currentProject = { manifest: { name: 'Both corrections' }, images: new Map() }
  newer.resolve({ project: currentProject }); await second
  older.resolve({ project: { manifest: { name: 'Older snapshot' }, images: new Map() } }); await first
  expect(s.store.project).toBe(currentProject)
})


test('merged move flow keeps durable guards while publishing separately reviewed shared fit results', async () => {
  const body = pending<{ fitIds: string[]; warnings: string[] }>(), fits = pending<any[]>()
  let callback!: (p: Progress) => void
  mocks.move.mockImplementation((_project, _spec, onProgress) => { callback = onProgress; return body.promise })
  mocks.fits.mockReturnValueOnce(fits.promise)
  const s = await import('../../src/studio/state.svelte.ts')
  s.moving.fitIds = ['old-review']; s.moving.warnings = ['old-warning']
  const spec = { ...recoverySpec, sharedItems: ['shared-helmet'] }
  const run = s.startMove('other-project', spec)
  await vi.waitFor(() => expect(mocks.move).toHaveBeenCalledOnce())
  expect(mocks.put.mock.calls[0][2]).toMatchObject({ status: 'running', spec })
  expect(s.moving.fitIds).toEqual([]); expect(s.moving.warnings).toEqual([])
  callback(progress('animate', 3))
  body.resolve({ fitIds: ['new-review'], warnings: ['Review equipment separately'] })
  await vi.waitFor(() => expect(mocks.fits).toHaveBeenCalledOnce())
  expect(s.moving.fitIds).toEqual(['new-review']); expect(s.moving.warnings).toEqual(['Review equipment separately'])
  await s.startMove('other-project', { ...spec, seed: 987 })
  expect(mocks.move).toHaveBeenCalledOnce()
  fits.resolve([]); await run
  expect(s.moving.done).toBe(true); expect(mocks.del).toHaveBeenCalledWith('projects', 'studio-move')
  callback(progress('animate', 99))
  expect(s.moving.progress).toEqual(progress('animate', 3))
  await s.dismissMove()
  expect(s.moving.fitIds).toEqual([]); expect(s.moving.warnings).toEqual([])
})

test('concurrent item starts claim distinct draft ids while the item pipeline loads', async () => {
  const manifest = JSON.parse(readFileSync(new URL('../../public/fixtures/s2/fixture.json', import.meta.url), 'utf8'))
  mocks.load.mockResolvedValue({ rec: { id: 'project', manifest } })
  const s = await import('../../src/studio/state.svelte.ts')
  const input = { name: 'Hat', slot: 'head', prompt: 'a hat' }
  await Promise.all([s.startItem(input), s.startItem(input)])
  const ids = s.gens.map((g) => g.draft.spec.id)
  expect(ids).toHaveLength(2)
  expect(new Set(ids).size).toBe(2)
  // Each start also runs its draft (the mocked queue cannot submit, so both end failed); let that finish inside the test.
  await vi.waitFor(() => expect(s.gens.map((g) => g.phase)).toEqual(['failed', 'failed']))
  await vi.waitFor(() => expect(mocks.put.mock.calls.filter(([, key]) => key === 'studio-drafts').length).toBeGreaterThanOrEqual(4))
})

const fixtureManifest = () => JSON.parse(readFileSync(new URL('../../public/fixtures/s2/fixture.json', import.meta.url), 'utf8'))
const draftsSaved = () => mocks.put.mock.calls.filter(([, key]) => key === 'studio-drafts')

test('saving an outfit never replaces another one, including a default name after a deletion and the reserved current id', async () => {
  const s = await import('../../src/studio/state.svelte.ts')
  s.store.project = { manifest: fixtureManifest(), images: new Map() }
  s.doc.id = 'fixture:s2'
  s.savePreset('Outfit 2'); s.savePreset('Outfit 2'); s.savePreset('Adventurer'); s.savePreset('Current'); s.savePreset('鎧')
  const presets = s.store.project!.manifest.presets
  expect(presets.map((p) => p.id)).toEqual(['adventurer', 'base-only', 'outfit-2', 'outfit-2-2', 'adventurer-2', 'current-2', 'outfit'])
  expect(presets[0].name).toBe('Adventurer') // the first (default) outfit keeps its place
})

test('Try again keeps the draft when Connect is closed without a key', async () => {
  const s = await import('../../src/studio/state.svelte.ts')
  const g = { draft: { spec: { id: 'hat' }, rigId: 'project', calls: [], log: [] }, input: { name: 'Hat', slot: 'head', prompt: 'a hat' }, phase: 'failed', status: '' } as unknown as (typeof s.gens)[number]
  s.gens.push(g)
  s.retryGen(g)
  expect(s.ui.sheet).toBe('connect')
  s.clearPendingConnection()
  await Promise.resolve()
  expect(s.gens.map((x) => x.draft.spec.id)).toEqual(['hat'])
  expect(draftsSaved()).toHaveLength(0)
})

test('Clear finished waits for the stored drafts, so their records are kept', async () => {
  const stored = pending<unknown>()
  mocks.get.mockImplementation(async (_store, key) => key === 'studio-drafts' ? stored.promise : undefined)
  const s = await import('../../src/studio/state.svelte.ts')
  const cleared = s.cleanUp(60_000, false)
  await new Promise((r) => setTimeout(r, 0))
  expect(mocks.clear).not.toHaveBeenCalled()
  void s.loadGens()
  stored.resolve({ gens: [{ draft: { spec: { id: 'hat' }, rigId: 'project', calls: [{ recId: 'paid-call', old: [] }], log: [] }, input: { name: 'Hat', slot: 'head', prompt: 'a hat' }, phase: 'failed', status: '' }] })
  await cleared
  expect(mocks.clear).toHaveBeenCalled()
  for (const [keep] of mocks.clear.mock.calls) expect(keep({ id: 'paid-call', createdAt: 0 })).toBe(true)
})

test('a failed read of the stored drafts is reported and a new item cannot overwrite them', async () => {
  mocks.get.mockImplementation(async (_store, key) => { if (key === 'studio-drafts') throw new Error('read failed'); return undefined })
  mocks.load.mockResolvedValue({ rec: { id: 'project', manifest: fixtureManifest() } })
  const s = await import('../../src/studio/state.svelte.ts')
  await expect(s.loadGens()).rejects.toThrow('read failed')
  await s.startItem({ name: 'Hat', slot: 'head', prompt: 'a hat' })
  expect(s.gens).toHaveLength(0)
  expect(draftsSaved()).toHaveLength(0)
  expect(s.ui.toast).toMatch(/Saved item drafts could not be read: read failed/)
  await expect(s.cleanUp(60_000, false)).rejects.toThrow('read failed')
  expect(mocks.clear).not.toHaveBeenCalled()
})

test('a character that cannot open says why before the demo replaces it', async () => {
  mocks.source.mockImplementation(async (id: string) => { throw new Error(id === 'rig-broken' ? 'broken record' : 'demo unavailable') })
  const s = await import('../../src/studio/state.svelte.ts')
  vi.spyOn(console, 'error').mockImplementation(() => {})
  await s.openProject('rig-broken')
  expect(s.ui.toast).toBe('Could not open that character: broken record')
})

test('an unreadable character list is reported instead of showing only the demo silently', async () => {
  const s = await import('../../src/studio/state.svelte.ts')
  vi.spyOn(console, 'error').mockImplementation(() => {})
  await s.refreshProjects() // the mocked store has no `all`: listing throws
  expect(s.store.projects.map((p) => p.id)).toEqual([s.DEMO])
  expect(s.ui.toast).toMatch(/^Could not read your saved characters: /)
})

describe('move queue', () => {
  const idle = { id: 'idle', action: 'idle', frames: 4, items: [], seed: 1 }, walk = { id: 'walk', action: 'walk', frames: 8, items: [], seed: 1 }
  const done = { fitIds: [], warnings: [] }
  function storage() {
    const records = new Map<string, any>()
    mocks.put.mockImplementation(async (_store, id, value) => { records.set(id, structuredClone(value)) })
    mocks.get.mockImplementation(async (_store, id) => structuredClone(records.get(id)))
    mocks.del.mockImplementation(async (_store, id) => { records.delete(id) })
    return records
  }

  test('queued moves run one at a time in order, and the waiting ones are saved with the running move', async () => {
    const records = storage(), first = pending<typeof done>(), second = pending<typeof done>()
    mocks.move.mockReturnValueOnce(first.promise).mockReturnValueOnce(second.promise)
    const s = await import('../../src/studio/state.svelte.ts')
    const queued = s.queueMoves('project', [idle, walk])
    await vi.waitFor(() => expect(mocks.move).toHaveBeenCalledOnce())
    expect(mocks.move.mock.calls[0][1]).toMatchObject(idle)
    expect(s.moving.queued).toEqual([{ projectId: 'project', spec: walk }])
    expect(records.get('studio-move')).toMatchObject({ status: 'running', spec: idle, queued: [{ projectId: 'project', spec: walk }] })
    first.resolve(done)
    await vi.waitFor(() => expect(mocks.move).toHaveBeenCalledTimes(2))
    expect(mocks.move.mock.calls[1][1]).toMatchObject(walk)
    expect(records.get('studio-move')).toMatchObject({ status: 'running', spec: walk, queued: [] })
    second.resolve(done); await queued
    expect(records.has('studio-move')).toBe(false)
    expect(s.moving).toMatchObject({ spec: walk, done: true, queued: [] })
  })

  test('a move added while one runs waits; a failure holds the queue across reload until it is dismissed', async () => {
    const records = storage(), first = pending<typeof done>()
    mocks.move.mockReturnValueOnce(first.promise)
    const s = await import('../../src/studio/state.svelte.ts')
    const running = s.queueMoves('project', [idle])
    await vi.waitFor(() => expect(mocks.move).toHaveBeenCalledOnce())
    await s.queueMoves('project', [walk])
    expect(mocks.move).toHaveBeenCalledOnce()
    expect(records.get('studio-move')).toMatchObject({ spec: idle, queued: [{ projectId: 'project', spec: walk }] })
    first.reject(new Error('Idle failed')); await running
    expect(mocks.move).toHaveBeenCalledOnce()
    expect(records.get('studio-move')).toMatchObject({ status: 'failed', spec: idle, queued: [{ projectId: 'project', spec: walk }] })
    vi.resetModules()
    const restored = await import('../../src/studio/state.svelte.ts')
    await restored.resumeMove()
    expect(mocks.move).toHaveBeenCalledOnce()
    expect(restored.moving).toMatchObject({ spec: idle, error: 'Idle failed', queued: [{ projectId: 'project', spec: walk }] })
    await restored.dismissMove()
    expect(restored.moving.queued).toEqual([])
    expect(records.has('studio-move')).toBe(false)
  })

  test('a move queued while the last one finishes is started, not left waiting', async () => {
    const records = storage(), removing = pending<void>(), second = pending<typeof done>()
    mocks.del.mockImplementationOnce(async (_store, id) => { await removing.promise; records.delete(id) })
    mocks.move.mockResolvedValueOnce(done).mockReturnValueOnce(second.promise)
    const s = await import('../../src/studio/state.svelte.ts')
    const first = s.queueMoves('project', [idle])
    await vi.waitFor(() => expect(mocks.del).toHaveBeenCalledOnce()) // idle is done; its record is being removed
    const later = s.queueMoves('project', [walk])
    removing.resolve()
    await vi.waitFor(() => expect(mocks.move).toHaveBeenCalledTimes(2))
    expect(mocks.move.mock.calls[1][1]).toMatchObject(walk)
    await later
    expect(records.get('studio-move')).toMatchObject({ status: 'running', spec: walk, queued: [] })
    second.resolve(done); await first
    expect(records.has('studio-move')).toBe(false)
  })

  test('queueing during the write of the next move never stores the finished one again or drops the new one', async () => {
    const records = storage(), held = pending<void>(), late = pending<void>(), second = pending<typeof done>(), jump = { ...walk, id: 'jump', action: 'jump' }
    let holding = true
    mocks.put.mockImplementation(async (_store, id, value) => {
      if (holding && value.spec?.id === 'walk') { holding = false; await held.promise }
      else if (value.spec?.id === 'idle' && value.queued.some((q: { spec: { id: string } }) => q.spec.id === 'jump')) await late.promise // a slow write of the queue
      records.set(id, structuredClone(value))
    })
    mocks.move.mockResolvedValueOnce(done).mockReturnValueOnce(second.promise)
    const s = await import('../../src/studio/state.svelte.ts')
    const run = s.queueMoves('project', [idle, walk])
    await vi.waitFor(() => expect(holding).toBe(false)) // idle is done; the record that starts walk is being written
    const more = s.queueMoves('project', [jump])
    held.resolve()
    await vi.waitFor(() => expect(mocks.move).toHaveBeenCalledTimes(2))
    late.resolve(); await more
    expect(records.get('studio-move')).toMatchObject({ status: 'running', spec: walk, queued: [{ projectId: 'project', spec: jump }] })
    second.resolve(done)
    await vi.waitFor(() => expect(mocks.move).toHaveBeenCalledTimes(3))
    expect(mocks.move.mock.calls[2][1]).toMatchObject(jump)
    await run
  })

  test('dismissing a failed move drops the queue of that character only; other characters go on', async () => {
    const records = storage()
    mocks.move.mockRejectedValueOnce(new Error('Idle failed')).mockResolvedValue(done)
    const s = await import('../../src/studio/state.svelte.ts')
    const other = { projectId: 'other', spec: { ...walk, id: 'walk' } }
    s.moving.queued = []
    await s.queueMoves('project', [idle, walk])
    await vi.waitFor(() => expect(s.moving.error).toBe('Idle failed'))
    s.moving.queued = [...s.moving.queued, other]
    await s.dismissMove()
    await vi.waitFor(() => expect(mocks.move).toHaveBeenCalledTimes(2))
    expect(mocks.move.mock.calls[1][0]).toBe('other') // the other character's walk goes on; this one's queued walk is dropped
    await vi.waitFor(() => expect(records.has('studio-move')).toBe(false))
  })

  test('a move started while a dismissed one is cleared keeps the waiting move of another character', async () => {
    const records = storage(), clearing = pending<void>()
    mocks.move.mockRejectedValueOnce(new Error('Idle failed')).mockResolvedValue(done)
    const s = await import('../../src/studio/state.svelte.ts')
    await s.queueMoves('project', [idle])
    await vi.waitFor(() => expect(s.moving.error).toBe('Idle failed'))
    s.moving.queued = [{ projectId: 'other', spec: walk }]
    const put = mocks.put.getMockImplementation()!, del = mocks.del.getMockImplementation()!
    mocks.put.mockImplementationOnce(async (...args) => { await clearing.promise; return put(...args) })
    mocks.del.mockImplementationOnce(async (...args) => { await clearing.promise; return del(...args) })
    const dismissing = s.dismissMove()
    const repair = s.startMove('project', { ...idle, seed: 2 }) // e.g. an item repair, enabled again once the failed move is gone
    clearing.resolve(); await dismissing; await repair
    await vi.waitFor(() => expect(mocks.move).toHaveBeenCalledTimes(3))
    expect(mocks.move.mock.calls.map((call) => call[0])).toEqual(['project', 'project', 'other'])
    await vi.waitFor(() => expect(records.has('studio-move')).toBe(false))
  })

  test('an interrupted queue resumes its running move and then the waiting one', async () => {
    const records = storage()
    mocks.move.mockResolvedValue(done)
    const s = await import('../../src/studio/state.svelte.ts')
    records.set('studio-move', { id: 'studio-move', spec: idle, projectId: 'project', status: 'running', requestText: s.REQUEST_TEXT, queued: [{ projectId: 'project', spec: walk }] })
    await s.resumeMove()
    await vi.waitFor(() => expect(mocks.move).toHaveBeenCalledTimes(2))
    expect(mocks.move.mock.calls.map(call => call[1].id)).toEqual(['idle', 'walk'])
    await vi.waitFor(() => expect(records.has('studio-move')).toBe(false))
  })

  test('moves already running or queued for an item are pending for it, so it is not offered them at a second price', async () => {
    storage()
    const running = pending<typeof done>()
    mocks.move.mockReturnValueOnce(running.promise)
    const s = await import('../../src/studio/state.svelte.ts')
    const queued = s.queueMoves('project', [{ ...idle, items: ['cape'] }, walk, { ...walk, id: 'jump', items: ['cape'] }])
    await vi.waitFor(() => expect(mocks.move).toHaveBeenCalledOnce())
    void s.queueMoves('other', [{ ...walk, items: ['cape'] }])
    expect(s.pendingMoves('project', 'cape').map((m) => m.id)).toEqual(['idle', 'jump'])
    expect(s.pendingMoves('project').map((m) => m.id)).toEqual(['idle', 'walk', 'jump'])
    running.resolve(done)
    await vi.waitFor(() => expect(s.pendingMoves('project', 'cape').map((m) => m.id)).toEqual(['jump']))
    await queued
  })
})

type GenOf<S> = S extends { gens: (infer G)[] } ? G : never
const draftGen = (id: string, rigId: string, phase = 'running') => ({ draft: { spec: { id, name: 'New helm', slot: 'head', prompt: 'a new helm', key: 'green', anims: ['walk'], dirs: ['south'] }, rigId, calls: [], keySwitched: false, log: [] }, input: { name: 'New helm', slot: 'head', prompt: 'a new helm' }, phase, status: '' })

test('a worn draft overlays the outfit but never reaches autosave, undo or saved outfits; a saved item and discard clear it', async () => {
  const s = await import('../../src/studio/state.svelte.ts')
  s.store.project = { manifest: fixtureManifest(), images: new Map() }
  s.doc.id = 'fixture:s2'; s.doc.items = { body: 'base', head: 'hat_wizard' }
  const g = draftGen('new_helm', 'fixture:s2') as unknown as GenOf<typeof s>
  s.gens.push(g)
  s.wearDraft('new_helm')
  expect(s.doc.drafts).toEqual({ head: 'new_helm' })
  expect(s.doc.items).toEqual({ body: 'base', head: 'hat_wizard' })
  expect(s.ui.selected).toBe('gen:new_helm')
  s.setVariant('any-material', 'azure') // an edit while the draft is worn: undo entry + autosave
  s.savePreset('With the draft on')
  await s.flushSave()
  const saved = mocks.put.mock.calls.filter(([, key]) => key === 'dress-fixture:s2').map((c) => JSON.stringify(c[2]))
  expect(saved.length).toBeGreaterThan(0)
  for (const persisted of [...saved, JSON.stringify(s.doc.undo), JSON.stringify(s.store.project!.manifest)]) expect(persisted).not.toContain('new_helm')
  expect(s.store.project!.manifest.presets.at(-1)!.items.head).toBe('hat_wizard')
  expect(s.doc.drafts).toEqual({ head: 'new_helm' }) // edits elsewhere keep it on
  s.wear('hat_wizard') // the saved item shows again (it was worn under the draft)
  expect(s.doc.drafts).toEqual({})
  expect(s.doc.items.head).toBe('hat_wizard')
  s.wearDraft('new_helm'); s.clearSlots(['head'])
  expect(s.doc.drafts).toEqual({})
  s.wearDraft('new_helm')
  expect(await s.discardGen(g)).toBe(true)
  expect(s.doc.drafts).toEqual({})
  s.gens.push(draftGen('other_rig', 'rig-other') as unknown as GenOf<typeof s>)
  s.wearDraft('other_rig') // drafts of another character cannot be worn here
  expect(s.doc.drafts).toEqual({})
})

describe('optional review', () => {
  const clean = { cells: [{}], qa: { qa: { status: 'pass' }, failCalls: new Map(), softCalls: new Map(), warnings: [] as string[] }, g1: new Map(), preview: null }
  function routeMock(result: (d: unknown, ctx: unknown, h: { result?: (r: unknown) => void }) => Promise<unknown>) {
    const accept = vi.fn(async (d: { spec: { id: string } }) => ({ id: d.spec.id, name: 'New helm', slot: 'head' }))
    vi.doMock('../../src/studio/itemRoute.ts', () => ({ itemRoute: { draft: (ctx: { rec: { id: string } }, input: { name: string; slot: string }, taken: string[]) => ({ spec: { id: `helm${taken.length}`, name: input.name, slot: input.slot, prompt: 'a new helm', key: 'green', anims: [], dirs: [] }, rigId: ctx.rec.id, calls: [], keySwitched: false, log: [] }), run: result, accept } }))
    vi.doMock('../../src/lib/dress/regions.ts', () => ({ splitBase: async () => ({ dirty: false }) }))
    vi.doMock('../../src/lib/dress/dress.ts', async (original) => ({ ...await original<typeof import('../../src/lib/dress/dress.ts')>(), deriveMaterials: () => {} }))
    return accept
  }
  afterEach(() => { vi.doUnmock('../../src/studio/itemRoute.ts'); vi.doUnmock('../../src/lib/dress/regions.ts'); vi.doUnmock('../../src/lib/dress/dress.ts') })

  test('a clean draft saves itself in place: the worn slot keeps it, undo and the view stay', async () => {
    const done = pending<typeof clean>(), accept = routeMock(() => done.promise)
    const manifest = fixtureManifest()
    mocks.load.mockResolvedValue({ rec: { id: 'project', manifest } })
    const saved = fixtureManifest(); saved.items.push({ ...saved.items.find((i: { id: string }) => i.id === 'hat_wizard'), id: 'helm0', name: 'New helm' })
    mocks.source.mockResolvedValue({ project: { manifest: saved, images: new Map() }, current: { items: { body: 'base' }, variants: {} } })
    const s = await import('../../src/studio/state.svelte.ts')
    s.store.project = { manifest, images: new Map() }
    s.doc.id = 'project'; s.doc.items = { body: 'base', head: 'hat_wizard' }; s.doc.undo = [{ label: 'Earlier edit', snap: '{}' }]
    s.ui.anim = 'walk'; s.ui.frame = 3
    await s.startItem({ name: 'New helm', slot: 'head', prompt: 'a new helm' })
    s.wearDraft('helm0')
    done.resolve(clean)
    await vi.waitFor(() => expect(s.ui.toast).toBe('New helm saved'))
    expect(accept).toHaveBeenCalledOnce()
    expect(s.gens).toHaveLength(0)
    expect(s.doc.items.head).toBe('helm0')
    expect(s.doc.drafts).toEqual({})
    expect(s.store.project!.manifest).toBe(saved)
    expect(s.doc.undo.map((u) => u.label)).toEqual(['Earlier edit'])
    expect(s.ui).toMatchObject({ selected: 'helm0', frame: 3 })
  })

  test('a saved item never queues paid poses on its own (missing moves are a priced offer)', async () => {
    routeMock(async () => clean)
    mocks.load.mockResolvedValue({ rec: { id: 'project', manifest: fixtureManifest() } })
    mocks.source.mockResolvedValue({ project: { manifest: fixtureManifest(), images: new Map() }, current: { items: { body: 'base' }, variants: {} } })
    const s = await import('../../src/studio/state.svelte.ts')
    s.doc.id = 'project'
    await s.startItem({ name: 'New helm', slot: 'head', prompt: 'a new helm' })
    await vi.waitFor(() => expect(s.ui.toast).toBe('New helm saved'))
    expect(mocks.move).not.toHaveBeenCalled()
    expect(s.moving.queued).toEqual([])
  })

  test('a warned draft stays a draft with its review; nothing is saved for it', async () => {
    const accept = routeMock(async () => ({ ...clean, qa: { ...clean.qa, warnings: ['R1 idle/east: dressed item pasted on 2 near-rest frames; check that it moves'] } }))
    mocks.load.mockResolvedValue({ rec: { id: 'project', manifest: fixtureManifest() } })
    const s = await import('../../src/studio/state.svelte.ts')
    s.doc.id = 'project'
    await s.startItem({ name: 'New helm', slot: 'head', prompt: 'a new helm' })
    await vi.waitFor(() => expect(s.ui.toast).toBe('New helm is ready to review'))
    expect(s.gens.map((g) => g.phase)).toEqual(['review'])
    expect(accept).not.toHaveBeenCalled()
  })

  test('a worn draft that fails comes off, so the item under it shows again', async () => {
    const done = pending<null>()
    routeMock(() => done.promise)
    mocks.load.mockResolvedValue({ rec: { id: 'project', manifest: fixtureManifest() } })
    const s = await import('../../src/studio/state.svelte.ts')
    s.doc.id = 'project'; s.doc.items = { body: 'base', head: 'hat_wizard' }
    await s.startItem({ name: 'New helm', slot: 'head', prompt: 'a new helm' })
    s.wearDraft('helm0')
    expect(s.doc.drafts).toEqual({ head: 'helm0' })
    done.resolve(null)
    await vi.waitFor(() => expect(s.gens[0].phase).toBe('failed'))
    expect(s.doc.drafts).toEqual({})
    expect(s.doc.items.head).toBe('hat_wizard')
  })

  test('a draft discarded while it runs keeps no late preview and never saves itself', async () => {
    const done = pending<typeof clean>()
    let hooks: { result?: (r: unknown) => void } | undefined
    const accept = routeMock((_d, _ctx, h) => { hooks = h; return done.promise })
    mocks.load.mockResolvedValue({ rec: { id: 'project', manifest: fixtureManifest() } })
    const s = await import('../../src/studio/state.svelte.ts')
    s.doc.id = 'project'
    await s.startItem({ name: 'New helm', slot: 'head', prompt: 'a new helm' })
    await vi.waitFor(() => expect(hooks).toBeDefined())
    expect(await s.discardGen(s.gens[0])).toBe(true)
    hooks!.result!(clean) // a preview that lands after the discard
    done.resolve(clean)
    await new Promise((r) => setTimeout(r, 50))
    expect(s.store.results).toEqual({})
    expect(accept).not.toHaveBeenCalled()
  })

  test('a draft saving itself never cancels the open of another character', async () => {
    const done = pending<typeof clean>(), other = pending<unknown>(), accept = routeMock(() => done.promise)
    const opened = () => ({ project: { manifest: fixtureManifest(), images: new Map() }, current: { items: { body: 'base' }, variants: {} } })
    mocks.load.mockResolvedValue({ rec: { id: 'project', manifest: fixtureManifest() } })
    mocks.source.mockImplementation(async (id: string) => (id === 'other' ? other.promise : opened()))
    const s = await import('../../src/studio/state.svelte.ts')
    s.store.project = { manifest: fixtureManifest(), images: new Map() }
    s.doc.id = 'project'; s.doc.items = { body: 'base' }
    await s.startItem({ name: 'New helm', slot: 'head', prompt: 'a new helm' })
    const opening = s.openProject('other') // the user picks another character while the draft finishes
    done.resolve(clean)
    await vi.waitFor(() => expect(s.ui.toast).toBe('New helm saved'))
    expect(accept).toHaveBeenCalledOnce()
    other.resolve(opened()); await opening
    expect(s.doc.id).toBe('other')
  })

  const opened = () => ({ project: { manifest: fixtureManifest(), images: new Map() }, current: { items: { body: 'base' }, variants: {} } })
  const finished = { id: 'cross-punch', action: 'cross-punch', frames: 4, items: [], seed: 1 } // a move the fixture has, so the view could switch to it
  test.each(['move', 'item poses', 'setup'] as const)('a %s finishing never cancels the open of another character', async (kind) => {
    routeMock(async () => null) // only for the mocked base split
    const other = pending<unknown>()
    mocks.source.mockImplementation(async (id: string) => (id === 'other' ? other.promise : opened()))
    mocks.move.mockResolvedValue({ fitIds: [], warnings: [] }); mocks.setup.mockResolvedValue(undefined)
    const s = await import('../../src/studio/state.svelte.ts')
    s.store.project = { manifest: fixtureManifest(), images: new Map() }
    s.doc.id = 'project'; s.doc.items = { body: 'base' }; s.ui.anim = 'walk'
    const opening = s.openProject('other') // the user picks another character while the work finishes
    if (kind === 'setup') await s.startSetup({ projectId: 'project', baseHash: 'sha256:' + 'a'.repeat(64), restAnim: 'idle', looks: 'body', seed: 1 })
    else await s.startMove('project', { ...finished, ...(kind === 'item poses' ? { itemsOnly: true } : {}) })
    other.resolve(opened()); await opening
    expect(s.doc.id).toBe('other')
    expect(mocks.source.mock.calls.map((call) => call[0])).toEqual(['other'])
    expect(s.ui.anim).toBe('walk')
  })

  test('a character picked while a finished move reloads its own keeps the move from switching the view', async () => {
    routeMock(async () => null) // only for the mocked base split
    const reload = pending<unknown>()
    mocks.source.mockImplementation(async (id: string) => (id === 'project' ? reload.promise : opened()))
    mocks.move.mockResolvedValue({ fitIds: [], warnings: [] })
    const s = await import('../../src/studio/state.svelte.ts')
    s.store.project = { manifest: fixtureManifest(), images: new Map() }
    s.doc.id = 'project'; s.doc.items = { body: 'base' }; s.ui.anim = 'walk'
    const run = s.startMove('project', finished)
    await vi.waitFor(() => expect(mocks.source).toHaveBeenCalledOnce())
    const opening = s.openProject('other')
    reload.resolve(opened()); await run; await opening
    expect(s.doc.id).toBe('other')
    expect(s.ui.anim).toBe('walk')
  })

  test('an edit made while the open character reloads in place is kept', async () => {
    routeMock(async () => null) // only for the mocked base split
    const first = pending<unknown>(), stored = fixtureManifest()
    mocks.source.mockReturnValueOnce(first.promise).mockImplementationOnce(async () => ({ project: { manifest: stored, images: new Map() } }))
    const s = await import('../../src/studio/state.svelte.ts')
    s.store.project = { manifest: fixtureManifest(), images: new Map() }
    s.doc.id = 'fixture:s2'; s.doc.items = { body: 'base' }
    const reload = s.openProject('fixture:s2', { quiet: true }) // e.g. a draft saved itself
    await vi.waitFor(() => expect(mocks.source).toHaveBeenCalledOnce())
    s.savePreset('Made during the reload') // after the read: storage has it once saved, the copy being read does not
    stored.presets = structuredClone(s.store.project.manifest.presets)
    first.resolve({ project: { manifest: fixtureManifest(), images: new Map() } })
    await reload
    expect(s.store.project.manifest.presets.map((p: { name: string }) => p.name)).toContain('Made during the reload')
  })
})

test('a worn draft saved or discarded in another tab comes off when the drafts are read', async () => {
  mocks.get.mockImplementation(async (_store, key) => (key === 'studio-drafts' ? { gens: [] } : undefined))
  const s = await import('../../src/studio/state.svelte.ts')
  s.doc.drafts = { head: 'saved_elsewhere' }
  await s.loadGens()
  expect(s.doc.drafts).toEqual({})
})

test('notifications preserve description-only calls, optional titles and persistent errors', async () => {
  const s = await import('../../src/studio/state.svelte.ts')
  vi.useFakeTimers()
  try {
    s.toast('Preview details', { title: 'Preview', tone: 'warning', duration: 0 })
    vi.advanceTimersByTime(60_000)
    expect(s.ui.toast).toBe('Preview details')
    expect(s.ui.toastTitle).toBe('Preview')
    s.toast('Saved changes')
    expect(s.ui.toastTitle).toBe('')
    expect(s.ui.toastTone).toBe('info')
    vi.advanceTimersByTime(3999)
    expect(s.ui.toast).toBe('Saved changes')
    vi.advanceTimersByTime(1)
    expect(s.ui.toast).toBe('')
    s.toast('Could not save', { tone: 'danger' })
    vi.advanceTimersByTime(60_000)
    expect(s.ui.toast).toBe('Could not save')
    s.dismissToast()
    s.toast('Legacy duration', 8000)
    vi.advanceTimersByTime(7999)
    expect(s.ui.toast).toBe('Legacy duration')
    vi.advanceTimersByTime(1)
    expect(s.ui.toast).toBe('')
  } finally { s.dismissToast(); vi.useRealTimers() }
})

test('unresolved errors reject lower-priority messages without changing their content, timer or pauses', async () => {
  const s = await import('../../src/studio/state.svelte.ts')
  vi.useFakeTimers()
  try {
    expect(s.toast('Could not save', { title: 'Storage unavailable', tone: 'danger', duration: 8000 })).toBe(true)
    vi.advanceTimersByTime(1000)
    s.pauseToast('focus')
    const original = { ...s.ui }
    for (const options of [undefined, 100, { tone: 'info' }, { tone: 'success' }, { tone: 'warning', duration: 0 }] as const) {
      expect(s.toast('Lower-priority feedback', options)).toBe(false)
      expect(s.ui).toEqual(original)
    }
    vi.advanceTimersByTime(60_000)
    expect(s.ui.toast).toBe('Could not save')
    s.resumeToast('focus')
    vi.advanceTimersByTime(6999)
    expect(s.ui.toast).toBe('Could not save')
    vi.advanceTimersByTime(1)
    expect(s.ui.toast).toBe('')
    expect(s.toast('Saved changes')).toBe(true)
    expect(s.toast('Could not export', { tone: 'danger' })).toBe(true)
    expect(s.toast('Could not import', { tone: 'danger' })).toBe(true)
    expect(s.ui.toast).toBe('Could not import')
    expect(s.toast('Saved changes')).toBe(false)
    s.dismissToast()
    expect(s.toast('Deferred warning', { tone: 'warning' })).toBe(true)
    expect(s.ui.toast).toBe('Deferred warning')
  } finally { s.dismissToast(); vi.useRealTimers() }
})

test('notification timers pause for pointer and focus, and dismissal cannot pause the next message', async () => {
  const s = await import('../../src/studio/state.svelte.ts')
  vi.useFakeTimers()
  try {
    s.toast('Saved changes')
    vi.advanceTimersByTime(1000)
    s.pauseToast('pointer'); s.pauseToast('focus')
    vi.advanceTimersByTime(10_000)
    s.resumeToast('pointer')
    vi.advanceTimersByTime(10_000)
    expect(s.ui.toast).toBe('Saved changes')
    s.resumeToast('focus')
    vi.advanceTimersByTime(2999)
    expect(s.ui.toast).toBe('Saved changes')
    vi.advanceTimersByTime(1)
    expect(s.ui.toast).toBe('')
    s.toast('Dismiss me'); s.pauseToast('pointer'); s.pauseToast('focus'); s.dismissToast()
    s.toast('Next message')
    vi.advanceTimersByTime(4000)
    expect(s.ui.toast).toBe('')
    s.toast('Hovered message'); s.pauseToast('pointer')
    s.toast('Replacement')
    vi.advanceTimersByTime(10_000)
    expect(s.ui.toast).toBe('Replacement')
    s.resumeToast('pointer'); vi.advanceTimersByTime(4000)
    expect(s.ui.toast).toBe('')
  } finally { s.dismissToast(); vi.useRealTimers() }
})
