import { openStudio, reloadStudio, equipmentMode, openAccount } from './immersive-helpers.ts'
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
  await context.route('https://*.pixellab.ai/**', route => route.abort()) // stay offline by default; a test's own route overrides this
})
async function open(page: Page) {
  await openStudio(page, '/')
  await page.locator('.project-btn').click()
  await page.getByRole('menuitem', { name: 'New character…', exact: true }).click()
  return page.getByRole('dialog', { name: 'New character', exact: true })
}
async function connect(page: Page) {
  await page.getByLabel('API key', { exact: true }).fill('offline-fixture-not-a-real-key')
  await page.getByRole('dialog', { name: 'Connect PixelLab' }).getByRole('button', { name: 'Connect', exact: true }).click()
}

// The two offline creation runs are the heaviest tests here (about 22 s and 42 s). CI shards are contiguous slices of the
// test order, so they are registered apart to land in different shards (docs/testing/test-performance.md).
offlineCreation({ preset: 'Unique 8', size: 128, frame: 256, reverse: false, unique: 8, rows: 8 })

test.describe('creation safety', () => {
test.use({ baseURL: `http://127.0.0.1:${process.env.DEV_PORT ?? '5298'}` })
test('all quality notes remain visible and failed clips come first', async ({ page, context }) => {
  await context.route('https://*.pixellab.ai/**', route => route.abort())
  await openStudio(page, '/')
  await expect(page.locator('.world-actors').first()).toBeVisible()
  await page.evaluate(async () => {
    const statePath = '/src/studio/state.svelte.ts', dbPath = '/src/lib/store/db.ts'
    const state = await import(statePath) as typeof import('../../src/studio/state.svelte.ts')
    const db = await import(dbPath) as typeof import('../../src/lib/store/db.ts')
    const id = await state.copyDemo()
    const warnings = Array.from({ length: 6 }, (_, i) => `idle/north-east: feet drift ${i + 1} px`)
    warnings.push('walk/west: arms 2.7 px off the requested pose')
    warnings.push('walk/east: feet drift 2 px from pivot y 123')
    await db.update<import('../../src/lib/store/project.ts').StoredProject>('projects', id, rec => {
      rec!.rigQa = { warnings, clips: { 'walk/west': { fails: ['arms 2.7 px off the requested pose'] }, 'idle/east': { fails: [], warnings: ['12 disconnected pixels retained; review details'] } } }; return rec!
    })
    state.creating.warnings = warnings
    state.creating.projectId = id
    state.ui.sheet = 'create'
  })
  const notes = page.locator('.quality-notes')
  await expect(notes).toHaveAttribute('open', '')
  await expect(notes.locator('summary')).toHaveText('9 quality notes')
  await expect(notes.locator('li')).toHaveCount(9)
  await expect(notes.locator('li').first()).toContainText('Walk west: estimated arm-joint difference 2.7 px')
  await expect(notes.getByText('Walk east: legacy silhouette-bottom difference 2 px from frame pivot', { exact: true })).toBeVisible()
  await expect(notes.getByText('Idle east: 12 disconnected pixels retained; review details', { exact: true })).toBeVisible()
  await notes.locator('summary').click()
  await expect(notes.locator('li').last()).not.toBeVisible()
  await notes.locator('summary').click()
  await expect(notes.locator('li').last()).toBeVisible()
})

test('completed move observations remain readable on desktop and mobile', async ({ page, context }) => {
  let requests = 0
  await context.route('https://*.pixellab.ai/**', route => { requests++; return route.abort() })
  await openStudio(page, '/')
  await expect(page.locator('.world-actors').first()).toBeVisible()
  await page.evaluate(async () => {
    const statePath = '/src/studio/state.svelte.ts'
    const state = await import(statePath) as typeof import('../../src/studio/state.svelte.ts')
    const id = await state.copyDemo()
    await state.openProject(id)
    Object.assign(state.moving, { spec: { id: 'walk', action: 'walk', frames: 4, items: [] }, projectId: id, done: true, warnings: ['walk/west: arms 2.7 px off the requested pose', 'walk/east: feet drift 2 px from pivot y 123'], fitIds: [], error: '' })
    state.ui.sheet = 'move'
  })
  const sheet = page.getByRole('dialog', { name: 'Add a move', exact: true })
  await expect(sheet.getByText('Walk west: estimated arm-joint difference 2.7 px from requested pose; review', { exact: true })).toBeVisible()
  await expect(sheet.getByText('Walk east: legacy silhouette-bottom difference 2 px from frame pivot', { exact: true })).toBeVisible()
  await page.setViewportSize({ width: 390, height: 844 })
  await expect(sheet.locator('.notice.warn')).toHaveCount(2)
  for (const note of await sheet.locator('.notice.warn').all()) {
    await expect(note).toBeVisible()
    const box = (await note.boundingBox())!
    expect(box.x).toBeGreaterThanOrEqual(0); expect(box.x + box.width).toBeLessThanOrEqual(390)
  }
  expect(requests).toBe(0)
})

test('same seeded output creates separate projects and a resumed workflow preserves its identity', async ({ page, context }) => {
  test.setTimeout(180_000)
  const api = new CharacterApi()
  await context.route('https://*.pixellab.ai/**', async route => { const req = route.request(); await fulfill(route, await api.handle(req.method(), req.url(), req.postDataJSON())) })
  const sheet = await open(page)
  const configure = async (name: string) => {
    await sheet.getByRole('textbox', { name: 'Name', exact: true }).fill(name)
    await sheet.getByRole('textbox', { name: 'Details', exact: true }).fill('A plain human')
    await sheet.getByRole('button', { name: 'Side-scroller 2', exact: true }).click()
    await sheet.getByRole('textbox', { name: 'Seed', exact: true }).fill('4242')
  }
  await configure('Keep my outfit')
  await sheet.getByRole('button', { name: 'Create character', exact: true }).click(); await connect(page)
  await expect(sheet.getByRole('button', { name: 'Start dressing up', exact: true })).toBeVisible({ timeout: 120_000 })
  await sheet.getByRole('button', { name: 'Start dressing up', exact: true }).click()
  const first = await page.evaluate(async () => {
    const modulePath = '/src/lib/store/db.ts'
    const { all, update } = await import(modulePath) as typeof import('../../src/lib/store/db.ts')
    const records = await all<import('../../src/lib/store/project.ts').StoredProject>('projects')
    const rec = records.find(r => r.manifest?.name === 'Keep my outfit')!
    await update<typeof rec>('projects', rec.id, current => { current!.manifest.presets.push({ id: 'precious-outfit', name: 'Saved outfit', items: { body: 'base' }, variants: {} }); return current! })
    return rec.id
  })
  await page.locator('.project-btn').click(); await page.getByRole('menuitem', { name: 'New character…', exact: true }).click()
  await configure('Separate character')
  await sheet.getByRole('button', { name: 'Create character', exact: true }).click()
  await expect(sheet.getByRole('button', { name: 'Start dressing up', exact: true })).toBeVisible({ timeout: 120_000 })
  const saved = await page.evaluate(async () => {
    const modulePath = '/src/lib/store/db.ts'
    const { all } = await import(modulePath) as typeof import('../../src/lib/store/db.ts')
    return (await all<import('../../src/lib/store/project.ts').StoredProject>('projects')).filter(r => r.manifest?.name === 'Keep my outfit' || r.manifest?.name === 'Separate character')
  })
  expect(saved).toHaveLength(2)
  expect(saved.find(r => r.id === first)?.manifest.presets.some(p => p.id === 'precious-outfit')).toBe(true)
  const second = saved.find(r => r.id !== first)!
  expect(second.manifest.name).toBe('Separate character')
  expect(api.calls.filter(c => c.path === '/v2/create-character-v3')).toHaveLength(2) // cached art reused, local identities separate
  await page.evaluate(async () => {
    const modulePath = '/src/lib/store/db.ts'
    const { put } = await import(modulePath) as typeof import('../../src/lib/store/db.ts')
    const statePath = '/src/studio/state.svelte.ts'
    const { creating, REQUEST_TEXT } = await import(statePath) as typeof import('../../src/studio/state.svelte.ts')
    await put('projects', 'studio-create', { id: 'studio-create', spec: JSON.parse(JSON.stringify(creating.spec)), requestText: REQUEST_TEXT })
  })
  await reloadStudio(page)
  await expect.poll(async () => page.evaluate(async () => {
    const modulePath = '/src/lib/store/db.ts'
    const { get } = await import(modulePath) as typeof import('../../src/lib/store/db.ts'); return !(await get('projects', 'studio-create'))
  }), { timeout: 30_000 }).toBe(true)
  expect(await page.evaluate(async () => { const modulePath = '/src/lib/store/db.ts'; const { all } = await import(modulePath) as typeof import('../../src/lib/store/db.ts'); return (await all<{ id: string; manifest?: unknown }>('projects')).filter(r => r.id.startsWith('rig-') && r.manifest).length })).toBe(2)
  expect(api.calls.filter(c => c.path === '/v2/create-character-v3')).toHaveLength(2)
})

})

test('a failed required measurement stops the queued idle without paying for an art reroll', async ({ page, context }) => {
  test.setTimeout(120_000)
  const api = new CharacterApi()
  await context.route('https://*.pixellab.ai/**', async route => {
    const req = route.request(), body = req.postDataJSON()
    const response = await api.handle(req.method(), req.url(), body)
    await fulfill(route, new URL(req.url()).pathname === '/v2/estimate-skeleton' ? Response.json({ keypoints: [], usage: { type: 'generations', generations: .1 } }) : response)
  })
  const sheet = await open(page)
  await sheet.getByRole('textbox', { name: 'Details', exact: true }).fill('A plain human')
  await sheet.getByRole('button', { name: 'Side-scroller 2', exact: true }).click()
  await sheet.getByRole('button', { name: 'Create character', exact: true }).click(); await connect(page)
  // Creation reads the standing joints and makes no animation, so it completes; the failure belongs to the move.
  await expect(sheet.getByRole('button', { name: 'Start dressing up', exact: true })).toBeVisible({ timeout: 90_000 })
  expect(api.calls.filter(c => c.path === '/v2/estimate-skeleton' || c.path === '/v2/animate-with-skeleton-v3')).toHaveLength(0)
  await sheet.getByRole('button', { name: /^Add idle \+ walk/ }).click()
  await equipmentMode(page, 'Moves')
  await page.locator('.move-row', { hasText: 'Failed: tap for details' }).click({ timeout: 90_000 })
  const move = page.getByRole('dialog', { name: 'Add a move', exact: true })
  await expect(move).toContainText(/joints (were )?not found on every frame/)
  await expect(move).toContainText('Queued next: Walk')
  expect(api.calls.filter(c => c.path === '/v2/animate-with-skeleton-v3')).toHaveLength(1)
  const saved = await page.evaluate(() => new Promise<string[][]>((resolve, reject) => {
    const r = indexedDB.open('pixeldoll'); r.onerror = () => reject(r.error)
    r.onsuccess = () => { const db = r.result, q = db.transaction('projects').objectStore('projects').getAll(); q.onsuccess = () => { db.close(); resolve(q.result.filter((p: { manifest?: Manifest }) => p.manifest).map((p: { manifest: Manifest }) => p.manifest.rig.animations.map(a => a.id))) }; q.onerror = () => reject(q.error) }
  }))
  expect(saved).toEqual([['default']])
})

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

test('appearance tooltips stay next to their trigger and inside the viewport', async ({ page }) => {
  const sheet = await open(page)
  for (const name of ['Appearance help', 'Kind']) {
    const trigger = sheet.getByRole('button', { name, exact: true })
    await trigger.click()
    const tip = sheet.getByRole('tooltip')
    await expect(tip).toBeVisible()
    await expect(tip).toHaveAttribute('data-positioned', '')
    await expect(tip.locator('.bu-popover-arrow')).toBeVisible()
    const r = (await trigger.boundingBox())!, t = (await tip.boundingBox())!
    expect(t.x).toBeGreaterThanOrEqual(0)
    expect(t.x + t.width).toBeLessThanOrEqual(page.viewportSize()!.width)
    expect(t.y + t.height).toBeLessThanOrEqual(page.viewportSize()!.height)
    expect(Math.min(Math.abs(t.y - r.y - r.height), Math.abs(r.y - t.y - t.height))).toBeLessThanOrEqual(8)
    await page.keyboard.press('Escape')
  }
})

test('linked prompt is lossless, copy is exact, and keyboard tabs work', async ({ page }) => {
  const sheet = await open(page)
  const details = sheet.getByRole('textbox', { name: 'Details', exact: true })
  await details.pressSequentially('A freckled elf ')
  await expect(details).toHaveValue('A freckled elf ')
  await sheet.getByRole('combobox', { name: 'Kind', exact: true }).selectOption('Elf')
  await sheet.getByRole('button', { name: 'Copy details', exact: true }).click()
  expect(await page.evaluate(() => sessionStorage.getItem('creator-copy'))).toBe('A freckled elf')
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

test('editor help opens from either the toggle or help icon and follows the active tab', async ({ page }) => {
  const sheet = await open(page), toggle = sheet.getByRole('tablist', { name: 'Prompt editor', exact: true })
  await toggle.hover()
  await expect(sheet.getByRole('tooltip')).toContainText('Describe distinctive features')
  await sheet.getByRole('button', { name: 'Appearance help', exact: true }).hover()
  await expect(sheet.getByRole('tooltip')).toContainText('Describe distinctive features')
  await page.keyboard.press('Escape'); await expect(sheet.getByRole('tooltip')).toHaveCount(0)
  await sheet.getByRole('tab', { name: 'Prompt', exact: true }).click()
  await toggle.hover()
  await expect(sheet.getByRole('tooltip')).toContainText('This exact text is sent to V3')
  await sheet.getByRole('button', { name: 'Prompt help', exact: true }).click()
  await expect(sheet.getByRole('tooltip')).toContainText('This exact text is sent to V3')
  await page.keyboard.press('Escape'); await expect(sheet).toBeVisible()
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
  const enhanceWidth = (await sheet.getByRole('button', { name: 'Enhance', exact: true }).boundingBox())!.width
  const copyBefore = await sheet.locator('.editor-toolbar .copy').boundingBox()
  await sheet.getByRole('button', { name: 'Enhance', exact: true }).click(); await connect(page)
  sheet = page.getByRole('dialog', { name: 'New character', exact: true })
  await expect(sheet.getByRole('button', { name: 'Undo', exact: true })).toBeVisible()
  expect((await sheet.getByRole('button', { name: 'Undo', exact: true }).boundingBox())!.width).toBe(enhanceWidth)
  expect(await sheet.locator('.editor-toolbar .copy').boundingBox()).toEqual(copyBefore)
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

test('Appearance enhancement sends all selected hints and keeps them linked without duplicate prompt lines', async ({ page, context }) => {
  const api = new CharacterApi()
  await context.route('https://*.pixellab.ai/**', async route => { const req = route.request(); await fulfill(route, await api.handle(req.method(), req.url(), req.postDataJSON())) })
  const sheet = await open(page)
  await sheet.getByRole('textbox', { name: 'Details', exact: true }).fill('Pointed ears')
  for (const [name, value] of [['Kind', 'Elf'], ['Build', 'Broad'], ['Proportions', 'Chibi'], ['Skin', 'Brown']]) await sheet.getByRole('combobox', { name, exact: true }).selectOption(value)
  await sheet.getByRole('button', { name: 'Copy exact prompt', exact: true }).click()
  const before = await page.evaluate(() => sessionStorage.getItem('creator-copy'))
  await sheet.getByRole('button', { name: 'Enhance', exact: true }).click(); await connect(page)
  await expect(sheet.getByRole('button', { name: 'Undo', exact: true })).toBeVisible()
  expect(api.calls.find(c => c.path === '/v2/enhance-character-v3-prompt')?.body?.description).toBe(before)
  for (const [name, value] of [['Kind', 'Elf'], ['Build', 'Broad'], ['Proportions', 'Chibi'], ['Skin', 'Brown']]) await expect(sheet.getByRole('combobox', { name, exact: true })).toHaveValue(value)
  await expect(sheet.getByRole('textbox', { name: 'Details', exact: true })).toHaveValue('Pointed ears\nSubtle freckles and expressive eyes.')
  await sheet.getByRole('button', { name: 'Copy exact prompt', exact: true }).click()
  const after = await page.evaluate(() => sessionStorage.getItem('creator-copy'))
  expect(after?.match(/Kind: Elf/g)).toHaveLength(1)
  await sheet.getByRole('button', { name: 'Undo', exact: true }).click()
  await sheet.getByRole('button', { name: 'Copy exact prompt', exact: true }).click()
  expect(await page.evaluate(() => sessionStorage.getItem('creator-copy'))).toBe(before)
})

test('Appearance enhancement cannot clear selected hints with repeated clauses or erase details with an empty rewrite', async ({ page, context }) => {
  const api = new CharacterApi()
  let response = 'Sharper ears\nKind: Human\nKind: Orc\nBuild: Rounded'
  await context.route('https://*.pixellab.ai/**', async route => {
    const req = route.request()
    if (new URL(req.url()).pathname === '/v2/enhance-character-v3-prompt') await route.fulfill({ json: { enhanced_prompt: response, usage: { type: 'generations', generations: .05 } } })
    else await fulfill(route, await api.handle(req.method(), req.url(), req.postDataJSON()))
  })
  const sheet = await open(page)
  await sheet.getByRole('textbox', { name: 'Details', exact: true }).fill('Pointed ears')
  await sheet.getByRole('combobox', { name: 'Kind', exact: true }).selectOption('Elf')
  await sheet.getByRole('combobox', { name: 'Build', exact: true }).selectOption('Broad')
  await sheet.getByRole('button', { name: 'Enhance', exact: true }).click(); await connect(page)
  await expect(sheet.getByRole('button', { name: 'Undo', exact: true })).toBeVisible()
  await expect(sheet.getByRole('textbox', { name: 'Details', exact: true })).toHaveValue('Sharper ears')
  await expect(sheet.getByRole('combobox', { name: 'Kind', exact: true })).toHaveValue('Elf')
  await expect(sheet.getByRole('combobox', { name: 'Build', exact: true })).toHaveValue('Broad')
  await sheet.getByRole('button', { name: 'Undo', exact: true }).click()
  response = 'Kind: Orc\nBuild: Rounded'
  await sheet.getByRole('button', { name: 'Enhance', exact: true }).click()
  await expect(sheet.getByRole('status')).toContainText('Your text was kept')
  await expect(sheet.getByRole('textbox', { name: 'Details', exact: true })).toHaveValue('Pointed ears')
  await expect(sheet.getByRole('combobox', { name: 'Kind', exact: true })).toHaveValue('Elf')
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
  await openAccount(page); await connect(page)
  await page.locator('.project-btn').click(); await page.getByRole('menuitem', { name: 'New character…', exact: true }).click()
  await expect(sheet.getByRole('textbox', { name: 'Details', exact: true })).toHaveValue('A friendly elf')
  await expect(sheet.getByRole('button', { name: 'Enhance', exact: true })).toBeEnabled()
  expect(api.calls.filter(c => c.path === '/v2/enhance-character-v3-prompt')).toEqual([])
})

test.describe('touch tablet', () => {
  test.use({ hasTouch: true, viewport: { width: 768, height: 1024 } })
  test('mirror controls retain 44px targets without overflowing the two-column layout', async ({ page }) => {
    const sheet = await open(page)
    const tab = await sheet.getByRole('tab', { name: 'Prompt', exact: true }).boundingBox(), help = await sheet.getByRole('button', { name: 'Appearance help', exact: true }).boundingBox()
    expect(tab!.x + tab!.width <= help!.x || tab!.y + tab!.height <= help!.y).toBe(true)
    await sheet.getByRole('tab', { name: 'Prompt', exact: true }).click()
    const buttons = await sheet.locator('.mirror, .creator-tabs button').evaluateAll(elements => elements.map(el => { const r = el.getBoundingClientRect(); return { w: r.width, h: r.height } }))
    expect(buttons.filter(b => b.w < 44 || b.h < 44)).toEqual([])
    expect(await sheet.evaluate(el => el.scrollWidth <= el.clientWidth)).toBe(true)
  })
})

for (const viewport of [{ width: 320, height: 568 }, { width: 350, height: 800 }, { width: 360, height: 800 }, { width: 390, height: 844 }, { width: 844, height: 390 }, { width: 768, height: 1024 }, { width: 900, height: 900 }, { width: 1440, height: 900 }]) test(`creator fits ${viewport.width}×${viewport.height} without clipped controls`, async ({ page }) => {
  await page.setViewportSize(viewport); const sheet = await open(page)
  await sheet.getByRole('textbox', { name: 'Details', exact: true }).fill('A friendly dwarf')
  const horizontal = await sheet.evaluate(element => ({ client: element.clientWidth, scroll: element.scrollWidth }))
  expect(horizontal.scroll).toBeLessThanOrEqual(horizontal.client)
  // Approved creator: the size readout sits under its guide image (hidden on shallow landscape).
  const readoutFits = await sheet.locator('.size-guide').evaluate(el => {
    if (!el.getClientRects().length) return true
    const image = el.querySelector('.preview-box')!.getBoundingClientRect(), readout = el.querySelector('.sizes')!.getBoundingClientRect()
    return readout.top >= image.bottom - 1 && readout.left >= image.left - 1 && readout.right <= image.right + 1
  })
  expect(readoutFits).toBe(true)
  await expect(sheet.locator('.mirror-summary')).toHaveCount(0)
  const autoHeight = await sheet.getByRole('button', { name: 'Auto', exact: true }).boundingBox()
  const frameHeight = await sheet.getByRole('spinbutton', { name: 'Frame size', exact: true }).boundingBox()
  expect(autoHeight!.height).toBeCloseTo(frameHeight!.height, 0)
  const arrowWidths = await sheet.locator('.direction').evaluateAll(elements => elements.map(el => el.getBoundingClientRect().width))
  const tileWidths = await sheet.locator('.direction-tile').evaluateAll(elements => elements.map(el => el.getBoundingClientRect().width))
  const spread = (widths: number[]) => Math.max(...widths) - Math.min(...widths)
  expect(arrowWidths.every(width => width >= 44)).toBe(true)
  // Approved compass: equal tiles with attached mirrors; the narrowest phones equalize arrows instead. One CSS pixel of border slack.
  expect(Math.min(spread(tileWidths), spread(arrowWidths))).toBeLessThanOrEqual(1)
  const copyRight = async () => sheet.locator('.prompt-note').evaluate(el => ({ copy: el.querySelector('.copy')!.getBoundingClientRect().right, row: el.getBoundingClientRect().right }))
  const shortCopy = await copyRight()
  await sheet.getByRole('textbox', { name: 'Details', exact: true }).fill('A friendly dwarf with freckles and a broad nose, expressive eyebrows, small ears and a calm expression')
  const longCopy = await copyRight()
  expect(shortCopy.copy).toBeCloseTo(shortCopy.row, 0)
  expect(longCopy.copy).toBeCloseTo(shortCopy.copy, 0)
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
  const appearanceActions = await sheet.locator('.prompt-actions').evaluate(el => [...el.querySelectorAll(':scope > button')].map(child => { const r = child.getBoundingClientRect(); return { x: r.x, w: r.width } }))
  await sheet.getByRole('tab', { name: 'Prompt', exact: true }).click()
  const promptGap = await sheet.getByRole('textbox', { name: 'Exact prompt', exact: true }).evaluate(el => el.getBoundingClientRect().top - el.closest('.appearance')!.querySelector('.editor-toolbar')!.getBoundingClientRect().bottom)
  expect(promptGap).toBe(appearanceGap)
  const promptActions = await sheet.locator('.prompt-actions').evaluate(el => [...el.querySelectorAll(':scope > button')].map(child => { const r = child.getBoundingClientRect(); return { x: r.x, w: r.width } }))
  expect(promptActions).toEqual(appearanceActions)
  expect(await sheet.locator('.creator-tabs button').evaluateAll(elements => elements.every(el => {
    const range = document.createRange(); range.selectNodeContents(el)
    const text = range.getBoundingClientRect(), button = el.getBoundingClientRect()
    return text.left >= button.left && text.right <= button.right
  }))).toBe(true)
  expect(await sheet.locator('.prompt-actions > button').evaluateAll(elements => elements.map(el => el.getAttribute('aria-label')))).toEqual(['Prompt help', 'Inspect API calls', 'Copy exact prompt', 'Enhance'])
  const toolbar = await sheet.locator('.editor-toolbar').evaluate(el => {
    const row = el.getBoundingClientRect()
    return [...el.querySelectorAll('button')].every(button => { const r = button.getBoundingClientRect(); return r.left >= row.left && r.right <= row.right + 1 && r.top >= row.top && r.bottom <= row.bottom })
  })
  expect(toolbar).toBe(true)
})

test('compact creator toolbar keeps wider fallback-font labels and actions readable', async ({ page, context }, info) => {
  await context.route('https://*.pixellab.ai/**', route => route.abort())
  for (const width of [320, 350, 360, 390, 900]) {
    await page.setViewportSize({ width, height: width === 320 ? 568 : 900 })
    const sheet = await open(page)
    await page.addStyleTag({ content: '.character-sheet { font-family: Verdana, sans-serif !important; }' })
    const tabs = sheet.getByRole('tablist', { name: 'Prompt editor', exact: true })
    await tabs.scrollIntoViewIfNeeded()
    expect(await tabs.getByRole('tab').evaluateAll(buttons => buttons.every(button => {
      const range = document.createRange(); range.selectNodeContents(button)
      const text = range.getBoundingClientRect(), rect = button.getBoundingClientRect()
      return text.left >= rect.left && text.right <= rect.right
    }))).toBe(true)
    // Labels fitting is insufficient if an adjacent action intercepts their clicks.
    await tabs.getByRole('tab', { name: 'Prompt', exact: true }).click()
    await expect(tabs.getByRole('tab', { name: 'Prompt', exact: true })).toHaveAttribute('aria-selected', 'true')
    await tabs.getByRole('tab', { name: 'Appearance', exact: true }).click()
    const toolbar = await sheet.locator('.editor-toolbar').boundingBox()
    expect(await sheet.locator('.editor-toolbar').evaluate(element => {
      const buttons = [...element.querySelectorAll('button')].map(button => button.getBoundingClientRect())
      return buttons.every((a, index) => buttons.slice(index + 1).every(b => a.right <= b.left + 0.5 || b.right <= a.left + 0.5 || a.bottom <= b.top + 0.5 || b.bottom <= a.top + 0.5))
    })).toBe(true)
    for (const label of ['Appearance help', 'Inspect API calls', 'Copy details', 'Enhance']) {
      const button = sheet.locator('.editor-toolbar').getByRole('button', { name: label, exact: true })
      await expect(button).toBeVisible()
      const rect = await button.boundingBox()
      expect(rect!.x).toBeGreaterThanOrEqual(toolbar!.x)
      expect(rect!.x + rect!.width).toBeLessThanOrEqual(toolbar!.x + toolbar!.width + 1)
    }
    await page.screenshot({ path: info.outputPath(`creator-toolbar-${width}.png`) })
  }
})

offlineCreation({ preset: 'Side-scroller 2', size: 48, frame: 81, reverse: true, unique: 1, rows: 2 })

type CreationCase = { preset: string; size: number; frame: number; reverse: boolean; unique: number; rows: number }
function offlineCreation(config: CreationCase) {
test(`offline creation, persistence and export: ${config.preset}, ${config.frame}px`, async ({ page, context }) => {
  test.setTimeout(180_000)
  const api = new CharacterApi(), errors: string[] = []
  let release!: () => void
  const skeletonRead = new Promise<void>(resolve => { release = resolve })
  page.on('pageerror', e => errors.push(e.message))
  await context.route('https://*.pixellab.ai/**', async route => {
    const req = route.request()
    if (req.method() === 'GET' && new URL(req.url()).pathname.startsWith('/v2/characters/')) await skeletonRead // hold creation after the draw
    await fulfill(route, await api.handle(req.method(), req.url(), req.postDataJSON()))
  })
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
  // The standing views show as soon as the draw lands, while the skeleton step is still running.
  await expect(sheet.locator('.review-grid figure')).toHaveCount(config.rows, { timeout: 90_000 })
  await expect(sheet.getByRole('button', { name: 'Start dressing up', exact: true })).toHaveCount(0)
  release()
  await expect(sheet.getByRole('button', { name: 'Start dressing up', exact: true })).toBeVisible({ timeout: 150_000 })
  const preview = await sheet.locator('.review-grid canvas').first().evaluate((element: HTMLCanvasElement) => ({ w: element.width, h: element.height }))
  expect(preview.w).toBe(config.frame * 2); expect(preview.h).toBe(config.frame * 2)
  const creates = api.calls.filter(c => c.path === '/v2/create-character-v3')
  expect(creates).toHaveLength(2)
  expect(creates[0].body).toMatchObject({ description: exact, image_size: { width: config.size, height: config.size } })
  expect(creates[1].body).toMatchObject({ n_directions: 8 }); expect(Object.keys(creates[1].body!.direction_images!)).toHaveLength(7)
  // Default-first: creation makes no animation; one tap queues idle and walk with the old per-direction requests.
  expect(api.calls.filter(c => c.path === '/v2/animate-with-skeleton-v3' || c.path === '/v2/characters/animations' || c.path === '/v2/estimate-skeleton')).toHaveLength(0)
  await sheet.getByRole('button', { name: /^Add idle \+ walk/ }).click()
  await expect(page.locator('.project-btn')).toContainText('Offline creator test')
  await page.locator('.project-btn').click(); await page.getByRole('menuitem', { name: 'New character…', exact: true }).click()
  await expect(page.getByRole('tab', { name: 'Appearance', exact: true })).toBeVisible()
  await page.getByRole('button', { name: 'Cancel', exact: true }).click()
  await equipmentMode(page, 'Moves')
  await expect(page.locator('.move-list .move-row')).toHaveCount(3, { timeout: 150_000 })
  await expect(page.locator('.move-list .move-row b')).toHaveText(['Default', 'Idle', 'Walk'])
  const raw = api.calls.filter(c => c.path === '/v2/animate-with-skeleton-v3')
  expect(raw).toHaveLength(config.unique * 2)
  if (config.reverse) expect(raw.every(c => (c.body as unknown as { direction: string }).direction === 'west')).toBe(true)
  const moveCanvas = page.locator('.move-thumb canvas').first()
  expect(await moveCanvas.getAttribute('width')).toBe(String(config.frame))
  expect((await moveCanvas.boundingBox())!.width).toBeLessThanOrEqual(56)
  await reloadStudio(page); await expect(page.locator('.project-btn')).toContainText('Offline creator test')
  await page.getByRole('button', { name: 'Export', exact: true }).click()
  await page.getByRole('radio', { name: /PNG \+ JSON/ }).click()
  const downloaded = page.waitForEvent('download')
  await page.getByRole('button', { name: /Download ZIP/ }).click()
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
  // Saving then reopening a full 8-direction 256 px character decodes every frame; on slow runners this exceeded the 5 s CI default.
  await expect(page.locator('.project-btn')).toContainText('Restored custom frame', { timeout: 30_000 })
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
}
