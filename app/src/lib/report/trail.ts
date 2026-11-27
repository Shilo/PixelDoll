// The recent-actions trail for problem reports: a small ring of app events kept in memory only, never stored, logged or
// sent. Report shows it in the exact public preview, so it helps reproduce a failure without any analytics. Every value
// is app vocabulary (an area, a data-trail name, a message key, a normalized endpoint, a state word); report.ts checks each
// one again before it is shown, so a wrong call site can lose an entry but never leak text. Kept free of Svelte and the DOM
// so it can be tested alone; studio/trail.svelte.ts wires it to the page.

export type TrailEvent =
	/** A press on a control. `control` comes only from its static data-trail attribute; without one, only the area. */
	| { kind: 'press'; area: string; control?: string }
	| { kind: 'open' | 'close'; area: string }
	| { kind: 'screen'; area: string }
	/** A problem notice shown to the person, by its message key. */
	| { kind: 'notice'; key: string; tone: 'error' | 'warning' }
	| { kind: 'job'; method: string; endpoint: string; state: string }
	| { kind: 'page'; state: 'hidden' | 'visible' | 'online' | 'offline' }
	/** An error that reached the global handlers, by its name. */
	| { kind: 'error'; name: string };

export interface TrailEntry {
	/** performance.now() when it last happened. */
	at: number;
	/** performance.now() when it first happened, for repeated events. */
	first: number;
	event: TrailEvent;
	/** How many times in a row the same event happened (a double click, repeated zoom). */
	times: number;
}

/** Enough to cover the last minute or so of ordinary use; the report shows at most this many. */
export const TRAIL_SIZE = 20;
const ring: TrailEntry[] = [];
let newest = -1;

const same = (a: TrailEvent, b: TrailEvent) => {
	// Unnamed presses may be on different controls, so they are never counted as one repeated action.
	if (a.kind === 'press' && !a.control) return false;
	const x = a as Record<string, unknown>,
		y = b as Record<string, unknown>;
	const keys = Object.keys(x);
	return keys.length === Object.keys(y).length && keys.every((key) => x[key] === y[key]);
};

/** Records one event. Never throws, and keeps at most TRAIL_SIZE entries. */
export function track(event: TrailEvent, at = performance.now()) {
	try {
		const last = ring[newest];
		if (last && same(last.event, event)) {
			last.times++;
			last.at = at;
			return;
		}
		newest = (newest + 1) % TRAIL_SIZE;
		ring[newest] = { at, first: at, event: { ...event }, times: 1 };
	} catch (error) {
		// A report aid must never break the action it records.
		console.warn('Problem report trail', error);
	}
}

/** A copy of the trail, newest first, optionally only what happened up to `until`. A repeated event that went on after
 *  `until` is kept from its first time, as happening once: how many of its repeats came before is not known. */
export function trailSnapshot(until = Infinity): TrailEntry[] {
	const out: TrailEntry[] = [];
	for (let i = 0; i < ring.length; i++) {
		const entry = ring[(newest - i + TRAIL_SIZE) % TRAIL_SIZE];
		if (!entry || entry.first > until) continue;
		out.push(
			entry.at <= until
				? { ...entry, event: { ...entry.event } }
				: { at: entry.first, first: entry.first, event: { ...entry.event }, times: 1 }
		);
	}
	return out;
}

const SETTLED = new Set(['done', 'failed', 'canceled', 'lost']);

/** A PixelLab request record as the queue lists it. */
export interface WatchedRequest {
	id: string;
	state: string;
	method: string;
	endpoint: string;
	/** Date.now() when it was made. */
	createdAt: number;
}

/** Follows the queue's request records into the trail: only a request's start and end, since its steps in between would
 *  push the person's own actions out, and only in the tab that runs the requests, since another tab's requests are not
 *  this tab's actions. A record from before `pageStart` (Date.now() time) is history until it settles here. */
export function watchRequests(pageStart: number, now = () => performance.now()) {
	const states = new Map<string, string>();
	const settled = new Map<string, number>();
	return {
		update(records: readonly WatchedRequest[], runsHere: boolean) {
			const seen = new Set<string>();
			for (const record of records) {
				seen.add(record.id);
				const before = states.get(record.id);
				if (before === record.state) continue;
				states.set(record.id, record.state);
				const thisVisit = record.createdAt >= pageStart;
				const started = before === undefined && thisVisit;
				const settledNow = SETTLED.has(record.state) && (before !== undefined || thisVisit);
				if (!runsHere || !(started || settledNow)) continue;
				// One clock reading, so the report of this failure keeps its own "failed" line.
				const at = now();
				if (settledNow) settled.set(record.id, at);
				track(
					{ kind: 'job', method: record.method, endpoint: record.endpoint, state: record.state },
					at
				);
			}
			for (const id of states.keys())
				if (!seen.has(id)) {
					states.delete(id);
					settled.delete(id);
				}
		},
		/** When this tab saw the request settle; undefined if it settled before this page or in another tab. */
		settledAt: (id: string) => settled.get(id)
	};
}

/** For tests. */
export function clearTrail() {
	ring.length = 0;
	newest = -1;
}
