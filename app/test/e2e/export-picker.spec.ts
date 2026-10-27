import { openStudio } from './immersive-helpers.ts'
import { expect, test } from '@playwright/test'
import { readFile } from 'node:fs/promises'
import { unzip } from '../../src/lib/store/zip.ts'

test('Share popover follows the selected move, direction and Animate switch on desktop and phone', async ({ page, context }, testInfo) => {
  const apiRequests: string[] = []
  await context.route('https://api.pixellab.ai/**', route => { apiRequests.push(route.request().url()); return route.abort() })
  await context.addInitScript(() => {
    localStorage.setItem('pixeldoll.agentKey', 'off')
    localStorage.setItem('pixeldoll.welcomed', '1')
    Object.defineProperty(Navigator.prototype, 'canShare', { configurable: true, value: (data: ShareData) => !!data.files?.length })
    Object.defineProperty(Navigator.prototype, 'share', { configurable: true, value: async (data: ShareData) => {
      const file = data.files?.[0]
      ;(window as unknown as { __shared?: { type: string; name: string; size: number } }).__shared = file && { type: file.type, name: file.name, size: file.size }
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
  await expect(popover.getByRole('combobox', { name: 'Move' })).toHaveValue('walk')
  await expect(popover.getByRole('combobox', { name: 'Direction' })).toHaveValue('south')
  await expect(popover.getByRole('switch')).toBeChecked()
  await expect(popover.getByRole('button', { name: 'Download GIF' })).toBeEnabled()
  await page.screenshot({ path: testInfo.outputPath('share-desktop.png') })
  const [gif] = await Promise.all([page.waitForEvent('download'), popover.getByRole('button', { name: 'Download GIF' }).click()])
  const gifBytes = await readFile((await gif.path())!)
  expect(gif.suggestedFilename()).toMatch(/-walk-south\.gif$/)
  expect(gifBytes.subarray(0, 6).toString()).toBe('GIF89a')
  await popover.getByRole('button', { name: 'Share to…' }).click()
  await expect.poll(() => page.evaluate(() => (window as unknown as { __shared?: { type: string } }).__shared?.type)).toBe('image/gif')

  await popover.getByRole('switch').uncheck()
  await expect(popover.getByRole('button', { name: 'Download PNG' })).toBeEnabled()
  const [png] = await Promise.all([page.waitForEvent('download'), popover.getByRole('button', { name: 'Download PNG' }).click()])
  const pngBytes = await readFile((await png.path())!)
  expect(png.suggestedFilename()).toMatch(/-walk-south\.png$/)
  expect([...pngBytes.subarray(0, 4)]).toEqual([137, 80, 78, 71])
  await popover.getByRole('button', { name: 'Share to…' }).click()
  await expect.poll(() => page.evaluate(() => (window as unknown as { __shared?: { type: string } }).__shared?.type)).toBe('image/png')

  await popover.getByRole('combobox', { name: 'Move' }).selectOption('__standing__')
  await expect(popover.getByRole('button', { name: 'Download PNG' })).toBeEnabled()
  await popover.getByRole('combobox', { name: 'Direction' }).selectOption('__all_directions__')
  await expect(popover.getByRole('button', { name: 'Download PNG' })).toBeEnabled()
  expect(await popover.locator('.share-preview canvas').evaluate(element => (element as HTMLCanvasElement).width)).toBeGreaterThan(64)
  await popover.getByRole('combobox', { name: 'Move' }).selectOption('__all_moves__')
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

  await page.setViewportSize({ width: 390, height: 844 })
  await expect(trigger.locator('span')).toBeHidden()
  const box = (await popover.boundingBox())!
  expect(box.x).toBeGreaterThanOrEqual(0)
  expect(box.x + box.width).toBeLessThanOrEqual(390)
  const moveBox = (await popover.getByRole('combobox', { name: 'Move' }).boundingBox())!
  const directionBox = (await popover.getByRole('combobox', { name: 'Direction' }).boundingBox())!
  const animateBox = (await popover.locator('.share-animate').boundingBox())!
  expect(moveBox.width).toBeCloseTo(directionBox.width, 0)
  expect(animateBox.width).toBeGreaterThan(moveBox.width * 1.9)
  await page.screenshot({ path: testInfo.outputPath('share-phone.png') })
  await expect(page.locator('.header-export')).toBeHidden()
  await page.getByRole('button', { name: 'More options' }).click()
  await expect(page.getByRole('button', { name: 'Export game assets' })).toBeVisible()
  expect(errors).toEqual([])
  expect(apiRequests).toEqual([])
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
