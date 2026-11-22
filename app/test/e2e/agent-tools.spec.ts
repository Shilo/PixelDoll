import { expect, test, type BrowserContext, type Page } from '@playwright/test';
import { offlineLaunch } from '../no-live-api.ts';
import { CharacterApi } from '../fixtures/character-api.ts';
import { openStudio } from './immersive-helpers.ts';

// Chromium's own WebMCP implementation (not a polyfill): the tools an agent discovers on the deployed page.
test.use({ launchOptions: { args: [...offlineLaunch.args, '--enable-features=WebMCP'] } });

test.beforeEach(async ({ context }) => {
	await context.addInitScript(() => {
		localStorage.setItem('pixeldoll.agentKey', 'off');
		localStorage.setItem('pixeldoll.welcomed', '1');
	});
	await context.route('https://*.pixellab.ai/**', (route) => route.abort());
});

type Result = {
	ok: boolean;
	isError?: boolean;
	data: unknown;
	images: { label: string; data?: string }[];
	seeImages?: string;
};
declare global {
	interface Window {
		pixeldoll: {
			call(name: string, args?: unknown): Promise<Result>;
			hide(): void;
			status(): unknown;
		};
	}
}
const bridge = (page: Page, name: string, args?: unknown) =>
	page.evaluate(([n, a]) => window.pixeldoll.call(n, a), [name, args] as const);
const webmcp = async (page: Page, name: string, args: object) =>
	(await page.webmcp.callTool(name, args)) as unknown as Result;

async function mockPixelLab(
	context: BrowserContext,
	beforeRequest?: (path: string) => Promise<void> | void
) {
	const api = new CharacterApi();
	await context.route('https://*.pixellab.ai/**', async (route) => {
		const request = route.request();
		await beforeRequest?.(new URL(request.url()).pathname);
		const response = await api.handle(request.method(), request.url(), request.postDataJSON());
		await route.fulfill({
			status: response.status,
			headers: Object.fromEntries(response.headers),
			body: Buffer.from(await response.arrayBuffer())
		});
	});
	await context.addInitScript(() =>
		localStorage.setItem('pixellabApiKey', 'fake-agent-test-key-no-network')
	);
	return api;
}

test('agent tools: WebMCP lists the tools and returns plain results with sheets shown in the page', async ({
	page
}) => {
	await openStudio(page, '/');
	await expect
		.poll(() => page.evaluate(() => window.pixeldoll.status()))
		.toMatchObject({
			tools: 25,
			webmcp: { registered: 25, failed: [], state: 'done' }
		});
	const tools = await page.webmcp.tools();
	expect(tools).toHaveLength(25);
	expect(tools.map((t) => t.name)).toContain('inspect_item');

	const overview = await webmcp(page, 'pixeldoll_overview', {});
	expect(overview).toMatchObject({ ok: true, data: { app: 'PixelDoll' } });

	// Sheets are shown in the page, one at a time, for a screenshot; WebMCP never carries base64 and has no imageData.
	expect(
		await webmcp(page, 'inspect_item', { itemId: 'sword_steel', imageData: true })
	).toMatchObject({ ok: false, data: { code: 'invalid' } });
	const shown = await webmcp(page, 'inspect_item', { itemId: 'sword_steel', move: 'walk' });
	expect(shown.seeImages).toContain('screenshot');
	expect(shown.images).toHaveLength(2);
	expect(shown.images[0].data).toBeUndefined();
	await expect(page.locator('[data-agent-evidence] canvas')).toHaveCount(1);
	const sheetPage = page.locator('[data-agent-evidence-page]');
	await expect(sheetPage).toHaveText('Sheet 1 of 2');
	await page.getByRole('button', { name: 'Next sheet' }).click();
	await expect(sheetPage).toHaveText('Sheet 2 of 2');

	// Errors come back as data the agent can act on, and the sheets stay for the screenshot.
	const refused = await webmcp(page, 'inspect_item', { itemId: 'nope' });
	expect(refused).toMatchObject({ ok: false, isError: true, data: { code: 'not_found' } });
	await bridge(page, 'get_activity');
	await expect(sheetPage).toHaveText('Sheet 2 of 2');

	// The panel is a modal dialog over the Studio: a screenshot leaves it open, and Escape closes it alone, not the sheet
	// under it.
	await page.evaluate(() => window.pixeldoll.hide());
	await page.getByRole('button', { name: 'Export', exact: true }).click();
	const studioSheet = page.getByRole('dialog');
	await expect(studioSheet).toHaveCount(1);
	await webmcp(page, 'render_frames', { move: 'walk', directions: ['south'] });
	const evidence = page.getByRole('dialog', { name: 'Agent view: Render frames' });
	await expect(evidence).toBeVisible();
	await page.screenshot();
	await expect(evidence).toBeVisible();
	await page.keyboard.press('Escape');
	await expect(evidence).toHaveCount(0);
	await expect(studioSheet).toHaveCount(1);
});

test('agent tools: the page bridge edits a free copy atomically and reads without navigating', async ({
	page
}) => {
	await openStudio(page, '/');
	await expect.poll(() => page.evaluate(() => typeof window.pixeldoll)).toBe('object');

	const copy = await bridge(page, 'copy_demo_character');
	const id = (copy.data as { characterId: string }).characterId;
	expect(copy).toMatchObject({
		ok: true,
		data: { open: false }
	});
	expect(await bridge(page, 'pixeldoll_overview')).toMatchObject({
		ok: true,
		data: { openCharacter: { id: 'fixture:s2' } }
	});
	expect(await bridge(page, 'open_character', { characterId: id })).toMatchObject({ ok: true });

	const off = await bridge(page, 'set_outfit', { characterId: id, takeOff: ['head'] });
	expect(off).toMatchObject({
		ok: true,
		data: {
			changed: true,
			changes: [{ slot: 'head', from: 'helmet_steel', to: null }],
			worn: { head: null },
			saved: true
		}
	});
	const noOp = await bridge(page, 'set_outfit', { characterId: id, takeOff: ['head'] });
	expect(noOp).toMatchObject({
		ok: true,
		data: { changed: false, changes: [], unchanged: ['head'], worn: { head: null } }
	});
	expect(noOp.data).not.toHaveProperty('saved');
	// One unknown id refuses the whole change: the sword stays on.
	const worn = (off.data as { worn: Record<string, string | null> }).worn;
	expect(
		await bridge(page, 'set_outfit', { wear: ['nope'], takeOff: ['main_hand'] })
	).toMatchObject({ ok: false, data: { code: 'not_found' } });
	expect(
		await bridge(page, 'render_frames', { move: 'walk', directions: ['south'] })
	).toMatchObject({ ok: true, data: { characterId: id, outfit: { main_hand: worn.main_hand } } });

	// Reading another character leaves the open one open; edits refuse to land on a character the user is not looking at.
	const demo = await bridge(page, 'inspect_character', {
		characterId: 'fixture:s2'
	});
	expect(demo).toMatchObject({ ok: true, data: { id: 'fixture:s2', open: false } });
	expect(demo.images).toHaveLength(0);
	expect(
		await bridge(page, 'set_color', { characterId: 'fixture:s2', material: 'x' })
	).toMatchObject({ ok: false, data: { code: 'invalid' } });
	const sheet = await bridge(page, 'render_frames', {
		characterId: 'fixture:s2',
		move: 'walk',
		directions: ['south'],
		imageData: true
	});
	expect(sheet.images[0].data).toMatch(/^iVBOR/);
	const removeSword = await bridge(page, 'set_outfit', { takeOff: ['main_hand'] });
	expect(removeSword).toMatchObject({
		ok: true,
		data: {
			changed: true,
			changes: [{ slot: 'main_hand', from: worn.main_hand, to: null }],
			alsoTookOff: [],
			saved: true
		}
	});
	expect(await page.evaluate(() => window.pixeldoll.call('list_characters'))).toMatchObject({
		data: { open: id }
	});

	const price = await bridge(page, 'create_item', {
		slot: 'head',
		prompt: 'red hat',
		dryRun: true
	});
	expect(price.ok).toBe(true);
	expect((price.data as { generations: number }).generations).toBeGreaterThan(0);
	// Without a connected account nothing paid starts or is asked for; the agent asks the user (never for the token).
	for (const [name, args] of [
		['create_item', { slot: 'head', prompt: 'red hat' }],
		['request_budget', { generations: 12, purpose: 'Finish the knight' }]
	] as const)
		expect(await bridge(page, name, args)).toMatchObject({
			ok: false,
			data: { code: 'needs_user' }
		});
});

test('agent tools: the person approves a budget in USD, sees what is left and can end it', async ({
	page,
	context
}) => {
	test.setTimeout(150_000);
	let release!: () => void;
	const blocked = new Promise<void>((resolve) => {
		release = resolve;
	});
	const api = await mockPixelLab(context, (path) =>
		path === '/v2/create-character-v3' ? blocked : undefined
	);
	await openStudio(page, '/');
	await expect.poll(() => page.evaluate(() => typeof window.pixeldoll)).toBe('object');
	// A paid start without a budget is refused before anything is sent.
	const creation = {
		details: 'a knight',
		directions: 'four',
		acceptWarnings: true,
		requestId: 'knight-test'
	};
	expect(await bridge(page, 'create_character', creation)).toMatchObject({
		ok: false,
		data: { code: 'budget' }
	});
	expect(api.calls.filter(({ method }) => method === 'POST')).toHaveLength(0);

	const asked = await bridge(page, 'request_budget', {
		generations: 12,
		purpose: 'Finish the knight'
	});
	expect(asked).toMatchObject({ ok: true, data: { answer: 'pending' } });
	const approvalId = (asked.data as { activityId: string }).activityId;
	const dialog = page.getByRole('alertdialog', { name: 'Let the agent spend generations?' });
	await expect(dialog).toContainText('up to about $0.060');
	await expect(dialog).toContainText('12 PixelLab generations');
	await expect(dialog).toContainText('Finish the knight');
	await dialog.getByRole('button', { name: 'Allow', exact: true }).click();
	expect(await bridge(page, 'get_activity', { ids: [approvalId] })).toMatchObject({
		ok: true,
		data: {
			matched: [{ activityId: approvalId, answer: 'allowed' }],
			budget: { approved: 12, remaining: 12 }
		}
	});

	const left = page.getByRole('status').filter({ hasText: 'Agent budget' });
	await expect(left).toContainText('12 generations');
	const follower = await context.newPage();
	let started: { activityId: string; characterId: string; maxGenerations: number };
	try {
		await openStudio(follower, '/');
		await expect
			.poll(async () => (await bridge(follower, 'get_activity')).data)
			.toMatchObject({ tabRole: 'follower' });
		const start = await bridge(page, 'create_character', creation);
		expect(start).toMatchObject({ ok: true, data: { started: true, status: 'running' } });
		started = start.data as typeof started;
		expect(await bridge(follower, 'get_activity', { ids: [started.activityId] })).toMatchObject({
			ok: true,
			data: { matched: [{ activityId: started.activityId, outcome: 'running' }] }
		});
	} finally {
		release();
		await follower.close();
	}
	await expect
		.poll(
			async () =>
				(
					await bridge(page, 'get_activity', {
						ids: [started.activityId]
					})
				).data,
			{ timeout: 120_000 }
		)
		.toMatchObject({
			matched: [
				{ activityId: started.activityId, characterId: started.characterId, outcome: 'created' }
			]
		});
	const posts = api.calls.filter(({ method }) => method === 'POST');
	expect(posts.filter(({ path }) => path === '/v2/create-character-v3')).toHaveLength(2);
	expect(await bridge(page, 'create_character', creation)).toMatchObject({
		ok: true,
		data: { ...started, repeated: true, status: 'created' }
	});
	expect(api.calls.filter(({ method }) => method === 'POST')).toEqual(posts);
	// Modal dialogs make the rest of the page inert, so the budget line moves into whichever one is on top: the agent's
	// sheets, then an ordinary Studio sheet, where End stops the agent's unsent work.
	await bridge(page, 'render_frames', {
		characterId: 'fixture:s2',
		move: 'walk',
		directions: ['south']
	});
	const evidence = page.getByRole('dialog', { name: 'Agent view: Render frames' });
	await expect(evidence.getByRole('button', { name: 'End' })).toBeVisible();
	await page.keyboard.press('Escape');
	await expect(evidence).toHaveCount(0);
	await page.getByRole('button', { name: 'Export', exact: true }).click();
	const studioSheet = page.getByRole('dialog');
	await expect(studioSheet).toHaveCount(1);
	await studioSheet.getByRole('button', { name: 'End' }).click();
	await expect(left).toHaveCount(0);
	expect(await bridge(page, 'get_activity')).toMatchObject({
		data: { budget: { remaining: 0 } }
	});
	expect(
		await bridge(page, 'create_character', { ...creation, requestId: 'after-end' })
	).toMatchObject({
		ok: false,
		data: { code: 'budget' }
	});
	expect(api.calls.filter(({ method }) => method === 'POST')).toEqual(posts);
	await page.reload();
	await expect.poll(() => page.evaluate(() => typeof window.pixeldoll)).toBe('object');
	expect(await bridge(page, 'create_character', creation)).toMatchObject({
		ok: true,
		data: { ...started, repeated: true, status: 'created' }
	});
	expect(api.calls.filter(({ method }) => method === 'POST')).toEqual(posts);
});

test('agent tools: a mocked move survives reload and requires the rendered candidate to save', async ({
	page,
	context
}) => {
	test.setTimeout(270_000);
	const api = await mockPixelLab(context);
	await openStudio(page, '/');
	expect(
		await bridge(page, 'request_budget', { generations: 60, purpose: 'Draw a knight and a slash' })
	).toMatchObject({ ok: true });
	await page.getByRole('button', { name: 'Allow', exact: true }).click();
	const creation = await bridge(page, 'create_character', {
		details: 'a knight',
		directions: 'four',
		acceptWarnings: true
	});
	expect(creation).toMatchObject({ ok: true, data: { started: true } });
	const { activityId: creationId, characterId } = creation.data as {
		activityId: string;
		characterId: string;
	};
	const activity = (id: string) => bridge(page, 'get_activity', { ids: [id] });
	const waitForOutcome = (id: string, outcome: string) =>
		expect
			.poll(async () => (await activity(id)).data, { timeout: 120_000 })
			.toMatchObject({ matched: [{ activityId: id, outcome }] });
	await waitForOutcome(creationId, 'created');
	expect(await bridge(page, 'open_character', { characterId })).toMatchObject({ ok: true });
	const move = {
		action: 'slash',
		model: 'skeleton-v3',
		acceptWarnings: true,
		requestId: 'slash-on-knight'
	};
	const start = await bridge(page, 'add_move', move);
	expect(start).toMatchObject({
		ok: true,
		data: { characterId, moveId: 'slash', status: 'queued' }
	});
	const { activityId } = start.data as { activityId: string };
	await waitForOutcome(activityId, 'review');
	expect((await activity(activityId)).data).toMatchObject({
		matched: [{ charges: { knownGenerations: expect.any(Number), unresolvedCalls: 0 } }]
	});
	const posts = api.calls.filter(({ method }) => method === 'POST');
	expect(posts.some(({ path }) => path === '/v2/animate-with-skeleton-v3')).toBe(true);
	await page.reload();
	await expect.poll(() => page.evaluate(() => typeof window.pixeldoll)).toBe('object');
	await waitForOutcome(activityId, 'review');
	expect(await bridge(page, 'add_move', move)).toMatchObject({
		ok: true,
		data: { repeated: true, activityId, characterId, status: 'review' }
	});
	const inspection = await bridge(page, 'inspect_character', { characterId });
	const reviews = (inspection.data as { moveReviews: { moveId: string }[] }).moveReviews;
	expect(reviews).toMatchObject([{ moveId: 'slash' }]);
	expect(reviews[0]).not.toHaveProperty('candidateId');
	expect(
		await bridge(page, 'add_move', { ...move, characterId, requestId: 'another-slash' })
	).toMatchObject({
		ok: false,
		data: { code: 'invalid', error: expect.stringContaining('accept_move or discard_move') }
	});
	const render = await bridge(page, 'render_frames', {
		characterId,
		move: 'slash',
		review: true,
		directions: ['south']
	});
	expect(render).toMatchObject({
		ok: true,
		data: {
			review: {
				canAccept: true,
				playback: expect.arrayContaining([
					expect.objectContaining({ cell: 0, ms: expect.any(Number) })
				])
			}
		}
	});
	expect(render.images.length).toBeGreaterThan(0);
	const {
		review: { candidateId }
	} = render.data as { review: { candidateId: string } };
	const decision = { characterId, moveId: 'slash' };
	expect(
		await bridge(page, 'accept_move', { ...decision, candidateId: `stale-${candidateId}` })
	).toMatchObject({ ok: false, data: { code: 'busy' } });
	expect(await bridge(page, 'accept_move', { ...decision, candidateId })).toMatchObject({
		ok: true,
		data: { outcome: 'saved', equipmentToPose: [] }
	});
	await page.reload();
	await expect.poll(() => page.evaluate(() => typeof window.pixeldoll)).toBe('object');
	await waitForOutcome(activityId, 'saved');
	expect((await bridge(page, 'inspect_character', { characterId })).data).toMatchObject({
		moves: expect.arrayContaining([expect.objectContaining({ id: 'slash' })]),
		moveReviews: []
	});
	expect(api.calls.filter(({ method }) => method === 'POST')).toEqual(posts);
});
