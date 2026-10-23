// Fixed-resolution evidence for the unchanged baseline and two material studies.
import { chromium } from '../../../../app/node_modules/playwright/index.mjs';
import { mkdir, writeFile, readFile } from 'node:fs/promises';
if (!(await readFile(new URL('./index.html', import.meta.url), 'utf8')).includes('./glass-theme.css')) throw Error('Historical GlassKit capture: restore the earlier runtime revision before running. Existing comparison evidence must not be overwritten with Bronze UI captures.');
const variant = process.argv[2] ?? 'restrained';
if (!['baseline', 'restrained', 'rounded'].includes(variant)) throw Error('Unknown material');
const root = new URL('./evidence/glass/', import.meta.url);
await mkdir(root, { recursive: true });
const browser = await chromium.launch({ headless: true });
try {
  for (const mobile of [false, true]) for (const theme of ['obsidian', 'porcelain']) {
    const context = await browser.newContext({ viewport: { width: mobile ? 450 : 1920, height: mobile ? 800 : 1080 }, deviceScaleFactor: 1, isMobile: mobile, hasTouch: mobile });
    const page = await context.newPage();
    await page.goto('http://127.0.0.1:5202/?material=' + variant);
    await page.waitForFunction(() => window.prototype?.ready);
    const click = action => page.locator(`[data-action="${action}"]`).filter({ visible: true }).first().click();
    if ((await page.evaluate(() => window.prototype.snapshot().state.theme)) !== theme) { await click('more'); await click('theme:' + theme); }
    const rows = [];
    async function record(screen) {
      await page.mouse.move(0, 0); await page.waitForTimeout(220);
      const name = `${theme}-${mobile ? 'mobile' : 'desktop'}-${screen}`;
      const shot = await page.screenshot(); await writeFile(new URL(`${name}-${variant}.png`, root), shot);
      rows.push({ screen, name, shot: shot.toString('base64') });
    }
    await record('selection');
    await click('create'); await record('creation');
    if (mobile) { await page.locator('.creator').evaluate(el => el.scrollTop = el.children[2].offsetTop); await record('creation-directions'); }
    await click('back'); await click('customize'); await click('play'); await record('preview');
    await click('more'); await record('menu'); await page.keyboard.press('Escape');
    await click('export'); await record('dialog'); await page.keyboard.press('Escape');
    await click('view:topdown'); await record('topdown');
    const originalHead = await page.evaluate(() => window.prototype.snapshot().equipped.head);
    await click('equip:hat_wizard'); await page.keyboard.down('w'); await page.waitForTimeout(180); await page.keyboard.up('w'); await record('toast');
    await click('equip:' + originalHead);
    await click('view:side'); await record('side');
    if (variant !== 'baseline') {
      const review = await context.newPage(); await review.setContent('<canvas></canvas>');
      for (const row of rows) {
        const baseline = (await readFile(new URL(`${row.name}-baseline.png`, root))).toString('base64');
        const pair = await review.evaluate(async ({ baseline, after, variant }) => {
          const images = await Promise.all([baseline, after].map(async data => { const im = new Image(); im.src = 'data:image/png;base64,' + data; await im.decode(); return im; }));
          const [w, h] = [images[0].width, images[0].height];
          if (images.some(im => im.width !== w || im.height !== h)) throw Error('Mismatched dimensions');
          const canvas = document.querySelector('canvas'); canvas.width = w * 2; canvas.height = h + 48;
          const g = canvas.getContext('2d'); g.fillStyle = '#111317'; g.fillRect(0, 0, canvas.width, canvas.height);
          g.fillStyle = '#f2eee6'; g.font = '20px Segoe UI'; g.fillText('Before · Bronze', 18, 31); g.fillText('After · ' + variant, w + 18, 31);
          images.forEach((im, i) => g.drawImage(im, i * w, 48)); return canvas.toDataURL().split(',')[1];
        }, { baseline, after: row.shot, variant });
        await writeFile(new URL(`${row.name}-${variant}-pair.png`, root), Buffer.from(pair, 'base64'));
      }
    }
    await context.close();
  }
} finally { await browser.close(); }
console.log('Captured ' + variant + ': all five screens plus menu, dialog, toast and mobile creator detail.');
