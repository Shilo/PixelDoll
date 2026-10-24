// Offline concept verification; no application code or PixelLab requests.
import { chromium } from '../../app/node_modules/@playwright/test/index.mjs';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import assert from 'node:assert/strict';

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1100, height: 850 }, colorScheme: 'dark' });
const errors = [], paidRequests = [], checks = [];
page.on('pageerror', e => errors.push(e.message));
page.on('request', r => { if (/pixellab\.ai/i.test(r.url())) paidRequests.push(r.url()); });
await page.goto(process.env.MOCKUP_URL ?? 'http://127.0.0.1:5275/');
const frame = page.frameLocator('iframe');
const workspace = frame.locator('[data-workspace]');
const canvas = workspace.locator('.pd-stage canvas');
await frame.locator('.pd-timeline canvas').first().waitFor();
await canvas.evaluate(async c => {
  const started = performance.now();
  while (!c.getContext('2d').getImageData(0, 0, 384, 384).data.some(x => x)) {
    if (performance.now() - started > 5000) throw new Error('Stored artwork did not render');
    await new Promise(resolve => requestAnimationFrame(resolve));
  }
});
const pixels = () => canvas.evaluate(c => c.toDataURL());
const original = await pixels();
await workspace.getByRole('button', { name: 'Move sword right', exact: true }).click();
assert.equal(await workspace.locator('[data-x]').textContent(), '1');
assert.ok(await pixels() !== original, 'Nudge must change raster');
await workspace.getByRole('button', { name: 'Select frame 5', exact: true }).click();
assert.equal(await workspace.locator('[data-x]').textContent(), '0');
await workspace.getByRole('button', { name: 'Select frame 4', exact: true }).click();
await workspace.getByRole('button', { name: 'Undo', exact: true }).click();
assert.equal(await pixels(), original);
checks.push('One-frame nudge changes selected raster; another cell stays unedited; undo restores original pixels');

await workspace.getByRole('button', { name: 'Joints', exact: true }).click();
const wrist = workspace.locator('.pd-hand');
await wrist.focus();
await wrist.press('ArrowRight');
assert.equal(await wrist.getAttribute('aria-valuenow'), '24');
assert.equal(await pixels(), original);
assert.equal(await workspace.locator('[data-action=request]').isVisible(), false);
await workspace.getByLabel('Joint editing purpose').selectOption('target');
assert.equal(await wrist.getAttribute('aria-valuenow'), '23');
assert.equal(await workspace.locator('[data-action=request]').isVisible(), true);
await workspace.getByRole('button', { name: 'Preview regeneration request' }).click();
assert.equal(await workspace.getByRole('dialog').isVisible(), true);
await page.keyboard.press('Escape');
assert.equal(await workspace.getByRole('dialog').isVisible(), false);
checks.push('Detection and desired-pose drafts are separate; keyboard joint edit leaves raster identical; request is a local preview');

const wb = await wrist.boundingBox();
await page.mouse.move(wb.x + wb.width / 2, wb.y + wb.height / 2);
await page.mouse.down();
await page.mouse.move(wb.x + wb.width / 2 + 18, wb.y + wb.height / 2 - 12);
await page.mouse.up();
assert.notEqual(await wrist.getAttribute('aria-valuenow'), '23');
assert.equal(await pixels(), original);
checks.push('Pointer dragging moves a guide without moving artwork');
await mkdir(new URL('./mockup-previews/', import.meta.url), { recursive: true });
await page.screenshot({ path: new URL('./mockup-previews/joints-desktop-dark.png', import.meta.url).pathname.replace(/^\/(.:)/, '$1'), fullPage: true });

await workspace.getByRole('button', { name: 'Pixels', exact: true }).click();
const sword = await readFile(new URL('../../app/public/fixtures/s2/layers/main_hand/sword_steel/main/walk.png', import.meta.url));
const pixel = await canvas.evaluate(async (_c, src) => {
  const im = new Image();
  await new Promise((resolve, reject) => { im.onload = resolve; im.onerror = reject; im.src = src; });
  const c = document.createElement('canvas'); c.width = c.height = 64;
  c.getContext('2d').drawImage(im, 3 * 64, 0, 64, 64, 0, 0, 64, 64);
  const d = c.getContext('2d').getImageData(0, 0, 64, 64).data;
  for (let y = 0; y < 64; y++) for (let x = 0; x < 64; x++) if (d[(y * 64 + x) * 4 + 3]) return { x, y };
  throw new Error('No sword pixel found');
}, 'data:image/png;base64,' + sword.toString('base64'));
const cb = await canvas.boundingBox();
await canvas.click({ position: { x: (pixel.x + .5) / 64 * cb.width, y: (pixel.y + .5) / 64 * cb.height } });
assert.ok(await pixels() !== original, 'Eraser must change selected sword pixel');
await workspace.getByRole('button', { name: 'Undo', exact: true }).click();
assert.equal(await pixels(), original);
checks.push('Eraser changes sword pixel and undo restores exact canvas');

await workspace.getByRole('button', { name: 'Align item', exact: true }).click();
await workspace.locator('[data-action=scope]').selectOption('clip');
await workspace.getByRole('button', { name: 'Move sword left', exact: true }).click();
for (const n of [1, 8]) {
  await workspace.getByRole('button', { name: `Select frame ${n}`, exact: true }).click();
  assert.equal(await workspace.locator('[data-x]').textContent(), '-1');
}
await workspace.getByRole('button', { name: 'Undo', exact: true }).click();
await workspace.locator('[data-action=scope]').selectOption('frame');
await workspace.getByRole('button', { name: 'Select frame 4', exact: true }).click();
checks.push('Explicit clip-scope position edit updates all selected frames in one undo step');

await page.screenshot({ path: new URL('./mockup-previews/repair-desktop-dark.png', import.meta.url).pathname.replace(/^\/(.:)/, '$1'), fullPage: true });
for (const width of [390, 320]) {
  await page.setViewportSize({ width, height: 900 });
  await page.emulateMedia({ colorScheme: 'light' });
  const overflow = await frame.locator('#pd-repair-review').evaluate(el => el.scrollWidth > el.clientWidth + 1);
  assert.equal(overflow, false, `Horizontal overflow at ${width}`);
  const apply = await workspace.locator('[data-action=apply]').boundingBox();
  assert.ok(apply.width > 100 && apply.height >= 44);
  await page.screenshot({ path: new URL(`./mockup-previews/repair-mobile-${width}-light.png`, import.meta.url).pathname.replace(/^\/(.:)/, '$1'), fullPage: true });
}
checks.push('320px and 390px light layouts have no root horizontal overflow and expose touch-size apply controls');

await page.setViewportSize({ width: 1100, height: 850 });
await page.emulateMedia({ colorScheme: 'dark' });
await frame.getByRole('button', { name: /Next/ }).click();
const guided = frame.locator('[data-guided]');
assert.equal(await guided.isVisible(), true);
await guided.getByRole('button', { name: 'Move sword right', exact: true }).click();
assert.match(await guided.locator('.pd-compare-state').textContent(), /1, 0/);
await guided.getByRole('button', { name: /Joint guide is wrong/ }).click();
assert.match(await guided.locator('[data-guide-description]').textContent(), /Existing pixels stay unchanged/);
await page.screenshot({ path: new URL('./mockup-previews/guided-desktop-dark.png', import.meta.url).pathname.replace(/^\/(.:)/, '$1'), fullPage: true });
checks.push('Guided alternative switches problem type and offers working local position adjustment');
assert.deepEqual(errors, []);
assert.deepEqual(paidRequests, []);
const result = { date: '2026-10-23', checks, pageErrors: errors, pixellabRequests: paidRequests, limitations: ['UI concept only; no production integration or paid-model validation', 'Joint locations are illustrative, not provider estimates', 'Existing S2 demo images demonstrate UI only'] };
await writeFile(new URL('./frame-repair-mockup-verification.json', import.meta.url), JSON.stringify(result, null, 2) + '\n');
console.log(JSON.stringify(result, null, 2));
await browser.close();
