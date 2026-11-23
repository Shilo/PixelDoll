import { expect, test, vi } from 'vitest';
import { bytesToBase64 } from '../../src/lib/image/png.ts';
import { ApiError } from '../../src/lib/pixellab/client.ts';
import { decodePngBytes, encodePngBytes } from '../../src/lib/image/pngraw.ts';
import {
	Queue,
	managedStateSubmitChildId,
	queueErrorParts,
	type Deps,
	type JobRec
} from '../../src/lib/pixellab/queue.ts';

// A paid job that completes with a storage URL; the free GET /balance probe always answers.
function fixture(deps: Partial<Deps>) {
	const store = new Map<string, JobRec>();
	let t = 1000,
		probes = 0;
	const q = new Queue({
		now: () => t,
		online: () => true,
		locks: null,
		put: async (k, r) => void store.set(k, structuredClone(r)),
		get: async (k) => structuredClone(store.get(k)),
		del: async (k) => void store.delete(k),
		all: async () => [...store.values()].map((r) => structuredClone(r)),
		putBlob: async () => 'x',
		getBlob: async () => undefined,
		fetchBytes: async () => new Uint8Array(),
		api: async <T>(_k: string, method: string, path: string): Promise<T> => {
			if (path === '/balance') {
				probes++;
				return {} as T;
			}
			if (method === 'POST') return { background_job_id: 'j' } as T;
			return {
				id: 'j',
				status: 'completed',
				created_at: '',
				last_response: { storage_urls: { east: 'https://x/e.png' } }
			} as T;
		},
		...deps
	});
	q.key = 'k';
	const run = async (n: number) => {
		for (let i = 0; i < n; i++) {
			t += 1000;
			await q.tick();
		}
	};
	return { q, store, run, probes: () => probes };
}

test('a storage download that keeps throwing TypeError while online gives up instead of pausing forever', async () => {
	let fetches = 0;
	const { q, store, run, probes } = fixture({
		fetchBytes: async () => {
			fetches++;
			throw new TypeError('Failed to fetch');
		}
	});
	const r = await q.enqueue({ method: 'POST', path: '/x', body: { seed: 1 } });
	await run(900); // 15 minutes of 1 s ticks: probes and backoff between tries
	const stored = store.get(r.id)!;
	expect(stored.state).toBe('failed');
	const raw = 'result download failed 10x: Failed to fetch. Download manually: https://x/e.png';
	expect(stored.error).toBe(raw);
	expect(queueErrorParts(stored)).toEqual([
		{
			key: 'activity.error.download',
			vars: { count: 10, error: 'Failed to fetch', urls: 'https://x/e.png' }
		}
	]);
	expect(stored.error).toBe(raw);
	expect(
		queueErrorParts({
			...stored,
			jobs: stored.jobs.map((job) => ({ ...job, failedAtProvider: true }))
		})
	).toEqual([raw]);
	expect(fetches).toBe(10);
	expect(probes()).toBeGreaterThan(0); // each TypeError still paused the queue until a probe got through
});

test.each(['image_url', 'rgba_bytes'])('stores %s State edit results as PNGs', async (format) => {
	const image = { w: 1, h: 1, data: new Uint8ClampedArray([123, 45, 67, 255]) };
	const url = 'https://example.test/result.png';
	let storedImage: Uint8Array | undefined;
	const { q, store, run } = fixture({
		api: async <T>(_key: string, method: string, endpoint: string): Promise<T> => {
			if (endpoint === '/balance') return {} as T;
			if (method === 'POST') return { background_job_id: 'j' } as T;
			return {
				id: 'j',
				status: 'completed',
				last_response:
					format === 'image_url'
						? { image_url: url }
						: {
								image: {
									type: 'rgba_bytes',
									base64: bytesToBase64(new Uint8Array(image.data)),
									width: 1,
									height: 1
								}
							}
			} as T;
		},
		fetchBytes: async (target) => {
			expect(target).toBe(url);
			return encodePngBytes(image);
		},
		putBlob: async (bytes) => {
			storedImage = bytes;
			return 'output';
		}
	});
	const record = await q.enqueue({ method: 'POST', path: '/edit-image-pro-flash', body: {} });
	await run(12);
	expect(store.get(record.id)?.state).toBe('done');
	expect(await decodePngBytes(storedImage!)).toEqual(image);
});

test('a download that fails while the browser is offline does not count as a try', async () => {
	let online = true,
		fetches = 0;
	const { q, store, run } = fixture({
		online: () => online,
		fetchBytes: async () => {
			fetches++;
			online = false;
			throw new TypeError('Failed to fetch');
		}
	});
	const r = await q.enqueue({ method: 'POST', path: '/x', body: { seed: 1 } });
	await run(5);
	expect(fetches).toBe(1);
	expect(q.paused).toBe('offline');
	expect(store.get(r.id)?.jobs[0].tries).toBeUndefined();
	expect(store.get(r.id)?.state).toBe('running');
});

test.each([
	['submit receipt only', '/create-character-state', 'child', 'job', 'job', undefined, 'done'],
	['matching receipts', '/create-character-state', 'child', 'job', 'job', 'child', 'done'],
	['wrong poll child', '/create-character-state', 'child', 'job', 'job', 'other', 'failed'],
	['wrong poll job', '/create-character-state', 'child', 'job', 'other', 'child', 'failed'],
	['poll receipt only', '/create-character-state', undefined, 'job', 'job', 'child', 'failed'],
	['parent as child', '/create-character-state', 'parent', 'job', 'job', 'parent', 'failed'],
	['no submit job', '/create-character-state', 'child', undefined, 'job', 'child', 'lost'],
	['other route', '/x', 'child', 'job', 'job', 'child', 'failed']
] as const)(
	'handles metadata-only completion: %s',
	async (_title, path, submitChild, submitJob, pollJob, pollChild, expected) => {
		let posts = 0;
		const { q, store, run } = fixture({
			api: async <T>(_key: string, method: string, endpoint: string): Promise<T> => {
				if (endpoint === '/balance') return {} as T;
				if (method === 'POST') {
					posts++;
					return { background_job_id: submitJob, character_id: submitChild } as T;
				}
				return {
					id: pollJob,
					status: 'completed',
					last_response: { character_id: pollChild },
					usage: { type: 'generations', generations: 1 }
				} as T;
			}
		});
		const record = await q.enqueue({ method: 'POST', path, body: { character_id: 'parent' } });
		await run(1);
		await q.load();
		await run(5);
		const stored = store.get(record.id)!;
		expect(posts).toBe(1);
		expect(stored.state).toBe(expected);
		expect(stored.jobs[0]?.characterId).toBe(expected === 'done' ? pollChild : undefined);
		if (expected === 'done') {
			expect(managedStateSubmitChildId(stored)).toBe('child');
			expect(stored.jobs[0].results).toEqual([]);
			expect(stored.gens).toBe(1);
		}
	}
);

test('Clear finished reports a failed delete and keeps the record listed', async () => {
	const { q, store } = fixture({
		del: async () => {
			throw new Error('storage blocked');
		}
	});
	const r = await q.enqueue({ method: 'POST', path: '/x', body: { seed: 1 } });
	await q.cancel(r.id);
	await expect(q.clearFinished(() => false)).rejects.toThrow('storage blocked');
	expect(q.snapshot().jobs.map((j) => j.id)).toEqual([r.id]);
	expect(store.has(r.id)).toBe(true);
});

test('a valid inline result this device cannot save stays open and is saved once storage works, never failed', async () => {
	let saves = 0,
		broken = true;
	const { q, store, run } = fixture({
		api: async <T>(_key: string, method: string, endpoint: string): Promise<T> => {
			if (endpoint === '/balance') return {} as T;
			if (method === 'POST') return { background_job_id: 'j' } as T;
			return {
				id: 'j',
				status: 'completed',
				last_response: {
					image: {
						type: 'rgba_bytes',
						base64: bytesToBase64(new Uint8Array([1, 2, 3, 255])),
						width: 1,
						height: 1
					}
				}
			} as T;
		},
		putBlob: async () => {
			saves++;
			if (broken) throw new Error('QuotaExceededError');
			return 'output';
		}
	});
	const record = await q.enqueue({ method: 'POST', path: '/edit-image-pro-flash', body: {} });
	await run(12);
	expect(saves).toBeGreaterThan(0);
	expect(store.get(record.id)?.state).toBe('running'); // paid result kept open, not marked malformed
	expect(q.snapshot().paused).toBe('storage');
	broken = false;
	await run(12);
	expect(store.get(record.id)?.state).toBe('done');
	expect(store.get(record.id)?.jobs[0].results).toMatchObject([{ sha: 'output', w: 1, h: 1 }]);
});

test('a result save that keeps failing holds the storage notice even while small record saves work', async () => {
	vi.useFakeTimers({ toFake: ['setInterval', 'clearInterval', 'Date'] });
	let blobs = 0,
		broken = true;
	const { q, store } = fixture({
		now: () => Date.now(),
		fetchBytes: async () =>
			encodePngBytes({ w: 1, h: 1, data: new Uint8ClampedArray([1, 2, 3, 255]) }),
		putBlob: async () => {
			blobs++;
			if (broken) throw new Error('QuotaExceededError');
			return 'output';
		}
	});
	try {
		const record = await q.enqueue({ method: 'POST', path: '/x', body: { seed: 1 } });
		q.start();
		await vi.waitFor(async () => {
			await vi.advanceTimersByTimeAsync(1_000);
			expect(blobs).toBeGreaterThan(1);
		});
		const tried = blobs;
		await vi.advanceTimersByTimeAsync(3_000);
		expect(blobs - tried).toBeLessThanOrEqual(1); // backs off instead of fetching again every tick
		expect(q.snapshot().paused).toBe('storage'); // record saves alone do not prove results can be saved
		broken = false;
		await vi.waitFor(async () => {
			await vi.advanceTimersByTimeAsync(1_000);
			expect(store.get(record.id)?.state).toBe('done');
		});
		await vi.advanceTimersByTimeAsync(1_000);
		expect(q.snapshot().paused).toBeNull();
	} finally {
		q.stop();
		vi.useRealTimers();
	}
});

test('a result this device could not save survives PixelLab deleting the job, and a failed final save is retried', async () => {
	let gets = 0,
		blobBroken = true,
		ledgerBroken = false;
	const { q, store, run } = fixture({
		api: async <T>(_key: string, method: string, endpoint: string): Promise<T> => {
			if (endpoint === '/balance') return {} as T;
			if (method === 'POST') return { background_job_id: 'j' } as T;
			// The job answers once, then PixelLab has deleted it.
			if (gets++) throw new ApiError(404, 'notfound', 'not found');
			return {
				id: 'j',
				status: 'completed',
				last_response: {
					image: {
						type: 'rgba_bytes',
						base64: bytesToBase64(new Uint8Array([1, 2, 3, 255])),
						width: 1,
						height: 1
					}
				}
			} as T;
		},
		putBlob: async () => {
			if (blobBroken) throw new Error('QuotaExceededError');
			return 'output';
		}
	});
	const deps = (q as unknown as { deps: Deps }).deps;
	const put = deps.put;
	deps.put = async (k, r) => {
		if (ledgerBroken && r.state === 'done') throw new Error('IndexedDB unavailable');
		return put(k, r);
	};
	const record = await q.enqueue({ method: 'POST', path: '/edit-image-pro-flash', body: {} });
	await run(12);
	expect(gets).toBe(1); // held in memory: never asked PixelLab again
	blobBroken = false;
	ledgerBroken = true; // the result saves, the final record save does not
	await run(12);
	expect(store.get(record.id)?.state).not.toBe('done');
	ledgerBroken = false;
	await run(6); // a failed record save is retried every poll interval (5 s)
	expect(store.get(record.id)).toMatchObject({
		state: 'done',
		jobs: [{ results: [{ sha: 'output' }] }]
	});
	expect(gets).toBe(1);
});

test('a waiter does not take a settled result until its record is stored', async () => {
	let ledgerBroken = false;
	const stored = new Map<string, JobRec>();
	const { q, run } = fixture({
		// Fails underneath the queue's own storage tracking, as a real IndexedDB write would.
		put: async (k, r) => {
			if (ledgerBroken && r.state === 'done') throw new Error('IndexedDB unavailable');
			stored.set(k, structuredClone(r));
		},
		get: async (k) => structuredClone(stored.get(k)),
		all: async () => [...stored.values()].map((r) => structuredClone(r)),
		fetchBytes: async () =>
			encodePngBytes({ w: 1, h: 1, data: new Uint8ClampedArray([1, 2, 3, 255]) })
	});
	const record = await q.enqueue({ method: 'POST', path: '/x', body: { seed: 1 } });
	let settled: JobRec | undefined;
	void q.settled(record.id).then((r) => (settled = r));
	ledgerBroken = true;
	await run(12);
	expect(q.snapshot().paused).toBe('storage'); // the failed write was announced
	// Finished in this tab, but every reader (waiters, the item runner, a resumed enqueue) sees it in progress until stored.
	expect(q.snapshot().jobs.find((r) => r.id === record.id)?.state).toBe('running');
	expect(settled).toBeUndefined();
	let resumed: JobRec | undefined;
	void q
		.enqueue({ method: 'POST', path: '/x', body: { seed: 1 } }, { cache: true })
		.then((r) => (resumed = r));
	await run(1);
	await new Promise((resolve) => setTimeout(resolve, 100)); // request hashing runs on real time
	expect(resumed).toBeUndefined();
	ledgerBroken = false;
	await run(6);
	expect(stored.get(record.id)?.state).toBe('done');
	expect(settled?.state).toBe('done');
	await vi.waitFor(() => expect(resumed).toMatchObject({ id: record.id, state: 'done' }));
});

test('a held result is saved after the credential is forgotten, without asking PixelLab', async () => {
	let gets = 0,
		blobBroken = true;
	const { q, store, run } = fixture({
		api: async <T>(_key: string, method: string, endpoint: string): Promise<T> => {
			if (endpoint === '/balance') return {} as T;
			if (method === 'POST') return { background_job_id: 'j' } as T;
			gets++;
			return {
				id: 'j',
				status: 'completed',
				last_response: {
					image: {
						type: 'rgba_bytes',
						base64: bytesToBase64(new Uint8Array([1, 2, 3, 255])),
						width: 1,
						height: 1
					}
				}
			} as T;
		},
		putBlob: async () => {
			if (blobBroken) throw new Error('QuotaExceededError');
			return 'output';
		}
	});
	const record = await q.enqueue({ method: 'POST', path: '/edit-image-pro-flash', body: {} });
	await run(12);
	expect(gets).toBe(1);
	q.setKey('');
	blobBroken = false;
	await run(70); // past the save backoff
	expect(store.get(record.id)).toMatchObject({
		state: 'done',
		jobs: [{ results: [{ sha: 'output' }] }]
	});
	expect(gets).toBe(1);
});

test('an earlier write landing after a later one started never makes the later outcome look stored', async () => {
	const releases: (() => void)[] = [];
	const { q } = fixture({
		put: () => new Promise<void>((resolve) => releases.push(resolve))
	});
	const tracked = q as unknown as {
		save(r: JobRec): Promise<void>;
		unsaved(id: string): boolean;
		recs: Map<string, JobRec>;
	};
	const r = { id: 'r', state: 'running', jobs: [], createdAt: 0 } as unknown as JobRec;
	tracked.recs.set('r', r);
	const progress = tracked.save(r);
	const final = tracked.save({ ...r, state: 'done' });
	releases[0](); // the earlier progress write lands first
	await progress;
	expect(tracked.unsaved('r')).toBe(true); // the done write is still pending
	releases[1]();
	await final;
	expect(tracked.unsaved('r')).toBe(false);
});

test('held results are saved while offline, and Clear finished keeps a finished record until it is stored', async () => {
	let online = true,
		blobBroken = true,
		ledgerBroken = false;
	const stored = new Map<string, JobRec>();
	const { q, run } = fixture({
		online: () => online,
		put: async (k, r) => {
			if (ledgerBroken && r.state === 'done') throw new Error('IndexedDB unavailable');
			stored.set(k, structuredClone(r));
		},
		get: async (k) => structuredClone(stored.get(k)),
		all: async () => [...stored.values()].map((r) => structuredClone(r)),
		del: async (k) => void stored.delete(k),
		api: async <T>(_key: string, method: string, endpoint: string): Promise<T> => {
			if (endpoint === '/balance') return {} as T;
			if (method === 'POST') return { background_job_id: 'j' } as T;
			return {
				id: 'j',
				status: 'completed',
				last_response: {
					image: {
						type: 'rgba_bytes',
						base64: bytesToBase64(new Uint8Array([1, 2, 3, 255])),
						width: 1,
						height: 1
					}
				}
			} as T;
		},
		putBlob: async () => {
			if (blobBroken) throw new Error('QuotaExceededError');
			return 'output';
		}
	});
	const record = await q.enqueue({ method: 'POST', path: '/edit-image-pro-flash', body: {} });
	await run(12);
	online = false;
	blobBroken = false;
	ledgerBroken = true; // results save offline, the final record save does not
	await run(70);
	expect(q.idle()).toBe(false); // cleanup must not collect its result blobs yet
	expect(await q.clearFinished(() => false)).toBe(0);
	ledgerBroken = false;
	await run(6);
	expect(stored.get(record.id)).toMatchObject({
		state: 'done',
		jobs: [{ results: [{ sha: 'output' }] }]
	});
});
