import { expect, test } from 'vitest';
import { readFile } from 'node:fs/promises';
import { loadFixture } from '../../src/lib/compose/fixture.ts';
import { withTuckVariants } from '../../src/lib/compose/compose.ts';
import { exportFiles } from '../../src/lib/export/export.ts';
import type { Manifest, Sha256 } from '../../src/lib/store/manifest.ts';
import { editIdentity } from '../../src/lib/store/identity.ts';
import { readCharacterZip } from '../../src/lib/store/import.ts';
import { zip } from '../../src/lib/store/zip.ts';
import { resolvePreset, validEquipment } from '../../src/lib/runtime/paperdoll.js';

const fixture = () =>
	loadFixture(
		async (path) =>
			new Uint8Array(await readFile(new URL(`../../public/fixtures/s2/${path}`, import.meta.url)))
	);
const tuckedIds = async (p: Awaited<ReturnType<typeof fixture>>) =>
	(await withTuckVariants(p)).manifest.items
		.filter((i) => i.variantOf && i.slot === 'hair')
		.map((i) => i.id);

test('public IDs reach paths and runtime equipment without rekeying the editable character', async () => {
	const project = await fixture();
	const source = project.manifest;
	const base = source.rig.baseItem;
	const hair = 'hair_brown';
	const hat = 'hat_wizard';
	const internal = 'rig-test';
	editIdentity(source, internal, undefined, '旅人', 'travel_hero');
	editIdentity(source, internal, base, undefined, 'travel_body');
	editIdentity(source, internal, hair, 'Braids', 'travel_hair');
	editIdentity(source, internal, hat, undefined, 'travel_hat');
	expect(() => editIdentity(source, internal, hat, undefined, 'travel_hair')).toThrow(
		/already|uses/
	);
	for (const invalid of ['CON', 'aux', 'a'.repeat(41), '../hair'])
		expect(() => editIdentity(source, internal, hat, undefined, invalid)).toThrow(/Invalid/);
	const result = await exportFiles(project, {
		engines: ['phaser', 'godot', 'unity', 'gdevelop'],
		baked: true
	});
	expect(result.errors).toEqual([]);
	const paths = new Set(result.entries.map((entry) => entry.name));
	const exported: Manifest = JSON.parse(
		new TextDecoder().decode(result.entries.find((entry) => entry.name === 'manifest.json')!.data)
	);
	expect(exported).toMatchObject({
		name: '旅人',
		exportId: 'travel_hero',
		rig: { baseItem: 'travel_body' }
	});
	expect(exported.items.find((item) => item.id === 'travel_hair~travel_hat')).toMatchObject({
		variantOf: 'travel_hair',
		under: 'travel_hat'
	});
	expect(validEquipment(exported, 'hair', 'travel_hair')).toBe(true);
	expect(validEquipment(exported, 'hair', hair)).toBe(false);
	expect(resolvePreset(exported, exported.presets[0]).items.body).toBe('travel_body');
	for (const item of exported.items)
		for (const layer of item.layers)
			for (const path of Object.values(layer.sheets ?? {})) expect(paths.has(path)).toBe(true);
	expect(
		exported.materials.every((material) =>
			exported.items.some((item) => item.id === material.owner)
		)
	).toBe(true);
	const restored = await readCharacterZip(await zip(result.entries));
	expect(restored.project.manifest).toEqual(source);
	expect(source.rig.baseItem).toBe(base);
	expect(source.items.find((item) => item.id === hair)).toMatchObject({
		name: 'Braids',
		exportId: 'travel_hair'
	});
});

test('every current hair gets a tucked copy under every current head item that clips it', async () => {
	const p = await fixture(),
		hairs = p.manifest.items.filter((i) => i.slot === 'hair'),
		heads = p.manifest.items.filter((i) => i.slot === 'head');
	expect(hairs.length * heads.length).toBeGreaterThan(0);
	expect((await tuckedIds(p)).sort()).toEqual(
		hairs.flatMap((h) => heads.map((o) => `${h.id}~${o.id}`)).sort()
	);
});

test('a stale head item gets no tucked copy, so the export never points at an excluded item', async () => {
	const p = await fixture();
	p.manifest.items.find((i) => i.id === 'hat_wizard')!.baseHash = 'sha256:stale' as Sha256;
	expect(await tuckedIds(p)).not.toContain('hair_brown~hat_wizard');
	const r = await exportFiles(p, { engines: ['generic'], baked: false, exportedAt: 'x' });
	const man = JSON.parse(
		new TextDecoder().decode(r.entries.find((e) => e.name === 'manifest.json')!.data)
	) as Manifest;
	const ids = new Set(man.items.map((i) => i.id));
	expect(r.errors).toEqual([]);
	expect(man.items.filter((i) => i.under && !ids.has(i.under)).map((i) => i.id)).toEqual([]);
	expect(ids.has('hair_brown~helmet_steel')).toBe(true); // current covers keep theirs
});

test('a stale hair gets no tucked copies', async () => {
	const p = await fixture();
	p.manifest.items.find((i) => i.id === 'hair_brown')!.baseHash = 'sha256:stale' as Sha256;
	expect((await tuckedIds(p)).filter((id) => id.startsWith('hair_brown~'))).toEqual([]);
});

test('a head item that hides the hair gets no tucked copy (the hair never shows under it)', async () => {
	const p = await fixture();
	p.manifest.items.find((i) => i.id === 'helmet_steel')!.hides = ['hair'];
	const ids = await tuckedIds(p);
	expect(ids).not.toContain('hair_brown~helmet_steel');
	expect(ids).toContain('hair_brown~hat_wizard');
});

test('tucked copies grow as hairs x clipping head items, minus covers that hide the hair', async () => {
	const p = await fixture(),
		m = p.manifest;
	const clone = (id: string, n: number) => {
		const src = m.items.find((i) => i.id === id)!;
		for (let k = 0; k < n; k++) m.items.push({ ...structuredClone(src), id: `${id}_${k}` });
	};
	const hairs = m.items.filter((i) => i.slot === 'hair').length,
		heads = m.items.filter((i) => i.slot === 'head').length;
	clone('hair_brown', 2);
	clone('helmet_steel', 2);
	expect((await tuckedIds(p)).length).toBe((hairs + 2) * (heads + 2));
	m.items.find((i) => i.id === 'helmet_steel_0')!.hides = ['hair'];
	expect((await tuckedIds(p)).length).toBe((hairs + 2) * (heads + 1));
});
