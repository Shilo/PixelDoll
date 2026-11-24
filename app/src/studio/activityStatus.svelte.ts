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

/** Whether the Moves and States tabs are on screen, so their own dots show the open character's work there. */
export const workTabs = $state({ shown: false });

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
	/** The dot on More: work the Moves and States tabs do not already show, red when some of it stopped. */
	get elsewhere(): 'busy' | 'stopped' | undefined {
		// On screen, the tabs show the open character's move, item and State jobs; More shows everything else.
		const tabbed = (projectId: string) => workTabs.shown && projectId === doc.id;
		if (stoppedWork() - (tabbed(moving.projectId) && stoppedMove() ? 1 : 0) > 0) return 'stopped';
		const tabDot = workTabs.shown && (!!tabActivity('move') || !!tabActivity('state'));
		const busy =
			// Requests without a tab dot to explain them (the tabs' own jobs send requests too).
			(this.active > 0 && !tabDot) ||
			gens.some((g) => g.phase === 'running') ||
			creates.some((run) => run.running && !run.error) ||
			(!!settingUp.spec && !settingUp.done && !settingUp.error) ||
			// A move or item job is busy between PixelLab requests and while it waits its turn.
			(!!moving.spec &&
				!moving.done &&
				!moving.error &&
				!moving.repairReview &&
				!tabbed(moving.projectId)) ||
			moving.queued.some((entry) => !tabbed(entry.projectId)) ||
			Object.entries(stateRuns).some(
				([token, run]) =>
					!run.error && !(tabbed(doc.id) && Object.hasOwn(store.stateAttempts, token))
			);
		return busy ? 'busy' : undefined;
	}
};
/** The dot on the Moves or States tab for the open character's work there: a failed job (red) wins over work that
 *  runs or waits its turn. A job belongs to its saved clip's tab; a move still being made belongs to Moves. */
export function tabActivity(kind: 'move' | 'state'): 'busy' | 'stopped' | undefined {
	const m = store.project?.manifest;
	if (!m) return;
	const clips = playbackClips(m.rig.animations);
	const here = (id: string) =>
		(clips.find((entry) => entry.clip.id === id)?.kind ?? 'move') === kind;
	let busy = false;
	if (moving.spec && !moving.done && moving.projectId === doc.id && here(moving.spec.id)) {
		if (moving.error) return 'stopped';
		busy = true;
	}
	if (moving.queued.some((entry) => entry.projectId === doc.id && here(entry.spec.id))) busy = true;
	if (kind === 'state')
		for (const attempt of Object.values(store.stateAttempts)) {
			const { status } = stateProgress(attempt, jobs.current.jobs);
			if (status === 'attention') return 'stopped';
			if (status === 'generating') busy = true;
		}
	return busy ? 'busy' : undefined;
}
