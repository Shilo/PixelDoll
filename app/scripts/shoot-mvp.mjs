// Studio MVP screenshots -> docs/testing/img/mvp_<theme>_<screen>_<device>.png. Needs the dev server (launch config "app-dev").
// Usage: node app/scripts/shoot-mvp.mjs [filter ...]   env BASE=http://localhost:5173 (keyless; opts out of the agent key on the agent server)
// Playwright comes from the design-mockups checkout (not an app dependency).
import { chromium } from '../../design-mockups/node_modules/playwright/index.mjs'
import { fileURLToPath } from 'node:url'

const BASE = process.env.BASE ?? 'http://localhost:5173'
const OUT = fileURLToPath(new URL('../../docs/testing/img/', import.meta.url))
const filters = process.argv.slice(2)
const DEVICES = {
  desktop: { viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1 },
  laptop: { viewport: { width: 1024, height: 768 }, deviceScaleFactor: 1.25 },
  tablet: { viewport: { width: 768, height: 1024 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true },
  phone: { viewport: { width: 375, height: 812 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true },
  landscape: { viewport: { width: 812, height: 375 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true },
  narrow: { viewport: { width: 320, height: 568 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true },
}
const menu = async (p, name) => { await p.locator('.project-btn').first().click(); await p.getByRole('menuitem', { name }).click() }
const phoneLike = (d) => d === 'phone' || d === 'landscape' || d === 'tablet' || d === 'narrow' // tablet portrait stacks like a phone (B10)
const SCREENS = {
  welcome: null,
  studio: async () => {},
  alldirs: async (p) => p.getByRole('button', { name: 'All directions' }).click(),
  colours: async (p, d) => p.getByRole('tab', { name: 'Colours' }).first().click(),
  moves: async (p, d) => p.getByRole('tab', { name: 'Moves' }).first().click(),
  item: async (p, d) => { if (phoneLike(d)) await p.getByRole('button', { name: /details$/ }).first().click() },
  export: async (p) => p.getByRole('button', { name: 'Export' }).first().click(),
  create: async (p) => menu(p, 'New character…'),
  newitem: async (p, d) => (phoneLike(d) ? p.getByRole('button', { name: 'New', exact: true }).click() : p.getByRole('button', { name: 'New head item' }).click()),
  // B10: the "not made for this view yet" note (wizard hat has no walk north) and the phone Outfits chip
  notmade: async (p) => p.evaluate(() => { const s = window.__studio; s.doc.items.head = 'hat_wizard'; s.ui.dir = 'north' }),
  outfits: async (p, d) => { if (phoneLike(d)) await p.getByRole('tab', { name: 'Outfits' }).click() },
  connect: async (p) => menu(p, /PixelLab/),
  activity: async (p) => menu(p, /Activity/),
}
const shots = []
for (const theme of ['dark', 'light']) for (const device of Object.keys(DEVICES)) for (const screen of Object.keys(SCREENS)) shots.push({ theme, device, screen })
const name = (s) => `mvp_${s.theme}_${s.screen}_${s.device}.png`
const todo = shots.filter((s) => !filters.length || filters.every((f) => name(s).includes(f)))

const browser = await chromium.launch()
for (const s of todo) {
  const ctx = await browser.newContext({ ...DEVICES[s.device], reducedMotion: 'reduce' })
  await ctx.addInitScript(([theme, welcome]) => {
    localStorage.setItem('pixeldoll.theme', theme)
    localStorage.setItem('pixeldoll.agentKey', 'off')
    if (!welcome) localStorage.setItem('pixeldoll.welcomed', '1')
  }, [s.theme, s.screen === 'welcome'])
  const page = await ctx.newPage()
  page.on('pageerror', (e) => console.error('pageerror', name(s), e.message))
  await page.goto(`${BASE}/#/`, { waitUntil: 'networkidle' })
  await page.waitForSelector(s.screen === 'welcome' ? '.welcome canvas' : '.stage canvas', { timeout: 15000 })
  await page.waitForTimeout(300)
  try { await SCREENS[s.screen]?.(page, s.device) } catch (e) { console.error('action failed', name(s), e.message.split('\n')[0]) }
  await page.waitForTimeout(700)
  await page.screenshot({ path: OUT + name(s) })
  await ctx.close()
  console.log('shot', name(s))
}
await browser.close()
