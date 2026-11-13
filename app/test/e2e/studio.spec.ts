import {
	openStudio,
	reloadStudio,
	enterStudio,
	equipmentMode,
	equipmentGroup,
	newItem,
	selectedItemDetails,
	inspectStage,
	openAccount,
	pickItem,
	section
} from './immersive-helpers.ts';
import { expect, test, type BrowserContext, type Locator, type Page } from '@playwright/test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { unzip, zip } from '../../src/lib/store/zip.ts';
import { CURRENT_FORMAT } from '../../src/lib/store/manifest.ts';
import './studio-thumbnails.ts';
import './dialog-dismissal.ts';

test.beforeEach(async ({ context }) => {
	await context.route('https://*.pixellab.ai/**', (route) => route.abort()); // stay offline by default; a test's own route overrides this
});

async function reviewSelectedDraft(page: Page) {
	await page.evaluate(async () => {
		const path = '/src/studio/state.svelte.ts',
			state = await import(path);
		await state.openGenerationReview(state.ui.selected.slice(4));
	});
}

async function standingItemCharacter(page: Page) {
	await page.evaluate(async () => {
		const statePath = '/src/studio/state.svelte.ts',
			s = await import(statePath);
		const projectPath = '/src/lib/store/project.ts',
			project = await import(projectPath);
		const dbPath = '/src/lib/store/db.ts',
			db = await import(dbPath);
		await s.copyDemo();
		const ctx = await project.loadProject(s.doc.id),
			m = ctx.rec.manifest;
		// A standing frame keeps the real pipeline small; the API duplicates it to meet the two-frame edit minimum.
		const walk = m.rig.animations.find((a: { id: string }) => a.id === 'walk');
		m.rig.animations = [
			{ ...walk, id: 'custom-standing', cells: 1, frames: walk.frames.slice(0, 1) }
		];
		m.rig.directions = m.rig.directions.filter((d: { id: string }) => d.id === 'south');
		delete m.rig.rest;
		m.items = m.items.filter((item: { id: string }) => item.id === m.rig.baseItem);
		const base = m.items[0].layers[0];
		base.cells = { 'custom-standing': { south: base.cells.walk.south.slice(0, 1) } };
		await db.put('projects', ctx.rec.id, ctx.rec);
		await s.openProject(ctx.rec.id);
	});
}

async function expectGenerationTileGeometry(tile: Locator, running = true) {
	const bounds = await tile.evaluate((element) => {
		const rect = element.getBoundingClientRect(),
			empty = element.closest('.slot-tiles')!.querySelector('.item-tile[data-variant="empty"]')!,
			emptyRect = empty.getBoundingClientRect(),
			emptyIcon = empty.querySelector('.bu-tile-art svg')!.getBoundingClientRect(),
			name = element.querySelector('.tile-name')!,
			time = element.querySelector('.generation-time')!,
			ring = element.querySelector('.generation-ring')?.getBoundingClientRect(),
			percent = element.querySelector('.generation-percent')?.getBoundingClientRect();
		const line = (node: Element) => {
			const box = node.getBoundingClientRect(),
				style = getComputedStyle(node);
			return {
				height: box.height,
				lineHeight: parseFloat(style.lineHeight),
				top: box.top,
				bottom: box.bottom,
				left: box.left,
				right: box.right,
				whiteSpace: style.whiteSpace,
				overflow: style.overflow,
				ellipsis: style.textOverflow,
				color: style.color
			};
		};
		return {
			height: rect.height,
			width: rect.width,
			emptyHeight: emptyRect.height,
			emptyWidth: emptyRect.width,
			left: rect.left,
			right: rect.right,
			bottom: rect.bottom,
			name: line(name),
			time: line(time),
			emptyNameBottom:
				empty.querySelector('.bu-tile-label')!.getBoundingClientRect().bottom - emptyRect.top,
			ring: ring && {
				width: ring.width,
				height: ring.height,
				top: ring.top,
				bottom: ring.bottom,
				centerX: ring.x + ring.width / 2 - rect.x,
				centerY: ring.y + ring.height / 2 - rect.y
			},
			iconCenterY: emptyIcon.y + emptyIcon.height / 2 - emptyRect.y,
			percent: percent && {
				top: percent.top,
				bottom: percent.bottom,
				height: percent.height,
				lineHeight: parseFloat(
					getComputedStyle(element.querySelector('.generation-percent')!).lineHeight
				)
			}
		};
	});
	expect(bounds.height).toBe(102);
	expect(bounds.height).toBe(bounds.emptyHeight);
	expect(bounds.width).toBeCloseTo(bounds.emptyWidth, 1);
	for (const line of [bounds.name, bounds.time]) {
		expect(line.height).toBeCloseTo(line.lineHeight, 1);
		expect(line.whiteSpace).toBe('nowrap');
		expect(line.overflow).toBe('hidden');
		expect(line.ellipsis).toBe('ellipsis');
		expect(line.left).toBeGreaterThanOrEqual(bounds.left);
		expect(line.right).toBeLessThanOrEqual(bounds.right);
		expect(line.bottom).toBeLessThanOrEqual(bounds.bottom);
	}
	expect(bounds.time.color).not.toBe(bounds.name.color);
	expect(bounds.time.bottom).toBeCloseTo(bounds.name.top, 1);
	expect(bounds.name.bottom - (bounds.bottom - bounds.height)).toBeCloseTo(
		bounds.emptyNameBottom,
		1
	);
	if (running) {
		expect(bounds.ring!.width).toBe(24);
		expect(bounds.ring!.height).toBe(24);
		expect(bounds.ring!.centerX).toBeCloseTo(bounds.width / 2, 1);
		expect(bounds.ring!.centerY).toBeCloseTo(bounds.iconCenterY, 1);
		expect(bounds.percent!.height).toBeCloseTo(bounds.percent!.lineHeight, 1);
		expect(bounds.percent!.bottom).toBeLessThanOrEqual(bounds.ring!.top);
		expect(bounds.ring!.bottom).toBeLessThanOrEqual(bounds.time.top);
	}
}

async function showNotification(
	page: Page,
	message: string,
	options?: Parameters<typeof import('../../src/studio/state.svelte.ts').toast>[1]
) {
	await page.evaluate(
		async ({ message, options }) => {
			const path = '/src/studio/state.svelte.ts',
				state = await import(path);
			state.toast(message, options);
		},
		{ message, options }
	);
}

test('notifications support optional titles, keyboard dismissal and visible errors inside dialogs', async ({
	page
}, info) => {
	const dev = info.config.projects.find((p) => p.name === 'browser-selftests')!.use.baseURL!;
	await page.goto(dev);
	const notice = page.locator('.toast');
	await expect(notice.locator('strong')).toHaveText(/^Preview · v/);
	await expect(notice.locator('[data-tone]')).toHaveAttribute('data-tone', 'warning');
	await expect(notice).not.toContainText('—');
	const world = page.locator('.selection-world');
	await world.focus();
	const dismiss = () => notice.getByRole('button', { name: 'Dismiss notification' });
	await dismiss().focus();
	await page.keyboard.press('Enter');
	await expect(notice).toHaveCount(0);
	await expect(world).toBeFocused();
	await showNotification(page, 'Saved changes');
	await expect(notice).toContainText('Saved changes');
	await expect(notice.locator('strong')).toHaveCount(0);
	await dismiss().click();
	await enterStudio(page);
	await showNotification(page, 'Preview details', {
		title: 'Preview',
		tone: 'warning',
		duration: 0
	});
	await page.getByRole('button', { name: 'Export', exact: true }).click();
	const dialog = page.getByRole('dialog');
	await expect(dialog).toBeVisible();
	await expect(notice).toHaveCount(0);
	await showNotification(page, 'Could not save your character.', { tone: 'danger' });
	await expect(dialog.getByRole('alert')).toContainText('Could not save your character.');
	await showNotification(page, 'Downloaded example.zip');
	await expect(dialog.getByRole('alert')).toContainText('Could not save your character.');
	await expect(notice).not.toContainText('Downloaded example.zip');
	await dismiss().click();
	await expect(dialog).toBeVisible();
	await page.keyboard.press('Escape');
	await expect(dialog).toHaveCount(0);
	await showNotification(page, 'Could not save before opening Export.', { tone: 'danger' });
	await page.getByRole('button', { name: 'Export', exact: true }).click();
	await expect(dialog.getByRole('alert')).toContainText('Could not save before opening Export.');
	await page.setViewportSize({ width: 320, height: 568 });
	await showNotification(
		page,
		'Could not save. ' + 'Detailed-recovery-information-without-spaces'.repeat(35),
		{ tone: 'danger' }
	);
	await expect.poll(() => notice.evaluate((el) => el.scrollHeight > el.clientHeight)).toBe(true);
	// Inside a sheet the long message stays under its title and close button and above its bottom edge.
	await expect
		.poll(() =>
			notice.evaluate((el) => {
				const r = el.getBoundingClientRect(),
					dialog = el.closest('dialog')!.getBoundingClientRect(),
					head = el.closest('dialog')!.querySelector('.sheet-head')!.getBoundingClientRect();
				return r.top >= head.bottom && r.bottom <= dialog.bottom;
			})
		)
		.toBe(true);
	await notice.evaluate((el) => (el.scrollTop = el.scrollHeight));
	const close = await dismiss().boundingBox();
	expect(close).not.toBeNull();
	expect(close!.x).toBeGreaterThanOrEqual(0);
	expect(close!.y).toBeGreaterThanOrEqual(0);
	expect(close!.x + close!.width).toBeLessThanOrEqual(320);
	expect(close!.y + close!.height).toBeLessThanOrEqual(568);
	await dismiss().click();
	await expect(notice).toHaveCount(0);
	await page.keyboard.press('Escape');
	await expect(dialog).toHaveCount(0);
	// On a phone's Customize screen a long message scrolls inside its region, never down over the equipment sheet.
	await page.setViewportSize({ width: 390, height: 844 });
	await showNotification(page, 'Saved. ' + 'A long status message that keeps going. '.repeat(60), {
		duration: 0
	});
	await expect(notice).toBeVisible();
	await expect
		.poll(async () => {
			const toast = (await notice.boundingBox())!,
				sheet = (await page.locator('.equipment-rail').boundingBox())!;
			return toast.y + toast.height <= sheet.y - 11;
		})
		.toBe(true);
	expect(await notice.evaluate((el) => el.scrollHeight > el.clientHeight)).toBe(true);
});

test('the startup preview notice expires after eight seconds', async ({ page }, info) => {
	const dev = info.config.projects.find((p) => p.name === 'browser-selftests')!.use.baseURL!;
	const time = new Date('2026-11-02T12:00:00Z');
	// Pause after the installed time: the installed clock runs until the pause, and pausing in its past throws (seen under load).
	await page.clock.install({ time });
	await page.clock.pauseAt(new Date(time.getTime() + 1000));
	await page.goto(dev);
	const preview = page.getByRole('status').filter({ hasText: /Preview · v/ });
	await expect(preview).toBeVisible();
	await page.clock.fastForward(7999);
	await expect(preview).toBeVisible();
	await page.clock.fastForward(1);
	await expect(preview).toHaveCount(0);
});

for (const [width, height] of [
	[1440, 900],
	[390, 844],
	[844, 390]
])
	test.describe(`toast activation ${width}x${height}`, () => {
		test.use({ viewport: { width, height }, hasTouch: width < 1000, isMobile: width < 1000 });
		test('body dismisses or runs its primary action, while close only dismisses', async ({
			page
		}, info) => {
			const dev = info.config.projects.find((p) => p.name === 'browser-selftests')!.use.baseURL!;
			await page.goto(dev);
			const notice = page.locator('.toast'),
				gesture = width < 1000 ? 'tap' : 'click';
			await notice
				.getByRole('button', { name: /^Preview · v/ })
				[gesture]({ position: { x: 8, y: 8 } });
			await expect(notice).toHaveCount(0);
			await enterStudio(page);
			const offerExport = () =>
				page.evaluate(async () => {
					const path = '/src/studio/state.svelte.ts',
						s = await import(path);
					s.toast('Open export', {
						duration: 0,
						action: () => {
							s.ui.sheet = 'export';
						}
					});
				});
			await offerExport();
			await notice.getByRole('button', { name: 'Dismiss notification' })[gesture]();
			await expect(notice).toHaveCount(0);
			await expect(page.getByRole('dialog')).toHaveCount(0);
			await offerExport();
			await notice.getByRole('button', { name: 'Open export', exact: true })[gesture]();
			const dialog = page.getByRole('dialog', { name: 'Export', exact: true });
			await expect(dialog).toBeVisible();
			await expect(notice).toHaveCount(0);
			await expect(dialog.getByRole('button', { name: 'Settings', exact: true })).toBeFocused();
			await dialog.getByRole('button', { name: 'Close export', exact: true })[gesture]();
			await expect(dialog).toHaveCount(0);
		});
	});

test('top notifications fit both themes across desktop, tablet and phone orientations', async ({
	page
}, info) => {
	const errors: string[] = [];
	page.on('pageerror', (error) => errors.push(error.message));
	const dev = info.config.projects.find((p) => p.name === 'browser-selftests')!.use.baseURL!;
	await page.goto(dev);
	await expect(page.locator('.customize-action')).toBeEnabled();
	const sizes = [
		[320, 568],
		[360, 640],
		[390, 844],
		[430, 932],
		[568, 320],
		[667, 375],
		[844, 390],
		[932, 430],
		[768, 1024],
		[1024, 768],
		[900, 900],
		[1280, 800],
		[1440, 900],
		[1920, 1080]
	];
	const evidence: unknown[] = [];
	for (const screen of ['characters', 'studio']) {
		if (screen === 'studio') await enterStudio(page);
		for (const theme of ['dark', 'light']) {
			await page.evaluate(async (theme) => {
				const path = '/src/studio/state.svelte.ts',
					state = await import(path);
				if (state.ui.theme !== theme) state.toggleTheme();
			}, theme);
			for (const [width, height] of sizes) {
				await page.setViewportSize({ width, height });
				for (const tone of ['info', 'warning', 'danger'] as const) {
					// One round trip per notice: 168 notices made this test a long chain of browser calls under load.
					await page.evaluate(
						async ({ message, options }) => {
							const path = '/src/studio/state.svelte.ts',
								state = await import(path);
							// A danger notice blocks lesser ones until dismissed.
							state.dismissToast();
							state.toast(message, options);
						},
						{
							message:
								tone === 'warning'
									? 'Features and saved work may change. Export your work to keep a backup.'
									: tone === 'danger'
										? 'Could not save your character. Try again.'
										: 'Saved changes',
							options: {
								title: tone === 'warning' ? 'Preview · v0.2.29-dev' : undefined,
								tone,
								duration: 0
							}
						}
					);
					const notice = page.locator('.toast');
					await expect(notice).toBeVisible();
					const measure = () =>
						notice.evaluate((el) => {
							const r = el.getBoundingClientRect(),
								issues: string[] = [];
							if (r.left < 0 || r.top < 0 || r.right > innerWidth + 1 || r.bottom > innerHeight + 1)
								issues.push('outside viewport');
							// Centered over the stage column: the whole width over a phone sheet or in short landscape (where it
							// wraps less), else the world left of the rail.
							const column = document.querySelector('.sheet-layout, .short-layout')
								? { left: 0, right: innerWidth }
								: document.querySelector('.experience-stage, .cast')!.getBoundingClientRect();
							if (Math.abs(r.left + r.width / 2 - (column.left + column.right) / 2) > 1)
								issues.push('off center');
							if (r.width > 421) issues.push('wider than 420');
							if (el.scrollWidth > el.clientWidth) issues.push('horizontal clipping');
							for (const target of document.querySelectorAll<HTMLElement>(
								'.experience-header,.view-modes,.selection-import,.selection-create,.cast-library>.bu-input,.equipment-modes,.sheet-layout .equipment-rail'
							)) {
								if (!target.getClientRects().length) continue;
								const b = target.getBoundingClientRect();
								if (
									b.width &&
									b.height &&
									b.left < r.right &&
									b.right > r.left &&
									b.top < r.bottom &&
									b.bottom > r.top
								)
									issues.push('covers ' + target.className);
							}
							const card = el.querySelector<HTMLElement>('.bu-toast')!,
								style = getComputedStyle(card);
							const surface = card.getBoundingClientRect(),
								icon = card.querySelector('svg')!.getBoundingClientRect();
							if (Math.abs(icon.top + icon.height / 2 - surface.top - surface.height / 2) > 1)
								issues.push('status icon off center');
							const close = card
								.querySelector('[aria-label="Dismiss notification"]')!
								.getBoundingClientRect();
							if (close.width < 44 || close.height < 44) issues.push('small dismiss target');
							if (card.dataset.tone === 'info') {
								const text = document.createRange();
								text.selectNodeContents(card.querySelector('.bu-notice-content')!);
								if (close.left - text.getBoundingClientRect().right > 13)
									issues.push('short message stretches');
							}
							const context = document.createElement('canvas').getContext('2d')!;
							const rgb = (color: string) => {
								context.fillStyle = color;
								context.fillRect(0, 0, 1, 1);
								return [...context.getImageData(0, 0, 1, 1).data];
							};
							const foreground = rgb(style.color),
								background = rgb(style.backgroundColor);
							const luminance = (p: number[]) =>
								p
									.slice(0, 3)
									.map((v) => {
										v /= 255;
										return v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
									})
									.reduce((n, v, i) => n + v * [0.2126, 0.7152, 0.0722][i], 0);
							const a = luminance(foreground),
								b = luminance(background),
								contrast = (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05);
							if (background[3] !== 255) issues.push('transparent surface');
							if (contrast < 4.5) issues.push('low text contrast');
							return { issues, x: r.x, y: r.y, width: r.width, height: r.height, contrast };
						});
					let measured: Awaited<ReturnType<typeof measure>> | undefined;
					await expect
						.poll(async () => (measured = await measure()).issues, {
							message: `${screen} ${theme} ${tone} ${width}x${height}`
						})
						.toEqual([]);
					evidence.push({
						screen,
						theme,
						tone,
						viewportWidth: width,
						viewportHeight: height,
						...measured
					});
					if (tone === 'warning' && [320, 390, 844, 1440].includes(width))
						await page.screenshot({
							path: info.outputPath(`notification-${screen}-${theme}-${width}x${height}.png`)
						});
					if (tone === 'info' && width === 1440)
						await page.screenshot({
							path: info.outputPath(`notification-${screen}-${theme}-short.png`)
						});
				}
			}
		}
	}
	await info.attach('notification-layouts', {
		body: Buffer.from(JSON.stringify(evidence, null, 2)),
		contentType: 'application/json'
	});
	expect(errors).toEqual([]);
});

declare global {
	interface Window {
		__queue?: { paused: string | null };
		__studio?: { ui: { selected: string } };
	}
}

async function expectDirectionGrid(page: Page, directions: (string | null)[], columns: number) {
	const grid = page.locator('.all-dirs');
	const cells = grid.locator(':scope > *');
	await expect(cells).toHaveCount(directions.length);
	const boxes = [];
	for (const [i, direction] of directions.entries()) {
		const cell = cells.nth(i);
		await cell.scrollIntoViewIfNeeded();
		if (direction) {
			await expect(
				cell.getByRole('button', { name: `Show ${direction} only`, exact: true })
			).toBeVisible();
			await expect(cell.locator('canvas')).toHaveCount(1);
		} else {
			await expect(cell).toHaveAttribute('aria-hidden', 'true');
			await expect(cell).toBeEmpty();
		}
		// One snapshot: separate round trips let a still-settling sheet move the grid between reads (seen on the dev server).
		const { box, stage, toolbar, origin } = await cell.evaluate((el) => {
			const rect = (e: Element | null) => {
				const { x, y, width, height } = e!.getBoundingClientRect();
				return { x, y, width, height };
			};
			return {
				box: rect(el),
				stage: rect(document.querySelector('.stage-art')),
				toolbar: rect(document.querySelector('.canvas-bar')),
				origin: rect(el.parentElement)
			};
		});
		expect(box.x).toBeGreaterThanOrEqual(stage.x);
		expect(box.x + box.width).toBeLessThanOrEqual(stage.x + stage.width);
		expect(box.y).toBeGreaterThanOrEqual(stage.y);
		expect(box.y + box.height).toBeLessThanOrEqual(Math.min(stage.y + stage.height, toolbar.y) + 1);
		// The compact Inspect sheet deliberately scrolls. Compare compass geometry
		// in grid coordinates while verifying that every view remains reachable.
		const layout = { ...box, x: box.x - origin.x, y: box.y - origin.y };
		boxes.push(layout);
		if (i % columns) {
			expect(layout.y).toBeCloseTo(boxes[i - 1].y);
			expect(layout.x).toBeGreaterThan(boxes[i - 1].x + boxes[i - 1].width);
		}
		if (i >= columns) {
			expect(layout.x).toBeCloseTo(boxes[i - columns].x);
			expect(layout.y).toBeGreaterThan(boxes[i - columns].y + boxes[i - columns].height);
		}
	}
}

// The production build strips the __queue/__studio hooks and developer rigs, so the dev server checks them directly.
test('dev server: offline pauses the queue, back online resumes it, and developer rigs stay collapsed', async ({
	page,
	context
}, info) => {
	await context.addInitScript(() => localStorage.setItem('pixeldoll.agentKey', 'off'));
	// Open the Studio first so the app creates its database before the dev rig is added.
	await openStudio(
		page,
		info.config.projects.find((p) => p.name === 'browser-selftests')!.use.baseURL!
	);
	await page.evaluate(
		(format) =>
			new Promise<void>((resolve, reject) => {
				const r = indexedDB.open('pixeldoll');
				r.onerror = () => reject(r.error);
				r.onsuccess = () => {
					const t = r.result.transaction('projects', 'readwrite');
					t.objectStore('projects').put(
						{
							id: 'rig-e2edevrig00',
							savedAt: '',
							manifest: { format, name: 'E2E dev rig' },
							origin: 'dev'
						},
						'rig-e2edevrig00'
					);
					t.oncomplete = () => {
						r.result.close();
						resolve();
					};
					t.onabort = () => reject(t.error);
				};
			}),
		CURRENT_FORMAT
	);
	await reloadStudio(page);
	await page.waitForFunction(() => window.__queue?.paused === null && !!window.__studio);
	await context.setOffline(true);
	await page.locator('.offline-banner', { hasText: 'You’re offline' }).waitFor();
	await page.waitForFunction(() => window.__queue!.paused === 'offline');
	await pickItem(page, 'Wizard hat'); // everything else still works
	expect(await page.evaluate(() => window.__studio!.ui.selected)).toBe('hat_wizard');
	await context.setOffline(false);
	await page.locator('.offline-banner').waitFor({ state: 'detached' });
	await page.waitForFunction(() => window.__queue!.paused === null);
	await page.locator('.project-btn').click();
	const projectMenu = page.locator('#project-menu');
	await expect(projectMenu.getByText('Developer rigs', { exact: true })).toHaveCount(1);
	await expect(projectMenu.getByText('E2E dev rig', { exact: true })).toBeHidden();
});

// The demo tests run the production preview without a key. Each is independent so a slow machine costs one short test,
// not one long chain; the guard records and refuses every paid API call and collects page errors for the final check.
async function demoGuard(context: BrowserContext) {
	const errors: string[] = [],
		unexpectedRequests: string[] = [];
	await context.route('https://api.pixellab.ai/**', async (route) => {
		unexpectedRequests.push(
			route.request().method() + ' ' + new URL(route.request().url()).pathname
		);
		await route.abort();
	});
	await context.addInitScript(() => {
		localStorage.setItem('pixeldoll.welcomed', '1');
		localStorage.setItem('pixeldoll.agentKey', 'off');
	});
	context.on('weberror', (e) => {
		errors.push(e.error().message);
		console.log('pageerror', e.error().message);
	});
	context.on('console', (m) => {
		if (m.type() === 'error') console.log('console', m.text());
	});
	return () => {
		assert.deepEqual(errors, []);
		assert.deepEqual(unexpectedRequests, [], 'demo tests must never call the paid API');
	};
}

async function openDemo(page: Page) {
	await openStudio(page, '/#/', { waitUntil: 'networkidle' });
	await page.waitForSelector('.world-actors');
}

const step = (s: string) => console.log('ok', s);

test('studio demo: dressing, undo, recolor, outfits, keyboard views and theme survive a reload and export', async ({
	context,
	page
}) => {
	const finish = await demoGuard(context);
	await openDemo(page);
	// Tile names start with the item name; status words (such as missing frames) follow after a comma.
	const pressed = (name: string) =>
		page
			.locator('.equipment-scroll')
			.getByRole('button', {
				// Plain names only (letters, spaces and commas), so no escaping is needed.
				name: new RegExp(`^${name}(,|$)`)
			})
			.getAttribute('aria-pressed');
	const stage = () =>
		page
			.locator('.world-actors')
			.first()
			.evaluate((c) => (c as HTMLCanvasElement).toDataURL());

	// pause playback so the stage is comparable
	await page.getByRole('button', { name: 'Pause', exact: true }).click();
	assert.equal(await pressed('Steel helmet'), 'true');
	await page.locator('.equipment-scroll .item-tile', { hasText: 'Wizard hat' }).click();
	assert.equal(await pressed('Wizard hat'), 'true');
	assert.equal(await pressed('Steel helmet'), 'false');
	step('wear swaps the item in the slot');

	await page.locator('.equipment-scroll .item-tile', { hasText: 'Wizard hat' }).click();
	assert.equal(await pressed('Wizard hat'), 'false');
	assert.equal(await pressed('Empty head'), 'true');
	await expect(page.locator('.item-tile[data-selected]')).toHaveAccessibleName(/^Wizard hat(,|$)/);
	await page
		.locator('.equipment-scroll')
		.getByRole('button', { name: 'Empty head', exact: true })
		.click();
	await expect(page.locator('.header-undo')).toHaveAttribute(
		'aria-label',
		'Undo Take off Wizard hat'
	);
	await page.locator('.equipment-scroll .item-tile', { hasText: 'Wizard hat' }).click();
	assert.equal(await pressed('Wizard hat'), 'true');
	step(
		'tapping a worn item takes it off, tapping again wears it; Empty with nothing worn adds no undo step'
	);

	for (let i = 0; i < 3; i++) await page.getByRole('button', { name: /^Undo/ }).click();
	assert.equal(await pressed('Steel helmet'), 'true');
	await page.keyboard.press('Control+Shift+Z');
	assert.equal(await pressed('Wizard hat'), 'true');
	step('undo / redo (button + shortcut)');

	await equipmentGroup(page, 'Main hand');
	await expect(page.getByRole('heading', { name: 'Main hand', exact: true })).toBeVisible();
	assert.equal(await pressed('Steel longsword'), 'true');
	await equipmentGroup(page, 'Off hand');
	await expect(page.getByRole('heading', { name: 'Off hand', exact: true })).toBeVisible();
	// An empty category shows Empty first and a New tile beside it, plus the header's +.
	await expect(page.getByRole('group', { name: 'Off hand items', exact: true })).toHaveText(
		/^\s*Empty\s*New\s*$/
	);
	await expect(page.getByRole('button', { name: 'New off hand item', exact: true })).toHaveCount(2);
	await equipmentGroup(page, 'Head');
	step('held items have separate Main hand and Off hand groups');

	const before = await stage();
	await equipmentMode(page, 'Colors');
	await page.locator('.colors .swatch[aria-label="azure"]').first().click();
	await expect.poll(stage).not.toBe(before);
	assert.equal(
		await page.locator('.colors .swatch[aria-label="azure"]').first().getAttribute('aria-checked'),
		'true'
	);
	step('recolor changes the stage pixels');

	await equipmentMode(page, 'Outfits');
	await page.getByRole('button', { name: 'Save current look', exact: true }).click();
	await page.locator('input[aria-label="Outfit name"]').fill('Smoke look');
	await page.getByRole('button', { name: 'Save', exact: true }).click();
	await page.locator('.outfits .row', { hasText: 'Smoke look' }).waitFor();
	assert.ok(
		await page.locator('.outfits .row', { hasText: 'Smoke look' }).locator('.badge').isVisible()
	);
	step('outfit saved and marked current');

	await inspectStage(page);
	await page.keyboard.press('2');
	assert.equal(
		await page
			.locator('.canvas-bar')
			.getByRole('button', { name: 'Face east' })
			.getAttribute('aria-pressed'),
		'true'
	);
	await page.keyboard.press('0');
	assert.equal(await page.locator('.all-dirs canvas').count(), 4);
	await expectDirectionGrid(page, ['south', 'north', 'west', 'east'], 2);
	await page.keyboard.press('0');
	step('keyboard: direction + all directions');
	await page
		.getByRole('dialog', { name: 'Inspect character', exact: true })
		.getByRole('button', { name: 'Done', exact: true })
		.click();

	await page.getByRole('button', { name: 'More options', exact: true }).click();
	await page.getByRole('button', { name: 'Light mode', exact: true }).click();
	assert.equal(await page.evaluate(() => document.documentElement.dataset.theme), 'light');
	step('theme switch');

	await reloadStudio(page, { waitUntil: 'networkidle' });
	await page.waitForSelector('.world-actors');
	assert.equal(await pressed('Wizard hat'), 'true');
	await equipmentMode(page, 'Outfits');
	assert.ok(await page.locator('.outfits .row', { hasText: 'Smoke look' }).isVisible());
	assert.equal(await page.evaluate(() => document.documentElement.dataset.theme), 'light');
	step('outfit, colors, presets and theme survive a reload');

	await page.getByRole('button', { name: 'Export' }).first().click();
	const dl = page.getByRole('button', { name: /Download ZIP · \d+ KB/ });
	await dl.waitFor();
	const [download] = await Promise.all([page.waitForEvent('download'), dl.click()]);
	const bytes = readFileSync((await download.path())!);
	assert.equal(bytes.subarray(0, 2).toString(), 'PK');
	for (const f of ['manifest.json', 'godot/', 'layers/head/hat_wizard/'])
		assert.ok(bytes.includes(Buffer.from(f)), `zip has ${f}`);
	step(`export ${download.suggestedFilename()} ${Math.round(bytes.length / 1024)} KB`);

	// zip names (stored uncompressed in the zip headers)
	for (const f of ['README.txt', 'godot/README.txt'])
		assert.ok(bytes.includes(Buffer.from(f)), `zip has ${f}`);
	assert.ok(download.suggestedFilename().startsWith('adventurer-'), download.suggestedFilename());
	await expect(page.locator('dialog[open]')).toHaveCount(0);
	await expect(page.locator('.toast').getByText(/^Downloaded/)).toBeVisible();
	finish();
});

test('studio demo: base colors, Create size and direction pricing, stripped dev hooks and the offline banner', async ({
	context,
	page
}) => {
	const finish = await demoGuard(context);
	await openDemo(page);
	// ---- B15: base colors, Create options, offline banner ----
	await equipmentMode(page, 'Colors');
	assert.deepEqual(
		(await page.locator('.equipment-scroll .colors .mat > .muted').allTextContents()).slice(0, 3),
		['Shirt', 'Shorts', 'Skin']
	);
	step('base colors: Shirt, Shorts and Skin recolor separately');
	await page.locator('.project-btn').click();
	await page
		.locator('#project-menu')
		.getByRole('button', { name: 'New character', exact: true })
		.click();
	await page.getByRole('menuitem', { name: 'Create from scratch…', exact: true }).click();
	const cost = async () => {
		const value = await page.locator('dialog .foot-note').textContent();
		assert.ok(value, 'Create cost is shown');
		return value;
	};
	const eight = await cost();
	assert.equal(
		await page
			.getByRole('button', { name: 'Top-down 8', exact: true })
			.getAttribute('aria-pressed'),
		'true'
	);
	assert.equal(
		await page.getByRole('spinbutton', { name: 'Body size', exact: true }).inputValue(),
		'64'
	);
	await page.getByRole('button', { name: 'Top-down 4', exact: true }).click();
	assert.equal(await cost(), eight); // creation draws every view once and animates none: directions do not change its price
	await page.getByRole('button', { name: '96', exact: true }).click();
	assert.equal(
		await page.getByRole('spinbutton', { name: 'Frame size', exact: true }).inputValue(),
		'128'
	);
	assert.notEqual(await cost(), eight); // the draw is priced by body size
	await page.keyboard.press('Escape');
	await page.waitForFunction(() => !document.querySelector('dialog[open]'));
	step('Create: visible size and direction controls update frame and full generation cost');
	assert.equal(
		await page.evaluate(() => !!window.__queue || !!window.__studio),
		false,
		'the production build strips the queue and Studio hooks'
	);
	await context.setOffline(true);
	await page.locator('.offline-banner', { hasText: 'You’re offline' }).waitFor();
	await pickItem(page, 'Wizard hat'); // everything else still works
	await context.setOffline(false);
	await page.locator('.offline-banner').waitFor({ state: 'detached' });
	step('offline: banner shown, back online: banner gone (queue pause checked on the dev server)');
	finish();
});

test('studio demo: Create without a key opens Connect, Escape restores focus and Back closes a sheet', async ({
	context,
	page
}) => {
	const finish = await demoGuard(context);
	await openDemo(page);
	// ---- B10: sheets ----
	// T1 P0: Create without a key -> the Connect sheet replaces it (8afef4f)
	await page.locator('.project-btn').click();
	await page
		.locator('#project-menu')
		.getByRole('button', { name: 'New character', exact: true })
		.click();
	await page.getByRole('menuitem', { name: 'Create from scratch…', exact: true }).click();
	await expect(page.locator('dialog').getByLabel('Name', { exact: true })).toBeFocused(); // first field focused, not Cancel (checked before fill() moves focus)
	await page.locator('dialog textarea').fill('a cheerful elf archer');
	await page
		.locator('dialog')
		.getByRole('button', { name: /^Create/ })
		.click();
	await page.waitForFunction(
		() => document.querySelector('dialog[open] h2')?.textContent === 'Connect PixelLab'
	);
	step('Create without a key opens Connect (P0 sheet chaining)');
	await page.keyboard.press('Escape');
	await page.waitForFunction(() => !document.querySelector('dialog[open]'));
	assert.ok(
		await page.evaluate(() => document.activeElement?.classList.contains('project-btn')),
		'focus back on the menu button'
	);
	step('Esc closes, focus returns to the opener (P2-3)');
	await page.getByRole('button', { name: 'Export' }).first().click();
	await page.locator('dialog[open]').waitFor();
	await page.goBack();
	await page.waitForFunction(() => !document.querySelector('dialog[open]'));
	const base = test.info().project.use.baseURL!;
	assert.ok(page.url().startsWith(base), page.url());
	step('browser back closes the sheet, stays in the app (P2-2)');
	finish();
});

test('studio demo: move views offer only their directions, call out items without frames and take arrow keys', async ({
	context,
	page
}) => {
	const finish = await demoGuard(context);
	await openDemo(page);
	await pickItem(page, 'Wizard hat'); // the hat has no north frames in the walk
	// ---- B10: move views (T1 P1-1) ----
	await inspectStage(page);
	await page.locator('.canvas-bar select').selectOption('cross-punch');
	for (const d of ['east', 'north', 'west'])
		assert.ok(
			await page
				.locator('.canvas-bar')
				.getByRole('button', { name: `Face ${d}` })
				.isDisabled(),
			`cross punch ${d} disabled`
		);
	assert.equal(
		await page
			.locator('.canvas-bar')
			.getByRole('button', { name: 'Face south' })
			.getAttribute('aria-pressed'),
		'true'
	);
	await page.getByRole('button', { name: 'All directions', exact: true }).click();
	await expectDirectionGrid(page, ['south'], 1);
	await page.getByRole('button', { name: 'Show south only', exact: true }).click();
	await page.locator('.canvas-bar select').selectOption('walk');
	await page.locator('.canvas-bar').getByRole('button', { name: 'Face north' }).click();
	await page.locator('.stage-note', { hasText: 'Wizard hat' }).waitFor();
	assert.ok(
		await page.locator('.stage-note').getByRole('button', { name: 'Make your own' }).isVisible()
	);
	await page.locator('.canvas-bar').getByRole('button', { name: 'Face south' }).click();
	assert.equal(await page.locator('.stage-note').count(), 0);
	step('cross punch is south only; a worn item without north frames is called out (P1-1)');

	// ---- T2: arrow keys in segmented controls ----
	await page.locator('.canvas-bar').getByRole('button', { name: 'Face south' }).focus();
	await page.keyboard.press('ArrowRight');
	assert.equal(
		await page
			.locator('.canvas-bar')
			.getByRole('button', { name: 'Face east' })
			.getAttribute('aria-pressed'),
		'true'
	);
	assert.ok(
		await page.evaluate(() => document.activeElement?.getAttribute('aria-label') === 'Face east')
	);
	step('arrow keys move the direction segmented control');
	await page
		.getByRole('dialog', { name: 'Inspect character', exact: true })
		.getByRole('button', { name: 'Done', exact: true })
		.click();
	finish();
});

test('studio demo: production hides developer rigs and their disclosure', async ({
	context,
	page
}) => {
	const finish = await demoGuard(context);
	// Open the Studio first so the app creates its database before the dev rig is added.
	await openDemo(page);
	const idb = (
		put: {
			id: string;
			savedAt: string;
			manifest: { format: string; name: string };
			origin: string;
		} | null
	) =>
		page.evaluate(async (put) => {
			const q = indexedDB.open('pixeldoll');
			const db = await new Promise<IDBDatabase>((resolve, reject) => {
				q.onsuccess = () => resolve(q.result);
				q.onerror = () => reject(q.error);
			});
			const t = db.transaction('projects', 'readwrite');
			if (put) t.objectStore('projects').put(put, put.id);
			else t.objectStore('projects').delete('rig-e2edevrig00');
			await new Promise<void>((resolve, reject) => {
				t.oncomplete = () => resolve();
				t.onabort = () => reject(t.error);
			});
			db.close();
		}, put);
	await idb({
		id: 'rig-e2edevrig00',
		savedAt: '',
		manifest: { format: CURRENT_FORMAT, name: 'E2E dev rig' },
		origin: 'dev'
	});
	await page.reload();
	await page.locator('.project-btn').click();
	const projectMenu = page.locator('#project-menu');
	await expect(projectMenu).toBeVisible();
	await expect(projectMenu.getByText('Developer rigs', { exact: true })).toHaveCount(0);
	await expect(projectMenu.getByText('E2E dev rig', { exact: true })).toHaveCount(0);
	await page.keyboard.press('Escape');
	await idb(null);
	step('production hides developer rigs and their disclosure');
	finish();
});

// ---- B10: other sizes ----
for (const [name, viewport] of [
	['phone', { width: 375, height: 812 }],
	['landscape', { width: 812, height: 375 }]
] as const)
	test.describe(`studio demo ${name}`, () => {
		test.use({ viewport, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
		test(`${name}: Outfits, Random look and Redo stay reachable`, async ({ context, page: p }) => {
			const finish = await demoGuard(context);
			await openDemo(p);
			if (await p.locator('.header-redo').isVisible())
				await expect(p.locator('.header-redo')).toBeVisible();
			else {
				await p.getByRole('button', { name: 'More options', exact: true }).click();
				await expect(
					p.locator('#experience-options').getByRole('button', { name: /^Redo/ })
				).toBeVisible();
				await p.keyboard.press('Escape');
			}
			// Phones up to 430 px keep Random look in More.
			if (await p.locator('.header-random').isVisible()) await p.locator('.header-random').click();
			else {
				await p.getByRole('button', { name: 'More options', exact: true }).click();
				await p
					.locator('#experience-options')
					.getByRole('button', { name: 'Random look', exact: true })
					.click();
			}
			// Narrow phones keep Undo in More.
			if (await p.locator('.header-undo').isVisible())
				assert.ok(
					await p.getByRole('button', { name: /^Undo Random look/ }).isEnabled(),
					`${name}: random look`
				);
			else {
				await p.getByRole('button', { name: 'More options', exact: true }).click();
				await expect(
					p.locator('#experience-options').getByRole('button', { name: /^Undo Random look/ })
				).toBeEnabled();
				await p.keyboard.press('Escape');
			}
			await equipmentMode(p, 'Outfits');
			await p.getByRole('button', { name: 'Save current look' }).click();
			await p.locator('input[aria-label="Outfit name"]').fill('Phone look');
			await p.getByRole('button', { name: 'Save', exact: true }).click();
			await p.locator('.row', { hasText: 'Phone look' }).waitFor();
			step(`${name}: Outfits, Random look and Redo reachable (P1-2)`);
			finish();
		});
	});

test.describe('studio demo tablet', () => {
	test.use({
		viewport: { width: 768, height: 1024 },
		deviceScaleFactor: 2,
		isMobile: true,
		hasTouch: true
	});
	test('tablet portrait: preview and wardrobe stay separate and nothing covers the character', async ({
		context,
		page: p
	}) => {
		const finish = await demoGuard(context);
		await openDemo(p);
		assert.ok(await p.locator('.slot-tiles').first().isVisible(), 'tablet: wardrobe tiles visible');
		const box = await p.locator('.world-stage').boundingBox(),
			rail = await p.locator('.equipment-rail').boundingBox();
		assert.ok(
			box && rail && (box.x + box.width <= rail.x + 1 || box.y + box.height <= rail.y + 1),
			`tablet: preview and wardrobe do not overlap ${JSON.stringify({ box, rail })}`
		);
		await equipmentGroup(p, 'Head');
		await p.locator('.item-tile', { hasText: 'Steel helmet' }).click();
		assert.equal(await p.locator('.drawer, .drawer-scrim').count(), 0);
		step(
			'tablet portrait: preview and wardrobe remain separate, nothing covers the character (P1-3)'
		);
		finish();
	});
});

// ---- B17: non-agent servers never auto-connect: no badge, Connect sheet, no dev-key option ----
// bootstrap.ts fetches the agent key only in Vite mode "agent" (npm run dev:agent), which this offline suite never
// uses, so the agentKey off switch is not exercised here; it is set anyway so nothing could ever spend.
test('studio demo: a non-agent server shows no agent badge and Connect has no dev-key option', async ({
	context,
	page: p
}) => {
	const finish = await demoGuard(context);
	await openDemo(p);
	await expect(p.locator('.agent-badge')).toHaveCount(0);
	await openAccount(p);
	await p.waitForFunction(
		() => document.querySelector('dialog[open] h2')?.textContent === 'Connect PixelLab'
	);
	assert.equal(
		await p
			.locator('dialog[open] [data-testid=dev-key], dialog[open] button', {
				hasText: /dev key/i
			})
			.count(),
		0
	);
	step('non-agent server: no agent badge, Connect sheet has no dev-key option');
	finish();
});

// IndexedDB writes started while a page unloads may never finish, so an edit inside the 400 ms autosave delay must survive.
test('an outfit edit survives an immediate reload inside the autosave delay', async ({ page }) => {
	await page.route('https://*.pixellab.ai/**', (route) => route.abort());
	await page.addInitScript(() => {
		localStorage.setItem('pixeldoll.agentKey', 'off');
		localStorage.setItem('pixeldoll.welcomed', '1');
	});
	await openStudio(page, '/#/');
	const hat = page.locator('.equipment-scroll').getByRole('button', { name: /^Wizard hat(,|$)/ });
	const worn = (await hat.getAttribute('aria-pressed')) === 'true' ? 'false' : 'true';
	await page.locator('.equipment-scroll .item-tile', { hasText: 'Wizard hat' }).click();
	await expect(hat).toHaveAttribute('aria-pressed', worn);
	// A page-initiated reload 20 ms later lost the edit every time before the localStorage snapshot (page.reload() did not).
	const loaded = page.waitForEvent('load');
	// A snapshot of a character deleted in another tab is swept when the character list loads.
	await page.evaluate(() => {
		localStorage.setItem('pixeldoll.unsaved.rig-deleted-elsewhere', '{}');
		setTimeout(() => location.reload(), 20);
	});
	await loaded;
	await enterStudio(page);
	await expect(hat).toHaveAttribute('aria-pressed', worn);
	expect(
		await page.evaluate(() =>
			Object.keys(localStorage).filter((k) => k.startsWith('pixeldoll.unsaved.'))
		)
	).toEqual([]); // saved, then cleared
});

// The unload snapshot replaces the saved dress state (never merges it), so a reset or removal survives too.
test('a color reset survives an immediate reload inside the autosave delay', async ({ page }) => {
	await page.route('https://*.pixellab.ai/**', (route) => route.abort());
	await page.addInitScript(() => {
		localStorage.setItem('pixeldoll.agentKey', 'off');
		localStorage.setItem('pixeldoll.welcomed', '1');
	});
	await openStudio(page, '/#/');
	const azure = () =>
		page
			.locator('.colors .swatches')
			.filter({ has: page.locator('[aria-label="azure"]') })
			.first()
			.locator('[aria-label="azure"]');
	await equipmentMode(page, 'Colors');
	await azure().click();
	await expect(azure()).toHaveAttribute('aria-checked', 'true');
	await reloadStudio(page); // azure is now the saved state (openProject awaits the save)
	await equipmentMode(page, 'Colors');
	await expect(azure()).toHaveAttribute('aria-checked', 'true');
	await page
		.locator('.colors .swatches')
		.filter({ has: page.locator('[aria-label="azure"]') })
		.first()
		.locator('.swatch')
		.first()
		.click();
	await expect(azure()).toHaveAttribute('aria-checked', 'false');
	const loaded = page.waitForEvent('load');
	await page.evaluate(() => {
		setTimeout(() => location.reload(), 20);
	});
	await loaded;
	await enterStudio(page);
	await equipmentMode(page, 'Colors');
	await expect(azure()).toHaveAttribute('aria-checked', 'false');
});

test('Inspector animation stays stable and eight-direction previews fit the panel', async ({
	page
}) => {
	await page.route('https://api.pixellab.ai/**', (route) => route.abort());
	await page.addInitScript(() => {
		localStorage.setItem('pixeldoll.agentKey', 'off');
		localStorage.setItem('pixeldoll.welcomed', '1');
	});
	await openStudio(page, '/#/');
	await newItem(page, 'Head');
	await page.getByRole('button', { name: 'Copy the demo body', exact: true }).click();
	await page.getByRole('textbox', { name: 'What is it?', exact: true }).waitFor();
	await page.getByRole('button', { name: 'Cancel', exact: true }).click();
	await pickItem(page, 'Red cape');
	let inspector = await selectedItemDetails(page);
	async function checkFrames() {
		const geometry: string[] = [],
			pixels: string[] = [];
		for (let frame = 0; frame < 8; frame++) {
			await page.waitForTimeout(110); // Authored playback continues while the item sheet is open.
			// One browser call per sample (it was ~12 round trips): the same boxes, read in the same instant.
			const sample = await inspector.evaluate((sheet) => {
				const box = (el: Element) => {
					const r = el.getBoundingClientRect();
					return { x: r.x, y: r.y, width: r.width, height: r.height };
				};
				const strip = sheet.querySelector('.dir-strip')!,
					sprites = [...strip.querySelectorAll('canvas')];
				return {
					strip: box(strip),
					actions: box(sheet.querySelector('.actions')!),
					sprites: sprites.map(box),
					pixels: sprites[0].toDataURL()
				};
			});
			geometry.push(JSON.stringify(sample.strip), JSON.stringify(sample.actions));
			pixels.push(sample.pixels);
			// getBoundingClientRect gives a hidden element a zero box (boundingBox() gave null), so require real size.
			for (const b of [sample.strip, ...sample.sprites])
				expect(b.width * b.height).toBeGreaterThan(0);
			for (const b of sample.sprites) {
				expect(b.x).toBeGreaterThanOrEqual(sample.strip.x);
				expect(b.x + b.width).toBeLessThanOrEqual(sample.strip.x + sample.strip.width);
			}
		}
		expect(new Set(geometry.filter((_, i) => i % 2 === 0)).size).toBe(1);
		expect(new Set(geometry.filter((_, i) => i % 2 === 1)).size).toBe(1);
		expect(new Set(pixels).size).toBeGreaterThan(1);
	}
	await checkFrames();
	// Delete asks in an alert over the details; Cancel keeps the item and the details open.
	await inspector.getByRole('button', { name: 'Delete item…', exact: true }).click();
	const deleteAlert = page.getByRole('alertdialog', { name: /^Delete .+\?$/ });
	await expect(deleteAlert.getByRole('button', { name: 'Cancel', exact: true })).toBeFocused();
	await page.keyboard.press('Escape');
	await expect(deleteAlert).toHaveCount(0);
	await expect(inspector).toBeVisible();
	await inspector.getByRole('button', { name: 'Done', exact: true }).click();
	await pickItem(page, 'Steel helmet');
	inspector = await selectedItemDetails(page);
	await expect(page.getByRole('alertdialog')).toHaveCount(0);

	await inspector.getByRole('button', { name: 'Done', exact: true }).click();

	// Disposable layout fixture: duplicate stored east artwork into the extra directions, without generation.
	await page.getByRole('button', { name: 'Export', exact: true }).click();
	const download = page.waitForEvent('download');
	await page.getByRole('button', { name: /Download ZIP/ }).click();
	const files = await unzip(new Uint8Array(readFileSync((await (await download).path())!)));
	const data = JSON.parse(new TextDecoder().decode(files.get('project.json')));
	data.manifest.rig.directions = [
		'south',
		'south-east',
		'east',
		'north-east',
		'north',
		'north-west',
		'west',
		'south-west'
	].map((id) => ({ id }));
	const added = ['south-east', 'north-east', 'north-west', 'south-west', 'west'];
	for (const it of data.manifest.items) {
		for (const layer of it.layers)
			for (const dirs of Object.values(layer.cells ?? {}) as Record<string, unknown>[]) {
				for (const dir of added) dirs[dir] = dirs.east ?? dirs.south;
			}
		// Coverage follows the copied artwork.
		const covered = new Set<string>(it.coverage);
		for (const key of it.coverage ?? []) {
			const [anim, dir, cell] = key.split('/');
			const from = it.layers[0].cells[anim]?.east ? 'east' : 'south';
			if (dir === from) for (const to of added) covered.add(`${anim}/${to}/${cell}`);
		}
		if (it.coverage) it.coverage = [...covered];
	}
	files.set('project.json', new TextEncoder().encode(JSON.stringify(data)));
	const bytes = await zip([...files].map(([name, data]) => ({ name, data })));
	await page.locator('.project-btn').click();
	await page
		.locator('#project-menu')
		.getByRole('button', { name: 'New character', exact: true })
		.click();
	await page.getByRole('menuitem', { name: 'Import from device…', exact: true }).click();
	await page.getByLabel('Character ZIP', { exact: true }).setInputFiles({
		name: 'eight-directions.zip',
		mimeType: 'application/zip',
		buffer: Buffer.from(bytes)
	});
	await page.getByRole('img', { name: 'Character import preview' }).waitFor();
	const setup = page.getByRole('checkbox', { name: /Set up the pose rig next/ });
	if (await setup.count()) await setup.uncheck();
	await page.getByRole('button', { name: 'Import character', exact: true }).click();
	await pickItem(page, 'Red cape');
	inspector = await selectedItemDetails(page);
	await expect(inspector.locator('.dir-strip canvas')).toHaveCount(8);
	await checkFrames();
	await inspector.getByRole('button', { name: 'Done', exact: true }).click();
	await inspectStage(page);
	await page.getByRole('button', { name: 'All directions', exact: true }).click();
	for (const viewport of [
		{ width: 1440, height: 900 },
		{ width: 900, height: 768 },
		{ width: 375, height: 812 },
		{ width: 812, height: 375 }
	]) {
		await page.setViewportSize(viewport);
		await expectDirectionGrid(
			page,
			[
				'north-west',
				'north',
				'north-east',
				'west',
				null,
				'east',
				'south-west',
				'south',
				'south-east'
			],
			3
		);
	}
	await page.getByRole('button', { name: 'Show east only', exact: true }).click();
	await expect(page.locator('.all-dirs')).toHaveCount(0);
	await expect(page.locator('.stage-art [role="img"]')).toHaveAttribute(
		'aria-label',
		/facing east/
	);
	// At the smallest desktop breakpoint both sidebars leave only 476px for the stage.
	// The toolbar itself fitted before this fix, but its Move label collapsed and overlapped the directions.
	await page.setViewportSize({ width: 900, height: 768 });
	const controls = page.locator('.canvas-bar');
	await expect(controls.getByRole('combobox', { name: 'Direction', exact: true })).toBeVisible();
	const moveBox = (await controls
		.getByRole('combobox', { name: 'Move', exact: true })
		.boundingBox())!;
	const dirBox = (await controls
		.getByRole('combobox', { name: 'Direction', exact: true })
		.boundingBox())!;
	expect(moveBox.width).toBeGreaterThan(50);
	expect(moveBox.x + moveBox.width).toBeLessThanOrEqual(dirBox.x);
	await page.setViewportSize({ width: 1440, height: 560 }); // Constrain the modal so its details actually need scrolling.
	inspector = await selectedItemDetails(page);
	const header = inspector.locator('.sheet-head'),
		top = (await header.boundingBox())!.y;
	const content = inspector.locator('.sheet-body');
	await content.hover();
	await page.mouse.wheel(0, 2000);
	await expect.poll(() => content.evaluate((el) => el.scrollTop)).toBeGreaterThan(0);
	expect((await header.boundingBox())!.y).toBe(top);
	await inspector.getByRole('button', { name: 'Done', exact: true }).click();
	await pickItem(page, 'Wizard hat');
	await inspectStage(page);
	await page.setViewportSize({ width: 390, height: 844 });
	await page.getByRole('button', { name: 'All directions', exact: true }).click();
	const warning = page.locator('.stage-note');
	await expect(warning).toBeVisible();
	const warningBox = (await warning.boundingBox())!;
	const firstView = (await page
		.getByRole('button', { name: 'Show north-west only', exact: true })
		.boundingBox())!;
	expect(firstView.y).toBeGreaterThanOrEqual(warningBox.y + warningBox.height);
	const art = page.locator('.stage-art');
	await art.hover();
	await page.mouse.wheel(0, 1000);
	const toolbar = (await page.locator('.canvas-bar').boundingBox())!;
	await expect
		.poll(async () => {
			const lastView = (await page
				.getByRole('button', { name: 'Show south-east only', exact: true })
				.boundingBox())!;
			return lastView.y + lastView.height;
		})
		.toBeLessThanOrEqual(toolbar.y);
});

test('desktop resize keeps preview controls and customization reachable across panels', async ({
	page
}) => {
	await page.addInitScript(() => {
		localStorage.setItem('pixeldoll.agentKey', 'off');
		localStorage.setItem('pixeldoll.welcomed', '1');
	});
	await openStudio(page, '/#/');
	for (const viewport of [
		{ width: 700, height: 650 },
		{ width: 600, height: 600 },
		{ width: 1440, height: 900 }
	]) {
		await page.setViewportSize(viewport);
		for (const mode of ['Wardrobe', 'Colors', 'Outfits', 'Moves'] as const) {
			await equipmentMode(page, mode);
			await expect(page.locator('.equipment-rail')).toBeVisible();
			const controls = (await page
				.getByRole('toolbar', { name: 'Preview controls' })
				.boundingBox())!;
			expect(controls.x).toBeGreaterThanOrEqual(0);
			expect(controls.x + controls.width).toBeLessThanOrEqual(viewport.width);
			expect(controls.y + controls.height).toBeLessThanOrEqual(viewport.height);
		}
		await equipmentMode(page, 'Wardrobe');
		await pickItem(page, 'Steel helmet');
		const item = await selectedItemDetails(page);
		await expect(item.locator('.insp-title')).toHaveText('Steel helmet');
		await item.getByRole('button', { name: 'Done', exact: true }).click();
	}
});

test('canceling Connect preserves generation drafts and discards the pending action', async ({
	page
}) => {
	const paidRequests: string[] = [];
	await page.route('https://api.pixellab.ai/**', async (route) => {
		if (
			route.request().method() === 'GET' &&
			new URL(route.request().url()).pathname === '/v2/balance'
		) {
			await route.fulfill({
				json: {
					subscription: { type: 'generations', status: 'active', generations: 42, total: 100 },
					credits: { usd: 0 }
				}
			});
		} else {
			paidRequests.push(route.request().method() + ' ' + new URL(route.request().url()).pathname);
			await route.abort();
		}
	});
	await page.addInitScript(() => {
		localStorage.setItem('pixeldoll.agentKey', 'off');
		localStorage.setItem('pixeldoll.welcomed', '1');
	});
	await openStudio(page, '/#/');
	await newItem(page, 'Head');
	await page.getByRole('button', { name: 'Copy the demo body', exact: true }).click();
	const item = page.getByRole('dialog', { name: 'New item', exact: true });
	await item.getByRole('radio', { name: 'Main hand', exact: true }).click();
	await item.getByRole('textbox', { name: 'What is it?', exact: true }).fill('a silver sword');
	await item.getByRole('radio', { name: 'azure', exact: true }).click();
	await expect(item.getByRole('button', { name: /^Make/ })).toContainText(/Est\. \d+ gens/);
	await expect(
		item.getByText(
			'Consistency checks run automatically. If issues are detected, you choose whether to keep the item or request a paid retry. No quality retries or repairs run without your request. PixelLab may bill dollars and queue time varies.',
			{ exact: true }
		)
	).toBeVisible();
	await item.getByRole('button', { name: /^Make/ }).click();
	await page
		.getByRole('dialog', { name: 'Connect PixelLab' })
		.getByRole('button', { name: 'Cancel', exact: true })
		.click();
	await newItem(page, 'Head');
	await expect(item.getByRole('textbox', { name: 'What is it?', exact: true })).toHaveValue(
		'a silver sword'
	);
	await expect(item.getByRole('radio', { name: 'Main hand', exact: true })).toHaveAttribute(
		'aria-checked',
		'true'
	);
	await expect(item.getByRole('radio', { name: 'azure', exact: true })).toHaveAttribute(
		'aria-checked',
		'true'
	);
	await item.getByRole('button', { name: 'Cancel', exact: true }).click();

	await page.locator('.project-btn').click();
	await page
		.locator('#project-menu')
		.getByRole('button', { name: 'New character', exact: true })
		.click();
	await page.getByRole('menuitem', { name: 'Create from scratch…', exact: true }).click();
	const character = page.getByRole('dialog', { name: 'New character', exact: true });
	await character
		.getByRole('textbox', { name: 'Details', exact: true })
		.fill('a cheerful elf archer');
	await character.getByRole('combobox', { name: 'Build', exact: true }).selectOption('Broad');
	await character.getByRole('button', { name: 'Top-down 8', exact: true }).click();
	await character.getByRole('button', { name: '96', exact: true }).click();
	await character.getByRole('textbox', { name: 'Name', exact: true }).fill('Archer draft');
	await character.getByRole('button', { name: /^Create/ }).click();
	await expect(page.getByRole('dialog', { name: 'Connect PixelLab' })).toBeVisible();
	await page.goBack();
	await page.locator('.project-btn').click();
	await page
		.locator('#project-menu')
		.getByRole('button', { name: 'New character', exact: true })
		.click();
	await page.getByRole('menuitem', { name: 'Create from scratch…', exact: true }).click();
	await expect(character.getByRole('textbox', { name: 'Details', exact: true })).toHaveValue(
		'a cheerful elf archer'
	);
	await expect(character.getByRole('combobox', { name: 'Build', exact: true })).toHaveValue(
		'Broad'
	);
	await expect(character.getByRole('button', { name: 'Top-down 8', exact: true })).toHaveAttribute(
		'aria-pressed',
		'true'
	);
	await expect(character.getByRole('button', { name: '96', exact: true })).toHaveAttribute(
		'aria-pressed',
		'true'
	);
	await expect(character.getByRole('textbox', { name: 'Name', exact: true })).toHaveValue(
		'Archer draft'
	);
	await character.getByRole('button', { name: 'Cancel', exact: true }).click();

	// Connecting later must not start the character generation canceled above.
	await openAccount(page);
	const connect = page.getByRole('dialog', { name: 'Connect PixelLab' });
	await connect.getByLabel('API key', { exact: true }).fill('synthetic-manual-qa-key');
	await connect.getByRole('button', { name: 'Connect', exact: true }).click();
	await page.locator('.project-btn').click();
	await expect(page.getByRole('menuitem', { name: 'PixelLab account', exact: true })).toContainText(
		'42 gens'
	);
	await page.keyboard.press('Escape');
	await expect(page.getByRole('dialog')).toHaveCount(0);
	expect(paidRequests).toEqual([]);
	await page.locator('.project-btn').click();
	await page.getByRole('menuitem', { name: 'Character selection', exact: true }).click();
	await page
		.locator('.character-rows .character-row')
		.filter({ has: page.getByText('Adventurer', { exact: true }) })
		.click();
	await page.locator('.customize-action').click();
	await expect(page.locator('.project-btn .name-text')).toHaveText('Adventurer');
	// The page heading names the character outside the menu button (a heading cannot sit inside a button).
	await expect(page.getByRole('heading', { level: 1, name: 'Adventurer' })).toHaveCount(1);
	await expect(page.locator('.project-btn h1')).toHaveCount(0);
});

test('closing Connect before its code loads still discards the pending action', async ({
	page
}) => {
	const paidRequests: string[] = [];
	await page.route('https://api.pixellab.ai/**', async (route) => {
		if (
			route.request().method() === 'GET' &&
			new URL(route.request().url()).pathname === '/v2/balance'
		) {
			await route.fulfill({
				json: {
					subscription: { type: 'generations', status: 'active', generations: 42, total: 100 },
					credits: { usd: 0 }
				}
			});
		} else {
			paidRequests.push(route.request().method() + ' ' + new URL(route.request().url()).pathname);
			await route.abort();
		}
	});
	// Hold the Connect sheet's chunk so the sheet closes before ConnectSheet ever mounts.
	let release!: () => void,
		connectFetches = 0;
	const held = new Promise<void>((resolve) => {
		release = resolve;
	});
	await page.route(/\/ConnectSheet-[\w-]+\.js$/, async (route) => {
		connectFetches++;
		await held;
		await route.continue();
	});
	await page.addInitScript(() => {
		localStorage.setItem('pixeldoll.agentKey', 'off');
		localStorage.setItem('pixeldoll.welcomed', '1');
	});
	await openStudio(page, '/#/');
	await page.locator('.project-btn').click();
	await page
		.locator('#project-menu')
		.getByRole('button', { name: 'New character', exact: true })
		.click();
	await page.getByRole('menuitem', { name: 'Create from scratch…', exact: true }).click();
	const character = page.getByRole('dialog', { name: 'New character', exact: true });
	await character
		.getByRole('textbox', { name: 'Details', exact: true })
		.fill('a cheerful elf archer');
	await character.getByRole('textbox', { name: 'Name', exact: true }).fill('Archer draft');
	await character.getByRole('button', { name: /^Create/ }).click();
	await expect(page.getByRole('dialog')).toHaveCount(0);
	await expect.poll(() => connectFetches).toBeGreaterThan(0);
	await page.goBack();
	release();

	// Connecting later must not start the character generation abandoned above.
	await openAccount(page);
	const connect = page.getByRole('dialog', { name: 'Connect PixelLab' });
	await connect.getByLabel('API key', { exact: true }).fill('synthetic-manual-qa-key');
	await connect.getByRole('button', { name: 'Connect', exact: true }).click();
	await expect(page.getByRole('dialog')).toHaveCount(0); // a revived action would open its progress sheet here
	await page.locator('.project-btn').click();
	await expect(page.getByRole('menuitem', { name: 'PixelLab account', exact: true })).toContainText(
		'42 gens'
	);
	await page.keyboard.press('Escape');
	expect(paidRequests).toEqual([]);
});

// CI shards are contiguous slices of the test order. This heavy test (about 28 s) is registered among light tests, away
// from its two stale-review variants at the end and from the studio demo and Inspector tests above; heavy neighbors share
// one slow shard (docs/testing/test-performance.md).
test('free item color matching is offline, scoped, persistent and preserves saved recolors and warnings', async ({
	page,
	context
}, info) => {
	const requests: string[] = [];
	context.on('request', (r) => {
		if (r.url().startsWith('https://api.pixellab.ai/')) requests.push(r.method());
	});
	await context.route('https://api.pixellab.ai/**', (r) => r.abort());
	await page.addInitScript(() => {
		localStorage.setItem('pixeldoll.agentKey', 'off');
		localStorage.setItem('pixeldoll.welcomed', '1');
	});
	await openStudio(
		page,
		info.config.projects.find((p) => p.name === 'browser-selftests')!.use.baseURL!
	);
	const fixture = await freePaletteFixture(page),
		pane = await selectedItemDetails(page);
	const eligibility = await page.evaluate(async (id) => {
		const p = '/src/studio/state.svelte.ts',
			s = await import(p),
			item = s.store.project.manifest.items.find((it: { id: string }) => it.id === id);
		return {
			route: item.route,
			key: item.key,
			dressed: !!item.dressed.west,
			frames: s.store.project.manifest.rig.animations.find((a: { id: string }) => a.id === 'walk')
				.sources.west.keypoints.length
		};
	}, fixture.itemId);
	expect(eligibility).toMatchObject({
		route: 'skeleton-pose',
		key: 'green',
		dressed: true,
		frames: 8
	});
	const action = pane.getByRole('button', { name: /^Match item colors.*Free$/ });
	await expect(action).toBeVisible();
	await expect(pane).toContainText('Match 2 pixels in 2 saved Walk frames facing west');
	await expect(pane).toContainText('2 unmatched eligible pixels stay unchanged');
	await expect(pane).toContainText('No PixelLab call is made');
	await context.setOffline(true);
	await action.click();
	await expect(pane.getByText('Matched 2 pixels in 2 frames.', { exact: true })).toBeVisible();
	await expect(action).toHaveCount(0);
	await page.evaluate(async () => {
		const p = '/src/studio/state.svelte.ts',
			s = await import(p);
		s.doc.rev++;
	});
	await expect(pane.getByText('Matched 2 pixels in 2 frames.', { exact: true })).toBeVisible();
	await context.setOffline(false);
	const after = await page.evaluate(async (id) => {
		const p = '/src/studio/state.svelte.ts',
			s = await import(p),
			projectPath = '/src/lib/store/project.ts',
			projectModule = await import(projectPath);
		const ctx = await projectModule.loadProject(s.doc.id),
			item = ctx.rec.manifest.items.find((it: { id: string }) => it.id === id),
			image = ctx.project.images.get(item.layers[0].cells.walk.west[0]);
		const unscoped = structuredClone(item.layers);
		for (const layer of unscoped) delete layer.cells.walk.west;
		return {
			materials: ctx.rec.manifest.materials,
			presets: ctx.rec.manifest.presets,
			variants: s.doc.variants,
			qa: item.qa,
			warnings: item.designWarnings,
			provenance: item.provenance,
			rig: ctx.rec.manifest.rig,
			unscoped,
			pixels: [...image.data.slice((40 * 96 + 40) * 4, (40 * 96 + 44) * 4)],
			audit: item.paletteRepairs,
			selected: s.ui.selected,
			anim: s.ui.anim,
			dir: s.ui.dir
		};
	}, fixture.itemId);
	for (const key of [
		'materials',
		'presets',
		'variants',
		'qa',
		'warnings',
		'provenance',
		'rig',
		'unscoped'
	] as const)
		expect(after[key]).toEqual(fixture[key]);
	expect(after.pixels).toEqual([
		128, 128, 128, 255, 240, 240, 240, 255, 192, 128, 96, 255, 16, 16, 16, 255
	]);
	expect(after).toMatchObject({ selected: fixture.itemId, anim: 'walk', dir: 'west' });
	expect(after.audit).toHaveLength(1);
	expect(after.audit[0]).toMatchObject({ version: 'neutral-owned-v1', anim: 'walk', dir: 'west' });
	await expect(pane.locator('.badge.accepted')).toHaveText('Accepted');
	await reloadStudio(page);
	await expect(page.locator('.world-actors').first()).toBeVisible();
	await page.evaluate(async (id) => {
		const p = '/src/studio/state.svelte.ts',
			s = await import(p);
		s.ui.anim = 'walk';
		s.ui.dir = 'west';
		s.pick(id);
	}, fixture.itemId);
	await selectedItemDetails(page);
	await expect(pane.locator('.badge.accepted')).toHaveText('Accepted');
	await expect(pane.getByRole('button', { name: /^Match item colors.*Free$/ })).toHaveCount(0);
	// The saved recolor survives: the item's colors live in the Colors tab, which Recolor opens.
	await pane.getByRole('button', { name: 'Recolor', exact: true }).click();
	await expect(
		page
			.locator(`.color-sections [data-owner="${fixture.itemId}"]`)
			.getByRole('radio', { name: 'azure', exact: true })
			.first()
	).toHaveAttribute('aria-checked', 'true');
	await page.getByRole('button', { name: 'Export', exact: true }).click();
	const sheet = page.getByRole('dialog', { name: 'Export', exact: true });
	await sheet.getByRole('radio', { name: /PNG \+ JSON/ }).click();
	const download = sheet.getByRole('button', { name: /^Download ZIP/ });
	await expect(download).toBeEnabled();
	const event = page.waitForEvent('download');
	await download.click();
	const file = await event,
		path = await file.path();
	expect(path).not.toBeNull();
	const entries = await unzip(new Uint8Array(readFileSync(path!)));
	const manifest = JSON.parse(new TextDecoder().decode(entries.get('manifest.json')!));
	expect(
		manifest.items.find((it: { id: string }) => it.id === fixture.itemId).paletteRepairs
	).toHaveLength(1);
	expect(manifest.materials).toEqual(fixture.materials);
	expect(requests).toEqual([]);
});

// Synthetic keys only: exercise the production bundle without contacting PixelLab.
for (const initial of ['shared', 'old-only', 'both'] as const) {
	test(
		'remembered key: ' + initial + ' uses only the shared name and Forget survives reload',
		async ({ page }) => {
			const shared = 'test-shared-key-1234';
			const legacy = 'test-legacy-key-5678';
			let requests = 0;
			await page.route('https://api.pixellab.ai/**', async (route) => {
				requests++;
				expect(route.request().method()).toBe('GET');
				expect(new URL(route.request().url()).pathname).toBe('/v2/balance');
				expect(route.request().headers().authorization).toBe('Bearer ' + shared);
				await route.fulfill({
					json: {
						subscription: { type: 'generations', status: 'active', generations: 42, total: 100 },
						credits: { usd: 0 }
					}
				});
			});
			await page.addInitScript(
				({ initial, shared, legacy }) => {
					localStorage.setItem('pixeldoll.agentKey', 'off');
					localStorage.setItem('pixeldoll.welcomed', '1');
					if (sessionStorage.getItem('seeded')) return;
					sessionStorage.setItem('seeded', '1');
					if (initial === 'shared' || initial === 'both')
						localStorage.setItem('pixellabApiKey', shared);
					if (initial !== 'shared') localStorage.setItem('pixeldoll.apiKey', legacy);
					localStorage.setItem('pixellab-backpack:key-kept', 'other-app-legacy-key');
				},
				{ initial, shared, legacy }
			);
			await openStudio(page, '/#/');
			await expect(page.locator('.project-btn .name-text')).toHaveText('Adventurer');
			await expect(page.locator('.world-actors').first()).toBeVisible();
			await page.locator('.project-btn').click();
			await page
				.getByRole('menuitem', {
					name: initial === 'old-only' ? 'Connect PixelLab…' : 'PixelLab account',
					exact: true
				})
				.click();
			const dialog = page.getByRole('dialog', { name: 'Connect PixelLab', exact: true });
			if (initial === 'old-only') {
				await expect(dialog.getByRole('button', { name: 'Forget key' })).toHaveCount(0);
				await expect(dialog.getByLabel('API key', { exact: true })).toHaveValue('');
				expect(requests).toBe(0);
			} else {
				await expect(dialog.getByText(/Connected and remembered/)).toBeVisible();
				expect(requests).toBeGreaterThan(0);
			}
			expect(
				await page.evaluate(() => [
					localStorage.getItem('pixellabApiKey'),
					localStorage.getItem('pixeldoll.apiKey')
				])
			).toEqual([initial === 'old-only' ? null : shared, initial === 'shared' ? null : legacy]);
			if (initial !== 'old-only') await dialog.getByRole('button', { name: 'Forget key' }).click();
			const beforeReload = requests;
			await reloadStudio(page);
			expect(
				await page.evaluate(() => [
					localStorage.getItem('pixellabApiKey'),
					localStorage.getItem('pixeldoll.apiKey'),
					localStorage.getItem('pixellab-backpack:key-kept')
				])
			).toEqual([null, initial === 'shared' ? null : legacy, 'other-app-legacy-key']);
			await page.locator('.project-btn').click();
			await expect(
				page.getByRole('menuitem', { name: 'Connect PixelLab…', exact: true })
			).toBeVisible();
			await page.keyboard.press('Escape');
			expect(requests).toBe(beforeReload);
		}
	);
}

test('setup and move drafts survive canceled connection and stay scoped to their character', async ({
	page,
	context
}) => {
	const requests: string[] = [];
	await context.route('https://api.pixellab.ai/**', async (route) => {
		requests.push(route.request().method());
		await route.abort();
	});
	await page.addInitScript(() => {
		localStorage.setItem('pixeldoll.agentKey', 'off');
		localStorage.setItem('pixeldoll.welcomed', '1');
	});
	await openStudio(page, '/');
	await page.locator('.world-actors').first().waitFor();
	await page.getByRole('button', { name: 'Export', exact: true }).click();
	const downloading = page.waitForEvent('download');
	await page.getByRole('button', { name: /Download ZIP/ }).click();
	const files = await unzip(new Uint8Array(readFileSync((await (await downloading).path())!)));
	const data = JSON.parse(new TextDecoder().decode(files.get('project.json')));
	const m = data.manifest;
	m.name = 'Connection draft fixture';
	const poses = JSON.parse(readFileSync('dev-fixtures/s4rig/keypoints.json', 'utf8'));
	const { toApi } = await import('../../src/lib/rig/poses.ts');
	const body = m.items.find((i: { id: string }) => i.id === m.rig.baseItem).layers[0];
	m.rig.rest = {};
	for (const d of m.rig.directions.filter((d: { mirrorOf?: string }) => !d.mirrorOf)) {
		const keypoints = toApi(poses[`walk/${d.id}/0`], m.rig.cell);
		m.rig.rest[d.id] = { image: body.cells.walk[d.id][0], keypoints };
		for (const a of m.rig.animations) {
			a.sources ??= {};
			a.sources[d.id] = {
				route: 'skeleton-v3',
				keypoints: Array.from({ length: a.cells }, () => keypoints)
			};
		}
	}
	const vest =
		m.items.find((i: { id: string }) => i.id === 'vest_leather') ??
		m.items.find((i: { slot: string }) => i.slot === 'top_inner');
	vest.route = 'skeleton-pose';
	vest.key = 'magenta';
	vest.dressed = Object.fromEntries(
		Object.entries(m.rig.rest).map(([d, r]) => [d, (r as { image: string }).image])
	);
	data.character = { id: 'offline-draft-fixture', looks: 'Stored offline test artwork' };
	files.set('project.json', new TextEncoder().encode(JSON.stringify(data)));
	const archive = await zip([...files].map(([name, data]) => ({ name, data })));
	await page.locator('.project-btn').click();
	await page
		.locator('#project-menu')
		.getByRole('button', { name: 'New character', exact: true })
		.click();
	await page.getByRole('menuitem', { name: 'Import from device…', exact: true }).click();
	await page.getByLabel('Character ZIP', { exact: true }).setInputFiles({
		name: 'draft-fixture.zip',
		mimeType: 'application/zip',
		buffer: Buffer.from(archive)
	});
	await page.getByRole('img', { name: 'Character import preview', exact: true }).waitFor();
	await page.getByRole('button', { name: 'Import character', exact: true }).click();
	await expect(page.locator('.project-btn')).toContainText(m.name);
	await expect(page.getByRole('dialog')).toHaveCount(0);
	await page.locator('.project-btn').click();
	await page.getByRole('menuitem', { name: 'Set up character…', exact: true }).click();
	const setup = page.getByRole('dialog', { name: 'Set up character', exact: true });
	await setup
		.getByRole('textbox', { name: /Existing appearance/ })
		.fill('Blue vest, bald, gray shorts');
	await setup.getByRole('button', { name: /^Set up ·/ }).click();
	await page
		.getByRole('dialog', { name: 'Connect PixelLab' })
		.getByRole('button', { name: 'Cancel', exact: true })
		.click();
	await expect(page.getByRole('dialog')).toHaveCount(0);
	await page.locator('.project-btn').click();
	await page.getByRole('menuitem', { name: 'Set up character…', exact: true }).click();
	await expect(setup.getByRole('textbox', { name: /Existing appearance/ })).toHaveValue(
		'Blue vest, bald, gray shorts'
	);
	await setup.getByRole('button', { name: 'Later', exact: true }).click();
	await expect(page.getByRole('dialog')).toHaveCount(0);
	await equipmentMode(page, 'Moves');
	await page.getByRole('button', { name: 'Add a move', exact: true }).click();
	const move = page.getByRole('dialog', { name: 'Add a move', exact: true });
	await move.getByRole('radio', { name: 'Cast', exact: true }).click();
	await move.getByRole('textbox', { name: /Or describe it/ }).fill('jumping in place');
	await move.getByRole('checkbox', { name: new RegExp(vest.name) }).uncheck();
	await expect(move.getByRole('button', { name: /^Add Jumping in/ })).toContainText(
		/Est\. \d+ gens/
	);
	await expect(
		move.getByText(
			'PixelLab may bill some calls in dollars. Retries and fallbacks cost extra; queue time varies.',
			{ exact: true }
		)
	).toBeVisible();
	await move.getByRole('button', { name: /^Add Jumping in/ }).click();
	await page
		.getByRole('dialog', { name: 'Connect PixelLab' })
		.getByRole('button', { name: 'Cancel', exact: true })
		.click();
	await expect(page.getByRole('dialog')).toHaveCount(0);
	await page.getByRole('button', { name: 'Add a move', exact: true }).click();
	await expect(move.getByRole('textbox', { name: /Or describe it/ })).toHaveValue(
		'jumping in place'
	);
	await expect(move.getByRole('checkbox', { name: new RegExp(vest.name) })).not.toBeChecked();
	await move.getByRole('textbox', { name: /Or describe it/ }).fill('');
	await expect(move.getByRole('radio', { name: 'Cast', exact: true })).toHaveAttribute(
		'aria-checked',
		'true'
	);
	await move.getByRole('button', { name: 'Cancel', exact: true }).click();
	await expect(page.getByRole('dialog')).toHaveCount(0);
	await page.locator('.project-btn').click();
	await page.getByRole('menuitemradio', { name: 'Adventurer (demo)', exact: true }).click();
	// Wait for the switch itself: clicking Add a move before the demo replaced the fixture raced the load (the old flake).
	await expect(page.locator('.project-btn .name-text')).toHaveText('Adventurer');
	await expect(page.locator('.move-list')).toBeVisible();
	// The draft stays with its character: the read-only demo offers no Add a move at all.
	await expect(page.getByRole('button', { name: 'Add a move', exact: true })).toHaveCount(0);
	expect(requests).toEqual([]);
});

test('radio groups and tabs use one Tab stop and arrow selection', async ({ page, context }) => {
	await context.route('https://api.pixellab.ai/**', (r) => r.abort());
	await page.addInitScript(() => {
		localStorage.setItem('pixeldoll.agentKey', 'off');
		localStorage.setItem('pixeldoll.welcomed', '1');
		localStorage.setItem('pixeldoll.export.engine', 'unknown-engine');
	});
	await openStudio(page, '/');
	await expect(page.locator('.world-actors').first()).toBeVisible();
	// The slot rail is section navigation with one Tab stop; Down arrow moves to and shows the next slot.
	const tabs = page.getByRole('navigation', { name: 'Equipment slots', exact: true });
	await expect(tabs.locator('[tabindex="0"]')).toHaveCount(1);
	await tabs.getByRole('button', { name: /^Head\b/ }).click();
	await tabs.getByRole('button', { name: /^Head\b/ }).focus();
	await page.keyboard.press('ArrowDown');
	await expect(tabs.getByRole('button', { name: /^Hair\b/ })).toBeFocused();
	await expect(tabs.getByRole('button', { name: /^Hair\b/ })).toHaveAttribute(
		'aria-current',
		'true'
	);
	await expect(tabs.locator('[tabindex="0"]')).toHaveCount(1);
	await page.keyboard.press('End');
	await expect(tabs.getByRole('button').last()).toBeFocused();
	await page.keyboard.press('Home');
	await expect(tabs.getByRole('button').first()).toBeFocused();
	await page.getByRole('button', { name: 'Export', exact: true }).click();
	const engines = page.getByRole('group', { name: 'Export format', exact: true });
	await expect(engines.getByRole('radio', { name: /Godot/ })).toBeChecked();
	await expect(engines.getByRole('radio', { name: /Godot/ })).toBeEnabled();
	await engines.getByRole('radio', { name: /Godot/ }).focus();
	await expect(engines.getByRole('radio', { name: /Godot/ })).toBeFocused();
	await page.keyboard.press('ArrowRight');
	await expect(engines.getByRole('radio', { name: /Unity/ })).toBeFocused();
	await expect(engines.getByRole('radio', { name: /Unity/ })).toBeChecked();
	await page.keyboard.press('Tab');
	await expect(engines.getByRole('radio', { name: /Phaser/ })).not.toBeFocused();
	await page.getByRole('button', { name: 'Close export', exact: true }).click();
	await page.locator('.project-btn').click();
	await page
		.locator('#project-menu')
		.getByRole('button', { name: 'New character', exact: true })
		.click();
	await page.getByRole('menuitem', { name: 'Create from scratch…', exact: true }).click();
	const editor = page.getByRole('tablist', { name: 'Prompt editor', exact: true });
	await expect(editor.locator('[tabindex="0"]')).toHaveCount(1);
	await editor.getByRole('tab', { name: 'Appearance', exact: true }).focus();
	await page.keyboard.press('ArrowRight');
	await expect(editor.getByRole('tab', { name: 'Prompt', exact: true })).toBeFocused();
	await expect(editor.getByRole('tab', { name: 'Prompt', exact: true })).toHaveAttribute(
		'aria-selected',
		'true'
	);
	await expect(editor.locator('[tabindex="0"]')).toHaveCount(1);
	await page.keyboard.press('ArrowLeft');
	const skin = page.getByRole('combobox', { name: 'Skin', exact: true });
	await expect(skin).toHaveValue('Not set');
	await skin.focus();
	await expect(skin).toBeFocused();
	await page.keyboard.press('Space'); // Open the native select before moving its highlighted option.
	await page.keyboard.press('ArrowDown');
	await page.keyboard.press('Enter'); // Commit native Windows/Chromium select navigation.
	await expect(skin).toHaveValue('Deep brown');
	await page.keyboard.press('Tab');
	await expect(skin).not.toBeFocused();
});

test('draft review can inspect every generated move and only its available views', async ({
	page,
	context
}, info) => {
	await context.route('https://api.pixellab.ai/**', (r) => r.abort());
	await page.addInitScript(() => {
		localStorage.setItem('pixeldoll.agentKey', 'off');
		localStorage.setItem('pixeldoll.welcomed', '1');
	});
	await openStudio(
		page,
		info.config.projects.find((p) => p.name === 'browser-selftests')!.use.baseURL!
	);
	await expect(page.locator('.world-actors').first()).toBeVisible();
	await page.evaluate(async () => {
		const s = (
			window as unknown as {
				__studio: {
					ui: { playing: boolean; frame: number; anim: string; selected: string };
					doc: { id: string };
					store: { project: any; results: Record<string, unknown> };
					gens: unknown[];
					loadGens: () => Promise<void>;
				};
			}
		).__studio;
		await s.loadGens();
		s.ui.playing = false;
		s.ui.frame = 0;
		s.ui.anim = 'walk';
		const p = s.store.project,
			it = p.manifest.items.find((i: { slot: string }) => i.slot === 'head');
		s.gens.push({
			draft: {
				rigId: s.doc.id,
				spec: {
					id: it.id,
					name: 'Review fixture',
					slot: it.slot,
					prompt: 'hat',
					key: 'magenta',
					anims: ['walk', 'cross-punch'],
					dirs: ['south', 'east', 'north'],
					clipDirs: { walk: ['south', 'east', 'north'], 'cross-punch': ['south'] }
				},
				calls: [],
				keySwitched: false,
				log: []
			},
			input: { name: 'Review fixture', slot: it.slot, prompt: 'hat' },
			phase: 'review',
			status: 'Review'
		});
		s.store.results[it.id] = { cells: [], qa: null, g1: new Map(), preview: p };
		s.ui.selected = 'gen:' + it.id;
	});
	await reviewSelectedDraft(page);
	const review = page.locator('.gen');
	await expect(review.getByRole('button', { name: /^Try again/ })).toContainText('Est.');
	await expect(
		review.getByText(
			'Try again redraws the standing design in the character’s directions at the displayed estimate. Generate other moves separately after you like it. Further quality retries or repairs require another request. PixelLab may bill some calls in dollars; queue time varies.',
			{ exact: true }
		)
	).toBeVisible();
	await expect(review.getByRole('combobox', { name: 'Preview move', exact: true })).toHaveValue(
		'walk'
	);
	await expect(review.locator('.review-grid figure')).toHaveCount(4);
	const before = await review
		.locator('canvas')
		.first()
		.evaluate((c) => (c as HTMLCanvasElement).toDataURL());
	await review
		.getByRole('combobox', { name: 'Preview move', exact: true })
		.selectOption('cross-punch');
	await expect(page.getByRole('combobox', { name: 'Move', exact: true })).toHaveValue(
		'cross-punch'
	);
	await expect(review.locator('.review-grid figure')).toHaveCount(1);
	await expect(review.getByRole('img', { name: /facing south/ })).toBeVisible();
	expect(
		await review
			.locator('canvas')
			.first()
			.evaluate((c) => (c as HTMLCanvasElement).toDataURL())
	).not.toBe(before);
	await page.getByRole('combobox', { name: 'Move', exact: true }).selectOption('walk');
	await expect(review.getByRole('combobox', { name: 'Preview move', exact: true })).toHaveValue(
		'walk'
	);
	await expect(review.locator('.review-grid figure')).toHaveCount(4);
	// Details must react to ledger-only completion; the draft itself does not change when usage arrives.
	await page.evaluate(() => {
		const w = window as unknown as {
			__studio: { ui: { selected: string }; gens: any[] };
			__queue: { recs: Map<string, any>; emit: () => void };
		};
		const g = w.__studio.gens.find((g) => 'gen:' + g.draft.spec.id === w.__studio.ui.selected);
		g.draft.calls = [
			{ kind: 'edit', cells: ['walk/south/0'], seed: 1, rerolls: 0, old: [], recId: 'spent-first' },
			{ kind: 'edit', cells: ['walk/east/0'], seed: 2, rerolls: 0, old: [], recId: 'spent-second' }
		];
		for (const [id, gens] of [
			['spent-first', 10],
			['spent-second', 0]
		] as const)
			w.__queue.recs.set(id, {
				id,
				label: id,
				method: 'POST',
				endpoint: '/synthetic',
				params: {},
				inputs: [],
				requestHash: id,
				state: 'done',
				createdAt: 1,
				nextAt: 0,
				attempts: 1,
				jobs: [],
				gens,
				usd: 0
			});
		w.__queue.emit();
	});
	await review.getByText('Details', { exact: true }).click();
	const spent = review.locator('dt:has-text("Spent") + dd');
	await expect(spent).toHaveText('10 gens');
	const beforeDraft = await page.evaluate(() => {
		const w = window as unknown as {
			__studio: { ui: { selected: string }; gens: any[] };
			__queue: { recs: Map<string, any>; emit: () => void };
		};
		const draft = w.__studio.gens.find(
			(g) => 'gen:' + g.draft.spec.id === w.__studio.ui.selected
		).draft;
		const snapshot = JSON.stringify(draft);
		w.__queue.recs.get('spent-second').usd = 0.08;
		w.__queue.emit();
		return snapshot;
	});
	await expect(spent).toHaveText('10 gens + $0.080');
	expect(
		await page.evaluate(() => {
			const w = window as unknown as { __studio: { ui: { selected: string }; gens: any[] } };
			return JSON.stringify(
				w.__studio.gens.find((g) => 'gen:' + g.draft.spec.id === w.__studio.ui.selected).draft
			);
		})
	).toBe(beforeDraft);
});

test('a draft can be worn while it loads: landed views show, pending ones say loading, and it is never saved', async ({
	page,
	context
}, info) => {
	const requests: string[] = [];
	await context.route('https://api.pixellab.ai/**', (r) => {
		requests.push(r.request().method());
		return r.abort();
	});
	await page.addInitScript(() => {
		localStorage.setItem('pixeldoll.agentKey', 'off');
		localStorage.setItem('pixeldoll.welcomed', '1');
	});
	await openStudio(
		page,
		info.config.projects.find((p) => p.name === 'browser-selftests')!.use.baseURL!
	);
	await expect(page.locator('.world-actors').first()).toBeVisible();
	type Studio = {
		REQUEST_TEXT: number;
		ui: { playing: boolean; anim: string; dir: string };
		doc: { id: string; items: Record<string, string | null>; drafts: Record<string, string> };
		store: { project: any; results: Record<string, unknown> };
		gens: any[];
		loadGens: () => Promise<void>;
	};
	await page.evaluate(async () => {
		const s = (window as unknown as { __studio: Studio }).__studio;
		await s.loadGens();
		s.ui.playing = false;
		s.ui.anim = 'walk';
		s.ui.dir = 'south';
		// a generating helm whose south walk landed; east (west mirrors it) and north are still on their way
		const p = s.store.project,
			hat = p.manifest.items.find((i: { id: string }) => i.id === 'hat_wizard'),
			keys = (dir: string) => Array.from({ length: 8 }, (_, i) => `walk/${dir}/${i}`);
		const item = {
			...structuredClone(hat),
			id: 'loading_helm',
			name: 'Loading helm',
			status: 'draft',
			materials: [],
			coverage: keys('south'),
			pending: [...keys('east'), ...keys('north')]
		};
		s.gens.push({
			draft: {
				rigId: s.doc.id,
				spec: {
					id: 'loading_helm',
					name: 'Loading helm',
					slot: 'head',
					prompt: 'a helm',
					key: 'green',
					anims: ['walk'],
					dirs: ['south', 'east', 'north']
				},
				calls: [],
				keySwitched: false,
				log: []
			},
			input: { name: 'Loading helm', slot: 'head', prompt: 'a helm' },
			phase: 'running',
			status: 'Adding the other moves',
			requestText: s.REQUEST_TEXT
		});
		s.store.results = {
			...s.store.results,
			loading_helm: {
				cells: [],
				qa: null,
				g1: new Map(),
				preview: {
					manifest: { ...p.manifest, items: [...p.manifest.items, item] },
					images: p.images
				}
			}
		};
	});
	// run a function against the dev-only studio state (serialized like page.evaluate's own functions)
	const studio = <T>(fn: (s: Studio, arg: string) => T, arg = '') =>
		page.evaluate(
			({ src, arg }) =>
				new Function('s', 'arg', `return (${src})(s, arg)`)(
					(window as unknown as { __studio: Studio }).__studio,
					arg
				),
			{ src: fn.toString(), arg }
		) as Promise<T>;
	const before = await studio((s) => ({ ...s.doc.items }));
	const tile = page.locator('.equipment-scroll').getByRole('button', { name: /^Loading helm, / });
	await tile.click();
	await expect(tile).toHaveAttribute('aria-pressed', 'true');
	expect(await studio((s) => ({ items: { ...s.doc.items }, drafts: { ...s.doc.drafts } }))).toEqual(
		{ items: before, drafts: { head: 'loading_helm' } }
	);
	const notes = page.locator('.world-loading-items');
	const coverage = page.getByRole('button', { name: '1 equipped item needs frames', exact: true });
	await expect(page.locator('.world-stage')).toHaveAttribute('data-facing', 'south');
	await expect(page.locator('.world-stage')).toHaveAttribute('data-lineup', /north/);
	await expect(
		notes,
		'South is ready, but the visible companion facings are still loading'
	).toHaveText('Loading helm loading — East, North');
	await expect(coverage).toHaveCount(0);
	for (const dir of ['east', 'west', 'north']) {
		await studio((s, d) => {
			s.ui.dir = d;
		}, dir);
		await expect(notes).toHaveText('Loading helm loading — East, North');
		await expect(page.locator('.world-coverage', { hasText: 'hidden' })).toHaveCount(0);
		await expect(coverage).toHaveCount(0);
	}
	await expect(page.locator('.gen')).toHaveCount(0);
	await tile.click();
	await expect(tile).toHaveAttribute('aria-pressed', 'false');
	await expect(notes).toHaveCount(0);
	await tile.click();
	await expect(notes).toHaveText('Loading helm loading — East, North');
	// finished with gaps: those views are missing (hidden and said so), no longer loading; Discard takes the draft off
	await studio((s) => {
		s.gens.find((g) => g.draft.spec.id === 'loading_helm').phase = 'review';
	});
	await expect(notes).toHaveCount(0);
	await expect(coverage).toBeInViewport();
	await coverage.click();
	await expect(page.locator('#preview-coverage')).toContainText('Loading helm');
	await coverage.click();
	await page.getByRole('button', { name: 'More options for Loading helm', exact: true }).click();
	await page.getByRole('menuitem', { name: 'Review item…', exact: true }).click();
	await page.locator('.gen').getByRole('button', { name: 'Discard', exact: true }).click();
	await expect(tile).toHaveCount(0);
	await expect(coverage).toHaveCount(0);
	expect(
		await studio((s) => ({
			items: { ...s.doc.items },
			drafts: { ...s.doc.drafts },
			presets: JSON.stringify(s.store.project.manifest.presets)
		}))
	).toMatchObject({ items: before, drafts: {} });
	expect(await studio((s) => JSON.stringify(s.store.project.manifest))).not.toContain(
		'loading_helm'
	);
	expect(requests).toEqual([]);
});

/** Tab A holds a failed character create (which keeps the jobs there); tab B opens second and follows. */
async function busyFirstTab(
	page: Page,
	context: import('@playwright/test').BrowserContext,
	posts: string[]
) {
	await context.route('https://api.pixellab.ai/**', (r) => {
		if (r.request().method() === 'POST') posts.push(r.request().url());
		return r.abort();
	});
	await context.addInitScript(() => {
		localStorage.setItem('pixeldoll.agentKey', 'off');
		localStorage.setItem('pixeldoll.welcomed', '1');
	});
	await openStudio(page, '/');
	await expect(page.locator('.world-actors').first()).toBeVisible();
	await page.evaluate(
		() =>
			new Promise<void>((resolve, reject) => {
				const r = indexedDB.open('pixeldoll');
				r.onerror = () => reject(r.error);
				r.onsuccess = () => {
					const db = r.result,
						t = db.transaction('projects', 'readwrite');
					t.objectStore('projects').put(
						{
							id: 'studio-create',
							status: 'failed',
							error: 'Saved terminal failure',
							spec: {
								name: 'Failed',
								description: 'body',
								size: 48,
								directions: [{ id: 'south' }, { id: 'east' }, { id: 'north' }, { id: 'west' }],
								seed: 1,
								projectId: 'rig-failed-x'
							}
						},
						'studio-create'
					);
					t.oncomplete = () => {
						db.close();
						resolve();
					};
				};
			})
	);
	await reloadStudio(page);
	const second = await context.newPage();
	await openStudio(second, '/');
	await second.getByRole('button', { name: 'More options', exact: true }).click();
	await expect(second.locator('#experience-options')).toContainText('Other tab');
	await second.keyboard.press('Escape');
	await second.locator('.project-btn').click();
	await second
		.locator('#project-menu')
		.getByRole('button', { name: 'New character', exact: true })
		.click();
	await second.getByRole('menuitem', { name: 'Create from scratch…', exact: true }).click();
	const create = second.getByRole('dialog', { name: 'New character', exact: true });
	await create
		.getByRole('textbox', { name: 'Details', exact: true })
		.fill('a cheerful copper clockwork scout');
	await create.getByRole('button', { name: /^Create/ }).click();
	const activity = second.getByRole('dialog', { name: 'Activity', exact: true });
	await expect(activity).toContainText(
		'Close that tab and it starts here, or press Done to cancel.'
	);
	return { second, activity };
}

test('a click waiting on a busy first tab continues as soon as that tab is idle, without closing it', async ({
	page,
	context
}) => {
	const posts: string[] = [];
	const { second, activity } = await busyFirstTab(page, context, posts);
	await second.waitForTimeout(1500); // several handoff requests: the failed create keeps the jobs in the first tab
	await expect(activity).toBeVisible();
	await expect(second.getByRole('dialog', { name: 'Connect PixelLab', exact: true })).toHaveCount(
		0
	);
	await page.locator('.project-btn').click();
	await page
		.locator('#project-menu')
		.getByRole('button', { name: 'New character', exact: true })
		.click();
	await page.getByRole('menuitem', { name: 'Create from scratch…', exact: true }).click();
	await page
		.getByRole('dialog', { name: 'New character', exact: true })
		.getByRole('button', { name: 'Start over', exact: true })
		.click();
	await expect(second.getByRole('dialog', { name: 'Connect PixelLab', exact: true })).toBeVisible({
		timeout: 15000
	}); // no key: Connect
	expect(posts).toEqual([]);
});

test('leaving Activity by Back cancels a waiting click, so closing the busy tab later starts nothing', async ({
	page,
	context
}) => {
	const posts: string[] = [];
	const { second, activity } = await busyFirstTab(page, context, posts);
	await second.goBack();
	await expect(activity).toHaveCount(0);
	await second.getByRole('button', { name: 'More options', exact: true }).click();
	await second
		.locator('#experience-options')
		.getByRole('button', { name: /Activity/ })
		.click();
	await expect(activity).toBeVisible();
	await expect(activity).not.toContainText('Close that tab and it starts here');
	await page.close(); // with Activity open again, as a user who only looks
	await expect(activity).not.toContainText('Running in another tab', { timeout: 15000 });
	await second.waitForTimeout(1000); // the takeover has resumed; nothing waits to run
	await expect(second.getByRole('dialog', { name: 'Connect PixelLab', exact: true })).toHaveCount(
		0
	);
	expect(posts).toEqual([]);
});

test('Create in a second tab takes the jobs from the idle first tab at once and preserves its draft', async ({
	page,
	context
}) => {
	const requests: string[] = [];
	await context.route('https://api.pixellab.ai/**', (r) => {
		requests.push(r.request().method());
		return r.abort();
	});
	await context.addInitScript(() => {
		localStorage.setItem('pixeldoll.agentKey', 'off');
		localStorage.setItem('pixeldoll.welcomed', '1');
	});
	await openStudio(page, '/');
	await expect(page.locator('.world-actors').first()).toBeVisible();
	const follower = await context.newPage();
	await openStudio(follower, '/');
	await follower.getByRole('button', { name: 'More options', exact: true }).click();
	await expect(follower.locator('#experience-options')).toContainText('Other tab');
	await follower.keyboard.press('Escape');
	async function openCreate() {
		await follower.locator('.project-btn').click();
		await follower
			.locator('#project-menu')
			.getByRole('button', { name: 'New character', exact: true })
			.click();
		await follower.getByRole('menuitem', { name: 'Create from scratch…', exact: true }).click();
		return follower.getByRole('dialog', { name: 'New character', exact: true });
	}
	let create = await openCreate();
	await create
		.getByRole('textbox', { name: 'Details', exact: true })
		.fill('a cheerful copper clockwork scout');
	await create.getByRole('button', { name: 'Side-scroller 2', exact: true }).click();
	await create.getByRole('button', { name: /^Create/ }).click();
	// The first tab runs nothing, so it hands the jobs over and the click continues here (no key: Connect).
	// A busy first tab keeps them and the click waits in Activity (unit and queue self-tests).
	const connect = follower.getByRole('dialog', { name: 'Connect PixelLab', exact: true });
	await expect(connect).toBeVisible({ timeout: 15000 });
	await expect(follower.getByRole('dialog', { name: 'Activity', exact: true })).toHaveCount(0);
	await page.getByRole('button', { name: 'More options', exact: true }).click();
	await expect(page.locator('#experience-options')).toContainText('Other tab');
	await page.keyboard.press('Escape');
	await connect.getByRole('button', { name: 'Cancel', exact: true }).click();
	create = await openCreate();
	await expect(create.getByRole('textbox', { name: 'Details', exact: true })).toHaveValue(
		'a cheerful copper clockwork scout'
	);
	await expect(
		create.getByRole('button', { name: 'Side-scroller 2', exact: true })
	).toHaveAttribute('aria-pressed', 'true');
	expect(requests).toEqual([]);
});

test('mixed malformed draft calls cannot claim Clean when surviving frame checks pass', async ({
	page,
	context
}, info) => {
	const requests: string[] = [];
	await context.route('https://api.pixellab.ai/**', (r) => {
		requests.push(r.request().method());
		return r.abort();
	});
	await page.addInitScript(() => {
		localStorage.setItem('pixeldoll.agentKey', 'off');
		localStorage.setItem('pixeldoll.welcomed', '1');
	});
	await openStudio(
		page,
		info.config.projects.find((p) => p.name === 'browser-selftests')!.use.baseURL!
	);
	await expect(page.locator('.world-actors').first()).toBeVisible();
	await page.evaluate(async () => {
		const s = (
			window as unknown as {
				__studio: {
					ui: { playing: boolean; anim: string; selected: string };
					doc: { id: string };
					store: { project: any; results: Record<string, unknown> };
					gens: unknown[];
					loadGens: () => Promise<void>;
				};
			}
		).__studio;
		await s.loadGens();
		s.ui.playing = false;
		s.ui.anim = 'walk';
		const p = s.store.project,
			it = p.manifest.items.find((i: { slot: string }) => i.slot === 'head');
		const calls = ['south', 'east'].map((d) => ({
			kind: 'pose',
			cells: ['walk/' + d + '/0'],
			seed: 1,
			rerolls: 0,
			old: []
		}));
		s.gens.push({
			draft: {
				rigId: s.doc.id,
				spec: {
					id: it.id,
					name: 'Mixed malformed fixture',
					slot: it.slot,
					prompt: 'hat',
					key: 'magenta',
					anims: ['walk'],
					dirs: ['south', 'east']
				},
				calls,
				keySwitched: false,
				log: []
			},
			input: { name: 'Mixed malformed fixture', slot: it.slot, prompt: 'hat' },
			phase: 'review',
			status: 'Review'
		});
		// The valid call's cells pass; an excluded malformed call remains an independent G1 failure.
		s.store.results = {
			...s.store.results,
			[it.id]: {
				cells: [],
				qa: { qa: { status: 'pass' }, warnings: [], failCalls: new Map(), softCalls: new Set() },
				g1: new Map([[1, 'G1 0 outputs for 3 requested frames']]),
				preview: p
			}
		};
		s.ui.selected = 'gen:' + it.id;
	});
	await reviewSelectedDraft(page);
	const review = page.locator('.gen');
	await expect(review.locator('.badge.look')).toHaveText('Needs a look');
	await expect(review.getByRole('button', { name: 'Keep it', exact: true })).toBeDisabled();
	await expect(
		review.getByText('PixelLab returned an unexpected image', { exact: true })
	).toBeVisible();
	await expect(review.locator('.badge.clean')).toHaveCount(0);
	await expect(review.getByText('Every frame passed the checks.', { exact: true })).toHaveCount(0);
	await page.evaluate(() => {
		const s = (
			window as unknown as {
				__studio: { ui: { selected: string }; store: { results: Record<string, any> } };
			}
		).__studio;
		const id = s.ui.selected.slice(4),
			r = s.store.results[id];
		const count = r.preview.manifest.rig.animations.find(
			(a: { id: string }) => a.id === 'walk'
		).cells;
		const cells = ['south', 'east'].flatMap((dir) =>
			Array.from({ length: count }, (_, i) => ({ key: `walk/${dir}/${i}` }))
		);
		s.store.results = {
			...s.store.results,
			[id]: {
				...r,
				cells,
				g1: new Map([[1, 'D1 keyframe rest/east/0: 25 % gray smudges in a colorful design']])
			}
		};
	});
	await expect(review.locator('.badge.look')).toHaveText('Needs a look');
	await expect(review.getByText('The design has gray smudges', { exact: true })).toBeVisible();
	await expect(review.getByRole('button', { name: 'Keep it', exact: true })).toBeEnabled();
	for (const [warning, reason] of [
		[
			'G8 idle/west: hand positions are missing for 4 of 4 frames; set up the character’s pose rig and check this view',
			'Hand positions are unavailable; set up the pose rig and check this view (idle, west)'
		],
		[
			'G8 idle/west: grip side is unclear (0 right / 0 left frames); check that the item stays in the intended hand',
			'The grip side is unclear; check the intended hand (idle, west)'
		],
		[
			'G8 idle/west: item is more than 6 px from both hands in 4 of 4 frames; check its grip',
			'The grip could not be confirmed; inspect the item at the hand (idle, west)'
		]
	]) {
		await page.evaluate((warning) => {
			const s = (
				window as unknown as {
					__studio: { ui: { selected: string }; store: { results: Record<string, any> } };
				}
			).__studio;
			const id = s.ui.selected.slice(4),
				r = s.store.results[id];
			s.store.results = {
				...s.store.results,
				[id]: { ...r, g1: new Map(), qa: { ...r.qa, warnings: [warning] } }
			};
		}, warning);
		await expect(review.locator('.badge.look')).toHaveText('Needs a look');
		await expect(review.getByText(reason, { exact: true })).toBeVisible();
		await expect(review.getByText('The item switches hands', { exact: true })).toHaveCount(0);
		await expect(review.getByRole('button', { name: 'Keep it', exact: true })).toBeEnabled();
	}
	await page.evaluate(() => {
		const s = (
			window as unknown as {
				__studio: { ui: { selected: string }; store: { results: Record<string, any> } };
			}
		).__studio;
		const id = s.ui.selected.slice(4),
			r = s.store.results[id];
		s.store.results = {
			...s.store.results,
			[id]: { ...r, g1: new Map(), qa: { ...r.qa, warnings: [] } }
		};
	});
	await expect(review.locator('.badge.clean')).toHaveText('Clean');
	await expect(review.getByRole('button', { name: 'Keep it', exact: true })).toBeEnabled();
	await expect(review.getByText('Every frame passed the checks.', { exact: true })).toBeVisible();
	expect(requests).toEqual([]);
});

test('long item and outfit names leave wardrobe controls inside the desktop sidebar', async ({
	page,
	context
}, info) => {
	await context.route('https://api.pixellab.ai/**', (r) => r.abort());
	await page.addInitScript(() => {
		localStorage.setItem('pixeldoll.agentKey', 'off');
		localStorage.setItem('pixeldoll.welcomed', '1');
	});
	await page.setViewportSize({ width: 1280, height: 720 });
	await openStudio(
		page,
		info.config.projects.find((p) => p.name === 'browser-selftests')!.use.baseURL!
	);
	await expect(page.locator('.world-actors').first()).toBeVisible();
	const name =
		'Polished copper clockwork adventurer ceremonial full helmet with a very long descriptive name';
	await page.evaluate((name) => {
		const s = (
			window as unknown as { __studio: { ui: { playing: boolean }; store: { project: any } } }
		).__studio;
		s.ui.playing = false;
		const p = s.store.project,
			head = p.manifest.items.find((i: { slot: string }) => i.slot === 'head');
		s.store.project = {
			...p,
			manifest: {
				...p.manifest,
				items: p.manifest.items.map((i: { id: string }) => (i.id === head.id ? { ...i, name } : i)),
				presets: p.manifest.presets.map((v: object, n: number) => (n === 0 ? { ...v, name } : v))
			}
		};
	}, name);
	const wear = page.locator('.equipment-scroll').getByRole('button', { name, exact: true });
	await expect(wear).toBeVisible();
	await expect(wear).toHaveAttribute('aria-pressed', 'true');
	const dimensions = await page.locator('.equipment-rail').evaluate((side) => {
		const box = side.getBoundingClientRect();
		// The outer rail permits the documented 8px focus/swatch paint overflow.
		const overflows = [
			side,
			...side.querySelectorAll('.equipment-scroll, .slot-tiles, .item-tile, .tile-name')
		]
			// Tile labels truncate with a visible ellipsis by design; nothing else may overflow.
			.filter(
				(n) =>
					n.scrollWidth > n.clientWidth + (n === side ? 8 : 1) &&
					getComputedStyle(n).textOverflow !== 'ellipsis'
			)
			.map((n) => n.className);
		const controls = [...side.querySelectorAll('.item-tile, .tile-more')].map((n) => {
			const r = n.getBoundingClientRect();
			return { left: r.left, right: r.right, width: r.width };
		});
		return { left: box.left, right: box.right, overflows, controls };
	});
	expect(dimensions.overflows).toEqual([]);
	for (const c of dimensions.controls) {
		expect(c.left).toBeGreaterThanOrEqual(dimensions.left);
		expect(c.right).toBeLessThanOrEqual(dimensions.right);
		expect(c.width).toBeGreaterThanOrEqual(24);
	}
	await page
		.locator('.equipment-scroll')
		.getByRole('button', { name: 'Empty head', exact: true })
		.click();
	await expect(wear).toHaveAttribute('aria-pressed', 'false');
	await equipmentMode(page, 'Outfits');
	const saved = page.locator('.outfits .row').filter({ hasText: name });
	await expect(saved).toBeVisible();
	const outfitDimensions = await page.locator('.equipment-rail').evaluate((el) => ({
		width: el.clientWidth,
		scroll: el.scrollWidth,
		rows: [...el.querySelectorAll('.outfits .row')].map((row) => ({
			width: row.clientWidth,
			scroll: row.scrollWidth
		}))
	}));
	expect(outfitDimensions.scroll).toBeLessThanOrEqual(outfitDimensions.width + 8);
	for (const row of outfitDimensions.rows) expect(row.scroll).toBeLessThanOrEqual(row.width + 1);
});

test('interrupted character specifications retain their own estimates', async ({
	page,
	context
}, info) => {
	const calls: string[] = [];
	await context.route('https://api.pixellab.ai/**', (r) => {
		calls.push(r.request().method());
		return r.abort();
	});
	await page.addInitScript(() => {
		localStorage.setItem('pixeldoll.agentKey', 'off');
		localStorage.setItem('pixeldoll.welcomed', '1');
	});
	await openStudio(
		page,
		info.config.projects.find((p) => p.name === 'browser-selftests')!.use.baseURL!
	);
	await expect(page.locator('.world-actors').first()).toBeVisible();
	await page.evaluate(async () => {
		const path = '/src/studio/formDrafts.ts',
			{ formDrafts } = await import(path);
		const configPath = '/src/studio/characterConfig.ts',
			{ newCharacterDraft, setPreset } = await import(configPath);
		// Form drafts are memory-only. A valid current form must not change a persisted older request.
		formDrafts.character = newCharacterDraft();
		setPreset(formDrafts.character, 'unique');
		const s = (
			window as unknown as {
				__studio: { ui: { sheet: string }; creating: { spec: any; error: string } };
			}
		).__studio;
		// A stored interrupted run keeps its own direction plan and size; the new form's defaults must not alter its pricing.
		s.creating.spec = {
			description: 'Interrupted run',
			name: 'Interrupted run',
			seed: 123,
			size: 48,
			directions: [{ id: 'south' }, { id: 'east' }, { id: 'north' }, { id: 'west' }]
		};
		s.creating.error = 'Stored interruption';
		s.ui.sheet = 'create';
	});
	const create = page.getByRole('dialog', { name: 'New character', exact: true });
	// Creation is priced by the draw (body size) plus a standing-joint fallback per direction; it makes no animation.
	await expect(create.getByRole('button', { name: /^Try again/ })).toContainText('2–5 gens');
	await page.evaluate(() => {
		const s = (
			window as unknown as { __studio: { creating: { spec: { directions: { id: string }[] } } } }
		).__studio;
		s.creating.spec.directions = [
			'south',
			'south-east',
			'east',
			'north-east',
			'north',
			'north-west',
			'west',
			'south-west'
		].map((id) => ({ id }));
	});
	await expect(create.getByRole('button', { name: /^Try again/ })).toContainText('2–5 gens');
	await page.evaluate(() => {
		const s = (window as unknown as { __studio: { creating: { spec: { size: number } } } })
			.__studio;
		s.creating.spec.size = 128; // the stored run, not the 64 px form draft, sets the price
	});
	await expect(create.getByRole('button', { name: /^Try again/ })).toContainText('3–5 gens');
	expect(calls).toEqual([]);
});

test('character Try again preserves the direction plan and allocates a fresh publication identity', async ({
	page,
	context
}, info) => {
	const unexpected: string[] = [];
	await context.route('https://api.pixellab.ai/**', async (route) => {
		if (
			route.request().method() === 'GET' &&
			new URL(route.request().url()).pathname.endsWith('/balance')
		)
			await route.fulfill({
				json: {
					subscription: { type: 'generations', status: 'active', generations: 42, total: 100 },
					credits: { type: 'usd', usd: 0 }
				}
			});
		else {
			unexpected.push(route.request().method());
			await route.abort();
		}
	});
	await page.addInitScript(() => {
		localStorage.setItem('pixeldoll.agentKey', 'off');
		localStorage.setItem('pixeldoll.welcomed', '1');
	});
	await openStudio(
		page,
		info.config.projects.find((p) => p.name === 'browser-selftests')!.use.baseURL!
	);
	await expect(page.locator('.world-actors').first()).toBeVisible();
	await page.evaluate(async () => {
		const s = (
			window as unknown as {
				__studio: {
					loadGens: () => Promise<void>;
					creating: { spec: any; error: string };
					ui: { sheet: string };
				};
				originalCreatePut?: IDBObjectStore['put'];
			}
		).__studio;
		await s.loadGens();
		const put = IDBObjectStore.prototype.put;
		(window as unknown as { originalCreatePut: IDBObjectStore['put'] }).originalCreatePut = put;
		IDBObjectStore.prototype.put = function (value, key) {
			if (key === 'studio-create')
				throw new Error('Synthetic draft persistence stopped before any paid request');
			return put.call(this, value, key);
		};
		s.creating.spec = {
			projectId: 'prior-attempt-identity',
			description: 'Retry body',
			name: 'Retry fixture',
			size: 48,
			directions: [{ id: 'south' }, { id: 'east' }, { id: 'north' }, { id: 'west' }],
			seed: 0
		};
		s.creating.error = 'Prior interrupted attempt';
		s.ui.sheet = 'create';
	});
	try {
		await page
			.getByRole('dialog', { name: 'New character', exact: true })
			.getByRole('button', { name: /^Try again/ })
			.click();
		const connect = page.getByRole('dialog', { name: 'Connect PixelLab', exact: true });
		await connect.getByLabel('API key', { exact: true }).fill('synthetic-retry-test-key');
		await connect.getByRole('button', { name: 'Connect', exact: true }).click();
		await expect(page.getByRole('dialog', { name: 'New character', exact: true })).toBeVisible();
		await expect(page.getByRole('dialog', { name: 'New character', exact: true })).toContainText(
			'Synthetic draft persistence stopped before any paid request'
		);
		const retry = await page.evaluate(() => {
			const s = (
				window as unknown as {
					__studio: {
						creating: {
							spec: { projectId?: string; seed: number; directions: { id: string }[] };
						};
					};
				}
			).__studio;
			return {
				projectId: s.creating.spec.projectId,
				seed: s.creating.spec.seed,
				directions: s.creating.spec.directions
			};
		});
		expect(retry.projectId).toBeTruthy();
		expect(retry.projectId).not.toBe('prior-attempt-identity');
		expect(retry.seed).not.toBe(0);
		expect(retry.directions).toEqual([
			{ id: 'south' },
			{ id: 'east' },
			{ id: 'north' },
			{ id: 'west' }
		]);
		expect(unexpected).toEqual([]);
	} finally {
		await page.evaluate(() => {
			const w = window as unknown as { originalCreatePut: IDBObjectStore['put'] };
			IDBObjectStore.prototype.put = w.originalCreatePut;
		});
	}
});

test('Activity distinguishes unknown progress and credits while item guidance keeps the tab open', async ({
	page,
	context
}, info) => {
	const posts: string[] = [];
	await context.route('https://api.pixellab.ai/**', async (route) => {
		const request = route.request();
		if (request.method() === 'GET' && new URL(request.url()).pathname.endsWith('/balance')) {
			await route.fulfill({
				json: {
					subscription: { type: 'generations', status: 'active', generations: 0, total: 100 },
					credits: { type: 'usd', usd: 0 }
				}
			});
		} else {
			if (request.method() === 'POST') posts.push(new URL(request.url()).pathname);
			await route.abort();
		}
	});
	await page.addInitScript(() => {
		localStorage.setItem('pixeldoll.agentKey', 'off');
		localStorage.setItem('pixeldoll.welcomed', '1');
	});
	await openStudio(
		page,
		info.config.projects.find((p) => p.name === 'browser-selftests')!.use.baseURL!
	);
	await expect(page.locator('.world-actors').first()).toBeVisible();
	await page.evaluate(async () => {
		const w = window as unknown as {
			__studio: {
				ui: { selected: string };
				doc: { id: string };
				store: { project: any };
				gens: any[];
				loadGens: () => Promise<void>;
			};
			__queue: {
				disconnect: () => void;
				key: string;
				paused: string | null;
				recs: Map<string, any>;
				emit: () => void;
			};
		};
		const s = w.__studio,
			q = w.__queue;
		await s.loadGens();
		// Render deferred/synchronous states without letting the queue send or poll anything.
		q.disconnect();
		q.recs.clear();
		q.key = 'synthetic-key';
		q.paused = null;
		const common = {
			method: 'POST',
			params: {},
			inputs: [],
			state: 'submitting',
			createdAt: Date.now(),
			submittedAt: Date.now() - 125000,
			nextAt: 0,
			attempts: 1,
			gens: 0,
			usd: 0
		};
		q.recs.set('sync-estimate', {
			...common,
			id: 'sync-estimate',
			label: 'Finding joints fixture',
			endpoint: '/estimate-skeleton',
			requestHash: 'sync-estimate',
			jobs: []
		});
		q.recs.set('awaiting-id', {
			...common,
			id: 'awaiting-id',
			label: 'Submitting fixture',
			endpoint: '/edit-animation-v2',
			requestHash: 'awaiting-id',
			jobs: []
		});
		q.recs.set('known-progress', {
			...common,
			id: 'known-progress',
			label: 'Reported progress fixture',
			endpoint: '/edit-animation-v2',
			requestHash: 'known-progress',
			state: 'running',
			jobs: [
				{
					id: 'known-job',
					status: 'running',
					done: false,
					progress: 0.37,
					queuePosition: 4,
					results: []
				}
			]
		});
		q.emit();
		const it = s.store.project.manifest.items.find((i: { slot: string }) => i.slot === 'head');
		s.gens.push({
			draft: {
				rigId: s.doc.id,
				spec: {
					id: it.id,
					name: 'Waiting fixture',
					slot: it.slot,
					prompt: 'hat',
					key: 'magenta',
					anims: ['walk'],
					dirs: ['south', 'east', 'north']
				},
				calls: [],
				keySwitched: false,
				log: []
			},
			input: { name: 'Waiting fixture', slot: it.slot, prompt: 'hat' },
			phase: 'running',
			status: 'Starting'
		});
		s.ui.selected = 'gen:' + it.id;
	});
	await expect(page.locator('.gen')).toHaveCount(0);
	await page.getByRole('button', { name: 'More options for Waiting fixture', exact: true }).click();
	const menu = page.locator('#item-menu');
	await expect(menu).toContainText(/Keep this tab open|Waiting for your PixelLab key/);
	await expect(menu).not.toContainText('picks up where it left off');
	await menu.getByRole('menuitem', { name: 'Activity…', exact: true }).click();
	const activity = page.getByRole('dialog', { name: 'Activity', exact: true });
	await expect(activity.locator('#activity-submitting-stop')).toHaveText(
		'Stop is unavailable until PixelLab responds.'
	);
	await expect(activity.locator('#activity-submitting-stop')).toBeVisible();
	for (const label of ['Finding joints fixture', 'Submitting fixture']) {
		const row = activity
			.locator('.act-group li')
			.filter({ has: page.getByText(label, { exact: true }) });
		await expect(row.locator('.act-main .small')).toHaveText('Waiting for PixelLab');
		await expect(row.locator('.ring')).toHaveClass(/spin/);
		await expect(row.getByRole('button', { name: 'Stop', exact: true })).toBeVisible();
		await expect(row.getByRole('button', { name: 'Stop', exact: true })).toBeDisabled();
		await expect(row.getByRole('button', { name: 'Stop', exact: true })).toHaveAttribute(
			'aria-describedby',
			'activity-submitting-stop'
		);
		await expect(
			row.getByRole('button', { name: 'Stop', exact: true })
		).toHaveAccessibleDescription('Stop is unavailable until PixelLab responds.');
		await expect(row.locator('.act-meta')).toContainText(/\d+:\d{2}/);
	}
	const known = activity
		.locator('.act-group li')
		.filter({ has: page.getByText('Reported progress fixture', { exact: true }) });
	await expect(known.locator('.act-main .small')).toHaveText('37% · #4 in line');
	await expect(known.locator('.ring')).not.toHaveClass(/spin/);
	await expect(known.getByRole('button', { name: 'Stop', exact: true })).toBeEnabled();
	await page.evaluate(() => {
		const q = (window as unknown as { __queue: { paused: string | null; emit: () => void } })
			.__queue;
		q.paused = 'credits';
		q.emit();
	});
	await expect(activity).toContainText(
		'PixelLab credits are insufficient. Jobs wait until credits are available.'
	);
	await expect(activity).not.toContainText('Out of generations');
	await expect(activity.getByRole('button', { name: 'Resume', exact: true })).toBeVisible();
	await page.evaluate(() => {
		const q = (window as unknown as { __queue: { paused: string | null; emit: () => void } })
			.__queue;
		q.paused = 'offline';
		q.emit();
	});
	await expect(activity).toContainText(
		'You’re offline. Queued work waits; submitted jobs may finish. Reconnect to resume known jobs.'
	);
	await activity.getByRole('button', { name: 'Done', exact: true }).click();
	await page.getByRole('button', { name: 'More options for Waiting fixture', exact: true }).click();
	await expect(menu).toContainText(/Paused while you are offline|Waiting for your PixelLab key/);
	expect(posts).toEqual([]);
});

test('generation tiles keep fixed geometry across progress and terminal states', async ({
	page
}, info) => {
	await openStudio(
		page,
		info.config.projects.find((project) => project.name === 'browser-selftests')!.use.baseURL!
	);
	await standingItemCharacter(page);
	await page.evaluate(async () => {
		const statePath = '/src/studio/state.svelte.ts',
			state = await import(statePath),
			queuePath = '/src/lib/pixellab/queue.ts',
			{ queue } = await import(queuePath),
			projectPath = '/src/lib/store/project.ts',
			project = await import(projectPath),
			routePath = '/src/studio/itemRoute.ts',
			{ itemRoute } = await import(routePath);
		queue.disconnect();
		const base = state.store.project.manifest.items.find(
			(item: { slot: string }) => item.slot === 'body'
		);
		state.store.project = {
			...state.store.project,
			manifest: {
				...state.store.project.manifest,
				items: [
					...state.store.project.manifest.items,
					...Array.from({ length: 4 }, (_, index) => ({
						...base,
						id: 'layout-hair-' + index,
						slot: 'hair',
						name: 'Saved hair ' + index
					}))
				]
			}
		};
		const input = {
				name: 'PonytailWithAnExtremelyLongUnbrokenRibbonTitle',
				slot: 'hair',
				prompt: 'a ponytail'
			},
			draft = await itemRoute.draft(await project.loadProject(state.doc.id), input, []);
		draft.calls[0].recId = 'geometry-fixture';
		state.gens.push({
			draft,
			input,
			phase: 'running',
			status: 'Designing',
			requestText: state.REQUEST_TEXT
		});
		queue.key = 'synthetic-layout-key';
		queue.recs.set('geometry-fixture', {
			id: 'geometry-fixture',
			state: 'running',
			submittedAt: Date.now(),
			jobs: [{ id: 'remote', progress: 0, results: [] }],
			label: 'Ponytail',
			params: {},
			inputs: [],
			createdAt: Date.now(),
			method: 'POST',
			endpoint: '/edit-animation-v2',
			gens: 0,
			usd: 0,
			attempts: 1
		});
		queue.emit();
	});
	const tile = page.locator('[data-tile^="gen:"]');
	for (const theme of ['dark', 'light']) {
		for (const [width, height] of [
			[320, 568],
			[844, 390],
			[1440, 900]
		]) {
			await page.setViewportSize({ width, height });
			await equipmentGroup(page, 'Hair');
			for (const variant of [
				'zero',
				'progress',
				'complete',
				'queued',
				'paused',
				'overrun',
				'failed',
				'review',
				'canceled',
				'save'
			]) {
				await page.evaluate(
					async ({ variant, theme }) => {
						const statePath = '/src/studio/state.svelte.ts',
							state = await import(statePath),
							queuePath = '/src/lib/pixellab/queue.ts',
							{ queue } = await import(queuePath),
							generation = state.gens[0],
							rec = queue.recs.get('geometry-fixture')!;
						state.ui.theme = theme;
						state.applyTheme();
						generation.phase =
							variant === 'review'
								? 'review'
								: ['failed', 'canceled', 'save'].includes(variant)
									? 'failed'
									: 'running';
						generation.canceled = variant === 'canceled' || variant === 'save';
						generation.cancelSaveFailed = variant === 'save';
						generation.error = variant === 'failed' ? 'Synthetic failure' : undefined;
						queue.paused = variant === 'paused' ? 'offline' : null;
						rec.state =
							variant === 'queued' ? 'queued' : variant === 'complete' ? 'done' : 'running';
						rec.submittedAt =
							variant === 'queued'
								? undefined
								: Date.now() - (variant === 'overrun' ? 3_600_000 : 0);
						rec.jobs[0].progress = variant === 'zero' ? 0 : variant === 'complete' ? 1 : 0.16;
						queue.emit();
					},
					{ variant, theme }
				);
				const expectedStatus: Record<string, string | RegExp> = {
					zero: /~[1-9]min left/,
					progress: /~[1-9]min left/,
					complete: 'Checking frames',
					queued: 'Queued',
					paused: 'Paused',
					overrun: 'Taking longer',
					failed: 'Failed',
					review: 'Review',
					canceled: 'Canceled',
					save: 'Save cancellation'
				};
				await expect(tile.locator('.generation-time')).toHaveText(expectedStatus[variant]);
				await expect(tile.locator('.generation-ring')).toHaveCount(
					['failed', 'review', 'canceled', 'save'].includes(variant) ? 0 : 1
				);
				await expect(tile.locator('.generation-percent')).toHaveCount(
					['failed', 'review', 'canceled', 'save'].includes(variant) ? 0 : 1
				);
				await expect(page.locator('[data-tile^="layout-hair-"]')).toHaveCount(4);
				await expectGenerationTileGeometry(
					tile,
					!['failed', 'review', 'canceled', 'save'].includes(variant)
				);
			}
		}
	}
});

test('item tile cancellation confirms cost, retries failed saves and stays canceled after reload', async ({
	page,
	context
}, info) => {
	const requests: string[] = [];
	await context.route('https://api.pixellab.ai/**', async (route) => {
		const request = route.request(),
			path = new URL(request.url()).pathname;
		if (path === '/v2/balance')
			return route.fulfill({
				json: {
					subscription: { type: 'generations', status: 'active', generations: 100, total: 100 },
					credits: { type: 'usd', usd: 0 }
				}
			});
		if (request.method() !== 'GET') requests.push(request.method() + ' ' + path);
		if (request.method() === 'POST')
			return route.fulfill({ status: 202, json: { background_job_id: 'cancel-item-fixture' } });
		if (path === '/v2/background-jobs/cancel-item-fixture')
			return route.fulfill({
				json: { id: 'cancel-item-fixture', status: 'processing', last_response: { progress: 0.42 } }
			});
		return route.abort();
	});
	await page.addInitScript(() => {
		localStorage.setItem('pixeldoll.agentKey', 'off');
		localStorage.setItem('pixeldoll.welcomed', '1');
		localStorage.setItem('pixellabApiKey', 'synthetic-cancel-item-key');
	});
	await openStudio(
		page,
		info.config.projects.find((project) => project.name === 'browser-selftests')!.use.baseURL!
	);
	await standingItemCharacter(page);
	await page.evaluate(async () => {
		const path = '/src/studio/state.svelte.ts',
			state = await import(path);
		await state.startItem({ name: 'Ponytail', slot: 'hair', prompt: 'a ponytail' });
	});
	await equipmentGroup(page, 'Hair');
	const tile = page.locator('[data-tile^="gen:"]');
	await expect(page.getByRole('progressbar', { name: /progress/ })).toHaveAttribute(
		'aria-valuenow',
		'42'
	);
	await expect(tile).toContainText(/~[1-9]min left/);
	await expect(tile).toContainText('Ponytail');
	await expect(page.locator('.gen')).toHaveCount(0);
	await page.evaluate(async () => {
		const path = '/src/studio/state.svelte.ts',
			state = await import(path);
		state.gens[0].input.name = 'Ponytail with a long ribbon';
	});
	for (const theme of ['dark', 'light']) {
		await page.evaluate(async (theme) => {
			const path = '/src/studio/state.svelte.ts',
				state = await import(path);
			state.ui.theme = theme;
			state.applyTheme();
		}, theme);
		for (const [width, height] of [
			[320, 568],
			[844, 390],
			[1440, 900]
		]) {
			await page.setViewportSize({ width, height });
			await equipmentGroup(page, 'Hair');
			await tile.scrollIntoViewIfNeeded();
			await expectGenerationTileGeometry(tile);
			await page.screenshot({
				path: info.outputPath('generation-' + theme + '-' + width + '.png')
			});
		}
	}
	await page.evaluate(async () => {
		const path = '/src/studio/state.svelte.ts',
			state = await import(path);
		state.gens[0].input.name = 'Ponytail';
	});
	await tile.focus();
	await page.keyboard.press('Shift+F10');
	const menu = page.locator('#item-menu');
	await menu.getByRole('menuitem', { name: 'Cancel generation…', exact: true }).click();
	const cancelAlert = page.getByRole('alertdialog', { name: 'Cancel Ponytail?' });
	await expect(menu).not.toBeVisible();
	await expect(cancelAlert.getByRole('button', { name: 'Keep', exact: true })).toBeFocused();
	await expect(cancelAlert).toContainText('Generations already used are not refunded');
	await page.keyboard.press('Escape');
	await expect(cancelAlert).toHaveCount(0);
	const more = page.getByRole('button', { name: 'More options for Ponytail', exact: true });
	await expect(more).toBeFocused();
	await more.click();
	await menu.getByRole('menuitem', { name: 'Cancel generation…', exact: true }).click();
	await cancelAlert.getByRole('button', { name: 'Keep', exact: true }).click();
	await expect(cancelAlert).toHaveCount(0);
	await expect(tile).toContainText('42%');
	await more.click();
	await menu.getByRole('menuitem', { name: 'Cancel generation…', exact: true }).click();
	await page.evaluate(() => {
		const put = IDBObjectStore.prototype.put;
		(window as unknown as { restoreItemPut: () => void }).restoreItemPut = () =>
			(IDBObjectStore.prototype.put = put);
		IDBObjectStore.prototype.put = function (value, key) {
			if (key === 'studio-drafts') throw new Error('Synthetic cancellation save failure');
			return put.call(this, value, key);
		};
	});
	await cancelAlert.getByRole('button', { name: 'Cancel item', exact: true }).click();
	// A failed save stays in the alert; after closing it, the menu offers to save the cancellation again.
	await expect(cancelAlert.getByRole('alert')).toContainText('Synthetic cancellation save failure');
	await cancelAlert.getByRole('button', { name: 'Keep', exact: true }).click();
	await expect(more).toBeFocused();
	await more.click();
	await expect(
		menu.getByRole('menuitem', { name: 'Save cancellation', exact: true })
	).toBeVisible();
	await page.evaluate(() => (window as unknown as { restoreItemPut: () => void }).restoreItemPut());
	await menu.getByRole('menuitem', { name: 'Save cancellation', exact: true }).click();
	await expect(menu).not.toBeVisible();
	await expect(more).toBeFocused();
	await reloadStudio(page);
	await equipmentGroup(page, 'Hair');
	await expect(page.locator('[data-tile^="gen:"]')).toHaveAttribute(
		'aria-label',
		'Ponytail, Canceled'
	);
	await page.getByRole('button', { name: 'More options for Ponytail', exact: true }).click();
	await menu.getByRole('menuitem', { name: 'Review item…', exact: true }).click();
	await expect(page.getByRole('dialog', { name: 'Item review', exact: true })).toBeVisible();
	await page.locator('.gen').getByRole('button', { name: 'Discard', exact: true }).click();
	await expect(page.getByRole('dialog')).toHaveCount(0);
	expect(
		await page.evaluate(async () => {
			const path = '/src/studio/state.svelte.ts';
			return (await import(path)).ui.sheet;
		})
	).toBeNull();
	expect(requests).toEqual(['POST /v2/edit-animation-v2']);
});

test('cancel during the initial item save never starts a paid runner', async ({ page }, info) => {
	await page.addInitScript(() => {
		localStorage.setItem('pixeldoll.agentKey', 'off');
		localStorage.setItem('pixeldoll.welcomed', '1');
	});
	await openStudio(
		page,
		info.config.projects.find((project) => project.name === 'browser-selftests')!.use.baseURL!
	);
	await standingItemCharacter(page);
	const result = await page.evaluate(async () => {
		const path = '/src/studio/state.svelte.ts',
			state = await import(path);
		const put = IDBObjectStore.prototype.put;
		let cancellation: Promise<boolean> | undefined,
			first = true;
		IDBObjectStore.prototype.put = function (value, key) {
			const request = put.call(this, value, key);
			if (key === 'studio-drafts' && first) {
				first = false;
				cancellation = state.cancelGen(state.gens[0]);
			}
			return request;
		};
		try {
			await state.startItem({ name: 'Early cancellation', slot: 'hair', prompt: 'short hair' });
			await cancellation;
			return {
				phase: state.gens[0].phase,
				canceled: state.gens[0].canceled,
				calls: state.gens[0].draft.calls.map((call: { recId?: string }) => call.recId)
			};
		} finally {
			IDBObjectStore.prototype.put = put;
		}
	});
	expect(result).toMatchObject({ phase: 'failed', canceled: true });
	expect(result.calls.every((id: string | undefined) => id === undefined)).toBe(true);
});

test('new item progress, previews and completion survive reload without submitting completed jobs again', async ({
	page,
	context
}, info) => {
	let completed = false;
	const posts: string[] = [],
		errors: string[] = [];
	let images: { type: string; base64: string }[] = [];
	page.on('pageerror', (error) => errors.push(error.message));
	await context.route('https://api.pixellab.ai/**', async (route) => {
		const request = route.request(),
			path = new URL(request.url()).pathname;
		if (path === '/v2/balance')
			return route.fulfill({
				json: {
					subscription: { type: 'generations', status: 'active', generations: 100, total: 100 },
					credits: { type: 'usd', usd: 0 }
				}
			});
		if (request.method() === 'POST') {
			posts.push(path);
			if (path === '/v2/edit-animation-v2') {
				images = request.postDataJSON().frames.map((frame: { image: { base64: string } }) => ({
					type: 'base64',
					base64: frame.image.base64
				}));
				return route.fulfill({ status: 202, json: { background_job_id: 'offline-item-progress' } });
			}
		}
		if (path === '/v2/background-jobs/offline-item-progress')
			return route.fulfill({
				json: {
					id: 'offline-item-progress',
					status: completed ? 'completed' : 'processing',
					created_at: '',
					usage: { type: 'generations', generations: 1 },
					last_response: completed ? { images } : { progress: 0.5 }
				}
			});
		return route.abort();
	});
	await page.addInitScript(() => {
		localStorage.setItem('pixeldoll.agentKey', 'off');
		localStorage.setItem('pixeldoll.welcomed', '1');
		localStorage.setItem('pixellabApiKey', 'synthetic-item-progress-key');
	});
	await openStudio(
		page,
		info.config.projects.find((p) => p.name === 'browser-selftests')!.use.baseURL!
	);
	await standingItemCharacter(page);
	const id = await page.evaluate(async () => {
		const statePath = '/src/studio/state.svelte.ts',
			s = await import(statePath);
		await s.startItem({ name: 'Progress fixture', slot: 'hair', prompt: 'short hair' });
		return s.gens[0].draft.spec.id;
	});
	await equipmentGroup(page, 'Hair');
	await expect(page.locator('.gen')).toHaveCount(0);
	const progress = page.getByRole('progressbar', {
		name: 'Progress fixture progress',
		exact: true
	});
	await expect(progress).toHaveAttribute('aria-valuenow', '50');
	const saved = () =>
		page.evaluate(async () => {
			const p = '/src/lib/store/db.ts',
				db = await import(p);
			return (await db.get('projects', 'studio-drafts')).gens[0];
		});
	const pending = await saved();
	expect(pending.draft.calls).toHaveLength(1);
	expect(pending.draft.calls[0].recId).toBeTruthy();
	await reloadStudio(page);
	await expect.poll(saved).toMatchObject({
		phase: 'running',
		draft: { calls: [{ recId: pending.draft.calls[0].recId }] }
	});
	completed = true;
	// The queue polls a running job every POLL_MS (5 s, src/lib/pixellab/queue.ts), so completion lands about one interval
	// later (measured 4.9-5.0 s): CI's default 5 s expect timeout failed this whenever the poll or extraction ran late.
	await expect.poll(saved, { timeout: 15_000 }).toMatchObject({ phase: 'review' });
	await page.evaluate(async (id) => {
		const p = '/src/studio/state.svelte.ts',
			s = await import(p);
		await s.openGenerationReview(id);
	}, id);
	const gen = page.locator('.gen');
	await expect(gen).toContainText('Needs a look'); // Returning the unchanged mannequin deliberately fails item QA.
	await expect(gen.getByRole('progressbar')).toHaveCount(0);
	await expect
		.poll(() =>
			page.evaluate(async (id) => {
				const p = '/src/studio/state.svelte.ts',
					s = await import(p);
				return !!s.store.results[id]?.preview;
			}, id)
		)
		.toBe(true);
	// Reproduce an older stuck draft whose runner never persisted its job reference.
	await page.evaluate(async () => {
		const p = '/src/lib/store/db.ts',
			db = await import(p);
		const record = await db.get('projects', 'studio-drafts'),
			g = record.gens[0];
		g.phase = 'running';
		g.status = 'Starting';
		delete g.draft.calls[0].recId;
		await db.put('projects', 'studio-drafts', record);
	});
	await reloadStudio(page);
	await expect.poll(saved).toMatchObject({
		phase: 'review',
		draft: { calls: [{ recId: pending.draft.calls[0].recId }] }
	});
	expect(posts).toEqual(['/v2/edit-animation-v2']);
	expect(errors).toEqual([]);
});

test('reload restores failed create, move and setup for review without paid submissions', async ({
	page,
	context
}, info) => {
	const posts: string[] = [];
	await context.route('https://api.pixellab.ai/**', async (route) => {
		const r = route.request();
		if (r.method() === 'GET' && new URL(r.url()).pathname.endsWith('/balance'))
			await route.fulfill({
				json: {
					subscription: { type: 'generations', status: 'active', generations: 42, total: 100 },
					credits: { type: 'usd', usd: 1 }
				}
			});
		else {
			if (r.method() === 'POST') posts.push(new URL(r.url()).pathname);
			await route.abort();
		}
	});
	await page.addInitScript(() => {
		localStorage.setItem('pixeldoll.agentKey', 'off');
		localStorage.setItem('pixeldoll.welcomed', '1');
		localStorage.setItem('pixellabApiKey', 'synthetic-failed-flow-key');
	});
	await openStudio(
		page,
		info.config.projects.find((p) => p.name === 'browser-selftests')!.use.baseURL!
	);
	await expect(page.locator('.world-actors').first()).toBeVisible();
	await page.evaluate(async () => {
		const s = (window as unknown as { __studio: { doc: { id: string }; store: { project: any } } })
			.__studio;
		const path = '/src/lib/store/db.ts',
			db = await import(/* @vite-ignore */ path);
		const common = {
			status: 'failed',
			error: 'Saved terminal failure; inspect Activity',
			progress: { step: 'animate', done: 4, total: 69, recIds: [] }
		};
		await db.put('projects', 'studio-create', {
			...common,
			id: 'studio-create',
			spec: {
				name: 'Failed character',
				description: 'body',
				size: 48,
				directions: [{ id: 'south' }, { id: 'east' }, { id: 'north' }, { id: 'west' }],
				seed: 1,
				projectId: 'rig-failed-browser-fixture'
			}
		});
		await db.put('projects', 'studio-move', {
			...common,
			id: 'studio-move',
			projectId: s.doc.id,
			spec: { id: 'cast', action: 'cast', frames: 8, items: [], seed: 1 }
		});
		await db.put('projects', 'studio-setup', {
			...common,
			id: 'studio-setup',
			spec: {
				projectId: s.doc.id,
				baseHash: s.store.project.manifest.rig.baseHash,
				restAnim: 'idle',
				looks: 'body',
				seed: 1
			}
		});
	});
	await reloadStudio(page);
	await expect(page.locator('.world-actors').first()).toBeVisible();
	await expect
		.poll(() =>
			page.evaluate(async () => {
				const path = '/src/studio/state.svelte.ts',
					s = await import(/* @vite-ignore */ path);
				return [s.creating.error, s.moving.error, s.settingUp.error];
			})
		)
		.toEqual(Array(3).fill('Saved terminal failure; inspect Activity'));
	for (const [sheet, name] of [
		['create', 'New character'],
		['move', 'Add a move'],
		['setup', 'Set up character']
	] as const) {
		await page.evaluate((sheet) => {
			(window as unknown as { __studio: { ui: { sheet: string } } }).__studio.ui.sheet = sheet;
		}, sheet);
		const dialog = page.getByRole('dialog', { name, exact: true });
		await expect(dialog).toContainText('Saved terminal failure; inspect Activity');
		await expect(dialog.locator('.steps-list .ring.spin')).toHaveCount(0);
		await page.keyboard.press('Escape');
	}
	expect(posts).toEqual([]);
});

test('moves waiting behind another character’s failed move point to it', async ({ page }, info) => {
	await page.addInitScript(() => {
		localStorage.setItem('pixeldoll.agentKey', 'off');
		localStorage.setItem('pixeldoll.welcomed', '1');
	});
	await openStudio(
		page,
		info.config.projects.find((p) => p.name === 'browser-selftests')!.use.baseURL!
	);
	await page.locator('.world-actors').first().waitFor();
	await page.evaluate(async () => {
		const path = '/src/studio/state.svelte.ts',
			s = await import(/* @vite-ignore */ path),
			dbPath = '/src/lib/store/db.ts',
			db = await import(/* @vite-ignore */ dbPath);
		const failed = await s.copyDemo(),
			rec = await db.get('projects', failed),
			waiting = 'rig-waiting-fixture';
		rec.manifest.name = 'Failed mover';
		await db.put('projects', failed, rec);
		await db.put('projects', waiting, {
			...rec,
			id: waiting,
			manifest: { ...rec.manifest, name: 'Waiting mover' }
		});
		await s.openProject(waiting);
		await db.put('projects', 'studio-move', {
			id: 'studio-move',
			projectId: failed,
			spec: { id: 'cast', action: 'cast', frames: 8, items: [], seed: 1 },
			status: 'failed',
			error: 'Cast stopped',
			requestText: s.REQUEST_TEXT,
			queued: [
				{ projectId: waiting, spec: { id: 'jump', action: 'jump', frames: 8, items: [], seed: 1 } }
			]
		});
	});
	await reloadStudio(page);
	await equipmentMode(page, 'Moves');
	await page.getByRole('button', { name: /^Jump Waiting for the failed move/ }).click();
	const sheet = page.getByRole('dialog', { name: 'Add a move', exact: true });
	await expect(sheet).toContainText(
		'Cast failed on Failed mover, so new moves wait. Open it to try again or start over.'
	);
	await sheet.getByRole('button', { name: 'Open Failed mover', exact: true }).click();
	await expect(page.locator('.project-btn')).toContainText('Failed mover');
	// A paid retry discloses its estimate on the button itself, not only when saved frames exist.
	await expect(
		sheet.getByRole('button', { name: /^Try again · Est\. [1-9]\d* gens$/ })
	).toBeVisible();
	await expect(sheet.getByRole('button', { name: 'Start over', exact: true })).toBeVisible();
});

test('Activity shows plan-derived capacity without a manual override or network request', async ({
	page,
	context
}, info) => {
	const requests: string[] = [];
	await context.route('https://api.pixellab.ai/**', (r) => {
		requests.push(r.request().method());
		return r.abort();
	});
	await page.addInitScript(() => {
		localStorage.setItem('pixeldoll.agentKey', 'off');
		localStorage.setItem('pixeldoll.welcomed', '1');
	});
	await openStudio(
		page,
		info.config.projects.find((p) => p.name === 'browser-selftests')!.use.baseURL!
	);
	await expect(page.locator('.world-actors').first()).toBeVisible();
	await page.evaluate(async () => {
		const path = '/src/lib/pixellab/queue.ts',
			{ queue } = await import(/* @vite-ignore */ path);
		queue.disconnect();
		queue.setBalance(
			{ subscription: { status: 'active', plan: 'Tier 2: Pixel Artisan' } },
			queue.key
		);
		(window as unknown as { __studio: { ui: { sheet: string } } }).__studio.ui.sheet = 'activity';
	});
	const activity = page.getByRole('dialog', { name: 'Activity', exact: true });
	await expect(activity.getByTestId('queue-capacity')).toHaveText('Up to 10 jobs at once.');
	await activity.getByText('Details', { exact: true }).click();
	await expect(activity.getByRole('spinbutton', { name: 'Parallel calls' })).toHaveCount(0);
	await page.keyboard.press('Escape');
	await expect(activity).toHaveCount(0);
	expect(requests).toEqual([]);
});

test('accepted held-item review reasons survive actual reload without claiming a hand switch', async ({
	page,
	context
}, info) => {
	const requests: string[] = [];
	await context.route('https://api.pixellab.ai/**', (r) => {
		requests.push(r.request().method());
		return r.abort();
	});
	await page.addInitScript(() => {
		localStorage.setItem('pixeldoll.agentKey', 'off');
		localStorage.setItem('pixeldoll.welcomed', '1');
	});
	await openStudio(
		page,
		info.config.projects.find((p) => p.name === 'browser-selftests')!.use.baseURL!
	);
	await expect(page.locator('.world-actors').first()).toBeVisible();
	const name = await page.evaluate(async () => {
		const path = '/src/studio/state.svelte.ts',
			s = await import(path);
		const dbPath = '/src/lib/store/db.ts',
			db = await import(dbPath);
		await s.copyDemo();
		const rec = await db.get('projects', s.doc.id),
			item = rec.manifest.items.find((it: { slot: string }) => it.slot === 'main_hand');
		const part = {
			minKeyKept: 1,
			maxKeyOutside: 0,
			minAreaRatio: 1,
			maxAreaCV: 0,
			maxPaletteDist: 0,
			clipPx: 0,
			status: 'accepted'
		};
		item.qa = {
			...part,
			motionReviewClips: 1,
			rerolls: 0,
			cells: {},
			handedness: 'ok',
			grip: { R: 4, L: 0, amb: 4, none: 4 },
			clips: {
				'idle/west': { ...part, hand: '?', grip: { R: 0, L: 0, amb: 4, none: 0 } },
				'idle/north': { ...part, grip: { R: 0, L: 0, amb: 0, none: 0 } },
				'idle/east': { ...part, hand: '?', grip: { R: 0, L: 0, amb: 0, none: 4 } },
				'idle/south': { ...part, hand: 'r', grip: { R: 4, L: 0, amb: 0, none: 0 } }
			}
		};
		await db.put('projects', s.doc.id, rec);
		return item.name;
	});
	await reloadStudio(page);
	await expect(page.locator('.world-actors').first()).toBeVisible();
	await pickItem(page, name);
	const pane = await selectedItemDetails(page);
	await expect(pane.locator('.badge.accepted')).toHaveText('Accepted');
	await expect(
		pane.getByText('The grip side is unclear; check the intended hand (idle, west)', {
			exact: true
		})
	).toBeVisible();
	await expect(
		pane.getByText('Handedness could not be confirmed; inspect the intended hand (idle, north)', {
			exact: true
		})
	).toBeVisible();
	await expect(
		pane.getByText('The grip could not be confirmed; inspect the item at the hand', { exact: true })
	).toBeVisible();
	await expect(
		pane.getByText("Check the item's size and angle as it moves", { exact: true })
	).toBeVisible();
	await expect(pane.getByText('The item switches hands', { exact: true })).toHaveCount(0);
	await expect(pane.getByText(/Hand positions are unavailable/)).toHaveCount(0);
	expect(requests).toEqual([]);
});

test('Export discloses saved item and body review flags without blocking analysis downloads', async ({
	page,
	context
}, info) => {
	const requests: string[] = [];
	await context.route('https://api.pixellab.ai/**', (r) => {
		requests.push(r.request().method());
		return r.abort();
	});
	await page.addInitScript(() => {
		localStorage.setItem('pixeldoll.agentKey', 'off');
		localStorage.setItem('pixeldoll.welcomed', '1');
	});
	await openStudio(
		page,
		info.config.projects.find((p) => p.name === 'browser-selftests')!.use.baseURL!
	);
	await expect(page.locator('.world-actors').first()).toBeVisible();
	const names = await page.evaluate(async () => {
		const path = '/src/studio/state.svelte.ts',
			s = await import(path),
			dbPath = '/src/lib/store/db.ts',
			db = await import(dbPath);
		await s.copyDemo();
		const rec = await db.get('projects', s.doc.id),
			items = rec.manifest.items.filter((it: { slot: string }) => it.slot !== 'body').slice(0, 4);
		const qa = {
			minKeyKept: 1,
			maxKeyOutside: 0,
			minAreaRatio: 1,
			maxAreaCV: 0,
			maxPaletteDist: 0,
			clipPx: 0,
			rerolls: 0,
			cells: {},
			clips: {}
		};
		items[0].qa = { ...qa, status: 'fail' };
		items[1].qa = { ...qa, status: 'warn' };
		items[2].qa = { ...qa, status: 'accepted' };
		items[2].designWarnings = ['D1 keyframe rest/west/0: gray smudges'];
		items[3].qa = { ...qa, status: 'pass' };
		items[3].designWarnings = ['D1 keyframe rest/south/0: gray smudges'];
		items[3].baseHash = 'sha256:' + 'f'.repeat(64);
		rec.rigQa = {
			clips: {
				'walk/east': { fails: ['arms 2.77 px off the requested pose'] },
				'walk/west': { fails: ['arms 2.10 px off the requested pose'] },
				'idle/south': { fails: [] },
				'removed/south': { fails: ['historical removed clip'] },
				'cross-punch/west': { fails: ['historical unavailable view'] }
			}
		};
		await db.put('projects', s.doc.id, rec);
		return items.map((it: { name: string }) => it.name);
	});
	await reloadStudio(page);
	await expect(page.locator('.world-actors').first()).toBeVisible();
	if (await page.getByRole('dialog', { name: 'Item', exact: true }).count())
		await page.getByRole('button', { name: 'Done', exact: true }).click();
	await page.getByRole('button', { name: 'Export', exact: true }).click();
	const sheet = page.getByRole('dialog', { name: 'Export', exact: true });
	const itemNotice = sheet
		.locator('.notice.warn')
		.filter({ hasText: 'Saved quality or appearance flags:' });
	for (const name of names) await expect(itemNotice).toContainText(name);
	await expect(itemNotice).toContainText('including explicitly accepted artwork');
	const bodyNotice = sheet
		.locator('.notice.warn')
		.filter({ hasText: 'Body frames failed saved checks:' });
	await expect(bodyNotice).toContainText('Walk facing east, Walk facing west');
	await expect(bodyNotice).not.toContainText('Removed');
	await expect(bodyNotice).not.toContainText('Cross punch');
	await sheet.getByRole('radio', { name: /PNG \+ JSON/ }).click();
	const download = sheet.getByRole('button', { name: /^Download ZIP/ });
	await expect(download).toBeEnabled();
	const file = page.waitForEvent('download');
	await download.click();
	expect((await file).suggestedFilename()).toMatch(/generic\.pixeldoll\.zip$/);
	await page.evaluate(async () => {
		const path = '/src/studio/state.svelte.ts',
			s = await import(path),
			dbPath = '/src/lib/store/db.ts',
			db = await import(dbPath);
		const rec = await db.get('projects', s.doc.id);
		for (const it of rec.manifest.items) {
			if (it.qa) it.qa.status = 'pass';
			delete it.designWarnings;
			it.baseHash = rec.manifest.rig.baseHash;
		}
		rec.rigQa = { clips: { 'walk/east': { fails: [] } } };
		await db.put('projects', s.doc.id, rec);
		await s.openProject(s.doc.id);
	});
	await page.getByRole('button', { name: 'Export', exact: true }).click();
	await expect(sheet.getByRole('button', { name: /^Download ZIP/ })).toBeEnabled();
	await expect(sheet.getByText(/Saved quality or appearance flags:/)).toHaveCount(0);
	await expect(sheet.getByText(/Body frames failed saved checks:/)).toHaveCount(0);
	expect(requests).toEqual([]);
});

async function targetedRepairFixture(page: Page) {
	await page.locator('.world-actors').first().waitFor();
	return page.evaluate(async () => {
		const path = '/src/studio/state.svelte.ts',
			s = await import(path),
			dbPath = '/src/lib/store/db.ts',
			db = await import(dbPath);
		const posesPath = '/src/lib/rig/poses.ts',
			poses = await import(posesPath);
		await s.copyDemo();
		const rec = await db.get('projects', s.doc.id),
			m = rec.manifest,
			base = m.items.find((it: { id: string }) => it.id === m.rig.baseItem);
		m.rig.directions = m.rig.directions.map((d: { id: string }) => ({ id: d.id }));
		for (const it of m.items) {
			for (const layer of it.layers)
				for (const dirs of Object.values(layer.cells ?? {}) as any[])
					if (dirs.east && !dirs.west) dirs.west = [...dirs.east];
			it.coverage?.push(
				...it.coverage
					.filter((key: string) => key.split('/')[1] === 'east')
					.map((key: string) => key.replace('/east/', '/west/'))
			);
		}
		const points = poses.LABELS.map((label: string, i: number) => ({
			label,
			x: 0.3 + i * 0.01,
			y: 0.2 + i * 0.025
		}));
		m.rig.rest = {};
		for (const dir of m.rig.directions.map((d: { id: string }) => d.id)) {
			m.rig.rest[dir] = { image: base.layers[0].cells.walk[dir][0], keypoints: points };
			for (const a of m.rig.animations)
				if (base.layers[0].cells[a.id]?.[dir]?.length) {
					a.sources ??= {};
					a.sources[dir] = {
						route: 'skeleton-v3',
						keypoints: Array.from({ length: a.cells }, () => points)
					};
				}
		}
		// Imported characters always include a standing clip. Keep this fixture valid for standing-first item creation.
		base.layers[0].cells.default = Object.fromEntries(
			Object.entries(m.rig.rest).map(([dir, rest]) => [dir, [(rest as { image: string }).image]])
		);
		m.rig.animations = m.rig.animations.filter((a: { id: string }) => a.id !== 'default');
		m.rig.animations.unshift({
			id: 'default',
			cells: 1,
			loop: true,
			frames: [{ cell: 0, ms: 100 }],
			sources: Object.fromEntries(
				Object.entries(m.rig.rest).map(([dir, rest]) => [
					dir,
					{
						route: 'import',
						reference: (rest as { image: string }).image,
						keypoints: [(rest as { keypoints: unknown }).keypoints],
						motion: 'imported-rest',
						provenance: []
					}
				])
			)
		});
		const sword = m.items.find((it: { slot: string }) => it.slot === 'main_hand');
		sword.route = 'skeleton-pose';
		sword.key = 'green';
		sword.dressed = Object.fromEntries(
			Object.entries(m.rig.rest).map(([d, r]) => [d, (r as { image: string }).image])
		);
		rec.character = { id: 'offline-repair-fixture', looks: 'Stored offline fixture' };
		rec.rigQa = {
			clips: {
				'walk/east': { fails: ['arms off pose'] },
				'walk/west': { fails: ['arms off pose'] }
			}
		};
		await db.put('projects', s.doc.id, rec);
		await s.openProject(s.doc.id);
		return { itemId: sword.id, itemName: sword.name };
	});
}

test('failed anchored moves offer cache-only recovery without an API key or a new request', async ({
	page,
	context
}, info) => {
	const posts: string[] = [];
	await context.route('https://api.pixellab.ai/**', async (route) => {
		if (route.request().method() === 'POST') posts.push(route.request().url());
		await route.abort();
	});
	await page.addInitScript(() => {
		localStorage.setItem('pixeldoll.agentKey', 'off');
		localStorage.setItem('pixeldoll.welcomed', '1');
	});
	await openStudio(
		page,
		info.config.projects.find((p) => p.name === 'browser-selftests')!.use.baseURL!
	);
	const { itemId } = await targetedRepairFixture(page);
	await page.evaluate(async (itemId) => {
		const statePath = '/src/studio/state.svelte.ts',
			dbPath = '/src/lib/store/db.ts',
			runPath = '/src/lib/items/run.ts';
		const s = await import(statePath),
			db = await import(dbPath),
			run = await import(runPath);
		const rec = await db.get('projects', s.doc.id),
			item = rec.manifest.items.find((it: { id: string }) => it.id === itemId);
		item.route = 'ea2-anchor';
		item.standing = 'default';
		for (const layer of item.layers) delete layer.cells.walk;
		item.coverage = [];
		await db.put('projects', s.doc.id, rec);
		await db.put('projects', 'studio-move', {
			id: 'studio-move',
			projectId: s.doc.id,
			status: 'failed',
			error: run.ITEM_MOVE_SAVE_CONFLICT,
			requestText: s.REQUEST_TEXT,
			progress: { step: 'items', done: 0, total: 1, recIds: [] },
			spec: {
				id: 'walk',
				items: [itemId],
				dirs: ['east'],
				frames: 8,
				seed: 90,
				itemsOnly: true,
				itemMethod: 'anchor'
			}
		});
	}, itemId);
	await reloadStudio(page);
	await equipmentMode(page, 'Moves');
	await page.getByRole('button', { name: 'Walk Failed: tap for details' }).click();
	const sheet = page.getByRole('dialog', { name: 'Add a move', exact: true });
	await expect(sheet.getByRole('button', { name: /^Generate new frames/ })).toContainText(
		'Est. 10 gens'
	);
	await sheet.getByRole('button', { name: 'Use saved frames', exact: true }).click();
	await expect(sheet).toContainText(
		'Completed frames matching the current body and equipment are unavailable. No generation was requested.'
	);
	await expect(page.getByRole('dialog', { name: 'Connect PixelLab' })).toHaveCount(0);
	expect(posts).toEqual([]);
});

test('a custom move replacement keeps its name and requires a supported frame count and description', async ({
	page
}, info) => {
	await page.addInitScript(() => {
		localStorage.setItem('pixeldoll.agentKey', 'off');
		localStorage.setItem('pixeldoll.welcomed', '1');
	});
	await openStudio(
		page,
		info.config.projects.find((p) => p.name === 'browser-selftests')!.use.baseURL!
	);
	await targetedRepairFixture(page);
	await page.evaluate(async () => {
		const statePath = '/src/studio/state.svelte.ts',
			dbPath = '/src/lib/store/db.ts',
			s = await import(statePath),
			db = await import(dbPath);
		const rec = await db.get('projects', s.doc.id),
			m = rec.manifest;
		m.rig.animations.find((a: { id: string }) => a.id === 'walk').id = 'quiet-step';
		for (const item of m.items)
			for (const layer of item.layers)
				if (layer.cells?.walk) {
					layer.cells['quiet-step'] = layer.cells.walk;
					delete layer.cells.walk;
				}
		await db.put('projects', s.doc.id, rec);
		await s.openProject(s.doc.id);
	});
	await equipmentMode(page, 'Moves');
	await page.getByRole('button', { name: 'Add a move', exact: true }).click();
	const sheet = page.getByRole('dialog', { name: 'Replace move views', exact: true });
	await page.getByRole('radio', { name: 'Cross punch · added', exact: true }).click();
	await expect(sheet).toContainText(
		'Described moves can be generated with 4, 8 or 12 frames. This move has 6.'
	);
	await expect(sheet.getByRole('button', { name: /^Replace Cross punch views/ })).toBeDisabled();
	await sheet.getByRole('radio', { name: 'Quiet step · added', exact: true }).click();
	const replace = sheet.getByRole('button', { name: /^Replace Quiet step views/ });
	await expect(replace).toBeDisabled();
	await expect(sheet).toContainText('Describe this move before generating it.');
	await sheet
		.getByRole('textbox', { name: 'Describe the replacement', exact: true })
		.fill('Step sideways and shift weight to the leading foot');
	await expect(replace).toBeEnabled();
	await expect(replace).toContainText('Est. 23 gens');
});

async function oversizedItemFixture(page: Page, itemId: string) {
	await page.evaluate(async (id) => {
		const sPath = '/src/studio/state.svelte.ts',
			s = await import(sPath),
			dbPath = '/src/lib/store/db.ts',
			db = await import(dbPath);
		const pPath = '/src/lib/store/project.ts',
			projectModule = await import(pPath),
			iPath = '/src/lib/items/items.ts',
			items = await import(iPath),
			pngPath = '/src/lib/image/pngraw.ts',
			png = await import(pngPath);
		const ctx = await projectModule.loadProject(s.doc.id),
			item = ctx.rec.manifest.items.find((it: { id: string }) => it.id === id),
			padded = new Map<string, string>();
		const pad = async (hash: string) => {
			if (!padded.has(hash))
				padded.set(
					hash,
					'sha256:' +
						(await db.putBlob(
							await png.encodePngBytes(items.padImg(ctx.project.images.get(hash), 16))
						))
				);
			return padded.get(hash);
		};
		for (const layer of item.layers) {
			layer.cell = { w: 96, h: 96 };
			layer.pivot = { x: ctx.rec.manifest.rig.pivot.x + 16, y: ctx.rec.manifest.rig.pivot.y + 16 };
			for (const dirs of Object.values(layer.cells) as any[])
				for (const [dir, cells] of Object.entries(dirs) as [string, (string | null)[]][])
					dirs[dir] = await Promise.all(cells.map((hash) => (hash ? pad(hash) : null)));
		}
		for (const [dir, hash] of Object.entries(item.dressed) as [string, string][])
			item.dressed[dir] = await pad(hash);
		await db.put('projects', s.doc.id, ctx.rec);
		await s.openProject(s.doc.id);
		s.ui.anim = 'walk';
		s.ui.dir = 'west';
		s.pick(id);
	}, itemId);
}

test('targeted move replacement scopes views, estimates and retained drafts before any paid work', async ({
	page,
	context
}, info) => {
	const posts: string[] = [];
	await context.route('https://api.pixellab.ai/**', async (r) => {
		if (r.request().method() === 'GET' && new URL(r.request().url()).pathname.endsWith('/balance'))
			await r.fulfill({
				json: {
					subscription: { type: 'generations', status: 'active', generations: 42, total: 100 },
					credits: { usd: 1 }
				}
			});
		else {
			posts.push(r.request().method());
			await r.abort();
		}
	});
	const errors: string[] = [];
	page.on('pageerror', (e) => errors.push(e.message));
	await page.addInitScript(() => {
		localStorage.setItem('pixeldoll.agentKey', 'off');
		localStorage.setItem('pixeldoll.welcomed', '1');
	});
	await openStudio(
		page,
		info.config.projects.find((p) => p.name === 'browser-selftests')!.use.baseURL!
	);
	const fixture = await targetedRepairFixture(page);
	await equipmentMode(page, 'Moves');
	await page.getByRole('button', { name: 'Add a move', exact: true }).click();
	await page.getByRole('radio', { name: 'Walk · added', exact: true }).click();
	const sheet = page.getByRole('dialog', { name: 'Replace move views', exact: true });
	await expect(sheet.getByRole('checkbox', { name: 'East', exact: true })).toBeChecked();
	await expect(sheet.getByRole('checkbox', { name: 'West', exact: true })).toBeChecked();
	await expect(sheet.getByRole('checkbox', { name: 'South', exact: true })).not.toBeChecked();
	await expect(sheet.getByRole('checkbox', { name: 'North', exact: true })).not.toBeChecked();
	await expect(
		sheet.getByRole('checkbox', { name: new RegExp(fixture.itemName) })
	).not.toBeChecked();
	await sheet.getByRole('checkbox', { name: new RegExp(fixture.itemName) }).check();
	await expect(sheet.getByRole('button', { name: /^Replace Walk views/ })).toContainText(
		'Est. 22 gens'
	);
	await sheet.getByRole('checkbox', { name: 'East', exact: true }).uncheck();
	await sheet.getByRole('checkbox', { name: 'West', exact: true }).uncheck();
	await expect(sheet.getByRole('button', { name: /^Replace Walk views/ })).toBeDisabled();
	await sheet.getByRole('checkbox', { name: 'East', exact: true }).check();
	await expect(sheet.getByRole('button', { name: /^Replace Walk views/ })).toContainText(
		'Est. 11 gens'
	);
	await sheet.getByRole('button', { name: /^Replace Walk views/ }).click();
	await page
		.getByRole('dialog', { name: 'Connect PixelLab' })
		.getByRole('button', { name: 'Cancel', exact: true })
		.click();
	await page.getByRole('button', { name: 'Add a move', exact: true }).click();
	await expect(sheet.getByRole('checkbox', { name: 'East', exact: true })).toBeChecked();
	await expect(sheet.getByRole('checkbox', { name: 'West', exact: true })).not.toBeChecked();
	await page.evaluate(() => {
		const original = IDBObjectStore.prototype.put;
		IDBObjectStore.prototype.put = function (value, key) {
			if (key === 'studio-move')
				throw new Error('Offline repair persistence stopped before paid work');
			return original.call(this, value, key);
		};
	});
	await sheet.getByRole('button', { name: /^Replace Walk views/ }).click();
	const connect = page.getByRole('dialog', { name: 'Connect PixelLab' });
	await connect.getByLabel('API key', { exact: true }).fill('synthetic-targeted-repair-key');
	await connect.getByRole('button', { name: 'Connect', exact: true }).click();
	await expect(sheet).toContainText('Offline repair persistence stopped before paid work');
	const scope = await page.evaluate(async () => {
		const path = '/src/studio/state.svelte.ts',
			s = await import(path);
		return s.moving.spec;
	});
	expect(scope).toMatchObject({
		id: 'walk',
		replace: true,
		dirs: ['east'],
		items: [fixture.itemId],
		poseStyle: 'visible-side-v1'
	});
	expect(posts).toEqual([]);
	expect(errors).toEqual([]);
});

test('partial missing gear and explicit item repair stay on the current move and view', async ({
	page,
	context
}, info) => {
	const posts: string[] = [];
	await context.route('https://api.pixellab.ai/**', async (r) => {
		if (r.request().method() === 'GET' && new URL(r.request().url()).pathname.endsWith('/balance'))
			await r.fulfill({
				json: {
					subscription: { type: 'generations', status: 'active', generations: 42, total: 100 },
					credits: { usd: 1 }
				}
			});
		else {
			posts.push(r.request().method());
			await r.abort();
		}
	});
	await page.addInitScript(() => {
		localStorage.setItem('pixeldoll.agentKey', 'off');
		localStorage.setItem('pixeldoll.welcomed', '1');
	});
	await openStudio(
		page,
		info.config.projects.find((p) => p.name === 'browser-selftests')!.use.baseURL!
	);
	const fixture = await targetedRepairFixture(page);
	await page.evaluate(async (id) => {
		const path = '/src/studio/state.svelte.ts',
			s = await import(path);
		const p = s.store.project,
			item = p.manifest.items.find((it: { id: string }) => it.id === id);
		for (const layer of item.layers) delete layer.cells.walk.west;
		item.coverage = item.coverage.filter((key: string) => !key.startsWith('walk/west/'));
		s.store.project = {
			...p,
			manifest: {
				...p.manifest,
				items: p.manifest.items.map((it: { id: string }) => (it.id === id ? { ...item } : it))
			}
		};
		const dbPath = '/src/lib/store/db.ts',
			db = await import(dbPath),
			rec = await db.get('projects', s.doc.id);
		rec.manifest = s.store.project.manifest;
		await db.put('projects', s.doc.id, rec);
		await s.openProject(s.doc.id);
		s.ui.anim = 'walk';
		s.ui.dir = 'west';
		s.ui.all = false;
		s.pick(id);
		const original = IDBObjectStore.prototype.put;
		IDBObjectStore.prototype.put = function (value, key) {
			if (key === 'studio-move') throw new Error('Scoped repair stopped before paid work');
			return original.call(this, value, key);
		};
	}, fixture.itemId);
	await inspectStage(page);
	const make = page.locator('.stage-note').getByRole('button', { name: /^Make it/ });
	await expect(make).toContainText('Est. 3 gens');
	await make.click();
	const connect = page.getByRole('dialog', { name: 'Connect PixelLab' });
	await connect.getByLabel('API key', { exact: true }).fill('synthetic-partial-repair-key');
	await connect.getByRole('button', { name: 'Connect', exact: true }).click();
	let sheet = page.getByRole('dialog', { name: 'Add a move', exact: true });
	await expect(sheet).toContainText('Scoped repair stopped before paid work');
	const poseScope = await page.evaluate(async () => {
		const path = '/src/studio/state.svelte.ts',
			s = await import(path);
		return s.moving.spec;
	});
	expect(poseScope).toMatchObject({ id: 'walk', dirs: ['west'], items: [fixture.itemId] });
	expect(poseScope.replace).toBeUndefined();
	expect(poseScope.itemMethod).toBeUndefined();
	await sheet.getByRole('button', { name: 'Start over', exact: true }).click();
	await sheet.getByRole('button', { name: 'Cancel', exact: true }).click();
	await selectedItemDetails(page);
	const repair = page.getByRole('button', { name: /^Try new item frames/ });
	await expect(repair).toContainText('Est. 10 gens'); // The bundled fixture uses actual 64 px equipment layers.
	await oversizedItemFixture(page, fixture.itemId);
	await expect(repair).toContainText('Est. 15 gens');
	await repair.click();
	sheet = page.getByRole('dialog', { name: 'Repair item frames', exact: true });
	await expect(sheet).toContainText('Scoped repair stopped before paid work');
	const gridScope = await page.evaluate(async () => {
		const path = '/src/studio/state.svelte.ts',
			s = await import(path);
		return s.moving.spec;
	});
	expect(gridScope).toMatchObject({
		id: 'walk',
		dirs: ['west'],
		items: [fixture.itemId],
		itemMethod: 'grid'
	});
	expect(gridScope.replace).toBeUndefined();
	expect(posts).toEqual([]);
});

test('unsafe imported equipment prices its frozen route and unsupported held offers stay usable', async ({
	page,
	context
}, info) => {
	const posts: string[] = [],
		errors: string[] = [];
	page.on('pageerror', (error) => errors.push(error.message));
	await context.route('https://api.pixellab.ai/**', (route) => {
		posts.push(route.request().method());
		return route.abort();
	});
	await page.addInitScript(() => {
		localStorage.setItem('pixeldoll.agentKey', 'off');
		localStorage.setItem('pixeldoll.welcomed', '1');
	});
	await openStudio(
		page,
		info.config.projects.find((p) => p.name === 'browser-selftests')!.use.baseURL!
	);
	const fixture = await targetedRepairFixture(page);
	await page.evaluate(async (id) => {
		const path = '/src/studio/state.svelte.ts',
			s = await import(path),
			dbPath = '/src/lib/store/db.ts',
			db = await import(dbPath);
		const rec = await db.get('projects', s.doc.id),
			m = rec.manifest,
			item = m.items.find((i: { id: string }) => i.id === id);
		item.slot = 'torso_inner';
		const points = m.rig.rest.south.keypoints.map((p: { label: string }) => {
			const side = p.label.startsWith('LEFT') ? -1 : p.label.startsWith('RIGHT') ? 1 : 0;
			const joint = p.label.replace(/^(LEFT|RIGHT) /, '');
			const [spread, y] = (
				{
					NOSE: [0, 0.2],
					NECK: [0, 0.35],
					SHOULDER: [0.15, 0.35],
					ELBOW: [0.2, 0.5],
					ARM: [0.22, 0.65],
					HIP: [0.1, 0.62],
					KNEE: [0.11, 0.77],
					LEG: [0.12, 0.93],
					EYE: [0.06, 0.17],
					EAR: [0.12, 0.19]
				} as Record<string, number[]>
			)[joint];
			return { label: p.label, x: 0.5 + side * spread, y };
		});
		const bad = points.map((p: { label: string; x: number }) =>
			/SHOULDER|HIP/.test(p.label)
				? { ...p, x: 1 - p.x }
				: p.label === 'LEFT EAR'
					? { ...p, x: 0.62 }
					: p
		);
		m.rig.rest.south.keypoints = points;
		const walk = m.rig.animations.find((a: { id: string }) => a.id === 'walk');
		walk.sources.south = {
			route: 'import',
			keypoints: Array.from({ length: walk.cells }, (_, i) => (i === 1 ? bad : points))
		};
		for (const layer of item.layers) delete layer.cells.walk.south;
		item.coverage = item.coverage.filter((key: string) => !key.startsWith('walk/south/'));
		await db.put('projects', s.doc.id, rec);
		await s.openProject(s.doc.id);
		s.ui.anim = 'walk';
		s.ui.dir = 'south';
		s.ui.all = false;
		s.wear(id);
		s.pick(id);
		s.ui.group = 'Body';
	}, fixture.itemId);
	await inspectStage(page);
	await expect(page.locator('.stage-note').getByRole('button', { name: /^Make it/ })).toContainText(
		'Est. 10 gens'
	);
	await selectedItemDetails(page);
	await expect(page.getByRole('button', { name: /^Make for Walk/ })).toContainText('Est. 10 gens');
	await page.evaluate(async (id) => {
		const path = '/src/studio/state.svelte.ts',
			s = await import(path),
			dbPath = '/src/lib/store/db.ts',
			db = await import(dbPath);
		const rec = await db.get('projects', s.doc.id),
			item = rec.manifest.items.find((i: { id: string }) => i.id === id);
		item.slot = 'main_hand';
		await db.put('projects', s.doc.id, rec);
		await s.openProject(s.doc.id);
		s.wear(id);
		s.pick(id);
	}, fixture.itemId);
	await expect(page.getByRole('button', { name: /^Make for Walk/ })).toBeDisabled();
	await expect(page.getByRole('button', { name: /^Make for Walk/ })).toContainText('Unavailable');
	await expect(
		page.locator('.notice').filter({ hasText: 'suspicious estimated joints' }).first()
	).toBeVisible();
	await page
		.getByRole('dialog', { name: 'Item', exact: true })
		.getByRole('button', { name: 'Done', exact: true })
		.click();
	await inspectStage(page);
	await expect(
		page.locator('.stage-note').getByRole('button', { name: /^Make it/ })
	).toBeDisabled();
	expect(posts).toEqual([]);
	expect(errors).toEqual([]);
});

test('deferred item repair refuses changed artwork and price after Connect', async ({
	page,
	context
}, info) => {
	const posts: string[] = [];
	await context.route('https://api.pixellab.ai/**', async (route) => {
		if (
			route.request().method() === 'GET' &&
			new URL(route.request().url()).pathname.endsWith('/balance')
		)
			await route.fulfill({
				json: {
					subscription: { type: 'generations', status: 'active', generations: 42, total: 100 },
					credits: { usd: 1 }
				}
			});
		else {
			posts.push(route.request().method());
			await route.abort();
		}
	});
	await page.addInitScript(() => {
		localStorage.setItem('pixeldoll.agentKey', 'off');
		localStorage.setItem('pixeldoll.welcomed', '1');
	});
	await openStudio(
		page,
		info.config.projects.find((p) => p.name === 'browser-selftests')!.use.baseURL!
	);
	const fixture = await targetedRepairFixture(page);
	await page.evaluate(async (id) => {
		const path = '/src/studio/state.svelte.ts',
			s = await import(path);
		s.ui.anim = 'walk';
		s.ui.dir = 'west';
		s.pick(id);
	}, fixture.itemId);
	await selectedItemDetails(page);
	const repair = page.getByRole('button', { name: /^Try new item frames/ });
	await expect(repair).toContainText('Est. 10 gens');
	await repair.click();
	const connect = page.getByRole('dialog', { name: 'Connect PixelLab' });
	await oversizedItemFixture(page, fixture.itemId);
	await connect.getByLabel('API key', { exact: true }).fill('synthetic-delayed-item-key');
	await connect.getByRole('button', { name: 'Connect', exact: true }).click();
	await expect(page.getByRole('dialog', { name: 'Repair item frames', exact: true })).toContainText(
		'review its current estimate'
	);
	expect(posts).toEqual([]);
});

test('reviewed joint-check recovery reuses cached body identity, discloses charges and persists consent before work', async ({
	page,
	context
}, info) => {
	const posts: string[] = [];
	await context.route('https://api.pixellab.ai/**', async (r) => {
		if (r.request().method() === 'GET' && new URL(r.request().url()).pathname.endsWith('/balance'))
			await r.fulfill({
				json: {
					subscription: { type: 'generations', status: 'active', generations: 42, total: 100 },
					credits: { usd: 1 }
				}
			});
		else {
			posts.push(r.request().method());
			await r.abort();
		}
	});
	const errors: string[] = [];
	page.on('pageerror', (e) => errors.push(e.message));
	await page.addInitScript(() => {
		localStorage.setItem('pixeldoll.agentKey', 'off');
		localStorage.setItem('pixeldoll.welcomed', '1');
	});
	await openStudio(
		page,
		info.config.projects.find((p) => p.name === 'browser-selftests')!.use.baseURL!
	);
	await targetedRepairFixture(page);
	const original = await page.evaluate(async () => {
		const statePath = '/src/studio/state.svelte.ts',
			s = await import(statePath),
			dbPath = '/src/lib/store/db.ts',
			db = await import(dbPath);
		const projectPath = '/src/lib/store/project.ts',
			projectModule = await import(projectPath),
			posePath = '/src/lib/rig/poses.ts',
			poses = await import(posePath);
		const clipPath = '/src/lib/rig/clips.ts',
			clips = await import(clipPath),
			createPath = '/src/studio/create.ts',
			create = await import(createPath);
		const queuePath = '/src/lib/pixellab/queue.ts',
			q = await import(queuePath),
			routePath = '/src/lib/pixellab/routes.ts',
			routes = await import(routePath);
		const normPath = '/src/lib/rig/normalize.ts',
			norm = await import(normPath),
			pngPath = '/src/lib/image/pngraw.ts',
			pngRaw = await import(pngPath);
		const spec = {
			id: 'slash',
			action: 'slash',
			frames: 8,
			items: [],
			seed: 421,
			replace: true,
			dirs: ['west'],
			poseStyle: 'visible-side-v1'
		};
		const { rec, project } = await projectModule.loadProject(s.doc.id),
			rig = rec.manifest.rig,
			rest = rig.rest.west,
			image = project.images.get(rest.image);
		const keypoints = poses
			.authoredPoses(
				spec.action,
				poses.fromApi(rest.keypoints, rig.cell),
				'west',
				rig.cell.w,
				spec.poseStyle
			)
			.map((p: unknown) => poses.toApi(p, rig.cell));
		const req = clips.rawClip({
			first: await create.b64(image),
			rest: rest.keypoints,
			keypoints,
			description: rec.character.looks,
			action: 'slash, empty hands, no weapon, no props, no effects',
			dir: 'west',
			seed: spec.seed + 101,
			view: rig.view
		});
		const sha = await db.putBlob(await pngRaw.encodePngBytes(image));
		const secondImage = { ...image, data: new Uint8ClampedArray(image.data) };
		for (let i = 0; i < secondImage.data.length; i += 4)
			if (secondImage.data[i + 3]) {
				secondImage.data[i] ^= 32;
				break;
			}
		const secondSha = await db.putBlob(await pngRaw.encodePngBytes(secondImage));
		const raw = {
			id: 'offline-body-done',
			tag: 'studio-move',
			method: req.method,
			endpoint: req.path,
			...(await q.requestIdentity(req)),
			state: 'done',
			attempts: 1,
			nextAt: 0,
			createdAt: Date.now(),
			jobs: [
				{
					id: 'offline-results',
					status: 'done',
					done: true,
					results: keypoints.map((_: unknown, i: number) => ({
						label: String(i),
						sha: i ? secondSha : sha
					}))
				}
			],
			gens: 3,
			usd: 0
		};
		await db.put('jobs', raw.id, raw);
		const clean = clips.largestComponent(norm.normalize(image, 64, 64, 128, 64).img).img;
		const estimate = routes.routes.estimateSkeleton(routes.png(await create.b64(clean)));
		const lost = {
			id: 'offline-joint-lost',
			tag: 'studio-move',
			method: estimate.method,
			endpoint: estimate.path,
			...(await q.requestIdentity(estimate)),
			state: 'lost',
			attempts: 1,
			nextAt: 0,
			createdAt: Date.now() + 1,
			submittedAt: Date.now(),
			jobs: [],
			gens: 0,
			usd: 0,
			error: 'Synthetic HTTP 500; unknown paid outcome'
		};
		await db.put('jobs', lost.id, lost);
		const secondClean = clips.largestComponent(
			norm.normalize(secondImage, 64, 64, 128, 64).img
		).img;
		const pendingReq = routes.routes.estimateSkeleton(routes.png(await create.b64(secondClean)));
		await db.put('jobs', 'offline-joint-pending', {
			...lost,
			id: 'offline-joint-pending',
			state: 'queued',
			attempts: 0,
			...(await q.requestIdentity(pendingReq))
		});
		await db.put('projects', 'studio-move', {
			id: 'studio-move',
			projectId: s.doc.id,
			spec,
			status: 'failed',
			error: 'Joint-check outcome unknown'
		});
		return { spec, projectId: s.doc.id };
	});
	await reloadStudio(page);
	await expect(page.locator('.world-actors').first()).toBeVisible();
	await page.evaluate(async () => {
		const statePath = '/src/studio/state.svelte.ts',
			state = await import(statePath),
			dbPath = '/src/lib/store/db.ts',
			db = await import(dbPath);
		const record = await db.get('projects', state.doc.id),
			excluded = new Set(
				Object.values(record.manifest.rig.rest as Record<string, { image: string }>).map((rest) =>
					rest.image.slice(7)
				)
			);
		for (const job of await db.all('jobs'))
			for (const sub of job.jobs ?? [])
				for (const result of sub.results ?? []) excluded.add(result.sha);
		const hash = record.manifest.items
			.filter((item: { id: string }) => item.id !== record.manifest.rig.baseItem)
			.flatMap((item: { layers: { cells: Record<string, Record<string, string[]>> }[] }) =>
				item.layers.flatMap((layer) =>
					Object.values(layer.cells).flatMap((dirs) => Object.values(dirs).flat())
				)
			)
			.find((hash: string) => hash && !excluded.has(hash.slice(7)));
		if (!hash) throw new Error('Recovery fixture needs unrelated equipment pixels');
		const original = IDBObjectStore.prototype.get,
			audit: {
				reads: number;
				stacks: string[];
				failRest: boolean;
				pauseRest: boolean;
				ready: boolean;
				release: () => void;
			} = {
				reads: 0,
				stacks: [],
				failRest: true,
				pauseRest: true,
				ready: false,
				release: () => {
					throw new Error('Standing image read is not ready');
				}
			},
			restHash = record.manifest.rig.rest.west.image.slice(7);
		(window as unknown as { recoveryBlobAudit: typeof audit }).recoveryBlobAudit = audit;
		IDBObjectStore.prototype.get = function (query) {
			if (this.name === 'blobs' && query === hash.slice(7)) {
				const error = new Error('Unrelated equipment must not be decoded for recovery');
				audit.reads++;
				audit.stacks.push(error.stack ?? error.message);
				throw error;
			}
			if (this.name === 'blobs' && query === restHash && audit.failRest) {
				audit.failRest = false;
				throw new Error('Synthetic standing image storage failure');
			}
			if (this.name === 'blobs' && query === restHash && audit.pauseRest) {
				audit.pauseRest = false;
				const transaction = this.transaction;
				Object.defineProperty(transaction, 'oncomplete', {
					set(callback: (this: IDBTransaction, event: Event) => void) {
						transaction.addEventListener(
							'complete',
							(event) => {
								audit.ready = true;
								audit.release = () => callback.call(transaction, event);
							},
							{ once: true }
						);
					}
				});
			}
			return original.call(this, query);
		};
	});
	await page.evaluate(async () => {
		const p = '/src/studio/state.svelte.ts',
			s = await import(p);
		s.ui.sheet = 'move';
	});
	const sheet = page.getByRole('dialog', { name: 'Replace move views', exact: true });
	await expect(sheet).toContainText('Joint-check outcome unknown');
	await expect(sheet).toContainText(
		'Could not check cached frames: Synthetic standing image storage failure'
	);
	await sheet.getByRole('button', { name: 'Hide', exact: true }).click();
	await page.evaluate(async () => {
		const p = '/src/studio/state.svelte.ts',
			s = await import(p);
		s.ui.sheet = 'move';
	});
	await expect(sheet.getByRole('status')).toHaveText('Checking cached frames…');
	await expect
		.poll(() =>
			page.evaluate(
				() =>
					(window as unknown as { recoveryBlobAudit: { ready: boolean } }).recoveryBlobAudit.ready
			)
		)
		.toBe(true);
	await page.evaluate(() =>
		(
			window as unknown as { recoveryBlobAudit: { release: () => void } }
		).recoveryBlobAudit.release()
	);
	await expect(sheet).toContainText(
		'Wait for the current joint checks to finish before recovering them.'
	);
	await expect(sheet.getByRole('status')).toHaveCount(0);
	await expect(sheet.getByRole('button', { name: 'Retry joint checks', exact: true })).toHaveCount(
		0
	);
	await page.evaluate(async () => {
		const dbPath = '/src/lib/store/db.ts',
			db = await import(dbPath),
			statePath = '/src/studio/state.svelte.ts',
			s = await import(statePath),
			qPath = '/src/lib/pixellab/queue.ts',
			q = await import(qPath);
		const row = await db.get('jobs', 'offline-joint-pending'),
			rec = await db.get('projects', s.doc.id);
		row.state = 'done';
		row.response = { keypoints: rec.manifest.rig.rest.west.keypoints };
		await db.put('jobs', row.id, row);
		await q.queue.load();
	});
	const diagnosis = await page.evaluate(async () => {
		const p = '/src/studio/state.svelte.ts',
			s = await import(p),
			c = '/src/studio/create.ts',
			create = await import(c);
		try {
			return await create.measurementRecoveryPlan(s.moving.projectId, s.moving.spec);
		} catch (e) {
			return String(e);
		}
	});
	expect(diagnosis).toMatchObject({ checks: 1, recordIds: ['offline-joint-lost'] });
	expect(diagnosis.checkHashes).toHaveLength(1);
	await expect(
		sheet.getByRole('button', { name: 'Retry joint checks', exact: true })
	).toBeVisible();
	const audited = await page.evaluate(
		() =>
			(window as unknown as { recoveryBlobAudit: { reads: number; stacks: string[] } })
				.recoveryBlobAudit
	);
	expect(audited.reads, audited.stacks.join('\n')).toBe(0);
	await expect(sheet).toContainText('Retry 1 unfinished joint check ·');
	await expect(sheet).toContainText('estimated 0.1 gens or $0.005');
	await expect(sheet).toContainText(
		'Unknown checks may already have charged; retrying can charge again'
	);
	await sheet.getByRole('button', { name: 'Retry joint checks', exact: true }).click();
	const connect = page.getByRole('dialog', { name: 'Connect PixelLab' });
	await expect(connect).toBeVisible();
	await connect.getByRole('button', { name: 'Cancel', exact: true }).click();
	await page.evaluate(async () => {
		const p = '/src/studio/state.svelte.ts',
			s = await import(p);
		s.ui.sheet = 'move';
	});
	await expect(
		sheet.getByRole('button', { name: 'Retry joint checks', exact: true })
	).toBeVisible();
	expect(
		await page.evaluate(
			() => (window as unknown as { recoveryBlobAudit: { reads: number } }).recoveryBlobAudit.reads
		)
	).toBe(0);
	await page.evaluate(() => {
		const put = IDBObjectStore.prototype.put;
		IDBObjectStore.prototype.put = function (value, key) {
			if (key === 'studio-move' && value.status === 'running')
				throw new Error('Offline consent storage blocked');
			return put.call(this, value, key);
		};
	});
	await sheet.getByRole('button', { name: 'Retry joint checks', exact: true }).click();
	await connect.getByLabel('API key', { exact: true }).fill('synthetic-measurement-recovery-key');
	await connect.getByRole('button', { name: 'Connect', exact: true }).click();
	await expect(sheet).toContainText('Offline consent storage blocked');
	const pending = await page.evaluate(async () => {
		const p = '/src/studio/state.svelte.ts',
			s = await import(p);
		return { spec: s.moving.spec, projectId: s.moving.projectId };
	});
	expect(pending.projectId).toBe(original.projectId);
	expect(pending.spec).toMatchObject(original.spec);
	expect(pending.spec.measurementRecovery).toMatchObject({
		recordIds: ['offline-joint-lost'],
		checkHashes: diagnosis.checkHashes
	});
	expect(pending.spec.measurementRecovery.id).toMatch(/^[a-f0-9-]{36}$/);
	await sheet.getByRole('button', { name: 'Hide', exact: true }).click();
	const currentRig = await page.evaluate(async () => {
		const statePath = '/src/studio/state.svelte.ts',
			s = await import(statePath),
			dbPath = '/src/lib/store/db.ts',
			db = await import(dbPath);
		const queuePath = '/src/lib/pixellab/queue.ts',
			q = await import(queuePath),
			replacePath = '/src/studio/replaceMove.ts',
			replace = await import(replacePath);
		const rec = await db.get('projects', s.doc.id);
		for (const id of ['offline-joint-lost', 'offline-joint-pending']) {
			const row = await db.get('jobs', id);
			row.state = 'done';
			row.response = { keypoints: rec.manifest.rig.rest.west.keypoints };
			delete row.error;
			await db.put('jobs', id, row);
		}
		rec.manifest.rig.pivot.x++; // Invalidate old consent without changing standing pixels or the cached requests.
		await db.put('projects', rec.id, rec);
		s.store.project = { ...s.store.project, manifest: rec.manifest };
		await q.queue.load();
		s.ui.sheet = 'move';
		return replace.moveRigVersion(rec);
	});
	const reuse = sheet.getByRole('button', { name: 'Reuse cached frames', exact: true });
	await expect(reuse).toBeVisible();
	await expect(sheet.getByRole('button', { name: 'Retry joint checks', exact: true })).toHaveCount(
		0
	);
	await expect(sheet).toContainText(
		'Reuse the completed body frames and joint results. No new body or joint requests are made.'
	);
	await expect(sheet).not.toContainText('Unknown checks may already have charged');
	await expect(sheet).not.toContainText('Retry 0');
	await reuse.click();
	await expect
		.poll(() =>
			page.evaluate(async () => {
				const p = '/src/studio/state.svelte.ts',
					s = await import(p);
				return s.moving.spec?.measurementRecovery?.recordIds.length;
			})
		)
		.toBe(0);
	await expect(sheet).toContainText('Offline consent storage blocked');
	const reused = await page.evaluate(async () => {
		const p = '/src/studio/state.svelte.ts',
			s = await import(p);
		return s.moving.spec;
	});
	expect(reused).toMatchObject(original.spec);
	expect(reused.measurementRecovery).toMatchObject({
		recordIds: [],
		checkHashes: [],
		rigVersion: currentRig
	});
	expect(reused.measurementRecovery.id).toMatch(/^[a-f0-9-]{36}$/);
	expect(reused.measurementRecovery.id).not.toBe(pending.spec.measurementRecovery.id);
	expect(reused.measurementRecovery.rigVersion).not.toBe(
		pending.spec.measurementRecovery.rigVersion
	);
	expect(
		await page.evaluate(
			() => (window as unknown as { recoveryBlobAudit: { reads: number } }).recoveryBlobAudit.reads
		)
	).toBe(0);
	expect(posts).toEqual([]);
	expect(errors).toEqual([]);
});

test('bounded body color correction discloses changed checks and equipment cost before durable consent', async ({
	page,
	context
}, info) => {
	const posts: string[] = [];
	await context.route('https://api.pixellab.ai/**', async (r) => {
		if (r.request().method() === 'GET' && new URL(r.request().url()).pathname.endsWith('/balance'))
			await r.fulfill({
				json: {
					subscription: { type: 'generations', status: 'active', generations: 42, total: 100 },
					credits: { usd: 1 }
				}
			});
		else {
			posts.push(r.request().method());
			await r.abort();
		}
	});
	const errors: string[] = [];
	page.on('pageerror', (e) => errors.push(e.message));
	await page.addInitScript(() => {
		localStorage.setItem('pixeldoll.agentKey', 'off');
		localStorage.setItem('pixeldoll.welcomed', '1');
	});
	await openStudio(
		page,
		info.config.projects.find((p) => p.name === 'browser-selftests')!.use.baseURL!
	);
	const fixture = await targetedRepairFixture(page);
	const original = await page.evaluate(async (itemId) => {
		const sPath = '/src/studio/state.svelte.ts',
			s = await import(sPath),
			dbPath = '/src/lib/store/db.ts',
			db = await import(dbPath);
		const pPath = '/src/lib/store/project.ts',
			projectModule = await import(pPath),
			posePath = '/src/lib/rig/poses.ts',
			poses = await import(posePath);
		const clipPath = '/src/lib/rig/clips.ts',
			clips = await import(clipPath),
			cPath = '/src/studio/create.ts',
			create = await import(cPath);
		const qPath = '/src/lib/pixellab/queue.ts',
			q = await import(qPath),
			rPath = '/src/lib/pixellab/routes.ts',
			routes = await import(rPath);
		const pngPath = '/src/lib/image/png.ts',
			png = await import(pngPath),
			rawPath = '/src/lib/image/pngraw.ts',
			rawPng = await import(rawPath);
		const restImage = png.makeImg(64, 64);
		for (let y = 12; y < 60; y++)
			for (let x = 25; x < 39; x++) restImage.data.set([0, 0, 0, 255], (y * 64 + x) * 4);
		for (let i = 0; i < 8; i++)
			restImage.data.set([32 * i, 32 * i, 32 * i, 255], (13 * 64 + 25 + i) * 4);
		const rec = await db.get('projects', s.doc.id);
		rec.manifest.rig.rest.west.image =
			'sha256:' + (await db.putBlob(await rawPng.encodePngBytes(restImage)));
		await db.put('projects', s.doc.id, rec);
		const { project } = await projectModule.loadProject(s.doc.id),
			rig = rec.manifest.rig,
			rest = rig.rest.west,
			image = project.images.get(rest.image);
		const spec = {
			id: 'slash',
			action: 'slash',
			frames: 8,
			items: [itemId],
			seed: 421,
			replace: true,
			dirs: ['west'],
			poseStyle: 'visible-side-v1'
		};
		const keypoints = poses
			.authoredPoses(
				spec.action,
				poses.fromApi(rest.keypoints, rig.cell),
				'west',
				rig.cell.w,
				spec.poseStyle
			)
			.map((p: unknown) => poses.toApi(p, rig.cell));
		const req = clips.rawClip({
			first: await create.b64(image),
			rest: rest.keypoints,
			keypoints,
			description: rec.character.looks,
			action: 'slash, empty hands, no weapon, no props, no effects',
			dir: 'west',
			seed: spec.seed + 101,
			view: rig.view
		});
		const results = [];
		for (let i = 0; i < keypoints.length; i++) {
			const frame = { ...image, data: new Uint8ClampedArray(image.data) };
			frame.data.set([32 * i, 32 * i, 32 * i, 255], (14 * 64 + 25) * 4);
			for (let n = 0; n < 27; n++)
				frame.data.set([13, 5, 2, 255], ((20 + Math.floor(n / 14)) * 64 + 25 + (n % 14)) * 4);
			results.push({ label: String(i), sha: await db.putBlob(await rawPng.encodePngBytes(frame)) });
			const estimate = routes.routes.estimateSkeleton(routes.png(await create.b64(frame)));
			const row = {
				id: 'palette-original-check-' + i,
				tag: 'studio-rig',
				method: estimate.method,
				endpoint: estimate.path,
				...(await q.requestIdentity(estimate)),
				state: 'done',
				attempts: 1,
				nextAt: 0,
				createdAt: Date.now(),
				jobs: [],
				response: { keypoints: keypoints[i] },
				gens: 0.1,
				usd: 0
			};
			await db.put('jobs', row.id, row);
		}
		await db.put('jobs', 'palette-cached-body', {
			id: 'palette-cached-body',
			tag: 'studio-rig',
			method: req.method,
			endpoint: req.path,
			...(await q.requestIdentity(req)),
			state: 'done',
			attempts: 1,
			nextAt: 0,
			createdAt: Date.now(),
			jobs: [{ id: 'palette-offline-results', status: 'done', done: true, results }],
			gens: 3,
			usd: 0
		});
		await db.put('projects', 'studio-move', {
			id: 'studio-move',
			projectId: s.doc.id,
			spec,
			status: 'failed',
			error: 'Palette fit failed; existing body kept'
		});
		return { spec, projectId: s.doc.id };
	}, fixture.itemId);
	await reloadStudio(page);
	await expect(page.locator('.world-actors').first()).toBeVisible();
	await expect
		.poll(async () =>
			page.evaluate(async () => {
				const p = '/src/studio/state.svelte.ts',
					s = await import(p);
				return s.moving.error;
			})
		)
		.toBe('Palette fit failed; existing body kept');
	await page.evaluate(async () => {
		const p = '/src/studio/state.svelte.ts',
			s = await import(p);
		s.ui.sheet = 'move';
	});
	const sheet = page.getByRole('dialog', { name: 'Replace move views', exact: true });
	await expect(sheet).toContainText('Palette fit failed; existing body kept');
	const action = sheet.getByRole('button', { name: 'Match body colors', exact: true });
	await expect(action).toBeVisible();
	await expect(sheet).toContainText('Match 216 nearby color pixels');
	await expect(sheet).toContainText('8 cached West frames');
	await expect(sheet).toContainText('estimated 0.8 gens or $0.041');
	await expect(sheet).toContainText('estimated 3 additional gens');
	await expect(sheet).toContainText('Existing body views are kept if a check still fails');
	await action.click();
	const connect = page.getByRole('dialog', { name: 'Connect PixelLab' });
	await connect.getByRole('button', { name: 'Cancel', exact: true }).click();
	await page.evaluate(async () => {
		const p = '/src/studio/state.svelte.ts',
			s = await import(p);
		s.ui.sheet = 'move';
	});
	await expect(action).toBeVisible();
	await page.evaluate(() => {
		const put = IDBObjectStore.prototype.put;
		IDBObjectStore.prototype.put = function (value, key) {
			if (key === 'studio-move' && value.status === 'running')
				throw new Error('Color consent storage blocked');
			return put.call(this, value, key);
		};
	});
	await action.click();
	await connect.getByLabel('API key', { exact: true }).fill('synthetic-body-color-key');
	await connect.getByRole('button', { name: 'Connect', exact: true }).click();
	await expect(sheet).toContainText('Color consent storage blocked');
	const consent = await page.evaluate(async () => {
		const p = '/src/studio/state.svelte.ts',
			s = await import(p);
		return s.moving.spec;
	});
	expect(consent).toMatchObject(original.spec);
	expect(consent.bodyPaletteRepair).toMatchObject({ version: 'near-rest-v1' });
	expect(consent.bodyPaletteRepair.checkHashes).toHaveLength(8);
	expect(new Set(consent.bodyPaletteRepair.checkHashes).size).toBe(8);
	expect(
		consent.bodyPaletteRepair.checkHashes.every((hash: string) => /^[a-f0-9]{64}$/.test(hash))
	).toBe(true);
	expect(consent.bodyPaletteRepair.id).toMatch(/^[a-f0-9-]{36}$/);
	expect(consent.measurementRecovery).toBeUndefined();
	await sheet.getByRole('button', { name: /^Try again · Est\. [1-9]\d* gens$/ }).click();
	await expect
		.poll(() =>
			page.evaluate(async () => {
				const p = '/src/studio/state.svelte.ts',
					s = await import(p);
				return s.moving.spec?.seed;
			})
		)
		.not.toBe(original.spec.seed);
	const fresh = await page.evaluate(async () => {
		const p = '/src/studio/state.svelte.ts',
			s = await import(p);
		return s.moving.spec;
	});
	expect(fresh.seed).not.toBe(original.spec.seed);
	expect(fresh.bodyPaletteRepair).toBeUndefined();
	expect(fresh.measurementRecovery).toBeUndefined();
	expect(posts).toEqual([]);
	expect(errors).toEqual([]);
});

test('standing-first items quote only standing and offer actual custom moves one at a time', async ({
	page,
	context
}, info) => {
	const posts: string[] = [];
	await context.route('https://api.pixellab.ai/**', async (r) => {
		if (r.request().method() === 'GET' && new URL(r.request().url()).pathname.endsWith('/balance'))
			await r.fulfill({
				json: {
					subscription: {
						type: 'generations',
						status: 'active',
						plan: 'Tier 3',
						generations: 1000,
						total: 1000
					},
					credits: { usd: 0 }
				}
			});
		else {
			posts.push(r.request().method());
			await r.abort();
		}
	});
	await page.addInitScript(() => {
		localStorage.setItem('pixeldoll.agentKey', 'off');
		localStorage.setItem('pixeldoll.welcomed', '1');
	});
	await openStudio(
		page,
		info.config.projects.find((p) => p.name === 'browser-selftests')!.use.baseURL!
	);
	const fixture = await targetedRepairFixture(page);
	await page.evaluate(async (id) => {
		const statePath = '/src/studio/state.svelte.ts',
			dbPath = '/src/lib/store/db.ts',
			s = await import(statePath),
			db = await import(dbPath);
		const rec = await db.get('projects', s.doc.id),
			m = rec.manifest,
			item = m.items.find((i: { id: string }) => i.id === id);
		for (const a of m.rig.animations)
			if (a.id !== 'default') {
				const before = a.id,
					after = 'custom_' + before.replaceAll('-', '_');
				a.id = after;
				for (const it of m.items)
					for (const layer of it.layers)
						if (layer.cells?.[before]) {
							layer.cells[after] = layer.cells[before];
							delete layer.cells[before];
						}
			}
		for (const layer of item.layers) {
			layer.cells = { default: layer.cells.default };
			if (layer.cells.default) delete layer.cells.default.north;
		}
		item.standing = 'default';
		await db.put('projects', s.doc.id, rec);
		await s.openProject(s.doc.id);
		s.pick(id);
	}, fixture.itemId);
	await newItem(page, 'Main hand');
	const newSheet = page.getByRole('dialog', { name: 'New item', exact: true });
	await newSheet.getByRole('textbox', { name: 'What is it?', exact: true }).fill('a steel sword');
	await expect(newSheet).toContainText('Make the standing design first');
	await newSheet.getByRole('button', { name: 'Inspect API calls', exact: true }).click();
	const peek = page.getByRole('dialog', { name: 'API calls', exact: true });
	await expect(peek.getByText('Dress standing views', { exact: false })).toBeVisible();
	await expect(peek.getByText('Pose equipment', { exact: false })).toHaveCount(0);
	await peek.getByRole('button', { name: 'Close API calls', exact: true }).click();
	await newSheet.getByRole('button', { name: 'Cancel', exact: true }).click();
	const coverage = page.getByRole('button', { name: /equipped items? needs? frames/ });
	await page
		.getByRole('toolbar', { name: 'Preview controls' })
		.getByRole('combobox', { name: 'Move' })
		.selectOption('default');
	await page.getByRole('button', { name: 'Face north', exact: true }).click();
	await expect(coverage).toBeVisible();
	await page.getByRole('button', { name: 'Top-down', exact: true }).click();
	await expect(page.locator('.world-coverage')).toContainText('hidden for this view');
	await page.getByRole('button', { name: 'Preview', exact: true }).click();
	await expect(coverage).toBeVisible();
	await page.setViewportSize({ width: 844, height: 390 });
	await page
		.getByRole('toolbar', { name: 'Preview controls' })
		.getByRole('combobox', { name: 'Move' })
		.selectOption('custom_walk');
	await expect(coverage).toBeInViewport();
	await coverage.click();
	const gaps = page.locator('#preview-coverage');
	await expect(gaps).toContainText('Missing frames for Custom walk');
	const missingItem = gaps.getByRole('button', { name: fixture.itemName, exact: true });
	await expect(missingItem).toBeInViewport();
	await missingItem.click();
	await page.setViewportSize({ width: 1440, height: 900 });
	const pane = page.getByRole('dialog', { name: 'Item', exact: true });
	const moves = pane.getByRole('combobox', { name: 'Generate item for move', exact: true });
	await expect(moves.locator('option')).toHaveText(['Custom walk', 'Custom cross punch']);
	await moves.selectOption('custom_walk');
	await expect(pane.getByRole('button', { name: /^Make for Custom walk/ })).toContainText(
		'Est. 12 gens'
	);
	await pane.getByRole('button', { name: /^Make for Custom walk/ }).click();
	const connect = page.getByRole('dialog', { name: 'Connect PixelLab', exact: true });
	await connect.getByLabel('API key', { exact: true }).fill('synthetic-progressive-key');
	await page.evaluate(() => {
		const put = IDBObjectStore.prototype.put;
		IDBObjectStore.prototype.put = function (value, key) {
			if (key === 'studio-move' && value.status === 'running')
				throw new Error('Progressive scope captured before spending');
			return put.call(this, value, key);
		};
	});
	await connect.getByRole('button', { name: 'Connect', exact: true }).click();
	await expect(page.getByRole('dialog', { name: 'Add a move', exact: true })).toContainText(
		'Progressive scope captured before spending'
	);
	const scope = await page.evaluate(async () => {
		const path = '/src/studio/state.svelte.ts';
		return (await import(path)).moving.spec;
	});
	expect(scope).toMatchObject({ id: 'custom_walk', items: [fixture.itemId], itemsOnly: true });
	expect(scope.dirs).toEqual(['south', 'east', 'north', 'west']);
	expect(posts).toEqual([]);
});

test('new body moves leave equipment unchecked and preserve an explicit selection through canceled Connect', async ({
	page,
	context
}, info) => {
	await page.addInitScript(() => {
		localStorage.setItem('pixeldoll.agentKey', 'off');
		localStorage.setItem('pixeldoll.welcomed', '1');
	});
	await openStudio(
		page,
		info.config.projects.find((p) => p.name === 'browser-selftests')!.use.baseURL!
	);
	const fixture = await targetedRepairFixture(page);
	await page.evaluate(async () => {
		const path = '/src/studio/state.svelte.ts';
		(await import(path)).ui.sheet = 'move';
	});
	const sheet = page.getByRole('dialog', { name: 'Add a move', exact: true });
	await expect(
		sheet.getByRole('checkbox', { name: new RegExp(fixture.itemName) })
	).not.toBeChecked();
	await expect(sheet.getByRole('checkbox', { checked: true })).toHaveCount(0);
	await sheet.getByRole('checkbox', { name: new RegExp(fixture.itemName) }).check();
	await sheet.getByRole('button', { name: /^Add Idle/ }).click();
	await page
		.getByRole('dialog', { name: 'Connect PixelLab', exact: true })
		.getByRole('button', { name: 'Cancel', exact: true })
		.click();
	await page.evaluate(async () => {
		const path = '/src/studio/state.svelte.ts';
		(await import(path)).ui.sheet = 'move';
	});
	await expect(sheet.getByRole('checkbox', { name: new RegExp(fixture.itemName) })).toBeChecked();
});

test('draft retry prices a fresh item plan rather than historical grid fallbacks and stops when pricing is unavailable', async ({
	page,
	context
}, info) => {
	const requests: string[] = [];
	await context.route('https://api.pixellab.ai/**', (r) => {
		requests.push(r.request().method());
		return r.abort();
	});
	await page.addInitScript(() => {
		localStorage.setItem('pixeldoll.agentKey', 'off');
		localStorage.setItem('pixeldoll.welcomed', '1');
	});
	await openStudio(
		page,
		info.config.projects.find((p) => p.name === 'browser-selftests')!.use.baseURL!
	);
	await targetedRepairFixture(page);
	const expected = await page.evaluate(async () => {
		const p = '/src/studio/state.svelte.ts',
			s = await import(p),
			routePath = '/src/studio/itemRoute.ts',
			route = await import(routePath);
		const projectPath = '/src/lib/store/project.ts',
			projectModule = await import(projectPath);
		await s.loadGens();
		const ctx = await projectModule.loadProject(s.doc.id),
			input = { name: 'Fresh retry price', slot: 'main_hand', prompt: 'a steel sword' };
		const draft = route.itemRoute.draft(ctx, input, []);
		draft.calls = [
			{
				kind: 'grid',
				cells: Array.from({ length: 8 }, (_, i) => 'walk/west/' + i),
				seed: 1,
				old: [],
				rerolls: 2
			}
		];
		s.gens.push({
			draft,
			input,
			phase: 'failed',
			status: 'Stopped',
			error: 'Synthetic completed fallback failed review'
		});
		s.ui.selected = 'gen:' + draft.spec.id;
		return route.itemRoute.plan(ctx.rec.manifest.rig, ctx, input).gens;
	});
	await equipmentGroup(page, 'Main hand');
	await reviewSelectedDraft(page);
	const panel = page.locator('.gen'),
		retry = panel.getByRole('button', { name: /^Try again/ });
	expect(expected).toBe(10); // only four padded standing references; walking frames are a separate purchase now
	await expect(retry).toBeEnabled();
	await expect(page.getByRole('dialog', { name: 'Item review', exact: true })).toBeVisible();
	await expect(page.locator('.equipment-scroll .gen')).toHaveCount(0);
	await page
		.getByRole('dialog', { name: 'Item review', exact: true })
		.getByRole('button', { name: 'Done', exact: true })
		.click();
	await equipmentGroup(page, 'Off hand');
	await expect(section(page, 'Off hand').locator('.gen')).toHaveCount(0);
	await equipmentGroup(page, 'Main hand');
	await reviewSelectedDraft(page);
	await expect(page.locator('.gen')).toHaveCount(1);
	await expect(retry).toBeEnabled();
	await expect(retry).toHaveText(`Try again Est. ${expected} gens`);
	await panel
		.locator('.actions .api-action')
		.getByRole('button', { name: 'Inspect API calls', exact: true })
		.click();
	const retryPeek = page.getByRole('dialog', { name: 'API calls', exact: true });
	await expect(retryPeek.getByText('Dress standing views', { exact: false })).toBeVisible();
	await expect(retryPeek.getByText('Dress frozen frames', { exact: false })).toHaveCount(0);
	await retryPeek.getByRole('button', { name: 'Close API calls', exact: true }).click();
	await page.evaluate(async () => {
		const p = '/src/studio/state.svelte.ts',
			s = await import(p);
		const g = s.gens.find(
			(g: { draft: { spec: { id: string } } }) => 'gen:' + g.draft.spec.id === s.ui.selected
		);
		g.draft.calls.push({
			kind: 'grid',
			cells: Array.from({ length: 15 }, (_, i) => 'walk/east/' + i),
			seed: 2,
			old: [],
			rerolls: 2
		});
	});
	await expect(retry).toHaveText(`Try again Est. ${expected} gens`);
	await page.evaluate(async () => {
		const p = '/src/studio/state.svelte.ts',
			s = await import(p);
		s.gens.find(
			(g: { draft: { spec: { id: string } } }) => 'gen:' + g.draft.spec.id === s.ui.selected
		).draft.rigId = 'rig-unavailable-retry-price';
	});
	await expect(panel).toContainText(
		'Could not estimate this retry. Reopen the character and try again.'
	);
	await expect(retry).toBeDisabled();
	expect(requests).toEqual([]);
});

async function freePaletteFixture(page: Page) {
	const fixture = await targetedRepairFixture(page);
	await oversizedItemFixture(page, fixture.itemId);
	const before = await page.evaluate(
		async ({ id }) => {
			const p = '/src/studio/state.svelte.ts',
				s = await import(p),
				dbPath = '/src/lib/store/db.ts',
				db = await import(dbPath);
			const pngPath = '/src/lib/image/png.ts',
				png = await import(pngPath),
				rawPath = '/src/lib/image/pngraw.ts',
				raw = await import(rawPath);
			const rec = await db.get('projects', s.doc.id),
				item = rec.manifest.items.find((it: { id: string }) => it.id === id),
				metalId = id + '-fixed-metal';
			const materials = [
				{
					id: metalId,
					owner: id,
					label: 'Metal',
					ramp: ['#808080', '#c0c0c0'],
					variants: { azure: ['#2255aa', '#77aaff'] }
				},
				{ id: id + '-fixed-outline', owner: id, label: 'Outline', ramp: ['#101010'], variants: {} }
			];
			rec.manifest.materials = [
				...rec.manifest.materials.filter((m: { owner: string }) => m.owner !== id),
				...materials
			];
			item.materials = materials.map((m) => m.id);
			item.status = 'accepted';
			item.baseHash = rec.manifest.rig.baseHash;
			item.designWarnings = ['D1 keyframe rest/west/0: gray smudges'];
			if (item.qa) item.qa.status = 'warn';
			const image = png.makeImg(96, 96);
			for (const [offset, rgb] of [
				[0, [133, 133, 133]],
				[1, [240, 240, 240]],
				[2, [192, 128, 96]],
				[3, [16, 16, 16]]
			] as [number, number[]][])
				image.data.set([...rgb, 255], (40 * 96 + 40 + offset) * 4);
			const hash = 'sha256:' + (await db.putBlob(await raw.encodePngBytes(image)));
			for (const layer of item.layers)
				layer.cells.walk.west = Array.from({ length: 8 }, () => null);
			item.layers[0].cells.walk.west[0] = hash;
			item.layers[0].cells.walk.west[1] = hash;
			await db.put('projects', s.doc.id, rec);
			await s.openProject(s.doc.id);
			s.ui.anim = 'walk';
			s.ui.dir = 'west';
			s.ui.frame = 0;
			s.ui.playing = false;
			s.pick(id);
			s.setVariant(metalId, 'azure');
			await s.flushSave();
			const saved = await db.get('projects', s.doc.id),
				savedItem = saved.manifest.items.find((it: { id: string }) => it.id === id);
			const unscoped = structuredClone(savedItem.layers);
			for (const layer of unscoped) delete layer.cells.walk.west;
			return {
				projectId: s.doc.id,
				metalId,
				materials: saved.manifest.materials,
				presets: saved.manifest.presets,
				variants: s.doc.variants,
				qa: savedItem.qa,
				warnings: savedItem.designWarnings,
				provenance: savedItem.provenance,
				rig: saved.manifest.rig,
				unscoped,
				sourceHash: hash
			};
		},
		{ id: fixture.itemId }
	);
	const diagnosis = await page.evaluate(async (id) => {
		const p = '/src/studio/state.svelte.ts',
			s = await import(p),
			r = '/src/lib/items/run.ts',
			run = await import(r);
		try {
			return await run.itemPaletteRepairPlan(s.doc.id, id, 'walk', 'west');
		} catch (e) {
			return String(e);
		}
	}, fixture.itemId);
	expect(diagnosis).toMatchObject({ changedPixels: 2, changedFrames: [0, 1], unmatchedPixels: 2 });
	return { ...fixture, ...before };
}

for (const changed of ['item', 'rig'] as const)
	test(`free item color matching refuses a stale ${changed} review without changing any pixels`, async ({
		page,
		context
	}, info) => {
		const requests: string[] = [];
		await context.route('https://api.pixellab.ai/**', (r) => {
			requests.push(r.request().method());
			return r.abort();
		});
		await page.addInitScript(() => {
			localStorage.setItem('pixeldoll.agentKey', 'off');
			localStorage.setItem('pixeldoll.welcomed', '1');
		});
		await openStudio(
			page,
			info.config.projects.find((p) => p.name === 'browser-selftests')!.use.baseURL!
		);
		const fixture = await freePaletteFixture(page),
			pane = await selectedItemDetails(page);
		const action = pane.getByRole('button', { name: /^Match item colors.*Free$/ });
		await expect(action).toBeVisible();
		await page.evaluate(
			async ({ id, changed }) => {
				const p = '/src/studio/state.svelte.ts',
					s = await import(p),
					dbPath = '/src/lib/store/db.ts',
					db = await import(dbPath),
					rec = await db.get('projects', s.doc.id);
				if (changed === 'item')
					rec.manifest.items.find((it: { id: string }) => it.id === id).prompt +=
						', changed after preview';
				else rec.manifest.rig.view = rec.manifest.rig.view === 'side' ? 'low top-down' : 'side';
				await db.put('projects', s.doc.id, rec);
			},
			{ id: fixture.itemId, changed }
		);
		await action.click();
		await expect(pane).toContainText(
			'This item or its colors changed. Review the color match again.'
		);
		const saved = await page.evaluate(async (id) => {
			const p = '/src/studio/state.svelte.ts',
				s = await import(p),
				dbPath = '/src/lib/store/db.ts',
				db = await import(dbPath),
				rec = await db.get('projects', s.doc.id),
				it = rec.manifest.items.find((i: { id: string }) => i.id === id);
			return { hash: it.layers[0].cells.walk.west[0], audit: it.paletteRepairs };
		}, fixture.itemId);
		expect(saved.hash).toBe(fixture.sourceHash);
		expect(saved.audit).toBeUndefined();
		expect(requests).toEqual([]);
	});

// ---- Per-tile item menu (docs/design/2026-11-11-ui-refinement/ui-lab-7.html) and Wardrobe placement ----

async function editableCopy(page: Page) {
	await page.addInitScript(() => {
		localStorage.setItem('pixeldoll.agentKey', 'off');
		localStorage.setItem('pixeldoll.welcomed', '1');
	});
	await openStudio(page, '/#/');
	await newItem(page, 'Head');
	await page.getByRole('button', { name: 'Copy the demo body', exact: true }).click();
	await page.getByRole('textbox', { name: 'What is it?', exact: true }).waitFor();
	await page.getByRole('button', { name: 'Cancel', exact: true }).click();
	await expect(page.getByRole('dialog')).toHaveCount(0);
}
const itemMenu = (page: Page) => page.locator('#item-menu');

test('item long-press opens without wearing, cancels on movement, and downloads an editable item ZIP', async ({
	page
}) => {
	await editableCopy(page);
	await equipmentGroup(page, 'Head');
	const tile = section(page, 'Head').getByRole('button', { name: /^Wizard hat(,|$)/ });
	const worn = await tile.getAttribute('aria-pressed');
	await tile.click({ button: 'right' });
	await expect(itemMenu(page)).toBeVisible();
	await page.keyboard.press('Escape');
	await expect(itemMenu(page)).toBeHidden();
	const pointer = {
		pointerId: 71,
		pointerType: 'touch',
		isPrimary: true,
		button: 0,
		clientX: 80,
		clientY: 90
	};
	const touch = await page.context().newCDPSession(page);
	for (const target of [
		tile,
		section(page, 'Head').getByRole('button', { name: 'More options for Wizard hat', exact: true })
	]) {
		const box = (await target.boundingBox())!;
		await touch.send('Input.dispatchTouchEvent', {
			type: 'touchStart',
			touchPoints: [{ x: box.x + box.width / 2, y: box.y + box.height / 2 }]
		});
		await expect(itemMenu(page)).toBeVisible();
		await touch.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
		await expect(itemMenu(page)).toBeVisible();
		await expect(tile).toHaveAttribute('aria-pressed', worn!);
		await page.keyboard.press('Escape');
		await expect(itemMenu(page)).toBeHidden();
	}
	await tile.dispatchEvent('pointerdown', pointer);
	await tile.dispatchEvent('pointermove', { ...pointer, clientY: 120 });
	await tile.dispatchEvent('pointerup', pointer);
	await expect(itemMenu(page)).toBeHidden();
	await tile.click();
	await expect(tile).not.toHaveAttribute('aria-pressed', worn!);
	await tile.click({ button: 'right' });
	const downloaded = page.waitForEvent('download');
	await itemMenu(page).getByRole('menuitem', { name: 'Download ZIP', exact: true }).click();
	const download = await downloaded;
	expect(download.suggestedFilename()).toMatch(/wizard-hat\.pixeldoll\.zip$/);
	const bytes = readFileSync((await download.path())!);
	const { readCharacterZip } = await import('../../src/lib/store/import.ts');
	const imported = await readCharacterZip(new Uint8Array(bytes));
	expect(
		imported.project.manifest.items.filter((item) => !item.variantOf).map((item) => item.name)
	).toContain('Wizard hat');
	expect(imported.project.manifest.items.filter((item) => !item.variantOf)).toHaveLength(2);
});
const menuOpen = (page: Page) => itemMenu(page).evaluate((m) => m.matches(':popover-open'));
/** The open menu is an arrowed popover fully inside the viewport. */
async function expectAnchoredMenu(page: Page) {
	const menu = itemMenu(page);
	await expect.poll(() => menuOpen(page)).toBe(true);
	await expect(menu.locator('.bu-popover-arrow')).toBeVisible();
	const viewport = page.viewportSize()!;
	const box = (await menu.locator('.bu-popover-surface').boundingBox())!;
	expect(box.x).toBeGreaterThanOrEqual(0);
	expect(box.y).toBeGreaterThanOrEqual(0);
	expect(box.x + box.width).toBeLessThanOrEqual(viewport.width);
	expect(box.y + box.height).toBeLessThanOrEqual(viewport.height);
}

test('item tiles open their own menu by ⋮, right-click and Shift+F10, and Escape returns to the ⋮', async ({
	page
}) => {
	await editableCopy(page);
	await equipmentGroup(page, 'Head');
	const head = section(page, 'Head');
	const hat = head.getByRole('button', { name: /^Wizard hat(,|$)/ });
	const more = head.getByRole('button', { name: 'More options for Wizard hat', exact: true });
	// A sibling control, never nested in the tile, at its top-left edge: a full-height target that reaches only 32 px
	// into the tile (WCAG 2.5.8 asks for 24), so a press meant for the tile rarely opens the menu.
	expect(await more.evaluate((b) => !!b.closest('.item-tile'))).toBe(false);
	await expect(more).toHaveAttribute('aria-haspopup', 'menu');
	await expect(more).toHaveAttribute('aria-expanded', 'false');
	const hit = (await more.boundingBox())!;
	const tile = (await hat.boundingBox())!;
	expect(hit.height).toBeGreaterThanOrEqual(44);
	expect(hit.width).toBe(32);
	expect(hit.x).toBeCloseTo(tile.x, 0);
	// The worn check and status sit in the opposite, top-right corner, 6 px inside the 1 px border.
	const status = (await hat.locator('.tile-status, .bu-tile-check').first().boundingBox())!;
	expect(status.x + status.width).toBeCloseTo(tile.x + tile.width - 7, 0);
	expect(status.x).toBeGreaterThan(hit.x + hit.width);
	expect(hit.y).toBeCloseTo(tile.y, 0);
	// The category's Random and + actions are full 44 px targets too.
	for (const name of ['Random head item', 'New head item']) {
		const box = (await head.getByRole('button', { name, exact: true }).boundingBox())!;
		expect(Math.min(box.width, box.height), name).toBeGreaterThanOrEqual(44);
	}
	// Empty and New tiles have no menu.
	await expect(head.getByRole('button', { name: /^More options for Empty/ })).toHaveCount(0);

	await more.click();
	await expectAnchoredMenu(page);
	await expect(more).toHaveAttribute('aria-expanded', 'true');
	const items = itemMenu(page).getByRole('menuitem');
	await expect(items.first()).toHaveAccessibleName('Details…');
	await expect(items.first()).toBeFocused();
	await expect(items.last()).toHaveAccessibleName('Delete item…');
	await expect(itemMenu(page).getByRole('menuitem', { name: /Wear|Take off/ })).toHaveCount(0);
	await page.keyboard.press('ArrowDown');
	await expect(items.nth(1)).toBeFocused();
	await page.keyboard.press('Escape');
	await expect.poll(() => menuOpen(page)).toBe(false);
	await expect(more).toBeFocused();
	await expect(more).toHaveAttribute('aria-expanded', 'false');

	// The same ⋮ toggles it closed again.
	await more.click();
	await expect.poll(() => menuOpen(page)).toBe(true);
	await more.click();
	await expect.poll(() => menuOpen(page)).toBe(false);
	await expect(more).toHaveAttribute('aria-expanded', 'false');
	// Tab and Shift+Tab out of the menu close it, like any menu; focus moves on rather than to the page.
	await more.click();
	await expect(items.first()).toBeFocused();
	await items.last().focus();
	await page.keyboard.press('Tab');
	await expect.poll(() => menuOpen(page)).toBe(false);
	expect(await page.evaluate(() => document.activeElement !== document.body)).toBe(true);
	await more.click();
	await expect(items.first()).toBeFocused();
	await page.keyboard.press('Shift+Tab');
	// Shift+Tab from the first command reaches the header's Wear toggle, still inside the menu.
	await expect(
		itemMenu(page).getByRole('button', { name: 'Wear Wizard hat', exact: true })
	).toBeFocused();
	await page.keyboard.press('Shift+Tab');
	await expect.poll(() => menuOpen(page)).toBe(false);

	// A press on a tile while the menu is open only dismisses the menu: it never also wears or takes off that tile.
	const helmet = head.getByRole('button', { name: /^Steel helmet(,|$)/ });
	const helmetWorn = (await helmet.getAttribute('aria-pressed'))!;
	await more.click();
	await expect.poll(() => menuOpen(page)).toBe(true);
	await helmet.click();
	await expect.poll(() => menuOpen(page)).toBe(false);
	await expect(helmet).toHaveAttribute('aria-pressed', helmetWorn);
	// The next press acts as usual (pressed twice, so the outfit is unchanged).
	await helmet.click();
	await expect(helmet).not.toHaveAttribute('aria-pressed', helmetWorn);
	await helmet.click();
	await expect(helmet).toHaveAttribute('aria-pressed', helmetWorn);

	// The hat lacks north Walk and Cross punch frames (and more in this copy): a warning on its tile, in its name
	// and in its menu.
	await expect(hat).toHaveAccessibleName(/^Wizard hat, missing frames in \d+ moves$/);
	await expect(hat.locator('.tile-status[data-tone="warning"]')).toBeVisible();
	await hat.click({ button: 'right' });
	await expectAnchoredMenu(page);
	await expect(itemMenu(page)).toContainText('Wizard hat');
	await expect(itemMenu(page).locator('.item-menu-title small')).toContainText(
		/Missing frames in \d+ moves/
	);
	await page.keyboard.press('Escape');
	await expect(more).toBeFocused();

	await hat.focus();
	await page.keyboard.press('Shift+F10');
	await expectAnchoredMenu(page);
	await expect(items.first()).toBeFocused();

	// Wear is a toggle in the menu header, not a command: one fixed name, the state in aria-pressed, and a different
	// glyph and status line for each state.
	const toggle = itemMenu(page).getByRole('button', { name: 'Wear Wizard hat', exact: true });
	await expect(toggle).toHaveAttribute('aria-pressed', 'false');
	await expect(toggle).toHaveAttribute('title', 'Wear');
	const glyph = () => toggle.locator('svg').getAttribute('class');
	const offGlyph = await glyph();
	await expect(itemMenu(page).locator('.item-menu-title small')).not.toContainText('Wearing');
	await toggle.click();
	await expect(hat).toHaveAttribute('aria-pressed', 'true');
	await expect(toggle).toHaveAttribute('aria-pressed', 'true');
	await expect(toggle).toHaveAccessibleName('Wear Wizard hat');
	await expect.poll(glyph).not.toBe(offGlyph);
	await expect(itemMenu(page).locator('.item-menu-title small')).toContainText('Wearing');

	// Delete asks first, focusing the safe choice.
	await items.last().click();
	const deleteAlert = page.getByRole('alertdialog', { name: 'Delete Wizard hat?' });
	await expect(itemMenu(page)).not.toBeVisible();
	await expect(deleteAlert.getByRole('button', { name: 'Cancel', exact: true })).toBeFocused();
	// Focus then lands on the next tile in the category, else the previous one (Empty at least), never the paid
	// New item button.
	const neighbor = await hat.evaluate((tile) => {
		const tiles = [...tile.closest('.slot-tiles')!.querySelectorAll<HTMLElement>('.bu-tile')];
		const at = tiles.indexOf(tile as HTMLElement);
		return (tiles[at + 1] ?? tiles[at - 1]).getAttribute('aria-label')!;
	});
	await deleteAlert.getByRole('button', { name: 'Delete', exact: true }).click();
	await expect(hat).toHaveCount(0);
	await expect(head.getByRole('button', { name: neighbor, exact: true })).toBeFocused();

	// Details opens the item sheet; closing it returns focus to this tile's ⋮.
	const helmetMore = head.getByRole('button', {
		name: 'More options for Steel helmet',
		exact: true
	});
	await helmetMore.click();
	await itemMenu(page).getByRole('menuitem', { name: 'Details…', exact: true }).click();
	const details = page.getByRole('dialog', { name: 'Item', exact: true });
	await expect(details.locator('.insp-title')).toHaveText('Steel helmet');
	await details.getByRole('button', { name: 'Done', exact: true }).click();
	await expect(helmetMore).toBeFocused();

	// Scrolling the ⋮ out of view closes the menu; focus stays on that ⋮, without scrolling back or jumping to the header.
	await helmetMore.click();
	await expect.poll(() => menuOpen(page)).toBe(true);
	await page.locator('#wardrobe-list').evaluate((list) => (list.scrollTop += 2000));
	await expect.poll(() => menuOpen(page)).toBe(false);
	await expect(helmetMore).toBeFocused();
	await expect(helmetMore).not.toBeInViewport();

	// Phones get the same arrowed popover, kept on screen.
	await page.setViewportSize({ width: 390, height: 844 });
	await equipmentGroup(page, 'Head');
	await helmetMore.click();
	await expectAnchoredMenu(page);
	await page.keyboard.press('Escape');
	await expect(helmetMore).toBeFocused();
});

test('tile status shows on the tile and in its name, and Recolor opens the item’s colors', async ({
	page
}) => {
	await editableCopy(page);
	// The worn helmet hides the worn hair.
	await pickItem(page, 'Steel helmet');
	let details = await selectedItemDetails(page);
	await details
		.getByRole('group', { name: 'When worn, hide', exact: true })
		.getByRole('button', { name: 'Hair', exact: true })
		.click();
	await details.getByRole('button', { name: 'Done', exact: true }).click();
	await equipmentGroup(page, 'Hair');
	const hair = section(page, 'Hair').getByRole('button', {
		name: 'Messy brown hair, hidden by another item',
		exact: true
	});
	await expect(hair).toHaveAttribute('data-dim');
	// A worn tile shows only its check mark in the status corner; the hidden status stays in its name and dimmed art.
	await expect(hair.locator('.bu-tile-check')).toBeVisible();
	await expect(hair.locator('.tile-status')).toHaveCount(0);
	await section(page, 'Hair')
		.getByRole('button', { name: 'More options for Messy brown hair', exact: true })
		.click();
	await expect(itemMenu(page)).toContainText('Hidden by another item');
	await page.keyboard.press('Escape');
	// No Demo badge on tiles.
	await expect(page.locator('.equipment-scroll .item-tile .badge')).toHaveCount(0);

	await pickItem(page, 'Red cape');
	details = await selectedItemDetails(page);
	// The trimmed sheet links to the Colors tab instead of repeating it.
	await expect(details.locator('.colors')).toHaveCount(0);
	await details.getByRole('button', { name: 'Recolor', exact: true }).click();
	await expect(page.getByRole('dialog')).toHaveCount(0);
	await expect(
		page
			.getByRole('tablist', { name: 'Customization panels', exact: true })
			.getByRole('tab', { name: 'Colors', exact: true })
	).toHaveAttribute('aria-selected', 'true');
	const heading = page.locator('.color-sections').getByRole('heading', { name: 'Red cape' });
	await expect(heading).toBeInViewport();
	const list = (await page.locator('.color-sections').boundingBox())!;
	expect(Math.abs((await heading.boundingBox())!.y - list.y)).toBeLessThan(24);
});

for (const width of [1280, 390])
	test(`ordinary character loading starts Wardrobe at the top (${width}px)`, async ({
		page
	}, info) => {
		await page.emulateMedia({ reducedMotion: 'reduce' });
		await page.addInitScript(() => {
			localStorage.setItem('pixeldoll.agentKey', 'off');
			localStorage.setItem('pixeldoll.welcomed', '1');
		});
		await page.setViewportSize({ width, height: 844 });
		const url = info.config.projects.find((project) => project.name === 'browser-selftests')!.use
			.baseURL!;
		await page.goto(url);
		await expect(page.locator('.customize-action')).toBeEnabled({ timeout: 20_000 });
		await page.locator('.customize-action').click();
		const list = page.locator('#wardrobe-list');
		const atTop = async () => {
			await expect(list).toBeVisible();
			await expect.poll(() => list.evaluate((element) => element.scrollTop)).toBe(0);
			await expect(page.locator('[data-rail="Head"]')).toHaveAttribute('aria-current', 'true');
		};
		await atTop();
		await equipmentGroup(page, 'Back');
		await list.evaluate((element) => (element.scrollTop += 25));
		const offset = await list.evaluate((element) => element.scrollTop);
		expect(offset).toBeGreaterThan(0);
		await equipmentMode(page, 'Colors');
		await equipmentMode(page, 'Wardrobe');
		await expect.poll(() => list.evaluate((element) => element.scrollTop)).toBe(offset);
		await page.evaluate(async () => {
			const path = '/src/studio/state.svelte.ts',
				state = await import(path);
			await state.openProject(state.doc.id, { quiet: true });
		});
		await expect.poll(() => list.evaluate((element) => element.scrollTop)).toBe(offset);
		const copy = await page.evaluate(async () => {
			const path = '/src/studio/state.svelte.ts',
				state = await import(path);
			await state.copyDemo();
			return state.doc.id;
		});
		await atTop();
		await list.evaluate((element) => (element.scrollTop = 25));
		await page.evaluate(async () => {
			const path = '/src/studio/state.svelte.ts',
				state = await import(path);
			await state.openProject('fixture:s2');
		});
		await atTop();
		await equipmentGroup(page, 'Back');
		await equipmentMode(page, 'Colors');
		await page.evaluate(async (id) => {
			const path = '/src/studio/state.svelte.ts',
				state = await import(path);
			await state.openProject(id);
		}, copy);
		await equipmentMode(page, 'Wardrobe');
		await atTop();
		await list.evaluate((element) => (element.scrollTop = 25));
		await page.evaluate(async () => {
			const path = '/src/studio/state.svelte.ts',
				state = await import(path);
			await state.openProject(state.doc.id);
		});
		await atTop();
		await list.evaluate((element) => (element.scrollTop = 25));
		await equipmentMode(page, 'Colors');
		await page.evaluate(async () => {
			const path = '/src/studio/state.svelte.ts',
				state = await import(path);
			await state.openProject(state.doc.id);
		});
		await equipmentMode(page, 'Wardrobe');
		await atTop();
		await page.reload();
		await expect(page.locator('.customize-action')).toBeEnabled({ timeout: 20_000 });
		await page.locator('.customize-action').click();
		await atTop();
	});

test('explicit item opens reveal shared IDs and quiet refresh keeps the selected tile in place', async ({
	page
}, info) => {
	await page.emulateMedia({ reducedMotion: 'reduce' });
	await page.addInitScript(() => {
		localStorage.setItem('pixeldoll.agentKey', 'off');
		localStorage.setItem('pixeldoll.welcomed', '1');
	});
	await openStudio(
		page,
		info.config.projects.find((project) => project.name === 'browser-selftests')!.use.baseURL!
	);
	const ids = await page.evaluate(async () => {
		const statePath = '/src/studio/state.svelte.ts',
			state = await import(statePath);
		const projectPath = '/src/lib/store/project.ts',
			project = await import(projectPath);
		const dbPath = '/src/lib/store/db.ts',
			db = await import(dbPath);
		const first = await state.copyDemo();
		const context = await project.loadProject(first);
		const helmet = context.rec.manifest.items.find(
			(item: { id: string }) => item.id === 'helmet_steel'
		);
		context.rec.manifest.items.unshift(
			...Array.from({ length: 24 }, (_, index) => ({
				...structuredClone(helmet),
				id: `extra-helmet-${index}`,
				name: `Extra helmet ${index}`
			}))
		);
		await db.put('projects', first, context.rec);
		await state.openProject(first);
		const second = await state.copyDemo();
		await state.openProject(first, { wear: 'hat_wizard' });
		return { first, second };
	});
	const list = page.locator('#wardrobe-list');
	const visibleBelowHeader = async () => {
		await expect
			.poll(() =>
				list.evaluate((element) => {
					const tile = element.querySelector('[data-tile="hat_wizard"]')!.getBoundingClientRect();
					const header = element.querySelector('.bu-section-head')!.getBoundingClientRect();
					return tile.top >= header.bottom && tile.bottom <= element.getBoundingClientRect().bottom;
				})
			)
			.toBe(true);
	};
	await visibleBelowHeader();
	await page.evaluate(async (id) => {
		const path = '/src/studio/state.svelte.ts',
			state = await import(path);
		await state.openProject(id, { wear: 'hat_wizard' });
	}, ids.second);
	await visibleBelowHeader();
	await page.evaluate(async () => {
		const path = '/src/studio/state.svelte.ts',
			state = await import(path);
		await state.openProject(state.doc.id, { wear: 'hat_wizard' });
	});
	await visibleBelowHeader();
	const before = await page.evaluate(() => ({
		selected: window.__studio!.ui.selected,
		scroll: document.querySelector('#wardrobe-list')!.scrollTop
	}));
	expect(before.selected).toBe('hat_wizard');
	expect(before.scroll).toBeGreaterThan(0);
	await page.evaluate(async () => {
		const path = '/src/studio/state.svelte.ts',
			state = await import(path);
		await state.openProject(state.doc.id, { quiet: true });
	});
	expect(await page.evaluate(() => window.__studio!.ui.selected)).toBe(before.selected);
	await expect.poll(() => list.evaluate((element) => element.scrollTop)).toBe(before.scroll);
	await page.evaluate(async (id) => {
		const path = '/src/studio/state.svelte.ts',
			state = await import(path);
		await state.openProject(id);
	}, ids.first);
	await expect.poll(() => list.evaluate((element) => element.scrollTop)).toBe(0);
	await page.evaluate(() => {
		window.__studio!.ui.selected = 'hat_wizard';
	});
	await visibleBelowHeader();
});

test('Wardrobe lands on a category picked while closed and reveals tiles below the sticky header', async ({
	page
}, info) => {
	await page.addInitScript(() => {
		localStorage.setItem('pixeldoll.agentKey', 'off');
		localStorage.setItem('pixeldoll.welcomed', '1');
	});
	await page.setViewportSize({ width: 1280, height: 720 });
	// The dev server exposes the studio state (window.__studio) used to pick a category from elsewhere.
	await openStudio(
		page,
		info.config.projects.find((p) => p.name === 'browser-selftests')!.use.baseURL!
	);
	await equipmentGroup(page, 'Back');
	await equipmentMode(page, 'Colors');
	// Another view (a review, a missing-frames link) picks a category while the Wardrobe is closed.
	await page.evaluate(() => {
		const s = (window as unknown as { __studio: { ui: { group: string; tab: string } } }).__studio;
		s.ui.group = 'Main hand';
		s.ui.tab = 'wardrobe';
	});
	const list = page.locator('#wardrobe-list');
	const top = async (name: string) =>
		(await section(page, name).boundingBox())!.y - (await list.boundingBox())!.y;
	await expect.poll(() => top('Main hand')).toBeLessThan(4);
	const rail = page.getByRole('navigation', { name: 'Equipment slots', exact: true });
	await expect(rail.getByRole('button', { name: /^Main hand\b/ })).toHaveAttribute(
		'aria-current',
		'true'
	);

	// A tile half under a category's sticky header is brought fully into view when selected.
	await equipmentGroup(page, 'Head');
	const head = section(page, 'Head');
	const header = head.locator('.bu-section-head');
	const hat = head.getByRole('button', { name: /^Wizard hat(,|$)/ });
	await list.evaluate((el) => (el.scrollTop += 50));
	await page.evaluate(() => {
		(window as unknown as { __studio: { ui: { selected: string } } }).__studio.ui.selected =
			'hat_wizard';
	});
	await expect
		.poll(async () => {
			const tile = (await hat.boundingBox())!,
				bar = (await header.boundingBox())!,
				box = (await list.boundingBox())!;
			return tile.y >= bar.y + bar.height && tile.y + tile.height <= box.y + box.height;
		})
		.toBe(true);
});

test('a hand item can be two-handed, takes both hands, and offers a matching item for the other hand', async ({
	page,
	context
}, info) => {
	const posts: string[] = [];
	await context.route('https://api.pixellab.ai/**', (route) => {
		if (route.request().method() === 'POST') posts.push(new URL(route.request().url()).pathname);
		if (new URL(route.request().url()).pathname === '/v2/balance')
			return route.fulfill({
				json: {
					subscription: { type: 'generations', status: 'active', generations: 100, total: 100 },
					credits: { type: 'usd', usd: 0 }
				}
			});
		return route.abort();
	});
	await page.addInitScript(() => {
		localStorage.setItem('pixeldoll.agentKey', 'off');
		localStorage.setItem('pixeldoll.welcomed', '1');
		localStorage.setItem('pixellabApiKey', 'synthetic-two-handed-key');
	});
	await openStudio(
		page,
		info.config.projects.find((p) => p.name === 'browser-selftests')!.use.baseURL!
	);
	// An editable copy of the demo with a second hand item (the sword's art in the Off hand), worn with the sword.
	await page.evaluate(async () => {
		const statePath = '/src/studio/state.svelte.ts',
			s = await import(statePath);
		const projectPath = '/src/lib/store/project.ts',
			project = await import(projectPath);
		const dbPath = '/src/lib/store/db.ts',
			db = await import(dbPath);
		await s.copyDemo();
		const ctx = await project.loadProject(s.doc.id),
			m = ctx.rec.manifest;
		const sword = m.items.find((i: { slot: string }) => i.slot === 'main_hand');
		m.items.push({
			...structuredClone(sword),
			id: 'round_shield',
			name: 'Round shield',
			slot: 'off_hand',
			materials: []
		});
		m.slots.push({
			...structuredClone(m.slots.find((x: { id: string }) => x.id === 'main_hand')),
			id: 'off_hand',
			z: 140
		});
		await db.put('projects', ctx.rec.id, ctx.rec);
		await s.openProject(ctx.rec.id);
		s.pick(sword.id);
		s.pick('round_shield');
	});
	const main = section(page, 'Main hand'),
		off = section(page, 'Off hand');
	const sword = main.getByRole('button', { name: /^Steel longsword(,|$)/ }),
		shield = off.getByRole('button', { name: /^Round shield(,|$)/ });
	await equipmentGroup(page, 'Main hand');
	await expect(sword).toHaveAttribute('aria-pressed', 'true');
	await expect(shield).toHaveAttribute('aria-pressed', 'true');

	await main.getByRole('button', { name: 'More options for Steel longsword', exact: true }).click();
	await expectAnchoredMenu(page);
	const twoHanded = itemMenu(page).getByRole('menuitemcheckbox', { name: 'Two-handed' });
	await expect(twoHanded).not.toBeChecked();
	await expect(
		itemMenu(page).getByRole('menuitem', { name: 'Make one for the Off hand… Paid' })
	).toBeVisible();

	// Switching it on while worn takes the other hand's item off, says so, and Undo brings it back.
	await twoHanded.click();
	await expect(twoHanded).toBeChecked();
	await expect(itemMenu(page).locator('.item-menu-title small')).toContainText('Two-handed');
	await expect(itemMenu(page).getByRole('menuitem', { name: /^Make one for/ })).toHaveCount(0);
	await expect(
		page.getByText('Took off Round shield: Steel longsword is two-handed')
	).toBeVisible();
	await page.keyboard.press('Escape');
	await expect(shield).toHaveAttribute('aria-pressed', 'false');
	await expect(sword).toHaveAttribute('aria-pressed', 'true');
	await expect(off).toContainText('Held by Steel longsword (two-handed).');

	// Putting something in the other hand takes the two-handed item off.
	await shield.click();
	await expect(shield).toHaveAttribute('aria-pressed', 'true');
	await expect(sword).toHaveAttribute('aria-pressed', 'false');
	await expect(page.getByText('Took off Steel longsword (two-handed)')).toBeVisible();
	await expect(off).not.toContainText('Held by');
	await page.getByRole('button', { name: /^Undo/ }).click();
	await expect(sword).toHaveAttribute('aria-pressed', 'true');
	await expect(shield).toHaveAttribute('aria-pressed', 'false');

	// The switch is undoable and off again offers the other hand.
	await page.getByRole('button', { name: /^Undo/ }).click();
	await expect(shield).toHaveAttribute('aria-pressed', 'true');
	await expect(off).not.toContainText('Held by');

	// Make one for the other hand opens New item for that hand with the same description; the Off hand item offers
	// the Main hand.
	await off.getByRole('button', { name: 'More options for Round shield', exact: true }).click();
	await expect(
		itemMenu(page).getByRole('menuitem', { name: 'Make one for the Main hand… Paid' })
	).toBeVisible();
	await page.keyboard.press('Escape');
	await main.getByRole('button', { name: 'More options for Steel longsword', exact: true }).click();
	await itemMenu(page).getByRole('menuitem', { name: 'Make one for the Off hand… Paid' }).click();
	const sheet = page.getByRole('dialog', { name: 'New item', exact: true });
	await expect(sheet.getByRole('radio', { name: 'Off hand', exact: true })).toHaveAttribute(
		'aria-checked',
		'true'
	);
	const prompt = await page.evaluate(async () => {
		const statePath = '/src/studio/state.svelte.ts',
			s = await import(statePath);
		return s.store.project.manifest.items.find((i: { slot: string }) => i.slot === 'main_hand')
			.prompt;
	});
	await expect(sheet.getByRole('textbox', { name: 'What is it?', exact: true })).toHaveValue(
		prompt
	);
	await sheet.getByRole('button', { name: 'Cancel', exact: true }).click();

	// Enter toggles the switch like any menu item.
	await expect(page.getByRole('dialog', { name: 'New item', exact: true })).toHaveCount(0);
	await main.getByRole('button', { name: 'More options for Steel longsword', exact: true }).click();
	await expectAnchoredMenu(page);
	const toggle = itemMenu(page).getByRole('menuitemcheckbox', { name: 'Two-handed' });
	await toggle.focus();
	await page.keyboard.press('Enter');
	await expect(toggle).toBeChecked();
	await page.keyboard.press('Escape');
	await expect(shield).toHaveAttribute('aria-pressed', 'false');

	// An outfit keeps the Main hand even when only its Off hand differs from what is worn, and still counts as current.
	const outfit = await page.evaluate(async () => {
		const statePath = '/src/studio/state.svelte.ts',
			s = await import(statePath);
		const p = {
			id: 'both-hands',
			name: 'Both hands',
			items: { ...s.doc.items, off_hand: 'round_shield' },
			variants: { ...s.doc.variants }
		};
		s.applyPreset(p);
		return { main: s.doc.items.main_hand, off: s.doc.items.off_hand, same: s.sameOutfit(p) };
	});
	expect(outfit).toEqual({ main: 'sword_steel', off: null, same: true });

	// An item put on by Keep it that needs the other hand is one undoable edit.
	await page.evaluate(async () => {
		const statePath = '/src/studio/state.svelte.ts',
			s = await import(statePath);
		await s.openProject(s.doc.id, { wear: 'round_shield' });
	});
	await expect(shield).toHaveAttribute('aria-pressed', 'true');
	await expect(sword).toHaveAttribute('aria-pressed', 'false');
	await page.getByRole('button', { name: 'Undo Wear Round shield', exact: true }).click();
	await expect(sword).toHaveAttribute('aria-pressed', 'true');
	await expect(shield).toHaveAttribute('aria-pressed', 'false');
	expect(posts).toEqual([]);
});
