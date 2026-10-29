import { beforeEach, expect, test, vi } from 'vitest';
import type { JobRec } from '../../src/lib/pixellab/queue.ts';
import type { Req } from '../../src/lib/pixellab/routes.ts';
import type { Item, Manifest } from '../../src/lib/store/manifest.ts';
import type { StoredProject } from '../../src/lib/store/project.ts';
import { makeImg, type Img } from '../../src/lib/image/png.ts';
import { decodePngBytes, encodePngBytes } from '../../src/lib/image/pngraw.ts';
import { cellHash, DIRECTIONS, type Keypoint } from '../../src/lib/rig/rig.ts';
import { fromApi, LABELS } from '../../src/lib/rig/poses.ts';
import { toChroma } from '../../src/lib/image/chroma.ts';
import { over } from '../../src/lib/compose/compose.ts';
import { itemRoute, packGrid } from '../../src/lib/items/items.ts';
import { acceptItem, gensOf, newDraft, poseItemClip, runItem, type RigCtx } from '../../src/lib/items/run.ts';
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
    const rec = { id, label: meta.label, method: 'POST', endpoint: req.path, params: req.body, inputs: [], requestHash: id, state: 'done', attempts: 1, nextAt: 0, createdAt: 1, gens: req.path === '/animate-with-skeleton-v3' ? 2 : 10, usd: 0, jobs: [{ id: `${id}-job`, done: true, status: 'completed', results }] } as JobRec;
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

test('new items automatically retry footwear loss then use one grid and resume without resubmission', async () => {
  const f = await fixture();
  ledger.output = async req => req.path === '/edit-animation-v2' ? [f.dressed, f.dressed] : req.path === '/animate-with-skeleton-v3' ? Array(3).fill(f.missing) : [f.grid(f.dressed)];
  const draft = newDraft(f.ctx, { name: 'Auto outfit', slot: 'torso_inner', prompt: f.item.prompt!, key: 'green', anims: ['walking'], dirs: ['south'] });
  const result = await runItem(draft, f.ctx);
  expect(ledger.requests.map(r => r.path)).toEqual(['/edit-animation-v2', ...Array(3).fill('/animate-with-skeleton-v3'), '/inpaint-v3']);
  expect(result!.qa!.failCalls.size).toBe(0); expect(result!.qa!.warnings.some(w => w.startsWith('G12 '))).toBe(false);
  expect(draft.calls[1].kind).toBe('grid'); expect(draft.calls[1].old).toHaveLength(3);
  const requests = ledger.requests.length;
  await runItem(JSON.parse(JSON.stringify(draft)), f.ctx);
  expect(ledger.requests).toHaveLength(requests);
});

test('exhausted footwear attempts retain the best pose and cannot restart another grid loop on reload', async () => {
  const f = await fixture();
  ledger.output = async req => req.path === '/edit-animation-v2' ? [f.dressed, f.dressed] : req.path === '/animate-with-skeleton-v3' ? Array(3).fill(f.missing) : [f.grid(f.missing)];
  const draft = newDraft(f.ctx, { name: 'Auto outfit', slot: 'torso_inner', prompt: f.item.prompt!, key: 'green', anims: ['walking'], dirs: ['south'] });
  const result = await runItem(draft, f.ctx);
  expect(ledger.requests.filter(r => r.path === '/inpaint-v3')).toHaveLength(2);
  expect(draft.calls[1].kind).toBe('pose'); expect(draft.calls[1].fallback).toBeDefined();
  expect(result!.qa!.qa.footwearReviewFrames).toBe(3);
  const count = ledger.requests.length; await runItem(JSON.parse(JSON.stringify(draft)), f.ctx); expect(ledger.requests).toHaveLength(count);
});

test('one persisted grid refinement repairs the remaining observable footwear loss', async () => {
  const f = await fixture(); let grids = 0;
  ledger.output = async req => req.path === '/edit-animation-v2' ? [f.dressed, f.dressed] : req.path === '/animate-with-skeleton-v3' ? Array(3).fill(f.missing) : [f.grid(++grids === 1 ? f.missing : f.dressed)];
  const draft = newDraft(f.ctx, { name: 'Refined outfit', slot: 'torso_inner', prompt: f.item.prompt!, key: 'green', anims: ['walking'], dirs: ['south'] });
  const result = await runItem(draft, f.ctx);
  expect(ledger.requests.map(r => r.path)).toEqual(['/edit-animation-v2', ...Array(3).fill('/animate-with-skeleton-v3'), '/inpaint-v3', '/inpaint-v3']);
  expect(result!.qa!.warnings.some(w => /^G1[23] /.test(w))).toBe(false);
  expect(result!.qa!.failCalls.size).toBe(0);
  expect(draft.calls[1]).toMatchObject({ kind: 'grid', gridRefined: true });
  const chosen = ledger.records.get(draft.calls[1].recId!)!;
  expect(chosen.endpoint).toBe('/inpaint-v3');
  expect(chosen.id).toBe([...ledger.records.values()].at(-1)!.id);
  const count = ledger.requests.length; await runItem(JSON.parse(JSON.stringify(draft)), f.ctx); expect(ledger.requests).toHaveLength(count);
});

test('a worse grid refinement preserves the earlier grid and its source record', async () => {
  const f = await fixture(), damaged = structuredClone(f.dressed); let grids = 0;
  for (let y = 4; y < 11; y++) for (let x = 13; x < 19; x++) damaged.data.fill(0, (y * 32 + x) * 4, (y * 32 + x) * 4 + 4);
  ledger.output = async req => req.path === '/edit-animation-v2' ? [f.dressed, f.dressed] : req.path === '/animate-with-skeleton-v3' ? Array(3).fill(f.missing) : [++grids === 1 ? packGrid([f.dressed, f.missing, f.missing, f.dressed], Array(4).fill(null)).image : f.grid(damaged)];
  const draft = newDraft(f.ctx, { name: 'Refined outfit', slot: 'torso_inner', prompt: f.item.prompt!, key: 'green', anims: ['walking'], dirs: ['south'] });
  const result = await runItem(draft, f.ctx);
  const gridRecords = [...ledger.records.values()].filter(r => r.endpoint === '/inpaint-v3');
  expect(gridRecords).toHaveLength(2);
  expect(draft.calls[1]).toMatchObject({ kind: 'grid', gridRefined: true, recId: gridRecords[0].id });
  expect(draft.calls[1].old).toContain(gridRecords[1].id);
  expect(result!.qa!.failCalls.size).toBe(0); expect(result!.qa!.qa.footwearReviewFrames).toBe(2);
  const accepted = await acceptItem(draft, f.ctx, result!);
  expect(accepted.item.provenance.at(-1)!.jobId).toBe(`${gridRecords[0].id}-job`);
  const count = ledger.requests.length; await runItem(JSON.parse(JSON.stringify(draft)), f.ctx); expect(ledger.requests).toHaveLength(count);
});

test('hard failures in the first grid cannot trigger another refinement spend', async () => {
  const f = await fixture(), damaged = structuredClone(f.missing);
  for (let y = 4; y < 11; y++) for (let x = 13; x < 19; x++) damaged.data.fill(0, (y * 32 + x) * 4, (y * 32 + x) * 4 + 4);
  ledger.output = async req => req.path === '/edit-animation-v2' ? [f.dressed, f.dressed] : req.path === '/animate-with-skeleton-v3' ? Array(3).fill(f.missing) : [f.grid(damaged)];
  const draft = newDraft(f.ctx, { name: 'No unsafe refinement', slot: 'torso_inner', prompt: f.item.prompt!, key: 'green', anims: ['walking'], dirs: ['south'] });
  const result = await runItem(draft, f.ctx);
  expect(ledger.requests.filter(r => r.path === '/inpaint-v3')).toHaveLength(1);
  expect(draft.calls[1].kind).toBe('pose');
  expect(result!.qa!.failCalls.size).toBe(0);
});

test('a grid that fixes shoes but damages the frozen body cannot replace a safer pose', async () => {
  const f = await fixture(), damaged = structuredClone(f.dressed);
  for (let y = 4; y < 11; y++) for (let x = 13; x < 19; x++) damaged.data.fill(0, (y * 32 + x) * 4, (y * 32 + x) * 4 + 4);
  ledger.output = async req => req.path === '/edit-animation-v2' ? [f.dressed, f.dressed] : req.path === '/animate-with-skeleton-v3' ? Array(3).fill(f.missing) : [f.grid(damaged)];
  const draft = newDraft(f.ctx, { name: 'Auto outfit', slot: 'torso_inner', prompt: f.item.prompt!, key: 'green', anims: ['walking'], dirs: ['south'] });
  const result = await runItem(draft, f.ctx);
  expect(draft.calls[1].kind).toBe('pose');
  expect(ledger.records.get(draft.calls[1].recId!)!.endpoint).toBe('/animate-with-skeleton-v3');
  expect(result!.qa!.failCalls.size).toBe(0); expect(result!.qa!.qa.footwearReviewFrames).toBe(3);
});

test('accepted equipment uses bounded footwear recovery and keeps winning grid provenance', async () => {
  const f = await fixture();
  ledger.output = async req => req.path === '/animate-with-skeleton-v3' ? Array(3).fill(f.missing) : [f.grid(f.dressed)];
  const qa = await poseItemClip(f.ctx, f.item, 'walking');
  expect(ledger.requests.map(r => r.path)).toEqual(['/animate-with-skeleton-v3', '/animate-with-skeleton-v3', '/inpaint-v3']);
  expect(qa.failCalls.size).toBe(0); expect(qa.qa.footwearReviewFrames).toBeUndefined();
  const saved = ledger.project!.manifest.items.find(i => i.id === f.item.id)!;
  expect(saved.provenance.at(-1)!.endpoint).toBe('/inpaint-v3');
  expect(Object.values(saved.qa!.cells).every(c => c.provenance === saved.provenance.length - 1)).toBe(true);
  const count = ledger.requests.length;
  const ctx = { rec: ledger.project!, project: { ...f.ctx.project, manifest: ledger.project!.manifest } };
  await poseItemClip(ctx, saved, 'walking'); expect(ledger.requests).toHaveLength(count);
});

test.each(['clean', 'worse'] as const)('accepted equipment checks one grid refinement and retains the %s candidate provenance', async variant => {
  const f = await fixture(), damaged = structuredClone(f.dressed); let grids = 0;
  for (let y = 4; y < 11; y++) for (let x = 13; x < 19; x++) damaged.data.fill(0, (y * 32 + x) * 4, (y * 32 + x) * 4 + 4);
  ledger.output = async req => req.path === '/animate-with-skeleton-v3' ? Array(3).fill(f.missing) : [++grids === 1 ? packGrid([f.dressed, f.missing, f.missing, f.dressed], Array(4).fill(null)).image : f.grid(variant === 'clean' ? f.dressed : damaged)];
  const qa = await poseItemClip(f.ctx, f.item, 'walking');
  expect(ledger.requests.map(r => r.path)).toEqual(['/animate-with-skeleton-v3', '/animate-with-skeleton-v3', '/inpaint-v3', '/inpaint-v3']);
  const gridRecords = [...ledger.records.values()].filter(r => r.endpoint === '/inpaint-v3'), saved = ledger.project!.manifest.items.find(i => i.id === f.item.id)!;
  const chosen = gridRecords[variant === 'clean' ? 1 : 0];
  expect(saved.provenance.at(-1)!.jobId).toBe(`${chosen.id}-job`);
  expect(qa.failCalls.size).toBe(0);
  expect(qa.qa.footwearReviewFrames).toBe(variant === 'clean' ? undefined : 2);
  const count = ledger.requests.length, ctx = { rec: ledger.project!, project: { ...f.ctx.project, manifest: ledger.project!.manifest } };
  await poseItemClip(ctx, saved, 'walking'); expect(ledger.requests).toHaveLength(count);
});

test('suspicious imported targets dress frozen frames directly without sending malformed joints', async () => {
  const f = await fixture(true);
  ledger.output = async () => [f.grid(f.dressed)];
  const qa = await poseItemClip(f.ctx, f.item, 'walking');
  expect(ledger.requests.map(r => r.path)).toEqual(['/inpaint-v3']);
  expect(qa.failCalls.size).toBe(0);
  const before = ledger.requests.length;
  await expect(poseItemClip(f.ctx, { ...f.item, slot: 'main_hand' }, 'walking')).rejects.toThrow('suspicious estimated joints');
  expect(ledger.requests).toHaveLength(before);
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

test('one standing correction precedes all poses, enforces its mask, persists, and accounts for winning provenance', async () => {
  const f = await standingFixture(), before = structuredClone(f.ctx.rec.manifest.items[0]), raw = structuredClone(f.good);
  // Even a provider changing an unmasked head must not change that part of a standing reference.
  paint(raw, 13, 4, 6, 7, [0, 0, 255]);
  ledger.output = async req => {
    if (req.path === '/edit-animation-v2') return f.refs;
    if (req.path === '/inpaint-v3') return [packGrid([...Array(3).fill(raw), ...Array(5).fill(f.good)], Array(8).fill(null)).image];
    const body = req.body as { first_frame: { base64: string } };
    const first = await decodePngBytes(Buffer.from(body.first_frame.base64, 'base64'));
    expect(first.data).toEqual(f.good.data); // Corrected back views feed walking; outside-mask blue never propagates.
    return Array(3).fill(first);
  };
  const result = await runItem(f.draft, f.ctx);
  expect(ledger.requests.map(r => r.path)).toEqual(['/edit-animation-v2', '/inpaint-v3', ...Array(8).fill('/animate-with-skeleton-v3')]);
  expect(f.draft.designRepair).toMatchObject({ checked: true, approved: true, missingDirections: ['north-east', 'north', 'north-west'] });
  expect(result!.g1.size).toBe(0);
  expect(gensOf(f.draft)).toBe(36);
  expect(draftQueueIds(f.draft)).toContain(f.draft.designRepair!.recId);
  expect(new Set(draftQueueIds(f.draft)).size).toBe(10);
  const count = ledger.requests.length;
  const resumed = JSON.parse(JSON.stringify(f.draft)); await runItem(resumed, f.ctx); expect(ledger.requests).toHaveLength(count);
  const accepted = await acceptItem(resumed, f.ctx, result!);
  expect(accepted.item.provenance.at(-1)).toMatchObject({ endpoint: '/inpaint-v3', jobId: `${f.draft.designRepair!.recId}-job`, produced: ['rest/north-east/0', 'rest/north/0', 'rest/north-west/0'] });
  expect(accepted.item.provenance.reduce((sum, p) => sum + (p.usage?.generations ?? 0), 0)).toBe(36);
  for (const hash of Object.values(accepted.item.dressed!)) {
    const saved = await decodePngBytes(new Uint8Array(await ledger.blobs.get(hash!.slice(7))!.arrayBuffer()));
    expect(saved.data).toEqual(f.good.data);
  }
  expect(ledger.project!.manifest.items[0]).toEqual(before);
});

test.each(['malformed', 'worse', 'unknown', 'unchanged'] as const)('a %s standing correction is rejected once and never propagates or resets on reload', async variant => {
  const f = await standingFixture(), failed = structuredClone(f.dressed), body = f.ctx.project.images.get(f.ctx.rec.manifest.rig.rest!.south!.image)!;
  if (variant === 'worse') for (let y = 16; y < 21; y++) for (let x = 11; x < 21; x++) failed.data.fill(0, (y * 32 + x) * 4, (y * 32 + x) * 4 + 4);
  if (variant === 'unknown') {
    const key = toChroma(body, 'green');
    for (let y = 16; y < 21; y++) for (let x = 11; x < 21; x++) failed.data.set(key.data.subarray((y * 32 + x) * 4, (y * 32 + x) * 4 + 4), (y * 32 + x) * 4);
  }
  ledger.output = async req => req.path === '/edit-animation-v2' ? f.refs : [variant === 'malformed' ? makeImg(8, 8) : packGrid([...Array(3).fill(failed), ...Array(5).fill(f.good)], Array(8).fill(null)).image];
  const result = await runItem(f.draft, f.ctx);
  expect(ledger.requests.map(r => r.path)).toEqual(['/edit-animation-v2', '/inpaint-v3']);
  expect(f.draft.designRepair?.checked).toBe(true); expect(f.draft.designRepair?.approved).not.toBe(true);
  expect([...result!.g1.values()].join(';')).toContain('D2');
  expect(f.draft.calls.filter(c => c.kind === 'pose').every(c => !c.recId)).toBe(true);
  const count = ledger.requests.length; await runItem(JSON.parse(JSON.stringify(f.draft)), f.ctx); expect(ledger.requests).toHaveLength(count);
});

test('a safe but partial standing improvement still stops unresolved views before animation', async () => {
  const f = await standingFixture();
  ledger.output = async req => req.path === '/edit-animation-v2' ? f.refs : [packGrid([f.good, f.dressed, f.dressed, ...Array(5).fill(f.good)], Array(8).fill(null)).image];
  const result = await runItem(f.draft, f.ctx);
  expect(f.draft.designRepair).toMatchObject({ checked: true, approved: true });
  expect([...result!.g1.values()].join(';')).toContain('D2 keyframe north:');
  expect([...result!.g1.values()].join(';')).toContain('D2 keyframe north-west:');
  expect(ledger.requests.map(r => r.path)).toEqual(['/edit-animation-v2', '/inpaint-v3']);
  const count = ledger.requests.length; await runItem(JSON.parse(JSON.stringify(f.draft)), f.ctx); expect(ledger.requests).toHaveLength(count);
});

test('a missing durable standing-correction record fails closed without an enqueue attempt', async () => {
  const f = await standingFixture();
  ledger.output = async req => {
    if (req.path === '/edit-animation-v2') return f.refs;
    if (req.path === '/inpaint-v3') return [packGrid([...Array(8).fill(f.good)], Array(8).fill(null)).image];
    return Array(3).fill(f.good);
  };
  await runItem(f.draft, f.ctx);
  expect(f.draft.designRepair?.approved).toBe(true);
  ledger.records.delete(f.draft.designRepair!.recId!);
  for (const cb of ledger.listeners) cb({ jobs: [...ledger.records.values()] });
  const count = ledger.enqueues, resumed = JSON.parse(JSON.stringify(f.draft));
  let failure = '';
  const result = await runItem(resumed, f.ctx).catch(error => { failure = String(error); return null; });
  expect(ledger.enqueues).toBe(count);
  expect(!result || result.g1.size > 0 || result.qa?.qa.status !== 'pass').toBe(true);
  expect([failure, resumed.designRepair?.reason, resumed.log.at(-1)].join(';')).toMatch(/missing|unavailable|complete image|automatic resend/i);
});

test('a visible per-frame waistband omission triggers bounded automatic recovery after standing views pass', async () => {
  const f = await fixture(), good = structuredClone(f.dressed);
  paint(good, 12, 18, 8, 1, [220, 220, 220]);
  ledger.output = async req => req.path === '/edit-animation-v2' ? [good, good] : req.path === '/animate-with-skeleton-v3' ? Array(3).fill(f.dressed) : [packGrid([good, good, good, good], Array(4).fill(null)).image];
  const draft = newDraft(f.ctx, { name: 'Belted outfit', slot: 'torso_inner', prompt: 'a black robe and white boots with a white waistband', key: 'green', anims: ['walking'], dirs: ['south'] });
  const evaluated: Awaited<ReturnType<typeof runItem>>[] = [];
  const result = await runItem(draft, f.ctx, { result: q => evaluated.push(q) });
  expect(evaluated.some(q => q?.qa?.qa.waistReviewFrames === 3 && q.qa.warnings.some(w => w.startsWith('G13 ')))).toBe(true);
  expect(ledger.requests.map(r => r.path)).toEqual(['/edit-animation-v2', ...Array(3).fill('/animate-with-skeleton-v3'), '/inpaint-v3']);
  expect(result!.qa!.qa.waistReviewFrames).toBeUndefined();
  expect(result!.qa!.qa.clips!['walking/south'].waistReviewFrames).toBeUndefined();
  expect(result!.qa!.warnings.some(w => w.startsWith('G13 '))).toBe(false);
});

test('unresolved waistband observations persist per frame after bounded attempts finish', async () => {
  const f = await fixture(), good = structuredClone(f.dressed);
  paint(good, 12, 18, 8, 1, [220, 220, 220]);
  ledger.output = async req => req.path === '/edit-animation-v2' ? [good, good] : req.path === '/animate-with-skeleton-v3' ? Array(3).fill(f.dressed) : [packGrid([f.dressed, f.dressed, f.dressed, good], Array(4).fill(null)).image];
  const draft = newDraft(f.ctx, { name: 'Belted outfit', slot: 'torso_inner', prompt: 'a black robe and white boots with a white waistband', key: 'green', anims: ['walking'], dirs: ['south'] });
  const result = await runItem(draft, f.ctx);
  expect(result!.qa!.failCalls.size).toBe(0);
  expect(result!.qa!.qa).toMatchObject({ status: 'warn', waistReviewFrames: 3 });
  expect(result!.qa!.qa.clips!['walking/south']).toMatchObject({ status: 'warn', waistReviewFrames: 3 });
  expect(ledger.requests.filter(r => r.path === '/inpaint-v3')).toHaveLength(2);
  const count = ledger.requests.length; await runItem(JSON.parse(JSON.stringify(draft)), f.ctx); expect(ledger.requests).toHaveLength(count);
});

test.each(['occluded', 'no intent', 'no positive reference'] as const)('%s waistband evidence cannot trigger paid consistency retries', async mode => {
  const f = await fixture(), good = structuredClone(f.dressed);
  paint(good, 12, 18, 8, 1, [220, 220, 220]);
  if (mode === 'occluded') {
    const rig = f.ctx.rec.manifest.rig, source = rig.animations[0].sources!.south!;
    const hidden = rig.rest!.south!.keypoints.map(p => p.label === 'LEFT ELBOW' ? { ...p, x: 16 / 32, y: 16 / 32 } : p.label === 'LEFT ARM' ? { ...p, x: 16 / 32, y: 20 / 32 } : p);
    source.keypoints = Array(3).fill(hidden); source.measured = Array(3).fill(hidden);
  }
  ledger.output = async req => req.path === '/edit-animation-v2' ? Array(2).fill(mode === 'no positive reference' ? f.dressed : good) : Array(3).fill(f.dressed);
  const draft = newDraft(f.ctx, { name: 'Outfit', slot: 'torso_inner', prompt: mode === 'no intent' ? f.item.prompt! : 'a black robe and white boots with a white waistband', key: 'green', anims: ['walking'], dirs: ['south'] });
  const result = await runItem(draft, f.ctx);
  expect(result!.qa!.warnings.some(w => w.startsWith('G13 '))).toBe(false);
  expect(result!.qa!.qa.waistReviewFrames).toBeUndefined();
  expect(ledger.requests.map(r => r.path)).toEqual(['/edit-animation-v2', '/animate-with-skeleton-v3']);
});

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

test('strong opposite-torso evidence receives bounded automatic repair and clears frame review counts', async () => {
  const f = await facingFixture();
  ledger.output = async req => req.path === '/edit-animation-v2' ? [f.front, f.dressed] : req.path === '/animate-with-skeleton-v3' ? Array(3).fill(f.dressed) : [packGrid([f.front, f.front, f.front, f.front], Array(4).fill(null)).image];
  const draft = newDraft(f.ctx, { name: 'Facing trial', slot: 'torso_inner', prompt: f.item.prompt!, key: 'green', anims: ['walking'], dirs: ['south', 'north'] });
  const evaluated: Awaited<ReturnType<typeof runItem>>[] = [];
  const result = await runItem(draft, f.ctx, { result: r => evaluated.push(r) });
  expect(evaluated.some(r => r?.qa?.qa.facingReviewFrames === 3 && r.qa.warnings.some(w => w.startsWith('G14 ')))).toBe(true);
  const poses = ledger.requests.filter(r => r.path === '/animate-with-skeleton-v3');
  expect(poses.filter(r => (r.body as { direction: string }).direction === 'south')).toHaveLength(3);
  expect(poses.filter(r => (r.body as { direction: string }).direction === 'north')).toHaveLength(1);
  expect(ledger.requests.filter(r => r.path === '/inpaint-v3')).toHaveLength(1);
  expect(result!.qa!.failCalls.size).toBe(0);
  expect(result!.qa!.qa.facingReviewFrames).toBeUndefined();
  expect(result!.qa!.qa.clips!['walking/south'].facingReviewFrames).toBeUndefined();
  const count = ledger.requests.length; await runItem(JSON.parse(JSON.stringify(draft)), f.ctx); expect(ledger.requests).toHaveLength(count);
});

test.each(['symmetric references', 'opposite absent', 'occluded'] as const)('%s cannot trigger an automatic torso-facing retry', async mode => {
  const f = await facingFixture(mode !== 'opposite absent', mode === 'occluded');
  const refs = mode === 'opposite absent' || mode === 'symmetric references' ? [f.front, f.front] : [f.front, f.dressed];
  ledger.output = async req => req.path === '/edit-animation-v2' ? refs : Array(3).fill((req.body as { direction: string }).direction === 'north' && mode === 'symmetric references' ? f.front : f.dressed);
  const draft = newDraft(f.ctx, { name: 'Uncertain facing trial', slot: 'torso_inner', prompt: f.item.prompt!, key: 'green', anims: ['walking'], dirs: mode === 'opposite absent' ? ['south'] : ['south', 'north'] });
  const result = await runItem(draft, f.ctx);
  expect(result!.qa!.warnings.some(w => w.startsWith('G14 '))).toBe(false);
  expect(result!.qa!.qa.facingReviewFrames).toBeUndefined();
  expect(ledger.requests.filter(r => r.path === '/animate-with-skeleton-v3')).toHaveLength(mode === 'opposite absent' ? 1 : 2);
  expect(ledger.requests.filter(r => r.path === '/inpaint-v3')).toHaveLength(0);
});
