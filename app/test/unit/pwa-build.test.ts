import { createHash, webcrypto } from 'node:crypto'
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { runInNewContext } from 'node:vm'
import { describe, expect, it, vi } from 'vitest'
import { emitPwa, revisionHtml, revisionPath } from '../../pwa-build.ts'

const release = { build: 'build-b', version: '0.4.12', commit: 'abc1234' }
const scope = 'https://example.test/app/'
const prefix = `pixeldoll-static:${scope}:`
const metadataName = `pixeldoll-meta:${scope}`
const activeURL = scope + '.pwa-meta/active'
const leaseURL = (id: string) => scope + '.pwa-meta/client/' + encodeURIComponent(id)
const pendingURL = (id: string) => scope + '.pwa-meta/pending/' + encodeURIComponent(id)
const sharedLocks = new WeakMap<object, { request(name: string, action: () => Promise<unknown>): Promise<unknown> }>()
const bytes = new Map([
  [revisionPath('index.html', release.build), '<html>release B</html>'],
  [revisionPath('worlds/forest.png', release.build), 'world B'],
  ['assets/lazy-abc123.js', 'export default "B"'],
])
const files = [...bytes].map(([path, body]) => ({ path, hash: createHash('sha256').update(body).digest('hex') }))
const workerSource = readFileSync(new URL('../../pwa-worker.js', import.meta.url), 'utf8')

interface WindowClient { id: string; url: string; frozen?: boolean }
interface WorkerReference { scriptURL: string; postMessage(data: unknown, ports: MessagePort[]): void }

function worker(cacheData = new Map<string, Map<string, Response>>(), workerRelease = release, workerBytes = bytes, locksSupported = true) {
  if (!sharedLocks.has(cacheData)) {
    const tails = new Map<string, Promise<unknown>>()
    sharedLocks.set(cacheData, { request(name, action) {
      const current = (tails.get(name) ?? Promise.resolve()).then(action)
      tails.set(name, current.then(() => undefined, () => undefined))
      return current
    } })
  }
  const navigator = { locks: locksSupported ? sharedLocks.get(cacheData) : undefined }
  const listeners = new Map<string, (event: Record<string, unknown>) => void>()
  const fetched: { url: string; options: RequestInit }[] = []
  let windows: WindowClient[] = [{ id: 'current-client', url: scope }]
  let broken = false
  let offline = false
  const skipWaiting = vi.fn(async () => {})
  const update = vi.fn(async () => { if (offline) throw new TypeError('Offline') })
  const registration: { scope: string; waiting?: WorkerReference | null; installing?: WorkerReference | null; update: typeof update } = { scope, update }
  const caches = {
    async open(name: string) {
      if (!cacheData.has(name)) cacheData.set(name, new Map())
      const cache = cacheData.get(name)!
      return {
        async match(input: string | Request) { return cache.get(typeof input === 'string' ? input : input.url)?.clone() },
        async put(input: string | Request, response: Response) { cache.set(typeof input === 'string' ? input : input.url, response.clone()) },
        async keys() { return [...cache.keys()].map(url => new Request(url)) },
        async delete(input: string | Request) { return cache.delete(typeof input === 'string' ? input : input.url) },
      }
    },
    async keys() { return [...cacheData.keys()] },
    async delete(name: string) { return cacheData.delete(name) },
  }
  const inventory = [...workerBytes].map(([path, body]) => ({ path, hash: createHash('sha256').update(body).digest('hex') }))
  runInNewContext(`const RELEASE=${JSON.stringify(workerRelease)};const FILES=${JSON.stringify(inventory)};\n${workerSource}`, {
    self: { registration, navigator, clients: { matchAll: async () => windows }, skipWaiting, addEventListener: (type: string, handler: (event: Record<string, unknown>) => void) => listeners.set(type, handler) },
    caches, crypto: webcrypto, URL, Request, Response, AbortSignal, MessageChannel, setTimeout, clearTimeout,
    fetch: async (input: string | Request, options: RequestInit = {}) => {
      const url = typeof input === 'string' ? input : input.url
      fetched.push({ url, options })
      if (offline) throw new TypeError('Offline')
      return new Response(broken ? '<html>wrong deployment</html>' : workerBytes.get(url.slice(scope.length)) ?? 'network')
    },
  })
  async function event(type: string, extra: Record<string, unknown> = {}) {
    const waits: Promise<unknown>[] = []
    let response: Promise<Response> | undefined
    listeners.get(type)!({ ...extra, waitUntil: (promise: Promise<unknown>) => waits.push(promise), respondWith: (promise: Promise<Response>) => { response = promise } })
    await Promise.all(waits)
    return response
  }
  async function message(data: unknown, source?: Pick<WindowClient, 'id' | 'url'>) {
    const replies: unknown[] = []
    await event('message', { data, source, ports: [{ postMessage: (reply: unknown) => replies.push(reply) }] })
    return replies[0]
  }
  function attachCandidate(candidate: { message(data: unknown): Promise<unknown> }, scriptURL = scope + 'sw.js') {
    registration.waiting = { scriptURL, postMessage: (data, ports) => { void candidate.message(data).then(reply => ports[0]!.postMessage(reply)) } }
  }
  function setRegistrationState(state: { installing?: boolean; waiting?: boolean }) {
    const reference: WorkerReference = { scriptURL: scope + 'sw.js', postMessage() {} }
    registration.installing = state.installing ? reference : null
    registration.waiting = state.waiting ? reference : null
  }
  return { event, message, fetched, skipWaiting, caches, cacheData, update, attachCandidate, setRegistrationState, setWindows: (clients: WindowClient[]) => { windows = clients }, breakNetwork: () => { broken = true }, goOffline: () => { offline = true }, closeWindows: () => { windows = [] } }
}

describe('PWA release construction', () => {
  it('injects the build-versioned classic install capture before modules execute', () => {
    const html = '<html><head><script type="module" src="./assets/main-hash.js"></script></head><body></body></html>'
    const result = revisionHtml(html, release.build)
    expect(result).toContain('<script src="./install.js?pd-build=build-b"></script>\n</head>')
    expect(result).toContain('<script type="module" src="./assets/main-hash.js"></script>')
    expect(result.indexOf('install.js')).toBeLessThan(result.indexOf('</head>'))
  })

  it('versions mutable public URLs while preserving hashed chunk identity and unrelated HTML', () => {
    const html = '<script src="./appearance.js"></script><script src="./assets/main-abc.js"></script><link href="./manifest.webmanifest"><link href="https://example.test/favicon.svg"><a href="#x">x</a>'
    expect(revisionHtml(html, release.build)).toBe('<script src="./appearance.js?pd-build=build-b"></script><script src="./assets/main-abc.js"></script><link href="./manifest.webmanifest?pd-build=build-b"><link href="https://example.test/favicon.svg"><a href="#x">x</a>')
  })

  it('includes public files and unopened lazy chunks with their exact byte hashes', () => {
    const directory = mkdtempSync(join(tmpdir(), 'pixeldoll-pwa-'))
    try {
      mkdirSync(join(directory, 'assets'))
      writeFileSync(join(directory, 'index.html'), '<html>shell</html>')
      writeFileSync(join(directory, 'assets/lazy-abc.js'), 'export default 42')
      writeFileSync(join(directory, 'manifest.webmanifest'), JSON.stringify({ icons: [{ src: './icons/pwa/icon-192.png' }] }))
      const result = emitPwa(directory, release)
      expect(result.map(file => file.path)).toEqual(['assets/lazy-abc.js', 'index.html?pd-build=build-b', 'manifest.webmanifest?pd-build=build-b'])
      expect(result[0]!.hash).toBe(createHash('sha256').update('export default 42').digest('hex'))
      expect(JSON.parse(readFileSync(join(directory, 'manifest.webmanifest'), 'utf8')).icons[0].src).toBe('./icons/pwa/icon-192.png?pd-build=build-b')
      expect(JSON.parse(readFileSync(join(directory, 'release.json'), 'utf8'))).toEqual(release)
      expect(readFileSync(join(directory, 'sw.js'), 'utf8')).toContain('const RELEASE = ' + JSON.stringify(release))
      expect(result.some(file => file.path.startsWith('release.json') || file.path.startsWith('sw.js'))).toBe(false)
    } finally { rmSync(directory, { recursive: true, force: true }) }
  })
})

describe('PWA worker release safety', () => {
  it('stages a complete verified release without activation and rechecks every byte before explicit activation', async () => {
    const app = worker()
    await app.event('install')
    expect(app.fetched).toHaveLength(files.length)
    for (const fetch of app.fetched) expect(fetch.options).toEqual({ cache: 'no-store', credentials: 'omit', redirect: 'error', signal: expect.any(AbortSignal) })
    expect(app.skipWaiting).not.toHaveBeenCalled()
    expect(await app.message({ type: 'GET_RELEASE' })).toEqual(release)
    expect(await app.message({ type: 'VERIFY', build: release.build })).toEqual({ ...release, ready: true })
    expect(await app.message({ type: 'ACTIVATE', build: release.build })).toEqual({ ...release, ready: true })
    expect(app.skipWaiting).toHaveBeenCalledOnce()
    const own = await app.caches.open(prefix + release.build)
    await own.put(new URL(files[0]!.path, scope).href, new Response('corrupt'))
    expect(await app.message({ type: 'VERIFY', build: release.build })).toEqual({ ...release, ready: true })
    expect(await (await own.match(new URL(files[0]!.path, scope).href))!.text()).toBe(bytes.get(files[0]!.path))
    await own.put(new URL(files[0]!.path, scope).href, new Response('corrupt'))
    app.breakNetwork()
    expect(await app.message({ type: 'ACTIVATE', build: release.build })).toEqual({ error: 'The downloaded update is incomplete. Reconnect and try again.' })
    expect(app.skipWaiting).toHaveBeenCalledOnce()
  })

  it('repairs an evicted current shell and lazy asset from verified online bytes', async () => {
    const app = worker()
    await app.event('install')
    app.cacheData.get(prefix + release.build)!.clear()
    const navigation = await app.event('fetch', { request: { url: scope, method: 'GET', mode: 'navigate' } })
    expect(await navigation!.text()).toBe('<html>release B</html>')
    expect(app.update).not.toHaveBeenCalled()
    const lazy = await app.event('fetch', { request: new Request(scope + 'assets/lazy-abc123.js') })
    expect(await lazy!.text()).toBe('export default "B"')
    expect(await app.message({ type: 'VERIFY', build: release.build })).toEqual({ ...release, ready: true })
    expect(app.cacheData.get(prefix + release.build)!.size).toBe(files.length)
    expect(app.skipWaiting).not.toHaveBeenCalled()
  })

  it('recovers an evicted old shell from a complete newer waiting worker without activating either worker', async () => {
    const app = worker()
    await app.event('install')
    const next = { build: 'build-candidate', version: '0.4.13', commit: 'cdef123' }
    const nextBytes = new Map([[revisionPath('index.html', next.build), '<html>release C</html>'], ['assets/lazy-new123.js', 'export default "C"']])
    const candidate = worker(app.cacheData, next, nextBytes)
    await candidate.event('install')
    app.cacheData.get(prefix + release.build)!.clear()
    app.breakNetwork()
    app.attachCandidate(candidate)
    const navigation = await app.event('fetch', { request: { url: scope, method: 'GET', mode: 'navigate' } })
    expect(navigation!.status).toBe(200)
    expect(await navigation!.text()).toBe('<html>release C</html>')
    expect(app.update).not.toHaveBeenCalled()
    expect(app.skipWaiting).not.toHaveBeenCalled()
    expect(candidate.skipWaiting).not.toHaveBeenCalled()
    const lazy = await app.event('fetch', { request: new Request(scope + 'assets/lazy-new123.js') })
    expect(await lazy!.text()).toBe('export default "C"')
  })

  it('recovers offline from an already complete waiting release when the active shell was evicted', async () => {
    const app = worker()
    await app.event('install')
    const next = { build: 'offline-waiting-build', version: '0.4.13', commit: 'cdef123' }
    const nextBytes = new Map([[revisionPath('index.html', next.build), '<html>prepared offline release</html>'], ['assets/offline-lazy.js', 'export default "offline"']])
    const candidate = worker(app.cacheData, next, nextBytes)
    await candidate.event('install')
    app.cacheData.get(prefix + release.build)!.clear()
    app.attachCandidate(candidate)
    app.goOffline()
    candidate.goOffline()

    const navigation = await app.event('fetch', { request: { url: scope, method: 'GET', mode: 'navigate' } })

    expect(navigation!.status).toBe(200)
    expect(await navigation!.text()).toBe('<html>prepared offline release</html>')
    expect(app.update).not.toHaveBeenCalled()
    expect(app.skipWaiting).not.toHaveBeenCalled()
    expect(candidate.skipWaiting).not.toHaveBeenCalled()
    const lazy = await app.event('fetch', { request: new Request(scope + 'assets/offline-lazy.js') })
    expect(await lazy!.text()).toBe('export default "offline"')
  })

  it('rejects foreign or incomplete recovery workers and reports unavailable offline files honestly', async () => {
    const app = worker()
    await app.event('install')
    app.cacheData.get(prefix + release.build)!.clear()
    app.breakNetwork()
    const fake = { message: vi.fn(async () => ({ build: 'foreign-build', version: '0.4.13', commit: 'cdef123', ready: true, html: '<html>wrong</html>' })) }
    app.attachCandidate(fake, 'https://example.test/other/sw.js')
    expect((await app.event('fetch', { request: { url: scope, method: 'GET', mode: 'navigate' } }))!.status).toBe(503)
    expect(fake.message).not.toHaveBeenCalled()
    const next = { build: 'incomplete-candidate', version: '0.4.13', commit: 'cdef123' }
    const candidate = worker(app.cacheData, next, new Map([[revisionPath('index.html', next.build), '<html>release C</html>']]))
    await candidate.event('install')
    app.cacheData.get(prefix + next.build)!.clear()
    candidate.breakNetwork()
    app.attachCandidate(candidate)
    expect((await app.event('fetch', { request: { url: scope, method: 'GET', mode: 'navigate' } }))!.status).toBe(503)
    expect(candidate.skipWaiting).not.toHaveBeenCalled()
    app.goOffline()
    const offline = await app.event('fetch', { request: { url: scope, method: 'GET', mode: 'navigate' } })
    expect(offline!.status).toBe(503)
    expect(await offline!.text()).toContain('Reconnect and reload')
    expect(app.skipWaiting).not.toHaveBeenCalled()
  })

  it('rejects mixed deployment bytes and removes only the partial new cache', async () => {
    const app = worker()
    await app.caches.open(prefix + 'build-a')
    await app.caches.open('another-app')
    app.breakNetwork()
    await expect(app.event('install')).rejects.toThrow('PWA release bytes did not match this build')
    expect(await app.caches.keys()).toEqual([prefix + 'build-a', 'another-app'])
  })

  it('serves exact old public URLs after activation without borrowing the new release or another app cache', async () => {
    const app = worker()
    await app.event('install')
    const previous = await app.caches.open(prefix + 'build-a')
    const oldURL = scope + 'worlds/forest.png?pd-build=build-a'
    await previous.put(oldURL, new Response('world A'))
    await app.event('activate')
    expect(await app.caches.keys()).toContain(prefix + 'build-a')
    expect(await (await app.event('fetch', { request: new Request(oldURL) }))?.text()).toBe('world A')
    expect(await (await app.event('fetch', { request: new Request(scope + files[1]!.path) }))?.text()).toBe('world B')
    await app.caches.delete(prefix + 'build-a')
    await (await app.caches.open('other-scope')).put(oldURL, new Response('wrong app'))
    const response = await app.event('fetch', { request: new Request(oldURL) })
    expect(response?.status).toBe(503)
    expect(app.fetched).toHaveLength(files.length)
  })

  it('never intercepts API, CDN, paid POST or update discovery requests and cleans only its own idle scope', async () => {
    const app = worker()
    await app.event('install')
    for (const request of [new Request(scope + 'release.json'), new Request('https://api.pixellab.ai/v2/balance'), new Request('https://cdn.pixellab.ai/image.png'), new Request(scope + 'assets/action', { method: 'POST', body: 'paid' }), new Request('https://example.test/another-app/assets/lazy.js')]) {
      expect(await app.event('fetch', { request })).toBeUndefined()
    }
    await app.caches.open(prefix + 'build-a')
    await app.caches.open('other-app')
    app.closeWindows()
    await app.event('activate')
    // Activation now also writes scope-local release/client metadata; it must leave unrelated app caches alone.
    expect(await app.caches.keys()).toEqual([prefix + release.build, 'other-app', metadataName])
  })
})

describe('PWA release retirement', () => {
  it('pins a reserved recovery document before a superseding activation can retire its waiting release', async () => {
    const app = worker()
    await app.event('install')
    const current = { id: 'current-client', url: scope }
    await app.message({ type: 'GET_RELEASE', clientBuild: release.build }, current)
    const metadata = await app.caches.open(metadataName)
    await metadata.put(activeURL, new Response(release.build))
    const recovered = { build: 'build-recovery-waiting', version: '0.4.13', commit: 'cdef123' }
    const waiting = worker(app.cacheData, recovered, new Map([[revisionPath('index.html', recovered.build), '<html>reserved recovery</html>']]))
    await waiting.event('install')
    const newer = { build: 'build-superseding', version: '0.4.14', commit: 'def1234' }
    const activating = worker(app.cacheData, newer, new Map([[revisionPath('index.html', newer.build), '<html>latest</html>']]))
    await activating.event('install')
    activating.setWindows([current]) // The reserved recovery document cannot appear in matchAll yet.
    const reserved = { id: 'reserved-recovery-client', url: scope }
    app.attachCandidate({ message: async data => {
      if ((data as { type: string }).type === 'GET_SHELL') {
        expect(await (await metadata.match(pendingURL(reserved.id)))!.text()).toBe(recovered.build)
        await activating.event('activate')
        expect(await app.caches.keys()).toContain(prefix + recovered.build)
      }
      return waiting.message(data)
    } })
    app.cacheData.get(prefix + release.build)!.clear()
    app.breakNetwork()

    const navigation = await app.event('fetch', { resultingClientId: reserved.id, request: { url: scope, method: 'GET', mode: 'navigate' } })

    expect(await navigation!.text()).toBe('<html>reserved recovery</html>')
    expect(await (await metadata.match(pendingURL(reserved.id)))!.text()).toBe(recovered.build)
    await activating.message({ type: 'GET_RELEASE', clientBuild: newer.build }, reserved)
    expect(await metadata.match(pendingURL(reserved.id))).toBeDefined() // A different build cannot acknowledge this pin.
    await waiting.message({ type: 'GET_RELEASE', clientBuild: recovered.build }, reserved)
    expect(await metadata.match(pendingURL(reserved.id))).toBeUndefined()
    activating.setWindows([current, reserved])
    await activating.event('activate')
    expect(await app.caches.keys()).toContain(prefix + recovered.build)
    activating.setWindows([current])
    await activating.event('activate')
    expect(await app.caches.keys()).not.toContain(prefix + recovered.build)
    expect(waiting.skipWaiting).not.toHaveBeenCalled()
  })

  it('removes a recovery pin when shell verification fails and never collects without Web Locks', async () => {
    const app = worker()
    await app.event('install')
    const next = { build: 'build-failed-recovery', version: '0.4.13', commit: 'cdef123' }
    const waiting = worker(app.cacheData, next, new Map([[revisionPath('index.html', next.build), '<html>unavailable</html>']]))
    await waiting.event('install')
    app.attachCandidate(waiting)
    app.cacheData.get(prefix + release.build)!.clear()
    app.cacheData.get(prefix + next.build)!.clear()
    app.goOffline(); waiting.goOffline()
    const reservedId = 'failed-reserved-client'

    expect((await app.event('fetch', { resultingClientId: reservedId, request: { url: scope, method: 'GET', mode: 'navigate' } }))!.status).toBe(503)
    expect(await (await app.caches.open(metadataName)).match(pendingURL(reservedId))).toBeUndefined()
    const unsupported = worker(app.cacheData, release, bytes, false)
    unsupported.closeWindows()
    await unsupported.caches.open(prefix + 'unowned-old-build')
    await unsupported.event('activate')
    expect(await app.caches.keys()).toContain(prefix + 'unowned-old-build')
  })

  it('keeps current, previous and every live leased release, including frozen windows, while pruning closed leases', async () => {
    const app = worker()
    const current = { id: 'current-client', url: scope }
    const frozen = { id: 'frozen-client', url: scope + '?view=old', frozen: true }
    const closed = { id: 'closed-client', url: scope }
    app.setWindows([current, frozen, { id: 'foreign-window', url: 'https://example.test/other/' }])
    for (const build of [release.build, 'build-previous', 'build-frozen', 'build-closed', 'build-orphan']) await app.caches.open(prefix + build)
    const foreignCache = 'pixeldoll-static:https://example.test/other/:build-old'
    await app.caches.open(foreignCache)
    const metadata = await app.caches.open(metadataName)
    await metadata.put(activeURL, new Response('build-previous'))
    await app.message({ type: 'GET_RELEASE', clientBuild: release.build }, current)
    await app.message({ type: 'GET_RELEASE', clientBuild: 'build-frozen' }, frozen)
    await app.message({ type: 'GET_RELEASE', clientBuild: 'build-closed' }, closed)

    await app.event('activate')

    expect(new Set(await app.caches.keys())).toEqual(new Set([prefix + release.build, prefix + 'build-previous', prefix + 'build-frozen', foreignCache, metadataName]))
    expect(await (await metadata.match(activeURL))!.text()).toBe(release.build)
    expect(await (await metadata.match(leaseURL(current.id)))!.text()).toBe(release.build)
    expect(await (await metadata.match(leaseURL(frozen.id)))!.text()).toBe('build-frozen')
    expect(await metadata.match(leaseURL(closed.id))).toBeUndefined()
  })

  it('defers every deletion while an in-scope live window has not declared its build', async () => {
    const app = worker()
    const known = { id: 'known-client', url: scope }
    const unknown = { id: 'unknown-client', url: scope + 'index.html' }
    app.setWindows([known, unknown])
    for (const build of [release.build, 'build-previous', 'build-old', 'build-orphan']) await app.caches.open(prefix + build)
    const metadata = await app.caches.open(metadataName)
    await metadata.put(activeURL, new Response('build-previous'))
    await metadata.put(leaseURL('already-closed'), new Response('build-old'))
    await app.message({ type: 'GET_RELEASE', clientBuild: release.build }, known)

    await app.event('activate')

    expect(new Set(await app.caches.keys())).toEqual(new Set([prefix + release.build, prefix + 'build-previous', prefix + 'build-old', prefix + 'build-orphan', metadataName]))
    expect(await (await metadata.match(leaseURL('already-closed')))!.text()).toBe('build-old')
    expect(await (await metadata.match(activeURL))!.text()).toBe(release.build)
  })

  it.each(['installing', 'waiting'] as const)('does not retire any release or lease while another worker is %s', async phase => {
    const app = worker()
    app.closeWindows()
    await app.caches.open(prefix + release.build)
    await app.caches.open(prefix + 'candidate-release')
    await app.caches.open(prefix + 'build-orphan')
    const metadata = await app.caches.open(metadataName)
    await metadata.put(leaseURL('closed-client'), new Response('build-orphan'))
    app.setRegistrationState({ [phase]: true })

    await app.event('activate')

    expect(new Set(await app.caches.keys())).toEqual(new Set([prefix + release.build, prefix + 'candidate-release', prefix + 'build-orphan', metadataName]))
    expect(await (await metadata.match(leaseURL('closed-client')))!.text()).toBe('build-orphan')
  })

  it('recovers durable window leases after worker restart and retires their release only after those windows close', async () => {
    const app = worker()
    const frozen = { id: 'persisted-frozen-client', url: scope, frozen: true }
    await app.caches.open(prefix + release.build)
    await app.caches.open(prefix + 'build-frozen')
    await app.message({ type: 'GET_RELEASE', clientBuild: 'build-frozen' }, frozen)
    await (await app.caches.open(metadataName)).put(activeURL, new Response(release.build))
    const next = { build: 'build-new-active', version: '0.4.13', commit: 'cdef123' }
    const restarted = worker(app.cacheData, next, new Map([[revisionPath('index.html', next.build), '<html>next</html>']]))
    await restarted.caches.open(prefix + next.build)
    restarted.setWindows([frozen])

    await restarted.event('activate')

    expect(new Set(await restarted.caches.keys())).toEqual(new Set([prefix + release.build, prefix + 'build-frozen', prefix + next.build, metadataName]))
    expect(await (await (await restarted.caches.open(metadataName)).match(leaseURL(frozen.id)))!.text()).toBe('build-frozen')

    const final = { build: 'build-final-active', version: '0.4.14', commit: 'def1234' }
    const later = worker(app.cacheData, final, new Map([[revisionPath('index.html', final.build), '<html>final</html>']]))
    await later.caches.open(prefix + final.build)
    later.closeWindows()
    await later.event('activate')

    expect(new Set(await later.caches.keys())).toEqual(new Set([prefix + next.build, prefix + final.build, metadataName]))
    expect(await (await later.caches.open(metadataName)).match(leaseURL(frozen.id))).toBeUndefined()
  })
})
