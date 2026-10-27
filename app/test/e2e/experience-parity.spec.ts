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

test('anchored popovers point at their triggers on all four sides', async ({ page }) => {
  await landing(page)
  const initialViewport = page.viewportSize()!
  const options = page.getByRole('button', { name: 'More options', exact: true })
  const optionMenu = page.locator('#experience-options')
  const check = async (id: string, triggerSelector: string, side: string) => {
    const menu = page.locator(`#${id}`)
    await expect(menu).toHaveAttribute('data-side', side)
    await expect(menu).toHaveAttribute('data-positioned', '')
    await expect.poll(() => menu.evaluate(node => node.contains(document.activeElement))).toBe(true)
    const geometry = await menu.evaluate((node, selector) => {
      const panel = node.querySelector('.bu-popover-surface')!.getBoundingClientRect()
      const pointer = node.querySelector('.bu-popover-arrow')!.getBoundingClientRect()
      const trigger = document.querySelector(selector)!.getBoundingClientRect()
      const axis = node.getAttribute('data-side') === 'top' || node.getAttribute('data-side') === 'bottom' ? 'x' : 'y'
      const pointerCenter = axis === 'x' ? pointer.x + pointer.width / 2 : pointer.y + pointer.height / 2
      const triggerCenter = axis === 'x' ? trigger.x + trigger.width / 2 : trigger.y + trigger.height / 2
      const path = node.querySelector<SVGPathElement>('.bu-popover-arrow path:last-child')!
      const transform = path.getScreenCTM()!
      const ends = [new DOMPoint(0, 8), new DOMPoint(12, 8)].map(point => point.matrixTransform(transform))
      const side = node.getAttribute('data-side')
      const border = side === 'bottom' ? panel.top + 0.5 : side === 'top' ? panel.bottom - 0.5 : side === 'right' ? panel.left + 0.5 : panel.right - 0.5
      const seam = Math.max(...ends.map(point => Math.abs((axis === 'x' ? point.y : point.x) - border)))
      return { panel: panel.toJSON(), pointer: pointer.toJSON(), delta: Math.abs(pointerCenter - triggerCenter), seam, hidden: node.hasAttribute('data-arrow-hidden') }
    }, triggerSelector)
    expect(geometry.hidden).toBe(false)
    expect(geometry.delta).toBeLessThanOrEqual(12)
    expect(geometry.seam).toBeLessThanOrEqual(1)
    if (side === 'bottom') expect(geometry.pointer.bottom).toBeLessThanOrEqual(geometry.panel.top + 4)
    if (side === 'top') expect(geometry.pointer.top).toBeGreaterThanOrEqual(geometry.panel.bottom - 4)
    if (side === 'left') expect(geometry.pointer.left).toBeGreaterThanOrEqual(geometry.panel.right - 4)
    if (side === 'right') expect(geometry.pointer.right).toBeLessThanOrEqual(geometry.panel.left + 4)
    if (side === 'left') {
      await page.setViewportSize({ width: 900, height: initialViewport.height })
      await expect(menu).toHaveAttribute('data-side', 'left')
      await expect.poll(() => menu.evaluate((node, selector) => {
        const pointer = node.querySelector('.bu-popover-arrow')!.getBoundingClientRect()
        const trigger = document.querySelector(selector)!.getBoundingClientRect()
        return Math.abs(pointer.y + pointer.height / 2 - trigger.y - trigger.height / 2)
      }, triggerSelector)).toBeLessThanOrEqual(12)
    }
    await page.keyboard.press('Escape')
    await expect(menu).not.toBeVisible()
  }

  await options.click()
  await check('experience-options', '[popovertarget="experience-options"]', 'bottom')
  // A preferred placement above the header has no room; collision handling flips it below.
  await optionMenu.evaluate(node => node.setAttribute('data-placement', 'top-end'))
  await options.click()
  await check('experience-options', '[popovertarget="experience-options"]', 'bottom')
  await optionMenu.evaluate(node => node.setAttribute('data-placement', 'left-start'))
  await options.click()
  await check('experience-options', '[popovertarget="experience-options"]', 'left')
  await page.setViewportSize(initialViewport)

  const project = page.locator('.selected-name')
  await page.locator('#project-menu').evaluate(node => node.setAttribute('data-placement', 'right-start'))
  await project.click()
  await check('project-menu', '.selected-name', 'right')

  await page.setViewportSize({ width: 390, height: 844 })
  await page.locator('.customize-action').click()
  const equipment = page.getByRole('button', { name: 'More', exact: true })
  await equipment.click()
  await check('more-equipment', '[popovertarget="more-equipment"]', 'top')
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
  await page.evaluate(() => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)))) // the movement loop ran
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
    await expect(page.locator('.scene-identity h1')).toHaveText(`Wheel character ${copy + 1}`, { timeout: 30_000 }) // a full import saves and reopens the character
  }
  await page.getByRole('button', { name: 'Characters', exact: true }).click()
  const rows = page.locator('.character-row')
  await expect(rows).toHaveCount(3)
  const selected = () => rows.evaluateAll(elements => elements.findIndex(element => element.getAttribute('aria-pressed') === 'true'))
  let index = await selected()
  const wheel = (deltaY: number, init: { deltaMode?: number; deltaX?: number; shiftKey?: boolean; ctrlKey?: boolean } = {}) => page.evaluate(({ deltaY, init }) => !window.dispatchEvent(new WheelEvent('wheel', { deltaY, cancelable: true, ...init })), { deltaY, init })
  for (const init of [{ shiftKey: true }, { ctrlKey: true }, { deltaX: 120 }]) expect(await wheel(60, init)).toBe(false)
  expect(await selected()).toBe(index)
  // The approved cooldown and fraction window are both 180 ms. Page time is held still (the handler reads only performance.now),
  // so each event lands at an exact time however slow loads or round trips are, and reports whether it started a character
  // load (Customize is disabled while loading). A step selects asynchronously, so final indices alone can mask a wrong step.
  await page.evaluate(() => { const w = window as unknown as { t: number }, t0 = performance.now(); w.t = 0; performance.now = () => t0 + w.t })
  const at = (t: number, deltaY: number, deltaMode = 0) => page.evaluate(async ({ t, deltaY, deltaMode }) => {
    (window as unknown as { t: number }).t = t
    window.dispatchEvent(new WheelEvent('wheel', { deltaY, deltaMode, cancelable: true }))
    await new Promise((resolve) => setTimeout(resolve))
    return document.querySelector<HTMLButtonElement>('.customize-action')!.disabled
  }, { t, deltaY, deltaMode })
  const step = async (delta: number) => {
    index = (index + delta + 3) % 3
    await expect.poll(selected).toBe(index)
    await expect(page.locator('.customize-action')).toBeEnabled()
  }
  expect(await at(0, 3, 1)).toBe(true); await step(1) // lines × 16 px
  expect(await at(300, -40)).toBe(true); await step(-1)
  expect(await at(600, 20)).toBe(false); expect(await at(800, 20)).toBe(false) // a fraction older than 180 ms is discarded
  expect(await at(900, 20)).toBe(true); await step(1) // fractions inside 180 ms add up to 40
  expect(await at(1200, 30)).toBe(false); expect(await at(1210, -30)).toBe(false) // a sign change restarts the fraction
  expect(await at(1220, -10)).toBe(true); await step(-1)
  expect(await at(1500, -30)).toBe(false) // below the threshold in the negative direction too
  expect(await at(1800, 40)).toBe(true); await step(1)
  expect(await at(1900, 120)).toBe(false) // inside the cooldown even a full burst is discarded
  expect(await at(1990, 30)).toBe(false) // and leaves no fraction behind (30 alone, not 150)
  expect(await at(2300, 1, 2)).toBe(true); await step(1) // pages × viewport height
  await page.getByRole('button', { name: 'More options', exact: true }).click()
  expect(await wheel(120)).toBe(false); expect(await selected()).toBe(index)
})

// Moved from experience.spec.ts (screenshot config) so these behavioral checks gate deploys.
async function customize(page: Page) {
  await landing(page)
  await page.locator('.customize-action').click()
  await expect(page.locator('.world-stage')).toHaveAttribute('data-position', '0.00,0.00')
  await expect(page.getByRole('navigation', { name: 'Customization panels' })).toBeVisible()
}
async function pause(page: Page) {
  const pauseButton = page.getByRole('button', { name: 'Pause', exact: true })
  if (await pauseButton.isVisible()) await pauseButton.click()
}

test('phone More preserves Redo and closes after restoring a taken-off item state', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 })
  await customize(page)
  await pause(page)
  const options = page.getByRole('button', { name: 'More options', exact: true })
  const popup = page.locator('#experience-options')
  await options.click()
  await expect(popup.getByRole('button', { name: 'Redo', exact: true })).toBeDisabled()
  await page.keyboard.press('Escape')
  await page.getByRole('tab', { name: /^Head/ }).click()
  const helmet = page.getByRole('button', { name: 'Steel helmet', exact: true })
  const none = page.getByRole('button', { name: 'None', exact: true })
  await expect(helmet).toHaveAttribute('aria-pressed', 'true')
  await none.click()
  await expect(none).toHaveAttribute('aria-pressed', 'true')
  await expect(helmet).toHaveAttribute('aria-pressed', 'false')
  await page.getByRole('button', { name: /^Undo/ }).click()
  await expect(helmet).toHaveAttribute('aria-pressed', 'true')
  await options.click()
  const redo = popup.getByRole('button', { name: 'Redo Take off', exact: true })
  await expect(redo).toBeVisible(); await expect(redo).toBeEnabled()
  await redo.click()
  await expect(popup).not.toBeVisible()
  await expect(options).toBeFocused()
  await expect(none).toHaveAttribute('aria-pressed', 'true')
  await expect(helmet).toHaveAttribute('aria-pressed', 'false')
  await options.click()
  await expect(popup.getByRole('button', { name: 'Redo', exact: true })).toBeDisabled()
})

test('selection search shows an honest zero-result state and preserves native editing', async ({ page }) => {
  await landing(page)
  const search = page.getByRole('searchbox', { name: 'Search characters', exact: true })
  await search.fill('There is no such saved character')
  await expect(page.locator('.character-row')).toHaveCount(0)
  await expect(page.locator('.cast-character')).toHaveCount(0)
  await expect(page.locator('.empty-cast')).toHaveText('No matching characters')
  await expect(page.locator('.customize-action')).toBeDisabled()
  await page.keyboard.press('ArrowLeft'); await page.keyboard.press('Enter')
  await expect(search).toBeFocused()
  await expect(page.getByRole('heading', { name: 'Characters', exact: true })).toBeVisible()
  await search.fill('Adventurer')
  await expect(page.locator('.character-row')).toHaveCount(1)
  await expect(page.locator('.customize-action')).toBeEnabled()
})

test('saved light appearance applies before the application module initializes', async ({ page, context }) => {
  await landing(page)
  await page.evaluate(() => localStorage.setItem('pixeldoll.theme', 'light'))
  let release!: () => void
  const held = new Promise<void>((resolve) => { release = resolve })
  let blocked = 0
  await context.route('**/*', async (route) => {
    const request = route.request()
    if (request.resourceType() === 'script' && !new URL(request.url()).pathname.endsWith('/appearance.js')) {
      blocked++
      await held
    }
    await route.fallback().catch(() => {})
  })
  try {
    await page.reload({ waitUntil: 'commit' })
    await expect.poll(() => blocked).toBeGreaterThan(0)
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'light')
    expect(await page.evaluate(() => document.documentElement.style.colorScheme)).toBe('light')
    await expect(page.locator('#app')).toBeEmpty()
  } finally { release() }
  await expect(page.getByRole('heading', { name: 'Characters', exact: true })).toBeVisible()
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'light')
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
