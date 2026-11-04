import { expect, test, type Page } from '@playwright/test'
import { writeFile } from 'node:fs/promises'
import { openStudio, reloadStudio } from './immersive-helpers.ts'
import { makeImg } from '../../src/lib/image/png.ts'
import { encodePngBytes } from '../../src/lib/image/pngraw.ts'
import { zip } from '../../src/lib/store/zip.ts'
import { LABELS } from '../../src/lib/rig/poses.ts'

const FRAME_COUNT = 41
const keypoints = LABELS.map((label, i) => ({ label, x: (25 + i % 4) / 64, y: (12 + Math.floor(i / 4) * 8) / 64 }))

async function fixture(name: string) {
  const frames = await Promise.all(Array.from({ length: FRAME_COUNT }, async (_, index) => {
    const image = makeImg(64, 64)
    for (let y = 10; y < 60; y++) for (let x = 25; x < 38; x++) image.data.set([150, 100, 90, 255], (y * 64 + x) * 4)
    image.data[(30 * 64 + 30) * 4] = 160 + index
    return encodePngBytes(image)
  }))
  return zip([
    { name: 'metadata.json', data: new TextEncoder().encode(JSON.stringify({ name, prompt: 'A humanoid wearing a blue coat', view: 'side' })) },
    ...['south', 'east', 'north', 'west'].map(direction => ({ name: `rotations/${direction}.png`, data: frames[0] })),
    ...frames.slice(1).map((data, index) => ({ name: `animations/walk/south/frame_${index}.png`, data })),
  ])
}

async function projectSnapshot(page: Page, name: string) {
  return page.evaluate(async name => {
    const projectPath = '/src/lib/store/project.ts', rigPath = '/src/lib/rig/rig.ts', setupPath = '/src/lib/rig/setup.ts'
    const { listProjects, loadProject } = await import(projectPath), { cellHash } = await import(rigPath), { rigReady } = await import(setupPath)
    const record = (await listProjects()).find((candidate: { manifest: { name: string } }) => candidate.manifest.name === name)
    if (!record) throw new Error('The setup fixture was not saved')
    const { rec, project } = await loadProject(record.id)
    const pixels = await Promise.all([...project.images].map(async ([hash, image]) => [hash, await cellHash(image)]))
    return { id: rec.id, baseHash: rec.manifest.rig.baseHash, layers: rec.manifest.items[0].layers, pixels: pixels.sort(), ready: rigReady(rec), character: rec.character ?? null }
  }, name)
}

for (const tier of [3, 1] as const) test(`rig setup fills Tier ${tier} capacity, waits for every measurement, and preserves frozen artwork`, async ({ page, context }, info) => {
  const limit = tier === 3 ? 20 : 8, name = `Concurrent setup Tier ${tier}`, managedId = `managed-setup-tier-${tier}`
  const bytes = await fixture(name)
  await writeFile(info.outputPath('setup-41-frames.zip'), bytes) // Reusable synthetic fixture for offline Codex browser review.
  const errors: string[] = [], unexpected: string[] = [], imagesSent = new Set<string>()
  page.on('pageerror', error => errors.push(error.message))
  let estimates = 0, active = 0, maximum = 0, registrations = 0, cleaning = false
  const pending = new Map<number, { release: () => void; done: Promise<void> }>()
  let releaseRegistration!: () => void
  const registrationGate = new Promise<void>(resolve => { releaseRegistration = resolve })
  await context.route('https://*.pixellab.ai/**', async route => {
    const request = route.request(), path = new URL(request.url()).pathname
    if (request.method() === 'GET' && path.endsWith('/balance')) return route.fulfill({ json: {
      credits: { type: 'usd', usd: 0 }, subscription: { type: 'generations', status: 'active', plan: `Tier ${tier}`, generations: 1000, total: 1000 },
    } })
    if (request.method() === 'POST' && path.endsWith('/estimate-skeleton')) {
      const index = estimates++, body = request.postDataJSON() as { image: { base64: string } }
      imagesSent.add(body.image.base64); active++; maximum = Math.max(maximum, active)
      let release!: () => void, finish!: () => void
      const gate = new Promise<void>(resolve => { release = resolve }), done = new Promise<void>(resolve => { finish = resolve })
      pending.set(index, { release, done })
      if (!cleaning) await gate
      active-- // The mock service releases its slot when the held computation finishes.
      try { await route.fulfill({ json: { keypoints, usage: { type: 'generations', generations: 0.1 } } }) }
      finally { pending.delete(index); finish() }
      return
    }
    if (request.method() === 'POST' && path.endsWith('/create-character-v3')) {
      registrations++
      const body = request.postDataJSON() as { n_directions: number; direction_images: object; view: string }
      expect(body.n_directions).toBe(4); expect(Object.keys(body.direction_images).sort()).toEqual(['east', 'north', 'west']); expect(body.view).toBe('side')
      await registrationGate
      return route.fulfill({ json: { character_id: managedId, usage: { type: 'generations', generations: 0.25 } } })
    }
    unexpected.push(`${request.method()} ${path}`)
    return route.abort()
  })
  const release = async (indices: number[]) => {
    const held = indices.map(index => pending.get(index)).filter((entry): entry is { release: () => void; done: Promise<void> } => !!entry)
    for (const entry of held) entry.release()
    await Promise.all(held.map(entry => entry.done))
  }
  try {
    await openStudio(page, info.config.projects.find(project => project.name === 'browser-selftests')!.use.baseURL!)
    await page.locator('.project-btn').click()
    await page.getByRole('menuitem', { name: 'Import character…', exact: true }).click()
    await page.getByLabel('Character ZIP', { exact: true }).setInputFiles({ name: 'concurrent-setup.zip', mimeType: 'application/zip', buffer: Buffer.from(bytes) })
    await page.getByRole('button', { name: 'Import character', exact: true }).click()
    const setup = page.getByRole('dialog', { name: 'Set up character', exact: true })
    await expect(setup).toContainText('41 unique body frames · 4.35 gens estimated')
    const before = await projectSnapshot(page, name)
    expect(before.ready).toBe(false)
    if (tier === 3) await page.evaluate(({ name, managedId }) => {
      // Interrupt only the final publication transaction, after all paid receipts have been saved.
      const put = IDBObjectStore.prototype.put
      let once = true
      IDBObjectStore.prototype.put = function (value, key) {
        const record = value as { manifest?: { name: string }; character?: { id: string } }
        if (once && this.name === 'projects' && record.manifest?.name === name && record.character?.id === managedId) {
          once = false; throw new DOMException('Setup publication fixture failure', 'QuotaExceededError')
        }
        return put.call(this, value, key)
      }
    }, { name, managedId })
    await setup.getByRole('button', { name: /^Set up.*4.35 gens$/ }).click()
    const connect = page.getByRole('dialog', { name: 'Connect PixelLab', exact: true })
    await connect.getByLabel('API key', { exact: true }).fill('synthetic-setup-concurrency-key')
    await connect.getByRole('checkbox', { name: 'Remember on this device', exact: true }).check()
    await connect.getByRole('button', { name: 'Connect', exact: true }).click()
    await expect.poll(() => pending.size).toBe(limit)
    expect(estimates).toBe(limit); expect(registrations).toBe(0)
    await setup.locator('.sheet-head').getByRole('button', { name: 'Hide', exact: true }).click()
    await page.getByRole('button', { name: 'Activity', exact: true }).click()
    const activity = page.getByRole('dialog', { name: 'Activity', exact: true }), stops = activity.getByRole('button', { name: 'Stop', exact: true })
    await expect(stops).toHaveCount(limit)
    await expect(activity.locator('#activity-submitting-stop')).toHaveText('Stop is unavailable until PixelLab responds.')
    await expect(activity.locator('#activity-submitting-stop')).toBeVisible()
    expect(await stops.evaluateAll(buttons => buttons.every(button => (button as HTMLButtonElement).disabled && button.getAttribute('aria-describedby') === 'activity-submitting-stop'))).toBe(true)
    await expect(stops.first()).toHaveAccessibleDescription('Stop is unavailable until PixelLab responds.')
    if (tier === 1) {
      const cancels = activity.getByRole('button', { name: 'Cancel', exact: true })
      await expect.poll(() => cancels.count()).toBeGreaterThan(0)
      expect(await cancels.evaluateAll(buttons => buttons.every(button => !(button as HTMLButtonElement).disabled))).toBe(true)
    }
    await activity.getByRole('button', { name: 'Done', exact: true }).click()
    await page.locator('.project-btn').click()
    await page.getByRole('menuitem', { name: 'Set up character…', exact: true }).click()
    await expect(setup.locator('.steps-list li.now')).toContainText('0/41')
    await page.evaluate(() => {
      const values: number[] = [], read = () => {
        const step = document.querySelector('.steps-list li.now')
        if (!step?.textContent?.includes('Finding joints on every frame')) return
        const count = /([0-9]+)\/41/.exec(step.textContent)
        if (count && values.at(-1) !== Number(count[1])) values.push(Number(count[1]))
      }
      read()
      const observer = new MutationObserver(read)
      observer.observe(document.body, { subtree: true, childList: true, characterData: true })
      ;(window as unknown as { setupProgress: { values: number[]; stop: () => void } }).setupProgress = { values, stop: () => observer.disconnect() }
    })
    // Keep the very first check pending while later checks finish and refill the available slots.
    while (estimates < FRAME_COUNT) {
      const completing = [...pending.keys()].filter(index => index !== 0).reverse(), expected = Math.min(FRAME_COUNT, estimates + completing.length)
      expect(completing.length).toBeGreaterThan(0)
      await release(completing)
      await expect.poll(() => estimates).toBe(expected)
      expect(registrations).toBe(0)
    }
    await release([...pending.keys()].filter(index => index !== 0).reverse())
    await expect(setup.locator('.steps-list li.now')).toContainText('40/41')
    expect(active).toBe(1); expect(registrations).toBe(0)
    expect((await projectSnapshot(page, name)).ready).toBe(false)
    await expect(setup).not.toContainText('Ready. You can add equipment')
    await release([0])
    await expect.poll(() => registrations).toBe(1)
    await expect(setup.locator('.steps-list li.now')).toContainText('Connecting the standing views')
    expect((await projectSnapshot(page, name)).ready).toBe(false)
    releaseRegistration()
    if (tier === 3) {
      await expect(setup.getByRole('alert')).toContainText('Setup publication fixture failure')
      expect((await projectSnapshot(page, name)).ready).toBe(false)
    } else await expect(setup).toContainText('Ready. You can add equipment')
    const progress = await page.evaluate(() => {
      const history = (window as unknown as { setupProgress: { values: number[]; stop: () => void } }).setupProgress
      history.stop(); return history.values
    })
    expect(progress[0]).toBe(0); expect(progress).toContain(40)
    expect(progress.every((count, index) => count >= 0 && count <= FRAME_COUNT && (!index || count >= progress[index - 1]))).toBe(true)
    expect(maximum).toBe(limit); expect(estimates).toBe(FRAME_COUNT); expect(imagesSent.size).toBe(FRAME_COUNT)
    if (tier === 3) {
      await reloadStudio(page)
      await page.locator('.project-btn').click()
      await page.getByRole('menuitem', { name: 'Set up character…', exact: true }).click()
      await expect(setup.getByRole('alert')).toContainText('Setup publication fixture failure')
      expect(estimates).toBe(FRAME_COUNT); expect(registrations).toBe(1)
      await setup.getByRole('button', { name: 'Resume setup', exact: true }).click()
      await expect(setup).toContainText('Ready. You can add equipment')
    }
    const after = await projectSnapshot(page, name)
    expect(after.ready).toBe(true); expect(after.character?.id).toBe(managedId)
    expect(after.baseHash).toBe(before.baseHash); expect(after.layers).toEqual(before.layers); expect(after.pixels).toEqual(before.pixels)
    expect(estimates).toBe(FRAME_COUNT); expect(registrations).toBe(1); expect(unexpected).toEqual([]); expect(errors).toEqual([])
  } finally {
    // A failed assertion must not leave a mock response or a later worker waiting during teardown.
    cleaning = true; releaseRegistration(); await release([...pending.keys()])
  }
})
