import { expect, test, type Page, type Route } from '@playwright/test'
import { CharacterApi } from '../fixtures/character-api.ts'
import { readFile } from 'node:fs/promises'
import { unzip } from '../../src/lib/store/zip.ts'
import { flipH } from '../../src/lib/rig/mirror.ts'
import { decodePngBytes } from '../../src/lib/image/pngraw.ts'
import type { Manifest } from '../../src/lib/store/manifest.ts'
const fulfill = async (route: Route, response: Response) => route.fulfill({ status: response.status, headers: Object.fromEntries(response.headers), body: Buffer.from(await response.arrayBuffer()) })

test.beforeEach(async ({ context }) => {
  await context.addInitScript(() => {
    localStorage.setItem('pixeldoll.agentKey', 'off'); localStorage.setItem('pixeldoll.welcomed', '1')
    Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { writeText: async (text: string) => sessionStorage.setItem('creator-copy', text) } })
  })
})
async function open(page: Page) {
  await page.goto('/')
  await page.locator('.project-btn').click()
  await page.getByRole('menuitem', { name: 'New character…', exact: true }).click()
  return page.getByRole('dialog', { name: 'New character', exact: true })
}
async function connect(page: Page) {
  await page.getByLabel('API key', { exact: true }).fill('offline-fixture-not-a-real-key')
  await page.getByRole('dialog', { name: 'Connect PixelLab' }).getByRole('button', { name: 'Connect', exact: true }).click()
}

test('visible size fields, auto frame, preset deselection and preview positions stay consistent', async ({ page, context }) => {
  const calls: string[] = []; await context.route('https://*.pixellab.ai/**', async route => { calls.push(route.request().url()); await route.abort() })
  const sheet = await open(page), body = sheet.getByRole('spinbutton', { name: 'Body size', exact: true }), frame = sheet.getByRole('spinbutton', { name: 'Frame size', exact: true })
  const before = await sheet.getByRole('img', { name: /^Size guide:/ }).boundingBox()
  for (const [size, expected] of [[48, 64], [64, 80], [96, 128], [128, 160]]) {
    await sheet.getByRole('button', { name: String(size), exact: true }).click()
    await expect(body).toHaveValue(String(size)); await expect(frame).toHaveValue(String(expected))
    const after = await sheet.getByRole('img', { name: /^Size guide:/ }).boundingBox(); expect(after?.y).toBe(before?.y)
  }
  await body.fill('64'); await expect(sheet.locator('.body-presets [aria-pressed=true]')).toHaveCount(0)
  await expect(frame).toHaveValue('80'); await frame.fill('112')
  await expect(sheet.getByRole('button', { name: 'Auto', exact: true })).toHaveAttribute('aria-pressed', 'false')
  await body.fill('48'); await expect(frame).toHaveValue('112')
  await sheet.getByRole('button', { name: 'Auto', exact: true }).click(); await expect(frame).toHaveValue('64')
  await sheet.getByRole('button', { name: 'Auto', exact: true }).click(); await expect(frame).toBeFocused()
  expect((await sheet.getByRole('button', { name: 'Auto', exact: true }).boundingBox())!.width).toBeCloseTo((await sheet.getByRole('button', { name: '48', exact: true }).boundingBox())!.width)
  await expect(sheet.locator('.pixel-input > span')).toHaveText(['px', 'px']); expect(calls).toEqual([])
  await body.fill('64.5')
  await expect(sheet.getByRole('status')).toContainText('whole pixels')
  await expect(sheet.getByRole('button', { name: 'Create character', exact: true })).toBeDisabled()
  await body.fill('64'); await frame.fill('80'); await expect(sheet.locator('.creator-validation')).toHaveCount(0)
})

test('linked prompt is lossless, copy is exact, and keyboard tabs work', async ({ page }) => {
  const sheet = await open(page)
  const details = sheet.getByRole('textbox', { name: 'Details', exact: true })
  await details.pressSequentially('A freckled elf ')
  await expect(details).toHaveValue('A freckled elf ')
  await sheet.getByRole('combobox', { name: 'Kind', exact: true }).selectOption('Elf')
  await sheet.getByRole('tab', { name: 'Appearance', exact: true }).press('ArrowRight')
  const prompt = sheet.getByRole('textbox', { name: 'Exact prompt', exact: true })
  expect(await prompt.inputValue()).toContain('Kind: Elf')
  const exact = 'Not an elf.\n\nKind: Orc\nBuild: Broad\nProportions: Chibi\nSkin: Pale\nKeep this  \n'
  await prompt.fill(exact); await sheet.getByRole('button', { name: 'Copy exact prompt', exact: true }).click()
  expect(await page.evaluate(() => sessionStorage.getItem('creator-copy'))).toBe(exact)
  await sheet.getByRole('tab', { name: 'Prompt', exact: true }).press('Home')
  for (const [name, value] of [['Kind', 'Orc'], ['Build', 'Broad'], ['Proportions', 'Chibi'], ['Skin', 'Pale']]) await expect(sheet.getByRole('combobox', { name, exact: true })).toHaveValue(value)
  await sheet.getByRole('combobox', { name: 'Build', exact: true }).selectOption('Rounded')
  await sheet.getByRole('button', { name: 'Edit exact prompt', exact: true }).click()
  await expect(prompt).toHaveValue(exact.replace('Build: Broad', 'Build: Rounded'))
})

test('all direction presets, reverse mirrors and source promotion keep a valid plan', async ({ page }) => {
  const sheet = await open(page)
  for (const [preset, unique, selected] of [['Top-down 8', 5, 8], ['Top-down 4', 3, 4], ['Diagonal 4', 2, 4], ['Side-scroller 2', 1, 2], ['Unique 8', 8, 8]] as const) {
    await sheet.getByRole('button', { name: preset, exact: true }).click()
    await expect(sheet.locator('.direction[aria-pressed=true]')).toHaveCount(selected)
    await expect(sheet.locator('.mirror[aria-pressed=true]')).toHaveCount(selected - unique)
  }
  await sheet.getByRole('button', { name: 'Top-down 8', exact: true }).click()
  for (const [east, west] of [['NE', 'NW'], ['E', 'W'], ['SE', 'SW']]) {
    await sheet.getByRole('button', { name: `Mirror ${east}`, exact: true }).click()
    await expect(sheet.getByRole('button', { name: `Mirror ${west}`, exact: true })).toHaveAttribute('aria-pressed', 'false')
    await sheet.getByRole('button', { name: `${west} direction`, exact: true }).click()
    await expect(sheet.getByRole('button', { name: `Mirror ${east}`, exact: true })).toHaveAttribute('aria-pressed', 'false')
  }
  for (const dir of ['N', 'NE', 'E', 'SE', 'S']) await sheet.getByRole('button', { name: `${dir} direction`, exact: true }).click()
  await expect(sheet.getByRole('button', { name: 'Create character', exact: true })).toBeDisabled()
  await expect(sheet.getByRole('status')).toContainText('Choose at least one direction')
})

test('V3 enhance connects once, preserves settings, undo restores exactly, and failures never retry', async ({ page, context }) => {
  const api = new CharacterApi()
  await context.route('https://*.pixellab.ai/**', async route => { const req = route.request(), response = await api.handle(req.method(), req.url(), req.postDataJSON()); await fulfill(route, response) })
  let sheet = await open(page)
  await sheet.getByRole('textbox', { name: 'Details', exact: true }).fill('A freckled elf')
  await sheet.getByRole('button', { name: '96', exact: true }).click()
  await sheet.getByRole('button', { name: 'Side-scroller 2', exact: true }).click()
  await sheet.getByRole('tab', { name: 'Prompt', exact: true }).click()
  const original = await sheet.getByRole('textbox', { name: 'Exact prompt', exact: true }).inputValue()
  await sheet.getByRole('button', { name: 'Enhance', exact: true }).click(); await connect(page)
  sheet = page.getByRole('dialog', { name: 'New character', exact: true })
  await expect(sheet.getByRole('button', { name: 'Undo', exact: true })).toBeVisible()
  const enhance = api.calls.filter(c => c.path === '/v2/enhance-character-v3-prompt')
  expect(enhance).toHaveLength(1); expect(enhance[0].body).toMatchObject({ description: original, image_size: { width: 96, height: 96 }, view: 'side' })
  await sheet.getByRole('button', { name: 'Undo', exact: true }).click()
  await expect(sheet.getByRole('textbox', { name: 'Exact prompt', exact: true })).toHaveValue(original)
  await sheet.getByRole('textbox', { name: 'Exact prompt', exact: true }).fill('[fail] a dwarf')
  await sheet.getByRole('button', { name: 'Enhance', exact: true }).click()
  await expect(sheet.getByRole('status')).toContainText('Your text was kept')
  await expect(sheet.getByRole('textbox', { name: 'Exact prompt', exact: true })).toHaveValue('[fail] a dwarf')
  expect(api.calls.filter(c => c.path === '/v2/enhance-character-v3-prompt')).toHaveLength(2)
})

test('late enhancement cannot overwrite edits or reopen a closed form', async ({ page, context }) => {
  const api = new CharacterApi()
  await context.route('https://*.pixellab.ai/**', async route => { const req = route.request(), response = await api.handle(req.method(), req.url(), req.postDataJSON()); await fulfill(route, response).catch(() => {}) })
  let sheet = await open(page); await sheet.getByRole('textbox', { name: 'Details', exact: true }).fill('[slow] an elf')
  await sheet.getByRole('button', { name: 'Enhance', exact: true }).click(); await connect(page)
  sheet = page.getByRole('dialog', { name: 'New character', exact: true })
  await sheet.getByRole('textbox', { name: 'Details', exact: true }).fill('My newer text')
  await expect(sheet.getByRole('status')).toContainText('Settings changed')
  await expect(sheet.getByRole('textbox', { name: 'Details', exact: true })).toHaveValue('My newer text')
  await sheet.getByRole('textbox', { name: 'Details', exact: true }).fill('[slow] another elf')
  await sheet.getByRole('button', { name: 'Enhance', exact: true }).click()
  await sheet.getByRole('button', { name: 'Cancel', exact: true }).click()
  await expect(page.getByRole('dialog')).toHaveCount(0)
  await expect.poll(() => api.calls.filter(c => c.path === '/v2/enhance-character-v3-prompt').length).toBe(2)
})

test('canceling the connection discards the pending enhancement instead of charging after a later connection', async ({ page, context }) => {
  const api = new CharacterApi()
  await context.route('https://*.pixellab.ai/**', async route => { const req = route.request(); await fulfill(route, await api.handle(req.method(), req.url(), req.postDataJSON())) })
  const sheet = await open(page)
  await sheet.getByRole('textbox', { name: 'Details', exact: true }).fill('A friendly elf')
  await sheet.getByRole('button', { name: 'Enhance', exact: true }).click()
  await page.getByRole('dialog', { name: 'Connect PixelLab' }).getByRole('button', { name: 'Cancel', exact: true }).click()
  await page.getByRole('button', { name: 'Connect', exact: true }).click(); await connect(page)
  await page.locator('.project-btn').click(); await page.getByRole('menuitem', { name: 'New character…', exact: true }).click()
  await expect(sheet.getByRole('textbox', { name: 'Details', exact: true })).toHaveValue('A friendly elf')
  await expect(sheet.getByRole('button', { name: 'Enhance', exact: true })).toBeEnabled()
  expect(api.calls.filter(c => c.path === '/v2/enhance-character-v3-prompt')).toEqual([])
})

test.describe('touch tablet', () => {
  test.use({ hasTouch: true, viewport: { width: 768, height: 1024 } })
  test('mirror controls retain 44px targets without overflowing the two-column layout', async ({ page }) => {
    const sheet = await open(page)
    await sheet.getByRole('tab', { name: 'Prompt', exact: true }).click()
    const buttons = await sheet.locator('.mirror, .creator-tabs button').evaluateAll(elements => elements.map(el => { const r = el.getBoundingClientRect(); return { w: r.width, h: r.height } }))
    expect(buttons.every(b => b.w >= 44 && b.h >= 44)).toBe(true)
    expect(await sheet.evaluate(el => el.scrollWidth <= el.clientWidth)).toBe(true)
  })
})

for (const viewport of [{ width: 320, height: 568 }, { width: 390, height: 844 }, { width: 844, height: 390 }, { width: 768, height: 1024 }, { width: 1440, height: 900 }]) test(`creator fits ${viewport.width}×${viewport.height} without clipped controls`, async ({ page }) => {
  await page.setViewportSize(viewport); const sheet = await open(page)
  await sheet.getByRole('textbox', { name: 'Details', exact: true }).fill('A friendly dwarf')
  const horizontal = await sheet.evaluate(element => ({ client: element.clientWidth, scroll: element.scrollWidth }))
  expect(horizontal.scroll).toBeLessThanOrEqual(horizontal.client)
  const buttons = await sheet.locator('.direction, .mirror').evaluateAll(elements => elements.map(el => { const r = el.getBoundingClientRect(); return { w: r.width, h: r.height } }))
  expect(buttons.every(b => b.w >= (viewport.width <= 599 || viewport.height <= 499 ? 44 : 28) && b.h >= 44)).toBe(true)
  await sheet.getByRole('textbox', { name: 'Seed', exact: true }).fill('123')
  await sheet.getByRole('button', { name: 'Camera', exact: true }).click()
  const tooltip = sheet.getByRole('tooltip'); await expect(tooltip).toBeVisible()
  const bounds = await tooltip.boundingBox(); expect(bounds!.x).toBeGreaterThanOrEqual(0); expect(bounds!.x + bounds!.width).toBeLessThanOrEqual(viewport.width)
  await page.keyboard.press('Escape'); await expect(sheet).toBeVisible()
  const footer = await sheet.getByRole('button', { name: 'Create character', exact: true }).boundingBox()
  expect(footer!.y + footer!.height).toBeLessThanOrEqual(viewport.height)
  const appearanceGap = await sheet.getByRole('textbox', { name: 'Details', exact: true }).evaluate(el => el.getBoundingClientRect().top - el.closest('.appearance')!.querySelector('.editor-toolbar')!.getBoundingClientRect().bottom)
  await sheet.getByRole('tab', { name: 'Prompt', exact: true }).click()
  const promptGap = await sheet.getByRole('textbox', { name: 'Exact prompt', exact: true }).evaluate(el => el.getBoundingClientRect().top - el.closest('.appearance')!.querySelector('.editor-toolbar')!.getBoundingClientRect().bottom)
  expect(promptGap).toBe(appearanceGap)
  const toolbar = await sheet.locator('.editor-toolbar').evaluate(el => {
    const row = el.getBoundingClientRect()
    return [...el.querySelectorAll('button')].every(button => { const r = button.getBoundingClientRect(); return r.left >= row.left && r.right <= row.right + 1 && r.top >= row.top && r.bottom <= row.bottom })
  })
  expect(toolbar).toBe(true)
})

for (const config of [{ preset: 'Side-scroller 2', size: 48, frame: 81, reverse: true, unique: 1, rows: 2 }, { preset: 'Diagonal 4', size: 96, frame: 160, reverse: false, unique: 2, rows: 4 }, { preset: 'Unique 8', size: 128, frame: 256, reverse: false, unique: 8, rows: 8 }]) test(`offline creation, persistence and export: ${config.preset}, ${config.frame}px`, async ({ page, context }) => {
  test.setTimeout(180_000)
  const api = new CharacterApi(), errors: string[] = []
  page.on('pageerror', e => errors.push(e.message))
  await context.route('https://*.pixellab.ai/**', async route => { const req = route.request(); await fulfill(route, await api.handle(req.method(), req.url(), req.postDataJSON())) })
  const sheet = await open(page)
  await sheet.getByRole('textbox', { name: 'Details', exact: true }).fill('A friendly humanoid with freckles')
  await sheet.getByRole('textbox', { name: 'Name', exact: true }).fill('Offline creator test')
  await sheet.getByRole('button', { name: config.preset, exact: true }).click()
  await sheet.getByRole('button', { name: String(config.size), exact: true }).click()
  await sheet.getByRole('spinbutton', { name: 'Frame size', exact: true }).fill(String(config.frame))
  if (config.reverse) await sheet.getByRole('button', { name: 'Mirror E', exact: true }).click()
  await sheet.getByRole('tab', { name: 'Prompt', exact: true }).click()
  const exact = await sheet.getByRole('textbox', { name: 'Exact prompt', exact: true }).inputValue()
  await sheet.getByRole('button', { name: 'Create character', exact: true }).click(); await connect(page)
  await expect(sheet.getByRole('button', { name: 'Start dressing up', exact: true })).toBeVisible({ timeout: 150_000 })
  const preview = await sheet.locator('.review-grid canvas').first().evaluate((element: HTMLCanvasElement) => ({ w: element.width, h: element.height }))
  expect(preview.w).toBe(config.frame * 2); expect(preview.h).toBe(config.frame * 2)
  const creates = api.calls.filter(c => c.path === '/v2/create-character-v3')
  expect(creates).toHaveLength(2)
  expect(creates[0].body).toMatchObject({ description: exact, image_size: { width: config.size, height: config.size } })
  expect(creates[1].body).toMatchObject({ n_directions: 8 }); expect(Object.keys(creates[1].body!.direction_images!)).toHaveLength(7)
  const raw = api.calls.filter(c => c.path === '/v2/animate-with-skeleton-v3')
  expect(raw).toHaveLength(config.unique * 2)
  if (config.reverse) expect(raw.every(c => (c.body as unknown as { direction: string }).direction === 'west')).toBe(true)
  await sheet.getByRole('button', { name: 'Start dressing up', exact: true }).click()
  await expect(page.locator('.project-btn')).toContainText('Offline creator test')
  await page.locator('.project-btn').click(); await page.getByRole('menuitem', { name: 'New character…', exact: true }).click()
  await expect(page.getByRole('tab', { name: 'Appearance', exact: true })).toBeVisible()
  await page.getByRole('button', { name: 'Cancel', exact: true }).click()
  await page.getByRole('tab', { name: 'Moves', exact: true }).click()
  const moveCanvas = page.locator('.move-thumb canvas').first()
  expect(await moveCanvas.getAttribute('width')).toBe(String(config.frame))
  expect((await moveCanvas.boundingBox())!.width).toBeLessThanOrEqual(56)
  await page.reload(); await expect(page.locator('.project-btn')).toContainText('Offline creator test')
  await page.getByRole('button', { name: 'Export', exact: true }).click()
  await page.getByRole('radio', { name: /PNG \+ JSON/ }).click()
  const downloaded = page.waitForEvent('download')
  await page.getByRole('button', { name: /Download zip/ }).click()
  const zipBytes = await readFile((await (await downloaded).path())!)
  const entries = await unzip(new Uint8Array(zipBytes))
  const manifest = JSON.parse(new TextDecoder().decode(entries.get('manifest.json'))) as Manifest
  expect(manifest.rig.cell).toEqual({ w: config.frame, h: config.frame }); expect(manifest.rig.directions).toHaveLength(config.rows)
  expect(Object.keys(manifest.rig.rest!)).toHaveLength(8)
  const image = await decodePngBytes(entries.get('layers/body/base/main/idle.png')!)
  expect(image.w).toBe(config.frame * 4); expect(image.h).toBe(config.frame * config.rows)
  if (config.reverse) {
    const first = { w: config.frame, h: config.frame, data: new Uint8ClampedArray(config.frame * config.frame * 4) }
    const second = { ...first, data: new Uint8ClampedArray(first.data.length) }
    for (let y = 0; y < config.frame; y++) {
      first.data.set(image.data.subarray(y * image.w * 4, (y * image.w + config.frame) * 4), y * config.frame * 4)
      second.data.set(image.data.subarray(((y + config.frame) * image.w) * 4, ((y + config.frame) * image.w + config.frame) * 4), y * config.frame * 4)
    }
    expect(first.data).toEqual(flipH(second).data)
    expect(manifest.rig.directions).toEqual([{ id: 'east', mirrorOf: 'west' }, { id: 'west' }])
  }
  await page.locator('.project-btn').click()
  await page.getByRole('menuitem', { name: 'Import character…', exact: true }).click()
  await page.getByLabel('Character ZIP', { exact: true }).setInputFiles({ name: 'custom-character.zip', mimeType: 'application/zip', buffer: zipBytes })
  const imported = page.getByRole('img', { name: 'Character import preview', exact: true })
  await expect(imported).toBeVisible()
  expect((await imported.boundingBox())!.width).toBeLessThanOrEqual(256)
  expect(await imported.locator('canvas').getAttribute('width')).toBe(String(config.frame * Math.max(1, Math.min(3, Math.floor(256 / config.frame)))))
  await page.getByLabel('Character name', { exact: true }).fill('Restored custom frame')
  await page.getByRole('button', { name: 'Import character', exact: true }).click()
  await expect(page.locator('.project-btn')).toContainText('Restored custom frame')
  if (config.reverse) {
    await page.locator('.project-btn').click(); await page.getByRole('menuitem', { name: /Set up character/ }).click()
    const setup = page.getByRole('dialog', { name: 'Set up character', exact: true })
    await setup.getByRole('button', { name: /^Set up.*gens$/ }).click()
    await connect(page)
    await expect(setup).toContainText('Ready. You can add equipment', { timeout: 60_000 })
    const registrations = api.calls.filter(c => c.path === '/v2/create-character-v3' && c.body?.reference_image)
    expect(registrations).toHaveLength(2)
    expect(registrations[1].body?.direction_images).toEqual(registrations[0].body?.direction_images)
    const estimates = api.calls.filter(c => c.path === '/v2/estimate-skeleton')
    for (const call of estimates) expect((await decodePngBytes(Buffer.from(call.body!.image!.base64, 'base64'))).w).toBe(128)
  }
  expect(errors).toEqual([])
})
