import { afterEach, expect, test, vi } from 'vitest';
import { garmentBand, missingLowerGarment } from '../../src/lib/items/garment-coverage.ts';
import { bandOf, dirGate, inputCell, itemQa, slotOf } from '../../src/lib/items/items.ts';
import { gridRepairRequest, isClean, withH4, type RigCtx } from '../../src/lib/items/run.ts';
import { makeImg, type Img } from '../../src/lib/image/png.ts';
import { decodePngBytes, encodePngBytes } from '../../src/lib/image/pngraw.ts';
import { cellHash, type Rig } from '../../src/lib/rig/rig.ts';
import { fromApi, LABELS, toApi } from '../../src/lib/rig/poses.ts';
import type { Skeleton } from '../../src/lib/rig/skeleton.ts';
import type { Item, Manifest } from '../../src/lib/store/manifest.ts';
import * as db from '../../src/lib/store/db.ts';
import { extractCell } from '../../src/lib/items/items.ts';
import { plainReason } from '../../src/studio/model.ts';

afterEach(() => vi.restoreAllMocks());
const rest: Skeleton = Object.fromEntries(LABELS.map(label => [label, { x: label.startsWith('LEFT') ? 26 : 38, y: /NECK|SHOULDER/.test(label) ? 20 : /HIP/.test(label) ? 36 : /KNEE/.test(label) ? 48 : /LEG/.test(label) ? 60 : 12, z: 0 }]));
const paint = (im: Img, x0: number, y0: number, x1: number, y1: number, rgb = [40, 40, 45]) => {
  for (let y = y0; y < y1; y++) for (let x = x0; x < x1; x++) im.data.set([...rgb, 255], (y * im.w + x) * 4);
  return im;
};
const robe = () => paint(makeImg(64, 64), 22, 20, 42, 61);
const nominal = () => bandOf('torso_inner', rest, 64);

test('repair includes the approved full-length garment while protecting the face', () => {
  const band = garmentBand(nominal(), robe(), rest, rest);
  expect(band.y).toBeGreaterThan(12);
  expect(band.y + band.h).toBeGreaterThan(60);
  const shirt = paint(makeImg(64, 64), 22, 21, 42, 39);
  expect(garmentBand(nominal(), shirt, rest, rest)).toEqual(nominal());
  expect(garmentBand(nominal(), makeImg(64, 64), rest, rest)).toEqual(nominal());
});

test('hem bounds follow ankle movement and remain inside the frame', () => {
  const lifted = structuredClone(rest);
  lifted['LEFT LEG'].y = lifted['RIGHT LEG'].y = 53;
  const band = garmentBand(nominal(), robe(), rest, lifted);
  expect(band.y + band.h).toBeGreaterThan(53);
  expect(band.y + band.h).toBeLessThan(61);
  lifted['LEFT LEG'].y = lifted['RIGHT LEG'].y = 70;
  expect(garmentBand(nominal(), robe(), rest, lifted).y + garmentBand(nominal(), robe(), rest, lifted).h).toBe(64);
  const folded = structuredClone(rest); folded['LEFT KNEE'].y = folded['RIGHT KNEE'].y = 30;
  folded['LEFT LEG'].y = folded['RIGHT LEG'].y = 32;
  const result = garmentBand(nominal(), robe(), folded, rest);
  expect(Number.isFinite(result.y + result.h)).toBe(true);
  expect(result.y).toBeGreaterThanOrEqual(0);
  expect(result.y + result.h).toBeLessThanOrEqual(64);
});

test('region QA catches missing trousers despite stable clothing elsewhere, allowing one hidden leg and small details', () => {
  const design = robe(), shorts = paint(makeImg(64, 64), 18, 20, 46, 45);
  expect(missingLowerGarment(design, shorts, rest, rest)).toBe(true);
  expect(missingLowerGarment(design, design, rest, rest)).toBe(false);
  expect(missingLowerGarment(design, paint(makeImg(64, 64), 22, 20, 32, 61), rest, rest)).toBe(false);
  expect(missingLowerGarment(paint(makeImg(64, 64), 26, 58, 28, 61), makeImg(64, 64), rest, rest)).toBe(false);
});

test('missing lower clothing fails locomotion QA and leaves action occlusion for review', () => {
  const points = toApi(rest, { w: 64, h: 64 });
  const rig = { cell: { w: 64, h: 64 }, rest: { south: { keypoints: points } }, animations: [{ id: 'walk', cells: 1, sources: { south: { keypoints: [points] } } }, { id: 'slash', cells: 1, sources: { south: { keypoints: [points] } } }] } as unknown as Rig;
  const base = paint(makeImg(64, 64), 24, 10, 40, 61, [170, 120, 90]), out = inputCell(base, 'green');
  paint(out, 22, 20, 42, 44);
  const cell = extractCell({ key: 'walk/south/0', call: 3, base, out, route: 'green', band: nominal(), posed: true });
  expect(dirGate(slotOf('torso_inner'), [cell], { south: robe() }, rig).fails.get(3)).toContainEqual(expect.stringContaining('G11'));
  expect([...dirGate(slotOf('torso_inner'), [{ ...cell, key: 'slash/south/0' }], { south: robe() }, rig).fails.values()].flat().some(s => s.startsWith('G11'))).toBe(false);
  // A flowing cape's lower portion can disappear behind the body or swing above the knees.
  expect([...dirGate(slotOf('back'), [cell], { south: robe() }, rig).fails.values()].flat().some(s => s.startsWith('G11'))).toBe(false);
});

test('the actual inpaint request enables lower clothing and keeps reference cells protected', async () => {
  const body = paint(makeImg(64, 64), 24, 10, 40, 61, [170, 120, 90]), hash = await cellHash(body);
  const points = toApi(rest, { w: 64, h: 64 }), reference = inputCell(body, 'green');
  paint(reference, 22, 20, 42, 61);
  const bytes = await encodePngBytes(reference);
  vi.spyOn(db, 'getBlob').mockResolvedValue(new Blob([bytes as Uint8Array<ArrayBuffer>]));
  const item = { id: 'outfit', name: 'Outfit', slot: 'torso_inner', status: 'accepted', baseHash: hash, key: 'green', prompt: 'long coat and boots', dressed: { south: `sha256:${'f'.repeat(64)}` }, layers: [{ id: 'main', cells: {} }] } as unknown as Item;
  const manifest = { rig: { cell: { w: 64, h: 64 }, baseItem: 'base', baseHash: hash, directions: [{ id: 'south' }], animations: [{ id: 'walk', cells: 3 }], rest: { south: { image: hash, keypoints: points } } }, items: [{ id: 'base', slot: 'body', layers: [{ cells: { walk: { south: [hash, hash, hash] } } }] }, item] } as unknown as Manifest;
  const ctx: RigCtx = { rec: { id: 'synthetic-garment', savedAt: '', manifest, skeletons: Object.fromEntries([0, 1, 2].map(i => [`walk/south/${i}`, fromApi(points, manifest.rig.cell)])) }, project: { manifest, images: new Map([[hash, body]]) } };
  const request = await gridRepairRequest(ctx, item, 'walk', 'south', 1);
  const data = request.body as { mask_image: { image: { base64: string } }; inpainting_image: { image: { base64: string } } };
  const mask = await decodePngBytes(Buffer.from(data.mask_image.image.base64, 'base64'));
  expect(mask.data[(58 * mask.w + 30) * 4]).toBe(255);
  expect(mask.data[(10 * mask.w + 30) * 4]).toBe(0);
  expect(mask.data[(58 * mask.w + 3 * 64 + 30) * 4]).toBe(0);
  const packed = await decodePngBytes(Buffer.from(data.inpainting_image.image.base64, 'base64'));
  expect([...packed.data.slice((58 * packed.w + 3 * 64 + 30) * 4, (58 * packed.w + 3 * 64 + 30) * 4 + 4)]).toEqual([40, 40, 45, 255]);
});

test('footwear omissions require clip review without creating paid retry failures', () => {
  const points = toApi(rest, { w: 64, h: 64 });
  const rig = { cell: { w: 64, h: 64 }, directions: [{ id: 'south' }], rest: { south: { keypoints: points } }, animations: [{ id: 'walk', cells: 1, sources: { south: { keypoints: [points] } } }] } as unknown as Rig;
  const base = paint(makeImg(64, 64), 24, 10, 40, 61, [170, 120, 90]), out = inputCell(base, 'green');
  paint(out, 22, 20, 42, 59); paint(out, 32, 59, 42, 61);
  const cell = extractCell({ key: 'walk/south/0', call: 0, base, out, route: 'green', band: nominal(), posed: true });
  const q = withH4(itemQa(rig, slotOf('torso_inner'), 'green', [cell], 0), slotOf('torso_inner'), [cell], { south: robe() }, rig, { south: base });
  expect(q.failCalls.size).toBe(0);
  expect(q.warnings).toContainEqual(expect.stringContaining('G12 walk/south/0'));
  expect(q.qa.status).toBe('warn');
  expect(q.qa.footwearReviewFrames).toBe(1);
  expect(q.qa.clips!['walk/south'].status).toBe('warn');
  expect(q.qa.clips!['walk/south'].footwearReviewFrames).toBe(1);
  expect(isClean({ cells: [cell], qa: q, g1: new Map(), preview: null })).toBe(false);
  expect(plainReason(q.warnings.find(w => w.startsWith('G12'))!)).toContain('inspect the feet');
  expect(plainReason('G11 walk/south/0: lower garment is missing')).toContain('lower clothing is missing');
  const source = rig.animations[0].sources!.south!;
  source.measured = [points];
  source.keypoints = [points.map(p => p.label.endsWith('LEG') ? { ...p, x: 0.95 } : p)];
  expect(dirGate(slotOf('torso_inner'), [cell], { south: robe() }, rig, { south: base }).warnings).toContainEqual(expect.stringContaining('G12 walk/south/0'));
});
