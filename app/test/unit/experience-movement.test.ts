import { describe, expect, test } from 'vitest';
import { directionInfo, integrateMovement, keyboardVector, nearestDirection, pointerVector, unit } from '../../src/studio/experience/movement.ts';

describe('shared world movement', () => {
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
    expect(nearestDirection(['west', 'east'], { x: 0, y: -1 }, undefined, undefined, 'east')).toBe('east');
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
    expect(pointerVector(NaN, 1, 40)).toEqual({ x: 0, y: 0 });
  });

  test('joystick displacement converts screen y and preserves analogue speed without diagonal overspeed', () => {
    expect(pointerVector(2, 2, 40)).toEqual({ x: 0, y: 0 });
    expect(pointerVector(20, 0, 40)).toEqual({ x: 0.5, y: -0 });
    const diagonal = pointerVector(40, -40, 40);
    expect(Math.hypot(diagonal.x, diagonal.y)).toBeCloseTo(1);
    expect(diagonal.y).toBeGreaterThan(0);
    expect(pointerVector(0, 40, 40, 0.12, true)).toEqual({ x: 0, y: 0 });
  });

  test('simulation integrates actual velocity independently of sprite coverage and bounds long frame gaps', () => {
    const position = { x: 0, y: 0 }, camera = { x: 0, y: 0 };
    const step = integrateMovement(position, camera, { x: 0, y: -1 }, 10, 100, 7);
    expect(step.position).toEqual({ x: 0, y: -5 });
    expect(step.camera.y).toBeLessThan(0);
    expect(step.camera.y).toBeGreaterThan(-5);
    expect(position).toEqual({ x: 0, y: 0 });
    expect(integrateMovement(position, camera, { x: NaN, y: 0 }, 0.05).position).toEqual(position);
  });
});
