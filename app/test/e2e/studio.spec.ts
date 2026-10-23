import { expect, test, type Page } from '@playwright/test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { unzip, zip } from '../../src/lib/store/zip.ts'

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
  const stage = (await page.locator('.stage-art').boundingBox())!
  const boxes = []
  for (const [i, direction] of directions.entries()) {
    const cell = cells.nth(i)
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
    expect(box.y + box.height).toBeLessThanOrEqual(stage.y + stage.height - 64)
    boxes.push(box)
    if (i % columns) {
      expect(box.y).toBeCloseTo(boxes[i - 1].y)
      expect(box.x).toBeGreaterThan(boxes[i - 1].x + boxes[i - 1].width)
    }
    if (i >= columns) {
      expect(box.x).toBeCloseTo(boxes[i - columns].x)
      expect(box.y).toBeGreaterThan(boxes[i - columns].y + boxes[i - columns].height)
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
  await page.goto(`${BASE}/#/`, { waitUntil: 'networkidle' })
  await page.waitForSelector('.stage canvas')
  const pressed = (name: string) => page.locator(`.wardrobe .wear[aria-label="Wear ${name}"]`).getAttribute('aria-pressed')
  const stage = () => page.locator('.stage canvas').first().evaluate((c) => (c as HTMLCanvasElement).toDataURL())
  const step = (s: string) => console.log('ok', s)

  // pause playback so the stage is comparable
  await page.keyboard.press('Space')
  assert.equal(await pressed('Steel helmet'), 'true')
  await page.locator('.wardrobe .row', { hasText: 'Wizard hat' }).click()
  assert.equal(await pressed('Wizard hat'), 'true')
  assert.equal(await pressed('Steel helmet'), 'false')
  step('wear swaps the item in the slot')

  await page.locator('.wardrobe .row', { hasText: 'Wizard hat' }).click()
  assert.equal(await pressed('Wizard hat'), 'true')
  assert.equal(await page.locator('.insp-title').textContent(), 'Wizard hat')
  step('tapping a worn item selects it, it stays on (T1 P2-1)')

  await page.getByRole('button', { name: /^Undo/ }).click()
  assert.equal(await pressed('Steel helmet'), 'true')
  await page.keyboard.press('Control+Shift+Z')
  assert.equal(await pressed('Wizard hat'), 'true')
  step('undo / redo (button + shortcut)')

  const before = await stage()
  await page.getByRole('tab', { name: 'Colours' }).click()
  await page.locator('.colours .swatch[aria-label="azure"]').first().click()
  assert.notEqual(await stage(), before)
  assert.equal(await page.locator('.colours .swatch[aria-label="azure"]').first().getAttribute('aria-checked'), 'true')
  step('recolour changes the stage pixels')

  await page.locator('[aria-label="Save current look"]').click()
  await page.locator('input[aria-label="Outfit name"]').fill('Smoke look')
  await page.getByRole('button', { name: 'Save', exact: true }).click()
  await page.locator('.wardrobe .row', { hasText: 'Smoke look' }).waitFor()
  assert.ok(await page.locator('.wardrobe .row', { hasText: 'Smoke look' }).locator('.badge').isVisible())
  step('outfit saved and marked current')

  await page.keyboard.press('2')
  assert.equal(await page.getByRole('button', { name: 'Face east' }).getAttribute('aria-pressed'), 'true')
  await page.keyboard.press('0')
  assert.equal(await page.locator('.all-dirs canvas').count(), 4)
  await expectDirectionGrid(page, ['south', 'north', 'west', 'east'], 2)
  await page.keyboard.press('0')
  step('keyboard: direction + all directions')

  await page.getByRole('button', { name: 'Switch to light mode' }).click()
  assert.equal(await page.evaluate(() => document.documentElement.dataset.theme), 'light')
  step('theme switch')

  await page.waitForTimeout(800) // autosave debounce
  await page.reload({ waitUntil: 'networkidle' })
  await page.waitForSelector('.stage canvas')
  assert.equal(await pressed('Wizard hat'), 'true')
  assert.ok(await page.locator('.wardrobe .row', { hasText: 'Smoke look' }).isVisible())
  assert.equal(await page.evaluate(() => document.documentElement.dataset.theme), 'light')
  step('outfit, colours, presets and theme survive a reload')

  await page.getByRole('button', { name: 'Export' }).first().click()
  const dl = page.getByRole('button', { name: /Download zip · \d+ KB/ })
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

  // ---- B15: base colours, Create options, offline banner ----
  await page.getByRole('tab', { name: 'Colours' }).click()
  assert.deepEqual((await page.locator('.insp .colours .mat > .muted').allTextContents()).slice(0, 3), ['Shirt', 'Shorts', 'Skin'])
  step('base colours: Shirt, Shorts and Skin recolour separately')
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
  assert.notEqual(await cost(), eight)
  await page.getByRole('button', { name: '96', exact: true }).click()
  assert.equal(await page.getByRole('spinbutton', { name: 'Frame size', exact: true }).inputValue(), '128')
  await page.keyboard.press('Escape')
  await page.waitForFunction(() => !document.querySelector('dialog[open]'))
  step('Create: visible size and direction controls update frame and full generation cost')
  await ctx.setOffline(true)
  await page.locator('.offline-banner', { hasText: "You're offline" }).waitFor()
  await page.waitForFunction(() => !window.__queue || window.__queue.paused === 'offline') // __queue/__studio are dev-server only
  await page.locator('.wardrobe .row', { hasText: 'Wizard hat' }).click() // everything else still works (selects the worn hat)
  assert.equal(await page.evaluate(() => window.__studio?.ui.selected ?? 'hat_wizard'), 'hat_wizard')
  await ctx.setOffline(false)
  await page.locator('.offline-banner').waitFor({ state: 'detached' })
  await page.waitForFunction(() => !window.__queue || window.__queue.paused === null)
  step('offline: banner + queue paused, back online: banner gone, queue resumed')

  // ---- B10: sheets ----
  // T1 P0: Create without a key -> the Connect sheet replaces it (8afef4f)
  await page.locator('.project-btn').click()
  await page.getByRole('menuitem', { name: 'New character…' }).click()
  await page.locator('dialog textarea').fill('a cheerful elf archer')
  assert.equal(await page.evaluate(() => document.activeElement?.tagName), 'TEXTAREA') // first field focused, not Cancel
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
  await page.locator('.canvas-bar select').selectOption('cross-punch')
  for (const d of ['east', 'north', 'west']) assert.ok(await page.getByRole('button', { name: `Face ${d}` }).isDisabled(), `cross punch ${d} disabled`)
  assert.equal(await page.getByRole('button', { name: 'Face south' }).getAttribute('aria-pressed'), 'true')
  await page.getByRole('button', { name: 'All directions', exact: true }).click()
  await expectDirectionGrid(page, ['south'], 1)
  await page.getByRole('button', { name: 'Show south only', exact: true }).click()
  await page.locator('.canvas-bar select').selectOption('walk')
  await page.getByRole('button', { name: 'Face north' }).click()
  await page.locator('.stage-note', { hasText: 'Wizard hat' }).waitFor()
  assert.ok(await page.locator('.stage-note').getByRole('button', { name: 'Make your own' }).isVisible())
  await page.getByRole('button', { name: 'Face south' }).click()
  assert.equal(await page.locator('.stage-note').count(), 0)
  step('cross punch is south only; a worn item without north frames is called out (P1-1)')

  // ---- T2: arrow keys in segmented controls; dev rigs out of the character list ----
  await page.getByRole('button', { name: 'Face south' }).focus()
  await page.keyboard.press('ArrowRight')
  assert.equal(await page.getByRole('button', { name: 'Face east' }).getAttribute('aria-pressed'), 'true')
  assert.ok(await page.evaluate(() => document.activeElement?.getAttribute('aria-label') === 'Face east'))
  step('arrow keys move the direction segmented control')
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
  assert.equal(await page.locator('#project-menu > .row', { hasText: 'E2E dev rig' }).count(), 0)
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
    await p.goto(`${BASE}/#/`, { waitUntil: 'networkidle' })
    await p.waitForSelector('.stage canvas')
    await fn(p)
    await c.close()
  }
  for (const [name, vp] of [['phone', { width: 375, height: 812 }], ['landscape', { width: 812, height: 375 }]] as const)
    await at(vp, async (p) => {
      assert.ok(await p.getByRole('button', { name: /^Redo/ }).isVisible(), `${name}: redo`)
      await p.getByRole('button', { name: 'Random look' }).click()
      assert.ok(await p.getByRole('button', { name: /^Undo Random look/ }).isEnabled(), `${name}: random look`)
      await p.getByRole('tab', { name: 'Outfits' }).click()
      await p.getByRole('button', { name: 'Save current look' }).click()
      await p.locator('input[aria-label="Outfit name"]').fill('Phone look')
      await p.getByRole('button', { name: 'Save', exact: true }).click()
      await p.locator('.row', { hasText: 'Phone look' }).waitFor()
      step(`${name}: Outfits, Random look and Redo reachable (P1-2)`)
    })
  await at({ width: 768, height: 1024 }, async (p) => {
    assert.ok(await p.locator('.tiles').isVisible(), 'tablet: wardrobe tiles visible')
    const box = await p.locator('.stage canvas').first().boundingBox()
    assert.ok(box && box.y + box.height < 560, `tablet: character above the wardrobe ${JSON.stringify(box)}`)
    await p.getByRole('tab', { name: 'Head' }).click()
    await p.locator('.tile', { hasText: 'Steel helmet' }).click()
    assert.equal(await p.locator('.drawer, .drawer-scrim').count(), 0)
    step('tablet portrait: stage over the wardrobe, nothing covers the character (P1-3)')
  })

  // ---- B17: agent mode (npm run dev:agent) auto-connects; keyless servers show Connect and no badge ----
  {
    const c = await browser.newContext({ viewport: { width: 1440, height: 900 } })
    await c.addInitScript(() => { localStorage.setItem('pixeldoll.welcomed', '1'); localStorage.setItem('pixeldoll.agentKey', 'off') })
    const p = await c.newPage()
    p.on('pageerror', (e) => errors.push(e.message))
    await p.goto(`${BASE}/#/`, { waitUntil: 'networkidle' })
    await p.waitForSelector('.stage canvas')
    if (await p.locator('.agent-badge').count()) {
      await p.locator('.tb-trail .balance', { hasText: /gens$/ }).waitFor({ timeout: 15_000 }) // key never read back or printed
      step('agent server: badge shown, auto-connected (balance loaded)')
    } else {
      assert.ok(await p.locator('.tb-trail .balance', { hasText: 'Connect' }).isVisible())
      await p.locator('.tb-trail .balance', { hasText: 'Connect' }).click()
      await p.waitForFunction(() => document.querySelector('dialog[open] h2')?.textContent === 'Connect PixelLab')
      assert.equal(await p.locator('dialog[open] [data-testid=dev-key], dialog[open] button', { hasText: /dev key/i }).count(), 0)
      step('keyless server: no agent badge, Connect sheet has no dev-key option')
    }
    await c.close()
  }

  assert.deepEqual(errors, [])
  assert.deepEqual(unexpectedRequests, [], 'demo tests must never call the paid API')
})

test('Inspector animation stays stable and eight-direction previews fit the panel', async ({ page }) => {
  await page.route('https://api.pixellab.ai/**', (route) => route.abort())
  await page.addInitScript(() => { localStorage.setItem('pixeldoll.agentKey', 'off'); localStorage.setItem('pixeldoll.welcomed', '1') })
  await page.goto('/#/')
  await page.getByRole('button', { name: 'New head item', exact: true }).click()
  await page.getByRole('button', { name: 'Copy the demo body', exact: true }).click()
  await page.getByRole('textbox', { name: 'What is it?', exact: true }).waitFor()
  await page.getByRole('button', { name: 'Cancel', exact: true }).click()
  await page.getByRole('button', { name: 'Red cape', exact: true }).click()
  await page.getByRole('button', { name: 'Pause', exact: true }).click()
  const inspector = page.getByRole('complementary', { name: 'Inspector', exact: true })
  async function checkFrames() {
    const geometry: string[] = [], pixels: string[] = []
    for (let frame = 0; frame < 8; frame++) {
      await page.keyboard.press('.')
      geometry.push(JSON.stringify(await inspector.locator('.dir-strip').boundingBox()))
      geometry.push(JSON.stringify(await inspector.locator('.actions').first().boundingBox()))
      pixels.push(await inspector.locator('.dir-strip canvas').first().evaluate((c) => (c as HTMLCanvasElement).toDataURL()))
      const strip = (await inspector.locator('.dir-strip').boundingBox())!
      for (const sprite of await inspector.locator('.dir-strip canvas').all()) {
        const b = (await sprite.boundingBox())!
        expect(b.x).toBeGreaterThanOrEqual(strip.x)
        expect(b.x + b.width).toBeLessThanOrEqual(strip.x + strip.width)
      }
    }
    expect(new Set(geometry.filter((_, i) => i % 2 === 0)).size).toBe(1)
    expect(new Set(geometry.filter((_, i) => i % 2 === 1)).size).toBe(1)
    expect(new Set(pixels).size).toBeGreaterThan(1)
  }
  await checkFrames()
  await inspector.getByRole('button', { name: 'Remove', exact: true }).click()
  await page.getByRole('button', { name: 'Steel helmet', exact: true }).click()
  await expect(inspector.getByRole('button', { name: 'Remove for good', exact: true })).toHaveCount(0)

  // Disposable layout fixture: duplicate stored east artwork into the extra directions, without generation.
  await page.getByRole('button', { name: 'Export', exact: true }).click()
  const download = page.waitForEvent('download')
  await page.getByRole('button', { name: /Download zip/ }).click()
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
  await page.getByRole('button', { name: 'Red cape', exact: true }).click()
  await expect(inspector.locator('.dir-strip canvas')).toHaveCount(8)
  await checkFrames()
  await page.getByRole('button', { name: 'All directions', exact: true }).click()
  for (const viewport of [{ width: 1440, height: 900 }, { width: 1024, height: 768 }, { width: 375, height: 812 }, { width: 812, height: 375 }]) {
    await page.setViewportSize(viewport)
    await expectDirectionGrid(page, ['north-west', 'north', 'north-east', 'west', null, 'east', 'south-west', 'south', 'south-east'], 3)
  }
  await page.getByRole('button', { name: 'Show east only', exact: true }).click()
  await expect(page.locator('.all-dirs')).toHaveCount(0)
  await expect(page.locator('.stage-art [role="img"]')).toHaveAttribute('aria-label', /facing east/)
  // At the smallest desktop breakpoint both sidebars leave only 476px for the stage.
  // The toolbar itself fitted before this fix, but its Move label collapsed and overlapped the directions.
  await page.setViewportSize({ width: 1024, height: 768 })
  const controls = page.getByRole('toolbar', { name: 'Preview controls' })
  await expect(controls.getByRole('combobox', { name: 'Direction', exact: true })).toBeVisible()
  const moveBox = (await controls.getByRole('combobox', { name: 'Move', exact: true }).boundingBox())!
  const dirBox = (await controls.getByRole('combobox', { name: 'Direction', exact: true }).boundingBox())!
  expect(moveBox.width).toBeGreaterThan(50)
  expect(moveBox.x + moveBox.width).toBeLessThanOrEqual(dirBox.x)
  await page.setViewportSize({ width: 1440, height: 900 })
  const tabs = inspector.getByRole('tablist', { name: 'Inspector' })
  const top = (await tabs.boundingBox())!.y
  await inspector.getByRole('tab', { name: 'Colours', exact: true }).click()
  const content = (await inspector.locator('.inspector-content').boundingBox())!
  await page.mouse.move(content.x + content.width / 2, content.y + content.height / 2)
  await page.mouse.wheel(0, 2000)
  await expect.poll(() => inspector.locator('.inspector-content').evaluate((el) => el.scrollTop)).toBeGreaterThan(0)
  expect((await tabs.boundingBox())!.y).toBe(top)
  await page.getByRole('button', { name: 'Wizard hat', exact: true }).click()
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
  const toolbar = (await page.getByRole('toolbar', { name: 'Preview controls' }).boundingBox())!
  await expect.poll(async () => {
    const lastView = (await page.getByRole('button', { name: 'Show south-east only', exact: true }).boundingBox())!
    return lastView.y + lastView.height
  }).toBeLessThanOrEqual(toolbar.y)
})

test('desktop resize keeps preview controls inside the stage when switching panels', async ({ page }) => {
  await page.addInitScript(() => { localStorage.setItem('pixeldoll.agentKey', 'off'); localStorage.setItem('pixeldoll.welcomed', '1') })
  await page.goto('/#/')
  await page.locator('.stage canvas').first().waitFor()
  await page.setViewportSize({ width: 700, height: 650 })
  const wardrobe = page.getByRole('complementary', { name: 'Wardrobe', exact: true })
  const inspector = page.getByRole('complementary', { name: 'Inspector', exact: true })
  const controlsFit = async () => {
    const stage = (await page.getByRole('main', { name: 'Preview' }).boundingBox())!
    const controls = (await page.getByRole('toolbar', { name: 'Preview controls' }).boundingBox())!
    expect(controls.x).toBeGreaterThanOrEqual(stage.x)
    expect(controls.x + controls.width).toBeLessThanOrEqual(stage.x + stage.width)
  }
  await expect(wardrobe).toBeVisible()
  await expect(inspector).toHaveCount(0)
  await controlsFit()
  await page.getByRole('button', { name: 'Inspector', exact: true }).click()
  await expect(inspector).toBeVisible()
  await expect(wardrobe).toHaveCount(0)
  await controlsFit()
  await page.setViewportSize({ width: 600, height: 600 })
  await controlsFit()
  await page.getByRole('button', { name: 'Wardrobe', exact: true }).click()
  await expect(wardrobe).toBeVisible()
  await expect(inspector).toHaveCount(0)
  await controlsFit()
  await page.keyboard.press('Control+Alt+i')
  await expect(inspector).toBeVisible()
  await expect(wardrobe).toHaveCount(0)
  await page.setViewportSize({ width: 1440, height: 900 })
  await expect(wardrobe).toBeVisible()
  await expect(inspector).toBeVisible()
})

test('canceling Connect preserves generation drafts and discards the pending action', async ({ page }) => {
  const paidRequests: string[] = []
  await page.route('https://api.pixellab.ai/**', async (route) => {
    if (route.request().method() === 'GET' && new URL(route.request().url()).pathname === '/v2/balance') {
      await route.fulfill({ json: { subscription: { type: 'generations', status: 'active', generations: 42, total: 100 }, credits: { usd: 0 } } })
    } else { paidRequests.push(route.request().method() + ' ' + new URL(route.request().url()).pathname); await route.abort() }
  })
  await page.addInitScript(() => { localStorage.setItem('pixeldoll.agentKey', 'off'); localStorage.setItem('pixeldoll.welcomed', '1') })
  await page.goto('/#/')
  await page.getByRole('button', { name: 'New head item', exact: true }).click()
  await page.getByRole('button', { name: 'Copy the demo body', exact: true }).click()
  const item = page.getByRole('dialog', { name: 'New item', exact: true })
  await item.getByRole('radio', { name: 'Hands', exact: true }).click()
  await item.getByRole('textbox', { name: 'What is it?', exact: true }).fill('a silver sword')
  await item.getByRole('radio', { name: 'azure', exact: true }).click()
  await item.getByRole('button', { name: /^Make/ }).click()
  await page.getByRole('dialog', { name: 'Connect PixelLab' }).getByRole('button', { name: 'Cancel', exact: true }).click()
  await page.getByRole('button', { name: 'New head item', exact: true }).click()
  await expect(item.getByRole('textbox', { name: 'What is it?', exact: true })).toHaveValue('a silver sword')
  await expect(item.getByRole('radio', { name: 'Hands', exact: true })).toHaveAttribute('aria-checked', 'true')
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
  await page.getByRole('button', { name: 'Connect', exact: true }).click()
  const connect = page.getByRole('dialog', { name: 'Connect PixelLab' })
  await connect.getByLabel('API key', { exact: true }).fill('synthetic-manual-qa-key')
  await connect.getByRole('button', { name: 'Connect', exact: true }).click()
  await expect(page.locator('.tb-trail .balance')).toContainText('42 gens')
  await expect(page.getByRole('dialog')).toHaveCount(0)
  expect(paidRequests).toEqual([])
  await page.locator('.project-btn').click()
  await page.getByRole('menuitem', { name: 'Welcome screen', exact: true }).click()
  await page.getByRole('button', { name: 'Try the demo', exact: true }).click()
  await expect(page.locator('.project-btn')).toHaveText('Adventurer (demo)')
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
    await page.goto('/#/');
    await page.locator('.project-btn').click();
    await page.getByRole('menuitem', { name: initial === 'old-only' ? 'Connect PixelLab…' : 'PixelLab key', exact: true }).click();
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
    await page.reload();
    expect(await page.evaluate(() => [localStorage.getItem('pixellabApiKey'), localStorage.getItem('pixeldoll.apiKey'), localStorage.getItem('pixellab-backpack:key-kept')])).toEqual([null, initial === 'shared' ? null : legacy, 'other-app-legacy-key']);
    await expect(page.locator('.tb-trail .balance')).toContainText('Connect');
    expect(requests).toBe(beforeReload);
  });
}

test('setup and move drafts survive cancelled connection and stay scoped to their character', async ({ page, context }) => {
  const requests: string[] = []
  await context.route('https://api.pixellab.ai/**', async (route) => { requests.push(route.request().method()); await route.abort() })
  await page.addInitScript(() => { localStorage.setItem('pixeldoll.agentKey', 'off'); localStorage.setItem('pixeldoll.welcomed', '1') })
  await page.goto('/')
  await page.locator('.stage canvas').first().waitFor()
  await page.getByRole('button', { name: 'Export', exact: true }).click()
  const downloading = page.waitForEvent('download')
  await page.getByRole('button', { name: /Download zip/ }).click()
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
  await setup.getByRole('textbox', { name: /Existing appearance/ }).fill('Blue vest, bald, grey shorts')
  await setup.getByRole('button', { name: /^Set up ·/ }).click()
  await page.getByRole('dialog', { name: 'Connect PixelLab' }).getByRole('button', { name: 'Cancel', exact: true }).click()
  await expect(page.getByRole('dialog')).toHaveCount(0)
  await page.locator('.project-btn').click()
  await page.getByRole('menuitem', { name: 'Set up character…', exact: true }).click()
  await expect(setup.getByRole('textbox', { name: /Existing appearance/ })).toHaveValue('Blue vest, bald, grey shorts')
  await setup.getByRole('button', { name: 'Later', exact: true }).click()
  await expect(page.getByRole('dialog')).toHaveCount(0)
  await page.getByRole('tab', { name: 'Moves', exact: true }).click()
  await page.getByRole('button', { name: 'Add a move', exact: true }).click()
  const move = page.getByRole('dialog', { name: 'Add a move', exact: true })
  await move.getByRole('radio', { name: 'Cast', exact: true }).click()
  await move.getByRole('textbox', { name: /Or describe it/ }).fill('jumping in place')
  await move.getByRole('checkbox', { name: new RegExp(vest.name) }).uncheck()
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
