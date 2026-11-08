import { afterEach, expect, test, vi } from 'vitest';
import {
	RESEARCH_BUDGET_KEY,
	RESEARCH_STAGE_CAPS,
	RESEARCH_PILOT_CAP,
	RESEARCH_PHASE_CAP,
	CLEAN_GRIP_ALLOWANCE,
	CLEAN_GRIP_BATCH_CAP,
	CLEAN_GRIP_PRIOR_HELD,
	readResearchBudget,
	researchBudgetUsage,
	reserveResearchCall,
	recordResearchOutcome,
	recordResearchGate
} from '../../src/ui/motion-lab/research-budget.ts';

function storage() {
	const values = new Map<string, string>([
		['pixeldoll.motionLab.2026-10-28', 'historical reservations'],
		['pixeldoll.motionLab.custom-v3.2026-11-01', 'historical custom receipt']
	]);
	const writes: string[] = [],
		tails = new Map<string, Promise<unknown>>();
	vi.stubGlobal('localStorage', {
		getItem: (key: string) => values.get(key) ?? null,
		setItem: (key: string, value: string) => {
			writes.push(key);
			values.set(key, value);
		}
	});
	vi.stubGlobal('navigator', {
		locks: {
			request: <T>(key: string, change: () => T) => {
				const next = (tails.get(key) ?? Promise.resolve()).catch(() => undefined).then(change);
				tails.set(key, next);
				return next;
			}
		}
	});
	return { values, writes };
}
afterEach(() => vi.unstubAllGlobals());
const call = (id: string, units: number, stage: 'body' | 'equipment' | 'replication' = 'body') => ({
	id,
	label: id,
	stage,
	units
});
const gate = (passed = true) => ({
	passed,
	notes: 'Reviewed actual frozen frames and visible sole marks.',
	evidence: ['body-review.json']
});

test('serialized concurrent tabs cannot over-reserve a stage and duplicate identities never dispatch twice', async () => {
	storage();
	const firstTab = reserveResearchCall,
		secondTab = reserveResearchCall;
	const results = await Promise.allSettled([firstTab(call('one', 15)), secondTab(call('two', 15))]);
	expect(results.filter((r) => r.status === 'fulfilled')).toHaveLength(1);
	expect(results.filter((r) => r.status === 'rejected')).toHaveLength(1);
	expect(researchBudgetUsage().reservedUnits).toBe(15);
	const duplicates = await Promise.all([firstTab(call('shared', 5)), secondTab(call('shared', 5))]);
	expect(duplicates.map((r) => r.created)).toEqual([true, false]);
	await expect(reserveResearchCall(call('shared', 4))).rejects.toThrow('different reservation');
});

test('fractional reservations fill exact caps without floating-point drift and never touch historical ledgers', async () => {
	const f = storage();
	await reserveResearchCall(call('import', 0.25));
	await Promise.all(
		Array.from({ length: 10 }, (_, i) => reserveResearchCall(call('estimate-' + i, 0.1)))
	);
	await reserveResearchCall(call('remaining', 23.75));
	expect(researchBudgetUsage().reservedUnits).toBe(25);
	await expect(reserveResearchCall(call('overflow', 0.000001))).rejects.toThrow('stage allocation');
	expect([...new Set(f.writes)]).toEqual([RESEARCH_BUDGET_KEY]);
	expect(f.values.get('pixeldoll.motionLab.2026-10-28')).toBe('historical reservations');
	expect(f.values.get('pixeldoll.motionLab.custom-v3.2026-11-01')).toBe(
		'historical custom receipt'
	);
});

test('explicit reviewed gates unlock stages, enforce the aggregate pilot, and invalidate stale downstream approvals', async () => {
	storage();
	await expect(reserveResearchCall(call('equipment', 10, 'equipment'))).rejects.toThrow(
		'body qualification'
	);
	await expect(
		recordResearchGate('body', { passed: true, notes: '', evidence: [] })
	).rejects.toThrow('explicit evidence');
	await recordResearchGate('body', gate());
	await reserveResearchCall(call('body', 21));
	await reserveResearchCall(call('equipment', 250, 'equipment'));
	await expect(reserveResearchCall(call('replication', 1, 'replication'))).rejects.toThrow(
		'equipment qualification'
	);
	await recordResearchGate('equipment', gate());
	expect(researchBudgetUsage()).toMatchObject({
		reservedUnits: 271,
		pilotRemaining: 0,
		phaseRemaining: 729
	});
	await expect(reserveResearchCall(call('extra', 0.1, 'replication'))).rejects.toThrow(
		'pilot or phase'
	);
	await recordResearchGate('body', gate(false));
	expect(readResearchBudget().gates.equipment).toBeUndefined();
	await expect(reserveResearchCall(call('closed', 1, 'equipment'))).rejects.toThrow(
		'body qualification'
	);
});

test('the newly approved 75-unit batch preserves historical holds and failed qualification inside the 500-unit ceiling', async () => {
	storage();
	expect(RESEARCH_STAGE_CAPS).toEqual({ body: 25, equipment: 250, replication: 0 });
	expect(CLEAN_GRIP_ALLOWANCE).toBe(500);
	expect(CLEAN_GRIP_BATCH_CAP).toBe(75);
	expect(CLEAN_GRIP_PRIOR_HELD).toBe(196);
	expect(Object.values(RESEARCH_STAGE_CAPS).reduce<number>((n, cap) => n + cap, 0)).toBe(275);
	expect(RESEARCH_PILOT_CAP).toBe(271);
	expect(RESEARCH_PHASE_CAP).toBe(1000);
	await recordResearchGate('body', gate());
	await recordResearchGate('equipment', gate(false));
	const failed = structuredClone(readResearchBudget().gates.equipment);
	await reserveResearchCall(call('body-evidence', 21));
	await reserveResearchCall(call('bounded-equipment-evidence', 175, 'equipment'));
	const historical = structuredClone(readResearchBudget().calls);
	expect(researchBudgetUsage()).toMatchObject({
		reservedUnits: 196,
		pilotRemaining: 75,
		phaseRemaining: 804
	});
	for (let i = 0; i < 3; i++)
		await reserveResearchCall(call('clean-control-' + i, 25, 'equipment'));
	expect(readResearchBudget().calls.slice(0, 2)).toEqual(historical);
	expect(researchBudgetUsage()).toMatchObject({
		reservedUnits: 271,
		pilotRemaining: 0,
		stageUnits: { equipment: 250 }
	});
	await expect(reserveResearchCall(call('equipment-overflow', 0.1, 'equipment'))).rejects.toThrow(
		'pilot or phase'
	);
	await expect(
		reserveResearchCall(call('still-unqualified-replication', 1, 'replication'))
	).rejects.toThrow('equipment qualification');
	expect(readResearchBudget().gates.equipment).toEqual(failed);
	expect(readResearchBudget().calls.map((row) => row.id)).toEqual([
		'body-evidence',
		'bounded-equipment-evidence',
		'clean-control-0',
		'clean-control-1',
		'clean-control-2'
	]);
});

test('a zero replication allocation cannot spend even with reviewed body and equipment gates and unused pilot funds', async () => {
	storage();
	await recordResearchGate('body', gate());
	await recordResearchGate('equipment', gate());
	await reserveResearchCall(call('equipment-call', 25, 'equipment'));
	const before = structuredClone(readResearchBudget());
	await expect(reserveResearchCall(call('no-replication', 0.1, 'replication'))).rejects.toThrow(
		'stage allocation'
	);
	await expect(reserveResearchCall(call('invalid-zero', 0, 'replication'))).rejects.toThrow(
		'Generation units'
	);
	expect(readResearchBudget()).toEqual(before);
	expect(researchBudgetUsage().pilotRemaining).toBe(246);
});

test('unknown and failed outcomes retain reservations; discovered job IDs resume without granting another send', async () => {
	storage();
	const unknown = call('unknown', 12),
		failed = call('failed', 8);
	await reserveResearchCall(unknown);
	await reserveResearchCall(failed);
	await recordResearchOutcome('unknown', {
		status: 'unknown',
		note: 'Transport failed after submission.'
	});
	await recordResearchOutcome('failed', { status: 'failed', billedUnits: 0 });
	expect((await reserveResearchCall(unknown)).created).toBe(false);
	expect((await reserveResearchCall(failed)).created).toBe(false);
	await recordResearchOutcome('unknown', { status: 'accepted', jobIds: ['found-job'] });
	expect(await reserveResearchCall(unknown)).toMatchObject({
		created: false,
		record: { status: 'accepted', jobIds: ['found-job'] }
	});
	expect(researchBudgetUsage().reservedUnits).toBe(20);
});

test('higher provider billing is retained even beyond an allocation and blocks all new spending', async () => {
	storage();
	await reserveResearchCall(call('underestimate', 10));
	await recordResearchOutcome('underestimate', {
		status: 'completed',
		billedUnits: 26,
		jobIds: ['first-job']
	});
	await recordResearchOutcome('underestimate', {
		status: 'completed',
		billedUnits: 3,
		jobIds: ['first-job', 'second-job']
	});
	expect(researchBudgetUsage()).toMatchObject({ reservedUnits: 26, billedUnits: 26 });
	expect(readResearchBudget().calls[0].jobIds).toEqual(['first-job', 'second-job']);
	await recordResearchGate('body', gate());
	await expect(reserveResearchCall(call('cannot-hide-overrun', 1, 'equipment'))).rejects.toThrow(
		'exceeded its allocation'
	);
	await expect(recordResearchOutcome('underestimate', { status: 'unknown' })).rejects.toThrow(
		'final research outcome'
	);
});

test('invalid units, damaged storage and unavailable locks fail visibly before a reservation', async () => {
	const f = storage();
	for (const units of [0, -1, NaN, Infinity, 0.0000001])
		await expect(reserveResearchCall(call('invalid', units))).rejects.toThrow('Generation units');
	expect(readResearchBudget().calls).toEqual([]);
	f.values.set(RESEARCH_BUDGET_KEY, '{bad');
	expect(readResearchBudget).toThrow('JSON is invalid');
	f.values.delete(RESEARCH_BUDGET_KEY);
	vi.stubGlobal('navigator', {});
	await expect(reserveResearchCall(call('no-lock', 1))).rejects.toThrow('Web Locks');
	expect(f.values.has(RESEARCH_BUDGET_KEY)).toBe(false);
});
