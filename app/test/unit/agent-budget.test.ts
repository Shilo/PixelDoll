import { afterEach, beforeEach, expect, test, vi } from 'vitest';
import type { Balance } from '../../src/lib/pixellab/routes.ts';
import { accountBalance } from './account-fixture.ts';
import {
	ASK_MS,
	budget,
	budgetRequest,
	endBudget,
	rateUsd,
	requestBudget,
	withReservation
} from '../../src/studio/automation/budget.ts';

const fixture = vi.hoisted(() => ({
	revision: 0,
	balance: null as Balance | null,
	sent: false,
	answer: undefined as ((allowed: boolean) => void) | undefined,
	unmount: vi.fn()
}));
vi.mock('../../src/lib/app.svelte.ts', () => ({
	app: fixture,
	getKeyRevision: () => fixture.revision
}));
vi.mock('../../src/lib/pixellab/queue.ts', () => ({
	AGENT_APPROVAL_ENDED: 'Approval ended',
	queue: {
		role: 'leader',
		subscribe: () => () => {},
		authorizeAgentActivity: () => () => fixture.sent
	}
}));
vi.mock('../../src/studio/automation/AgentBudgetDialog.svelte', () => ({ default: {} }));
vi.mock('../../src/studio/automation/AgentBudget.svelte', () => ({ default: {} }));
vi.mock('svelte', async (original) => ({
	...(await original<typeof import('svelte')>()),
	mount: (_component: unknown, { props }: { props?: { onanswer: (allowed: boolean) => void } }) => {
		if (props) fixture.answer = props.onanswer;
		return {};
	},
	unmount: fixture.unmount
}));

beforeEach(() => {
	const page: { top?: unknown } = {};
	page.top = page;
	vi.stubGlobal('window', page);
	vi.stubGlobal('document', {
		createElement: () => ({ remove() {} }),
		querySelectorAll: () => [],
		body: { append() {} }
	});
	vi.stubGlobal(
		'MutationObserver',
		class {
			observe() {}
		}
	);
	fixture.sent = false;
	fixture.answer = undefined;
	fixture.unmount.mockClear();
});
afterEach(() => {
	endBudget();
	vi.useRealTimers();
	vi.unstubAllGlobals();
});
const signal = () => new AbortController().signal;
async function approve(gens: number) {
	const { activityId } = await requestBudget(gens, 'Paint a cloak', signal());
	fixture.answer!(true);
	await vi.waitFor(() => expect(budgetRequest(activityId)?.answer).toBe('allowed'));
}

test('an unsent reservation is refunded and a possibly sent request stays reserved', async () => {
	await approve(9);
	const fail = () => {
		throw new Error('Synthetic failure');
	};
	await expect(withReservation('cloak', 3, signal(), fail)).rejects.toThrow('Synthetic failure');
	expect(budget()).toMatchObject({ reserved: 0, remaining: 9 });
	await expect(
		withReservation('cloak', 3, signal(), () => {
			fixture.sent = true;
			fail();
		})
	).rejects.toThrow('Synthetic failure');
	expect(budget()).toMatchObject({ reserved: 3, remaining: 6 });
});

test('End revokes admitted but unsent work and closes a pending top-up', async () => {
	await approve(10);
	const before = budget().reserved;
	const beforePaid = await withReservation(
		'move',
		4,
		signal(),
		(_check, _id, _finish, stillApproved) => stillApproved
	);
	expect(beforePaid).not.toThrow();
	const { activityId } = await requestBudget(2, 'One more move', signal());
	endBudget();
	expect(beforePaid).toThrow(expect.objectContaining({ code: 'budget' }));
	fixture.answer!(true); // a click after the dialog closed cannot grant anything
	await vi.waitFor(() => expect(budgetRequest(activityId)?.answer).toBe('canceled'));
	expect(budget()).toMatchObject({ reserved: before, remaining: 0, active: false });
});

test('switching PixelLab accounts revokes the budget and cancels its unanswered top-up', async () => {
	await approve(10);
	const stillApproved = await withReservation(
		'move',
		4,
		signal(),
		(_check, _id, _finish, check) => check
	);
	const { activityId } = await requestBudget(2, 'More moves', signal());
	fixture.revision++;
	expect(stillApproved).toThrow(expect.objectContaining({ code: 'budget' }));
	fixture.answer!(true);
	await vi.waitFor(() => expect(budgetRequest(activityId)?.answer).toBe('canceled'));
	expect(budget()).toMatchObject({ approved: 0, reserved: 0, remaining: 0, active: false });
});

test('a pending request outlives caller abort and records the later answer', async () => {
	const controller = new AbortController();
	const request = await requestBudget(6, 'Paint a cloak', controller.signal);
	expect(request.answer).toBe('pending');
	controller.abort();
	expect(fixture.unmount).not.toHaveBeenCalled();
	fixture.answer!(true);
	await vi.waitFor(() =>
		expect(budget().request).toMatchObject({
			activityId: request.activityId,
			answer: 'allowed'
		})
	);
	expect(budget().remaining).toBe(6);
	expect(fixture.unmount).toHaveBeenCalledOnce();
});

test('an unanswered request closes at five minutes and keeps its decision', async () => {
	vi.useFakeTimers();
	const { activityId } = await requestBudget(3, 'Paint a cloak', signal());
	await vi.advanceTimersByTimeAsync(ASK_MS - 1);
	expect(budgetRequest(activityId)?.answer).toBe('pending');
	await vi.advanceTimersByTimeAsync(1);
	expect(budgetRequest(activityId)?.answer).toBe('timeout');
	expect(budget().remaining).toBe(0);
	expect(fixture.unmount).toHaveBeenCalledOnce();
});

test.each([
	[null, 12],
	['Tier 0', 12],
	['Tier 1', 12],
	['Tier 2', 9.6],
	['Tier 3', 10],
	['Tier 4', 12]
])('rateUsd prices %s at the applicable published rate or the Tier 1 fallback', (plan, usd) => {
	fixture.balance = plan
		? { ...accountBalance, subscription: { ...accountBalance.subscription!, plan } }
		: null;
	expect(rateUsd(2000)).toBe(usd);
});

test('a page framed by another site never asks for a budget', async () => {
	vi.stubGlobal('window', { top: {} });
	await expect(requestBudget(3, 'Paint a cloak', signal())).rejects.toMatchObject({
		code: 'not_ready'
	});
	expect(fixture.answer).toBeUndefined();
});
