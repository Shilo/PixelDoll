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
	await page.getByRole('button', { name: 'Connect PixelLab...', exact: true }).click();
	const dialog = page.getByRole('dialog', { name: 'Connect PixelLab', exact: true });
	const popupPromise = page.waitForEvent('popup');
	await dialog.getByRole('link', { name: /Powered by PixelLab\. Not an official app\./ }).click();
	const popup = await popupPromise;
	await expect(popup).toHaveURL('https://pixellab.ai/');
	await expect(dialog).toBeVisible();
	await popup.close();
});

test('More keeps the original PixelLab usage meter and opens the local sheet', async ({ page }) => {
	let remaining = 42;
	let total = 100;
	await page.route('https://api.pixellab.ai/v2/balance', (route) =>
		route.fulfill({
			json: {
				subscription: { type: 'generations', status: 'active', generations: remaining, total },
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
	await expect(usage.getByText('58 / 100', { exact: true })).toBeVisible();
	await expect(usage.getByText('58% used', { exact: true })).toBeVisible();
	const meter = usage.locator('progress');
	await expect(meter).toBeVisible();
	await expect(meter).toHaveAttribute('value', '58');
	await expect(meter).toHaveAttribute('max', '100');
	await expect(usage.getByText('$3.06 credits left', { exact: true })).toBeHidden();
	await expect(page.getByRole('link', { name: /PixelLab usage/ })).toHaveCount(0);
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
	await page.getByRole('button', { name: 'Activity...', exact: true }).click();
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
	await page.setViewportSize({ width: 320, height: 568 });
	remaining = 0;
	total = 50_000;
	await activity.getByRole('button', { name: 'Refresh balance', exact: true }).click();
	await expectInlineCredits(activity);
	await activity.getByRole('button', { name: 'Done', exact: true }).click();
	await page.getByRole('button', { name: 'More options', exact: true }).click();
	const fullCount = usage.getByText('50,000 / 50,000', { exact: true });
	await expect(fullCount).toBeVisible();
	await expect(meter).toHaveAttribute('value', '50000');
	await expect(meter).toHaveAttribute('max', '50000');
	const label = usage.getByText('PixelLab usage', { exact: true });
	const labelBox = await label.boundingBox();
	const countBox = await fullCount.boundingBox();
	const chevronBox = await usage.locator('.actions svg').boundingBox();
	const rowBox = await usage.boundingBox();
	if (!labelBox || !countBox || !chevronBox || !rowBox)
		throw new Error('Expected the compact usage row and all its contents to be visible');
	const lineHeight = await label.evaluate((element) =>
		parseFloat(getComputedStyle(element).lineHeight)
	);
	expect(labelBox.height).toBeCloseTo(lineHeight, 0);
	expect(labelBox.y + labelBox.height / 2).toBeCloseTo(countBox.y + countBox.height / 2, 0);
	expect(chevronBox.y + chevronBox.height / 2).toBeCloseTo(countBox.y + countBox.height / 2, 0);
	expect(labelBox.x + labelBox.width).toBeLessThan(countBox.x);
	expect(countBox.x + countBox.width).toBeLessThan(chevronBox.x);
	expect(chevronBox.x + chevronBox.width).toBeLessThanOrEqual(
		Math.min(320, rowBox.x + rowBox.width)
	);
	await expectInlineCredits(usage);
	await usage.click();
	await expect(account.getByText('50,000 / 50,000', { exact: true })).toBeVisible();
	await expectInlineCredits(account);
});

test('PixelLab usage recovers from errors, replaces a key, reconnects, and forgets locally', async ({
	page
}) => {
	let balanceStatus = 200;
	let replacementReads = 0;
	await page.route('https://api.pixellab.ai/**', (route) => {
		expect(route.request().method()).toBe('GET');
		expect(new URL(route.request().url()).pathname).toBe('/v2/balance');
		if (route.request().headers().authorization === 'Bearer synthetic-replacement')
			replacementReads++;
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
	await page.getByRole('button', { name: 'Connect PixelLab...', exact: true }).click();
	const connect = page.getByRole('dialog', { name: 'Connect PixelLab', exact: true });
	await fillKey(connect, key);
	await connect.getByRole('button', { name: 'Connect', exact: true }).click();
	await expect(connect).toBeHidden();
	await openMore();
	const usage = page.getByRole('button', { name: /^PixelLab usage/ });
	await usage.click();
	const account = page.getByRole('dialog', { name: 'PixelLab usage', exact: true });
	const refresh = account.getByRole('button', { name: 'Refresh balance', exact: true });
	await expect(refresh).toHaveText('');
	await expect(refresh.locator('svg')).toBeVisible();
	balanceStatus = 503;
	await refresh.press('Enter');
	await expect(account.getByRole('status')).toContainText('Couldn’t load usage');
	await expect(refresh).toBeFocused();
	await expect(account.locator('progress')).toHaveCount(0);
	await account.getByRole('button', { name: 'Done', exact: true }).click();
	await openMore();
	await expect(usage).toContainText('Usage unavailable');
	await expect(usage.locator('progress')).toHaveCount(0);
	await usage.click();
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
	balanceStatus = 401;
	await fillKey(replacement, 'synthetic-invalid');
	await replacement.getByRole('button', { name: 'Replace key', exact: true }).click();
	await expect(replacement.getByRole('status')).toContainText('Current key was not changed');
	await expect(replacement.getByLabel('API key', { exact: true })).toBeFocused();
	expect(await page.evaluate(() => localStorage.getItem('pixellabApiKey'))).toBe(key);
	balanceStatus = 200;
	await fillKey(replacement, 'synthetic-replacement');
	await replacement.getByRole('button', { name: 'Replace key', exact: true }).click();
	await expect(account.getByText('58% used')).toBeVisible();
	await expect(replace).toBeFocused();
	expect(replacementReads).toBe(1);
	expect(await page.evaluate(() => localStorage.getItem('pixellabApiKey'))).toBe(
		'synthetic-replacement'
	);
	balanceStatus = 401;
	await refresh.click();
	const reconnect = page.getByRole('dialog', { name: 'Reconnect PixelLab', exact: true });
	await expect(reconnect.getByRole('status')).toContainText('didn’t accept this key');
	await expect(reconnect.getByLabel('API key', { exact: true })).toBeFocused();
	await reconnect.getByRole('button', { name: 'Cancel', exact: true }).click();
	await openMore();
	await page.getByRole('button', { name: 'Reconnect PixelLab...', exact: true }).click();
	balanceStatus = 200;
	await fillKey(reconnect, key);
	await reconnect.getByRole('button', { name: 'Connect', exact: true }).click();
	await expect(reconnect).toBeHidden();
	await openMore();
	await usage.click();
	await account.getByRole('button', { name: 'Forget key', exact: true }).click();
	await expect(connect.getByLabel('API key', { exact: true })).toBeFocused();
	expect(await page.evaluate(() => localStorage.getItem('pixellabApiKey'))).toBeNull();
});

test('a delayed replacement does not undo another tab’s Forget', async ({ page, context }) => {
	await openStudio(page, '/');
	const more = page.getByRole('button', { name: 'More options', exact: true });
	await more.click();
	await page.getByRole('button', { name: 'Connect PixelLab...', exact: true }).click();
	const connect = page.getByRole('dialog', { name: 'Connect PixelLab', exact: true });
	await connect.getByLabel('API key', { exact: true }).fill(key);
	await connect.getByRole('button', { name: 'Connect', exact: true }).click();
	await expect(connect).toBeHidden();
	let received!: () => void, release!: () => void;
	const waiting = new Promise<void>((resolve) => (received = resolve));
	const held = new Promise<void>((resolve) => (release = resolve));
	await page.route('https://api.pixellab.ai/v2/balance', async (route) => {
		received();
		await held;
		await route.fallback();
	});
	const peer = await context.newPage();
	await peer.goto(new URL('/__auth-peer', page.url()).href);
	await more.click();
	await page.getByRole('button', { name: /^PixelLab usage/ }).click();
	const account = page.getByRole('dialog', { name: 'PixelLab usage', exact: true });
	await account.getByRole('button', { name: 'Replace key', exact: true }).click();
	const replacement = page.getByRole('dialog', { name: 'Replace PixelLab key', exact: true });
	await replacement.getByLabel('API key', { exact: true }).fill('synthetic-delayed');
	await replacement.getByRole('checkbox', { name: 'Remember on this device' }).check();
	await replacement.getByRole('button', { name: 'Replace key', exact: true }).click();
	await waiting;
	try {
		expect(await peer.evaluate(() => localStorage.getItem('pixellabApiKey'))).toBeNull();
		await peer.evaluate(() => localStorage.setItem('pixellabAuthForget', crypto.randomUUID()));
	} finally {
		release();
	}
	await expect(page.getByRole('dialog').getByRole('status')).toHaveText(
		'The connection changed while checking. Try again.'
	);
	expect(await peer.evaluate(() => localStorage.getItem('pixellabApiKey'))).toBeNull();
});

test('Forget in Reconnect discards the action waiting for a key', async ({ page }, info) => {
	await openStudio(
		page,
		info.config.projects.find((project) => project.name === 'browser-selftests')!.use.baseURL!
	);
	await page.evaluate(async () => {
		const appPath = '/src/lib/app.svelte.ts';
		const studioPath = '/src/studio/state.svelte.ts';
		const { app } = await import(appPath);
		const { withKey } = await import(studioPath);
		app.key = 'synthetic-rejected';
		app.keyRejected = true;
		withKey(() => document.body.setAttribute('data-resumed-generation', ''), 1);
	});

	const reconnect = page.getByRole('dialog', { name: 'Reconnect PixelLab', exact: true });
	await reconnect.getByRole('button', { name: 'Forget key', exact: true }).click();
	const connect = page.getByRole('dialog', { name: 'Connect PixelLab', exact: true });
	expect(
		await page.evaluate(async () => {
			const studioPath = '/src/studio/state.svelte.ts';
			return (await import(studioPath)).pendingConnectionMinimumTier();
		})
	).toBeNull();
	await connect.getByLabel('API key', { exact: true }).fill(key);
	await connect.getByRole('button', { name: 'Connect', exact: true }).click();
	await expect(connect).toBeHidden();
	await expect(page.locator('[data-resumed-generation]')).toHaveCount(0);
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
