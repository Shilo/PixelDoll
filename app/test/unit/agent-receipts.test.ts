import { expect, test } from 'vitest';
import {
	ReceiptLog,
	creationOutcome,
	fingerprintOf,
	itemOutcome,
	type Receipt
} from '../../src/studio/automation/receipts.ts';

const started = (o: Partial<Receipt> = {}): Receipt => ({
	kind: 'character',
	id: 'rig-1',
	characterId: 'rig-1',
	name: 'Knight',
	fingerprint: '{"details":"knight"}',
	generations: 9,
	startedAt: '2026-11-22T00:00:00.000Z',
	outcome: 'running',
	...o
});

test('a character creation reports how it ended even after it leaves the running list', () => {
	const running = { running: true, error: false, finished: false, exists: false };
	expect(creationOutcome(running)).toBe('running');
	expect(creationOutcome({ ...running, running: false })).toBe('running');
	// The new character is listed before the run settles; it still counts as running until it does.
	expect(creationOutcome({ ...running, exists: true })).toBe('running');
	expect(creationOutcome({ running: false, error: false, finished: true, exists: true })).toBe(
		'created'
	);
	expect(creationOutcome({ running: false, error: true, finished: true, exists: false })).toBe(
		'failed'
	);
	expect(creationOutcome({ running: false, error: true, finished: true, exists: true })).toBe(
		'created'
	);
	// Settled with neither: this tab stopped running jobs. Never reported as failed, so nobody pays again for it.
	expect(creationOutcome({ running: false, error: false, finished: true, exists: false })).toBe(
		'stopped'
	);
});

test('a request fingerprint ignores control fields and key order, and includes character scope', () => {
	const args = { characterId: 'a', slot: 'head', prompt: 'A red hat' };
	expect(fingerprintOf({ ...args, dryRun: true, requestId: 'first' })).toBe(
		fingerprintOf({ prompt: args.prompt, slot: args.slot, characterId: 'a' })
	);
	expect(fingerprintOf({ ...args, characterId: 'b' })).not.toBe(fingerprintOf(args));
});

test('an item draft reports review, saved, failed, canceled or discarded', () => {
	expect(itemOutcome({ phase: 'running' })).toBe('running');
	expect(itemOutcome({ phase: 'review' })).toBe('review');
	expect(itemOutcome({ phase: 'review', acceptedAt: 1 })).toBe('saved');
	expect(itemOutcome({ phase: 'failed' })).toBe('failed');
	expect(itemOutcome({ phase: 'failed', canceled: true })).toBe('canceled');
	// Gone from the list: saved itself (a clean draft) or thrown away; unknown until its character is read.
	expect(itemOutcome(undefined, true)).toBe('saved');
	expect(itemOutcome(undefined, false)).toBe('discarded');
	expect(itemOutcome(undefined)).toBeUndefined();
});

test('a repeated requestId returns the first start, and a final outcome never changes', () => {
	const log = new ReceiptLog();
	const first = log.add(started({ requestId: 'knight-1' }));
	expect(log.repeat('character', 'knight-1', first.fingerprint)).toBe(first);
	expect(log.repeat('item', 'knight-1', first.fingerprint)).toBeUndefined();
	expect(log.repeat('character', undefined, first.fingerprint)).toBeUndefined();
	expect(() => log.repeat('character', 'knight-1', '{"details":"wizard"}')).toThrow(
		expect.objectContaining({ code: 'invalid' }) as Error
	);
	log.settle(first, 'created');
	log.settle(first, 'stopped');
	expect(log.get('rig-1')).toMatchObject({ outcome: 'created' });
	const item = log.add(started({ kind: 'item', id: 'hat' }));
	log.settle(item, 'review');
	log.settle(item, 'failed', 'No usable frames');
	log.settle(item, 'saved');
	expect(item).toMatchObject({ outcome: 'failed', error: 'No usable frames' });
});
