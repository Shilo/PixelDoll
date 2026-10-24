// Read-only: forced colours, prefers-contrast and 200% zoom (deviceScaleFactor-independent CSS zoom emulation).
import { chromium } from '../../../../app/node_modules/playwright/index.mjs';
import { fileURLToPath } from 'node:url';
import { mkdirSync } from 'node:fs';
const base = process.env.PROTOTYPE_URL ?? 'http://127.0.0.1:5202/';
const dir = fileURLToPath(new URL('../evidence/modes/', import.meta.url));
mkdirSync(dir, { recursive: true });
const browser = await chromium.launch();
const out = {};
for (const [name, opts] of [['forced', { forcedColors: 'active' }], ['contrast-more', { contrast: 'more' }]]) {
  const ctx = await browser.newContext({ viewport: { width: 1366, height: 768 }, ...opts });
  const page = await ctx.newPage();
  await page.goto(base); await page.waitForFunction(() => window.prototype?.ready);
  await page.screenshot({ path: `${dir}${name}-selection.png` });
  await page.click('[data-action=customize]'); await page.waitForTimeout(300);
  await page.screenshot({ path: `${dir}${name}-preview.png` });
  out[name] = await page.evaluate(() => {
    const pressed = document.querySelector('.item[aria-pressed=true]'), idle = document.querySelector('.item[aria-pressed=false]');
    const s = el => { const c = getComputedStyle(el); return { border: c.borderColor + ' ' + c.borderWidth, bg: c.backgroundColor, color: c.color }; };
    return { pressedTile: s(pressed), idleTile: s(idle), viewTabSelected: s(document.querySelector('.view-tabs [aria-pressed=true]')), viewTabIdle: s(document.querySelector('.view-tabs [aria-pressed=false]')) };
  });
  await page.click('header [data-action=back]'); await page.click('header [data-action=create]'); await page.waitForTimeout(300);
  await page.screenshot({ path: `${dir}${name}-creation.png` });
  await ctx.close();
}
// 200% browser zoom on a 1366x768 window is a 683x384 CSS viewport at DPR 2.
{
  const ctx = await browser.newContext({ viewport: { width: 683, height: 384 }, deviceScaleFactor: 2 });
  const page = await ctx.newPage();
  await page.goto(base); await page.waitForFunction(() => window.prototype?.ready);
  for (const [screen, setup] of [['selection', async () => {}], ['preview', async () => page.click('[data-action=customize]')], ['creation', async () => { await page.click('header [data-action=back]'); await page.evaluate(() => document.querySelector('[data-action=create]').click()); }]]) {
    await setup(); await page.waitForTimeout(400);
    await page.screenshot({ path: `${dir}zoom200-${screen}.png` });
  }
  await ctx.close();
}
console.log(JSON.stringify(out, null, 1));
await browser.close();
