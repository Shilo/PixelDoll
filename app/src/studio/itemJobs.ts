import type { JobRec } from '../lib/pixellab/queue.ts';
import type { MoveSpec, Progress } from './create.ts';

/** How much of one activity scope's requests in flight has finished, as a count of requests (each from 0 to 1). */
export function inFlight(scope: string | undefined, jobs: readonly JobRec[]): number {
	if (!scope) return 0;
	return jobs
		.filter(
			(job) =>
				job.activityScope === scope && (job.state === 'running' || job.state === 'submitting')
		)
		.reduce((sum, job) => {
			const parts = job.jobs.map((call) => (call.done ? 1 : Math.min(1, call.progress ?? 0)));
			return sum + (parts.length ? parts.reduce((a, b) => a + b, 0) / parts.length : 0);
		}, 0);
}

/** One item being drawn on a saved move or State by an items-only job, or waiting for its turn. */
export interface ItemJob {
	clip: string;
	item: string;
	status: 'drawing' | 'queued';
	/** 0 to 100, from the item's finished views and its request in flight. */
	percent: number;
}

/** The running items-only job and the queue behind it, for one character. A failed job or one waiting for its frame
 *  review is left out: it keeps its own row, where it can be opened. */
export function itemJobs(
	active: { spec: MoveSpec; progress: Progress | null; attention: boolean } | null,
	queued: readonly MoveSpec[],
	jobs: readonly JobRec[]
): ItemJob[] {
	const list: ItemJob[] = [];
	if (active?.spec.itemsOnly && !active.attention) {
		const { spec, progress } = active,
			counts = progress?.step === 'items' ? progress.items : undefined,
			finished = (id: string) => {
				const count = counts?.[id];
				return !!count && count.done >= count.total;
			},
			// The pipeline names the item it works on; its last view is still checked and saved after its count is full.
			drawing = progress?.item ?? spec.items.find((id) => !finished(id));
		for (const item of spec.items) {
			if (item !== drawing && finished(item)) continue;
			const count = counts?.[item];
			// A view can take several requests: what is in flight counts as most of one view at most, so the share
			// reaches 100% only when the job finishes.
			const done =
				(count?.done ?? 0) +
				(item === drawing ? Math.min(0.9, inFlight(spec.activityScope, jobs)) : 0);
			list.push({
				clip: spec.id,
				item,
				status: item === drawing ? 'drawing' : 'queued',
				percent: count?.total ? Math.min(99, Math.round((done / count.total) * 100)) : 0
			});
		}
	}
	for (const spec of queued)
		if (spec.itemsOnly)
			for (const item of spec.items)
				list.push({ clip: spec.id, item, status: 'queued', percent: 0 });
	return list;
}
