// Paid agent work runs only inside a budget the person approves in this tab, once per task. The budget lives in memory: a
// reload or another tab starts with none, so a stale page can never keep spending. It ends when the person presses End,
// and when the PixelLab connection changes: an approval is for one account's generations.
import { mount, unmount } from 'svelte';
import { app, getKeyRevision } from '../../lib/app.svelte.ts';
import { queue } from '../../lib/pixellab/queue.ts';
import { accountTier } from '../../lib/pixellab/plans.ts';
import { planRate, usdOf } from '../costEstimate.ts';
import { AgentError, BudgetLedger, type Answer, type BudgetState } from './contract.ts';
import AgentBudgetDialog from './AgentBudgetDialog.svelte';
import AgentBudget from './AgentBudget.svelte';

/** How long a budget question waits for the person before it closes by itself. */
export const ASK_MS = 5 * 60_000;

const ledger = new BudgetLedger();
let keyRevision = getKeyRevision(),
	indicator = false;
const listeners = new Set<(state: BudgetState) => void>();

/** A connection change since the approval clears it. */
function current() {
	if (keyRevision !== getKeyRevision()) {
		keyRevision = getKeyRevision();
		ledger.clear();
	}
	return ledger;
}
function changed() {
	const state = current().snapshot();
	for (const listener of listeners) listener(state);
	if (state.approved > 0) showIndicator();
}

export const budget = (): BudgetState => current().snapshot();
export function reserve(what: string, generations: number) {
	const ok = current().reserve(what, generations);
	if (ok) changed();
	return ok;
}
export function release(what: string, generations: number) {
	current().release(what, generations);
	changed();
}
/** The person's End: no further paid starts until a new approval. */
export function endBudget() {
	current().end();
	changed();
}
/** Calls `listener` now and with every change; returns how to stop. */
export function watchBudget(listener: (state: BudgetState) => void) {
	listeners.add(listener);
	listener(budget());
	return () => void listeners.delete(listener);
}
/** Clears the budget if the PixelLab connection changed since it was approved. */
export const checkBudget = changed;

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
	if (queue.role === 'follower')
		throw new AgentError(
			'Another PixelDoll tab runs generation jobs. Ask for the budget in that tab.',
			'busy'
		);
	const answer = await current().request(
		generations,
		(answer) => {
			const target = document.createElement('div');
			document.body.append(target);
			const dialog = mount(AgentBudgetDialog, {
				target,
				props: { generations, usd: rateUsd(generations), purpose, onanswer: answer }
			});
			return () => {
				void unmount(dialog);
				target.remove();
			};
		},
		signal,
		ASK_MS
	);
	changed();
	return answer;
}

/** The small always-visible budget line with End, from the first approval on. */
function showIndicator() {
	if (indicator) return;
	indicator = true;
	const target = document.createElement('div');
	document.body.append(target);
	mount(AgentBudget, { target });
}
