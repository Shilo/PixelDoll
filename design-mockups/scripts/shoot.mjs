// Bulk screenshots + token contrast check. Needs the dev server running (launch config "design-dev").
// Usage: node scripts/shoot.mjs [filter-substring ...]   env BASE=http://localhost:5180
import { chromium } from 'playwright'
import { mkdirSync, writeFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

const BASE = process.env.BASE ?? 'http://localhost:5180'
const OUT = fileURLToPath(new URL('../../docs/design/screenshots/', import.meta.url))
mkdirSync(OUT, { recursive: true })
const filters = process.argv.slice(2)

const DEVICES = {
  desktop: { viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1 },
  phone: { viewport: { width: 375, height: 812 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true },
  landscape: { viewport: { width: 812, height: 375 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true },
}
const SCREENS = ['studio', 'newitem', 'generating', 'create', 'review', 'connect', 'export', 'activity', 'colours', 'empty']
const shots = []
for (const look of ['A', 'B', 'C', 'D', 'E', 'AE']) for (const scheme of ['light', 'dark']) shots.push({ look, scheme, screen: 'studio', device: 'desktop' })
for (const look of ['AE', 'B']) for (const scheme of ['light', 'dark']) for (const device of Object.keys(DEVICES)) for (const screen of SCREENS)
  if (!(screen === 'studio' && device === 'desktop')) shots.push({ look, scheme, screen, device })
const name = (s) => `${s.look}_${s.scheme}_${s.screen}_${s.device}.png`
const todo = shots.filter((s) => !filters.length || filters.some((f) => name(s).includes(f)))

const browser = await chromium.launch()
const ctxs = {}
for (const s of todo) {
  const key = `${s.device}-${s.scheme}`
  ctxs[key] ??= await browser.newContext({ ...DEVICES[s.device], colorScheme: s.scheme, reducedMotion: 'no-preference' })
  const page = await ctxs[key].newPage()
  page.on('pageerror', (e) => console.error('pageerror', name(s), e.message))
  await page.goto(`${BASE}/?look=${s.look}&scheme=${s.scheme}&screen=${s.screen}&shot`, { waitUntil: 'networkidle' })
  await page.evaluate(() => document.fonts.ready)
  await page.waitForTimeout(450)
  await page.screenshot({ path: OUT + name(s) })
  await page.close()
  console.log('shot', name(s))
}

// Contrast of the semantic tokens, measured from the rendered page (alpha colours composited over their surface).
if (!filters.length || filters.includes('contrast')) {
  const page = await browser.newPage()
  const rows = []
  for (const look of ['A', 'AE', 'B', 'C', 'D', 'E']) for (const scheme of ['light', 'dark']) {
    await page.goto(`${BASE}/?look=${look}&scheme=${scheme}&shot`, { waitUntil: 'networkidle' })
    const r = await page.evaluate(() => {
      const cs = getComputedStyle(document.documentElement)
      const c = document.createElement('canvas').getContext('2d')
      const rgba = (v) => { c.fillStyle = '#000'; c.fillStyle = cs.getPropertyValue(v).trim(); const f = c.fillStyle
        if (f.startsWith('#')) return [1, 3, 5].map((i) => parseInt(f.slice(i, i + 2), 16)).concat(1)
        return f.match(/[\d.]+/g).map(Number) }
      const over = (a, b) => [0, 1, 2].map((i) => a[i] * a[3] + b[i] * (1 - a[3])).concat(1)
      const lum = (p) => { const f = (x) => { x /= 255; return x <= 0.03928 ? x / 12.92 : ((x + 0.055) / 1.055) ** 2.4 }; return 0.2126 * f(p[0]) + 0.7152 * f(p[1]) + 0.0722 * f(p[2]) }
      const cr = (a, b) => { const [x, y] = [lum(a), lum(b)].sort((m, n) => n - m); return +((x + 0.05) / (y + 0.05)).toFixed(2) }
      const ground = over(rgba('--bg'), rgba('--stage'))
      const side = over(rgba('--bg-side'), ground)
      const raised = over(rgba('--bg-raised'), ground)
      const on = (fg, bg) => cr(over(rgba(fg), bg), bg)
      return {
        'text/bg': on('--text', ground), 'text-2/side': on('--text-2', side), 'text-3/side': on('--text-3', side), 'text-2/raised': on('--text-2', raised),
        'accent-text/side': on('--accent-text', side), 'accent-text/bg': on('--accent-text', ground), 'on-accent/accent': cr(rgba('--on-accent'), over(rgba('--accent'), ground)),
        'ok/side': on('--ok', side), 'warn/bg': on('--warn', ground), 'bad/side': on('--bad', side),
      }
    })
    rows.push({ look, scheme, ...r })
  }
  writeFileSync(OUT + 'contrast.json', JSON.stringify(rows, null, 1))
  for (const r of rows) {
    const fails = Object.entries(r).filter(([k, v]) => typeof v === 'number' && v < 4.5).map(([k, v]) => `${k} ${v}`)
    console.log(`contrast ${r.look}/${r.scheme}: ${fails.length ? 'BELOW AA: ' + fails.join(', ') : 'all >= 4.5'}`)
  }
}
await browser.close()

// Contact-sheet index (README.md) + HTML gallery (index.html) from whatever PNGs exist.
import { readdirSync } from 'node:fs'
const files = readdirSync(OUT).filter((f) => f.endsWith('.png')).sort()
const LOOKN = { AE: 'A+E Native + pixel accents (recommended)', A: 'A Native minimal', B: 'B Liquid Glass (GlassKit 1.29.0)', C: 'C Pro dark', D: 'D Soft playful', E: 'E Pixel-accent' }
const parse = (f) => { const [look, scheme, screen, device] = f.replace('.png', '').split('_'); return { f, look, scheme, screen, device } }
const all = files.map(parse)
let md = `# D2 design mockup screenshots\n\nGenerated by \`design-mockups/scripts/shoot.mjs\` (Playwright, Chromium). Desktop 1440×900 @1x, phone 375×812 and landscape 812×375 @2x (touch emulated).\nNames: \`<look>_<scheme>_<screen>_<device>.png\`. Report: [../D2_mockups_report.md](../D2_mockups_report.md). Gallery: [index.html](index.html). Token contrast: [contrast.json](contrast.json).\n\n## All looks · desktop Studio\n\n| Look | Light | Dark |\n|---|---|---|\n`
for (const l of ['AE', 'A', 'B', 'C', 'D', 'E']) md += `| ${LOOKN[l]} | ![](${l}_light_studio_desktop.png) | ![](${l}_dark_studio_desktop.png) |\n`
for (const l of ['AE', 'B']) for (const sc of ['light', 'dark']) {
  md += `\n## ${LOOKN[l]} · ${sc}\n\n| Screen | Desktop | Phone portrait | Phone landscape |\n|---|---|---|---|\n`
  for (const s of SCREENS) md += `| ${s} | ${['desktop', 'phone', 'landscape'].map((d) => `![](${l}_${sc}_${s}_${d}.png)`).join(' | ')} |\n`
}
writeFileSync(OUT + 'README.md', md)
const cards = all.map((x) => `<figure data-look="${x.look}" data-scheme="${x.scheme}" data-screen="${x.screen}" data-device="${x.device}"><a href="${x.f}"><img loading="lazy" src="${x.f}" alt="${x.look} ${x.scheme} ${x.screen} ${x.device}"></a><figcaption>${x.look} · ${x.scheme} · ${x.screen} · ${x.device}</figcaption></figure>`).join('\n')
const sel = (k, vals) => `<label>${k} <select data-k="${k}"><option value="">all</option>${[...new Set(vals)].map((v) => `<option>${v}</option>`).join('')}</select></label>`
writeFileSync(OUT + 'index.html', `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>PixelDoll D2 mockups</title>
<style>:root{color-scheme:light dark;--bg:#f5f5f7;--card:#fff;--text:#1d1d1f;--muted:#58585d}@media (prefers-color-scheme:dark){:root{--bg:#1e1e1f;--card:#2c2c2e;--text:#f5f5f7;--muted:#c7c7cc}}
body{margin:0;font:14px/1.4 system-ui,sans-serif;background:var(--bg);color:var(--text)}header{position:sticky;top:0;z-index:1;display:flex;flex-wrap:wrap;gap:12px;align-items:center;padding:12px 16px;background:var(--bg);border-bottom:1px solid #8884}
h1{font-size:17px;margin:0 12px 0 0}main{display:grid;grid-template-columns:repeat(auto-fill,minmax(280px,1fr));gap:16px;padding:16px}figure{margin:0;background:var(--card);border-radius:10px;padding:8px}img{width:100%;height:220px;object-fit:contain;display:block}figcaption{color:var(--muted);font-size:12px;padding-top:6px}a{color:inherit}</style></head><body>
<header><h1>PixelDoll · D2 mockups</h1>${sel('look', all.map((x) => x.look))}${sel('scheme', all.map((x) => x.scheme))}${sel('screen', all.map((x) => x.screen))}${sel('device', all.map((x) => x.device))}<a href="README.md">README</a><a href="../D2_mockups_report.md">Report</a></header>
<main>${cards}</main>
<script>const f={};document.querySelectorAll('select').forEach(s=>s.onchange=()=>{f[s.dataset.k]=s.value;document.querySelectorAll('figure').forEach(c=>c.hidden=Object.entries(f).some(([k,v])=>v&&c.dataset[k]!==v))})</script></body></html>`)
console.log('index', files.length, 'images')
