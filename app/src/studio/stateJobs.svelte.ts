import { t } from 'svelte-whisper';
import { errorMessage, message, type Message } from '../lib/message.ts';
import type { JobRec } from '../lib/pixellab/queue.ts';
import * as db from '../lib/store/db.ts';
import type { StoredProject } from '../lib/store/project.ts';
import { playAudioCue } from './audio.svelte.ts';
import { isGenerationCancellation } from './generationStatus.ts';
import { moveLabel } from './model.ts';
import { doc, openProject, store, toast, ui } from './state.svelte.ts';
import {
	continueState,
	startState,
	type PreparedState,
	type StateAttempt,
	type StateContinuationQuote
} from './stateGeneration.ts';
import { stateProgressOf, type StateProgress } from './stateRecovery.ts';

/** States this tab is sending, by token. With `error`, its run failed here; the review sheet says why. */
export const stateRuns = $state<Record<string, { error?: Message | string }>>({});

export function openStateReview(token: string) {
	ui.stateReview = token;
	ui.sheet = 'stateReview';
}

export async function refreshStateAttempts(projectId: string) {
	const record = await db.get<StoredProject>('projects', projectId);
	if (doc.id === projectId) store.stateAttempts = record?.stateGenerations ?? {};
}

export const stateProgress = (attempt: StateAttempt, ledger: readonly JobRec[]) =>
	stateProgressOf(attempt, ledger, stateRuns[attempt.token]);

/** A State's line in the States list and its review sheet. */
export function stateStatusText({ status, done, total }: StateProgress) {
	if (status === 'ready') return t('stateGeneration.readyRow');
	if (status === 'attention') return t('stateGeneration.attentionRow');
	return total > 1
		? t('stateGeneration.generatingProgress', { done, total })
		: t('stateGeneration.generating');
}

const reviewing = (token: string) => ui.sheet === 'stateReview' && ui.stateReview === token;

/** Announces the State when it settles, unless its review is already open. */
function track(projectId: string, token: string, id: string, finished: Promise<unknown>) {
	stateRuns[token] = {};
	const name = moveLabel(id);
	const open = async () => {
		if (doc.id !== projectId) await openProject(projectId);
		if (doc.id !== projectId) return;
		await refreshStateAttempts(projectId);
		if (Object.hasOwn(store.stateAttempts, token)) openStateReview(token);
	};
	finished.then(
		() => {
			delete stateRuns[token];
			playAudioCue('success');
			if (!reviewing(token))
				toast(message('stateGeneration.readyToReview', { name }), { action: open });
		},
		(cause) => {
			stateRuns[token] = { error: errorMessage(cause) };
			if (!isGenerationCancellation(cause)) playAudioCue('failure');
			if (!reviewing(token))
				toast(message('stateGeneration.failedOpen', { name }), {
					tone: 'danger',
					report: false,
					duration: 8000,
					action: open
				});
		}
	);
}

/** Like a Move, a State generates in the background: it is listed under States and announced when it can be reviewed.
 *  Rejects only when nothing was sent, so the form can show why. */
export async function generateState(prepared: PreparedState, riding: boolean) {
	const { token, finished } = await startState(prepared, riding);
	track(prepared.projectId, token, prepared.id, finished);
	await refreshStateAttempts(prepared.projectId);
}

/** Sends the views an interrupted State never sent, in the background like the first run. */
export function continueStateRun(approved: StateContinuationQuote, id: string) {
	track(approved.projectId, approved.token, id, continueState(approved));
}
