// Supplemental compact-sheet matrix. Original audit and renderer evidence are retained.
import { chromium } from '../../../../app/node_modules/playwright/index.mjs';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
const output = new URL('../evidence/renderer-expanded/', import.meta.url);
mkdirSync(output, { recursive: true });
const results = [];
const browser = await chromium.launch();
const packageVersion = JSON.parse(readFileSync(new URL('../../../../app/node_modules/@shilo/bronze-ui/package.json', import.meta.url))).version;
const provenance = { capturedAt: new Date().toISOString(), bronzeVersion: packageVersion, browser: browser.version(), deviceScaleFactor: 1 };
try {
  for (const theme of ['obsidian', 'porcelain']) for (const [width, height] of [[320, 500], [390, 844], [450, 800]]) {
    const context = await browser.newContext({ viewport: { width, height }, deviceScaleFactor: 1 });
    await context.route('**/@vite/client', route => route.fulfill({ contentType: 'application/javascript', body: '' }));
    await context.addInitScript(theme => localStorage.setItem('bronze-prototype-theme', theme), theme);
    const page = await context.newPage();
    await page.goto(process.env.PROTOTYPE_URL ?? 'http://127.0.0.1:5202/');
    await page.waitForFunction(() => window.prototype?.ready);
    await page.evaluate(() => document.querySelector('[data-action=customize]').click());
    await page.evaluate(() => document.querySelector('[data-action=play]').click());
    for (const view of ['preview', 'topdown', 'side']) {
      await page.evaluate(v => document.querySelector(`[data-action="view:${v}"]`).click(), view);
      for (const expanded of [false, true]) {
        await page.evaluate(expanded => { if (window.prototype.snapshot().state.expanded !== expanded) document.querySelector('[data-action=expand]').click(); }, expanded);
        await page.waitForTimeout(100);
        const metrics = await page.evaluate(async () => {
          const { World } = await import('/world.js');
          const canvas = document.querySelector('#actors');
          const data = canvas.getContext('2d').getImageData(0, 0, canvas.width, canvas.height).data;
          const selectors = '#ui button,#ui input,#ui select,#ui h1,#ui h2,#ui .identity p,#ui .hint';
          const collisions = [...document.querySelectorAll(selectors)].filter(el => el.checkVisibility()).flatMap(el => {
            const rect = el.getBoundingClientRect();
            for (let y = Math.max(0, Math.floor(rect.top)); y < Math.min(canvas.height, Math.ceil(rect.bottom)); y++)
              for (let x = Math.max(0, Math.floor(rect.left)); x < Math.min(canvas.width, Math.ceil(rect.right)); x++)
                if (data[(y * canvas.width + x) * 4 + 3] >= 240) return [el.getAttribute('aria-label') || el.dataset.action || el.textContent.trim()];
            return [];
          });
          const hint = document.querySelector('.hint')?.getBoundingClientRect(), tabs = document.querySelector('.view-tabs').getBoundingClientRect();
          const hintOverlapsTabs = !!hint && hint.top < tabs.bottom && hint.bottom > tabs.top && hint.left < tabs.right && hint.right > tabs.left;
          const snapshot = window.prototype.snapshot();
          const projection = World.prototype.projection.call(Object.create(World.prototype), snapshot.state, {x: 0, y: 0});
          const skyAlphaAtHorizon = snapshot.state.view === 'side' ? document.querySelector('#sky').getContext('2d').getImageData(100, Math.floor(projection.horizon - 1), 1, 1).data[3] : null;
          return { collisions, hintOverlapsTabs, skyAlphaAtHorizon, actor: snapshot.actorBounds, scheme: document.documentElement.dataset.theme,
            expanded: window.prototype.snapshot().state.expanded, sheetTop: document.querySelector('.wardrobe').getBoundingClientRect().top };
        });
        const name = `${theme}-${width}x${height}-${view}-${expanded ? 'expanded' : 'normal'}`;
        const passed = !metrics.collisions.length && !metrics.hintOverlapsTabs && (metrics.skyAlphaAtHorizon === null || metrics.skyAlphaAtHorizon === 255) && metrics.expanded === expanded && metrics.scheme === (theme === 'porcelain' ? 'light' : 'dark');
        results.push({ name, passed, ...metrics });
        await page.screenshot({ path: fileURLToPath(new URL(`${name}.png`, output)) });
      }
    }
    await context.close();
  }
} finally { await browser.close(); }
writeFileSync(new URL('results.json', output), JSON.stringify(results, null, 2) + '\n');
writeFileSync(new URL('provenance.json', output), JSON.stringify(provenance, null, 2) + '\n');
const failures = results.filter(result => !result.passed);
console.log(JSON.stringify({ total: results.length, passed: results.length - failures.length, failures }, null, 2));
if (failures.length) process.exitCode = 1;
