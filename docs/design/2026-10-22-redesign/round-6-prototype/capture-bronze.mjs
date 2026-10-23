// Exact-size browser evidence. Run BEFORE changing the approved prototype, then AFTER.
import { chromium } from '../../../../app/node_modules/playwright/index.mjs';
import { mkdir, writeFile, readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import assert from 'node:assert/strict';
const phase = process.argv[2];
assert.ok(['before', 'after'].includes(phase), 'Use capture-bronze.mjs before|after');
const entry = await readFile(new URL('./index.html', import.meta.url), 'utf8');
assert.ok(entry.includes(phase === 'before' ? './glass-theme.css' : './bronze-theme.css'), `The ${phase} capture must run against the matching runtime revision; existing provenance must not be overwritten from a different runtime.`);
const base = process.env.PROTOTYPE_URL ?? 'http://127.0.0.1:5202';
const root = new URL('./evidence/bronze-dependency/', import.meta.url);
await mkdir(new URL(`${phase}/`, root), { recursive: true });
const report = { phase, capturedAt: new Date().toISOString(), node: process.version, base, deviceScaleFactor: 1, images: [], errors: [], external: [] };
const browser = await chromium.launch({ headless: true });
try {
  for (const mobile of [false, true]) for (const theme of ['obsidian', 'porcelain']) {
    const viewport = { width: mobile ? 450 : 1920, height: mobile ? 800 : 1080 };
    const context = await browser.newContext({ viewport, deviceScaleFactor: 1, isMobile: mobile, hasTouch: mobile });
    await context.route('**/*', route => {
      if (new URL(route.request().url()).origin === base) return route.continue();
      report.external.push(route.request().url()); return route.abort();
    });
    const page = await context.newPage(); page.on('pageerror', error => report.errors.push(error.message));
    await page.goto(base); await page.waitForFunction(() => window.prototype?.ready);
    const click = action => page.locator(`[data-action="${action}"]`).filter({ visible: true }).first().click();
    if ((await page.evaluate(() => window.prototype.snapshot().state.theme)) !== theme) { await click('more'); await click('theme:' + theme); }
    async function record(screen) {
      await page.mouse.move(0, 0); await page.waitForTimeout(220);
      const file = `${theme}-${mobile ? 'mobile' : 'desktop'}-${screen}.png`;
      const shot = await page.screenshot(); await writeFile(new URL(`${phase}/${file}`, root), shot);
      const layout = await page.evaluate(() => Object.fromEntries(['header', '.identity', '.library', '.wardrobe', '.creator', '.draft-name', '.playback', '.view-tabs', '.popover', '.dialog-panel'].flatMap(selector => {
        const el = document.querySelector(selector); if (!el || !el.checkVisibility()) return [];
        const { x, y, width, height } = el.getBoundingClientRect(); return [[selector, { x, y, width, height }]];
      })));
      report.images.push({ file, screen, theme, viewport, layout, bytes: shot.length, sha256: createHash('sha256').update(shot).digest('hex') });
      if (phase === 'after') {
        const before = await readFile(new URL(`before/${file}`, root));
        const pair = await page.evaluate(async ({ before, after }) => {
          const images = await Promise.all([before, after].map(async data => { const image = new Image(); image.src = 'data:image/png;base64,' + data; await image.decode(); return image; }));
          const [w, h] = [images[0].width, images[0].height];
          if (images.some(image => image.width !== w || image.height !== h)) throw Error('Evidence dimensions differ');
          const canvas = document.createElement('canvas'); canvas.width = w * 2; canvas.height = h + 48;
          const g = canvas.getContext('2d'); g.fillStyle = '#111317'; g.fillRect(0, 0, canvas.width, canvas.height); g.fillStyle = '#f2eee6'; g.font = '20px Segoe UI';
          g.fillText('Before · approved GlassKit prototype', 18, 31); g.fillText('After · @shilo/bronze-ui', w + 18, 31);
          images.forEach((image, i) => g.drawImage(image, i * w, 48)); return canvas.toDataURL().split(',')[1];
        }, { before: before.toString('base64'), after: shot.toString('base64') });
        await mkdir(new URL('pairs/', root), { recursive: true });
        await writeFile(new URL(`pairs/${file}`, root), Buffer.from(pair, 'base64'));
      }
    }
    await record('selection'); await click('create'); await record('creation');
    if (mobile) for (const [section, screen] of [[1, 'creation-size'], [2, 'creation-directions']]) { await page.locator('.creator').evaluate((el, i) => el.scrollTop = el.children[i].offsetTop, section); await record(screen); }
    await click('back'); await click('customize'); await click('play'); await record('preview');
    for (const panel of ['Colours', 'Moves', 'Outfits']) { await click('panel:' + panel); await record('panel-' + panel.toLowerCase()); }
    await click('panel:Wardrobe');
    for (const [action, screen] of [['more', 'menu-more'], ['characters', 'menu-characters'], ['description', 'menu-prompt'], ['slot:all', 'menu-parts']]) { await click(action); await record(screen); await page.keyboard.press('Escape'); }
    for (const [action, screen] of [['export', 'dialog-export'], ['animation-info', 'dialog-animation']]) { await click(action); await record(screen); await page.keyboard.press('Escape'); }
    await click('more'); await click('about'); await record('dialog-about'); await page.keyboard.press('Escape');
    await click('view:topdown'); await record('topdown');
    const originalHead = await page.evaluate(() => window.prototype.snapshot().equipped.head);
    await click('equip:hat_wizard'); await page.keyboard.down('w'); await page.waitForTimeout(180); await page.keyboard.up('w'); await record('toast'); await click('equip:' + originalHead);
    await click('view:side'); await record('side');
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
      const board = await review.evaluate(async ({ rows, device }) => {
        const w = device === 'desktop' ? 480 : 225, h = device === 'desktop' ? 270 : 400, cols = device === 'desktop' ? 2 : 3, label = 32;
        const canvas = document.createElement('canvas'); canvas.width = w * 2 * cols; canvas.height = Math.ceil(rows.length / cols) * (h + label);
        const g = canvas.getContext('2d'); g.fillStyle = '#111317'; g.fillRect(0, 0, canvas.width, canvas.height); g.fillStyle = '#f2eee6'; g.font = '15px Segoe UI';
        for (let index = 0; index < rows.length; index++) {
          const row = rows[index], x = index % cols * w * 2, y = Math.floor(index / cols) * (h + label);
          g.fillText(row.screen + ' · Before', x + 8, y + 22); g.fillText('After · Bronze UI', x + w + 8, y + 22);
          for (const [version, data] of row.images.entries()) { const image = new Image(); image.src = 'data:image/png;base64,' + data; await image.decode(); g.drawImage(image, x + version * w, y + label, w, h); }
        }
        return canvas.toDataURL().split(',')[1];
      }, { rows, device });
      const file = `${theme}-${device}.png`; await writeFile(new URL(`boards/${file}`, root), Buffer.from(board, 'base64')); report.boards.push(file);
    }
    await review.close();
  }
} finally { await browser.close(); await writeFile(new URL(`${phase}.json`, root), JSON.stringify(report, null, 2) + '\n'); }
console.log(`Captured ${report.images.length} ${phase} images at matching 1920×1080 / 450×800 resolutions; no external requests.`);
