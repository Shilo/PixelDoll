import { equipmentFixture } from './equipment-fixture.ts';
import { defaultExportSettings } from '../../src/lib/store/export-settings.ts';
import type { Engine } from '../../src/lib/store/manifest.ts';

export const engines = [
	'generic',
	'godot',
	'phaser',
	'phaser-ae',
	'unity',
	'gdevelop',
	'aseprite',
	'rpg-maker',
	'rpg-maker-xp'
] as const;

export async function folderExportFixture() {
	const project = await equipmentFixture();
	const { rig, items } = project.manifest;
	rig.directions = [{ id: 'south' }, { id: 'north' }, { id: 'east' }, { id: 'west' }];
	rig.animations.push({
		id: 'walk',
		cells: 3,
		frames: [
			{ cell: 0, ms: 100 },
			{ cell: 1, ms: 150 },
			{ cell: 2, ms: 50 }
		],
		loop: true
	});
	for (const item of items) {
		const cells = item.layers[0].cells!;
		const [first] = cells.rest.south!;
		const row = [first, first, first];
		cells.walk = { south: row, north: row, east: row, west: row };
	}
	return project;
}

export const exportOptions = (engine: Engine) => ({
	engine,
	baked: true,
	look: { items: { body: 'base', head: 'hat' }, variants: { hat: 'red' } },
	settings: defaultExportSettings(),
	exportedAt: '2026-01-01T00:00:00.000Z'
});
