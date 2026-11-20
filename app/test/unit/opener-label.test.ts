import { expect, test } from 'vitest';
import { openerLabel, openerName } from '../../src/studio/openerLabel.ts';

test('action labels use three ASCII dots without dropping interpolated punctuation', () => {
	expect(openerLabel('Help')).toBe('Help...');
	expect(openerLabel('ヘルプ… ')).toBe('ヘルプ...');
	expect(openerLabel('Workspace...')).toBe('Workspace...');
	expect(openerLabel('Make one for Hero……')).toBe('Make one for Hero…...');
	expect(openerLabel('Make one for Hero...…')).toBe('Make one for Hero......');
});

test('displayed names keep their punctuation', () => {
	expect(openerName('Hero…')).toBe('Hero…...');
	expect(openerName('Hero...')).toBe('Hero...');
});
