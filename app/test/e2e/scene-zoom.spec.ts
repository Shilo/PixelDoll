import { expect, test, type Locator, type Page, type TestInfo } from '@playwright/test';
import { mkdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';

// The zoom camera is easiest to seed and inspect against the dev server, as the other immersive specs do.
// The production preview strips the state module this spec imports to build several library characters.
const devURL = `http://127.0.0.1:${process.env.DEV_PORT ?? '5298'}`;
test.use({ baseURL: devURL });

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
		expect(route.request().method(), 'Zoom checks must never submit a paid request').toBe('GET');
	});
});

const SIZES_A = [
	[320, 568],
	[568, 320],
	[390, 844],
	[844, 390],
	[768, 1024]
] as const;
const SIZES_B = [
	[1024, 768],
	[900, 1440],
	[1440, 900],
	[2560, 1080],
	[1080, 2560]
] as const;
const THEMES = ['dark', 'light'] as const;

const selection = (page: Page) => page.locator('.selection-world');
const world = (page: Page) => page.locator('.world-stage');
const zoomGroup = (page: Page) => page.getByRole('group', { name: 'Scene zoom', exact: true });

async function settle(page: Page) {
	await page.evaluate(
		() =>
			new Promise<void>((resolve) =>
				requestAnimationFrame(() => requestAnimationFrame(() => resolve()))
			)
	);
}

async function shot(page: Page, info: TestInfo, name: string) {
	const body = await page.screenshot({ animations: 'disabled' });
	// Passing tests drop their attachments, so also keep the review matrix in a stable folder under the run output.
	const directory = resolve(process.env.TEST_OUTPUT_DIR ?? 'test-results', 'zoom-screens');
	await mkdir(directory, { recursive: true });
	await writeFile(resolve(directory, `zoom-${name}.png`), body);
	await info.attach(`zoom-${name}.png`, { body, contentType: 'image/png' });
}

/** Seed several library characters from the stored fixture once per test, never once per viewport. */
async function seedCharacters(page: Page, copies = 2) {
	await page.goto('/');
	await expect(page.locator('.customize-action')).toBeEnabled({ timeout: 30_000 });
	const ids = await page.evaluate(async (count) => {
		const { openSource } = await import(/* @vite-ignore */ String('/src/lib/dress/project.ts'));
		const { saveImportedCharacter } = await import(
			/* @vite-ignore */ String('/src/lib/store/import.ts')
		);
		const { refreshProjects, openProject, store } = await import(
			/* @vite-ignore */ String('/src/studio/state.svelte.ts')
		);
		const { project } = await openSource('fixture:s2');
		for (let copy = 1; copy <= count; copy++)
			await saveImportedCharacter(
				{
					project: { manifest: structuredClone(project.manifest), images: project.images },
					extra: {},
					warnings: []
				},
				`Zoom library ${copy}`
			);
		await refreshProjects();
		await openProject(store.projects[0].id);
		return store.projects.map((entry: { id: string }) => entry.id);
	}, copies);
	await expect(page.locator('.character-row')).toHaveCount(copies + 1);
	await expect(page.locator('.customize-action')).toBeEnabled();
	return ids as string[];
}

/**
 * Five characters whose valid direction lists hold exactly one through five non-mirror facings. All reuse the
 * fixture's generated south cells for the added directions, so every facing has real art and the same walk clip.
 */
async function seedFacingCharacters(page: Page) {
	await page.goto('/');
	await expect(page.locator('.customize-action')).toBeEnabled({ timeout: 30_000 });
	const ids = await page.evaluate(async () => {
		const { openSource } = await import(/* @vite-ignore */ String('/src/lib/dress/project.ts'));
		const { saveImportedCharacter } = await import(
			/* @vite-ignore */ String('/src/lib/store/import.ts')
		);
		const { refreshProjects, openProject, store } = await import(
			/* @vite-ignore */ String('/src/studio/state.svelte.ts')
		);
		const { project } = await openSource('fixture:s2');
		const order = ['south', 'east', 'north', 'south-east', 'north-east'];
		for (let count = 1; count <= 5; count++) {
			const manifest = structuredClone(project.manifest);
			manifest.rig.directions = order.slice(0, count).map((id) => ({ id }));
			for (const item of manifest.items)
				for (const layer of item.layers ?? [])
					for (const directions of Object.values(layer.cells ?? {}) as Array<
						Record<string, (string | null)[]>
					>)
						for (const id of order.slice(0, count))
							if (!directions[id] && directions.south) directions[id] = [...directions.south];
			await saveImportedCharacter(
				{ project: { manifest, images: project.images }, extra: {}, warnings: [] },
				`Zoom facings ${count}`
			);
		}
		await refreshProjects();
		await openProject(store.projects[0].id);
		return store.projects
			.filter((entry: { name: string }) => entry.name.startsWith('Zoom facings '))
			.map((entry: { id: string; name: string }) => ({ id: entry.id, name: entry.name }));
	});
	await expect(page.locator('.character-row')).toHaveCount(6);
	for (let count = 1; count <= 5; count++)
		await expect(
			page.locator('.character-row').filter({ hasText: `Zoom facings ${count}` })
		).toHaveCount(1);
	await expect(page.locator('.customize-action')).toBeEnabled();
	return ids as { id: string; name: string }[];
}

async function setTheme(page: Page, theme: (typeof THEMES)[number]) {
	await page.evaluate(async (value) => {
		const state = await import(/* @vite-ignore */ String('/src/studio/state.svelte.ts'));
		state.ui.theme = value;
		state.applyTheme();
	}, theme);
	await expect(page.locator('html')).toHaveAttribute('data-theme', theme);
}

interface SceneState {
	zoom: number;
	min: number;
	max: number;
}

async function readScene(host: Locator): Promise<SceneState> {
	const raw = await host.evaluate((node) => ({
		zoom: node.dataset.sceneZoom,
		min: node.dataset.sceneMin,
		max: node.dataset.sceneMax
	}));
	const state = { zoom: Number(raw.zoom), min: Number(raw.min), max: Number(raw.max) };
	if (![state.zoom, state.min, state.max].every(Number.isFinite))
		throw new Error(
			`Scene camera is not exposed as finite numbers: zoom=${raw.zoom} min=${raw.min} max=${raw.max}`
		);
	return state;
}

async function waitForScene(host: Locator) {
	await expect(host).toHaveAttribute('data-scene-zoom', /^\d+(\.\d+)?$/);
	await expect(host).toHaveAttribute('data-scene-min', /^\d+(\.\d+)?$/);
	await expect(host).toHaveAttribute('data-scene-max', /^\d+(\.\d+)?$/);
}

/** A uniform camera keeps every exposed bound coherent and the default at exactly one. */
async function expectSceneBounds(host: Locator, label: string) {
	await waitForScene(host);
	const { zoom, min, max } = await readScene(host);
	expect(min, `${label}: min is finite`).toBeGreaterThan(0);
	expect(min, `${label}: min never zooms past automatic fit`).toBeLessThanOrEqual(1 + 1e-9);
	// A width-limited screen can legitimately leave no room to zoom in; the detailed desktop checks require a
	// real range there. Everywhere, max never exceeds the promised 1.5 cap.
	expect(max, `${label}: max is at least automatic fit`).toBeGreaterThanOrEqual(1);
	expect(max, `${label}: max never exceeds the 1.5 cap`).toBeLessThanOrEqual(1.5 + 1e-9);
	expect(zoom, `${label}: zoom stays inside the camera bounds`).toBeGreaterThanOrEqual(min - 1e-9);
	expect(zoom, `${label}: zoom stays inside the camera bounds`).toBeLessThanOrEqual(max + 1e-9);
	return { zoom, min, max };
}

interface Backdrop {
	rect: { left: number; top: number; right: number; bottom: number; width: number; height: number };
	image: { x: number; y: number; width: number; height: number };
	size: string;
	position: string;
	url: string;
}

/**
 * The rendered background image box in screen pixels, including any transform on the backdrop or an ancestor.
 * A uniform camera changes this box by exactly the zoom factor and never stretches one axis alone.
 */
async function backdrop(page: Page): Promise<Backdrop> {
	return page.evaluate(() => {
		const node = document.querySelector<HTMLElement>('.scene-backdrop');
		if (!node) throw new Error('No .scene-backdrop to measure');
		const style = getComputedStyle(node);
		const rect = node.getBoundingClientRect();
		const scaleX = node.offsetWidth ? rect.width / node.offsetWidth : 1;
		const scaleY = node.offsetHeight ? rect.height / node.offsetHeight : 1;
		const [sizeX, sizeY] = style.backgroundSize.split(/\s+/);
		const [positionX, positionY] = style.backgroundPosition.split(/\s+/);
		const length = (value: string, base: number) => {
			if (value.endsWith('%')) return (parseFloat(value) / 100) * base;
			const parsed = parseFloat(value);
			if (!Number.isFinite(parsed)) throw new Error(`Unreadable background length: ${value}`);
			return parsed;
		};
		const width = length(sizeX, node.clientWidth) * scaleX;
		const height = length(sizeY, node.clientHeight) * scaleY;
		if (!Number.isFinite(width) || !Number.isFinite(height) || width <= 0 || height <= 0)
			throw new Error(`Unreadable background size: ${style.backgroundSize}`);
		return {
			rect: rect.toJSON(),
			image: {
				x: rect.left + length(positionX, node.clientWidth) * scaleX,
				y: rect.top + length(positionY, node.clientHeight) * scaleY,
				width,
				height
			},
			size: style.backgroundSize,
			position: style.backgroundPosition,
			url: style.backgroundImage
		};
	});
}

function expectCovered(scene: Backdrop, label: string) {
	const { rect, image } = scene;
	expect(image.x, `${label}: no gap at the left edge`).toBeLessThanOrEqual(rect.left + 0.75);
	expect(image.y, `${label}: no gap at the top edge`).toBeLessThanOrEqual(rect.top + 0.75);
	expect(image.x + image.width, `${label}: no gap at the right edge`).toBeGreaterThanOrEqual(
		rect.right - 0.75
	);
	expect(image.y + image.height, `${label}: no gap at the bottom edge`).toBeGreaterThanOrEqual(
		rect.bottom - 0.75
	);
}

async function expectBackdropFactor(page: Page, base: Backdrop, factor: number, label: string) {
	await expect
		.poll(async () => (await backdrop(page)).image.width / base.image.width, {
			message: `${label}: backdrop width follows the scene camera`
		})
		.toBeCloseTo(factor, 3);
	await expect
		.poll(async () => (await backdrop(page)).image.height / base.image.height, {
			message: `${label}: backdrop height follows the scene camera`
		})
		.toBeCloseTo(factor, 3);
	const ratio = (await backdrop(page)).image;
	expect(
		ratio.width / ratio.height,
		`${label}: the camera never stretches the backdrop`
	).toBeCloseTo(base.image.width / base.image.height, 3);
}

async function chosenRect(page: Page) {
	return page
		.locator('.cast-character.chosen canvas.sprite')
		.first()
		.evaluate((canvas) => {
			const rect = canvas.getBoundingClientRect();
			return { width: rect.width, height: rect.height, left: rect.left, top: rect.top };
		});
}

async function castRects(page: Page) {
	return page.evaluate(() =>
		[...document.querySelectorAll('.cast-character:not([inert]) canvas.sprite')].map((canvas) => {
			const rect = canvas.getBoundingClientRect();
			return {
				left: rect.left,
				top: rect.top,
				right: rect.right,
				bottom: rect.bottom,
				width: rect.width,
				height: rect.height
			};
		})
	);
}

/** Painted actor bounds as screen pixels, read from the composited canvas (device pixels divided out). */
async function actorBounds(page: Page) {
	return page.evaluate(() => {
		const canvas = document.querySelector<HTMLCanvasElement>('.world-actors');
		if (!canvas) throw new Error('No .world-actors canvas');
		const context = canvas.getContext('2d');
		if (!context) throw new Error('No 2D context for .world-actors');
		const pixels = context.getImageData(0, 0, canvas.width, canvas.height).data;
		let left = canvas.width,
			top = canvas.height,
			right = 0,
			bottom = 0;
		for (let y = 0; y < canvas.height; y++)
			for (let x = 0; x < canvas.width; x++)
				// The deliberately faded .12 reflection is decoration, not an actor: count opaque art and rings only.
				if (pixels[(y * canvas.width + x) * 4 + 3] >= 128) {
					left = Math.min(left, x);
					top = Math.min(top, y);
					right = Math.max(right, x + 1);
					bottom = Math.max(bottom, y + 1);
				}
		const rect = canvas.getBoundingClientRect();
		const scaleX = rect.width / canvas.width,
			scaleY = rect.height / canvas.height;
		if (!right || !bottom) throw new Error('The actor canvas is empty');
		return {
			left: rect.left + left * scaleX,
			top: rect.top + top * scaleY,
			right: rect.left + right * scaleX,
			bottom: rect.top + bottom * scaleY,
			width: (right - left) * scaleX,
			height: (bottom - top) * scaleY
		};
	});
}

async function wheel(
	node: Locator,
	init: {
		deltaY: number;
		deltaX?: number;
		ctrlKey?: boolean;
		metaKey?: boolean;
		shiftKey?: boolean;
		altKey?: boolean;
	}
) {
	return node.evaluate((element, values) => {
		const event = new WheelEvent('wheel', {
			deltaY: values.deltaY,
			deltaX: values.deltaX ?? 0,
			ctrlKey: !!values.ctrlKey,
			metaKey: !!values.metaKey,
			shiftKey: !!values.shiftKey,
			altKey: !!values.altKey,
			bubbles: true,
			cancelable: true
		});
		return !element.dispatchEvent(event);
	}, init);
}

/** One zoom step. The controls exist only away from the automatic fit, so a step from the fit uses the scene's key. */
async function zoomStep(page: Page, host: Locator, direction: 'in' | 'out') {
	const group = zoomGroup(page);
	if (await group.isVisible()) {
		await group.getByRole('button', { name: `Zoom ${direction}`, exact: true }).click();
	} else {
		await host.focus();
		await page.keyboard.press(direction === 'in' ? '=' : '-');
	}
	// Let the camera and the disabled state render before the next stale check.
	await settle(page);
}

async function zoomToEnd(page: Page, host: Locator, direction: 'in' | 'out') {
	for (let step = 0; step < 60; step++) {
		const { zoom, min, max } = await readScene(host);
		if (direction === 'in' ? zoom >= max - 1e-9 : zoom <= min + 1e-9) break;
		await zoomStep(page, host, direction);
	}
	// A screen with no room to zoom in ends at the automatic fit, where there are no controls to disable.
	if ((await readScene(host)).zoom === 1) await expect(zoomGroup(page)).toHaveCount(0);
	else
		await expect(
			zoomGroup(page).getByRole('button', { name: `Zoom ${direction}`, exact: true })
		).toBeDisabled();
}

const zoomToMax = (page: Page, host: Locator) => zoomToEnd(page, host, 'in');
const zoomToMin = (page: Page, host: Locator) => zoomToEnd(page, host, 'out');

async function resetZoom(page: Page, host: Locator) {
	const reset = zoomGroup(page).getByRole('button', { name: 'Reset scene zoom', exact: true });
	if (await reset.isVisible()) await reset.click();
	await expect.poll(async () => (await readScene(host)).zoom).toBe(1);
	await expect(zoomGroup(page), 'the automatic fit hides the zoom controls').toHaveCount(0);
	await settle(page);
}

async function verifySelectionZoom(
	page: Page,
	info: TestInfo,
	sizes: readonly (readonly [number, number])[],
	onlyTheme?: (typeof THEMES)[number]
) {
	const ids = await seedCharacters(page, 2);
	await expect(page.locator('.cast-character.chosen')).toHaveAttribute('data-character-id', ids[0]);
	const host = selection(page);
	await expectSceneBounds(host, 'selection initial');
	expect((await readScene(host)).zoom).toBe(1);

	for (const theme of THEMES.filter((value) => !onlyTheme || value === onlyTheme))
		for (const [width, height] of sizes) {
			const label = `${theme} ${width}x${height}`;
			await page.setViewportSize({ width, height });
			await setTheme(page, theme);
			await settle(page);
			await resetZoom(page, host);
			const { zoom, max } = await expectSceneBounds(host, label);
			expect(zoom, `${label}: reset is exactly automatic fit`).toBe(1);
			if (theme === 'dark' && width === 1440 && height === 900)
				expect(max, `${label}: a desktop screen has a real zoom-in range`).toBeGreaterThan(1.1);
			await expect(zoomGroup(page), `${label}: the fit shows no zoom controls`).toHaveCount(0);
			const baseBackdrop = await backdrop(page);
			expectCovered(baseBackdrop, `${label}: automatic fit covers the scene`);
			const baseCast = await chosenRect(page);

			// One step proves the backdrop and the cast move on the same camera factor.
			await zoomStep(page, host, 'in');
			const stepped = await readScene(host);
			await expect(zoomGroup(page), `${label}: zooming shows the controls`).toBeVisible();
			const controls = await zoomGroup(page).boundingBox();
			expect(controls, `${label}: zoom controls have a real box`).not.toBeNull();
			expect(controls!.x, `${label}: zoom controls stay on screen`).toBeGreaterThanOrEqual(0);
			expect(
				controls!.x + controls!.width,
				`${label}: zoom controls stay on screen`
			).toBeLessThanOrEqual(width + 0.5);
			expect(stepped.zoom, `${label}: zoom in leaves automatic fit`).toBeGreaterThan(1);
			await expectBackdropFactor(page, baseBackdrop, stepped.zoom, `${label}: one step`);
			await expect
				.poll(async () => (await chosenRect(page)).width / baseCast.width, {
					message: `${label}: the cast follows the same camera factor`
				})
				.toBeCloseTo(stepped.zoom, 3);
			await resetZoom(page, host);
			const restored = await backdrop(page);
			expect(
				Math.abs(restored.image.width - baseBackdrop.image.width),
				`${label}: reset restores exact scale`
			).toBeLessThan(0.02);
			expect(
				Math.abs(restored.image.height - baseBackdrop.image.height),
				`${label}: reset restores exact scale`
			).toBeLessThan(0.02);

			// The upper bound is the geometry fit, not a guess: every actor stays inside its clearance at max.
			await zoomToMax(page, host);
			const top = await readScene(host);
			expect(top.zoom, `${label}: zoom in stops exactly at max`).toBeCloseTo(top.max, 6);
			expect(top.max, `${label}: max stays inside the promised 1.5 cap`).toBeLessThanOrEqual(
				1.5 + 1e-9
			);
			await expectBackdropFactor(page, baseBackdrop, top.zoom, `${label}: max`);
			expectCovered(await backdrop(page), `${label}: max still covers the scene`);
			const headerBottom = await page
				.locator('.experience-header')
				.evaluate((header) => header.getBoundingClientRect().bottom);
			const actors = await castRects(page);
			expect(actors.length, `${label}: all current actors are measured`).toBeGreaterThan(0);
			for (const actor of actors) {
				expect(actor.left, `${label}: no actor crosses the left edge`).toBeGreaterThanOrEqual(-1);
				expect(actor.right, `${label}: no actor crosses the right edge`).toBeLessThanOrEqual(
					width + 1
				);
				expect(actor.top, `${label}: no actor rises into the header`).toBeGreaterThanOrEqual(
					headerBottom + 14
				);
				expect(actor.bottom, `${label}: no actor drops below the stage`).toBeLessThanOrEqual(
					height + 1
				);
			}
			if (top.zoom > 1.08) {
				const maxCast = await chosenRect(page);
				expect(maxCast.width, `${label}: the cast visibly zooms in`).toBeGreaterThan(
					baseCast.width + 0.5
				);
			}
			// Companions that would leave the clearance are culled, never deformed or dropped out of the DOM.
			const culledCast = page.locator('.cast-character[style*="visibility: hidden"]');
			for (const actor of await culledCast.all()) await expect(actor).toHaveAttribute('inert', '');
			await expect(page.locator('.cast-character.chosen')).not.toHaveAttribute('inert', '');
			await shot(page, info, `${theme}-${width}x${height}-max`);

			// Past the background's cover limit only the characters shrink, to half their fit, so zooming out never
			// shows a seam.
			await resetZoom(page, host);
			await zoomToMin(page, host);
			const bottom = await readScene(host);
			expect(bottom.zoom, `${label}: zoom out stops exactly at min`).toBeCloseTo(bottom.min, 6);
			expect(bottom.min, `${label}: characters shrink to half their fit`).toBeCloseTo(0.5, 6);
			const lowest = await backdrop(page);
			expectCovered(lowest, `${label}: min covers the scene`);
			expect(
				lowest.image.width / baseBackdrop.image.width,
				`${label}: the background stops at or above the characters' zoom`
			).toBeGreaterThanOrEqual(bottom.zoom - 1e-3);
			await expect
				.poll(async () => (await chosenRect(page)).width / baseCast.width, {
					message: `${label}: the cast shrinks by the camera factor`
				})
				.toBeCloseTo(bottom.zoom, 3);

			await resetZoom(page, host);
			expect((await readScene(host)).zoom, `${label}: final reset is exactly 1`).toBe(1);
		}
}

test('selection zoom is a bounded uniform camera that fits every actor and resets to exactly 1 (dark)', async ({
	page
}, info) => {
	await verifySelectionZoom(page, info, SIZES_A, 'dark');
});

test('selection zoom is a bounded uniform camera that fits every actor and resets to exactly 1 (light)', async ({
	page
}, info) => {
	await verifySelectionZoom(page, info, SIZES_A, 'light');
});

test('selection zoom holds the same camera on rotated screens (dark)', async ({ page }, info) => {
	await verifySelectionZoom(page, info, SIZES_B, 'dark');
});

test('selection zoom holds the same camera on rotated screens (light)', async ({ page }, info) => {
	await verifySelectionZoom(page, info, SIZES_B, 'light');
});

async function verifyPreviewZoomMatrix(
	page: Page,
	info: TestInfo,
	sizes: readonly (readonly [number, number])[]
) {
	await page.goto('/');
	await expect(page.locator('.customize-action')).toBeEnabled({ timeout: 20_000 });
	await page.locator('.customize-action').click();
	await expect(world(page)).toBeVisible();
	await page
		.getByRole('group', { name: 'Character view', exact: true })
		.getByRole('button', { name: 'Preview', exact: true })
		.click();
	const pause = page.getByRole('button', { name: 'Pause', exact: true });
	if (await pause.isVisible()) await pause.click();
	await settle(page);
	const host = world(page);
	await expectSceneBounds(host, 'preview initial');
	expect((await readScene(host)).zoom).toBe(1);

	for (const theme of THEMES)
		for (const [width, height] of sizes) {
			const label = `preview ${theme} ${width}x${height}`;
			await page.setViewportSize({ width, height });
			await setTheme(page, theme);
			await settle(page);
			await resetZoom(page, host);
			await expectSceneBounds(host, label);
			expect((await readScene(host)).zoom, `${label}: reset is exactly automatic fit`).toBe(1);
			const baseBackdrop = await backdrop(page);
			expectCovered(baseBackdrop, `${label}: automatic fit covers the scene`);
			await shot(page, info, `${theme}-${width}x${height}-fit`);
			await zoomToMax(page, host);
			const top = await readScene(host);
			await expectBackdropFactor(page, baseBackdrop, top.zoom, `${label}: max`);
			expectCovered(await backdrop(page), `${label}: max covers the scene`);
			if (top.zoom > 1) {
				const actors = await actorBounds(page);
				const controls = (await zoomGroup(page).boundingBox())!;
				if (actors.left < controls.x + controls.width && actors.right > controls.x)
					expect(
						actors.top,
						`${label}: zoom keeps artwork below overlapping controls`
					).toBeGreaterThanOrEqual(controls.y + controls.height - 1);
			}
			await shot(page, info, `preview-${theme}-${width}x${height}-max`);
			await zoomToMin(page, host);
			expect((await readScene(host)).zoom, `${label}: characters shrink to half`).toBeCloseTo(
				0.5,
				6
			);
			expectCovered(await backdrop(page), `${label}: min covers the scene`);
			await resetZoom(page, host);
		}
}

test('Preview zoom keeps every screen covering and resets on portrait and small landscape screens', async ({
	page
}, info) => {
	await verifyPreviewZoomMatrix(page, info, SIZES_A);
});

test('Preview zoom keeps every rotated screen covering, both themes', async ({ page }, info) => {
	await verifyPreviewZoomMatrix(page, info, SIZES_B);
});

test('Preview zoom keeps actors and backdrop on one camera and fits them at max', async ({
	page
}, info) => {
	await page.setViewportSize({ width: 1440, height: 900 });
	await page.goto('/');
	await expect(page.locator('.customize-action')).toBeEnabled({ timeout: 20_000 });
	await page.locator('.customize-action').click();
	await expect(world(page)).toBeVisible();
	await page
		.getByRole('group', { name: 'Character view', exact: true })
		.getByRole('button', { name: 'Preview', exact: true })
		.click();
	const pause = page.getByRole('button', { name: 'Pause', exact: true });
	if (await pause.isVisible()) await pause.click();
	await settle(page);
	const host = world(page);
	await resetZoom(page, host);
	const initial = await readScene(host);
	expect(initial.max, 'desktop Preview has a real zoom-in range').toBeGreaterThan(1.1);
	await expect.poll(async () => (await actorBounds(page)).width).toBeGreaterThan(0);
	const baseBackdrop = await backdrop(page);
	const baseActor = await actorBounds(page);
	await zoomStep(page, host, 'in');
	await expect.poll(async () => (await readScene(host)).zoom).toBeGreaterThan(1);
	const stepped = await readScene(host);
	await expectBackdropFactor(page, baseBackdrop, stepped.zoom, 'preview one step');
	await expect
		.poll(async () => (await actorBounds(page)).height / baseActor.height, {
			message: 'preview: painted actors use the same camera factor as the backdrop'
		})
		.toBeCloseTo(stepped.zoom, 1);
	await resetZoom(page, host);
	await zoomToMax(page, host);
	const top = await readScene(host);
	expect(top.zoom).toBeCloseTo(top.max, 6);
	await expectBackdropFactor(page, baseBackdrop, top.zoom, 'preview max');
	const playbackTop = await page
		.locator('.experience-playback')
		.evaluate((bar) => bar.getBoundingClientRect().top);
	const stage = await page
		.locator('.experience-stage')
		.evaluate((element) => element.getBoundingClientRect().toJSON());
	const bounds = await actorBounds(page);
	expect(bounds.left, 'preview max: actors stay inside the stage').toBeGreaterThanOrEqual(
		stage.left - 1
	);
	expect(bounds.right, 'preview max: actors stay inside the stage').toBeLessThanOrEqual(
		stage.right + 1
	);
	expect(
		bounds.top,
		'preview max: actors rise under the header but not through it'
	).toBeGreaterThanOrEqual(stage.top - 1);
	expect(bounds.bottom, 'preview max: actors stay above the playback bar').toBeLessThanOrEqual(
		playbackTop + 1
	);
	expect(bounds.height, 'preview max: the painted actor zooms in').toBeGreaterThan(
		baseActor.height + 0.5
	);
	await shot(page, info, 'preview-1440x900-max');
});

test('wheel, keys, middle click and native controls only change zoom where the scene owns input', async ({
	page
}) => {
	await seedCharacters(page, 2);
	const host = selection(page);
	await resetZoom(page, host);
	const chosen = page.locator('.cast-character.chosen');
	const first = await chosen.getAttribute('data-character-id');

	// Plain wheel zooms the selection scene and never navigates.
	expect(await wheel(host, { deltaY: -240 }), 'selection plain wheel zooms').toBe(true);
	await expect.poll(async () => (await readScene(host)).zoom).toBeGreaterThan(1);
	expect(await chosen.getAttribute('data-character-id'), 'plain wheel never navigates').toBe(first);
	await resetZoom(page, host);
	// The caption's buttons have no wheel of their own, so the scene still zooms over them.
	expect(
		await wheel(page.locator('.selected-name'), { deltaY: -240 }),
		'wheel over the caption'
	).toBe(true);
	await expect.poll(async () => (await readScene(host)).zoom).toBeGreaterThan(1);
	await resetZoom(page, host);
	// A trackpad pinch arrives as a Ctrl wheel without the Control key held: it zooms, never navigates.
	expect(await wheel(host, { deltaY: 240, ctrlKey: true }), 'a trackpad pinch zooms').toBe(true);
	await expect.poll(async () => (await readScene(host)).zoom).toBeLessThan(1);
	expect(await chosen.getAttribute('data-character-id'), 'a pinch never navigates').toBe(first);
	await resetZoom(page, host);
	// A wheel turned while Ctrl or Cmd is held steps through the characters instead of zooming.
	await page.keyboard.down('Control');
	expect(await wheel(host, { deltaY: 400, ctrlKey: true }), 'Ctrl wheel navigates').toBe(true);
	await page.keyboard.up('Control');
	await expect(chosen).not.toHaveAttribute('data-character-id', first!);
	expect((await readScene(host)).zoom, 'Ctrl wheel does not zoom').toBe(1);
	const afterNavigate = await chosen.getAttribute('data-character-id');
	expect(await wheel(host, { deltaY: 400, metaKey: true }), 'Cmd wheel navigates').toBe(true);
	await expect(chosen).not.toHaveAttribute('data-character-id', afterNavigate!);
	expect((await readScene(host)).zoom, 'Cmd wheel does not zoom').toBe(1);
	// Over the scrolling list too, so the browser never zooms the page instead.
	const rows = page.locator('.character-rows');
	const beforeList = await chosen.getAttribute('data-character-id');
	expect(await wheel(rows, { deltaY: 400, metaKey: true }), 'Cmd wheel over the list').toBe(true);
	await expect(chosen).not.toHaveAttribute('data-character-id', beforeList!);
	expect(await wheel(host, { deltaY: -240, shiftKey: true }), 'Shift wheel stays native').toBe(
		false
	);
	expect((await readScene(host)).zoom, 'Shift wheel does not zoom').toBe(1);
	expect(await wheel(host, { deltaY: -240, altKey: true }), 'Alt wheel stays native').toBe(false);
	expect((await readScene(host)).zoom, 'Alt wheel does not zoom').toBe(1);

	// Native fields do not receive scene keys.
	const search = page.getByRole('searchbox', { name: 'Search characters', exact: true });
	await search.click();
	await page.keyboard.type('+-0');
	await expect(search).toHaveValue('+-0');
	expect((await readScene(host)).zoom, 'typing in a field never zooms').toBe(1);
	await search.fill('');
	await host.focus();
	await page.keyboard.press('+');
	await expect.poll(async () => (await readScene(host)).zoom).toBeGreaterThan(1);
	await page.keyboard.press('0');
	expect((await readScene(host)).zoom, '0 resets only from the focused scene').toBe(1);

	// Middle click resets the camera without activating the actor under the pointer.
	await wheel(host, { deltaY: -240 });
	await expect.poll(async () => (await readScene(host)).zoom).toBeGreaterThan(1);
	const selectedBefore = await chosen.getAttribute('data-character-id');
	const castBox = (await page.locator('.cast').boundingBox())!;
	await page.mouse.move(castBox.x + castBox.width / 2, castBox.y + castBox.height / 2);
	await page.mouse.down({ button: 'middle' });
	await page.mouse.up({ button: 'middle' });
	expect((await readScene(host)).zoom, 'middle click resets the scene zoom').toBe(1);
	expect(
		await chosen.getAttribute('data-character-id'),
		'middle click is not a selection click'
	).toBe(selectedBefore);
	await expect(world(page)).toHaveCount(0);

	// The creator is native: typing, caret moves and wheel stay inside the dialog.
	await page.getByRole('button', { name: 'New character', exact: true }).first().click();
	await page.getByRole('menuitem', { name: 'Create from scratch…', exact: true }).click();
	const dialog = page.getByRole('dialog', { name: 'New character', exact: true });
	const name = dialog.getByRole('textbox', { name: 'Name', exact: true });
	await name.click();
	await page.keyboard.type('+-0');
	await expect(name).toHaveValue('+-0');
	expect((await readScene(host)).zoom, 'typing in the creator never zooms').toBe(1);
	await page.keyboard.press('ArrowLeft');
	await expect(name).toBeFocused();
	expect(await wheel(dialog, { deltaY: 240 }), 'the dialog keeps its native wheel').toBe(false);
	expect((await readScene(host)).zoom, 'wheel over the dialog never zooms the scene').toBe(1);
	await dialog.getByRole('button', { name: 'Cancel', exact: true }).click();

	// Preview: plain or modified wheel zooms; Shift and Alt stay native.
	await page.locator('.customize-action').click();
	await expect(world(page)).toBeVisible();
	const preview = world(page);
	await resetZoom(page, preview);
	expect(await wheel(preview, { deltaY: -240 }), 'Preview plain wheel zooms').toBe(true);
	await expect.poll(async () => (await readScene(preview)).zoom).toBeGreaterThan(1);
	await resetZoom(page, preview);
	expect(await wheel(preview, { deltaY: -240, ctrlKey: true }), 'Preview Ctrl wheel zooms').toBe(
		true
	);
	await expect.poll(async () => (await readScene(preview)).zoom).toBeGreaterThan(1);
	await resetZoom(page, preview);
	expect(await wheel(preview, { deltaY: -240, metaKey: true }), 'Preview Meta wheel zooms').toBe(
		true
	);
	await expect.poll(async () => (await readScene(preview)).zoom).toBeGreaterThan(1);
	await resetZoom(page, preview);
	expect(
		await wheel(preview, { deltaY: -240, shiftKey: true }),
		'Preview Shift wheel stays native'
	).toBe(false);
	expect((await readScene(preview)).zoom, 'Preview Shift wheel does not zoom').toBe(1);

	// Keys reach the scene only while its host is focused.
	await preview.focus();
	await page.keyboard.press('+');
	await expect.poll(async () => (await readScene(preview)).zoom).toBeGreaterThan(1);
	await page.keyboard.press('-');
	const lowered = await readScene(preview);
	expect(lowered.zoom, 'minus zooms out from the focused scene').toBeLessThan(lowered.max);
	await page.keyboard.press('0');
	expect((await readScene(preview)).zoom, '0 resets Preview exactly').toBe(1);
	await page
		.getByRole('button', { name: /^(Play|Pause)$/ })
		.first()
		.focus();
	await page.keyboard.press('+');
	expect((await readScene(preview)).zoom, 'a focused toolbar control keeps its native keys').toBe(
		1
	);

	// Middle click resets Preview without changing facing or position.
	await preview.focus();
	await page.keyboard.press('+');
	const facing = await preview.getAttribute('data-facing');
	const position = await preview.getAttribute('data-position');
	const worldBox = (await preview.boundingBox())!;
	await page.mouse.move(worldBox.x + worldBox.width / 2, worldBox.y + worldBox.height / 2);
	await page.mouse.down({ button: 'middle' });
	await page.mouse.up({ button: 'middle' });
	expect((await readScene(preview)).zoom, 'middle click resets Preview').toBe(1);
	expect(await preview.getAttribute('data-facing'), 'middle click never changes facing').toBe(
		facing
	);
	expect(
		await preview.getAttribute('data-position'),
		'middle click never moves the character'
	).toBe(position);

	// Native move select and the scrolling rail keep their own input.
	const move = page.getByRole('combobox', { name: 'Move', exact: true });
	const options = await move.locator('option').count();
	expect(options, 'the fixture has more than one move').toBeGreaterThan(1);
	const beforeMove = await move.inputValue();
	const nextMove = await move
		.locator('option')
		.evaluateAll(
			(nodes, current) =>
				nodes.map((node) => (node as HTMLOptionElement).value).find((value) => value !== current) ??
				current,
			beforeMove
		);
	await move.selectOption(nextMove);
	await expect(move).toHaveValue(nextMove);
	expect((await readScene(preview)).zoom, 'a native select never zooms').toBe(1);
	const rail = page.locator('#wardrobe-list');
	await expect(rail).toBeVisible();
	expect(
		await rail.evaluate((list) => list.scrollHeight > list.clientHeight + 1),
		'the fixture makes the wardrobe rail scrollable'
	).toBe(true);
	const railBox = (await rail.boundingBox())!;
	await page.mouse.move(railBox.x + railBox.width / 2, railBox.y + railBox.height / 2);
	await page.mouse.wheel(0, 240);
	await expect.poll(() => rail.evaluate((list) => list.scrollTop)).toBeGreaterThan(0);
	expect((await readScene(preview)).zoom, 'wheel over a rail scrolls it instead of zooming').toBe(
		1
	);
});

test('wheel bursts compose synchronously instead of reading a stale frame', async ({ page }) => {
	await page.goto('/');
	await expect(page.locator('.customize-action')).toBeEnabled({ timeout: 20_000 });
	await page.locator('.customize-action').click();
	await expect(world(page)).toBeVisible();
	await page
		.getByRole('group', { name: 'Character view', exact: true })
		.getByRole('button', { name: 'Preview', exact: true })
		.click();
	const host = world(page);
	await resetZoom(page, host);
	const bounds = await expectSceneBounds(host, 'wheel burst');
	const expected = Math.exp(0.04);
	expect(bounds.max, 'the wheel burst is not clamped by max').toBeGreaterThan(expected + 1e-6);
	const immediate = await page.evaluate(async () => {
		const state = await import(/* @vite-ignore */ String('/src/studio/experience/state.svelte.ts'));
		const target = document.querySelector('.world-stage')!;
		for (let index = 0; index < 2; index++)
			target.dispatchEvent(
				new WheelEvent('wheel', { deltaY: -10, bubbles: true, cancelable: true })
			);
		return state.experience.sceneZoom;
	});
	expect(immediate, 'both wheel events use the value the first one produced').toBeCloseTo(
		expected,
		8
	);
	await settle(page);
	await expect
		.poll(async () => (await readScene(host)).zoom, {
			message: 'the rendered camera catches up to the burst without losing a step'
		})
		.toBeCloseTo(expected, 6);
});

test('Preview keeps the selected facing at one scale while every lineup size from 1 to 5 fits', async ({
	page
}, info) => {
	await page.setViewportSize({ width: 3840, height: 1080 });
	const ids = await seedFacingCharacters(page);
	const host = world(page);
	const lineup = async () =>
		(await host.getAttribute('data-lineup'))?.split(' ').filter(Boolean) ?? [];
	for (let count = 1; count <= 5; count++) {
		const target = ids.find((entry) => entry.name === `Zoom facings ${count}`)!;
		await page
			.locator('.character-row')
			.filter({ hasText: `Zoom facings ${count}` })
			.click();
		await expect(page.locator('.cast-character.chosen')).toHaveAttribute(
			'data-character-id',
			target.id
		);
		await page.locator('.customize-action').click();
		await expect(host).toBeVisible();
		const pause = page.getByRole('button', { name: 'Pause', exact: true });
		if (await pause.isVisible()) await pause.click();
		await resetZoom(page, host);
		await expect
			.poll(async () => (await lineup()).length, {
				message: `${count} direction character: Preview shows ${count} facings`
			})
			.toBe(count);
		const baseBackdrop = await backdrop(page);
		const baseActor = await actorBounds(page);
		const baseLineup = await lineup();
		const facing = await host.getAttribute('data-facing');
		expect(baseLineup, `${count} facings: the selected facing is in the lineup`).toContain(facing);
		expect(baseLineup.length, `${count} facings: the requested lineup is complete`).toBe(count);

		await zoomStep(page, host, 'in');
		await expect.poll(async () => (await readScene(host)).zoom).toBeGreaterThan(1);
		const stepped = await readScene(host);
		await expectBackdropFactor(page, baseBackdrop, stepped.zoom, `${count} facings: one step`);
		await expect
			.poll(async () => (await actorBounds(page)).height / baseActor.height, {
				message: `${count} facings: the selected actor keeps one scale with the camera`
			})
			.toBeCloseTo(stepped.zoom, 1);
		const steppedLineup = await lineup();
		expect(steppedLineup, `${count} facings at zoom: the selected facing survives`).toContain(
			facing
		);
		expect(
			steppedLineup.length,
			`${count} facings at zoom: companions are never added`
		).toBeLessThanOrEqual(baseLineup.length);

		await zoomToMax(page, host);
		const top = await readScene(host);
		expect(top.zoom, `${count} facings: max is the geometry fit`).toBeCloseTo(top.max, 6);
		await expectBackdropFactor(page, baseBackdrop, top.zoom, `${count} facings: max`);
		const maxLineup = await lineup();
		expect(maxLineup, `${count} facings at max: the selected facing survives`).toContain(facing);
		expect(maxLineup.length, `${count} facings at max: at least one actor remains`).toBeGreaterThan(
			0
		);
		expect(maxLineup.length, `${count} facings at max: no companion is added`).toBeLessThanOrEqual(
			baseLineup.length
		);
		const stage = await page
			.locator('.experience-stage')
			.evaluate((element) => element.getBoundingClientRect().toJSON());
		const playbackTop = await page
			.locator('.experience-playback')
			.evaluate((bar) => bar.getBoundingClientRect().top);
		const maxActor = await actorBounds(page);
		expect(
			maxActor.left,
			`${count} facings: visible actors stay inside the stage`
		).toBeGreaterThanOrEqual(stage.left - 1);
		expect(
			maxActor.right,
			`${count} facings: visible actors stay inside the stage`
		).toBeLessThanOrEqual(stage.right + 1);
		expect(
			maxActor.top,
			`${count} facings: visible actors stay under the header`
		).toBeGreaterThanOrEqual(stage.top - 1);
		expect(
			maxActor.bottom,
			`${count} facings: visible actors stay above the playback bar`
		).toBeLessThanOrEqual(playbackTop + 1);
		await expect
			.poll(async () => (await actorBounds(page)).height / baseActor.height, {
				message: `${count} facings: the selected actor's scale is stable at max`
			})
			.toBeCloseTo(top.zoom, 1);
		await shot(page, info, `facings-${count}-max`);

		// Reset restores the exact base offsets, so culling is presentation only.
		await resetZoom(page, host);
		const restored = await actorBounds(page);
		expect(
			Math.abs(restored.left - baseActor.left),
			`${count} facings: reset restores the lineup`
		).toBeLessThan(1);
		expect(
			Math.abs(restored.top - baseActor.top),
			`${count} facings: reset restores the lineup`
		).toBeLessThan(1);
		expect(await lineup(), `${count} facings: reset restores every companion`).toEqual(baseLineup);
		await page.locator('.header-back').click();
		await expect(page.locator('.customize-action')).toBeVisible();
	}
});

test.describe('touch character swipe', () => {
	test.use({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });

	test('a one-finger sideways swipe steps through characters; short, vertical and pinch gestures never do', async ({
		page,
		context,
		browserName
	}) => {
		test.skip(browserName !== 'chromium', 'Real CDP touch dispatch needs Chromium');
		await seedCharacters(page, 3);
		const host = selection(page);
		await resetZoom(page, host);
		const chosen = page.locator('.cast-character.chosen');
		const cdp = await context.newCDPSession(page);
		const send = (
			type: 'touchStart' | 'touchMove' | 'touchEnd',
			points: { x: number; y: number; id: number }[]
		) => cdp.send('Input.dispatchTouchEvent', { type, touchPoints: points });
		const drag = async (fingers: { from: [number, number]; to: [number, number] }[]) => {
			const at = (pick: 'from' | 'to') =>
				fingers.map((finger, id) => ({
					x: finger[pick][0],
					y: finger[pick][1],
					id: id + 1,
					radiusX: 1,
					radiusY: 1
				}));
			for (let count = 1; count <= fingers.length; count++)
				await send('touchStart', at('from').slice(0, count));
			for (let step = 0; step < 3; step++) await send('touchMove', at('to'));
			await send('touchEnd', []);
			await settle(page);
		};
		// Start on the empty floor beside the selected character, as a casual swipe would.
		const box = (await host.boundingBox())!;
		const y = Math.round(box.y + box.height * 0.3),
			x = Math.round(box.x + box.width / 2);
		const start = await chosen.getAttribute('data-character-id');

		// A finger moving left brings the next character, as if dragging the cast along; moving right goes back.
		await drag([{ from: [x + 90, y], to: [x - 90, y] }]);
		await expect(chosen).not.toHaveAttribute('data-character-id', start!);
		await expect(world(page), 'a swipe never opens Customize').toHaveCount(0);
		await drag([{ from: [x - 90, y], to: [x + 90, y] }]);
		await expect(chosen).toHaveAttribute('data-character-id', start!);

		await drag([{ from: [x, y], to: [x - 30, y] }]);
		await drag([{ from: [x, y], to: [x - 60, y + 120] }]);
		await drag([
			{ from: [x - 30, y], to: [x - 120, y] },
			{ from: [x + 30, y], to: [x + 120, y] }
		]);
		expect(
			await chosen.getAttribute('data-character-id'),
			'short, vertical and pinch gestures never step'
		).toBe(start);
		expect((await readScene(host)).zoom, 'the pinch zoomed in instead').toBeGreaterThan(1);
		await expect(world(page)).toHaveCount(0);
	});
});

test.describe('touch scene zoom', () => {
	test.use({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });

	test('pinch starting on actors zooms without activating, suppresses the stale click and clears on cancel', async ({
		page,
		context,
		browserName
	}, info) => {
		test.skip(browserName !== 'chromium', 'Real CDP touch dispatch needs Chromium');
		const ids = await seedCharacters(page, 2);
		const host = selection(page);
		await resetZoom(page, host);
		const chosen = page.locator('.cast-character.chosen');
		const selectedId = await chosen.getAttribute('data-character-id');
		expect(selectedId).toBe(ids[0]);
		const cdp = await context.newCDPSession(page);
		const touch = (
			type: 'touchStart' | 'touchMove' | 'touchEnd' | 'touchCancel',
			points: { x: number; y: number; id: number }[]
		) =>
			cdp.send('Input.dispatchTouchEvent', {
				type,
				touchPoints: points.map((point) => ({ ...point, radiusX: 1, radiusY: 1 }))
			});
		const pinch = async (center: { x: number; y: number }, from: number, to: number) => {
			const a = { x: center.x - from, y: center.y, id: 1 };
			const b = { x: center.x + from, y: center.y, id: 2 };
			const movedA = { ...a, x: center.x - to };
			const movedB = { ...b, x: center.x + to };
			await touch('touchStart', [a]);
			await touch('touchStart', [a, b]);
			await touch('touchMove', [movedA, movedB]);
			await touch('touchMove', [movedA, movedB]);
			await touch('touchEnd', []);
		};
		const actorBox = (await chosen.boundingBox())!;
		const center = {
			x: Math.round(actorBox.x + actorBox.width / 2),
			y: Math.round(actorBox.y + actorBox.height / 2)
		};
		try {
			await pinch(center, 14, 52);
			await settle(page);
			const zoomed = await readScene(host);
			expect(zoomed.zoom, 'a touch pinch zooms the selection camera').toBeGreaterThan(1);
			expect(
				await chosen.getAttribute('data-character-id'),
				'a pinch never selects another actor'
			).toBe(selectedId);
			await expect(world(page)).toHaveCount(0);
			await expect(page.locator('.customize-action')).toBeVisible();
			await shot(page, info, 'touch-selection-pinched');

			// The pinch's compatibility click is suppressed, but the next deliberate tap still opens the character.
			await expect
				.poll(() => world(page).count(), {
					timeout: 700,
					message: 'a stale pinch click must not activate the actor'
				})
				.toBe(0);
			const afterPinch = (await chosen.boundingBox())!;
			// The fix reset the one-shot click latch before the guards: a caption control inside the selection world
			// must work on the very first pointerdown after a pinch.
			await page.locator('.selected-name').click();
			await expect(page.locator('#project-menu')).toBeVisible();
			await expect
				.poll(() =>
					page.locator('#project-menu').evaluate((menu) => menu.contains(document.activeElement))
				)
				.toBe(true);
			await page.keyboard.press('Escape');
			await expect(page.locator('#project-menu')).not.toBeVisible();
			const tap = {
				x: Math.round(afterPinch.x + afterPinch.width / 2),
				y: Math.round(afterPinch.y + afterPinch.height / 2),
				id: 3
			};
			await touch('touchStart', [tap]);
			await touch('touchEnd', []);
			await expect(world(page)).toBeVisible();

			// Preview: pinch over the world changes only the camera, not facing, position or mode.
			const previewHost = world(page);
			await expectSceneBounds(previewHost, 'touch preview');
			await resetZoom(page, previewHost);
			const facing = await previewHost.getAttribute('data-facing');
			const position = await previewHost.getAttribute('data-position');
			const worldBox = (await previewHost.boundingBox())!;
			const previewCenter = {
				x: Math.round(worldBox.x + worldBox.width / 2),
				y: Math.round(worldBox.y + worldBox.height / 2)
			};
			await pinch(previewCenter, 18, 58);
			await settle(page);
			expect((await readScene(previewHost)).zoom, 'Preview pinch zooms').toBeGreaterThan(1);
			expect(await previewHost.getAttribute('data-facing'), 'pinch never changes facing').toBe(
				facing
			);
			expect(
				await previewHost.getAttribute('data-position'),
				'pinch never moves the character'
			).toBe(position);
			await expect(
				page
					.getByRole('group', { name: 'Character view', exact: true })
					.getByRole('button', { name: 'Preview', exact: true })
			).toHaveAttribute('aria-pressed', 'true');

			// A cancel clears two-finger state without rolling the camera back; a real tap still lands.
			await resetZoom(page, previewHost);
			const beforeCancel = (await readScene(previewHost)).zoom;
			expect(beforeCancel, 'cancel regression starts from automatic fit').toBe(1);
			await touch('touchStart', [{ ...previewCenter, x: previewCenter.x - 16, id: 4 }]);
			await touch('touchStart', [
				{ ...previewCenter, x: previewCenter.x - 16, id: 4 },
				{ ...previewCenter, x: previewCenter.x + 16, id: 5 }
			]);
			await touch('touchMove', [
				{ ...previewCenter, x: previewCenter.x - 50, id: 4 },
				{ ...previewCenter, x: previewCenter.x + 50, id: 5 }
			]);
			const during = (await readScene(previewHost)).zoom;
			expect(during, 'the second pinch moves the camera before it is canceled').toBeGreaterThan(
				beforeCancel
			);
			await touch('touchCancel', []);
			await settle(page);
			expect((await readScene(previewHost)).zoom, 'cancel does not roll the camera back').toBe(
				during
			);
			const face = page.getByRole('button', { name: 'Face north', exact: true });
			const faceBox = (await face.boundingBox())!;
			await touch('touchStart', [
				{
					x: Math.round(faceBox.x + faceBox.width / 2),
					y: Math.round(faceBox.y + faceBox.height / 2),
					id: 6
				}
			]);
			await touch('touchEnd', []);
			await expect(previewHost).toHaveAttribute('data-facing', 'north');
		} finally {
			await cdp.detach();
		}
	});
});
