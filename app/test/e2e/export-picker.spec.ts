import { openStudio } from './immersive-helpers.ts'
import { expect, test } from '@playwright/test'
import { readFile } from 'node:fs/promises'
import { unzip } from '../../src/lib/store/zip.ts'

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
  await expect(dialog.getByRole('button', { name: /Download zip/ })).toBeEnabled({ timeout: 30_000 })
  for (const viewport of [{ width: 1440, height: 900 }, { width: 390, height: 844 }, { width: 844, height: 390 }, { width: 768, height: 1024 }]) {
    await page.setViewportSize(viewport)
    await expect(dialog.getByRole('button', { name: /Download zip/ })).toBeVisible()
    expect(await dialog.evaluate((element) => element.scrollWidth <= element.clientWidth)).toBe(true)
    await dialog.getByRole('radio', { name: 'GDevelop', exact: true }).scrollIntoViewIfNeeded()
    await expect(dialog.getByRole('radio', { name: 'GDevelop', exact: true })).toBeVisible()
    if (viewport.width === 1440 || viewport.width === 390) {
      await page.screenshot({ path: testInfo.outputPath(`export-picker-${viewport.width}.png`) })
    }
  }
  const downloadButton = dialog.getByRole('button', { name: /Download zip/ })
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
