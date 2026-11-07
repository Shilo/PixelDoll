import { readFileSync } from 'node:fs';
import { expect, test } from 'vitest';
import { retargetMotion, sampleMotion, type MotionClip, type MotionCalibration } from '../../src/lib/rig/motion.ts';
import { newDocument, validateDocument, type MotionLibrary } from '../../src/ui/motion-lab/model.ts';

const library = JSON.parse(readFileSync(new URL('../../dev-fixtures/motion-lab/library.json', import.meta.url), 'utf8')) as MotionLibrary;
const walk = library.clips.find(c => c.id === 'walk')!;
const fixture = library.fixtures[0];
const calibration: MotionCalibration = {
  width: fixture.cell.w, height: fixture.cell.h, rest: fixture.references.south!.keypoints,
  direction: 'south', elevation: fixture.camera.elev,
};
const invalid: [string, (clip: MotionClip) => void][] = [
  ['descending source timestamps', c => { [c.samples[1], c.samples[2]] = [c.samples[2], c.samples[1]]; }],
  ['different poses at one source timestamp', c => { c.samples[2].time = c.samples[1].time; c.samples[2].points['RIGHT ARM'][0] += 0.1; }],
  ['different contacts at one source timestamp', c => { c.samples[2] = structuredClone(c.samples[1]); c.samples[2].contacts['RIGHT LEG'] = { weight: 0.37 }; }],
  ['nonfinite duration', c => { c.duration = NaN; }],
  ['negative duration', c => { c.duration = -1; }],
  ['negative source timestamp', c => { c.samples[0].time = -0.1; }],
  ['source timestamp after duration', c => { c.samples[c.samples.length - 1].time = c.duration + 1; }],
];

test.each(invalid)('%s is rejected by both motion consumers', (_, mutate) => {
  const clip = structuredClone(walk); mutate(clip);
  expect(() => sampleMotion(clip, [0, walk.duration / 2])).toThrow(/source motion/i);
  expect(() => retargetMotion(clip, calibration)).toThrow(/source motion/i);
});

test.each(invalid.filter(([name]) => !name.includes('nonfinite')))('%s cannot enter through an imported authoring document', (_, mutate) => {
  const document = newDocument(library, fixture, structuredClone(walk)); mutate(document.clip);
  expect(() => validateDocument(JSON.parse(JSON.stringify(document)))).toThrow(/source motion/i);
});

test('repeated target samples retain authored holds through both sampling and retargeting', () => {
  const sampled = sampleMotion(walk, [0, 0, walk.duration / 2]);
  const result = retargetMotion(sampled, calibration);
  expect(result.frames).toHaveLength(3);
  expect(result.frames[0].keypoints).toEqual(result.frames[1].keypoints);
  const document = newDocument(library, fixture, structuredClone(walk));
  document.times[1] = document.times[0];
  expect(() => validateDocument(document)).not.toThrow();
});

test('a duplicate source sample with identical pose and contacts is unambiguous', () => {
  const clip = structuredClone(walk); clip.samples.splice(1, 0, structuredClone(clip.samples[0]));
  expect(sampleMotion(clip, [0, walk.duration / 2]).samples).toEqual(sampleMotion(walk, [0, walk.duration / 2]).samples);
  expect(() => retargetMotion(clip, calibration)).not.toThrow();
});

test('single-pose and partial-coverage sources retain their existing sampling behavior', () => {
  const still = { ...walk, samples: [{ time: 0, points: structuredClone(walk.reference), contacts: {} }] };
  expect(() => retargetMotion(still, calibration)).not.toThrow();
  expect(sampleMotion(still, [0, walk.duration]).samples.map(s => s.points)).toEqual([walk.reference, walk.reference]);
  const zeroDuration = { ...still, duration: 0 };
  expect(sampleMotion(zeroDuration, [0, 0]).samples).toHaveLength(2);
  expect(() => retargetMotion(zeroDuration, calibration)).not.toThrow();
  const partial = { ...walk, samples: walk.samples.slice(2, -2) };
  expect(() => retargetMotion(sampleMotion(partial, [0, walk.duration]), calibration)).not.toThrow();
});
