import { test, expect, type Page, type Locator } from '@playwright/test';
import { mkdir, readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { unzip } from '../../src/lib/store/zip.ts';
import { layout } from '../../src/studio/experience/geometry.ts';
import { openInspect } from './immersive-helpers.ts';

const captures = resolve('test-results/experience');
const requests = new WeakMap<Page, string[]>();
const errors = new WeakMap<Page, string[]>();

test.beforeEach(async ({ page, context }) => {
	const calls: string[] = [],
		failures: string[] = [];
	requests.set(page, calls);
	errors.set(page, failures);
	page.on('pageerror', (error) => failures.push(error.message));
	await context.route('https://api.pixellab.ai/**', async (route) => {
		calls.push(`${route.request().method()} ${new URL(route.request().url()).pathname}`);
		await route.abort();
	});
	await context.addInitScript(() => {
		localStorage.setItem('pixeldoll.agentKey', 'off');
		localStorage.removeItem('pixellabApiKey');
		if (!localStorage.getItem('pixeldoll.theme')) localStorage.setItem('pixeldoll.theme', 'dark');
		localStorage.setItem('pixeldoll.welcomed', '1');
	});
});

test.afterEach(async ({ page }) => {
	expect(
		requests.get(page),
		'Offline interactions must not submit even an aborted PixelLab request'
	).toEqual([]);
	expect(errors.get(page), 'No uncaught application errors').toEqual([]);
});

async function landing(page: Page) {
	await page.goto('/');
	await expect(page.getByRole('heading', { name: 'Characters', exact: true })).toBeVisible();
	await expect(page.locator('.character-row')).toHaveCount(1);
	await expect(page.locator('.customize-action')).toBeEnabled();
	await expect
		.poll(() =>
			page
				.locator('.cast-character.chosen canvas')
				.first()
				.evaluate((canvas) => {
					const c = canvas as HTMLCanvasElement;
					return c
						.getContext('2d')!
						.getImageData(0, 0, c.width, c.height)
						.data.some((v, i) => i % 4 === 3 && v > 0);
				})
		)
		.toBe(true);
}

async function customize(page: Page) {
	await landing(page);
	await page.locator('.customize-action').click();
	await expect(page.locator('.world-stage')).toHaveAttribute('data-position', '0.00,0.00');
	await expect(page.getByRole('tablist', { name: 'Customization panels' })).toBeVisible();
}

const modes = (page: Page) => page.getByRole('group', { name: 'Character view' });
const panels = (page: Page) => page.getByRole('tablist', { name: 'Customization panels' });
const world = (page: Page) => page.locator('.world-stage');
const pair = async (node: Locator, attribute = 'data-position') =>
	(await node.getAttribute(attribute))!.split(',').map(Number);
const actorPixels = (page: Page) =>
	page.locator('.world-actors').evaluate((canvas) => (canvas as HTMLCanvasElement).toDataURL());

/** Tap a slot in the Wardrobe rail and wait for its section to finish scrolling to the top. */
async function slot(page: Page, name: RegExp) {
	await page
		.getByRole('navigation', { name: 'Equipment slots', exact: true })
		.getByRole('button', { name })
		.click();
	const list = page.locator('#wardrobe-list');
	let last = -1;
	await expect
		.poll(async () => {
			const top = await list.evaluate((el) => el.scrollTop);
			const settled = top === last;
			last = top;
			return settled;
		})
		.toBe(true);
}
async function pause(page: Page) {
	const pauseButton = page.getByRole('button', { name: 'Pause', exact: true });
	if (await pauseButton.isVisible()) await pauseButton.click();
}

async function screenshot(page: Page, name: string) {
	await mkdir(captures, { recursive: true });
	await page.evaluate(async () => {
		await document.fonts.ready;
		const background = document.querySelector('.scene-backdrop');
		if (!background) return;
		const url = getComputedStyle(background).backgroundImage.match(/url\(["']?(.*?)["']?\)/)?.[1];
		if (url) {
			const image = new Image();
			image.src = url;
			await image.decode().catch(() => {
				throw new Error(`World background failed to decode: ${url}`);
			});
		}
	});
	await page.screenshot({ path: resolve(captures, `${name}.png`), animations: 'disabled' });
}

for (const theme of ['dark', 'light'] as const)
	for (const size of ['desktop', 'phone'] as const) {
		test(`all five real screens: ${theme}, ${size}`, async ({ page }) => {
			await page.setViewportSize(
				size === 'desktop' ? { width: 1440, height: 900 } : { width: 390, height: 844 }
			);
			await landing(page);
			if (size === 'phone') {
				const search = page.getByRole('searchbox', { name: 'Search characters', exact: true });
				await expect(search).toBeVisible();
				await expect(search).toBeEditable();
				await search.fill('Adventurer');
				await expect(search).toBeFocused();
				await expect(page.locator('.character-row')).toHaveCount(1);
				await search.clear();
			}
			if (theme === 'light') {
				await page.getByRole('button', { name: 'More options', exact: true }).click();
				await page.getByRole('button', { name: 'Light mode', exact: true }).click();
			}
			await expect(page.locator('html')).toHaveAttribute('data-theme', theme);
			const caption = (await page.locator('.selected-name-text').boundingBox())!;
			const stage = (await page.locator('.cast').boundingBox())!;
			expect(
				Math.abs(caption.x + caption.width / 2 - stage.x - stage.width / 2),
				'Center the character name itself within the stage column'
			).toBeLessThanOrEqual(1);
			// The world image itself (not just its element) covers the whole screen, uniformly scaled: Characters has no
			// equipment sheet to hide a gap.
			expect(
				await page.locator('.scene-backdrop').evaluate((el) => {
					const style = getComputedStyle(el),
						box = el.getBoundingClientRect(),
						[w, h] = style.backgroundSize.split(' ').map(parseFloat),
						[x, y] = style.backgroundPosition.split(' ').map(parseFloat),
						issues: string[] = [];
					if (box.top > 0 || box.bottom < innerHeight || box.width < innerWidth)
						issues.push('element short of the screen');
					if (x > 0.5 || y > 0.5 || x + w < innerWidth - 0.5 || y + h < box.height - 0.5)
						issues.push('image gap');
					if (Math.abs(w / h - 1672 / 941) > 0.002) issues.push('stretched');
					return issues;
				})
			).toEqual([]);
			await screenshot(page, `${size}-${theme}-characters`);
			await page.getByRole('button', { name: 'New character', exact: true }).first().click();
			await page.getByRole('menuitem', { name: 'Create from scratch…', exact: true }).click();
			const creator = page.getByRole('dialog', { name: 'New character', exact: true });
			await expect(creator.getByLabel('Details', { exact: true })).toBeVisible();
			// Name sits above the form in the heading; fine pointers start there, phones avoid forcing the keyboard
			if (size === 'desktop')
				await expect(creator.getByRole('textbox', { name: 'Name', exact: true })).toBeFocused();
			if (size === 'phone') {
				const appearance = creator.getByRole('tab', { name: 'Appearance', exact: true });
				const prompt = creator.getByRole('tab', { name: 'Prompt', exact: true });
				for (const tab of [appearance, prompt]) {
					const widths = await tab.evaluate((button) => {
						const text = document.createRange();
						text.selectNodeContents(button);
						return {
							control: button.getBoundingClientRect().width,
							text: text.getBoundingClientRect().width
						};
					});
					expect(
						widths.control,
						'Creator mode labels must fit their controls'
					).toBeGreaterThanOrEqual(widths.text - 1);
				}
				const appearanceBox = (await appearance.boundingBox())!,
					promptBox = (await prompt.boundingBox())!;
				expect(appearanceBox.x + appearanceBox.width).toBeLessThanOrEqual(promptBox.x + 1);
				const nameField = (await creator.locator('.character-name-field').boundingBox())!;
				const nameInput = (await creator
					.getByRole('textbox', { name: 'Name', exact: true })
					.boundingBox())!;
				expect(nameInput.width).toBeGreaterThanOrEqual(nameField.width - 2);
			}
			await screenshot(page, `${size}-${theme}-create`);
			await creator.getByRole('button', { name: 'Cancel', exact: true }).click();
			await expect(creator).toHaveCount(0);
			await page.locator('.customize-action').click();
			await expect(world(page)).toHaveAttribute('data-position', '0.00,0.00');
			await pause(page);
			if (size === 'phone') {
				await slot(page, /^Head/);
				const head = page.getByRole('group', { name: 'Head items', exact: true });
				const helmet = (await head
					.getByRole('button', { name: 'Steel helmet', exact: true })
					.boundingBox())!;
				const hat = (await head.getByRole('button', { name: /^Wizard hat(,|$)/ }).boundingBox())!;
				const empty = (await head
					.getByRole('button', { name: 'Empty head', exact: true })
					.boundingBox())!;
				// Empty is always the first tile, then the items in reading order, as equal tiles. The phone sheet fits two
				// columns (approved lab: at least 92 px per tile), so the third tile starts the next row.
				expect(empty.x + empty.width).toBeLessThanOrEqual(helmet.x + 1);
				expect(empty.y).toBeCloseTo(helmet.y, 0);
				expect(hat.y > helmet.y + helmet.height - 1 || hat.x >= helmet.x + helmet.width - 1).toBe(
					true
				);
				expect(hat.width).toBeCloseTo(helmet.width, 0);
				expect(empty.width).toBeCloseTo(helmet.width, 0);
				expect(helmet.width).toBeCloseTo(hat.width, 0);
			}
			if (size === 'desktop') {
				const viewModes = (await modes(page).boundingBox())!;
				const header = (await page.locator('.experience-header').boundingBox())!;
				// Approved top bar: 12 px from the top, a 48 px row, view tabs centered in the window.
				expect(header.y).toBeCloseTo(12, 0);
				expect(header.height).toBeCloseTo(48, 0);
				expect(viewModes.y).toBeCloseTo(12, 0);
				expect(viewModes.x + viewModes.width / 2).toBeCloseTo(1440 / 2, 0);
				const viewSize = await modes(page)
					.getByRole('button', { name: 'Preview', exact: true })
					.evaluate((el) => parseFloat(getComputedStyle(el).fontSize));
				expect(viewSize).toBe(15);
				const nameSize = await page
					.locator('.name-menu .name-text')
					.evaluate((el) => parseFloat(getComputedStyle(el).fontSize));
				expect(nameSize).toBe(20);
			}
			const playback = page.getByRole('toolbar', { name: 'Preview controls' });
			expect(
				await playback
					.getByRole('combobox', { name: 'Move', exact: true })
					.evaluate((el) => getComputedStyle(el).alignItems),
				'Host-sized move picker centers its value'
			).toBe('center');
			expect(
				await playback
					.getByRole('button', { name: 'Face south', exact: true })
					.evaluate((el) => getComputedStyle(el).backgroundColor),
				'Selected facing shows the direction chip'
			).not.toBe('rgba(0, 0, 0, 0)');
			await screenshot(page, `${size}-${theme}-preview`);
			for (const [label, name] of [
				['Top-down', 'topdown'],
				['Side-scroller', 'side']
			] as const) {
				await modes(page).getByRole('button', { name: label, exact: true }).click();
				await expect(modes(page).getByRole('button', { name: label, exact: true })).toHaveAttribute(
					'aria-pressed',
					'true'
				);
				await expect(page.getByRole('toolbar', { name: 'Preview controls' })).toHaveCount(0);
				// Moves keeps its place, disabled with its reason, so the tabs never shift.
				await expect(panels(page).getByRole('tab', { name: 'Moves', exact: true })).toHaveAttribute(
					'aria-disabled',
					'true'
				);
				await expect(
					page.locator('.world-hint'),
					'Live views name their movement controls on entry'
				).toBeVisible();
				if (size === 'phone') {
					// The demo lacks Idle: its persistent explanation must occupy usable world space.
					const coverage = page.locator('.world-coverage');
					await expect(coverage).toBeVisible();
					const note = (await coverage.boundingBox())!;
					const views = (await modes(page).boundingBox())!;
					const equipment = (await page.locator('.equipment-rail').boundingBox())!;
					expect(note.y).toBeGreaterThanOrEqual(views.y + views.height);
					expect(note.y + note.height).toBeLessThanOrEqual(equipment.y);
				}
				await screenshot(page, `${size}-${theme}-${name}`);
			}
		});
	}

test('real wardrobe, None, Undo, exact colors, outfits and item details remain connected', async ({
	page
}) => {
	await customize(page);
	await pause(page);
	await slot(page, /^Head/);
	await expect(page.getByRole('button', { name: 'New head item', exact: true })).toHaveCount(1);
	const head = page.getByRole('group', { name: 'Head items', exact: true });
	const none = head.getByRole('button', { name: 'Empty head', exact: true });
	await expect(none).toBeVisible();
	const noneBox = (await none.boundingBox())!;
	const helmetBox = (await head
		.getByRole('button', { name: 'Steel helmet', exact: true })
		.boundingBox())!;
	// Empty is the first tile, the same size as the items beside it.
	expect(noneBox.x + noneBox.width).toBeLessThanOrEqual(helmetBox.x + 1);
	expect(noneBox.y).toBeCloseTo(helmetBox.y, 0);
	expect(noneBox.height).toBeCloseTo(helmetBox.height, 0);
	const helmet = page.getByRole('button', { name: 'Steel helmet', exact: true });
	const hat = page.getByRole('button', { name: /^Wizard hat(,|$)/ });
	await expect(helmet).toHaveAttribute('aria-pressed', 'true');
	const initial = await actorPixels(page);
	await hat.click();
	await expect(hat).toHaveAttribute('aria-pressed', 'true');
	await expect(helmet).toHaveAttribute('aria-pressed', 'false');
	await expect.poll(() => actorPixels(page)).not.toBe(initial);
	await hat.click();
	await expect(hat).toHaveAttribute('aria-pressed', 'false');
	await hat.click();
	await expect(hat).toHaveAttribute('aria-pressed', 'true');
	await none.click();
	await expect(hat).toHaveAttribute('aria-pressed', 'false');
	await page.getByRole('button', { name: /^Undo/ }).click();
	await expect(hat).toHaveAttribute('aria-pressed', 'true');
	const hatOptions = page.getByRole('button', { name: 'More options for Wizard hat', exact: true });
	await hatOptions.click();
	await page.getByRole('menuitem', { name: 'Details…', exact: true }).click();
	const details = page.getByRole('dialog', { name: 'Item', exact: true });
	await expect(details).toContainText('Wizard hat');
	await expect(details.getByRole('button', { name: 'Take off', exact: true })).toBeVisible();
	await details.getByRole('button', { name: 'Done', exact: true }).click();
	await expect(hatOptions).toBeFocused();
	await panels(page).getByRole('tab', { name: 'Colors', exact: true }).click();
	const beforeColors = await actorPixels(page);
	await page.getByRole('radio', { name: 'azure', exact: true }).first().click();
	await expect(page.getByRole('radio', { name: 'azure', exact: true }).first()).toHaveAttribute(
		'aria-checked',
		'true'
	);
	await expect.poll(() => actorPixels(page)).not.toBe(beforeColors);
	await panels(page).getByRole('tab', { name: 'Outfits', exact: true }).click();
	await page.getByRole('button', { name: 'Save current look', exact: true }).click();
	await page.getByRole('textbox', { name: 'Outfit name', exact: true }).fill('Offline bronze look');
	await page.getByRole('button', { name: 'Save', exact: true }).click();
	const outfit = page.getByRole('button', { name: 'Offline bronze look Current', exact: true });
	await expect(outfit).toBeVisible();
	// Persistence is debounced; observe the saved result rather than reloading during its edit window.
	await expect
		.poll(() =>
			page.evaluate(async () => {
				const db = await new Promise<IDBDatabase>((resolve, reject) => {
					const request = indexedDB.open('pixeldoll');
					request.onsuccess = () => resolve(request.result);
					request.onerror = () => reject(request.error);
				});
				try {
					return await new Promise<boolean>((resolve, reject) => {
						const request = db
							.transaction('projects', 'readonly')
							.objectStore('projects')
							.get('dress-fixture:s2');
						request.onsuccess = () =>
							resolve(
								request.result?.presets?.some(
									(p: { name: string }) => p.name === 'Offline bronze look'
								) === true
							);
						request.onerror = () => reject(request.error);
					});
				} finally {
					db.close();
				}
			})
		)
		.toBe(true);
	await page.reload();
	await expect(page.locator('.customize-action')).toBeEnabled();
	await page.locator('.customize-action').click();
	await panels(page).getByRole('tab', { name: 'Outfits', exact: true }).click();
	await expect(outfit).toBeVisible();
	await page
		.getByRole('button', { name: 'More actions for Offline bronze look', exact: true })
		.click();
	await page.getByRole('menuitem', { name: 'Delete outfit', exact: true }).click();
	await expect(outfit).toHaveCount(0);
});

test('all production extra categories, native menu focus, mode controls and Tab survive', async ({
	page
}) => {
	await customize(page);
	// Every production category is in the one Wardrobe list and its slot rail; none hides behind More.
	const rail = page.getByRole('navigation', { name: 'Equipment slots', exact: true });
	for (const label of [
		'Head',
		'Hair',
		'Face',
		'Chest',
		'Legs',
		'Feet',
		'Back',
		'Main hand',
		'Off hand'
	])
		await expect(rail.getByRole('button', { name: new RegExp(`^${label}\\b`) })).toBeAttached();
	const mainHand = rail.getByRole('button', { name: /^Main hand\b/ });
	await mainHand.click();
	await expect(mainHand).toHaveAttribute('aria-current', 'true');
	await expect(page.getByRole('group', { name: 'Main hand items', exact: true })).toBeInViewport();
	// The rail is navigation over the list's sections: arrows move to and show the next slot.
	await mainHand.focus();
	await page.keyboard.press('ArrowDown');
	const offHand = rail.getByRole('button', { name: /^Off hand\b/ });
	await expect(offHand).toBeFocused();
	await expect(offHand).toHaveAttribute('aria-current', 'true');
	await world(page).focus();
	await page.keyboard.press('Tab');
	await expect(world(page)).not.toBeFocused();
	await expect(modes(page).getByRole('button', { name: 'Preview', exact: true })).toHaveAttribute(
		'aria-pressed',
		'true'
	);
	await page.locator('.name-menu').click();
	const projects = page.getByRole('menu', { name: 'Characters', exact: true });
	await expect(
		projects.getByRole('menuitemradio', { name: 'Adventurer (demo)', exact: true })
	).toBeFocused();
	await page.keyboard.press('Escape');
	await expect(projects).not.toBeVisible();
	await expect(page.locator('.name-menu')).toBeFocused();
	const options = page.getByRole('button', { name: 'More options', exact: true });
	await options.click();
	const optionMenu = page.locator('#experience-options');
	await expect
		.poll(() => optionMenu.evaluate((node) => node.contains(document.activeElement)))
		.toBe(true);
	// Built CSS must keep the standard blur (a minifier once kept only the -webkit- alias, letting panels show through).
	expect(
		await optionMenu.locator('.menu-surface').evaluate((el) => getComputedStyle(el).backdropFilter)
	).toContain('blur');
	await expect(
		optionMenu.getByRole('button', { name: 'Inspect all API calls', exact: true })
	).toHaveText('API calls');
	await page.keyboard.press('Escape');
	await expect(optionMenu).not.toBeVisible();
	await expect(options).toBeFocused();
});

test('creator validation stays real; Cancel and Escape restore the native opener', async ({
	page
}) => {
	await landing(page);
	const opener = page.getByRole('button', { name: 'New character', exact: true }).first();
	await opener.focus();
	await page.keyboard.press('Enter');
	await page.getByRole('menuitem', { name: 'Create from scratch…', exact: true }).click();
	const creator = page.getByRole('dialog', { name: 'New character', exact: true });
	const create = creator.getByRole('button', { name: 'Create character', exact: true });
	await creator.getByRole('tab', { name: 'Prompt', exact: true }).click();
	await creator.getByRole('textbox', { name: 'Exact prompt', exact: true }).fill('');
	await expect(create).toBeDisabled();
	await creator
		.getByRole('textbox', { name: 'Exact prompt', exact: true })
		.fill('A calm freckled elf in plain clothes');
	await creator.getByLabel('Body size', { exact: true }).fill('31');
	await expect(create).toBeDisabled();
	await creator.getByLabel('Body size', { exact: true }).fill('64');
	await expect(create).toBeEnabled();
	await creator.getByRole('button', { name: 'Cancel', exact: true }).click();
	await expect(opener).toBeFocused();
	await page.keyboard.press('Enter');
	await expect(creator).toBeVisible();
	await page.keyboard.press('Escape');
	await expect(creator).toHaveCount(0);
	await expect(opener).toBeFocused();
});

test('320px inspection keeps both native selects and All directions within its transport', async ({
	page
}) => {
	await page.setViewportSize({ width: 320, height: 568 });
	await customize(page);
	await pause(page);
	const sheet = page.getByRole('dialog', { name: 'Inspect character', exact: true });
	await page.keyboard.press('Control+Alt+i');
	await expect(sheet).toBeVisible();
	await page.keyboard.press('Control+Alt+i');
	await expect(sheet).toHaveCount(0);
	await openInspect(page);
	const bar = sheet.getByRole('toolbar', { name: 'Preview controls', exact: true });
	const move = bar.getByRole('combobox', { name: 'Move', exact: true });
	const direction = bar.getByRole('combobox', { name: 'Direction', exact: true });
	const all = bar.getByRole('button', { name: 'All directions', exact: true });
	await expect(move).toBeVisible();
	await expect(direction).toBeVisible();
	await expect(all).toBeVisible();
	const controls = [
		await move.boundingBox(),
		await direction.boundingBox(),
		await all.boundingBox()
	];
	const transport = (await bar.boundingBox())!;
	for (const control of controls) {
		expect(control).not.toBeNull();
		expect(control!.x).toBeGreaterThanOrEqual(0);
		expect(control!.x + control!.width).toBeLessThanOrEqual(320);
		expect(control!.y).toBeGreaterThanOrEqual(transport.y);
		expect(control!.y + control!.height).toBeLessThanOrEqual(transport.y + transport.height + 1);
	}
	for (let i = 0; i < controls.length; i++)
		for (let j = i + 1; j < controls.length; j++) {
			const a = controls[i]!,
				b = controls[j]!;
			const intersects =
				Math.min(a.x + a.width, b.x + b.width) - Math.max(a.x, b.x) > 1 &&
				Math.min(a.y + a.height, b.y + b.height) - Math.max(a.y, b.y) > 1;
			expect(intersects, 'Native inspection controls must not overlap').toBe(false);
		}
	await move.selectOption('walk');
	await direction.selectOption('east');
	await expect(direction).toHaveValue('east');
	await all.click();
	await expect(all).toHaveAttribute('aria-pressed', 'true');
	await expect(sheet.locator('.all-dirs canvas')).toHaveCount(4);
	for (const canvas of await sheet.locator('.all-dirs canvas').all()) {
		const box = (await canvas.boundingBox())!;
		expect(box.y + box.height).toBeLessThanOrEqual((await bar.boundingBox())!.y + 1);
	}
	await screenshot(page, 'phone-320-inspection-controls');
});

test('shallow landscape slot rail reaches every equipment category', async ({ page }) => {
	await page.setViewportSize({ width: 844, height: 390 });
	await customize(page);
	const rail = page.getByRole('navigation', { name: 'Equipment slots', exact: true });
	for (const label of ['Face', 'Legs', 'Feet', 'Back', 'Main hand', 'Off hand']) {
		const tab = rail.getByRole('button', { name: new RegExp(`^${label}\\b`) });
		await tab.scrollIntoViewIfNeeded();
		await expect(tab).toBeInViewport();
		await expect
			.poll(() =>
				tab.evaluate((button) => {
					const rect = button.getBoundingClientRect();
					return button.contains(
						document.elementFromPoint(rect.x + rect.width / 2, rect.y + rect.height / 2)
					);
				})
			)
			.toBe(true);
		await tab.click();
		await expect(tab).toHaveAttribute('aria-current', 'true');
		await expect(page.getByRole('group', { name: `${label} items`, exact: true })).toBeInViewport();
		if (label === 'Off hand') await screenshot(page, 'landscape-slot-rail');
	}
});

test.describe('touch world ownership', () => {
	test.use({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
	test('blank world outside the actor host starts movement while control gestures never start the joystick', async ({
		page,
		context
	}) => {
		await customize(page);
		await modes(page).getByRole('button', { name: 'Top-down', exact: true }).click();
		await expect(world(page)).toBeFocused();
		// On a phone the actor host spans the stage's width; the band beside the floating view tabs, above the host,
		// is still open world.
		const host = (await world(page).boundingBox())!;
		const start = { x: 12, y: Math.round(host.y - 16) };
		expect(start.y).toBeLessThan(host.y);
		expect(
			await page.evaluate(({ x, y }) => {
				const element = document.elementFromPoint(x, y);
				return (
					!!element &&
					!element.closest(
						'button,input,select,textarea,a,nav,.equipment-rail,header,[popover],dialog'
					)
				);
			}, start)
		).toBe(true);
		const cdp = await context.newCDPSession(page);
		let activeTouch = false;
		const touch = async (
			type: 'touchStart' | 'touchMove' | 'touchEnd' | 'touchCancel',
			x = start.x,
			y = start.y
		) => {
			await cdp.send('Input.dispatchTouchEvent', {
				type,
				touchPoints: type === 'touchEnd' || type === 'touchCancel' ? [] : [{ x, y, id: 1 }]
			});
			activeTouch = type !== 'touchEnd' && type !== 'touchCancel';
		};
		try {
			await touch('touchStart');
			await expect(page.locator('.world-stick')).toBeVisible();
			await touch('touchMove', start.x + 42, start.y);
			await expect.poll(async () => (await pair(world(page)))[0]).toBeGreaterThan(5);
			await touch('touchCancel');
			await expect(page.locator('.world-stick')).toHaveCount(0);
			const stopped = await pair(world(page));
			await page.waitForTimeout(120);
			expect(await pair(world(page))).toEqual(stopped);
			const control = (await panels(page)
				.getByRole('tab', { name: 'Colors', exact: true })
				.boundingBox())!;
			await touch('touchStart', control.x + control.width / 2, control.y + control.height / 2);
			await expect(page.locator('.world-stick')).toHaveCount(0);
			await touch('touchMove', start.x + 42, start.y);
			await page.waitForTimeout(120);
			await expect(page.locator('.world-stick')).toHaveCount(0);
			expect(await pair(world(page))).toEqual(stopped);
			await touch('touchEnd');
		} finally {
			if (activeTouch) await touch('touchCancel');
			await cdp.detach();
		}
	});
});

test('Preview keyboard uses declared facing; live movement continues, stops, and stays scoped to the world', async ({
	page
}) => {
	await customize(page);
	await pause(page);
	const clip = page.getByRole('combobox', { name: 'Move', exact: true });
	const originalClip = await clip.inputValue();
	await world(page).focus();
	await page.keyboard.press('ArrowLeft');
	await expect(page.getByRole('button', { name: 'Face west', exact: true })).toHaveAttribute(
		'aria-pressed',
		'true'
	);
	await expect(clip).toHaveValue(originalClip);
	await expect(world(page)).toHaveAttribute('data-position', '0.00,0.00');
	// Cross punch is genuinely south-only in the bundled project. Preview must retain north intent.
	await clip.selectOption('cross-punch');
	const north = page.getByRole('button', { name: 'Face north', exact: true });
	await expect(north).toBeEnabled();
	await north.click();
	await expect(north).toHaveAttribute('aria-pressed', 'true');
	await expect(clip).toHaveValue('cross-punch');
	await expect(
		page.getByRole('toolbar', { name: 'Preview controls' }).getByText('Still', { exact: true })
	).toBeVisible();
	await expect(world(page)).toHaveAttribute('data-position', '0.00,0.00');
	await clip.selectOption(originalClip);
	await world(page).focus();
	await page.keyboard.press('2');
	await expect(modes(page).getByRole('button', { name: 'Top-down', exact: true })).toHaveAttribute(
		'aria-pressed',
		'true'
	);
	await world(page).focus();
	await page.keyboard.down('d');
	await expect.poll(async () => (await pair(world(page)))[0]).toBeGreaterThan(25);
	const { x, cx } = await world(page).evaluate((node) => ({
		x: Number(node.dataset.position!.split(',')[0]),
		cx: Number(node.dataset.camera!.split(',')[0])
	}));
	expect(cx).toBeGreaterThan(0);
	expect(cx).toBeLessThan(x);
	await page.keyboard.up('d');
	const stopped = await pair(world(page));
	await page.waitForTimeout(180);
	expect(await pair(world(page))).toEqual(stopped);
	await world(page).focus();
	await page.keyboard.down('w');
	await expect.poll(async () => (await pair(world(page)))[1]).toBeGreaterThan(10);
	await page.getByRole('button', { name: 'More options', exact: true }).focus();
	const unfocused = await pair(world(page));
	await page.keyboard.up('w');
	await page.keyboard.press('d');
	await page.waitForTimeout(160);
	expect(await pair(world(page))).toEqual(unfocused);
	await world(page).focus();
	await page.keyboard.down('d');
	await expect.poll(async () => (await pair(world(page)))[0]).toBeGreaterThan(unfocused[0]! + 5);
	await page.evaluate(() => window.dispatchEvent(new Event('blur')));
	const blurred = await pair(world(page));
	await page.keyboard.up('d');
	await page.waitForTimeout(160);
	expect(await pair(world(page))).toEqual(blurred);
	await world(page).focus();
	await page.keyboard.press('3');
	await expect(
		modes(page).getByRole('button', { name: 'Side-scroller', exact: true })
	).toHaveAttribute('aria-pressed', 'true');
	await expect(world(page)).toHaveAttribute('data-position', '0.00,0.00');
	await page.keyboard.down('w');
	await page.waitForTimeout(120);
	await page.keyboard.up('w');
	expect(await pair(world(page))).toEqual([0, 0]);
});

test('offline export and device import remain accessible production actions', async ({ page }) => {
	await customize(page);
	const exportButton = page.getByRole('button', { name: 'Export', exact: true });
	await exportButton.click();
	const sheet = page.getByRole('dialog', { name: 'Export', exact: true });
	await sheet.getByRole('radio', { name: /PNG \+ JSON/ }).click();
	const download = sheet.getByRole('button', { name: /^Download ZIP/ });
	await expect(download).toBeEnabled();
	const event = page.waitForEvent('download');
	await download.click();
	const path = await (await event).path();
	expect(path).not.toBeNull();
	const bytes = await readFile(path!);
	const entries = await unzip(new Uint8Array(bytes));
	expect(entries.has('manifest.json')).toBe(true);
	await expect(sheet).toHaveCount(0);
	await expect(exportButton).toBeFocused();
	await page.getByRole('button', { name: 'Characters', exact: true }).click();
	const importer = page.getByRole('button', { name: 'New character', exact: true }).first();
	await importer.click();
	await page.getByRole('menuitem', { name: 'Import from device…', exact: true }).click();
	const importSheet = page.getByRole('dialog', { name: 'Import from device', exact: true });
	await importSheet
		.getByLabel('Character ZIP', { exact: true })
		.setInputFiles({ name: 'offline-character.zip', mimeType: 'application/zip', buffer: bytes });
	await expect(
		importSheet.getByRole('img', { name: 'Character import preview', exact: true })
	).toBeVisible();
	await importSheet
		.getByLabel('Character name', { exact: true })
		.fill('Offline imported character');
	await importSheet
		.getByRole('checkbox', { name: 'Set up the pose rig next (recommended)', exact: true })
		.uncheck();
	await importSheet.getByRole('button', { name: 'Import character', exact: true }).click();
	await expect(page.locator('.project-btn')).toContainText('Offline imported character');
	await expect(world(page)).toBeVisible();
	// Cancel must preserve Characters even when the selected project is a saved import.
	await page.getByRole('button', { name: 'Characters', exact: true }).click();
	await importer.click();
	await expect(importSheet).toBeVisible();
	await importSheet.getByRole('button', { name: 'Cancel', exact: true }).click();
	await expect(importSheet).toHaveCount(0);
	await expect(page.getByRole('heading', { name: 'Characters', exact: true })).toBeVisible();
	await expect(world(page)).toHaveCount(0);
	await expect(page.locator('.customize-action')).toContainText('Offline imported character');
});

for (const viewport of [
	{ width: 390, height: 844 },
	{ width: 320, height: 568 }
])
	test(`phone ${viewport.width}×${viewport.height} equipment sheet reserves painted actor space`, async ({
		page
	}) => {
		await page.setViewportSize(viewport);
		await customize(page);
		await pause(page);
		await expect(page.getByRole('button', { name: 'More options', exact: true })).toBeVisible();
		// The sheet has one height, clamp(45% of the window, 240 px, window - 250 px).
		{
			// Wait for the animation-frame renderer to consume the new measured stage.
			await page.evaluate(
				() =>
					new Promise<void>((resolve) =>
						requestAnimationFrame(() => requestAnimationFrame(() => resolve()))
					)
			);
			const bounds = await page.locator('.world-actors').evaluate((canvas) => {
				const c = canvas as HTMLCanvasElement,
					data = c.getContext('2d')!.getImageData(0, 0, c.width, c.height).data;
				let left = c.width,
					right = -1,
					top = c.height,
					bottom = -1;
				for (let y = 0; y < c.height; y++)
					for (let x = 0; x < c.width; x++) {
						// Reflection opacity is .12; identify actual actor pixels rather than its decorative copy.
						if (data[(y * c.width + x) * 4 + 3]! < 200) continue;
						left = Math.min(left, x);
						right = Math.max(right, x);
						top = Math.min(top, y);
						bottom = Math.max(bottom, y);
					}
				const dpr = devicePixelRatio || 1;
				return { left: left / dpr, right: right / dpr, top: top / dpr, bottom: bottom / dpr };
			});
			expect(bounds.right).toBeGreaterThan(bounds.left);
			const rail = (await page.locator('.equipment-rail').boundingBox())!;
			const playback = (await page
				.getByRole('toolbar', { name: 'Preview controls' })
				.boundingBox())!;
			const views = (await modes(page).boundingBox())!;
			expect(bounds.top).toBeGreaterThanOrEqual(views.y + views.height);
			expect(bounds.bottom).toBeLessThanOrEqual(playback.y);
			expect(playback.y + playback.height).toBeLessThanOrEqual(rail.y);
			// The sheet height comes from the one geometry source (compact heights keep room for a 2x hero).
			expect(rail.height).toBeCloseTo(
				layout(viewport.width, viewport.height, 'studio').sheetHeight,
				0
			);
			await screenshot(page, `phone-${viewport.width}-dark-equipment`);
		}
	});
