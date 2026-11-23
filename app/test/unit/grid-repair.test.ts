import { afterEach, expect, test, vi } from 'vitest';
import {
	applyRepairReview,
	gridRepairRequest,
	regridClip,
	type RigCtx
} from '../../src/lib/items/run.ts';
import { queue, type JobRec } from '../../src/lib/pixellab/queue.ts';
import * as db from '../../src/lib/store/db.ts';
import * as store from '../../src/lib/store/project.ts';
import { base64ToBytes, makeImg, type Img } from '../../src/lib/image/png.ts';
import { decodePngBytes, encodePngBytes } from '../../src/lib/image/pngraw.ts';
import { inputCell, padImg, repairGridPlan } from '../../src/lib/items/items.ts';
import { cellHash, type DirectionName } from '../../src/lib/rig/rig.ts';
import { LABELS, fromApi } from '../../src/lib/rig/poses.ts';
import { sha256 } from '../../src/lib/image/hash.ts';
import type { Item, Manifest } from '../../src/lib/store/manifest.ts';
import { CURRENT_FORMAT } from '../../src/lib/store/manifest.ts';
afterEach(() => vi.restoreAllMocks());
async function fixture(mode = 'pass', pad = 16, bladeEnd = 52) {
	const dirs: DirectionName[] = ['south', 'east', 'north', 'west'],
		body = makeImg(64, 64);
	const side = 64 + 2 * pad;
	for (let y = 10; y < 60; y++)
		for (let x = 24; x < 40; x++)
			body.data.set(
				mode === 'redraw-matte' && x < 26 ? [30, 20, 10, 255] : [170, 120, 90, 255],
				(y * 64 + x) * 4
			);
	const h = await cellHash(body),
		points = LABELS.map((label) => ({
			label,
			x: (label === 'RIGHT ARM' ? 25 : label === 'LEFT ARM' ? 38 : 32) / 64,
			y: 30 / 64
		})),
		blobs = new Map<string, Blob>();
	const put = async (im: Img) => {
		const bytes = await encodePngBytes(im),
			hash = await sha256(bytes);
		blobs.set(hash, new Blob([bytes as Uint8Array<ArrayBuffer>], { type: 'image/png' }));
		return hash;
	};
	const reference = inputCell(padImg(body, pad), 'green');
	for (let y = 30 + pad; y < bladeEnd + pad; y++)
		for (let x = 23 + pad; x < 26 + pad; x++)
			reference.data.set([180, 180, 190, 255], (y * side + x) * 4);
	const rh = await put(reference),
		ih = await cellHash(reference);
	const cell = { w: side, h: side },
		pivot = { x: 32 + pad, y: 60 + pad };
	const item: Item = {
		id: 'sword',
		name: 'Sword',
		slot: 'main_hand',
		status: 'accepted',
		mirror: 'generate',
		prompt: 'steel sword with gold hilt',
		materials: [],
		provenance: [],
		baseHash: h,
		route: 'skeleton-pose',
		key: 'green',
		dressed: Object.fromEntries(dirs.map((d) => [d, `sha256:${rh}`])),
		layers: [
			{
				id: 'fg',
				role: 'fg',
				z: 150,
				cell,
				pivot,
				cells: {
					idle: { west: [ih] },
					slash: { south: Array(8).fill(ih), west: Array(8).fill(ih) }
				}
			},
			{
				id: 'bg',
				role: 'bg',
				z: 1,
				cell,
				pivot,
				cells: {
					idle: { west: [null] },
					slash: { south: Array(8).fill(null), west: Array(8).fill(null) }
				}
			}
		]
	};
	const manifest: Manifest = {
		format: CURRENT_FORMAT,
		name: 'Test',
		app: '',
		slots: [],
		materials: [],
		presets: [],
		rig: {
			cell: { w: 64, h: 64 },
			pivot: { x: 32, y: 60 },
			baseHash: h,
			baseItem: 'base',
			directions: dirs.map((id) => ({ id })),
			rest: Object.fromEntries(dirs.map((d) => [d, { image: h, keypoints: points }])),
			animations: [
				{
					id: 'slash',
					cells: 8,
					loop: false,
					frames: [],
					sources: Object.fromEntries(
						dirs.map((d) => [
							d,
							{
								route: 'skeleton-v3',
								reference: h,
								keypoints: Array(8).fill(points),
								measured: Array(8).fill(points),
								provenance: []
							}
						])
					)
				}
			]
		},
		items: [
			{
				...item,
				id: 'base',
				slot: 'body',
				dressed: undefined,
				layers: [
					{
						id: 'main',
						role: 'fg',
						z: 10,
						cells: { slash: Object.fromEntries(dirs.map((d) => [d, Array(8).fill(h)])) }
					}
				]
			},
			item
		]
	};
	const ctx: RigCtx = {
		rec: {
			id: 'rig-grid',
			savedAt: 'original',
			origin: 'studio',
			manifest,
			skeletons: Object.fromEntries(
				dirs.flatMap((d) =>
					Array.from({ length: 8 }, (_, i) => [
						`slash/${d}/${i}`,
						fromApi(points, manifest.rig.cell)
					])
				)
			)
		},
		project: {
			manifest,
			images: new Map([
				[h, body],
				[ih, reference]
			])
		}
	};
	let current = structuredClone(ctx.rec),
		saved: Item | undefined;
	vi.spyOn(store, 'loadProject').mockImplementation(async () => ({ ...ctx, rec: current }));
	vi.spyOn(db, 'getBlob').mockImplementation(async (hash) => blobs.get(hash));
	const save = vi
		.spyOn(store, 'saveItem')
		.mockImplementation(async (_id, next, _images, _slots, check) => {
			check?.(current);
			saved = next;
			current.manifest.items = current.manifest.items.map((entry) =>
				entry.id === next.id ? next : entry
			);
		});
	const enqueue = vi.spyOn(queue, 'enqueue').mockImplementation(async (req) => {
		if (mode === 'lost' || (mode === 'lost-second' && enqueue.mock.calls.length === 2))
			return { state: 'lost', error: 'unknown test response' } as JobRec;
		const body = req.body as {
			description: string;
			inpainting_image?: { image: { base64: string } };
			edit_images?: { image: { base64: string } }[];
		};
		const raw = (body.inpainting_image ?? body.edit_images![0]).image.base64;
		const grid = mode === 'geometry' ? makeImg(256, 192) : await decodePngBytes(base64ToBytes(raw));
		if (mode === 'redraw-matte' || mode === 'redraw-opaque-shift') {
			const stride = grid.w * 4;
			if (mode === 'redraw-opaque-shift') {
				grid.data.copyWithin(8 * stride, 0, grid.data.length - 8 * stride);
				for (let offset = 0; offset < 8 * stride; offset += 4)
					grid.data.set([110, 255, 110, 255], offset);
			}
			for (let offset = 0; offset < grid.data.length; offset += 4)
				if (
					grid.data[offset] === 110 &&
					grid.data[offset + 1] === 255 &&
					grid.data[offset + 2] === 110
				)
					grid.data.set([111, 249, 110, 255], offset);
		}
		const cols = grid.w / side;
		const targets = Number(/The first (\d+) frames/.exec(body.description)?.[1]);
		for (let i = 0; i < targets && mode !== 'geometry'; i++) {
			const ox = (i % cols) * side,
				oy = Math.floor(i / cols) * side;
			for (let y = mode === 'outside-mask' ? 0 : 9 + pad; y < 31 + pad; y++)
				for (let x = 23 + pad; x < 26 + pad; x++)
					grid.data.set(
						mode === 'palette-second' && enqueue.mock.calls.length === 2
							? [220, 20, 170, 255]
							: [180, 180, 190, 255],
						((oy + y) * grid.w + ox + x) * 4
					);
			if (mode === 'fail')
				for (let y = 35; y < 50; y++)
					for (let x = 45; x < 51; x++)
						grid.data.fill(
							0,
							((oy + y) * grid.w + ox + x) * 4,
							((oy + y) * grid.w + ox + x) * 4 + 4
						);
		}
		if (mode === 'race') current.manifest.rig.pivot.y++;
		if (mode === 'shift-first' && enqueue.mock.calls.length === 1) {
			const stride = grid.w * 4;
			grid.data.copyWithin(stride, 0, grid.data.length - stride);
		}
		if (mode === 'redraw-shift') {
			const stride = grid.w * 4;
			grid.data.copyWithin(stride, 0, grid.data.length - stride);
			grid.data.fill(0, 0, stride);
		}
		const hash = await put(grid);
		return {
			id: 'grid',
			state: 'done',
			endpoint: req.path,
			params: req.body,
			requestHash: 'grid',
			createdAt: 0,
			gens: 10,
			usd: 0,
			jobs: [{ id: 'grid-job', results: [{ label: '0', sha: hash }] }]
		} as unknown as JobRec;
	});
	return { ctx, item, body, save, enqueue, saved: () => saved, current: () => current };
}
test('96px request uses frozen padded frames, measured wrist masks, protected references and a bounded grid', async () => {
	const f = await fixture();
	f.ctx.rec.manifest.rig.animations[0].sources!.west!.keypoints![0][4].x = 0.95;
	const req = await gridRepairRequest(f.ctx, f.item, 'slash', 'west', 123),
		b = req.body as {
			description: string;
			inpainting_image: { image: { base64: string }; size: { width: number; height: number } };
			mask_image: { image: { base64: string } };
		};
	expect(b.inpainting_image.size).toEqual({ width: 384, height: 288 });
	expect(b.description).toContain('96x96');
	expect(b.description).toContain('right hand');
	expect(b.description).toContain('exactly one held item; no effects. Keep every other pixel');
	expect(b.description).not.toContain('empty hands');
	const im = await decodePngBytes(base64ToBytes(b.inpainting_image.image.base64)),
		mask = await decodePngBytes(base64ToBytes(b.mask_image.image.base64));
	expect(mask.data[(46 * 384 + 41) * 4]).toBe(255);
	expect(mask.data[(90 * 384 + 90) * 4]).toBe(0);
	for (let y = 192; y < 288; y++)
		for (let x = 0; x < 384; x++) expect(mask.data[(y * 384 + x) * 4]).toBe(0);
	const expected = inputCell(padImg(f.body, 16), 'green');
	for (let y = 0; y < 96; y++)
		expect([...im.data.subarray(y * 384 * 4, (y * 384 + 96) * 4)]).toEqual([
			...expected.data.subarray(y * 96 * 4, (y + 1) * 96 * 4)
		]);
	expect(f.enqueue).not.toHaveBeenCalled();
});
test('a long blade widens the held repair disc beyond the former fixed 34 px, so its tip stays editable', async () => {
	const maskOf = async (f: Awaited<ReturnType<typeof fixture>>) =>
		decodePngBytes(
			base64ToBytes(
				(
					(await gridRepairRequest(f.ctx, f.item, 'slash', 'west', 123)).body as {
						mask_image: { image: { base64: string } };
					}
				).mask_image.image.base64
			)
		);
	// The wrist sits at (41,46) on the 96 px canvas; (41,91) is 45 px down the blade, outside a 34 px disc.
	const short = await maskOf(await fixture()),
		long = await maskOf(await fixture('pass', 16, 78));
	expect(short.data[(46 * 384 + 41) * 4]).toBe(255);
	expect(short.data[(91 * 384 + 41) * 4]).toBe(0);
	expect(long.data[(91 * 384 + 41) * 4]).toBe(255);
	// Still a disc around the wrist, not the whole cell.
	expect(long.data[(2 * 384 + 90) * 4]).toBe(0);
});
test('successful fixed-frame repair retains96px pivot, other directions and idle while linking real grid provenance', async () => {
	const f = await fixture(),
		before = structuredClone(f.item),
		r = await regridClip(f.ctx, f.item, 'slash', 'west', 123);
	expect(r.saved).toBe(true);
	expect(r.qa.failCalls.size).toBe(0);
	expect(f.enqueue.mock.calls[0][0].path).toBe('/inpaint-v3');
	const item = f.saved()!;
	expect(item.layers[0].cell).toEqual({ w: 96, h: 96 });
	expect(item.layers[0].pivot).toEqual({ x: 48, y: 76 });
	expect(item.layers[0].cells!.idle).toEqual(before.layers[0].cells!.idle);
	expect(item.layers[0].cells!.slash!.south).toEqual(before.layers[0].cells!.slash!.south);
	expect(item.layers[0].cells!.slash!.west).toHaveLength(8);
	expect(item.provenance.at(-1)?.endpoint).toBe('/inpaint-v3');
	expect(f.ctx.rec.manifest.rig).toEqual(f.current().manifest.rig);
});

test('Tier 1 splits a 96px facing and saves eight ordered frames once with per-batch provenance', async () => {
	const f = await fixture();
	const result = await regridClip(f.ctx, f.item, 'slash', 'west', 123, true);
	expect(result.saved).toBe(true);
	expect(f.save).toHaveBeenCalledTimes(1);
	expect(f.enqueue).toHaveBeenCalledTimes(3);
	for (const [request] of f.enqueue.mock.calls) {
		const { size } = (
			request.body as { inpainting_image: { size: { width: number; height: number } } }
		).inpainting_image;
		expect(Math.max(size.width, size.height)).toBeLessThanOrEqual(256);
	}
	expect(f.saved()?.provenance.map((record) => record.produced.length)).toEqual([3, 3, 2]);
	expect(result.cells.map((cell) => cell.key)).toEqual(
		Array.from({ length: 8 }, (_, index) => `slash/west/${index}`)
	);
});

test('Tier 1 offers the finished batch after an unknown second batch, keeping current art without resending', async () => {
	// The lost batch used to throw away the finished, paid first batch; its frames now reach review on their own.
	const f = await fixture('lost-second');
	const before = structuredClone(f.item);
	const result = await regridClip(f.ctx, f.item, 'slash', 'west', 123, true);
	expect(f.enqueue).toHaveBeenCalledTimes(2);
	expect(f.save).not.toHaveBeenCalled();
	expect(result.saved).toBe(false);
	expect(result.review?.kept).toEqual([3, 4, 5, 6, 7]);
	expect(result.review?.replacement).toHaveLength(8);
	await applyRepairReview(f.ctx.rec.id, result.review!);
	expect(f.enqueue).toHaveBeenCalledTimes(2);
	const west = f.saved()!.layers[0].cells!.slash!.west!,
		old = before.layers[0].cells!.slash!.west!;
	expect(west).toHaveLength(8);
	expect(west.slice(3)).toEqual(old.slice(3));
	expect(west.slice(0, 3)).not.toEqual(old.slice(0, 3));
	expect(f.saved()!.baseCut?.slash?.west?.slice(3)).toEqual(before.baseCut?.slash?.west?.slice(3));
	expect(Object.keys(f.saved()!.qa!.cells).filter((key) => key.startsWith('slash/west/'))).toEqual([
		'slash/west/0',
		'slash/west/1',
		'slash/west/2'
	]);
	expect(f.saved()!.qa!.cells['slash/west/0'].provenance).toBe(before.provenance.length);
});

test('a partial repair keeps the joint finding of a frame it did not replace', async () => {
	const f = await fixture('lost-second');
	const summary = {
		minKeyKept: 1,
		maxKeyOutside: 0,
		minAreaRatio: 1,
		maxAreaCV: 0,
		maxPaletteDist: 0,
		clipPx: 0
	};
	f.item.qa = {
		...summary,
		status: 'warn',
		rerolls: 0,
		jointReviewFrames: 1,
		cells: { 'slash/west/5': { route: 'posed', area: 10, jointReview: true } },
		clips: { 'slash/west': { ...summary, status: 'warn', jointReviewFrames: 1 } }
	};
	const result = await regridClip(f.ctx, f.item, 'slash', 'west', 123, true);
	expect(result.review?.kept).toContain(5);
	expect(result.review?.clip.out.qa?.clips['slash/west']?.jointReviewFrames).toBe(1);
	expect(result.review?.clip.out.qa?.jointReviewFrames).toBe(1);
});

test('Tier 1 offers the finished batch when the plan stops allowing a later one', async () => {
	const f = await fixture();
	let checks = 0;
	// Three checks before anything is bought, then one per batch: the second batch is refused.
	vi.spyOn(queue, 'planBlocks').mockImplementation(() =>
		++checks === 5 ? 'Needs PixelLab Tier 2 or higher. No request sent.' : null
	);
	const result = await regridClip(f.ctx, f.item, 'slash', 'west', 123, true);
	expect(f.enqueue).toHaveBeenCalledTimes(1);
	expect(result.saved).toBe(false);
	expect(result.review?.kept).toEqual([3, 4, 5, 6, 7]);
});

test('Tier 1 does not publish a facing with a visibly different batch palette', async () => {
	const f = await fixture('palette-second');
	const result = await regridClip(f.ctx, f.item, 'slash', 'west', 123, true);
	expect(result.saved).toBe(false);
	expect(result.qa.failCalls.get(1)).toEqual(
		expect.arrayContaining([expect.stringMatching(/^G6 /)])
	);
	expect(f.save).not.toHaveBeenCalled();
	expect(result.review?.findings).toEqual(expect.arrayContaining([expect.stringMatching(/^G6 /)]));
	expect(result.review?.clip.out.provenance.map((record) => record.produced.length)).toEqual([
		3, 3, 2
	]);
});

test('Tier 1 sends a shifted first batch to review with the rest it was approved for, never more', async () => {
	// A shift used to stop the later batches and offer only a paid re-roll of that batch; the review now shows it instead.
	const f = await fixture('shift-first');
	const result = await regridClip(f.ctx, f.item, 'slash', 'west', 123, true);
	expect(f.enqueue).toHaveBeenCalledTimes(3);
	expect(result.saved).toBe(false);
	expect(f.save).not.toHaveBeenCalled();
	expect(result.qa.failCalls.get(0)).toEqual(
		expect.arrayContaining([expect.stringMatching(/^G10 /)])
	);
	expect(result.review?.findings).toEqual(expect.arrayContaining([expect.stringMatching(/^G10 /)]));
	expect(result.review?.replacement).toHaveLength(8);
});

test('cache-only repair with missing results does not enqueue or change the item', async () => {
	const f = await fixture();
	await expect(
		regridClip(f.ctx, f.item, 'slash', 'west', 123, true, undefined, true)
	).rejects.toThrow('No generation was requested');
	expect(f.enqueue).not.toHaveBeenCalled();
	expect(f.save).not.toHaveBeenCalled();
});

test.each([
	[64, 192, 10],
	[96, 288, 15],
	[128, 384, 25],
	[160, 480, 25]
])(
	'redraw at %i px submits one %i px sheet, quoted at %i gens, and never auto-applies',
	async (cell, canvas, gens) => {
		const f = await fixture('pass', (cell - 64) / 2);
		expect(repairGridPlan({ w: cell, h: cell }, 8, false, true)).toMatchObject([
			{ w: canvas, h: canvas, gens }
		]);
		const result = await regridClip(
			f.ctx,
			f.item,
			'slash',
			'west',
			123,
			false,
			undefined,
			false,
			true
		);
		expect(result.saved).toBe(false);
		expect(result.review?.current).toHaveLength(8);
		expect(result.review?.replacement).toHaveLength(8);
		expect(f.save).not.toHaveBeenCalled();
		expect(f.enqueue).toHaveBeenCalledTimes(1);
		const request = f.enqueue.mock.calls[0][0];
		expect(request.path).toBe('/edit-images-v2');
		expect(request.body).toMatchObject({
			method: 'edit_with_reference',
			image_size: { width: canvas, height: canvas },
			edit_images: [{ width: canvas, height: canvas }],
			reference_image: { width: cell, height: cell }
		});
		expect(request.body).not.toHaveProperty('mask_image');
		const body = request.body as { edit_images: [{ image: { base64: string } }] };
		const sent = await decodePngBytes(base64ToBytes(body.edit_images[0].image.base64));
		expect(sent.data.every((value, index) => index % 4 !== 3 || value === 255)).toBe(true);
		await applyRepairReview(f.ctx.rec.id, result.review!);
		expect(f.enqueue).toHaveBeenCalledTimes(1);
		expect(f.saved()?.layers[0].cells?.slash?.south).toEqual(f.item.layers[0].cells?.slash?.south);
		expect(f.saved()?.layers[0].pivot).toEqual(f.item.layers[0].pivot);
	}
);

test('a same-size redraw shifted by provider padding warns without replacing current frames', async () => {
	const f = await fixture('redraw-shift');
	const result = await regridClip(
		f.ctx,
		f.item,
		'slash',
		'west',
		123,
		false,
		undefined,
		false,
		true
	);
	expect(result.review?.findings).toContainEqual(expect.stringContaining('shifted the sheet'));
	expect(f.save).not.toHaveBeenCalled();
});

test('redraw describes the unused rows of a padded square and retains the original frame count', async () => {
	const f = await fixture('pass', 0);
	f.ctx.rec.manifest.rig.animations[0].cells = 4;
	f.current().manifest.rig.animations[0].cells = 4;
	const result = await regridClip(
		f.ctx,
		f.item,
		'slash',
		'west',
		123,
		false,
		undefined,
		false,
		true
	);
	expect(f.enqueue.mock.calls[0][0].body).toMatchObject({
		image_size: { width: 192, height: 192 },
		description: expect.stringContaining('top-left 192x128 px of the 192x192 px sheet')
	});
	expect(result.review?.replacement).toHaveLength(4);
});

test.each([
	['redraw-matte', false],
	['redraw-opaque-shift', true]
])(
	'%s distinguishes the sampled live background color from actual mannequin misalignment',
	async (mode, shifted) => {
		const f = await fixture(mode);
		const result = await regridClip(
			f.ctx,
			f.item,
			'slash',
			'west',
			123,
			false,
			undefined,
			false,
			true
		);
		expect(result.review?.findings.some((note) => note.startsWith('G3'))).toBe(shifted);
		if (!shifted) expect(result.review?.findings.some((note) => note.startsWith('G2'))).toBe(false);
		expect(f.save).not.toHaveBeenCalled();
	}
);

test('compact repair submits, masks and decodes the same three-column layout', async () => {
	const f = await fixture('pass', 8),
		result = await regridClip(f.ctx, f.item, 'slash', 'west', 123);
	const request = f.enqueue.mock.calls[0][0].body as {
		description: string;
		inpainting_image: { size: { width: number; height: number } };
		mask_image: { image: { base64: string } };
	};
	expect(request.inpainting_image.size).toEqual({ width: 240, height: 240 });
	expect(request.description).toContain('3x3 grid of 80x80 px frames');
	const mask = await decodePngBytes(base64ToBytes(request.mask_image.image.base64));
	for (let y = 160; y < 240; y++)
		for (let x = 160; x < 240; x++) expect(mask.data[(y * 240 + x) * 4]).toBe(0);
	expect(result.saved).toBe(true);
	expect(result.cells.map((cell) => cell.key)).toEqual(
		Array.from({ length: 8 }, (_, i) => `slash/west/${i}`)
	);
	expect(result.cells.every((cell) => cell.layer.w === 80 && cell.layer.h === 80)).toBe(true);
	expect(f.saved()?.layers[0].pivot).toEqual({ x: 40, y: 68 });
});

test('a production grid repair clips connected provider spill to its submitted mask after all cleanup', async () => {
	const f = await fixture('outside-mask'),
		r = await regridClip(f.ctx, f.item, 'slash', 'west', 123);
	const request = f.enqueue.mock.calls[0][0].body as { mask_image: { image: { base64: string } } };
	const mask = await decodePngBytes(base64ToBytes(request.mask_image.image.base64));
	expect(r.cells).toHaveLength(8);
	for (const [i, c] of r.cells.entries()) {
		expect(c.stencil).toBeDefined();
		expect(c.offset.every((v) => v === 0)).toBe(true);
		expect(c.base.data[(46 * 96 + 41) * 4 + 3]).toBe(255);
		expect(c.layer.data[(46 * 96 + 41) * 4 + 3]).toBe(255); // allowed foreground over the body
		expect(c.layer.data[(4 * 96 + 40) * 4 + 3]).toBe(0); // connected smear outside the paid permission
		const ox = (i % 4) * 96,
			oy = Math.floor(i / 4) * 96;
		for (let y = 0; y < 96; y++)
			for (let x = 0; x < 96; x++)
				if (mask.data[((oy + y) * mask.w + ox + x) * 4] === 0) {
					expect(c.mask[y * 96 + x]).toBe(0);
					expect(c.layer.data[(y * 96 + x) * 4 + 3]).toBe(0);
					expect(c.cut?.[y * 96 + x] ?? 0).toBe(0);
				}
	}
	expect(f.enqueue).toHaveBeenCalledOnce();
});
test('flagged repair preserves old artwork until the saved candidate is applied with no new job', async () => {
	const f = await fixture('fail'),
		before = structuredClone(f.item),
		r = await regridClip(f.ctx, f.item, 'slash', 'west', 123);
	expect(r.saved).toBe(false);
	expect(f.save).not.toHaveBeenCalled();
	expect(f.item).toEqual(before);
	expect(r.review?.current).toHaveLength(8);
	expect(r.review?.replacement).toHaveLength(8);
	expect(r.review?.replacement).not.toEqual(r.review?.current);
	const review = structuredClone(r.review!);
	const stored = f.current().manifest.items.find((item) => item.id === f.item.id)!;
	stored.materials = ['edited while reviewing'];
	stored.hides = ['back'];
	await applyRepairReview(f.ctx.rec.id, review);
	await applyRepairReview(f.ctx.rec.id, review);
	expect(f.enqueue).toHaveBeenCalledOnce();
	expect(f.save).toHaveBeenCalledOnce();
	expect(f.saved()?.materials).toEqual(stored.materials);
	expect(f.saved()?.hides).toEqual(stored.hides);
	expect(f.saved()?.layers[0].cells?.slash?.east).toEqual(before.layers[0].cells?.slash?.east);
	expect(f.saved()?.qa?.clips['slash/west']?.status).toBe('fail');
});
test('applying a reviewed repair cannot overwrite an item edited since generation', async () => {
	const f = await fixture('fail');
	const { review } = await regridClip(f.ctx, f.item, 'slash', 'west', 123);
	f.current().manifest.items.find((item) => item.id === f.item.id)!.layers[0].z++;
	await expect(applyRepairReview(f.ctx.rec.id, review!)).rejects.toThrow('changed while');
	expect(f.saved()).toBeUndefined();
	expect(f.enqueue).toHaveBeenCalledOnce();
});
test.each(['geometry', 'lost'] as const)(
	'invalid or unknown %s output cannot publish',
	async (mode) => {
		const f = await fixture(mode);
		await expect(regridClip(f.ctx, f.item, 'slash', 'west', 123)).rejects.toThrow();
		expect(f.save).not.toHaveBeenCalled();
	}
);
test('a lost repair request says it may have charged', async () => {
	const f = await fixture('lost');
	await expect(regridClip(f.ctx, f.item, 'slash', 'west', 123)).rejects.toMatchObject({
		translation: { key: 'itemRoute.errors.requestLost' }
	});
});
test('concurrent rig edits reject inside the atomic publication guard', async () => {
	const f = await fixture('race');
	await expect(regridClip(f.ctx, f.item, 'slash', 'west', 123)).rejects.toThrow('changed while');
	expect(f.saved()).toBeUndefined();
});

test('export playback preferences do not invalidate frozen-frame equipment repair output', async () => {
	const f = await fixture();
	f.current().manifest.rig.animations[0].loop = true;
	const result = await regridClip(f.ctx, f.item, 'slash', 'west', 123);
	expect(result.saved).toBe(true);
	expect(f.saved()).toBeDefined();
	expect(f.current().manifest.rig.animations[0].loop).toBe(true);
});
test('missing actual measurements, excessive canvas and wrong selected frame identities fail before paid enqueue', async () => {
	const f = await fixture();
	delete f.ctx.rec.skeletons;
	delete f.ctx.rec.manifest.rig.animations[0].sources!.west!.measured;
	await expect(gridRepairRequest(f.ctx, f.item, 'slash', 'west', 1)).rejects.toThrow(
		'measured hand positions'
	);
	for (const cells of [['slash/east/0'], ['slash/west/8'], ['slash/west/0', 'slash/west/0']])
		await expect(gridRepairRequest(f.ctx, f.item, 'slash', 'west', 1, cells)).rejects.toThrow(
			'unique existing frames'
		);
	f.ctx.rec.manifest.rig.animations[0].cells = 30;
	await expect(gridRepairRequest(f.ctx, f.item, 'slash', 'west', 1)).rejects.toThrow('512');
	expect(f.enqueue).not.toHaveBeenCalled();
});

test('an out-of-cell observed wrist cannot create an empty off-canvas paid mask', async () => {
	const f = await fixture();
	f.ctx.rec.skeletons!['slash/west/0']['RIGHT ARM'].x = 1000;
	await expect(gridRepairRequest(f.ctx, f.item, 'slash', 'west', 1)).rejects.toThrow(
		'valid measured hand positions'
	);
	expect(f.enqueue).not.toHaveBeenCalled();
});

test('standing views an item lacks are rebuilt from its saved designs without a call', async () => {
	const { restorableViews, restoreStandingViews } = await import('../../src/lib/items/run.ts');
	const f = await fixture(),
		m = f.current().manifest,
		dirs = m.rig.directions.map((d) => d.id),
		body = m.rig.rest!.south!.image,
		joints = m.rig.rest!.south!.keypoints;
	// A standing move whose body is the registered rest view, as an imported character has.
	m.rig.animations.push({
		id: 'default',
		cells: 1,
		loop: true,
		frames: [],
		sources: Object.fromEntries(
			dirs.map((d) => [
				d,
				{
					route: 'import',
					reference: body,
					keypoints: [joints],
					measured: [joints],
					motion: 'imported-rest',
					provenance: []
				}
			])
		)
	});
	m.items[0].layers[0].cells!.default = Object.fromEntries(dirs.map((d) => [d, [body]]));
	for (const d of dirs) f.current().skeletons![`default/${d}/0`] = fromApi(joints, m.rig.cell);
	const sword = m.items[1];
	sword.coverage = [];
	sword.provenance = [
		{
			endpoint: '/edit-animation-v2',
			params: {},
			seed: 1,
			requestHash: `sha256:${'d'.repeat(64)}`,
			createdAt: '2026-11-01T00:00:00.000Z',
			produced: dirs.map((d) => `rest/${d}/0` as const)
		}
	];
	const views = dirs.map((d) => `default/${d}/0`);
	expect(restorableViews(m, sword)).toEqual(views);
	expect(await restoreStandingViews('rig-grid', 'sword')).toEqual(views);
	const saved = f.saved()!,
		frames = (layer: number) => dirs.map((d) => saved.layers[layer].cells!.default![d]![0]);
	// One design and one body in every view here: every view gets the same art, and the blade is in it.
	expect(new Set(frames(0)).size).toBe(1);
	expect(frames(0)[0] ?? frames(1)[0]).toMatch(/^sha256:/);
	expect(saved.coverage).toEqual(views);
	expect(saved.provenance).toEqual(sword.provenance);
	const checks = saved.qa!.cells as Record<string, { provenance?: number }>;
	expect(views.map((key) => checks[key].provenance)).toEqual([0, 0, 0, 0]);
	expect(saved.layers[0].cells!.slash).toEqual(sword.layers[0].cells!.slash);
	expect(f.enqueue).not.toHaveBeenCalled();
	// Nothing is left to restore, and a copy drawn for another body never qualifies.
	expect(await restoreStandingViews('rig-grid', 'sword')).toEqual([]);
	expect(restorableViews(m, { ...sword, unfitted: [] })).toEqual([]);
});

test('an item repair request carries the Activity title the Studio names it by', async () => {
	const f = await fixture();
	const title = (anim: string, dir: DirectionName) =>
		({
			key: 'activity.titleItemView',
			vars: { item: 'Sword', move: anim, direction: dir }
		}) as const;
	await regridClip(f.ctx, f.item, 'slash', 'west', 123, false, undefined, false, false, title);
	expect(f.enqueue.mock.calls[0][1]).toMatchObject({ title: title('slash', 'west') });
});
