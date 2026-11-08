import { expect, test } from 'vitest';
import { makeImg } from '../../src/lib/image/png.ts';
import { DIRECTIONS, type DirectionName, type Rig, type Sha256 } from '../../src/lib/rig/rig.ts';
import { LABELS } from '../../src/lib/rig/poses.ts';
import {
	createStarterPlan,
	matchStarterFrames,
	starterRequest,
	validateStarterReceipt,
	STARTER_PRESETS,
	type StarterNativeFrame,
	type StarterPlan,
	type StarterReceipt
} from '../../src/lib/rig/starter-presets.ts';

function sourceRig(): Rig {
	return {
		template: 'mannequin',
		view: 'low top-down',
		cell: { w: 80, h: 80 },
		pivot: { x: 40, y: 68 },
		directions: DIRECTIONS.map((id) => ({ id })),
		animations: [],
		baseItem: 'body',
		baseHash: `sha256:${'a'.repeat(64)}`,
		rest: Object.fromEntries(
			DIRECTIONS.map((direction, i) => [
				direction,
				{
					image: `sha256:${String(i + 1).repeat(64)}` as Sha256,
					keypoints: LABELS.map((label) => ({ label, x: 0.5, y: 0.5 }))
				}
			])
		)
	};
}
const pilot: DirectionName[] = ['south', 'east'];
const receiptResponse = (directions: readonly DirectionName[], group = 'motion-group') => ({
	animation_group_id: group,
	directions: [...directions],
	background_job_ids: directions.map((d) => `job-${d}`),
	status: 'processing'
});
function nativeFrames(
	plan: StarterPlan,
	directions: readonly DirectionName[] = plan.directions
): StarterNativeFrame[] {
	return directions.flatMap((direction) =>
		Array.from({ length: plan.frames }, (_, index) => {
			const image = makeImg(112, 112);
			image.data.set([30 + index, 40, 50, 255], (20 * 112 + 30) * 4);
			return { direction, index, image };
		})
	);
}

test('the three starter requests use one custom shared motion, with fixed counts and no legacy template or drawn prop', () => {
	for (const preset of ['idle', 'walk', 'slash'] as const) {
		const plan = createStarterPlan('character', sourceRig(), preset, DIRECTIONS, 0),
			request = starterRequest(plan);
		expect(request).toMatchObject({
			method: 'POST',
			path: '/characters/animations',
			body: {
				character_id: 'character',
				mode: 'skeleton-v3',
				directions: DIRECTIONS,
				seed: 0,
				frame_count: preset === 'idle' ? 4 : 8
			}
		});
		expect(request.body).not.toHaveProperty('template_animation_id');
		expect(request.body).not.toHaveProperty('animation_group_id');
		expect(plan.action).toContain('no weapon');
		expect(plan.action).toContain('no props');
		expect(plan.action).toContain('no effects');
	}
	const attack = createStarterPlan('character', sourceRig(), 'slash');
	expect(attack.loop).toBe(false);
	expect(attack.action).toContain('closed right fist');
	expect(STARTER_PRESETS.idle.loop && STARTER_PRESETS.walk.loop).toBe(true);
});

test('a source plan captures immutable ordered artwork, geometry and view before later project edits', () => {
	const rig = sourceRig(),
		plan = createStarterPlan('character', rig, 'walk', ['east', 'south']);
	const binding = plan.binding;
	rig.cell.w = 128;
	rig.pivot.y = 70;
	rig.view = 'side';
	rig.rest!.south!.image = `sha256:${'f'.repeat(64)}`;
	expect(plan.directions).toEqual(['south', 'east']);
	expect(plan.source.cell).toEqual({ w: 80, h: 80 });
	expect(plan.source.pivot).toEqual({ x: 40, y: 68 });
	expect(plan.source.view).toBe('low top-down');
	expect(plan.source.rest[0].image).toBe(`sha256:${'1'.repeat(64)}`);
	expect(plan.binding).toBe(binding);
	expect(createStarterPlan('character', rig, 'walk', pilot).binding).not.toBe(binding);
	expect(
		Object.isFrozen(plan.source.cell) &&
			Object.isFrozen(plan.source.rest[0]) &&
			Object.isFrozen(plan)
	).toBe(true);
});

test('eight native views cannot be claimed from mirrored artwork, missing references, invalid joints or an unknown body model', () => {
	const mirrored = sourceRig();
	mirrored.directions.find((d) => d.id === 'west')!.mirrorOf = 'east';
	expect(() => createStarterPlan('character', mirrored, 'walk')).toThrow('independently authored');
	const missing = sourceRig();
	delete missing.rest!.east;
	expect(() => createStarterPlan('character', missing, 'walk')).toThrow('exact standing');
	const joints = sourceRig();
	joints.rest!.east!.keypoints.pop();
	expect(() => createStarterPlan('character', joints, 'walk')).toThrow('complete valid');
	const unknown = sourceRig();
	delete unknown.template;
	expect(() => createStarterPlan('character', unknown, 'walk')).toThrow('humanoid');
	expect(() =>
		createStarterPlan('character', { ...sourceRig(), template: 'bear' }, 'walk')
	).toThrow('humanoid');
});

test('invalid source canvas, pivot, camera, seed and repeated direction selections fail before a request is built', () => {
	expect(() =>
		createStarterPlan('character', { ...sourceRig(), cell: { w: 0, h: 80 } }, 'walk')
	).toThrow('canvas');
	expect(() =>
		createStarterPlan('character', { ...sourceRig(), pivot: { x: 40, y: 81 } }, 'walk')
	).toThrow('pivot');
	expect(() => createStarterPlan('character', { ...sourceRig(), view: undefined }, 'walk')).toThrow(
		'view'
	);
	expect(() => createStarterPlan('character', sourceRig(), 'walk', ['south', 'south'])).toThrow(
		'distinct'
	);
	expect(() => createStarterPlan('character', sourceRig(), 'walk', [], 1)).toThrow('nonempty');
	expect(() => createStarterPlan('character', sourceRig(), 'walk', pilot, -1)).toThrow('source');
});

test('a south/east pilot receipt binds later six-view work to exactly one saved group after JSON persistence', () => {
	const plan = createStarterPlan('character', sourceRig(), 'slash', DIRECTIONS, 19);
	// The response order may differ from the request; each job stays paired to its announced direction.
	const receipt = validateStarterReceipt(plan, pilot, receiptResponse(['east', 'south']));
	expect(receipt.jobs).toEqual([
		{ direction: 'east', jobId: 'job-east' },
		{ direction: 'south', jobId: 'job-south' }
	]);
	const restored = JSON.parse(JSON.stringify(receipt)) as StarterReceipt,
		remaining = DIRECTIONS.filter((d) => !pilot.includes(d));
	const continuation = starterRequest(plan, remaining, [restored]);
	expect(continuation.body).toMatchObject({
		mode: 'skeleton-v3',
		animation_group_id: 'motion-group',
		animation_name: 'slash',
		frame_count: 8,
		directions: remaining,
		seed: 19
	});
	expect(continuation.body).not.toHaveProperty('template_animation_id');
	expect(() => starterRequest(plan, ['east'], [restored])).toThrow('already has a paid receipt');
	expect(() =>
		validateStarterReceipt(plan, remaining, receiptResponse(remaining, 'different-group'), [
			restored
		])
	).toThrow('mismatched');
	const last = validateStarterReceipt(plan, remaining, receiptResponse(remaining), [restored]);
	expect([...restored.jobs, ...last.jobs]).toHaveLength(8);
	expect(() => starterRequest(plan, ['north'], [restored, last])).toThrow('paid receipt');
});

test('a receipt for other source pixels, camera, pivot, seed or action cannot continue the same group', () => {
	const rig = sourceRig(),
		plan = createStarterPlan('character', rig, 'walk', DIRECTIONS, 5),
		receipt = validateStarterReceipt(plan, pilot, receiptResponse(pilot));
	const changes = [
		createStarterPlan('character', rig, 'idle', DIRECTIONS, 5),
		createStarterPlan('character', rig, 'walk', DIRECTIONS, 6),
		createStarterPlan('different-character', rig, 'walk', DIRECTIONS, 5),
		createStarterPlan('character', { ...rig, view: 'side' }, 'walk', DIRECTIONS, 5),
		createStarterPlan('character', { ...rig, pivot: { x: 39, y: 68 } }, 'walk', DIRECTIONS, 5),
		createStarterPlan(
			'character',
			{
				...rig,
				rest: { ...rig.rest, south: { ...rig.rest!.south!, image: `sha256:${'b'.repeat(64)}` } }
			},
			'walk',
			DIRECTIONS,
			5
		)
	];
	for (const changed of changes)
		expect(() => starterRequest(changed, ['north'], [receipt])).toThrow('exact starter motion');
	expect(() => starterRequest({ ...plan, frames: 12 }, ['north'], [receipt])).toThrow(
		'binding changed'
	);
	expect(() =>
		starterRequest({ ...plan, action: 'different attack' }, ['north'], [receipt])
	).toThrow('binding changed');
});

test('unknown or partial submit responses, duplicate directions/jobs and wrong identities remain explicit failures', () => {
	const plan = createStarterPlan('character', sourceRig(), 'walk'),
		good = receiptResponse(pilot);
	const bad = [
		null,
		{},
		{ ...good, animation_group_id: null },
		{ ...good, directions: ['south'] },
		{ ...good, directions: ['south', 'south'] },
		{ ...good, directions: ['south', 'north'] },
		{ ...good, background_job_ids: ['one-job'] },
		{ ...good, background_job_ids: ['one', 'one'] },
		{ ...good, background_job_ids: ['', 'two'] },
		{ ...good, character_id: 'another-character' },
		{ ...good, status: 'failed' }
	];
	for (const response of bad)
		expect(() => validateStarterReceipt(plan, pilot, response)).toThrow(
			'no automatic resubmission'
		);
	const receipt = validateStarterReceipt(plan, pilot, good);
	expect(() => starterRequest(plan, ['north'], [receipt, receipt])).toThrow('repeated directions');
	expect(() =>
		validateStarterReceipt(
			plan,
			['north'],
			{ ...receiptResponse(['north']), background_job_ids: ['job-east'] },
			[receipt]
		)
	).toThrow('mismatched');
});

test('native results retain exact artwork and frame order across all eight directions without adopting a guessed pivot', () => {
	const plan = createStarterPlan('character', sourceRig(), 'slash'),
		entries = nativeFrames(plan),
		original = entries.map((f) => new Uint8ClampedArray(f.image.data));
	const matched = matchStarterFrames(plan, [...entries].reverse());
	expect(matched.cell).toEqual({ w: 112, h: 112 });
	expect(matched.directions).toEqual(DIRECTIONS);
	expect(matched).not.toHaveProperty('pivot');
	for (const [i, entry] of entries.entries()) {
		expect(matched.frames[entry.direction]![entry.index]).toBe(entry.image);
		expect(entry.image.data.every((v, q) => v === original[i][q])).toBe(true);
	}
});

test('a pilot can retain its two native directions without falsely requiring or claiming the other six', () => {
	const plan = createStarterPlan('character', sourceRig(), 'idle'),
		frames = nativeFrames(plan, pilot),
		matched = matchStarterFrames(plan, frames, pilot);
	expect(matched.directions).toEqual(pilot);
	expect(Object.keys(matched.frames)).toEqual(pilot);
	expect(matched.frames.north).toBeUndefined();
});

test('different per-direction native canvases remain intact; maximum extent is only a layout convenience', () => {
	const plan = createStarterPlan('character', sourceRig(), 'slash'),
		entries = nativeFrames(plan);
	for (const entry of entries)
		if (entry.direction === 'north') {
			const native = makeImg(96, 96);
			native.data.set(
				entry.image.data.slice((20 * 112 + 30) * 4, (20 * 112 + 30) * 4 + 4),
				(20 * 96 + 30) * 4
			);
			entry.image = native;
		}
	const matched = matchStarterFrames(plan, entries);
	expect(matched.cell).toEqual({ w: 112, h: 112 });
	expect(matched.cells.north).toEqual({ w: 96, h: 96 });
	expect(matched.cells.south).toEqual({ w: 112, h: 112 });
	expect(matched.frames.north![0]).toBe(
		entries.find((f) => f.direction === 'north' && f.index === 0)!.image
	);
	expect(matched.frames.north![0].w).toBe(96);
	expect(matched).not.toHaveProperty('pivot');
	expect(matched.frames.north![0].data.length).toBe(96 * 96 * 4);
});

test('within-view canvas changes, lost or repeated indices, foreign directions and empty images cannot silently normalize into a pack', () => {
	const plan = createStarterPlan('character', sourceRig(), 'walk'),
		entries = nativeFrames(plan, pilot);
	expect(() => matchStarterFrames(plan, entries.slice(1), pilot)).toThrow('missing frames');
	expect(() => matchStarterFrames(plan, [entries[1], ...entries.slice(1)], pilot)).toThrow(
		'repeat'
	);
	expect(() =>
		matchStarterFrames(plan, [{ ...entries[0], index: 8 }, ...entries.slice(1)], pilot)
	).toThrow('indexed');
	expect(() =>
		matchStarterFrames(plan, [{ ...entries[0], direction: 'west' }, ...entries.slice(1)], pilot)
	).toThrow('indexed');
	expect(() =>
		matchStarterFrames(
			plan,
			[{ ...entries[0], image: makeImg(112, 112) }, ...entries.slice(1)],
			pilot
		)
	).toThrow('indexed');
	const different = makeImg(128, 112);
	different.data[3] = 255;
	expect(() =>
		matchStarterFrames(
			plan,
			[entries[0], { ...entries[1], image: different }, ...entries.slice(2)],
			pilot
		)
	).toThrow('never recenter or resize');
});
