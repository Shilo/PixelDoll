import { expect, test, vi } from 'vitest';
import { makeImg, type Img } from '../../src/lib/image/png.ts';
import type { JobRec } from '../../src/lib/pixellab/queue.ts';

const stored = vi.hoisted(() => ({ project: undefined as unknown, jobs: [] as unknown[] }));
vi.mock('../../src/lib/store/db.ts', async (original) => ({
	...(await original<typeof import('../../src/lib/store/db.ts')>()),
	get: async () => structuredClone(stored.project),
	all: async () => structuredClone(stored.jobs),
	getBlob: async (sha: string) => new Blob([sha])
}));
// Stored and downloaded PNGs are named by their text, so a test says which image each one decodes to.
const pngs = vi.hoisted(() => new Map<string, unknown>());
vi.mock('../../src/lib/image/png.ts', async (original) => ({
	...(await original<typeof import('../../src/lib/image/png.ts')>()),
	decodePng: async (blob: Blob) => {
		const image = pngs.get(await blob.text());
		if (!image) throw new Error('Offline fixture: unreadable PNG.');
		return image;
	}
}));
vi.mock('../../src/lib/store/project.ts', async (original) => ({
	...(await original<typeof import('../../src/lib/store/project.ts')>()),
	// No saved source frame, so local results are reviewed as returned.
	loadProject: async () => ({
		rec: {},
		project: { manifest: { rig: { animations: [] }, items: [] }, images: new Map() }
	})
}));
const app = vi.hoisted(() => ({ key: '', keyRejected: false }));
vi.mock('../../src/lib/app.svelte.ts', () => ({
	app,
	getKeyRevision: () => 0,
	refreshBalance: vi.fn()
}));
const remote = vi.hoisted(() => ({ detail: undefined as unknown }));
vi.mock('../../src/lib/pixellab/client.ts', async (original) => ({
	...(await original<typeof import('../../src/lib/pixellab/client.ts')>()),
	api: async () => structuredClone(remote.detail)
}));

function figure(size = 64, filled = true): Img {
	const image = makeImg(size, size);
	if (filled)
		for (let y = 20; y < 50; y++)
			for (let x = 24; x < 40; x++) image.data.set([120, 90, 60, 255], (y * size + x) * 4);
	return image;
}

async function lostManagedState() {
	// Runes of the Studio modules this one imports; no reactivity is under test.
	const identity = <T>(value: T) => value;
	vi.stubGlobal('$state', Object.assign(identity, { raw: identity, snapshot: identity }));
	vi.stubGlobal('$derived', Object.assign(identity, { by: () => undefined }));
	vi.stubGlobal('innerWidth', 1440);
	vi.stubGlobal('innerHeight', 900);
	vi.stubGlobal('devicePixelRatio', 1);
	vi.stubGlobal('matchMedia', () => ({ matches: false }));
	vi.stubGlobal('document', { querySelector: () => null });
	const { pendingState } = await import('../../src/studio/stateGeneration.ts');
	const plan = {
		endpoint: '/create-character-state',
		parentId: 'parent',
		cellSize: { width: 64, height: 64 },
		remoteFacingCount: 4,
		batches: [{ facingIds: ['south', 'east', 'north', 'west'] }]
	};
	stored.project = {
		id: 'rig-state',
		stateGenerations: { attempt: { token: 'attempt', source: { version: 1 }, plan } }
	};
	// A managed State whose poll expired, with its durable receipt (see state-recovery.test.ts).
	const record: JobRec = {
		id: 'record-0',
		label: 'State',
		tag: 'studio-state',
		activityScope: 'state:attempt:0',
		method: 'POST',
		endpoint: plan.endpoint,
		params: { character_id: 'parent' },
		inputs: [],
		requestHash: 'hash-0',
		state: 'lost',
		attempts: 1,
		nextAt: 0,
		createdAt: 0,
		response: { character_id: 'child', background_job_id: 'remote-job' },
		jobs: [{ id: 'remote-job', status: 'lost', done: true, results: [] }],
		gens: 10,
		usd: 0
	};
	stored.jobs = [record];
	return pendingState;
}

test('a finished State reviewed without a key asks to connect instead of reporting bad results', async () => {
	app.key = '';
	const pendingState = await lostManagedState();
	await expect(pendingState('rig-state', 'attempt')).rejects.toMatchObject({
		translation: { key: 'stateGeneration.connect' }
	});
	vi.unstubAllGlobals();
});

test('a managed State child PixelLab is still drawing reads as unfinished, not as an invalid result', async () => {
	app.key = 'key';
	// Its poll expired while PixelLab still draws the child, which has no views yet.
	remote.detail = {
		id: 'child',
		status: 'pending',
		size: { width: 64, height: 64 },
		directions: 4,
		rotation_urls: null
	};
	const pendingState = await lostManagedState();
	await expect(pendingState('rig-state', 'attempt')).rejects.toMatchObject({
		translation: { key: 'stateGeneration.unfinished' }
	});
	vi.unstubAllGlobals();
});

test('a managed State keeps its readable facings and names the missing ones', async () => {
	app.key = 'key';
	pngs.set('south', figure());
	pngs.set('east', figure());
	pngs.set('north', figure(64, false));
	remote.detail = {
		id: 'child',
		status: 'completed',
		size: { width: 64, height: 64 },
		directions: 4,
		// West never came back, north is blank.
		rotation_urls: {
			south: 'https://example.test/south',
			east: 'https://example.test/east',
			north: 'https://example.test/north',
			west: null
		}
	};
	vi.stubGlobal('fetch', async (url: URL) => new Response(url.pathname.slice(1)));
	const pendingState = await lostManagedState();
	const review = await pendingState('rig-state', 'attempt');
	expect(review?.views.map(({ direction }) => direction)).toEqual(['south', 'east']);
	expect(review?.missing).toEqual(['north', 'west']);
	vi.unstubAllGlobals();
});

test('a managed State whose declared size differs stays an invalid result', async () => {
	app.key = 'key';
	pngs.set('south', figure());
	remote.detail = {
		id: 'child',
		status: 'completed',
		size: { width: 48, height: 48 },
		directions: 4,
		rotation_urls: { south: 'https://example.test/south' }
	};
	vi.stubGlobal('fetch', async (url: URL) => new Response(url.pathname.slice(1)));
	const pendingState = await lostManagedState();
	await expect(pendingState('rig-state', 'attempt')).rejects.toMatchObject({
		translation: { key: 'stateGeneration.invalidResult' }
	});
	vi.unstubAllGlobals();
});

test('a local State keeps the finished batch when a sibling batch failed or came back blank', async () => {
	const pendingState = await lostManagedState();
	const plan = {
		endpoint: '/edit-image-pro-flash',
		cellSize: { width: 64, height: 64 },
		batches: [
			{ transport: 'cells', facingIds: ['south'] },
			{ transport: 'cells', facingIds: ['east'] },
			{ transport: 'cells', facingIds: ['north'] }
		]
	};
	stored.project = {
		id: 'rig-state',
		stateGenerations: {
			attempt: {
				token: 'attempt',
				source: { clip: 'default', frame: 0 },
				sourceVersion: 'v1',
				plan
			}
		}
	};
	pngs.set('south-result', figure());
	pngs.set('north-result', figure(64, false));
	const record = (index: number, patch: Partial<JobRec>): JobRec => ({
		id: `record-${index}`,
		label: 'State',
		tag: 'studio-state',
		activityScope: `state:attempt:${index}`,
		method: 'POST',
		endpoint: plan.endpoint,
		params: {},
		inputs: [],
		requestHash: `hash-${index}`,
		state: 'done',
		attempts: 1,
		nextAt: 0,
		createdAt: 0,
		jobs: [],
		gens: 1,
		usd: 0,
		...patch
	});
	const result = (sha: string) => [
		{ id: sha, status: 'completed', done: true, results: [{ label: '0', sha }] }
	];
	stored.jobs = [
		record(0, { jobs: result('south-result') }),
		record(1, { state: 'failed' }),
		record(2, { jobs: result('north-result') })
	];
	const review = await pendingState('rig-state', 'attempt');
	expect(review?.views.map(({ direction }) => direction)).toEqual(['south']);
	expect(review?.missing).toEqual(['east', 'north']);
	expect(review?.canceled).toEqual([]);
	// A canceled batch is named apart, so saving says those views will not be made.
	stored.jobs[1] = record(1, { state: 'canceled' });
	expect((await pendingState('rig-state', 'attempt'))?.canceled).toEqual(['east']);
	vi.unstubAllGlobals();
});

test('a managed facing that could not be downloaded is told apart from one that came back blank', async () => {
	app.key = 'key';
	pngs.set('south', figure());
	pngs.set('north', figure(64, false));
	pngs.set('west', figure());
	remote.detail = {
		id: 'child',
		status: 'completed',
		size: { width: 64, height: 64 },
		directions: 4,
		rotation_urls: {
			south: 'https://example.test/south',
			east: 'https://example.test/east',
			north: 'https://example.test/north',
			west: 'https://example.test/west'
		}
	};
	vi.stubGlobal('fetch', async (url: URL) =>
		url.pathname === '/east'
			? Promise.reject(new TypeError('Offline fixture'))
			: new Response(url.pathname.slice(1))
	);
	const pendingState = await lostManagedState();
	const review = await pendingState('rig-state', 'attempt');
	expect(review?.views.map(({ direction }) => direction)).toEqual(['south', 'west']);
	expect(review?.missing).toEqual(['east', 'north']);
	// East may still download on Try again; north came back blank.
	expect(review?.unfetched).toEqual(['east']);
	expect(review?.canceled).toEqual([]);
	vi.unstubAllGlobals();
});
