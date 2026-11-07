import { readFileSync, writeFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { stripTypeScriptTypes } from 'node:module';
import { performance } from 'node:perf_hooks';
import * as current from '../../../../app/src/lib/rig/motion.ts';

const sha = (value: string) => createHash('sha256').update(value).digest('hex');
const before = JSON.parse(readFileSync(new URL('before.json', import.meta.url), 'utf8'));
const after = JSON.parse(readFileSync(new URL('after.json', import.meta.url), 'utf8'));
const currentSourceSha256 = sha(readFileSync(new URL('../../../../app/src/lib/rig/motion.ts', import.meta.url), 'utf8'));
if (currentSourceSha256 !== after.sourceCodeSha256) throw new Error('Current motion source changed after the recorded replay; rerun probe.mts before comparing.');
const baselineCommit = 'ee29e0adadaad196a618f194cc1431e0e9ccfa03';
const source = execFileSync('git', ['show', `${baselineCommit}:app/src/lib/rig/motion.ts`], { encoding: 'utf8' });
if (sha(source) !== before.sourceCodeSha256) throw new Error('The recorded baseline revision does not match the captured motion source.');
const posesUrl = new URL('../../../../app/src/lib/rig/poses.ts', import.meta.url).href;
const baselineJs = stripTypeScriptTypes(source.replace("from './poses.ts'", `from '${posesUrl}'`), { mode: 'transform' });
const baseline = await import('data:text/javascript;base64,' + Buffer.from(baselineJs).toString('base64')) as typeof current;
const library = JSON.parse(readFileSync(new URL('../../../../app/dev-fixtures/motion-lab/library.json', import.meta.url), 'utf8'));
const walk = library.clips.find((c: current.MotionClip) => c.id === 'walk');
const fixture = library.fixtures[0];
const calibration = { width: fixture.cell.w, height: fixture.cell.h, rest: fixture.references.south.keypoints, direction: 'south' as const, elevation: library.camera.elev };
const run = (fn: typeof current.retargetMotion, count: number) => {
  const start = performance.now();
  for (let i = 0; i < count; i++) fn(walk, calibration);
  return performance.now() - start;
};
run(baseline.retargetMotion, 25); run(current.retargetMotion, 25);
const rounds = [];
for (let i = 0; i < 5; i++) {
  if (i % 2) {
    const afterMs = run(current.retargetMotion, 100), beforeMs = run(baseline.retargetMotion, 100);
    rounds.push({ beforeMs, afterMs });
  } else {
    const beforeMs = run(baseline.retargetMotion, 100), afterMs = run(current.retargetMotion, 100);
    rounds.push({ beforeMs, afterMs });
  }
}
const median = (values: number[]) => values.toSorted((a, b) => a - b)[Math.floor(values.length / 2)];
const changedControls = before.valid.filter((row: { outputHash: string }, index: number) => row.outputHash !== after.valid[index].outputHash);
const report = { version: 1, paidCalls: 0, baselineCommit,
  baselineSourceSha256: sha(source), currentSourceSha256,
  controlsCompared: before.valid.length, controlsChanged: changedControls.length, allInputsPreserved: after.valid.every((v: { inputPreserved: boolean }) => v.inputPreserved),
  timing: { callsPerRound: 100, framesPerCall: walk.samples.length, rounds,
    baselineMedianMs: median(rounds.map(r => r.beforeMs)), currentMedianMs: median(rounds.map(r => r.afterMs)),
    note: 'Single local warmed CPU probe; alternating order, five rounds. Timing is descriptive, not a portable performance guarantee or quality metric.' },
};
writeFileSync(new URL('comparison.json', import.meta.url), JSON.stringify(report, null, 2) + '\n');
console.log(JSON.stringify(report));
