import { readFile } from 'node:fs/promises';
import { expect, test } from 'vitest';
import { loadFixture } from '../../src/lib/compose/fixture.ts';
import { missingFramesNote } from '../../src/studio/model.ts';

test('missing frames read as one short warning for the tile and menu', async () => {
	const { manifest: m } = await loadFixture(
		async (path) =>
			new Uint8Array(await readFile(new URL(`../../public/fixtures/s2/${path}`, import.meta.url)))
	);
	const notes = Object.fromEntries(m.items.map((it) => [it.id, missingFramesNote(m, it)]));
	// The demo's wizard hat has no north walk and no (south-only) cross punch; every other item is complete.
	expect(notes.hat_wizard).toBe('Missing frames in 2 moves');
	expect(Object.values(notes).filter(Boolean)).toHaveLength(1);
	// With only its Walk move left, the note names that move.
	const walkOnly = {
		...m,
		rig: { ...m.rig, animations: m.rig.animations.filter((a) => a.id === 'walk') }
	};
	expect(
		missingFramesNote(
			walkOnly,
			m.items.find((i) => i.id === 'hat_wizard')!
		)
	).toBe('Missing some Walk frames');
});
