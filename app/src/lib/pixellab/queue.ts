// One job queue for every PixelLab call (architecture §9).
// Ledger rule: a record is persisted before submit, its background_job_ids right after, result PNGs the moment a job completes.
// A record with job ids is never resubmitted; reload resumes polling. A paid POST without a clear "rejected" answer (network
// error, 500/502/504, timeout) is marked lost, never resent: the server may have created and charged the job.
// Cross-tab: only the tab holding the Web Lock "pixeldoll-queue" submits/polls (leader). Other tabs (followers) mirror the
// ledger: every save posts the record id on a same-origin BroadcastChannel and the other tabs read just that record (full
// re-read every 30 s as a fallback). The leader adopts records a follower wrote, dropping duplicates of its own requests.
// Only a leader marks orphaned `submitting` records lost, so another live tab's in-flight jobs are never touched.
// Credentials stay in the connected tab. BroadcastChannel is origin-wide (including sibling Pages sites), so it carries
// only ledger notifications and a credential-free forget signal; keys are never broadcast or accepted from messages.
import {
	api as realApi,
	ApiError,
	type ErrorKind,
	jobErrorCode,
	jobFailureText,
	isNetwork,
	isPolicy,
	hasJobEvidence,
	noAnimationJobsStarted,
	paidRequestRejected
} from './client.ts';
import {
	jobIdsOf,
	jobImages,
	type Balance,
	type Job,
	type Req,
	type SubmitResponse,
	type Usage
} from './routes.ts';
import { planCapacity, requestedSlots } from './capacity.ts';
import { PLAN_JOB_LIMITS, planRestriction, requestTier } from './plans.ts';
import { sha256, stableStringify } from '../image/hash.ts';
import { base64ToBytes, bytesToBase64, pngSize } from '../image/png.ts';
import { encodePngBytes } from '../image/pngraw.ts';
import * as db from '../store/db.ts';
import {
	activityRequest,
	beginActivityCall,
	finishActivityCall,
	requestCost,
	restoreActivityRequest,
	usageOf,
	type ActivityContext
} from './activity.ts';

import { workspaceCopy } from '../store/workspace-mode.ts';
import { LocalizedError, message, type Message } from '../message.ts';

export type RecState =
	'queued' | 'submitting' | 'running' | 'done' | 'failed' | 'canceled' | 'lost';
export interface Result {
	label: string;
	sha: string;
	w?: number;
	h?: number;
}
export interface SubJob {
	id: string; // background_job_id
	characterId?: string;
	status: string; // remote status word
	done: boolean;
	remoteDone?: boolean; // completed remotely, downloads may still be pending
	usage?: Usage | null;
	progress?: number;
	queuePosition?: number;
	eta?: number;
	lastPoll?: number;
	tries?: number; // failed result downloads (backoff, give up after MAX_TRIES)
	unsaved?: number; // valid results this device failed to save in a row: retried with backoff, never given up
	pendingUrls?: { label: string; url: string }[];
	results: Result[];
	error?: string;
	policy?: boolean;
	failedAtProvider?: true;
	errorCode?: number;
}
export interface JobRec {
	id: string;
	label: string;
	/** The row title users read in Activity, localized when shown; `label` stays the English text for the ledger and reports. */
	title?: Message;
	tag?: string;
	activityScope?: string;
	method: Req['method'];
	endpoint: string;
	params: unknown; // request body; images replaced by {$blob: sha256}; never the key
	inputs: string[]; // input blob hashes
	requestHash: string;
	state: RecState;
	attempts: number;
	requestStarted?: boolean; // persisted immediately before transport; false means preparation never reached a request
	nextAt: number;
	waitingForCapacity?: boolean;
	minimumTier?: number;
	waitingForPlan?: string;
	createdAt: number;
	submittedAt?: number;
	finishedAt?: number;
	response?: unknown; // submit response, long strings stripped
	jobs: SubJob[];
	error?: string;
	/** The class of the last API error (client.ts classify): Activity says what a refusal means without reading its text. */
	errorKind?: ErrorKind;
	estimateRecovery?: { id: string; retryOf?: string }; // explicit, persisted measurement-only retry; original unknown record is retained
	autoCanceledAttempts?: number[]; // known automatic pre-submit cancellation; only a distinct explicit attempt may reopen
	gens: number; // reported charges only; with costUnknown they are a known part, never the whole cost
	usd: number;
	costUnknown?: true; // settled without a usage report for every job: the cost is unknown, never $0
}

const isManagedState = (record: JobRec) =>
	record.method === 'POST' && record.endpoint === '/create-character-state';

export function managedStateSubmitChildId(record: JobRec): string | undefined {
	if (!isManagedState(record) || record.jobs.length !== 1) return undefined;
	const submit = record.response as SubmitResponse | null | undefined;
	const parentId = (record.params as { character_id?: unknown } | null)?.character_id;
	const childId = submit?.character_id;
	if (
		!submit?.background_job_id ||
		submit.background_job_id !== record.jobs[0].id ||
		typeof childId !== 'string' ||
		!/^\S+$/.test(childId) ||
		childId === parentId
	)
		return undefined;
	return childId;
}

const UNREADABLE =
	'This saved request could not be read. It was not resent; its result and cost are unknown.';
/** A stored row the queue can show, or undefined when it is not a record at all. Older or damaged rows never stop the app
 *  from opening: a record whose jobs or results cannot be read becomes terminal and unreadable (lost: it may have been
 *  charged), so it is listed but never polled, downloaded or resent. */
export function readableRecord(raw: unknown): JobRec | undefined {
	if (!raw || typeof raw !== 'object' || typeof (raw as { id?: unknown }).id !== 'string')
		return undefined;
	const r = raw as JobRec;
	const subJob = (s: unknown): s is SubJob => !!s && typeof s === 'object';
	// Readers sort and open each result by its label and hash, so a damaged entry makes the whole record unreadable.
	const result = (x: unknown): x is Result =>
		!!x &&
		typeof x === 'object' &&
		typeof (x as Result).label === 'string' &&
		typeof (x as Result).sha === 'string';
	if (
		Array.isArray(r.jobs) &&
		r.jobs.every((s) => subJob(s) && Array.isArray(s.results) && s.results.every(result)) &&
		typeof r.createdAt === 'number'
	)
		return r;
	const unreadable: JobRec = {
		...r,
		state: 'lost',
		createdAt: typeof r.createdAt === 'number' ? r.createdAt : 0,
		jobs: (Array.isArray(r.jobs) ? r.jobs : [])
			.filter(subJob)
			// Results that are still whole stay listed, so what was saved can be found again; nothing is resent.
			.map((s) => ({
				...s,
				done: true,
				results: Array.isArray(s.results) ? s.results.filter(result) : []
			})),
		error: UNREADABLE,
		costUnknown: true
	};
	repaired.add(unreadable);
	return unreadable;
}
/** Records readableRecord rebuilt from a damaged row: load stores them once, so every reader of the store sees them lost. */
const repaired = new WeakSet<JobRec>();

export function queueErrorParts(record: JobRec): (Message | string)[] {
	const raw = record.error;
	if (!raw) return [];
	if (raw === UNREADABLE) return [message('activity.error.unreadable')];
	const failed = record.jobs.filter((job) => job.error);
	if (failed.length && raw === failed.map((job) => job.error).join(' | '))
		return failed.map((job) => {
			const error = job.error!;
			if (job.failedAtProvider) return error;
			if (job.done && job.status === 'lost') return message('activity.error.jobMissing');
			if (job.done && job.status === 'failed') {
				const malformed =
					/^PixelLab sent a malformed result \(([\s\S]*)\); the cost may be spent$/.exec(error);
				if (malformed) return message('activity.error.malformed', { error: malformed[1] });
				const urls = job.pendingUrls?.map(({ url }) => url).join(' ');
				const suffix = `. Download manually: ${urls}`;
				const prefix = `result download failed ${job.tries}x: `;
				if (urls && job.tries && error.startsWith(prefix) && error.endsWith(suffix))
					return message('activity.error.download', {
						count: job.tries,
						error: error.slice(prefix.length, -suffix.length),
						urls
					});
			}
			return error;
		});
	if (record.state === 'lost') {
		if (
			raw ===
			'page closed during submit; the job may have run (check pixellab.ai). Not resubmitted.'
		)
			return [message('activity.error.closedDuringSubmit')];
		const evidence =
			/^PixelLab returned job evidence with an error \(([\s\S]*)\)\. The request may have run and been charged; not resent\.$/.exec(
				raw
			);
		if (evidence) return [message('activity.error.jobEvidence', { error: evidence[1] })];
		const unclear =
			/^no clear answer from PixelLab \(([\s\S]*)\)\. The job may have run and been charged \(check pixellab\.ai\); not resent\.$/.exec(
				raw
			);
		if (unclear) return [message('activity.error.unclearAnswer', { error: unclear[1] })];
	}
	if (record.state === 'failed' && record.requestStarted === false) {
		if (raw === 'page closed before request preparation finished; nothing was sent.')
			return [message('activity.error.closedBeforeSend')];
		if (raw === 'request could not be saved; nothing was sent')
			return [message('activity.error.notSaved')];
		const missing = /^input image (\S+) missing from storage; nothing was sent$/.exec(raw);
		if (missing && record.inputs.some((hash) => hash.slice(0, 12) === missing[1]))
			return [message('activity.error.missingInput', { hash: missing[1] })];
	}
	if (record.state === 'canceled') {
		if (raw === 'Request stopped before sending. No API request was made.')
			return [message('activity.error.stoppedBeforeSend')];
		const duplicate = /^duplicate of (\S+) \(sent from two tabs\)$/.exec(raw);
		if (duplicate) return [message('activity.error.duplicate', { id: duplicate[1] })];
	}
	return [raw];
}

export type Role = 'solo' | 'leader' | 'follower';
export interface QueueSnapshot {
	jobs: JobRec[];
	role: Role;
	paused: null | 'auth' | 'credits' | 'offline' | 'storage'; // offline (B15): browser offline or a request got no answer; storage: the ledger could not be read or saved; nothing is sent
	concurrency: number;
	current: number;
	capacityPlan: string | null;
	capacityRetryAt: number;
	sessionGens: number;
	sessionUsd: number;
	sessionUnknown: number; // calls settled this session whose cost PixelLab did not report
	counts: Record<'pending' | 'running' | 'failed' | 'done', number>;
}

export interface Deps {
	api: <T>(
		key: string,
		method: string,
		path: string,
		body?: unknown,
		signal?: AbortSignal,
		context?: ActivityContext
	) => Promise<T>;
	put: (key: string, rec: JobRec) => Promise<void>;
	claimEstimate: (
		rec: JobRec,
		chooseExisting: (records: JobRec[]) => JobRec | undefined
	) => Promise<JobRec>;
	get: (key: string) => Promise<JobRec | undefined>;
	/** Atomic read-modify-write of one record: `next` sees the stored record and returns the record to write, or undefined to
	 * leave it untouched. Resolves with the record stored afterward. `next` must be synchronous. */
	transition: (
		key: string,
		next: (stored: JobRec | undefined) => JobRec | undefined
	) => Promise<JobRec | undefined>;
	del: (key: string) => Promise<unknown>;
	all: () => Promise<JobRec[]>;
	putBlob: (bytes: Uint8Array) => Promise<string>;
	getBlob: (sha: string) => Promise<Blob | undefined>;
	fetchBytes: (url: string, context?: ActivityContext) => Promise<Uint8Array>;
	now: () => number;
	locks: Pick<LockManager, 'request'> | null; // Web Locks (null = single tab)
	channel: string; // cross-tab BroadcastChannel; self-tests use their own so they never signal the live app's tabs
	lockName: string;
	recordTag?: string; // a separate queue owns only this tag; Studio excludes the research queue
	online: () => boolean; // navigator.onLine
}

const POLL_MS = 5000,
	SYNC_MS = 1500,
	ASK_MS = 500,
	FULL_SYNC_MS = 30_000,
	MAX_TRIES = 10,
	MAX_PX = 2048,
	LOCK = 'pixeldoll-queue';
export const MOTION_LAB_TAG = 'motion-lab-2026-10-28';
export const ITEM_TRIAL_TAG = 'item-trials-2026-11-06';
const LOST_AFTER_MS = 120_000;
const PROBE_MS = 15_000;

export const live = (r?: JobRec) =>
	!!r && (r.state === 'queued' || r.state === 'submitting' || r.state === 'running');
const seededOf = (r: JobRec) => typeof (r.params as { seed?: unknown } | null)?.seed === 'number';
type CapacityState = Pick<
	QueueSnapshot,
	'concurrency' | 'current' | 'capacityPlan' | 'capacityRetryAt'
>;
type Msg = {
	forget?: boolean;
	keyReady?: boolean;
	handoff?: boolean;
	rec?: string;
	sync?: boolean;
	capacity?: CapacityState;
	capacitySync?: boolean;
	/** A follower asks the leader, which owns the submitted jobs and their credential, to stop this record. */
	stop?: string;
	/** The follower's id for the answer to its stop. */
	stopReply?: string;
	/** The leader's answer: whether the stop was confirmed and saved. */
	stopped?: { reply: string; ok: boolean };
};
/** How long a follower waits for the leading tab to answer a stop before saying it could not be confirmed. */
const STOP_REPLY_MS = 15_000;

export const backoff = (attempt: number, rnd = Math.random()) =>
	Math.min(60_000, 2000 * 2 ** Math.max(0, attempt - 1)) * (0.5 + 0.5 * rnd);

const strip = (v: unknown): unknown =>
	typeof v === 'string' && v.length > 300
		? `<${v.length} chars>`
		: Array.isArray(v)
			? v.map(strip)
			: v && typeof v === 'object'
				? Object.fromEntries(Object.entries(v).map(([k, x]) => [k, strip(x)]))
				: v;

const isB64 = (v: unknown): v is { type: 'base64'; base64: string } =>
	!!v &&
	typeof v === 'object' &&
	(v as { type?: unknown }).type === 'base64' &&
	typeof (v as { base64?: unknown }).base64 === 'string';

async function mapDeep(
	v: unknown,
	fn: (o: Record<string, unknown>) => Promise<unknown> | undefined
): Promise<unknown> {
	if (Array.isArray(v)) return Promise.all(v.map((x) => mapDeep(x, fn)));
	if (!v || typeof v !== 'object') return v;
	const r = fn(v as Record<string, unknown>);
	if (r) return r;
	// Visit every key before awaiting any, like arrays: fn then runs synchronously in depth-first request order.
	const entries = Object.entries(v),
		values = await Promise.all(entries.map(([, x]) => mapDeep(x, fn)));
	const out: Record<string, unknown> = {};
	entries.forEach(([k], i) => (out[k] = values[i]));
	return out;
}

/** The same canonical request identity used by enqueue, without writing blobs during recovery preflight. */
export async function requestIdentity(
	req: Req,
	putBlob: (bytes: Uint8Array) => Promise<string> = sha256
) {
	const inputs: string[] = [];
	const params = await mapDeep(req.body ?? null, (o) => {
		if (!isB64(o)) return undefined;
		// Reserve the slot now, in request order: images hash concurrently, and completion order would vary.
		const slot = inputs.push('') - 1;
		return (async () => {
			const sha = await putBlob(base64ToBytes(o.base64));
			inputs[slot] = sha;
			return { ...o, base64: undefined, $blob: sha };
		})();
	});
	const requestHash = await sha256(
		stableStringify({ method: req.method, endpoint: req.path, params })
	);
	return { params, inputs, requestHash };
}

export interface EstimateRetryIntent {
	id: string;
	recordIds: readonly string[];
}
/** Unknown measurements require a new explicit reviewed intent; accepted background jobs are never cloned. */
export function retryableEstimate(r: JobRec): boolean {
	return (
		r.method === 'POST' &&
		r.endpoint === '/estimate-skeleton' &&
		!r.jobs.length &&
		!hasJobEvidence(r.response) &&
		(r.state === 'lost' || (r.state === 'canceled' && !!r.autoCanceledAttempts?.length))
	);
}

/** An automatically canceled record that never left the browser; a later flow attempt may reopen it. */
export function reopenableCancellation(record: JobRec): boolean {
	return (
		record.state === 'canceled' &&
		record.requestStarted !== true &&
		record.submittedAt == null &&
		!record.jobs.length &&
		!!record.autoCanceledAttempts?.length
	);
}

export function canReopenQueuedCancellation(record: JobRec, attempt?: number): boolean {
	return (
		reopenableCancellation(record) &&
		attempt !== undefined &&
		Number.isSafeInteger(attempt) &&
		!record.autoCanceledAttempts!.includes(attempt)
	);
}

const queuedWithoutJobs = (record: JobRec) => record.state === 'queued' && !record.jobs.length;

/** setInterval that keeps ticking in background tabs (worker-driven); plain setInterval where Worker is missing (node). */
let ticker: Worker | null | undefined;
const ticks = new Map<number, () => void>();
let nextTick = 0;
function every(ms: number, fn: () => void): () => void {
	if (ticker === undefined) {
		try {
			ticker = new Worker(new URL('./ticker.worker.ts', import.meta.url), { type: 'module' });
			ticker.onmessage = (e: MessageEvent<number>) => ticks.get(e.data)?.();
		} catch {
			ticker = null;
		}
	}
	if (!ticker) {
		const t = setInterval(fn, ms);
		return () => clearInterval(t);
	}
	const id = ++nextTick,
		w = ticker;
	ticks.set(id, fn);
	w.postMessage({ id, ms });
	return () => {
		ticks.delete(id);
		w.postMessage({ id });
	};
}

/** A valid PixelLab result this device could not save: a storage fault to retry, never a malformed or failed job. */
class ResultNotStored extends Error {
	constructor(label: string, cause: unknown) {
		super(`${label}: could not be saved on this device (${(cause as Error)?.message ?? cause})`, {
			cause
		});
	}
}

export class Queue {
	private recs = new Map<string, JobRec>();
	private persisting = new Set<string>(); // first ledger write must commit before the scheduler may send
	private busy = new Set<string>(); // rec ids / subjob ids with an op in flight
	private listeners = new Set<(s: QueueSnapshot) => void>();
	private timer: (() => void) | null = null;
	private ticking = false;
	/** Finished jobs whose valid results could not be saved yet, by job id (see poll). */
	private held = new Map<string, Job>();
	/** Records whose latest save failed: saved again until it lands, so a settled result is never only in memory. */
	private unsavedRecords = new Set<string>();
	private recordRetryAt = 0;
	/** Paid results only this tab holds (an unsaved record or a held job): it keeps leading until they are saved. */
	private holdsUnsaved() {
		return this.unsavedRecords.size > 0 || this.held.size > 0;
	}
	/** Followers' stops waiting for the leading tab's answer, by reply id. */
	private stopReplies = new Map<string, (ok: boolean) => void>();
	// Order of the latest storage outcomes (reads and writes apart): the storage notice lifts only once a later read and a
	// later write have both succeeded, never because a tick returned without touching storage.
	private storageSeq = 0;
	private readOk = 0;
	private readBad = 0;
	private writeOk = 0;
	private writeBad = 0;
	// Results are blobs: a small record save can succeed while a large blob save still fails (quota), so blobs count apart.
	private blobOk = 0;
	private blobBad = 0;
	private disconnected = false;
	private capacityProbe: object | null = null;
	private capacityRead: Promise<void> | null = null;
	private capacityKnown = false;
	private accountBalance: Balance | null = null;
	private throttled = false;
	private capacityFailures = 0;
	private capacitySuccesses = 0;
	private capacityCheckedAt = -Infinity;
	private detectCapacity = false;
	private deps: Deps;
	private follower: (() => void) | null = null;
	private release: (() => void) | null = null;
	private connection: AbortController | null = null;
	private connectedOnce = false;
	private keyRevision = 0; // includes Forget/reconnect with the same value; never persisted
	private submitScopes = new Map<
		string,
		{ signals: Map<AbortSignal, number | undefined>; unscoped: boolean }
	>(); // ephemeral consumers; never persisted
	private merged = 0;
	private probeAt = 0;
	private chan: BroadcastChannel | null = null;
	private activityInspection = new Map<string, Promise<void>>();
	role: Role = 'solo';
	key = '';
	/** The app's own check that nothing in this tab is mid-generation; an idle leader hands the jobs to a tab that asks. */
	canYield: () => boolean = () => true;
	private wantsLead = false;
	private asking: (() => void) | null = null;
	paused: QueueSnapshot['paused'] = null;
	concurrency: number = PLAN_JOB_LIMITS.unknown;
	current: number = PLAN_JOB_LIMITS.unknown;
	capacityPlan: string | null = null;
	capacityRetryAt = 0;
	sessionGens = 0;
	sessionUsd = 0;
	sessionUnknown = 0;

	constructor(deps: Partial<Deps> = {}) {
		this.deps = {
			api: realApi,
			put: (k, r) => db.put('jobs', k, r),
			claimEstimate: (r, choose) => db.claimJob(r, choose),
			get: (k) => db.get<JobRec>('jobs', k),
			transition: async (k, next) => {
				let stored: JobRec | undefined;
				const unchanged = new Error('unchanged');
				try {
					return await db.update<JobRec>('jobs', k, (current) => {
						stored = current;
						const out = next(current);
						if (!out) throw unchanged; // aborts the transaction without writing
						return out;
					});
				} catch (e) {
					if (e === unchanged) return stored;
					throw e;
				}
			},
			del: (k) => db.del('jobs', k),
			all: () => db.all<JobRec>('jobs'),
			putBlob: (b) => db.putBlob(b),
			getBlob: db.getBlob,
			fetchBytes: async (url, context) => {
				const id = beginActivityCall('GET', url, undefined, context, 'download');
				let status: number | null = null;
				try {
					const r = await fetch(url, { credentials: 'omit', cache: 'no-store' }); // storage CDN: no auth header, ever
					status = r.status;
					if (!r.ok) throw new Error(`GET ${url} -> ${r.status}`);
					const bytes = new Uint8Array(await r.arrayBuffer());
					finishActivityCall(id, status, true);
					return bytes;
				} catch (e) {
					finishActivityCall(id, status, false);
					throw e;
				}
			},
			now: Date.now,
			locks: workspaceCopy ? null : (globalThis.navigator?.locks ?? null),
			channel: LOCK,
			lockName: LOCK,
			online: () => globalThis.navigator?.onLine ?? true,
			...deps
		};
		if (!deps.transition && (deps.put || deps.get)) {
			// An injected store without its own transaction (self-tests, unit fakes): read then write the same store.
			const { put: write } = this.deps;
			this.deps.transition = async (k, next) => {
				const stored = deps.get
						? await deps.get(k)
						: (await deps.all?.())?.find((record) => record.id === k),
					out = next(stored);
				if (!out) return stored;
				await write(k, out);
				return out;
			};
		}
		const track =
			<A extends unknown[], R>(op: (...args: A) => Promise<R>, kind: 'read' | 'write' | 'blob') =>
			async (...args: A): Promise<R> => {
				try {
					const out = await op(...args);
					if (kind === 'write') this.writeOk = ++this.storageSeq;
					else if (kind === 'blob') this.blobOk = ++this.storageSeq;
					else this.readOk = ++this.storageSeq;
					return out;
				} catch (e) {
					if (kind === 'write') this.writeBad = ++this.storageSeq;
					else if (kind === 'blob') this.blobBad = ++this.storageSeq;
					else this.readBad = ++this.storageSeq;
					this.storageFailed();
					throw e;
				}
			};
		this.deps.put = track(this.deps.put, 'write');
		this.deps.transition = track(this.deps.transition, 'write');
		this.deps.putBlob = track(this.deps.putBlob, 'blob');
		this.deps.all = track(this.deps.all, 'read');
		this.deps.get = track(this.deps.get, 'read');
		const { all, get } = this.deps;
		const owns = (r: JobRec) => this.ownsRecord(r);
		// Every stored row is read through readableRecord: one damaged row must never stop the queue.
		this.deps.all = async () =>
			(await all()).flatMap((row) => readableRecord(row) ?? []).filter(owns);
		this.deps.get = async (id) => {
			const r = readableRecord(await get(id));
			return r && owns(r) ? r : undefined;
		};
	}
	private ownsRecord(r: Pick<JobRec, 'tag'>) {
		return this.deps.recordTag === undefined
			? r.tag !== MOTION_LAB_TAG && r.tag !== ITEM_TRIAL_TAG
			: r.tag === this.deps.recordTag;
	}

	// ---- store contract (Svelte `$queue`) ----
	subscribe(fn: (s: QueueSnapshot) => void) {
		this.listeners.add(fn);
		fn(this.snapshot());
		return () => this.listeners.delete(fn);
	}
	snapshot(): QueueSnapshot {
		const jobs = [...this.recs.values()]
			.sort((a, b) => a.createdAt - b.createdAt)
			.map((r) => ({ ...r, jobs: r.jobs.map((s) => ({ ...s, results: [...s.results] })) }));
		const counts = { pending: 0, running: 0, failed: 0, done: 0 };
		for (const r of jobs) {
			if (r.state === 'queued') counts.pending++;
			else if (r.state === 'submitting' || r.state === 'running') counts.running++;
			else if (r.state === 'done') counts.done++;
			else if (r.state === 'failed' || r.state === 'lost') counts.failed++;
		}
		return {
			jobs,
			role: this.role,
			paused: this.paused,
			concurrency: this.concurrency,
			current: this.current,
			capacityPlan: this.capacityPlan,
			capacityRetryAt: this.capacityRetryAt,
			sessionGens: this.sessionGens,
			sessionUsd: this.sessionUsd,
			sessionUnknown: this.sessionUnknown,
			counts
		};
	}
	private emit() {
		const s = this.snapshot();
		for (const l of this.listeners) l(s);
		if (this.role === 'leader')
			this.chan?.postMessage({
				capacity: {
					concurrency: this.concurrency,
					current: this.current,
					capacityPlan: this.capacityPlan,
					capacityRetryAt: this.capacityRetryAt
				}
			} satisfies Msg);
	}
	private async save(r: JobRec) {
		try {
			await this.deps.put(r.id, r);
		} catch (e) {
			this.unsavedRecords.add(r.id);
			throw e;
		}
		this.unsavedRecords.delete(r.id);
		this.chan?.postMessage({ rec: r.id } satisfies Msg); // other tabs read just this record
		this.emit();
		this.requestLeadership();
	}
	/** Write `r` only while the stored record still passes `allowed` (or is absent); a loser gets the stored record instead. */
	private async saveIf(r: JobRec, allowed: (stored: JobRec) => boolean): Promise<JobRec | null> {
		const record = structuredClone(r);
		let blocked: JobRec | null = null;
		await this.deps.transition(r.id, (stored) => {
			if (!stored || !this.ownsRecord(stored) || allowed(stored)) return record;
			blocked = stored;
			return undefined;
		});
		if (blocked) return blocked;
		this.chan?.postMessage({ rec: r.id } satisfies Msg);
		this.emit();
		this.requestLeadership();
		return null;
	}
	/** Resolves with the record once it is finished (done, failed, canceled or lost). */
	settled(id: string, signal?: AbortSignal): Promise<JobRec> {
		return new Promise((res, reject) => {
			signal?.throwIfAborted();
			let done = false;
			const abort = () => {
				done = true;
				un();
				reject(signal?.reason);
			};
			const un = this.subscribe((s) => {
				const r = s.jobs.find((j) => j.id === id);
				if (!done && r && !live(r)) {
					done = true;
					signal?.removeEventListener('abort', abort);
					res(r);
					queueMicrotask(() => un());
				}
			});
			if (!done) signal?.addEventListener('abort', abort, { once: true });
		});
	}

	// ---- lifecycle ----
	/** Become the leader if no other tab is, else mirror the ledger until the leader's tab closes. */
	async connect() {
		this.connectedOnce = true;
		this.disconnect();
		const connection = new AbortController(),
			{ signal } = connection;
		this.connection = connection;
		this.disconnected = false;
		const locks = this.deps.locks;
		if (!locks) {
			await this.load();
			if (!signal.aborted) this.start();
			return;
		}
		if (typeof BroadcastChannel !== 'undefined') {
			this.chan = new BroadcastChannel(this.deps.channel);
			this.chan.onmessage = (e: MessageEvent<Msg>) => {
				if (signal.aborted) return;
				const m = e.data ?? {};
				if (m.forget === true) this.setKey('', false);
				// Let a connected tab drive its work without sending its credential to this keyless tab.
				if (
					m.keyReady === true &&
					this.role === 'leader' &&
					this.release &&
					!this.key &&
					!this.busy.size &&
					!this.holdsUnsaved()
				)
					this.stepBack(); // a follower from the start: never act as leader while reconnecting
				// Another tab has a click waiting: step back (rejoin as follower) when nothing here is in flight.
				if (
					m.handoff === true &&
					this.role === 'leader' &&
					this.release &&
					!this.busy.size &&
					!this.holdsUnsaved() &&
					this.idle() &&
					this.canYield()
				)
					this.stepBack();
				if (typeof m.rec === 'string') void this.pull(m.rec);
				if (m.sync && this.role === 'follower') void this.sync();
				if (m.capacity && this.role === 'follower') {
					// Only the published capacity fields; a message never sets the key, role or records.
					const { concurrency, current, capacityPlan, capacityRetryAt } = m.capacity;
					if (Number.isFinite(concurrency)) this.concurrency = concurrency;
					if (Number.isFinite(current)) this.current = current;
					if (capacityPlan === null || typeof capacityPlan === 'string')
						this.capacityPlan = capacityPlan;
					if (Number.isFinite(capacityRetryAt)) this.capacityRetryAt = capacityRetryAt;
					this.emit();
					this.requestLeadership();
				}
				if (typeof m.stop === 'string' && this.role === 'leader') {
					const reply = m.stopReply;
					void this.cancel(m.stop)
						.then(
							() => true,
							(e) => {
								console.error('queue', e);
								return false;
							}
						)
						.then((ok) => {
							if (typeof reply === 'string')
								this.chan?.postMessage({ stopped: { reply, ok } } satisfies Msg);
						});
				}
				if (m.stopped && typeof m.stopped.reply === 'string')
					this.stopReplies.get(m.stopped.reply)?.(m.stopped.ok === true);
				if (m.capacitySync && this.role === 'leader') this.emit();
			};
		}
		await this.sync(); // the UI has the ledger at once, whoever leads
		if (signal.aborted) return;
		const hold = () =>
			new Promise<void>((res) => {
				if (signal.aborted) return res();
				this.release = res;
				signal.addEventListener('abort', () => res(), { once: true });
			});
		let got: boolean;
		try {
			got = await new Promise<boolean>((res, reject) => {
				void locks
					.request(this.deps.lockName, { ifAvailable: true }, (lock) => {
						res(!!lock && !signal.aborted);
						return lock && !signal.aborted ? hold() : undefined;
					})
					.catch(reject);
			});
		} catch (e) {
			if (signal.aborted) return;
			throw e;
		}
		if (signal.aborted) return;
		if (got) return this.lead(connection);
		this.role = 'follower';
		this.chan?.postMessage({ capacitySync: true } satisfies Msg);
		this.follower = every(this.chan ? FULL_SYNC_MS : SYNC_MS, () => void this.sync());
		this.emit();
		void locks
			.request(this.deps.lockName, { signal }, async () => {
				if (signal.aborted) return;
				await this.lead(connection);
				if (!signal.aborted) return hold();
			})
			.catch((e) => {
				if (!signal.aborted) console.error('queue lock', e);
			});
		this.requestLeadership();
	}
	private async lead(connection: AbortController) {
		if (connection.signal.aborted) return;
		this.follower?.();
		this.follower = null;
		this.requestHandoff(false);
		this.role = 'leader';
		this.capacityCheckedAt = -Infinity;
		this.capacityKnown = false;
		this.recs.clear();
		await this.load();
		if (!connection.signal.aborted) this.start();
	}
	/** Stop driving jobs and release/cancel this connection's lock; paid requests are never resent. */
	disconnect() {
		this.connection?.abort();
		this.connection = null;
		this.disconnected = true;
		this.stop();
		this.follower?.();
		this.follower = null;
		this.release?.();
		this.release = null;
		this.chan?.close();
		this.chan = null;
	}
	/** Follower: replace the mirror with the stored ledger. */
	async sync() {
		this.recs = new Map((await this.deps.all()).map((r) => [r.id, r]));
		this.emit();
	}
	/** Inspect mirrored/persisted submissions without making requests or eagerly decoding every saved input. */
	async inspectActivity(ids: string[], activityScope?: string): Promise<void> {
		const selected = new Set(ids);
		for (const rec of this.recs.values()) {
			if (
				(selected.has(rec.id) || (activityScope && rec.activityScope === activityScope)) &&
				this.wasRequested(rec)
			)
				await this.restoreActivity(rec);
		}
	}
	private wasRequested(r: JobRec) {
		return r.attempts > 0 && r.requestStarted !== false && !/nothing was sent/i.test(r.error ?? '');
	}
	/** One record another tab saved: a follower mirrors it, the leader adopts it. */
	private async pull(id: string) {
		const r = await this.deps.get(id);
		if (!r) return;
		if (this.role === 'follower') {
			this.recs.set(id, r);
			this.emit();
		} else if (this.role === 'leader' && this.adopt(r)) this.emit();
	}
	/** Leader: full re-read fallback (a missed channel message). */
	private async merge() {
		let changed = false;
		for (const r of await this.deps.all()) changed = this.adopt(r) || changed;
		if (changed) this.emit();
	}
	/** Leader: adopt a record another tab enqueued (unless it repeats a live or cached request of mine: R6 P1-1), or its cancel
	 * of a still-queued record. */
	private adopt(r: JobRec): boolean {
		const mine = this.recs.get(r.id);
		if (!mine) {
			const dup =
				r.state === 'queued' &&
				[...this.recs.values()].find(
					(x) =>
						x.requestHash === r.requestHash &&
						(live(x) ||
							(x.state === 'done' && (seededOf(x) || x.endpoint === '/estimate-skeleton')))
				);
			this.recs.set(r.id, r);
			if (this.pollSubmitted(r)) {
				void this.save(r).catch((e) => console.error('queue', e));
				return true;
			}
			if (dup) {
				this.strengthenPlan(dup, r);
				Object.assign(r, {
					state: 'canceled',
					error: `duplicate of ${dup.id} (sent from two tabs)`,
					finishedAt: this.deps.now()
				});
				void this.save(r).catch((e) => console.error('queue', e));
			}
			return true;
		}
		if (mine.state === 'queued' && r.state === 'canceled' && !this.busy.has(r.id)) {
			this.recs.set(r.id, r);
			return true;
		}
		return r.state === 'queued' && this.strengthenPlan(mine, r);
	}
	/** A follower can strengthen eligibility, but must never replace the leader's transport state or payload. */
	private strengthenPlan(mine: JobRec, incoming: JobRec): boolean {
		const minimum = requestTier(incoming);
		if (
			mine.state !== 'queued' ||
			mine.requestHash !== incoming.requestHash ||
			minimum <= (mine.minimumTier ?? 0)
		)
			return false;
		mine.minimumTier = minimum;
		void this.persistTier(mine.id, minimum).catch((e) => console.error('queue', e));
		return true;
	}
	private async persistTier(id: string, minimumTier: number) {
		let changed = false;
		await this.deps.transition(id, (stored) => {
			if (!stored || stored.state !== 'queued' || minimumTier <= (stored.minimumTier ?? 0))
				return undefined;
			changed = true;
			return { ...stored, minimumTier };
		});
		if (changed) this.chan?.postMessage({ rec: id } satisfies Msg);
	}
	/** Submitted jobs only poll: a record that already has a remote job is never sent again. */
	private pollSubmitted(r: JobRec): boolean {
		if ((r.state !== 'queued' && r.state !== 'submitting') || !r.jobs.length) return false;
		r.state = 'running';
		r.waitingForPlan = undefined;
		r.waitingForCapacity = false;
		return true;
	}
	async load() {
		for (const r of await this.deps.all()) {
			if (repaired.has(r) || this.pollSubmitted(r)) await this.deps.put(r.id, r);
			// Crashed between "submitting" and saving the job id: the server may have it. Never auto-resubmit.
			if (r.state === 'submitting') {
				r.state = r.requestStarted === false ? 'failed' : 'lost';
				r.error =
					r.requestStarted === false
						? 'page closed before request preparation finished; nothing was sent.'
						: 'page closed during submit; the job may have run (check pixellab.ai). Not resubmitted.';
				// Its cost is unknown; an earlier session spent it, so this session's totals stay unchanged.
				if (r.state === 'lost') r.costUnknown = true;
				await this.deps.put(r.id, r);
			}
			this.recs.set(r.id, r);
		}
		for (const r of this.recs.values())
			if (r.state === 'queued' && r.waitingForCapacity) {
				this.capacityRetryAt = Math.max(this.capacityRetryAt, r.nextAt);
				this.throttled = true;
			}
		// Reattach known remote jobs before polling, so reported usage belongs to their original paid submission.
		if (this.deps.api === realApi)
			for (const r of [...this.recs.values()]
				.filter((r) => this.wasRequested(r))
				.sort((a, b) => a.createdAt - b.createdAt)
				.slice(-200))
				await this.restoreActivity(r);
		this.emit();
	}
	private async restoreActivity(r: JobRec) {
		const pending = this.activityInspection.get(r.id);
		if (pending) await pending;
		const task = this.restoreActivityRecord(r);
		this.activityInspection.set(r.id, task);
		try {
			await task;
		} finally {
			if (this.activityInspection.get(r.id) === task) this.activityInspection.delete(r.id);
		}
	}
	private async restoreActivityRecord(r: JobRec) {
		const existing = activityRequest(r.id);
		if (existing && !existing.restored) return;
		let body = existing ? existing.body : r.params;
		let bodyUnavailable = existing?.bodyUnavailable ?? false;
		if (!existing)
			try {
				body = await mapDeep(r.params, (o) =>
					typeof o.$blob === 'string'
						? (async () => {
								const blob = await this.deps.getBlob(o.$blob as string);
								if (!blob) throw new Error('stored input unavailable');
								const { $blob: _, ...rest } = o;
								return { ...rest, base64: bytesToBase64(new Uint8Array(await blob.arrayBuffer())) };
							})()
						: undefined
				);
			} catch {
				bodyUnavailable = true;
			}
		// A sync may have supplied newer remote usage while the original PNG was being read.
		const current = this.recs.get(r.id) ?? r;
		// The live client records this request next. Only restore interrupted submissions after load marks them lost.
		if (current.state === 'submitting') return;
		if (!this.wasRequested(current)) return;
		restoreActivityRequest({
			queueId: current.id,
			queueTag: current.tag,
			activityScope: current.activityScope,
			label: current.label,
			method: current.method,
			endpoint: current.endpoint,
			body,
			bodyUnavailable,
			startedAt: current.submittedAt ?? current.createdAt,
			state: current.jobs.length || current.state === 'done' ? 'completed' : 'failed',
			jobs: current.jobs,
			usage: (current.response as { usage?: unknown } | undefined)?.usage
		});
	}
	start() {
		this.timer ??= every(1000, () =>
			this.tick().then(
				() => {
					// Storage works again once a read, a record save and a result save each succeeded after their last failure
					// (sending still saves first, so nothing went out unsaved meanwhile).
					if (
						this.paused === 'storage' &&
						(!this.readBad || this.readOk > this.readBad) &&
						(!this.writeBad || this.writeOk > this.writeBad) &&
						(!this.blobBad || this.blobOk > this.blobBad)
					)
						this.resume();
				},
				(e) => {
					// The ledger could not be read or saved: say so in Activity until storage is proven again.
					console.error('queue', e);
					this.storageFailed();
				}
			)
		);
	}
	/** A storage read or write failed: hold sending and say so in Activity until storage is proven again. */
	private storageFailed() {
		if (this.paused) return;
		this.paused = 'storage';
		this.emit();
	}
	stop() {
		this.timer?.();
		this.timer = null;
	}
	/** Forget stops connected tabs without sharing credentials. A new key belongs only to this tab. */
	setKey(key: string, notifyForget = true) {
		this.keyRevision++;
		if (key !== this.key) {
			// First connection happens AFTER ledger restore for memory-only keys. Keep that restored cooldown.
			if (key && this.key) {
				this.capacityRetryAt = 0;
				this.throttled = false;
				this.capacityFailures = 0;
			}
			this.concurrency = PLAN_JOB_LIMITS.unknown;
			this.current = this.throttled ? 1 : PLAN_JOB_LIMITS.unknown;
			this.accountBalance = null;
			this.capacityPlan = null;
			this.capacityCheckedAt = -Infinity;
			this.capacityKnown = false;
			this.capacityRead = null; // an old credential's read must not block the new one
			this.capacityProbe = null;
			this.capacitySuccesses = 0;
		}
		this.detectCapacity = !!key;
		this.key = key;
		if (!key && notifyForget) this.chan?.postMessage({ forget: true } satisfies Msg);
		if (key && this.paused === 'auth') this.paused = null;
		this.emit();
		this.requestLeadership();
	}
	private requestLeadership() {
		if (this.role === 'follower' && this.key && [...this.recs.values()].some(live))
			this.chan?.postMessage({ keyReady: true } satisfies Msg);
		if (this.role === 'follower' && this.wantsLead)
			this.chan?.postMessage({ handoff: true } satisfies Msg);
	}
	/** A follower with a waiting click asks the leader to hand over now, then every ASK_MS until it leads: a busy leader
	 *  can turn idle without any queue update. */
	requestHandoff(want = true) {
		this.wantsLead = want;
		this.asking?.();
		this.asking = want ? every(ASK_MS, () => this.requestLeadership()) : null;
		this.requestLeadership();
	}
	/** Leader to follower before the lock changes hands, so nothing new starts here in between; rejoin the lock queue. */
	private stepBack() {
		this.role = 'follower';
		this.emit();
		void this.connect();
	}
	resume() {
		this.paused = null;
		this.emit();
	}
	/** Free account reads can update the published ceiling, never erase a busy-account cooldown. */
	setBalance(balance: Balance, key: string) {
		if (key !== this.key) return;
		const { limit, plan } = planCapacity(balance);
		this.accountBalance = balance;
		this.concurrency = limit;
		this.current = this.throttled ? Math.min(this.current, limit) : limit;
		this.capacityPlan = plan;
		this.capacityKnown = true;
		this.capacityCheckedAt = this.deps.now();
		this.emit();
	}
	/** Why the account's known plan can never run this request (null when it can, or while the plan is unknown). Optional
	 *  fallbacks check it before enqueueing, since the queue holds restricted work until the plan changes. */
	planBlocks(req: Req, minimumTier = 0): string | null {
		return planRestriction(this.accountBalance, {
			method: req.method,
			endpoint: req.path,
			params: req.body ?? null,
			minimumTier
		});
	}

	private activeSlots() {
		return [...this.recs.values()].reduce(
			(n, r) =>
				n +
				(r.state === 'submitting'
					? requestedSlots(r.endpoint, r.params)
					: r.state === 'running'
						? r.jobs.filter((s) => !s.done && !s.remoteDone).length
						: 0),
			0
		);
	}

	private async refreshCapacity() {
		const key = this.key,
			revision = this.keyRevision;
		this.capacityCheckedAt = this.deps.now(); // failure uses the fallback and is not hammered every second
		try {
			const balance = await this.deps.api<Balance>(key, 'GET', '/balance', undefined, undefined, {
				label: 'Check account concurrency',
				background: true
			});
			if (revision === this.keyRevision) this.setBalance(balance, key);
		} catch (e) {
			if (revision !== this.keyRevision || key !== this.key) return;
			this.capacityKnown = true; // retain the last ceiling (or fallback) when an account read fails
			if (e instanceof ApiError && e.kind === 'auth') this.paused = 'auth';
		}
	}

	private planWait(r: JobRec): string | null {
		if (this.detectCapacity && requestTier(r) > 0) {
			if (this.capacityRead) return 'Checking PixelLab plan before starting this workflow…';
			if (!this.accountBalance)
				return 'Waiting to verify your PixelLab plan. Retrying automatically…';
		}
		return planRestriction(this.accountBalance, r);
	}

	private async hasPreparedInputs(): Promise<boolean> {
		// A broken stored request should fail locally without even an account lookup.
		const connection = this.connection;
		let prepared = false;
		for (const r of this.recs.values())
			if (r.state === 'queued' && !this.persisting.has(r.id) && !this.busy.has(r.id)) {
				const blobs = await Promise.all(r.inputs.map((sha) => this.deps.getBlob(sha)));
				if (this.disconnected || connection !== this.connection || this.role === 'follower')
					return false;
				if (
					this.recs.get(r.id) !== r ||
					r.state !== 'queued' ||
					this.persisting.has(r.id) ||
					this.busy.has(r.id)
				)
					continue;
				const missing = blobs.findIndex((blob) => !blob);
				if (missing < 0) {
					prepared = true;
					continue;
				}
				Object.assign(r, {
					state: 'failed',
					requestStarted: false,
					waitingForPlan: undefined,
					finishedAt: this.deps.now(),
					error: `input image ${r.inputs[missing].slice(0, 12)} missing from storage; nothing was sent`
				});
				this.submitScopes.delete(r.id);
				await this.save(r);
			}
		return prepared;
	}

	// ---- enqueue ----
	// Identical request (same endpoint + params + input images, explicit seed) reuses the stored record instead of paying again.
	// Paid requests are resume-safe by default; a new seed expresses an intentional re-roll. meta.cache also reuses
	// unseeded done GET records (deterministic routes such as GET /characters).
	async enqueue(
		req: Req,
		meta: {
			label?: string;
			title?: Message;
			tag?: string;
			activityScope?: string;
			minimumTier?: number;
			cache?: boolean;
			resumeSafe?: boolean;
			signal?: AbortSignal;
			attempt?: number;
			quotedEstimate?: { reuseOnly: boolean; changed: () => never };
			estimateRetry?: EstimateRetryIntent;
		} = {}
	): Promise<JobRec> {
		const connection = this.connection;
		const assertConnected = () => {
			meta.signal?.throwIfAborted(); // orchestration cancellation stops publication, never aborts a paid HTTP request
			if (this.connectedOnce && (!this.connection || this.connection !== connection))
				throw new Error('Queue disconnected. Reload PixelDoll before starting more work.');
		};
		assertConnected();
		if (meta.quotedEstimate && (req.method !== 'POST' || req.path !== '/estimate-skeleton'))
			throw new Error('Quoted joint checks can only estimate a skeleton.');
		if (!this.ownsRecord({ tag: meta.tag }))
			throw new Error(
				'This request belongs to a different queue. Open its own workflow before submitting.'
			);
		if (
			meta.estimateRetry &&
			(req.method !== 'POST' ||
				req.path !== '/estimate-skeleton' ||
				!meta.estimateRetry.id ||
				!Array.isArray(meta.estimateRetry.recordIds))
		)
			throw new Error('Explicit measurement recovery is only available for reviewed joint checks.');
		const { params, inputs, requestHash } = await requestIdentity(req, this.deps.putBlob);
		assertConnected(); // obsolete async flows cannot publish another request during disconnect/HMR navigation
		const seeded = typeof (params as { seed?: unknown } | null)?.seed === 'number';
		// A resumed paid flow must never turn a terminal/unknown outcome into another submission. Explicit re-rolls change seed.
		const resumeSafe = meta.resumeSafe ?? req.method === 'POST';
		const matches = [...this.recs.values()]
			.filter((r) => r.requestHash === requestHash)
			.reverse()
			.sort((a, b) => b.createdAt - a.createdAt);
		// Retries and repeats of one request share its hash. Prefer useful newer work before considering an old failure.
		const active = matches.find(live);
		if (active) {
			this.observeScope(active.id, meta.signal, meta.attempt);
			if (this.pollSubmitted(active)) {
				await this.save(active);
				return active;
			}
			if (active.state === 'queued' && (meta.minimumTier ?? 0) > (active.minimumTier ?? 0)) {
				active.minimumTier = meta.minimumTier;
				await this.persistTier(active.id, meta.minimumTier!);
			}
			return active;
		}
		const done = matches.find((r) => r.state === 'done');
		if (done && (seeded || meta.cache || resumeSafe)) return done;
		if (meta.quotedEstimate?.reuseOnly) meta.quotedEstimate.changed();
		let retryOf: string | undefined;
		if (meta.estimateRetry) {
			// Deterministic record identity also prevents two follower tabs from creating two retries for one consent.
			const previous = matches.find((r) => r.estimateRecovery?.id === meta.estimateRetry!.id);
			if (previous) return previous; // including another unknown outcome: reload never grants a second submission
			const source = matches.find((r) => meta.estimateRetry!.recordIds.includes(r.id));
			if (source) {
				if (!retryableEstimate(source) || matches[0]?.id !== source.id)
					throw new Error('The reviewed joint check changed. Review it again before retrying.');
				retryOf = source.id;
			}
		}
		if (resumeSafe && !retryOf) {
			const terminal = matches.find((r) => !canReopenQueuedCancellation(r, meta.attempt));
			if (terminal) return terminal;
		}
		const now = this.deps.now();
		const rec: JobRec = {
			id: meta.estimateRetry
				? `estimate-recovery-${await sha256(retryOf ?? requestHash)}`
				: crypto.randomUUID(),
			...(meta.estimateRetry
				? { estimateRecovery: { id: meta.estimateRetry.id, ...(retryOf ? { retryOf } : {}) } }
				: {}),
			label: meta.label ?? req.path,
			...(meta.title ? { title: meta.title } : {}),
			tag: meta.tag,
			activityScope: meta.activityScope,
			minimumTier: meta.minimumTier,
			method: req.method,
			endpoint: req.path,
			params,
			inputs,
			requestHash,
			state: 'queued',
			attempts: 0,
			requestStarted: false,
			nextAt: 0,
			createdAt: now,
			jobs: [],
			gens: 0,
			usd: 0
		};
		if (meta.estimateRetry || meta.quotedEstimate) {
			// The transaction re-reads all matching rows: a stale follower cannot overwrite a progressed retry or pay twice.
			let inserted = false;
			const claimed = await this.deps.claimEstimate(rec, (records) => {
				records = records.filter((r) => this.ownsRecord(r));
				assertConnected(); // scope/session changes before the transaction inserts must leave no queued orphan
				const current = records
					.filter((r) => r.requestHash === requestHash)
					.reverse()
					.sort((a, b) => b.createdAt - a.createdAt);
				const useful = current.find(live) ?? current.find((r) => r.state === 'done');
				if (useful) return useful;
				if (meta.quotedEstimate) {
					if (current.some((record) => !canReopenQueuedCancellation(record, meta.attempt)))
						meta.quotedEstimate.changed();
					inserted = true;
					return undefined;
				}
				const previous = records.find((r) => r.id === rec.id);
				if (previous) {
					if (previous.requestHash !== requestHash || previous.endpoint !== '/estimate-skeleton')
						throw new Error('The joint-check recovery identity does not match.');
					return previous; // even lost: a reviewed source may be forked only once, regardless of consent UUID
				}
				if (retryOf) {
					const source = current.find((r) => r.id === retryOf);
					if (!source || !retryableEstimate(source) || current[0]?.id !== retryOf)
						throw new Error('The reviewed joint check changed before it could be retried.');
				} else if (current.length)
					throw new Error('A joint check appeared after review. Review it before retrying.');
				inserted = true;
				return undefined;
			});
			// A concurrent call may already be driving this exact object. A delayed claim snapshot must not roll it back.
			const owned = this.recs.get(claimed.id);
			const result = owned ?? claimed;
			if (!owned) this.recs.set(claimed.id, result);
			this.observeScope(result.id, meta.signal, meta.attempt);
			try {
				assertConnected();
			} catch (e) {
				if (
					inserted &&
					result.state === 'queued' &&
					(!meta.signal ||
						this.flowAborted(result.id) ||
						(this.connectedOnce && this.connection !== connection))
				) {
					result.autoCanceledAttempts = this.cancellationAttempts(result.id);
					await this.cancel(result.id, true);
				}
				throw e;
			}
			this.chan?.postMessage({ rec: result.id } satisfies Msg);
			this.emit();
			return result;
		}
		this.persisting.add(rec.id);
		this.recs.set(rec.id, rec);
		this.observeScope(rec.id, meta.signal, meta.attempt);
		try {
			await this.save(rec);
		} catch (e) {
			if (this.recs.get(rec.id) === rec) this.recs.delete(rec.id);
			this.unsavedRecords.delete(rec.id); // a request whose enqueue failed is never saved later
			throw e;
		} finally {
			this.persisting.delete(rec.id);
		}
		return rec;
	}

	/** A deduplicated request may serve several flows. One failed consumer cannot cancel another consumer's work. */
	observeScope(id: string, signal?: AbortSignal, attempt?: number) {
		let consumers = this.submitScopes.get(id);
		if (!consumers)
			this.submitScopes.set(id, (consumers = { signals: new Map(), unscoped: false }));
		if (!signal) {
			consumers.unscoped = true;
			return;
		}
		if (consumers.signals.has(signal)) return;
		consumers.signals.set(signal, Number.isSafeInteger(attempt) ? attempt : undefined);
		const abort = () => {
			if (this.flowAborted(id)) {
				const r = this.recs.get(id);
				if (r?.state === 'queued') r.autoCanceledAttempts = this.cancellationAttempts(id);
				// A failed save keeps the record canceled in this tab (nothing is sent from here); cancelAbortedScope retries it.
				void this.cancel(id, true).catch((e) => console.error('queue', e));
			}
		};
		if (signal.aborted) abort();
		else signal.addEventListener('abort', abort, { once: true });
	}
	private flowAborted(id: string): boolean {
		const consumers = this.submitScopes.get(id);
		return (
			!!consumers &&
			!consumers.unscoped &&
			consumers.signals.size > 0 &&
			[...consumers.signals.keys()].every((s) => s.aborted)
		);
	}
	async cancelAbortedScope(id: string) {
		const record = this.recs.get(id);
		if (record?.state === 'canceled') await this.saveIf(record, queuedWithoutJobs);
		else if (this.flowAborted(id) && record?.state === 'queued') await this.cancel(id, true);
	}
	private cancellationAttempts(id: string): number[] | undefined {
		const consumers = this.submitScopes.get(id),
			attempts = [...(consumers?.signals.values() ?? [])];
		return consumers &&
			!consumers.unscoped &&
			attempts.length &&
			attempts.every((a) => a !== undefined)
			? [...new Set(attempts as number[])]
			: undefined;
	}

	// ---- the loop ----
	/** B15: offline -> pause (nothing is sent, so no paid call can be lost to a dead connection); a request that got no
	 * answer pauses too. Resume when the browser is online again and, for the leader, a free GET /balance gets through. */
	goOffline() {
		if (this.paused) return; // auth / credits stay the stronger reason
		this.paused = 'offline';
		this.probeAt = this.deps.now() + 3000;
		this.emit();
	}
	private async network(now: number): Promise<boolean> {
		if (!this.deps.online()) {
			this.goOffline();
			return false;
		}
		if (this.paused !== 'offline') return true;
		if (this.role === 'follower' || !this.key) {
			this.resume();
			return true;
		} // nothing to probe with: trust the browser
		if (now < this.probeAt) return false;
		this.probeAt = now + PROBE_MS;
		const credentialRevision = this.keyRevision;
		try {
			await this.deps.api(this.key, 'GET', '/balance', undefined, undefined, {
				label: 'Connection recovery',
				background: true
			});
		} catch (e) {
			if (credentialRevision !== this.keyRevision) return false;
			if (isNetwork(e)) return false;
			if (e instanceof ApiError && (e.kind === 'auth' || e.kind === 'credits')) {
				this.paused = e.kind;
				this.emit();
				return false;
			}
		}
		if (credentialRevision !== this.keyRevision) return false;
		if (this.paused === 'offline') this.resume();
		return true;
	}
	async tick(): Promise<void> {
		if (this.ticking) return;
		this.ticking = true;
		let work: { ops: Promise<void>[]; capacity?: Promise<void> };
		try {
			work = await this.work();
		} finally {
			this.ticking = false;
		}
		await Promise.all(work.ops);
		if (work.capacity) {
			await work.capacity;
			await this.tick();
		}
	}
	private async work(): Promise<{ ops: Promise<void>[]; capacity?: Promise<void> }> {
		const connection = this.connection;
		const disconnected = () =>
			this.disconnected ||
			(this.connectedOnce &&
				(!this.connection || this.connection !== connection || connection?.signal.aborted));
		if (disconnected()) return { ops: [] };
		if (this.role !== 'follower')
			for (const r of this.recs.values()) if (this.pollSubmitted(r)) await this.save(r);
		const now = this.deps.now();
		if (!(await this.network(now)) || disconnected()) return { ops: [] };
		if (this.role === 'follower') return { ops: [] }; // the leader tab submits and polls
		// A failed ledger read is retried on the next tick, so a working ledger lifts the storage notice at once.
		if (
			this.role === 'leader' &&
			(now - this.merged >= (this.chan ? FULL_SYNC_MS : SYNC_MS) ||
				(this.paused === 'storage' && this.readBad > this.readOk))
		) {
			this.merged = now;
			await this.merge();
		}
		if (disconnected()) return { ops: [] }; // a suspended tick cannot drive jobs after its lock/session was released
		const ops: Promise<void>[] = [];
		let capacity: Promise<void> | undefined;
		if (
			this.key &&
			!this.paused &&
			this.detectCapacity &&
			!this.capacityRead &&
			now - this.capacityCheckedAt >= 60_000 &&
			(await this.hasPreparedInputs())
		) {
			if (disconnected()) return { ops: [] };
			const read = this.refreshCapacity();
			this.capacityRead = read;
			const refreshed = read.finally(() => {
				if (this.capacityRead === read) this.capacityRead = null;
			});
			if (!this.capacityKnown) capacity = refreshed;
		}
		if (disconnected()) return { ops: [] };
		if (
			this.key &&
			!this.paused &&
			(!this.capacityRead || this.capacityKnown) &&
			!this.capacityProbe &&
			now >= this.capacityRetryAt
		) {
			let active = this.activeSlots();
			for (const r of [...this.recs.values()].sort((a, b) => a.createdAt - b.createdAt)) {
				if (active >= this.concurrency) break;
				if (
					r.state !== 'queued' ||
					r.nextAt > now ||
					this.busy.has(r.id) ||
					this.persisting.has(r.id)
				)
					continue;
				const restriction = this.planWait(r);
				if (restriction) {
					if (r.waitingForPlan !== restriction) {
						r.waitingForPlan = restriction;
						// Like submit: another tab's durable cancel (or receipt) wins over this display-only hold.
						ops.push(
							this.guard(r.id, async () => {
								const stored = await this.saveIf(r, queuedWithoutJobs);
								if (stored) {
									this.recs.set(r.id, stored);
									if (!live(stored)) this.submitScopes.delete(r.id);
									this.emit();
								}
							})
						);
					}
					continue; // Hold restricted work; allowed requests and accepted-job polling continue.
				}
				const slots = requestedSlots(r.endpoint, r.params);
				// A request needing more slots than the plan allows runs alone; the server is the final authority on acceptance.
				if (active && active + slots > this.concurrency) continue;
				active += slots;
				const probe = this.throttled ? {} : null;
				if (probe) this.capacityProbe = probe;
				ops.push(
					this.guard(r.id, async () => {
						try {
							await this.submit(r, !!probe);
						} finally {
							if (probe && this.capacityProbe === probe) this.capacityProbe = null;
						}
					})
				);
				if (this.throttled) break; // one probe at a time until external tools release capacity
			}
		}
		if (now >= this.recordRetryAt && this.unsavedRecords.size) {
			this.recordRetryAt = now + POLL_MS;
			for (const id of this.unsavedRecords) {
				const r = this.recs.get(id);
				if (!r) this.unsavedRecords.delete(id);
				else if (!this.busy.has(id) && !this.persisting.has(id))
					ops.push(this.guard(id, () => this.save(r)));
			}
		}
		// A held job whose record moved on (stopped, cleared, finished elsewhere) no longer needs its answer.
		for (const id of this.held.keys())
			if (
				![...this.recs.values()].some(
					(r) => r.state === 'running' && r.jobs.some((s) => s.id === id && !s.done)
				)
			)
				this.held.delete(id);
		if (this.key && this.paused !== 'auth')
			for (const r of this.recs.values()) {
				if (r.state !== 'running') continue;
				for (const s of r.jobs) {
					if (s.done || this.busy.has(s.id)) continue;
					if (s.remoteDone) {
						if (
							!(s.tries || s.unsaved) ||
							now - (s.lastPoll ?? 0) >= backoff((s.tries ?? 0) + (s.unsaved ?? 0))
						)
							ops.push(this.guard(s.id, () => this.download(r, s)));
					} else if (
						!s.lastPoll ||
						now - s.lastPoll >= (s.unsaved ? Math.max(POLL_MS, backoff(s.unsaved)) : POLL_MS)
					)
						ops.push(this.guard(s.id, () => this.poll(r, s)));
				}
			}
		return { ops, capacity };
	}
	private async guard(id: string, fn: () => Promise<void>) {
		this.busy.add(id);
		try {
			await fn();
		} catch (e) {
			console.error('queue', e);
		} finally {
			this.busy.delete(id);
			if (this.role === 'leader' && !this.key && !this.busy.size) this.emit(); // a waiting connected follower can retry handoff
		}
	}

	private async submit(r: JobRec, probe: boolean) {
		if (this.pollSubmitted(r)) {
			await this.save(r);
			return;
		}
		const connection = this.connection;
		const credentialRevision = this.keyRevision;
		const key = this.key;
		r.waitingForPlan = undefined;
		r.state = 'submitting';
		r.attempts++;
		r.requestStarted = false;
		// persisted before the request leaves, and only from a still-queued record without jobs: another tab's durable
		// queued-only cancel (or receipt) wins over this submission, and this submission makes later queued-only cancels no-ops
		const stored = await this.saveIf(r, queuedWithoutJobs);
		if (stored) {
			this.recs.set(r.id, stored);
			if (this.pollSubmitted(stored)) await this.save(stored);
			if (!live(stored)) this.submitScopes.delete(r.id);
			this.emit();
			return;
		}
		try {
			const body = await mapDeep(r.params, (o) => {
				// inside the try: a missing input fails the record, never sticks it in `submitting`
				if (typeof o.$blob !== 'string') return undefined;
				const { $blob, ...rest } = o;
				return (async () => {
					const blob = await this.deps.getBlob($blob as string);
					if (!blob)
						throw new Error(
							`input image ${($blob as string).slice(0, 12)} missing from storage; nothing was sent`
						);
					return { ...rest, base64: bytesToBase64(new Uint8Array(await blob.arrayBuffer())) };
				})();
			});
			// Persisting and rehydrating inputs await storage. A released queue or failed sibling must not send afterward.
			const canceled = () =>
				(this.connectedOnce &&
					(!this.connection || this.connection !== connection || connection?.signal.aborted)) ||
				this.flowAborted(r.id);
			const cancelBeforeSend = async () => {
				Object.assign(r, {
					state: 'canceled',
					requestStarted: false,
					error: 'Request stopped before sending. No API request was made.',
					finishedAt: this.deps.now(),
					autoCanceledAttempts: this.cancellationAttempts(r.id)
				});
				this.submitScopes.delete(r.id);
				await this.save(r);
			};
			if (canceled()) {
				await cancelBeforeSend();
				return;
			}
			const held = () =>
				credentialRevision !== this.keyRevision ||
				key !== this.key ||
				this.disconnected ||
				this.paused ||
				this.deps.now() < this.capacityRetryAt ||
				this.planWait(r);
			if (held()) {
				r.waitingForPlan = this.planWait(r) ?? undefined;
				r.state = 'queued';
				r.attempts--;
				r.nextAt = Math.max(r.nextAt, this.capacityRetryAt);
				await this.save(r);
				return;
			}
			r.requestStarted = true;
			try {
				await this.save(r);
			} catch {
				// a crash from this point has an unknown transport outcome; never auto-resubmit it
				r.requestStarted = false;
				throw new Error('request could not be saved; nothing was sent');
			}
			if (canceled()) {
				await cancelBeforeSend();
				return;
			}
			if (held()) {
				r.waitingForPlan = this.planWait(r) ?? undefined;
				r.requestStarted = false;
				r.state = 'queued';
				r.attempts--;
				r.nextAt = Math.max(r.nextAt, this.capacityRetryAt);
				await this.save(r);
				return;
			}
			// Once invoked, HTTP may have left the browser. Scope cancellation never aborts it or changes uncertainty handling.
			r.submittedAt = this.deps.now();
			const response = this.deps.api<SubmitResponse>(
				key,
				r.method,
				r.endpoint,
				body ?? undefined,
				undefined,
				{ queueId: r.id, queueTag: r.tag, activityScope: r.activityScope, label: r.label }
			);
			this.emit(); // notify only after HTTP invocation; listeners cannot reopen the guarded pre-submit boundary
			const res = await response;
			r.response = strip(res);
			const ids = jobIdsOf(res);
			r.error = undefined;
			r.errorKind = undefined; // an earlier refusal no longer explains this accepted (possibly charged) request
			r.waitingForCapacity = false;
			r.jobs = ids.map((id) => ({ id, status: 'submitted', done: false, results: [] }));
			if (ids.length) r.state = 'running';
			else if (isManagedState(r)) {
				r.error =
					'no clear answer from PixelLab (missing State job receipt). The job may have run and been charged (check pixellab.ai); not resent.';
				this.finish(r, 'lost');
			} else this.finish(r); // synchronous route (estimate-skeleton, balance)
			if (
				credentialRevision === this.keyRevision &&
				key === this.key &&
				this.throttled &&
				this.deps.now() >= this.capacityRetryAt
			) {
				this.capacityFailures = 0;
				this.current = Math.min(this.concurrency, Math.max(1, this.activeSlots()));
				// Short/synchronous jobs may never fill every slot. Five accepted probes restore full throughput too.
				if (this.current >= this.concurrency || (probe && ++this.capacitySuccesses >= 5)) {
					this.throttled = false;
					this.current = this.concurrency;
				}
			}
		} catch (e) {
			const err =
				e instanceof ApiError ? e : new ApiError(-1, 'other', (e as Error)?.message ?? String(e));
			const currentCredential = credentialRevision === this.keyRevision;
			if (err.message === 'no API key set') r.requestStarted = false; // client guard rejected before fetch
			r.error = err.message;
			r.errorKind = err.kind;
			// refused before any job existed; B15 live: a 500 "Failed to start any animation jobs" (busy account) said so in words
			if (r.method === 'POST' && hasJobEvidence(err.body)) {
				// Accepted-job evidence outranks every error classification, including auth/credits that normally wait for reconnection.
				if (currentCredential && (err.kind === 'auth' || err.kind === 'credits'))
					this.paused = err.kind;
				r.response = strip(err.body); // retain the known identifiers for manual review without resubmitting
				r.error = `PixelLab returned job evidence with an error (${err.message}). The request may have run and been charged; not resent.`;
				this.finish(r, 'lost'); // unknown cost unless the error body reported usage
			} else if (
				err.kind === 'retry' &&
				r.tag !== 'studio-state' &&
				(r.method !== 'POST' || paidRequestRejected(r.endpoint, err.status, err.body))
			) {
				r.state = 'queued';
				if (
					currentCredential &&
					key === this.key &&
					(err.status === 429 || noAnimationJobsStarted(r.endpoint, err))
				) {
					const now = this.deps.now();
					if (now >= this.capacityRetryAt) this.capacityFailures++;
					this.capacityRetryAt = Math.max(
						this.capacityRetryAt,
						now + Math.max(backoff(this.capacityFailures), err.retryAfterMs ?? 0)
					);
					this.throttled = true;
					this.capacitySuccesses = 0;
					this.current = Math.max(1, Math.min(this.current - 1, this.activeSlots()));
					r.waitingForCapacity = true;
					r.nextAt = this.capacityRetryAt;
				} else r.nextAt = this.deps.now() + Math.max(backoff(r.attempts), err.retryAfterMs ?? 0);
			} else if (
				r.tag === 'studio-state' &&
				(err.kind === 'auth' ||
					err.kind === 'credits' ||
					(err.kind === 'retry' && paidRequestRejected(r.endpoint, err.status, err.body)))
			) {
				this.finish(r, 'failed');
			} else if (
				err.kind === 'retry' ||
				(!(e instanceof ApiError) &&
					r.method === 'POST' &&
					r.requestStarted &&
					r.submittedAt !== undefined)
			) {
				// post-send bookkeeping can also hide an accepted paid request
				r.error = `no clear answer from PixelLab (${err.message}). The job may have run and been charged (check pixellab.ai); not resent.`;
				this.finish(r, 'lost'); // no job yet, so its cost is unknown
				if (currentCredential && isNetwork(err)) this.goOffline(); // B15: stop here instead of losing the next queued job too
			} else if (err.kind === 'auth' || err.kind === 'credits') {
				if (currentCredential) this.paused = err.kind;
				r.state = 'queued';
			} else {
				r.state = 'failed';
				r.finishedAt = this.deps.now();
			}
			// A documented refusal proves nothing was sent, so the requeued record is unsent again and an aborted flow can
			// reopen it (canReopenQueuedCancellation) instead of being stuck behind a canceled, "started" record.
			if (
				r.state === 'queued' &&
				(r.method !== 'POST' || paidRequestRejected(r.endpoint, err.status, err.body))
			) {
				r.requestStarted = false;
				delete r.submittedAt;
			}
		}
		if (r.state !== 'queued') this.submitScopes.delete(r.id);
		await this.save(r);
	}

	private async poll(r: JobRec, s: SubJob) {
		const key = this.key,
			credentialRevision = this.keyRevision,
			connection = this.connection;
		const currentCredential = () =>
			!this.disconnected &&
			connection === this.connection &&
			credentialRevision === this.keyRevision &&
			key === this.key;
		if (this.deps.api === realApi) await this.restoreActivity(r);
		// Restoring inspection data awaits storage: Forget/reconnect or releasing the queue must stop the old poll.
		if (!key || !currentCredential()) return;
		s.lastPoll = this.deps.now();
		let job: Job;
		// A finished job whose valid results this device failed to save is kept in memory and saved again from here, so a
		// result PixelLab later expires is not lost while storage recovers.
		const held = this.held.get(s.id);
		if (held) job = held;
		else
			try {
				job = await this.deps.api<Job>(
					key,
					'GET',
					`/background-jobs/${encodeURIComponent(s.id)}`,
					undefined,
					undefined,
					{
						queueId: r.id,
						queueTag: r.tag,
						activityScope: r.activityScope,
						label: r.label,
						background: true
					}
				);
			} catch (e) {
				if (!(e instanceof ApiError)) throw e;
				if (e.kind === 'auth') {
					s.error = e.message;
					if (currentCredential()) this.paused = 'auth';
				} else if (isNetwork(e)) {
					s.error = e.message;
					if (currentCredential()) this.goOffline();
				} // B15
				else if (e.kind === 'notfound' && this.deps.now() - (r.submittedAt ?? 0) > LOST_AFTER_MS) {
					s.done = true;
					s.status = 'lost';
					s.error = 'job not found (auto-deleted before results were saved; cost may be spent)';
					this.settle(r);
				} else s.error = e.message; // transient: poll again in 5 s, never resubmit
				return this.save(r);
			}
		const lr = job.last_response;
		s.status = job.status;
		s.progress = lr?.progress;
		s.queuePosition = lr?.queue_position;
		s.eta = lr?.estimated_wait_seconds;
		s.error = undefined;
		if (job.status === 'failed' || isPolicy(job)) {
			s.done = true;
			s.usage = job.usage;
			s.policy = isPolicy(job);
			s.failedAtProvider = true;
			s.errorCode = jobErrorCode(job);
			s.error = jobFailureText(job);
			this.settle(r);
		} else if (job.status === 'cancelled') {
			s.done = true;
			s.usage = job.usage;
			this.settle(r);
		} else if (job.status === 'completed') {
			s.usage = job.usage;
			const ims = jobImages(lr);
			try {
				if (isManagedState(r)) {
					const childId = managedStateSubmitChildId(r);
					if (!childId) throw new Error('missing State submit receipt');
					if (job.id !== s.id) throw new Error('State job ID does not match the submit receipt');
					if (lr?.character_id !== undefined && lr.character_id !== childId)
						throw new Error('State child ID does not match the submit receipt');
					s.characterId = lr?.character_id;
				} else if (!ims.length) throw new Error('no images');
				// validate every inline image before anything counts as done (R6 P2-11)
				for (const im of ims)
					if (!im.url)
						await this.saveResult(
							s,
							im.label,
							base64ToBytes(im.b64 ?? im.rgba?.b64 ?? ''),
							im.rgba
						);
			} catch (e) {
				if (e instanceof ResultNotStored) {
					// This device could not save a valid result: keep the job open and its answer in memory, so a later poll saves it
					// again without asking PixelLab (blobs are content addressed, so a second save is the same blob). Storage is
					// paused meanwhile.
					s.results = [];
					s.lastPoll = this.deps.now();
					s.unsaved = (s.unsaved ?? 0) + 1;
					this.held.set(s.id, job);
					throw e;
				}
				this.held.delete(s.id);
				delete s.unsaved;
				Object.assign(s, {
					done: true,
					status: 'failed',
					results: [],
					error: `PixelLab sent a malformed result (${(e as Error).message}); the cost may be spent`
				});
				this.settle(r);
				return this.save(r);
			}
			this.held.delete(s.id);
			s.remoteDone = true;
			s.pendingUrls = ims.filter((im) => im.url).map((im) => ({ label: im.label, url: im.url! }));
			await this.save(r); // inline images are safe now; URLs are persisted for download
			return this.download(r, s);
		}
		await this.save(r);
	}

	private async saveResult(
		s: SubJob,
		label: string,
		bytes: Uint8Array,
		rgba?: { w: number; h: number }
	) {
		const size = rgba
			? bytes.length === rgba.w * rgba.h * 4
				? { w: rgba.w, h: rgba.h }
				: null
			: pngSize(bytes);
		if (!size || !(size.w > 0 && size.h > 0 && size.w <= MAX_PX && size.h <= MAX_PX))
			throw new Error(`${label}: not a valid image`);
		const png = rgba
			? await encodePngBytes({ ...size, data: new Uint8ClampedArray(bytes) })
			: bytes;
		let sha: string;
		try {
			sha = await this.deps.putBlob(png);
		} catch (e) {
			throw new ResultNotStored(label, e);
		}
		s.results.push({ label, sha, ...size });
	}

	private async download(r: JobRec, s: SubJob) {
		try {
			while (s.pendingUrls?.length) {
				const { label, url } = s.pendingUrls[0];
				await this.saveResult(
					s,
					label,
					await this.deps.fetchBytes(url, {
						queueId: r.id,
						queueTag: r.tag,
						activityScope: r.activityScope,
						label: `${r.label} · ${label}`,
						background: true
					})
				);
				s.pendingUrls.shift();
				delete s.unsaved;
				await this.save(r);
			}
		} catch (e) {
			// storage CDN error or bad bytes: back off (tick), give up after MAX_TRIES with the URLs kept (R6 P2-9)
			s.lastPoll = this.deps.now();
			// This device failing to save is not a failed download: retry with its own backoff, never giving up (storage is
			// paused meanwhile).
			if (e instanceof ResultNotStored) {
				s.unsaved = (s.unsaved ?? 0) + 1;
				throw e;
			}
			if (!this.deps.online()) {
				this.goOffline();
				return this.save(r);
			} // B15: no connection is not a failed try
			// A fetch TypeError while online may be an outage (pause; the probe holds every download) or a storage host that keeps
			// refusing (CORS, CSP): it counts, so that case gives up below instead of pausing and resuming forever.
			if (e instanceof TypeError) this.goOffline();
			s.tries = (s.tries ?? 0) + 1;
			s.error = `result download failed ${s.tries}x: ${(e as Error).message}`;
			if (s.tries >= MAX_TRIES) {
				Object.assign(s, {
					done: true,
					status: 'failed',
					error: `${s.error}. Download manually: ${s.pendingUrls!.map((u) => u.url).join(' ')}`
				});
				this.settle(r);
			}
			return this.save(r);
		}
		s.done = true;
		s.error = undefined;
		this.settle(r);
		await this.save(r);
	}

	private settle(r: JobRec) {
		if (!r.jobs.every((s) => s.done)) return;
		const failed = r.jobs.filter((s) => s.error);
		if (failed.length) r.error = failed.map((s) => s.error).join(' | ');
		const canceled = r.jobs.every((s) => s.status === 'cancelled');
		const lost = r.jobs.every((s) => s.status === 'lost');
		this.finish(
			r,
			canceled ? 'canceled' : lost ? 'lost' : failed.length === r.jobs.length ? 'failed' : 'done'
		);
	}
	private finish(r: JobRec, state: RecState = 'done') {
		// Concurrent paths (a double Stop, a poll landing during a cancel) may settle one record twice: count it once.
		if (!live(r)) return;
		const priced = requestCost(
			usageOf((r.response as { usage?: unknown } | undefined)?.usage),
			r.jobs.map((s) => usageOf(s.usage))
		);
		const { cost } = priced,
			reported = priced.reported || r.method !== 'POST'; // reads are free, as in Activity
		r.gens = cost.generations ?? 0;
		r.usd = cost.usd ?? 0;
		if (reported) delete r.costUnknown;
		else r.costUnknown = true;
		this.sessionGens += r.gens;
		this.sessionUsd += r.usd;
		this.sessionUnknown += Number(!reported);
		r.state = state;
		r.finishedAt = this.deps.now();
	}

	// ---- user actions ----
	async cancel(id: string, queuedOnly = false) {
		const r = this.recs.get(id);
		if (!r || (queuedOnly && r.state !== 'queued')) return;
		if (!queuedOnly) delete r.autoCanceledAttempts; // an explicit user cancellation is never reopened by recovery
		if (this.role === 'follower' && r.state === 'running') {
			// The leader owns the job and the key that started it; never write its record or stop it with this tab's key.
			if (!this.chan)
				throw new LocalizedError(
					'Stop this job in the tab that is running it.',
					'activity.stopInRunningTab'
				);
			const reply = crypto.randomUUID();
			let timer: ReturnType<typeof setTimeout> | undefined;
			const answer = await new Promise<boolean | undefined>((res) => {
				this.stopReplies.set(reply, res);
				timer = setTimeout(() => res(undefined), STOP_REPLY_MS);
				this.chan!.postMessage({ stop: id, stopReply: reply } satisfies Msg);
			}).finally(() => {
				clearTimeout(timer);
				this.stopReplies.delete(reply);
			});
			if (answer === undefined)
				throw new LocalizedError(
					'The tab running this job has not confirmed the stop yet. Check Activity in a moment; if it is still running, stop it in that tab.',
					'activity.stopNoAnswer'
				);
			if (!answer)
				throw new LocalizedError(
					'PixelLab did not confirm the stop, so it may still run and charge. Check Activity.',
					'activity.stopNotConfirmed'
				);
			return;
		}
		if (r.state === 'queued') {
			// Canceled in memory first: if the save fails this tab still never sends it, and the caller reports the failure.
			r.state = 'canceled';
			r.finishedAt = this.deps.now();
			// another tab may already have persisted `submitting` or a job receipt: never overwrite it with a stale cancel
			const stored = await this.saveIf(r, queuedWithoutJobs);
			if (stored) {
				this.recs.set(id, stored);
				this.emit();
				if (!queuedOnly && stored.state === 'running') await this.cancel(id);
				return;
			}
			this.submitScopes.delete(r.id);
			return;
		}
		let unconfirmed = false;
		if (r.state === 'running') {
			for (const s of r.jobs.filter((s) => !s.done && !s.remoteDone)) {
				try {
					const stopped = await this.deps.api<{ usage?: Usage | null } | undefined>(
						this.key,
						'DELETE',
						`/background-jobs/${encodeURIComponent(s.id)}`,
						undefined,
						undefined,
						{
							queueId: r.id,
							queueTag: r.tag,
							activityScope: r.activityScope,
							label: `Stop ${r.label}`,
							background: false
						}
					);
					s.done = true;
					s.status = 'cancelled';
					s.usage = stopped?.usage; // the cancel response is the job's final usage report
				} catch (e) {
					s.error = (e as Error).message; // 400/409: already finished -> polling picks up the result
					// Any other refusal or no answer: the job may still run and charge, so the stop must not look done.
					if (!(e instanceof ApiError && (e.status === 400 || e.status === 409)))
						unconfirmed = true;
				}
			}
			this.settle(r);
		}
		await this.save(r);
		if (unconfirmed)
			throw new LocalizedError(
				'PixelLab did not confirm the stop, so it may still run and charge. Check Activity.',
				'activity.stopNotConfirmed'
			);
	}
	/** Save again a cancel whose save failed; meanwhile it stays canceled in this tab. A stopped running record is this tab's
	 *  own, already settled with the stop's usage: saved as is. A queued-only cancel still loses to another tab's submission
	 *  or receipt, which is adopted and, when running, stopped like any running cancel. */
	async retryCancelSave(id: string) {
		const r = this.recs.get(id);
		if (!r) return;
		if (r.jobs.length) return this.save(r); // the save a running cancel ends with, whatever its jobs settled to
		if (r.state !== 'canceled') return;
		const stored = await this.saveIf(r, queuedWithoutJobs);
		if (!stored) {
			this.submitScopes.delete(id);
			return;
		}
		this.recs.set(id, stored);
		this.emit();
		if (stored.state === 'running') await this.cancel(id);
	}
	/** Leader/solo: delete finished records unless `keep` says something still needs them (drafts re-read their calls, resumable
	 * creates/moves re-attach through the request cache: R6 P1-2). Returns the number deleted. */
	async clearFinished(keep: (r: JobRec) => boolean): Promise<number> {
		if (this.role === 'follower') return 0; // the leader owns the ledger
		let n = 0;
		try {
			for (const r of [...this.recs.values()])
				if (!live(r) && !keep(r)) {
					await this.deps.del(r.id); // a failed delete stays listed and fails Clear finished, instead of returning on reload
					this.recs.delete(r.id);
					n++;
				}
		} finally {
			this.chan?.postMessage({ sync: true } satisfies Msg);
			this.emit();
		}
		return n;
	}
	/** Nothing queued, submitting or running in this tab's view of the ledger. */
	idle = () => ![...this.recs.values()].some(live);
}

export const queue = new Queue();

// Fake API + in-memory store: persist-before-submit, 429 backoff, poll -> save, resume without resubmit, cache.
export async function selfTest() {
	const store = new Map<string, JobRec>(),
		blobs = new Map<string, Uint8Array>();
	let t = 1000,
		submits = 0,
		polls = 0,
		fail429 = 1;
	const pngB64 = bytesToBase64(
		new Uint8Array([
			0x89, 0x50, 0x4e, 0x47, 13, 10, 26, 10, 0, 0, 0, 13, 73, 72, 68, 82, 0, 0, 0, 64, 0, 0, 0, 64
		])
	);
	const deps: Partial<Deps> = {
		now: () => t,
		put: async (k, r) => void store.set(k, structuredClone(r)),
		get: async (k) => structuredClone(store.get(k)),
		del: async (k) => store.delete(k),
		all: async () => [...store.values()].map((r) => structuredClone(r)),
		putBlob: async (b) => {
			const k = await sha256(b);
			blobs.set(k, b);
			return k;
		},
		getBlob: async (k) =>
			blobs.has(k) ? new Blob([blobs.get(k) as Uint8Array<ArrayBuffer>]) : undefined,
		fetchBytes: async () => base64ToBytes(pngB64),
		api: async <T>(_k: string, method: string, path: string, body?: unknown): Promise<T> => {
			if (method === 'POST') {
				const persisted = [...store.values()].find((r) => r.endpoint === path);
				console.assert(persisted?.state === 'submitting', 'ledger persisted before submit');
				console.assert(
					(body as { image?: { base64?: string } }).image?.base64 === pngB64,
					'input image rehydrated'
				);
				if (fail429-- > 0) throw new ApiError(429, 'retry', 'busy');
				submits++;
				return { background_job_ids: ['j1', 'j2'] } as T;
			}
			polls++;
			const id = path.split('/').pop();
			if (polls < 3)
				return {
					id,
					status: 'processing',
					created_at: '',
					last_response: { queue_position: 2 }
				} as T;
			return (
				id === 'j1'
					? {
							id,
							status: 'completed',
							created_at: '',
							usage: { type: 'generations', generations: 1.5 },
							last_response: { direction: 'south', images: [{ type: 'base64', base64: pngB64 }] }
						}
					: {
							id,
							status: 'completed',
							created_at: '',
							usage: { type: 'generations', generations: 0.5 },
							last_response: { storage_urls: { east: 'https://x/e.png' } }
						}
			) as T;
		}
	};
	const q = new Queue(deps);
	q.key = 'k';
	const req = {
		method: 'POST' as const,
		path: '/x',
		body: { image: { type: 'base64', base64: pngB64 }, seed: 1 }
	};
	const rec = await q.enqueue(req);
	console.assert(
		!JSON.stringify(store.get(rec.id)).includes(pngB64),
		'ledger stores blob refs, not base64'
	);
	await q.tick();
	console.assert(
		store.get(rec.id)?.state === 'queued' && q.current === 1 && store.get(rec.id)!.nextAt > t,
		'429 -> requeue with shared backoff and single probes'
	);
	t += 60_000;
	await q.tick();
	console.assert(
		submits === 1 &&
			store
				.get(rec.id)
				?.jobs.map((s) => s.id)
				.join() === 'j1,j2',
		'job ids persisted after submit'
	);
	// reload mid-job: new queue resumes polling, never resubmits
	const q2 = new Queue(deps);
	q2.key = 'k';
	await q2.load();
	for (let i = 0; i < 4; i++) {
		t += POLL_MS;
		await q2.tick();
	}
	const done = store.get(rec.id)!;
	console.assert(submits === 1, 'resume did not resubmit');
	console.assert(
		done.state === 'done' && done.gens === 2,
		`done with summed usage (${done.state}, ${done.gens})`
	);
	console.assert(
		done.jobs[0].results[0]?.label === 'south/0' &&
			done.jobs[1].results[0]?.label === 'east' &&
			done.jobs[1].results[0]?.w === 64,
		'results saved (inline + url)'
	);
	const again = await q2.enqueue(req);
	console.assert(again.id === rec.id && submits === 1, 'request-hash cache hit');
	console.assert(
		backoff(1, 1) === 2000 && backoff(10, 1) === 60000 && backoff(2, 0) === 2000,
		'backoff'
	);
	await robustTest();
	await offlineTest();
	await notStartedTest();
	await handoffTest();
	await idleHandoffTest();
	await disconnectedLockTest();
	await lockTest();
}

// B15 live: POST /characters/animations -> 500 "Failed to start any animation jobs" is a refusal: resent, not lost.
async function notStartedTest() {
	const store = new Map<string, JobRec>();
	let t = 1000,
		posts = 0;
	const q = new Queue({
		now: () => t,
		online: () => true,
		put: async (k, r) => void store.set(k, structuredClone(r)),
		get: async (k) => structuredClone(store.get(k)),
		del: async (k) => store.delete(k),
		all: async () => [...store.values()].map((r) => structuredClone(r)),
		putBlob: async () => 'x',
		getBlob: async () => undefined,
		fetchBytes: async () => new Uint8Array(),
		api: async <T>(_k: string, method: string): Promise<T> => {
			if (method === 'POST' && ++posts === 1)
				throw new ApiError(
					500,
					'retry',
					'POST /characters/animations -> 500: Failed to start any animation jobs',
					{ detail: 'Failed to start any animation jobs' }
				);
			return (
				method === 'POST'
					? { background_job_ids: ['j'] }
					: { id: 'j', status: 'processing', created_at: '' }
			) as T;
		}
	});
	q.key = 'k';
	const r = await q.enqueue({ method: 'POST', path: '/characters/animations', body: { seed: 1 } });
	await q.tick();
	console.assert(
		store.get(r.id)?.state === 'queued',
		`not started: requeued (${store.get(r.id)?.state})`
	);
	t += 60_000;
	await q.tick();
	console.assert(
		store.get(r.id)?.state === 'running' && posts === 2,
		`then resent once (${store.get(r.id)?.state} ${posts})`
	);
}

// B15: offline -> nothing is sent (no paid POST can be lost), a request with no answer pauses the queue, a free GET /balance
// probe resumes it once PixelLab answers again.
async function offlineTest() {
	const store = new Map<string, JobRec>();
	let t = 1000,
		online = false,
		net = false,
		posts = 0,
		probes = 0;
	const q = new Queue({
		now: () => t,
		online: () => online,
		put: async (k, r) => void store.set(k, structuredClone(r)),
		get: async (k) => structuredClone(store.get(k)),
		del: async (k) => store.delete(k),
		all: async () => [...store.values()].map((r) => structuredClone(r)),
		putBlob: async () => 'x',
		getBlob: async () => undefined,
		fetchBytes: async () => new Uint8Array(),
		api: async <T>(_k: string, method: string, path: string): Promise<T> => {
			if (net) throw new ApiError(0, 'retry', 'network error: Failed to fetch', { network: true });
			if (path === '/balance') {
				probes++;
				return {} as T;
			}
			if (method === 'POST') {
				posts++;
				return { background_job_id: `j${posts}` } as T;
			}
			return { id: 'j', status: 'processing', created_at: '' } as T;
		}
	});
	q.key = 'k';
	const a = await q.enqueue({ method: 'POST', path: '/a', body: { seed: 1 } });
	await q.tick();
	console.assert(
		q.paused === 'offline' && posts === 0 && store.get(a.id)?.state === 'queued',
		'browser offline: paused, nothing sent'
	);
	online = true;
	t += 1000;
	await q.tick();
	console.assert(q.paused === 'offline' && probes === 0, 'probe waits a few seconds');
	t += 3000;
	await q.tick();
	console.assert(
		!q.paused && probes === 1 && posts === 1 && store.get(a.id)?.state === 'running',
		`online again: probe, resume, submit (${q.paused} ${probes} ${posts})`
	);
	net = true;
	t += POLL_MS;
	await q.tick(); // the poll gets no answer
	const b = await q.enqueue({ method: 'POST', path: '/b', body: { seed: 2 } });
	t += 1000;
	await q.tick();
	console.assert(
		q.paused === 'offline' &&
			posts === 1 &&
			store.get(b.id)?.state === 'queued' &&
			store.get(a.id)?.state === 'running',
		'no answer: paused, next job kept queued, running job kept'
	);
	t += PROBE_MS;
	await q.tick();
	console.assert(q.paused === 'offline', 'a probe without an answer stays offline');
	net = false;
	t += PROBE_MS;
	await q.tick();
	console.assert(!q.paused && posts === 2, `answer again: resumed (${q.paused} ${posts})`);
}

// B13 (R6 P1-2, P1-3, P2-9, P2-10, P2-11): uncertain POSTs are never resent, refusals are; a missing input fails at once;
// a failing download backs off and gives up; a malformed result never becomes done; Clear finished keeps what callers need.
async function robustTest() {
	const store = new Map<string, JobRec>(),
		blobs = new Map<string, Uint8Array>(),
		posts: Record<string, number> = {};
	let t = 1000,
		gets = 0,
		fetches = 0;
	const png = new Uint8Array([
		0x89, 0x50, 0x4e, 0x47, 13, 10, 26, 10, 0, 0, 0, 13, 73, 72, 68, 82, 0, 0, 0, 64, 0, 0, 0, 64
	]);
	const q = new Queue({
		now: () => t,
		put: async (k, r) => void store.set(k, structuredClone(r)),
		get: async (k) => structuredClone(store.get(k)),
		del: async (k) => store.delete(k),
		all: async () => [...store.values()].map((r) => structuredClone(r)),
		putBlob: async (b) => {
			const k = await sha256(b);
			blobs.set(k, b);
			return k;
		},
		getBlob: async (k) =>
			blobs.has(k) ? new Blob([blobs.get(k) as Uint8Array<ArrayBuffer>]) : undefined,
		fetchBytes: async () => {
			fetches++;
			throw new Error('GET https://x/e.png -> 403');
		},
		api: async <T>(_k: string, method: string, path: string): Promise<T> => {
			if (method === 'GET' && path.startsWith('/characters/')) {
				gets++;
				if (gets === 1) throw new ApiError(0, 'retry', 'network error: reset');
				return {} as T;
			}
			if (method === 'GET') {
				// polls: j-url completes with a storage URL, j-bad with a broken inline image
				const id = path.split('/').pop();
				if (id === 'j') return { id, status: 'processing', created_at: '' } as T;
				return (
					id === 'j-url'
						? {
								id,
								status: 'completed',
								created_at: '',
								last_response: { storage_urls: { east: 'https://x/e.png' } }
							}
						: {
								id,
								status: 'completed',
								created_at: '',
								last_response: { images: [{ type: 'base64' }] }
							}
				) as T;
			}
			posts[path] = (posts[path] ?? 0) + 1;
			if (path === '/net') throw new ApiError(0, 'retry', 'network error: Failed to fetch');
			if (path === '/gw') throw new ApiError(502, 'retry', 'POST /gw -> 502');
			if (path === '/busy' && posts[path] === 1)
				throw new ApiError(503, 'retry', 'POST /busy -> 503');
			return {
				background_job_id: path === '/url' ? 'j-url' : path === '/bad' ? 'j-bad' : 'j'
			} as T;
		}
	});
	q.key = 'k';
	const run = async (n: number, dt = 1000) => {
		for (let i = 0; i < n; i++) {
			t += dt;
			await q.tick();
		}
	};
	const net = await q.enqueue({ method: 'POST', path: '/net', body: { seed: 1 } });
	const gw = await q.enqueue({ method: 'POST', path: '/gw', body: { seed: 1 } });
	const busy = await q.enqueue({ method: 'POST', path: '/busy', body: { seed: 1 } });
	const ch = await q.enqueue({ method: 'GET', path: '/characters/c1' });
	const img = await q.enqueue({
		method: 'POST',
		path: '/img',
		body: { image: { type: 'base64', base64: bytesToBase64(png) }, seed: 1 }
	});
	blobs.clear(); // the input image vanished (cleared site data, GC bug)
	await run(1);
	await run(70, 1000);
	const st = (r: JobRec) => store.get(r.id)!;
	console.assert(
		st(net).state === 'lost' &&
			st(gw).state === 'lost' &&
			posts['/net'] === 1 &&
			posts['/gw'] === 1,
		`network error / 502 on a paid POST: lost, sent once (${st(net).state} ${posts['/net']}, ${st(gw).state} ${posts['/gw']})`
	);
	console.assert(/may have run/.test(st(net).error ?? ''), 'lost says the job may have run');
	console.assert(
		st(busy).state === 'lost' && posts['/busy'] === 1,
		`generic 503 is uncertain and never resent (${st(busy).state} ${posts['/busy']})`
	);
	console.assert(
		st(ch).state === 'done' && gets === 2,
		`GET retries after a network error (${st(ch).state} ${gets})`
	);
	console.assert(
		st(img).state === 'failed' && !posts['/img'] && /missing/.test(st(img).error ?? ''),
		`missing input image: failed, nothing sent (${st(img).state})`
	);

	const url = await q.enqueue({ method: 'POST', path: '/url', body: { seed: 2 } });
	const bad = await q.enqueue({ method: 'POST', path: '/bad', body: { seed: 2 } });
	await run(600); // 10 minutes of 1 s ticks
	console.assert(
		st(url).state === 'failed' &&
			fetches === MAX_TRIES &&
			/Download manually: https:\/\/x\/e.png/.test(st(url).error ?? ''),
		`failing download backs off and gives up (${st(url).state}, ${fetches} GETs)`
	);
	console.assert(
		st(bad).state === 'failed' &&
			!st(bad).jobs[0].results.length &&
			/malformed/.test(st(bad).error ?? ''),
		`malformed result is not done (${st(bad).state})`
	);

	const keep = new Set([url.id]);
	const n = await q.clearFinished((r) => keep.has(r.id));
	console.assert(
		store.has(url.id) && !store.has(bad.id) && !store.has(busy.id) && n === 6,
		`clear finished keeps referenced records and removes terminal unknowns (${n})`
	);
}

/** Wait for cross-tab state (BroadcastChannel, lock handoff) instead of counting ticks. A 2 s wall-clock deadline fails
 *  the assertion with its own message well inside Vitest's 5 s test timeout; delivery normally takes milliseconds. */
async function until(ok: () => boolean, step?: () => Promise<unknown>) {
	const end = performance.now() + 2000;
	while (!ok() && performance.now() < end) {
		await new Promise((r) => setTimeout(r, 10));
		await step?.();
	}
}

/** Every message posted on `channel` so far has reached every same-page listener: posted-message tasks run in posting
 *  order, so once a fresh probe arrives the earlier deliveries are done. Unlike a sleep, it cannot end early under load,
 *  so a "nothing happened" assertion after it really saw the messages. */
async function delivered(channel: string) {
	const id = crypto.randomUUID(),
		rx = new BroadcastChannel(channel),
		tx = new BroadcastChannel(channel);
	let arrived = false;
	rx.onmessage = (e) => {
		if ((e.data as { probe?: string })?.probe === id) arrived = true;
	};
	tx.postMessage({ probe: id });
	await until(() => arrived);
	rx.close();
	tx.close();
}

/** A minimal Web Locks stand-in: one holder, FIFO waiters, ifAvailable. */
function fakeLocks(): Pick<LockManager, 'request'> {
	let held = false;
	const waiters: (() => void)[] = [];
	const grant = async (cb: LockGrantedCallback<unknown>) => {
		held = true;
		try {
			return await cb({ name: LOCK, mode: 'exclusive' });
		} finally {
			held = false;
			waiters.shift()?.();
		}
	};
	return {
		request: ((
			_name: string,
			a: LockOptions | LockGrantedCallback<unknown>,
			b?: LockGrantedCallback<unknown>
		) => {
			const [opts, cb] = typeof a === 'function' ? [{} as LockOptions, a] : [a, b!];
			if (opts.ifAvailable && opts.signal)
				return Promise.reject(
					new DOMException('signal and ifAvailable cannot be combined', 'NotSupportedError')
				);
			if (!held) return grant(cb);
			if (opts.ifAvailable) return Promise.resolve(cb(null));
			return new Promise<unknown>((res) => waiters.push(() => res(grant(cb))));
		}) as LockManager['request']
	};
}

// Two tabs on one ledger: one leader submits, the follower never submits, never marks the leader's in-flight jobs lost, and
// takes over (and only then cleans up orphans) when the leader's tab goes away.
async function lockTest() {
	const store = new Map<string, JobRec>(),
		locks = fakeLocks();
	let t = 1000,
		submits = 0;
	const deps: Partial<Deps> = {
		now: () => t,
		locks,
		channel: `${LOCK}-selftest-${crypto.randomUUID()}`,
		put: async (k, r) => void store.set(k, structuredClone(r)),
		get: async (k) => structuredClone(store.get(k)),
		del: async (k) => store.delete(k),
		all: async () => [...store.values()].map((r) => structuredClone(r)),
		putBlob: async () => 'x',
		getBlob: async () => undefined,
		fetchBytes: async () => new Uint8Array(),
		api: async <T>(_k: string, method: string, path: string): Promise<T> => {
			if (method === 'POST' && path === '/hang') return new Promise<T>(() => {}); // in flight forever
			if (method === 'POST') {
				submits++;
				return { background_job_id: `j${submits}` } as T;
			}
			return { id: 'j', status: 'processing', created_at: '' } as T;
		}
	};
	const a = new Queue(deps),
		b = new Queue(deps);
	await a.connect();
	await b.connect();
	console.assert(
		a.role === 'leader' && b.role === 'follower' && b.snapshot().role === 'follower',
		`roles ${a.role}/${b.role}`
	);
	const spy = new BroadcastChannel(deps.channel!),
		heard: unknown[] = [];
	spy.onmessage = (e) => heard.push(e.data);
	b.setKey('synthetic-follower-token');
	await delivered(deps.channel!);
	console.assert(
		a.key === '' && b.key === 'synthetic-follower-token',
		'typed key stays private to the connected tab'
	);
	console.assert(
		!JSON.stringify(heard).includes('synthetic-follower-token'),
		'an origin-wide listener never receives typed credentials'
	);
	spy.postMessage({ key: 'synthetic-injected-token' }); // old or malicious same-origin sender
	spy.postMessage({ ask: true });
	await delivered(deps.channel!);
	console.assert(
		a.key === '' && b.key === 'synthetic-follower-token',
		'credential injection and key requests are ignored'
	);
	a.setKey('k');
	a.paused = 'auth';
	b.setKey('synthetic-replacement-token');
	await delivered(deps.channel!);
	console.assert(
		a.key === 'k' && a.paused === 'auth',
		'a follower cannot replace a rejected leader credential'
	);
	console.assert(
		!JSON.stringify(heard).includes('synthetic-replacement-token'),
		'replacement credentials are never broadcast'
	);
	b.setKey('');
	await until(() => !a.key);
	console.assert(a.key === '', 'credential-free Forget signal stops the leader');
	console.assert(
		!heard.some((m) => typeof (m as Record<string, unknown>).key === 'string'),
		'queue notifications never contain a key'
	);
	spy.close();
	a.setKey('k');
	b.setKey('k');
	const hang = await a.enqueue({ method: 'POST', path: '/hang', body: { seed: 1 } });
	void a.tick();
	await until(() => store.get(hang.id)?.state === 'submitting');
	console.assert(store.get(hang.id)?.state === 'submitting', 'leader submit in flight');
	const c = new Queue(deps); // a third tab opening now must not rewrite it to lost
	await c.connect();
	console.assert(
		c.role === 'follower' && store.get(hang.id)?.state === 'submitting',
		'follower load keeps the in-flight record'
	);
	const fromB = await b.enqueue({ method: 'POST', path: '/x', body: { seed: 2 } });
	const dupB = await b.enqueue({ method: 'POST', path: '/x', body: { seed: 2 } });
	t += 60_000;
	await b.tick();
	console.assert(
		submits === 0 && dupB.id === fromB.id,
		'follower never submits; same request = same record'
	);
	await a.tick();
	console.assert(
		submits === 1 && store.get(fromB.id)?.state === 'running',
		`leader merged and submitted the follower's job once (${submits})`
	);
	await b.sync();
	console.assert(
		b.snapshot().jobs.find((r) => r.id === fromB.id)?.state === 'running',
		'follower mirror sees the state'
	);
	// R6 P1-1: the same seeded request from both tabs before either saw the other's record -> one POST
	const dupReq = { method: 'POST' as const, path: '/dup', body: { seed: 42 } };
	const mineA = await a.enqueue(dupReq),
		fromB2 = { ...structuredClone(store.get(mineA.id)!), id: 'twin' }; // B wrote its copy before it saw A's
	store.set(fromB2.id, fromB2);
	t += 31_000;
	await a.tick(); // full re-read fallback adopts the twin
	console.assert(
		mineA.id !== fromB2.id &&
			store.get(fromB2.id)?.state === 'canceled' &&
			/duplicate/.test(store.get(fromB2.id)?.error ?? '') &&
			submits === 2,
		`leader drops the other tab's duplicate (${store.get(fromB2.id)?.state}, ${submits} POSTs)`
	);
	await until(() => b.snapshot().jobs.find((r) => r.id === mineA.id)?.state === 'running');
	console.assert(
		b.snapshot().jobs.find((r) => r.id === mineA.id)?.state === 'running',
		'follower mirror follows the leader by record id (no full re-read)'
	);
	a.disconnect(); // leader tab closed
	await until(() => b.role === 'leader' && store.get(hang.id)?.state === 'lost');
	console.assert(
		b.role === 'leader' && c.role === 'follower',
		`next tab takes over (${b.role}, ${c.role})`
	);
	console.assert(
		store.get(hang.id)?.state === 'lost',
		'orphaned submit is marked lost only by the new leader'
	);
	b.disconnect();
	c.disconnect();
}

// A keyless leader yields automatically; the follower runs its work without sharing its key or extra user steps.
async function handoffTest() {
	const store = new Map<string, JobRec>(),
		locks = fakeLocks();
	let t = 1000,
		posts = 0,
		usedKey = '';
	const deps: Partial<Deps> = {
		locks,
		now: () => t,
		channel: `${LOCK}-selftest-${crypto.randomUUID()}`,
		put: async (k, r) => void store.set(k, structuredClone(r)),
		get: async (k) => structuredClone(store.get(k)),
		all: async () => [...store.values()].map((r) => structuredClone(r)),
		api: async <T>(key: string, _method: string, path: string): Promise<T> => {
			if (path === '/balance') return {} as T;
			posts++;
			usedKey = key;
			return { usage: { type: 'generations', generations: 0.1 } } as T;
		}
	};
	const a = new Queue(deps),
		b = new Queue(deps);
	await a.connect();
	await b.connect();
	let finishBusy!: () => void;
	const busy = (
		a as unknown as { guard(id: string, run: () => Promise<void>): Promise<void> }
	).guard(
		'handoff-busy',
		() =>
			new Promise<void>((resolve) => {
				finishBusy = resolve;
			})
	);
	b.setKey('synthetic-private-handoff-key');
	const rec = await b.enqueue({ method: 'POST', path: '/handoff', body: { seed: 123 } });
	t += FULL_SYNC_MS + 1;
	await a.tick();
	await b.tick();
	await delivered(deps.channel!); // b's keyReady reached the busy leader
	console.assert(
		a.role === 'leader' && posts === 0,
		'a keyless leader does not hand off until its existing work settles'
	);
	console.assert(a.key === '', 'keyless leader never borrows the follower credential');
	finishBusy();
	await busy; // no ledger save: guard completion must still notify waiting followers
	await until(
		() => store.get(rec.id)?.state === 'done',
		() => b.tick()
	);
	await b.tick(); // a later tick must not submit again
	console.assert(
		b.role === 'leader' &&
			posts === 1 &&
			usedKey === 'synthetic-private-handoff-key' &&
			store.get(rec.id)?.state === 'done',
		'connected follower takes over and submits its queued work exactly once with its own key'
	);
	a.disconnect();
	b.disconnect();
}

// A tab with a waiting click takes the jobs from an idle leader at once; never while the leader has a job in flight or
// the app says that tab is mid-generation. It keeps asking until it leads, and the old leader does not ask back.
async function idleHandoffTest() {
	const store = new Map<string, JobRec>(),
		locks = fakeLocks();
	const deps: Partial<Deps> = {
		locks,
		now: () => 1000,
		channel: `${LOCK}-selftest-${crypto.randomUUID()}`,
		put: async (k, r) => void store.set(k, structuredClone(r)),
		get: async (k) => structuredClone(store.get(k)),
		all: async () => [...store.values()].map((r) => structuredClone(r))
	};
	const a = new Queue(deps),
		b = new Queue(deps),
		emit = () => (a as unknown as { emit(): void }).emit();
	await a.connect();
	await b.connect();
	let finishBusy!: () => void,
		appBusy = false;
	a.canYield = () => !appBusy;
	const busy = (
		a as unknown as { guard(id: string, run: () => Promise<void>): Promise<void> }
	).guard(
		'idle-handoff-busy',
		() =>
			new Promise<void>((resolve) => {
				finishBusy = resolve;
			})
	);
	b.requestHandoff();
	await delivered(deps.channel!);
	console.assert(
		a.role === 'leader' && b.role === 'follower',
		'a leader with a job in flight keeps the jobs'
	);
	appBusy = true;
	finishBusy();
	await busy;
	emit();
	await delivered(deps.channel!);
	await delivered(deps.channel!);
	console.assert(
		a.role === 'leader' && b.role === 'follower',
		'a leader the app reports mid-generation keeps the jobs'
	);
	appBusy = false; // no queue update follows: the follower's re-ask finds the leader idle
	await until(() => b.role === 'leader');
	console.assert(
		b.role === 'leader' && a.role === 'follower',
		'an idle leader hands the jobs to the tab that asked'
	);
	(b as unknown as { emit(): void }).emit();
	await delivered(deps.channel!);
	await delivered(deps.channel!);
	console.assert(
		b.role === 'leader' && a.role === 'follower',
		'the former leader rejoins as a follower and does not ask back'
	);
	b.requestHandoff(false);
	a.requestHandoff(false);
	a.disconnect();
	b.disconnect();
}

// A follower disconnected while waiting for the Web Lock must never become an active queue later (HMR/remount).
async function disconnectedLockTest() {
	const locks = fakeLocks();
	const deps: Partial<Deps> = { locks, all: async () => [], put: async () => {}, now: () => 1000 };
	const a = new Queue(deps),
		b = new Queue(deps),
		c = new Queue(deps);
	await a.connect();
	await b.connect();
	await c.connect();
	b.disconnect();
	a.disconnect();
	await until(() => c.role === 'leader');
	console.assert(
		b.role === 'follower' && c.role === 'leader',
		'disconnected follower skips lock takeover; next live tab becomes leader'
	);
	c.disconnect();
	// Disconnect during the asynchronous ledger load must also prevent restarting the ticker.
	let finish!: () => void;
	const slow = new Queue({
		...deps,
		locks: null,
		all: () =>
			new Promise((res) => {
				finish = () => res([]);
			})
	});
	let starts = 0;
	slow.start = () => {
		starts++;
	};
	const pending = slow.connect();
	slow.disconnect();
	finish();
	await pending;
	console.assert(starts === 0, 'disconnect during ledger load never restarts the queue timer');
}
