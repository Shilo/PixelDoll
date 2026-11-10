import { expect, test } from 'vitest';
import { Queue, requestIdentity, type Deps, type JobRec } from '../../src/lib/pixellab/queue.ts';
import { accountBalance } from './account-fixture.ts';

const request = { method: 'POST' as const, path: '/animate-with-skeleton-v3', body: { seed: 17 } };
const tags = ['m3', 'studio-move', 'studio-rig'];
function fixture() {
	const records = new Map<string, JobRec>(),
		calls: { method: string; path: string }[] = [];
	let now = 1000;
	const deps: Partial<Deps> = {
		locks: null,
		online: () => true,
		now: () => now,
		put: async (id, r) => {
			records.set(id, structuredClone(r));
		},
		get: async (id) => {
			const r = records.get(id);
			return r && structuredClone(r);
		},
		all: async () => [...records.values()].map((r) => structuredClone(r)),
		api: async <T>(_key: string, method: string, path: string): Promise<T> => {
			if (path === '/balance') return accountBalance as T;
			calls.push({ method, path });
			return (
				method === 'POST'
					? { background_job_id: 'accepted-job' }
					: path.startsWith('/background-jobs/')
						? { id: 'accepted-job', status: 'processing' }
						: {}
			) as T;
		}
	};
	const make = () => {
		const q = new Queue(deps);
		q.setKey('synthetic-key');
		return q;
	};
	return {
		records,
		calls,
		make,
		advance: () => {
			now += 60_000;
		}
	};
}
async function saved(tag: string, overrides: Partial<JobRec> = {}): Promise<JobRec> {
	const { requestHash } = await requestIdentity(request);
	return {
		id: 'saved-generation',
		label: 'Retained generation',
		tag,
		method: 'POST',
		endpoint: request.path,
		params: request.body,
		inputs: [],
		requestHash,
		state: 'queued',
		attempts: 0,
		requestStarted: false,
		nextAt: 0,
		createdAt: 1000,
		jobs: [],
		gens: 0,
		usd: 0,
		...overrides
	};
}

test.each(tags)('a queued %s generation submits exactly once across reload', async (tag) => {
	const f = fixture(),
		q = f.make(),
		r = await q.enqueue(request, { tag });
	await q.tick();
	expect(f.calls.filter((c) => c.method === 'POST')).toHaveLength(1);
	const resumed = f.make();
	await resumed.load();
	await resumed.tick();
	await resumed.tick();
	expect(f.calls.filter((c) => c.method === 'POST')).toHaveLength(1);
	expect(f.calls.filter((c) => c.path === '/background-jobs/accepted-job')).toHaveLength(1);
	expect(f.records.get(r.id)!.state).toBe('running');
});

test.each(['queued', 'submitting', 'running'] as const)(
	'old %s records with accepted remote jobs only poll and never resend',
	async (state) => {
		const f = fixture(),
			r = await saved('studio-rig', {
				state,
				attempts: 1,
				requestStarted: true,
				jobs: [{ id: 'accepted-job', status: 'processing', done: false, results: [] }]
			});
		f.records.set(r.id, r);
		const q = f.make();
		await q.load();
		await q.tick();
		expect(f.calls).toEqual([{ method: 'GET', path: '/background-jobs/accepted-job' }]);
		expect(f.records.get(r.id)!.state).toBe('running');
	}
);

test.each(['lost', 'failed', 'canceled', 'done'] as const)(
	'a new request never replaces a matching old %s receipt automatically',
	async (state) => {
		const f = fixture(),
			r = await saved('m3', { state, attempts: 1 });
		f.records.set(r.id, r);
		const q = f.make();
		await q.load();
		const reused = await q.enqueue(request, { tag: 'm3' });
		await q.tick();
		expect(reused.id).toBe(r.id);
		expect(reused.state).toBe(state);
		expect(f.calls).toHaveLength(0);
		expect(f.records.size).toBe(1);
	}
);

test('leader adoption of an accepted follower job only polls its existing remote identity', async () => {
	const f = fixture(),
		q = f.make();
	q.role = 'leader';
	await q.load();
	const r = await saved('studio-move', {
		jobs: [{ id: 'accepted-job', status: 'processing', done: false, results: [] }]
	});
	f.records.set(r.id, r);
	f.advance();
	await q.tick();
	expect(f.calls).toEqual([{ method: 'GET', path: '/background-jobs/accepted-job' }]);
	expect(f.records.get(r.id)!.state).toBe('running');
});
