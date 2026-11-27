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
	/** performance.now() when it happened. */
	at: number;
	event: TrailEvent;
	/** How many times in a row the same event happened (a double click, repeated zoom). */
	times: number;
}

/** Enough to cover the last minute or so of ordinary use; the report shows at most this many. */
export const TRAIL_SIZE = 20;
const ring: TrailEntry[] = [];
let newest = -1;

const same = (a: TrailEvent, b: TrailEvent) => {
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
		ring[newest] = { at, event: { ...event }, times: 1 };
	} catch (error) {
		// A report aid must never break the action it records.
		console.warn('Problem report trail', error);
	}
}

/** A copy of the trail, newest first, optionally only what happened up to `until`. */
export function trailSnapshot(until = Infinity): TrailEntry[] {
	const out: TrailEntry[] = [];
	for (let i = 0; i < ring.length; i++) {
		const entry = ring[(newest - i + TRAIL_SIZE) % TRAIL_SIZE];
		if (entry && entry.at <= until) out.push({ ...entry, event: { ...entry.event } });
	}
	return out;
}

/** For tests. */
export function clearTrail() {
	ring.length = 0;
	newest = -1;
}
