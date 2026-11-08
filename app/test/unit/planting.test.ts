import { readFileSync } from 'node:fs';
import { expect, test } from 'vitest';
import {
	newDocument,
	buildDocument,
	renderPoses,
	type MotionLibrary
} from '../../src/ui/motion-lab/model.ts';
import { proposePlanting, contactSampling } from '../../src/ui/motion-lab/diagnostics.ts';
import { contactAt, validatePlanting } from '../../src/lib/rig/planting.ts';
import { MOTION_EDGES, length3, sub3 } from '../../src/lib/rig/motion.ts';
const library = JSON.parse(
	readFileSync(new URL('../../dev-fixtures/motion-lab/library.json', import.meta.url), 'utf8')
) as MotionLibrary;
test('authored target contacts stay world-fixed at full weight without stretching either leg', () => {
	const doc = newDocument(
		library,
		library.fixtures[0],
		library.clips.find((c) => c.id === 'walk')!
	);
	doc.planting = proposePlanting(doc);
	const fit = buildDocument({ ...doc, times: doc.clip.samples.map((s) => s.time) });
	let count = 0;
	for (const frame of fit.frames) {
		for (const contact of frame.planting ?? [])
			if (contact.weight > 0.999) {
				expect(contact.error).toBeLessThan(0.01);
				count++;
			}
		for (const [a, b] of MOTION_EDGES)
			expect(length3(sub3(frame.points[a], frame.points[b]))).toBeCloseTo(
				length3(sub3(fit.reference[a], fit.reference[b])),
				7
			);
	}
	expect(count).toBeGreaterThan(5);
	expect(() => renderPoses(doc)).not.toThrow();
});
test('wrapped stance windows use cycle-shifted anchors and smooth transitions', () => {
	const plan = {
		version: 1 as const,
		velocity: [0, 10] as [number, number],
		windows: [
			{
				foot: 'RIGHT LEG' as const,
				start: -0.2,
				end: 0.2,
				fade: 0.05,
				anchor: [0, 0, 0] as [number, number, number]
			}
		]
	};
	validatePlanting(plan, 1);
	expect(contactAt(plan, 0.95, 1, true)[0].target[2]).toBeCloseTo(0.5);
	expect(contactAt(plan, 0.05, 1, true)[0].target[2]).toBeCloseTo(-0.5);
	expect(contactAt(plan, 0.2, 1, true)).toEqual([]);
	expect(contactAt(plan, 0.5, 1, true)).toEqual([]);
	expect(() =>
		validatePlanting(
			{ ...plan, windows: [...plan.windows, { ...plan.windows[0], start: 0.1, end: 0.3 }] },
			1
		)
	).toThrow('overlap');
});
test('unreachable contact plans are exposed before any paid request', () => {
	const doc = newDocument(library);
	doc.planting = {
		version: 1,
		velocity: [0, 0],
		windows: [{ foot: 'RIGHT LEG', start: 0, end: 1, fade: 0, anchor: [10000, 0, 10000] }]
	};
	expect(
		buildDocument(doc).frames.some((f) => f.issues.some((i) => i.includes('unreachable')))
	).toBe(true);
	expect(() => renderPoses(doc)).toThrow('Authored contacts');
});
test('touching stance boundaries have deterministic ownership regardless of document order', () => {
	const a = {
			foot: 'RIGHT LEG' as const,
			start: 0,
			end: 0.5,
			fade: 0,
			anchor: [0, 0, 0] as [number, number, number]
		},
		b = { ...a, start: 0.5, end: 1, anchor: [10, 0, 0] as [number, number, number] },
		plan = { version: 1 as const, velocity: [0, 0] as [number, number], windows: [a, b] };
	validatePlanting(plan, 1);
	expect(contactAt(plan, 0.5, 1, true)).toEqual(
		contactAt({ ...plan, windows: [b, a] }, 0.5, 1, true)
	);
	expect(contactAt(plan, 0.5, 1, true)[0].target).toEqual([10, 0, 0]);
});
test('contact-focused render samples retain short running stances and exact cycle timing', () => {
	const doc = newDocument(
		library,
		library.fixtures[0],
		library.clips.find((c) => c.id === 'run')!
	);
	doc.planting = proposePlanting(doc);
	Object.assign(doc, contactSampling(doc));
	expect(doc.times).toHaveLength(12);
	expect(doc.durations.reduce((a, b) => a + b, 0)).toBe(Math.round(doc.clip.duration * 1000));
	expect(Math.min(...doc.durations)).toBeGreaterThanOrEqual(10);
	expect(
		buildDocument(doc).frames.flatMap((f) => f.planting?.filter((c) => c.weight > 0.999) ?? [])
			.length
	).toBeGreaterThanOrEqual(4);
});
