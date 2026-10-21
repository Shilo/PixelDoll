// Studio smoke test on the bundled demo (no key, no spend): wear, undo/redo, recolour, outfit save, autosave across reload,
// keyboard, theme, export zip. Needs the dev server (launch config "app-dev"). Usage: node app/scripts/e2e-studio.mjs
import { chromium } from '../../design-mockups/node_modules/playwright/index.mjs'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const BASE = process.env.BASE ?? 'http://localhost:5173'
const browser = await chromium.launch()
const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, acceptDownloads: true })
await ctx.addInitScript(() => { if (!sessionStorage.getItem('init')) { sessionStorage.setItem('init', '1'); localStorage.setItem('pixeldoll.welcomed', '1') } })
const page = await ctx.newPage()
const errors = []
page.on('pageerror', (e) => { errors.push(e.message); console.log('pageerror', e.message) })
page.on('console', (m) => { if (m.type() === 'error') console.log('console', m.text()) })
await page.goto(`${BASE}/#/`, { waitUntil: 'networkidle' })
await page.waitForSelector('.stage canvas')
const pressed = (name) => page.locator('.wardrobe .row', { hasText: name }).getAttribute('aria-pressed')
const stage = () => page.locator('.stage canvas').first().evaluate((c) => c.toDataURL())
const step = (s) => console.log('ok', s)

// pause playback so the stage is comparable
await page.keyboard.press('Space')
assert.equal(await pressed('Steel helmet'), 'true')
await page.locator('.wardrobe .row', { hasText: 'Wizard hat' }).click()
assert.equal(await pressed('Wizard hat'), 'true')
assert.equal(await pressed('Steel helmet'), 'false')
step('wear swaps the item in the slot')

await page.getByRole('button', { name: /^Undo/ }).click()
assert.equal(await pressed('Steel helmet'), 'true')
await page.keyboard.press('Control+Shift+Z')
assert.equal(await pressed('Wizard hat'), 'true')
step('undo / redo (button + shortcut)')

const before = await stage()
await page.getByRole('tab', { name: 'Colours' }).click()
await page.locator('.colours .swatch[aria-label="azure"]').first().click()
assert.notEqual(await stage(), before)
assert.equal(await page.locator('.colours .swatch[aria-label="azure"]').first().getAttribute('aria-checked'), 'true')
step('recolour changes the stage pixels')

await page.locator('[aria-label="Save current look"]').click()
await page.locator('input[aria-label="Outfit name"]').fill('Smoke look')
await page.getByRole('button', { name: 'Save', exact: true }).click()
await page.locator('.wardrobe .row', { hasText: 'Smoke look' }).waitFor()
assert.ok(await page.locator('.wardrobe .row', { hasText: 'Smoke look' }).locator('.badge').isVisible())
step('outfit saved and marked current')

await page.keyboard.press('2')
assert.equal(await page.getByRole('button', { name: 'Face east' }).getAttribute('aria-pressed'), 'true')
await page.keyboard.press('0')
assert.equal(await page.locator('.all-dirs canvas').count(), 4)
await page.keyboard.press('0')
step('keyboard: direction + all directions')

await page.getByRole('button', { name: 'Switch to light mode' }).click()
assert.equal(await page.evaluate(() => document.documentElement.dataset.theme), 'light')
step('theme switch')

await page.waitForTimeout(800) // autosave debounce
await page.reload({ waitUntil: 'networkidle' })
await page.waitForSelector('.stage canvas')
assert.equal(await pressed('Wizard hat'), 'true')
assert.ok(await page.locator('.wardrobe .row', { hasText: 'Smoke look' }).isVisible())
assert.equal(await page.evaluate(() => document.documentElement.dataset.theme), 'light')
step('outfit, colours, presets and theme survive a reload')

await page.getByRole('button', { name: 'Export' }).first().click()
const dl = page.getByRole('button', { name: /Download zip · \d+ KB/ })
await dl.waitFor()
const [download] = await Promise.all([page.waitForEvent('download'), dl.click()])
const bytes = readFileSync(await download.path())
assert.equal(bytes.subarray(0, 2).toString(), 'PK')
for (const f of ['manifest.json', 'godot/', 'layers/head/hat_wizard/']) assert.ok(bytes.includes(Buffer.from(f)), `zip has ${f}`)
step(`export ${download.suggestedFilename()} ${Math.round(bytes.length / 1024)} KB`)

// clean up the side record so the next run starts from the fixture defaults
await page.evaluate(async () => { await new Promise((r) => { const q = indexedDB.open('pixeldoll'); q.onsuccess = () => { const t = q.result.transaction('projects', 'readwrite'); t.objectStore('projects').delete('dress-fixture:s2'); t.oncomplete = r } }) })
assert.deepEqual(errors, [])
console.log('all passed')
await browser.close()
