/// <reference types="svelte" />
import { afterEach, beforeEach, expect, test, vi } from 'vitest'
import type { Balance } from '../../src/lib/pixellab/routes.ts'

const mocks = vi.hoisted(() => ({ api: vi.fn(), listeners: [] as (() => void)[], queue: { key: '', setKey: vi.fn(), subscribe: vi.fn() } }))
vi.mock('../../src/lib/pixellab/client.ts', async (importOriginal) => ({ ...await importOriginal<object>(), api: mocks.api }))
vi.mock('../../src/lib/pixellab/queue.ts', () => ({ queue: mocks.queue }))
vi.mock('../../src/lib/shared-auth.ts', async (original) => ({
  ...await original<object>(),
  watchSharedAuth: () => ({ acknowledge() {}, changed() {}, forget() {}, close() {} }),
}))

beforeEach(() => {
  vi.resetModules()
  mocks.api.mockReset()
  mocks.listeners.length = 0
  mocks.queue.key = ''
  mocks.queue.setKey.mockImplementation((key: string) => { mocks.queue.key = key; mocks.listeners.forEach((f) => f()) })
  mocks.queue.subscribe.mockImplementation((fn: () => void) => { mocks.listeners.push(fn); fn(); return () => {} })
  // Exercise the state logic without mounting Svelte. The rune is an identity in this isolated test.
  vi.stubGlobal('$state', <T>(value: T) => value)
})
afterEach(() => vi.unstubAllGlobals())
const balance = { credits: { type: 'usd', usd: 0 }, subscription: { type: 'generations', status: 'active', generations: 42, total: 100 } } as Balance
function pending<T>() { let resolve!: (value: T) => void, reject!: (reason: unknown) => void; const promise = new Promise<T>((a, b) => { resolve = a; reject = b }); return { promise, resolve, reject } }

test('late balance cannot repopulate state after Forget, even if the same token reconnects', async () => {
  const first = pending<Balance>(), second = pending<Balance>()
  mocks.api.mockReturnValueOnce(first.promise).mockReturnValueOnce(second.promise)
  const state = await import('../../src/lib/app.svelte.ts')
  state.setKey('synthetic-token', false)
  state.forgetKey()
  state.setKey('synthetic-token', false)
  first.resolve(balance)
  await first.promise; await Promise.resolve()
  expect(state.app.balance).toBeNull()
  second.resolve(balance)
  await second.promise; await Promise.resolve()
  expect(state.app.balance).toEqual(balance)
})

test('late authentication rejection cannot reject a replacement token', async () => {
  const old = pending<Balance>(), current = pending<Balance>()
  mocks.api.mockReturnValueOnce(old.promise).mockReturnValueOnce(current.promise)
  const state = await import('../../src/lib/app.svelte.ts')
  const { ApiError } = await import('../../src/lib/pixellab/client.ts')
  state.setKey('synthetic-old', false)
  state.setKey('synthetic-current', false)
  old.reject(new ApiError(401, 'auth', 'rejected'))
  await old.promise.catch(() => {}); await Promise.resolve()
  expect(state.app.keyRejected).toBe(false)
  expect(state.app.balanceError).toBe('')
  current.resolve(balance)
  await current.promise; await Promise.resolve()
  expect(state.app.balance).toEqual(balance)
})

test('credential-free Forget clears remembered state and ignores an in-flight balance', async () => {
  const request = pending<Balance>()
  mocks.api.mockReturnValueOnce(request.promise)
  const state = await import('../../src/lib/app.svelte.ts')
  state.setKey('synthetic-remembered', true)
  mocks.queue.setKey('') // another tab's credential-free Forget signal
  expect(state.app.remembered).toBe(false)
  request.resolve(balance)
  await request.promise; await Promise.resolve()
  expect(state.app.key).toBe('')
  expect(state.app.balance).toBeNull()
})
