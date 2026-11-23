import { expect, test } from 'vitest';
import { validate } from '../../src/lib/export/generic.ts';
import { validFrameEdits } from '../../src/lib/dress/item-palette.ts';
import {
	applyPlan,
	editedCount,
	frameSheets,
	frameTile,
	layerOfFile,
	planFrames,
	restoreOriginals
} from '../../src/lib/frames/fix.ts';
import { bodyRecord } from '../../src/lib/frames/save.ts';
import { makeImg, type Img } from '../../src/lib/image/png.ts';
import { cellHash, type Sha256 } from '../../src/lib/rig/rig.ts';
import type { Item, Project } from '../../src/lib/store/manifest.ts';
import { CURRENT_FORMAT } from '../../src/lib/store/manifest.ts';
import type { StoredProject } from '../../src/lib/store/project.ts';

const W = 8;
const dot = (x: number, y: number, rgb = [200, 40, 40], size = W): Img => {
	const im = makeImg(size, size);
	im.data.set([...rgb, 255], (y * size + x) * 4);
	return im;
};
const clone = (im: Img): Img => ({ ...im, data: new Uint8ClampedArray(im.data) });
const px = (im: Img, x: number, y: number, rgba: number[]) => im.data.set(rgba, (y * im.w + x) * 4);

/** 8×8 body with south and east stored, west mirroring east, a 2-frame walk and a 1-frame default; a one-layer hat (south
 *  only in walk) and a padded two-layer sword (12×12 cell). */
async function project() {
	const images = new Map<string, Img>();
	const add = async (im: Img) => {
		const h = await cellHash(im);
		images.set(h, im);
		return h;
	};
	const body = await add(dot(4, 6, [90, 60, 40])),
		body2 = await add(dot(3, 6, [90, 60, 40])),
		hat = await add(dot(4, 1, [10, 10, 200])),
		swordFg = await add(dot(6, 6, [150, 150, 150], 12)),
		swordBg = await add(dot(5, 6, [100, 100, 100], 12));
	const p: Project = {
		images,
		manifest: {
			format: CURRENT_FORMAT,
			name: 'Frames test',
			app: 'PixelDoll',
			materials: [],
			rig: {
				cell: { w: W, h: W },
				pivot: { x: 4, y: 8 },
				baseItem: 'base',
				baseHash: 'sha256:base' as Sha256,
				directions: [{ id: 'south' }, { id: 'east' }, { id: 'west', mirrorOf: 'east' }],
				animations: [
					{ id: 'default', cells: 1, loop: true, frames: [{ cell: 0, ms: 100 }] },
					{
						id: 'walk',
						cells: 2,
						loop: true,
						frames: [
							{ cell: 0, ms: 100 },
							{ cell: 1, ms: 100 }
						]
					}
				],
				rest: { south: { image: body, keypoints: [] } }
			},
			slots: [
				{ id: 'body', z: 10, class: 'base' },
				{ id: 'head', z: 50, class: 'worn' },
				{ id: 'main_hand', z: 60, class: 'held' }
			],
			items: [
				{
					id: 'base',
					name: 'Base',
					slot: 'body',
					status: 'accepted',
					mirror: 'flip',
					materials: [],
					prompt: '',
					provenance: [],
					baseHash: 'sha256:base' as Sha256,
					layers: [
						{
							id: 'main',
							role: 'fg',
							z: 10,
							cells: {
								default: { south: [body], east: [body] },
								walk: { south: [body, body2], east: [body, body] }
							}
						}
					]
				},
				{
					id: 'hat',
					name: 'Hat',
					slot: 'head',
					status: 'accepted',
					mirror: 'flip',
					materials: [],
					prompt: '',
					provenance: [],
					baseHash: 'sha256:base' as Sha256,
					coverage: ['walk/south/0', 'walk/south/1'],
					baseCut: { walk: { south: [[4 + 6 * W], null] } },
					layers: [{ id: 'main', role: 'fg', z: 50, cells: { walk: { south: [hat, hat] } } }]
				},
				{
					id: 'sword',
					name: 'Sword',
					slot: 'main_hand',
					status: 'accepted',
					mirror: 'flip',
					materials: [],
					prompt: '',
					provenance: [],
					baseHash: 'sha256:base' as Sha256,
					coverage: ['walk/south/0', 'walk/south/1'],
					layers: [
						{
							id: 'fg',
							role: 'fg',
							z: 60,
							cell: { w: 12, h: 12 },
							pivot: { x: 6, y: 10 },
							cells: { walk: { south: [swordFg, null] } }
						},
						{
							id: 'bg',
							role: 'bg',
							z: 5,
							cell: { w: 12, h: 12 },
							pivot: { x: 6, y: 10 },
							cells: { walk: { south: [swordBg, null] } }
						}
					]
				}
			],
			presets: [{ id: 'default', name: 'Default', items: { body: 'base' }, variants: {} }]
		}
	};
	return { p, body, body2, hat, swordFg };
}
const sheetOf = (p: Project, item: string, anim: string, layer = 'main') =>
	clone(frameSheets(p, item, anim).find((s) => s.layerId === layer)!.image);
const item = (p: Project, id: string) => p.manifest.items.find((i) => i.id === id)!;

test('an untouched download imports as no change, even with RGB changed under transparent pixels', async () => {
	const { p } = await project();
	const sheet = sheetOf(p, 'hat', 'walk');
	expect([sheet.w, sheet.h]).toEqual([2 * W, 3 * W]);
	px(sheet, 0, 0, [255, 0, 255, 0]);
	const plan = await planFrames(p, 'hat', 'walk', [{ layerId: 'main', image: sheet }]);
	expect(plan.changed).toEqual([]);
	expect(plan.notes).toEqual([]);
});

test('one edited frame gets one new hash; frames sharing its old hash keep theirs', async () => {
	const { p, hat } = await project();
	const sheet = sheetOf(p, 'hat', 'walk');
	px(sheet, W + 2, 2, [10, 10, 200, 255]);
	const plan = await planFrames(p, 'hat', 'walk', [{ layerId: 'main', image: sheet }]);
	expect(plan.changed).toHaveLength(1);
	expect(plan.changed[0]).toMatchObject({ dir: 'south', cell: 1 });
	expect(plan.changed[0].layers[0].before).toBe(hat);
	const next = applyPlan(p, plan, 'op');
	expect(next.layers[0].cells!.walk.south).toEqual([hat, plan.changed[0].layers[0].after]);
	expect(next.frameEdits).toHaveLength(1);
	expect(plan.newColors).toBe(0);
});

test('soft alpha is counted and thresholded at 128; a new color is counted', async () => {
	const { p } = await project();
	const sheet = sheetOf(p, 'hat', 'walk');
	px(sheet, 1, 1, [0, 255, 0, 200]);
	px(sheet, 2, 1, [0, 255, 0, 100]);
	const plan = await planFrames(p, 'hat', 'walk', [{ layerId: 'main', image: sheet }]);
	expect(plan.softAlpha).toBe(2);
	expect(plan.newColors).toBe(1);
	const im = plan.images.get(plan.changed[0].layers[0].after!)!;
	expect([...im.data.subarray((1 * W + 1) * 4, (1 * W + 1) * 4 + 4)]).toEqual([0, 255, 0, 255]);
	expect(im.data[(1 * W + 2) * 4 + 3]).toBe(0);
});

test('an emptied frame becomes an empty cell', async () => {
	const { p } = await project();
	const sheet = sheetOf(p, 'hat', 'walk');
	px(sheet, 4, 1, [0, 0, 0, 0]);
	const plan = await planFrames(p, 'hat', 'walk', [{ layerId: 'main', image: sheet }]);
	expect(plan.changed[0].layers[0].after).toBeNull();
});

test('edits on a mirrored row are not applied and are noted', async () => {
	const { p } = await project();
	const sheet = sheetOf(p, 'base', 'walk');
	px(sheet, 1, 2 * W + 1, [1, 2, 3, 255]);
	const plan = await planFrames(p, 'base', 'walk', [{ layerId: 'main', image: sheet }]);
	expect(plan.changed).toEqual([]);
	expect(plan.notes).toEqual([{ kind: 'mirrored', dir: 'west', of: 'east' }]);
});

test('a mirrored row edited along with its source is not reported', async () => {
	const { p } = await project();
	const sheet = sheetOf(p, 'base', 'walk');
	px(sheet, 1, W + 1, [1, 2, 3, 255]); // east frame 1
	px(sheet, W - 2, 2 * W + 1, [1, 2, 3, 255]); // the same pixel flipped in west
	const plan = await planFrames(p, 'base', 'walk', [{ layerId: 'main', image: sheet }]);
	expect(plan.changed).toMatchObject([{ dir: 'east', cell: 0 }]);
	expect(plan.notes).toEqual([]);
});

test('an item can draw a new direction the body has; neither can add a body direction', async () => {
	const { p } = await project();
	const sheet = sheetOf(p, 'hat', 'walk');
	px(sheet, 2, W + 2, [10, 10, 200, 255]);
	const plan = await planFrames(p, 'hat', 'walk', [{ layerId: 'main', image: sheet }]);
	expect(plan.changed).toMatchObject([{ dir: 'east', cell: 0, layers: [{ before: null }] }]);
	const next = applyPlan(p, plan, 'op');
	expect(next.layers[0].cells!.walk.east![1]).toBeNull();
	expect(next.coverage).toContain('walk/east/0');

	const { p: q } = await project();
	delete item(q, 'base').layers[0].cells!.walk.east;
	const hat = sheetOf(q, 'hat', 'walk');
	px(hat, 2, W + 2, [10, 10, 200, 255]);
	const plan2 = await planFrames(q, 'hat', 'walk', [{ layerId: 'main', image: hat }]);
	expect(plan2.changed).toEqual([]);
	expect(plan2.notes).toEqual([{ kind: 'noBodyRow', dir: 'east' }]);
});

test('size is checked per layer, including padded layers', async () => {
	const { p } = await project();
	const fg = sheetOf(p, 'sword', 'walk', 'fg');
	expect([fg.w, fg.h]).toEqual([24, 36]);
	await expect(
		planFrames(p, 'sword', 'walk', [{ layerId: 'fg', image: makeImg(16, 24) }])
	).rejects.toMatchObject({ translation: { key: 'fixFrames.errors.size' } });
	const plan = await planFrames(p, 'sword', 'walk', [{ layerId: 'fg', image: fg }]);
	expect(plan.notes).toEqual([{ kind: 'missingLayer', layer: 'bg' }]);
});

test('files match layers by name suffix; one-layer items take any PNG', async () => {
	const { p } = await project();
	expect(layerOfFile(item(p, 'hat'), 'whatever.png')).toBe('main');
	expect(layerOfFile(item(p, 'sword'), 'hero-sword-walk-bg.png')).toBe('bg');
	expect(layerOfFile(item(p, 'sword'), 'folder/hero-sword-walk-fg.PNG')).toBe('fg');
	expect(layerOfFile(item(p, 'sword'), 'hero-sword-walk.png')).toBeUndefined();
});

test('erasing an item where it hid body pixels shows them again', async () => {
	const { p } = await project();
	const sheet = sheetOf(p, 'hat', 'walk');
	px(sheet, 4, 1, [0, 0, 0, 0]); // the hat leaves cell 0 empty
	const plan = await planFrames(p, 'hat', 'walk', [{ layerId: 'main', image: sheet }]);
	const next = applyPlan(p, plan, 'op');
	expect(next.layers[0].cells!.walk.south![0]).toBeNull();
	expect(next.baseCut!.walk.south![0]).toBeNull();
	expect(next.frameEdits![0].frames[0].cut).toEqual({ before: [4 + 6 * W], after: null });
	const restored = restoreOriginals(p.manifest, next)!;
	expect(restored.item.baseCut!.walk.south![0]).toEqual([4 + 6 * W]);
});

// Undo of one import is a history step that writes the item back as it was (studio-flow-state.test.ts).
test('restore returns every still-edited frame to its original', async () => {
	const { p, hat } = await project();
	const a = sheetOf(p, 'hat', 'walk');
	px(a, 1, 1, [10, 10, 200, 255]);
	const first = await planFrames(p, 'hat', 'walk', [{ layerId: 'main', image: a }]);
	const once = applyPlan(p, first, 'a');
	p.manifest.items[1] = once;
	for (const [h, im] of first.images) p.images.set(h, im);
	const b = sheetOf(p, 'hat', 'walk');
	px(b, 2, 2, [10, 10, 200, 255]);
	px(b, W + 2, 2, [10, 10, 200, 255]);
	const second = await planFrames(p, 'hat', 'walk', [{ layerId: 'main', image: b }]);
	const twice = applyPlan(p, second, 'b');
	expect(editedCount(p.manifest, twice)).toBe(2);

	const restored = restoreOriginals(p.manifest, twice)!;
	expect(restored.item.layers[0].cells!.walk.south).toEqual([hat, hat]);
	expect(restored.item.frameEdits).toBeUndefined();
	expect(restored.writes.map((w) => w.hash)).toEqual([hat, hat]);

	// A frame changed by something else since is no longer the user's edit: Restore skips it.
	const changed = structuredClone(twice);
	changed.layers[0].cells!.walk.south![1] = hat;
	expect(restoreOriginals(p.manifest, changed)!.count).toBe(1);
});

test('frame edit history is validated like other local edit history', async () => {
	const { p } = await project();
	const sheet = sheetOf(p, 'hat', 'walk');
	px(sheet, 1, 1, [10, 10, 200, 255]);
	const next = applyPlan(
		p,
		await planFrames(p, 'hat', 'walk', [{ layerId: 'main', image: sheet }]),
		'op'
	);
	expect(validFrameEdits(next.frameEdits)).toBe(true);
	expect(validFrameEdits([{ version: 'frames-v1', id: 'x', anim: 'walk', frames: [] }])).toBe(
		false
	);
	expect(validFrameEdits([...next.frameEdits!, ...next.frameEdits!])).toBe(false); // repeated id
	const same = structuredClone(next.frameEdits!);
	same[0].frames[0].layers[0].after = same[0].frames[0].layers[0].before;
	expect(validFrameEdits(same)).toBe(false);
	p.manifest.items[1] = { ...next, frameEdits: [{ bad: true }] as unknown as Item['frameEdits'] };
	expect(validate(p).some((e) => e.includes('invalid local frame edit history'))).toBe(true);
});

test('tiles align padded layers on the body pivot', async () => {
	const { p } = await project();
	const tile = frameTile(p, 'sword', 'walk', 'south', 0);
	expect([tile.w, tile.h]).toEqual([12, 12]);
	// body px (4,6) in the 8×8 cell lands at (6,8) in the 12×12 tile, faded
	expect(tile.data[(8 * 12 + 6) * 4 + 3]).toBe(Math.round(255 * 0.3));
	expect(tile.data[(6 * 12 + 6) * 4 + 3]).toBe(255);
});

test('a body save moves fitted items, follows the standing reference and keeps a matching recovery receipt', async () => {
	const { p, body } = await project();
	const sheet = sheetOf(p, 'base', 'default');
	px(sheet, 1, 1, [90, 60, 40, 255]);
	const plan = await planFrames(p, 'base', 'default', [{ layerId: 'main', image: sheet }]);
	const nextBase = applyPlan(p, plan, 'op');
	item(p, 'sword').baseHash = 'sha256:other' as Sha256;
	const { rigArtworkVersion } = await import('../../src/lib/rig/rig.ts');
	const rec: StoredProject = {
		id: 'rig-test',
		savedAt: '',
		origin: 'studio',
		manifest: p.manifest,
		moveRecovery: {
			id: 'r',
			originalRigVersion: 'x',
			bodyRigVersion: rigArtworkVersion(p.manifest.rig, undefined),
			specHash: 'h'
		}
	};
	const next = await bodyRecord(rec, nextBase);
	const m = next.manifest;
	expect(m.rig.baseHash).not.toBe('sha256:base');
	expect(m.items.find((i) => i.id === 'hat')!.baseHash).toBe(m.rig.baseHash);
	expect(m.items.find((i) => i.id === 'sword')!.baseHash).toBe('sha256:other');
	expect(m.rig.rest!.south!.image).toBe(
		plan.changed.find((c) => c.dir === 'south')!.layers[0].after
	);
	expect(m.rig.rest!.south!.image).not.toBe(body);
	expect(next.moveRecovery!.bodyRigVersion).toBe(rigArtworkVersion(m.rig, undefined));
	expect(rec.manifest.rig.baseHash).toBe('sha256:base');
});

test('restore removes rows and coverage an import created', async () => {
	const { p } = await project();
	const sheet = sheetOf(p, 'hat', 'walk');
	px(sheet, 2, W + 2, [10, 10, 200, 255]);
	const plan = await planFrames(p, 'hat', 'walk', [{ layerId: 'main', image: sheet }]);
	const next = applyPlan(p, plan, 'op');
	expect(next.frameEdits![0].frames[0]).toMatchObject({ added: true, newRows: ['main'] });
	const restored = restoreOriginals(p.manifest, next)!;
	expect(restored.item.layers[0].cells!.walk.east).toBeUndefined();
	expect(restored.item.coverage).toEqual(['walk/south/0', 'walk/south/1']);
});

test('a mirrored direction with its own stored rows follows its edited source', async () => {
	const { p, body } = await project();
	const base = item(p, 'base');
	base.layers[0].cells!.walk.west = [body, body]; // Directions keeps baked flips while West mirrors East
	const sheet = sheetOf(p, 'base', 'walk');
	px(sheet, 1, W + 1, [1, 2, 3, 255]);
	const plan = await planFrames(p, 'base', 'walk', [{ layerId: 'main', image: sheet }]);
	expect(plan.changed.map((c) => `${c.dir}/${c.cell}`)).toEqual(['east/0', 'west/0']);
	const west = plan.images.get(plan.changed[1].layers[0].after!)!;
	expect(west.data[(1 * W + (W - 2)) * 4 + 3]).toBe(255);
	expect(plan.notes).toEqual([]);
});

test('restore puts a multi-layer frame back with its original cut once', async () => {
	const { p } = await project();
	const sword = item(p, 'sword');
	sword.baseCut = { walk: { south: [[6 * W + 5, 6 * W + 6], null] } };
	const fgSheet = sheetOf(p, 'sword', 'walk', 'fg');
	px(fgSheet, 6, 6, [0, 0, 0, 0]);
	const first = await planFrames(p, 'sword', 'walk', [{ layerId: 'fg', image: fgSheet }]);
	const once = applyPlan(p, first, 'a');
	p.manifest.items[2] = once;
	const bgSheet = sheetOf(p, 'sword', 'walk', 'bg');
	px(bgSheet, 5, 6, [0, 0, 0, 0]);
	const second = await planFrames(p, 'sword', 'walk', [{ layerId: 'bg', image: bgSheet }]);
	const twice = applyPlan(p, second, 'b');
	expect(twice.baseCut!.walk.south![0]).toBeNull();
	const restored = restoreOriginals(p.manifest, twice)!;
	expect(restored.count).toBe(1);
	expect(restored.item.baseCut!.walk.south![0]).toEqual([6 * W + 5, 6 * W + 6]);
	expect(restored.item.layers.map((l) => l.cells!.walk.south![0])).toEqual(
		sword.layers.map((l) => l.cells!.walk.south![0])
	);
});

test('the standing reference follows a Default frame erased and then drawn again', async () => {
	const { p } = await project();
	const rec = (): StoredProject => ({
		id: 'rig-test',
		savedAt: '',
		origin: 'studio',
		manifest: p.manifest
	});
	const blank = sheetOf(p, 'base', 'default');
	blank.data.fill(0, 0, W * W * 4 * 1); // erase the south frame (first row, first cell)
	for (let y = 0; y < W; y++) blank.data.fill(0, y * blank.w * 4, y * blank.w * 4 + W * 4);
	const erase = await planFrames(p, 'base', 'default', [{ layerId: 'main', image: blank }]);
	expect(erase.notes).toContainEqual({ kind: 'emptiedBody' });
	const erased = applyPlan(p, erase, 'a');
	const afterErase = await bodyRecord(rec(), erased);
	const restImage = p.manifest.rig.rest!.south!.image;
	expect(afterErase.manifest.rig.rest!.south!.image).toBe(restImage);
	p.manifest = afterErase.manifest;
	const drawn = sheetOf(p, 'base', 'default');
	px(drawn, 2, 2, [90, 60, 40, 255]);
	const draw = await planFrames(p, 'base', 'default', [{ layerId: 'main', image: drawn }]);
	const next = await bodyRecord(rec(), applyPlan(p, draw, 'b'));
	expect(next.manifest.rig.rest!.south!.image).toBe(draw.changed[0].layers[0].after);
});

test('item health says edited by you instead of a pass for replaced frames', async () => {
	const { healthOf } = await import('../../src/studio/model.ts');
	const { p } = await project();
	const hat = item(p, 'hat');
	hat.qa = { status: 'pass' } as Item['qa'];
	expect(healthOf(p.manifest, hat)).toBe('clean');
	const sheet = sheetOf(p, 'hat', 'walk');
	px(sheet, 1, 1, [10, 10, 200, 255]);
	const edited = applyPlan(
		p,
		await planFrames(p, 'hat', 'walk', [{ layerId: 'main', image: sheet }]),
		'op'
	);
	expect(healthOf(p.manifest, edited)).toBe('edited');
	// Accepted design warnings stay listed: accepted outranks edited.
	expect(healthOf(p.manifest, { ...edited, designWarnings: ['why'] })).toBe('accepted');
	expect(healthOf(p.manifest, restoreOriginals(p.manifest, edited)!.item)).toBe('clean');
});

const edit = async (
	p: Project,
	itemId: string,
	anim: string,
	id: string,
	paint: (sheet: Img) => void,
	layer = 'main'
) => {
	const sheet = sheetOf(p, itemId, anim, layer);
	paint(sheet);
	const plan = await planFrames(p, itemId, anim, [{ layerId: layer as 'main', image: sheet }]);
	const next = applyPlan(p, plan, id);
	p.manifest.items = p.manifest.items.map((i) => (i.id === itemId ? next : i));
	for (const [h, im] of plan.images) p.images.set(h, im);
	return { plan, next };
};

test('restore checks every original hash it writes back, including unchanged layers', async () => {
	const { p } = await project();
	const fgOld = item(p, 'sword').layers[0].cells!.walk.south![0];
	const bgOld = item(p, 'sword').layers[1].cells!.walk.south![0];
	await edit(p, 'sword', 'walk', 'a', (s) => px(s, 1, 1, [9, 9, 9, 255]), 'fg');
	const { next } = await edit(p, 'sword', 'walk', 'b', (s) => px(s, 1, 1, [9, 9, 9, 255]), 'bg');
	const restored = restoreOriginals(p.manifest, next)!;
	expect(restored.writes).toEqual(
		expect.arrayContaining([
			{ layer: 'fg', hash: fgOld },
			{ layer: 'bg', hash: bgOld }
		])
	);
});

test('restore leaves a frame alone once Directions replaced its row and cut', async () => {
	const { p } = await project();
	const hat = item(p, 'hat');
	hat.layers[0].cells!.walk.east = [hat.layers[0].cells!.walk.south![0], null];
	hat.baseCut = { walk: { east: [[4 + 6 * W], null] } };
	const { next } = await edit(p, 'hat', 'walk', 'a', (s) => px(s, 4, W + 1, [0, 0, 0, 0]));
	expect(editedCount(p.manifest, next)).toBe(1);
	// Directions: east now mirrors south, dropping east's own row and hidden pixels.
	p.manifest.rig.directions[1] = { id: 'east', mirrorOf: 'south' } as never;
	const remapped = structuredClone(next);
	delete remapped.layers[0].cells!.walk.east;
	delete remapped.baseCut!.walk.east;
	expect(editedCount(p.manifest, remapped)).toBe(0);
	expect(restoreOriginals(p.manifest, remapped)).toBeNull();
});

test('restore brings back a cut a later import pruned, even if the first import kept it', async () => {
	const { p } = await project();
	item(p, 'sword').baseCut = { walk: { south: [[4 * W + 3], null] } }; // under the bg pixel
	await edit(p, 'sword', 'walk', 'a', (s) => px(s, 1, 1, [9, 9, 9, 255]), 'fg');
	const { next } = await edit(p, 'sword', 'walk', 'b', (s) => s.data.fill(0), 'bg');
	const restored = restoreOriginals(p.manifest, next)!;
	expect(next.frameEdits![0].frames[0].cut).toEqual({ before: [4 * W + 3], after: [4 * W + 3] });
	expect(next.baseCut!.walk.south![0]).toBeNull();
	expect(restored.item.baseCut!.walk.south![0]).toEqual([4 * W + 3]);
});

test('restore keeps the standing reference with the restored Default frame', async () => {
	const { p, body } = await project();
	const rec = (): StoredProject => ({
		id: 'rig-test',
		savedAt: '',
		origin: 'studio',
		manifest: p.manifest
	});
	const save = async (base: Item) => {
		const next = await bodyRecord(rec(), base);
		p.manifest = next.manifest;
	};
	const a = await edit(p, 'base', 'default', 'a', (s) => px(s, 2, 2, [90, 60, 40, 255]));
	await save(a.next);
	const b = await edit(p, 'base', 'default', 'b', (s) => {
		for (let y = 0; y < W; y++) s.data.fill(0, y * s.w * 4, y * s.w * 4 + W * 4);
	});
	await save(b.next);
	expect(p.manifest.rig.rest!.south!.image).toBe(a.plan.changed[0].layers[0].after);
	const restored = restoreOriginals(p.manifest, item(p, 'base'))!;
	p.manifest = (await bodyRecord(rec(), restored.item, restored.frames)).manifest;
	expect(p.manifest.rig.rest!.south!.image).toBe(body);
});

test('a new direction drawn and then erased still restores its coverage and row', async () => {
	const { p } = await project();
	await edit(p, 'hat', 'walk', 'a', (s) => px(s, 2, W + 2, [10, 10, 200, 255]));
	const { next } = await edit(p, 'hat', 'walk', 'b', (s) => px(s, 2, W + 2, [0, 0, 0, 0]));
	expect(editedCount(p.manifest, next)).toBe(1);
	const restored = restoreOriginals(p.manifest, next)!.item;
	expect(restored.layers[0].cells!.walk.east).toBeUndefined();
	expect(restored.coverage).toEqual(['walk/south/0', 'walk/south/1']);
});

test('history this version cannot replay is ignored, and dropped by the next import', async () => {
	const { p } = await project();
	const hat = item(p, 'hat');
	hat.frameEdits = [
		{ version: 'frames-v1', anim: 'walk', frames: [{ dir: 'south', cell: 0, layers: [] }] }
	] as unknown as Item['frameEdits'];
	expect(editedCount(p.manifest, hat)).toBe(0);
	expect(restoreOriginals(p.manifest, hat)).toBeNull();
	const { next } = await edit(p, 'hat', 'walk', 'a', (s) => px(s, 1, 1, [10, 10, 200, 255]));
	expect(next.frameEdits).toHaveLength(1);
	expect(validFrameEdits(next.frameEdits)).toBe(true);
});

test('restore empties a layer the frame did not have, even if its row appeared on another frame first', async () => {
	const { p } = await project();
	await edit(p, 'sword', 'walk', 'a', (s) => px(s, 12 + 3, 12 + 3, [9, 9, 9, 255]), 'fg'); // fg east 2
	const { next } = await edit(
		p,
		'sword',
		'walk',
		'b',
		(s) => {
			px(s, 3, 12 + 3, [8, 8, 8, 255]); // bg east 1
			px(s, 12 + 4, 12 + 4, [8, 8, 8, 255]); // bg east 2
		},
		'bg'
	);
	const restored = restoreOriginals(p.manifest, next)!.item;
	expect(restored.layers.map((l) => l.cells!.walk.east)).toEqual([undefined, undefined]);
});

test('a frame changed by something else in between starts its history over', async () => {
	const { p, hat } = await project();
	await edit(p, 'hat', 'walk', 'a', (s) => px(s, 1, 1, [10, 10, 200, 255]));
	// Something else (Directions) puts its own art in the frame.
	const elsewhere = dot(5, 5, [3, 3, 3], W);
	const x = await cellHash(elsewhere);
	p.images.set(x, elsewhere);
	item(p, 'hat').layers[0].cells!.walk.south![0] = x;
	const { next } = await edit(p, 'hat', 'walk', 'b', (s) => px(s, 2, 2, [10, 10, 200, 255]));
	expect(hat).not.toBe(x);
	expect(restoreOriginals(p.manifest, next)!.item.layers[0].cells!.walk.south![0]).toBe(x);
});

test('restoring a drawing into an erased Default frame puts the original standing reference back', async () => {
	const { p, body } = await project();
	const rec = (): StoredProject => ({
		id: 'rig-test',
		savedAt: '',
		origin: 'studio',
		manifest: p.manifest
	});
	const blankSouth = (s: Img) => {
		for (let y = 0; y < W; y++) s.data.fill(0, y * s.w * 4, y * s.w * 4 + W * 4);
	};
	const b = await edit(p, 'base', 'default', 'b', (s) => px(s, 2, 2, [90, 60, 40, 255]));
	p.manifest = (await bodyRecord(rec(), b.next)).manifest;
	const B = b.plan.changed[0].layers[0].after;
	const e = await edit(p, 'base', 'default', 'e', blankSouth);
	p.manifest = (await bodyRecord(rec(), e.next)).manifest;
	const c = await edit(p, 'base', 'default', 'c', (s) => px(s, 3, 3, [90, 60, 40, 255]));
	p.manifest = (await bodyRecord(rec(), c.next)).manifest;
	expect(p.manifest.rig.rest!.south!.image).toBe(c.plan.changed[0].layers[0].after);
	expect(B).not.toBe(body);
	const restored = restoreOriginals(p.manifest, item(p, 'base'))!;
	p.manifest = (await bodyRecord(rec(), restored.item, restored.frames)).manifest;
	expect(p.manifest.rig.rest!.south!.image).toBe(body);
});

test('restore keeps an empty row the item already had', async () => {
	const { p } = await project();
	item(p, 'hat').layers[0].cells!.walk.east = [null, null];
	const { next } = await edit(p, 'hat', 'walk', 'a', (s) => px(s, 2, W + 2, [10, 10, 200, 255]));
	expect(restoreOriginals(p.manifest, next)!.item.layers[0].cells!.walk.east).toEqual([null, null]);
});

test('restore leaves a standing view that Directions rebuilt since alone', async () => {
	const { p } = await project();
	const rec = (): StoredProject => ({
		id: 'rig-test',
		savedAt: '',
		origin: 'studio',
		manifest: p.manifest
	});
	const b = await edit(p, 'base', 'default', 'b', (s) => px(s, 2, 2, [90, 60, 40, 255]));
	p.manifest = (await bodyRecord(rec(), b.next)).manifest;
	const rebuilt = `sha256:${'9'.repeat(64)}` as Sha256; // Directions: a flipped view from another direction
	p.manifest.rig.rest!.south!.image = rebuilt;
	const restored = restoreOriginals(p.manifest, item(p, 'base'))!;
	const next = await bodyRecord(rec(), restored.item, restored.frames);
	expect(next.manifest.rig.rest!.south!.image).toBe(rebuilt);
});
