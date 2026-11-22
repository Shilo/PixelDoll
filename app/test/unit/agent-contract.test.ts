import { expect, test } from 'vitest';
import {
	AgentError,
	BudgetLedger,
	MAX_BUDGET,
	validate,
	type JsonSchema
} from '../../src/studio/automation/contract.ts';

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
