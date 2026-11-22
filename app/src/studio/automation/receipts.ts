// What agents started in this tab, so they can always learn how it ended: a draft that saved itself or a creation that
// finished leaves the Studio's running lists, and an agent must never guess (and pay again) because its id disappeared.
// Memory only, like the budget: a reload starts an empty log (the Studio's Activity still lists resumed work).
import { AgentError } from './contract.ts';

export type Outcome =
	'running' | 'review' | 'saved' | 'created' | 'failed' | 'canceled' | 'discarded' | 'stopped';
const FINAL: readonly Outcome[] = [
	'saved',
	'created',
	'failed',
	'canceled',
	'discarded',
	'stopped'
];
export const isFinal = (outcome: Outcome) => FINAL.includes(outcome);

export interface Receipt {
	kind: 'character' | 'item';
	/** Draft id for an item (also the saved item's id), creation id for a character (also the new character's id). */
	id: string;
	characterId: string;
	name: string;
	requestId?: string;
	/** The paid request's arguments: a reused requestId must mean the same request. */
	fingerprint: string;
	generations: number;
	startedAt: string;
	outcome: Outcome;
	error?: string;
}

export class ReceiptLog {
	#receipts: Receipt[] = [];
	add(receipt: Receipt) {
		this.#receipts.push(receipt);
		return receipt;
	}
	get(id: string) {
		return this.#receipts.find((r) => r.id === id);
	}
	all(): readonly Receipt[] {
		return this.#receipts;
	}
	/** The earlier start of the same request, for retries that must not pay twice. */
	repeat(kind: Receipt['kind'], requestId: unknown, fingerprint: string) {
		if (typeof requestId !== 'string' || !requestId) return undefined;
		const earlier = this.#receipts.find((r) => r.kind === kind && r.requestId === requestId);
		if (earlier && earlier.fingerprint !== fingerprint)
			throw new AgentError(
				`requestId "${requestId}" was already used for a different request. Use a new requestId for new work.`
			);
		return earlier;
	}
	/** Records how it ended; a final outcome never changes again. */
	settle(receipt: Receipt, outcome: Outcome, error?: string) {
		if (isFinal(receipt.outcome)) return;
		receipt.outcome = outcome;
		if (error) receipt.error = error;
	}
}

/** An item draft's outcome from what the Studio shows now. `saved`: whether its character holds the item, when known;
 *  undefined when the draft is gone and that is still unknown. */
export function itemOutcome(
	draft:
		| { phase: 'running' | 'review' | 'failed'; canceled?: boolean; acceptedAt?: unknown }
		| undefined,
	saved?: boolean
): Outcome | undefined {
	if (draft)
		return draft.acceptedAt
			? 'saved'
			: draft.phase === 'failed'
				? draft.canceled
					? 'canceled'
					: 'failed'
				: draft.phase;
	if (saved === undefined) return undefined;
	return saved ? 'saved' : 'discarded';
}

/** A character creation's outcome: `finished` once its run settled in this tab, `exists` once the character is listed. */
export function creationOutcome(o: {
	running: boolean;
	error: boolean;
	finished: boolean;
	exists: boolean;
}): Outcome {
	if (o.running) return 'running';
	if (o.error) return 'failed';
	if (o.exists) return 'created';
	// Settled without a character or an error: this tab stopped running jobs (another tab took over, or a reload).
	return o.finished ? 'stopped' : 'running';
}
