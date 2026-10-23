// Shared exact-size evidence flow; historical PNGs and manifests remain unchanged.
import { chromium } from '../../../../app/node_modules/playwright/index.mjs';
import { mkdir, writeFile, readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import assert from 'node:assert/strict';
export async function captureEvidence({ phase, root, runtimeTheme, labels, supplements = false, protectExisting = false, provenance, sourceRoot = new URL('./', import.meta.url), extraRuntimeFiles = [] }) {
  assert.ok(['before', 'after'].includes(phase), 'Use before|after');
  if (protectExisting) {
    const exists = await readFile(new URL(phase + '.json', root)).then(() => true, error => { if (error.code === 'ENOENT') return false; throw error; });
    assert.ok(!exists, 'Refusing to overwrite preserved ' + phase + ' evidence: ' + root.href);
  }
  const entry = await readFile(new URL('./index.html', sourceRoot), 'utf8');
  assert.ok(entry.includes(runtimeTheme), 'Capture runtime must import ' + runtimeTheme);
  const base = process.env.PROTOTYPE_URL ?? 'http://127.0.0.1:5202';
  await mkdir(new URL(`${phase}/`, root), { recursive: true });
  const report = { phase, capturedAt: new Date().toISOString(), node: process.version, base, deviceScaleFactor: 1, devHotReloadDisabled: true, provenance, captureComplete: false, images: [], supplementalImages: [], errors: [], external: [] };
  const runtimeFiles = () => Promise.all([...new Set(['index.html', 'main.js', 'creator.js', 'ui.js', 'equipment.js', 'assets.js', 'world.js', 'config.js', 'theme.mjs', 'directions.mjs', 'input.mjs', 'motion.mjs', 'styles.css', 'creator.css', 'bronze-theme.css', 'bronze.mjs', 'stage-layout.mjs', runtimeTheme.replace(/^\.\//, ''), ...extraRuntimeFiles])].map(async file => ({ file, sha256: await readFile(new URL(file, sourceRoot)).then(data => createHash('sha256').update(data).digest('hex'), error => { if (error.code === 'ENOENT') return null; throw error; }) })));
  report.runtimeFiles = await runtimeFiles();
  const browser = await chromium.launch({ headless: true });
  report.browser = browser.version();
  try {
    for (const mobile of [false, true]) for (const theme of ['obsidian', 'porcelain']) {
      const viewport = { width: mobile ? 450 : 1920, height: mobile ? 800 : 1080 };
      const context = await browser.newContext({ viewport, deviceScaleFactor: 1, isMobile: mobile, hasTouch: mobile });
      await context.route('**/*', route => {
        const url = new URL(route.request().url());
        if (url.origin === base && url.pathname === '/@vite/client') return route.fulfill({ contentType: 'text/javascript', body: 'export {};' });
        if (url.origin === base) return route.continue();
        report.external.push(route.request().url()); return route.abort();
      });
      const page = await context.newPage(); page.on('pageerror', error => report.errors.push(error.message));
      await page.goto(base); await page.waitForFunction(() => window.prototype?.ready);
      const click = action => page.locator(`[data-action="${action}"]`).filter({ visible: true }).first().click();
      if ((await page.evaluate(() => window.prototype.snapshot().state.theme)) !== theme) { await click('more'); await click('theme:' + theme); }
      async function record(screen, supplemental = false) {
        await page.mouse.move(0, 0); await page.waitForTimeout(220);
        const file = `${theme}-${mobile ? 'mobile' : 'desktop'}-${screen}.png`;
        const shot = await page.screenshot(); await writeFile(new URL(`${phase}/${file}`, root), shot);
        const layout = await page.evaluate(() => Object.fromEntries(['header', '.identity', '.library', '.wardrobe', '.creator', '.draft-name', '.playback', '.view-tabs', '.popover', '.dialog-panel'].flatMap(selector => {
          const el = document.querySelector(selector); if (!el || !el.checkVisibility()) return [];
          const { x, y, width, height } = el.getBoundingClientRect(); return [[selector, { x, y, width, height }]];
        })));
        (supplemental ? report.supplementalImages : report.images).push({ file, screen, theme, viewport, layout, bytes: shot.length, sha256: createHash('sha256').update(shot).digest('hex') });
        if (phase === 'after' && !supplemental) {
          const before = await readFile(new URL(`before/${file}`, root));
          const pair = await page.evaluate(async ({ before, after, labels }) => {
            const images = await Promise.all([before, after].map(async data => { const image = new Image(); image.src = 'data:image/png;base64,' + data; await image.decode(); return image; }));
            const [w, h] = [images[0].width, images[0].height];
            if (images.some(image => image.width !== w || image.height !== h)) throw Error('Evidence dimensions differ');
            const canvas = document.createElement('canvas'); canvas.width = w * 2; canvas.height = h + 48;
            const g = canvas.getContext('2d'); g.fillStyle = '#111317'; g.fillRect(0, 0, canvas.width, canvas.height); g.fillStyle = '#f2eee6'; g.font = '20px Segoe UI';
            g.fillText(labels[0], 18, 31); g.fillText(labels[1], w + 18, 31);
            images.forEach((image, i) => g.drawImage(image, i * w, 48)); return canvas.toDataURL().split(',')[1];
          }, { before: before.toString('base64'), after: shot.toString('base64'), labels });
          await mkdir(new URL('pairs/', root), { recursive: true });
          await writeFile(new URL(`pairs/${file}`, root), Buffer.from(pair, 'base64'));
        }
      }
      await record('selection'); await click('create'); await record('creation');
      if (mobile) for (const [section, screen] of [[1, 'creation-size'], [2, 'creation-directions']]) { await page.locator('.creator').evaluate((el, i) => el.scrollTop = el.children[i].offsetTop, section); await record(screen); }
      await click('back'); await click('customize'); await click('play'); await record('preview');
      for (const panel of ['Colors', 'Moves', 'Outfits']) { const action = panel === 'Colors' && await page.locator('[data-action="panel:Colours"]').count() ? 'Colours' : panel; await click('panel:' + action); await record('panel-' + (panel === 'Colors' ? 'colours' : panel.toLowerCase())); }
      await click('panel:Wardrobe');
      for (const [action, screen] of [['more', 'menu-more'], ['characters', 'menu-characters'], ['description', 'menu-prompt'], ['slot:all', 'menu-parts']]) { await click(action); await record(screen); await page.keyboard.press('Escape'); }
      for (const [action, screen] of [['export', 'dialog-export'], ['animation-info', 'dialog-animation']]) { await click(action); await record(screen); await page.keyboard.press('Escape'); }
      await click('more'); await click('about'); await record('dialog-about'); await page.keyboard.press('Escape');
      await click('view:topdown'); await record('topdown');
      const originalHead = await page.evaluate(() => window.prototype.snapshot().equipped.head);
      await click('equip:hat_wizard'); await page.keyboard.down('w'); await page.waitForTimeout(180); await page.keyboard.up('w'); await record('toast'); await click('equip:' + originalHead);
      await click('view:side'); await record('side');
      if (supplements) {
        await click('view:preview');
        if (await page.locator('select[data-field="clip"]').evaluate(el => getComputedStyle(el).appearance === 'base-select')) {
          await page.locator('select[data-field="clip"]').click(); await record('preview-animation-select', true); await page.keyboard.press('Escape');
        }
        await click('back'); await click('create');
        report.nativeSelectStyles ??= [];
        report.nativeSelectStyles.push({ theme, viewport, ...(await page.locator('select[data-draft="kind"]').evaluate(el => {
          const read = node => { const s = getComputedStyle(node); return { colorScheme: s.colorScheme, color: s.color, background: s.backgroundColor, appearance: s.appearance }; };
          return { select: read(el), option: read(el.options[0]) };
        })) });
        if (report.nativeSelectStyles.at(-1).select.appearance === 'base-select') {
          await page.locator('select[data-draft="kind"]').click(); await record('creation-select', true); await page.keyboard.press('Escape');
        }
        await click('editor:Prompt'); await record('creation-prompt', true);
      }
      await context.close();
    }
    assert.deepEqual(report.errors, []); assert.deepEqual(report.external, []);
    if (phase === 'after') {
      const before = JSON.parse(await readFile(new URL('before.json', root), 'utf8'));
      assert.deepEqual(report.images.map(image => image.file), before.images.map(image => image.file));
      report.layoutDifferences = report.images.flatMap(image => {
        const previous = before.images.find(candidate => candidate.file === image.file);
        return Object.entries(image.layout).flatMap(([selector, box]) => Object.entries(box).flatMap(([property, value]) => {
          const old = previous.layout?.[selector]?.[property];
          return old !== undefined && Math.abs(value - old) > 1 ? [{ file: image.file, selector, property, before: old, after: value, delta: value - old }] : [];
        }));
      });
      const review = await browser.newPage();
      await mkdir(new URL('boards/', root), { recursive: true }); report.boards = [];
      for (const device of ['desktop', 'mobile']) for (const theme of ['obsidian', 'porcelain']) {
        const rows = await Promise.all(report.images.filter(image => image.theme === theme && image.file.includes('-' + device + '-')).map(async image => ({ screen: image.screen, images: await Promise.all(['before', 'after'].map(async version => (await readFile(new URL(`${version}/${image.file}`, root))).toString('base64'))) })));
        const board = await review.evaluate(async ({ rows, device, labels }) => {
          const w = device === 'desktop' ? 480 : 225, h = device === 'desktop' ? 270 : 400, cols = device === 'desktop' ? 2 : 3, label = 32;
          const canvas = document.createElement('canvas'); canvas.width = w * 2 * cols; canvas.height = Math.ceil(rows.length / cols) * (h + label);
          const g = canvas.getContext('2d'); g.fillStyle = '#111317'; g.fillRect(0, 0, canvas.width, canvas.height); g.fillStyle = '#f2eee6'; g.font = '15px Segoe UI';
          for (let index = 0; index < rows.length; index++) {
            const row = rows[index], x = index % cols * w * 2, y = Math.floor(index / cols) * (h + label);
            g.fillText(row.screen + ' · Before', x + 8, y + 22); g.fillText(labels[1], x + w + 8, y + 22);
            for (const [version, data] of row.images.entries()) { const image = new Image(); image.src = 'data:image/png;base64,' + data; await image.decode(); g.drawImage(image, x + version * w, y + label, w, h); }
          }
          return canvas.toDataURL().split(',')[1];
        }, { rows, device, labels });
        const file = `${theme}-${device}.png`; await writeFile(new URL(`boards/${file}`, root), Buffer.from(board, 'base64')); report.boards.push(file);
      }
      await review.close();
    }
    assert.deepEqual(await runtimeFiles(), report.runtimeFiles, 'Runtime sources changed during capture; recapture from a stable runtime.');
    report.captureComplete = true;
    report.completedAt = new Date().toISOString();
    if (supplements) report.nativePopupEvidence = { status: 'platform-native-not-captured', customizablePickerFrames: report.supplementalImages.filter(image => image.screen.endsWith('-select')).map(image => image.file), reason: 'A CSS base-select picker, when supported and active, is captured as supplemental browser-rendered evidence. OS-native popup rendering is outside ordinary page screenshot evidence; computed styles alone do not prove it. Validate a platform-native fallback manually on the affected browser/OS.' };
  } catch (error) { report.captureError = error.message; throw error; } finally { await browser.close(); await writeFile(new URL(`${phase}.json`, root), JSON.stringify(report, null, 2) + '\n'); }
  console.log(`Captured ${report.images.length} ${phase} images at matching 1920×1080 / 450×800 resolutions; no external requests.`);

}
