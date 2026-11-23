import { readFile } from 'node:fs/promises';
import { expect, test } from 'vitest';
import { bakedFrame, composeCell } from '../../src/lib/compose/compose.ts';
import { loadFixture } from '../../src/lib/compose/fixture.ts';
import { exportManifest } from '../../src/lib/export/generic.ts';
import { unityJson } from '../../src/lib/export/unity.ts';
import { makeImg, type Img } from '../../src/lib/image/png.ts';
import {
	frameFacts,
	frameIssue,
	freeOf,
	makeRoom,
	reframeCharacter,
	canvasLift,
	roomFrame,
	roomShort,
	standingRoom,
	type FrameFacts
} from '../../src/lib/rig/reframe.ts';
import { normalize } from '../../src/lib/rig/normalize.ts';
import { rehash } from '../../src/lib/rig/directions.ts';
import { cellHash, DEFAULT_MOVE, type Sha256 } from '../../src/lib/rig/rig.ts';
import type { Project } from '../../src/lib/store/manifest.ts';
import type { StoredProject } from '../../src/lib/store/project.ts';
import { stateGenerationSource, stateSourceFits } from '../../src/studio/stateGenerationSource.ts';

const fixture = () =>
	loadFixture(
		async (path) =>
			new Uint8Array(await readFile(new URL(`../../public/fixtures/s2/${path}`, import.meta.url)))
	);
const shift = (im: Img, p: number, dy = 0): Img => {
	const out = makeImg(im.w + 2 * p, im.h + 2 * p);
	for (let y = 0; y < im.h; y++)
		for (let x = 0; x < im.w; x++) {
			const X = x + p,
				Y = y + p + dy;
			if (X >= 0 && Y >= 0 && X < out.w && Y < out.h)
				out.data.set(
					im.data.subarray((y * im.w + x) * 4, (y * im.w + x + 1) * 4),
					(Y * out.w + X) * 4
				);
		}
	return out;
};

/** The s2 fixture plus every stored structure that carries pixel coordinates: a padded held layer (rig + 2 × 16, as the S5
 *  route stores it), a body cut, Fix frames history, standing and move keypoints, skeletons and anchors. */
async function character(): Promise<{
	rec: StoredProject;
	project: Project;
	history: Map<Sha256, Img>;
}> {
	const project = await fixture(),
		m = project.manifest,
		c = m.rig.cell.w;
	const add = async (im: Img) => {
		const h = await cellHash(im);
		project.images.set(h, im);
		return h;
	};
	const sword = m.items.find((i) => i.slot === 'main_hand')!;
	for (const layer of sword.layers) {
		layer.cell = { w: c + 32, h: c + 32 };
		layer.pivot = { x: m.rig.pivot.x + 16, y: m.rig.pivot.y + 16 };
		for (const rows of Object.values(layer.cells ?? {}))
			for (const [dir, row] of Object.entries(rows ?? {}))
				rows![dir as keyof typeof rows] = await Promise.all(
					row!.map(async (h) => (h ? add(shift(project.images.get(h)!, 16)) : null))
				);
	}
	const hat = m.items.find((i) => i.slot !== 'body' && i.slot !== 'main_hand')!;
	hat.baseCut = { walk: { south: [[3 + 20 * c, 9 + 40 * c], null] } };
	const south = m.items[0].layers[0].cells!.walk!.south!;
	const before = south[0]!,
		history = new Map<Sha256, Img>();
	const old = shift(project.images.get(before)!, 0);
	old.data.set([1, 2, 3, 255], (30 * c + 30) * 4);
	const oldHash = await cellHash(old);
	history.set(oldHash, old); // a Fix frames original that a loaded project does not decode
	hat.frameEdits = [
		{
			version: 'frames-v1',
			id: 'edit-1',
			anim: 'walk',
			frames: [
				{
					dir: 'south',
					cell: 0,
					layers: [{ id: 'main', before: oldHash, after: hat.layers[0].cells!.walk!.south![0] }],
					cut: { before: [5 + 30 * c], after: null }
				}
			]
		}
	];
	m.rig.rest = {
		south: {
			image: m.items[0].layers[0].cells!.walk!.south![0]!,
			keypoints: [{ label: 'NOSE', x: 0.5, y: 0.25 }]
		}
	};
	m.rig.animations[0].sources = {
		south: {
			route: 'skeleton-v3',
			reference: m.rig.rest.south!.image,
			referenceKeypoints: [{ label: 'NOSE', x: 0.375, y: 0.625 }],
			keypoints: [[{ label: 'NOSE', x: 0.5, y: 0.3 }]],
			measured: [[{ label: 'NOSE', x: 0.25, y: 0.75 }]],
			provenance: []
		}
	};
	m.rig.anchors = { head: { walk: { south: [[32, 10]], west: [[31, 10]] } } };
	return {
		rec: {
			id: 'rig-test',
			savedAt: '2026-01-01T00:00:00.000Z',
			origin: 'studio',
			manifest: m,
			skeletons: { 'walk/south/0': { NOSE: { x: 32.5, y: 16, z: 0 } } }
		},
		project,
		history
	};
}
const read = (history: Map<Sha256, Img>) => async (h: Sha256) => history.get(h)!;

test('Frame size pads every layer, move, direction and frame by the same centered border', async () => {
	const { rec, project, history } = await character();
	const p = 24;
	const { record, newImages } = await reframeCharacter(
		rec,
		project.images,
		{ size: 64 + 2 * p, dy: 0 },
		read(history)
	);
	const after: Project = {
		manifest: record.manifest,
		images: new Map([...project.images, ...newImages])
	};
	const m = record.manifest;
	expect(m.rig.cell).toEqual({ w: 112, h: 112 });
	expect(m.rig.pivot).toEqual({ x: 32 + p, y: 64 + p });
	expect(m.rig.pixelsPerUnit).toBe(64);
	const before = rec.manifest,
		outfits = [before.presets[0].items, ...before.presets.map((x) => x.items)];
	let compared = 0;
	for (const items of outfits)
		for (const a of before.rig.animations)
			for (const d of before.rig.directions)
				for (let cell = 0; cell < a.cells; cell++) {
					const old = composeCell(project, items, a.id, d.id, cell, bakedFrame(before)),
						next = composeCell(after, items, a.id, d.id, cell, bakedFrame(m));
					expect(next.w).toBe(old.w + 2 * p);
					expect(Buffer.from(next.data).equals(Buffer.from(shift(old, p).data))).toBe(true);
					compared++;
				}
	expect(compared).toBeGreaterThan(40);
	const sword = m.items.find((i) => i.slot === 'main_hand')!;
	expect(sword.layers[0].cell).toEqual({ w: 112 + 32, h: 112 + 32 });
	expect(sword.layers[0].pivot).toEqual({ x: m.rig.pivot.x + 16, y: m.rig.pivot.y + 16 });
	const hat = m.items.find((i) => i.baseCut)!;
	expect(hat.baseCut!.walk!.south![0]).toEqual([3 + p + (20 + p) * 112, 9 + p + (40 + p) * 112]);
	const edit = hat.frameEdits![0].frames[0];
	expect(edit.cut.before).toEqual([5 + p + (30 + p) * 112]);
	expect(newImages.get(edit.layers[0].before!)?.w).toBe(112); // the history original moved too
	expect(m.rig.rest!.south!.keypoints[0]).toMatchObject({
		x: 0.5,
		y: +((16 + p) / 112).toFixed(4)
	});
	const source = m.rig.animations[0].sources!.south!;
	expect(source.reference).toBe(m.rig.rest!.south!.image);
	expect(source.referenceKeypoints).toEqual([
		{ label: 'NOSE', x: +((24 + p) / 112).toFixed(4), y: +((40 + p) / 112).toFixed(4) }
	]);
	expect(m.rig.anchors!.head!.walk!.south).toEqual([[32 + p, 10 + p]]);
	expect(record.skeletons!['walk/south/0'].NOSE).toMatchObject({ x: 32.5 + p, y: 16 + p });
	expect(m.items.every((i) => i.baseHash === m.rig.baseHash)).toBe(true);
	expect(m.rig.baseHash).not.toBe(before.rig.baseHash);
	// The export keeps the old world unit, so a game shows the resized character at the same scale.
	const exported = exportManifest(after, { engines: ['unity'], baked: false }).manifest;
	expect(exported.export!.pixelsPerUnit).toBe(64);
	expect(unityJson(exported).ppu).toBe(64);
});

test('grow then shrink returns the same pixels, indices and hashes', async () => {
	const { rec, project, history } = await character();
	await rehash(rec.manifest); // the fixture's own baseHash counts its flipped west cells, which bodies never store
	const grown = await reframeCharacter(rec, project.images, { size: 96, dy: 0 }, read(history));
	const images = new Map([...project.images, ...grown.newImages]);
	const back = await reframeCharacter(
		grown.record,
		images,
		{ size: 64, dy: 0 },
		async (h) => images.get(h) ?? grown.newImages.get(h) ?? history.get(h)!
	);
	const strip = (r: StoredProject) => ({ ...structuredClone(r), savedAt: '' });
	const original = strip(rec),
		round = strip(back.record);
	// API keypoints are stored to 4 decimals (padKeypoints), so they come back within 1e-4; everything else exactly.
	const kp = (r: StoredProject) => [
		r.manifest.rig.rest!.south!.keypoints,
		r.manifest.rig.animations[0].sources!.south!.keypoints,
		r.manifest.rig.animations[0].sources!.south!.measured
	];
	const after = kp(round).flat(2);
	for (const [i, a] of kp(original).flat(2).entries())
		expect(Math.abs(a!.x - after[i]!.x) + Math.abs(a!.y - after[i]!.y)).toBeLessThan(2e-4);
	for (const r of [original, round]) {
		r.manifest.rig.rest!.south!.keypoints = [];
		delete r.manifest.rig.animations[0].sources;
	}
	expect(round).toEqual(original);
	expect(round.manifest.rig.pixelsPerUnit).toBeUndefined();
});

test('a change that would cut a pixel or move a joint outside is refused, naming the edge', async () => {
	const { rec, project, history } = await character();
	const facts = await frameFacts(rec, project.images, read(history));
	expect(facts.max).toBe(256 - 32);
	// The s2 body stands on the last row: it cannot move down or lose a bottom row, but it can move up.
	expect(facts.free.bottom).toBe(0);
	expect(frameIssue(facts, { size: 62, dy: 0 })?.translation.key).toBe(
		'adjustFrame.errors.clipBottom'
	);
	expect(frameIssue(facts, { size: 64, dy: 1 })?.translation.key).toBe(
		'adjustFrame.errors.clipBottom'
	);
	expect(frameIssue(facts, { size: 64, dy: -3 })).toBeUndefined();
	expect(frameIssue(facts, { size: 64, dy: -(facts.free.top + 1) })?.translation.key).toBe(
		'adjustFrame.errors.clipTop'
	);
	expect(frameIssue(facts, { size: 65, dy: 0 })?.translation.key).toBe('adjustFrame.errors.even');
	expect(frameIssue(facts, { size: 226, dy: 0 })?.translation.key).toBe('adjustFrame.errors.range');
	await expect(
		reframeCharacter(rec, project.images, { size: 64, dy: 1 }, read(history))
	).rejects.toThrow(/bottom/);
	await expect(
		reframeCharacter(rec, project.images, { size: 64, dy: 0 }, read(history))
	).rejects.toThrow(/first/);
});

test('moving up keeps every composed frame, pivot-relative, and records the offset for managed motion', async () => {
	const { rec, project, history } = await character();
	await rehash(rec.manifest); // the fixture's own baseHash counts its flipped west cells, which bodies never store
	const { record, newImages } = await reframeCharacter(
		rec,
		project.images,
		{ size: 64, dy: -5 },
		read(history)
	);
	const after: Project = {
			manifest: record.manifest,
			images: new Map([...project.images, ...newImages])
		},
		m = record.manifest,
		before = rec.manifest;
	// The pivot moves with the art: every engine draws a layer at pivot - layer pivot, so nothing moves in a game.
	expect(m.rig.pivot).toEqual({ x: 32, y: 64 - 5 });
	expect(m.rig.artOffset).toEqual({ south: -5, east: -5, north: -5, west: -5 });
	for (const a of before.rig.animations)
		for (const d of before.rig.directions)
			for (let cell = 0; cell < a.cells; cell++) {
				const old = composeCell(
						project,
						before.presets[0].items,
						a.id,
						d.id,
						cell,
						bakedFrame(before)
					),
					next = composeCell(after, before.presets[0].items, a.id, d.id, cell, bakedFrame(m));
				expect(Buffer.from(next.data).equals(Buffer.from(shift(old, 0, -5).data))).toBe(true);
			}
	const sword = m.items.find((i) => i.slot === 'main_hand')!;
	expect(sword.layers[0].pivot).toEqual({ x: 32 + 16, y: 64 - 5 + 16 });
	expect(sword.layers[0].cell).toEqual({ w: 96, h: 96 });
	expect(m.rig.anchors!.head!.walk!.south).toEqual([[32, 10 - 5]]);
	// Mirrored anchors keep their flip: a vertical move leaves every x alone.
	expect(m.rig.anchors!.head!.walk!.west).toEqual([[31, 10 - 5]]);
	expect(record.skeletons!['walk/south/0'].NOSE).toMatchObject({ x: 32.5, y: 16 - 5 });
	expect(m.rig.rest!.south!.keypoints[0]).toMatchObject({ x: 0.5, y: +((16 - 5) / 64).toFixed(4) });
	const hat = m.items.find((i) => i.baseCut)!;
	expect(hat.baseCut!.walk!.south![0]).toEqual([3 + (20 - 5) * 64, 9 + (40 - 5) * 64]);
	// Moving back restores the record byte for byte (keypoints aside, stored to 4 decimals), and clears the offset.
	const back = await reframeCharacter(
		record,
		after.images,
		{ size: 64, dy: 5 },
		async (h) => after.images.get(h) ?? history.get(h)!
	);
	expect(back.record.manifest.rig.artOffset).toBeUndefined();
	const strip = (r: StoredProject) => {
		const copy = { ...structuredClone(r), savedAt: '' };
		copy.manifest.rig.rest!.south!.keypoints = [];
		delete copy.manifest.rig.animations[0].sources;
		return copy;
	};
	expect(strip(back.record)).toEqual(strip(rec));
});

test('a move followed by a resize, and their inverse, return to the same character', async () => {
	const { rec, project, history } = await character();
	await rehash(rec.manifest);
	const all = new Map(project.images);
	const step = async (r: StoredProject, change: { size: number; dy: number }) => {
		const out = await reframeCharacter(r, all, change, async (h) => all.get(h) ?? history.get(h)!);
		for (const [h, im] of out.newImages) all.set(h, im);
		return out.record;
	};
	const moved = await step(rec, { size: 64, dy: -4 });
	const grown = await step(moved, { size: 96, dy: 0 });
	expect(grown.manifest.rig.pivot).toEqual({ x: 48, y: 64 - 4 + 16 });
	expect(grown.manifest.rig.artOffset?.south).toBe(-4); // a centered resize keeps the offset
	const shrunk = await step(grown, { size: 64, dy: 0 });
	const back = await step(shrunk, { size: 64, dy: 4 });
	const plain = (r: StoredProject) => {
		const copy = { ...structuredClone(r), savedAt: '' };
		copy.manifest.rig.rest!.south!.keypoints = [];
		delete copy.manifest.rig.animations[0].sources;
		return copy;
	};
	expect(plain(back)).toEqual(plain(rec));
});

test('managed motion frames land on the moved art: the standing echo and the stepping foot share one placement', async () => {
	const { artMapping } = await import('../../src/studio/create.ts');
	// A registered 92 px standing view with its feet on row 90, as PixelLab returns it inside a 128 px motion canvas.
	const rest = makeImg(92, 92);
	for (let y = 15; y <= 90; y++) rest.data.set([90, 60, 40, 255], (y * 92 + 46) * 4);
	const echo = shift(rest, 18),
		step = shift(rest, 18, 5); // the stepping foot reaches row 95 of the 92 px frame
	expect(normalize(step, 92, 92, 128, 92).cutPx).toBeGreaterThan(0);
	// Make room at 92 px moves the art up instead of growing the frame: walk room below, headroom above.
	const facts: FrameFacts = {
		size: 92,
		min: 32,
		max: 256,
		free: { top: 15, bottom: 1, left: 46, right: 45 },
		room: { height: 76, top: 15, below: 1, left: 46, right: 45 }
	};
	const plan = makeRoom(facts);
	expect(plan).toEqual({ size: 92, dy: -6 });
	const rig = { artOffset: { south: -6 } };
	const below = artMapping(rig, 'south');
	expect(below).toBe(-6);
	// The echo is the moved standing view exactly, and the stepping foot now fits with a spare row.
	const moved = shift(rest, 0, -6);
	expect(normalize(echo, 92, 92, 128, 92, -below).img.data).toEqual(moved.data);
	const fitted = normalize(step, 92, 92, 128, 92, -below);
	expect(fitted.cutPx).toBe(0);
	// With every cached frame kept inside (extra free space), Make room grows only when moving cannot.
	const motionBox = { x0: 46, x1: 46, y0: 15 + 5 - 16, y1: 90 + 5 };
	expect(makeRoom(facts, freeOf([motionBox], 92))).toMatchObject({ size: 96 });
	expect(makeRoom({ ...facts, max: 92 }, freeOf([motionBox], 92))).toEqual({
		limit: true,
		size: 92
	});
});

test('the room rule grows a 92 px PixelLab canvas with its feet on row 90 to 112 px', () => {
	// The user's import: 76 px standing views on rows 15..90, at least 31 px from the sides. A live managed walk of it
	// (2026-11-20, padded to 112 and registered: 3 gens as at 92) stepped to row 106 of 112: 0 px cut, 5 rows spare.
	const room = { height: 76, top: 15, below: 1, left: 31, right: 31 };
	expect(roomShort(room)).toBe(true);
	expect(roomFrame(92, room)).toBe(112);
	// A created 64 px body in its 80 px frame (4 px floor) reaches no edge, so no move warns, but the full rule with its
	// guard rows would add room; already roomy frames are unchanged.
	expect(roomShort({ height: 60, top: 14, below: 5, left: 25, right: 25 })).toBe(false);
	expect(roomFrame(80, { height: 60, top: 14, below: 5, left: 25, right: 25 })).toBe(96);
	expect(roomFrame(112, { height: 76, top: 25, below: 11, left: 41, right: 41 })).toBe(112);
	// Rounding never crosses a cost step the smallest frame stays under, and odd sizes keep their parity unrounded.
	expect(roomFrame(90, { height: 76, top: 15, below: 4, left: 30, right: 30 })).toBe(96);
	expect(roomFrame(160, { height: 140, top: 10, below: 8, left: 40, right: 40 })).toBe(168);
	expect(roomFrame(93, room)).toBe(105);
	expect(roomFrame(250, room)).toBe(256);
	expect(roomFrame(92, room, 104)).toBe(104);
});

test('a new character canvas sits high enough for a body filling it to walk, never past the frame top', () => {
	// Sizes only: characters of one body and frame size share a placement. 4 + lift rows end below the canvas.
	expect(canvasLift(64, 80)).toBe(3);
	expect(canvasLift(96, 128)).toBe(5);
	expect(canvasLift(128, 160)).toBe(7);
	// A tight frame keeps its 6 px headroom above the canvas: only the rows beyond it are used.
	expect(canvasLift(64, 76)).toBe(2);
	expect(canvasLift(96, 105)).toBe(0);
	expect(canvasLift(256, 256)).toBe(0);
});

test('standing room is the union of the standing views', () => {
	const a = makeImg(10, 10),
		b = makeImg(10, 10);
	a.data[(2 * 10 + 4) * 4 + 3] = 255;
	b.data[(8 * 10 + 6) * 4 + 3] = 255;
	expect(standingRoom([a, b], 10)).toEqual({ height: 7, top: 2, below: 1, left: 4, right: 3 });
	expect(standingRoom([makeImg(4, 4)], 4)).toBeUndefined();
	expect(DEFAULT_MOVE).toBe('default');
});

test('a move from standing views that reach the frame edge warns and offers Make room', async () => {
	const { frameRoomWarning } = await import('../../src/studio/create.ts');
	const { rec, project, history } = await character();
	const spec = { id: 'walk-2', action: 'walk', frames: 8, items: [] as string[], seed: 1 };
	// The s2 body stands on the frame's last row: a walk has nowhere to step.
	const warning = frameRoomWarning(project, spec)!;
	expect(warning.id).toBe('frame-room-move');
	expect(warning.translation.vars).toMatchObject({ frame: 64, below: 0 });
	expect(frameRoomWarning(project, { ...spec, itemsOnly: true as const })).toBeUndefined();
	const plan = makeRoom(await frameFacts(rec, project.images, read(history)));
	expect(plan).toMatchObject({ size: 64 });
	const { record, newImages } = await reframeCharacter(
		rec,
		project.images,
		plan as { size: number; dy: number },
		read(history)
	);
	const resized = { manifest: record.manifest, images: new Map([...project.images, ...newImages]) };
	expect(frameRoomWarning(resized, spec)).toBeUndefined();
});

test('a State drawn before a vertical frame move no longer fits: the pivot it was placed on moved with the art', async () => {
	const { rec, project, history } = await character();
	const clip = rec.manifest.rig.animations[0].id,
		made = stateGenerationSource(project, { clip, frame: 0 })!.version;
	expect(stateSourceFits(project, made)).toBe(true);
	const { record, newImages } = await reframeCharacter(
		rec,
		project.images,
		{ size: 64, dy: -5 },
		read(history)
	);
	const after: Project = {
		manifest: record.manifest,
		images: new Map([...project.images, ...newImages])
	};
	// Same frame size and views; only the art and the pivot moved up (rig.artOffset records the move).
	expect(after.manifest.rig.cell).toEqual(rec.manifest.rig.cell);
	expect(after.manifest.rig.artOffset).toBeDefined();
	expect(stateSourceFits(after, made)).toBe(false);
});
