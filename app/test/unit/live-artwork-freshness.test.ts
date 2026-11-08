import { afterEach, expect, test, vi } from 'vitest';
import { Queue, type JobRec } from '../../src/lib/pixellab/queue.ts';

afterEach(() => vi.unstubAllGlobals());

test('resuming an accepted job downloads current CDN bytes without credentials or HTTP cache reuse', async () => {
	const url = 'https://backblaze.pixellab.ai/result.png?X-Amz-Signature=unchanged-fixture';
	const png = new Uint8Array(
		Buffer.from(
			'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVQIHWP4z8DwHwAFgAI/ScLbtAAAAABJRU5ErkJggg==',
			'base64'
		)
	);
	const fetchMock = vi.fn().mockResolvedValue(new Response(png));
	vi.stubGlobal('fetch', fetchMock);
	let record: JobRec = {
		id: 'accepted-download',
		label: 'Accepted result',
		method: 'POST',
		endpoint: '/create-character-v3',
		params: {},
		inputs: [],
		requestHash: 'saved',
		state: 'running',
		attempts: 1,
		requestStarted: true,
		nextAt: 0,
		createdAt: 1,
		jobs: [
			{
				id: 'existing-remote-job',
				status: 'completed',
				done: false,
				remoteDone: true,
				results: [],
				pendingUrls: [{ label: 'south', url }]
			}
		],
		gens: 0,
		usd: 0
	};
	const putBlob = vi.fn(async () => 'current-image');
	const queue = new Queue({
		all: async () => [structuredClone(record)],
		put: async (_, value) => {
			record = structuredClone(value);
		},
		putBlob,
		locks: null,
		online: () => true,
		now: () => 1000
	});
	await queue.load();
	queue.setKey('offline-test-key');
	await queue.tick();
	expect(fetchMock).toHaveBeenCalledExactlyOnceWith(url, {
		credentials: 'omit',
		cache: 'no-store'
	});
	expect(putBlob).toHaveBeenCalledWith(png);
	expect(record).toMatchObject({
		state: 'done',
		jobs: [{ id: 'existing-remote-job', results: [{ sha: 'current-image', label: 'south' }] }]
	});
});
