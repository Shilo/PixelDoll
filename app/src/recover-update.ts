import { bounded, fetchRelease, readRelease, waitForWorker, workerMessage } from './lib/pwa-release.ts'

const button = document.querySelector('button')!
const status = document.querySelector<HTMLElement>('[role="status"]')!
const base = new URL('./', location.href)

/** This page can update a release even when Studio in another tab never finished starting. */
async function recoverUpdate() {
  const target = await fetchRelease(base)
  status.textContent = `Preparing v${target.version}…`
  const script = new URL('sw.js', base)
  const existing = await bounded(navigator.serviceWorker.getRegistration(base.href), 'The browser did not respond. Try again.')
  const registration = existing?.scope === base.href ? existing : await bounded(
    navigator.serviceWorker.register(script, { scope: base.pathname, updateViaCache: 'none' }), 'Offline setup did not respond. Try again.')
  const preferred = () => registration.waiting ?? registration.active
  const matches = async (worker?: ServiceWorker | null) => worker?.scriptURL === script.href
    && readRelease(await workerMessage(worker, 'GET_RELEASE')).build === target.build
  // Ask the browser for the new worker before consulting an old worker that may no longer answer messages.
  if (!registration.installing) {
    try { await bounded(registration.update(), 'The browser update check did not respond. Try again.') }
    catch (error) { if (!await matches(preferred())) throw error }
  }
  const installing = registration.installing
  if (installing) await waitForWorker(installing, () => installing.state !== 'installing', 'The update is still downloading. Try again.')
  const worker = preferred()
  if (!worker || !await matches(worker) || worker !== preferred()) throw new Error('The available version changed. Try again.')

  // ACTIVATE verifies the complete release in the worker before asking the browser to switch versions.
  const reply = await workerMessage(worker, worker === registration.waiting ? 'ACTIVATE' : 'VERIFY', target.build)
  if (reply.ready !== true || readRelease(reply).build !== target.build) throw new Error('The update could not be verified. Try again.')
  await waitForWorker(worker, () => worker.state === 'activated', 'The update could not activate. Try again.')
  if (registration.active !== worker) throw new Error('The available version changed. Try again.')
  location.replace(base.href)
}

if ('serviceWorker' in navigator) {
  button.disabled = false
  button.addEventListener('click', async () => {
    button.disabled = true
    status.textContent = 'Checking for the latest version…'
    try { await recoverUpdate() }
    catch (error) {
      status.textContent = `${error instanceof Error ? error.message : 'The update failed.'} Check your connection and try again.`
      button.disabled = false
    }
  })
} else status.textContent = 'This browser cannot install PixelDoll updates. Open PixelDoll in a supported browser.'
