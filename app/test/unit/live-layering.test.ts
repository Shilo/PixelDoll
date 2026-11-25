import { expect, test } from 'vitest';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { exportFiles } from '../../src/lib/export/export.ts';
import { makeImg } from '../../src/lib/image/png.ts';
import { decodePngBytes } from '../../src/lib/image/pngraw.ts';
import { cellHash } from '../../src/lib/rig/rig.ts';
import {
	actionHip,
	actionSeamLimits,
	actionSetScore,
	actionWaist,
	composeLayeredAction,
	exportedActionDraws,
	layerOffset,
	over,
	splitLower,
	splitUpper
} from '../../src/lib/runtime/paperdoll.js';
import { CURRENT_FORMAT, type Item, type Project } from '../../src/lib/store/manifest.ts';

async function bodyAPoses(direction: 'south' | 'east' | 'north' = 'south') {
	const root = new URL('../fixtures/bench/', import.meta.url);
	const { rig, rows, cols } = JSON.parse(readFileSync(new URL('bodyA.json', root), 'utf8')) as {
		rig: Project['manifest']['rig'];
		rows: string[];
		cols: string[];
	};
	const atlas = await decodePngBytes(readFileSync(new URL('bodyA.png', root)));
	const startRow = rows.indexOf(direction) * 64;
	return (clip: string, cell: number) => {
		const image = makeImg(64, 64);
		const column = cols.indexOf(`${clip}/${cell}`) * 64;
		for (let row = 0; row < 64; row++) {
			const offset = ((startRow + row) * atlas.w + column) * 4;
			image.data.set(atlas.data.subarray(offset, offset + 256), row * 256);
		}
		return { image, hip: actionHip(rig, clip, direction, cell)! };
	};
}

test('bodyA south walk 1 drops the walking hand and slash 1 keeps its below-waist hand', async () => {
	const pose = await bodyAPoses();
	const walk = pose('walk', 1),
		slash = pose('slash', 1);
	const lower = splitLower(walk.image, walk.hip);
	const upper = splitUpper(slash.image, slash.hip);
	const alpha = (x: number, y: number) => (y * 64 + x) * 4 + 3;
	const walkHand = alpha(23, 48),
		slashHand = alpha(38, 46),
		knee = alpha(29, 52);
	expect(walk.image.data[walkHand]).toBe(255);
	expect(lower.image.data[walkHand]).toBe(0);
	expect(lower.image.data[knee]).toBe(255);
	expect(slash.image.data[slashHand]).toBe(255);
	expect(upper.image.data[slashHand]).toBe(255);
	expect(upper.seamMask?.has((slashHand - 3) / 4)).toBe(false);
	expect(upper.image.data[knee]).toBe(0);
	expect(Math.abs(layerOffset(lower, upper).hipDeparture)).toBeLessThanOrEqual(1);
});

test('bodyA south placement stays within one pixel of both hips and changes by at most two per frame', async () => {
	const pose = await bodyAPoses();
	const fragments = (clip: string, split: typeof splitLower) =>
		Array.from({ length: 8 }, (_, cell) => {
			const { image, hip } = pose(clip, cell);
			return split(image, hip);
		});
	const lower = fragments('walk', splitLower);
	const upper = fragments('slash', splitUpper);
	const placements = lower.map((bottom) =>
		upper.map((top) => {
			const offset = layerOffset(bottom, top);
			for (const axis of ['x', 'y'] as const)
				expect(
					Math.abs(offset[axis] - Math.round(bottom.hip[axis] - top.hip[axis]))
				).toBeLessThanOrEqual(1);
			return offset;
		})
	);
	for (const [walk, actionPlacements] of placements.entries())
		for (const [action, current] of actionPlacements.entries()) {
			const nextWalk = (walk + 1) % lower.length;
			const nextAction = Math.min(action + 1, upper.length - 1);
			for (const next of [
				placements[nextWalk][action],
				placements[walk][nextAction],
				placements[nextWalk][nextAction]
			])
				for (const axis of ['x', 'y'] as const)
					expect(Math.abs(next[axis] - current[axis])).toBeLessThanOrEqual(2);
		}
});

test.each([
	{ direction: 'south', hipError: 0, worst: 7, median: 0, maxSharedShift: 0, fallback: null },
	{ direction: 'east', hipError: 0, worst: 6, median: 3, maxSharedShift: 2, fallback: null },
	{ direction: 'north', hipError: 0, worst: 7, median: 0, maxSharedShift: 0, fallback: null },
	{ direction: 'south', hipError: 4, worst: 7, median: 1, maxSharedShift: 3, fallback: 'seam' }
] as const)(
	'scores bodyA $direction with a $hipError px hip error',
	async ({ direction, hipError, ...expected }) => {
		const pose = await bodyAPoses(direction);
		const lower = Array.from({ length: 8 }, (_, cell) => {
			const { image, hip } = pose('walk', cell);
			return splitLower(image, hip);
		});
		const upper = Array.from({ length: 8 }, (_, cell) => {
			const { image, hip } = pose('slash', cell);
			if (cell === 3) hip.hip.x += hipError;
			return splitUpper(image, hip);
		});
		const pairs = lower.flatMap((bottom) => upper.map((top) => layerOffset(bottom, top)));
		expect(actionSetScore(pairs, 64)).toEqual(expected);
	}
);

function pixels(left: number, top: number, width: number, height: number, red: number) {
	const image = makeImg(64, 64);
	for (let x = left; x < left + width; x++)
		for (let y = top; y < top + height; y++) image.data.set([red, 0, 0, 255], (y * 64 + x) * 4);
	return image;
}

async function fixture(): Promise<Project> {
	const body = pixels(26, 14, 12, 37, 70);
	const boot = pixels(26, 46, 12, 5, 20);
	const weapon = pixels(38, 35, 12, 2, 200);
	weapon.data.set([201, 0, 0, 255], 63 * 4);
	const wrongBoot = pixels(26, 46, 12, 5, 100);
	const walkWeapon = pixels(8, 34, 5, 3, 190);
	const trousers = pixels(24, 30, 5, 18, 120);
	const cape = pixels(29, 39, 11, 4, 150);
	const capeFront = pixels(48, 22, 1, 1, 160);
	const [
		baseHash,
		bootHash,
		weaponHash,
		otherBoot,
		walkWeaponHash,
		trousersHash,
		capeHash,
		frontHash
	] = await Promise.all(
		[body, boot, weapon, wrongBoot, walkWeapon, trousers, cape, capeFront].map(cellHash)
	);
	const item = (id: string, slot: string, walk = baseHash, attack = walk): Item => ({
		id,
		name: id,
		slot,
		baseHash,
		status: 'accepted',
		mirror: 'flip',
		materials: [],
		prompt: '',
		provenance: [],
		layers: [
			{
				id: 'main',
				role: slot === 'back' ? 'bg' : 'fg',
				z: slot === 'back' ? 1 : slot === 'body' ? 10 : 20,
				cells: { walk: { south: [walk, walk] }, slash: { south: [attack, attack] } }
			}
		]
	});
	const capeItem = item('cape', 'back', walkWeaponHash, capeHash);
	capeItem.layers[0].id = 'bg';
	capeItem.layers.push({
		...capeItem.layers[0],
		id: 'fg',
		role: 'fg',
		z: 20,
		cells: { walk: { south: [frontHash, frontHash] }, slash: { south: [frontHash, frontHash] } }
	});
	return {
		images: new Map([
			[baseHash, body],
			[bootHash, boot],
			[weaponHash, weapon],
			[otherBoot, wrongBoot],
			[walkWeaponHash, walkWeapon],
			[trousersHash, trousers],
			[capeHash, cape],
			[frontHash, capeFront]
		]),
		manifest: {
			format: CURRENT_FORMAT,
			name: 'Layered fixture',
			app: 'test',
			materials: [],
			presets: [],
			rig: {
				cell: { w: 64, h: 64 },
				pivot: { x: 32, y: 51 },
				baseItem: 'base',
				baseHash,
				directions: [{ id: 'south' }],
				animations: ['walk', 'slash'].map((id) => ({
					id,
					cells: 2,
					loop: id === 'walk',
					frames: [
						{ cell: 0, ms: 50 },
						{ cell: 1, ms: 50 }
					]
				})),
				anchors: {
					hip: {
						walk: {
							south: [
								[32, 32],
								[32, 32]
							]
						},
						slash: {
							south: [
								[32, 32],
								[32, 33]
							]
						}
					}
				}
			},
			slots: [
				{ id: 'body', class: 'base', z: 10 },
				{ id: 'feet', class: 'worn', z: 20 },
				{ id: 'legs', class: 'worn', z: 20 },
				{ id: 'back', class: 'worn', z: 1 },
				{ id: 'main_hand', class: 'held', z: 25 }
			],
			items: [
				item('base', 'body'),
				item('boots', 'feet', bootHash, otherBoot),
				item('sword', 'main_hand', walkWeaponHash, weaponHash),
				item('trousers', 'legs', trousersHash, otherBoot),
				capeItem
			]
		}
	};
}

test('registration triggers a fit even for a one-pixel shift from an infinite seam', () => {
	const image = pixels(26, 14, 12, 37, 70);
	const geometry = { hip: { x: 32, y: 32 }, feet: [], source: 'anchor' } as const;
	const lower = splitLower(image, { ...geometry, feet: [] });
	const upper = splitUpper(image, { ...geometry, feet: [] });
	upper.hip = { x: 32, y: 33 };
	expect(layerOffset(lower, upper)).toEqual({
		x: 0,
		y: 0,
		seam: 0,
		sharedShift: 0,
		source: 'fit',
		hipDeparture: 1,
		hipDepartureX: 0
	});
	expect(actionWaist(-14)).toBe(-4);
	expect(actionWaist(14)).toBe(4);
});

test('chooses a near-equal seam that avoids an invalid shared shift', () => {
	const hip = { x: 35, y: 32 };
	const lower = { image: pixels(30, 32, 10, 10, 70), hip, waist: 32, source: 'anchor' as const };
	const above = pixels(34, 31, 10, 1, 70);
	over(above, pixels(33, 30, 13, 1, 70));
	const upper = { image: above, hip, waist: 32, source: 'anchor' as const };
	expect(layerOffset(lower, upper, 92)).toMatchObject({ x: -1, y: 1, seam: 7, sharedShift: 2 });
});

test.each([
	{ seams: [8, 0, 5, 3], worst: 8, median: 4, fallback: null },
	{ seams: [9, 0, 5, 3], worst: 9, median: 4, fallback: 'seam' },
	{ seams: [8, 0, 6, 4], worst: 8, median: 5, fallback: 'seam' },
	{ seams: [0, 0, Infinity], worst: Infinity, median: 0, fallback: 'seam' }
])('scores the set $seams = $worst / $median', ({ seams, ...score }) => {
	expect(
		actionSetScore(
			seams.map((seam) => ({ seam, sharedShift: 0 })),
			92
		)
	).toEqual({
		...score,
		maxSharedShift: 0
	});
});

test.each([
	{ shift: 3, sharedShift: 2, fallback: null },
	{ shift: -3, sharedShift: 2, fallback: null },
	{ shift: 4, sharedShift: 3, fallback: 'seam' },
	{ shift: -4, sharedShift: 3, fallback: 'seam' }
])(
	'scores a $sharedShift px shared shift after fitting from $shift px',
	({ shift, sharedShift, fallback }) => {
		const geometry = { hip: { x: 32, y: 32 }, feet: [], source: 'anchor' } as const;
		const lower = splitLower(pixels(27, 14, 10, 37, 70), { ...geometry, feet: [] });
		const upper = splitUpper(pixels(27 + shift, 14, 10, 37, 70), { ...geometry, feet: [] });
		const pair = layerOffset(lower, upper);
		expect(pair).toMatchObject({ seam: 2 * sharedShift, sharedShift });
		expect(actionSetScore([pair, { seam: 0, sharedShift: 0 }], 92)).toMatchObject({
			worst: 2 * sharedShift,
			median: sharedShift,
			maxSharedShift: sharedShift,
			fallback
		});
	}
);

test.each(['one failing seam pair', 'one unusable limb split', 'missing action hips'] as const)(
	'%s makes the whole action full-body in Live and exports',
	async (caseName) => {
		const project = await fixture();
		const frame = { w: 64, h: 64, x: 32, y: 51 };
		const base = project.manifest.items[0];
		const wideWalk = pixels(24, 14, 16, 37, 70);
		const narrowSlash = pixels(29, 14, 6, 37, 70);
		const missingHip = caseName === 'missing action hips';
		const missingLegs = caseName === 'one unusable limb split';
		if (missingHip) delete project.manifest.rig.anchors!.hip!.slash.south;
		else
			for (const [clip, image] of missingLegs
				? ([['walk', pixels(32, 14, 1, 18, 70)]] as const)
				: ([
						['walk', wideWalk],
						['slash', narrowSlash]
					] as const)) {
				const hash = await cellHash(image);
				project.images.set(hash, image);
				base.layers[0].cells![clip].south![1] = hash;
			}
		const rejected: number[][] = [];
		for (const walkCell of [0, 1])
			for (const actionCell of [0, 1]) {
				const walk = { clip: 'walk', direction: 'south', cell: walkCell } as const;
				const action = { ...walk, clip: 'slash', cell: actionCell };
				const fragment = (pose: typeof walk | typeof action, split: typeof splitLower) =>
					split(
						project.images.get(base.layers[0].cells![pose.clip].south![pose.cell]!)!,
						actionHip(project.manifest.rig, pose.clip, pose.direction, pose.cell)!
					);
				if (
					!missingHip &&
					layerOffset(fragment(walk, splitLower), fragment(action, splitUpper)).seam >
						actionSeamLimits(64).worst
				)
					rejected.push([walkCell, actionCell]);
				const result = composeLayeredAction(project, {}, walk, action, 0, frame);
				expect(result.fallback).toBe(missingHip ? 'hip' : 'seam');
				expect(result.image).toBeNull();
			}
		expect(rejected).toEqual(
			missingHip
				? []
				: missingLegs
					? [
							[1, 0],
							[1, 1]
						]
					: [[1, 1]]
		);
		const result = await exportFiles(project, {
			engines: ['phaser'],
			baked: false,
			actionLayering: { waist: 0, walk: ['walk'], attacks: ['slash'] }
		});
		expect(result.errors).toEqual([]);
		const manifest = JSON.parse(
			new TextDecoder().decode(result.entries.find(({ name }) => name === 'manifest.json')?.data)
		) as Project['manifest'];
		expect(manifest.actionLayers?.pairs ?? []).toEqual([]);
		for (const cell of [0, 1]) {
			const walk = { clip: 'walk', direction: 'south', cell } as const;
			const action = { ...walk, clip: 'slash' };
			const draws = exportedActionDraws(manifest, {}, action, walk, true);
			expect(draws.map(({ clip, part }) => [clip, part])).toEqual([['slash', null]]);
		}
	}
);

test('Live shares shaped body trimming and keeps the attack sword and walk boots', async () => {
	const project = await fixture();
	const frame = { w: 64, h: 64, x: 32, y: 51 };
	const walk = { clip: 'walk', direction: 'south', cell: 0 } as const;
	const attack = { ...walk, clip: 'slash' };
	const items = { feet: 'boots', main_hand: 'sword', legs: 'trousers', back: 'cape' };
	expect(actionHip(project.manifest.rig, 'walk', 'south', 0)).toMatchObject({
		source: 'anchor',
		hip: { x: 32.5, y: 32.5 }
	});
	const render = () => composeLayeredAction(project, items, walk, attack, 0, frame);
	const first = render();
	expect(first.fallback).toBeNull();
	const red = (result: typeof first, x: number, y: number) =>
		result.image?.data[
			((y + result.frame.y - frame.y) * result.frame.w + x + result.frame.x - frame.x) * 4
		];
	expect(red(first, 30, 50)).toBe(20);
	expect(red(first, 45, 35)).toBe(200);
	expect(red(first, 9, 35)).toBe(0);
	expect(red(first, 24, 30)).toBe(120);
	expect(red(first, 30, 40)).toBe(70);
	expect(red(first, 38, 40)).toBe(150);
	const next = composeLayeredAction(
		project,
		items,
		{ ...walk, cell: 1 },
		{ ...attack, cell: 1 },
		0,
		frame
	);
	expect(next.fallback).toBeNull();
	expect(next.frame).toEqual(first.frame);
	expect(first.frame).toEqual({ w: 64, h: 66, x: 32, y: 52 });
	expect(red(next, 45, 34)).toBe(200);
	expect(red(next, 63, -1)).toBe(201);
	expect(render()).toEqual(first);
	expect(
		composeLayeredAction(project, items, walk, { ...attack, direction: 'east' }, 0, frame).fallback
	).toBe('direction');
});

test('exports ship precut source layers and exact integer hip registration only when enabled', async () => {
	const p = await fixture();
	const opts = { engines: ['phaser', 'gdevelop', 'godot', 'unity'] as const, baked: false };
	const off = await exportFiles(p, { ...opts, engines: ['phaser'] });
	expect(off.entries.some((f) => f.name.startsWith('action/'))).toBe(false);
	expect(off.errors).toEqual([]);
	const on = await exportFiles(p, {
		...opts,
		engines: [...opts.engines],
		actionLayering: { waist: 0, walk: ['walk'], attacks: ['slash'] }
	});
	expect(on.errors).toEqual([]);
	const text = (name: string) =>
		new TextDecoder().decode(on.entries.find((f) => f.name === name)?.data);
	const m = JSON.parse(text('manifest.json')) as Project['manifest'];
	expect(m.actionLayers?.planes[0].anchors[0].cells).toEqual([
		[33, 33],
		[33, 33]
	]);
	expect(m.actionLayers?.pairs[0]).toMatchObject({
		blocked: [],
		cells: Array.from({ length: 4 }, () => ({ x: 0, y: 0 }))
	});
	expect(
		on.entries.filter(({ name }) => name.startsWith('action/')).map(({ name }) => name)
	).toEqual([
		'action/lower/layers/body/base/main/walk.png',
		'action/upper/layers/body/base/main/slash.png'
	]);
	expect(m.items.find(({ id }) => id === 'sword')?.layers[0].actionSheets?.upper?.slash).toBe(
		'layers/main_hand/sword/main/slash.png'
	);
	const upper = on.entries.find((f) => f.name === 'action/upper/layers/body/base/main/slash.png');
	expect(upper).toBeDefined();
	const image = await decodePngBytes(upper!.data);
	expect(image.data[(40 * image.w + 32) * 4 + 3]).toBe(0);
	const walk = { clip: 'walk', direction: 'south', cell: 0 } as const;
	const attack = { ...walk, clip: 'slash' };
	const draws = exportedActionDraws(
		m,
		{ feet: 'boots', main_hand: 'sword', legs: 'trousers', back: 'cape' },
		attack,
		walk,
		true
	);
	expect(draws[0].item.id).toBe('cape');
	expect(draws.filter((d) => d.item.id === 'boots').map((d) => d.part)).toEqual(['lower']);
	expect(draws.filter((d) => d.item.id === 'sword').map((d) => d.part)).toEqual(['upper']);
	expect(draws.filter((d) => d.item.id === 'base').map((d) => d.part)).toEqual(['lower', 'upper']);
	expect(text('godot/paperdoll.gd')).toContain('func can_layer_action');
	expect(text('unity/Runtime/Paperdoll.cs')).toContain('public string PlayAction');
	expect(text('gdevelop/game.json')).toContain('upper_PD_');
});

function withGearCoverageGaps(project: Project) {
	const [, boots, , trousers, cape] = project.manifest.items;
	delete cape.layers[0].cells!.slash;
	delete boots.layers[0].cells!.slash;
	delete trousers.layers[0].cells!.walk;
	return project;
}

test('only gear visible through the full attack can block the layered attack', async () => {
	const project = withGearCoverageGaps(await fixture());
	const walk = { clip: 'walk', direction: 'south', cell: 0 } as const;
	const action = { ...walk, clip: 'slash' };
	const frame = { w: 64, h: 64, x: 32, y: 51 };
	const gear = { back: 'cape', feet: 'boots' };
	const plain = composeLayeredAction(project, {}, walk, action, 0, frame);
	expect(plain.image).not.toBeNull();
	expect(composeLayeredAction(project, gear, walk, action, 0, frame)).toEqual(plain);
	expect(
		composeLayeredAction(project, { ...gear, legs: 'trousers' }, walk, action, 0, frame)
	).toMatchObject({ image: null, fallback: 'gear-loss' });
	const files = await exportFiles(project, {
		engines: ['phaser'],
		baked: false,
		actionLayering: { waist: 0, walk: ['walk'], attacks: ['slash'] }
	});
	expect(files.errors).toEqual([]);
	const manifest = JSON.parse(
		new TextDecoder().decode(files.entries.find(({ name }) => name === 'manifest.json')!.data)
	);
	expect(manifest.actionLayers.omissions).toEqual([
		{ clip: 'slash', direction: 'south', items: ['boots', 'cape'] }
	]);
	expect(manifest.actionLayers.pairs[0].blocked).toEqual(['trousers']);
	for (const layered of [true, false])
		expect(
			exportedActionDraws(manifest, gear, action, walk, layered).map(({ item }) => item.id)
		).toEqual(layered ? ['base', 'base'] : ['base']);
});

test.each([
	[48, 8, 4, 2],
	[92, 8, 4, 2],
	[128, 11, 6, 3],
	[256, 22, 11, 6]
])('scales seam gates to a %i px cell', (width, worst, median, shared) => {
	expect(actionSeamLimits(width)).toEqual({ worst, median, shared });
	const pairs = [
		{ seam: 0, sharedShift: 0 },
		{ seam: median, sharedShift: 0 },
		{ seam: worst, sharedShift: shared }
	];
	expect(actionSetScore(pairs, width).fallback).toBeNull();
	for (const [index, score] of [
		[2, { seam: worst + 1, sharedShift: shared }],
		[1, { seam: median + 1, sharedShift: 0 }],
		[2, { seam: worst, sharedShift: shared + 1 }]
	] as const)
		expect(actionSetScore(pairs.with(index, score), width).fallback).toBe('seam');
});

test.each([46.5, 47.5])(
	'recovers an off-silhouette hip at y=%f at the top of the Bonequin East walk 4 shape',
	(hipY) => {
		const image = pixels(29, 48, 4, 10, 70);
		const geometry = { hip: { x: 28.5, y: hipY }, feet: [], source: 'anchor' } as const;
		const lower = splitLower(image, { ...geometry, feet: [] });
		expect(lower).toMatchObject({ waist: 48, hip: { x: 29.5, y: 48.5 } });
		expect(lower.image.data[(48 * 64 + 29) * 4 + 3]).toBe(255);
		expect(
			splitLower(image, {
				...geometry,
				feet: [],
				alternatives: [{ hip: { x: 30.5, y: 49.5 }, source: 'measured' }]
			})
		).toMatchObject({ waist: 49, source: 'measured' });
	}
);

test.skipIf(!process.env.GODOT_BIN)(
	'Godot draws the precut stacks while the native walk clock stays active',
	async () => {
		const p = withGearCoverageGaps(await fixture());
		const exported = await exportFiles(p, {
			engines: ['godot'],
			baked: false,
			actionLayering: { waist: 0, walk: ['walk'], attacks: ['slash'] }
		});
		expect(exported.errors).toEqual([]);
		const folder = mkdtempSync(join(tmpdir(), 'pixeldoll-action-godot-'));
		const godot = (...args: string[]) =>
			spawnSync(process.env.GODOT_BIN!, ['--headless', '--path', folder, ...args], {
				encoding: 'utf8',
				timeout: 40000,
				windowsHide: true
			});
		try {
			for (const { name, data } of exported.entries) {
				const path = join(folder, name);
				mkdirSync(dirname(path), { recursive: true });
				writeFileSync(path, data);
			}
			writeFileSync(
				join(folder, 'project.godot'),
				'config_version=5\n[rendering]\nrenderer/rendering_method="gl_compatibility"\n'
			);
			writeFileSync(
				join(folder, 'verify.gd'),
				`extends SceneTree
func _initialize():
	call_deferred("verify")
func verify():
	var doll = load("res://godot/Paperdoll.tscn").instantiate()
	root.add_child(doll)
	var ok = doll.play_anim("walk", "south") and doll.can_layer_action("slash", "south")
	ok = ok and doll.play_action("slash", "south") == "full" and doll.is_action_playing()
	ok = ok and doll.body.animation == "walk_south" and doll.body.is_playing()
	doll.set_action_layering(true)
	ok = ok and doll.play_action("slash", "south") == "layered"
	ok = ok and doll._action_nodes.size() >= 2
	ok = ok and doll._action_nodes[0].texture.atlas.resource_path.contains("/action/lower/")
	ok = ok and doll._action_nodes[1].texture.atlas.resource_path.contains("/action/upper/")
	ok = ok and doll.play_action("missing", "south") == "" and doll.is_action_playing()
	doll.set_action_layering(false)
	doll.body.frame = 1
	doll._process(0.06)
	ok = ok and doll.is_action_playing() and doll._action_nodes[0].texture.atlas.resource_path.contains("/action/lower/")
	ok = ok and doll._action_nodes[1].texture.atlas.resource_path.contains("/action/upper/")
	doll._process(0.05)
	ok = ok and not doll.is_action_playing() and doll.body.is_visible() and doll.body.is_playing()
	doll.set_action_layering(true)
	ok = ok and doll.play_action("slash", "south") == "layered"
	ok = ok and doll.equip("back", "cape") and doll.equip("feet", "boots") and doll._action_layered and doll.is_action_playing()
	doll._process(0.01)
	ok = ok and doll._action_nodes.filter(func(node): return node.visible).size() == 2
	ok = ok and doll.equip("legs", "trousers") and not doll._action_layered and doll.is_action_playing()
	ok = ok and doll.equip("legs", "") and not doll._action_layered and doll.is_action_playing()
	doll.play_anim("walk", "south")
	ok = ok and not doll.is_action_playing()
	print("ACTION_GODOT_PASS" if ok else "ACTION_GODOT_FAIL")
	quit(0 if ok else 1)
`
			);
			const imported = godot('--editor', '--import');
			expect(imported.status, imported.stdout + imported.stderr).toBe(0);
			const result = godot('--script', 'verify.gd');
			expect(result.status, result.stdout + result.stderr).toBe(0);
			expect(result.stdout).toContain('ACTION_GODOT_PASS');
		} finally {
			rmSync(folder, { recursive: true, force: true });
		}
	},
	90000
);
