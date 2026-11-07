// Reevaluate retained trial output through production extraction. Offline only.
import { mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { base64ToBytes, binaryAlpha, makeImg, type Img } from '../src/lib/image/png.ts';
import { decodePngBytes, encodePngBytes } from '../src/lib/image/pngraw.ts';
import { keyScore, KT } from '../src/lib/image/chroma.ts';
import { colorCounts } from '../src/lib/dress/palette.ts';
import { hardMaskBits } from '../src/lib/image/hard-mask.ts';
import { bandOf, cutAllow, cutGrid, cutRows, extractCell, f0Last, GATES, itemQa, paletteDistance, posedTol, postProcess, recompose, slotOf, unrotate } from '../src/lib/items/items.ts';
import { fromApi } from '../src/lib/rig/poses.ts';
import { withH4 } from '../src/lib/items/run.ts';
import { over } from '../src/lib/compose/compose.ts';
import { sha256, stableStringify } from '../src/lib/image/hash.ts';
import { prepareTrial } from '../src/ui/item-trial/trial.ts';
import type { TrialPacket, TrialRecord } from '../src/ui/item-trial/trial.ts';
import type { JobRec } from '../src/lib/pixellab/queue.ts';

interface Evidence { record: Omit<TrialRecord, 'packet'> & { packet: TrialPacket }; job?: JobRec; images: { label: string; png: string; sha: string }[] }
const directory = resolve(process.argv[2] ?? 'test-results-item-trials/evidence');
const output = resolve(directory, 'report');
mkdirSync(output, { recursive: true });
const decode = (png: string) => decodePngBytes(base64ToBytes(png));
const sortedIdentity = (values: string[]) => stableStringify([...values].sort());
const mask = (pixels: number, cut?: number[]) => {
  const values = new Uint8Array(pixels);
  for (const p of cut ?? []) values[p] = 1;
  return values;
};
const reports = [];
const inputs = readdirSync(directory).filter(name => name.endsWith('.json')).flatMap(file => {
  const value = JSON.parse(readFileSync(resolve(directory, file), 'utf8')) as Evidence | { kind: string; trials: Evidence[] };
  if ('kind' in value && value.kind === 'pixeldoll-item-trial-evidence') {
    if (!Array.isArray(value.trials) || !value.trials.length) throw new Error(`${file} has no trial evidence.`);
    return value.trials.map((evidence, index) => ({ file: `${file} trial ${index + 1}`, evidence }));
  }
  return [{ file, evidence: value as Evidence }];
});
const seenRequests = new Set<string>();
for (const { file, evidence } of inputs) {
  if (!evidence.record || !evidence.job) throw new Error(`${file} lacks its saved request and receipt.`);
  if (evidence.job.state !== 'done') throw new Error(`${file} has unfinished state ${evidence.job.state}.`);
  const { packet, arm } = evidence.record;
  if (seenRequests.has(evidence.record.requestHash)) throw new Error(`${file} duplicates a request already included in this report.`);
  seenRequests.add(evidence.record.requestHash);
  const prepared = await prepareTrial(packet, arm);
  if (prepared.packetHash !== evidence.record.packetHash || prepared.requestHash !== evidence.record.requestHash || evidence.job.requestHash !== prepared.requestHash
    || prepared.expectedResults !== evidence.record.expectedResults || sortedIdentity(prepared.inputs) !== sortedIdentity(evidence.record.inputHashes)
    || sortedIdentity(prepared.inputs) !== sortedIdentity(evidence.job.inputs)) throw new Error(`${file} does not match its immutable packet and request identity.`);
  const savedOutputs = evidence.job.jobs.flatMap(job => job.results);
  const outputIdentity = (image: { label: string; sha: string }) => stableStringify({ label: image.label, sha: image.sha });
  if (savedOutputs.length !== prepared.expectedResults || sortedIdentity(savedOutputs.map(outputIdentity)) !== sortedIdentity(evidence.images.map(outputIdentity))
    || new Set(evidence.images.map(image => image.label)).size !== prepared.expectedResults) throw new Error(`${file} has missing or duplicated result frames.`);
  for (const result of evidence.images) {
    if (await sha256(base64ToBytes(result.png)) !== result.sha || !evidence.job.jobs.some(job => job.results.some(image => image.sha === result.sha && image.label === result.label))) throw new Error(`${file} has an output outside its saved receipt.`);
  }
  const posed = arm === 'pose' || arm === 'grid';
  let frames = await Promise.all([...evidence.images].sort((a, b) => Number(a.label.match(/\d+$/)?.[0] ?? 0) - Number(b.label.match(/\d+$/)?.[0] ?? 0)).map(result => decode(result.png)));
  if (frames.length !== evidence.record.expectedResults) throw new Error(`${file} returned ${frames.length} images instead of ${evidence.record.expectedResults}.`);
  if (arm === 'edit') frames = frames.slice(1);
  if (arm === 'grid') frames = cutGrid(frames[0], packet.targets.length, packet.cell.w, packet.cell.h, packet.grid!.cols);
  if (arm === 'pose') frames = unrotate(frames, f0Last(packet.slot, packet.rig.rest![packet.direction]!.keypoints, packet.targets.map(target => target.poses!), packet.cell));
  const slot = slotOf(packet.slot), standing = await decode(packet.reference.layer);
  const standingPalette = [...colorCounts([standing]).keys()];
  const standingCut = mask(packet.cell.w * packet.cell.h, packet.reference.cut);
  const expected = await Promise.all(packet.targets.map(target => decode(target.expectedLayer)));
  const base = await Promise.all(packet.targets.map(target => decode(target.base)));
  const raw = [...frames];
  frames = frames.map(frame => binaryAlpha(frame));
  const stencils = arm === 'grid' ? cutGrid(await decode(packet.grid!.mask), packet.targets.length, packet.cell.w, packet.cell.h, packet.grid!.cols).map(hardMaskBits) : undefined;
  const cells = frames.map((frame, index) => {
    if (frame.w !== packet.cell.w || frame.h !== packet.cell.h) throw new Error(`${file} has an incorrectly sized frame.`);
    const target = packet.targets[index];
    const cellIndex = Number(target.key.split('/')[2]);
    const measured = packet.rig.animations.find(a => a.id === packet.anim)?.sources?.[packet.direction]?.measured?.[cellIndex];
    const skeleton = measured ? fromApi(measured, packet.cell) : undefined;
    const maxY = cutRows(packet.slot, skeleton, frame.h);
    const allow = !posed || maxY === undefined ? undefined : cutAllow(packet.rig, target.key, standingCut, frame.w, posedTol(frame.w, frame.h));
    return extractCell({ key: target.key, call: 0, base: base[index], out: frame, route: packet.key,
      band: bandOf(packet.slot, skeleton, frame.h), posed, clip: slot.band, held: slot.class === 'held',
      ...(allow ? { cut: { maxY: maxY!, allow } } : {}),
      ...(stencils ? { stencil: stencils[index] } : {}),
    });
  });
  const beforePalette = cells.map(cell => paletteDistance(standingPalette, [cell.layer]));
  postProcess(packet.rig, slot, cells, { [packet.direction]: standing }, 0);
  const qa = withH4(itemQa(packet.rig, slot, packet.key, cells, 0, posed ? GATES.keyOutsidePosed : GATES.keyOutside, 0, undefined, new Map([[packet.direction, standingPalette]])), slot, cells, { [packet.direction]: standing }, packet.rig, { [packet.direction]: await decode(packet.reference.base) }, packet.prompt);
  const perFrame = cells.map((cell, index) => {
    const target = packet.targets[index], wanted = expected[index];
    let intersection = 0, union = 0, expectedPixels = 0, retainedPixels = 0, protectedBody = 0, protectedOffKey = 0, softAlpha = 0;
    const cut = new Set(target.expectedCut ?? []);
    for (let p = 0; p < cell.mask.length; p++) {
      const i = p * 4, actual = !!cell.layer.data[i + 3], want = !!wanted.data[i + 3];
      if (want) expectedPixels++;
      if (actual) retainedPixels++;
      if (want && actual) intersection++;
      if (want || actual) union++;
      const alpha = raw[index].data[i + 3];
      if (alpha > 0 && alpha < 255) softAlpha++;
      if (base[index].data[i + 3] && !want && !cut.has(p)) {
        protectedBody++;
        if (alpha >= 128 && keyScore(packet.key, raw[index].data[i], raw[index].data[i + 1], raw[index].data[i + 2]) < KT) protectedOffKey++;
      }
    }
    return { key: target.key, expectedPixels, retainedPixels, intersection, union, iou: union ? intersection / union : 1,
      protectedBody, protectedOffKey, softAlpha, paletteDistance: beforePalette[index], keyKept: cell.keyKept, keyOutside: cell.keyOutside, offset: cell.offset };
  });
  const sheet = makeImg(packet.cell.w * cells.length, packet.cell.h * 5);
  const rows: Img[][] = [base, raw, cells.map(cell => cell.layer), cells.map(recompose), cells.map((cell, index) => recompose({ base: cell.base, layer: expected[index], cut: mask(cell.mask.length, packet.targets[index].expectedCut) }))];
  rows.forEach((images, row) => images.forEach((image, col) => over(sheet, image, col * packet.cell.w, row * packet.cell.h)));
  const name = `${packet.id}-${arm}`;
  writeFileSync(resolve(output, `${name}.png`), await encodePngBytes(sheet));
  const protectedBody = perFrame.reduce((sum, frame) => sum + frame.protectedBody, 0);
  const protectedOffKey = perFrame.reduce((sum, frame) => sum + frame.protectedOffKey, 0);
  const billingReported = evidence.job.jobs.length > 0 && evidence.job.jobs.every(job => {
    const usage = job.usage;
    const value = usage?.type === 'usd' ? usage.usd : usage?.type === 'generations' ? usage.generations : undefined;
    return typeof value === 'number' && Number.isFinite(value) && value >= 0;
  });
  const report = { id: packet.id, arm, endpoint: evidence.job.endpoint, billingReported, usd: billingReported ? evidence.job.usd : null, gens: billingReported ? evidence.job.gens : null,
    durationMs: evidence.job.finishedAt === undefined ? null : evidence.job.finishedAt - (evidence.job.submittedAt ?? evidence.job.createdAt),
    requestHash: evidence.record.requestHash, status: qa.qa.status, warnings: qa.warnings,
    fails: [...qa.failCalls.values()].flat(), worstIoU: Math.min(...perFrame.map(frame => frame.iou)), protectedBody, protectedOffKey, perFrame };
  reports.push(report);
  writeFileSync(resolve(output, `${name}.json`), JSON.stringify(report, null, 2));
}
writeFileSync(resolve(output, 'summary.json'), JSON.stringify(reports, null, 2));
console.log(JSON.stringify(reports.map(({ id, arm, usd, gens, status, worstIoU, protectedBody, protectedOffKey }) => ({ id, arm, usd, gens, status, worstIoU, protectedBody, protectedOffKey })), null, 2));
