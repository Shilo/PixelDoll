import { describe, expect, test } from 'vitest';
import type { DirectionName, RigAnimation } from '../../src/lib/store/manifest.ts';
import { attackSector, resolveAttack } from '../../src/studio/experience/attack.ts';
import { project, unproject, type RenderOptions } from '../../src/studio/experience/ground.ts';
import {
	airborne,
	FLIGHT_SECONDS,
	flightPhase,
	GROUNDED,
	JUMP,
	launch,
	stepJump
} from '../../src/studio/experience/jump.ts';
import { ATTACK_GAP_MS, LiveActions } from '../../src/studio/experience/liveActions.ts';
import { liveClips } from '../../src/studio/experience/liveRoles.ts';
import type {
	BodySequence,
	PresentationAvailability
} from '../../src/studio/experience/presentation.ts';

const sequence = (clip: string, direction: DirectionName, ms = 100): BodySequence => ({
	clip,
	direction,
	frames: [
		{ cell: 0, ms },
		{ cell: 1, ms }
	],
	duration: 2 * ms
});
/** Just what attack resolution reads: which clips have art in which facings. */
function availability(
	directions: DirectionName[],
	clips: Record<string, DirectionName[]>
): PresentationAvailability {
	return {
		directions,
		animations: new Map(
			Object.entries(clips).map(([clip, facings]) => [
				clip,
				new Map(facings.map((facing) => [facing, sequence(clip, facing)]))
			])
		)
	} as unknown as PresentationAvailability;
}
const animations = (...ids: string[]) =>
	ids.map((id) => ({ id, cells: 2, loop: true, frames: [] }) as unknown as RigAnimation);

describe('jump', () => {
	test('peaks at the tuned height and lands on the floor at any frame rate', () => {
		// The scene steps at most 50 ms at a time (WorldStage), so 20 fps is the slowest step.
		for (const fps of [20, 30, 60, 144]) {
			let state = launch(GROUNDED),
				peak = 0,
				seconds = 0;
			while (airborne(state) && seconds < 2) {
				state = stepJump(state, 1 / fps);
				seconds += 1 / fps;
				peak = Math.max(peak, state.height);
			}
			expect(state).toEqual(GROUNDED);
			// The sampled peak is within one step of the apex, falling at most at the stronger falling gravity.
			const fall = ((2 * JUMP.height) / JUMP.apexSeconds ** 2) * JUMP.fallGravity;
			expect(peak).toBeLessThanOrEqual(JUMP.height + 1e-9);
			expect(peak).toBeGreaterThanOrEqual(JUMP.height - fall / fps ** 2 / 2);
			expect(seconds).toBeGreaterThanOrEqual(FLIGHT_SECONDS - 1e-9);
			expect(seconds).toBeLessThan(FLIGHT_SECONDS + 1 / fps + 1e-9);
		}
	});

	test('falls faster than it rises, and a jump in flight cannot jump again', () => {
		const apex = stepJump(launch(GROUNDED), JUMP.apexSeconds);
		expect(apex.height).toBeCloseTo(JUMP.height, 9);
		expect(flightPhase(apex)).toBeCloseTo(JUMP.apexSeconds / FLIGHT_SECONDS, 9);
		expect(FLIGHT_SECONDS - JUMP.apexSeconds).toBeLessThan(JUMP.apexSeconds);
		expect(launch(apex)).toBe(apex);
		expect(stepJump(GROUNDED, 1)).toBe(GROUNDED);
	});
});

describe('directional attack', () => {
	const clips = liveClips(animations('punch', 'uppercut'), { attackUp: 'uppercut' });

	test('top-down faces the nearest authored facing within 90° of the aim, never behind', () => {
		const a = availability(['south', 'east', 'north', 'west'], { punch: ['south', 'east'] });
		const facing = (aim: { x: number; y: number }) => {
			const choice = resolveAttack(a, clips, aim, { side: false, facing: 'west' });
			return 'sequence' in choice ? choice.sequence.direction : choice.failure;
		};
		expect(facing({ x: 1, y: -0.2 })).toBe('east');
		expect(facing({ x: 0.2, y: -1 })).toBe('south');
		expect(facing({ x: -1, y: 0 })).toEqual({
			kind: 'no-direction',
			move: 'punch',
			direction: 'west'
		});
		// No aim attacks along the facing it was given.
		expect(resolveAttack(a, clips, { x: 0, y: 0 }, { side: false, facing: 'east' })).toMatchObject({
			sequence: { direction: 'east' }
		});
		expect(
			resolveAttack(
				availability(['south'], {}),
				liveClips([]),
				{ x: 1, y: 0 },
				{
					side: false,
					facing: 'south'
				}
			)
		).toEqual({ failure: { kind: 'no-attack' } });
	});

	test('side-scroller keeps a side profile and plays Attack up when aimed up', () => {
		const a = availability(['east', 'west'], { punch: ['east', 'west'], uppercut: ['east'] });
		const attack = (aim: { x: number; y: number }, facing: DirectionName = 'east') =>
			resolveAttack(a, clips, aim, { side: true, facing });
		expect(attack({ x: 0.3, y: 1 })).toMatchObject({
			sequence: { clip: 'uppercut', direction: 'east' }
		});
		// Straight up keeps the last horizontal facing; the up clip has no west art, so Attack plays instead.
		expect(attack({ x: 0, y: 1 }, 'west')).toMatchObject({
			sequence: { clip: 'punch', direction: 'west' }
		});
		expect(attack({ x: -1, y: 0.2 })).toMatchObject({
			sequence: { clip: 'punch', direction: 'west' }
		});
		// Side view never shows a diagonal sprite for a level attack.
		const diagonal = availability(['east', 'north-east'], { punch: ['north-east'] });
		expect(resolveAttack(diagonal, clips, { x: 1, y: 0 }, { side: true, facing: 'east' })).toEqual({
			failure: { kind: 'no-direction', move: 'punch', direction: 'east' }
		});
		// A south-only rig aimed east names east, the aimed direction, not a facing it has.
		expect(
			resolveAttack(
				availability(['south'], { punch: ['south'] }),
				clips,
				{ x: 1, y: 0 },
				{
					side: false,
					facing: 'south'
				}
			)
		).toEqual({ failure: { kind: 'no-direction', move: 'punch', direction: 'east' } });
		expect(attackSector({ x: 1, y: -2 })).toBe('down');
		expect(attackSector({ x: 1, y: 1 })).toBe('level');
	});
});

describe('live actions', () => {
	test('one press is one attack; extra presses during it are ignored', () => {
		const actions = new LiveActions();
		actions.request({ x: 1, y: 0 });
		expect(actions.step(16)).toEqual({ x: 1, y: 0 });
		actions.start(sequence('punch', 'east'));
		actions.request({ x: -1, y: 0 });
		expect(actions.step(100)).toBeNull();
		expect(actions.attackCell()).toBe(1);
		expect(actions.step(100)).toBeNull();
		expect(actions.attack).toBeNull();
		expect(actions.step(100)).toBeNull();
	});

	test('a held attack repeats with fresh aim after each finished attack and the minimum gap', () => {
		const actions = new LiveActions();
		let aim = { x: 1, y: 0 };
		actions.hold('key', () => aim);
		expect(actions.step(0)).toEqual({ x: 1, y: 0 });
		actions.start(sequence('punch', 'east', 40));
		aim = { x: 0, y: 1 };
		expect(actions.step(80)).toBeNull(); // finished, but within the gap
		expect(actions.step(ATTACK_GAP_MS - 80)).toEqual({ x: 0, y: 1 });
		actions.refused();
		actions.release('key');
		expect(actions.step(ATTACK_GAP_MS)).toBeNull();
	});

	test('letting go stops repeats but the playing attack and jump finish; a paused scene holds still', () => {
		const actions = new LiveActions();
		actions.hold('mouse', () => ({ x: 1, y: 0 }));
		actions.step(0);
		actions.start(sequence('punch', 'east'));
		actions.takeOff();
		actions.letGo();
		const before = actions.jump;
		actions.step(0);
		expect(actions.jump).toEqual(before);
		expect(actions.grounded).toBe(false);
		actions.step(150);
		expect(actions.attack).not.toBeNull();
		for (let i = 0; i < 40; i++) actions.step(16);
		expect(actions.attack).toBeNull();
		expect(actions.grounded).toBe(true);
		expect(actions.step(ATTACK_GAP_MS)).toBeNull();
	});
});

describe('click to walk', () => {
	test('a clicked screen point maps back to the floor point drawn there', () => {
		for (const mode of ['topdown', 'side'] as const) {
			const options: RenderOptions = {
				width: 1280,
				height: 800,
				dpr: 1,
				theme: 'dark',
				mode,
				anchor: { x: 640, y: 620 },
				camera: { x: 30, y: 12 },
				eye: 300,
				zoom: { value: 1.5, anchor: { x: 600, y: 500 }, offset: { x: 10, y: -4 } }
			};
			const floor = { x: 140, y: mode === 'side' ? 12 : -60 };
			const back = unproject(project(floor, options), options, floor.y)!;
			expect(back.x).toBeCloseTo(floor.x, 6);
			expect(back.y).toBeCloseTo(floor.y, 6);
		}
		const above = unproject(
			{ x: 0, y: -10_000 },
			{
				width: 1280,
				height: 800,
				dpr: 1,
				theme: 'dark',
				mode: 'topdown',
				anchor: { x: 640, y: 620 },
				camera: { x: 0, y: 0 },
				eye: 300
			}
		);
		expect(above).toBeNull();
	});
});
