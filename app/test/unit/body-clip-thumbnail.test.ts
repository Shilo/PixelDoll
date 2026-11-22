import { describe, expect, it } from 'vitest';
import { makeImg } from '../../src/lib/image/png.ts';
import { cellHash } from '../../src/lib/rig/rig.ts';
import type { Project } from '../../src/lib/store/manifest.ts';
import { bodyClipThumbnail } from '../../src/studio/moveThumbnails.ts';

describe('picker thumbnails', () => {
	it('shows a stored mirror override and falls back to a facing that has art', async () => {
		const west = makeImg(4, 4);
		west.data.set([9, 9, 9, 255], 0);
		const hash = await cellHash(west);
		const project = {
			images: new Map([[hash, west]]),
			manifest: {
				rig: {
					baseItem: 'body',
					cell: { w: 4, h: 4 },
					directions: [{ id: 'east' }, { id: 'west', mirrorOf: 'east' }],
					animations: [{ id: 'wave', kind: 'state', cells: 1, frames: [{ cell: 0, ms: 100 }] }]
				},
				// East (the donor) has no art in this frame; west carries its own override.
				items: [{ id: 'body', layers: [{ cells: { wave: { east: [null], west: [hash] } } }] }]
			}
		} as unknown as Project;
		expect(bodyClipThumbnail(project, 'wave', 'west')).toBe(west);
		expect(bodyClipThumbnail(project, 'wave', 'east')).toBe(west);
		expect(bodyClipThumbnail(project, 'missing', 'east')).toBeNull();
	});
});
