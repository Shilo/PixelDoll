import { describe, expect, test } from 'vitest';
import {
	IDLE,
	Joystick,
	JOYSTICK_TYPES,
	joystickTravel,
	type JoystickOptions
} from '../../src/lib/input/joystick.ts';

const options: JoystickOptions = { axis: 'xy', travel: 40, deadZone: 8, follow: false };
const started = (overrides: Partial<JoystickOptions> = {}) => {
	const stick = new Joystick({ ...options, ...overrides });
	stick.begin(1, { x: 100, y: 100 });
	return stick;
};
const length = (p: { x: number; y: number }) => Math.hypot(p.x, p.y);

describe('joystick', () => {
	test('full throw stops with the thumb edge inside the ring stroke', () => {
		expect(joystickTravel({ base: 144, thumb: 48, stroke: 2 })).toBe(46);
		expect(joystickTravel({ base: 128, thumb: 44, stroke: 2 })).toBe(40);
	});

	test('the thumb stays inside a circle, not a square, at every angle', () => {
		const stick = started();
		for (let angle = 0; angle < Math.PI * 2; angle += Math.PI / 12) {
			const s = stick.move(1, { x: 100 + Math.cos(angle) * 90, y: 100 + Math.sin(angle) * 90 });
			expect(length(s.offset)).toBeCloseTo(40);
			expect(length(s.value)).toBeCloseTo(1);
		}
		// The old per-axis clamp put a diagonal thumb 56.6 px out.
		const diagonal = stick.move(1, { x: 140, y: 140 });
		expect(diagonal.offset.x).toBeCloseTo(28.28, 2);
		expect(diagonal.offset.y).toBeCloseTo(28.28, 2);
		expect(diagonal.origin).toEqual({ x: 100, y: 100 });
	});

	test('the radial dead zone is rescaled so speed rises from zero to full', () => {
		const stick = started(),
			at = (x: number) => stick.move(1, { x: 100 + x, y: 100 }).value.x;
		expect(at(0)).toBe(0);
		expect(at(8)).toBe(0);
		expect(at(9)).toBeCloseTo(1 / 32);
		expect(at(24)).toBeCloseTo(0.5);
		expect(at(40)).toBe(1);
		expect(at(400)).toBe(1);
		const below = stick.move(1, { x: 103, y: 105 });
		expect(below.value).toEqual({ x: 0, y: 0 });
		expect(below.offset).toEqual({ x: 3, y: 5 });
		// Screen space: dragging up gives negative y.
		expect(stick.move(1, { x: 100, y: 60 }).value).toEqual({ x: 0, y: -1 });
	});

	test('follow drags the base past full throw so reversing takes at most one throw', () => {
		const stick = started({ follow: true });
		const far = stick.move(1, { x: 200, y: 100 });
		expect(far.origin).toEqual({ x: 160, y: 100 });
		expect(far.offset).toEqual({ x: 40, y: 0 });
		expect(stick.move(1, { x: 200, y: 100 }).origin).toEqual({ x: 160, y: 100 });
		// Back across the moved center: full speed the other way after one throw, not after the 100 px overshoot.
		expect(stick.move(1, { x: 120, y: 100 }).value.x).toBe(-1);
		expect(stick.snapshot.origin).toEqual({ x: 160, y: 100 });
	});

	test('a horizontal track ignores vertical drag for direction, strength and following', () => {
		const stick = started({ axis: 'x', follow: true });
		expect(stick.move(1, { x: 100, y: 300 }).value).toEqual({ x: 0, y: 0 });
		const half = stick.move(1, { x: 124, y: -500 });
		expect(half.value.x).toBeCloseTo(0.5);
		expect(half.value.y).toBe(0);
		expect(half.offset.y).toBe(0);
		expect(stick.move(1, { x: 300, y: 900 }).origin).toEqual({ x: 260, y: 100 });
	});

	test('only the owning pointer drives it, and lifting or invalid input stops it', () => {
		const stick = started();
		expect(stick.begin(2, { x: 0, y: 0 }).pointerId).toBe(1);
		stick.move(1, { x: 140, y: 100 });
		expect(stick.move(2, { x: 0, y: 0 }).value.x).toBe(1);
		expect(stick.end(2).pointerId).toBe(1);
		expect(stick.end(1)).toBe(IDLE);
		expect(stick.cancel()).toBe(IDLE);
		expect(stick.begin(3, { x: NaN, y: 0 })).toBe(IDLE);
		stick.begin(3, { x: 0, y: 0 });
		expect(stick.move(3, { x: Infinity, y: 0 })).toBe(IDLE);
	});

	test('a resting stick takes presses only within its activation radius and returns to rest', () => {
		const rest = { x: 300, y: 500 };
		// The touch Attack stick: centers on the press, follows past the rim, snaps back on release.
		const stick = new Joystick({ ...options, rest, activationRadius: 56, follow: true });
		expect(stick.snapshot).toEqual({ ...IDLE, origin: rest });
		expect(stick.contains({ x: 300, y: 557 })).toBe(false);
		expect(stick.begin(1, { x: 360, y: 500 }).pointerId).toBeNull();
		const pressed = stick.begin(1, { x: 320, y: 510 });
		expect(pressed).toMatchObject({
			pointerId: 1,
			origin: { x: 320, y: 510 },
			value: { x: 0, y: 0 }
		});
		expect(stick.pressed).toBe(true);
		expect(stick.move(1, { x: 420, y: 510 }).origin).toEqual({ x: 380, y: 510 });
		expect(stick.end(1)).toEqual({ ...IDLE, origin: rest });
		expect(stick.pressed).toBe(false);
		// Without its own radius, a resting stick accepts presses within its throw.
		expect(new Joystick({ ...options, rest }).contains({ x: 341, y: 500 })).toBe(false);
	});

	test('a fixed stick keeps its base at rest and gives output from the press itself', () => {
		const rest = { x: 100, y: 100 };
		const fixed = new Joystick({ ...options, ...JOYSTICK_TYPES.fixed, rest, activationRadius: 60 });
		const pressed = fixed.begin(1, { x: 140, y: 100 });
		expect(pressed.origin).toEqual(rest);
		expect(pressed.value).toEqual({ x: 1, y: 0 });
		expect(fixed.move(1, { x: 300, y: 100 }).origin).toEqual(rest);
		// The follow type drags the same resting base along instead.
		const follow = new Joystick({
			...options,
			...JOYSTICK_TYPES.follow,
			rest,
			activationRadius: 60
		});
		follow.begin(1, { x: 140, y: 100 });
		expect(follow.move(1, { x: 300, y: 100 }).origin).toEqual({ x: 260, y: 100 });
	});

	test('invalid geometry fails loudly', () => {
		expect(() => new Joystick({ ...options, rest: { x: NaN, y: 0 } })).toThrow(RangeError);
		expect(() => new Joystick({ ...options, activationRadius: -1 })).toThrow(RangeError);
		expect(() => new Joystick({ ...options, deadZone: 40 })).toThrow(RangeError);
		expect(() => new Joystick({ ...options, travel: NaN })).toThrow(RangeError);
		expect(() => new Joystick({ ...options, deadZone: -1 })).toThrow(RangeError);
	});
});
