import { describe, expect, it, vi } from 'vitest';
import { makeImg } from '../../src/lib/image/png.ts';
import { cellHash } from '../../src/lib/rig/rig.ts';
import {
	verifyManagedStateParent,
	type ManagedStateDetail,
	type StateGenerationSource
} from '../../src/studio/stateGenerationSource.ts';

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
