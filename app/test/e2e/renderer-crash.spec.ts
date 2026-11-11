import { test, expect } from '@playwright/test';
import { nativeCrashTrace, followerTab, queueOwner } from './queue-lock.ts';

test.use({ trace: { ...nativeCrashTrace } });

test.beforeEach(async ({ context }) => {
	await context.addInitScript(() => {
		localStorage.setItem('pixeldoll.agentKey', 'off');
		localStorage.setItem('pixeldoll.welcomed', '1');
	});
});

test('a follower takes over the jobs after an abrupt renderer crash without cleanup', async ({
	page,
	context
}) => {
	const requests: string[] = [];
	await context.route('https://*.pixellab.ai/**', async (route) => {
		requests.push(route.request().method());
		await route.abort();
	});
	const follower = await followerTab(page, context);
	await page.evaluate(() =>
		addEventListener('pagehide', () => localStorage.setItem('crash-test:pagehide', 'yes'))
	);
	const previousOwner = await queueOwner(follower);
	expect(previousOwner).toBeTruthy();
	const cdp = await context.newCDPSession(page);
	const crashed = page.waitForEvent('crash');
	let crashError: Error | undefined;
	void cdp.send('Page.crash').catch((error: Error) => {
		crashError = error;
	});
	await crashed;
	// Page.crash can leave its protocol call pending; the crash event is the success signal.
	// A renderer crash cannot run our pagehide release. The browser must release its dead client's Web Lock.
	expect(await follower.evaluate(() => localStorage.getItem('crash-test:pagehide'))).toBeNull();
	await expect
		.poll(
			async () => {
				const current = await queueOwner(follower);
				return !!current && current !== previousOwner;
			},
			{ timeout: 15_000 }
		)
		.toBe(true);
	if (crashError) expect(crashError.message).toMatch(/crash|closed|detached/i);
	expect(requests).toEqual([]);
});

test('nonpersisted pagehide releases a live document lock while cached pagehide retains it', async ({
	page,
	context
}) => {
	const requests: string[] = [];
	await context.route('https://*.pixellab.ai/**', async (route) => {
		requests.push(route.request().method());
		await route.abort();
	});
	const follower = await followerTab(page, context);
	const owner = () => queueOwner(follower);
	const originalOwner = await owner();
	expect(originalOwner).toBeTruthy();
	await page.evaluate(() =>
		dispatchEvent(new PageTransitionEvent('pagehide', { persisted: true }))
	);
	expect(await owner()).toBe(originalOwner);
	// Keep the old document alive: success must come from explicit release, not browser destruction or garbage collection.
	await page.evaluate(() =>
		dispatchEvent(new PageTransitionEvent('pagehide', { persisted: false }))
	);
	await expect
		.poll(
			async () => {
				const current = await owner();
				return !!current && current !== originalOwner;
			},
			{ timeout: 15_000 }
		)
		.toBe(true);
	expect(page.isClosed()).toBe(false);
	expect(requests).toEqual([]);
});
