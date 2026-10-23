// New dependency/theme checks supplement the existing 12 unit / 18 browser checks.
import { chromium } from '../../../../app/node_modules/playwright/index.mjs';
import { writeFile, readFile } from 'node:fs/promises';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { createRequire } from 'node:module';
const pkg = JSON.parse(await readFile(new URL('../../../../app/node_modules/@shilo/bronze-ui/package.json', import.meta.url), 'utf8'));
const lock = JSON.parse(await readFile(new URL('../../../../app/package-lock.json', import.meta.url), 'utf8')).packages['node_modules/@shilo/bronze-ui'];
assert.equal(lock.version, pkg.version);
assert.equal(lock.resolved, 'https://github.com/Shilo/bronze-ui/releases/download/v0.1.0/shilo-bronze-ui-0.1.0.tgz');
const resolvePackage = createRequire(new URL('../../../../app/package.json', import.meta.url)).resolve;
const styleURLs = Object.fromEntries(['tokens.css', 'components.css'].map(entry => [entry, '/@fs/' + resolvePackage('@shilo/bronze-ui/' + entry).replaceAll('\\', '/') + '?raw']));
const styles = Object.fromEntries(await Promise.all(['tokens.css', 'components.css'].map(async entry => [entry, createHash('sha256').update(await readFile(resolvePackage('@shilo/bronze-ui/' + entry))).digest('hex')])));
const adapter = await readFile(new URL('./bronze-theme.css', import.meta.url), 'utf8');
assert.ok(adapter.includes("@import '@shilo/bronze-ui/tokens.css'"));
assert.ok(adapter.includes("@import '@shilo/bronze-ui/components.css'"));
assert.ok(!/#[\da-f]{3,8}\b|\brgba?\(/i.test(adapter), 'Consumer adapter has no copied UI colors');
const report = { date: new Date().toISOString(), node: process.version, package: { name: pkg.name, version: pkg.version, resolved: lock.resolved, integrity: lock.integrity, styles }, result: 'passed', cases: [], checks: [], errors: [], external: [] };
const browser = await chromium.launch({ headless: true });
const luminance = color => color.slice(0, 3).map(n => n / 255).map(n => n <= .04045 ? n / 12.92 : ((n + .055) / 1.055) ** 2.4).reduce((sum, n, i) => sum + n * [.2126, .7152, .0722][i], 0);
const contrast = (a, b) => (Math.max(luminance(a), luminance(b)) + .05) / (Math.min(luminance(a), luminance(b)) + .05);
const viewports = [{ width: 1920, height: 1080 }, { width: 450, height: 800 }, { width: 390, height: 844 }, { width: 844, height: 390 }];
try {
  for (const theme of ['obsidian', 'porcelain']) for (const viewport of viewports) {
    const context = await browser.newContext({ viewport });
    await context.route('**/*', route => { if (new URL(route.request().url()).hostname === '127.0.0.1') return route.continue(); report.external.push(route.request().url()); return route.abort(); });
    const page = await context.newPage(); page.on('pageerror', error => report.errors.push(error.message));
    const click = action => page.locator(`[data-action="${action}"]`).filter({ visible: true }).first().click();
    await page.goto('http://127.0.0.1:5202'); await page.waitForFunction(() => window.prototype?.ready);
    if (!report.package.servedStyles) {
      const served = await page.evaluate(async urls => Object.fromEntries(await Promise.all(Object.entries(urls).map(async ([name, url]) => [name, (await import(url)).default]))), styleURLs);
      report.package.servedStyles = Object.fromEntries(Object.entries(served).map(([name, css]) => [name, createHash('sha256').update(css).digest('hex')]));
      assert.deepEqual(report.package.servedStyles, styles, 'Fresh server serves the installed published package bytes');
    }
    if ((await page.evaluate(() => window.prototype.snapshot().state.theme)) !== theme) { await click('more'); await click('theme:' + theme); }
    assert.equal(await page.locator('html').getAttribute('data-theme'), theme === 'obsidian' ? 'dark' : 'light');
    assert.equal(await page.locator('body').getAttribute('data-theme'), theme);
    const nativeTheme = await page.locator('html').evaluate(el => { const style = getComputedStyle(el); return { scheme: style.colorScheme, scrollbar: style.scrollbarColor, track: style.getPropertyValue('--bu-scroll-track').trim() }; });
    assert.equal(nativeTheme.scheme, theme === 'obsidian' ? 'dark' : 'light');
    assert.equal(nativeTheme.track, 'transparent'); assert.notEqual(nativeTheme.scrollbar, 'auto');
    const tokens = await page.evaluate(() => {
      const style = getComputedStyle(document.documentElement), names = ['canvas', 'surface', 'text', 'muted', 'accent', 'on-accent', 'field', 'floating', 'border', 'focus'];
      return Object.fromEntries(names.map(name => [name, style.getPropertyValue('--bu-' + name).trim()]));
    });
    assert.ok(Object.values(tokens).every(Boolean), 'Package semantic roles resolve');
    const colors = await page.evaluate(() => {
      const canvas = document.createElement('canvas'); canvas.width = canvas.height = 1;
      const g = canvas.getContext('2d'), probe = document.createElement('span'); document.body.append(probe);
      const result = Object.fromEntries(['text', 'muted', 'accent', 'on-accent', 'field', 'floating'].map(role => {
        probe.style.color = `var(--bu-${role})`; g.clearRect(0, 0, 1, 1); g.fillStyle = getComputedStyle(probe).color; g.fillRect(0, 0, 1, 1);
        return [role, Array.from(g.getImageData(0, 0, 1, 1).data)];
      })); probe.remove(); return result;
    });
    const floating = colors.floating, alpha = floating[3] / 255;
    const contrastRatios = Object.fromEntries(['text', 'muted', 'accent'].map(role => [role, Math.min(...[0, 255].map(backdrop => contrast(colors[role], floating.slice(0, 3).map(n => n * alpha + backdrop * (1 - alpha)))))]));
    contrastRatios.primary = contrast(colors['on-accent'], colors.accent);
    assert.ok(Object.values(contrastRatios).every(ratio => ratio >= 4.5), 'Text contrasts with worst-case floating surfaces and primary buttons');
    assert.equal(await page.locator('html').evaluate(el => el.style.length), 0, 'No inline UI token copies');
    const resources = await page.evaluate(() => performance.getEntriesByType('resource').map(entry => entry.name));
    // Vite expands CSS @imports into the adapter response rather than separate requests.
    assert.ok(resources.some(name => name.includes('/bronze-theme.css')), 'Package consumer stylesheet loaded');
    const compiledCSS = await page.evaluate(() => [...document.styleSheets].flatMap(sheet => [...sheet.cssRules].map(rule => rule.cssText)).join('\n'));
    assert.ok(compiledCSS.includes('--bu-canvas:') && compiledCSS.includes('.bu-floating {'), 'Installed package tokens and recipes compiled into consumer stylesheet');
    assert.ok(resources.every(name => !name.includes('glasskit') && !name.includes('glass-theme')), 'No GlassKit runtime');
    assert.equal(await page.locator('.primary.bu-btn[data-variant=primary]').count(), viewport.width <= 760 ? 1 : 1);
    await click('create');
    assert.ok(await page.locator('.creator').evaluate(el => el.scrollWidth <= el.clientWidth + 1));
    for (const selector of ['[data-draft=name]', '[data-draft=details]', '[data-draft=size]', '[data-draft=camera]']) {
      assert.ok(await page.locator(selector).evaluate(el => el.classList.contains('bu-input')));
      assert.equal(await page.locator(selector).evaluate(el => getComputedStyle(el).backdropFilter), 'none');
      if (viewport.width === 450) assert.equal(await page.locator(selector).evaluate(el => getComputedStyle(el).fontSize), '16px');
    }
    await page.locator('[data-draft=name]').focus();
    assert.equal(await page.locator('[data-draft=name]').evaluate(el => getComputedStyle(el).outlineStyle), 'solid');
    await click('back'); await click('customize'); await click('play');
    for (const view of ['preview', 'topdown', 'side']) {
      await click('view:' + view);
      assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
      assert.equal(await page.locator('.wardrobe [aria-pressed=true]').first().isVisible(), true);
    }
    await click('view:preview');
    assert.equal(await page.locator('.playback').evaluate(el => getComputedStyle(el).backdropFilter), 'blur(12px)');
    assert.equal(await page.locator('.playback').evaluate(el => getComputedStyle(el).borderRadius), '12px');
    assert.equal(await page.locator('.view-tabs').evaluate(el => getComputedStyle(el).backdropFilter), 'none');
    await click('more'); const menu = await page.locator('.popover').boundingBox();
    assert.ok(menu.x >= 0 && menu.x + menu.width <= viewport.width + 1);
    await page.keyboard.press('Backspace'); assert.equal(await page.locator('.popover').count(), 0);
    await click('export');
    assert.equal(await page.getByRole('dialog', { name: 'Export character' }).count(), 1);
    assert.equal(await page.locator('#dialog').evaluate(el => el.open && el.matches(':modal')), true);
    assert.equal(await page.evaluate(() => !!document.activeElement.closest('#dialog')), true);
    for (let i = 0; i < 3; i++) { await page.keyboard.press('Tab'); assert.equal(await page.evaluate(() => document.activeElement === document.body || !!document.activeElement.closest('#dialog')), true); }
    const panel = await page.locator('.dialog-panel').boundingBox();
    assert.ok(panel.x >= 0 && panel.y >= 0 && panel.x + panel.width <= viewport.width + 1 && panel.y + panel.height <= viewport.height + 1);
    await page.keyboard.press('Escape'); await page.waitForFunction(() => document.activeElement?.dataset.action === 'export');
    await page.emulateMedia({ reducedMotion: 'reduce', contrast: 'no-preference', forcedColors: 'none' });
    assert.equal(await page.locator('html').evaluate(el => getComputedStyle(el).getPropertyValue('--bu-duration').trim()), '0ms');
    await page.emulateMedia({ reducedMotion: 'no-preference', contrast: 'more', forcedColors: 'none' });
    assert.equal(await page.locator('.playback').evaluate(el => getComputedStyle(el).backdropFilter), 'none');
    await page.emulateMedia({ reducedMotion: 'no-preference', contrast: 'no-preference', forcedColors: 'active' });
    assert.equal(await page.locator('.playback').evaluate(el => getComputedStyle(el).backdropFilter), 'none');
    await page.emulateMedia({ reducedMotion: 'no-preference', contrast: 'no-preference', forcedColors: 'none' });
    assert.equal(await page.locator('.playback').evaluate(el => getComputedStyle(el).backdropFilter), 'blur(12px)');
    const cdp = await context.newCDPSession(page);
    await cdp.send('Emulation.setEmulatedMedia', { features: [{ name: 'prefers-reduced-transparency', value: 'reduce' }] });
    assert.equal(await page.locator('.playback').evaluate(el => getComputedStyle(el).backdropFilter), 'none');
    report.cases.push({ theme, viewport, tokens, nativeTheme, contrastRatios, result: 'passed' }); await context.close();
  }
  assert.deepEqual(report.errors, []); assert.deepEqual(report.external, []);
  report.checks = ['Installed package token and recipe CSS loaded; no GlassKit runtime or inline palette', 'Eight theme/viewport combinations; all five screens retain responsive bounds', 'Text, muted text and accent >=4.5:1 over worst-case floating surfaces; primary label >=4.5:1', 'Native creator inputs/selects use package fields, visible focus, 16px creator text and no nested blur', 'One 12px playback blur; open navigation; package panel geometry', 'Menu bounds and Backspace; native named modal, focus containment, Escape and opener return', 'Independent reduced-motion duration and contrast/forced-color/reduced-transparency material fallbacks'];
} catch (error) { report.result = 'failed'; report.errors.push(String(error)); throw error; }
finally { await writeFile(new URL('./bronze-verification.json', import.meta.url), JSON.stringify(report, null, 2) + '\n'); await browser.close(); }
console.log(JSON.stringify({ result: report.result, package: report.package, cases: report.cases.length, checks: report.checks }, null, 2));
