import { readFileSync } from 'node:fs';
import { expect, test } from 'vitest';
import { makeImg } from '../../src/lib/image/png.ts';
import {
	decisiveAction,
	isAction,
	itemQa,
	slotOf,
	type CellOut
} from '../../src/lib/items/items.ts';
import { actionOf, moveWords } from '../../src/lib/rig/clips.ts';
import { LABELS } from '../../src/lib/rig/poses.ts';
import type { DirectionName, Rig } from '../../src/lib/rig/rig.ts';

const bench = (b: string) =>
	JSON.parse(readFileSync(new URL(`../fixtures/bench/body${b}.json`, import.meta.url), 'utf8'))
		.rig as Rig;

test('move ids are read as whole words', () => {
	expect(moveWords('Walk_Cycle')).toEqual(['walk', 'cycle']);
	expect(moveWords('jogIn')).toEqual(['jog', 'in']);
	expect(actionOf('walk')).toBe('walking');
	expect(actionOf('run-slash')).toBe('running');
	expect(actionOf('rune-blast')).toBe('rune-blast'); // was "running": "rune" contains "run"
	expect(actionOf('slash')).toBe('slash');
});

test('gait words count as locomotion; unknown and look-alike names stay actions', () => {
	for (const id of [
		'walk',
		'idle',
		'run',
		'jog',
		'sprint',
		'stroll',
		'march',
		'trot',
		'breathe',
		'Walk_Cycle',
		'slow-jog',
		'walk2',
		'idle2',
		'walks-forward',
		'runs'
	])
		expect(isAction(`${id}/south`), id).toBe(false);
	for (const id of [
		'slash',
		'cast',
		'hurt',
		'death',
		'dance',
		'rune-blast',
		'walkie-talkie',
		'default',
		'sneak'
	])
		expect(isAction(`${id}/south`), id).toBe(true);
	expect(actionOf('walk2')).toBe('walking'); // as before: a digit suffix keeps the request text
});

test('only clearly large stored motion overrides a locomotion name, and no bench walk or idle reaches it', () => {
	for (const b of ['A', 'B', 'C', 'N']) {
		const rig = bench(b);
		for (const a of rig.animations)
			for (const dir of Object.keys(a.sources ?? {}) as DirectionName[]) {
				expect(decisiveAction(rig, a.id, dir), `${b} ${a.id}/${dir}`).toBe(a.id === 'slash');
			}
	}
	// An attack named like a gait is still judged as an action by its motion.
	const rig = bench('A'),
		slash = rig.animations.find((a) => a.id === 'slash')!;
	rig.animations.push({ ...slash, id: 'run-slash' });
	expect(isAction('run-slash/south', rig)).toBe(true);
	expect(isAction('run-slash/south')).toBe(false); // without the stored motion, only the name speaks
});

test('one estimate with swapped hands or a jump does not make a walk an action', () => {
	const rig = bench('A'),
		walk = rig.animations.find((a) => a.id === 'walk')!,
		src = walk.sources!.south!;
	const swap = (l: string) => l.replace(/^(RIGHT|LEFT)/, (s) => (s === 'RIGHT' ? 'LEFT' : 'RIGHT'));
	src.measured = src.keypoints!.map((f, i) =>
		i === 3 ? f.map((p) => ({ ...p, label: p.label.endsWith('ARM') ? swap(p.label) : p.label })) : f
	);
	expect(decisiveAction(rig, 'walk', 'south')).toBe(false);
	src.measured = src.keypoints!.map((f, i) =>
		i === 3 ? f.map((p) => ({ ...p, y: p.y - 0.3 })) : f
	); // the whole body lifted
	expect(decisiveAction(rig, 'walk', 'south')).toBe(false);
});

test('one bad joint estimate cannot make a walk an action (2026-11-07 review R2)', () => {
	const rig = bench('A'),
		walk = rig.animations.find((a) => a.id === 'walk')!,
		src = walk.sources!.south!;
	// one eye thrown to the corner of the frame in one frame
	src.measured = src.keypoints!.map((f, i) =>
		i === 2 ? f.map((p) => (p.label === 'RIGHT EYE' ? { ...p, x: 0.95, y: 0.95 } : p)) : f
	);
	expect(decisiveAction(rig, 'walk', 'south')).toBe(false);
	// the same eye wrong in every frame is still one joint
	src.measured = src.keypoints!.map((f) =>
		f.map((p) => (p.label === 'RIGHT EYE' ? { ...p, x: 0.95, y: 0.95 } : p))
	);
	expect(decisiveAction(rig, 'walk', 'south')).toBe(false);
	// correlated bad estimates in two frames: both eyes in the corner, a wrist thrown above the head, a knee in the corner
	for (const bad of [
		(p: { label: string }) => (/EYE/.test(p.label) ? { x: 0.95, y: 0.95 } : null),
		(p: { label: string }) => (p.label === 'RIGHT ARM' ? { y: 0.02 } : null),
		(p: { label: string }) => (p.label === 'RIGHT KNEE' ? { x: 0.02, y: 0.02 } : null)
	]) {
		src.measured = src.keypoints!.map((f, i) =>
			i === 2 || i === 4 ? f.map((p) => ({ ...p, ...(bad(p) ?? {}) })) : f
		);
		expect(decisiveAction(rig, 'walk', 'south')).toBe(false);
	}
});

test('one bad trunk estimate cannot make a walk an action either', () => {
	const rig = bench('A'),
		walk = rig.animations.find((a) => a.id === 'walk')!,
		src = walk.sources!.south!;
	const cases: ((p: { label: string; x: number; y: number }) => object | null)[] = [
		(p) => (p.label === 'NECK' ? { x: p.x + 0.25 } : null),
		(p) => (p.label === 'NECK' ? { x: 0.98, y: 0.5 } : null),
		(p) => (p.label === 'RIGHT HIP' ? { x: p.x + 0.4 } : null),
		(p) => (p.label === 'RIGHT HIP' ? { x: 0.98, y: 0.02 } : null)
	];
	for (const bad of cases) {
		src.measured = src.keypoints!.map((f, i) =>
			i === 2 ? f.map((p) => ({ ...p, ...(bad(p) ?? {}) })) : f
		);
		expect(decisiveAction(rig, 'walk', 'south')).toBe(false);
	}
});

test('one detached trunk, face or limb joint cannot make a walk an action (2026-11-07 session counter-review F1)', () => {
	// A lone joint whose own chain to the trunk looks plausible still stretches the bones to its children: the neck below the
	// hips, the nose, an elbow or a knee thrown away from its wrist or ankle, or one hip moving the hip center.
	// decisiveAction judges each frame on its own (one decisive frame decides), so once the stored walk decides nothing, a clip of
	// only the changed frame gives the walk's answer. Re-judging the 7 unchanged frames for each of the 44,800 cases took 6 s
	// locally and over 10 s on CI. Two checks keep the shortcut honest if frames are ever compared: one tipped frame must still
	// decide alone, and the real walk is judged at the points where the classifier before this fix (19646f09) failed most.
	for (const b of ['A', 'B', 'C', 'N']) {
		const rig = bench(b),
			walk = rig.animations.find((a) => a.id === 'walk')!;
		for (const dir of Object.keys(walk.sources ?? {}) as DirectionName[]) {
			const src = walk.sources![dir]!,
				base = src.measured ?? src.keypoints!;
			src.measured = base;
			expect(decisiveAction(rig, 'walk', dir), `${b} ${dir} stored walk`).toBe(false);
			src.measured = [tip(base[1], 60)];
			expect(decisiveAction(rig, 'walk', dir), `${b} ${dir} one tipped frame`).toBe(true);
			for (const label of [
				'NECK',
				'NOSE',
				'RIGHT ELBOW',
				'LEFT ELBOW',
				'RIGHT KNEE',
				'LEFT KNEE',
				'RIGHT HIP',
				'LEFT HIP'
			]) {
				for (const [x, y] of [
					[0.325, 0.825],
					[0.475, 0.375],
					[0.275, 0.525],
					[0.625, 0.475],
					[0.525, 0.425]
				]) {
					src.measured = base.map((f, i) =>
						i === 1 ? f.map((p) => (p.label === label ? { ...p, x, y } : p)) : f
					);
					expect(
						decisiveAction(rig, 'walk', dir),
						`${b} ${dir} ${label} (${x}, ${y}) in the walk`
					).toBe(false);
				}
				for (let x = 0.025; x < 1; x += 0.05)
					for (let y = 0.025; y < 1; y += 0.05) {
						src.measured = [base[1].map((p) => (p.label === label ? { ...p, x, y } : p))];
						expect(
							decisiveAction(rig, 'walk', dir),
							`${b} ${dir} ${label} (${x.toFixed(3)}, ${y.toFixed(3)})`
						).toBe(false);
					}
			}
			src.measured = base === src.keypoints ? undefined : base;
		}
	}
});

test('one detached hip cannot lean a walk into an action (review of the F1 correction)', () => {
	// A stored 64 px import walk (spikes/api/out/user-import-review-2026-10-27, south-east, frame 0): moving only the left hip
	// shifts the hip center so the neck and shoulders seem to lean 41 degrees about it, while every bone stays under the limit.
	const kp = (rows: [string, number, number][]) => rows.map(([label, x, y]) => ({ label, x, y }));
	const rest = kp([
		['NOSE', 0.56, 0.306],
		['NECK', 0.489, 0.399],
		['RIGHT SHOULDER', 0.419, 0.408],
		['RIGHT ELBOW', 0.388, 0.511],
		['RIGHT ARM', 0.413, 0.599],
		['LEFT SHOULDER', 0.56, 0.39],
		['LEFT ELBOW', 0.585, 0.495],
		['LEFT ARM', 0.601, 0.577],
		['RIGHT HIP', 0.47, 0.579],
		['RIGHT KNEE', 0.451, 0.706],
		['RIGHT LEG', 0.428, 0.811],
		['LEFT HIP', 0.549, 0.576],
		['LEFT KNEE', 0.556, 0.699],
		['LEFT LEG', 0.558, 0.791],
		['RIGHT EYE', 0.524, 0.281],
		['LEFT EYE', 0.578, 0.281],
		['RIGHT EAR', 0.444, 0.274],
		['LEFT EAR', 0.544, 0.269]
	]);
	const frame = kp([
		['NOSE', 0.603, 0.313],
		['NECK', 0.526, 0.403],
		['RIGHT SHOULDER', 0.444, 0.404],
		['RIGHT ELBOW', 0.378, 0.468],
		['RIGHT ARM', 0.357, 0.565],
		['LEFT SHOULDER', 0.607, 0.403],
		['LEFT ELBOW', 0.637, 0.485],
		['LEFT ARM', 0.683, 0.543],
		['RIGHT HIP', 0.494, 0.584],
		['RIGHT KNEE', 0.532, 0.711],
		['RIGHT LEG', 0.551, 0.82],
		['LEFT HIP', 0.56, 0.586],
		['LEFT KNEE', 0.482, 0.686],
		['LEFT LEG', 0.432, 0.74],
		['RIGHT EYE', 0.56, 0.285],
		['LEFT EYE', 0.626, 0.285],
		['RIGHT EAR', 0.477, 0.276],
		['LEFT EAR', 0.592, 0.274]
	]);
	const rig = (measured: typeof frame) =>
		({
			cell: { w: 64, h: 64 },
			rest: { 'south-east': { keypoints: rest } },
			animations: [{ id: 'walking', sources: { 'south-east': { measured: [measured] } } }]
		}) as unknown as Rig;
	expect(decisiveAction(rig(frame), 'walking', 'south-east')).toBe(false);
	expect(
		decisiveAction(
			rig(frame.map((p) => (p.label === 'LEFT HIP' ? { ...p, x: 0.34, y: 0.54 } : p))),
			'walking',
			'south-east'
		)
	).toBe(false);
	// the lean itself still decides when the whole upper body tips: the shoulders, neck and head turned 60 degrees about the hips
	const hips = [(0.494 + 0.56) / 2, 0.585],
		turn = (x: number, y: number) => {
			const c = Math.cos(Math.PI / 3),
				s = Math.sin(Math.PI / 3),
				dx = x - hips[0],
				dy = y - hips[1];
			return { x: hips[0] + dx * c - dy * s, y: hips[1] + dx * s + dy * c };
		};
	const upper = /NOSE|NECK|SHOULDER|ELBOW|ARM|EYE|EAR/;
	expect(
		decisiveAction(
			rig(frame.map((p) => (upper.test(p.label) ? { ...p, ...turn(p.x, p.y) } : p))),
			'walking',
			'south-east'
		)
	).toBe(true);
});

test('a short slash named like a gait is still an action (4 of its 8 frames)', () => {
	const rig = bench('A'),
		slash = rig.animations.find((a) => a.id === 'slash')!;
	for (const pick of [
		[0, 2, 4, 6],
		[1, 3, 5, 7]
	]) {
		const src = slash.sources!.south!,
			take = <T>(a?: T[]) => a && pick.map((i) => a[i]);
		rig.animations.push({
			...slash,
			id: 'run-slash',
			cells: 4,
			sources: {
				south: {
					...src,
					keypoints: take(src.keypoints),
					...(src.measured ? { measured: take(src.measured) } : {})
				}
			}
		});
		expect(isAction('run-slash/south', rig), pick.join()).toBe(true);
		rig.animations.pop();
	}
});

type Point = { label: string; x: number; y: number };
const UPPER = /NOSE|NECK|SHOULDER|ELBOW|ARM|EYE|EAR/;
const hipsOf = (pose: Point[]) => {
	const r = pose.find((p) => p.label === 'RIGHT HIP')!,
		l = pose.find((p) => p.label === 'LEFT HIP')!;
	return [(r.x + l.x) / 2, (r.y + l.y) / 2];
};
/** The whole upper body tipped `deg` about the hip center, every bone kept: a coherent lean (dodge, duck, bow). */
const tip = (pose: Point[], deg: number) => {
	const [hx, hy] = hipsOf(pose),
		t = (deg * Math.PI) / 180,
		c = Math.cos(t),
		s = Math.sin(t);
	return pose.map((p) =>
		UPPER.test(p.label)
			? { ...p, x: hx + (p.x - hx) * c - (p.y - hy) * s, y: hy + (p.x - hx) * s + (p.y - hy) * c }
			: p
	);
};
const leanRig = (id: string, dir: DirectionName, rest: Point[], frames: Point[][]) =>
	({
		cell: { w: 64, h: 64 },
		rest: { [dir]: { keypoints: rest } },
		animations: [{ id, sources: { [dir]: { keypoints: frames, measured: frames } } }]
	}) as unknown as Rig;

test('a coherent moderate lean is an action at the hip threshold on every bench body (2026-11-07 50eeea36 counter-review C1)', () => {
	// The knees sit further from the shoulders than the hips do, so the same lean turns the shoulders less about the knees: a
	// 45 degree lean read about 30 degrees there, and bench bodies needed 42 to 68 degrees before they counted as an action.
	for (const b of ['A', 'B', 'C', 'N']) {
		const rig = bench(b);
		for (const dir of Object.keys(rig.rest ?? {}) as DirectionName[]) {
			const rest = rig.rest![dir]!.keypoints as Point[];
			for (const sign of [1, -1]) {
				const at = (deg: number) =>
					leanRig('run-dodge', dir, rest, [rest, tip(rest, sign * deg), rest]);
				expect(decisiveAction(at(45), 'run-dodge', dir), `${b} ${dir} ${sign * 45}`).toBe(true);
				// the threshold itself is unchanged: a 30 degree lean is still within reach of a run
				expect(decisiveAction(at(30), 'run-dodge', dir), `${b} ${dir} ${sign * 30}`).toBe(false);
			}
		}
	}
});

test('a gait word in an action name does not hide its moderate lean; an ordinary action name needs none', () => {
	const rig = bench('A'),
		rest = rig.rest!.south!.keypoints as Point[];
	const leaning = [rest, tip(rest, 45), rest],
		still = [rest, rest, rest];
	for (const id of ['run-dodge', 'walk-bow', 'dodge'])
		expect(isAction(`${id}/south`, leanRig(id, 'south', rest, leaning)), id).toBe(true);
	expect(isAction('run-dodge/south', leanRig('run-dodge', 'south', rest, still))).toBe(false);
	expect(isAction('dodge/south', leanRig('dodge', 'south', rest, still))).toBe(true);
});

test('hips sliding under still shoulders, or one hip or the neck thrown, is no lean', () => {
	for (const b of ['A', 'B', 'C', 'N']) {
		const rig = bench(b);
		for (const dir of Object.keys(rig.rest ?? {}) as DirectionName[]) {
			const rest = rig.rest![dir]!.keypoints as Point[],
				walk = (f: Point[]) => leanRig('walk', dir, rest, [rest, f, rest]);
			// only the hip center moves, sideways by up to the torso length: the shoulders lean about the hips, not about the knees
			for (const dx of [-0.2, -0.12, 0.12, 0.2])
				expect(
					decisiveAction(
						walk(rest.map((p) => (/HIP/.test(p.label) ? { ...p, x: p.x + dx } : p))),
						'walk',
						dir
					),
					`${b} ${dir} hips ${dx}`
				).toBe(false);
			for (const [label, x, y] of [
				['LEFT HIP', 0.05, 0.5],
				['RIGHT HIP', 0.95, 0.5],
				['NECK', 0.05, 0.5],
				['NECK', 0.95, 0.95]
			] as const)
				expect(
					decisiveAction(
						walk(rest.map((p) => (p.label === label ? { ...p, x, y } : p))),
						'walk',
						dir
					),
					`${b} ${dir} ${label}`
				).toBe(false);
		}
	}
});

/** A 64 px stick body standing south, for the held-item gate tests. */
const STICK: Record<string, [number, number]> = {
	NOSE: [32, 10],
	NECK: [32, 20],
	'RIGHT SHOULDER': [24, 22],
	'LEFT SHOULDER': [40, 22],
	'RIGHT ELBOW': [20, 27],
	'LEFT ELBOW': [44, 27],
	'RIGHT ARM': [20, 35],
	'LEFT ARM': [44, 35],
	'RIGHT HIP': [28, 40],
	'LEFT HIP': [36, 40],
	'RIGHT KNEE': [28, 50],
	'LEFT KNEE': [36, 50],
	'RIGHT LEG': [28, 60],
	'LEFT LEG': [36, 60],
	'RIGHT EYE': [30, 9],
	'LEFT EYE': [34, 9],
	'RIGHT EAR': [28, 10],
	'LEFT EAR': [36, 10]
};
const stick = LABELS.map((label) => ({ label, x: STICK[label][0] / 64, y: STICK[label][1] / 64 }));
/** A 2 px torch, 16 px long, rising from the right wrist `deg` from upright. */
const torch = (pose: Point[], deg: number, i: number, id: string): CellOut => {
	const base = makeImg(64, 64),
		layer = makeImg(64, 64),
		mask = new Uint8Array(64 * 64),
		wr = pose.find((p) => p.label === 'RIGHT ARM')!,
		t = (deg * Math.PI) / 180;
	for (let s = 0; s < 16; s += 0.25)
		for (const o of [-0.5, 0.5]) {
			const x = Math.floor(wr.x * 64 + s * Math.sin(t) + o * Math.cos(t)),
				y = Math.floor(wr.y * 64 - s * Math.cos(t) + o * Math.sin(t)),
				q = y * 64 + x;
			if (!mask[q]) {
				mask[q] = 1;
				layer.data.set(s > 12 ? [235, 170, 35, 255] : [130, 80, 40, 255], q * 4);
			}
		}
	return {
		key: `${id}/south/${i}`,
		call: 0,
		base,
		input: base,
		out: layer,
		layer,
		mask,
		area: mask.reduce((a, v) => a + v, 0),
		outBand: 0,
		baseBand: 0,
		specks: 0,
		pinholes: 0,
		shifted: false,
		offset: [0, 0],
		stray: 0,
		posed: true
	};
};
/** The G9 failures of a torch held at `degs` through the requested poses, with the measured joints the classifier reads. */
const g9 = (id: string, requested: Point[][], measured: Point[][], degs: number[]) => {
	const rig = {
		cell: { w: 64, h: 64 },
		pivot: { x: 32, y: 60 },
		baseItem: 'base',
		baseHash: 'sha256:test',
		directions: [{ id: 'south' }],
		rest: { south: { image: 'sha256:test', keypoints: stick } },
		animations: [
			{
				id,
				cells: requested.length,
				loop: false,
				frames: requested.map((_, cell) => ({ cell, ms: 100 })),
				sources: {
					south: {
						route: 'skeleton-v3',
						reference: 'sha256:test',
						keypoints: requested,
						measured,
						provenance: []
					}
				}
			}
		]
	} as unknown as Rig;
	const cells = requested.map((pose, i) => torch(pose, degs[i], i, id));
	return [...itemQa(rig, slotOf('main_hand'), 'green', cells, 0).failCalls.values()]
		.flat()
		.filter((why) => why.startsWith('G9'));
};

test('G9 lets a torch stay upright through a coherent lean, under a gait name too, and still checks it on a walk with a thrown neck', () => {
	const rest = stick;
	const lean = [rest, tip(rest, 45), rest];
	for (const id of ['run-dodge', 'dodge']) expect(g9(id, lean, lean, [0, 0, 0]), id).toEqual([]);
	// a walk whose neck estimate is thrown in one frame is still a walk: a torch that twists in the still hand fails
	const thrown = [
			rest,
			rest.map((p) => (p.label === 'NECK' ? { ...p, x: 0.05, y: 0.5 } : p)),
			rest
		],
		still = [rest, rest, rest];
	expect(g9('walk', still, thrown, [0, 45, 0])).toEqual([
		expect.stringMatching(/^G9 walk\/south: the item turns 4\d° against the hand/)
	]);
	expect(g9('walk', still, thrown, [0, 0, 0])).toEqual([]);
});

test('one wrong hip estimate cannot make a leaning, striding run an action (2026-11-07 3eed2a9c counter-review N1)', () => {
	// A real 30 degree lean with the left leg swung 45 degrees: the swing moves the knee midpoint, so the knee lean read 42
	// degrees after scaling, and one hip estimate thrown 9 px pushed the lean about the hip center past 40 too.
	const swing = (pose: Point[], deg: number) => {
		const hip = pose.find((p) => p.label === 'LEFT HIP')!,
			t = (deg * Math.PI) / 180,
			c = Math.cos(t),
			s = Math.sin(t);
		return pose.map((p) =>
			/^LEFT (KNEE|LEG)$/.test(p.label)
				? {
						...p,
						x: hip.x + (p.x - hip.x) * c - (p.y - hip.y) * s,
						y: hip.y + (p.x - hip.x) * s + (p.y - hip.y) * c
					}
				: p
		);
	};
	const stride = swing(tip(stick, 30), 45),
		poses = [stick, stick, stride, stick];
	const run = (frame: Point[]) =>
		({
			cell: { w: 64, h: 64 },
			rest: { south: { keypoints: stick } },
			animations: [
				{
					id: 'run',
					sources: { south: { keypoints: poses, measured: [stick, stick, frame, stick] } }
				}
			]
		}) as unknown as Rig;
	const thrown = stride.map((p) => (p.label === 'RIGHT HIP' ? { ...p, x: 0.32, y: 0.54 } : p));
	expect(isAction('run/south', run(stride))).toBe(false);
	expect(isAction('run/south', run(thrown))).toBe(false);
	// nowhere else for either hip in that frame
	for (const label of ['RIGHT HIP', 'LEFT HIP'])
		for (let x = 0.01; x < 1; x += 0.02)
			for (let y = 0.01; y < 1; y += 0.02)
				expect(
					decisiveAction(
						run(stride.map((p) => (p.label === label ? { ...p, x, y } : p))),
						'run',
						'south'
					),
					`${label} (${x.toFixed(2)}, ${y.toFixed(2)})`
				).toBe(false);
	// so G9 still fails a torch reversed against the hand in that frame, and passes one that turns with it
	const measured = [stick, stick, thrown, stick];
	expect(g9('run', poses, measured, [0, 0, 210, 0])).toEqual([
		expect.stringMatching(/^G9 run\/south: the item turns 180° against the hand/)
	]);
	expect(g9('run', poses, measured, [0, 0, 30, 0])).toEqual([]);
	// while the same stride with a 45 degree lean is still an action
	expect(
		decisiveAction(
			leanRig('run', 'south', stick, [stick, swing(tip(stick, 45), 45), stick]),
			'run',
			'south'
		)
	).toBe(true);
});

test('a coherent action lean stays decisive when the pelvis counter-tilts', () => {
	const counterTilt = (lean: number, pelvis: number) => {
		const upper = tip(stick, lean),
			[hx, hy] = hipsOf(stick),
			t = (pelvis * Math.PI) / 180;
		const pose = upper.map((p) => {
			if (UPPER.test(p.label)) return p;
			const hip = stick.find(
				(q) => q.label === (p.label.startsWith('RIGHT') ? 'RIGHT HIP' : 'LEFT HIP')
			)!;
			const dx = hip.x - hx,
				dy = hip.y - hy;
			return {
				...p,
				x: p.x + hx + dx * Math.cos(t) - dy * Math.sin(t) - hip.x,
				y: p.y + hy + dx * Math.sin(t) + dy * Math.cos(t) - hip.y
			};
		});
		// Move the whole pose to keep the support sole at the standing height, without changing any bone or relative angle.
		const bottom = Math.max(...pose.filter((p) => p.label.endsWith('LEG')).map((p) => p.y)),
			restBottom = Math.max(...stick.filter((p) => p.label.endsWith('LEG')).map((p) => p.y));
		return pose.map((p) => ({ ...p, y: p.y - bottom + restBottom }));
	};
	for (const sign of [-1, 1]) {
		const frame = counterTilt(sign * 45, -sign * 30),
			poses = [stick, stick, frame, stick];
		for (const id of ['run-dodge', 'dodge']) {
			expect(isAction(`${id}/south`, leanRig(id, 'south', stick, poses)), id).toBe(true);
			expect(g9(id, poses, poses, [0, 0, 0, 0]), id).toEqual([]);
		}
		const stillTorso = counterTilt(0, -sign * 30);
		expect(
			isAction('run-dodge/south', leanRig('run-dodge', 'south', stick, [stick, stillTorso, stick]))
		).toBe(false);
	}
});

test('one head or shoulder estimate cannot promote a subthreshold lean to an action', () => {
	const frame = tip(stick, 30);
	for (const label of ['NOSE', 'NECK', 'RIGHT SHOULDER', 'LEFT SHOULDER'])
		for (const x of [0.05, 0.25, 0.5, 0.75, 0.95])
			for (const y of [0.05, 0.25, 0.5, 0.75, 0.95]) {
				const measured = frame.map((p) => (p.label === label ? { ...p, x, y } : p));
				expect(
					isAction(
						'run-dodge/south',
						leanRig('run-dodge', 'south', stick, [stick, measured, stick])
					),
					`${label} (${x}, ${y})`
				).toBe(false);
			}
});
