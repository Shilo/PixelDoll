import { expect, test } from 'vitest';
import { exportFiles } from '../../src/lib/export/export.ts';
import { unityJson } from '../../src/lib/export/unity.ts';
import { exportManifest } from '../../src/lib/export/generic.ts';
import { makeImg } from '../../src/lib/image/png.ts';
import { cellHash } from '../../src/lib/rig/rig.ts';
import { CURRENT_FORMAT, type Project } from '../../src/lib/store/manifest.ts';
import {
	bakedSheetPath,
	portableAssetName,
	reservedPathSegment
} from '../../src/lib/export/paths.ts';

test('portable names handle Windows device stems without changing ordinary identifiers', () => {
	for (const name of ['CON', 'aux.png', 'nul', 'prn', 'com1', 'LPT9.txt', 'COM¹.png']) {
		expect(reservedPathSegment(name)).toBe(true);
		expect(reservedPathSegment(portableAssetName(name))).toBe(false);
	}
	for (const name of ['control', 'auxiliary', 'com10', 'my-con.png', '_CON']) {
		expect(reservedPathSegment(name)).toBe(false);
		expect(portableAssetName(name)).toBe(name);
	}
	expect(portableAssetName('CON.png')).toBe('CON_.png');
});

async function fixture(): Promise<Project> {
	const image = makeImg(64, 64);
	image.data.set([100, 100, 100, 255], 0);
	const hash = await cellHash(image);
	return {
		images: new Map([[hash, image]]),
		manifest: {
			format: CURRENT_FORMAT,
			name: 'Portable',
			app: 'test',
			materials: [],
			rig: {
				cell: { w: 64, h: 64 },
				pivot: { x: 32, y: 60 },
				baseItem: 'base',
				baseHash: hash,
				directions: [{ id: 'south' }],
				animations: [{ id: 'idle', cells: 1, loop: true, frames: [{ cell: 0, ms: 100 }] }]
			},
			slots: [{ id: 'body', z: 10, class: 'base' }],
			items: [
				{
					id: 'base',
					name: 'Base',
					slot: 'body',
					status: 'accepted',
					mirror: 'generate',
					materials: [],
					prompt: '',
					provenance: [],
					baseHash: hash,
					layers: [{ id: 'main', role: 'fg', z: 10, cells: { idle: { south: [hash] } } }]
				}
			],
			presets: [{ id: 'default', name: 'Default', items: { body: 'base' }, variants: {} }]
		}
	};
}

test('reserved immutable move and outfit IDs export with portable collision-free paths', async () => {
	const project = await fixture();
	const move = project.manifest.rig.animations[0];
	const previous = move.id;
	move.id = 'con';
	project.manifest.presets[0].id = 'aux';
	for (const item of project.manifest.items)
		for (const layer of item.layers)
			if (layer.cells?.[previous]) {
				layer.cells.con = layer.cells[previous];
				delete layer.cells[previous];
			}
	const result = await exportFiles(project, {
		engines: ['generic', 'phaser', 'godot', 'unity', 'gdevelop'],
		baked: true
	});
	expect(result.errors).toEqual([]);
	expect(result.entries.some((entry) => entry.name === 'baked/_aux/_con.png')).toBe(true);
	expect(result.entries.some((entry) => entry.name === 'layers/body/base/main/_con.png')).toBe(
		true
	);
	for (const entry of result.entries)
		expect(entry.name.split('/').some(reservedPathSegment), entry.name).toBe(false);
	const manifest = JSON.parse(
		new TextDecoder().decode(result.entries.find((entry) => entry.name === 'manifest.json')!.data)
	);
	expect(manifest.rig.animations[0].id).toBe('con');
	expect(manifest.presets[0].id).toBe('aux');
	const bakedPath = bakedSheetPath(manifest.export.baked[0], manifest.rig.animations[0].id);
	expect(bakedPath).toBe('baked/_aux/_con.png');
	expect(result.entries.find((entry) => entry.name === bakedPath)?.data.length).toBeGreaterThan(0);
	expect(manifest.items[0].layers[0].sheets.con).toBe('layers/body/base/main/_con.png');
});

test('display names become portable Unity asset and Aseprite file names', async () => {
	const project = await fixture();
	project.manifest.name = 'CON';
	expect(
		unityJson(exportManifest(project, { engines: ['unity'], baked: false }).manifest).name
	).toBe('CON_');
	const result = await exportFiles(project, { engines: ['aseprite'], baked: false });
	expect(result.errors).toEqual([]);
	expect(result.entries.some((entry) => entry.name === 'aseprite/CON_.aseprite')).toBe(true);
});
