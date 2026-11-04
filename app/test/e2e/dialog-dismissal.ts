import { expect, test, type Locator, type Page } from '@playwright/test'
import { inspectStage, openAccount, openStudio } from './immersive-helpers.ts'

async function backdrop(dialog: Locator) {
  return dialog.evaluate(element => {
    const { left, top, width, height } = element.getBoundingClientRect()
    if (top > 0) return { x: left + width / 2, y: top / 2 }
    if (left > 0) return { x: left / 2, y: top + height / 2 }
    return null // The full-screen creator has no backdrop to activate.
  })
}

async function center(element: Locator) {
  const bounds = await element.boundingBox()
  expect(bounds).not.toBeNull()
  return { x: bounds!.x + bounds!.width / 2, y: bounds!.y + bounds!.height / 2 }
}

async function mouseDrag(page: Page, from: { x: number; y: number }, to: { x: number; y: number }) {
  await page.mouse.move(from.x, from.y); await page.mouse.down()
  await page.mouse.move(to.x, to.y, { steps: 4 }); await page.mouse.up()
}

for (const [width, height, touch] of [[1440, 900, false], [390, 844, true], [320, 568, true], [844, 390, true]] as const) {
  test.describe(`intentional dialog dismissal ${width}x${height}`, () => {
    test.use({ viewport: { width, height }, hasTouch: touch, isMobile: touch })

    test('content drags preserve multiple windows and intentional backdrop activation closes them', async ({ page, context }) => {
      const requests: string[] = []
      await context.route('https://*.pixellab.ai/**', async route => { requests.push(route.request().method()); await route.abort() })
      await context.addInitScript(() => { localStorage.setItem('pixeldoll.agentKey', 'off'); localStorage.setItem('pixeldoll.welcomed', '1') })
      const session = touch ? await context.newCDPSession(page) : null
      async function drag(from: { x: number; y: number }, to: { x: number; y: number }) {
        if (session) {
          await session.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [from] })
          await session.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [to] })
          await session.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] })
        } else {
          await mouseDrag(page, from, to)
        }
      }
      const cases: { name: string; open: () => Promise<unknown>; field?: string; surface?: string; close: string }[] = [
        { name: 'Connect PixelLab', open: () => openAccount(page), field: 'API key', close: 'Cancel' },
        { name: 'Import character', open: async () => {
          await page.locator('.project-btn').click()
          await page.getByRole('menuitem', { name: 'Import character…', exact: true }).click()
        }, close: 'Cancel' },
        { name: 'New character', open: async () => {
          await page.locator('.project-btn').click()
          await page.getByRole('menuitem', { name: 'New character…', exact: true }).click()
        }, field: 'Details', close: 'Cancel' },
        { name: 'Export', open: () => page.getByRole('button', { name: 'Export', exact: true }).click(), close: 'Close export' },
        { name: 'Inspect character', open: () => inspectStage(page), surface: '.inspection-stage canvas', close: 'Done' },
      ]
      for (const entry of cases) {
        await test.step(entry.name, async () => {
          // Navigation resets native touch-scroll momentum before exercising the next window's tap.
          await openStudio(page, '/')
          await entry.open()
          const dialog = page.getByRole('dialog', { name: entry.name, exact: true })
          await expect(dialog).toBeVisible()
          const outside = await backdrop(dialog)
          if (outside) {
            if (touch) await page.touchscreen.tap(outside.x, outside.y)
            else await page.mouse.click(outside.x, outside.y)
            await expect(dialog).toHaveCount(0)
            await entry.open()
            await expect(dialog).toBeVisible()
          }
          const field = entry.field ? dialog.getByRole('textbox', { name: entry.field, exact: true }) : null
          if (field) await field.fill('unsaved dialog drag regression')
          const inside = await center(field ?? dialog.locator(entry.surface ?? '.sheet-title').first())
          // Full-screen forms have only content; exercise selection across their content surface.
          const release = await backdrop(dialog) ?? { x: 5, y: 5 }
          await drag(inside, release)
          await expect(dialog, 'releasing a content drag on the backdrop must preserve the window').toBeVisible()
          if (field) await expect(field).toHaveValue('unsaved dialog drag regression')
          await drag(release, inside)
          await expect(dialog, 'a backdrop press released inside must preserve the window').toBeVisible()
          if (!touch && outside) {
            await drag(outside, { x: outside.x + 30, y: outside.y })
            await expect(dialog, 'dragging across the backdrop is not a click').toBeVisible()
          }
          await page.getByRole('dialog', { name: entry.name, exact: true }).getByRole('button', { name: entry.close, exact: true }).click()
          await expect(dialog).toHaveCount(0)
        })
      }
      await openAccount(page)
      await expect(page.getByRole('dialog', { name: 'Connect PixelLab', exact: true })).toBeVisible()
      await page.keyboard.press('Escape')
      await expect(page.locator('dialog[open]')).toHaveCount(0)
      await session?.detach()
      expect(requests, 'dialog interactions must never submit PixelLab requests').toEqual([])
    })
  })
}

test('intentional dialog dismissal respects nested API popovers and bare dialog space', async ({ page, context }) => {
  await context.addInitScript(() => { localStorage.setItem('pixeldoll.agentKey', 'off'); localStorage.setItem('pixeldoll.welcomed', '1') })
  await openStudio(page, '/')
  await openAccount(page)
  const dialog = page.getByRole('dialog', { name: 'Connect PixelLab', exact: true })
  const input = dialog.getByRole('textbox', { name: 'API key', exact: true })
  await input.fill('unsaved nested dialog regression')
  const outside = (await backdrop(dialog))!
  await dialog.getByRole('button', { name: 'Inspect API calls', exact: true }).click()
  const peek = dialog.locator('[popover]:popover-open')
  await expect(peek).toHaveAttribute('data-positioned', '')
  await mouseDrag(page, await center(peek.locator('.peek-head')), outside)
  await expect(dialog).toBeVisible()
  await expect(input).toHaveValue('unsaved nested dialog regression')
  await expect(peek).toBeVisible()
  await page.mouse.click(outside.x, outside.y)
  await expect(peek).toHaveCount(0)
  await expect(dialog).toBeVisible()

  // A dialog's own margin/padding can be the event target without being the backdrop.
  const bare = await dialog.evaluate(element => {
    const gap = document.createElement('div')
    gap.style.cssText = 'height:20px;flex:none;pointer-events:none'
    element.append(gap)
    const { x, y, width, height } = gap.getBoundingClientRect()
    return { x: x + width / 2, y: y + height / 2 }
  })
  await page.mouse.click(bare.x, bare.y)
  await expect(dialog).toBeVisible()
  await mouseDrag(page, bare, outside)
  await expect(dialog).toBeVisible()
  await page.mouse.click(outside.x, outside.y)
  await expect(dialog).toHaveCount(0)
})

test('intentional dialog dismissal preserves native Share popovers during content drags', async ({ page, context }) => {
  await context.addInitScript(() => { localStorage.setItem('pixeldoll.agentKey', 'off'); localStorage.setItem('pixeldoll.welcomed', '1') })
  await openStudio(page, '/')
  const trigger = page.getByRole('button', { name: 'Share character', exact: true })
  await trigger.click()
  const share = page.getByRole('dialog', { name: 'Share character preview', exact: true })
  await expect(share).toHaveAttribute('data-positioned', '')
  await share.getByRole('combobox', { name: 'Size', exact: true }).selectOption('4')
  const outside = { x: 5, y: 450 }
  await mouseDrag(page, await center(share.getByRole('img', { name: 'Selected artwork preview', exact: true })), outside)
  await expect(share).toBeVisible()
  await expect(share.getByRole('combobox', { name: 'Size', exact: true })).toHaveValue('4')
  await page.mouse.click(outside.x, outside.y)
  await expect(share).toBeHidden()
  await trigger.click()
  await expect(share).toBeVisible()
  await page.keyboard.press('Escape')
  await expect(share).toBeHidden()
})
