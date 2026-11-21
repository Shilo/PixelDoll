import { readFile } from 'node:fs/promises';
import { expect, test } from 'vitest';
import { bakedFrame, composeCell } from '../../src/lib/compose/compose.ts';
import { loadFixture } from '../../src/lib/compose/fixture.ts';
import { exportManifest } from '../../src/lib/export/generic.ts';
import { unityJson } from '../../src/lib/export/unity.ts';
import { makeImg, type Img } from '../../src/lib/image/png.ts';
import {
	frameLimits,
	reframeCharacter,
	roomFrame,
	roomShort,
	standingRoom
} from '../../src/lib/rig/reframe.ts';
import { rehash } from '../../src/lib/rig/directions.ts';
import { cellHash, DEFAULT_MOVE, type Sha256 } from '../../src/lib/rig/rig.ts';
import type { Project } from '../../src/lib/store/manifest.ts';
import type { StoredProject } from '../../src/lib/store/project.ts';

const fixture = () =>
	loadFixture(
		async (path) =>
			new Uint8Array(await readFile(new URL(`../../public/fixtures/s2/${path}`, import.meta.url)))
	);
const shift = (im: Img, p: number): Img => {
	const out = makeImg(im.w + 2 * p, im.h + 2 * p);
	for (let y = 0; y < im.h; y++)
		for (let x = 0; x < im.w; x++) {
			const X = x + p,
				Y = y + p;
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
		64 + 2 * p,
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
	const grown = await reframeCharacter(rec, project.images, 96, read(history));
	const images = new Map([...project.images, ...grown.newImages]);
	const back = await reframeCharacter(
		grown.record,
		images,
		64,
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

test('a shrink that would cut a pixel or move a joint outside is refused, and odd changes are refused', async () => {
	const { rec, project, history } = await character();
	const limits = await frameLimits(rec, project.images, read(history));
	expect(limits.max).toBe(256 - 32);
	expect((64 - limits.min) % 2).toBe(0);
	// The s2 body stands on the last row, so nothing can be cut off its frame.
	expect(limits.min).toBe(64);
	await expect(reframeCharacter(rec, project.images, 62, read(history))).rejects.toThrow(
		/Frame must be/
	);
	await expect(reframeCharacter(rec, project.images, 65, read(history))).rejects.toThrow(/even/);
	await expect(reframeCharacter(rec, project.images, 226, read(history))).rejects.toThrow(
		/Frame must be/
	);
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
	expect(roomFrame(160, { height: 140, top: 10, below: 8, left: 40, right: 40 })).toBe(166);
	expect(roomFrame(93, room)).toBe(105);
	expect(roomFrame(250, room)).toBe(256);
	expect(roomFrame(92, room, 104)).toBe(104);
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
