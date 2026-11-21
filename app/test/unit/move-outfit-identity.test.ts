import { expect, test } from 'vitest';
import { readFile } from 'node:fs/promises';
import { loadFixture } from '../../src/lib/compose/fixture.ts';
import { exportFiles, type ExportOptions } from '../../src/lib/export/export.ts';
import { moveProject } from '../../src/lib/export/build.ts';
import { projectExportIdentity } from '../../src/lib/export/identity.ts';
import { applyExportSettings, defaultExportSettings } from '../../src/lib/store/export-settings.ts';
import {
	checkExportIdentity,
	assignNewClipExportId,
	editMoveIdentity,
	editOutfitIdentity,
	moveExportId,
	retainMoveChoices
} from '../../src/lib/store/identity.ts';
import {
	DEFAULT_MOVE,
	playlist,
	rigArtworkVersion,
	type RigAnimation
} from '../../src/lib/rig/rig.ts';
import { moveLabel } from '../../src/studio/model.ts';
import type { Manifest, Project } from '../../src/lib/store/manifest.ts';

const fixture = () =>
	loadFixture(
		async (path) =>
			new Uint8Array(await readFile(new URL(`../../public/fixtures/s2/${path}`, import.meta.url)))
	);
const engines: ExportOptions = {
	engines: ['generic', 'phaser', 'godot', 'unity', 'gdevelop'],
	baked: true,
	exportedAt: '2026-01-01T00:00:00.000Z'
};

test('a move export ID renames every exported reference exactly like an internal rename would', async () => {
	const loaded = await fixture();
	// Both sides go through JSON, which drops undefined fields and so changes key order in written files.
	const renamed: Project = { ...loaded, manifest: JSON.parse(JSON.stringify(loaded.manifest)) };
	editMoveIdentity(renamed.manifest, 'walk', 'Stride', 'stride');
	editMoveIdentity(renamed.manifest, 'cross-punch', undefined, 'jab');
	// Independent oracle: the same character with its internal move IDs replaced in the stored text.
	const rekeyed = await fixture();
	let text = JSON.stringify(rekeyed.manifest);
	for (const [from, to] of [
		['walk', 'stride'],
		['cross-punch', 'jab']
	])
		text = text.replaceAll(`"${from}"`, `"${to}"`).replaceAll(`"${from}/`, `"${to}/`);
	const oracle: Project = { ...rekeyed, manifest: JSON.parse(text) as Manifest };
	const [stride, jab] = oracle.manifest.rig.animations;
	stride.name = 'Stride';
	// PixelLab's template name is provenance, not a move ID.
	jab.source!.template_animation_id = 'cross-punch';

	const a = await exportFiles(renamed, engines);
	const b = await exportFiles(oracle, engines);
	expect(a.errors).toEqual([]);
	expect(a.warnings).toEqual(b.warnings);
	const files = (r: typeof a) =>
		new Map(r.entries.map((entry) => [entry.name, Buffer.from(entry.data).toString('base64')]));
	const actual = files(a),
		expected = files(b);
	expect([...actual.keys()].sort()).toEqual([...expected.keys()].sort());
	expect([...actual.keys()].some((name) => name.includes('stride'))).toBe(true);
	expect([...actual.keys()].some((name) => /walk|cross-punch/.test(name))).toBe(false);
	// project.json is the editable copy: it keeps internal IDs, so frames, jobs and drafts still find their move.
	for (const [name, data] of actual)
		if (name !== 'project.json') expect(data, name).toBe(expected.get(name));
	const editable = JSON.parse(
		new TextDecoder().decode(a.entries.find((entry) => entry.name === 'project.json')!.data)
	);
	expect(editable.manifest.rig.animations[0]).toMatchObject({
		id: 'walk',
		name: 'Stride',
		exportId: 'stride'
	});
	expect(renamed.manifest.rig.animations.map((move) => move.id)).toEqual(['walk', 'cross-punch']);
});

test('move and outfit identity edits keep export IDs valid, unique and reserved', async () => {
	const { manifest } = await fixture();
	manifest.rig.animations.unshift({
		id: DEFAULT_MOVE,
		cells: 1,
		loop: true,
		frames: playlist(1, 100)
	});
	expect(() => editMoveIdentity(manifest, 'walk', undefined, 'cross-punch')).toThrow(
		/Another move/
	);
	expect(() => editMoveIdentity(manifest, 'walk', undefined, DEFAULT_MOVE)).toThrow(/Invalid/);
	expect(() => editMoveIdentity(manifest, 'walk', undefined, 'standing')).toThrow(/Invalid/);
	expect(() => editMoveIdentity(manifest, DEFAULT_MOVE, undefined, 'stand')).toThrow(/standing/);
	for (const invalid of ['Walk', 'con', '_walk', 'a'.repeat(41)])
		expect(() => editMoveIdentity(manifest, 'walk', undefined, invalid)).toThrow(/Invalid/);
	expect(() => editMoveIdentity(manifest, 'walk', ' ', undefined)).toThrow(/1–60/);
	expect(() => editMoveIdentity(manifest, 'gone', 'Gone')).toThrow(/no longer exists/);
	editMoveIdentity(manifest, DEFAULT_MOVE, 'Stand');
	editMoveIdentity(manifest, 'walk', '  Stroll ', 'stroll');
	expect(manifest.rig.animations[1]).toMatchObject({
		id: 'walk',
		name: 'Stroll',
		exportId: 'stroll'
	});
	// The old internal ID is free once nothing exports as it, and going back to it clears the override.
	expect(() => editMoveIdentity(manifest, 'cross-punch', undefined, 'walk')).not.toThrow();
	editMoveIdentity(manifest, 'cross-punch', undefined, 'cross-punch');
	expect(manifest.rig.animations[2].exportId).toBeUndefined();
	editMoveIdentity(manifest, 'cross-punch', undefined, 'walk');
	expect(
		manifest.rig.animations.map((move) => moveExportId(move, manifest.rig.animations))
	).toEqual(['standing', 'stroll', 'walk']);
	expect(() => checkExportIdentity(manifest)).not.toThrow();
	// Imported or tampered records are checked the same way before an export or import uses them.
	for (const broken of [
		{ exportId: 'stroll' },
		{ exportId: 'Bad id' },
		{ exportId: DEFAULT_MOVE },
		{ name: 7 as unknown as string }
	]) {
		const copy = structuredClone(manifest);
		Object.assign(copy.rig.animations[2], broken);
		expect(() => checkExportIdentity(copy), JSON.stringify(broken)).toThrow();
	}

	const outfits = structuredClone(manifest.presets);
	expect(outfits.map((outfit) => outfit.id)).toEqual(['adventurer', 'base-only']);
	expect(() => editOutfitIdentity(outfits, 'adventurer', undefined, 'base-only')).toThrow(
		/Another outfit/
	);
	for (const invalid of ['current', 'Knight', 'aux', ''])
		expect(() => editOutfitIdentity(outfits, 'adventurer', undefined, invalid)).toThrow(/Invalid/);
	expect(() => editOutfitIdentity(outfits, 'gone', 'Gone')).toThrow(/no longer exists/);
	editOutfitIdentity(outfits, 'adventurer', ' Knight ', 'knight_set');
	expect(outfits[0]).toMatchObject({ id: 'knight_set', name: 'Knight' });
});

test('Standing and a literal standing clip keep separate sheets and use public playback IDs', async () => {
	const source = await fixture();
	const { manifest } = source;
	const [walk] = manifest.rig.animations;
	const literal: RigAnimation = {
		id: 'standing',
		kind: 'move',
		cells: 1,
		loop: true,
		frames: playlist(1, 120)
	};
	manifest.rig.animations.unshift(literal);
	editMoveIdentity(manifest, literal.id, undefined, 'stance');
	editMoveIdentity(manifest, literal.id, undefined, 'standing');
	expect(literal.exportId).toBeUndefined();
	manifest.rig.animations.unshift({
		id: DEFAULT_MOVE,
		kind: 'state',
		cells: 1,
		loop: true,
		frames: playlist(1, 100)
	});
	const competingClip: RigAnimation = {
		id: 'standing-move',
		cells: 1,
		loop: false,
		frames: playlist(1, 150)
	};
	assignNewClipExportId(competingClip, manifest.rig.animations);
	expect(competingClip.exportId).toBe('standing-move_2');
	expect(moveExportId(literal, [...manifest.rig.animations, competingClip])).toBe('standing-move');
	walk.exportId = 'standing-move';
	walk.moveLoop = true;
	const layer = manifest.items[0].layers[0];
	layer.sheets = { default: 'state.png', standing: 'legacy.png', [walk.id]: 'aliased.png' };
	layer.sourceSheets = {
		default: 'state-src.png',
		standing: 'legacy-src.png',
		[walk.id]: 'alias-src.png'
	};
	applyExportSettings(manifest, {
		...defaultExportSettings(),
		playOnce: ['standing', 'standing-move', 'standing-move_2']
	});
	expect(() => checkExportIdentity(manifest)).not.toThrow();
	const exported = projectExportIdentity(source).manifest;
	expect(
		exported.rig.animations
			.slice(0, 3)
			.map(({ id, kind, loop, frames }) => [id, kind, loop, frames[0].ms])
	).toEqual([
		['standing', 'state', false, 100],
		['standing-move_2', 'move', false, 120],
		['standing-move', 'move', true, walk.frames[0].ms]
	]);
	expect(exported.items[0].layers[0].sheets).toEqual({
		standing: 'state.png',
		'standing-move_2': 'legacy.png',
		'standing-move': 'aliased.png'
	});
	expect(exported.items[0].layers[0].sourceSheets).toEqual({
		standing: 'state-src.png',
		'standing-move_2': 'legacy-src.png',
		'standing-move': 'alias-src.png'
	});
	expect(manifest.rig.animations.slice(0, 3).map(({ id }) => id)).toEqual([
		DEFAULT_MOVE,
		'standing',
		walk.id
	]);
	expect(layer.sheets.default).toBe('state.png');
	const scoped = await moveProject(source, 'standing');
	expect(() => checkExportIdentity(scoped.manifest)).not.toThrow();
	applyExportSettings(scoped.manifest, {
		...defaultExportSettings(),
		playOnce: ['standing-move_2']
	});
	expect(projectExportIdentity(scoped).manifest.rig.animations).toMatchObject([
		{ id: 'standing', loop: true },
		{ id: 'standing-move_2', loop: false }
	]);
	const newState: RigAnimation = {
		id: 'standing-move',
		kind: 'state',
		cells: 1,
		loop: false,
		frames: playlist(1, 150)
	};
	assignNewClipExportId(newState, manifest.rig.animations);
	manifest.rig.animations.push(newState);
	expect(newState).toMatchObject({ id: 'standing-move', exportId: 'standing-move_3', loop: false });
	expect(() => checkExportIdentity(manifest)).not.toThrow();
});

test('renamed outfits reach exports under their new IDs', async () => {
	const project = await fixture();
	editOutfitIdentity(project.manifest.presets, 'adventurer', 'Knight', 'knight_set');
	const result = await exportFiles(project, engines);
	expect(result.errors).toEqual([]);
	const exported: Manifest = JSON.parse(
		new TextDecoder().decode(result.entries.find((entry) => entry.name === 'manifest.json')!.data)
	);
	expect(exported.presets.map((preset) => [preset.id, preset.name])).toContainEqual([
		'knight_set',
		'Knight'
	]);
	expect(result.entries.some((entry) => entry.name.startsWith('baked/knight_set/'))).toBe(true);
	expect(result.entries.some((entry) => entry.name.includes('adventurer'))).toBe(false);
});

test('publishing a move keeps saved names and gives a new move a free export ID', async () => {
	const { manifest } = await fixture();
	const current = structuredClone(manifest.rig);
	editMoveIdentity({ ...manifest, rig: current }, 'cross-punch', 'Jab', 'kick');
	const next = structuredClone(manifest.rig);
	next.animations.push({ id: 'kick', cells: 2, loop: true, frames: playlist(2, 100) });
	retainMoveChoices(next, current);
	expect(next.animations.map((move) => [move.id, move.name, moveExportId(move)])).toEqual([
		['walk', undefined, 'walk'],
		['cross-punch', 'Jab', 'kick'],
		['kick', undefined, 'kick_2']
	]);
	expect(() => checkExportIdentity({ ...manifest, rig: next })).not.toThrow();
});

test('names and export IDs never change artwork versions, playback settings follow export IDs', async () => {
	const { manifest } = await fixture();
	const before = rigArtworkVersion(manifest.rig, null);
	editMoveIdentity(manifest, 'cross-punch', 'Jab', 'jab');
	expect(rigArtworkVersion(manifest.rig, null)).toBe(before);
	applyExportSettings(manifest, { ...defaultExportSettings(), playOnce: ['jab'] });
	expect(manifest.rig.animations.map((move) => move.loop)).toEqual([true, false]);
});

test('move labels show given names and tell equal names apart by export ID', () => {
	const moves = [
		{ id: 'walk', name: 'Attack', exportId: 'swing' },
		{ id: 'cross-punch', name: 'Attack' },
		{ id: 'kick' }
	];
	expect(moveLabel('walk', moves)).toBe('Attack (swing)');
	expect(moveLabel('cross-punch', moves)).toBe('Attack (cross-punch)');
	expect(moveLabel('kick', moves)).toBe('Kick');
	expect(moveLabel('kick', ['kick', 'kick_'])).toBe('Kick (kick)');
});
