import { beforeEach, expect, test, vi } from 'vitest';
import type { JobRec } from '../../src/lib/pixellab/queue.ts';
import type { Req } from '../../src/lib/pixellab/routes.ts';
import type { Item, Manifest } from '../../src/lib/store/manifest.ts';
import type { StoredProject } from '../../src/lib/store/project.ts';
import { base64ToBytes, makeImg, type Img } from '../../src/lib/image/png.ts';
import { sha256 } from '../../src/lib/image/hash.ts';
import { decodePngBytes, encodePngBytes } from '../../src/lib/image/pngraw.ts';
import { cellHash, DIRECTIONS, type Keypoint } from '../../src/lib/rig/rig.ts';
import { fromApi, LABELS } from '../../src/lib/rig/poses.ts';
import { toChroma } from '../../src/lib/image/chroma.ts';
import { over } from '../../src/lib/compose/compose.ts';
import { itemRoute, packGrid, padImg } from '../../src/lib/items/items.ts';
import { acceptItem, evaluateItem, gensOf, isClean, newDraft, poseItemClip, rerollCall, runItem, type Draft, type RigCtx } from '../../src/lib/items/run.ts';
import { draftQueueIds } from '../../src/studio/apiPlans.ts';

const ledger = vi.hoisted(() => ({ records: new Map<string, JobRec>(), requests: [] as Req[], blobs: new Map<string, Blob>(), identities: new Map<string, string>(), listeners: new Set<(s: { jobs: JobRec[] }) => void>(), next: 0, enqueues: 0, project: null as StoredProject | null, output: null as null | ((req: Req) => Promise<Img[]>) }));
vi.mock('../../src/lib/pixellab/queue.ts', () => ({ queue: {
  subscribe(cb: (s: { jobs: JobRec[] }) => void) { ledger.listeners.add(cb); cb({ jobs: [...ledger.records.values()] }); return () => ledger.listeners.delete(cb); },
  planBlocks: () => null,
  async enqueue(req: Req, meta: { label: string }) {
    ledger.enqueues++;
    if (req.path === '/edit-animation-v2') expect((req.body as { frames: unknown[] }).frames.length).toBeGreaterThanOrEqual(2);
    const fingerprint = JSON.stringify(req), existing = ledger.identities.get(fingerprint);
    if (existing) return ledger.records.get(existing)!;
    const id = `automatic-${ledger.next++}`, outputs = await ledger.output!(req), results = [];
    for (const [index, im] of outputs.entries()) {
      const sha = `${id}-${index}`, bytes = await encodePngBytes(im);
      ledger.blobs.set(sha, new Blob([bytes as Uint8Array<ArrayBuffer>])); results.push({ sha, label: String(index) });
    }
    const params = structuredClone(req.body), inputs: string[] = [];
    if (req.path === '/inpaint-v3') {
      const mask = (params as { mask_image: { image: { base64?: string; $blob?: string } } }).mask_image.image;
      const bytes = base64ToBytes(mask.base64!), hash = await sha256(bytes);
      ledger.blobs.set(hash, new Blob([bytes as Uint8Array<ArrayBuffer>]));
      delete mask.base64; mask.$blob = hash; inputs.push(hash);
    }
    const rec = { id, label: meta.label, method: 'POST', endpoint: req.path, params, inputs, requestHash: id, state: 'done', attempts: 1, nextAt: 0, createdAt: 1, gens: req.path === '/animate-with-skeleton-v3' ? 2 : 10, usd: 0, jobs: [{ id: `${id}-job`, done: true, status: 'completed', results }] } as JobRec;
    ledger.identities.set(fingerprint, id); ledger.records.set(id, rec); ledger.requests.push(req);
    for (const cb of ledger.listeners) cb({ jobs: [...ledger.records.values()] });
    return rec;
  },
} }));
vi.mock('../../src/lib/store/db.ts', () => ({
  getBlob: async (sha: string) => ledger.blobs.get(sha),
  async updateCharacter(_id: string, blobs: Map<string, Blob>, fn: (p: StoredProject | undefined) => StoredProject) {
    ledger.project = fn(ledger.project ? structuredClone(ledger.project) : undefined);
    for (const [hash, blob] of blobs) ledger.blobs.set(hash, blob);
  },
}));
beforeEach(() => {
  ledger.records.clear(); ledger.requests.splice(0); ledger.blobs.clear(); ledger.identities.clear(); ledger.project = null; ledger.enqueues = 0;
  for (const cb of ledger.listeners) cb({ jobs: [] });
});
function paint(im: Img, x: number, y: number, w: number, h: number, rgb: number[]) {
  for (let Y = y; Y < y + h; Y++) for (let X = x; X < x + w; X++) im.data.set([...rgb, 255], (Y * im.w + X) * 4);
}
async function fixture(suspicious = false) {
  const body = makeImg(32, 32), skin = [180, 130, 100];
  paint(body, 13, 4, 6, 7, skin); paint(body, 15, 11, 2, 2, skin); paint(body, 12, 13, 8, 8, skin);
  paint(body, 12, 21, 3, 7, skin); paint(body, 17, 21, 3, 7, skin);
  paint(body, 10, 28, 5, 2, skin); paint(body, 17, 28, 5, 2, skin);
  const layer = makeImg(32, 32); paint(layer, 12, 13, 8, 8, [35, 35, 40]); paint(layer, 12, 21, 3, 7, [35, 35, 40]); paint(layer, 17, 21, 3, 7, [35, 35, 40]);
  paint(layer, 10, 28, 5, 2, [220, 220, 210]); paint(layer, 17, 28, 5, 2, [220, 220, 210]);
  const dressed = toChroma(body, 'green'); over(dressed, layer);
  const missing = structuredClone(dressed);
  const keyBody = toChroma(body, 'green');
  for (let y = 27; y < 30; y++) for (let x = 9; x < 16; x++) missing.data.set(keyBody.data.subarray((y * 32 + x) * 4, (y * 32 + x) * 4 + 4), (y * 32 + x) * 4);
  const h = await cellHash(body), dh = await cellHash(dressed), lh = await cellHash(layer);
  const pointMap: Record<string, [number, number]> = { NECK: [16, 12], NOSE: [16, 7], 'LEFT SHOULDER': [12, 13], 'RIGHT SHOULDER': [20, 13], 'LEFT ELBOW': [10, 17], 'RIGHT ELBOW': [22, 17], 'LEFT ARM': [10, 21], 'RIGHT ARM': [22, 21], 'LEFT HIP': [14, 20], 'RIGHT HIP': [18, 20], 'LEFT KNEE': [13, 24], 'RIGHT KNEE': [19, 24], 'LEFT LEG': [12, 29], 'RIGHT LEG': [19, 29], 'LEFT EAR': [13, 6], 'RIGHT EAR': [19, 6] };
  const points: Keypoint[] = LABELS.map(label => ({ label, x: (pointMap[label]?.[0] ?? 16) / 32, y: (pointMap[label]?.[1] ?? 7) / 32 }));
  const broken = points.map(p => /SHOULDER|HIP/.test(p.label) ? { ...p, x: 1 - p.x } : p.label === 'LEFT EAR' ? { ...p, x: 19 / 32 } : p);
  const poses = [points, suspicious ? broken : points, points];
  const item: Item = { id: 'outfit', name: 'Outfit', slot: 'torso_inner', prompt: 'a black robe and white boots', status: 'accepted', mirror: 'generate', materials: [], baseHash: h, key: 'green', route: 'skeleton-pose', dressed: { south: dh }, provenance: [], layers: [{ id: 'main', role: 'fg', z: 40, cells: { default: { south: [lh] } } }] };
  const manifest: Manifest = { format: 'pixeldoll/2', app: 'test', name: 'Synthetic', materials: [], slots: [], presets: [],
    rig: { cell: { w: 32, h: 32 }, pivot: { x: 16, y: 31 }, baseHash: h, baseItem: 'base', directions: [{ id: 'south' }], rest: { south: { image: h, keypoints: points } }, animations: [{ id: 'walking', cells: 3, loop: true, frames: [0, 1, 2].map(cell => ({ cell, ms: 100 })), sources: { south: { route: suspicious ? 'import' : 'skeleton-v3', reference: h, keypoints: poses, measured: poses, provenance: [] } } }] },
    items: [{ id: 'base', name: 'Base', slot: 'body', prompt: '', status: 'accepted', mirror: 'generate', materials: [], baseHash: h, provenance: [], layers: [{ id: 'main', role: 'fg', z: 10, cells: { walking: { south: [h, h, h] } } }] }, item],
  };
  const images = new Map([[h, body], [dh, dressed], [lh, layer]]);
  for (const [hash, im] of images) ledger.blobs.set(hash.slice(7), new Blob([await encodePngBytes(im) as Uint8Array<ArrayBuffer>]));
  const ctx: RigCtx = { rec: { id: 'synthetic-auto', savedAt: '', manifest, skeletons: Object.fromEntries(poses.map((p, i) => [`walking/south/${i}`, fromApi(p, manifest.rig.cell)])) }, project: { manifest, images } };
  ledger.project = structuredClone(ctx.rec);
  const grid = (im: Img) => packGrid([im, im, im, dressed], [null, null, null, null]).image;
  return { ctx, item, dressed, missing, grid };
}

test('the shared edit builder duplicates one input without changing multi-frame requests or canvas size', () => {
  const input = ['first'], cell = { w: 48, h: 48 };
  const one = itemRoute.edit(input, 'standing clothing', 7, cell).body as { frames: { image: { base64: string }; size: { width: number; height: number } }[]; image_size: { width: number; height: number } };
  expect(input).toEqual(['first']);
  expect(one.frames.map(f => f.image.base64)).toEqual(['first', 'first']);
  expect(one.image_size).toEqual({ width: 48, height: 48 });
  expect(one.frames.every(f => f.size.width === 48 && f.size.height === 48)).toBe(true);
  const two = itemRoute.edit(['first', 'second'], 'two views', 7, cell).body as typeof one;
  expect(two.frames.map(f => f.image.base64)).toEqual(['first', 'second']);
});

async function singleStandingFixture() {
  const f = await fixture(), animation = f.ctx.rec.manifest.rig.animations[0], source = animation.sources!.south!;
  animation.cells = 1; animation.frames = [animation.frames[0]];
  source.motion = 'imported-rest'; source.keypoints = source.keypoints!.slice(0, 1); source.measured = source.measured!.slice(0, 1);
  f.ctx.rec.manifest.items[0].layers[0].cells!.walking!.south = [f.ctx.rec.manifest.rig.rest!.south!.image];
  const draft = newDraft(f.ctx, { name: 'One standing view', slot: 'torso_inner', prompt: f.item.prompt!, key: 'green', anims: ['walking'], dirs: ['south'] });
  expect(draft.calls.map(c => c.cells)).toEqual([['rest/south/0']]);
  ledger.project = structuredClone(f.ctx.rec);
  return { ...f, draft };
}

async function retainedMaskedGrid(badMask?: 'gray' | 'alpha' | 'canvas') {
  const f = await fixture(), rig = f.ctx.rec.manifest.rig, animation = rig.animations[0];
  animation.cells = 2; animation.frames = animation.frames.slice(0, 2);
  animation.sources!.south!.keypoints = animation.sources!.south!.keypoints!.slice(0, 2);
  animation.sources!.south!.measured = animation.sources!.south!.measured!.slice(0, 2);
  const body = f.ctx.project.images.get(rig.rest!.south!.image)!;
  const base = padImg(body, 16), input = toChroma(base, 'green'), bits = new Uint8Array(64 * 64);
  const output = { ...input, data: new Uint8ClampedArray(input.data) };
  for (let y = 31; y < 36; y++) for (let x = 34; x < 44; x++) {
    bits[y * 64 + x] = 1; output.data.set([160, 160, 170, 255], (y * 64 + x) * 4);
  }
  // This real body pixel is a protected finger-shaped hole that closeGrip would otherwise refill.
  bits[33 * 64 + 35] = 0;
  output.data.set(input.data.subarray((33 * 64 + 35) * 4, (33 * 64 + 36) * 4), (33 * 64 + 35) * 4);
  // Connected provider repaint outside the saved permission, but inside today's broad wrist circle.
  paint(output, 32, 29, 2, 2, [120, 80, 40]);
  const grid = packGrid([input, input, input], [bits, bits, null]);
  const result = packGrid([output, output, input], [null, null, null]).image;
  // Unused tail cells are not target permissions and may have transparent pixels.
  for (let y = 0; y < 64; y++) for (let x = 192; x < 256; x++) grid.mask.data.fill(0, (y * 256 + x) * 4, (y * 256 + x + 1) * 4);
  if (badMask === 'gray') grid.mask.data.set([127, 127, 127, 255], (32 * 256 + 34) * 4);
  if (badMask === 'alpha') grid.mask.data.set([255, 255, 255, 0], (32 * 256 + 34) * 4);
  const put = async (image: Img) => {
    const bytes = await encodePngBytes(image), hash = await sha256(bytes);
    ledger.blobs.set(hash, new Blob([bytes as Uint8Array<ArrayBuffer>])); return hash;
  };
  const maskHash = await put(badMask === 'canvas' ? makeImg(128, 64) : grid.mask), resultHash = await put(result);
  const record: JobRec = { id: 'retained-mask', method: 'POST', endpoint: '/inpaint-v3', label: 'Saved grid',
    params: { inpainting_image: { size: { width: 256, height: 64 } }, mask_image: { image: { type: 'base64', $blob: maskHash }, size: { width: 256, height: 64 } } },
    inputs: [maskHash], requestHash: 'retained-identity', state: 'done', attempts: 1, nextAt: 0, createdAt: 1, gens: 10, usd: 0,
    jobs: [{ id: 'retained-remote', status: 'completed', done: true, results: [{ label: '0', sha: resultHash }] }] };
  const draft: Draft = { rigId: f.ctx.rec.id, spec: { id: 'masked', name: 'Masked sword', slot: 'main_hand', prompt: 'steel sword', key: 'green', method: 'skel', anims: ['walking'], dirs: ['south'] }, calls: [{ kind: 'grid', cells: ['walking/south/0', 'walking/south/1'], seed: 7, recId: record.id, rerolls: 0, old: [] }], log: [] };
  ledger.records.set(record.id, record);
  const publish = () => { for (const cb of ledger.listeners) cb({ jobs: [...ledger.records.values()] }); };
  publish();
  return { ...f, base, input, bits, maskHash, record, draft, put, publish };
}

test('restored inpaint uses its saved mask, retains allowed foreground, and cannot regrow protected body or finger pixels', async () => {
  const f = await retainedMaskedGrid(), result = await evaluateItem(f.draft, f.ctx);
  expect(result.g1.size).toBe(0); expect(result.cells).toHaveLength(2);
  for (const cell of result.cells) {
    expect(cell.stencil).toEqual(f.bits); expect(cell.offset.every(v => v === 0)).toBe(true);
    expect(f.base.data[(32 * 64 + 34) * 4 + 3]).toBe(255);
    expect(cell.layer.data[(32 * 64 + 34) * 4 + 3]).toBe(255); // genuine foreground over the body
    for (const p of [29 * 64 + 32, 30 * 64 + 33, 33 * 64 + 35]) {
      expect(cell.mask[p]).toBe(0); expect(cell.layer.data.subarray(p * 4, p * 4 + 4)).toEqual(new Uint8ClampedArray(4));
      expect(cell.cut?.[p] ?? 0).toBe(0);
    }
    for (let p = 0; p < f.bits.length; p++) if (!f.bits[p]) expect(cell.mask[p]).toBe(0);
  }
  expect(ledger.enqueues).toBe(0); // reload evaluates retained artwork without sending anything
});

test.each([0, 2])('a restored repair with %i output images requires review without making another request', async (count) => {
  const f = await retainedMaskedGrid(), job = f.record.jobs[0], output = job.results![0];
  job.results = Array.from({ length: count }, (_, index) => ({ ...output, label: String(index) }));
  f.publish();
  const result = await evaluateItem(f.draft, f.ctx);
  expect(result.g1.get(0)).toBe('G1 expected exactly one repair grid');
  expect(result.cells).toHaveLength(0);
  expect(ledger.enqueues).toBe(0);
});

test('mutating returned extraction arrays cannot change the next evaluation of the same draft', async () => {
  const f = await retainedMaskedGrid(), first = await evaluateItem(f.draft, f.ctx);
  const expected = first.cells.map(cell => ({ layer: cell.layer.data.slice(), mask: cell.mask.slice(), stencil: cell.stencil!.slice() }));
  for (const cell of first.cells) { cell.layer.data.fill(0); cell.mask.fill(0); cell.stencil!.fill(1); }
  const next = await evaluateItem(f.draft, f.ctx);
  expect(next.g1.size).toBe(0); expect(next.cells).toHaveLength(2);
  for (const [i, cell] of next.cells.entries()) {
    expect(cell.layer.data).toEqual(expected[i].layer); expect(cell.mask).toEqual(expected[i].mask); expect(cell.stencil).toEqual(expected[i].stencil);
    expect(cell.stencil).not.toBe(first.cells[i].stencil);
  }
  expect(ledger.enqueues).toBe(0);
});

test('a changed valid saved mask invalidates cached extraction for the same draft and output record', async () => {
  const f = await retainedMaskedGrid(), first = await evaluateItem(f.draft, f.ctx);
  expect(first.cells[0].area).toBeGreaterThan(0); expect(first.cells[1].area).toBeGreaterThan(0);
  const mask = await decodePngBytes(new Uint8Array(await ledger.blobs.get(f.maskHash)!.arrayBuffer()));
  for (let y = 0; y < 64; y++) for (let x = 0; x < 64; x++) mask.data.set([0, 0, 0, 255], (y * mask.w + x) * 4);
  const hash = await f.put(mask), params = f.record.params as { mask_image: { image: { $blob: string } } };
  params.mask_image.image.$blob = hash; f.record.inputs = [hash]; f.publish();
  const next = await evaluateItem(f.draft, f.ctx);
  expect(next.g1.size).toBe(0); expect(next.cells).toHaveLength(2);
  expect(next.cells[0].key).toBe(first.cells[0].key); expect(next.cells[0].area).toBe(0);
  expect(next.cells[0].stencil!.every(v => v === 0)).toBe(true); expect(next.cells[0].layer.data.every(v => v === 0)).toBe(true);
  expect(next.cells[1].stencil).toEqual(f.bits); expect(next.cells[1].mask).toEqual(first.cells[1].mask);
  expect(next.cells[1].layer.data).toEqual(first.cells[1].layer.data); expect(ledger.enqueues).toBe(0);
});

test('returned body cuts cannot mutate cached keyframe or posed cuts on reevaluation', async () => {
  const f = await singleStandingFixture(), rig = f.ctx.rec.manifest.rig;
  f.draft.spec.slot = 'head';
  const output = toChroma(f.ctx.project.images.get(rig.rest!.south!.image)!, 'green');
  paint(output, 14, 3, 4, 4, [130, 130, 140]);
  for (let y = 4; y < 7; y++) output.data.fill(0, (y * 32 + 13) * 4, (y * 32 + 14) * 4);
  ledger.output = async () => [output, output];
  const first = (await runItem(f.draft, f.ctx))!;
  expect(first.g1.size).toBe(0); expect(first.cells).toHaveLength(1);
  const cut = first.cells[0].cut!, expected = cut.slice();
  expect(cut.some(Boolean)).toBe(true); cut.fill(1);
  const next = await evaluateItem(f.draft, f.ctx);
  expect(next.cells[0].cut).toEqual(expected); expect(next.cells[0].cut).not.toBe(cut);
  expect(ledger.enqueues).toBe(1);
});

test.each(['identity', 'input', 'missing', 'hash', 'declared'] as const)('unavailable or changed saved inpaint mask %s is a visible structural failure', async mode => {
  const f = await retainedMaskedGrid();
  const params = f.record.params as { mask_image: { image: { $blob?: string }; size: { width: number } } };
  if (mode === 'identity') delete params.mask_image.image.$blob;
  if (mode === 'input') f.record.inputs = [];
  if (mode === 'missing') ledger.blobs.delete(f.maskHash);
  if (mode === 'hash') ledger.blobs.set(f.maskHash, new Blob([await encodePngBytes(makeImg(256, 64)) as Uint8Array<ArrayBuffer>]));
  if (mode === 'declared') params.mask_image.size.width = 128;
  const result = await evaluateItem(f.draft, f.ctx);
  expect(result.cells).toHaveLength(0); expect(result.g1.get(0)).toMatch(/G1.*(?:mask|layout)/);
  expect(result.preview).toBeNull(); expect(ledger.enqueues).toBe(0);
});

test.each(['gray', 'alpha', 'canvas'] as const)('invalid saved target-mask %s cannot fall back to an unbounded extraction', async mode => {
  const f = await retainedMaskedGrid(mode), result = await evaluateItem(f.draft, f.ctx);
  expect(result.cells).toHaveLength(0); expect(result.g1.get(0)).toMatch(/G1.*(?:binary|canvas)/);
  expect(ledger.enqueues).toBe(0);
});

test('raw skeleton outputs retain their existing one-pixel registration and have no inpaint stencil', async () => {
  const f = await retainedMaskedGrid(), shifted = makeImg(64, 64);
  for (let y = 0; y < 64; y++) for (let x = 0; x < 63; x++) shifted.data.set(f.input.data.subarray((y * 64 + x) * 4, (y * 64 + x + 1) * 4), (y * 64 + x + 1) * 4);
  const hash = await f.put(shifted);
  f.draft.calls[0].kind = 'pose'; f.record.endpoint = '/animate-with-skeleton-v3'; f.record.params = {}; f.record.inputs = [];
  f.record.jobs[0].results = [0, 1, 2].map(i => ({ label: String(i), sha: hash })); f.publish();
  const result = await evaluateItem(f.draft, f.ctx);
  expect(result.g1.size).toBe(0); expect(result.cells).toHaveLength(2);
  for (const cell of result.cells) { expect(cell.stencil).toBeUndefined(); expect(cell.offset).toEqual([-1, -0]); }
});

test('a padded single-view edit retains only the first logical artwork and provenance', async () => {
  const f = await singleStandingFixture(), extra = structuredClone(f.dressed);
  paint(extra, 12, 13, 8, 8, [200, 40, 40]);
  ledger.output = async () => [f.dressed, extra];
  const result = await runItem(f.draft, f.ctx);
  expect(ledger.requests.map(r => r.path)).toEqual(['/edit-animation-v2']);
  expect((ledger.requests[0].body as { frames: unknown[] }).frames).toHaveLength(2);
  expect(result!.g1.size).toBe(0);
  expect(result!.cells.map(c => c.key)).toEqual(['walking/south/0']);
  const accepted = await acceptItem(f.draft, f.ctx, result!);
  expect(accepted.item.dressed!.south).toBe(await cellHash(f.dressed));
  expect(accepted.item.provenance[0].produced).toEqual(['rest/south/0']);
  expect(accepted.item.layers[0].cells!.walking!.south).toHaveLength(1);
});

test('tiny natural eye colors pass the real dress runner without a smudge reroll', async () => {
  const f = await singleStandingFixture();
  f.draft.spec.slot = 'face_acc'; f.draft.spec.prompt = 'serious eyes and subtle eyebrows';
  const eyes = toChroma(f.ctx.project.images.get(f.ctx.rec.manifest.rig.rest!.south!.image)!, 'green');
  paint(eyes, 14, 6, 2, 2, [180, 90, 20]); paint(eyes, 14, 8, 2, 1, [40, 40, 40]);
  ledger.output = async () => [eyes, eyes];
  const result = await runItem(f.draft, f.ctx);
  expect(ledger.requests.map(r => r.path)).toEqual(['/edit-animation-v2']);
  expect(result!.g1.size).toBe(0);
  expect(result!.cells).toHaveLength(1);
  expect(result!.cells[0].area).toBe(6);
  const saved = await acceptItem(f.draft, f.ctx, result!);
  expect(saved.item.designWarnings).toBeUndefined();
});

test.each(['one output', 'three outputs', 'wrong-size padding'] as const)('a single-view edit with %s fails structurally and cannot be accepted', async variant => {
  const f = await singleStandingFixture();
  ledger.output = async () => variant === 'one output' ? [f.dressed] : variant === 'three outputs' ? [f.dressed, f.dressed, f.dressed] : [f.dressed, makeImg(16, 16)];
  const result = await runItem(f.draft, f.ctx);
  expect(ledger.requests.every(r => r.path === '/edit-animation-v2')).toBe(true);
  expect([...result!.g1.values()].some(reason => reason.startsWith('G1 '))).toBe(true);
  expect(result!.cells).toHaveLength(0);
  await expect(acceptItem(f.draft, f.ctx, result!)).rejects.toThrow('missing or malformed frames');
});

async function standingFixture() {
  const f = await fixture(), rig = f.ctx.rec.manifest.rig, source = rig.animations[0].sources!.south!, points = rig.rest!.south!.keypoints, bodyHash = rig.rest!.south!.image;
  rig.directions = DIRECTIONS.map(id => ({ id }));
  rig.rest = Object.fromEntries(DIRECTIONS.map(dir => [dir, { image: bodyHash, keypoints: points }]));
  rig.animations[0].sources = Object.fromEntries(DIRECTIONS.map(dir => [dir, structuredClone(source)]));
  f.ctx.rec.manifest.items[0].layers[0].cells!.walking = Object.fromEntries(DIRECTIONS.map(dir => [dir, [bodyHash, bodyHash, bodyHash]]));
  f.ctx.rec.skeletons = Object.fromEntries(DIRECTIONS.flatMap(dir => [0, 1, 2].map(i => [`walking/${dir}/${i}`, fromApi(points, rig.cell)])));
  const good = structuredClone(f.dressed); paint(good, 12, 18, 8, 1, [220, 220, 220]);
  const absent = new Set(['north-east', 'north', 'north-west']), refs = DIRECTIONS.map(dir => absent.has(dir) ? f.dressed : good);
  ledger.project = structuredClone(f.ctx.rec);
  const draft = newDraft(f.ctx, { name: 'Waist outfit', slot: 'torso_inner', prompt: 'a black robe and white boots with a white sash around the waist', key: 'green', anims: ['walking'], dirs: [...DIRECTIONS] });
  return { ...f, draft, good, refs };
}


async function facingFixture(opposite = true, occluded = false) {
  const f = await fixture(), rig = f.ctx.rec.manifest.rig, front = structuredClone(f.dressed);
  paint(front, 14, 13, 4, 3, [220, 220, 210]);
  if (opposite) {
    rig.directions.push({ id: 'north' }); rig.rest!.north = structuredClone(rig.rest!.south!);
    rig.animations[0].sources!.north = structuredClone(rig.animations[0].sources!.south!);
    f.ctx.rec.manifest.items[0].layers[0].cells!.walking!.north = [...f.ctx.rec.manifest.items[0].layers[0].cells!.walking!.south!];
  }
  if (occluded) {
    const hidden = rig.rest!.south!.keypoints.map(p => p.label === 'LEFT ELBOW' ? { ...p, x: 16 / 32, y: 13 / 32 } : p.label === 'LEFT ARM' ? { ...p, x: 16 / 32, y: 15 / 32 } : p);
    rig.animations[0].sources!.south!.keypoints = Array(3).fill(hidden); rig.animations[0].sources!.south!.measured = Array(3).fill(hidden);
  }
  ledger.project = structuredClone(f.ctx.rec);
  return { ...f, front };
}


test('footwear observations retain the first result and cost with no automatic reroll, key change or grid', async () => {
  const f = await fixture(), baseBefore = structuredClone(f.ctx.rec.manifest.items[0]);
  ledger.output = async req => req.path === '/edit-animation-v2' ? [f.dressed, f.dressed] : Array(3).fill(f.missing);
  const draft = newDraft(f.ctx, { name: 'Review outfit', slot: 'torso_inner', prompt: f.item.prompt!, key: 'green', anims: ['walking'], dirs: ['south'] });
  const result = await runItem(draft, f.ctx);
  expect(ledger.requests.map(r => r.path)).toEqual(['/edit-animation-v2', '/animate-with-skeleton-v3']);
  expect(result!.qa!.failCalls.size).toBe(0);
  expect(result!.qa!.qa).toMatchObject({ status: 'warn', footwearReviewFrames: 3 });
  expect(result!.qa!.warnings.some(w => w.startsWith('G12 '))).toBe(true);
  expect(isClean(result!)).toBe(false);
  expect(draft.spec.key).toBe('green'); expect(draft.calls.every(c => !c.old.length && !c.rerolls)).toBe(true);
  expect(gensOf(draft)).toBe(12);
  const chosen = draft.calls[1].recId!, accepted = await acceptItem(draft, f.ctx, result!);
  expect(accepted.item.provenance.at(-1)!.jobId).toBe(`${chosen}-job`);
  expect(accepted.item.qa!.footwearReviewFrames).toBe(3);
  expect(ledger.project!.manifest.items[0]).toEqual(baseBefore);
  const count = ledger.enqueues; await runItem(JSON.parse(JSON.stringify(draft)), f.ctx); expect(ledger.enqueues).toBe(count);
});

test('an explicit pose reroll authorizes one additional batch and does not launch child retries', async () => {
  const f = await fixture();
  ledger.output = async req => req.path === '/edit-animation-v2' ? [f.dressed, f.dressed] : Array(3).fill(f.missing);
  const draft = newDraft(f.ctx, { name: 'Manual retry', slot: 'torso_inner', prompt: f.item.prompt!, key: 'green', anims: ['walking'], dirs: ['south'] });
  await runItem(draft, f.ctx); const original = draft.calls[1].recId, design = draft.calls[0].recId;
  rerollCall(draft, 1, 'player requested one paid attempt');
  const result = await runItem(draft, f.ctx);
  expect(ledger.requests.map(r => r.path)).toEqual(['/edit-animation-v2', '/animate-with-skeleton-v3', '/animate-with-skeleton-v3']);
  expect(draft.calls[0].recId).toBe(design);
  expect(draft.calls[1].old).toEqual([original]); expect(draft.calls[1].rerolls).toBe(1);
  expect(draft.calls[1].recId).not.toBe(original);
  expect(result!.qa!.qa.footwearReviewFrames).toBe(3); expect(isClean(result!)).toBe(false);
  expect(gensOf(draft)).toBe(14); expect(draft.spec.key).toBe('green');
  const count = ledger.enqueues; await runItem(JSON.parse(JSON.stringify(draft)), f.ctx); expect(ledger.enqueues).toBe(count);
});

test('body-preservation failures retain the first checked artwork without paying for an alternate', async () => {
  const f = await fixture(), damaged = structuredClone(f.dressed);
  for (let y = 4; y < 11; y++) for (let x = 13; x < 19; x++) damaged.data.fill(0, (y * 32 + x) * 4, (y * 32 + x) * 4 + 4);
  ledger.output = async req => req.path === '/edit-animation-v2' ? [f.dressed, f.dressed] : Array(3).fill(damaged);
  const draft = newDraft(f.ctx, { name: 'Damaged art', slot: 'torso_inner', prompt: f.item.prompt!, key: 'green', anims: ['walking'], dirs: ['south'] });
  const result = await runItem(draft, f.ctx);
  expect(ledger.requests.map(r => r.path)).toEqual(['/edit-animation-v2', '/animate-with-skeleton-v3']);
  expect([...result!.qa!.failCalls.values()].flat().some(w => w.startsWith('G2 '))).toBe(true);
  expect(result!.qa!.qa.status).toBe('fail'); expect(isClean(result!)).toBe(false);
  expect(gensOf(draft)).toBe(12); expect(draft.calls[1].old).toEqual([]);
});

test('lower garment loss is a hard observation rather than authorization for another paid call', async () => {
  const f = await fixture(), missing = structuredClone(f.dressed), body = toChroma(f.ctx.project.images.get(f.ctx.rec.manifest.rig.rest!.south!.image)!, 'green');
  for (let y = 23; y < 32; y++) for (let x = 0; x < 32; x++) missing.data.set(body.data.subarray((y * 32 + x) * 4, (y * 32 + x) * 4 + 4), (y * 32 + x) * 4);
  ledger.output = async req => req.path === '/edit-animation-v2' ? [f.dressed, f.dressed] : Array(3).fill(missing);
  const draft = newDraft(f.ctx, { name: 'Missing pants', slot: 'torso_inner', prompt: f.item.prompt!, key: 'green', anims: ['walking'], dirs: ['south'] });
  const result = await runItem(draft, f.ctx);
  expect(result!.qa!.qa.missingLowerFrames).toBe(3);
  expect([...result!.qa!.failCalls.values()].flat().some(w => w.startsWith('G11 '))).toBe(true);
  expect(ledger.requests.map(r => r.path)).toEqual(['/edit-animation-v2', '/animate-with-skeleton-v3']);
  expect(draft.calls.every(c => !c.rerolls && !c.old.length)).toBe(true);
});

test('a D1 standing palette defect is retained for review without a dress retry', async () => {
  const f = await singleStandingFixture(), smudged = structuredClone(f.dressed);
  const clothing = f.ctx.project.images.get(f.item.layers[0].cells!.default!.south![0]!)!;
  for (let p = 0; p < clothing.w * clothing.h; p++) if (clothing.data[p * 4 + 3]) smudged.data.set([190, 30, 45, 255], p * 4);
  paint(smudged, 12, 13, 6, 2, [90, 90, 90]);
  f.draft.spec.prompt = 'a scarlet tunic';
  ledger.output = async () => [smudged, smudged];
  const result = await runItem(f.draft, f.ctx);
  expect([...result!.g1.values()].some(w => w.startsWith('D1 '))).toBe(true);
  expect(isClean(result!)).toBe(false); expect(ledger.requests.map(r => r.path)).toEqual(['/edit-animation-v2']);
  expect(gensOf(f.draft)).toBe(10); expect(f.draft.calls[0].old).toEqual([]);
});

test('a G6 soft palette failure cannot spend another pose or fallback call', async () => {
  const f = await facingFixture(), drifted = structuredClone(f.dressed);
  paint(drifted, 12, 13, 8, 8, [190, 30, 45]);
  ledger.output = async req => req.path === '/edit-animation-v2' ? [f.dressed, f.dressed] : Array(3).fill((req.body as { direction: string }).direction === 'north' ? drifted : f.dressed);
  const draft = newDraft(f.ctx, { name: 'Palette drift', slot: 'torso_inner', prompt: f.item.prompt!, key: 'green', anims: ['walking'], dirs: ['south', 'north'] });
  const result = await runItem(draft, f.ctx);
  expect(result!.qa!.softCalls.has(2)).toBe(true);
  expect(result!.qa!.warnings.some(w => w.startsWith('G6 '))).toBe(true);
  expect(isClean(result!)).toBe(false);
  expect(ledger.requests.map(r => r.path)).toEqual(['/edit-animation-v2', '/animate-with-skeleton-v3', '/animate-with-skeleton-v3']);
  expect(draft.calls.every(c => !c.rerolls && !c.old.length)).toBe(true);
});

test('a standing chroma collision is flagged while the approved initial coverage keeps the same key', async () => {
  const f = await fixture(), collision = structuredClone(f.dressed), key = toChroma(f.ctx.project.images.get(f.ctx.rec.manifest.rig.rest!.south!.image)!, 'green');
  for (let y = 4; y < 25; y++) for (let x = 0; x < 4; x++) collision.data.set(key.data.subarray((10 * 32 + 16) * 4, (10 * 32 + 16) * 4 + 4), (y * 32 + x) * 4);
  ledger.output = async req => req.path === '/edit-animation-v2' ? [collision, collision] : Array(3).fill(f.dressed);
  const draft = newDraft(f.ctx, { name: 'Collision', slot: 'torso_inner', prompt: f.item.prompt!, key: 'green', anims: ['walking'], dirs: ['south'] });
  const result = await runItem(draft, f.ctx);
  expect([...result!.g1.values()].some(w => w.includes('G3 keyframe'))).toBe(true);
  expect(ledger.requests.map(r => r.path)).toEqual(['/edit-animation-v2', '/animate-with-skeleton-v3']);
  expect(draft.spec.key).toBe('green'); expect(draft.calls.every(c => !c.old.length && !c.rerolls)).toBe(true);
  expect(result!.cells).toHaveLength(3); expect(isClean(result!)).toBe(false);
});

test.each(['missing frames', 'empty response', 'wrong canvas'] as const)('malformed pose %s stops once and cannot be accepted or retried on reload', async variant => {
  const f = await fixture();
  ledger.output = async req => req.path === '/edit-animation-v2' ? [f.dressed, f.dressed] : variant === 'empty response' ? [] : variant === 'missing frames' ? [f.dressed, f.dressed] : Array(3).fill(makeImg(16, 16));
  const draft = newDraft(f.ctx, { name: 'Malformed pose', slot: 'torso_inner', prompt: f.item.prompt!, key: 'green', anims: ['walking'], dirs: ['south'] });
  const result = await runItem(draft, f.ctx);
  expect(ledger.requests.map(r => r.path)).toEqual(['/edit-animation-v2', '/animate-with-skeleton-v3']);
  expect([...result!.g1.values()].some(w => w.startsWith('G1 '))).toBe(true);
  await expect(acceptItem(draft, f.ctx, result!)).rejects.toThrow('missing or malformed frames');
  const count = ledger.enqueues; await runItem(JSON.parse(JSON.stringify(draft)), f.ctx); expect(ledger.enqueues).toBe(count);
});

test('missing durable draft records fail closed without any new submission', async () => {
  const f = await fixture(), draft = newDraft(f.ctx, { name: 'Missing history', slot: 'torso_inner', prompt: f.item.prompt!, key: 'green', anims: ['walking'], dirs: ['south'] });
  draft.calls[0].recId = 'missing-paid-record';
  const result = await runItem(draft, f.ctx);
  expect(ledger.enqueues).toBe(0); expect(ledger.requests).toHaveLength(0);
  expect(result).toBeNull(); expect(draft.log.join(' ')).toMatch(/record|history|unavailable|missing/i);
});

test('an unknown paid result never grants a fresh request or seed', async () => {
  const f = await fixture(), draft = newDraft(f.ctx, { name: 'Unknown outcome', slot: 'torso_inner', prompt: f.item.prompt!, key: 'green', anims: ['walking'], dirs: ['south'] });
  draft.calls[0].recId = 'unknown-paid-record';
  ledger.records.set('unknown-paid-record', { id: 'unknown-paid-record', state: 'lost', jobs: [], error: 'outcome unknown' } as unknown as JobRec);
  for (const cb of ledger.listeners) cb({ jobs: [...ledger.records.values()] });
  const seed = draft.calls[0].seed;
  await runItem(draft, f.ctx); await runItem(JSON.parse(JSON.stringify(draft)), f.ctx);
  expect(ledger.enqueues).toBe(0); expect(draft.calls[0].seed).toBe(seed); expect(draft.calls[0].old).toEqual([]);
});

test('standing waist differences remain reviewable without a hidden standing repair or changed references', async () => {
  const f = await standingFixture(), base = structuredClone(f.ctx.rec.manifest.items[0]);
  ledger.output = async req => {
    if (req.path === '/edit-animation-v2') return f.refs;
    expect(req.path).toBe('/animate-with-skeleton-v3');
    const b = req.body as { first_frame: { base64: string }; direction: string };
    const first = await decodePngBytes(Buffer.from(b.first_frame.base64, 'base64'));
    expect(first.data).toEqual(f.refs[DIRECTIONS.indexOf(b.direction as typeof DIRECTIONS[number])].data);
    return Array(3).fill(first);
  };
  const result = await runItem(f.draft, f.ctx);
  expect(ledger.requests.map(r => r.path)).toEqual(['/edit-animation-v2', ...Array(8).fill('/animate-with-skeleton-v3')]);
  expect([...result!.g1.values()].join(';')).toContain('D2');
  expect(result!.cells).toHaveLength(24); expect(isClean(result!)).toBe(false);
  expect(gensOf(f.draft)).toBe(26); expect(new Set(draftQueueIds(f.draft)).size).toBe(9);
  const accepted = await acceptItem(f.draft, f.ctx, result!);
  expect(accepted.item.designWarnings!.some(w => w.startsWith('D2 '))).toBe(true);
  for (const [i, dir] of DIRECTIONS.entries()) {
    const bytes = ledger.blobs.get(accepted.item.dressed![dir]!.slice(7))!;
    expect((await decodePngBytes(new Uint8Array(await bytes.arrayBuffer()))).data).toEqual(f.refs[i].data);
  }
  expect(ledger.project!.manifest.items[0]).toEqual(base);
  const count = ledger.enqueues; await runItem(JSON.parse(JSON.stringify(f.draft)), f.ctx); expect(ledger.enqueues).toBe(count);
});

test('a visible walking waistband omission stays flagged and incurs only its planned call', async () => {
  const f = await fixture(), good = structuredClone(f.dressed); paint(good, 12, 18, 8, 1, [220, 220, 220]);
  ledger.output = async req => req.path === '/edit-animation-v2' ? [good, good] : Array(3).fill(f.dressed);
  const draft = newDraft(f.ctx, { name: 'Belted outfit', slot: 'torso_inner', prompt: 'a black robe and white boots with a white waistband', key: 'green', anims: ['walking'], dirs: ['south'] });
  const result = await runItem(draft, f.ctx);
  expect(ledger.requests.map(r => r.path)).toEqual(['/edit-animation-v2', '/animate-with-skeleton-v3']);
  expect(result!.qa!.qa).toMatchObject({ status: 'warn', waistReviewFrames: 3 });
  expect(result!.qa!.qa.clips!['walking/south'].waistReviewFrames).toBe(3);
  expect(result!.qa!.warnings.some(w => w.startsWith('G13 '))).toBe(true);
  const count = ledger.enqueues; await runItem(JSON.parse(JSON.stringify(draft)), f.ctx); expect(ledger.enqueues).toBe(count);
});

test.each(['occluded', 'no intent', 'no positive reference'] as const)('%s waistband evidence neither diagnoses an omission nor spends extra', async mode => {
  const f = await fixture(), good = structuredClone(f.dressed); paint(good, 12, 18, 8, 1, [220, 220, 220]);
  if (mode === 'occluded') {
    const source = f.ctx.rec.manifest.rig.animations[0].sources!.south!;
    const hidden = f.ctx.rec.manifest.rig.rest!.south!.keypoints.map(p => p.label === 'LEFT ELBOW' ? { ...p, x: 16 / 32, y: 16 / 32 } : p.label === 'LEFT ARM' ? { ...p, x: 16 / 32, y: 20 / 32 } : p);
    source.keypoints = Array(3).fill(hidden); source.measured = Array(3).fill(hidden);
  }
  ledger.output = async req => req.path === '/edit-animation-v2' ? Array(2).fill(mode === 'no positive reference' ? f.dressed : good) : Array(3).fill(f.dressed);
  const draft = newDraft(f.ctx, { name: 'Outfit', slot: 'torso_inner', prompt: mode === 'no intent' ? f.item.prompt! : 'a black robe and white boots with a white waistband', key: 'green', anims: ['walking'], dirs: ['south'] });
  const result = await runItem(draft, f.ctx);
  expect(result!.qa!.warnings.some(w => w.startsWith('G13 '))).toBe(false);
  expect(ledger.requests.map(r => r.path)).toEqual(['/edit-animation-v2', '/animate-with-skeleton-v3']);
});

test('strong opposite-torso evidence stays visible without a paid alternate or automatic acceptance', async () => {
  const f = await facingFixture();
  ledger.output = async req => req.path === '/edit-animation-v2' ? [f.front, f.dressed] : Array(3).fill(f.dressed);
  const draft = newDraft(f.ctx, { name: 'Facing trial', slot: 'torso_inner', prompt: f.item.prompt!, key: 'green', anims: ['walking'], dirs: ['south', 'north'] });
  const result = await runItem(draft, f.ctx);
  expect(ledger.requests.map(r => r.path)).toEqual(['/edit-animation-v2', '/animate-with-skeleton-v3', '/animate-with-skeleton-v3']);
  expect(result!.qa!.qa).toMatchObject({ status: 'warn', facingReviewFrames: 3 });
  expect(result!.qa!.warnings.some(w => w.startsWith('G14 '))).toBe(true); expect(isClean(result!)).toBe(false);
  const count = ledger.enqueues; await runItem(JSON.parse(JSON.stringify(draft)), f.ctx); expect(ledger.enqueues).toBe(count);
});

test.each(['symmetric references', 'opposite absent', 'occluded'] as const)('%s cannot diagnose the opposite torso or trigger extra submissions', async mode => {
  const f = await facingFixture(mode !== 'opposite absent', mode === 'occluded');
  const refs = mode === 'opposite absent' || mode === 'symmetric references' ? [f.front, f.front] : [f.front, f.dressed];
  ledger.output = async req => req.path === '/edit-animation-v2' ? refs : Array(3).fill((req.body as { direction: string }).direction === 'north' && mode === 'symmetric references' ? f.front : f.dressed);
  const draft = newDraft(f.ctx, { name: 'Uncertain facing', slot: 'torso_inner', prompt: f.item.prompt!, key: 'green', anims: ['walking'], dirs: mode === 'opposite absent' ? ['south'] : ['south', 'north'] });
  const result = await runItem(draft, f.ctx);
  expect(result!.qa!.warnings.some(w => w.startsWith('G14 '))).toBe(false);
  expect(ledger.requests.filter(r => r.path === '/animate-with-skeleton-v3')).toHaveLength(mode === 'opposite absent' ? 1 : 2);
  expect(ledger.requests.filter(r => r.path === '/inpaint-v3')).toHaveLength(0);
});

test('posing accepted equipment submits one batch, preserves its warnings and source provenance', async () => {
  const f = await fixture(), base = structuredClone(f.ctx.rec.manifest.items[0]);
  ledger.output = async () => Array(3).fill(f.missing);
  const qa = await poseItemClip(f.ctx, f.item, 'walking');
  expect(ledger.requests.map(r => r.path)).toEqual(['/animate-with-skeleton-v3']);
  expect(qa.qa).toMatchObject({ status: 'warn', footwearReviewFrames: 3 });
  const saved = ledger.project!.manifest.items.find(i => i.id === f.item.id)!;
  expect(saved.provenance.at(-1)!.jobId).toBe([...ledger.records.values()][0].jobs[0].id);
  expect(saved.qa!.footwearReviewFrames).toBe(3); expect(ledger.project!.manifest.items[0]).toEqual(base);
  const count = ledger.requests.length;
  await poseItemClip({ rec: ledger.project!, project: { ...f.ctx.project, manifest: ledger.project!.manifest } }, saved, 'walking');
  expect(ledger.requests).toHaveLength(count);
});

test('a long accepted-item move makes one request for each planned batch and keeps each source identity', async () => {
  const f = await fixture(), rig = f.ctx.rec.manifest.rig, animation = rig.animations[0], points = rig.rest!.south!.keypoints;
  animation.cells = 18; animation.frames = Array.from({ length: 18 }, (_, cell) => ({ cell, ms: 100 }));
  animation.sources!.south!.keypoints = Array(18).fill(points); animation.sources!.south!.measured = Array(18).fill(points);
  const bodyHash = rig.rest!.south!.image;
  f.ctx.rec.manifest.items[0].layers[0].cells!.walking!.south = Array(18).fill(bodyHash);
  f.ctx.rec.skeletons = Object.fromEntries(Array.from({ length: 18 }, (_, i) => [`walking/south/${i}`, fromApi(points, rig.cell)]));
  ledger.project = structuredClone(f.ctx.rec);
  ledger.output = async req => Array((req.body as { keypoints: unknown[] }).keypoints.length).fill(f.missing);
  const qa = await poseItemClip(f.ctx, f.item, 'walking');
  expect(ledger.requests.map(r => r.path)).toEqual(['/animate-with-skeleton-v3', '/animate-with-skeleton-v3']);
  expect(ledger.requests.map(r => (r.body as { keypoints: unknown[] }).keypoints.length)).toEqual([9, 9]);
  expect(qa.qa.footwearReviewFrames).toBe(18); expect(qa.qa.rerolls).toBe(0);
  const saved = ledger.project!.manifest.items.find(i => i.id === f.item.id)!;
  expect(saved.provenance.map(p => p.produced.length)).toEqual([9, 9]);
  for (let i = 0; i < 18; i++) {
    const source = saved.qa!.cells[`walking/south/${i}`].provenance;
    expect(saved.provenance[source!].jobId).toBe([...ledger.records.values()][i < 9 ? 0 : 1].jobs[0].id);
  }
});

test.each(['empty', 'count', 'canvas'] as const)('malformed accepted-item %s output fails after one request and keeps existing artwork', async variant => {
  const f = await fixture(), before = structuredClone(ledger.project);
  ledger.output = async () => variant === 'empty' ? [] : variant === 'count' ? [f.dressed] : Array(3).fill(makeImg(16, 16));
  await expect(poseItemClip(f.ctx, f.item, 'walking')).rejects.toThrow(/missing|malformed|invalid|frame/i);
  expect(ledger.requests.map(r => r.path)).toEqual(['/animate-with-skeleton-v3']);
  expect(ledger.project).toEqual(before);
});

test('suspicious imported targets use one priced frozen-grid request without a quality retry', async () => {
  const f = await fixture(true);
  ledger.output = async () => [f.grid(f.missing)];
  const qa = await poseItemClip(f.ctx, f.item, 'walking');
  expect(ledger.requests.map(r => r.path)).toEqual(['/inpaint-v3']);
  expect(qa.qa.footwearReviewFrames).toBe(3);
  const before = ledger.requests.length;
  await expect(poseItemClip(f.ctx, { ...f.item, slot: 'main_hand' }, 'walking')).rejects.toThrow('suspicious estimated joints');
  expect(ledger.requests).toHaveLength(before);
});

test('an initial frozen-grid item retains its first flagged grid and never submits a refinement on reload', async () => {
  const f = await fixture(true);
  ledger.output = async req => req.path === '/edit-animation-v2' ? [f.dressed, f.dressed] : [f.grid(f.missing)];
  const draft = newDraft(f.ctx, { name: 'Frozen art', slot: 'torso_inner', prompt: f.item.prompt!, key: 'green', anims: ['walking'], dirs: ['south'] });
  const result = await runItem(draft, f.ctx);
  expect(ledger.requests.map(r => r.path)).toEqual(['/edit-animation-v2', '/inpaint-v3']);
  expect(result!.qa!.qa.footwearReviewFrames).toBe(3); expect(draft.calls[1].old).toEqual([]);
  const count = ledger.enqueues; await runItem(JSON.parse(JSON.stringify(draft)), f.ctx); expect(ledger.enqueues).toBe(count);
});
