import { expect, test } from 'vitest';
import { generationLogMessage, generationStatus } from '../../src/studio/generationStatus.ts';
import type { Gen } from '../../src/studio/state.svelte.ts';
import type { JobRec } from '../../src/lib/pixellab/queue.ts';
import { loggedMessage, message, type LoggedMessage, type Message } from '../../src/lib/message.ts';
import { automaticRepairError } from '../../src/lib/items/items.ts';

type Vars = Parameters<typeof message>[1];
const m = (key: string, vars?: Vars) =>
	message(`generation.status.${key}` as Parameters<typeof message>[0], vars);

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
const formatters = {
	render: (value: Message | string) => (typeof value === 'string' ? value : value.key),
	formatNumber: (value: number) => `[${value}]`
};
const status = (jobs: JobRec[], now = 60_000, g = generation()) =>
	generationStatus(g, jobs, now, true, null, formatters);

test('countdown decreases from submission, not draft creation or page mounting', () => {
	expect(status([record('running')]).text).toEqual(m('minutesLeft', { minutes: 7 }));
	expect(status([record('running')], 120_000).text).toEqual(m('minutesLeft', { minutes: 6 }));
	expect(status([record('running')], 480_000).text).toEqual(m('takingLonger'));
	expect(status([record('running')], 1).text).toEqual(m('minutesLeft', { minutes: 7 }));
});

test('queue, credentials, pauses and unknown outcomes replace speculative countdowns', () => {
	expect(status([]).text).toEqual(m('designing'));
	expect(status([record('queued', { submittedAt: undefined })]).text).toEqual(m('queued'));
	expect(
		status([record('running', { submittedAt: NaN })], 0, {
			...generation(),
			status: 'Adding the other moves'
		}).text
	).toEqual(m('addingMoves'));
	expect(generationStatus(generation(), [], 0, false, null, formatters)).toMatchObject({
		text: m('connect'),
		attention: true
	});
	expect(generationStatus(generation(), [], 0, true, 'offline', formatters)).toMatchObject({
		text: m('paused'),
		attention: true
	});
	expect(status([record('lost', { error: 'Unknown response' })])).toMatchObject({
		text: m('needsAttention'),
		detail: 'Unknown response',
		attention: true
	});
});

test('local checks and terminal states never promise zero seconds', () => {
	expect(status([record('done')]).text).toEqual(m('checking'));
	expect(status([], 0, { ...generation(), phase: 'review' }).text).toEqual(m('review'));
	expect(status([], 0, { ...generation(), phase: 'failed', error: 'No frames' })).toMatchObject({
		text: m('failed'),
		detail: 'No frames'
	});
	expect(
		status([record('lost', { error: 'Unknown response' })], 0, {
			...generation(),
			phase: 'failed',
			// the log names the stopped call by its index, never by matching its English line
			error: {
				key: 'generation.outcome.callStopped',
				text: 'call 1 lost: Unknown response',
				call: 1
			} as LoggedMessage
		}).detail
	).toEqual(
		message('generation.outcome.callError', {
			index: '[1]',
			state: 'activity.state.lost',
			error: 'Unknown response'
		})
	);
	expect(status([], 0, { ...generation(), phase: 'failed', canceled: true }).text).toEqual(
		m('canceled')
	);
});

// Rewritten on purpose (2026-11-23): logs now keep a translated error as its Message, so the English line is no longer parsed.
test('logged automatic repair blocks keep both the failure and the plan reason translated', () => {
	const logged = loggedMessage(
		automaticRepairError('Needs PixelLab Tier 1 or higher. No request sent.')
	);
	expect(generationLogMessage(generation(), [], logged, formatters)).toEqual(
		message('itemRoute.errors.automaticRepairUnavailable', {
			reason: message('activity.planWait.tier', { tier: 1 })
		})
	);
});

test('a finished design does not hide remaining queued or unsubmitted batches', () => {
	expect(status([record('done')], 60_000, generation(2)).text).toEqual(
		m('minutesLeft', { minutes: 7 })
	);
	expect(
		status(
			[record('done'), record('queued', { id: '1', submittedAt: undefined })],
			60_000,
			generation(2)
		).text
	).toEqual(m('queued'));
});
