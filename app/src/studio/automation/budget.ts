// Paid agent work runs only inside a budget the person approves in this tab, once per task. The budget lives in memory: a
// reload or another tab starts with none, so a stale page can never keep spending. It ends when the person presses End,
// and when the PixelLab connection changes: an approval is for one account's generations.
import { mount, unmount } from 'svelte';
import { readonly, writable } from 'svelte/store';
import { app, getKeyRevision } from '../../lib/app.svelte.ts';
import { queue } from '../../lib/pixellab/queue.ts';
import { accountTier } from '../../lib/pixellab/plans.ts';
import { planRate, usdOf } from '../costEstimate.ts';
import { AgentError, BudgetLedger, checkAbort, type Answer, type BudgetState } from './contract.ts';
import AgentBudgetDialog from './AgentBudgetDialog.svelte';
import AgentBudget from './AgentBudget.svelte';

/** How long a budget question waits for the person before it closes by itself. */
export const ASK_MS = 5 * 60_000;

const ledger = new BudgetLedger();
let keyRevision = getKeyRevision(),
	indicator = false;
let epoch = 0;
let active = false;
let pending: AbortController | undefined;
type BudgetView = BudgetState & { active: boolean };
const snapshot = (): BudgetView => ({ ...ledger.snapshot(), active });
const summary = writable(snapshot());
export const budgetView = readonly(summary);

/** A connection change since the approval clears it. */
function syncCredential() {
	if (keyRevision !== getKeyRevision()) {
		keyRevision = getKeyRevision();
		epoch++;
		active = false;
		pending?.abort();
		ledger.clear();
		summary.set(snapshot());
	}
}
function changed() {
	summary.set(snapshot());
}

const stopWatching = queue.subscribe(({ role }) => {
	syncCredential();
	if (role === 'follower') pending?.abort();
});
import.meta.hot?.dispose(stopWatching);

export function budget(): BudgetView {
	syncCredential();
	return snapshot();
}

export function requireLeader() {
	if (queue.role === 'follower')
		throw new AgentError('Another PixelDoll tab runs generation jobs. Use that tab.', 'busy');
}

/** Recheck at Studio admission after asynchronous preparation. Refund only a start that was refused. */
export async function withReservation<T>(
	what: string,
	generations: number,
	signal: AbortSignal,
	start: (check: () => void) => T | Promise<T>
): Promise<T> {
	checkAbort(signal);
	requireLeader();
	syncCredential();
	const reservedAt = epoch;
	if (!ledger.reserve(what, generations))
		throw new AgentError(
			`This can cost up to ${generations} generations but only ${budget().remaining} remain. Call request_budget first.`,
			'budget'
		);
	const check = () => {
		syncCredential();
		if (reservedAt !== epoch)
			throw new AgentError('The approved budget ended before the work started.', 'budget');
		checkAbort(signal);
		requireLeader();
	};
	try {
		changed();
		return await start(check);
	} catch (error) {
		syncCredential();
		if (reservedAt === epoch) {
			ledger.release(what, generations);
			changed();
		}
		throw error;
	}
}
/** The person's End: no further paid starts until a new approval. */
export function endBudget() {
	syncCredential();
	ledger.end();
	epoch++;
	active = false;
	pending?.abort();
	changed();
}

/** USD at the account's plan price (list price of plan 1 while the tier is unknown). */
export function rateUsd(generations: number): number {
	const tier = accountTier(app.balance);
	return usdOf(generations, planRate(tier !== null && tier >= 0 && tier <= 3 ? tier : 1));
}

/** Ask the person in the page to approve more generations for the agent (see BudgetLedger.request). */
export async function requestBudget(
	generations: number,
	purpose: string,
	signal: AbortSignal
): Promise<Answer> {
	syncCredential();
	requireLeader();
	checkAbort(signal);
	if (pending) throw new AgentError('A budget request is already waiting for the user.', 'busy');
	const controller = new AbortController();
	pending = controller;
	const requestSignal = AbortSignal.any([signal, controller.signal]);
	try {
		const answer = await ledger.request(
			generations,
			(answer) => {
				const target = document.createElement('div');
				document.body.append(target);
				try {
					const dialog = mount(AgentBudgetDialog, {
						target,
						props: { generations, usd: rateUsd(generations), purpose, onanswer: answer }
					});
					return () => {
						void unmount(dialog);
						target.remove();
					};
				} catch (error) {
					target.remove();
					throw error;
				}
			},
			requestSignal,
			ASK_MS
		);
		syncCredential();
		if (requestSignal.aborted) return 'canceled';
		if (answer === 'allowed') {
			try {
				showIndicator();
			} catch {
				endBudget();
				throw new AgentError('PixelDoll could not show the approved budget.', 'not_ready');
			}
			active = true;
		}
		changed();
		return answer;
	} finally {
		pending = undefined;
	}
}

/** The small always-visible budget line with End, from the first approval on. */
function showIndicator() {
	if (indicator) return;
	const target = document.createElement('div');
	document.body.append(target);
	try {
		mount(AgentBudget, { target });
		indicator = true;
	} catch (error) {
		target.remove();
		throw error;
	}
}
