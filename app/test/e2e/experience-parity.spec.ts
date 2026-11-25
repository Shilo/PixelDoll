import { expect, test, type Page } from '@playwright/test';
import { readFile } from 'node:fs/promises';
import {
	equipmentGroup,
	equipmentMode,
	openPlaybackPicker,
	playbackPicker,
	selectPlaybackClip
} from './immersive-helpers.ts';
import { layout } from '../../src/studio/experience/geometry.ts';
import { focalSlot, pickFacings } from '../../src/studio/experience/lineup.ts';
import { DIRECTIONS, type DirectionName } from '../../src/lib/rig/rig.ts';
import { zip } from '../../src/lib/store/zip.ts';
import { makeImg } from '../../src/lib/image/png.ts';
import { decodePngBytes, encodePngBytes } from '../../src/lib/image/pngraw.ts';

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

async function landing(page: Page, url = '/') {
	await page.goto(url);
	await expect(page.locator('.customize-action')).toBeEnabled();
}

/** The character search shows once the list overflows or holds six or more characters; short fixtures make it scroll. */
async function revealCharacterSearch(page: Page) {
	const search = page.getByRole('searchbox', { name: 'Search characters', exact: true });
	if (!(await search.count()))
		await page.locator('.character-rows').evaluate((list) => {
			(list as HTMLElement).style.maxHeight = '40px';
		});
	await expect(search).toBeVisible();
	return search;
}

test('rapid clicks operate controls without selecting their labels', async ({ page }) => {
	await landing(page);
	await page.locator('.customize-action').click();
	const selected = () => page.evaluate(() => window.getSelection()?.toString());
	const wardrobe = page.getByRole('tab', { name: 'Wardrobe', exact: true });
	await expect(wardrobe).toHaveCSS('user-select', 'none');
	await wardrobe.getByText('Wardrobe', { exact: true }).dblclick();
	await expect(wardrobe).toHaveAttribute('aria-selected', 'true');
	expect(await selected()).toBe('');

	await page.getByRole('button', { name: 'More options', exact: true }).click();
	await page.getByRole('button', { name: 'Connect PixelLab...', exact: true }).click();
	const dialog = page.getByRole('dialog', { name: 'Connect PixelLab', exact: true });
	const remember = dialog.getByRole('checkbox', { name: 'Remember on this device' });
	const label = dialog.getByText('Remember on this device', { exact: true });
	const initial = await remember.isChecked();
	await remember.evaluate((control: HTMLInputElement) => {
		let changes = 0;
		control.addEventListener('change', () => (control.dataset.testChanges = String(++changes)));
	});
	await label.dblclick();
	expect(await selected()).toBe('');
	await expect(remember).toHaveAttribute('data-test-changes', '2');
	await expect(remember).toBeChecked({ checked: initial });
	await label.click();
	await expect(remember).toBeChecked({ checked: !initial });
	await remember.press('Space');
	await expect(remember).toBeChecked({ checked: initial });

	await dialog
		.getByText('Paste your Secret API key', { exact: true })
		.dblclick({ position: { x: 12, y: 8 } });
	expect(await selected()).toMatch(/^Paste\s*$/);
	const key = dialog.getByLabel('Paste your Secret API key', { exact: true });
	await key.fill('synthetic-key');
	await key.press('ControlOrMeta+a');
	expect(
		await key.evaluate((input: HTMLInputElement) => [input.selectionStart, input.selectionEnd])
	).toEqual([0, 'synthetic-key'.length]);
	const notice = dialog.getByRole('link', { name: /Powered by PixelLab/ });
	await expect(notice).toBeVisible();
	await expect(notice).not.toHaveCSS('user-select', 'none');
	await page.keyboard.press('Escape');

	await page.getByRole('button', { name: 'Export', exact: true }).click();
	const exportDialog = page.getByRole('dialog', { name: 'Export', exact: true });
	await expect(exportDialog.getByRole('radio', { name: 'PNG + JSON', exact: true })).toBeChecked();
	const godotLabel = exportDialog
		.getByRole('group', { name: 'Export format', exact: true })
		.getByText('Godot', { exact: true });
	await godotLabel.dblclick();
	await expect(exportDialog.getByRole('radio', { name: 'Godot', exact: true })).toBeChecked();
	expect(await selected()).toBe('');
	const files = exportDialog.locator('details', { hasText: 'Files included' });
	const summary = files.locator('summary');
	await expect(summary).toHaveCSS('user-select', 'none');
	await summary.dblclick({ position: { x: 30, y: 12 } });
	await expect(files).not.toHaveAttribute('open');
	expect(await selected()).toBe('');
	await summary.press('Enter');
	await expect(files).toHaveAttribute('open', '');
	const names = files.locator('pre');
	await expect(names).toBeVisible();
	await names.dblclick({ position: { x: 12, y: 8 } });
	expect((await selected())?.trim()).toBeTruthy();
});

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

test('character list thumbnails and New stay left-aligned and sizes fit', async ({ page }) => {
	for (const [width, height] of [
		[1440, 900],
		[960, 800],
		[390, 844]
	]) {
		await page.setViewportSize({ width, height });
		await landing(page);
		for (const theme of ['dark', 'light']) {
			await page.evaluate(
				(value) => document.documentElement.setAttribute('data-theme', value),
				theme
			);
			const rows = page.locator('.character-rows :is(.character-row, .new-character-row)');
			await expect(rows).toHaveCount(2);
			const sizes = rows.first().locator('.character-sizes');
			await expect(sizes.locator('span')).toHaveText([/^\d+×\d+ px body$/, '· 64×64 px frame']);
			const overflow = await sizes.evaluate((node) => {
				const bounds = node.getBoundingClientRect();
				const column = node.parentElement!.getBoundingClientRect();
				return [...node.children].map((label) => {
					const rect = label.getBoundingClientRect();
					return {
						right: Math.max(0, rect.right - bounds.right),
						bottom: Math.max(0, rect.bottom - Math.min(bounds.bottom, column.bottom))
					};
				});
			});
			expect(overflow, `${width}×${height} ${theme}`).toEqual([
				{ right: 0, bottom: 0 },
				{ right: 0, bottom: 0 }
			]);
			for (const row of await rows.all()) {
				const geometry = await row.evaluate((node) => {
					const style = getComputedStyle(node);
					const bounds = node.getBoundingClientRect();
					const thumbnail = node.firstElementChild!.getBoundingClientRect();
					return {
						inset: thumbnail.left - bounds.left,
						expected: parseFloat(style.borderLeftWidth) + parseFloat(style.paddingLeft)
					};
				});
				expect(geometry.inset).toBeCloseTo(geometry.expected, 0);
			}
			const name = rows.first().locator('strong');
			const newLabel = rows.last().locator('span').last();
			const alignedLeft = (await newLabel.boundingBox())!.x;
			expect((await name.boundingBox())!.x).toBeCloseTo(alignedLeft, 0);
			const longNameLeft = await name.evaluate((node) => {
				const longName = document.createElement('span');
				longName.textContent =
					'A long character name that should truncate instead of shifting columns';
				node.append(longName);
				const left = node.getBoundingClientRect().left;
				longName.remove();
				return left;
			});
			expect(longNameLeft).toBeCloseTo(alignedLeft, 0);
		}
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
	await page.getByRole('button', { name: 'Activity...', exact: true }).click();
	await expect(page.getByRole('dialog')).toBeVisible();
	expect(await rootIsFullscreen()).toBe(true);
	await page.getByRole('dialog').getByRole('button', { name: 'Close', exact: true }).click();
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
	// Running work marks More with a dot instead of adding a bar control.
	await expect(
		page.locator('.experience-header [popovertarget="experience-options"][data-activity="busy"]')
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
	for (const mode of ['Preview', 'Top-down', 'Side-scroller']) {
		await page.getByRole('button', { name: mode, exact: true }).click();
		await page.getByRole('button', { name: 'Random look', exact: true }).click();
		await expect(world(page)).toBeFocused();
		await page.keyboard.down('a');
		await expect(world(page)).toHaveAttribute('data-facing', 'west');
		await page.keyboard.up('a');
		await page.locator('.header-undo').click();
		await expect(world(page)).toBeFocused();
		await page.locator('.header-redo').click();
		await expect(world(page)).toBeFocused();
	}
	await page.getByRole('button', { name: 'Preview', exact: true }).click();
	const random = page.getByRole('button', { name: 'Random look', exact: true });
	await random.focus();
	await page.keyboard.press('Enter');
	await expect(random).toBeFocused();
	// The prompt moved into the name menu, which Escape closes before the world leaves for Characters.
	await page.locator('.name-menu').click();
	const menu = page.locator('#project-menu');
	await expect(menu.locator('.menu-prompt-text')).toBeVisible();
	const copy = menu.getByRole('menuitem', { name: 'Copy prompt', exact: true });
	await expect(copy).toBeVisible();
	const current = menu.locator('[role=menuitemradio][aria-checked="true"]');
	const locked = menu.getByRole('menuitem', { name: 'Move to Trash…', exact: true });
	const connect = menu.getByRole('menuitem', { name: /^Connect PixelLab/ });
	const last = menu.getByRole('menuitem', { name: 'Character selection', exact: true });
	await expect(current).toBeFocused();
	// Unavailable rows stay in the sequence so their reason is reachable.
	await page.keyboard.press('ArrowDown');
	await expect(locked).toBeFocused();
	await expect(locked).toHaveAccessibleDescription("Demo character can't be deleted");
	await page.keyboard.press('ArrowDown');
	await expect(connect).toBeFocused();
	await page.keyboard.press('ArrowUp');
	await expect(locked).toBeFocused();
	await page.keyboard.press('ArrowUp');
	await expect(current).toBeFocused();
	await page.keyboard.press('Home');
	await expect(copy).toBeFocused();
	await page.keyboard.press('ArrowDown');
	await expect(current).toBeFocused();
	await page.keyboard.press('End');
	await expect(last).toBeFocused();
	await page.keyboard.press('ArrowDown');
	await expect(copy).toBeFocused();
	await page.keyboard.press('ArrowUp');
	await expect(last).toBeFocused();
	// A character's nested Actions menu keeps its arrows instead of handing them to the project menu.
	const currentName = (await current.getAttribute('aria-label'))!;
	const more = menu.getByRole('button', {
		name: `More actions for ${currentName}`,
		exact: true
	});
	await more.click();
	const actions = page.getByRole('menu', { name: `Actions for ${currentName}`, exact: true });
	const details = actions.getByRole('menuitem', { name: 'Details...', exact: true });
	await expect(details).toBeFocused();
	await page.keyboard.press('ArrowUp');
	// The shared handler still steps over the locked Delete row to the last enabled one.
	await expect(actions.getByRole('menuitem', { name: 'Edit a copy', exact: true })).toBeFocused();
	await actions.getByRole('menuitem').last().focus();
	await page.keyboard.press('ArrowDown');
	await expect(details).toBeFocused();
	await more.click();
	await expect(actions).not.toBeVisible();
	await expect(menu).toBeVisible();
	await page.keyboard.press('Escape');
	await expect(menu).not.toBeVisible();
	await expect(page.locator('.name-menu')).toBeFocused();
	await world(page).focus();
	await expect(world(page)).toBeFocused();
	await page.keyboard.press('Escape');
	await expect(selection(page)).toBeFocused();
	const create = page.getByRole('button', { name: 'New character', exact: true }).first();
	await create.focus();
	await page.keyboard.press('Enter');
	await page.getByRole('menuitem', { name: 'Create from scratch...', exact: true }).click();
	const dialog = page.getByRole('dialog', { name: 'New character', exact: true });
	const name = dialog.getByRole('textbox', { name: 'Name', exact: true });
	await name.fill('Keyboard draft');
	await page.keyboard.press('ArrowLeft');
	await expect(name).toBeFocused();
	// Leaving typed text asks first.
	await dialog.getByRole('button', { name: 'Back', exact: true }).click();
	await page
		.getByRole('alertdialog', { name: 'Discard changes?', exact: true })
		.getByRole('button', { name: 'Discard', exact: true })
		.click();
	await expect(create).toBeFocused();
	await expect(selection(page)).toBeVisible();
	await page.locator('.customize-action').click();
	await expect(world(page)).toBeFocused();
});

test('dismissing a top-bar sheet on the world returns keyboard control to the world', async ({
	page
}) => {
	await landing(page);
	await page.keyboard.press('Enter');
	await expect(world(page)).toBeFocused();
	await page.getByRole('button', { name: 'Mount settings', exact: true }).click();
	const settings = page.getByRole('dialog', { name: 'Settings', exact: true });
	await expect(settings).toBeVisible();
	await page.mouse.click(5, 5);
	await expect(settings).toHaveCount(0);
	await expect(world(page)).toBeFocused();
	await page.keyboard.press('ArrowLeft');
	await expect(world(page)).toHaveAttribute('data-facing', 'west');
});

test('Preview resolves partial chord releases, preserves pause and clip selection, and rejects stale repeats', async ({
	page
}) => {
	await landing(page);
	await page.keyboard.press('Enter');
	const clip = playbackPicker(page);
	const original = (await clip.getAttribute('value'))!;
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
	await expect(clip).toHaveAttribute('value', original);
	await expect(page.getByRole('button', { name: 'Mount settings', exact: true })).toBeVisible();
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
	await expect(playbackPicker(page)).toHaveAttribute('value', 'cross-punch');
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

test('one test-mount toggle follows facing and movement across Preview, Top-down and Side-scroller', async ({
	page
}) => {
	await page.setViewportSize({ width: 1920, height: 900 });
	await page.route('**/fixtures/s2/fixture.json*', async (route) => {
		const response = await route.fetch();
		const fixture = await response.json();
		const animation = fixture.rig.animations.find((entry: { id: string }) => entry.id === 'walk');
		const points = ['LEFT', 'RIGHT'].flatMap((side, index) =>
			['HIP', 'KNEE', 'LEG'].map((joint, row) => ({
				label: `${side} ${joint}`,
				x: 0.4 + index * 0.2,
				y: 0.55 + row * 0.15
			}))
		);
		points.push(
			...['LEFT', 'RIGHT'].flatMap((side, index) =>
				['ELBOW', 'ARM'].map((joint, row) => ({
					label: side + ' ' + joint,
					x: 0.2 + index * 0.6,
					y: 0.35 + row * 0.15
				}))
			)
		);
		animation.sources = {
			east: { measured: Array.from({ length: animation.cells }, () => points) }
		};
		// A one-cell State drawn from Walk's first column stands in for a saved riding stance.
		fixture.rig.animations.push({
			id: 'riding',
			kind: 'state',
			cells: 1,
			loop: false,
			frames: [{ cell: 0, ms: 100 }]
		});
		const base = fixture.items.find((item: { id: string }) => item.id === fixture.rig.baseItem);
		base.layers[0].sheets.riding = base.layers[0].sheets.walk;
		await route.fulfill({ response, json: fixture });
	});
	await landing(page);
	// Character selection has no mount button; F shows and hides the mount its cast rides.
	const toggle = page.locator('.test-mount-toggle');
	const hero = page.locator('.cast-character.chosen');
	await expect(toggle).toHaveCount(0);
	await expect(hero).not.toHaveAttribute('data-mounted');
	await selection(page).focus();
	await page.keyboard.press('f');
	await expect(hero).toHaveAttribute('data-mounted', 'true');
	await page.keyboard.press('f');
	await expect(hero).not.toHaveAttribute('data-mounted');
	await page.keyboard.press('Enter');
	await pause(page);
	const inactiveMountColor = await toggle.evaluate((element) => getComputedStyle(element).color);
	const move = playbackPicker(page);
	await selectPlaybackClip(page, 'cross-punch');
	const picker = await openPlaybackPicker(page);
	const moves = await picker.getByRole('menuitemradio').count();
	// Every row shows its clip's body art; the trigger itself stays text only.
	await expect(picker.locator('.clip-art canvas')).toHaveCount(moves);
	await expect(move.locator('canvas')).toHaveCount(0);
	await page.keyboard.press('Escape');
	await expect(toggle).toHaveAccessibleName('Mount settings');
	await expect(toggle).toHaveAttribute('aria-haspopup', 'dialog');
	// Mount settings sits in Preview's playback bar, right of Inspect; the top bar keeps Undo, Redo, Random look, Share.
	await expect(page.locator('.playback-bar .playback-inspect + .test-mount-toggle')).toHaveCount(1);
	await expect(
		page.locator('.header-actions > .header-undo + .header-redo + .header-random + .header-share')
	).toHaveCount(1);
	// F shows and hides the mount in Preview too.
	await world(page).focus();
	await page.keyboard.press('f');
	await expect(toggle).toHaveAttribute('data-active', 'true');
	await page.keyboard.press('f');
	await expect(toggle).not.toHaveAttribute('data-active');
	// The mount icon opens the Mount page of Settings directly.
	const mountMenu = page.getByRole('dialog', { name: 'Settings' });
	const shown = mountMenu.getByRole('switch', { name: 'Show character mounted', exact: true });
	const closeMount = async () => {
		await page.keyboard.press('Escape');
		await expect(mountMenu).toBeHidden();
	};
	await toggle.click();
	await expect(mountMenu.getByRole('heading', { name: 'Mount', exact: true })).toBeVisible();
	await expect(shown).not.toBeChecked();
	await expect(world(page)).not.toHaveAttribute('data-mount');
	// The page previews the mount on its own, turning; with Show mount on, the open character rides it.
	const preview = mountMenu.locator('.mount-preview canvas');
	const painted = () =>
		preview.evaluate((canvas: HTMLCanvasElement) =>
			canvas
				.getContext('2d')!
				.getImageData(0, 0, canvas.width, canvas.height)
				.data.some((value, index) => index % 4 === 3 && value > 0)
		);
	await expect.poll(painted).toBe(true);
	await expect(preview).toHaveAttribute('data-rider', '');
	const firstFacing = await preview.getAttribute('data-facing');
	await expect(preview).not.toHaveAttribute('data-facing', firstFacing!, { timeout: 5000 });
	await shown.check();
	await expect(preview).toHaveAttribute('data-rider', 'fixture:s2');
	const playButton = mountMenu.getByRole('button', { name: 'Pause mount preview', exact: true });
	await playButton.click();
	await expect(
		mountMenu.getByRole('button', { name: 'Play mount preview', exact: true })
	).toBeVisible();
	const pausedFacing = await preview.getAttribute('data-facing');
	await page.waitForTimeout(1800);
	await expect(preview).toHaveAttribute('data-facing', pausedFacing!);
	await mountMenu.getByRole('button', { name: 'Play mount preview', exact: true }).click();
	await shown.uncheck();
	await shown.check();
	await expect
		.poll(() => toggle.evaluate((element) => getComputedStyle(element).color))
		.not.toBe(inactiveMountColor);
	await expect(toggle).toHaveAttribute('data-active', 'true');
	await shown.focus();
	const playing = await page
		.getByRole('button', { name: /^(Play|Pause)$/ })
		.getAttribute('aria-label');
	await page.keyboard.press('Space');
	await expect(shown).not.toBeChecked();
	await expect(shown).toBeFocused();
	await page.keyboard.press('Space');
	await expect(shown).toBeChecked();
	await expect(page.getByRole('button', { name: /^(Play|Pause)$/ })).toHaveAttribute(
		'aria-label',
		playing!
	);
	await closeMount();
	await expect(toggle).toBeFocused();
	// Closing Settings removes the preview with its drawing loop.
	await expect(page.locator('.mount-preview')).toHaveCount(0);
	for (const direction of ['south', 'east', 'north', 'west']) {
		await page.getByRole('button', { name: 'Face ' + direction, exact: true }).click();
		await expect(world(page)).toHaveAttribute(
			'data-mount',
			new RegExp('^narrow-saddle ' + direction + ' \\d+$')
		);
	}
	await expect(move).toHaveAttribute('value', 'cross-punch');
	await expect((await openPlaybackPicker(page)).getByRole('menuitemradio')).toHaveCount(moves);
	await page.keyboard.press('Escape');
	await page.getByRole('button', { name: 'Face east', exact: true }).click();
	await selectPlaybackClip(page, 'walk');
	await toggle.click();
	const legs = mountMenu.getByRole('radiogroup', { name: 'Hide leg', exact: true });
	const legMode = (name: string) => legs.getByRole('radio', { name, exact: true });
	await expect(legMode('Far leg')).toBeChecked();
	await expect(world(page)).toHaveAttribute('data-mount-legs', 'far');
	await expect(world(page)).toHaveAttribute('data-mount-leg-source', 'measured');
	await expect
		.poll(
			async () =>
				((await world(page).getAttribute('data-lineup')) ?? '').split(' ').filter(Boolean).length
		)
		.toBeGreaterThan(1);
	await expect
		.poll(
			async () =>
				(await world(page).getAttribute('data-mounted-lineup')) ===
				(await world(page).getAttribute('data-lineup'))
		)
		.toBe(true);
	// Arrow keys move between leg modes inside Settings without turning the character.
	await legMode('Far leg').focus();
	await page.keyboard.press('ArrowRight');
	await expect(legMode('Both legs')).toBeChecked();
	await expect(world(page)).toHaveAttribute('data-facing', 'east');
	await expect(world(page)).toHaveAttribute('data-mount-legs', 'both');
	await closeMount();
	await page.getByRole('button', { name: 'Face west', exact: true }).click();
	await expect(world(page)).toHaveAttribute('data-mount-legs', 'both');
	await expect(world(page)).toHaveAttribute('data-mount-leg-source', 'measured');
	await toggle.click();
	await legMode('Far leg').check();
	await expect(world(page)).toHaveAttribute('data-mount-legs', 'far');
	await expect(world(page)).toHaveAttribute('data-mount-leg-source', 'measured');
	await legMode('Both legs').check();
	await closeMount();
	await page.getByRole('button', { name: 'Face north', exact: true }).click();
	await expect(page.locator('.world-notes')).toContainText('Leg hiding unavailable');
	await toggle.click();
	await legMode('None').check();
	await closeMount();
	await selectPlaybackClip(page, 'cross-punch');
	await expect(
		page.locator('.world-notes, .preview-note').filter({ hasText: 'Test only' })
	).toHaveCount(0);
	await expect(page.getByRole('combobox', { name: 'Mount preview', exact: true })).toHaveCount(0);
	await expect(
		page.getByRole('button', { name: 'Reveal covered parts (diagnostic)', exact: true })
	).toHaveCount(0);
	// The live views toggle the same mount with their Mount action.
	const liveMount = page
		.getByRole('group', { name: 'Game actions', exact: true })
		.getByRole('button', { name: 'Mount', exact: true });
	for (const mode of ['Top-down', 'Side-scroller']) {
		await page.getByRole('button', { name: mode, exact: true }).click();
		await expect(liveMount).toHaveAttribute('aria-pressed', 'true');
		await world(page).focus();
		await page.keyboard.down('ArrowLeft');
		await expect(world(page)).toHaveAttribute('data-mount', /^narrow-saddle west \d+$/);
		const position = await world(page).getAttribute('data-position');
		await expect(world(page)).not.toHaveAttribute('data-position', position!);
		await page.keyboard.up('ArrowLeft');
		await page.keyboard.press('f');
		await expect(liveMount).toHaveAttribute('aria-pressed', 'false');
		await expect(world(page)).not.toHaveAttribute('data-mount');
		await page.keyboard.press('f');
		await expect(world(page)).toHaveAttribute('data-mount', /^narrow-saddle west \d+$/);
	}
	await page.getByRole('button', { name: 'Preview', exact: true }).click();
	await expect(move).toHaveAttribute('value', 'cross-punch');
	await expect(toggle).toHaveAttribute('data-active', 'true');
	for (const viewport of [
		{ width: 320, height: 400 },
		{ width: 844, height: 390 }
	]) {
		await page.setViewportSize(viewport);
		// A compact playback bar moves Mount settings into More, like Inspect.
		const compact = page.locator('.experience.compact-playback');
		await expect
			.poll(async () => (await toggle.isVisible()) !== (await compact.count()) > 0)
			.toBe(true);
		if (await compact.count()) {
			await page.getByRole('button', { name: 'More options', exact: true }).click();
			await page.locator('.mobile-mount').click();
		} else await toggle.click();
		await expect(shown).toBeVisible();
		const menuBounds = await mountMenu.boundingBox();
		expect(menuBounds).not.toBeNull();
		expect(menuBounds!.x).toBeGreaterThanOrEqual(0);
		expect(menuBounds!.x + menuBounds!.width).toBeLessThanOrEqual(viewport.width);
		expect(menuBounds!.y).toBeGreaterThanOrEqual(0);
		expect(menuBounds!.y + menuBounds!.height).toBeLessThanOrEqual(viewport.height);
		await closeMount();
		await expect
			.poll(() =>
				page.evaluate(() => {
					const canvas = document.querySelector<HTMLCanvasElement>('.world-actors')!;
					if (
						canvas.width !== Math.round(innerWidth * devicePixelRatio) ||
						canvas.height !== Math.round(innerHeight * devicePixelRatio)
					)
						return false;
					const pixels = canvas
						.getContext('2d')!
						.getImageData(0, 0, canvas.width, canvas.height).data;
					let left = canvas.width,
						right = -1,
						top = canvas.height,
						bottom = -1;
					for (let y = 0; y < canvas.height; y++)
						for (let x = 0; x < canvas.width; x++)
							if (pixels[(y * canvas.width + x) * 4 + 3]) {
								left = Math.min(left, x);
								right = Math.max(right, x);
								top = Math.min(top, y);
								bottom = Math.max(bottom, y);
							}
					const controls = document.querySelector('.header-actions')!.getBoundingClientRect();
					const tabs = document.querySelector('.view-modes')!.getBoundingClientRect();
					const playback = document.querySelector('.playback-bar')!.getBoundingClientRect();
					return {
						painted: right > left && bottom > top,
						fitsWidth: left > 0 && right < canvas.width - 1,
						belowControls: top / devicePixelRatio > Math.max(controls.bottom, tabs.bottom),
						abovePlayback: bottom / devicePixelRatio < playback.top,
						toggleFits: controls.left >= 0 && controls.right <= innerWidth,
						bounds: {
							left,
							right,
							top,
							bottom,
							controlsBottom: Math.max(controls.bottom, tabs.bottom),
							playbackTop: playback.top,
							width: innerWidth,
							height: innerHeight
						}
					};
				})
			)
			.toEqual(
				expect.objectContaining({
					painted: true,
					fitsWidth: true,
					belowControls: true,
					abovePlayback: true,
					toggleFits: true
				})
			);
	}
	// A Riding pose holds a saved State or Move on the mount in every view; dismounting gives Preview its selection back.
	await page.setViewportSize({ width: 1920, height: 900 });
	await toggle.click();
	const riderPose = mountMenu.getByRole('button', { name: /^Riding pose:/ });
	await expect(riderPose).toHaveAccessibleName('Riding pose: Automatic');
	await riderPose.click();
	const poseMenu = page.getByRole('menu', { name: 'Riding pose', exact: true });
	await expect(poseMenu).toBeVisible();
	await expect(
		poseMenu.getByRole('menuitemradio', { name: 'Automatic', exact: true })
	).toBeChecked();
	// Moves sit left of States in the shared picker, and both are available as the pose.
	const poseMoves = poseMenu.getByRole('group', { name: 'Moves', exact: true });
	const poseStates = poseMenu.getByRole('group', { name: 'States', exact: true });
	expect((await poseMoves.boundingBox())!.x).toBeLessThan((await poseStates.boundingBox())!.x);
	await poseMenu.locator('[value="riding"]').click();
	await expect(riderPose).toHaveAttribute('value', 'riding');
	await expect(move).toHaveAttribute('value', 'riding');
	await expect(world(page)).toHaveAttribute('data-clip', 'riding');
	await expect(world(page)).toHaveAttribute('data-mount-legs', 'none');
	await expect(legMode('Far leg')).toBeDisabled();
	// A Move is a Riding pose too: it plays while mounted and keeps the Hide leg setting.
	await riderPose.click();
	await poseMenu.locator('[value="walk"]').click();
	await expect(riderPose).toHaveAttribute('value', 'walk');
	await expect(world(page)).toHaveAttribute('data-clip', 'walk');
	await expect(legMode('Far leg')).toBeEnabled();
	await legMode('Far leg').check();
	// The live views follow the Move pose too, not just Preview's selection.
	await closeMount();
	await page.getByRole('button', { name: 'Top-down', exact: true }).click();
	await world(page).focus();
	await page.keyboard.down('ArrowRight');
	await expect(world(page)).toHaveAttribute('data-clip', 'walk');
	await expect(world(page)).toHaveAttribute('data-mount-legs', 'far');
	await page.keyboard.up('ArrowRight');
	await page.getByRole('button', { name: 'Preview', exact: true }).click();
	await toggle.click();
	await legMode('None').check();
	await riderPose.click();
	await poseMenu.locator('[value="riding"]').click();
	await closeMount();
	await page.getByRole('button', { name: 'Top-down', exact: true }).click();
	await world(page).focus();
	await page.keyboard.down('ArrowRight');
	await expect(world(page)).toHaveAttribute('data-facing', 'east');
	await expect(world(page)).toHaveAttribute('data-clip', 'riding');
	await expect(world(page)).toHaveAttribute('data-mount', /^narrow-saddle east \d+$/);
	await page.keyboard.up('ArrowRight');
	await page.getByRole('button', { name: 'Side-scroller', exact: true }).click();
	await world(page).focus();
	await page.keyboard.down('ArrowLeft');
	await expect(world(page)).toHaveAttribute('data-facing', 'west');
	await expect(world(page)).toHaveAttribute('data-clip', 'riding');
	await expect(world(page)).toHaveAttribute('data-mount', /^narrow-saddle west \d+$/);
	await page.keyboard.up('ArrowLeft');
	await page.getByRole('button', { name: 'Preview', exact: true }).click();
	await toggle.click();
	await shown.uncheck();
	await closeMount();
	await expect(toggle).not.toHaveAttribute('data-active');
	await expect(world(page)).not.toHaveAttribute('data-mount');
	await expect(move).toHaveAttribute('value', 'cross-punch');
	// Mount settings, including this character's Riding pose, survive a reload; Reset restores the defaults.
	await page.reload();
	await landing(page);
	await page.keyboard.press('Enter');
	// The fixture State above is injected per response, so check the saved choice itself after the reload.
	const savedMount = () =>
		page.evaluate(() => JSON.parse(localStorage.getItem('pixeldoll.mount') ?? 'null'));
	expect(Object.values((await savedMount()).poses)).toEqual(['riding']);
	await toggle.click();
	await expect(shown).not.toBeChecked();
	await expect(legMode('None')).toBeChecked();
	await shown.check();
	await page.reload();
	await landing(page);
	await page.keyboard.press('Enter');
	await expect(world(page)).toHaveAttribute('data-mount', /^narrow-saddle /);
	await toggle.click();
	await mountMenu.getByRole('button', { name: 'Reset this page' }).first().click();
	await page.getByRole('alertdialog').getByRole('button', { name: 'Reset this page' }).click();
	await expect(shown).not.toBeChecked();
	await expect(legMode('Far leg')).toBeChecked();
	await expect(riderPose).toHaveAccessibleName('Riding pose: Automatic');
	expect(await savedMount()).toEqual({ show: false, legs: 'far', poses: {} });
	// The bundled demo keeps its own seat edit even though its source artwork is read-only.
	const facing = mountMenu.getByRole('combobox', { name: 'Preview direction', exact: true });
	const adjust = mountMenu.getByRole('button', { name: 'Seat position', exact: true });
	const seat = mountMenu.locator('[data-setting="rider-seat"] output');
	await facing.selectOption('east');
	await adjust.click();
	await mountMenu.getByRole('button', { name: 'Move seat right', exact: true }).click();
	await mountMenu.getByRole('button', { name: 'Save', exact: true }).click();
	await expect(adjust).toHaveAttribute('aria-expanded', 'false');
	await closeMount();
	await expect(world(page)).not.toHaveAttribute('data-mount');
	await page.reload();
	await landing(page);
	await page.keyboard.press('Enter');
	await toggle.click();
	await facing.selectOption('east');
	await expect(seat).toHaveText('x 1, y 0');
});

const touchTest = test.extend({ hasTouch: true });
touchTest(
	'a saved seat point survives reload and resets to automatic in the compact Mount sheet',
	async ({ page }, info) => {
		const dev = info.config.projects.find((project) => project.name === 'browser-selftests')!.use
			.baseURL!;
		await page.setViewportSize({ width: 390, height: 844 });
		await landing(page, dev);
		await page.evaluate(async () => {
			const { openSource } = await import(String('/src/lib/dress/project.ts'));
			const { saveImportedCharacter } = await import(String('/src/lib/store/import.ts'));
			const { rehash } = await import(String('/src/lib/rig/directions.ts'));
			const { refreshProjects, openProject } = await import(String('/src/studio/state.svelte.ts'));
			const { project } = (await openSource('fixture:s2')) as {
				project: import('../../src/lib/store/manifest.ts').Project;
			};
			const m = project.manifest;
			m.rig.animations.push({
				id: 'riding',
				kind: 'state',
				cells: 1,
				loop: false,
				frames: [{ cell: 0, ms: 100 }]
			});
			const body = m.items.find(({ id }) => id === m.rig.baseItem)!.layers[0];
			body.cells!.riding = Object.fromEntries(
				Object.entries(body.cells!.walk).map(([dir, row]) => [dir, row!.slice(0, 1)])
			);
			await rehash(m);
			const id = await saveImportedCharacter(
				{ project, warnings: [], extra: {} },
				'Seat test rider'
			);
			await refreshProjects();
			await openProject(id);
		});
		const customize = page
			.getByRole('button', { name: 'Customize Seat test rider', exact: true })
			.last();
		await customize.click();
		const mountMenu = page.getByRole('dialog', { name: 'Settings' });
		const riderPose = mountMenu.getByRole('button', { name: /^Riding pose:/ });
		const openCompactMount = async () => {
			await page.getByRole('button', { name: 'More options', exact: true }).click();
			await page.locator('.mobile-mount').click();
		};
		await openCompactMount();
		const seatRow = mountMenu.locator('[data-setting="rider-seat"]');
		const facing = mountMenu.getByRole('combobox', { name: 'Preview direction', exact: true });
		const autoTurn = mountMenu.getByRole('button', {
			name: 'Rotate preview automatically',
			exact: true
		});
		await expect(autoTurn).toHaveAttribute('aria-pressed', 'true');
		await facing.selectOption('south-east');
		const wide = (await facing.boundingBox())!.width;
		await facing.selectOption('east');
		await expect.poll(async () => (await facing.boundingBox())!.width).toBe(wide);
		await expect(autoTurn).toHaveAttribute('aria-pressed', 'false');
		await autoTurn.click();
		await expect(autoTurn).toHaveAttribute('aria-pressed', 'true');
		await facing.selectOption('east');
		await expect(autoTurn).toHaveAttribute('aria-pressed', 'false');
		const adjustSeat = mountMenu.getByRole('button', { name: 'Seat position', exact: true });
		const shown = mountMenu.getByRole('switch', { name: 'Show character mounted', exact: true });
		await expect(shown).not.toBeChecked();
		await expect(
			mountMenu.locator('[data-setting="show-mount"] + [data-setting="rider-seat"]')
		).toBeVisible();
		await expect(riderPose).toContainText('Automatic');
		const left = mountMenu.getByRole('button', { name: 'Move seat left', exact: true });
		const right = mountMenu.getByRole('button', { name: 'Move seat right', exact: true });
		const seat = seatRow.locator('output');
		const marker = mountMenu.locator('.seat-marker');
		const auto = mountMenu.getByRole('button', { name: 'Use automatic', exact: true });
		const saveSeat = mountMenu.getByRole('button', { name: 'Save', exact: true });
		const canvas = mountMenu.locator('.mount-preview canvas');
		const play = mountMenu.getByRole('button', { name: 'Play mount preview', exact: true });
		const pausePreview = mountMenu.getByRole('button', {
			name: 'Pause mount preview',
			exact: true
		});
		await expect(seat).toHaveText('x 0, y 0');
		await adjustSeat.click();
		await expect(left).toBeFocused();
		await expect(marker).toBeVisible();
		await expect(facing).toBeEnabled();
		await expect(pausePreview).toBeVisible();
		await expect(auto).toHaveAttribute('aria-pressed', 'true');
		// The open row closes like Cancel and discards its draft; the preview keeps turning while editing.
		await right.tap();
		await expect(seat).toHaveText('x 1, y 0');
		await adjustSeat.click();
		await expect(left).toBeHidden();
		await expect(seat).toHaveText('x 0, y 0');
		await adjustSeat.click();
		await expect(left).toBeVisible();
		await autoTurn.click();
		await expect(autoTurn).toHaveAttribute('aria-pressed', 'true');
		await expect.poll(() => canvas.getAttribute('data-facing'), { timeout: 5000 }).not.toBe('east');
		await facing.selectOption('east');
		await expect(autoTurn).toHaveAttribute('aria-pressed', 'false');
		const pad = await mountMenu.locator('.seat-nudges button').evaluateAll((buttons) =>
			buttons.map((button) => {
				const { x, y, width, height } = button.getBoundingClientRect();
				return { x, y, width, height };
			})
		);
		expect(new Set(pad.map(({ x, y }) => `${x},${y}`)).size).toBe(5);
		expect(pad.every(({ width, height }) => width === 44 && height === 44)).toBe(true);
		await pausePreview.click();
		await expect(canvas).toHaveAttribute('data-rider', '');
		const markBefore = (await marker.boundingBox())!;
		const scale = Number(await canvas.getAttribute('data-scale'));
		await right.tap();
		await expect(seat).toHaveText('x 1, y 0');
		await expect(auto).toHaveAttribute('aria-pressed', 'false');
		await expect
			.poll(async () => (await marker.boundingBox())!.x - markBefore.x)
			.toBeCloseTo(scale / (await page.evaluate(() => devicePixelRatio)), 1);
		await expect(saveSeat).toBeEnabled();
		await page.evaluate(async () => {
			const { doc, openProject } = await import(String('/src/studio/state.svelte.ts'));
			await openProject(doc.id, { quiet: true });
		});
		await expect(adjustSeat).toHaveAttribute('aria-expanded', 'true');
		await expect(seat).toHaveText('x 1, y 0');
		await shown.check();
		await expect(canvas).not.toHaveAttribute('data-rider', '');
		await riderPose.click();
		await page.getByRole('menuitemradio', { name: 'Riding', exact: true }).click();
		await expect(seat).toHaveText('x 1, y 0');
		await riderPose.click();
		await page.getByRole('menuitemradio', { name: 'Walk', exact: true }).click();
		await expect(seat).toHaveText('x 1, y 0');
		const pausedMarker = await marker.getAttribute('style');
		const pausedScale = await canvas.getAttribute('data-scale');
		await play.click();
		await expect(pausePreview).toBeVisible();
		await expect(marker).not.toHaveAttribute('style', pausedMarker!);
		await expect(canvas).toHaveAttribute('data-scale', pausedScale!);
		await mountMenu.getByRole('button', { name: 'Cancel', exact: true }).click();
		await expect(adjustSeat).toBeFocused();
		await expect(seat).toHaveText('x 0, y 0');
		await adjustSeat.press('Enter');
		await left.press('ArrowLeft');
		await expect(seat).toHaveText('x -1, y 0');
		await facing.selectOption('south-east');
		await expect(seat).toHaveText('x 0, y 0');
		await right.press('ArrowDown');
		await expect(seat).toHaveText('x 0, y 1');
		await page.evaluate(() => {
			const put = IDBObjectStore.prototype.put;
			IDBObjectStore.prototype.put = function (record, key) {
				if (record?.manifest?.rig?.mountSeatOffsets) {
					IDBObjectStore.prototype.put = put;
					throw new DOMException('Seat storage refused', 'QuotaExceededError');
				}
				return put.call(this, record, key);
			};
		});
		await saveSeat.click();
		await expect(mountMenu.getByRole('alert')).toContainText('Seat storage refused');
		await saveSeat.click();
		await expect(adjustSeat).toHaveAttribute('aria-expanded', 'false');
		await expect(seat).toHaveText('x 0, y 1');
		await facing.selectOption('east');
		await expect(seat).toHaveText('x -1, y 0');
		await mountMenu.getByRole('button', { name: 'Close', exact: true }).click();

		await page.reload();
		await customize.click();
		await page.setViewportSize({ width: 320, height: 568 });
		await openCompactMount();
		await facing.selectOption('south-east');
		await expect(seat).toHaveText('x 0, y 1');
		await facing.selectOption('east');
		await expect(seat).toHaveText('x -1, y 0');
		await adjustSeat.click();
		expect(await mountMenu.evaluate((sheet) => sheet.scrollWidth)).toBeLessThanOrEqual(320);
		await auto.click();
		await expect(marker).toBeInViewport();
		await expect(seat).toBeInViewport();
		await expect(auto).toHaveAttribute('aria-pressed', 'true');
		await expect(seat).toHaveText('x 0, y 0');
		await saveSeat.click();
		await expect(adjustSeat).toHaveAttribute('aria-expanded', 'false');
		await expect(seat).toHaveText('x 0, y 0');

		// Holding an arrow keeps nudging on pointer and touch input.
		await adjustSeat.click();
		await right.scrollIntoViewIfNeeded();
		const held = (await right.boundingBox())!;
		await page.mouse.move(held.x + held.width / 2, held.y + held.height / 2);
		await page.mouse.down();
		await expect
			.poll(async () => Number(/x (-?\d+)/.exec((await seat.textContent()) ?? '')?.[1] ?? 0), {
				timeout: 5000
			})
			.toBeGreaterThan(1);
		await page.mouse.up();
		await mountMenu.getByRole('button', { name: 'Cancel', exact: true }).click();
		await expect(adjustSeat).toHaveAttribute('aria-expanded', 'false');
		await expect(seat).toHaveText('x 0, y 0');
	}
);

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
	await page.getByRole('menuitem', { name: 'Import from device...', exact: true }).click();
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
	await expect(importing).toBeHidden();
	const move = playbackPicker(page);
	await move.press('ArrowDown');
	const picker = page.getByRole('menu', { name: 'Move', exact: true });
	await expect(picker).toBeVisible();
	await expect(picker.getByRole('menuitemradio')).toHaveText([
		'Right punch (right_punch)',
		'Right punch (right-punch)',
		longLabel,
		'Standing'
	]);
	const states = picker.getByRole('group', { name: 'States', exact: true });
	const moves = picker.getByRole('group', { name: 'Moves', exact: true });
	await expect(states.getByRole('menuitemradio')).toHaveText(['Standing']);
	await expect(moves.getByRole('menuitemradio')).toHaveCount(3);
	const desktopStates = (await states.boundingBox())!;
	const desktopMoves = (await moves.boundingBox())!;
	expect(desktopMoves.x).toBeLessThan(desktopStates.x);
	expect(desktopMoves.y).toBeCloseTo(desktopStates.y, 0);
	await expect(states).toHaveCSS('border-inline-start-width', '1px');
	const active = picker.getByRole('menuitemradio', { checked: true });
	await expect(active).toBeFocused();
	await page.keyboard.press('ArrowDown');
	await expect(
		picker.getByRole('menuitemradio', { name: 'Right punch (right_punch)', exact: true })
	).toBeFocused();
	await expect(active).toBeChecked();
	await page.keyboard.press('Escape');
	await expect(move).toBeFocused();
	await expect(move).toHaveAttribute('value', 'default');
	await expect(page.getByRole('button', { name: /^(Play|Pause)$/ })).toHaveCount(0);
	const inspectAction = page
		.getByRole('toolbar', { name: 'Preview controls', exact: true })
		.getByRole('button', { name: 'Inspect', exact: true });
	await expect(inspectAction).toHaveText('');
	await expect(inspectAction).toHaveAttribute('title', 'Inspect');
	await expect(inspectAction.locator('svg')).toHaveCount(1);
	await selectPlaybackClip(page, 'right_punch');
	await expect(move).toHaveAttribute('value', 'right_punch');
	await selectPlaybackClip(page, 'right-punch');
	await expect(move).toHaveAttribute('value', 'right-punch');
	await selectPlaybackClip(page, longId);
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
			const value = node.querySelector('.clip-value')!,
				style = getComputedStyle(value),
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
			await openPlaybackPicker(page);
			const compactStates = (await states.boundingBox())!;
			const compactMoves = (await moves.boundingBox())!;
			expect(compactMoves.x).toBeCloseTo(compactStates.x, 0);
			expect(compactMoves.y).toBeLessThan(compactStates.y);
			await expect(states).toHaveCSS('border-inline-start-width', '0px');
			const option = moves.getByRole('menuitemradio').last();
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
		'Standing',
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

test('a held keyboard walk continues through a click on a control and ends when a menu takes the keyboard', async ({
	page
}) => {
	await landing(page);
	await page.keyboard.press('Enter');
	await modes(page).getByRole('button', { name: 'Top-down', exact: true }).click();
	const x = async () => Number((await world(page).getAttribute('data-position'))!.split(',')[0]);
	const stopped = () =>
		expect
			.poll(async () => {
				const before = await x();
				await page.evaluate(
					() => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)))
				);
				return (await x()) - before;
			})
			.toBe(0);
	// A held key repeats, as a real keyboard does: a repeat that reached the clicked tab would move its selection on.
	const session = await page.context().newCDPSession(page);
	const repeat = () =>
		session.send('Input.dispatchKeyEvent', {
			type: 'rawKeyDown',
			key: 'ArrowRight',
			code: 'ArrowRight',
			windowsVirtualKeyCode: 39,
			autoRepeat: true
		});
	await page.keyboard.down('ArrowRight');
	await expect.poll(x).toBeGreaterThan(10);
	const colors = page
		.getByRole('tablist', { name: 'Customization panels' })
		.getByRole('tab', { name: 'Colors', exact: true });
	const tab = (await colors.boundingBox())!;
	await page.mouse.move(tab.x + tab.width / 2, tab.y + tab.height / 2);
	await page.mouse.down();
	await repeat();
	await page.mouse.up();
	for (let i = 0; i < 3; i++) await repeat();
	// The click did its work and nothing else did, the stage has the keyboard again, and the walk goes on.
	await expect(world(page)).toBeFocused();
	await expect(colors).toHaveAttribute('aria-selected', 'true');
	const walked = await x();
	await expect.poll(x).toBeGreaterThan(walked + 10);
	// Another mouse button can open a native menu that keeps the key release from the page: the walk ends at the press.
	await colors.click({ button: 'right' });
	await stopped();
	await page.keyboard.up('ArrowRight');
	// A menu needs the keyboard itself: the walk ends there too.
	await world(page).focus();
	await page.keyboard.down('d');
	const again = await x();
	await expect.poll(x).toBeGreaterThan(again + 10);
	await page.getByRole('button', { name: 'More options', exact: true }).click();
	await expect(world(page)).not.toBeFocused();
	await stopped();
	await page.keyboard.up('d');
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
	await page.evaluate(async (id) => {
		const { openProject } = await import(/* @vite-ignore */ String('/src/studio/state.svelte.ts'));
		await openProject(id);
	}, ids[1]);
	await page.addInitScript((id) => {
		const state = window as unknown as {
			releaseSavedCharacter?: () => void;
			startupCarouselAnimations: number;
		};
		state.startupCarouselAnimations = 0;
		const animate = Element.prototype.animate;
		Element.prototype.animate = function (...args: Parameters<Element['animate']>) {
			if (this.matches('.carousel-character')) state.startupCarouselAnimations++;
			return animate.apply(this, args);
		};
		const get = IDBObjectStore.prototype.get;
		IDBObjectStore.prototype.get = function (key: IDBValidKey) {
			if (this.name === 'projects' && key === id) {
				const transaction = this.transaction;
				transaction.addEventListener(
					'complete',
					(event) => {
						event.stopImmediatePropagation();
						state.releaseSavedCharacter = () => {
							IDBObjectStore.prototype.get = get;
							transaction.dispatchEvent(new Event('complete'));
						};
					},
					{ once: true }
				);
			}
			return get.call(this, key);
		};
	}, ids[1]);
	await page.reload();
	await expect
		.poll(() =>
			page.evaluate(
				() =>
					typeof (window as unknown as { releaseSavedCharacter?: () => void }).releaseSavedCharacter
			)
		)
		.toBe('function');
	await expect(chosen).toHaveCount(0);
	await page.evaluate(() => {
		(window as unknown as { releaseSavedCharacter: () => void }).releaseSavedCharacter();
	});
	await expect(chosen).toHaveAttribute('data-character-id', ids[1]);
	await expect(page.locator('.customize-action')).toHaveAttribute('aria-busy', 'false');
	expect(
		await page.evaluate(
			() => (window as unknown as { startupCarouselAnimations: number }).startupCarouselAnimations
		)
	).toBe(0);
	await page.evaluate(async (id) => {
		const { openProject } = await import(/* @vite-ignore */ String('/src/studio/state.svelte.ts'));
		await openProject(id);
	}, ids[0]);
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
			if (this.matches('.carousel-character, .cast-reflection-actor')) {
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
	const boundedMotion = async () => {
		const routes = await page.locator('.cast-character').evaluateAll((nodes) =>
			nodes.flatMap((node) => {
				const animation = node.getAnimations()[0];
				if (!animation) return [];
				const frames = (animation.effect as KeyframeEffect).getKeyframes();
				const reflection = node.previousElementSibling!.getAnimations()[0];
				return [
					{
						frames,
						reflection: (reflection.effect as KeyframeEffect).getKeyframes(),
						timing: animation.effect!.getTiming(),
						reflectionTiming: reflection.effect!.getTiming(),
						positions: frames.map((frame) => new DOMMatrix(String(frame.transform)).m41)
					}
				];
			})
		);
		for (const route of routes) {
			expect(route.reflection).toEqual(route.frames);
			expect(route.reflectionTiming).toEqual(route.timing);
			if (route.frames.length !== 4) continue;
			expect(route.timing.easing).toBe('linear');
			expect(route.frames[1]).toMatchObject({ opacity: '0', offset: 0.5 });
			expect(route.frames[2]).toMatchObject({ opacity: '0', offset: 0.5 });
			expect(route.positions[0] * route.positions[1]).toBeGreaterThanOrEqual(0);
			expect(route.positions[2] * route.positions[3]).toBeGreaterThanOrEqual(0);
		}
	};
	await boundedMotion();
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
	// Six characters fit on this screen, so the count alone, not overflow, must show the field.
	const characterRows = page.locator('.character-rows');
	expect(
		await characterRows.evaluate((list) => list.scrollHeight > list.clientHeight + 1),
		'the six-character list fits without scrolling'
	).toBe(false);
	await expect(
		page.getByRole('searchbox', { name: 'Search characters', exact: true })
	).toBeVisible();
	const search = await revealCharacterSearch(page);
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
	await boundedMotion();
	await finish();
	await search.fill('Carousel trio pair');
	await expect(page.locator('.cast-character')).toHaveCount(2);
	await settled();
	await page.getByRole('button', { name: 'Next character', exact: true }).click();
	await expect
		.poll(() =>
			page.locator('.cast').evaluate((cast) => cast.getAnimations({ subtree: true }).length)
		)
		.toBe(4);
	expect(
		await chosen.evaluate(
			(node) => (node.getAnimations()[0].effect as KeyframeEffect).getKeyframes().length
		)
	).toBe(4);
	await boundedMotion();
	// With two characters the left card is the only side card, so clicking it must rotate the same way as the
	// Previous arrow rather than wrapping around the other way.
	const sideCard = page.locator('.cast-character:not(.chosen):not([inert])');
	await expect(sideCard).toHaveCount(1);
	const sideId = await sideCard.getAttribute('data-character-id');
	await sideCard.click();
	await expect(chosen).toHaveAttribute('data-character-id', sideId!);
	await expect
		.poll(() =>
			chosen.evaluate(
				(node) =>
					(node.getAnimations()[0]?.effect as KeyframeEffect | undefined)?.getKeyframes().length ??
					0
			)
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
	await expect(page.locator('.selection-ring')).toHaveCount(0);
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
		`Customize ${await page.locator('.selected-caption h2').textContent()}`
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
		const search = await revealCharacterSearch(page);
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
			`Customize ${await page.locator('.selected-caption h2').textContent()}`
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
		await page.getByRole('menuitem', { name: 'Import from device...', exact: true }).click();
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
	const currentName = await page.locator('.selected-caption h2').textContent();
	await revealCharacterSearch(page);
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
	const search = await revealCharacterSearch(page);
	await search.fill('There is no such saved character');
	await expect(page.locator('.character-row')).toHaveCount(0);
	await expect(page.locator('.cast-character')).toHaveCount(0);
	await expect(page.locator('.selected-caption')).toContainText('No matching characters');
	await expect(page.locator('.cast-library')).not.toContainText('No matching characters');
	await expect(search).toHaveAttribute('placeholder', 'Search');
	await expect(page.locator('.customize-action')).toBeDisabled();
	await page.keyboard.press('ArrowLeft');
	await page.keyboard.press('Enter');
	await expect(search).toBeFocused();
	await expect(page.getByRole('heading', { name: 'Characters', exact: true })).toBeVisible();
	await search.fill('Adventurer');
	await expect(page.locator('.character-row')).toHaveCount(1);
	await expect(page.locator('.customize-action')).toBeEnabled();
});

test('selection search follows the whole library, not the filtered rows', async ({ page }) => {
	await landing(page);
	const search = page.getByRole('searchbox', { name: 'Search characters', exact: true });
	await expect(search).toHaveCount(0);
	const rows = page.locator('.character-rows');
	await rows.evaluate((list) => {
		(list as HTMLElement).style.maxHeight = '40px';
	});
	await expect(search).toBeVisible();
	await search.fill('There is no such saved character');
	await expect(page.locator('.selected-caption')).toContainText('No matching characters');
	// Losing focus or narrowing to nothing never takes the field away from a query.
	await search.blur();
	await expect(search).toBeVisible();
	await expect(search).toHaveValue('There is no such saved character');
	await search.fill('');
	// Back to the whole library: the list still scrolls, so the field stays.
	await expect(search).toBeVisible();
	await rows.evaluate((list) => {
		(list as HTMLElement).style.maxHeight = '';
	});
	await expect(search).toHaveCount(0);
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
				const search = await revealCharacterSearch(page);
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
									page.locator('.cast').evaluate(async (cast) => {
										const { stills } = await import(
											/* @vite-ignore */ String('/src/studio/experience/thumbnails.svelte.ts')
										);
										const stage = cast.getBoundingClientRect();
										const node = cast.querySelector<HTMLElement>('.chosen')!;
										const still = stills.get(node.dataset.characterId!)!;
										const selected = node.querySelector('canvas')!.getBoundingClientRect();
										const bodyCenter =
											selected.left +
											((still.frame.x + still.body.w / 2 - still.body.x) * selected.width) /
												still.image!.w;
										const caption = document
											.querySelector('.selected-caption')!
											.getBoundingClientRect();
										const center = stage.left + stage.width / 2;
										return Math.max(
											Math.abs(bodyCenter - center),
											Math.abs(caption.left + caption.width / 2 - center)
										);
									}),
								{
									message: `${count} characters, selection ${index}: selected cast aligns with its caption`
								}
							)
							.toBeLessThanOrEqual(1);
						const ring = page.locator('.selection-ring');
						await expect(ring).toHaveCount(1);
						await expect(ring).toHaveAttribute(
							'data-selected-id',
							(await page.locator('.cast-character.chosen').getAttribute('data-character-id'))!
						);
						await expect
							.poll(() =>
								ring.evaluate((node) => {
									const bounds = node.getBoundingClientRect();
									const chosen = document
										.querySelector('.cast-character.chosen')!
										.getBoundingClientRect();
									const caption = document
										.querySelector('.selected-caption')!
										.getBoundingClientRect();
									const cast = document.querySelector('.cast')!.getBoundingClientRect();
									const library = document.querySelector('.cast-library')!.getBoundingClientRect();
									return (
										Math.abs(bounds.left + bounds.width / 2 - cast.left - cast.width / 2) <= 1 &&
										bounds.top <= chosen.bottom &&
										bounds.bottom >= chosen.bottom &&
										caption.top - bounds.bottom >= 12 &&
										(!document.querySelector('.sheet-layout') ||
											library.top - caption.bottom >= 11.9)
									);
								})
							)
							.toBe(true);
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
	test('neighboring hit areas meet at the painted gap midpoint and select the nearest character', async ({
		page
	}) => {
		await landing(page);
		await page.evaluate(async () => {
			const { openSource } = await import(/* @vite-ignore */ String('/src/lib/dress/project.ts'));
			const { saveImportedCharacter } = await import(
				/* @vite-ignore */ String('/src/lib/store/import.ts')
			);
			const { refreshProjects, openProject, store } = await import(
				/* @vite-ignore */ String('/src/studio/state.svelte.ts')
			);
			const { project } = await openSource('fixture:s2');
			for (let copy = 1; copy <= 2; copy++)
				await saveImportedCharacter(
					{
						project: { manifest: structuredClone(project.manifest), images: project.images },
						extra: {},
						warnings: []
					},
					`Hit area ${copy}`
				);
			await refreshProjects();
			await openProject(store.projects[0].id);
		});
		await expect(page.locator('.character-row')).toHaveCount(3);
		await expect(page.locator('.cast-character')).toHaveCount(3);
		const settled = () =>
			expect
				.poll(() =>
					page.locator('.cast').evaluate((cast) => cast.getAnimations({ subtree: true }).length)
				)
				.toBe(0);
		const reachable = () =>
			expect
				.poll(() =>
					page
						.locator('.cast-character')
						.evaluateAll((nodes) =>
							nodes.every((node) =>
								(node as HTMLElement).style.getPropertyValue('--cast-reach-left')
							)
						)
				)
				.toBe(true);
		await settled();
		await reachable();

		for (const [width, height] of [
			[1280, 800],
			[390, 844]
		] as const) {
			await page.setViewportSize({ width, height });
			await settled();
			await reachable();
			const gaps = await page.locator('.cast').evaluate((cast) => {
				const rows = [...cast.querySelectorAll<HTMLElement>('.cast-character:not([inert])')]
					.map((node) => {
						const rect = node.getBoundingClientRect();
						return {
							id: node.dataset.characterId!,
							chosen: node.classList.contains('chosen'),
							left: rect.left,
							right: rect.right,
							top: rect.top,
							bottom: rect.bottom
						};
					})
					.sort((left, right) => left.left - right.left);
				return rows.slice(0, -1).map((left, index) => {
					const right = rows[index + 1];
					const middle = (left.right + right.left) / 2;
					const y = (Math.max(left.top, right.top) + Math.min(left.bottom, right.bottom)) / 2;
					const owner = (x: number) =>
						document.elementFromPoint(x, y)?.closest<HTMLElement>('.cast-character')?.dataset
							.characterId ?? null;
					return {
						left: left.id,
						right: right.id,
						chosenIsLeft: left.chosen,
						chosenIsRight: right.chosen,
						middle,
						y,
						leftOwner: owner(middle - 2),
						rightOwner: owner(middle + 2)
					};
				});
			});
			expect(gaps.length).toBeGreaterThan(0);
			for (const gap of gaps) {
				expect(gap.leftOwner, `${width}x${height}: ${gap.left} reaches the midpoint`).toBe(
					gap.left
				);
				expect(gap.rightOwner, `${width}x${height}: ${gap.right} reaches the midpoint`).toBe(
					gap.right
				);
			}
			const gap = gaps.find((entry) => entry.chosenIsLeft || entry.chosenIsRight)!;
			const fromLeft = gap.chosenIsRight;
			const target = fromLeft ? gap.left : gap.right;
			await page.mouse.click(gap.middle + (fromLeft ? -4 : 4), gap.y);
			await expect(page.locator('.cast-character.chosen')).toHaveAttribute(
				'data-character-id',
				target
			);
			await settled();
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

// Real touch through CDP; a mouse walks to a clicked point instead (live views mouse test). Sizes mirror MOTION.joystick.
for (const screen of [
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
			// A blank world point with room for the whole base on the left half (clear of the game controls), nearest the stage center.
			const blank = () =>
				page.evaluate(
					(inset) => {
						const r = document.querySelector('.world-stage')!.getBoundingClientRect();
						const points: { x: number; y: number }[] = [];
						for (let y = r.top + inset; y <= r.bottom - inset; y += 8)
							for (let x = r.left + inset; x < innerWidth / 2; x += 8) points.push({ x, y });
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
			const cdp = await context.newCDPSession(page);
			const press = (type: 'down' | 'move' | 'up', x = 0, y = 0) =>
				cdp.send('Input.dispatchTouchEvent', {
					type: type === 'down' ? 'touchStart' : type === 'move' ? 'touchMove' : 'touchEnd',
					touchPoints: type === 'up' ? [] : [{ x, y, id: 1 }]
				});
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
	// The demo wears its only body item: Random keeps it and re-rolls its colors, as one named undo step.
	const bodyRandom = page.getByRole('button', { name: 'Random body item', exact: true });
	await expect(bodyRandom).toBeEnabled();
	await bodyRandom.click();
	await expect(undo).toHaveAccessibleName('Undo Random body item');
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
			const slots = await page.locator('.slot-rail-column').boundingBox();
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

test('translated State and Move tabs do not overlap on a 320px phone', async ({ page }) => {
	await page.setViewportSize({ width: 320, height: 568 });
	await page.addInitScript(() => localStorage.setItem('pixeldoll.locale', 'tr'));
	await page.goto('/');
	await page.locator('.customize-action').click();
	const labels = page.locator('.equipment-modes [role="tab"] .bu-tab-label');
	await expect(labels).toHaveCount(5);
	const boxes = await labels.evaluateAll((elements) =>
		elements.map((element) => {
			const range = document.createRange();
			range.selectNodeContents(element);
			return range.getBoundingClientRect().toJSON();
		})
	);
	for (const [index, box] of boxes.entries()) {
		expect(box.left).toBeGreaterThanOrEqual(16);
		expect(box.right).toBeLessThanOrEqual(304);
		for (const next of boxes.slice(index + 1))
			expect(box.right <= next.left || box.bottom <= next.top).toBe(true);
	}
});

test('Moves stays in place, disabled with its reason, in the live views', async ({ page }) => {
	await customize(page);
	const tabs = page.getByRole('tablist', { name: 'Customization panels' });
	const moves = tabs.getByRole('tab', { name: 'Moves', exact: true });
	const states = tabs.getByRole('tab', { name: 'States', exact: true });
	const before = (await moves.boundingBox())!;
	const views = page.getByRole('group', { name: 'Character view', exact: true });
	for (const view of ['Top-down', 'Side-scroller']) {
		await views.getByRole('button', { name: view, exact: true }).click();
		await expect(moves).toHaveAttribute('aria-disabled', 'true');
		await expect(states).toHaveAttribute('aria-disabled', 'true');
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
		await page.keyboard.press('Tab');
		await expect(states).toBeFocused();
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
		.getByRole('button', { name: 'Close', exact: true });
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

	test('standing-foot reflections point toward the camera for selection and every world actor', async ({
		page
	}) => {
		await page.setViewportSize({ width: 1440, height: 900 });
		await landing(page);
		await page.evaluate(async () => {
			const state = (await import(
				String('/src/studio/state.svelte.ts')
			)) as typeof import('../../src/studio/state.svelte.ts');
			const { makeImg } = (await import(
				String('/src/lib/image/png.ts')
			)) as typeof import('../../src/lib/image/png.ts');
			const project = state.store.project!;
			const manifest = structuredClone(project.manifest);
			const body = manifest.items.find((item) => item.id === manifest.rig.baseItem)!;
			const image = makeImg(64, 64);
			for (let row = 8; row < 52; row++)
				for (let column = 20; column < 44; column++)
					image.data.set([200, 90, 50, 255], (row * 64 + column) * 4);
			const hash = 'sha256:reflection-body';
			const clip = manifest.rig.animations[0];
			manifest.rig.animations = [{ ...clip, cells: 1, frames: [{ cell: 0, ms: 100 }] }];
			body.layers = [
				{
					id: 'main',
					role: 'fg',
					z: 0,
					cells: {
						[clip.id]: Object.fromEntries(manifest.rig.directions.map(({ id }) => [id, [hash]]))
					}
				}
			];
			manifest.items = [body];
			manifest.rig.rest = Object.fromEntries(
				manifest.rig.directions.map(({ id }) => [id, { image: hash, keypoints: [] }])
			);
			state.store.project = {
				...project,
				manifest,
				images: new Map([...project.images, [hash, image]])
			};
			state.doc.items = {};
			state.ui.playing = false;
			state.doc.rev++;
		});
		await expect
			.poll(() =>
				page
					.locator('.cast-reflection')
					.first()
					.evaluate((canvas: HTMLCanvasElement) => {
						const sprite = document.querySelector<HTMLCanvasElement>(
							'button.cast-character canvas'
						)!;
						const bounds = sprite.getBoundingClientRect();
						const pixels = sprite
							.getContext('2d')!
							.getImageData(0, 0, sprite.width, sprite.height).data;
						let bottom = 0;
						for (let row = 0; row < sprite.height; row++)
							for (let column = 0; column < sprite.width; column++)
								if (pixels[(row * sprite.width + column) * 4 + 3]) bottom = row + 1;
						const floor = bounds.top + (bottom * bounds.height) / sprite.height;
						const reflection = canvas.getBoundingClientRect();
						const alpha = canvas
							.getContext('2d')!
							.getImageData(0, 0, canvas.width, canvas.height).data;
						return (
							Math.abs(reflection.top - floor) < 1 &&
							alpha.some((value, index) => index % 4 === 3 && value > 0)
						);
					})
			)
			.toBe(true);
		await page.locator('.customize-action').click();
		await expect(world(page)).toHaveAttribute('data-presentation', 'animation');
		for (const mode of ['Preview', 'Top-down', 'Side-scroller']) {
			await modes(page).getByRole('button', { name: mode, exact: true }).click();
			const measured = await page.evaluate(async () => {
				const { REFLECTION } = (await import(
					String('/src/studio/experience/reflection.ts')
				)) as typeof import('../../src/studio/experience/reflection.ts');
				const frame = () =>
					new Promise<void>((resolve) =>
						requestAnimationFrame(() => requestAnimationFrame(() => resolve()))
					);
				await frame();
				const canvas = document.querySelector<HTMLCanvasElement>('.world-actors')!;
				const context = canvas.getContext('2d')!;
				const on = context.getImageData(0, 0, canvas.width, canvas.height).data;
				REFLECTION.enabled = false;
				await frame();
				const off = context.getImageData(0, 0, canvas.width, canvas.height).data;
				let changed = 0,
					above = 0,
					alteredBody = 0,
					bottom = 0,
					maxAlpha = 0;
				const bottoms = new Map<number, number>(),
					firstReflections = new Map<number, number>();
				const columns = new Set<number>(),
					reflected = new Set<number>();
				for (let row = 0; row < canvas.height; row++)
					for (let column = 0; column < canvas.width; column++) {
						const offset = (row * canvas.width + column) * 4;
						if (off[offset + 3] === 255) {
							bottom = Math.max(bottom, row + 1);
							columns.add(column);
							bottoms.set(column, row + 1);
						}
					}
				for (let row = 0; row < canvas.height; row++)
					for (let column = 0; column < canvas.width; column++) {
						const offset = (row * canvas.width + column) * 4;
						if (
							on
								.subarray(offset, offset + 4)
								.every((value, channel) => value === off[offset + channel])
						)
							continue;
						changed++;
						if (row < bottom) above++;
						if (off[offset + 3] === 255) alteredBody++;
						if (off[offset + 3] === 0) maxAlpha = Math.max(maxAlpha, on[offset + 3]);
						if (!firstReflections.has(column)) firstReflections.set(column, row);
						reflected.add(column);
					}
				const starts = [...columns].filter((column) => !columns.has(column - 1));
				const covered = starts.every((start) => {
					let end = start;
					while (columns.has(end)) end++;
					return [...reflected].some((column) => column >= start && column < end);
				});
				const contacts = starts.map((start) => {
					let end = start;
					while (columns.has(end)) end++;
					const actorColumns = [...columns].filter((column) => column >= start && column < end);
					const floor = Math.max(...actorColumns.map((column) => bottoms.get(column)!));
					const first = Math.min(
						...actorColumns.map((column) => firstReflections.get(column) ?? Infinity)
					);
					return first - floor;
				});
				REFLECTION.enabled = true;
				await frame();
				return {
					changed,
					above,
					alteredBody,
					maxAlpha,
					alphaLimit: Math.ceil(REFLECTION.opacity * 255),
					covered,
					contacts,
					actors: starts.length
				};
			});
			expect(measured.changed, mode).toBeGreaterThan(0);
			expect(measured.above, mode).toBe(0);
			expect(measured.alteredBody, mode).toBe(0);
			expect(measured.maxAlpha, mode).toBeLessThanOrEqual(measured.alphaLimit);
			expect(measured.covered, mode).toBe(true);
			for (const gap of measured.contacts) {
				expect(gap, mode).toBeGreaterThanOrEqual(0);
				expect(gap, mode).toBeLessThanOrEqual(1);
			}
			expect(measured.actors, mode).toBeGreaterThanOrEqual(mode === 'Preview' ? 2 : 1);
		}
	});

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
		const note = page.locator('.world-coverage');
		await expect(note).toContainText('missing Walk / North frames');
		await expect(note).toContainText('missing Walk / East frames');
		await expect
			.poll(async () => {
				const notice = await note.boundingBox();
				const playback = await page
					.getByRole('toolbar', { name: 'Preview controls' })
					.boundingBox();
				return notice !== null && playback !== null && notice.y >= playback.y + playback.height;
			})
			.toBe(true);
		await page.evaluate(async () => {
			const path = '/src/studio/state.svelte.ts',
				s = (await import(path)) as typeof import('../../src/studio/state.svelte.ts');
			s.store.project!.manifest.items[1].pending = ['walk/north/0', 'walk/east/0'];
			s.doc.rev++;
		});
		await expect(page.locator('.world-loading-items')).toContainText('Lineup hat loading');
		await expect(page.locator('.world-loading-items')).toContainText('North, East');
		await expect(page.locator('.world-coverage').filter({ hasText: 'missing Walk' })).toHaveCount(
			0
		);
	});

	type Rig = [DirectionName, DirectionName?][];
	// Which facings a rig shows is a pure rule, checked for every preset and custom set in test/unit/facing-lineup.test.ts.
	// These rigs prove the stage draws that row: alone, a mirrored pair that shows one, fewer facings than fit (two and
	// three), and eight with and without mirrors.
	const sets: [string, Rig][] = [
		['one direction', [['south']]],
		['side-scroller', [['east'], ['west', 'east']]],
		['front and back', [['south'], ['north']]],
		['three directions', [['south'], ['east'], ['north']]],
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
					.evaluate(async (canvas: HTMLCanvasElement) => {
						// The stage resizes its canvas in its own animation frame, which runs before this one. Without the wait, a
						// one-facing rig (nothing else waits for a paint) could read the previous viewport's frame under load.
						await new Promise((resolve) => requestAnimationFrame(resolve));
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

test.describe('live views actions', () => {
	// Every stage state the scene shows, recorded as it changes: a jump or an attack is over in well under a second.
	const record = (page: Page) =>
		world(page).evaluate((host) => {
			const shown: { clip: string; facing: string; jump: number; mount: string }[] = [];
			(window as unknown as { shown: typeof shown }).shown = shown;
			new MutationObserver(() =>
				shown.push({
					clip: host.dataset.clip ?? '',
					facing: host.dataset.facing ?? '',
					jump: Number(host.dataset.jump || 0),
					mount: host.dataset.mount ?? ''
				})
			).observe(host, { attributes: true });
		});
	const shown = (page: Page) =>
		page.evaluate(
			() =>
				(
					window as unknown as {
						shown: { clip: string; facing: string; jump: number; mount: string }[];
					}
				).shown
		);
	const jumped = async (page: Page, jump: () => Promise<void>) => {
		await record(page);
		await jump();
		await expect
			.poll(async () => Math.max(...(await shown(page)).map((s) => s.jump)))
			.toBeGreaterThan(0.2);
		await expect(world(page)).toHaveAttribute('data-jump', '0.000');
	};
	const attacked = async (page: Page, facing: string, attack: () => Promise<void>) => {
		await record(page);
		await attack();
		await expect(world(page)).toHaveAttribute('data-attack', `cross-punch ${facing}`);
		await expect
			.poll(async () =>
				(await shown(page)).some((s) => s.clip === 'cross-punch' && s.facing === facing)
			)
			.toBe(true);
	};

	test('keys and a mouse jump, mount, attack and walk to a clicked point, and game buttons never take focus', async ({
		page
	}) => {
		await page.setViewportSize({ width: 1280, height: 800 });
		await customize(page);
		await modes(page).getByRole('button', { name: 'Top-down', exact: true }).click();
		const host = world(page);
		await expect(host).toBeFocused();
		await expect(page.locator('.world-hint')).toHaveText(
			'WASD or hold click to move · Shift to sprint · Right-click or E to attack · Space to jump · F to mount'
		);
		const bar = page.getByRole('group', { name: 'Game actions', exact: true });
		const jump = bar.getByRole('button', { name: 'Jump', exact: true });
		const mount = bar.getByRole('button', { name: 'Mount', exact: true });
		const sprint = bar.getByRole('button', { name: 'Sprint', exact: true });
		// Attack first, then Jump, Sprint and Mount, docked at the stage's lower right beside the side panel.
		expect(
			await bar
				.getByRole('button')
				.evaluateAll((buttons) => buttons.map((b) => b.getAttribute('title')))
		).toEqual(['Attack (E or right-click)', 'Jump (Space)', 'Sprint (Shift)', 'Mount (F)']);
		const docked = await page.evaluate(() => {
			const bar = document.querySelector('.game-bar')!.getBoundingClientRect();
			const panel = document.querySelector('.equipment-rail')!.getBoundingClientRect();
			return { gap: panel.left - bar.right, bottom: innerHeight - bar.bottom };
		});
		expect(docked.gap).toBeGreaterThan(0);
		expect(docked.gap).toBeLessThan(40);
		expect(docked.bottom).toBeLessThan(40);
		await expect(jump).toHaveAttribute('aria-keyshortcuts', 'Space');
		await expect(jump).toHaveAttribute('tabindex', '-1');
		await jumped(page, () => page.keyboard.press('Space'));
		await jumped(page, () => jump.click());
		await expect(host).toBeFocused();
		// Held Space jumps again on every landing until it is let go.
		await record(page);
		await page.keyboard.down('Space');
		await expect
			.poll(async () => {
				const heights = (await shown(page)).map((s) => s.jump);
				return heights.filter((h, i) => i > 0 && h > 0 && heights[i - 1] === 0).length;
			})
			.toBeGreaterThanOrEqual(2);
		await page.keyboard.up('Space');
		await expect(host).toHaveAttribute('data-jump', '0.000');
		// Shift sprints while held; the Sprint button toggles it.
		await page.keyboard.down('Shift');
		await expect(host).toHaveAttribute('data-sprint', 'true');
		await page.keyboard.up('Shift');
		await expect(host).toHaveAttribute('data-sprint', '');
		await sprint.click();
		await expect(sprint).toHaveAttribute('aria-pressed', 'true');
		await expect(host).toHaveAttribute('data-sprint', 'true');
		await sprint.click();
		await expect(host).toHaveAttribute('data-sprint', '');
		await expect(host).toBeFocused();
		// M and the Mount button toggle the same mount; the stage keeps the keyboard.
		await expect(mount).toHaveAttribute('aria-pressed', 'false');
		await page.keyboard.press('f');
		await expect(mount).toHaveAttribute('aria-pressed', 'true');
		await expect(host).toHaveAttribute('data-mount', /\S/);
		await mount.click();
		await expect(mount).toHaveAttribute('aria-pressed', 'false');
		await expect(host).not.toHaveAttribute('data-mount');
		await expect(host).toBeFocused();
		// E attacks once along the facing; Automatic plays the demo's Cross punch.
		await attacked(page, 'south', () => page.keyboard.press('e'));
		await expect(host).not.toHaveAttribute('data-clip', 'cross-punch');
		// The Attack button attacks along the facing, like E.
		await attacked(page, 'south', () =>
			bar.getByRole('button', { name: 'Attack', exact: true }).click()
		);
		// A left click walks to the floor point and stops there.
		const [ax, ay] = (await host.getAttribute('data-scene-anchor'))!.split(',').map(Number);
		await page.mouse.click(ax + 240, ay - 20);
		await expect(host).toHaveAttribute('data-destination', /\S/);
		await expect
			.poll(async () => Number((await host.getAttribute('data-position'))!.split(',')[0]))
			.toBeGreaterThan(20);
		await expect(host).toHaveAttribute('data-destination', '', { timeout: 10_000 });
		// A held left button keeps walking toward the floor under a still cursor.
		const along = async () => Number((await host.getAttribute('data-position'))!.split(',')[0]);
		await page.mouse.move(ax + 300, ay - 20);
		await page.mouse.down();
		const start = await along();
		await expect.poll(along).toBeGreaterThan(start + 150);
		const later = await along();
		await expect.poll(along).toBeGreaterThan(later + 150);
		await page.mouse.up();
		await mount.click();
		await page.keyboard.down('d');
		await expect(host).toHaveAttribute('data-mount', /^narrow-saddle east \d+$/);
		await expect(host).toHaveAttribute('data-mount-facing', 'east');
		const [mx, my] = (await host.getAttribute('data-scene-anchor'))!.split(',').map(Number);
		await attacked(page, 'south', () => page.mouse.click(mx, my + 56, { button: 'right' }));
		await page.keyboard.up('d');
		await expect(host).not.toHaveAttribute('data-clip', 'cross-punch');
		const mountedAttack = (await shown(page)).filter((frame) => frame.clip === 'cross-punch');
		expect(mountedAttack.length).toBeGreaterThan(0);
		for (const frame of mountedAttack) {
			expect(frame.facing).toBe('south');
			expect(frame.mount).toMatch(/^narrow-saddle east \d+$/);
		}
		await mount.click();
		// A right click attacks toward the cursor, not the facing, and opens no menu. The walk faced east.
		await page.evaluate(() =>
			addEventListener('contextmenu', (e) =>
				document.body.setAttribute('data-menu', String(e.defaultPrevented))
			)
		);
		// The open stage well west of the body (side panels cover the window's edges).
		const west = await page.evaluate(
			([x, y]) => {
				for (let at = x - 400; at < x - 150; at += 10)
					if (document.elementFromPoint(at, y)?.classList.contains('world-input')) return at;
				return null;
			},
			[ax, ay - 300]
		);
		expect(west, 'open stage west of the character').not.toBeNull();
		await page.mouse.click(west!, ay - 300, { button: 'right' });
		await expect(page.locator('body'), 'the stage right press opens no menu').toHaveAttribute(
			'data-menu',
			'true'
		);
		// Above and west of the body: no south art within 90°, and never the walk's east facing.
		await expect(host).toHaveAttribute('data-attack', /^missing (west|north-west)$/);
		// Chorded buttons: walking to a left-press point continues while the right button aims and attacks.
		await page.mouse.move(ax + 300, ay - 20);
		await page.mouse.down();
		await expect(host).toHaveAttribute('data-destination', /\S/);
		// A held left button steers every frame; once right is held too, the destination stays where it was.
		await page.mouse.down({ button: 'right' });
		const target = (await host.getAttribute('data-destination'))!;
		await page.mouse.move(ax - 200, ay - 150, { steps: 3 });
		// The right-held cursor only aims: the walk keeps its point, or has already reached it.
		const [now, at] = await host.evaluate((element) => [
			element.dataset.destination!,
			Number(element.dataset.position!.split(',')[0])
		]);
		if (now) expect(now).toBe(target);
		else expect(Math.abs((at as number) - Number(target.split(',')[0]))).toBeLessThan(0.5);
		await page.mouse.up({ button: 'right' });
		await page.mouse.up();
		// A keyboard-opened menu (button 0) stays native.
		expect(
			await page.evaluate(() => {
				const event = new MouseEvent('contextmenu', { bubbles: true, cancelable: true });
				document.querySelector('.world-input')!.dispatchEvent(event);
				return event.defaultPrevented;
			}),
			'a keyboard menu stays native'
		).toBe(false);
	});

	test('Walk while attacking layers tracked frames and keeps the on-foot speed factor in full mode', async ({
		page
	}) => {
		const bench = new URL('../fixtures/bench/', import.meta.url);
		const body = JSON.parse(await readFile(new URL('bodyA.json', bench), 'utf8'));
		const atlas = await decodePngBytes(await readFile(new URL('bodyA.png', bench)));
		const clips = { walk: 'walk', 'cross-punch': 'slash' } as const;
		for (const [clip, sourceClip] of Object.entries(clips)) {
			await page.route(`**/fixtures/s2/layers/body/base/main/${clip}.png*`, async (route) => {
				const response = await route.fetch();
				const original = await decodePngBytes(await response.body());
				const move = body.rig.animations.find(({ id }: { id: string }) => id === sourceClip);
				const sheet = makeImg(move.cells * 64, original.h);
				for (let row = 64; row < original.h; row++) {
					const start = row * original.w * 4;
					sheet.data.set(original.data.subarray(start, start + original.w * 4), row * sheet.w * 4);
				}
				for (let cell = 0; cell < sheet.w / 64; cell++) {
					const start = body.cols.indexOf(`${sourceClip}/${cell}`) * 64;
					for (let row = 0; row < 64; row++) {
						const offset = (row * atlas.w + start) * 4;
						sheet.data.set(
							atlas.data.subarray(offset, offset + 64 * 4),
							(row * sheet.w + cell * 64) * 4
						);
					}
				}
				await route.fulfill({ response, body: Buffer.from(await encodePngBytes(sheet)) });
			});
		}
		await page.route('**/fixtures/s2/fixture.json*', async (route) => {
			const response = await route.fetch();
			const fixture = await response.json();
			fixture.presets = [fixture.presets[1]];
			for (const [clip, sourceClip] of Object.entries(clips)) {
				const move = fixture.rig.animations.find(({ id }: { id: string }) => id === clip);
				const source = body.rig.animations.find(({ id }: { id: string }) => id === sourceClip);
				move.cells = source.cells;
				move.frames = source.frames.map((frame: { cell: number; ms: number }) =>
					sourceClip === 'slash' && frame.cell === 5 ? { ...frame, cell: 4 } : frame
				);
				move.sources = {
					south: {
						keypoints: Array.from(
							{ length: move.cells },
							(_, cell) => source.sources.south.keypoints[cell]
						)
					}
				};
			}
			await route.fulfill({ response, json: fixture });
		});
		await customize(page);
		await equipmentGroup(page, 'Head');
		await modes(page).getByRole('button', { name: 'Top-down', exact: true }).click();
		const host = world(page);
		const attackFrame = async (layered: string, reason: string) => {
			await host.evaluate((element) => {
				const host = element as HTMLElement & {
					recordedRates?: {
						clip?: string;
						scale?: string;
						walk?: string;
						attackLayered?: string;
					}[];
					stopRateObserver?: () => void;
				};
				const frames: NonNullable<typeof host.recordedRates> = (host.recordedRates = []);
				const observer = new MutationObserver(() => {
					const { clip, attackTravelScale: scale, walkCell: walk, attackLayered } = element.dataset;
					const last = frames.at(-1);
					if (
						last?.clip !== clip ||
						last?.scale !== scale ||
						last?.walk !== walk ||
						last?.attackLayered !== attackLayered
					)
						frames.push({ clip, scale, walk, attackLayered });
				});
				observer.observe(element, { attributes: true });
				host.stopRateObserver = () => observer.disconnect();
			});
			await page.keyboard.down('s');
			try {
				await expect(host).toHaveAttribute('data-clip', 'walk');
				await page.keyboard.down('e');
				try {
					await expect
						.poll(() =>
							host.evaluate((element) => [
								element.dataset.clip,
								element.dataset.attackLayered,
								element.dataset.attackFallback,
								element.dataset.attackTravelScale
							])
						)
						.toEqual(['cross-punch', layered, reason, '0.8']);
				} finally {
					await page.keyboard.up('e');
				}
				await expect
					.poll(() =>
						host.evaluate((element) => [element.dataset.clip, element.dataset.attackTravelScale])
					)
					.toEqual(['walk', '1']);
				const samples = await host.evaluate((element) => {
					const host = element as HTMLElement & {
						recordedRates?: {
							clip?: string;
							scale?: string;
							walk?: string;
							attackLayered?: string;
						}[];
						stopRateObserver?: () => void;
					};
					host.stopRateObserver?.();
					return host.recordedRates ?? [];
				});
				const firstAttack = samples.findIndex((frame) => frame.clip === 'cross-punch');
				expect(firstAttack).toBeGreaterThan(0);
				expect(samples[firstAttack].scale).toBe('0.8');
				expect(
					new Set(
						samples
							.filter((frame) => frame.clip === 'cross-punch')
							.map((frame) => frame.attackLayered)
					)
				).toEqual(new Set([layered]));
				expect(samples.slice(firstAttack).find((frame) => frame.clip === 'walk')?.scale).toBe('1');
				expect(
					new Set(
						samples.filter((frame) => frame.clip === 'cross-punch').map((frame) => frame.walk)
					).size
				).toBeGreaterThan(1);
			} finally {
				await page.keyboard.up('s');
			}
		};
		await attackFrame('true', '');
		const hat = page.getByRole('button', { name: /^Wizard hat(,|$)/ });
		await expect(hat).toHaveAttribute('aria-pressed', 'false');
		await hat.evaluate((button) => {
			if (!(button instanceof HTMLButtonElement)) throw new Error('Expected Wizard hat button');
			const stage = document.querySelector<HTMLElement>('.world-stage')!;
			let state = 0;
			const observer = new MutationObserver(() => {
				if (stage.dataset.clip !== 'cross-punch') {
					if (state) observer.disconnect();
					return;
				}
				const { attackLayered, attackFallback } = stage.dataset;
				if (state === 0 && attackLayered === 'true') {
					state = 1;
					button.click();
				} else if (
					state === 1 &&
					button.getAttribute('aria-pressed') === 'true' &&
					attackLayered === 'true'
				) {
					state = 2;
					button.click();
				} else if (state >= 2 && button.getAttribute('aria-pressed') === 'false') {
					state = 3;
				}
				if (state)
					stage.dataset.outfitActionSample = [state, attackLayered, attackFallback].join('/');
			});
			observer.observe(stage, {
				attributes: true,
				attributeFilter: [
					'data-clip',
					'data-attack-layered',
					'data-attack-fallback',
					'data-walk-cell'
				]
			});
			observer.observe(button, { attributes: true, attributeFilter: ['aria-pressed'] });
		});
		await page.keyboard.down('s');
		try {
			await expect(host).toHaveAttribute('data-clip', 'walk');
			await page.keyboard.press('e');
			await expect(host).toHaveAttribute('data-outfit-action-sample', '3/true/');
			await expect(hat).toHaveAttribute('aria-pressed', 'false');
			await expect(host).toHaveAttribute('data-clip', 'walk');
			await expect(host).toHaveAttribute('data-outfit-action-sample', '3/true/');
		} finally {
			await page.keyboard.up('s');
		}
		await page.keyboard.press('Control+,');
		const settings = page.getByRole('dialog', { name: 'Settings' });
		await settings.getByRole('button', { name: 'Live views', exact: true }).click();
		expect(
			await settings
				.locator('[data-setting^="live-"]')
				.evaluateAll((rows) => rows.map((row) => row.getAttribute('data-setting')))
		).toEqual([
			'live-idle',
			'live-walk',
			'live-run',
			'live-jump',
			'live-attack',
			'live-waist',
			'live-attackUp',
			'live-attackDown'
		]);
		const toggle = settings.getByRole('switch', { name: 'Walk while attacking' });
		await expect(toggle).toBeChecked();
		const waist = settings.locator('[data-setting="live-waist"]');
		const waistInput = waist.getByRole('spinbutton', { name: /Waist/ });
		const auto = waist.getByRole('button', { name: 'Auto', exact: true });
		const stepper = waist.locator('.stepper');
		const controls = waist.locator('.layering-controls');
		const label = waist.getByText('Waist', { exact: true });
		await expect(waistInput).toHaveValue('0');
		await expect(auto).toHaveAttribute('aria-pressed', 'true');
		const initialLabel = (await label.boundingBox())!;
		const initialControls = (await controls.boundingBox())!;
		const initialAuto = (await auto.boundingBox())!;
		const initialStepper = (await stepper.boundingBox())!;
		expect(initialControls.y).toBeGreaterThanOrEqual(initialLabel.y + initialLabel.height);
		expect(Math.abs(initialAuto.height - initialStepper.height)).toBeLessThan(1);
		await waist.getByRole('button', { name: 'Lower waist', exact: true }).click();
		await expect(waistInput).toHaveValue('1');
		await expect(auto).toHaveAttribute('aria-pressed', 'false');
		await waist.getByRole('button', { name: 'Raise waist', exact: true }).click();
		await expect(waistInput).toHaveValue('0');
		await expect(auto).toHaveAttribute('aria-pressed', 'true');
		const start = (await waistInput.boundingBox())!;
		await waistInput.fill('2');
		await expect(auto).toHaveAttribute('aria-pressed', 'false');
		await expect(waistInput).toHaveValue('2');
		const moved = (await waistInput.boundingBox())!;
		const movedLabel = (await label.boundingBox())!;
		const movedAuto = (await auto.boundingBox())!;
		expect(moved.x).toBe(start.x);
		expect(moved.width).toBe(start.width);
		expect(movedLabel.x).toBe(initialLabel.x);
		expect(movedAuto.x).toBe(initialAuto.x);
		expect(Math.abs(movedAuto.height - initialStepper.height)).toBeLessThan(1);
		const stored = () =>
			page.evaluate(() => JSON.parse(localStorage.getItem('pixeldoll.liveViews')!));
		expect(await stored()).toMatchObject({
			layering: { 'fixture:s2': { on: true, waist: 2 } }
		});
		await auto.click();
		await expect(waistInput).toHaveValue('0');
		await expect(auto).toHaveAttribute('aria-pressed', 'true');
		expect((await stored()).layering?.['fixture:s2']).toBeUndefined();
		await toggle.uncheck();
		await expect(settings.getByRole('spinbutton', { name: /Waist/ })).toHaveCount(0);
		await page.keyboard.press('Escape');
		await expect(settings).toHaveCount(0);
		await host.focus();
		await attackFrame('false', 'disabled');
	});

	test('Live views settings save the clip each action plays per character', async ({ page }) => {
		await customize(page);
		await page.keyboard.press('Control+,');
		const settings = page.getByRole('dialog', { name: 'Settings' });
		const open = () => settings.getByRole('button', { name: 'Live views', exact: true }).click();
		await open();
		const attack = settings.getByRole('button', { name: /^Attack: / });
		await expect(attack).toHaveAccessibleName('Attack: Automatic: Cross punch');
		await attack.click();
		await page.getByRole('menuitemradio', { name: 'Walk', exact: true }).click();
		await expect(attack).toHaveAccessibleName('Attack: Walk');
		expect(
			await page.evaluate(() => JSON.parse(localStorage.getItem('pixeldoll.liveViews')!))
		).toEqual({ roles: { 'fixture:s2': { attack: 'walk' } } });
		await page.reload();
		await page.locator('.customize-action').click();
		await page.keyboard.press('Control+,');
		await open();
		await expect(attack).toHaveAccessibleName('Attack: Walk');
	});

	test.describe('on touch', () => {
		test.use({ viewport: { width: 844, height: 390 }, isMobile: true, hasTouch: true });
		test('one stick moves from anywhere, and the Attack stick attacks at once and turns while held', async ({
			page,
			context
		}) => {
			await customize(page);
			await modes(page).getByRole('button', { name: 'Top-down', exact: true }).click();
			const host = world(page);
			const actions = page.getByRole('group', { name: 'Game actions', exact: true });
			const jump = actions.getByRole('button', { name: 'Jump', exact: true });
			const stick = actions.getByRole('button', { name: 'Attack', exact: true });
			await jumped(page, () => jump.tap());
			// The cluster: the Attack stick at the lower right, Jump above it, Sprint and Mount to its upper left.
			const boxes = await page.evaluate(() =>
				Object.fromEntries(
					[...document.querySelectorAll('.game-touch button')].map((b) => {
						const r = b.getBoundingClientRect();
						return [
							b.getAttribute('aria-label'),
							{ x: r.x + r.width / 2, y: r.y + r.height / 2, w: r.width }
						];
					})
				)
			);
			expect(boxes.Attack.w).toBeGreaterThan(boxes.Jump.w);
			expect(boxes.Jump.y).toBeLessThan(boxes.Attack.y);
			expect(boxes.Sprint.x).toBeLessThan(boxes.Attack.x);
			expect(boxes.Mount.x).toBeLessThan(boxes.Sprint.x);
			// An open world point on the stage's right half: movement starts on either side now.
			const point = await page.evaluate(() => {
				for (let y = innerHeight * 0.35; y > 40; y -= 8)
					for (let x = innerWidth * 0.4; x < innerWidth * 0.6; x += 8)
						if (document.elementFromPoint(x, y)?.classList.contains('world-input'))
							return { x: Math.round(x), y: Math.round(y) };
				return null;
			});
			expect(point, 'an open point on the right half').toBeTruthy();
			const cdp = await context.newCDPSession(page);
			const move = { ...point!, id: 1 };
			const thumb = { x: Math.round(boxes.Attack.x), y: Math.round(boxes.Attack.y), id: 2 };
			const touch = (
				type: 'touchStart' | 'touchMove' | 'touchEnd',
				points: { x: number; y: number; id: number }[]
			) => cdp.send('Input.dispatchTouchEvent', { type, touchPoints: points });
			const x = async () => Number((await host.getAttribute('data-position'))!.split(',')[0]);
			try {
				await touch('touchStart', [move]);
				await touch('touchMove', [{ ...move, x: move.x + 42 }]);
				await expect.poll(x).toBeGreaterThan(2);
				// A second finger on the Attack stick attacks at once along the facing, while the walk goes on.
				const walked = await x();
				await expect(stick).not.toHaveClass(/held/);
				await touch('touchStart', [{ ...move, x: move.x + 42 }, thumb]);
				await expect(stick).toHaveClass(/held/);
				await expect(page.locator('.stick-control-held')).toBeVisible();
				await expect(host).toHaveAttribute('data-attack', /^(cross-punch|missing) /);
				// Dragged down, it aims south: the demo's south punch.
				await attacked(page, 'south', async () => {
					await touch('touchMove', [
						{ ...move, x: move.x + 42 },
						{ ...thumb, y: thumb.y + 30 }
					]);
				});
				await expect.poll(x).toBeGreaterThan(walked + 2);
				// touchEnd names the finger that lifts; the stick snaps back to rest.
				await touch('touchEnd', [{ ...thumb, y: thumb.y + 30 }]);
				await expect(stick).not.toHaveClass(/held/);
				await expect(page.locator('.stick-control-held')).toHaveCount(0);
				await touch('touchEnd', [{ ...move, x: move.x + 42 }]);
			} finally {
				await cdp.detach();
			}
		});
	});
	test('a held attack turns with the cursor mid-swing and carries on from the same frame', async ({
		page
	}) => {
		// Cross punch borrows Walk's art, which has every facing, so the swing can turn.
		await page.route('**/layers/body/base/main/cross-punch.png*', (route) =>
			route.fulfill({ path: 'public/fixtures/s2/layers/body/base/main/walk.png' })
		);
		await page.setViewportSize({ width: 1280, height: 800 });
		await customize(page);
		await modes(page).getByRole('button', { name: 'Top-down', exact: true }).click();
		const host = world(page);
		const [ax, ay] = (await host.getAttribute('data-scene-anchor'))!.split(',').map(Number);
		type Shown = { attack: string; cell: number; at: number };
		await host.evaluate((element) => {
			const shown: Shown[] = [];
			(window as unknown as { shown: Shown[] }).shown = shown;
			new MutationObserver(() =>
				shown.push({
					attack: element.dataset.attack ?? '',
					cell: Number(element.dataset.cell),
					at: performance.now()
				})
			).observe(element, { attributeFilter: ['data-attack', 'data-cell'] });
		});
		await page.mouse.move(ax + 160, ay - 60);
		await page.mouse.down({ button: 'right' });
		await expect(host).toHaveAttribute('data-attack', 'cross-punch east');
		// Two frames into the swing (100 ms each), the cursor crosses to the west.
		await page.waitForTimeout(250);
		await page.mouse.move(ax - 160, ay - 60, { steps: 2 });
		await expect(host).toHaveAttribute('data-attack', 'cross-punch west');
		await page.mouse.up({ button: 'right' });
		const shown = await page.evaluate(() => (window as unknown as { shown: Shown[] }).shown);
		const east = shown.find((s) => s.attack === 'cross-punch east')!;
		const west = shown.find((s) => s.attack === 'cross-punch west')!;
		// The same swing turned before it ended (600 ms), and the west art did not restart at its first frame.
		expect(west.at - east.at).toBeLessThan(550);
		expect(west.cell).toBeGreaterThanOrEqual(2);
	});
});

test.describe('live view framing', () => {
	// The topmost opaque actor pixel, so an underestimated reach shows up as cropped art, not just a wrong number.
	const paintedTop = (page: Page) =>
		page.evaluate(() => {
			const canvas = document.querySelector<HTMLCanvasElement>('.world-actors')!;
			const pixels = canvas.getContext('2d')!.getImageData(0, 0, canvas.width, canvas.height).data;
			for (let y = 0; y < canvas.height; y++)
				for (let x = 0; x < canvas.width; x++)
					if (pixels[(y * canvas.width + x) * 4 + 3] >= 200)
						return (y * canvas.getBoundingClientRect().height) / canvas.height;
			return Infinity;
		});
	for (const screen of [
		{ name: 'desktop', width: 1280, height: 800 },
		{ name: 'phone portrait', width: 390, height: 844 }
	])
		test(`${screen.name}: the body stands mid-stage with its reach in view, walking south and in a mounted jump`, async ({
			page
		}) => {
			await page.setViewportSize({ width: screen.width, height: screen.height });
			await customize(page);
			const host = world(page);
			const frame = () =>
				host.evaluate((element) => {
					const stage = element.getBoundingClientRect();
					return { top: stage.top, bottom: stage.bottom, feet: Number(element.dataset.feetY) };
				});
			for (const view of ['Top-down', 'Side-scroller'] as const) {
				await modes(page).getByRole('button', { name: view, exact: true }).click();
				await expect(host).toHaveAttribute('data-feet-y', /\d/);
				const rest = await frame();
				// Raised off the bottom, and every painted pixel inside the stage.
				expect(rest.feet).toBeLessThan(rest.top + (rest.bottom - rest.top) * 0.8);
				expect(await paintedTop(page)).toBeGreaterThanOrEqual(rest.top);
				await host.focus();
				const key = view === 'Top-down' ? 's' : 'd';
				const start = await host.getAttribute('data-position');
				await page.keyboard.down(key);
				await expect(host).not.toHaveAttribute('data-position', start!);
				await page.waitForTimeout(800);
				const walking = await frame();
				await page.keyboard.up(key);
				// The leading camera keeps a steady walk close to where it started.
				expect(Math.abs(walking.feet - rest.feet)).toBeLessThan(12);
			}
			// Zoomed well in, a steady walk south still drifts no further on screen and the feet stay in the stage.
			await modes(page).getByRole('button', { name: 'Top-down', exact: true }).click();
			await host.focus();
			const fitZoom = Number(await host.getAttribute('data-scene-zoom'));
			for (let step = 0; step < 6; step++) await page.keyboard.press('+');
			await expect
				.poll(async () => Number(await host.getAttribute('data-scene-zoom')))
				.toBeGreaterThan(fitZoom * 1.8);
			const zoomed = await frame();
			await page.keyboard.down('s');
			await page.waitForTimeout(1200);
			const south = await frame();
			await page.keyboard.up('s');
			expect(Math.abs(south.feet - zoomed.feet)).toBeLessThan(16);
			expect(south.feet).toBeLessThanOrEqual(south.bottom);
			await page.keyboard.press('0');
			// Mounted, at the top of a jump, nothing painted leaves the top of the stage.
			await page.keyboard.press('f');
			await expect(host).toHaveAttribute('data-mount', /\S/);
			const top = (await frame()).top;
			await host.focus();
			const jumping = page.keyboard.press('Space');
			// A jump lasts under half a second: sample the height and the painted top together on every frame.
			const apex = await page.evaluate(
				() =>
					new Promise<{ height: number; top: number }>((resolve) => {
						const stage = document.querySelector<HTMLElement>('.world-stage')!,
							canvas = document.querySelector<HTMLCanvasElement>('.world-actors')!;
						let best = { height: 0, top: Infinity };
						const started = performance.now();
						const frame = () => {
							const height = Number(stage.dataset.jump);
							if (height > best.height) {
								const pixels = canvas
									.getContext('2d')!
									.getImageData(0, 0, canvas.width, canvas.height).data;
								let top = Infinity;
								for (let y = 0; y < canvas.height && top === Infinity; y++)
									for (let x = 0; x < canvas.width; x++)
										if (pixels[(y * canvas.width + x) * 4 + 3] >= 200) {
											top = (y * canvas.getBoundingClientRect().height) / canvas.height;
											break;
										}
								best = { height, top };
							}
							if (performance.now() - started < 1200) requestAnimationFrame(frame);
							else resolve(best);
						};
						requestAnimationFrame(frame);
					})
			);
			await jumping;
			expect(apex.height).toBeGreaterThan(0.3);
			expect(Number.isFinite(apex.top)).toBe(true);
			expect(apex.top).toBeGreaterThanOrEqual(top);
			await page.keyboard.press('f');
		});
});
