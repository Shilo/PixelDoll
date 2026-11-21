import { describe, expect, test } from 'vitest';
import { makeImg } from '../../src/lib/image/png.ts';
import { decodePngBytes } from '../../src/lib/image/pngraw.ts';
import type {
	DirectionName,
	Item,
	Layer,
	Manifest,
	Project,
	Sha256
} from '../../src/lib/store/manifest.ts';
import {
	ALL_DIRECTIONS,
	SHARE_SCALES,
	buildShareMedia,
	buildSharePresentation as buildPresentation,
	canAnimateShare,
	encodeShareMedia,
	encodeSharePng,
	shareDimensions,
	sharePreviewFrames
} from '../../src/studio/shareMedia.ts';
import { CURRENT_FORMAT } from '../../src/lib/store/manifest.ts';
import { ALL_CLIPS, ALL_MOVES, ALL_STATES } from '../../src/studio/shareClips.ts';

const hash = (name: string) => `sha256:${name}` as Sha256;
function fixture(directions: DirectionName[] = ['south', 'east']): Project {
	const body0 = hash('body0'),
		body1 = hash('body1'),
		rest = hash('rest'),
		hat = hash('hat');
	const image = (r: number, x: number) => {
		const out = makeImg(2, 1);
		out.data.set([r, 0, 0, 255], x * 4);
		return out;
	};
	const cells = (a: Sha256, b: Sha256) =>
		Object.fromEntries(directions.map((direction) => [direction, [a, b]]));
	const item = (id: string, slot: string, layer: Layer): Item => ({
		id,
		slot,
		layers: [layer],
		name: id,
		prompt: '',
		baseHash: body0,
		status: 'accepted',
		mirror: 'flip',
		materials: [],
		provenance: []
	});
	const manifest: Manifest = {
		format: CURRENT_FORMAT,
		name: 'Test character',
		app: '',
		materials: [],
		presets: [],
		rig: {
			cell: { w: 2, h: 1 },
			pivot: { x: 1, y: 1 },
			baseItem: 'base',
			baseHash: body0,
			directions: directions.map((id) => ({ id })),
			rest: Object.fromEntries(directions.map((id) => [id, { image: rest, keypoints: [] }])),
			animations: [
				{ id: 'default', cells: 1, loop: true, frames: [{ cell: 0, ms: 100 }] },
				{
					id: 'walk',
					cells: 2,
					loop: true,
					frames: [
						{ cell: 0, ms: 70 },
						{ cell: 1, ms: 120 }
					]
				}
			]
		},
		slots: [
			{ id: 'body', z: 1, class: 'base' },
			{ id: 'head', z: 2, class: 'rigid' }
		],
		items: [
			item('base', 'body', {
				id: 'main',
				role: 'fg',
				z: 1,
				cells: {
					default: Object.fromEntries(directions.map((id) => [id, [rest]])),
					walk: cells(body0, body1)
				}
			}),
			{
				...item('hat', 'head', {
					id: 'main',
					role: 'fg',
					z: 2,
					cells: {
						default: Object.fromEntries(directions.map((id) => [id, [hat]])),
						walk: cells(hat, hat)
					}
				}),
				coverage: directions.flatMap((d) => [
					`default/${d}/0` as const,
					`walk/${d}/0` as const,
					`walk/${d}/1` as const
				])
			}
		]
	};
	return {
		manifest,
		images: new Map([
			[body0, image(40, 0)],
			[body1, image(50, 0)],
			[rest, image(60, 0)],
			[hat, image(90, 1)]
		])
	};
}

describe('share media', () => {
	test('every size preserves exact RGBA blocks and clipboard uses the first animated frame, not the contact sheet', async () => {
		const project = fixture(),
			a = buildPresentation(project);
		const media = buildShareMedia(a, {}, ALL_CLIPS, ALL_DIRECTIONS, true);
		expect(media.still.h).toBeGreaterThan(media.frames[0].image.h);
		const source = media.frames[0].image;
		for (const scale of SHARE_SCALES) {
			const png = await decodePngBytes(await encodeSharePng(media, scale));
			expect([png.w, png.h]).toEqual([source.w * scale, source.h * scale]);
			expect(shareDimensions(media, scale)).toEqual({ w: png.w, h: png.h });
			let mismatch = -1;
			for (let y = 0; y < png.h; y++)
				for (let x = 0; x < png.w; x++)
					for (let c = 0; c < 4; c++) {
						if (
							png.data[(y * png.w + x) * 4 + c] !==
							source.data[(Math.floor(y / scale) * source.w + Math.floor(x / scale)) * 4 + c]
						)
							mismatch = (y * png.w + x) * 4 + c;
					}
			expect(mismatch).toBe(-1);
		}
		const still = buildShareMedia(a, {}, ALL_CLIPS, ALL_DIRECTIONS, false);
		expect(await encodeSharePng(still, 2)).toEqual(await encodeShareMedia(still, 2));
	});

	test('scaled GIF preserves dimensions, delays and transparency, and loops even for one-shot moves; stale encoding can abort', async () => {
		const project = fixture();
		project.manifest.rig.animations[1].loop = false;
		const media = buildShareMedia(buildPresentation(project), {}, 'walk', 'south', true);
		const bytes = await encodeShareMedia(media, 3);
		expect([bytes[6] | (bytes[7] << 8), bytes[8] | (bytes[9] << 8)]).toEqual([6, 3]);
		const controls: number[][] = [];
		for (let i = 0; i < bytes.length - 7; i++)
			if (bytes[i] === 0x21 && bytes[i + 1] === 0xf9 && bytes[i + 2] === 4)
				controls.push([bytes[i + 3] & 1, bytes[i + 4] | (bytes[i + 5] << 8)]);
		expect(controls).toEqual([
			[1, 7],
			[1, 12]
		]);
		const loopExtension = Buffer.from(bytes).indexOf('NETSCAPE2.0');
		expect(loopExtension).toBeGreaterThan(0);
		expect([...bytes.slice(loopExtension + 11, loopExtension + 16)]).toEqual([3, 1, 0, 0, 0]);
		expect(project.manifest.rig.animations[1].loop).toBe(false);
		const controller = new AbortController();
		const pending = encodeShareMedia(media, 10, controller.signal);
		controller.abort();
		await expect(pending).rejects.toThrow(/abort/i);
		await expect(encodeShareMedia(media, 5)).rejects.toThrow(/available image size/);
		const huge = {
			...media,
			frames: [{ image: { w: 5000, h: 5000, data: new Uint8ClampedArray() }, ms: 100 }]
		};
		await expect(encodeShareMedia(huge, 1)).rejects.toThrow(/smaller size/);
		const wide = { ...media, frames: [{ image: makeImg(7000, 1), ms: 100 }] };
		await expect(encodeShareMedia(wide, 10)).rejects.toThrow(/GIF dimensions/);
	});

	test('Default is a dressed one-frame PNG and all selections make a deterministic contact sheet', async () => {
		const project = fixture(),
			a = buildPresentation(project);
		expect(canAnimateShare(a, 'default', 'south')).toBe(false);
		expect(canAnimateShare(a, 'walk', 'south')).toBe(true);
		const standing = buildShareMedia(a, { head: 'hat' }, 'default', 'south', true);
		expect(standing.extension).toBe('png');
		expect([...standing.still.data]).toEqual([60, 0, 0, 255, 90, 0, 0, 255]);
		const decoded = await decodePngBytes(await encodeShareMedia(standing));
		expect([...decoded.data]).toEqual([...standing.still.data]);
		const all = buildShareMedia(a, { head: 'hat' }, ALL_CLIPS, ALL_DIRECTIONS, false);
		expect([all.still.w, all.still.h, all.extension]).toEqual([8, 6, 'png']);
		expect([...all.still.data.slice(0, 8)]).toEqual([...standing.still.data]);
		// All moves lists Default once: one standing moment, then the two walk frames
		expect(
			buildShareMedia(a, { head: 'hat' }, ALL_CLIPS, 'south', true).frames.map((frame) => frame.ms)
		).toEqual([100, 70, 120]);
	});

	test('GIF uses authored frame delays, transparency and the same composed frames as preview', async () => {
		const project = fixture(),
			a = buildPresentation(project);
		const media = buildShareMedia(a, { head: 'hat' }, 'walk', 'south', true);
		expect(media.frames.map((frame) => frame.ms)).toEqual([70, 120]);
		expect(media.frames.map((frame) => frame.image.data[0])).toEqual([40, 50]);
		expect(sharePreviewFrames(media).map((frame) => [frame.w, frame.h])).toEqual([
			[2, 1],
			[2, 1]
		]);
		const bytes = await encodeShareMedia(media);
		expect(new TextDecoder().decode(bytes.slice(0, 6))).toBe('GIF89a');
		const delays: number[] = [];
		for (let i = 0; i < bytes.length - 7; i++)
			if (bytes[i] === 0x21 && bytes[i + 1] === 0xf9 && bytes[i + 2] === 4)
				delays.push(bytes[i + 4] | (bytes[i + 5] << 8));
		expect(delays).toEqual([7, 12]);
	});

	test('single clips and bulk scopes share only their own saved frames', () => {
		const project = fixture();
		project.manifest.rig.animations.push({
			id: 'sit',
			kind: 'state',
			cells: 1,
			loop: false,
			frames: [{ cell: 0, ms: 200 }]
		});
		project.manifest.items[0].layers[0].cells!.sit = { south: [hash('body1')] };
		const availability = buildPresentation(project);
		for (const [selection, colors] of [
			['default', [60]],
			['sit', [50]],
			['walk', [40, 50]],
			[ALL_STATES, [60, 50]],
			[ALL_MOVES, [40, 50]],
			[ALL_CLIPS, [60, 40, 50, 50]]
		] as const) {
			const media = buildShareMedia(availability, {}, selection, 'south', true);
			expect(
				media.frames.map(({ image }) => image.data[0]),
				selection
			).toEqual(colors);
			expect(canAnimateShare(availability, selection, 'south'), selection).toBe(colors.length > 1);
		}
	});

	test('aggregate choices omit unavailable pairs and an empty selection shares a still', () => {
		const project = fixture();
		delete project.manifest.items[0].layers[0].cells!.walk.east;
		const a = buildPresentation(project);
		expect(canAnimateShare(a, 'walk', 'east')).toBe(false);
		const east = buildShareMedia(a, {}, 'walk', 'east', true);
		expect(east.extension).toBe('png');
		expect(east.still.data[0]).toBe(60);
		expect(east.omitted).toEqual([{ move: 'walk', direction: 'east' }]);
		const oneMove = buildShareMedia(a, {}, 'walk', ALL_DIRECTIONS, true);
		expect(oneMove.omitted.map((pair) => [pair.move, pair.direction])).toEqual([['walk', 'east']]);
		expect(oneMove.frames.map((frame) => [frame.image.w, frame.image.h])).toEqual([
			[2, 1],
			[2, 1]
		]);
		const oneFacing = buildShareMedia(a, {}, ALL_CLIPS, 'east', true);
		expect(oneFacing.omitted.map((pair) => [pair.move, pair.direction])).toEqual([
			['walk', 'east']
		]);
		expect(oneFacing.extension).toBe('png');
		const all = buildShareMedia(a, {}, ALL_CLIPS, ALL_DIRECTIONS, true);
		expect(all.omitted.map((pair) => [pair.move, pair.direction])).toEqual([['walk', 'east']]);
		expect(all.frames.map((frame) => [frame.image.w, frame.image.h])).toEqual([
			[8, 1],
			[8, 1],
			[8, 1]
		]);
		expect(sharePreviewFrames(all).map((frame) => [frame.w, frame.h])).toEqual([
			[8, 1],
			[8, 1],
			[8, 1]
		]);
		expect([all.still.w, all.still.h]).toEqual([8, 6]);
		delete project.manifest.items[0].layers[0].cells!.walk.south;
		const fallback = buildShareMedia(buildPresentation(project), {}, 'walk', ALL_DIRECTIONS, true);
		expect(fallback.extension).toBe('png');
		expect(fallback.still.data[0]).toBe(60);
		expect(fallback.omitted).toEqual([
			{ move: 'walk', direction: 'south' },
			{ move: 'walk', direction: 'east' }
		]);
	});

	test('missing body images skip unrenderable moments without shifting the direction grid', () => {
		const project = fixture();
		project.images.delete(hash('body0'));
		const walk = project.manifest.rig.animations[1];
		walk.cells = 3;
		walk.frames.push({ cell: 2, ms: 160 });
		const views = project.manifest.items[0].layers[0].cells!.walk;
		views.south!.push(hash('rest'));
		views.east = [hash('body0'), hash('body0'), hash('rest')];
		const a = buildPresentation(project);
		expect(canAnimateShare(a, 'walk', 'east')).toBe(false);
		expect(canAnimateShare(a, 'walk', ALL_DIRECTIONS)).toBe(true);
		const media = buildShareMedia(a, {}, 'walk', ALL_DIRECTIONS, true);
		expect(media.frames.map(({ ms }) => ms)).toEqual([120, 160]);
		expect(media.frames.map(({ image }) => [image.data[0], image.data[24]])).toEqual([
			[50, 0],
			[60, 60]
		]);
		expect(buildShareMedia(a, {}, 'walk', 'south', false).still.data[0]).toBe(50);
	});

	test('a missing or empty move shares available artwork, or a transparent PNG when none exists', async () => {
		const project = fixture();
		project.manifest.rig.animations[1].frames = [];
		const a = buildPresentation(project);
		expect(buildShareMedia(a, {}, 'missing', 'south', true).still.data[0]).toBe(60);
		expect(buildShareMedia(a, {}, ALL_CLIPS, 'south', true).still.data[0]).toBe(60);
		project.images.clear();
		const empty = buildShareMedia(buildPresentation(project), {}, 'walk', 'south', true);
		expect(empty.empty).toBe(true);
		expect(empty.extension).toBe('png');
		const png = await decodePngBytes(await encodeShareMedia(empty));
		expect([...png.data]).toEqual(Array<number>(8).fill(0));
	});

	test('missing equipment on a later frame is hidden throughout the view like in the game', () => {
		const project = fixture();
		project.manifest.items[1].layers[0].cells!.walk.south = [hash('hat')];
		const a = buildPresentation(project);
		const media = buildShareMedia(a, { head: 'hat' }, 'walk', 'south', true);
		expect(media.frames.map(({ image }) => [...image.data])).toEqual([
			[40, 0, 0, 255, 0, 0, 0, 0],
			[50, 0, 0, 255, 0, 0, 0, 0]
		]);
	});

	test('pending draft views omit the item without blocking completed body or equipment artwork', () => {
		const project = fixture(),
			hat = project.manifest.items[1];
		hat.status = 'draft';
		hat.pending = ['walk/east/0', 'walk/east/1'];
		delete hat.layers[0].cells!.walk.east;
		const a = buildPresentation(project),
			worn = { head: hat.id };
		expect(canAnimateShare(a, 'walk', 'east')).toBe(true);
		for (const animate of [false, true]) {
			const east = buildShareMedia(a, worn, 'walk', 'east', animate);
			expect([...east.frames[0].image.data]).toEqual([40, 0, 0, 255, 0, 0, 0, 0]);
			const media = buildShareMedia(a, worn, 'walk', 'south', animate);
			expect([...media.frames[0].image.data]).toEqual([40, 0, 0, 255, 90, 0, 0, 255]);
			const all = buildShareMedia(a, worn, 'walk', ALL_DIRECTIONS, animate);
			expect(all.omitted).toEqual([]);
		}
	});

	test('one-frame moves cannot advertise GIF animation even with many directions', () => {
		const project = fixture();
		project.manifest.rig.animations[1].frames = [{ cell: 0, ms: 100 }];
		const a = buildPresentation(project);
		expect(canAnimateShare(a, 'walk', ALL_DIRECTIONS)).toBe(false);
		expect(buildShareMedia(a, {}, 'walk', ALL_DIRECTIONS, true).extension).toBe('png');
	});

	test('one through eight available facings use legible rows without changing rig order', () => {
		const compass: DirectionName[] = [
			'south',
			'south-east',
			'east',
			'north-east',
			'north',
			'north-west',
			'west',
			'south-west'
		];
		for (let count = 1; count <= 8; count++) {
			const project = fixture(compass.slice(0, count));
			compass.slice(0, count).forEach((id, index) => {
				const directionHash = hash(`direction-${index}`),
					image = makeImg(2, 1);
				image.data.set([20 + index, 0, 0, 255]);
				project.images.set(directionHash, image);
				project.manifest.items[0].layers[0].cells!.walk[id] = [directionHash, directionHash];
			});
			const a = buildPresentation(project);
			const still = buildShareMedia(a, {}, 'walk', ALL_DIRECTIONS, false);
			const columns = count <= 4 ? count : count <= 6 ? 3 : 4;
			const rows = Math.ceil(count / columns);
			expect([still.still.w, still.still.h, still.previewRows]).toEqual([
				columns * 2 + (columns - 1) * 4,
				rows + (rows - 1) * 4,
				rows
			]);
			compass.slice(0, count).forEach((_, index) => {
				const x = (index % columns) * 6,
					y = Math.floor(index / columns) * 5;
				expect(still.still.data[(y * still.still.w + x) * 4]).toBe(20 + index);
			});
			const gif = buildShareMedia(a, {}, 'walk', ALL_DIRECTIONS, true);
			expect(gif.frames.map((frame) => [frame.image.w, frame.image.h])).toEqual([
				[still.still.w, still.still.h],
				[still.still.w, still.still.h]
			]);
			const one = buildShareMedia(a, {}, 'walk', compass[0], false);
			expect([one.still.w, one.still.h]).toEqual([2, 1]);
		}
	});
});
