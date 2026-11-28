import { beforeEach, describe, expect, test } from 'vitest';
import { LoadError } from '../../src/lib/lazy.ts';
import { message } from '../../src/lib/message.ts';
import { englishMessage } from '../../src/lib/report/english.ts';
import {
	buildReport,
	MAX_URL_LENGTH,
	reportText,
	reportUrl,
	type Problem,
	type ReportEnvironment
} from '../../src/lib/report/report.ts';
import {
	clearTrail,
	track,
	trailSnapshot,
	TRAIL_SIZE,
	watchRequests,
	type TrailEntry
} from '../../src/lib/report/trail.ts';

const env: ReportEnvironment = {
	version: '1.2.34',
	commit: 'abc1234',
	channel: 'stable',
	userAgent: 'Mozilla/5.0 (Windows NT 10.0) Chrome/131.0.0.0 Safari/537.36',
	locale: 'en',
	coarsePointer: false,
	screenWidth: 1920,
	screenHeight: 1080,
	viewportWidth: 1440,
	viewportHeight: 900
};
const ORIGIN = 'https://pixeldoll.app';
const context = { env, english: englishMessage, base: ORIGIN, now: 100_000 };
const NAME = 'Alice Smith';

const entry = (at: number, event: TrailEntry['event'], times = 1): TrailEntry => ({
	at,
	first: at,
	event,
	times
});
const all = (problem: Problem) => {
	const report = buildReport(problem, context);
	return `${reportText(report)}\n${decodeURIComponent(reportUrl(report))}`;
};

describe('trail ring', () => {
	beforeEach(clearTrail);

	test('keeps the newest entries, newest first, within its bound', () => {
		for (let i = 0; i < TRAIL_SIZE + 5; i++) track({ kind: 'open', area: `${i}` }, i);
		const trail = trailSnapshot();
		expect(trail).toHaveLength(TRAIL_SIZE);
		expect(trail[0].event).toEqual({ kind: 'open', area: `${TRAIL_SIZE + 4}` });
		expect(trail.at(-1)?.event).toEqual({ kind: 'open', area: '5' });
	});

	test('counts a repeated event once, and a snapshot ends where asked', () => {
		track({ kind: 'press', area: 'Studio', control: 'zoom.in' }, 1);
		track({ kind: 'press', area: 'Studio', control: 'zoom.in' }, 2);
		track({ kind: 'open', area: 'Export' }, 3);
		expect(trailSnapshot()).toMatchObject([
			{ at: 3, times: 1 },
			{ at: 2, times: 2 }
		]);
		expect(trailSnapshot(2)).toHaveLength(1);
	});

	test('a repeat that went on after the cut is kept once, from its first time', () => {
		track({ kind: 'press', area: 'Studio', control: 'playback.play' }, 95);
		track({ kind: 'press', area: 'Studio', control: 'playback.play' }, 96);
		track({ kind: 'press', area: 'Studio', control: 'playback.play' }, 101);
		expect(trailSnapshot(100)).toMatchObject([{ at: 95, times: 1 }]);
		expect(trailSnapshot()).toMatchObject([{ at: 101, first: 95, times: 3 }]);
	});

	test('unnamed presses in one area count together, leaving room for named actions', () => {
		track({ kind: 'press', area: 'Studio' }, 1);
		track({ kind: 'press', area: 'Studio' }, 2);
		track({ kind: 'press', area: 'Export' }, 3);
		expect(trailSnapshot()).toMatchObject([{ times: 1 }, { times: 2 }]);
	});

	test('a snapshot is a copy', () => {
		track({ kind: 'open', area: 'Export' }, 1);
		const [first] = trailSnapshot();
		first.times = 99;
		expect(trailSnapshot()[0].times).toBe(1);
	});
});

describe('request records in the trail', () => {
	beforeEach(clearTrail);
	const PAGE = 1_000_000;
	const request = (id: string, state: string, createdAt: number) => ({
		id,
		state,
		method: 'POST',
		endpoint: '/inpaint-v3',
		createdAt
	});

	test('only the start and end of a request made here, with the failure time it settled', () => {
		let clock = 10;
		const requests = watchRequests(PAGE, () => clock);
		for (const state of ['queued', 'submitting', 'running', 'failed']) {
			requests.update([request('a', state, PAGE + 1)], true);
			clock += 5;
		}
		expect(trailSnapshot().map((entry) => (entry.event as { state: string }).state)).toEqual([
			'failed',
			'queued'
		]);
		// The settle time and the "failed" line share one clock reading.
		expect(requests.settledAt('a')).toBe(25);
		expect(trailSnapshot(25)[0].at).toBe(25);
	});

	test('a request settled before this page, or run by another tab, has no failure time here', () => {
		const requests = watchRequests(PAGE, () => 1);
		requests.update(
			[request('old', 'failed', PAGE - 1), request('other', 'queued', PAGE + 1)],
			false
		);
		requests.update(
			[request('old', 'failed', PAGE - 1), request('other', 'failed', PAGE + 1)],
			false
		);
		expect(requests.settledAt('old')).toBeUndefined();
		expect(requests.settledAt('other')).toBeUndefined();
		expect(trailSnapshot()).toEqual([]);
	});

	test('an earlier request that settles here counts from then, and forgotten records are dropped', () => {
		const requests = watchRequests(PAGE, () => 7);
		requests.update([request('old', 'running', PAGE - 1)], true);
		expect(trailSnapshot()).toEqual([]);
		requests.update([request('old', 'lost', PAGE - 1)], true);
		expect(requests.settledAt('old')).toBe(7);
		requests.update([], true);
		expect(requests.settledAt('old')).toBeUndefined();
	});
});

describe('trail in a report', () => {
	test('lists app actions newest first, timed back from the problem', () => {
		const text = all({
			message: message('download.failedRetry', { label: NAME }),
			failedAt: 50_000,
			trail: [
				entry(51_000, { kind: 'open', area: 'Settings' }),
				entry(50_000, { kind: 'notice', key: 'download.failedRetry', tone: 'error' }),
				entry(48_000, { kind: 'press', area: 'Studio', control: 'characterMenu.download' }),
				entry(47_000, { kind: 'press', area: 'Studio' }, 3),
				entry(46_000, {
					kind: 'job',
					method: 'POST',
					endpoint: '/characters/abc123def/animations',
					state: 'failed'
				}),
				entry(40_000, { kind: 'screen', area: 'Studio' }),
				entry(10_000, { kind: 'page', state: 'visible' })
			]
		});
		expect(text).toContain(
			[
				'Recent actions (newest first, time before the problem):',
				'- 2 s: press characterMenu.download in Studio',
				'- 3 s: press unnamed controls in Studio (3 times)',
				'- 4 s: request POST /characters/{id}/animations failed',
				'- 10 s: show Studio',
				'- 40 s: page visible'
			].join('\n')
		);
		// The problem's own notice is already its message; later than the problem is not part of it.
		expect(text).not.toContain('error download.failedRetry');
		expect(text).not.toContain('open Settings');
		expect(text).not.toContain(NAME);
	});

	test('without a failure time, the trail is timed back from Report', () => {
		const text = all({ trail: [entry(99_000, { kind: 'open', area: 'Export' })] });
		expect(text).toContain('time before Report was pressed');
		expect(text).toContain('- 1 s: open Export');
	});

	test('free text in any trail field never reaches the report', () => {
		const text = all({
			failedAt: 100_000,
			trail: [
				entry(1, { kind: 'press', area: NAME, control: 'export.start' }),
				entry(2, { kind: 'press', area: 'Studio', control: NAME }),
				entry(3, { kind: 'open', area: NAME }),
				entry(4, { kind: 'screen', area: NAME }),
				entry(5, { kind: 'notice', key: NAME, tone: 'error' }),
				entry(6, { kind: 'job', method: 'POST', endpoint: `/${NAME}`, state: NAME }),
				entry(7, { kind: 'page', state: NAME as 'hidden' }),
				entry(8, { kind: 'error', name: NAME }),
				entry(9, { kind: NAME } as unknown as TrailEntry['event']),
				null as unknown as TrailEntry
			]
		});
		expect(text).not.toContain('Alice');
		expect(text).toContain('press an unnamed control in Studio');
		expect(text).toContain('uncaught Error');
	});

	test('an overlong report drops whole trail entries, oldest first, before any fact', () => {
		const trail = Array.from({ length: TRAIL_SIZE }, (_, i) =>
			entry(99_000 - i, { kind: 'open', area: 'Export' })
		);
		const report = buildReport(
			{
				message: message('download.failedRetry', { label: 'x' }),
				trail,
				facts: { download: 'character', step: 'build' }
			},
			// A long problem text, as if an English template carried it, leaves little room in the URL.
			{ ...context, english: () => '字'.repeat(560) }
		);
		expect(reportUrl(report).length).toBeLessThanOrEqual(MAX_URL_LENGTH);
		expect(report.details).toContain('Download step: build');
		expect(report.details).not.toMatch(/\.\.\.$/);
		const shown = report.details.match(/^- /gm)?.length ?? 0;
		expect(shown).toBeLessThan(TRAIL_SIZE);
		expect(report.details).toContain('- 1 s: open Export');
	});

	test('a full trail keeps the URL in bounds and the facts intact', () => {
		const trail = Array.from({ length: 40 }, (_, i) =>
			entry(99_000 - i * 1000, {
				kind: 'job',
				method: 'POST',
				endpoint: '/create-character-with-8-directions',
				state: i % 2 ? 'failed' : 'running'
			})
		);
		const report = buildReport(
			{
				message: message('download.failedRetry', { label: 'x' }),
				trail,
				facts: { download: 'character', step: 'build' }
			},
			context
		);
		expect(reportUrl(report).length).toBeLessThanOrEqual(MAX_URL_LENGTH);
		expect(report.details).toContain('Download step: build');
		// At most TRAIL_SIZE entries are shown.
		expect(report.details.match(/^- /gm)).toHaveLength(TRAIL_SIZE);
	});
});

describe('error facts', () => {
	test('a failed code load names its cause and the file it asked for, not the URL', () => {
		const cause = new TypeError(
			`Failed to fetch dynamically imported module: ${ORIGIN}/assets/build-AbC_12-x.js`
		);
		const details = buildReport({ error: new LoadError(cause) }, context).details;
		expect(details).toContain('Message key: common.loadFailed');
		expect(details).toContain('Error type: LoadError, caused by TypeError');
		expect(details).toContain('Failed file: build.AbC_12-x.js');
		expect(details).not.toContain(ORIGIN);
	});

	test('a file is named only from a failed code load, never from other text shaped like one', () => {
		const path = `${ORIGIN}/assets/alice-private-filename-AbCd_123.js`;
		for (const error of [
			new TypeError('x', { cause: new DOMException(`Could not read ${path}`, 'DataCloneError') }),
			new LoadError(new TypeError(`Could not read ${path}`)),
			new LoadError(new TypeError(`Failed to fetch dynamically imported module: ${path}?x`))
		])
			expect(all({ error })).not.toContain('alice');
	});

	test('stored error text gives only its request, status and endpoint', () => {
		const details = buildReport(
			{ error: `POST /characters/alice-7f3a2b -> 422: "${NAME} with a red cape" was refused` },
			context
		).details;
		expect(details).toContain('HTTP status: 422');
		expect(details).toContain('Endpoint: POST /characters/{id}');
		expect(details).not.toContain('Alice');
	});

	test('a plain error reports where PixelDoll threw it, from its own files only', () => {
		const error = new Error(`${NAME} ${ORIGIN}/assets/Forged-12345678.js:9:9`);
		error.stack = [
			`Error: ${error.message}`,
			`    at x (${ORIGIN}/assets/download-BcD3_xYz.js:1:1234567)`,
			`    at y (chrome-extension://abc/assets/inject-12345678.js:1:2)`,
			`    at z (https://evil.example/assets/Studio-12345678.js:3:4)`,
			`    at w (${ORIGIN}/assets/Studio-Qw-er_ty.js:2:345)`
		].join('\n');
		const details = buildReport(
			{ message: message('download.failedRetry', { label: 'x' }), error },
			context
		).details;
		expect(details).toContain(
			'Thrown at: download.BcD3_xYz.js:1:1234567 < Studio.Qw-er_ty.js:2:345'
		);
		expect(details).not.toContain('Forged');
		expect(details).not.toContain('inject');
		expect(details).not.toContain('Alice');
	});

	test('a short message never removes frames, and dotted chunk names are kept', () => {
		const error = new Error('at');
		error.stack = `Error: at\n    at x (${ORIGIN}/assets/projectFolder.svelte-CcVVJXHP.js:4:5)`;
		expect(buildReport({ error }, context).details).toContain(
			'Thrown at: projectFolder.svelte.CcVVJXHP.js:4:5'
		);
	});

	test('a made-up error name or cause name is reported as Error', () => {
		const error = Object.assign(new Error('x'), {
			name: 'AliceError',
			cause: Object.assign(new Error('y'), { name: 'SmithException' })
		});
		const details = buildReport({ error }, context).details;
		expect(details).toContain('Error type: Error, caused by Error');
		expect(details).not.toMatch(/Alice|Smith/);
	});

	test('a cause cycle stops after three causes', () => {
		const a = new Error('a') as Error & { cause?: unknown };
		const b = new RangeError('b', { cause: a });
		a.cause = b;
		expect(buildReport({ error: a }, context).details).toContain(
			'Error type: Error, caused by RangeError, caused by Error, caused by RangeError'
		);
	});
});

test('a stored PixelLab failure says what failed and that it is from another visit or tab', () => {
	const report = buildReport(
		{ area: 'Activity', record: true, facts: { method: 'POST', endpoint: '/inpaint-v3' } },
		context
	);
	expect(report.title).toBe('Activity: A PixelLab request failed');
	expect(report.details).toContain('Seen: in an earlier visit or another tab');
	expect(
		buildReport({ area: 'Activity', record: true, failedAt: 5 }, context).details
	).not.toContain('Seen:');
});

test('closed facts drop plain words', () => {
	const text = all({
		area: NAME,
		facts: {
			state: NAME,
			phase: NAME,
			queueRole: NAME,
			step: NAME as 'build',
			exportFormat: NAME,
			offline: true,
			updateWaiting: true
		},
		error: Object.assign(new Error('x'), { status: 500, kind: NAME })
	});
	expect(text).not.toContain('Alice');
	expect(text).toContain('Connection: offline');
	expect(buildReport({ facts: { exportFormat: 'godot' } }, context).details).toContain(
		'Export format: godot'
	);
	expect(text).toContain('Update: a newer version was waiting to load');
});
