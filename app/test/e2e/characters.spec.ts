import { test, expect } from '@playwright/test'
import { readFile } from 'node:fs/promises'
import { makeImg } from '../../src/lib/image/png.ts'
import { encodePngBytes } from '../../src/lib/image/pngraw.ts'
import { zip } from '../../src/lib/store/zip.ts'

const ID = 'f6a0bdc5-354e-4682-8df3-55fc3d118737'
test.beforeEach(async ({ context }) => {
  await context.addInitScript(() => { localStorage.setItem('pixeldoll.agentKey', 'off'); localStorage.setItem('pixeldoll.welcomed', '1') })
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
    if (url.pathname === '/v2/characters') return route.fulfill({ json: { total: 21, characters: [{ id: ID, name: url.searchParams.get('offset') === '20' ? 'Page two hero' : 'Library hero', directions: 1, animation_count: 0 }] } })
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
  await page.getByRole('button', { name: 'Next', exact: true }).click()
  await expect(page.getByRole('button', { name: /Page two hero/ })).toBeVisible()
  await page.getByRole('button', { name: /Page two hero/ }).click()
  await expect(page.getByRole('img', { name: 'Character import preview' })).toBeVisible()
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
