// Studio smoke test on the bundled demo (no key, no spend): wear, undo/redo, recolour, outfit save, autosave across reload,
// keyboard, theme, export zip; T2: arrow keys, dev rigs hidden; B10: sheet chaining without a key (T1 P0), back closes a sheet, focus return, move views and the
// "not made yet" note (P1-1), phone/landscape Outfits + Random + Redo (P1-2), tablet portrait layout (P1-3).
// Needs the dev server (launch config "app-dev"). Usage: node app/scripts/e2e-studio.mjs   env BASE=http://localhost:5173
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
const pressed = (name) => page.locator(`.wardrobe .wear[aria-label="Wear ${name}"]`).getAttribute('aria-pressed')
const stage = () => page.locator('.stage canvas').first().evaluate((c) => c.toDataURL())
const step = (s) => console.log('ok', s)

// pause playback so the stage is comparable
await page.keyboard.press('Space')
assert.equal(await pressed('Steel helmet'), 'true')
await page.locator('.wardrobe .row', { hasText: 'Wizard hat' }).click()
assert.equal(await pressed('Wizard hat'), 'true')
assert.equal(await pressed('Steel helmet'), 'false')
step('wear swaps the item in the slot')

await page.locator('.wardrobe .row', { hasText: 'Wizard hat' }).click()
assert.equal(await pressed('Wizard hat'), 'true')
assert.equal(await page.locator('.insp-title').textContent(), 'Wizard hat')
step('tapping a worn item selects it, it stays on (T1 P2-1)')

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

// zip names (stored uncompressed in the zip headers)
for (const f of ['README.txt', 'CREDITS.txt', 'godot/README.txt']) assert.ok(bytes.includes(Buffer.from(f)), `zip has ${f}`)
assert.ok(download.suggestedFilename().startsWith('adventurer-'), download.suggestedFilename())
await page.waitForFunction(() => !document.querySelector('dialog[open]') && document.querySelector('.toast')?.textContent.startsWith('Downloaded'))

// ---- B10: sheets ----
// T1 P0: Create without a key -> the Connect sheet replaces it (8afef4f)
await page.locator('.project-btn').click()
await page.getByRole('menuitem', { name: 'New character…' }).click()
await page.locator('dialog textarea').fill('a cheerful elf archer')
assert.equal(await page.evaluate(() => document.activeElement?.tagName), 'TEXTAREA') // first field focused, not Cancel
await page.locator('dialog').getByRole('button', { name: /^Create/ }).click()
await page.waitForFunction(() => document.querySelector('dialog[open] h2')?.textContent === 'Connect PixelLab')
step('Create without a key opens Connect (P0 sheet chaining)')
await page.keyboard.press('Escape')
await page.waitForFunction(() => !document.querySelector('dialog[open]'))
assert.ok(await page.evaluate(() => document.activeElement?.classList.contains('project-btn')), 'focus back on the menu button')
step('Esc closes, focus returns to the opener (P2-3)')
await page.getByRole('button', { name: 'Export' }).first().click()
await page.locator('dialog[open]').waitFor()
await page.goBack()
await page.waitForFunction(() => !document.querySelector('dialog[open]'))
assert.ok(page.url().startsWith(BASE), page.url())
step('browser back closes the sheet, stays in the app (P2-2)')

// ---- B10: move views (T1 P1-1) ----
await page.locator('.canvas-bar select').selectOption('cross-punch')
for (const d of ['east', 'north', 'west']) assert.ok(await page.getByRole('button', { name: `Face ${d}` }).isDisabled(), `cross punch ${d} disabled`)
assert.equal(await page.getByRole('button', { name: 'Face south' }).getAttribute('aria-pressed'), 'true')
await page.locator('.canvas-bar select').selectOption('walk')
await page.getByRole('button', { name: 'Face north' }).click()
await page.locator('.stage-note', { hasText: 'Wizard hat' }).waitFor()
assert.ok(await page.locator('.stage-note').getByRole('button', { name: 'Make your own' }).isVisible())
await page.getByRole('button', { name: 'Face south' }).click()
assert.equal(await page.locator('.stage-note').count(), 0)
step('cross punch is south only; a worn item without north frames is called out (P1-1)')

// ---- T2: arrow keys in segmented controls; dev rigs out of the character list ----
await page.getByRole('button', { name: 'Face south' }).focus()
await page.keyboard.press('ArrowRight')
assert.equal(await page.getByRole('button', { name: 'Face east' }).getAttribute('aria-pressed'), 'true')
assert.ok(await page.evaluate(() => document.activeElement?.getAttribute('aria-label') === 'Face east'))
step('arrow keys move the direction segmented control')
const idb = (put) => page.evaluate(async (put) => { const q = indexedDB.open('pixeldoll'); const db = await new Promise((r) => (q.onsuccess = () => r(q.result))); const t = db.transaction('projects', 'readwrite'); if (put) t.objectStore('projects').put(put, put.id); else t.objectStore('projects').delete('rig-e2edevrig00'); await new Promise((r) => (t.oncomplete = r)) }, put)
await idb({ id: 'rig-e2edevrig00', savedAt: '', manifest: { format: 'pixeldoll/1', name: 'E2E dev rig' }, rigQa: { pivotFrom: 'idle/south/0' } })
await page.locator('.project-btn').click()
await page.locator('#project-menu summary', { hasText: 'Developer rigs' }).waitFor()
assert.equal(await page.locator('#project-menu > .row', { hasText: 'E2E dev rig' }).count(), 0)
assert.equal(await page.locator('#project-menu .dev-rigs .row', { hasText: 'E2E dev rig' }).isVisible(), false)
await page.keyboard.press('Escape')
await idb(null)
step('dev rigs (no Studio origin) sit in a closed "Developer rigs" group, not in the character list')

// clean up the side record so the next run starts from the fixture defaults
await page.evaluate(async () => { await new Promise((r) => { const q = indexedDB.open('pixeldoll'); q.onsuccess = () => { const t = q.result.transaction('projects', 'readwrite'); t.objectStore('projects').delete('dress-fixture:s2'); t.oncomplete = r } }) })

// ---- B10: other sizes (fresh contexts: own storage) ----
async function at(viewport, fn) {
  const c = await browser.newContext({ viewport, deviceScaleFactor: 2, isMobile: true, hasTouch: true })
  await c.addInitScript(() => localStorage.setItem('pixeldoll.welcomed', '1'))
  const p = await c.newPage()
  p.on('pageerror', (e) => errors.push(e.message))
  await p.goto(`${BASE}/#/`, { waitUntil: 'networkidle' })
  await p.waitForSelector('.stage canvas')
  await fn(p)
  await c.close()
}
for (const [name, vp] of [['phone', { width: 375, height: 812 }], ['landscape', { width: 812, height: 375 }]])
  await at(vp, async (p) => {
    assert.ok(await p.getByRole('button', { name: /^Redo/ }).isVisible(), `${name}: redo`)
    await p.getByRole('button', { name: 'Random look' }).click()
    assert.ok(await p.getByRole('button', { name: /^Undo Random look/ }).isEnabled(), `${name}: random look`)
    await p.getByRole('tab', { name: 'Outfits' }).click()
    await p.getByRole('button', { name: 'Save current look' }).click()
    await p.locator('input[aria-label="Outfit name"]').fill('Phone look')
    await p.getByRole('button', { name: 'Save', exact: true }).click()
    await p.locator('.row', { hasText: 'Phone look' }).waitFor()
    step(`${name}: Outfits, Random look and Redo reachable (P1-2)`)
  })
await at({ width: 768, height: 1024 }, async (p) => {
  assert.ok(await p.locator('.tiles').isVisible(), 'tablet: wardrobe tiles visible')
  const box = await p.locator('.stage canvas').first().boundingBox()
  assert.ok(box && box.y + box.height < 560, `tablet: character above the wardrobe ${JSON.stringify(box)}`)
  await p.getByRole('tab', { name: 'Head' }).click()
  await p.locator('.tile', { hasText: 'Steel helmet' }).click()
  assert.equal(await p.locator('.drawer, .drawer-scrim').count(), 0)
  step('tablet portrait: stage over the wardrobe, nothing covers the character (P1-3)')
})

assert.deepEqual(errors, [])
console.log('all passed')
await browser.close()
