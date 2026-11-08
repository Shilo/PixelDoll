import { expect, test } from 'vitest';
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
		{ tag: 'motion-lab-2026-10-28', playerRequested: true }
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
		{ tag: 'studio-rig', playerRequested: true }
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
