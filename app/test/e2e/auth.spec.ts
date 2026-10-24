import { openStudio, reloadStudio } from './immersive-helpers.ts';
import { expect, test } from '@playwright/test';

const key = 'synthetic-shared-token-a';
test.beforeEach(async ({ context }) => {
  await context.addInitScript(() => { localStorage.setItem('pixeldoll.agentKey', 'off'); localStorage.setItem('pixeldoll.welcomed', '1'); });
  await context.route('https://api.pixellab.ai/**', (route) => {
    expect(route.request().method()).toBe('GET');
    expect(new URL(route.request().url()).pathname).toBe('/v2/balance');
    return route.fulfill({ json: { subscription: { type: 'generations', status: 'active', generations: 42, total: 100 }, credits: { usd: 0 } } });
  });
  await context.route('**/__auth-peer', (route) => route.fulfill({ contentType: 'text/html', body: '<!doctype html><title>Another app</title>' }));
});

for (const remembered of [true, false]) {
  test(`shared token: another app forgets a ${remembered ? 'remembered' : 'session-only'} connection${remembered ? '' : ' without BroadcastChannel'}`, async ({ page, context }) => {
    if (!remembered) await context.addInitScript(() => Object.defineProperty(window, 'BroadcastChannel', { value: undefined }));
    await openStudio(page, '/');
    await page.locator('.project-btn').click();
    await page.getByRole('menuitem', { name: 'Connect PixelLab…', exact: true }).click();
    let dialog = page.getByRole('dialog', { name: 'Connect PixelLab', exact: true });
    await dialog.getByLabel('API key', { exact: true }).fill(key);
    await dialog.getByRole('checkbox', { name: 'Remember on this device' }).setChecked(remembered);
    await dialog.getByRole('button', { name: 'Connect', exact: true }).click();
    await page.locator('.project-btn').click();
    await expect(page.getByRole('menuitem', {name:'PixelLab account',exact:true})).toBeVisible();
    await page.keyboard.press('Escape');
    const peer = await context.newPage();
    await peer.goto(new URL('/__auth-peer', page.url()).href);
    expect(await peer.evaluate(() => localStorage.getItem('pixellabApiKey'))).toBe(remembered ? key : null);
    await peer.evaluate(() => {
      localStorage.removeItem('pixellabApiKey');
      const id = crypto.randomUUID();
      localStorage.setItem('pixellabAuthForget', id);
      if (typeof BroadcastChannel !== 'undefined') { const c = new BroadcastChannel('pixellab-auth'); c.postMessage({ type: 'signed-out', id }); c.close(); }
    });
    await page.bringToFront();
    await page.locator('.project-btn').click();
    await expect(page.getByRole('menuitem', {name:'Connect PixelLab…',exact:true})).toBeVisible();
    await page.keyboard.press('Escape');
    await reloadStudio(page);
    await page.locator('.project-btn').click();
    await expect(page.getByRole('menuitem', {name:'Connect PixelLab…',exact:true})).toBeVisible();
    await page.keyboard.press('Escape');
    expect(await page.evaluate(() => localStorage.getItem('pixellabApiKey'))).toBeNull();
  });
}

test('shared token: a saved replacement retains the current account until reload', async ({ page, context }) => {
  const authorizations: string[] = [];
  context.on('request', request => { if (request.url().startsWith('https://api.pixellab.ai/')) authorizations.push(request.headers().authorization ?? ''); });
  await page.addInitScript((key) => { if (!sessionStorage.getItem('seeded-auth')) { sessionStorage.setItem('seeded-auth', '1'); localStorage.setItem('pixellabApiKey', key); } }, key);
  await openStudio(page, '/');
  await page.locator('.project-btn').click();
  await page.getByRole('menuitem', { name: 'PixelLab account', exact: true }).click();
  const dialog = page.getByRole('dialog', { name: 'Connect PixelLab', exact: true });
  await expect(dialog.getByText(/Connected and remembered/)).toBeVisible();
  const peer = await context.newPage(); await peer.goto(new URL('/__auth-peer', page.url()).href);
  await peer.evaluate(() => localStorage.setItem('pixellabApiKey', 'synthetic-shared-token-b'));
  await expect(dialog.getByText(/Connected for this tab/)).toBeVisible();
  expect(authorizations.every(value => value === `Bearer ${key}`)).toBe(true);
  expect(await peer.evaluate(() => localStorage.getItem('pixellabApiKey'))).toBe('synthetic-shared-token-b');
  await reloadStudio(page);
  await expect.poll(() => authorizations.at(-1)).toBe('Bearer synthetic-shared-token-b');
});

test('framed app never initializes its credential or API clients', async ({ page, context }) => {
  let requests = 0; context.on('request', request => { if (request.url().startsWith('https://api.pixellab.ai/')) requests++; });
  await context.addInitScript(() => localStorage.setItem('pixellabApiKey', 'synthetic-framed-token'));
  await context.route('**/__frame-host', route => route.fulfill({ contentType: 'text/html', body: '<iframe src="/"></iframe>' }));
  await page.goto('/__frame-host');
  await expect(page.frameLocator('iframe').getByRole('link', { name: 'Open PixelDoll in its own tab' })).toBeVisible();
  expect(requests).toBe(0);
});
