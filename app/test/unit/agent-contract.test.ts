import { expect, test, vi } from 'vitest';
import {
	AgentError,
	BudgetLedger,
	FAILED,
	MAX_BUDGET,
	errorData,
	planOutfit,
	serial,
	validate,
	type JsonSchema
} from '../../src/studio/automation/contract.ts';
import type { Manifest } from '../../src/lib/store/manifest.ts';
import { jobError } from '../../src/studio/automation/jobError.ts';

const schema: JsonSchema = {
	type: 'object',
	required: ['slot'],
	properties: {
		slot: { type: 'string', maxLength: 5 },
		count: { type: 'integer', minimum: 1, maximum: 3 },
		dirs: { type: 'array', items: { type: 'string', enum: ['south', 'east'] }, maxItems: 2 },
		outfit: { type: 'object', additionalProperties: true }
	}
};

test('agent input is checked against the tool schema', () => {
	expect(() =>
		validate(schema, { slot: 'head', count: 2, dirs: ['east'], outfit: { a: null } })
	).not.toThrow();
	for (const [bad, why] of [
		[null, 'input must be an object'],
		[{}, 'input needs "slot"'],
		[{ slot: 'x', extra: 1 }, 'input has unknown property "extra"'],
		[{ slot: 'toolong' }, 'input.slot may be at most 5 characters'],
		[{ slot: 'x', count: 1.5 }, 'input.count must be a whole number'],
		[{ slot: 'x', count: 4 }, 'input.count must be at most 3'],
		[{ slot: 'x', dirs: ['up'] }, 'input.dirs[0] must be one of "south", "east"'],
		[{ slot: 'x', dirs: ['south', 'east', 'south'] }, 'input.dirs may have at most 2 entries']
	] as const) {
		const error = (() => {
			try {
				validate(schema, bad);
			} catch (e) {
				return e;
			}
		})();
		expect(error).toBeInstanceOf(AgentError);
		expect((error as AgentError).message).toBe(why);
		expect((error as AgentError).code).toBe('invalid');
	}
});

test('paid starts reserve their full estimate and can never pass the approved budget', () => {
	const ledger = new BudgetLedger();
	expect(ledger.reserve('nothing approved', 0.01)).toBe(false);
	ledger.approve(15);
	expect(ledger.reserve('character', 9.25)).toBe(true);
	expect(ledger.reserve('item', 6)).toBe(false); // 5.75 left: refused, nothing reserved
	expect(ledger.snapshot()).toMatchObject({ approved: 15, reserved: 9.25, remaining: 5.75 });
	expect(ledger.reserve('item', 5.75)).toBe(true);
	expect(ledger.snapshot().remaining).toBe(0);
	// A start refused before any request returns its reservation; an unknown one is not released.
	ledger.release('item', 5.75);
	expect(ledger.snapshot()).toMatchObject({ reserved: 9.25, remaining: 5.75 });
	ledger.release('never reserved', 1);
	expect(ledger.snapshot().spends).toEqual([{ what: 'character', generations: 9.25 }]);
	expect(() => ledger.approve(0)).toThrow(RangeError);
	expect(() => ledger.approve(MAX_BUDGET + 1)).toThrow(RangeError);
});

test('a budget ends on End and clears for another account', () => {
	const ledger = new BudgetLedger();
	ledger.approve(20);
	expect(ledger.reserve('item', 8)).toBe(true);
	ledger.end(); // what was reserved may already be spent: it stays; nothing more can start
	expect(ledger.snapshot()).toMatchObject({ approved: 8, reserved: 8, remaining: 0 });
	expect(ledger.reserve('item', 0.5)).toBe(false);
	ledger.clear();
	expect(ledger.snapshot()).toEqual({ approved: 0, reserved: 0, remaining: 0, spends: [] });
});

test('calls run one at a time in arrival order, and a canceled waiting call never runs', async () => {
	const line = serial(),
		log: string[] = [];
	let releaseFirst = () => {};
	const first = line(async () => {
		log.push('first start');
		await new Promise<void>((resolve) => (releaseFirst = resolve));
		log.push('first end');
		throw new Error('first failed');
	});
	const canceled = new AbortController();
	const skipped = line(async () => log.push('never'), canceled.signal);
	const second = line(async () => {
		log.push('second');
		return 2;
	});
	await Promise.resolve();
	canceled.abort();
	expect(log).toEqual(['first start']); // the others wait behind the first
	releaseFirst();
	await expect(first).rejects.toThrow('first failed'); // a failure does not stop the line
	await expect(skipped).rejects.toMatchObject({ code: 'canceled' });
	expect(await second).toBe(2);
	expect(log).toEqual(['first start', 'first end', 'second']);
});

test('a budget question closes on an answer, a timeout or the agent giving up, and stops after two refusals', async () => {
	vi.useFakeTimers();
	try {
		const ledger = new BudgetLedger(),
			shown: { answer: (allowed: boolean) => void; closed: boolean }[] = [];
		const open = (answer: (allowed: boolean) => void) => {
			const question = { answer, closed: false };
			shown.push(question);
			return () => (question.closed = true);
		};
		const never = new AbortController().signal;

		const timedOut = ledger.request(10, open, never, 1000);
		// One question at a time.
		await expect(ledger.request(5, open, never, 1000)).rejects.toMatchObject({ code: 'busy' });
		await vi.advanceTimersByTimeAsync(1000);
		expect(await timedOut).toBe('timeout');
		expect(shown[0].closed).toBe(true); // no dialog left behind that could still approve spending

		const giving = new AbortController();
		const gaveUp = ledger.request(10, open, giving.signal, 1000);
		giving.abort();
		expect(await gaveUp).toBe('canceled');
		expect(shown[1].closed).toBe(true);
		expect(ledger.snapshot().approved).toBe(0);

		const allowed = ledger.request(10, open, never, 1000);
		shown[2].answer(true);
		expect(await allowed).toBe('allowed');
		expect(shown[2].closed).toBe(true);
		expect(ledger.snapshot()).toMatchObject({ approved: 10, remaining: 10 });
		shown[2].answer(true); // a late second click changes nothing
		expect(ledger.snapshot().approved).toBe(10);

		for (const n of [3, 4]) {
			const denied = ledger.request(5, open, never, 1000);
			shown[n].answer(false);
			expect(await denied).toBe('denied');
		}
		await expect(ledger.request(5, open, never, 1000)).rejects.toMatchObject({
			code: 'needs_user'
		});
		expect(shown).toHaveLength(5);
		expect(ledger.snapshot().approved).toBe(10);
	} finally {
		vi.useRealTimers();
	}
});

test('failures the agent cannot act on keep their raw text out of the result', () => {
	const logged = vi.spyOn(console, 'error').mockImplementation(() => {});
	try {
		expect(errorData(new AgentError('No draft "x".', 'not_found'))).toEqual({
			error: 'No draft "x".',
			code: 'not_found'
		});
		expect(errorData(new Error('HTTP 500 at /v2/secret-route?key=abc'))).toEqual({
			error: FAILED,
			code: 'failed'
		});
		expect(logged).toHaveBeenCalledTimes(1);
	} finally {
		logged.mockRestore();
	}
});

test('failed dialog opening clears the timer and permits a new request without exposing the exception', async () => {
	vi.useFakeTimers();
	try {
		const ledger = new BudgetLedger();
		const signal = new AbortController().signal;
		await expect(
			ledger.request(
				1,
				() => {
					throw new Error('private detail');
				},
				signal,
				1000
			)
		).rejects.toMatchObject({ code: 'not_ready' });
		expect(vi.getTimerCount()).toBe(0);
		await expect(
			ledger.request(
				1,
				(answer) => {
					answer(true);
					return () => {};
				},
				signal,
				1000
			)
		).resolves.toBe('allowed');
	} finally {
		vi.useRealTimers();
	}
});

test('generation errors report actionable reasons without copying provider text', () => {
	expect(
		jobError('POST https://api.example.com/?key=abc -> 402: insufficient credits, token abc')
	).toMatch(/^credits: PixelLab needs more credits/);
	expect(jobError('No usable frames, see https://private.example')).toMatch(/^quality:/);
	expect(jobError('raw secret abc and https://private.example')).toBe(
		'generation: See PixelDoll Activity for details before starting work again.'
	);
});

test('an outfit change is checked as a whole before anything is applied', () => {
	const base = {
		manifest: {
			rig: { baseItem: 'base' },
			slots: [{ id: 'body', class: 'base' }, { id: 'head' }, { id: 'main_hand' }],
			items: [
				{ id: 'hat', slot: 'head' },
				{ id: 'helm', slot: 'head' },
				{ id: 'sword', slot: 'main_hand' }
			]
		} as Manifest,
		drafts: [{ id: 'draft-crown', slot: 'head' }]
	};
	expect(planOutfit({ ...base, wear: ['sword', 'draft-crown'], takeOff: [] })).toEqual({
		items: { main_hand: 'sword' },
		drafts: { main_hand: null, head: 'draft-crown' }
	});
	expect(planOutfit({ ...base, wear: ['hat'], takeOff: ['main_hand'] })).toEqual({
		items: { main_hand: null, head: 'hat' },
		drafts: { main_hand: null, head: null }
	});
	// One bad entry refuses the whole call: nothing is half applied.
	for (const [change, code] of [
		[{ wear: ['sword', 'nope'], takeOff: [] }, 'not_found'],
		[{ wear: [], takeOff: ['head', 'tail'] }, 'not_found'],
		[{ wear: ['hat', 'helm'], takeOff: [] }, 'invalid'],
		[{ wear: ['hat'], takeOff: ['head'] }, 'invalid'],
		[{ wear: [], takeOff: ['body'] }, 'invalid']
	] as const)
		expect(() => planOutfit({ ...base, ...change })).toThrow(
			expect.objectContaining({ code }) as Error
		);
});
