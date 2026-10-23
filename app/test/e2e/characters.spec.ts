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
})

test('import can be cancelled before choosing a file and reopened', async ({ page }, info) => {
  await page.goto(info.config.projects.find((p) => p.name === 'browser-selftests')!.use.baseURL!)
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

test('cancelling a downloading import closes it and cannot reopen a late preview', async ({ page, context }, info) => {
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
  await page.goto(info.config.projects.find((p) => p.name === 'browser-selftests')!.use.baseURL!)
  await expect(page.locator('.project-btn')).toContainText('Adventurer (demo)')
  await page.locator('.project-btn').click()
  await page.getByRole('menuitem', { name: 'Import character…', exact: true }).click()
  await page.getByRole('tab', { name: 'From PixelLab', exact: true }).click()
  await page.getByLabel('Character ID or PixelLab link', { exact: true }).fill(ID)
  await page.getByRole('button', { name: 'Preview character', exact: true }).click()
  try {
    await expect(page.getByRole('status')).toContainText('Preparing your character')
    await page.getByRole('button', { name: 'Cancel', exact: true }).click()
    await expect(page.getByRole('dialog')).toHaveCount(0)
  } finally { finish() }
  await page.locator('.project-btn').click()
  await page.getByRole('menuitem', { name: 'Import character…', exact: true }).click()
  await expect(page.getByRole('dialog')).not.toContainText('PixelLab could not find')
  await expect(page.getByRole('button', { name: 'Import character', exact: true })).toBeDisabled()
  await page.getByRole('button', { name: 'Cancel', exact: true }).click()
  await expect(page.locator('.project-btn')).toContainText('Adventurer (demo)')
  expect(calls).toEqual(['GET'])
})

test('device import roundtrip, duplicate copies, persistence and local deletion', async ({ page, context }) => {
  const requests: string[] = [], errors: string[] = []
  page.on('pageerror', (e) => errors.push(e.message))
  await context.route('https://api.pixellab.ai/**', async (route) => { requests.push(route.request().method()); await route.abort() })
  await page.goto('/')
  await expect(page.locator('.stage canvas').first()).toBeVisible()
  await page.getByRole('button', { name: 'Export', exact: true }).click()
  const download = page.waitForEvent('download')
  await page.getByRole('button', { name: /Download zip/ }).click()
  const bytes = await readFile((await (await download).path())!)
  async function importCopy(name: string) {
    await page.locator('.project-btn').click()
    await page.getByRole('menuitem', { name: 'Import character…', exact: true }).click()
    await page.getByLabel('Character ZIP', { exact: true }).setInputFiles({ name: 'saved-character.zip', mimeType: 'application/zip', buffer: bytes })
    await expect(page.getByRole('img', { name: 'Character import preview' })).toBeVisible()
    await page.getByLabel('Character name', { exact: true }).fill(name)
    await page.getByRole('checkbox', { name: 'Set up the pose rig next (recommended)' }).uncheck()
    await page.getByRole('button', { name: 'Import character', exact: true }).click()
    await expect(page.locator('.project-btn')).toContainText(name)
  }
  await importCopy('Imported one')
  await page.reload()
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
    await expect(page.locator('.project-btn')).toContainText(remaining)
  }
  await page.reload()
  await expect(page.locator('.project-btn')).toContainText('Adventurer (demo)')
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
  await page.goto('/')
  await page.locator('.project-btn').click()
  await page.getByRole('menuitem', { name: 'Import character…', exact: true }).click()
  await page.getByRole('tab', { name: 'From PixelLab', exact: true }).click()
  await page.getByRole('button', { name: 'Connect PixelLab to browse your characters' }).click()
  await page.getByLabel('API key', { exact: true }).fill('test-only-not-a-real-key')
  await page.getByRole('dialog').getByRole('button', { name: 'Connect', exact: true }).click()
  await expect(page.getByRole('button', { name: /Library hero 1 directions/ })).toBeVisible()
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
  await page.goto('/')
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
  expect((before.rigQa as { clips: Record<string, { adherence: number | null }> }).clips['rest/south'].adherence).toBeNull()
  await page.getByRole('button', { name: 'New hands item', exact: true }).click()
  await page.getByRole('radio', { name: 'Hands', exact: true }).click()
  await page.getByRole('dialog').getByText('Details', { exact: true }).click()
  await expect(page.getByRole('dialog')).toContainText('96 px canvas')
  await page.getByRole('button', { name: 'Cancel', exact: true }).click()
  await page.getByRole('tab', { name: 'Moves', exact: true }).click()
  await page.getByRole('button', { name: 'Add a move', exact: true }).click()
  await page.getByRole('radio', { name: 'Idle', exact: true }).click()
  await page.getByRole('button', { name: /^Add Idle/ }).click()
  await expect(page.getByRole('dialog').getByRole('button', { name: 'Done', exact: true })).toBeVisible({ timeout: 45_000 })
  await page.getByRole('button', { name: 'Done', exact: true }).click()
  const after = await read(), idle = after.manifest.rig.animations.find((a) => a.id === 'idle')!
  expect(after.manifest.items[0].layers[0].cells!.rest).toEqual(before.manifest.items[0].layers[0].cells!.rest)
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
  await page.reload()
  await expect(page.locator('.project-btn')).toContainText('Rig parity fixture')
  expect(errors).toEqual([])
})

test('deleting a disposable character preserves another character’s pending review', async ({ page, context }, info) => {
  await context.route('https://api.pixellab.ai/**', (r) => r.abort())
  const devURL = info.config.projects.find((p) => p.name === 'browser-selftests')!.use.baseURL!
  await page.goto(devURL)
  await expect(page.locator('.stage canvas').first()).toBeVisible()
  const result = await page.evaluate(async () => {
    const path = '/src/studio/state.svelte.ts', s = await import(path)
    await s.copyDemo()
    s.gens.push({ draft: { rigId: 'another-character', spec: { id: 'keep-review', name: 'Keep', slot: 'head', prompt: 'hat', key: 'green', anims: [], dirs: [] }, calls: [], keySwitched: false, log: [] }, input: { name: 'Keep', slot: 'head', prompt: 'hat' }, phase: 'review', status: 'Review' })
    s.store.results['keep-review'] = { cells: [], qa: null, g1: new Map(), preview: null }
    await s.removeProject()
    return { resultKept: !!s.store.results['keep-review'], draftKept: s.gens.some((g: { draft: { spec: { id: string } } }) => g.draft.spec.id === 'keep-review') }
  })
  expect(result).toEqual({ resultKept: true, draftKept: true })
  await expect(page.locator('.project-btn')).toContainText('Adventurer (demo)')
})

test('equipping an accepted item while opening its project survives reload', async ({ page, context }, info) => {
  await context.route('https://api.pixellab.ai/**', (r) => r.abort())
  await page.goto(info.config.projects.find((p) => p.name === 'browser-selftests')!.use.baseURL!)
  await expect(page.locator('.stage canvas').first()).toBeVisible()
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
  await expect(page.getByRole('button', { name: `Wear ${name}`, exact: true })).toHaveAttribute('aria-pressed', 'true')
  await page.reload()
  await expect(page.getByRole('button', { name: `Wear ${name}`, exact: true })).toHaveAttribute('aria-pressed', 'true')
})
