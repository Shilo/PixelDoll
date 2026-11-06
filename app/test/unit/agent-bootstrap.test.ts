import { afterEach, beforeEach, expect, test, vi } from 'vitest'

const auth = vi.hoisted(() => ({ key: '', revision: 0, connect: vi.fn() }))
vi.mock('svelte', () => ({ mount: vi.fn() }))
vi.mock('../../src/App.svelte', () => ({ default: {} }))
vi.mock('../../src/lib/app.svelte.ts', () => ({
  app: { get key() { return auth.key } },
  getKeyRevision: () => auth.revision,
  setKey: auth.connect,
}))
vi.mock('../../src/lib/pixellab/queue.ts', () => ({ queue: { connect: vi.fn(), disconnect: vi.fn() } }))
vi.mock('../../src/lib/store/db.ts', () => ({ askPersist: vi.fn() }))

function deferred<T>() {
  let resolve!: (value: T) => void
  const promise = new Promise<T>(done => { resolve = done })
  return { promise, resolve }
}

let response: ReturnType<typeof deferred<Response>>
let body: ReturnType<typeof deferred<string>>
beforeEach(() => {
  vi.resetModules()
  auth.key = ''; auth.revision = 0; auth.connect.mockClear()
  response = deferred<Response>(); body = deferred<string>()
  vi.stubEnv('MODE', 'agent')
  const frame = {}; Object.assign(frame, { top: frame })
  vi.stubGlobal('window', frame)
  vi.stubGlobal('document', { getElementById: (id: string) => id === 'app' ? {} : null })
  vi.stubGlobal('addEventListener', vi.fn())
  vi.stubGlobal('removeEventListener', vi.fn())
  vi.stubGlobal('localStorage', { getItem: () => null })
  vi.stubGlobal('fetch', vi.fn(() => response.promise))
})
afterEach(() => { vi.unstubAllGlobals(); vi.unstubAllEnvs() })

const reply = () => response.resolve({ ok: true, text: () => body.promise } as Response)
const settle = async () => { await new Promise<void>(resolve => setImmediate(resolve)) }

test('an unchanged keyless agent startup connects once, without persistence', async () => {
  await import('../../src/bootstrap.ts')
  reply(); body.resolve('synthetic-agent-token'); await settle()
  expect(auth.connect).toHaveBeenCalledExactlyOnceWith('synthetic-agent-token', false)
})

for (const stage of ['response', 'body'] as const) {
  test.each(['manual replacement', 'Forget while keyless', 'connect then Forget'])(`a late agent ${stage} cannot undo %s`, async action => {
    await import('../../src/bootstrap.ts')
    if (stage === 'body') { reply(); await settle() }
    auth.revision++
    if (action === 'connect then Forget') auth.revision++
    auth.key = action === 'manual replacement' ? 'synthetic-manual-token' : ''
    if (stage === 'response') reply()
    body.resolve('synthetic-agent-token'); await settle()
    expect(auth.connect).not.toHaveBeenCalled()
  })
}

test.each(['development', 'production build', 'framed', 'off', 'existing key'])('agent startup is skipped for %s', async reason => {
  if (reason === 'development') vi.stubEnv('MODE', 'development')
  if (reason === 'production build') vi.stubEnv('DEV', false)
  if (reason === 'framed') vi.stubGlobal('window', { top: {} })
  if (reason === 'off') vi.stubGlobal('localStorage', { getItem: () => 'off' })
  if (reason === 'existing key') auth.key = 'synthetic-existing-token'
  await import('../../src/bootstrap.ts')
  expect(fetch).not.toHaveBeenCalled()
  expect(auth.connect).not.toHaveBeenCalled()
})

test('unavailable optional storage still permits the memory-only connection', async () => {
  vi.stubGlobal('localStorage', { getItem: () => { throw new Error('storage denied') } })
  await import('../../src/bootstrap.ts')
  reply(); body.resolve('synthetic-agent-token'); await settle()
  expect(auth.connect).toHaveBeenCalledExactlyOnceWith('synthetic-agent-token', false)
})

test('a setup-error response never becomes a token', async () => {
  await import('../../src/bootstrap.ts')
  response.resolve({ ok: false, text: () => Promise.resolve('sanitized setup error') } as Response)
  await settle()
  expect(auth.connect).not.toHaveBeenCalled()
})
