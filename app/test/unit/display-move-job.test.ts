import { describe, expect, it } from 'vitest';
import { displayMoveJob } from '../../src/studio/model.ts';

describe('displayMoveJob', () => {
	const items = [
		{ id: 'pants', name: 'Leather pants' },
		{ id: 'vest', name: 'Police vest' }
	];

	it('names the items of an items-only job so jobs for one move stay distinct', () => {
		expect(displayMoveJob('Slightly lift', { items: ['pants'], itemsOnly: true }, items)).toBe(
			'Slightly lift · Leather pants'
		);
		expect(displayMoveJob('Slightly lift', { items: ['vest'], itemsOnly: true }, items)).toBe(
			'Slightly lift · Police vest'
		);
	});

	it('keeps the move name for body moves and unknown items', () => {
		expect(displayMoveJob('Walk', { items: ['pants'] }, items)).toBe('Walk');
		expect(displayMoveJob('Walk', { items: ['gone'], itemsOnly: true }, items)).toBe('Walk');
	});
});
