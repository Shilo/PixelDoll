import { expect, test } from 'vitest';
import {
	bodyCutVariantCount,
	cellImg,
	composeCell,
	layerFrame,
	MAX_BODY_CUT_VARIANTS,
	over,
	shownItems,
	withTuckVariants
} from '../../src/lib/compose/compose.ts';
import { exportFiles } from '../../src/lib/export/export.ts';
import { validate } from '../../src/lib/export/generic.ts';
import { makeImg } from '../../src/lib/image/png.ts';
import { decodePngBytes } from '../../src/lib/image/pngraw.ts';
import { cellHash } from '../../src/lib/rig/rig.ts';
import type { Engine, Item, Project } from '../../src/lib/store/manifest.ts';
import { recolor } from '../../src/lib/dress/dress.ts';
import { readCharacterZip } from '../../src/lib/store/import.ts';
import { zip } from '../../src/lib/store/zip.ts';
import { flipH } from '../../src/lib/rig/mirror.ts';
import { CURRENT_FORMAT } from '../../src/lib/store/manifest.ts';

// Round 3 (docs/research/generation-quality-round3-2026-10-25.md): a hood that hides the body's ear tips exports as a baked
// "<base>~<hood>" body every engine swaps to while the hood is worn; nothing else of the body changes.
async function project(cut: Item['baseCut']): Promise<Project> {
	const body = makeImg(64, 64),
		hood = makeImg(64, 64),
		ear = 12 * 64 + 20;
	body.data.set([200, 150, 120, 255], ear * 4);
	body.data.set([200, 150, 120, 255], (40 * 64 + 20) * 4);
	hood.data.set([150, 20, 30, 255], (12 * 64 + 22) * 4);
	const b = await cellHash(body),
		h = await cellHash(hood),
		baseHash = `sha256:${'0'.repeat(64)}` as const;
	const item = (
		id: string,
		slot: string,
		z: number,
		image: typeof b,
		extra: Partial<Item> = {}
	): Item => ({
		id,
		name: id,
		slot,
		status: 'accepted',
		baseHash,
		mirror: 'flip',
		materials: [],
		provenance: [],
		prompt: '',
		layers: [{ id: 'main', role: 'fg', z, cells: { idle: { south: [image] } } }],
		...extra
	});
	return {
		images: new Map([
			[b, body],
			[h, hood]
		]),
		manifest: {
			name: 'Hidden ears',
			app: 'test',
			format: CURRENT_FORMAT,
			rig: {
				baseItem: 'base',
				baseHash,
				cell: { w: 64, h: 64 },
				pivot: { x: 32, y: 60 },
				directions: [{ id: 'south' }],
				animations: [{ id: 'idle', cells: 1, loop: true, frames: [{ cell: 0, ms: 100 }] }]
			},
			slots: [
				{ id: 'body', class: 'base', z: 10 },
				{ id: 'head', class: 'rigid', z: 130 }
			],
			items: [item('base', 'body', 10, b), item('hood', 'head', 130, h, { baseCut: cut })],
			materials: [],
			presets: [
				{ id: 'default', name: 'Default', items: { body: 'base', head: 'hood' }, variants: {} }
			]
		}
	};
}

async function combinedProject() {
	const p = await project({ idle: { south: [[12 * 64 + 20, 12 * 64 + 21]] } });
	const original = p.images.get(p.manifest.items[0].layers[0].cells!.idle!.south![0]!)!;
	const body = { ...original, data: original.data.slice() };
	body.data.set([200, 150, 120, 255], (12 * 64 + 21) * 4);
	const hash = await cellHash(body);
	p.images.set(hash, body);
	p.manifest.items[0].layers[0].cells!.idle!.south![0] = hash;
	const cape: Item = {
		...structuredClone(p.manifest.items[1]),
		id: 'cape',
		name: 'Cape',
		slot: 'back',
		baseCut: { idle: { south: [[40 * 64 + 20]] } }
	};
	p.manifest.slots.push({ id: 'back', class: 'worn', z: 90 });
	p.manifest.items.push(cape);
	p.manifest.presets[0].items.back = 'cape';
	p.manifest.rig.directions.push({ id: 'north', mirrorOf: 'south' });
	return p;
}

test('all independent body cuts are baked and selected regardless of equipment order or mirrored direction', async () => {
	const p = await combinedProject(),
		built = await withTuckVariants(p);
	const combined = built.manifest.items.find((item) => item.id === 'base~cape~hood')!;
	expect(combined).toMatchObject({ variantOf: 'base', underAll: ['cape', 'hood'] });
	expect(validate(built)).toEqual([]);
	for (const worn of [
		{ head: 'hood', back: 'cape' },
		{ back: 'cape', head: 'hood' }
	]) {
		const selected = shownItems(
			built.manifest,
			built.manifest.items.filter(
				(item) => item.id === 'base' || worn[item.slot as keyof typeof worn] === item.id
			)
		);
		expect(selected[0].id).toBe(combined.id);
		for (const dir of ['south', 'north'] as const)
			expect(composeCell(built, worn, 'idle', dir, 0)).toEqual(
				composeCell(p, worn, 'idle', dir, 0)
			);
	}
	const individualOutfits: Record<string, string | null>[] = [
		{},
		{ head: 'hood' },
		{ back: 'cape' }
	];
	for (const worn of individualOutfits) {
		for (const dir of ['south', 'north'] as const)
			expect(composeCell(built, worn, 'idle', dir, 0)).toEqual(
				composeCell(p, worn, 'idle', dir, 0)
			);
	}
	const output = await exportFiles(p, {
		engines: ['generic', 'godot', 'unity', 'phaser', 'gdevelop', 'aseprite'],
		baked: true
	});
	expect(output.errors).toEqual([]);
	expect(output.warnings).not.toContain(expect.stringContaining('game engines hide only one'));
	const files = new Map(output.entries.map((entry) => [entry.name, entry.data]));
	const body = await decodePngBytes(files.get('layers/body/base~cape~hood/main/idle.png')!);
	expect(body.data.some((value, index) => index % 4 === 3 && value)).toBe(false);
	const json = JSON.parse(new TextDecoder().decode(files.get('unity/pixeldoll_unity.json')!));
	expect(json.items.find((item: Item) => item.id === combined.id).underAll).toEqual([
		'cape',
		'hood'
	]);
});

test('combined variants retain canonical palette ownership and every exact frozen body cut', async () => {
	const p = await combinedProject(),
		base = p.manifest.items[0];
	base.materials = ['skin'];
	p.manifest.materials.push({
		id: 'skin',
		owner: 'base',
		label: 'Skin',
		ramp: ['#c89678'],
		variants: { blue: ['#0000ff'] }
	});
	p.manifest.items[2].hides = ['head'];
	const built = await withTuckVariants(p),
		colors = { skin: 'blue' };
	const outfits: Record<string, string | null>[] = [
		{ head: 'hood', back: 'cape' },
		{ head: 'hood' },
		{ back: 'cape' }
	];
	for (const worn of outfits) {
		expect(composeCell(recolor(built, colors), worn, 'idle', 'south', 0)).toEqual(
			composeCell(recolor(p, colors), worn, 'idle', 'south', 0)
		);
	}
	const selected = shownItems(
		built.manifest,
		built.manifest.items.filter((item) => ['base', 'hood', 'cape'].includes(item.id))
	);
	expect(selected[0].id).toBe('base~cape~hood');
});

test('body variants exclude mutually exclusive and stale cutters, and reject excessive combinations before generating', async () => {
	const p = await combinedProject();
	p.manifest.items.push({ ...structuredClone(p.manifest.items[1]), id: 'hood_alt' });
	expect(bodyCutVariantCount(p.manifest)).toBe(5);
	const built = await withTuckVariants(p);
	expect(built.manifest.items.filter((item) => item.variantOf === 'base')).toHaveLength(5);
	expect(
		built.manifest.items.some(
			(item) => item.underAll?.includes('hood') && item.underAll.includes('hood_alt')
		)
	).toBe(false);
	p.manifest.items[2].baseHash = 'sha256:stale';
	expect(bodyCutVariantCount(p.manifest)).toBe(2);
	expect((await withTuckVariants(p)).manifest.items.some((item) => item.underAll)).toBe(false);
	p.manifest.items = p.manifest.items.filter((item) => item.id === 'base');
	for (let i = 0; i < MAX_BODY_CUT_VARIANTS + 1; i++)
		p.manifest.items.push({
			...structuredClone(built.manifest.items.find((item) => item.id === 'hood')!),
			id: `hood${i}`
		});
	expect(bodyCutVariantCount(p.manifest)).toBe(MAX_BODY_CUT_VARIANTS + 1);
	expect((await exportFiles(p, { engines: ['generic'], baked: false })).errors).toEqual([
		expect.stringContaining('at most 256')
	]);
	await expect(withTuckVariants(p)).rejects.toThrow('at most 256');
});

test('malformed combined cover requirements fail clearly before export', async () => {
	const built = await withTuckVariants(await combinedProject()),
		variant = built.manifest.items.find((item) => item.underAll)!;
	for (const underAll of [['hood', 'hood'], ['unknown', 'hood'], ['hood'], 'hood']) {
		const p = structuredClone(built);
		p.manifest.items.find((item) => item.id === variant.id)!.underAll = underAll as string[];
		expect(
			(await exportFiles(p, { engines: ['generic'], baked: false })).errors.length
		).toBeGreaterThan(0);
	}
});

test('combined body clips and cuts use one deterministic variant and can be prepared twice', async () => {
	const p = await combinedProject();
	p.manifest.slots.find((slot) => slot.id === 'head')!.clips = ['body'];
	p.manifest.slots.find((slot) => slot.id === 'back')!.clips = ['body'];
	const built = await withTuckVariants(p),
		repeated = await withTuckVariants(built),
		worn = p.manifest.presets[0].items;
	expect(repeated.manifest).toEqual(built.manifest);
	expect(new Set(built.manifest.items.map((item) => item.id)).size).toBe(
		built.manifest.items.length
	);
	for (const dir of ['south', 'north'] as const)
		expect(composeCell(built, worn, 'idle', dir, 0)).toEqual(composeCell(p, worn, 'idle', dir, 0));
	expect((await exportFiles(built, { engines: ['generic'], baked: true })).errors).toEqual([]);
});

test('editable imports re-export combined cuts without accumulating variants', async () => {
	const p = await combinedProject(),
		output = await exportFiles(p, { engines: ['generic'], baked: false }),
		imported = await readCharacterZip(await zip(output.entries)),
		again = await exportFiles(imported.project, { engines: ['generic'], baked: false });
	expect(imported.project.manifest.items.some((item) => item.variantOf)).toBe(false);
	expect(again.errors).toEqual([]);
	const manifest = JSON.parse(
		new TextDecoder().decode(again.entries.find((entry) => entry.name === 'manifest.json')!.data)
	);
	expect(manifest.items.filter((item: Item) => item.underAll)).toHaveLength(1);
	const outfits: Record<string, string | null>[] = [
		{ head: 'hood', back: 'cape' },
		{ head: 'hood' },
		{ back: 'cape' },
		{}
	];
	for (const worn of outfits)
		for (const dir of ['south', 'north'] as const)
			expect(composeCell(imported.project, worn, 'idle', dir, 0)).toEqual(
				composeCell(p, worn, 'idle', dir, 0)
			);
});

test.each([
	{
		name: 'padded',
		w: 80,
		h: 80,
		pivot: { x: 40, y: 68 },
		hidden: [20 * 80 + 28, 20 * 80 + 29, 48 * 80 + 28],
		sentinels: [788, 789, 2580]
	},
	{
		name: 'narrower',
		w: 48,
		h: 64,
		pivot: { x: 24, y: 60 },
		hidden: [12 * 48 + 12, 12 * 48 + 13, 40 * 48 + 12],
		sentinels: [19 * 48 + 40]
	}
])(
	'body cuts use rig coordinates on a $name body layer and its mirrored view',
	async ({ w, h, pivot, hidden, sentinels }) => {
		const p = await combinedProject(),
			base = p.manifest.items[0].layers[0];
		const body = makeImg(w, h),
			original = p.images.get(base.cells!.idle!.south![0]!)!;
		const dx = pivot.x - 32,
			dy = pivot.y - 60;
		over(body, original, dx, dy);
		for (const pixel of sentinels) body.data.set([30, 80, 130, 255], pixel * 4);
		body.data.set([70, 100, 150, 255], (50 * w + 20) * 4);
		const hash = await cellHash(body),
			before = body.data.slice();
		p.images.set(hash, body);
		Object.assign(base, { cell: { w, h }, pivot });
		base.cells!.idle!.south![0] = hash;
		p.manifest.items[1].baseCut!.idle!.south![0]!.push(20 * 64);
		expect(validate(p)).toEqual([]);

		const expectedBody = { w, h, data: before.slice() };
		for (const pixel of hidden) expectedBody.data.fill(0, pixel * 4, pixel * 4 + 4);
		const expected = { w, h, data: expectedBody.data.slice() };
		for (const item of p.manifest.items.slice(1))
			over(expected, p.images.get(item.layers[0].cells!.idle!.south![0]!)!, dx, dy);
		const built = await withTuckVariants(p),
			variant = built.manifest.items.find((item) => item.underAll)!.layers[0];
		const frame = layerFrame(p.manifest.rig, base),
			worn = p.manifest.presets[0].items;
		for (const [dir, wantedBody, wantedComposite] of [
			['south', expectedBody, expected],
			['north', flipH(expectedBody), flipH(expected)]
		] as const) {
			expect(cellImg(built, variant, 'idle', dir, 0)).toEqual(wantedBody);
			expect(composeCell(p, worn, 'idle', dir, 0, frame)).toEqual(wantedComposite);
			expect(composeCell(built, worn, 'idle', dir, 0, frame)).toEqual(wantedComposite);
		}
		for (const pixel of sentinels) expect(expectedBody.data[pixel * 4 + 3]).toBe(255);
		expect(body.data).toEqual(before);
		const output = await exportFiles(p, { engines: ['generic'], baked: true });
		expect(output.errors).toEqual([]);
		const sheet = await decodePngBytes(
			output.entries.find((entry) => entry.name === 'layers/body/base~cape~hood/main/idle.png')!
				.data
		);
		expect(sheet.w).toBe(w);
		expect(sheet.h).toBe(2 * h);
		expect(sheet.data.subarray(0, w * h * 4)).toEqual(expectedBody.data);
		expect(sheet.data.subarray(w * h * 4)).toEqual(flipH(expectedBody).data);
	}
);

test('a hood that hides the ear tips exports a baked body variant for every engine', async () => {
	const p = await project({ idle: { south: [[12 * 64 + 20]] } });
	const engines: Engine[] = ['generic', 'godot', 'unity', 'phaser', 'gdevelop', 'aseprite'];
	const out = await exportFiles(p, { engines, baked: true });
	expect(out.errors).toEqual([]);
	const files = new Map(out.entries.map((e) => [e.name, e.data]));
	const manifest = JSON.parse(new TextDecoder().decode(files.get('manifest.json')!));
	expect(manifest.items.find((i: Item) => i.id === 'base~hood')).toMatchObject({
		variantOf: 'base',
		under: 'hood'
	});
	const shown = composeCell(p, p.manifest.presets[0].items, 'idle', 'south', 0);
	expect(shown.data[(12 * 64 + 20) * 4 + 3]).toBe(0); // the ear is hidden while the hood is worn
	expect(shown.data[(40 * 64 + 20) * 4 + 3]).toBe(255); // the rest of the body is untouched
	expect(composeCell(p, { body: 'base' }, 'idle', 'south', 0).data[(12 * 64 + 20) * 4 + 3]).toBe(
		255
	); // and back without it
	expect(await decodePngBytes(files.get('baked/default/idle.png')!)).toEqual(shown);
	const sheet = [...files.keys()].find((k) => k.includes('base~hood') && k.endsWith('.png'));
	expect(sheet, 'a sheet for the body variant').toBeTruthy();
	const variant = await decodePngBytes(files.get(sheet!)!),
		visible = makeImg(64, 64);
	over(visible, variant);
	over(visible, p.images.get(p.manifest.items[1].layers[0].cells!.idle!.south![0]!)!);
	expect(visible).toEqual(shown);
});

test('malformed hidden body pixels are rejected', async () => {
	for (const bad of [
		{ walk: { south: [[1]] } },
		{ idle: { east: [[1]] } },
		{ idle: { south: [[5, 3]] } },
		{ idle: { south: [[64 * 64]] } },
		{ idle: { south: [[1], [2]] } }
	])
		expect(
			validate(await project(bad as unknown as Item['baseCut'])),
			JSON.stringify(bad)
		).toContain('hood: invalid hidden body pixels (baseCut)');
});

test('an exact copy keeps the hidden ear px, flipped for a target view the source mirrored', async () => {
	const { createDesign } = await import('../../src/lib/equipment/design.ts');
	const { prepareCopy } = await import('../../src/lib/equipment/copy.ts');
	const { flipH } = await import('../../src/lib/rig/mirror.ts');
	const body = makeImg(64, 64),
		hood = makeImg(64, 64),
		ear = 12 * 64 + 20,
		earW = 12 * 64 + 43;
	body.data.set([200, 150, 120, 255], ear * 4);
	body.data.set([200, 150, 120, 255], (40 * 64 + 20) * 4);
	hood.data.set([150, 20, 30, 255], (12 * 64 + 22) * 4);
	const bodyW = flipH(body),
		[b, h, bw] = await Promise.all([body, hood, bodyW].map(cellHash)),
		baseHash = `sha256:${'0'.repeat(64)}` as const;
	const item = (
		id: string,
		slot: string,
		z: number,
		cells: Item['layers'][number]['cells'],
		extra: Partial<Item> = {}
	): Item => ({
		id,
		name: id,
		slot,
		status: 'accepted',
		baseHash,
		mirror: 'flip',
		materials: [],
		provenance: [],
		prompt: 'a red hood',
		layers: [{ id: 'main', role: 'fg', z, cells }],
		...extra
	});
	const rig = (directions: Project['manifest']['rig']['directions']) => ({
		baseItem: 'base',
		baseHash,
		cell: { w: 64, h: 64 },
		pivot: { x: 32, y: 60 },
		directions,
		animations: [{ id: 'idle', cells: 1, loop: true, frames: [{ cell: 0, ms: 100 }] }]
	});
	const slots = [
		{ id: 'body', class: 'base', z: 10 },
		{ id: 'head', class: 'rigid', anchor: 'head', z: 130 }
	] as Project['manifest']['slots'];
	const src: Project = {
		images: new Map([
			[b, body],
			[h, hood]
		]),
		manifest: {
			name: 's',
			app: 'test',
			format: CURRENT_FORMAT,
			rig: rig([{ id: 'east' }, { id: 'west', mirrorOf: 'east' }]),
			slots,
			items: [
				item('base', 'body', 10, { idle: { east: [b] } }),
				item(
					'hood',
					'head',
					130,
					{ idle: { east: [h] } },
					{ baseCut: { idle: { east: [[ear]] } }, coverage: ['idle/east/0'] }
				)
			],
			materials: [],
			presets: [{ id: 'default', name: 'd', items: { body: 'base', head: 'hood' }, variants: {} }]
		}
	};
	const tgt: Project = {
		images: new Map([
			[b, body],
			[bw, bodyW]
		]),
		manifest: {
			name: 't',
			app: 'test',
			format: CURRENT_FORMAT,
			rig: rig([{ id: 'east' }, { id: 'west' }]),
			slots,
			items: [item('base', 'body', 10, { idle: { east: [b], west: [bw] } })],
			materials: [],
			presets: [{ id: 'default', name: 'd', items: { body: 'base' }, variants: {} }]
		}
	};
	const cand = await prepareCopy(await createDesign(src, 'hood'), tgt),
		id = cand.itemId;
	const seen = (dir: 'east' | 'west', px: number) =>
		composeCell(cand.project, { body: 'base', head: id }, 'idle', dir, 0).data[px * 4 + 3];
	expect(seen('east', ear)).toBe(0);
	expect(seen('west', earW)).toBe(0);
	expect(seen('east', 40 * 64 + 20)).toBe(255);
	expect(validate(cand.project)).toEqual([]);
});
