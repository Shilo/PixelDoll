import { enterStudio, noDisabledHover, openStudio } from './immersive-helpers.ts'
import { chromium, expect, test, type Page } from '@playwright/test'
import { readFile } from 'node:fs/promises'
import { unzip } from '../../src/lib/store/zip.ts'
import { decodePngBytes } from '../../src/lib/image/pngraw.ts'
import { EXPORT_SETTINGS_KEY } from '../../src/lib/store/export-settings.ts'

async function savedExport(page: Page, dev: string) {
  await page.setViewportSize({ width: 800, height: 600 }) // Eight parallel settings runs do not need eight full-size animated worlds.
  await page.addInitScript(() => { localStorage.setItem('pixeldoll.agentKey', 'off'); localStorage.setItem('pixeldoll.welcomed', '1') })
  await page.route('https://*.pixellab.ai/**', route => route.abort())
  await openStudio(page, dev)
  await page.evaluate(async () => {
    const statePath = '/src/studio/state.svelte.ts', createPath = '/src/studio/create.ts', rigPath = '/src/lib/rig/rig.ts'
    const state = await import(statePath), { saveCopy } = await import(createPath), { baseHashOf } = await import(rigPath)
    const source = state.store.project, manifest = structuredClone(source.manifest)
    const body = manifest.items.find((item: { id: string }) => item.id === manifest.rig.baseItem)
    // The real demo is covered by the existing export tests. Settings need only two small clips and saved outfits.
    manifest.items = [body]; manifest.slots = manifest.slots.filter((slot: { id: string }) => slot.id === body.slot)
    manifest.materials = manifest.materials.filter((material: { owner: string }) => material.owner === body.id)
    manifest.presets = manifest.presets.map((preset: object) => ({ ...preset, items: { body: body.id }, variants: {} }))
    manifest.rig.directions = [{ id: 'south' }]; delete manifest.rig.rest; delete manifest.rig.anchors
    const hashes: Record<string, string> = {}, used = new Set<string>()
    for (const animation of manifest.rig.animations) {
      animation.cells = 2; animation.loop = true; animation.frames = [{ cell: 0, ms: 100 }, { cell: 1, ms: 100 }]; delete animation.sources
      for (const layer of body.layers) {
        layer.cells[animation.id] = { south: layer.cells[animation.id].south.slice(0, 2) }
        layer.cells[animation.id].south.forEach((hash: string, index: number) => { used.add(hash); hashes[`${animation.id}/south/${index}`] = hash })
      }
    }
    manifest.rig.baseHash = await baseHashOf(manifest.rig, hashes); body.baseHash = manifest.rig.baseHash
    const images = new Map([...source.images].filter(([hash]) => used.has(hash)))
    const id = await saveCopy({ manifest, images }, 'Export settings test')
    await state.refreshProjects(); await state.openProject(id)
  })
  await page.getByRole('button', { name: 'Export', exact: true }).click()
  await expect(page.getByRole('dialog').getByRole('radio', { name: 'Godot', exact: true })).toBeEnabled()
}

async function holdProjectTransaction(page: Page, mode: IDBTransactionMode, target: 'settings' | 'character' = 'settings') {
  await page.evaluate(({ mode, target, key }) => {
    const host = window as unknown as { __studio: { doc: { id: string } }; exportTransaction: { ready: boolean; release: () => void; reject: () => void } }
    const unfinished = () => { throw new Error('Transaction has not finished yet') }
    const hold: { ready: boolean; release: () => void; reject: () => void } = host.exportTransaction = { ready: false, release: unfinished, reject: unfinished }
    const original = IDBObjectStore.prototype.get
    IDBObjectStore.prototype.get = function(query) {
      const request = original.call(this, query)
      if (this.name === 'projects' && query === (target === 'character' ? host.__studio.doc.id : key) && this.transaction.mode === mode) {
        IDBObjectStore.prototype.get = original
        const transaction = this.transaction
        Object.defineProperty(transaction, 'oncomplete', { set(callback: (this: IDBTransaction, event: Event) => void) {
          transaction.addEventListener('complete', event => {
            hold.ready = true
            hold.release = () => callback.call(transaction, event)
            hold.reject = () => {
              Object.defineProperty(transaction, 'error', { value: new DOMException('Synthetic stale read failure', 'UnknownError') })
              transaction.dispatchEvent(new Event('error'))
            }
          }, { once: true })
        } })
      }
      return request
    }
  }, { mode, target, key: EXPORT_SETTINGS_KEY })
}

async function releaseProjectTransaction(page: Page) {
  await page.evaluate(() => (window as unknown as { exportTransaction: { release: () => void } }).exportTransaction.release())
}

test('loading global preferences preserves native focus and permits settings navigation before the read completes', async ({ page }, info) => {
  await savedExport(page, info.config.projects.find(p => p.name === 'browser-selftests')!.use.baseURL!)
  await page.getByRole('button', { name: 'Close export' }).click()
  await holdProjectTransaction(page, 'readonly')
  await page.getByRole('button', { name: 'Export', exact: true }).click()
  const dialog = page.getByRole('dialog')
  await expect.poll(() => page.evaluate(() => (window as unknown as { exportTransaction: { ready: boolean } }).exportTransaction.ready)).toBe(true)
  await expect(dialog.getByRole('button', { name: 'Settings', exact: true })).toBeFocused()
  await expect(dialog.getByRole('radio', { name: 'Godot', exact: true })).toBeDisabled()
  await dialog.getByRole('button', { name: 'Settings', exact: true }).click()
  const back = dialog.getByRole('button', { name: 'Back', exact: true })
  await expect(back).toBeFocused()
  await expect(dialog.getByRole('status')).toHaveText('Loading export settings…')
  const dressed = dialog.getByRole('checkbox', { name: 'Include dressed character sheets', exact: true })
  await expect(dressed).toBeDisabled()
  await releaseProjectTransaction(page)
  await expect(dressed).toBeEnabled(); await expect(back).toBeFocused()
  await expect(dialog.getByRole('status')).toHaveCount(0)
})

test('a committed earlier format and a failed latest format keep the write error visible after refresh', async ({ page }, info) => {
  await savedExport(page, info.config.projects.find(p => p.name === 'browser-selftests')!.use.baseURL!)
  const dialog = page.getByRole('dialog')
  await expect(dialog.getByRole('button', { name: 'Settings', exact: true })).toBeEnabled()
  await holdProjectTransaction(page, 'readwrite')
  await dialog.getByRole('radio', { name: 'Unity', exact: true }).check()
  await expect.poll(() => page.evaluate(() => (window as unknown as { exportTransaction: { ready: boolean } }).exportTransaction.ready)).toBe(true)
  await page.evaluate(key => {
    const original = IDBObjectStore.prototype.put
    IDBObjectStore.prototype.put = function(value, id) {
      if (this.name === 'projects' && id === key) { IDBObjectStore.prototype.put = original; throw new Error('Latest format could not save') }
      return original.call(this, value, id)
    }
    window.dispatchEvent(new Event('focus')) // Queue a refresh while the first completion is held.
  }, EXPORT_SETTINGS_KEY)
  await dialog.getByRole('radio', { name: 'Phaser', exact: true }).check()
  await expect(dialog.getByRole('alert')).toContainText('Latest format could not save')
  await releaseProjectTransaction(page)
  await expect(dialog.getByRole('radio', { name: 'Unity', exact: true })).toBeChecked()
  await expect(dialog.getByRole('button', { name: /^Download ZIP/ })).toBeEnabled()
  await expect(dialog.getByRole('alert')).toContainText('Latest format could not save')
})

test('a stale rejected global refresh cannot block a newer successful format save', async ({ page }, info) => {
  await savedExport(page, info.config.projects.find(p => p.name === 'browser-selftests')!.use.baseURL!)
  const dialog = page.getByRole('dialog')
  await expect(dialog.getByRole('button', { name: 'Settings', exact: true })).toBeEnabled()
  await page.evaluate(() => {
    const original = BroadcastChannel.prototype.postMessage
    BroadcastChannel.prototype.postMessage = function(value) { if (this.name !== 'pixeldoll-export-settings') original.call(this, value) }
  }) // Keep the held read as the latest request; this test isolates its stale rejection guard.
  await holdProjectTransaction(page, 'readonly')
  await page.evaluate(() => window.dispatchEvent(new Event('focus')))
  await expect.poll(() => page.evaluate(() => (window as unknown as { exportTransaction: { ready: boolean } }).exportTransaction.ready)).toBe(true)
  await dialog.getByRole('radio', { name: 'Unity', exact: true }).check()
  await expect(dialog.getByRole('button', { name: 'Settings', exact: true })).toBeEnabled()
  // Release the held transaction as a failed read, after the newer write has committed.
  await page.evaluate(() => (window as unknown as { exportTransaction: { reject: () => void } }).exportTransaction.reject())
  await expect(dialog.getByRole('button', { name: /^Download ZIP/ })).toBeEnabled()
  await expect(dialog.getByRole('radio', { name: 'Unity', exact: true })).toBeChecked()
  await expect(dialog.getByRole('alert')).toHaveCount(0)
})

test('global Export choices survive a browser restart, character changes and dynamic move names', async ({}, info) => {
  const dev = info.config.projects.find(p => p.name === 'browser-selftests')!.use.baseURL!
  const profile = info.outputPath('persistent-export-profile')
  const launch = async () => {
    const context = await chromium.launchPersistentContext(profile, { headless: true, channel: info.project.use.channel, viewport: { width: 800, height: 600 } })
    await context.addInitScript(() => { localStorage.setItem('pixeldoll.agentKey', 'off'); localStorage.setItem('pixeldoll.welcomed', '1') })
    await context.route('https://*.pixellab.ai/**', route => route.abort())
    return context
  }
  let context = await launch()
  try {
    let page = context.pages()[0]
    await savedExport(page, dev)
    let dialog = page.getByRole('dialog')
    await dialog.getByRole('radio', { name: 'Unity', exact: true }).check()
    await dialog.getByRole('button', { name: 'Settings', exact: true }).click()
    await dialog.getByRole('checkbox', { name: 'Walk', exact: true }).check()
    let dressed = dialog.getByRole('checkbox', { name: 'Include dressed character sheets', exact: true })
    await expect(dressed).toBeEnabled(); await dressed.uncheck(); await expect(dressed).toBeEnabled()
    await dialog.getByRole('button', { name: 'Close export' }).click()
    const identities = await page.evaluate(async () => {
      const statePath = '/src/studio/state.svelte.ts', importPath = '/src/lib/store/import.ts'
      const s = await import(statePath), { saveImportedCharacter } = await import(importPath)
      const first = s.doc.id, project = { ...s.store.project, manifest: structuredClone(s.store.project.manifest) }
      project.manifest.rig.animations.forEach((move: { loop: boolean }) => { move.loop = false }) // Imported metadata must not seed global preferences.
      const second = await saveImportedCharacter({ project, extra: {}, warnings: [] }, 'Second character')
      await s.refreshProjects(); await s.openProject(second)
      return { first, second }
    })
    await page.getByRole('button', { name: 'Export', exact: true }).click()
    await expect(dialog.getByRole('radio', { name: 'Unity', exact: true })).toBeChecked()
    await expect(dialog.locator('.export-summary dd')).toHaveText(['Walk', 'None'])
    await dialog.getByRole('radio', { name: 'Phaser', exact: true }).check()
    await dialog.getByRole('button', { name: 'Settings', exact: true }).click()
    await expect(dialog.getByRole('checkbox', { name: 'Walk', exact: true })).toHaveCount(1)
    await expect(dialog.getByRole('checkbox', { name: 'Walk', exact: true })).toBeChecked()
    await expect(dialog.getByRole('checkbox', { name: 'Cross punch', exact: true })).not.toBeChecked()
    await dressed.check(); await expect(dressed).toBeEnabled()
    await dialog.getByRole('button', { name: 'Close export' }).click()
    await page.evaluate(async ids => {
      const statePath = '/src/studio/state.svelte.ts', dbPath = '/src/lib/store/db.ts', rigPath = '/src/lib/rig/rig.ts'
      const s = await import(statePath), db = await import(dbPath), { baseHashOf } = await import(rigPath)
      await s.renameProject('Renamed second character')
      const record = await db.get('projects', ids.first), m = record.manifest
      const walk = m.rig.animations.find((a: { id: string }) => a.id === 'walk')
      walk.id = 'renamed-walk'; walk.frames[0].ms = 80
      m.rig.animations = [walk, { ...structuredClone(walk), id: 'new-move', loop: true }]
      const hashes: Record<string, string> = {}
      for (const layer of m.items[0].layers) {
        const cells = layer.cells.walk
        layer.cells = { 'renamed-walk': cells, 'new-move': structuredClone(cells) }
        for (const id of ['renamed-walk', 'new-move']) layer.cells[id].south.forEach((hash: string, i: number) => { hashes[id + '/south/' + i] = hash })
      }
      m.rig.baseHash = await baseHashOf(m.rig, hashes); m.items[0].baseHash = m.rig.baseHash
      await db.put('projects', ids.first, record); await s.openProject(ids.first)
    }, identities)
    await page.evaluate(() => location.reload()); await enterStudio(page)
    await page.getByRole('button', { name: 'Export', exact: true }).click()
    await expect(dialog.getByRole('radio', { name: 'Phaser', exact: true })).toBeChecked()
    await expect(dialog.locator('.export-summary dd')).toHaveText(['Walk', 'Current look + saved outfits'])
    await dialog.getByRole('button', { name: 'Close export' }).click()
    await context.close() // Close the actual browser process, retaining only its on-disk profile.
    context = await launch(); page = context.pages()[0]; dialog = page.getByRole('dialog')
    await openStudio(page, dev)
    await page.getByRole('button', { name: 'Export', exact: true }).click()
    await expect(dialog.getByRole('radio', { name: 'Phaser', exact: true })).toBeChecked()
    await dialog.getByRole('button', { name: 'Settings', exact: true }).click()
    await expect(dialog.getByRole('checkbox', { name: 'Walk', exact: true })).toBeChecked()
    await expect(dialog.getByRole('checkbox', { name: 'Renamed walk', exact: true })).not.toBeChecked()
    await expect(dialog.getByRole('checkbox', { name: 'New move', exact: true })).not.toBeChecked()
    await expect(dialog.getByRole('checkbox', { name: 'Cross punch', exact: true })).not.toBeChecked()
    await dialog.getByRole('button', { name: 'Back', exact: true }).click()
    const button = dialog.getByRole('button', { name: /^Download ZIP/ }); await expect(button).toBeEnabled()
    const [download] = await Promise.all([page.waitForEvent('download'), button.click()])
    const zip = await unzip(new Uint8Array(await readFile((await download.path())!)))
    const firstExport = JSON.parse(new TextDecoder().decode(zip.get('manifest.json')!))
    expect(firstExport.rig.animations.map((move: { id: string; loop: boolean }) => [move.id, move.loop])).toEqual([['renamed-walk', true], ['new-move', true]])
    await page.evaluate(async second => { const path = '/src/studio/state.svelte.ts', s = await import(path); await s.openProject(second) }, identities.second)
    await page.getByRole('button', { name: 'Export', exact: true }).click()
    await expect(dialog.getByRole('radio', { name: 'Phaser', exact: true })).toBeChecked()
    await expect(button).toBeEnabled()
    const [secondDownload] = await Promise.all([page.waitForEvent('download'), button.click()])
    const secondZip = await unzip(new Uint8Array(await readFile((await secondDownload.path())!)))
    const secondExport = JSON.parse(new TextDecoder().decode(secondZip.get('manifest.json')!))
    expect(secondExport.rig.animations.find((move: { id: string }) => move.id === 'walk').loop).toBe(false)
    expect(secondExport.rig.animations.find((move: { id: string }) => move.id === 'cross-punch').loop).toBe(true)
    expect(await page.evaluate(async ids => {
      const path = '/src/lib/store/db.ts', db = await import(path)
      const [a, b] = await Promise.all([db.get('projects', ids.first), db.get('projects', ids.second)])
      return [a.manifest.rig.animations.map((move: { loop: boolean }) => move.loop), b.manifest.rig.animations.map((move: { loop: boolean }) => move.loop)]
    }, identities)).toEqual([[true, true], [false, false]])
    await expect(page.getByRole('heading', { name: 'Renamed second character', exact: true })).toHaveCount(1)
  } finally { await context.close() }
})

test('global Export choices persist through demo reload, editable copying and character switching', async ({ page }, info) => {
  await page.setViewportSize({ width: 800, height: 600 })
  await page.addInitScript(() => { localStorage.setItem('pixeldoll.agentKey', 'off'); localStorage.setItem('pixeldoll.welcomed', '1') })
  await page.route('https://*.pixellab.ai/**', route => route.abort())
  await openStudio(page, info.config.projects.find(p => p.name === 'browser-selftests')!.use.baseURL!)
  await page.getByRole('button', { name: 'Export', exact: true }).click()
  const dialog = page.getByRole('dialog')
  await dialog.getByRole('radio', { name: 'Phaser', exact: true }).check()
  await dialog.getByRole('button', { name: 'Settings', exact: true }).click()
  await dialog.getByRole('checkbox', { name: 'Walk', exact: true }).check()
  const dressed = dialog.getByRole('checkbox', { name: 'Include dressed character sheets', exact: true })
  await expect(dressed).toBeEnabled(); await dressed.uncheck(); await expect(dressed).toBeEnabled()
  await dialog.getByRole('button', { name: 'Close export' }).click()
  await page.evaluate(() => location.reload()); await enterStudio(page)
  await page.getByRole('button', { name: 'Export', exact: true }).click()
  await expect(dialog.getByRole('radio', { name: 'Phaser', exact: true })).toBeChecked()
  await expect(dialog.locator('.export-summary dd')).toHaveText(['Walk', 'None'])
  await dialog.getByRole('button', { name: 'Close export' }).click()
  const copy = await page.evaluate(async () => {
    const statePath = '/src/studio/state.svelte.ts', createPath = '/src/studio/create.ts'
    const s = await import(statePath), { saveCopy } = await import(createPath), id = await saveCopy(s.store.project, 'Demo copy')
    await s.refreshProjects(); await s.openProject(id)
    return id
  })
  await page.getByRole('button', { name: 'Export', exact: true }).click()
  await expect(dialog.getByRole('radio', { name: 'Phaser', exact: true })).toBeChecked()
  await expect(dialog.locator('.export-summary dd')).toHaveText(['Walk', 'None'])
  await dialog.getByRole('radio', { name: 'Unity', exact: true }).check()
  await expect(dialog.getByRole('button', { name: 'Close export' })).toBeEnabled()
  await dialog.getByRole('button', { name: 'Close export' }).click()
  await page.evaluate(async () => { const path = '/src/studio/state.svelte.ts', s = await import(path); await s.openProject(s.DEMO) })
  const same = await page.evaluate(async () => { const statePath = '/src/studio/state.svelte.ts', createPath = '/src/studio/create.ts'; const s = await import(statePath), { saveCopy } = await import(createPath); return saveCopy(s.store.project, 'Should reopen existing copy') })
  expect(same).toBe(copy)
  await page.evaluate(async id => { const path = '/src/studio/state.svelte.ts', s = await import(path); await s.openProject(id) }, copy)
  await page.getByRole('button', { name: 'Export', exact: true }).click()
  await expect(dialog.getByRole('radio', { name: 'Unity', exact: true })).toBeChecked()
  await dialog.getByRole('button', { name: 'Close export' }).click()
  await page.evaluate(async () => { const path = '/src/studio/state.svelte.ts', s = await import(path); await s.openProject(s.DEMO) })
  await page.getByRole('button', { name: 'Export', exact: true }).click()
  await expect(dialog.getByRole('radio', { name: 'Unity', exact: true })).toBeChecked()
  await expect(dialog.locator('.export-summary dd')).toHaveText(['Walk', 'None'])
})

test('two tabs merge independent Export saves and refresh on reactivation without losing keyboard focus', async ({ page, context }, info) => {
  const dev = info.config.projects.find(p => p.name === 'browser-selftests')!.use.baseURL!
  await context.route('https://*.pixellab.ai/**', route => route.abort())
  await context.addInitScript(() => { localStorage.setItem('pixeldoll.agentKey', 'off'); localStorage.setItem('pixeldoll.welcomed', '1') })
  await savedExport(page, dev)
  const second = await context.newPage()
  await second.setViewportSize({ width: 800, height: 600 }); await openStudio(second, dev)
  await second.getByRole('button', { name: 'Export', exact: true }).click()
  const a = page.getByRole('dialog'), b = second.getByRole('dialog')
  await a.getByRole('radio', { name: 'Unity', exact: true }).check()
  await expect(a.getByRole('button', { name: 'Settings', exact: true })).toBeEnabled()
  await b.getByRole('button', { name: 'Settings', exact: true }).click()
  const dressed = b.getByRole('checkbox', { name: 'Include dressed character sheets', exact: true })
  await dressed.uncheck(); await expect(dressed).toBeEnabled()
  await b.getByRole('button', { name: 'Back', exact: true }).click()
  await expect(b.getByRole('radio', { name: 'Unity', exact: true })).toBeChecked()
  await a.getByRole('button', { name: 'Settings', exact: true }).click()
  const walk = a.getByRole('checkbox', { name: 'Walk', exact: true })
  await walk.focus()
  await page.evaluate(() => window.dispatchEvent(new Event('focus')))
  await expect(a.getByRole('checkbox', { name: 'Include dressed character sheets', exact: true })).not.toBeChecked()
  await expect(walk).toBeFocused()
  await walk.check(); await expect(walk).toBeEnabled()
  await b.getByRole('radio', { name: 'PNG + JSON', exact: true }).check()
  await expect(b.getByRole('button', { name: 'Settings', exact: true })).toBeEnabled()
  await expect(b.locator('.export-summary dd')).toHaveText(['Walk', 'None'])
  const button = b.getByRole('button', { name: /^Download ZIP/ }); await expect(button).toBeEnabled()
  const [download] = await Promise.all([second.waitForEvent('download'), button.click()])
  const zip = await unzip(new Uint8Array(await readFile((await download.path())!)))
  const manifest = JSON.parse(new TextDecoder().decode(zip.get('manifest.json')!))
  expect(manifest.export.engines).toEqual(['generic'])
  expect([...zip.keys()].some(name => name.startsWith('baked/'))).toBe(false)
  expect(manifest.rig.animations.find((move: { id: string }) => move.id === 'walk').loop).toBe(false)
})

test('a same-character reload cannot replace export choices saved after its read started', async ({ page }, info) => {
  await savedExport(page, info.config.projects.find(p => p.name === 'browser-selftests')!.use.baseURL!)
  const dialog = page.getByRole('dialog')
  await dialog.getByRole('button', { name: 'Settings', exact: true }).click()
  for (const kind of ['animation', 'dressed']) {
    await holdProjectTransaction(page, 'readonly', 'character')
    await page.evaluate(async () => {
      const path = '/src/studio/state.svelte.ts', state = await import(path)
      ;(window as unknown as { exportReload: Promise<void> }).exportReload = state.openProject(state.doc.id, { quiet: true })
    })
    await expect.poll(() => page.evaluate(() => (window as unknown as { exportTransaction: { ready: boolean } }).exportTransaction.ready)).toBe(true)
    const input = kind === 'animation' ? dialog.locator('.export-moves input').first() : dialog.getByRole('checkbox', { name: 'Include dressed character sheets', exact: true })
    const wanted = !await input.isChecked()
    await input.setChecked(wanted); await expect(input).toBeEnabled()
    await releaseProjectTransaction(page)
    await page.evaluate(async () => await (window as unknown as { exportReload: Promise<void> }).exportReload)
    if (wanted) await expect(input).toBeChecked(); else await expect(input).not.toBeChecked()
    const saved = await page.evaluate(async kind => {
      const path = '/src/lib/store/export-settings.ts', { readExportSettings } = await import(path)
      const settings = await readExportSettings()
      return kind === 'animation' ? settings.playOnce.includes('cross-punch') : settings.dressedCharacterSheets
    }, kind)
    expect(saved).toBe(wanted)
  }
})

test('pending export settings saves block conflicting actions and restore keyboard focus when complete', async ({ page }, info) => {
  await savedExport(page, info.config.projects.find(p => p.name === 'browser-selftests')!.use.baseURL!)
  const dialog = page.getByRole('dialog')
  await dialog.getByRole('button', { name: 'Settings', exact: true }).click()
  const input = dialog.locator('.export-moves input').first()
  await holdProjectTransaction(page, 'readwrite')
  await input.focus(); await input.press('Space')
  await expect.poll(() => page.evaluate(() => (window as unknown as { exportTransaction: { ready: boolean } }).exportTransaction.ready)).toBe(true)
  await expect(input).toBeDisabled()
  await expect(dialog.getByRole('button', { name: 'Back', exact: true })).toBeDisabled()
  await expect(dialog.getByRole('button', { name: 'Close export' })).toBeDisabled()
  await expect(dialog.getByRole('checkbox', { name: 'Include dressed character sheets', exact: true })).toBeDisabled()
  await page.keyboard.press('Escape'); await expect(dialog).toBeVisible()
  await releaseProjectTransaction(page)
  await expect(input).toBeEnabled(); await expect(input).toBeChecked(); await expect(input).toBeFocused()
  await page.keyboard.press('Tab')
  await expect(dialog.locator('.export-moves input').nth(1)).toBeFocused()
})

test('an older ZIP finishing last cannot replace the latest engine and settings export', async ({ page }, info) => {
  await savedExport(page, info.config.projects.find(p => p.name === 'browser-selftests')!.use.baseURL!)
  const dialog = page.getByRole('dialog'), download = dialog.getByRole('button', { name: /^Download ZIP/ })
  await dialog.getByRole('radio', { name: 'Unity', exact: true }).check(); await expect(download).toBeEnabled()
  await dialog.getByText('Files included', { exact: true }).click()
  const entries = (await dialog.locator('pre').innerText()).trim().split('\n').length
  await page.evaluate(expected => {
    const host = window as unknown as { exportZipGate: { entered: boolean; finished: number; release: () => void } }
    let release!: () => void, first = true, released = false
    const gate = new Promise<void>(resolve => { release = resolve })
    const state: { entered: boolean; finished: number; release: () => void } = host.exportZipGate = { entered: false, finished: 0, release: () => { released = true; release() } }
    const Native = CompressionStream
    window.CompressionStream = new Proxy(Native, { construct(target, args) {
      const stream = Reflect.construct(target, args) as CompressionStream
      if (args[0] !== 'deflate-raw') return stream
      const held = first; first = false
      if (!held && !released) return stream // The newer ZIP is allowed to finish first.
      return { writable: stream.writable, readable: stream.readable.pipeThrough(new TransformStream({ async flush() {
        if (held) { state.entered = true; await gate }
        state.finished++
        if (state.finished === expected) window.CompressionStream = Native
      } })) }
    } })
  }, entries)
  await dialog.getByRole('button', { name: 'Settings', exact: true }).click()
  const walk = dialog.getByRole('checkbox', { name: 'Walk', exact: true })
  await walk.check(); await expect(walk).toBeEnabled()
  await dialog.getByRole('button', { name: 'Back', exact: true }).click()
  await expect.poll(() => page.evaluate(() => (window as unknown as { exportZipGate: { entered: boolean } }).exportZipGate.entered)).toBe(true)
  await expect(dialog.getByRole('button', { name: 'Preparing…', exact: true })).toBeDisabled()
  await dialog.getByRole('radio', { name: 'PNG + JSON', exact: true }).check(); await expect(download).toBeEnabled()
  await page.evaluate(() => (window as unknown as { exportZipGate: { release: () => void } }).exportZipGate.release())
  await expect.poll(() => page.evaluate(() => (window as unknown as { exportZipGate: { finished: number } }).exportZipGate.finished)).toBe(entries)
  await dialog.getByText('Files included', { exact: true }).click()
  await expect(dialog.locator('pre')).toContainText('generic/')
  await expect(dialog.locator('pre')).not.toContainText('unity/')
  const [file] = await Promise.all([page.waitForEvent('download'), download.click()])
  const zip = await unzip(new Uint8Array(await readFile((await file.path())!)))
  expect(file.suggestedFilename()).toMatch(/-generic\.pixeldoll\.zip$/)
  const manifest = JSON.parse(new TextDecoder().decode(zip.get('manifest.json')!))
  expect(manifest.export.engines).toEqual(['generic'])
  expect(manifest.rig.animations.find((a: { id: string }) => a.id === 'walk').loop).toBe(false)
})

test('Export takes the live current look and keeps a different saved outfit in the combined PNGs', async ({ page }, info) => {
  await savedExport(page, info.config.projects.find(p => p.name === 'browser-selftests')!.use.baseURL!)
  await page.getByRole('button', { name: 'Close export' }).click()
  const sample = await page.evaluate(async () => {
    const statePath = '/src/studio/state.svelte.ts', dbPath = '/src/lib/store/db.ts', state = await import(statePath), db = await import(dbPath)
    const project = state.store.project, body = project.manifest.items[0], image = project.images.get(body.layers[0].cells.walk.south[0])
    let pixel = -1
    const material = project.manifest.materials.find((material: { owner: string; ramp: string[] }) => material.owner === body.id && material.ramp.some(color => {
      for (let i = 0; i < image.data.length; i += 4) if (image.data[i + 3] && '#' + [...image.data.slice(i, i + 3)].map(n => n.toString(16).padStart(2, '0')).join('') === color) { pixel = i / 4; return true }
      return false
    }))
    if (!material || pixel < 0) throw new Error('Fixture needs a visible body material')
    await db.update('projects', state.doc.id, (record: { manifest: typeof project.manifest }) => {
      const mat = record.manifest.materials.find((m: { id: string }) => m.id === material.id)
      mat.variants['audit-current'] = mat.ramp.map(() => '#ff0000'); mat.variants['audit-saved'] = mat.ramp.map(() => '#0000ff'); delete mat.defaultVariant
      record.manifest.presets = [{ id: 'audit-saved', name: 'Saved blue outfit', items: { body: body.id }, variants: { [mat.id]: 'audit-saved' } }]
      return record
    })
    await state.openProject(state.doc.id)
    state.setVariant(material.id, 'audit-current'); await state.flushSave()
    return { x: pixel % image.w, y: Math.floor(pixel / image.w), material: material.id }
  })
  await page.getByRole('button', { name: 'Export', exact: true }).click()
  const dialog = page.getByRole('dialog'), button = dialog.getByRole('button', { name: /^Download ZIP/ })
  await dialog.getByRole('radio', { name: 'PNG + JSON', exact: true }).check(); await expect(button).toBeEnabled()
  const [download] = await Promise.all([page.waitForEvent('download'), button.click()])
  const entries = await unzip(new Uint8Array(await readFile((await download.path())!)))
  const manifest = JSON.parse(new TextDecoder().decode(entries.get('manifest.json')!))
  expect(manifest.presets.find((p: { id: string }) => p.id === 'current').variants[sample.material]).toBe('audit-current')
  expect(manifest.presets.find((p: { id: string }) => p.id === 'audit-saved').variants[sample.material]).toBe('audit-saved')
  const current = await decodePngBytes(entries.get('baked/current/walk.png')!), saved = await decodePngBytes(entries.get('baked/audit-saved/walk.png')!)
  expect([...current.data.slice((sample.y * current.w + sample.x) * 4, (sample.y * current.w + sample.x) * 4 + 4)]).toEqual([255, 0, 0, 255])
  expect([...saved.data.slice((sample.y * saved.w + sample.x) * 4, (sample.y * saved.w + sample.x) * 4 + 4)]).toEqual([0, 0, 255, 255])
})

test('one-frame and hundred-animation characters keep exact summaries, readable names and reachable controls', async ({ page }, info) => {
  await savedExport(page, info.config.projects.find(p => p.name === 'browser-selftests')!.use.baseURL!)
  const dialog = page.getByRole('dialog')
  for (const count of [1, 100]) {
    await dialog.getByRole('button', { name: 'Close export' }).click()
    await page.evaluate(async count => {
      const statePath = '/src/studio/state.svelte.ts', dbPath = '/src/lib/store/db.ts', rigPath = '/src/lib/rig/rig.ts'
      const state = await import(statePath), db = await import(dbPath), { baseHashOf } = await import(rigPath)
      const record = await db.get('projects', state.doc.id), manifest = record.manifest, base = manifest.items[0]
      const hashes: Record<string, string> = {}, first = base.layers.map((layer: { cells: Record<string, { south: string[] }> }) => layer.cells[manifest.rig.animations[0].id].south[0])
      manifest.rig.animations = Array.from({ length: count }, (_, i) => ({ id: count === 1 ? 'default' : `animation-${i}-${'longname'.repeat(12)}`, cells: 1, loop: count === 1, frames: [{ cell: 0, ms: 100 }] }))
      base.layers.forEach((layer: { cells: Record<string, { south: string[] }> }, j: number) => {
        layer.cells = Object.fromEntries(manifest.rig.animations.map((a: { id: string }) => { hashes[`${a.id}/south/0`] = first[j]; return [a.id, { south: [first[j]] }] }))
      })
      manifest.rig.baseHash = await baseHashOf(manifest.rig, hashes); base.baseHash = manifest.rig.baseHash
      await db.put('projects', 'studio-export-settings', { engine: 'godot', dressedCharacterSheets: count !== 100, playOnce: count === 100 ? manifest.rig.animations.map((move: { id: string }) => move.id) : [] })
      await db.put('projects', state.doc.id, record); await state.openProject(state.doc.id)
    }, count)
    await page.setViewportSize({ width: 320, height: 568 }); await page.emulateMedia({ reducedMotion: 'reduce' })
    await page.getByRole('button', { name: 'Export', exact: true }).click()
    const summary = dialog.locator('.export-summary dd').first()
    await expect(summary).toHaveText(count === 1 ? 'None' : 'All')
    await dialog.getByRole('button', { name: 'Settings', exact: true }).click()
    const inputs = dialog.locator('.export-moves input'), labels = dialog.locator('.export-move span')
    await expect(inputs).toHaveCount(count)
    expect(await dialog.locator('.export-page').evaluate(element => getComputedStyle(element).animationName)).toBe('none')
    if (count === 1) { await inputs.first().check(); await expect(inputs.first()).toBeEnabled() }
    else {
      await inputs.first().uncheck(); await expect(inputs.first()).toBeEnabled()
      await inputs.last().uncheck(); await expect(inputs.last()).toBeEnabled()
    }
    const names = await labels.allTextContents()
    await dialog.getByRole('checkbox', { name: 'Include dressed character sheets', exact: true }).scrollIntoViewIfNeeded()
    expect(await dialog.evaluate(element => element.scrollWidth <= element.clientWidth)).toBe(true)
    await page.screenshot({ path: info.outputPath(`export-${count}-animations.png`) })
    await dialog.getByRole('button', { name: 'Back', exact: true }).click()
    await expect(summary).toHaveText(count === 1 ? 'All' : names.slice(1, -1).join(', '))
    await expect(dialog.getByRole('button', { name: /^Download ZIP/ })).toBeVisible()
    expect(await dialog.evaluate(element => element.scrollWidth <= element.clientWidth)).toBe(true)
  }
})

test('Export settings persist explicit None, list and All choices, and toggle combined sheets in downloaded ZIPs', async ({ page }, info) => {
  const dev = info.config.projects.find(p => p.name === 'browser-selftests')!.use.baseURL!
  await savedExport(page, dev)
  const dialog = page.getByRole('dialog'), summary = dialog.locator('.export-summary dd')
  const openSettings = async () => { await dialog.getByRole('button', { name: 'Settings', exact: true }).click(); await expect(dialog).toHaveAccessibleName('Export settings') }
  const back = async () => { await dialog.getByRole('button', { name: 'Back', exact: true }).click(); await expect(dialog.getByRole('button', { name: 'Settings', exact: true })).toBeFocused() }
  await openSettings()
  const moves = dialog.locator('.export-moves input'), count = await moves.count()
  expect(count).toBeGreaterThan(1)
  for (let i = 0; i < count; i++) { await moves.nth(i).uncheck(); await expect(moves.nth(i)).toBeEnabled() }
  await back(); await expect(summary.nth(0)).toHaveText('None')
  await openSettings()
  const firstName = await dialog.locator('.export-move span').first().innerText()
  await moves.first().check(); await expect(moves.first()).toBeEnabled()
  await back(); await expect(summary.nth(0)).toHaveText(firstName)
  await openSettings()
  for (let i = 0; i < count; i++) { await moves.nth(i).check(); await expect(moves.nth(i)).toBeEnabled() }
  const dressed = dialog.getByRole('checkbox', { name: 'Include dressed character sheets', exact: true })
  await expect(dressed).toHaveAccessibleDescription('Adds PNG sprite sheets of your current look and each saved outfit, with the body and equipped items combined. Separate layers are always included.')
  await dressed.uncheck(); await expect(dressed).toBeEnabled()
  await back(); await expect(summary).toHaveText(['All', 'None'])
  await dialog.getByRole('button', { name: 'Close export' }).click()
  await page.evaluate(() => location.reload())
  await enterStudio(page)
  await page.getByRole('button', { name: 'Export', exact: true }).click()
  await expect(summary).toHaveText(['All', 'None'])
  await dialog.getByRole('radio', { name: 'PNG + JSON', exact: true }).check()
  const downloadZip = async () => {
    const button = dialog.getByRole('button', { name: /^Download ZIP/ }); await expect(button).toBeEnabled()
    const [download] = await Promise.all([page.waitForEvent('download'), button.click()])
    return unzip(new Uint8Array(await readFile((await download.path())!)))
  }
  const off = await downloadZip(), manifest = JSON.parse(new TextDecoder().decode(off.get('manifest.json')!))
  expect(manifest.rig.animations.every((a: { loop: boolean }) => a.loop === false)).toBe(true)
  expect(manifest.presets.length).toBeGreaterThan(1)
  expect([...off.keys()].some(name => name.startsWith('baked/'))).toBe(false)
  expect([...off.keys()].some(name => name.startsWith('layers/'))).toBe(true)
  expect(JSON.parse(new TextDecoder().decode(off.get('project.json')!)).manifest.rig.animations.every((move: { loop: boolean }) => !move.loop)).toBe(true)
  await page.getByRole('button', { name: 'Export', exact: true }).click()
  await openSettings()
  for (let i = 0; i < count; i++) { await moves.nth(i).uncheck(); await expect(moves.nth(i)).toBeEnabled() }
  await dressed.check(); await expect(dressed).toBeEnabled()
  await back(); await expect(summary).toHaveText(['None', 'Current look + saved outfits'])
  await dialog.getByText('Files included', { exact: true }).click()
  await expect(dialog.locator('pre')).toContainText('baked/current/')
  const on = await downloadZip()
  expect([...on.keys()].some(name => name.startsWith('baked/current/'))).toBe(true)
  expect(JSON.parse(new TextDecoder().decode(on.get('manifest.json')!)).rig.animations.every((a: { loop: boolean }) => a.loop === true)).toBe(true)
})

test('Export settings show storage failures without changing the choice or trapping navigation', async ({ page }, info) => {
  await savedExport(page, info.config.projects.find(p => p.name === 'browser-selftests')!.use.baseURL!)
  const dialog = page.getByRole('dialog')
  await expect(dialog.locator('.export-summary dd')).toHaveCount(2)
  const before = await dialog.locator('.export-summary dd').allTextContents()
  await dialog.getByRole('button', { name: 'Settings', exact: true }).click()
  for (const input of [dialog.locator('.export-moves input').first(), dialog.getByRole('checkbox', { name: 'Include dressed character sheets', exact: true })]) {
    const checked = await input.isChecked()
    await page.evaluate(() => {
    const original = IDBObjectStore.prototype.put
    IDBObjectStore.prototype.put = function(value, key) {
      if (this.name === 'projects' && key === 'studio-export-settings') { IDBObjectStore.prototype.put = original; throw new Error('Synthetic settings write failure') }
      return original.call(this, value, key)
    }
    })
    await input.focus(); await input.press('Space') // Failed persistence immediately restores the old checkbox state.
    await expect(dialog.getByRole('alert')).toContainText('Synthetic settings write failure')
    await expect(input).toBeEnabled(); await expect(input).toBeFocused()
    if (checked) await expect(input).toBeChecked(); else await expect(input).not.toBeChecked()
  }
  await dialog.getByRole('button', { name: 'Back', exact: true }).click()
  await expect(dialog.locator('.export-summary dd')).toHaveText(before)
  const originalEngine = dialog.getByRole('radio', { name: 'Godot', exact: true })
  await expect(originalEngine).toBeChecked()
  await page.evaluate(() => {
    const original = IDBObjectStore.prototype.put
    IDBObjectStore.prototype.put = function(value, key) {
      if (this.name === 'projects' && key === 'studio-export-settings') { IDBObjectStore.prototype.put = original; throw new Error('Synthetic format write failure') }
      return original.call(this, value, key)
    }
  })
  await dialog.getByRole('radio', { name: 'Unity', exact: true }).click() // The expected rollback can finish before check() verifies its opposite postcondition.
  await expect(dialog.getByRole('alert')).toContainText('Synthetic format write failure')
  await expect(originalEngine).toBeChecked()
  await expect(dialog.getByRole('radio', { name: 'Unity', exact: true })).not.toBeChecked()
  await expect(dialog.locator('#export-description')).toContainText('Godot:')
  await dialog.getByRole('button', { name: 'Close export' }).click()
  await expect(dialog).toHaveCount(0)
})

test('invalid stored Export preferences show a clear error and allow closing the dialog', async ({ page }, info) => {
  await savedExport(page, info.config.projects.find(p => p.name === 'browser-selftests')!.use.baseURL!)
  await page.getByRole('button', { name: 'Close export' }).click()
  const errors: string[] = []; page.on('pageerror', error => errors.push(error.message))
  await page.evaluate(async key => {
    const path = '/src/lib/store/db.ts', db = await import(path)
    await db.put('projects', key, { engine: 'unsupported', dressedCharacterSheets: true, playOnce: [] })
  }, EXPORT_SETTINGS_KEY)
  await page.getByRole('button', { name: 'Export', exact: true }).click()
  const dialog = page.getByRole('dialog')
  await expect(dialog.getByRole('alert')).toContainText('supported format')
  await expect(dialog.getByRole('button', { name: /^Download ZIP/ })).toBeDisabled()
  await dialog.getByRole('button', { name: 'Close export' }).click()
  await expect(dialog).toHaveCount(0)
  expect(errors).toEqual([])
})

test('an unrelated malformed character shows an identifiable library error without crashing Export', async ({ page }, info) => {
  await savedExport(page, info.config.projects.find(p => p.name === 'browser-selftests')!.use.baseURL!)
  await page.getByRole('button', { name: 'Close export' }).click()
  const errors: string[] = []; page.on('pageerror', error => errors.push(error.message))
  await page.evaluate(async () => {
    const path = '/src/lib/store/db.ts', db = await import(path)
    await db.put('projects', 'rig-broken-export-names', { id: 'rig-broken-export-names', manifest: { format: 'pixeldoll/2', name: 'Broken library character', rig: { animations: null } } })
  })
  await page.getByRole('button', { name: 'Export', exact: true }).click()
  const dialog = page.getByRole('dialog')
  await expect(dialog.getByRole('alert')).toContainText('Broken library character')
  await expect(dialog.getByRole('button', { name: /^Download ZIP/ })).toBeDisabled()
  await dialog.getByRole('button', { name: 'Close export' }).click()
  expect(errors).toEqual([])
})

test('distinct imported IDs with identical pretty names remain distinguishable global choices', async ({ page }, info) => {
  await savedExport(page, info.config.projects.find(p => p.name === 'browser-selftests')!.use.baseURL!)
  await page.getByRole('button', { name: 'Close export' }).click()
  await page.evaluate(async () => {
    const statePath = '/src/studio/state.svelte.ts', dbPath = '/src/lib/store/db.ts', rigPath = '/src/lib/rig/rig.ts'
    const s = await import(statePath), db = await import(dbPath), { baseHashOf } = await import(rigPath)
    const rec = await db.get('projects', s.doc.id), m = rec.manifest, oldIds = m.rig.animations.map((a: { id: string }) => a.id)
    const ids = ['jump-loop', 'jump--loop'], hashes: Record<string, string> = {}
    m.rig.animations.forEach((a: { id: string }, i: number) => { a.id = ids[i] })
    for (const layer of m.items[0].layers) {
      const cells = layer.cells
      layer.cells = Object.fromEntries(ids.map((id, i) => [id, cells[oldIds[i]]]))
      for (const id of ids) layer.cells[id].south.forEach((hash: string, i: number) => { hashes[`${id}/south/${i}`] = hash })
    }
    m.rig.baseHash = await baseHashOf(m.rig, hashes); m.items[0].baseHash = m.rig.baseHash
    await db.put('projects', s.doc.id, rec); await s.openProject(s.doc.id)
  })
  await page.getByRole('button', { name: 'Export', exact: true }).click()
  const dialog = page.getByRole('dialog')
  await dialog.getByRole('button', { name: 'Settings', exact: true }).click()
  const once = dialog.getByRole('checkbox', { name: 'Jump loop (jump-loop)', exact: true })
  await once.check(); await expect(once).toBeEnabled()
  await expect(dialog.getByRole('checkbox', { name: 'Jump loop (jump--loop)', exact: true })).not.toBeChecked()
  await dialog.getByRole('button', { name: 'Back', exact: true }).click()
  await expect(dialog.locator('.export-summary dd').first()).toHaveText('Jump loop (jump-loop)')
  expect(await page.evaluate(async () => { const path = '/src/lib/store/export-settings.ts'; return (await import(path)).readExportSettings() })).toMatchObject({ playOnce: ['jump-loop'] })
})

test('Export navigation and settings fit phones, landscape and both themes, including a character without saved outfits', async ({ page }, info) => {
  await savedExport(page, info.config.projects.find(p => p.name === 'browser-selftests')!.use.baseURL!)
  await page.getByRole('button', { name: 'Close export' }).click()
  await page.evaluate(async () => {
    const path = '/src/studio/state.svelte.ts', state = await import(path), project = state.store.project
    state.store.project = { ...project, manifest: { ...project.manifest, presets: [] } }
  })
  await page.getByRole('button', { name: 'Export', exact: true }).click()
  const dialog = page.getByRole('dialog')
  await expect(dialog.locator('.export-summary dd').nth(1)).toHaveText('Current look')
  for (const theme of ['light', 'dark']) for (const viewport of [{ width: 320, height: 568 }, { width: 844, height: 390 }]) {
    await page.evaluate(theme => document.documentElement.dataset.theme = theme, theme)
    await page.setViewportSize(viewport)
    const close = dialog.getByRole('button', { name: 'Close export' }), settings = dialog.getByRole('button', { name: 'Settings', exact: true })
    const closeBefore = await close.boundingBox(), nav = await settings.boundingBox()
    expect(nav!.x + nav!.width).toBeLessThan(closeBefore!.x)
    await settings.click()
    await expect(dialog.getByRole('group', { name: 'Play animation once' })).toBeVisible()
    const closeAfter = await close.boundingBox()
    expect(closeAfter!.x).toBeCloseTo(closeBefore!.x, 0)
    expect(closeAfter!.y).toBeCloseTo(closeBefore!.y, 0)
    expect(await dialog.evaluate(element => element.scrollWidth <= element.clientWidth)).toBe(true)
    await expect(dialog.locator('[title]')).toHaveCount(0)
    await dialog.getByRole('checkbox', { name: 'Include dressed character sheets', exact: true }).scrollIntoViewIfNeeded()
    await expect(dialog.getByRole('checkbox', { name: 'Include dressed character sheets', exact: true })).toBeVisible()
    await page.screenshot({ path: info.outputPath(`export-settings-${theme}-${viewport.width}.png`) })
    await dialog.getByRole('button', { name: 'Back', exact: true }).click()
    await expect(dialog.getByRole('button', { name: /^Download ZIP/ })).toBeVisible()
  }
  await dialog.getByRole('button', { name: 'Close export' }).click()
  await expect(page.getByRole('button', { name: 'Export', exact: true })).toBeFocused()
})

test('Preview, Top-down and Side-scroller always loop with global Play once both on and off', async ({ page }, info) => {
  await page.setViewportSize({ width: 800, height: 600 })
  await page.addInitScript(() => { localStorage.setItem('pixeldoll.agentKey', 'off'); localStorage.setItem('pixeldoll.welcomed', '1') })
  await page.route('https://*.pixellab.ai/**', route => route.abort())
  await openStudio(page, info.config.projects.find(p => p.name === 'browser-selftests')!.use.baseURL!)
  await page.clock.install({ time: new Date('2026-10-27T12:00:00Z') })
  await page.clock.pauseAt(new Date('2026-10-27T12:00:01Z'))
  await page.evaluate(async () => {
    const path = '/src/studio/state.svelte.ts', s = await import(path)
    const walk = s.store.project.manifest.rig.animations.find((move: { id: string }) => move.id === 'walk')
    walk.loop = false; walk.frames = [{ cell: 0, ms: 100 }, { cell: 1, ms: 100 }]
    s.ui.anim = 'walk'; s.ui.dir = 'south'; s.ui.playing = true; s.doc.rev++
    const host = window as unknown as { appLoopFrames: number[] }
    host.appLoopFrames = []
    const original = CanvasRenderingContext2D.prototype.drawImage
    CanvasRenderingContext2D.prototype.drawImage = function(image: CanvasImageSource, ...coordinates: number[]) {
      Reflect.apply(original, this, [image, ...coordinates])
      // Observe the source pixels actually drawn for the actor, before camera motion or reflections.
      if (!this.canvas.classList.contains('world-actors') || this.globalAlpha !== 1 || !(image instanceof HTMLCanvasElement)) return
      const pixels = image.getContext('2d')!.getImageData(0, 0, image.width, image.height).data
      let hash = 2166136261
      for (const byte of pixels) hash = Math.imul(hash ^ byte, 16777619)
      const value = hash >>> 0
      if (host.appLoopFrames.at(-1) !== value) host.appLoopFrames.push(value)
    }
  })
  const modes = page.getByRole('navigation', { name: 'Character view' })
  for (const playOnce of [true, false]) {
    await page.evaluate(async playOnce => { const path = '/src/lib/store/export-settings.ts', settings = await import(path); await settings.saveExportSetting({ animation: 'WALK', playOnce }) }, playOnce)
    for (const mode of ['Preview', 'Top-down', 'Side-scroller']) {
      await modes.getByRole('button', { name: mode, exact: true }).click()
      await page.locator('.world-stage').focus()
      const key = mode === 'Top-down' ? 's' : mode === 'Side-scroller' ? 'd' : null
      if (key) await page.keyboard.down(key)
      await page.evaluate(() => { (window as unknown as { appLoopFrames: number[] }).appLoopFrames = [] })
      await page.clock.runFor(1100)
      const frames = await page.evaluate(() => (window as unknown as { appLoopFrames: number[] }).appLoopFrames)
      expect(new Set(frames).size, `${mode}, Play once ${playOnce}`).toBe(2)
      expect(frames.length, `${mode}, Play once ${playOnce}`).toBeGreaterThanOrEqual(8)
      if (key) await page.keyboard.up(key)
    }
  }
})

test('Share preview and downloaded GIF loop continuously for a one-shot move', async ({ page, context }, testInfo) => {
  await context.route('https://api.pixellab.ai/**', route => route.abort())
  await context.addInitScript(() => {
    localStorage.setItem('pixeldoll.agentKey', 'off')
    localStorage.setItem('pixeldoll.welcomed', '1')
  })
  const dev = testInfo.config.projects.find(project => project.name === 'browser-selftests')!.use.baseURL!
  await openStudio(page, dev + '/#/', { waitUntil: 'networkidle' })
  await page.evaluate(async () => {
    const path = '/src/lib/store/export-settings.ts', settings = await import(path)
    await settings.saveExportSetting({ animation: 'WALK', playOnce: true })
    const studio = (window as unknown as { __studio: { doc: { rev: number }; store: { project: { manifest: { rig: { animations: { id: string; loop: boolean; frames: { cell: number; ms: number }[] }[] } } } } } }).__studio
    const clip = studio.store.project.manifest.rig.animations.find(move => move.id === 'walk')!
    clip.loop = false
    clip.frames = [{ cell: 0, ms: 100 }, { cell: 1, ms: 100 }]
    studio.doc.rev++
  })
  await page.clock.install({ time: new Date('2026-10-27T12:00:00Z') })
  await page.clock.pauseAt(new Date('2026-10-27T12:00:01Z'))
  await page.getByRole('button', { name: 'Share character' }).click()
  const popover = page.getByRole('dialog', { name: 'Share character preview' })
  const frameData = () => popover.locator('.share-preview canvas').evaluate(element => {
    const canvas = element as HTMLCanvasElement
    const data = canvas.getContext('2d')!.getImageData(0, 0, canvas.width, canvas.height).data
    let hash = 2166136261
    for (const byte of data) hash = Math.imul(hash ^ byte, 16777619)
    return hash >>> 0
  })
  await page.clock.runFor(50)
  const first = await frameData()
  await page.clock.runFor(100)
  const second = await frameData()
  expect(second).not.toBe(first)
  for (let cycle = 0; cycle < 3; cycle++) {
    await page.clock.runFor(100)
    expect(await frameData()).toBe(first)
    await page.clock.runFor(100)
    expect(await frameData()).toBe(second)
  }
  await page.clock.resume()
  await expect(popover.getByRole('button', { name: 'Download GIF' })).toBeEnabled()
  const [download] = await Promise.all([page.waitForEvent('download'), popover.getByRole('button', { name: 'Download GIF' }).click()])
  const bytes = await readFile((await download.path())!)
  const loop = bytes.indexOf('NETSCAPE2.0')
  expect(loop).toBeGreaterThan(0)
  expect([...bytes.subarray(loop + 11, loop + 16)]).toEqual([3, 1, 0, 0, 0])
})

test('Copy PNG writes a readable image through the real browser clipboard in animated mode', async ({ page, context }, testInfo) => {
  await context.grantPermissions(['clipboard-read', 'clipboard-write'])
  await context.route('https://api.pixellab.ai/**', route => route.abort())
  await context.addInitScript(() => {
    localStorage.setItem('pixeldoll.agentKey', 'off')
    localStorage.setItem('pixeldoll.welcomed', '1')
  })
  await openStudio(page, testInfo.project.use.baseURL! + '/#/', { waitUntil: 'networkidle' })
  await page.getByRole('button', { name: 'Share character' }).click()
  const popover = page.getByRole('dialog', { name: 'Share character preview' })
  await popover.getByRole('combobox', { name: 'Size' }).selectOption('2')
  await expect(popover.getByRole('button', { name: 'Download GIF' })).toBeEnabled()
  const [download] = await Promise.all([page.waitForEvent('download'), popover.getByRole('button', { name: 'Download GIF' }).click()])
  const gif = [...await readFile((await download.path())!)]
  await popover.getByRole('button', { name: 'Copy PNG', exact: true }).click()
  await expect(popover.getByRole('status')).toHaveText('PNG copied')
  const pixels = await page.evaluate(async gifBytes => {
    const items = await navigator.clipboard.read()
    const png = await items.find(item => item.types.includes('image/png'))!.getType('image/png')
    const [copied, firstFrame] = await Promise.all([createImageBitmap(png), createImageBitmap(new Blob([new Uint8Array(gifBytes)], { type: 'image/gif' }))])
    const data = (image: ImageBitmap) => {
      const canvas = document.createElement('canvas'); canvas.width = image.width; canvas.height = image.height
      const ctx = canvas.getContext('2d')!; ctx.drawImage(image, 0, 0)
      return ctx.getImageData(0, 0, canvas.width, canvas.height).data
    }
    const a = data(copied), b = data(firstFrame)
    const matches = a.length === b.length && a.every((value, i) => value === b[i])
    const dimensions = [copied.width, copied.height]
    copied.close(); firstFrame.close()
    return { matches, dimensions }
  }, gif)
  expect(pixels).toEqual({ matches: true, dimensions: [128, 128] })
})

test('Share popover follows the selected move, direction and Animate switch on desktop and phone', async ({ page, context }, testInfo) => {
  const apiRequests: string[] = []
  await context.route('https://api.pixellab.ai/**', route => { apiRequests.push(route.request().url()); return route.abort() })
  await context.addInitScript(() => {
    localStorage.setItem('pixeldoll.agentKey', 'off')
    localStorage.setItem('pixeldoll.welcomed', '1')
    Object.defineProperty(Navigator.prototype, 'clipboard', { configurable: true, value: { write: async (items: ClipboardItem[]) => {
      const png = await items[0].getType('image/png')
      ;(window as unknown as { __copied?: number[] }).__copied = [...new Uint8Array(await png.arrayBuffer())]
    } } })
    Object.defineProperty(Navigator.prototype, 'canShare', { configurable: true, value: (data: ShareData) => !!data.files?.length })
    Object.defineProperty(Navigator.prototype, 'share', { configurable: true, value: async (data: ShareData) => {
      const file = data.files?.[0]
      ;(window as unknown as { __shared?: { type: string; name: string; size: number; header: number[] } }).__shared = file && { type: file.type, name: file.name, size: file.size, header: [...new Uint8Array(await file.slice(0, 24).arrayBuffer())] }
    } })
  })
  const errors: string[] = []
  page.on('pageerror', error => errors.push(error.message))
  await openStudio(page, testInfo.project.use.baseURL! + '/#/', { waitUntil: 'networkidle' })
  await page.locator('.world-actors').first().waitFor()
  const trigger = page.getByRole('button', { name: 'Share character' })
  await trigger.click()
  const popover = page.getByRole('dialog', { name: 'Share character preview' })
  await expect(popover).toBeVisible()
  await expect(popover).toHaveAttribute('data-positioned', '')
  await expect(popover.locator('.bu-popover-arrow')).toBeVisible()
  expect(await popover.evaluate(element => {
    const arrow = element.querySelector('.bu-popover-arrow')!.getBoundingClientRect()
    const trigger = document.querySelector('[popovertarget="share-popover"]')!.getBoundingClientRect()
    return Math.abs(arrow.x + arrow.width / 2 - trigger.x - trigger.width / 2)
  })).toBeLessThanOrEqual(12)
  await expect(popover.getByRole('combobox', { name: 'Move' })).toBeFocused()
  await expect(popover.getByRole('combobox', { name: 'Move' })).toHaveValue('walk')
  await expect(popover.getByRole('combobox', { name: 'Direction' })).toHaveValue('south')
  await expect(popover.getByRole('combobox', { name: 'Size' }).locator('option')).toHaveText(['1x size', '2x size', '3x size', '4x size', '6x size', '8x size', '10x size'])
  await expect(popover.getByRole('switch')).toBeChecked()
  await expect(popover.getByRole('button', { name: 'Download GIF' })).toBeEnabled()
  await expect(popover.getByRole('button', { name: 'Download GIF' })).toContainText('Download GIF')
  await expect(popover.locator('.share-animate')).toContainText('Animated')
  const geometry = () => popover.evaluate(element => {
    const rect = (selector: string) => {
      const box = (selector === '#share-popover' ? element : element.querySelector(selector)!).getBoundingClientRect()
      return [box.x, box.y, box.width, box.height].map(value => Math.round(value))
    }
    const preview = element.querySelector<HTMLElement>('.share-preview')!
    return {
      popover: rect('#share-popover'), preview: rect('.share-preview'),
      move: rect('select[aria-label="Move"]'), direction: rect('select[aria-label="Direction"]'),
      size: rect('select[aria-label="Size"]'), animate: rect('.share-animate'), actions: rect('.share-actions'),
      overflow: preview.scrollHeight > preview.clientHeight + 1 || preview.scrollWidth > preview.clientWidth + 1 || element.scrollHeight > element.clientHeight + 1,
    }
  })
  const fixedLayout = async (expected: Awaited<ReturnType<typeof geometry>>) => {
    const actual = await geometry()
    expect(actual.popover.slice(0, 3)).toEqual(expected.popover.slice(0, 3))
    expect(actual.preview).toEqual(expected.preview)
    expect(actual.move).toEqual(expected.move)
    expect(actual.direction).toEqual(expected.direction)
    expect(actual.size).toEqual(expected.size)
    expect(actual.animate).toEqual(expected.animate)
    expect(actual.size[2]).toBe(actual.animate[2])
    expect(actual.actions).toEqual(expected.actions)
    expect(actual.move[2]).toBe(actual.direction[2])
    expect(actual.overflow).toBe(false)
    expect(actual.popover[0]).toBeGreaterThanOrEqual(0)
    expect(actual.popover[0] + actual.popover[2]).toBeLessThanOrEqual(page.viewportSize()!.width)
    expect(actual.popover[1]).toBeGreaterThanOrEqual(0)
    expect(actual.popover[1] + actual.popover[3]).toBeLessThanOrEqual(page.viewportSize()!.height)
    return actual
  }
  const headerFits = async () => {
    const buttons = await page.locator('.experience-header button:visible').evaluateAll(elements => elements.map(element => {
      const { left, right } = element.getBoundingClientRect()
      return [left, right]
    }).sort((a, b) => a[0] - b[0]))
    for (const [index, [left, right]] of buttons.entries()) {
      expect(left).toBeGreaterThanOrEqual(0)
      expect(right).toBeLessThanOrEqual(page.viewportSize()!.width)
      if (index) expect(left).toBeGreaterThanOrEqual(buttons[index - 1][1])
    }
  }
  const desktopLayout = await geometry()
  const desktopMove = (await popover.getByRole('combobox', { name: 'Move' }).boundingBox())!
  const desktopSwitch = (await popover.locator('.share-animate').boundingBox())!
  expect(desktopSwitch.y).toBeGreaterThanOrEqual(desktopMove.y + desktopMove.height)
  await page.screenshot({ path: testInfo.outputPath('share-desktop.png') })
  const [gif] = await Promise.all([page.waitForEvent('download'), popover.getByRole('button', { name: 'Download GIF' }).click()])
  const gifBytes = await readFile((await gif.path())!)
  expect(gif.suggestedFilename()).toMatch(/-walk-south\.gif$/)
  expect(gifBytes.subarray(0, 6).toString()).toBe('GIF89a')
  await expect(popover.locator('[title]')).toHaveCount(0)
  await popover.getByRole('combobox', { name: 'Size' }).selectOption('3')
  await expect(popover.getByRole('button', { name: 'Download GIF' })).toBeEnabled()
  await expect(popover.locator('.share-resolution')).toHaveText('192 × 192 px')
  await expect(popover.getByRole('button', { name: 'Download GIF' })).toHaveAccessibleDescription('192 × 192 px')
  const [scaledGif] = await Promise.all([page.waitForEvent('download'), popover.getByRole('button', { name: 'Download GIF' }).click()])
  const scaledBytes = await readFile((await scaledGif.path())!)
  expect([scaledBytes.readUInt16LE(6), scaledBytes.readUInt16LE(8)]).toEqual([192, 192])
  await popover.getByRole('button', { name: 'Copy PNG', exact: true }).click()
  await expect(popover.getByRole('status')).toHaveText('PNG copied')
  const copied = Buffer.from(await page.evaluate(() => (window as unknown as { __copied: number[] }).__copied))
  expect([copied.readUInt32BE(16), copied.readUInt32BE(20)]).toEqual([192, 192])
  await popover.getByRole('button', { name: 'Share to…' }).click()
  await expect.poll(() => page.evaluate(() => (window as unknown as { __shared?: { header: number[] } }).__shared?.header)).toEqual([...scaledBytes.subarray(0, 24)])
  await popover.getByRole('combobox', { name: 'Size' }).selectOption('1')
  await expect(popover.getByRole('button', { name: 'Download GIF' })).toBeEnabled()
  await popover.getByRole('button', { name: 'Share to…' }).click()
  await expect.poll(() => page.evaluate(() => (window as unknown as { __shared?: { type: string } }).__shared?.type)).toBe('image/gif')

  await popover.getByRole('combobox', { name: 'Move' }).selectOption('cross-punch')
  await fixedLayout(desktopLayout)
  await popover.getByRole('combobox', { name: 'Move' }).selectOption('walk')
  await expect(popover.getByRole('switch')).toBeEnabled()
  await expect(popover.getByRole('switch')).toBeChecked()

  await popover.getByRole('switch').uncheck()
  await expect(popover.getByRole('button', { name: 'Download PNG' })).toBeEnabled()
  await expect(popover.getByRole('button', { name: 'Download PNG' })).toContainText('Download PNG')
  const [png] = await Promise.all([page.waitForEvent('download'), popover.getByRole('button', { name: 'Download PNG' }).click()])
  const pngBytes = await readFile((await png.path())!)
  expect(png.suggestedFilename()).toMatch(/-walk-south\.png$/)
  expect([...pngBytes.subarray(0, 4)]).toEqual([137, 80, 78, 71])
  await popover.getByRole('button', { name: 'Copy PNG', exact: true }).click()
  await expect(popover.getByRole('status')).toHaveText('PNG copied')
  expect(Buffer.from(await page.evaluate(() => (window as unknown as { __copied: number[] }).__copied)).equals(pngBytes)).toBe(true)
  await popover.getByRole('button', { name: 'Share to…' }).click()
  await expect.poll(() => page.evaluate(() => (window as unknown as { __shared?: { type: string } }).__shared?.type)).toBe('image/png')

  await expect(popover.getByRole('switch')).not.toBeChecked()
  await expect(popover.getByRole('button', { name: 'Download PNG' })).toBeEnabled()
  await popover.getByRole('combobox', { name: 'Direction' }).selectOption('__all_directions__')
  await fixedLayout(desktopLayout)
  await expect(popover.getByRole('button', { name: 'Download PNG' })).toBeEnabled()
  expect(await popover.locator('.share-preview canvas').evaluate(element => (element as HTMLCanvasElement).width)).toBeGreaterThan(64)
  await popover.getByRole('combobox', { name: 'Move' }).selectOption('__all_moves__')
  await fixedLayout(desktopLayout)
  await expect(popover.getByRole('switch')).toBeEnabled()
  await expect(popover.getByRole('switch')).not.toBeChecked()
  await expect(popover.getByRole('button', { name: 'Download PNG' })).toBeEnabled()
  const omitted = popover.getByRole('status').filter({ hasText: 'unavailable views omitted' })
  await expect(omitted).toContainText('cross punch')
  const noticeBox = (await omitted.boundingBox())!, buttonsBox = (await popover.locator('.share-actions').boundingBox())!
  expect(noticeBox.y).toBeGreaterThanOrEqual(buttonsBox.y + buttonsBox.height)
  const [allPng] = await Promise.all([page.waitForEvent('download'), popover.getByRole('button', { name: 'Download PNG' }).click()])
  const allBytes = await readFile((await allPng.path())!)
  expect(allBytes.readUInt32BE(16)).toBeGreaterThan(64)
  expect(allBytes.readUInt32BE(20)).toBeGreaterThan(64)
  await popover.getByRole('switch').check()
  await fixedLayout(desktopLayout)
  await expect(popover.getByRole('button', { name: 'Download GIF' })).toBeEnabled()
  const [allGif] = await Promise.all([page.waitForEvent('download'), popover.getByRole('button', { name: 'Download GIF' }).click()])
  expect((await readFile((await allGif.path())!)).subarray(0, 6).toString()).toBe('GIF89a')
  await popover.getByRole('switch').uncheck()
  await popover.getByRole('combobox', { name: 'Direction' }).selectOption('east')
  await popover.getByRole('combobox', { name: 'Move' }).selectOption('cross-punch')
  await expect(popover.getByRole('button', { name: 'Download PNG' })).toBeDisabled()
  await expect(popover.getByRole('status')).toContainText('cross-punch facing East has no complete artwork')
  await popover.getByRole('combobox', { name: 'Direction' }).selectOption('__all_directions__')
  await expect(popover.getByRole('combobox', { name: 'Direction' }).locator('option[value="east"]')).toHaveAttribute('disabled', '')
  await expect(popover.getByRole('button', { name: 'Download PNG' })).toBeEnabled()

  await page.keyboard.press('Escape')
  await expect(popover).toBeHidden()
  await page.getByRole('toolbar', { name: 'Preview controls' }).getByRole('combobox', { name: 'Move' }).selectOption('walk')
  await page.getByRole('button', { name: 'Face north', exact: true }).click()
  await trigger.click()
  await expect(popover.getByRole('combobox', { name: 'Move' })).toHaveValue('cross-punch')
  await expect(popover.getByRole('combobox', { name: 'Direction' })).toHaveValue('__all_directions__')
  await expect(popover.getByRole('switch')).not.toBeChecked()

  await page.setViewportSize({ width: 390, height: 844 })
  await expect(trigger.locator('span')).toBeHidden()
  await expect(page.getByRole('button', { name: 'Export', exact: true })).toBeVisible()
  const box = (await popover.boundingBox())!
  expect(box.x).toBeGreaterThanOrEqual(0)
  expect(box.x + box.width).toBeLessThanOrEqual(390)
  const moveBox = (await popover.getByRole('combobox', { name: 'Move' }).boundingBox())!
  const directionBox = (await popover.getByRole('combobox', { name: 'Direction' }).boundingBox())!
  const animateBox = (await popover.locator('.share-animate').boundingBox())!
  expect(moveBox.width).toBeCloseTo(directionBox.width, 0)
  expect(animateBox.width).toBeCloseTo(moveBox.width, 0)
  const phoneLayout = await geometry()
  await popover.getByRole('combobox', { name: 'Move' }).selectOption('walk')
  await popover.getByRole('combobox', { name: 'Direction' }).selectOption('south')
  await fixedLayout(phoneLayout)
  await popover.getByRole('combobox', { name: 'Direction' }).selectOption('__all_directions__')
  await fixedLayout(phoneLayout)
  await popover.getByRole('combobox', { name: 'Move' }).selectOption('__all_moves__')
  await fixedLayout(phoneLayout)
  await popover.getByRole('switch').check()
  await fixedLayout(phoneLayout)
  await popover.getByRole('switch').uncheck()
  await fixedLayout(phoneLayout)
  await page.screenshot({ path: testInfo.outputPath('share-phone.png') })
  await page.setViewportSize({ width: 320, height: 700 })
  const grid = popover.locator('.share-preview')
  expect((await grid.boundingBox())!.height).toBeGreaterThan(200)
  expect((await popover.boundingBox())!.y + (await popover.boundingBox())!.height).toBeLessThanOrEqual(700)
  const smallLayout = await geometry()
  await popover.getByRole('combobox', { name: 'Move' }).selectOption('walk')
  await popover.getByRole('combobox', { name: 'Direction' }).selectOption('south')
  await fixedLayout(smallLayout)
  await popover.getByRole('combobox', { name: 'Direction' }).selectOption('__all_directions__')
  await fixedLayout(smallLayout)
  await popover.getByRole('combobox', { name: 'Move' }).selectOption('__all_moves__')
  await fixedLayout(smallLayout)
  await expect(page.getByRole('button', { name: 'Share character' })).toBeVisible()
  await expect(page.getByRole('button', { name: 'Export', exact: true })).toBeVisible()
  await headerFits()
  await page.screenshot({ path: testInfo.outputPath('share-grid-320.png') })
  await popover.getByRole('combobox', { name: 'Move' }).selectOption('walk')
  await popover.getByRole('combobox', { name: 'Direction' }).selectOption('south')
  await page.setViewportSize({ width: 844, height: 390 })
  await expect.poll(async () => (await popover.boundingBox())!.y + (await popover.boundingBox())!.height).toBeLessThanOrEqual(390)
  const landscape = (await popover.boundingBox())!
  expect(landscape.y).toBeGreaterThanOrEqual(0)
  expect(landscape.y + landscape.height).toBeLessThanOrEqual(390)
  expect((await grid.boundingBox())!.height).toBeLessThanOrEqual(170)
  const landscapeLayout = await geometry()
  await fixedLayout(landscapeLayout)
  await popover.getByRole('combobox', { name: 'Direction' }).selectOption('__all_directions__')
  await fixedLayout(landscapeLayout)
  await popover.getByRole('combobox', { name: 'Move' }).selectOption('__all_moves__')
  await fixedLayout(landscapeLayout)
  await popover.getByRole('switch').check()
  await fixedLayout(landscapeLayout)
  await popover.getByRole('switch').uncheck()
  await fixedLayout(landscapeLayout)
  await page.screenshot({ path: testInfo.outputPath('share-grid-landscape.png') })
  await popover.getByRole('combobox', { name: 'Move' }).selectOption('walk')
  await popover.getByRole('combobox', { name: 'Direction' }).selectOption('south')
  await page.setViewportSize({ width: 320, height: 390 })
  await expect(page.getByRole('button', { name: 'Share character' })).toBeVisible()
  await expect(page.getByRole('button', { name: 'Export', exact: true })).toBeVisible()
  await headerFits()
  expect((await popover.boundingBox())!.y + (await popover.boundingBox())!.height).toBeLessThanOrEqual(390)
  const shortLayout = await geometry()
  await fixedLayout(shortLayout)
  await popover.getByRole('combobox', { name: 'Direction' }).selectOption('__all_directions__')
  await fixedLayout(shortLayout)
  await popover.getByRole('combobox', { name: 'Move' }).selectOption('__all_moves__')
  await fixedLayout(shortLayout)
  await popover.getByRole('combobox', { name: 'Move' }).selectOption('walk')
  await popover.getByRole('combobox', { name: 'Direction' }).selectOption('south')
  await popover.getByRole('combobox', { name: 'Size' }).selectOption('10')
  await popover.getByRole('combobox', { name: 'Size' }).selectOption('2')
  await expect(popover.getByRole('button', { name: 'Download PNG' })).toBeEnabled()
  await expect(popover.locator('.share-resolution')).toHaveText('128 × 128 px')
  const [rapidPng] = await Promise.all([page.waitForEvent('download'), popover.getByRole('button', { name: 'Download PNG' }).click()])
  const rapidBytes = await readFile((await rapidPng.path())!)
  expect([rapidBytes.readUInt32BE(16), rapidBytes.readUInt32BE(20)]).toEqual([128, 128])
  await page.evaluate(() => {
    Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { write: () => Promise.reject(new DOMException('Clipboard permission denied', 'NotAllowedError')) } })
  })
  await popover.getByRole('button', { name: 'Copy PNG', exact: true }).click()
  await expect(popover.getByRole('status')).toHaveText('Could not copy PNG: Clipboard permission denied')
  await expect(popover.getByRole('button', { name: 'Copy PNG', exact: true })).toBeEnabled()
  await page.evaluate(() => { Object.defineProperty(navigator, 'clipboard', { configurable: true, value: undefined }) })
  await popover.getByRole('button', { name: 'Copy PNG', exact: true }).click()
  await expect(popover.getByRole('status')).toContainText('Image copying is unavailable')
  await page.setViewportSize({ width: 280, height: 390 })
  const wrapped = await geometry()
  expect(wrapped.direction[1]).toBeGreaterThanOrEqual(wrapped.move[1] + wrapped.move[3])
  expect(wrapped.animate[1]).toBeGreaterThanOrEqual(wrapped.size[1] + wrapped.size[3])
  expect(wrapped.popover[1]).toBeGreaterThanOrEqual(0)
  expect(wrapped.popover[1] + wrapped.popover[3]).toBeLessThanOrEqual(390)
  await popover.getByRole('button', { name: 'Download PNG' }).scrollIntoViewIfNeeded()
  const reachableDownload = (await popover.getByRole('button', { name: 'Download PNG' }).boundingBox())!
  expect(reachableDownload.y + reachableDownload.height).toBeLessThanOrEqual(390)
  await page.setViewportSize({ width: 390, height: 844 })
  await expect(page.locator('.header-export')).toBeVisible()
  await page.getByRole('button', { name: 'More options' }).click()
  await expect(page.getByRole('button', { name: 'Export game assets' })).toHaveCount(0)
  const disabledRedo = page.locator('.mobile-redo')
  await expect(disabledRedo).toBeDisabled()
  await noDisabledHover(page, disabledRedo)
  await page.getByRole('button', { name: 'Inspect all API calls' }).click()
  const disabledCopy = page.getByRole('button', { name: 'Copy all calls' })
  await expect(disabledCopy).toBeDisabled()
  await noDisabledHover(page, disabledCopy)
  expect(errors).toEqual([])
  expect(apiRequests).toEqual([])
})

test('Share choices reset to the current stage when switching characters', async ({ page, context }, testInfo) => {
  await context.route('https://api.pixellab.ai/**', route => route.abort())
  await context.addInitScript(() => { localStorage.setItem('pixeldoll.agentKey', 'off'); localStorage.setItem('pixeldoll.welcomed', '1') })
  await openStudio(page, testInfo.project.use.baseURL! + '/#/', { waitUntil: 'networkidle' })
  const trigger = page.getByRole('button', { name: 'Share character' })
  const popover = page.getByRole('dialog', { name: 'Share character preview' })
  const move = popover.getByRole('combobox', { name: 'Move' })
  const direction = popover.getByRole('combobox', { name: 'Direction' })
  const stageMove = page.getByRole('toolbar', { name: 'Preview controls' }).getByRole('combobox', { name: 'Move' })
  const stageDirection = () => page.getByRole('group', { name: 'Direction' }).locator('button[aria-pressed="true"]').getAttribute('aria-label').then(label => label!.replace('Face ', ''))
  await trigger.click()
  await move.selectOption('__all_moves__')
  await direction.selectOption('__all_directions__')
  await popover.getByRole('switch').uncheck()
  await popover.getByRole('combobox', { name: 'Size' }).selectOption('4')
  await page.keyboard.press('Escape')
  await page.getByRole('button', { name: 'Export', exact: true }).click()
  const download = page.waitForEvent('download')
  await page.getByRole('button', { name: /Download ZIP/ }).click()
  const bytes = await readFile((await (await download).path())!)
  await page.locator('.project-btn').click()
  await page.getByRole('menuitem', { name: 'Import character…', exact: true }).click()
  await page.getByLabel('Character ZIP', { exact: true }).setInputFiles({ name: 'share-memory.zip', mimeType: 'application/zip', buffer: bytes })
  await page.getByLabel('Character name', { exact: true }).fill('Share memory copy')
  await page.getByRole('checkbox', { name: 'Set up the pose rig next (recommended)' }).uncheck()
  await page.getByRole('button', { name: 'Import character', exact: true }).click()
  await expect(page.locator('.project-btn')).toContainText('Share memory copy', { timeout: 30_000 })
  await trigger.click()
  await expect(move).toHaveValue(await stageMove.inputValue())
  await expect(direction).toHaveValue(await stageDirection())
  await expect(popover.getByRole('switch')).toBeChecked()
  await expect(popover.getByRole('combobox', { name: 'Size' })).toHaveValue('1')
  await move.selectOption('__all_moves__')
  await direction.selectOption('__all_directions__')
  await page.keyboard.press('Escape')
  await page.locator('.project-btn').click()
  await page.getByRole('menuitemradio', { name: 'Adventurer (demo)', exact: true }).click()
  await expect(page.locator('.project-btn')).toContainText('Adventurer', { timeout: 30_000 })
  await trigger.click()
  await expect(move).toHaveValue(await stageMove.inputValue())
  await expect(direction).toHaveValue(await stageDirection())
  await expect(popover.getByRole('switch')).toBeChecked()
  await page.keyboard.press('Escape')
  await page.locator('.project-btn').click()
  await page.getByRole('menuitemradio', { name: 'Share memory copy', exact: true }).click()
  await expect(page.locator('.project-btn')).toContainText('Share memory copy', { timeout: 30_000 })
  await trigger.click()
  await expect(move).toHaveValue(await stageMove.inputValue())
  await expect(direction).toHaveValue(await stageDirection())
  await expect(popover.getByRole('switch')).toBeChecked()
})

test('export picker has accessible categories, local icons and a native GDevelop download on every layout', async ({ page, context }, testInfo) => {
  const apiRequests: string[] = []
  await context.route('https://api.pixellab.ai/**', (route) => {
    apiRequests.push(route.request().method())
    return route.abort()
  })
  await context.addInitScript(() => {
    localStorage.setItem('pixeldoll.agentKey', 'off')
    localStorage.setItem('pixeldoll.welcomed', '1')
    localStorage.setItem('pixeldoll.export.engine', 'unknown-engine')
  })
  const errors: string[] = []
  page.on('pageerror', (error) => errors.push(error.message))
  await openStudio(page, testInfo.project.use.baseURL! + '/#/', { waitUntil: 'networkidle' })
  await page.locator('.world-actors').first().waitFor()
  await page.getByRole('button', { name: 'Export', exact: true }).first().click()
  const dialog = page.getByRole('dialog')
  await expect(dialog.getByRole('group', { name: 'Export format' })).toBeVisible()
  await expect(dialog.getByRole('heading', { name: 'Engines and frameworks', exact: true })).toBeVisible()
  await expect(dialog.getByRole('heading', { name: 'Assets', exact: true })).toBeVisible()
  const radios = dialog.getByRole('radio')
  await expect(radios).toHaveCount(6)
  expect(await radios.evaluateAll((inputs) => inputs.map((input) => input.getAttribute('aria-label'))))
    .toEqual(['Godot', 'Unity', 'Phaser', 'GDevelop', 'Aseprite', 'PNG + JSON'])
  await expect(dialog.getByRole('radio', { name: 'Godot', exact: true })).toBeChecked()
  await dialog.getByRole('radio', { name: 'Godot', exact: true }).focus()
  await page.keyboard.press('ArrowRight')
  await expect(dialog.getByRole('radio', { name: 'Unity', exact: true })).toBeChecked()
  await expect(dialog.locator('#export-description')).toContainText('prefab')
  await page.keyboard.press('ArrowRight')
  await page.keyboard.press('ArrowRight')
  await expect(dialog.getByRole('radio', { name: 'GDevelop', exact: true })).toBeChecked()
  await expect(dialog.locator('#export-description')).toContainText('project')

  for (const id of ['godot', 'unity', 'phaser', 'gdevelop', 'aseprite', 'generic']) {
    const response = await page.request.get(new URL(`./icons/exports/${id}.svg`, await page.evaluate(() => document.baseURI)).href)
    expect(response.ok()).toBe(true)
    expect(await response.text()).toContain('<svg')
  }
  // Changing engines prepares a complete ZIP, including baked outfits, asynchronously.
  await expect(dialog.getByRole('button', { name: /Download ZIP/ })).toBeEnabled({ timeout: 30_000 })
  for (const viewport of [{ width: 1440, height: 900 }, { width: 390, height: 844 }, { width: 844, height: 390 }, { width: 768, height: 1024 }]) {
    await page.setViewportSize(viewport)
    await expect(dialog.getByRole('button', { name: /Download ZIP/ })).toBeVisible()
    expect(await dialog.evaluate((element) => element.scrollWidth <= element.clientWidth)).toBe(true)
    await dialog.getByRole('radio', { name: 'GDevelop', exact: true }).scrollIntoViewIfNeeded()
    await expect(dialog.getByRole('radio', { name: 'GDevelop', exact: true })).toBeVisible()
    if (viewport.width === 1440 || viewport.width === 390) {
      await page.screenshot({ path: testInfo.outputPath(`export-picker-${viewport.width}.png`) })
    }
  }
  const downloadButton = dialog.getByRole('button', { name: /Download ZIP/ })
  await expect(downloadButton).toBeEnabled()
  const [download] = await Promise.all([page.waitForEvent('download'), downloadButton.click()])
  expect(download.suggestedFilename()).toContain('-gdevelop.pixeldoll.zip')
  const entries = await unzip(new Uint8Array(await readFile((await download.path())!)))
  expect(entries.has('gdevelop/game.json')).toBe(true)
  expect(entries.has('project.json')).toBe(true)
  const nativeProject = JSON.parse(new TextDecoder().decode(entries.get('gdevelop/game.json')!)) as { layouts: unknown[]; resources: { resources: unknown[] } }
  expect(nativeProject.layouts.length).toBeGreaterThan(0)
  expect(nativeProject.resources.resources.length).toBeGreaterThan(0)
  expect(errors).toEqual([])
  expect(apiRequests).toEqual([])
})

test('a sheet whose code fails to load closes, says so and can be tried again', async ({ page, context }, testInfo) => {
  await context.route('https://api.pixellab.ai/**', (route) => route.abort())
  let fetches = 0
  await context.route(/\/ExportSheet-[\w-]+\.js$/, (route) => { fetches++; return route.abort() })
  await context.addInitScript(() => {
    localStorage.setItem('pixeldoll.agentKey', 'off')
    localStorage.setItem('pixeldoll.welcomed', '1')
  })
  await openStudio(page, testInfo.project.use.baseURL! + '/#/')
  const exportButton = page.getByRole('button', { name: 'Export', exact: true }).first()
  await exportButton.click()
  await expect(page.locator('.toast')).toHaveText('Part of PixelDoll could not load. Reload to try again.')
  await expect(page.locator('dialog[open]')).toHaveCount(0)
  const tried = fetches
  await exportButton.click()
  await expect.poll(() => fetches).toBeGreaterThan(tried)
  await expect(page.locator('dialog[open]')).toHaveCount(0)
})
