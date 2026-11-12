import { expect, test } from 'vitest';
import { itemProject, buildExport } from '../../src/lib/export/build.ts';
import { variantOf } from '../../src/lib/dress/dress.ts';
import { makeImg } from '../../src/lib/image/png.ts';
import { cellHash } from '../../src/lib/rig/rig.ts';
import { defaultExportSettings } from '../../src/lib/store/export-settings.ts';
import { readCharacterZip } from '../../src/lib/store/import.ts';
import { CURRENT_FORMAT, type Project } from '../../src/lib/store/manifest.ts';

async function project(): Promise<Project> {
	const image = makeImg(32, 32);
	image.data.set([17, 34, 51, 255], 0);
	const hash = await cellHash(image);
	return {
		images: new Map([[hash, image]]),
		manifest: {
			format: CURRENT_FORMAT,
			app: 'PixelDoll',
			name: 'Review',
			rig: {
				cell: { w: 32, h: 32 },
				pivot: { x: 16, y: 31 },
				baseItem: 'base',
				baseHash: hash,
				directions: [{ id: 'south' }],
				animations: [{ id: 'idle', cells: 1, loop: true, frames: [{ cell: 0, ms: 100 }] }]
			},
			slots: [
				{ id: 'body', z: 10, class: 'base' },
				{ id: 'hair', z: 20, class: 'worn' },
				{ id: 'head', z: 30, class: 'rigid' }
			],
			items: ['base', 'hair', 'hat'].map((id, index) => ({
				id,
				name: id,
				slot: ['body', 'hair', 'head'][index],
				status: 'accepted',
				mirror: 'generate',
				materials: [`${id}_tone`],
				prompt: '',
				provenance: [],
				baseHash: hash,
				layers: [{ id: 'main', role: 'fg', z: 10 + index * 10, cells: { idle: { south: [hash] } } }]
			})),
			materials: ['base', 'hair', 'hat'].map((id) => ({
				id: `${id}_tone`,
				owner: id,
				label: id,
				ramp: ['#112233'],
				variants: { gold: ['#aabbcc'] }
			})),
			presets: []
		}
	};
}

test('item ZIP imports back with only body and item without mutating source', async () => {
	const source = await project(),
		before = structuredClone(source.manifest);
	const selected = itemProject(source, 'hair', {
		items: { body: 'base', hair: 'hair', head: 'hat' },
		variants: { hair_tone: 'gold' }
	});
	const result = await buildExport(selected.project, {
		engine: 'generic',
		baked: false,
		look: selected.look,
		settings: defaultExportSettings()
	});
	expect(result.errors).toEqual([]);
	expect(result.zip).toBeTruthy();
	const imported = await readCharacterZip(result.zip!);
	expect(imported.project.manifest.items.map((item) => item.id)).toEqual(['base', 'hair']);
	expect(imported.project.manifest.presets[0].variants.hair_tone).toBe('gold');
	expect(source.manifest).toEqual(before);
});

test('detaching omitted palette owner preserves uncolored selection', async () => {
	const source = await project();
	const hair = source.manifest.materials.find((material) => material.id === 'hair_tone')!;
	hair.defaultVariant = 'gold';
	hair.linkTo = 'hat_tone';
	const look = { items: { body: 'base', hair: 'hair', head: 'hat' }, variants: {} };
	expect(variantOf(source.manifest, look.variants, hair.id)).toBeUndefined();
	const selected = itemProject(source, 'hair', look);
	expect(variantOf(selected.project.manifest, selected.look.variants, hair.id)).toBeUndefined();
});
