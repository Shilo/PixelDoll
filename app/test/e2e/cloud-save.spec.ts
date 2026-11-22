// Cloud Save in the real app: two browser contexts are two devices sharing one fake Dropbox app folder (the unit tests'
// fake, served through route interception), on the dev server so the fake provider settings apply (lib/sync/config.ts).
// Merge rules and failure cases are unit-tested (test/unit/sync); this covers the wiring and the Settings controls.
import { expect, test, type Browser, type BrowserContext, type Page } from '@playwright/test';
import { DropboxFake } from '../unit/sync/fakes/dropbox-fake.ts';
import { openStudio } from './immersive-helpers.ts';

const baseURL = `http://127.0.0.1:${process.env.DEV_PORT ?? '5298'}`;

const statePath = '/src/studio/state.svelte.ts';

async function device(browser: Browser, cloud: DropboxFake, developer = true) {
	const context = await browser.newContext({ baseURL, viewport: { width: 1440, height: 900 } });
	await context.addInitScript((developer) => {
		localStorage.setItem('pixeldoll.agentKey', 'off');
		localStorage.setItem('pixeldoll.welcomed', '1');
		localStorage.setItem('pixeldoll.devSyncConfig', JSON.stringify({ dropboxAppKey: 'test-app' }));
		if (developer) localStorage.setItem('pixeldoll.developerMode', '1');
	}, developer);
	await context.route(/^https:\/\/(api|content)\.dropboxapi\.com\//, async (route) => {
		const request = route.request();
		if (new URL(request.url()).pathname === '/oauth2/token')
			return route.fulfill({
				json: {
					access_token: 'fake-access',
					token_type: 'bearer',
					expires_in: 14400,
					refresh_token: 'fake-refresh'
				}
			});
		const response = await cloud.fetch(request.url(), {
			method: request.method(),
			headers: await request.allHeaders(),
			body: request.postDataBuffer() ? new Uint8Array(request.postDataBuffer()!) : undefined
		});
		await route.fulfill({
			status: response.status,
			headers: Object.fromEntries(response.headers),
			body: Buffer.from(await response.arrayBuffer())
		});
	});
	return context;
}

/** Connect without a sign-in page: the stored sign-in a finished sign-in would leave. */
async function connected(context: BrowserContext) {
	const page = await context.newPage();
	await openStudio(page, '/');
	await page.evaluate(async () => {
		const storePath = '/src/lib/sync/core/store.ts';
		const { IndexedSyncStore } = await import(storePath);
		await new IndexedSyncStore().put('kv', 'credentials', {
			provider: 'dropbox',
			refreshToken: 'fake-refresh',
			email: 'player@example.com'
		});
		localStorage.setItem('pixeldoll.cloudSave', '1');
	});
	await openStudio(page, '/');
	return page;
}

const syncNow = (page: Page) =>
	page.evaluate(async () => {
		const clientPath = '/src/lib/sync/client.ts';
		await (await import(clientPath)).syncNow();
	});

const uploaded = (cloud: DropboxFake) =>
	[...cloud.files.keys()].some((path) => path.startsWith('/devices/'));

async function openCloudSave(page: Page) {
	await page.getByRole('button', { name: 'More options', exact: true }).click();
	await page.getByRole('button', { name: 'Settings...', exact: true }).click();
	const settings = page.getByRole('dialog', { name: 'Settings', exact: true });
	await settings.getByRole('button', { name: 'Cloud Save' }).click();
	return settings;
}

test('a character saved on one device appears on another, and an edit there comes back', async ({
	browser
}) => {
	const cloud = new DropboxFake();
	const desktop = await connected(await device(browser, cloud));
	await desktop.evaluate(async (path) => {
		const state = await import(path);
		await state.copyDemo();
		await state.renameProject('Synced hero');
	}, statePath);
	await expect.poll(async () => (await syncNow(desktop), uploaded(cloud))).toBe(true);

	const phone = await connected(await device(browser, cloud));
	// The Studio's character list, as the cast screen shows it.
	const listed = (page: Page) =>
		page.evaluate(
			async (path) => (await import(path)).store.projects.map((p: { name: string }) => p.name),
			statePath
		);
	await expect.poll(() => listed(phone)).toContain('Synced hero');

	await phone.evaluate(async (path) => {
		const state = await import(path);
		const project = state.store.projects.find((p: { name: string }) => p.name === 'Synced hero');
		await state.openProject(project.id);
		await state.renameProject('Renamed on the phone');
	}, statePath);
	await expect
		.poll(async () => {
			await syncNow(phone);
			await syncNow(desktop);
			return listed(desktop);
		})
		.toContain('Renamed on the phone');
});

test('Cloud Save settings: hidden without Developer mode, sign-in round trip, status and disconnect', async ({
	browser
}) => {
	const cloud = new DropboxFake();
	const hidden = await (await device(browser, cloud, false)).newPage();
	await openStudio(hidden, '/');
	await hidden.getByRole('button', { name: 'More options', exact: true }).click();
	await hidden.getByRole('button', { name: 'Settings...', exact: true }).click();
	await expect(
		hidden
			.getByRole('dialog', { name: 'Settings', exact: true })
			.getByRole('button', { name: 'Cloud Save' })
	).toHaveCount(0);

	const context = await device(browser, cloud);
	// Dropbox's sign-in page: send the browser straight back with a code, as after Allow.
	await context.route('https://www.dropbox.com/oauth2/authorize**', (route) => {
		const asked = new URL(route.request().url());
		expect(asked.searchParams.get('code_challenge_method')).toBe('S256');
		expect(asked.searchParams.get('token_access_type')).toBe('offline');
		const back = new URL(asked.searchParams.get('redirect_uri')!);
		back.searchParams.set('code', 'fake-code');
		back.searchParams.set('state', asked.searchParams.get('state')!);
		return route.fulfill({ status: 302, headers: { location: back.href } });
	});
	const page = await context.newPage();
	await openStudio(page, '/');
	let settings = await openCloudSave(page);
	await settings.getByRole('button', { name: 'Connect Dropbox' }).click();
	await page.waitForURL((url) => !url.searchParams.has('code'));
	settings = await openCloudSave(page);
	await expect(settings.getByText('someone@example.com')).toBeVisible();
	await expect(settings.getByText('Saved to the cloud')).toBeVisible();
	expect(page.url()).not.toContain('state=');

	await settings.getByRole('button', { name: 'Disconnect this device' }).click();
	await expect(settings.getByRole('button', { name: 'Connect Dropbox' })).toBeVisible();
	expect(uploaded(cloud)).toBe(true); // the cloud copy stays
});
