// Read-only keyboard probe for the isolated prototype (loopback only, no credentials).
import { chromium, webkit } from '../../../../app/node_modules/playwright/index.mjs';
const base = process.env.PROTOTYPE_URL ?? 'http://127.0.0.1:5202/';
const engine = process.env.BROWSER === 'webkit' ? webkit : chromium;
const browser = await engine.launch();
const log = [];
const page = await browser.newPage({ viewport: { width: 1469, height: 889 } });
const snap = () => page.evaluate(() => {
  const a = document.activeElement, s = window.prototype.snapshot().state;
  return { screen: s.screen, view: s.view, menu: s.menu, character: s.character, panel: s.panel, theme: s.theme,
    focus: a === document.body ? 'BODY' : `${a.tagName.toLowerCase()}${a.dataset.action ? '[' + a.dataset.action + ']' : ''}${a.getAttribute('aria-label') ? '"' + a.getAttribute('aria-label') + '"' : ''}` };
});
const fresh = async () => { await page.goto(base); await page.evaluate(() => localStorage.clear()); await page.goto(base); await page.waitForFunction(() => window.prototype?.ready); };
const step = async (name, fn) => { try { await fn(); } catch (e) { log.push({ name, error: e.message }); } };

await step('A selection: Tab order, first 14 stops', async () => {
  await fresh(); const stops = [];
  for (let i = 0; i < 14; i++) { await page.keyboard.press('Tab'); stops.push((await snap()).focus); }
  log.push({ name: 'A selection tab order', stops });
});
await step('B selection: Enter on focused New character', async () => {
  await fresh(); await page.focus('header [data-action=create]'); const before = await snap();
  await page.keyboard.press('Enter'); log.push({ name: 'B Enter on New character', before, after: await snap() });
});
await step('C selection: Enter on focused Mira row', async () => {
  await fresh(); await page.focus('.library [data-action="character:1"]');
  await page.keyboard.press('Enter'); log.push({ name: 'C Enter on Mira row (unselected)', after: await snap() });
});
await step('C2 selection: Space on focused Mira row', async () => {
  await fresh(); await page.focus('.library [data-action="character:1"]');
  await page.keyboard.press(' '); log.push({ name: 'C2 Space on Mira row', after: await snap() });
});
await step('C3 selection: Enter on More options', async () => {
  await fresh(); await page.focus('header [data-action=more]');
  await page.keyboard.press('Enter'); log.push({ name: 'C3 Enter on More options', after: await snap() });
});
await step('D studio: Tab from body', async () => {
  await fresh(); await page.click('[data-action=customize]'); const stops = [];
  for (let i = 0; i < 6; i++) { await page.keyboard.press('Tab'); stops.push(await snap()); }
  log.push({ name: 'D studio Tab presses from initial focus', stops });
});
await step('E studio: Space on category tab then Tab', async () => {
  await fresh(); await page.click('[data-action=customize]');
  await page.focus('[data-action="slot:hair"]'); await page.keyboard.press(' ');
  const after = await snap(); await page.keyboard.press('Tab'); const next = await snap();
  log.push({ name: 'E Space on Hair category, then Tab', after, next });
});
await step('F studio: reach theme toggle by keyboard', async () => {
  await fresh(); await page.click('[data-action=customize]');
  await page.focus('header [data-action=more]'); await page.keyboard.press('Enter');
  const opened = await snap(); await page.keyboard.press('Tab'); const t1 = await snap(); await page.keyboard.press('Tab'); const t2 = await snap();
  log.push({ name: 'F Enter on More (studio), then Tab twice', opened, t1, t2 });
});
await step('G creator: Escape in Name field', async () => {
  await fresh(); await page.click('header [data-action=create]'); await page.focus('[data-draft=name]');
  await page.keyboard.type('X'); await page.keyboard.press('Escape'); log.push({ name: 'G Escape while typing Name', after: await snap() });
});
await step('H dialog: About focus, Tab cycle, Escape return', async () => {
  await fresh(); await page.click('[data-action=customize]'); await page.click('header [data-action=more]'); await page.click('[data-action=about]');
  const inDialog = await page.evaluate(() => document.activeElement.closest('dialog') ? document.activeElement.dataset.action : 'outside:' + document.activeElement.tagName);
  const cycle = []; for (let i = 0; i < 3; i++) { await page.keyboard.press('Tab'); cycle.push(await page.evaluate(() => (document.activeElement.closest('dialog') ? 'dialog:' : 'out:') + (document.activeElement.dataset.action ?? document.activeElement.tagName))); }
  await page.keyboard.press('Escape'); log.push({ name: 'H About dialog', inDialog, cycle, afterEscape: await snap() });
});
await step('I preview: arrows while focus on a facing button', async () => {
  await fresh(); await page.click('[data-action=customize]'); await page.focus('[data-action="direction:east"]');
  await page.keyboard.press('ArrowLeft'); log.push({ name: 'I ArrowLeft on facing button', after: await snap(), dir: await page.evaluate(() => window.prototype.snapshot().state.direction) });
});
await step('J top-down: Space on equipment while holding D', async () => {
  await fresh(); await page.click('[data-action=customize]'); await page.click('[data-action="view:topdown"]');
  await page.keyboard.down('d'); await page.waitForTimeout(400); const p1 = await page.evaluate(() => window.prototype.snapshot().position);
  await page.click('[data-action="slot:hair"]'); await page.waitForTimeout(400); const p2 = await page.evaluate(() => window.prototype.snapshot().position);
  await page.keyboard.up('d'); log.push({ name: 'J click equipment while holding D', p1, p2, note: 'p2.x > p1.x means movement continued through the click' });
});
await step('K Backspace on focused button in studio', async () => {
  await fresh(); await page.click('[data-action=customize]'); await page.focus('[data-action="slot:hair"]');
  await page.keyboard.press('Backspace'); log.push({ name: 'K Backspace on focused button', after: await snap() });
});
console.log(JSON.stringify(log, null, 1));
await browser.close();
