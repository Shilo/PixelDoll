import { enterStudio, noDisabledHover, openStudio } from './immersive-helpers.ts';
import { createHash } from 'node:crypto';
import { chromium, expect, test, type BrowserContext, type Page } from '@playwright/test';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { unzip, zip } from '../../src/lib/store/zip.ts';
import { decodePngBytes } from '../../src/lib/image/pngraw.ts';
import { readAseprite } from '../../src/lib/export/aseprite.ts';
import { EXPORT_SETTINGS_KEY } from '../../src/lib/store/export-settings.ts';
import { CURRENT_FORMAT, type Layer } from '../../src/lib/store/manifest.ts';
import type { StoredProject } from '../../src/lib/store/project.ts';
import { PAPERDOLL_JS } from '../../src/lib/export/phaser.ts';
import { runtimeTypes } from '../../src/lib/runtime/sources.ts';
import { travelSpeed } from '../../src/studio/experience/movement.ts';

async function captureWorkspaceStore(page: Page, projectKeys: string[], artworkKeys: string[]) {
	return page.evaluate(
		async ({ projectKeys, artworkKeys }) => {
			const dbPath = '/src/lib/store/db.ts';
			const db = await import(dbPath);
			return {
				projects: await Promise.all(
					projectKeys.map(async (key) => [key, await db.get('projects', key)])
				),
				artwork: await Promise.all(
					artworkKeys.map(async (key) => {
						const blob = (await db.get('blobs', key)) as Blob | undefined;
						if (!blob) return [key, null];
						const digest = new Uint8Array(
							await crypto.subtle.digest('SHA-256', await blob.arrayBuffer())
						);
						return [key, Array.from(digest, (byte) => byte.toString(16).padStart(2, '0')).join('')];
					})
				)
			};
		},
		{ projectKeys, artworkKeys }
	);
}

test('workspace ZIP isolates the library and PixelLab connection', async ({
	browser,
	page,
	context
}, info) => {
	const dev = info.config.projects.find((project) => project.name === 'browser-selftests')!.use
		.baseURL!;
	const requests: string[] = [];
	await context.route('https://*.pixellab.ai/**', (route) => {
		requests.push(new URL(route.request().url()).hostname);
		return route.abort();
	});
	await page.addInitScript(() => localStorage.setItem('pixeldoll.agentKey', 'off'));
	await openStudio(page, dev);
	const sample = await page.evaluate(async () => {
		const statePath = '/src/studio/state.svelte.ts',
			createPath = '/src/studio/create.ts',
			dbPath = '/src/lib/store/db.ts',
			dressPath = '/src/lib/dress/project.ts',
			pngPath = '/src/lib/image/pngraw.ts',
			rigPath = '/src/lib/rig/rig.ts';
		const state = await import(statePath),
			{ saveCopy } = await import(createPath),
			db = await import(dbPath),
			{ dressOf } = await import(dressPath),
			{ decodePngBytes, encodePngBytes } = await import(pngPath),
			{ cellHash } = await import(rigPath);
		const demoDress = structuredClone(dressOf(state.store.project.manifest));
		demoDress.presets[0] = { ...demoDress.presets[0], name: 'Tester demo outfit' };
		const { slots: _slots, ...demoWithoutSlots } = demoDress;
		await db.put('projects', 'dress-fixture:s2', demoWithoutSlots);
		const id = await saveCopy(state.store.project, 'Workspace Alpha');
		const saved = await db.get('projects', id);
		const other = structuredClone(saved);
		other.id = 'rig-workspace-beta';
		other.manifest.name = 'Workspace Beta';
		other.manifest.presets[0].name = 'Tester outfit';
		const item = saved.manifest.items.find((entry: { id: string }) => entry.id === 'vest_leather');
		for (const layer of item.layers) if (layer.cells?.walk) layer.cells.walk.south = [null];
		item.coverage = item.coverage?.filter((key: string) => !key.startsWith('walk/south/'));
		const otherItem = other.manifest.items.find((entry: { id: string }) => entry.id === item.id);
		otherItem.dressed = { ...otherItem.dressed, south: `sha256:${'1'.repeat(64)}` };
		const otherFrames = otherItem.layers.find((layer: Layer) => layer.cells?.walk?.south?.[0]).cells
			.walk.south;
		const original = await db.getBlob(otherFrames[0].slice(7));
		const unique = await decodePngBytes(new Uint8Array(await original.arrayBuffer()));
		const opaque = (unique.data as Uint8ClampedArray).findIndex(
			(alpha, offset) => offset % 4 === 3 && alpha === 255
		);
		if (opaque < 0) throw new Error('Expected an opaque fixture pixel');
		unique.data[opaque - 3] ^= 255;
		const uniqueHash = await cellHash(unique);
		await db.put(
			'blobs',
			uniqueHash.slice(7),
			new Blob([await encodePngBytes(unique)], { type: 'image/png' })
		);
		otherFrames[0] = uniqueHash;
		await db.put('projects', id, saved);
		await db.put('projects', other.id, other);
		await db.put('projects', 'studio-export-settings', {
			engine: 'unity',
			dressedCharacterSheets: false,
			playOnce: ['walk']
		});
		await db.put('jobs', 'workspace-evidence', {
			state: 'lost',
			tag: 'm3',
			endpoint: '/edit-animation-v2',
			createdAt: Date.now(),
			params: { secret: 'diagnostic-private-body' },
			jobs: []
		});
		localStorage.setItem('pixellabApiKey', 'fake-workspace-test-key-no-network');
		await state.refreshProjects();
		await state.openProject(id);
		state.ui.anim = 'walk';
		state.ui.selected = item.id;
		state.ui.dir = 'east';
		state.ui.theme = 'light';
		state.ui.playing = false;
		await db.put('projects', 'rig-damaged', {
			id: 'rig-damaged',
			origin: 'studio',
			manifest: null
		});
		return { id, otherId: other.id, item: item.id, uniqueHash: uniqueHash.slice(7) };
	});
	await page.getByRole('button', { name: 'More options', exact: true }).click();
	await expect(page.getByRole('link', { name: 'Open backup as a copy' })).toBeHidden();
	await page.getByRole('button', { name: 'Library backups...', exact: true }).click();
	const exportDialog = page.getByRole('dialog', { name: 'Settings' });
	const backUp = exportDialog.getByRole('button', { name: 'Back up library' });
	await expect(backUp).toBeVisible();
	const evidence = process.env.PIXELDOLL_WORKSPACE_EVIDENCE;
	if (evidence)
		await exportDialog.screenshot({
			path: join(evidence, '01-export-workspace.png'),
			animations: 'disabled'
		});
	await page.evaluate(async (id) => {
		const dbPath = '/src/lib/store/db.ts';
		const db = await import(dbPath);
		const saved = await db.get('projects', id);
		saved.manifest.name = localStorage.getItem('pixellabApiKey');
		await db.put('projects', id, saved);
	}, sample.otherId);
	await backUp.click();
	await expect(exportDialog.getByRole('alert')).toContainText(
		'A saved character contains the connected or remembered PixelLab key.'
	);
	await page.evaluate(async (id) => {
		const dbPath = '/src/lib/store/db.ts';
		const db = await import(dbPath);
		const saved = await db.get('projects', id);
		saved.manifest.name = 'Workspace Beta';
		await db.put('projects', id, saved);
	}, sample.otherId);
	const waitDownload = page.waitForEvent('download');
	await backUp.click();
	const download = await waitDownload;
	const backupFiles = await unzip(await readFile((await download.path())!));
	const backupText = new TextDecoder().decode(backupFiles.get('backup.json'));
	expect(backupText).not.toMatch(/fake-workspace-test-key|diagnostic-private-body/);
	expect(
		JSON.parse(backupText)
			.characters.map(([key]: [string, unknown]) => key)
			.sort()
	).toEqual([sample.id, sample.otherId].sort());
	const recipientContext = await browser.newContext({ viewport: { width: 360, height: 740 } });
	try {
		await recipientContext.route('https://*.pixellab.ai/**', (route) => route.abort());
		await recipientContext.addInitScript(() => localStorage.setItem('pixeldoll.agentKey', 'off'));
		const recipientPage = await recipientContext.newPage();
		await openStudio(recipientPage, dev);
		await recipientPage.getByRole('button', { name: 'Have a backup? Restore it' }).click();
		const picker = recipientPage.locator('input[type=file][accept=".zip,application/zip"]');
		const review = recipientPage.getByRole('region', { name: 'Review backup' });
		await picker.setInputFiles((await download.path())!);
		await expect(review).toBeFocused();
		await expect(review.getByText('Characters to add')).toBeVisible();
		await review.getByRole('button', { name: 'Restore', exact: true }).click();
		await expect(recipientPage.getByText('Added 2 characters.')).toBeVisible();
		await picker.setInputFiles((await download.path())!);
		await expect(review.getByRole('button', { name: 'Save', exact: true })).toBeDisabled();
		await expect(review.getByText('Already in your library')).toBeVisible();
	} finally {
		await recipientContext.close();
	}
	const archive = Buffer.from(
		await page.evaluate(async () => {
			const workspacePath = '/src/lib/store/workspace.ts';
			const activityPath = '/src/lib/pixellab/activity.ts';
			const statePath = '/src/studio/state.svelte.ts';
			const { ui, doc } = await import(statePath);
			const { apiActivity } = await import(activityPath);
			let calls: unknown[] = [];
			apiActivity.subscribe((value: unknown[]) => (calls = value))();
			const { bytes } = await (
				await import(workspacePath)
			).exportWorkspace(
				{
					project: doc.id,
					item: ui.selected,
					move: ui.anim,
					direction: ui.dir,
					frame: ui.frame,
					screen: 'characters',
					mode: 'preview',
					tab: ui.tab,
					theme: ui.theme
				},
				{ tier: null, calls },
				[localStorage.getItem('pixellabApiKey')]
			);
			return [...bytes];
		})
	);
	const files = await unzip(archive);
	const indexText = new TextDecoder().decode(files.get('workspace.json'));
	expect(indexText).not.toMatch(/fake-workspace-test-key|diagnostic-private-body/);
	const index = JSON.parse(indexText);
	expect(index.missing).toEqual(['1'.repeat(64)]);
	expect(index.omitted).toEqual({ characters: 1, demoOutfit: false, exportSettings: false });
	const projectKeys = ['dress-fixture:s2', sample.id, sample.otherId, EXPORT_SETTINGS_KEY].sort();
	const archivedProjects = new Map<string, StoredProject>(index.projects);
	expect([...archivedProjects.keys()].sort()).toEqual(projectKeys);
	const referenced = new Set<string>();
	const remember = (hash: string | null | undefined) => {
		if (hash) referenced.add(hash.replace(/^sha256:/, ''));
	};
	for (const id of [sample.id, sample.otherId]) {
		const manifest = archivedProjects.get(id)!.manifest;
		for (const pose of Object.values(manifest.rig.rest ?? {})) remember(pose?.image);
		for (const item of manifest.items) {
			for (const hash of Object.values(item.dressed ?? {})) remember(hash);
			for (const layer of item.layers)
				for (const directions of Object.values(layer.cells ?? {}))
					for (const cells of Object.values(directions ?? {}))
						for (const hash of cells ?? []) remember(hash);
		}
	}
	const artworkKeys = [...referenced].sort();
	expect(artworkKeys).toContain(sample.uniqueHash);
	expect([...files.keys()].sort()).toEqual([
		...artworkKeys.filter((hash) => !index.missing.includes(hash)).map((hash) => `blobs/${hash}`),
		'workspace.json'
	]);
	const expected = await captureWorkspaceStore(page, projectKeys, artworkKeys);
	expect(index.projects).toEqual(expected.projects);
	expect(
		artworkKeys.map((hash) => {
			const bytes = files.get(`blobs/${hash}`);
			return [hash, bytes ? createHash('sha256').update(bytes).digest('hex') : null];
		})
	).toEqual(expected.artwork);
	expect(index.diagnostics.errors).toContainEqual(
		expect.objectContaining({ tool: 'edit-animation-v2', outcome: 'lost' })
	);
	await exportDialog.getByRole('button', { name: 'Developer', exact: true }).click();
	await expect(exportDialog.getByRole('link', { name: 'Open backup as a copy' })).toBeHidden();
	await exportDialog.getByRole('switch', { name: 'Developer mode' }).check();
	const waitCopy = page.waitForEvent('popup');
	await exportDialog.getByRole('link', { name: 'Open backup as a copy' }).click();
	const copy = await waitCopy;
	await exportDialog.getByRole('button', { name: 'Close', exact: true }).click();
	const picker = copy.getByLabel('Choose backup ZIP');
	await expect(copy.getByRole('heading', { name: 'Open backup as a copy' })).toBeVisible();
	expect(new URL(copy.url()).origin).toBe(new URL(page.url()).origin);
	expect(new URL(copy.url()).search).toBe('?workspace-copy');
	await expect(copy.locator('html')).toHaveAttribute('data-app', 'studio');
	await picker.setInputFiles({
		name: 'damaged.zip',
		mimeType: 'application/zip',
		buffer: Buffer.from('not a ZIP')
	});
	await expect(copy.getByRole('alert')).toContainText('not a supported ZIP');
	const invalidDemo = structuredClone(index);
	invalidDemo.projects.find(([key]: [string, unknown]) => key === 'dress-fixture:s2')[1] = {
		format: CURRENT_FORMAT
	};
	const entries = [...files].map(([name, data]) => ({
		name,
		data: name === 'workspace.json' ? new TextEncoder().encode(JSON.stringify(invalidDemo)) : data
	}));
	const artwork = entries.filter(({ name }) => name.startsWith('blobs/'));
	const asset = artwork.find(({ name }) => name === `blobs/${sample.uniqueHash}`)!;
	const matchingSize = artwork.find(
		({ name, data }) =>
			name !== asset.name &&
			Buffer.from(data.subarray(16, 24)).equals(Buffer.from(asset.data.subarray(16, 24)))
	)!;
	asset.data = matchingSize.data;
	const tampered = await zip(entries);
	await page.evaluate(async ({ id, item }) => {
		const dbPath = '/src/lib/store/db.ts';
		const db = await import(dbPath);
		const recipient = await db.get('projects', id);
		recipient.manifest.name = 'Recipient existing character';
		recipient.manifest.items.find((entry: { id: string }) => entry.id === item).name =
			'Recipient existing item';
		await db.put('projects', id, recipient);
		await db.put('projects', 'studio-export-settings', {
			engine: 'godot',
			dressedCharacterSheets: true,
			playOnce: []
		});
		localStorage.setItem('pixeldoll.theme', 'dark');
		localStorage.setItem('pixeldoll.studio.project', 'rig-recipient-only');
		const unrelated = structuredClone(recipient);
		unrelated.id = 'rig-recipient-only';
		await db.put('projects', unrelated.id, unrelated);
	}, sample);
	const recipientKeys = [...projectKeys, 'rig-recipient-only', 'rig-damaged'];
	const recipient = await captureWorkspaceStore(page, recipientKeys, artworkKeys);
	const chooseZip = copy.waitForEvent('filechooser');
	await copy.getByRole('button', { name: /Drop a backup ZIP here/ }).click();
	await (
		await chooseZip
	).setFiles({
		name: 'legacy.workspace.zip',
		mimeType: 'application/zip',
		buffer: archive
	});
	await expect(
		copy.getByRole('status').filter({ hasText: 'Workspace copy · PixelLab off' })
	).toBeVisible();
	await expect(copy.locator('html')).toHaveAttribute('data-theme', 'light');
	expect(await captureWorkspaceStore(copy, projectKeys, artworkKeys)).toEqual(expected);
	expect(await captureWorkspaceStore(page, recipientKeys, artworkKeys)).toEqual(recipient);
	expect((await captureWorkspaceStore(copy, ['rig-recipient-only'], [])).projects).toEqual([
		['rig-recipient-only', undefined]
	]);
	await expect
		.poll(() =>
			copy.evaluate(async ({ id, otherId, item }) => {
				const dbPath = '/src/lib/store/db.ts',
					statePath = '/src/studio/state.svelte.ts',
					keyPath = '/src/lib/app.svelte.ts',
					dressPath = '/src/lib/dress/dress.ts';
				const db = await import(dbPath),
					{ ui, doc, store } = await import(statePath),
					{ app } = await import(keyPath);
				const { coverageGaps } = await import(dressPath);
				const manifest = store.project?.manifest;
				return {
					opened: doc.id === id && ui.anim === 'walk' && ui.selected === item && ui.dir === 'east',
					gap:
						manifest &&
						coverageGaps(
							manifest,
							manifest.items.find((entry: { id: string }) => entry.id === item)
						).includes('walk/south'),
					other: (await db.get('projects', otherId))?.manifest.name,
					hasKey: !!app.key,
					jobs: (await db.all('jobs')).length
				};
			}, sample)
		)
		.toEqual({ opened: true, gap: true, other: 'Workspace Beta', hasKey: false, jobs: 0 });
	const readSettings = () =>
		page.evaluate(() => ({
			theme: localStorage.getItem('pixeldoll.theme'),
			wardrobe: localStorage.getItem('pixeldoll.wardrobe.hideShared')
		}));
	const originalSettings = await readSettings();
	await copy.getByRole('button', { name: 'More options', exact: true }).click();
	await copy.getByRole('button', { name: 'Settings...', exact: true }).click();
	const copySettings = copy.getByRole('dialog', { name: 'Settings', exact: true });
	await expect(copySettings.getByRole('button', { name: 'PixelLab', exact: true })).toHaveCount(0);
	await copySettings.getByRole('button', { name: 'Appearance', exact: true }).click();
	await copySettings.getByRole('button', { name: 'Theme', exact: true }).click();
	await expect(copy.locator('html')).toHaveAttribute('data-theme', 'dark');
	await copySettings.getByRole('radio', { name: 'Light', exact: true }).check();
	await copySettings.getByRole('button', { name: 'Wardrobe', exact: true }).click();
	const sharedVisibility = copySettings.getByRole('switch', {
		name: 'Hide shared items in all wardrobes'
	});
	await sharedVisibility.check();
	await expect(sharedVisibility).toBeChecked();
	expect(await readSettings()).toEqual(originalSettings);
	await sharedVisibility.uncheck();
	await copySettings.getByRole('button', { name: 'Close', exact: true }).click();
	expect(await readSettings()).toEqual(originalSettings);
	expect(requests).toEqual([]);
	const copyKey = 'synthetic-workspace-tab-key';
	const savedKey = 'fake-workspace-test-key-no-network';
	let expectedCopyKey = copyKey;
	const copyRequests: string[] = [];
	let releaseEstimate!: () => void;
	const estimate = new Promise<void>((resolve) => (releaseEstimate = resolve));
	const balance = {
		subscription: { type: 'generations', status: 'active', generations: 42, total: 100 },
		credits: { usd: 0 }
	};
	await copy.route('https://api.pixellab.ai/**', async (route) => {
		const request = route.request();
		const path = new URL(request.url()).pathname;
		expect(request.headers().authorization === `Bearer ${expectedCopyKey}`).toBe(true);
		copyRequests.push(`${request.method()} ${path}`);
		if (path === '/v2/balance') return route.fulfill({ json: balance });
		await estimate;
		return route.fulfill({ status: 400, json: { detail: 'Synthetic estimate failure' } });
	});
	await copy.getByRole('button', { name: 'More options', exact: true }).click();
	await copy.getByRole('button', { name: 'Connect PixelLab...', exact: true }).click();
	const connect = copy.getByRole('dialog', { name: 'Connect PixelLab', exact: true });
	const useSavedKey = connect.getByRole('button', { name: 'Use saved key', exact: true });
	await expect(useSavedKey).toBeVisible();
	await expect(connect.getByLabel('API key', { exact: true })).toBeEmpty();
	expect(copyRequests).toEqual([]);
	await expect(connect.getByRole('checkbox', { name: 'Remember on this device' })).toHaveCount(0);
	await connect.getByLabel('API key', { exact: true }).fill(copyKey);
	await connect.getByRole('button', { name: 'Connect', exact: true }).click();
	await expect(connect).toBeHidden();
	await expect(
		copy.getByRole('status').filter({ hasText: 'Workspace copy · PixelLab off' })
	).toBeHidden();
	expect(copyRequests).toEqual(['GET /v2/balance']);
	const job = await copy.evaluate(async () => {
		const queuePath = '/src/lib/pixellab/queue.ts';
		const { queue } = await import(queuePath);
		return (await queue.enqueue({ method: 'POST', path: '/estimate-skeleton', body: {} })).id;
	});
	const blocksUnload = (tab: Page) =>
		tab.evaluate(() => !window.dispatchEvent(new Event('beforeunload', { cancelable: true })));
	try {
		await expect
			.poll(() => copyRequests.filter((request) => request.startsWith('POST ')))
			.toEqual(['POST /v2/estimate-skeleton']);
		await expect.poll(() => blocksUnload(copy)).toBe(true);
	} finally {
		releaseEstimate();
	}
	await expect.poll(() => blocksUnload(copy)).toBe(false);
	for (const [tab, present] of [
		[copy, true],
		[page, false]
	] as const) {
		expect(
			await tab.evaluate(async (id) => {
				const dbPath = '/src/lib/store/db.ts';
				const db = await import(dbPath);
				return !!(await db.get('jobs', id));
			}, job)
		).toBe(present);
	}
	await page.route('https://api.pixellab.ai/v2/balance', (route) =>
		route.fulfill({ json: balance })
	);
	const forgetMarker = await page.evaluate(async () => {
		const appPath = '/src/lib/app.svelte.ts';
		const { setKey } = await import(appPath);
		await setKey('fake-workspace-test-key-no-network', true);
		return localStorage.getItem('pixellabAuthForget');
	});
	await copy.getByRole('button', { name: 'More options', exact: true }).click();
	await copy.getByRole('button', { name: /^PixelLab usage/ }).click();
	await copy.getByRole('button', { name: 'Forget key', exact: true }).click();
	await expect(connect.getByLabel('API key', { exact: true })).toBeEmpty();
	await expect(
		copy.getByRole('status').filter({ hasText: 'Workspace copy · PixelLab off' })
	).toBeVisible();
	await connect.getByRole('button', { name: 'Cancel', exact: true }).click();
	await expect(
		await copy.evaluate(async (id) => {
			const statePath = '/src/studio/state.svelte.ts';
			const { doc, openProject } = await import(statePath);
			await openProject(id);
			return doc.id;
		}, sample.otherId)
	).toBe(sample.otherId);
	await copy.evaluate(async (id) => {
		const dbPath = '/src/lib/store/db.ts';
		const db = await import(dbPath);
		await db.deleteCharacter(id);
	}, sample.id);
	const original = await page.evaluate(async (id) => {
		const dbPath = '/src/lib/store/db.ts';
		const appPath = '/src/lib/app.svelte.ts';
		const db = await import(dbPath);
		return {
			name: (await db.get('projects', id))?.manifest.name,
			job: (await db.get('jobs', 'workspace-evidence'))?.state,
			keyKept: localStorage.getItem('pixellabApiKey') === 'fake-workspace-test-key-no-network',
			forgetMarker: localStorage.getItem('pixellabAuthForget'),
			connected: !!(await import(appPath)).app.key,
			theme: localStorage.getItem('pixeldoll.theme'),
			lastProject: localStorage.getItem('pixeldoll.studio.project')
		};
	}, sample.id);
	expect(original).toEqual({
		name: 'Recipient existing character',
		job: 'lost',
		keyKept: true,
		forgetMarker,
		connected: true,
		theme: 'dark',
		lastProject: 'rig-recipient-only'
	});
	expect(await captureWorkspaceStore(page, recipientKeys, artworkKeys)).toEqual(recipient);
	await copy.getByRole('button', { name: 'More options', exact: true }).click();
	await copy.getByRole('button', { name: 'Connect PixelLab...', exact: true }).click();
	expectedCopyKey = savedKey;
	const requestsBeforeSavedKey = copyRequests.length;
	await useSavedKey.click();
	await expect(connect).toBeHidden();
	expect(copyRequests.slice(requestsBeforeSavedKey)).toEqual(['GET /v2/balance']);
	expect(
		await copy.evaluate(async (expectedKey) => {
			const appPath = '/src/lib/app.svelte.ts';
			return {
				remembered: (await import(appPath)).app.remembered,
				keyKept: localStorage.getItem('pixellabApiKey') === expectedKey,
				forgetMarker: localStorage.getItem('pixellabAuthForget')
			};
		}, savedKey)
	).toEqual({ remembered: false, keyKept: true, forgetMarker });
	await page.evaluate(async () => {
		const appPath = '/src/lib/app.svelte.ts';
		(await import(appPath)).forgetKey();
	});
	await expect(
		copy.getByRole('status').filter({ hasText: 'Workspace copy · PixelLab off' })
	).toBeVisible();
	await copy.getByRole('button', { name: 'More options', exact: true }).click();
	await copy.getByRole('button', { name: 'Connect PixelLab...', exact: true }).click();
	await expect(connect.getByLabel('API key', { exact: true })).toBeVisible();
	await expect(useSavedKey).toHaveCount(0);
	await connect.getByRole('button', { name: 'Cancel', exact: true }).click();
	await copy.reload();
	await expect(copy.getByRole('heading', { name: 'Open backup as a copy' })).toBeVisible();
	await copy.goto(new URL('/?workspace-copy=', page.url()).href);
	const dropZone = copy.getByRole('button', { name: /Drop a backup ZIP here/ });
	await dropZone.evaluate((zone, encoded) => {
		const transfer = new DataTransfer();
		transfer.items.add(
			new File(
				[Uint8Array.from(atob(encoded), (byte) => byte.charCodeAt(0))],
				'partial.workspace.zip'
			)
		);
		zone.dispatchEvent(
			new DragEvent('drop', { dataTransfer: transfer, bubbles: true, cancelable: true })
		);
	}, Buffer.from(tampered).toString('base64'));
	await expect(copy.locator('.workspace-banner')).toBeVisible();
	const recovered = await captureWorkspaceStore(copy, projectKeys, artworkKeys);
	expect(recovered.projects).toEqual(
		expected.projects.map(([key, record]) => [key, key === 'dress-fixture:s2' ? undefined : record])
	);
	expect(recovered.artwork).toEqual(
		expected.artwork.map(([hash, digest]) => [hash, hash === sample.uniqueHash ? null : digest])
	);
	expect(await captureWorkspaceStore(page, recipientKeys, artworkKeys)).toEqual(recipient);
	await copy.goto(new URL('/?workspace-copy', info.project.use.baseURL!).href);
	await expect(
		copy.getByText('Enable Developer mode in Settings to open a backup as a copy.')
	).toBeVisible();
	await expect(picker).toHaveCount(0);
	await copy.evaluate(() => localStorage.setItem('pixeldoll.developerMode', '1'));
	await copy.reload();
	await expect(copy.getByRole('heading', { name: 'Open backup as a copy' })).toBeVisible();
	expect(new URL(copy.url()).origin).not.toBe(new URL(page.url()).origin);
	expect(
		await copy
			.locator('html')
			.evaluate((root) => getComputedStyle(root).getPropertyValue('--bu-accent').trim())
	).not.toBe('');
	await expect(copy.locator('.workspace-banner')).toHaveCount(0);
	if (evidence)
		await copy.screenshot({
			path: join(evidence, '02-open-workspace-copy.png'),
			animations: 'disabled',
			fullPage: true
		});
	await picker.setInputFiles({
		name: download.suggestedFilename(),
		mimeType: 'application/zip',
		buffer: archive
	});
	await expect(copy.locator('.workspace-banner')).toBeVisible();
	await expect(copy.locator('html')).toHaveAttribute('data-theme', 'light');
	await expect(copy.locator('.project-btn')).toContainText('Workspace Alpha');
	const warning = copy.locator('.world-coverage').filter({ hasText: /missing .* frames/ });
	await expect(warning).toBeVisible();
	const bannerBounds = (await copy.locator('.workspace-banner').boundingBox())!;
	const warningBounds = (await warning.boundingBox())!;
	expect(bannerBounds.y + bannerBounds.height).toBeLessThan(warningBounds.y);
	if (evidence)
		await copy.screenshot({
			path: join(evidence, '03-workspace-copy-open.png'),
			animations: 'disabled'
		});
	expect(requests).toEqual([]);
});

async function savedExport(page: Page, dev: string) {
	await page.setViewportSize({ width: 800, height: 600 }); // Eight parallel settings runs do not need eight full-size animated worlds.
	await page.addInitScript(() => {
		localStorage.setItem('pixeldoll.agentKey', 'off');
		localStorage.setItem('pixeldoll.welcomed', '1');
	});
	await page.route('https://*.pixellab.ai/**', (route) => route.abort());
	await openStudio(page, dev);
	await page.evaluate(async () => {
		const statePath = '/src/studio/state.svelte.ts',
			createPath = '/src/studio/create.ts',
			rigPath = '/src/lib/rig/rig.ts';
		const state = await import(statePath),
			{ saveCopy } = await import(createPath),
			{ baseHashOf } = await import(rigPath);
		const source = state.store.project,
			manifest = structuredClone(source.manifest);
		const body = manifest.items.find((item: { id: string }) => item.id === manifest.rig.baseItem);
		// The real demo is covered by the existing export tests. Settings need only two small clips and saved outfits.
		manifest.items = [body];
		manifest.slots = manifest.slots.filter((slot: { id: string }) => slot.id === body.slot);
		manifest.materials = manifest.materials.filter(
			(material: { owner: string }) => material.owner === body.id
		);
		manifest.presets = manifest.presets.map((preset: object) => ({
			...preset,
			items: { body: body.id },
			variants: {}
		}));
		manifest.rig.directions = [{ id: 'south' }];
		delete manifest.rig.rest;
		delete manifest.rig.anchors;
		const hashes: Record<string, string> = {},
			used = new Set<string>();
		for (const animation of manifest.rig.animations) {
			animation.cells = 2;
			animation.loop = true;
			animation.frames = [
				{ cell: 0, ms: 100 },
				{ cell: 1, ms: 100 }
			];
			delete animation.sources;
			for (const layer of body.layers) {
				layer.cells[animation.id] = { south: layer.cells[animation.id].south.slice(0, 2) };
				layer.cells[animation.id].south.forEach((hash: string, index: number) => {
					used.add(hash);
					hashes[`${animation.id}/south/${index}`] = hash;
				});
			}
		}
		manifest.rig.baseHash = await baseHashOf(manifest.rig, hashes);
		body.baseHash = manifest.rig.baseHash;
		const images = new Map([...source.images].filter(([hash]) => used.has(hash)));
		const id = await saveCopy({ manifest, images }, 'Export settings test');
		await state.refreshProjects();
		await state.openProject(id);
	});
	await page.getByRole('button', { name: 'Export', exact: true }).click();
	await expect(
		page.getByRole('dialog').getByRole('radio', { name: 'Godot', exact: true })
	).toBeEnabled();
}

async function holdProjectTransaction(
	page: Page,
	mode: IDBTransactionMode,
	target: 'settings' | 'character' = 'settings'
) {
	await page.evaluate(
		({ mode, target, key }) => {
			const host = window as unknown as {
				__studio: { doc: { id: string } };
				exportTransaction: { ready: boolean; release: () => void; reject: () => void };
			};
			const unfinished = () => {
				throw new Error('Transaction has not finished yet');
			};
			const hold: { ready: boolean; release: () => void; reject: () => void } =
				(host.exportTransaction = { ready: false, release: unfinished, reject: unfinished });
			const original = IDBObjectStore.prototype.get;
			IDBObjectStore.prototype.get = function (query) {
				const request = original.call(this, query);
				if (
					this.name === 'projects' &&
					query === (target === 'character' ? host.__studio.doc.id : key) &&
					this.transaction.mode === mode
				) {
					IDBObjectStore.prototype.get = original;
					const transaction = this.transaction;
					Object.defineProperty(transaction, 'oncomplete', {
						set(callback: (this: IDBTransaction, event: Event) => void) {
							transaction.addEventListener(
								'complete',
								(event) => {
									hold.ready = true;
									hold.release = () => callback.call(transaction, event);
									hold.reject = () => {
										Object.defineProperty(transaction, 'error', {
											value: new DOMException('Synthetic stale read failure', 'UnknownError')
										});
										transaction.dispatchEvent(new Event('error'));
									};
								},
								{ once: true }
							);
						}
					});
				}
				return request;
			};
		},
		{ mode, target, key: EXPORT_SETTINGS_KEY }
	);
}

async function releaseProjectTransaction(page: Page) {
	await page.evaluate(() =>
		(
			window as unknown as { exportTransaction: { release: () => void } }
		).exportTransaction.release()
	);
}

test('externally refreshed playback settings rebuild the already prepared ZIP', async ({
	page
}, info) => {
	await savedExport(
		page,
		info.config.projects.find((project) => project.name === 'browser-selftests')!.use.baseURL!
	);
	const dialog = page.getByRole('dialog');
	await dialog.getByRole('radio', { name: 'PNG + JSON', exact: true }).check();
	const button = dialog.getByRole('button', { name: /^Download ZIP/ });
	await expect(button).toBeEnabled();
	await page.evaluate(async () => {
		const path = '/src/lib/store/export-settings.ts';
		const { saveExportSetting } = await import(path);
		await saveExportSetting({ animation: 'walk', playOnce: true });
	});
	await expect(dialog.locator('.export-summary dd').first()).toHaveText('Walk');
	await expect(button).toBeEnabled();
	const [download] = await Promise.all([page.waitForEvent('download'), button.click()]);
	const files = await unzip(new Uint8Array(await readFile((await download.path())!)));
	const manifest = JSON.parse(new TextDecoder().decode(files.get('manifest.json')!));
	expect(manifest.rig.animations.find((move: { id: string }) => move.id === 'walk').loop).toBe(
		false
	);
});

test('loading global preferences preserves native focus and permits settings navigation before the read completes', async ({
	page
}, info) => {
	await savedExport(
		page,
		info.config.projects.find((p) => p.name === 'browser-selftests')!.use.baseURL!
	);
	await page.getByRole('button', { name: 'Close export' }).click();
	await holdProjectTransaction(page, 'readonly');
	await page.getByRole('button', { name: 'Export', exact: true }).click();
	const dialog = page.getByRole('dialog');
	await expect
		.poll(() =>
			page.evaluate(
				() =>
					(window as unknown as { exportTransaction: { ready: boolean } }).exportTransaction.ready
			)
		)
		.toBe(true);
	await expect(dialog.getByRole('button', { name: 'Settings', exact: true })).toBeFocused();
	await expect(dialog.getByRole('radio', { name: 'Godot', exact: true })).toBeDisabled();
	await dialog.getByRole('button', { name: 'Settings', exact: true }).click();
	const back = dialog.getByRole('button', { name: 'Back', exact: true });
	await expect(back).toBeFocused();
	await expect(dialog.getByRole('status')).toHaveText('Loading export settings…');
	const dressed = dialog.getByRole('checkbox', {
		name: 'Include dressed character sheets',
		exact: true
	});
	await expect(dressed).toBeDisabled();
	await releaseProjectTransaction(page);
	await expect(dressed).toBeEnabled();
	await expect(back).toBeFocused();
	await expect(dialog.getByRole('status')).toHaveCount(0);
});

test('a committed earlier format and a failed latest format keep the write error visible after refresh', async ({
	page
}, info) => {
	await savedExport(
		page,
		info.config.projects.find((p) => p.name === 'browser-selftests')!.use.baseURL!
	);
	const dialog = page.getByRole('dialog');
	await expect(dialog.getByRole('button', { name: 'Settings', exact: true })).toBeEnabled();
	await holdProjectTransaction(page, 'readwrite');
	await dialog.getByRole('radio', { name: 'Unity', exact: true }).check();
	await expect
		.poll(() =>
			page.evaluate(
				() =>
					(window as unknown as { exportTransaction: { ready: boolean } }).exportTransaction.ready
			)
		)
		.toBe(true);
	await page.evaluate((key) => {
		const original = IDBObjectStore.prototype.put;
		IDBObjectStore.prototype.put = function (value, id) {
			if (this.name === 'projects' && id === key) {
				IDBObjectStore.prototype.put = original;
				throw new Error('Latest format could not save');
			}
			return original.call(this, value, id);
		};
		window.dispatchEvent(new Event('focus')); // Queue a refresh while the first completion is held.
	}, EXPORT_SETTINGS_KEY);
	await dialog.getByRole('radio', { name: 'Phaser', exact: true }).check();
	await expect(dialog.getByRole('alert')).toContainText(
		'Could not save export settings. Try again.'
	);
	await releaseProjectTransaction(page);
	await expect(dialog.getByRole('radio', { name: 'Unity', exact: true })).toBeChecked();
	await expect(dialog.getByRole('button', { name: /^Download ZIP/ })).toBeEnabled();
	await expect(dialog.getByRole('alert')).toContainText(
		'Could not save export settings. Try again.'
	);
});

test('a stale rejected global refresh cannot block a newer successful format save', async ({
	page
}, info) => {
	await savedExport(
		page,
		info.config.projects.find((p) => p.name === 'browser-selftests')!.use.baseURL!
	);
	const dialog = page.getByRole('dialog');
	await expect(dialog.getByRole('button', { name: 'Settings', exact: true })).toBeEnabled();
	await page.evaluate(() => {
		const original = BroadcastChannel.prototype.postMessage;
		BroadcastChannel.prototype.postMessage = function (value) {
			if (this.name !== 'pixeldoll-export-settings') original.call(this, value);
		};
	}); // Keep the held read as the latest request; this test isolates its stale rejection guard.
	await holdProjectTransaction(page, 'readonly');
	await page.evaluate(() => window.dispatchEvent(new Event('focus')));
	await expect
		.poll(() =>
			page.evaluate(
				() =>
					(window as unknown as { exportTransaction: { ready: boolean } }).exportTransaction.ready
			)
		)
		.toBe(true);
	await dialog.getByRole('radio', { name: 'Unity', exact: true }).check();
	await expect(dialog.getByRole('button', { name: 'Settings', exact: true })).toBeEnabled();
	// Release the held transaction as a failed read, after the newer write has committed.
	await page.evaluate(() =>
		(window as unknown as { exportTransaction: { reject: () => void } }).exportTransaction.reject()
	);
	await expect(dialog.getByRole('button', { name: /^Download ZIP/ })).toBeEnabled();
	await expect(dialog.getByRole('radio', { name: 'Unity', exact: true })).toBeChecked();
	await expect(dialog.getByRole('alert')).toHaveCount(0);
});

test('global Export choices survive a browser restart, character changes and dynamic move names', async ({}, info) => {
	const dev = info.config.projects.find((p) => p.name === 'browser-selftests')!.use.baseURL!;
	// Chromium's IndexedDB paths can exceed Windows limits under a descriptive test output directory.
	const profile = await mkdtemp(join(tmpdir(), 'pd-export-'));
	const launch = async () => {
		const context = await chromium.launchPersistentContext(profile, {
			locale: 'en-US',
			headless: true,
			channel: info.project.use.channel,
			args: info.project.use.launchOptions?.args, // persistent launches skip the config's offline guard
			viewport: { width: 800, height: 600 }
		});
		await context.addInitScript(() => {
			localStorage.setItem('pixeldoll.agentKey', 'off');
			localStorage.setItem('pixeldoll.welcomed', '1');
		});
		await context.route('https://*.pixellab.ai/**', (route) => route.abort());
		return context;
	};
	let context: BrowserContext | undefined;
	try {
		context = await launch();
		let page = context.pages()[0];
		await savedExport(page, dev);
		let dialog = page.getByRole('dialog');
		await dialog.getByRole('radio', { name: 'Unity', exact: true }).check();
		await dialog.getByRole('button', { name: 'Settings', exact: true }).click();
		await dialog.getByRole('checkbox', { name: 'Walk', exact: true }).check();
		let dressed = dialog.getByRole('checkbox', {
			name: 'Include dressed character sheets',
			exact: true
		});
		await expect(dressed).toBeEnabled();
		await dressed.uncheck();
		await expect(dressed).toBeEnabled();
		await dialog.getByRole('button', { name: 'Close export' }).click();
		const identities = await page.evaluate(async () => {
			const statePath = '/src/studio/state.svelte.ts',
				importPath = '/src/lib/store/import.ts';
			const s = await import(statePath),
				{ saveImportedCharacter } = await import(importPath);
			const first = s.doc.id,
				project = { ...s.store.project, manifest: structuredClone(s.store.project.manifest) };
			project.manifest.rig.animations.forEach((move: { loop: boolean }) => {
				move.loop = false;
			}); // Imported metadata must not seed global preferences.
			const second = await saveImportedCharacter(
				{ project, extra: {}, warnings: [] },
				'Second character'
			);
			await s.refreshProjects();
			await s.openProject(second);
			return { first, second };
		});
		await page.getByRole('button', { name: 'Export', exact: true }).click();
		await expect(dialog.getByRole('radio', { name: 'Unity', exact: true })).toBeChecked();
		await expect(dialog.locator('.export-summary dd')).toHaveText(['Walk', 'None']);
		await dialog.getByRole('radio', { name: 'Phaser', exact: true }).check();
		await dialog.getByRole('button', { name: 'Settings', exact: true }).click();
		await expect(dialog.getByRole('checkbox', { name: 'Walk', exact: true })).toHaveCount(1);
		await expect(dialog.getByRole('checkbox', { name: 'Walk', exact: true })).toBeChecked();
		await expect(
			dialog.getByRole('checkbox', { name: 'Cross punch', exact: true })
		).not.toBeChecked();
		await dressed.check();
		await expect(dressed).toBeEnabled();
		await dialog.getByRole('button', { name: 'Close export' }).click();
		await page.evaluate(async (ids) => {
			const statePath = '/src/studio/state.svelte.ts',
				dbPath = '/src/lib/store/db.ts',
				rigPath = '/src/lib/rig/rig.ts';
			const s = await import(statePath),
				db = await import(dbPath),
				{ baseHashOf } = await import(rigPath);
			await s.renameProject('Renamed second character');
			const record = await db.get('projects', ids.first),
				m = record.manifest;
			const walk = m.rig.animations.find((a: { id: string }) => a.id === 'walk');
			walk.id = 'renamed-walk';
			walk.frames[0].ms = 80;
			m.rig.animations = [walk, { ...structuredClone(walk), id: 'new-move', loop: true }];
			const hashes: Record<string, string> = {};
			for (const layer of m.items[0].layers) {
				const cells = layer.cells.walk;
				layer.cells = { 'renamed-walk': cells, 'new-move': structuredClone(cells) };
				for (const id of ['renamed-walk', 'new-move'])
					layer.cells[id].south.forEach((hash: string, i: number) => {
						hashes[id + '/south/' + i] = hash;
					});
			}
			m.rig.baseHash = await baseHashOf(m.rig, hashes);
			m.items[0].baseHash = m.rig.baseHash;
			await db.put('projects', ids.first, record);
			await s.openProject(ids.first);
		}, identities);
		await page.evaluate(() => location.reload());
		await enterStudio(page);
		await page.getByRole('button', { name: 'Export', exact: true }).click();
		await expect(dialog.getByRole('radio', { name: 'Phaser', exact: true })).toBeChecked();
		await expect(dialog.locator('.export-summary dd')).toHaveText([
			'Walk',
			'Current look + saved outfits'
		]);
		await dialog.getByRole('button', { name: 'Close export' }).click();
		await context.close(); // Close the actual browser process, retaining only its on-disk profile.
		context = await launch();
		page = context.pages()[0];
		dialog = page.getByRole('dialog');
		await openStudio(page, dev);
		await page.getByRole('button', { name: 'Export', exact: true }).click();
		await expect(dialog.getByRole('radio', { name: 'Phaser', exact: true })).toBeChecked();
		await dialog.getByRole('button', { name: 'Settings', exact: true }).click();
		await expect(dialog.getByRole('checkbox', { name: 'Walk', exact: true })).toBeChecked();
		await expect(
			dialog.getByRole('checkbox', { name: 'Renamed walk', exact: true })
		).not.toBeChecked();
		await expect(dialog.getByRole('checkbox', { name: 'New move', exact: true })).not.toBeChecked();
		await expect(
			dialog.getByRole('checkbox', { name: 'Cross punch', exact: true })
		).not.toBeChecked();
		await dialog.getByRole('button', { name: 'Back', exact: true }).click();
		const button = dialog.getByRole('button', { name: /^Download ZIP/ });
		await expect(button).toBeEnabled();
		const [download] = await Promise.all([page.waitForEvent('download'), button.click()]);
		const zip = await unzip(new Uint8Array(await readFile((await download.path())!)));
		const firstExport = JSON.parse(new TextDecoder().decode(zip.get('manifest.json')!));
		expect(
			firstExport.rig.animations.map((move: { id: string; loop: boolean }) => [move.id, move.loop])
		).toEqual([
			['renamed-walk', true],
			['new-move', true]
		]);
		await page.evaluate(async (second) => {
			const path = '/src/studio/state.svelte.ts',
				s = await import(path);
			await s.openProject(second);
		}, identities.second);
		await page.getByRole('button', { name: 'Export', exact: true }).click();
		await expect(dialog.getByRole('radio', { name: 'Phaser', exact: true })).toBeChecked();
		await expect(button).toBeEnabled();
		const [secondDownload] = await Promise.all([page.waitForEvent('download'), button.click()]);
		const secondZip = await unzip(new Uint8Array(await readFile((await secondDownload.path())!)));
		const secondExport = JSON.parse(new TextDecoder().decode(secondZip.get('manifest.json')!));
		expect(
			secondExport.rig.animations.find((move: { id: string }) => move.id === 'walk').loop
		).toBe(false);
		expect(
			secondExport.rig.animations.find((move: { id: string }) => move.id === 'cross-punch').loop
		).toBe(true);
		expect(
			await page.evaluate(async (ids) => {
				const path = '/src/lib/store/db.ts',
					db = await import(path);
				const [a, b] = await Promise.all([
					db.get('projects', ids.first),
					db.get('projects', ids.second)
				]);
				return [
					a.manifest.rig.animations.map((move: { loop: boolean }) => move.loop),
					b.manifest.rig.animations.map((move: { loop: boolean }) => move.loop)
				];
			}, identities)
		).toEqual([
			[true, true],
			[false, false]
		]);
		await expect(
			page.getByRole('heading', { name: 'Renamed second character', exact: true })
		).toHaveCount(1);
	} finally {
		try {
			await context?.close();
		} finally {
			await rm(profile, { recursive: true, force: true });
		}
	}
});

test('global Export choices persist through demo reload, editable copying and character switching', async ({
	page
}, info) => {
	await page.setViewportSize({ width: 800, height: 600 });
	await page.addInitScript(() => {
		localStorage.setItem('pixeldoll.agentKey', 'off');
		localStorage.setItem('pixeldoll.welcomed', '1');
	});
	await page.route('https://*.pixellab.ai/**', (route) => route.abort());
	await openStudio(
		page,
		info.config.projects.find((p) => p.name === 'browser-selftests')!.use.baseURL!
	);
	await page.getByRole('button', { name: 'Export', exact: true }).click();
	const dialog = page.getByRole('dialog');
	await dialog.getByRole('radio', { name: 'Phaser', exact: true }).check();
	await dialog.getByRole('button', { name: 'Settings', exact: true }).click();
	await dialog.getByRole('checkbox', { name: 'Walk', exact: true }).check();
	const dressed = dialog.getByRole('checkbox', {
		name: 'Include dressed character sheets',
		exact: true
	});
	await expect(dressed).toBeEnabled();
	const help = dialog.getByText(/^Adds PNG sprite sheets/);
	await expect(dressed).toHaveAccessibleDescription(/^Adds PNG sprite sheets/);
	const initiallyDressed = await dressed.isChecked();
	await help.scrollIntoViewIfNeeded();
	const [start, word, end] = await help.evaluate(async (element) => {
		await Promise.all(
			element
				.closest('.export-page')!
				.getAnimations()
				.map((animation) => animation.finished)
		);
		const text = element.firstChild!;
		const range = document.createRange();
		return [0, 2, 18].map((offset) => {
			range.setStart(text, offset);
			range.setEnd(text, offset + 1);
			const { x, y, width, height } = range.getBoundingClientRect();
			return { x: x + (offset === 0 ? 1 : width / 2), y: y + height / 2 };
		});
	});
	await page.mouse.move(start.x, start.y);
	await page.mouse.down();
	await page.mouse.move(end.x, end.y, { steps: 6 });
	await page.mouse.up();
	expect(await page.evaluate(() => window.getSelection()?.toString())).toMatch(/sprite/);
	await expect(dressed).toBeChecked({ checked: initiallyDressed });
	await page.evaluate(() => window.getSelection()?.removeAllRanges());
	await page.mouse.click(word.x, word.y);
	await expect(dressed).toBeChecked({ checked: initiallyDressed });
	await page.mouse.dblclick(word.x, word.y);
	expect(await page.evaluate(() => window.getSelection()?.toString().trim())).toBe('Adds');
	await expect(dressed).toBeChecked({ checked: initiallyDressed });
	const labelText = dialog
		.locator('label span')
		.getByText('Include dressed character sheets', { exact: true });
	const labelBounds = (await labelText.boundingBox())!;
	await page.evaluate(() => window.getSelection()?.removeAllRanges());
	await page.mouse.move(labelBounds.x + 8, labelBounds.y + labelBounds.height / 2);
	await page.mouse.down();
	await page.mouse.move(end.x, end.y, { steps: 6 });
	await page.mouse.up();
	expect(await page.evaluate(() => window.getSelection()?.toString())).toBe('');
	await expect(dressed).toBeChecked({ checked: initiallyDressed });
	await labelText.click();
	await expect(dressed).toBeChecked({ checked: !initiallyDressed });
	if (!initiallyDressed) await labelText.click();
	await expect(dressed).not.toBeChecked();
	await expect(dressed).toBeEnabled();
	await dialog.getByRole('button', { name: 'Close export' }).click();
	await page.evaluate(() => location.reload());
	await enterStudio(page);
	await page.getByRole('button', { name: 'Export', exact: true }).click();
	await expect(dialog.getByRole('radio', { name: 'Phaser', exact: true })).toBeChecked();
	await expect(dialog.locator('.export-summary dd')).toHaveText(['Walk', 'None']);
	await dialog.getByRole('button', { name: 'Close export' }).click();
	const copy = await page.evaluate(async () => {
		const statePath = '/src/studio/state.svelte.ts',
			createPath = '/src/studio/create.ts';
		const s = await import(statePath),
			{ saveCopy } = await import(createPath),
			id = await saveCopy(s.store.project, 'Demo copy');
		await s.refreshProjects();
		await s.openProject(id);
		return id;
	});
	await page.getByRole('button', { name: 'Export', exact: true }).click();
	await expect(dialog.getByRole('radio', { name: 'Phaser', exact: true })).toBeChecked();
	await expect(dialog.locator('.export-summary dd')).toHaveText(['Walk', 'None']);
	await dialog.getByRole('radio', { name: 'Unity', exact: true }).check();
	await expect(dialog.getByRole('button', { name: 'Close export' })).toBeEnabled();
	await dialog.getByRole('button', { name: 'Close export' }).click();
	await page.evaluate(async () => {
		const path = '/src/studio/state.svelte.ts',
			s = await import(path);
		await s.openProject(s.DEMO);
	});
	const same = await page.evaluate(async () => {
		const statePath = '/src/studio/state.svelte.ts',
			createPath = '/src/studio/create.ts';
		const s = await import(statePath),
			{ saveCopy } = await import(createPath);
		return saveCopy(s.store.project, 'Should reopen existing copy');
	});
	expect(same).toBe(copy);
	await page.evaluate(async (id) => {
		const path = '/src/studio/state.svelte.ts',
			s = await import(path);
		await s.openProject(id);
	}, copy);
	await page.getByRole('button', { name: 'Export', exact: true }).click();
	await expect(dialog.getByRole('radio', { name: 'Unity', exact: true })).toBeChecked();
	await dialog.getByRole('button', { name: 'Close export' }).click();
	await page.evaluate(async () => {
		const path = '/src/studio/state.svelte.ts',
			s = await import(path);
		await s.openProject(s.DEMO);
	});
	await page.getByRole('button', { name: 'Export', exact: true }).click();
	await expect(dialog.getByRole('radio', { name: 'Unity', exact: true })).toBeChecked();
	await expect(dialog.locator('.export-summary dd')).toHaveText(['Walk', 'None']);
});

test('two tabs merge independent Export saves and refresh on reactivation without losing keyboard focus', async ({
	page,
	context
}, info) => {
	const dev = info.config.projects.find((p) => p.name === 'browser-selftests')!.use.baseURL!;
	await context.route('https://*.pixellab.ai/**', (route) => route.abort());
	await context.addInitScript(() => {
		localStorage.setItem('pixeldoll.agentKey', 'off');
		localStorage.setItem('pixeldoll.welcomed', '1');
	});
	await savedExport(page, dev);
	const second = await context.newPage();
	await second.setViewportSize({ width: 800, height: 600 });
	await openStudio(second, dev);
	await second.getByRole('button', { name: 'Export', exact: true }).click();
	const a = page.getByRole('dialog'),
		b = second.getByRole('dialog');
	await a.getByRole('radio', { name: 'Unity', exact: true }).check();
	await expect(a.getByRole('button', { name: 'Settings', exact: true })).toBeEnabled();
	await b.getByRole('button', { name: 'Settings', exact: true }).click();
	const dressed = b.getByRole('checkbox', {
		name: 'Include dressed character sheets',
		exact: true
	});
	await dressed.uncheck();
	await expect(dressed).toBeEnabled();
	await b.getByRole('button', { name: 'Back', exact: true }).click();
	await expect(b.getByRole('radio', { name: 'Unity', exact: true })).toBeChecked();
	await a.getByRole('button', { name: 'Settings', exact: true }).click();
	const walk = a.getByRole('checkbox', { name: 'Walk', exact: true });
	await walk.focus();
	await page.evaluate(() => window.dispatchEvent(new Event('focus')));
	await expect(
		a.getByRole('checkbox', { name: 'Include dressed character sheets', exact: true })
	).not.toBeChecked();
	await expect(walk).toBeFocused();
	await walk.check();
	await expect(walk).toBeEnabled();
	await b.getByRole('radio', { name: 'PNG + JSON', exact: true }).check();
	await expect(b.getByRole('button', { name: 'Settings', exact: true })).toBeEnabled();
	await expect(b.locator('.export-summary dd')).toHaveText(['Walk', 'None']);
	const button = b.getByRole('button', { name: /^Download ZIP/ });
	await expect(button).toBeEnabled();
	const [download] = await Promise.all([second.waitForEvent('download'), button.click()]);
	const zip = await unzip(new Uint8Array(await readFile((await download.path())!)));
	const manifest = JSON.parse(new TextDecoder().decode(zip.get('manifest.json')!));
	expect(manifest.export.engines).toEqual(['generic']);
	expect([...zip.keys()].some((name) => name.startsWith('baked/'))).toBe(false);
	expect(manifest.rig.animations.find((move: { id: string }) => move.id === 'walk').loop).toBe(
		false
	);
});

test('a same-character reload cannot replace export choices saved after its read started', async ({
	page
}, info) => {
	await savedExport(
		page,
		info.config.projects.find((p) => p.name === 'browser-selftests')!.use.baseURL!
	);
	const dialog = page.getByRole('dialog');
	await dialog.getByRole('button', { name: 'Settings', exact: true }).click();
	for (const kind of ['animation', 'dressed']) {
		await holdProjectTransaction(page, 'readonly', 'character');
		await page.evaluate(async () => {
			const path = '/src/studio/state.svelte.ts',
				state = await import(path);
			(window as unknown as { exportReload: Promise<void> }).exportReload = state.openProject(
				state.doc.id,
				{ quiet: true }
			);
		});
		await expect
			.poll(() =>
				page.evaluate(
					() =>
						(window as unknown as { exportTransaction: { ready: boolean } }).exportTransaction.ready
				)
			)
			.toBe(true);
		const input =
			kind === 'animation'
				? dialog.locator('.export-moves input').first()
				: dialog.getByRole('checkbox', { name: 'Include dressed character sheets', exact: true });
		const wanted = !(await input.isChecked());
		await input.setChecked(wanted);
		await expect(input).toBeEnabled();
		await releaseProjectTransaction(page);
		await page.evaluate(
			async () => await (window as unknown as { exportReload: Promise<void> }).exportReload
		);
		if (wanted) await expect(input).toBeChecked();
		else await expect(input).not.toBeChecked();
		const saved = await page.evaluate(async (kind) => {
			const path = '/src/lib/store/export-settings.ts',
				{ readExportSettings } = await import(path);
			const settings = await readExportSettings();
			return kind === 'animation'
				? settings.playOnce.includes('cross-punch')
				: settings.dressedCharacterSheets;
		}, kind);
		expect(saved).toBe(wanted);
	}
});

test('pending export settings saves block conflicting actions and restore keyboard focus when complete', async ({
	page
}, info) => {
	await savedExport(
		page,
		info.config.projects.find((p) => p.name === 'browser-selftests')!.use.baseURL!
	);
	const dialog = page.getByRole('dialog');
	await dialog.getByRole('button', { name: 'Settings', exact: true }).click();
	const input = dialog.locator('.export-moves input').first();
	await holdProjectTransaction(page, 'readwrite');
	await input.focus();
	await input.press('Space');
	await expect
		.poll(() =>
			page.evaluate(
				() =>
					(window as unknown as { exportTransaction: { ready: boolean } }).exportTransaction.ready
			)
		)
		.toBe(true);
	await expect(input).toBeDisabled();
	await expect(dialog.getByRole('button', { name: 'Back', exact: true })).toBeDisabled();
	await expect(dialog.getByRole('button', { name: 'Close export' })).toBeDisabled();
	await expect(
		dialog.getByRole('checkbox', { name: 'Include dressed character sheets', exact: true })
	).toBeDisabled();
	await page.keyboard.press('Escape');
	await expect(dialog).toBeVisible();
	await releaseProjectTransaction(page);
	await expect(input).toBeEnabled();
	await expect(input).toBeChecked();
	await expect(input).toBeFocused();
	await page.keyboard.press('Tab');
	await expect(dialog.locator('.export-moves input').nth(1)).toBeFocused();
});

test('an older ZIP finishing last cannot replace the latest engine and settings export', async ({
	page
}, info) => {
	await savedExport(
		page,
		info.config.projects.find((p) => p.name === 'browser-selftests')!.use.baseURL!
	);
	const dialog = page.getByRole('dialog'),
		download = dialog.getByRole('button', { name: /^Download ZIP/ });
	await dialog.getByRole('radio', { name: 'Unity', exact: true }).check();
	await expect(download).toBeEnabled();
	await dialog.getByText('Files included', { exact: true }).click();
	const entries = (await dialog.locator('pre').innerText()).trim().split('\n').length;
	await page.evaluate((expected) => {
		const host = window as unknown as {
			exportZipGate: { entered: boolean; finished: number; release: () => void };
		};
		let release!: () => void,
			first = true,
			released = false;
		const gate = new Promise<void>((resolve) => {
			release = resolve;
		});
		const state: { entered: boolean; finished: number; release: () => void } = (host.exportZipGate =
			{
				entered: false,
				finished: 0,
				release: () => {
					released = true;
					release();
				}
			});
		const Native = CompressionStream;
		window.CompressionStream = new Proxy(Native, {
			construct(target, args) {
				const stream = Reflect.construct(target, args) as CompressionStream;
				if (args[0] !== 'deflate-raw') return stream;
				const held = first;
				first = false;
				if (!held && !released) return stream; // The newer ZIP is allowed to finish first.
				return {
					writable: stream.writable,
					readable: stream.readable.pipeThrough(
						new TransformStream({
							async flush() {
								if (held) {
									state.entered = true;
									await gate;
								}
								state.finished++;
								if (state.finished === expected) window.CompressionStream = Native;
							}
						})
					)
				};
			}
		});
	}, entries);
	await dialog.getByRole('button', { name: 'Settings', exact: true }).click();
	const walk = dialog.getByRole('checkbox', { name: 'Walk', exact: true });
	await walk.check();
	await expect(walk).toBeEnabled();
	await dialog.getByRole('button', { name: 'Back', exact: true }).click();
	await expect
		.poll(() =>
			page.evaluate(
				() => (window as unknown as { exportZipGate: { entered: boolean } }).exportZipGate.entered
			)
		)
		.toBe(true);
	await expect(dialog.getByRole('button', { name: 'Preparing…', exact: true })).toBeDisabled();
	await dialog.getByRole('radio', { name: 'PNG + JSON', exact: true }).check();
	await expect(download).toBeEnabled();
	await page.evaluate(() =>
		(window as unknown as { exportZipGate: { release: () => void } }).exportZipGate.release()
	);
	await expect
		.poll(() =>
			page.evaluate(
				() => (window as unknown as { exportZipGate: { finished: number } }).exportZipGate.finished
			)
		)
		.toBe(entries);
	await dialog.getByText('Files included', { exact: true }).click();
	await expect(dialog.locator('pre')).toContainText('generic/');
	await expect(dialog.locator('pre')).not.toContainText('unity/');
	const [file] = await Promise.all([page.waitForEvent('download'), download.click()]);
	const zip = await unzip(new Uint8Array(await readFile((await file.path())!)));
	expect(file.suggestedFilename()).toMatch(/-generic\.pixeldoll\.zip$/);
	const manifest = JSON.parse(new TextDecoder().decode(zip.get('manifest.json')!));
	expect(manifest.export.engines).toEqual(['generic']);
	expect(manifest.rig.animations.find((a: { id: string }) => a.id === 'walk').loop).toBe(false);
});

test('Export takes the live current look and keeps a different saved outfit in the combined PNGs', async ({
	page
}, info) => {
	await savedExport(
		page,
		info.config.projects.find((p) => p.name === 'browser-selftests')!.use.baseURL!
	);
	await page.getByRole('button', { name: 'Close export' }).click();
	const sample = await page.evaluate(async () => {
		const statePath = '/src/studio/state.svelte.ts',
			dbPath = '/src/lib/store/db.ts',
			state = await import(statePath),
			db = await import(dbPath);
		const project = state.store.project,
			body = project.manifest.items[0],
			image = project.images.get(body.layers[0].cells.walk.south[0]);
		let pixel = -1;
		const material = project.manifest.materials.find(
			(material: { owner: string; ramp: string[] }) =>
				material.owner === body.id &&
				material.ramp.some((color) => {
					for (let i = 0; i < image.data.length; i += 4)
						if (
							image.data[i + 3] &&
							'#' +
								[...image.data.slice(i, i + 3)]
									.map((n) => n.toString(16).padStart(2, '0'))
									.join('') ===
								color
						) {
							pixel = i / 4;
							return true;
						}
					return false;
				})
		);
		if (!material || pixel < 0) throw new Error('Fixture needs a visible body material');
		await db.update('projects', state.doc.id, (record: { manifest: typeof project.manifest }) => {
			const mat = record.manifest.materials.find((m: { id: string }) => m.id === material.id);
			mat.variants['audit-current'] = mat.ramp.map(() => '#ff0000');
			mat.variants['audit-saved'] = mat.ramp.map(() => '#0000ff');
			delete mat.defaultVariant;
			record.manifest.presets = [
				{
					id: 'audit-saved',
					name: 'Saved blue outfit',
					items: { body: body.id },
					variants: { [mat.id]: 'audit-saved' }
				}
			];
			return record;
		});
		await state.openProject(state.doc.id);
		state.setVariant(material.id, 'audit-current');
		await state.flushSave();
		return { x: pixel % image.w, y: Math.floor(pixel / image.w), material: material.id };
	});
	await page.getByRole('button', { name: 'Export', exact: true }).click();
	const dialog = page.getByRole('dialog'),
		button = dialog.getByRole('button', { name: /^Download ZIP/ });
	await dialog.getByRole('radio', { name: 'PNG + JSON', exact: true }).check();
	await expect(button).toBeEnabled();
	const [download] = await Promise.all([page.waitForEvent('download'), button.click()]);
	const entries = await unzip(new Uint8Array(await readFile((await download.path())!)));
	const manifest = JSON.parse(new TextDecoder().decode(entries.get('manifest.json')!));
	expect(
		manifest.presets.find((p: { id: string }) => p.id === 'current').variants[sample.material]
	).toBe('audit-current');
	expect(
		manifest.presets.find((p: { id: string }) => p.id === 'audit-saved').variants[sample.material]
	).toBe('audit-saved');
	const current = await decodePngBytes(entries.get('baked/current/walk.png')!),
		saved = await decodePngBytes(entries.get('baked/audit-saved/walk.png')!);
	expect([
		...current.data.slice(
			(sample.y * current.w + sample.x) * 4,
			(sample.y * current.w + sample.x) * 4 + 4
		)
	]).toEqual([255, 0, 0, 255]);
	expect([
		...saved.data.slice(
			(sample.y * saved.w + sample.x) * 4,
			(sample.y * saved.w + sample.x) * 4 + 4
		)
	]).toEqual([0, 0, 255, 255]);
});

test('the UI exports the canonical JavaScript runtime with full dressed demo sheets', async ({
	page
}, info) => {
	await page.addInitScript(() => {
		localStorage.setItem('pixeldoll.agentKey', 'off');
		localStorage.setItem('pixeldoll.welcomed', '1');
	});
	await page.route('https://*.pixellab.ai/**', (route) => route.abort());
	await openStudio(page, info.project.use.baseURL!);
	await page.getByRole('button', { name: 'Export', exact: true }).click();
	const dialog = page.getByRole('dialog');
	await dialog.getByRole('radio', { name: 'Phaser', exact: true }).check();
	await dialog.getByRole('button', { name: 'Settings', exact: true }).click();
	await dialog
		.getByRole('checkbox', { name: 'Include dressed character sheets', exact: true })
		.check();
	await dialog.getByRole('button', { name: 'Back', exact: true }).click();
	const button = dialog.getByRole('button', { name: /^Download ZIP/ });
	await expect(button).toBeEnabled();
	const [download] = await Promise.all([page.waitForEvent('download'), button.click()]);
	await download.saveAs(info.outputPath('runtime-demo.phaser.pixeldoll.zip'));
	const files = await unzip(new Uint8Array(await readFile((await download.path())!))),
		text = (name: string) => new TextDecoder().decode(files.get(name));
	expect(text('phaser/PaperdollContainer.js')).toBe(PAPERDOLL_JS);
	expect(text('phaser/types.d.ts')).toBe(runtimeTypes);
	const manifest = JSON.parse(text('manifest.json'));
	expect(manifest.rig.directions.length).toBeGreaterThanOrEqual(4);
	expect(manifest.items.length).toBeGreaterThan(1);
	expect(manifest.export.baked).toContain('current');
	for (const preset of manifest.export.baked)
		for (const move of manifest.rig.animations)
			expect(files.has(`baked/${preset}/${move.id}.png`)).toBe(true);
});

test('actual UI ZIPs materialize global playback in every engine and asset format', async ({
	page
}, info) => {
	await savedExport(
		page,
		info.config.projects.find((p) => p.name === 'browser-selftests')!.use.baseURL!
	);
	await page.getByRole('button', { name: 'Close export' }).click();
	const original = await page.evaluate(async () => {
		const statePath = '/src/studio/state.svelte.ts',
			dbPath = '/src/lib/store/db.ts';
		const state = await import(statePath),
			db = await import(dbPath);
		await db.update(
			'projects',
			state.doc.id,
			(record: {
				manifest: {
					rig: {
						animations: { id: string; loop: boolean; frames: { cell: number; ms: number }[] }[];
					};
				};
			}) => {
				// Both archived flags contradict the global choices this test will make.
				record.manifest.rig.animations.forEach((move) => {
					move.loop = move.id === 'walk';
					move.frames = [
						{ cell: 0, ms: 80 },
						{ cell: 1, ms: 180 },
						{ cell: 0, ms: 100 }
					];
				});
				return record;
			}
		);
		await state.openProject(state.doc.id);
		return { manifest: (await db.get('projects', state.doc.id)).manifest, revision: state.doc.rev };
	});
	await page.getByRole('button', { name: 'Export', exact: true }).click();
	const dialog = page.getByRole('dialog');
	await dialog.getByRole('button', { name: 'Settings', exact: true }).click();
	const walk = dialog.getByRole('checkbox', { name: 'Walk', exact: true });
	await walk.check();
	await expect(walk).toBeEnabled();
	await expect(
		dialog.getByRole('checkbox', { name: 'Cross punch', exact: true })
	).not.toBeChecked();
	const dressed = dialog.getByRole('checkbox', {
		name: 'Include dressed character sheets',
		exact: true
	});
	await dressed.uncheck();
	await expect(dressed).toBeEnabled();
	await dialog.getByRole('button', { name: 'Back', exact: true }).click();
	const playback = (animations: { id: string; loop: boolean }[]) =>
		Object.fromEntries(animations.map((move) => [move.id, move.loop]));
	const expected = { walk: false, 'cross-punch': true };
	for (const [engine, label] of [
		['godot', 'Godot'],
		['unity', 'Unity'],
		['phaser', 'Phaser'],
		['gdevelop', 'GDevelop'],
		['rpgmaker', 'RPG Maker'],
		['rpgmakerxp', 'XP and Pokémon Essentials'],
		['aseprite', 'Aseprite'],
		['generic', 'PNG + JSON']
	] as const) {
		if (engine === 'rpgmakerxp') {
			// the RPG Maker card's version menu
			await dialog.getByRole('button', { name: /^RPG Maker version/ }).click();
			await page.getByRole('menuitemradio', { name: label }).click();
		} else await dialog.getByRole('radio', { name: label, exact: true }).check();
		const button = dialog.getByRole('button', { name: /^Download ZIP/ });
		if (engine === 'rpgmaker' || engine === 'rpgmakerxp') {
			await expect(dialog.getByText(/RPG Maker needs front, side and back views/)).toBeVisible();
			const recovery = dialog.getByRole('button', { name: 'Download artwork ZIP' });
			await expect(recovery).toBeEnabled();
			await expect(button).toHaveCount(0);
			const [artwork] = await Promise.all([page.waitForEvent('download'), recovery.click()]);
			expect(artwork.suggestedFilename()).toMatch(/-recovered-artwork\.zip$/);
			const entries = await unzip(new Uint8Array(await readFile((await artwork.path())!)));
			expect(entries.has('frames/1.png')).toBe(true);
			expect(entries.has('project.json')).toBe(false);
			await expect(dialog.getByRole('radio', { name: 'RPG Maker', exact: true })).toBeChecked();
			continue;
		}
		await expect(button).toBeEnabled();
		const [download] = await Promise.all([page.waitForEvent('download'), button.click()]);
		await download.saveAs(info.outputPath(`${engine}.pixeldoll.zip`));
		const entries = await unzip(new Uint8Array(await readFile((await download.path())!)));
		const file = (name: string) => {
			const bytes = entries.get(name);
			expect(bytes, name).toBeDefined();
			return bytes!;
		};
		const text = (name: string) => new TextDecoder().decode(file(name));
		const manifest = JSON.parse(text('manifest.json'));
		expect(manifest.export.engines).toEqual([engine]);
		expect(playback(manifest.rig.animations)).toEqual(expected);
		expect(playback(JSON.parse(text('project.json')).manifest.rig.animations)).toEqual(expected);
		expect([...entries.keys()].some((name) => name.startsWith('baked/'))).toBe(false);
		if (engine === 'godot') {
			const layers = [...entries].filter(
				([name, data]) =>
					name.endsWith('.tres') &&
					new TextDecoder().decode(data).startsWith('[gd_resource type="SpriteFrames"')
			);
			expect(layers).toHaveLength(
				manifest.items.reduce(
					(total: number, item: { layers: unknown[] }) => total + item.layers.length,
					0
				)
			);
			for (const [name, data] of layers) {
				const flags = [
					...new TextDecoder().decode(data).matchAll(/"loop": (true|false),\s*"name": &"([^"]+)"/g)
				].map(([, loop, id]) => [id, loop === 'true']);
				const wanted = manifest.rig.animations.flatMap((move: { id: string; loop: boolean }) =>
					manifest.rig.directions.map((dir: { id: string }) => [`${move.id}_${dir.id}`, move.loop])
				);
				expect(flags, name).toEqual(wanted);
			}
		} else if (engine === 'unity') {
			expect(playback(JSON.parse(text('unity/pixeldoll_unity.json')).animations)).toEqual(expected);
		} else if (engine === 'gdevelop') {
			const project = JSON.parse(text('gdevelop/game.json'));
			const code = project.layouts[0].events[0].inlineCode.join('\n') as string;
			expect(text('gdevelop/Paperdoll.js')).toBe(code + '\n');
			const embedded = code.match(/\n  const m = (.+);\n  const names = /);
			expect(embedded).not.toBeNull();
			expect(playback(JSON.parse(embedded![1]).rig.animations)).toEqual(expected);
		} else if (engine === 'aseprite') {
			const files = [...entries.keys()].filter((name) => name.endsWith('.aseprite'));
			expect(files).toHaveLength(1);
			const native = await readAseprite(file(files[0]));
			expect(native.tags.map((tag) => [tag.name, tag.repeat])).toEqual(
				manifest.rig.animations.flatMap(
					(move: { id: string; loop: boolean; directions: string[] }) =>
						move.directions.map((dir) => [`${move.id}_${dir}`, move.loop ? 0 : 1])
				)
			);
		} else if (engine === 'phaser') {
			const base = new URL('/__engine_export__/', page.url()).href;
			await page.route(base + '**', (route) => {
				const name = route.request().url().slice(base.length),
					data = entries.get(name);
				return data
					? route.fulfill({
							contentType: name.endsWith('.js') ? 'text/javascript' : 'application/json',
							body: Buffer.from(data)
						})
					: route.fulfill({ status: 404 });
			});
			try {
				// Execute the delivered adapter with a stub scene; native Phaser execution is a separate engine check.
				const configs = await page.evaluate(async (base) => {
					const api = await import(base + 'phaser/PaperdollContainer.js');
					type Config = {
						key: string;
						repeat: number;
						duration: number;
						frames: { duration: number }[];
					};
					const created: Config[] = [];
					const scene = {
						textures: { exists: () => true },
						anims: { exists: () => false, create: (config: Config) => created.push(config) }
					};
					const manifest = await api.loadPaperdoll(scene, base);
					return manifest.rig.animations.map((move: { id: string; directions: string[] }) => {
						const config = created.find(
							(config) => config.key === api.animKey(manifest, move.id, move.directions[0])
						)!;
						return {
							id: move.id,
							repeat: config.repeat,
							total: config.duration,
							durations: config.frames.map(
								(frame) => frame.duration || config.duration / config.frames.length
							)
						};
					});
				}, base);
				expect(configs).toEqual(
					manifest.rig.animations.map(
						(move: { id: string; loop: boolean; frames: { ms: number }[] }) => ({
							id: move.id,
							repeat: move.loop ? -1 : 0,
							total: move.frames.reduce((total, frame) => total + frame.ms, 0),
							durations: move.frames.map((frame) => frame.ms)
						})
					)
				);
			} finally {
				await page.unroute(base + '**');
			}
		}
		if (engine !== 'generic')
			await page.getByRole('button', { name: 'Export', exact: true }).click();
	}
	expect(
		await page.evaluate(async () => {
			const statePath = '/src/studio/state.svelte.ts',
				dbPath = '/src/lib/store/db.ts';
			const state = await import(statePath),
				db = await import(dbPath);
			return {
				manifest: (await db.get('projects', state.doc.id)).manifest,
				revision: state.doc.rev
			};
		})
	).toEqual(original);
});

test('one-frame and hundred-animation characters keep exact summaries, readable names and reachable controls', async ({
	page
}, info) => {
	await savedExport(
		page,
		info.config.projects.find((p) => p.name === 'browser-selftests')!.use.baseURL!
	);
	const dialog = page.getByRole('dialog');
	for (const count of [1, 100]) {
		await dialog.getByRole('button', { name: 'Close export' }).click();
		await page.evaluate(async (count) => {
			const statePath = '/src/studio/state.svelte.ts',
				dbPath = '/src/lib/store/db.ts',
				rigPath = '/src/lib/rig/rig.ts';
			const state = await import(statePath),
				db = await import(dbPath),
				{ baseHashOf } = await import(rigPath);
			const record = await db.get('projects', state.doc.id),
				manifest = record.manifest,
				base = manifest.items[0];
			const hashes: Record<string, string> = {},
				first = base.layers.map(
					(layer: { cells: Record<string, { south: string[] }> }) =>
						layer.cells[manifest.rig.animations[0].id].south[0]
				);
			manifest.rig.animations = Array.from({ length: count }, (_, i) => ({
				id: count === 1 ? 'default' : `animation-${i}-${'longname'.repeat(12)}`,
				cells: 1,
				loop: count === 1,
				frames: [{ cell: 0, ms: 100 }]
			}));
			base.layers.forEach((layer: { cells: Record<string, { south: string[] }> }, j: number) => {
				layer.cells = Object.fromEntries(
					manifest.rig.animations.map((a: { id: string }) => {
						hashes[`${a.id}/south/0`] = first[j];
						return [a.id, { south: [first[j]] }];
					})
				);
			});
			manifest.rig.baseHash = await baseHashOf(manifest.rig, hashes);
			base.baseHash = manifest.rig.baseHash;
			await db.put('projects', 'studio-export-settings', {
				engine: 'godot',
				dressedCharacterSheets: count !== 100,
				playOnce:
					count === 100 ? manifest.rig.animations.map((move: { id: string }) => move.id) : []
			});
			await db.put('projects', state.doc.id, record);
			await state.openProject(state.doc.id);
		}, count);
		await page.setViewportSize({ width: 320, height: 568 });
		await page.emulateMedia({ reducedMotion: 'reduce' });
		await page.getByRole('button', { name: 'Export', exact: true }).click();
		const summary = dialog.locator('.export-summary dd').first();
		await expect(summary).toHaveText(count === 1 ? 'None' : 'All');
		await dialog.getByRole('button', { name: 'Settings', exact: true }).click();
		const inputs = dialog.locator('.export-moves input'),
			labels = dialog.locator('.export-move span');
		await expect(inputs).toHaveCount(count);
		expect(
			await dialog
				.locator('.export-page')
				.evaluate((element) => getComputedStyle(element).animationName)
		).toBe('none');
		if (count === 1) {
			await inputs.first().check();
			await expect(inputs.first()).toBeEnabled();
		} else {
			await inputs.first().uncheck();
			await expect(inputs.first()).toBeEnabled();
			await inputs.last().uncheck();
			await expect(inputs.last()).toBeEnabled();
		}
		const names = await labels.allTextContents();
		await dialog
			.getByRole('checkbox', { name: 'Include dressed character sheets', exact: true })
			.scrollIntoViewIfNeeded();
		expect(await dialog.evaluate((element) => element.scrollWidth <= element.clientWidth)).toBe(
			true
		);
		await page.screenshot({ path: info.outputPath(`export-${count}-animations.png`) });
		await dialog.getByRole('button', { name: 'Back', exact: true }).click();
		await expect(summary).toHaveText(count === 1 ? 'All' : names.slice(1, -1).join(', '));
		await expect(dialog.getByRole('button', { name: /^Download ZIP/ })).toBeVisible();
		expect(await dialog.evaluate((element) => element.scrollWidth <= element.clientWidth)).toBe(
			true
		);
	}
});

test('Export settings persist explicit None, list and All choices, and toggle combined sheets in downloaded ZIPs', async ({
	page
}, info) => {
	const dev = info.config.projects.find((p) => p.name === 'browser-selftests')!.use.baseURL!;
	await savedExport(page, dev);
	const dialog = page.getByRole('dialog'),
		summary = dialog.locator('.export-summary dd');
	const openSettings = async () => {
		await dialog.getByRole('button', { name: 'Settings', exact: true }).click();
		await expect(dialog).toHaveAccessibleName('Settings');
		await expect(dialog.getByRole('heading', { name: 'Export', exact: true })).toBeVisible();
	};
	const back = async () => {
		await dialog.getByRole('button', { name: 'Back', exact: true }).click();
		await expect(dialog.getByRole('button', { name: 'Settings', exact: true })).toBeFocused();
	};
	await openSettings();
	const moves = dialog.locator('.export-moves input'),
		count = await moves.count();
	expect(count).toBeGreaterThan(1);
	for (let i = 0; i < count; i++) {
		await moves.nth(i).uncheck();
		await expect(moves.nth(i)).toBeEnabled();
	}
	await back();
	await expect(summary.nth(0)).toHaveText('None');
	await openSettings();
	const firstName = await dialog.locator('.export-move span').first().innerText();
	await moves.first().check();
	await expect(moves.first()).toBeEnabled();
	await back();
	await expect(summary.nth(0)).toHaveText(firstName);
	await openSettings();
	for (let i = 0; i < count; i++) {
		await moves.nth(i).check();
		await expect(moves.nth(i)).toBeEnabled();
	}
	const dressed = dialog.getByRole('checkbox', {
		name: 'Include dressed character sheets',
		exact: true
	});
	await expect(dressed).toHaveAccessibleDescription(
		'Adds PNG sprite sheets of your current look and each saved outfit, with the body and equipped items combined. Separate layers are always included, except in RPG Maker sheets, which are always combined.'
	);
	await dressed.uncheck();
	await expect(dressed).toBeEnabled();
	await back();
	await expect(summary).toHaveText(['All', 'None']);
	await dialog.getByRole('button', { name: 'Close export' }).click();
	await page.evaluate(() => location.reload());
	await enterStudio(page);
	await page.getByRole('button', { name: 'Export', exact: true }).click();
	await expect(summary).toHaveText(['All', 'None']);
	await dialog.getByRole('radio', { name: 'PNG + JSON', exact: true }).check();
	const downloadZip = async () => {
		const button = dialog.getByRole('button', { name: /^Download ZIP/ });
		await expect(button).toBeEnabled();
		const [download] = await Promise.all([page.waitForEvent('download'), button.click()]);
		return unzip(new Uint8Array(await readFile((await download.path())!)));
	};
	const off = await downloadZip(),
		manifest = JSON.parse(new TextDecoder().decode(off.get('manifest.json')!));
	expect(manifest.rig.animations.every((a: { loop: boolean }) => a.loop === false)).toBe(true);
	expect(manifest.presets.length).toBeGreaterThan(1);
	expect([...off.keys()].some((name) => name.startsWith('baked/'))).toBe(false);
	expect([...off.keys()].some((name) => name.startsWith('layers/'))).toBe(true);
	expect(
		JSON.parse(new TextDecoder().decode(off.get('project.json')!)).manifest.rig.animations.every(
			(move: { loop: boolean }) => !move.loop
		)
	).toBe(true);
	await page.getByRole('button', { name: 'Export', exact: true }).click();
	await openSettings();
	for (let i = 0; i < count; i++) {
		await moves.nth(i).uncheck();
		await expect(moves.nth(i)).toBeEnabled();
	}
	await dressed.check();
	await expect(dressed).toBeEnabled();
	await back();
	await expect(summary).toHaveText(['None', 'Current look + saved outfits']);
	await dialog.getByText('Files included', { exact: true }).click();
	await expect(dialog.locator('pre')).toContainText('baked/current/');
	const on = await downloadZip();
	expect([...on.keys()].some((name) => name.startsWith('baked/current/'))).toBe(true);
	expect(
		JSON.parse(new TextDecoder().decode(on.get('manifest.json')!)).rig.animations.every(
			(a: { loop: boolean }) => a.loop === true
		)
	).toBe(true);
});

test('Settings search opens the shared Export settings from the Studio menu', async ({
	page
}, info) => {
	const dev = info.config.projects.find((project) => project.name === 'browser-selftests')!.use
		.baseURL!;
	await openStudio(page, dev);
	await enterStudio(page);
	await page.getByRole('button', { name: 'More options', exact: true }).click();
	await page.getByRole('button', { name: 'Settings...', exact: true }).click();
	const settings = page.getByRole('dialog', { name: 'Settings', exact: true });
	const search = settings.getByRole('searchbox', { name: 'Search settings' });
	await search.fill('no such preference');
	await expect(settings.getByRole('status')).toHaveText('No settings match your search.');
	await search.fill('png json');
	await settings.getByRole('button', { name: /Default export target/ }).click();
	await expect(settings.getByRole('combobox', { name: 'Default export target' })).toBeFocused();
	await page.setViewportSize({ width: 320, height: 640 });
	await page.goBack();
	await expect(search).toBeFocused();
	await search.fill('sheets outfit');
	await settings.getByRole('button', { name: /Include dressed character sheets/ }).click();
	const dressed = settings.getByRole('checkbox', { name: 'Include dressed character sheets' });
	await dressed.uncheck();
	await expect(dressed).toBeEnabled();
	await page.setViewportSize({ width: 667, height: 375 });
	const up = settings.getByRole('button', { name: 'Settings', exact: true });
	await expect(up).toBeVisible();
	await expect(dressed).toBeVisible();
	await up.click();
	await expect(search).toBeFocused();
	await expect(settings.getByRole('button', { name: 'Export', exact: true })).toBeVisible();
	await settings.getByRole('button', { name: 'Close', exact: true }).click();
	await page.getByRole('button', { name: 'Export', exact: true }).click();
	const dialog = page.getByRole('dialog');
	await dialog.getByRole('button', { name: 'Settings', exact: true }).click();
	await expect(dialog).toHaveAccessibleName('Settings');
	await expect(dialog.getByRole('heading', { name: 'Export', exact: true })).toBeVisible();
	await expect(
		dialog.getByRole('checkbox', { name: 'Include dressed character sheets' })
	).not.toBeChecked();
	await page.goBack();
	await expect(dialog).toHaveAccessibleName('Export');
});

test('Export settings show storage failures without changing the choice or trapping navigation', async ({
	page
}, info) => {
	await savedExport(
		page,
		info.config.projects.find((p) => p.name === 'browser-selftests')!.use.baseURL!
	);
	const dialog = page.getByRole('dialog');
	await expect(dialog.locator('.export-summary dd')).toHaveCount(2);
	const before = await dialog.locator('.export-summary dd').allTextContents();
	await dialog.getByRole('button', { name: 'Settings', exact: true }).click();
	for (const input of [
		dialog.locator('.export-moves input').first(),
		dialog.getByRole('checkbox', { name: 'Include dressed character sheets', exact: true })
	]) {
		const checked = await input.isChecked();
		await page.evaluate(() => {
			const original = IDBObjectStore.prototype.put;
			IDBObjectStore.prototype.put = function (value, key) {
				if (this.name === 'projects' && key === 'studio-export-settings') {
					IDBObjectStore.prototype.put = original;
					throw new Error('Synthetic settings write failure');
				}
				return original.call(this, value, key);
			};
		});
		await input.focus();
		await input.press('Space'); // Failed persistence immediately restores the old checkbox state.
		await expect(dialog.getByRole('alert')).toContainText(
			'Could not save export settings. Try again.'
		);
		await expect(input).toBeEnabled();
		await expect(input).toBeFocused();
		if (checked) await expect(input).toBeChecked();
		else await expect(input).not.toBeChecked();
	}
	await dialog.getByRole('button', { name: 'Back', exact: true }).click();
	await expect(dialog.locator('.export-summary dd')).toHaveText(before);
	const originalEngine = dialog.getByRole('radio', { name: 'Godot', exact: true });
	await expect(originalEngine).toBeChecked();
	await page.evaluate(() => {
		const original = IDBObjectStore.prototype.put;
		IDBObjectStore.prototype.put = function (value, key) {
			if (this.name === 'projects' && key === 'studio-export-settings') {
				IDBObjectStore.prototype.put = original;
				throw new Error('Synthetic format write failure');
			}
			return original.call(this, value, key);
		};
	});
	await dialog.getByRole('radio', { name: 'Unity', exact: true }).click(); // The expected rollback can finish before check() verifies its opposite postcondition.
	await expect(dialog.getByRole('alert')).toContainText(
		'Could not save export settings. Try again.'
	);
	await expect(originalEngine).toBeChecked();
	await expect(dialog.getByRole('radio', { name: 'Unity', exact: true })).not.toBeChecked();
	await expect(dialog.locator('#export-description')).toContainText('Godot:');
	await dialog.getByRole('button', { name: 'Close export' }).click();
	await expect(dialog).toHaveCount(0);
});

for (const corruption of ['unsupported-format', 'sparse-array'] as const)
	test(`invalid Export preferences can be reset without deleting characters, and a failed reset remains recoverable (${corruption})`, async ({
		page
	}, info) => {
		await savedExport(
			page,
			info.config.projects.find((p) => p.name === 'browser-selftests')!.use.baseURL!
		);
		await page.getByRole('button', { name: 'Close export' }).click();
		const errors: string[] = [];
		page.on('pageerror', (error) => errors.push(error.message));
		await page.evaluate(
			async ({ key, corruption }) => {
				const path = '/src/lib/store/db.ts',
					db = await import(path);
				await db.put(
					'projects',
					key,
					corruption === 'sparse-array'
						? { engine: 'godot', dressedCharacterSheets: true, playOnce: Array(1) }
						: { engine: 'unsupported', dressedCharacterSheets: true, playOnce: [] }
				);
			},
			{ key: EXPORT_SETTINGS_KEY, corruption }
		);
		await page.getByRole('button', { name: 'Export', exact: true }).click();
		const dialog = page.getByRole('dialog');
		await expect(dialog.getByRole('alert')).toContainText('Saved export settings');
		await expect(dialog.getByRole('button', { name: /^Download ZIP/ })).toBeDisabled();
		await expect(dialog.locator('.export-summary dd')).toHaveText(['Unavailable', 'Unavailable']);
		const before = await page.evaluate(async () => {
			const path = '/src/lib/store/db.ts',
				db = await import(path);
			return (await db.all('projects')).filter((r: { id?: string }) => r.id?.startsWith('rig-'));
		});
		await page.evaluate((key) => {
			const put = IDBObjectStore.prototype.put;
			IDBObjectStore.prototype.put = function (value, id) {
				if (this.name === 'projects' && id === key) {
					IDBObjectStore.prototype.put = put;
					throw new Error('Reset storage failure');
				}
				return put.call(this, value, id);
			};
		}, EXPORT_SETTINGS_KEY);
		const reset = dialog.getByRole('button', { name: 'Reset export settings', exact: true });
		await reset.click();
		await expect(dialog.getByRole('alert')).toContainText(
			'Could not save export settings. Try again.'
		);
		await expect(reset).toBeEnabled();
		await reset.click();
		await expect(reset).toHaveCount(0);
		await expect(dialog.getByRole('alert')).toHaveCount(0);
		await expect(dialog.getByRole('radio', { name: 'Godot', exact: true })).toBeChecked();
		await expect(dialog.locator('.export-summary dd')).toHaveText([
			'None',
			'Current look + saved outfits'
		]);
		await expect(dialog.getByRole('button', { name: /^Download ZIP/ })).toBeEnabled();
		expect(
			await page.evaluate(async () => {
				const path = '/src/lib/store/db.ts',
					db = await import(path);
				return (await db.all('projects')).filter((r: { id?: string }) => r.id?.startsWith('rig-'));
			})
		).toEqual(before);
		await dialog.getByRole('button', { name: 'Close export' }).click();
		await page.evaluate(() => location.reload());
		await enterStudio(page);
		await page.getByRole('button', { name: 'Export', exact: true }).click();
		await expect(dialog.getByRole('button', { name: /^Download ZIP/ })).toBeEnabled();
		await expect(dialog.getByRole('alert')).toHaveCount(0);
		await dialog.getByRole('button', { name: 'Close export' }).click();
		await expect(dialog).toHaveCount(0);
		expect(errors).toEqual([]);
	});

for (const corruption of ['null-list', 'sparse-array'] as const)
	test(`an unrelated malformed character warns without blocking settings or the current character ZIP (${corruption})`, async ({
		page
	}, info) => {
		await savedExport(
			page,
			info.config.projects.find((p) => p.name === 'browser-selftests')!.use.baseURL!
		);
		await page.getByRole('button', { name: 'Close export' }).click();
		const errors: string[] = [];
		page.on('pageerror', (error) => errors.push(error.message));
		await page.evaluate(
			async ({ corruption, format }) => {
				const path = '/src/lib/store/db.ts',
					db = await import(path);
				await db.put('projects', 'rig-broken-export-names', {
					id: 'rig-broken-export-names',
					manifest: {
						format,
						name: 'Broken library character',
						rig: { animations: corruption === 'sparse-array' ? Array(1) : null }
					}
				});
			},
			{ corruption, format: CURRENT_FORMAT }
		);
		await page.getByRole('button', { name: 'Export', exact: true }).click();
		const dialog = page.getByRole('dialog');
		await expect(dialog.locator('.notice.warn')).toContainText('Broken library character');
		await expect(dialog.getByRole('alert')).toHaveCount(0);
		await dialog.getByRole('button', { name: 'Settings', exact: true }).click();
		const walk = dialog.getByRole('checkbox', { name: 'Walk', exact: true });
		await walk.check();
		await expect(walk).toBeEnabled();
		await dialog.getByRole('button', { name: 'Back', exact: true }).click();
		const button = dialog.getByRole('button', { name: /^Download ZIP/ });
		await expect(button).toBeEnabled();
		const [download] = await Promise.all([page.waitForEvent('download'), button.click()]);
		const entries = await unzip(new Uint8Array(await readFile((await download.path())!)));
		const exported = JSON.parse(new TextDecoder().decode(entries.get('manifest.json')!));
		expect(exported.name).toBe('Export settings test');
		expect(exported.rig.animations.find((move: { id: string }) => move.id === 'walk').loop).toBe(
			false
		);
		const unchanged = await page.evaluate(async () => {
			const path = '/src/lib/store/db.ts',
				db = await import(path);
			const animations = (await db.get('projects', 'rig-broken-export-names')).manifest.rig
				.animations;
			return animations === null
				? null
				: { length: animations.length, keys: Object.keys(animations) };
		});
		expect(unchanged).toEqual(corruption === 'sparse-array' ? { length: 1, keys: [] } : null);
		expect(errors).toEqual([]);
	});

test('invalid move names still allow artwork recovery and storage outages do not offer a preferences reset', async ({
	page
}, info) => {
	await savedExport(
		page,
		info.config.projects.find((p) => p.name === 'browser-selftests')!.use.baseURL!
	);
	await page.getByRole('button', { name: 'Close export' }).click();
	await page.evaluate(() => {
		const get = IDBObjectStore.prototype.get;
		IDBObjectStore.prototype.get = function (query) {
			if (query === 'studio-export-settings') {
				IDBObjectStore.prototype.get = get;
				throw new Error('Storage unavailable');
			}
			return get.call(this, query);
		};
	});
	await page.getByRole('button', { name: 'Export', exact: true }).click();
	const dialog = page.getByRole('dialog');
	await expect(dialog.getByRole('alert')).toContainText('Could not load export settings');
	await expect(dialog.getByRole('button', { name: 'Reset export settings' })).toHaveCount(0);
	await expect(dialog.getByRole('button', { name: /^Download ZIP/ })).toBeDisabled();
	await dialog.getByRole('button', { name: 'Close export' }).click();
	await page.evaluate(async () => {
		const path = '/src/studio/state.svelte.ts',
			s = await import(path);
		const project = s.store.project;
		const manifest = structuredClone(project.manifest);
		manifest.rig.animations[0].id = 'invalid/name';
		s.store.project = { ...project, manifest };
	});
	await page.getByRole('button', { name: 'Export', exact: true }).click();
	await expect(
		dialog.locator('.notice.warn').filter({ hasText: 'Some moves from this character' })
	).toBeVisible();
	await expect(dialog.getByRole('button', { name: 'Reset export settings' })).toHaveCount(0);
	await expect(dialog.getByRole('button', { name: 'Download artwork ZIP' })).toBeEnabled();
	await dialog.getByRole('button', { name: 'Close export' }).click();
});

test('quick download recovers working images from an unopened character with a missing image', async ({
	page
}, info) => {
	await savedExport(
		page,
		info.config.projects.find((p) => p.name === 'browser-selftests')!.use.baseURL!
	);
	await page.evaluate(async () => {
		const statePath = '/src/studio/state.svelte.ts';
		const dbPath = '/src/lib/store/db.ts';
		const { doc } = await import(statePath);
		const db = await import(dbPath);
		const rec = await db.get('projects', doc.id);
		rec.manifest.rig.rest = { south: { image: `sha256:${'a'.repeat(64)}`, keypoints: [] } };
		rec.manifest.items[0].layers[0].cells.extra = { south: {} };
		await db.put('projects', doc.id, rec);
	});
	await page.reload();
	await page.getByRole('button', { name: 'Dismiss notification', exact: true }).click();
	await page
		.getByRole('button', { name: 'More actions for Export settings test', exact: true })
		.click();
	const downloaded = page.waitForEvent('download');
	await page.getByRole('menuitem', { name: 'Download ZIP', exact: true }).click();
	const download = await downloaded;
	expect(download.suggestedFilename()).toMatch(
		/^export_settings_test_[a-f0-9]{12}-recovered-artwork\.zip$/
	);
	const files = await unzip(new Uint8Array(await readFile((await download.path())!)));
	expect(files.has('project.json')).toBe(false);
	expect(files.has('frames/1.png')).toBe(true);
	await expect(
		page.getByText('Full export unavailable. Source PNG download started.')
	).toBeVisible();
});

test('reset preserves preferences already repaired elsewhere and waits for its committed transaction', async ({
	page
}, info) => {
	await savedExport(
		page,
		info.config.projects.find((p) => p.name === 'browser-selftests')!.use.baseURL!
	);
	await page.getByRole('button', { name: 'Close export' }).click();
	await page.evaluate(async (key) => {
		const path = '/src/lib/store/db.ts';
		await (await import(path)).put('projects', key, {});
	}, EXPORT_SETTINGS_KEY);
	await page.getByRole('button', { name: 'Export', exact: true }).click();
	const dialog = page.getByRole('dialog'),
		reset = dialog.getByRole('button', { name: 'Reset export settings' });
	await expect(reset).toBeEnabled();
	await page.evaluate(async (key) => {
		const path = '/src/lib/store/db.ts';
		await (
			await import(path)
		).put('projects', key, { engine: 'phaser', dressedCharacterSheets: false, playOnce: ['walk'] });
	}, EXPORT_SETTINGS_KEY);
	await holdProjectTransaction(page, 'readwrite');
	await reset.click();
	await expect
		.poll(() =>
			page.evaluate(
				() =>
					(window as unknown as { exportTransaction: { ready: boolean } }).exportTransaction.ready
			)
		)
		.toBe(true);
	await expect(reset).toBeDisabled();
	await expect(dialog.getByRole('button', { name: 'Close export' })).toBeDisabled();
	await expect(dialog.getByRole('button', { name: /^Download ZIP/ })).toBeDisabled();
	await page.keyboard.press('Escape');
	await expect(dialog).toBeVisible();
	await releaseProjectTransaction(page);
	await expect(reset).toHaveCount(0);
	await expect(dialog.getByRole('button', { name: 'Settings', exact: true })).toBeFocused();
	await expect(dialog.getByRole('radio', { name: 'Phaser', exact: true })).toBeChecked();
	await expect(dialog.locator('.export-summary dd')).toHaveText(['Walk', 'None']);
	await expect(dialog.getByRole('button', { name: /^Download ZIP/ })).toBeEnabled();
});

test('distinct imported IDs with identical pretty names remain distinguishable global choices', async ({
	page
}, info) => {
	await savedExport(
		page,
		info.config.projects.find((p) => p.name === 'browser-selftests')!.use.baseURL!
	);
	await page.getByRole('button', { name: 'Close export' }).click();
	await page.evaluate(async () => {
		const statePath = '/src/studio/state.svelte.ts',
			dbPath = '/src/lib/store/db.ts',
			rigPath = '/src/lib/rig/rig.ts';
		const s = await import(statePath),
			db = await import(dbPath),
			{ baseHashOf } = await import(rigPath);
		const rec = await db.get('projects', s.doc.id),
			m = rec.manifest,
			oldIds = m.rig.animations.map((a: { id: string }) => a.id);
		const ids = ['jump-loop', 'jump--loop'],
			hashes: Record<string, string> = {};
		m.rig.animations.forEach((a: { id: string }, i: number) => {
			a.id = ids[i];
		});
		for (const layer of m.items[0].layers) {
			const cells = layer.cells;
			layer.cells = Object.fromEntries(ids.map((id, i) => [id, cells[oldIds[i]]]));
			for (const id of ids)
				layer.cells[id].south.forEach((hash: string, i: number) => {
					hashes[`${id}/south/${i}`] = hash;
				});
		}
		m.rig.baseHash = await baseHashOf(m.rig, hashes);
		m.items[0].baseHash = m.rig.baseHash;
		await db.put('projects', s.doc.id, rec);
		await s.openProject(s.doc.id);
	});
	await page.getByRole('button', { name: 'Export', exact: true }).click();
	const dialog = page.getByRole('dialog');
	await dialog.getByRole('button', { name: 'Settings', exact: true }).click();
	const once = dialog.getByRole('checkbox', { name: 'Jump loop (jump-loop)', exact: true });
	await once.check();
	await expect(once).toBeEnabled();
	await expect(
		dialog.getByRole('checkbox', { name: 'Jump loop (jump--loop)', exact: true })
	).not.toBeChecked();
	await dialog.getByRole('button', { name: 'Back', exact: true }).click();
	await expect(dialog.locator('.export-summary dd').first()).toHaveText('Jump loop (jump-loop)');
	expect(
		await page.evaluate(async () => {
			const path = '/src/lib/store/export-settings.ts';
			return (await import(path)).readExportSettings();
		})
	).toMatchObject({ playOnce: ['jump-loop'] });
});

test('Export navigation and settings fit phones, landscape and both themes, including a character without saved outfits', async ({
	page
}, info) => {
	await savedExport(
		page,
		info.config.projects.find((p) => p.name === 'browser-selftests')!.use.baseURL!
	);
	await page.getByRole('button', { name: 'Close export' }).click();
	await page.evaluate(async () => {
		const path = '/src/studio/state.svelte.ts',
			state = await import(path),
			project = state.store.project;
		state.store.project = { ...project, manifest: { ...project.manifest, presets: [] } };
	});
	await page.getByRole('button', { name: 'Export', exact: true }).click();
	const dialog = page.getByRole('dialog');
	await expect(dialog.locator('.export-summary dd').nth(1)).toHaveText('Current look');
	for (const theme of ['light', 'dark'])
		for (const viewport of [
			{ width: 320, height: 568 },
			{ width: 844, height: 390 }
		]) {
			await page.evaluate((theme) => (document.documentElement.dataset.theme = theme), theme);
			await page.setViewportSize(viewport);
			await expect(dialog).toHaveClass(viewport.width === 320 ? /\bbottom\b/ : /\bside\b/);
			const close = dialog.getByRole('button', { name: 'Close export' }),
				settings = dialog.getByRole('button', { name: 'Settings', exact: true });
			const closeBefore = await close.boundingBox(),
				nav = await settings.boundingBox();
			expect(nav!.x + nav!.width).toBeLessThan(closeBefore!.x);
			await settings.click();
			await expect(dialog.getByRole('group', { name: 'Play animation once' })).toBeVisible();
			const closeAfter = await close.boundingBox();
			expect(closeAfter!.x).toBeCloseTo(closeBefore!.x, 0);
			expect(closeAfter!.y).toBeCloseTo(closeBefore!.y, 0);
			expect(await dialog.evaluate((element) => element.scrollWidth <= element.clientWidth)).toBe(
				true
			);
			await expect(dialog.locator('[title]')).toHaveCount(0);
			await dialog
				.getByRole('checkbox', { name: 'Include dressed character sheets', exact: true })
				.scrollIntoViewIfNeeded();
			await expect(
				dialog.getByRole('checkbox', { name: 'Include dressed character sheets', exact: true })
			).toBeVisible();
			await page.screenshot({
				path: info.outputPath(`export-settings-${theme}-${viewport.width}.png`)
			});
			await dialog.getByRole('button', { name: 'Back', exact: true }).click();
			await expect(dialog.getByRole('button', { name: /^Download ZIP/ })).toBeVisible();
		}
	await dialog.getByRole('button', { name: 'Close export' }).click();
	await expect(page.getByRole('button', { name: 'Export', exact: true })).toBeFocused();
});

test('Preview, Top-down and Side-scroller always loop with global Play once both on and off', async ({
	page
}, info) => {
	await page.setViewportSize({ width: 800, height: 600 });
	await page.addInitScript(() => {
		localStorage.setItem('pixeldoll.agentKey', 'off');
		localStorage.setItem('pixeldoll.welcomed', '1');
	});
	await page.route('https://*.pixellab.ai/**', (route) => route.abort());
	await openStudio(
		page,
		info.config.projects.find((p) => p.name === 'browser-selftests')!.use.baseURL!
	);
	await page.evaluate(async () => {
		const path = '/src/studio/state.svelte.ts',
			s = await import(path);
		const walk = s.store.project.manifest.rig.animations.find(
			(move: { id: string }) => move.id === 'walk'
		);
		walk.loop = false;
		walk.frames = [
			{ cell: 0, ms: 100 },
			{ cell: 1, ms: 100 }
		];
		s.ui.anim = 'walk';
		s.ui.dir = 'south';
		// Studio's frame timer was scheduled before the fake clock exists, and the fake clearTimeout cannot cancel it, so it
		// would fire in real time and decide whether the first Preview check sees any frames. Stop it natively first.
		s.ui.playing = false;
		s.doc.rev++;
		await new Promise((resolve) => setTimeout(resolve));
		const host = window as unknown as { appLoopFrames: number[] };
		host.appLoopFrames = [];
		const original = CanvasRenderingContext2D.prototype.drawImage;
		CanvasRenderingContext2D.prototype.drawImage = function (
			image: CanvasImageSource,
			...coordinates: number[]
		) {
			Reflect.apply(original, this, [image, ...coordinates]);
			// Observe the source pixels actually drawn for the actor, before camera motion or reflections.
			if (
				!this.canvas.classList.contains('world-actors') ||
				this.globalAlpha !== 1 ||
				!(image instanceof HTMLCanvasElement)
			)
				return;
			const pixels = image.getContext('2d')!.getImageData(0, 0, image.width, image.height).data;
			let hash = 2166136261;
			for (const byte of pixels) hash = Math.imul(hash ^ byte, 16777619);
			const value = hash >>> 0;
			if (host.appLoopFrames.at(-1) !== value) host.appLoopFrames.push(value);
		};
	});
	await page.clock.install({ time: new Date('2026-10-27T12:00:00Z') });
	await page.clock.pauseAt(new Date('2026-10-27T12:00:01Z'));
	await page.evaluate(async () => {
		const path = '/src/studio/state.svelte.ts',
			s = await import(path);
		s.ui.playing = true;
	});
	const modes = page.getByRole('group', { name: 'Character view' });
	for (const playOnce of [true, false]) {
		await page.evaluate(async (playOnce) => {
			const path = '/src/lib/store/export-settings.ts',
				settings = await import(path);
			await settings.saveExportSetting({ animation: 'WALK', playOnce });
		}, playOnce);
		for (const mode of ['Preview', 'Top-down', 'Side-scroller']) {
			await modes.getByRole('button', { name: mode, exact: true }).click();
			await page.locator('.world-stage').focus();
			const key = mode === 'Top-down' ? 's' : mode === 'Side-scroller' ? 'd' : null;
			if (key) await page.keyboard.down(key);
			await page.evaluate(() => {
				(window as unknown as { appLoopFrames: number[] }).appLoopFrames = [];
			});
			await page.clock.runFor(
				1100 * (mode === 'Side-scroller' ? travelSpeed('topdown') / travelSpeed('side') : 1)
			);
			const frames = await page.evaluate(
				() => (window as unknown as { appLoopFrames: number[] }).appLoopFrames
			);
			expect(new Set(frames).size, `${mode}, Play once ${playOnce}`).toBe(2);
			expect(frames.length, `${mode}, Play once ${playOnce}`).toBeGreaterThanOrEqual(8);
			if (key) await page.keyboard.up(key);
		}
	}
});

for (const auto of [false, true])
	test(`Share uses the worn review draft through ${auto ? 'automatic' : 'manual'} acceptance for previews, PNG, GIF and native sharing`, async ({
		page,
		context
	}, info) => {
		await page.setViewportSize({ width: 800, height: 600 });
		const requests: string[] = [];
		await context.route('https://*.pixellab.ai/**', (route) => {
			requests.push(route.request().url());
			return route.abort();
		});
		await context.grantPermissions(['clipboard-read', 'clipboard-write']);
		await page.addInitScript(() => {
			localStorage.setItem('pixeldoll.agentKey', 'off');
			localStorage.setItem('pixeldoll.welcomed', '1');
			Object.defineProperty(Navigator.prototype, 'canShare', {
				configurable: true,
				value: () => true
			});
			Object.defineProperty(Navigator.prototype, 'share', {
				configurable: true,
				value: async (data: ShareData) => {
					(window as unknown as { sharedFile: number[] }).sharedFile = [
						...new Uint8Array(await data.files![0].arrayBuffer())
					];
				}
			});
		});
		await openStudio(
			page,
			info.config.projects.find((p) => p.name === 'browser-selftests')!.use.baseURL!
		);
		await page.evaluate(async () => {
			const statePath = '/src/studio/state.svelte.ts',
				imagePath = '/src/lib/image/png.ts',
				rigPath = '/src/lib/rig/rig.ts',
				createPath = '/src/studio/create.ts',
				itemsPath = '/src/lib/items/items.ts';
			const s = await import(statePath),
				{ makeImg } = await import(imagePath),
				{ cellHash, baseHashOf } = await import(rigPath),
				{ saveCopy } = await import(createPath),
				{ itemQa } = await import(itemsPath);
			await s.loadGens();
			const sourceProject = s.store.project,
				manifest = structuredClone(sourceProject.manifest);
			// Keep the real persistence/acceptance flow, with only the two frames and slot this test exercises.
			manifest.items = manifest.items.filter((item: { id: string }) =>
				[manifest.rig.baseItem, 'hat_wizard'].includes(item.id)
			);
			manifest.slots = manifest.slots.filter((slot: { id: string }) =>
				['body', 'head'].includes(slot.id)
			);
			manifest.materials = manifest.materials.filter((material: { owner: string }) =>
				manifest.items.some((item: { id: string }) => item.id === material.owner)
			);
			manifest.presets = [];
			manifest.rig.directions = [{ id: 'south' }];
			delete manifest.rig.rest;
			delete manifest.rig.anchors;
			manifest.rig.animations = [
				{
					id: 'walk',
					cells: 2,
					loop: true,
					frames: [
						{ cell: 0, ms: 100 },
						{ cell: 1, ms: 100 }
					]
				}
			];
			const used = new Set<string>(),
				bodyHashes: Record<string, string> = {};
			for (const item of manifest.items)
				for (const layer of item.layers) {
					layer.cells = { walk: { south: layer.cells.walk.south.slice(0, 2) } };
					layer.cells.walk.south.forEach((hash: string, index: number) => {
						used.add(hash);
						if (item.id === manifest.rig.baseItem) bodyHashes[`walk/south/${index}`] = hash;
					});
				}
			manifest.rig.baseHash = await baseHashOf(manifest.rig, bodyHashes);
			for (const item of manifest.items) item.baseHash = manifest.rig.baseHash;
			const projectId = await saveCopy(
				{ manifest, images: new Map([...sourceProject.images].filter(([hash]) => used.has(hash))) },
				'Share acceptance test'
			);
			await s.refreshProjects();
			await s.openProject(projectId);
			s.ui.playing = false;
			s.ui.anim = 'walk';
			s.ui.dir = 'south';
			const p = s.store.project,
				source = p.manifest.items.find((item: { id: string }) => item.id === 'hat_wizard');
			const hat = structuredClone(source);
			hat.id = 'share_review_hat';
			hat.name = 'Share review hat';
			hat.status = 'draft';
			hat.materials = [];
			hat.coverage = ['walk/south/0', 'walk/south/1'];
			// Two unmistakable pixel markers, distinct from both the body and the saved hat.
			const images = new Map(p.images),
				hashes = [],
				cells = [];
			for (
				let index = 0;
				index < p.manifest.rig.animations.find((a: { id: string }) => a.id === 'walk').cells;
				index++
			) {
				const color = index % 2 ? [219, 31, 191, 255] : [13, 231, 117, 255];
				const image = makeImg(p.manifest.rig.cell.w, p.manifest.rig.cell.h);
				for (let y = 1; y < 5; y++)
					for (let x = 1; x < 5; x++) image.data.set(color, (y * image.w + x) * 4);
				const hash = await cellHash(image);
				images.set(hash, image);
				hashes.push(hash);
				const mask = Uint8Array.from({ length: image.w * image.h }, (_, pixel) =>
					image.data[pixel * 4 + 3] ? 1 : 0
				);
				cells.push({
					key: `walk/south/${index}`,
					call: 0,
					base: image,
					input: image,
					out: image,
					layer: image,
					mask,
					area: 16,
					outBand: 0,
					baseBand: 0,
					specks: 0,
					pinholes: 0,
					shifted: false,
					offset: [0, 0],
					stray: 0,
					posed: false
				});
			}
			hat.layers = [{ id: 'main', role: 'fg', z: 100, cells: { walk: { south: hashes } } }];
			s.store.project = {
				...p,
				manifest: {
					...p.manifest,
					rig: {
						...p.manifest.rig,
						animations: p.manifest.rig.animations.map((a: { id: string }) =>
							a.id === 'walk'
								? {
										...a,
										cells: 2,
										frames: [
											{ cell: 0, ms: 100 },
											{ cell: 1, ms: 100 }
										]
									}
								: a
						)
					}
				}
			};
			const jobId = 'share-review-completed',
				queue = (window as any).__queue;
			queue.recs.set(jobId, {
				id: jobId,
				label: 'Cached review artwork',
				method: 'POST',
				endpoint: '/edit-animation-v2',
				params: {},
				inputs: [],
				requestHash: jobId,
				state: 'done',
				attempts: 1,
				nextAt: 0,
				createdAt: 1,
				jobs: [],
				gens: 0,
				usd: 0
			});
			queue.emit();
			s.gens.push({
				draft: {
					rigId: s.doc.id,
					spec: {
						id: hat.id,
						name: hat.name,
						slot: 'head',
						prompt: 'a hat',
						key: 'none',
						method: 'anchor',
						anims: ['walk'],
						dirs: ['south']
					},
					calls: [
						{
							kind: 'grid',
							cells: cells.map((cell) => cell.key),
							seed: 1,
							recId: jobId,
							old: [],
							rerolls: 0
						}
					],
					log: []
				},
				input: { name: hat.name, slot: 'head', prompt: 'a hat' },
				phase: 'review',
				status: 'Review'
			});
			s.store.results = {
				...s.store.results,
				[hat.id]: {
					cells,
					qa: itemQa(p.manifest.rig, 'head', 'none', cells, 0),
					g1: new Map(),
					preview: {
						manifest: { ...s.store.project.manifest, items: [...p.manifest.items, hat] },
						images
					}
				}
			};
			s.doc.items = { ...s.doc.items, head: source.id };
			s.wearDraft(hat.id);
			s.doc.rev++;
		});
		await page.getByRole('button', { name: 'Share character' }).click();
		const popover = page.getByRole('dialog', { name: 'Share character preview' });
		const hasMarker = () =>
			popover.locator('.share-preview canvas').evaluate((element) => {
				const canvas = element as HTMLCanvasElement,
					data = canvas.getContext('2d')!.getImageData(0, 0, canvas.width, canvas.height).data;
				return data.some(
					(v, i) =>
						i % 4 === 0 &&
						((v === 13 && data[i + 1] === 231 && data[i + 2] === 117) ||
							(v === 219 && data[i + 1] === 31 && data[i + 2] === 191))
				);
			});
		const download = async (format: 'PNG' | 'GIF') => {
			await expect(
				popover.getByRole('button', { name: `Download ${format}`, exact: true })
			).toBeEnabled();
			const [file] = await Promise.all([
				page.waitForEvent('download'),
				popover.getByRole('button', { name: `Download ${format}`, exact: true }).click()
			]);
			return readFile((await file.path())!);
		};
		for (const stage of ['review', 'accepted'] as const) {
			if (stage === 'accepted') {
				await page.evaluate(async (auto) => {
					const path = '/src/studio/state.svelte.ts',
						s = await import(path),
						host = window as any;
					host.shareAccept = { held: false, done: false, error: '' };
					const put = IDBObjectStore.prototype.put;
					IDBObjectStore.prototype.put = function (value, key) {
						const request = put.call(this, value, key);
						if (this.name === 'projects' && key === 'studio-drafts') {
							IDBObjectStore.prototype.put = put;
							const transaction = this.transaction;
							Object.defineProperty(transaction, 'oncomplete', {
								set(callback: (this: IDBTransaction, event: Event) => void) {
									transaction.addEventListener(
										'complete',
										(event) => {
											host.shareAccept.held = true;
											host.shareAccept.release = () => callback.call(transaction, event);
										},
										{ once: true }
									);
								}
							});
						}
						return request;
					};
					void s
						.acceptGen(
							s.gens.find(
								(g: { draft: { spec: { id: string } } }) => g.draft.spec.id === 'share_review_hat'
							),
							auto
						)
						.then(() => {
							host.shareAccept.done = true;
						})
						.catch((error: Error) => {
							host.shareAccept.error = error.message;
						});
				}, auto);
				await expect
					.poll(() =>
						page.evaluate(() => ({
							held: (window as any).shareAccept.held,
							error: (window as any).shareAccept.error
						}))
					)
					.toEqual({ held: true, error: '' });
				// Force fresh encoding during the real persisted-draft/reload handoff, not just the two steady states.
				await popover.getByRole('switch').uncheck();
				const handoff = await decodePngBytes(await download('PNG'));
				expect(
					handoff.data.some(
						(v, i) =>
							i % 4 === 0 && v === 13 && handoff.data[i + 1] === 231 && handoff.data[i + 2] === 117
					),
					'acceptance handoff retains worn artwork'
				).toBe(true);
				expect(
					await page.evaluate(async () => {
						const path = '/src/lib/store/db.ts',
							db = await import(path);
						return (await db.get('projects', 'studio-drafts')).gens.map(
							(g: { draft: { spec: { id: string } } }) => g.draft.spec.id
						);
					})
				).not.toContain('share_review_hat');
				await holdProjectTransaction(page, 'readonly', 'character');
				await page.evaluate(() => (window as any).shareAccept.release());
				await expect
					.poll(() =>
						page.evaluate(
							() =>
								(window as unknown as { exportTransaction: { ready: boolean } }).exportTransaction
									.ready
						)
					)
					.toBe(true);
				if (auto) {
					const reloading = await decodePngBytes(await download('PNG'));
					expect(
						reloading.data.some(
							(v, i) =>
								i % 4 === 0 &&
								v === 13 &&
								reloading.data[i + 1] === 231 &&
								reloading.data[i + 2] === 117
						),
						'quiet reload retains worn artwork'
					).toBe(true);
				} else {
					await expect(
						popover.getByRole('button', { name: 'Copy PNG', exact: true })
					).toBeDisabled();
					await expect(popover.getByRole('status')).toHaveText(
						'Character artwork is still loading'
					);
				}
				await releaseProjectTransaction(page);
				await expect
					.poll(() =>
						page.evaluate(() => ({
							done: (window as any).shareAccept.done,
							error: (window as any).shareAccept.error
						}))
					)
					.toEqual({ done: true, error: '' });
				await popover.getByRole('switch').check();
			}
			await expect.poll(hasMarker, stage).toBe(true);
			const gif = await download('GIF');
			const colors = await page.evaluate(
				async (bytes) => {
					const decoder = new (window as any).ImageDecoder({
						data: new Uint8Array(bytes),
						type: 'image/gif'
					});
					await decoder.tracks.ready;
					const colors = [];
					for (let frameIndex = 0; frameIndex < 2; frameIndex++) {
						const { image } = await decoder.decode({ frameIndex }),
							canvas = new OffscreenCanvas(image.displayWidth, image.displayHeight);
						const ctx = canvas.getContext('2d')!;
						ctx.drawImage(image, 0, 0);
						const data = ctx.getImageData(0, 0, canvas.width, canvas.height).data;
						colors.push(
							data.some(
								(v, i) =>
									i % 4 === 0 &&
									(frameIndex === 0
										? v === 13 && data[i + 1] === 231 && data[i + 2] === 117
										: v === 219 && data[i + 1] === 31 && data[i + 2] === 191)
							)
						);
						image.close();
					}
					decoder.close();
					return colors;
				},
				[...gif]
			);
			expect(colors, stage).toEqual([true, true]);
			await popover.getByRole('button', { name: 'Share to…' }).click();
			await expect
				.poll(
					async () =>
						Buffer.from(
							await page.evaluate(
								() => (window as unknown as { sharedFile?: number[] }).sharedFile ?? []
							)
						).equals(gif),
					stage
				)
				.toBe(true);
			await popover.getByRole('switch').uncheck();
			const png = await download('PNG'),
				decoded = await decodePngBytes(png);
			expect(
				decoded.data.some(
					(v, i) =>
						i % 4 === 0 && v === 13 && decoded.data[i + 1] === 231 && decoded.data[i + 2] === 117
				),
				stage
			).toBe(true);
			await popover.getByRole('button', { name: 'Copy PNG', exact: true }).click();
			await expect(popover.getByRole('status')).toHaveText('PNG copied');
			expect(
				await page.evaluate(async () => {
					const items = await navigator.clipboard.read(),
						blob = await items
							.find((item) => item.types.includes('image/png'))!
							.getType('image/png');
					const image = await createImageBitmap(blob),
						canvas = new OffscreenCanvas(image.width, image.height),
						ctx = canvas.getContext('2d')!;
					ctx.drawImage(image, 0, 0);
					image.close();
					const data = ctx.getImageData(0, 0, canvas.width, canvas.height).data;
					return data.some(
						(v, i) => i % 4 === 0 && v === 13 && data[i + 1] === 231 && data[i + 2] === 117
					);
				}),
				stage
			).toBe(true);
			await popover.getByRole('button', { name: 'Share to…' }).click();
			await expect
				.poll(
					async () =>
						Buffer.from(
							await page.evaluate(
								() => (window as unknown as { sharedFile?: number[] }).sharedFile ?? []
							)
						).equals(png),
					stage
				)
				.toBe(true);
			await popover.getByRole('switch').check();
			if (stage === 'review') {
				await page.evaluate(async () => {
					const path = '/src/studio/state.svelte.ts',
						s = await import(path);
					s.wearDraft('share_review_hat');
				});
				await expect.poll(hasMarker).toBe(false);
				await page.evaluate(async () => {
					const path = '/src/studio/state.svelte.ts',
						s = await import(path);
					s.wearDraft('share_review_hat');
				});
				await expect.poll(hasMarker).toBe(true);
			}
		}
		// Live take-off updates Share without reopening it.
		await page.evaluate(async () => {
			const path = '/src/studio/state.svelte.ts',
				s = await import(path);
			s.doc.items = { ...s.doc.items, head: null };
		});
		await expect.poll(hasMarker).toBe(false);
		expect(requests).toEqual([]);
	});

test('Share preview and downloaded GIF loop continuously for a one-shot move', async ({
	page,
	context
}, testInfo) => {
	await context.route('https://api.pixellab.ai/**', (route) => route.abort());
	await context.addInitScript(() => {
		localStorage.setItem('pixeldoll.agentKey', 'off');
		localStorage.setItem('pixeldoll.welcomed', '1');
	});
	const dev = testInfo.config.projects.find((project) => project.name === 'browser-selftests')!.use
		.baseURL!;
	await openStudio(page, dev + '/#/', { waitUntil: 'networkidle' });
	await page.evaluate(async () => {
		const path = '/src/lib/store/export-settings.ts',
			settings = await import(path);
		await settings.saveExportSetting({ animation: 'WALK', playOnce: true });
		const studio = (
			window as unknown as {
				__studio: {
					doc: { rev: number };
					store: {
						project: {
							manifest: {
								rig: {
									animations: {
										id: string;
										loop: boolean;
										frames: { cell: number; ms: number }[];
									}[];
								};
							};
						};
					};
				};
			}
		).__studio;
		const clip = studio.store.project.manifest.rig.animations.find((move) => move.id === 'walk')!;
		clip.loop = false;
		clip.frames = [
			{ cell: 0, ms: 100 },
			{ cell: 1, ms: 100 }
		];
		studio.doc.rev++;
	});
	await page.clock.install({ time: new Date('2026-10-27T12:00:00Z') });
	await page.clock.pauseAt(new Date('2026-10-27T12:00:01Z'));
	await page.getByRole('button', { name: 'Share character' }).click();
	const popover = page.getByRole('dialog', { name: 'Share character preview' });
	const frameData = () =>
		popover.locator('.share-preview canvas').evaluate((element) => {
			const canvas = element as HTMLCanvasElement;
			const data = canvas.getContext('2d')!.getImageData(0, 0, canvas.width, canvas.height).data;
			let hash = 2166136261;
			for (const byte of data) hash = Math.imul(hash ^ byte, 16777619);
			return hash >>> 0;
		});
	await page.clock.runFor(50);
	const first = await frameData();
	await page.clock.runFor(100);
	const second = await frameData();
	expect(second).not.toBe(first);
	for (let cycle = 0; cycle < 3; cycle++) {
		await page.clock.runFor(100);
		expect(await frameData()).toBe(first);
		await page.clock.runFor(100);
		expect(await frameData()).toBe(second);
	}
	await page.clock.resume();
	await expect(popover.getByRole('button', { name: 'Download GIF' })).toBeEnabled();
	const [download] = await Promise.all([
		page.waitForEvent('download'),
		popover.getByRole('button', { name: 'Download GIF' }).click()
	]);
	const bytes = await readFile((await download.path())!);
	const loop = bytes.indexOf('NETSCAPE2.0');
	expect(loop).toBeGreaterThan(0);
	expect([...bytes.subarray(loop + 11, loop + 16)]).toEqual([3, 1, 0, 0, 0]);
});

test('Copy PNG writes a readable image through the real browser clipboard in animated mode', async ({
	page,
	context
}, testInfo) => {
	await context.grantPermissions(['clipboard-read', 'clipboard-write']);
	await context.route('https://api.pixellab.ai/**', (route) => route.abort());
	await context.addInitScript(() => {
		localStorage.setItem('pixeldoll.agentKey', 'off');
		localStorage.setItem('pixeldoll.welcomed', '1');
	});
	await openStudio(page, testInfo.project.use.baseURL! + '/#/', { waitUntil: 'networkidle' });
	await page.getByRole('button', { name: 'Share character' }).click();
	const popover = page.getByRole('dialog', { name: 'Share character preview' });
	await popover.getByRole('combobox', { name: 'Size' }).selectOption('2');
	await expect(popover.getByRole('button', { name: 'Download GIF' })).toBeEnabled();
	const [download] = await Promise.all([
		page.waitForEvent('download'),
		popover.getByRole('button', { name: 'Download GIF' }).click()
	]);
	const gif = [...(await readFile((await download.path())!))];
	await popover.getByRole('button', { name: 'Copy PNG', exact: true }).click();
	await expect(popover.getByRole('status')).toHaveText('PNG copied');
	const pixels = await page.evaluate(async (gifBytes) => {
		const items = await navigator.clipboard.read();
		const png = await items.find((item) => item.types.includes('image/png'))!.getType('image/png');
		const [copied, firstFrame] = await Promise.all([
			createImageBitmap(png),
			createImageBitmap(new Blob([new Uint8Array(gifBytes)], { type: 'image/gif' }))
		]);
		const data = (image: ImageBitmap) => {
			const canvas = document.createElement('canvas');
			canvas.width = image.width;
			canvas.height = image.height;
			const ctx = canvas.getContext('2d')!;
			ctx.drawImage(image, 0, 0);
			return ctx.getImageData(0, 0, canvas.width, canvas.height).data;
		};
		const a = data(copied),
			b = data(firstFrame);
		const matches = a.length === b.length && a.every((value, i) => value === b[i]);
		const dimensions = [copied.width, copied.height];
		copied.close();
		firstFrame.close();
		return { matches, dimensions };
	}, gif);
	expect(pixels).toEqual({ matches: true, dimensions: [128, 128] });
});

test('Share popover follows the selected move, direction and Animate switch on desktop and phone', async ({
	page,
	context
}, testInfo) => {
	const apiRequests: string[] = [];
	await context.route('https://api.pixellab.ai/**', (route) => {
		apiRequests.push(route.request().url());
		return route.abort();
	});
	await context.addInitScript(() => {
		localStorage.setItem('pixeldoll.agentKey', 'off');
		localStorage.setItem('pixeldoll.welcomed', '1');
		Object.defineProperty(Navigator.prototype, 'clipboard', {
			configurable: true,
			value: {
				write: async (items: ClipboardItem[]) => {
					const png = await items[0].getType('image/png');
					(window as unknown as { __copied?: number[] }).__copied = [
						...new Uint8Array(await png.arrayBuffer())
					];
				}
			}
		});
		Object.defineProperty(Navigator.prototype, 'canShare', {
			configurable: true,
			value: (data: ShareData) => !!data.files?.length
		});
		Object.defineProperty(Navigator.prototype, 'share', {
			configurable: true,
			value: async (data: ShareData) => {
				const file = data.files?.[0];
				(
					window as unknown as {
						__shared?: { type: string; name: string; size: number; header: number[] };
					}
				).__shared = file && {
					type: file.type,
					name: file.name,
					size: file.size,
					header: [...new Uint8Array(await file.slice(0, 24).arrayBuffer())]
				};
			}
		});
	});
	const errors: string[] = [];
	page.on('pageerror', (error) => errors.push(error.message));
	await openStudio(page, testInfo.project.use.baseURL! + '/#/', { waitUntil: 'networkidle' });
	await page.locator('.world-actors').first().waitFor();
	const trigger = page.getByRole('button', { name: 'Share character' });
	await trigger.click();
	const popover = page.getByRole('dialog', { name: 'Share character preview' });
	await expect(popover).toBeVisible();
	await expect(popover).toHaveAttribute('data-positioned', '');
	await expect(popover.locator('.bu-popover-arrow')).toBeVisible();
	expect(
		await popover.evaluate((element) => {
			const arrow = element.querySelector('.bu-popover-arrow')!.getBoundingClientRect();
			const trigger = document
				.querySelector('[popovertarget="share-popover"]')!
				.getBoundingClientRect();
			return Math.abs(arrow.x + arrow.width / 2 - trigger.x - trigger.width / 2);
		})
	).toBeLessThanOrEqual(12);
	await expect(popover.getByRole('combobox', { name: 'Move' })).toBeFocused();
	await expect(popover.getByRole('combobox', { name: 'Move' })).toHaveValue('walk');
	await expect(popover.getByRole('combobox', { name: 'Direction' })).toHaveValue('south');
	await expect(popover.getByRole('combobox', { name: 'Size' }).locator('option')).toHaveText([
		'1x size',
		'2x size',
		'3x size',
		'4x size',
		'6x size',
		'8x size',
		'10x size'
	]);
	await expect(popover.getByRole('switch')).toBeChecked();
	await expect(popover.getByRole('button', { name: 'Download GIF' })).toBeEnabled();
	await expect(popover.getByRole('button', { name: 'Download GIF' })).toContainText('Download GIF');
	await expect(popover.locator('.share-animate')).toContainText('Animated');
	const geometry = () =>
		popover.evaluate((element) => {
			const rect = (selector: string) => {
				const box = (
					selector === '#share-popover' ? element : element.querySelector(selector)!
				).getBoundingClientRect();
				return [box.x, box.y, box.width, box.height].map((value) => Math.round(value));
			};
			const preview = element.querySelector<HTMLElement>('.share-preview')!;
			return {
				popover: rect('#share-popover'),
				preview: rect('.share-preview'),
				move: rect('select[aria-label="Move"]'),
				direction: rect('select[aria-label="Direction"]'),
				size: rect('select[aria-label="Size"]'),
				animate: rect('.share-animate'),
				actions: rect('.share-actions'),
				overflow:
					preview.scrollHeight > preview.clientHeight + 1 ||
					preview.scrollWidth > preview.clientWidth + 1 ||
					element.scrollHeight > element.clientHeight + 1
			};
		});
	const fixedLayout = async (expected: Awaited<ReturnType<typeof geometry>>) => {
		const actual = await geometry();
		expect(actual.popover.slice(0, 3)).toEqual(expected.popover.slice(0, 3));
		expect(actual.preview).toEqual(expected.preview);
		expect(actual.move).toEqual(expected.move);
		expect(actual.direction).toEqual(expected.direction);
		expect(actual.size).toEqual(expected.size);
		expect(actual.animate).toEqual(expected.animate);
		expect(actual.size[2]).toBe(actual.animate[2]);
		expect(actual.actions).toEqual(expected.actions);
		expect(actual.move[2]).toBe(actual.direction[2]);
		expect(actual.overflow).toBe(false);
		expect(actual.popover[0]).toBeGreaterThanOrEqual(0);
		expect(actual.popover[0] + actual.popover[2]).toBeLessThanOrEqual(page.viewportSize()!.width);
		expect(actual.popover[1]).toBeGreaterThanOrEqual(0);
		expect(actual.popover[1] + actual.popover[3]).toBeLessThanOrEqual(page.viewportSize()!.height);
		return actual;
	};
	const headerFits = async () => {
		// The phone's view tabs float in their own row under the bar; compare the bar's own controls.
		const buttons = await page
			.locator('.experience-header button:visible')
			.evaluateAll((elements) =>
				elements
					.filter((element) => !element.closest('.view-modes'))
					.map((element) => {
						const { left, right } = element.getBoundingClientRect();
						return [left, right];
					})
					.sort((a, b) => a[0] - b[0])
			);
		for (const [index, [left, right]] of buttons.entries()) {
			expect(left).toBeGreaterThanOrEqual(0);
			expect(right).toBeLessThanOrEqual(page.viewportSize()!.width);
			if (index) expect(left).toBeGreaterThanOrEqual(buttons[index - 1][1]);
		}
	};
	const desktopLayout = await geometry();
	const desktopMove = (await popover.getByRole('combobox', { name: 'Move' }).boundingBox())!;
	const desktopSwitch = (await popover.locator('.share-animate').boundingBox())!;
	expect(desktopSwitch.y).toBeGreaterThanOrEqual(desktopMove.y + desktopMove.height);
	await page.screenshot({ path: testInfo.outputPath('share-desktop.png') });
	const [gif] = await Promise.all([
		page.waitForEvent('download'),
		popover.getByRole('button', { name: 'Download GIF' }).click()
	]);
	const gifBytes = await readFile((await gif.path())!);
	expect(gif.suggestedFilename()).toMatch(/-walk-south\.gif$/);
	expect(gifBytes.subarray(0, 6).toString()).toBe('GIF89a');
	await expect(popover.locator('[title]')).toHaveCount(0);
	await popover.getByRole('combobox', { name: 'Size' }).selectOption('3');
	await expect(popover.getByRole('button', { name: 'Download GIF' })).toBeEnabled();
	await expect(popover.locator('.share-resolution')).toHaveText('192 × 192 px');
	await expect(popover.getByRole('button', { name: 'Download GIF' })).toHaveAccessibleDescription(
		'192 × 192 px'
	);
	const [scaledGif] = await Promise.all([
		page.waitForEvent('download'),
		popover.getByRole('button', { name: 'Download GIF' }).click()
	]);
	const scaledBytes = await readFile((await scaledGif.path())!);
	expect([scaledBytes.readUInt16LE(6), scaledBytes.readUInt16LE(8)]).toEqual([192, 192]);
	await popover.getByRole('button', { name: 'Copy PNG', exact: true }).click();
	await expect(popover.getByRole('status')).toHaveText('PNG copied');
	const copied = Buffer.from(
		await page.evaluate(() => (window as unknown as { __copied: number[] }).__copied)
	);
	expect([copied.readUInt32BE(16), copied.readUInt32BE(20)]).toEqual([192, 192]);
	await popover.getByRole('button', { name: 'Share to…' }).click();
	await expect
		.poll(() =>
			page.evaluate(
				() => (window as unknown as { __shared?: { header: number[] } }).__shared?.header
			)
		)
		.toEqual([...scaledBytes.subarray(0, 24)]);
	await popover.getByRole('combobox', { name: 'Size' }).selectOption('1');
	await expect(popover.getByRole('button', { name: 'Download GIF' })).toBeEnabled();
	await popover.getByRole('button', { name: 'Share to…' }).click();
	await expect
		.poll(() =>
			page.evaluate(() => (window as unknown as { __shared?: { type: string } }).__shared?.type)
		)
		.toBe('image/gif');

	await popover.getByRole('combobox', { name: 'Move' }).selectOption('cross-punch');
	await fixedLayout(desktopLayout);
	await popover.getByRole('combobox', { name: 'Move' }).selectOption('walk');
	await expect(popover.getByRole('switch')).toBeEnabled();
	await expect(popover.getByRole('switch')).toBeChecked();

	await popover.getByRole('switch').uncheck();
	await expect(popover.getByRole('button', { name: 'Download PNG' })).toBeEnabled();
	await expect(popover.getByRole('button', { name: 'Download PNG' })).toContainText('Download PNG');
	const [png] = await Promise.all([
		page.waitForEvent('download'),
		popover.getByRole('button', { name: 'Download PNG' }).click()
	]);
	const pngBytes = await readFile((await png.path())!);
	expect(png.suggestedFilename()).toMatch(/-walk-south\.png$/);
	expect([...pngBytes.subarray(0, 4)]).toEqual([137, 80, 78, 71]);
	await popover.getByRole('button', { name: 'Copy PNG', exact: true }).click();
	await expect(popover.getByRole('status')).toHaveText('PNG copied');
	expect(
		Buffer.from(
			await page.evaluate(() => (window as unknown as { __copied: number[] }).__copied)
		).equals(pngBytes)
	).toBe(true);
	await popover.getByRole('button', { name: 'Share to…' }).click();
	await expect
		.poll(() =>
			page.evaluate(() => (window as unknown as { __shared?: { type: string } }).__shared?.type)
		)
		.toBe('image/png');

	await expect(popover.getByRole('switch')).not.toBeChecked();
	await expect(popover.getByRole('button', { name: 'Download PNG' })).toBeEnabled();
	await popover.getByRole('combobox', { name: 'Direction' }).selectOption('__all_directions__');
	await fixedLayout(desktopLayout);
	await expect(popover.getByRole('button', { name: 'Download PNG' })).toBeEnabled();
	expect(
		await popover
			.locator('.share-preview canvas')
			.evaluate((element) => (element as HTMLCanvasElement).width)
	).toBeGreaterThan(64);
	await popover.getByRole('combobox', { name: 'Move' }).selectOption('__all_moves__');
	await fixedLayout(desktopLayout);
	await expect(popover.getByRole('switch')).toBeEnabled();
	await expect(popover.getByRole('switch')).not.toBeChecked();
	await expect(popover.getByRole('button', { name: 'Download PNG' })).toBeEnabled();
	const omitted = popover.getByRole('status').filter({ hasText: 'unavailable views omitted' });
	await expect(omitted).toContainText('cross punch');
	const noticeBox = (await omitted.boundingBox())!,
		buttonsBox = (await popover.locator('.share-actions').boundingBox())!;
	expect(noticeBox.y).toBeGreaterThanOrEqual(buttonsBox.y + buttonsBox.height);
	const [allPng] = await Promise.all([
		page.waitForEvent('download'),
		popover.getByRole('button', { name: 'Download PNG' }).click()
	]);
	const allBytes = await readFile((await allPng.path())!);
	expect(allBytes.readUInt32BE(16)).toBeGreaterThan(64);
	expect(allBytes.readUInt32BE(20)).toBeGreaterThan(64);
	await popover.getByRole('switch').check();
	await fixedLayout(desktopLayout);
	await expect(popover.getByRole('button', { name: 'Download GIF' })).toBeEnabled();
	const [allGif] = await Promise.all([
		page.waitForEvent('download'),
		popover.getByRole('button', { name: 'Download GIF' }).click()
	]);
	expect((await readFile((await allGif.path())!)).subarray(0, 6).toString()).toBe('GIF89a');
	await popover.getByRole('switch').uncheck();
	await popover.getByRole('combobox', { name: 'Direction' }).selectOption('east');
	await popover.getByRole('combobox', { name: 'Move' }).selectOption('cross-punch');
	await expect(popover.locator('.share-preview canvas')).toBeVisible();
	await expect(popover.getByRole('status')).toContainText('cross punch East');
	const [fallbackPng] = await Promise.all([
		page.waitForEvent('download'),
		popover.getByRole('button', { name: 'Download PNG' }).click()
	]);
	await popover.getByRole('button', { name: 'Share to…', exact: true }).click();
	await expect
		.poll(() =>
			page.evaluate(() => (window as unknown as { __shared?: { name: string } }).__shared?.name)
		)
		.toBe(fallbackPng.suggestedFilename());
	expect(fallbackPng.suggestedFilename()).toMatch(/-cross-punch-east\.png$/);
	await popover.getByRole('combobox', { name: 'Direction' }).selectOption('__all_directions__');
	await expect(
		popover.getByRole('combobox', { name: 'Direction' }).locator('option[value="east"]')
	).toBeEnabled();
	await expect(popover.getByRole('button', { name: 'Download PNG' })).toBeEnabled();

	await page.keyboard.press('Escape');
	await expect(popover).toBeHidden();
	await page
		.getByRole('toolbar', { name: 'Preview controls' })
		.getByRole('combobox', { name: 'Move' })
		.selectOption('walk');
	await page.getByRole('button', { name: 'Face north', exact: true }).click();
	await trigger.click();
	await expect(popover.getByRole('combobox', { name: 'Move' })).toHaveValue('cross-punch');
	await expect(popover.getByRole('combobox', { name: 'Direction' })).toHaveValue(
		'__all_directions__'
	);
	await expect(popover.getByRole('switch')).not.toBeChecked();

	await page.keyboard.press('Escape');
	await page.setViewportSize({ width: 390, height: 844 });
	// Phones keep Export on the bar and open Share from More; the popover then points at More.
	await expect(trigger).toBeHidden();
	await expect(page.getByRole('button', { name: 'Export', exact: true })).toBeVisible();
	await page.getByRole('button', { name: 'More options', exact: true }).click();
	await page
		.locator('#experience-options')
		.getByRole('button', { name: 'Share...', exact: true })
		.click();
	await expect(popover).toBeVisible();
	await expect(popover.getByRole('combobox', { name: 'Move' })).toHaveValue('cross-punch');
	const box = (await popover.boundingBox())!;
	expect(box.x).toBeGreaterThanOrEqual(0);
	expect(box.x + box.width).toBeLessThanOrEqual(390);
	const moveBox = (await popover.getByRole('combobox', { name: 'Move' }).boundingBox())!;
	const directionBox = (await popover.getByRole('combobox', { name: 'Direction' }).boundingBox())!;
	const animateBox = (await popover.locator('.share-animate').boundingBox())!;
	expect(moveBox.width).toBeCloseTo(directionBox.width, 0);
	expect(animateBox.width).toBeCloseTo(moveBox.width, 0);
	const phoneLayout = await geometry();
	await popover.getByRole('combobox', { name: 'Move' }).selectOption('walk');
	await popover.getByRole('combobox', { name: 'Direction' }).selectOption('south');
	await fixedLayout(phoneLayout);
	await popover.getByRole('combobox', { name: 'Direction' }).selectOption('__all_directions__');
	await fixedLayout(phoneLayout);
	await popover.getByRole('combobox', { name: 'Move' }).selectOption('__all_moves__');
	await fixedLayout(phoneLayout);
	await popover.getByRole('switch').check();
	await fixedLayout(phoneLayout);
	await popover.getByRole('switch').uncheck();
	await fixedLayout(phoneLayout);
	await page.screenshot({ path: testInfo.outputPath('share-phone.png') });
	await page.setViewportSize({ width: 320, height: 700 });
	const grid = popover.locator('.share-preview');
	expect((await grid.boundingBox())!.height).toBeGreaterThan(200);
	expect(
		(await popover.boundingBox())!.y + (await popover.boundingBox())!.height
	).toBeLessThanOrEqual(700);
	const smallLayout = await geometry();
	await popover.getByRole('combobox', { name: 'Move' }).selectOption('walk');
	await popover.getByRole('combobox', { name: 'Direction' }).selectOption('south');
	await fixedLayout(smallLayout);
	await popover.getByRole('combobox', { name: 'Direction' }).selectOption('__all_directions__');
	await fixedLayout(smallLayout);
	await popover.getByRole('combobox', { name: 'Move' }).selectOption('__all_moves__');
	await fixedLayout(smallLayout);
	await expect(page.getByRole('button', { name: 'Share character' })).toBeHidden();
	await expect(page.getByRole('button', { name: 'Export', exact: true })).toBeVisible();
	await headerFits();
	await page.screenshot({ path: testInfo.outputPath('share-grid-320.png') });
	await popover.getByRole('combobox', { name: 'Move' }).selectOption('walk');
	await popover.getByRole('combobox', { name: 'Direction' }).selectOption('south');
	await page.setViewportSize({ width: 844, height: 390 });
	await expect
		.poll(async () => (await popover.boundingBox())!.y + (await popover.boundingBox())!.height)
		.toBeLessThanOrEqual(390);
	const landscape = (await popover.boundingBox())!;
	expect(landscape.y).toBeGreaterThanOrEqual(0);
	expect(landscape.y + landscape.height).toBeLessThanOrEqual(390);
	expect((await grid.boundingBox())!.height).toBeLessThanOrEqual(170);
	const landscapeLayout = await geometry();
	await fixedLayout(landscapeLayout);
	await popover.getByRole('combobox', { name: 'Direction' }).selectOption('__all_directions__');
	await fixedLayout(landscapeLayout);
	await popover.getByRole('combobox', { name: 'Move' }).selectOption('__all_moves__');
	await fixedLayout(landscapeLayout);
	await popover.getByRole('switch').check();
	await fixedLayout(landscapeLayout);
	await popover.getByRole('switch').uncheck();
	await fixedLayout(landscapeLayout);
	await page.screenshot({ path: testInfo.outputPath('share-grid-landscape.png') });
	await popover.getByRole('combobox', { name: 'Move' }).selectOption('walk');
	await popover.getByRole('combobox', { name: 'Direction' }).selectOption('south');
	await page.setViewportSize({ width: 320, height: 390 });
	await expect(page.getByRole('button', { name: 'Share character' })).toBeHidden();
	await expect(page.getByRole('button', { name: 'Export', exact: true })).toBeVisible();
	await headerFits();
	expect(
		(await popover.boundingBox())!.y + (await popover.boundingBox())!.height
	).toBeLessThanOrEqual(390);
	const shortLayout = await geometry();
	await fixedLayout(shortLayout);
	await popover.getByRole('combobox', { name: 'Direction' }).selectOption('__all_directions__');
	await fixedLayout(shortLayout);
	await popover.getByRole('combobox', { name: 'Move' }).selectOption('__all_moves__');
	await fixedLayout(shortLayout);
	await popover.getByRole('combobox', { name: 'Move' }).selectOption('walk');
	await popover.getByRole('combobox', { name: 'Direction' }).selectOption('south');
	await popover.getByRole('combobox', { name: 'Size' }).selectOption('10');
	await popover.getByRole('combobox', { name: 'Size' }).selectOption('2');
	await expect(popover.getByRole('button', { name: 'Download PNG' })).toBeEnabled();
	await expect(popover.locator('.share-resolution')).toHaveText('128 × 128 px');
	const [rapidPng] = await Promise.all([
		page.waitForEvent('download'),
		popover.getByRole('button', { name: 'Download PNG' }).click()
	]);
	const rapidBytes = await readFile((await rapidPng.path())!);
	expect([rapidBytes.readUInt32BE(16), rapidBytes.readUInt32BE(20)]).toEqual([128, 128]);
	await page.evaluate(() => {
		Object.defineProperty(navigator, 'clipboard', {
			configurable: true,
			value: {
				write: () =>
					Promise.reject(new DOMException('Clipboard permission denied', 'NotAllowedError'))
			}
		});
	});
	await popover.getByRole('button', { name: 'Copy PNG', exact: true }).click();
	await expect(popover.getByRole('status')).toHaveText(
		'Could not copy PNG: Clipboard permission denied'
	);
	await expect(popover.getByRole('button', { name: 'Copy PNG', exact: true })).toBeEnabled();
	await page.evaluate(() => {
		Object.defineProperty(navigator, 'clipboard', { configurable: true, value: undefined });
	});
	await popover.getByRole('button', { name: 'Copy PNG', exact: true }).click();
	await expect(popover.getByRole('status')).toContainText('Image copying is unavailable');
	await page.setViewportSize({ width: 280, height: 390 });
	const wrapped = await geometry();
	expect(wrapped.direction[1]).toBeGreaterThanOrEqual(wrapped.move[1] + wrapped.move[3]);
	expect(wrapped.animate[1]).toBeGreaterThanOrEqual(wrapped.size[1] + wrapped.size[3]);
	expect(wrapped.popover[1]).toBeGreaterThanOrEqual(0);
	expect(wrapped.popover[1] + wrapped.popover[3]).toBeLessThanOrEqual(390);
	await popover.getByRole('button', { name: 'Download PNG' }).scrollIntoViewIfNeeded();
	const reachableDownload = (await popover
		.getByRole('button', { name: 'Download PNG' })
		.boundingBox())!;
	expect(reachableDownload.y + reachableDownload.height).toBeLessThanOrEqual(390);
	await page.setViewportSize({ width: 390, height: 844 });
	await expect(page.locator('.header-export')).toBeVisible();
	await page.getByRole('button', { name: 'More options', exact: true }).click();
	await expect(page.getByRole('button', { name: 'Export game assets' })).toHaveCount(0);
	const disabledRedo = page.locator('.mobile-redo');
	await expect(disabledRedo).toBeDisabled();
	await noDisabledHover(page, disabledRedo);
	await page.getByRole('button', { name: 'Settings...', exact: true }).click();
	const settings = page.getByRole('dialog', { name: 'Settings', exact: true });
	await settings.getByRole('button', { name: 'Developer', exact: true }).click();
	await settings.getByRole('switch', { name: 'Developer mode', exact: true }).check();
	await settings.getByRole('button', { name: 'Inspect all API calls', exact: true }).click();
	const disabledCopy = page.getByRole('button', { name: 'Copy all calls' });
	await expect(disabledCopy).toBeDisabled();
	await noDisabledHover(page, disabledCopy);
	expect(errors).toEqual([]);
	expect(apiRequests).toEqual([]);
});

test('Share choices reset to the current stage when switching characters', async ({
	page,
	context
}, testInfo) => {
	await context.route('https://api.pixellab.ai/**', (route) => route.abort());
	await context.addInitScript(() => {
		localStorage.setItem('pixeldoll.agentKey', 'off');
		localStorage.setItem('pixeldoll.welcomed', '1');
	});
	await openStudio(page, testInfo.project.use.baseURL! + '/#/', { waitUntil: 'networkidle' });
	const trigger = page.getByRole('button', { name: 'Share character' });
	const popover = page.getByRole('dialog', { name: 'Share character preview' });
	const move = popover.getByRole('combobox', { name: 'Move' });
	const direction = popover.getByRole('combobox', { name: 'Direction' });
	const stageMove = page
		.getByRole('toolbar', { name: 'Preview controls' })
		.getByRole('combobox', { name: 'Move' });
	const stageDirection = () =>
		page
			.getByRole('group', { name: 'Direction' })
			.locator('button[aria-pressed="true"]')
			.getAttribute('aria-label')
			.then((label) => label!.replace('Face ', ''));
	await trigger.click();
	await move.selectOption('__all_moves__');
	await direction.selectOption('__all_directions__');
	await popover.getByRole('switch').uncheck();
	await popover.getByRole('combobox', { name: 'Size' }).selectOption('4');
	await page.keyboard.press('Escape');
	await page.getByRole('button', { name: 'Export', exact: true }).click();
	const download = page.waitForEvent('download');
	await page.getByRole('button', { name: /Download ZIP/ }).click();
	const bytes = await readFile((await (await download).path())!);
	await page.locator('.project-btn').click();
	await page
		.locator('#project-menu')
		.getByRole('button', { name: 'New character', exact: true })
		.click();
	await page.getByRole('menuitem', { name: 'Import from device...', exact: true }).click();
	await page
		.getByLabel('Character ZIP', { exact: true })
		.setInputFiles({ name: 'share-memory.zip', mimeType: 'application/zip', buffer: bytes });
	await page.getByLabel('Character name', { exact: true }).fill('Share memory copy');
	await page.getByRole('checkbox', { name: 'Set up the pose rig next (recommended)' }).uncheck();
	await page.getByRole('button', { name: 'Import character', exact: true }).click();
	await expect(page.locator('.project-btn')).toContainText('Share memory copy', {
		timeout: 30_000
	});
	await trigger.click();
	await expect(move).toHaveValue(await stageMove.inputValue());
	await expect(direction).toHaveValue(await stageDirection());
	await expect(popover.getByRole('switch')).toBeChecked();
	await expect(popover.getByRole('combobox', { name: 'Size' })).toHaveValue('1');
	await move.selectOption('__all_moves__');
	await direction.selectOption('__all_directions__');
	await page.keyboard.press('Escape');
	await page.locator('.project-btn').click();
	await page.getByRole('menuitemradio', { name: 'Adventurer (demo)', exact: true }).click();
	await expect(page.locator('.project-btn')).toContainText('Adventurer', { timeout: 30_000 });
	await trigger.click();
	await expect(move).toHaveValue(await stageMove.inputValue());
	await expect(direction).toHaveValue(await stageDirection());
	await expect(popover.getByRole('switch')).toBeChecked();
	await page.keyboard.press('Escape');
	await page.locator('.project-btn').click();
	await page.getByRole('menuitemradio', { name: 'Share memory copy', exact: true }).click();
	await expect(page.locator('.project-btn')).toContainText('Share memory copy', {
		timeout: 30_000
	});
	await trigger.click();
	await expect(move).toHaveValue(await stageMove.inputValue());
	await expect(direction).toHaveValue(await stageDirection());
	await expect(popover.getByRole('switch')).toBeChecked();
});

test('export picker has accessible categories, local icons and a native GDevelop download on every layout', async ({
	page,
	context
}, testInfo) => {
	const apiRequests: string[] = [];
	await context.route('https://api.pixellab.ai/**', (route) => {
		apiRequests.push(route.request().method());
		return route.abort();
	});
	await context.addInitScript(() => {
		localStorage.setItem('pixeldoll.agentKey', 'off');
		localStorage.setItem('pixeldoll.welcomed', '1');
		localStorage.setItem('pixeldoll.export.engine', 'unknown-engine');
	});
	const errors: string[] = [];
	page.on('pageerror', (error) => errors.push(error.message));
	await openStudio(page, testInfo.project.use.baseURL! + '/#/', { waitUntil: 'networkidle' });
	await page.locator('.world-actors').first().waitFor();
	await page.getByRole('button', { name: 'Export', exact: true }).first().click();
	const dialog = page.getByRole('dialog');
	await expect(dialog.getByRole('group', { name: 'Export format' })).toBeVisible();
	await expect(
		dialog.getByRole('heading', { name: 'Engines and frameworks', exact: true })
	).toBeVisible();
	await expect(dialog.getByRole('heading', { name: 'Assets', exact: true })).toBeVisible();
	const radios = dialog.getByRole('radio');
	await expect(radios).toHaveCount(7);
	expect(
		await radios.evaluateAll((inputs) => inputs.map((input) => input.getAttribute('aria-label')))
	).toEqual(['Godot', 'Unity', 'Phaser', 'GDevelop', 'RPG Maker', 'Aseprite', 'PNG + JSON']);
	await expect(dialog.getByRole('radio', { name: 'Godot', exact: true })).toBeChecked();
	await dialog.getByRole('radio', { name: 'Godot', exact: true }).focus();
	await page.keyboard.press('ArrowRight');
	await expect(dialog.getByRole('radio', { name: 'Unity', exact: true })).toBeChecked();
	await expect(dialog.locator('#export-description')).toContainText('prefab');
	await page.keyboard.press('ArrowRight');
	await page.keyboard.press('ArrowRight');
	await expect(dialog.getByRole('radio', { name: 'GDevelop', exact: true })).toBeChecked();
	await expect(dialog.locator('#export-description')).toContainText('project');

	for (const id of ['godot', 'unity', 'phaser', 'gdevelop', 'rpgmaker', 'aseprite', 'generic']) {
		const response = await page.request.get(
			new URL(`./icons/exports/${id}.svg`, await page.evaluate(() => document.baseURI)).href
		);
		expect(response.ok()).toBe(true);
		expect(await response.text()).toContain('<svg');
	}
	// Changing engines prepares a complete ZIP, including baked outfits, asynchronously.
	await expect(dialog.getByRole('button', { name: /Download ZIP/ })).toBeEnabled({
		timeout: 30_000
	});
	for (const viewport of [
		{ width: 1440, height: 900 },
		{ width: 390, height: 844 },
		{ width: 844, height: 390 },
		{ width: 768, height: 1024 }
	]) {
		await page.setViewportSize(viewport);
		await expect(dialog.getByRole('button', { name: /Download ZIP/ })).toBeVisible();
		expect(await dialog.evaluate((element) => element.scrollWidth <= element.clientWidth)).toBe(
			true
		);
		await dialog.getByRole('radio', { name: 'GDevelop', exact: true }).scrollIntoViewIfNeeded();
		await expect(dialog.getByRole('radio', { name: 'GDevelop', exact: true })).toBeVisible();
		if (viewport.width === 1440 || viewport.width === 390) {
			await page.screenshot({ path: testInfo.outputPath(`export-picker-${viewport.width}.png`) });
		}
	}
	const downloadButton = dialog.getByRole('button', { name: /Download ZIP/ });
	await expect(downloadButton).toBeEnabled();
	const [download] = await Promise.all([page.waitForEvent('download'), downloadButton.click()]);
	expect(download.suggestedFilename()).toContain('-gdevelop.pixeldoll.zip');
	const entries = await unzip(new Uint8Array(await readFile((await download.path())!)));
	expect(entries.has('gdevelop/game.json')).toBe(true);
	expect(entries.has('project.json')).toBe(true);
	const nativeProject = JSON.parse(
		new TextDecoder().decode(entries.get('gdevelop/game.json')!)
	) as { layouts: unknown[]; resources: { resources: unknown[] } };
	expect(nativeProject.layouts.length).toBeGreaterThan(0);
	expect(nativeProject.resources.resources.length).toBeGreaterThan(0);
	// RPG Maker: one split card. Its body only selects; its version button selects and opens the version menu (the app's
	// popover menu). The zip holds only that layout's sheets at the root, at the demo's own cell size, with no layer files.
	const rpgSheets: Record<string, { w: number; h: number }> = {};
	const versionButton = dialog.getByRole('button', { name: /^RPG Maker version/ });
	const versionMenu = page.getByRole('menu', { name: 'RPG Maker version' });
	for (const [engine, item, cols, name] of [
		['rpgmaker', 'Standard: MZ, MV, VX Ace, VX', 3, /^\$[^/]+\.png$/],
		['rpgmakerxp', 'XP and Pokémon Essentials', 4, /^[^$/][^/]*\.png$/]
	] as const) {
		await page.getByRole('button', { name: 'Export', exact: true }).first().click();
		if (engine === 'rpgmaker') {
			// GDevelop was the last format: the card body selects Standard and opens nothing
			await dialog.getByRole('radio', { name: 'RPG Maker', exact: true }).check();
			await expect(versionMenu).toBeHidden();
			// like every card, the focus ring surrounds the whole card, never only the half that has focus
			const ring = (selector: string) =>
				dialog
					.locator(selector)
					.first()
					.evaluate((element) => getComputedStyle(element).outlineStyle);
			expect([await ring('.split-card'), await ring('.split-card .export-target')]).toEqual([
				'solid',
				'none'
			]);
			await expect(versionButton).toHaveAccessibleName(
				'RPG Maker version: Standard: MZ, MV, VX Ace, VX'
			);
		}
		await versionButton.click();
		await expect(versionMenu).toBeVisible();
		await expect(
			versionMenu.getByRole('menuitemradio', { name: 'Standard: MZ, MV, VX Ace, VX' })
		).toHaveAttribute('aria-checked', 'true'); // Standard is current both times
		await versionMenu.getByRole('menuitemradio', { name: item }).click();
		await expect(versionMenu).toBeHidden();
		await expect(versionButton).toHaveAccessibleName(`RPG Maker version: ${item}`);
		await expect(dialog.locator('#export-description')).toContainText('Copy the PNG files into');
		await expect(dialog.getByText('Includes a walking sheet for your current look')).toBeVisible();
		await expect(downloadButton).toBeEnabled({ timeout: 30_000 });
		const [rpg] = await Promise.all([page.waitForEvent('download'), downloadButton.click()]);
		expect(rpg.suggestedFilename()).toContain(`-${engine}.pixeldoll.zip`);
		const rpgEntries = await unzip(new Uint8Array(await readFile((await rpg.path())!)));
		const top = [...rpgEntries.keys()].filter((entry) => !entry.startsWith('cells/'));
		const sheets = top.filter((entry) => entry.endsWith('.png'));
		expect(sheets.length).toBeGreaterThan(0);
		expect(sheets.every((entry) => name.test(entry))).toBe(true);
		expect(top.filter((entry) => !entry.endsWith('.png')).sort()).toEqual([
			'README.txt',
			'project.json'
		]);
		const image = await decodePngBytes(rpgEntries.get(sheets[0])!);
		expect([image.w % cols, image.h % 4]).toEqual([0, 0]);
		rpgSheets[engine] = { w: image.w / cols, h: image.h / 4 };
	}
	expect(rpgSheets.rpgmaker).toEqual(rpgSheets.rpgmakerxp); // same native cell in both layouts
	// XP persists; the button keeps one width for both values; clicking outside the open menu closes it and keeps the choice
	await page.getByRole('button', { name: 'Export', exact: true }).first().click();
	await expect(dialog.getByRole('radio', { name: 'RPG Maker', exact: true })).toBeChecked();
	await expect(versionButton).toHaveAccessibleName('RPG Maker version: XP and Pokémon Essentials');
	// layout width of the value area: on-screen boxes are scaled while the sheet animates open, and a description change can
	// toggle the sheet's scrollbar and resize every card
	const valueWidth = () =>
		dialog.locator('.version-value').evaluate((element) => (element as HTMLElement).offsetWidth);
	const xpWidth = await valueWidth();
	await versionButton.click();
	await expect(versionMenu).toBeVisible();
	await page.screenshot({ path: testInfo.outputPath('export-rpg-version-desktop.png') });
	await dialog.locator('#export-description').click();
	await expect(versionMenu).toBeHidden();
	await expect(dialog.getByRole('radio', { name: 'RPG Maker', exact: true })).toBeChecked();
	await expect(versionButton).toHaveAccessibleName('RPG Maker version: XP and Pokémon Essentials');
	await versionButton.click();
	await versionMenu.getByRole('menuitemradio', { name: 'Standard: MZ, MV, VX Ace, VX' }).click();
	expect(await valueWidth()).toBe(xpWidth);
	// phone: the version button becomes a full-width strip under the card body, at least 44 px tall
	await page.setViewportSize({ width: 390, height: 844 });
	const body = dialog.locator('.split-card .export-target');
	await expect(versionButton).toBeInViewport({ ratio: 1 });
	const [bodyBox, buttonBox] = [(await body.boundingBox())!, (await versionButton.boundingBox())!];
	expect(buttonBox.height).toBeGreaterThanOrEqual(44);
	expect(buttonBox.y).toBeGreaterThanOrEqual(bodyBox.y + bodyBox.height - 1);
	expect(Math.abs(buttonBox.width - bodyBox.width)).toBeLessThanOrEqual(2);
	await versionButton.click();
	await expect(versionMenu).toBeVisible();
	await page.screenshot({ path: testInfo.outputPath('export-rpg-version-390.png') });
	await page.keyboard.press('Escape');
	await expect(versionMenu).toBeHidden();
	expect(await dialog.evaluate((element) => element.scrollWidth <= element.clientWidth)).toBe(true);
	await page.getByRole('button', { name: 'Close export' }).click();
	expect(errors).toEqual([]);
	expect(apiRequests).toEqual([]);
});

test('a sheet whose code fails to load closes, says so in French and can be tried again', async ({
	page,
	context
}, testInfo) => {
	await context.route('https://api.pixellab.ai/**', (route) => route.abort());
	let fetches = 0;
	await context.route(/\/ExportSheet-[\w-]+\.js$/, (route) => {
		fetches++;
		return route.abort();
	});
	await context.addInitScript(() => {
		localStorage.setItem('pixeldoll.agentKey', 'off');
		localStorage.setItem('pixeldoll.welcomed', '1');
		localStorage.setItem('pixeldoll.locale', 'fr');
	});
	await page.goto(testInfo.project.use.baseURL! + '/#/');
	await page.locator('.customize-action').click();
	const exportButton = page.getByRole('button', { name: 'Exporter', exact: true }).first();
	await exportButton.click();
	await expect(page.locator('.toast')).toHaveText(
		'Impossible de charger une partie de PixelDoll. Rechargez la page pour réessayer.'
	);
	await expect(page.locator('dialog[open]')).toHaveCount(0);
	const tried = fetches;
	await exportButton.click();
	await expect.poll(() => fetches).toBeGreaterThan(tried);
	await expect(page.locator('dialog[open]')).toHaveCount(0);
});
