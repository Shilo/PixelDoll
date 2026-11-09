// Offline fixture for rendered Unity checks: tucked and body-cut variants, depth overrides, an oversize layer, a mirrored view,
// linked palette variants and fractional pixels per unit. Expected frames come from the Studio's own compose path, so Unity
// must reproduce exactly what the preview shows. No PixelLab calls.
import assert from 'node:assert/strict';
import { makeImg } from '../../src/lib/image/png.ts';
import { encodePngBytes } from '../../src/lib/image/pngraw.ts';
import { cellHash, baseHashOf } from '../../src/lib/rig/rig.ts';
import { bakedFrame, composeCell } from '../../src/lib/compose/compose.ts';
import { recolor } from '../../src/lib/dress/dress.ts';
import { exportZip } from '../../src/lib/export/export.ts';
import { unzip } from '../../src/lib/store/zip.ts';

const hex = (h) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16)).concat(255);
const rect = (im, x0, y0, x1, y1, color) => {
	for (let y = Math.max(0, y0); y <= Math.min(im.h - 1, y1); y++)
		for (let x = Math.max(0, x0); x <= Math.min(im.w - 1, x1); x++)
			im.data.set(hex(color), (y * im.w + x) * 4);
};
const RAMPS = {
	skin: ['#c08060', '#804020'],
	hair_color: ['#f0d000', '#a08000'],
	cape_color: ['#a02040', '#601020']
};
const STORED = ['south', 'north', 'east'];
// Every item moves per cell and differs per stored view (asymmetric, so a wrong mirror or frame shows in pixels).
const DRAW = {
	base(im, d, c) {
		rect(im, 10, 8, 21, 29, RAMPS.skin[0]);
		rect(im, d === 1 ? 20 : 10, 8, d === 1 ? 21 : 11, 29, RAMPS.skin[1]);
		if (d === 2) rect(im, 22, 10, 22, 11, '#e0e0e0');
		rect(im, 12 + 3 * c, 15, 12 + 3 * c, 16, '#101010');
	},
	hair(im, d, c) {
		// Wider than both hats, so tucking removes visible side strands above each brim.
		rect(im, 4, 3 + c, 27, 12 + c, RAMPS.hair_color[0]);
		rect(im, 4, 13 + c, 6, 20 + c, RAMPS.hair_color[1]);
		rect(im, 25 - d, 13, 27, 18, RAMPS.hair_color[1]);
	},
	// 48x48 layer, pivot (24, 38): rig (x, y) = layer (x - 8, y - 8). The plume leaves the 32 px rig cell.
	hat(im, d, c) {
		rect(im, 16, 10, 31, 17, '#5060a0');
		rect(im, 36 + c, 2, 40 + c, 12, '#e06000');
		rect(im, 17 + 4 * d, 12, 18 + 4 * d, 13, '#ffffff');
	},
	hat_small(im, d, c) {
		rect(im, 9, 1, 22, 6, '#40a040');
		rect(im, 10 + c + d, 2, 11 + c + d, 3, '#103010');
	},
	cape_fg(im, d, c) {
		rect(im, 6, 7, 25, 24, RAMPS.cape_color[0]);
		rect(im, 6, 18 + c, 25, 18 + c, RAMPS.cape_color[1]);
		rect(im, 7 + 5 * d, 9, 8 + 5 * d, 10, '#f0f0f0');
	},
	cape_bg(im, d, c) {
		rect(im, 4, 10, 27, 28, '#303030');
		rect(im, 4 + c, 27, 5 + c + d, 28, '#707070');
	},
	boots(im, d, c) {
		rect(im, 9, 26, 22, 29, '#402010');
		rect(im, 10 + 2 * c + d, 27, 11 + 2 * c + d, 27, '#c0c0c0');
	}
};

export async function renderFixture() {
	const images = new Map();
	const animations = [
		{
			id: 'walk',
			cells: 3,
			loop: true,
			frames: [
				{ cell: 0, ms: 100 },
				{ cell: 1, ms: 150 },
				{ cell: 2, ms: 100 }
			]
		},
		{ id: 'idle', cells: 1, loop: true, frames: [{ cell: 0, ms: 200 }] }
	];
	const rig = {
		cell: { w: 32, h: 32 },
		pivot: { x: 16, y: 30 },
		baseItem: 'base',
		baseHash: '',
		directions: [
			{ id: 'south' },
			{ id: 'north' },
			{ id: 'east' },
			{ id: 'west', mirrorOf: 'east' }
		],
		animations
	};
	async function cells(draw, size) {
		const out = {};
		for (const a of animations) {
			out[a.id] = {};
			for (const [d, dir] of STORED.entries())
				out[a.id][dir] = await Promise.all(
					Array.from({ length: a.cells }, async (_, c) => {
						const im = makeImg(size, size);
						draw(im, d, c);
						const h = await cellHash(im);
						images.set(h, im);
						return h;
					})
				);
		}
		return out;
	}
	const baseCells = await cells(DRAW.base, 32);
	rig.baseHash = await baseHashOf(
		rig,
		Object.fromEntries(
			animations.flatMap((a) =>
				STORED.flatMap((dir) => baseCells[a.id][dir].map((h, i) => [`${a.id}/${dir}/${i}`, h]))
			)
		)
	);
	// Body pixels each cover hides while worn (Item.baseCut, rig-cell indices), in every stored view and cell.
	const cut = (pixels) =>
		Object.fromEntries(
			animations.map((a) => [
				a.id,
				Object.fromEntries(
					STORED.map((dir) => [dir, Array.from({ length: a.cells }, () => pixels)])
				)
			])
		);
	const row = (x0, x1, y) => Array.from({ length: x1 - x0 + 1 }, (_, i) => y * 32 + x0 + i);
	const layer = (id, role, z, layerCells, frame) => ({
		id,
		role,
		z,
		cells: layerCells,
		...(frame ? { cell: { w: 48, h: 48 }, pivot: { x: 24, y: 38 } } : {})
	});
	const item = (id, slot, layers, extra = {}) => ({
		id,
		name: id,
		slot,
		status: 'accepted',
		baseHash: rig.baseHash,
		mirror: 'flip',
		materials: [],
		prompt: '',
		provenance: [],
		layers,
		...extra
	});
	const manifest = {
		format: 'pixeldoll/2',
		name: 'Unity render review',
		app: 'review',
		rig,
		slots: [
			{ id: 'body', z: 10, class: 'base', required: true },
			{
				id: 'back',
				z: 90,
				class: 'worn',
				// Facing away, the cape front goes behind the body; one walking frame lifts it above the hat.
				zOverrides: [
					{ layer: 'fg', z: 5, dir: 'north' },
					{ layer: 'fg', z: 200, anim: 'walk', dir: 'south', cell: 1 }
				]
			},
			{ id: 'feet', z: 50, class: 'worn' },
			{ id: 'hair', z: 110, class: 'rigid' },
			{ id: 'head', z: 130, class: 'rigid', clips: ['hair'] }
		],
		materials: [
			{
				id: 'skin',
				owner: 'base',
				label: 'Skin',
				ramp: RAMPS.skin,
				defaultVariant: 'tan',
				variants: { tan: ['#a06040', '#603010'], pale: ['#f0d0c0', '#c0a090'] }
			},
			{
				id: 'hair_color',
				owner: 'hair',
				label: 'Hair',
				ramp: RAMPS.hair_color,
				variants: { red: ['#e02000', '#901000'], black: ['#202020', '#000000'] }
			},
			{
				id: 'cape_color',
				owner: 'cape',
				label: 'Cape',
				ramp: RAMPS.cape_color,
				linkTo: 'hair_color',
				variants: { red: ['#ff4060', '#b02030'], black: ['#404050', '#202030'] }
			}
		],
		items: [
			item('base', 'body', [layer('main', 'fg', 10, baseCells)], { materials: ['skin'] }),
			item(
				'cape',
				'back',
				[
					layer('fg', 'fg', 90, await cells(DRAW.cape_fg, 32)),
					layer('bg', 'bg', 4, await cells(DRAW.cape_bg, 32))
				],
				{ materials: ['cape_color'], baseCut: cut(row(10, 12, 25)) }
			),
			item('boots', 'feet', [layer('main', 'fg', 50, await cells(DRAW.boots, 32))], {
				baseCut: cut(row(14, 17, 25))
			}),
			item('hair', 'hair', [layer('main', 'fg', 110, await cells(DRAW.hair, 32))], {
				materials: ['hair_color']
			}),
			item('hat_small', 'head', [layer('main', 'fg', 130, await cells(DRAW.hat_small, 32))]),
			item('hat', 'head', [layer('main', 'fg', 130, await cells(DRAW.hat, 48), true)])
		],
		presets: [
			{
				id: 'current',
				name: 'Current',
				items: { body: 'base', back: 'cape', feet: 'boots', hair: 'hair', head: 'hat' },
				variants: {}
			}
		]
	};
	const project = { manifest, images };
	const cases = [
		// Tucked hair under the oversize hat, a two-cover body cut, depth overrides and the default skin colorway.
		{
			id: 'outfit',
			items: { back: 'cape', feet: 'boots', hair: 'hair', head: 'hat' },
			variants: {}
		},
		// Linked palette (the cape follows the hair), a non-default skin and hair tucked under the alternate hat.
		{
			id: 'recolor',
			items: { back: 'cape', feet: 'boots', hair: 'hair', head: 'hat_small' },
			variants: { skin: 'pale', hair_color: 'red' }
		},
		{
			id: 'bare',
			items: { back: null, feet: null, hair: 'hair', head: null },
			variants: { hair_color: 'black' }
		},
		{ id: 'cape', items: { back: 'cape', feet: null, hair: 'hair', head: null }, variants: {} }
	];
	const frame = bakedFrame(manifest);
	const compose = (p, c, a, dir, cell) =>
		composeCell(recolor(p, c.variants), { body: 'base', ...c.items }, a, dir, cell, frame);
	const expected = new Map();
	for (const c of cases)
		for (const a of animations)
			for (const { id: dir } of rig.directions)
				for (let cell = 0; cell < a.cells; cell++)
					expected.set(
						`${c.id}/${a.id}_${dir}_${cell}.png`,
						await encodePngBytes(compose(project, c, a.id, dir, cell))
					);
	// Negative controls: each feature ignored gives a wrong composite. Unity must match none of the frames where it differs,
	// so a render comparison that cannot tell these apart fails instead of passing vacuously.
	const without = (edit) => {
		const m = structuredClone(manifest);
		edit(m);
		return { manifest: m, images };
	};
	const controls = new Map();
	for (const [control, wrong, changeCase = (c) => c] of [
		['no-depth-overrides', without((m) => m.slots.forEach((s) => delete s.zOverrides))],
		['no-tucking', without((m) => m.slots.forEach((s) => delete s.clips))],
		['no-body-cuts', without((m) => m.items.forEach((it) => delete it.baseCut))],
		// Drops the case's colorway selection; each material's defaultVariant still applies.
		['no-colorway-selection', project, (c) => ({ ...c, variants: {} })]
	]) {
		let count = 0;
		for (const c of cases)
			for (const a of animations)
				for (const { id: dir } of rig.directions)
					for (let cell = 0; cell < a.cells; cell++) {
						const got = compose(wrong, changeCase(c), a.id, dir, cell).data;
						const want = compose(project, c, a.id, dir, cell).data;
						if (
							got.every(
								(v, i) => v === want[i] || (!got[i - (i % 4) + 3] && !want[i - (i % 4) + 3])
							)
						)
							continue;
						count++;
						controls.set(
							`${control}/${c.id}/${a.id}_${dir}_${cell}.png`,
							await encodePngBytes({ w: frame.w, h: frame.h, data: got })
						);
					}
		assert(count > 0, `Render fixture is not sensitive to ${control}.`);
	}
	const archives = [];
	for (const [label, name, pixelsPerUnit] of [
		['RenderNative', 'Unity render review', undefined],
		// Non-dyadic fraction: sprite vertices and the camera sit at inexact world coordinates.
		['RenderFractional', 'Unity render fractional', 23.7]
	]) {
		const result = await exportZip(
			{ manifest: { ...structuredClone(manifest), name }, images },
			{ engines: ['unity'], baked: false, pixelsPerUnit, exportedAt: '2026-11-09T00:00:00.000Z' }
		);
		assert.deepEqual(result.errors, []);
		const files = await unzip(result.zip);
		const json = JSON.parse(new TextDecoder().decode(files.get('unity/pixeldoll_unity.json')));
		assert.deepEqual(
			json.items.filter((it) => it.variantOf).map((it) => [it.id, it.underAll.join('+')]),
			[
				['hair~hat_small', 'hat_small'],
				['hair~hat', 'hat'],
				['base~cape', 'cape'],
				['base~boots', 'boots'],
				['base~boots~cape', 'boots+cape']
			]
		);
		assert.equal(json.ppu, pixelsPerUnit ?? 32);
		archives.push({ label, zip: result.zip });
	}
	return {
		archives,
		expected,
		controls,
		plan: {
			controls: [...new Set([...controls.keys()].map((k) => k.split('/')[0]))],
			frameW: frame.w,
			frameH: frame.h,
			pivotX: frame.x,
			pivotY: frame.y,
			preset: 'current',
			cases: cases.map((c) => ({
				id: c.id,
				items: Object.entries(c.items).map(([slot, item]) => ({ slot, item: item ?? '' })),
				variants: Object.entries(c.variants).map(([id, variant]) => ({ id, variant }))
			}))
		}
	};
}
