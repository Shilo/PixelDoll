import { get, writable } from 'svelte/store'

import { bounded, fetchRelease, readRelease, waitForWorker, workerMessage, type Release } from './pwa-release.ts'
interface InstallPrompt extends Event {
  prompt(): Promise<void>
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>
}
interface InstallCapture {
  readonly prompt: InstallPrompt | undefined
  readonly installed: boolean | undefined
  take(): InstallPrompt | undefined
  subscribe(listener: () => void): () => void
}
declare global { interface Window { __pixeldollInstall?: InstallCapture } }
export const pwa = writable({ available: null as Release | null, ready: false, offlineReady: false, error: '', installable: false, installed: false, installing: false, installError: '' })
let registration: ServiceWorkerRegistration | undefined
let latest: Release | null = null
let updateAction: (() => void) | undefined
let installHelp: (() => void) | undefined
let checking: Promise<void> | undefined
let checkAgain = false
let stopped = true
let base: URL
let registerWorker: (() => Promise<void>) | undefined

async function inspectWorker() {
  if (!registration || stopped) return
  const preferred = () => registration?.waiting ?? registration?.active
  const worker = preferred()
  if (!worker) return
  let release: Release
  try { release = readRelease(await workerMessage(worker, 'GET_RELEASE')) }
  catch (error) {
    // A replaced worker can stop responding while a newer worker has already passed verification.
    if (stopped || worker !== preferred()) return
    throw error
  }
  const relevant = () => !stopped && (release.build === __APP_BUILD__ || (release.build === latest?.build && worker === preferred()))
  if (!relevant()) return
  try {
    const check = await workerMessage(worker, 'VERIFY', release.build)
    if (!relevant()) return
    if (check.ready !== true) throw new Error('The downloaded app is incomplete.')
    if (release.build === __APP_BUILD__) pwa.update(s => ({ ...s, offlineReady: true }))
  } catch (e) {
    if (!relevant()) return
    pwa.update(s => ({ ...s, ...(release.build === __APP_BUILD__ ? { offlineReady: false } : { ready: false }), error: (e as Error).message }))
    throw e
  }
  if (latest && release.build === latest.build && release.build !== __APP_BUILD__) {
    pwa.update(s => ({ ...s, available: release, ready: true, error: '' }))
  }
}

/** A bounded foreground poll plus wake/reconnect events. Never gates discovery on successful staging. */
export function checkForUpdate(): Promise<void> {
  if (stopped) return Promise.resolve()
  if (checking) { checkAgain = true; return checking }
  checking = (async () => {
    do {
      checkAgain = false
      const failures: string[] = []
      // Discover first: stalled browser operations and cache/quota failures cannot hide newer deployments.
      try {
        latest = await fetchRelease(base)
        if (stopped) return
        const available = latest.build === __APP_BUILD__ ? null : latest
        pwa.update(s => ({ ...s, available, ready: available?.build === s.available?.build && s.ready, error: '' }))
      } catch (e) { failures.push((e as Error).message) }
      try { if (!registration && registerWorker) await bounded(registerWorker(), 'Offline setup did not respond.') }
      catch (e) { failures.push(`Offline setup failed: ${(e as Error).message}`) }
      const inspect = () => inspectWorker().catch(e => { failures.push((e as Error).message) })
      // The old cache may need a slow repair. Its health check must not delay staging or verifying the new release.
      const update = async () => {
        if (!registration) return
        try { await bounded(registration.update(), 'The browser update check did not respond.') }
        catch (e) { failures.push((e as Error).message) }
        await inspect()
      }
      await Promise.all([inspect(), update()])
      if (!stopped && failures.length) pwa.update(s => ({ ...s, error: `${[...new Set(failures)].join(' ')} Checks resume automatically when connected.` }))
    } while (checkAgain && !stopped)
  })().finally(() => { checking = undefined })
  return checking
}

export function setPwaActions(update: () => void, help: () => void) {
  updateAction = update; installHelp = help
  return () => { updateAction = undefined; installHelp = undefined }
}
export function requestUpdate() { updateAction?.() }
export function requestInstallHelp() { installHelp?.() }
export async function installApp() {
  const state = get(pwa)
  if (state.installed || state.installing) return false
  const event = window.__pixeldollInstall?.take()
  if (!event) { requestInstallHelp(); return false }
  pwa.update(s => ({ ...s, installable: false, installing: true, installError: '' }))
  try { await event.prompt(); await event.userChoice; return true }
  catch (e) { pwa.update(s => ({ ...s, installError: `Installation could not open: ${(e as Error).message}` })); requestInstallHelp(); return false }
  finally { pwa.update(s => ({ ...s, installing: false })) }
}

export function startPwa() {
  if (!import.meta.env.PROD || !('serviceWorker' in navigator) || !window.isSecureContext) return () => {}
  stopped = false
  base = new URL(import.meta.env.BASE_URL, document.baseURI)
  const capture = window.__pixeldollInstall
  const syncInstalled = () => pwa.update(s => {
    const installed = capture?.installed === true
    const installable = !installed && !!capture?.prompt
    return { ...s, installed, installable, ...((installed || installable) ? { installError: '' } : {}) }
  })
  const wake = () => { if (document.visibilityState === 'visible') void checkForUpdate() }
  const onController = () => { void inspectWorker().catch(e => pwa.update(s => ({ ...s, error: (e as Error).message }))) }
  const watch = () => {
    const worker = registration?.installing
    worker?.addEventListener('statechange', () => {
      if (worker.state === 'installed' || worker.state === 'activated') onController()
      if (worker.state === 'redundant') pwa.update(s => ({ ...s, error: 'The update could not be saved. Your current work is unchanged. Retrying automatically. If this continues while connected, finish your work, then close every PixelDoll window and reopen. More device storage may be needed.' }))
    })
  }
  syncInstalled()
  const stopInstall = capture?.subscribe(syncInstalled)
  if (!capture) pwa.update(s => ({ ...s, installError: 'The install controls could not load. Reconnect and reload to try again.' }))
  addEventListener('focus', wake); addEventListener('online', wake); addEventListener('pageshow', wake)
  document.addEventListener('visibilitychange', wake)
  navigator.serviceWorker.addEventListener('controllerchange', onController)
  registerWorker = async () => {
    const script = new URL('sw.js', base)
    const existing = await navigator.serviceWorker.getRegistration(base.href)
    const owned = existing?.scope === base.href && [existing.active, existing.waiting, existing.installing].some(worker => worker?.scriptURL === script.href)
    const r = owned ? existing! : await navigator.serviceWorker.register(script, { scope: base.pathname, updateViaCache: 'none' })
    if (stopped) return
    registration = r; r.addEventListener('updatefound', watch); watch()
  }
  void checkForUpdate()
  const interval = setInterval(wake, 60 * 60_000)
  return () => {
    stopped = true; registerWorker = undefined; clearInterval(interval)
    registration?.removeEventListener('updatefound', watch)
    stopInstall?.()
    removeEventListener('focus', wake); removeEventListener('online', wake); removeEventListener('pageshow', wake)
    document.removeEventListener('visibilitychange', wake)
    navigator.serviceWorker.removeEventListener('controllerchange', onController)
  }
}

/** Both paths verify the same release. Automatic updates additionally recheck their short-lived eligibility. */
export async function applyUpdate(prepare: () => Promise<void>, automatic?: { validate: () => void; beforeReload: () => void }) {
  const target = get(pwa).available
  if (!target || !registration) throw new Error('No update is ready yet.')
  const validate = () => {
    automatic?.validate()
    if (get(pwa).available?.build !== target.build || !get(pwa).ready) throw new Error('The available update changed or is still downloading. Review the current version and try again.')
  }
  validate()
  await prepare()
  validate()
  // Startup discovery just verified this target. Do not enqueue another entire discovery/staging pass while it
  // finishes; that can consume the automatic opportunity. Explicit updates refresh an older notice first.
  if (!automatic) await checkForUpdate()
  validate()
  const worker = registration.waiting ?? registration.active
  if (!worker || readRelease(await workerMessage(worker, 'GET_RELEASE')).build !== target.build) throw new Error('The update changed. Try again.')
  validate()
  const verified = await workerMessage(worker, 'VERIFY', target.build)
  validate()
  if (verified.ready !== true) throw new Error('The update is incomplete. Reconnect and try again.')
  await prepare()
  validate()
  if (worker === registration.waiting) {
    await workerMessage(worker, 'ACTIVATE', target.build)
    validate()
    await waitForWorker(worker, () => worker.state === 'activated', 'The update could not activate. Try again.')
    validate()
  }
  const controller = navigator.serviceWorker.controller
  // First-time/uncontrolled tabs use the active worker on their next navigation.
  const active = controller ?? registration.active
  if (!active || readRelease(await workerMessage(active, 'GET_RELEASE')).build !== target.build) throw new Error('Another version activated. Review the update and try again.')
  validate()
  await prepare()
  validate()
  automatic?.beforeReload()
  location.reload()
}
