import { get } from 'svelte/store'
import { readFileSync } from 'node:fs'
import { runInNewContext } from 'node:vm'
import { afterEach, describe, expect, it, vi } from 'vitest'

const current = { build: '00000000-0000-4000-8000-000000000001', version: '0.4.11', commit: 'abc1234' }
const next = { build: '00000000-0000-4000-8000-000000000002', version: '0.4.12', commit: 'bcd1234' }
const later = { build: '00000000-0000-4000-8000-000000000003', version: '0.4.13', commit: 'cde1234' }
const scope = 'https://example.test/app/'
type Release = typeof current

class Port {
  onmessage: ((event: { data: unknown }) => void) | null = null
  peer!: Port
  close() {}
  postMessage(data: unknown) { void Promise.resolve().then(() => this.peer.onmessage?.({ data })) }
}
class Channel {
  port1 = new Port()
  port2 = new Port()
  constructor() { this.port1.peer = this.port2; this.port2.peer = this.port1 }
}

let stop: (() => void) | undefined
afterEach(() => {
  stop?.(); stop = undefined
  vi.clearAllTimers()
  vi.useRealTimers()
  vi.unstubAllEnvs()
  vi.unstubAllGlobals()
})

async function setup() {
  vi.resetModules()
  vi.useFakeTimers()
  vi.stubEnv('PROD', true)
  vi.stubEnv('BASE_URL', './')
  vi.stubGlobal('__APP_BUILD__', current.build)
  let published: Release = next
  const listeners = new Map<string, Set<EventListener>>()
  const addEventListener = (type: string, listener: EventListener) => {
    if (!listeners.has(type)) listeners.set(type, new Set())
    listeners.get(type)!.add(listener)
  }
  const removeEventListener = (type: string, listener: EventListener) => { listeners.get(type)?.delete(listener) }
  const reload = vi.fn()
  const messageHolds = new Map<string, Promise<void>>()
  const messages: string[] = []
  let activate = () => {}
  const worker = (release: Release) => ({
    scriptURL: scope + 'sw.js',
    state: 'activated',
    postMessage: (message: { type: string; build?: string }, ports: Port[]) => {
      messages.push(message.type)
      const value = release
      if (message.type === 'ACTIVATE') activate()
      const send = () => ports[0]!.postMessage(message.type === 'GET_RELEASE' ? value : { ...value, ready: message.build === value.build })
      const held = messageHolds.get(value.build + ':' + message.type) ?? messageHolds.get(message.type)
      if (held) void held.then(send)
      else send()
    },
    addEventListener: vi.fn(), removeEventListener: vi.fn(),
  })
  const active = worker(current)
  const waiting = worker(next)
  const update = vi.fn(async () => {})
  const registration = { scope, active, waiting: waiting as typeof waiting | null, installing: null, update, addEventListener: vi.fn(), removeEventListener: vi.fn() }
  const serviceWorker = { getRegistration: vi.fn(async (): Promise<typeof registration | undefined> => registration), register: vi.fn(async () => registration), controller: active, addEventListener, removeEventListener }
  activate = () => { if (registration.waiting) { registration.active = registration.waiting; serviceWorker.controller = registration.waiting } }
  const { getRegistration, register } = serviceWorker
  const fetch = vi.fn(async () => new Response(JSON.stringify(published), { headers: { 'content-type': 'application/json' } }))
  const matchMedia = () => ({ matches: false, addEventListener: vi.fn(), removeEventListener: vi.fn() })
  const window = { isSecureContext: true, top: undefined as unknown, addEventListener, removeEventListener, matchMedia, navigator: { standalone: false } }
  window.top = window
  runInNewContext(readFileSync(new URL('../../public/install.js', import.meta.url), 'utf8'), { window })
  vi.stubGlobal('window', window)
  vi.stubGlobal('document', { baseURI: scope, visibilityState: 'visible', hasFocus: () => true, wasDiscarded: false, prerendering: false, querySelector: () => null, querySelectorAll: () => [], addEventListener, removeEventListener })
  vi.stubGlobal('navigator', { serviceWorker })
  vi.stubGlobal('addEventListener', addEventListener)
  vi.stubGlobal('removeEventListener', removeEventListener)
  vi.stubGlobal('matchMedia', matchMedia)
  vi.stubGlobal('MessageChannel', Channel)
  vi.stubGlobal('location', { reload })
  vi.stubGlobal('fetch', fetch)
  const client = await import('../../src/lib/pwa.ts')
  return {
    client, fetch, getRegistration, register, registration, update, reload, messages,
    holdMessage: (type: string, held: Promise<void>, build?: string) => { messageHolds.set(build ? build + ':' + type : type, held) },
    publish: (release: Release) => { published = release },
    stage: (release: Release) => { registration.waiting = worker(release) },
    wake: (type: 'focus' | 'online' | 'controllerchange') => { for (const listener of listeners.get(type) ?? []) listener(new Event(type)) },
    start: () => { stop = client.startPwa() },
  }
}

/** Flush browser-message and fetch/json promises without advancing the bounded waits. */
const settle = () => vi.advanceTimersByTimeAsync(0)
const never = () => new Promise<never>(() => {})

describe('PWA deployment discovery remains independent of browser worker stalls', () => {
  it.each(['GET_RELEASE', 'VERIFY'])('ignores a replaced worker’s late successful %s before metadata catches up', async type => {
    const app = await setup()
    let release!: () => void
    app.holdMessage(type, new Promise<void>(resolve => { release = resolve }), next.build)
    app.start(); await settle()
    expect(get(app.client.pwa)).toMatchObject({ available: next, ready: false })
    // Installation can expose C before the metadata CDN catches up. B is no longer the candidate to apply.
    app.stage(later)
    release(); await settle()
    expect(get(app.client.pwa)).toMatchObject({ available: next, ready: false, error: '' })
    expect(app.reload).not.toHaveBeenCalled()
  })

  it.each(['GET_RELEASE', 'VERIFY'])('ignores a superseded worker’s delayed %s failure after the newer update is ready', async type => {
    const app = await setup()
    app.start(); await settle()
    expect(get(app.client.pwa)).toMatchObject({ available: next, ready: true })
    app.holdMessage(type, never(), next.build)
    // Worker lifecycle events inspect independently of the coalesced metadata checks.
    app.wake('controllerchange'); await settle()
    app.publish(later); app.stage(later)
    app.wake('focus'); await settle()
    expect(get(app.client.pwa)).toMatchObject({ available: later, ready: true, error: '' })
    await vi.advanceTimersByTimeAsync(15_000)
    expect(get(app.client.pwa)).toMatchObject({ available: later, ready: true, error: '' })
    expect(app.reload).not.toHaveBeenCalled()
  })

  it('still reports a verification failure for the available update and recovers on the next check', async () => {
    const app = await setup()
    app.start(); await settle()
    let release!: () => void
    app.holdMessage('VERIFY', new Promise<void>(resolve => { release = resolve }), next.build)
    app.wake('controllerchange'); await settle()
    await vi.advanceTimersByTimeAsync(15_000)
    expect(get(app.client.pwa)).toMatchObject({ available: next, ready: false })
    expect(get(app.client.pwa).error).toContain('The update did not respond.')
    release(); app.wake('online'); await settle()
    expect(get(app.client.pwa)).toMatchObject({ available: next, ready: true, error: '' })
  })

  it('still reports missing current-app offline files even when a newer update has become ready', async () => {
    const app = await setup()
    app.registration.waiting = null
    app.start(); await settle()
    expect(get(app.client.pwa).offlineReady).toBe(true)
    app.holdMessage('VERIFY', never(), current.build)
    app.wake('controllerchange'); await settle()
    app.publish(later); app.stage(later)
    app.wake('focus'); await settle()
    expect(get(app.client.pwa)).toMatchObject({ available: later, ready: true, offlineReady: true })
    await vi.advanceTimersByTimeAsync(15_000)
    expect(get(app.client.pwa)).toMatchObject({ available: later, ready: true, offlineReady: false })
    expect(get(app.client.pwa).error).toContain('The update did not respond.')
  })

  it.each(['GET_RELEASE', 'VERIFY'])('does not publish a delayed %s failure after the PWA runtime stops', async type => {
    const app = await setup()
    app.start(); await settle()
    app.holdMessage(type, never(), next.build)
    app.wake('controllerchange'); await settle()
    const before = get(app.client.pwa)
    stop?.(); stop = undefined
    await vi.advanceTimersByTimeAsync(15_000)
    expect(get(app.client.pwa)).toEqual(before)
  })

  it.each(['getRegistration', 'register'] as const)('shows a deployment immediately and discovers the next one after a stalled %s times out', async operation => {
    const app = await setup()
    if (operation === 'getRegistration') app.getRegistration.mockImplementation(never)
    else { app.getRegistration.mockResolvedValue(undefined); app.register.mockImplementation(never) }
    app.start()
    await settle()

    expect(get(app.client.pwa).available).toEqual(next)
    expect(get(app.client.pwa).ready).toBe(false)
    expect(app.fetch).toHaveBeenCalledOnce()
    expect(app[operation]).toHaveBeenCalledOnce()

    app.publish(later)
    app.wake('online')
    await vi.advanceTimersByTimeAsync(15_000)

    expect(app.fetch).toHaveBeenCalledTimes(2)
    expect(get(app.client.pwa).available).toEqual(later)
    expect(app[operation]).toHaveBeenCalledTimes(2)
    expect(app.reload).not.toHaveBeenCalled()
  })

  it('keeps a ready update visible while the browser update check stalls, then follows a queued wake to a newer version', async () => {
    const app = await setup()
    app.update.mockImplementationOnce(never)
    app.start()
    await settle()

    expect(get(app.client.pwa).available).toEqual(next)
    expect(get(app.client.pwa).ready).toBe(true)
    expect(app.update).toHaveBeenCalledOnce()
    expect(app.reload).not.toHaveBeenCalled()

    app.publish(later); app.stage(later)
    app.wake('focus')
    await vi.advanceTimersByTimeAsync(15_000)

    expect(app.fetch).toHaveBeenCalledTimes(2)
    expect(app.update).toHaveBeenCalledTimes(2)
    expect(get(app.client.pwa).available).toEqual(later)
    expect(get(app.client.pwa).ready).toBe(true)
    expect(get(app.client.pwa).error).toBe('')
    expect(app.reload).not.toHaveBeenCalled()
  })

  it('recovers registration after an initial failure without losing the version notice or automatically reloading', async () => {
    const app = await setup()
    app.getRegistration.mockResolvedValue(undefined)
    app.register.mockRejectedValueOnce(new Error('The browser could not download sw.js'))
    app.start()
    await settle()

    expect(get(app.client.pwa).available).toEqual(next)
    expect(get(app.client.pwa).ready).toBe(false)
    expect(get(app.client.pwa).error).toContain('The browser could not download sw.js')
    expect(app.reload).not.toHaveBeenCalled()

    app.wake('online')
    await settle()

    expect(app.register).toHaveBeenCalledTimes(2)
    expect(get(app.client.pwa).available).toEqual(next)
    expect(get(app.client.pwa).ready).toBe(true)
    expect(get(app.client.pwa).error).toBe('')
    expect(app.reload).not.toHaveBeenCalled()
  })
})

describe('automatic startup updates revalidate asynchronous work', () => {
  async function readyStartup(configure?: (app: Awaited<ReturnType<typeof setup>>) => void) {
    const app = await setup()
    configure?.(app)
    app.start(); await settle()
    vi.stubGlobal('performance', { now: () => Date.now(), getEntriesByType: () => [{ type: 'navigate' }] })
    const marker = new Map<string, string>()
    vi.stubGlobal('sessionStorage', { getItem: (key: string) => marker.get(key) ?? null, setItem: (key: string, value: string) => marker.set(key, value), removeItem: (key: string) => marker.delete(key) })
    const policy = await import('../../src/lib/startup-update.ts')
    const stop = policy.observeStartupUpdate()
    policy.openStartupUpdateWindow()
    expect(policy.claimStartupUpdate()).toBe(true)
    const beforeReload = vi.fn(policy.markStartupUpdateReload)
    const automatic = { validate: policy.assertStartupUpdate, beforeReload }
    return { ...app, policy, stop, marker, automatic, beforeReload }
  }

  it('uses the verified fast path and records loop protection only immediately before reload', async () => {
    const app = await readyStartup()
    try {
      await app.client.applyUpdate(async () => {}, app.automatic)
      expect(app.messages).toContain('ACTIVATE')
      expect(app.beforeReload).toHaveBeenCalledOnce()
      expect([...app.marker.values()]).toEqual(['1'])
      expect(app.reload).toHaveBeenCalledOnce()
    } finally { app.stop() }
  })

  it('applies an already-ready automatic target while the background browser update check remains stalled', async () => {
    const app = await readyStartup(app => { app.update.mockImplementationOnce(never) })
    try {
      expect(get(app.client.pwa)).toMatchObject({ available: next, ready: true })
      expect(app.fetch).toHaveBeenCalledOnce()
      expect(app.update).toHaveBeenCalledOnce()
      const priorMessages = app.messages.length
      await app.client.applyUpdate(async () => {}, app.automatic)
      expect(app.fetch).toHaveBeenCalledOnce()
      expect(app.update).toHaveBeenCalledOnce()
      expect(app.messages.slice(priorMessages)).toEqual(expect.arrayContaining(['VERIFY', 'ACTIVATE']))
      expect(app.beforeReload).toHaveBeenCalledOnce()
      expect(app.reload).toHaveBeenCalledOnce()
      expect([...app.marker.values()]).toEqual(['1'])
    } finally { app.stop() }
  })

  it('refreshes an explicit update and refuses an obsolete notice when a newer deployment is discovered', async () => {
    const app = await readyStartup()
    try {
      app.publish(later)
      await expect(app.client.applyUpdate(async () => {})).rejects.toThrow('The available update changed')
      expect(app.fetch).toHaveBeenCalledTimes(2)
      expect(app.update).toHaveBeenCalledTimes(2)
      expect(get(app.client.pwa).available).toEqual(later)
      expect(app.messages).not.toContain('ACTIVATE')
      expect(app.reload).not.toHaveBeenCalled()
    } finally { app.stop() }
  })

  it.each(['VERIFY', 'ACTIVATE'])('keeps the running document when its deadline expires while %s is pending', async type => {
    const app = await readyStartup()
    let release!: () => void
    app.holdMessage(type, new Promise<void>(resolve => { release = resolve }))
    try {
      const result = app.client.applyUpdate(async () => {}, app.automatic).then(() => null, error => error)
      await settle()
      expect(app.messages).toContain(type)
      await vi.advanceTimersByTimeAsync(2_001)
      release(); await settle()
      expect(await result).toBeInstanceOf(app.policy.StartupUpdateCancelled)
      expect(app.beforeReload).not.toHaveBeenCalled()
      expect(app.marker.size).toBe(0)
      expect(app.reload).not.toHaveBeenCalled()
      if (type === 'VERIFY') expect(app.messages).not.toContain('ACTIVATE')
      expect(get(app.client.pwa)).toMatchObject({ available: next, ready: true })
    } finally { app.stop() }
  })

  it('rechecks the final asynchronous save and preserves manual recovery after automatic eligibility ends', async () => {
    const app = await readyStartup()
    let release!: () => void, preparing = 0
    const finalSave = new Promise<void>(resolve => { release = resolve })
    try {
      const result = app.client.applyUpdate(async () => { if (++preparing === 3) await finalSave }, app.automatic).then(() => null, error => error)
      await settle()
      expect(preparing).toBe(3)
      await vi.advanceTimersByTimeAsync(2_001)
      release(); await settle()
      expect(await result).toBeInstanceOf(app.policy.StartupUpdateCancelled)
      expect(app.reload).not.toHaveBeenCalled()
      expect(app.beforeReload).not.toHaveBeenCalled()
      await app.client.applyUpdate(async () => {})
      expect(app.reload).toHaveBeenCalledOnce()
    } finally { app.stop() }
  })
})
