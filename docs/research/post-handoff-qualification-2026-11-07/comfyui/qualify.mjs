import { strict as assert } from 'node:assert';
import { createHash } from 'node:crypto';
import { readFile, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { makeImg } from '../../../../app/src/lib/image/png.ts';
import { chromaLayer, toChroma, components, KEYS } from '../../../../app/src/lib/image/chroma.ts';
import { packGrid, cutGrid, extractCell } from '../../../../app/src/lib/items/items.ts';
import { requestIdentity, Queue } from '../../../../app/src/lib/pixellab/queue.ts';
import { accountBalance } from '../../../../app/test/unit/account-fixture.ts';

const folder = dirname(fileURLToPath(import.meta.url)), root = resolve(folder, '../../../..');
const sha = value => createHash('sha256').update(value).digest('hex');
const result = { version: process.version, platform: process.platform, executedAt: new Date().toISOString(), sources: {}, contracts: [], extraction: [], limitations: [] };
for (const path of ['app/src/lib/image/chroma.ts', 'app/src/lib/items/items.ts', 'app/src/lib/pixellab/queue.ts', 'app/src/lib/image/png.ts']) result.sources[path] = sha(await readFile(resolve(root, path)));
const check = (name, pass, details = {}) => { result.contracts.push({ name, pass, ...details }); };
const paint = (im, x, y, rgb = [150, 150, 150]) => im.data.set([...rgb, 255], (y * im.w + x) * 4);
const maskCount = mask => mask.reduce((n, v) => n + Number(Boolean(v)), 0);
function base(size = 32) {
  const image = makeImg(size, size);
  for (let y = 5; y < size - 5; y++) for (let x = 8; x < size - 8; x++) paint(image, x, y, [130, 105, 80]);
  return image;
}
function score(name, B, C, expected, key, extra = {}) {
  const beforeBase = sha(B.data), beforeOut = sha(C.data), extracted = chromaLayer(C, key, B);
  let truePositive = 0, falsePositive = 0, falseNegative = 0;
  for (let p = 0; p < expected.length; p++) {
    if (expected[p] && extracted.mask[p]) truePositive++;
    if (!expected[p] && extracted.mask[p]) falsePositive++;
    if (expected[p] && !extracted.mask[p]) falseNegative++;
  }
  assert.equal(sha(B.data), beforeBase); assert.equal(sha(C.data), beforeOut);
  result.extraction.push({ name, key, expected: maskCount(expected), actual: maskCount(extracted.mask), truePositive, falsePositive, falseNegative, expectedComponents4: components(expected, B.w, B.h, true).length, actualComponents4: components(extracted.mask, B.w, B.h, true).length, expectedComponents8: components(expected, B.w, B.h).length, actualComponents8: components(extracted.mask, B.w, B.h).length, ...extra });
  return extracted;
}

// Independent ground truth is authored before extraction; no extractor-selected masks become truth.
for (const key of KEYS) {
  const B = base(), C = toChroma(B, key), expected = new Uint8Array(1024);
  for (let y = 11; y <= 17; y++) for (let x = 12; x <= 18; x++) if (x === 12 || x === 18 || y === 11 || y === 17) { paint(C, x, y); expected[y * 32 + x] = 1; }
  // The bright-key center denotes visible body, not generated gear.
  const brightest = key === 'green' ? [110, 255, 110] : key === 'magenta' ? [255, 110, 255] : key === 'blue' ? [110, 110, 255] : [110, 183, 255];
  for (let y = 12; y < 17; y++) for (let x = 13; x < 18; x++) paint(C, x, y, brightest);
  score('wide-enclosed-body-hole', B, C, expected, key);
  const strand = toChroma(B, key), strandGold = new Uint8Array(1024);
  for (let y = 12; y < 17; y++) for (let x = 13; x < 18; x++) { paint(strand, x, y); strandGold[y * 32 + x] = 1; }
  for (let x = 18; x < 28; x++) { paint(strand, x, 14); strandGold[14 * 32 + x] = 1; }
  score('connected-one-pixel-strand', B, strand, strandGold, key);
  const diagonal = toChroma(B, key), diagonalGold = new Uint8Array(1024);
  for (const [x, y] of [[14, 12], [15, 13], [16, 14]]) { paint(diagonal, x, y); diagonalGold[y * 32 + x] = 1; }
  score('diagonal-bridge-three-pixels', B, diagonal, diagonalGold, key);
}
for (const dark of [false, true]) {
  const B = base(), C = toChroma(B, 'green'), expected = new Uint8Array(1024);
  for (let y = 12; y < 15; y++) for (let x = 13; x < 16; x++) if (x !== 14 || y !== 13) { paint(C, x, y); expected[y * 32 + x] = 1; }
  paint(C, 14, 13, dark ? [0, 60, 0] : [0, 210, 0]);
  score(dark ? 'one-pixel-dark-body-hole' : 'one-pixel-bright-body-hole', B, C, expected, 'green');
  const protectedCell = extractCell({ key: 'idle/south/0', call: 0, base: B, out: C, route: 'green', band: { x: 0, y: 0, w: 32, h: 32 }, stencil: expected });
  check(`${dark ? 'dark' : 'bright'} body hole with explicit ownership stencil`, protectedCell.mask[13 * 32 + 14] === 0, { area: protectedCell.area });
}
for (const owner of ['legitimate-detail', 'stray-artifact']) {
  const B = base(), C = toChroma(B, 'green'), expected = new Uint8Array(1024);
  paint(C, 25, 15);
  if (owner === 'legitimate-detail') expected[15 * 32 + 25] = 1;
  score(`isolated-single-pixel-${owner}`, B, C, expected, 'green', { observedImageHash: sha(C.data) });
}
for (const owner of ['body', 'gear']) {
  const B = base(), C = toChroma(B, 'green'), expected = new Uint8Array(1024);
  // Identical observed RGB but opposite semantic labels: a key alone cannot resolve both.
  for (let y = 11; y < 15; y++) for (let x = 12; x < 17; x++) { paint(C, x, y, [0, 180, 0]); if (owner === 'gear') expected[y * 32 + x] = 1; }
  score(`same-observed-key-RGB-owner-${owner}`, B, C, expected, 'green', { observedImageHash: sha(C.data) });
}

// Exact production request identities must reflect content, ordered references, masks, role and route.
const image = bytes => ({ type: 'base64', base64: Buffer.from(bytes).toString('base64'), format: 'png' });
const req = { method: 'POST', path: '/inpaint-v3', body: { seed: 4, inpainting_image: { image: image([1, 2, 3]), size: { width: 32, height: 32 } }, mask_image: { image: image([0, 1, 0]), size: { width: 32, height: 32 } } } };
const identity = (await requestIdentity(req)).requestHash;
for (const [name, mutate] of [
  ['source bytes', q => { q.body.inpainting_image.image = image([1, 2, 4]); }],
  ['mask bytes', q => { q.body.mask_image.image = image([0, 1, 1]); }],
  ['source dimensions', q => { q.body.inpainting_image.size.width++; }],
  ['seed', q => { q.body.seed++; }],
  ['route', q => { q.path = '/edit-animation-v2'; }],
]) { const changed = structuredClone(req); mutate(changed); check(`request identity changes with ${name}`, (await requestIdentity(changed)).requestHash !== identity); }
check('request identity stable for identical deep copy', (await requestIdentity(structuredClone(req))).requestHash === identity);
const frameReq = { method: 'POST', path: '/edit-animation-v2', body: { description: 'offline hash probe', image_size: { width: 32, height: 32 }, frames: [{ image: image([4]), size: { width: 32, height: 32 } }, { image: image([5]), size: { width: 32, height: 32 } }] } };
const frameIdentity = (await requestIdentity(frameReq)).requestHash;
const reversed = structuredClone(frameReq); reversed.body.frames.reverse();
check('request identity changes with ordered edit frames', (await requestIdentity(reversed)).requestHash !== frameIdentity);

const cells = [makeImg(32, 32), makeImg(32, 32)];
paint(cells[0], 2, 2, [60, 60, 60]); paint(cells[1], 5, 7, [210, 210, 210]);
const masks = [new Uint8Array(1024), new Uint8Array(1024)]; masks[0][2 * 32 + 2] = 1; masks[1][7 * 32 + 5] = 1;
const packed = packGrid(cells, masks, 2), split = cutGrid(packed.image, 2, 32, 32, 2);
check('pack/cut exact frame round trip', split.every((cell, i) => sha(cell.data) === sha(cells[i].data)));
check('packed mask polarity and independent frame mapping', packed.mask.data[(2 * packed.mask.w + 2) * 4] === 255 && packed.mask.data[(7 * packed.mask.w + 37) * 4] === 255 && packed.mask.data[(7 * packed.mask.w + 5) * 4] === 0);
for (const [name, badCells, badMasks] of [
  ['short mask list', cells, masks.slice(0, 1)],
  ['extra mask list', cells, [...masks, new Uint8Array(1024)]],
  ['wrong mask dimensions', cells, [new Uint8Array(5), masks[1]]],
  ['oversized mask dimensions', cells, [new Uint8Array(2048).fill(1), masks[1]]],
  ['mixed cell dimensions', [cells[0], makeImg(16, 32)], masks],
]) {
  let error;
  try { packGrid(badCells, badMasks, 2); } catch (e) { error = e.message; }
  check(`packGrid rejects ${name}`, Boolean(error), { error: error ?? null });
}
const nonzero = new Uint8Array(1024); nonzero[0] = 128; nonzero[1] = 255;
const nonzeroGrid = packGrid(cells, [nonzero, null], 2);
check('packGrid preserves nonzero occupancy semantics', nonzeroGrid.mask.data[0] === 255 && nonzeroGrid.mask.data[4] === 255 && nonzeroGrid.mask.data[8] === 0);

const records = new Map(); let posts = 0;
const deps = { locks: null, online: () => true, now: () => 1000, put: async (id, rec) => records.set(id, structuredClone(rec)), get: async id => structuredClone(records.get(id)), all: async () => [...records.values()].map(rec => structuredClone(rec)), api: async (_key, method, path) => { if (path === '/balance') return accountBalance; posts++; return { usage: { type: 'generations', generations: 1 } }; } };
const makeQueue = () => { const queue = new Queue(deps); queue.setKey('offline-fixture-token'); return queue; };
const queued = makeQueue(), noNetworkReq = { method: 'POST', path: '/create-character-v3', body: { description: 'synthetic offline fixture', seed: 46 } };
const first = await queued.enqueue(noNetworkReq); await queued.tick();
const resumed = makeQueue(); await resumed.load(); const second = await resumed.enqueue(noNetworkReq); await resumed.tick();
check('completed queue receipt reused after reload without another injected POST', first.id === second.id && posts === 1, { injectedPostCount: posts });
result.limitations.push('All API operations use injected in-memory fixtures. No provider calls or credentials are used.', 'Canonical identity probes use synthetic byte payloads to isolate hashing; they do not establish valid PNG/provider inputs or provider acceptance.', 'Opposite semantic labels on identical observed inputs deliberately demonstrate identifiability limits rather than a safe threshold fix.', 'Production files have concurrent edits; exact content hashes identify this execution.');
result.summary = { contracts: result.contracts.length, contractPass: result.contracts.filter(c => c.pass).length, contractFail: result.contracts.filter(c => !c.pass).length, extractionCases: result.extraction.length, extractionExact: result.extraction.filter(c => c.falsePositive === 0 && c.falseNegative === 0).length, falsePositivePixels: result.extraction.reduce((n, c) => n + c.falsePositive, 0), falseNegativePixels: result.extraction.reduce((n, c) => n + c.falseNegative, 0) };
await writeFile(resolve(folder, 'results.json'), JSON.stringify(result, null, 2) + '\n');
console.log(JSON.stringify(result.summary));
