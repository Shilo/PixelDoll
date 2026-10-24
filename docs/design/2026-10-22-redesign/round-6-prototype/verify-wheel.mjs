import { chromium, webkit } from '../../../../app/node_modules/playwright/index.mjs';
import assert from 'node:assert/strict';

const engine = process.env.BROWSER === 'webkit' ? 'webkit' : 'chromium';
const browser = await ({ chromium, webkit })[engine].launch();
let cases = 0;
try {
  for (const theme of ['obsidian', 'porcelain']) for (const [width, height] of [[1366, 768], [390, 844]]) {
    const page = await browser.newPage({ viewport: { width, height } });
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    await page.addInitScript(theme => localStorage.setItem('bronze-prototype-theme', theme), theme);
    await page.goto('http://127.0.0.1:5202/');
    await page.waitForFunction(() => window.prototype?.ready);
    const selected = () => page.evaluate(() => window.prototype.snapshot().state.character);
    const click = action => page.locator(`[data-action="${action}"]:visible`).first().click();
    const wheel = async (delta, expected) => {
      await page.waitForTimeout(200);
      await page.mouse.wheel(0, delta);
      await page.waitForTimeout(50);
      await page.waitForFunction(expected => window.prototype.snapshot().state.character === expected, expected);
    };
    await page.mouse.move(5, height / 2);
    await wheel(120, 1); await wheel(-120, 0); await wheel(-120, 2);
    await page.locator('[data-field=search]:visible').first().hover();
    await wheel(120, 0); // Wheel over UI also selects, including end wrapping.
    await page.waitForTimeout(200);
    await page.evaluate(() => {
      for (let i = 0; i < 8; i++) window.dispatchEvent(new WheelEvent('wheel', { deltaY: 120, cancelable: true }));
    });
    assert.equal(await selected(), 1, 'A wheel burst advances once without queued steps');
    await page.waitForTimeout(200);
    await page.evaluate(() => {
      for (let i = 0; i < 4; i++) window.dispatchEvent(new WheelEvent('wheel', { deltaY: 10, cancelable: true }));
    });
    assert.equal(await selected(), 2, 'Small trackpad deltas accumulate');
    await page.waitForTimeout(200);
    await page.evaluate(() => window.dispatchEvent(new WheelEvent('wheel', { deltaY: -3, deltaMode: 1, cancelable: true })));
    assert.equal(await selected(), 1, 'Line deltas normalize');
    await page.waitForTimeout(200);
    await page.evaluate(() => window.dispatchEvent(new WheelEvent('wheel', { deltaY: -1, deltaMode: 2, cancelable: true })));
    assert.equal(await selected(), 0, 'Page deltas advance once');
    assert.equal(await page.evaluate(() => window.dispatchEvent(new WheelEvent('wheel', { deltaY: 120, ctrlKey: true, cancelable: true }))), true, 'Zoom remains native');
    const search = page.locator('[data-field=search]:visible').first();
    await search.fill('Mira'); await wheel(120, 1); await wheel(120, 1);
    await search.fill('no-match'); await wheel(120, 1);
    await search.fill('');
    await click('more'); await wheel(120, 1); await page.keyboard.press('Escape');
    await click('import'); await wheel(120, 1); await page.keyboard.press('Escape');
    await click('customize'); await wheel(120, 1);
    assert.equal(await page.evaluate(() => window.prototype.snapshot().state.screen), 'studio');
    assert.deepEqual(errors, []);
    await page.close(); cases++;
  }
  console.log(`${engine}: ${cases} wheel cases passed (direction, wrap, UI targets, trackpad bursts, delta modes, search, overlays, zoom, studio isolation)`);
} finally { await browser.close(); }
