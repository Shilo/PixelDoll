// Independent audit of retained public live evidence. No provider operations or credential access.
import { readFileSync, writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { strict as assert } from 'node:assert';
import { requestIdentity } from '../../../../app/src/lib/pixellab/queue.ts';
import { decodePngBytes } from '../../../../app/src/lib/image/pngraw.ts';
import { stableStringify } from '../../../../app/src/lib/image/hash.ts';

const evidenceBytes = readFileSync(new URL('../../../../app/test-results-post-handoff-live/evidence.json', import.meta.url));
const evidence = JSON.parse(evidenceBytes.toString());
const measurements = JSON.parse(readFileSync(new URL('../live/results.json', import.meta.url)).toString());
const blinding = JSON.parse(readFileSync(new URL('../../../../app/test-results-post-handoff-live/blind/blinding-map.json', import.meta.url)).toString());
const sha = (value: Uint8Array | string) => createHash('sha256').update(value).digest('hex');
const bytes = (value: string) => Buffer.from(value.replace(/^data:[^,]*,/, ''), 'base64');
const same = (a: Uint8Array, b: Uint8Array) => Buffer.compare(Buffer.from(a), Buffer.from(b)) === 0;
assert.equal(evidence.plan.trials.length, 8);
assert.equal(evidence.jobs.length, 8);
assert.equal(new Set(evidence.jobs.map((entry: any) => entry.job.id)).size, 8);
assert.equal(new Set(evidence.jobs.map((entry: any) => entry.job.requestHash)).size, 8);
assert.equal(new Set(evidence.jobs.flatMap((entry: any) => entry.job.jobs.map((child: any) => child.id))).size, 8);
const rows: any[] = [], pngHashes = new Set<string>();
let totalUsd = 0, usageUsd = 0, totalGenerations = 0, imageReferences = 0, galleryImagesVerified = 0;
for (const trial of evidence.plan.trials) {
  const identity = await requestIdentity(trial.request);
  const entry = evidence.jobs.find((candidate: any) => candidate.job.requestHash === identity.requestHash);
  assert(entry, `Missing retained request for ${trial.id}`);
  const job = entry.job;
  assert.equal(job.jobs.length, 1);
  const measured = measurements.trials.find((candidate: any) => candidate.requestHash === identity.requestHash);
  assert(measured); assert.equal(measured.primary.rawIndex, 7); assert.equal(measured.lastFrameSensitivity.rawIndex, 8);
  const group = blinding.find((g: any) => g.candidates.some((candidate: any) => candidate.trialId === trial.id));
  const blindCandidate = group.candidates.find((candidate: any) => candidate.trialId === trial.id);
  assert.equal(job.state, 'done'); assert.equal(job.attempts, 1);
  assert.equal(job.endpoint, trial.request.path); assert.equal(job.method, trial.request.method);
  assert.deepEqual(job.inputs, identity.inputs); assert.equal(stableStringify(job.params), stableStringify(identity.params));
  const claim = evidence.claims[identity.requestHash];
  assert(claim); assert.equal(claim.jobId, job.id); assert(Date.parse(claim.claimedAt) <= job.createdAt);
  const metadata = job.jobs.flatMap((child: any) => child.results).sort((a: any, b: any) => +a.label - +b.label);
  const images = new Map(entry.images.map((image: any) => [image.sha, image.png]));
  assert.equal(metadata.length, 9); assert.equal(images.size, 9);
  const inputBytes = bytes(trial.request.body.first_frame.base64), input = await decodePngBytes(inputBytes);
  assert.equal(input.w, trial.cell.w * 2); assert.equal(input.h, trial.cell.h);
  const imageRows = [];
  let anchorDecodedExact = false;
  for (const [i, meta] of metadata.entries()) {
    assert.equal(String(meta.label), String(i));
    const png = bytes(images.get(meta.sha) as string); assert.equal(sha(png), meta.sha);
    const decoded = await decodePngBytes(png);
    assert.equal(decoded.w, input.w); assert.equal(decoded.h, input.h);
    assert.equal(meta.w, decoded.w); assert.equal(meta.h, decoded.h);
    const decodedExactInput = same(decoded.data, input.data);
    if (i === 0) { anchorDecodedExact = decodedExactInput; assert(anchorDecodedExact); }
    assert.equal(measured.frames[i].rawPngSha256, meta.sha);
    const gallery = await decodePngBytes(readFileSync(new URL(`../../../../app/test-results-post-handoff-live/blind/${group.code}-${blindCandidate.letter}-raw-${i}.png`, import.meta.url)));
    assert.equal(gallery.w, decoded.w); assert.equal(gallery.h, decoded.h); assert(same(gallery.data, decoded.data)); galleryImagesVerified++;
    let nonbinaryAlpha = 0, rightPaneAnyAlpha = 0;
    for (let p = 0; p < decoded.w * decoded.h; p++) {
      const alpha = decoded.data[p * 4 + 3];
      if (alpha !== 0 && alpha !== 255) nonbinaryAlpha++;
      if (p % decoded.w >= trial.cell.w && alpha > 0) rightPaneAnyAlpha++;
    }
    if (i === 7 || i === 8) assert.equal(rightPaneAnyAlpha, 0);
    imageReferences++; pngHashes.add(meta.sha);
    imageRows.push({ index: i, pngSha256: meta.sha, rgbaSha256: sha(decoded.data), decodedExactInput, nonbinaryAlpha, rightPaneAnyAlpha });
  }
  const receiptUsd = job.jobs.reduce((sum: number, child: any) => sum + (child.usage?.type === 'usd' ? child.usage.usd : 0), 0);
  assert(Math.abs(receiptUsd - job.usd) < 1e-12);
  assert.equal(job.gens, 0);
  assert(Number.isFinite(job.usd) && job.usd >= 0);
  totalUsd += job.usd; usageUsd += receiptUsd; totalGenerations += job.gens;
  rows.push({ id: trial.id, requestHash: identity.requestHash, inputPngSha256: sha(inputBytes), state: job.state,
    attempts: job.attempts, actualImages: metadata.length, expectedImages: evidence.plan.expectedResults,
    decodedAnchorExact: anchorDecodedExact, jobUsd: job.usd, providerUsageUsd: receiptUsd, images: imageRows });
}
const pairs = new Map<string, any[]>();
for (const trial of evidence.plan.trials) {
  const key = `${trial.caseId}/${trial.direction}`, members = pairs.get(key) ?? [];
  members.push(trial); pairs.set(key, members);
}
const pairRows = [];
for (const [name, trials] of pairs) {
  assert.equal(trials.length, 2);
  const [first, second] = trials, a = structuredClone(first.request), b = structuredClone(second.request);
  assert.notEqual(a.body.description, b.body.description);
  delete a.body.description; delete b.body.description;
  assert.equal(stableStringify(a), stableStringify(b));
  pairRows.push({ name, sameSanitizedRequestExceptDescription: true, sameRequestedSeed: first.seed === second.seed });
}
const report = { runtime: process.version, paidCallsByAuditor: 0, evidenceSha256: sha(evidenceBytes),
  judgmentsSha256: sha(readFileSync(new URL('blind-judgments.md', import.meta.url))),
  summary: { requests: rows.length, claims: Object.keys(evidence.claims).length, imageReferences, distinctPngHashes: pngHashes.size, galleryImagesVerified,
    allDecodedAnchorsExact: rows.every(row => row.decodedAnchorExact), byteExactAnchors: rows.filter(row => row.inputPngSha256 === row.images[0].pngSha256).length,
    distinctProviderJobs: new Set(evidence.jobs.flatMap((entry: any) => entry.job.jobs.map((child: any) => child.id))).size,
    cardinalityDeviations: rows.filter(row => row.actualImages !== row.expectedImages).length,
    confirmedJobUsd: totalUsd, retainedProviderUsageUsd: usageUsd, subscriptionGenerations: totalGenerations, pairedRequests: pairRows.length },
  pairs: pairRows, rows,
  limits: 'Audits retained provider usage and queue receipts, not an independent account statement. Nine raw images include a decoded-exact input anchor; primary raw index7 remains separate from last-index8 sensitivity. No paid request was retried or created by this script.' };
writeFileSync(fileURLToPath(new URL('live-evidence-audit.json', import.meta.url)), JSON.stringify(report, null, 2) + '\n');
console.log(JSON.stringify(report.summary));
