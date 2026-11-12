import type { JobRec } from '../lib/pixellab/queue.ts';
import { itemGenerationMinutes } from '../lib/items/items.ts';
import type { Gen } from './state.svelte.ts';

export function generationStatus(
	g: Gen,
	jobs: JobRec[],
	now: number,
	connected: boolean,
	paused: string | null
) {
	if (g.cancelSaveFailed)
		return {
			text: 'Save cancellation',
			detail:
				'Cancellation could not be saved. Keep this tab open and choose Save cancellation before reloading.',
			attention: true
		};
	if (g.canceled)
		return { text: 'Canceled', detail: g.error ?? 'Generation canceled.', attention: true };
	if (g.phase !== 'running')
		return {
			text: g.phase === 'review' ? 'Review' : 'Failed',
			detail: g.error || 'Review the frames before keeping this item.',
			attention: true
		};
	const records = g.draft.calls.flatMap((call) => jobs.filter((job) => job.id === call.recId));
	const stopped = records.find((job) => ['failed', 'lost', 'canceled'].includes(job.state));
	if (stopped)
		return {
			text: 'Needs attention',
			detail: stopped.error || 'A request stopped. Review Activity before trying again.',
			attention: true
		};
	if (!connected)
		return { text: 'Connect to start', detail: 'Waiting for your PixelLab key.', attention: true };
	if (paused)
		return {
			text: 'Paused',
			detail:
				paused === 'offline'
					? 'Paused while you are offline. Submitted requests may still finish and charge.'
					: 'PixelLab paused the queue (' + paused + '). Review Activity.',
			attention: true
		};
	if (
		records.length === g.draft.calls.length &&
		records.length &&
		records.every((job) => job.state === 'done')
	)
		return {
			text: 'Checking frames',
			detail: 'Checking and saving the generated frames.',
			attention: false
		};
	const submitted = records.flatMap((job) =>
		Number.isFinite(job.submittedAt) ? [job.submittedAt!] : []
	);
	if (
		records.some((job) => job.state === 'queued') &&
		!records.some((job) => job.state === 'running' || job.state === 'submitting')
	)
		return {
			text: 'Queued',
			detail: 'Waiting for PixelLab capacity. Keep this tab open; you can keep dressing up.',
			attention: false
		};
	if (!submitted.length)
		return {
			text: g.status || 'Preparing',
			detail:
				'Preparing your item. A time estimate will appear when PixelLab starts. Keep this tab open.',
			attention: false
		};
	const remaining =
		itemGenerationMinutes(g.draft.calls.length) * 60_000 -
		Math.max(0, now - Math.min(...submitted));
	return {
		text: remaining > 0 ? '~' + Math.ceil(remaining / 60_000) + ' min left' : 'Taking longer',
		detail:
			remaining > 0
				? 'Approximate time, excluding extra queue delays. Keep this tab open; you can keep dressing up.'
				: 'Taking longer than estimated. Keep this tab open and check Activity for request status.',
		attention: false
	};
}
