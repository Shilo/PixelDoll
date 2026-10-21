// B8: drives test_oversize.html in headless Chromium (Playwright from design-mockups/node_modules).
// Needs serve.mjs (M5 harness) serving the folder that holds test_oversize.html + the export: node serve.mjs 8765
// Usage: node run_phaser.mjs <export folder> <phaser versions...>
import { chromium } from '../../../design-mockups/node_modules/playwright/index.mjs';

const [ex = 's5_sword', ...versions] = process.argv.slice(2);
const browser = await chromium.launch();
let bad = 0;
for (const v of versions.length ? versions : ['3.90.0']) {
  const page = await browser.newPage();
  page.on('pageerror', (e) => console.log('pageerror', e.message));
  await page.goto(`http://localhost:8765/test_oversize.html?v=${v}&ex=${ex}`);
  await page.waitForFunction(() => window.__pd?.done || window.__pd?.error, null, { timeout: 180_000 });
  const r = await page.evaluate(() => window.__pd);
  const px = Object.values(r.pixelDiff).reduce((s, n) => s + n, 0);
  const ok = !r.error && px === 0 && r.mismatches === 0 && r.originMismatches === 0 && r.oversizeChecks > 0;
  bad += ok ? 0 : 1;
  console.log(JSON.stringify({ v: r.version, ok, pixelDiff: r.pixelDiff, pixels: r.pixels, steps: r.steps, checks: r.checks, oversizeChecks: r.oversizeChecks, mismatches: r.mismatches, originMismatches: r.originMismatches, framesSeen: r.framesSeen, error: r.error }));
  await page.close();
}
await browser.close();
process.exit(bad ? 1 : 0);
