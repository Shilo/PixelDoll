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
		claimEstimate: async (candidate, choose) => {
			const existing = choose([...records.values()].map((record) => structuredClone(record)));
			if (existing) return existing;
			records.set(candidate.id, structuredClone(candidate));
			return candidate;
		},
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

test('a stale queued-only cancel and the first submission are mutually exclusive on the stored record', async () => {
	const f = fixture(),
		r = await saved('studio-move');
	f.records.set(r.id, r);
	const leader = f.make(),
		follower = f.make();
	leader.role = 'leader';
	follower.role = 'follower';
	await leader.load();
	await follower.load();
	await follower.cancel(r.id, true);
	await leader.tick();
	expect(f.calls).toHaveLength(0);
	expect(f.records.get(r.id)!.state).toBe('canceled');
	expect(leader.snapshot().jobs[0].state).toBe('canceled');

	const g = fixture(),
		s = await saved('studio-move');
	g.records.set(s.id, s);
	const first = g.make(),
		stale = g.make();
	first.role = 'leader';
	stale.role = 'follower';
	await first.load();
	await stale.load();
	await first.tick();
	await stale.cancel(s.id, true);
	expect(g.calls.filter((c) => c.method === 'POST')).toHaveLength(1);
	expect(g.records.get(s.id)).toMatchObject({
		state: 'running',
		jobs: [{ id: 'accepted-job' }]
	});
	expect(stale.snapshot().jobs[0].state).toBe('running');
});

test('a fresh joint quote cannot replace a durable lost check invisible to its tab', async () => {
	const f = fixture();
	const estimate = { method: 'POST', path: '/estimate-skeleton' } as const;
	const { requestHash } = await requestIdentity(estimate);
	const follower = f.make();
	await follower.load();
	const uncertain = await saved('m2-skel', {
		endpoint: estimate.path,
		requestHash,
		state: 'lost',
		requestStarted: true
	});
	f.records.set(uncertain.id, uncertain);
	await expect(
		follower.enqueue(estimate, {
			tag: 'm2-skel',
			attempt: 2,
			quotedEstimate: {
				reuseOnly: false,
				changed: () => {
					throw new Error('Quote changed');
				}
			}
		})
	).rejects.toThrow('Quote changed');
	await follower.tick();
	expect(f.calls).toHaveLength(0);
	expect(f.records.size).toBe(1);
});
