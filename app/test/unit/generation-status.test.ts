import { expect, test } from 'vitest';
import {
	generationLogMessage,
	generationProblemKind,
	generationStatus,
	rerollLeads
} from '../../src/studio/generationStatus.ts';
import { paidRetryLeads } from '../../src/studio/problemSummary.ts';
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

test('a stopped item call is summarized by its request record, so a credit refusal never reads as a stopped paid request', () => {
	const failed = {
		...generation(),
		phase: 'failed',
		error: { key: 'x', call: 1 }
	} as unknown as Gen;
	const logged = message('generation.outcome.callError');
	const refused = record('canceled', { errorKind: 'credits' });
	expect(generationProblemKind(failed, [refused], logged)).toBe('credits');
	expect(generationProblemKind(failed, [record('canceled', { errorKind: 'auth' })], logged)).toBe(
		'key'
	);
	expect(generationProblemKind(failed, [record('lost')], logged)).toBe('uncertain');
	expect(
		generationProblemKind(
			failed,
			[record('failed', { jobs: [{ policy: true }] as JobRec['jobs'] })],
			logged
		)
	).toBe('declined');
	// Without a stopped call, the error itself decides.
	expect(generationProblemKind(generation(), [], message('generation.outcome.noFrames'))).toBe(
		'empty'
	);
});

test('a paid try again leads only where it can help', () => {
	for (const kind of ['stopped', 'busy', 'empty', 'offline'] as const)
		expect(paidRetryLeads(kind)).toBe(true);
	// Flipped on purpose (round 3): a credit or token refusal is fixed on the account first, so the paid retry follows it.
	for (const kind of ['unexpected', 'method', 'declined', 'uncertain', 'credits', 'key'] as const)
		expect(paidRetryLeads(kind)).toBe(false);
});

test('re-rolling stopped calls never leads when one may have charged, was declined or was refused', () => {
	const two = ['0', '1'];
	expect(rerollLeads(two, [0, 1], [record('failed'), record('failed', { id: '1' })])).toBe(true);
	expect(rerollLeads(two, [0, 1], [record('failed'), record('lost', { id: '1' })])).toBe(false);
	expect(
		rerollLeads(two, [0], [record('failed', { jobs: [{ policy: true }] as JobRec['jobs'] })])
	).toBe(false);
	expect(rerollLeads(two, [0], [record('canceled', { errorKind: 'credits' })])).toBe(false);
});
