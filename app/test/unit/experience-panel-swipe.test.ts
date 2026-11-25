import { describe, expect, test } from 'vitest';
import { closesPanel } from '../../src/studio/experience/panelSwipe.ts';
import { SWIPE } from '../../src/studio/experience/swipe.ts';

describe('panel swipe', () => {
	test('a bottom sheet closes on a downward pull, not a sideways or upward one', () => {
		expect(closesPanel('bottom', 0, SWIPE.distance)).toBe(true);
		expect(closesPanel('bottom', 30, 90)).toBe(true);
		expect(closesPanel('bottom', 0, SWIPE.distance - 1)).toBe(false);
		expect(closesPanel('bottom', 0, -SWIPE.distance)).toBe(false);
		expect(closesPanel('bottom', SWIPE.distance, 0)).toBe(false);
		// Mostly sideways is a swipe across the panel, not a pull into the dock.
		expect(closesPanel('bottom', 40, 50)).toBe(false);
	});

	test('a right dock closes on a pull right, a left dock on a pull left', () => {
		expect(closesPanel('right', SWIPE.distance, 0)).toBe(true);
		expect(closesPanel('right', 90, 30)).toBe(true);
		expect(closesPanel('right', -SWIPE.distance, 0)).toBe(false);
		expect(closesPanel('right', 0, SWIPE.distance)).toBe(false);
		expect(closesPanel('left', -SWIPE.distance, 0)).toBe(true);
		expect(closesPanel('left', -90, -30)).toBe(true);
		expect(closesPanel('left', SWIPE.distance, 0)).toBe(false);
		expect(closesPanel('left', -30, 60)).toBe(false);
	});

	test('no short drag closes any dock', () => {
		for (const edge of ['bottom', 'left', 'right'] as const)
			expect(closesPanel(edge, 20, 20)).toBe(false);
	});
});
