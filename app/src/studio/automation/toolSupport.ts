import { app } from '../../lib/app.svelte.ts';
import { tierDecision } from '../../lib/pixellab/plans.ts';
import {
	doc,
	readAgentDrafts,
	readAgentReceipts,
	readCharacter,
	readCharacterMetadata,
	refreshProjects,
	store,
	studioStartupState,
	writeAgentReceipt,
	type Gen
} from '../state.svelte.ts';
import { agentEquipmentSaved, agentMoveDecision } from '../create.ts';
import { AgentError, type JsonSchema } from './contract.ts';
import { budget, requireLeader } from './budget.ts';
import {
	fingerprintOf,
	isFinal,
	itemOutcome,
	receipts,
	startView,
	type Receipt
} from './receipts.ts';
import { jobError } from './jobError.ts';

export const draftOutcome = ({ phase, canceled, draft }: Gen) =>
	itemOutcome({ phase, canceled, acceptedAt: draft.acceptedAt }) ?? phase;

/** Absence from a tab's lists is never proof that paid work ended. */
export async function loadReceipts(
	ids: readonly string[] = [],
	request?: Pick<Receipt, 'kind' | 'requestId'>
) {
	const loaded = (await readAgentReceipts(ids, request)).map((receipt) =>
		receipts.refresh(receipt)
	);
	receipts.prune();
	const active = loaded.filter((r) => !isFinal(r.outcome));
	const drafts = active.some((r) => r.kind === 'item') ? await readAgentDrafts() : undefined;
	const records = new Map<string, ReturnType<typeof readCharacterMetadata>>();
	await Promise.all(
		active.map(async (r) => {
			let metadata = records.get(r.characterId);
			if (!metadata) records.set(r.characterId, (metadata = readCharacterMetadata(r.characterId)));
			const project = await metadata;
			if (r.kind === 'character') {
				if (project) receipts.settle(r, 'created');
			} else if (r.kind === 'move') {
				const decision = agentMoveDecision(project, r.id);
				const candidate = r.moveId && project?.moveReviews?.[r.moveId];
				if (decision) receipts.settle(r, decision);
				else if (candidate && candidate.spec.activityScope === r.id) receipts.settle(r, 'review');
			} else if (r.kind === 'equipment') {
				if (agentEquipmentSaved(project, r)) receipts.settle(r, 'saved');
			} else {
				const draft = drafts?.get(r.id);
				const outcome = project?.manifest.items.some((item) => item.id === r.targetId)
					? 'saved'
					: draft && draftOutcome(draft);
				if (outcome) receipts.settle(r, outcome, jobError(draft?.error) ?? undefined);
			}
		})
	);
	return loaded;
}

export async function replayStart(kind: Receipt['kind'], args: Record<string, unknown>) {
	if (args.dryRun || typeof args.requestId !== 'string' || !args.requestId) return;
	const [found] = await loadReceipts([], { kind, requestId: args.requestId });
	if (!found) return;
	const fingerprint = await fingerprintOf(
		kind === 'character' ? args : { ...args, characterId: args.characterId || found.characterId }
	);
	return { data: startView(receipts.repeat(kind, args.requestId, fingerprint)!, budget(), true) };
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
	'Optional id you choose for this paid request. While its receipt is retained, repeating the id returns the first start instead of paying again.',
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
