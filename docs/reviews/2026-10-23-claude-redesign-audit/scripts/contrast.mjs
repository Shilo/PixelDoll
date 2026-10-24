// Rendered-scene text contrast: screenshot each label region with its text hidden, then compare the
// computed text color against the worst (closest-luminance) background pixel and the median pixel.
import { chromium } from '../../../../app/node_modules/playwright/index.mjs';
import { writeFileSync } from 'node:fs';
const base = process.env.PROTOTYPE_URL ?? 'http://127.0.0.1:5202/';
const browser = await chromium.launch();
const targets = {
  selection: ['.identity h1', '.identity p.muted', '.selected-name h2', '.stage-nav small', '.footnote', '.character-row small', '.character-row .character-copy>span', '.library h2'],
  preview: ['.identity .eyebrow', '.prompt-line span', '.view-tabs button[aria-pressed=false]', '.mode-tabs button[aria-pressed=false]', '.categories button[aria-pressed=false]', '.panel-heading small', '.item[aria-pressed=false] span', '.equipment-tools small', '.footnote', '.playback .dir[aria-pressed=false]', '.saved'],
  topdown: ['.identity .eyebrow', '.prompt-line span', '.view-tabs button[aria-pressed=false]', '.categories button[aria-pressed=false]', '.hint', '#toast', '.footnote'],
  creation: ['.creator label', '.creator small', '.create-footer small', '.size-guide dt', '.creator .muted'],
};
const lum = ([r, g, b]) => [r, g, b].map(v => v / 255).map(v => v <= .04045 ? v / 12.92 : ((v + .055) / 1.055) ** 2.4).reduce((s, v, i) => s + v * [.2126, .7152, .0722][i], 0);
const ratio = (a, b) => { const [x, y] = [lum(a), lum(b)].sort((m, n) => n - m); return (x + .05) / (y + .05); };
const rows = [];
for (const theme of ['obsidian', 'porcelain']) for (const [w, h] of [[1366, 768], [390, 844]]) {
  const page = await browser.newPage({ viewport: { width: w, height: h } });
  await page.goto(base); await page.evaluate(t => localStorage.setItem('bronze-prototype-theme', t), theme); await page.goto(base);
  await page.waitForFunction(() => window.prototype?.ready); await page.waitForTimeout(300);
  for (const [screen, sels] of Object.entries(targets)) {
    await page.evaluate(() => document.querySelector('[data-action=back]')?.click());
    if (screen === 'creation') await page.evaluate(() => document.querySelector('[data-action=create]').click());
    if (screen === 'preview' || screen === 'topdown') await page.evaluate(() => document.querySelector('[data-action=customize]').click());
    if (screen === 'topdown') await page.evaluate(() => document.querySelector('[data-action="view:topdown"]').click());
    await page.waitForTimeout(500);
    for (const sel of sels) {
      const el = page.locator(sel).first();
      if (!(await el.count()) || !(await el.isVisible())) { rows.push({ theme, size: `${w}x${h}`, screen, sel, skipped: 'not visible' }); continue; }
      await el.evaluate(n => n.scrollIntoView({ block: 'nearest' })); await page.waitForTimeout(80);
      { const b = await el.boundingBox(); if (!b || b.y >= h - 1 || b.x >= w - 1 || b.y + b.height <= 0) { rows.push({ theme, size: `${w}x${h}`, screen, sel, skipped: 'offscreen' }); continue; } }
      const info = await el.evaluate(n => { const c = getComputedStyle(n).color, cv = document.createElement('canvas').getContext('2d'); cv.fillStyle = c; cv.fillRect(0, 0, 1, 1); const d = cv.getImageData(0, 0, 1, 1).data; n.style.setProperty('color', 'transparent', 'important'); n.querySelectorAll('*').forEach(k => k.style.setProperty('color', 'transparent', 'important')); return { rgb: [d[0], d[1], d[2]], alpha: d[3], size: getComputedStyle(n).fontSize, text: n.textContent.trim().slice(0, 32) }; });
      await page.waitForTimeout(60);
      const box = await el.boundingBox();
      if (!box) { rows.push({ theme, size: `${w}x${h}`, screen, sel, skipped: 'vanished' }); continue; }
      const shot = await page.screenshot({ clip: { x: Math.max(0, box.x), y: Math.max(0, box.y), width: Math.max(2, Math.min(box.width, w - box.x)), height: Math.max(2, Math.min(box.height, h - box.y)) } });
      const px = await page.evaluate(async b64 => { const im = new Image(); im.src = 'data:image/png;base64,' + b64; await im.decode(); const c = document.createElement('canvas'); c.width = im.width; c.height = im.height; const g = c.getContext('2d'); g.drawImage(im, 0, 0); const d = g.getImageData(0, 0, c.width, c.height).data, out = []; for (let i = 0; i < d.length; i += 16) out.push([d[i], d[i + 1], d[i + 2]]); return out; }, shot.toString('base64'));
      await el.evaluate(n => { n.style.removeProperty('color'); n.querySelectorAll('*').forEach(k => k.style.removeProperty('color')); });
      const ratios = px.map(p => ratio(info.rgb, p)).sort((a, b) => a - b);
      rows.push({ theme, size: `${w}x${h}`, screen, sel, text: info.text, fontSize: info.size, textAlpha: info.alpha, worst: +ratios[0].toFixed(2), p10: +ratios[Math.floor(ratios.length * .1)].toFixed(2), median: +ratios[Math.floor(ratios.length / 2)].toFixed(2) });
    }
  }
  await page.close();
}
writeFileSync(process.env.CONTRAST_OUTPUT ?? new URL('../evidence/contrast-chromium.json', import.meta.url), JSON.stringify(rows, null, 1));
for (const r of rows) if (!r.skipped) console.log(`${r.theme.padEnd(9)} ${r.size.padEnd(8)} ${r.screen.padEnd(9)} ${r.sel.padEnd(42)} ${String(r.fontSize).padEnd(5)} a${r.textAlpha} worst ${r.worst} p10 ${r.p10} med ${r.median}${r.p10 < 4.5 ? '  <-- below 4.5 at p10' : ''}`); else console.log(`${r.theme} ${r.size} ${r.screen} ${r.sel} SKIPPED`);
await browser.close();
