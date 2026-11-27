import { expect, test } from 'vitest';
import { PAPERDOLL_AE_JS, phaserAeFiles } from '../../src/lib/export/phaser-ae.ts';
import type { Manifest } from '../../src/lib/store/manifest.ts';
import { CURRENT_FORMAT } from '../../src/lib/store/manifest.ts';

// Executes the generated module against a stand-in for the Phaser AE kernel. The real engine runs in
// scripts/verify-phaser-ae-export.mjs, which needs a phaser.io account to download it.
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
		aggregates = new Map<unknown, { emit: (out: unknown, alpha: number) => void } | null>(),
		steps = new Set<(dt: number) => void>();
	let frames = 0;
	const game = {
		world: { kind: world, layers: ['back', 'world', 'front'] },
		roster: {
			wrap: null,
			aggregate: (handle: unknown, aggregate: { emit: () => void } | null) =>
				aggregates.set(handle, aggregate)
		},
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
				prev: { x: 0, y: 0 },
				x: 0,
				y: 0,
				z: 0,
				width: 32,
				height: 32,
				scale: 1,
				visible: true,
				alive: true,
				snap() {
					this.prev = { x: this.x, y: this.y };
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
	const advance = (n: number, dt = 1 / 60) => {
		for (let i = 0; i < n; i++) for (const fn of steps) fn(dt);
	};
	/** What the doll's aggregate draws at `alpha`, in order: texture key parts, local [row, cell] and the instance. */
	const drawn = (doll: any, alpha = 1) => {
		const out: any[] = [];
		aggregates.get(doll.actor)!.emit(
			{
				add: (
					x: number,
					y: number,
					w: number,
					height: number,
					frame: number,
					tint: number,
					...rest: number[]
				) => out.push({ x, y, w, h: height, frame, tint, alpha: rest[3] })
			},
			alpha
		);
		return out.map((instance) => {
			const [key, grid] = [...grids].find(
				([, g]) => instance.frame >= g.first && instance.frame < g.first + g.cols * g.rows
			)!;
			const local = instance.frame - grid.first;
			return {
				...instance,
				texture: key,
				key: JSON.parse(key.slice(3).split(':palette:')[0]),
				row: Math.floor(local / grid.cols),
				cell: local % grid.cols
			};
		});
	};
	return { game, grids, sprites, steps, aggregates, advance, drawn };
}

test('the Phaser AE export lists every sheet for the game manifest and ships typed runtime files', () => {
	const files = phaserAeFiles(fixture());
	expect(files.map((f) => f.name)).toEqual([
		'phaser-ae/paperdoll.js',
		'phaser-ae/paperdoll.d.ts',
		'phaser-ae/types.d.ts',
		'phaser-ae/assets.json',
		'phaser-ae/README.txt'
	]);
	expect(JSON.parse(files[3].data as string)).toEqual([
		'pixeldoll/hero/manifest.json',
		'pixeldoll/hero/sources/body-walk.png',
		'pixeldoll/hero/sources/body-jump.png',
		'pixeldoll/hero/layers/hat-walk.png',
		'pixeldoll/hero/layers/hat-jump.png'
	]);
	expect(files[4].data).toContain("loadPaperdoll(game, 'pixeldoll/hero/', heroData)");
	expect(files[4].data).toContain('doll.play("walk", "south")');
});

test('loading registers one grid per layer and move from the source sheets, and names failed files', async () => {
	const api = runtime(),
		h = gameHarness(fixture());
	const m = await api.loadPaperdoll(h.game, 'pixeldoll/hero');
	expect(m._base).toBe('|pixeldoll/hero/');
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
	// a headless replay fetches nothing: the manifest passed in still builds every grid
	const headless = gameHarness(fixture(), { fail: 'manifest.json' });
	const data = await api.loadPaperdoll(headless.game, 'hero/', fixture());
	expect([data.rig.cell.w, headless.grids.size]).toEqual([64, 4]);
});

test('a doll is one actor that emits its layers in draw order around one interpolated pivot', async () => {
	for (const world of ['side', 'topdown']) {
		const api = runtime(),
			h = gameHarness(fixture(), { world }),
			m = await api.loadPaperdoll(h.game, 'hero/');
		const doll = new api.Paperdoll(h.game, 100, 200, m, 'dressed', { z: 3, tags: ['hero'] });
		doll.play('walk', 'south');
		expect(h.sprites).toEqual([doll.actor]);
		expect([doll.actor.layer, doll.actor.tags]).toEqual(['world', ['hero']]);
		const actor = doll.actor;
		// the actor's box is the rig cell around the pivot; a top-down world sorts it at the feet
		expect([actor.x, actor.y, actor.width, actor.height]).toEqual([100, 172, 64, 64]);
		expect(actor.y + actor.height / 2 + actor.z).toBe(world === 'side' ? 207 : 203);
		expect(h.drawn(doll).map((d: any) => [d.key[1], d.x, d.y, d.w])).toEqual([
			['base', 100, 172, 64],
			['hat', 100, 172, 96]
		]);
		// moving without a cut: every layer is drawn at the same in-between position
		doll.x = 110;
		doll.equip('head', null);
		doll.equip('head', 'hat');
		expect(h.drawn(doll, 0.5).map((d: any) => d.x)).toEqual([105, 105]);
		doll.teleport(110, 200);
		expect(h.drawn(doll, 0.5).map((d: any) => d.x)).toEqual([110, 110]);
		doll.scale = 2;
		expect(h.drawn(doll).map((d: any) => [d.x, d.y, d.w])).toEqual([
			[110, 144, 128],
			[110, 144, 192]
		]);
		doll.alpha = 0.5;
		doll.tint = '#ff0000';
		expect(h.drawn(doll).map((d: any) => [d.tint, d.alpha])[0]).toEqual([0xff0000ff, 0.5]);
		expect(() => (doll.tint = 'red')).toThrow('#rrggbb');
		doll.visible = false;
		expect(actor.visible).toBe(false);
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

test('frame boundaries land on the step that reaches them at any fixed step rate', async () => {
	const api = runtime(),
		h = gameHarness(fixture()),
		m = await api.loadPaperdoll(h.game, 'hero/');
	const doll = new api.Paperdoll(h.game, 0, 0, m);
	// jump: 50 ms of cell 0, then 50 ms of cell 1, once; 1/120 s steps sum to 49.99… and 99.99… ms
	doll.play('jump', 'south');
	h.advance(5, 1 / 120);
	expect([h.drawn(doll)[0].cell, doll.completed]).toEqual([0, false]);
	h.advance(1, 1 / 120);
	expect([h.drawn(doll)[0].cell, doll.completed]).toEqual([1, false]);
	h.advance(6, 1 / 120);
	expect(doll.completed).toBe(true);
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
	const body = () => h.drawn(doll)[0].texture;
	expect(body()).toContain(':palette:');
	expect(h.grids.get(body())).toMatchObject({ src: null, w: 64, cols: 2, rows: 2 });
	const grids = h.grids.size;
	new api.Paperdoll(h.game, 0, 0, m, 'red').play('walk', 'south');
	expect(h.grids.size).toBe(grids);
	doll.applyPreset('dressed');
	expect(body()).not.toContain(':palette:');
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
	// a whole-body action needs no move first
	expect(doll.playAction('slash', 'south')).toBe('full');
	expect(h.drawn(doll).map((d: any) => d.key[3])).toEqual(['slash']);
	doll.play('walk', 'south');
	expect(doll.canLayerAction('slash', 'south')).toBe(true);
	expect(doll.playAction('slash', 'south')).toBe('full');
	doll.setActionLayering(true);
	expect(doll.playAction('slash', 'south')).toBe('layered');
	const parts = () => h.drawn(doll).map((d: any) => d.key[3]);
	expect(parts()).toEqual(['lower:walk', 'upper:slash']);
	expect(h.drawn(doll)[1].x - h.drawn(doll)[0].x).toBe(2);
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
	expect([h.sprites.every((s) => !s.alive), h.aggregates.get(doll.actor)]).toEqual([true, null]);
	expect(h.steps.size).toBe(0);
});
