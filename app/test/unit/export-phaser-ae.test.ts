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
	const requests: string[] = [],
		clock = { frame: 0 },
		framers = new Set<() => void>();
	let failing = fail;
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
		clock,
		world: { kind: world, layers: ['back', 'world', 'front'] },
		roster: {
			wrap: null,
			aggregate: (handle: unknown, aggregate: { emit: () => void } | null) =>
				aggregates.set(handle, aggregate)
		},
		assets: {
			load(items: { kind: string; key: string; url: string }[]) {
				requests.push(...items.map((i) => i.url));
				const failed = items
					.filter((i) => failing && i.url.split('?')[0].endsWith(failing))
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
		spawn({
			scale = 1,
			...spec
		}: {
			id?: string;
			layer?: string;
			tags: string[];
			scale?: number;
			x?: number;
			y?: number;
		}) {
			const sprite = {
				x: 0,
				y: 0,
				...spec,
				id: (spec.id ?? 'object') + '-' + (sprites.length + 1),
				prev: { x: spec.x ?? 0, y: spec.y ?? 0, rot: 0, sx: scale, sy: scale },
				z: 0,
				rot: 0,
				sx: scale,
				sy: scale,
				get scale() {
					return this.sx;
				},
				set scale(v: number) {
					this.sx = this.sy = v;
				},
				alpha: 1,
				tint: '#ffffff',
				visible: true,
				alive: true,
				snap() {
					this.prev = { x: this.x, y: this.y, rot: this.rot, sx: this.sx, sy: this.sy };
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
		},
		frame(_name: string, fn: () => void) {
			framers.add(fn);
			return { cancel: () => framers.delete(fn) };
		}
	};
	// like the kernel: the frame counter moves after every step has run, then frame callbacks run
	const advance = (n: number, dt = 1 / 60) => {
		for (let i = 0; i < n; i++) {
			for (const fn of steps) fn(dt);
			clock.frame++;
		}
		for (const fn of framers) fn();
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
					rot: number,
					sx: number,
					sy: number,
					alpha: number
				) => out.push({ x, y, w, h: height, frame, tint, rot, sx, sy, alpha })
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
	const setFail = (file: string) => (failing = file);
	return { game, grids, sprites, steps, framers, aggregates, requests, setFail, advance, drawn };
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
	expect(files[4].data).toContain("loadPaperdoll(game, 'pixeldoll/hero/', { manifest: heroData })");
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
	// once the file is fixed, a second call fetches only it again, past any cached copy
	broken.setFail('');
	broken.requests.length = 0;
	await api.loadPaperdoll(broken.game, 'hero/');
	expect(broken.requests).toEqual(['hero/layers/hat-jump.png?pixeldoll=2']);
	// a headless replay fetches nothing: the manifest passed in still builds every grid
	const headless = gameHarness(fixture(), { fail: 'manifest.json' });
	const data = await api.loadPaperdoll(headless.game, 'hero/', { manifest: fixture() });
	expect([data.rig.cell.w, headless.grids.size]).toEqual([64, 4]);
});

test('a doll is one actor that owns its transform and emits its layers in draw order around it', async () => {
	for (const world of ['side', 'topdown']) {
		const api = runtime(),
			h = gameHarness(fixture(), { world }),
			m = await api.loadPaperdoll(h.game, 'hero/');
		const doll = new api.Paperdoll(h.game, 100, 200, m, 'dressed', { z: 3, tags: ['hero'] });
		doll.play('walk', 'south');
		expect(h.sprites).toEqual([doll.actor]);
		const actor = doll.actor;
		expect([actor.id, actor.layer, actor.tags]).toEqual(['pixeldoll-1', 'world', ['hero']]);
		// the actor's box is the rig cell around the pivot; a top-down world sorts it at the feet
		expect([actor.x, actor.y, actor.width, actor.height]).toEqual([100, 172, 64, 64]);
		expect(actor.y + (actor.height * actor.sy) / 2 + actor.z).toBe(world === 'side' ? 207 : 203);
		expect(h.drawn(doll).map((d: any) => [d.key[1], d.x, d.y, d.w, d.sx])).toEqual([
			['base', 100, 172, 64, 1],
			['hat', 100, 172, 96, 1]
		]);
		// moving without a cut: every layer is drawn at the same in-between position
		doll.x = 110;
		doll.equip('head', null);
		doll.equip('head', 'hat');
		expect(h.drawn(doll, 0.5).map((d: any) => d.x)).toEqual([105, 105]);
		doll.teleport(110, 200);
		expect(h.drawn(doll, 0.5).map((d: any) => d.x)).toEqual([110, 110]);
		// the engine moves the actor (a collision push): the doll reads it back and keeps it
		actor.x = 90;
		doll.y += 1;
		expect([doll.x, doll.y, actor.x]).toEqual([90, 201, 90]);
		doll.teleport(110, 200);
		// scale keeps the pivot, and layers scale with the actor's own sx and sy
		doll.scale = 2;
		expect([doll.x, doll.y]).toEqual([110, 200]);
		expect(h.drawn(doll).map((d: any) => [d.x, d.y, d.w, d.sx])).toEqual([
			[110, 144, 64, 2],
			[110, 144, 96, 2]
		]);
		h.advance(1);
		expect(actor.y + (actor.height * actor.sy) / 2 + actor.z).toBe(world === 'side' ? 211 : 203);
		// alpha, tint (with its alpha byte) and rotation come from the actor itself
		actor.alpha = 0.5;
		actor.tint = '#ff000080';
		actor.rot = Math.PI / 2;
		actor.snap();
		expect(h.drawn(doll).map((d: any) => [d.tint, d.alpha, d.rot])[0]).toEqual([
			0xff000080,
			0.5,
			Math.PI / 2
		]);
		doll.visible = false;
		expect(actor.visible).toBe(false);
	}
});

test('an asymmetric box keeps the pivot and sorts at the feet', async () => {
	const api = runtime(),
		h = gameHarness(fixture(), { world: 'topdown' }),
		m = await api.loadPaperdoll(h.game, 'hero/');
	const doll = new api.Paperdoll(h.game, 50, 80, m, 'dressed', {
		box: { w: 20, h: 30, x: 4, y: 26 }
	});
	doll.play('walk', 'south');
	const actor = doll.actor;
	expect([actor.x, actor.y, actor.width, actor.height, doll.x, doll.y]).toEqual([
		56, 69, 20, 30, 50, 80
	]);
	expect(actor.y + actor.height / 2 + actor.z).toBe(80);
	expect(h.drawn(doll).map((d: any) => [d.x, d.y])).toEqual([
		[50, 52],
		[50, 52]
	]);
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
	// play() between steps counts from the step after the next one (the step it fell in): 80 ms of cell 1, then 100 ms
	// of cell 0 (from step 6), then cell 1 at exactly 180 ms (step 12), looping at 280 ms
	expect(seen.map((cells) => cells[0])).toEqual([
		...Array(6).fill('1/1'),
		...Array(6).fill('1/0'),
		...Array(6).fill('1/1'),
		...Array(2).fill('1/1')
	]);
	expect(seen.every((cells) => new Set(cells).size === 1)).toBe(true);
});

test('a clip started inside a step renders from zero whichever step runs first', async () => {
	const api = runtime(),
		h = gameHarness(fixture()),
		m = await api.loadPaperdoll(h.game, 'hero/');
	let doll: any = null;
	// a game step registered before the doll's
	h.game.step('game', () => doll?.anim === null && doll.play('walk', 'south'));
	doll = new api.Paperdoll(h.game, 0, 0, m);
	h.advance(1);
	expect(doll.elapsed).toBe(0);
	h.advance(1);
	expect(doll.elapsed).toBeCloseTo(1000 / 60);
});

test('a doll whose actor is killed stops, and destroy is safe to repeat', async () => {
	const api = runtime(),
		h = gameHarness(fixture()),
		m = await api.loadPaperdoll(h.game, 'hero/');
	const doll = new api.Paperdoll(h.game, 0, 0, m);
	doll.play('walk', 'south');
	doll.actor.destroy();
	h.advance(1);
	expect([doll.alive, h.steps.size, h.framers.size, doll.placed.length]).toEqual([false, 0, 0, 0]);
	doll.destroy();
	doll.destroy();
	const other = new api.Paperdoll(h.game, 0, 0, m);
	other.destroy();
	other.destroy();
	expect([other.alive, other.actor.alive, h.aggregates.get(other.actor), h.steps.size]).toEqual([
		false,
		false,
		null,
		0
	]);
});

test('a rotated, scaled actor keeps the pivot, teleports to it and sorts at it', async () => {
	const api = runtime(),
		h = gameHarness(fixture(), { world: 'topdown' }),
		m = await api.loadPaperdoll(h.game, 'hero/');
	const doll = new api.Paperdoll(h.game, 300, 300, m, 'dressed', { z: 2 });
	doll.play('walk', 'south');
	const actor = doll.actor;
	actor.rot = Math.PI / 2;
	actor.sx = 2;
	actor.sy = 3;
	doll.teleport(500, 450);
	expect([doll.x, doll.y].map((v) => Math.round(v * 1e6) / 1e6)).toEqual([500, 450]);
	h.advance(1);
	expect(actor.y + (actor.height * Math.abs(actor.sy)) / 2 + actor.z).toBeCloseTo(452);
	// the body cell's center sits on the pivot plus its turned, scaled offset; drawn where the accessors say
	const [body] = h.drawn(doll);
	const dx = (32 - 32) * 2,
		dy = (32 - 60) * 3;
	expect([body.x, body.y].map((v) => Math.round(v * 1e6) / 1e6)).toEqual([500 - dy, 450 + dx]);
});

test('cancelAction shows the gait at once, and a later load prepares its outfits', async () => {
	const api = runtime(),
		h = gameHarness(fixture()),
		m = await api.loadPaperdoll(h.game, 'hero/');
	const doll = new api.Paperdoll(h.game, 0, 0, m);
	doll.play('walk', 'south');
	doll.playAction('jump', 'south');
	expect(h.drawn(doll)[0].key[3]).toBe('jump');
	doll.cancelAction();
	expect(h.drawn(doll)[0].key[3]).toBe('walk');
	const grids = h.grids.size;
	expect(await api.loadPaperdoll(h.game, 'hero/', { prepare: ['red'] })).toBe(m);
	expect(h.grids.size).toBe(grids + 2);
});

test('frame boundaries land on the step that reaches them at any fixed step rate', async () => {
	const api = runtime(),
		h = gameHarness(fixture()),
		m = await api.loadPaperdoll(h.game, 'hero/');
	const doll = new api.Paperdoll(h.game, 0, 0, m);
	// jump: 50 ms of cell 0, then 50 ms of cell 1, once; 1/120 s steps sum to 49.99… and 99.99… ms
	doll.play('jump', 'south');
	h.advance(6, 1 / 120);
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
	h.advance(6);
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
