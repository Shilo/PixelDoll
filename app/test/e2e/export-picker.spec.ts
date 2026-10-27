import { enterStudio, noDisabledHover, openStudio } from './immersive-helpers.ts'
import { expect, test, type Page } from '@playwright/test'
import { readFile } from 'node:fs/promises'
import { unzip } from '../../src/lib/store/zip.ts'

async function savedExport(page: Page, dev: string) {
  await page.setViewportSize({ width: 800, height: 600 }) // Eight parallel settings runs do not need eight full-size animated worlds.
  await page.addInitScript(() => { localStorage.setItem('pixeldoll.agentKey', 'off'); localStorage.setItem('pixeldoll.welcomed', '1') })
  await page.route('https://*.pixellab.ai/**', route => route.abort())
  await openStudio(page, dev)
  await page.evaluate(async () => {
    const statePath = '/src/studio/state.svelte.ts', createPath = '/src/studio/create.ts', rigPath = '/src/lib/rig/rig.ts'
    const state = await import(statePath), { saveCopy } = await import(createPath), { baseHashOf } = await import(rigPath)
    const source = state.store.project, manifest = structuredClone(source.manifest)
    const body = manifest.items.find((item: { id: string }) => item.id === manifest.rig.baseItem)
    // The real demo is covered by the existing export tests. Settings need only two small clips and saved outfits.
    manifest.items = [body]; manifest.slots = manifest.slots.filter((slot: { id: string }) => slot.id === body.slot)
    manifest.materials = manifest.materials.filter((material: { owner: string }) => material.owner === body.id)
    manifest.presets = manifest.presets.map((preset: object) => ({ ...preset, items: { body: body.id }, variants: {} }))
    manifest.rig.directions = [{ id: 'south' }]; delete manifest.rig.rest; delete manifest.rig.anchors
    const hashes: Record<string, string> = {}, used = new Set<string>()
    for (const animation of manifest.rig.animations) {
      animation.cells = 2; animation.loop = true; animation.frames = [{ cell: 0, ms: 100 }, { cell: 1, ms: 100 }]; delete animation.sources
      for (const layer of body.layers) {
        layer.cells[animation.id] = { south: layer.cells[animation.id].south.slice(0, 2) }
        layer.cells[animation.id].south.forEach((hash: string, index: number) => { used.add(hash); hashes[`${animation.id}/south/${index}`] = hash })
      }
    }
    manifest.rig.baseHash = await baseHashOf(manifest.rig, hashes); body.baseHash = manifest.rig.baseHash
    const images = new Map([...source.images].filter(([hash]) => used.has(hash)))
    const id = await saveCopy({ manifest, images }, 'Export settings test')
    await state.refreshProjects(); await state.openProject(id)
  })
  await page.getByRole('button', { name: 'Export', exact: true }).click()
}

test('Export settings persist explicit None, list and All choices, and toggle combined sheets in downloaded ZIPs', async ({ page }, info) => {
  const dev = info.config.projects.find(p => p.name === 'browser-selftests')!.use.baseURL!
  await savedExport(page, dev)
  const dialog = page.getByRole('dialog'), summary = dialog.locator('.export-summary dd')
  const openSettings = async () => { await dialog.getByRole('button', { name: 'Settings', exact: true }).click(); await expect(dialog).toHaveAccessibleName('Export settings') }
  const back = async () => { await dialog.getByRole('button', { name: 'Back', exact: true }).click(); await expect(dialog.getByRole('button', { name: 'Settings', exact: true })).toBeFocused() }
  await openSettings()
  const moves = dialog.locator('.export-moves input'), count = await moves.count()
  expect(count).toBeGreaterThan(1)
  for (let i = 0; i < count; i++) { await moves.nth(i).uncheck(); await expect(moves.nth(i)).toBeEnabled() }
  await back(); await expect(summary.nth(0)).toHaveText('None')
  await openSettings()
  const firstName = await dialog.locator('.export-move span').first().innerText()
  await moves.first().check(); await expect(moves.first()).toBeEnabled()
  await back(); await expect(summary.nth(0)).toHaveText(firstName)
  await openSettings()
  for (let i = 0; i < count; i++) { await moves.nth(i).check(); await expect(moves.nth(i)).toBeEnabled() }
  const dressed = dialog.getByRole('checkbox', { name: 'Include dressed character sheets', exact: true })
  await expect(dressed).toHaveAccessibleDescription('Adds PNG sprite sheets of your current look and each saved outfit, with the body and equipped items combined. Separate layers are always included.')
  await dressed.uncheck(); await expect(dressed).toBeEnabled()
  await back(); await expect(summary).toHaveText(['All', 'None'])
  await dialog.getByRole('button', { name: 'Close export' }).click()
  await page.evaluate(() => location.reload())
  await enterStudio(page)
  await page.getByRole('button', { name: 'Export', exact: true }).click()
  await expect(summary).toHaveText(['All', 'None'])
  await dialog.getByRole('radio', { name: 'PNG + JSON', exact: true }).check()
  const downloadZip = async () => {
    const button = dialog.getByRole('button', { name: /^Download ZIP/ }); await expect(button).toBeEnabled()
    const [download] = await Promise.all([page.waitForEvent('download'), button.click()])
    return unzip(new Uint8Array(await readFile((await download.path())!)))
  }
  const off = await downloadZip(), manifest = JSON.parse(new TextDecoder().decode(off.get('manifest.json')!))
  expect(manifest.rig.animations.every((a: { loop: boolean }) => a.loop === false)).toBe(true)
  expect(manifest.presets.length).toBeGreaterThan(1)
  expect([...off.keys()].some(name => name.startsWith('baked/'))).toBe(false)
  expect([...off.keys()].some(name => name.startsWith('layers/'))).toBe(true)
  expect(JSON.parse(new TextDecoder().decode(off.get('project.json')!)).manifest.exportSettings.dressedCharacterSheets).toBe(false)
  await page.getByRole('button', { name: 'Export', exact: true }).click()
  await openSettings()
  for (let i = 0; i < count; i++) { await moves.nth(i).uncheck(); await expect(moves.nth(i)).toBeEnabled() }
  await dressed.check(); await expect(dressed).toBeEnabled()
  await back(); await expect(summary).toHaveText(['None', 'Current look + saved outfits'])
  await dialog.getByText('Files included', { exact: true }).click()
  await expect(dialog.locator('pre')).toContainText('baked/current/')
  const on = await downloadZip()
  expect([...on.keys()].some(name => name.startsWith('baked/current/'))).toBe(true)
  expect(JSON.parse(new TextDecoder().decode(on.get('manifest.json')!)).rig.animations.every((a: { loop: boolean }) => a.loop === true)).toBe(true)
})

test('Export settings show storage failures without changing the choice or trapping navigation', async ({ page }, info) => {
  await savedExport(page, info.config.projects.find(p => p.name === 'browser-selftests')!.use.baseURL!)
  const dialog = page.getByRole('dialog')
  await expect(dialog.locator('.export-summary dd')).toHaveCount(2)
  const before = await dialog.locator('.export-summary dd').allTextContents()
  await dialog.getByRole('button', { name: 'Settings', exact: true }).click()
  const input = dialog.locator('.export-moves input').first(), checked = await input.isChecked()
  await page.evaluate(() => {
    const studio = (window as unknown as { __studio: { doc: { id: string } } }).__studio, original = IDBObjectStore.prototype.put
    IDBObjectStore.prototype.put = function(value, key) {
      if (this.name === 'projects' && key === studio.doc.id) { IDBObjectStore.prototype.put = original; throw new Error('Synthetic settings write failure') }
      return original.call(this, value, key)
    }
  })
  await input.click() // Failed persistence immediately restores the old checkbox state.
  await expect(dialog.getByRole('alert')).toContainText('Synthetic settings write failure')
  await expect(input).toBeEnabled()
  if (checked) await expect(input).toBeChecked(); else await expect(input).not.toBeChecked()
  await dialog.getByRole('button', { name: 'Back', exact: true }).click()
  await expect(dialog.locator('.export-summary dd')).toHaveText(before)
  await dialog.getByRole('button', { name: 'Close export' }).click()
  await expect(dialog).toHaveCount(0)
})

test('Export navigation and settings fit phones, landscape and both themes, including a character without saved outfits', async ({ page }, info) => {
  await savedExport(page, info.config.projects.find(p => p.name === 'browser-selftests')!.use.baseURL!)
  await page.getByRole('button', { name: 'Close export' }).click()
  await page.evaluate(async () => {
    const path = '/src/studio/state.svelte.ts', state = await import(path), project = state.store.project
    state.store.project = { ...project, manifest: { ...project.manifest, presets: [] } }
  })
  await page.getByRole('button', { name: 'Export', exact: true }).click()
  const dialog = page.getByRole('dialog')
  await expect(dialog.locator('.export-summary dd').nth(1)).toHaveText('Current look')
  for (const theme of ['light', 'dark']) for (const viewport of [{ width: 320, height: 568 }, { width: 844, height: 390 }]) {
    await page.evaluate(theme => document.documentElement.dataset.theme = theme, theme)
    await page.setViewportSize(viewport)
    const close = dialog.getByRole('button', { name: 'Close export' }), settings = dialog.getByRole('button', { name: 'Settings', exact: true })
    const closeBefore = await close.boundingBox(), nav = await settings.boundingBox()
    expect(nav!.x + nav!.width).toBeLessThan(closeBefore!.x)
    await settings.click()
    await expect(dialog.getByRole('group', { name: 'Play animation once' })).toBeVisible()
    const closeAfter = await close.boundingBox()
    expect(closeAfter!.x).toBeCloseTo(closeBefore!.x, 0)
    expect(closeAfter!.y).toBeCloseTo(closeBefore!.y, 0)
    expect(await dialog.evaluate(element => element.scrollWidth <= element.clientWidth)).toBe(true)
    await expect(dialog.locator('[title]')).toHaveCount(0)
    await dialog.getByRole('checkbox', { name: 'Include dressed character sheets', exact: true }).scrollIntoViewIfNeeded()
    await expect(dialog.getByRole('checkbox', { name: 'Include dressed character sheets', exact: true })).toBeVisible()
    await page.screenshot({ path: info.outputPath(`export-settings-${theme}-${viewport.width}.png`) })
    await dialog.getByRole('button', { name: 'Back', exact: true }).click()
    await expect(dialog.getByRole('button', { name: /^Download ZIP/ })).toBeVisible()
  }
  await dialog.getByRole('button', { name: 'Close export' }).click()
  await expect(page.getByRole('button', { name: 'Export', exact: true })).toBeFocused()
})

test('Share preview and downloaded GIF loop continuously for a one-shot move', async ({ page, context }, testInfo) => {
  await context.route('https://api.pixellab.ai/**', route => route.abort())
  await context.addInitScript(() => {
    localStorage.setItem('pixeldoll.agentKey', 'off')
    localStorage.setItem('pixeldoll.welcomed', '1')
  })
  const dev = testInfo.config.projects.find(project => project.name === 'browser-selftests')!.use.baseURL!
  await openStudio(page, dev + '/#/', { waitUntil: 'networkidle' })
  await page.evaluate(() => {
    const studio = (window as unknown as { __studio: { doc: { rev: number }; store: { project: { manifest: { rig: { animations: { id: string; loop: boolean; frames: { cell: number; ms: number }[] }[] } } } } } }).__studio
    const clip = studio.store.project.manifest.rig.animations.find(move => move.id === 'walk')!
    clip.loop = false
    clip.frames = [{ cell: 0, ms: 100 }, { cell: 1, ms: 100 }]
    studio.doc.rev++
  })
  await page.clock.install({ time: new Date('2026-10-27T12:00:00Z') })
  await page.clock.pauseAt(new Date('2026-10-27T12:00:01Z'))
  await page.getByRole('button', { name: 'Share character' }).click()
  const popover = page.getByRole('dialog', { name: 'Share character preview' })
  const frameData = () => popover.locator('.share-preview canvas').evaluate(element => {
    const canvas = element as HTMLCanvasElement
    const data = canvas.getContext('2d')!.getImageData(0, 0, canvas.width, canvas.height).data
    let hash = 2166136261
    for (const byte of data) hash = Math.imul(hash ^ byte, 16777619)
    return hash >>> 0
  })
  await page.clock.runFor(50)
  const first = await frameData()
  await page.clock.runFor(100)
  const second = await frameData()
  expect(second).not.toBe(first)
  for (let cycle = 0; cycle < 3; cycle++) {
    await page.clock.runFor(100)
    expect(await frameData()).toBe(first)
    await page.clock.runFor(100)
    expect(await frameData()).toBe(second)
  }
  await page.clock.resume()
  await expect(popover.getByRole('button', { name: 'Download GIF' })).toBeEnabled()
  const [download] = await Promise.all([page.waitForEvent('download'), popover.getByRole('button', { name: 'Download GIF' }).click()])
  const bytes = await readFile((await download.path())!)
  const loop = bytes.indexOf('NETSCAPE2.0')
  expect(loop).toBeGreaterThan(0)
  expect([...bytes.subarray(loop + 11, loop + 16)]).toEqual([3, 1, 0, 0, 0])
})

test('Copy PNG writes a readable image through the real browser clipboard in animated mode', async ({ page, context }, testInfo) => {
  await context.grantPermissions(['clipboard-read', 'clipboard-write'])
  await context.route('https://api.pixellab.ai/**', route => route.abort())
  await context.addInitScript(() => {
    localStorage.setItem('pixeldoll.agentKey', 'off')
    localStorage.setItem('pixeldoll.welcomed', '1')
  })
  await openStudio(page, testInfo.project.use.baseURL! + '/#/', { waitUntil: 'networkidle' })
  await page.getByRole('button', { name: 'Share character' }).click()
  const popover = page.getByRole('dialog', { name: 'Share character preview' })
  await popover.getByRole('combobox', { name: 'Size' }).selectOption('2')
  await expect(popover.getByRole('button', { name: 'Download GIF' })).toBeEnabled()
  const [download] = await Promise.all([page.waitForEvent('download'), popover.getByRole('button', { name: 'Download GIF' }).click()])
  const gif = [...await readFile((await download.path())!)]
  await popover.getByRole('button', { name: 'Copy PNG', exact: true }).click()
  await expect(popover.getByRole('status')).toHaveText('PNG copied')
  const pixels = await page.evaluate(async gifBytes => {
    const items = await navigator.clipboard.read()
    const png = await items.find(item => item.types.includes('image/png'))!.getType('image/png')
    const [copied, firstFrame] = await Promise.all([createImageBitmap(png), createImageBitmap(new Blob([new Uint8Array(gifBytes)], { type: 'image/gif' }))])
    const data = (image: ImageBitmap) => {
      const canvas = document.createElement('canvas'); canvas.width = image.width; canvas.height = image.height
      const ctx = canvas.getContext('2d')!; ctx.drawImage(image, 0, 0)
      return ctx.getImageData(0, 0, canvas.width, canvas.height).data
    }
    const a = data(copied), b = data(firstFrame)
    const matches = a.length === b.length && a.every((value, i) => value === b[i])
    const dimensions = [copied.width, copied.height]
    copied.close(); firstFrame.close()
    return { matches, dimensions }
  }, gif)
  expect(pixels).toEqual({ matches: true, dimensions: [128, 128] })
})

test('Share popover follows the selected move, direction and Animate switch on desktop and phone', async ({ page, context }, testInfo) => {
  const apiRequests: string[] = []
  await context.route('https://api.pixellab.ai/**', route => { apiRequests.push(route.request().url()); return route.abort() })
  await context.addInitScript(() => {
    localStorage.setItem('pixeldoll.agentKey', 'off')
    localStorage.setItem('pixeldoll.welcomed', '1')
    Object.defineProperty(Navigator.prototype, 'clipboard', { configurable: true, value: { write: async (items: ClipboardItem[]) => {
      const png = await items[0].getType('image/png')
      ;(window as unknown as { __copied?: number[] }).__copied = [...new Uint8Array(await png.arrayBuffer())]
    } } })
    Object.defineProperty(Navigator.prototype, 'canShare', { configurable: true, value: (data: ShareData) => !!data.files?.length })
    Object.defineProperty(Navigator.prototype, 'share', { configurable: true, value: async (data: ShareData) => {
      const file = data.files?.[0]
      ;(window as unknown as { __shared?: { type: string; name: string; size: number; header: number[] } }).__shared = file && { type: file.type, name: file.name, size: file.size, header: [...new Uint8Array(await file.slice(0, 24).arrayBuffer())] }
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
  await expect(popover).toHaveAttribute('data-positioned', '')
  await expect(popover.locator('.bu-popover-arrow')).toBeVisible()
  expect(await popover.evaluate(element => {
    const arrow = element.querySelector('.bu-popover-arrow')!.getBoundingClientRect()
    const trigger = document.querySelector('[popovertarget="share-popover"]')!.getBoundingClientRect()
    return Math.abs(arrow.x + arrow.width / 2 - trigger.x - trigger.width / 2)
  })).toBeLessThanOrEqual(12)
  await expect(popover.getByRole('combobox', { name: 'Move' })).toBeFocused()
  await expect(popover.getByRole('combobox', { name: 'Move' })).toHaveValue('walk')
  await expect(popover.getByRole('combobox', { name: 'Direction' })).toHaveValue('south')
  await expect(popover.getByRole('combobox', { name: 'Size' }).locator('option')).toHaveText(['1x size', '2x size', '3x size', '4x size', '6x size', '8x size', '10x size'])
  await expect(popover.getByRole('switch')).toBeChecked()
  await expect(popover.getByRole('button', { name: 'Download GIF' })).toBeEnabled()
  await expect(popover.getByRole('button', { name: 'Download GIF' })).toContainText('Download GIF')
  await expect(popover.locator('.share-animate')).toContainText('Animated')
  const geometry = () => popover.evaluate(element => {
    const rect = (selector: string) => {
      const box = (selector === '#share-popover' ? element : element.querySelector(selector)!).getBoundingClientRect()
      return [box.x, box.y, box.width, box.height].map(value => Math.round(value))
    }
    const preview = element.querySelector<HTMLElement>('.share-preview')!
    return {
      popover: rect('#share-popover'), preview: rect('.share-preview'),
      move: rect('select[aria-label="Move"]'), direction: rect('select[aria-label="Direction"]'),
      size: rect('select[aria-label="Size"]'), animate: rect('.share-animate'), actions: rect('.share-actions'),
      overflow: preview.scrollHeight > preview.clientHeight + 1 || preview.scrollWidth > preview.clientWidth + 1 || element.scrollHeight > element.clientHeight + 1,
    }
  })
  const fixedLayout = async (expected: Awaited<ReturnType<typeof geometry>>) => {
    const actual = await geometry()
    expect(actual.popover.slice(0, 3)).toEqual(expected.popover.slice(0, 3))
    expect(actual.preview).toEqual(expected.preview)
    expect(actual.move).toEqual(expected.move)
    expect(actual.direction).toEqual(expected.direction)
    expect(actual.size).toEqual(expected.size)
    expect(actual.animate).toEqual(expected.animate)
    expect(actual.size[2]).toBe(actual.animate[2])
    expect(actual.actions).toEqual(expected.actions)
    expect(actual.move[2]).toBe(actual.direction[2])
    expect(actual.overflow).toBe(false)
    expect(actual.popover[0]).toBeGreaterThanOrEqual(0)
    expect(actual.popover[0] + actual.popover[2]).toBeLessThanOrEqual(page.viewportSize()!.width)
    expect(actual.popover[1]).toBeGreaterThanOrEqual(0)
    expect(actual.popover[1] + actual.popover[3]).toBeLessThanOrEqual(page.viewportSize()!.height)
    return actual
  }
  const headerFits = async () => {
    const buttons = await page.locator('.experience-header button:visible').evaluateAll(elements => elements.map(element => {
      const { left, right } = element.getBoundingClientRect()
      return [left, right]
    }).sort((a, b) => a[0] - b[0]))
    for (const [index, [left, right]] of buttons.entries()) {
      expect(left).toBeGreaterThanOrEqual(0)
      expect(right).toBeLessThanOrEqual(page.viewportSize()!.width)
      if (index) expect(left).toBeGreaterThanOrEqual(buttons[index - 1][1])
    }
  }
  const desktopLayout = await geometry()
  const desktopMove = (await popover.getByRole('combobox', { name: 'Move' }).boundingBox())!
  const desktopSwitch = (await popover.locator('.share-animate').boundingBox())!
  expect(desktopSwitch.y).toBeGreaterThanOrEqual(desktopMove.y + desktopMove.height)
  await page.screenshot({ path: testInfo.outputPath('share-desktop.png') })
  const [gif] = await Promise.all([page.waitForEvent('download'), popover.getByRole('button', { name: 'Download GIF' }).click()])
  const gifBytes = await readFile((await gif.path())!)
  expect(gif.suggestedFilename()).toMatch(/-walk-south\.gif$/)
  expect(gifBytes.subarray(0, 6).toString()).toBe('GIF89a')
  await expect(popover.locator('[title]')).toHaveCount(0)
  await popover.getByRole('combobox', { name: 'Size' }).selectOption('3')
  await expect(popover.getByRole('button', { name: 'Download GIF' })).toBeEnabled()
  await expect(popover.locator('.share-resolution')).toHaveText('192 × 192 px')
  await expect(popover.getByRole('button', { name: 'Download GIF' })).toHaveAccessibleDescription('192 × 192 px')
  const [scaledGif] = await Promise.all([page.waitForEvent('download'), popover.getByRole('button', { name: 'Download GIF' }).click()])
  const scaledBytes = await readFile((await scaledGif.path())!)
  expect([scaledBytes.readUInt16LE(6), scaledBytes.readUInt16LE(8)]).toEqual([192, 192])
  await popover.getByRole('button', { name: 'Copy PNG', exact: true }).click()
  await expect(popover.getByRole('status')).toHaveText('PNG copied')
  const copied = Buffer.from(await page.evaluate(() => (window as unknown as { __copied: number[] }).__copied))
  expect([copied.readUInt32BE(16), copied.readUInt32BE(20)]).toEqual([192, 192])
  await popover.getByRole('button', { name: 'Share to…' }).click()
  await expect.poll(() => page.evaluate(() => (window as unknown as { __shared?: { header: number[] } }).__shared?.header)).toEqual([...scaledBytes.subarray(0, 24)])
  await popover.getByRole('combobox', { name: 'Size' }).selectOption('1')
  await expect(popover.getByRole('button', { name: 'Download GIF' })).toBeEnabled()
  await popover.getByRole('button', { name: 'Share to…' }).click()
  await expect.poll(() => page.evaluate(() => (window as unknown as { __shared?: { type: string } }).__shared?.type)).toBe('image/gif')

  await popover.getByRole('combobox', { name: 'Move' }).selectOption('cross-punch')
  await fixedLayout(desktopLayout)
  await popover.getByRole('combobox', { name: 'Move' }).selectOption('walk')
  await expect(popover.getByRole('switch')).toBeEnabled()
  await expect(popover.getByRole('switch')).toBeChecked()

  await popover.getByRole('switch').uncheck()
  await expect(popover.getByRole('button', { name: 'Download PNG' })).toBeEnabled()
  await expect(popover.getByRole('button', { name: 'Download PNG' })).toContainText('Download PNG')
  const [png] = await Promise.all([page.waitForEvent('download'), popover.getByRole('button', { name: 'Download PNG' }).click()])
  const pngBytes = await readFile((await png.path())!)
  expect(png.suggestedFilename()).toMatch(/-walk-south\.png$/)
  expect([...pngBytes.subarray(0, 4)]).toEqual([137, 80, 78, 71])
  await popover.getByRole('button', { name: 'Copy PNG', exact: true }).click()
  await expect(popover.getByRole('status')).toHaveText('PNG copied')
  expect(Buffer.from(await page.evaluate(() => (window as unknown as { __copied: number[] }).__copied)).equals(pngBytes)).toBe(true)
  await popover.getByRole('button', { name: 'Share to…' }).click()
  await expect.poll(() => page.evaluate(() => (window as unknown as { __shared?: { type: string } }).__shared?.type)).toBe('image/png')

  await expect(popover.getByRole('switch')).not.toBeChecked()
  await expect(popover.getByRole('button', { name: 'Download PNG' })).toBeEnabled()
  await popover.getByRole('combobox', { name: 'Direction' }).selectOption('__all_directions__')
  await fixedLayout(desktopLayout)
  await expect(popover.getByRole('button', { name: 'Download PNG' })).toBeEnabled()
  expect(await popover.locator('.share-preview canvas').evaluate(element => (element as HTMLCanvasElement).width)).toBeGreaterThan(64)
  await popover.getByRole('combobox', { name: 'Move' }).selectOption('__all_moves__')
  await fixedLayout(desktopLayout)
  await expect(popover.getByRole('switch')).toBeEnabled()
  await expect(popover.getByRole('switch')).not.toBeChecked()
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
  await fixedLayout(desktopLayout)
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

  await page.keyboard.press('Escape')
  await expect(popover).toBeHidden()
  await page.getByRole('toolbar', { name: 'Preview controls' }).getByRole('combobox', { name: 'Move' }).selectOption('walk')
  await page.getByRole('button', { name: 'Face north', exact: true }).click()
  await trigger.click()
  await expect(popover.getByRole('combobox', { name: 'Move' })).toHaveValue('cross-punch')
  await expect(popover.getByRole('combobox', { name: 'Direction' })).toHaveValue('__all_directions__')
  await expect(popover.getByRole('switch')).not.toBeChecked()

  await page.setViewportSize({ width: 390, height: 844 })
  await expect(trigger.locator('span')).toBeHidden()
  await expect(page.getByRole('button', { name: 'Export', exact: true })).toBeVisible()
  const box = (await popover.boundingBox())!
  expect(box.x).toBeGreaterThanOrEqual(0)
  expect(box.x + box.width).toBeLessThanOrEqual(390)
  const moveBox = (await popover.getByRole('combobox', { name: 'Move' }).boundingBox())!
  const directionBox = (await popover.getByRole('combobox', { name: 'Direction' }).boundingBox())!
  const animateBox = (await popover.locator('.share-animate').boundingBox())!
  expect(moveBox.width).toBeCloseTo(directionBox.width, 0)
  expect(animateBox.width).toBeCloseTo(moveBox.width, 0)
  const phoneLayout = await geometry()
  await popover.getByRole('combobox', { name: 'Move' }).selectOption('walk')
  await popover.getByRole('combobox', { name: 'Direction' }).selectOption('south')
  await fixedLayout(phoneLayout)
  await popover.getByRole('combobox', { name: 'Direction' }).selectOption('__all_directions__')
  await fixedLayout(phoneLayout)
  await popover.getByRole('combobox', { name: 'Move' }).selectOption('__all_moves__')
  await fixedLayout(phoneLayout)
  await popover.getByRole('switch').check()
  await fixedLayout(phoneLayout)
  await popover.getByRole('switch').uncheck()
  await fixedLayout(phoneLayout)
  await page.screenshot({ path: testInfo.outputPath('share-phone.png') })
  await page.setViewportSize({ width: 320, height: 700 })
  const grid = popover.locator('.share-preview')
  expect((await grid.boundingBox())!.height).toBeGreaterThan(200)
  expect((await popover.boundingBox())!.y + (await popover.boundingBox())!.height).toBeLessThanOrEqual(700)
  const smallLayout = await geometry()
  await popover.getByRole('combobox', { name: 'Move' }).selectOption('walk')
  await popover.getByRole('combobox', { name: 'Direction' }).selectOption('south')
  await fixedLayout(smallLayout)
  await popover.getByRole('combobox', { name: 'Direction' }).selectOption('__all_directions__')
  await fixedLayout(smallLayout)
  await popover.getByRole('combobox', { name: 'Move' }).selectOption('__all_moves__')
  await fixedLayout(smallLayout)
  await expect(page.getByRole('button', { name: 'Share character' })).toBeVisible()
  await expect(page.getByRole('button', { name: 'Export', exact: true })).toBeVisible()
  await headerFits()
  await page.screenshot({ path: testInfo.outputPath('share-grid-320.png') })
  await popover.getByRole('combobox', { name: 'Move' }).selectOption('walk')
  await popover.getByRole('combobox', { name: 'Direction' }).selectOption('south')
  await page.setViewportSize({ width: 844, height: 390 })
  await expect.poll(async () => (await popover.boundingBox())!.y + (await popover.boundingBox())!.height).toBeLessThanOrEqual(390)
  const landscape = (await popover.boundingBox())!
  expect(landscape.y).toBeGreaterThanOrEqual(0)
  expect(landscape.y + landscape.height).toBeLessThanOrEqual(390)
  expect((await grid.boundingBox())!.height).toBeLessThanOrEqual(170)
  const landscapeLayout = await geometry()
  await fixedLayout(landscapeLayout)
  await popover.getByRole('combobox', { name: 'Direction' }).selectOption('__all_directions__')
  await fixedLayout(landscapeLayout)
  await popover.getByRole('combobox', { name: 'Move' }).selectOption('__all_moves__')
  await fixedLayout(landscapeLayout)
  await popover.getByRole('switch').check()
  await fixedLayout(landscapeLayout)
  await popover.getByRole('switch').uncheck()
  await fixedLayout(landscapeLayout)
  await page.screenshot({ path: testInfo.outputPath('share-grid-landscape.png') })
  await popover.getByRole('combobox', { name: 'Move' }).selectOption('walk')
  await popover.getByRole('combobox', { name: 'Direction' }).selectOption('south')
  await page.setViewportSize({ width: 320, height: 390 })
  await expect(page.getByRole('button', { name: 'Share character' })).toBeVisible()
  await expect(page.getByRole('button', { name: 'Export', exact: true })).toBeVisible()
  await headerFits()
  expect((await popover.boundingBox())!.y + (await popover.boundingBox())!.height).toBeLessThanOrEqual(390)
  const shortLayout = await geometry()
  await fixedLayout(shortLayout)
  await popover.getByRole('combobox', { name: 'Direction' }).selectOption('__all_directions__')
  await fixedLayout(shortLayout)
  await popover.getByRole('combobox', { name: 'Move' }).selectOption('__all_moves__')
  await fixedLayout(shortLayout)
  await popover.getByRole('combobox', { name: 'Move' }).selectOption('walk')
  await popover.getByRole('combobox', { name: 'Direction' }).selectOption('south')
  await popover.getByRole('combobox', { name: 'Size' }).selectOption('10')
  await popover.getByRole('combobox', { name: 'Size' }).selectOption('2')
  await expect(popover.getByRole('button', { name: 'Download PNG' })).toBeEnabled()
  await expect(popover.locator('.share-resolution')).toHaveText('128 × 128 px')
  const [rapidPng] = await Promise.all([page.waitForEvent('download'), popover.getByRole('button', { name: 'Download PNG' }).click()])
  const rapidBytes = await readFile((await rapidPng.path())!)
  expect([rapidBytes.readUInt32BE(16), rapidBytes.readUInt32BE(20)]).toEqual([128, 128])
  await page.evaluate(() => {
    Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { write: () => Promise.reject(new DOMException('Clipboard permission denied', 'NotAllowedError')) } })
  })
  await popover.getByRole('button', { name: 'Copy PNG', exact: true }).click()
  await expect(popover.getByRole('status')).toHaveText('Could not copy PNG: Clipboard permission denied')
  await expect(popover.getByRole('button', { name: 'Copy PNG', exact: true })).toBeEnabled()
  await page.evaluate(() => { Object.defineProperty(navigator, 'clipboard', { configurable: true, value: undefined }) })
  await popover.getByRole('button', { name: 'Copy PNG', exact: true }).click()
  await expect(popover.getByRole('status')).toContainText('Image copying is unavailable')
  await page.setViewportSize({ width: 280, height: 390 })
  const wrapped = await geometry()
  expect(wrapped.direction[1]).toBeGreaterThanOrEqual(wrapped.move[1] + wrapped.move[3])
  expect(wrapped.animate[1]).toBeGreaterThanOrEqual(wrapped.size[1] + wrapped.size[3])
  expect(wrapped.popover[1]).toBeGreaterThanOrEqual(0)
  expect(wrapped.popover[1] + wrapped.popover[3]).toBeLessThanOrEqual(390)
  await popover.getByRole('button', { name: 'Download PNG' }).scrollIntoViewIfNeeded()
  const reachableDownload = (await popover.getByRole('button', { name: 'Download PNG' }).boundingBox())!
  expect(reachableDownload.y + reachableDownload.height).toBeLessThanOrEqual(390)
  await page.setViewportSize({ width: 390, height: 844 })
  await expect(page.locator('.header-export')).toBeVisible()
  await page.getByRole('button', { name: 'More options' }).click()
  await expect(page.getByRole('button', { name: 'Export game assets' })).toHaveCount(0)
  const disabledRedo = page.locator('.mobile-redo')
  await expect(disabledRedo).toBeDisabled()
  await noDisabledHover(page, disabledRedo)
  await page.getByRole('button', { name: 'Inspect all API calls' }).click()
  const disabledCopy = page.getByRole('button', { name: 'Copy all calls' })
  await expect(disabledCopy).toBeDisabled()
  await noDisabledHover(page, disabledCopy)
  expect(errors).toEqual([])
  expect(apiRequests).toEqual([])
})

test('Share choices reset to the current stage when switching characters', async ({ page, context }, testInfo) => {
  await context.route('https://api.pixellab.ai/**', route => route.abort())
  await context.addInitScript(() => { localStorage.setItem('pixeldoll.agentKey', 'off'); localStorage.setItem('pixeldoll.welcomed', '1') })
  await openStudio(page, testInfo.project.use.baseURL! + '/#/', { waitUntil: 'networkidle' })
  const trigger = page.getByRole('button', { name: 'Share character' })
  const popover = page.getByRole('dialog', { name: 'Share character preview' })
  const move = popover.getByRole('combobox', { name: 'Move' })
  const direction = popover.getByRole('combobox', { name: 'Direction' })
  const stageMove = page.getByRole('toolbar', { name: 'Preview controls' }).getByRole('combobox', { name: 'Move' })
  const stageDirection = () => page.getByRole('group', { name: 'Direction' }).locator('button[aria-pressed="true"]').getAttribute('aria-label').then(label => label!.replace('Face ', ''))
  await trigger.click()
  await move.selectOption('__all_moves__')
  await direction.selectOption('__all_directions__')
  await popover.getByRole('switch').uncheck()
  await popover.getByRole('combobox', { name: 'Size' }).selectOption('4')
  await page.keyboard.press('Escape')
  await page.getByRole('button', { name: 'Export', exact: true }).click()
  const download = page.waitForEvent('download')
  await page.getByRole('button', { name: /Download ZIP/ }).click()
  const bytes = await readFile((await (await download).path())!)
  await page.locator('.project-btn').click()
  await page.getByRole('menuitem', { name: 'Import character…', exact: true }).click()
  await page.getByLabel('Character ZIP', { exact: true }).setInputFiles({ name: 'share-memory.zip', mimeType: 'application/zip', buffer: bytes })
  await page.getByLabel('Character name', { exact: true }).fill('Share memory copy')
  await page.getByRole('checkbox', { name: 'Set up the pose rig next (recommended)' }).uncheck()
  await page.getByRole('button', { name: 'Import character', exact: true }).click()
  await expect(page.locator('.project-btn')).toContainText('Share memory copy', { timeout: 30_000 })
  await trigger.click()
  await expect(move).toHaveValue(await stageMove.inputValue())
  await expect(direction).toHaveValue(await stageDirection())
  await expect(popover.getByRole('switch')).toBeChecked()
  await expect(popover.getByRole('combobox', { name: 'Size' })).toHaveValue('1')
  await move.selectOption('__all_moves__')
  await direction.selectOption('__all_directions__')
  await page.keyboard.press('Escape')
  await page.locator('.project-btn').click()
  await page.getByRole('menuitemradio', { name: 'Adventurer (demo)', exact: true }).click()
  await expect(page.locator('.project-btn')).toContainText('Adventurer', { timeout: 30_000 })
  await trigger.click()
  await expect(move).toHaveValue(await stageMove.inputValue())
  await expect(direction).toHaveValue(await stageDirection())
  await expect(popover.getByRole('switch')).toBeChecked()
  await page.keyboard.press('Escape')
  await page.locator('.project-btn').click()
  await page.getByRole('menuitemradio', { name: 'Share memory copy', exact: true }).click()
  await expect(page.locator('.project-btn')).toContainText('Share memory copy', { timeout: 30_000 })
  await trigger.click()
  await expect(move).toHaveValue(await stageMove.inputValue())
  await expect(direction).toHaveValue(await stageDirection())
  await expect(popover.getByRole('switch')).toBeChecked()
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
