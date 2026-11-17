import { describe, expect, test } from 'vitest';
import {
	ESTIMATED_HIP,
	MOUNTS,
	mountView,
	mountedFrame,
	placeRider,
	riderContact,
	sampleMountFrame,
	type MountId,
	type MountView
} from '../../src/studio/experience/mounts.ts';
import type { DirectionName } from '../../src/lib/store/manifest.ts';

const view = (id: MountId, direction: DirectionName, height = 50) => {
	const result = mountView(id, direction, height);
	if (!result.ok) throw new Error(result.reason);
	return result.view;
};
const alpha = (image: { w: number; data: Uint8ClampedArray }, x: number, y: number) =>
	image.data[(y * image.w + x) * 4 + 3];
const painted = (image: { data: Uint8ClampedArray }) =>
	image.data.some((value, i) => i % 4 === 3 && value > 0);

describe('mount preview fixtures', () => {
	test('describe both seats in plain words', () => {
		expect(MOUNTS.map((fixture) => fixture.label)).toEqual(['Open seat', 'Covered seat']);
		expect(MOUNTS[0].detail).toContain('legs would straddle');
		expect(MOUNTS[1].detail).toContain('front wall hides');
	});

	test('cover only their authored views and name a missing one instead of borrowing it', () => {
		for (const fixture of MOUNTS) {
			expect(fixture.views).toEqual(['east', 'south-east']);
			for (const direction of ['west', 'north', 'south', 'north-east'] as const) {
				const result = mountView(fixture.id, direction, 50);
				expect(result.ok).toBe(false);
				if (!result.ok) {
					expect(result.reason).toMatch(/has no .+ view; mount hidden/);
					expect(result.missingView).toBe(true);
				}
			}
		}
		const short = mountView('narrow-saddle', 'east', Number.NaN);
		expect(short.ok).toBe(false);
		if (!short.ok) expect(short.missingView).toBe(false);
	});

	test('draw at the rider pixel size with fixed ground, painted layers and a seat above it', () => {
		for (const fixture of MOUNTS)
			for (const direction of fixture.views) {
				const v = view(fixture.id, direction);
				const [first] = v.frames;
				for (const frame of v.frames) {
					expect(frame.back.w).toBe(first.back.w);
					expect(frame.front.h).toBe(first.back.h);
					// Ground contact never bobs: the gait moves the body and the seat only.
					expect(frame.ground).toEqual(first.ground);
					expect(frame.seat.y).toBeLessThan(frame.ground.y);
					expect(painted(frame.back) && painted(frame.front)).toBe(true);
					// The ground edge is the image bottom; feet reach it, the space between them stays clear.
					expect(frame.ground.y).toBe(frame.back.h);
					const bottom = frame.back.h - 1;
					expect(alpha(frame.back, frame.ground.x, bottom)).toBe(0);
					expect([...Array(frame.back.w)].some((_, x) => alpha(frame.back, x, bottom))).toBe(true);
				}
				expect(new Set(v.frames.map((f) => f.seat.y)).size).toBeGreaterThan(1);
			}
		expect(view('shell', 'east', 64).frames[0].back.w).toBeGreaterThan(
			view('shell', 'east', 32).frames[0].back.w
		);
	});

	test('reuse the drawn view for the same size', () => {
		expect(view('shell', 'south-east')).toBe(view('shell', 'south-east'));
	});
});

describe('mount seat sampling', () => {
	test('is deterministic, loops on its own timeline and ignores the rider clock', () => {
		const v = view('narrow-saddle', 'east');
		const total = v.frames.reduce((sum, f) => sum + f.ms, 0);
		const at = (ms: number) => sampleMountFrame(v, ms);
		expect(v.frames.map((_, i) => at(i * v.frames[0].ms))).toEqual([0, 1, 2, 3]);
		expect(at(v.frames[0].ms - 1)).toBe(0);
		expect(at(total + 1)).toBe(at(1));
		expect(at(-50)).toBe(0);
		expect(at(Number.NaN)).toBe(0);
		expect([...Array(20)].map((_, i) => at(i * 37))).toEqual(
			[...Array(20)].map((_, i) => at(i * 37))
		);
	});

	test('rejects a broken gait instead of guessing a frame', () => {
		const broken: MountView = { ...view('shell', 'east'), frames: [] };
		expect(() => sampleMountFrame(broken, 0)).toThrow(/invalid animation timeline/);
	});
});

describe('rider placement', () => {
	const rig = { pivot: { x: 32, y: 64 } };
	const frame = { x: 40, y: 70 };
	const ground = { x: 40.5, y: 70 };

	test('uses the move hip anchor when present and discloses an estimate otherwise', () => {
		const anchors = { hip: { ride: { east: [[31, 40] as [number, number]] } } };
		expect(riderContact({ ...rig, anchors }, frame, 'ride', 'east', 0, ground, 50)).toEqual({
			x: 39.5,
			y: 46.5,
			source: 'hip'
		});
		expect(riderContact({ ...rig, anchors }, frame, 'ride', 'south-east', 0, ground, 50)).toEqual({
			x: ground.x,
			y: ground.y - 50 * ESTIMATED_HIP,
			source: 'estimate'
		});
	});

	test('translates the whole rider by whole pixels and follows the seat bob only', () => {
		const v = view('narrow-saddle', 'east');
		const contact = { x: 40, y: 47.5 };
		const places = v.frames.map((f) => placeRider(ground, contact, f));
		for (const [i, p] of places.entries()) {
			for (const n of [p.mount.x, p.mount.y, p.rider.x, p.rider.y])
				expect(Number.isInteger(n)).toBe(true);
			expect(p.mount).toEqual(places[0].mount);
			expect(p.rider.y - places[0].rider.y).toBe(v.frames[i].seat.y - v.frames[0].seat.y);
			expect(p.rider.x).toBe(places[0].rider.x);
		}
		// The rider contact lands on the seat, within the half-pixel snap.
		const [f] = v.frames,
			[p] = places;
		expect(Math.abs(contact.x + p.rider.x - (p.mount.x + f.seat.x))).toBeLessThanOrEqual(0.5);
		expect(Math.abs(contact.y + p.rider.y - (p.mount.y + f.seat.y))).toBeLessThanOrEqual(0.5);
	});

	test('fits the mount and every bobbing rider position without moving the ground', () => {
		const v = view('shell', 'east');
		const body = { w: 30, h: 50, x: 15, y: 50 };
		const contact = { x: ground.x, y: ground.y - 22 };
		const fitted = mountedFrame(body, ground, v, contact);
		for (const f of v.frames) {
			const { mount, rider } = placeRider(ground, contact, f);
			expect(ground.x - fitted.x).toBeLessThanOrEqual(
				Math.min(mount.x, ground.x - body.x + rider.x)
			);
			expect(ground.y - fitted.y).toBeLessThanOrEqual(
				Math.min(mount.y, ground.y - body.y + rider.y)
			);
			expect(ground.y - fitted.y + fitted.h).toBeGreaterThanOrEqual(mount.y + f.back.h);
		}
		expect(fitted.w).toBeGreaterThanOrEqual(v.frames[0].back.w);
	});
});
