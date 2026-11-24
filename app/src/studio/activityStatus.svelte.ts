import { fromStore } from 'svelte/store';
import { queue } from '../lib/pixellab/queue.ts';
import { playbackClips } from '../lib/runtime/timeline.js';
import {
	creates,
	doc,
	gens,
	moving,
	settingUp,
	stoppedMove,
	stoppedWork,
	store
} from './state.svelte.ts';
import { stateProgress, stateRuns } from './stateJobs.svelte.ts';

const jobs = fromStore(queue);

/** Whether the Wardrobe, Moves and States tabs are on screen, so their own dots show the open character's work. */
export const workTabs = $state({ shown: false });

export type WorkDot = 'busy' | 'stopped' | undefined;
type WorkTab = 'wardrobe' | 'moves' | 'states';

/** What the bar's Activity control and Activity in More count: running work, or stopped work that needs attention.
 *  Read it in a reactive context. */
export const activityStatus = {
	/** Requests running or waiting at PixelLab. */
	get active() {
		return jobs.current.counts.running + jobs.current.counts.pending;
	},
	get stopped() {
		return stoppedWork();
	},
	/** The dot on More: work no tab dot shows (other characters, character creation and setup, or anything while the
	 *  tabs are off screen), red when some of it stopped. */
	get elsewhere(): WorkDot {
		const tabbed = (projectId: string) => workTabs.shown && projectId === doc.id;
		const tabbedStops =
			(tabbed(moving.projectId) && stoppedMove() ? 1 : 0) +
			gens.filter((g) => g.phase === 'failed' && tabbed(g.draft.rigId)).length;
		if (stoppedWork() - tabbedStops > 0) return 'stopped';
		const tabDot =
			workTabs.shown &&
			(['wardrobe', 'moves', 'states'] as const).some((tab) => !!tabActivity(tab));
		const busy =
			// Requests without a tab dot to explain them (the tabs' own jobs send requests too).
			(this.active > 0 && !tabDot) ||
			gens.some((g) => g.phase !== 'failed' && !tabbed(g.draft.rigId)) ||
			creates.some((run) => run.running && !run.error) ||
			(!!settingUp.spec && !settingUp.done && !settingUp.error) ||
			// A move or item job is busy between PixelLab requests and while it waits its turn.
			(!!moving.spec && !moving.done && !moving.error && !tabbed(moving.projectId)) ||
			moving.queued.some((entry) => !tabbed(entry.projectId)) ||
			Object.entries(stateRuns).some(
				([token, run]) =>
					!run.error && !(tabbed(doc.id) && Object.hasOwn(store.stateAttempts, token))
			);
		return busy ? 'busy' : undefined;
	}
};

/** The dot on a customization tab for the open character's work there: red when some of it failed, else gold while it
 *  runs, waits its turn or waits for a review. Wardrobe has its item drafts; Moves and States have their move, item
 *  and State jobs (a job belongs to its saved clip's tab; a move still being made belongs to Moves). Colors and
 *  Outfits run no generations. */
export function tabActivity(tab: WorkTab): WorkDot {
	let busy = false;
	if (tab === 'wardrobe') {
		for (const g of gens) {
			if (g.draft.rigId !== doc.id) continue;
			if (g.phase === 'failed') return 'stopped';
			busy = true;
		}
		return busy ? 'busy' : undefined;
	}
	const m = store.project?.manifest;
	if (!m) return;
	const kind = tab === 'moves' ? 'move' : 'state';
	const clips = playbackClips(m.rig.animations);
	const here = (id: string) =>
		(clips.find((entry) => entry.clip.id === id)?.kind ?? 'move') === kind;
	if (moving.spec && !moving.done && moving.projectId === doc.id && here(moving.spec.id)) {
		if (moving.error) return 'stopped';
		busy = true;
	}
	if (moving.queued.some((entry) => entry.projectId === doc.id && here(entry.spec.id))) busy = true;
	// New moves whose paid results wait for a review before they are saved.
	if (tab === 'moves' && Object.keys(store.moveReviews).length) busy = true;
	if (tab === 'states')
		for (const attempt of Object.values(store.stateAttempts)) {
			const { status } = stateProgress(attempt, jobs.current.jobs);
			if (status === 'attention') return 'stopped';
			busy = true; // generating, or ready for its review
		}
	return busy ? 'busy' : undefined;
}
