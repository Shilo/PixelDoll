import { openStudio, reloadStudio, enterStudio, equipmentMode, equipmentGroup, newItem, selectedItemDetails, inspectStage, openAccount, pickItem } from './immersive-helpers.ts'
import { expect, test, type Page } from '@playwright/test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { unzip, zip } from '../../src/lib/store/zip.ts'

test.beforeEach(async ({ context }) => {
  await context.route('https://*.pixellab.ai/**', route => route.abort()) // stay offline by default; a test's own route overrides this
})

declare global {
  interface Window {
    __queue?: { paused: string | null }
    __studio?: { ui: { selected: string } }
  }
}

async function expectDirectionGrid(page: Page, directions: (string | null)[], columns: number) {
  const grid = page.locator('.all-dirs')
  const cells = grid.locator(':scope > *')
  await expect(cells).toHaveCount(directions.length)
  const boxes = []
  for (const [i, direction] of directions.entries()) {
    const cell = cells.nth(i)
    await cell.scrollIntoViewIfNeeded()
    const stage = (await page.locator('.stage-art').boundingBox())!
    if (direction) {
      await expect(cell.getByRole('button', { name: `Show ${direction} only`, exact: true })).toBeVisible()
      await expect(cell.locator('canvas')).toHaveCount(1)
    } else {
      await expect(cell).toHaveAttribute('aria-hidden', 'true')
      await expect(cell).toBeEmpty()
    }
    const box = (await cell.boundingBox())!
    expect(box.x).toBeGreaterThanOrEqual(stage.x)
    expect(box.x + box.width).toBeLessThanOrEqual(stage.x + stage.width)
    expect(box.y).toBeGreaterThanOrEqual(stage.y)
    const toolbar = (await page.locator('.canvas-bar').boundingBox())!
    expect(box.y + box.height).toBeLessThanOrEqual(Math.min(stage.y + stage.height, toolbar.y) + 1)
    // The compact Inspect sheet deliberately scrolls. Compare compass geometry
    // in grid coordinates while verifying that every view remains reachable.
    const origin = (await grid.boundingBox())!, layout = { ...box, x: box.x - origin.x, y: box.y - origin.y }
    boxes.push(layout)
    if (i % columns) {
      expect(layout.y).toBeCloseTo(boxes[i - 1].y)
      expect(layout.x).toBeGreaterThan(boxes[i - 1].x + boxes[i - 1].width)
    }
    if (i >= columns) {
      expect(layout.x).toBeCloseTo(boxes[i - columns].x)
      expect(layout.y).toBeGreaterThan(boxes[i - columns].y + boxes[i - columns].height)
    }
  }
}

test('studio demo: dressing, storage, export and responsive controls', async ({ browser, context: ctx, page }, testInfo) => {
  const BASE = testInfo.project.use.baseURL!
  const unexpectedRequests: string[] = []
  const blockApi = async (context: import('@playwright/test').BrowserContext) => {
    await context.route('https://api.pixellab.ai/**', async (route) => {
      unexpectedRequests.push(route.request().method() + ' ' + new URL(route.request().url()).pathname)
      await route.abort()
    })
  }
  await blockApi(ctx)
  await ctx.addInitScript(() => { localStorage.setItem('pixeldoll.agentKey', 'off'); if (!sessionStorage.getItem('init')) { sessionStorage.setItem('init', '1'); localStorage.setItem('pixeldoll.welcomed', '1') } })
  const errors: string[] = []
  page.on('pageerror', (e) => { errors.push(e.message); console.log('pageerror', e.message) })
  page.on('console', (m) => { if (m.type() === 'error') console.log('console', m.text()) })
  await openStudio(page, `${BASE}/#/`, { waitUntil: 'networkidle' })
  await page.waitForSelector('.world-actors')
  const pressed = (name: string) => page.locator('.equipment-scroll').getByRole('button', { name, exact: true }).getAttribute('aria-pressed')
  const stage = () => page.locator('.world-actors').first().evaluate((c) => (c as HTMLCanvasElement).toDataURL())
  const step = (s: string) => console.log('ok', s)

  // pause playback so the stage is comparable
  await page.getByRole('button', { name: 'Pause', exact: true }).click()
  assert.equal(await pressed('Steel helmet'), 'true')
  await page.locator('.equipment-scroll .tile', { hasText: 'Wizard hat' }).click()
  assert.equal(await pressed('Wizard hat'), 'true')
  assert.equal(await pressed('Steel helmet'), 'false')
  step('wear swaps the item in the slot')

  await page.locator('.equipment-scroll .tile', { hasText: 'Wizard hat' }).click()
  assert.equal(await pressed('Wizard hat'), 'false')
  assert.equal(await pressed('None'), 'true')
  assert.equal(await page.locator('.sel-name').textContent(), 'Wizard hat')
  await page.locator('.equipment-scroll').getByRole('button', { name: 'None', exact: true }).click()
  await expect(page.locator('.header-undo')).toHaveAttribute('aria-label', 'Undo Take off Wizard hat')
  await page.locator('.equipment-scroll .tile', { hasText: 'Wizard hat' }).click()
  assert.equal(await pressed('Wizard hat'), 'true')
  step('tapping a worn item takes it off, tapping again wears it; None with nothing worn adds no undo step')

  for (let i = 0; i < 3; i++) await page.getByRole('button', { name: /^Undo/ }).click()
  assert.equal(await pressed('Steel helmet'), 'true')
  await page.keyboard.press('Control+Shift+Z')
  assert.equal(await pressed('Wizard hat'), 'true')
  step('undo / redo (button + shortcut)')

  const before = await stage()
  await equipmentMode(page, 'Colors')
  await page.locator('.colors .swatch[aria-label="azure"]').first().click()
  await expect.poll(stage).not.toBe(before)
  assert.equal(await page.locator('.colors .swatch[aria-label="azure"]').first().getAttribute('aria-checked'), 'true')
  step('recolor changes the stage pixels')

  await equipmentMode(page, 'Outfits')
  await page.locator('[aria-label="Save current look"]').click()
  await page.locator('input[aria-label="Outfit name"]').fill('Smoke look')
  await page.getByRole('button', { name: 'Save', exact: true }).click()
  await page.locator('.outfits .row', { hasText: 'Smoke look' }).waitFor()
  assert.ok(await page.locator('.outfits .row', { hasText: 'Smoke look' }).locator('.badge').isVisible())
  step('outfit saved and marked current')

  await inspectStage(page)
  await page.keyboard.press('2')
  assert.equal(await page.locator('.canvas-bar').getByRole('button', { name: 'Face east' }).getAttribute('aria-pressed'), 'true')
  await page.keyboard.press('0')
  assert.equal(await page.locator('.all-dirs canvas').count(), 4)
  await expectDirectionGrid(page, ['south', 'north', 'west', 'east'], 2)
  await page.keyboard.press('0')
  step('keyboard: direction + all directions')
  await page.getByRole('dialog', {name:'Inspect character',exact:true}).getByRole('button', {name:'Done',exact:true}).click()

  await page.getByRole('button', { name: 'More options', exact: true }).click()
  await page.getByRole('button', { name: 'Light mode', exact: true }).click()
  assert.equal(await page.evaluate(() => document.documentElement.dataset.theme), 'light')
  step('theme switch')

  await reloadStudio(page, { waitUntil: 'networkidle' })
  await page.waitForSelector('.world-actors')
  assert.equal(await pressed('Wizard hat'), 'true')
  await equipmentMode(page, 'Outfits')
  assert.ok(await page.locator('.outfits .row', { hasText: 'Smoke look' }).isVisible())
  assert.equal(await page.evaluate(() => document.documentElement.dataset.theme), 'light')
  step('outfit, colors, presets and theme survive a reload')

  await page.getByRole('button', { name: 'Export' }).first().click()
  const dl = page.getByRole('button', { name: /Download ZIP · \d+ KB/ })
  await dl.waitFor()
  const [download] = await Promise.all([page.waitForEvent('download'), dl.click()])
  const bytes = readFileSync((await download.path())!)
  assert.equal(bytes.subarray(0, 2).toString(), 'PK')
  for (const f of ['manifest.json', 'godot/', 'layers/head/hat_wizard/']) assert.ok(bytes.includes(Buffer.from(f)), `zip has ${f}`)
  step(`export ${download.suggestedFilename()} ${Math.round(bytes.length / 1024)} KB`)

  // zip names (stored uncompressed in the zip headers)
  for (const f of ['README.txt', 'CREDITS.txt', 'godot/README.txt']) assert.ok(bytes.includes(Buffer.from(f)), `zip has ${f}`)
  assert.ok(download.suggestedFilename().startsWith('adventurer-'), download.suggestedFilename())
  await page.waitForFunction(() => !document.querySelector('dialog[open]') && document.querySelector('.toast')?.textContent?.startsWith('Downloaded'))

  // ---- B15: base colors, Create options, offline banner ----
  await equipmentMode(page, 'Colors')
  assert.deepEqual((await page.locator('.equipment-scroll .colors .mat > .muted').allTextContents()).slice(0, 3), ['Shirt', 'Shorts', 'Skin'])
  step('base colors: Shirt, Shorts and Skin recolor separately')
  await page.locator('.project-btn').click()
  await page.getByRole('menuitem', { name: 'New character…' }).click()
  const cost = async () => {
    const value = await page.locator('dialog .foot-note').textContent()
    assert.ok(value, 'Create cost is shown')
    return value
  }
  const eight = await cost()
  assert.equal(await page.getByRole('button', { name: 'Top-down 8', exact: true }).getAttribute('aria-pressed'), 'true')
  assert.equal(await page.getByRole('spinbutton', { name: 'Body size', exact: true }).inputValue(), '64')
  await page.getByRole('button', { name: 'Top-down 4', exact: true }).click()
  assert.equal(await cost(), eight) // creation draws every view once and animates none: directions do not change its price
  await page.getByRole('button', { name: '96', exact: true }).click()
  assert.equal(await page.getByRole('spinbutton', { name: 'Frame size', exact: true }).inputValue(), '128')
  assert.notEqual(await cost(), eight) // the draw is priced by body size
  await page.keyboard.press('Escape')
  await page.waitForFunction(() => !document.querySelector('dialog[open]'))
  step('Create: visible size and direction controls update frame and full generation cost')
  await ctx.setOffline(true)
  await page.locator('.offline-banner', { hasText: 'You’re offline' }).waitFor()
  await page.waitForFunction(() => !window.__queue || window.__queue.paused === 'offline') // __queue/__studio are dev-server only
  await pickItem(page, 'Wizard hat') // everything else still works (selects the worn hat)
  assert.equal(await page.evaluate(() => window.__studio?.ui.selected ?? 'hat_wizard'), 'hat_wizard')
  await ctx.setOffline(false)
  await page.locator('.offline-banner').waitFor({ state: 'detached' })
  await page.waitForFunction(() => !window.__queue || window.__queue.paused === null)
  step('offline: banner + queue paused, back online: banner gone, queue resumed')

  // ---- B10: sheets ----
  // T1 P0: Create without a key -> the Connect sheet replaces it (8afef4f)
  await page.locator('.project-btn').click()
  await page.getByRole('menuitem', { name: 'New character…' }).click()
  await expect(page.locator('dialog').getByLabel('Name', { exact: true })).toBeFocused() // first field focused, not Cancel (checked before fill() moves focus)
  await page.locator('dialog textarea').fill('a cheerful elf archer')
  await page.locator('dialog').getByRole('button', { name: /^Create/ }).click()
  await page.waitForFunction(() => document.querySelector('dialog[open] h2')?.textContent === 'Connect PixelLab')
  step('Create without a key opens Connect (P0 sheet chaining)')
  await page.keyboard.press('Escape')
  await page.waitForFunction(() => !document.querySelector('dialog[open]'))
  assert.ok(await page.evaluate(() => document.activeElement?.classList.contains('project-btn')), 'focus back on the menu button')
  step('Esc closes, focus returns to the opener (P2-3)')
  await page.getByRole('button', { name: 'Export' }).first().click()
  await page.locator('dialog[open]').waitFor()
  await page.goBack()
  await page.waitForFunction(() => !document.querySelector('dialog[open]'))
  assert.ok(page.url().startsWith(BASE), page.url())
  step('browser back closes the sheet, stays in the app (P2-2)')

  // ---- B10: move views (T1 P1-1) ----
  await inspectStage(page)
  await page.locator('.canvas-bar select').selectOption('cross-punch')
  for (const d of ['east', 'north', 'west']) assert.ok(await page.locator('.canvas-bar').getByRole('button', { name: `Face ${d}` }).isDisabled(), `cross punch ${d} disabled`)
  assert.equal(await page.locator('.canvas-bar').getByRole('button', { name: 'Face south' }).getAttribute('aria-pressed'), 'true')
  await page.getByRole('button', { name: 'All directions', exact: true }).click()
  await expectDirectionGrid(page, ['south'], 1)
  await page.getByRole('button', { name: 'Show south only', exact: true }).click()
  await page.locator('.canvas-bar select').selectOption('walk')
  await page.locator('.canvas-bar').getByRole('button', { name: 'Face north' }).click()
  await page.locator('.stage-note', { hasText: 'Wizard hat' }).waitFor()
  assert.ok(await page.locator('.stage-note').getByRole('button', { name: 'Make your own' }).isVisible())
  await page.locator('.canvas-bar').getByRole('button', { name: 'Face south' }).click()
  assert.equal(await page.locator('.stage-note').count(), 0)
  step('cross punch is south only; a worn item without north frames is called out (P1-1)')

  // ---- T2: arrow keys in segmented controls; dev rigs out of the character list ----
  await page.locator('.canvas-bar').getByRole('button', { name: 'Face south' }).focus()
  await page.keyboard.press('ArrowRight')
  assert.equal(await page.locator('.canvas-bar').getByRole('button', { name: 'Face east' }).getAttribute('aria-pressed'), 'true')
  assert.ok(await page.evaluate(() => document.activeElement?.getAttribute('aria-label') === 'Face east'))
  step('arrow keys move the direction segmented control')
  await page.getByRole('dialog', {name:'Inspect character',exact:true}).getByRole('button', {name:'Done',exact:true}).click()
  const idb = (put: { id: string; savedAt: string; manifest: { format: string; name: string }; rigQa: { pivotFrom: string } } | null) => page.evaluate(async (put) => {
    const q = indexedDB.open('pixeldoll')
    const db = await new Promise<IDBDatabase>((resolve, reject) => { q.onsuccess = () => resolve(q.result); q.onerror = () => reject(q.error) })
    const t = db.transaction('projects', 'readwrite')
    if (put) t.objectStore('projects').put(put, put.id); else t.objectStore('projects').delete('rig-e2edevrig00')
    await new Promise<void>((resolve, reject) => { t.oncomplete = () => resolve(); t.onabort = () => reject(t.error) })
    db.close()
  }, put)
  await idb({ id: 'rig-e2edevrig00', savedAt: '', manifest: { format: 'pixeldoll/1', name: 'E2E dev rig' }, rigQa: { pivotFrom: 'idle/south/0' } })
  await page.locator('.project-btn').click()
  await page.locator('#project-menu summary', { hasText: 'Developer rigs' }).waitFor()
  assert.equal(await page.locator('#project-menu > .menu-surface > .row', { hasText: 'E2E dev rig' }).count(), 0)
  assert.equal(await page.locator('#project-menu .dev-rigs .row', { hasText: 'E2E dev rig' }).isVisible(), false)
  await page.keyboard.press('Escape')
  await idb(null)
  step('dev rigs (no Studio origin) sit in a closed "Developer rigs" group, not in the character list')

  // ---- B10: other sizes (fresh contexts: own storage) ----
  async function at(viewport: { width: number; height: number }, fn: (page: Page) => Promise<void>) {
    const c = await browser.newContext({ viewport, deviceScaleFactor: 2, isMobile: true, hasTouch: true })
    await blockApi(c)
    await c.addInitScript(() => { localStorage.setItem('pixeldoll.welcomed', '1'); localStorage.setItem('pixeldoll.agentKey', 'off') })
    const p = await c.newPage()
    p.on('pageerror', (e) => errors.push(e.message))
    await openStudio(p, `${BASE}/#/`, { waitUntil: 'networkidle' })
    await p.waitForSelector('.world-actors')
    await fn(p)
    await c.close()
  }
  for (const [name, vp] of [['phone', { width: 375, height: 812 }], ['landscape', { width: 812, height: 375 }]] as const)
    await at(vp, async (p) => {
      if (await p.locator('.header-redo').isVisible()) await expect(p.locator('.header-redo')).toBeVisible()
      else {
        await p.getByRole('button', { name: 'More options', exact: true }).click()
        await expect(p.locator('#experience-options').getByRole('button', { name: /^Redo/ })).toBeVisible()
        await p.keyboard.press('Escape')
      }
      await p.getByRole('button', { name: 'Random look' }).click()
      assert.ok(await p.getByRole('button', { name: /^Undo Random look/ }).isEnabled(), `${name}: random look`)
      await equipmentMode(p, 'Outfits')
      await p.getByRole('button', { name: 'Save current look' }).click()
      await p.locator('input[aria-label="Outfit name"]').fill('Phone look')
      await p.getByRole('button', { name: 'Save', exact: true }).click()
      await p.locator('.row', { hasText: 'Phone look' }).waitFor()
      step(`${name}: Outfits, Random look and Redo reachable (P1-2)`)
    })
  await at({ width: 768, height: 1024 }, async (p) => {
    assert.ok(await p.locator('.tiles').isVisible(), 'tablet: wardrobe tiles visible')
    const box = await p.locator('.world-stage').boundingBox(), rail = await p.locator('.equipment-rail').boundingBox()
    assert.ok(box && rail && (box.x + box.width <= rail.x + 1 || box.y + box.height <= rail.y + 1), `tablet: preview and wardrobe do not overlap ${JSON.stringify({ box, rail })}`)
    await equipmentGroup(p, 'Head')
    await p.locator('.tile', { hasText: 'Steel helmet' }).click()
    assert.equal(await p.locator('.drawer, .drawer-scrim').count(), 0)
    step('tablet portrait: preview and wardrobe remain separate, nothing covers the character (P1-3)')
  })

  // ---- B17: agent mode (npm run dev:agent) auto-connects; keyless servers show Connect and no badge ----
  {
    const c = await browser.newContext({ viewport: { width: 1440, height: 900 } })
    await c.addInitScript(() => { localStorage.setItem('pixeldoll.welcomed', '1'); localStorage.setItem('pixeldoll.agentKey', 'off') })
    const p = await c.newPage()
    p.on('pageerror', (e) => errors.push(e.message))
    await openStudio(p, `${BASE}/#/`, { waitUntil: 'networkidle' })
    await p.waitForSelector('.world-actors')
    if (await p.locator('.agent-badge').count()) {
      step('agent server badge is visible')
    } else {
      await openAccount(p)
      await p.waitForFunction(() => document.querySelector('dialog[open] h2')?.textContent === 'Connect PixelLab')
      assert.equal(await p.locator('dialog[open] [data-testid=dev-key], dialog[open] button', { hasText: /dev key/i }).count(), 0)
      step('keyless server: no agent badge, Connect sheet has no dev-key option')
    }
    await c.close()
  }

  assert.deepEqual(errors, [])
  assert.deepEqual(unexpectedRequests, [], 'demo tests must never call the paid API')
})

// IndexedDB writes started while a page unloads may never finish, so an edit inside the 400 ms autosave delay must survive.
test('an outfit edit survives an immediate reload inside the autosave delay', async ({ page }) => {
  await page.route('https://*.pixellab.ai/**', (route) => route.abort())
  await page.addInitScript(() => { localStorage.setItem('pixeldoll.agentKey', 'off'); localStorage.setItem('pixeldoll.welcomed', '1') })
  await openStudio(page, '/#/')
  const hat = page.locator('.equipment-scroll').getByRole('button', { name: 'Wizard hat', exact: true })
  const worn = (await hat.getAttribute('aria-pressed')) === 'true' ? 'false' : 'true'
  await page.locator('.equipment-scroll .tile', { hasText: 'Wizard hat' }).click()
  await expect(hat).toHaveAttribute('aria-pressed', worn)
  // A page-initiated reload 20 ms later lost the edit every time before the localStorage snapshot (page.reload() did not).
  const loaded = page.waitForEvent('load')
  // A snapshot of a character deleted in another tab is swept when the character list loads.
  await page.evaluate(() => { localStorage.setItem('pixeldoll.unsaved.rig-deleted-elsewhere', '{}'); setTimeout(() => location.reload(), 20) })
  await loaded; await enterStudio(page)
  await expect(hat).toHaveAttribute('aria-pressed', worn)
  expect(await page.evaluate(() => Object.keys(localStorage).filter((k) => k.startsWith('pixeldoll.unsaved.')))).toEqual([]) // saved, then cleared
})

// The unload snapshot replaces the saved dress state (never merges it), so a reset or removal survives too.
test('a color reset survives an immediate reload inside the autosave delay', async ({ page }) => {
  await page.route('https://*.pixellab.ai/**', (route) => route.abort())
  await page.addInitScript(() => { localStorage.setItem('pixeldoll.agentKey', 'off'); localStorage.setItem('pixeldoll.welcomed', '1') })
  await openStudio(page, '/#/')
  const azure = () => page.locator('.colors .swatches').filter({ has: page.locator('[aria-label="azure"]') }).first().locator('[aria-label="azure"]')
  await equipmentMode(page, 'Colors')
  await azure().click()
  await expect(azure()).toHaveAttribute('aria-checked', 'true')
  await reloadStudio(page) // azure is now the saved state (openProject awaits the save)
  await equipmentMode(page, 'Colors')
  await expect(azure()).toHaveAttribute('aria-checked', 'true')
  await page.locator('.colors .swatches').filter({ has: page.locator('[aria-label="azure"]') }).first().locator('.swatch').first().click()
  await expect(azure()).toHaveAttribute('aria-checked', 'false')
  const loaded = page.waitForEvent('load')
  await page.evaluate(() => { setTimeout(() => location.reload(), 20) })
  await loaded; await enterStudio(page)
  await equipmentMode(page, 'Colors')
  await expect(azure()).toHaveAttribute('aria-checked', 'false')
})

test('Inspector animation stays stable and eight-direction previews fit the panel', async ({ page }) => {
  await page.route('https://api.pixellab.ai/**', (route) => route.abort())
  await page.addInitScript(() => { localStorage.setItem('pixeldoll.agentKey', 'off'); localStorage.setItem('pixeldoll.welcomed', '1') })
  await openStudio(page, '/#/')
  await newItem(page, 'Head')
  await page.getByRole('button', { name: 'Copy the demo body', exact: true }).click()
  await page.getByRole('textbox', { name: 'What is it?', exact: true }).waitFor()
  await page.getByRole('button', { name: 'Cancel', exact: true }).click()
  await pickItem(page, 'Red cape')
  let inspector = await selectedItemDetails(page)
  async function checkFrames() {
    const geometry: string[] = [], pixels: string[] = []
    for (let frame = 0; frame < 8; frame++) {
      await page.waitForTimeout(110) // Authored playback continues while the item sheet is open.
      // One browser call per sample (it was ~12 round trips): the same boxes, read in the same instant.
      const sample = await inspector.evaluate((sheet) => {
        const box = (el: Element) => { const r = el.getBoundingClientRect(); return { x: r.x, y: r.y, width: r.width, height: r.height } }
        const strip = sheet.querySelector('.dir-strip')!, sprites = [...strip.querySelectorAll('canvas')]
        return { strip: box(strip), actions: box(sheet.querySelector('.actions')!), sprites: sprites.map(box), pixels: sprites[0].toDataURL() }
      })
      geometry.push(JSON.stringify(sample.strip), JSON.stringify(sample.actions))
      pixels.push(sample.pixels)
      // getBoundingClientRect gives a hidden element a zero box (boundingBox() gave null), so require real size.
      for (const b of [sample.strip, ...sample.sprites]) expect(b.width * b.height).toBeGreaterThan(0)
      for (const b of sample.sprites) {
        expect(b.x).toBeGreaterThanOrEqual(sample.strip.x)
        expect(b.x + b.width).toBeLessThanOrEqual(sample.strip.x + sample.strip.width)
      }
    }
    expect(new Set(geometry.filter((_, i) => i % 2 === 0)).size).toBe(1)
    expect(new Set(geometry.filter((_, i) => i % 2 === 1)).size).toBe(1)
    expect(new Set(pixels).size).toBeGreaterThan(1)
  }
  await checkFrames()
  await inspector.getByRole('button', { name: 'Remove', exact: true }).click()
  await inspector.getByRole('button', { name: 'Done', exact: true }).click()
  await pickItem(page, 'Steel helmet')
  inspector = await selectedItemDetails(page)
  await expect(inspector.getByRole('button', { name: 'Remove for good', exact: true })).toHaveCount(0)

  await inspector.getByRole('button', { name: 'Done', exact: true }).click()

  // Disposable layout fixture: duplicate stored east artwork into the extra directions, without generation.
  await page.getByRole('button', { name: 'Export', exact: true }).click()
  const download = page.waitForEvent('download')
  await page.getByRole('button', { name: /Download ZIP/ }).click()
  const files = await unzip(new Uint8Array(readFileSync((await (await download).path())!)))
  const data = JSON.parse(new TextDecoder().decode(files.get('project.json')))
  data.manifest.rig.directions = ['south', 'south-east', 'east', 'north-east', 'north', 'north-west', 'west', 'south-west'].map((id) => ({ id }))
  for (const it of data.manifest.items) for (const layer of it.layers) for (const dirs of Object.values(layer.cells ?? {}) as Record<string, unknown>[]) {
    for (const dir of ['south-east', 'north-east', 'north-west', 'south-west', 'west']) dirs[dir] = dirs.east ?? dirs.south
  }
  files.set('project.json', new TextEncoder().encode(JSON.stringify(data)))
  const bytes = await zip([...files].map(([name, data]) => ({ name, data })))
  await page.locator('.project-btn').click()
  await page.getByRole('menuitem', { name: 'Import character…', exact: true }).click()
  await page.getByLabel('Character ZIP', { exact: true }).setInputFiles({ name: 'eight-directions.zip', mimeType: 'application/zip', buffer: Buffer.from(bytes) })
  await page.getByRole('img', { name: 'Character import preview' }).waitFor()
  const setup = page.getByRole('checkbox', { name: /Set up the pose rig next/ })
  if (await setup.count()) await setup.uncheck()
  await page.getByRole('button', { name: 'Import character', exact: true }).click()
  await pickItem(page, 'Red cape')
  inspector = await selectedItemDetails(page)
  await expect(inspector.locator('.dir-strip canvas')).toHaveCount(8)
  await checkFrames()
  await inspector.getByRole('button', { name: 'Done', exact: true }).click()
  await inspectStage(page)
  await page.getByRole('button', { name: 'All directions', exact: true }).click()
  for (const viewport of [{ width: 1440, height: 900 }, { width: 900, height: 768 }, { width: 375, height: 812 }, { width: 812, height: 375 }]) {
    await page.setViewportSize(viewport)
    await expectDirectionGrid(page, ['north-west', 'north', 'north-east', 'west', null, 'east', 'south-west', 'south', 'south-east'], 3)
  }
  await page.getByRole('button', { name: 'Show east only', exact: true }).click()
  await expect(page.locator('.all-dirs')).toHaveCount(0)
  await expect(page.locator('.stage-art [role="img"]')).toHaveAttribute('aria-label', /facing east/)
  // At the smallest desktop breakpoint both sidebars leave only 476px for the stage.
  // The toolbar itself fitted before this fix, but its Move label collapsed and overlapped the directions.
  await page.setViewportSize({ width: 900, height: 768 })
  const controls = page.locator('.canvas-bar')
  await expect(controls.getByRole('combobox', { name: 'Direction', exact: true })).toBeVisible()
  const moveBox = (await controls.getByRole('combobox', { name: 'Move', exact: true }).boundingBox())!
  const dirBox = (await controls.getByRole('combobox', { name: 'Direction', exact: true }).boundingBox())!
  expect(moveBox.width).toBeGreaterThan(50)
  expect(moveBox.x + moveBox.width).toBeLessThanOrEqual(dirBox.x)
  await page.setViewportSize({ width: 1440, height: 560 }) // Constrain the modal so its details actually need scrolling.
  inspector = await selectedItemDetails(page)
  const header = inspector.locator('.sheet-head'), top = (await header.boundingBox())!.y
  const content = inspector.locator('.sheet-body')
  await content.hover()
  await page.mouse.wheel(0, 2000)
  await expect.poll(() => content.evaluate(el => el.scrollTop)).toBeGreaterThan(0)
  expect((await header.boundingBox())!.y).toBe(top)
  await inspector.getByRole('button', { name: 'Done', exact: true }).click()
  await pickItem(page, 'Wizard hat')
  await inspectStage(page)
  await page.setViewportSize({ width: 390, height: 844 })
  await page.getByRole('button', { name: 'All directions', exact: true }).click()
  const warning = page.locator('.stage-note')
  await expect(warning).toBeVisible()
  const warningBox = (await warning.boundingBox())!
  const firstView = (await page.getByRole('button', { name: 'Show north-west only', exact: true }).boundingBox())!
  expect(firstView.y).toBeGreaterThanOrEqual(warningBox.y + warningBox.height)
  const art = page.locator('.stage-art')
  await art.hover()
  await page.mouse.wheel(0, 1000)
  const toolbar = (await page.locator('.canvas-bar').boundingBox())!
  await expect.poll(async () => {
    const lastView = (await page.getByRole('button', { name: 'Show south-east only', exact: true }).boundingBox())!
    return lastView.y + lastView.height
  }).toBeLessThanOrEqual(toolbar.y)
})

test('desktop resize keeps preview controls and customization reachable across panels', async ({ page }) => {
  await page.addInitScript(() => { localStorage.setItem('pixeldoll.agentKey', 'off'); localStorage.setItem('pixeldoll.welcomed', '1') })
  await openStudio(page, '/#/')
  for (const viewport of [{width:700,height:650},{width:600,height:600},{width:1440,height:900}]) {
    await page.setViewportSize(viewport)
    for (const mode of ['Wardrobe','Colors','Outfits','Moves'] as const) {
      await equipmentMode(page, mode)
      await expect(page.locator('.equipment-rail')).toBeVisible()
      const controls = (await page.getByRole('toolbar', {name:'Preview controls'}).boundingBox())!
      expect(controls.x).toBeGreaterThanOrEqual(0)
      expect(controls.x+controls.width).toBeLessThanOrEqual(viewport.width)
      expect(controls.y+controls.height).toBeLessThanOrEqual(viewport.height)
    }
    await equipmentMode(page, 'Wardrobe')
    await pickItem(page, 'Steel helmet')
    const item = await selectedItemDetails(page)
    await expect(item.locator('.insp-title')).toHaveText('Steel helmet')
    await item.getByRole('button', {name:'Done',exact:true}).click()
  }
})

test('canceling Connect preserves generation drafts and discards the pending action', async ({ page }) => {
  const paidRequests: string[] = []
  await page.route('https://api.pixellab.ai/**', async (route) => {
    if (route.request().method() === 'GET' && new URL(route.request().url()).pathname === '/v2/balance') {
      await route.fulfill({ json: { subscription: { type: 'generations', status: 'active', generations: 42, total: 100 }, credits: { usd: 0 } } })
    } else { paidRequests.push(route.request().method() + ' ' + new URL(route.request().url()).pathname); await route.abort() }
  })
  await page.addInitScript(() => { localStorage.setItem('pixeldoll.agentKey', 'off'); localStorage.setItem('pixeldoll.welcomed', '1') })
  await openStudio(page, '/#/')
  await newItem(page, 'Head')
  await page.getByRole('button', { name: 'Copy the demo body', exact: true }).click()
  const item = page.getByRole('dialog', { name: 'New item', exact: true })
  await item.getByRole('radio', { name: 'Held item', exact: true }).click()
  await item.getByRole('textbox', { name: 'What is it?', exact: true }).fill('a silver sword')
  await item.getByRole('radio', { name: 'azure', exact: true }).click()
  await expect(item.getByRole('button', { name: /^Make/ })).toContainText(/Est\. \d+ gens/)
  await expect(item.getByText('PixelLab may bill some calls in dollars. Retries and fallbacks cost extra; queue time varies.', { exact: true })).toBeVisible()
  await item.getByRole('button', { name: /^Make/ }).click()
  await page.getByRole('dialog', { name: 'Connect PixelLab' }).getByRole('button', { name: 'Cancel', exact: true }).click()
  await newItem(page, 'Head')
  await expect(item.getByRole('textbox', { name: 'What is it?', exact: true })).toHaveValue('a silver sword')
  await expect(item.getByRole('radio', { name: 'Held item', exact: true })).toHaveAttribute('aria-checked', 'true')
  await expect(item.getByRole('radio', { name: 'azure', exact: true })).toHaveAttribute('aria-checked', 'true')
  await item.getByRole('button', { name: 'Cancel', exact: true }).click()

  await page.locator('.project-btn').click()
  await page.getByRole('menuitem', { name: 'New character…', exact: true }).click()
  const character = page.getByRole('dialog', { name: 'New character', exact: true })
  await character.getByRole('textbox', { name: 'Details', exact: true }).fill('a cheerful elf archer')
  await character.getByRole('combobox', { name: 'Build', exact: true }).selectOption('Broad')
  await character.getByRole('button', { name: 'Top-down 8', exact: true }).click()
  await character.getByRole('button', { name: '96', exact: true }).click()
  await character.getByRole('textbox', { name: 'Name', exact: true }).fill('Archer draft')
  await character.getByRole('button', { name: /^Create/ }).click()
  await expect(page.getByRole('dialog', { name: 'Connect PixelLab' })).toBeVisible()
  await page.goBack()
  await page.locator('.project-btn').click()
  await page.getByRole('menuitem', { name: 'New character…', exact: true }).click()
  await expect(character.getByRole('textbox', { name: 'Details', exact: true })).toHaveValue('a cheerful elf archer')
  await expect(character.getByRole('combobox', { name: 'Build', exact: true })).toHaveValue('Broad')
  await expect(character.getByRole('button', { name: 'Top-down 8', exact: true })).toHaveAttribute('aria-pressed', 'true')
  await expect(character.getByRole('button', { name: '96', exact: true })).toHaveAttribute('aria-pressed', 'true')
  await expect(character.getByRole('textbox', { name: 'Name', exact: true })).toHaveValue('Archer draft')
  await character.getByRole('button', { name: 'Cancel', exact: true }).click()

  // Connecting later must not start the character generation canceled above.
  await openAccount(page)
  const connect = page.getByRole('dialog', { name: 'Connect PixelLab' })
  await connect.getByLabel('API key', { exact: true }).fill('synthetic-manual-qa-key')
  await connect.getByRole('button', { name: 'Connect', exact: true }).click()
  await page.locator('.project-btn').click()
  await expect(page.getByRole('menuitem', {name:'PixelLab account',exact:true})).toContainText('42 gens')
  await page.keyboard.press('Escape')
  await expect(page.getByRole('dialog')).toHaveCount(0)
  expect(paidRequests).toEqual([])
  await page.locator('.project-btn').click()
  await page.getByRole('menuitem', { name: 'Character selection', exact: true }).click()
  await page.locator('.character-rows .character-row').filter({hasText:'Demo character'}).click()
  await page.locator('.customize-action').click()
  await expect(page.locator('.project-btn')).toHaveText('Adventurer')
})

test('closing Connect before its code loads still discards the pending action', async ({ page }) => {
  const paidRequests: string[] = []
  await page.route('https://api.pixellab.ai/**', async (route) => {
    if (route.request().method() === 'GET' && new URL(route.request().url()).pathname === '/v2/balance') {
      await route.fulfill({ json: { subscription: { type: 'generations', status: 'active', generations: 42, total: 100 }, credits: { usd: 0 } } })
    } else { paidRequests.push(route.request().method() + ' ' + new URL(route.request().url()).pathname); await route.abort() }
  })
  // Hold the Connect sheet's chunk so the sheet closes before ConnectSheet ever mounts.
  let release!: () => void, connectFetches = 0
  const held = new Promise<void>((resolve) => { release = resolve })
  await page.route(/\/ConnectSheet-[\w-]+\.js$/, async (route) => { connectFetches++; await held; await route.continue() })
  await page.addInitScript(() => { localStorage.setItem('pixeldoll.agentKey', 'off'); localStorage.setItem('pixeldoll.welcomed', '1') })
  await openStudio(page, '/#/')
  await page.locator('.project-btn').click()
  await page.getByRole('menuitem', { name: 'New character…', exact: true }).click()
  const character = page.getByRole('dialog', { name: 'New character', exact: true })
  await character.getByRole('textbox', { name: 'Details', exact: true }).fill('a cheerful elf archer')
  await character.getByRole('textbox', { name: 'Name', exact: true }).fill('Archer draft')
  await character.getByRole('button', { name: /^Create/ }).click()
  await expect(page.getByRole('dialog')).toHaveCount(0)
  await expect.poll(() => connectFetches).toBeGreaterThan(0)
  await page.goBack()
  release()

  // Connecting later must not start the character generation abandoned above.
  await openAccount(page)
  const connect = page.getByRole('dialog', { name: 'Connect PixelLab' })
  await connect.getByLabel('API key', { exact: true }).fill('synthetic-manual-qa-key')
  await connect.getByRole('button', { name: 'Connect', exact: true }).click()
  await expect(page.getByRole('dialog')).toHaveCount(0) // a revived action would open its progress sheet here
  await page.locator('.project-btn').click()
  await expect(page.getByRole('menuitem', { name: 'PixelLab account', exact: true })).toContainText('42 gens')
  await page.keyboard.press('Escape')
  expect(paidRequests).toEqual([])
})

// CI shards are contiguous slices of the test order. This heavy test (about 28 s) is registered among light tests, away
// from its two stale-review variants at the end and from the studio demo and Inspector tests above; heavy neighbors share
// one slow shard (docs/testing/test-performance.md).
test('free item color matching is offline, scoped, persistent and preserves saved recolors and warnings', async ({ page, context }, info) => {
  const requests: string[] = []
  context.on('request', r => { if (r.url().startsWith('https://api.pixellab.ai/')) requests.push(r.method()) })
  await context.route('https://api.pixellab.ai/**', r => r.abort())
  await page.addInitScript(() => { localStorage.setItem('pixeldoll.agentKey', 'off'); localStorage.setItem('pixeldoll.welcomed', '1') })
  await openStudio(page, info.config.projects.find(p => p.name === 'browser-selftests')!.use.baseURL!)
  const fixture = await freePaletteFixture(page, true), pane = await selectedItemDetails(page)
  const eligibility = await page.evaluate(async id => { const p = '/src/studio/state.svelte.ts', s = await import(p), item = s.store.project.manifest.items.find((it: { id: string }) => it.id === id); return { route: item.route, key: item.key, dressed: !!item.dressed.west, frames: s.store.project.manifest.rig.animations.find((a: { id: string }) => a.id === 'walk').sources.west.keypoints.length, shared: !!item.design } }, fixture.itemId)
  expect(eligibility).toMatchObject({ route: 'skeleton-pose', key: 'green', dressed: true, frames: 8, shared: true })
  await expect(pane.getByRole('button', { name: /^Try new item frames/ })).toHaveCount(0)
  await expect(pane.getByRole('button', { name: 'View saved design', exact: true })).toBeVisible()
  const action = pane.getByRole('button', { name: /^Match item colors.*Free$/ })
  await expect(action).toBeVisible()
  await expect(pane).toContainText('Match 2 pixels in 2 saved Walk frames facing west')
  await expect(pane).toContainText('2 unmatched eligible pixels stay unchanged')
  await expect(pane).toContainText('No PixelLab call is made')
  await context.setOffline(true)
  await action.click()
  await expect(pane.getByText('Matched 2 pixels in 2 frames.', { exact: true })).toBeVisible()
  await expect(action).toHaveCount(0)
  await page.evaluate(async () => { const p = '/src/studio/state.svelte.ts', s = await import(p); s.doc.rev++ })
  await expect(pane.getByText('Matched 2 pixels in 2 frames.', { exact: true })).toBeVisible()
  await context.setOffline(false)
  const after = await page.evaluate(async id => {
    const p = '/src/studio/state.svelte.ts', s = await import(p), projectPath = '/src/lib/store/project.ts', projectModule = await import(projectPath)
    const ctx = await projectModule.loadProject(s.doc.id), item = ctx.rec.manifest.items.find((it: { id: string }) => it.id === id), image = ctx.project.images.get(item.layers[0].cells.walk.west[0])
    const unscoped = structuredClone(item.layers); for (const layer of unscoped) delete layer.cells.walk.west
    return { materials: ctx.rec.manifest.materials, presets: ctx.rec.manifest.presets, variants: s.doc.variants, qa: item.qa, warnings: item.designWarnings, provenance: item.provenance, rig: ctx.rec.manifest.rig, unscoped, pixels: [...image.data.slice((40 * 96 + 40) * 4, (40 * 96 + 44) * 4)], audit: item.paletteRepairs, selected: s.ui.selected, anim: s.ui.anim, dir: s.ui.dir }
  }, fixture.itemId)
  for (const key of ['materials', 'presets', 'variants', 'qa', 'warnings', 'provenance', 'rig', 'unscoped'] as const) expect(after[key]).toEqual(fixture[key])
  expect(after.pixels).toEqual([128, 128, 128, 255, 240, 240, 240, 255, 192, 128, 96, 255, 16, 16, 16, 255])
  expect(after).toMatchObject({ selected: fixture.itemId, anim: 'walk', dir: 'west' })
  expect(after.audit).toHaveLength(1)
  expect(after.audit[0]).toMatchObject({ version: 'neutral-owned-v1', anim: 'walk', dir: 'west' })
  await expect(pane.locator('.badge.look')).toHaveText('Needs a look')
  await reloadStudio(page); await expect(page.locator('.world-actors').first()).toBeVisible()
  await page.evaluate(async id => { const p = '/src/studio/state.svelte.ts', s = await import(p); s.ui.anim = 'walk'; s.ui.dir = 'west'; s.pick(id) }, fixture.itemId)
  await selectedItemDetails(page)
  await expect(pane.locator('.badge.look')).toHaveText('Needs a look')
  await expect(pane.getByRole('radio', { name: 'azure', exact: true }).first()).toHaveAttribute('aria-checked', 'true')
  await expect(pane.getByRole('button', { name: /^Match item colors.*Free$/ })).toHaveCount(0)
  await pane.getByRole('button', { name: 'Done', exact: true }).click()
  await page.getByRole('button', { name: 'Export', exact: true }).click()
  const sheet = page.getByRole('dialog', { name: 'Export', exact: true })
  await sheet.getByRole('radio', { name: /PNG \+ JSON/ }).click()
  const download = sheet.getByRole('button', { name: /^Download ZIP/ })
  await expect(download).toBeEnabled()
  const event = page.waitForEvent('download'); await download.click()
  const file = await event, path = await file.path(); expect(path).not.toBeNull()
  const entries = await unzip(new Uint8Array(readFileSync(path!)))
  const manifest = JSON.parse(new TextDecoder().decode(entries.get('manifest.json')!))
  expect(manifest.items.find((it: { id: string }) => it.id === fixture.itemId).paletteRepairs).toHaveLength(1)
  expect(manifest.materials).toEqual(fixture.materials)
  expect(requests).toEqual([])
})

// Synthetic keys only: exercise the production bundle without contacting PixelLab.
for (const initial of ['shared', 'old-only', 'both'] as const) {
  test('remembered key: ' + initial + ' uses only the shared name and Forget survives reload', async ({ page }) => {
    const shared = 'test-shared-key-1234';
    const legacy = 'test-legacy-key-5678';
    let requests = 0;
    await page.route('https://api.pixellab.ai/**', async (route) => {
      requests++;
      expect(route.request().method()).toBe('GET');
      expect(new URL(route.request().url()).pathname).toBe('/v2/balance');
      expect(route.request().headers().authorization).toBe('Bearer ' + shared);
      await route.fulfill({ json: { subscription: { type: 'generations', status: 'active', generations: 42, total: 100 }, credits: { usd: 0 } } });
    });
    await page.addInitScript(({ initial, shared, legacy }) => {
      localStorage.setItem('pixeldoll.agentKey', 'off');
      localStorage.setItem('pixeldoll.welcomed', '1');
      if (sessionStorage.getItem('seeded')) return;
      sessionStorage.setItem('seeded', '1');
      if (initial === 'shared' || initial === 'both') localStorage.setItem('pixellabApiKey', shared);
      if (initial !== 'shared') localStorage.setItem('pixeldoll.apiKey', legacy);
      localStorage.setItem('pixellab-backpack:key-kept', 'other-app-legacy-key');
    }, { initial, shared, legacy });
    await openStudio(page, '/#/');
    await expect(page.locator('.project-btn')).toHaveText('Adventurer');
    await expect(page.locator('.world-actors').first()).toBeVisible();
    await page.locator('.project-btn').click();
    await page.getByRole('menuitem', { name: initial === 'old-only' ? 'Connect PixelLab…' : 'PixelLab account', exact: true }).click();
    const dialog = page.getByRole('dialog', { name: 'Connect PixelLab', exact: true });
    if (initial === 'old-only') {
      await expect(dialog.getByRole('button', { name: 'Forget key' })).toHaveCount(0);
      await expect(dialog.getByLabel('API key', { exact: true })).toHaveValue('');
      expect(requests).toBe(0);
    } else {
      await expect(dialog.getByText(/Connected and remembered/)).toBeVisible();
      expect(requests).toBeGreaterThan(0);
    }
    expect(await page.evaluate(() => [localStorage.getItem('pixellabApiKey'), localStorage.getItem('pixeldoll.apiKey')])).toEqual([initial === 'old-only' ? null : shared, initial === 'shared' ? null : legacy]);
    if (initial !== 'old-only') await dialog.getByRole('button', { name: 'Forget key' }).click();
    const beforeReload = requests;
    await reloadStudio(page);
    expect(await page.evaluate(() => [localStorage.getItem('pixellabApiKey'), localStorage.getItem('pixeldoll.apiKey'), localStorage.getItem('pixellab-backpack:key-kept')])).toEqual([null, initial === 'shared' ? null : legacy, 'other-app-legacy-key']);
    await page.locator('.project-btn').click();
    await expect(page.getByRole('menuitem', {name:'Connect PixelLab…',exact:true})).toBeVisible();
    await page.keyboard.press('Escape');
    expect(requests).toBe(beforeReload);
  });
}

test('setup and move drafts survive canceled connection and stay scoped to their character', async ({ page, context }) => {
  const requests: string[] = []
  await context.route('https://api.pixellab.ai/**', async (route) => { requests.push(route.request().method()); await route.abort() })
  await page.addInitScript(() => { localStorage.setItem('pixeldoll.agentKey', 'off'); localStorage.setItem('pixeldoll.welcomed', '1') })
  await openStudio(page, '/')
  await page.locator('.world-actors').first().waitFor()
  await page.getByRole('button', { name: 'Export', exact: true }).click()
  const downloading = page.waitForEvent('download')
  await page.getByRole('button', { name: /Download ZIP/ }).click()
  const files = await unzip(new Uint8Array(readFileSync((await (await downloading).path())!)))
  const data = JSON.parse(new TextDecoder().decode(files.get('project.json')))
  const m = data.manifest
  m.name = 'Connection draft fixture'
  const poses = JSON.parse(readFileSync('dev-fixtures/s4rig/keypoints.json', 'utf8'))
  const { toApi } = await import('../../src/lib/rig/poses.ts')
  const body = m.items.find((i: { id: string }) => i.id === m.rig.baseItem).layers[0]
  m.rig.rest = {}
  for (const d of m.rig.directions.filter((d: { mirrorOf?: string }) => !d.mirrorOf)) {
    const keypoints = toApi(poses[`walk/${d.id}/0`], m.rig.cell)
    m.rig.rest[d.id] = { image: body.cells.walk[d.id][0], keypoints }
    for (const a of m.rig.animations) { a.sources ??= {}; a.sources[d.id] = { route: 'skeleton-v3', keypoints: Array.from({ length: a.cells }, () => keypoints) } }
  }
  const vest = m.items.find((i: { id: string }) => i.id === 'vest_leather') ?? m.items.find((i: { slot: string }) => i.slot === 'top_inner')
  vest.route = 'skeleton-pose'; vest.key = 'magenta'; vest.dressed = Object.fromEntries(Object.entries(m.rig.rest).map(([d, r]) => [d, (r as { image: string }).image]))
  data.character = { id: 'offline-draft-fixture', looks: 'Stored offline test artwork' }
  files.set('project.json', new TextEncoder().encode(JSON.stringify(data)))
  const archive = await zip([...files].map(([name, data]) => ({ name, data })))
  await page.locator('.project-btn').click()
  await page.getByRole('menuitem', { name: 'Import character…', exact: true }).click()
  await page.getByLabel('Character ZIP', { exact: true }).setInputFiles({ name: 'draft-fixture.zip', mimeType: 'application/zip', buffer: Buffer.from(archive) })
  await page.getByRole('img', { name: 'Character import preview', exact: true }).waitFor()
  await page.getByRole('button', { name: 'Import character', exact: true }).click()
  await expect(page.locator('.project-btn')).toContainText(m.name)
  await expect(page.getByRole('dialog')).toHaveCount(0)
  await page.locator('.project-btn').click()
  await page.getByRole('menuitem', { name: 'Set up character…', exact: true }).click()
  const setup = page.getByRole('dialog', { name: 'Set up character', exact: true })
  await setup.getByRole('textbox', { name: /Existing appearance/ }).fill('Blue vest, bald, gray shorts')
  await setup.getByRole('button', { name: /^Set up ·/ }).click()
  await page.getByRole('dialog', { name: 'Connect PixelLab' }).getByRole('button', { name: 'Cancel', exact: true }).click()
  await expect(page.getByRole('dialog')).toHaveCount(0)
  await page.locator('.project-btn').click()
  await page.getByRole('menuitem', { name: 'Set up character…', exact: true }).click()
  await expect(setup.getByRole('textbox', { name: /Existing appearance/ })).toHaveValue('Blue vest, bald, gray shorts')
  await setup.getByRole('button', { name: 'Later', exact: true }).click()
  await expect(page.getByRole('dialog')).toHaveCount(0)
  await equipmentMode(page, 'Moves')
  await page.getByRole('button', { name: 'Add a move', exact: true }).click()
  const move = page.getByRole('dialog', { name: 'Add a move', exact: true })
  await move.getByRole('radio', { name: 'Cast', exact: true }).click()
  await move.getByRole('textbox', { name: /Or describe it/ }).fill('jumping in place')
  await move.getByRole('checkbox', { name: new RegExp(vest.name) }).uncheck()
  await expect(move.getByRole('button', { name: /^Add Jumping in/ })).toContainText(/Est\. \d+ gens/)
  await expect(move.getByText('PixelLab may bill some calls in dollars. Retries and fallbacks cost extra; queue time varies.', { exact: true })).toBeVisible()
  await move.getByRole('button', { name: /^Add Jumping in/ }).click()
  await page.getByRole('dialog', { name: 'Connect PixelLab' }).getByRole('button', { name: 'Cancel', exact: true }).click()
  await expect(page.getByRole('dialog')).toHaveCount(0)
  await page.getByRole('button', { name: 'Add a move', exact: true }).click()
  await expect(move.getByRole('textbox', { name: /Or describe it/ })).toHaveValue('jumping in place')
  await expect(move.getByRole('checkbox', { name: new RegExp(vest.name) })).not.toBeChecked()
  await move.getByRole('textbox', { name: /Or describe it/ }).fill('')
  await expect(move.getByRole('radio', { name: 'Cast', exact: true })).toHaveAttribute('aria-checked', 'true')
  await move.getByRole('button', { name: 'Cancel', exact: true }).click()
  await expect(page.getByRole('dialog')).toHaveCount(0)
  await page.locator('.project-btn').click()
  await page.getByRole('menuitemradio', { name: 'Adventurer (demo)', exact: true }).click()
  await page.getByRole('button', { name: 'Add a move', exact: true }).click()
  await expect(page.getByRole('dialog', { name: 'Add a move', exact: true })).toContainText('Moves are added to your own character.')
  expect(requests).toEqual([])
})


test('radio groups and tabs use one Tab stop and arrow selection', async ({ page, context }) => {
  await context.route('https://api.pixellab.ai/**', (r) => r.abort())
  await page.addInitScript(() => {
    localStorage.setItem('pixeldoll.agentKey', 'off')
    localStorage.setItem('pixeldoll.welcomed', '1')
    localStorage.setItem('pixeldoll.export.engine', 'unknown-engine')
  })
  await openStudio(page, '/')
  await expect(page.locator('.world-actors').first()).toBeVisible()
  const tabs = page.getByRole('tablist', { name: 'Slots', exact: true })
  await expect(tabs.locator('[tabindex="0"]')).toHaveCount(1)
  await tabs.getByRole('tab', { name: /^Head\b/ }).focus()
  await page.keyboard.press('ArrowRight')
  await expect(tabs.getByRole('tab', { name: /^Hair\b/ })).toBeFocused()
  await expect(tabs.getByRole('tab', { name: /^Hair\b/ })).toHaveAttribute('aria-selected', 'true')
  await expect(tabs.locator('[tabindex="0"]')).toHaveCount(1)
  await page.getByRole('button', { name: 'Export', exact: true }).click()
  const engines = page.getByRole('group', { name: 'Export format', exact: true })
  await expect(engines.getByRole('radio', { name: /Godot/ })).toBeChecked()
  await engines.getByRole('radio', { name: /Godot/ }).focus()
  await page.keyboard.press('ArrowRight')
  await expect(engines.getByRole('radio', { name: /Unity/ })).toBeFocused()
  await expect(engines.getByRole('radio', { name: /Unity/ })).toBeChecked()
  await page.keyboard.press('Tab')
  await expect(engines.getByRole('radio', { name: /Phaser/ })).not.toBeFocused()
  await page.getByRole('button', { name: 'Cancel', exact: true }).click()
  await page.locator('.project-btn').click()
  await page.getByRole('menuitem', { name: 'New character…', exact: true }).click()
  const editor = page.getByRole('tablist', { name: 'Prompt editor', exact: true })
  await expect(editor.locator('[tabindex="0"]')).toHaveCount(1)
  await editor.getByRole('tab', { name: 'Appearance', exact: true }).focus()
  await page.keyboard.press('ArrowRight')
  await expect(editor.getByRole('tab', { name: 'Prompt', exact: true })).toBeFocused()
  await expect(editor.getByRole('tab', { name: 'Prompt', exact: true })).toHaveAttribute('aria-selected', 'true')
  await expect(editor.locator('[tabindex="0"]')).toHaveCount(1)
  await page.keyboard.press('ArrowLeft')
  const skin = page.getByRole('combobox', { name: 'Skin', exact: true })
  await expect(skin).toHaveValue('Not set')
  await skin.focus()
  await expect(skin).toBeFocused()
  await page.keyboard.press('Space') // Open the native select before moving its highlighted option.
  await page.keyboard.press('ArrowDown')
  await page.keyboard.press('Enter') // Commit native Windows/Chromium select navigation.
  await expect(skin).toHaveValue('Deep brown')
  await page.keyboard.press('Tab')
  await expect(skin).not.toBeFocused()
})


test('draft review can inspect every generated move and only its available views', async ({ page, context }, info) => {
  await context.route('https://api.pixellab.ai/**', (r) => r.abort())
  await page.addInitScript(() => { localStorage.setItem('pixeldoll.agentKey', 'off'); localStorage.setItem('pixeldoll.welcomed', '1') })
  await openStudio(page, info.config.projects.find((p) => p.name === 'browser-selftests')!.use.baseURL!)
  await expect(page.locator('.world-actors').first()).toBeVisible()
  await page.evaluate(async () => {
    const s = (window as unknown as { __studio: { ui: { playing: boolean; frame: number; anim: string; inspTab: string; selected: string }; doc: { id: string }; store: { project: any; results: Record<string, unknown> }; gens: unknown[]; loadGens: () => Promise<void> } }).__studio
    await s.loadGens()
    s.ui.playing = false; s.ui.frame = 0; s.ui.anim = 'walk'; s.ui.inspTab = 'item'
    const p = s.store.project, it = p.manifest.items.find((i: { slot: string }) => i.slot === 'head')
    s.gens.push({ draft: { rigId: s.doc.id, spec: { id: it.id, name: 'Review fixture', slot: it.slot, prompt: 'hat', key: 'magenta', anims: ['walk', 'cross-punch'], dirs: ['south', 'east', 'north'], clipDirs: { walk: ['south', 'east', 'north'], 'cross-punch': ['south'] } }, calls: [], keySwitched: false, log: [] }, input: { name: 'Review fixture', slot: it.slot, prompt: 'hat' }, phase: 'review', status: 'Review' })
    s.store.results[it.id] = { cells: [], qa: null, g1: new Map(), preview: p }
    s.ui.selected = 'gen:' + it.id
  })
  const review = page.locator('.gen')
  await expect(review.getByRole('button', { name: /^Try again/ })).toContainText('Est.')
  await expect(review.getByText('PixelLab may bill some calls in dollars. Retries and fallbacks cost extra; queue time varies.', { exact: true })).toBeVisible()
  await expect(review.getByRole('combobox', { name: 'Preview move', exact: true })).toHaveValue('walk')
  await expect(review.locator('.review-grid figure')).toHaveCount(4)
  const before = await review.locator('canvas').first().evaluate((c) => (c as HTMLCanvasElement).toDataURL())
  await review.getByRole('combobox', { name: 'Preview move', exact: true }).selectOption('cross-punch')
  await expect(page.getByRole('combobox', { name: 'Move', exact: true })).toHaveValue('cross-punch')
  await expect(review.locator('.review-grid figure')).toHaveCount(1)
  await expect(review.getByRole('img', { name: /facing south/ })).toBeVisible()
  expect(await review.locator('canvas').first().evaluate((c) => (c as HTMLCanvasElement).toDataURL())).not.toBe(before)
  await page.getByRole('combobox', { name: 'Move', exact: true }).selectOption('walk')
  await expect(review.getByRole('combobox', { name: 'Preview move', exact: true })).toHaveValue('walk')
  await expect(review.locator('.review-grid figure')).toHaveCount(4)
  // Details must react to ledger-only completion; the draft itself does not change when usage arrives.
  await page.evaluate(() => {
    const w = window as unknown as { __studio: { ui: { selected: string }; gens: any[] }; __queue: { recs: Map<string, any>; emit: () => void } }
    const g = w.__studio.gens.find((g) => 'gen:' + g.draft.spec.id === w.__studio.ui.selected)
    g.draft.calls = [{ kind: 'edit', cells: ['walk/south/0'], seed: 1, rerolls: 0, old: [], recId: 'spent-first' }, { kind: 'edit', cells: ['walk/east/0'], seed: 2, rerolls: 0, old: [], recId: 'spent-second' }]
    for (const [id, gens] of [['spent-first', 10], ['spent-second', 0]] as const) w.__queue.recs.set(id, { id, label: id, method: 'POST', endpoint: '/synthetic', params: {}, inputs: [], requestHash: id, state: 'done', createdAt: 1, nextAt: 0, attempts: 1, jobs: [], gens, usd: 0 })
    w.__queue.emit()
  })
  await review.getByText('Details', { exact: true }).click()
  const spent = review.locator('dt:has-text("Spent") + dd')
  await expect(spent).toHaveText('10 gens')
  const beforeDraft = await page.evaluate(() => {
    const w = window as unknown as { __studio: { ui: { selected: string }; gens: any[] }; __queue: { recs: Map<string, any>; emit: () => void } }
    const draft = w.__studio.gens.find((g) => 'gen:' + g.draft.spec.id === w.__studio.ui.selected).draft
    const snapshot = JSON.stringify(draft)
    w.__queue.recs.get('spent-second').usd = 0.08
    w.__queue.emit()
    return snapshot
  })
  await expect(spent).toHaveText('10 gens + $0.080')
  expect(await page.evaluate(() => {
    const w = window as unknown as { __studio: { ui: { selected: string }; gens: any[] } }
    return JSON.stringify(w.__studio.gens.find((g) => 'gen:' + g.draft.spec.id === w.__studio.ui.selected).draft)
  })).toBe(beforeDraft)

})


test('a draft can be worn while it loads: landed views show, pending ones say loading, and it is never saved', async ({ page, context }, info) => {
  const requests: string[] = []
  await context.route('https://api.pixellab.ai/**', (r) => { requests.push(r.request().method()); return r.abort() })
  await page.addInitScript(() => { localStorage.setItem('pixeldoll.agentKey', 'off'); localStorage.setItem('pixeldoll.welcomed', '1') })
  await openStudio(page, info.config.projects.find((p) => p.name === 'browser-selftests')!.use.baseURL!)
  await expect(page.locator('.world-actors').first()).toBeVisible()
  type Studio = { ui: { playing: boolean; anim: string; dir: string }; doc: { id: string; items: Record<string, string | null>; drafts: Record<string, string> }; store: { project: any; results: Record<string, unknown> }; gens: any[]; loadGens: () => Promise<void> }
  await page.evaluate(async () => {
    const s = (window as unknown as { __studio: Studio }).__studio
    await s.loadGens()
    s.ui.playing = false; s.ui.anim = 'walk'; s.ui.dir = 'south'
    // a generating helm whose south walk landed; east (west mirrors it) and north are still on their way
    const p = s.store.project, hat = p.manifest.items.find((i: { id: string }) => i.id === 'hat_wizard'), keys = (dir: string) => Array.from({ length: 8 }, (_, i) => `walk/${dir}/${i}`)
    const item = { ...structuredClone(hat), id: 'loading_helm', name: 'Loading helm', status: 'draft', materials: [], coverage: keys('south'), pending: [...keys('east'), ...keys('north')] }
    s.gens.push({ draft: { rigId: s.doc.id, spec: { id: 'loading_helm', name: 'Loading helm', slot: 'head', prompt: 'a helm', key: 'green', anims: ['walk'], dirs: ['south', 'east', 'north'] }, calls: [], keySwitched: false, log: [] }, input: { name: 'Loading helm', slot: 'head', prompt: 'a helm' }, phase: 'running', status: 'Adding the other moves', requestText: 2 })
    s.store.results = { ...s.store.results, loading_helm: { cells: [], qa: null, g1: new Map(), preview: { manifest: { ...p.manifest, items: [...p.manifest.items, item] }, images: p.images } } }
  })
  // run a function against the dev-only studio state (serialized like page.evaluate's own functions)
  const studio = <T,>(fn: (s: Studio, arg: string) => T, arg = '') => page.evaluate(({ src, arg }) => new Function('s', 'arg', `return (${src})(s, arg)`)((window as unknown as { __studio: Studio }).__studio, arg), { src: fn.toString(), arg }) as Promise<T>
  const before = await studio((s) => ({ ...s.doc.items }))
  const tile = page.locator('.equipment-scroll').getByRole('button', { name: /^Loading helm, / })
  await tile.click()
  await expect(tile).toHaveAttribute('aria-pressed', 'true')
  expect(await studio((s) => ({ items: { ...s.doc.items }, drafts: { ...s.doc.drafts } }))).toEqual({ items: before, drafts: { head: 'loading_helm' } })
  const notes = page.locator('.world-loading-items')
  await expect(notes).toHaveCount(0) // south landed: the draft is drawn
  for (const dir of ['east', 'west', 'north']) {
    await studio((s, d) => { s.ui.dir = d }, dir)
    await expect(notes).toHaveText('Loading helm loading — East, North')
    await expect(page.locator('.world-coverage', { hasText: 'hidden' })).toHaveCount(0)
  }
  const card = page.locator('.gen')
  await card.getByRole('button', { name: 'Take off', exact: true }).click()
  await expect(tile).toHaveAttribute('aria-pressed', 'false')
  await expect(notes).toHaveCount(0)
  await card.getByRole('button', { name: 'Wear', exact: true }).click()
  await expect(notes).toHaveText('Loading helm loading — East, North')
  // finished with gaps: those views are missing (hidden and said so), no longer loading; Discard takes the draft off
  await studio((s) => { s.gens.find((g) => g.draft.spec.id === 'loading_helm').phase = 'review' })
  await expect(notes).toHaveCount(0)
  await expect(page.locator('.world-coverage', { hasText: '1 equipped item hidden for this view' })).toBeVisible()
  await card.getByRole('button', { name: 'Discard', exact: true }).click()
  await expect(tile).toHaveCount(0)
  expect(await studio((s) => ({ items: { ...s.doc.items }, drafts: { ...s.doc.drafts }, presets: JSON.stringify(s.store.project.manifest.presets) }))).toMatchObject({ items: before, drafts: {} })
  expect(await studio((s) => JSON.stringify(s.store.project.manifest))).not.toContain('loading_helm')
  expect(requests).toEqual([])
})


test('a follower explains blocked Create above the modal and preserves its draft', async ({ page, context }) => {
  const requests: string[] = []
  await context.route('https://api.pixellab.ai/**', (r) => { requests.push(r.request().method()); return r.abort() })
  await context.addInitScript(() => { localStorage.setItem('pixeldoll.agentKey', 'off'); localStorage.setItem('pixeldoll.welcomed', '1') })
  await openStudio(page, '/')
  await expect(page.locator('.world-actors').first()).toBeVisible()
  const follower = await context.newPage()
  await openStudio(follower, '/')
  await follower.getByRole('button', {name:'More options',exact:true}).click()
  await expect(follower.locator('#experience-options')).toContainText('Other tab')
  await follower.keyboard.press('Escape')
  async function openCreate() {
    await follower.locator('.project-btn').click()
    await follower.getByRole('menuitem', { name: 'New character…', exact: true }).click()
    return follower.getByRole('dialog', { name: 'New character', exact: true })
  }
  let create = await openCreate()
  await create.getByRole('textbox', { name: 'Details', exact: true }).fill('a cheerful copper clockwork scout')
  await create.getByRole('button', { name: 'Side-scroller 2', exact: true }).click()
  await create.getByRole('button', { name: /^Create/ }).click()
  const activity = follower.getByRole('dialog', { name: 'Activity', exact: true })
  await expect(activity).toBeVisible()
  await expect(activity).toContainText('Running in another tab.')
  await expect(activity).toContainText('close it to run jobs here')
  await expect(follower.getByRole('dialog', { name: 'New character', exact: true })).toHaveCount(0)
  await activity.getByRole('button', { name: 'Done', exact: true }).click()
  create = await openCreate()
  await expect(create.getByRole('textbox', { name: 'Details', exact: true })).toHaveValue('a cheerful copper clockwork scout')
  await expect(create.getByRole('button', { name: 'Side-scroller 2', exact: true })).toHaveAttribute('aria-pressed', 'true')
  await create.getByRole('button', { name: 'Cancel', exact: true }).click()
  await page.close()
  await follower.getByRole('button', {name:'More options',exact:true}).click()
  await expect(follower.locator('#experience-options')).not.toContainText('Other tab', {timeout:15000})
  await follower.keyboard.press('Escape')
  create = await openCreate()
  await expect(create.getByRole('textbox', { name: 'Details', exact: true })).toHaveValue('a cheerful copper clockwork scout')
  await expect(create.getByRole('button', { name: 'Side-scroller 2', exact: true })).toHaveAttribute('aria-pressed', 'true')
  await create.getByRole('button', { name: /^Create/ }).click()
  await expect(follower.getByRole('dialog', { name: 'Connect PixelLab', exact: true })).toBeVisible()
  expect(requests).toEqual([])
})


test('mixed malformed draft calls cannot claim Clean when surviving frame checks pass', async ({ page, context }, info) => {
  const requests: string[] = []
  await context.route('https://api.pixellab.ai/**', (r) => { requests.push(r.request().method()); return r.abort() })
  await page.addInitScript(() => { localStorage.setItem('pixeldoll.agentKey', 'off'); localStorage.setItem('pixeldoll.welcomed', '1') })
  await openStudio(page, info.config.projects.find((p) => p.name === 'browser-selftests')!.use.baseURL!)
  await expect(page.locator('.world-actors').first()).toBeVisible()
  await page.evaluate(async () => {
    const s = (window as unknown as { __studio: { ui: { playing: boolean; anim: string; inspTab: string; selected: string }; doc: { id: string }; store: { project: any; results: Record<string, unknown> }; gens: unknown[]; loadGens: () => Promise<void> } }).__studio
    await s.loadGens()
    s.ui.playing = false; s.ui.anim = 'walk'; s.ui.inspTab = 'item'
    const p = s.store.project, it = p.manifest.items.find((i: { slot: string }) => i.slot === 'head')
    const calls = ['south', 'east'].map((d) => ({ kind: 'pose', cells: ['walk/' + d + '/0'], seed: 1, rerolls: 0, old: [] }))
    s.gens.push({ draft: { rigId: s.doc.id, spec: { id: it.id, name: 'Mixed malformed fixture', slot: it.slot, prompt: 'hat', key: 'magenta', anims: ['walk'], dirs: ['south', 'east'] }, calls, keySwitched: false, log: [] }, input: { name: 'Mixed malformed fixture', slot: it.slot, prompt: 'hat' }, phase: 'review', status: 'Review' })
    // The valid call's cells pass; an excluded malformed call remains an independent G1 failure.
    s.store.results = { ...s.store.results, [it.id]: { cells: [], qa: { qa: { status: 'pass' }, warnings: [], failCalls: new Map(), softCalls: new Set() }, g1: new Map([[1, 'G1 0 outputs for 3 requested frames']]), preview: p } }
    s.ui.selected = 'gen:' + it.id
  })
  const review = page.locator('.gen')
  await expect(review.locator('.badge.look')).toHaveText('Needs a look')
  await expect(review.getByRole('button', { name: 'Keep it', exact: true })).toBeDisabled()
  await expect(review.getByText('PixelLab returned an unexpected image', { exact: true })).toBeVisible()
  await expect(review.locator('.badge.clean')).toHaveCount(0)
  await expect(review.getByText('Every frame passed the checks.', { exact: true })).toHaveCount(0)
  await page.evaluate(() => {
    const s = (window as unknown as { __studio: { ui: { selected: string }; store: { results: Record<string, any> } } }).__studio
    const id = s.ui.selected.slice(4), r = s.store.results[id]
    s.store.results = { ...s.store.results, [id]: { ...r, g1: new Map([[1, 'D1 keyframe rest/east/0: 25 % gray smudges in a colorful design']]) } }
  })
  await expect(review.locator('.badge.look')).toHaveText('Needs a look')
  await expect(review.getByText('The design has gray smudges', { exact: true })).toBeVisible()
  await expect(review.getByRole('button', { name: 'Keep it', exact: true })).toBeEnabled()
  for (const [warning, reason] of [
    ['G8 idle/west: hand positions are missing for 4 of 4 frames; set up the character’s pose rig and check this view', 'Hand positions are unavailable; set up the pose rig and check this view (idle, west)'],
    ['G8 idle/west: grip side is unclear (0 right / 0 left frames); check that the item stays in the intended hand', 'The grip side is unclear; check the intended hand (idle, west)'],
    ['G8 idle/west: item is more than 6 px from both hands in 4 of 4 frames; check its grip', 'The grip could not be confirmed; inspect the item at the hand (idle, west)'],
  ]) {
    await page.evaluate((warning) => {
      const s = (window as unknown as { __studio: { ui: { selected: string }; store: { results: Record<string, any> } } }).__studio
      const id = s.ui.selected.slice(4), r = s.store.results[id]
      s.store.results = { ...s.store.results, [id]: { ...r, g1: new Map(), qa: { ...r.qa, warnings: [warning] } } }
    }, warning)
    await expect(review.locator('.badge.look')).toHaveText('Needs a look')
    await expect(review.getByText(reason, { exact: true })).toBeVisible()
    await expect(review.getByText('The item switches hands', { exact: true })).toHaveCount(0)
    await expect(review.getByRole('button', { name: 'Keep it', exact: true })).toBeEnabled()
  }
  await page.evaluate(() => {
    const s = (window as unknown as { __studio: { ui: { selected: string }; store: { results: Record<string, any> } } }).__studio
    const id = s.ui.selected.slice(4), r = s.store.results[id]
    s.store.results = { ...s.store.results, [id]: { ...r, g1: new Map(), qa: { ...r.qa, warnings: [] } } }
  })
  await expect(review.locator('.badge.clean')).toHaveText('Clean')
  await expect(review.getByRole('button', { name: 'Keep it', exact: true })).toBeEnabled()
  await expect(review.getByText('Every frame passed the checks.', { exact: true })).toBeVisible()
  expect(requests).toEqual([])
})


test('long item and outfit names leave wardrobe controls inside the desktop sidebar', async ({ page, context }, info) => {
  await context.route('https://api.pixellab.ai/**', (r) => r.abort())
  await page.addInitScript(() => { localStorage.setItem('pixeldoll.agentKey', 'off'); localStorage.setItem('pixeldoll.welcomed', '1') })
  await page.setViewportSize({ width: 1280, height: 720 })
  await openStudio(page, info.config.projects.find((p) => p.name === 'browser-selftests')!.use.baseURL!)
  await expect(page.locator('.world-actors').first()).toBeVisible()
  const name = 'Polished copper clockwork adventurer ceremonial full helmet with a very long descriptive name'
  await page.evaluate((name) => {
    const s = (window as unknown as { __studio: { ui: { playing: boolean }; store: { project: any } } }).__studio
    s.ui.playing = false
    const p = s.store.project, head = p.manifest.items.find((i: { slot: string }) => i.slot === 'head')
    s.store.project = { ...p, manifest: { ...p.manifest, items: p.manifest.items.map((i: { id: string }) => i.id === head.id ? { ...i, name } : i), presets: p.manifest.presets.map((v: object, n: number) => n === 0 ? { ...v, name } : v) } }
  }, name)
  const wear = page.locator('.equipment-scroll').getByRole('button', { name, exact: true })
  await expect(wear).toBeVisible()
  await expect(wear).toHaveAttribute('aria-pressed', 'true')
  const dimensions = await page.locator('.equipment-rail').evaluate((side) => {
    const box = side.getBoundingClientRect()
    // The outer rail permits the documented 8px focus/swatch paint overflow.
    const overflows = [side, ...side.querySelectorAll('.equipment-scroll, .tiles, .tile, .tile-name')].filter((n) => n.scrollWidth > n.clientWidth + (n === side ? 8 : 1)).map((n) => n.className)
    const controls = [...side.querySelectorAll('.tile, .sel-row button')].map((n) => { const r = n.getBoundingClientRect(); return { left: r.left, right: r.right, width: r.width } })
    return { left: box.left, right: box.right, overflows, controls }
  })
  expect(dimensions.overflows).toEqual([])
  for (const c of dimensions.controls) { expect(c.left).toBeGreaterThanOrEqual(dimensions.left); expect(c.right).toBeLessThanOrEqual(dimensions.right); expect(c.width).toBeGreaterThanOrEqual(24) }
  await page.locator('.equipment-scroll').getByRole('button', {name:'None',exact:true}).click()
  await expect(wear).toHaveAttribute('aria-pressed', 'false')
  await equipmentMode(page, 'Outfits')
  const saved = page.locator('.outfits .row').filter({hasText:name})
  await expect(saved).toBeVisible()
  const outfitDimensions = await page.locator('.equipment-rail').evaluate(el=>({width:el.clientWidth,scroll:el.scrollWidth,rows:[...el.querySelectorAll('.outfits .row')].map(row=>({width:row.clientWidth,scroll:row.scrollWidth}))}))
  expect(outfitDimensions.scroll).toBeLessThanOrEqual(outfitDimensions.width+8)
  for(const row of outfitDimensions.rows) expect(row.scroll).toBeLessThanOrEqual(row.width+1)
})


test('interrupted character specifications retain their own estimates', async ({ page, context }, info) => {
  const calls: string[] = []
  await context.route('https://api.pixellab.ai/**', (r) => { calls.push(r.request().method()); return r.abort() })
  await page.addInitScript(() => { localStorage.setItem('pixeldoll.agentKey', 'off'); localStorage.setItem('pixeldoll.welcomed', '1') })
  await openStudio(page, info.config.projects.find((p) => p.name === 'browser-selftests')!.use.baseURL!)
  await expect(page.locator('.world-actors').first()).toBeVisible()
  await page.evaluate(async () => {
    const path = '/src/studio/formDrafts.ts', { formDrafts } = await import(path)
    const configPath = '/src/studio/characterConfig.ts', { newCharacterDraft, setPreset } = await import(configPath)
    // Form drafts are memory-only. A valid current form must not change a persisted older request.
    formDrafts.character = newCharacterDraft()
    setPreset(formDrafts.character, 'unique')
    const s = (window as unknown as { __studio: { ui: { sheet: string }; creating: { spec: any; error: string } } }).__studio
    // A stored interrupted run predates directionPolicy; the new form's default must not alter its pricing or retries.
    s.creating.spec = { description: 'Historical interrupted run', name: 'Historical run', seed: 123, size: 48 }
    s.creating.error = 'Stored interruption'
    s.ui.sheet = 'create'
  })
  const create = page.getByRole('dialog', { name: 'New character', exact: true })
  // Creation is priced by the draw (body size) plus a standing-joint fallback per direction; it makes no animation.
  await expect(create.getByRole('button', { name: /^Try again/ })).toContainText('2–5 gens')
  await page.evaluate(() => {
    const s = (window as unknown as { __studio: { creating: { spec: { dirs: number } } } }).__studio
    s.creating.spec.dirs = 8
  })
  await expect(create.getByRole('button', { name: /^Try again/ })).toContainText('2–5 gens')
  await page.evaluate(() => {
    const s = (window as unknown as { __studio: { creating: { spec: { directionPolicy: string } } } }).__studio
    s.creating.spec.directionPolicy = 'independent'
  })
  await expect(create.getByRole('button', { name: /^Try again/ })).toContainText('2–5 gens')
  await page.evaluate(() => {
    const s = (window as unknown as { __studio: { creating: { spec: { size: number } } } }).__studio
    s.creating.spec.size = 128 // the stored run, not the 64 px form draft, sets the price
  })
  await expect(create.getByRole('button', { name: /^Try again/ })).toContainText('3–5 gens')
  expect(calls).toEqual([])
})


test('character Try again preserves direction policy and allocates a fresh publication identity', async ({ page, context }, info) => {
  const unexpected: string[] = []
  await context.route('https://api.pixellab.ai/**', async (route) => {
    if (route.request().method() === 'GET' && new URL(route.request().url()).pathname.endsWith('/balance')) await route.fulfill({ json: { subscription: { type: 'generations', status: 'active', generations: 42, total: 100 }, credits: { type: 'usd', usd: 0 } } })
    else { unexpected.push(route.request().method()); await route.abort() }
  })
  await page.addInitScript(() => { localStorage.setItem('pixeldoll.agentKey', 'off'); localStorage.setItem('pixeldoll.welcomed', '1') })
  await openStudio(page, info.config.projects.find((p) => p.name === 'browser-selftests')!.use.baseURL!)
  await expect(page.locator('.world-actors').first()).toBeVisible()
  await page.evaluate(async () => {
    const s = (window as unknown as { __studio: { loadGens: () => Promise<void>; creating: { spec: any; error: string }; ui: { sheet: string } }; originalCreatePut?: IDBObjectStore['put'] }).__studio
    await s.loadGens()
    const put = IDBObjectStore.prototype.put
    ;(window as unknown as { originalCreatePut: IDBObjectStore['put'] }).originalCreatePut = put
    IDBObjectStore.prototype.put = function (value, key) {
      if (key === 'studio-create') throw new Error('Synthetic draft persistence stopped before any paid request')
      return put.call(this, value, key)
    }
    s.creating.spec = { projectId: 'prior-attempt-identity', description: 'Retry body', name: 'Retry fixture', size: 48, dirs: 8, directionPolicy: 'independent', seed: 0 }
    s.creating.error = 'Prior interrupted attempt'
    s.ui.sheet = 'create'
  })
  try {
    await page.getByRole('dialog', { name: 'New character', exact: true }).getByRole('button', { name: /^Try again/ }).click()
    const connect = page.getByRole('dialog', { name: 'Connect PixelLab', exact: true })
    await connect.getByLabel('API key', { exact: true }).fill('synthetic-retry-test-key')
    await connect.getByRole('button', { name: 'Connect', exact: true }).click()
    await expect(page.getByRole('dialog', { name: 'New character', exact: true })).toBeVisible()
    await expect(page.getByRole('dialog', { name: 'New character', exact: true })).toContainText('Synthetic draft persistence stopped before any paid request')
    const retry = await page.evaluate(() => {
      const s = (window as unknown as { __studio: { creating: { spec: { projectId?: string; seed: number; directionPolicy: string; dirs: number } } } }).__studio
      return { projectId: s.creating.spec.projectId, seed: s.creating.spec.seed, directionPolicy: s.creating.spec.directionPolicy, dirs: s.creating.spec.dirs }
    })
    expect(retry.projectId).toBeTruthy()
    expect(retry.projectId).not.toBe('prior-attempt-identity')
    expect(retry.seed).not.toBe(0)
    expect(retry.directionPolicy).toBe('independent')
    expect(retry.dirs).toBe(8)
    expect(unexpected).toEqual([])
  } finally {
    await page.evaluate(() => {
      const w = window as unknown as { originalCreatePut: IDBObjectStore['put'] }
      IDBObjectStore.prototype.put = w.originalCreatePut
    })
  }
})


test('Activity distinguishes unknown progress and credits while item guidance keeps the tab open', async ({ page, context }, info) => {
  const posts: string[] = []
  await context.route('https://api.pixellab.ai/**', async (route) => {
    const request = route.request()
    if (request.method() === 'GET' && new URL(request.url()).pathname.endsWith('/balance')) {
      await route.fulfill({ json: { subscription: { type: 'generations', status: 'active', generations: 0, total: 100 }, credits: { type: 'usd', usd: 0 } } })
    } else { if (request.method() === 'POST') posts.push(new URL(request.url()).pathname); await route.abort() }
  })
  await page.addInitScript(() => { localStorage.setItem('pixeldoll.agentKey', 'off'); localStorage.setItem('pixeldoll.welcomed', '1') })
  await openStudio(page, info.config.projects.find((p) => p.name === 'browser-selftests')!.use.baseURL!)
  await expect(page.locator('.world-actors').first()).toBeVisible()
  await page.evaluate(async () => {
    const w = window as unknown as { __studio: { ui: { selected: string; inspTab: string }; doc: { id: string }; store: { project: any }; gens: any[]; loadGens: () => Promise<void> }; __queue: { disconnect: () => void; key: string; paused: string | null; recs: Map<string, any>; emit: () => void } }
    const s = w.__studio, q = w.__queue
    await s.loadGens()
    // Render deferred/synchronous states without letting the queue send or poll anything.
    q.disconnect(); q.recs.clear(); q.key = 'synthetic-key'; q.paused = null
    const common = { method: 'POST', params: {}, inputs: [], state: 'submitting', createdAt: Date.now(), submittedAt: Date.now() - 125000, nextAt: 0, attempts: 1, gens: 0, usd: 0 }
    q.recs.set('sync-estimate', { ...common, id: 'sync-estimate', label: 'Finding joints fixture', endpoint: '/estimate-skeleton', requestHash: 'sync-estimate', jobs: [] })
    q.recs.set('awaiting-id', { ...common, id: 'awaiting-id', label: 'Submitting fixture', endpoint: '/edit-animation-v2', requestHash: 'awaiting-id', jobs: [] })
    q.recs.set('known-progress', { ...common, id: 'known-progress', label: 'Reported progress fixture', endpoint: '/edit-animation-v2', requestHash: 'known-progress', state: 'running', jobs: [{ id: 'known-job', status: 'running', done: false, progress: 0.37, queuePosition: 4, results: [] }] })
    q.emit()
    const it = s.store.project.manifest.items.find((i: { slot: string }) => i.slot === 'head')
    s.gens.push({ draft: { rigId: s.doc.id, spec: { id: it.id, name: 'Waiting fixture', slot: it.slot, prompt: 'hat', key: 'magenta', anims: ['walk'], dirs: ['south', 'east', 'north'] }, calls: [], keySwitched: false, log: [] }, input: { name: 'Waiting fixture', slot: it.slot, prompt: 'hat' }, phase: 'running', status: 'Starting' })
    s.ui.selected = 'gen:' + it.id; s.ui.inspTab = 'item'
  })
  const gen = page.locator('.gen')
  await expect(gen).toContainText('Keep this tab open while PixelLab responds. You can keep dressing up. Unknown outcomes stop for review in Activity.')
  await expect(gen).not.toContainText('picks up where it left off')
  await page.getByRole('button', { name: 'Activity', exact: true }).click()
  const activity = page.getByRole('dialog', { name: 'Activity', exact: true })
  for (const label of ['Finding joints fixture', 'Submitting fixture']) {
    const row = activity.locator('.act-group li').filter({ has: page.getByText(label, { exact: true }) })
    await expect(row.locator('.act-main .small')).toHaveText('Waiting for PixelLab')
    await expect(row.locator('.ring')).toHaveClass(/spin/)
    await expect(row.getByRole('button', { name: 'Stop', exact: true })).toBeVisible()
    await expect(row.locator('.act-meta')).toContainText(/\d+:\d{2}/)
  }
  const known = activity.locator('.act-group li').filter({ has: page.getByText('Reported progress fixture', { exact: true }) })
  await expect(known.locator('.act-main .small')).toHaveText('37% · #4 in line')
  await expect(known.locator('.ring')).not.toHaveClass(/spin/)
  await page.evaluate(() => {
    const q = (window as unknown as { __queue: { paused: string | null; emit: () => void } }).__queue
    q.paused = 'credits'; q.emit()
  })
  await expect(activity).toContainText('PixelLab credits are insufficient. Jobs wait until credits are available.')
  await expect(activity).not.toContainText('Out of generations')
  await expect(activity.getByRole('button', { name: 'Resume', exact: true })).toBeVisible()
  await page.evaluate(() => {
    const q = (window as unknown as { __queue: { paused: string | null; emit: () => void } }).__queue
    q.paused = 'offline'; q.emit()
  })
  await expect(activity).toContainText("You’re offline. Queued work waits; submitted jobs may finish. Reconnect to resume known jobs.")
  await activity.getByRole('button', { name: 'Done', exact: true }).click()
  await expect(gen).toContainText("Paused while you’re offline. Submitted jobs may still finish or charge.")
  expect(posts).toEqual([])
})


test('reload restores failed create, move and setup for review without paid submissions', async ({ page, context }, info) => {
  const posts: string[] = []
  await context.route('https://api.pixellab.ai/**', async (route) => {
    const r = route.request()
    if (r.method() === 'GET' && new URL(r.url()).pathname.endsWith('/balance')) await route.fulfill({ json: { subscription: { type: 'generations', status: 'active', generations: 42, total: 100 }, credits: { type: 'usd', usd: 1 } } })
    else { if (r.method() === 'POST') posts.push(new URL(r.url()).pathname); await route.abort() }
  })
  await page.addInitScript(() => {
    localStorage.setItem('pixeldoll.agentKey', 'off'); localStorage.setItem('pixeldoll.welcomed', '1')
    localStorage.setItem('pixellabApiKey', 'synthetic-failed-flow-key')
  })
  await openStudio(page, info.config.projects.find((p) => p.name === 'browser-selftests')!.use.baseURL!)
  await expect(page.locator('.world-actors').first()).toBeVisible()
  await page.evaluate(async () => {
    const s = (window as unknown as { __studio: { doc: { id: string }; store: { project: any } } }).__studio
    const path = '/src/lib/store/db.ts', db = await import(/* @vite-ignore */ path)
    const common = { status: 'failed', error: 'Saved terminal failure; inspect Activity', progress: { step: 'animate', done: 4, total: 69, recIds: [] } }
    await db.put('projects', 'studio-create', { ...common, id: 'studio-create', spec: { name: 'Failed character', description: 'body', size: 48, dirs: 4, seed: 1, projectId: 'rig-failed-browser-fixture', directionPolicy: 'independent' } })
    await db.put('projects', 'studio-move', { ...common, id: 'studio-move', projectId: s.doc.id, spec: { id: 'cast', action: 'cast', frames: 8, items: [], seed: 1 } })
    await db.put('projects', 'studio-setup', { ...common, id: 'studio-setup', spec: { projectId: s.doc.id, baseHash: s.store.project.manifest.rig.baseHash, restAnim: 'idle', looks: 'body', seed: 1 } })
  })
  await reloadStudio(page)
  await expect(page.locator('.world-actors').first()).toBeVisible()
  await expect.poll(() => page.evaluate(async () => {
    const path = '/src/studio/state.svelte.ts', s = await import(/* @vite-ignore */ path)
    return [s.creating.error, s.moving.error, s.settingUp.error]
  })).toEqual(Array(3).fill('Saved terminal failure; inspect Activity'))
  for (const [sheet, name] of [['create', 'New character'], ['move', 'Add a move'], ['setup', 'Set up character']] as const) {
    await page.evaluate((sheet) => { (window as unknown as { __studio: { ui: { sheet: string } } }).__studio.ui.sheet = sheet }, sheet)
    const dialog = page.getByRole('dialog', { name, exact: true })
    await expect(dialog).toContainText('Saved terminal failure; inspect Activity')
    await expect(dialog.locator('.steps-list .ring.spin')).toHaveCount(0)
    await page.keyboard.press('Escape')
  }
  expect(posts).toEqual([])
})


test('Activity shows plan-derived capacity without a manual override or network request', async ({ page, context }, info) => {
  const requests: string[] = []
  await context.route('https://api.pixellab.ai/**', r => { requests.push(r.request().method()); return r.abort() })
  await page.addInitScript(() => { localStorage.setItem('pixeldoll.agentKey', 'off'); localStorage.setItem('pixeldoll.welcomed', '1') })
  await openStudio(page, info.config.projects.find(p => p.name === 'browser-selftests')!.use.baseURL!)
  await expect(page.locator('.world-actors').first()).toBeVisible()
  await page.evaluate(async () => {
    const path = '/src/lib/pixellab/queue.ts', { queue } = await import(/* @vite-ignore */ path)
    queue.disconnect()
    queue.setBalance({ subscription: { status: 'active', plan: 'Tier 2: Pixel Artisan' } }, queue.key)
    ;(window as unknown as { __studio: { ui: { sheet: string } } }).__studio.ui.sheet = 'activity'
  })
  const activity = page.getByRole('dialog', { name: 'Activity', exact: true })
  await expect(activity.getByTestId('queue-capacity')).toHaveText('Up to 10 jobs at once.')
  await activity.getByText('Details', { exact: true }).click()
  await expect(activity.getByRole('spinbutton', { name: 'Parallel calls' })).toHaveCount(0)
  await page.keyboard.press('Escape')
  await expect(activity).toHaveCount(0)
  expect(requests).toEqual([])
})


test('accepted held-item review reasons survive actual reload without claiming a hand switch', async ({ page, context }, info) => {
  const requests: string[] = []
  await context.route('https://api.pixellab.ai/**', (r) => { requests.push(r.request().method()); return r.abort() })
  await page.addInitScript(() => { localStorage.setItem('pixeldoll.agentKey', 'off'); localStorage.setItem('pixeldoll.welcomed', '1') })
  await openStudio(page, info.config.projects.find((p) => p.name === 'browser-selftests')!.use.baseURL!)
  await expect(page.locator('.world-actors').first()).toBeVisible()
  const name = await page.evaluate(async () => {
    const path = '/src/studio/state.svelte.ts', s = await import(path)
    const dbPath = '/src/lib/store/db.ts', db = await import(dbPath)
    await s.copyDemo()
    const rec = await db.get('projects', s.doc.id), item = rec.manifest.items.find((it: { slot: string }) => it.slot === 'main_hand')
    const part = { minKeyKept: 1, maxKeyOutside: 0, minAreaRatio: 1, maxAreaCV: 0, maxPaletteDist: 0, clipPx: 0, status: 'accepted' }
    item.qa = { ...part, rerolls: 0, cells: {}, handedness: 'ok', grip: { R: 4, L: 0, amb: 4, none: 4 }, clips: {
      'idle/west': { ...part, hand: '?', grip: { R: 0, L: 0, amb: 4, none: 0 } },
      'idle/north': { ...part, grip: { R: 0, L: 0, amb: 0, none: 0 } },
      'idle/east': { ...part, hand: '?', grip: { R: 0, L: 0, amb: 0, none: 4 } },
      'idle/south': { ...part, hand: 'r', grip: { R: 4, L: 0, amb: 0, none: 0 } },
    } }
    await db.put('projects', s.doc.id, rec)
    return item.name
  })
  await reloadStudio(page)
  await expect(page.locator('.world-actors').first()).toBeVisible()
  await pickItem(page, name)
  const pane = await selectedItemDetails(page)
  await expect(pane.locator('.badge.look')).toHaveText('Needs a look')
  await expect(pane.getByText('The grip side is unclear; check the intended hand (idle, west)', { exact: true })).toBeVisible()
  await expect(pane.getByText('Handedness could not be confirmed; inspect the intended hand (idle, north)', { exact: true })).toBeVisible()
  await expect(pane.getByText('The grip could not be confirmed; inspect the item at the hand', { exact: true })).toBeVisible()
  await expect(pane.getByText('The item switches hands', { exact: true })).toHaveCount(0)
  await expect(pane.getByText(/Hand positions are unavailable/)).toHaveCount(0)
  expect(requests).toEqual([])
})


test('Export discloses saved item and body review flags without blocking analysis downloads', async ({ page, context }, info) => {
  const requests: string[] = []
  await context.route('https://api.pixellab.ai/**', (r) => { requests.push(r.request().method()); return r.abort() })
  await page.addInitScript(() => { localStorage.setItem('pixeldoll.agentKey', 'off'); localStorage.setItem('pixeldoll.welcomed', '1') })
  await openStudio(page, info.config.projects.find((p) => p.name === 'browser-selftests')!.use.baseURL!)
  await expect(page.locator('.world-actors').first()).toBeVisible()
  const names = await page.evaluate(async () => {
    const path = '/src/studio/state.svelte.ts', s = await import(path), dbPath = '/src/lib/store/db.ts', db = await import(dbPath)
    await s.copyDemo()
    const rec = await db.get('projects', s.doc.id), items = rec.manifest.items.filter((it: { slot: string }) => it.slot !== 'body').slice(0, 4)
    const qa = { minKeyKept: 1, maxKeyOutside: 0, minAreaRatio: 1, maxAreaCV: 0, maxPaletteDist: 0, clipPx: 0, rerolls: 0, cells: {}, clips: {} }
    items[0].qa = { ...qa, status: 'fail' }
    items[1].qa = { ...qa, status: 'warn' }
    items[2].qa = { ...qa, status: 'accepted' }; items[2].designWarnings = ['D1 keyframe rest/west/0: gray smudges']
    items[3].qa = { ...qa, status: 'pass' }; items[3].designWarnings = ['D1 keyframe rest/south/0: gray smudges']; items[3].baseHash = 'sha256:' + 'f'.repeat(64)
    rec.rigQa = { clips: { 'walk/east': { fails: ['arms 2.77 px off the requested pose'] }, 'walk/west': { fails: ['arms 2.10 px off the requested pose'] }, 'idle/south': { fails: [] }, 'removed/south': { fails: ['historical removed clip'] }, 'cross-punch/west': { fails: ['historical unavailable view'] } } }
    await db.put('projects', s.doc.id, rec)
    return items.map((it: { name: string }) => it.name)
  })
  await reloadStudio(page)
  await expect(page.locator('.world-actors').first()).toBeVisible()
  if (await page.getByRole('dialog', {name:'Item',exact:true}).count()) await page.getByRole('button', {name:'Done',exact:true}).click()
  await page.getByRole('button', { name: 'Export', exact: true }).click()
  const sheet = page.getByRole('dialog', { name: 'Export', exact: true })
  const itemNotice = sheet.locator('.notice.warn').filter({ hasText: 'Saved quality or appearance flags:' })
  for (const name of names) await expect(itemNotice).toContainText(name)
  await expect(itemNotice).toContainText('including explicitly accepted artwork')
  const bodyNotice = sheet.locator('.notice.warn').filter({ hasText: 'Body frames failed saved checks:' })
  await expect(bodyNotice).toContainText('Walk facing east, Walk facing west')
  await expect(bodyNotice).not.toContainText('Removed')
  await expect(bodyNotice).not.toContainText('Cross punch')
  await sheet.getByRole('radio', { name: /PNG \+ JSON/ }).click()
  const download = sheet.getByRole('button', { name: /^Download ZIP/ })
  await expect(download).toBeEnabled()
  const file = page.waitForEvent('download')
  await download.click()
  expect((await file).suggestedFilename()).toMatch(/generic\.pixeldoll\.zip$/)
  await page.evaluate(async () => {
    const path = '/src/studio/state.svelte.ts', s = await import(path), dbPath = '/src/lib/store/db.ts', db = await import(dbPath)
    const rec = await db.get('projects', s.doc.id)
    for (const it of rec.manifest.items) { if (it.qa) it.qa.status = 'pass'; delete it.designWarnings; it.baseHash = rec.manifest.rig.baseHash }
    rec.rigQa = { clips: { 'walk/east': { fails: [] } } }
    await db.put('projects', s.doc.id, rec); await s.openProject(s.doc.id)
  })
  await page.getByRole('button', { name: 'Export', exact: true }).click()
  await expect(sheet.getByRole('button', { name: /^Download ZIP/ })).toBeEnabled()
  await expect(sheet.getByText(/Saved quality or appearance flags:/)).toHaveCount(0)
  await expect(sheet.getByText(/Body frames failed saved checks:/)).toHaveCount(0)
  expect(requests).toEqual([])
})


async function targetedRepairFixture(page: Page) {
  await page.locator('.world-actors').first().waitFor()
  return page.evaluate(async () => {
    const path = '/src/studio/state.svelte.ts', s = await import(path), dbPath = '/src/lib/store/db.ts', db = await import(dbPath)
    const posesPath = '/src/lib/rig/poses.ts', poses = await import(posesPath)
    await s.copyDemo()
    const rec = await db.get('projects', s.doc.id), m = rec.manifest, base = m.items.find((it: { id: string }) => it.id === m.rig.baseItem)
    m.rig.directions = m.rig.directions.map((d: { id: string }) => ({ id: d.id }))
    for (const it of m.items) for (const layer of it.layers) for (const dirs of Object.values(layer.cells ?? {}) as any[]) if (dirs.east && !dirs.west) dirs.west = [...dirs.east]
    const points = poses.LABELS.map((label: string, i: number) => ({ label, x: 0.3 + i * 0.01, y: 0.2 + i * 0.025 }))
    m.rig.rest = {}
    for (const dir of m.rig.directions.map((d: { id: string }) => d.id)) {
      m.rig.rest[dir] = { image: base.layers[0].cells.walk[dir][0], keypoints: points }
      for (const a of m.rig.animations) if (base.layers[0].cells[a.id]?.[dir]?.length) {
        a.sources ??= {}; a.sources[dir] = { route: 'skeleton-v3', keypoints: Array.from({ length: a.cells }, () => points) }
      }
    }
    const sword = m.items.find((it: { slot: string }) => it.slot === 'main_hand')
    sword.route = 'skeleton-pose'; sword.key = 'green'; sword.dressed = Object.fromEntries(Object.entries(m.rig.rest).map(([d, r]) => [d, (r as { image: string }).image]))
    rec.character = { id: 'offline-repair-fixture', looks: 'Stored offline fixture' }
    rec.rigQa = { clips: { 'walk/east': { fails: ['arms off pose'] }, 'walk/west': { fails: ['arms off pose'] } } }
    await db.put('projects', s.doc.id, rec); await s.openProject(s.doc.id)
    return { itemId: sword.id, itemName: sword.name }
  })
}

async function oversizedItemFixture(page: Page, itemId: string) {
  await page.evaluate(async id => {
    const sPath = '/src/studio/state.svelte.ts', s = await import(sPath), dbPath = '/src/lib/store/db.ts', db = await import(dbPath)
    const pPath = '/src/lib/store/project.ts', projectModule = await import(pPath), iPath = '/src/lib/items/items.ts', items = await import(iPath), pngPath = '/src/lib/image/pngraw.ts', png = await import(pngPath)
    const ctx = await projectModule.loadProject(s.doc.id), item = ctx.rec.manifest.items.find((it: { id: string }) => it.id === id), padded = new Map<string, string>()
    const pad = async (hash: string) => {
      if (!padded.has(hash)) padded.set(hash, 'sha256:' + await db.putBlob(await png.encodePngBytes(items.padImg(ctx.project.images.get(hash), 16))))
      return padded.get(hash)
    }
    for (const layer of item.layers) {
      layer.cell = { w: 96, h: 96 }; layer.pivot = { x: ctx.rec.manifest.rig.pivot.x + 16, y: ctx.rec.manifest.rig.pivot.y + 16 }
      for (const dirs of Object.values(layer.cells) as any[]) for (const [dir, cells] of Object.entries(dirs) as [string, (string | null)[]][]) dirs[dir] = await Promise.all(cells.map(hash => hash ? pad(hash) : null))
    }
    for (const [dir, hash] of Object.entries(item.dressed) as [string, string][]) item.dressed[dir] = await pad(hash)
    await db.put('projects', s.doc.id, ctx.rec); await s.openProject(s.doc.id)
    s.ui.anim = 'walk'; s.ui.dir = 'west'; s.pick(id)
  }, itemId)
}

test('targeted move replacement scopes views, estimates and retained drafts before any paid work', async ({ page, context }, info) => {
  const posts: string[] = []
  await context.route('https://api.pixellab.ai/**', async (r) => {
    if (r.request().method() === 'GET' && new URL(r.request().url()).pathname.endsWith('/balance')) await r.fulfill({ json: { subscription: { type: 'generations', status: 'active', generations: 42, total: 100 }, credits: { usd: 1 } } })
    else { posts.push(r.request().method()); await r.abort() }
  })
  const errors: string[] = []; page.on('pageerror', e => errors.push(e.message))
  await page.addInitScript(() => { localStorage.setItem('pixeldoll.agentKey', 'off'); localStorage.setItem('pixeldoll.welcomed', '1') })
  await openStudio(page, info.config.projects.find((p) => p.name === 'browser-selftests')!.use.baseURL!)
  const fixture = await targetedRepairFixture(page)
  await equipmentMode(page, 'Moves')
  await page.getByRole('button', { name: 'Add a move', exact: true }).click()
  await page.getByRole('radio', { name: 'Walk · added', exact: true }).click()
  const sheet = page.getByRole('dialog', { name: 'Replace move views', exact: true })
  await expect(sheet.getByRole('checkbox', { name: 'East', exact: true })).toBeChecked()
  await expect(sheet.getByRole('checkbox', { name: 'West', exact: true })).toBeChecked()
  await expect(sheet.getByRole('checkbox', { name: 'South', exact: true })).not.toBeChecked()
  await expect(sheet.getByRole('checkbox', { name: 'North', exact: true })).not.toBeChecked()
  await expect(sheet.getByRole('checkbox', { name: new RegExp(fixture.itemName) })).toBeChecked()
  await expect(sheet.getByRole('button', { name: /^Replace Walk views/ })).toContainText('Est. 22 gens')
  await sheet.getByRole('checkbox', { name: 'East', exact: true }).uncheck()
  await sheet.getByRole('checkbox', { name: 'West', exact: true }).uncheck()
  await expect(sheet.getByRole('button', { name: /^Replace Walk views/ })).toBeDisabled()
  await sheet.getByRole('checkbox', { name: 'East', exact: true }).check()
  await expect(sheet.getByRole('button', { name: /^Replace Walk views/ })).toContainText('Est. 11 gens')
  await sheet.getByRole('button', { name: /^Replace Walk views/ }).click()
  await page.getByRole('dialog', { name: 'Connect PixelLab' }).getByRole('button', { name: 'Cancel', exact: true }).click()
  await page.getByRole('button', { name: 'Add a move', exact: true }).click()
  await expect(sheet.getByRole('checkbox', { name: 'East', exact: true })).toBeChecked()
  await expect(sheet.getByRole('checkbox', { name: 'West', exact: true })).not.toBeChecked()
  await page.evaluate(() => {
    const original = IDBObjectStore.prototype.put
    IDBObjectStore.prototype.put = function(value, key) { if (key === 'studio-move') throw new Error('Offline repair persistence stopped before paid work'); return original.call(this, value, key) }
  })
  await sheet.getByRole('button', { name: /^Replace Walk views/ }).click()
  const connect = page.getByRole('dialog', { name: 'Connect PixelLab' })
  await connect.getByLabel('API key', { exact: true }).fill('synthetic-targeted-repair-key')
  await connect.getByRole('button', { name: 'Connect', exact: true }).click()
  await expect(sheet).toContainText('Offline repair persistence stopped before paid work')
  const scope = await page.evaluate(async () => { const path = '/src/studio/state.svelte.ts', s = await import(path); return s.moving.spec })
  expect(scope).toMatchObject({ id: 'walk', replace: true, dirs: ['east'], items: [fixture.itemId], poseStyle: 'visible-side-v1' })
  expect(posts).toEqual([]); expect(errors).toEqual([])
})

test('partial missing gear and explicit item repair stay on the current move and view', async ({ page, context }, info) => {
  const posts: string[] = []
  await context.route('https://api.pixellab.ai/**', async (r) => {
    if (r.request().method() === 'GET' && new URL(r.request().url()).pathname.endsWith('/balance')) await r.fulfill({ json: { subscription: { type: 'generations', status: 'active', generations: 42, total: 100 }, credits: { usd: 1 } } })
    else { posts.push(r.request().method()); await r.abort() }
  })
  await page.addInitScript(() => { localStorage.setItem('pixeldoll.agentKey', 'off'); localStorage.setItem('pixeldoll.welcomed', '1') })
  await openStudio(page, info.config.projects.find((p) => p.name === 'browser-selftests')!.use.baseURL!)
  const fixture = await targetedRepairFixture(page)
  await page.evaluate(async (id) => {
    const path = '/src/studio/state.svelte.ts', s = await import(path)
    const p = s.store.project, item = p.manifest.items.find((it: { id: string }) => it.id === id)
    for (const layer of item.layers) delete layer.cells.walk.west
    s.store.project = { ...p, manifest: { ...p.manifest, items: p.manifest.items.map((it: { id: string }) => it.id === id ? { ...item } : it) } }
    const dbPath = '/src/lib/store/db.ts', db = await import(dbPath), rec = await db.get('projects', s.doc.id)
    rec.manifest = s.store.project.manifest; await db.put('projects', s.doc.id, rec); await s.openProject(s.doc.id)
    s.ui.anim = 'walk'; s.ui.dir = 'west'; s.ui.all = false; s.pick(id)
    const original = IDBObjectStore.prototype.put
    IDBObjectStore.prototype.put = function(value, key) { if (key === 'studio-move') throw new Error('Scoped repair stopped before paid work'); return original.call(this, value, key) }
  }, fixture.itemId)
  await inspectStage(page)
  const make = page.locator('.stage-note').getByRole('button', { name: /^Make it/ })
  await expect(make).toContainText('Est. 3 gens')
  await make.click()
  const connect = page.getByRole('dialog', { name: 'Connect PixelLab' })
  await connect.getByLabel('API key', { exact: true }).fill('synthetic-partial-repair-key')
  await connect.getByRole('button', { name: 'Connect', exact: true }).click()
  let sheet = page.getByRole('dialog', { name: 'Add a move', exact: true })
  await expect(sheet).toContainText('Scoped repair stopped before paid work')
  const poseScope = await page.evaluate(async () => { const path = '/src/studio/state.svelte.ts', s = await import(path); return s.moving.spec })
  expect(poseScope).toMatchObject({ id: 'walk', dirs: ['west'], items: [fixture.itemId] })
  expect(poseScope.replace).toBeUndefined(); expect(poseScope.itemMethod).toBeUndefined()
  await sheet.getByRole('button', { name: 'Start over', exact: true }).click()
  await sheet.getByRole('button', { name: 'Cancel', exact: true }).click()
  await selectedItemDetails(page)
  const repair = page.getByRole('button', { name: /^Try new item frames/ })
  await expect(repair).toContainText('Est. 10 gens') // The bundled fixture uses actual 64 px equipment layers.
  await oversizedItemFixture(page, fixture.itemId)
  await expect(repair).toContainText('Est. 15 gens')
  await repair.click()
  sheet = page.getByRole('dialog', { name: 'Repair item frames', exact: true })
  await expect(sheet).toContainText('Scoped repair stopped before paid work')
  const gridScope = await page.evaluate(async () => { const path = '/src/studio/state.svelte.ts', s = await import(path); return s.moving.spec })
  expect(gridScope).toMatchObject({ id: 'walk', dirs: ['west'], items: [fixture.itemId], itemMethod: 'grid' })
  expect(gridScope.replace).toBeUndefined(); expect(posts).toEqual([])
})


test('reviewed joint-check recovery reuses cached body identity, discloses charges and persists consent before work', async ({ page, context }, info) => {
  const posts: string[] = []
  await context.route('https://api.pixellab.ai/**', async r => {
    if (r.request().method() === 'GET' && new URL(r.request().url()).pathname.endsWith('/balance')) await r.fulfill({ json: { subscription: { type: 'generations', status: 'active', generations: 42, total: 100 }, credits: { usd: 1 } } })
    else { posts.push(r.request().method()); await r.abort() }
  })
  const errors: string[] = []; page.on('pageerror', e => errors.push(e.message))
  await page.addInitScript(() => { localStorage.setItem('pixeldoll.agentKey', 'off'); localStorage.setItem('pixeldoll.welcomed', '1') })
  await openStudio(page, info.config.projects.find(p => p.name === 'browser-selftests')!.use.baseURL!)
  await targetedRepairFixture(page)
  const original = await page.evaluate(async () => {
    const statePath = '/src/studio/state.svelte.ts', s = await import(statePath), dbPath = '/src/lib/store/db.ts', db = await import(dbPath)
    const projectPath = '/src/lib/store/project.ts', projectModule = await import(projectPath), posePath = '/src/lib/rig/poses.ts', poses = await import(posePath)
    const clipPath = '/src/lib/rig/clips.ts', clips = await import(clipPath), createPath = '/src/studio/create.ts', create = await import(createPath)
    const queuePath = '/src/lib/pixellab/queue.ts', q = await import(queuePath), routePath = '/src/lib/pixellab/routes.ts', routes = await import(routePath)
    const normPath = '/src/lib/rig/normalize.ts', norm = await import(normPath), pngPath = '/src/lib/image/pngraw.ts', pngRaw = await import(pngPath)
    const spec = { id: 'slash', action: 'slash', frames: 8, items: [], seed: 421, replace: true, dirs: ['west'], poseStyle: 'visible-side-v1' }
    const { rec, project } = await projectModule.loadProject(s.doc.id), rig = rec.manifest.rig, rest = rig.rest.west, image = project.images.get(rest.image)
    const keypoints = poses.authoredPoses(spec.action, poses.fromApi(rest.keypoints, rig.cell), 'west', rig.cell.w, spec.poseStyle).map((p: unknown) => poses.toApi(p, rig.cell))
    const req = clips.rawClip({ first: await create.b64(image), rest: rest.keypoints, keypoints, description: rec.character.looks, action: 'slash, empty hands, no weapon, no props, no effects', dir: 'west', seed: spec.seed + 101, view: rig.view })
    const sha = await db.putBlob(await pngRaw.encodePngBytes(image))
    const secondImage = { ...image, data: new Uint8ClampedArray(image.data) }
    for (let i = 0; i < secondImage.data.length; i += 4) if (secondImage.data[i + 3]) { secondImage.data[i] ^= 32; break }
    const secondSha = await db.putBlob(await pngRaw.encodePngBytes(secondImage))
    const raw = { id: 'offline-body-done', tag: 'studio-move', method: req.method, endpoint: req.path, ...await q.requestIdentity(req), state: 'done', attempts: 1, nextAt: 0, createdAt: Date.now(), jobs: [{ id: 'offline-results', status: 'done', done: true, results: keypoints.map((_: unknown, i: number) => ({ label: String(i), sha: i ? secondSha : sha })) }], gens: 3, usd: 0 }
    await db.put('jobs', raw.id, raw)
    const clean = clips.largestComponent(norm.normalize(image, 64, 64, 128, 64).img).img
    const estimate = routes.routes.estimateSkeleton(routes.png(await create.b64(clean)))
    const lost = { id: 'offline-joint-lost', tag: 'studio-move', method: estimate.method, endpoint: estimate.path, ...await q.requestIdentity(estimate), state: 'lost', attempts: 1, nextAt: 0, createdAt: Date.now() + 1, submittedAt: Date.now(), jobs: [], gens: 0, usd: 0, error: 'Synthetic HTTP 500; unknown paid outcome' }
    await db.put('jobs', lost.id, lost)
    const secondClean = clips.largestComponent(norm.normalize(secondImage, 64, 64, 128, 64).img).img
    const pendingReq = routes.routes.estimateSkeleton(routes.png(await create.b64(secondClean)))
    await db.put('jobs', 'offline-joint-pending', { ...lost, id: 'offline-joint-pending', state: 'queued', attempts: 0, ...await q.requestIdentity(pendingReq) })
    await db.put('projects', 'studio-move', { id: 'studio-move', projectId: s.doc.id, spec, status: 'failed', error: 'Joint-check outcome unknown' })
    return { spec, projectId: s.doc.id }
  })
  await reloadStudio(page)
  await expect(page.locator('.world-actors').first()).toBeVisible()
  await page.evaluate(async () => { const p = '/src/studio/state.svelte.ts', s = await import(p); s.ui.sheet = 'move' })
  const sheet = page.getByRole('dialog', { name: 'Replace move views', exact: true })
  await expect(sheet).toContainText('Joint-check outcome unknown')
  await expect(sheet.getByRole('button', { name: 'Retry joint checks', exact: true })).toHaveCount(0)
  await page.evaluate(async () => {
    const dbPath = '/src/lib/store/db.ts', db = await import(dbPath), statePath = '/src/studio/state.svelte.ts', s = await import(statePath), qPath = '/src/lib/pixellab/queue.ts', q = await import(qPath)
    const row = await db.get('jobs', 'offline-joint-pending'), rec = await db.get('projects', s.doc.id)
    row.state = 'done'; row.response = { keypoints: rec.manifest.rig.rest.west.keypoints }
    await db.put('jobs', row.id, row); await q.queue.load()
  })
  const diagnosis = await page.evaluate(async () => { const p = '/src/studio/state.svelte.ts', s = await import(p), c = '/src/studio/create.ts', create = await import(c); try { return await create.measurementRecoveryPlan(s.moving.projectId, s.moving.spec) } catch(e) { return String(e) } })
  expect(diagnosis).toMatchObject({ checks: 1, recordIds: ['offline-joint-lost'] })
  await expect(sheet.getByRole('button', { name: 'Retry joint checks', exact: true })).toBeVisible()
  await expect(sheet).toContainText('Retry 1 unfinished joint check ·')
  await expect(sheet).toContainText('estimated 0.1 gens or $0.005')
  await expect(sheet).toContainText('Unknown checks may already have charged; retrying can charge again')
  await sheet.getByRole('button', { name: 'Retry joint checks', exact: true }).click()
  const connect = page.getByRole('dialog', { name: 'Connect PixelLab' })
  await expect(connect).toBeVisible()
  await connect.getByRole('button', { name: 'Cancel', exact: true }).click()
  await page.evaluate(async () => { const p = '/src/studio/state.svelte.ts', s = await import(p); s.ui.sheet = 'move' })
  await expect(sheet.getByRole('button', { name: 'Retry joint checks', exact: true })).toBeVisible()
  await page.evaluate(() => {
    const put = IDBObjectStore.prototype.put
    IDBObjectStore.prototype.put = function(value, key) { if (key === 'studio-move' && value.status === 'running') throw new Error('Offline consent storage blocked'); return put.call(this, value, key) }
  })
  await sheet.getByRole('button', { name: 'Retry joint checks', exact: true }).click()
  await connect.getByLabel('API key', { exact: true }).fill('synthetic-measurement-recovery-key')
  await connect.getByRole('button', { name: 'Connect', exact: true }).click()
  await expect(sheet).toContainText('Offline consent storage blocked')
  const pending = await page.evaluate(async () => { const p = '/src/studio/state.svelte.ts', s = await import(p); return { spec: s.moving.spec, projectId: s.moving.projectId } })
  expect(pending.projectId).toBe(original.projectId)
  expect(pending.spec).toMatchObject(original.spec)
  expect(pending.spec.measurementRecovery).toMatchObject({ recordIds: ['offline-joint-lost'] })
  expect(pending.spec.measurementRecovery.id).toMatch(/^[a-f0-9-]{36}$/)
  expect(posts).toEqual([]); expect(errors).toEqual([])
})


test('bounded body color correction discloses changed checks and equipment cost before durable consent', async ({ page, context }, info) => {
  const posts: string[] = []
  await context.route('https://api.pixellab.ai/**', async r => {
    if (r.request().method() === 'GET' && new URL(r.request().url()).pathname.endsWith('/balance')) await r.fulfill({ json: { subscription: { type: 'generations', status: 'active', generations: 42, total: 100 }, credits: { usd: 1 } } })
    else { posts.push(r.request().method()); await r.abort() }
  })
  const errors: string[] = []; page.on('pageerror', e => errors.push(e.message))
  await page.addInitScript(() => { localStorage.setItem('pixeldoll.agentKey', 'off'); localStorage.setItem('pixeldoll.welcomed', '1') })
  await openStudio(page, info.config.projects.find(p => p.name === 'browser-selftests')!.use.baseURL!)
  const fixture = await targetedRepairFixture(page)
  const original = await page.evaluate(async itemId => {
    const sPath = '/src/studio/state.svelte.ts', s = await import(sPath), dbPath = '/src/lib/store/db.ts', db = await import(dbPath)
    const pPath = '/src/lib/store/project.ts', projectModule = await import(pPath), posePath = '/src/lib/rig/poses.ts', poses = await import(posePath)
    const clipPath = '/src/lib/rig/clips.ts', clips = await import(clipPath), cPath = '/src/studio/create.ts', create = await import(cPath)
    const qPath = '/src/lib/pixellab/queue.ts', q = await import(qPath), rPath = '/src/lib/pixellab/routes.ts', routes = await import(rPath)
    const pngPath = '/src/lib/image/png.ts', png = await import(pngPath), rawPath = '/src/lib/image/pngraw.ts', rawPng = await import(rawPath)
    const restImage = png.makeImg(64, 64)
    for (let y = 12; y < 60; y++) for (let x = 25; x < 39; x++) restImage.data.set([0, 0, 0, 255], (y * 64 + x) * 4)
    for (let i = 0; i < 8; i++) restImage.data.set([32 * i, 32 * i, 32 * i, 255], (13 * 64 + 25 + i) * 4)
    const rec = await db.get('projects', s.doc.id)
    rec.manifest.rig.rest.west.image = 'sha256:' + await db.putBlob(await rawPng.encodePngBytes(restImage))
    await db.put('projects', s.doc.id, rec)
    const { project } = await projectModule.loadProject(s.doc.id), rig = rec.manifest.rig, rest = rig.rest.west, image = project.images.get(rest.image)
    const spec = { id: 'slash', action: 'slash', frames: 8, items: [itemId], seed: 421, replace: true, dirs: ['west'], poseStyle: 'visible-side-v1' }
    const keypoints = poses.authoredPoses(spec.action, poses.fromApi(rest.keypoints, rig.cell), 'west', rig.cell.w, spec.poseStyle).map((p: unknown) => poses.toApi(p, rig.cell))
    const req = clips.rawClip({ first: await create.b64(image), rest: rest.keypoints, keypoints, description: rec.character.looks, action: 'slash, empty hands, no weapon, no props, no effects', dir: 'west', seed: spec.seed + 101, view: rig.view })
    const results = []
    for (let i = 0; i < keypoints.length; i++) {
      const frame = { ...image, data: new Uint8ClampedArray(image.data) }
      frame.data.set([32 * i, 32 * i, 32 * i, 255], (14 * 64 + 25) * 4)
      for (let n = 0; n < 27; n++) frame.data.set([13, 5, 2, 255], ((20 + Math.floor(n / 14)) * 64 + 25 + n % 14) * 4)
      results.push({ label: String(i), sha: await db.putBlob(await rawPng.encodePngBytes(frame)) })
      const estimate = routes.routes.estimateSkeleton(routes.png(await create.b64(frame)))
      const row = { id: 'palette-original-check-' + i, tag: 'studio-rig', method: estimate.method, endpoint: estimate.path, ...await q.requestIdentity(estimate), state: 'done', attempts: 1, nextAt: 0, createdAt: Date.now(), jobs: [], response: { keypoints: keypoints[i] }, gens: 0.1, usd: 0 }
      await db.put('jobs', row.id, row)
    }
    await db.put('jobs', 'palette-cached-body', { id: 'palette-cached-body', tag: 'studio-rig', method: req.method, endpoint: req.path, ...await q.requestIdentity(req), state: 'done', attempts: 1, nextAt: 0, createdAt: Date.now(), jobs: [{ id: 'palette-offline-results', status: 'done', done: true, results }], gens: 3, usd: 0 })
    await db.put('projects', 'studio-move', { id: 'studio-move', projectId: s.doc.id, spec, status: 'failed', error: 'Palette fit failed; existing body kept' })
    return { spec, projectId: s.doc.id }
  }, fixture.itemId)
  await reloadStudio(page)
  await expect(page.locator('.world-actors').first()).toBeVisible()
  await expect.poll(async () => page.evaluate(async () => { const p = '/src/studio/state.svelte.ts', s = await import(p); return s.moving.error })).toBe('Palette fit failed; existing body kept')
  await page.evaluate(async () => { const p = '/src/studio/state.svelte.ts', s = await import(p); s.ui.sheet = 'move' })
  const sheet = page.getByRole('dialog', { name: 'Replace move views', exact: true })
  await expect(sheet).toContainText('Palette fit failed; existing body kept')
  const action = sheet.getByRole('button', { name: 'Match body colors', exact: true })
  await expect(action).toBeVisible()
  await expect(sheet).toContainText('Match 216 nearby color pixels')
  await expect(sheet).toContainText('8 cached West frames')
  await expect(sheet).toContainText('estimated 0.8 gens or $0.041')
  await expect(sheet).toContainText('estimated 3 additional gens')
  await expect(sheet).toContainText('Existing body views are kept if a check still fails')
  await action.click()
  const connect = page.getByRole('dialog', { name: 'Connect PixelLab' })
  await connect.getByRole('button', { name: 'Cancel', exact: true }).click()
  await page.evaluate(async () => { const p = '/src/studio/state.svelte.ts', s = await import(p); s.ui.sheet = 'move' })
  await expect(action).toBeVisible()
  await page.evaluate(() => {
    const put = IDBObjectStore.prototype.put
    IDBObjectStore.prototype.put = function(value, key) { if (key === 'studio-move' && value.status === 'running') throw new Error('Color consent storage blocked'); return put.call(this, value, key) }
  })
  await action.click()
  await connect.getByLabel('API key', { exact: true }).fill('synthetic-body-color-key')
  await connect.getByRole('button', { name: 'Connect', exact: true }).click()
  await expect(sheet).toContainText('Color consent storage blocked')
  const consent = await page.evaluate(async () => { const p = '/src/studio/state.svelte.ts', s = await import(p); return s.moving.spec })
  expect(consent).toMatchObject(original.spec)
  expect(consent.bodyPaletteRepair).toMatchObject({ version: 'near-rest-v1' })
  expect(consent.bodyPaletteRepair.id).toMatch(/^[a-f0-9-]{36}$/)
  expect(consent.measurementRecovery).toBeUndefined()
  await sheet.getByRole('button', { name: 'Try again', exact: true }).click()
  const fresh = await page.evaluate(async () => { const p = '/src/studio/state.svelte.ts', s = await import(p); return s.moving.spec })
  expect(fresh.seed).not.toBe(original.spec.seed)
  expect(fresh.bodyPaletteRepair).toBeUndefined(); expect(fresh.measurementRecovery).toBeUndefined()
  expect(posts).toEqual([]); expect(errors).toEqual([])
})


test('draft retry prices a fresh item plan rather than historical grid fallbacks and stops when pricing is unavailable', async ({ page, context }, info) => {
  const requests: string[] = []
  await context.route('https://api.pixellab.ai/**', r => { requests.push(r.request().method()); return r.abort() })
  await page.addInitScript(() => { localStorage.setItem('pixeldoll.agentKey', 'off'); localStorage.setItem('pixeldoll.welcomed', '1') })
  await openStudio(page, info.config.projects.find(p => p.name === 'browser-selftests')!.use.baseURL!)
  await targetedRepairFixture(page)
  const expected = await page.evaluate(async () => {
    const p = '/src/studio/state.svelte.ts', s = await import(p), routePath = '/src/studio/itemRoute.ts', route = await import(routePath)
    const projectPath = '/src/lib/store/project.ts', projectModule = await import(projectPath)
    await s.loadGens()
    const ctx = await projectModule.loadProject(s.doc.id), input = { name: 'Fresh retry price', slot: 'main_hand', prompt: 'a steel sword' }
    const draft = route.itemRoute.draft(ctx, input, [])
    draft.calls = [{ kind: 'grid', cells: Array.from({ length: 8 }, (_, i) => 'walk/west/' + i), seed: 1, old: [], rerolls: 2 }]
    s.gens.push({ draft, input, phase: 'failed', status: 'Stopped', error: 'Synthetic completed fallback failed review' })
    s.ui.inspTab = 'item'; s.ui.selected = 'gen:' + draft.spec.id
    return route.itemRoute.plan(ctx.rec.manifest.rig, ctx, input).gens
  })
  await equipmentGroup(page, 'Hands')
  const panel = page.locator('.gen'), retry = panel.getByRole('button', { name: /^Try again/ })
  expect(expected).toBeGreaterThan(15)
  await expect(retry).toBeEnabled()
  await expect(retry).toHaveText(`Try again Est. ${expected} gens`)
  await page.evaluate(async () => {
    const p = '/src/studio/state.svelte.ts', s = await import(p)
    const g = s.gens.find((g: { draft: { spec: { id: string } } }) => 'gen:' + g.draft.spec.id === s.ui.selected)
    g.draft.calls.push({ kind: 'grid', cells: Array.from({ length: 15 }, (_, i) => 'walk/east/' + i), seed: 2, old: [], rerolls: 2 })
  })
  await expect(retry).toHaveText(`Try again Est. ${expected} gens`)
  await page.evaluate(async () => {
    const p = '/src/studio/state.svelte.ts', s = await import(p)
    s.gens.find((g: { draft: { spec: { id: string } } }) => 'gen:' + g.draft.spec.id === s.ui.selected).draft.rigId = 'rig-unavailable-retry-price'
  })
  await expect(panel).toContainText('Could not estimate this retry. Reopen the character and try again.')
  await expect(retry).toBeDisabled()
  expect(requests).toEqual([])
})


async function freePaletteFixture(page: Page, shared = false) {
  const fixture = await targetedRepairFixture(page)
  await oversizedItemFixture(page, fixture.itemId)
  const before = await page.evaluate(async ({ id, shared }) => {
    const p = '/src/studio/state.svelte.ts', s = await import(p), dbPath = '/src/lib/store/db.ts', db = await import(dbPath)
    const pngPath = '/src/lib/image/png.ts', png = await import(pngPath), rawPath = '/src/lib/image/pngraw.ts', raw = await import(rawPath)
    const rec = await db.get('projects', s.doc.id), item = rec.manifest.items.find((it: { id: string }) => it.id === id), metalId = id + '-fixed-metal'
    const materials = [
      { id: metalId, owner: id, label: 'Metal', ramp: ['#808080', '#c0c0c0'], variants: { azure: ['#2255aa', '#77aaff'] } },
      { id: id + '-fixed-outline', owner: id, label: 'Outline', ramp: ['#101010'], variants: {} },
    ]
    rec.manifest.materials = [...rec.manifest.materials.filter((m: { owner: string }) => m.owner !== id), ...materials]
    item.materials = materials.map(m => m.id); item.status = 'accepted'; item.baseHash = rec.manifest.rig.baseHash
    item.designWarnings = ['D1 keyframe rest/west/0: gray smudges']
    if (item.qa) item.qa.status = 'warn'
    const image = png.makeImg(96, 96)
    for (const [offset, rgb] of [[0, [133, 133, 133]], [1, [240, 240, 240]], [2, [192, 128, 96]], [3, [16, 16, 16]]] as [number, number[]][]) image.data.set([...rgb, 255], (40 * 96 + 40 + offset) * 4)
    const hash = 'sha256:' + await db.putBlob(await raw.encodePngBytes(image))
    for (const layer of item.layers) layer.cells.walk.west = Array.from({ length: 8 }, () => null)
    item.layers[0].cells.walk.west[0] = hash; item.layers[0].cells.walk.west[1] = hash
    await db.put('projects', s.doc.id, rec); await s.openProject(s.doc.id)
    s.ui.anim = 'walk'; s.ui.dir = 'west'; s.ui.frame = 0; s.ui.playing = false; s.pick(id)
    s.setVariant(metalId, 'azure'); await s.flushSave()
    if (shared) {
      const projectPath = '/src/lib/store/project.ts', projectModule = await import(projectPath), designPath = '/src/lib/equipment/design.ts', designs = await import(designPath), compatibilityPath = '/src/lib/equipment/compatibility.ts', compatibility = await import(compatibilityPath), copyPath = '/src/lib/equipment/copy.ts', copies = await import(copyPath), storePath = '/src/lib/equipment/store.ts', equipmentStore = await import(storePath)
      const ctx = await projectModule.loadProject(s.doc.id), design = await designs.createDesign(ctx.project, id, s.doc.variants, 'Pinned palette fixture'), pinned = ctx.rec.manifest.items.find((it: { id: string }) => it.id === id)
      pinned.design = { designId: design.id, revision: design.revision, snapshot: equipmentStore.snapshotDesign(design), roleMaterials: Object.fromEntries(pinned.materials.map((m: string) => [m, m])), targetAudit: await compatibility.targetAudit(ctx.project), targetStamp: copies.targetStamp(ctx.rec.manifest, pinned.slot), dressedStamp: designs.restStamp(ctx.rec.manifest) }
      await db.put('projects', s.doc.id, ctx.rec); await s.openProject(s.doc.id); s.ui.anim = 'walk'; s.ui.dir = 'west'; s.ui.playing = false; s.pick(id)
    }
    const saved = await db.get('projects', s.doc.id), savedItem = saved.manifest.items.find((it: { id: string }) => it.id === id)
    const unscoped = structuredClone(savedItem.layers); for (const layer of unscoped) delete layer.cells.walk.west
    return { projectId: s.doc.id, metalId, materials: saved.manifest.materials, presets: saved.manifest.presets, variants: s.doc.variants, qa: savedItem.qa, warnings: savedItem.designWarnings, provenance: savedItem.provenance, rig: saved.manifest.rig, unscoped, sourceHash: hash }
  }, { id: fixture.itemId, shared })
  const diagnosis = await page.evaluate(async id => { const p = '/src/studio/state.svelte.ts', s = await import(p), r = '/src/lib/items/run.ts', run = await import(r); try { return await run.itemPaletteRepairPlan(s.doc.id, id, 'walk', 'west') } catch (e) { return String(e) } }, fixture.itemId)
  expect(diagnosis).toMatchObject({ changedPixels: 2, changedFrames: [0, 1], unmatchedPixels: 2 })
  return { ...fixture, ...before }
}

for (const changed of ['item', 'rig'] as const) test(`free item color matching refuses a stale ${changed} review without changing any pixels`, async ({ page, context }, info) => {
  const requests: string[] = []
  await context.route('https://api.pixellab.ai/**', r => { requests.push(r.request().method()); return r.abort() })
  await page.addInitScript(() => { localStorage.setItem('pixeldoll.agentKey', 'off'); localStorage.setItem('pixeldoll.welcomed', '1') })
  await openStudio(page, info.config.projects.find(p => p.name === 'browser-selftests')!.use.baseURL!)
  const fixture = await freePaletteFixture(page), pane = await selectedItemDetails(page)
  const action = pane.getByRole('button', { name: /^Match item colors.*Free$/ })
  await expect(action).toBeVisible()
  await page.evaluate(async ({ id, changed }) => {
    const p = '/src/studio/state.svelte.ts', s = await import(p), dbPath = '/src/lib/store/db.ts', db = await import(dbPath), rec = await db.get('projects', s.doc.id)
    if (changed === 'item') rec.manifest.items.find((it: { id: string }) => it.id === id).prompt += ', changed after preview'
    else rec.manifest.rig.view = rec.manifest.rig.view === 'side' ? 'low top-down' : 'side'
    await db.put('projects', s.doc.id, rec)
  }, { id: fixture.itemId, changed })
  await action.click()
  await expect(pane).toContainText('This item or its colors changed. Review the color match again.')
  const saved = await page.evaluate(async id => {
    const p = '/src/studio/state.svelte.ts', s = await import(p), dbPath = '/src/lib/store/db.ts', db = await import(dbPath), rec = await db.get('projects', s.doc.id), it = rec.manifest.items.find((i: { id: string }) => i.id === id)
    return { hash: it.layers[0].cells.walk.west[0], audit: it.paletteRepairs }
  }, fixture.itemId)
  expect(saved.hash).toBe(fixture.sourceHash); expect(saved.audit).toBeUndefined()
  expect(requests).toEqual([])
})
