import { beforeEach, expect, test, vi } from 'vitest';
import { equipmentFixture, bodyOnly } from './equipment-fixture.ts';
import { acceptCopy, flipper, prepareCopy } from '../../src/lib/equipment/copy.ts';
import { assessCopy } from '../../src/lib/equipment/compatibility.ts';
import { forgetFits, listShared } from '../../src/lib/equipment/shared.ts';
import { loadProject, type StoredProject } from '../../src/lib/store/project.ts';
import { encodePngBytes } from '../../src/lib/image/pngraw.ts';
import { makeImg } from '../../src/lib/image/png.ts';
import { cellHash } from '../../src/lib/rig/rig.ts';
import { composeCell } from '../../src/lib/compose/compose.ts';
import { recolor } from '../../src/lib/dress/dress.ts';
import type { Item, Preset, Project } from '../../src/lib/store/manifest.ts';
import { healthOf } from '../../src/studio/model.ts';
import { exportManifest, validate } from '../../src/lib/export/generic.ts';
import { exportFiles } from '../../src/lib/export/export.ts';

const memory = vi.hoisted(() => ({
	records: new Map<string, unknown>(),
	blobs: new Map<string, Blob>(),
	writes: 0
}));
vi.mock('../../src/lib/store/db.ts', () => ({
	get: async (_s: string, id: string) => structuredClone(memory.records.get(id)),
	all: async () => [...memory.records.values()].map((r) => structuredClone(r)),
	getBlob: async (hash: string) => memory.blobs.get(hash),
	updateCharacter: async (
		id: string,
		blobs: Map<string, Blob>,
		fn: (record: unknown) => unknown,
		stored?: { keys: Iterable<string>; missing: (key: string) => Error }
	) => {
		for (const key of stored?.keys ?? []) if (!memory.blobs.has(key)) throw stored!.missing(key);
		const record = fn(structuredClone(memory.records.get(id)));
		for (const [hash, blob] of blobs) memory.blobs.set(hash, blob);
		memory.records.set(id, structuredClone(record));
		memory.writes++;
	}
}));
beforeEach(() => {
	memory.records.clear();
	memory.blobs.clear();
	memory.writes = 0;
	forgetFits();
});

async function store(
	id: string,
	p: Project,
	extra: Partial<StoredProject> & { dress?: { current?: Pick<Preset, 'items' | 'variants'> } } = {}
) {
	for (const [hash, im] of p.images)
		memory.blobs.set(
			hash.slice(7),
			new Blob([(await encodePngBytes(im)) as Uint8Array<ArrayBuffer>], { type: 'image/png' })
		);
	memory.records.set(id, {
		id,
		savedAt: '2026-11-01T00:00:00.000Z',
		origin: 'studio',
		manifest: p.manifest,
		...extra
	});
}
const named = (p: Project, name: string) => {
	p.manifest.name = name;
	return p;
};
const hatOf = (p: Project) => p.manifest.items.find((it) => it.id === 'hat')!;
const worn = (p: Project, items: Preset['items'], variants: Preset['variants'] = {}) =>
	composeCell(recolor(p, variants), items, 'rest', 'south', 0);

test('other characters’ finished items are listed once, without this character’s own duplicates', async () => {
	const target = named(await equipmentFixture(), 'Target');
	await store('rig-target', target);
	// Same slot and request as the target's own hat: hidden.
	await store('rig-same', named(await equipmentFixture(), 'Same hat'));
	const older = named(await equipmentFixture(), 'Older'),
		newer = named(await equipmentFixture(), 'Newer');
	Object.assign(hatOf(older), { prompt: 'a red hood', name: 'Old hood' });
	Object.assign(hatOf(newer), {
		prompt: 'A red  Hood',
		name: 'New hood',
		provenance: [{ createdAt: '2026-11-05T00:00:00.000Z', produced: [] }]
	});
	await store('rig-older', older);
	await store('rig-newer', newer);
	// A draft, a dev rig and the bodies are never offered.
	const draft = named(await equipmentFixture(), 'Draft'),
		dev = named(await equipmentFixture(), 'Dev');
	Object.assign(hatOf(draft), { prompt: 'a draft cap', status: 'draft' });
	Object.assign(hatOf(dev), { prompt: 'a dev cap' });
	await store('rig-draft', draft);
	await store('rig-dev', dev, { origin: 'dev' });
	const { items: list } = await listShared('rig-target', target.manifest);
	expect(list.map((x) => [x.sourceId, x.sourceName, x.item.name])).toEqual([
		['rig-newer', 'Newer', 'New hood']
	]);
	// The open character's own items never list; another character's hood is its duplicate.
	expect(
		(await listShared('rig-newer', newer.manifest)).items.map((x) => [x.sourceId, x.item.prompt])
	).toEqual([['rig-target', 'hat']]);
});

test('an identical body copies the item pixel for pixel, as an independent item with its own colors', async () => {
	const source = named(await equipmentFixture(), 'Knight');
	await store('rig-source', source, {
		dress: { current: { items: { body: 'base', head: 'hat' }, variants: { hat: 'blue' } } }
	});
	await store('rig-target', named(bodyOnly(await equipmentFixture()), 'Squire'));
	const item = (await acceptCopy('rig-source', 'hat', 'rig-target'))!;
	expect(item.id).not.toBe('hat');
	const copied = await loadProject('rig-target'),
		m = copied.project.manifest,
		own = m.materials.filter((mat) => mat.owner === item.id);
	expect(m.items.find((it) => it.id === item.id)).toEqual(item);
	expect(item.materials).toEqual(own.map((mat) => mat.id));
	expect(own.map((mat) => [mat.id === 'hat', mat.defaultVariant, mat.linkTo])).toEqual([
		[false, 'blue', undefined]
	]);
	expect(item.coverage).toEqual(['rest/south/0']);
	expect(item.baseHash).toBe(m.rig.baseHash);
	// The source's current colors are the copy's defaults: no outfit selection needed.
	expect(worn(copied.project, { body: 'base', head: item.id })).toEqual(
		worn(source, { body: 'base', head: 'hat' }, { hat: 'blue' })
	);
	expect(worn(copied.project, { body: 'base', head: item.id }, { [own[0].id]: 'red' })).toEqual(
		worn(source, { body: 'base', head: 'hat' }, { hat: 'red' })
	);
	// The source keeps its own item and materials.
	const after = (await loadProject('rig-source')).project.manifest;
	expect(after).toEqual(source.manifest);
});

async function otherBody(name: string, pivot = { x: 32, y: 56 }) {
	const target = named(bodyOnly(await equipmentFixture()), name),
		body = makeImg(64, 64);
	body.data.set([10, 20, 30, 255], (40 * 64 + 20) * 4);
	const hash = await cellHash(body);
	target.images.set(hash, body);
	target.manifest.items[0].layers[0].cells = { rest: { south: [hash] } };
	target.manifest.rig.pivot = pivot;
	return target;
}

test('a different body on the same canvas wears the item as drawn, unfitted, at its place in the frame', async () => {
	const source = named(await equipmentFixture(), 'Knight');
	// Body px the hat hides on its own body: another body's px, never cut from this one.
	hatOf(source).baseCut = { rest: { south: [[50 * 64 + 20]] } };
	await store('rig-source', source);
	const target = await otherBody('Squire', { x: 30, y: 54 });
	await store('rig-target', target);
	const { items: listed } = await listShared('rig-target', target.manifest);
	expect(listed.map((x) => x.fit)).toEqual(['unfitted']);
	const item = (await acceptCopy('rig-source', 'hat', 'rig-target'))!;
	expect(item).toMatchObject({ unfitted: true, coverage: ['rest/south/0'] });
	expect(item.baseCut).toBeUndefined();
	// Drawn on the rig cell, so it stays there although the pivots differ (32, 56 there; 30, 54 here).
	expect(item.layers[0].pivot).toBeUndefined();
	expect(item.layers[0].cells).toEqual(hatOf(source).layers[0].cells);
	const copied = (await loadProject('rig-target')).project,
		hat = worn(copied, { head: item.id }),
		at = (x: number, y: number) => [...hat.data.slice((y * 64 + x) * 4, (y * 64 + x) * 4 + 4)];
	expect(at(20, 18)).toEqual([120, 120, 120, 255]);
	// Never offered on from here: the original is.
	await store('rig-third', named(bodyOnly(await equipmentFixture()), 'Page'));
	const third = (await listShared('rig-third', (await loadProject('rig-third')).project.manifest))
		.items;
	expect(third.map((x) => [x.sourceId, x.fit])).toEqual([['rig-source', 'copy']]);
});

test('a different frame size or camera cannot be worn: nothing is written and the item must be made for it', async () => {
	await store('rig-source', named(await equipmentFixture(), 'Knight'));
	const target = await otherBody('Giant');
	target.manifest.rig.cell = { w: 96, h: 96 };
	await store('rig-target', target);
	const before = structuredClone(memory.records.get('rig-target'));
	expect((await listShared('rig-target', target.manifest)).items.map((x) => x.fit)).toEqual([
		'remake'
	]);
	expect(await acceptCopy('rig-source', 'hat', 'rig-target')).toBeNull();
	const side = await otherBody('Side');
	side.manifest.rig.view = 'side';
	await store('rig-side', side);
	expect(await acceptCopy('rig-source', 'hat', 'rig-side')).toBeNull();
	expect(memory.writes).toBe(0);
	expect(memory.records.get('rig-target')).toEqual(before);
});

test('a move with another frame count is left out of an unfitted copy rather than retimed', async () => {
	const source = named(await equipmentFixture(), 'Knight');
	await store('rig-source', source);
	const target = await otherBody('Squire'),
		cells = target.manifest.items[0].layers[0].cells!;
	target.manifest.rig.animations.push({
		id: 'walk',
		cells: 2,
		frames: [
			{ cell: 0, ms: 100 },
			{ cell: 1, ms: 100 }
		],
		loop: true
	});
	cells.walk = { south: [cells.rest!.south![0], cells.rest!.south![0]] };
	source.manifest.rig.animations.push({
		id: 'walk',
		cells: 1,
		frames: [{ cell: 0, ms: 100 }],
		loop: true
	});
	hatOf(source).coverage!.push('walk/south/0');
	hatOf(source).layers[0].cells!.walk = { south: [hatOf(source).layers[0].cells!.rest!.south![0]] };
	await store('rig-source', source);
	await store('rig-target', target);
	const item = (await acceptCopy('rig-source', 'hat', 'rig-target'))!;
	expect(item.coverage).toEqual(['rest/south/0']);
	expect(item.layers[0].cells?.walk).toBeUndefined();
});

test('a padded unfitted layer keeps its place and its padding around this pivot, so mirrored views still export', async () => {
	const source = named(await equipmentFixture(), 'Knight'),
		hat = hatOf(source),
		padded = makeImg(96, 96);
	padded.data.set([120, 120, 120, 255], (34 * 96 + 36) * 4);
	const h = await cellHash(padded);
	source.images.set(h, padded);
	Object.assign(hat.layers[0], {
		cell: { w: 96, h: 96 },
		pivot: { x: 48, y: 72 },
		cells: { rest: { south: [h] } }
	});
	await store('rig-source', source);
	const target = await otherBody('Squire', { x: 30, y: 54 });
	target.manifest.rig.directions = [{ id: 'south' }, { id: 'north', mirrorOf: 'south' }];
	await store('rig-target', target);
	const item = (await acceptCopy('rig-source', 'hat', 'rig-target'))!;
	expect(item.layers[0]).toMatchObject({ cell: { w: 96, h: 96 }, pivot: { x: 46, y: 70 } });
	const p = (await loadProject('rig-target')).project,
		art = worn(p, { head: item.id }),
		at = (x: number, y: number) => [...art.data.slice((y * 64 + x) * 4, (y * 64 + x) * 4 + 4)];
	expect(at(20, 18)).toEqual([120, 120, 120, 255]);
	expect(validate(p)).toEqual([]);
	const out = await exportFiles(p, { engines: ['generic'], baked: false });
	expect(out.errors).toEqual([]);
	expect(out.warnings).toEqual([
		'hat: worn as drawn for another body, not fitted to this character.'
	]);
});

test('exact frames win over wearing the whole item unfitted: a partly matching body gets a partial exact copy', async () => {
	const source = named(await equipmentFixture(), 'Knight'),
		hat = hatOf(source),
		walk = { id: 'walk', cells: 1, frames: [{ cell: 0, ms: 100 }], loop: true };
	source.manifest.rig.animations.push(walk);
	hat.coverage!.push('walk/south/0');
	hat.layers[0].cells!.walk = { south: [hat.layers[0].cells!.rest!.south![0]] };
	source.manifest.items[0].layers[0].cells!.walk = {
		south: [source.manifest.items[0].layers[0].cells!.rest!.south![0]]
	};
	await store('rig-source', source);
	// The same standing body; its walk was drawn differently.
	const target = named(bodyOnly(await equipmentFixture()), 'Squire'),
		other = await otherBody('Other');
	target.manifest.rig.animations.push(walk);
	target.manifest.items[0].layers[0].cells!.walk = {
		south: [other.manifest.items[0].layers[0].cells!.rest!.south![0]]
	};
	for (const [h, im] of other.images) target.images.set(h, im);
	await store('rig-target', target);
	expect((await listShared('rig-target', target.manifest)).items.map((x) => x.fit)).toEqual([
		'copy'
	]);
	const item = (await acceptCopy('rig-source', 'hat', 'rig-target'))!;
	expect(item.unfitted).toBeUndefined();
	expect(item.coverage).toEqual(['rest/south/0']);
});

test('an unfitted copy needs a look and is named in export warnings', async () => {
	await store('rig-source', named(await equipmentFixture(), 'Knight'));
	await store('rig-target', await otherBody('Squire'));
	const item = (await acceptCopy('rig-source', 'hat', 'rig-target'))!;
	const p = (await loadProject('rig-target')).project;
	expect(healthOf(p.manifest, item)).toBe('look');
	expect(exportManifest(p, { engines: ['generic'], baked: false }).warnings).toEqual([
		'hat: worn as drawn for another body, not fitted to this character.'
	]);
});

test('views both characters mirror are covered by their drawn source view', async () => {
	const source = await equipmentFixture(),
		target = bodyOnly(await equipmentFixture());
	for (const p of [source, target])
		p.manifest.rig.directions = [{ id: 'south' }, { id: 'north', mirrorOf: 'south' }];
	const { flip, made } = flipper(async (h) => source.images.get(h)!);
	const assessment = await assessCopy(source.manifest, hatOf(source), target.manifest, flip);
	expect(assessment).toMatchObject({
		fits: true,
		matches: [{ source: 'rest/south/0', target: 'rest/south/0' }]
	});
	const copy = (await prepareCopy(source.manifest, 'hat', {}, target.manifest, flip))!;
	expect(copy.item.layers[0].cells).toEqual(hatOf(source).layers[0].cells);
	expect(copy.item.coverage).toEqual(['rest/south/0']);
	expect(made.size).toBe(0); // nothing needed flipping
});

test('deleting the source removes its entry while the copy stays intact', async () => {
	const source = named(await equipmentFixture(), 'Knight');
	// The most recent of equal items is offered: keep the original ahead of its copy.
	hatOf(source).provenance = [
		{ createdAt: '2027-01-01T00:00:00.000Z' } as Item['provenance'][number]
	];
	await store('rig-source', source);
	const target = named(bodyOnly(await equipmentFixture()), 'Squire'),
		third = named(bodyOnly(await equipmentFixture()), 'Page');
	await store('rig-target', target);
	await store('rig-third', third);
	const item = (await acceptCopy('rig-source', 'hat', 'rig-target'))!;
	const expected = worn((await loadProject('rig-target')).project, { body: 'base', head: item.id });
	const sources = async () =>
		(await listShared('rig-third', third.manifest)).items.map((x) => x.sourceId);
	expect(await sources()).toEqual(['rig-source']);
	memory.records.delete('rig-source'); // blobs stay, as when a character is deleted
	// The copy is an ordinary item of its character, so it is offered from there now.
	expect(await sources()).toEqual(['rig-target']);
	await expect(acceptCopy('rig-source', 'hat', 'rig-third')).rejects.toThrow('was removed');
	const reopened = await loadProject('rig-target');
	expect(worn(reopened.project, { body: 'base', head: item.id })).toEqual(expected);
});
