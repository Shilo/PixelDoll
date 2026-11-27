import { expect, test } from 'vitest';
import { PAPERDOLL_AE_JS, phaserAeFiles } from '../../src/lib/export/phaserae.ts';
import type { Manifest } from '../../src/lib/store/manifest.ts';
import { CURRENT_FORMAT } from '../../src/lib/store/manifest.ts';

// Executes the generated module against a stand-in for the Phaser AE kernel. The real engine runs in
// scripts/verify-phaserae-export.mjs, which needs a phaser.io account to download it.
const runtime = () =>
	new Function(
		PAPERDOLL_AE_JS.replace(/^export /gm, '') + '\nreturn { loadPaperdoll, Paperdoll };'
	)() as Record<string, any>;

const fixture = () =>
	({
		name: 'Hero',
		exportId: 'hero',
		app: 'test',
		format: CURRENT_FORMAT,
		rig: {
			baseItem: 'base',
			cell: { w: 64, h: 64 },
			pivot: { x: 32, y: 60 },
			directions: [{ id: 'south' }, { id: 'east' }],
			animations: [
				{
					id: 'walk',
					cells: 2,
					loop: true,
					frames: [
						{ cell: 1, ms: 80 },
						{ cell: 0, ms: 100 },
						{ cell: 1, ms: 100 }
					]
				},
				{
					id: 'jump',
					cells: 2,
					loop: false,
					directions: ['south'],
					frames: [
						{ cell: 0, ms: 50 },
						{ cell: 1, ms: 50 }
					]
				}
			]
		},
		materials: [{ id: 'skin', owner: 'base', ramp: ['#646464'], variants: { red: ['#ff0000'] } }],
		slots: [
			{ id: 'body', z: 10 },
			{ id: 'head', z: 20 }
		],
		items: [
			{
				id: 'base',
				slot: 'body',
				materials: ['skin'],
				layers: [
					{
						id: 'main',
						role: 'fg',
						z: 10,
						sheets: { walk: 'layers/body-walk.png', jump: 'layers/body-jump.png' },
						sourceSheets: { walk: 'sources/body-walk.png', jump: 'sources/body-jump.png' }
					}
				]
			},
			{
				id: 'hat',
				slot: 'head',
				materials: [],
				layers: [
					{
						id: 'main',
						role: 'fg',
						z: 20,
						sheets: { walk: 'layers/hat-walk.png', jump: 'layers/hat-jump.png' },
						cell: { w: 96, h: 96 },
						pivot: { x: 48, y: 76 }
					}
				]
			}
		],
		presets: [
			{ id: 'dressed', items: { body: 'base', head: 'hat' }, variants: {} },
			{ id: 'red', items: { body: 'base', head: null }, variants: { skin: 'red' } }
		]
	}) as unknown as Manifest;

/** The kernel surface the adapter uses, recording what it registers and draws. */
function gameHarness(m: Manifest, { world = 'side', fail = '' } = {}) {
	const loaded = new Map<string, unknown>(),
		grids = new Map<
			string,
			{ src: unknown; w: number; h: number; cols: number; rows: number; first: number }
		>(),
		sprites: any[] = [],
		steps = new Set<(dt: number) => void>();
	let frames = 0;
	const game = {
		world: { kind: world, layers: ['back', 'world', 'front'] },
		assets: {
			load(items: { kind: string; key: string; url: string }[]) {
				const failed = items
					.filter((i) => fail && i.url.endsWith(fail))
					.map((i) => ({ key: i.key, url: i.url }));
				for (const item of items)
					if (!failed.some((f) => f.key === item.key))
						loaded.set(item.key, item.kind === 'json' ? structuredClone(m) : new Uint8Array(0));
				return { ok: !failed.length, failed, then: (done: () => void) => done() };
			},
			get: (key: string) => loaded.get(key),
			has: (key: string) => loaded.has(key),
			track: (_key: string, work: () => Promise<unknown>) => work(),
			addGrid(key: string, src: unknown, w: number, h: number, cols: number, rows: number) {
				grids.set(key, { src, w, h, cols, rows, first: frames });
				frames += cols * rows;
				return grids.get(key)!.first;
			},
			frames: (key: string) => grids.get(key)!.first
		},
		spawn(spec: { layer?: string; tags: string[] }) {
			const sprite = {
				...spec,
				x: 0,
				y: 0,
				z: 0,
				width: 32,
				height: 32,
				scale: 1,
				visible: false,
				alive: true,
				snaps: 0,
				texture: null as string | null,
				frame: 0,
				setTexture(key: string, frame = 0) {
					this.texture = key;
					this.frame = grids.get(key)!.first + frame;
				},
				snap() {
					this.snaps++;
				},
				destroy() {
					this.alive = false;
				}
			};
			sprites.push(sprite);
			return sprite;
		},
		step(_name: string, fn: (dt: number) => void) {
			steps.add(fn);
			return { cancel: () => steps.delete(fn) };
		}
	};
	const advance = (n: number) => {
		for (let i = 0; i < n; i++) for (const fn of steps) fn(1 / 60);
	};
	/** What each visible sprite shows, in draw order: texture key parts and the local [row, cell]. */
	const drawn = (doll: any) =>
		doll.placed
			.filter((p: any) => p.sprite.visible)
			.map((p: any) => {
				const grid = grids.get(p.sprite.texture)!,
					local = p.sprite.frame - grid.first;
				return {
					key: JSON.parse(p.sprite.texture.slice(3).split(':palette:')[0]),
					row: Math.floor(local / grid.cols),
					cell: local % grid.cols
				};
			});
	return { game, grids, sprites, steps, advance, drawn };
}

test('the Phaser AE export lists every sheet for the game manifest and ships typed runtime files', () => {
	const files = phaserAeFiles(fixture());
	expect(files.map((f) => f.name)).toEqual([
		'phaserae/paperdoll.js',
		'phaserae/paperdoll.d.ts',
		'phaserae/types.d.ts',
		'phaserae/assets.json',
		'phaserae/README.txt'
	]);
	expect(JSON.parse(files[3].data as string)).toEqual([
		'pixeldoll/hero/manifest.json',
		'pixeldoll/hero/sources/body-walk.png',
		'pixeldoll/hero/sources/body-jump.png',
		'pixeldoll/hero/layers/hat-walk.png',
		'pixeldoll/hero/layers/hat-jump.png'
	]);
	expect(files[4].data).toContain("loadPaperdoll(game, 'pixeldoll/hero/')");
	expect(files[4].data).toContain('doll.play("walk", "south")');
});

test('loading registers one grid per layer and move from the source sheets, and names failed files', async () => {
	const api = runtime(),
		h = gameHarness(fixture());
	const m = await api.loadPaperdoll(h.game, 'pixeldoll/hero');
	expect(m._base).toBe('pixeldoll/hero/');
	expect(await api.loadPaperdoll(h.game, 'pixeldoll/hero/')).toBe(m);
	expect(
		[...h.grids.values()].map(({ w, h: height, cols, rows }) => [w, height, cols, rows])
	).toEqual([
		[64, 64, 2, 2],
		[64, 64, 2, 2],
		[96, 96, 2, 2],
		[96, 96, 2, 2]
	]);
	const broken = gameHarness(fixture(), { fail: 'hat-jump.png' });
	await expect(api.loadPaperdoll(broken.game, 'hero/')).rejects.toThrow(
		'failed to load hero/layers/hat-jump.png'
	);
	await expect(api.loadPaperdoll(broken.game, 'hero/')).rejects.toThrow('failed to load');
});

test('a doll draws its layers from one pool in draw order, sorted at its feet in a top-down world', async () => {
	for (const world of ['side', 'topdown']) {
		const api = runtime(),
			h = gameHarness(fixture(), { world }),
			m = await api.loadPaperdoll(h.game, 'hero/');
		const doll = new api.Paperdoll(h.game, 100, 200, m, 'dressed', { z: 3 });
		doll.play('walk', 'south');
		expect(h.sprites.every((s) => s.layer === 'world')).toBe(true);
		expect(h.drawn(doll).map((d: any) => d.key[1])).toEqual(['base', 'hat']);
		expect(doll.placed.map((p: any) => p.sprite)).toEqual(h.sprites.slice(0, 2));
		const [body, hat] = doll.placed.map((p: any) => p.sprite);
		// centers that put both cells' pivots on 100,200
		expect([body.x, body.y, body.width, hat.x, hat.y, hat.width]).toEqual([
			100, 172, 64, 100, 172, 96
		]);
		if (world === 'side') expect([body.z, hat.z]).toEqual([3, 3]);
		else expect([body, hat].map((s) => s.y + s.height / 2 + s.z)).toEqual([203, 203 + 1 / 1024]);
		doll.equip('head', null);
		expect(hat.visible).toBe(false);
		doll.scale = 2;
		expect([body.x, body.y, body.scale]).toEqual([100, 144, 2]);
		doll.visible = false;
		expect(body.visible).toBe(false);
	}
});

test('the doll clock follows each playlist entry on fixed steps, including exact frame boundaries', async () => {
	const api = runtime(),
		h = gameHarness(fixture()),
		m = await api.loadPaperdoll(h.game, 'hero/');
	const doll = new api.Paperdoll(h.game, 0, 0, m);
	doll.play('walk', 'east');
	const seen = [];
	for (let i = 0; i < 20; i++) {
		seen.push(h.drawn(doll).map((d: any) => `${d.row}/${d.cell}`));
		h.advance(1);
	}
	// 80 ms of cell 1, then 100 ms of cell 0 (from step 5), then cell 1 at exactly 180 ms (step 11), looping at 280 ms
	expect(seen.map((cells) => cells[0])).toEqual([
		...Array(5).fill('1/1'),
		...Array(6).fill('1/0'),
		...Array(6).fill('1/1'),
		...Array(3).fill('1/1')
	]);
	expect(seen.every((cells) => new Set(cells).size === 1)).toBe(true);
});

test('repeated play keeps progress, restart and completed one-shots start over, and turning keeps time', async () => {
	const api = runtime(),
		h = gameHarness(fixture()),
		m = await api.loadPaperdoll(h.game, 'hero/');
	const doll = new api.Paperdoll(h.game, 0, 0, m);
	expect(() => doll.setDirection('south')).toThrow('no active move');
	doll.play('walk', 'south');
	h.advance(4);
	const time = doll.elapsed;
	doll.play('walk', 'south');
	expect(doll.elapsed).toBe(time);
	doll.setDirection('east');
	expect([doll.elapsed, h.drawn(doll)[0].row]).toEqual([time, 1]);
	doll.play('walk', 'east', true);
	expect(doll.elapsed).toBe(0);
	doll.play('jump', 'south');
	h.advance(10);
	expect([doll.completed, h.drawn(doll)[0].cell]).toEqual([true, 1]);
	doll.play('jump', 'south');
	expect([doll.elapsed, doll.completed]).toEqual([0, false]);
	const state = () =>
		JSON.stringify([doll.anim, doll.dir, doll.elapsed, doll.equipped, doll.variants]);
	const before = state();
	expect(() => doll.play('jump', 'east')).toThrow('unavailable');
	expect(() => doll.setDirection('east')).toThrow('unavailable');
	expect(() => doll.equip('body', 'base')).toThrow('invalid equipment');
	expect(() => doll.equip('head', 'missing')).toThrow('invalid equipment');
	expect(() => doll.applyPreset('missing')).toThrow();
	expect(state()).toBe(before);
});

test('recoloring adds one palette grid per sheet and colors, and an outfit without colors restores the source', async () => {
	const api = runtime(),
		h = gameHarness(fixture()),
		m = await api.loadPaperdoll(h.game, 'hero/');
	const doll = new api.Paperdoll(h.game, 0, 0, m, 'red');
	doll.play('walk', 'south');
	const body = doll.placed[0].sprite;
	expect(body.texture).toContain(':palette:');
	expect(h.grids.get(body.texture)).toMatchObject({ src: null, w: 64, cols: 2, rows: 2 });
	const grids = h.grids.size;
	new api.Paperdoll(h.game, 0, 0, m, 'red').play('walk', 'south');
	expect(h.grids.size).toBe(grids);
	doll.applyPreset('dressed');
	expect(body.texture).not.toContain(':palette:');
});

test('a one-shot action plays over the walk clock, with optional precut stacks', async () => {
	const m = fixture();
	m.materials = [];
	m.presets = [{ id: 'bare', name: 'Bare', items: { body: 'base', head: null }, variants: {} }];
	const walk = m.rig.animations[0];
	m.rig.animations = [
		{ ...walk, directions: ['south'] },
		{
			...walk,
			id: 'slash',
			directions: ['south'],
			frames: [
				{ cell: 0, ms: 60 },
				{ cell: 1, ms: 40 }
			]
		}
	];
	for (const item of m.items)
		for (const layer of item.layers) {
			layer.sheets = { walk: 'walk.png', slash: 'slash.png' };
			delete layer.sourceSheets;
			layer.actionSheets = { lower: { walk: 'low.png' }, upper: { slash: 'up.png' } };
		}
	m.actionLayers = {
		planes: [
			{
				clip: 'walk',
				part: 'lower',
				anchors: [
					{
						direction: 'south',
						cells: [
							[32, 32],
							[32, 32]
						]
					}
				]
			},
			{
				clip: 'slash',
				part: 'upper',
				anchors: [
					{
						direction: 'south',
						cells: [
							[32, 32],
							[32, 32]
						]
					}
				]
			}
		],
		pairs: [
			{
				walk: 'walk',
				action: 'slash',
				direction: 'south',
				upperCells: 2,
				blocked: ['hat'],
				cells: [
					{ x: 0, y: 0 },
					{ x: 0, y: 0 },
					{ x: 2, y: -1 },
					{ x: 2, y: -1 }
				]
			}
		]
	} as Manifest['actionLayers'];
	const api = runtime(),
		h = gameHarness(m),
		model = await api.loadPaperdoll(h.game, 'hero/');
	const doll = new api.Paperdoll(h.game, 10, 20, model);
	doll.play('walk', 'south');
	expect(doll.canLayerAction('slash', 'south')).toBe(true);
	expect(doll.playAction('slash', 'south')).toBe('full');
	doll.setActionLayering(true);
	expect(doll.playAction('slash', 'south')).toBe('layered');
	const parts = () => h.drawn(doll).map((d: any) => d.key[3]);
	expect(parts()).toEqual(['lower:walk', 'upper:slash']);
	expect(doll.placed[1].sprite.x).toBe(10 + 2);
	expect(() => doll.playAction('missing', 'south')).toThrow('unavailable');
	expect(doll.action.layered).toBe(true);
	h.advance(5);
	expect(doll.actionPlaying).toBe(true);
	doll.equip('head', 'hat');
	expect(doll.action.layered).toBe(false);
	expect(parts()).toEqual(['slash', 'slash']);
	h.advance(1);
	expect(doll.actionPlaying).toBe(false);
	expect(parts()).toEqual(['walk', 'walk']);
	doll.playAction('slash', 'south');
	doll.play('walk', 'south');
	expect(doll.actionPlaying).toBe(false);
	doll.destroy();
	expect(h.sprites.every((s) => !s.alive)).toBe(true);
	expect(h.steps.size).toBe(0);
});
