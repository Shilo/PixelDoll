import {
	openStudio,
	reloadStudio,
	equipmentMode,
	openAccount,
	noDisabledHover
} from './immersive-helpers.ts';
import { expect, test, type Locator, type Page, type Route } from '@playwright/test';
import { CharacterApi } from '../fixtures/character-api.ts';
import { readFile } from 'node:fs/promises';
import { unzip } from '../../src/lib/store/zip.ts';
import { flipH } from '../../src/lib/rig/mirror.ts';
import { decodePngBytes, encodePngBytes } from '../../src/lib/image/pngraw.ts';
import { makeImg } from '../../src/lib/image/png.ts';
import type { Manifest } from '../../src/lib/store/manifest.ts';
import { BASE_BODY, UNDERWEAR_BODY } from '../../src/studio/model.ts';
import { paintedPixels } from '../../src/studio/experience/bounds.ts';
const fulfill = async (route: Route, response: Response) =>
	route.fulfill({
		status: response.status,
		headers: Object.fromEntries(response.headers),
		body: Buffer.from(await response.arrayBuffer())
	});

test.beforeEach(async ({ context }) => {
	await context.addInitScript(() => {
		localStorage.setItem('pixeldoll.agentKey', 'off');
		localStorage.setItem('pixeldoll.welcomed', '1');
		Object.defineProperty(navigator, 'clipboard', {
			configurable: true,
			value: { writeText: async (text: string) => sessionStorage.setItem('creator-copy', text) }
		});
	});
	await context.route('https://*.pixellab.ai/**', (route) => route.abort()); // stay offline by default; a test's own route overrides this
});
async function open(page: Page, navigate = true) {
	if (navigate) await openStudio(page, '/');
	await page.locator('.project-btn').click();
	await page
		.locator('#project-menu')
		.getByRole('button', { name: 'New character', exact: true })
		.click();
	await page.getByRole('menuitem', { name: 'Create from scratch...', exact: true }).click();
	return page.getByRole('dialog', { name: 'New character', exact: true });
}
async function connect(page: Page) {
	await page
		.getByLabel('Paste your Secret API key', { exact: true })
		.fill('offline-fixture-not-a-real-key');
	await page
		.getByRole('dialog', { name: 'Connect PixelLab' })
		.getByRole('button', { name: 'Connect', exact: true })
		.click();
}

test('four overlapping creations keep independent rows and only the uninterrupted sheet goes Ready', async ({
	page,
	context
}) => {
	test.setTimeout(120_000);
	const api = new CharacterApi();
	const errors: string[] = [];
	page.on('pageerror', (error) => errors.push(error.message));
	const identities = new Map<string, number>();
	const gates = new Map(
		[1, 2, 3, 4].map((seed) => {
			let resolve!: () => void;
			const promise = new Promise<void>((release) => (resolve = release));
			return [seed, { promise, resolve }];
		})
	);
	const waiting = new Set<number>();
	await context.route('https://*.pixellab.ai/**', async (route) => {
		const request = route.request();
		const path = new URL(request.url()).pathname;
		const method = request.method();
		const body = request.postDataJSON();
		if (method === 'GET' && path.startsWith('/v2/characters/')) {
			const seed = identities.get(path.split('/').pop()!);
			if (seed) {
				waiting.add(seed);
				await gates.get(seed)!.promise;
			}
		}
		const response = await api.handle(method, request.url(), body);
		if (path === '/v2/create-character-v3' && body?.reference_image && response.ok) {
			const { character_id } = await response.clone().json();
			identities.set(character_id, body.seed);
		}
		await fulfill(route, response);
	});
	const sheet = await open(page);
	const name = sheet.getByRole('textbox', { name: 'Name', exact: true });
	const details = sheet.getByRole('textbox', { name: 'Details', exact: true });
	const create = sheet.getByRole('button', { name: 'Create character', exact: true });
	const ready = sheet.getByRole('button', { name: 'Start dressing up', exact: true });
	const library = page.getByRole('complementary', { name: 'Your characters' });
	const row = (seed: number) =>
		library.locator('.character-row').filter({ hasText: `Run ${seed}` });
	const saved = (seed: number) => row(seed).and(library.locator('[aria-pressed]'));
	try {
		for (const seed of [1, 2, 3, 4]) {
			if (seed > 1) await open(page, false);
			await expect(name).toHaveValue('');
			await expect(details).toHaveValue('');
			await name.fill(`Run ${seed}`);
			await details.fill(`A friendly humanoid scout holding lantern number ${seed}`);
			await sheet.getByRole('button', { name: 'Side-scroller 2', exact: true }).click();
			await sheet.locator('details.advanced:not([open]) > summary').click();
			await sheet.getByRole('textbox', { name: 'Seed', exact: true }).fill(String(seed));
			await create.click();
			if (seed === 1) await connect(page);
			await expect(sheet.getByText(`Run ${seed}`, { exact: true })).toBeVisible();
			if (seed < 4) {
				await sheet.getByRole('button', { name: 'Hide', exact: true }).click();
				if (seed === 1) await page.getByRole('button', { name: 'Characters', exact: true }).click();
				await expect(row(seed).getByRole('progressbar')).toBeVisible();
				await expect(row(seed).getByRole('button')).toHaveCount(0);
			}
		}
		await expect.poll(() => [...waiting].sort(), { timeout: 60_000 }).toEqual([1, 2, 3, 4]);
		expect(await library.locator('.pending-character').count()).toBe(4);
		await expect(row(1)).toContainText(/Frame \d+×\d+ px/);
		await expect(row(1)).toContainText('2 directions');
		await expect(
			library.getByRole('progressbar', { name: /Run 1/, includeHidden: true })
		).toHaveAttribute('aria-valuetext', 'Setting up the skeleton');
		gates.get(2)!.resolve();
		await expect(saved(2)).toHaveCount(1);
		await expect(ready).toHaveCount(0);
		await expect(sheet.getByText('Run 4', { exact: true })).toBeVisible();
		gates.get(4)!.resolve();
		await expect(ready).toBeVisible();
		await expect(sheet).toContainText('Run 4 is ready');
		await sheet.getByRole('button', { name: 'Close', exact: true }).first().click();
		await open(page, false);
		await expect(name).toHaveValue('');
		await details.fill('A draft that should remain open');
		for (const seed of [3, 1]) gates.get(seed)!.resolve();
		for (const seed of [1, 2, 3, 4]) await expect(saved(seed)).toHaveCount(1);
		await expect(details).toHaveValue('A draft that should remain open');
		await expect(ready).toHaveCount(0);
		await sheet.getByRole('button', { name: 'Cancel', exact: true }).click();
		await open(page, false);
		await expect(details).toHaveValue('');
		const posts = api.calls.filter((call) => call.path === '/v2/create-character-v3');
		expect(posts.map((call) => call.body?.seed).sort()).toEqual([1, 1, 2, 2, 3, 3, 4, 4]);
		expect(errors).toEqual([]);
	} finally {
		for (const gate of gates.values()) gate.resolve();
	}
});

// The two offline creation runs are the heaviest tests here (about 22 s and 42 s). CI shards are contiguous slices of the
// test order, so they are registered apart to land in different shards (docs/testing/test-performance.md).
offlineCreation({ preset: 'Unique 8', size: 128, frame: 256, reverse: false, unique: 8, rows: 8 });

test.describe('creation safety', () => {
	test.use({ baseURL: `http://127.0.0.1:${process.env.DEV_PORT ?? '5298'}` });
	test('all quality notes remain visible and failed clips come first', async ({
		page,
		context
	}) => {
		await context.route('https://*.pixellab.ai/**', (route) => route.abort());
		await openStudio(page, '/');
		await expect(page.locator('.world-actors').first()).toBeVisible();
		await page.evaluate(async () => {
			const statePath = '/src/studio/state.svelte.ts',
				dbPath = '/src/lib/store/db.ts';
			const state = (await import(statePath)) as typeof import('../../src/studio/state.svelte.ts');
			const db = (await import(dbPath)) as typeof import('../../src/lib/store/db.ts');
			const id = await state.copyDemo();
			const warnings = Array.from(
				{ length: 6 },
				(_, i) =>
					`idle/north-east: silhouette bottom differs up to ${i + 1} px from standing reference`
			);
			warnings.push('walk/west: estimated arm-joint difference 2.7 px from requested pose; review');
			warnings.push('walk/east: silhouette bottom differs up to 2 px from standing reference');
			await db.update<import('../../src/lib/store/project.ts').StoredProject>(
				'projects',
				id,
				(rec) => {
					rec!.rigQa = {
						warnings,
						clips: {
							'walk/west': {
								fails: ['estimated arm-joint difference 2.7 px from requested pose; review']
							},
							'idle/east': {
								fails: [],
								warnings: ['12 disconnected pixels retained; review details']
							}
						}
					};
					return rec!;
				}
			);
			state.creates.push({
				id,
				projectId: id,
				spec: {
					description: 'Fixture',
					name: 'Fixture',
					seed: 1,
					size: 48,
					directions: [{ id: 'south' }]
				},
				running: false,
				error: '',
				progress: null,
				views: []
			});
			state.ui.sheet = 'create';
			state.createPresentation.id = id;
		});
		const notes = page.locator('.quality-notes');
		await expect(notes).toHaveAttribute('open', '');
		await expect(notes.locator('summary')).toHaveText('9 quality notes');
		await expect(notes.locator('li')).toHaveCount(9);
		await expect(notes.locator('li').first()).toContainText(
			'Walk west: estimated arm-joint difference 2.7 px'
		);
		await expect(
			notes.getByText('Walk east: silhouette bottom differs up to 2 px from standing reference', {
				exact: true
			})
		).toBeVisible();
		await expect(
			notes.getByText('Idle east: 12 disconnected pixels retained; review details', { exact: true })
		).toBeVisible();
		await notes.locator('summary').click();
		await expect(notes.locator('li').last()).not.toBeVisible();
		await notes.locator('summary').click();
		await expect(notes.locator('li').last()).toBeVisible();
	});

	test('completed move observations remain readable on desktop and mobile', async ({
		page,
		context
	}) => {
		let requests = 0;
		await context.route('https://*.pixellab.ai/**', (route) => {
			requests++;
			return route.abort();
		});
		await openStudio(page, '/');
		await expect(page.locator('.world-actors').first()).toBeVisible();
		await page.evaluate(async () => {
			const statePath = '/src/studio/state.svelte.ts';
			const state = (await import(statePath)) as typeof import('../../src/studio/state.svelte.ts');
			const id = await state.copyDemo();
			await state.openProject(id);
			Object.assign(state.moving, {
				spec: { id: 'walk', action: 'walk', frames: 4, items: [] },
				projectId: id,
				done: true,
				warnings: [
					'walk/west: estimated arm-joint difference 2.7 px from requested pose; review',
					'walk/east: silhouette bottom differs up to 2 px from standing reference'
				],
				fitIds: [],
				error: ''
			});
			state.ui.sheet = 'move';
		});
		const sheet = page.getByRole('dialog', { name: 'New move', exact: true });
		await expect(
			sheet.getByText(
				'Walk west: estimated arm-joint difference 2.7 px from requested pose; review',
				{ exact: true }
			)
		).toBeVisible();
		await expect(
			sheet.getByText('Walk east: silhouette bottom differs up to 2 px from standing reference', {
				exact: true
			})
		).toBeVisible();
		await page.setViewportSize({ width: 390, height: 844 });
		await expect(sheet.locator('.notice.warn')).toHaveCount(2);
		for (const note of await sheet.locator('.notice.warn').all()) {
			await expect(note).toBeVisible();
			const box = (await note.boundingBox())!;
			expect(box.x).toBeGreaterThanOrEqual(0);
			expect(box.x + box.width).toBeLessThanOrEqual(390);
		}
		expect(requests).toBe(0);
	});

	test('same seeded output creates separate projects and a resumed workflow preserves its identity', async ({
		page,
		context
	}) => {
		test.setTimeout(180_000);
		const api = new CharacterApi();
		await context.route('https://*.pixellab.ai/**', async (route) => {
			const req = route.request();
			await fulfill(route, await api.handle(req.method(), req.url(), req.postDataJSON()));
		});
		const sheet = await open(page);
		const configure = async (name: string) => {
			await sheet.getByRole('textbox', { name: 'Name', exact: true }).fill(name);
			await sheet.getByRole('textbox', { name: 'Details', exact: true }).fill('A plain human');
			await sheet.getByRole('button', { name: 'Side-scroller 2', exact: true }).click();
			const closedAdvanced = sheet.locator('details.advanced:not([open]) > summary');
			if (await closedAdvanced.count()) await closedAdvanced.click(); // Seed is under Advanced
			await sheet.getByRole('textbox', { name: 'Seed', exact: true }).fill('4242');
		};
		await configure('Keep my outfit');
		await sheet.getByRole('button', { name: 'Create character', exact: true }).click();
		await connect(page);
		await expect(sheet.getByRole('button', { name: 'Start dressing up', exact: true })).toBeVisible(
			{ timeout: 120_000 }
		);
		await sheet.getByRole('button', { name: 'Start dressing up', exact: true }).click();
		const first = await page.evaluate(async () => {
			const modulePath = '/src/lib/store/db.ts';
			const { all, update } = (await import(
				modulePath
			)) as typeof import('../../src/lib/store/db.ts');
			const records = await all<import('../../src/lib/store/project.ts').StoredProject>('projects');
			const rec = records.find((r) => r.manifest?.name === 'Keep my outfit')!;
			await update<typeof rec>('projects', rec.id, (current) => {
				current!.manifest.presets.push({
					id: 'precious-outfit',
					name: 'Saved outfit',
					items: { body: 'base' },
					variants: {}
				});
				return current!;
			});
			return rec.id;
		});
		await page.locator('.project-btn').click();
		await page
			.locator('#project-menu')
			.getByRole('button', { name: 'New character', exact: true })
			.click();
		await page.getByRole('menuitem', { name: 'Create from scratch...', exact: true }).click();
		await configure('Separate character');
		await sheet.getByRole('button', { name: 'Create character', exact: true }).click();
		await expect(sheet.getByRole('button', { name: 'Start dressing up', exact: true })).toBeVisible(
			{ timeout: 120_000 }
		);
		const saved = await page.evaluate(async () => {
			const modulePath = '/src/lib/store/db.ts';
			const { all } = (await import(modulePath)) as typeof import('../../src/lib/store/db.ts');
			return (await all<import('../../src/lib/store/project.ts').StoredProject>('projects')).filter(
				(r) => r.manifest?.name === 'Keep my outfit' || r.manifest?.name === 'Separate character'
			);
		});
		expect(saved).toHaveLength(2);
		expect(
			saved.find((r) => r.id === first)?.manifest.presets.some((p) => p.id === 'precious-outfit')
		).toBe(true);
		const second = saved.find((r) => r.id !== first)!;
		expect(second.manifest.name).toBe('Separate character');
		expect(api.calls.filter((c) => c.path === '/v2/create-character-v3')).toHaveLength(2); // cached art reused, local identities separate
		await page.evaluate(async () => {
			const modulePath = '/src/lib/store/db.ts';
			const { put, CREATE_DRAFT_PREFIX } = (await import(
				modulePath
			)) as typeof import('../../src/lib/store/db.ts');
			const statePath = '/src/studio/state.svelte.ts';
			const { creates, createPresentation, REQUEST_TEXT } = (await import(
				statePath
			)) as typeof import('../../src/studio/state.svelte.ts');
			const creating = creates.find((run) => run.id === createPresentation.id)!;
			const id = CREATE_DRAFT_PREFIX + creating.id;
			await put('projects', id, {
				id,
				spec: JSON.parse(JSON.stringify(creating.spec)),
				requestText: REQUEST_TEXT
			});
		});
		await reloadStudio(page);
		await expect
			.poll(
				async () =>
					page.evaluate(async () => {
						const modulePath = '/src/lib/store/db.ts';
						const { all, CREATE_DRAFT_PREFIX } = (await import(
							modulePath
						)) as typeof import('../../src/lib/store/db.ts');
						return !(await all<{ id: string }>('projects')).some((record) =>
							record.id.startsWith(CREATE_DRAFT_PREFIX)
						);
					}),
				{ timeout: 30_000 }
			)
			.toBe(true);
		expect(
			await page.evaluate(async () => {
				const modulePath = '/src/lib/store/db.ts';
				const { all } = (await import(modulePath)) as typeof import('../../src/lib/store/db.ts');
				return (await all<{ id: string; manifest?: unknown }>('projects')).filter(
					(r) => r.id.startsWith('rig-') && r.manifest
				).length;
			})
		).toBe(2);
		expect(api.calls.filter((c) => c.path === '/v2/create-character-v3')).toHaveLength(2);
	});
});

async function chooseSkeletonMove(sheet: Locator) {
	// Advanced is a side column toggle on wide sheets.
	const model = sheet.getByRole('combobox', { name: 'Motion model', exact: true });
	if (!(await model.isVisible())) await sheet.getByRole('button', { name: /^Advanced/ }).click();
	await model.selectOption('skeleton-v3');
}

test('Add a move queues behind the running move and runs it next', async ({ page, context }) => {
	test.setTimeout(150_000);
	const api = new CharacterApi();
	let held = true;
	await context.route('https://*.pixellab.ai/**', async (route) => {
		const req = route.request(),
			path = new URL(req.url()).pathname;
		// keep the first move running: its pose jobs report processing until released, as a busy PixelLab queue does
		if (
			held &&
			path.startsWith('/v2/background-jobs/') &&
			api.calls.some((c) => c.path === '/v2/animate-with-skeleton-v3')
		)
			return route.fulfill({ json: { id: path.split('/').pop(), status: 'processing' } });
		await fulfill(route, await api.handle(req.method(), req.url(), req.postDataJSON()));
	});
	const sheet = await open(page);
	await sheet.getByRole('textbox', { name: 'Details', exact: true }).fill('A plain human');
	await sheet.getByRole('button', { name: 'Side-scroller 2', exact: true }).click();
	await sheet.getByRole('button', { name: 'Create character', exact: true }).click();
	await connect(page);
	await sheet
		.getByRole('button', { name: 'Start dressing up', exact: true })
		.click({ timeout: 90_000 });
	await equipmentMode(page, 'Moves');
	await page.getByRole('button', { name: 'New move...', exact: true }).click();
	const move = page.getByRole('dialog', { name: 'New move', exact: true });
	await expect(page.getByRole('button', { name: /Add idle \+ walk/i })).toHaveCount(0);
	await move.getByRole('button', { name: 'Walk', exact: true }).click();
	await chooseSkeletonMove(move);
	await move.getByRole('button', { name: /^Generate / }).click();
	await expect(move).not.toContainText('Queued next: Idle');
	await move.getByRole('button', { name: 'Queue another move', exact: true }).click();
	// The form keeps Walk applied, so it says Walk is already queued.
	await expect(move.getByRole('button', { name: 'Walk', exact: true })).toHaveAttribute(
		'aria-pressed',
		'true'
	);
	await expect(move).toContainText('Walk is already queued.');
	await expect(move.getByRole('button', { name: /^Queue Walk/ })).toBeDisabled();
	await expect(move.getByRole('button', { name: 'Inspect API calls', exact: true })).toHaveCount(0);
	await move.getByRole('button', { name: 'Idle', exact: true }).click();
	await chooseSkeletonMove(move);
	await expect(move).toContainText('It waits for the move in progress, then runs by itself.');
	await move.getByRole('button', { name: /^Queue Idle/ }).click();
	await expect(move).toContainText('Queued next: Idle');
	await expect(page.locator('.move-row', { hasText: 'Idle' })).toContainText('Queued');
	await move.getByRole('button', { name: 'Queue another move', exact: true }).click();
	const draft = move.getByRole('textbox', { name: 'Describe the motion', exact: true });
	await draft.fill('jump softly');
	held = false;
	const review = page.getByRole('dialog', { name: 'Review move', exact: true });
	await expect(
		page.locator('.move-list button').filter({ hasText: 'Idle' }).filter({ hasText: 'Review move' })
	).toBeVisible({
		timeout: 120_000
	});
	await expect(draft).toHaveValue('jump softly');
	await move.getByRole('button', { name: 'Cancel', exact: true }).click();
	await equipmentMode(page, 'States');
	await expect(page.getByRole('button', { name: /Idle Review move/ })).toHaveCount(0);
	await equipmentMode(page, 'Moves');
	await page.getByRole('button', { name: /Walk Review move/ }).click();
	await review.getByRole('button', { name: 'Save move', exact: true }).click();
	await page.getByRole('button', { name: /Idle Review move/ }).click();
	await review.getByRole('button', { name: 'Save move', exact: true }).click();
	await expect(page.locator('.move-list .move-row b')).toHaveText(['Walk', 'Idle']);
});

test('a failed required measurement stops the queued idle without paying for an art reroll', async ({
	page,
	context
}) => {
	test.setTimeout(120_000);
	const api = new CharacterApi();
	let releaseMeasurement!: () => void;
	const measurement = new Promise<void>((resolve) => {
		releaseMeasurement = resolve;
	});
	await context.route('https://*.pixellab.ai/**', async (route) => {
		const req = route.request(),
			body = req.postDataJSON();
		if (new URL(req.url()).pathname === '/v2/estimate-skeleton') await measurement;
		const response = await api.handle(req.method(), req.url(), body);
		await fulfill(
			route,
			new URL(req.url()).pathname === '/v2/estimate-skeleton'
				? Response.json({ keypoints: [], usage: { type: 'generations', generations: 0.1 } })
				: response
		);
	});
	const sheet = await open(page);
	await sheet.getByRole('textbox', { name: 'Details', exact: true }).fill('A plain human');
	await sheet.getByRole('button', { name: 'Side-scroller 2', exact: true }).click();
	await sheet.getByRole('button', { name: 'Create character', exact: true }).click();
	await connect(page);
	// Creation reads the standing joints and makes no animation, so it completes; the failure belongs to the move.
	await expect(sheet.getByRole('button', { name: 'Start dressing up', exact: true })).toBeVisible({
		timeout: 90_000
	});
	expect(
		api.calls.filter(
			(c) => c.path === '/v2/estimate-skeleton' || c.path === '/v2/animate-with-skeleton-v3'
		)
	).toHaveLength(0);
	await expect(sheet.getByRole('button', { name: /Add idle \+ walk/i })).toHaveCount(0);
	await sheet.getByRole('button', { name: 'Start dressing up', exact: true }).click();
	await equipmentMode(page, 'Moves');
	await page.getByRole('button', { name: 'New move...', exact: true }).click();
	const move = page.getByRole('dialog', { name: 'New move', exact: true });
	await chooseSkeletonMove(move);
	await move.getByRole('button', { name: /^Generate / }).click();
	try {
		await move.getByRole('button', { name: 'Queue another move', exact: true }).click();
		await move.getByRole('button', { name: 'Walk', exact: true }).click();
		await move.getByRole('button', { name: /^Queue Walk/ }).click();
	} finally {
		releaseMeasurement();
	}
	await expect(move).toContainText(/joints (were )?not found on every frame/, { timeout: 90_000 });
	await expect(move).toContainText('Queued next: Walk');
	expect(api.calls.filter((c) => c.path === '/v2/animate-with-skeleton-v3')).toHaveLength(1);
	const saved = await page.evaluate(
		() =>
			new Promise<string[][]>((resolve, reject) => {
				const r = indexedDB.open('pixeldoll');
				r.onerror = () => reject(r.error);
				r.onsuccess = () => {
					const db = r.result,
						q = db.transaction('projects').objectStore('projects').getAll();
					q.onsuccess = () => {
						db.close();
						resolve(
							q.result
								.filter((p: { manifest?: Manifest }) => p.manifest)
								.map((p: { manifest: Manifest }) => p.manifest.rig.animations.map((a) => a.id))
						);
					};
					q.onerror = () => reject(q.error);
				};
			})
	);
	expect(saved).toEqual([['default']]);
});

test('visible size fields, auto frame, preset deselection and preview positions stay consistent', async ({
	page,
	context
}) => {
	const calls: string[] = [];
	await context.route('https://*.pixellab.ai/**', async (route) => {
		calls.push(route.request().url());
		await route.abort();
	});
	const sheet = await open(page),
		body = sheet.getByRole('spinbutton', { name: 'Body size', exact: true }),
		frame = sheet.getByRole('spinbutton', { name: 'Frame size', exact: true });
	const before = await sheet.getByRole('img', { name: /^Size guide:/ }).boundingBox();
	for (const [size, expected] of [
		[48, 64],
		[64, 80],
		[96, 128],
		[128, 160]
	]) {
		await sheet.getByRole('button', { name: String(size), exact: true }).click();
		await expect(body).toHaveValue(String(size));
		await expect(frame).toHaveValue(String(expected));
		const after = await sheet.getByRole('img', { name: /^Size guide:/ }).boundingBox();
		expect(after?.y).toBe(before?.y);
	}
	await body.fill('64');
	await expect(sheet.locator('.body-presets [aria-pressed=true]')).toHaveCount(0);
	await expect(frame).toHaveValue('80');
	await frame.fill('112');
	await expect(sheet.getByRole('button', { name: 'Auto', exact: true })).toHaveAttribute(
		'aria-pressed',
		'false'
	);
	await body.fill('48');
	await expect(frame).toHaveValue('112');
	await sheet.getByRole('button', { name: 'Auto', exact: true }).click();
	await expect(frame).toHaveValue('64');
	await sheet.getByRole('button', { name: 'Auto', exact: true }).click();
	await expect(frame).toBeFocused();
	expect(
		(await sheet.getByRole('button', { name: 'Auto', exact: true }).boundingBox())!.width
	).toBeCloseTo(
		(await sheet.getByRole('button', { name: '48', exact: true }).boundingBox())!.width
	);
	await expect(sheet.locator('.pixel-input > span')).toHaveText(['px', 'px']);
	expect(calls).toEqual([]);
	await body.fill('64.5');
	await expect(sheet.getByRole('status').and(sheet.locator('.creator-validation'))).toContainText(
		'whole pixels'
	);
	await expect(sheet.getByRole('button', { name: 'Create character', exact: true })).toBeDisabled();
	await body.fill('64');
	await frame.fill('80');
	await expect(sheet.locator('.creator-validation')).toHaveCount(0);
});

test('appearance tooltips stay next to their trigger and inside the viewport', async ({ page }) => {
	const sheet = await open(page);
	for (const name of ['Appearance help', 'Kind']) {
		const trigger = sheet.getByRole('button', { name, exact: true });
		await trigger.click();
		const tip = sheet.getByRole('tooltip');
		await expect(tip).toBeVisible();
		await expect(tip).toHaveAttribute('data-positioned', '');
		await expect(tip.locator('.bu-popover-arrow')).toBeVisible();
		const r = (await trigger.boundingBox())!,
			t = (await tip.boundingBox())!;
		expect(t.x).toBeGreaterThanOrEqual(0);
		expect(t.x + t.width).toBeLessThanOrEqual(page.viewportSize()!.width);
		expect(t.y + t.height).toBeLessThanOrEqual(page.viewportSize()!.height);
		expect(
			Math.min(Math.abs(t.y - r.y - r.height), Math.abs(r.y - t.y - t.height))
		).toBeLessThanOrEqual(8);
		await page.keyboard.press('Escape');
	}
});

test('linked prompt is lossless, copy is exact, and keyboard tabs work', async ({ page }) => {
	const sheet = await open(page);
	const details = sheet.getByRole('textbox', { name: 'Details', exact: true });
	await details.pressSequentially('A freckled elf ');
	await expect(details).toHaveValue('A freckled elf ');
	await sheet.getByRole('combobox', { name: 'Kind', exact: true }).selectOption('Elf');
	await sheet.getByRole('button', { name: 'Copy details', exact: true }).click();
	expect(await page.evaluate(() => sessionStorage.getItem('creator-copy'))).toBe('A freckled elf');
	await sheet.getByRole('tab', { name: 'Appearance', exact: true }).press('ArrowRight');
	const prompt = sheet.getByRole('textbox', { name: 'Exact prompt', exact: true });
	expect(await prompt.inputValue()).toContain('Kind: Elf');
	const exact =
		'Not an elf.\n\nKind: Orc\nBuild: Broad\nProportions: Chibi\nSkin: Pale\nKeep this  \n';
	await prompt.fill(exact);
	await sheet.getByRole('button', { name: 'Copy exact prompt', exact: true }).click();
	expect(await page.evaluate(() => sessionStorage.getItem('creator-copy'))).toBe(exact);
	await sheet.getByRole('tab', { name: 'Prompt', exact: true }).press('Home');
	for (const [name, value] of [
		['Kind', 'Orc'],
		['Build', 'Broad'],
		['Proportions', 'Chibi'],
		['Skin', 'Pale']
	])
		await expect(sheet.getByRole('combobox', { name, exact: true })).toHaveValue(value);
	await sheet.getByRole('combobox', { name: 'Build', exact: true }).selectOption('Rounded');
	await sheet.getByRole('button', { name: 'Edit exact prompt', exact: true }).click();
	await expect(prompt).toHaveValue(exact.replace('Build: Broad', 'Build: Rounded'));
});

test('editor help opens from either the toggle or help icon and follows the active tab', async ({
	page
}) => {
	const sheet = await open(page),
		toggle = sheet.getByRole('tablist', { name: 'Prompt editor', exact: true });
	await toggle.hover();
	await expect(sheet.getByRole('tooltip')).toContainText('Describe distinctive features');
	await sheet.getByRole('button', { name: 'Appearance help', exact: true }).hover();
	await expect(sheet.getByRole('tooltip')).toContainText('Describe distinctive features');
	await page.keyboard.press('Escape');
	await expect(sheet.getByRole('tooltip')).toHaveCount(0);
	await sheet.getByRole('tab', { name: 'Prompt', exact: true }).click();
	await toggle.hover();
	await expect(sheet.getByRole('tooltip')).toContainText(
		'This exact text is sent to the selected model'
	);
	await sheet.getByRole('button', { name: 'Prompt help', exact: true }).click();
	await expect(sheet.getByRole('tooltip')).toContainText(
		'This exact text is sent to the selected model'
	);
	await page.keyboard.press('Escape');
	await expect(sheet).toBeVisible();
});

test('all direction presets, reverse mirrors and source promotion keep a valid plan', async ({
	page
}) => {
	const sheet = await open(page);
	for (const [preset, unique, selected] of [
		['Top-down 8', 5, 8],
		['Top-down 4', 3, 4],
		['Diagonal 4', 2, 4],
		['Side-scroller 2', 1, 2],
		['Unique 8', 8, 8]
	] as const) {
		await sheet.getByRole('button', { name: preset, exact: true }).click();
		await expect(sheet.locator('.direction[aria-pressed=true]')).toHaveCount(selected);
		await expect(sheet.locator('.mirror[aria-pressed=true]')).toHaveCount(selected - unique);
	}
	await sheet.getByRole('button', { name: 'Top-down 8', exact: true }).click();
	for (const [east, west] of [
		['NE', 'NW'],
		['E', 'W'],
		['SE', 'SW']
	]) {
		await sheet.getByRole('button', { name: `Mirror ${east}`, exact: true }).click();
		await expect(
			sheet.getByRole('button', { name: `Mirror ${west}`, exact: true })
		).toHaveAttribute('aria-pressed', 'false');
		await sheet.getByRole('button', { name: `${west} direction`, exact: true }).click();
		await expect(
			sheet.getByRole('button', { name: `Mirror ${east}`, exact: true })
		).toHaveAttribute('aria-pressed', 'false');
	}
	for (const dir of ['N', 'NE', 'E', 'SE', 'S'])
		await sheet.getByRole('button', { name: `${dir} direction`, exact: true }).click();
	await expect(sheet.getByRole('button', { name: 'Create character', exact: true })).toBeDisabled();
	await expect(sheet.getByRole('status').and(sheet.locator('.creator-validation'))).toContainText(
		'Choose at least one direction'
	);
});

test('V3 enhance connects once, preserves settings, undo restores exactly, and failures never retry', async ({
	page,
	context
}) => {
	const api = new CharacterApi();
	await context.route('https://*.pixellab.ai/**', async (route) => {
		const req = route.request(),
			response = await api.handle(req.method(), req.url(), req.postDataJSON());
		await fulfill(route, response);
	});
	let sheet = await open(page);
	await sheet.getByRole('textbox', { name: 'Details', exact: true }).fill('A freckled elf');
	await sheet.getByRole('button', { name: '96', exact: true }).click();
	await sheet.getByRole('button', { name: 'Side-scroller 2', exact: true }).click();
	await sheet.getByRole('tab', { name: 'Prompt', exact: true }).click();
	const original = await sheet
		.getByRole('textbox', { name: 'Exact prompt', exact: true })
		.inputValue();
	const enhanceWidth = (await sheet
		.getByRole('button', { name: 'Enhance', exact: true })
		.boundingBox())!.width;
	const copyBefore = await sheet
		.getByRole('button', { name: 'Copy exact prompt', exact: true })
		.boundingBox();
	await sheet.getByRole('button', { name: 'Enhance', exact: true }).click();
	await connect(page);
	sheet = page.getByRole('dialog', { name: 'New character', exact: true });
	await expect(sheet.getByRole('button', { name: 'Undo', exact: true })).toBeVisible();
	expect(
		(await sheet.getByRole('button', { name: 'Undo', exact: true }).boundingBox())!.width
	).toBe(enhanceWidth);
	expect(
		await sheet.getByRole('button', { name: 'Copy exact prompt', exact: true }).boundingBox()
	).toEqual(copyBefore);
	const enhance = api.calls.filter((c) => c.path === '/v2/enhance-character-v3-prompt');
	expect(enhance).toHaveLength(1);
	expect(enhance[0].body).toMatchObject({
		description: original,
		image_size: { width: 96, height: 96 },
		view: 'side'
	});
	await sheet.getByRole('button', { name: 'Undo', exact: true }).click();
	await expect(sheet.getByRole('textbox', { name: 'Exact prompt', exact: true })).toHaveValue(
		original
	);
	await sheet.getByRole('textbox', { name: 'Exact prompt', exact: true }).fill('[fail] a dwarf');
	await sheet.getByRole('button', { name: 'Enhance', exact: true }).click();
	await expect(sheet.getByRole('status').and(sheet.locator('.creator-message'))).toContainText(
		'Your text was kept'
	);
	await expect(sheet.getByRole('textbox', { name: 'Exact prompt', exact: true })).toHaveValue(
		'[fail] a dwarf'
	);
	expect(api.calls.filter((c) => c.path === '/v2/enhance-character-v3-prompt')).toHaveLength(2);
});

test('Appearance enhancement sends all selected hints and keeps them linked without duplicate prompt lines', async ({
	page,
	context
}) => {
	const api = new CharacterApi();
	await context.route('https://*.pixellab.ai/**', async (route) => {
		const req = route.request();
		await fulfill(route, await api.handle(req.method(), req.url(), req.postDataJSON()));
	});
	const sheet = await open(page);
	await sheet.getByRole('textbox', { name: 'Details', exact: true }).fill('Pointed ears');
	for (const [name, value] of [
		['Kind', 'Elf'],
		['Build', 'Broad'],
		['Proportions', 'Chibi'],
		['Skin', 'Brown']
	])
		await sheet.getByRole('combobox', { name, exact: true }).selectOption(value);
	await sheet.getByRole('button', { name: 'Copy exact prompt', exact: true }).click();
	const before = await page.evaluate(() => sessionStorage.getItem('creator-copy'));
	await sheet.getByRole('button', { name: 'Enhance', exact: true }).click();
	await connect(page);
	await expect(sheet.getByRole('button', { name: 'Undo', exact: true })).toBeVisible();
	expect(
		api.calls.find((c) => c.path === '/v2/enhance-character-v3-prompt')?.body?.description
	).toBe(before);
	for (const [name, value] of [
		['Kind', 'Elf'],
		['Build', 'Broad'],
		['Proportions', 'Chibi'],
		['Skin', 'Brown']
	])
		await expect(sheet.getByRole('combobox', { name, exact: true })).toHaveValue(value);
	await expect(sheet.getByRole('textbox', { name: 'Details', exact: true })).toHaveValue(
		'Pointed ears\nSubtle freckles and expressive eyes.'
	);
	await sheet.getByRole('button', { name: 'Copy exact prompt', exact: true }).click();
	const after = await page.evaluate(() => sessionStorage.getItem('creator-copy'));
	expect(after?.match(/Kind: Elf/g)).toHaveLength(1);
	await sheet.getByRole('button', { name: 'Undo', exact: true }).click();
	await sheet.getByRole('button', { name: 'Copy exact prompt', exact: true }).click();
	expect(await page.evaluate(() => sessionStorage.getItem('creator-copy'))).toBe(before);
});

test('Appearance enhancement cannot clear selected hints with repeated clauses or erase details with an empty rewrite', async ({
	page,
	context
}) => {
	const api = new CharacterApi();
	let response = 'Sharper ears\nKind: Human\nKind: Orc\nBuild: Rounded';
	await context.route('https://*.pixellab.ai/**', async (route) => {
		const req = route.request();
		if (new URL(req.url()).pathname === '/v2/enhance-character-v3-prompt')
			await route.fulfill({
				json: { enhanced_prompt: response, usage: { type: 'generations', generations: 0.05 } }
			});
		else await fulfill(route, await api.handle(req.method(), req.url(), req.postDataJSON()));
	});
	const sheet = await open(page);
	await sheet.getByRole('textbox', { name: 'Details', exact: true }).fill('Pointed ears');
	await sheet.getByRole('combobox', { name: 'Kind', exact: true }).selectOption('Elf');
	await sheet.getByRole('combobox', { name: 'Build', exact: true }).selectOption('Broad');
	await sheet.getByRole('button', { name: 'Enhance', exact: true }).click();
	await connect(page);
	await expect(sheet.getByRole('button', { name: 'Undo', exact: true })).toBeVisible();
	await expect(sheet.getByRole('textbox', { name: 'Details', exact: true })).toHaveValue(
		'Sharper ears'
	);
	await expect(sheet.getByRole('combobox', { name: 'Kind', exact: true })).toHaveValue('Elf');
	await expect(sheet.getByRole('combobox', { name: 'Build', exact: true })).toHaveValue('Broad');
	await sheet.getByRole('button', { name: 'Undo', exact: true }).click();
	response = 'Kind: Orc\nBuild: Rounded';
	await sheet.getByRole('button', { name: 'Enhance', exact: true }).click();
	await expect(sheet.getByRole('status').and(sheet.locator('.creator-message'))).toContainText(
		'Your text was kept'
	);
	await expect(sheet.getByRole('textbox', { name: 'Details', exact: true })).toHaveValue(
		'Pointed ears'
	);
	await expect(sheet.getByRole('combobox', { name: 'Kind', exact: true })).toHaveValue('Elf');
});

test('switching tabs while Enhance runs leaves the next field usable', async ({
	page,
	context
}) => {
	const api = new CharacterApi();
	let release!: () => void;
	const held = new Promise<void>((resolve) => (release = resolve));
	await context.route('https://*.pixellab.ai/**', async (route) => {
		const request = route.request();
		if (new URL(request.url()).pathname === '/v2/enhance-character-v3-prompt') {
			await held;
			await route.fulfill({ json: { enhanced_prompt: 'A calm face' } }).catch(() => {});
		} else
			await fulfill(
				route,
				await api.handle(request.method(), request.url(), request.postDataJSON())
			);
	});
	const sheet = await open(page);
	await sheet.getByRole('textbox', { name: 'Details', exact: true }).fill('Freckles');
	await sheet.getByRole('button', { name: 'Enhance', exact: true }).click();
	await connect(page);
	await expect(sheet.getByRole('button', { name: /^Enhancing/ })).toBeVisible();
	// Leaving the tab cancels the request; the form must not stay busy.
	await sheet.getByRole('tab', { name: 'Prompt', exact: true }).click();
	await expect(sheet.getByRole('button', { name: 'Enhance', exact: true })).toBeEnabled();
	release();
});

test('Appearance enhancement preserves coverage and changing base clothing clears stale Undo', async ({
	page,
	context
}) => {
	const api = new CharacterApi();
	let returnedBody = BASE_BODY;
	await context.route('https://*.pixellab.ai/**', async (route) => {
		const request = route.request();
		if (new URL(request.url()).pathname === '/v2/enhance-character-v3-prompt') {
			await route.fulfill({ json: { enhanced_prompt: `A calm face\n${returnedBody}` } });
		} else
			await fulfill(
				route,
				await api.handle(request.method(), request.url(), request.postDataJSON())
			);
	});
	const sheet = await open(page);
	await sheet.getByRole('textbox', { name: 'Details', exact: true }).fill('Freckles');
	await sheet.getByRole('button', { name: 'Enhance', exact: true }).click();
	await connect(page);
	await expect(sheet.getByRole('button', { name: 'Undo', exact: true })).toBeVisible();
	await expect(sheet.getByRole('button', { name: 'Edit exact prompt', exact: true })).toHaveText(
		`A calm face\n${UNDERWEAR_BODY}`
	);
	const nude = sheet.getByRole('radio', { name: 'Nothing worn', exact: true });
	await expect(nude).not.toBeChecked();
	await nude.check();
	await expect(sheet.getByRole('button', { name: 'Undo', exact: true })).toHaveCount(0);
	returnedBody = UNDERWEAR_BODY;
	await sheet.getByRole('textbox', { name: 'Details', exact: true }).fill('Freckles');
	await sheet.getByRole('button', { name: 'Enhance', exact: true }).click();
	await expect(sheet.getByRole('button', { name: 'Undo', exact: true })).toBeVisible();
	await expect(nude).toBeChecked();
	await expect(sheet.getByRole('button', { name: 'Edit exact prompt', exact: true })).toHaveText(
		`A calm face\n${BASE_BODY}`
	);
	await sheet.getByRole('button', { name: 'Undo', exact: true }).click();
	await expect(sheet.getByRole('button', { name: 'Edit exact prompt', exact: true })).toHaveText(
		`Freckles\n${BASE_BODY}`
	);
});

test('late enhancement cannot overwrite edits or reopen a closed form', async ({
	page,
	context
}) => {
	const api = new CharacterApi();
	await context.route('https://*.pixellab.ai/**', async (route) => {
		const req = route.request(),
			response = await api.handle(req.method(), req.url(), req.postDataJSON());
		await fulfill(route, response).catch(() => {});
	});
	let sheet = await open(page);
	await sheet.getByRole('textbox', { name: 'Details', exact: true }).fill('[slow] an elf');
	await sheet.getByRole('button', { name: 'Enhance', exact: true }).click();
	await connect(page);
	sheet = page.getByRole('dialog', { name: 'New character', exact: true });
	await sheet.getByRole('textbox', { name: 'Details', exact: true }).fill('My newer text');
	await expect(sheet.getByRole('status').and(sheet.locator('.creator-message'))).toContainText(
		'Settings changed'
	);
	await expect(sheet.getByRole('textbox', { name: 'Details', exact: true })).toHaveValue(
		'My newer text'
	);
	await sheet.getByRole('textbox', { name: 'Details', exact: true }).fill('[slow] another elf');
	await sheet.getByRole('button', { name: 'Enhance', exact: true }).click();
	await sheet.getByRole('button', { name: 'Cancel', exact: true }).click();
	await expect(page.getByRole('dialog')).toHaveCount(0);
	await expect
		.poll(() => api.calls.filter((c) => c.path === '/v2/enhance-character-v3-prompt').length)
		.toBe(2);
});

test('canceling the connection discards the pending enhancement instead of charging after a later connection', async ({
	page,
	context
}) => {
	const api = new CharacterApi();
	await context.route('https://*.pixellab.ai/**', async (route) => {
		const req = route.request();
		await fulfill(route, await api.handle(req.method(), req.url(), req.postDataJSON()));
	});
	const sheet = await open(page);
	await sheet.getByRole('textbox', { name: 'Details', exact: true }).fill('A friendly elf');
	await sheet.getByRole('button', { name: 'Enhance', exact: true }).click();
	await page
		.getByRole('dialog', { name: 'Connect PixelLab' })
		.getByRole('button', { name: 'Not now', exact: true })
		.click();
	await openAccount(page);
	await connect(page);
	await page.locator('.project-btn').click();
	await page
		.locator('#project-menu')
		.getByRole('button', { name: 'New character', exact: true })
		.click();
	await page.getByRole('menuitem', { name: 'Create from scratch...', exact: true }).click();
	await expect(sheet.getByRole('textbox', { name: 'Details', exact: true })).toHaveValue(
		'A friendly elf'
	);
	await expect(sheet.getByRole('button', { name: 'Enhance', exact: true })).toBeEnabled();
	expect(api.calls.filter((c) => c.path === '/v2/enhance-character-v3-prompt')).toEqual([]);
});

test.describe('touch tablet', () => {
	test.use({ hasTouch: true, viewport: { width: 768, height: 1024 } });
	test('mirror controls retain 44px targets without overflowing the two-column layout', async ({
		page
	}) => {
		const sheet = await open(page);
		const tab = await sheet.getByRole('tab', { name: 'Prompt', exact: true }).boundingBox(),
			help = await sheet
				.getByRole('button', { name: 'Appearance help', exact: true })
				.boundingBox();
		expect(tab!.x + tab!.width <= help!.x || tab!.y + tab!.height <= help!.y).toBe(true);
		await sheet.getByRole('tab', { name: 'Prompt', exact: true }).click();
		const buttons = await sheet.locator('.mirror, .creator-tabs button').evaluateAll((elements) =>
			elements.map((el) => {
				const r = el.getBoundingClientRect();
				return { w: r.width, h: r.height };
			})
		);
		expect(buttons.filter((b) => b.w < 44 || b.h < 44)).toEqual([]);
		expect(await sheet.evaluate((el) => el.scrollWidth <= el.clientWidth)).toBe(true);
	});
});

for (const viewport of [
	{ width: 320, height: 568 },
	{ width: 350, height: 800 },
	{ width: 360, height: 800 },
	{ width: 390, height: 844 },
	{ width: 599, height: 540 },
	{ width: 600, height: 540 },
	{ width: 600, height: 900 },
	{ width: 760, height: 900 },
	{ width: 844, height: 390 },
	{ width: 768, height: 1024 },
	{ width: 900, height: 900 },
	{ width: 1280, height: 500 },
	{ width: 1440, height: 900 },
	{ width: 1920, height: 1080 }
])
	test(`creator fits ${viewport.width}×${viewport.height} without clipped controls`, async ({
		page
	}) => {
		await page.setViewportSize(viewport);
		const sheet = await open(page);
		const drop = sheet.getByRole('button', { name: 'Add image', exact: true });
		const guide = sheet.getByRole('heading', { name: 'Size guide', exact: true });
		const diagram = sheet.locator('.creator-guide .preview-box');
		if (viewport.height <= 540 && viewport.width >= 600) {
			await expect(guide).toBeHidden();
			await drop.scrollIntoViewIfNeeded();
			await expect(drop).toBeInViewport({ ratio: 1 });
			await drop.focus();
			const chooser = page.waitForEvent('filechooser');
			await drop.press('Enter');
			await (await chooser).setFiles([]);
			await expect(drop).toBeFocused();
		} else if (viewport.width >= 1440) {
			const tabs = (await sheet.getByRole('tablist', { name: 'Prompt editor' }).boundingBox())!;
			const heading = (await guide.boundingBox())!;
			const box = (await drop.boundingBox())!;
			const preview = (await diagram.boundingBox())!;
			const geometry = (await sheet
				.getByRole('region', { name: 'Character size and camera' })
				.boundingBox())!;
			expect(heading.y).toBeCloseTo(tabs.y);
			expect(preview.x).toBeCloseTo(box.x, 0);
			expect(preview.width).toBeCloseTo(box.width, 0);
			expect(preview.height).toBeCloseTo(preview.width, 0);
			// The appearance column sits evenly between the reference rail and the size controls.
			const column = (await sheet
				.getByRole('textbox', { name: 'Details', exact: true })
				.boundingBox())!;
			expect(column.x - (box.x + box.width)).toBeCloseTo(geometry.x - (column.x + column.width), 0);
			expect(box.y).toBeGreaterThan(heading.y + heading.height);
		} else {
			await expect(guide).toBeVisible();
		}
		if (viewport.width === 320) {
			const clothing = sheet.getByRole('radiogroup', { name: 'Base clothing' });
			await clothing.scrollIntoViewIfNeeded();
			await expect(clothing).toBeInViewport({ ratio: 1 });
			for (const label of ['Underwear', 'Nothing worn']) {
				const text = clothing.getByText(label, { exact: true });
				expect(
					await text.evaluate((element) => {
						const range = document.createRange();
						range.selectNodeContents(element);
						return range.getClientRects().length;
					})
				).toBe(1);
			}
			const preview = (await diagram.boundingBox())!;
			expect(preview.width).toBeLessThanOrEqual(128);
			expect(preview.height).toBeCloseTo(preview.width, 0);
			const max = Number(await sheet.getByRole('spinbutton', { name: 'Frame size' }).inputValue());
			await expect(drop).toHaveAccessibleDescription(
				`Use a front-facing sprite. Max ${max} × ${max} px, 8 MB.`
			);
			const emptyHeight = (await drop.boundingBox())!.height;
			const picker = sheet.locator('.reference input[type=file]');
			const image = await page.evaluate((max) => {
				const canvas = document.createElement('canvas');
				canvas.width = max * 2;
				canvas.height = max;
				const context = canvas.getContext('2d')!;
				context.fillStyle = 'white';
				context.fillRect(0, 0, canvas.width, canvas.height);
				context.fillStyle = 'black';
				context.fillRect(5, 5, 16, 16);
				return canvas.toDataURL().split(',')[1];
			}, max);
			const filename = `${'character-revision-'.repeat(6)}sprite.png`;
			await picker.setInputFiles({
				name: filename,
				mimeType: 'image/png',
				buffer: Buffer.from(image, 'base64')
			});
			const attachment = sheet.getByRole('button', {
				name: 'Choose a different reference image',
				exact: true
			});
			await expect(attachment).toBeVisible();
			await expect(attachment).toHaveAccessibleDescription(/sprite\.png/);
			const dimensions = attachment.getByText(`${max} × ${max / 2} px`, { exact: true });
			const name = attachment.getByText(filename, { exact: true });
			expect((await dimensions.boundingBox())!.y).toBeCloseTo((await name.boundingBox())!.y);
			expect(await dimensions.evaluate((size) => size.scrollWidth === size.clientWidth)).toBe(true);
			expect(await name.evaluate((file) => file.scrollWidth > file.clientWidth)).toBe(true);
			await expect(
				sheet.locator('.reference > small').filter({ hasText: 'Resized from' })
			).toHaveText(`Resized from ${max * 2} × ${max} to ${max} × ${max / 2} px.`);
			const source = (await attachment.locator('image').getAttribute('href'))!;
			const prepared = await decodePngBytes(Buffer.from(source.split(',')[1], 'base64'));
			expect([prepared.w, prepared.h]).toEqual([max, max / 2]);
			expect(prepared.data.every((value) => value === 0 || value === 255)).toBe(true);
			const browserSession = await page.context().newCDPSession(page);
			await browserSession.send('Page.setInterceptFileChooserDialog', {
				enabled: true,
				cancel: true
			});
			await picker.evaluate((input) =>
				input.addEventListener(
					'cancel',
					(event) => {
						if (event.isTrusted) input.setAttribute('data-browser-cancelled', 'true');
					},
					{ once: true }
				)
			);
			await attachment.click();
			await expect(picker).toHaveAttribute('data-browser-cancelled', 'true');
			await browserSession.send('Page.setInterceptFileChooserDialog', { enabled: false });
			await browserSession.detach();
			await expect(sheet).toBeVisible();
			await expect(attachment).toBeFocused();
			await expect(attachment).toHaveAccessibleDescription(/sprite\.png/);
			const bounds = (await attachment.boundingBox())!;
			const remove = (await sheet.getByRole('button', { name: 'Remove reference' }).boundingBox())!;
			expect(remove.y).toBeCloseTo(bounds.y, 0);
			expect(remove.height).toBeCloseTo(bounds.height, 0);
			expect(bounds.height).toBeCloseTo(emptyHeight, 0);
			expect(bounds.x + bounds.width).toBeLessThanOrEqual(viewport.width);
			expect(bounds.height).toBeGreaterThanOrEqual(44);
			await picker.setInputFiles({
				name: 'broken.png',
				mimeType: 'image/png',
				buffer: Buffer.from('not a PNG')
			});
			await expect(sheet.getByText(/No reference attached/)).toBeVisible();
			await expect(attachment).toHaveCount(0);
		}
		// Full desktop fits in one screen; narrower layouts deliberately reflow and scroll.
		if (viewport.width === 1920) {
			for (const theme of ['dark', 'light']) {
				await page.evaluate(
					(theme) => document.documentElement.setAttribute('data-theme', theme),
					theme
				);
				await expect
					.poll(() =>
						sheet.locator('.sheet-body').evaluate((el) => ({
							x: el.scrollWidth - el.clientWidth,
							y: el.scrollHeight - el.clientHeight
						}))
					)
					.toEqual({ x: 0, y: 0 });
			}
		}
		const layout = await sheet.locator('.creator-grid').evaluate((element) => {
			const style = getComputedStyle(element),
				width = element.getBoundingClientRect().width;
			const appearance = element.querySelector('.appearance')!,
				appearanceWidth = appearance.getBoundingClientRect().width;
			return {
				stacked: style.display === 'flex' && style.flexDirection === 'column',
				width,
				appearanceWidth,
				sections: [
					...element.querySelectorAll(':scope > .appearance, :scope > .geometry, :scope > .facing')
				].map((section) => section.getBoundingClientRect().width),
				controls: [...appearance.querySelectorAll('textarea, select')].map(
					(control) => control.getBoundingClientRect().width
				)
			};
		});
		// A contained flex item can collapse without overflowing. Stacked editors must use the available width.
		if (layout.stacked)
			for (const width of layout.sections) expect(width).toBeCloseTo(layout.width, 0);
		for (const width of layout.controls) expect(width).toBeCloseTo(layout.appearanceWidth, 0);
		await sheet.getByRole('textbox', { name: 'Details', exact: true }).fill('A friendly dwarf');
		const horizontal = await sheet.evaluate((element) => ({
			client: element.clientWidth,
			scroll: element.scrollWidth
		}));
		expect(horizontal.scroll).toBeLessThanOrEqual(horizontal.client);
		// The compact guide puts its square beside the readout, while the desktop guide stacks them.
		const readoutFits = await sheet.locator('.size-guide').evaluate((el, compact) => {
			if (!el.getClientRects().length) return true;
			const image = el.querySelector('.preview-box')!.getBoundingClientRect(),
				readout = el.querySelector('.sizes')!.getBoundingClientRect(),
				row = el.closest('.creator-rail')!.querySelector('.reference-row')!.getBoundingClientRect();
			return compact
				? readout.left >= image.right && Math.abs(readout.right - row.right) < 1
				: readout.top >= image.bottom && Math.abs(readout.right - image.right) < 1;
		}, viewport.width <= 1000);
		expect(readoutFits).toBe(true);
		await expect(sheet.locator('.mirror-summary')).toHaveCount(0);
		const autoHeight = await sheet.getByRole('button', { name: 'Auto', exact: true }).boundingBox();
		const frameHeight = await sheet
			.getByRole('spinbutton', { name: 'Frame size', exact: true })
			.boundingBox();
		expect(autoHeight!.height).toBeCloseTo(frameHeight!.height, 0);
		const arrowWidths = await sheet
			.locator('.direction')
			.evaluateAll((elements) => elements.map((el) => el.getBoundingClientRect().width));
		const tileWidths = await sheet
			.locator('.direction-tile')
			.evaluateAll((elements) => elements.map((el) => el.getBoundingClientRect().width));
		const spread = (widths: number[]) => Math.max(...widths) - Math.min(...widths);
		expect(arrowWidths.every((width) => width >= 44)).toBe(true);
		// Approved compass: equal tiles with attached mirrors; the narrowest phones equalize arrows instead. One CSS pixel of border slack.
		expect(Math.min(spread(tileWidths), spread(arrowWidths))).toBeLessThanOrEqual(1);
		const copyRight = async () =>
			sheet.locator('.prompt-note').evaluate((el) => ({
				copy: el.querySelector('.copy')!.getBoundingClientRect().right,
				row: el.getBoundingClientRect().right
			}));
		const shortCopy = await copyRight();
		await sheet
			.getByRole('textbox', { name: 'Details', exact: true })
			.fill(
				'A friendly dwarf with freckles and a broad nose, expressive eyebrows, small ears and a calm expression'
			);
		const longCopy = await copyRight();
		expect(shortCopy.copy).toBeCloseTo(shortCopy.row, 0);
		expect(longCopy.copy).toBeCloseTo(shortCopy.copy, 0);
		const buttons = await sheet.locator('.direction, .mirror').evaluateAll((elements) =>
			elements.map((el) => {
				const r = el.getBoundingClientRect();
				return { w: r.width, h: r.height };
			})
		);
		expect(
			buttons.every(
				(b) => b.w >= (viewport.width <= 599 || viewport.height <= 499 ? 44 : 28) && b.h >= 44
			)
		).toBe(true);
		const closedAdvanced = sheet.locator('details.advanced:not([open]) > summary');
		if (await closedAdvanced.count()) await closedAdvanced.click(); // Seed is under Advanced
		await sheet.getByRole('textbox', { name: 'Seed', exact: true }).fill('123');
		await sheet.getByRole('button', { name: 'Camera', exact: true }).click();
		const tooltip = sheet.getByRole('tooltip');
		await expect(tooltip).toBeVisible();
		const bounds = await tooltip.boundingBox();
		expect(bounds!.x).toBeGreaterThanOrEqual(0);
		expect(bounds!.x + bounds!.width).toBeLessThanOrEqual(viewport.width);
		await page.keyboard.press('Escape');
		await expect(sheet).toBeVisible();
		const footer = await sheet
			.getByRole('button', { name: 'Create character', exact: true })
			.boundingBox();
		expect(footer!.y + footer!.height).toBeLessThanOrEqual(viewport.height);
		const appearanceGap = await sheet
			.getByRole('textbox', { name: 'Details', exact: true })
			.evaluate(
				(el) =>
					el.getBoundingClientRect().top -
					el.closest('.appearance')!.querySelector('.editor-toolbar')!.getBoundingClientRect()
						.bottom
			);
		const appearanceActions = await sheet.locator('.prompt-actions').evaluate((el) =>
			[...el.querySelectorAll(':scope > button')].map((child) => {
				const r = child.getBoundingClientRect();
				return { x: r.x, w: r.width };
			})
		);
		await sheet.getByRole('tab', { name: 'Prompt', exact: true }).click();
		expect(
			(await sheet.getByRole('textbox', { name: 'Exact prompt', exact: true }).boundingBox())!.width
		).toBeCloseTo(layout.appearanceWidth, 0);
		const promptGap = await sheet
			.getByRole('textbox', { name: 'Exact prompt', exact: true })
			.evaluate(
				(el) =>
					el.getBoundingClientRect().top -
					el.closest('.appearance')!.querySelector('.editor-toolbar')!.getBoundingClientRect()
						.bottom
			);
		expect(promptGap).toBe(appearanceGap);
		const promptActions = await sheet.locator('.prompt-actions').evaluate((el) =>
			[...el.querySelectorAll(':scope > button')].map((child) => {
				const r = child.getBoundingClientRect();
				return { x: r.x, w: r.width };
			})
		);
		expect(promptActions).toEqual(appearanceActions);
		expect(
			await sheet.locator('.creator-tabs button').evaluateAll((elements) =>
				elements.every((el) => {
					const range = document.createRange();
					range.selectNodeContents(el);
					const text = range.getBoundingClientRect(),
						button = el.getBoundingClientRect();
					return text.left >= button.left && text.right <= button.right;
				})
			)
		).toBe(true);
		expect(
			await sheet
				.locator('.prompt-actions > button')
				.evaluateAll((elements) => elements.map((el) => el.getAttribute('aria-label')))
		).toEqual(['Copy exact prompt', 'Enhance']);
		const toolbar = await sheet.locator('.editor-toolbar').evaluate((el) => {
			const row = el.getBoundingClientRect();
			return [...el.querySelectorAll('button')].every((button) => {
				const r = button.getBoundingClientRect();
				return (
					r.left >= row.left &&
					r.right <= row.right + 1 &&
					r.top >= row.top &&
					r.bottom <= row.bottom
				);
			});
		});
		expect(toolbar).toBe(true);
	});

test('compact creator toolbar keeps wider fallback-font labels and actions readable', async ({
	page,
	context
}, info) => {
	await context.route('https://*.pixellab.ai/**', (route) => route.abort());
	for (const width of [320, 350, 360, 390, 900]) {
		await page.setViewportSize({ width, height: width === 320 ? 568 : 900 });
		const sheet = await open(page);
		await page.addStyleTag({
			content: '.character-sheet { font-family: Verdana, sans-serif !important; }'
		});
		const tabs = sheet.getByRole('tablist', { name: 'Prompt editor', exact: true });
		await tabs.scrollIntoViewIfNeeded();
		expect(
			await tabs.getByRole('tab').evaluateAll((buttons) =>
				buttons.every((button) => {
					const range = document.createRange();
					range.selectNodeContents(button);
					const text = range.getBoundingClientRect(),
						rect = button.getBoundingClientRect();
					return text.left >= rect.left && text.right <= rect.right;
				})
			)
		).toBe(true);
		// Labels fitting is insufficient if an adjacent action intercepts their clicks.
		await tabs.getByRole('tab', { name: 'Prompt', exact: true }).click();
		await expect(tabs.getByRole('tab', { name: 'Prompt', exact: true })).toHaveAttribute(
			'aria-selected',
			'true'
		);
		await tabs.getByRole('tab', { name: 'Appearance', exact: true }).click();
		const toolbar = await sheet.locator('.editor-toolbar').boundingBox();
		expect(
			await sheet.locator('.editor-toolbar').evaluate((element) => {
				const buttons = [...element.querySelectorAll('button')].map((button) =>
					button.getBoundingClientRect()
				);
				return buttons.every((a, index) =>
					buttons
						.slice(index + 1)
						.every(
							(b) =>
								a.right <= b.left + 0.5 ||
								b.right <= a.left + 0.5 ||
								a.bottom <= b.top + 0.5 ||
								b.bottom <= a.top + 0.5
						)
				);
			})
		).toBe(true);
		for (const label of ['Appearance help']) {
			const button = sheet
				.locator('.editor-toolbar')
				.getByRole('button', { name: label, exact: true });
			await expect(button).toBeVisible();
			const rect = await button.boundingBox();
			expect(rect!.x).toBeGreaterThanOrEqual(toolbar!.x);
			expect(rect!.x + rect!.width).toBeLessThanOrEqual(toolbar!.x + toolbar!.width + 1);
		}
		// Enhance sits inside the details field's top-right corner.
		const field = await sheet.getByRole('textbox', { name: 'Details', exact: true }).boundingBox();
		const wand = await sheet.getByRole('button', { name: 'Enhance', exact: true }).boundingBox();
		expect(wand!.x + wand!.width).toBeLessThanOrEqual(field!.x + field!.width);
		expect(wand!.y).toBeGreaterThanOrEqual(field!.y);
		await page.screenshot({ path: info.outputPath(`creator-toolbar-${width}.png`) });
	}
});

offlineCreation({
	preset: 'Side-scroller 2',
	size: 48,
	frame: 81,
	reverse: true,
	unique: 1,
	rows: 2
});

type CreationCase = {
	preset: string;
	size: number;
	frame: number;
	reverse: boolean;
	unique: number;
	rows: number;
};
function offlineCreation(config: CreationCase) {
	test(`offline creation, persistence and export: ${config.preset}, ${config.frame}px`, async ({
		page,
		context
	}) => {
		test.setTimeout(180_000);
		const api = new CharacterApi(),
			errors: string[] = [];
		let release!: () => void;
		const skeletonRead = new Promise<void>((resolve) => {
			release = resolve;
		});
		page.on('pageerror', (e) => errors.push(e.message));
		await context.route('https://*.pixellab.ai/**', async (route) => {
			const req = route.request();
			if (req.method() === 'GET' && new URL(req.url()).pathname.startsWith('/v2/characters/'))
				await skeletonRead; // hold creation after the draw
			await fulfill(route, await api.handle(req.method(), req.url(), req.postDataJSON()));
		});
		const sheet = await open(page);
		await sheet
			.getByRole('textbox', { name: 'Details', exact: true })
			.fill('A friendly humanoid with freckles');
		await sheet.getByRole('textbox', { name: 'Name', exact: true }).fill('Offline creator test');
		await sheet.getByRole('button', { name: config.preset, exact: true }).click();
		await sheet.getByRole('button', { name: String(config.size), exact: true }).click();
		await sheet
			.getByRole('spinbutton', { name: 'Frame size', exact: true })
			.fill(String(config.frame));
		if (config.reverse) await sheet.getByRole('button', { name: 'Mirror E', exact: true }).click();
		await sheet.getByRole('tab', { name: 'Prompt', exact: true }).click();
		const exact = await sheet
			.getByRole('textbox', { name: 'Exact prompt', exact: true })
			.inputValue();
		await sheet.getByRole('button', { name: 'Create character', exact: true }).click();
		await connect(page);
		// The standing views show as soon as the draw lands, while the skeleton step is still running.
		await expect(sheet.locator('.review-grid figure')).toHaveCount(config.rows, {
			timeout: 90_000
		});
		await expect(sheet.getByRole('button', { name: 'Start dressing up', exact: true })).toHaveCount(
			0
		);
		release();
		await expect(sheet.getByRole('button', { name: 'Start dressing up', exact: true })).toBeVisible(
			{ timeout: 150_000 }
		);
		const preview = await sheet
			.locator('.review-grid canvas')
			.first()
			.evaluate((element: HTMLCanvasElement) => ({ w: element.width, h: element.height }));
		expect(preview.w).toBe(config.frame * 2);
		expect(preview.h).toBe(config.frame * 2);
		const creates = api.calls.filter((c) => c.path === '/v2/create-character-v3');
		expect(creates).toHaveLength(2);
		expect(creates[0].body).toMatchObject({
			description: exact,
			image_size: { width: config.size, height: config.size }
		});
		expect(creates[1].body).toMatchObject({ n_directions: 8 });
		expect(Object.keys(creates[1].body!.direction_images!)).toHaveLength(7);
		// Default-first: creation makes no animation; each move is explicitly approved afterward.
		expect(
			api.calls.filter(
				(c) =>
					c.path === '/v2/animate-with-skeleton-v3' ||
					c.path === '/v2/characters/animations' ||
					c.path === '/v2/estimate-skeleton'
			)
		).toHaveLength(0);
		await sheet.getByRole('button', { name: 'Start dressing up', exact: true }).click();
		await expect(page.locator('.project-btn')).toContainText('Offline creator test');
		await page.locator('.project-btn').click();
		await page
			.locator('#project-menu')
			.getByRole('button', { name: 'New character', exact: true })
			.click();
		await page.getByRole('menuitem', { name: 'Create from scratch...', exact: true }).click();
		await expect(page.getByRole('tab', { name: 'Appearance', exact: true })).toBeVisible();
		await page.getByRole('button', { name: 'Cancel', exact: true }).click();
		await equipmentMode(page, 'Moves');
		const move = page.getByRole('dialog', { name: 'New move', exact: true });
		const review = page.getByRole('dialog', { name: 'Review move', exact: true });
		for (const name of ['Idle', 'Walk']) {
			await page.getByRole('button', { name: 'New move...', exact: true }).click();
			await move.getByRole('button', { name, exact: true }).click();
			await chooseSkeletonMove(move);
			await move.getByRole('button', { name: /^Generate / }).click();
			await review
				.getByRole('button', { name: 'Save move', exact: true })
				.click({ timeout: 120_000 });
		}
		await expect(page.locator('.move-list .move-row b')).toHaveText(['Idle', 'Walk'], {
			timeout: 150_000
		});
		await page.getByRole('button', { name: 'Share character' }).click();
		const share = page.getByRole('dialog', { name: 'Share character preview' }),
			shareMove = share.getByRole('button', { name: /^States and moves:/ });
		await expect(shareMove).toHaveAttribute('value', 'default');
		await shareMove.click();
		const shareMenu = share.getByRole('menu', { name: 'States and moves', exact: true });
		await expect(shareMenu.getByRole('menuitemradio')).toHaveText([
			'All states',
			'Standing',
			'All moves',
			'Idle',
			'Walk',
			'Everything'
		]);
		await shareMenu.getByRole('menuitemradio', { name: 'Standing', exact: true }).click();
		await expect(share.getByRole('switch')).toBeDisabled();
		await expect(share.getByRole('switch')).not.toBeChecked();
		await noDisabledHover(page, share.locator('.share-animate'));
		await expect(share.getByRole('button', { name: 'Download PNG' })).toBeEnabled();
		await shareMove.click();
		await shareMenu.getByRole('menuitemradio', { name: 'All states', exact: true }).click();
		await expect(shareMove).toHaveAttribute('value', '__all_states__');
		await expect(share.getByRole('button', { name: 'Download PNG' })).toBeEnabled();
		await shareMove.click();
		await shareMenu.getByRole('menuitemradio', { name: 'Walk', exact: true }).click();
		await expect(share.getByRole('switch')).toBeEnabled();
		await expect(share.getByRole('switch')).toBeChecked();
		await page.keyboard.press('Escape');
		const raw = api.calls.filter((c) => c.path === '/v2/animate-with-skeleton-v3');
		expect(raw).toHaveLength(config.unique * 2);
		if (config.reverse)
			expect(
				raw.every((c) => (c.body as unknown as { direction: string }).direction === 'west')
			).toBe(true);
		const moveCanvas = page.locator('.move-thumb canvas').first();
		const thumbnail = await moveCanvas.evaluate((canvas: HTMLCanvasElement) => ({
			w: canvas.width,
			h: canvas.height,
			data: Array.from(
				canvas.getContext('2d')!.getImageData(0, 0, canvas.width, canvas.height).data
			)
		}));
		expect(paintedPixels({ ...thumbnail, data: new Uint8ClampedArray(thumbnail.data) })).toEqual({
			left: 0,
			top: 0,
			right: thumbnail.w,
			bottom: thumbnail.h
		});
		const thumbnailBox = (await moveCanvas.boundingBox())!;
		expect(thumbnailBox.width).toBeLessThanOrEqual(56);
		expect(thumbnailBox.height).toBeLessThanOrEqual(56);
		await reloadStudio(page);
		await expect(page.locator('.project-btn')).toContainText('Offline creator test');
		await page.getByRole('button', { name: 'Export', exact: true }).click();
		await page.getByRole('radio', { name: /PNG \+ JSON/ }).click();
		const downloaded = page.waitForEvent('download');
		await page.getByRole('button', { name: /Download ZIP/ }).click();
		const zipBytes = await readFile((await (await downloaded).path())!);
		const entries = await unzip(new Uint8Array(zipBytes));
		const manifest = JSON.parse(new TextDecoder().decode(entries.get('manifest.json'))) as Manifest;
		expect(manifest.rig.animations[0]).toMatchObject({ id: 'standing', kind: 'state' });
		expect(manifest.rig.cell).toEqual({ w: config.frame, h: config.frame });
		expect(manifest.rig.directions).toHaveLength(config.rows);
		expect(Object.keys(manifest.rig.rest!)).toHaveLength(8);
		const image = await decodePngBytes(entries.get('layers/body/base/main/idle.png')!);
		expect(image.w).toBe(config.frame * 4);
		expect(image.h).toBe(config.frame * config.rows);
		if (config.reverse) {
			const first = {
				w: config.frame,
				h: config.frame,
				data: new Uint8ClampedArray(config.frame * config.frame * 4)
			};
			const second = { ...first, data: new Uint8ClampedArray(first.data.length) };
			for (let y = 0; y < config.frame; y++) {
				first.data.set(
					image.data.subarray(y * image.w * 4, (y * image.w + config.frame) * 4),
					y * config.frame * 4
				);
				second.data.set(
					image.data.subarray(
						(y + config.frame) * image.w * 4,
						((y + config.frame) * image.w + config.frame) * 4
					),
					y * config.frame * 4
				);
			}
			expect(first.data).toEqual(flipH(second).data);
			expect(manifest.rig.directions).toEqual([{ id: 'east', mirrorOf: 'west' }, { id: 'west' }]);
		}
		await page.locator('.project-btn').click();
		await page
			.locator('#project-menu')
			.getByRole('button', { name: 'New character', exact: true })
			.click();
		await page.getByRole('menuitem', { name: 'Import from device...', exact: true }).click();
		await page.getByLabel('Character ZIP', { exact: true }).setInputFiles({
			name: 'custom-character.zip',
			mimeType: 'application/zip',
			buffer: zipBytes
		});
		const imported = page.getByRole('img', { name: 'Character import preview', exact: true });
		await expect(imported).toBeVisible();
		expect((await imported.boundingBox())!.width).toBeLessThanOrEqual(256);
		expect(await imported.locator('canvas').getAttribute('width')).toBe(
			String(config.frame * Math.max(1, Math.min(3, Math.floor(256 / config.frame))))
		);
		await page.getByLabel('Character name', { exact: true }).fill('Restored custom frame');
		await page.getByRole('button', { name: 'Import character', exact: true }).click();
		// Saving then reopening a full 8-direction 256 px character decodes every frame; on slow runners this exceeded the 5 s CI default.
		await expect(page.locator('.project-btn')).toContainText('Restored custom frame', {
			timeout: 30_000
		});
		if (config.reverse) {
			await page.locator('.project-btn').click();
			await page.getByRole('menuitem', { name: /Set up character/ }).click();
			const setup = page.getByRole('dialog', { name: 'Set up character', exact: true });
			await setup.getByRole('button', { name: /^Set up.*gens$/ }).click();
			await connect(page);
			await expect(setup).toContainText('Ready. You can add equipment', { timeout: 60_000 });
			const registrations = api.calls.filter(
				(c) => c.path === '/v2/create-character-v3' && c.body?.reference_image
			);
			expect(registrations).toHaveLength(2);
			expect(registrations[1].body?.direction_images).toEqual(
				registrations[0].body?.direction_images
			);
			const estimates = api.calls.filter((c) => c.path === '/v2/estimate-skeleton');
			for (const call of estimates)
				expect((await decodePngBytes(Buffer.from(call.body!.image!.base64, 'base64'))).w).toBe(128);
		}
		expect(errors).toEqual([]);
	});
}

test('Standard creates from a south sprite and registers all views with V3', async ({
	page,
	context
}) => {
	const api = new CharacterApi();
	await context.route('https://*.pixellab.ai/**', async (route) => {
		const request = route.request();
		await fulfill(route, await api.handle(request.method(), request.url(), request.postDataJSON()));
	});
	const sheet = await open(page);
	await sheet
		.getByRole('textbox', { name: 'Details', exact: true })
		.fill('A front-facing explorer');
	await sheet.locator('details.advanced > summary').click();
	await sheet.getByRole('combobox', { name: 'Model', exact: true }).selectOption('standard');
	await sheet.getByRole('spinbutton', { name: 'Body size', exact: true }).fill('48');
	const sprite = makeImg(24, 32);
	for (let row = 8; row < 28; row++)
		for (let column = 8; column < 16; column++)
			sprite.data.set([222, 80, 40, 255], (row * 24 + column) * 4);
	await sheet.locator('input[type=file]').setInputFiles({
		name: 'south.png',
		mimeType: 'image/png',
		buffer: Buffer.from(await encodePngBytes(sprite))
	});
	await expect(sheet.getByText('south.png', { exact: true })).toBeVisible();
	await sheet.getByRole('button', { name: 'Create character', exact: true }).click();
	await connect(page);
	await expect(sheet.getByRole('button', { name: 'Start dressing up', exact: true })).toBeVisible();
	const draw = api.calls.find(
		({ path }) => path === '/v2/create-character-with-8-directions'
	)?.body;
	expect(draw).toMatchObject({ mode: 'standard', image_size: { width: 48, height: 48 } });
	expect(Object.keys(draw?.directions ?? {})).toEqual(['south']);
	const south = draw?.directions;
	if (!south || Array.isArray(south) || !south.south) throw new Error('Missing south sprite');
	const padded = await decodePngBytes(Buffer.from(south.south.base64, 'base64'));
	expect([padded.w, padded.h]).toEqual([48, 48]);
	const expected = makeImg(48, 48);
	for (let row = 0; row < sprite.h; row++)
		expected.data.set(
			sprite.data.subarray(row * 24 * 4, (row + 1) * 24 * 4),
			((row + 8) * 48 + 12) * 4
		);
	expect(Buffer.from(padded.data)).toEqual(Buffer.from(expected.data));
	expect(
		api.calls.find(({ path }) => path === '/v2/create-character-v3')?.body?.direction_images
	).toHaveProperty('north');
});

test('switching the model keeps Advanced open and base clothing shows both choices', async ({
	page
}) => {
	const sheet = await open(page);
	await sheet.locator('details.advanced > summary').click();
	const model = sheet.getByRole('combobox', { name: 'Model', exact: true });
	await expect(model.locator('option')).toHaveText([
		'Default (V3)',
		'Pro',
		'Pro Flash',
		'Standard'
	]);
	const drop = sheet.getByRole('button', { name: 'Add image', exact: true });
	await model.selectOption('standard');
	await expect(drop).toBeVisible();
	await expect(drop).toBeEnabled();
	await expect(sheet.getByText('Character sprite (optional)', { exact: true })).toBeVisible();
	await expect(drop).toHaveAccessibleDescription(
		/Use a front-facing sprite\. Max \d+ × \d+ px, 8 MB\./
	);
	await model.selectOption('v3');
	await expect(drop).toBeEnabled();
	const missedDrop = await sheet.evaluate((dialog) => {
		const dataTransfer = new DataTransfer();
		dataTransfer.items.add(new File(['unexpected'], 'missed.png', { type: 'image/png' }));
		return !dialog.dispatchEvent(
			new DragEvent('drop', { dataTransfer, bubbles: true, cancelable: true })
		);
	});
	expect(missedDrop).toBe(true);
	await expect(drop).toBeVisible();
	await drop.evaluate((element) => {
		const dataTransfer = new DataTransfer();
		dataTransfer.items.add(new File([], 'guide.png', { type: 'image/png' }));
		element.dispatchEvent(
			new DragEvent('dragover', { dataTransfer, bubbles: true, cancelable: true })
		);
	});
	await expect(drop).toHaveAttribute('data-variant', 'primary');
	await drop.evaluate(async (element) => {
		const canvas = document.createElement('canvas');
		canvas.width = 160;
		canvas.height = 96;
		canvas.getContext('2d')!.fillRect(8, 8, 32, 64);
		const blob = await new Promise<Blob>((resolve) => canvas.toBlob((result) => resolve(result!)));
		const dataTransfer = new DataTransfer();
		dataTransfer.items.add(new File([blob], 'guide.png', { type: 'image/png' }));
		element.dispatchEvent(new DragEvent('drop', { dataTransfer, bubbles: true, cancelable: true }));
	});
	const attachment = sheet.getByRole('button', {
		name: 'Choose a different reference image',
		exact: true
	});
	await expect(attachment).toHaveAccessibleDescription(/guide\.png/);
	await expect(attachment).toContainText('80 × 48 px');
	const remove = sheet.getByRole('button', { name: 'Remove reference', exact: true });
	await model.selectOption('standard');
	const body = sheet.getByRole('spinbutton', { name: 'Body size', exact: true });
	await expect(sheet.getByRole('button', { name: /^Create character/ })).toBeDisabled();
	await body.fill('96');
	await expect(attachment).toBeVisible();
	await expect(attachment).toBeEnabled();
	await expect(attachment).toContainText('guide.png');
	await expect(remove).toBeEnabled();
	await expect(sheet.getByRole('button', { name: /^Create character/ })).toBeEnabled();
	await model.selectOption('pro');
	await expect(attachment).toBeEnabled();
	await expect(remove).toBeEnabled();
	await expect(sheet.getByText(/sketch or character design/)).toBeVisible();
	await model.selectOption('pro-flash');
	await expect(sheet.getByText(/use artwork as a style guide/i)).toBeVisible();
	await expect(attachment).toHaveAccessibleDescription(/guide\.png/);
	await remove.click();
	await expect(drop).toBeFocused();
	await model.selectOption('pro');
	await expect(sheet.locator('details.advanced')).toHaveAttribute('open', '');
	await expect(sheet.getByRole('combobox', { name: 'Outline', exact: true })).toHaveCount(0);
	// The model's limits (MODELS) drive the body field: a size V3 accepts survives switching to Pro, which explains and
	// blocks it instead of clamping it.
	await model.selectOption('v3');
	await body.fill('172');
	await expect(body).not.toHaveAttribute('aria-invalid', 'true');
	await model.selectOption('pro');
	await expect(body).toHaveValue('172');
	await expect(body).toHaveAttribute('max', '168');
	await expect(body).toHaveAttribute('aria-invalid', 'true');
	await expect(sheet.locator('.field-error')).toHaveText(
		'Body size must be 32–168 whole pixels with Pro.'
	);
	await expect(sheet.getByRole('button', { name: /^Create character/ })).toBeDisabled();
	await model.selectOption('v3');
	await expect(body).toHaveAttribute('max', '256');
	await expect(sheet.locator('.field-error')).toHaveCount(0);
	await expect(sheet.getByRole('button', { name: /^Create character/ })).toBeEnabled();
	await expect(sheet.locator('details.advanced')).toHaveAttribute('open', '');
	await expect(sheet.getByRole('combobox', { name: 'Outline', exact: true })).toBeVisible();
	// The sheet's 44 px floor is for one-line fields only: taller fields keep their own size.
	await expect(sheet.getByRole('textbox', { name: 'Details', exact: true })).toHaveCSS(
		'min-height',
		'112px'
	);
	await sheet.getByRole('tab', { name: 'Prompt', exact: true }).click();
	await expect(sheet.getByRole('textbox', { name: 'Exact prompt', exact: true })).toHaveCSS(
		'min-height',
		'302px'
	);
	await sheet.getByRole('tab', { name: 'Appearance', exact: true }).click();
	const clothing = sheet.getByRole('radiogroup', { name: 'Base clothing' });
	const underwear = clothing.getByRole('radio', { name: 'Underwear', exact: true });
	const nothingWorn = clothing.getByRole('radio', { name: 'Nothing worn', exact: true });
	await expect(underwear).toBeChecked();
	await expect(nothingWorn).toBeVisible();
	const kind = sheet.getByRole('combobox', { name: 'Kind', exact: true });
	expect((await clothing.boundingBox())!.height).toBeCloseTo((await kind.boundingBox())!.height, 0);
	for (const radio of [underwear, nothingWorn]) {
		const target = (await radio.boundingBox())!;
		expect(target.width).toBeGreaterThanOrEqual(48);
	}
	await nothingWorn.click();
	await expect(nothingWorn).toBeChecked();
	await expect(underwear).not.toBeChecked();
	await sheet.getByRole('textbox', { name: 'Name', exact: true }).fill('Discard me');
	const details = sheet.getByRole('textbox', { name: 'Details', exact: true });
	await details.fill('Discard these details');
	const enhance = sheet.getByRole('button', { name: 'Enhance', exact: true });
	await expect(enhance).toBeEnabled();
	await page.evaluate(() => {
		const decode = window.createImageBitmap;
		window.createImageBitmap = async (source) => {
			window.createImageBitmap = decode;
			await new Promise<void>((resolve) =>
				document.addEventListener('release-reference-decode', () => resolve(), { once: true })
			);
			return decode(source);
		};
	});
	const sprite = makeImg(320, 48);
	sprite.data[3] = 255;
	await sheet.locator('.reference input[type=file]').setInputFiles({
		name: 'fresh-draft.png',
		mimeType: 'image/png',
		buffer: Buffer.from(await encodePngBytes(sprite))
	});
	await expect(sheet.getByRole('button', { name: 'Opening image', exact: true })).toBeVisible();
	await expect(enhance).toBeDisabled();
	await model.selectOption('pro');
	await page.evaluate(() => document.dispatchEvent(new Event('release-reference-decode')));
	await expect(attachment).toContainText('320 × 48 px');
	await expect(sheet.locator('.reference > small').filter({ hasText: 'Resized from' })).toHaveCount(
		0
	);
	await sheet.getByRole('button', { name: 'Cancel', exact: true }).click();
	await open(page, false);
	await expect(drop).toBeVisible();
	await expect(sheet.getByRole('textbox', { name: 'Name', exact: true })).toHaveValue('');
	await expect(details).toHaveValue('');
	await expect(body).toHaveValue('64');
	await expect(underwear).toBeChecked();
	await expect(nothingWorn).not.toBeChecked();
	await drop.evaluate((element) => {
		const dataTransfer = new DataTransfer();
		const bytes = new Uint8Array(8 * 1024 * 1024 + 1);
		dataTransfer.items.add(new File([bytes], 'too-large.png', { type: 'image/png' }));
		element.dispatchEvent(new DragEvent('drop', { dataTransfer, bubbles: true, cancelable: true }));
	});
	await expect(sheet.getByRole('alert')).toContainText('no larger than 8 MB');
});
