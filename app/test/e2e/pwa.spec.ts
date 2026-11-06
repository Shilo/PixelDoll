import { test, expect, type Page } from '@playwright/test'
import { enterStudio, equipmentMode } from './immersive-helpers.ts'
import { pwaServer, testRelease, type TestRelease } from './pwa-test-server.ts'

test.beforeEach(async ({ context }) => {
  await context.addInitScript(() => { localStorage.setItem('pixeldoll.agentKey', 'off'); localStorage.setItem('pixeldoll.welcomed', '1') })
  await context.route('https://*.pixellab.ai/**', route => route.abort())
})

async function controllerBuild(page: Page) {
  return page.evaluate(async () => {
    const worker = navigator.serviceWorker.controller
    if (!worker) return null
    return new Promise<string | null>(resolve => {
      const channel = new MessageChannel()
      const timer = setTimeout(() => { channel.port1.close(); resolve(null) }, 3_000)
      channel.port1.onmessage = event => { clearTimeout(timer); channel.port1.close(); resolve(event.data.build) }
      worker.postMessage({ type: 'GET_RELEASE' }, [channel.port2])
    })
  })
}

async function openInstalled(page: Page, url: string, release: TestRelease) {
  await page.goto(url)
  await expect(page.locator('.customize-action')).toBeVisible({ timeout: 20_000 })
  await expect.poll(() => page.evaluate(async () => (await navigator.serviceWorker.getRegistration())?.active?.state)).toBe('activated')
  await page.reload()
  await expect(page.locator('.customize-action')).toBeVisible()
  await expect.poll(() => controllerBuild(page)).toBe(release.release.build)
  await expectLoadedBuild(page, release)
}

async function expectLoadedBuild(page: Page, release: TestRelease) {
  await expect(page.locator('script[type="module"]').first()).toHaveAttribute('src', new RegExp(release.release.build))
}

async function discover(page: Page, release: TestRelease) {
  // These cases exercise updates after the user starts using the app. Fresh-load automation has its own suite.
  await page.keyboard.press('Shift')
  // Wake the production automatic checker rather than importing a test-only API or sleeping for its interval.
  await page.bringToFront()
  await page.evaluate(() => window.dispatchEvent(new Event('online')))
  const action = page.getByRole('button', { name: new RegExp(`^Update to v${release.release.version.replaceAll('.', '\\.')}`) }).first()
  await expect(action).toBeVisible({ timeout: 20_000 })
  await expect(action).toBeEnabled({ timeout: 20_000 })
  await expect.poll(() => page.evaluate(async () => {
    const registration = await navigator.serviceWorker.getRegistration()
    const worker = registration?.waiting ?? registration?.active
    if (!worker) return null
    return new Promise<string | null>(resolve => {
      const channel = new MessageChannel()
      const timer = setTimeout(() => { channel.port1.close(); resolve(null) }, 3_000)
      channel.port1.onmessage = event => { clearTimeout(timer); channel.port1.close(); resolve(event.data.build) }
      worker.postMessage({ type: 'GET_RELEASE' }, [channel.port2])
    })
  }), { timeout: 20_000 }).toBe(release.release.build)
  return action
}

test('installed shell includes valid icons and works offline after a cold navigation, including lazy export', async ({ page, context }) => {
  const release = await testRelease('offline', '8.0.1'), server = await pwaServer(release)
  try {
    await page.addInitScript(() => addEventListener('beforeinstallprompt', event => event.stopImmediatePropagation(), { capture: true }))
    await openInstalled(page, server.url, release)
    const manifest = await page.evaluate(async () => {
      const link = document.querySelector<HTMLLinkElement>('link[rel="manifest"]')!
      return await (await fetch(link.href)).json() as { name: string; display: string; icons: { src: string; sizes: string; purpose?: string }[] }
    })
    expect(manifest.name).toBe('PixelDoll')
    expect(manifest.display).toBe('standalone')
    expect(manifest.icons.some(icon => icon.sizes === '192x192')).toBe(true)
    expect(manifest.icons.some(icon => icon.sizes === '512x512')).toBe(true)
    expect(manifest.icons.some(icon => icon.purpose?.includes('maskable'))).toBe(true)
    const cdp = await context.newCDPSession(page)
    try {
      await cdp.send('Page.enable')
      const parsed = await cdp.send('Page.getAppManifest')
      expect(parsed.errors).toEqual([])
      expect(parsed.manifest.id).toBe(server.url)
      expect(parsed.manifest.startUrl).toBe(server.url)
      expect(parsed.manifest.scope).toBe(server.url)
    } finally { await cdp.detach() }
    for (const icon of manifest.icons) {
      const response = await page.request.get(new URL(icon.src, server.url).href)
      expect(response.ok()).toBe(true)
      if (icon.sizes === 'any') expect(await response.text()).toContain('<svg')
      else expect((await response.body()).subarray(0, 8)).toEqual(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))
    }
    await page.getByRole('button', { name: 'Enter full screen', exact: true }).click()
    await expect.poll(() => page.evaluate(() => !!document.fullscreenElement)).toBe(true)
    await page.getByRole('button', { name: 'Exit full screen', exact: true }).click()
    await expect.poll(() => page.evaluate(() => !!document.fullscreenElement)).toBe(false)
    await page.addInitScript(() => localStorage.setItem('pixeldoll.theme', 'light'))
    await context.setOffline(true)
    await page.reload()
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'light')
    expect(await page.evaluate(() => document.documentElement.style.colorScheme)).toBe('light')
    await enterStudio(page)
    await page.getByRole('button', { name: 'Export', exact: true }).click()
    await expect(page.getByRole('dialog')).toContainText('Export')
    await expect(page.getByRole('dialog').getByRole('radio', { name: 'Unity', exact: true })).toBeVisible()
    await page.getByRole('dialog').getByRole('button', { name: 'Close export', exact: true }).click()
    await page.getByRole('button', { name: 'More options', exact: true }).click()
    await page.locator('#experience-options').getByRole('button', { name: 'Installation help', exact: true }).click()
    await expect(page.getByRole('dialog', { name: 'Installation help', exact: true })).toContainText('App files are ready for offline launches.')
    const cached = await page.evaluate(async () => (await Promise.all((await caches.keys()).map(async key => (await (await caches.open(key)).keys()).map(request => request.url)))).flat())
    expect(cached.length).toBeGreaterThan(20)
    expect(cached.every(url => url.startsWith(locationOrigin(server.url)))).toBe(true)
    expect(cached.some(url => /release\.json|pixellab\.ai|__dev/.test(url))).toBe(false)
  } finally { await context.setOffline(false); await server.close() }
})

function locationOrigin(url: string) { return new URL(url).origin }

test('updates in an already-used tab require an explicit click, preserve its release files, and discover a subsequent release', async ({ page, context }) => {
  const a = await testRelease('a', '8.1.1'), b = await testRelease('b', '8.1.2'), c = await testRelease('c', '8.1.3')
  const server = await pwaServer(a)
  let other: Page | undefined
  try {
    await openInstalled(page, server.url, a)
    other = await context.newPage()
    await other.goto(server.url)
    await expect(other.locator('.customize-action')).toBeVisible()
    await other.getByRole('button', { name: 'New character', exact: true }).click()
    const prompt = other.getByRole('dialog').getByRole('textbox', { name: 'Name', exact: true })
    await prompt.fill('Do not discard this unfinished form')
    await page.evaluate(() => { document.documentElement.dataset.pwaDocument = 'A' })
    server.deploy(b)
    const update = await discover(page, b)
    const blockedUpdate = await discover(other, b)
    await blockedUpdate.click()
    const paused = other.getByRole('dialog', { name: 'Update paused', exact: true })
    await expect(paused).toContainText('Finish and close the open panel before updating.')
    await paused.getByRole('button', { name: 'Close', exact: true }).click()
    await expect(prompt).toHaveValue('Do not discard this unfinished form')
    expect(await page.evaluate(() => document.documentElement.dataset.pwaDocument)).toBe('A')
    expect(await controllerBuild(page)).toBe(a.release.build)
    await expect(other.getByRole('dialog', { name: 'New character', exact: true })).toBeVisible()
    await page.bringToFront()
    await update.click()
    await expect.poll(() => controllerBuild(page)).toBe(b.release.build)
    await expectLoadedBuild(page, b)
    await expect(page.locator('.customize-action')).toBeVisible()
    await expect(prompt).toHaveValue('Do not discard this unfinished form')
    // The other tab now has B's worker but must retain A's exact public and lazy code bytes.
    await expect.poll(() => controllerBuild(other!)).toBe(b.release.build)
    const cdp = await context.newCDPSession(page)
    const versions = new Map<string, { scriptURL: string; status: string; runningStatus: string }>()
    const lifecycle: string[] = []
    cdp.on('ServiceWorker.workerVersionUpdated', event => {
      for (const version of event.versions) {
        versions.set(version.versionId, version)
        if (version.scriptURL === server.url + 'sw.js' && version.status === 'activated') lifecycle.push(version.runningStatus)
      }
    })
    await cdp.send('ServiceWorker.enable')
    const activeVersion = () => [...versions].find(([, version]) => version.scriptURL === server.url + 'sw.js' && version.status === 'activated')?.[0]
    await expect.poll(activeVersion).toBeTruthy()
    lifecycle.length = 0
    await cdp.send('ServiceWorker.stopWorker', { versionId: activeVersion()! })
    // Existing pages can immediately wake the worker again. Observe the transition rather than requiring it to stay idle.
    await expect.poll(() => lifecycle.includes('stopped')).toBe(true)
    const oldPaths = ['assets/', 'fixtures/', 'worlds/'].flatMap(prefix => a.inventory.filter(file => file.path.startsWith(prefix)).slice(0, 2))
    expect(oldPaths).toHaveLength(6)
    await context.setOffline(true)
    for (const file of oldPaths) {
      const hash = await other.evaluate(async url => {
        const response = await fetch(url)
        if (!response.ok) return `HTTP ${response.status}`
        return [...new Uint8Array(await crypto.subtle.digest('SHA-256', await response.arrayBuffer()))].map(byte => byte.toString(16).padStart(2, '0')).join('')
      }, new URL(file.path, server.url).href)
      expect(hash).toBe(file.hash)
    }
    await expect.poll(() => lifecycle.slice(lifecycle.indexOf('stopped') + 1).includes('running')).toBe(true)
    await cdp.detach()
    await context.setOffline(false)
    await other.getByRole('dialog').getByRole('button', { name: 'Cancel', exact: true }).click()
    server.deploy(c)
    const next = await discover(page, c)
    expect(await controllerBuild(page)).toBe(b.release.build)
    await next.click()
    await expect.poll(() => controllerBuild(page)).toBe(c.release.build)
    await expectLoadedBuild(page, c)
    await other.close(); other = undefined
    const d = await testRelease('d', '8.1.4')
    server.deploy(d)
    await (await discover(page, d)).click()
    await expectLoadedBuild(page, d)
    const retained = await page.evaluate(async scope => (await caches.keys()).filter(name => name.startsWith(`pixeldoll-static:${scope}:`)), server.url)
    expect(retained.some(name => name.endsWith(a.release.build))).toBe(false)
    expect(retained.some(name => name.endsWith(b.release.build))).toBe(false)
    expect(retained.some(name => name.endsWith(c.release.build))).toBe(true)
    expect(retained.some(name => name.endsWith(d.release.build))).toBe(true)
  } finally { await context.setOffline(false); await other?.close(); await server.close() }
})

test('update notices expire without hiding the menu action, survive interaction, and do not return on polls or sheet changes', async ({ page }) => {
  const a = await testRelease('notice-a', '8.9.1'), b = await testRelease('notice-b', '8.9.2'), c = await testRelease('notice-c', '8.9.3')
  const d = await testRelease('notice-d', '8.9.4')
  const server = await pwaServer(a)
  try {
    await openInstalled(page, server.url, a)
    await page.clock.install()
    await page.clock.pauseAt(new Date())
    server.deploy(b)
    await discover(page, b)
    const notice = page.getByRole('status').filter({ hasText: 'Update to v8.9.2' })
    await page.clock.fastForward(6000)
    await page.getByRole('button', { name: 'New character', exact: true }).click()
    await expect(page.getByRole('dialog', { name: 'New character', exact: true })).toBeVisible()
    await page.keyboard.press('Escape')
    await page.clock.fastForward(8000)
    await expect(notice).toBeVisible()
    // A metadata refresh must not extend the reading window.
    await page.evaluate(() => dispatchEvent(new Event('online')))
    await expect.poll(() => server.requests.filter(path => path.includes('release.json')).length).toBeGreaterThan(1)
    await page.clock.fastForward(1000)
    await expect(notice).toHaveCount(0)
    await page.getByRole('button', { name: 'More options', exact: true }).click()
    const menu = page.locator('#experience-options')
    const update = menu.getByRole('button', { name: 'Update to v8.9.2', exact: true })
    await expect(update).toBeEnabled()
    await page.keyboard.press('Escape')
    await page.getByRole('button', { name: 'New character', exact: true }).click()
    await expect(page.getByRole('dialog', { name: 'New character', exact: true })).toBeVisible()
    await expect(notice).toHaveCount(0)
    await page.keyboard.press('Escape')
    await expect(notice).toHaveCount(0)
    server.deploy(c)
    await discover(page, c)
    const newer = page.getByRole('status').filter({ hasText: 'Update to v8.9.3' })
    await newer.hover()
    await page.clock.fastForward(20000)
    await expect(newer).toBeVisible()
    await page.mouse.move(0, 0)
    const dismiss = newer.getByRole('button', { name: 'Dismiss notification', exact: true })
    await dismiss.focus()
    await page.clock.fastForward(20000)
    await expect(dismiss).toBeFocused()
    await newer.hover()
    await page.keyboard.press('Enter')
    await expect(newer).toHaveCount(0)
    await page.mouse.move(0, 0)
    await page.evaluate(() => dispatchEvent(new Event('online')))
    await page.getByRole('button', { name: 'More options', exact: true }).click()
    await expect(menu.getByRole('button', { name: 'Update to v8.9.3', exact: true })).toBeEnabled()
    await expect(newer).toHaveCount(0)
    await page.keyboard.press('Escape')
    server.deploy(d)
    await discover(page, d)
    const latest = page.getByRole('status').filter({ hasText: 'Update to v8.9.4' })
    await page.clock.fastForward(15000)
    await expect(latest).toHaveCount(0)
    await page.getByRole('button', { name: 'More options', exact: true }).click()
    await menu.getByRole('button', { name: 'Update to v8.9.4', exact: true }).click()
    await expect.poll(() => controllerBuild(page)).toBe(d.release.build)
    await expectLoadedBuild(page, d)
  } finally { await server.close() }
})

test('an incomplete release is reported without replacing the working offline app, and automatic discovery retries', async ({ page, context }) => {
  const a = await testRelease('complete', '8.2.1'), b = await testRelease('partial', '8.2.2'), server = await pwaServer(a)
  try {
    await openInstalled(page, server.url, a)
    const broken = [...b.files.keys()].find(path => path.startsWith('assets/') && path.endsWith('.js'))!
    server.failures.add(broken)
    server.deploy(b)
    await page.evaluate(() => window.dispatchEvent(new Event('online')))
    await expect(page.getByRole('status').filter({ hasText: 'Update to v8.2.2' })).toBeVisible({ timeout: 20_000 })
    await expect.poll(() => server.requests.some(path => path.split('?')[0]!.endsWith('/' + broken))).toBe(true)
    await expect.poll(() => page.evaluate(async () => (await navigator.serviceWorker.getRegistration())?.installing?.state ?? 'none')).toBe('none')
    expect(await controllerBuild(page)).toBe(a.release.build)
    await context.setOffline(true)
    await page.reload()
    await expect(page.locator('.customize-action')).toBeVisible()
    expect(await controllerBuild(page)).toBe(a.release.build)
    await context.setOffline(false)
    server.failures.delete(broken)
    const update = await discover(page, b)
    const paused = page.getByRole('dialog', { name: 'Update paused', exact: true })
    await expect(async () => {
      if ((await page.locator('script[type="module"]').first().getAttribute('src'))?.includes(b.release.build)) return
      // A cold launch can discover an update before saved work finishes loading. Retry only that documented guard.
      if (await paused.isVisible()) {
        await expect(paused.getByRole('alert')).toHaveText('Wait for your character and saved work to finish loading.')
        await paused.getByRole('button', { name: 'Close', exact: true }).click()
      }
      await update.click()
      await expect.poll(async () => (await paused.isVisible()) || (await page.locator('script[type="module"]').first().getAttribute('src'))?.includes(b.release.build), { timeout: 20_000 }).toBeTruthy()
      if (await paused.isVisible()) {
        await expect(paused.getByRole('alert')).toHaveText('Wait for your character and saved work to finish loading.')
        await paused.getByRole('button', { name: 'Close', exact: true }).click()
        throw new Error('Startup is still guarded; explicitly retry after it settles.')
      }
      await expectLoadedBuild(page, b)
    }).toPass({ timeout: 30_000, intervals: [100, 250, 500] })
    await expect.poll(() => controllerBuild(page)).toBe(b.release.build)
    await expectLoadedBuild(page, b)
  } finally { await context.setOffline(false); await server.close() }
})

test('live responses and update metadata bypass static caches', async ({ page }) => {
  const release = await testRelease('network', '8.3.1'), server = await pwaServer(release)
  try {
    await openInstalled(page, server.url, release)
    const reads = await page.evaluate(async () => {
      const first = await (await fetch('./dynamic.json', { cache: 'no-store' })).json() as { value: number }
      const second = await (await fetch('./dynamic.json', { cache: 'no-store' })).json() as { value: number }
      const cached = (await Promise.all((await caches.keys()).map(async name => (await (await caches.open(name)).keys()).map(request => request.url)))).flat()
      return { first, second, cached }
    })
    expect(reads.second.value).toBe(reads.first.value + 1)
    expect(reads.cached.some(url => /dynamic\.json|release\.json|pixellab\.ai/.test(url))).toBe(false)
    expect(server.requests.filter(path => path.split('?')[0]!.endsWith('/release.json')).length).toBeGreaterThan(0)
  } finally { await server.close() }
})

test('a superseded waiting release shows the current target and only the latest app is loaded', async ({ page }) => {
  const a = await testRelease('supersede-a', '8.4.1'), b = await testRelease('supersede-b', '8.4.2'), c = await testRelease('supersede-c', '8.4.3')
  const server = await pwaServer(a)
  try {
    await openInstalled(page, server.url, a)
    server.deploy(b)
    await discover(page, b)
    await expectLoadedBuild(page, a)
    server.deploy(c)
    const update = await discover(page, c)
    await expect(page.getByRole('status').filter({ hasText: 'Update to v8.4.2' })).toHaveCount(0)
    await expectLoadedBuild(page, a)
    await update.click()
    await expectLoadedBuild(page, c)
    await expect.poll(() => controllerBuild(page)).toBe(c.release.build)
  } finally { await server.close() }
})

test('an unfinished outfit name and failed storage block reload; a saved outfit survives the eventual update', async ({ page }) => {
  const a = await testRelease('save-a', '8.5.1'), b = await testRelease('save-b', '8.5.2'), server = await pwaServer(a)
  try {
    await openInstalled(page, server.url, a)
    await enterStudio(page)
    await equipmentMode(page, 'Outfits')
    await page.getByRole('button', { name: 'Save current look', exact: true }).click()
    const name = page.getByRole('textbox', { name: 'Outfit name', exact: true })
    await name.fill('Survives an app update')
    server.deploy(b)
    const update = await discover(page, b)
    await update.click()
    const paused = page.getByRole('dialog', { name: 'Update paused', exact: true })
    await expect(paused).toContainText('Save or cancel your outfit name before updating.')
    await paused.getByRole('button', { name: 'Close', exact: true }).click()
    await expect(name).toHaveValue('Survives an app update')
    // Simulate a real IndexedDB write exception, not a successful mocked save.
    await page.evaluate(() => {
      const original = IDBObjectStore.prototype.put
      Object.assign(window, { restorePwaPut: () => { IDBObjectStore.prototype.put = original } })
      IDBObjectStore.prototype.put = function(value, key) {
        if (this.name === 'projects') throw new DOMException('PWA test storage is full', 'QuotaExceededError')
        return key === undefined ? original.call(this, value) : original.call(this, value, key)
      }
    })
    await page.locator('.inline-form').getByRole('button', { name: 'Save', exact: true }).click()
    await update.click()
    await expect(paused).toContainText('Your outfit could not be saved.')
    await expectLoadedBuild(page, a)
    await paused.getByRole('button', { name: 'Close', exact: true }).click()
    await page.evaluate(() => { (window as unknown as { restorePwaPut: () => void }).restorePwaPut() })
    await update.click()
    await expectLoadedBuild(page, b)
    await enterStudio(page)
    await equipmentMode(page, 'Outfits')
    await expect(page.getByRole('button', { name: /^Survives an app update/ })).toBeVisible()
  } finally { await server.close() }
})

for (const loading of ['stalled', 'failed'] as const) {
  test(`both update controls recover from ${loading} saved-work loading and preserve the saved outfit`, async ({ page }) => {
    const a = await testRelease('recovery-stalled-a', '9.3.1'), b = await testRelease('recovery-stalled-b', '9.3.2'), server = await pwaServer(a)
    try {
      await openInstalled(page, server.url, a)
      await enterStudio(page)
      await equipmentMode(page, 'Outfits')
      await page.getByRole('button', { name: 'Save current look', exact: true }).click()
      await page.getByRole('textbox', { name: 'Outfit name', exact: true }).fill('Saved before the loading stall')
      await page.locator('.inline-form').getByRole('button', { name: 'Save', exact: true }).click()
      await expect(page.getByRole('button', { name: /^Saved before the loading stall/ })).toBeVisible()
      await page.addInitScript(loading => {
        const original = IDBObjectStore.prototype.getAll
        let projectReads = 0
        IDBObjectStore.prototype.getAll = function(query, count) {
          if (this.name === 'projects' && loading === 'failed' && ++projectReads > 1) {
            throw new DOMException('Saved work read failed', 'UnknownError')
          }
          const result = original.call(this, query, count)
          if (this.name === 'projects' && loading === 'stalled') Object.defineProperty(this.transaction, 'oncomplete', { set: () => {
            document.documentElement.dataset.stalledRead = 'yes'
          } })
          return result
        }
      }, loading)
      await page.reload()
      const reason = loading === 'stalled' ? 'Wait for your character and saved work to finish loading.' : 'PixelDoll could not finish loading your saved work.'
      if (loading === 'stalled') await expect(page.locator('html')).toHaveAttribute('data-stalled-read', 'yes')
      else await expect(page.getByText(reason, { exact: false }).first()).toBeVisible()
      server.deploy(b)
      await (await discover(page, b)).click()
      const paused = page.getByRole('dialog', { name: 'Update paused', exact: true })
      await expect(paused.getByRole('alert')).toHaveText(reason)
      await paused.getByRole('button', { name: 'Close', exact: true }).click()
      await page.getByRole('button', { name: 'More options', exact: true }).click()
      await page.locator('#experience-options').getByRole('button', { name: 'Update to v9.3.2', exact: true }).click()
      await expect(paused.getByRole('alert')).toHaveText(reason)
      const popup = page.waitForEvent('popup')
      await paused.getByRole('link', { name: 'Open update recovery' }).click()
      const recovery = await popup
      await recovery.getByRole('button', { name: 'Update now' }).click()
      await expect(recovery).toHaveURL(server.url, { timeout: 30_000 })
      await expectLoadedBuild(recovery, b)
      await enterStudio(recovery)
      await equipmentMode(recovery, 'Outfits')
      await expect(recovery.getByRole('button', { name: /^Saved before the loading stall/ })).toBeVisible()
      await expectLoadedBuild(page, a)
      await expect(paused).toBeVisible()
    } finally { await server.close() }
  })
}

test('the direct recovery URL works with an older app, refuses an incomplete release, and retries safely', async ({ page, context }) => {
  const a = await testRelease('recovery-legacy-a', '9.4.1', files => { files.delete('update.html') })
  const b = await testRelease('recovery-legacy-b', '9.4.2'), server = await pwaServer(a)
  try {
    await openInstalled(page, server.url, a)
    await page.getByRole('button', { name: 'New character', exact: true }).click()
    const draft = page.getByRole('dialog', { name: 'New character', exact: true }).getByRole('textbox', { name: 'Name', exact: true })
    await draft.fill('Keep this in the old tab')
    server.failures.add('appearance.js'); server.deploy(b)
    const recovery = await context.newPage()
    await recovery.goto(new URL('update.html', server.url).href)
    const update = recovery.getByRole('button', { name: 'Update now' })
    await update.click()
    await expect(recovery.getByRole('status')).toContainText('try again', { timeout: 20_000 })
    await expect(update).toBeEnabled()
    await expectLoadedBuild(page, a)
    await expect(draft).toHaveValue('Keep this in the old tab')
    server.failures.delete('appearance.js')
    await update.click()
    await expect(recovery).toHaveURL(server.url, { timeout: 30_000 })
    await expectLoadedBuild(recovery, b)
    await expect.poll(() => controllerBuild(recovery)).toBe(b.release.build)
    await expectLoadedBuild(page, a)
    await expect(draft).toHaveValue('Keep this in the old tab')
    await context.setOffline(true)
    await recovery.reload()
    await expectLoadedBuild(recovery, b)
  } finally { await context.setOffline(false); await server.close() }
})

test('direct recovery can install a release in a browser without a worker', async ({ page }) => {
  const release = await testRelease('recovery-fresh', '9.5.1'), server = await pwaServer(release)
  try {
    await page.goto(new URL('update.html', server.url).href)
    await page.getByRole('button', { name: 'Update now' }).click()
    await expect(page).toHaveURL(server.url, { timeout: 30_000 })
    await expectLoadedBuild(page, release)
    await expect(page.locator('.customize-action')).toBeVisible()
    await expect.poll(() => controllerBuild(page)).toBe(release.release.build)
  } finally { await server.close() }
})

test('direct recovery replaces an old worker that cannot answer update status requests', async ({ page, context }) => {
  const a = await testRelease('recovery-unresponsive-a', '9.6.1'), b = await testRelease('recovery-unresponsive-b', '9.6.2')
  const oldWorker = a.files.get('sw.js')!.toString()
  const unsupported = oldWorker.replace("if (message?.type === 'GET_RELEASE') port.postMessage(RELEASE);", "if (message?.type === 'GET_RELEASE') throw new Error('Update status is unavailable');")
  expect(unsupported).not.toBe(oldWorker)
  a.files.set('sw.js', Buffer.from(unsupported))
  const server = await pwaServer(a)
  try {
    await page.goto(server.url)
    await expect.poll(() => page.evaluate(async () => (await navigator.serviceWorker.getRegistration())?.active?.state)).toBe('activated')
    await page.reload()
    await expectLoadedBuild(page, a)
    await expect(page.locator('.customize-action')).toBeVisible()
    await page.keyboard.press('Shift')
    server.deploy(b)
    const recovery = await context.newPage()
    await recovery.goto(new URL('update.html', server.url).href)
    await recovery.getByRole('button', { name: 'Update now' }).click()
    await expect(recovery).toHaveURL(server.url, { timeout: 30_000 })
    await expectLoadedBuild(recovery, b)
    await expectLoadedBuild(page, a)
  } finally { await server.close() }
})

test('install help traps studio shortcuts and leaves the current view unchanged', async ({ page }) => {
  const release = await testRelease('keyboard', '8.6.1'), server = await pwaServer(release)
  try {
    // Browsers without a native install event still need the ordinary manual instructions.
    await page.addInitScript(() => addEventListener('beforeinstallprompt', event => event.stopImmediatePropagation(), { capture: true }))
    await openInstalled(page, server.url, release)
    await enterStudio(page)
    await page.getByRole('button', { name: 'More options', exact: true }).click()
    await page.locator('#experience-options').getByRole('button', { name: 'Installation help', exact: true }).click()
    const dialog = page.getByRole('dialog', { name: 'Installation help', exact: true })
    await expect(dialog).toBeVisible()
    await page.keyboard.press('Backspace')
    await expect(dialog).toBeVisible()
    await expect(page.locator('.experience-stage')).toBeVisible()
    await page.keyboard.press('Escape')
    await expect(dialog).not.toBeVisible()
    await expect(page.locator('.experience-stage')).toBeVisible()
    await expectLoadedBuild(page, release)
  } finally { await server.close() }
})

test('a missing current static cache is repaired online without clearing saved browser data', async ({ page, context }) => {
  const release = await testRelease('repair', '8.7.1'), server = await pwaServer(release)
  try {
    await page.addInitScript(() => addEventListener('beforeinstallprompt', event => event.stopImmediatePropagation(), { capture: true }))
    await openInstalled(page, server.url, release)
    await context.setOffline(true)
    await page.evaluate(async build => {
      localStorage.setItem('pwa-test-retained-data', 'keep')
      const key = (await caches.keys()).find(name => name.endsWith(build))!
      await caches.delete(key)
      window.dispatchEvent(new Event('online'))
    }, release.release.build)
    await page.getByRole('button', { name: 'More options', exact: true }).click()
    await page.locator('#experience-options').getByRole('button', { name: 'Installation help', exact: true }).click()
    const help = page.getByRole('dialog', { name: 'Installation help', exact: true })
    await expect(help).toContainText('Offline files are not ready yet.')
    await context.setOffline(false)
    await page.evaluate(() => dispatchEvent(new Event('online')))
    await expect(help).toContainText('App files are ready for offline launches.', { timeout: 30_000 })
    await help.getByRole('button', { name: 'Close', exact: true }).click()
    await expect.poll(() => page.evaluate(async urls => (await Promise.all(urls.map(url => caches.match(url)))).every(Boolean), release.inventory.map(file => new URL(file.path, server.url).href)), { timeout: 30_000 }).toBe(true)
    await context.setOffline(true)
    await page.reload()
    await expect(page.locator('.customize-action')).toBeVisible()
    expect(await page.evaluate(() => localStorage.getItem('pwa-test-retained-data'))).toBe('keep')
    await expectLoadedBuild(page, release)
  } finally { await context.setOffline(false); await server.close() }
})

test('an initial worker registration failure recovers on reconnect without reloading the open app', async ({ page }) => {
  const release = await testRelease('register', '8.8.1'), server = await pwaServer(release)
  try {
    await page.addInitScript(() => addEventListener('beforeinstallprompt', event => event.stopImmediatePropagation(), { capture: true }))
    server.failures.add('sw.js')
    await page.goto(server.url)
    await expect(page.locator('.customize-action')).toBeVisible({ timeout: 20_000 })
    await expect.poll(() => server.requests.some(path => path.split('?')[0]!.endsWith('/sw.js'))).toBe(true)
    await page.getByRole('button', { name: 'More options', exact: true }).click()
    await page.locator('#experience-options').getByRole('button', { name: 'Installation help', exact: true }).click()
    const help = page.getByRole('dialog', { name: 'Installation help', exact: true })
    await expect(help).toContainText('Checks resume automatically when connected.')
    await help.getByRole('button', { name: 'Close', exact: true }).click()
    await page.evaluate(() => { document.documentElement.dataset.pwaDocument = 'unreloaded' })
    server.failures.delete('sw.js')
    await page.evaluate(() => window.dispatchEvent(new Event('online')))
    await expect.poll(() => page.evaluate(async () => (await navigator.serviceWorker.getRegistration())?.active?.state), { timeout: 20_000 }).toBe('activated')
    expect(await page.evaluate(() => document.documentElement.dataset.pwaDocument)).toBe('unreloaded')
    await page.reload()
    await expectLoadedBuild(page, release)
    await expect.poll(() => controllerBuild(page)).toBe(release.release.build)
  } finally { await server.close() }
})

test('accepting an install prompt does not report installation until the browser confirms it', async ({ page }) => {
  const release = await testRelease('install', '8.9.1'), server = await pwaServer(release)
  try {
    await page.addInitScript(() => addEventListener('beforeinstallprompt', event => { if (event.isTrusted) event.stopImmediatePropagation() }, { capture: true }))
    await openInstalled(page, server.url, release)
    await page.evaluate(() => {
      const event = new Event('beforeinstallprompt', { cancelable: true })
      Object.assign(event, { prompt: async () => { document.documentElement.dataset.pwaPrompted = 'yes' }, userChoice: Promise.resolve({ outcome: 'accepted' }) })
      dispatchEvent(event)
    })
    await page.getByRole('button', { name: 'More options', exact: true }).click()
    const install = page.locator('#experience-options').getByRole('button', { name: 'Install PixelDoll', exact: true })
    await install.click()
    await expect(page.locator('html')).toHaveAttribute('data-pwa-prompted', 'yes')
    // The native event is single-use; its disappearance does not establish that installation completed.
    await expect(install).toHaveCount(0)
    const help = page.locator('#experience-options').getByRole('button', { name: 'Installation help', exact: true })
    await expect(help).toBeVisible()
    await page.evaluate(() => dispatchEvent(new Event('appinstalled')))
    await expect(install).toHaveCount(0)
    await expect(help).toHaveCount(0)
    // A new native offer is evidence that reinstalling is available, including after uninstall in this open window.
    await page.evaluate(() => {
      const event = new Event('beforeinstallprompt', { cancelable: true })
      Object.assign(event, { prompt: async () => { document.documentElement.dataset.pwaReinstall = 'shown' }, userChoice: Promise.resolve({ outcome: 'dismissed' }) })
      dispatchEvent(event)
    })
    await expect(install).toBeVisible()
    await install.click()
    await expect(page.locator('html')).toHaveAttribute('data-pwa-reinstall', 'shown')
    await expect(install).toHaveCount(0)
    await expect(help).toBeVisible()
    await expectLoadedBuild(page, release)
  } finally { await server.close() }
})

test('an install offer captured before the module app starts remains available for a native prompt', async ({ page }) => {
  const release = await testRelease('install-early', '9.2.1'), server = await pwaServer(release)
  let releaseModules!: () => void, sawModule!: () => void
  const modulesHeld = new Promise<void>(resolve => { releaseModules = resolve })
  const moduleRequested = new Promise<void>(resolve => { sawModule = resolve })
  try {
    await page.addInitScript(() => addEventListener('beforeinstallprompt', event => { if (event.isTrusted) event.stopImmediatePropagation() }, { capture: true }))
    await page.route('**/assets/**', async route => {
      if (route.request().resourceType() === 'script') { sawModule(); await modulesHeld }
      await route.continue()
    })
    const navigation = page.goto(server.url, { waitUntil: 'domcontentloaded' })
    await moduleRequested
    await expect.poll(() => page.evaluate(() => !!window.__pixeldollInstall)).toBe(true)
    await expect(page.locator('#app')).toBeEmpty()
    const captured = await page.evaluate(() => {
      const event = new Event('beforeinstallprompt', { cancelable: true })
      Object.assign(event, { prompt: async () => { document.documentElement.dataset.pwaEarlyPrompt = 'shown' }, userChoice: Promise.resolve({ outcome: 'dismissed' }) })
      dispatchEvent(event)
      return event.defaultPrevented && window.__pixeldollInstall?.prompt === event
    })
    expect(captured).toBe(true)
    releaseModules()
    await navigation
    await expect(page.locator('.customize-action')).toBeVisible({ timeout: 20_000 })
    await page.getByRole('button', { name: 'More options', exact: true }).click()
    const menu = page.locator('#experience-options')
    await expect(menu.getByRole('button', { name: 'Installation help', exact: true })).toHaveCount(0)
    await menu.getByRole('button', { name: 'Install PixelDoll', exact: true }).click()
    await expect(page.locator('html')).toHaveAttribute('data-pwa-early-prompt', 'shown')
    await expect(menu.getByRole('button', { name: 'Install PixelDoll', exact: true })).toHaveCount(0)
    await expect(menu.getByRole('button', { name: 'Installation help', exact: true })).toBeVisible()
    await expectLoadedBuild(page, release)
  } finally { releaseModules(); await server.close() }
})

test('installation help upgrades on a late native offer and preserves explicit prompt failure recovery', async ({ page }) => {
  const release = await testRelease('install-late', '9.2.2'), server = await pwaServer(release)
  try {
    await page.addInitScript(() => addEventListener('beforeinstallprompt', event => { if (event.isTrusted) event.stopImmediatePropagation() }, { capture: true }))
    await openInstalled(page, server.url, release)
    await page.getByRole('button', { name: 'More options', exact: true }).click()
    const menu = page.locator('#experience-options')
    await expect(menu.getByRole('button', { name: 'Install PixelDoll', exact: true })).toHaveCount(0)
    await menu.getByRole('button', { name: 'Installation help', exact: true }).click()
    const help = page.getByRole('dialog', { name: 'Installation help', exact: true })
    await expect(help).toContainText('A browser install prompt isn’t available in this window.')
    await expect(help.getByRole('button', { name: 'Install PixelDoll', exact: true })).toHaveCount(0)
    await page.evaluate(() => {
      const event = new Event('beforeinstallprompt', { cancelable: true })
      Object.assign(event, { prompt: async () => { throw new Error('Native prompt rejected for this test') }, userChoice: Promise.resolve({ outcome: 'dismissed' }) })
      dispatchEvent(event)
    })
    await help.getByRole('button', { name: 'Install PixelDoll', exact: true }).click()
    await expect(help.getByRole('alert')).toContainText('Native prompt rejected for this test')
    await expect(help).toBeVisible()
    await expect(help.getByRole('button', { name: 'Install PixelDoll', exact: true })).toHaveCount(0)
    await page.evaluate(() => {
      const event = new Event('beforeinstallprompt', { cancelable: true })
      Object.assign(event, { prompt: async () => { document.documentElement.dataset.pwaLatePrompt = 'shown' }, userChoice: Promise.resolve({ outcome: 'dismissed' }) })
      dispatchEvent(event)
    })
    await expect(help.getByRole('alert')).toHaveCount(0)
    await help.getByRole('button', { name: 'Install PixelDoll', exact: true }).click()
    await expect(page.locator('html')).toHaveAttribute('data-pwa-late-prompt', 'shown')
    await expect(help).not.toBeVisible()
    await page.getByRole('button', { name: 'More options', exact: true }).click()
    await expect(menu.getByRole('button', { name: 'Install PixelDoll', exact: true })).toHaveCount(0)
    await expect(menu.getByRole('button', { name: 'Installation help', exact: true })).toBeVisible()
    await expectLoadedBuild(page, release)
  } finally { await server.close() }
})

test('a persisted accepted generation blocks update without repeating or losing its paid request', async ({ page }) => {
  const a = await testRelease('job-a', '9.0.1'), b = await testRelease('job-b', '9.0.2'), server = await pwaServer(a)
  const paid: string[] = []
  page.on('request', request => { if (request.method() === 'POST' && new URL(request.url()).hostname.endsWith('pixellab.ai')) paid.push(new URL(request.url()).pathname) })
  try {
    await openInstalled(page, server.url, a)
    const id = 'pwa-accepted-generation'
    await page.evaluate(async id => {
      const database = await new Promise<IDBDatabase>((resolve, reject) => { const open = indexedDB.open('pixeldoll'); open.onsuccess = () => resolve(open.result); open.onerror = () => reject(open.error) })
      try {
        await new Promise<void>((resolve, reject) => {
          const transaction = database.transaction('jobs', 'readwrite')
          transaction.objectStore('jobs').put({ id, label: 'Accepted PWA guard fixture', method: 'POST', endpoint: '/create-character-v3', params: {}, inputs: [], requestHash: 'a'.repeat(64), state: 'running', playerRequested: true, attempts: 1, nextAt: 0, createdAt: Date.now(), submittedAt: Date.now(), jobs: [{ id: 'already-accepted-job', status: 'processing', done: false, results: [] }], gens: 0, usd: 0 }, id)
          transaction.oncomplete = () => resolve(); transaction.onerror = () => reject(transaction.error)
        })
      } finally { database.close() }
      const channel = new BroadcastChannel('pixeldoll-queue'); channel.postMessage({ rec: id }); channel.close()
    }, id)
    await expect(page.locator('.header-actions').getByRole('button', { name: 'Activity', exact: true })).toBeVisible()
    server.deploy(b)
    await (await discover(page, b)).click()
    await expect(page.getByRole('dialog', { name: 'Update paused', exact: true })).toContainText('Finish or dismiss pending generation work in Activity before updating.')
    await expectLoadedBuild(page, a)
    const retained = await page.evaluate(async id => {
      const database = await new Promise<IDBDatabase>((resolve, reject) => { const open = indexedDB.open('pixeldoll'); open.onsuccess = () => resolve(open.result); open.onerror = () => reject(open.error) })
      try { return await new Promise<{ state: string; jobs: { id: string }[] }>((resolve, reject) => { const read = database.transaction('jobs').objectStore('jobs').get(id); read.onsuccess = () => resolve(read.result); read.onerror = () => reject(read.error) }) }
      finally { database.close() }
    }, id)
    expect(retained.state).toBe('running')
    expect(retained.jobs.map(job => job.id)).toEqual(['already-accepted-job'])
    expect(paid).toEqual([])
  } finally { await server.close() }
})

test('a busy update shields studio shortcuts after Tab leaves its disabled Close button', async ({ page }) => {
  const a = await testRelease('busy-a', '9.1.1'), b = await testRelease('busy-b', '9.1.2'), server = await pwaServer(a)
  try {
    await openInstalled(page, server.url, a)
    await enterStudio(page)
    const item = page.locator('.equipment-scroll .tile').first()
    const before = await item.getAttribute('aria-pressed')
    await item.click()
    const worn = before === 'true' ? 'false' : 'true'
    await expect(item).toHaveAttribute('aria-pressed', worn)
    server.deploy(b)
    const update = await discover(page, b)
    // Hold actual worker metadata I/O so the native busy dialog stays open across keyboard input.
    await page.evaluate(async name => {
      await new Promise<void>((resolve, reject) => {
        void navigator.locks.request(name, () => new Promise<void>(release => {
          Object.assign(window, { releasePwaBusyLock: release })
          resolve()
        })).catch(reject)
      })
    }, `pixeldoll-cache-metadata:${server.url}`)
    await update.click()
    const busy = page.getByRole('dialog', { name: 'Updating PixelDoll', exact: true })
    await expect(busy).toBeVisible()
    await expect(busy.getByRole('button', { name: 'Close', exact: true })).toBeDisabled()
    await page.keyboard.press('Tab')
    expect(await page.evaluate(() => document.activeElement?.tagName)).toBe('BODY')
    await page.keyboard.press('Control+z')
    await expect(item).toHaveAttribute('aria-pressed', worn)
    await page.keyboard.press('Control+Alt+i')
    await expect(page.getByRole('dialog', { name: 'Inspect character', exact: true })).toHaveCount(0)
    await page.keyboard.press('Escape')
    await expect(busy).toBeVisible()
    await expect(page.locator('.experience-stage')).toBeVisible()
    await page.evaluate(() => { (window as unknown as { releasePwaBusyLock: () => void }).releasePwaBusyLock() })
    await expectLoadedBuild(page, b)
    await expect.poll(() => controllerBuild(page)).toBe(b.release.build)
  } finally {
    if (!page.isClosed()) await page.evaluate(() => { (window as unknown as { releasePwaBusyLock?: () => void }).releasePwaBusyLock?.() })
    await server.close()
  }
})
