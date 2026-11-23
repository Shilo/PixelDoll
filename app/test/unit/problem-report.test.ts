import { describe, expect, test } from 'vitest';
import { ApiError } from '../../src/lib/pixellab/client.ts';
import { LocalizedError, message, type Message } from '../../src/lib/message.ts';
import { englishMessage } from '../../src/lib/report/english.ts';
import {
	browserOf,
	buildReport,
	endpointPath,
	MAX_URL_LENGTH,
	onceShown,
	osOf,
	reportText,
	reportUrl,
	sanitize,
	type ReportEnvironment
} from '../../src/lib/report/report.ts';

const CHROME_WINDOWS =
	'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36';
const env: ReportEnvironment = {
	version: '1.2.34',
	commit: 'abc1234',
	channel: 'pre-release',
	userAgent: CHROME_WINDOWS,
	locale: 'en',
	coarsePointer: false,
	screenWidth: 1920,
	screenHeight: 1080,
	viewportWidth: 1440,
	viewportHeight: 900
};
const context = { env, english: englishMessage, uptime: 754 };

// Every one of these must vanish from a report, whatever field it reaches.
const SECRETS = {
	apiKey: 'sk-ant-api03-AbCdEf123456GhIjKl789012MnOpQrSt',
	uuidKey: '3f2504e0-4f89-11d3-9a0c-0305e82c3301',
	bearer: 'Bearer eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIxMjM0In0.c2lnbmF0dXJl',
	assignment: 'api_key=pl_live_5f3c',
	dataUrl: 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk',
	email: 'pixel.artist+test@example.co.uk',
	windowsPath: 'C:\\Users\\shilo\\Documents\\knight.png',
	unixPath: '/Users/alice/Library/knight.png',
	homePath: '/home/bob/sprites/knight.png',
	sha256: 'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855',
	prefixedHash: 'sha256:9f86d081884c7d659a2feaa0c55ad015',
	urlWithQuery: 'https://api.pixellab.ai/v2/background-jobs/1234?token=abc',
	jobId: '8471920365',
	prompt: '"a crimson knight helmet with gold trim"'
};

describe('sanitize', () => {
	for (const [name, secret] of Object.entries(SECRETS))
		test(`removes ${name}`, () => {
			const out = sanitize(`Before ${secret} after`);
			expect(out).not.toContain(secret);
			expect(out).toMatch(/^Before .*after$/);
		});

	test('removes the token, not only its prefix, after Authorization and in key=value pairs', () => {
		const out = sanitize('Authorization: Bearer abcDEF123456 token="ghiJKL789" password=hunter2');
		for (const leaked of ['abcDEF123456', 'ghiJKL789', 'hunter2'])
			expect(out).not.toContain(leaked);
	});

	test('removes invisible characters that could hide text from the preview', () => {
		expect(sanitize('a\u200bb\u202ec\u0007d')).toBe('abcd');
	});

	test('keeps endpoint paths, message keys and ordinary words', () => {
		const text =
			'POST /animate-with-skeleton-v3 failed. Key state.pixelDollCouldNotFinishLoadingYourSaved, page open 12 min.';
		expect(sanitize(text)).toBe(text);
	});

	test('trims to the limit', () => {
		expect(sanitize('word '.repeat(100), 20)).toHaveLength(20);
	});
});

test('endpointPath keeps only a normalized path', () => {
	expect(endpointPath(`https://api.pixellab.ai/v2/background-jobs/${SECRETS.uuidKey}?a=1#x`)).toBe(
		'/background-jobs/{id}'
	);
	expect(endpointPath('/characters/c8f1a2b3d4/animations')).toBe('/characters/{id}/animations');
	for (const route of [
		'/inpaint-v3',
		'/create-character-with-8-directions',
		'/enhance-animation-v3-prompt'
	])
		expect(endpointPath(route)).toBe(route);
	expect(endpointPath('not a path')).toBeUndefined();
});

test('environment names only browser and OS families', () => {
	expect(browserOf(CHROME_WINDOWS)).toBe('Chrome 131');
	expect(browserOf(CHROME_WINDOWS, [{ brand: 'Microsoft Edge', version: '131' }])).toBe('Edge 131');
	const iphone =
		'Mozilla/5.0 (iPhone; CPU iPhone OS 18_1 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.1 Mobile/15E148 Safari/604.1';
	expect(browserOf(iphone)).toBe('Safari 18');
	expect(osOf(iphone)).toBe('iOS');
	expect(osOf(CHROME_WINDOWS)).toBe('Windows');
});

describe('onceShown', () => {
	test('shows each distinct error once, and retries one that could not be shown', () => {
		const shown: unknown[] = [];
		let room = false;
		const report = onceShown((error) => room && shown.push(error) > 0);
		const busy = new TypeError('a');
		report(busy); // another notice holds the place
		expect(shown).toEqual([]);
		room = true;
		report(busy);
		report(new TypeError('a'));
		report(new TypeError('b'));
		report(Object.assign(new Error('stop'), { name: 'AbortError' }));
		expect(shown.map((e) => (e as Error).message)).toEqual(['a', 'b']);
	});

	test('never throws on a value it cannot read', () => {
		const shown: unknown[] = [];
		const report = onceShown((error) => shown.push(error) > 0);
		const throwing = {
			get name(): string {
				throw new Error('getter');
			}
		};
		expect(() => report(Object.create(null))).not.toThrow();
		expect(() => report(throwing)).not.toThrow();
		expect(shown).toHaveLength(1); // both share the unreadable signature
	});
});

test('englishMessage hides text variables and fills numbers and nested messages', () => {
	expect(englishMessage(message('recentlyDeleted.restoreNamed', { name: 'Secret Knight' }))).toBe(
		'Restore ...'
	);
	expect(
		englishMessage(message('recentlyDeleted.restoredWithDrafts', { name: 'X', count: 1 }))
	).toBe('Restored ... with 1 draft');
	expect(englishMessage({ key: 'nope.missing' } as unknown as Message)).toBeUndefined();
});

describe('buildReport', () => {
	test('a PixelLab failure reports its status, endpoint and message key, but no text from the request', () => {
		const error = new ApiError(
			422,
			'invalid',
			`POST /characters/${SECRETS.uuidKey}/animations?key=1 -> 422: ${SECRETS.prompt} ${SECRETS.email}`
		);
		const report = buildReport(
			{
				area: 'Add a move',
				message: message('state.couldNotSaveReason', { reason: SECRETS.prompt }),
				error,
				facts: { state: 'failed', attempts: 2, seconds: 95 }
			},
			context
		);
		expect(report.title).toBe('Add a move: Could not save: ...');
		expect(report.details).toBe(
			[
				'Area: Add a move',
				'Kind: error',
				'Message key: state.couldNotSaveReason',
				'Message: Could not save: ...',
				'Error: ApiError',
				'Error kind: invalid',
				'HTTP status: 422',
				'Endpoint: POST /characters/{id}/animations',
				'Queue state: failed',
				'Attempts: 2',
				'Ran for: 2 min',
				'Page open for: 13 min'
			].join('\n')
		);
		expect(report.environment).toBe(
			'PixelDoll 1.2.34 (pre-release, abc1234) · Chrome 131 · Windows · desktop · en · large landscape screen'
		);
	});

	test('a localized error reports its key; a plain error only its name', () => {
		const localized = buildReport({ error: new LocalizedError('x', 'common.loadFailed') }, context);
		expect(localized.details).toContain('Message key: common.loadFailed');
		const plain = buildReport(
			{ error: new TypeError(`Cannot read ${SECRETS.windowsPath}`), tone: 'warning' },
			context
		);
		expect(plain.details).toContain('Error: TypeError');
		expect(plain.title).toBe('PixelDoll: Unexpected TypeError');
		expect(reportText(plain)).not.toContain('Cannot read');
	});

	test('adversarial input never reaches any field, and the URL carries exactly the preview', () => {
		const everything = Object.values(SECRETS).join(' ');
		const hostile = Object.assign(new Error(everything), { name: everything, kind: everything });
		const report = buildReport(
			{
				area: everything,
				error: hostile,
				message: message('recentlyDeleted.restoreNamed', { name: everything }),
				facts: {
					endpoint: SECRETS.urlWithQuery,
					state: everything,
					jobStatus: SECRETS.apiKey,
					phase: SECRETS.email
				}
			},
			{
				...context,
				// As if an English template itself carried them, far over every limit.
				english: () => `${everything} ${'字'.repeat(50_000)}`,
				env: { ...env, version: SECRETS.apiKey, commit: SECRETS.sha256, locale: everything }
			}
		);
		const url = reportUrl(report);
		expect(url.length).toBeLessThanOrEqual(MAX_URL_LENGTH);
		const all = `${reportText(report)}\n${decodeURIComponent(url)}`;
		for (const secret of Object.values(SECRETS)) expect(all).not.toContain(secret);
		const query = new URL(url).searchParams;
		expect(query.get('template')).toBe('problem-report.yml');
		expect(query.get('title')).toBe(report.title);
		for (const field of ['problem', 'environment', 'details'] as const)
			expect(query.get(field)).toBe(report[field]);
	});

	test('only app message keys and error-shaped names are reported', () => {
		const report = buildReport(
			{
				message: { key: `made.up.${SECRETS.jobId}` } as unknown as Message,
				error: Object.assign(new Error('x'), { name: 'Knight helmet' })
			},
			context
		);
		expect(report.details).not.toContain('Message key');
		expect(report.details).toContain('Error: Error');
		expect(
			buildReport({ error: new DOMException('x', 'QuotaExceededError') }, context).details
		).toContain('Error: QuotaExceededError');
	});

	test('an uncaught error is titled by its name and area, and Steps to reproduce is left to the person', () => {
		const report = buildReport(
			{
				area: 'Characters',
				message: message('report.unexpected'),
				error: new TypeError('x'),
				tone: 'warning',
				uncaught: true
			},
			context
		);
		expect(report.title).toBe('Unexpected TypeError in Characters');
		expect(report.problem).toBe(
			'PixelDoll hit an unexpected TypeError in Characters that nothing handled.'
		);
		expect(reportText(report)).not.toContain('Steps to reproduce');
		expect(new URL(reportUrl(report)).searchParams.has('steps')).toBe(false);
	});

	test('the URL encodes spaces as %20, never +', () => {
		const url = reportUrl(
			buildReport(
				{ area: 'Add a move', message: message('report.unexpected') },
				{ ...context, english: () => 'a + b c' }
			)
		);
		expect(url).toContain('title=Add%20a%20move%3A%20a%20%2B%20b%20c');
		expect(url.split('?')[1]).not.toContain('+');
	});

	test('an unreadable thrown value is reported as an unexpected problem without throwing', () => {
		const throwing = {
			get name(): string {
				throw new Error('getter');
			}
		};
		for (const value of [Object.create(null), throwing]) {
			const report = buildReport(
				{ area: 'Characters', error: value, tone: 'warning', uncaught: true },
				context
			);
			expect(report.title).toBe('Unexpected problem in Characters');
			expect(report.details).toContain('Error: Non-error value');
		}
		expect(buildReport({ error: 42, uncaught: true }, context).title).toBe(
			'Unexpected problem in PixelDoll'
		);
	});

	test('an overlong message shrinks until the URL fits', () => {
		const report = buildReport(
			{ message: message('report.unexpected') },
			{ ...context, english: () => '字'.repeat(50_000) }
		);
		expect(reportUrl(report).length).toBeLessThanOrEqual(MAX_URL_LENGTH);
		expect(report.problem.endsWith('...')).toBe(true);
	});
});
