import { expect, test, type Page } from '@playwright/test'
import { readFile } from 'node:fs/promises'
import { equipmentGroup } from './immersive-helpers.ts'

test.beforeEach(async ({ context }) => {
  await context.addInitScript(() => { try { localStorage.setItem('pixeldoll.agentKey', 'off') } catch { /* Opaque initial pages have no storage. */ } })
  await context.route('https://*.pixellab.ai/**', async route => {
    await route.abort()
    expect(route.request().method(), 'Parity checks must never submit a paid request').toBe('GET')
  })
})

const world = (page: Page) => page.locator('.world-stage')
const selection = (page: Page) => page.getByRole('application', { name: /^Character selection\./ })
const modes = (page: Page) => page.getByRole('navigation', { name: 'Character view', exact: true })

async function landing(page: Page) {
  await page.goto('/')
  await expect(page.locator('.customize-action')).toBeEnabled()
}

test('screen transitions preserve world keyboard focus while creator fields remain native', async ({ page }) => {
  await landing(page)
  await expect(selection(page)).toBeFocused()
  await page.keyboard.press('Enter')
  await expect(world(page)).toBeFocused()
  await page.keyboard.press('ArrowLeft')
  await expect(world(page)).toHaveAttribute('data-facing', 'west')
  const prompt = page.locator('.prompt-disclosure')
  await prompt.locator('summary').click()
  await expect(prompt).toHaveAttribute('open', '')
  await world(page).focus(); await page.keyboard.press('Escape')
  await expect(prompt).not.toHaveAttribute('open')
  await expect(world(page)).toBeFocused()
  await page.keyboard.press('Escape')
  await expect(selection(page)).toBeFocused()
  const create = page.getByRole('button', { name: 'New character', exact: true })
  await create.focus(); await page.keyboard.press('Enter')
  const dialog = page.getByRole('dialog', { name: 'New character', exact: true })
  const name = dialog.getByRole('textbox', { name: 'Name', exact: true })
  await name.fill('Keyboard draft')
  await page.keyboard.press('ArrowLeft')
  await expect(name).toBeFocused()
  await dialog.getByRole('button', { name: 'Cancel', exact: true }).click()
  await expect(create).toBeFocused()
  await expect(selection(page)).toBeVisible()
})

test('Preview resolves partial chord releases, preserves pause and clip selection, and rejects stale repeats', async ({ page }) => {
  await landing(page)
  await page.keyboard.press('Enter')
  const clip = page.getByRole('combobox', { name: 'Move', exact: true })
  const original = await clip.inputValue()
  const pause = page.getByRole('button', { name: 'Pause', exact: true })
  if (await pause.isVisible()) await pause.click()
  await world(page).focus()
  await page.keyboard.down('w'); await page.keyboard.down('d')
  await expect(world(page)).toHaveAttribute('data-facing', 'north')
  await page.keyboard.up('w')
  await expect(world(page)).toHaveAttribute('data-facing', 'east')
  await page.keyboard.up('d')
  await expect(world(page)).toHaveAttribute('data-facing', 'east')
  await page.keyboard.down('d'); await page.keyboard.down('a')
  await expect(world(page)).toHaveAttribute('data-facing', 'east')
  await page.keyboard.up('d')
  await expect(world(page)).toHaveAttribute('data-facing', 'west')
  await page.keyboard.up('a')
  await expect(clip).toHaveValue(original)
  await expect(page.getByRole('button', { name: 'Play', exact: true })).toBeVisible()
  await expect(world(page)).toHaveAttribute('data-position', '0.00,0.00')
  await page.getByRole('button', { name: 'More options', exact: true }).focus()
  await world(page).focus()
  await world(page).dispatchEvent('keydown', { key: 'd', repeat: true })
  await expect(world(page)).toHaveAttribute('data-facing', 'west')
  await page.keyboard.up('d')
})

test('Moves preserves paused Preview and Side-scroller enters using an authored horizontal facing', async ({ page }) => {
  await landing(page); await page.keyboard.press('Enter')
  const pause = page.getByRole('button', { name: 'Pause', exact: true })
  if (await pause.isVisible()) await pause.click()
  await page.getByRole('navigation', { name: 'Customization panels' }).getByRole('button', { name: 'Moves', exact: true }).click()
  await page.locator('.move-row').filter({ hasText: 'Cross punch' }).click()
  await expect(page.getByRole('button', { name: 'Play', exact: true })).toBeVisible()
  await page.getByRole('button', { name: 'Face north', exact: true }).click()
  await expect(world(page)).toHaveAttribute('data-presentation', 'still')
  await expect(page.getByRole('combobox', { name: 'Move', exact: true })).toHaveValue('cross-punch')
  await modes(page).getByRole('button', { name: 'Side-scroller', exact: true }).click()
  await expect(world(page)).toHaveAttribute('data-facing', 'east')
  await expect(world(page)).toHaveAttribute('data-position', '0.00,0.00')
  await modes(page).getByRole('button', { name: 'Preview', exact: true }).click()
  await expect(page.getByRole('button', { name: 'Face north', exact: true })).toHaveAttribute('aria-pressed', 'true')
  await expect(page.getByRole('button', { name: 'Play', exact: true })).toBeVisible()
})

test('resizing stops held live input without teleporting, while a view change resets position', async ({ page }) => {
  await landing(page); await page.keyboard.press('Enter')
  await modes(page).getByRole('button', { name: 'Top-down', exact: true }).click()
  const position = () => world(page).getAttribute('data-position')
  await page.keyboard.down('d')
  await expect.poll(async () => Number((await position())!.split(',')[0])).toBeGreaterThan(10)
  await page.setViewportSize({ width: 1280, height: 820 })
  const stopped = await position()
  expect(Number(stopped!.split(',')[0])).toBeGreaterThan(10)
  await page.waitForTimeout(100)
  expect(await position()).toBe(stopped)
  await page.keyboard.up('d')
  await modes(page).getByRole('button', { name: 'Side-scroller', exact: true }).click()
  await expect(world(page)).toHaveAttribute('data-position', '0.00,0.00')
})

test('selection wheel normalizes deltas, discards bursts and stale fractions, and preserves modified gestures', async ({ page }) => {
  await landing(page); await page.keyboard.press('Enter')
  // Three genuine local projects exercise wrapping without fixture-only navigation state.
  await page.getByRole('button', { name: 'Export', exact: true }).click()
  const exportDialog = page.getByRole('dialog', { name: 'Export', exact: true })
  await exportDialog.getByRole('radio', { name: 'PNG + JSON', exact: true }).click()
  const download = exportDialog.getByRole('button', { name: /^Download ZIP/ })
  await expect(download).toBeEnabled({ timeout: 30_000 })
  const downloaded = page.waitForEvent('download'); await download.click()
  const bytes = await readFile((await (await downloaded).path())!)
  for (let copy = 0; copy < 2; copy++) {
    await page.locator('.project-btn').click()
    await page.getByRole('menuitem', { name: 'Import character…', exact: true }).click()
    const dialog = page.getByRole('dialog', { name: 'Import character', exact: true })
    await dialog.getByLabel('Character ZIP', { exact: true }).setInputFiles({ name: 'wheel-character.zip', mimeType: 'application/zip', buffer: bytes })
    await expect(dialog.getByRole('img', { name: 'Character import preview', exact: true })).toBeVisible()
    await dialog.getByLabel('Character name', { exact: true }).fill(`Wheel character ${copy + 1}`)
    await dialog.getByRole('checkbox', { name: 'Set up the pose rig next (recommended)', exact: true }).uncheck()
    await dialog.getByRole('button', { name: 'Import character', exact: true }).click()
    await expect(page.locator('.scene-identity h1')).toHaveText(`Wheel character ${copy + 1}`)
  }
  await page.getByRole('button', { name: 'Characters', exact: true }).click()
  const rows = page.locator('.character-row')
  await expect(rows).toHaveCount(3)
  const selected = () => rows.evaluateAll(elements => elements.findIndex(element => element.getAttribute('aria-pressed') === 'true'))
  let index = await selected()
  const wheel = (deltaY: number, init: { deltaMode?: number; deltaX?: number; shiftKey?: boolean; ctrlKey?: boolean } = {}) => page.evaluate(({ deltaY, init }) => !window.dispatchEvent(new WheelEvent('wheel', { deltaY, cancelable: true, ...init })), { deltaY, init })
  for (const init of [{ shiftKey: true }, { ctrlKey: true }, { deltaX: 120 }]) expect(await wheel(60, init)).toBe(false)
  expect(await selected()).toBe(index)
  await wheel(3, { deltaMode: 1 }); index = (index + 1) % 3
  await expect.poll(selected).toBe(index)
  // The approved cooldown and fraction window are both 180 ms. Waits must exceed it; events that must land inside it go in
  // one browser task, because separate evaluate round trips can exceed 180 ms under parallel load.
  const wheels = (...deltas: number[]) => page.evaluate(ds => { for (const deltaY of ds) window.dispatchEvent(new WheelEvent('wheel', { deltaY, cancelable: true })) }, deltas)
  await page.waitForTimeout(300)
  await wheels(...Array(8).fill(120))
  index = (index + 1) % 3; await expect.poll(selected).toBe(index)
  await page.waitForTimeout(300)
  await wheel(-40); index = (index + 2) % 3; await expect.poll(selected).toBe(index)
  await page.waitForTimeout(300)
  await wheel(20); await page.waitForTimeout(300); await wheel(20)
  expect(await selected()).toBe(index) // the stale fraction was discarded
  await wheels(20, 20); index = (index + 1) % 3; await expect.poll(selected).toBe(index)
  await page.waitForTimeout(300)
  // Without the sign reset, 30 − 30 − 10 = −10 would not step; with it, −30 − 10 = −40 steps back once.
  await wheels(30, -30, -10); index = (index + 2) % 3; await expect.poll(selected).toBe(index)
  await page.waitForTimeout(300)
  await wheel(1, { deltaMode: 2 }); index = (index + 1) % 3; await expect.poll(selected).toBe(index)
  await page.getByRole('button', { name: 'More options', exact: true }).click()
  expect(await wheel(120)).toBe(false); expect(await selected()).toBe(index)
})

test.describe('two-finger equipment input', () => {
  test.use({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true })
  test('a second finger equips an item while the first continues moving', async ({ page, context }) => {
    await landing(page); await page.locator('.customize-action').click()
    await equipmentGroup(page, 'Head')
    await modes(page).getByRole('button', { name: 'Top-down', exact: true }).click()
    const box = (await world(page).boundingBox())!
    const start = { x: box.x + 12, y: box.y + box.height / 2, id: 1 }
    const moving = { ...start, x: start.x + 42 }
    const hat = page.getByRole('button', { name: 'Wizard hat', exact: true })
    const target = (await hat.boundingBox())!
    const second = { x: target.x + target.width / 2, y: target.y + target.height / 2, id: 2 }
    const cdp = await context.newCDPSession(page)
    const position = () => world(page).evaluate(element => Number(element.dataset.position!.split(',')[0]))
    try {
      await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [start] })
      await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [moving] })
      await expect.poll(position).toBeGreaterThan(5)
      const before = await position()
      await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [moving, second] })
      await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [moving, { ...second, x: second.x + 20 }] })
      await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [{ ...second, x: second.x + 20 }] })
      await expect(hat).toHaveAttribute('aria-pressed', 'false') // A dragged second finger is not an equipment tap.
      await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [moving, second] })
      await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [second] })
      await expect(hat).toHaveAttribute('aria-pressed', 'true')
      await expect.poll(position).toBeGreaterThan(before + 5)
      await expect(page.locator('.world-stick')).toBeVisible()
    } finally {
      await cdp.send('Input.dispatchTouchEvent', { type: 'touchCancel', touchPoints: [] })
      await cdp.detach()
    }
  })
})
