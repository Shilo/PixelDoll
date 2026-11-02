import { get } from 'svelte/store'
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
  let published: Release = next, downloaded: Release = next
  const listeners = new Map<string, Set<EventListener>>()
  const addEventListener = (type: string, listener: EventListener) => {
    if (!listeners.has(type)) listeners.set(type, new Set())
    listeners.get(type)!.add(listener)
  }
  const removeEventListener = (type: string, listener: EventListener) => { listeners.get(type)?.delete(listener) }
  const reload = vi.fn()
  const worker = (release: () => Release) => ({
    scriptURL: scope + 'sw.js',
    state: 'activated',
    postMessage: (message: { type: string; build?: string }, ports: Port[]) => {
      const value = release()
      ports[0]!.postMessage(message.type === 'GET_RELEASE' ? value : { ...value, ready: message.build === value.build })
    },
    addEventListener: vi.fn(), removeEventListener: vi.fn(),
  })
  const active = worker(() => current)
  const waiting = worker(() => downloaded)
  const update = vi.fn(async () => {})
  const registration = { scope, active, waiting, installing: null, update, addEventListener: vi.fn(), removeEventListener: vi.fn() }
  const getRegistration = vi.fn(async (): Promise<typeof registration | undefined> => registration)
  const register = vi.fn(async () => registration)
  const fetch = vi.fn(async () => new Response(JSON.stringify(published), { headers: { 'content-type': 'application/json' } }))
  vi.stubGlobal('window', { isSecureContext: true })
  vi.stubGlobal('document', { baseURI: scope, visibilityState: 'visible', addEventListener, removeEventListener })
  vi.stubGlobal('navigator', { serviceWorker: { getRegistration, register, controller: active, addEventListener, removeEventListener } })
  vi.stubGlobal('addEventListener', addEventListener)
  vi.stubGlobal('removeEventListener', removeEventListener)
  vi.stubGlobal('matchMedia', () => ({ matches: false, addEventListener: vi.fn(), removeEventListener: vi.fn() }))
  vi.stubGlobal('MessageChannel', Channel)
  vi.stubGlobal('location', { reload })
  vi.stubGlobal('fetch', fetch)
  const client = await import('../../src/lib/pwa.ts')
  return {
    client, fetch, getRegistration, register, registration, update, reload,
    publish: (release: Release) => { published = release },
    stage: (release: Release) => { downloaded = release },
    wake: (type: 'focus' | 'online') => { for (const listener of listeners.get(type) ?? []) listener(new Event(type)) },
    start: () => { stop = client.startPwa() },
  }
}

/** Flush browser-message and fetch/json promises without advancing the bounded waits. */
const settle = () => vi.advanceTimersByTimeAsync(0)
const never = () => new Promise<never>(() => {})

describe('PWA deployment discovery remains independent of browser worker stalls', () => {
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
