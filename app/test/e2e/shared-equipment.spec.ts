import { openStudio, reloadStudio, equipmentMode, newItem, selectedItemDetails, pickItem } from './immersive-helpers.ts'
import { test, expect } from '@playwright/test'
import { readFile } from 'node:fs/promises'
import { unzip } from '../../src/lib/store/zip.ts'

test.beforeEach(async ({ context }) => {
  await context.addInitScript(() => { localStorage.setItem('pixeldoll.agentKey', 'off'); localStorage.setItem('pixeldoll.welcomed', '1') })
})

test('shared design colorway, free independent copy, portable ZIP and deletion survive reload without API requests', async ({ page, context }) => {
  const requests: string[] = [], errors: string[] = []
  await context.route('https://api.pixellab.ai/**', async (route) => { requests.push(route.request().method() + ' ' + new URL(route.request().url()).pathname); await route.abort() })
  page.on('pageerror', (e) => errors.push(e.message))
  await openStudio(page, '/')
  await expect(page.locator('.world-actors').first()).toBeVisible()
  await page.locator('.equipment-scroll .tile', { hasText: 'Wizard hat' }).click()
  await page.locator('.equipment-scroll .swatch[aria-label="azure"]').first().click()
  await selectedItemDetails(page)
  await page.getByRole('button', { name: 'Save as shared design', exact: true }).click()
  await expect(page.getByRole('dialog')).toContainText('current colors')
  await page.getByRole('textbox', { name: 'Design name', exact: true }).fill('Traveling wizard hat')
  await expect(page.getByRole('button', { name: 'Save design', exact: true })).toBeEnabled()
  const savedColorway = await page.locator('.design-preview canvas').first().evaluate((c) => (c as HTMLCanvasElement).toDataURL())
  await page.getByRole('button', { name: 'Save design', exact: true }).click()
  await expect(page.getByRole('dialog')).toHaveCount(0)

  await newItem(page, 'Head')
  await page.getByRole('tab', { name: 'Saved designs', exact: true }).click()
  await expect(page.locator('.design-card')).toContainText('Traveling wizard hat')
  await page.getByRole('button', { name: 'Copy the demo body', exact: true }).click()
  await expect(page.locator('.project-btn')).toContainText('Adventurer copy')
  await expect(page.getByRole('button', { name: /^Review (free|available) copy/ })).toBeEnabled()

  const download = page.waitForEvent('download')
  await page.getByRole('button', { name: 'Export Traveling wizard hat design', exact: true }).click()
  const downloaded = await download
  expect(downloaded.suggestedFilename()).toMatch(/\.pixeldoll-design\.zip$/)
  const bytes = await readFile((await downloaded.path())!)
  const archive = await unzip(new Uint8Array(bytes))
  expect(archive.has('design.json')).toBe(true)
  expect(archive.has('ATTRIBUTION.txt')).toBe(true)
  expect([...archive.keys()].some((p) => p.startsWith('cells/'))).toBe(true)

  await page.getByRole('button', { name: /^Review (free|available) copy/ }).click()
  await expect(page.getByRole('dialog')).toContainText('0 generations')
  await expect(page.getByRole('button', { name: 'Keep and wear', exact: true })).toBeDisabled()
  await page.getByRole('checkbox', { name: 'Item only', exact: true }).first().check()
  await expect.poll(() => page.locator('.design-preview canvas').first().evaluate((c) => (c as HTMLCanvasElement).toDataURL())).toBe(savedColorway)
  const move = page.getByRole('dialog').getByLabel('Move', { exact: true }).first()
  const moveIds = await move.locator('option').evaluateAll((opts) => opts.map((o) => (o as HTMLOptionElement).value))
  for (const id of moveIds) { await move.selectOption(id); await expect(page.getByRole('dialog').getByLabel(`Traveling wizard hat, all frames of ${id}`, { exact: true })).toBeVisible() }
  await page.getByRole('checkbox', { name: 'I checked every move and direction shown above.', exact: true }).check()
  await page.getByRole('button', { name: 'Keep and wear', exact: true }).click()
  await expect(page.getByRole('dialog')).toHaveCount(0)
  await expect(page.locator('.sel-name')).toContainText('Traveling wizard hat')
  await equipmentMode(page, 'Outfits')
  await page.locator('.outfits').getByRole('button', { name: 'Base only', exact: true }).click()
  await equipmentMode(page, 'Wardrobe')
  await page.locator('.equipment-scroll .tile', { hasText: 'Traveling wizard hat' }).click()
  await expect(page.locator('.equipment-scroll').getByRole('radio', { name: 'Saved color', exact: true }).first()).toHaveAttribute('aria-checked', 'true')
  const savedGroup = page.locator('.equipment-scroll [role=radiogroup]').first()
  await expect(savedGroup.locator('[role=radio][tabindex="0"]')).toHaveCount(1)
  await expect(savedGroup.getByRole('radio', { name: 'Saved color', exact: true })).toHaveAttribute('tabindex', '0')
  await expect(savedGroup.getByRole('radio', { name: 'azure', exact: true })).toHaveAttribute('aria-checked', 'false')
  await page.locator('.equipment-scroll .swatch[aria-label="crimson"]').first().click()
  await pickItem(page, 'Wizard hat')
  await expect(page.locator('.equipment-scroll').getByRole('radio', { name: 'Original', exact: true }).first()).toHaveAttribute('aria-checked', 'true')
  await page.locator('.equipment-scroll .tile', { hasText: 'Traveling wizard hat' }).click()
  await expect(page.locator('.equipment-scroll .swatch[aria-label="crimson"]').first()).toHaveAttribute('aria-checked', 'true')
  await reloadStudio(page)
  await expect(page.locator('.project-btn')).toContainText('Adventurer copy')
  await expect(page.locator('.equipment-scroll .tile', { hasText: 'Traveling wizard hat' })).toBeVisible()
  await expect(page.locator('.equipment-scroll .tile', { hasText: 'Wizard hat' }).first()).toBeVisible()

  await newItem(page, 'Head')
  await page.getByRole('tab', { name: 'Saved designs', exact: true }).click()
  await page.getByRole('button', { name: 'Delete Traveling wizard hat design', exact: true }).click()
  await expect(page.getByRole('dialog')).toContainText('Fitted copies on characters and their outfits stay intact')
  await page.getByRole('button', { name: 'Delete design', exact: true }).click()
  await expect(page.getByRole('dialog')).toContainText('No saved designs yet')
  await page.getByLabel('Import shared design ZIP', { exact: true }).setInputFiles({ name: downloaded.suggestedFilename(), mimeType: 'application/zip', buffer: bytes })
  await expect(page.locator('.design-card')).toContainText('Traveling wizard hat')
  await page.getByRole('button', { name: 'Cancel', exact: true }).click()
  await reloadStudio(page)
  await expect(page.locator('.equipment-scroll .tile', { hasText: 'Traveling wizard hat' })).toBeVisible()
  expect(requests).toEqual([])
  expect(errors).toEqual([])
})

test('shared design sheets cancel cleanly on a phone and do not overflow', async ({ page, context }) => {
  await page.setViewportSize({ width: 390, height: 844 })
  const requests: string[] = []
  await context.route('https://api.pixellab.ai/**', async (route) => { requests.push(route.request().method()); await route.abort() })
  await openStudio(page, '/')
  await expect(page.locator('.world-actors').first()).toBeVisible()
  await page.getByRole('button', { name: 'New head item', exact: true }).click()
  await page.getByRole('tab', { name: 'Saved designs', exact: true }).click()
  await expect(page.getByRole('dialog')).toContainText('No saved designs yet')
  const designFile = page.getByLabel('Import shared design ZIP', { exact: true })
  await designFile.evaluate((input) => {
    Object.defineProperty(input, 'files', { configurable: true, value: [{ size: 65 * 1024 * 1024, arrayBuffer: () => { input.setAttribute('data-read', 'yes'); throw new Error('Oversized files must not be read') } }] })
    input.dispatchEvent(new Event('change', { bubbles: true }))
    delete (input as unknown as { files?: unknown }).files
  })
  await expect(page.getByRole('alert')).toContainText('smaller than 64 MB')
  await expect(designFile).not.toHaveAttribute('data-read')
  const bounds = await page.getByRole('dialog').boundingBox()
  expect(bounds!.x).toBeGreaterThanOrEqual(0)
  expect(bounds!.x + bounds!.width).toBeLessThanOrEqual(390)
  await page.getByRole('button', { name: 'Cancel', exact: true }).click()
  await expect(page.getByRole('dialog')).toHaveCount(0)
  // The primary entry always opens Create, even right after a saved-design visit; the saved-design entry opens its tab.
  await page.getByRole('button', { name: 'New head item', exact: true }).click()
  await expect(page.getByRole('tab', { name: 'Create', exact: true })).toHaveAttribute('aria-selected', 'true')
  await page.keyboard.press('Escape')
  await expect(page.getByRole('dialog')).toHaveCount(0)
  await page.getByRole('button', { name: 'Use a saved design', exact: true }).click()
  await expect(page.getByRole('tab', { name: 'Saved designs', exact: true })).toHaveAttribute('aria-selected', 'true')
  await page.keyboard.press('Escape')
  await expect(page.getByRole('dialog')).toHaveCount(0)
  expect(requests).toEqual([])
})

test('cleanup retains a submitted fit job across a crash before its record ID was saved', async ({ page, context }) => {
  const requests: string[] = []
  await context.route('https://api.pixellab.ai/**', async (route) => { requests.push(route.request().method()); await route.abort() })
  await openStudio(page, '/')
  await expect(page.locator('.world-actors').first()).toBeVisible()
  await page.evaluate(async () => {
    const request = indexedDB.open('pixeldoll', 1)
    const database = await new Promise<IDBDatabase>((resolve, reject) => { request.onsuccess = () => resolve(request.result); request.onerror = () => reject(request.error) })
    const transaction = database.transaction(['projects', 'jobs'], 'readwrite')
    const old = Date.now() - 8 * 24 * 60 * 60 * 1000
    transaction.objectStore('projects').put({ kind: 'equipment-fit-draft', id: 'equipment-fit:recovery', format: 'pixeldoll-fit/1', name: 'Retained fit', targetId: 'rig-recovery', targetProjectId: 'rig-recovery', stage: 'needs-attention', plan: {}, error: 'Submission interrupted before its record ID was saved', updatedAt: new Date(old).toISOString(), spentGens: 0, spentUsd: 0.04, previewGens: 2, poseGens: 0, budget: { previewGens: 2, poseGens: 0 }, calls: [{ id: 'rest-call', stage: 'rest', cells: [], seed: 1, limit: 2 }] }, 'equipment-fit:recovery')
    transaction.objectStore('jobs').put({ id: 'recovery-job', tag: 'equipment-fit:recovery:rest-call', label: 'Retained fitting result', method: 'POST', endpoint: '/never-resubmit', params: { seed: 1 }, inputs: [], requestHash: 'recovery-hash', state: 'done', attempts: 1, nextAt: 0, createdAt: old, submittedAt: old, finishedAt: old, jobs: [], gens: 0, usd: 0.04 }, 'recovery-job')
    await new Promise<void>((resolve, reject) => { transaction.oncomplete = () => resolve(); transaction.onabort = transaction.onerror = () => reject(transaction.error) })
    database.close()
  })
  await reloadStudio(page)
  await expect(page.locator('.world-actors').first()).toBeVisible()
  await page.locator('.project-btn').click()
  await page.getByRole('menuitem', { name: 'Activity', exact: true }).click()
  await expect(page.getByRole('dialog')).toContainText('Retained fit')
  await expect(page.getByRole('dialog')).toContainText('0 gens + $0.040 spent')
  await page.getByRole('dialog').getByText('Details', { exact: true }).click()
  await page.getByRole('button', { name: 'Clear finished', exact: true }).click()
  await expect(page.getByRole('status')).toContainText('Cleared')
  const retained = await page.evaluate(async () => {
    const request = indexedDB.open('pixeldoll', 1)
    const database = await new Promise<IDBDatabase>((resolve, reject) => { request.onsuccess = () => resolve(request.result); request.onerror = () => reject(request.error) })
    const read = database.transaction('jobs').objectStore('jobs').get('recovery-job')
    const value = await new Promise<unknown>((resolve, reject) => { read.onsuccess = () => resolve(read.result); read.onerror = () => reject(read.error) })
    database.close(); return value
  })
  expect(retained).toBeTruthy()
  expect(requests).toEqual([])
})

test('a follower resumes retained equipment work when the leader closes', async ({ page, context }) => {
  const requests: string[] = []
  await context.route('https://api.pixellab.ai/**', async (route) => { requests.push(route.request().method()); await route.abort() })
  await openStudio(page, '/')
  await expect(page.locator('.world-actors').first()).toBeVisible()
  await page.evaluate(async () => {
    const request = indexedDB.open('pixeldoll', 1)
    const database = await new Promise<IDBDatabase>((resolve, reject) => { request.onsuccess = () => resolve(request.result); request.onerror = () => reject(request.error) })
    const transaction = database.transaction('projects', 'readwrite')
    transaction.objectStore('projects').put({ kind: 'equipment-fit-draft', id: 'equipment-fit:takeover', format: 'pixeldoll-fit/1', name: 'Leader takeover fit', targetId: 'rig-takeover', targetProjectId: 'rig-takeover', stage: 'rest-running', plan: {}, error: '', updatedAt: new Date().toISOString(), spentGens: 0, previewGens: 2, poseGens: 0, budget: { previewGens: 2, poseGens: 0 }, calls: [] }, 'equipment-fit:takeover')
    await new Promise<void>((resolve, reject) => { transaction.oncomplete = () => resolve(); transaction.onabort = transaction.onerror = () => reject(transaction.error) })
    database.close()
  })
  const follower = await context.newPage()
  await openStudio(follower, '/')
  await follower.getByRole('button', {name:'More options',exact:true}).click()
  await expect(follower.locator('#experience-options')).toContainText('Other tab')
  await follower.keyboard.press('Escape')
  const stage = () => follower.evaluate(async () => {
    const request = indexedDB.open('pixeldoll', 1)
    const database = await new Promise<IDBDatabase>((resolve, reject) => { request.onsuccess = () => resolve(request.result); request.onerror = () => reject(request.error) })
    const read = database.transaction('projects').objectStore('projects').get('equipment-fit:takeover')
    const result = await new Promise<{ stage: string }>((resolve, reject) => { read.onsuccess = () => resolve(read.result); read.onerror = () => reject(read.error) })
    database.close(); return result.stage
  })
  expect(await stage()).toBe('rest-running')
  await page.close()
  // The unavailable test target should be detected by the takeover orchestration without resending anything.
  await expect.poll(stage, { timeout: 15_000 }).toBe('needs-attention')
  expect(requests).toEqual([])
})

test('review shows every stored cell once when playback omits or repeats cells', async ({ page, context }, info) => {
  const errors: string[] = [], requests: string[] = []
  page.on('pageerror', (e) => errors.push(e.message))
  await context.route('https://api.pixellab.ai/**', async (route) => { requests.push(route.request().method()); await route.abort() })
  await openStudio(page, info.config.projects.find((p) => p.name === 'browser-selftests')!.use.baseURL!)
  await expect(page.locator('.world-actors').first()).toBeVisible()
  await page.locator('.equipment-scroll .tile', { hasText: 'Wizard hat' }).click()
  const expected = await page.evaluate(() => {
    const studio = (window as unknown as { __studio: { store: { project: { manifest: { rig: { directions: unknown[]; animations: { id: string; cells: number; frames: { cell: number; ms: number }[] }[] } } } }; ui: { playing: boolean } } }).__studio
    studio.ui.playing = false
    const rig = studio.store.project.manifest.rig, clip = rig.animations[0]
    clip.frames = [{ cell: 0, ms: 100 }, { cell: 0, ms: 100 }]
    return { id: clip.id, cells: clip.cells, directions: rig.directions.length }
  })
  await selectedItemDetails(page)
  await page.getByRole('button', { name: 'Save as shared design', exact: true }).click()
  const review = page.getByRole('dialog').getByLabel(`Wizard hat, all frames of ${expected.id}`, { exact: true })
  await expect(review.getByRole('img')).toHaveCount(expected.cells * expected.directions)
  await expect(review.getByRole('region', { name: 'south frames', exact: true }).getByRole('img')).toHaveCount(expected.cells)
  await expect(page.getByRole('dialog').getByRole('combobox', { name: 'Review zoom', exact: true })).toHaveValue('3')
  await page.getByRole('dialog').getByRole('combobox', { name: 'Review zoom', exact: true }).selectOption('4')
  await expect(review.getByRole('img').first().locator('canvas')).toHaveAttribute('width', '256')
  await page.getByRole('button', { name: 'Cancel', exact: true }).click()
  await expect(page.getByRole('dialog')).toHaveCount(0)
  await page.evaluate(() => {
    const studio = (window as unknown as { __studio: { store: { project: { manifest: { items: { name: string; qa?: unknown }[] } } } } }).__studio
    const project = studio.store.project
    studio.store.project = { ...project, manifest: { ...project.manifest, items: project.manifest.items.map((item) => item.name === 'Wizard hat' ? { ...item, qa: { unmeasured: true, status: 'warn', minKeyKept: 0, maxKeyOutside: 0, minAreaRatio: 0, maxAreaCV: 0, maxPaletteDist: 0, clipPx: 0, rerolls: 0, cells: {} } } : item) } }
  })
  await selectedItemDetails(page)
  await page.getByRole('dialog').getByText('Details', { exact: true }).click()
  await expect(page.getByRole('dialog')).toContainText('Reused cells were not measured by PixelLab')
  await expect(page.locator('dialog .insp-body dt').filter({ hasText: /^(Key kept|Key outside|Area|Palette drift|Edge px|Hands)$/ })).toHaveCount(0)
  expect(errors).toEqual([])
  expect(requests).toEqual([])
})

test('browser Back respects an atomic local save and closes sheets after it finishes', async ({ page, context }) => {
  const requests: string[] = []
  await context.route('https://api.pixellab.ai/**', async (route) => { requests.push(route.request().method()); await route.abort() })
  await openStudio(page, '/')
  await expect(page.locator('.world-actors').first()).toBeVisible()
  await selectedItemDetails(page)
  await page.getByRole('button', { name: 'Save as shared design', exact: true }).click()
  await expect(page.getByRole('button', { name: 'Save design', exact: true })).toBeEnabled()
  // Pause the real content-hash work performed by publication, without mocking the sheet's busy state.
  await page.evaluate(() => {
    const subtle = crypto.subtle, original = subtle.digest
    let release!: () => void
    const gate = new Promise<void>((resolve) => { release = resolve })
    Object.defineProperty(subtle, 'digest', { configurable: true, value: async (algorithm: AlgorithmIdentifier, bytes: BufferSource) => { await gate; return original.call(subtle, algorithm, bytes) } })
    ;(window as unknown as { releaseSharedSave: () => void }).releaseSharedSave = () => { Object.defineProperty(subtle, 'digest', { configurable: true, value: original }); release() }
  })
  try {
    await page.getByRole('button', { name: 'Save design', exact: true }).click()
    await expect(page.getByRole('button', { name: 'Cancel', exact: true })).toBeDisabled()
    await page.goBack()
    await expect(page.getByRole('dialog')).toBeVisible()
    await expect(page.getByRole('button', { name: 'Cancel', exact: true })).toBeDisabled()
  } finally { await page.evaluate(() => (window as unknown as { releaseSharedSave: () => void }).releaseSharedSave()) }
  await expect(page.getByRole('dialog')).toHaveCount(0)
  await selectedItemDetails(page)
  await page.getByRole('button', { name: 'Save as shared design', exact: true }).click()
  await expect(page.getByRole('button', { name: 'Save design', exact: true })).toBeEnabled()
  await page.goBack()
  await expect(page.getByRole('dialog')).toHaveCount(0)
  expect(requests).toEqual([])
})
