import { afterEach, expect, test, vi } from 'vitest';
import { readFile } from 'node:fs/promises';
import { loadFixture } from '../../src/lib/compose/fixture.ts';
import { makeImg } from '../../src/lib/image/png.ts';
import { type Img } from '../../src/lib/image/png.ts';
import type { JobRec } from '../../src/lib/pixellab/queue.ts';
import { DEFAULT_MOVE, DIRECTIONS, cellHash, playlist } from '../../src/lib/rig/rig.ts';
import type { StoredProject } from '../../src/lib/store/project.ts';
import {
	type AppearanceAttempt,
	generateAppearance,
	loadAppearance,
	quoteAppearance,
	readAppearance
} from '../../src/studio/appearanceEdit.ts';

const mock = vi.hoisted(() => ({
	account: { key: 'offline-test-key', balance: null, balanceError: '' },
	refreshBalance: vi.fn(),
	load: vi.fn(),
	update: vi.fn(),
	list: vi.fn(),
	run: vi.fn(),
	images: vi.fn()
}));
vi.mock('../../src/lib/app.svelte.ts', () => ({
	app: mock.account,
	refreshBalance: mock.refreshBalance,
	getKeyRevision: () => 1
}));
vi.mock('../../src/lib/store/db.ts', () => ({ update: mock.update, all: mock.list }));
vi.mock('../../src/lib/pixellab/queue.ts', () => ({
	live: (record: JobRec) => ['queued', 'submitting', 'running'].includes(record.state)
}));
vi.mock('../../src/lib/store/project.ts', () => ({
	loadProject: mock.load,
	pngBlobs: vi.fn(),
	saveItem: vi.fn()
}));
vi.mock('../../src/lib/store/workspace-mode.ts', () => ({ workspaceCopy: false }));
vi.mock('../../src/studio/create.ts', () => ({
	run: mock.run,
	imagesOf: mock.images,
	provOf: vi.fn()
}));
vi.mock('../../src/studio/stateGeneration.ts', () => ({
	flashShapes: vi.fn(),
	flashCost: vi.fn()
}));

afterEach(() => {
	mock.account.balanceError = '';
	vi.unstubAllGlobals();
	vi.resetAllMocks();
});

test('a reference edit of large item views stays on the image edit route', async () => {
	const image = makeImg(192, 192);
	const quote = await quoteAppearance(
		{
			name: 'Item',
			version: 'source',
			clip: DEFAULT_MOVE,
			cell: 0,
			size: { width: 192, height: 192 },
			views: DIRECTIONS.map((direction) => ({ direction, image, hash: 'sha256:item' }))
		},
		'pro',
		{ width: 64, height: 64, base64: '' }
	);
	expect(quote?.endpoint).toBe('/edit-images-v2');
	expect(quote?.batches.flatMap(({ facingIds }) => facingIds)).toEqual(DIRECTIONS);
});

test.each(['wrong size', 'blank', 'opaque', 'wrong route', 'duplicate receipt'] as const)(
	'keeps the receipt for a %s preview without publishing it',
	async (kind) => {
		const image = makeImg(kind === 'wrong size' ? 63 : 64, 64);
		if (kind === 'opaque') image.data.fill(255);
		if (kind === 'wrong size') image.data.set([100, 100, 100, 255]);
		const attempt: AppearanceAttempt = {
			id: 'partial',
			target: { projectId: 'rig-source' },
			sourceVersion: 'source',
			description: 'Change the shirt',
			choice: 'custom',
			model: 'pro',
			plan: {
				kind: 'ready',
				endpoint: '/edit-images-v2',
				method: 'text',
				cellSize: { width: 64, height: 64 },
				batches: [{ transport: 'cells', facingIds: ['south'] }],
				warnings: [],
				cost: { kind: 'estimate', minGenerations: 10, maxGenerations: 10 }
			}
		};
		const receipt = {
			id: 'receipt',
			state: 'done',
			activityScope: 'appearance:partial:0',
			tag: 'studio-appearance',
			method: 'POST',
			endpoint: kind === 'wrong route' ? '/edit-image-pixen' : '/edit-images-v2'
		};
		mock.list.mockResolvedValue(
			kind === 'duplicate receipt' ? [receipt, { ...receipt, id: 'second' }] : [receipt]
		);
		mock.images.mockResolvedValue([{ label: '0', img: image satisfies Img }]);
		const warning = vi.spyOn(console, 'warn').mockImplementation(() => {});
		try {
			const review = await readAppearance(attempt);
			expect(review.views).toEqual([]);
			expect(review.complete).toBe(false);
			const invalidReceipt = kind === 'wrong route' || kind === 'duplicate receipt';
			expect(review.records.map(({ id }) => id)).toEqual(invalidReceipt ? [] : ['receipt']);
			if (invalidReceipt) expect(mock.images).not.toHaveBeenCalled();
			expect(mock.run).not.toHaveBeenCalled();
		} finally {
			warning.mockRestore();
		}
	}
);

test('a source change between paid batches retains the first receipt and sends no second batch', async () => {
	vi.stubGlobal('navigator', {
		locks: {
			request: (_name: string, _options: unknown, run: (lock: object) => unknown) => run({})
		}
	});
	const project = await loadFixture((path) =>
		readFile(new URL(`../../public/fixtures/s2/${path}`, import.meta.url))
	);
	const { rig, items } = project.manifest;
	rig.cell = { w: 160, h: 160 };
	rig.animations.push({ id: DEFAULT_MOVE, cells: 1, frames: playlist(1, 150), loop: true });
	const body = items.find(({ id }) => id === rig.baseItem)!;
	const image = makeImg(160, 160);
	image.data.set([80, 100, 120, 255], (80 * 160 + 80) * 4);
	const hash = await cellHash(image);
	project.images.set(hash, image);
	body.layers[0].cells![DEFAULT_MOVE] = { south: [hash], east: [hash], north: [hash] };
	let record: StoredProject = {
		id: 'rig-source',
		manifest: project.manifest,
		origin: 'studio',
		savedAt: ''
	};
	const target = { projectId: record.id };
	mock.load.mockImplementation(() => ({ rec: record, project }));
	mock.update.mockImplementation((_store, _id, write: (before: StoredProject) => StoredProject) => {
		record = write(record);
		return record;
	});
	const { source } = await loadAppearance(target);
	const quote = await quoteAppearance(source!, 'pixen');
	expect(quote?.batches).toHaveLength(3);
	expect(mock.run).not.toHaveBeenCalled();
	const start = () =>
		generateAppearance(
			target,
			source!,
			quote!,
			'pixen',
			'custom',
			'Change the shirt',
			'Change the shirt',
			(value) => {
				attempt = value;
			}
		);
	let attempt: AppearanceAttempt | undefined;
	mock.refreshBalance.mockImplementationOnce(() => {
		mock.account.balanceError = 'offline lookup failure';
	});
	await expect(start()).rejects.toThrow('PixelLab could not confirm this account.');
	expect(mock.run).not.toHaveBeenCalled();
	expect(record.appearanceEdits).toBeUndefined();
	mock.account.balanceError = '';
	const jobs: JobRec[] = [];
	mock.run.mockImplementation(
		(_request, _label, _tag, _cache, _resume, _signal, activityScope: string) => {
			jobs.push({
				id: 'one-paid-job',
				state: 'done',
				activityScope,
				tag: 'studio-appearance',
				method: 'POST',
				endpoint: '/edit-image-pixen'
			} as JobRec);
			rig.pivot = { ...rig.pivot, x: rig.pivot.x + 1 };
			return jobs[0];
		}
	);
	mock.list.mockImplementation(() => jobs);
	mock.images.mockResolvedValue([{ label: '0', img: image }]);
	await expect(start()).rejects.toThrow(/quote changed/);
	expect(mock.run).toHaveBeenCalledTimes(1);
	expect(record.appearanceEdits?.['']?.id).toBe(attempt?.id);
	const first = await readAppearance(attempt!);
	expect(first.complete).toBe(false);
	expect(first.views).toHaveLength(1);
	expect(first.records.map(({ id }) => id)).toEqual(['one-paid-job']);
	expect(mock.run).toHaveBeenCalledTimes(1);
});
