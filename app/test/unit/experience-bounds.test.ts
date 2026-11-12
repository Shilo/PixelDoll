import { describe, expect, test } from 'vitest';
import { bakedFrame } from '../../src/lib/compose/compose.ts';
import { makeImg, type Img } from '../../src/lib/image/png.ts';
import type { Item, Layer, Project, Sha256 } from '../../src/lib/store/manifest.ts';
import { paintedFrame, reachFrame, previewBounds } from '../../src/studio/experience/bounds.ts';
import { CURRENT_FORMAT } from '../../src/lib/store/manifest.ts';

const bodyHash: Sha256 = 'sha256:body';
function rectangle(w: number, h: number, x: number, y: number, width = 1, height = 1): Img {
	const image = makeImg(w, h);
	for (let row = y; row < y + height; row++)
		for (let col = x; col < x + width; col++)
			image.data.set([60, 80, 100, 255], (row * w + col) * 4);
	return image;
}
function item(id: string, slot: string, layers: Layer[]): Item {
	return {
		id,
		name: id,
		slot,
		layers,
		prompt: '',
		baseHash: bodyHash,
		status: 'accepted',
		mirror: 'flip',
		materials: [],
		provenance: []
	};
}
function fixture(): Project {
	return {
		manifest: {
			format: CURRENT_FORMAT,
			name: 'Bounds fixture',
			app: '',
			materials: [],
			presets: [],
			rig: {
				cell: { w: 64, h: 64 },
				pivot: { x: 32, y: 56 },
				baseItem: 'body',
				baseHash: bodyHash,
				directions: [{ id: 'south' }],
				animations: []
			},
			slots: [
				{ id: 'body', z: 0, class: 'base' },
				{ id: 'main_hand', z: 3, class: 'held' },
				{ id: 'head', z: 2, class: 'rigid' },
				{ id: 'hair', z: 1, class: 'worn' }
			],
			items: [
				item('body', 'body', [
					{ id: 'main', role: 'fg', z: 0, cells: { walk: { south: [bodyHash] } } }
				])
			]
		},
		images: new Map([[bodyHash, rectangle(64, 64, 20, 8, 24, 48)]])
	};
}
function weapon(project: Project, image: Img, hash: Sha256 = 'sha256:weapon'): Item {
	project.images.set(hash, image);
	const result = item('weapon', 'main_hand', [
		{
			id: 'main',
			role: 'fg',
			z: 3,
			cell: { w: 96, h: 96 },
			pivot: { x: 48, y: 72 },
			cells: { walk: { south: [hash] } }
		}
	]);
	project.manifest.items.push(result);
	return result;
}

describe('Preview body grounding', () => {
	test('centers offset artwork on the floor instead of the saved rig pivot', () => {
		const project = fixture();
		project.images.set(bodyHash, rectangle(64, 64, 35, 8, 20, 40));
		const bounds = previewBounds(project);
		expect(bounds.facings.get('south')).toMatchObject({ x: 13, y: -8 });
		expect(bounds.body).toEqual({ w: 20, h: 40, x: 10, y: 40 });
	});

	test('grounds each facing and its mirror independently without changing slot sizes', () => {
		const project = fixture();
		project.manifest.rig.directions.push({ id: 'east' }, { id: 'west', mirrorOf: 'east' });
		project.manifest.items[0].layers[0].cells!.walk.east = ['sha256:east'];
		project.images.set('sha256:east', rectangle(64, 64, 40, 10, 6, 40));
		const bounds = previewBounds(project);
		expect(bounds.facings.get('east')).toMatchObject({ x: 11, y: -6 });
		expect(bounds.facings.get('west')).toMatchObject({ x: -11, y: -6 });
		expect(bounds.facings.get('east')!.reach).toEqual(bounds.facings.get('west')!.reach);
		expect(bounds.body).toEqual({ w: 24, h: 48, x: 12, y: 48 });
	});

	test('uses the original rest as a stable anchor across motion extremes and equipment', () => {
		const project = fixture();
		project.manifest.rig.rest = { south: { image: bodyHash, keypoints: [] } };
		project.images.set('sha256:motion', rectangle(64, 64, 30, 2, 20, 60));
		project.manifest.items[0].layers[0].cells!.attack = { south: ['sha256:motion'] };
		const before = previewBounds(project);
		weapon(project, rectangle(96, 96, 0, 0, 96, 96));
		const after = previewBounds(project);
		expect(before.facings.get('south')).toMatchObject({ x: 0, y: 0 });
		expect(after.facings.get('south')).toMatchObject({ x: 0, y: 0 });
		expect(after.body).toEqual(before.body);
		expect(after.reach.w).toBeGreaterThan(before.reach.w);
	});

	test('flips a source rest anchor for mirrors but preserves an authored target rest', () => {
		const project = fixture();
		project.manifest.rig.directions = [{ id: 'east' }, { id: 'west', mirrorOf: 'east' }];
		project.manifest.items[0].layers[0].cells = { walk: { east: [bodyHash] } };
		project.images.set(bodyHash, rectangle(64, 64, 40, 8, 12, 40));
		project.manifest.rig.rest = { east: { image: bodyHash, keypoints: [] } };
		expect(previewBounds(project).facings.get('west')).toMatchObject({ x: -14, y: -8 });
		project.images.set('sha256:west-rest', rectangle(64, 64, 10, 8, 12, 42));
		project.manifest.rig.rest.west = { image: 'sha256:west-rest', keypoints: [] };
		expect(previewBounds(project).facings.get('west')).toMatchObject({ x: -16, y: -6 });
	});

	test('falls back to loaded body poses when the rest image is missing or transparent', () => {
		const project = fixture();
		project.images.set(bodyHash, rectangle(64, 64, 35, 8, 20, 40));
		project.manifest.rig.rest = { south: { image: 'sha256:rest', keypoints: [] } };
		expect(previewBounds(project).facings.get('south')).toMatchObject({ x: 13, y: -8 });
		project.images.set('sha256:rest', makeImg(64, 64));
		expect(previewBounds(project).facings.get('south')).toMatchObject({ x: 13, y: -8 });
	});

	test('includes a larger rest in fitting even when animated poses are smaller', () => {
		const project = fixture();
		project.manifest.rig.rest = { south: { image: 'sha256:rest', keypoints: [] } };
		project.images.set('sha256:rest', rectangle(64, 64, 16, 2, 32, 54));
		const bounds = previewBounds(project);
		expect(bounds.body).toEqual({ w: 32, h: 54, x: 16, y: 54 });
		expect(bounds.reach).toEqual(bounds.body);
	});
});

describe('stable painted outfit frame', () => {
	test('ignores blank oversize padding without changing the baked drawing frame or pixels', () => {
		const p = fixture();
		weapon(p, makeImg(96, 96));
		const before = [...p.images.get(bodyHash)!.data];
		expect(bakedFrame(p.manifest)).toEqual({ w: 96, h: 96, x: 48, y: 72 });
		expect(paintedFrame(p, { main_hand: 'weapon' })).toEqual({ w: 24, h: 48, x: 12, y: 48 });
		expect([...p.images.get(bodyHash)!.data]).toEqual(before);
		expect(bakedFrame(p.manifest)).toEqual({ w: 96, h: 96, x: 48, y: 72 });
	});

	test('includes animation extremes across every clip, direction and cell', () => {
		const p = fixture(),
			layer = p.manifest.items[0].layers[0];
		p.images.set('sha256:extreme', rectangle(64, 64, 5, 1, 2, 2));
		layer.cells!.attack = { north: [null, 'sha256:extreme'] };
		expect(paintedFrame(p, {})).toEqual({ w: 39, h: 55, x: 27, y: 55 });
	});

	test('unions oversize equipment around its own pivot, including later weapon extremes', () => {
		const p = fixture(),
			gear = weapon(p, rectangle(96, 96, 2, 60));
		p.images.set('sha256:reach', rectangle(96, 96, 94, 10));
		gear.layers[0].cells!.attack = { east: ['sha256:reach'] };
		expect(paintedFrame(p, { main_hand: 'weapon' })).toEqual({ w: 93, h: 62, x: 46, y: 62 });
		expect(paintedFrame(p, {})).toEqual({ w: 24, h: 48, x: 12, y: 48 });
	});

	test('excludes hidden equipped slots and uses compositor baked tuck variants', () => {
		const p = fixture();
		const gear = weapon(p, rectangle(96, 96, 0, 0));
		p.manifest.items[0].hides = ['main_hand'];
		expect(paintedFrame(p, { main_hand: gear.id })).toEqual({ w: 24, h: 48, x: 12, y: 48 });
		p.images.set('sha256:hair', rectangle(64, 64, 0, 8, 64, 12));
		p.images.set('sha256:tucked', rectangle(64, 64, 22, 30, 20, 10));
		p.manifest.slots.find((slot) => slot.id === 'head')!.clips = ['hair'];
		p.manifest.items.push(
			item('hat', 'head', []),
			item('hair', 'hair', [
				{ id: 'main', role: 'fg', z: 1, cells: { walk: { south: ['sha256:hair'] } } }
			]),
			{
				...item('hair~hat', 'hair', [
					{ id: 'main', role: 'fg', z: 1, cells: { walk: { south: ['sha256:tucked'] } } }
				]),
				variantOf: 'hair',
				under: 'hat'
			}
		);
		expect(paintedFrame(p, { hair: 'hair', head: 'hat' })).toEqual({ w: 24, h: 48, x: 12, y: 48 });
	});

	test('uses owner-local image overrides rather than another layer sharing the hash', () => {
		const p = fixture(),
			layer = p.manifest.items[0].layers[0];
		p.layerImages = new Map([[layer, new Map([[bodyHash, rectangle(64, 64, 25, 10, 10, 40)]])]]);
		expect(paintedFrame(p, {})).toEqual({ w: 10, h: 40, x: 7, y: 46 });
	});

	test('one facing counts only its own poses, and a mirrored facing its source flipped', () => {
		const p = fixture(),
			body = p.manifest.items[0].layers[0];
		p.images.set('sha256:east', rectangle(64, 64, 40, 10, 6, 46));
		body.cells = { walk: { south: [bodyHash], east: ['sha256:east'] } };
		p.manifest.rig.directions.push({ id: 'east' }, { id: 'west', mirrorOf: 'east' });
		expect(paintedFrame(p, {}, 'south')).toEqual({ w: 24, h: 48, x: 12, y: 48 });
		expect(paintedFrame(p, {}, 'east')).toEqual({ w: 6, h: 46, x: -8, y: 46 });
		expect(paintedFrame(p, {}, 'west')).toEqual({ w: 6, h: 46, x: 14, y: 46 });
		// Without a direction every facing still counts, mirrored both ways.
		expect(paintedFrame(p, {}).w).toBe(28);
	});

	test('a facing reach unions the bare body and each owned item worn alone in that facing', () => {
		const p = fixture();
		weapon(p, rectangle(96, 96, 10, 40, 30, 4));
		expect(reachFrame(p, 'south')).toEqual({ w: 50, h: 48, x: 38, y: 48 });
		expect(reachFrame(p, 'south')).toEqual(reachFrame(p));
	});

	test('missing equipment facings keep the drawn body reach instead of the full baked frame', () => {
		const p = fixture();
		weapon(p, rectangle(96, 96, 10, 40, 30, 4));
		p.manifest.rig.directions.push({ id: 'north' });
		p.manifest.items[0].layers[0].cells!.walk.north = [bodyHash];
		expect(reachFrame(p, 'north')).toEqual({ w: 24, h: 48, x: 12, y: 48 });
		expect(reachFrame(p, 'north')).not.toEqual(bakedFrame(p.manifest));
	});

	test('conservatively includes horizontal counterparts for declared mirrors', () => {
		const p = fixture();
		p.images.set(bodyHash, rectangle(64, 64, 10, 10, 2, 3));
		p.manifest.rig.directions.push({ id: 'west', mirrorOf: 'east' }, { id: 'east' });
		expect(paintedFrame(p, {})).toEqual({ w: 44, h: 3, x: 22, y: 46 });
	});

	test('falls back to the full baked frame for empty or missing artwork', () => {
		const p = fixture();
		weapon(p, makeImg(96, 96));
		p.images.set(bodyHash, makeImg(64, 64));
		expect(paintedFrame(p, {})).toEqual(bakedFrame(p.manifest));
		p.images.delete(bodyHash);
		expect(paintedFrame(p, {})).toEqual(bakedFrame(p.manifest));
	});

	test('falls back for mismatched images, sparse cells and malformed originals', () => {
		const p = fixture();
		p.images.set(bodyHash, makeImg(32, 32));
		expect(paintedFrame(p, {})).toEqual(bakedFrame(p.manifest));
		p.images.set(bodyHash, rectangle(64, 64, 20, 8));
		p.manifest.items[0].layers[0].cells!.walk.south = new Array(2);
		expect(paintedFrame(p, {})).toEqual(bakedFrame(p.manifest));
		p.manifest.items[0].layers[0].cells = {};
		p.manifest.rig.rest = { south: { image: 'sha256:absent', keypoints: [] } };
		expect(paintedFrame(p, {})).toEqual(bakedFrame(p.manifest));
	});

	test('keeps a finite rig fallback when a layer has malformed frame metadata', () => {
		const p = fixture();
		p.manifest.items[0].layers[0].pivot = { x: NaN, y: 40 };
		expect(paintedFrame(p, {})).toEqual({ w: 64, h: 64, x: 32, y: 56 });
	});

	test('falls back for malformed pixel buffers and preserves a zero pivot offset', () => {
		const p = fixture();
		p.images.set(bodyHash, { w: 64, h: 64, data: new Uint8ClampedArray(3) });
		expect(paintedFrame(p, {})).toEqual(bakedFrame(p.manifest));
		p.images.set(bodyHash, rectangle(64, 64, 32, 56));
		expect(paintedFrame(p, {})).toEqual({ w: 1, h: 1, x: 0, y: 0 });
	});

	test('caches alpha scans by image identity across repeated outfit calculations', () => {
		const p = fixture(),
			image = p.images.get(bodyHash)!;
		const data = image.data;
		let reads = 0;
		Object.defineProperty(image, 'data', {
			get: () => {
				reads++;
				return data;
			}
		});
		expect(paintedFrame(p, {})).toEqual({ w: 24, h: 48, x: 12, y: 48 });
		expect(paintedFrame(p, {})).toEqual({ w: 24, h: 48, x: 12, y: 48 });
		expect(reads).toBe(1);
		p.images.set(bodyHash, rectangle(64, 64, 30, 30));
		expect(paintedFrame(p, {})).toEqual({ w: 1, h: 1, x: 2, y: 26 });
	});
});
