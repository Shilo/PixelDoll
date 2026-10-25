import { openStudio, openAccount } from './immersive-helpers.ts'
import { expect, test, type Locator, type Page } from '@playwright/test'
import { BASE_BODY } from '../../src/studio/model.ts'

// Real UI and fetch serialization, fake transport. Every create POST is captured then refused before any generation.
// Direction source plans are inspected separately: the initial V3 POST intentionally generates all eight originals.
test.use({ baseURL: `http://127.0.0.1:${process.env.DEV_PORT ?? '5298'}` })
test.setTimeout(180_000)
type Body = { description: string; image_size: { width: number; height: number }; view: string; seed: number; [key: string]: unknown }
type PlanCall = { method: string; path: string; body?: { direction?: string; directions?: string[]; n_directions?: number } }
const all = ['south', 'south-east', 'east', 'north-east', 'north', 'north-west', 'west', 'south-west']
const defaultSources = ['south', 'south-east', 'east', 'north-east', 'north']

async function setup(page: Page) {
  const posted: Body[] = [], unexpected: string[] = []
  await page.addInitScript(() => {
    localStorage.setItem('pixeldoll.agentKey', 'off'); localStorage.setItem('pixeldoll.welcomed', '1')
    Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { writeText: async (text: string) => sessionStorage.setItem('matrix-copy', text) } })
  })
  await page.route('https://*.pixellab.ai/**', async route => {
    const request = route.request(), path = new URL(request.url()).pathname
    if (request.method() === 'GET' && path === '/v2/balance') {
      await route.fulfill({ json: { credits: { type: 'usd', usd: 0 }, subscription: { type: 'generations', status: 'active', plan: 'Tier 3: fixture', generations: 10000, total: 10000 } } })
    } else if (request.method() === 'POST' && path === '/v2/create-character-v3') {
      posted.push(JSON.parse(request.postData()!) as Body)
      await route.fulfill({ status: 422, json: { detail: 'Offline matrix capture complete' } })
    } else {
      unexpected.push(`${request.method()} ${path}`)
      await route.abort()
    }
  })
  await openStudio(page, '/')
  await openAccount(page)
  const connection = page.getByRole('dialog', { name: 'Connect PixelLab', exact: true })
  await connection.getByLabel('API key', { exact: true }).fill('offline-matrix-not-a-real-key')
  await connection.getByRole('button', { name: 'Connect', exact: true }).click()
  await expect(connection).toHaveCount(0)
  await page.locator('.project-btn').click()
  await page.getByRole('menuitem', { name: 'New character…', exact: true }).click()
  const sheet = page.getByRole('dialog', { name: 'New character', exact: true })
  await sheet.getByRole('textbox', { name: 'Name', exact: true }).fill('Local library name only')
  await sheet.getByRole('textbox', { name: 'Seed', exact: true }).fill('343')
  async function submit(freshAttempt = true) {
    const before = posted.length
    // Each matrix case requests new work. Repeating the same paid request after a terminal refusal is deliberately deduplicated.
    if (freshAttempt) await sheet.getByRole('textbox', { name: 'Seed', exact: true }).fill(String(343 + before))
    await sheet.getByRole('button', { name: 'Create character', exact: true }).click()
    await expect.poll(() => posted.length).toBe(before + 1)
    await expect(sheet).toContainText('Offline matrix capture complete')
    const body = posted[before]
    expect(Object.keys(body).sort()).toEqual(['description', 'image_size', 'no_background', 'seed', 'template_id', 'view'])
    expect(body.template_id).toBe('mannequin'); expect(body.no_background).toBe(true)
    expect(body).not.toHaveProperty('name'); expect(body).not.toHaveProperty('projectId')
    expect(body).not.toHaveProperty('reference_image'); expect(body).not.toHaveProperty('direction_images')
    expect(body).not.toHaveProperty('n_directions') // V3's from-scratch default is eight, independent of kept views.
    expect(unexpected).toEqual([])
    await sheet.getByRole('button', { name: 'Start over', exact: true }).click()
    await expect(sheet.getByRole('tab', { name: 'Appearance', exact: true })).toBeVisible()
    return body
  }
  return { sheet, submit, posted }
}

async function plannedSources(page: Page, sheet: Locator, expected: string[]) {
  await sheet.locator('.sheet-foot').getByRole('button', { name: 'Inspect API calls', exact: true }).click()
  const peek = page.locator('[popover][aria-label="API calls"]:popover-open')
  await peek.getByRole('button', { name: 'Copy all calls', exact: true }).click()
  const plan = JSON.parse((await page.evaluate(() => sessionStorage.getItem('matrix-copy')))!) as { format: string; calls: PlanCall[] }
  expect(plan.format).toBe('pixeldoll-calls/1')
  expect(plan.calls.filter(call => call.path === '/animate-with-skeleton-v3').map(call => call.body?.direction)).toEqual([...expected, ...expected])
  expect(plan.calls.filter(call => call.path === '/characters/animations').map(call => call.body?.directions)).toEqual(expected.map(direction => [direction]))
  expect(plan.calls.filter(call => call.path === '/create-character-v3')[1].body?.n_directions).toBe(8)
  await peek.getByRole('button', { name: 'Close API calls', exact: true }).click()
}

// Every value of every control is mapped exhaustively in test/unit/character-option-matrix.test.ts; here each control's wiring
// reaches the HTTP JSON once, plus Not set and exact custom text.
test('each appearance control, Not set and exact custom text reach the initial HTTP JSON unchanged', async ({ page }) => {
  const { sheet, submit } = await setup(page)
  for (const [title, first, value] of [
    ['Kind', 'Human', 'Not set'], ['Kind', 'Human', 'Undead'], ['Build', 'Slender', 'Rounded'], ['Proportions', 'Natural', 'Chibi'], ['Skin', 'Deep brown', 'Pale'],
  ] as const) {
    await sheet.getByRole('tab', { name: 'Prompt', exact: true }).click()
    await sheet.getByRole('textbox', { name: 'Exact prompt', exact: true }).fill(`A calm face\n${BASE_BODY}`)
    await sheet.getByRole('tab', { name: 'Appearance', exact: true }).click()
    const control = sheet.getByRole('combobox', { name: title, exact: true })
    await control.selectOption(first); await control.selectOption(value)
    const body = await submit()
    expect(body.description).toBe(`A calm face\n${value === 'Not set' ? '' : `${title}: ${value}\n`}${BASE_BODY}`)
  }
  const exact = '  My exact custom prompt.\n\nKeep this spacing  \nKind: Orc\n'
  await sheet.getByRole('tab', { name: 'Prompt', exact: true }).click()
  await sheet.getByRole('textbox', { name: 'Exact prompt', exact: true }).fill(exact)
  expect((await submit()).description).toBe(exact)
})

test('every body preset, custom size, and manual/auto frame has the correct source-size HTTP field', async ({ page }) => {
  const { sheet, submit, posted } = await setup(page)
  const body = sheet.getByRole('spinbutton', { name: 'Body size', exact: true }), frame = sheet.getByRole('spinbutton', { name: 'Frame size', exact: true })
  await body.fill('73')
  await expect(body).toHaveValue('73') // Invalid custom input is explained rather than silently rounded.
  await expect(body).toHaveAttribute('step', '4')
  await expect(frame).toHaveAttribute('step', '1')
  await expect(sheet.getByRole('button', { name: 'Create character', exact: true })).toBeDisabled()
  await expect(sheet.locator('.creator-validation')).toContainText('4')
  expect(posted).toEqual([])
  for (const [size, expectedFrame] of [[48, 64], [64, 80], [96, 128], [128, 160]]) {
    await sheet.getByRole('button', { name: String(size), exact: true }).click()
    await expect(frame).toHaveValue(String(expectedFrame))
    expect((await submit()).image_size).toEqual({ width: size, height: size })
  }
  // 76 is divisible by four but not eight, protecting the least-restrictive supported increment.
  for (const [size, expectedFrame] of [[32, 48], [76, 96], [256, 256]]) {
    await body.fill(String(size))
    await expect(sheet.locator('.body-presets [aria-pressed=true]')).toHaveCount(0)
    await expect(frame).toHaveValue(String(expectedFrame))
    expect((await submit()).image_size).toEqual({ width: size, height: size })
  }
  await body.fill('76'); await frame.fill('129')
  await expect(sheet.getByRole('button', { name: 'Auto', exact: true })).toHaveAttribute('aria-pressed', 'false')
  expect((await submit()).image_size).toEqual({ width: 76, height: 76 })
  await sheet.getByRole('button', { name: 'Auto', exact: true }).click(); await expect(frame).toHaveValue('96')
  expect((await submit()).image_size).toEqual({ width: 76, height: 76 })
})

test('five direction presets keep eight-view V3 creation and plan only selected unique sources', async ({ page }) => {
  const { sheet, submit } = await setup(page)
  for (const [label, view, sources, selected, mirrors] of [
    ['Top-down 8', 'low top-down', defaultSources, 8, 3],
    ['Top-down 4', 'low top-down', ['south', 'east', 'north'], 4, 1],
    ['Diagonal 4', 'high top-down', ['south-east', 'north-east'], 4, 2],
    ['Side-scroller 2', 'side', ['east'], 2, 1],
    ['Unique 8', 'low top-down', all, 8, 0],
  ] as const) {
    await sheet.getByRole('button', { name: label, exact: true }).click()
    await expect(sheet.locator('.direction[aria-pressed=true]')).toHaveCount(selected)
    await expect(sheet.locator('.mirror[aria-pressed=true]')).toHaveCount(mirrors)
    await plannedSources(page, sheet, [...sources])
    expect((await submit()).view).toBe(view)
  }
})

// All 12,082 mirror/direction transitions are covered by the unit matrix; one mirror per side proves the controls are wired.
test('attached mirror controls on either side plan the correct unique source', async ({ page }) => {
  const { sheet, submit } = await setup(page)
  for (const [button, sources] of [
    ['W', ['south', 'south-east', 'east', 'north-east', 'north', 'west']],
    ['E', ['south', 'south-east', 'north-east', 'north', 'west']],
  ] as const) {
    await sheet.getByRole('button', { name: 'Top-down 8', exact: true }).click()
    await sheet.getByRole('button', { name: `Mirror ${button}`, exact: true }).click()
    await plannedSources(page, sheet, [...sources])
    expect((await submit()).view).toBe('low top-down')
  }
})

test('a direction can be removed and a one-facing custom plan remains valid', async ({ page }) => {
  const { sheet, submit } = await setup(page)
  for (const [abbreviation, direction] of [['S', 'south'], ['NW', 'north-west']]) {
    await sheet.getByRole('button', { name: 'Unique 8', exact: true }).click()
    await sheet.getByRole('button', { name: `${abbreviation} direction`, exact: true }).click()
    await plannedSources(page, sheet, all.filter(value => value !== direction))
    await submit()
  }
  await sheet.getByRole('button', { name: 'Side-scroller 2', exact: true }).click()
  await sheet.getByRole('button', { name: 'W direction', exact: true }).click()
  await plannedSources(page, sheet, ['east'])
  await expect(sheet.locator('.direction[aria-pressed=true]')).toHaveCount(1)
  expect((await submit()).view).toBe('side')
})

test('all cameras and blank, zero and maximum safe seeds reach outgoing JSON with their exact semantics', async ({ page }) => {
  const { sheet, submit } = await setup(page)
  for (const view of ['low top-down', 'high top-down', 'side']) {
    await sheet.getByRole('combobox', { name: 'Camera', exact: true }).selectOption(view)
    expect((await submit()).view).toBe(view)
  }
  const seed = sheet.getByRole('textbox', { name: 'Seed', exact: true })
  for (const value of ['0', String(Number.MAX_SAFE_INTEGER - 100_000)]) {
    await seed.fill(value)
    expect((await submit(false)).seed).toBe(Number(value))
  }
  await seed.fill('')
  const random = (await submit(false)).seed
  expect(Number.isInteger(random) && random >= 1 && random <= 2_000_000_000).toBe(true)
})
