import { expect, test, type Page } from '@playwright/test';
import { equipmentGroup, openStudio } from './immersive-helpers.ts';
import { decodePngBytes } from '../../src/lib/image/pngraw.ts';

async function thumbnailWorkDuringPlayback(page: Page) {
	return page.evaluate(async () => {
		const p = '/src/studio/state.svelte.ts',
			s = await import(p);
		const q = '/src/lib/pixellab/queue.ts',
			{ queue } = await import(q);
		const result = s.store.results.early_hair,
			layer = result.preview.manifest.items.find((i: { id: string }) => i.id === 'early_hair')
				.layers[0],
			cells = layer.cells;
		const image = result.thumbnail ?? result.preview.images.get('early-pixels'),
			data = image.data;
		let reads = 0,
			draws = 0,
			rawReads = 0;
		Object.defineProperty(layer, 'cells', {
			configurable: true,
			get() {
				reads++;
				return cells;
			}
		});
		Object.defineProperty(image, 'data', {
			configurable: true,
			get() {
				rawReads++;
				return data;
			}
		});
		const draw = CanvasRenderingContext2D.prototype.drawImage;
		CanvasRenderingContext2D.prototype.drawImage = function (
			image: CanvasImageSource,
			...coords: number[]
		) {
			if (this.canvas instanceof HTMLCanvasElement && this.canvas.closest('.tile-art')) draws++;
			return Reflect.apply(draw, this, [image, ...coords]);
		};
		try {
			for (let i = 0; i < 40; i++) {
				s.ui.frame = i % 8;
				s.gens[0].status = `Other views ${i}`;
				queue.recs.get('thumb-east').jobs[0].progress = i / 40;
				queue.emit();
				await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
			}
			return { reads, draws, rawReads };
		} finally {
			CanvasRenderingContext2D.prototype.drawImage = draw;
			Object.defineProperty(layer, 'cells', { configurable: true, writable: true, value: cells });
			Object.defineProperty(image, 'data', { configurable: true, writable: true, value: data });
		}
	});
}

test('draft item artwork appears before wearing, keeps running progress, and stops drawing during playback', async ({
	page,
	context
}, info) => {
	const requests: string[] = [],
		errors: string[] = [];
	page.on('pageerror', (error) => errors.push(error.message));
	await context.route('https://*.pixellab.ai/**', (route) => {
		requests.push(route.request().method());
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
	await page.evaluate(async () => {
		const statePath = '/src/studio/state.svelte.ts',
			s = await import(statePath);
		const queuePath = '/src/lib/pixellab/queue.ts',
			{ queue } = await import(queuePath);
		await s.loadGens();
		queue.disconnect();
		s.ui.playing = false;
		s.ui.selected = '';
		const spec = {
			id: 'early_hair',
			name: 'Early hair',
			slot: 'hair',
			prompt: 'hair',
			key: 'green',
			anims: ['walk'],
			dirs: ['south', 'east']
		};
		s.gens.push({
			draft: {
				rigId: s.doc.id,
				spec,
				calls: [
					{ cells: ['walk/south/0'], recId: 'thumb-south', seed: 1, old: [], rerolls: 0 },
					{ cells: ['walk/east/0'], recId: 'thumb-east', seed: 1, old: [], rerolls: 0 }
				],
				log: []
			},
			input: { name: spec.name, slot: spec.slot, prompt: spec.prompt },
			phase: 'running',
			status: 'Adding the other views',
			requestText: s.REQUEST_TEXT
		});
		for (const [id, state] of [
			['thumb-south', 'done'],
			['thumb-east', 'running']
		])
			queue.recs.set(id, {
				id,
				state,
				label: id,
				jobs: [{ progress: 0, done: state === 'done', status: 'processing', results: [] }],
				createdAt: Date.now(),
				nextAt: 0,
				attempts: 1,
				gens: 0,
				usd: 0
			});
		queue.emit();
	});
	await equipmentGroup(page, 'Hair');
	const tile = page.locator('.equipment-scroll').getByRole('button', { name: /^Early hair, / });
	await expect(tile).toHaveAttribute('aria-pressed', 'false');
	await expect(tile.locator('.ring')).toBeVisible();
	await expect(tile.locator('canvas')).toHaveCount(0);
	await expect(tile).toContainText('50%');
	await page.evaluate(async () => {
		const p = '/src/studio/state.svelte.ts',
			s = await import(p);
		const imPath = '/src/lib/image/png.ts',
			{ makeImg } = await import(imPath);
		const img = makeImg(64, 64);
		for (let y = 12; y < 18; y++)
			for (let x = 16; x < 46; x++) img.data.set([41, 83, 137, 255], (y * 64 + x) * 4);
		s.store.results = {
			...s.store.results,
			early_hair: { cells: [], qa: null, g1: new Map(), preview: null, thumbnail: img }
		};
	});
	await expect(tile.locator('canvas')).toBeVisible();
	await expect(tile.locator('.tile-progress.overlay .ring')).toBeVisible();
	await expect(tile).toHaveAttribute('aria-pressed', 'false');
	expect(
		await tile.locator('canvas').evaluate((c: HTMLCanvasElement) => [c.width, c.height])
	).toEqual([30, 6]);
	await page.evaluate(async () => {
		const p = '/src/studio/state.svelte.ts',
			s = await import(p),
			img = s.store.results.early_hair.thumbnail;
		// A target preview can exist while its landed view is empty or occluded. Keep the usable standing artwork.
		const layer = {
			id: 'main',
			role: 'fg',
			z: 1,
			cells: { walk: { south: [null], east: [null] } }
		};
		const item = {
			...s.store.project.manifest.items.find((i: { slot: string }) => i.slot === 'head'),
			id: 'early_hair',
			name: 'Early hair',
			slot: 'hair',
			layers: [layer],
			coverage: ['walk/south/0'],
			pending: ['walk/east/0']
		};
		const preview = {
			manifest: { ...s.store.project.manifest, items: [...s.store.project.manifest.items, item] },
			images: new Map([...s.store.project.images, ['early-pixels', img]])
		};
		s.store.results = {
			...s.store.results,
			early_hair: { cells: [], qa: null, g1: new Map(), preview, thumbnail: img }
		};
	});
	await expect(tile.locator('canvas')).toBeVisible();
	await expect(tile.locator('.tile-progress.overlay .ring')).toBeVisible();
	await expect(tile).toHaveAttribute('aria-pressed', 'false');
	expect(
		await tile.locator('canvas').evaluate((c: HTMLCanvasElement) => [c.width, c.height])
	).toEqual([30, 6]);
	expect(await thumbnailWorkDuringPlayback(page)).toEqual({ reads: 0, draws: 0, rawReads: 0 });
	await page.evaluate(async () => {
		const p = '/src/studio/state.svelte.ts',
			s = await import(p);
		const result = s.store.results.early_hair;
		result.preview.manifest.items.find(
			(i: { id: string }) => i.id === 'early_hair'
		).layers[0].cells.walk.south = ['early-pixels'];
		s.store.results = { ...s.store.results, early_hair: { ...result, thumbnail: undefined } };
	});
	await expect(tile.locator('canvas')).toBeVisible();
	expect(
		await tile.locator('canvas').evaluate((c: HTMLCanvasElement) => [c.width, c.height])
	).toEqual([30, 6]);
	expect(await thumbnailWorkDuringPlayback(page)).toEqual({ reads: 0, draws: 0, rawReads: 0 });
	for (const phase of ['review', 'failed']) {
		await page.evaluate(async (phase) => {
			const p = '/src/studio/state.svelte.ts',
				s = await import(p);
			s.gens[0].phase = phase;
		}, phase);
		await expect(tile.locator('.ring')).toHaveCount(0);
		await expect(tile.locator('canvas')).toBeVisible();
	}
	await page.evaluate(async () => {
		const p = '/src/studio/state.svelte.ts',
			s = await import(p);
		s.store.results = {};
	});
	await expect(tile.locator('canvas')).toHaveCount(0);
	await expect(tile.locator('.tile-art svg')).toBeVisible();
	await expect(tile.locator('.ring')).toHaveCount(0);
	expect(requests).toEqual([]);
	expect(errors).toEqual([]);
});

test.describe('responsive item thumbnail fitting', () => {
	test.use({ deviceScaleFactor: 1.25 });
	test('padded, opaque, wide, tall and tiny items fit their art boxes in both themes without clipping', async ({
		page
	}, info) => {
		const errors: string[] = [];
		page.on('pageerror', (error) => errors.push(error.message));
		await page.addInitScript(() => {
			localStorage.setItem('pixeldoll.agentKey', 'off');
			localStorage.setItem('pixeldoll.welcomed', '1');
		});
		await openStudio(
			page,
			info.config.projects.find((p) => p.name === 'browser-selftests')!.use.baseURL!
		);
		const notice = page.getByRole('button', { name: 'Dismiss notification', exact: true });
		if (await notice.count()) await notice.first().click();
		await expect(page.locator('.equipment-scroll .tile-art canvas').first()).toBeVisible();
		await page.screenshot({ path: info.outputPath('saved-item-thumbnails.png') });
		const shapes = await page.evaluate(async () => {
			const p = '/src/studio/state.svelte.ts',
				s = await import(p),
				imagePath = '/src/lib/image/png.ts',
				{ makeImg } = await import(imagePath);
			s.ui.playing = false;
			const project = s.store.project,
				base = project.manifest.items.find((i: { slot: string }) => i.slot === 'head');
			const shapes = [
				{ id: 'wide', w: 160, h: 4, x: 0, y: 0, artW: 160, artH: 4 },
				{ id: 'tall', w: 3, h: 144, x: 0, y: 0, artW: 3, artH: 144 },
				{ id: 'padded', w: 96, h: 96, x: 16, y: 20, artW: 60, artH: 8 },
				{ id: 'opaque', w: 96, h: 96, x: 0, y: 0, artW: 96, artH: 96 },
				{ id: 'tiny', w: 64, h: 64, x: 63, y: 63, artW: 1, artH: 1 },
				{ id: 'transparent', w: 16, h: 16, x: 0, y: 0, artW: 0, artH: 0 }
			];
			const items = shapes.map((shape) => {
				const img = makeImg(shape.w, shape.h);
				for (let y = shape.y; y < shape.y + shape.artH; y++)
					for (let x = shape.x; x < shape.x + shape.artW; x++)
						img.data.set([27, 169, 211, 255], (y * shape.w + x) * 4);
				const hash = 'thumbnail-' + shape.id;
				project.images.set(hash, img);
				return {
					...structuredClone(base),
					id: hash,
					name: 'Thumbnail ' + shape.id,
					layers: [
						{
							id: 'main',
							role: 'fg',
							z: 1,
							cell: { w: shape.w, h: shape.h },
							cells: { walk: { south: [hash] } }
						}
					]
				};
			});
			s.store.project = {
				...project,
				manifest: { ...project.manifest, items: [...project.manifest.items, ...items] }
			};
			return shapes;
		});
		await equipmentGroup(page, 'Head');
		const evidence: unknown[] = [];
		for (const theme of ['dark', 'light']) {
			await page.evaluate(async (theme) => {
				const p = '/src/studio/state.svelte.ts',
					s = await import(p);
				if (s.ui.theme !== theme) s.toggleTheme();
			}, theme);
			for (const [width, height] of [
				[1440, 900],
				[1920, 1080],
				[768, 1024],
				[390, 844],
				[844, 390],
				[320, 568]
			]) {
				await page.setViewportSize({ width, height });
				for (const shape of shapes) {
					const tile = page
						.locator('.equipment-scroll')
						.getByRole('button', { name: 'Thumbnail ' + shape.id, exact: true });
					if (!shape.artW) {
						await expect(tile.locator('canvas')).toHaveCount(0);
						await expect(tile.locator('.tile-art svg')).toBeAttached();
						continue;
					}
					await expect
						.poll(() =>
							tile.evaluate((el) => {
								const art = el.querySelector<HTMLElement>('.tile-art')!,
									canvas = art.querySelector<HTMLCanvasElement>('canvas')!;
								if (!canvas) return null;
								const box = art.getBoundingClientRect(),
									c = canvas.getBoundingClientRect(),
									button = el.getBoundingClientRect(),
									style = getComputedStyle(canvas);
								const fit = Math.min(c.width / canvas.width, c.height / canvas.height);
								return {
									backing: [canvas.width, canvas.height],
									contain: style.objectFit,
									nearest: ['pixelated', 'crisp-edges'].includes(style.imageRendering),
									canvasFits: c.width <= box.width + 1 && c.height <= box.height + 1,
									artFits: box.width <= button.width && box.height <= button.height,
									fillsAnAxis:
										Math.min(
											Math.abs(canvas.width * fit - box.width),
											Math.abs(canvas.height * fit - box.height)
										) < 1,
									opaqueEdges: [
										0,
										canvas.width - 1,
										(canvas.height - 1) * canvas.width,
										canvas.height * canvas.width - 1
									].every(
										(i) =>
											canvas
												.getContext('2d')!
												.getImageData(i % canvas.width, Math.floor(i / canvas.width), 1, 1)
												.data[3] === 255
									)
								};
							})
						)
						.toEqual({
							backing: [shape.artW, shape.artH],
							contain: 'contain',
							nearest: true,
							canvasFits: true,
							artFits: true,
							fillsAnAxis: true,
							opaqueEdges: true
						});
					if (theme === 'dark' && width === 1440 && ['wide', 'tall', 'tiny'].includes(shape.id)) {
						// Inspect the painted CSS result, not just the canvas box, which also includes letterboxing.
						await tile.evaluate((el) => el.scrollIntoView({ block: 'center', inline: 'nearest' }));
						const displayed = await tile.locator('canvas').evaluate((el) => {
							const r = el.getBoundingClientRect();
							return { w: r.width, h: r.height, dpr: devicePixelRatio };
						});
						const screenshot = await decodePngBytes(
							new Uint8Array(
								await tile
									.locator('.tile-art')
									.screenshot({ path: info.outputPath(`painted-${shape.id}.png`) })
							)
						);
						let x0 = screenshot.w,
							y0 = screenshot.h,
							x1 = -1,
							y1 = -1;
						for (let y = 0; y < screenshot.h; y++)
							for (let x = 0; x < screenshot.w; x++) {
								const i = (y * screenshot.w + x) * 4;
								if (
									screenshot.data[i] === 27 &&
									screenshot.data[i + 1] === 169 &&
									screenshot.data[i + 2] === 211
								) {
									x0 = Math.min(x0, x);
									y0 = Math.min(y0, y);
									x1 = Math.max(x1, x);
									y1 = Math.max(y1, y);
								}
							}
						expect(x1, `${shape.id} has painted pixels`).toBeGreaterThanOrEqual(x0);
						// Fractional-DPR screenshots round their clip outward; use the actual CSS image box for the expected scale.
						const scale =
							Math.min(displayed.w / shape.artW, displayed.h / shape.artH) * displayed.dpr;
						expect(
							Math.abs(x1 - x0 + 1 - shape.artW * scale),
							`${shape.id} painted width`
						).toBeLessThanOrEqual(2);
						expect(
							Math.abs(y1 - y0 + 1 - shape.artH * scale),
							`${shape.id} painted height`
						).toBeLessThanOrEqual(2);
					}
				}
				evidence.push({ theme, width, height });
				if ((width === 1440 || width === 390) && theme === 'dark') {
					await page
						.locator('.equipment-scroll')
						.getByRole('button', { name: 'Thumbnail padded', exact: true })
						.evaluate((el) => el.scrollIntoView({ block: 'center', inline: 'nearest' }));
					await page.screenshot({ path: info.outputPath(`thumbnails-${width}.png`) });
				}
			}
		}
		await info.attach('thumbnail-layout-matrix', {
			body: JSON.stringify(evidence),
			contentType: 'application/json'
		});
		expect(errors).toEqual([]);
	});
});
