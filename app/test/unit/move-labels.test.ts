import { expect, test } from 'vitest';
import { validAnimationId } from '../../src/lib/rig/rig.ts';
import { moveLabel } from '../../src/studio/model.ts';

test('move labels read snake and kebab case without changing identifiers or meaningful suffixes', () => {
	expect(moveLabel('right_punch')).toBe('Right punch');
	expect(moveLabel('sword_swing_north-east_pixminimax_v2')).toBe(
		'Sword swing north east pixminimax v2'
	);
	expect(moveLabel('default')).toBe('Default');
	expect(moveLabel('jump--loop')).toBe('Jump loop');
	expect(moveLabel('')).toBe('');
});

test('distinct valid move IDs always retain distinct labels when separators normalize alike', () => {
	const ids = [
		'jump-loop',
		'jump_loop',
		'jump--loop',
		'jump__loop',
		'jump-_loop',
		'jump-loop-jump-loop',
		'jump-loop-copy'
	];
	expect(ids.every(validAnimationId)).toBe(true);
	const labels = ids.map((id) => moveLabel(id, ids));
	expect(new Set(labels).size).toBe(ids.length);
	expect(labels.slice(0, 5)).toEqual(ids.slice(0, 5).map((id) => `Jump loop (${id})`));
	expect(labels[5]).toBe('Jump loop jump loop');
	expect(labels[6]).toBe('Jump loop copy');
	expect(ids).toEqual([
		'jump-loop',
		'jump_loop',
		'jump--loop',
		'jump__loop',
		'jump-_loop',
		'jump-loop-jump-loop',
		'jump-loop-copy'
	]);
});
