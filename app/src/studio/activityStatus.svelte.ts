import { fromStore } from 'svelte/store';
import { queue, type JobRec } from '../lib/pixellab/queue.ts';
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

export type WorkDot = 'busy' | 'stopped' | undefined;
type WorkTab = 'wardrobe' | 'moves' | 'states';

/** Which customization tabs are on screen and usable, so their own dots show the open character's work there (set by
 *  Experience.svelte). Off screen (no panel, a sheet over it, another screen) or disabled (Moves and States outside
 *  Preview), their work falls to More. */
export const workTabs = $state({ wardrobe: false, moves: false, states: false });

/** Moves or States: the tab a job on `clip` belongs to (a move still being made belongs to Moves). */
function jobTab(clip: string): 'moves' | 'states' {
	const m = store.project?.manifest;
	const entry = m && playbackClips(m.rig.animations).find((item) => item.clip.id === clip);
	return entry?.kind === 'state' ? 'states' : 'moves';
}
/** A move or item job of the open character whose tab is on screen to show it. */
const tabbedJob = (projectId: string, clip: string) =>
	projectId === doc.id && workTabs[jobTab(clip)];
const live = (job: JobRec) =>
	job.state === 'queued' || job.state === 'submitting' || job.state === 'running';

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
	/** The dot on More: work no tab dot shows (other characters, character creation and setup, or anything whose tab is
	 *  off screen or disabled), red when some of it failed. */
	get elsewhere(): WorkDot {
		const ownDrafts = workTabs.wardrobe ? gens.filter((g) => g.draft.rigId === doc.id) : [];
		const tabbedMove = !!moving.spec && tabbedJob(moving.projectId, moving.spec.id);
		const tabbedState = (token: string) =>
			workTabs.states && Object.hasOwn(store.stateAttempts, token);
		const shownStops =
			(tabbedMove && stoppedMove() ? 1 : 0) + ownDrafts.filter((g) => g.phase === 'failed').length;
		if (
			stoppedWork() - shownStops > 0 ||
			Object.entries(stateRuns).some(([token, run]) => !!run.error && !tabbedState(token))
		)
			return 'stopped';
		// A request belongs to a tab when it is one of that tab's drafts' calls, its move job's or its States'.
		const draftCalls = new Set(ownDrafts.flatMap((g) => g.draft.calls.map((call) => call.recId)));
		const moveScope = tabbedMove ? moving.spec?.activityScope : undefined;
		const shownRequest = (job: JobRec) =>
			draftCalls.has(job.id) ||
			(!!moveScope && job.activityScope === moveScope) ||
			(!!job.activityScope?.startsWith('state:') && tabbedState(job.activityScope.split(':')[1]));
		const busy =
			jobs.current.jobs.some((job) => live(job) && !shownRequest(job)) ||
			gens.some((g) => g.phase !== 'failed' && !ownDrafts.includes(g)) ||
			creates.some((run) => run.running && !run.error) ||
			(!!settingUp.spec && !settingUp.done && !settingUp.error) ||
			// A move or item job is busy between PixelLab requests and while it waits its turn.
			(!!moving.spec && !moving.done && !moving.error && !tabbedMove) ||
			moving.queued.some((entry) => !tabbedJob(entry.projectId, entry.spec.id)) ||
			Object.entries(stateRuns).some(([token, run]) => !run.error && !tabbedState(token));
		return busy ? 'busy' : undefined;
	}
};

/** The dot on a customization tab for the open character's work there: red when some of it failed, else gold while it
 *  runs, waits its turn or waits for a review. Wardrobe has its item drafts; Moves and States have their move, item
 *  and State jobs. Colors and Outfits run no generations. */
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
	if (!store.project) return;
	if (
		moving.spec &&
		!moving.done &&
		moving.projectId === doc.id &&
		jobTab(moving.spec.id) === tab
	) {
		if (moving.error) return 'stopped';
		busy = true;
	}
	if (moving.queued.some((entry) => entry.projectId === doc.id && jobTab(entry.spec.id) === tab))
		busy = true;
	// New moves whose paid results wait for a review before they are saved.
	if (tab === 'moves' && Object.keys(store.moveReviews).length) busy = true;
	if (tab === 'states')
		for (const [token, attempt] of Object.entries(store.stateAttempts)) {
			// A run that failed is red even when some of its views came back to review.
			if (stateRuns[token]?.error) return 'stopped';
			if (stateProgress(attempt, jobs.current.jobs).status === 'attention') return 'stopped';
			busy = true; // generating, or ready for its review
		}
	return busy ? 'busy' : undefined;
}
