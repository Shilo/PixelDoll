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
	[1920, 951],
	[574, 951],
	[951, 574],
	[2560, 1080],
	[1080, 2560]
] as const;
const THEMES = ['dark', 'light'] as const;
// Both plates share one pixel size and one camera; a theme changes only its horizon, floor and focal points, and that
// placement is checked for both themes at every size above in test/unit/experience-zoom.test.ts. The dark plate runs
// every size here; the light plate proves its wiring on the smallest phone and the two most extreme shapes.
const SIZES_LIGHT = [
	[320, 568],
	[2560, 1080],
	[1080, 2560]
] as const;

const selection = (page: Page) => page.locator('.selection-world');
const world = (page: Page) => page.locator('.world-stage');
const zoomGroup = (page: Page) => page.getByRole('group', { name: 'Scene zoom', exact: true });

async function usableScene(page: Page, preview = false) {
	return page.evaluate((studio) => {
		const stage = document
			.querySelector(studio ? '.experience-stage' : '.cast')!
			.getBoundingClientRect();
		const header = document.querySelector('.experience-header')!.getBoundingClientRect();
		const playback = document.querySelector('.experience-playback')?.getBoundingClientRect();
		return {
			x: (stage.left + stage.right) / 2,
			top: studio ? stage.top + (stage.width <= 430 ? 66 : 16) : header.bottom + 16,
			bottom: studio ? playback!.top - 2 : stage.bottom
		};
	}, preview);
}

function framedCenter(
	base: { x: number; center: number; ground: number },
	area: { x: number; top: number; bottom: number },
	factor: number
) {
	const height = 2 * (base.ground - base.center);
	const span = area.bottom - area.top;
	const progress = Math.min(1, (factor - 1) / Math.max(0.25, span / height - 1));
	return {
		x: base.x + (area.x - base.x) * progress,
		y: base.center + ((area.top + area.bottom) / 2 - base.center) * progress
	};
}

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
	await expect
		.poll(() =>
			page.evaluate(async (ids: string[]) => {
				const { stills } = await import(
					/* @vite-ignore */ String('/src/studio/experience/thumbnails.svelte.ts')
				);
				return ids.every((id) => !!stills.get(id)?.image);
			}, ids)
		)
		.toBe(true);
	await settle(page);
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
	/** The absolute scale shown, in CSS px per art px (1 is the character's true size). */
	zoom: number;
	/** This screen's automatic fit, as an absolute scale. */
	fit: number;
	min: number;
	max: number;
}

async function readScene(host: Locator): Promise<SceneState> {
	const raw = await host.evaluate((node) => ({
		zoom: node.dataset.sceneZoom,
		fit: node.dataset.sceneFit,
		min: node.dataset.sceneMin,
		max: node.dataset.sceneMax
	}));
	const state = {
		zoom: Number(raw.zoom),
		fit: Number(raw.fit),
		min: Number(raw.min),
		max: Number(raw.max)
	};
	if (![state.zoom, state.fit, state.min, state.max].every(Number.isFinite))
		throw new Error(
			`Scene camera is not exposed as finite numbers: zoom=${raw.zoom} fit=${raw.fit} min=${raw.min} max=${raw.max}`
		);
	return state;
}

async function waitForScene(host: Locator) {
	for (const name of ['zoom', 'fit', 'min', 'max'])
		await expect(host).toHaveAttribute(`data-scene-${name}`, /^\d+(\.\d+)?$/);
}

/** The reset button reads the absolute scale as a whole percentage. */
const percent = (scale: number) => `${Math.round(scale * 100)}%`;

/**
 * The contract's ladder: every whole multiple from 100%, with even steps between n and n + 1 while a step would
 * otherwise exceed 25% (100, 125, 150, 175, 200, 250, 300, 350, 400, 500, 600, ...).
 */
function ladder(max: number) {
	const levels: number[] = [];
	for (let whole = 1; whole <= max; whole++) {
		const parts = Math.ceil(4 / whole);
		for (let part = 0; part < parts; part++)
			if (whole + part / parts <= max) levels.push(whole + part / parts);
	}
	return levels;
}

/**
 * Absolute bounds: 100% (or a smaller fit) up to a shared ceiling of at least twice the fit, a whole multiple that never
 * shrinks during the session.
 */
async function expectSceneBounds(host: Locator, label: string, ceiling = 0) {
	await waitForScene(host);
	const state = await readScene(host);
	const { zoom, fit, min, max } = state;
	expect(fit, `${label}: the fit is a real scale`).toBeGreaterThan(0);
	expect(min, `${label}: zoom out reaches true size, or the fit when that is smaller`).toBeCloseTo(
		Math.min(1, fit),
		9
	);
	expect(Number.isInteger(max), `${label}: the ceiling is a whole multiple (${max})`).toBe(true);
	expect(max, `${label}: the ceiling is at least twice the fit`).toBeGreaterThanOrEqual(
		2 * fit - 1e-9
	);
	expect(max, `${label}: the shared ceiling never shrinks`).toBeGreaterThanOrEqual(ceiling);
	expect(zoom, `${label}: zoom stays inside the camera bounds`).toBeGreaterThanOrEqual(min - 1e-9);
	expect(zoom, `${label}: zoom stays inside the camera bounds`).toBeLessThanOrEqual(max + 1e-9);
	return state;
}

/** Every level a step may land on: the contract ladder, the bounds and any screen's fit. */
function expectLadderLevel(level: number, state: SceneState, fits: number[], label: string) {
	const allowed = [...ladder(state.max), state.min, state.max, ...fits];
	expect(
		allowed.some((value) => Math.abs(value - level) < 1e-9),
		`${label}: ${level} is a ladder level, a bound or a fit (${allowed.join(', ')})`
	).toBe(true);
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

async function castBody(page: Page) {
	return page.evaluate(async () => {
		const { stills } = await import(
			/* @vite-ignore */ String('/src/studio/experience/thumbnails.svelte.ts')
		);
		const chosen = document.querySelector<HTMLElement>('.cast-character.chosen')!;
		const still = stills.get(chosen.dataset.characterId!)!;
		const rect = chosen.querySelector('canvas.sprite')!.getBoundingClientRect();
		const scale = rect.width / still.image!.w;
		const x = rect.left + (still.frame.x + still.body.w / 2 - still.body.x) * scale;
		const ground = rect.top + (still.frame.y + still.body.h - still.body.y) * scale;
		return { x, ground, center: ground - (still.body.h * scale) / 2 };
	});
}

/** Waits for the carousel's finite transitions, so a measurement reads the settled cast. */
async function castSettled(page: Page) {
	await page.evaluate(async () => {
		await Promise.all(
			document
				.getAnimations()
				.filter((animation) => animation.effect?.getComputedTiming().iterations !== Infinity)
				.map((animation) => animation.finished.catch(() => undefined))
		);
		await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
	});
}

/**
 * The selected character as drawn on Characters: CSS px per art px (its canvas's on-screen width over its still's
 * width, camera included) and its painted, opaque height in CSS px.
 */
async function castDrawn(page: Page) {
	await castSettled(page);
	return page.evaluate(async () => {
		const { stills } = await import(
			/* @vite-ignore */ String('/src/studio/experience/thumbnails.svelte.ts')
		);
		const chosen = document.querySelector<HTMLElement>('.cast-character.chosen');
		const canvas = chosen?.querySelector<HTMLCanvasElement>('canvas.sprite');
		if (!chosen || !canvas) throw new Error('No selected cast sprite to measure');
		const width = stills.get(chosen.dataset.characterId!)?.image?.w;
		if (!width) throw new Error('The selected character has no still to measure against');
		const rect = canvas.getBoundingClientRect();
		const pixels = canvas.getContext('2d')!.getImageData(0, 0, canvas.width, canvas.height).data;
		let top = canvas.height,
			bottom = 0;
		for (let y = 0; y < canvas.height; y++)
			for (let x = 0; x < canvas.width; x++)
				if (pixels[(y * canvas.width + x) * 4 + 3] >= 128) {
					top = Math.min(top, y);
					bottom = Math.max(bottom, y + 1);
				}
		if (!bottom) throw new Error('The selected cast sprite is empty');
		return {
			scale: rect.width / width,
			height: ((bottom - top) * rect.height) / canvas.height
		};
	});
}

/** The selected sprite is drawn at exactly the absolute scale the scene reports. */
async function expectCastScale(page: Page, scale: number, label: string) {
	await expect
		.poll(async () => (await castDrawn(page)).scale / scale, {
			message: `${label}: the selected sprite draws ${percent(scale)} of its art`
		})
		.toBeCloseTo(1, 2);
}

async function castRects(page: Page) {
	return page.evaluate(() =>
		[
			...document.querySelectorAll<HTMLCanvasElement>('.cast-character:not([inert]) canvas.sprite')
		].map((canvas) => {
			const rect = canvas.getBoundingClientRect();
			const data = canvas.getContext('2d')!.getImageData(0, 0, canvas.width, canvas.height).data;
			let left = canvas.width,
				top = canvas.height,
				right = 0,
				bottom = 0;
			for (let row = 0; row < canvas.height; row++)
				for (let column = 0; column < canvas.width; column++)
					if (data[(row * canvas.width + column) * 4 + 3]) {
						left = Math.min(left, column);
						right = Math.max(right, column + 1);
						top = Math.min(top, row);
						bottom = Math.max(bottom, row + 1);
					}
			const scale = rect.width / canvas.width;
			return {
				chosen: !!canvas.closest('.chosen'),
				left: rect.left + left * scale,
				top: rect.top + top * scale,
				right: rect.left + right * scale,
				bottom: rect.top + bottom * scale,
				width: (right - left) * scale,
				height: (bottom - top) * scale
			};
		})
	);
}

/** Painted actor bounds as screen pixels, read from the composited canvas (device pixels divided out). */
async function actorBounds(page: Page, minimumAlpha = 128) {
	return page.evaluate((minimumAlpha) => {
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
				if (pixels[(y * canvas.width + x) * 4 + 3] >= minimumAlpha) {
					left = Math.min(left, x);
					top = Math.min(top, y);
					right = Math.max(right, x + 1);
					bottom = Math.max(bottom, y + 1);
				}
		const rect = canvas.getBoundingClientRect();
		const scaleX = rect.width / canvas.width,
			scaleY = rect.height / canvas.height;
		if (!right || !bottom) throw new Error('The actor canvas is empty');
		const uniforms = Reflect.get(window, '__groundUniforms') as
			Record<string, number | number[]> | undefined;
		const stage = document.querySelector<HTMLElement>('.world-stage');
		return {
			left: rect.left + left * scaleX,
			top: rect.top + top * scaleY,
			right: rect.left + right * scaleX,
			bottom: rect.top + bottom * scaleY,
			width: (right - left) * scaleX,
			height: (bottom - top) * scaleY,
			ground: uniforms
				? {
						values: structuredClone(uniforms),
						position: stage!.dataset.position!.split(',').map(Number),
						zoom: Number(stage!.dataset.sceneZoom),
						fit: Number(stage!.dataset.sceneFit),
						dpr: devicePixelRatio
					}
				: undefined
		};
	}, minimumAlpha);
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
	for (let step = 0; step < 80; step++) {
		const { zoom, min, max } = await readScene(host);
		if (direction === 'in' ? zoom >= max - 1e-9 : zoom <= min + 1e-9) break;
		await zoomStep(page, host, direction);
	}
	// Preview retains a reset for chosen inspection composition even when its scale equals the automatic fit.
	const end = await readScene(host);
	if (end.zoom === end.fit)
		await expect(zoomGroup(page)).toHaveCount(
			(await host.evaluate((node) => node.classList.contains('world-stage'))) ? 1 : 0
		);
	else
		await expect(
			zoomGroup(page).getByRole('button', { name: `Zoom ${direction}`, exact: true })
		).toBeDisabled();
}

const zoomToMax = (page: Page, host: Locator) => zoomToEnd(page, host, 'in');
const zoomToMin = (page: Page, host: Locator) => zoomToEnd(page, host, 'out');

/** Back to the screen's automatic fit, which shows its own absolute scale and no controls. */
async function resetZoom(page: Page, host: Locator) {
	const reset = zoomGroup(page).getByRole('button', { name: 'Reset scene zoom', exact: true });
	if (await reset.isVisible()) await reset.click();
	await expect
		.poll(async () => {
			const { zoom, fit } = await readScene(host);
			return zoom === fit;
		})
		.toBe(true);
	await expect(zoomGroup(page), 'the automatic fit hides the zoom controls').toHaveCount(0);
	await settle(page);
}

/** The scene shows its own automatic fit (which may change with the character, move or screen size). */
async function expectAtFit(host: Locator, message: string) {
	await expect
		.poll(
			async () => {
				const { zoom, fit } = await readScene(host);
				return zoom - fit;
			},
			{ message }
		)
		.toBe(0);
}

/** A focused-scene key; the next frame publishes the camera. */
async function press(page: Page, host: Locator, key: string) {
	await host.focus();
	await page.keyboard.press(key);
	await settle(page);
	return (await readScene(host)).zoom;
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
	const initial = await expectSceneBounds(host, 'selection initial');
	expect(initial.zoom, 'selection opens at its automatic fit').toBe(initial.fit);
	let ceiling = initial.max;

	for (const theme of THEMES.filter((value) => !onlyTheme || value === onlyTheme))
		for (const [width, height] of sizes) {
			const label = `${theme} ${width}x${height}`;
			await page.setViewportSize({ width, height });
			await setTheme(page, theme);
			await settle(page);
			await resetZoom(page, host);
			const base = await expectSceneBounds(host, label, ceiling);
			ceiling = base.max;
			expect(base.zoom, `${label}: reset is exactly automatic fit`).toBe(base.fit);
			await expect(zoomGroup(page), `${label}: the fit shows no zoom controls`).toHaveCount(0);
			// The fit reads its real absolute scale: the selected sprite draws exactly that many CSS px per art px.
			await expectCastScale(page, base.zoom, `${label}: fit`);
			const baseBackdrop = await backdrop(page);
			expectCovered(baseBackdrop, `${label}: automatic fit covers the scene`);
			await castSettled(page);
			const baseCast = await chosenRect(page);
			const baseBody = await castBody(page);
			expect(
				await page
					.locator('.scene-backdrop')
					.evaluate((node) => getComputedStyle(node).imageRendering)
			).toBe('pixelated');

			// One step proves the backdrop and the cast move on the same camera factor.
			await zoomStep(page, host, 'in');
			const stepped = await readScene(host);
			await expect(zoomGroup(page), `${label}: zooming shows the controls`).toBeVisible();
			await expect(
				zoomGroup(page).getByRole('button', { name: 'Reset scene zoom', exact: true }),
				`${label}: the controls read the absolute scale`
			).toHaveText(percent(stepped.zoom));
			const controls = await zoomGroup(page).boundingBox();
			expect(controls, `${label}: zoom controls have a real box`).not.toBeNull();
			expect(controls!.x, `${label}: zoom controls stay on screen`).toBeGreaterThanOrEqual(0);
			expect(
				controls!.x + controls!.width,
				`${label}: zoom controls stay on screen`
			).toBeLessThanOrEqual(width + 0.5);
			expect(stepped.zoom, `${label}: zoom in leaves automatic fit`).toBeGreaterThan(base.fit);
			expect(
				stepped.zoom,
				`${label}: one step in never skips the next whole multiple`
			).toBeLessThanOrEqual(Math.floor(base.fit) + 1 + 1e-9);
			expectLadderLevel(stepped.zoom, stepped, [base.fit], `${label}: one step`);
			const factor = stepped.zoom / base.zoom;
			await expectBackdropFactor(page, baseBackdrop, factor, `${label}: one step`);
			await castSettled(page);
			await expect
				.poll(async () => (await chosenRect(page)).width / baseCast.width, {
					message: `${label}: the cast follows the same camera factor`
				})
				.toBeCloseTo(factor, 3);
			await expectCastScale(page, stepped.zoom, `${label}: one step`);
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

			// At the ceiling (at least twice the fit) the selected actor may outgrow the screen, as zoom does, but stays
			// centered on the camera's pivot; companions that would leave the clearance are culled, so every visible
			// companion stays on screen sideways and grounded.
			await zoomToMax(page, host);
			const top = await readScene(host);
			expect(top.zoom, `${label}: zoom in stops exactly at the shared ceiling`).toBe(top.max);
			expect(top.max, `${label}: the ceiling is the one the screen opened with`).toBe(base.max);
			await expectBackdropFactor(page, baseBackdrop, top.zoom / base.zoom, `${label}: max`);
			expectCovered(await backdrop(page), `${label}: max still covers the scene`);
			const headerBottom = await page
				.locator('.experience-header')
				.evaluate((header) => header.getBoundingClientRect().bottom);
			const actors = await castRects(page);
			const expectedCenter = framedCenter(baseBody, await usableScene(page), top.zoom / base.zoom);
			expect(actors.length, `${label}: all current actors are measured`).toBeGreaterThan(0);
			for (const actor of actors) {
				if (actor.chosen) {
					const body = await castBody(page);
					expect(body.x, `${label}: the painted body stays horizontally centered`).toBeCloseTo(
						expectedCenter.x,
						0
					);
					expect(
						body.center,
						`${label}: enlargement centers the painted body within usable space`
					).toBeCloseTo(expectedCenter.y, 0);
					continue;
				}
				expect(actor.left, `${label}: no companion crosses the left edge`).toBeGreaterThanOrEqual(
					-1
				);
				expect(actor.right, `${label}: no companion crosses the right edge`).toBeLessThanOrEqual(
					width + 1
				);
				expect(actor.top, `${label}: no companion rises into the header`).toBeGreaterThanOrEqual(
					headerBottom + 14
				);
				expect(actor.bottom, `${label}: no companion drops below the stage`).toBeLessThanOrEqual(
					height + 1
				);
			}
			if (top.zoom > base.zoom * 1.08) {
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

			// Past the background's cover limit only the characters shrink, down to true size, so zooming out never
			// shows a seam.
			await resetZoom(page, host);
			await zoomToMin(page, host);
			const bottom = await readScene(host);
			expect(bottom.zoom, `${label}: zoom out stops exactly at min`).toBe(bottom.min);
			expect(bottom.min, `${label}: characters shrink to true size`).toBe(Math.min(1, base.fit));
			const lowest = await backdrop(page);
			expectCovered(lowest, `${label}: min covers the scene`);
			expect(
				lowest.image.width / baseBackdrop.image.width,
				`${label}: the background stops at or above the characters' zoom`
			).toBeGreaterThanOrEqual(bottom.zoom / base.zoom - 1e-3);
			await castSettled(page);
			await expect
				.poll(async () => (await chosenRect(page)).width / baseCast.width, {
					message: `${label}: the cast shrinks by the camera factor`
				})
				.toBeCloseTo(bottom.zoom / base.zoom, 3);
			await expectCastScale(page, bottom.zoom, `${label}: min`);
			const grounded = await castBody(page);
			expect(grounded.x, `${label}: the grounded body keeps its horizontal position`).toBeCloseTo(
				baseBody.x,
				0
			);
			expect(grounded.ground, `${label}: zoom-out keeps the real ground point fixed`).toBeCloseTo(
				baseBody.ground,
				0
			);

			await resetZoom(page, host);
			const final = await readScene(host);
			expect(final.zoom, `${label}: final reset is exactly the fit`).toBe(base.fit);
		}
}

test('selection zoom is a bounded uniform camera that fits every actor and resets to exactly the fit (dark)', async ({
	page
}, info) => {
	await verifySelectionZoom(page, info, SIZES_A, 'dark');
});

test('selection zoom holds the same camera on rotated screens (dark)', async ({ page }, info) => {
	await verifySelectionZoom(page, info, SIZES_B, 'dark');
});

test('selection zoom holds the same camera on the light plate', async ({ page }, info) => {
	await verifySelectionZoom(page, info, SIZES_LIGHT, 'light');
});

async function verifyPreviewZoomMatrix(
	page: Page,
	info: TestInfo,
	sizes: readonly (readonly [number, number])[],
	theme: (typeof THEMES)[number]
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
	const initial = await expectSceneBounds(host, 'preview initial');
	expect(initial.zoom, 'Preview opens at its automatic fit').toBe(initial.fit);
	let ceiling = initial.max;

	for (const [width, height] of sizes) {
		const label = `preview ${theme} ${width}x${height}`;
		await page.setViewportSize({ width, height });
		await setTheme(page, theme);
		await settle(page);
		await resetZoom(page, host);
		const base = await expectSceneBounds(host, label, ceiling);
		ceiling = base.max;
		expect(base.zoom, `${label}: reset is exactly automatic fit`).toBe(base.fit);
		const baseBackdrop = await backdrop(page);
		expectCovered(baseBackdrop, `${label}: automatic fit covers the scene`);
		await shot(page, info, `${theme}-${width}x${height}-fit`);
		await zoomToMax(page, host);
		const top = await readScene(host);
		await expectBackdropFactor(page, baseBackdrop, top.zoom / base.zoom, `${label}: max`);
		expectCovered(await backdrop(page), `${label}: max covers the scene`);
		expect(top.zoom, `${label}: Preview zooms in to the shared ceiling`).toBe(base.max);
		await shot(page, info, `preview-${theme}-${width}x${height}-max`);
		await zoomToMin(page, host);
		expect((await readScene(host)).zoom, `${label}: characters shrink to true size`).toBe(
			Math.min(1, base.fit)
		);
		expectCovered(await backdrop(page), `${label}: min covers the scene`);
		await resetZoom(page, host);
	}
}

test('Preview zoom keeps every screen covering and resets on portrait and small landscape screens (dark)', async ({
	page
}, info) => {
	await verifyPreviewZoomMatrix(page, info, SIZES_A, 'dark');
});

test('Preview zoom keeps every rotated screen covering (dark)', async ({ page }, info) => {
	await verifyPreviewZoomMatrix(page, info, SIZES_B, 'dark');
});

test('Preview zoom keeps the light plate covering', async ({ page }, info) => {
	await verifyPreviewZoomMatrix(page, info, SIZES_LIGHT, 'light');
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
	const initial = await expectSceneBounds(host, 'preview 1440x900');
	expect(initial.zoom, 'Preview opens at its fit').toBe(initial.fit);
	await expect.poll(async () => (await actorBounds(page)).width).toBeGreaterThan(0);
	const baseBackdrop = await backdrop(page);
	const baseActor = await actorBounds(page, 255);
	await zoomStep(page, host, 'in');
	await expect.poll(async () => (await readScene(host)).zoom).toBeGreaterThan(initial.fit);
	const stepped = await readScene(host);
	const factor = stepped.zoom / initial.zoom;
	await expectBackdropFactor(page, baseBackdrop, factor, 'preview one step');
	await expect
		.poll(async () => (await actorBounds(page, 255)).height / baseActor.height, {
			message: 'preview: painted actors use the same camera factor as the backdrop'
		})
		.toBeCloseTo(factor, 1);
	await resetZoom(page, host);
	await zoomToMax(page, host);
	const top = await readScene(host);
	expect(top.zoom).toBe(top.max);
	await expectBackdropFactor(page, baseBackdrop, top.zoom / initial.zoom, 'preview max');
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
	const pivot = (await host.getAttribute('data-scene-anchor'))!.split(',').map(Number);
	expect(
		pivot[1],
		'preview max: enlargement pivots above the ground at the body center'
	).toBeLessThan(playbackTop - baseActor.height / 4);
	expect(bounds.height, 'preview max: the painted actor zooms in').toBeGreaterThan(
		baseActor.height + 0.5
	);
	await shot(page, info, 'preview-1440x900-max');
});

test('asymmetric padded artwork enlarges around its body and shrinks around its real ground on both screens', async ({
	page
}, info) => {
	await page.addInitScript(() => {
		const names = new WeakMap<WebGLUniformLocation, string>();
		const values: Record<string, number | number[]> = {};
		Reflect.set(window, '__groundUniforms', values);
		const prototype = WebGL2RenderingContext.prototype;
		const location = prototype.getUniformLocation;
		const scalar = prototype.uniform1f;
		const vector = prototype.uniform2f;
		prototype.getUniformLocation = function (program, name) {
			const result = location.call(this, program, name);
			if (result) names.set(result, name);
			return result;
		};
		prototype.uniform1f = function (location, value) {
			const name = location && names.get(location);
			if (
				name &&
				this.canvas instanceof HTMLCanvasElement &&
				this.canvas.classList.contains('world-ground')
			)
				values[name] = value;
			return scalar.call(this, location, value);
		};
		prototype.uniform2f = function (location, x, y) {
			const name = location && names.get(location);
			if (
				name &&
				this.canvas instanceof HTMLCanvasElement &&
				this.canvas.classList.contains('world-ground')
			)
				values[name] = [x, y];
			return vector.call(this, location, x, y);
		};
	});
	await page.setViewportSize({ width: 1280, height: 660 });
	await page.goto('/');
	await expect(page.locator('.customize-action')).toBeEnabled();
	const id = await page.evaluate(async () => {
		const { openSource } = await import(/* @vite-ignore */ String('/src/lib/dress/project.ts'));
		const { saveImportedCharacter } = await import(
			/* @vite-ignore */ String('/src/lib/store/import.ts')
		);
		const { makeImg } = await import(/* @vite-ignore */ String('/src/lib/image/png.ts'));
		const { cellHash } = await import(/* @vite-ignore */ String('/src/lib/rig/rig.ts'));
		const { refreshProjects, openProject } = await import(
			/* @vite-ignore */ String('/src/studio/state.svelte.ts')
		);
		const { project } = await openSource('fixture:s2');
		const manifest = structuredClone(project.manifest);
		const image = makeImg(80, 112);
		for (let row = 23; row < 55; row++)
			for (let column = 17; column < 30; column++)
				image.data.set([180, 70, 40, 255], (row * 80 + column) * 4);
		const hash = await cellHash(image);
		const body = manifest.items.find((item: { id: string }) => item.id === manifest.rig.baseItem)!;
		body.layers = [{ id: 'main', role: 'fg', z: 0, cells: { walk: { south: [hash] } } }];
		body.baseHash = hash;
		manifest.items = [body];
		manifest.slots = manifest.slots.filter((slot: { id: string }) => slot.id === body.slot);
		manifest.presets = [];
		manifest.rig.cell = { w: 80, h: 112 };
		manifest.rig.pivot = { x: 40, y: 100 };
		manifest.rig.baseHash = hash;
		manifest.rig.directions = [{ id: 'south' }];
		manifest.rig.animations = [
			{ id: 'walk', cells: 1, loop: true, frames: [{ cell: 0, ms: 100 }] }
		];
		manifest.rig.rest = { south: { image: hash, keypoints: [] } };
		const saved = await saveImportedCharacter(
			{ project: { manifest, images: new Map([[hash, image]]) }, extra: {}, warnings: [] },
			'Padded zoom'
		);
		await refreshProjects();
		await openProject(saved);
		return saved;
	});
	await expect(page.locator('.cast-character.chosen')).toHaveAttribute('data-character-id', id);
	const host = selection(page);
	await resetZoom(page, host);
	await castSettled(page);
	const base = await castBody(page);
	for (const target of ['fixture:s2', id]) {
		await page.evaluate(async (target) => {
			const { openProject } = await import(
				/* @vite-ignore */ String('/src/studio/state.svelte.ts')
			);
			await openProject(target);
		}, target);
		await castSettled(page);
		const actors = await page.evaluate(async () => {
			const { stills } = await import(
				/* @vite-ignore */ String('/src/studio/experience/thumbnails.svelte.ts')
			);
			const host = document.querySelector<HTMLElement>('.experience')!;
			const feet = parseFloat(host.style.getPropertyValue('--feet-y'));
			return [...document.querySelectorAll<HTMLElement>('.cast-character')].map((node) => {
				const still = stills.get(node.dataset.characterId!)!;
				const rect = node.querySelector('canvas')!.getBoundingClientRect();
				const scale = rect.width / still.image!.w;
				return {
					chosen: node.classList.contains('chosen'),
					ground: rect.top + (still.frame.y + still.body.h - still.body.y) * scale,
					height: still.body.h * scale,
					feet,
					box: node.getBoundingClientRect().toJSON()
				};
			});
		});
		const main = actors.find((actor) => actor.chosen)!;
		expect(main.ground).toBeCloseTo(main.feet, 2);
		for (const side of actors.filter((actor) => !actor.chosen)) {
			expect(side.ground).toBeLessThan(main.ground);
			expect(side.height / main.height).toBeCloseTo(0.75, 2);
			expect(side.box.right <= main.box.left || side.box.left >= main.box.right).toBe(true);
		}
		const painted = await castRects(page);
		const paintedMain = painted.find((actor) => actor.chosen)!;
		for (const side of painted.filter((actor) => !actor.chosen)) {
			expect(side.right <= paintedMain.left || side.left >= paintedMain.right).toBe(true);
			const gap =
				side.right <= paintedMain.left
					? paintedMain.left - side.right
					: side.left - paintedMain.right;
			const expectedGap = Math.max(16, Math.min(80, main.height * (64 / 50) * 0.18));
			expect(gap).toBeCloseTo(expectedGap, 1);
		}
		await shot(page, info, `selection-grounded-${target === id ? 'padded' : 'fixture'}`);
	}
	const baseScene = await readScene(host);
	const rect = await chosenRect(page);
	expect(base.ground).toBeCloseTo(rect.top + (rect.height * 55) / 112, 0);
	expect(base.ground).toBeLessThan(rect.top + rect.height - 30);
	await zoomToMax(page, host);
	const enlarged = await castBody(page);
	const expectedCenter = framedCenter(
		base,
		await usableScene(page),
		(await readScene(host)).zoom / baseScene.fit
	);
	expect(enlarged.x).toBeCloseTo(expectedCenter.x, 0);
	expect(enlarged.center).toBeCloseTo(expectedCenter.y, 0);
	await zoomToMin(page, host);
	const small = await castBody(page);
	expect(small.x).toBeCloseTo(base.x, 0);
	expect(small.ground).toBeCloseTo(base.ground, 0);
	await resetZoom(page, host);
	await page.locator('.customize-action').click();
	const preview = world(page);
	await resetZoom(page, preview);
	const original = await actorBounds(page);
	const initial = await readScene(preview);
	await zoomStep(page, preview, 'in');
	const expanded = await actorBounds(page);
	const pivot = (await preview.getAttribute('data-scene-anchor'))!.split(',').map(Number);
	const center = {
		x: (original.left + original.right) / 2,
		y: (original.top + original.bottom) / 2
	};
	const area = await usableScene(page, true);
	const target = framedCenter(
		{ x: center.x, center: center.y, ground: original.bottom },
		area,
		(await readScene(preview)).zoom / initial.fit
	);
	const offset = (await preview.getAttribute('data-scene-offset'))!.split(',').map(Number);
	expect(
		Math.abs(pivot[0] + offset[0] - area.x),
		'layout and DOM stage midpoints agree within CSS layout quantization'
	).toBeLessThanOrEqual(1 / 64);
	expect(pivot[1], 'the camera uses the actual device-snapped vertical center').toBeCloseTo(
		center.y,
		6
	);
	const halfPixel = 0.5 / (await page.evaluate(() => devicePixelRatio)) + 1e-6;
	expect(
		Math.abs((expanded.left + expanded.right) / 2 - area.x),
		'nearest-neighbor raster centroids round by at most half a physical pixel'
	).toBeLessThanOrEqual(halfPixel);
	expect(Math.abs((expanded.top + expanded.bottom) / 2 - target.y)).toBeLessThanOrEqual(halfPixel);
	await resetZoom(page, preview);
	await zoomToMin(page, preview);
	const reduced = await actorBounds(page);
	expect(reduced.bottom).toBeCloseTo(original.bottom, 0);
	for (const [width, height] of [
		[1920, 951],
		[574, 951],
		[951, 574]
	]) {
		await page.setViewportSize({ width, height });
		await resetZoom(page, preview);
		const area = await usableScene(page, true);
		await page.evaluate(
			async (scale) => {
				const { experience } = await import(
					/* @vite-ignore */ String('/src/studio/experience/state.svelte.ts')
				);
				experience.sceneZoom = scale;
			},
			(area.bottom - area.top) / 32
		);
		await settle(page);
		const filled = await actorBounds(page);
		expect(
			Math.abs((filled.left + filled.right) / 2 - area.x),
			`${width}x${height}: centered across the actual stage`
		).toBeLessThanOrEqual(halfPixel);
		expect(filled.top, `${width}x${height}: painted top reaches the available top`).toBeCloseTo(
			area.top,
			0
		);
		expect(
			filled.bottom,
			`${width}x${height}: painted ground reaches the available bottom`
		).toBeCloseTo(area.bottom, 0);
		expectCovered(
			await backdrop(page),
			`${width}x${height}: recentered background covers the scene`
		);
	}
	await page.setViewportSize({ width: 1440, height: 900 });
	for (const mode of ['Top-down', 'Side-scroller']) {
		await page
			.getByRole('group', { name: 'Character view', exact: true })
			.getByRole('button', { name: mode, exact: true })
			.click();
		await resetZoom(page, preview);
		const painted = await actorBounds(page, 255);
		const fit = (await readScene(preview)).fit;
		const room = await page.evaluate(async () => {
			const { layout } = await import(
				/* @vite-ignore */ String('/src/studio/experience/geometry.ts')
			);
			const geometry = layout(innerWidth, innerHeight, 'studio');
			return {
				x: (geometry.stage.l + geometry.stage.r) / 2,
				top: geometry.stage.t + (geometry.compactPlayback ? 66 : 16),
				bottom: geometry.playbackTop - 2
			};
		});
		const middle = fit * (1 + Math.max(0.25, (room.bottom - room.top) / (32 * fit) - 1) / 2);
		expect(middle).toBeLessThanOrEqual((await readScene(preview)).max);
		await page.evaluate(async (scale) => {
			const { experience } = await import(
				/* @vite-ignore */ String('/src/studio/experience/state.svelte.ts')
			);
			experience.sceneZoom = scale;
		}, middle);
		await expect.poll(async () => (await readScene(preview)).zoom).toBe(middle);
		const moved = await actorBounds(page, 255);
		expect(
			Math.abs((moved.left + moved.right) / 2 - ((painted.left + painted.right) / 2 + room.x) / 2)
		).toBeLessThanOrEqual(1);
		expect(
			Math.abs(
				(moved.top + moved.bottom) / 2 -
					((painted.top + painted.bottom) / 2 + (room.top + room.bottom) / 2) / 2
			)
		).toBeLessThanOrEqual(1);
		await zoomToMax(page, preview);
		const anchor = (await preview.getAttribute('data-scene-anchor'))!.split(',').map(Number);
		expect(
			Math.abs(anchor[0] - (painted.left + painted.right) / 2),
			`${mode} uses padded standing center x`
		).toBeLessThanOrEqual(halfPixel);
		expect(
			Math.abs(anchor[1] - (painted.top + painted.bottom) / 2),
			`${mode} uses padded standing center y`
		).toBeLessThanOrEqual(halfPixel);
		expectCovered(await backdrop(page), `${mode} padded max`);
		await zoomToMin(page, preview);
		await preview.focus();
		await page.keyboard.down('d');
		await expect
			.poll(async () => Number((await preview.getAttribute('data-position'))!.split(',')[0]))
			.toBeGreaterThan(0);
		await page.keyboard.up('d');
		await settle(page);
		const small = await actorBounds(page, 255);
		const sample = small.ground!;
		const uniforms = sample.values;
		const [x, y] = sample.position;
		const groundAnchor = uniforms.anchor as number[],
			camera = uniforms.camera as number[];
		const focal = uniforms.focal as number,
			height = uniforms.height as number,
			depth = uniforms.depth as number;
		const z = depth + y - camera[1];
		const projected = {
			x: (groundAnchor[0] + ((x - camera[0]) * focal) / z) / sample.dpr,
			y: ((uniforms.horizon as number) + (focal * height) / z) / sample.dpr,
			factor: focal / ((uniforms.viewport as number[])[1] * 1.1)
		};
		expect(
			projected.factor,
			`${mode} finite background has reached its coverage clamp`
		).toBeGreaterThan(sample.zoom / sample.fit);
		expect(
			Math.abs(small.left + 6.5 * sample.zoom - projected.x),
			`${mode} actual shader and sprite ground x agree below clamp`
		).toBeLessThanOrEqual(1);
		expect(
			Math.abs(small.bottom - projected.y),
			`${mode} actual shader and sprite ground y agree below clamp`
		).toBeLessThanOrEqual(1);
	}
});

test('wheel, keys, middle click and native controls only change zoom where the scene owns input', async ({
	page
}) => {
	await seedCharacters(page, 2);
	const host = selection(page);
	await resetZoom(page, host);
	const { fit } = await readScene(host);
	const chosen = page.locator('.cast-character.chosen');
	const first = await chosen.getAttribute('data-character-id');

	// Plain wheel zooms the selection scene and never navigates.
	expect(await wheel(host, { deltaY: -240 }), 'selection plain wheel zooms').toBe(true);
	await expect.poll(async () => (await readScene(host)).zoom).toBeGreaterThan(fit);
	expect(await chosen.getAttribute('data-character-id'), 'plain wheel never navigates').toBe(first);
	await resetZoom(page, host);
	// The caption's buttons have no wheel of their own, so the scene still zooms over them.
	expect(
		await wheel(page.locator('.selected-name'), { deltaY: -240 }),
		'wheel over the caption'
	).toBe(true);
	await expect.poll(async () => (await readScene(host)).zoom).toBeGreaterThan(fit);
	await resetZoom(page, host);
	// A trackpad pinch arrives as a Ctrl wheel without the Control key held: it zooms, never navigates.
	expect(await wheel(host, { deltaY: 240, ctrlKey: true }), 'a trackpad pinch zooms').toBe(true);
	await expect.poll(async () => (await readScene(host)).zoom).toBeLessThan(fit);
	expect(await chosen.getAttribute('data-character-id'), 'a pinch never navigates').toBe(first);
	await resetZoom(page, host);
	// A wheel turned while Ctrl or Cmd is held steps through the characters instead of zooming.
	await page.keyboard.down('Control');
	expect(await wheel(host, { deltaY: 400, ctrlKey: true }), 'Ctrl wheel navigates').toBe(true);
	await page.keyboard.up('Control');
	await expect(chosen).not.toHaveAttribute('data-character-id', first!);
	await expectAtFit(host, 'Ctrl wheel does not zoom');
	const afterNavigate = await chosen.getAttribute('data-character-id');
	expect(await wheel(host, { deltaY: 400, metaKey: true }), 'Cmd wheel navigates').toBe(true);
	await expect(chosen).not.toHaveAttribute('data-character-id', afterNavigate!);
	await expectAtFit(host, 'Cmd wheel does not zoom');
	// Over the scrolling list too, so the browser never zooms the page instead.
	const rows = page.locator('.character-rows');
	const beforeList = await chosen.getAttribute('data-character-id');
	expect(await wheel(rows, { deltaY: 400, metaKey: true }), 'Cmd wheel over the list').toBe(true);
	await expect(chosen).not.toHaveAttribute('data-character-id', beforeList!);
	expect(await wheel(host, { deltaY: -240, shiftKey: true }), 'Shift wheel stays native').toBe(
		false
	);
	await expectAtFit(host, 'Shift wheel does not zoom');
	expect(await wheel(host, { deltaY: -240, altKey: true }), 'Alt wheel stays native').toBe(false);
	await expectAtFit(host, 'Alt wheel does not zoom');

	// Native fields do not receive scene keys.
	const search = page.getByRole('searchbox', { name: 'Search characters', exact: true });
	await search.click();
	await page.keyboard.type('+-0');
	await expect(search).toHaveValue('+-0');
	await expectAtFit(host, 'typing in a field never zooms');
	await search.fill('');
	await host.focus();
	await page.keyboard.press('+');
	await expect.poll(async () => (await readScene(host)).zoom).toBeGreaterThan(fit);
	await page.keyboard.press('0');
	await expectAtFit(host, '0 resets only from the focused scene');

	// Middle click resets the camera without activating the actor under the pointer.
	await wheel(host, { deltaY: -240 });
	await expect.poll(async () => (await readScene(host)).zoom).toBeGreaterThan(fit);
	const selectedBefore = await chosen.getAttribute('data-character-id');
	const castBox = (await page.locator('.cast').boundingBox())!;
	await page.mouse.move(castBox.x + castBox.width / 2, castBox.y + castBox.height / 2);
	await page.mouse.down({ button: 'middle' });
	await page.mouse.up({ button: 'middle' });
	await expectAtFit(host, 'middle click resets the scene zoom');
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
	await expectAtFit(host, 'typing in the creator never zooms');
	await page.keyboard.press('ArrowLeft');
	await expect(name).toBeFocused();
	expect(await wheel(dialog, { deltaY: 240 }), 'the dialog keeps its native wheel').toBe(false);
	await expectAtFit(host, 'wheel over the dialog never zooms the scene');
	await dialog.getByRole('button', { name: 'Cancel', exact: true }).click();

	// Preview: plain or modified wheel zooms; Shift and Alt stay native.
	await page.locator('.customize-action').click();
	await expect(world(page)).toBeVisible();
	const preview = world(page);
	await resetZoom(page, preview);
	const previewFit = (await readScene(preview)).fit;
	expect(await wheel(preview, { deltaY: -240 }), 'Preview plain wheel zooms').toBe(true);
	await expect.poll(async () => (await readScene(preview)).zoom).toBeGreaterThan(previewFit);
	await resetZoom(page, preview);
	expect(await wheel(preview, { deltaY: -240, ctrlKey: true }), 'Preview Ctrl wheel zooms').toBe(
		true
	);
	await expect.poll(async () => (await readScene(preview)).zoom).toBeGreaterThan(previewFit);
	// Let the pinch settle first; a reset racing it has its own test.
	await page.waitForTimeout(300);
	await resetZoom(page, preview);
	expect(await wheel(preview, { deltaY: -240, metaKey: true }), 'Preview Meta wheel zooms').toBe(
		true
	);
	await expect.poll(async () => (await readScene(preview)).zoom).toBeGreaterThan(previewFit);
	await resetZoom(page, preview);
	expect(
		await wheel(preview, { deltaY: -240, shiftKey: true }),
		'Preview Shift wheel stays native'
	).toBe(false);
	await expectAtFit(preview, 'Preview Shift wheel does not zoom');

	// Keys reach the scene only while its host is focused.
	await preview.focus();
	await page.keyboard.press('+');
	await expect.poll(async () => (await readScene(preview)).zoom).toBeGreaterThan(previewFit);
	await page.keyboard.press('-');
	const lowered = await readScene(preview);
	expect(lowered.zoom, 'minus zooms out from the focused scene').toBeLessThan(lowered.max);
	await page.keyboard.press('0');
	await expectAtFit(preview, '0 resets Preview exactly');
	await page
		.getByRole('button', { name: /^(Play|Pause)$/ })
		.first()
		.focus();
	await page.keyboard.press('+');
	await expectAtFit(preview, 'a focused toolbar control keeps its native keys');

	// Middle click resets Preview without changing facing or position.
	await preview.focus();
	await page.keyboard.press('+');
	await expect
		.poll(async () => {
			const { zoom, fit } = await readScene(preview);
			return zoom - fit;
		})
		.toBeGreaterThan(0);
	const facing = await preview.getAttribute('data-facing');
	const position = await preview.getAttribute('data-position');
	const worldBox = (await preview.boundingBox())!;
	await page.mouse.move(worldBox.x + worldBox.width / 2, worldBox.y + worldBox.height / 2);
	await page.mouse.down({ button: 'middle' });
	await page.mouse.up({ button: 'middle' });
	await expectAtFit(preview, 'middle click resets Preview');
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
	await expectAtFit(preview, 'a native select never zooms');
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
	await expectAtFit(preview, 'wheel over a rail scrolls it instead of zooming');
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
	// The two levels above the fit, one rendered step at a time.
	const first = await press(page, host, '=');
	const second = await press(page, host, '=');
	expect(first, 'one step zooms in from the fit').toBeGreaterThan(bounds.fit);
	expect(second, 'the burst is not clamped by max').toBeGreaterThan(first);
	await resetZoom(page, host);
	const immediate = await page.evaluate(async () => {
		const state = await import(/* @vite-ignore */ String('/src/studio/experience/state.svelte.ts'));
		const target = document.querySelector('.world-stage')!;
		for (let index = 0; index < 2; index++)
			target.dispatchEvent(
				new WheelEvent('wheel', { deltaY: -100, bubbles: true, cancelable: true })
			);
		return state.experience.sceneZoom;
	});
	expect(immediate, 'the second notch steps from the level the first one reached').toBe(second);
	await settle(page);
	await expect
		.poll(async () => (await readScene(host)).zoom, {
			message: 'the rendered camera catches up to the burst without losing a step'
		})
		.toBe(second);
});

test('a reset right after a trackpad pinch keeps every screen at its own fit', async ({ page }) => {
	await page.goto('/');
	await expect(page.locator('.customize-action')).toBeEnabled({ timeout: 20_000 });
	const host = selection(page);
	await resetZoom(page, host);
	await page.locator('.customize-action').click();
	const preview = world(page);
	await expect(preview).toBeVisible();
	await resetZoom(page, preview);
	// A pinch, then the reset button before the pinch's release settles.
	expect(await wheel(preview, { deltaY: -240, ctrlKey: true }), 'a trackpad pinch zooms').toBe(
		true
	);
	await zoomGroup(page).getByRole('button', { name: 'Reset scene zoom', exact: true }).click();
	await page.waitForTimeout(400);
	await expectAtFit(preview, 'the reset holds once the pinch settles');
	await expect(zoomGroup(page), 'nothing is left zoomed').toHaveCount(0);
	expect(
		await page.evaluate(async () => {
			const state = await import(
				/* @vite-ignore */ String('/src/studio/experience/state.svelte.ts')
			);
			return state.experience.sceneZoom;
		}),
		'the reset stores no scale, so every screen shows its own fit'
	).toBeNull();
	await page.locator('.header-back').click();
	await expect(host).toBeVisible();
	await expectAtFit(host, 'Characters shows its own fit after the reset');
	await expect(zoomGroup(page)).toHaveCount(0);
});

test('wheel notches, keys and buttons step a whole-multiple ladder and retrace it exactly to the fit', async ({
	page
}) => {
	await seedCharacters(page, 2);
	const host = selection(page);
	await resetZoom(page, host);
	const start = await expectSceneBounds(host, 'ladder');
	const { fit } = start;
	const zoom = async () => (await readScene(host)).zoom;
	const notch = async (deltaY: number) => {
		await wheel(host, { deltaY });
		await settle(page);
		return zoom();
	};

	// Keys walk the whole ladder: down from the fit to true size, then up to the ceiling.
	const down: number[] = [];
	for (let step = 0; step < 80 && (await zoom()) > start.min; step++)
		down.push(await press(page, host, '-'));
	expect(down.at(-1), 'zoom out ends at exactly 100%').toBe(start.min);
	const up: number[] = [await zoom()];
	for (let step = 0; step < 80 && (await zoom()) < start.max; step++)
		up.push(await press(page, host, '='));
	expect(up.at(-1), 'zoom in ends at the ceiling').toBe(start.max);
	for (let index = 1; index < up.length; index++) {
		expect(up[index], 'every step in is larger').toBeGreaterThan(up[index - 1]);
		expectLadderLevel(up[index], start, [fit], `step ${index}`);
		if (up[index - 1] >= 1)
			expect(
				up[index] / up[index - 1],
				`no step from ${up[index - 1]} grows more than 25%`
			).toBeLessThanOrEqual(1.25 + 1e-9);
	}
	for (let whole = Math.ceil(start.min); whole <= start.max; whole++)
		expect(up, `the whole multiple ${whole * 100}% is always reached`).toContain(whole);
	expect(up, 'the fit is a stop on the ladder').toContain(fit);
	const atFit = up.indexOf(fit);
	expect(
		[...down].reverse().slice(1),
		'stepping in retraces exactly the levels stepped out through'
	).toEqual(up.slice(1, atFit));
	// Back down from the ceiling retraces the same levels and lands exactly on the fit, which hides the controls.
	const back: number[] = [];
	while ((await zoom()) > fit) back.push(await press(page, host, '-'));
	expect(back, 'zoom out retraces the ladder to exactly the fit').toEqual(
		up.slice(atFit, -1).reverse()
	);
	await expect(zoomGroup(page), 'back at the fit, the controls hide').toHaveCount(0);
	expect(await zoom()).toBe(fit);
	const below = up[atFit - 1],
		above = up[atFit + 1];

	// Mouse notches: 100 px each (120 on some mice), small trackpad scrolls add up to a step.
	const out: number[] = [];
	for (let i = 0; i < 3; i++) out.push(await notch(i === 1 ? 120 : 100));
	expect(out, 'each notch out is one level').toEqual(up.slice(atFit - 3, atFit).reverse());
	expect(await notch(20), 'a small scroll alone does not step').toBe(out[2]);
	expect(await notch(-20), 'reversing drops the partial step').toBe(out[2]);
	const retrace: number[] = [];
	for (let i = 0; i < 3; i++) retrace.push(await notch(-100));
	expect(retrace, 'notches in retrace the same levels').toEqual([out[1], out[0], fit]);
	await expect(zoomGroup(page), 'back at the fit, the controls hide').toHaveCount(0);
	for (let i = 0; i < 3; i++) await notch(-30);
	expect(await zoom(), 'trackpad scrolling adds up to one step').toBe(above);
	await resetZoom(page, host);

	// Keys, then buttons, cross the fit both ways on the same levels.
	await host.focus();
	for (const key of ['=', '=', '-', '-', '-', '-', '=', '=']) await page.keyboard.press(key);
	expect(await zoom(), 'keys return to exactly the fit').toBe(fit);
	await zoomStep(page, host, 'in');
	const group = zoomGroup(page);
	const reset = group.getByRole('button', { name: 'Reset scene zoom', exact: true });
	await expect(reset, 'the controls read the absolute scale').toHaveText(percent(above));
	await group.getByRole('button', { name: 'Zoom in', exact: true }).click();
	expect(await zoom()).toBe(up[atFit + 2]);
	await expect(reset).toHaveText(percent(up[atFit + 2]));
	await group.getByRole('button', { name: 'Zoom out', exact: true }).click();
	await group.getByRole('button', { name: 'Zoom out', exact: true }).click();
	expect(await zoom(), 'buttons return to exactly the fit').toBe(fit);
	await expect(group).toHaveCount(0);
	await zoomStep(page, host, 'out');
	expect(await zoom()).toBe(below);
	await expect(reset).toHaveText(percent(below));
	await group.getByRole('button', { name: 'Zoom in', exact: true }).click();
	expect(await zoom(), 'zoom in from below lands exactly on the fit').toBe(fit);
	await expect(group).toHaveCount(0);

	// A trackpad pinch stays precise between levels, and the next notch lands back on the ladder.
	await wheel(host, { deltaY: -10, ctrlKey: true });
	const pinched = fit * Math.exp(0.1);
	await expect.poll(zoom).toBeCloseTo(pinched, 6);
	await page.waitForTimeout(300);
	const whole = Math.round(pinched);
	const settled = Math.abs(pinched - whole) <= 0.04 * whole ? whole : pinched;
	expect(
		await zoom(),
		'a pinch keeps its value unless it lands within 4% of a whole multiple'
	).toBeCloseTo(settled, 6);
	const lower = up.filter((level) => level < settled - 1e-9);
	expect(await notch(100), 'a notch out from between levels lands on the level below').toBe(
		lower.at(-1)
	);
	expect(await notch(100)).toBe(lower.at(-2));
	await resetZoom(page, host);
	await wheel(host, { deltaY: -3, ctrlKey: true });
	await expect.poll(zoom).toBeGreaterThan(fit);
	await page.waitForTimeout(300);
	// It lands on the nearest of the fit and a whole multiple within 4% (the fit on a tie): beside a whole multiple, as
	// at 696.6% next to 700%, that can be the multiple.
	const released = fit * Math.exp(0.03);
	const nearest = [fit, Math.round(released)]
		.filter((target) => Math.abs(released - target) <= 0.04 * target)
		.sort((a, b) => Math.abs(released - a) / a - Math.abs(released - b) / b)[0];
	expect(nearest, 'a release this close to the fit always has a target').toBeDefined();
	expect(await zoom(), 'a pinch released near the fit lands on the nearest target').toBe(nearest);
	if (nearest === fit) await expect(zoomGroup(page)).toHaveCount(0);
	// A pinch released near a whole multiple lands on it exactly too.
	const target = up.find((level) => Number.isInteger(level) && level > fit * 1.1);
	expect(target, 'the ladder has a whole multiple above the fit').toBeDefined();
	while ((await zoom()) < target!) await press(page, host, '=');
	expect(await zoom()).toBe(target);
	await wheel(host, { deltaY: -2, ctrlKey: true });
	await expect.poll(zoom).toBeGreaterThan(target!);
	await page.waitForTimeout(300);
	expect(await zoom(), 'a pinch released near a whole multiple lands on it').toBe(target);
});

test('Characters and Customize share one absolute zoom: the same level, label and drawn size both ways', async ({
	page
}) => {
	await page.setViewportSize({ width: 1280, height: 800 });
	const ids = await seedFacingCharacters(page);
	// One facing, so Preview paints a single actor whose size is measured exactly.
	const single = ids.find((entry) => entry.name === 'Zoom facings 1')!;
	await page.locator('.character-row').filter({ hasText: 'Zoom facings 1' }).click();
	await expect(page.locator('.cast-character.chosen')).toHaveAttribute(
		'data-character-id',
		single.id
	);
	const host = selection(page);
	await resetZoom(page, host);
	const characters = await expectSceneBounds(host, 'Characters 1280x800');
	// The default reads the real scale the sprite is drawn at.
	await expectCastScale(page, characters.zoom, 'Characters fit');
	const label = () =>
		zoomGroup(page).getByRole('button', { name: 'Reset scene zoom', exact: true });
	const preview = world(page);
	const view = (name: string) =>
		page
			.getByRole('group', { name: 'Character view', exact: true })
			.getByRole('button', { name, exact: true })
			.click();

	// A level chosen on Characters reads and draws the same on Customize.
	for (let i = 0; i < 3; i++) await press(page, host, '=');
	const chosen = (await readScene(host)).zoom;
	expect(chosen, 'three steps zoom in').toBeGreaterThan(characters.fit);
	await expect(label()).toHaveText(percent(chosen));
	await expectCastScale(page, chosen, 'Characters chosen level');
	// The selected art's opaque height in art px, measured from the drawn sprite.
	const art = (await castDrawn(page)).height / chosen;
	await page.locator('.customize-action').click();
	await expect(preview).toBeVisible();
	await view('Preview');
	const pause = page.getByRole('button', { name: 'Pause', exact: true });
	if (await pause.isVisible()) await pause.click();
	await expect.poll(async () => (await readScene(preview)).zoom).toBe(chosen);
	await expect(label()).toHaveText(percent(chosen));
	const previewFit = (await readScene(preview)).fit;
	expect(previewFit, 'Customize has its own fit').not.toBe(characters.fit);
	await expect
		.poll(async () => Math.abs((await actorBounds(page)).height - art * chosen), {
			message: 'Preview draws the chosen level at the same size as Characters'
		})
		.toBeLessThanOrEqual(1.5);

	// A level chosen in Customize reads and draws the same back on Characters.
	for (let i = 0; i < 7; i++) await zoomStep(page, preview, 'out');
	if ((await readScene(preview)).zoom === previewFit) await zoomStep(page, preview, 'out');
	const lowered = (await readScene(preview)).zoom;
	expect(lowered, 'Customize zoomed out to its own level').toBeLessThan(chosen);
	await expect(label()).toHaveText(percent(lowered));
	await expect
		.poll(async () => Math.abs((await actorBounds(page)).height - art * lowered), {
			message: 'Preview draws the lowered level at its absolute size'
		})
		.toBeLessThanOrEqual(1.5);

	await view('Top-down');
	await expect.poll(async () => (await readScene(preview)).zoom).toBe(lowered);
	await expect(label()).toHaveText(percent(lowered));
	await view('Preview');
	await expect.poll(async () => (await readScene(preview)).zoom).toBe(lowered);
	const ceiling = (await readScene(preview)).max;

	await page.locator('.header-back').click();
	await expect(host).toBeVisible();
	await expect.poll(async () => (await readScene(host)).zoom).toBe(lowered);
	await expect(label()).toHaveText(percent(lowered));
	await expectCastScale(page, lowered, 'Characters after Customize');
	expect(
		Math.abs((await castDrawn(page)).height - art * lowered),
		'Characters draws the level Customize chose at the same size'
	).toBeLessThanOrEqual(1.5);
	expect(
		(await readScene(host)).max,
		'the ceiling is shared, so Customize raised it here too'
	).toBeGreaterThanOrEqual(ceiling);

	// Resizing never changes the chosen level or its drawn scale, and the ceiling never shrinks.
	let max = (await readScene(host)).max;
	for (const [width, height] of [
		[390, 844],
		[844, 390],
		[320, 568],
		[1440, 900]
	]) {
		await page.setViewportSize({ width, height });
		await settle(page);
		const state = await readScene(host);
		expect(state.zoom, `${width}x${height} keeps the level`).toBe(lowered);
		expect(state.max, `${width}x${height} never shrinks the ceiling`).toBeGreaterThanOrEqual(max);
		max = state.max;
		await expectCastScale(page, lowered, `${width}x${height}`);
	}

	// Each screen's reset is its own fit, which reads the scale it draws.
	await resetZoom(page, host);
	const fitted = await readScene(host);
	await expectCastScale(page, fitted.zoom, 'Characters fit at 1440x900');
	await page.locator('.customize-action').click();
	await expect(preview).toBeVisible();
	if (await pause.isVisible()) await pause.click();
	await expect
		.poll(
			async () => {
				const state = await readScene(preview);
				return state.zoom === state.fit;
			},
			{ message: 'Customize also returns to its own fit' }
		)
		.toBe(true);
	await expect(zoomGroup(page)).toHaveCount(0);
	const previewDefault = (await readScene(preview)).zoom;
	await expect
		.poll(async () => Math.abs((await actorBounds(page)).height - art * previewDefault), {
			message: 'the Preview fit reads the scale it draws'
		})
		.toBeLessThanOrEqual(1.5);
});

// 1920x1080 fits Characters at 1000% and Customize at 700%; 1024x768 at 504% and 500%.
for (const [width, height] of [
	[1920, 1080],
	[1024, 768]
])
	test(`a level reached on one screen retraces exactly on the other at ${width}x${height}`, async ({
		page
	}) => {
		await page.setViewportSize({ width, height });
		await seedCharacters(page, 1);
		const host = selection(page);
		await resetZoom(page, host);
		const charactersFit = (await readScene(host)).fit;
		// Two steps below Characters' fit, before Customize's fit is known: Customize's fit must not remove this level.
		await press(page, host, '-');
		const chosen = await press(page, host, '-');
		expect(chosen).toBeLessThan(charactersFit);
		await page.locator('.customize-action').click();
		const preview = world(page);
		await expect(preview).toBeVisible();
		await expect.poll(async () => (await readScene(preview)).zoom).toBe(chosen);
		const previewFit = (await readScene(preview)).fit;
		expect(previewFit, 'the two screens fit differently here').not.toBe(charactersFit);
		for (const [away, back] of [
			['-', '='],
			['=', '-']
		]) {
			await press(page, preview, away);
			expect((await readScene(preview)).zoom).not.toBe(chosen);
			await press(page, preview, back);
			expect((await readScene(preview)).zoom, `${away} then ${back} on Customize`).toBe(chosen);
		}
		await page.locator('.header-back').click();
		await expect(host).toBeVisible();
		expect((await readScene(host)).zoom, 'back on Characters, still the same level').toBe(chosen);
		await expectCastScale(page, chosen, 'back on Characters');
	});

for (const dpr of [1.25, 2, 3])
	test.describe(`at devicePixelRatio ${dpr}`, () => {
		test.use({ deviceScaleFactor: dpr, viewport: { width: 1280, height: 800 } });

		test('each screen opens at its fit, drawn at exactly the percentage it reads; Customize in whole device pixels', async ({
			page
		}) => {
			await seedCharacters(page, 1);
			const host = selection(page);
			await expectAtFit(host, 'Characters opens at its fit');
			const characters = await readScene(host);
			// Characters may shrink its thumbnail to its box, so only Customize promises whole device pixels.
			await expectCastScale(page, characters.zoom, `Characters at DPR ${dpr}`);
			await page.locator('.customize-action').click();
			const preview = world(page);
			await expect(preview).toBeVisible();
			await expectAtFit(preview, 'Customize opens at its own fit');
			const customize = await readScene(preview);
			expect(Number.isInteger(Math.round(customize.fit * dpr * 1e6) / 1e6)).toBe(true);
			await expect(zoomGroup(page), 'no controls at the default').toHaveCount(0);
		});
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
		const base = await expectSceneBounds(host, `${count} facings`);
		const baseCamera = Number(await host.getAttribute('data-scene-camera'));
		const baseAnchor = Number((await host.getAttribute('data-scene-anchor'))!.split(',')[1]);
		const baseBackdrop = await backdrop(page);
		const baseActor = await actorBounds(page);
		const baseLineup = await lineup();
		const facing = await host.getAttribute('data-facing');
		expect(baseLineup, `${count} facings: the selected facing is in the lineup`).toContain(facing);
		expect(baseLineup.length, `${count} facings: the requested lineup is complete`).toBe(count);

		await zoomStep(page, host, 'in');
		await expect.poll(async () => (await readScene(host)).zoom).toBeGreaterThan(base.fit);
		const stepped = await readScene(host);
		const factor = stepped.zoom / base.zoom;
		await expectBackdropFactor(page, baseBackdrop, factor, `${count} facings: one step`);
		await expect
			.poll(async () => (await actorBounds(page)).height / baseActor.height, {
				message: `${count} facings: the selected actor keeps one scale with the camera`
			})
			.toBeCloseTo(factor, 1);
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
		expect(top.zoom, `${count} facings: zoom in stops at the shared ceiling`).toBe(top.max);
		await expectBackdropFactor(page, baseBackdrop, top.zoom / base.zoom, `${count} facings: max`);
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
		const maxActor = await actorBounds(page);
		expect(
			maxActor.left,
			`${count} facings: visible actors stay inside the stage`
		).toBeGreaterThanOrEqual(stage.left - 1);
		expect(
			maxActor.right,
			`${count} facings: visible actors stay inside the stage`
		).toBeLessThanOrEqual(stage.right + 1);
		// Every facing shares the selected one's height and floor line, so the lineup's top lands exactly where the
		// camera's pivot and level put it, even when a short screen sends the feet below the stage.
		const pivot = Number((await host.getAttribute('data-scene-anchor'))!.split(',')[1]);
		const translation = Number((await host.getAttribute('data-scene-offset'))!.split(',')[1]);
		const camera = Number(await host.getAttribute('data-scene-camera'));
		expect(
			camera,
			`${count} facings: the camera multiplies the fit up to the shown scale`
		).toBeCloseTo((baseCamera * top.zoom) / base.zoom, 6);
		// The top as drawn with no camera, then moved by the max camera around its pivot.
		const unzoomedTop = baseAnchor + (baseActor.top - baseAnchor) / baseCamera;
		await expect
			.poll(async () => (await actorBounds(page)).top, {
				message: `${count} facings: the selected actor's scale is stable at max`
			})
			.toBeCloseTo(Math.max(0, pivot + (unzoomedTop - pivot) * camera + translation), 0);
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

test('chosen Preview zoom centers the selected facing across even-lineup resize thresholds', async ({
	page
}, info) => {
	await page.setViewportSize({ width: 1305, height: 951 });
	await page.goto('/');
	await expect(page.locator('.customize-action')).toBeEnabled();
	await page.locator('.customize-action').click();
	const host = world(page);
	await waitForScene(host);
	await expect(host).toHaveAttribute('data-lineup', /^\S+ \S+$/);
	await page.evaluate(async () => {
		const { experience } = await import(
			/* @vite-ignore */ String('/src/studio/experience/state.svelte.ts')
		);
		experience.sceneZoom = 9;
	});
	await expect.poll(async () => (await readScene(host)).zoom).toBe(9);
	for (const [width, height] of [
		[1305, 951],
		[1559, 951],
		[1305, 650],
		[1305, 951]
	]) {
		await page.setViewportSize({ width, height });
		await expect
			.poll(async () => {
				const area = await usableScene(page, true);
				const anchor = Number((await host.getAttribute('data-scene-anchor'))!.split(',')[0]);
				const offset = Number((await host.getAttribute('data-scene-offset'))!.split(',')[0]);
				return Math.abs(anchor + offset - area.x);
			})
			.toBeLessThanOrEqual(1);
		await expect.poll(async () => (await readScene(host)).zoom).toBe(9);
	}
	await shot(page, info, 'even-lineup-centered');
	const fit = (await readScene(host)).fit;
	await page.evaluate(async (fit) => {
		const { experience } = await import(
			/* @vite-ignore */ String('/src/studio/experience/state.svelte.ts')
		);
		experience.sceneZoom = fit;
	}, fit);
	await expect(
		zoomGroup(page).getByRole('button', { name: 'Reset scene zoom', exact: true })
	).toBeVisible();
	await resetZoom(page, host);
	await expect(host).toHaveAttribute('data-lineup', /^\S+ \S+$/);
});

for (let count = 1; count <= 5; count++)
	test(`chosen Preview composition remains centered and stable while resizing ${count} facing character`, async ({
		page
	}, info) => {
		await page.setViewportSize({ width: 1920, height: 951 });
		await seedFacingCharacters(page);
		await page
			.locator('.character-row')
			.filter({ hasText: `Zoom facings ${count}` })
			.click();
		await page.locator('.customize-action').click();
		const host = world(page);
		await waitForScene(host);
		const pause = page.getByRole('button', { name: 'Pause', exact: true });
		if (await pause.isVisible()) await pause.click();
		for (const scale of [3, 9, 14]) {
			await page.evaluate(async (scale) => {
				const { experience } = await import(
					/* @vite-ignore */ String('/src/studio/experience/state.svelte.ts')
				);
				experience.sceneZoom = scale;
			}, scale);
			for (const [width, height] of [...SIZES_A, ...SIZES_B, [1305, 951], [1559, 951]]) {
				await page.setViewportSize({ width, height });
				await settle(page);
				const area = await usableScene(page, true);
				const anchor = Number((await host.getAttribute('data-scene-anchor'))!.split(',')[0]);
				const offset = Number((await host.getAttribute('data-scene-offset'))!.split(',')[0]);
				expect(
					Math.abs(anchor + offset - area.x),
					`${count} facings ${scale}x ${width}x${height}: selected center`
				).toBeLessThanOrEqual(1);
				expect((await readScene(host)).zoom).toBe(scale);
				expectCovered(await backdrop(page), `${count} facings ${scale}x ${width}x${height}`);
			}
		}
		await page.setViewportSize({ width: 1305, height: 951 });
		await shot(page, info, `inspection-${count}-facings`);
		await page.evaluate(async () => {
			const { experience } = await import(
				/* @vite-ignore */ String('/src/studio/experience/state.svelte.ts')
			);
			experience.sceneZoom = 6.125;
		});
		const heights: string[] = [];
		for (let height = 600; height <= 1000; height += 20) {
			await page.setViewportSize({ width: 1305, height });
			await settle(page);
			const frames = await host.evaluate(async (node) => {
				const result: string[] = [];
				for (let frame = 0; frame < 4; frame++) {
					await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
					result.push((node as HTMLElement).dataset.lineup ?? '');
				}
				return result;
			});
			expect(
				new Set(frames).size,
				'settled viewport must not alternate visible facings between frames'
			).toBe(1);
			heights.push(frames[0]);
		}
		expect(
			new Set(heights).size,
			'height-only resizing must not change horizontal companion visibility'
		).toBe(1);
		const widths: number[] = [];
		for (let width = 1000; width <= 1600; width += 20) {
			await page.setViewportSize({ width, height: 951 });
			await settle(page);
			widths.push((await host.getAttribute('data-lineup'))!.split(' ').length);
		}
		for (let index = 1; index < widths.length; index++)
			expect(
				widths[index],
				'more horizontal room never hides a facing at a fixed chosen scale'
			).toBeGreaterThanOrEqual(widths[index - 1]);
	});

test('playable zoom shares scale across views, preserves movement and native input, and resets', async ({
	page
}) => {
	await seedCharacters(page, 1);
	await page.locator('.customize-action').click();
	const host = world(page);
	const view = (name: string) =>
		page
			.getByRole('group', { name: 'Character view', exact: true })
			.getByRole('button', { name, exact: true })
			.click();
	for (const mode of ['Top-down', 'Side-scroller']) {
		await view(mode);
		await waitForScene(host);
		await resetZoom(page, host);
		const base = await readScene(host);
		expect(await wheel(host, { deltaY: -120 })).toBe(true);
		await expect.poll(async () => (await readScene(host)).zoom).toBeGreaterThan(base.fit);
		const chosen = (await readScene(host)).zoom;
		await expect(
			zoomGroup(page).getByRole('button', { name: 'Reset scene zoom', exact: true })
		).toHaveText(percent(chosen));
		await host.focus();
		await page.keyboard.down('d');
		await expect
			.poll(async () => Number((await host.getAttribute('data-position'))!.split(',')[0]))
			.toBeGreaterThan(0);
		await page.keyboard.up('d');
		await settle(page);
		const position = await host.getAttribute('data-position');
		await press(page, host, '-');
		expect(await host.getAttribute('data-position')).toBe(position);
		await press(page, host, '+');
		expect(await host.getAttribute('data-position')).toBe(position);
		const shared = (await readScene(host)).zoom;
		for (const other of ['Preview', 'Top-down', 'Side-scroller']) {
			await view(other);
			await expect.poll(async () => (await readScene(host)).zoom).toBe(shared);
		}
		await view(mode);
		await host.focus();
		await page.keyboard.down('Alt');
		expect(await wheel(host, { deltaY: -120, altKey: true })).toBe(false);
		await page.keyboard.up('Alt');
		expect((await readScene(host)).zoom).toBe(shared);
		const box = (await host.boundingBox())!;
		await page.mouse.click(box.x + box.width / 2, box.y + 180, { button: 'middle' });
		await expectAtFit(host, `${mode} middle reset`);
		await expect(zoomGroup(page)).toHaveCount(0);
	}
});

test('playable zoom keeps the fallback actor on its environment camera when the renderer fails to load', async ({
	page
}) => {
	await page.route('**/src/studio/experience/ground.ts*', (route) => route.abort());
	await seedCharacters(page, 1);
	await page.locator('.customize-action').click();
	const host = world(page);
	await page
		.getByRole('group', { name: 'Character view', exact: true })
		.getByRole('button', { name: 'Top-down', exact: true })
		.click();
	await expect(page.locator('.world-coverage')).toContainText('Test world unavailable');
	await resetZoom(page, host);
	const base = await actorBounds(page, 255);
	await zoomStep(page, host, 'in');
	const state = await readScene(host);
	const shown = await actorBounds(page, 255);
	const [x, y] = (await host.getAttribute('data-scene-anchor'))!.split(',').map(Number);
	const [dx, dy] = (await host.getAttribute('data-scene-offset'))!.split(',').map(Number);
	const factor = state.zoom / state.fit;
	expect(
		Math.abs(
			(shown.left + shown.right) / 2 - (x + ((base.left + base.right) / 2 - x) * factor + dx)
		)
	).toBeLessThanOrEqual(1.5);
	expect(Math.abs(shown.bottom - (y + (base.bottom - y) * factor + dy))).toBeLessThanOrEqual(1.5);
	expectCovered(await backdrop(page), 'renderer failure fallback');
});

test('playable zoom keeps absolute sprite size and covered backgrounds across responsive views', async ({
	page
}, info) => {
	await seedCharacters(page, 1);
	await page.locator('.customize-action').click();
	const host = world(page);
	const fit = (await readScene(host)).fit;
	await press(page, host, '+');
	await expect.poll(async () => (await readScene(host)).zoom).toBeGreaterThan(fit);
	for (const theme of THEMES) {
		await setTheme(page, theme);
		for (const [width, height] of [
			[320, 568],
			[568, 320],
			[390, 844],
			[844, 390],
			[1440, 900],
			[1919, 951],
			[2560, 1080],
			[1080, 2560]
		] as const) {
			const retained = (await readScene(host)).zoom;
			await page.setViewportSize({ width, height });
			await expect.poll(async () => (await readScene(host)).zoom).toBe(retained);
			for (const mode of ['Top-down', 'Side-scroller']) {
				await page
					.getByRole('group', { name: 'Character view', exact: true })
					.getByRole('button', { name: mode, exact: true })
					.click();
				await resetZoom(page, host);
				const base = await readScene(host);
				const body = await actorBounds(page, 255);
				if (width === 390 || width === 1440)
					await shot(page, info, `live-${mode}-${theme}-${width}x${height}-fit`);
				const scale = Math.max(base.min, base.fit * 0.75);
				await page.evaluate(async (scale) => {
					const { experience } = await import(
						/* @vite-ignore */ String('/src/studio/experience/state.svelte.ts')
					);
					experience.sceneZoom = scale;
				}, scale);
				await expect.poll(async () => (await readScene(host)).zoom).toBe(scale);
				await expect
					.poll(async () =>
						Math.abs((await actorBounds(page, 255)).height - (body.height * scale) / base.fit)
					)
					.toBeLessThanOrEqual(2);
				expectCovered(await backdrop(page), `${mode} ${theme} ${width}x${height}`);
				if (width === 390 || width === 1440)
					await shot(page, info, `live-${mode}-${theme}-${width}x${height}-low`);
				await page.evaluate(async (scale) => {
					const { experience } = await import(
						/* @vite-ignore */ String('/src/studio/experience/state.svelte.ts')
					);
					experience.sceneZoom = scale;
				}, base.max);
				await expect.poll(async () => (await readScene(host)).zoom).toBe(base.max);
				expectCovered(await backdrop(page), `${mode} max ${theme} ${width}x${height}`);
				await shot(page, info, `live-${mode}-${theme}-${width}x${height}-max`);
			}
		}
	}
});

test.describe('playable touch zoom', () => {
	test.use({
		viewport: { width: 390, height: 844 },
		isMobile: true,
		hasTouch: true,
		deviceScaleFactor: 2
	});
	test('pinch takes over joystick and remaining fingers never resume movement', async ({
		page,
		context
	}) => {
		await seedCharacters(page, 1);
		await page.locator('.customize-action').click();
		const host = world(page);
		const cdp = await context.newCDPSession(page);
		const touch = (
			type: 'touchStart' | 'touchMove' | 'touchEnd' | 'touchCancel',
			points: { x: number; y: number; id: number }[]
		) =>
			cdp.send('Input.dispatchTouchEvent', {
				type,
				touchPoints: points.map((point) => ({ ...point, radiusX: 1, radiusY: 1 }))
			});
		for (const mode of ['Top-down', 'Side-scroller']) {
			await page
				.getByRole('group', { name: 'Character view', exact: true })
				.getByRole('button', { name: mode, exact: true })
				.click();
			await resetZoom(page, host);
			const fit = (await readScene(host)).fit;
			const a = { x: 110, y: 230, id: 1 },
				b = { x: 190, y: 230, id: 2 };
			await touch('touchStart', [a]);
			await touch('touchMove', [{ ...a, x: 140 }]);
			await expect(page.locator('.world-stick')).toBeVisible();
			await expect
				.poll(async () => Number((await host.getAttribute('data-position'))!.split(',')[0]))
				.toBeGreaterThan(0);
			await touch('touchStart', [{ ...a, x: 140 }, b]);
			await expect(page.locator('.world-stick')).toHaveCount(0);
			await settle(page);
			const position = await host.getAttribute('data-position');
			await touch('touchMove', [
				{ ...a, x: 90 },
				{ ...b, x: 230 }
			]);
			await expect.poll(async () => (await readScene(host)).zoom).toBeGreaterThan(fit);
			await touch('touchEnd', [{ ...a, x: 90 }]);
			await touch('touchMove', [{ ...a, x: 150 }]);
			await settle(page);
			expect(await host.getAttribute('data-position')).toBe(position);
			const canceled = (await readScene(host)).zoom;
			await touch('touchCancel', []);
			await settle(page);
			expect((await readScene(host)).zoom).toBe(canceled);
			await touch('touchStart', [a]);
			await touch('touchMove', [{ ...a, x: 140 }]);
			await expect(page.locator('.world-stick')).toBeVisible();
			await touch('touchEnd', []);
			await expect(page.locator('.world-stick')).toHaveCount(0);
			await resetZoom(page, host);
			await touch('touchStart', [a]);
			await touch('touchStart', [a, b]);
			await touch('touchMove', [
				{ ...a, x: 100 },
				{ ...b, x: 210 }
			]);
			await settle(page);
			const switched = (await readScene(host)).zoom;
			await page.keyboard.press(mode === 'Top-down' ? '3' : '2');
			await touch('touchEnd', []);
			await expect(page.locator('.world-stick')).toHaveCount(0);
			await expect.poll(async () => (await readScene(host)).zoom).toBe(switched);
		}
		await cdp.detach();
	});
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
		const pinched = await readScene(host);
		expect(pinched.zoom, 'the pinch zoomed in instead').toBeGreaterThan(pinched.fit);
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
			expect(zoomed.zoom, 'a touch pinch zooms the selection camera').toBeGreaterThan(zoomed.fit);
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
			const previewPinched = await readScene(previewHost);
			expect(previewPinched.zoom, 'Preview pinch zooms').toBeGreaterThan(previewPinched.fit);
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
			const atFit = await readScene(previewHost);
			const beforeCancel = atFit.zoom;
			expect(beforeCancel, 'cancel regression starts from automatic fit').toBe(atFit.fit);
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
