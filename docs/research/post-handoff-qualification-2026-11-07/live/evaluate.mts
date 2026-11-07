import { strict as assert } from 'node:assert';
import { createHash } from 'node:crypto';
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { makeImg, type Img } from '../../../../app/src/lib/image/png.ts';
import { decodePngBytes, encodePngBytes } from '../../../../app/src/lib/image/pngraw.ts';
import { over, cutBase } from '../../../../app/src/lib/compose/compose.ts';
import { keyScore, KT, toChroma } from '../../../../app/src/lib/image/chroma.ts';
import { extractCell, paletteDistance } from '../../../../app/src/lib/items/items.ts';
import { colorCounts } from '../../../../app/src/lib/dress/palette.ts';
import { requestIdentity } from '../../../../app/src/lib/pixellab/queue.ts';
import { stableStringify } from '../../../../app/src/lib/image/hash.ts';

const folder = dirname(fileURLToPath(import.meta.url)), root = resolve(folder, '../../../..');
const evidenceFolder = resolve(root, 'app/test-results-post-handoff-live');
const evidenceBytes = await readFile(resolve(evidenceFolder, 'evidence.json'));
const evidence = JSON.parse(evidenceBytes.toString('utf8'));
const sha = (value: Uint8Array | string) => createHash('sha256').update(value).digest('hex');
const png = (b64: string) => decodePngBytes(Buffer.from(b64.replace(/^data:[^,]*,/, ''), 'base64'));
const crop = (image: Img, x0: number, w: number) => {
  assert(x0 >= 0 && x0 + w <= image.w);
  const out = makeImg(w, image.h);
  for (let y = 0; y < image.h; y++) out.data.set(image.data.subarray((y * image.w + x0) * 4, (y * image.w + x0 + w) * 4), y * w * 4);
  return out;
};
const opaque = (image: Img, p: number) => image.data[p * 4 + 3] >= 128;
const countOpaque = (image: Img) => { let n = 0; for (let p = 0; p < image.w * image.h; p++) if (opaque(image, p)) n++; return n; };
const rgbaEqual = (a: Img, b: Img, p: number) => a.data.subarray(p * 4, p * 4 + 4).every((v, i) => v === b.data[p * 4 + i]);
const keyAt = (image: Img, p: number, key: any) => opaque(image, p) && keyScore(key, image.data[p * 4]!, image.data[p * 4 + 1]!, image.data[p * 4 + 2]!) >= KT;
const compose = (base: Img, layer: Img, cut: number[] = []) => { const out = makeImg(base.w, base.h); over(out, cut.length ? cutBase(base, [cut]) : base); over(out, layer); return out; };
function compare(a: Img, b: Img) {
  assert.equal(a.w, b.w); assert.equal(a.h, b.h);
  let intersection = 0, union = 0, rgbaDifferent = 0, visibleDifferent = 0, sharedRgbDistance = 0;
  for (let p = 0; p < a.w * a.h; p++) {
    const A = opaque(a, p), B = opaque(b, p);
    if (A || B) { union++; if (!rgbaEqual(a, b, p)) visibleDifferent++; }
    if (A && B) { intersection++; sharedRgbDistance += Math.max(...[0, 1, 2].map(c => Math.abs(a.data[p * 4 + c]! - b.data[p * 4 + c]!))); }
    if (!rgbaEqual(a, b, p)) rgbaDifferent++;
  }
  return { rgbaDifferent, visibleDifferent, alphaIntersection: intersection, alphaUnion: union, alphaIoU: union ? intersection / union : 1, meanSharedMaxChannelRgbDifference: intersection ? sharedRgbDistance / intersection : null };
}
function bounds(image: Img, key?: any) {
  let x0 = image.w, y0 = image.h, x1 = -1, y1 = -1, n = 0, sx = 0, sy = 0;
  for (let p = 0; p < image.w * image.h; p++) if (key === undefined ? opaque(image, p) : keyAt(image, p, key)) {
    const x = p % image.w, y = Math.floor(p / image.w); n++; sx += x; sy += y; x0 = Math.min(x0, x); y0 = Math.min(y0, y); x1 = Math.max(x1, x); y1 = Math.max(y1, y);
  }
  return { pixels: n, bounds: n ? { x: x0, y: y0, w: x1 - x0 + 1, h: y1 - y0 + 1 } : null, centroid: n ? [sx / n, sy / n] : null };
}
function edgeProxy(gold: Img, candidate: Img) {
  let goldEdges = 0, survivingEdges = 0, exactColorEdges = 0;
  const rgb = (im: Img, p: number) => (im.data[p * 4]! << 16) | (im.data[p * 4 + 1]! << 8) | im.data[p * 4 + 2]!;
  for (let p = 0; p < gold.w * gold.h; p++) if (opaque(gold, p)) {
    const x = p % gold.w, y = Math.floor(p / gold.w);
    for (const q of [x + 1 < gold.w ? p + 1 : -1, y + 1 < gold.h ? p + gold.w : -1]) if (q >= 0 && opaque(gold, q) && rgb(gold, p) !== rgb(gold, q)) {
      goldEdges++;
      if (opaque(candidate, p) && opaque(candidate, q) && rgb(candidate, p) !== rgb(candidate, q)) survivingEdges++;
      if (rgbaEqual(gold, candidate, p) && rgbaEqual(gold, candidate, q)) exactColorEdges++;
    }
  }
  return { goldEdges, survivingEdgesAtGoldCoordinates: survivingEdges, exactColorEdgesAtGoldCoordinates: exactColorEdges };
}
function bodyWitnesses(base: Img, keyed: Img, gold: Img, candidate: Img, key: any, cut: number[]) {
  const cuts = new Set(cut);
  let visibleKey = 0, keyOutsideFrozenBody = 0, goldUncoveredBody = 0, goldUncoveredBodyExactKeyRgba = 0, goldUncoveredBodyStillKey = 0, goldUncoveredBodyOffKey = 0, goldUncoveredBodyErased = 0;
  for (let p = 0; p < base.w * base.h; p++) {
    if (keyAt(candidate, p, key)) { visibleKey++; if (!opaque(base, p)) keyOutsideFrozenBody++; }
    if (opaque(base, p) && !opaque(gold, p) && !cuts.has(p)) {
      goldUncoveredBody++;
      if (rgbaEqual(keyed, candidate, p)) goldUncoveredBodyExactKeyRgba++;
      if (keyAt(candidate, p, key)) goldUncoveredBodyStillKey++;
      else if (!opaque(candidate, p)) goldUncoveredBodyErased++;
      else goldUncoveredBodyOffKey++;
    }
  }
  return { visibleKey, keyOutsideFrozenBody, goldUncoveredBody, goldUncoveredBodyExactKeyRgba, goldUncoveredBodyStillKey, goldUncoveredBodyOffKey, goldUncoveredBodyErased };
}
const output: any = { version: 1, executedAt: new Date().toISOString(), node: process.version, evidenceSha256: sha(evidenceBytes), evidenceExportedAt: evidence.exportedAt, planId: evidence.plan.id, expectedOutputs: evidence.plan.expectedResults, predeclaredRawCandidateIndex: evidence.plan.candidateIndex, actualLastRawIndexSensitivity: 8, productionSources: {}, audit: { requests: 0, claims: 0, resultHashes: 0, resultDimensions: 0, requestIdentities: 0, outputCardinalityDeviations: 0 }, trials: [], controls: [], limitations: [] };
for (const path of ['app/src/lib/items/items.ts', 'app/src/lib/image/chroma.ts', 'app/src/lib/pixellab/queue.ts', 'app/src/lib/image/pngraw.ts']) output.productionSources[path] = sha(await readFile(resolve(root, path)));
const retained = new Map(evidence.jobs.map((entry: any) => [entry.job.requestHash, entry]));
const visuals = new Map<string, any>(), groups = new Map<string, any[]>();
let confirmedUsd = 0, subscriptionGenerations = 0;
for (const trial of evidence.plan.trials) {
  const identity = await requestIdentity(trial.request);
  const entry: any = retained.get(identity.requestHash); assert(entry, `Missing request ${trial.id}`);
  const job = entry.job; assert.equal(job.state, 'done'); assert.equal(job.endpoint, trial.request.path); assert.equal(job.requestHash, identity.requestHash);
  assert.deepEqual(job.inputs, identity.inputs); assert.equal(stableStringify(job.params), stableStringify(identity.params)); output.audit.requestIdentities++;
  const claim = evidence.claims[identity.requestHash]; assert.equal(claim.jobId, job.id); assert(Date.parse(claim.claimedAt) <= job.createdAt, 'Claim was not saved before queue record'); output.audit.claims++;
  const metadata = job.jobs.flatMap((sub: any) => sub.results);
  assert.equal(new Set(metadata.map((r: any) => r.label)).size, metadata.length, 'Duplicate raw labels');
  const imageMap = new Map(entry.images.map((im: any) => [im.sha, im.png])); assert.equal(imageMap.size, metadata.length);
  const packet = trial.packet, base = await png(packet.reference.base), gold = await png(packet.reference.layer), keyed = toChroma(base, packet.key), cuts = packet.reference.cut ?? [];
  assert.equal(base.w, trial.cell.w); assert.equal(base.h, trial.cell.h);
  const supplied = await png(trial.request.body.first_frame.base64), suppliedBytes = Buffer.from(trial.request.body.first_frame.base64, 'base64');
  assert.equal(supplied.w, 2 * base.w); assert.equal(supplied.h, base.h); assert.equal(compare(crop(supplied, 0, base.w), keyed).rgbaDifferent, 0);
  assert.equal(compare(crop(supplied, base.w, base.w), gold).visibleDifferent, 0);
  const freeOverlay = compose(base, gold, cuts), freeKeyedOverlay = compose(keyed, gold, cuts);
  const controlId = `${trial.caseId}-${trial.direction}`;
  if (!output.controls.some((c: any) => c.id === controlId)) output.controls.push({ id: controlId, width: base.w, height: base.h, frozenBodySha256: sha(base.data), approvedLayerSha256: sha(gold.data), overlaySha256: sha(freeOverlay.data), approvedLayerOpaque: countOpaque(gold), paidUsd: 0, sourceAlreadyFitted: true });
  const images: Img[] = [], frames: any[] = [], layers: Img[] = [], recompositions: Img[] = [], refPalette = [...colorCounts([gold]).keys()];
  metadata.sort((a: any, b: any) => Number(a.label) - Number(b.label));
  for (let index = 0; index < metadata.length; index++) {
    const meta = metadata[index]; assert.equal(String(meta.label), String(index), 'Nonconsecutive provider frame labels');
    const encoded = Buffer.from(imageMap.get(meta.sha) as string, 'base64'); assert.equal(sha(encoded), meta.sha); output.audit.resultHashes++;
    const image = await decodePngBytes(encoded); assert.equal(image.w, supplied.w); assert.equal(image.h, supplied.h); assert.equal(meta.w, image.w); assert.equal(meta.h, image.h); output.audit.resultDimensions++;
    images.push(image);
    const left = crop(image, 0, base.w), right = crop(image, base.w, base.w);
    // posed:false guarantees no registration translation. No postProcess, palette correction or repair runs.
    const extracted = extractCell({ key: `endpoint/${trial.direction}/${index}`, call: 0, base, out: left, route: packet.key, band: { x: 0, y: 0, w: base.w, h: base.h }, posed: false });
    assert.equal(compare(left, extracted.out).rgbaDifferent, 0); assert(extracted.offset.every(v => v === 0));
    layers.push(extracted.layer); const recomposed = compose(base, extracted.layer); recompositions.push(recomposed);
    const knownPalette = new Set(refPalette); let exactPalettePixels = 0;
    for (let p = 0; p < base.w * base.h; p++) if (opaque(extracted.layer, p)) {
      const rgb = (extracted.layer.data[p * 4]! << 16) | (extracted.layer.data[p * 4 + 1]! << 8) | extracted.layer.data[p * 4 + 2]!;
      if (knownPalette.has(rgb)) exactPalettePixels++;
    }
    frames.push({ rawIndex: index, rawPngSha256: meta.sha, left: { bounds: bounds(left), ...bodyWitnesses(base, keyed, gold, left, packet.key, cuts), comparedWithFreeKeyedOverlay: compare(left, freeKeyedOverlay), rgbaChangesFromPrevious: index ? compare(left, crop(images[index - 1]!, 0, base.w)).rgbaDifferent : 0 }, rightPane: { opaquePixels: countOpaque(right), keyColoredPixels: bounds(right, packet.key).pixels }, extracted: { pixels: extracted.area, paletteDistance: paletteDistance(refPalette, [extracted.layer]), exactApprovedPaletteShare: extracted.area ? exactPalettePixels / extracted.area : null, goldGeometryComparison: compare(extracted.layer, gold), goldEdgeProxy: edgeProxy(gold, extracted.layer), diagnosticShifted: extracted.shifted, appliedOffset: extracted.offset, keyKeptHeuristic: extracted.keyKept, keyOutsideHeuristic: extracted.keyOutside, specksHeuristic: extracted.specks }, recomposed: { comparisonWithFreeOverlay: compare(recomposed, freeOverlay), pixelSha256: sha(recomposed.data) } });
  }
  const anchorBytes = Buffer.from(imageMap.get(metadata[0].sha) as string, 'base64');
  const anchorComparison = compare(images[0]!, supplied);
  const candidateIndex = evidence.plan.candidateIndex, lastIndex = metadata.length - 1;
  const row = { id: trial.id, caseId: trial.caseId, direction: trial.direction, arm: trial.arm, seed: trial.seed, width: base.w, height: base.h, jobId: job.id, requestHash: identity.requestHash, firstFramePngSha256: sha(suppliedBytes), providerOutputCount: images.length, expectedOutputCount: evidence.plan.expectedResults, cardinalityConformsToPredeclaredProtocol: images.length === evidence.plan.expectedResults, output0: { pngByteExactInput: sha(anchorBytes) === sha(suppliedBytes), decodedRgbaExactInput: anchorComparison.rgbaDifferent === 0, ...anchorComparison }, primary: frames[candidateIndex], lastFrameSensitivity: frames[lastIndex], frameCountWithoutOutput0: images.length - 1, allFrameSummary: { maxKeyOutsideFrozenBody: Math.max(...frames.map(f => f.left.keyOutsideFrozenBody)), lastThreeRawLeftRgbaChanges: frames.slice(-3).map(f => f.left.rgbaChangesFromPrevious), rightPaneOpaqueAtPrimary: frames[candidateIndex].rightPane.opaquePixels, rightPaneOpaqueAtLast: frames[lastIndex].rightPane.opaquePixels }, confirmedUsd: job.usd, subscriptionGenerations: job.gens, frames };
  output.trials.push(row); output.audit.requests++; if (!row.cardinalityConformsToPredeclaredProtocol) output.audit.outputCardinalityDeviations++;
  confirmedUsd += job.usd; subscriptionGenerations += job.gens;
  visuals.set(trial.id, { row, images, layers, recompositions, base, keyed, gold, freeOverlay });
  const members = groups.get(controlId) ?? []; members.push(trial); groups.set(controlId, members);
}
assert.equal(output.audit.requests, 8); assert.equal(output.audit.resultHashes, 72); assert(Math.abs(confirmedUsd - 0.09793791823254691) < 1e-12); assert.equal(subscriptionGenerations, 0);
output.cost = { confirmedUsd, subscriptionGenerations, unresolvedRequests: 0, unknownCharges: 0, newPaidCallsByEvaluator: 0 };
output.protocolDeviation = { expected: 8, observedPerRequest: 9, affectedRequests: output.audit.outputCardinalityDeviations, resolution: 'No paid rerun. Preserve raw index 7 as primary and raw index 8 as sensitivity; report output-0 anchor evidence separately.' };
output.limitations = ['All inputs are existing approved garments already fitted to these bodies. Free exact overlay is the zero-cost control.', 'Golden-mask differences can be valid drape; palette/edge/shape metrics do not supply independent semantic ownership or prove motif preservation.', 'Raw key-colored witnesses and off-key extraction cannot classify every pixel as body or gear.', 'No image translation, resizing, pose correction, palette matching, best-frame selection, postprocessing or paid rerun is used.', 'Only one requested seed per fixture/view and one provider call per arm. Equal seeds do not establish shared stochastic noise.', 'Output cardinality deviates from the predeclared protocol for every request; endpoint sensitivity does not retroactively repair protocol conformity.'];
await mkdir(resolve(evidenceFolder, 'blind'), { recursive: true });
const blindMap: any[] = [], figures: string[] = [];
const savePng = async (name: string, image: Img) => writeFile(resolve(evidenceFolder, 'blind', name), await encodePngBytes(image));
function sheet(images: Img[], cols: number, cellW: number, cellH: number) {
  const gutter = 8, canvas = makeImg(cols * (cellW + gutter) + gutter, Math.ceil(images.length / cols) * (cellH + gutter) + gutter);
  for (let y = 0; y < canvas.h; y++) for (let x = 0; x < canvas.w; x++) canvas.data.set([...(((x >> 2) + (y >> 2)) % 2 ? [50, 50, 50] : [65, 65, 65]), 255], (y * canvas.w + x) * 4);
  images.forEach((image, i) => over(canvas, image, gutter + (i % cols) * (cellW + gutter), gutter + Math.floor(i / cols) * (cellH + gutter)));
  return canvas;
}
let groupIndex = 0;
for (const [controlId, trials] of groups) {
  groupIndex++; const code = `case-${String(groupIndex).padStart(2, '0')}`, ordered = groupIndex % 2 ? [...trials].reverse() : trials;
  const first = visuals.get(ordered[0].id), w = first.base.w, h = first.base.h;
  const groupMap: any = { code, controlId, candidates: [] };
  await savePng(`${code}-control.png`, sheet([first.keyed, first.gold, first.freeOverlay], 3, w, h));
  figures.push(`<h2>${code}</h2><p>Control columns: frozen keyed body, approved garment, zero-cost exact overlay. Native pixels on a checkerboard presentation background.</p><img src="${code}-control.png">`);
  for (const [i, trial] of ordered.entries()) {
    const letter = i ? 'B' : 'A', visual = visuals.get(trial.id); groupMap.candidates.push({ letter, trialId: trial.id, arm: trial.arm });
    const candidates = [7, 8].flatMap(index => [crop(visual.images[index], 0, w), visual.layers[index], visual.recompositions[index]]);
    await savePng(`${code}-${letter}-endpoints.png`, sheet(candidates, 3, w, h));
    await savePng(`${code}-${letter}-all-raw.png`, sheet(visual.images, 3, 2 * w, h));
    const sources: string[] = [];
    for (let f = 0; f < visual.images.length; f++) { const name = `${code}-${letter}-raw-${f}.png`; await savePng(name, visual.images[f]); sources.push(name); }
    figures.push(`<h3>Candidate ${letter}</h3><p>Endpoint rows: raw index 7 (predeclared), raw index 8 (last-frame sensitivity). Columns: fixed left raw crop, extracted layer, frozen-body recomposition. No translation or scaling.</p><img src="${code}-${letter}-endpoints.png"><p>All raw full-canvas frames, provider order 0 through 8, three columns:</p><img src="${code}-${letter}-all-raw.png"><p><button data-frames='${JSON.stringify(sources)}'>Play all raw frames once</button> <span>Display cadence 200 ms, not reported provider timing.</span></p><img class="playback" src="${sources[0]}">`);
  }
  blindMap.push(groupMap);
}
await writeFile(resolve(evidenceFolder, 'blind', 'blinding-map.json'), JSON.stringify(blindMap, null, 2) + '\n');
await writeFile(resolve(evidenceFolder, 'blind', 'index.html'), `<!doctype html><html lang="en"><meta charset="utf-8"><title>Blind endpoint pilot review</title><style>body{background:#181818;color:#eee;font:16px system-ui;margin:24px;max-width:1000px}img{image-rendering:pixelated;display:block;margin:8px 0}button{padding:8px}</style><h1>Blind endpoint pilot review</h1><p>All public-source images are shown at native resolution. Candidate labels hide prompt arms. Preserve a written judgment before reading the separate blinding map. A good composite can hide a bad raw body; inspect all three columns. Gold silhouette differences can be legitimate drape.</p>${figures.join('\n')}<script>for(const button of document.querySelectorAll('button[data-frames]'))button.onclick=()=>{const frames=JSON.parse(button.dataset.frames),img=button.parentElement.nextElementSibling;button.disabled=true;let i=0;img.src=frames[i];const timer=setInterval(()=>{i++;if(i===frames.length){clearInterval(timer);button.disabled=false;return;}img.src=frames[i];},200);};</script></html>`);
output.blindReview = { location: 'app/test-results-post-handoff-live/blind/index.html', pairCount: blindMap.length, candidateLabelMappingRetainedSeparately: true, imageTransform: 'Native-size contact-sheet placement only; opaque checkerboard is presentation background.' };
await writeFile(resolve(folder, 'results.json'), JSON.stringify(output, null, 2) + '\n');
console.log(JSON.stringify({ audit: output.audit, cost: output.cost, output0DecodedExact: output.trials.filter((t: any) => t.output0.decodedRgbaExactInput).length, primary: output.trials.map((t: any) => ({ id: t.id, keyOutside: t.primary.left.keyOutsideFrozenBody, offKeyUncovered: t.primary.left.goldUncoveredBodyOffKey, erasedUncovered: t.primary.left.goldUncoveredBodyErased, rightResidue: t.primary.rightPane.opaquePixels, shapeIoU: t.primary.extracted.goldGeometryComparison.alphaIoU, paletteDistance: t.primary.extracted.paletteDistance })) }));
