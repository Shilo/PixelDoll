import { errorMessage, message, type Message } from '../lib/message.ts';
import * as db from '../lib/store/db.ts';
import type { StoredProject } from '../lib/store/project.ts';
import { moveLabel } from './model.ts';
import { doc, openProject, store, toast, ui } from './state.svelte.ts';
import { startState, type PreparedState } from './stateGeneration.ts';

/** States this tab is sending, by token. With `error`, its run failed here; the review sheet offers the way out. */
export const stateRuns = $state<Record<string, { error?: Message | string }>>({});

export function openStateReview(token: string) {
	ui.stateReview = token;
	ui.sheet = 'stateReview';
}

export async function refreshStateAttempts(projectId: string) {
	const record = await db.get<StoredProject>('projects', projectId);
	if (doc.id === projectId) store.stateAttempts = record?.stateGenerations ?? {};
}

const reviewing = (token: string) => ui.sheet === 'stateReview' && ui.stateReview === token;

/** Like a Move, a State generates in the background: it is listed under States and announced when it can be reviewed.
 *  Rejects only when nothing was sent, so the form can show why. */
export async function generateState(prepared: PreparedState, riding: boolean) {
	const { projectId } = prepared;
	const { token, finished } = await startState(prepared, riding);
	stateRuns[token] = {};
	await refreshStateAttempts(projectId);
	const name = moveLabel(prepared.id);
	const open = async () => {
		if (doc.id !== projectId) await openProject(projectId);
		if (doc.id === projectId) openStateReview(token);
	};
	finished.then(
		() => {
			delete stateRuns[token];
			if (!reviewing(token))
				toast(message('stateGeneration.readyToReview', { name }), { action: open });
		},
		(cause) => {
			stateRuns[token] = { error: errorMessage(cause) };
			if (!reviewing(token))
				toast(message('stateGeneration.failedOpen', { name }), {
					tone: 'danger',
					duration: 8000,
					action: open
				});
		}
	);
}
