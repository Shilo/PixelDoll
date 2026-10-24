// Exact-viewport visual evidence; never changes either application's source or saved user data.
// From app/: node scripts/compare-experience.mjs --phase before
// Later: node scripts/compare-experience.mjs --phase after
// PROTOTYPE_URL / APP_URL override local servers; --out overrides the ignored evidence directory.
// An existing prototype.json preserves that baseline; later phases capture only production.
// Add --dialogs to inspect real production dialogs after the paired states (no paid actions).
import { chromium } from 'playwright'
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { createHash } from 'node:crypto'
import { resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const appRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const args = process.argv.slice(2)
const option = (name, fallback) => args.includes(name) ? args[args.indexOf(name) + 1] : fallback
const phase = option('--phase', 'before')
if (!/^[a-z0-9-]+$/.test(phase)) throw new Error('Use a simple phase name, such as before or after')
const root = resolve(option('--out', resolve(appRoot, 'test-results/experience-comparison')))
const prototypeUrl = process.env.PROTOTYPE_URL ?? 'http://127.0.0.1:5202'
const appUrl = process.env.APP_URL ?? 'http://127.0.0.1:5208'
const exists = async (path) => readFile(path).then(() => true, error => { if (error.code === 'ENOENT') return false; throw error })
const hash = (bytes) => createHash('sha256').update(bytes).digest('hex')
await mkdir(root, { recursive: true })
const baselinePath = resolve(root, 'prototype.json')
const capturePrototype = !await exists(baselinePath)
const browser = await chromium.launch({ headless: true })
const clickPrototype = (page, action) => page.locator(`[data-action="${action}"]`).filter({ visible: true }).first().click()

async function capture(kind, url) {
  const folder = kind === 'prototype' ? 'prototype' : `app-${phase}`
  await mkdir(resolve(root, folder), { recursive: true })
  const report = { kind, phase: kind === 'prototype' ? 'preserved-baseline' : phase, capturedAt: new Date().toISOString(), url, browser: browser.version(), node: process.version, images: [], supplementalImages: [], errors: [], external: [], bundles: [], complete: false }
  for (const [device, viewport] of [['desktop', { width: 1440, height: 900 }], ['phone', { width: 390, height: 844 }]]) for (const theme of ['dark', 'light']) {
    const context = await browser.newContext({ viewport, deviceScaleFactor: 1, isMobile: device === 'phone', hasTouch: device === 'phone' })
    await context.addInitScript(({ theme }) => {
      localStorage.setItem('pixeldoll.agentKey', 'off')
      localStorage.removeItem('pixellabApiKey')
      localStorage.setItem('pixeldoll.theme', theme)
      localStorage.setItem('pixeldoll.welcomed', '1')
      localStorage.setItem('bronze-prototype-theme', theme === 'dark' ? 'obsidian' : 'porcelain')
    }, { theme })
    await context.route('**/*', route => {
      const target = new URL(route.request().url())
      if (target.origin !== new URL(url).origin) { report.external.push(`${route.request().method()} ${target.origin}${target.pathname}`); return route.abort() }
      if (target.pathname === '/@vite/client') return route.fulfill({ contentType: 'text/javascript', body: 'export {};' })
      return route.continue()
    })
    const page = await context.newPage()
    page.on('pageerror', error => report.errors.push(error.message))
    page.on('response', async response => {
      if (!['script', 'stylesheet'].includes(response.request().resourceType())) return
      try { const bytes = await response.body(); report.bundles.push({ url: response.url(), sha256: hash(bytes) }) } catch { /* Closing a context may cancel unused requests. */ }
    })
    try {
      await page.goto(url)
      if (kind === 'prototype') await page.waitForFunction(() => window.prototype?.ready)
      else { await page.locator('.customize-action').waitFor(); await page.waitForFunction(() => !document.querySelector('.customize-action')?.disabled) }
      const desired = theme === 'dark' ? 'obsidian' : 'porcelain'
      if (kind === 'prototype' && await page.evaluate(() => window.prototype.snapshot().state.theme) !== desired) { await clickPrototype(page, 'more'); await clickPrototype(page, `theme:${desired}`) }

      async function shot(screen, detail = '', supplemental = false) {
        await page.mouse.move(0, 0)
        await page.evaluate(async () => { await document.fonts.ready })
        await page.waitForTimeout(160)
        const name = `${device}-${theme}-${screen}`
        const bytes = await page.screenshot({ animations: 'disabled' })
        await writeFile(resolve(root, folder, `${name}.png`), bytes)
        const snapshot = await page.evaluate(kind => {
          if (kind === 'prototype') { const s = window.prototype.snapshot(); return { state: s.state, equipped: s.equipped, resolved: s.resolved, actorBounds: s.actorBounds } }
          const actor = document.querySelector('.world-stage')
          return { title: document.querySelector('.scene-identity h1')?.textContent, selectedCharacter: document.querySelector('.character-row[aria-pressed=true]')?.textContent, facing: actor?.dataset.facing, presentation: actor?.dataset.presentation, equippedVisible: [...document.querySelectorAll('.tiles button[aria-pressed=true]')].map(el => el.textContent.trim()) }
        }, kind)
        ;(supplemental ? report.supplementalImages : report.images).push({ key: name, screen, device, theme, viewport, file: `${folder}/${name}.png`, bytes: bytes.length, sha256: hash(bytes), detail, snapshot })
        console.log(`${kind} ${name}`)
      }

      await shot('characters', 'Prototype has three authored demo outfits; production contains the bundled demo only in this isolated context.')
      if (kind === 'prototype') await clickPrototype(page, 'create')
      else await page.getByRole('button', { name: 'New character', exact: true }).click()
      await shot('create', 'Prototype creator is an editable draft with disconnected generation; production uses the complete validated creator.')
      if (kind === 'prototype') { await clickPrototype(page, 'back'); await clickPrototype(page, 'customize'); if (await page.evaluate(() => window.prototype.snapshot().state.playing)) await clickPrototype(page, 'play'); await page.locator('[data-field=clip]').selectOption('walk'); await clickPrototype(page, 'direction:south') }
      else {
        await page.getByRole('dialog', { name: 'New character', exact: true }).getByRole('button', { name: 'Cancel', exact: true }).click()
        await page.locator('.customize-action').click()
        await page.waitForFunction(() => document.querySelector('.world-stage')?.dataset.position === '0.00,0.00')
        const pause = page.getByRole('button', { name: 'Pause', exact: true }); if (await pause.isVisible()) await pause.click()
        await page.getByRole('combobox', { name: 'Move', exact: true }).selectOption('walk')
        await page.getByRole('button', { name: 'Face south', exact: true }).click()
        await page.getByRole('tab', { name: /^Head/ }).click()
      }
      await shot('preview', 'Adventurer original equipment; Walk selected, paused at its first frame, facing south.')
      for (const panel of ['Colors', 'Outfits', 'Moves']) {
        if (kind === 'prototype') await clickPrototype(page, `panel:${panel}`)
        else await page.getByRole('navigation', { name: 'Customization panels' }).getByRole('button', { name: panel, exact: true }).click()
        await shot(`panel-${panel.toLowerCase()}`, panel === 'Colors' ? 'Prototype sample palette is decorative/disconnected; production edits actual material ramps.' : panel === 'Outfits' ? 'Prototype has three demonstration looks; production exposes actual saved project presets.' : 'Prototype animation inventory is a fixture; production retains move authoring and recovery.')
      }
      if (kind === 'prototype') { await clickPrototype(page, 'panel:Wardrobe'); await clickPrototype(page, 'slot:all') }
      else { await page.getByRole('navigation', { name: 'Customization panels' }).getByRole('button', { name: 'Wardrobe', exact: true }).click(); await page.getByRole('button', { name: 'More', exact: true }).click() }
      await shot('equipment-more', 'Production preserves all additional equipment groups; prototype includes only Back and Held item.')
      await page.keyboard.press('Escape')
      if (kind === 'prototype') await clickPrototype(page, 'more')
      else await page.getByRole('button', { name: 'More options', exact: true }).click()
      await shot('menu-options', 'Prototype account/import/export are disconnected stubs. Production account, Activity and request inspection remain functional.')
      await page.keyboard.press('Escape')
      for (const [mode, label] of [['topdown', 'Top-down'], ['side', 'Side-scroller']]) {
        if (kind === 'prototype') await clickPrototype(page, `view:${mode}`)
        else await page.getByRole('navigation', { name: 'Character view' }).getByRole('button', { name: label, exact: true }).click()
        // Capture initial rest presentation; no locomotion is synthesized for the fixture's absent Idle.
        await shot(mode, 'Stationary world at the original camera position; both render an explicit stored fallback for missing Idle.')
      }
      if (kind === 'app' && args.includes('--dialogs')) {
        const extra = name => shot(`dialog-${name}`, 'Real production workflow. No prototype functionality is inferred from its decorative controls. No paid action is submitted.', true)
        const dialog = name => page.getByRole('dialog', { name, exact: true })
        const close = async (name, label = 'Cancel') => {
          await dialog(name).getByRole('button', { name: label, exact: true }).click()
          await dialog(name).waitFor({ state: 'hidden' })
        }
        const options = async label => {
          await page.getByRole('button', { name: 'More options', exact: true }).click()
          await page.locator('#experience-options').getByRole('button', { name: label, exact: true }).click()
        }
        await page.getByRole('navigation', { name: 'Character view' }).getByRole('button', { name: 'Preview', exact: true }).click()
        await page.getByRole('button', { name: 'Steel helmet details', exact: true }).click()
        await dialog('Item').waitFor(); await extra('item-details'); await close('Item', 'Done')
        await page.getByRole('button', { name: 'Inspect', exact: true }).click()
        const all = dialog('Inspect character').getByRole('button', { name: 'All directions', exact: true })
        if (await all.getAttribute('aria-pressed') !== 'true') await all.click()
        await extra('inspect'); await close('Inspect character', 'Done')
        await page.getByRole('button', { name: 'Export', exact: true }).click()
        await page.waitForFunction(() => [...document.querySelectorAll('dialog button')].some(button => button.textContent.includes('Download ZIP') && !button.disabled))
        await extra('export'); await close('Export')
        await options('Connect PixelLab')
        if (await dialog('Connect PixelLab').getByLabel('API key', { exact: true }).inputValue()) throw new Error('Refusing to capture a credential field containing data')
        await extra('account'); await close('Connect PixelLab')
        await options('Activity')
        await dialog('Activity').waitFor(); await extra('activity'); await close('Activity', 'Done')
        await page.getByRole('button', { name: 'New head item', exact: true }).click()
        await dialog('New item').waitFor(); await extra('new-item-demo')
        // This is an offline local copy in an isolated context, not a generation.
        await dialog('New item').getByRole('button', { name: 'Copy the demo body', exact: true }).click()
        await dialog('New item').getByRole('textbox', { name: 'What is it?', exact: true }).waitFor()
        await extra('new-item-form'); await close('New item')
        await page.getByRole('button', { name: 'Use a saved design', exact: true }).click()
        await dialog('New item').getByRole('tab', { name: 'Saved designs', exact: true }).waitFor()
        await extra('saved-designs'); await close('New item')
        await page.getByRole('button', { name: 'Characters', exact: true }).click()
        await page.getByRole('button', { name: 'Import', exact: true }).click()
        await dialog('Import character').waitFor(); await extra('import'); await close('Import character')
      }
    } finally { await context.close() }
  }
  report.bundles = [...new Map(report.bundles.map(entry => [`${entry.url}|${entry.sha256}`, entry])).values()]
  report.complete = report.images.length === 40 && report.errors.length === 0 && report.external.length === 0
  await writeFile(resolve(root, kind === 'prototype' ? 'prototype.json' : `${phase}.json`), JSON.stringify(report, null, 2))
  if (!report.complete) throw new Error(`${kind} evidence incomplete: ${report.images.length} images, ${report.errors.length} errors, ${report.external.length} external requests`)
}

try {
  if (capturePrototype) await capture('prototype', prototypeUrl)
  else console.log('Reusing preserved prototype baseline; no prototype files will be overwritten.')
  await capture('app', appUrl)
} finally { await browser.close() }

const baseline = JSON.parse(await readFile(baselinePath, 'utf8'))
const actual = JSON.parse(await readFile(resolve(root, `${phase}.json`), 'utf8'))
const escape = text => String(text).replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('"', '&quot;')
const cards = actual.images.map(entry => {
  const previous = baseline.images.find(image => image.key === entry.key)
  if (!previous || previous.viewport.width !== entry.viewport.width || previous.viewport.height !== entry.viewport.height) throw new Error(`Missing exact-size baseline: ${entry.key}`)
  return `<section id="${escape(entry.key)}"><h2>${escape(entry.device)} · ${escape(entry.theme)} · ${escape(entry.screen)} <small>${entry.viewport.width} × ${entry.viewport.height}</small></h2><p>${escape(entry.detail)}</p><div class="pair"><figure><figcaption>Approved isolated prototype · preserved baseline</figcaption><a href="${escape(previous.file)}"><img src="${escape(previous.file)}" width="${entry.viewport.width}" height="${entry.viewport.height}" loading="lazy" alt="Prototype ${escape(entry.key)}"></a></figure><figure><figcaption>Production integration · ${escape(phase)}</figcaption><a href="${escape(entry.file)}"><img src="${escape(entry.file)}" width="${entry.viewport.width}" height="${entry.viewport.height}" loading="lazy" alt="Production ${escape(entry.key)}"></a></figure></div></section>`
}).join('\n')
const supplemental = (actual.supplementalImages ?? []).map(entry => `<section id="${escape(entry.key)}"><h2>Production workflow · ${escape(entry.device)} · ${escape(entry.theme)} · ${escape(entry.screen)}</h2><p>${escape(entry.detail)}</p><figure><a href="${escape(entry.file)}"><img src="${escape(entry.file)}" width="${entry.viewport.width}" height="${entry.viewport.height}" loading="lazy" alt="${escape(entry.key)}"></a></figure></section>`).join('\n')
const html = `<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>PixelDoll prototype / production · ${escape(phase)}</title><style>body{margin:0;padding:24px;background:#15171b;color:#eee;font:15px/1.5 system-ui}h1{margin:0}h2{font-size:20px;margin:0 0 8px}small,p{color:#bec2ca}a{color:#d7b87b}nav{display:flex;gap:16px;flex-wrap:wrap;margin:20px 0}section{border-top:1px solid #444;padding:24px 0}.pair{display:grid;grid-template-columns:1fr 1fr;gap:12px;align-items:start}figure{margin:0;min-width:0}figcaption{padding:8px;background:#242831}img{display:block;width:100%;height:auto}section:has(img[width="390"]){max-width:1000px}section:target{outline:2px solid #d7b87b;outline-offset:8px}@media(max-width:700px){body{padding:12px}.pair{grid-template-columns:1fr}}</style><h1>Approved prototype / production integration</h1><p>Phase: <strong>${escape(phase)}</strong>. Both originals in every pair use identical viewport dimensions and DPR 1. Click an image for its untouched full-size PNG. These captures compare visual treatment; decorative prototype controls do not replace real production functionality.</p><p>Contexts are isolated and credential-free. All external requests, including PixelLab, are blocked. The production demo may contain its existing body-material split; the prototype loads the original fixture directly. Library counts and creator drafts reflect their real separate implementations.</p><nav>${actual.images.map(entry => `<a href="#${escape(entry.key)}">${escape(entry.key)}</a>`).join('')}</nav>${cards}</html>`
await writeFile(resolve(root, `gallery-${phase}.html`), html.replace('</html>', supplemental + '</html>'))
await writeFile(resolve(root, 'index.html'), html.replace('</html>', supplemental + '</html>'))
console.log(`Complete: ${actual.images.length} same-size pairs. Gallery: ${resolve(root, `gallery-${phase}.html`)}`)
