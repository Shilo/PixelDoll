import { expect, test } from 'vitest';
import { openerLabel } from '../../src/studio/openerLabel.ts';

test('translated action labels end in exactly one ellipsis character', () => {
	expect(openerLabel('Help')).toBe('Help…');
	expect(openerLabel('ヘルプ… ')).toBe('ヘルプ…');
	expect(openerLabel('Workspace...')).toBe('Workspace…');
	expect(openerLabel('Help……')).toBe('Help…');
	expect(openerLabel('Help...…')).toBe('Help…');
	expect(openerLabel(openerLabel('Help…'))).toBe('Help…');
});
