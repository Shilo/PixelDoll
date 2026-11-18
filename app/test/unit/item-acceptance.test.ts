import { beforeEach, expect, test, vi } from 'vitest';
import type { JobRec } from '../../src/lib/pixellab/queue.ts';
import type { Rig } from '../../src/lib/rig/rig.ts';
import { makeImg } from '../../src/lib/image/png.ts';
import { itemQa, putItem, slotOf, type CellOut } from '../../src/lib/items/items.ts';
import { createSlot } from '../../src/lib/items/slots.ts';
import {
	acceptItem,
	evaluateItem,
	gensOf,
	hasStructuralFailure,
	usdOf,
	type Draft,
	type ItemResult,
	type RigCtx
} from '../../src/lib/items/run.ts';
import { saveItem, type StoredProject } from '../../src/lib/store/project.ts';
import * as db from '../../src/lib/store/db.ts';
import { encodePngBytes } from '../../src/lib/image/pngraw.ts';
import { toChroma } from '../../src/lib/image/chroma.ts';
import { LABELS } from '../../src/lib/rig/poses.ts';
import { cellHash } from '../../src/lib/rig/rig.ts';
import type { Manifest } from '../../src/lib/store/manifest.ts';
import { CURRENT_FORMAT } from '../../src/lib/store/manifest.ts';

const ledger = vi.hoisted(() => ({ records: [] as JobRec[] }));
vi.mock('../../src/lib/pixellab/queue.ts', () => ({
	queue: {
		subscribe: (cb: (s: { jobs: JobRec[] }) => void) => {
			cb({ jobs: ledger.records });
			return () => {};
		}
	}
}));
vi.mock('../../src/lib/store/project.ts', () => ({ saveItem: vi.fn(async () => {}) }));
beforeEach(() => {
	ledger.records.splice(0);
	vi.mocked(saveItem).mockClear();
	vi.restoreAllMocks();
});

const rig: Rig = {
	cell: { w: 8, h: 8 },
	pivot: { x: 4, y: 7 },
	baseItem: 'base',
	baseHash: 'sha256:test',
	directions: [{ id: 'south' }],
	animations: [{ id: 'idle', cells: 1, loop: true, frames: [{ cell: 0, ms: 100 }] }]
};
function fixture() {
	const base = makeImg(8, 8),
		layer = makeImg(8, 8),
		mask = new Uint8Array(64);
	for (const p of [18, 19, 20, 26, 27, 28, 34, 35, 36]) {
		mask[p] = 1;
		layer.data.set([90, 90, 100, 255], p * 4);
	}
	const cell: CellOut = {
		key: 'idle/south/0',
		call: 0,
		base,
		input: base,
		out: layer,
		layer,
		mask,
		area: 9,
		outBand: 0,
		baseBand: 0,
		specks: 0,
		pinholes: 0,
		shifted: false,
		offset: [0, 0],
		stray: 0,
		posed: false,
		keyKept: 1,
		keyOutside: 0
	};
	const draft: Draft = {
		spec: {
			id: 'helmet',
			name: 'Helmet',
			slot: 'head',
			prompt: 'iron helmet',
			key: 'green',
			anims: ['idle'],
			dirs: ['south'],
			method: 'anchor'
		},
		rigId: 'rig',
		calls: [
			{ kind: 'edit', cells: ['idle/south/0'], seed: 1, recId: 'current', old: [], rerolls: 0 }
		],
		log: []
	};
	const ctx = {
		rec: { id: 'rig', manifest: { rig } },
		project: { manifest: { rig }, images: new Map() }
	} as unknown as RigCtx;
	const result: ItemResult = {
		cells: [cell],
		qa: itemQa(rig, slotOf('head'), 'green', [cell], 0),
		g1: new Map(),
		preview: null
	};
	ledger.records.push(record('current', 10, 0));
	return { draft, ctx, result };
}
function record(id: string, gens: number, usd: number): JobRec {
	return {
		id,
		label: id,
		method: 'POST',
		endpoint: '/edit-animation-v2',
		params: {},
		inputs: [],
		requestHash: id,
		state: 'done',
		attempts: 1,
		nextAt: 0,
		createdAt: 1,
		jobs: [],
		gens,
		usd
	};
}

test.each([
	'G1 1 outputs for 2 requested frames',
	'G1 grid 128x64, expected 256x64',
	'G1 output 32x32; G2 keyframe key kept 0.8'
])('malformed complete API batch never writes an accepted partial item: %s', async (why) => {
	const { draft, ctx, result } = fixture();
	expect(result.qa?.qa.status).toBe('pass');
	result.g1.set(1, why);
	await expect(acceptItem(draft, ctx, result)).rejects.toThrow('missing or malformed frames');
	expect(saveItem).not.toHaveBeenCalled();
	expect(draft.acceptedAt).toBeUndefined();
});

test.each([
	'G2 keyframe rest/south/0 key kept 0.8',
	'G3 keyframe rest/south/0 key outside 0.3',
	'G4 keyframe rest/south/0: item missing',
	'D1 keyframe rest/south/0: 20 % gray smudges'
])('complete flagged artwork remains explicitly acceptable: %s', async (why) => {
	const { draft, ctx, result } = fixture();
	result.g1.set(0, why);
	expect(hasStructuralFailure(result)).toBe(false);
	const saved = await acceptItem(draft, ctx, result);
	expect(saveItem).toHaveBeenCalledOnce();
	expect(saved.item.qa?.status).toBe('accepted');
	expect(saved.item.designWarnings).toEqual([why]);
	expect(draft.acceptedAt).toBeDefined();
});

test('ordinary failed cell-art QA remains explicitly acceptable', async () => {
	const { draft, ctx, result } = fixture();
	result.cells[0].shifted = true;
	result.qa = itemQa(rig, slotOf('head'), 'green', result.cells, 0);
	expect(result.qa.qa.status).toBe('fail');
	const saved = await acceptItem(draft, ctx, result);
	expect(saved.item.qa?.status).toBe('accepted');
	expect(saveItem).toHaveBeenCalledOnce();
});

test('draft cost includes mixed-currency retries and fallback history once per ledger record', () => {
	const { draft } = fixture();
	draft.calls[0].old = ['old', 'old', 'current', 'gone'];
	draft.calls.push({
		kind: 'grid',
		cells: [],
		seed: 2,
		recId: 'grid',
		old: ['old', 'usd-retry'],
		rerolls: 2
	});
	ledger.records.push(
		record('old', 10, 0),
		record('grid', 0, 0.08),
		record('usd-retry', 0, 0.04),
		record('unrelated', 99, 99)
	);
	expect(gensOf(draft)).toBe(20);
	expect(usdOf(draft)).toBeCloseTo(0.12);
	const later = ledger.records.map((r) => (r.id === 'grid' ? { ...r, usd: 0.1 } : r));
	expect(usdOf(draft, later)).toBeCloseTo(0.14);
	expect(gensOf(draft, later)).toBe(20);
});

test('missing expected frame coverage blocks saving even without a G1 diagnostic', async () => {
	const { draft, ctx, result } = fixture();
	ctx.rec.manifest.rig = structuredClone(rig);
	ctx.rec.manifest.rig.animations[0].cells = 2;
	await expect(acceptItem(draft, ctx, result)).rejects.toThrow('missing or malformed frames');
	expect(saveItem).not.toHaveBeenCalled();
});

test('accepted keyframe design reasons are retained individually without rewriting clean clip QA', async () => {
	const { draft, ctx, result } = fixture();
	result.g1.set(0, 'G2 keyframe rest/south/0 key kept 0.8; D1 keyframe rest/south/0: gray smudges');
	const saved = await acceptItem(draft, ctx, result);
	expect(saved.item.designWarnings).toEqual([
		'G2 keyframe rest/south/0 key kept 0.8',
		'D1 keyframe rest/south/0: gray smudges'
	]);
	expect(saved.item.qa?.status).toBe('accepted');
	expect(saved.item.qa?.clips?.['idle/south'].status).toBe('pass');
});

test.each([
	'imported-rest',
	'verified-standing',
	'unrigged-standing',
	'removed-custom-slot',
	'missing-off-hand'
])(
	'dressed %s cells survive a design-art warning and retain their real coverage and references',
	async (mode) => {
		const { draft, ctx } = fixture();
		const missingOffHand = mode === 'missing-off-hand';
		const unrigged =
			mode === 'unrigged-standing' || mode === 'removed-custom-slot' || missingOffHand;
		if (mode === 'removed-custom-slot') {
			draft.spec.slotConfig = createSlot('custom_helmet', 'head', 'Custom helmet');
			draft.spec.slot = draft.spec.slotConfig.id;
		}
		if (missingOffHand) {
			draft.spec.slot = 'off_hand';
			draft.spec.slotConfig = new Proxy(slotOf('off_hand'), {});
		}
		const base = makeImg(8, 8);
		for (let y = 2; y < 7; y++)
			for (let x = 2; x < 6; x++) base.data.set([180, 140, 120, 255], (y * 8 + x) * 4);
		const hash = await cellHash(base),
			localRig = structuredClone(rig);
		if (missingOffHand) localRig.directions.push({ id: 'west' });
		const pose = LABELS.map((label) => ({ label, x: 0.5, y: label === 'NECK' ? 0.5 : 0.25 }));
		if (!unrigged) localRig.rest = { south: { image: hash, keypoints: pose } };
		if (mode === 'imported-rest')
			localRig.animations[0].sources = {
				south: {
					route: 'import',
					reference: hash,
					keypoints: [pose],
					motion: 'imported-rest',
					provenance: []
				}
			};
		localRig.animations.push({ ...structuredClone(localRig.animations[0]), id: 'still-alias' });
		const manifest: Manifest = {
			format: CURRENT_FORMAT,
			app: 'test',
			name: 'test',
			rig: localRig,
			materials: [],
			slots: [slotOf('body')],
			presets: [],
			items: [
				{
					id: 'base',
					name: 'Body',
					slot: 'body',
					status: 'accepted',
					mirror: 'generate',
					materials: [],
					prompt: '',
					baseHash: hash,
					provenance: [],
					layers: [{ id: 'main', role: 'fg', z: 10, cells: { idle: { south: [hash] } } }]
				}
			]
		};
		ctx.rec.manifest = manifest;
		manifest.items[0].layers[0].cells!['still-alias'] = { south: [hash] };
		ctx.project = { manifest, images: new Map([[hash, base]]) };
		draft.spec.method = unrigged ? 'anchor' : 'skel';
		if (mode !== 'imported-rest') draft.spec.standing = 'idle';
		draft.spec.anims.push('still-alias');
		draft.spec.prompt = 'crimson helmet';
		draft.calls[0].kind = unrigged ? 'edit' : 'dress';
		draft.calls[0].cells = [unrigged ? 'idle/south/0' : 'rest/south/0'];
		const composite = toChroma(base, 'green');
		for (let y = 0; y < 3; y++)
			for (let x = 2; x < 6; x++)
				composite.data.set(y === 0 ? [95, 90, 85, 255] : [220, 20, 30, 255], (y * 8 + x) * 4);
		ledger.records[0].jobs = [
			{
				id: 'job',
				status: 'completed',
				done: true,
				results: ['0', '1'].map((label) => ({ label, sha: 'design-warning-fixture' }))
			}
		];
		const blob = new Blob([(await encodePngBytes(composite)) as Uint8Array<ArrayBuffer>], {
			type: 'image/png'
		});
		vi.spyOn(db, 'getBlob').mockResolvedValue(blob);
		const result = await evaluateItem(draft, ctx);
		if (!unrigged) expect(result.g1.get(0)).toContain('D1 keyframe');
		expect(hasStructuralFailure(result)).toBe(false);
		expect(result.cells.map((c) => c.key)).toEqual(['idle/south/0', 'still-alias/south/0']);
		expect(result.cells[0].area).toBeGreaterThan(0);
		if (mode === 'removed-custom-slot') {
			expect(ctx.rec.manifest.slots.map((slot) => slot.id)).toEqual(['body']);
			expect(result.preview?.manifest.slots).toContainEqual(draft.spec.slotConfig);
		}
		if (mode === 'removed-custom-slot' || missingOffHand)
			vi.mocked(saveItem).mockImplementationOnce(async (_id, item, _images, slots, check) => {
				check?.(ctx.rec);
				putItem(ctx.rec.manifest, item, slots);
			});
		const saved = await acceptItem(draft, ctx, result);
		if (missingOffHand) {
			const savedSlot = manifest.slots.find((slot) => slot.id === 'off_hand');
			expect(savedSlot?.zOverrides).toContainEqual({ layer: 'fg', dir: 'west', z: 155 });
			expect(result.preview?.manifest.slots).toContainEqual(savedSlot);
		}
		if (!unrigged)
			expect(saved.item.designWarnings?.some((why) => why.startsWith('D1'))).toBe(true);
		expect(saved.item.dressed?.south).toBe(await cellHash(composite));
		if (mode !== 'imported-rest') expect(saved.item.standing).toBe('idle');
		expect(saved.item.layers[0].cells!['still-alias']).toEqual(saved.item.layers[0].cells!.idle);
		expect(draft.calls).toHaveLength(1); // both aliases reuse the one bought standing output
		expect(saveItem).toHaveBeenCalledOnce();
		if (mode === 'removed-custom-slot') {
			expect(manifest.slots).toContainEqual(draft.spec.slotConfig);
			expect(manifest.items).toContainEqual(saved.item);
			expect(saved.item.layers[0].z).toBe(draft.spec.slotConfig!.z);
		}
	}
);

test.each(['missing', 'existing', 'reused-key', 'changed-depth'] as const)(
	'keeping paid artwork handles a category that is %s when the save transaction starts',
	async (state) => {
		const { draft, ctx, result } = fixture();
		const snapshot = createSlot('custom_helmet', 'head', 'Original');
		draft.spec.slot = snapshot.id;
		draft.spec.slotConfig = snapshot;
		ctx.rec.manifest.slots = [structuredClone(snapshot)];
		ctx.rec.manifest.items = [];
		const current = structuredClone(ctx.rec);
		current.manifest.slots =
			state === 'missing'
				? []
				: [
						state === 'reused-key'
							? createSlot(snapshot.id, 'off_hand')
							: {
									...snapshot,
									label: 'Renamed',
									wardrobeHidden: true,
									z: state === 'changed-depth' ? snapshot.z + 1 : snapshot.z
								}
					];
		const before = structuredClone(current);
		vi.mocked(saveItem).mockImplementationOnce(async (_id, item, _images, slots, check) => {
			check?.(current);
			putItem(current.manifest, item, slots);
		});
		if (state === 'reused-key' || state === 'changed-depth') {
			await expect(acceptItem(draft, ctx, result)).rejects.toThrow(
				state === 'reused-key' ? 'different behavior' : 'category depth changed'
			);
			expect(current).toEqual(before);
			expect(draft.acceptedAt).toBeUndefined();
		} else {
			const saved = await acceptItem(draft, ctx, result);
			expect(current.manifest.items).toEqual([saved.item]);
			expect(current.manifest.slots).toEqual(
				state === 'missing' ? [snapshot] : before.manifest.slots
			);
			expect(saved.item.layers[0].z).toBe(snapshot.z);
		}
	}
);

test('an item saved after its body gained a move takes the new body hash; a body whose cells changed refuses it', async () => {
	const { draft, ctx, result } = fixture();
	const record = (hash: string, cells: Record<string, { south: string[] }>) =>
		({
			id: 'rig',
			savedAt: '',
			manifest: {
				rig: {
					...rig,
					baseHash: hash,
					animations: Object.keys(cells).map((id) => ({
						id,
						cells: 1,
						loop: true,
						frames: [{ cell: 0, ms: 100 }]
					}))
				},
				items: [{ id: 'base', layers: [{ cells }] }]
			}
		}) as unknown as StoredProject;
	ctx.rec = record('sha256:test', { idle: { south: ['sha256:idle'] } });
	// "Add idle + walk" published walk between reading ctx and the save transaction: the idle cells the item fits are untouched
	let current = record('sha256:with-walk', {
		idle: { south: ['sha256:idle'] },
		walk: { south: ['sha256:walk'] }
	});
	vi.mocked(saveItem).mockImplementationOnce(async (_id, _item, _images, _slots, check) =>
		check?.(current)
	);
	const { item } = await acceptItem(draft, ctx, result);
	expect(item.baseHash).toBe('sha256:with-walk'); // still posable and offered "Make for Walk", not "Made for another body"
	// a replaced idle: the item was drawn on frames the body no longer has
	current = record('sha256:new-idle', { idle: { south: ['sha256:idle-2'] } });
	vi.mocked(saveItem).mockImplementationOnce(async (_id, _item, _images, _slots, check) =>
		check?.(current)
	);
	await expect(acceptItem(draft, ctx, result)).rejects.toThrow(
		"the character's body changed while this item was being made"
	);
});
