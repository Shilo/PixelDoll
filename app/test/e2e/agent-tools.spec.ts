import { expect, test, type Page } from '@playwright/test';
import { offlineLaunch } from '../no-live-api.ts';
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

type Content = { type: string; text?: string; data?: string; mimeType?: string };
const contentOf = (result: unknown) => result as { content: Content[]; isError?: boolean };
declare global {
	interface Window {
		pixeldoll: {
			call(
				name: string,
				args?: unknown
			): Promise<{ ok: boolean; data: unknown; images: { label: string }[] }>;
		};
	}
}
const bridge = (page: Page, name: string, args?: unknown) =>
	page.evaluate(([n, a]) => window.pixeldoll.call(n, a), [name, args] as const);

test('agent tools: WebMCP lists the tools and returns JSON and real frame images', async ({
	page
}) => {
	await openStudio(page, '/');
	await expect.poll(async () => (await page.webmcp.tools()).length).toBeGreaterThan(15);
	const tools = await page.webmcp.tools();
	expect(tools.map((t) => t.name)).toContain('inspect_item');

	const overview = contentOf(await page.webmcp.callTool('pixeldoll_overview', {}));
	expect(JSON.parse(overview.content[0].text!).data.app).toBe('PixelDoll');

	// By default the sheets are shown in the page for a screenshot and the result stays small.
	const shown = contentOf(
		await page.webmcp.callTool('inspect_item', { itemId: 'sword_steel', move: 'walk' })
	);
	expect(shown.content).toHaveLength(1);
	expect(JSON.parse(shown.content[0].text!).seeImages).toContain('screenshot');
	await expect(page.locator('[data-agent-evidence] img')).toHaveCount(2);

	const inspected = contentOf(
		await page.webmcp.callTool('inspect_item', {
			itemId: 'sword_steel',
			move: 'walk',
			imageData: true
		})
	);
	expect(inspected.isError).toBeFalsy();
	const images = inspected.content.filter((c) => c.type === 'image');
	expect(images).toHaveLength(2);
	expect(images[0].mimeType).toBe('image/png');
	// A PNG of 4 directions x 8 frames, enlarged by whole pixels.
	const png = Buffer.from(images[0].data!, 'base64');
	expect(png.subarray(1, 4).toString()).toBe('PNG');
	expect(png.readUInt32BE(16)).toBeGreaterThan(500);

	// Agent errors come back as data the agent can act on, not as a bare OperationError.
	const refused = contentOf(await page.webmcp.callTool('inspect_item', { itemId: 'nope' }));
	expect(refused.isError).toBe(true);
	expect(JSON.parse(refused.content[0].text!)).toMatchObject({ code: 'not_found' });
	await expect(page.locator('[data-agent-evidence]')).toHaveCount(0);
});

test('agent tools: the page bridge edits a free copy and spends only an approved budget', async ({
	page
}) => {
	await openStudio(page, '/');
	await expect.poll(() => page.evaluate(() => typeof window.pixeldoll)).toBe('object');

	const copy = await bridge(page, 'copy_demo_character');
	expect(copy.ok).toBe(true);
	const id = (copy.data as { characterId: string }).characterId;

	const off = await bridge(page, 'set_outfit', { characterId: id, takeOff: ['head'] });
	expect(off).toMatchObject({ ok: true, data: { worn: { head: null } } });

	const price = await bridge(page, 'create_item', {
		slot: 'head',
		prompt: 'red wizard hat',
		dryRun: true
	});
	expect(price.ok).toBe(true);
	expect((price.data as { generations: number }).generations).toBeGreaterThan(0);
	// Without a connected account nothing paid starts, and the agent is told to ask the user (never for the token).
	expect(
		await bridge(page, 'create_item', { slot: 'head', prompt: 'red wizard hat' })
	).toMatchObject({ ok: false, data: { code: 'needs_user' } });

	const asked = page.evaluate(() =>
		window.pixeldoll.call('request_budget', { generations: 12, purpose: 'Finish the knight' })
	);
	const dialog = page.getByRole('alertdialog', { name: 'Let the agent spend generations?' });
	await expect(dialog).toContainText('up to 12 PixelLab generations');
	await expect(dialog).toContainText('Finish the knight');
	await dialog.getByRole('button', { name: 'Allow', exact: true }).click();
	expect(await asked).toMatchObject({
		ok: true,
		data: { allowed: true, budget: { approved: 12, remaining: 12 } }
	});

	const sheet = await bridge(page, 'render_frames', { move: 'walk', directions: ['south'] });
	expect(sheet.images[0]).toMatchObject({ label: expect.stringContaining('walk') });
	await expect(page.locator('[data-agent-evidence] img')).toHaveCount(1);
});
