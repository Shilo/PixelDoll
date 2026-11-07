// Independent document-boundary controls. This does not test RGBMoCap reconstruction or native exports.
import { readFileSync, writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { newDocument, validateDocument, buildDocument } from '../../../../app/src/ui/motion-lab/model.ts';

const bytes = readFileSync(new URL('../../../../app/dev-fixtures/motion-lab/library.json', import.meta.url));
const library = JSON.parse(bytes.toString());
const clip = library.clips.find((v: { id: string }) => v.id === 'walk');
const baseline = newDocument(library, library.fixtures[0], clip, 'south');
const sha = (value: Uint8Array) => createHash('sha256').update(value).digest('hex');
const cases: { name: string; accepted: boolean; finite?: boolean; frames?: number; error?: string }[] = [];
function check(name: string, mutate: (value: typeof baseline) => void) {
  const candidate = structuredClone(baseline);
  mutate(candidate);
  // Use the same representable data a JSON file can supply, rather than an in-memory NaN-only attack.
  const imported = JSON.parse(JSON.stringify(candidate));
  try {
    const accepted = validateDocument(imported);
    const result = buildDocument(accepted);
    cases.push({ name, accepted: true, frames: result.frames.length,
      finite: result.frames.every(frame => frame.keypoints.every(point => [point.x, point.y, point.depth].every(Number.isFinite))) });
  } catch (error) {
    cases.push({ name, accepted: false, error: (error as Error).message });
  }
}
check('valid existing authored document', () => {});
check('valid repeated target sample times for an authored hold', d => {
  d.times = [0, 0, d.clip.duration / 2, d.clip.duration];
  d.durations = [100, 100, 100, 100];
});
check('descending source sample chronology', d => { d.clip.samples.reverse(); });
check('contradictory poses at one source timestamp', d => {
  d.clip.samples[1].time = d.clip.samples[0].time;
  d.clip.samples[1].points['RIGHT ARM'][0] += 0.125;
});
check('null source duration through JSON', d => { d.clip.duration = NaN; });
check('negative source timestamp through JSON', d => { d.clip.samples[0].time = -0.1; });
check('source sample timestamp after declared duration', d => { d.clip.samples.at(-1)!.time = d.clip.duration + 1; });
check('missing joint through authored-document import', d => { delete d.clip.samples[0].points['RIGHT ARM']; });

const report = { runtime: process.version, paidCalls: 0,
  source: 'existing public CC0 motion library and Motion Lab JSON validation; no RGBMoCap export or reconstruction',
  librarySha256: sha(bytes),
  motionSourceSha256: sha(readFileSync(new URL('../../../../app/src/lib/rig/motion.ts', import.meta.url))),
  documentSourceSha256: sha(readFileSync(new URL('../../../../app/src/ui/motion-lab/model.ts', import.meta.url))),
  cases };
const path = process.argv[2] ?? fileURLToPath(new URL('motion-timing-before.json', import.meta.url));
writeFileSync(path, JSON.stringify(report, null, 2) + '\n');
console.log(JSON.stringify({ runtime: report.runtime, cases }));
