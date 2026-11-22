import { describe, expect, test } from 'vitest';
import {
	characterCost,
	characterOf,
	newCharacter,
	pricedTier,
	savingTips,
	seedInputs,
	spentUsd,
	usdOf,
	type CostInputs
} from '../../src/studio/costEstimate.ts';
import { estimate, moveEstimate } from '../../src/studio/movePricing.ts';
import { LABELS } from '../../src/lib/rig/poses.ts';
import { poseGensFor } from '../../src/lib/rig/clips.ts';
import { DEFAULT_MOVE, type DirectionName, type RigDirection } from '../../src/lib/rig/rig.ts';
import type { Item, Manifest, Provenance, Sha256 } from '../../src/lib/store/manifest.ts';
import { CURRENT_FORMAT } from '../../src/lib/store/manifest.ts';

const EIGHT: RigDirection[] = [
	{ id: 'south' },
	{ id: 'south-east' },
	{ id: 'east' },
	{ id: 'north-east' },
	{ id: 'north' },
	{ id: 'north-west', mirrorOf: 'north-east' },
	{ id: 'west', mirrorOf: 'east' },
	{ id: 'south-west', mirrorOf: 'south-east' }
];
const FOUR: RigDirection[] = [{ id: 'south' }, { id: 'east' }, { id: 'north' }, { id: 'west' }];
const hash = (n: number) => `sha256:${String(n).padStart(64, '0')}` as Sha256;
const baseHash = hash(1);
const joints = () => LABELS.map((label, i) => ({ label, x: 0.5, y: (i + 1) / 20 }));
const call = (
	endpoint: string,
	generations: number,
	extra: Partial<Provenance> = {}
): Provenance => ({
	endpoint,
	params: {},
	seed: 1,
	requestHash: hash(99),
	usage: { generations },
	createdAt: '2026-11-22T00:00:00Z',
	produced: [],
	...extra
});
interface MoveDef {
	id: string;
	cells: number;
	route?: 'skeleton-v3' | 'pixminimax' | 'v3' | 'import';
	motion?: string;
}
interface ItemDef {
	id: string;
	slot?: string;
	route?: Item['route'];
	extra?: Partial<Item>;
}
function manifest(o: {
	cell: number;
	directions: RigDirection[];
	moves?: MoveDef[];
	items?: ItemDef[];
	base?: Provenance[];
}): Manifest {
	const drawn = o.directions.filter((d) => !d.mirrorOf).map((d) => d.id);
	const rest = Object.fromEntries(
		drawn.map((d, i) => [d, { image: hash(10 + i), keypoints: joints() }])
	);
	const move = ({ id, cells, route = 'skeleton-v3', motion }: MoveDef) => ({
		id,
		cells,
		loop: true,
		frames: Array.from({ length: cells }, (_, cell) => ({ cell, ms: 100 })),
		sources: Object.fromEntries(
			drawn.map((d) => [d, { route, reference: hash(2), motion, provenance: [] }])
		)
	});
	const moves = o.moves ?? [];
	const cells = Object.fromEntries(
		[{ id: DEFAULT_MOVE, cells: 1 }, ...moves].map((a) => [
			a.id,
			Object.fromEntries(
				drawn.map((d, i) => [d, Array.from({ length: a.cells }, (_, f) => hash(10 + i + f * 100))])
			)
		])
	);
	const item = ({ id, slot = 'torso_inner', route = 'skeleton-pose', extra }: ItemDef): Item => ({
		id,
		name: id,
		slot,
		status: 'accepted',
		mirror: 'flip',
		materials: [],
		prompt: id,
		layers: [{ id: 'main', role: 'fg', z: 100, cells: {} }],
		baseHash,
		route,
		key: 'green',
		standing: DEFAULT_MOVE,
		dressed: Object.fromEntries(drawn.map((d) => [d, hash(50)])),
		coverage: [],
		provenance: [call('/edit-animation-v2', 10)],
		...extra
	});
	return {
		format: CURRENT_FORMAT,
		name: 'Test',
		app: 'test',
		rig: {
			cell: { w: o.cell, h: o.cell },
			pivot: { x: o.cell / 2, y: o.cell },
			directions: o.directions,
			animations: [
				{ id: DEFAULT_MOVE, cells: 1, loop: true, frames: [{ cell: 0, ms: 100 }] },
				...moves.map(move)
			],
			baseItem: 'base',
			baseHash,
			rest
		},
		materials: [],
		slots: [
			{ id: 'body', class: 'base', z: 10 },
			{ id: 'torso_inner', class: 'worn', z: 100 },
			{ id: 'main_hand', class: 'held', z: 200 }
		],
		items: [
			{
				id: 'base',
				name: 'base',
				slot: 'body',
				status: 'accepted',
				mirror: 'flip',
				materials: [],
				prompt: '',
				layers: [{ id: 'main', role: 'fg', z: 10, cells }],
				baseHash,
				provenance: o.base ?? [
					call('/create-character-v3', 2.25, { params: { image_size: { width: o.cell } } })
				]
			},
			...(o.items ?? []).map(item)
		],
		presets: []
	};
}
const defaults = { moveModel: 'skeleton-v3' as const, stateModel: 'pro' as const };
const of = (m: Manifest, id = 'rig-test') => characterOf(id, m, defaults);
const firstPass = (inputs: CostInputs) => ({ ...inputs, retries: 0 });

describe('cost estimate', () => {
	test('reproduces the v4 Adventurer first pass and matches the Studio quotes', () => {
		const names = ['idle', 'slash', 'cast', 'hurt', 'ride', 'death'];
		const m = manifest({
			cell: 64,
			directions: EIGHT,
			moves: names.map((id) => ({ id, cells: 8, motion: `authored:${id}` })),
			items: [
				...Array.from({ length: 8 }, (_, i) => ({ id: `worn${i}` })),
				{ id: 'sword', slot: 'main_hand' },
				{ id: 'staff', slot: 'main_hand' }
			]
		});
		const c = of(m);
		const inputs = {
			...firstPass(seedInputs(c)),
			coverage: { 8: { all: false, except: [1, 2, 3] }, 9: { all: false, except: [1, 3, 4] } }
		};
		const r = characterCost(c, inputs);
		expect(r.setup.gens).toBeCloseTo(estimate({ directions: EIGHT, size: 64 }).maxGens);
		expect(r.setup.gens).toBeCloseTo(2.75);
		expect(r.moves.gens).toBeCloseTo(
			names.reduce(
				(n, id) =>
					n +
					moveEstimate(m, {
						id,
						action: id,
						frames: 8,
						animation: { model: 'skeleton-v3', frameCount: 8 },
						items: []
					}).body,
				0
			)
		);
		expect(r.moves.gens).toBeCloseTo(114);
		expect(r.item(0).gens).toBeCloseTo(10 + 6 * 5 * 3);
		expect(r.item(8).gens).toBeCloseTo(20 + 3 * 5 * 3);
		expect(r.total).toBeCloseTo(1046.75);
		// Two extra attempts on every paid step.
		expect(characterCost(c, { ...inputs, retries: 2 }).total).toBeCloseTo(3140.25);
		expect(usdOf(3140.25, 2)).toBeCloseTo(15.0732);
		expect(usdOf(3140.25, 2, 'low')).toBeCloseTo(13.8171);
	});

	test('prices pose batches at 3, 12, 15 and 16 frames like itemPoseGens', () => {
		const at = (cells: number) => {
			const m = manifest({
				cell: 64,
				directions: FOUR,
				moves: [{ id: 'slash', cells, motion: 'authored:slash' }],
				items: [{ id: 'coat' }]
			});
			const r = characterCost(of(m), firstPass(seedInputs(of(m))));
			return r.item(0).gens - 10;
		};
		expect(at(3)).toBeCloseTo(4 * 2);
		expect(at(12)).toBeCloseTo(4 * 3);
		expect(at(15)).toBeCloseTo(4 * 4);
		expect(at(16)).toBeCloseTo(4 * 6);
	});

	test('prices native moves and held padding by frame size', () => {
		const m = manifest({
			cell: 128,
			directions: FOUR,
			moves: [{ id: 'attack', cells: 12, route: 'pixminimax', motion: 'pixminimax:attack' }],
			items: [{ id: 'sword', slot: 'main_hand' }]
		});
		const r = characterCost(of(m), firstPass(seedInputs(of(m))));
		expect(r.moves.gens).toBeCloseTo(4 * (2 + 1.2));
		// 128 px + 2 × 16 px pad = 160 px: four views in one 15-gen call, then four pose calls.
		expect(r.item(0).gens).toBeCloseTo(15 + 4 * 3);
		const wide = manifest({
			cell: 256,
			directions: FOUR,
			items: [{ id: 'sword', slot: 'main_hand' }]
		});
		expect(characterCost(of(wide), firstPass(seedInputs(of(wide)))).items.gens).toBeCloseTo(25);
	});

	test('prices imported setup as registration plus one joint check per distinct standing view', () => {
		const m = manifest({ cell: 92, directions: FOUR, base: [call('/estimate-skeleton', 0.1)] });
		const c = of(m);
		const r = characterCost(c, firstPass(seedInputs(c)));
		expect(r.setup.gens).toBeCloseTo(0.65);
		expect(r.toGo).toBe(0);
		// Four directions mirror one: three drawn views.
		expect(
			characterCost(c, {
				...firstPass(seedInputs(c)),
				directions: [
					{ id: 'south' },
					{ id: 'east' },
					{ id: 'north' },
					{ id: 'west', mirrorOf: 'east' }
				]
			}).setup.gens
		).toBeCloseTo(0.55);
	});

	test('fits every item to every added move, with nothing to go for saved work', () => {
		const m = manifest({
			cell: 92,
			directions: FOUR,
			items: [{ id: 'a' }, { id: 'b' }, { id: 'c' }]
		});
		const c = of(m);
		const seed = firstPass(seedInputs(c));
		expect(characterCost(c, seed).toGo).toBe(0);
		// The first added move is the Moves sheet's first suggestion: authored Idle, four frames.
		const one = characterCost(c, { ...seed, moves: 1 });
		expect(one.move(0)).toMatchObject({ id: 'idle', frames: 4, added: true });
		expect(one.moves.toGo).toBeCloseTo(4 * (3 + 0.4));
		expect(one.items.toGo).toBeCloseTo(3 * 4 * 3);
		const six = characterCost(c, { ...seed, moves: 6 });
		expect(six.items.toGo).toBeCloseTo(
			3 * [0, 1, 2, 3, 4, 5].reduce((n, i) => n + 4 * poseGensFor(six.move(i).frames), 0)
		);
		expect(six.item(1).covered).toBe(6);
		// Copies beyond the suggestions repeat one typical move.
		const many = characterCost(c, { ...seed, moves: 20 });
		expect(many.move(19).id).toBe('cost-move');
	});

	test('copied and bundled art is free, excluded from spending and remade for new moves', () => {
		const m = manifest({
			cell: 128,
			directions: FOUR,
			base: [call('/estimate-skeleton', 0.1), call('/animate-pixminimax', 1)],
			items: [
				{ id: 'own' },
				{
					id: 'copy',
					route: undefined,
					extra: {
						copiedFrom: { id: 'rig-other', name: 'Other' },
						dressed: undefined,
						provenance: [call('/edit-animation-v2', 10)]
					}
				}
			]
		});
		const c = of(m);
		expect(c.spent.generations).toBeCloseTo(0.1 + 1 + 10);
		const seed = firstPass(seedInputs(c));
		expect(characterCost(c, seed).item(1).gens).toBe(0);
		const next = characterCost(c, { ...seed, moves: 1 });
		expect(next.item(1)).toMatchObject({ remake: true, inherited: true });
		expect(next.item(1).toGo).toBeCloseTo(10 + 4 * 3);
		expect(next.item(0)).toMatchObject({ remake: false });
		expect(next.item(0).toGo).toBeCloseTo(4 * 3);

		const demoCopy = manifest({
			cell: 64,
			directions: FOUR,
			base: [call('/create-character-v3', 0, { requestHash: '' as Sha256 })],
			items: [
				{
					id: 'vest',
					extra: { provenance: [call('/edit-animation-v2', 10, { requestHash: '' as Sha256 })] }
				}
			]
		});
		const copy = of(demoCopy);
		expect(copy.kind).toBe('copy');
		expect(copy.spent.generations).toBe(0);
		expect(characterCost(copy, firstPass(seedInputs(copy))).total).toBe(0);
		const demo = characterOf('fixture:s2', demoCopy, defaults);
		expect(characterCost(demo, { ...firstPass(seedInputs(demo)), moves: 3, items: 4 }).total).toBe(
			0
		);
	});

	test('records spending with re-rolls and USD, at the tier list rate', () => {
		const m = manifest({
			cell: 64,
			directions: FOUR,
			items: [
				{
					id: 'a',
					extra: {
						provenance: [
							call('/edit-animation-v2', 10),
							call('/edit-animation-v2', 10, { replaced: true }),
							call('/inpaint-v3', 0, { usage: { usd: 0.08 } })
						]
					}
				}
			]
		});
		const spent = of(m).spent;
		expect(spent.generations).toBeCloseTo(22.25);
		expect(spent.replaced).toBe(1);
		expect(spentUsd(spent, 2)).toBeCloseTo((22.25 * 24) / 5000 + 0.08);
		expect([pricedTier(0), pricedTier(null), pricedTier(4), pricedTier(3)]).toEqual([1, 1, 1, 3]);
	});

	test('prices a new character from creation defaults', () => {
		const c = newCharacter(
			{ body: 64, frame: 80, model: 'v3', directions: EIGHT },
			{ moveModel: 'skeleton-v3', stateModel: 'pro' }
		);
		const seed = seedInputs(c);
		expect(seed).toMatchObject({ moves: 0, items: 0, states: 0, retries: 2 });
		const r = characterCost(c, { ...firstPass(seed), moves: 1, states: 1 });
		expect(r.setup.toGo).toBeCloseTo(estimate({ directions: EIGHT, size: 64 }).maxGens);
		expect(r.move(0)).toMatchObject({ id: 'idle', frames: 4 });
		expect(r.moves.gens).toBeCloseTo(5 * 3.4);
		expect(r.states.gens).toBeGreaterThan(0);
		expect(r.toGo).toBeCloseTo(r.total);
	});

	test('offers quality-safe savings that apply the change', () => {
		const m = manifest({
			cell: 64,
			directions: FOUR,
			moves: [
				{ id: 'slash', cells: 16, motion: 'authored:slash' },
				{ id: 'cast', cells: 8, motion: 'authored:cast' }
			],
			items: [{ id: 'coat' }, { id: 'sword', slot: 'main_hand' }]
		});
		const c = of(m);
		const inputs = seedInputs(c);
		const tips = savingTips(c, inputs, 2);
		expect(tips.length).toBeLessThanOrEqual(2);
		expect(tips.every((tip) => tip.saving > 0)).toBe(true);
		const kinds = tips.map((tip) => tip.kind);
		expect(kinds).toContain('mirror');
		const all = [
			...tips,
			...savingTips(
				c,
				{
					...inputs,
					directions: FOUR.map((d) =>
						d.id === 'west' ? { id: 'west' as DirectionName, mirrorOf: 'east' as DirectionName } : d
					)
				},
				2
			)
		];
		const trim = all.find((tip) => tip.kind === 'trim');
		expect(trim).toMatchObject({ move: 0 });
		if (trim?.kind === 'trim') expect(trim.frames).toBeGreaterThanOrEqual(8);
		for (const tip of tips)
			expect(characterCost(c, tip.inputs).total).toBeLessThan(characterCost(c, inputs).total);
	});
});
