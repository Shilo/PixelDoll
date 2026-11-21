import { afterEach, beforeEach, expect, test, vi } from 'vitest';
import type { StoredProject } from '../../src/lib/store/project.ts';
import type { Keypoint } from '../../src/lib/rig/rig.ts';
import type { Req } from '../../src/lib/pixellab/routes.ts';

const state = vi.hoisted(() => ({
	projects: new Map<string, StoredProject>(),
	blobs: new Map<string, Blob>(),
	requests: [] as Req[],
	estimate: [] as Keypoint[],
	output: '',
	empty: '',
	first: 'valid',
	rawCount: 0
}));
vi.mock('../../src/lib/store/db.ts', () => ({
	get: async (_store: string, id: string) => structuredClone(state.projects.get(id)),
	getBlob: async (id: string) => state.blobs.get(id),
	put: async (store: string, id: string, value: unknown) => {
		if (store === 'blobs') state.blobs.set(id, value as Blob);
		else state.projects.set(id, structuredClone(value as StoredProject));
	},
	update: async (
		_store: string,
		id: string,
		update: (record: StoredProject | undefined) => StoredProject
	) => {
		state.projects.set(id, structuredClone(update(structuredClone(state.projects.get(id)))));
	},
	updateCharacter: async (
		id: string,
		images: Map<string, Blob>,
		update: (record: StoredProject | undefined) => StoredProject,
		stored?: { keys: Iterable<string>; missing: (key: string) => Error }
	) => {
		for (const key of stored?.keys ?? []) if (!state.blobs.has(key)) throw stored!.missing(key);
		const next = update(structuredClone(state.projects.get(id)));
		for (const [hash, image] of images) state.blobs.set(hash, image);
		state.projects.set(id, structuredClone(next));
	}
}));
vi.mock('../../src/lib/pixellab/queue.ts', () => ({
	live: () => false,
	queue: {
		subscribe: (fn: (snapshot: { jobs: unknown[] }) => void) => {
			fn({ jobs: [] });
			return () => {};
		},
		enqueue: async (request: Req) => {
			state.requests.push(structuredClone(request));
			const raw = request.path === '/animate-with-skeleton-v3';
			if (raw) state.rawCount++;
			const count = raw && state.rawCount === 1 && state.first === 'wrong-count' ? 3 : 4;
			const sha =
				raw && state.rawCount === 1 && state.first === 'empty' ? state.empty : state.output;
			return {
				id: `offline-${state.requests.length}`,
				state: 'done',
				endpoint: request.path,
				params: request.body,
				requestHash: 'a'.repeat(64),
				createdAt: 0,
				gens: 0,
				usd: 0,
				response: request.path === '/estimate-skeleton' ? { keypoints: state.estimate } : {},
				jobs: raw
					? [{ results: Array.from({ length: count }, (_, i) => ({ label: `${i}`, sha })) }]
					: []
			};
		}
	}
}));

import { addMove, resolveMoveCandidate, reviewItemMove } from '../../src/studio/create.ts';
import { moveCandidateInput } from '../../src/studio/replaceMove.ts';
import { equipmentFixture, bodyOnly } from './equipment-fixture.ts';
import { decodePng, makeImg, type Img } from '../../src/lib/image/png.ts';
import { encodePngBytes } from '../../src/lib/image/pngraw.ts';
import { cellHash } from '../../src/lib/rig/rig.ts';
import { LABELS } from '../../src/lib/rig/poses.ts';

const points = (x = 0.5): Keypoint[] => LABELS.map((label) => ({ label, x, y: 0.5 }));
const image = (shift = 0, purple = false, hands = false) => {
	const im = makeImg(64, 64),
		color = purple ? [140, 20, 220, 255] : [180, 120, 90, 255];
	for (let y = 12 + shift; y < 55 + shift; y++)
		for (let x = 25; x < 35; x++) im.data.set(color, (y * 64 + x) * 4);
	if (hands)
		for (const x0 of [17, 39])
			for (let y = 28; y < 32; y++)
				for (let x = x0; x < x0 + 4; x++) im.data.set(color, (y * 64 + x) * 4);
	return im;
};
async function store(im: Img) {
	const hash = await cellHash(im);
	state.blobs.set(
		hash.slice(7),
		new Blob([(await encodePngBytes(im)) as Uint8Array<ArrayBuffer>], { type: 'image/png' })
	);
	return hash;
}
beforeEach(async () => {
	vi.stubGlobal(
		'fetch',
		vi.fn(() => {
			throw new Error('Network is forbidden in quality-policy tests');
		})
	);
	state.projects.clear();
	state.blobs.clear();
	state.requests = [];
	state.estimate = points();
	state.first = 'valid';
	state.rawCount = 0;
	const p = bodyOnly(await equipmentFixture()),
		m = p.manifest,
		hash = await store(image());
	state.output = hash.slice(7);
	state.empty = (await store(makeImg(64, 64))).slice(7);
	m.items[0].layers[0].cells = { rest: { south: [hash] } };
	m.rig.rest = { south: { image: hash, keypoints: points() } };
	m.rig.animations[0].sources = {
		south: { route: 'import', reference: hash, keypoints: [points()], provenance: [] }
	};
	state.projects.set('rig-quality', {
		id: 'rig-quality',
		savedAt: '',
		origin: 'studio',
		manifest: m,
		character: { id: 'saved-server-id', looks: 'A stylized humanoid' }
	});
});
afterEach(() => {
	try {
		expect(fetch).not.toHaveBeenCalled();
	} finally {
		vi.unstubAllGlobals();
	}
});
const add = () =>
	addMove('rig-quality', { id: 'jump', action: 'idle', frames: 4, items: [], seed: 7 });

test('the Studio checkpoint stages move frames without publishing or requesting items', async () => {
	const projectId = 'rig-quality';
	const spec = {
		id: 'jump',
		action: 'idle',
		frames: 4,
		items: [],
		seed: 7,
		reviewBeforePublish: true as const
	};
	await expect(addMove(projectId, { ...spec, items: ['sword'] })).rejects.toThrow(
		'Review the move'
	);
	expect(state.requests).toHaveLength(0);
	await expect(addMove(projectId, spec)).resolves.toMatchObject({ moveReview: 'jump' });
	const record = state.projects.get(projectId)!;
	const candidate = record.moveReviews!.jump;
	expect(record.manifest.rig.animations.map((move) => move.id)).not.toContain('jump');
	expect(candidate.cells.south).toHaveLength(4);
	expect(state.rawCount).toBe(1);
	const count = state.requests.length;
	await expect(addMove(projectId, spec)).resolves.toMatchObject({ moveReview: 'jump' });
	await expect(addMove(projectId, { ...spec, seed: 8 })).rejects.toThrow('changed');
	const input = await resolveMoveCandidate(projectId, candidate, true);
	const published = state.projects.get(projectId)!;
	expect(input).toBe(moveCandidateInput(published, spec.id));
	expect(published.moveReviews?.jump).toBeUndefined();
	expect(published.manifest.rig.animations.map((move) => move.id)).toContain('jump');
	await expect(resolveMoveCandidate(projectId, candidate, true)).rejects.toThrow('changed');
	expect(state.requests).toHaveLength(count);
});

test('a move staged before Adjust frame changed the rig is neither resumed nor saved as is', async () => {
	const projectId = 'rig-quality';
	const spec = {
		id: 'jump',
		action: 'idle',
		frames: 4,
		items: [],
		seed: 7,
		reviewBeforePublish: true as const
	};
	await addMove(projectId, spec);
	const record = state.projects.get(projectId)!,
		candidate = record.moveReviews!.jump;
	// Adjust frame refuses while a draft waits; were the rig moved anyway, the draft's frames no longer fit it.
	record.manifest.rig.artOffset = { south: -2 };
	const count = state.requests.length;
	await expect(addMove(projectId, spec)).rejects.toThrow('changed');
	await expect(resolveMoveCandidate(projectId, candidate, true)).rejects.toThrow('changed');
	expect(
		state.projects.get(projectId)!.manifest.rig.animations.map((move) => move.id)
	).not.toContain('jump');
	expect(state.requests).toHaveLength(count);
});

test.each(['save', 'discard', 'structural failure'] as const)(
	'a replacement with visual warnings: %s',
	async (decision) => {
		await add();
		const projectId = 'rig-quality';
		const before = state.projects.get(projectId)!;
		const hat = (await equipmentFixture()).manifest.items[1];
		hat.baseHash = before.manifest.rig.baseHash;
		const frame = before.manifest.rig.rest!.south!.image;
		hat.layers[0].cells = { jump: { south: [frame, frame, frame, frame] } };
		before.manifest.items.push(hat);
		state.output = (await store(image(-4, true))).slice(7);
		state.estimate = points(0.9);
		await expect(
			addMove(projectId, {
				id: 'jump',
				action: 'idle',
				frames: 4,
				items: [],
				seed: 8,
				dirs: ['south'],
				replace: true,
				reviewBeforePublish: true
			})
		).resolves.toMatchObject({ moveReview: 'jump' });
		const staged = state.projects.get(projectId)!;
		const candidate = staged.moveReviews!.jump;
		expect(candidate.checks['jump/south'].fails).toEqual([]);
		expect(candidate.warnings).not.toHaveLength(0);
		expect(staged.manifest).toEqual(before.manifest);
		const requests = state.requests.length;
		if (decision === 'save') {
			await resolveMoveCandidate(projectId, candidate, true);
			const saved = state.projects.get(projectId)!;
			expect(saved.moveReviews?.jump).toBeUndefined();
			expect(saved.manifest.items[0].layers[0].cells!.jump.south).not.toEqual(
				before.manifest.items[0].layers[0].cells!.jump.south
			);
			expect(
				saved.manifest.items.find((item) => item.id === hat.id)!.layers[0].cells?.jump?.south
			).toBeUndefined();
			expect(saved.rigQa).toMatchObject({ warnings: expect.arrayContaining(candidate.warnings) });
		} else {
			if (decision === 'structural failure') {
				const reviewed = structuredClone(candidate);
				candidate.checks['jump/south'].fails.push('missing or invalid frame joints');
				state.projects.set(projectId, staged);
				await expect(resolveMoveCandidate(projectId, reviewed, true)).rejects.toThrow(
					'needs fixes'
				);
			} else await resolveMoveCandidate(projectId, candidate, false);
			expect(state.projects.get(projectId)?.manifest).toEqual(before.manifest);
		}
		expect(state.requests).toHaveLength(requests);
	}
);

test('approved item work skips already-fitted views and refuses changed artwork', async () => {
	await add();
	const projectId = 'rig-quality';
	const record = state.projects.get(projectId)!;
	const manifest = record.manifest;
	const item = (await equipmentFixture()).manifest.items[1];
	const rest = manifest.rig.rest!.south!.image;
	item.baseHash = manifest.rig.baseHash;
	item.route = 'skeleton-pose';
	item.key = 'green';
	item.dressed = { south: rest };
	manifest.items.push(item);
	const spec = reviewItemMove(manifest, {
		id: 'jump',
		items: [item.id],
		itemsOnly: true,
		reviewedMoveItems: true,
		dirs: ['south'],
		frames: 4,
		seed: 7
	});
	expect(spec.itemReview!.gens).toBeGreaterThan(0);
	item.layers[0].cells = { jump: { south: [rest, rest, rest, rest] } };
	item.coverage = [0, 1, 2, 3].map((cell) => `jump/south/${cell}` as const);
	const count = state.requests.length;
	await addMove(projectId, spec);
	expect(state.requests).toHaveLength(count);
	const after = state.projects.get(projectId)!;
	after.manifest.rig.animations.find((move) => move.id === 'jump')!.sources!.south!.motion =
		'different';
	await expect(addMove(projectId, spec)).rejects.toThrow('item or price changed');
	expect(state.requests).toHaveLength(count);
});

test('actual Add move keeps detached parts and observation differences without another paid drawing', async () => {
	const art = image(-3, true, true);
	state.output = (await store(art)).slice(7);
	state.estimate = points(0.65);
	const outcome = await add();
	expect.soft(outcome.warnings.join(' ')).toMatch(/estimated arm-joint difference/);
	expect.soft(outcome.warnings.join(' ')).toMatch(/disconnected pixels retained/);
	expect.soft(state.rawCount).toBe(1);
	const rec = state.projects.get('rig-quality')!;
	const hash = rec.manifest.items[0].layers[0].cells!.jump!.south![0]!;
	const saved = await decodePng(state.blobs.get(hash.slice(7))!);
	expect.soft(saved.data.every((value, index) => value === art.data[index])).toBe(true);
	const qa = (
		rec.rigQa as {
			clips: Record<
				string,
				{
					fails: string[];
					warnings?: string[];
					adherence: number | null;
					feetDrift: number;
					paletteFit: number;
				}
			>;
		}
	).clips['jump/south'];
	expect.soft(qa.fails).toEqual([]);
	expect.soft(qa.warnings?.length ?? 0).toBeGreaterThan(0);
	expect(qa.adherence).toBeGreaterThan(2);
	expect(qa.feetDrift).toBe(3);
	expect(qa.paletteFit).toBe(0);
	// Resuming a completed move surfaces the current clip notes, without drawing or replaying stale flattened notes.
	rec.rigQa = { ...(rec.rigQa as object), warnings: ['rest/north: stale historical warning'] };
	state.projects.set(rec.id, rec);
	const resumed = await add();
	expect(resumed.warnings).toEqual(outcome.warnings);
	expect(state.rawCount).toBe(1);
});

test.each(['wrong-count', 'empty'])(
	'actual Add move stops after one structurally invalid %s result without paying for a retry',
	async (first) => {
		state.first = first;
		await expect(add()).rejects.toThrow('No paid retry was started');
		expect(state.rawCount).toBe(1);
		expect(state.requests.filter((r) => r.path === '/estimate-skeleton')).toHaveLength(0);
		expect(
			state.projects.get('rig-quality')!.manifest.rig.animations.some((a) => a.id === 'jump')
		).toBe(false);
	}
);

test('actual Add move stops on invalid observation without redrawing or saving an incomplete rig', async () => {
	state.estimate = [];
	await expect(add()).rejects.toThrow(/valid joints were not found/);
	expect(state.rawCount).toBe(1);
	expect(
		state.projects.get('rig-quality')!.manifest.rig.animations.some((a) => a.id === 'jump')
	).toBe(false);
});
