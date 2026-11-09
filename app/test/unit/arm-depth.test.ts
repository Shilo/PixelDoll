import { expect, test } from 'vitest';
import { armDepth } from '../../src/lib/rig/poses.ts';
import type { Keypoint } from '../../src/lib/rig/rig.ts';

// Front view: the character's right side is on the image left (right shoulder x 0.4, neck 0.5). `lean` moves the neck sideways.
const pose = (rightWrist: number, leftWrist = 0.65, lean = 0): Keypoint[] => [
	{ label: 'NECK', x: 0.5 + lean, y: 0.4 },
	{ label: 'RIGHT SHOULDER', x: 0.4 + lean, y: 0.42 },
	{ label: 'RIGHT ELBOW', x: 0.45, y: 0.5 },
	{ label: 'RIGHT ARM', x: rightWrist, y: 0.55 },
	{ label: 'LEFT SHOULDER', x: 0.6 + lean, y: 0.42 },
	{ label: 'LEFT ELBOW', x: 0.62, y: 0.5 },
	{ label: 'LEFT ARM', x: leftWrist, y: 0.58 },
	{ label: 'RIGHT HIP', x: 0.46, y: 0.62 },
	{ label: 'LEFT HIP', x: 0.54, y: 0.62 }
];
const hinted = (k: Keypoint[]) =>
	Object.fromEntries(
		k.filter((q) => q.depth !== undefined).map((q) => [q.label, [q.depth, q.z_index]])
	);

test('a wrist across the center line is in front of the body: nearer from the front, farther from behind', () => {
	expect(hinted(armDepth(pose(0.55), 'south'))).toEqual({
		'RIGHT ARM': [176, 1],
		'RIGHT ELBOW': [176, 1]
	});
	expect(hinted(armDepth(pose(0.55), 'north'))).toEqual({
		'RIGHT ARM': [80, -1],
		'RIGHT ELBOW': [80, -1]
	});
	expect(hinted(armDepth(pose(0.32, 0.45), 'south'))).toEqual({
		'LEFT ARM': [176, 1],
		'LEFT ELBOW': [176, 1]
	});
	expect(hinted(armDepth(pose(0.32, 0.45), 'north'))).toEqual({
		'LEFT ARM': [80, -1],
		'LEFT ELBOW': [80, -1]
	});
});

test('no hints for an arm on its own side, a leaning torso, side or diagonal views, or missing joints', () => {
	const own = pose(0.42); // inside the torso width but not across: it may be swinging behind the body
	expect(armDepth(own, 'south')).toBe(own);
	const fall = pose(0.55, 0.65, 0.12); // neck well off the pelvis: "past the center line" no longer means in front
	expect(armDepth(fall, 'north')).toBe(fall);
	expect(armDepth(pose(0.55), 'east')).toEqual(pose(0.55));
	expect(armDepth(pose(0.55), 'south-east')).toEqual(pose(0.55));
	const noNeck = pose(0.55).filter((q) => q.label !== 'NECK');
	expect(armDepth(noNeck, 'south')).toBe(noNeck);
});
