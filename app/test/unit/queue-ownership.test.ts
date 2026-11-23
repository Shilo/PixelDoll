import { expect, test, vi } from 'vitest';
import {
	ITEM_TRIAL_TAG,
	MOTION_LAB_TAG,
	Queue,
	type Deps,
	type JobRec
} from '../../src/lib/pixellab/queue.ts';
import { accountBalance } from './account-fixture.ts';

/** Name-aware Web Locks stand-in: one holder per name, FIFO waiters, ifAvailable. */
function namedLocks(names: string[]): Pick<LockManager, 'request'> {
	const state = new Map<string, { held: boolean; waiters: (() => void)[] }>();
	const slot = (n: string) =>
		state.get(n) ?? (state.set(n, { held: false, waiters: [] }), state.get(n)!);
	const grant = async (n: string, cb: LockGrantedCallback<unknown>) => {
		const s = slot(n);
		s.held = true;
		try {
			return await cb({ name: n, mode: 'exclusive' });
		} finally {
			s.held = false;
			s.waiters.shift()?.();
		}
	};
	return {
		request: ((
			name: string,
			a: LockOptions | LockGrantedCallback<unknown>,
			b?: LockGrantedCallback<unknown>
		) => {
			names.push(name);
			const [opts, cb] = typeof a === 'function' ? [{} as LockOptions, a] : [a, b!];
			const s = slot(name);
			if (!s.held) return grant(name, cb);
			if (opts.ifAvailable) return Promise.resolve(cb(null));
			return new Promise<unknown>((res) => s.waiters.push(() => res(grant(name, cb))));
		}) as LockManager['request']
	};
}

function setup() {
	const store = new Map<string, JobRec>(),
		names: string[] = [],
		locks = namedLocks(names);
	let t = 1000;
	const posts = { studio: 0, lab: 0 };
	const base = (who: 'studio' | 'lab'): Partial<Deps> => ({
		now: () => t,
		locks,
		online: () => true,
		put: async (k, r) => void store.set(k, structuredClone(r)),
		get: async (k) => structuredClone(store.get(k)),
		del: async (k) => store.delete(k),
		putBlob: async () => 'x',
		getBlob: async () => undefined,
		fetchBytes: async () => new Uint8Array(),
		api: async <T>(_k: string, method: string, path: string): Promise<T> => {
			if (path === '/balance') return accountBalance as T;
			if (method === 'POST') {
				posts[who]++;
				return { background_job_id: `${who}-${posts[who]}` } as T;
			}
			return { id: 'j', status: 'processing', created_at: '' } as T;
		}
	});
	const studio = new Queue({
		...base('studio'),
		channel: `studio-${crypto.randomUUID()}`,
		all: async () => [...store.values()].map((r) => structuredClone(r))
	});
	const lab = new Queue({
		...base('lab'),
		channel: `motion-lab-${crypto.randomUUID()}`,
		lockName: 'motion-lab-2026-10-28',
		recordTag: 'motion-lab-2026-10-28',
		all: async () =>
			[...store.values()]
				.filter((r) => r.tag === 'motion-lab-2026-10-28')
				.map((r) => structuredClone(r))
	});
	return {
		store,
		names,
		posts,
		studio,
		lab,
		advance: (ms: number) => {
			t += ms;
		}
	};
}

test('REVIEW Studio leader submits a Motion Lab record it adopted from the shared ledger', async () => {
	const f = setup();
	f.studio.setKey('synthetic');
	await f.studio.connect();
	f.lab.setKey('synthetic');
	await f.lab.connect();
	console.log('roles', f.studio.role, f.lab.role, 'lock names', [...new Set(f.names)]);
	const rec = await f.lab.enqueue(
		{ method: 'POST', path: '/animate-with-skeleton-v3', body: { seed: 7 } },
		{ tag: 'motion-lab-2026-10-28' }
	);
	for (let i = 0; i < 4; i++) {
		f.advance(31_000);
		await f.lab.tick();
		await f.studio.tick();
	}
	console.log('posts', JSON.stringify(f.posts), 'state', f.store.get(rec.id)?.state);
	f.studio.disconnect();
	f.lab.disconnect();
	expect(f.posts.lab).toBe(1);
	expect(f.posts.studio).toBe(0); // expected: only the Motion Lab queue (its own surface) submits lab work
});

test('REVIEW a Motion Lab leader starves Studio work: Studio never leads while the lab tab is open', async () => {
	const f = setup();
	f.lab.setKey('synthetic');
	await f.lab.connect();
	f.studio.setKey('synthetic');
	await f.studio.connect();
	console.log('roles', f.studio.role, f.lab.role);
	const rec = await f.studio.enqueue(
		{ method: 'POST', path: '/create-character-v3', body: { seed: 9 } },
		{ tag: 'studio-rig' }
	);
	f.studio.requestHandoff();
	for (let i = 0; i < 6; i++) {
		f.advance(31_000);
		await new Promise((r) => setTimeout(r, 20));
		await f.lab.tick();
		await f.studio.tick();
	}
	console.log(
		'posts',
		JSON.stringify(f.posts),
		'studio role',
		f.studio.role,
		'state',
		f.store.get(rec.id)?.state
	);
	f.studio.requestHandoff(false);
	f.studio.disconnect();
	f.lab.disconnect();
	expect(f.posts.studio + f.posts.lab).toBe(1);
});

test('Studio, Motion Lab and Item Trials load only the records owned by their surface', async () => {
	const records = [
		{ id: 'studio', tag: 'studio-base' },
		{ id: 'motion', tag: MOTION_LAB_TAG },
		{ id: 'trial', tag: ITEM_TRIAL_TAG }
	].map(({ id, tag }): JobRec => ({
		id,
		label: id,
		tag,
		method: 'POST',
		endpoint: '/edit-animation-v2',
		params: { seed: 7 },
		inputs: [],
		requestHash: id,
		state: 'done',
		attempts: 0,
		nextAt: 0,
		createdAt: 1,
		jobs: [],
		gens: 0,
		usd: 0
	}));
	const deps: Partial<Deps> = { all: async () => structuredClone(records) };
	const studio = new Queue(deps),
		motion = new Queue({ ...deps, recordTag: MOTION_LAB_TAG }),
		trial = new Queue({ ...deps, recordTag: ITEM_TRIAL_TAG });
	await Promise.all([studio.load(), motion.load(), trial.load()]);
	expect(studio.snapshot().jobs.map((job) => job.id)).toEqual(['studio']);
	expect(motion.snapshot().jobs.map((job) => job.id)).toEqual(['motion']);
	expect(trial.snapshot().jobs.map((job) => job.id)).toEqual(['trial']);
});

/** Two Studio tabs on one ledger, channel and lock; `leaderKey` connects first. */
async function twoTabs(leaderKey: string) {
	const store = new Map<string, JobRec>(),
		locks = namedLocks([]),
		channel = `studio-${crypto.randomUUID()}`,
		deletes: string[] = [];
	let t = 1000;
	const tab = (who: string): Partial<Deps> => ({
		now: () => t,
		locks,
		channel,
		online: () => true,
		put: async (k, r) => void store.set(k, structuredClone(r)),
		get: async (k) => structuredClone(store.get(k)),
		del: async (k) => store.delete(k),
		all: async () => [...store.values()].map((r) => structuredClone(r)),
		putBlob: async () => 'x',
		getBlob: async () => undefined,
		fetchBytes: async () => new Uint8Array(),
		api: async <T>(key: string, method: string, path: string): Promise<T> => {
			if (path === '/balance') return accountBalance as T;
			if (method === 'POST') return { background_job_id: 'job-1' } as T;
			if (method === 'DELETE') {
				deletes.push(`${who}:${key}`);
				return { usage: null } as T;
			}
			return { id: 'job-1', status: 'processing', created_at: '' } as T;
		}
	});
	const leader = new Queue(tab('leader'));
	leader.setKey(leaderKey);
	await leader.connect();
	const follower = new Queue(tab('follower'));
	await follower.connect();
	return {
		store,
		channel,
		deletes,
		leader,
		follower,
		advance: (ms: number) => void (t += ms),
		close: () => {
			leader.disconnect();
			follower.disconnect();
		}
	};
}

test('Stop in a follower tab is carried out by the leader, with the key that started the job', async () => {
	const f = await twoTabs('leader-key');
	try {
		expect([f.leader.role, f.follower.role]).toEqual(['leader', 'follower']);
		const rec = await f.leader.enqueue(
			{ method: 'POST', path: '/animate-with-skeleton-v3', body: { seed: 3 } },
			{ tag: 'studio-move' }
		);
		await vi.waitFor(async () => {
			f.advance(31_000);
			await f.leader.tick();
			expect(f.follower.snapshot().jobs.find((r) => r.id === rec.id)?.state).toBe('running');
		});
		await f.follower.cancel(rec.id); // this tab has no key
		await vi.waitFor(() => expect(f.store.get(rec.id)?.state).toBe('canceled'));
		expect(f.deletes).toEqual(['leader:leader-key']);
	} finally {
		f.close();
	}
});

test('Stop in a follower tab says so when PixelLab does not confirm the stop', async () => {
	const f = await twoTabs('leader-key');
	try {
		const deps = (f.leader as unknown as { deps: Deps }).deps;
		const api = deps.api;
		deps.api = async <T>(
			key: string,
			method: string,
			path: string,
			...rest: unknown[]
		): Promise<T> => {
			if (method === 'DELETE') throw new TypeError('Failed to fetch');
			return (api as (...args: unknown[]) => Promise<T>)(key, method, path, ...rest);
		};
		const rec = await f.leader.enqueue(
			{ method: 'POST', path: '/animate-with-skeleton-v3', body: { seed: 3 } },
			{ tag: 'studio-move' }
		);
		await vi.waitFor(async () => {
			f.advance(31_000);
			await f.leader.tick();
			expect(f.follower.snapshot().jobs.find((r) => r.id === rec.id)?.state).toBe('running');
		});
		await expect(f.follower.cancel(rec.id)).rejects.toMatchObject({
			translation: { key: 'activity.stopNotConfirmed' }
		});
		expect(f.store.get(rec.id)?.state).toBe('running'); // never shown as stopped while it may still charge
	} finally {
		f.close();
	}
});

test('a capacity broadcast updates only the published capacity, never the key, role or pause', async () => {
	const f = await twoTabs('leader-key');
	const raw = new BroadcastChannel(f.channel);
	try {
		f.follower.setKey('follower-key');
		const seen: Record<string, unknown>[] = [];
		f.follower.subscribe((state) =>
			seen.push({
				concurrency: state.concurrency,
				current: state.current,
				capacityPlan: state.capacityPlan,
				capacityRetryAt: state.capacityRetryAt,
				key: f.follower.key,
				role: f.follower.role,
				paused: state.paused
			})
		);
		raw.postMessage({
			capacity: {
				concurrency: 4,
				current: 2,
				capacityPlan: 'Tier 1',
				capacityRetryAt: 5,
				key: 'injected',
				role: 'leader',
				paused: 'auth'
			}
		});
		// The leader keeps publishing its own capacity: look at the follower when it applies this message.
		await vi.waitFor(() => expect(seen.some((state) => state.concurrency === 4)).toBe(true));
		expect(seen.find((state) => state.concurrency === 4)).toEqual({
			concurrency: 4,
			current: 2,
			capacityPlan: 'Tier 1',
			capacityRetryAt: 5,
			key: 'follower-key',
			role: 'follower',
			paused: null
		});
	} finally {
		raw.close();
		f.close();
	}
});

test('a keyless leader steps back before it re-reads the ledger for a connected tab', async () => {
	const f = await twoTabs('');
	const raw = new BroadcastChannel(f.channel);
	const roles: string[] = [];
	const read = f.leader.sync.bind(f.leader);
	f.leader.sync = async () => {
		roles.push(f.leader.role);
		return read();
	};
	try {
		raw.postMessage({ keyReady: true });
		await vi.waitFor(() => expect(roles.length).toBeGreaterThan(0));
		expect(roles[0]).toBe('follower');
	} finally {
		raw.close();
		f.close();
	}
});
