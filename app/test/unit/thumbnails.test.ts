import { expect, test } from 'vitest';
import { keepThumbnails, newest, stills } from '../../src/studio/experience/thumbnails.svelte.ts';

test('a complete listing drops the thumbnails of characters no longer listed', () => {
	const frame = { x: 0, y: 0, w: 64, h: 64 };
	const still = { look: '', image: null, frame, body: frame };
	stills.set('rig-kept', still);
	stills.set('rig-deleted', still);
	newest.set('rig-deleted', { look: '', reading: true }); // a read still running for it
	keepThumbnails(new Set(['fixture:s2', 'rig-kept']));
	expect([...stills.keys()]).toEqual(['rig-kept']);
	expect(newest.has('rig-deleted')).toBe(false);
});
