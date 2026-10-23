import { expect, test } from '@playwright/test';

test('account capacity, two-tab leadership, busy waiting and recovery work through Studio', async ({ page, context }) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  // Second safety barrier: no real API traffic can leave this test.
  await context.route('https://api.pixellab.ai/**', (route) => route.abort());
  await page.goto('/test/fixtures/concurrency.html');
  await expect(page.getByTestId('queue-capacity')).toContainText('up to 20');
  await page.locator('#tier2').click();
  await expect(page.getByTestId('queue-capacity')).toContainText('up to 10');
  await page.locator('#tier3').click();
  const second = await context.newPage();
  await second.goto('/test/fixtures/concurrency.html');
  await expect(second.locator('#stats')).toContainText('follower');
  await expect(second.getByTestId('queue-capacity')).toContainText('up to 20');
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
