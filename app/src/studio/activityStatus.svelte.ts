import { fromStore } from 'svelte/store';
import { queue } from '../lib/pixellab/queue.ts';
import { creates, gens, settingUp, stoppedWork } from './state.svelte.ts';

const jobs = fromStore(queue);

/** What the bar's Activity control (and, on phones, the dot on More) shows: running work, or stopped work that needs
 *  attention. Read it in a reactive context. */
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
			(!!settingUp.spec && !settingUp.done && !settingUp.error)
		);
	},
	get stopped() {
		return stoppedWork();
	}
};
