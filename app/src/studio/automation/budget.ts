// Paid agent work runs only inside a budget the person approves in this tab, once per task. The budget lives in memory: a
// reload or another tab starts with none, so a stale page can never keep spending.
import { mount, unmount } from 'svelte';
import { app } from '../../lib/app.svelte.ts';
import { accountTier } from '../../lib/pixellab/plans.ts';
import { planRate, usdOf } from '../costEstimate.ts';
import { BudgetLedger, type BudgetState } from './contract.ts';
import AgentBudgetDialog from './AgentBudgetDialog.svelte';

const ledger = new BudgetLedger();
let asking = false;

export const budget = (): BudgetState => ledger.snapshot();
export const reserve = (what: string, generations: number) => ledger.reserve(what, generations);
export const release = (what: string, generations: number) => ledger.release(what, generations);

/** USD at the account's plan price (list price of plan 1 while the tier is unknown). */
export function rateUsd(generations: number): number {
	const tier = accountTier(app.balance);
	return usdOf(generations, planRate(tier !== null && tier >= 0 && tier <= 3 ? tier : 1));
}

/** Ask the person in the page to approve more generations for the agent. Resolves false if they decline. */
export async function requestBudget(generations: number, purpose: string): Promise<boolean> {
	if (asking) throw new Error('A budget request is already waiting for the user.');
	asking = true;
	const target = document.createElement('div');
	document.body.append(target);
	try {
		const allowed = await new Promise<boolean>((resolve) => {
			const dialog = mount(AgentBudgetDialog, {
				target,
				props: {
					generations,
					usd: rateUsd(generations),
					purpose,
					onanswer: (answer: boolean) => {
						void unmount(dialog);
						resolve(answer);
					}
				}
			});
		});
		if (allowed) ledger.approve(generations);
		return allowed;
	} finally {
		target.remove();
		asking = false;
	}
}
