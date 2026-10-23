/// <reference types="svelte" />
import { afterEach, beforeEach, expect, test, vi } from 'vitest'
import type { Progress } from '../../src/studio/create.ts'

const mocks = vi.hoisted(() => ({ create: vi.fn(), move: vi.fn(), setup: vi.fn(), recovery: vi.fn(), put: vi.fn(), get: vi.fn(), del: vi.fn() }))
vi.mock('../../src/studio/create.ts', () => ({ createCharacter: mocks.create, addMove: mocks.move, measurementRecoveryPlan: mocks.recovery, saveCopy: vi.fn() }))
vi.mock('../../src/studio/setup.ts', () => ({ setupCharacter: mocks.setup }))
vi.mock('../../src/lib/store/db.ts', () => ({ put: mocks.put, get: mocks.get, del: mocks.del }))
vi.mock('../../src/lib/app.svelte.ts', () => ({ app: { key: '' } }))
vi.mock('../../src/lib/pixellab/queue.ts', () => ({ queue: { role: 'leader', subscribe: () => () => {}, idle: () => true } }))

beforeEach(() => {
  vi.resetModules()
  Object.values(mocks).forEach((m) => m.mockReset())
  mocks.put.mockResolvedValue(undefined); mocks.get.mockResolvedValue(undefined); mocks.del.mockResolvedValue(undefined)
  // Isolate asynchronous controller logic; no rendering or Svelte reactivity is under test.
  const identity = <T>(value: T) => value
  vi.stubGlobal('$state', Object.assign(identity, { raw: identity, snapshot: identity }))
  vi.stubGlobal('$derived', Object.assign(identity, { by: () => undefined }))
  vi.stubGlobal('innerWidth', 1440); vi.stubGlobal('innerHeight', 900); vi.stubGlobal('devicePixelRatio', 1)
  vi.stubGlobal('matchMedia', () => ({ matches: false }))
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
  expect(migrated).toEqual({ ...legacy, projectId: migrated.projectId })
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
    mocks.get.mockResolvedValue({ spec, projectId: 'project', ...(status ? { status } : {}) })
    const wait = pending<string>(); mocks[kind].mockReturnValue(wait.promise)
    const s = await import('../../src/studio/state.svelte.ts')
    await resume(s)
    await vi.waitFor(() => expect(mocks[kind]).toHaveBeenCalledOnce())
    if (kind === 'move') expect(mocks.move.mock.calls[0][1]).not.toHaveProperty('poseStyle')
    wait.reject(new Error('Interrupted recovery stopped'))
    await vi.waitFor(() => expect(stateOf(s).error).toBe('Interrupted recovery stopped'))
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


const recoveryPlan = { recordIds: ['lost-west-0', 'cancelled-west-1'], rigVersion: 'rig-fingerprint', checks: 2, gens: 0.2, usd: 0.01026, rawHashes: [] }
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
