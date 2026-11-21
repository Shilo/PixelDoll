// IndexedDB "pixeldoll": projects (manifest JSON), blobs (sha256-keyed Blobs), jobs (queue ledger).
import { sha256, stableStringify } from '../image/hash.ts';
import { LocalizedError } from '../message.ts';
import type { StoredProject } from './project.ts';
import { workspaceCopy } from './workspace-mode.ts';

export type StoreName = 'projects' | 'blobs' | 'jobs';
export const CREATE_DRAFT_PREFIX = 'studio-create:';
// Bump when PixelLab request inputs change. Work saved with different inputs no longer matches its ledger records and would
// resend paid calls, so it waits for review instead of resuming by itself.
export const REQUEST_TEXT = 5; // 5: repair grids pack into the cheapest layout (2026-11-07)
const DB = 'pixeldoll',
	VERSION = 1;

let dbp: Promise<IDBDatabase> | null = null;
let copy: Record<StoreName, Map<string, unknown>> | undefined;
export function installWorkspaceCopy(projects: Map<string, unknown>, blobs: Map<string, Blob>) {
	if (!workspaceCopy || copy) throw new Error('Open a workspace copy in a separate tab.');
	copy = { projects, blobs, jobs: new Map() };
}

function open(): Promise<IDBDatabase> {
	if (workspaceCopy) throw new Error('This operation is not available in a workspace copy.');
	return (dbp ??= new Promise((res, rej) => {
		const r = indexedDB.open(DB, VERSION);
		r.onupgradeneeded = () => {
			const db = r.result;
			for (const s of ['projects', 'blobs', 'jobs'])
				if (!db.objectStoreNames.contains(s)) db.createObjectStore(s);
		};
		r.onsuccess = () => {
			r.result.onversionchange = () => r.result.close();
			res(r.result);
		}; // a newer tab's schema bump is never blocked
		r.onerror = () => rej(r.error);
		r.onblocked = () =>
			rej(new Error('storage is held by an older PixelDoll tab; close it and reload'));
	}));
}

async function tx<T>(
	store: StoreName,
	mode: IDBTransactionMode,
	fn: (s: IDBObjectStore) => IDBRequest<T>
): Promise<T> {
	const db = await open();
	return new Promise((res, rej) => {
		const t = db.transaction(store, mode);
		const req = fn(t.objectStore(store));
		t.oncomplete = () => res(req.result);
		t.onerror = t.onabort = () => rej(t.error ?? req.error);
	});
}

export const get = async <T>(s: StoreName, key: string) =>
	copy
		? (structuredClone(copy[s].get(key)) as T | undefined)
		: tx<T | undefined>(s, 'readonly', (o) => o.get(key));
export const put = async (s: StoreName, key: string, value: unknown) => {
	if (copy) {
		copy[s].set(key, structuredClone(value));
	} else await tx(s, 'readwrite', (o) => o.put(value, key));
};
export const del = async (s: StoreName, key: string) => {
	if (copy) copy[s].delete(key);
	else await tx(s, 'readwrite', (o) => o.delete(key));
};
export const all = async <T>(s: StoreName) =>
	copy
		? (structuredClone([...copy[s].values()]) as T[])
		: tx<T[]>(s, 'readonly', (o) => o.getAll());
export const clear = async (s: StoreName) => {
	if (copy) copy[s].clear();
	else await tx(s, 'readwrite', (o) => o.clear());
};

export async function readWorkspaceSnapshot(
	select: (key: string, value: unknown) => boolean,
	references: (records: Map<string, unknown>) => ReadonlyMap<string, unknown>,
	includeErrors: boolean
) {
	const db = await open();
	return new Promise<{ projects: Map<string, unknown>; blobs: Map<string, Blob>; jobs: unknown[] }>(
		(resolve, reject) => {
			const stores: StoreName[] = ['projects', 'blobs'];
			if (includeErrors) stores.push('jobs');
			const transaction = db.transaction(stores, 'readonly');
			const projects = new Map<string, unknown>();
			const blobs = new Map<string, Blob>();
			const jobs = includeErrors ? transaction.objectStore('jobs').getAll() : undefined;
			const cursor = transaction.objectStore('projects').openCursor();
			let error: unknown;
			cursor.onsuccess = () => {
				try {
					const row = cursor.result;
					if (row) {
						if (typeof row.key === 'string' && select(row.key, row.value))
							projects.set(row.key, row.value);
						row.continue();
					} else {
						const images = transaction.objectStore('blobs');
						for (const hash of references(projects).keys()) {
							const image = images.get(hash);
							image.onsuccess = () => {
								if (image.result instanceof Blob) blobs.set(hash, image.result);
							};
						}
					}
				} catch (cause) {
					error = cause;
					transaction.abort();
				}
			};
			transaction.oncomplete = () => resolve({ projects, blobs, jobs: jobs?.result ?? [] });
			transaction.onerror = transaction.onabort = () => reject(error ?? transaction.error);
		}
	);
}

/** Encoding happens before this transaction, so garbage collection cannot sweep an import's partial blob writes. */
export async function putCharacter(
	id: string,
	record: unknown,
	blobs: Map<string, Blob>
): Promise<void> {
	if (copy) {
		if (copy.projects.has(id)) throw new Error('This character already exists.');
		const saved = structuredClone(record);
		for (const [hash, blob] of blobs) copy.blobs.set(hash, blob);
		copy.projects.set(id, saved);
		return;
	}
	const db = await open();
	return new Promise((res, rej) => {
		const t = db.transaction(['projects', 'blobs'], 'readwrite');
		for (const [hash, blob] of blobs) t.objectStore('blobs').put(blob, hash);
		t.objectStore('projects').add(record, id);
		t.oncomplete = () => res();
		t.onerror = t.onabort = () => rej(t.error);
	});
}

/** Publish a completed rig without a gap between new image blobs and their project references. `stored`: blobs the record
 *  references that are already stored; they are checked in the same transaction, so a concurrent cleanup cannot sweep them
 *  between the check and the write. */
export async function updateCharacter<T>(
	id: string,
	blobs: Map<string, Blob>,
	fn: (record: T | undefined) => T,
	stored?: { keys: Iterable<string>; missing: (key: string) => Error }
): Promise<void> {
	if (copy) {
		for (const key of stored?.keys ?? []) if (!copy.blobs.has(key)) throw stored!.missing(key);
		const saved = structuredClone(fn(structuredClone(copy.projects.get(id)) as T | undefined));
		for (const [hash, blob] of blobs) copy.blobs.set(hash, blob);
		copy.projects.set(id, saved);
		return;
	}
	const db = await open();
	return new Promise((res, rej) => {
		const t = db.transaction(['projects', 'blobs'], 'readwrite'),
			projects = t.objectStore('projects'),
			read = projects.get(id),
			keys = [...(stored?.keys ?? [])];
		let error: unknown,
			pending = keys.length + 1,
			missing: string | undefined;
		const write = () => {
			if (--pending) return;
			try {
				if (missing) throw stored!.missing(missing);
				const record = fn(read.result);
				for (const [hash, blob] of blobs) t.objectStore('blobs').put(blob, hash);
				projects.put(record, id);
			} catch (e) {
				error = e;
				t.abort();
			}
		};
		read.onsuccess = write;
		for (const key of keys) {
			const count = t.objectStore('blobs').count(key);
			count.onsuccess = () => {
				if (!count.result) missing ??= key;
				write();
			};
		}
		t.oncomplete = () => res();
		t.onerror = t.onabort = () => rej(error ?? t.error);
	});
}

/** A record's change when characters `ids` are deleted: their drafts leave the shared draft lists; undefined when the record
 * does not depend on them. */
export function withoutCharacters(r: any, ids: Set<string>): Record<string, unknown> | undefined {
	const list = r?.id === 'studio-drafts' ? 'gens' : r?.id === 'm3-drafts' ? 'drafts' : undefined;
	if (!list) return;
	const kept = r[list].filter(
		(d: { rigId?: string; draft?: { rigId: string } }) => !ids.has(d.draft?.rigId ?? d.rigId!)
	);
	return kept.length === r[list].length ? undefined : { ...r, [list]: kept };
}

type IdleAction =
	'delete' | 'change directions for' | 'replace body frames of' | 'change the frame of';

async function editIdleCharacter(
	id: string,
	action: IdleAction,
	edit: (
		projects: { delete(key: string): void; put(value: unknown, key: string): void },
		records: any[]
	) => void,
	blobs?: Map<string, Blob>,
	/** Frame size from a stopped move's review: that failed move of this character waits for the resize and continues on
	 *  it, so it does not hold the edit. Any other stopped or running work still does. */
	stoppedMove = false
): Promise<void> {
	if (!id.startsWith('rig-')) throw new Error(`You can only ${action} a saved character.`);
	if (copy) {
		const projects = new Map(copy.projects);
		edit(
			{
				delete: (key) => projects.delete(key),
				put: (value, key) => projects.set(key, structuredClone(value))
			},
			[...projects.values()]
		);
		for (const [hash, blob] of blobs ?? []) copy.blobs.set(hash, blob);
		copy.projects = projects;
		return;
	}
	const db = await open();
	return new Promise((res, rej) => {
		const t = db.transaction(
				blobs?.size ? ['projects', 'jobs', 'blobs'] : ['projects', 'jobs'],
				'readwrite'
			),
			projects = t.objectStore('projects');
		const records = projects.getAll(),
			jobs = t.objectStore('jobs').getAll();
		let error: unknown;
		jobs.onsuccess = () => {
			const busy = jobs.result.some((j) => ['queued', 'submitting', 'running'].includes(j.state));
			// Running work could write any character back. Stopped work waits for the user and holds only its own character.
			const holds = (r: {
				status?: string;
				requestText?: number;
				projectId?: string;
				spec?: { projectId?: string };
				queued?: { projectId?: string }[];
			}) =>
				(r.status === 'running' && r.requestText === REQUEST_TEXT) || // older inputs wait for review
				r.projectId === id ||
				r.spec?.projectId === id ||
				!!r.queued?.some((queued) => queued.projectId === id);
			const waits = (r: { id?: string; status?: string; projectId?: string; queued?: unknown[] }) =>
				stoppedMove &&
				r.id === 'studio-move' &&
				r.status === 'failed' &&
				r.projectId === id &&
				!r.queued?.length;
			const work = records.result.some(
				(r) =>
					((r?.id?.startsWith(CREATE_DRAFT_PREFIX) ||
						r?.id === 'studio-move' ||
						r?.id === 'studio-setup') &&
						holds(r) &&
						!waits(r)) ||
					(r?.id === 'studio-drafts' &&
						r.gens?.some((g: { phase: string }) => g.phase === 'running'))
			);
			try {
				if (busy || work)
					throw action === 'delete'
						? new LocalizedError(
								'Finish or dismiss pending generation work before deleting a character.',
								'state.finishBeforeCharacterRemoval'
							)
						: action === 'replace body frames of'
							? new LocalizedError(
									'Wait for the current generation work to finish before fixing frames.',
									'state.finishBeforeFixFrames'
								)
							: action === 'change the frame of'
								? new LocalizedError(
										'Finish or dismiss pending generation work before changing the frame size.',
										'state.finishBeforeFrameChange'
									)
								: new LocalizedError(
										'Finish or dismiss pending generation work before changing directions.',
										'state.finishBeforeDirectionRemoval'
									);
				edit(projects, records.result);
				for (const [hash, blob] of blobs ?? []) t.objectStore('blobs').put(blob, hash);
			} catch (failure) {
				error = failure;
				t.abort();
			}
		};
		t.oncomplete = () => res();
		t.onerror = t.onabort = () => rej(error ?? t.error);
	});
}

/** Delete a local character and its drafts atomically, refusing work that could later write it back. Shared blobs stay. */
export async function deleteCharacter(id: string): Promise<void> {
	await editIdleCharacter(id, 'delete', (projects, records) => {
		projects.delete(id);
		for (const record of records) {
			const change = withoutCharacters(record, new Set([id]));
			if (change) projects.put(change, record.id);
		}
	});
}

/** Replace a whole character record while no generation work could write it back, refusing if it changed since `original`. */
export async function saveIdleCharacter(
	original: StoredProject,
	next: StoredProject,
	blobs: Map<string, Blob>,
	action: Exclude<IdleAction, 'delete'>,
	stoppedMove = false
): Promise<void> {
	const { id } = original;
	const version = stableStringify(original);
	const frames = action === 'replace body frames of',
		frame = action === 'change the frame of';
	await editIdleCharacter(
		id,
		action,
		(projects, records) => {
			if (records.some((record) => withoutCharacters(record, new Set([id]))))
				throw frames
					? new LocalizedError(
							'Keep or dismiss this character’s item drafts before replacing body frames.',
							'fixFrames.errors.resolveDrafts'
						)
					: frame
						? new LocalizedError(
								'Keep or dismiss this character’s item drafts before changing the frame size.',
								'frameSheet.errors.resolveDrafts'
							)
						: new Error('Keep or dismiss this character’s item drafts before changing directions.');
			if (stableStringify(records.find((record) => record?.id === id)) !== version)
				throw frames
					? new LocalizedError(
							'These frames changed since your review. Import the file again.',
							'fixFrames.errors.changed'
						)
					: frame
						? new LocalizedError(
								'This character changed. Reopen Frame size to review the latest version.',
								'frameSheet.errors.changed'
							)
						: new Error(
								'This character changed. Close and reopen Directions to review the latest version.'
							);
			projects.put(next, id);
		},
		blobs,
		stoppedMove
	);
}

type RelatedRecord = <R>(key: string) => R | undefined;

export function update<T>(
	s: StoreName,
	key: string,
	fn: (v: T | undefined, related: RelatedRecord) => T,
	relatedKeys: readonly string[]
): Promise<T>;
export function update<T>(s: StoreName, key: string, fn: (v: T | undefined) => T): Promise<T>;
/** Atomic read-modify-write: get + put in ONE readwrite transaction, so concurrent writers (another accept, autosave, another
 * tab) queue behind it instead of overwriting each other. `fn` must be synchronous: do async work (hashing, blob writes) first.
 * Related records in the same store can be read for conflict checks. Throwing in `fn` aborts without writing. */
export async function update<T>(
	s: StoreName,
	key: string,
	fn: (v: T | undefined, related: RelatedRecord) => T,
	relatedKeys: readonly string[] = []
): Promise<T> {
	if (copy) {
		const records = copy[s];
		const result = fn(structuredClone(records.get(key)) as T | undefined, <R>(related: string) =>
			relatedKeys.includes(related)
				? (structuredClone(records.get(related)) as R | undefined)
				: undefined
		);
		copy[s].set(key, structuredClone(result));
		return result;
	}
	const db = await open();
	return new Promise((res, rej) => {
		const t = db.transaction(s, 'readwrite'),
			o = t.objectStore(s),
			g = o.get(key),
			related = new Map(
				[...new Set(relatedKeys)].map((relatedKey) => [relatedKey, o.get(relatedKey)])
			);
		let out: T, err: unknown;
		const write = () => {
			try {
				out = fn(
					g.result as T | undefined,
					<R>(relatedKey: string) => related.get(relatedKey)?.result as R | undefined
				);
				o.put(out, key);
			} catch (e) {
				err = e;
				t.abort();
			}
		};
		(related.size ? [...related.values()].at(-1)! : g).onsuccess = write;
		t.oncomplete = () => res(out);
		t.onerror = t.onabort = () => rej(err ?? t.error);
	});
}

/** Atomically claim one ledger record. Selection runs against the latest jobs in the same transaction as insert;
 * returning an existing record never rewrites it. The callback must be synchronous and may throw to abort. */
export async function claimJob<T extends { id: string }>(
	record: T,
	chooseExisting: (records: T[]) => T | undefined
): Promise<T> {
	if (copy) {
		const existing = chooseExisting(structuredClone([...copy.jobs.values()]) as T[]);
		if (existing) return existing;
		if (copy.jobs.has(record.id)) throw new DOMException('Job already exists.', 'ConstraintError');
		copy.jobs.set(record.id, structuredClone(record));
		return record;
	}
	const database = await open();
	return new Promise((resolve, reject) => {
		const transaction = database.transaction('jobs', 'readwrite'),
			jobs = transaction.objectStore('jobs'),
			read = jobs.getAll();
		let result: T, error: unknown;
		read.onsuccess = () => {
			try {
				const existing = chooseExisting(read.result as T[]);
				result = existing ?? record;
				if (!existing) jobs.add(record, record.id);
			} catch (e) {
				error = e;
				transaction.abort();
			}
		};
		transaction.oncomplete = () => resolve(result);
		transaction.onerror = transaction.onabort = () => reject(error ?? transaction.error);
	});
}
/** Mark-and-sweep in one transaction over all stores: a blob survives when any project/draft/job record mentions its hash
 * (as "<hex>" or "sha256:<hex>"). Returns the number of blobs deleted.
 * ponytail: conservative deep string scan (a requestHash can keep a blob alive; harmless). Callers run it only while this tab
 * is idle, because writers put cell blobs one transaction before the record that references them. */
export async function gcBlobs(): Promise<number> {
	if (copy) return 0;
	const db = await open();
	return new Promise((res, rej) => {
		const t = db.transaction(['projects', 'jobs', 'blobs'], 'readwrite');
		const p = t.objectStore('projects').getAll(),
			j = t.objectStore('jobs').getAll(),
			b = t.objectStore('blobs').getAllKeys();
		const refs = new Set<string>();
		const scan = (v: unknown): void => {
			if (typeof v === 'string') {
				const m = /^(?:sha256:)?([0-9a-f]{64})$/.exec(v);
				if (m) refs.add(m[1]);
			} else if (v && typeof v === 'object' && !(v instanceof Blob))
				for (const x of Object.values(v)) scan(x);
		};
		let n = 0;
		b.onsuccess = () => {
			// requests in one transaction complete in order: p and j are done
			for (const r of [...p.result, ...j.result]) scan(r);
			for (const k of b.result)
				if (!refs.has(String(k))) {
					t.objectStore('blobs').delete(k);
					n++;
				}
		};
		t.oncomplete = () => res(n);
		t.onerror = t.onabort = () => rej(t.error);
	});
}

// Content-addressed: key = sha256 hex of the bytes. Identical files dedupe.
export async function putBlob(bytes: Uint8Array, type = 'image/png'): Promise<string> {
	const key = await sha256(bytes);
	if (!(await get('blobs', key)))
		await put('blobs', key, new Blob([bytes as Uint8Array<ArrayBuffer>], { type }));
	return key;
}
export const getBlob = (key: string) => get<Blob>('blobs', key);

let persistAsked = false;
export function askPersist() {
	if (persistAsked || workspaceCopy) return;
	persistAsked = true;
	navigator.storage?.persist?.().catch(() => {});
}

export async function selfTest() {
	const k = 'selftest-' + Math.random();
	await put('projects', k, { a: 1 });
	console.assert((await get<{ a: number }>('projects', k))?.a === 1, 'db put/get');
	await del('projects', k);
	console.assert((await get('projects', k)) === undefined, 'db delete');
	const sha = await putBlob(new Uint8Array([1, 2, 3]), 'application/octet-stream');
	console.assert(
		sha === '039058c6f2c0cb492c533b0a4d14ef77cc0f78abccced5287d84a1a2011cfb81',
		'putBlob key'
	);
	console.assert((await getBlob(sha))?.size === 3, 'getBlob');
	await del('blobs', sha);
	await Promise.all(
		[1, 2, 3].map(() => update<{ n: number }>('projects', k, (r) => ({ n: (r?.n ?? 0) + 1 })))
	); // P1-5: no lost update
	console.assert((await get<{ n: number }>('projects', k))?.n === 3, 'db update is atomic');
	await update('projects', k, () => {
		throw new Error('x');
	}).catch(() => {});
	console.assert((await get<{ n: number }>('projects', k))?.n === 3, 'db update aborts on throw');
	const claimGroup = 'selftest-claim-' + Math.random(),
		candidates = Array.from({ length: 10 }, (_, i) => ({
			id: `${claimGroup}-${i}`,
			group: claimGroup,
			state: 'done',
			jobs: [],
			createdAt: Date.now(),
			progress: 0
		}));
	const choose = (records: typeof candidates) => records.find((r) => r.group === claimGroup);
	try {
		const claims = await Promise.all(candidates.map((candidate) => claimJob(candidate, choose)));
		console.assert(
			claims.every((r) => r.id === claims[0].id),
			'db claim serializes concurrent insert-if-absent requests'
		);
		const winner = claims[0];
		await update<typeof winner>('jobs', winner.id, (current) => ({ ...current!, progress: 2 }));
		const resumed = await claimJob({ ...winner, progress: 0 }, choose);
		console.assert(
			resumed.progress === 2 && (await get<typeof winner>('jobs', winner.id))?.progress === 2,
			'db claim never overwrites progressed existing work'
		);
		const forbidden = { ...winner, id: `${claimGroup}-forbidden` };
		let rejected = false;
		try {
			await claimJob(forbidden, () => {
				throw new Error('stale consent');
			});
		} catch {
			rejected = true;
		}
		console.assert(
			rejected && !(await get('jobs', forbidden.id)),
			'db claim callback failure inserts no record'
		);
	} finally {
		await Promise.all(candidates.map((candidate) => del('jobs', candidate.id)));
	}
	await del('projects', k); // gcBlobs is not run here: it sweeps the whole origin's store (probe in B13 report)
}
