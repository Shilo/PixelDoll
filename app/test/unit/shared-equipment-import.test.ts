import { beforeEach, expect, test, vi } from 'vitest';
import { equipmentFixture } from './equipment-fixture.ts';
import { exportFiles } from '../../src/lib/export/export.ts';
import { readCharacterZip, saveImportedCharacter } from '../../src/lib/store/import.ts';
import { loadProject } from '../../src/lib/store/project.ts';
import { zip } from '../../src/lib/store/zip.ts';
import { composeCell } from '../../src/lib/compose/compose.ts';
import { recolor } from '../../src/lib/dress/dress.ts';
const memory = vi.hoisted(() => ({
	records: new Map<string, unknown>(),
	blobs: new Map<string, Blob>()
}));
vi.mock('../../src/lib/store/db.ts', () => ({
	get: async (_s: string, id: string) => structuredClone(memory.records.get(id)),
	getBlob: async (hash: string) => memory.blobs.get(hash),
	askPersist: () => {},
	putCharacter: async (id: string, record: unknown, blobs: Map<string, Blob>) => {
		if (memory.records.has(id)) throw new Error('duplicate');
		for (const [hash, blob] of blobs) memory.blobs.set(hash, blob);
		memory.records.set(id, structuredClone(record));
	}
}));
beforeEach(() => {
	memory.records.clear();
	memory.blobs.clear();
});

test('a character ZIP from the shared-design era still imports; its item.design is ignored', async () => {
	const source = await equipmentFixture();
	// The retired lineage pinned a design snapshot whose images need not be in the archive.
	Object.assign(source.manifest.items[1], {
		design: {
			designId: 'equipment-design:old',
			snapshot: { name: 'Old hat', imageHashes: [`sha256:${'f'.repeat(64)}`] }
		}
	});
	const exported = await exportFiles(source, { engines: ['generic'], baked: true });
	expect(exported.errors).toEqual([]);
	const restored = await readCharacterZip(await zip(exported.entries));
	const expected = composeCell(
		recolor(restored.project, {}),
		restored.project.manifest.presets[0].items,
		'rest',
		'south',
		0
	);
	// Reopen from only the newly persisted records and blobs, not the export's in-memory image map.
	const id = await saveImportedCharacter(restored, 'Restored character'),
		reopened = await loadProject(id);
	expect(reopened.project.manifest.items.map((it) => it.id)).toEqual(['base', 'hat']);
	expect(
		composeCell(
			recolor(reopened.project, {}),
			reopened.project.manifest.presets[0].items,
			'rest',
			'south',
			0
		)
	).toEqual(expected);
});
