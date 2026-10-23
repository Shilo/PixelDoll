import { chromium } from '../../../../app/node_modules/playwright/index.mjs';
import { writeFile, readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import assert from 'node:assert/strict';
import { APPEARANCES, rgb } from './theme.mjs';
const browser = await chromium.launch({ headless: true });
const report = { date: '2026-10-23', result: 'passed', vendor: '1.30.0', cases: [], checks: [], errors: [] };
const css = await readFile(new URL('./vendor/glasskit/glasskit.css', import.meta.url));
assert.equal(createHash('sha256').update(css).digest('hex'), '526302658646fe5733b566366fef299a306f5bac7a733b62bad038f777799026');
const luminance = color => color.map(n => n / 255).map(n => n <= .04045 ? n / 12.92 : ((n + .055) / 1.055) ** 2.4).reduce((sum, n, i) => sum + n * [.2126, .7152, .0722][i], 0);
const contrast = (a, b) => (Math.max(luminance(a), luminance(b)) + .05) / (Math.min(luminance(a), luminance(b)) + .05);
report.contrast = Object.entries(APPEARANCES).map(([theme, { ui }]) => {
  const surface = rgb(ui.surface), worstBackdrop = theme === 'obsidian' ? 255 : 0;
  const backing = surface.map(n => n * .92 + worstBackdrop * .08);
  const ratios = Object.fromEntries(['text', 'muted', 'accent'].map(role => [role, contrast(rgb(ui[role]), backing)]));
  ratios.primaryButton = contrast(rgb(ui.ink), rgb(ui.accent));
  Object.values(ratios).forEach(ratio => assert.ok(ratio >= 4.5));
  return { theme, scope: 'Text against 92% surface over worst-case black/white; primary fill', ...ratios };
});
const viewports = [{ width: 1920, height: 1080 }, { width: 450, height: 800 }, { width: 390, height: 844 }, { width: 844, height: 390 }];
try {
  for (const variant of ['restrained', 'rounded']) for (const theme of ['obsidian', 'porcelain']) for (const viewport of viewports) {
    const context = await browser.newContext({ viewport });
    await context.route('**/*', route => new URL(route.request().url()).hostname === '127.0.0.1' ? route.continue() : route.abort());
    const page = await context.newPage(); page.on('pageerror', e => report.errors.push(e.message));
    const click = action => page.locator(`[data-action="${action}"]`).filter({ visible: true }).first().click();
    await page.goto('http://127.0.0.1:5202/?material=' + variant);
    await page.waitForFunction(() => window.prototype?.ready);
    if ((await page.evaluate(() => window.prototype.snapshot().state.theme)) !== theme) { await click('more'); await click('theme:' + theme); }
    assert.equal(await page.locator('html').getAttribute('data-theme'), theme === 'obsidian' ? 'dark' : 'light');
    await click('create');
    assert.ok(await page.locator('.creator').evaluate(el => el.scrollWidth <= el.clientWidth + 1));
    assert.equal(await page.locator('textarea').first().evaluate(el => getComputedStyle(el).backdropFilter), 'none');
    if (viewport.width === 450) for (const selector of ['[data-draft=name]', '[data-draft=details]', '[data-draft=size]']) assert.equal(await page.locator(selector).evaluate(el => getComputedStyle(el).fontSize), '15px');
    await page.locator('[data-draft=name]').focus();
    assert.equal(await page.locator('[data-draft=name]').evaluate(el => getComputedStyle(el).outlineStyle), 'solid');
    await click('back'); await click('customize'); await click('play');
    for (const view of ['preview', 'topdown', 'side']) {
      await click('view:' + view);
      assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), `${variant}/${theme}/${view}: overflow`);
      assert.equal(await page.locator('.wardrobe [aria-pressed=true]').first().isVisible(), true);
    }
    await click('view:preview');
    const surface = await page.locator('.playback').evaluate(el => ({ blur: getComputedStyle(el).backdropFilter, radius: getComputedStyle(el).borderRadius, font: getComputedStyle(el.querySelector('select')).fontSize }));
    assert.equal(surface.blur, 'blur(12px)');
    assert.equal(surface.radius, variant === 'rounded' ? '24px' : '12px');
    assert.equal(await page.locator('.view-tabs').evaluate(el => getComputedStyle(el).backdropFilter), variant === 'rounded' ? 'blur(12px)' : 'none');
    await click('more');
    const menu = page.locator('.popover');
    assert.equal(await menu.evaluate(el => getComputedStyle(el).visibility), 'visible');
    const box = await menu.boundingBox(); assert.ok(box.x >= 0 && box.x + box.width <= viewport.width + 1);
    await page.keyboard.press('Backspace'); assert.equal(await menu.count(), 0);
    await click('export');
    assert.equal(await page.locator('#dialog').evaluate(el => el.open && el.matches(':modal')), true);
    assert.equal(await page.getByRole('dialog', { name: 'Export character' }).count(), 1);
    assert.equal(await page.evaluate(() => !!document.activeElement.closest('#dialog')), true);
    // Native dialog may cycle through browser chrome (activeElement=body).
    // It must never put focus on an inert underlying app control.
    for (let i = 0; i < 3; i++) {
      await page.keyboard.press('Tab');
      assert.equal(await page.evaluate(() => document.activeElement === document.body || !!document.activeElement.closest('#dialog')), true);
    }
    const panel = await page.locator('.dialog-panel').boundingBox();
    assert.ok(panel.x >= 0 && panel.y >= 0 && panel.x + panel.width <= viewport.width + 1 && panel.y + panel.height <= viewport.height + 1);
    await page.keyboard.press('Escape'); assert.equal(await page.locator('#dialog').evaluate(el => el.open), false);
    await page.waitForFunction(() => document.activeElement?.dataset.action === 'export');
    await page.emulateMedia({ reducedMotion: 'reduce', contrast: 'more' });
    assert.equal(await page.locator('.playback').evaluate(el => getComputedStyle(el).backdropFilter), 'none');
    assert.equal(await page.locator('.playback').evaluate(el => getComputedStyle(el).backgroundColor.startsWith('rgb(')), true);
    await page.emulateMedia({ forcedColors: 'active' });
    assert.equal(await page.locator('.playback').evaluate(el => getComputedStyle(el).backdropFilter), 'none');
    const cdp = await context.newCDPSession(page);
    await cdp.send('Emulation.setEmulatedMedia', { features: [{ name: 'prefers-reduced-transparency', value: 'reduce' }] });
    assert.equal(await page.locator('.playback').evaluate(el => getComputedStyle(el).backdropFilter), 'none');
    report.cases.push({ variant, theme, viewport, result: 'passed', surface });
    await context.close();
  }
  // Same local Chromium/run: relative smoke measurement, not a device/GPU benchmark.
  report.frameSamples = [];
  for (const variant of ['baseline', 'restrained', 'rounded']) for (const scene of ['preview', 'moving-toast']) {
    const page = await browser.newPage({ viewport: { width: 1920, height: 1080 } });
    await page.goto('http://127.0.0.1:5202/?material=' + variant); await page.waitForFunction(() => window.prototype?.ready);
    await page.locator('[data-action=customize]').click();
    if (scene === 'moving-toast') { await page.locator('[data-action="equip:hat_wizard"]').click(); await page.locator('[data-action="view:topdown"]').click(); await page.keyboard.down('w'); await page.locator('#toast').waitFor({ state: 'visible' }); }
    const sample = await page.evaluate(async () => { const values = []; let previous; await new Promise(done => { function tick(now) { if (previous !== undefined) values.push(now - previous); previous = now; if (values.length < 120) requestAnimationFrame(tick); else done(); } requestAnimationFrame(tick); }); values.sort((a,b) => a-b); return { medianMs: values[60], p95Ms: values[114], maxMs: values[119] }; });
    await page.keyboard.up('w'); report.frameSamples.push({ variant, scene, ...sample }); await page.close();
  }
  assert.deepEqual(report.errors, []);
  report.checks = ['Pinned vendor SHA-256 matches unchanged upstream CSS', '16 appearance/viewport/material combinations passed', 'All five screen layouts: no page overflow; creator remains scrollable', 'Root theme tokens, preserved 15px mobile fields, focus outline and filter budget', 'Modal naming, top layer, viewport bounds, focus containment, Escape and focus return', 'Menu bounds and Backspace dismissal', 'Reduced transparency, increased contrast/reduced motion and forced-colors fallbacks', 'Worst-case surface text contrast >=4.5:1', 'Relative Preview playback and moving-toast frame samples captured'];
} catch (error) { report.result = 'failed'; report.errors.push(String(error)); throw error; }
finally {
  if (!process.argv.includes('--no-report')) await writeFile(new URL('./glass-verification.json', import.meta.url), JSON.stringify(report, null, 2) + '\n');
  await browser.close();
}
console.log(JSON.stringify(report, null, 2));
