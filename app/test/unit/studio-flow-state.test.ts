/// <reference types="svelte" />
import { afterEach, beforeAll, beforeEach, expect, test, vi } from 'vitest'
import type { Progress } from '../../src/studio/create.ts'
import { readFileSync } from 'node:fs'

const mocks = vi.hoisted(() => ({ create: vi.fn(), move: vi.fn(), setup: vi.fn(), recovery: vi.fn(), palette: vi.fn(), match: vi.fn(), load: vi.fn(), source: vi.fn(), fits: vi.fn(), put: vi.fn(), get: vi.fn(), del: vi.fn() }))
vi.mock('../../src/studio/create.ts', () => ({ createCharacter: mocks.create, addMove: mocks.move, measurementRecoveryPlan: mocks.recovery, bodyPaletteRepairPlan: mocks.palette, saveCopy: vi.fn() }))
vi.mock('../../src/studio/setup.ts', () => ({ setupCharacter: mocks.setup }))
vi.mock('../../src/lib/items/run.ts', async original => ({ ...await original<typeof import('../../src/lib/items/run.ts')>(), matchItemColors: mocks.match }))
vi.mock('../../src/lib/store/project.ts', async original => ({ ...await original<typeof import('../../src/lib/store/project.ts')>(), loadProject: mocks.load }))
vi.mock('../../src/lib/dress/project.ts', async original => ({ ...await original<typeof import('../../src/lib/dress/project.ts')>(), openSource: mocks.source }))
vi.mock('../../src/lib/equipment/fits.ts', async original => ({ ...await original<typeof import('../../src/lib/equipment/fits.ts')>(), listFits: mocks.fits }))

vi.mock('../../src/lib/store/db.ts', () => ({ put: mocks.put, get: mocks.get, del: mocks.del }))
vi.mock('../../src/lib/app.svelte.ts', () => ({ app: { key: '' } }))
vi.mock('../../src/lib/pixellab/queue.ts', () => ({ queue: { role: 'leader', subscribe: () => () => {}, idle: () => true } }))

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
  mocks.put.mockResolvedValue(undefined); mocks.get.mockResolvedValue(undefined); mocks.del.mockResolvedValue(undefined); mocks.fits.mockResolvedValue([])
  stubGlobals()
})
afterEach(() => vi.unstubAllGlobals())
function pending<T>() { let resolve!: (value: T) => void, reject!: (error: unknown) => void; const promise = new Promise<T>((a, b) => { resolve = a; reject = b }); return { promise, resolve, reject } }
const progress = (step: string, done: number): Progress => ({ step, done, total: 69, recIds: [] })

test.each(['create', 'move', 'setup'] as const)('%s ignores late sibling progress after failure, during retry, and after termination', async (kind) => {
  const first = pending<string>(), second = pending<string>(), callbacks: ((p: Progress) => void)[] = []
  const flow = mocks[kind]
  flow.mockImplementationOnce((...args: unknown[]) => { callbacks.push(args.at(-1) as (p: Progress) => void); return first.promise })
    .mockImplementationOnce((...args: unknown[]) => { callbacks.push(args.at(-1) as (p: Progress) => void); return second.promise })
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
    mocks[kind].mockImplementationOnce((...args: unknown[]) => { callback = args.at(-1) as (p: Progress) => void; callback(progress('animate', 4)); throw new Error(message) })
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
