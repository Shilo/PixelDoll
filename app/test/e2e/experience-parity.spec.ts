import { expect, test, type Page } from '@playwright/test';
import { readFile } from 'node:fs/promises';
import { equipmentGroup, equipmentMode } from './immersive-helpers.ts';
import { layout } from '../../src/studio/experience/geometry.ts';
import { focalSlot, pickFacings } from '../../src/studio/experience/lineup.ts';
import { DIRECTIONS, type DirectionName } from '../../src/lib/rig/rig.ts';
import { zip } from '../../src/lib/store/zip.ts';
import { makeImg } from '../../src/lib/image/png.ts';
import { encodePngBytes } from '../../src/lib/image/pngraw.ts';

test.beforeEach(async ({ context }) => {
	await context.addInitScript(() => {
		try {
			localStorage.setItem('pixeldoll.agentKey', 'off');
		} catch {
			/* Opaque initial pages have no storage. */
		}
	});
	await context.route('https://*.pixellab.ai/**', async (route) => {
		await route.abort();
		expect(route.request().method(), 'Parity checks must never submit a paid request').toBe('GET');
	});
});

test('anchored popovers point at their triggers on all four sides', async ({ page }) => {
	await landing(page);
	const initialViewport = page.viewportSize()!;
	const options = page.getByRole('button', { name: 'More options', exact: true });
	const optionMenu = page.locator('#experience-options');
	const check = async (id: string, triggerSelector: string, side: string) => {
		const menu = page.locator(`#${id}`);
		await expect(menu).toHaveAttribute('data-side', side);
		await expect(menu).toHaveAttribute('data-positioned', '');
		await expect
			.poll(() => menu.evaluate((node) => node.contains(document.activeElement)))
			.toBe(true);
		const geometry = await menu.evaluate((node, selector) => {
			const panel = node.querySelector('.bu-popover-surface')!.getBoundingClientRect();
			const pointer = node.querySelector('.bu-popover-arrow')!.getBoundingClientRect();
			const trigger = document.querySelector(selector)!.getBoundingClientRect();
			const axis =
				node.getAttribute('data-side') === 'top' || node.getAttribute('data-side') === 'bottom'
					? 'x'
					: 'y';
			const pointerCenter =
				axis === 'x' ? pointer.x + pointer.width / 2 : pointer.y + pointer.height / 2;
			const triggerCenter =
				axis === 'x' ? trigger.x + trigger.width / 2 : trigger.y + trigger.height / 2;
			const path = node.querySelector<SVGPathElement>('.bu-popover-arrow path:last-child')!;
			const transform = path.getScreenCTM()!;
			const ends = [new DOMPoint(0, 8), new DOMPoint(12, 8)].map((point) =>
				point.matrixTransform(transform)
			);
			const side = node.getAttribute('data-side');
			const border =
				side === 'bottom'
					? panel.top + 0.5
					: side === 'top'
						? panel.bottom - 0.5
						: side === 'right'
							? panel.left + 0.5
							: panel.right - 0.5;
			const seam = Math.max(
				...ends.map((point) => Math.abs((axis === 'x' ? point.y : point.x) - border))
			);
			return {
				panel: panel.toJSON(),
				pointer: pointer.toJSON(),
				delta: Math.abs(pointerCenter - triggerCenter),
				seam,
				hidden: node.hasAttribute('data-arrow-hidden')
			};
		}, triggerSelector);
		expect(geometry.hidden).toBe(false);
		expect(geometry.delta).toBeLessThanOrEqual(12);
		expect(geometry.seam).toBeLessThanOrEqual(1);
		if (side === 'bottom')
			expect(geometry.pointer.bottom).toBeLessThanOrEqual(geometry.panel.top + 4);
		if (side === 'top')
			expect(geometry.pointer.top).toBeGreaterThanOrEqual(geometry.panel.bottom - 4);
		if (side === 'left')
			expect(geometry.pointer.left).toBeGreaterThanOrEqual(geometry.panel.right - 4);
		if (side === 'right')
			expect(geometry.pointer.right).toBeLessThanOrEqual(geometry.panel.left + 4);
		if (side === 'left') {
			await page.setViewportSize({ width: 900, height: initialViewport.height });
			await expect(menu).toHaveAttribute('data-side', 'left');
			await expect
				.poll(() =>
					menu.evaluate((node, selector) => {
						const pointer = node.querySelector('.bu-popover-arrow')!.getBoundingClientRect();
						const trigger = document.querySelector(selector)!.getBoundingClientRect();
						return Math.abs(pointer.y + pointer.height / 2 - trigger.y - trigger.height / 2);
					}, triggerSelector)
				)
				.toBeLessThanOrEqual(12);
		}
		await page.keyboard.press('Escape');
		await expect(menu).not.toBeVisible();
	};

	await options.click();
	await check('experience-options', '[popovertarget="experience-options"]', 'bottom');
	// A preferred placement above the header has no room; collision handling flips it below.
	await optionMenu.evaluate((node) => node.setAttribute('data-placement', 'top-end'));
	await options.click();
	await check('experience-options', '[popovertarget="experience-options"]', 'bottom');
	await optionMenu.evaluate((node) => node.setAttribute('data-placement', 'left-start'));
	await options.click();
	await check('experience-options', '[popovertarget="experience-options"]', 'left');
	await page.setViewportSize(initialViewport);

	const project = page.locator('.selected-name');
	await page
		.locator('#project-menu')
		.evaluate((node) => node.setAttribute('data-placement', 'right-start'));
	await project.click();
	await check('project-menu', '.selected-name', 'right');

	await page.setViewportSize({ width: 390, height: 844 });
	await page.locator('.customize-action').click();
	// On a phone the character menu opens from the name in the top bar, below it.
	await page
		.locator('#project-menu')
		.evaluate((node) => node.setAttribute('data-placement', 'bottom-start'));
	await page.locator('.name-menu').click();
	await check('project-menu', '.name-menu', 'bottom');
});

test('closing a popover with a clipped trigger restores focus to a visible control', async ({
	page
}) => {
	await landing(page);
	const opener = page.locator('.selected-name');
	const menu = page.locator('#project-menu');
	await opener.click();
	await expect(menu).toBeVisible();
	await opener.evaluate((element) => {
		const parent = element.parentElement!;
		parent.style.maxHeight = '0px';
		parent.style.overflow = 'hidden';
		window.dispatchEvent(new Event('scroll'));
	});
	await expect(menu).not.toBeVisible();
	await expect(opener).not.toBeFocused();
	await expect(page.locator('.experience-header button').first()).toBeFocused();
});

const world = (page: Page) => page.locator('.world-stage');
const selection = (page: Page) => page.getByRole('application', { name: /^Character selection\./ });
const modes = (page: Page) => page.getByRole('group', { name: 'Character view', exact: true });

async function landing(page: Page) {
	await page.goto('/');
	await expect(page.locator('.customize-action')).toBeEnabled();
}

test('the Characters panel keeps its Customize button on the edge margin', async ({ page }) => {
	for (const [width, height] of [
		[1440, 900],
		[1920, 1080]
	]) {
		await page.setViewportSize({ width, height });
		await landing(page);
		const g = layout(width, height, 'characters');
		const action = (await page.locator('.customize-action').boundingBox())!;
		expect(action.y + action.height).toBeCloseTo(height - g.edge, 0);
	}
});

test('view tabs keep equal widths and never move when switching views', async ({ page }) => {
	for (const [width, height] of [
		[1440, 900],
		[960, 800],
		[390, 844]
	]) {
		await page.setViewportSize({ width, height });
		await landing(page);
		await page.locator('.customize-action').click();
		const tabs = modes(page).getByRole('button');
		const boxes = () =>
			tabs.evaluateAll((all) =>
				all.map((tab) => {
					const r = tab.getBoundingClientRect(),
						label = tab.querySelector('.bu-tab-label')!.getBoundingClientRect();
					return [r.x, r.width, label.x, label.width].map((n) => Math.round(n * 10) / 10);
				})
			);
		const first = await boxes();
		const widths = first.map((b) => b[1]);
		expect(Math.max(...widths) - Math.min(...widths), `equal view tabs at ${width}px`).toBeLessThan(
			1
		);
		for (const name of ['Top-down', 'Side-scroller', 'Preview']) {
			await modes(page).getByRole('button', { name, exact: true }).click();
			await expect(modes(page).getByRole('button', { name, exact: true })).toHaveAttribute(
				'aria-pressed',
				'true'
			);
			expect(await boxes(), `${name} keeps every tab in place at ${width}px`).toEqual(first);
		}
	}
});

test('full screen includes the whole app and survives screen changes, dialogs and external exit', async ({
	page
}) => {
	await landing(page);
	const enter = page.getByRole('button', { name: 'Enter full screen', exact: true });
	const exit = page.getByRole('button', { name: 'Exit full screen', exact: true });
	const rootIsFullscreen = () =>
		page.evaluate(() => document.fullscreenElement === document.documentElement);
	await expect(enter).toBeVisible();
	expect(await rootIsFullscreen()).toBe(false);
	expect(await enter.evaluate((node) => node.nextElementSibling?.getAttribute('aria-label'))).toBe(
		'More options'
	);
	await enter.focus();
	await page.keyboard.press('Enter');
	await expect.poll(rootIsFullscreen).toBe(true);
	await expect(exit).toBeEnabled();
	await page.locator('.customize-action').click();
	for (const mode of ['Preview', 'Top-down', 'Side-scroller']) {
		await modes(page).getByRole('button', { name: mode, exact: true }).click();
		await expect(exit).toBeVisible();
		expect(await rootIsFullscreen()).toBe(true);
	}
	// Some browsers consume Escape before dispatching keydown; if delivered, it must not navigate.
	await world(page).dispatchEvent('keydown', { key: 'Escape', bubbles: true });
	await expect(modes(page)).toBeVisible();
	await page.getByRole('button', { name: 'More options', exact: true }).click();
	await expect(page.locator('#experience-options')).toBeVisible();
	await page.getByRole('button', { name: 'Activity', exact: true }).click();
	await expect(page.getByRole('dialog')).toBeVisible();
	expect(await rootIsFullscreen()).toBe(true);
	await page.getByRole('dialog').getByRole('button', { name: 'Done', exact: true }).click();
	// Browser-owned exits (Escape, tab switching) update state without a click on our control.
	await page.evaluate(() => document.exitFullscreen());
	await expect(enter).toBeVisible();
	await enter.click();
	await expect(exit).toBeEnabled();
	await exit.click();
	await expect.poll(rootIsFullscreen).toBe(false);
	await expect(enter).toBeEnabled();
});

test('full screen stays reachable beside More on narrow and landscape screens', async ({
	page
}) => {
	await landing(page);
	await page.getByRole('button', { name: 'Dismiss notification', exact: true }).click();
	for (const viewport of [
		{ width: 320, height: 568 },
		{ width: 360, height: 800 },
		{ width: 390, height: 844 },
		{ width: 568, height: 320 },
		{ width: 667, height: 375 },
		{ width: 844, height: 390 },
		{ width: 768, height: 1024 },
		{ width: 1024, height: 768 },
		{ width: 920, height: 600 },
		{ width: 1101, height: 600 },
		{ width: 1280, height: 720 },
		{ width: 1920, height: 1080 },
		{ width: 2560, height: 1080 }
	]) {
		await page.setViewportSize(viewport);
		for (const studio of [false, true]) {
			if (studio) await page.locator('.customize-action').click();
			const toggle = page.getByRole('button', { name: 'Enter full screen', exact: true });
			await expect(toggle).toBeInViewport();
			const box = (await toggle.boundingBox())!;
			expect(box.width).toBeGreaterThanOrEqual(44);
			expect(box.x).toBeGreaterThanOrEqual(0);
			expect(box.x + box.width).toBeLessThanOrEqual(viewport.width);
			// A real pointer activation also detects overlapping header controls or navigation tabs.
			await toggle.click();
			await page.getByRole('button', { name: 'Exit full screen', exact: true }).click();
			if (studio) await page.locator('.header-back').click();
		}
	}
});

test('full screen failures surface without changing the action and allow retry', async ({
	page
}) => {
	await landing(page);
	const enter = page.getByRole('button', { name: 'Enter full screen', exact: true });
	await page.evaluate(() => {
		document.documentElement.requestFullscreen = () => Promise.reject(new TypeError('Denied'));
	});
	await enter.click();
	await expect(page.getByRole('alert')).toContainText('Could not enter full screen.');
	await expect(enter).toBeEnabled();
	await page.evaluate(() => {
		delete (document.documentElement as Partial<HTMLElement>).requestFullscreen;
	});
	await enter.click();
	const exit = page.getByRole('button', { name: 'Exit full screen', exact: true });
	await expect(exit).toBeEnabled();
	await page.evaluate(() => {
		document.exitFullscreen = () => Promise.reject(new TypeError('Denied'));
	});
	await exit.click();
	await expect(page.getByRole('alert')).toContainText('Could not exit full screen.');
	await expect(exit).toBeEnabled();
	await page.evaluate(() => {
		delete (document as Partial<Document>).exitFullscreen;
	});
	await exit.click();
	await expect(enter).toBeEnabled();
});

test('full screen and view navigation stay separate while Activity is in the header', async ({
	page
}, info) => {
	const dev = info.config.projects.find((p) => p.name === 'browser-selftests')!.use.baseURL!;
	await page.goto(dev);
	await expect(page.locator('.customize-action')).toBeEnabled();
	await page.locator('.customize-action').click();
	// A presentation-only running draft on another rig shows Activity without scheduling any work.
	await page.evaluate(async () => {
		const path = '/src/studio/state.svelte.ts',
			s = await import(path);
		s.gens.push({
			phase: 'running',
			draft: { rigId: 'fullscreen-layout', spec: { id: 'fullscreen-layout' } },
			input: { slot: 'head' }
		});
	});
	await expect(
		page.locator('.header-actions').getByRole('button', { name: 'Activity', exact: true })
	).toBeVisible();
	for (const width of [320, 360, 390, 760, 920, 1024, 1101, 1279, 1280, 1440]) {
		await page.setViewportSize({ width, height: 900 });
		// The switch re-centers on the character one frame after a resize (ResizeObserver), so let it settle.
		const overlap = () =>
			modes(page).evaluate((nav) => {
				const bounds = nav.getBoundingClientRect();
				// The view tabs now live in the header; only the other header controls must stay clear of them.
				return [...document.querySelectorAll('.experience-header button')].some((button) => {
					if (nav.contains(button)) return false;
					const rect = button.getBoundingClientRect();
					return (
						rect.width > 0 &&
						rect.height > 0 &&
						rect.left < bounds.right &&
						rect.right > bounds.left &&
						rect.top < bounds.bottom &&
						rect.bottom > bounds.top
					);
				});
			});
		await expect
			.poll(overlap, { message: `View navigation overlaps header at ${width}px` })
			.toBe(false);
		await page.getByRole('button', { name: 'Enter full screen', exact: true }).click();
		await page.getByRole('button', { name: 'Exit full screen', exact: true }).click();
	}
});

test('full screen hides when unsupported or prohibited', async ({ page }) => {
	await page.addInitScript(() => {
		Object.defineProperty(document, 'fullscreenEnabled', { value: false });
	});
	await landing(page);
	await expect(page.locator('.header-fullscreen')).toHaveCount(0);
	await expect(page.getByRole('button', { name: 'More options', exact: true })).toBeVisible();
});

test('PWA fullscreen launch hides an unusable toggle while standalone permits it', async ({
	page
}) => {
	await page.addInitScript(() => {
		const match = window.matchMedia.bind(window);
		const display = match('(display-mode: fullscreen)');
		Object.defineProperty(display, 'matches', { value: true, configurable: true });
		const standalone = match('(display-mode: standalone)');
		Object.defineProperty(standalone, 'matches', { get: () => !display.matches });
		window.matchMedia = (query) =>
			query === '(display-mode: fullscreen)'
				? display
				: query === '(display-mode: standalone)'
					? standalone
					: match(query);
	});
	await landing(page);
	await expect(page.locator('.header-fullscreen')).toHaveCount(0);
	await page.evaluate(() => {
		const display = matchMedia('(display-mode: fullscreen)');
		Object.defineProperty(display, 'matches', { value: false });
		display.dispatchEvent(new Event('change'));
	});
	await page.getByRole('button', { name: 'Enter full screen', exact: true }).click();
	await page.getByRole('button', { name: 'Exit full screen', exact: true }).click();
	await expect(page.getByRole('button', { name: 'Enter full screen', exact: true })).toBeEnabled();
});

test('movement warnings are combined and remain eligible while an error takes priority', async ({
	page
}, info) => {
	const dev = info.config.projects.find((p) => p.name === 'browser-selftests')!.use.baseURL!;
	await page.goto(dev);
	await expect(page.locator('.customize-action')).toBeEnabled();
	await page.locator('.customize-action').click();
	await modes(page).getByRole('button', { name: 'Top-down', exact: true }).click();
	await page.evaluate(async () => {
		const path = '/src/studio/state.svelte.ts',
			s = await import(path);
		const manifest = s.store.project.manifest;
		manifest.rig.directions.push({ id: 'notification-fixture' });
		const head = manifest.items.find((item: { slot: string }) => item.slot === 'head');
		head.coverage = [];
		s.doc.items[head.slot] = head.id;
		s.doc.rev++;
		s.toast('Could not save your work.', { tone: 'danger' });
	});
	const notice = page.locator('.toast');
	await world(page).focus();
	await page.keyboard.down('ArrowRight');
	try {
		await expect
			.poll(() => world(page).evaluate((el) => Number(el.dataset.position!.split(',')[0])))
			.toBeGreaterThan(0);
		await expect(notice.getByRole('alert')).toContainText('Could not save your work.');
	} finally {
		await page.keyboard.up('ArrowRight');
	}
	// The demo has no Idle or stored rest image, so stopping uses a still pose.
	await expect(world(page)).toHaveAttribute('data-presentation', 'still');
	await notice.getByRole('button', { name: 'Dismiss notification' }).click();
	await expect(notice.locator('[data-tone]')).toHaveAttribute('data-tone', 'warning');
	await expect(notice).toContainText('Unknown direction: notification-fixture');
	await expect(notice).toContainText('1 item hidden');
	await notice.getByRole('button', { name: 'Dismiss notification' }).click();
	await page.evaluate(
		() =>
			new Promise<void>((resolve) =>
				requestAnimationFrame(() => requestAnimationFrame(() => resolve()))
			)
	);
	await expect(notice).toHaveCount(0);
});

test('screen transitions preserve world keyboard focus while creator fields remain native', async ({
	page
}) => {
	await landing(page);
	await expect(selection(page)).toBeFocused();
	expect(await selection(page).evaluate((el) => getComputedStyle(el, '::after').content)).toBe(
		'none'
	);
	await page.keyboard.press('Enter');
	await expect(world(page)).toBeFocused();
	expect(await world(page).evaluate((el) => getComputedStyle(el, '::after').content)).toBe('none');
	await page.keyboard.press('ArrowLeft');
	await expect(world(page)).toHaveAttribute('data-facing', 'west');
	// The prompt moved into the name menu, which Escape closes before the world leaves for Characters.
	await page.locator('.name-menu').click();
	const menu = page.locator('#project-menu');
	await expect(menu.locator('.menu-prompt-text')).toBeVisible();
	await expect(menu.getByRole('menuitem', { name: 'Copy prompt', exact: true })).toBeVisible();
	await page.keyboard.press('Escape');
	await expect(menu).not.toBeVisible();
	await world(page).focus();
	await expect(world(page)).toBeFocused();
	await page.keyboard.press('Escape');
	await expect(selection(page)).toBeFocused();
	const create = page.getByRole('button', { name: 'New character', exact: true }).first();
	await create.focus();
	await page.keyboard.press('Enter');
	await page.getByRole('menuitem', { name: 'Create from scratch…', exact: true }).click();
	const dialog = page.getByRole('dialog', { name: 'New character', exact: true });
	const name = dialog.getByRole('textbox', { name: 'Name', exact: true });
	await name.fill('Keyboard draft');
	await page.keyboard.press('ArrowLeft');
	await expect(name).toBeFocused();
	await dialog.getByRole('button', { name: 'Cancel', exact: true }).click();
	await expect(create).toBeFocused();
	await expect(selection(page)).toBeVisible();
	await page.locator('.customize-action').click();
	await expect(world(page)).toBeFocused();
});

test('Preview resolves partial chord releases, preserves pause and clip selection, and rejects stale repeats', async ({
	page
}) => {
	await landing(page);
	await page.keyboard.press('Enter');
	const clip = page.getByRole('combobox', { name: 'Move', exact: true });
	const original = await clip.inputValue();
	const pause = page.getByRole('button', { name: 'Pause', exact: true });
	if (await pause.isVisible()) await pause.click();
	await world(page).focus();
	await page.keyboard.down('w');
	await page.keyboard.down('d');
	await expect(world(page)).toHaveAttribute('data-facing', 'north');
	await page.keyboard.up('w');
	await expect(world(page)).toHaveAttribute('data-facing', 'east');
	await page.keyboard.up('d');
	await expect(world(page)).toHaveAttribute('data-facing', 'east');
	await page.keyboard.down('d');
	await page.keyboard.down('a');
	await expect(world(page)).toHaveAttribute('data-facing', 'east');
	await page.keyboard.up('d');
	await expect(world(page)).toHaveAttribute('data-facing', 'west');
	await page.keyboard.up('a');
	await expect(clip).toHaveValue(original);
	await expect(page.getByRole('button', { name: 'Play', exact: true })).toBeVisible();
	await expect(world(page)).toHaveAttribute('data-position', '0.00,0.00');
	await page.getByRole('button', { name: 'More options', exact: true }).focus();
	await world(page).focus();
	await world(page).dispatchEvent('keydown', { key: 'd', repeat: true });
	await expect(world(page)).toHaveAttribute('data-facing', 'west');
	await page.keyboard.up('d');
});

test('Moves preserves paused Preview and Side-scroller enters using an authored horizontal facing', async ({
	page
}) => {
	await landing(page);
	await page.keyboard.press('Enter');
	const pause = page.getByRole('button', { name: 'Pause', exact: true });
	if (await pause.isVisible()) await pause.click();
	await page
		.getByRole('tablist', { name: 'Customization panels' })
		.getByRole('tab', { name: 'Moves', exact: true })
		.click();
	await page.locator('.move-row').filter({ hasText: 'Cross punch' }).click();
	await expect(page.getByRole('button', { name: 'Play', exact: true })).toBeVisible();
	await page.getByRole('button', { name: 'Face north', exact: true }).click();
	await expect(world(page)).toHaveAttribute('data-presentation', 'still');
	await expect(page.getByRole('button', { name: /^(Play|Pause)$/ })).toHaveCount(0);
	await expect(page.getByRole('combobox', { name: 'Move', exact: true })).toHaveValue(
		'cross-punch'
	);
	await modes(page).getByRole('button', { name: 'Side-scroller', exact: true }).click();
	await expect(world(page)).toHaveAttribute('data-facing', 'east');
	await expect(world(page)).toHaveAttribute('data-position', '0.00,0.00');
	await modes(page).getByRole('button', { name: 'Preview', exact: true }).click();
	await expect(page.getByRole('button', { name: 'Face north', exact: true })).toHaveAttribute(
		'aria-pressed',
		'true'
	);
	await expect(page.getByRole('button', { name: /^(Play|Pause)$/ })).toHaveCount(0);
	await page.getByRole('button', { name: 'Face south', exact: true }).click();
	await expect(page.getByRole('button', { name: 'Play', exact: true })).toBeVisible();
});

test('imported move names remain readable, distinct and contained in Preview and Inspect at every screen size', async ({
	page
}) => {
	const directions = [
		'south',
		'south-east',
		'east',
		'north-east',
		'north',
		'north-west',
		'west',
		'south-west'
	];
	const longId =
		'the_character_reacts_to_sudden_impact_by_bracing_their_entire_body_against_an_incoming_heavy_attack';
	const longLabel =
		'The character reacts to sudden impact by bracing their entire body against an incoming heavy attack';
	const image = makeImg(64, 64);
	image.data.set([180, 100, 60, 255], (48 * 64 + 32) * 4);
	const png = await encodePngBytes(image);
	const bytes = await zip([
		{
			name: 'metadata.json',
			data: new TextEncoder().encode(JSON.stringify({ name: 'Imported move labels' }))
		},
		...directions.map((dir) => ({ name: `rotations/${dir}.png`, data: png })),
		...['right_punch', 'right-punch', longId].flatMap((id) =>
			directions.map((dir) => ({ name: `animations/${id}/${dir}/frame_0.png`, data: png }))
		)
	]);
	await landing(page);
	await page.keyboard.press('Enter');
	await page.locator('.project-btn').click();
	await page
		.locator('#project-menu')
		.getByRole('button', { name: 'New character', exact: true })
		.first()
		.click();
	await page.getByRole('menuitem', { name: 'Import from device…', exact: true }).click();
	const importing = page.getByRole('dialog', { name: 'Import from device', exact: true });
	await importing.getByLabel('Character ZIP', { exact: true }).setInputFiles({
		name: 'move-labels.zip',
		mimeType: 'application/zip',
		buffer: Buffer.from(bytes)
	});
	await expect(
		importing.getByRole('img', { name: 'Character import preview', exact: true })
	).toBeVisible();
	await importing
		.getByRole('checkbox', { name: 'Set up the pose rig next (recommended)', exact: true })
		.uncheck();
	await importing.getByRole('button', { name: 'Import character', exact: true }).click();
	const move = page.getByRole('combobox', { name: 'Move', exact: true });
	await expect(move.locator('option')).toHaveText([
		'Default',
		'Right punch (right_punch)',
		'Right punch (right-punch)',
		longLabel
	]);
	await expect(move).toHaveValue('default');
	await expect(page.getByRole('button', { name: /^(Play|Pause)$/ })).toHaveCount(0);
	const inspectAction = page
		.getByRole('toolbar', { name: 'Preview controls', exact: true })
		.getByRole('button', { name: 'Inspect', exact: true });
	await expect(inspectAction).toHaveText('');
	await expect(inspectAction).toHaveAttribute('title', 'Inspect');
	await move.selectOption('right_punch');
	await expect(move).toHaveValue('right_punch');
	await move.selectOption('right-punch');
	await expect(move).toHaveValue('right-punch');
	await move.selectOption(longId);
	await expect(move).toHaveAttribute('title', longLabel);
	await expect(page.getByRole('button', { name: /^(Play|Pause)$/ })).toHaveCount(0);
	const sizes = [
		{ width: 1440, height: 900 },
		{ width: 900, height: 820 },
		{ width: 390, height: 844 },
		{ width: 360, height: 640 },
		{ width: 844, height: 390 }
	];
	for (const size of sizes) {
		await page.setViewportSize(size);
		const bar = page.getByRole('toolbar', { name: 'Preview controls', exact: true });
		await expect(move).toBeInViewport();
		// Narrow phones move Inspect into More rather than shrinking the bar's targets below 44 px.
		if (size.width <= 430) {
			await expect(bar.getByRole('button', { name: 'Inspect', exact: true })).toBeHidden();
			await page.getByRole('button', { name: 'More options', exact: true }).click();
			await expect(
				page.locator('#experience-options').getByRole('button', { name: 'Inspect', exact: true })
			).toBeVisible();
			await page.keyboard.press('Escape');
		} else await expect(bar.getByRole('button', { name: 'Inspect', exact: true })).toBeInViewport();
		const targets = await bar.evaluate((node) =>
			[...node.querySelectorAll('button, select')]
				.map((element) => element.getBoundingClientRect())
				.filter((r) => r.width > 0)
				.map((r) => Math.min(r.width, r.height))
		);
		expect(Math.min(...targets), `${size.width}×${size.height} targets`).toBeGreaterThanOrEqual(44);
		const geometry = await bar.evaluate((node) => {
			const children = [...node.children].filter(
				(element) => element.getBoundingClientRect().width > 0
			);
			const rects = children.map((element) => element.getBoundingClientRect());
			const overlaps = rects.some((a, i) =>
				rects
					.slice(i + 1)
					.some(
						(b) =>
							Math.min(a.right, b.right) - Math.max(a.left, b.left) > 1 &&
							Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top) > 1
					)
			);
			const select = node.querySelector('select')!,
				style = getComputedStyle(select),
				bounds = node.getBoundingClientRect();
			return {
				overlaps,
				clipped: style.overflowX === 'hidden',
				left: bounds.left,
				right: bounds.right
			};
		});
		expect(geometry.overlaps, `${size.width}×${size.height}`).toBe(false);
		expect(geometry.clipped).toBe(true);
		expect(geometry.left).toBeGreaterThanOrEqual(0);
		expect(geometry.right).toBeLessThanOrEqual(size.width);
		if (size.width === 390) {
			await move.click();
			const option = move.locator('option').last();
			await expect(option).toBeVisible();
			const bounds = await option.boundingBox();
			expect(bounds!.x).toBeGreaterThanOrEqual(0);
			expect(bounds!.x + bounds!.width).toBeLessThanOrEqual(size.width);
			await page.keyboard.press('Escape');
		}
		await bar.getByRole('button', { name: 'Face north', exact: true }).click();
		await expect(world(page)).toHaveAttribute('data-facing', 'north');
	}
	await page.getByRole('button', { name: 'Inspect', exact: true }).click();
	const inspect = page.getByRole('dialog', { name: 'Inspect character', exact: true });
	const inspectMove = inspect.getByRole('combobox', { name: 'Move', exact: true });
	await expect(inspectMove).toHaveValue(longId);
	await expect(inspectMove.locator('option')).toHaveText([
		'Default',
		'Right punch (right_punch)',
		'Right punch (right-punch)',
		longLabel
	]);
	await expect(inspectMove).toHaveAttribute('title', longLabel);
	for (const size of sizes) {
		await page.setViewportSize(size);
		await expect(inspectMove).toBeInViewport();
		await expect(inspect.getByRole('button', { name: 'Next frame', exact: true })).toBeInViewport();
		expect(await inspectMove.evaluate((node) => getComputedStyle(node).overflowX)).toBe('hidden');
		if (size.width === 390) {
			await inspectMove.click();
			const option = inspectMove.locator('option').last();
			await expect(option).toBeVisible();
			const bounds = await option.boundingBox();
			expect(bounds!.x).toBeGreaterThanOrEqual(0);
			expect(bounds!.x + bounds!.width).toBeLessThanOrEqual(size.width);
			await page.keyboard.press('Escape');
		}
	}
});

test('resizing stops held live input without teleporting, while a view change resets position', async ({
	page
}) => {
	await landing(page);
	await page.keyboard.press('Enter');
	await modes(page).getByRole('button', { name: 'Top-down', exact: true }).click();
	const position = () => world(page).getAttribute('data-position');
	await page.keyboard.down('d');
	await expect.poll(async () => Number((await position())!.split(',')[0])).toBeGreaterThan(10);
	await page.setViewportSize({ width: 1280, height: 820 });
	const stopped = await position();
	expect(Number(stopped!.split(',')[0])).toBeGreaterThan(10);
	await page.evaluate(
		() => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)))
	); // the movement loop ran
	expect(await position()).toBe(stopped);
	await page.keyboard.up('d');
	await modes(page).getByRole('button', { name: 'Side-scroller', exact: true }).click();
	await expect(world(page)).toHaveAttribute('data-position', '0.00,0.00');
});

test('a lone character ignores wheel navigation and keyboard steps without reopening', async ({
	page
}, info) => {
	const dev = info.config.projects.find((project) => project.name === 'browser-selftests')!.use
		.baseURL!;
	await page.goto(dev);
	await expect(page.locator('.customize-action')).toBeEnabled();
	await expect(page.locator('.character-row')).toHaveCount(1);
	const result = await page.evaluate(async () => {
		const { doc, store } = await import(/* @vite-ignore */ String('/src/studio/state.svelte.ts'));
		const revision = doc.rev,
			project = store.project;
		const selection = document.querySelector<HTMLElement>('[role="application"]')!;
		const zoom = () => Number(selection.dataset.sceneZoom);
		const fit = zoom();
		const zoomed = [];
		for (const deltaY of [120, -120, 1, -1, 480]) {
			zoomed.push(
				!selection.dispatchEvent(
					new WheelEvent('wheel', { deltaY, bubbles: true, cancelable: true })
				)
			);
			await new Promise(requestAnimationFrame);
		}
		const zoomedOut = Math.abs(zoom() - fit) > 0.01;
		// A Cmd wheel is a navigation wheel that the scene passes on; a Ctrl wheel with no Control key held is a
		// trackpad pinch, so the scene zooms it. Neither may step a lone character.
		const modified = [
			!selection.dispatchEvent(
				new WheelEvent('wheel', { deltaY: 200, metaKey: true, bubbles: true, cancelable: true })
			),
			!selection.dispatchEvent(
				new WheelEvent('wheel', { deltaY: 200, ctrlKey: true, bubbles: true, cancelable: true })
			)
		];
		for (const key of ['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', 'a', 'd']) {
			selection.dispatchEvent(new KeyboardEvent('keydown', { key, bubbles: true }));
			await new Promise(requestAnimationFrame);
		}
		return {
			zoomed,
			zoomedOut,
			modified,
			sameProject: store.project === project,
			revisionDelta: doc.rev - revision
		};
	});
	expect(result.zoomed).toEqual([true, true, true, true, true]);
	expect(result.zoomedOut).toBe(true);
	expect(result.modified).toEqual([false, true]);
	expect(result.sameProject).toBe(true);
	expect(result.revisionDelta).toBe(0);
	await expect(page.locator('.customize-action')).toBeEnabled();
});

test('character carousel retargets real animations, keeps canvases, and settles reduced motion and small lists', async ({
	page
}, info) => {
	const dev = info.config.projects.find((project) => project.name === 'browser-selftests')!.use
		.baseURL!;
	await page.emulateMedia({ reducedMotion: 'no-preference' });
	await page.goto(dev);
	await expect(page.locator('.customize-action')).toHaveAttribute('aria-busy', 'false');
	const ids = await page.evaluate(async () => {
		const { openSource } = await import(/* @vite-ignore */ String('/src/lib/dress/project.ts'));
		const { saveImportedCharacter } = await import(
			/* @vite-ignore */ String('/src/lib/store/import.ts')
		);
		const { refreshProjects, openProject, store } = await import(
			/* @vite-ignore */ String('/src/studio/state.svelte.ts')
		);
		const { project } = await openSource('fixture:s2');
		for (let copy = 1; copy <= 6; copy++)
			await saveImportedCharacter(
				{
					project: { manifest: structuredClone(project.manifest), images: project.images },
					extra: {},
					warnings: []
				},
				`Carousel ${copy <= 3 ? 'trio ' : ''}${copy <= 2 ? 'pair ' : ''}${copy}`
			);
		await refreshProjects();
		await openProject(store.projects[0].id);
		return store.projects.map((project: { id: string }) => project.id);
	});
	const chosen = page.locator('.cast-character.chosen');
	const settled = () =>
		expect
			.poll(() =>
				page.locator('.cast').evaluate((cast) => cast.getAnimations({ subtree: true }).length)
			)
			.toBe(0);
	await settled();
	await expect(chosen).toHaveAttribute('data-character-id', ids[0]);
	await page.locator('.cast').evaluate((cast) => {
		const state = window as unknown as {
			carouselCanvas: HTMLCanvasElement;
			carouselNode: Element;
			carouselDimensions: number[];
			carouselButton: Element;
			carouselRect: string;
			carouselAnimate: typeof Element.prototype.animate;
		};
		state.carouselNode = cast.querySelector('.chosen')!;
		state.carouselCanvas = state.carouselNode.querySelector('canvas')!;
		state.carouselDimensions = [state.carouselCanvas.width, state.carouselCanvas.height];
		state.carouselButton = document.querySelector('.customize-action')!;
		state.carouselRect = JSON.stringify(state.carouselButton.getBoundingClientRect().toJSON());
		const animate = Element.prototype.animate;
		state.carouselAnimate = animate;
		Element.prototype.animate = function (...args: Parameters<Element['animate']>) {
			const animation = animate.apply(this, args);
			if (this.matches('.carousel-character')) {
				animation.pause();
				animation.currentTime = 0;
			}
			return animation;
		};
	});
	await page.getByRole('button', { name: 'Next character', exact: true }).click();
	await expect(chosen).toHaveAttribute('data-character-id', ids[1]);
	await expect
		.poll(() =>
			page.locator('.cast').evaluate((cast) => cast.getAnimations({ subtree: true }).length)
		)
		.toBeGreaterThan(0);
	const halfway = await page.locator('.cast').evaluate((cast) => {
		const state = window as unknown as {
			carouselCanvas: HTMLCanvasElement;
			carouselNode: HTMLElement;
			carouselDimensions: number[];
			carouselButton: Element;
			carouselRect: string;
			carouselSample: string;
		};
		for (const animation of cast.getAnimations({ subtree: true })) {
			if (animation.effect!.getTiming().duration !== 220)
				throw new Error('Unbounded carousel duration');
			animation.currentTime = 80;
		}
		state.carouselSample = getComputedStyle(state.carouselNode).transform;
		return {
			retained:
				state.carouselCanvas === state.carouselNode.querySelector('canvas') &&
				state.carouselCanvas.isConnected,
			dimensions: [state.carouselCanvas.width, state.carouselCanvas.height],
			previousDimensions: state.carouselDimensions,
			buttonStable:
				document.querySelector('.customize-action') === state.carouselButton &&
				JSON.stringify(state.carouselButton.getBoundingClientRect().toJSON()) ===
					state.carouselRect,
			moving: state.carouselSample !== state.carouselNode.style.transform,
			pixels: state.carouselCanvas
				.getContext('2d')!
				.getImageData(0, 0, state.carouselCanvas.width, state.carouselCanvas.height)
				.data.some((value, index) => index % 4 === 3 && value !== 0)
		};
	});
	expect(halfway.retained).toBe(true);
	expect(halfway.dimensions).toEqual(halfway.previousDimensions);
	expect(halfway.buttonStable).toBe(true);
	expect(halfway.moving).toBe(true);
	expect(halfway.pixels).toBe(true);
	await page.getByRole('button', { name: 'Previous character', exact: true }).click();
	await expect(chosen).toHaveAttribute('data-character-id', ids[0]);
	expect(
		await page.evaluate(() => {
			const state = window as unknown as { carouselNode: HTMLElement; carouselSample: string };
			return getComputedStyle(state.carouselNode).transform === state.carouselSample;
		})
	).toBe(true);
	const finish = async () => {
		await page.locator('.cast').evaluate((cast) => {
			for (const animation of cast.getAnimations({ subtree: true })) animation.finish();
		});
		await settled();
		await expect(page.locator('.cast-character')).toHaveCount(3);
	};
	await finish();
	await page.getByRole('button', { name: 'Next character', exact: true }).click();
	await expect(chosen).toHaveAttribute('data-character-id', ids[1]);
	const firstExit = page.locator(`.cast-character[data-character-id="${ids.at(-1)}"]`);
	await firstExit.evaluate((node) => {
		for (const animation of node.getAnimations()) animation.currentTime = 80;
	});
	const exitOpacity = await firstExit.evaluate((node) => getComputedStyle(node).opacity);
	await page.getByRole('button', { name: 'Next character', exact: true }).click();
	await expect(chosen).toHaveAttribute('data-character-id', ids[2]);
	await expect(firstExit).toHaveCount(1);
	expect(await firstExit.evaluate((node) => getComputedStyle(node).opacity)).toBe(exitOpacity);
	expect(
		await firstExit.evaluate((node) => node.getAnimations()[0].effect!.getTiming().duration)
	).toBe(140);
	await page.getByRole('button', { name: 'Previous character', exact: true }).click();
	await expect(chosen).toHaveAttribute('data-character-id', ids[1]);
	expect(
		await firstExit.evaluate((node) => {
			const frames = (node.getAnimations()[0].effect as KeyframeEffect).getKeyframes();
			return new DOMMatrix(String(frames.at(-1)!.transform)).m41;
		})
	).toBeLessThan(0);
	await finish();
	const open = async (id: string) => {
		await page.locator('.character-row').nth(ids.indexOf(id)).click();
		await expect(chosen).toHaveAttribute('data-character-id', id);
	};
	await open(ids[0]);
	await finish();
	await page.locator('.selection-world').dispatchEvent('wheel', {
		deltaY: 400,
		metaKey: true,
		bubbles: true,
		cancelable: true
	});
	await expect(chosen).toHaveAttribute('data-character-id', ids[2]);
	expect(
		await page
			.locator(`.cast-character[data-character-id="${ids[1]}"]`)
			.evaluate((node) => (node.getAnimations()[0].effect as KeyframeEffect).getKeyframes().length)
	).toBe(2);
	await finish();
	await open(ids[1]);
	await finish();
	await page.evaluate(
		(blockedIds) => {
			const state = window as unknown as {
				carouselReleases: Record<string, () => void>;
				carouselGet: typeof IDBObjectStore.prototype.get;
			};
			state.carouselReleases = {};
			const blocks = new Set(blockedIds);
			state.carouselGet = IDBObjectStore.prototype.get;
			IDBObjectStore.prototype.get = function (key: IDBValidKey) {
				if (this.name === 'projects' && blocks.delete(String(key))) {
					const transaction = this.transaction;
					transaction.addEventListener(
						'complete',
						(event) => {
							event.stopImmediatePropagation();
							state.carouselReleases[String(key)] = () =>
								transaction.dispatchEvent(new Event('complete'));
						},
						{ once: true }
					);
				}
				return state.carouselGet.call(this, key);
			};
			window.dispatchEvent(
				new WheelEvent('wheel', { deltaY: 200, metaKey: true, cancelable: true })
			);
		},
		[ids[2], ids[1]]
	);
	const blocked = (id: string) =>
		expect
			.poll(() =>
				page.evaluate(
					(target) =>
						typeof (window as unknown as { carouselReleases: Record<string, () => void> })
							.carouselReleases[target],
					id
				)
			)
			.toBe('function');
	const release = (id: string) =>
		page.evaluate(
			(target) =>
				(window as unknown as { carouselReleases: Record<string, () => void> }).carouselReleases[
					target
				](),
			id
		);
	await blocked(ids[2]);
	await page.locator('.selection-world').dispatchEvent('wheel', {
		deltaY: -200,
		metaKey: true,
		bubbles: true,
		cancelable: true
	});
	await release(ids[2]);
	await blocked(ids[1]);
	await expect(chosen).toHaveAttribute('data-character-id', ids[2]);
	const arrival = await page
		.locator(`.cast-character[data-character-id="${ids[3]}"]`)
		.evaluate(
			(node) =>
				new DOMMatrix(
					String((node.getAnimations()[0].effect as KeyframeEffect).getKeyframes()[0].transform)
				).m41
		);
	expect(arrival).toBeGreaterThan(0);
	await release(ids[1]);
	await expect(chosen).toHaveAttribute('data-character-id', ids[1]);
	await finish();
	await page.evaluate(() => {
		IDBObjectStore.prototype.get = (
			window as unknown as { carouselGet: typeof IDBObjectStore.prototype.get }
		).carouselGet;
	});
	await open(ids[0]);
	await finish();
	await page.evaluate(async (id) => {
		const { openProject } = await import(/* @vite-ignore */ String('/src/studio/state.svelte.ts'));
		await openProject(id);
	}, ids[3]);
	await expect(chosen).toHaveAttribute('data-character-id', ids[3]);
	await expect(page.locator('.cast-character[inert]')).toHaveCount(3);
	await finish();
	await page.getByRole('button', { name: 'Next character', exact: true }).click();
	await expect(chosen).toHaveAttribute('data-character-id', ids[4]);
	await page.emulateMedia({ reducedMotion: 'reduce' });
	await settled();
	await expect(page.locator('.cast-character')).toHaveCount(3);
	await page.getByRole('button', { name: 'Next character', exact: true }).click();
	await expect(chosen).toHaveAttribute('data-character-id', ids[5]);
	await settled();
	await page.emulateMedia({ reducedMotion: 'no-preference' });
	const search = page.getByRole('searchbox', { name: 'Search characters', exact: true });
	await search.fill('Carousel trio');
	await expect(page.locator('.character-row')).toHaveCount(3);
	await settled();
	await page.getByRole('button', { name: 'Next character', exact: true }).click();
	await expect
		.poll(() =>
			page
				.locator('.cast')
				.evaluate((cast) =>
					cast
						.getAnimations({ subtree: true })
						.some((animation) => (animation.effect as KeyframeEffect).getKeyframes().length === 4)
				)
		)
		.toBe(true);
	await finish();
	await search.fill('Carousel trio pair');
	await expect(page.locator('.cast-character')).toHaveCount(2);
	await settled();
	await page.getByRole('button', { name: 'Next character', exact: true }).click();
	await expect
		.poll(() =>
			page.locator('.cast').evaluate((cast) => cast.getAnimations({ subtree: true }).length)
		)
		.toBe(2);
	await page.setViewportSize({ width: 390, height: 844 });
	await settled();
	await expect(page.locator('.cast-character')).toHaveCount(2);
	await search.fill('Carousel trio pair 1');
	await expect(page.locator('.cast-character')).toHaveCount(1);
	await settled();
	// A Cmd wheel steps anywhere on this screen, but a search with one match has nowhere to step and the scene keeps
	// its zoom.
	const fit = await page.locator('.selection-world').getAttribute('data-scene-zoom');
	await page.locator('.selection-world').dispatchEvent('wheel', {
		deltaY: 1000,
		metaKey: true,
		bubbles: true,
		cancelable: true
	});
	await settled();
	await expect(page.locator('.cast-character')).toHaveCount(1);
	await expect(page.locator('.selection-world')).toHaveAttribute('data-scene-zoom', fit!);
	await search.fill('No carousel matches');
	await expect(page.locator('.cast-character')).toHaveCount(0);
	await settled();
	await page.evaluate(() => {
		Element.prototype.animate = (
			window as unknown as { carouselAnimate: typeof Element.prototype.animate }
		).carouselAnimate;
	});
	await search.fill('');
	await expect(page.locator('.cast-character')).toHaveCount(3);
	await page.getByRole('button', { name: 'Next character', exact: true }).click();
	await settled();
	await expect(page.locator('.cast-character')).toHaveCount(3);
	await expect(page.getByRole('button', { name: 'Next character', exact: true })).toBeFocused();
});

test('fast wheel input skips intermediate loads and keeps the latest selection while loading', async ({
	page
}, info) => {
	const dev = info.config.projects.find((project) => project.name === 'browser-selftests')!.use
		.baseURL!;
	await page.goto(dev);
	await expect(page.locator('.customize-action')).toBeEnabled();
	const ids = await page.evaluate(async () => {
		const { openSource } = await import(/* @vite-ignore */ String('/src/lib/dress/project.ts'));
		const { saveImportedCharacter } = await import(
			/* @vite-ignore */ String('/src/lib/store/import.ts')
		);
		const { refreshProjects, openProject, store } = await import(
			/* @vite-ignore */ String('/src/studio/state.svelte.ts')
		);
		const { project } = await openSource('fixture:s2');
		const { splitBase } = await import(/* @vite-ignore */ String('/src/lib/dress/regions.ts'));
		await splitBase(project);
		for (let copy = 1; copy <= 6; copy++)
			await saveImportedCharacter(
				{
					project: { manifest: structuredClone(project.manifest), images: project.images },
					extra: {},
					warnings: []
				},
				`Wheel test ${copy}${copy === 1 ? ' with an exceptionally long character name' : ''}`
			);
		await refreshProjects();
		await openProject(store.projects[0].id);
		return store.projects.map((project: { id: string }) => project.id);
	});
	const rows = page.locator('.character-row');
	await expect(rows).toHaveCount(7);
	await expect(rows.first()).toHaveAttribute('aria-pressed', 'true');
	await expect(rows.locator('canvas')).toHaveCount(7);
	const customizeButton = page.locator('.customize-action');
	await customizeButton.evaluate((button) => {
		(window as unknown as { customizeButton: Element }).customizeButton = button;
	});
	const customizeAppearance = () =>
		customizeButton.evaluate((button) => ({
			sameNode: button === (window as unknown as { customizeButton: Element }).customizeButton,
			rect: button.getBoundingClientRect().toJSON(),
			opacity: getComputedStyle(button).opacity
		}));
	await expect(customizeButton).toHaveText(
		`Customize ${await page.locator('.selected-name-text').textContent()}`
	);
	const readyAppearance = await customizeAppearance();
	// The first steps turn the wheel while Control is really held; the rest hold Cmd, which needs no key tracking.
	await page.keyboard.down('Control');
	await page.evaluate(async () => {
		const { store } = await import(/* @vite-ignore */ String('/src/studio/state.svelte.ts'));
		const state = window as unknown as {
			wheelReads: string[];
			wheelBlocks: string[];
			wheelReleases: Record<string, () => void>;
			releaseWheelRead?: () => void;
			wheelFailures?: string[];
		};
		state.wheelReads = [];
		state.wheelBlocks = [store.projects[1].id];
		state.wheelReleases = {};
		performance.now = () => 0;
		const original = IDBObjectStore.prototype.get;
		IDBObjectStore.prototype.get = function (key: IDBValidKey) {
			if (this.name === 'projects' && String(key).startsWith('rig-'))
				state.wheelReads.push(String(key));
			const blocked = state.wheelBlocks.indexOf(String(key));
			if (this.name === 'projects' && blocked !== -1) {
				state.wheelBlocks.splice(blocked, 1);
				const transaction = this.transaction;
				transaction.addEventListener(
					'complete',
					(event) => {
						event.stopImmediatePropagation();
						state.releaseWheelRead = () => transaction.dispatchEvent(new Event('complete'));
						state.wheelReleases[String(key)] = state.releaseWheelRead;
					},
					{ once: true }
				);
			}
			const request = original.call(this, key);
			if (this.name === 'projects' && state.wheelFailures?.includes(String(key)))
				Object.defineProperty(request, 'result', { get: () => undefined });
			return request;
		};
		window.dispatchEvent(new WheelEvent('wheel', { deltaY: 200, ctrlKey: true, cancelable: true }));
	});
	await expect(customizeButton).toHaveAttribute('aria-busy', 'true');
	expect(await customizeAppearance()).toEqual(readyAppearance);
	await expect
		.poll(() =>
			page.evaluate(
				() => typeof (window as unknown as { releaseWheelRead?: () => void }).releaseWheelRead
			)
		)
		.toBe('function');
	await page.evaluate(async () => {
		window.dispatchEvent(new WheelEvent('wheel', { deltaY: 200, ctrlKey: true, cancelable: true }));
		window.dispatchEvent(new WheelEvent('wheel', { deltaY: 200, ctrlKey: true, cancelable: true }));
		await new Promise<void>((resolve) =>
			requestAnimationFrame(() => requestAnimationFrame(() => resolve()))
		);
	});
	expect(
		await page.evaluate(() => (window as unknown as { wheelReads: string[] }).wheelReads)
	).toEqual([ids[1]]);
	await expect(customizeButton).toHaveAttribute('aria-busy', 'true');
	await expect(rows.first()).toHaveAttribute('aria-pressed', 'true');
	await page.evaluate(() =>
		(window as unknown as { releaseWheelRead: () => void }).releaseWheelRead()
	);
	await expect(rows.nth(3)).toHaveAttribute('aria-pressed', 'true');
	await expect(page.locator('.customize-action')).toBeEnabled();
	expect(await customizeAppearance()).toEqual(readyAppearance);
	const reads = await page.evaluate(
		() => (window as unknown as { wheelReads: string[] }).wheelReads
	);
	expect(reads).toEqual([ids[1], ids[3]]);
	await page.evaluate(() => {
		performance.now = () => 300;
		window.dispatchEvent(
			new WheelEvent('wheel', { deltaY: -1000, ctrlKey: true, cancelable: true })
		);
	});
	await expect(rows.nth(5)).toHaveAttribute('aria-pressed', 'true');
	await expect(page.locator('.customize-action')).toBeEnabled();
	await page.keyboard.up('Control');
	const send = (deltas: number[], time: number) =>
		page.evaluate(
			async ({ deltas, time }) => {
				performance.now = () => time;
				for (const deltaY of deltas)
					window.dispatchEvent(
						new WheelEvent('wheel', { deltaY, metaKey: true, cancelable: true })
					);
				await new Promise<void>((resolve) =>
					requestAnimationFrame(() => requestAnimationFrame(() => resolve()))
				);
			},
			{ deltas, time }
		);
	const readIds = () =>
		page.evaluate(() => (window as unknown as { wheelReads: string[] }).wheelReads);
	await page.evaluate(() => {
		(window as unknown as { wheelReads: string[] }).wheelReads = [];
	});
	await send([200, 200, 200], 600);
	await expect(rows.nth(1)).toHaveAttribute('aria-pressed', 'true');
	await expect(page.locator('.customize-action')).toBeEnabled();
	expect(await readIds()).toEqual([ids[1]]);
	await send([500], 900);
	await expect(rows.nth(3)).toHaveAttribute('aria-pressed', 'true');
	await expect(page.locator('.customize-action')).toBeEnabled();
	await send([100], 910);
	await expect(rows.nth(4)).toHaveAttribute('aria-pressed', 'true');
	await expect(page.locator('.customize-action')).toBeEnabled();
	// Wheels that never step clear the pending distance: Shift and Alt belong to the page and browser, a Ctrl pinch or
	// a horizontal swipe zooms the scene.
	for (const [turn, init] of [
		{ shiftKey: true },
		{ ctrlKey: true },
		{ altKey: true },
		{ deltaX: 600 }
	].entries()) {
		const before = await readIds();
		await send([140], 1200 + turn * 600);
		await page.evaluate(
			(init) =>
				window.dispatchEvent(new WheelEvent('wheel', { deltaY: 100, cancelable: true, ...init })),
			init
		);
		await send([60], 1210 + turn * 600);
		expect(await readIds()).toEqual(before);
		await expect(rows.nth(4)).toHaveAttribute('aria-pressed', 'true');
	}
	// A Cmd wheel is a navigation wheel, so it keeps the pending distance instead of clearing it: 140 + 60 px still
	// crosses one step, and the reverse wheel brings the same character straight back.
	await send([140], 4200);
	await page.evaluate(() =>
		window.dispatchEvent(new WheelEvent('wheel', { deltaY: 100, metaKey: true, cancelable: true }))
	);
	await send([60], 4210);
	await expect(rows.nth(5)).toHaveAttribute('aria-pressed', 'true');
	await expect(page.locator('.customize-action')).toBeEnabled();
	await page.evaluate(() =>
		window.dispatchEvent(new WheelEvent('wheel', { deltaY: -200, metaKey: true, cancelable: true }))
	);
	await expect(rows.nth(4)).toHaveAttribute('aria-pressed', 'true');
	await expect(page.locator('.customize-action')).toBeEnabled();
	await page.evaluate(async (ids) => {
		// A trackpad pinch: the scene zooms it and any pending step is dropped.
		window.dispatchEvent(new WheelEvent('wheel', { deltaY: 1, ctrlKey: true, cancelable: true }));
		const { openProject } = await import(/* @vite-ignore */ String('/src/studio/state.svelte.ts'));
		await openProject(ids[5]);
		const state = window as unknown as {
			wheelBlocks: string[];
			wheelReads: string[];
			wheelReleases: Record<string, () => void>;
		};
		state.wheelReads = [];
		state.wheelBlocks = [ids[6], ids[4]];
		state.wheelReleases = {};
	}, ids);
	const held = (id: string) =>
		expect
			.poll(() =>
				page.evaluate(
					(id) =>
						typeof (window as unknown as { wheelReleases: Record<string, () => void> })
							.wheelReleases[id],
					id
				)
			)
			.toBe('function');
	const release = (id: string) =>
		page.evaluate(
			(id) =>
				(window as unknown as { wheelReleases: Record<string, () => void> }).wheelReleases[id](),
			id
		);
	await send([200], 1500);
	await held(ids[6]);
	await page.getByRole('button', { name: 'More options', exact: true }).click();
	await page.evaluate((id) => {
		void import(/* @vite-ignore */ String('/src/studio/state.svelte.ts')).then(({ openProject }) =>
			openProject(id)
		);
	}, ids[4]);
	await held(ids[4]);
	await page.keyboard.press('Escape');
	await expect(page.locator(':popover-open')).toHaveCount(0);
	await send([200], 1800);
	await release(ids[6]);
	await send([], 1800);
	await release(ids[4]);
	await expect
		.poll(() =>
			page.evaluate(async () => {
				const { doc } = await import(/* @vite-ignore */ String('/src/studio/state.svelte.ts'));
				return {
					id: doc.id,
					loading: doc.loading,
					reads: (window as unknown as { wheelReads: string[] }).wheelReads
				};
			})
		)
		.toEqual({ id: ids[6], loading: false, reads: [ids[6], ids[4], ids[6]] });
	await expect(rows.nth(6)).toHaveAttribute('aria-pressed', 'true');
	await expect(page.locator('.customize-action')).toBeEnabled();
	expect(await readIds()).toEqual([ids[6], ids[4], ids[6]]);
	for (const cancel of ['popover', 'filter', 'row', 'modifier']) {
		await page.evaluate(async (ids) => {
			// A pinch drops any pending step so the explicit open below is the one that matters.
			window.dispatchEvent(new WheelEvent('wheel', { deltaY: 1, ctrlKey: true, cancelable: true }));
			const { openProject } = await import(
				/* @vite-ignore */ String('/src/studio/state.svelte.ts')
			);
			await openProject(ids[0]);
			const state = window as unknown as {
				wheelReads: string[];
				wheelBlocks: string[];
				wheelReleases: Record<string, () => void>;
			};
			state.wheelReads = [];
			state.wheelBlocks = [ids[1]];
			state.wheelReleases = {};
		}, ids);
		await send([200], 2100);
		await held(ids[1]);
		await send([200], 2110);
		await customizeButton.click();
		await expect(page.locator('.experience')).toHaveClass(/selection/);
		const search = page.getByRole('searchbox', { name: 'Search characters', exact: true });
		if (cancel === 'popover')
			await page.getByRole('button', { name: 'More options', exact: true }).click();
		if (cancel === 'filter') await search.fill('Wheel test 3');
		if (cancel === 'row') await rows.nth(4).click();
		if (cancel === 'modifier')
			// A pinch in the middle of a step cancels it.
			await page.evaluate(() =>
				window.dispatchEvent(
					new WheelEvent('wheel', { deltaY: 100, ctrlKey: true, cancelable: true })
				)
			);
		await release(ids[1]);
		await expect(page.locator('.customize-action')).toBeEnabled();
		await send([], 2110);
		await expect(page.locator('.experience')).toHaveClass(/selection/);
		if (cancel === 'filter') {
			await expect(rows).toHaveCount(1);
			await expect(rows.first()).toHaveAttribute('aria-pressed', 'true');
			expect(await readIds()).toEqual([ids[1], ids[4]]);
			await search.fill('');
		} else {
			await expect(rows.nth(1)).toHaveAttribute('aria-pressed', 'true');
			expect(await readIds()).toEqual([ids[1]]);
		}
		if (cancel === 'popover') await page.keyboard.press('Escape');
	}
	for (const [scenario, viewport] of [
		{ width: 1280, height: 720 },
		{ width: 1280, height: 720 },
		{ width: 390, height: 844 },
		{ width: 390, height: 844 }
	].entries()) {
		await page.setViewportSize(viewport);
		await page.evaluate(
			async ({ ids, light }) => {
				const { characters } = await import(
					/* @vite-ignore */ String('/src/studio/experience/state.svelte.ts')
				);
				const { openProject, ui, applyTheme } = await import(
					/* @vite-ignore */ String('/src/studio/state.svelte.ts')
				);
				characters();
				ui.theme = light ? 'light' : 'dark';
				applyTheme();
				await openProject(ids[0]);
				const state = window as unknown as {
					wheelReads: string[];
					wheelBlocks: string[];
					wheelReleases: Record<string, () => void>;
				};
				state.wheelReads = [];
				state.wheelBlocks = [ids[1]];
				state.wheelReleases = {};
			},
			{ ids, light: scenario % 2 === 1 }
		);
		await expect(customizeButton).toHaveAttribute('aria-busy', 'false');
		await customizeButton.evaluate((button) => {
			(window as unknown as { customizeButton: Element }).customizeButton = button;
		});
		const appearance = await customizeAppearance();
		await expect(customizeButton).toHaveText(
			`Customize ${await page.locator('.selected-name-text').textContent()}`
		);
		await send([200], 3000);
		await held(ids[1]);
		await send([1000], 3010);
		expect(await customizeAppearance()).toEqual(appearance);
		await expect(customizeButton).toHaveAttribute('aria-busy', 'true');
		if (scenario === 3) {
			await customizeButton.click();
			await send([], 3010);
			await expect(page.locator('.experience')).toHaveClass(/selection/);
			expect(await readIds()).toEqual([ids[1]]);
		}
		await release(ids[1]);
		if (scenario !== 3) {
			await expect(rows.nth(6)).toHaveAttribute('aria-pressed', 'true');
			await expect(customizeButton).toHaveAttribute('aria-busy', 'false');
			expect(await customizeAppearance()).toEqual(appearance);
			await expect(customizeButton).toHaveAccessibleName(/Customize Wheel test 1 with/);
			await expect(customizeButton).toHaveText(
				'Customize Wheel test 1 with an exceptionally long character name'
			);
			await customizeButton.click();
		}
		await expect(page.locator('.experience')).not.toHaveClass(/selection/);
		expect(await readIds()).toEqual([ids[1], ids[6]]);
		expect(
			await page.evaluate(async () => {
				const { doc } = await import(/* @vite-ignore */ String('/src/studio/state.svelte.ts'));
				return doc.id;
			})
		).toBe(ids[6]);
	}
	for (const [source, fails] of [
		['wheel', true],
		['row', false],
		['row', true]
	] as const) {
		await page.evaluate(
			async ({ ids, fails }) => {
				const { characters } = await import(
					/* @vite-ignore */ String('/src/studio/experience/state.svelte.ts')
				);
				const { openProject } = await import(
					/* @vite-ignore */ String('/src/studio/state.svelte.ts')
				);
				characters();
				await openProject(ids[0]);
				const state = window as unknown as {
					wheelReads: string[];
					wheelBlocks: string[];
					wheelFailures: string[];
					wheelReleases: Record<string, () => void>;
				};
				state.wheelReads = [];
				state.wheelBlocks = [ids[1]];
				state.wheelFailures = fails ? [ids[1]] : [];
				state.wheelReleases = {};
			},
			{ ids, fails }
		);
		if (source === 'wheel') await send([200], 4000);
		else await rows.nth(1).click();
		await held(ids[1]);
		await customizeButton.click();
		await release(ids[1]);
		await expect
			.poll(() =>
				page.evaluate(async () => {
					const { doc } = await import(/* @vite-ignore */ String('/src/studio/state.svelte.ts'));
					return doc.loading;
				})
			)
			.toBe(false);
		await send([], 4000);
		if (fails) {
			await expect(page.locator('.experience')).toHaveClass(/selection/);
			await expect(customizeButton).toHaveAttribute('aria-busy', 'false');
		} else await expect(page.locator('.experience')).not.toHaveClass(/selection/);
		expect(await readIds()).toEqual([ids[1]]);
	}
});

test('selection wheel preserves fast input, normalizes deltas, and respects native scrolling', async ({
	page
}) => {
	await landing(page);
	await page.keyboard.press('Enter');
	// Three genuine local projects exercise wrapping without fixture-only navigation state.
	await page.getByRole('button', { name: 'Export', exact: true }).click();
	const exportDialog = page.getByRole('dialog', { name: 'Export', exact: true });
	await exportDialog.getByRole('radio', { name: 'PNG + JSON', exact: true }).click();
	const download = exportDialog.getByRole('button', { name: /^Download ZIP/ });
	await expect(download).toBeEnabled({ timeout: 30_000 });
	const downloaded = page.waitForEvent('download');
	await download.click();
	const bytes = await readFile((await (await downloaded).path())!);
	for (let copy = 0; copy < 2; copy++) {
		await page.locator('.project-btn').click();
		await page
			.locator('#project-menu')
			.getByRole('button', { name: 'New character', exact: true })
			.first()
			.click();
		await page.getByRole('menuitem', { name: 'Import from device…', exact: true }).click();
		const dialog = page.getByRole('dialog', { name: 'Import from device', exact: true });
		await dialog
			.getByLabel('Character ZIP', { exact: true })
			.setInputFiles({ name: 'wheel-character.zip', mimeType: 'application/zip', buffer: bytes });
		await expect(
			dialog.getByRole('img', { name: 'Character import preview', exact: true })
		).toBeVisible();
		await dialog.getByLabel('Character name', { exact: true }).fill(`Wheel character ${copy + 1}`);
		await dialog
			.getByRole('checkbox', { name: 'Set up the pose rig next (recommended)', exact: true })
			.uncheck();
		await dialog.getByRole('button', { name: 'Import character', exact: true }).click();
		await expect(page.locator('.name-menu .name-text')).toHaveText(`Wheel character ${copy + 1}`, {
			timeout: 30_000
		}); // a full import saves and reopens the character
	}
	await page.getByRole('button', { name: 'Characters', exact: true }).click();
	const rows = page.locator('.character-row');
	await expect(rows).toHaveCount(3);
	const selected = () =>
		rows.evaluateAll((elements) =>
			elements.findIndex((element) => element.getAttribute('aria-pressed') === 'true')
		);
	let index = await selected();
	// A plain wheel over the scene zooms it instead of stepping; one notch out and back leaves it at its fit.
	const scene = page.locator('.selection-world');
	const zoom = async () => Number(await scene.getAttribute('data-scene-zoom'));
	const fit = await zoom();
	await scene.dispatchEvent('wheel', { deltaY: 120, bubbles: true, cancelable: true });
	await expect.poll(zoom).toBeLessThan(fit);
	expect(await selected()).toBe(index);
	await scene.dispatchEvent('wheel', { deltaY: -120, bubbles: true, cancelable: true });
	await expect.poll(async () => Math.abs((await zoom()) - fit)).toBeLessThan(1e-3);
	expect(await selected()).toBe(index);
	const wheel = (
		deltaY: number,
		init: {
			deltaMode?: number;
			deltaX?: number;
			shiftKey?: boolean;
			ctrlKey?: boolean;
			metaKey?: boolean;
		} = {}
	) =>
		page.evaluate(
			({ deltaY, init }) =>
				!window.dispatchEvent(new WheelEvent('wheel', { deltaY, cancelable: true, ...init })),
			{ deltaY, init }
		);
	// A plain wheel, Shift, a Ctrl pinch and a horizontal swipe all leave the cast alone.
	for (const init of [{}, { shiftKey: true }, { ctrlKey: true }, { deltaX: 120 }])
		expect(await wheel(60, init)).toBe(false);
	expect(await selected()).toBe(index);
	await page.evaluate(() => {
		const w = window as unknown as { t: number },
			t0 = performance.now();
		w.t = 0;
		performance.now = () => t0 + w.t;
	});
	const at = (t: number, deltaY: number, deltaMode = 0) =>
		page.evaluate(
			async ({ t, deltaY, deltaMode }) => {
				(window as unknown as { t: number }).t = t;
				window.dispatchEvent(
					new WheelEvent('wheel', { deltaY, deltaMode, metaKey: true, cancelable: true })
				);
				await new Promise<void>((resolve) =>
					requestAnimationFrame(() => requestAnimationFrame(() => resolve()))
				);
			},
			{ t, deltaY, deltaMode }
		);
	const step = async (delta: number) => {
		index = (index + delta + 3) % 3;
		await expect.poll(selected).toBe(index);
		await expect(page.locator('.customize-action')).toBeEnabled();
	};
	await at(0, 100);
	expect(await selected()).toBe(index);
	await at(250, 60);
	expect(await selected()).toBe(index);
	await at(500, 40);
	await step(1);
	// A trackpad pinch clears the pending distance and never steps, so the next turn starts over.
	expect(await wheel(1, { ctrlKey: true })).toBe(false);
	await at(0, 400);
	await step(2);
	await at(300, 13, 1);
	await step(1); // lines × 16 px
	await at(600, -200);
	await step(-1);
	await at(900, 120);
	expect(await selected()).toBe(index);
	await at(1500, 120);
	expect(await selected()).toBe(index);
	await at(1510, 80);
	await step(1);
	await at(2100, 140);
	expect(await selected()).toBe(index);
	await at(2110, -140);
	expect(await selected()).toBe(index);
	await at(2120, -60);
	await step(-1);
	await at(2700, -140);
	expect(await selected()).toBe(index);
	await at(3300, 200);
	await step(1);
	await at(3310, 200);
	await step(1);
	await at(3320, 200);
	await step(1);
	await at(3900, 1, 2);
	await step(2);
	await page.getByRole('button', { name: 'More options', exact: true }).click();
	// Even a Cmd wheel drops its pending step while a popover is open.
	expect(await wheel(120, { metaKey: true })).toBe(false);
	expect(await selected()).toBe(index);
	await page.keyboard.press('Escape');
	await expect(page.locator(':popover-open')).toHaveCount(0);
	// A plain wheel over the list scrolls it natively and never steps; a Cmd wheel steps from anywhere, including over
	// a list that can still scroll.
	const wheelOnRow = (deltaY: number, t: number, init: { metaKey?: boolean } = {}) =>
		page.evaluate(
			({ deltaY, t, init }) => {
				(window as unknown as { t: number }).t = t;
				return !document
					.querySelector('.character-row')!
					.dispatchEvent(
						new WheelEvent('wheel', { deltaY, bubbles: true, cancelable: true, ...init })
					);
			},
			{ deltaY, t, init }
		);
	await page.locator('.character-rows').evaluate((el) => {
		el.style.maxHeight = '40px';
		el.scrollTop = 0;
	});
	await page.locator('.character-rows').hover();
	await page.mouse.wheel(0, 120);
	await expect
		.poll(() => page.locator('.character-rows').evaluate((el) => el.scrollTop))
		.toBeGreaterThan(0);
	expect(await selected()).toBe(index);
	await page.locator('.character-rows').evaluate((el) => (el.scrollTop = 0));
	expect(await wheelOnRow(-120, 3000)).toBe(false); // at the top
	expect(await wheelOnRow(120, 3300)).toBe(false);
	await page.locator('.character-rows').evaluate((el) => (el.scrollTop = el.scrollHeight));
	expect(await wheelOnRow(120, 3600)).toBe(false); // at the bottom
	expect(await selected()).toBe(index);
	expect(await wheelOnRow(200, 3700, { metaKey: true })).toBe(true);
	await step(1); // the list still scrolls, and the modified wheel steps anyway
	await page.locator('.character-rows').evaluate((el) => (el.style.maxHeight = ''));
	expect(await wheelOnRow(200, 3900, { metaKey: true })).toBe(true);
	await step(1);
	// Thumbnails are read once and shared: stepping and opening the name menu read only the record of the character being
	// opened, and its frames, already decoded for its thumbnail, are not read or decoded again.
	await page.evaluate(() => {
		const w = window as unknown as { characterReads: number; frameReads: number };
		w.characterReads = w.frameReads = 0;
		const get = IDBObjectStore.prototype.get;
		IDBObjectStore.prototype.get = function (this: IDBObjectStore, key: IDBValidKey) {
			if (this.name === 'projects' && String(key).startsWith('rig-')) w.characterReads++;
			if (this.name === 'blobs') w.frameReads++;
			return get.call(this, key);
		};
	});
	const reads = () =>
		page.evaluate(() => (window as unknown as { characterReads: number }).characterReads);
	const frameReads = () =>
		page.evaluate(() => (window as unknown as { frameReads: number }).frameReads);
	for (const delta of [1, 1, -1]) {
		await page
			.getByRole('button', { name: delta > 0 ? 'Next character' : 'Previous character' })
			.click();
		await step(delta);
	}
	await page.locator('.selected-name').click();
	const menuThumbs = page.locator('#project-menu .character-thumbnail canvas');
	await expect(menuThumbs).toHaveCount(3);
	// Each menu thumbnail is drawn from the shared still at once, not blank while it loads.
	expect(
		await menuThumbs.evaluateAll((canvases) =>
			(canvases as HTMLCanvasElement[]).map((c) =>
				c
					.getContext('2d')!
					.getImageData(0, 0, c.width, c.height)
					.data.some((v, i) => i % 4 === 3 && v > 0)
			)
		)
	).toEqual([true, true, true]);
	await page.keyboard.press('Escape');
	expect(await reads()).toBeLessThanOrEqual(3);
	expect(await frameReads()).toBe(0);
	const currentName = await page.locator('.selected-name-text').textContent();
	await page.getByRole('searchbox', { name: 'Search characters', exact: true }).fill(currentName!);
	await expect(rows).toHaveCount(1);
	const beforeSingleResult = await reads();
	// One match leaves nowhere to step, even for a Cmd wheel.
	expect(await wheelOnRow(120, 5000, { metaKey: true })).toBe(false);
	expect(await wheelOnRow(-120, 5300, { metaKey: true })).toBe(false);
	await page.evaluate(
		() =>
			new Promise<void>((resolve) =>
				requestAnimationFrame(() => requestAnimationFrame(() => resolve()))
			)
	);
	await expect(page.locator('.customize-action')).toBeEnabled();
	expect(await reads()).toBe(beforeSingleResult);
});

// Moved from experience.spec.ts (screenshot config) so these behavioral checks gate deploys.
async function customize(page: Page) {
	await landing(page);
	await page.locator('.customize-action').click();
	await expect(page.locator('.world-stage')).toHaveAttribute('data-position', '0.00,0.00');
	await expect(page.getByRole('tablist', { name: 'Customization panels' })).toBeVisible();
}
async function pause(page: Page) {
	const pauseButton = page.getByRole('button', { name: 'Pause', exact: true });
	if (await pauseButton.isVisible()) await pauseButton.click();
}

test('phone More preserves Redo and closes after restoring a taken-off item state', async ({
	page
}) => {
	await page.setViewportSize({ width: 360, height: 844 });
	await customize(page);
	await pause(page);
	const options = page.getByRole('button', { name: 'More options', exact: true });
	const popup = page.locator('#experience-options');
	await options.click();
	await expect(popup.getByRole('button', { name: 'Redo', exact: true })).toBeDisabled();
	await page.keyboard.press('Escape');
	await page
		.getByRole('navigation', { name: 'Equipment slots', exact: true })
		.getByRole('button', { name: /^Head/ })
		.click();
	const helmet = page.getByRole('button', { name: 'Steel helmet', exact: true });
	const none = page.getByRole('button', { name: 'Empty head', exact: true });
	await expect(helmet).toHaveAttribute('aria-pressed', 'true');
	// One fixed name; aria-pressed carries whether the slot is empty.
	await expect(none).toHaveAttribute('aria-pressed', 'false');
	await none.click();
	await expect(none).toHaveAttribute('aria-pressed', 'true');
	await expect(none).toHaveAccessibleName('Empty head');
	await expect(helmet).toHaveAttribute('aria-pressed', 'false');
	// On a 360 px phone Undo and Redo both live in More.
	await options.click();
	await popup.getByRole('button', { name: /^Undo/ }).click();
	await expect(popup).not.toBeVisible();
	await expect(helmet).toHaveAttribute('aria-pressed', 'true');
	await options.click();
	const redo = popup.getByRole('button', { name: 'Redo Take off', exact: true });
	await expect(redo).toBeVisible();
	await expect(redo).toBeEnabled();
	await redo.click();
	await expect(popup).not.toBeVisible();
	await expect(options).toBeFocused();
	await expect(none).toHaveAttribute('aria-pressed', 'true');
	await expect(helmet).toHaveAttribute('aria-pressed', 'false');
	await options.click();
	await expect(popup.getByRole('button', { name: 'Redo', exact: true })).toBeDisabled();
});

test('selection search shows an honest zero-result state and preserves native editing', async ({
	page
}) => {
	await landing(page);
	const search = page.getByRole('searchbox', { name: 'Search characters', exact: true });
	await search.fill('There is no such saved character');
	await expect(page.locator('.character-row')).toHaveCount(0);
	await expect(page.locator('.cast-character')).toHaveCount(0);
	await expect(page.locator('.empty-cast')).toHaveText('No matching characters');
	await expect(page.locator('.customize-action')).toBeDisabled();
	await page.keyboard.press('ArrowLeft');
	await page.keyboard.press('Enter');
	await expect(search).toBeFocused();
	await expect(page.getByRole('heading', { name: 'Characters', exact: true })).toBeVisible();
	await search.fill('Adventurer');
	await expect(page.locator('.character-row')).toHaveCount(1);
	await expect(page.locator('.customize-action')).toBeEnabled();
});

test.describe('selected cast centering', () => {
	test.use({ baseURL: `http://127.0.0.1:${process.env.DEV_PORT ?? '5298'}` });
	for (const theme of ['dark', 'light'] as const)
		for (const [width, height] of [
			[1920, 1080],
			[768, 1024],
			[390, 844],
			[844, 390]
		])
			test(`${theme} ${width}x${height}: one, two and three characters keep every selection centered`, async ({
				page
			}) => {
				await page.setViewportSize({ width, height });
				await landing(page);
				await page.evaluate(async (theme) => {
					const statePath = '/src/studio/state.svelte.ts',
						dbPath = '/src/lib/store/db.ts';
					const state = (await import(
						statePath
					)) as typeof import('../../src/studio/state.svelte.ts');
					const db = (await import(dbPath)) as typeof import('../../src/lib/store/db.ts');
					for (const [name, width, height] of [
						['Wide', 96, 64],
						['Tall', 48, 96]
					] as const) {
						const manifest = JSON.parse(
							JSON.stringify(state.store.project!.manifest)
						) as NonNullable<typeof state.store.project>['manifest'];
						const canvas = document.createElement('canvas');
						canvas.width = width;
						canvas.height = height;
						const context = canvas.getContext('2d')!;
						context.fillStyle = '#d08050';
						context.fillRect(width / 4, 4, width / 2, height - 12);
						const blob = await new Promise<Blob>((resolve) =>
							canvas.toBlob((blob) => resolve(blob!))
						);
						const hash = `sha256:cast-${name}` as const,
							id = `rig-cast-${name}`;
						const body = manifest.items.find((item) => item.id === manifest.rig.baseItem)!;
						body.regions = undefined;
						body.materials = [];
						body.baseHash = hash;
						body.layers = [{ id: 'main', role: 'fg', z: 0, cells: { walk: { south: [hash] } } }];
						manifest.name = `Center pair ${name}`;
						manifest.items = [body];
						manifest.materials = [];
						manifest.presets = [];
						manifest.rig.cell = { w: width, h: height };
						manifest.rig.pivot = { x: width / 2, y: height - 8 };
						manifest.rig.baseHash = hash;
						manifest.rig.rest = undefined;
						manifest.rig.directions = [{ id: 'south' }];
						manifest.rig.animations = [
							{
								...manifest.rig.animations[0],
								id: 'walk',
								cells: 1,
								frames: [{ cell: 0, ms: 400 }]
							}
						];
						await db.putCharacter(
							id,
							{ id, manifest, origin: 'studio', savedAt: new Date().toISOString() },
							new Map([[hash.slice(7), blob]])
						);
					}
					state.ui.theme = theme;
					await state.refreshProjects();
				}, theme);
				const search = page.getByRole('searchbox', { name: 'Search characters', exact: true });
				for (const [query, count] of [
					['Adventurer', 1],
					['Center pair', 2],
					['', 3]
				] as const) {
					await search.fill(query);
					await expect(page.locator('.character-row')).toHaveCount(count);
					await expect(page.locator('.character-row[aria-pressed="true"]')).toHaveCount(1);
					await expect(page.locator('.customize-action')).toBeEnabled();
					for (let index = 0; index < count; index++) {
						const row = page.locator('.character-row').nth(index);
						if ((await row.getAttribute('aria-pressed')) !== 'true') await row.click();
						await expect(row).toHaveAttribute('aria-pressed', 'true');
						await expect(page.locator('.customize-action')).toBeEnabled();
						await expect(page.locator('.cast-character')).toHaveCount(count);
						await expect
							.poll(
								() =>
									page.locator('.cast').evaluate((cast) => {
										const stage = cast.getBoundingClientRect();
										const selected = cast.querySelector('.chosen')!.getBoundingClientRect();
										const caption = document
											.querySelector('.selected-caption')!
											.getBoundingClientRect();
										const center = stage.left + stage.width / 2;
										return Math.max(
											Math.abs(selected.left + selected.width / 2 - center),
											Math.abs(caption.left + caption.width / 2 - center)
										);
									}),
								{
									message: `${count} characters, selection ${index}: selected cast aligns with its caption`
								}
							)
							.toBeLessThanOrEqual(1);
						await selection(page).focus();
						await page.keyboard.press('ArrowRight');
						await expect(page.locator('.character-row').nth((index + 1) % count)).toHaveAttribute(
							'aria-pressed',
							'true'
						);
						await expect(page.locator('.customize-action')).toBeEnabled();
					}
				}
			});
});

test('saved light appearance applies before the application module initializes', async ({
	page,
	context
}) => {
	await context.addInitScript(() => localStorage.setItem('pixeldoll.theme', 'light'));
	let release!: () => void;
	const held = new Promise<void>((resolve) => {
		release = resolve;
	});
	let blocked = 0;
	await context.route('**/*', async (route) => {
		const request = route.request();
		const path = new URL(request.url()).pathname;
		// Let synchronous head helpers finish parsing the page; hold the application modules.
		if (
			request.resourceType() === 'script' &&
			!path.endsWith('/appearance.js') &&
			!path.endsWith('/install.js')
		) {
			blocked++;
			await held;
		}
		await route.fallback().catch(() => {});
	});
	try {
		await page.goto('/', { waitUntil: 'commit' });
		await expect.poll(() => blocked).toBeGreaterThan(0);
		await expect(page.locator('html')).toHaveAttribute('data-theme', 'light');
		expect(await page.evaluate(() => document.documentElement.style.colorScheme)).toBe('light');
		await expect(page.locator('#startup-message').getByRole('status')).toHaveText(
			'Opening your workspace…'
		);
		await expect(page.getByRole('heading', { name: 'Characters', exact: true })).toHaveCount(0);
	} finally {
		release();
	}
	await expect(page.getByRole('heading', { name: 'Characters', exact: true })).toBeVisible();
	await expect(page.locator('#startup-message')).toHaveCount(0);
	await expect(page.locator('html')).toHaveAttribute('data-theme', 'light');
});

test.describe('two-finger equipment input', () => {
	test.use({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
	test('a second finger equips an item while the first continues moving', async ({
		page,
		context
	}) => {
		await landing(page);
		// The startup warning overlays part of the world until explicitly dismissed.
		await page.locator('.toast').getByRole('button', { name: 'Dismiss notification' }).click();
		await page.locator('.customize-action').click();
		await equipmentGroup(page, 'Head');
		await modes(page).getByRole('button', { name: 'Top-down', exact: true }).click();
		const box = (await world(page).boundingBox())!;
		const start = { x: box.x + 12, y: box.y + box.height / 2, id: 1 };
		const moving = { ...start, x: start.x + 42 };
		const hat = page.getByRole('button', { name: /^Wizard hat(,|$)/ });
		const target = (await hat.boundingBox())!;
		const second = { x: target.x + target.width / 2, y: target.y + target.height / 2, id: 2 };
		const cdp = await context.newCDPSession(page);
		const position = () =>
			world(page).evaluate((element) => Number(element.dataset.position!.split(',')[0]));
		try {
			await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [start] });
			await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [moving] });
			await expect.poll(position).toBeGreaterThan(5);
			const before = await position();
			await cdp.send('Input.dispatchTouchEvent', {
				type: 'touchStart',
				touchPoints: [moving, second]
			});
			await cdp.send('Input.dispatchTouchEvent', {
				type: 'touchMove',
				touchPoints: [moving, { ...second, x: second.x + 20 }]
			});
			await cdp.send('Input.dispatchTouchEvent', {
				type: 'touchEnd',
				touchPoints: [{ ...second, x: second.x + 20 }]
			});
			await expect(hat).toHaveAttribute('aria-pressed', 'false'); // A dragged second finger is not an equipment tap.
			await cdp.send('Input.dispatchTouchEvent', {
				type: 'touchStart',
				touchPoints: [moving, second]
			});
			await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [second] });
			await expect(hat).toHaveAttribute('aria-pressed', 'true');
			await expect.poll(position).toBeGreaterThan(before + 5);
			await expect(page.locator('.world-stick')).toBeVisible();
		} finally {
			await cdp.send('Input.dispatchTouchEvent', { type: 'touchCancel', touchPoints: [] });
			await cdp.detach();
		}
	});
});

// Desktop drives the stick with a mouse; the others use real touch through CDP. Sizes mirror MOTION.joystick.
for (const screen of [
	{ name: 'desktop', width: 1920, height: 1080, touch: false, theme: 'dark' },
	{ name: 'tablet portrait', width: 820, height: 1180, touch: true, theme: 'light' },
	{ name: 'phone portrait', width: 390, height: 844, touch: true, theme: 'dark' },
	{ name: 'phone landscape', width: 844, height: 390, touch: true, theme: 'light' },
	{ name: 'small phone', width: 320, height: 568, touch: true, theme: 'dark' }
] as const)
	test.describe(`world joystick on ${screen.name}`, () => {
		test.use({
			viewport: { width: screen.width, height: screen.height },
			isMobile: screen.touch,
			hasTouch: screen.touch
		});
		test('the thumb center stays on a circle, follows the finger and moves the character in both live views', async ({
			page,
			context
		}, testInfo) => {
			const compact = screen.width <= 360 || screen.height <= 400;
			const base = compact ? 128 : 144,
				thumb = compact ? 44 : 48,
				travel = (base - thumb) / 2 - 2;
			await context.addInitScript((theme) => {
				try {
					localStorage.setItem('pixeldoll.theme', theme);
				} catch {
					/* Opaque initial pages have no storage. */
				}
			}, screen.theme);
			await landing(page);
			await page.locator('.customize-action').click();
			const near = (actual: number, expected: number) =>
				expect(Math.abs(actual - expected)).toBeLessThan(1);
			const position = () =>
				world(page).evaluate((element) => element.dataset.position!.split(',').map(Number));
			// A blank world point with room for the whole base, nearest the stage center.
			const blank = () =>
				page.evaluate(
					(inset) => {
						const r = document.querySelector('.world-stage')!.getBoundingClientRect();
						const points: { x: number; y: number }[] = [];
						for (let y = r.top + inset; y <= r.bottom - inset; y += 8)
							for (let x = r.left + inset; x <= r.right - inset; x += 8) points.push({ x, y });
						const center = { x: r.left + r.width / 2, y: r.top + r.height / 2 };
						points.sort(
							(a, b) =>
								Math.hypot(a.x - center.x, a.y - center.y) -
								Math.hypot(b.x - center.x, b.y - center.y)
						);
						const found = points.find((p) =>
							document.elementFromPoint(p.x, p.y)?.classList.contains('world-input')
						);
						return found && { x: Math.round(found.x), y: Math.round(found.y) };
					},
					base / 2 + 4
				);
			const measure = () =>
				page.evaluate(() => {
					const stick = document.querySelector('.world-stick');
					if (!stick) return null;
					const knob = stick.querySelector('.joystick-thumb')!,
						b = stick.getBoundingClientRect(),
						t = knob.getBoundingClientRect();
					const probe = document.body.appendChild(document.createElement('i'));
					probe.style.background = 'var(--bu-accent)';
					const accent = getComputedStyle(probe).backgroundColor;
					probe.remove();
					return {
						base: { x: b.x + b.width / 2, y: b.y + b.height / 2, width: b.width, height: b.height },
						thumb: { x: t.x + t.width / 2, y: t.y + t.height / 2, width: t.width },
						inside:
							t.left >= b.left - 0.5 &&
							t.right <= b.right + 0.5 &&
							t.top >= b.top - 0.5 &&
							t.bottom <= b.bottom + 0.5,
						thumbEdge: getComputedStyle(knob).borderTopColor,
						trackShadow: getComputedStyle(stick).boxShadow,
						trackOutline: getComputedStyle(stick).outlineStyle,
						thumbShadow: getComputedStyle(knob).boxShadow,
						thumbOutline: getComputedStyle(knob).outlineStyle,
						accent
					};
				});
			const cdp = screen.touch ? await context.newCDPSession(page) : null;
			const press = async (type: 'down' | 'move' | 'up', x = 0, y = 0) => {
				if (cdp)
					await cdp.send('Input.dispatchTouchEvent', {
						type: type === 'down' ? 'touchStart' : type === 'move' ? 'touchMove' : 'touchEnd',
						touchPoints: type === 'up' ? [] : [{ x, y, id: 1 }]
					});
				else if (type === 'down') {
					await page.mouse.move(x, y);
					await page.mouse.down();
				} else if (type === 'move') await page.mouse.move(x, y, { steps: 4 });
				else await page.mouse.up();
			};
			let pressed = false;
			try {
				for (const view of ['Top-down', 'Side-scroller'] as const) {
					const side = view === 'Side-scroller';
					await modes(page).getByRole('button', { name: view, exact: true }).click();
					await expect(world(page)).toHaveAttribute('data-position', '0.00,0.00');
					// Notices overlay the world; clear them so the screenshot shows the whole stick.
					for (const dismiss of await page
						.getByRole('button', { name: 'Dismiss notification' })
						.all())
						if (await dismiss.isVisible()) await dismiss.click();
					const start = (await blank())!;
					expect(start, 'a blank world point fits the whole stick').toBeTruthy();
					await press('down', start.x, start.y);
					pressed = true;
					await expect(page.locator('.world-stick')).toBeVisible();
					// Measure after the entrance scale settles.
					await page.waitForFunction(
						() => document.querySelector('.world-stick')!.getAnimations().length === 0
					);
					let m = (await measure())!;
					near(m.base.width, base);
					near(m.base.height, side ? thumb + 4 : base);
					near(m.thumb.width, thumb);
					near(m.thumb.x, start.x);
					near(m.thumb.y, start.y);
					// Past full throw on a diagonal: the thumb stops inside the ring and the ring follows.
					const finger = side
						? { x: start.x - 100, y: start.y + 50 }
						: { x: start.x + 80, y: start.y - 80 };
					await press('move', (start.x + finger.x) / 2, (start.y + finger.y) / 2);
					await press('move', finger.x, finger.y);
					await expect.poll(async () => Math.round((await measure())!.thumb.x)).toBe(finger.x);
					m = (await measure())!;
					expect(m.inside).toBe(true);
					near(Math.hypot(m.thumb.x - m.base.x, m.thumb.y - m.base.y), travel);
					expect(m.thumbEdge, 'the thumb is outlined in the theme accent').toBe(m.accent);
					for (const treatment of [m.trackShadow, m.trackOutline, m.thumbShadow, m.thumbOutline])
						expect(treatment, 'the joystick has one edge without a halo, keyline or shadow').toBe(
							'none'
						);
					if (side) {
						near(m.thumb.y, start.y);
						near(m.base.y, start.y);
					} else near(m.thumb.y, finger.y);
					if (side) {
						await expect.poll(async () => (await position())[0]).toBeLessThan(-2);
						expect((await position())[1]).toBe(0);
					} else
						await expect
							.poll(async () => {
								const [x, y] = await position();
								return x > 2 && y > 2;
							})
							.toBe(true);
					await testInfo.attach(`${screen.name}, ${view}`, {
						body: await page.screenshot(),
						contentType: 'image/png'
					});
					await press('up');
					pressed = false;
					await expect(page.locator('.world-stick')).toHaveCount(0);
					const stopped = await position();
					await page.waitForTimeout(120);
					expect(await position()).toEqual(stopped);
				}
			} finally {
				if (pressed) await press('up');
				await cdp?.detach();
			}
		});
	});

test('category Random is one named undo step and Random look stays reachable on a 320 px phone', async ({
	page
}) => {
	await page.setViewportSize({ width: 1440, height: 900 });
	await customize(page);
	await pause(page);
	const undo = page.locator('.header-undo'),
		redo = page.locator('.header-redo');
	await expect(undo).toBeDisabled();
	await page.getByRole('button', { name: 'Random head item', exact: true }).click();
	await expect(undo).toHaveAccessibleName('Undo Random head item');
	await undo.click();
	await expect(undo).toBeDisabled();
	await expect(redo).toHaveAccessibleName('Redo Random head item');
	// The demo wears its only chest item: Random keeps it and re-rolls its colors, as one named undo step.
	const chestRandom = page.getByRole('button', { name: 'Random chest item', exact: true });
	await expect(chestRandom).toBeEnabled();
	await chestRandom.click();
	await expect(undo).toHaveAccessibleName('Undo Random chest item');
	await expect(
		page
			.locator('.equipment-scroll')
			.getByRole('button', { name: /^Leather vest/ })
			.first()
	).toHaveAttribute('aria-pressed', 'true');
	// Outfits: Cancel and Save hand focus back to the button that opened the name field.
	await equipmentMode(page, 'Outfits');
	const saveLook = page.getByRole('button', { name: 'Save current look', exact: true });
	await saveLook.click();
	await page.getByRole('button', { name: 'Cancel', exact: true }).click();
	await expect(saveLook).toBeFocused();
	await saveLook.click();
	await page.getByRole('textbox', { name: 'Outfit name', exact: true }).fill('Focus look');
	await page.getByRole('button', { name: 'Save', exact: true }).click();
	await expect(saveLook).toBeFocused();
	await equipmentMode(page, 'Wardrobe');

	// Phones move lower-frequency actions into More, so the character name stays whole.
	for (const width of [390, 320]) {
		await page.setViewportSize({ width, height: 568 });
		await expect
			.poll(() =>
				page.locator('.name-line .name-text').evaluate((h) => h.scrollWidth <= h.clientWidth)
			)
			.toBe(true);
	}
	await expect(page.locator('.header-random')).toBeHidden();
	await page.getByRole('button', { name: 'More options', exact: true }).click();
	const menu = page.locator('#experience-options');
	await menu.getByRole('button', { name: 'Random look', exact: true }).click();
	await expect(menu).toBeHidden();
	await page.getByRole('button', { name: 'More options', exact: true }).click();
	await expect(menu.getByRole('button', { name: 'Undo Random look', exact: true })).toBeEnabled();
	await page.keyboard.press('Escape');
});

/** Issues with the world image: element short of the screen, a gap or a stretched image. */
const worldIssues = (page: Page) =>
	page.locator('.scene-backdrop').evaluate((el) => {
		const style = getComputedStyle(el),
			box = el.getBoundingClientRect(),
			[w, h] = style.backgroundSize.split(' ').map(parseFloat),
			[x, y] = style.backgroundPosition.split(' ').map(parseFloat),
			issues: string[] = [];
		if (box.top > 0 || box.width < innerWidth) issues.push('element short of the screen');
		if (x > 0.5 || y > 0.5 || x + w < innerWidth - 0.5 || y + h < box.height - 0.5)
			issues.push('image gap');
		if (Math.abs(w / h - 1672 / 941) > 0.002) issues.push('stretched');
		return issues;
	});

// The geometry checks that experience.spec.ts only runs in its screenshot config, so main CI gates on them too.
for (const viewport of [
	{ width: 1440, height: 900 },
	{ width: 2560, height: 1080 },
	{ width: 1280, height: 720 },
	{ width: 390, height: 844 },
	{ width: 320, height: 568 },
	{ width: 320, height: 400 },
	{ width: 844, height: 390 }
])
	test(`${viewport.width}×${viewport.height} world covers the screen, the sheet and header follow the shared geometry`, async ({
		page
	}) => {
		await page.setViewportSize(viewport);
		await landing(page);
		// Characters: the world image covers the whole screen, uniformly scaled.
		expect(await worldIssues(page)).toEqual([]);
		expect(
			(await page.locator('.scene-backdrop').boundingBox())!.height,
			'Characters has no sheet to hide a gap'
		).toBeCloseTo(viewport.height, 0);
		await page.locator('.customize-action').click();
		await expect(page.getByRole('tablist', { name: 'Customization panels' })).toBeVisible();
		await pause(page);
		const g = layout(viewport.width, viewport.height, 'studio');
		// Customize: covered down to just under the sheet (or the whole screen beside a rail), never stretched.
		expect(await worldIssues(page)).toEqual([]);
		expect((await page.locator('.scene-backdrop').boundingBox())!.height).toBeCloseTo(
			g.sheet ? g.sheetTop + 24 : viewport.height,
			0
		);
		const rail = (await page.locator('.equipment-rail').boundingBox())!;
		if (g.sheet) expect(rail.height).toBeCloseTo(g.sheetHeight, 0);
		// Beside the stage, the panel and its slot rail run to the window's bottom edge (the lists pad their own margin).
		else {
			expect(rail.y + rail.height).toBeCloseTo(viewport.height, 0);
			const slots = await page.getByRole('navigation', { name: 'Equipment slots' }).boundingBox();
			if (slots) expect(slots.y + slots.height).toBeCloseTo(viewport.height, 0);
		}
		const header = (await page.locator('.experience-header').boundingBox())!;
		expect(header.y).toBeCloseTo(g.top, 0);
		expect(header.height).toBeCloseTo(g.row, 0);
		if (!g.phone && !g.short) {
			// The view switch prefers the character's center (the stage's middle); with too little room beside the name
			// and actions it stops at the nearest clear spot, never farther from the character than the window center.
			const views = (await page
				.getByRole('group', { name: 'Character view', exact: true })
				.boundingBox())!;
			const center = views.x + views.width / 2,
				stageCenter = (g.stage.l + g.stage.r) / 2;
			// Either on the character's center, or held 12 px from the name or the actions (font widths vary by platform).
			const edges = await page.evaluate(() => {
				const right = (sel: string) =>
					Math.max(
						...[...document.querySelector(sel)!.children].map(
							(e) => e.getBoundingClientRect().right
						)
					);
				const left = (sel: string) =>
					Math.min(
						...[...document.querySelector(sel)!.children]
							.map((e) => e.getBoundingClientRect())
							.filter((r) => r.width > 0)
							.map((r) => r.left)
					);
				return { start: right('.header-start'), end: left('.header-actions') };
			});
			const centered = Math.abs(center - stageCenter) < 1,
				againstStart = Math.abs(views.x - (edges.start + 12)) < 1.5,
				againstEnd = Math.abs(views.x + views.width - (edges.end - 12)) < 1.5;
			expect(centered || againstStart || againstEnd).toBe(true);
			expect(Math.abs(center - stageCenter)).toBeLessThanOrEqual(
				Math.abs(viewport.width / 2 - stageCenter) + 1
			);
		}
		// The playback bar sits between the stage and the panel.
		const playback = (await page.getByRole('toolbar', { name: 'Preview controls' }).boundingBox())!;
		expect(playback.y + playback.height).toBeLessThanOrEqual(g.sheet ? rail.y : viewport.height);
		expect(playback.x).toBeGreaterThanOrEqual(0);
		expect(playback.x + playback.width).toBeLessThanOrEqual(viewport.width);
	});

test('leaving a live view clears its sky so Preview never shows a stale one', async ({ page }) => {
	await customize(page);
	const painted = () =>
		page.locator('.world-sky').evaluate((canvas) => {
			const c = canvas as HTMLCanvasElement;
			if (!c.width || !c.height) return false;
			const data = c.getContext('2d')!.getImageData(0, 0, c.width, c.height).data;
			for (let i = 3; i < data.length; i += 4) if (data[i]) return true;
			return false;
		});
	const views = page.getByRole('group', { name: 'Character view', exact: true });
	await views.getByRole('button', { name: 'Top-down', exact: true }).click();
	await expect.poll(painted, { timeout: 10_000 }).toBe(true);
	await views.getByRole('button', { name: 'Preview', exact: true }).click();
	await expect.poll(painted).toBe(false);
	await views.getByRole('button', { name: 'Side-scroller', exact: true }).click();
	await expect.poll(painted, { timeout: 10_000 }).toBe(true);
	await views.getByRole('button', { name: 'Preview', exact: true }).click();
	await expect.poll(painted).toBe(false);
});

test('Moves stays in place, disabled with its reason, in the live views', async ({ page }) => {
	await customize(page);
	const tabs = page.getByRole('tablist', { name: 'Customization panels' });
	const moves = tabs.getByRole('tab', { name: 'Moves', exact: true });
	const before = (await moves.boundingBox())!;
	const views = page.getByRole('group', { name: 'Character view', exact: true });
	for (const view of ['Top-down', 'Side-scroller']) {
		await views.getByRole('button', { name: view, exact: true }).click();
		await expect(moves).toHaveAttribute('aria-disabled', 'true');
		await expect(moves).toHaveAccessibleDescription(/Moves are picked in Preview/);
		const box = (await moves.boundingBox())!;
		expect(Math.abs(box.x - before.x) + Math.abs(box.width - before.width)).toBeLessThan(1);
		// Playwright treats aria-disabled as not actionable; a person can still tap it and gets the reason.
		await moves.click({ force: true });
		await expect(moves).toHaveAttribute('aria-selected', 'false');
		await expect(page.locator('.toast')).toContainText('Moves are picked in Preview');
		// Arrow keys (which select) skip it.
		const outfits = tabs.getByRole('tab', { name: 'Outfits', exact: true });
		await outfits.click();
		await page.keyboard.press('ArrowRight');
		await expect(tabs.getByRole('tab', { name: 'Wardrobe', exact: true })).toBeFocused();
		// Tab still reaches it, so keyboard and screen reader users get its reason, and arrows step on from it without
		// selecting it.
		await outfits.click();
		await page.keyboard.press('Tab');
		await expect(moves).toBeFocused();
		await page.keyboard.press('ArrowLeft');
		await expect(outfits).toBeFocused();
		await expect(outfits).toHaveAttribute('aria-selected', 'true');
		// The reason sits outside the tab list, which may own only tabs.
		await expect(tabs.locator('#moves-tab-note')).toHaveCount(0);
	}
	// The live views explain a missing move in plain words, without diagnostics.
	await expect(page.locator('.world-notes')).not.toContainText('missing —');
	await views.getByRole('button', { name: 'Preview', exact: true }).click();
	await expect(moves).not.toHaveAttribute('aria-disabled', 'true');
});

test('short tab labels, the character name and sheet Done buttons keep 44 px targets', async ({
	page
}) => {
	await landing(page);
	expect((await page.locator('.selected-name').boundingBox())!.height).toBeGreaterThanOrEqual(44);
	await page.locator('.customize-action').click();
	const tabs = page.getByRole('tablist', { name: 'Customization panels' });
	await expect(tabs).toBeVisible();
	for (const box of await tabs
		.getByRole('tab')
		.evaluateAll((all) => all.map((tab) => tab.getBoundingClientRect().toJSON()))) {
		expect(box.width).toBeGreaterThanOrEqual(44);
		expect(box.height).toBeGreaterThanOrEqual(44);
	}
	// Equal-width tabs fill the row, and the slot rail ends flush with the tab bar's right edge.
	const row = await tabs.evaluate((el) => ({
		bar: el.getBoundingClientRect().toJSON(),
		widths: [...el.querySelectorAll('[role=tab]')].map((t) => t.getBoundingClientRect().width),
		rail: document.querySelector('.slot-rail')?.getBoundingClientRect().toJSON()
	}));
	expect(Math.max(...row.widths) - Math.min(...row.widths)).toBeLessThanOrEqual(1);
	expect(row.widths.reduce((a, b) => a + b, 0)).toBeCloseTo(row.bar.width, 0);
	if (row.rail) expect(row.rail.right).toBeCloseTo(row.bar.right, 0);
	await page.getByRole('button', { name: 'Inspect', exact: true }).click();
	const done = page
		.getByRole('dialog', { name: 'Inspect character', exact: true })
		.getByRole('button', { name: 'Done', exact: true });
	// The label stays compact; an invisible box answers presses 22 px around its center.
	expect(
		await done.evaluate((el) => {
			const r = el.getBoundingClientRect(),
				x = r.left + r.width / 2,
				y = r.top + r.height / 2;
			return [
				[x, y - 21],
				[x, y + 21],
				[x - 21, y],
				[x + 21, y]
			].every(([px, py]) => el.contains(document.elementFromPoint(px, py)));
		})
	).toBe(true);
});

test.describe('Preview facing lineup', () => {
	// The dev server serves the app's modules, so a check can give the demo character any set of directions.
	test.use({ baseURL: `http://127.0.0.1:${process.env.DEV_PORT ?? '5298'}` });

	test('wrapped Preview controls reserve their actual height above the panel', async ({ page }) => {
		await customize(page);
		await pause(page);
		await page.evaluate(async (directions) => {
			const path = '/src/studio/state.svelte.ts';
			const s = (await import(path)) as typeof import('../../src/studio/state.svelte.ts');
			const m = s.store.project!.manifest;
			const body = m.items.find((item) => item.id === m.rig.baseItem)!;
			m.items = [body];
			m.rig.directions = directions.map((id) => ({ id }));
			for (const layer of body.layers)
				for (const cells of Object.values(layer.cells ?? {}))
					for (const direction of directions) cells[direction] = cells.south;
			s.doc.items = {};
			s.store.project = { ...s.store.project!, manifest: { ...m } };
			s.doc.rev++;
		}, DIRECTIONS);
		const heights = new Set<number>();
		for (const theme of ['dark', 'light'] as const) {
			await page.evaluate(async (theme) => {
				const path = '/src/studio/state.svelte.ts';
				(await import(path)).ui.theme = theme;
			}, theme);
			for (const [width, height] of [
				[500, 700],
				[444, 700],
				[1000, 700],
				[500, 400],
				[320, 400],
				[390, 844],
				[844, 390],
				[1920, 1080],
				[500, 700]
			]) {
				await page.setViewportSize({ width, height });
				await expect(page.locator('.world-actors')).toHaveJSProperty('width', width);
				const controls = page.getByRole('toolbar', { name: 'Preview controls' });
				await expect
					.poll(
						async () => {
							const bar = (await controls.boundingBox())!;
							const top = await page
								.locator('.experience')
								.evaluate((element) =>
									Number.parseFloat(getComputedStyle(element).getPropertyValue('--playback-top'))
								);
							return Math.abs(top - bar.y);
						},
						{ message: `${theme} ${width}×${height}: geometry tracks the wrapped toolbar` }
					)
					.toBeLessThanOrEqual(1);
				const bar = (await controls.boundingBox())!;
				heights.add(Math.round(bar.height));
				const bottom = await page.locator('.world-actors').evaluate((canvas: HTMLCanvasElement) => {
					const data = canvas
						.getContext('2d')!
						.getImageData(0, 0, canvas.width, canvas.height).data;
					let bottom = 0;
					for (let offset = 3; offset < data.length; offset += 4)
						if (data[offset] > 128)
							bottom = Math.max(bottom, Math.floor(offset / 4 / canvas.width) + 1);
					return bottom / (canvas.width / innerWidth);
				});
				expect(
					bottom,
					`${theme} ${width}×${height}: characters and rings clear controls`
				).toBeLessThanOrEqual(bar.y - 8);
				const panel = await page.locator('.equipment-rail').boundingBox();
				if (panel && panel.width > width / 2)
					expect(
						bar.y + bar.height,
						`${theme} ${width}×${height}: controls clear the sheet`
					).toBeLessThanOrEqual(panel.y - 8);
				for (const box of await controls
					.getByRole('button')
					.evaluateAll((buttons) =>
						buttons
							.filter((button) => button.getClientRects().length)
							.map((button) => button.getBoundingClientRect().toJSON())
					)) {
					expect(box.width).toBeGreaterThanOrEqual(44);
					expect(box.height).toBeGreaterThanOrEqual(44);
				}
			}
		}
		expect([...heights].some((height) => height >= 100)).toBe(true);
		expect([...heights].some((height) => height >= 146)).toBe(true);
		expect(heights.has(54)).toBe(true);
		const views = page.getByRole('group', { name: 'Character view', exact: true });
		for (const mode of ['Top-down', 'Side-scroller', 'Preview']) {
			await views.getByRole('button', { name: mode, exact: true }).click();
			const expected =
				mode === 'Preview'
					? (await page.getByRole('toolbar', { name: 'Preview controls' }).boundingBox())!.height
					: 54;
			await expect
				.poll(() =>
					page
						.locator('.experience')
						.evaluate((element) =>
							Number.parseFloat(getComputedStyle(element).getPropertyValue('--playback-height'))
						)
				)
				.toBe(expected);
		}
	});

	for (const density of [1, 2])
		test.describe(`floor rings at DPR ${density}`, () => {
			test.use({ deviceScaleFactor: density });
			test('grounds offset body art on the selected ring in every direction', async ({ page }) => {
				await page.setViewportSize({ width: 1920, height: 1080 });
				await customize(page);
				await pause(page);
				const directions = [
					'south',
					'south-east',
					'east',
					'north-east',
					'north',
					'north-west',
					'west',
					'south-west'
				] as const;
				await page.evaluate(async (directions) => {
					const path = '/src/studio/state.svelte.ts';
					const s = (await import(path)) as typeof import('../../src/studio/state.svelte.ts');
					const project = s.store.project!,
						m = project.manifest;
					const body = m.items.find((item) => item.id === m.rig.baseItem)!;
					m.items = [body];
					m.rig.cell = { w: 64, h: 64 };
					m.rig.pivot = { x: 32, y: 56 };
					m.rig.rest = undefined;
					m.rig.directions = directions.map((id) => ({ id }));
					m.rig.animations = [
						{ ...m.rig.animations[0], id: 'walk', cells: 1, frames: [{ cell: 0, ms: 400 }] }
					];
					body.regions = undefined;
					body.materials = [];
					body.layers = [{ id: 'main', role: 'fg', z: 0, cells: { walk: {} } }];
					for (const [index, direction] of directions.entries()) {
						const hash = `sha256:offset-${direction}` as const;
						const data = new Uint8ClampedArray(64 * 64 * 4);
						const left = 5 + index * 5,
							bottom = 44 + index * 2;
						for (let row = bottom - (24 + index * 3); row < bottom; row++)
							for (let column = left; column < left + 12; column++)
								data.set([31 + index * 20, 47, 233, 255], (row * 64 + column) * 4);
						project.images.set(hash, { w: 64, h: 64, data });
						body.layers[0].cells!.walk[direction] = [hash];
					}
					s.doc.items = {};
					s.ui.anim = 'walk';
					s.ui.dir = 'south';
					s.ui.frame = 0;
					s.doc.rev++;
					const ellipse = CanvasRenderingContext2D.prototype.ellipse;
					CanvasRenderingContext2D.prototype.ellipse = function (...args) {
						if (
							this.canvas.classList.contains('world-actors') &&
							(Math.abs(this.globalAlpha - 0.85) < 0.01 || Math.abs(this.globalAlpha - 0.3) < 0.01)
						)
							this.canvas.dataset[this.globalAlpha > 0.5 ? 'groundRing' : 'hoverRing'] =
								JSON.stringify({
									x: args[0],
									y: args[1],
									ry: args[3],
									direction: s.ui.dir
								});
						return ellipse.apply(this, args);
					};
				}, directions);
				for (const [index, direction] of directions.entries()) {
					await page.evaluate(async (direction) => {
						const path = '/src/studio/state.svelte.ts';
						(await import(path)).ui.dir = direction;
					}, direction);
					await expect(world(page)).toHaveAttribute('data-facing', direction);
					await expect
						.poll(
							() =>
								page.locator('.world-actors').evaluate((canvas: HTMLCanvasElement, index) => {
									const ring = JSON.parse(canvas.dataset.groundRing ?? 'null');
									const pixels = canvas
										.getContext('2d')!
										.getImageData(0, 0, canvas.width, canvas.height).data;
									let left = Infinity,
										right = -Infinity,
										top = Infinity,
										bottom = -Infinity;
									for (let offset = 0; offset < pixels.length; offset += 4) {
										if (
											pixels[offset] !== 31 + index * 20 ||
											pixels[offset + 1] !== 47 ||
											pixels[offset + 2] !== 233 ||
											pixels[offset + 3] !== 255
										)
											continue;
										const column = (offset / 4) % canvas.width,
											row = Math.floor(offset / 4 / canvas.width);
										left = Math.min(left, column);
										right = Math.max(right, column + 1);
										top = Math.min(top, row);
										bottom = Math.max(bottom, row + 1);
									}
									const density = canvas.width / innerWidth;
									const rise =
										ring &&
										Math.floor(Math.min((bottom - top) / density / 32, ring.ry / 2) * density) /
											density;
									return (
										ring &&
										ring.direction ===
											document.querySelector('.world-stage')?.getAttribute('data-facing') &&
										Math.abs((left + right) / 2 / density - ring.x) <= 1 &&
										rise > 0 &&
										Math.abs(bottom / density - ring.y - rise) <= 1 / density &&
										ring.y + ring.ry > bottom / density
									);
								}, index),
							{ message: `${direction}: centered ring rises conservatively into the feet` }
						)
						.toBe(true);
					const companion = await page
						.locator('.world-actors')
						.evaluate((canvas: HTMLCanvasElement, selectedIndex) => {
							const pixels = canvas
								.getContext('2d')!
								.getImageData(0, 0, canvas.width, canvas.height).data;
							let target = -1,
								left = Infinity,
								right = -Infinity,
								top = Infinity,
								bottom = -Infinity;
							for (let offset = 0; offset < pixels.length; offset += 4) {
								const index = (pixels[offset] - 31) / 20;
								if (
									!Number.isInteger(index) ||
									index < 0 ||
									index > 7 ||
									index === selectedIndex ||
									pixels[offset + 1] !== 47 ||
									pixels[offset + 2] !== 233 ||
									pixels[offset + 3] !== 255
								)
									continue;
								if (target < 0) target = index;
								if (target !== index) continue;
								const column = (offset / 4) % canvas.width,
									row = Math.floor(offset / 4 / canvas.width);
								left = Math.min(left, column);
								right = Math.max(right, column + 1);
								top = Math.min(top, row);
								bottom = Math.max(bottom, row + 1);
							}
							const density = canvas.width / innerWidth;
							return {
								target,
								x: (left + right) / 2 / density,
								y: (top + bottom) / 2 / density,
								bottom: bottom / density,
								height: (bottom - top) / density,
								density
							};
						}, index);
					expect(companion.target).toBeGreaterThanOrEqual(0);
					await page.mouse.move(companion.x, companion.y);
					await expect(world(page)).toHaveClass(/\bpick\b/);
					await expect
						.poll(
							() =>
								page.locator('.world-actors').evaluate((canvas, companion) => {
									const ring = JSON.parse(
										(canvas as HTMLCanvasElement).dataset.hoverRing ?? 'null'
									);
									const rise =
										ring &&
										Math.floor(Math.min(companion.height / 32, ring.ry / 2) * companion.density) /
											companion.density;
									return (
										ring &&
										Math.abs(ring.x - companion.x) <= 1 &&
										rise > 0 &&
										Math.abs(companion.bottom - ring.y - rise) <= 1 / companion.density
									);
								}, companion),
							{ message: `${direction}: companion hover uses its own standing height` }
						)
						.toBe(true);
					await page.mouse.move(0, 0);
				}
			});
		});

	test('renders synchronized companions, selects them, and reports incomplete gear', async ({
		page
	}) => {
		await page.setViewportSize({ width: 1920, height: 1080 });
		await customize(page);
		await pause(page);
		await page.evaluate(async () => {
			const path = '/src/studio/state.svelte.ts',
				s = (await import(path)) as typeof import('../../src/studio/state.svelte.ts');
			const project = s.store.project!,
				m = project.manifest,
				base = m.items.find((item) => item.id === m.rig.baseItem)!,
				layer = base.layers[0];
			m.rig.directions = [{ id: 'south' }, { id: 'north' }, { id: 'east' }];
			m.rig.animations = [
				{
					...m.rig.animations[0],
					id: 'walk',
					cells: 2,
					frames: [
						{ cell: 0, ms: 400 },
						{ cell: 1, ms: 400 }
					]
				}
			];
			base.regions = undefined;
			base.materials = [];
			base.layers = [layer];
			layer.cells = { walk: {} };
			for (const [index, direction] of (['south', 'north', 'east'] as const).entries()) {
				layer.cells.walk[direction] = [];
				for (let cell = 0; cell < 2; cell++) {
					const hash = `sha256:lineup-${direction}-${cell}` as const,
						{ w, h } = m.rig.cell,
						data = new Uint8ClampedArray(w * h * 4);
					for (let row = m.rig.pivot.y - 40; row < m.rig.pivot.y; row++)
						for (let column = m.rig.pivot.x - 10; column < m.rig.pivot.x + 10; column++)
							data.set([31 + index * 60, 47 + cell * 100, 233, 255], (row * w + column) * 4);
					project.images.set(hash, { w, h, data });
					layer.cells.walk[direction]!.push(hash);
				}
			}
			m.items = [base];
			s.doc.items = {};
			s.ui.anim = 'walk';
			s.ui.dir = 'south';
			s.ui.frame = 0;
			s.doc.rev++;
		});
		const painted = () =>
			page.locator('.world-actors').evaluate((canvas: HTMLCanvasElement) => {
				const data = canvas.getContext('2d')!.getImageData(0, 0, canvas.width, canvas.height).data,
					boxes = [0, 1, 2].map(() => ({
						left: Infinity,
						right: -Infinity,
						top: Infinity,
						bottom: -Infinity,
						cells: [] as number[]
					}));
				for (let offset = 0; offset < data.length; offset += 4) {
					const index = (data[offset] - 31) / 60,
						cell = (data[offset + 1] - 47) / 100;
					if (
						!Number.isInteger(index) ||
						index < 0 ||
						index > 2 ||
						![0, 1].includes(cell) ||
						data[offset + 2] !== 233 ||
						data[offset + 3] !== 255
					)
						continue;
					const box = boxes[index],
						column = (offset / 4) % canvas.width,
						row = Math.floor(offset / 4 / canvas.width);
					box.left = Math.min(box.left, column);
					box.right = Math.max(box.right, column);
					box.top = Math.min(box.top, row);
					box.bottom = Math.max(box.bottom, row);
					if (!box.cells.includes(cell)) box.cells.push(cell);
				}
				return boxes;
			});
		await expect
			.poll(async () => (await painted()).map((box) => box.cells))
			.toEqual([[0], [0], [0]]);
		const boxes = await painted();
		for (const box of boxes) expect(box.right - box.left).toBeGreaterThan(20);
		const ordered = [...boxes].sort((before, after) => before.left - after.left);
		for (let index = 1; index < ordered.length; index++)
			expect(ordered[index].left).toBeGreaterThan(ordered[index - 1].right);
		await world(page).focus();
		await page.keyboard.press('.');
		await expect
			.poll(async () => (await painted()).map((box) => box.cells))
			.toEqual([[1], [1], [1]]);
		await page.getByRole('button', { name: 'Play', exact: true }).click();
		await expect
			.poll(async () => (await painted()).map((box) => box.cells))
			.toEqual([[0], [0], [0]]);
		await pause(page);
		const north = boxes[1],
			pointer = { x: (north.left + north.right) / 2, y: (north.top + north.bottom) / 2 };
		await page.mouse.move(pointer.x, pointer.y);
		await expect(world(page)).toHaveClass(/\bpick\b/);
		await page.mouse.click(pointer.x, pointer.y);
		await expect(world(page)).toHaveAttribute('data-facing', 'north');
		await page.getByRole('button', { name: 'Characters', exact: true }).hover();
		await expect(world(page)).not.toHaveClass(/\bpick\b/);
		await page.mouse.move(pointer.x, pointer.y);
		await world(page).focus();
		await page.keyboard.press('2');
		await expect(world(page)).not.toHaveClass(/\bpick\b/);
		await page.keyboard.press('1');
		await page.evaluate(async () => {
			const path = '/src/studio/state.svelte.ts',
				s = (await import(path)) as typeof import('../../src/studio/state.svelte.ts');
			const m = s.store.project!.manifest,
				base = m.items[0];
			m.items.push({
				...base,
				id: 'lineup-hat',
				name: 'Lineup hat',
				slot: 'head',
				coverage: ['walk/south/0', 'walk/south/1'],
				layers: [{ ...base.layers[0], cells: { walk: { south: [null, null] } } }]
			});
			s.doc.items = { head: 'lineup-hat' };
			s.ui.dir = 'south';
			s.doc.rev++;
		});
		await expect(world(page)).toHaveAttribute('data-facing', 'south');
		await expect(page.locator('.world-coverage')).toContainText('missing walk / North frames');
		await expect(page.locator('.world-coverage')).toContainText('missing walk / East frames');
		await page.evaluate(async () => {
			const path = '/src/studio/state.svelte.ts',
				s = (await import(path)) as typeof import('../../src/studio/state.svelte.ts');
			s.store.project!.manifest.items[1].pending = ['walk/north/0', 'walk/east/0'];
			s.doc.rev++;
		});
		await expect(page.locator('.world-loading-items')).toContainText('Lineup hat loading');
		await expect(page.locator('.world-loading-items')).toContainText('North, East');
		await expect(page.locator('.world-coverage').filter({ hasText: 'missing walk' })).toHaveCount(
			0
		);
	});

	type Rig = [DirectionName, DirectionName?][];
	const sets: [string, Rig][] = [
		['one direction', [['south']]],
		['side-scroller', [['east'], ['west', 'east']]],
		['front and back', [['south'], ['north']]],
		['three directions', [['south'], ['east'], ['north']]],
		['top-down 4', [['south'], ['east'], ['north'], ['west', 'east']]],
		[
			'diagonal 4',
			[['south-east'], ['north-east'], ['south-west', 'south-east'], ['north-west', 'north-east']]
		],
		['five directions', [['south'], ['south-east'], ['east'], ['north-east'], ['north']]],
		['six directions', [['south'], ['south-east'], ['east'], ['north-east'], ['north'], ['west']]],
		[
			'seven directions',
			[['south'], ['south-east'], ['east'], ['north-east'], ['north'], ['west'], ['south-west']]
		],
		[
			'top-down 8',
			[
				['south'],
				['south-east'],
				['east'],
				['north-east'],
				['north'],
				['north-west', 'north-east'],
				['west', 'east'],
				['south-west', 'south-east']
			]
		],
		[
			'unique 8',
			[
				['south'],
				['south-east'],
				['east'],
				['north-east'],
				['north'],
				['north-west'],
				['west'],
				['south-west']
			]
		]
	];
	// Ultra-wide to phones, landscape and portrait.
	const sizes = [
		[3440, 1440],
		[2560, 1440],
		[1920, 1080],
		[1440, 900],
		[1366, 768],
		[1024, 1366],
		[768, 1024],
		[844, 390],
		[390, 844]
	] as const;

	for (const [name, rig] of sets)
		test(`${name}: every selection shows the preferred facings that fit, inside the stage`, async ({
			page
		}) => {
			test.slow();
			await customize(page);
			await pause(page);
			const available = rig.map(([id]) => id);
			// Directions the demo lacks reuse a drawn facing's cells, so each one plays a real move.
			await page.evaluate(async (rig) => {
				const path = '/src/studio/state.svelte.ts',
					s = (await import(path)) as typeof import('../../src/studio/state.svelte.ts');
				const m = s.store.project!.manifest,
					drawn: Record<string, string> = {
						'south-east': 'south',
						'south-west': 'south',
						'north-east': 'north',
						'north-west': 'north',
						west: 'east'
					};
				for (const item of m.items)
					for (const layer of item.layers)
						for (const directions of Object.values(layer.cells ?? {}) as Record<string, unknown>[])
							for (const [direction, from] of Object.entries(drawn))
								directions[direction] ??= directions[from];
				m.rig.directions = rig.map(([id, mirrorOf]) => (mirrorOf ? { id, mirrorOf } : { id }));
				s.store.project = { ...s.store.project!, manifest: { ...m } };
				s.ui.dir = rig[0][0];
				s.doc.rev++;
			}, rig);
			await expect(
				page.getByRole('group', { name: 'Direction', exact: true }).getByRole('button')
			).toHaveCount(available.length);
			const counts = new Map<string, number>();
			await page.evaluate(() => {
				const ellipse = CanvasRenderingContext2D.prototype.ellipse;
				CanvasRenderingContext2D.prototype.ellipse = function (...args) {
					if (
						this.canvas.classList.contains('world-actors') &&
						Math.abs(this.globalAlpha - 0.85) < 0.01
					) {
						this.canvas.dataset.targetX = String(args[0]);
						this.canvas.dataset.targetDirection =
							document.querySelector('.world-stage')?.getAttribute('data-facing') ?? '';
					}
					return ellipse.apply(this, args);
				};
			});
			for (const [width, height] of sizes) {
				await page.setViewportSize({ width, height });
				const targets = new Map<number, number>();
				for (const selected of available) {
					await page.evaluate(async (dir) => {
						const path = '/src/studio/state.svelte.ts';
						(await import(path)).ui.dir = dir;
					}, selected);
					await expect(world(page)).toHaveAttribute('data-facing', selected);
					await expect
						.poll(async () =>
							((await world(page).getAttribute('data-lineup')) ?? '').split(' ').includes(selected)
						)
						.toBe(true);
					const shown = ((await world(page).getAttribute('data-lineup')) ?? '').split(' ');
					const label = `${name} at ${width}×${height}, ${selected} selected`;
					expect(shown, label).toEqual(pickFacings(available, selected, shown.length));
					expect(shown.indexOf(selected), label).toBe(focalSlot(shown.length));
					if (shown.length > 1) {
						const canvas = page.locator('.world-actors');
						await expect(canvas).toHaveAttribute('data-target-direction', selected);
						const target = Number(await canvas.getAttribute('data-target-x'));
						const controls = await page
							.getByRole('toolbar', { name: 'Preview controls' })
							.boundingBox();
						if (shown.length % 2)
							expect(
								Math.abs(target - controls!.x - controls!.width / 2),
								label
							).toBeLessThanOrEqual(1);
						else expect(target, label).toBeLessThan(controls!.x + controls!.width / 2);
						if (targets.has(shown.length)) expect(target, label).toBe(targets.get(shown.length));
						else targets.set(shown.length, target);
					}
					counts.set(
						`${width}×${height}`,
						Math.max(counts.get(`${width}×${height}`) ?? 0, shown.length)
					);
				}
				// Nothing is drawn past the stage: the row never reaches under the panel or off screen.
				const g = layout(width, height, 'studio');
				const painted = await page
					.locator('.world-actors')
					.evaluate((canvas: HTMLCanvasElement) => {
						const c = canvas.getContext('2d')!,
							data = c.getImageData(0, 0, canvas.width, canvas.height).data,
							scale = canvas.width / innerWidth;
						let left = Infinity,
							right = -Infinity,
							bottom = -Infinity;
						for (let y = 0; y < canvas.height; y++)
							for (let x = 0; x < canvas.width; x++)
								if (data[(y * canvas.width + x) * 4 + 3]) {
									left = Math.min(left, x / scale);
									right = Math.max(right, (x + 1) / scale);
									// The faint reflection aside, the lowest solid pixel: the ring, or the feet without one.
									if (data[(y * canvas.width + x) * 4 + 3] > 128)
										bottom = Math.max(bottom, (y + 1) / scale);
								}
						return { left, right, bottom };
					});
				expect(painted.left, `${name} at ${width}×${height}`).toBeGreaterThanOrEqual(g.stage.l);
				expect(painted.right, `${name} at ${width}×${height}`).toBeLessThanOrEqual(g.stage.r);
				// The floor ring keeps clear space above the playback bar.
				const bar = (await page.getByRole('toolbar', { name: 'Preview controls' }).boundingBox())!;
				const gap =
					((await world(page).getAttribute('data-lineup')) ?? '').split(' ').length > 1 ? 12 : 8;
				expect(painted.bottom, `${name} at ${width}×${height}`).toBeLessThanOrEqual(bar.y - gap);
			}
			const capacity = pickFacings(available, available[0], 5).length;
			// Wide windows show a lineup whenever the character has a second facing to show; it never grows as
			// the window narrows.
			if (capacity > 1) expect(counts.get('1920×1080')).toBeGreaterThan(1);
			const widths = ['3440×1440', '2560×1440', '1920×1080', '1366×768'].map((k) => counts.get(k)!);
			for (let i = 1; i < widths.length; i++) expect(widths[i]).toBeLessThanOrEqual(widths[i - 1]);
		});
});
