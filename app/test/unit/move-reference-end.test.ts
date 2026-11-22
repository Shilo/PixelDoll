import { describe, expect, it } from 'vitest';
import { moveReferenceEnd } from '../../src/studio/moveAnimationOptions.ts';

// The end frame Add a move sends to Generate and to Enhance.
describe('moveReferenceEnd', () => {
	it('ends a looping move where it starts when no end frame was chosen', () => {
		expect(moveReferenceEnd(undefined, true, 'start')).toBe('start');
		expect(moveReferenceEnd({}, true, 'start')).toBe('start');
	});
	it('leaves a one-shot move open-ended when no end frame was chosen', () => {
		expect(moveReferenceEnd(undefined, false, 'start')).toBeUndefined();
	});
	it('uses a chosen end frame, even on a loop', () => {
		expect(moveReferenceEnd({ end: 'pose' }, true, 'start')).toBe('pose');
		expect(moveReferenceEnd({ end: 'pose' }, false, 'start')).toBe('pose');
	});
	it('sends no end frame when the user cleared it', () => {
		expect(moveReferenceEnd({ end: null }, true, 'start')).toBeUndefined();
	});
});
