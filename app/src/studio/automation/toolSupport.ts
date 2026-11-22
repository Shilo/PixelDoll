import { app } from '../../lib/app.svelte.ts';
import { tierDecision } from '../../lib/pixellab/plans.ts';
import {
	doc,
	readAgentReceipts,
	readCharacter,
	refreshProjects,
	store,
	studioStartupState,
	writeAgentReceipt
} from '../state.svelte.ts';
import { AgentError, type JsonSchema } from './contract.ts';
import { requireLeader } from './budget.ts';
import { isFinal, receipts, type Receipt } from './receipts.ts';

export async function loadReceipts() {
	for (const receipt of await readAgentReceipts()) {
		const local = receipts.get(receipt.id);
		if (!local) receipts.add(receipt);
		else if (
			isFinal(receipt.outcome) &&
			(!isFinal(local.outcome) || ['saved', 'created', 'discarded'].includes(receipt.outcome))
		)
			receipts.settle(local, receipt.outcome, receipt.error, true);
	}
}

export async function recordReceipt(receipt: Receipt) {
	if (!(await writeAgentReceipt(receipt.id, { ...receipt })))
		throw new AgentError(
			'This requestId already has a start. Repeat the call to get its receipt.',
			'busy'
		);
	return receipts.add(receipt);
}

export async function forgetReceipt(receipt: Receipt) {
	await writeAgentReceipt(receipt.id, null);
	receipts.remove(receipt.id);
}
export const str = (description: string, maxLength = 200): JsonSchema => ({
	type: 'string',
	description,
	maxLength
});
export const requestIdArg = str(
	'Optional id you choose for this paid request. Repeating a call with the same requestId returns the first start instead of paying again.',
	100
);

export async function ready() {
	for (let i = 0; i < 100 && (studioStartupState() === 'loading' || doc.loading); i++)
		await new Promise((r) => setTimeout(r, 100));
	if (studioStartupState() === 'failed')
		throw new AgentError('PixelDoll could not load saved work in this tab.', 'not_ready');
	if (studioStartupState() === 'loading' || doc.loading)
		throw new AgentError('PixelDoll is still loading. Try again shortly.', 'not_ready');
}

export async function listed(id: string) {
	if (store.projects.some((p) => p.id === id)) return;
	if (!(await refreshProjects()))
		throw new AgentError('PixelDoll could not read the saved characters.', 'not_ready');
	if (!store.projects.some((p) => p.id === id))
		throw new AgentError(`No character "${id}". Call list_characters.`, 'not_found');
}

/** Paid starts need a connected account, the job-running tab, the plan tier and an approved budget. */
export function paidPreflight(minimumTier: number) {
	if (!app.key || app.keyRejected)
		throw new AgentError(
			'PixelLab is not connected. Ask the user to connect their PixelLab account in PixelDoll. Never ask for the token.',
			'needs_user'
		);
	requireLeader();
	if (tierDecision(app.balance, { required: minimumTier }).kind === 'required')
		throw new AgentError(`This needs PixelLab plan tier ${minimumTier} or higher.`, 'needs_user');
}

/** Read the captured id without changing the current selection. */
export async function readSavedCharacter(id: string) {
	await listed(id);
	try {
		return (await readCharacter(id)).r;
	} catch (error) {
		console.error('agent read character', error);
		throw new AgentError(`Character "${id}" could not be read.`, 'not_ready');
	}
}
