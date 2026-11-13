import { expect, test } from 'vitest';
import { makeImg, type Img } from '../../src/lib/image/png.ts';
import { cellHash, playlist, type Keypoint } from '../../src/lib/rig/rig.ts';
import { rpgMakerFiles, type RpgLayout } from '../../src/lib/export/rpgmaker.ts';
import { exportFiles } from '../../src/lib/export/export.ts';
import { exportManifest } from '../../src/lib/export/generic.ts';
import type { Manifest, Project } from '../../src/lib/store/manifest.ts';
import { CURRENT_FORMAT } from '../../src/lib/store/manifest.ts';

// Square cells, pivot (3, 7). Each frame is one pixel whose red channel names it (standing 200, walk cell n = 10 + n), at x 3
// (south, north) or x 5 (east; west mirrors it to x 2), on row 6. `head` adds a marker (red 1) at x 3, row 2 to every frame.
type Source = { keypoints?: Keypoint[][]; measured?: Keypoint[][]; motion?: string };
type Options = {
	walk?: boolean;
	walkId?: string;
	dirs?: string[];
	size?: number;
	head?: boolean;
	names?: string[];
	character?: string;
	standing?: boolean;
	feet?: number[];
	aligned?: boolean;
	frames?: { cell: number; ms: number }[];
	keys?: Record<string, Source>;
};
/** Ankle keypoints per cell for a view, where `lead` is how far the left ankle is ahead of the right along the facing. A wide
 *  side-to-side stance is added in front and back views: it must not read as a stride. */
const FACING: Record<string, [number, number]> = {
	east: [1, 0],
	west: [-1, 0],
	south: [0, 1],
	north: [0, -1]
};
const gait = (dir: string, leads: number[]) =>
	leads.map((lead) => {
		const [fx, fy] = FACING[dir],
			wide = fy ? 0.2 : 0;
		return [
			{ label: 'LEFT LEG', x: 0.5 - wide + (fx * lead) / 2, y: 0.85 + (fy * lead) / 2 },
			{ label: 'RIGHT LEG', x: 0.5 + wide - (fx * lead) / 2, y: 0.85 - (fy * lead) / 2 }
		];
	});
async function project(o: Options = {}): Promise<Project> {
	const W = o.size ?? 8,
		H = W,
		images = new Map<string, Img>();
	const frame = async (red: number, x: number, y = 6, feet = 1) => {
		const im = makeImg(W, H);
		im.data.set([red, 0, 0, 255], (y * W + x) * 4);
		for (let f = 1; f < feet; f++) im.data.set([1, 1, 1, 255], (y * W + x - f) * 4); // markers widening the feet (ignored by frameAt)
		if (o.head) im.data.set([1, 1, 1, 255], (2 * W + 3) * 4);
		const h = await cellHash(im);
		images.set(h, im);
		return h;
	};
	const dirs = o.dirs ?? ['south', 'east', 'north'],
		xOf = (d: string) => (d === 'east' ? 5 : 3),
		walkId = o.walkId ?? 'walk';
	const standing: Record<string, string[]> = {},
		walk: Record<string, string[]> = {};
	for (const d of dirs) {
		standing[d] = [await frame(200, xOf(d))];
		walk[d] = await Promise.all(
			[0, 1, 2, 3].map((n) => frame(10 + n, xOf(d), 6, d === 'east' ? (o.feet?.[n] ?? 1) : 1))
		);
	}
	const base = [...images.keys()][0],
		names = o.names ?? ['Current look', 'Night', 'night'],
		marks = [];
	// each saved outfit wears its own marker (red 1, ignored by frameAt, at x 3, row 5), so outfits draw different sheets
	for (let i = 1; i < names.length; i++) {
		const im = makeImg(W, H);
		im.data.set([1, i, 0, 255], (5 * W + 3) * 4);
		const h = await cellHash(im);
		images.set(h, im);
		const moves = {
			...(o.standing === false ? {} : { default: standing }),
			...(o.walk === false ? {} : { [walkId]: walk })
		};
		const cells = Object.fromEntries(
			Object.entries(moves).map(([a, v]) => [
				a,
				Object.fromEntries(Object.entries(v).map(([d, l]) => [d, l.map(() => h)]))
			])
		);
		marks.push({
			id: `mark${i}`,
			name: `Mark ${i}`,
			slot: 'head',
			status: 'accepted',
			baseHash: base,
			mirror: 'flip',
			materials: [],
			prompt: '',
			provenance: [],
			layers: [{ id: 'main', role: 'fg', z: 100, cells }]
		});
	}
	// by default a template walk (one gait phase in every view) with front and side keypoints, as Studio walks have
	const keys = o.keys ?? {
		south: { keypoints: gait('south', [0, 0.3, 0, -0.3]) },
		east: { keypoints: gait('east', [0, 0.3, 0, -0.3]) }
	};
	const sources = Object.fromEntries(
		Object.entries(keys).map(([d, k]) => [
			d,
			{ route: 'skeleton-v3', reference: base, provenance: [], ...k }
		])
	);
	const manifest = {
		format: CURRENT_FORMAT,
		name: o.character ?? 'Hero Knight',
		app: 'PixelDoll',
		rig: {
			cell: { w: W, h: H },
			pivot: { x: 3, y: 7 },
			baseItem: 'body',
			baseHash: base,
			directions: [
				...dirs.map((id) => ({ id })),
				...(dirs.includes('east') ? [{ id: 'west', mirrorOf: 'east' }] : [])
			],
			animations: [
				...(o.standing === false
					? []
					: [{ id: 'default', cells: 1, loop: true, frames: playlist(1, 100) }]),
				...(o.walk === false
					? []
					: [
							{
								id: walkId,
								cells: 4,
								loop: true,
								frames: o.frames ?? playlist(4, 100),
								sources,
								...(o.aligned === false
									? {}
									: {
											source: {
												endpoint: '/characters/animations',
												mode: 'template',
												template_animation_id: 'walking-4-frames'
											}
										})
							}
						])
			]
		},
		slots: [
			{ id: 'body', z: 10, class: 'base' },
			{ id: 'head', z: 100, class: 'worn' }
		],
		materials: [],
		items: [
			{
				id: 'body',
				name: 'Body',
				slot: 'body',
				status: 'accepted',
				baseHash: base,
				mirror: 'flip',
				materials: [],
				prompt: '',
				provenance: [],
				layers: [
					{
						id: 'main',
						role: 'fg',
						z: 10,
						cells: {
							...(o.standing === false ? {} : { default: standing }),
							...(o.walk === false ? {} : { [walkId]: walk })
						}
					}
				]
			},
			...marks
		],
		presets: names.map((name, i) => ({
			id: i ? `p${i}` : 'current',
			name,
			items: { body: 'body', ...(i ? { head: `mark${i}` } : {}) },
			variants: {}
		}))
	} as unknown as Manifest;
	return { manifest, images } as unknown as Project;
}
const run = (p: Project, layout: RpgLayout = 'vx') => rpgMakerFiles(p, p.manifest, layout);
const sheet = (files: { name: string; data: unknown }[], name: string) =>
	files.find((f) => f.name === name)!.data as Img;
const vxOf = (p: Project, base = 'Hero_Knight') => sheet(run(p, 'vx').files, `$${base}.png`);
const xpOf = (p: Project, base = 'Hero_Knight') => sheet(run(p, 'xp').files, `${base}.png`);
/** The frame pixel of one cell (not the head marker): its red value and position inside the cell. */
const frameAt = (im: Img, cols: number, col: number, row: number) => {
	const cw = im.w / cols,
		ch = im.h / 4;
	for (let y = 0; y < ch; y++)
		for (let x = 0; x < cw; x++) {
			const i = ((row * ch + y) * im.w + col * cw + x) * 4;
			if (im.data[i + 3] && im.data[i] !== 1) return { red: im.data[i], x, y };
		}
	return null;
};
const reds = (im: Img, cols: number, row: number) =>
	Array.from({ length: cols }, (_, c) => frameAt(im, cols, c, row)!.red);

test('each card writes only its own layout: $ sheets for MZ, MV, VX Ace and VX, plain 4 × 4 sheets for XP, at the zip root', async () => {
	const p = await project();
	const vx = run(p, 'vx'),
		xp = run(p, 'xp');
	expect(vx.warnings).toEqual([]);
	expect(vx.files.map((f) => f.name)).toEqual([
		'$Hero_Knight.png',
		'$Hero_Knight_Night.png',
		'$Hero_Knight_night_2.png',
		'README.txt'
	]);
	expect(xp.files.map((f) => f.name)).toEqual([
		'Hero_Knight.png',
		'Hero_Knight_Night.png',
		'Hero_Knight_night_2.png',
		'README.txt'
	]);
	expect(sheet(vx.files, 'README.txt') as unknown as string).toMatch(
		/^Copy the PNG files at the top of this zip into img\/characters \(RPG Maker MZ, MV\) or Graphics\/Characters\n\(VX Ace, VX\)/
	);
	expect(sheet(xp.files, 'README.txt') as unknown as string).toMatch(
		/^Copy the PNG files at the top of this zip into Graphics\/Characters \(RPG Maker XP or Pokemon Essentials\)/
	);
});

test('cells are trimmed to the art: pivot centered on an even width, top at the highest pixel, feet on the bottom row', async () => {
	const p = await project({ head: true }),
		vx = vxOf(p),
		xp = xpOf(p);
	// pixels at x 2..5 around pivot x 3 → reach 3, width 6; head at row 2, feet line 7 → height 5
	expect([vx.w, vx.h, xp.w, xp.h]).toEqual([18, 20, 24, 20]);
	expect(frameAt(vx, 3, 1, 0)).toEqual({ red: 200, x: 3, y: 4 }); // pivot x 3 → cell center 3; row 6 → 6 − 2
});

test('columns follow each engine: MZ/MV/VX [step, standing, step], XP [standing, step, passing, step]', async () => {
	const p = await project();
	// south: left foot leads in cell 1 and trails in cell 3 → step A cell 1, a quarter cycle later cell 2, half a cycle later cell 3
	expect(reds(vxOf(p), 3, 0)).toEqual([11, 200, 13]);
	expect(reds(xpOf(p), 4, 0)).toEqual([200, 11, 12, 13]);
});

test('a square stance in front and back views is not a step; the left foot ahead along the facing is', async () => {
	// feet wide apart side to side in every frame (gait adds it), left foot ahead in cell 2, behind in cell 0
	const p = await project({
		keys: {
			south: { keypoints: gait('south', [-0.2, 0, 0.2, 0]) },
			north: { keypoints: gait('north', [0, -0.2, 0, 0.2]) }
		}
	});
	const vx = vxOf(p);
	expect(reds(vx, 3, 0)).toEqual([12, 200, 10]);
	expect(reds(vx, 3, 3)).toEqual([13, 200, 11]);
});

test('rows are down, left, right, up; left is mirrored right and uses its steps; views without keypoints take the side view step', async () => {
	const p = await project({
		keys: {
			south: { keypoints: gait('south', [0.3, 0, -0.3, 0]) },
			east: { keypoints: gait('east', [-0.3, 0, 0.3, 0]) }
		}
	});
	const vx = vxOf(p);
	expect(reds(vx, 3, 0)).toEqual([10, 200, 12]);
	expect(reds(vx, 3, 2)).toEqual([12, 200, 10]); // east: left foot leads in cell 2
	expect(reds(vx, 3, 1)).toEqual([12, 200, 10]); // west: east's choice
	expect([frameAt(vx, 3, 1, 1)!.x, frameAt(vx, 3, 1, 2)!.x]).toEqual([2, 5]); // west is east flipped
	expect(reds(vx, 3, 3)).toEqual([12, 200, 10]); // north: no keypoints, so the side view's step (one walk, one clock)
});

test('views of one managed template take the side view phase; other walks use their own', async () => {
	const motion = 'managed-skeleton-v3:walking-8-frames';
	// the south signal is weak and points at cell 0; the side view clearly leads with the left foot in cell 1
	const keys = (southMotion: string) => ({
		south: { keypoints: gait('south', [0.02, 0, -0.02, 0.01]), motion: southMotion },
		east: { keypoints: gait('east', [0, 0.3, 0, -0.3]), motion }
	});
	expect(reds(vxOf(await project({ keys: keys(motion) })), 3, 0)).toEqual([11, 200, 13]);
	expect(reds(vxOf(await project({ keys: keys('pixminimax:walking') })), 3, 0)).toEqual([
		10, 200, 12
	]);
});

test('keypoints measured on the frames win over the requested ones', async () => {
	const p = await project({
		keys: {
			south: {
				keypoints: gait('south', [0, 0.3, 0, -0.3]),
				measured: gait('south', [0, -0.3, 0, 0.3])
			}
		}
	});
	expect(reds(vxOf(p), 3, 0)).toEqual([13, 200, 11]);
});

test('a held frame is picked while it is on screen, not the nearest frame start', async () => {
	// 0:100, 1:500, 2:100, 3:100 ms (800 ms). Step at cell 0 (t 0): a quarter (200 ms) and half (400 ms) later cell 1 shows.
	const p = await project({
		frames: [
			{ cell: 0, ms: 100 },
			{ cell: 1, ms: 500 },
			{ cell: 2, ms: 100 },
			{ cell: 3, ms: 100 }
		],
		keys: { south: { keypoints: gait('south', [0.3, -0.3, 0, 0]) } }
	});
	expect(reds(xpOf(p), 4, 0)).toEqual([200, 10, 11, 11]);
});

test('walk moves are found by word, such as walk-cycle', async () => {
	const p = await project({ walkId: 'walk-cycle' });
	expect(run(p).warnings).toEqual([]);
	expect(reds(vxOf(p), 3, 0)).toEqual([11, 200, 13]);
});

test('refuses characters without front, side and back views', async () => {
	const partial = await project({ dirs: ['south', 'north'] });
	expect(() => run(partial)).toThrow(/^RPG Maker: .*no west, east view/);
	const r = await exportFiles(await project({ dirs: ['south', 'north'], size: 32 }), {
		engines: ['rpgmakerxp'],
		baked: false
	});
	expect(r.errors[0]).toMatch(/^RPG Maker: /);
	expect(r.entries).toEqual([]);
});

test('without a walk move every column stands, with a warning; a walk missing a view stands there, with a warning', async () => {
	const still = await project({ walk: false });
	expect(run(still).warnings).toEqual([
		'RPG Maker: no walk move, so the sheets stand still. Add a walk move to animate them.'
	]);
	expect(reds(xpOf(still), 4, 0)).toEqual([200, 200, 200, 200]);
	const p = await project();
	const layer = p.manifest.items[0].layers[0] as unknown as {
		cells: Record<string, Record<string, unknown>>;
	};
	delete layer.cells.walk.north;
	expect(run(p).warnings).toEqual([
		'RPG Maker: the walk has no north view, so those rows stand still.'
	]);
	expect(reds(vxOf(p), 3, 3)).toEqual([200, 200, 200]);
});

test('art below the feet is kept; more than 2 px is reported per file, so repeated outfit names stay distinct', async () => {
	// the saved outfits' markers (row 5) get a blade hanging `rows` px below the feet line (row 7); it is not the body, so
	// grounding leaves it where it is. Cells then span rows 5 to the blade: the current look (body only) is 1 row tall.
	const blade = async (rows: number) => {
		const p = await project({ size: 16, names: ['Current look', 'Knight', 'Knight'] });
		for (const it of p.manifest.items.slice(1)) {
			const cells = it.layers[0].cells as Record<string, Record<string, string[]>>;
			for (const h of new Set(Object.values(cells).flatMap((v) => Object.values(v).flat())))
				p.images.get(h)!.data.set([1, 1, 1, 255], ((6 + rows) * 16 + 3) * 4);
		}
		return p;
	};
	const small = await blade(1);
	expect([xpOf(small).h, xpOf(small, 'Hero_Knight_Knight').h]).toEqual([4, 12]);
	expect(run(small).warnings).toEqual([]);
	const big = await blade(4);
	expect(xpOf(big, 'Hero_Knight_Knight').h).toBe(24);
	expect(run(big).warnings).toEqual([
		'RPG Maker: Hero_Knight_Knight has 4 px below the feet, so it stands 4 px higher on the map.',
		'RPG Maker: Hero_Knight_Knight_2 has 4 px below the feet, so it stands 4 px higher on the map.'
	]);
});

test('file names are ASCII: accents dropped, other characters replaced, empty names fall back, device names escaped', async () => {
	const names = run(
		await project({
			character: 'José Ñandú',
			names: ['Current look', 'Héroïne straße', '★★', 'nul']
		}),
		'xp'
	).files.map((f) => f.name);
	expect(names).toEqual([
		'Jose_Nandu.png',
		'Jose_Nandu_Heroine_stra_e.png',
		'Jose_Nandu_p2.png',
		'Jose_Nandu_nul.png',
		'README.txt'
	]);
	expect(run(await project({ character: 'CON' }), 'xp').files.map((f) => f.name)).toContain(
		'CON_.png'
	);
});

test('the zip holds only the sheets, README, credits and the editable copy, built from the exported manifest', async () => {
	const p = await project({ size: 32 });
	for (const [engine, sheetName] of [
		['rpgmaker', '$Hero_Knight.png'],
		['rpgmakerxp', 'Hero_Knight.png']
	] as const) {
		const r = await exportFiles(p, { engines: [engine], baked: true });
		expect(r.errors).toEqual([]);
		expect(r.warnings.filter((w) => w.startsWith('RPG Maker'))).toEqual([]);
		const names = r.entries.map((e) => e.name);
		expect(names.filter((n) => !n.startsWith('cells/')).sort()).toEqual(
			[
				sheetName,
				sheetName.replace('Hero_Knight', 'Hero_Knight_Night'),
				sheetName.replace('Hero_Knight', 'Hero_Knight_night_2'),
				'README.txt',
				'project.json'
			].sort()
		);
	}
	const { manifest } = exportManifest(p, { engines: ['rpgmaker'], baked: false });
	expect(reds(sheet(rpgMakerFiles(p, manifest, 'vx').files, '$Hero_Knight.png'), 3, 0)).toEqual([
		11, 200, 13
	]);
	expect((await exportFiles(p, { engines: ['rpgmaker', 'generic'], baked: false })).errors).toEqual(
		['RPG Maker sheets export on their own; choose one format.']
	);
});

test('a view measured on only some frames uses its requested keypoints instead of dropping to frame 0', async () => {
	const measured = gait('south', [0, -0.3, 0, 0.3]);
	measured[2] = [];
	const p = await project({
		keys: { south: { keypoints: gait('south', [0, 0.3, 0, -0.3]), measured } }
	});
	expect(reds(vxOf(p), 3, 0)).toEqual([11, 200, 13]);
});

test('a walk without any keypoints takes its steps from the side view bare-body foot span', async () => {
	// east feet 2, 5, 2, 5 px wide: steps at cells 1 and 3, feet together at 0 and 2, in every row (one walk, one clock)
	const p = await project({ keys: {}, feet: [2, 5, 2, 5] });
	for (const row of [0, 1, 2, 3]) expect(reds(vxOf(p), 3, row)).toEqual([11, 200, 13]);
	expect(reds(xpOf(p), 4, 0)).toEqual([200, 11, 12, 13]);
	// without any signal, the first frame stands in, with a warning
	const flat = await project({ keys: {} });
	expect(reds(vxOf(flat), 3, 0)).toEqual([10, 200, 12]);
	expect(run(flat).warnings).toEqual([
		'RPG Maker: the walk steps could not be detected, so the first walk frame is used as a step. Check the sheet.'
	]);
});

test('a walk whose views do not share one gait phase uses each view own signal, not the side view timing', async () => {
	// not a template: the side row keeps its own steps (cells 1 and 3); the front row has keypoints with steps at 0 and 2
	const p = await project({
		aligned: false,
		feet: [2, 5, 2, 5],
		keys: { south: { keypoints: gait('south', [0.3, 0, -0.3, 0]) } }
	});
	const vx = vxOf(p);
	expect(reds(vx, 3, 2)).toEqual([11, 200, 13]);
	expect(reds(vx, 3, 0)).toEqual([10, 200, 12]);
});

test('the standing column never leaves an empty row when the walk lacks a view and there is no standing view', async () => {
	const p = await project({ standing: false });
	const layer = p.manifest.items[0].layers[0] as unknown as {
		cells: Record<string, Record<string, unknown>>;
	};
	delete layer.cells.walk.north;
	// a second move that has north stands in there
	p.manifest.rig.animations.push({
		id: 'idle',
		cells: 1,
		loop: true,
		frames: playlist(1, 100)
	} as never);
	layer.cells.idle = { north: [(layer.cells.walk.south as string[])[0]] };
	expect(frameAt(vxOf(p), 3, 1, 3)).not.toBeNull();
});

test('without a standing view, the walk feet-together frames fill the standing columns', async () => {
	const p = await project({ keys: {}, feet: [2, 5, 2, 5], standing: false });
	expect(reds(vxOf(p), 3, 0)).toEqual([11, 10, 13]); // step, feet together (cell 0, three quarters after the step), step
	expect(reds(xpOf(p), 4, 0)).toEqual([10, 11, 12, 13]); // feet together, step, passing (cell 2), step
});

test('an outfit that draws the same sheet as an earlier one adds no file; a name with no Latin letters stays unique', async () => {
	const p = await project({ character: '勇者' });
	p.manifest.presets[1].items = { ...p.manifest.presets[0].items }; // "Night" is the current look
	const hash = p.manifest.rig.baseHash.slice(7, 13);
	expect(run(p).files.map((f) => f.name)).toEqual([
		`$character_${hash}.png`,
		`$character_${hash}_night.png`,
		'README.txt'
	]);
});

test('a walk too short for a frame between its steps passes through the standing pose in XP', async () => {
	const p = await project({
		frames: [
			{ cell: 0, ms: 100 },
			{ cell: 1, ms: 100 }
		],
		keys: { south: { keypoints: gait('south', [0.3, -0.3, 0, 0]) } }
	});
	const walk = p.manifest.rig.animations.find((a) => a.id === 'walk')!;
	walk.cells = 2;
	expect(reds(xpOf(p), 4, 0)).toEqual([200, 10, 200, 11]);
});

test('a standing move without a view leaves that row to the walk feet-together pose, not empty', async () => {
	const p = await project({ keys: {}, feet: [2, 5, 2, 5] });
	const layer = p.manifest.items[0].layers[0] as unknown as {
		cells: Record<string, Record<string, unknown>>;
	};
	delete layer.cells.default.north;
	expect(reds(vxOf(p), 3, 3)).toEqual([11, 10, 13]);
	expect(reds(vxOf(p), 3, 0)).toEqual([11, 200, 13]);
});

test('uneven frame times on a walk without any rhythm still report the steps as not detected', async () => {
	const p = await project({
		keys: {},
		frames: [
			{ cell: 0, ms: 100 },
			{ cell: 1, ms: 500 },
			{ cell: 2, ms: 100 },
			{ cell: 3, ms: 100 }
		]
	});
	expect(run(p).warnings).toEqual([
		'RPG Maker: the walk steps could not be detected, so the first walk frame is used as a step. Check the sheet.'
	]);
});

test('only the frames a layout shows size its cells: the XP passing frame does not grow the Standard sheet', async () => {
	const p = await project(); // passing is walk cell 2
	const layer = p.manifest.items[0].layers[0] as unknown as {
		cells: Record<string, Record<string, string[]>>;
	};
	p.images.get(layer.cells.walk.south[2])!.data.set([1, 1, 1, 255], (7 * 8 + 3) * 4); // 1 px below the feet
	expect([vxOf(p).h, xpOf(p).h]).toEqual([4, 8]);
});

test('walk frames that drift off the ground are moved back to the standing feet line, keeping 1 px of natural variation', async () => {
	const p = await project({ size: 16 }); // standing and walk pixels on row 6; steps are walk cells 1 and 3
	const layer = p.manifest.items[0].layers[0] as unknown as {
		cells: Record<string, Record<string, string[]>>;
	};
	const lift = (cell: number, rows: number) => {
		const im = p.images.get(layer.cells.walk.south[cell])!;
		im.data.fill(0);
		im.data.set([10 + cell, 0, 0, 255], ((6 - rows) * 16 + 3) * 4);
	};
	lift(1, 4); // floats 4 px: moved down 3, ending 1 px above the standing feet
	lift(3, 1); // 1 px: left alone
	const row = (col: number) => frameAt(vxOf(p), 3, col, 0)!.y;
	expect([row(0) - row(1), row(2) - row(1)]).toEqual([-1, -1]);
	// a view standing 3 px higher than the front one is lowered onto it, so turning does not hop either; its walk frames, on
	// the ground already, stay there
	const east = p.images.get(layer.cells.default.east[0])!;
	east.data.fill(0);
	east.data.set([200, 0, 0, 255], (3 * 16 + 5) * 4);
	const vx = vxOf(p),
		front = frameAt(vx, 3, 1, 0)!.y;
	expect([
		frameAt(vx, 3, 1, 2)!.y,
		frameAt(vx, 3, 1, 1)!.y,
		frameAt(vx, 3, 0, 2)!.y,
		frameAt(vx, 3, 2, 2)!.y
	]).toEqual([front, front, front, front]);
});
