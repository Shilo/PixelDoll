import { expect, test } from 'vitest';
import { splitBase } from '../../src/lib/dress/regions.ts';
import { makeImg } from '../../src/lib/image/png.ts';
import { cellHash } from '../../src/lib/rig/rig.ts';
import { CURRENT_FORMAT, type Manifest, type Sha256 } from '../../src/lib/store/manifest.ts';

/** A gray garment column ten pixels tall: the split marks its lower pixels as shorts. */
const column = (x: number) => {
	const im = makeImg(8, 12);
	for (let y = 1; y < 11; y++) im.data.set([150, 150, 150, 255], (y * 8 + x) * 4);
	return im;
};
async function body(regions?: 'shirt-shorts') {
	const stand = column(2),
		step = column(5),
		standing = await cellHash(stand),
		walking = await cellHash(step),
		baseHash = `sha256:${'a'.repeat(64)}` as Sha256;
	const manifest: Manifest = {
		format: CURRENT_FORMAT,
		name: 'Body',
		app: 'test',
		materials: [],
		slots: [],
		presets: [],
		rig: {
			cell: { w: 8, h: 12 },
			pivot: { x: 4, y: 11 },
			baseHash,
			baseItem: 'base',
			directions: [{ id: 'south' }],
			animations: [
				{ id: 'default', cells: 1, loop: true, frames: [] },
				{ id: 'walk', cells: 1, loop: true, frames: [] }
			]
		},
		items: [
			{
				id: 'base',
				name: 'Base',
				slot: 'body',
				status: 'accepted',
				mirror: 'generate',
				baseHash,
				materials: [],
				prompt: '',
				provenance: [],
				...(regions ? { regions } : {}),
				layers: [
					{
						id: 'main',
						role: 'fg',
						z: 10,
						cells: { default: { south: [standing] }, walk: { south: [walking] } }
					}
				]
			}
		]
	};
	return {
		project: {
			manifest,
			images: new Map([
				[standing, stand],
				[walking, step]
			])
		},
		standing,
		walking,
		frames: () => manifest.items[0].layers[0].cells!
	};
}

test('a move added to a split body is marked without rewriting the frames it already had', async () => {
	// Marked earlier with other votes: this standing frame is not what a fresh split would write.
	const added = await body('shirt-shorts');
	expect((await splitBase(added.project, 'walk')).changed).toBe(1);
	expect(added.frames().default!.south).toEqual([added.standing]);
	expect(added.frames().walk!.south).not.toEqual([added.walking]);
	// A body that was never split is split whole, whichever move was just added.
	const fresh = await body();
	expect((await splitBase(fresh.project, 'walk')).changed).toBe(2);
	expect(fresh.frames().default!.south).not.toEqual([fresh.standing]);
});
