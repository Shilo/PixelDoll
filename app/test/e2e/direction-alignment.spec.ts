import { expect, test, type Page } from '@playwright/test'
import { readFile } from 'node:fs/promises'

test.use({ baseURL: `http://127.0.0.1:${process.env.DEV_PORT ?? '5298'}` })

async function setup(page: Page) {
  const network: string[] = []
  await page.addInitScript(() => {
    localStorage.setItem('pixeldoll.agentKey', 'off')
    localStorage.setItem('pixeldoll.welcomed', '1')
    localStorage.setItem('pixeldoll.export.engine', 'generic')
  })
  await page.route('https://*.pixellab.ai/**', route => { network.push(route.request().url()); return route.abort() })
  await page.goto('/')
  await expect(page.locator('.stage canvas').first()).toBeVisible()
  await page.evaluate(async () => {
    const fixturePath = '/test/fixtures/direction-alignment.ts', dbPath = '/src/lib/store/db.ts', pngPath = '/src/lib/image/pngraw.ts', statePath = '/src/studio/state.svelte.ts'
    const { makeAlignmentFixture } = await import(fixturePath) as typeof import('../fixtures/direction-alignment.ts')
    const db = await import(dbPath) as typeof import('../../src/lib/store/db.ts')
    const { encodePngBytes } = await import(pngPath) as typeof import('../../src/lib/image/pngraw.ts')
    const state = await import(statePath) as typeof import('../../src/studio/state.svelte.ts')
    const { project, record } = await makeAlignmentFixture(true)
    const blobs = new Map<string, Blob>()
    for (const [hash, image] of project.images) blobs.set(hash.slice(7), new Blob([(await encodePngBytes(image)) as Uint8Array<ArrayBuffer>], { type: 'image/png' }))
    await db.putCharacter(record.id, record, blobs)
    await state.refreshProjects(); await state.openProject(record.id); await state.flushSave()
    sessionStorage.setItem('alignment-source', JSON.stringify(await db.get('projects', record.id)))
  })
  await expect(page.locator('.project-btn')).toHaveText('Alignment fixture')
  return network
}
async function open(page: Page) {
  await page.locator('.project-btn').click()
  await page.getByRole('menuitem', { name: 'Align directions…', exact: true }).click()
  const sheet = page.getByRole('dialog', { name: 'Align directions', exact: true })
  await expect(sheet.getByRole('button', { name: 'Create aligned copy', exact: true })).toBeEnabled()
  return sheet
}

test('whole-direction copy preserves every layer, motion, skeleton and source through save/reload/export', async ({ page }) => {
  const network = await setup(page), sheet = await open(page)
  await expect(sheet.getByRole('checkbox', { name: /East \/ West/ })).toBeChecked()
  await expect(sheet.locator('.alignment-art canvas')).toHaveCount(4)
  await sheet.getByRole('button', { name: 'Before', exact: true }).click()
  await expect(sheet.getByRole('button', { name: 'Before', exact: true })).toHaveAttribute('aria-pressed', 'true')
  await sheet.getByRole('combobox', { name: 'Preview move', exact: true }).selectOption('jump')
  await sheet.getByRole('button', { name: 'Aligned', exact: true }).click()
  await expect(sheet.getByRole('img').first()).toHaveAttribute('aria-label', /aligned, jump/)
  await sheet.getByRole('textbox', { name: 'Copy name', exact: true }).fill('Reviewed aligned copy')
  await sheet.getByRole('button', { name: 'Create aligned copy', exact: true }).click()
  await expect(sheet).toHaveCount(0)
  await expect(page.locator('.project-btn')).toHaveText('Reviewed aligned copy')
  const inspected = await page.evaluate(async () => {
    const dbPath = '/src/lib/store/db.ts', statePath = '/src/studio/state.svelte.ts', projectPath = '/src/lib/store/project.ts'
    const db = await import(dbPath) as typeof import('../../src/lib/store/db.ts')
    const state = await import(statePath) as typeof import('../../src/studio/state.svelte.ts')
    const { loadProject } = await import(projectPath) as typeof import('../../src/lib/store/project.ts')
    const before = await loadProject('rig-original'), after = await loadProject(state.doc.id)
    const errors: string[] = []; let pixelCells = 0, skeletonPoints = 0
    for (const it of before.project.manifest.items) for (const [li, layer] of it.layers.entries()) {
      const out = after.project.manifest.items.find(x => x.id === it.id)!.layers[li]
      for (const [anim, dirs] of Object.entries(layer.cells!)) for (const [dir, cells] of Object.entries(dirs)) for (const [ci, hash] of cells!.entries()) {
        const next = out.cells![anim][dir as keyof typeof dirs]![ci]
        if (!hash) { if (next !== null) errors.push('lost transparent cell'); continue }
        const oldImg = before.project.images.get(hash)!, newImg = after.project.images.get(next!)!, dy = dir === 'south' ? 0 : 5
        for (let y = 0; y < oldImg.h; y++) for (let x = 0; x < oldImg.w; x++) for (let c = 0; c < 4; c++) {
          const wanted = y >= dy ? oldImg.data[((y - dy) * oldImg.w + x) * 4 + c] : 0
          if (newImg.data[(y * newImg.w + x) * 4 + c] !== wanted) { errors.push(`pixels ${it.id}/${li}/${anim}/${dir}/${ci}`); break }
        }
        pixelCells++
      }
    }
    for (const [key, pose] of Object.entries(before.rec.skeletons!)) for (const [joint, p] of Object.entries(pose)) {
      const next = after.rec.skeletons![key][joint], dy = key.split('/')[1] === 'south' ? 0 : 5
      if (next.x !== p.x || next.y !== p.y + dy || next.z !== p.z) errors.push(`skeleton ${key}/${joint}`)
      skeletonPoints++
    }
    return { errors, pixelCells, skeletonPoints, offsets: after.rec.character?.motionOffsets, sourceSame: JSON.stringify(await db.get('projects', 'rig-original')) === sessionStorage.getItem('alignment-source'), count: (await db.all<import('../../src/lib/store/project.ts').StoredProject>('projects')).filter(p => p.manifest).length, anims: after.rec.manifest.rig.animations.map(a => a.id) }
  })
  expect(inspected.errors).toEqual([]); expect(inspected.pixelCells).toBeGreaterThan(60); expect(inspected.skeletonPoints).toBeGreaterThan(100)
  expect(inspected.offsets).toEqual({ south: 0, north: 5, east: 5, west: 5 }); expect(inspected.sourceSame).toBe(true); expect(inspected.count).toBe(2)
  expect(inspected.anims).toEqual(['idle', 'walk', 'jump'])
  await page.reload(); await expect(page.locator('.project-btn')).toHaveText('Reviewed aligned copy')
  await page.getByRole('button', { name: 'Export', exact: true }).click()
  const downloadPromise = page.waitForEvent('download')
  await page.getByRole('button', { name: /Download .*zip/ }).click()
  const download = await downloadPromise, bytes = [...await readFile((await download.path())!)]
  const roundTrip = await page.evaluate(async raw => {
    const path = '/src/lib/store/import.ts'; const { readCharacterZip } = await import(path) as typeof import('../../src/lib/store/import.ts')
    const imported = await readCharacterZip(Uint8Array.from(raw))
    return { offsets: imported.extra.character?.motionOffsets, skeletons: Object.keys(imported.extra.skeletons ?? {}).length, items: imported.project.manifest.items.length }
  }, bytes)
  expect(roundTrip.offsets).toEqual(inspected.offsets); expect(roundTrip.skeletons).toBe(28); expect(roundTrip.items).toBe(2)
  expect(network).toEqual([])
})

test('responsive comparison and linked selection remain usable without network', async ({ page }) => {
  const network = await setup(page), sheet = await open(page)
  for (const width of [390, 320]) {
    await page.setViewportSize({ width, height: 844 })
    await expect(sheet.getByRole('textbox', { name: 'Copy name', exact: true })).toBeVisible()
    const bounds = await sheet.evaluate(el => ({ width: el.getBoundingClientRect().width, overflow: el.scrollWidth > el.clientWidth, bodyOverflow: el.querySelector('.sheet-body')!.scrollWidth > el.querySelector('.sheet-body')!.clientWidth }))
    expect(bounds.width).toBeLessThanOrEqual(width); expect(bounds.overflow).toBe(false); expect(bounds.bodyOverflow).toBe(false)
  }
  await sheet.getByRole('checkbox', { name: /North/ }).uncheck()
  await sheet.getByRole('checkbox', { name: /East \/ West/ }).uncheck()
  await expect(sheet.getByRole('button', { name: 'Create aligned copy', exact: true })).toBeDisabled()
  await expect(sheet.getByRole('alert')).toHaveCount(0)
  await expect(sheet.locator('.alignment-art canvas')).toHaveCount(4)
  await sheet.getByRole('checkbox', { name: /East \/ West/ }).check()
  await expect(sheet.getByRole('button', { name: 'Create aligned copy', exact: true })).toBeEnabled()
  expect(network).toEqual([])
})

test('stale source and clipping in an unequipped layer block copy publication', async ({ page }) => {
  const network = await setup(page), sheet = await open(page)
  await page.evaluate(async () => {
    const path = '/src/lib/store/db.ts'; const db = await import(path) as typeof import('../../src/lib/store/db.ts')
    await db.update<import('../../src/lib/store/project.ts').StoredProject>('projects', 'rig-original', rec => { rec!.savedAt = 'changed externally'; return rec! })
  })
  await sheet.getByRole('button', { name: 'Create aligned copy', exact: true }).click()
  await expect(sheet.getByRole('alert')).toContainText('changed since this preview')
  await sheet.getByRole('button', { name: 'Cancel', exact: true }).click()
  await page.evaluate(async () => {
    const statePath = '/src/studio/state.svelte.ts', dbPath = '/src/lib/store/db.ts', pngPath = '/src/lib/image/pngraw.ts', imagePath = '/src/lib/image/png.ts', rigPath = '/src/lib/rig/rig.ts'
    const state = await import(statePath) as typeof import('../../src/studio/state.svelte.ts'), db = await import(dbPath) as typeof import('../../src/lib/store/db.ts')
    const { encodePngBytes } = await import(pngPath) as typeof import('../../src/lib/image/pngraw.ts'), { makeImg } = await import(imagePath) as typeof import('../../src/lib/image/png.ts'), { cellHash } = await import(rigPath) as typeof import('../../src/lib/rig/rig.ts')
    const img = makeImg(96, 96); img.data.set([255, 0, 0, 255], (94 * 96 + 48) * 4); const hash = await cellHash(img)
    await db.put('blobs', hash.slice(7), new Blob([(await encodePngBytes(img)) as Uint8Array<ArrayBuffer>], { type: 'image/png' }))
    await db.update<import('../../src/lib/store/project.ts').StoredProject>('projects', 'rig-original', rec => { rec!.manifest.items.find(i => i.id === 'gear')!.layers[1].cells!.walk!.north![0] = hash; rec!.manifest.presets[0].items.head = null; return rec! })
    await state.openProject('rig-original')
  })
  await page.locator('.project-btn').click(); await page.getByRole('menuitem', { name: 'Align directions…', exact: true }).click()
  await expect(sheet.getByRole('alert')).toContainText(/clip/i)
  await expect(sheet.getByRole('button', { name: 'Create aligned copy', exact: true })).toBeDisabled()
  await sheet.getByRole('checkbox', { name: /North/ }).uncheck()
  await expect(sheet.getByRole('button', { name: 'Create aligned copy', exact: true })).toBeEnabled()
  expect(await page.evaluate(async () => { const path = '/src/lib/store/db.ts'; const db = await import(path) as typeof import('../../src/lib/store/db.ts'); return (await db.all<import('../../src/lib/store/project.ts').StoredProject>('projects')).filter(p => p.manifest).length })).toBe(1)
  expect(network).toEqual([])
})
