import { expect, test } from 'vitest';
import { makeImg } from '../../src/lib/image/png.ts';
import { cellHash } from '../../src/lib/rig/rig.ts';
import {
	createNativeContactDraft,
	measureNativeContacts,
	nativeContactExport,
	nativeContactKey,
	validateNativeContacts,
	type NativeContactBinding
} from '../../src/ui/motion-lab/native-contacts.ts';

async function fixture() {
	const images = [makeImg(8, 8), makeImg(8, 8), makeImg(8, 8)];
	images.forEach((im, i) => {
		im.data.set([30 + i, 40, 50, 255], (3 * 8 + 5 - i) * 4);
		im.data.set([90, 80, 70, 128], (6 * 8 + 6) * 4);
	});
	const binding: NativeContactBinding = {
		id: 'group-walk/south',
		hashes: await Promise.all(images.map(cellHash)),
		cell: { w: 8, h: 8 },
		direction: 'south',
		durations: [100, 100, 200],
		loop: true
	};
	const draft = createNativeContactDraft(binding);
	draft.marks = images.map((_, frame) => ({
		frame,
		track: 'A',
		landmark: 'heel',
		stance: 'support-1',
		x: 5 - frame,
		y: 3
	}));
	return { binding, images, draft };
}

test('known native 2D speed cancels sampled foot drift but held-frame travel remains separately visible', async () => {
	const { binding, images, draft } = await fixture(),
		originalPixels = images.map((i) => [...i.data]);
	draft.speed = { x: 10, y: 0 };
	const checked = await validateNativeContacts(draft, binding, images),
		measured = measureNativeContacts(checked);
	expect(measured.stances[0]).toMatchObject({
		track: 'A',
		stance: 'support-1',
		landmark: 'heel',
		samples: 3,
		boundarySpanPx: 0,
		reason: null
	});
	expect(measured.intervalHolds).toEqual([
		{ frame: 0, displacementPx: 1 },
		{ frame: 1, displacementPx: 1 },
		{ frame: 2, displacementPx: 2 }
	]);
	expect(measured.qualified).toBe(false);
	expect(images.map((i) => [...i.data])).toEqual(originalPixels);
	const exported = await nativeContactExport(draft, binding, images);
	expect(exported.interpretation).toContain('not continuous foot planting');
	expect(exported).toMatchObject({ qualified: false, measurements: { qualified: false } });
});

test('retiming changes measured drift and a review cannot be reused against different durations', async () => {
	const { binding, images, draft } = await fixture();
	draft.speed = { x: 10, y: 0 };
	const slower = { ...binding, durations: [200, 200, 400] },
		revised = { ...draft, binding: slower };
	expect(measureNativeContacts(revised).stances[0].boundarySpanPx).toBe(2);
	expect(measureNativeContacts(revised).intervalHolds.map((h) => h.displacementPx)).toEqual([
		2, 2, 4
	]);
	await expect(validateNativeContacts(draft, slower, images)).rejects.toThrow('exact frames');
	expect(await nativeContactKey(binding)).not.toBe(await nativeContactKey(slower));
});

test('unset or incomplete speed and mixed landmarks produce no sampled displacement while partial drafts remain exportable', async () => {
	const { binding, images, draft } = await fixture();
	expect(draft.speed).toEqual({ x: null, y: null });
	for (const speed of [
		{ x: null, y: null },
		{ x: 10, y: null },
		{ x: null, y: 0 }
	]) {
		draft.speed = speed;
		const measured = measureNativeContacts(draft);
		expect(measured.partial).toBe(true);
		expect(measured.stances[0].boundarySpanPx).toBeNull();
		expect(measured.intervalHolds).toEqual([]);
	}
	draft.speed = { x: 10, y: 0 };
	draft.marks[1].landmark = 'toe';
	expect(measureNativeContacts(draft).stances[0]).toMatchObject({
		boundarySpanPx: null,
		reason: 'Mixed heel/toe landmarks.'
	});
	const empty = createNativeContactDraft(binding),
		exported = await nativeContactExport(empty, binding, images);
	expect(exported.measurements).toMatchObject({
		partial: true,
		stances: [],
		intervalHolds: [],
		qualified: false
	});
});

test('tracks and stance labels stay independent, and a single frame is insufficient even at explicit zero speed', async () => {
	const { draft } = await fixture();
	draft.speed = { x: 0, y: 0 };
	draft.marks[1].track = 'B';
	draft.marks[2].stance = 'support-2';
	const measured = measureNativeContacts(draft);
	expect(measured.stances).toHaveLength(3);
	expect(measured.stances.every((s) => s.boundarySpanPx === null && s.samples === 1)).toBe(true);
	expect(measured.intervalHolds.map((h) => h.displacementPx)).toEqual([0, 0, 0]);
});

test('two marks do not complete annotation coverage, while marking every track and frame still cannot qualify motion', async () => {
	const { binding, draft } = await fixture();
	draft.binding = {
		...binding,
		hashes: Array(8).fill(binding.hashes[0]),
		durations: Array(8).fill(100)
	};
	draft.speed = { x: 10, y: 0 };
	draft.marks = draft.marks.slice(0, 2);
	expect(measureNativeContacts(draft)).toMatchObject({
		coverageComplete: false,
		partial: true,
		qualified: false
	});
	expect(measureNativeContacts(draft).stances[0].boundarySpanPx).toBe(0);
	draft.marks = Array.from({ length: 8 }, (_, frame) =>
		(['A', 'B'] as const).map((track) => ({
			frame,
			track,
			stance: 'support-1',
			landmark: 'heel' as const,
			x: 4,
			y: 3
		}))
	).flat();
	expect(measureNativeContacts(draft)).toMatchObject({
		coverageComplete: true,
		partial: false,
		qualified: false
	});
});

test('asynchronous validation retains a snapshot when caller pixels or metadata change after validation starts', async () => {
	const { binding, images, draft } = await fixture(),
		pending = validateNativeContacts(draft, binding, images);
	binding.durations[0] = 300;
	images[1].data.fill(0);
	draft.marks[1].x = 0;
	const checked = await pending;
	expect(checked.binding.durations[0]).toBe(100);
	expect(checked.marks[1].x).toBe(4);
});

test('imports reject wrong group, frame order, canvas, direction, loop and actual mutated native pixels', async () => {
	const { binding, images, draft } = await fixture();
	for (const changed of [
		{ ...binding, id: 'another-group' },
		{ ...binding, hashes: [...binding.hashes].reverse() },
		{ ...binding, cell: { w: 9, h: 8 } },
		{ ...binding, direction: 'north' },
		{ ...binding, loop: false }
	]) {
		await expect(validateNativeContacts(draft, changed, images)).rejects.toThrow('exact frames');
		expect(await nativeContactKey(binding)).not.toBe(await nativeContactKey(changed));
	}
	images[1].data[0] = 1;
	await expect(validateNativeContacts(draft, binding, images)).rejects.toThrow('pixels differ');
});

test('only opaque, in-bounds native pixel marks are accepted and malformed drafts cannot generate measurements', async () => {
	const { binding, images, draft } = await fixture();
	for (const mark of [
		{ ...draft.marks[0], x: 0, y: 0 },
		{ ...draft.marks[0], x: 6, y: 6 }
	])
		await expect(
			validateNativeContacts({ ...draft, marks: [mark] }, binding, images)
		).rejects.toThrow('opaque native pixels');
	for (const mark of [
		{ ...draft.marks[0], x: 0.5 },
		{ ...draft.marks[0], frame: 3 },
		{ ...draft.marks[0], stance: ' ' }
	])
		await expect(
			validateNativeContacts({ ...draft, marks: [mark] }, binding, images)
		).rejects.toThrow('visible native pixel');
	await expect(
		validateNativeContacts({ ...draft, speed: { x: NaN, y: 0 } }, binding, images)
	).rejects.toThrow('finite or unset');
	await expect(
		validateNativeContacts({ ...draft, marks: [draft.marks[0], draft.marks[0]] }, binding, images)
	).rejects.toThrow('only one landmark');
	expect(() => createNativeContactDraft({ ...binding, durations: [100] })).toThrow(
		'positive playback durations'
	);
});

test('looping stance that crosses the loop seam: span uses absolute playback start time without wrap', () => {
	const h = `sha256:${'a'.repeat(64)}`;
	const draft = createNativeContactDraft({
		id: 'x',
		hashes: Array(8).fill(h),
		cell: { w: 128, h: 128 },
		direction: 'east',
		durations: Array(8).fill(100),
		loop: true
	});
	draft.speed = { x: 22.5, y: 0 };
	// A world-planted foot: frame 7 at x=60, next cycle frame 0 is 2.25 px further back (rounded to 58).
	draft.marks = [
		{ frame: 6, track: 'A', landmark: 'heel', stance: 'seam', x: 62, y: 90 },
		{ frame: 7, track: 'A', landmark: 'heel', stance: 'seam', x: 60, y: 90 },
		{ frame: 0, track: 'A', landmark: 'heel', stance: 'seam', x: 58, y: 90 }
	];
	const span = measureNativeContacts(draft).stances[0].boundarySpanPx!;
	expect(span).toBeCloseTo(0.5);
	const linear = { ...draft, binding: { ...draft.binding, loop: false } };
	expect(measureNativeContacts(linear).stances[0].boundarySpanPx).toBeCloseTo(17.75);
	draft.marks.push({ frame: 3, track: 'A', landmark: 'heel', stance: 'seam', x: 50, y: 90 });
	expect(measureNativeContacts(draft).stances[0]).toMatchObject({
		boundarySpanPx: null,
		reason: 'Disjoint looping stance. Use separate stance labels for separate support intervals.'
	});
});
