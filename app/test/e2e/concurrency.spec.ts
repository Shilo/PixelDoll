import { expect, test } from '@playwright/test';

test('account capacity, two-tab leadership, busy waiting and recovery work through Studio', async ({ page, context }) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  // Second safety barrier: no real API traffic can leave this test.
  await context.route('https://api.pixellab.ai/**', (route) => route.abort());
  await page.goto('/test/fixtures/concurrency.html');
  await expect(page.getByTestId('queue-capacity')).toHaveText('Up to 20 jobs at once.');
  await page.locator('#tier0').click();
  await expect(page.getByTestId('queue-capacity')).toHaveText('Up to 1 job at once.');
  await page.locator('#tier1').click();
  await expect(page.getByTestId('queue-capacity')).toHaveText('Up to 8 jobs at once.');
  await page.locator('#tier2').click();
  await expect(page.getByTestId('queue-capacity')).toHaveText('Up to 10 jobs at once.');
  await page.locator('#tier3').click();
  const second = await context.newPage();
  await second.goto('/test/fixtures/concurrency.html');
  await expect(second.locator('#stats')).toContainText('follower');
  await expect(second.getByTestId('queue-capacity')).toHaveText('Up to 20 jobs at once.');
  await page.locator('#busy').click();
  await second.locator('#enqueue').click();
  await expect(page.locator('p[role="status"]')).toContainText('PixelLab is busy', { timeout: 10_000 });
  await expect(second.locator('p[role="status"]')).toContainText('PixelLab is busy');
  await expect(page.locator('#stats')).toContainText('0 remote');
  await page.locator('#release').click();
  await expect(page.locator('#stats')).toContainText('20 remote', { timeout: 35_000 });
  await page.locator('#complete').click();
  await expect(page.getByText('Nothing generating.', { exact: true })).toBeVisible({ timeout: 20_000 });
  await expect(page.locator('.act-group').filter({ hasText: 'Recent' })).not.toContainText('failed');
  expect(errors).toEqual([]);
});

test('Free/Trial is a valid connection, blocked character creation never charges its first step, and allowed enhancement still works', async ({ page, context }) => {
  const paid: string[] = [];
  await context.addInitScript(() => { localStorage.setItem('pixeldoll.agentKey', 'off'); localStorage.setItem('pixeldoll.welcomed', '1'); });
  await context.route('https://api.pixellab.ai/**', async (route) => {
    const path = new URL(route.request().url()).pathname;
    if (route.request().method() === 'GET') {
      return route.fulfill({ json: { subscription: { status: 'trial', plan: 'Free trial', generations: 40, total: 40 }, credits: { usd: 100 } } });
    }
    paid.push(path);
    if (path === '/v2/enhance-character-v3-prompt') return route.fulfill({ json: { enhanced_prompt: 'A friendly elf with freckles', usage: { type: 'generations', generations: 0.05 } } });
    return route.abort();
  });
  const open = async () => {
    await page.locator('.project-btn').click();
    await page.getByRole('menuitem', { name: 'New character…', exact: true }).click();
    return page.getByRole('dialog', { name: 'New character', exact: true });
  };
  await page.goto('/');
  let sheet = await open();
  await sheet.getByRole('textbox', { name: 'Details', exact: true }).fill('A friendly elf');
  await sheet.getByRole('button', { name: 'Create character', exact: true }).click();
  const connect = page.getByRole('dialog', { name: 'Connect PixelLab', exact: true });
  await connect.getByLabel('API key', { exact: true }).fill('offline-fixture-not-a-key');
  await connect.getByRole('button', { name: 'Connect', exact: true }).click();
  await expect(connect.getByRole('status')).toContainText('Your key is valid');
  await expect(connect.getByRole('status')).toContainText('Tier 1');
  expect(paid).toEqual([]);
  await connect.getByRole('button', { name: 'Continue with limited access', exact: true }).click();
  sheet = await open();
  await expect(sheet.getByRole('textbox', { name: 'Details', exact: true })).toHaveValue('A friendly elf');
  await sheet.getByRole('button', { name: 'Enhance', exact: true }).click();
  await expect(sheet.getByRole('button', { name: 'Undo', exact: true })).toBeVisible();
  expect(paid).toEqual(['/v2/enhance-character-v3-prompt']);
});

test('a Free/Trial connection resumes a permitted pending enhancement', async ({ page, context }) => {
  const posts: string[] = [];
  await context.addInitScript(() => { localStorage.setItem('pixeldoll.agentKey', 'off'); localStorage.setItem('pixeldoll.welcomed', '1'); });
  await context.route('https://api.pixellab.ai/**', async (route) => {
    if (route.request().method() === 'GET') return route.fulfill({ json: { subscription: { status: 'trial', plan: 'Free trial', generations: 40, total: 40 }, credits: { usd: 0 } } });
    posts.push(new URL(route.request().url()).pathname);
    return route.fulfill({ json: { enhanced_prompt: 'A patient elf with freckles', usage: { type: 'generations', generations: 0.05 } } });
  });
  await page.goto('/'); await page.locator('.project-btn').click();
  await page.getByRole('menuitem', { name: 'New character…', exact: true }).click();
  const sheet = page.getByRole('dialog', { name: 'New character', exact: true });
  await sheet.getByRole('textbox', { name: 'Details', exact: true }).fill('A patient elf');
  await sheet.getByRole('button', { name: 'Enhance', exact: true }).click();
  const connect = page.getByRole('dialog', { name: 'Connect PixelLab', exact: true });
  await connect.getByLabel('API key', { exact: true }).fill('offline-fixture-not-a-key');
  await connect.getByRole('button', { name: 'Connect', exact: true }).click();
  await expect(sheet.getByRole('button', { name: 'Undo', exact: true })).toBeVisible();
  expect(posts).toEqual(['/v2/enhance-character-v3-prompt']);
});
