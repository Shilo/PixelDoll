import { beforeEach, expect, test, vi } from 'vitest';
import type { Item, ItemQa, Manifest } from '../../src/lib/store/manifest.ts';
import type { StoredProject } from '../../src/lib/store/project.ts';
import { slotOf } from '../../src/lib/items/items.ts';
import { acceptItemReview } from '../../src/lib/items/run.ts';
import { CURRENT_FORMAT } from '../../src/lib/store/manifest.ts';

const state = vi.hoisted(() => ({
	record: null as StoredProject | null,
	saved: null as Item | null,
	changedAtSave: false,
	imageWrites: -1,
	enqueue: vi.fn()
}));
vi.mock('../../src/lib/pixellab/queue.ts', () => ({
	queue: {
		subscribe: (cb: (s: { jobs: [] }) => void) => {
			cb({ jobs: [] });
			return () => {};
		},
		enqueue: state.enqueue
	}
}));
vi.mock('../../src/lib/store/project.ts', () => ({
	loadProject: async () => ({
		rec: structuredClone(state.record!),
		project: { manifest: structuredClone(state.record!.manifest), images: new Map() }
	}),
	saveItem: async (
		_id: string,
		item: Item,
		images: Map<string, unknown>,
		_slots: unknown,
		check: (rec: StoredProject) => void
	) => {
		if (state.changedAtSave) state.record!.manifest.items[0].qa!.maxPaletteDist++;
		check(state.record!);
		state.saved = structuredClone(item);
		state.imageWrites = images.size;
	}
}));

function artwork(): Item {
	const summary = {
		minKeyKept: 1,
		maxKeyOutside: 0,
		minAreaRatio: 0.3,
		maxAreaCV: 0.2,
		maxPaletteDist: 0,
		clipPx: 0,
		footwearReviewFrames: 1,
		status: 'warn' as const
	};
	const qa: ItemQa = { ...summary, rerolls: 0, cells: {}, clips: { 'walk/south': { ...summary } } };
	return {
		id: 'hat',
		name: 'Hat',
		slot: 'head',
		prompt: 'a hat',
		status: 'accepted',
		mirror: 'generate',
		baseHash: 'sha256:body',
		materials: [],
		provenance: [],
		designWarnings: ['D1 reviewable appearance'],
		qa,
		layers: [{ id: 'main', role: 'fg', z: 100, cells: { walk: { south: ['sha256:art'] } } }]
	};
}
beforeEach(() => {
	const item = artwork();
	const manifest: Manifest = {
		format: CURRENT_FORMAT,
		app: 'test',
		name: 'Test',
		items: [item],
		materials: [],
		slots: [slotOf('head')],
		presets: [],
		rig: {
			baseItem: 'base',
			baseHash: item.baseHash,
			cell: { w: 64, h: 64 },
			pivot: { x: 32, y: 63 },
			directions: [{ id: 'south' }],
			animations: []
		}
	};
	state.record = { id: 'character', savedAt: '', origin: 'studio', manifest };
	state.saved = null;
	state.changedAtSave = false;
	state.imageWrites = -1;
	state.enqueue.mockClear();
});

test('explicit acceptance acknowledges checks while preserving all artwork and warning evidence, with no API call', async () => {
	const reviewed = structuredClone(state.record!.manifest.items[0]);
	await acceptItemReview('character', reviewed.id, reviewed);
	expect(state.enqueue).not.toHaveBeenCalled();
	expect(state.imageWrites).toBe(0);
	expect(state.saved!.qa!.status).toBe('accepted');
	expect(state.saved!.qa!.clips!['walk/south'].status).toBe('accepted');
	expect(state.saved!.layers).toEqual(reviewed.layers);
	expect(state.saved!.designWarnings).toEqual(reviewed.designWarnings);
	expect(state.saved!.qa!.footwearReviewFrames).toBe(1);
	expect(state.saved!.qa!.minAreaRatio).toBe(0.3);
	expect(state.saved!.provenance).toEqual(reviewed.provenance);
	expect(reviewed.qa!.status).toBe('warn');
});

test('held raw-pixel observations survive explicit acceptance and serialized storage without paid work', async () => {
	const current = state.record!.manifest.items[0];
	current.slot = 'main_hand';
	current.qa!.rawKeyReviewFrames = 1;
	current.qa!.clips!['walk/south'].rawKeyReviewFrames = 1;
	current.qa!.cells['walk/south/0'] = {
		route: 'posed',
		area: 4,
		rawKeyOutside: {
			pixels: 2,
			bounds: { x: 43, y: 25, w: 2, h: 1 },
			space: 'raw-output-cell',
			nearestWristPx: 2
		}
	};
	const reviewed = structuredClone(current);
	await acceptItemReview('character', current.id, reviewed);
	const loaded = JSON.parse(JSON.stringify(state.saved)) as Item;
	expect(loaded.qa).toMatchObject({
		status: 'accepted',
		rawKeyReviewFrames: 1,
		clips: { 'walk/south': { status: 'accepted', rawKeyReviewFrames: 1 } }
	});
	expect(loaded.qa!.cells['walk/south/0']).toEqual(reviewed.qa!.cells['walk/south/0']);
	expect(state.enqueue).not.toHaveBeenCalled();
	expect(state.imageWrites).toBe(0);
	expect(loaded.layers).toEqual(reviewed.layers);
});

test.each(['item', 'body', 'missing'] as const)(
	'a stale %s cannot be accepted from an older review',
	async (change) => {
		const reviewed = structuredClone(state.record!.manifest.items[0]);
		if (change === 'item') state.record!.manifest.items[0].qa!.maxPaletteDist++;
		if (change === 'body') state.record!.manifest.rig.baseHash = 'sha256:changed';
		if (change === 'missing') state.record!.manifest.items.splice(0);
		await expect(acceptItemReview('character', reviewed.id, reviewed)).rejects.toMatchObject({
			message: 'This item or its checks changed. Reopen it before accepting its current artwork.',
			translation: { key: 'itemRoute.errors.reviewChanged' }
		});
		expect(state.saved).toBeNull();
		expect(state.enqueue).not.toHaveBeenCalled();
	}
);

test('an edit racing the atomic save cannot accept a newer set of warnings', async () => {
	const reviewed = structuredClone(state.record!.manifest.items[0]);
	state.changedAtSave = true;
	await expect(acceptItemReview('character', reviewed.id, reviewed)).rejects.toMatchObject({
		message: 'This item or its checks changed. Reopen it before accepting its current artwork.',
		translation: { key: 'itemRoute.errors.reviewChanged' }
	});
	expect(state.saved).toBeNull();
	expect(state.imageWrites).toBe(-1);
	expect(state.enqueue).not.toHaveBeenCalled();
});

test('an item with missing moves is kept without them: only its complete moves stay, nothing is added', async () => {
	const m = state.record!.manifest,
		hat = m.items[0];
	m.rig.animations = [
		{ id: 'walk', cells: 1, loop: true, frames: [{ cell: 0, ms: 100 }] },
		{ id: 'idle', cells: 2, loop: true, frames: [0, 1].map((cell) => ({ cell, ms: 100 })) }
	];
	m.items.push({
		...structuredClone(hat),
		id: 'base',
		slot: 'body',
		layers: [
			{
				id: 'main',
				role: 'fg',
				z: 0,
				cells: { walk: { south: ['sha256:b0'] }, idle: { south: ['sha256:b1', 'sha256:b2'] } }
			}
		]
	});
	// The hat has walk complete but only the first idle frame: worn in idle it would flicker in and out.
	hat.layers[0].cells!.idle = { south: ['sha256:i0', null] };
	hat.coverage = ['walk/south/0', 'idle/south/0'];
	hat.qa!.clips['idle/south'] = { ...hat.qa!.clips['walk/south'] };
	hat.qa!.cells['idle/south/0'] = { route: 'posed', area: 3 };
	const reviewed = structuredClone(hat);
	// consent covers exactly the reviewed gaps
	await expect(acceptItemReview('character', hat.id, reviewed, ['walk'])).rejects.toMatchObject({
		translation: { key: 'itemRoute.errors.reviewChanged' }
	});
	await acceptItemReview('character', hat.id, reviewed, ['idle']);
	expect(state.saved!.layers[0].cells).toEqual({ walk: { south: ['sha256:art'] } });
	expect(state.saved!.coverage).toEqual(['walk/south/0']);
	expect(Object.keys(state.saved!.qa!.clips)).toEqual(['walk/south']);
	expect(state.saved!.qa!.cells['idle/south/0']).toBeUndefined();
	expect(state.saved!.qa!.status).toBe('accepted');
	expect(state.imageWrites).toBe(0);
	expect(state.enqueue).not.toHaveBeenCalled();
});
