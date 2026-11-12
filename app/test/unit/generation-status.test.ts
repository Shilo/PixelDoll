import { expect, test } from 'vitest';
import { generationStatus } from '../../src/studio/generationStatus.ts';
import type { Gen } from '../../src/studio/state.svelte.ts';
import type { JobRec } from '../../src/lib/pixellab/queue.ts';

const generation = (calls = 1) =>
	({
		phase: 'running',
		status: 'Designing',
		draft: { calls: Array.from({ length: calls }, (_, index) => ({ recId: String(index) })) }
	}) as Gen;
const record = (state: JobRec['state'], extra: Partial<JobRec> = {}) =>
	({
		id: '0',
		state,
		submittedAt: 60_000,
		jobs: [],
		...extra
	}) as JobRec;
const status = (jobs: JobRec[], now = 60_000, g = generation()) =>
	generationStatus(g, jobs, now, true, null);

test('countdown decreases from submission, not draft creation or page mounting', () => {
	expect(status([record('running')]).text).toBe('~7 min left');
	expect(status([record('running')], 120_000).text).toBe('~6 min left');
	expect(status([record('running')], 480_000).text).toBe('Taking longer');
	expect(status([record('running')], 1).text).toBe('~7 min left');
});

test('queue, credentials, pauses and unknown outcomes replace speculative countdowns', () => {
	expect(status([]).text).toBe('Designing');
	expect(status([record('queued', { submittedAt: undefined })]).text).toBe('Queued');
	expect(status([record('running', { submittedAt: NaN })]).text).toBe('Designing');
	expect(generationStatus(generation(), [], 0, false, null)).toMatchObject({
		text: 'Connect to start',
		attention: true
	});
	expect(generationStatus(generation(), [], 0, true, 'offline')).toMatchObject({
		text: 'Paused',
		attention: true
	});
	expect(status([record('lost', { error: 'Unknown response' })])).toMatchObject({
		text: 'Needs attention',
		detail: 'Unknown response',
		attention: true
	});
});

test('local checks and terminal states never promise zero seconds', () => {
	expect(status([record('done')]).text).toBe('Checking frames');
	expect(status([], 0, { ...generation(), phase: 'review' }).text).toBe('Review');
	expect(status([], 0, { ...generation(), phase: 'failed', error: 'No frames' })).toMatchObject({
		text: 'Failed',
		detail: 'No frames'
	});
	expect(status([], 0, { ...generation(), phase: 'failed', canceled: true }).text).toBe('Canceled');
});

test('a finished design does not hide remaining queued or unsubmitted batches', () => {
	expect(status([record('done')], 60_000, generation(2)).text).toBe('~7 min left');
	expect(
		status(
			[record('done'), record('queued', { id: '1', submittedAt: undefined })],
			60_000,
			generation(2)
		).text
	).toBe('Queued');
});
