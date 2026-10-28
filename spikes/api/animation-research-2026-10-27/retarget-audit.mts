// Offline regression evidence only. Run from spikes/api:
// node animation-research-2026-10-27/retarget-audit.mts
// Requires the existing local UAL1 GLB and c27man fixture; no token or network is used.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { build } from '../mocap/retarget2.mts';
import { body, span } from '../mocap/mocap.mts';
import { parseGlb, worldMatrices, animByName, xformPoint } from '../mocap/glb.mts';
import { MOVES, seq } from '../x27/moves.mts';

const glbPath = process.env.UAL1_GLB ?? 'C:/Users/shilo/Downloads/photon-fusion-godot-starter_3.0.0.407/3rdparty/universal_animation_library/UAL1.glb';
const glb = parseGlb(glbPath);
const cell = body.rig.cell.w;
const range = (values: number[]) => Math.max(...values) - Math.min(...values);
const hash = (value: Buffer) => createHash('sha256').update(value).digest('hex');

// retarget2.mts:129-156 modifies target XY, but :165 obtains Z from unscaled source P.
const depthProof = (['south', 'east'] as const).map(dir => {
  const result = build(span('Walk_Loop', 30), dir, { face: 1, twist: 0.5, lean: 0.6, travel: 0.5, gain: 0 });
  const joints = result.frames[0].map((joint, index) => ({
    label: joint.label,
    xyRangePx: Math.hypot(range(result.frames.map(frame => frame[index].x)), range(result.frames.map(frame => frame[index].y))) * cell,
    depthRange: range(result.frames.map(frame => frame[index].depth!)),
  }));
  const maxXYRangePx = Math.max(...joints.map(joint => joint.xyRangePx));
  const maxDepthRange = Math.max(...joints.map(joint => joint.depthRange));
  assert.equal(maxXYRangePx, 0, `${dir}: gain zero must leave XY static for this proof`);
  assert(maxDepthRange > 5, `${dir}: expected source depth to remain animated`);
  return { dir, frames: result.frames.length, options: result.meta.opts, maxXYRangePx, maxDepthRange, joints };
});

// retarget2.mts:159-164 changes the support set at a hard 2 cm threshold and
// averages target errors, yielding a global vertical discontinuity on this fixture.
const times = [0.5954, 0.5955];
const walk = MOVES.find(move => move.id === 'walk2');
assert(walk, 'walk2 catalog move missing');
const result = seq({ ...walk, frames: times.map(time => ['Walk_Loop', time]) }, 'south');
const sourceStates = times.map(time => {
  const matrices = worldMatrices(glb, animByName(glb, 'Walk_Loop'), time);
  const feet = ['foot_r', 'foot_l'].map(name => {
    const index = glb.json.nodes.findIndex((node: { name?: string }) => node.name === name);
    assert(index >= 0, `${name} source node missing`);
    return { name, yMeters: xformPoint(matrices[index], [0, 0, 0])[1] };
  });
  const low = Math.min(...feet.map(foot => foot.yMeters));
  return { timeSeconds: time, feet, support: feet.filter(foot => foot.yMeters < low + 0.02).map(foot => foot.name) };
});
assert.deepEqual(sourceStates[0].support, ['foot_r', 'foot_l'], 'proof requires two support feet at first sample');
assert.deepEqual(sourceStates[1].support, ['foot_r'], 'proof requires one support foot at second sample');
const jointDeltas = result.frames[0].map((joint, index) => ({
  label: joint.label,
  dxPx: (result.frames[1][index].x - joint.x) * cell,
  dyPx: (result.frames[1][index].y - joint.y) * cell,
}));
const minimumDownwardJumpPx = Math.min(...jointDeltas.map(joint => joint.dyPx));
const maximumDownwardJumpPx = Math.max(...jointDeltas.map(joint => joint.dyPx));
const maximumHorizontalStepPx = Math.max(...jointDeltas.map(joint => Math.abs(joint.dxPx)));
assert(minimumDownwardJumpPx > 0.7 && maximumDownwardJumpPx < 1.1,
  'expected the known near-one-pixel vertical jump on the existing 80 px c27man fixture');
assert(maximumHorizontalStepPx < 0.05, 'expected negligible horizontal motion over the 0.1 ms interval');
const supportProof = {
  dir: 'south', sourceStates, intervalSeconds: times[1] - times[0],
  minimumDownwardJumpPx, maximumDownwardJumpPx, maximumHorizontalStepPx, jointDeltas,
};

const licensePath = path.join(path.dirname(glbPath), 'License.txt');
const source = {
  sha256: hash(fs.readFileSync(glbPath)),
  fileModifiedUtc: fs.statSync(glbPath).mtime.toISOString(),
  generator: glb.json.asset,
  // A filesystem timestamp records this local copy, not the publisher's release version.
  license: fs.existsSync(licensePath) ? {
    sha256: hash(fs.readFileSync(licensePath)), text: fs.readFileSync(licensePath, 'utf8'),
  } : null,
};
const output = { date: '2026-10-27', cell, source, depthProof, supportProof,
  interpretation: 'These proofs show remaining input inconsistencies, not their measured effect on PixelLab. Renderer faults can coexist. No paid request was made.' };
const out = path.resolve(import.meta.dirname, '../out/animation-research-2026-10-27');
fs.mkdirSync(out, { recursive: true });
fs.writeFileSync(path.join(out, 'retarget-audit.json'), JSON.stringify(output, null, 2));
console.log(JSON.stringify({
  verified: true, sourceSha256: source.sha256,
  depthProof: depthProof.map(({ dir, maxXYRangePx, maxDepthRange }) => ({ dir, maxXYRangePx, maxDepthRange })),
  supportProof: { times, intervalSeconds: supportProof.intervalSeconds, minimumDownwardJumpPx, maximumDownwardJumpPx, maximumHorizontalStepPx },
  references: ['mocap/retarget2.mts:129-166', 'mocap/retarget2.mts:159-164'],
  output: 'out/animation-research-2026-10-27/retarget-audit.json',
}, null, 2));
