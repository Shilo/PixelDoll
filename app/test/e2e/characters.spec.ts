import { openStudio, reloadStudio, equipmentMode, equipmentGroup, newItem, selectedItemDetails } from './immersive-helpers.ts'
import { test, expect } from '@playwright/test'
import { readFile } from 'node:fs/promises'
import { makeImg } from '../../src/lib/image/png.ts'
import { encodePngBytes } from '../../src/lib/image/pngraw.ts'
import { zip } from '../../src/lib/store/zip.ts'
import { LABELS } from '../../src/lib/rig/poses.ts'
import type { StoredProject } from '../../src/lib/store/project.ts'

const ID = 'f6a0bdc5-354e-4682-8df3-55fc3d118737'
test.beforeEach(async ({ context }) => {
  await context.addInitScript(() => { localStorage.setItem('pixeldoll.agentKey', 'off'); localStorage.setItem('pixeldoll.welcomed', '1') })
  await context.route('https://*.pixellab.ai/**', route => route.abort()) // stay offline by default; a test's own route overrides this
})

test('import can be canceled before choosing a file and reopened', async ({ page }, info) => {
  await openStudio(page, info.config.projects.find((p) => p.name === 'browser-selftests')!.use.baseURL!)
  for (const close of ['Cancel', 'Escape']) {
    await page.locator('.project-btn').click()
    await page.getByRole('menuitem', { name: 'Import character…', exact: true }).click()
    await expect(page.getByRole('dialog')).toBeVisible()
    if (close === 'Cancel') await page.getByRole('button', { name: 'Cancel', exact: true }).click()
    else await page.keyboard.press('Escape')
    await expect(page.getByRole('dialog')).toHaveCount(0)
    await expect(page.locator('.project-btn')).toBeFocused()
  }
})

test('suspicious imported walking joints plan a priced frozen-frame alternative before any API request', async ({ page, context }, info) => {
  const requests: string[] = []
  await context.route('https://api.pixellab.ai/**', route => { requests.push(route.request().method()); return route.abort() })
  await openStudio(page, info.config.projects.find(p => p.name === 'browser-selftests')!.use.baseURL!)
  const planned = await page.evaluate(async () => {
    const statePath = '/src/studio/state.svelte.ts', dbPath = '/src/lib/store/db.ts', posesPath = '/src/lib/rig/poses.ts'
    const s = await import(statePath), db = await import(dbPath), { LABELS } = await import(posesPath)
    await s.copyDemo()
    const rec = await db.get('projects', s.doc.id), rig = rec.manifest.rig
    const points = LABELS.map((label: string) => {
      const side = label.startsWith('LEFT') ? -1 : label.startsWith('RIGHT') ? 1 : 0
      const name = label.replace(/^(LEFT|RIGHT) /, '')
      const [spread, y] = ({ NOSE: [0, .2], NECK: [0, .35], SHOULDER: [.15, .35], ELBOW: [.2, .5], ARM: [.22, .65], HIP: [.1, .62], KNEE: [.11, .77], LEG: [.12, .93], EYE: [.06, .17], EAR: [.12, .19] } as Record<string, number[]>)[name]
      return { label, x: .5 + side * spread, y }
    })
    const broken = points.map((p: { label: string; x: number; y: number }) => /SHOULDER|HIP/.test(p.label) ? { ...p, x: 1 - p.x } : p.label === 'LEFT EAR' ? { ...p, x: .62 } : p)
    const base = rec.manifest.items.find((i: { slot: string }) => i.slot === 'body').layers[0]
    rig.rest = {}
    for (const d of rig.directions.filter((d: { mirrorOf?: string }) => !d.mirrorOf)) {
      rig.rest[d.id] = { image: base.cells.walk[d.id][0], keypoints: points }
      for (const a of rig.animations) {
        a.sources ??= {}
        a.sources[d.id] = { route: 'import', reference: rig.rest[d.id].image, keypoints: Array.from({ length: a.cells }, (_, i) => a.id === 'walk' && d.id === 'south' && i === 0 ? broken : points), provenance: [] }
      }
    }
    rec.character = { id: 'synthetic-imported-pose', looks: 'Synthetic pose fixture' }
    await db.put('projects', s.doc.id, rec)
    s.store.project = { ...s.store.project, manifest: rec.manifest }
    const plansPath = '/src/studio/apiPlans.ts', { itemPlan } = await import(plansPath)
    const calls = itemPlan({ rec, project: s.store.project }, { name: 'Coat', slot: 'torso_inner', prompt: 'long coat and boots' })
    return { gens: calls.reduce((n: number, c: { generations?: number }) => n + (c.generations ?? 0), 0), grids: calls.filter((c: { label: string }) => c.label?.startsWith('Dress frozen frames')) }
  })
  await newItem(page, 'Body')
  const sheet = page.getByRole('dialog', { name: 'New item', exact: true })
  await sheet.locator('textarea').fill('long coat and boots')
  expect(planned.grids).toHaveLength(1)
  expect(planned.grids[0]).toMatchObject({ path: '/inpaint-v3', generations: 10 })
  await expect(sheet.getByRole('alert')).toHaveCount(0)
  await expect(sheet.getByRole('button', { name: `Make · Est. ${planned.gens} gens`, exact: true })).toBeEnabled()
  await sheet.getByRole('button', { name: 'Inspect API calls', exact: true }).click()
  const api = page.getByRole('dialog', { name: 'API calls', exact: true })
  const frozen = api.locator('.peek-call').filter({ hasText: planned.grids[0].label })
  await expect(frozen).toHaveCount(1)
  await expect(frozen.locator('.call-price')).toHaveText('~10 gens')
  await frozen.locator('summary').click()
  await expect(frozen).toContainText('Automatic alternative to suspicious imported joints')
  await expect(frozen).toContainText('frozen body frames')
  expect(requests).toEqual([])
})

test('saved garment coverage warnings keep their specific review reasons after reload', async ({ page, context }, info) => {
  const requests: string[] = []
  await context.route('https://api.pixellab.ai/**', route => { requests.push(route.request().method()); return route.abort() })
  await openStudio(page, info.config.projects.find(p => p.name === 'browser-selftests')!.use.baseURL!)
  await page.evaluate(async () => {
    const statePath = '/src/studio/state.svelte.ts', dbPath = '/src/lib/store/db.ts'
    const s = await import(statePath), db = await import(dbPath)
    await s.copyDemo()
    const rec = await db.get('projects', s.doc.id), item = rec.manifest.items.find((i: { slot: string }) => i.slot === 'torso_inner')
    item.qa = { minKeyKept: 1, maxKeyOutside: 0, minAreaRatio: 1, maxAreaCV: 0, maxPaletteDist: 0, clipPx: 0, status: 'accepted', rerolls: 0, cells: {}, missingLowerFrames: 2, footwearReviewFrames: 1, waistReviewFrames: 1, facingReviewFrames: 1 }
    await db.put('projects', s.doc.id, rec)
  })
  await reloadStudio(page)
  await equipmentGroup(page, 'Body')
  const pane = await selectedItemDetails(page)
  await expect(pane.locator('.badge.look')).toContainText('Needs a look')
  await expect(pane.getByText('Some lower clothing is missing compared with the standing design', { exact: true })).toBeVisible()
  await expect(pane.getByText('Footwear differs from the standing design; inspect the feet', { exact: true })).toBeVisible()
  await expect(pane.getByText('The waist band differs from the standing design; inspect the clothing', { exact: true })).toBeVisible()
  await expect(pane.getByText('Some frames resemble the opposite view; inspect the torso', { exact: true })).toBeVisible()
  await expect(pane.getByText('PixelLab returned an unexpected image', { exact: true })).toHaveCount(0)
  expect(requests).toEqual([])
})

test('a standing consistency stop cannot keep an item before its requested walking coverage exists', async ({ page, context }, info) => {
  const requests: string[] = []
  await context.route('https://api.pixellab.ai/**', route => { requests.push(route.request().method()); return route.abort() })
  await openStudio(page, info.config.projects.find(p => p.name === 'browser-selftests')!.use.baseURL!)
  await equipmentGroup(page, 'Body')
  await page.evaluate(async () => {
    const statePath = '/src/studio/state.svelte.ts', s = await import(statePath)
    await s.copyDemo()
    const p = s.store.project, item = p.manifest.items.find((i: { slot: string }) => i.slot === 'torso_inner')
    const dirs = p.manifest.rig.directions.filter((d: { mirrorOf?: string }) => !d.mirrorOf).map((d: { id: string }) => d.id)
    s.ui.playing = false; s.ui.anim = 'walk'; s.ui.inspTab = 'item'
    const calls = [{ kind: 'dress', cells: dirs.map((d: string) => `rest/${d}/0`), seed: 1, rerolls: 0, old: [] }, ...dirs.map((d: string) => ({ kind: 'pose', cells: Array.from({ length: 8 }, (_, i) => `walk/${d}/${i}`), seed: 2, rerolls: 0, old: [] }))]
    s.gens.push({ draft: { rigId: s.doc.id, spec: { id: item.id, name: 'Unresolved standing design', slot: item.slot, prompt: 'white waistband', key: 'green', method: 'skel', anims: ['walk'], dirs }, calls, keySwitched: false, log: [] }, input: { name: 'Unresolved standing design', slot: item.slot, prompt: 'white waistband' }, phase: 'review', status: 'Standing design needs review' })
    s.store.results = { ...s.store.results, [item.id]: { cells: [], qa: { qa: { status: 'warn' }, warnings: [], failCalls: new Map(), softCalls: new Map() }, g1: new Map([[0, 'D2 keyframe north: the requested wraparound waist band is missing compared with the other standing views']]), preview: p } }
    s.ui.selected = `gen:${item.id}`
  })
  const review = page.locator('.gen')
  await expect(review.locator('.badge.look')).toContainText('Needs a look')
  await expect(review.getByRole('button', { name: 'Keep it', exact: true })).toBeDisabled()
  await expect(review.locator('.badge.clean')).toHaveCount(0)
  expect(requests).toEqual([])
})

test('canceling a downloading import closes it and cannot reopen a late preview', async ({ page, context }, info) => {
  const im = makeImg(48, 48)
  im.data.set([180, 100, 80, 255], (30 * 48 + 24) * 4)
  const data = await zip([{ name: 'metadata.json', data: new TextEncoder().encode(JSON.stringify({ name: 'Late preview' })) }, { name: 'rotations/south.png', data: await encodePngBytes(im) }])
  let finish!: () => void
  const held = new Promise<void>((resolve) => { finish = resolve })
  const calls: string[] = []
  await context.route('https://api.pixellab.ai/**', async (route) => {
    calls.push(route.request().method())
    await held
    await route.fulfill({ contentType: 'application/zip', body: Buffer.from(data) }).catch(() => {})
  })
  await openStudio(page, info.config.projects.find((p) => p.name === 'browser-selftests')!.use.baseURL!)
  await expect(page.locator('.project-btn')).toContainText('Adventurer')
  await page.locator('.project-btn').click()
  await page.getByRole('menuitem', { name: 'Import character…', exact: true }).click()
  await page.getByRole('tab', { name: 'From PixelLab', exact: true }).click()
  await page.getByLabel('Character ID or PixelLab link', { exact: true }).fill(ID)
  await page.getByRole('button', { name: 'Preview character', exact: true }).click()
  try {
    await expect(page.getByRole('dialog').getByRole('status')).toContainText('Preparing your character')
    await page.getByRole('button', { name: 'Cancel', exact: true }).click()
    await expect(page.getByRole('dialog')).toHaveCount(0)
  } finally { finish() }
  await page.locator('.project-btn').click()
  await page.getByRole('menuitem', { name: 'Import character…', exact: true }).click()
  await expect(page.getByRole('dialog')).not.toContainText('PixelLab could not find')
  await expect(page.getByRole('button', { name: 'Import character', exact: true })).toBeDisabled()
  await page.getByRole('button', { name: 'Cancel', exact: true }).click()
  await expect(page.locator('.project-btn')).toContainText('Adventurer')
  expect(calls).toEqual(['GET'])
})

test('device import roundtrip, duplicate copies, persistence and local deletion', async ({ page, context }) => {
  const requests: string[] = [], errors: string[] = []
  page.on('pageerror', (e) => errors.push(e.message))
  await context.route('https://api.pixellab.ai/**', async (route) => { requests.push(route.request().method()); await route.abort() })
  await openStudio(page, '/')
  await expect(page.locator('.world-actors').first()).toBeVisible()
  await page.getByRole('button', { name: 'Export', exact: true }).click()
  const download = page.waitForEvent('download')
  await page.getByRole('button', { name: /Download ZIP/ }).click()
  const bytes = await readFile((await (await download).path())!)
  async function importCopy(name: string) {
    await page.locator('.project-btn').click()
    await page.getByRole('menuitem', { name: 'Import character…', exact: true }).click()
    await page.getByLabel('Character ZIP', { exact: true }).setInputFiles({ name: 'saved-character.zip', mimeType: 'application/zip', buffer: bytes })
    await expect(page.getByRole('img', { name: 'Character import preview' })).toBeVisible()
    await page.getByLabel('Character name', { exact: true }).fill(name)
    await page.getByRole('checkbox', { name: 'Set up the pose rig next (recommended)' }).uncheck()
    await page.getByRole('button', { name: 'Import character', exact: true }).click()
    // Saving then reopening a full character decodes every frame; parallel workers can stretch it past 10s.
    await expect(page.locator('.project-btn')).toContainText(name, { timeout: 30_000 })
  }
  await importCopy('Imported one')
  await reloadStudio(page)
  await expect(page.locator('.project-btn')).toContainText('Imported one')
  await importCopy('Imported two')
  await page.locator('.project-btn').click()
  await expect(page.getByRole('menuitemradio', { name: 'Imported one', exact: true })).toBeVisible()
  await expect(page.getByRole('menuitemradio', { name: 'Imported two', exact: true })).toBeVisible()
  await page.getByRole('menuitem', { name: 'Delete character…', exact: true }).click()
  await expect(page.getByRole('dialog')).toContainText('Imported two')
  await page.getByRole('button', { name: 'Cancel', exact: true }).click()
  await expect(page.locator('.project-btn')).toContainText('Imported two')
  // All characters created by this test are disposable fixtures in an isolated browser context.
  for (const remaining of ['Imported one', 'Adventurer (demo)']) {
    await page.locator('.project-btn').click()
    await page.getByRole('menuitem', { name: 'Delete character…', exact: true }).click()
    await page.getByRole('button', { name: 'Delete character', exact: true }).click()
    await expect(page.locator('.project-btn')).toContainText(remaining.replace(/ \(demo\)$/, ''), { timeout: 30_000 })
  }
  await reloadStudio(page)
  await expect(page.locator('.project-btn')).toContainText('Adventurer')
  await page.locator('.project-btn').click()
  await expect(page.getByRole('menuitem', { name: 'Delete character…', exact: true })).toHaveCount(0)
  await expect(page.getByRole('menuitemradio', { name: /^Imported/ })).toHaveCount(0)
  expect(errors).toEqual([])
  expect(requests).toEqual([])
})

test('PixelLab library connection, pagination and direct import use only free reads', async ({ page, context }) => {
  const im = makeImg(48, 48)
  for (let y = 12; y < 43; y++) for (let x = 18; x < 30; x++) im.data.set([180, 120, 80, 255], (y * 48 + x) * 4)
  const data = await zip([{ name: 'metadata.json', data: new TextEncoder().encode(JSON.stringify({ name: 'Library hero' })) }, { name: 'rotations/south.png', data: await encodePngBytes(im) }])
  const calls: string[] = []
  await context.route('https://api.pixellab.ai/**', async (route) => {
    const req = route.request(), url = new URL(req.url())
    calls.push(`${req.method()} ${url.pathname}${url.search}`)
    if (req.method() !== 'GET') return route.abort()
    if (url.pathname.endsWith('/balance')) return route.fulfill({ json: { credits: { type: 'usd', usd: 0 }, subscription: { type: 'generations', status: 'active', generations: 100, total: 100 } } })
    if (url.pathname === '/v2/characters') return route.fulfill({ json: { total: 21, characters: url.searchParams.get('offset') === '20' ? [{ id: ID, name: 'Page two hero', directions: 1, animation_count: 0 }] : Array.from({ length: 20 }, (_, i) => ({ id: `00000000-0000-4000-8000-${String(i + 1).padStart(12, '0')}`, name: i ? `Library hero ${i + 1}` : 'Library hero', directions: 1, animation_count: 0 })) } })
    if (url.pathname.endsWith('/zip')) { expect(req.headers().authorization).toBeUndefined(); return route.fulfill({ contentType: 'application/zip', body: Buffer.from(data) }) }
    return route.abort()
  })
  await openStudio(page, '/')
  await page.locator('.project-btn').click()
  await page.getByRole('menuitem', { name: 'Import character…', exact: true }).click()
  await page.getByRole('tab', { name: 'From PixelLab', exact: true }).click()
  await page.getByRole('button', { name: 'Connect PixelLab to browse your characters' }).click()
  await page.getByLabel('API key', { exact: true }).fill('test-only-not-a-real-key')
  await page.getByRole('dialog').getByRole('button', { name: 'Connect', exact: true }).click()
  await expect(page.getByRole('button', { name: /Library hero 1 direction ·/ })).toBeVisible()
  await expect(page.locator('.character-library .library-character')).toHaveCount(20)
  await expect(page.getByText('1–20 of 21', { exact: true })).toBeVisible()
  await expect(page.getByRole('button', { name: 'Previous', exact: true })).toBeDisabled()
  await page.getByRole('button', { name: 'Next', exact: true }).click()
  await expect(page.getByRole('button', { name: /Page two hero/ })).toBeVisible()
  await expect(page.getByText('21–21 of 21', { exact: true })).toBeVisible()
  await expect(page.getByRole('button', { name: 'Next', exact: true })).toBeDisabled()
  await page.getByRole('button', { name: 'Previous', exact: true }).click()
  await expect(page.getByText('1–20 of 21', { exact: true })).toBeVisible()
  await page.getByRole('button', { name: 'Next', exact: true }).click()
  await page.getByRole('button', { name: /Page two hero/ }).click()
  await expect(page.getByRole('img', { name: 'Character import preview' })).toBeVisible()
  await page.getByRole('checkbox', { name: 'Set up the pose rig next (recommended)' }).uncheck()
  await page.getByRole('button', { name: 'Import character', exact: true }).click()
  await expect(page.locator('.project-btn')).toContainText('Library hero')
  await page.locator('.project-btn').click()
  await page.getByRole('menuitem', { name: 'Delete character…', exact: true }).click()
  // Queue state is persisted by the real application, and deletion must refuse in-flight paid work.
  await page.evaluate(async () => {
    await new Promise<void>((resolve, reject) => {
      const r = indexedDB.open('pixeldoll'); r.onerror = () => reject(r.error)
      r.onsuccess = () => { const db = r.result, t = db.transaction('projects', 'readwrite'); t.objectStore('projects').put({ id: 'studio-create', spec: { name: 'Pending fixture' } }, 'studio-create'); t.oncomplete = () => { db.close(); resolve() } }
    })
  })
  await page.getByRole('button', { name: 'Delete character', exact: true }).click()
  await expect(page.getByRole('alert')).toContainText('pending generation work')
  expect(calls.every((c) => c.startsWith('GET '))).toBe(true)
  expect(calls).toContain(`GET /v2/characters/${ID}/zip?states=${ID}`)
})

test('imported artwork gets the shared rig, weapon plan and new-move pipeline', async ({ page, context }) => {
  page.setDefaultTimeout(10_000)
  const im = makeImg(64, 64)
  for (let y = 10; y < 60; y++) for (let x = 25; x < 38; x++) im.data.set([180, 100, 90, 255], (y * 64 + x) * 4)
  const image = await encodePngBytes(im), base64 = Buffer.from(image).toString('base64')
  const data = await zip([
    { name: 'metadata.json', data: new TextEncoder().encode(JSON.stringify({ name: 'Rig parity fixture', prompt: 'red hair, blue coat and boots', view: 'side' })) },
    ...['south', 'east', 'north', 'west'].map((d) => ({ name: `rotations/${d}.png`, data: image })),
  ])
  const keypoints = LABELS.map((label, i) => ({ label, x: (25 + i % 4) / 64, y: (12 + Math.floor(i / 4) * 8) / 64 }))
  const jobs = new Map<string, number>(), posts: { path: string; body: Record<string, unknown> }[] = [], errors: string[] = []
  page.on('pageerror', (e) => errors.push(e.message))
  await context.route('https://api.pixellab.ai/**', async (route) => {
    const req = route.request(), path = new URL(req.url()).pathname
    if (path.endsWith('/balance')) return route.fulfill({ json: { credits: { type: 'usd', usd: 0 }, subscription: { type: 'generations', status: 'active', generations: 100, total: 100 } } })
    if (req.method() === 'POST') {
      const body = req.postDataJSON() as Record<string, unknown>; posts.push({ path, body })
      if (path.endsWith('/estimate-skeleton')) return route.fulfill({ json: { keypoints, usage: { type: 'generations', generations: 0.1 } } })
      if (path.endsWith('/create-character-v3')) return route.fulfill({ json: { character_id: 'managed-parity-fixture', usage: { type: 'generations', generations: 0.25 } } })
      if (path.endsWith('/animate-with-skeleton-v3')) {
        const id = `pose-${jobs.size}`; jobs.set(id, (body.keypoints as unknown[]).length)
        return route.fulfill({ json: { background_job_id: id } })
      }
    }
    const count = jobs.get(path.split('/').pop()!)
    if (count) return route.fulfill({ json: { id: path.split('/').pop(), status: 'completed', created_at: '', usage: { type: 'generations', generations: 2 }, last_response: { images: Array.from({ length: count }, () => ({ type: 'base64', base64 })) } } })
    return route.abort()
  })
  await openStudio(page, '/')
  await page.locator('.project-btn').click()
  await page.getByRole('menuitem', { name: 'Import character…', exact: true }).click()
  await page.getByLabel('Character ZIP', { exact: true }).setInputFiles({ name: 'hero.zip', mimeType: 'application/zip', buffer: Buffer.from(data) })
  await page.getByRole('button', { name: 'Import character', exact: true }).click()
  await expect(page.getByRole('dialog')).toContainText('0.35 gens estimated')
  await expect(page.getByLabel('Existing appearance')).toHaveValue('red hair, blue coat and boots')
  await page.getByRole('button', { name: /^Set up.*0.35 gens$/ }).click()
  await page.getByLabel('API key', { exact: true }).fill('test-only-not-a-real-key')
  await page.getByRole('dialog').getByRole('button', { name: 'Connect', exact: true }).click()
  await expect(page.getByRole('dialog')).toContainText('Ready. You can add equipment and moves fitted to this character.', { timeout: 30_000 })
  await page.getByRole('button', { name: 'Start dressing up' }).click()
  const read = () => page.evaluate(async () => new Promise<StoredProject>((resolve, reject) => {
    const r = indexedDB.open('pixeldoll'); r.onerror = () => reject(r.error)
    r.onsuccess = () => { const db = r.result, q = db.transaction('projects').objectStore('projects').getAll(); q.onsuccess = () => { db.close(); resolve(q.result.find((r: StoredProject) => r.manifest?.name === 'Rig parity fixture')) }; q.onerror = () => reject(q.error) }
  }))
  const before = await read()
  expect(before.character).toEqual({ id: 'managed-parity-fixture', looks: 'red hair, blue coat and boots' })
  expect(before.manifest.rig.rest?.west?.keypoints).toHaveLength(18)
  expect((before.rigQa as { clips: Record<string, { adherence: number | null }> }).clips['default/south'].adherence).toBeNull()
  await newItem(page, 'Hands')
  await page.getByRole('radio', { name: 'Held item', exact: true }).click()
  await page.getByRole('dialog').getByText('Details', { exact: true }).click()
  await expect(page.getByRole('dialog')).toContainText('96 px canvas')
  await page.getByRole('button', { name: 'Cancel', exact: true }).click()
  await equipmentMode(page, 'Moves')
  await page.getByRole('button', { name: 'Add a move', exact: true }).click()
  await page.getByRole('radio', { name: 'Idle', exact: true }).click()
  await page.getByRole('button', { name: /^Add Idle/ }).click()
  await expect(page.getByRole('dialog').getByRole('button', { name: 'Done', exact: true })).toBeVisible({ timeout: 45_000 })
  await page.getByRole('button', { name: 'Done', exact: true }).click()
  const after = await read(), idle = after.manifest.rig.animations.find((a) => a.id === 'idle')!
  expect(after.manifest.items[0].layers[0].cells!.default).toEqual(before.manifest.items[0].layers[0].cells!.default)
  expect(Object.keys(before.manifest.items[0].layers[0].cells!.default)).toEqual(['south', 'east', 'north', 'west'])
  expect(after.manifest.rig.baseHash).not.toBe('sha256:')
  expect(idle.cells).toBe(4)
  expect(Object.keys(idle.sources!)).toEqual(['south', 'east', 'north', 'west'])
  expect(Object.values(idle.sources!).every((s) => s.route === 'skeleton-v3' && s.measured?.length === 4)).toBe(true)
  expect(posts.filter((p) => p.path.endsWith('/estimate-skeleton'))).toHaveLength(1)
  const registration = posts.find((p) => p.path.endsWith('/create-character-v3'))!.body
  expect(registration.view).toBe('side')
  expect(Object.keys(registration.direction_images as object).sort()).toEqual(['east', 'north', 'west'])
  expect(registration.description).toBe('red hair, blue coat and boots')
  expect(posts.filter((p) => p.path.endsWith('/animate-with-skeleton-v3'))).toHaveLength(4)
  expect(posts.filter((p) => p.path.endsWith('/animate-with-skeleton-v3')).every((p) => p.body.view === 'side')).toBe(true)
  await reloadStudio(page)
  await expect(page.locator('.project-btn')).toContainText('Rig parity fixture')
  expect(errors).toEqual([])
})

test('deleting a disposable character preserves another character’s pending review', async ({ page, context }, info) => {
  await context.route('https://api.pixellab.ai/**', (r) => r.abort())
  const devURL = info.config.projects.find((p) => p.name === 'browser-selftests')!.use.baseURL!
  await openStudio(page, devURL)
  await expect(page.locator('.world-actors').first()).toBeVisible()
  const result = await page.evaluate(async () => {
    const path = '/src/studio/state.svelte.ts', s = await import(path)
    await s.copyDemo()
    s.gens.push({ draft: { rigId: 'another-character', spec: { id: 'keep-review', name: 'Keep', slot: 'head', prompt: 'hat', key: 'green', anims: [], dirs: [] }, calls: [], keySwitched: false, log: [] }, input: { name: 'Keep', slot: 'head', prompt: 'hat' }, phase: 'review', status: 'Review' })
    s.store.results['keep-review'] = { cells: [], qa: null, g1: new Map(), preview: null }
    await s.removeProject()
    return { resultKept: !!s.store.results['keep-review'], draftKept: s.gens.some((g: { draft: { spec: { id: string } } }) => g.draft.spec.id === 'keep-review') }
  })
  expect(result).toEqual({ resultKept: true, draftKept: true })
  await expect(page.locator('.project-btn')).toContainText('Adventurer')
})

test('equipping an accepted item while opening its project survives reload', async ({ page, context }, info) => {
  await context.route('https://api.pixellab.ai/**', (r) => r.abort())
  await openStudio(page, info.config.projects.find((p) => p.name === 'browser-selftests')!.use.baseURL!)
  await expect(page.locator('.world-actors').first()).toBeVisible()
  const name = await page.evaluate(async () => {
    const path = '/src/studio/state.svelte.ts', s = await import(path)
    await s.copyDemo()
    const hat = s.store.project.manifest.items.find((i: { slot: string }) => i.slot === 'head')
    if (s.doc.items.head === hat.id) s.wear(hat.id)
    await s.flushSave()
    // Keep it calls this path after saving an accepted item's frames.
    await s.openProject(s.doc.id, { wear: hat.id })
    return hat.name as string
  })
  await expect(page.getByRole('button', { name, exact: true })).toHaveAttribute('aria-pressed', 'true')
  await reloadStudio(page)
  await expect(page.getByRole('button', { name, exact: true })).toHaveAttribute('aria-pressed', 'true')
})


test('a delayed earlier character load cannot replace the last selected character', async ({ page, context }, info) => {
  await context.route('https://api.pixellab.ai/**', (r) => r.abort())
  await openStudio(page, info.config.projects.find((p) => p.name === 'browser-selftests')!.use.baseURL!)
  await expect(page.locator('.world-actors').first()).toBeVisible()
  const id = await page.evaluate(async () => {
    const path = '/src/studio/state.svelte.ts', s = await import(path)
    return await s.copyDemo() as string
  })
  let release!: () => void
  const held = new Promise<void>((resolve) => { release = resolve })
  await page.route('**/fixtures/s2/fixture.json', async (route) => { await held; await route.continue() })
  const requested = page.waitForRequest('**/fixtures/s2/fixture.json', { timeout: 10_000 })
  await page.evaluate(async () => {
    const path = '/src/studio/state.svelte.ts', s = await import(path)
    ;(window as unknown as { auditOpen: Promise<void> }).auditOpen = s.openProject('fixture:s2')
  })
  await requested
  try {
    await page.evaluate(async (id) => {
      const path = '/src/studio/state.svelte.ts', s = await import(path)
      await s.openProject(id)
    }, id)
  } finally { release() }
  await page.evaluate(async () => await (window as unknown as { auditOpen: Promise<void> }).auditOpen)
  await expect(page.locator('.project-btn')).toContainText('Adventurer copy')
  expect(await page.evaluate(() => localStorage.getItem('pixeldoll.studio.project'))).toBe(id)
})

test('rename storage failures leave the name visible and retryable', async ({ page, context }, info) => {
  await context.route('https://api.pixellab.ai/**', (r) => r.abort())
  await openStudio(page, info.config.projects.find((p) => p.name === 'browser-selftests')!.use.baseURL!)
  await expect(page.locator('.world-actors').first()).toBeVisible()
  await page.evaluate(async () => {
    const path = '/src/studio/state.svelte.ts', s = await import(path)
    await s.copyDemo()
    const dbPath = '/src/lib/store/db.ts', db = await import(dbPath)
    await db.del('projects', s.doc.id)
  })
  await page.locator('.project-btn').click()
  await page.getByRole('menuitem', { name: 'Rename character…', exact: true }).click()
  const dialog = page.getByRole('dialog', { name: 'Rename character', exact: true })
  await dialog.getByRole('textbox', { name: 'Name', exact: true }).fill('Keep this name')
  await dialog.getByRole('button', { name: 'Save', exact: true }).click()
  await expect(dialog.getByRole('alert')).toContainText('Could not rename')
  await expect(dialog.getByRole('textbox', { name: 'Name', exact: true })).toHaveValue('Keep this name')
  await expect(dialog.getByRole('button', { name: 'Save', exact: true })).toBeEnabled()
  await dialog.getByRole('button', { name: 'Cancel', exact: true }).click()
})


test('item deletion finishing during navigation cannot reopen the old character', async ({ page, context }, info) => {
  await context.route('https://api.pixellab.ai/**', (r) => r.abort())
  await openStudio(page, info.config.projects.find((p) => p.name === 'browser-selftests')!.use.baseURL!)
  await expect(page.locator('.world-actors').first()).toBeVisible()
  await page.evaluate(async () => {
    const path = '/src/studio/state.svelte.ts', s = await import(path)
    await s.copyDemo()
  })
  let release!: () => void
  const held = new Promise<void>((resolve) => { release = resolve })
  await page.route('**/fixtures/s2/fixture.json', async (route) => { await held; await route.continue() })
  const requested = page.waitForRequest('**/fixtures/s2/fixture.json', { timeout: 10_000 })
  await page.evaluate(async () => {
    const path = '/src/studio/state.svelte.ts', s = await import(path)
    const testWindow = window as unknown as { deleting: Promise<void>; navigating: Promise<void> }
    const item = s.store.project.manifest.items.find((i: { slot: string }) => i.slot !== 'body')
    testWindow.deleting = s.removeItem(item.id)
    testWindow.navigating = s.openProject('fixture:s2')
  })
  await requested
  try { await page.evaluate(async () => await (window as unknown as { deleting: Promise<void> }).deleting) }
  finally { release() }
  await page.evaluate(async () => await (window as unknown as { navigating: Promise<void> }).navigating)
  await expect(page.locator('.project-btn')).toContainText('Adventurer')
  expect(await page.evaluate(() => localStorage.getItem('pixeldoll.studio.project'))).toBe('fixture:s2')
})


test('storage failures before paid work surface errors and release the move runner', async ({ page, context }, info) => {
  const requests: string[] = []
  await context.route('https://api.pixellab.ai/**', (r) => { requests.push(r.request().method()); return r.abort() })
  await openStudio(page, info.config.projects.find((p) => p.name === 'browser-selftests')!.use.baseURL!)
  await expect(page.locator('.world-actors').first()).toBeVisible()
  const result = await page.evaluate(async () => {
    const path = '/src/studio/state.svelte.ts', s = await import(path)
    const put = IDBObjectStore.prototype.put
    IDBObjectStore.prototype.put = function (value, key) {
      if (key === 'studio-create' || key === 'studio-move') throw new DOMException('Test storage quota exceeded', 'QuotaExceededError')
      return put.call(this, value, key)
    }
    try {
      const firstCreate = s.startCreate({ description: 'test body', name: 'Storage fixture', seed: 1, size: 48, dirs: 4 })
      await s.startCreate({ description: 'duplicate body', name: 'Duplicate request', seed: 2, size: 48, dirs: 4 })
      await firstCreate
      await s.startMove(s.doc.id, { id: 'first', action: 'cast', frames: 8, items: [], seed: 1 })
      const firstError = s.moving.error
      await s.startMove(s.doc.id, { id: 'second', action: 'cast', frames: 8, items: [], seed: 2 })
      return { createError: s.creating.error, createName: s.creating.spec.name, firstError, secondError: s.moving.error, secondId: s.moving.spec.id }
    } finally { IDBObjectStore.prototype.put = put }
  })
  expect(result.createError).toContain('Test storage quota exceeded')
  expect(result.createName).toBe('Storage fixture')
  expect(result.firstError).toContain('Test storage quota exceeded')
  expect(result.secondError).toContain('Test storage quota exceeded')
  expect(result.secondId).toBe('second')
  expect(requests).toEqual([])
})


test('accepted appearance warnings remain visible with clean or removed frame QA and dollar source costs', async ({ page, context }, info) => {
  await context.route('https://api.pixellab.ai/**', (r) => r.abort())
  await openStudio(page, info.config.projects.find((p) => p.name === 'browser-selftests')!.use.baseURL!)
  await expect(page.locator('.world-actors').first()).toBeVisible()
  const id = await page.evaluate(async () => {
    const path = '/src/studio/state.svelte.ts', s = await import(path)
    await s.copyDemo()
    const it = s.store.project.manifest.items.find((x: { slot: string }) => x.slot !== 'body')
    it.designWarnings = ['D1 keyframe rest/south/0: gray smudges', 'G2 keyframe rest/south/0: changed pixels']
    it.qa = { minKeyKept: 1, maxKeyOutside: 0, minAreaRatio: 1, maxAreaCV: 0, maxPaletteDist: 0, clipPx: 0, status: 'pass', rerolls: 0, cells: {}, clips: {} }
    it.provenance = [{ endpoint: '/test', params: {}, seed: 1, requestHash: 'sha256:test', createdAt: new Date().toISOString(), produced: [], usage: { generations: 10, usd: 0.08 } }]
    s.store.project = { ...s.store.project, manifest: { ...s.store.project.manifest, items: s.store.project.manifest.items.map((x: { id: string }) => x.id === it.id ? { ...it } : x) } }
    s.ui.selected = it.id
    s.doc.rev++
    return it.id
  })
  const pane = await selectedItemDetails(page)
  await expect(pane.locator('.badge.look')).toContainText('Needs a look')
  await expect(pane.getByText('Accepted appearance warnings', { exact: true })).toBeVisible()
  await expect(pane.getByText('The design has gray smudges', { exact: true })).toBeVisible()
  await expect(pane.getByText('Some body pixels were changed by the model', { exact: true })).toBeVisible()
  await pane.getByText('Details', { exact: true }).click()
  await expect(pane.getByText('10 gens · $0.080 · 1 PixelLab call', { exact: true })).toBeVisible()
  await page.evaluate(async (id) => {
    const path = '/src/studio/state.svelte.ts', s = await import(path)
    const it = { ...s.store.project.manifest.items.find((x: { id: string }) => x.id === id) }
    delete it.qa
    s.store.project = { ...s.store.project, manifest: { ...s.store.project.manifest, items: s.store.project.manifest.items.map((x: { id: string }) => x.id === id ? it : x) } }
    s.doc.rev++
  }, id)
  await expect(pane.locator('.badge.look')).toContainText('Needs a look')
  await expect(pane.getByText('The design has gray smudges', { exact: true })).toBeVisible()
})
