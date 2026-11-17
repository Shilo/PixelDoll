import { describe, expect, it } from 'vitest';
import { makeImg, type Img } from '../../src/lib/image/png.ts';
import { DEFAULT_MOVE, type Keypoint, type Rig, type Sha256 } from '../../src/lib/rig/rig.ts';
import { hideMountedLegs } from '../../src/studio/experience/mountLegs.ts';

const hash: Sha256 = 'sha256:standing';
const joints = (leftX = 0.3, rightX = 0.7): Keypoint[] =>
	['LEFT', 'RIGHT'].flatMap((side) =>
		['HIP', 'KNEE', 'LEG'].map((joint, index) => ({
			label: side + ' ' + joint,
			x: side === 'LEFT' ? leftX : rightX,
			y: [0.3, 0.5, 0.8][index]
		}))
	);

function makeRig(points = joints()): Rig {
	return {
		cell: { w: 20, h: 20 },
		pivot: { x: 10, y: 18 },
		baseItem: 'body',
		baseHash: hash,
		directions: [
			{ id: 'east' },
			{ id: 'west', mirrorOf: 'east' },
			{ id: 'north' },
			{ id: 'south' }
		],
		animations: [
			{
				id: 'walk',
				cells: 2,
				loop: true,
				frames: [
					{ cell: 1, ms: 100 },
					{ cell: 0, ms: 100 }
				],
				sources: {
					east: {
						route: 'skeleton-v3',
						reference: hash,
						measured: [points, joints(0.2, 0.3)],
						provenance: []
					}
				}
			}
		],
		rest: { east: { image: hash, keypoints: joints() } }
	};
}

function paint(image: Img, x: number, y: number, color = [255, 80, 20, 255]) {
	image.data.set(color, (y * image.w + x) * 4);
	return image;
}

const pixel = (image: Img, x: number, y: number) =>
	Array.from(image.data.slice((y * image.w + x) * 4, (y * image.w + x) * 4 + 4));

function rider() {
	const image = makeImg(20, 20);
	for (let y = 3; y <= 18; y++) {
		paint(image, 6, y);
		paint(image, 14, y, [20, 80, 255, 255]);
	}
	return image;
}

describe('mounted-leg experimental cutout', () => {
	it('cuts colored far candidates below hips, preserves near/outside pixels and source bytes', () => {
		const rig = makeRig(),
			image = rider(),
			original = image.data.slice(),
			savedRig = structuredClone(rig);
		const result = hideMountedLegs(image, rig.pivot, rig, 'walk', 'east', 0, 'far');
		expect(result.source).toBe('measured');
		expect(result.issue).toBeNull();
		expect(result.image).not.toBe(image);
		for (let y = 0; y < image.h; y++)
			for (let x = 0; x < image.w; x++)
				expect(pixel(result.image, x, y)).toEqual(
					x === 6 && y > 6 && y <= 18 ? [0, 0, 0, 0] : pixel(image, x, y)
				);
		expect(image.data).toEqual(original);
		expect(rig).toEqual(savedRig);
	});

	it('uses the union for both while preserving all pixels at and above average hips', () => {
		const rig = makeRig(),
			image = rider();
		const result = hideMountedLegs(image, rig.pivot, rig, 'walk', 'east', 0, 'both');
		for (const x of [6, 14]) {
			expect(pixel(result.image, x, 6)).toEqual(pixel(image, x, 6));
			expect(pixel(result.image, x, 10)).toEqual([0, 0, 0, 0]);
			expect(pixel(result.image, x, 19)).toEqual(pixel(image, x, 19));
		}
	});

	it('returns the exact original for none, even without usable geometry', () => {
		const rig = makeRig(),
			image = rider();
		rig.animations = [];
		expect(hideMountedLegs(image, { x: NaN, y: 0 }, rig, 'absent', 'east', -1, 'none')).toEqual({
			image,
			issue: null
		});
		expect(hideMountedLegs(image, rig.pivot, rig, 'walk', 'east', 0, 'none').image).toBe(image);
	});

	it.each(['north', 'south'] as const)(
		'leaves axial %s far unavailable explicitly',
		(direction) => {
			const rig = makeRig(),
				image = rider();
			const result = hideMountedLegs(image, rig.pivot, rig, 'walk', direction, 0, 'far');
			expect(result.image).toBe(image);
			expect(result.issue).toContain('north/south');
		}
	);

	it('uses the actual cell rather than playback index or frame zero', () => {
		const rig = makeRig(),
			image = paint(paint(makeImg(20, 20), 4, 10), 6, 10);
		const result = hideMountedLegs(image, rig.pivot, rig, 'walk', 'east', 1, 'far');
		expect(pixel(result.image, 4, 10)).toEqual([0, 0, 0, 0]);
		expect(pixel(result.image, 6, 10)).toEqual(pixel(image, 6, 10));
	});

	it('discloses per-cell requested fallback only where measurement is missing', () => {
		const rig = makeRig(),
			image = rider(),
			source = rig.animations[0].sources!.east!;
		source.measured = [joints()];
		source.keypoints = [joints(0.2, 0.8), joints()];
		const result = hideMountedLegs(image, rig.pivot, rig, 'walk', 'east', 1, 'far');
		expect(result.source).toBe('requested');
		expect(result.issue).toBeNull();
		expect(pixel(result.image, 6, 10)).toEqual([0, 0, 0, 0]);
	});

	it.each([
		'empty',
		'missing joint',
		'nan',
		'infinity',
		'out of range',
		'duplicate',
		'null',
		'undefined'
	])(
		'rejects present malformed measurements (%s) without borrowing requested/rest joints',
		(kind) => {
			const rig = makeRig(),
				image = rider(),
				source = rig.animations[0].sources!.east!;
			const points = joints();
			if (kind === 'missing joint') points.pop();
			if (kind === 'nan') points[0].x = NaN;
			if (kind === 'infinity') points[0].y = Infinity;
			if (kind === 'out of range') points[0].x = 1.01;
			if (kind === 'duplicate') points.push({ ...points[0] });
			source.measured = [
				kind === 'empty'
					? []
					: kind === 'null'
						? (null as unknown as Keypoint[])
						: kind === 'undefined'
							? (undefined as unknown as Keypoint[])
							: points
			];
			source.keypoints = [joints()];
			const result = hideMountedLegs(image, rig.pivot, rig, 'walk', 'east', 0, 'far');
			expect(result.image).toBe(image);
			expect(result.source).toBe('measured');
			expect(result.issue).toMatch(/Invalid measured/);
		}
	);

	it('never borrows rest or cell zero for animation cells without geometry', () => {
		const rig = makeRig(),
			image = rider();
		rig.animations[0].sources!.east!.measured = [joints()];
		for (const cell of [1, 2, -1, 0.5]) {
			const result = hideMountedLegs(image, rig.pivot, rig, 'walk', 'east', cell, 'far', {
				baseImage: hash
			});
			expect(result.image).toBe(image);
			expect(result.issue).not.toBeNull();
		}
		delete rig.animations[0].sources;
		rig.animations[0].cells = 1;
		expect(
			hideMountedLegs(image, rig.pivot, rig, 'walk', 'east', 0, 'far', { baseImage: hash }).image
		).toBe(image);
	});

	it('permits rest only for actual one-cell Default with matching standing provenance', () => {
		const rig = makeRig(),
			image = rider(),
			animation = rig.animations[0];
		animation.id = DEFAULT_MOVE;
		animation.cells = 1;
		delete animation.sources;
		const apply = (baseImage?: Sha256) =>
			hideMountedLegs(image, rig.pivot, rig, DEFAULT_MOVE, 'east', 0, 'far', { baseImage });
		expect(apply().image).toBe(image);
		expect(apply('sha256:other').image).toBe(image);
		expect(apply(hash).source).toBe('rest');
		animation.sources = {
			east: { route: 'import', reference: hash, motion: 'imported-rest', provenance: [] }
		};
		expect(apply('sha256:recolored').source).toBe('rest');
		animation.cells = 2;
		expect(apply(hash).image).toBe(image);
	});

	it('distinguishes independent west RIGHT from mirrored east LEFT with labels preserved', () => {
		const rig = makeRig(),
			image = paint(paint(makeImg(20, 20), 5, 10), 13, 10);
		const mirror = hideMountedLegs(image, rig.pivot, rig, 'walk', 'west', 0, 'far');
		expect(pixel(mirror.image, 13, 10)).toEqual([0, 0, 0, 0]);
		expect(pixel(mirror.image, 5, 10)).toEqual(pixel(image, 5, 10));
		rig.directions[1] = { id: 'west' };
		rig.animations[0].sources!.west = {
			route: 'import',
			reference: hash,
			measured: [joints(0.25, 0.65)],
			provenance: []
		};
		const independent = hideMountedLegs(image, rig.pivot, rig, 'walk', 'west', 0, 'far');
		expect(pixel(independent.image, 13, 10)).toEqual([0, 0, 0, 0]);
		expect(pixel(independent.image, 5, 10)).toEqual(pixel(image, 5, 10));
	});

	it('honors explicit displayed direction cells before mirror metadata', () => {
		const rig = makeRig(),
			image = rider();
		rig.animations[0].sources!.west = {
			route: 'import',
			reference: hash,
			measured: [joints()],
			provenance: []
		};
		const result = hideMountedLegs(image, rig.pivot, rig, 'walk', 'west', 0, 'far', {
			resolvedSource: 'west'
		});
		expect(pixel(result.image, 14, 10)).toEqual([0, 0, 0, 0]);
		expect(pixel(result.image, 6, 10)).toEqual(pixel(image, 6, 10));
	});

	it('reflects exact pixel indices in non-square cells, once per mirror hop', () => {
		const rig = makeRig(joints(0.2, 0.8));
		rig.cell = { w: 30, h: 10 };
		const image = paint(paint(makeImg(30, 10), 23, 5), 24, 5);
		const result = hideMountedLegs(image, rig.pivot, rig, 'walk', 'west', 0, 'far');
		expect(pixel(result.image, 23, 5)).toEqual([0, 0, 0, 0]);
		const narrowRig = makeRig(joints(0.5, 0.5));
		narrowRig.cell = { w: 30, h: 10 };
		const narrowImage = paint(paint(makeImg(30, 10), 14, 5), 15, 5);
		const exact = hideMountedLegs(
			narrowImage,
			narrowRig.pivot,
			narrowRig,
			'walk',
			'west',
			0,
			'both'
		);
		expect(pixel(exact.image, 14, 5)).toEqual([0, 0, 0, 0]);
		expect(pixel(exact.image, 15, 5)).toEqual(pixel(narrowImage, 15, 5));
		rig.directions.push({ id: 'south-west', mirrorOf: 'west' });
		const twice = hideMountedLegs(
			paint(makeImg(30, 10), 6, 5),
			rig.pivot,
			rig,
			'walk',
			'south-west',
			0,
			'far'
		);
		expect(pixel(twice.image, 6, 5)).toEqual([0, 0, 0, 0]);
	});

	it('preserves ties and nearer ownership, but both cuts the overlapping union', () => {
		const rig = makeRig(joints(0.5, 0.5)),
			image = paint(makeImg(20, 20), 10, 10);
		expect(hideMountedLegs(image, rig.pivot, rig, 'walk', 'east', 0, 'far').image).toBe(image);
		expect(
			pixel(hideMountedLegs(image, rig.pivot, rig, 'walk', 'east', 0, 'both').image, 10, 10)
		).toEqual([0, 0, 0, 0]);
		const closeRig = makeRig(joints(0.45, 0.5));
		expect(hideMountedLegs(image, closeRig.pivot, closeRig, 'walk', 'east', 0, 'far').image).toBe(
			image
		);
	});

	it('preserves ambiguous overlap within one pixel even when the far candidate is closer', () => {
		const rig = makeRig(joints(0.5, 0.525)),
			image = paint(makeImg(20, 20), 10, 10);
		expect(hideMountedLegs(image, rig.pivot, rig, 'walk', 'east', 0, 'far').image).toBe(image);
		expect(
			pixel(hideMountedLegs(image, rig.pivot, rig, 'walk', 'east', 0, 'both').image, 10, 10)
		).toEqual([0, 0, 0, 0]);
	});

	it('follows bent finite segments instead of clearing a leg bounding rectangle', () => {
		const points = joints(0.3, 0.4);
		points[1].x = 0.1;
		const rig = makeRig(points),
			image = paint(paint(paint(makeImg(20, 20), 2, 10), 6, 10), 6, 18);
		const result = hideMountedLegs(image, rig.pivot, rig, 'walk', 'east', 0, 'far');
		expect(pixel(result.image, 2, 10)).toEqual([0, 0, 0, 0]);
		expect(pixel(result.image, 6, 10)).toEqual(pixel(image, 6, 10));
		expect(pixel(result.image, 6, 18)).toEqual(pixel(image, 6, 18));
	});

	it('rejects malformed measurement containers and requested joints explicitly', () => {
		const rig = makeRig(),
			image = rider(),
			source = rig.animations[0].sources!.east!;
		source.keypoints = [joints()];
		source.measured = null as unknown as Keypoint[][];
		expect(hideMountedLegs(image, rig.pivot, rig, 'walk', 'east', 0, 'far')).toEqual({
			image,
			issue: 'Invalid measured mounted-leg frames.',
			source: 'measured'
		});
		delete source.measured;
		source.keypoints = [[]];
		expect(hideMountedLegs(image, rig.pivot, rig, 'walk', 'east', 0, 'far')).toEqual({
			image,
			issue: 'Invalid requested mounted-leg joints.',
			source: 'requested'
		});
	});

	it('cuts both in axial views with complete geometry but never infers far from axial source', () => {
		const rig = makeRig(),
			image = rider();
		rig.animations[0].sources!.north = rig.animations[0].sources!.east;
		expect(
			pixel(hideMountedLegs(image, rig.pivot, rig, 'walk', 'north', 0, 'both').image, 6, 10)
		).toEqual([0, 0, 0, 0]);
		rig.directions[0].mirrorOf = 'north';
		expect(hideMountedLegs(image, rig.pivot, rig, 'walk', 'east', 0, 'far').image).toBe(image);
	});

	it('maps composed pivots and geometrically deletes outfit pixels without shifting padded art', () => {
		const rig = makeRig(),
			image = makeImg(32, 28),
			frame = { x: 15, y: 21 };
		paint(image, 11, 13, [70, 90, 110, 128]);
		paint(image, 6, 10);
		paint(image, 30, 25);
		const result = hideMountedLegs(image, frame, rig, 'walk', 'east', 0, 'far');
		expect(pixel(result.image, 11, 13)).toEqual([0, 0, 0, 0]);
		expect(pixel(result.image, 6, 10)).toEqual(pixel(image, 6, 10));
		expect(pixel(result.image, 30, 25)).toEqual(pixel(image, 30, 25));
		expect([result.image.w, result.image.h]).toEqual([32, 28]);
	});

	it('clips negative and off-image geometry without allocation if nothing is cut', () => {
		const rig = makeRig(),
			image = paint(makeImg(2, 2), 0, 0);
		for (const frame of [
			{ x: -100, y: -100 },
			{ x: 100, y: 100 }
		])
			expect(hideMountedLegs(image, frame, rig, 'walk', 'east', 0, 'both').image).toBe(image);
		const clipped = hideMountedLegs(image, { x: 4, y: 8 }, rig, 'walk', 'east', 0, 'far');
		expect(clipped.image.data.length).toBe(16);
		expect(pixel(clipped.image, 0, 0)).toEqual([0, 0, 0, 0]);
	});

	it('fails safely for missing/cyclic directions, invalid source resolution and invalid dimensions/pivots', () => {
		const rig = makeRig(),
			image = rider();
		rig.directions[0].mirrorOf = 'west';
		expect(hideMountedLegs(image, rig.pivot, rig, 'walk', 'west', 0, 'far').issue).toMatch(
			/Cyclic/
		);
		rig.directions[0].mirrorOf = 'south-east';
		expect(hideMountedLegs(image, rig.pivot, rig, 'walk', 'west', 0, 'far').issue).toMatch(
			/Missing/
		);
		delete rig.directions[0].mirrorOf;
		expect(
			hideMountedLegs(image, rig.pivot, rig, 'walk', 'east', 0, 'far', { resolvedSource: 'west' })
				.image
		).toBe(image);
		for (const frame of [
			{ x: NaN, y: 0 },
			{ x: 0.5, y: 0 }
		])
			expect(hideMountedLegs(image, frame, rig, 'walk', 'east', 0, 'both').issue).toMatch(
				/Invalid/
			);
		image.w = Number.MAX_SAFE_INTEGER;
		expect(hideMountedLegs(image, rig.pivot, rig, 'walk', 'east', 0, 'both').image).toBe(image);
	});
});
