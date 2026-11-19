import { openStudio, reloadStudio } from './immersive-helpers.ts';
import { expect, test } from '@playwright/test';

const key = 'synthetic-shared-token-a';
test.beforeEach(async ({ context }) => {
	await context.addInitScript(() => {
		localStorage.setItem('pixeldoll.agentKey', 'off');
		localStorage.setItem('pixeldoll.welcomed', '1');
	});
	await context.route('https://api.pixellab.ai/**', (route) => {
		expect(route.request().method()).toBe('GET');
		expect(new URL(route.request().url()).pathname).toBe('/v2/balance');
		return route.fulfill({
			json: {
				subscription: { type: 'generations', status: 'active', generations: 42, total: 100 },
				credits: { usd: 0 }
			}
		});
	});
	await context.route('**/__auth-peer', (route) =>
		route.fulfill({ contentType: 'text/html', body: '<!doctype html><title>Another app</title>' })
	);
});

test('PixelLab notice opens PixelLab without leaving the app', async ({ page, context }) => {
	await context.route('https://pixellab.ai/', (route) =>
		route.fulfill({ contentType: 'text/html', body: '<title>PixelLab</title>' })
	);
	await openStudio(page, '/');
	await page.getByRole('button', { name: 'More options', exact: true }).click();
	const notice = page.getByRole('link', { name: /Powered by PixelLab\. Not an official app\./ });
	await expect(notice).toHaveAttribute('href', 'https://pixellab.ai');
	await page.getByRole('button', { name: 'Connect PixelLab', exact: true }).click();
	const dialog = page.getByRole('dialog', { name: 'Connect PixelLab', exact: true });
	const popupPromise = page.waitForEvent('popup');
	await dialog.getByRole('link', { name: /Powered by PixelLab\. Not an official app\./ }).click();
	const popup = await popupPromise;
	await expect(popup).toHaveURL('https://pixellab.ai/');
	await expect(dialog).toBeVisible();
	await popup.close();
});

test('More and Activity share PixelLab usage and show credits once quota is used', async ({
	page
}) => {
	let remaining = 42;
	await page.route('https://api.pixellab.ai/v2/balance', (route) =>
		route.fulfill({
			json: {
				subscription: { type: 'generations', status: 'active', generations: remaining, total: 100 },
				credits: { type: 'usd', usd: 3.06 }
			}
		})
	);
	await page.addInitScript((key) => localStorage.setItem('pixellabApiKey', key), key);
	await openStudio(page, '/');
	await page.getByRole('button', { name: 'More options', exact: true }).click();
	const usage = page.getByRole('link', { name: /PixelLab Usage/ });
	const usageLabel = await usage.getByText('PixelLab Usage', { exact: true }).boundingBox();
	const versionLabel = await page.getByText(/^Version /).boundingBox();
	expect(usageLabel?.x).toBe(versionLabel?.x);
	await expect(usage).toContainText('58 / 100');
	await expect(usage).toContainText('58% used');
	await expect(usage).toHaveAttribute('href', 'https://www.pixellab.ai/account');
	await expect(usage).toHaveAttribute('target', '_blank');
	await expect(usage.getByText('$3.06 additional credits left')).toBeHidden();
	await page.getByRole('button', { name: 'Activity', exact: true }).click();
	const activity = page.getByRole('dialog', { name: 'Activity', exact: true });
	await expect(activity.getByText('58 / 100', { exact: true })).toBeVisible();
	await expect(activity.getByText('58% used')).toBeVisible();
	await expect(activity.getByText('$3.06 additional credits left')).toBeVisible();
	await page.setViewportSize({ width: 320, height: 650 });
	remaining = 0;
	await activity.getByRole('button', { name: 'Refresh balance', exact: true }).click();
	await expect(activity.getByText('100% used')).toBeVisible();
	await activity.getByRole('button', { name: 'Done', exact: true }).click();
	await page.getByRole('button', { name: 'More options', exact: true }).click();
	await expect(usage).toContainText('100 / 100');
	await expect(usage).toContainText('$3.06 additional credits left');
});

for (const remembered of [true, false]) {
	test(`shared token: another app forgets a ${remembered ? 'remembered' : 'session-only'} connection${remembered ? '' : ' without BroadcastChannel'}`, async ({
		page,
		context
	}) => {
		if (!remembered)
			await context.addInitScript(() =>
				Object.defineProperty(window, 'BroadcastChannel', { value: undefined })
			);
		await openStudio(page, '/');
		await page.locator('.project-btn').click();
		await page.getByRole('menuitem', { name: 'Connect PixelLab…', exact: true }).click();
		let dialog = page.getByRole('dialog', { name: 'Connect PixelLab', exact: true });
		await dialog.getByLabel('API key', { exact: true }).fill(key);
		await dialog.getByRole('checkbox', { name: 'Remember on this device' }).setChecked(remembered);
		await dialog.getByRole('button', { name: 'Connect', exact: true }).click();
		await page.locator('.project-btn').click();
		await expect(
			page.getByRole('menuitem', { name: 'PixelLab account', exact: true })
		).toBeVisible();
		await page.keyboard.press('Escape');
		const peer = await context.newPage();
		await peer.goto(new URL('/__auth-peer', page.url()).href);
		expect(await peer.evaluate(() => localStorage.getItem('pixellabApiKey'))).toBe(
			remembered ? key : null
		);
		await peer.evaluate(() => {
			localStorage.removeItem('pixellabApiKey');
			const id = crypto.randomUUID();
			localStorage.setItem('pixellabAuthForget', id);
			if (typeof BroadcastChannel !== 'undefined') {
				const c = new BroadcastChannel('pixellab-auth');
				c.postMessage({ type: 'signed-out', id });
				c.close();
			}
		});
		await page.bringToFront();
		await page.locator('.project-btn').click();
		await expect(
			page.getByRole('menuitem', { name: 'Connect PixelLab…', exact: true })
		).toBeVisible();
		await page.keyboard.press('Escape');
		await reloadStudio(page);
		await page.locator('.project-btn').click();
		await expect(
			page.getByRole('menuitem', { name: 'Connect PixelLab…', exact: true })
		).toBeVisible();
		await page.keyboard.press('Escape');
		expect(await page.evaluate(() => localStorage.getItem('pixellabApiKey'))).toBeNull();
	});
}

test('shared token: a saved replacement retains the current account until reload', async ({
	page,
	context
}) => {
	const authorizations: string[] = [];
	context.on('request', (request) => {
		if (request.url().startsWith('https://api.pixellab.ai/'))
			authorizations.push(request.headers().authorization ?? '');
	});
	await page.addInitScript((key) => {
		if (!sessionStorage.getItem('seeded-auth')) {
			sessionStorage.setItem('seeded-auth', '1');
			localStorage.setItem('pixellabApiKey', key);
		}
	}, key);
	await openStudio(page, '/');
	await page.locator('.project-btn').click();
	await page.getByRole('menuitem', { name: 'PixelLab account', exact: true }).click();
	const dialog = page.getByRole('dialog', { name: 'Connect PixelLab', exact: true });
	await expect(dialog.getByText(/Connected and remembered/)).toBeVisible();
	const peer = await context.newPage();
	await peer.goto(new URL('/__auth-peer', page.url()).href);
	await peer.evaluate(() => localStorage.setItem('pixellabApiKey', 'synthetic-shared-token-b'));
	await expect(dialog.getByText(/Connected for this tab/)).toBeVisible();
	expect(authorizations.every((value) => value === `Bearer ${key}`)).toBe(true);
	expect(await peer.evaluate(() => localStorage.getItem('pixellabApiKey'))).toBe(
		'synthetic-shared-token-b'
	);
	await reloadStudio(page);
	await expect.poll(() => authorizations.at(-1)).toBe('Bearer synthetic-shared-token-b');
});

test('framed app never initializes its credential or API clients', async ({ page, context }) => {
	let requests = 0;
	context.on('request', (request) => {
		if (request.url().startsWith('https://api.pixellab.ai/')) requests++;
	});
	await context.addInitScript(() =>
		localStorage.setItem('pixellabApiKey', 'synthetic-framed-token')
	);
	await context.route('**/__frame-host', (route) =>
		route.fulfill({ contentType: 'text/html', body: '<iframe src="/"></iframe>' })
	);
	await page.goto('/__frame-host');
	await expect(
		page.frameLocator('iframe').getByRole('link', { name: 'Open PixelDoll in its own tab' })
	).toBeVisible();
	expect(requests).toBe(0);
});
