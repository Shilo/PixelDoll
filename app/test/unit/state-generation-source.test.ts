import { describe, expect, it, vi } from 'vitest';
import { makeImg } from '../../src/lib/image/png.ts';
import { cellHash } from '../../src/lib/rig/rig.ts';
import type { Project } from '../../src/lib/store/manifest.ts';
import {
	stateGenerationSource,
	stateSourceFits,
	verifyManagedStateParent,
	type ManagedStateDetail,
	type StateGenerationSource
} from '../../src/studio/stateGenerationSource.ts';

describe('State source frames', () => {
	it('reads the drawn views of any Move frame and versions the chosen frame', async () => {
		const pixel = (value: number) => {
			const image = makeImg(8, 8);
			image.data.set([value, 0, 0, 255], 4 * 9);
			return image;
		};
		const [first, second, east] = [pixel(1), pixel(2), pixel(3)];
		const [a, b, c] = await Promise.all([first, second, east].map(cellHash));
		const project = {
			images: new Map([
				[a, first],
				[b, second],
				[c, east]
			]),
			manifest: {
				rig: {
					baseItem: 'body',
					cell: { w: 8, h: 8 },
					pivot: { x: 4, y: 7 },
					directions: [{ id: 'south' }, { id: 'east' }, { id: 'west', mirrorOf: 'east' }],
					animations: [
						{
							id: 'punch',
							kind: 'move',
							cells: 2,
							frames: [
								{ cell: 0, ms: 100 },
								{ cell: 1, ms: 100 }
							]
						}
					]
				},
				// East exists only in the second frame; mirrored west is never a separate view.
				items: [{ id: 'body', layers: [{ cells: { punch: { south: [a, b], east: [null, c] } } }] }]
			}
		} as unknown as Project;
		const last = stateGenerationSource(project, { clip: 'punch', frame: 1 });
		const opening = stateGenerationSource(project, { clip: 'punch', frame: 0 });
		expect(last?.views.map(({ direction, hash }) => [direction, hash])).toEqual([
			['south', b],
			['east', c]
		]);
		expect(opening?.views.map(({ direction, hash }) => [direction, hash])).toEqual([['south', a]]);
		expect(opening?.version).not.toBe(last?.version);
		expect(stateGenerationSource(project, { clip: 'punch', frame: 2 })).toBeNull();
		expect(stateGenerationSource(project, { clip: 'missing', frame: 0 })).toBeNull();
	});
});

async function fixture() {
	const image = makeImg(80, 80);
	image.data.set([44, 55, 66, 255]);
	const hash = await cellHash(image);
	const size = { width: image.w, height: image.h };
	const source: StateGenerationSource = {
		size,
		version: 'local',
		views: [{ direction: 'east', hash, image }]
	};
	const detail: ManagedStateDetail = {
		id: 'parent',
		status: 'completed',
		size,
		directions: 4,
		state_name: 'Standing',
		rotation_urls: { north: 'n', south: 's', east: 'e', west: 'w' }
	};
	return { image, size, source, detail };
}

describe('managed State parent preflight', () => {
	it('accepts the exact managed source and returns the provider facing count, not the authored count', async () => {
		const { image, size, source, detail } = await fixture();
		const read = vi.fn(async () => image);
		expect(await verifyManagedStateParent(source, 'parent', detail, read)).toEqual({
			id: 'parent',
			size,
			facingCount: 4,
			name: 'Standing'
		});
		expect(read).toHaveBeenCalledExactlyOnceWith('e');
	});

	it('rejects an inaccessible ID, incomplete metadata or changed pixels before submission', async () => {
		const { image, source, detail } = await fixture();
		const read = vi.fn(async () => image);
		for (const ineligible of [
			{ ...detail, id: 'other' },
			{ ...detail, status: 'pending' },
			{ ...detail, directions: 2 },
			{ ...detail, size: { width: 81, height: 80 } },
			{ ...detail, rotation_urls: { east: 'e' } }
		])
			expect(await verifyManagedStateParent(source, 'parent', ineligible, read)).toBeNull();
		expect(read).not.toHaveBeenCalled();
		image.data[0]++;
		expect(await verifyManagedStateParent(source, 'parent', detail, read)).toBeNull();
	});

	it('accepts omitted status and null diagonals in a four-direction response', async () => {
		const { image, source, detail } = await fixture();
		const response: ManagedStateDetail = {
			...detail,
			status: undefined,
			rotation_urls: { ...detail.rotation_urls, 'north-east': null, 'south-east': null }
		};
		expect(
			await verifyManagedStateParent(source, 'parent', response, async () => image)
		).toMatchObject({
			id: 'parent',
			facingCount: 4
		});
	});

	it('does not verify a managed parent when its rotation cannot be downloaded', async () => {
		const { source, detail } = await fixture();
		expect(await verifyManagedStateParent(source, 'parent', detail, async () => null)).toBeNull();
	});
});

describe('State source fit', () => {
	it('keeps a State result savable after its source frame changed, never after the frame geometry did', async () => {
		const image = makeImg(8, 8);
		image.data.set([9, 0, 0, 255], 4 * 9);
		const hash = await cellHash(image);
		const project = {
			images: new Map([[hash, image]]),
			manifest: {
				rig: {
					baseItem: 'body',
					cell: { w: 8, h: 8 },
					pivot: { x: 4, y: 7 },
					directions: [{ id: 'south' }],
					animations: [{ id: 'idle', kind: 'move', cells: 1, frames: [{ cell: 0, ms: 100 }] }]
				},
				items: [{ id: 'body', layers: [{ cells: { idle: { south: [hash] } } }] }]
			}
		} as unknown as Project;
		const made = stateGenerationSource(project, { clip: 'idle', frame: 0 })!.version;
		expect(stateSourceFits(project, made)).toBe(true);
		// Fix frames redrew the source frame: the result was drawn from an earlier look but still lines up.
		const edited = structuredClone(image);
		edited.data[4 * 9] = 10;
		const editedHash = await cellHash(edited);
		project.images.set(editedHash, edited);
		project.manifest.items[0].layers[0].cells!.idle.south = [editedHash];
		expect(stateGenerationSource(project, { clip: 'idle', frame: 0 })!.version).not.toBe(made);
		expect(stateSourceFits(project, made)).toBe(true);
		// So does a source move that was deleted since.
		project.manifest.rig.animations = [];
		expect(stateSourceFits(project, made)).toBe(true);
		// A moved pivot or another view set would misalign it.
		project.manifest.rig.pivot = { x: 4, y: 6 };
		expect(stateSourceFits(project, made)).toBe(false);
		project.manifest.rig.pivot = { x: 4, y: 7 };
		project.manifest.rig.directions = [{ id: 'south' }, { id: 'east' }];
		expect(stateSourceFits(project, made)).toBe(false);
		expect(stateSourceFits(project, 'not a version')).toBe(false);
	});
});
