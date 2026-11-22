// Paid agent work runs only inside a budget the person approves in this tab, once per task. The budget lives in memory: a
// reload or another tab starts with none, so a stale page can never keep spending. It ends when the person presses End,
// and when the PixelLab connection changes: an approval is for one account's generations.
import { mount, unmount } from 'svelte';
import { readonly, writable } from 'svelte/store';
import { app, getKeyRevision } from '../../lib/app.svelte.ts';
import { AGENT_APPROVAL_ENDED, queue } from '../../lib/pixellab/queue.ts';
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
export type BudgetRequest = {
	activityId: string;
	answer: Answer | 'pending' | 'failed';
	generations: number;
	approxUsd: number;
};
const requests = new Map<string, BudgetRequest>();
let latestRequest: BudgetRequest | undefined;
export const budgetRequest = (id: string) => requests.get(id);
const reservations = new Set<() => void>();
type BudgetView = BudgetState & { active: boolean; request: BudgetRequest | null };
const snapshot = (): BudgetView => ({
	...ledger.snapshot(),
	active,
	request: latestRequest ?? null
});
const summary = writable(snapshot());
export const budgetView = readonly(summary);

/** A connection change since the approval clears it. */
function syncCredential() {
	if (keyRevision !== getKeyRevision()) {
		keyRevision = getKeyRevision();
		epoch++;
		active = false;
		pending?.abort();
		for (const finish of reservations) finish();
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
	start: (
		check: () => void,
		activityId: string,
		finish: () => void,
		stillApproved: () => void
	) => T | Promise<T>
): Promise<T> {
	checkAbort(signal);
	requireLeader();
	syncCredential();
	const reservedAt = epoch;
	const id = Symbol(what);
	if (!ledger.reserve(what, generations, id))
		throw new AgentError(
			`This can cost up to ${generations} generations but only ${budget().remaining} remain. Call request_budget first.`,
			'budget'
		);
	const activityId = `agent:${crypto.randomUUID()}`;
	const revoke = queue.authorizeAgentActivity(activityId);
	const finish = () => {
		if (!reservations.delete(finish)) return;
		if (!revoke()) ledger.release(what, generations, id);
		changed();
	};
	reservations.add(finish);
	const stillApproved = () => {
		syncCredential();
		if (reservedAt !== epoch || !reservations.has(finish))
			throw new AgentError(AGENT_APPROVAL_ENDED, 'budget');
		requireLeader();
	};
	const check = () => {
		stillApproved();
		checkAbort(signal);
	};
	try {
		changed();
		return await start(check, activityId, finish, stillApproved);
	} catch (error) {
		finish();
		throw error;
	}
}
/** The person's End: no further paid starts until a new approval. */
export function endBudget() {
	syncCredential();
	for (const finish of reservations) finish();
	ledger.end();
	epoch++;
	active = false;
	pending?.abort();
	changed();
}

/** USD at the account's plan price (list price of plan 1 while the tier is unknown). */
export function rateUsd(generations: number): number {
	return usdOf(generations, planRate(accountTier(app.balance) ?? 1));
}

/** Ask the person in the page to approve more generations for the agent (see BudgetLedger.request). */
export async function requestBudget(
	generations: number,
	purpose: string,
	signal: AbortSignal
): Promise<BudgetRequest> {
	framedRefusal();
	syncCredential();
	requireLeader();
	checkAbort(signal);
	if (pending) throw new AgentError('A budget request is already waiting for the user.', 'busy');
	const controller = new AbortController();
	pending = controller;
	const request: BudgetRequest = {
		activityId: crypto.randomUUID(),
		answer: 'pending',
		generations,
		approxUsd: Math.round(rateUsd(generations) * 100) / 100
	};
	let opened = false;
	let answered = false;
	const record = (answer: BudgetRequest['answer']) => {
		const next = { ...request, answer };
		requests.set(request.activityId, next);
		latestRequest = next;
		changed();
		return next;
	};
	const completion = ledger
		.request(
			generations,
			(answer) => {
				const target = document.createElement('div');
				document.body.append(target);
				try {
					const dialog = mount(AgentBudgetDialog, {
						target,
						props: {
							generations,
							usd: rateUsd(generations),
							purpose,
							onanswer: (allowed: boolean) => {
								answered = true;
								answer(allowed);
							}
						}
					});
					opened = true;
					return () => {
						void unmount(dialog);
						target.remove();
					};
				} catch (error) {
					target.remove();
					throw error;
				}
			},
			controller.signal,
			ASK_MS
		)
		.then((answer) => {
			syncCredential();
			if (controller.signal.aborted) return record('canceled');
			if (answer === 'allowed') {
				try {
					showIndicator();
				} catch {
					endBudget();
					throw new AgentError('PixelDoll could not show the approved budget.', 'not_ready');
				}
				active = true;
			}
			return record(answer);
		})
		.finally(() => {
			pending = undefined;
		});
	if (!opened || answered) return completion;
	void completion.catch(() => record('failed'));
	return record('pending');
}

/** The small always-visible budget line with End, from the first approval on. */
function showIndicator() {
	if (indicator) return;
	framedRefusal();
	// A modal dialog makes everything outside it inert, so the line moves into whichever modal dialog is on top (a Studio
	// sheet, a confirmation, the evidence panel) and back out when it closes: End stays within reach. It is fixed to the
	// window, so it shows in the same place wherever it lives. Not a popover: the Studio reads an open popover as an open
	// menu (backdrop clicks, Escape, wheel zoom).
	const host = document.createElement('div');
	const modals: HTMLDialogElement[] = [];
	const place = (records: MutationRecord[] = []) => {
		for (const { type, target } of records)
			if (type === 'attributes' && target instanceof HTMLDialogElement && !modals.includes(target))
				modals.push(target);
		for (let i = modals.length - 1; i >= 0; i--)
			if (!modals[i].isConnected || !modals[i].matches(':modal')) modals.splice(i, 1);
		const parent = modals.at(-1) ?? document.body;
		if (host.parentElement !== parent) parent.append(host);
	};
	modals.push(...document.querySelectorAll('dialog'));
	try {
		place();
		mount(AgentBudget, { target: host });
		new MutationObserver(place).observe(document.body, {
			subtree: true,
			childList: true,
			attributeFilter: ['open']
		});
		indicator = true;
	} catch (error) {
		host.remove();
		throw error;
	}
}

/** A page framed by another site never shows agent approval controls (clickjacking); main.ts also keeps the Studio out
 *  of frames. */
function framedRefusal() {
	if (window.top !== window)
		throw new AgentError(
			'PixelDoll runs inside a frame here. Open it in its own tab.',
			'not_ready'
		);
}
