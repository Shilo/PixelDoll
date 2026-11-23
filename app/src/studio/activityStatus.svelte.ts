import { fromStore } from 'svelte/store';
import { queue } from '../lib/pixellab/queue.ts';
import { playbackClips } from '../lib/runtime/timeline.js';
import { creates, doc, gens, moving, settingUp, stoppedWork, store } from './state.svelte.ts';
import { stateProgress, stateRuns } from './stateJobs.svelte.ts';

const jobs = fromStore(queue);

/** A move or item job that is running or waiting its turn (it is busy between PixelLab requests too). */
const moveWorking = () =>
	(!!moving.spec && !moving.done && !moving.error && !moving.repairReview) ||
	moving.queued.length > 0;

/** What the bar's Activity control and the dot on More show: running work, or stopped work that needs attention.
 *  Read it in a reactive context. */
export const activityStatus = {
	/** Requests running or waiting at PixelLab. */
	get active() {
		return jobs.current.counts.running + jobs.current.counts.pending;
	},
	get busy() {
		return (
			this.active > 0 ||
			gens.some((g) => g.phase === 'running') ||
			creates.some((run) => run.running && !run.error) ||
			(!!settingUp.spec && !settingUp.done && !settingUp.error) ||
			moveWorking() ||
			Object.values(stateRuns).some((run) => !run.error)
		);
	},
	get stopped() {
		return stoppedWork();
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
