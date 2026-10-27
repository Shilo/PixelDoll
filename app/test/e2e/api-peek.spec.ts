import { openStudio } from './immersive-helpers.ts'
import { expect, test, type Page } from '@playwright/test'

const peek = (page: Page) => page.locator('[popover][aria-label="API calls"]:popover-open')

test.beforeEach(async ({ context }) => {
  await context.addInitScript(() => {
    localStorage.setItem('pixeldoll.agentKey', 'off')
    localStorage.setItem('pixeldoll.welcomed', '1')
    // Exercise Copy without replacing the person's system clipboard.
    Object.defineProperty(navigator, 'clipboard', {
      configurable: true,
      value: { writeText: async (value: string) => { sessionStorage.setItem('api-peek-copy', value) } },
    })
  })
})

async function newCharacter(page: Page) {
  await page.locator('.project-btn').click()
  await page.getByRole('menuitem', { name: 'New character…', exact: true }).click()
  await expect(page.locator('dialog[open]')).toHaveAccessibleName('New character')
}

async function expectPeekBeforePrimary(page: Page) {
  const sheet = page.locator('dialog[open]')
  const inspect = sheet.locator('.sheet-foot .api-peek-trigger')
  await expect(inspect).toHaveAttribute('title', 'PixelLab API calls')
  const icon = await inspect.boundingBox(), primary = await sheet.locator('.sheet-foot .btn.primary').boundingBox()
  expect(icon).not.toBeNull()
  expect(primary).not.toBeNull()
  expect(icon!.x + icon!.width).toBeLessThanOrEqual(primary!.x)
}

test('request preview follows the current character draft and copying never submits it', async ({ page, context }) => {
  const requests: string[] = []
  await context.route('https://api.pixellab.ai/**', async (route) => {
    requests.push(`${route.request().method()} ${new URL(route.request().url()).pathname}`)
    await route.abort()
  })
  await openStudio(page, '/')
  await expect(page.locator('.world-actors').first()).toBeVisible()
  await newCharacter(page)
  await expectPeekBeforePrimary(page)
  const sheet = page.locator('dialog[open]')
  const prompt = sheet.getByRole('textbox', { name: 'Details', exact: true })
  await prompt.fill('a cheerful dwarf with freckles')
  await sheet.locator('.sheet-foot').getByRole('button', { name: 'Inspect API calls', exact: true }).click()
  await expect(peek(page)).toBeVisible()
  const character = peek(page).locator('details').filter({ has: page.locator('summary', { hasText: '/create-character-v3' }) }).first()
  await expect(character.locator(':scope > summary')).toContainText('POST')
  await character.locator(':scope > summary').click()
  await expect(character).toContainText('a cheerful dwarf with freckles')
  // Field/value presentation stays readable without opening a raw JSON document.
  await expect(character.locator('dl:visible').first()).toBeVisible()
  await expect(character.locator('dt')).not.toHaveCount(0)
  await peek(page).getByRole('button', { name: 'Copy all calls', exact: true }).click()
  const copied = await page.evaluate(() => sessionStorage.getItem('api-peek-copy'))
  expect(copied).toContain('/create-character-v3')
  expect(copied).toContain('a cheerful dwarf with freckles')
  expect(copied).not.toMatch(/Bearer |Authorization|pixellabApiKey/)
  const exported = JSON.parse(copied!) as { total: { generations: number }; calls: unknown[] }
  expect(exported.total.generations).toBeGreaterThan(0)
  await expect(peek(page).locator('footer')).toContainText('Estimated total')
  await expect(peek(page).locator('footer')).toContainText(`${exported.calls.length} calls`)
  await peek(page).getByRole('button', { name: 'Close API calls', exact: true }).click()
  await expect(peek(page)).toHaveCount(0)
  await prompt.fill('a patient elf with silver hair')
  await sheet.locator('.sheet-foot').getByRole('button', { name: 'Inspect API calls', exact: true }).click()
  const updated = peek(page).locator('details').filter({ has: page.locator('summary', { hasText: '/create-character-v3' }) }).first()
  await updated.locator(':scope > summary').click()
  await expect(updated).toContainText('a patient elf with silver hair')
  await expect(updated).not.toContainText('a cheerful dwarf with freckles')
  expect(requests).toEqual([])
})

test('automatic account checks remain inspectable without flooding the default global list', async ({ page, context }, info) => {
  const requests: string[] = []
  await context.route('https://api.pixellab.ai/**', async (route) => {
    const path = new URL(route.request().url()).pathname
    requests.push(`${route.request().method()} ${path}`)
    expect(route.request().method()).toBe('GET')
    expect(path).toBe('/v2/balance')
    await route.fulfill({ json: { subscription: { generations: 100, total: 100 }, credits: { usd: 0 } } })
  })
  await openStudio(page, info.config.projects.find((project) => project.name === 'browser-selftests')!.use.baseURL!)
  await expect(page.locator('.world-actors').first()).toBeVisible()
  // A fully intercepted free read exercises the same transport as automatic balance refreshes.
  // A deliberately invalid fixture value never obtains or uses a real credential.
  await page.evaluate(async () => {
    const path = '/src/lib/pixellab/client.ts'
    const { api } = await import(path)
    await api('offline-fixture-not-a-key', 'GET', '/balance')
  })
  await page.getByRole('button', { name: 'More options', exact: true }).click()
  await page.getByRole('button', { name: 'Inspect all API calls', exact: true }).click()
  await expect(peek(page)).toBeVisible()
  await expect(peek(page).locator('details summary').filter({ hasText: '/balance' })).toHaveCount(0)
  await expect(peek(page).locator('footer')).toContainText('0 gens')
  await expect(peek(page).locator('footer')).toContainText('1 call')
  await peek(page).getByRole('button', { name: 'Copy all calls', exact: true }).click()
  const copied = await page.evaluate(() => sessionStorage.getItem('api-peek-copy'))
  expect(copied).toContain('/balance') // Hidden rows are still included in Copy all.
  expect(copied).not.toContain('offline-fixture-not-a-key')
  await peek(page).getByRole('button', { name: 'Show background calls', exact: true }).click()
  const balance = peek(page).locator('details').filter({ has: page.locator('summary', { hasText: '/balance' }) }).first()
  await expect(balance.locator('summary')).toContainText('GET')
  await balance.locator('summary').press('Space')
  await expect(balance).toHaveAttribute('open', '')
  await expect(balance).toContainText(/200|complete|success/i)
  await peek(page).getByRole('button', { name: 'Hide background calls', exact: true }).click()
  await expect(peek(page).locator('details summary').filter({ hasText: '/balance' })).toHaveCount(0)
  expect(requests).toEqual(['GET /v2/balance'])
})

test('recorded generation, automatic measurement and repair show full inputs and count usage once', async ({ page, context }, info) => {
  const image = { type: 'base64', format: 'png', base64: 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVQIHWP4z8DwHwAFgAI/ScLbtAAAAABJRU5ErkJggg==' }
  const first = [{ label: 'neck', x: 0.5, y: 0.25, z_index: 1 }, { label: 'left_hand', x: 0.125, y: 0.625, z_index: 2 }]
  const body = {
    description: 'A woodland ranger with short silver hair, a long green cloak, brown walking boots, a small brass belt buckle, and a calm expression. Keep the original pixel edges and carefully preserve the complete final sentence.',
    action: 'walk slowly', direction: 'south', first_frame: image, first_frame_keypoints: first,
    keypoints: [first, first.map((point) => ({ ...point, y: point.y + 0.0625 })), first],
    seed: 713,
  }
  const requests: { method: string; path: string; body: unknown }[] = []
  await context.route('https://api.pixellab.ai/**', async (route) => {
    const request = route.request(), path = new URL(request.url()).pathname
    requests.push({ method: request.method(), path, body: request.postDataJSON() })
    if (request.method() === 'POST' && path === '/v2/animate-with-skeleton-v3') {
      await route.fulfill({ json: { background_job_id: 'offline-motion', usage: { type: 'generations', generations: 1.5 } } })
    } else if (request.method() === 'GET' && path === '/v2/background-jobs/offline-motion') {
      await route.fulfill({ json: { status: 'completed', usage: { type: 'generations', generations: 1.5 } } })
    } else if (request.method() === 'POST' && path === '/v2/estimate-skeleton') {
      await route.fulfill({ json: { usage: { type: 'generations', generations: 0.1 } } })
    } else if (request.method() === 'POST' && path === '/v2/inpaint-v3') {
      await route.fulfill({ json: { usage: { type: 'usd', usd: 0.04 } } })
    } else if (request.method() === 'GET' && path === '/v2/balance') {
      await route.fulfill({ json: { subscription: { generations: 100, total: 100 }, credits: { usd: 0 } } })
    } else {
      await route.abort()
      throw new Error(`Unexpected intercepted request: ${request.method()} ${path}`)
    }
  })
  await openStudio(page, info.config.projects.find((project) => project.name === 'browser-selftests')!.use.baseURL!)
  await expect(page.locator('.world-actors').first()).toBeVisible()
  // All responses are fixtures intercepted above. No generation workflow or real account is started.
  await page.evaluate(async ({ body, image }) => {
    const path = '/src/lib/pixellab/client.ts', { api } = await import(path)
    const key = 'offline-fixture-not-a-key'
    const context = { activityScope: 'offline-motion-fixture' }
    await api(key, 'POST', '/animate-with-skeleton-v3', body, undefined, { ...context, label: 'Create fixture motion' })
    await api(key, 'GET', '/background-jobs/offline-motion', undefined, undefined, context)
    await api(key, 'GET', '/background-jobs/offline-motion', undefined, undefined, context)
    await api(key, 'POST', '/estimate-skeleton', { image }, undefined, { ...context, label: 'Automatic joint measurement' })
    await api(key, 'POST', '/inpaint-v3', { description: 'Repair a stray pixel', inpainting_image: { image, size: { width: 1, height: 1 } }, mask_image: { image, size: { width: 1, height: 1 } }, seed: 714 }, undefined, { ...context, label: 'Automatic quality repair' })
    await api(key, 'GET', '/balance', undefined, undefined, context)
  }, { body, image })
  await page.getByRole('button', { name: 'More options', exact: true }).click()
  await page.getByRole('button', { name: 'Inspect all API calls', exact: true }).click()
  const rows = peek(page).locator('.peek-call')
  await expect(rows).toHaveCount(3) // Automatic paid work remains in the foreground list.
  const skeleton = rows.filter({ has: page.locator(':scope > summary', { hasText: '/animate-with-skeleton-v3' }) })
  const measurement = rows.filter({ has: page.locator(':scope > summary', { hasText: '/estimate-skeleton' }) })
  const repair = rows.filter({ has: page.locator(':scope > summary', { hasText: '/inpaint-v3' }) })
  await expect(skeleton.locator(':scope > summary')).toContainText('1.5 gens')
  await expect(measurement.locator(':scope > summary')).toContainText('0.1 gens')
  await expect(repair.locator(':scope > summary')).toContainText('$0.040')
  await expect(peek(page).locator('footer')).toContainText(/1\.6 gens.*\$0\.040/s)
  await expect(peek(page).locator('footer')).toContainText('6 calls')
  await skeleton.locator(':scope > summary').click()
  await skeleton.locator('summary[title="description"]').click()
  await expect(skeleton.locator('summary[title="description"]').locator('..')).toHaveAttribute('open', '')
  await expect(skeleton.locator('summary[title="description"]').locator('..')).toContainText(body.description)
  await expect(skeleton.locator('dl[title="first_frame"]')).toContainText('PNG')
  await expect(skeleton.locator('dl[title="first_frame"]')).toContainText('Included in copy')
  await skeleton.locator('summary[title="keypoints"]').click()
  await skeleton.locator('summary[title="keypoints.0"]').click()
  await skeleton.locator('summary[title="keypoints.0.0"]').click()
  await expect(skeleton.locator('dl[title="keypoints.0.0.label"]')).toContainText('neck')
  await expect(skeleton.locator('dl[title="keypoints.0.0.x"]')).toContainText('0.5')
  await peek(page).getByRole('button', { name: 'Copy all calls', exact: true }).click()
  const copied = await page.evaluate(() => sessionStorage.getItem('api-peek-copy'))
  const exported = JSON.parse(copied!) as { calls: { method: string; endpoint: string; body: unknown }[]; totals: { generations: number; usd: number; pending: number; unknown: number } }
  expect(exported.calls).toHaveLength(6)
  expect(exported.calls.find((call) => call.endpoint === '/animate-with-skeleton-v3')?.body).toEqual(body)
  expect(exported.calls.filter((call) => call.endpoint === '/background-jobs/offline-motion')).toHaveLength(2)
  expect(exported.totals).toMatchObject({ generations: 1.6, usd: 0.04, pending: 0, unknown: 0 })
  expect(copied).not.toMatch(/offline-fixture-not-a-key|authorization|Bearer/i)
  await peek(page).getByRole('button', { name: 'Show background calls', exact: true }).click()
  await expect(rows).toHaveCount(6)
  await expect(peek(page).locator('footer')).toContainText(/1\.6 gens.*\$0\.040/s)
  expect(requests).toHaveLength(6)
  expect(requests[0].body).toEqual(body)
})

test('a pending reported charge does not hide a separate terminal unknown cost', async ({ page, context }, info) => {
  const requests: string[] = []
  await context.route('https://api.pixellab.ai/**', async (route) => { requests.push(route.request().method()); await route.abort() })
  await openStudio(page, info.config.projects.find((project) => project.name === 'browser-selftests')!.use.baseURL!)
  await expect(page.locator('.world-actors').first()).toBeVisible()
  // Model two independent response outcomes without making even an intercepted API request.
  await page.evaluate(async () => {
    const path = '/src/lib/pixellab/activity.ts'
    const { beginActivityCall, finishActivityCall } = await import(path)
    const unknown = beginActivityCall('POST', 'https://api.pixellab.ai/v2/inpaint-v3', { description: 'Unknown repair charge' })
    finishActivityCall(unknown, 200, true, {})
    const pending = beginActivityCall('POST', 'https://api.pixellab.ai/v2/animate-with-skeleton-v3', { description: 'Reported charge with unfinished job' })
    finishActivityCall(pending, 200, true, { background_job_id: 'unfinished-offline-fixture', usage: { type: 'generations', generations: 2 } })
  })
  await page.getByRole('button', { name: 'More options', exact: true }).click()
  await page.getByRole('button', { name: 'Inspect all API calls', exact: true }).click()
  const footer = peek(page).locator('footer')
  await expect(footer).toContainText('2 gens')
  await expect(footer).toContainText('1 unknown')
  await expect(footer).toContainText('1 pending')
  const unknown = peek(page).locator('.peek-call').filter({ has: page.locator(':scope > summary', { hasText: '/inpaint-v3' }) })
  await expect(unknown.locator(':scope > summary')).toContainText('Unknown')
  await peek(page).getByRole('button', { name: 'Copy all calls', exact: true }).click()
  const copied = await page.evaluate(() => sessionStorage.getItem('api-peek-copy'))
  const exported = JSON.parse(copied!) as {
    calls: { endpoint: string; cost: { generations: number | null; usd: number | null }; usagePending: boolean }[]
    totals: { generations: number; usd: number; unknown: number; pending: number }
  }
  expect(exported.totals).toEqual({ generations: 2, usd: 0, unknown: 1, pending: 1 })
  expect(exported.calls.find((call) => call.endpoint === '/inpaint-v3')).toMatchObject({ cost: { generations: null, usd: null }, usagePending: false })
  expect(exported.calls.find((call) => call.endpoint === '/animate-with-skeleton-v3')).toMatchObject({ cost: { generations: 2, usd: 0 }, usagePending: true })
  expect(requests).toEqual([])
})

test('an action peek includes its shared balance check without another operation’s requests', async ({ page, context }, info) => {
  const requests: string[] = []
  await context.route('https://api.pixellab.ai/**', async (route) => { requests.push(route.request().method()); await route.abort() })
  await openStudio(page, info.config.projects.find((project) => project.name === 'browser-selftests')!.use.baseURL!)
  await expect(page.locator('.world-actors').first()).toBeVisible()
  await page.evaluate(async () => {
    const path = '/src/lib/pixellab/activity.ts'
    const { beginActivityCall, finishActivityCall } = await import(path)
    const own = beginActivityCall('POST', 'https://api.pixellab.ai/v2/create-character-v3', { description: 'Own fixture request' }, { label: 'Own operation request', activityScope: 'scope-one', queueId: 'own-job' })
    finishActivityCall(own, 200, true, { usage: { type: 'generations', generations: 2 } })
    const unrelated = beginActivityCall('POST', 'https://api.pixellab.ai/v2/create-character-v3', { description: 'Other fixture request' }, { label: 'Unrelated operation request', activityScope: 'scope-two', queueId: 'other-job' })
    finishActivityCall(unrelated, 200, true, { usage: { type: 'generations', generations: 5 } })
    const shared = beginActivityCall('GET', 'https://api.pixellab.ai/v2/balance', undefined, { label: 'Shared automatic balance refresh', relatedScopes: ['scope-one', 'scope-two'], relatedQueueIds: ['own-job', 'other-job'] })
    finishActivityCall(shared, 200, true, {})
    const studio = (window as unknown as { __studio: { creating: { spec: unknown; error: string }; ui: { sheet: string } } }).__studio
    studio.creating.spec = { description: 'Fixture character', name: 'Scope fixture', seed: 1, size: 48, dirs: 4, activityScope: 'scope-one' }
    studio.creating.error = 'Fixture stopped'
    studio.ui.sheet = 'create'
  })
  const sheet = page.locator('dialog[open]')
  await expect(sheet).toHaveAccessibleName('New character')
  await sheet.locator('.sheet-body').getByRole('button', { name: 'Inspect API calls', exact: true }).first().click()
  const rows = peek(page).locator('.peek-call')
  await expect(rows).toHaveCount(1)
  await expect(rows).toContainText('Own operation request')
  await expect(peek(page)).not.toContainText('Unrelated operation request')
  await peek(page).getByRole('button', { name: 'Show background calls', exact: true }).click()
  await expect(rows).toHaveCount(2)
  await expect(rows.filter({ hasText: '/balance' })).toContainText('Shared automatic balance refresh')
  await expect(peek(page)).not.toContainText('Unrelated operation request')
  await expect(peek(page).locator('footer')).toContainText('2 gens')
  await peek(page).getByRole('button', { name: 'Copy all calls', exact: true }).click()
  const copied = await page.evaluate(() => sessionStorage.getItem('api-peek-copy'))
  const exported = JSON.parse(copied!) as { calls: { endpoint: string; body: unknown }[]; totals: { generations: number } }
  expect(exported.calls).toHaveLength(2)
  expect(exported.calls.map((call) => call.endpoint)).toEqual(['/create-character-v3', '/balance'])
  expect(exported.calls[0].body).toEqual({ description: 'Own fixture request' })
  expect(exported.totals.generations).toBe(2)
  expect(requests).toEqual([])
})

test('mirrored saved requests show their payload and updated charge without sending them again', async ({ page, context }, info) => {
  const requests: string[] = []
  await context.route('https://api.pixellab.ai/**', async (route) => { requests.push(route.request().method()); await route.abort() })
  await openStudio(page, info.config.projects.find(project => project.name === 'browser-selftests')!.use.baseURL!)
  await expect(page.locator('.world-actors').first()).toBeVisible()
  await page.evaluate(async () => {
    const dbPath = '/src/lib/store/db.ts', queuePath = '/src/lib/pixellab/queue.ts', statePath = '/src/studio/state.svelte.ts'
    const db = await import(dbPath), { queue } = await import(queuePath), { ui } = await import(statePath)
    await db.put('jobs', 'mirrored-request', { id: 'mirrored-request', label: 'Mirrored character', method: 'POST', endpoint: '/create-character-v3', params: { description: 'a saved dwarf request', seed: 17 }, inputs: [], requestHash: 'offline-fixture', state: 'done', attempts: 1, requestStarted: true, nextAt: 0, createdAt: 1000, submittedAt: 1001, finishedAt: 1002, gens: 2, usd: 0, jobs: [{ id: 'mirrored-job', status: 'completed', done: true, results: [], usage: { type: 'generations', generations: 2 } }] })
    queue.role = 'follower'
    await queue.sync()
    ui.sheet = 'activity'
  })
  const row = page.locator('.act-group li').filter({ hasText: 'Mirrored character' })
  await row.getByRole('button', { name: 'Inspect API calls', exact: true }).click()
  await expect(peek(page).locator('.peek-call')).toHaveCount(1)
  await expect(peek(page).locator('footer')).toContainText('2 gens')
  await peek(page).locator('.peek-call > summary').click()
  await expect(peek(page)).toContainText('Saved request')
  await expect(peek(page)).toContainText('a saved dwarf request')
  await page.evaluate(async () => {
    const dbPath = '/src/lib/store/db.ts', queuePath = '/src/lib/pixellab/queue.ts'
    const db = await import(dbPath), { queue } = await import(queuePath)
    const record = await db.get('jobs', 'mirrored-request')
    record.jobs[0].usage.generations = 3
    record.gens = 3
    await db.put('jobs', record.id, record)
    await queue.sync()
  })
  await expect(peek(page).locator('footer')).toContainText('3 gens')
  await expect(peek(page).locator('.peek-call')).toHaveCount(1)
  expect(requests).toEqual([])
})

test('refreshing a library character replaces its preview URL and records both downloads', async ({ page, context }, info) => {
  let version = 0
  const downloads: string[] = []
  const uuid = '5352683c-54aa-4617-b303-e942e472c66d'
  const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVQIHWP4z8DwHwAFgAI/ScLbtAAAAABJRU5ErkJggg==', 'base64')
  await context.route('https://api.pixellab.ai/**', async (route) => {
    const path = new URL(route.request().url()).pathname
    expect(route.request().method()).toBe('GET')
    if (path === '/v2/balance') await route.fulfill({ json: { subscription: { generations: 100, total: 100 }, credits: { usd: 0 } } })
    else if (path === '/v2/characters') await route.fulfill({ json: { total: 1, characters: [{ id: uuid, name: 'Refresh fixture', directions: 4, animation_count: 1, preview_url: `https://api.pixellab.ai/preview-${++version}.png` }] } })
    else if (/^\/preview-[12]\.png$/.test(path)) {
      expect(route.request().headers().authorization).toBeUndefined()
      downloads.push(path)
      await route.fulfill({ contentType: 'image/png', body: png })
    } else { await route.abort(); throw new Error(`Unexpected fixture request ${path}`) }
  })
  await openStudio(page, info.config.projects.find(project => project.name === 'browser-selftests')!.use.baseURL!)
  await expect(page.locator('.world-actors').first()).toBeVisible()
  await page.evaluate(async () => {
    const appPath = '/src/lib/app.svelte.ts', statePath = '/src/studio/state.svelte.ts'
    const { setKey } = await import(appPath), { ui } = await import(statePath)
    setKey('offline-fixture-not-a-key', false)
    ui.importSource = 'pixellab'; ui.sheet = 'import'
  })
  const image = page.locator('.library-character img')
  await expect(image).toHaveAttribute('src', 'https://api.pixellab.ai/preview-1.png')
  await page.getByRole('button', { name: 'Refresh', exact: true }).click()
  await expect(image).toHaveAttribute('src', 'https://api.pixellab.ai/preview-2.png')
  await expect.poll(() => downloads).toEqual(['/preview-1.png', '/preview-2.png'])
  const refreshPeek = page.getByRole('button', { name: 'Refresh', exact: true }).locator('..').getByRole('button', { name: 'Inspect API calls', exact: true })
  await refreshPeek.click()
  await peek(page).getByRole('button', { name: 'Show background calls', exact: true }).click()
  await expect(peek(page).locator('.peek-call > summary').filter({ hasText: 'preview-' })).toHaveCount(2)
})

test('attached phone peeks stay above their sheet and dismiss without losing the draft', async ({ page, context }) => {
  await page.setViewportSize({ width: 390, height: 844 })
  const requests: string[] = []
  await context.route('https://api.pixellab.ai/**', async (route) => { requests.push(route.request().method()); await route.abort() })
  await openStudio(page, '/')
  await expect(page.locator('.world-actors').first()).toBeVisible()
  await newCharacter(page)
  await expectPeekBeforePrimary(page)
  const sheet = page.locator('dialog[open]')
  const prompt = sheet.getByRole('textbox', { name: 'Details', exact: true })
  await prompt.fill('a tiny woodland ranger')
  const inspect = sheet.locator('.sheet-foot').getByRole('button', { name: 'Inspect API calls', exact: true })
  await inspect.click()
  await expect(peek(page)).toBeVisible()
  await expect(peek(page)).toHaveAttribute('data-positioned', '')
  await expect(peek(page).locator('.bu-popover-arrow')).toBeVisible()
  // A nonmodal native popover belongs to the sheet's top layer; no nested native dialog.
  await expect(page.locator('dialog[open]')).toHaveCount(1)
  expect(await peek(page).evaluate((element) => element.closest('dialog')?.open)).toBe(true)
  for (const viewport of [{ width: 390, height: 844 }, { width: 320, height: 700 }, { width: 844, height: 390 }]) {
    await page.setViewportSize(viewport)
    await expectPeekBeforePrimary(page)
    await expect(async () => { // the popover repositions on the next resize frame
      const bounds = await peek(page).boundingBox()
      const pointer = await peek(page).locator('.bu-popover-arrow').boundingBox()
      const trigger = await inspect.boundingBox()
      const side = await peek(page).getAttribute('data-side')
      expect(bounds).not.toBeNull()
      expect(pointer).not.toBeNull()
      expect(trigger).not.toBeNull()
      expect(bounds!.x).toBeGreaterThanOrEqual(0)
      expect(bounds!.y).toBeGreaterThanOrEqual(0)
      expect(bounds!.x + bounds!.width).toBeLessThanOrEqual(viewport.width)
      expect(bounds!.y + bounds!.height).toBeLessThanOrEqual(viewport.height)
      const gap = side === 'top' ? trigger!.y - pointer!.y - pointer!.height
        : side === 'bottom' ? pointer!.y - trigger!.y - trigger!.height
        : side === 'left' ? trigger!.x - pointer!.x - pointer!.width
        : pointer!.x - trigger!.x - trigger!.width
      expect(Math.abs(gap)).toBeLessThanOrEqual(2)
    }).toPass()
  }
  await page.keyboard.press('Escape')
  await expect(peek(page)).toHaveCount(0)
  await expect(sheet).toBeVisible()
  await expect(prompt).toHaveValue('a tiny woodland ranger')
  await inspect.click()
  await expect(peek(page)).toBeVisible()
  await peek(page).getByRole('button', { name: 'Close API calls', exact: true }).click()
  await expect(prompt).toHaveValue('a tiny woodland ranger')
  await expect(page.locator('dialog[open]')).toHaveCount(1)
  await sheet.getByRole('button', { name: 'Cancel', exact: true }).click()
  await expect(page.locator('dialog[open]')).toHaveCount(0)
  expect(requests).toEqual([])
})
