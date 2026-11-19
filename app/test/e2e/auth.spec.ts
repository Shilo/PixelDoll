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

test('More opens local PixelLab usage and keeps the detailed meter in Activity', async ({
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
	const usage = page.getByRole('button', { name: /^PixelLab usage/ });
	const usageLabel = await usage.getByText('PixelLab usage', { exact: true }).boundingBox();
	const versionLabel = await page.getByText(/^Version /).boundingBox();
	expect(usageLabel?.x).toBe(versionLabel?.x);
	await expect(usage).toContainText('42 gens left');
	await expect(page.getByRole('link', { name: /PixelLab usage/ })).toHaveCount(0);
	await expect(usage.locator('progress')).toHaveCount(0);
	await usage.click();
	const account = page.getByRole('dialog', { name: 'PixelLab usage', exact: true });
	await expect(account.getByText('58 / 100', { exact: true })).toBeVisible();
	await expect(account.getByText('58% used')).toBeVisible();
	await expect(account.getByLabel('API key', { exact: true })).toHaveCount(0);
	const external = account.getByRole('link', { name: 'Open PixelLab account' });
	await expect(external).toHaveAttribute('href', 'https://www.pixellab.ai/account');
	await expect(external).toHaveAttribute('target', '_blank');
	await account.getByRole('button', { name: 'Done', exact: true }).click();
	await expect(page.getByRole('button', { name: 'More options', exact: true })).toBeFocused();
	await page.getByRole('button', { name: 'More options', exact: true }).click();
	await page.getByRole('button', { name: 'Activity', exact: true }).click();
	const activity = page.getByRole('dialog', { name: 'Activity', exact: true });
	await expect(activity.getByText('PixelLab usage', { exact: true })).toBeVisible();
	await expect(activity.getByText('58 / 100', { exact: true })).toBeVisible();
	await expect(activity.getByText('58% used')).toBeVisible();
	await expect(activity.getByText('$3.06 credits left')).toBeVisible();
	const expectInlineCredits = async (view: typeof usage) => {
		const percentage = view.getByText('100% used', { exact: true });
		const credits = view.getByText('$3.06 credits left', { exact: true });
		await expect(credits).toBeVisible();
		const usedBox = await percentage.boundingBox();
		const creditBox = await credits.boundingBox();
		if (!usedBox || !creditBox) throw new Error('Expected both usage and credits to be visible');
		expect(creditBox.y).toBe(usedBox.y);
		expect(creditBox.x).toBeGreaterThan(usedBox.x + usedBox.width);
	};
	await page.setViewportSize({ width: 320, height: 650 });
	remaining = 0;
	await activity.getByRole('button', { name: 'Refresh balance', exact: true }).click();
	await expectInlineCredits(activity);
	await activity.getByRole('button', { name: 'Done', exact: true }).click();
	await page.getByRole('button', { name: 'More options', exact: true }).click();
	await expect(usage).toContainText('0 gens left');
	await usage.click();
	await expect(account.getByText('100 / 100', { exact: true })).toBeVisible();
	await expectInlineCredits(account);
});

test('PixelLab usage recovers from errors, replaces a key, reconnects, and forgets locally', async ({
	page
}) => {
	let balanceStatus = 200;
	await page.route('https://api.pixellab.ai/**', (route) => {
		expect(route.request().method()).toBe('GET');
		expect(new URL(route.request().url()).pathname).toBe('/v2/balance');
		return route.fulfill({
			status: balanceStatus,
			json: {
				subscription: { type: 'generations', status: 'active', generations: 42, total: 100 },
				credits: { usd: 0 }
			}
		});
	});
	await openStudio(page, '/');
	const openMore = () => page.getByRole('button', { name: 'More options', exact: true }).click();
	const fillKey = async (dialog: ReturnType<typeof page.getByRole>, value: string) => {
		await dialog.getByLabel('API key', { exact: true }).fill(value);
		await dialog.getByRole('checkbox', { name: 'Remember on this device' }).check();
	};
	await openMore();
	await page.getByRole('button', { name: 'Connect PixelLab', exact: true }).click();
	const connect = page.getByRole('dialog', { name: 'Connect PixelLab', exact: true });
	await fillKey(connect, key);
	await connect.getByRole('button', { name: 'Connect', exact: true }).click();
	await expect(connect).toBeHidden();
	await openMore();
	await page.getByRole('button', { name: 'PixelLab usage 42 gens left', exact: true }).click();
	const account = page.getByRole('dialog', { name: 'PixelLab usage', exact: true });
	const refresh = account.getByRole('button', { name: 'Refresh', exact: true });
	balanceStatus = 503;
	await refresh.click();
	await expect(account.getByRole('status')).toContainText('Couldn’t load usage');
	await expect(account.locator('progress')).toHaveCount(0);
	await account.getByRole('button', { name: 'Done', exact: true }).click();
	await openMore();
	await page.getByRole('button', { name: 'PixelLab usage', exact: true }).click();
	balanceStatus = 200;
	await refresh.click();
	await expect(account.getByText('58% used')).toBeVisible();
	const replace = account.getByRole('button', { name: 'Replace key', exact: true });
	await replace.click();
	const replacement = page.getByRole('dialog', { name: 'Replace PixelLab key', exact: true });
	await expect(replacement.getByLabel('API key', { exact: true })).toBeFocused();
	await fillKey(replacement, 'synthetic-replacement');
	await replacement.getByRole('button', { name: 'Keep current key' }).click();
	await expect(replace).toBeFocused();
	await replace.click();
	await expect(replacement.getByLabel('API key', { exact: true })).toHaveValue('');
	await fillKey(replacement, 'synthetic-replacement');
	await replacement.getByRole('button', { name: 'Replace key', exact: true }).click();
	await expect(account.getByText('58% used')).toBeVisible();
	expect(await page.evaluate(() => localStorage.getItem('pixellabApiKey'))).toBe(
		'synthetic-replacement'
	);
	balanceStatus = 401;
	await refresh.click();
	const reconnect = page.getByRole('dialog', { name: 'Reconnect PixelLab', exact: true });
	await expect(reconnect.getByRole('status')).toContainText('didn’t accept this key');
	await reconnect.getByRole('button', { name: 'Cancel', exact: true }).click();
	await openMore();
	await page.getByRole('button', { name: 'Reconnect PixelLab', exact: true }).click();
	balanceStatus = 200;
	await fillKey(reconnect, key);
	await reconnect.getByRole('button', { name: 'Connect', exact: true }).click();
	await expect(reconnect).toBeHidden();
	await openMore();
	await page.getByRole('button', { name: 'PixelLab usage 42 gens left', exact: true }).click();
	await account.getByRole('button', { name: 'Forget key', exact: true }).click();
	await expect(connect.getByLabel('API key', { exact: true })).toBeFocused();
	expect(await page.evaluate(() => localStorage.getItem('pixellabApiKey'))).toBeNull();
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
	const dialog = page.getByRole('dialog', { name: 'PixelLab usage', exact: true });
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
