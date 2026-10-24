// Read-only gameplay/rendering probe: frame pacing, motion, DPR pixel integrity, theme flash.
import { chromium } from '../../../../app/node_modules/playwright/index.mjs';
import { mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
const base = process.env.PROTOTYPE_URL ?? 'http://127.0.0.1:5202/';
const dir = fileURLToPath(new URL('../evidence/gameplay/', import.meta.url));
mkdirSync(dir, { recursive: true });
const out = name => dir + name;
const browser = await chromium.launch();
const log = {};
const open = async (opts = {}) => {
  const ctx = await browser.newContext({ viewport: { width: 1366, height: 768 }, ...opts });
  const page = await ctx.newPage();
  await page.goto(base);
  await page.waitForFunction(() => window.prototype?.ready);
  return { ctx, page };
};
const snap = page => page.evaluate(() => {
  const s = window.prototype.snapshot(), toast = document.querySelector('#toast');
  return { pos: s.position, cam: s.camera, dir: s.resolved.dir, clip: s.resolved.clip, still: s.resolved.still, hidden: s.hiddenItems, velocity: s.velocity, toast: toast.hidden ? null : toast.textContent, note: document.querySelector('#coverage-note')?.textContent || null };
});

// 1. Frame pacing and motion in Top-down; equipment coverage; Side-scroller constraints.
{
  const { ctx, page } = await open();
  await page.click('[data-action=customize]');
  await page.click('[data-action="view:topdown"]');
  await page.waitForTimeout(300);
  log.enterTopdown = await snap(page);
  await page.evaluate(() => { window.__f = []; const f = t => { window.__f.push(t); if (window.__f.length < 240) requestAnimationFrame(f); }; requestAnimationFrame(f); });
  await page.keyboard.down('d'); await page.keyboard.down('w');
  const moving = [];
  for (let i = 0; i < 4; i++) { await page.waitForTimeout(500); await page.screenshot({ path: out(`topdown-moving-${i}.png`) }); moving.push(await snap(page)); }
  await page.keyboard.up('w'); await page.keyboard.up('d');
  await page.waitForTimeout(400);
  log.topdownMoving = moving;
  log.topdownStopped = await snap(page);
  log.frames = await page.evaluate(() => { const d = window.__f.slice(1).map((t, i) => t - window.__f[i]).sort((a, b) => a - b); return { n: d.length, p50: d[d.length >> 1], p95: d[Math.floor(d.length * .95)], max: d.at(-1) }; });
  await page.evaluate(() => document.querySelector('[data-action=characters]').click());
  await page.evaluate(() => document.querySelector('.character-popover [data-action="character:1"]').click());
  await page.click('[data-action="view:topdown"]');
  await page.keyboard.down('w'); await page.waitForTimeout(700);
  log.hatNorth = await snap(page);
  await page.screenshot({ path: out('topdown-north-hat-hidden.png') });
  await page.keyboard.up('w'); await page.keyboard.down('s'); await page.waitForTimeout(500);
  log.hatSouth = await snap(page);
  await page.keyboard.up('s');
  await page.click('[data-action="view:side"]');
  await page.keyboard.down('w'); await page.waitForTimeout(400);
  log.sideUpOnly = await snap(page);
  await page.keyboard.up('w');
  await page.keyboard.down('a'); await page.waitForTimeout(800);
  await page.screenshot({ path: out('side-moving-west.png') });
  log.sideWest = await snap(page);
  await page.keyboard.up('a');
  await ctx.close();
}

// 2. Pointer joystick: release outside the world; drag starting on UI must not move.
{
  const { ctx, page } = await open();
  await page.click('[data-action=customize]');
  await page.click('[data-action="view:topdown"]');
  await page.waitForTimeout(300);
  await page.mouse.move(300, 500); await page.mouse.down(); await page.mouse.move(380, 440, { steps: 5 });
  await page.waitForTimeout(500);
  const dragging = await snap(page);
  await page.screenshot({ path: out('joystick-drag.png') });
  await page.mouse.move(1300, 300, { steps: 5 }); await page.mouse.up(); await page.waitForTimeout(200);
  const released = await snap(page);
  await page.mouse.move(1150, 470); await page.mouse.down(); await page.mouse.move(900, 470, { steps: 5 });
  await page.waitForTimeout(300); await page.mouse.up();
  const afterUiDrag = await snap(page);
  log.joystick = { draggingVelocity: dragging.velocity, releasedVelocity: released.velocity, uiDragMoved: released.pos.x !== afterUiDrag.pos.x || released.pos.y !== afterUiDrag.pos.y };
  await ctx.close();
}

// 3. DPR pixel integrity: crop the actor at several device scale factors.
for (const dsf of [1, 1.25, 1.5, 2]) {
  const { ctx, page } = await open({ deviceScaleFactor: dsf });
  await page.click('[data-action=customize]');
  await page.click('[data-action=play]');
  await page.waitForTimeout(300);
  const b = await page.evaluate(() => window.prototype.snapshot().actorBounds);
  await page.screenshot({ path: out(`actor-dpr-${dsf}.png`), clip: { x: b.x + b.w * .3, y: b.y + b.h * .12, width: b.w * .4, height: b.h * .3 } });
  log['dpr' + dsf] = { cssScale: b.w / 64, devicePxPerSourcePx: b.w / 64 * dsf, xDevice: b.x * dsf, yDevice: b.y * dsf };
  await ctx.close();
}

// 4. Theme first paint: stored light mode, delay main.js and capture before it runs.
{
  const ctx = await browser.newContext({ viewport: { width: 1366, height: 768 } });
  const page = await ctx.newPage();
  await page.goto(base);
  await page.evaluate(() => localStorage.setItem('bronze-prototype-theme', 'porcelain'));
  await page.route('**/main.js*', async route => { await new Promise(r => setTimeout(r, 1500)); await route.continue(); });
  page.goto(base).catch(() => {});
  await page.waitForTimeout(900);
  await page.screenshot({ path: out('theme-first-paint-light-stored.png') });
  log.firstPaintWithLightStored = await page.evaluate(() => ({ htmlTheme: document.documentElement.dataset.theme, bodyBg: getComputedStyle(document.body).backgroundColor }));
  await ctx.close();
}

// 5. Reduced motion preference: does the prototype react?
{
  const { ctx, page } = await open({ reducedMotion: 'reduce' });
  await page.click('[data-action=customize]');
  await page.waitForTimeout(600);
  log.reducedMotion = await page.evaluate(() => ({ playing: window.prototype.snapshot().state.playing }));
  await ctx.close();
}
console.log(JSON.stringify(log, null, 1));
await browser.close();
