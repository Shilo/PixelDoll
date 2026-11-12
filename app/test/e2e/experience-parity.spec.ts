import { expect, test, type Page } from '@playwright/test';
import { readFile } from 'node:fs/promises';
import { equipmentGroup, equipmentMode } from './immersive-helpers.ts';
import { layout } from '../../src/studio/experience/geometry.ts';
import { focalSlot, pickFacings } from '../../src/studio/experience/lineup.ts';
import type { DirectionName } from '../../src/lib/rig/rig.ts';
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
	const create = page.getByRole('button', { name: 'New character', exact: true });
	await create.focus();
	await page.keyboard.press('Enter');
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
	await page.getByRole('menuitem', { name: 'Import character…', exact: true }).click();
	const importing = page.getByRole('dialog', { name: 'Import character', exact: true });
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
	await move.selectOption('right_punch');
	await expect(move).toHaveValue('right_punch');
	await move.selectOption('right-punch');
	await expect(move).toHaveValue('right-punch');
	await move.selectOption(longId);
	await expect(move).toHaveAttribute('title', longLabel);
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

test('selection wheel normalizes deltas, discards bursts and stale fractions, and preserves modified gestures', async ({
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
		await page.getByRole('menuitem', { name: 'Import character…', exact: true }).click();
		const dialog = page.getByRole('dialog', { name: 'Import character', exact: true });
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
	const wheel = (
		deltaY: number,
		init: { deltaMode?: number; deltaX?: number; shiftKey?: boolean; ctrlKey?: boolean } = {}
	) =>
		page.evaluate(
			({ deltaY, init }) =>
				!window.dispatchEvent(new WheelEvent('wheel', { deltaY, cancelable: true, ...init })),
			{ deltaY, init }
		);
	for (const init of [{ shiftKey: true }, { ctrlKey: true }, { deltaX: 120 }])
		expect(await wheel(60, init)).toBe(false);
	expect(await selected()).toBe(index);
	// The approved cooldown and fraction window are both 180 ms. Page time is held still (the handler reads only performance.now),
	// so each event lands at an exact time however slow loads or round trips are, and reports whether it started a character
	// load (Customize is disabled while loading). A step selects asynchronously, so final indices alone can mask a wrong step.
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
				window.dispatchEvent(new WheelEvent('wheel', { deltaY, deltaMode, cancelable: true }));
				await new Promise((resolve) => setTimeout(resolve));
				return document.querySelector<HTMLButtonElement>('.customize-action')!.disabled;
			},
			{ t, deltaY, deltaMode }
		);
	const step = async (delta: number) => {
		index = (index + delta + 3) % 3;
		await expect.poll(selected).toBe(index);
		await expect(page.locator('.customize-action')).toBeEnabled();
	};
	expect(await at(0, 3, 1)).toBe(true);
	await step(1); // lines × 16 px
	expect(await at(300, -40)).toBe(true);
	await step(-1);
	expect(await at(600, 20)).toBe(false);
	expect(await at(800, 20)).toBe(false); // a fraction older than 180 ms is discarded
	expect(await at(900, 20)).toBe(true);
	await step(1); // fractions inside 180 ms add up to 40
	expect(await at(1200, 30)).toBe(false);
	expect(await at(1210, -30)).toBe(false); // a sign change restarts the fraction
	expect(await at(1220, -10)).toBe(true);
	await step(-1);
	expect(await at(1500, -30)).toBe(false); // below the threshold in the negative direction too
	expect(await at(1800, 40)).toBe(true);
	await step(1);
	expect(await at(1900, 120)).toBe(false); // inside the cooldown even a full burst is discarded
	expect(await at(1990, 30)).toBe(false); // and leaves no fraction behind (30 alone, not 150)
	expect(await at(2300, 1, 2)).toBe(true);
	await step(1); // pages × viewport height
	await page.getByRole('button', { name: 'More options', exact: true }).click();
	expect(await wheel(120)).toBe(false);
	expect(await selected()).toBe(index);
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
				s.ui.dir = rig[0][0];
				s.doc.rev++;
			}, rig);
			const counts = new Map<string, number>();
			for (const [width, height] of sizes) {
				await page.setViewportSize({ width, height });
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
							right = -Infinity;
						for (let y = 0; y < canvas.height; y++)
							for (let x = 0; x < canvas.width; x++)
								if (data[(y * canvas.width + x) * 4 + 3]) {
									left = Math.min(left, x / scale);
									right = Math.max(right, (x + 1) / scale);
								}
						return { left, right };
					});
				expect(painted.left, `${name} at ${width}×${height}`).toBeGreaterThanOrEqual(g.stage.l);
				expect(painted.right, `${name} at ${width}×${height}`).toBeLessThanOrEqual(g.stage.r);
			}
			const capacity = pickFacings(available, available[0], 5).length;
			// Wide windows show a lineup whenever the character has a second facing to show; it never grows as
			// the window narrows.
			if (capacity > 1) expect(counts.get('1920×1080')).toBeGreaterThan(1);
			const widths = ['3440×1440', '2560×1440', '1920×1080', '1366×768'].map((k) => counts.get(k)!);
			for (let i = 1; i < widths.length; i++) expect(widths[i]).toBeLessThanOrEqual(widths[i - 1]);
		});
});
