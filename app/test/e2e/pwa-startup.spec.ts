import { createHash } from 'node:crypto'
import { expect, test, type Page } from '@playwright/test'
import { STARTUP_AUTO_UPDATE_MS } from '../../src/lib/startup-update.ts'
import { pwaServer, testRelease, type TestRelease } from './pwa-test-server.ts'

const changedPublic = ['appearance.js', 'icons/exports/godot.svg', 'fixtures/s2/layers/head/helmet_steel/main/walk.png', 'worlds/obsidian-stage.png']

function changedRelease(label: string, version: string) {
  return testRelease(label, version, files => {
    files.set('appearance.js', Buffer.concat([files.get('appearance.js')!, Buffer.from('\ndocument.documentElement.dataset.startupArtworkRelease = "B";\n')]))
    files.set('icons/exports/godot.svg', Buffer.from(files.get('icons/exports/godot.svg')!.toString().replaceAll('currentColor', '#ff65a3')))
    files.set('fixtures/s2/layers/head/helmet_steel/main/walk.png', files.get('fixtures/s2/layers/head/hat_wizard/main/walk.png')!)
    files.set('worlds/obsidian-stage.png', files.get('worlds/porcelain-stage.png')!)
    const css = [...files.keys()].find(path => path.startsWith('assets/') && path.endsWith('.css'))!
    files.set(css, Buffer.concat([files.get(css)!, Buffer.from('\n.pwa-byte-refresh-test { --release: "B"; }\n')]))
  })
}

test.beforeEach(async ({ context }) => {
  await context.addInitScript(() => { localStorage.setItem('pixeldoll.agentKey', 'off'); localStorage.setItem('pixeldoll.welcomed', '1') })
  await context.route('https://*.pixellab.ai/**', route => route.abort())
})

async function workerBuild(page: Page, slot: 'active' | 'waiting') {
  return page.evaluate(async slot => {
    const worker = (await navigator.serviceWorker.getRegistration())?.[slot]
    if (!worker) return null
    return await new Promise<string | null>(resolve => {
      const channel = new MessageChannel()
      const timer = setTimeout(() => { channel.port1.close(); resolve(null) }, 3_000)
      channel.port1.onmessage = ({ data }) => { clearTimeout(timer); channel.port1.close(); resolve(data.build) }
      worker.postMessage({ type: 'GET_RELEASE' }, [channel.port2])
    })
  }, slot)
}

async function loadedBuild(page: Page, release: TestRelease) {
  try {
    await expect(page.locator('script[type="module"]').first()).toHaveAttribute('src', new RegExp(release.release.build))
  } catch (error) {
    // Preserve the failed assertion and capture only lifecycle metadata, never fields, storage, or credentials.
    const diagnostic = await page.evaluate(() => ({
      events: (window as unknown as { startupTestEvents?: unknown[] }).startupTestEvents,
      focused: document.hasFocus(), visible: document.visibilityState, activeTag: document.activeElement?.tagName,
    }))
    await test.info().attach('startup-lifecycle', { body: JSON.stringify(diagnostic), contentType: 'application/json' })
    throw error
  }
}

async function cachedApp(page: Page, url: string, release: TestRelease) {
  await page.bringToFront()
  await page.goto(url)
  await expect(page.locator('.customize-action')).toBeVisible({ timeout: 20_000 })
  // Finish the owner's character load before opening another document. Its last-project write would otherwise
  // correctly cancel the fresh document's startup update through the cross-tab storage guard.
  await expect(page.locator('.customize-action')).toBeEnabled({ timeout: 20_000 })
  await expect.poll(() => workerBuild(page, 'active')).toBe(release.release.build)
  await page.reload()
  await expect(page.locator('.customize-action')).toBeVisible()
  await expect(page.locator('.customize-action')).toBeEnabled({ timeout: 20_000 })
  await loadedBuild(page, release)
  // This owner represents an already-used tab. Only the separately opened document may update itself automatically.
  await page.keyboard.press('Shift')
}

async function stage(owner: Page, server: Awaited<ReturnType<typeof pwaServer>>, release: TestRelease) {
  server.deploy(release)
  await owner.evaluate(() => dispatchEvent(new Event('online')))
  await expect.poll(() => workerBuild(owner, 'waiting'), { timeout: 20_000 }).toBe(release.release.build)
}

async function verifyFiles(page: Page, release: TestRelease, inventory = release.inventory) {
  const actual = await page.evaluate(async ({ base, inventory }) => await Promise.all(inventory.map(async file => {
    const response = await fetch(new URL(file.path, base))
    if (!response.ok) return `${file.path}: HTTP ${response.status}`
    return [...new Uint8Array(await crypto.subtle.digest('SHA-256', await response.arrayBuffer()))].map(byte => byte.toString(16).padStart(2, '0')).join('')
  })), { base: page.url(), inventory })
  expect(actual).toEqual(inventory.map(file => file.hash))
}

async function waitPastOpportunity(page: Page) {
  // Expire the wall-clock guard without expiring the toast or the pending worker RPC's own timer.
  const now = await page.evaluate(() => Date.now())
  await page.clock.setSystemTime(now + STARTUP_AUTO_UPDATE_MS + 1)
}

async function pauseDownloadClock(page: Page) {
  // Positive cases verify update/navigation behavior independently of shared-worker CPU speed.
  // Real-time expiry and late activation have separate cases; a slow machine legitimately keeps the old page open.
  await page.clock.install({ time: new Date('2026-11-03T12:00:00Z') })
  await page.clock.pauseAt(new Date('2026-11-03T12:00:01Z'))
  await page.addInitScript(() => {
    const events: unknown[] = []
    Object.assign(window, { startupTestEvents: events })
    for (const type of ['focus', 'blur', 'visibilitychange', 'pageshow', 'pagehide', 'popstate', 'hashchange', 'storage', 'pointerdown', 'click', 'keydown', 'beforeinput', 'input', 'compositionstart', 'paste', 'drop', 'wheel', 'touchstart']) {
      addEventListener(type, event => {
        if (events.length < 128) events.push({ type, trusted: event.isTrusted, targetIsWindow: event.target === window,
          targetTag: event.target instanceof Element ? event.target.tagName : '', focused: document.hasFocus(), visible: document.visibilityState, at: event.timeStamp })
      }, { capture: true, passive: true })
    }
    // Playwright's clock replaces performance.getEntriesByType with an empty list. This fixture knows it is
    // opening a fresh foreground navigation; restore that evidence without weakening the production guard.
    const original = performance.getEntriesByType.bind(performance)
    Object.defineProperty(performance, 'getEntriesByType', {
      configurable: true,
      value: (type: string) => type === 'navigation'
        ? [{ name: location.href, entryType: 'navigation', type: 'navigate', startTime: 0, duration: 0, toJSON: () => ({ type: 'navigate' }) }]
        : original(type),
    })
    Object.assign(window, { startupTestNavigationCaptured: performance.getEntriesByType('navigation').length === 1 })
  })
}

async function expectControlledNavigation(page: Page) {
  expect(await page.evaluate(() => (window as unknown as { startupTestNavigationCaptured: boolean }).startupTestNavigationCaptured)).toBe(true)
  expect(await page.evaluate(() => (performance.getEntriesByType('navigation')[0] as PerformanceNavigationTiming | undefined)?.type)).toBe('navigate')
}

test('a fresh launch survives programmatic focus changes and updates every changed asset while the existing tab keeps its work', async ({ page, context }) => {
  const a = await testRelease('startup-fast-a', '11.0.1'), b = await changedRelease('startup-fast-b', '11.0.2')
  const server = await pwaServer(a)
  let fresh: Page | undefined, held: ReturnType<typeof server.hold> | undefined
  try {
    await cachedApp(page, server.url, a)
    await page.getByRole('button', { name: 'New character', exact: true }).click()
    const draft = page.getByRole('dialog', { name: 'New character', exact: true }).getByRole('textbox', { name: 'Name', exact: true })
    await draft.fill('Keep the original tab and this draft')
    await page.evaluate(() => { document.documentElement.dataset.startupDocument = 'existing-A' })
    await stage(page, server, b)
    for (const path of changedPublic) expect(createHash('sha256').update(a.files.get(path)!).digest('hex')).not.toBe(createHash('sha256').update(b.files.get(path)!).digest('hex'))

    held = server.hold('release.json')
    fresh = await context.newPage(); await fresh.bringToFront()
    await pauseDownloadClock(fresh)
    await fresh.goto(server.url)
    await expectControlledNavigation(fresh)
    await expect(fresh.locator('.customize-action')).toBeVisible()
    await held.requested
    const focusTransfer = await fresh.evaluate(() => {
      const previous = document.activeElement, button = document.createElement('button')
      let trustedElementBlur = false
      button.addEventListener('blur', event => { trustedElementBlur = event.isTrusted && event.target === button })
      document.body.append(button); button.focus()
      if (previous instanceof HTMLElement) previous.focus()
      button.blur()
      button.remove()
      return { trustedElementBlur, focused: document.hasFocus() }
    })
    expect(focusTransfer).toEqual({ trustedElementBlur: true, focused: true })
    held.release()
    await loadedBuild(fresh, b)
    await fresh.clock.resume()
    await expect(fresh.locator('.customize-action')).toBeVisible()
    await expect(fresh.locator('html')).toHaveAttribute('data-startup-artwork-release', 'B')
    await expect(fresh.getByRole('dialog', { name: 'Updating PixelDoll', exact: true })).toHaveCount(0)
    await loadedBuild(page, a)
    await expect(page.locator('html')).toHaveAttribute('data-startup-document', 'existing-A')
    await expect(draft).toHaveValue('Keep the original tab and this draft')
    await context.setOffline(true)
    await verifyFiles(fresh, b) // Includes code, CSS, icons, both worlds and every demo file, not just a build label.
    await verifyFiles(page, a)
    await fresh.reload()
    await expect(fresh.locator('.customize-action')).toBeVisible()
    await loadedBuild(fresh, b)
  } finally { held?.release(); await context.setOffline(false); await fresh?.close(); await server.close() }
})

test('the first fresh launch discovers and applies a fast new deployment that no older tab has staged', async ({ page, context }) => {
  const a = await testRelease('startup-first-a', '11.6.1'), b = await changedRelease('startup-first-b', '11.6.2'), server = await pwaServer(a)
  let fresh: Page | undefined
  try {
    await cachedApp(page, server.url, a)
    await page.evaluate(() => { document.documentElement.dataset.startupDocument = 'owner-before-deployment' })
    server.deploy(b) // No update request, discovery event, or prepared waiting worker before this navigation.
    fresh = await context.newPage(); await fresh.bringToFront()
    await pauseDownloadClock(fresh)
    await fresh.goto(server.url)
    await expectControlledNavigation(fresh)
    await loadedBuild(fresh, b)
    await fresh.clock.resume()
    await expect(fresh.locator('.customize-action')).toBeVisible()
    await expect(fresh.locator('html')).toHaveAttribute('data-startup-artwork-release', 'B')
    await loadedBuild(page, a)
    await expect(page.locator('html')).toHaveAttribute('data-startup-document', 'owner-before-deployment')
    await expect(fresh.getByRole('dialog', { name: 'Updating PixelDoll', exact: true })).toHaveCount(0)
  } finally { await fresh?.close(); await server.close() }
})

test('reopening the sole cached window discovers a deployment without another tab preparing it', async ({ page, context }) => {
  const a = await testRelease('startup-sole-a', '11.7.1'), b = await changedRelease('startup-sole-b', '11.7.2'), server = await pwaServer(a)
  let fresh: Page | undefined
  try {
    await cachedApp(page, server.url, a)
    await page.close()
    expect(context.pages()).toHaveLength(0)
    server.deploy(b)
    fresh = await context.newPage(); await fresh.bringToFront()
    await pauseDownloadClock(fresh)
    await fresh.goto(server.url)
    await expectControlledNavigation(fresh)
    await loadedBuild(fresh, b)
    await fresh.clock.resume()
    await expect(fresh.locator('.customize-action')).toBeVisible()
    await expect(fresh.locator('html')).toHaveAttribute('data-startup-artwork-release', 'B')
    await expect(fresh.getByRole('dialog', { name: 'Updating PixelDoll', exact: true })).toHaveCount(0)
  } finally { await fresh?.close(); await server.close() }
})

test('saved failed generation does not block either startup or manual updates when Activity is idle', async ({ page }) => {
  const a = await testRelease('startup-halted-a', '11.8.1'), b = await testRelease('startup-halted-b', '11.8.2'), c = await testRelease('startup-halted-c', '11.8.3')
  const server = await pwaServer(a)
  let held: ReturnType<typeof server.hold> | undefined
  try {
    await cachedApp(page, server.url, a)
    const failed = { id: 'studio-create', spec: { name: 'Saved failed character', description: 'Body', seed: 9, size: 48, dirs: 4 }, status: 'failed', error: 'Fixture failure' }
    await page.evaluate(record => new Promise<void>((resolve, reject) => {
      const open = indexedDB.open('pixeldoll')
      open.onerror = () => reject(open.error)
      open.onsuccess = () => {
        const db = open.result, tx = db.transaction('projects', 'readwrite')
        tx.objectStore('projects').put(record, record.id)
        tx.oncomplete = () => { db.close(); resolve() }
        tx.onerror = () => { db.close(); reject(tx.error) }
      }
    }), failed)
    await stage(page, server, b)
    held = server.hold('release.json')
    await pauseDownloadClock(page)
    await page.reload()
    await held.requested
    await loadedBuild(page, a)
    held.release()
    await loadedBuild(page, b)
    await page.clock.resume()
    await page.getByRole('button', { name: 'More options', exact: true }).click()
    await page.locator('#experience-options').getByRole('button', { name: /^Activity/ }).click()
    const activity = page.getByRole('dialog', { name: 'Activity', exact: true })
    await expect(activity).toContainText('Nothing generating.')
    await activity.getByRole('button', { name: 'Done', exact: true }).click()

    await stage(page, server, c)
    const update = page.getByRole('button', { name: /^Update to v11\.8\.3/ }).first()
    await expect(update).toBeEnabled()
    await update.click()
    await loadedBuild(page, c)
    const restored = await page.evaluate(id => new Promise<unknown>((resolve, reject) => {
      const open = indexedDB.open('pixeldoll')
      open.onerror = () => reject(open.error)
      open.onsuccess = () => {
        const db = open.result, request = db.transaction('projects').objectStore('projects').get(id)
        request.onsuccess = () => { db.close(); resolve(request.result) }
        request.onerror = () => { db.close(); reject(request.error) }
      }
    }), failed.id)
    expect(restored).toEqual(failed)
  } finally { held?.release(); await server.close() }
})

test('a download that takes more than two seconds still auto-updates on the first opening', async ({ page, context }) => {
  const a = await testRelease('startup-slow-a', '11.9.1'), b = await changedRelease('startup-slow-b', '11.9.2'), server = await pwaServer(a)
  let held: ReturnType<typeof server.hold> | undefined
  try {
    await cachedApp(page, server.url, a)
    held = server.hold('appearance.js'); server.deploy(b)
    const navigations: string[] = []
    page.on('framenavigated', frame => { if (frame === page.mainFrame()) navigations.push(frame.url()) })
    await page.reload()
    await held.requested
    await expect(page.locator('.customize-action')).toBeEnabled()
    await loadedBuild(page, a)
    const visibleAt = await page.evaluate(() => performance.now())
    await page.waitForFunction(start => performance.now() - start >= 3_000, visibleAt)
    expect(navigations).toEqual([server.url])
    held.release()
    await loadedBuild(page, b)
    expect(navigations).toEqual([server.url, server.url])
    await context.setOffline(true)
    await verifyFiles(page, b)
  } finally { held?.release(); await context.setOffline(false); await server.close() }
})

test('late staging never holds startup and leaves a versioned manual update that refreshes changed bytes offline', async ({ page, context }) => {
  const a = await testRelease('startup-late-a', '11.1.1'), b = await changedRelease('startup-late-b', '11.1.2'), server = await pwaServer(a)
  let held: ReturnType<typeof server.hold> | undefined
  try {
    await cachedApp(page, server.url, a)
    held = server.hold('appearance.js'); server.deploy(b)
    await pauseDownloadClock(page)
    await page.reload()
    await expect(page.locator('.customize-action')).toBeVisible()
    await held.requested
    await loadedBuild(page, a)
    await expect(page.getByRole('dialog', { name: 'Updating PixelDoll', exact: true })).toHaveCount(0)
    await waitPastOpportunity(page)
    held.release()
    const update = page.getByRole('button', { name: /^Update to v11\.1\.2/ }).first()
    await expect(update).toBeEnabled({ timeout: 20_000 })
    await loadedBuild(page, a)
    await update.click()
    await loadedBuild(page, b)
    await page.clock.resume()
    await expect(page.locator('html')).toHaveAttribute('data-startup-artwork-release', 'B')
    await context.setOffline(true)
    await verifyFiles(page, b)
  } finally { held?.release(); await context.setOffline(false); await server.close() }
})

test('trusted interaction during the startup opportunity preserves an unfinished form when the update becomes ready', async ({ page, context }) => {
  const a = await testRelease('startup-intent-a', '11.2.1'), b = await changedRelease('startup-intent-b', '11.2.2'), server = await pwaServer(a)
  let held: ReturnType<typeof server.hold> | undefined, fresh: Page | undefined
  try {
    await cachedApp(page, server.url, a)
    await stage(page, server, b)
    held = server.hold('release.json')
    fresh = await context.newPage(); await fresh.bringToFront()
    await pauseDownloadClock(fresh)
    await fresh.goto(server.url)
    await expect(fresh.locator('.customize-action')).toBeVisible()
    await held.requested
    await fresh.clock.fastForward(4_000)
    await fresh.getByRole('button', { name: 'New character', exact: true }).click()
    const name = fresh.getByRole('dialog', { name: 'New character', exact: true }).getByRole('textbox', { name: 'Name', exact: true })
    await name.fill('Typed before the update was ready')
    held.release()
    await expect(fresh.getByRole('button', { name: /^Update to v11\.2\.2/ }).first()).toBeEnabled({ timeout: 20_000 })
    await loadedBuild(fresh, a)
    await expect(name).toHaveValue('Typed before the update was ready')
    await expect(fresh.getByRole('dialog', { name: 'Updating PixelDoll', exact: true })).toHaveCount(0)
  } finally { held?.release(); await fresh?.close(); await server.close() }
})

test('a real storage change from another tab cancels a ready startup update while the opportunity clock is paused', async ({ page, context }) => {
  const a = await testRelease('startup-storage-a', '11.8.1'), b = await changedRelease('startup-storage-b', '11.8.2'), server = await pwaServer(a)
  let held: ReturnType<typeof server.hold> | undefined, fresh: Page | undefined
  try {
    await cachedApp(page, server.url, a)
    await stage(page, server, b)
    held = server.hold('release.json')
    fresh = await context.newPage(); await fresh.bringToFront()
    await pauseDownloadClock(fresh)
    await fresh.goto(server.url)
    await expectControlledNavigation(fresh)
    await expect(fresh.locator('.customize-action')).toBeVisible()
    await expect(fresh.locator('.customize-action')).toBeEnabled({ timeout: 20_000 })
    await held.requested
    await page.evaluate(() => localStorage.setItem('pixeldoll.startup-storage-test', 'changed'))
    await expect.poll(() => fresh!.evaluate(() => (window as unknown as { startupTestEvents: { type: string; trusted: boolean; targetIsWindow: boolean }[] }).startupTestEvents
      .some(event => event.type === 'storage' && event.trusted && event.targetIsWindow))).toBe(true)
    held.release()
    await expect(fresh.getByRole('button', { name: /^Update to v11\.8\.2/ }).first()).toBeEnabled({ timeout: 20_000 })
    await loadedBuild(fresh, a)
    await expect(fresh.getByRole('dialog', { name: 'Updating PixelDoll', exact: true })).toHaveCount(0)
    await expect.poll(() => workerBuild(fresh!, 'waiting')).toBe(b.release.build)
  } finally { held?.release(); await fresh?.close(); await server.close() }
})

test('an offline cached launch is interactive without waiting for an update check', async ({ page, context }) => {
  const a = await testRelease('startup-offline', '11.3.1'), server = await pwaServer(a)
  try {
    await cachedApp(page, server.url, a)
    await context.setOffline(true)
    await page.reload()
    await expect(page.locator('.customize-action')).toBeVisible()
    await page.getByRole('button', { name: 'New character', exact: true }).click()
    const name = page.getByRole('dialog', { name: 'New character', exact: true }).getByRole('textbox', { name: 'Name', exact: true })
    await name.fill('Offline input remains usable')
    await expect(name).toHaveValue('Offline input remains usable')
    await loadedBuild(page, a)
    await expect(page.getByRole('dialog', { name: 'Updating PixelDoll', exact: true })).toHaveCount(0)
  } finally { await context.setOffline(false); await server.close() }
})

test('an incomplete release cannot trigger a startup reload', async ({ page }) => {
  const a = await testRelease('startup-partial-a', '11.4.1'), b = await changedRelease('startup-partial-b', '11.4.2'), server = await pwaServer(a)
  try {
    await cachedApp(page, server.url, a)
    server.failures.add('appearance.js'); server.deploy(b)
    await page.reload()
    await expect(page.locator('.customize-action')).toBeVisible()
    await expect.poll(() => server.requests.some(path => path.includes('appearance.js?pd-build=' + b.release.build))).toBe(true)
    await expect.poll(() => page.evaluate(async () => (await navigator.serviceWorker.getRegistration())?.installing?.state ?? 'none')).toBe('none')
    await loadedBuild(page, a)
    await page.getByRole('button', { name: 'More options', exact: true }).click()
    await expect(page.locator('#experience-options').getByRole('button', { name: 'Update to v11.4.2', exact: true })).toBeDisabled()
    await expect(page.getByRole('dialog', { name: 'Updating PixelDoll', exact: true })).toHaveCount(0)
  } finally { await server.close() }
})

test('activation completing after the startup deadline leaves the current document open', async ({ page, context }) => {
  const a = await testRelease('startup-activate-a', '11.5.1'), b = await changedRelease('startup-activate-b', '11.5.2'), server = await pwaServer(a)
  let fresh: Page | undefined
  try {
    await cachedApp(page, server.url, a); await stage(page, server, b)
    fresh = await context.newPage()
    await pauseDownloadClock(fresh)
    await fresh.addInitScript(() => {
      const original = ServiceWorker.prototype.postMessage
      ServiceWorker.prototype.postMessage = function(message: unknown, transfer?: Transferable[] | StructuredSerializeOptions) {
        const ports = Array.isArray(transfer) ? transfer : transfer?.transfer
        const recipient = ports?.[0]
        if ((message as { type?: string })?.type !== 'ACTIVATE' || !(recipient instanceof MessagePort)) return original.call(this, message, { transfer: ports })
        const channel = new MessageChannel()
        channel.port1.onmessage = ({ data }) => {
          document.documentElement.dataset.startupActivationHeld = 'yes'
          Object.assign(window, { releaseStartupActivation: () => { recipient.postMessage(data); channel.port1.close() } })
        }
        original.call(this, message, { transfer: [channel.port2] })
      }
    })
    await fresh.bringToFront(); await fresh.goto(server.url)
    await expect(fresh.locator('html')).toHaveAttribute('data-startup-activation-held', 'yes')
    await waitPastOpportunity(fresh)
    await fresh.evaluate(() => { (window as unknown as { releaseStartupActivation: () => void }).releaseStartupActivation() })
    await expect.poll(() => workerBuild(fresh!, 'active')).toBe(b.release.build)
    await loadedBuild(fresh, a)
    await expect(fresh.getByRole('button', { name: /^Update to v11\.5\.2/ }).first()).toBeEnabled()
    await expect(fresh.getByRole('dialog', { name: 'Updating PixelDoll', exact: true })).toHaveCount(0)
  } finally { await fresh?.close(); await server.close() }
})
