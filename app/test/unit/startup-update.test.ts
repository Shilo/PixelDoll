import { afterEach, describe, expect, it, vi } from 'vitest'

class Field {
  type = 'text'
  value = ''
  defaultValue = ''
  checked = false
  defaultChecked = false
}
type Listener = (event: Event) => void
type Navigation = 'navigate' | 'reload' | 'back_forward'
const cleanup: (() => void)[] = []
afterEach(() => {
  for (const stop of cleanup.splice(0)) stop()
  vi.clearAllTimers(); vi.useRealTimers(); vi.unstubAllGlobals(); vi.unstubAllEnvs()
})

async function documentEnvironment(options: { type?: Navigation; navigation?: boolean; wasDiscarded?: boolean; prerendering?: boolean; visible?: boolean; focused?: boolean; online?: boolean; session?: Map<string, string>; base?: string } = {}) {
  vi.resetModules(); vi.useFakeTimers(); vi.stubEnv('BASE_URL', './')
  let now = 0, blocked = false, focused = options.focused ?? true
  const listeners = new Map<string, Set<Listener>>()
  const addEventListener = (type: string, listener: Listener) => {
    if (!listeners.has(type)) listeners.set(type, new Set())
    listeners.get(type)!.add(listener)
  }
  const removeEventListener = (type: string, listener: Listener) => { listeners.get(type)?.delete(listener) }
  const session = options.session ?? new Map<string, string>()
  const sessionStorage = { getItem: vi.fn((key: string) => session.get(key) ?? null), setItem: vi.fn((key: string, value: string) => { session.set(key, value) }), removeItem: vi.fn((key: string) => { session.delete(key) }) }
  const fields: Field[] = []
  const document = { baseURI: options.base ?? 'https://example.test/app/', wasDiscarded: options.wasDiscarded ?? false, prerendering: options.prerendering ?? false, visibilityState: options.visible === false ? 'hidden' : 'visible', hasFocus: () => focused, querySelector: () => blocked ? {} : null, querySelectorAll: () => fields, addEventListener, removeEventListener }
  vi.stubGlobal('document', document)
  vi.stubGlobal('window', { addEventListener, removeEventListener })
  const network = { onLine: options.online ?? true }
  vi.stubGlobal('navigator', network)
  vi.stubGlobal('sessionStorage', sessionStorage)
  vi.stubGlobal('HTMLInputElement', Field)
  vi.stubGlobal('performance', { now: () => now, getEntriesByType: () => options.navigation === false ? [] : [{ type: options.type ?? 'navigate' }] })
  const policy = await import('../../src/lib/startup-update.ts')
  return {
    policy, document, fields, session, sessionStorage, network,
    observe: () => { cleanup.push(policy.observeStartupUpdate()) },
    open: policy.openStartupUpdateWindow,
    elapse: (milliseconds: number) => { now += milliseconds; vi.advanceTimersByTime(milliseconds) },
    block: () => { blocked = true },
    focus: (value: boolean) => { focused = value },
    event: (type: string, properties: Record<string, unknown> = {}) => { for (const listener of [...listeners.get(type) ?? []]) listener({ type, target: window, ...properties } as unknown as Event) },
  }
}

describe('nonblocking startup reload opportunity', () => {
  it('opens only when the app mounts, permits one attempt, and expires at fifteen seconds', async () => {
    const app = await documentEnvironment()
    app.observe()
    app.elapse(5_000) // Slow storage/modules do not create a loading screen or consume the mounted opportunity.
    expect(app.policy.claimStartupUpdate()).toBe(false)
    app.open()
    expect(app.policy.STARTUP_AUTO_UPDATE_MS).toBe(15_000)
    app.elapse(8_000)
    expect(app.policy.claimStartupUpdate()).toBe(true)
    expect(app.policy.claimStartupUpdate()).toBe(false)
    app.elapse(6_999)
    expect(() => app.policy.assertStartupUpdate()).not.toThrow()
    app.elapse(1)
    expect(() => app.policy.assertStartupUpdate()).toThrow(app.policy.StartupUpdateCancelled)
  })

  it.each([true, false])('never reopens automatic eligibility after reconnecting (initially online: %s)', async online => {
    const app = await documentEnvironment({ online })
    app.observe(); app.open(); app.elapse(4_000)
    if (online) {
      app.network.onLine = false
      app.event('offline', { isTrusted: true })
    }
    app.network.onLine = true
    app.event('online', { isTrusted: true })
    expect(app.policy.claimStartupUpdate()).toBe(false)
  })

  it('rechecks connectivity before a claimed reload even if the offline event has not arrived', async () => {
    const app = await documentEnvironment()
    app.observe(); app.open(); app.elapse(4_000)
    expect(app.policy.claimStartupUpdate()).toBe(true)
    app.network.onLine = false
    expect(() => app.policy.markStartupUpdateReload()).toThrow(app.policy.StartupUpdateCancelled)
    expect(app.sessionStorage.setItem).not.toHaveBeenCalled()
  })

  it('expires after sleep advances wall time even when the monotonic clock and timeout have not advanced', async () => {
    const app = await documentEnvironment()
    app.observe(); app.open()
    expect(app.policy.claimStartupUpdate()).toBe(true)
    const monotonicBeforeSleep = performance.now()
    vi.setSystemTime(Date.now() + 30_000)
    expect(performance.now()).toBe(monotonicBeforeSleep)
    expect(() => app.policy.assertStartupUpdate()).toThrow(app.policy.StartupUpdateCancelled)
    expect(() => app.policy.markStartupUpdateReload()).toThrow(app.policy.StartupUpdateCancelled)
    expect(app.sessionStorage.setItem).not.toHaveBeenCalled()
  })

  it('keeps updates manual when navigation timing evidence is unavailable', async () => {
    const app = await documentEnvironment({ navigation: false })
    app.observe(); app.open()
    expect(app.policy.claimStartupUpdate()).toBe(false)
    expect(() => app.policy.markStartupUpdateReload()).toThrow(app.policy.StartupUpdateCancelled)
    expect(app.sessionStorage.setItem).not.toHaveBeenCalled()
  })

  it.each(['pointerdown', 'click', 'keydown', 'beforeinput', 'input', 'compositionstart', 'paste', 'drop', 'wheel', 'touchstart'])('preserves trusted %s intent observed before the Studio mounts', async type => {
    const app = await documentEnvironment()
    app.observe()
    app.event(type, { isTrusted: true })
    app.open()
    expect(app.policy.claimStartupUpdate()).toBe(false)
    expect(() => app.policy.assertStartupUpdate()).toThrow(app.policy.StartupUpdateCancelled)
  })

  it('ignores synthetic input while still validating trusted input after an attempt starts', async () => {
    const app = await documentEnvironment()
    app.observe(); app.open()
    app.event('pointerdown', { isTrusted: false })
    expect(app.policy.claimStartupUpdate()).toBe(true)
    app.event('keydown', { isTrusted: true })
    expect(() => app.policy.assertStartupUpdate()).toThrow(app.policy.StartupUpdateCancelled)
  })

  it.each(['blur', 'pagehide', 'popstate', 'hashchange', 'storage'])('does not revive automatic reload after %s', async type => {
    const app = await documentEnvironment()
    app.observe(); app.open(); app.event(type)
    app.open()
    expect(app.policy.claimStartupUpdate()).toBe(false)
  })

  it('ignores captured child blur from programmatic focus but permanently cancels on window blur', async () => {
    const app = await documentEnvironment()
    app.observe(); app.open()
    app.event('blur', { target: new Field(), isTrusted: true })
    expect(app.policy.claimStartupUpdate()).toBe(true)
    app.event('blur', { target: {}, isTrusted: true })
    expect(() => app.policy.assertStartupUpdate()).not.toThrow()

    app.event('blur', { isTrusted: true })
    app.focus(true); app.open()
    expect(() => app.policy.assertStartupUpdate()).toThrow(app.policy.StartupUpdateCancelled)
    expect(() => app.policy.markStartupUpdateReload()).toThrow(app.policy.StartupUpdateCancelled)
    expect(app.sessionStorage.setItem).not.toHaveBeenCalled()
  })

  it('cancels a hidden or BFCache-restored document without reopening on foreground return', async () => {
    const app = await documentEnvironment()
    app.observe(); app.open()
    app.document.visibilityState = 'hidden'; app.event('visibilitychange')
    app.document.visibilityState = 'visible'; app.event('visibilitychange')
    expect(app.policy.claimStartupUpdate()).toBe(false)
    const restored = await documentEnvironment()
    restored.observe(); restored.open(); restored.event('pageshow', { persisted: true })
    expect(restored.policy.claimStartupUpdate()).toBe(false)
  })

  it.each([{ type: 'back_forward' as const }, { wasDiscarded: true }, { prerendering: true }, { visible: false }, { focused: false }])('excludes restored or noninteractive launches: %j', async options => {
    const app = await documentEnvironment(options)
    app.observe(); app.open()
    expect(app.policy.claimStartupUpdate()).toBe(false)
  })

  it('rechecks focus immediately before a claimed reload even when no blur event fires', async () => {
    const app = await documentEnvironment()
    app.observe(); app.open()
    expect(app.policy.claimStartupUpdate()).toBe(true)
    app.focus(false)
    expect(() => app.policy.markStartupUpdateReload()).toThrow(app.policy.StartupUpdateCancelled)
    expect(app.sessionStorage.setItem).not.toHaveBeenCalled()
  })

  it.each(['focused panel', 'restored text', 'restored checkbox'])('protects %s even when the browser emits no input event', async kind => {
    const app = await documentEnvironment()
    app.observe(); app.open()
    if (kind === 'focused panel') app.block()
    else {
      const field = new Field()
      if (kind === 'restored text') field.value = 'Do not erase an autofilled draft'
      else { field.type = 'checkbox'; field.checked = true }
      app.fields.push(field)
    }
    expect(app.policy.claimStartupUpdate()).toBe(false)
    expect(() => app.policy.markStartupUpdateReload()).toThrow(app.policy.StartupUpdateCancelled)
    expect(app.sessionStorage.setItem).not.toHaveBeenCalled()
  })

  it('marks only an allowed reload and suppresses the immediately following document to prevent loops', async () => {
    const first = await documentEnvironment()
    first.observe(); first.open()
    expect(first.policy.claimStartupUpdate()).toBe(true)
    first.policy.markStartupUpdateReload()
    expect([...first.session.values()]).toEqual(['1'])
    const next = await documentEnvironment({ session: first.session })
    next.observe(); next.open()
    expect(next.policy.claimStartupUpdate()).toBe(false)
    expect(first.session.size).toBe(0)
    const later = await documentEnvironment({ session: first.session })
    later.observe(); later.open()
    expect(later.policy.claimStartupUpdate()).toBe(true)
  })

  it('keeps reload-loop protection scoped to the app path', async () => {
    const first = await documentEnvironment()
    first.observe(); first.open(); first.policy.markStartupUpdateReload()
    const anotherApp = await documentEnvironment({ session: first.session, base: 'https://example.test/another/' })
    anotherApp.observe(); anotherApp.open()
    expect(anotherApp.policy.claimStartupUpdate()).toBe(true)
    expect(first.session.size).toBe(1)
  })

  it.each(['read', 'write'] as const)('falls back to manual updates when the session marker cannot %s', async operation => {
    const app = await documentEnvironment()
    if (operation === 'read') app.sessionStorage.getItem.mockImplementation(() => { throw new Error('Storage denied') })
    else app.sessionStorage.setItem.mockImplementation(() => { throw new Error('Storage denied') })
    app.observe(); app.open()
    if (operation === 'read') expect(app.policy.claimStartupUpdate()).toBe(false)
    else {
      expect(app.policy.claimStartupUpdate()).toBe(true)
      expect(() => app.policy.markStartupUpdateReload()).toThrow(app.policy.StartupUpdateCancelled)
    }
    expect(app.session.size).toBe(0)
    expect(() => app.policy.assertStartupUpdate()).toThrow(app.policy.StartupUpdateCancelled)
  })
})
