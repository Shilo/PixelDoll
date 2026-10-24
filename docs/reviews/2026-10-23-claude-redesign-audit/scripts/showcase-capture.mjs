// Read-only capture of the built Bronze UI showcase (loopback preview server) for every tab and appearance.
import { chromium } from '../../../../app/node_modules/playwright/index.mjs';
import { mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
const base = process.env.BRONZE_BASE_URL ?? 'http://127.0.0.1:5205/bronze-ui/';
const dir = fileURLToPath(new URL('../evidence/showcase/', import.meta.url));
mkdirSync(dir, { recursive: true });
const browser = await chromium.launch();
const tabs = ['Scene', 'Controls', 'Creator', 'Library', 'Feedback', 'Overlays'];
const report = [];
for (const [w, h] of [[1440, 900], [390, 844]]) for (const mode of ['dark', 'light']) {
  const page = await browser.newPage({ viewport: { width: w, height: h } });
  await page.goto(base);
  await page.waitForTimeout(500);
  const toggle = page.getByRole('button', { name: /light mode|dark mode/i }).first();
  const label = (await toggle.textContent()).trim().toLowerCase();
  if (mode === 'light' && label.includes('light')) await toggle.click();
  if (mode === 'dark' && label.includes('dark')) await toggle.click();
  for (const tab of tabs) {
    const link = page.getByRole('button', { name: tab, exact: true }).or(page.getByRole('link', { name: tab, exact: true })).or(page.getByRole('tab', { name: tab, exact: true })).first();
    if (!(await link.count())) { report.push({ w, mode, tab, missing: true }); continue; }
    await link.click();
    await page.waitForTimeout(350);
    await page.screenshot({ path: `${dir}${mode}-${w}x${h}-${tab.toLowerCase()}.png`, fullPage: true });
    report.push({ w, mode, tab, ...(await page.evaluate(() => ({ hScroll: document.documentElement.scrollWidth > innerWidth, height: document.documentElement.scrollHeight }))) });
  }
  await page.close();
}
console.log(JSON.stringify(report));
await browser.close();
