// The item-on-move sheet (docs/research/2026-11-23-item-move-route-cost.md): layout, price, eligibility, registration, crop
// edges, salvage and review, on a synthetic 92 px character (test/fixtures/item-sheet.ts) and on the stored 64 px hair sheet
// PixelLab returned for the repository's own demo fixture (test/fixtures/item-sheet/hair64-*, 0 generations).
import { afterEach, beforeEach, expect, test, vi } from 'vitest';
import { readFile } from 'node:fs/promises';
import {
	ITEM_SHEET,
	canSheet,
	cropEdgeContact,
	gridEstimate,
	itemDrawingFor,
	itemSheetLayout,
	itemSheetWindows,
	meanSideGens,
	repairGridPlan,
	sheetOffset,
	translate,
	uncropCell,
	type ItemSheetCell
} from '../../src/lib/items/items.ts';
import {
	applyRepairReview,
	itemSheetRequest,
	readItemSheet,
	sheetItemMove,
	type RigCtx
} from '../../src/lib/items/run.ts';
import {
	itemMoveOffer,
	itemMoveReviewMatches,
	missingItemMoves,
	moveMinimumTier
} from '../../src/studio/create.ts';
import { clipItemOffer } from '../../src/studio/itemGeneration.ts';
import { movePlan } from '../../src/studio/apiPlans.ts';
import { loadFixture } from '../../src/lib/compose/fixture.ts';
import { cellHash } from '../../src/lib/rig/rig.ts';
import { makeImg, type Img } from '../../src/lib/image/png.ts';
import { decodePngBytes, encodePngBytes } from '../../src/lib/image/pngraw.ts';
import { sha256 } from '../../src/lib/image/hash.ts';
import * as db from '../../src/lib/store/db.ts';
import * as store from '../../src/lib/store/project.ts';
import { saveItem } from '../../src/lib/store/project.ts';
import { queue, requestIdentity, type JobRec } from '../../src/lib/pixellab/queue.ts';
import type { Req } from '../../src/lib/pixellab/routes.ts';
import type { DirectionName, Manifest } from '../../src/lib/store/manifest.ts';
import { answer, sheetCharacter } from '../fixtures/item-sheet.ts';

const ledger = vi.hoisted(() => ({
	records: [] as JobRec[],
	listeners: new Set<(s: { jobs: JobRec[] }) => void>(),
	blobs: new Map<string, Blob>(),
	billed: 0,
	respond: undefined as undefined | ((sent: Img) => Img)
}));
vi.mock('../../src/lib/pixellab/queue.ts', async (original) => ({
	...(await original<typeof import('../../src/lib/pixellab/queue.ts')>()),
	queue: {
		subscribe: (cb: (s: { jobs: JobRec[] }) => void) => {
			ledger.listeners.add(cb);
			cb({ jobs: ledger.records });
			return () => ledger.listeners.delete(cb);
		},
		enqueue: vi.fn(),
		planBlocks: () => null
	}
}));
vi.mock('../../src/lib/store/project.ts', async (original) => ({
	...(await original<typeof import('../../src/lib/store/project.ts')>()),
	saveItem: vi.fn(async () => {})
}));
beforeEach(() => {
	ledger.records.splice(0);
	ledger.blobs.clear();
	ledger.billed = 0;
	ledger.respond = undefined;
	vi.mocked(saveItem).mockClear();
	vi.spyOn(db, 'getBlob').mockImplementation(async (h) => ledger.blobs.get(h));
	vi.mocked(queue.enqueue)
		.mockReset()
		.mockImplementation(async (req: Req) => {
			expect(req.path).toBe('/edit-images-v2');
			const { requestHash: id } = await requestIdentity(req),
				old = ledger.records.find((r) => r.id === id);
			if (old) return old;
			const body = req.body as { edit_images: { image: { base64: string } }[] };
			const sent = await decodePngBytes(
				Uint8Array.from(atob(body.edit_images[0].image.base64), (c) => c.charCodeAt(0))
			);
			const bytes = await encodePngBytes(ledger.respond!(sent)),
				sha = await sha256(bytes);
			ledger.blobs.set(sha, new Blob([bytes as Uint8Array<ArrayBuffer>]));
			ledger.billed++;
			const rec = {
				id,
				state: 'done',
				method: req.method,
				endpoint: req.path,
				params: req.body,
				requestHash: id,
				createdAt: 0,
				gens: 15,
				usd: 0,
				jobs: [{ results: [{ label: '0', sha }], done: true }]
			} as unknown as JobRec;
			ledger.records.push(rec);
			ledger.listeners.forEach((cb) => cb({ jobs: ledger.records }));
			return rec;
		});
});
afterEach(() => vi.restoreAllMocks());

const DIRS: DirectionName[] = ['south', 'east', 'north'];
const fixture = (name: string) => new URL(`../fixtures/item-sheet/${name}`, import.meta.url);
const png = async (name: string) => decodePngBytes(new Uint8Array(await readFile(fixture(name))));
async function remember(images: Map<string, Img>, im: Img) {
	const h = await cellHash(im);
	images.set(h, im);
	ledger.blobs.set(h.slice(7), new Blob([(await encodePngBytes(im)) as Uint8Array<ArrayBuffer>]));
	return h;
}
/** The synthetic character as a saved record, its images also served as stored blobs. */
async function character(o: Parameters<typeof sheetCharacter>[0] = {}) {
	const c = await sheetCharacter(o);
	for (const [h, im] of c.images)
		ledger.blobs.set(h.slice(7), new Blob([(await encodePngBytes(im)) as Uint8Array<ArrayBuffer>]));
	const ctx = {
		rec: { id: 'rig-item-sheet', savedAt: '', origin: 'studio', manifest: c.manifest },
		project: { manifest: c.manifest, images: c.images }
	} as RigCtx;
	return { ...c, ctx, m: c.manifest, item: c.manifest.items.find((i) => i.id === 'jeans')! };
}
const walk = (m: Manifest) => m.rig.animations.find((a) => a.id === 'walk')!;
/** The offer for walk with Settings on the sheet, and its request. */
async function sheetOffer(c: Awaited<ReturnType<typeof character>>, dirs = DIRS) {
	const [spec] = missingItemMoves(c.m, 'jeans', 'sheet', 7, c.images, dirs);
	const request = await itemSheetRequest(c.ctx, c.item, 'walk', spec.dirs!, 7, spec.itemSheet!);
	return { spec, ...request };
}

test('the sheet is priced by its mean side with the 336 edge, never below the receipts', () => {
	expect(meanSideGens(256, 256)).toBe(10);
	expect(meanSideGens(257, 256)).toBe(15);
	expect(meanSideGens(336, 336)).toBe(15);
	expect(meanSideGens(392, 270)).toBe(15); // receipt: 15
	expect(meanSideGens(337, 336)).toBe(25);
	expect(meanSideGens(392, 284)).toBe(25); // receipt: 15 (mean 338); the 336 edge over-quotes, never under
	expect(meanSideGens(392, 360)).toBe(25); // receipt: 25
	// The inpaint grid and Redraw prices are unchanged.
	expect(gridEstimate({ w: 84, h: 84 }, 15, 1).gens).toBe(15);
	expect(gridEstimate({ w: 64, h: 64 }, 7, 1).gens).toBe(10);
	expect(repairGridPlan({ w: 92, h: 92 }, 6, false, true)[0]).toMatchObject({ w: 276, gens: 15 });
});

test.each([
	// whole-frame cells (as the cost planner plans them): frame, views, frames, sheet or undefined (drawn anchored instead)
	[64, 3, 6, { w: 448, h: 192, gens: 15 }],
	[80, 3, 6, undefined],
	[92, 3, 4, { w: 460, h: 276, gens: 25 }],
	[92, 3, 6, undefined],
	[92, 5, 4, { w: 460, h: 460, gens: 25 }],
	[128, 3, 3, { w: 512, h: 384, gens: 25 }],
	[128, 3, 4, undefined],
	[256, 3, 1, undefined]
])('%i px frames, %i views, %i frames: one-sheet fit and price', (frame, views, frames, sheet) => {
	const layout = itemSheetLayout({ w: frame, h: frame }, views, frames);
	if (sheet) expect(layout).toMatchObject({ ...sheet, cols: frames + 1, rows: views });
	else expect(layout).toBeUndefined();
});

test('the measured row layout of the research (56x90 cells) fits and prices as billed', () => {
	expect(itemSheetLayout({ w: 56, h: 90 }, 3, 6)).toEqual({
		cols: 7,
		rows: 3,
		w: 392,
		h: 270,
		gens: 15
	});
	expect(itemSheetLayout({ w: 56, h: 90 }, 4, 6)?.gens).toBe(25);
	expect(itemSheetLayout({ w: 56, h: 90 }, 1, 6)?.gens).toBe(10); // a one-view salvage sheet
	expect(itemSheetLayout({ w: 56, h: 90 }, 3, 9)).toBeUndefined(); // 10 x 56 = 560 px
});

test('crop windows keep a 4 px margin around every frame and the reference, one cell size for all views', async () => {
	const W = 92,
		m = {
			rig: { cell: { w: W, h: W } },
			items: [
				{
					slot: 'body',
					layers: [{ cells: { walk: { south: ['b0', 'b1'], east: ['e0', null] } } }]
				}
			]
		} as unknown as Manifest;
	const box = (x0: number, y0: number, x1: number, y1: number) => {
		const im = makeImg(W, W);
		for (let y = y0; y <= y1; y++)
			for (let x = x0; x <= x1; x++) im.data[(y * W + x) * 4 + 3] = 255;
		return im;
	};
	const images = new Map([
		['b0', box(30, 10, 50, 80)],
		['b1', box(28, 12, 52, 84)],
		['rs', box(25, 8, 55, 82)], // the dressed reference is wider than the body
		['e0', box(2, 5, 40, 90)], // near the frame edge and taller than the frame allows with margins
		['re', box(4, 6, 38, 88)]
	]);
	const item = { dressed: { south: 'rs', east: 're' } } as never;
	const sheet = itemSheetWindows(m, images, item, 'walk', ['south', 'east'])!;
	// South spans 25..55 x 8..84 (31 x 77), east 2..40 x 5..90 (39 x 86): width 39 + 8, height capped at the frame.
	expect(sheet.cell).toEqual({ w: 47, h: 92 });
	expect(sheet.windows.south).toEqual({ x: 17, y: 0 });
	expect(sheet.windows.east).toEqual({ x: 0, y: 0 });
	const { x, y } = sheet.windows.south!;
	expect(25 - x).toBeGreaterThanOrEqual(ITEM_SHEET.margin);
	expect(x + sheet.cell.w - 1 - 55).toBeGreaterThanOrEqual(ITEM_SHEET.margin);
	expect(y + sheet.cell.h).toBeLessThanOrEqual(W);
	// A view with a missing image or a frame that is not loaded is not measured.
	expect(itemSheetWindows(m, images, { dressed: { south: 'rs' } } as never, 'walk', ['east'])).toBe(
		undefined
	);
	images.delete('b1');
	expect(itemSheetWindows(m, images, item, 'walk', ['south'])).toBeUndefined();
});

test('registration finds whole-sheet offsets up to ±5 px and moves the cut origin without losing pixels', () => {
	const sent = makeImg(60, 30);
	for (let y = 0; y < 30; y++)
		for (let x = 0; x < 60; x++)
			if (Math.imul(x * 73 + y * 151, 2654435761) >>> 29 < 3) sent.data[(y * 60 + x) * 4 + 3] = 255;
	for (const [dx, dy] of [
		[0, 0],
		[2, -1],
		[5, 5],
		[-5, -5],
		[-5, 3]
	] as [number, number][])
		expect(sheetOffset(sent, translate(sent, dx, dy))).toEqual([dx, dy]);
	// A cell at the sheet edge, returned shifted toward it: the moved cut origin keeps every returned pixel of the cell.
	const sheet = makeImg(20, 10);
	for (let y = 0; y < 10; y++) for (let x = 10; x < 20; x++) sheet.data[(y * 20 + x) * 4 + 3] = 255;
	const shifted = translate(sheet, -2, 0);
	expect(sheetOffset(sheet, shifted)).toEqual([-2, 0]);
	const out = uncropCell(shifted, 10 - 2, 0, { w: 10, h: 10 }, { x: 0, y: 0 }, { w: 10, h: 10 });
	let kept = 0;
	for (let p = 0; p < 100; p++) kept += +!!out.data[p * 4 + 3];
	expect(kept).toBe(100);
});

test('an item reaching an inner edge of its crop window is seen; the frame border is G7 own case', () => {
	const layer = makeImg(92, 92),
		window = { x: 20, y: 0 },
		cell = { w: 50, h: 92 };
	layer.data[(40 * 92 + 45) * 4 + 3] = 255;
	expect(cropEdgeContact(layer, window, cell, { w: 92, h: 92 })).toBe(false);
	layer.data[(40 * 92 + 20) * 4 + 3] = 255; // the window's left edge, inside the frame
	expect(cropEdgeContact(layer, window, cell, { w: 92, h: 92 })).toBe(true);
	const top = makeImg(92, 92);
	top.data[(0 * 92 + 45) * 4 + 3] = 255; // the window's top edge is the frame's own edge
	expect(cropEdgeContact(top, window, cell, { w: 92, h: 92 })).toBe(false);
});

test('one rule offers the sheet only to eligible items and falls back to the route that will run', async () => {
	const { m, item } = await character(),
		move = walk(m),
		sheet = { anim: 'walk', cell: { w: 40, h: 90 }, frames: 6 };
	expect(canSheet(m, item, DIRS)).toBe(true);
	expect(itemDrawingFor(m, item, move, 'sheet', DIRS, sheet)).toBe('sheet');
	expect(itemDrawingFor(m, item, { itemDrawing: 'sheet' }, 'skeleton', DIRS, sheet)).toBe('sheet');
	// No measurement, a sheet that does not fit, a 64 or 256 px frame or a diagonal view: drawn on the move's frames.
	expect(itemDrawingFor(m, item, move, 'sheet', DIRS)).toBe('anchor');
	expect(itemDrawingFor(m, item, move, 'sheet', DIRS, { ...sheet, frames: 12 })).toBe('anchor');
	for (const size of [64, 256]) {
		const other = { ...m, rig: { ...m.rig, cell: { w: size, h: size } } };
		expect(itemDrawingFor(other, item, move, 'sheet', DIRS, sheet)).toBe('anchor');
	}
	const diagonal = {
		...m,
		rig: { ...m.rig, directions: [...m.rig.directions, { id: 'south-east' as const }] }
	};
	expect(itemDrawingFor(diagonal, item, move, 'sheet', DIRS, sheet)).toBe('anchor');
	// A view without a standing design cannot be anchored either: posed.
	expect(itemDrawingFor(m, item, move, 'sheet', ['south', 'west'], sheet)).toBe('skeleton');
	// A held item is posed, even where an anchored one would be drawn on the frames.
	const held = {
		...m,
		slots: m.slots.map((s) => (s.id === item.slot ? { ...s, class: 'held' as const } : s))
	};
	expect(itemDrawingFor(held, item, move, 'sheet', DIRS, sheet)).toBe('skeleton');
	expect(itemDrawingFor(held, item, move, 'anchor', DIRS)).toBe('anchor');
	// Items made by frame editing take the sheet when eligible and stay anchored otherwise.
	const edited = { ...item, route: 'ea2-anchor' as const };
	expect(itemDrawingFor(m, edited, move, 'sheet', DIRS, sheet)).toBe('sheet');
	expect(itemDrawingFor(m, edited, move, 'skeleton', DIRS, sheet)).toBe('anchor');
	// The existing choices are unchanged by a measured sheet.
	expect(itemDrawingFor(m, item, move, 'anchor', DIRS, sheet)).toBe('anchor');
	expect(itemDrawingFor(m, item, move, 'skeleton', DIRS, sheet)).toBe('skeleton');
	expect(itemDrawingFor(m, item, { itemDrawing: 'skeleton' }, 'sheet', DIRS, sheet)).toBe(
		'skeleton'
	);
});

test('a completed prompt over the 2,000-character limit falls back, whether the item text or the per-row action is long', async () => {
	const { m, item } = await character(),
		sheet = { anim: 'walk', cell: { w: 40, h: 90 }, frames: 6 };
	expect(
		itemDrawingFor(m, { ...item, prompt: 'faded '.repeat(140) }, walk(m), 'sheet', DIRS, sheet)
	).toBe('anchor');
	// The move's action words repeat once per row.
	const long = 'spinning_' + 'x'.repeat(560);
	expect(itemDrawingFor(m, item, walk(m), 'sheet', DIRS, { ...sheet, anim: long })).toBe('anchor');
	expect(itemDrawingFor(m, item, walk(m), 'sheet', ['south'], { ...sheet, anim: long })).toBe(
		'sheet'
	);
});

test('the offer, API peek and minimum tier show the one edit-images-v2 sheet that will run', async () => {
	const c = await character(),
		{ spec, req, sent, plan } = await sheetOffer(c);
	expect(spec).toMatchObject({ id: 'walk', dirs: DIRS, itemMethod: 'sheet' });
	const layout = itemSheetLayout(spec.itemSheet!, 3, 6)!;
	expect([sent.w, sent.h]).toEqual([layout.w, layout.h]);
	const offer = itemMoveOffer(c.m, [spec]);
	expect(offer.gens).toBe(layout.gens);
	const calls = movePlan(c.ctx.rec, offer.specs[0]).filter((x) => x.method === 'POST');
	expect(calls.map((x) => [x.path, x.generations])).toEqual([['/edit-images-v2', layout.gens]]);
	expect(moveMinimumTier(c.m, offer.specs[0])).toBe(1);
	// Without the loaded frames the sheet cannot be measured, so the offer is the anchored route that would run.
	const [anchored] = missingItemMoves(c.m, 'jeans', 'sheet', 7);
	expect(anchored).toMatchObject({ itemMethod: 'anchor' });
	expect(itemMoveOffer(c.m, [anchored]).gens).toBe(60);
	expect(plan.filter((x) => x.ref).map((x) => x.key)).toEqual([
		'default/south/0',
		'default/east/0',
		'default/north/0'
	]);
	const body = req.body as {
		method: string;
		description: string;
		no_background: boolean;
		seed: number;
	};
	expect(body).toMatchObject({ method: 'edit_with_text', no_background: true, seed: 7 });
	expect(body.description).toContain(
		'Row 3: frame 1 is the reference design facing north (back view)'
	);
	// A changed measurement refuses before anything is sent.
	await expect(
		itemSheetRequest(c.ctx, c.item, 'walk', DIRS, 7, {
			...spec.itemSheet!,
			w: spec.itemSheet!.w + 1
		})
	).rejects.toThrow('changed since its sheet was priced');
});

test('a reviewed sheet refuses on resume when the slot its prompt reads changed, instead of sending another request', async () => {
	const c = await character(),
		{ spec } = await sheetOffer(c),
		reviewed = itemMoveOffer(c.m, [spec]).specs[0];
	expect(itemMoveReviewMatches(c.m, reviewed)).toBe(true);
	const before = await requestIdentity(
		(await itemSheetRequest(c.ctx, c.item, 'walk', DIRS, 7, spec.itemSheet!)).req
	);
	// The slot's creative hint changes while the request is pending: the same spec and seed would build another request.
	c.m.slots = c.m.slots.map((s) =>
		s.id === 'legs' ? { ...s, promptTemplate: 'tattered hems' } : s
	);
	const after = await requestIdentity(
		(await itemSheetRequest(c.ctx, c.item, 'walk', DIRS, 7, spec.itemSheet!)).req
	);
	expect(after.requestHash).not.toBe(before.requestHash);
	// addMove checks the reviewed scope (assertReview) before it builds the request: the change is caught there.
	expect(itemMoveReviewMatches(c.m, reviewed)).toBe(false);
});

test('the views a Move Review accepted are applied before the route is chosen and the sheet measured', async () => {
	// East spreads its arms: with all three views the sheet is too wide, so the offer falls back; south alone fits.
	const c = await character({ wideEast: true });
	expect(missingItemMoves(c.m, 'jeans', 'sheet', 7, c.images)[0]).toMatchObject({
		itemMethod: 'anchor'
	});
	const offer = clipItemOffer(c.m, 'jeans', 'walk', 'sheet', {
		images: c.images,
		dirs: ['south'],
		seed: 7
	})!;
	expect(offer.specs[0]).toMatchObject({ dirs: ['south'], itemMethod: 'sheet' });
	expect(offer.specs[0].itemSheet).toEqual(
		itemSheetWindows(c.m, c.images, c.item, 'walk', ['south'])!.cell
	);
});

test('a returned sheet shifted by (2, -1) registers, extracts and passes every view', async () => {
	const c = await character(),
		{ sent, plan, cell } = await sheetOffer(c);
	const got = answer(sent, plan, cell, c.jeans, () => 'jeans', [2, -1]);
	const read = await readItemSheet(c.ctx, c.item, 'walk', { sent, got, cell, plan });
	expect(read.offset).toEqual([2, -1]);
	expect(read.failed).toEqual([]);
	expect(read.empty).toEqual([]);
	expect(read.edges).toEqual([]);
	expect(read.cells).toHaveLength(18);
	for (const x of read.cells) expect(x.area).toBeGreaterThan(100);
});

test('a four-view sheet passes its four views', async () => {
	const c = await character({ west: true }),
		{ spec, sent, plan, cell } = await sheetOffer(c, [...DIRS, 'west']);
	expect(spec.dirs).toEqual([...DIRS, 'west']);
	const got = answer(sent, plan, cell, c.jeans, () => 'jeans');
	const read = await readItemSheet(c.ctx, c.item, 'walk', { sent, got, cell, plan });
	expect(read.cells).toHaveLength(24);
	expect(read.failed).toEqual([]);
});

test('an item cut at an inner crop edge becomes a review finding', async () => {
	const c = await character(),
		{ sent, plan, cell } = await sheetOffer(c);
	const window = plan.find((x) => x.key === 'walk/south/2')!.window;
	const art = (dir: DirectionName, i: number) => {
		const im = c.jeans(dir, i);
		if (dir === 'south' && i === 2)
			for (let y = 50; y < 60; y++) im.data.set([58, 84, 150, 255], (y * 92 + window.x) * 4);
		return im;
	};
	const read = await readItemSheet(c.ctx, c.item, 'walk', {
		sent,
		got: answer(sent, plan, cell, art, () => 'jeans'),
		cell,
		plan
	});
	expect(read.edges).toEqual([
		'G7 walk/south/2: the item reaches the edge of its sheet cell and may be cut there'
	]);
});

test('the failed 64 px hair sheet fails only its south view', async () => {
	const project = await loadFixture(
		async (path) =>
			new Uint8Array(await readFile(new URL(`../../public/fixtures/s2/${path}`, import.meta.url)))
	);
	const m = project.manifest,
		hair = m.items.find((i) => i.id === 'hair_brown')!,
		body = m.items.find((i) => i.slot === 'body')!.layers[0].cells!.walk!,
		refs = await png('hair64-ref.png');
	// The research rebuilt the demo's missing dressed references from walk frame 0 with the item composited (S, E, N).
	hair.key = 'green';
	hair.standing = 'walk';
	hair.dressed = {};
	m.rig.rest = {};
	for (const [i, dir] of DIRS.entries()) {
		const ref = makeImg(64, 64);
		for (let y = 0; y < 64; y++)
			ref.data.set(
				refs.data.subarray((y * 192 + i * 64) * 4, (y * 192 + i * 64 + 64) * 4),
				y * 256
			);
		hair.dressed[dir] = (await remember(project.images, ref)) as never;
		m.rig.rest[dir] = { image: body[dir]![0]!, keypoints: [] };
	}
	const ctx = {
		rec: { id: 'rig-s2', savedAt: '', origin: 'studio', manifest: m },
		project
	} as RigCtx;
	const plan = JSON.parse(await readFile(fixture('hair64-plan.json'), 'utf8')) as {
		cells: {
			key: string;
			dir: DirectionName;
			ref?: boolean;
			x: number;
			y: number;
			win: { x: number; y: number; w: number; h: number };
		}[];
	};
	const cells: ItemSheetCell[] = plan.cells
		.filter((c) => c.ref || c.key.startsWith('walk/'))
		.map((c) => ({ key: c.key, dir: c.dir, ref: !!c.ref, x: c.x, y: c.y, window: c.win }));
	const read = await readItemSheet(ctx, hair, 'walk', {
		sent: await png('hair64-sent.png'),
		got: await png('hair64-got.png'),
		cell: { w: plan.cells[0].win.w, h: plan.cells[0].win.h },
		plan: cells
	});
	expect(read.failed).toEqual(['south']);
	expect(read.empty).toEqual([]);
});

test('salvage keeps passing views, offers failed but usable views unselected and leaves empty views missing', async () => {
	const c = await character(),
		{ spec, plan, cell } = await sheetOffer(c);
	// South is drawn well; north redrew the body (fails G2, still usable); east came back empty.
	ledger.respond = (sent) =>
		answer(sent, plan, cell, c.jeans, (dir) =>
			dir === 'south' ? 'jeans' : dir === 'north' ? 'naked' : 'erase'
		);
	const review = await sheetItemMove(c.ctx, c.item, 'walk', DIRS, 7, spec.itemSheet!);
	expect(ledger.billed).toBe(1);
	expect(saveItem).not.toHaveBeenCalled(); // reviewed before saving
	expect(review.skipped).toEqual(['east']);
	expect(review.failed).toEqual(['north']);
	expect(review.views?.map((v) => v.dir)).toEqual([
		...Array(6).fill('south'),
		...Array(6).fill('north')
	]);
	expect(Object.keys(review.clip.out.layers[0].cells!.walk!)).toEqual(['south', 'north']);
	expect(Object.keys(review.passClip!.out.layers[0].cells!.walk!)).toEqual(['south']);
	expect(review.findings.some((f) => f.includes('walk/north'))).toBe(true);
	// A reload reattaches to the reviewed request; saved-frame recovery never sends one.
	await sheetItemMove(c.ctx, c.item, 'walk', DIRS, 7, spec.itemSheet!);
	await sheetItemMove(c.ctx, c.item, 'walk', DIRS, 7, spec.itemSheet!, { savedOnly: true });
	expect(ledger.billed).toBe(1);
	await expect(
		sheetItemMove(c.ctx, c.item, 'walk', DIRS, 8, spec.itemSheet!, { savedOnly: true })
	).rejects.toThrow('No generation was requested');
	// Saving keeps the passing views by default, and the failed one only on request.
	vi.spyOn(store, 'loadProject').mockResolvedValue(c.ctx);
	await applyRepairReview(c.ctx.rec.id, review);
	expect(Object.keys(vi.mocked(saveItem).mock.calls[0][1].layers[0].cells!.walk!)).toEqual([
		'south'
	]);
	await applyRepairReview(c.ctx.rec.id, review, true);
	expect(Object.keys(vi.mocked(saveItem).mock.calls[1][1].layers[0].cells!.walk!)).toEqual([
		'south',
		'north'
	]);
	// The views left missing are offered again on their own, as a one-row sheet.
	const kept = structuredClone(c.m);
	kept.items = kept.items.map((i) => (i.id === c.item.id ? review.passClip!.out : i));
	const [rest] = missingItemMoves(
		kept,
		'jeans',
		'sheet',
		9,
		new Map([...c.images, ...review.passClip!.images])
	);
	expect(rest).toMatchObject({ dirs: ['east', 'north'], itemMethod: 'sheet' });
});

test('when no view passes but some are usable the review still opens with nothing chosen', async () => {
	const c = await character(),
		{ spec, plan, cell } = await sheetOffer(c);
	ledger.respond = (sent) => answer(sent, plan, cell, c.jeans, () => 'naked');
	const review = await sheetItemMove(c.ctx, c.item, 'walk', DIRS, 7, spec.itemSheet!);
	expect(review.failed).toEqual(DIRS);
	expect(review.passClip).toBeUndefined();
	vi.spyOn(store, 'loadProject').mockResolvedValue(c.ctx);
	await expect(applyRepairReview(c.ctx.rec.id, review)).rejects.toThrow('Choose the views');
	expect(saveItem).not.toHaveBeenCalled();
	await applyRepairReview(c.ctx.rec.id, review, true);
	expect(saveItem).toHaveBeenCalledOnce();
});

test('a sheet with no item in any view keeps nothing and says so', async () => {
	const c = await character(),
		{ spec } = await sheetOffer(c);
	ledger.respond = (sent) => makeImg(sent.w, sent.h);
	await expect(sheetItemMove(c.ctx, c.item, 'walk', DIRS, 7, spec.itemSheet!)).rejects.toThrow(
		'PixelLab drew no item in any view'
	);
	expect(saveItem).not.toHaveBeenCalled();
});
