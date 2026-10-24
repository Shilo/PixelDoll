// Keyless local renderer regression: painted pixels, rather than transparent frame boxes.
import { chromium } from '../../../../app/node_modules/playwright/index.mjs';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
const output = new URL('../evidence/renderer-remediation/', import.meta.url);
mkdirSync(output, { recursive: true });
const browser = await chromium.launch();
const bronzeVersion = JSON.parse(readFileSync(new URL('../../../../app/node_modules/@shilo/bronze-ui/package.json', import.meta.url))).version;
const provenance = { capturedAt: new Date().toISOString(), bronzeVersion, browser: browser.version(), deviceScaleFactors: [1, 1.25, 1.5, 2] };
const results = [];
try {
  for (const dpr of [1, 1.25, 1.5, 2]) for (const [width, height] of [[320, 500], [390, 844], [450, 800], [568, 320], [844, 390], [683, 384], [1024, 768], [1366, 768], [1920, 1080]]) {
    const context = await browser.newContext({ viewport: { width, height }, deviceScaleFactor: dpr });
    // Other review repairs can be edited concurrently; do not reload mid-probe.
    await context.route('**/@vite/client', route => route.fulfill({ contentType: 'application/javascript', body: '' }));
    const page = await context.newPage();
    await page.goto(process.env.PROTOTYPE_URL ?? 'http://127.0.0.1:5202/');
    await page.waitForFunction(() => window.prototype?.ready);
    for (const view of ['selection', 'preview', 'topdown', 'side']) {
      if (view === 'preview') await page.evaluate(() => document.querySelector('[data-action=customize]').click());
      if (view === 'topdown' || view === 'side') await page.evaluate(v => document.querySelector(`[data-action="view:${v}"]`).click(), view);
      await page.waitForTimeout(120);
      const metrics = await page.evaluate(async () => {
        const { World } = await import('/world.js');
        const state = window.prototype.snapshot().state;
        const layout = World.prototype.layout(state);
        const canvas = document.querySelector('#actors'), pixels = canvas.getContext('2d').getImageData(0, 0, canvas.width, canvas.height);
        // Reflections are intentionally translucent. Only solid sprite pixels count.
        const collisions = [...document.querySelectorAll('#ui button, #ui input, #ui select, #ui h1, #ui h2, #ui .identity p, #ui .selected-name small')]
          .filter(e => e.checkVisibility()).flatMap(element => {
            const box = element.getBoundingClientRect();
            for (let y = Math.max(0, Math.floor(box.top * devicePixelRatio)); y < Math.min(canvas.height, Math.ceil(box.bottom * devicePixelRatio)); y++)
              for (let x = Math.max(0, Math.floor(box.left * devicePixelRatio)); x < Math.min(canvas.width, Math.ceil(box.right * devicePixelRatio)); x++)
                if (pixels.data[(y * canvas.width + x) * 4 + 3] >= 240) return [element.getAttribute('aria-label') || element.textContent.trim()];
            return [];
          });
        // Render a known alternating source row through the real drawSprite path.
        // Every source pixel must occupy the same count of device pixels.
        const source = document.createElement('canvas'); source.width = source.height = 64;
        const sg = source.getContext('2d');
        for (let x = 0; x < 64; x++) { sg.fillStyle = x % 2 ? '#0f0' : '#f00'; sg.fillRect(x, 0, 1, 64); }
        const target = document.createElement('canvas'); target.width = target.height = 2048;
        const ctx = target.getContext('2d'); ctx.scale(devicePixelRatio, devicePixelRatio);
        const bounds = World.prototype.drawSprite.call({ctx, dpr: devicePixelRatio}, source, 512.27, 800.13, layout.scale, false);
        const row = ctx.getImageData(0, Math.round((bounds.y + bounds.h / 2) * devicePixelRatio), target.width, 1).data;
        const runs = []; let previous = '', length = 0;
        for (let x = 0; x < target.width; x++) {
          const key = row[x * 4 + 3] ? `${row[x * 4]},${row[x * 4 + 1]}` : '';
          if (key !== previous) { if (previous) runs.push(length); previous = key; length = 0; } length++;
        }
        if (previous) runs.push(length);
        return { collisions, cssScale: layout.scale, deviceScale: layout.scale * devicePixelRatio, originDevice: [bounds.x * devicePixelRatio, bounds.y * devicePixelRatio], runWidths: [...new Set(runs)], sourceColumns: runs.length };
      });
      const name = `${width}x${height}-dpr${dpr}-${view}`;
      const passed = !metrics.collisions.length && metrics.runWidths.length === 1 && metrics.sourceColumns === 64 && Number.isInteger(metrics.deviceScale) && metrics.originDevice.every(x => Math.abs(x - Math.round(x)) < 1e-8);
      results.push({ name, passed, ...metrics });
      if (!passed) console.log(JSON.stringify(results.at(-1)));
      if ((dpr === 1 && [320, 568, 683, 844, 1366].includes(width)) || !passed)
        await page.screenshot({ path: fileURLToPath(new URL(`${name}.png`, output)) });
    }
    await context.close();
  }
} finally { await browser.close(); }
writeFileSync(new URL('results.json', output), JSON.stringify(results, null, 2) + '\n');
writeFileSync(new URL('provenance.json', output), JSON.stringify(provenance, null, 2) + '\n');
const failures = results.filter(r => !r.passed);
console.log(JSON.stringify({ total: results.length, passed: results.length - failures.length, failures }, null, 2));
if (failures.length) process.exitCode = 1;
