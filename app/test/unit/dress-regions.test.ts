import { expect, test } from 'vitest';
import { deriveMaterials, recolor } from '../../src/lib/dress/dress.ts';
import type { Img } from '../../src/lib/image/png.ts';
import { DEFAULT_MOVE, type ClipSource } from '../../src/lib/rig/rig.ts';
import type { Manifest, Project, Sha256 } from '../../src/lib/store/manifest.ts';

function pixels(...colors: number[]): Img {
	return {
		w: colors.length,
		h: 1,
		data: new Uint8ClampedArray(
			colors.flatMap((color) => [color >> 16, (color >> 8) & 255, color & 255, 255])
		)
	};
}

test('only region-encoded body views seed shirt and shorts ramps', () => {
	const split = pixels(0x9eacb0, 0x9eacb1);
	const standing = pixels(0x5f6162, 0x5f6163);
	const native = pixels(0x9eacb0, 0x6d7c86, 0x6d7c87);
	const mirror = pixels(0x6d7c87);
	const mini = pixels(0x6d7c86);
	const source = (route: ClipSource['route'], motion: string): ClipSource => ({
		route,
		motion,
		reference: 'sha256:rest',
		provenance: []
	});
	const project: Project = {
		manifest: {
			rig: {
				baseItem: 'body',
				directions: [
					{ id: 'south' },
					{ id: 'east' },
					{ id: 'west', mirrorOf: 'east' },
					{ id: 'north' }
				],
				animations: [
					{ id: DEFAULT_MOVE, sources: { south: source('v3', 'imported-rest') } },
					{
						id: 'walk',
						sources: {
							south: source('skeleton-v3', 'managed-skeleton-v3:walking-8-frames'),
							east: source('v3', 'v3:walk'),
							north: source('pixminimax', 'pixminimax:walk')
						}
					}
				]
			},
			items: [
				{
					id: 'body',
					slot: 'body',
					regions: 'shirt-shorts',
					materials: [],
					layers: [
						{
							cells: {
								[DEFAULT_MOVE]: { south: ['sha256:standing'] },
								walk: {
									south: ['sha256:split'],
									east: ['sha256:native'],
									west: ['sha256:mirror'],
									north: ['sha256:mini']
								}
							}
						}
					]
				}
			],
			materials: []
		} as unknown as Manifest,
		images: new Map<Sha256, Img>([
			['sha256:split', split],
			['sha256:standing', standing],
			['sha256:native', native],
			['sha256:mirror', mirror],
			['sha256:mini', mini]
		])
	};
	deriveMaterials(project);
	const { materials } = project.manifest;
	expect(materials.map(({ label, ramp }) => ({ label, ramp }))).toEqual([
		{ label: 'Shirt', ramp: ['#5f6162', '#9eacb0'] },
		{ label: 'Shorts', ramp: ['#5f6163', '#9eacb1'] }
	]);
	const [shirt] = materials;
	shirt.variants.red = ['#800000', '#ff0000'];
	const colored = recolor(project, { [shirt.id]: 'red' });
	expect(colored.images.get('sha256:native')).toEqual(pixels(0xff0000, 0x6d7c86, 0x6d7c87));
	expect(project.images.get('sha256:native')).toEqual(pixels(0x9eacb0, 0x6d7c86, 0x6d7c87));
});
