import { describe, expect, test } from 'vitest';
import { Joystick } from '../../src/lib/input/joystick.ts';
import { MOTION } from '../../src/studio/experience/config.ts';
import {
	attackTravelScale,
	directionInfo,
	integrateMovement,
	keyboardVector,
	nearestDirection,
	travelSpeed,
	unit
} from '../../src/studio/experience/movement.ts';

describe('shared world movement', () => {
	test('only grounded attacks on foot scale travel and gait to 80%', () => {
		const onFoot = { grounded: true, attacking: true, mounted: false, ridingPose: false };
		expect(attackTravelScale(onFoot)).toBe(0.8);
		expect(attackTravelScale({ ...onFoot, attacking: false })).toBe(1);
		expect(attackTravelScale({ ...onFoot, grounded: false })).toBe(1);
		expect(attackTravelScale({ ...onFoot, mounted: true })).toBe(1);
		expect(attackTravelScale({ ...onFoot, ridingPose: true })).toBe(1);
	});

	test('mode-relative walking and 130% mounted travel preserve analog strength', () => {
		for (const [mode, axis, walking] of [
			['topdown', 'xy', 300],
			['side', 'x', 150]
		] as const) {
			const stick = new Joystick({ axis, travel: 40, deadZone: 8, follow: false });
			stick.begin(1, { x: 0, y: 0 });
			for (const mounted of [false, true]) {
				const speed = travelSpeed(mode, mounted);
				expect(speed).toBeCloseTo(walking * (mounted ? 1.3 : 1));
				for (const strength of [0, 0.25, 0.5, 1]) {
					const { value } = stick.move(1, { x: 8 + 32 * strength, y: 0 });
					let position = { x: 0, y: 0 },
						camera = { x: 0, y: 0 };
					for (let frame = 0; frame < 60; frame++)
						({ position, camera } = integrateMovement(
							position,
							camera,
							value,
							1 / 60,
							speed,
							MOTION.cameraResponse
						));
					expect(position.x).toBeCloseTo(speed * strength);
					expect(position.y).toBe(0);
				}
			}
		}
	});

	test('keyboard chords normalize, opposite keys cancel, and side view projects onto the ground axis', () => {
		const diagonal = keyboardVector(new Set(['W', 'ArrowRight']));
		expect(diagonal.x).toBeCloseTo(Math.SQRT1_2);
		expect(diagonal.y).toBeCloseTo(Math.SQRT1_2);
		expect(keyboardVector(new Set(['w', 's', 'a', 'd']))).toEqual({ x: 0, y: 0 });
		expect(keyboardVector(new Set(['w', 'd']), true)).toEqual({ x: 1, y: 0 });
		expect(keyboardVector(new Set(['w']), true)).toEqual({ x: 0, y: 0 });
	});

	test('sparse E/W sets remember vertical ties while intentional one-direction characters always face their declared way', () => {
		expect(nearestDirection(['east', 'west'], { x: 0, y: 1 }, 'west')).toBe('west');
		expect(nearestDirection(['west', 'east'], { x: 0, y: -1 }, undefined, undefined, 'east')).toBe(
			'east'
		);
		expect(nearestDirection(['north'], { x: 0, y: -1 })).toBe('north');
	});

	test('cardinal ties prefer displayed, then intended, then default, then stable compass order', () => {
		const directions = ['north', 'east', 'west', 'south'];
		expect(nearestDirection(directions, { x: 1, y: 1 }, 'north', 'east', 'east')).toBe('north');
		expect(nearestDirection(directions, { x: 1, y: 1 }, 'west', 'north', 'east')).toBe('north');
		expect(nearestDirection(directions, { x: 1, y: 1 }, 'west', 'south', 'north')).toBe('north');
		expect(nearestDirection(directions, { x: 1, y: 1 })).toBe('east');
		expect(nearestDirection(directions, { x: 1, y: 0.98 }, 'north')).toBe('east');
	});

	test('irregular sets use actual angles, and legacy compass aliases preserve supplied IDs', () => {
		expect(nearestDirection(['south', 'north-east', 'west'], { x: 1, y: 0 })).toBe('north-east');
		expect(nearestDirection(['southwest', 'northeast'], { x: 1, y: 1 })).toBe('northeast');
		expect(directionInfo('northwest')?.id).toBe('north-west');
		expect(nearestDirection(['unregistered'], { x: 1, y: 0 })).toBeNull();
		expect(nearestDirection([], { x: 1, y: 0 })).toBeNull();
	});

	test('invalid vectors and dead zones never reach angle arithmetic as NaN', () => {
		expect(unit({ x: NaN, y: 1 })).toEqual({ x: 0, y: 0 });
		expect(unit({ x: 0.01, y: 0 }, 0.1)).toEqual({ x: 0, y: 0 });
		expect(nearestDirection(['south'], { x: Infinity, y: 1 })).toBeNull();
	});

	test('simulation integrates actual velocity independently of sprite coverage and bounds long frame gaps', () => {
		const position = { x: 0, y: 0 },
			camera = { x: 0, y: 0 };
		const step = integrateMovement(position, camera, { x: 0, y: -1 }, 10, 100, 7);
		expect(step.position).toEqual({ x: 0, y: -5 });
		expect(step.camera.y).toBeLessThan(0);
		expect(step.camera.y).toBeGreaterThan(-5);
		expect(position).toEqual({ x: 0, y: 0 });
		expect(integrateMovement(position, camera, { x: NaN, y: 0 }, 0.05).position).toEqual(position);
	});

	test('a leading camera trails a steady walk by only the unled share of the eased lag, then settles on the actor', () => {
		const walk = (lead: number) => {
			let position = { x: 0, y: 0 },
				camera = { x: 0, y: 0 };
			for (let frame = 0; frame < 120; frame++)
				({ position, camera } = integrateMovement(
					position,
					camera,
					{ x: 0, y: -1 },
					1 / 60,
					300,
					9,
					lead
				));
			const walking = camera.y - position.y;
			for (let frame = 0; frame < 120; frame++)
				({ position, camera } = integrateMovement(
					position,
					camera,
					{ x: 0, y: 0 },
					1 / 60,
					300,
					9,
					lead
				));
			return { walking, stopped: camera.y - position.y };
		};
		const eased = walk(0),
			led = walk(MOTION.cameraLead);
		// About speed / response behind with a plain ease, and only a quarter of that with the lead.
		expect(eased.walking).toBeGreaterThan(25);
		expect(led.walking).toBeGreaterThan(0);
		expect(led.walking).toBeLessThan(eased.walking * (1 - MOTION.cameraLead));
		expect(Math.abs(led.stopped)).toBeLessThan(0.1);
		expect(
			integrateMovement({ x: 0, y: 0 }, { x: 0, y: 0 }, { x: NaN, y: 0 }, 0.05, 300, 9, 1).camera
		).toEqual({
			x: 0,
			y: 0
		});
	});
});
