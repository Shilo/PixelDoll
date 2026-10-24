// Read-only viewport × theme × screen capture with layout metrics (loopback prototype only).
import { chromium, webkit } from '../../../../app/node_modules/playwright/index.mjs';
import { mkdirSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
const base = process.env.PROTOTYPE_URL ?? 'http://127.0.0.1:5202/';
const engineName = process.env.BROWSER === 'webkit' ? 'webkit' : 'chromium';
const out = new URL(`../evidence/matrix-${engineName}/`, import.meta.url); mkdirSync(out, { recursive: true });
const sizes = (process.env.SIZES ?? '320x500,390x844,450x800,568x320,844x390,768x1024,1024x768,1280x720,1366x768,1469x889,1920x1080,2560x1440').split(',').map(s => s.split('x').map(Number));
const screens = (process.env.SCREENS ?? 'selection,preview,topdown,side,creation').split(',');
const browser = await (engineName === 'webkit' ? webkit : chromium).launch();
const results = [];
const metrics = () => {
  const vis = el => el.checkVisibility({ opacityProperty: true, visibilityProperty: true });
  const controls = [...document.querySelectorAll('#ui button, #ui a, #ui input, #ui select, #ui textarea')].filter(vis);
  const small = controls.map(el => { const r = el.getBoundingClientRect(); return { label: (el.getAttribute('aria-label') || el.textContent || el.dataset.action || el.tagName).trim().slice(0, 30), w: Math.round(r.width), h: Math.round(r.height) }; }).filter(c => c.w < 24 || c.h < 24);
  const offscreen = controls.filter(el => { const r = el.getBoundingClientRect(); return r.right > innerWidth + 1 || r.bottom > innerHeight + 1 || r.left < -1 || r.top < -1; })
    .filter(el => !el.closest('.wardrobe-scroll,.creator,.library,.character-list,.popover'))
    .map(el => (el.getAttribute('aria-label') || el.textContent || el.dataset.action).trim().slice(0, 30));
  const actor = window.prototype.snapshot().actorBounds;
  const s = window.prototype.snapshot().state;
  let overlap = [];
  if (actor && s.screen === 'studio') overlap = controls.filter(el => { const r = el.getBoundingClientRect(); return r.left < actor.x + actor.w && r.right > actor.x && r.top < actor.y + actor.h && r.bottom > actor.y; }).map(el => (el.getAttribute('aria-label') || el.textContent).trim().slice(0, 24));
  const clipped = [...document.querySelectorAll('#ui button span, #ui button, #ui h1, #ui h2, #ui label')].filter(vis).filter(el => el.scrollWidth > el.clientWidth + 1 && getComputedStyle(el).overflow !== 'visible').map(el => el.textContent.trim().slice(0, 30));
  return { hScroll: document.documentElement.scrollWidth > innerWidth, small, offscreen, overlapActor: overlap, clipped: [...new Set(clipped)].slice(0, 8) };
};
for (const theme of ['obsidian', 'porcelain']) for (const [w, h] of sizes) {
  const ctx = await browser.newContext({ viewport: { width: w, height: h }, hasTouch: w < 900, isMobile: false });
  const page = await ctx.newPage();
  await page.goto(base); await page.evaluate(t => localStorage.setItem('bronze-prototype-theme', t), theme); await page.goto(base);
  await page.waitForFunction(() => window.prototype?.ready); await page.waitForTimeout(300);
  for (const screen of screens) {
    const name = `${theme}-${w}x${h}-${screen}`;
    try {
      await page.evaluate(() => { document.querySelector('[data-action=back]')?.click(); });
      if (screen === 'creation') await page.evaluate(() => document.querySelector('[data-action=create]').click());
      if (['preview', 'topdown', 'side'].includes(screen)) await page.evaluate(() => document.querySelector('[data-action=customize]').click());
      if (screen === 'topdown' || screen === 'side') await page.evaluate(v => document.querySelector(`[data-action="view:${v}"]`).click(), screen);
      await page.waitForTimeout(450);
      await page.screenshot({ path: fileURLToPath(new URL(name + '.png', out)) });
      results.push({ name, ...(await page.evaluate(metrics)) });
    } catch (e) { results.push({ name, error: e.message.split('\n')[0] }); }
  }
  await ctx.close();
}
writeFileSync(new URL('metrics.json', out), JSON.stringify(results, null, 1));
for (const r of results) { const flags = []; if (r.error) flags.push('ERROR ' + r.error); if (r.hScroll) flags.push('hScroll'); if (r.offscreen?.length) flags.push('offscreen:' + r.offscreen.join('|')); if (r.overlapActor?.length) flags.push('overlapActor:' + r.overlapActor.join('|')); if (r.clipped?.length) flags.push('clipped:' + r.clipped.join('|')); if (r.small?.length) flags.push('small:' + r.small.map(s => `${s.label}(${s.w}x${s.h})`).join('|')); console.log(r.name, flags.join('  ')); }
await browser.close();
