import { describe, expect, test } from 'vitest';
import {
	ESTIMATED_HIP,
	TEST_MOUNT,
	mountView,
	mountedFrame,
	placeRider,
	riderContact,
	sampleMountFrame,
	type MountId,
	type MountView
} from '../../src/studio/experience/mounts.ts';
import type { DirectionName } from '../../src/lib/store/manifest.ts';
import { DIRECTIONS } from '../../src/lib/rig/rig.ts';
import type { Img } from '../../src/lib/image/png.ts';

const view = (id: MountId, direction: DirectionName, height = 50) => {
	const result = mountView(id, direction, height);
	if (!result.ok) throw new Error(result.reason);
	return result.view;
};
const alpha = (image: { w: number; data: Uint8ClampedArray }, x: number, y: number) =>
	image.data[(y * image.w + x) * 4 + 3];
const painted = (image: { data: Uint8ClampedArray }) =>
	image.data.some((value, i) => i % 4 === 3 && value > 0);

describe('mount preview fixture', () => {
	test('exposes one open saddle and rejects the removed covered seat', () => {
		expect(TEST_MOUNT).toBe('narrow-saddle');
		const result = mountView('shell' as MountId, 'east', 50);
		expect(result).toEqual({
			ok: false,
			reason: 'Unknown mount fixture: shell',
			missingView: false
		});
	});

	test('declares every facing without substituting the east view', () => {
		expect(DIRECTIONS).toHaveLength(8);
		for (const direction of DIRECTIONS) {
			const result = view(TEST_MOUNT, direction);
			expect(result.fixture).toBe(TEST_MOUNT);
			expect(result.direction).toBe(direction);
		}
	});

	test('rejects nonfinite and out-of-range heights before drawing', () => {
		for (const height of [Number.NaN, Infinity, -Infinity, -1, 0, 7.9, 256.1, Number.MAX_VALUE]) {
			const result = mountView(TEST_MOUNT, 'east', height);
			expect(result).toEqual({
				ok: false,
				reason: 'Open saddle needs a standing height from 8 to 256 px',
				missingView: false
			});
		}
	});

	test('draws bounded integer geometry in all eight directions at the rider pixel size', () => {
		for (const height of [8, 32, 50, 63, 256])
			for (const direction of DIRECTIONS) {
				const result = view(TEST_MOUNT, direction, height),
					[first] = result.frames;
				for (const frame of result.frames) {
					expect(frame.back.w).toBe(first.back.w);
					expect(frame.back.h).toBe(first.back.h);
					expect(frame.front.w).toBe(first.back.w);
					expect(frame.front.h).toBe(first.back.h);
					expect(frame.ground).toEqual(first.ground);
					expect(frame.ground.y).toBe(frame.back.h);
					expect(frame.seat.y).toBeLessThan(frame.ground.y);
					expect(painted(frame.back) && painted(frame.front)).toBe(true);
					for (const value of [
						frame.back.w,
						frame.back.h,
						frame.ground.x,
						frame.ground.y,
						frame.seat.x,
						frame.seat.y
					]) {
						expect(Number.isFinite(value) && Number.isInteger(value)).toBe(true);
						expect(value).toBeGreaterThanOrEqual(0);
						expect(value).toBeLessThanOrEqual(2 * height + 8);
					}
					expect(frame.seat.x).toBeLessThan(frame.back.w);
					const bottom = frame.back.h - 1;
					expect([...Array(frame.back.w)].some((_, x) => alpha(frame.back, x, bottom))).toBe(true);
					if (height === 50) expect(alpha(frame.back, frame.ground.x, bottom)).toBe(0);
				}
				expect(new Set(result.frames.map((frame) => frame.seat.y)).size).toBeGreaterThan(1);
			}
		expect(view(TEST_MOUNT, 'east', 64).frames[0].back.w).toBeGreaterThan(
			view(TEST_MOUNT, 'east', 32).frames[0].back.w
		);
	});

	test('mirrors every pixel and pixel-edge anchor for westward facings', () => {
		const mirroredPixels = (image: Img) => {
			const pixels = new Uint8ClampedArray(image.data.length);
			for (let y = 0; y < image.h; y++)
				for (let x = 0; x < image.w; x++) {
					const source = (y * image.w + x) * 4;
					pixels.set(image.data.subarray(source, source + 4), (y * image.w + image.w - 1 - x) * 4);
				}
			return pixels;
		};
		for (const [east, west] of [
			['east', 'west'],
			['south-east', 'south-west'],
			['north-east', 'north-west']
		] as const)
			for (const height of [32, 50, 63]) {
				const source = view(TEST_MOUNT, east, height),
					mirrored = view(TEST_MOUNT, west, height);
				for (const [index, frame] of source.frames.entries()) {
					const target = mirrored.frames[index];
					for (const layer of ['back', 'front'] as const) {
						expect(target[layer].w).toBe(frame[layer].w);
						expect(target[layer].h).toBe(frame[layer].h);
						expect(target[layer].data).toEqual(mirroredPixels(frame[layer]));
					}
					expect(target.ground).toEqual({ x: frame.back.w - frame.ground.x, y: frame.ground.y });
					expect(target.seat).toEqual({ x: frame.back.w - frame.seat.x, y: frame.seat.y });
					expect(target.ms).toBe(frame.ms);
				}
			}
	});

	test('authors distinct front and rear silhouettes with northern heads behind the rider', () => {
		const signature = (direction: DirectionName) => {
			const { back, front } = view(TEST_MOUNT, direction).frames[0];
			return JSON.stringify([back.w, back.h, Array.from(back.data), Array.from(front.data)]);
		};
		expect(new Set(DIRECTIONS.map(signature)).size).toBe(8);
		for (const direction of ['north', 'north-east', 'north-west'] as const) {
			const { back, front, seat } = view(TEST_MOUNT, direction).frames[0];
			let headBehind = false;
			for (let y = 0; y < seat.y - 5; y++)
				for (let x = 0; x < back.w; x++) {
					if (alpha(back, x, y)) headBehind = true;
					expect(alpha(front, x, y)).toBe(0);
				}
			expect(headBehind).toBe(true);
		}
		for (const direction of DIRECTIONS) {
			const { front, seat } = view(TEST_MOUNT, direction).frames[0];
			let widest = 0;
			for (let y = 0; y < front.h; y++) {
				let width = 0;
				for (let x = 0; x < front.w; x++) {
					width = alpha(front, x, y) ? width + 1 : 0;
					widest = Math.max(widest, width);
					if (y > seat.y + 25) expect(alpha(front, x, y)).toBe(0);
				}
			}
			expect(widest).toBeLessThanOrEqual(20);
		}
	});

	test('keeps the north saddle and contact on the raised seat throughout the gait', () => {
		for (const [height, seatY] of [
			[8, 8],
			[32, 19],
			[38, 23],
			[50, 29],
			[63, 35],
			[256, 134]
		]) {
			const frames = view(TEST_MOUNT, 'north', height).frames;
			for (const [index, bob] of [0, -1, 0, 1].entries()) {
				const frame = frames[index];
				expect(frame.seat.y).toBe(seatY + bob);
				expect(frame.ground).toEqual(frames[0].ground);
				for (const [image, row] of [
					[frame.back, frame.seat.y],
					[frame.front, frame.seat.y - 3]
				] as const) {
					const offset = (row * image.w + frame.seat.x) * 4;
					expect([...image.data.subarray(offset, offset + 4)]).toEqual([112, 70, 46, 255]);
				}
			}
		}
	});

	test('reuses the drawn view for the same rounded size', () => {
		expect(view(TEST_MOUNT, 'south-east')).toBe(view(TEST_MOUNT, 'south-east'));
		expect(view(TEST_MOUNT, 'north', 49.8)).toBe(view(TEST_MOUNT, 'north', 50));
	});
});

describe('mount seat sampling', () => {
	test('is deterministic, loops on its own timeline and ignores the rider clock', () => {
		for (const direction of DIRECTIONS) {
			const v = view(TEST_MOUNT, direction);
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
		}
	});

	test('rejects a broken gait instead of guessing a frame', () => {
		const broken: MountView = { ...view(TEST_MOUNT, 'east'), frames: [] };
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

	test('a fitted State without a hip anchor sits on its measured hips, mirrored for a reflected facing', () => {
		const hips = [
			{ label: 'LEFT HIP', x: 0.25, y: 0.5 },
			{ label: 'RIGHT HIP', x: 0.5, y: 0.5 }
		];
		const fitted = {
			...rig,
			cell: { w: 64, h: 64 },
			directions: [{ id: 'east' as const }, { id: 'west' as const, mirrorOf: 'east' as const }],
			animations: [
				{ id: 'riding', cells: 1, loop: false, frames: [], sources: { east: { measured: [hips] } } }
			]
		} as unknown as Parameters<typeof riderContact>[0];
		expect(riderContact(fitted, frame, 'riding', 'east', 0, ground, 50)).toEqual({
			x: 40 - 32 + 24,
			y: 70 - 64 + 32,
			source: 'joints'
		});
		expect(riderContact(fitted, frame, 'riding', 'west', 0, ground, 50)).toEqual({
			x: 40 - 32 + 40,
			y: 70 - 64 + 32,
			source: 'joints'
		});
	});

	test('translates the whole rider by whole pixels and follows the seat bob only', () => {
		for (const direction of DIRECTIONS) {
			const v = view(TEST_MOUNT, direction);
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
		}
	});

	test('fits the mount and every bobbing rider position without moving the ground', () => {
		for (const direction of DIRECTIONS) {
			const v = view(TEST_MOUNT, direction);
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
				expect(ground.x - fitted.x + fitted.w).toBeGreaterThanOrEqual(
					Math.max(mount.x + f.back.w, ground.x - body.x + rider.x + body.w)
				);
				expect(ground.y - fitted.y + fitted.h).toBeGreaterThanOrEqual(
					ground.y - body.y + rider.y + body.h
				);
			}
			expect(fitted.w).toBeGreaterThanOrEqual(v.frames[0].back.w);
		}
	});
});
