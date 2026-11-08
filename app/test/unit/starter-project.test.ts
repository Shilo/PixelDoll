import { expect, test } from 'vitest';
import { makeImg, type Img } from '../../src/lib/image/png.ts';
import { decodePngBytes } from '../../src/lib/image/pngraw.ts';
import { sha256 } from '../../src/lib/image/hash.ts';
import { composeCell } from '../../src/lib/compose/compose.ts';
import { CURRENT_FORMAT, type Project } from '../../src/lib/store/manifest.ts';
import { projectEntries, readCharacterZip } from '../../src/lib/store/import.ts';
import { exportFiles } from '../../src/lib/export/export.ts';
import { zip, unzip } from '../../src/lib/store/zip.ts';
import {
	cellHash,
	DIRECTIONS,
	type DirectionName,
	type Rig,
	type Sha256
} from '../../src/lib/rig/rig.ts';
import { LABELS } from '../../src/lib/rig/poses.ts';
import {
	createStarterPlan,
	validateStarterReceipt,
	type StarterPresetId
} from '../../src/lib/rig/starter-presets.ts';
import {
	buildStarterProject,
	placeStarterImage,
	type StarterLayout,
	type StarterProjectClip
} from '../../src/ui/motion-lab/starter-project.ts';

const PRESETS: StarterPresetId[] = ['idle', 'walk', 'slash'];
async function fixture() {
	const images = new Map<Sha256, Img>(),
		rest: NonNullable<Rig['rest']> = {},
		standing: Partial<Record<DirectionName, (Sha256 | null)[]>> = {};
	for (const [i, direction] of DIRECTIONS.entries()) {
		const im = makeImg(4, 4);
		im.data.set([30 + i, 15, 10, 255], (1 * 4 + 1) * 4);
		im.data.set([60 + i, 25, 15, 255], (3 * 4 + 2) * 4);
		const hash = await cellHash(im);
		images.set(hash, im);
		standing[direction] = [hash];
		rest[direction] = {
			image: hash,
			keypoints: LABELS.map((label) => ({ label, x: 0.5, y: 0.5 }))
		};
	}
	const rig: Rig = {
		cell: { w: 4, h: 4 },
		pivot: { x: 2, y: 4 },
		template: 'mannequin',
		view: 'low top-down',
		rest,
		directions: DIRECTIONS.map((id) => ({ id })),
		animations: [{ id: 'default', cells: 1, frames: [{ cell: 0, ms: 150 }], loop: true }],
		baseItem: 'source-body',
		baseHash: `sha256:${'a'.repeat(64)}`
	};
	const source: Project = {
		images,
		manifest: {
			format: CURRENT_FORMAT,
			name: 'Source body',
			app: 'Synthetic source',
			rig,
			materials: [],
			slots: [{ id: 'body', z: 10, class: 'base', required: true }],
			items: [
				{
					id: 'source-body',
					name: 'Source',
					slot: 'body',
					status: 'accepted',
					mirror: 'generate',
					materials: [],
					baseHash: rig.baseHash,
					prompt: 'Synthetic source pixels only',
					provenance: [],
					layers: [{ id: 'main', z: 10, role: 'fg', cells: { default: standing } }]
				}
			],
			presets: [{ id: 'source', name: 'Source', items: { body: 'source-body' }, variants: {} }]
		}
	};
	const clips: StarterProjectClip[] = PRESETS.map((preset, action) => {
		const plan = createStarterPlan('same-server-character', rig, preset, DIRECTIONS, action),
			directions = [...DIRECTIONS];
		const receipt = validateStarterReceipt(plan, directions, {
			animation_group_id: `group-${preset}`,
			directions,
			background_job_ids: directions.map((d) => `${preset}-${d}`)
		});
		const entries = DIRECTIONS.flatMap((direction, d) =>
			Array.from({ length: plan.frames }, (_, index) => {
				const image = makeImg(6, 6);
				image.data.set([120 + action, 40 + d, 70 + index, 255], (2 * 6 + 1) * 4);
				image.data.set([80, 20, 50, 128], (3 * 6 + 2) * 4);
				return { direction, index, image };
			})
		);
		return { plan, receipts: [receipt], entries };
	});
	const offsets = Object.fromEntries(
		PRESETS.map((p) => [p, Object.fromEntries(DIRECTIONS.map((d) => [d, { x: 1, y: 1 }]))])
	) as StarterLayout['offsets'];
	const layout: StarterLayout = {
		cell: { w: 32, h: 32 },
		restOffset: { x: 2, y: 2 },
		offsets,
		idleSource: 'generated',
		sourceFrames: {
			idle: [0, 1, 2, 3],
			walk: [0, 1, 2, 3, 4, 5, 6, 7],
			slash: [0, 1, 2, 3, 4, 5, 6, 7]
		},
		reviewed: true,
		notes: 'Synthetic layout reviewed; not artistic qualification.'
	};
	return { source, clips, layout };
}

test('integer placement retains exact RGBA including partial alpha and rejects visible clipping or fractional translation', () => {
	const image = makeImg(3, 3);
	image.data.set([12, 34, 56, 128], (1 * 3 + 1) * 4);
	const moved = placeStarterImage(image, { w: 6, h: 7 }, { x: 2, y: 3 });
	expect([...moved.data.slice((4 * 6 + 3) * 4, (4 * 6 + 3) * 4 + 4)]).toEqual([12, 34, 56, 128]);
	expect(image.data[(1 * 3 + 1) * 4 + 3]).toBe(128);
	expect(() => placeStarterImage(image, { w: 3, h: 3 }, { x: -2, y: 0 })).toThrow('clips visible');
	expect(() => placeStarterImage(image, { w: 6, h: 7 }, { x: 0.5, y: 0 })).toThrow('integer');
	// Transparent border loss is allowed; the original native image is separately retained in raw evidence.
	expect(placeStarterImage(image, { w: 1, h: 1 }, { x: -1, y: -1 }).data).toEqual(
		new Uint8ClampedArray([12, 34, 56, 128])
	);
});

test('standing idle is free of an idle-job prerequisite and exports exact standing pixels with four timed holds', async () => {
	const { source, clips, layout } = await fixture();
	layout.idleSource = 'standing';
	layout.sourceFrames.idle = [];
	// Unused generated-idle placement must not affect the standing reference.
	layout.offsets.idle.north = { x: -500, y: -500 };
	const { project, evidence, rawEntries } = await buildStarterProject(
		source,
		clips.filter((c) => c.plan.preset !== 'idle'),
		layout
	);
	const idle = project.manifest.rig.animations.find((a) => a.id === 'idle')!,
		detail = evidence.clips.find((c) => c.preset === 'idle')!;
	expect(idle).toMatchObject({ cells: 1, loop: true, frames: Array(4).fill({ cell: 0, ms: 150 }) });
	expect(idle).not.toHaveProperty('source');
	expect(detail).toMatchObject({
		playableSource: 'standing-reference',
		researchOnly: false,
		jobs: [],
		frames: [],
		sourceFrames: [],
		uniquePlayableSourceFrames: []
	});
	expect(detail).not.toHaveProperty('animationGroupId');
	expect(detail).not.toHaveProperty('binding');
	expect(rawEntries).toHaveLength(136);
	for (const direction of DIRECTIONS) {
		const standing = composeCell(project, { body: 'body' }, 'default', direction, 0),
			still = composeCell(project, { body: 'body' }, 'idle', direction, 0);
		expect(still.data).toEqual(standing.data);
		const row = detail.playableFrames.find((f) => f.direction === direction)!;
		expect(row).toEqual({
			direction,
			sourceKind: 'standing-reference',
			cell: 0,
			outputHash: await cellHash(standing)
		});
		expect(row).not.toHaveProperty('sourceIndex');
	}
	const engine = await exportFiles(project, { engines: ['generic', 'phaser'], baked: false });
	expect(engine.errors).toEqual([]);
	const restored = (await readCharacterZip(await zip(engine.entries))).project;
	expect(restored.manifest.rig.animations.find((a) => a.id === 'idle')).toMatchObject({
		cells: 1,
		loop: true,
		frames: Array(4).fill({ cell: 0, ms: 150 })
	});
	for (const direction of DIRECTIONS)
		expect(await cellHash(composeCell(restored, { body: 'body' }, 'idle', direction, 0))).toBe(
			await cellHash(composeCell(project, { body: 'body' }, 'default', direction, 0))
		);
});

test('optional rejected breathing research stays archived without becoming playable standing-idle provenance', async () => {
	const { source, clips, layout } = await fixture();
	layout.idleSource = 'standing';
	layout.sourceFrames.idle = [];
	const { project, evidence, rawEntries } = await buildStarterProject(source, clips, layout),
		detail = evidence.clips.find((c) => c.preset === 'idle')!;
	expect(detail).toMatchObject({
		playableSource: 'standing-reference',
		researchOnly: true,
		animationGroupId: 'group-idle'
	});
	expect(detail.jobs).toHaveLength(8);
	expect(detail.frames).toHaveLength(32);
	expect(rawEntries).toHaveLength(168);
	for (const raw of clips[0].entries) {
		const record = detail.frames.find(
			(f) => f.direction === raw.direction && f.index === raw.index
		)!;
		expect(record).not.toHaveProperty('playableCell');
		expect(record).not.toHaveProperty('outputHash');
		expect(record.rgbaHash).toBe(await cellHash(raw.image));
		expect(
			await cellHash(await decodePngBytes(rawEntries.find((e) => e.name === record.path)!.data))
		).toBe(record.rgbaHash);
		expect(
			project.images.has(
				await cellHash(
					placeStarterImage(raw.image, layout.cell, layout.offsets.idle[raw.direction]!)
				)
			)
		).toBe(false);
	}
	const packed = await zip([...(await projectEntries(project)), ...rawEntries]),
		restored = (await readCharacterZip(packed)).project;
	expect(restored.manifest.rig.animations.find((a) => a.id === 'idle')).not.toHaveProperty(
		'source'
	);
	const incomplete = structuredClone(clips);
	incomplete[0].entries = incomplete[0].entries.slice(1);
	await expect(buildStarterProject(source, incomplete, layout)).rejects.toThrow('missing frames');
});

test('idle source is explicit and standing cannot select or mix generated idle samples', async () => {
	const { source, clips, layout } = await fixture();
	await expect(
		buildStarterProject(source, clips, {
			...layout,
			idleSource: undefined
		} as unknown as StarterLayout)
	).rejects.toThrow('explicit idle');
	await expect(
		buildStarterProject(source, clips, { ...layout, idleSource: 'standing' })
	).rejects.toThrow('one shared source-frame map');
	const staticLayout: StarterLayout = {
		...layout,
		idleSource: 'standing',
		sourceFrames: { ...layout.sourceFrames, idle: [] }
	};
	await expect(
		buildStarterProject(source, clips, { ...staticLayout, idleSource: 'generated' })
	).rejects.toThrow('one shared source-frame map');
	await expect(
		buildStarterProject(
			source,
			clips.filter((c) => c.plan.preset !== 'walk'),
			staticLayout
		)
	).rejects.toThrow('needs only walk');
});

test('a reviewed body pack retains every native frame across all eight directions and fixes only authored layout and playback', async () => {
	const { source, clips, layout } = await fixture(),
		original = structuredClone(source),
		result = await buildStarterProject(source, clips, layout),
		{ project, evidence } = result;
	expect(source).toEqual(original);
	expect(project.manifest.rig.pivot).toEqual({ x: 4, y: 6 });
	expect(project.manifest.rig.directions).toEqual(DIRECTIONS.map((id) => ({ id })));
	expect(project.manifest.rig.animations.map((a) => [a.id, a.cells, a.loop])).toEqual([
		['default', 1, true],
		['idle', 4, true],
		['walk', 8, true],
		['slash', 8, false]
	]);
	expect(project.manifest.rig.rest!.south!.keypoints[0]).toEqual({
		label: LABELS[0],
		x: 0.125,
		y: 0.125
	});
	expect(project.manifest.rig.animations.slice(1).every((a) => !a.sources)).toBe(true);
	expect(project.manifest.items[0]).toMatchObject({
		status: 'accepted',
		provenance: [],
		qa: { status: 'warn', unmeasured: true }
	});
	expect(project.manifest.items).toHaveLength(1);
	expect(project.manifest.materials).toEqual([]);
	expect(project).not.toHaveProperty('character');
	expect(evidence).toMatchObject({
		qualified: false,
		equippedQualified: false,
		providerTiming: false
	});
	for (const clip of clips)
		for (const entry of clip.entries) {
			const rendered = composeCell(
				project,
				{ body: 'body' },
				clip.plan.preset,
				entry.direction,
				entry.index
			);
			const q = (3 * 32 + 2) * 4;
			expect([...rendered.data.slice(q, q + 4)]).toEqual([
				120 + PRESETS.indexOf(clip.plan.preset),
				40 + DIRECTIONS.indexOf(entry.direction),
				70 + entry.index,
				255
			]);
			expect(rendered.data.filter((_, i) => i % 4 === 3 && rendered.data[i] > 0)).toHaveLength(2);
			const detail = evidence.clips
				.find((c) => c.preset === clip.plan.preset)!
				.frames.find((f) => f.direction === entry.direction && f.index === entry.index)!;
			expect(detail.rgbaHash).toBe(await cellHash(entry.image));
		}
	expect(result.rawEntries).toHaveLength(168);
});

test('raw evidence carries exact re-encoded pixels and hashes while editable ZIP import preserves all native body frames', async () => {
	const { source, clips, layout } = await fixture(),
		{ project, evidence, rawEntries } = await buildStarterProject(source, clips, layout);
	const evidenceEntry = {
		name: 'starter-evidence.json',
		data: new TextEncoder().encode(JSON.stringify(evidence))
	};
	const packed = await zip([...(await projectEntries(project)), ...rawEntries, evidenceEntry]),
		files = await unzip(packed),
		restored = await readCharacterZip(packed);
	expect(restored.extra).toEqual({});
	expect(restored.project.manifest.rig.cell).toEqual(layout.cell);
	expect(restored.project.manifest.rig.pivot).toEqual(project.manifest.rig.pivot);
	for (const clip of evidence.clips)
		for (const frame of clip.frames) {
			const bytes = files.get(frame.path)!;
			expect(`sha256:${await sha256(bytes)}`).toBe(frame.archivePngHash);
			expect(await cellHash(await decodePngBytes(bytes))).toBe(frame.rgbaHash);
			const image = composeCell(
				restored.project,
				{ body: 'body' },
				clip.preset,
				frame.direction,
				frame.index
			);
			expect(await cellHash(image)).toBe(frame.outputHash);
		}
	const editable = JSON.parse(new TextDecoder().decode(files.get('project.json')!));
	expect(editable).not.toHaveProperty('character');
	expect(editable).not.toHaveProperty('skeletons');
	expect(restored.project.manifest.items[0].qa?.unmeasured).toBe(true);
});

test('layout confirmation and complete whole-view offsets are required without per-frame registration', async () => {
	const { source, clips, layout } = await fixture();
	await expect(buildStarterProject(source, clips, { ...layout, reviewed: false })).rejects.toThrow(
		'Review every native view'
	);
	await expect(buildStarterProject(source, clips, { ...layout, notes: '   ' })).rejects.toThrow(
		'record layout notes'
	);
	const missing = structuredClone(layout);
	delete missing.offsets.slash.west;
	await expect(buildStarterProject(source, clips, missing)).rejects.toThrow(
		'every action and native direction'
	);
	const fraction = structuredClone(layout);
	fraction.offsets.walk.south = { x: 0.5, y: 0 };
	await expect(buildStarterProject(source, clips, fraction)).rejects.toThrow('integer');
	const outside = { ...layout, restOffset: { x: 32, y: 2 } };
	await expect(buildStarterProject(source, clips, outside)).rejects.toThrow('pivot outside');
	await expect(
		buildStarterProject(source, clips, { ...layout, cell: { w: 32, h: 40 } })
	).rejects.toThrow('square of 32');
});

test('opaque motion clipping fails export instead of trimming the art and a changed layout must be reviewed again', async () => {
	const { source, clips, layout } = await fixture(),
		bad = structuredClone(layout);
	bad.offsets.idle.east = { x: -2, y: 0 };
	await expect(buildStarterProject(source, clips, bad)).rejects.toThrow('clips visible artwork');
	await expect(buildStarterProject(source, clips, { ...bad, reviewed: false })).rejects.toThrow(
		'Review every native view'
	);
});

test('missing actions, missing native directions and mixed source characters cannot produce a supposedly complete starter pack', async () => {
	const { source, clips, layout } = await fixture();
	await expect(buildStarterProject(source, clips.slice(1), layout)).rejects.toThrow('exactly idle');
	const missing = structuredClone(clips);
	missing[0].entries = missing[0].entries.slice(1);
	await expect(buildStarterProject(source, missing, layout)).rejects.toThrow('missing frames');
	const other = createStarterPlan(
		'other-character',
		source.manifest.rig,
		'walk',
		DIRECTIONS,
		clips[1].plan.seed
	);
	await expect(
		buildStarterProject(source, [clips[0], { ...clips[1], plan: other }, clips[2]], layout)
	).rejects.toThrow('same source character');
});

test('a changed source hash or actual source pixels and mismatched group receipts cannot reuse earlier review evidence', async () => {
	const first = await fixture(),
		changedRig = structuredClone(first.source);
	changedRig.manifest.rig.rest!.south!.image = `sha256:${'f'.repeat(64)}`;
	await expect(buildStarterProject(changedRig, first.clips, first.layout)).rejects.toThrow(
		'exact native standing'
	);
	const second = await fixture(),
		originalHash = second.source.manifest.rig.rest!.south!.image;
	second.source.images.get(originalHash)!.data[0] = 99;
	await expect(buildStarterProject(second.source, second.clips, second.layout)).rejects.toThrow(
		'no longer match'
	);
	const third = await fixture(),
		altered = structuredClone(third.clips);
	altered[0].receipts = [{ ...altered[0].receipts[0], binding: 'different-source-binding' }];
	await expect(buildStarterProject(third.source, altered, third.layout)).rejects.toThrow(
		'different source artwork'
	);
});

test('every direction needs a same-group receipt and separate actions cannot relabel one group or job set', async () => {
	const { source, clips, layout } = await fixture(),
		partial = structuredClone(clips);
	partial[0].receipts = [
		{ ...partial[0].receipts[0], jobs: partial[0].receipts[0].jobs.slice(0, 2) }
	];
	await expect(buildStarterProject(source, partial, layout)).rejects.toThrow(
		'All eight native directions'
	);
	const mixed = structuredClone(clips);
	mixed[1].receipts = [
		{ ...mixed[1].receipts[0], animationGroupId: mixed[0].receipts[0].animationGroupId }
	];
	await expect(buildStarterProject(source, mixed, layout)).rejects.toThrow('same animation group');
	const sameJobs = structuredClone(clips);
	sameJobs[1].receipts = [{ ...sameJobs[1].receipts[0], jobs: sameJobs[0].receipts[0].jobs }];
	await expect(buildStarterProject(source, sameJobs, layout)).rejects.toThrow('paid direction job');
});

test('source-frame holds use one eight-slot map across all native views and compile only six selected cells', async () => {
	const { source, clips, layout } = await fixture();
	layout.sourceFrames.slash = [7, 1, 1, 3, 4, 5, 6, 7];
	const { project, evidence, rawEntries } = await buildStarterProject(source, clips, layout),
		anim = project.manifest.rig.animations.find((a) => a.id === 'slash')!;
	const detail = evidence.clips.find((c) => c.preset === 'slash')!,
		selected = [7, 1, 3, 4, 5, 6];
	expect(anim.cells).toBe(6);
	expect(anim.loop).toBe(false);
	expect(anim.frames.map((f) => f.cell)).toEqual([0, 1, 1, 2, 3, 4, 5, 0]);
	expect(anim.frames.map((f) => f.ms)).toEqual(Array(8).fill(100));
	expect(detail.sourceFrames).toEqual(layout.sourceFrames.slash);
	expect(detail.uniquePlayableSourceFrames).toEqual(selected);
	expect(detail.frames).toHaveLength(64);
	expect(detail.playableFrames).toHaveLength(48);
	expect(rawEntries).toHaveLength(168);
	const attack = clips.find((c) => c.plan.preset === 'slash')!;
	for (const [d, direction] of DIRECTIONS.entries()) {
		expect(project.manifest.items[0].layers[0].cells!.slash[direction]).toHaveLength(6);
		for (const [slot, frame] of anim.frames.entries()) {
			const im = composeCell(project, { body: 'body' }, 'slash', direction, frame.cell),
				q = (3 * 32 + 2) * 4;
			expect([...im.data.slice(q, q + 4)]).toEqual([
				122,
				40 + d,
				70 + layout.sourceFrames.slash[slot],
				255
			]);
		}
		for (const index of [0, 2]) {
			const raw = attack.entries.find((e) => e.direction === direction && e.index === index)!,
				record = detail.frames.find((f) => f.direction === direction && f.index === index)!;
			expect(record).not.toHaveProperty('outputHash');
			expect(record).not.toHaveProperty('playableCell');
			expect(
				project.images.has(
					await cellHash(
						placeStarterImage(raw.image, layout.cell, layout.offsets.slash[direction]!)
					)
				)
			).toBe(false);
			const archived = rawEntries.find((e) => e.name === record.path)!;
			expect(await cellHash(await decodePngBytes(archived.data))).toBe(await cellHash(raw.image));
		}
	}
	const packed = await zip([...(await projectEntries(project)), ...rawEntries]),
		restored = (await readCharacterZip(packed)).project;
	expect(restored.manifest.rig.animations.find((a) => a.id === 'slash')!.frames).toEqual(
		anim.frames
	);
	expect(restored.images.size).toBe(project.images.size);
});

test('curated engine sheets exclude rejected raw samples but retain the shared holds and nonlooping attack metadata', async () => {
	const { source, clips, layout } = await fixture();
	layout.sourceFrames.slash = [7, 1, 1, 3, 4, 5, 6, 7];
	const { project } = await buildStarterProject(source, clips, layout),
		exported = await exportFiles(project, { engines: ['generic', 'phaser'], baked: true });
	expect(exported.errors).toEqual([]);
	expect(exported.entries.some((e) => e.name.startsWith('raw/'))).toBe(false);
	const files = new Map(exported.entries.map((e) => [e.name, e.data])),
		manifest = JSON.parse(new TextDecoder().decode(files.get('manifest.json')!));
	const anim = manifest.rig.animations.find((a: { id: string }) => a.id === 'slash');
	expect(anim.cells).toBe(6);
	expect(anim.loop).toBe(false);
	expect(anim.frames.map((f: { cell: number }) => f.cell)).toEqual([0, 1, 1, 2, 3, 4, 5, 0]);
	const sheet = await decodePngBytes(files.get(manifest.items[0].layers[0].sheets.slash)!);
	expect([sheet.w, sheet.h]).toEqual([32 * 6, 32 * 8]);
	for (const [d, direction] of DIRECTIONS.entries())
		for (const [cell, sourceIndex] of [7, 1, 3, 4, 5, 6].entries()) {
			const q = ((d * 32 + 3) * sheet.w + cell * 32 + 2) * 4;
			expect([...sheet.data.slice(q, q + 4)]).toEqual([122, 40 + d, 70 + sourceIndex, 255]);
			expect(direction).toBe(manifest.rig.directions[d].id);
		}
	const restored = (await readCharacterZip(await zip(exported.entries))).project;
	expect(restored.manifest.rig.animations.find((a) => a.id === 'slash')!.cells).toBe(6);
	expect(restored.manifest.rig.animations.find((a) => a.id === 'slash')!.loop).toBe(false);
});

test('missing, per-view, short, fractional and out-of-range source maps are refused without guessing another frame', async () => {
	const { source, clips, layout } = await fixture();
	const invalid = [
		undefined,
		{ ...layout.sourceFrames, slash: [7, 1] },
		{ ...layout.sourceFrames, slash: [8, 1, 1, 3, 4, 5, 6, 7] },
		{ ...layout.sourceFrames, slash: [-1, 1, 1, 3, 4, 5, 6, 7] },
		{ ...layout.sourceFrames, slash: [0.5, 1, 1, 3, 4, 5, 6, 7] },
		{
			...layout.sourceFrames,
			slash: { south: [7, 1, 1, 3, 4, 5, 6, 7], east: [0, 1, 2, 3, 4, 5, 6, 7] }
		}
	];
	for (const sourceFrames of invalid)
		await expect(
			buildStarterProject(source, clips, { ...layout, sourceFrames } as StarterLayout)
		).rejects.toThrow('one shared source-frame map');
	layout.sourceFrames.slash = [7, 1, 1, 3, 4, 5, 6, 7];
	const missingRaw = structuredClone(clips);
	missingRaw[2].entries = missingRaw[2].entries.filter((f) => f.index !== 0);
	await expect(buildStarterProject(source, missingRaw, layout)).rejects.toThrow('missing frames');
});

test('unequal native view canvases keep exact raw pixels and use only their explicit whole-view offsets through export', async () => {
	const { source, clips, layout } = await fixture();
	for (const clip of clips) {
		layout.offsets[clip.plan.preset].north = { x: 5, y: 3 };
		for (const entry of clip.entries)
			if (entry.direction === 'north') {
				const small = makeImg(4, 4);
				for (let y = 0; y < 4; y++)
					small.data.set(entry.image.data.subarray(y * 6 * 4, (y * 6 + 4) * 4), y * 4 * 4);
				entry.image = small;
			}
	}
	const { project, evidence, rawEntries } = await buildStarterProject(source, clips, layout);
	expect(project.manifest.rig.cell).toEqual({ w: 32, h: 32 });
	expect(project.manifest.rig.pivot).toEqual({ x: 4, y: 6 });
	for (const clip of clips) {
		const detail = evidence.clips.find((c) => c.preset === clip.plan.preset)!;
		expect(detail.nativeCells.north).toEqual({ w: 4, h: 4 });
		expect(detail.nativeCells.south).toEqual({ w: 6, h: 6 });
		for (const frame of detail.frames) {
			const raw = await decodePngBytes(rawEntries.find((e) => e.name === frame.path)!.data);
			expect([raw.w, raw.h]).toEqual(frame.direction === 'north' ? [4, 4] : [6, 6]);
			expect(await cellHash(raw)).toBe(frame.rgbaHash);
			const output = composeCell(
				project,
				{ body: 'body' },
				clip.plan.preset,
				frame.direction,
				frame.playableCell!
			);
			const x = frame.direction === 'north' ? 6 : 2,
				y = frame.direction === 'north' ? 5 : 3,
				q = (y * 32 + x) * 4;
			expect([...output.data.slice(q, q + 4)]).toEqual([
				120 + PRESETS.indexOf(clip.plan.preset),
				40 + DIRECTIONS.indexOf(frame.direction),
				70 + frame.index,
				255
			]);
		}
	}
	const engine = await exportFiles(project, { engines: ['generic'], baked: false });
	expect(engine.errors).toEqual([]);
	const restored = (await readCharacterZip(await zip(engine.entries))).project;
	for (const clip of evidence.clips)
		for (const frame of clip.playableFrames)
			expect(
				await cellHash(
					composeCell(restored, { body: 'body' }, clip.preset, frame.direction, frame.cell)
				)
			).toBe(frame.outputHash);
});
