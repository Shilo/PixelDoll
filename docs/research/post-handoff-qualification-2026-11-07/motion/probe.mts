import { readFileSync, writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import {
  DEFAULT_MOTION_OPTIONS, MOTION_EDGES, length3, sub3,
  retargetMotion, sampleMotion,
  type MotionClip, type MotionCalibration,
} from '../../../../app/src/lib/rig/motion.ts';
import type { DirectionName, Keypoint } from '../../../../app/src/lib/rig/rig.ts';

const libraryBytes = readFileSync(new URL('../../../../app/dev-fixtures/motion-lab/library.json', import.meta.url));
const library = JSON.parse(libraryBytes.toString()) as {
  camera: { elev: number; yaw: number };
  clips: MotionClip[];
  fixtures: { id: string; cell: { w: number; h: number }; references: Partial<Record<DirectionName, { keypoints: Keypoint[] }>> }[];
};
const walk = library.clips.find(c => c.id === 'walk')!;
const sha = (data: Uint8Array | string) => createHash('sha256').update(data).digest('hex');
const cal = (fixture: typeof library.fixtures[number], direction: DirectionName): MotionCalibration => ({
  width: fixture.cell.w, height: fixture.cell.h, rest: fixture.references[direction]!.keypoints,
  direction, elevation: library.camera.elev,
  ...(direction === 'east' ? { azimuth: 90 - library.camera.yaw } : {}),
});

const valid = [];
for (const fixture of library.fixtures) for (const direction of ['south', 'east'] as const) {
  if (!fixture.references[direction]) continue;
  for (const clip of library.clips) {
    const inputHash = sha(JSON.stringify({ clip, calibration: cal(fixture, direction) }));
    const result = retargetMotion(clip, cal(fixture, direction));
    let maxSegmentError = 0, maxRestErrorPx = 0;
    for (const frame of result.frames) for (const [a, b] of MOTION_EDGES) {
      maxSegmentError = Math.max(maxSegmentError, Math.abs(length3(sub3(frame.points[b], frame.points[a])) - length3(sub3(result.reference[b], result.reference[a]))));
    }
    for (const k of result.rest) {
      const target = fixture.references[direction]!.keypoints.find(v => v.label === k.label)!;
      maxRestErrorPx = Math.max(maxRestErrorPx, Math.hypot((k.x - target.x) * fixture.cell.w, (k.y - target.y) * fixture.cell.h));
    }
    const still = retargetMotion({ ...clip, samples: [{ time: 0, points: clip.reference, contacts: {} }] }, cal(fixture, direction));
    const maxBindErrorPx = Math.max(...still.frames[0].keypoints.map((k, i) => Math.hypot((k.x - still.rest[i].x) * fixture.cell.w, (k.y - still.rest[i].y) * fixture.cell.h)));
    const zero = retargetMotion(clip, cal(fixture, direction), { ...DEFAULT_MOTION_OPTIONS, gain: 0 });
    const maxZeroGainErrorPx = Math.max(...zero.frames.flatMap(f => f.keypoints.map((k, i) => Math.hypot((k.x - zero.rest[i].x) * fixture.cell.w, (k.y - zero.rest[i].y) * fixture.cell.h))));
    valid.push({ fixture: fixture.id, size: fixture.cell, direction, clip: clip.id, frames: result.frames.length, inputHash,
      maxSegmentError, maxRestErrorPx, maxBindErrorPx, maxZeroGainErrorPx,
      outputHash: sha(JSON.stringify(result)), inputPreserved: inputHash === sha(JSON.stringify({ clip, calibration: cal(fixture, direction) })), issues: result.issues });
  }
}

const invalid: { name: string; rejected: boolean; error?: string; finiteOutput?: boolean }[] = [];
function caseOf(name: string, mutate: (clip: MotionClip) => void) {
  const clip = structuredClone(walk); mutate(clip);
  try {
    const sampled = sampleMotion(clip, [0, walk.samples[1].time, walk.duration]);
    const result = retargetMotion(sampled, cal(library.fixtures[0], 'south'));
    invalid.push({ name, rejected: false, finiteOutput: result.frames.every(f => f.keypoints.every(k => [k.x, k.y, k.depth].every(Number.isFinite))) });
  } catch (e) { invalid.push({ name, rejected: true, error: (e as Error).message }); }
}
caseOf('descending source timestamps', c => { [c.samples[1], c.samples[2]] = [c.samples[2], c.samples[1]]; });
caseOf('duplicate source timestamps with different poses', c => { c.samples[2].time = c.samples[1].time; });
caseOf('nonfinite source duration', c => { c.duration = NaN; });
caseOf('negative source duration', c => { c.duration = -1; });
caseOf('negative source timestamp', c => { c.samples[0].time = -0.1; });
caseOf('source timestamp beyond duration', c => { c.samples[c.samples.length - 1].time = c.duration + 1; });
caseOf('missing source joint', c => { delete c.samples[1].points['RIGHT ARM']; });
caseOf('invalid contact weight', c => { c.samples[1].contacts['RIGHT LEG'] = { weight: 2 }; });

const sparse = structuredClone(walk);
sparse.samples = [structuredClone(walk.samples[0]), structuredClone(walk.samples[1])];
const sampledEnd = sampleMotion(sparse, [walk.duration]).samples[0];
const last = sparse.samples.at(-1)!;
const beyondLastDistance = length3(sub3(sampledEnd.points['RIGHT ARM'], last.points['RIGHT ARM']));

const report = {
  version: 1, paidCalls: 0, source: 'existing CC0 Quaternius-baked motion library; no RGBMoCap export was executed',
  librarySha256: sha(libraryBytes), licenseFile: '../../../../app/dev-fixtures/motion-lab/LICENSE.txt',
  sourceCodeSha256: sha(readFileSync(new URL('../../../../app/src/lib/rig/motion.ts', import.meta.url))),
  valid,
  summary: { cases: valid.length, frames: valid.reduce((n, v) => n + v.frames, 0), maxSegmentError: Math.max(...valid.map(v => v.maxSegmentError)),
    maxRestErrorPx: Math.max(...valid.map(v => v.maxRestErrorPx)), maxBindErrorPx: Math.max(...valid.map(v => v.maxBindErrorPx)), maxZeroGainErrorPx: Math.max(...valid.map(v => v.maxZeroGainErrorPx)),
    inputPreserved: valid.every(v => v.inputPreserved), invalidRejected: invalid.filter(v => v.rejected).length, invalidCases: invalid.length },
  invalid,
  sparseCoverage: { requested: walk.duration, observedLast: last.time, armDistanceBeyondObservedLast: beyondLastDistance,
    interpretation: 'diagnostic only: extrapolation beyond actual source coverage can invent motion; source coverage policy needs explicit qualification' },
};
const output = process.argv[2] ?? fileURLToPath(new URL('after.json', import.meta.url));
writeFileSync(output, JSON.stringify(report, null, 2) + '\n');
console.log(JSON.stringify({ output, ...report.summary, invalid, sparseCoverage: report.sparseCoverage }));
