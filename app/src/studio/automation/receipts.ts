// What agents started in this tab, so they can always learn how it ended: a draft that saved itself or a creation that
// finished leaves the Studio's running lists, and an agent must never guess (and pay again) because its id disappeared.
import { sha256, stableStringify } from '../../lib/image/hash.ts';
import type { DirectionName } from '../../lib/rig/rig.ts';
import { AgentError, type Json } from './contract.ts';

export type Outcome =
	| 'queued'
	| 'running'
	| 'review'
	| 'saved'
	| 'created'
	| 'failed'
	| 'canceled'
	| 'discarded'
	| 'stopped';
const FINAL: readonly Outcome[] = [
	'saved',
	'created',
	'failed',
	'canceled',
	'discarded',
	'stopped'
];
export const isFinal = (outcome: Outcome) => FINAL.includes(outcome);
export const ACTIVITY_LIMIT = 30;
const RECEIPT_LIMIT = 200;
const RECEIPT_AGE_MS = 30 * 24 * 60 * 60 * 1000;

export interface Receipt {
	kind: 'character' | 'item' | 'move' | 'equipment';
	moveId?: string;
	/** Opaque identity of this start, also the queue scope. */
	id: string;
	/** The Studio draft or creation id, which is separate from the activity identity. */
	targetId?: string;
	directions?: DirectionName[];
	characterId: string;
	name: string;
	requestId?: string;
	/** The paid request's arguments: a reused requestId must mean the same request. */
	fingerprint: string;
	generations: number;
	startedAt: string;
	outcome: Outcome;
	error?: string;
	price?: Record<string, Json>;
}

export type MoveAdmission = Omit<Receipt, 'price'> & {
	price?: Record<
		string,
		string | number | boolean | null | string[] | number[] | { id: string; text: string }[]
	>;
};

export function retainedReceipts<T extends Pick<Receipt, 'startedAt'>>(
	list: readonly T[],
	now = Date.now()
) {
	return list
		.filter((r) => now - Date.parse(r.startedAt) <= RECEIPT_AGE_MS)
		.sort((a, b) => b.startedAt.localeCompare(a.startedAt))
		.slice(0, RECEIPT_LIMIT);
}

export class ReceiptLog {
	#receipts: Receipt[] = [];
	add(receipt: Receipt) {
		const i = this.#receipts.findIndex((r) => r.id === receipt.id);
		if (i < 0) this.#receipts.push(receipt);
		else this.#receipts[i] = receipt;
		return receipt;
	}
	get(id: string) {
		return this.#receipts.find((r) => r.id === id);
	}
	remove(id: string) {
		this.#receipts = this.#receipts.filter((r) => r.id !== id);
	}
	refresh(receipt: Receipt) {
		const local = this.get(receipt.id);
		if (!local) return this.add(receipt);
		const advances =
			isFinal(receipt.outcome) ||
			(!isFinal(local.outcome) && (receipt.outcome === 'review' || local.outcome === 'queued'));
		if (advances) this.settle(local, receipt.outcome, receipt.error, true);
		return local;
	}
	prune() {
		this.#receipts = retainedReceipts(this.#receipts);
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
	/** An observed Studio retry or a creation completed in another tab can advance a receipt. */
	settle(receipt: Receipt, outcome: Outcome, error?: string, resumed = false) {
		if (isFinal(receipt.outcome) && !resumed) return;
		receipt.outcome = outcome;
		if (error) receipt.error = error;
		else delete receipt.error;
	}
}

/** An item draft's outcome from what the Studio shows now. `saved`: whether its character holds the item, when known;
 *  undefined when the draft is gone and that is still unknown. */
export function itemOutcome(
	draft:
		| {
				phase: 'queued' | 'running' | 'review' | 'failed';
				canceled?: boolean;
				acceptedAt?: unknown;
		  }
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
	if (o.exists) return 'created';
	if (o.error) return 'failed';
	// Settled without a character or an error: this tab stopped running jobs (another tab took over, or a reload).
	return o.finished ? 'stopped' : 'running';
}

export const receipts = new ReceiptLog();
export const receiptView = ({
	fingerprint: _fingerprint,
	price: _price,
	targetId,
	id,
	...rest
}: Receipt) => ({
	...rest,
	activityId: id,
	...(rest.kind === 'item' && targetId ? { draftId: targetId } : {}),
	...(rest.kind === 'equipment' && targetId ? { itemId: targetId } : {})
});
export const startView = (r: Receipt, budget: Json, repeated = false) => ({
	started: true,
	activityId: r.id,
	characterId: r.characterId,
	status: r.outcome,
	...r.price,
	budget,
	...(repeated ? { repeated: true } : {})
});
/** What a request was, for matching a repeated requestId: its arguments without dryRun and the id itself. */
export function fingerprintOf(args: Record<string, unknown>) {
	const { dryRun: _dryRun, requestId: _requestId, ...rest } = args;
	return sha256(stableStringify(rest));
}
