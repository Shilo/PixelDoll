import { expect, test } from 'vitest';
import { designConsistency, expectsWaistBand, waistBandEvidence, type StandingDesignView } from '../../src/lib/items/design-consistency.ts';
import { makeImg, type Img } from '../../src/lib/image/png.ts';
import { DIRECTIONS, type DirectionName } from '../../src/lib/rig/rig.ts';

function paint(im: Img, x: number, y: number, w: number, h: number, value: number) {
  for (let Y = y; Y < y + h; Y++) for (let X = x; X < x + w; X++) im.data.set([value, value, value, 255], (Y * im.w + X) * 4);
}
function view(band = true, garment = 25, detail = 220): StandingDesignView {
  const body = makeImg(64, 64), layer = makeImg(64, 64);
  paint(body, 25, 20, 14, 40, 160); paint(layer, 24, 20, 16, 40, garment);
  if (band) paint(layer, 25, 33, 14, 1, detail);
  const point = (x: number, y: number) => ({ x, y, z: 0 });
  return { body, layer, pose: { NECK: point(32, 20), 'LEFT HIP': point(28, 36), 'RIGHT HIP': point(36, 36), 'LEFT SHOULDER': point(26, 20), 'RIGHT SHOULDER': point(38, 20), 'LEFT ELBOW': point(22, 28), 'RIGHT ELBOW': point(42, 28), 'LEFT ARM': point(22, 39), 'RIGHT ARM': point(42, 39) } };
}
const views = (shown: DirectionName[] = ['south', 'south-east', 'east', 'west', 'south-west']) => Object.fromEntries(DIRECTIONS.map(dir => [dir, view(shown.includes(dir))])) as Record<DirectionName, StandingDesignView>;

test('a majority of clear wraparound bands identifies missing views with bounded waist repair masks', () => {
  const all = views(), before = structuredClone(all), result = designConsistency('black robe with a white sash tied around the waist', all);
  expect(result?.referenceDirections).toEqual(['south', 'south-east', 'east', 'west', 'south-west']);
  expect(result?.missingDirections).toEqual(['north-east', 'north', 'north-west']);
  for (const dir of result!.missingDirections) {
    const rect = result!.targetRects[dir]!;
    expect(rect.y).toBeGreaterThan(25); expect(rect.y + rect.h).toBeLessThan(40);
    expect(rect.w).toBeLessThan(20); expect(rect.h).toBeLessThanOrEqual(6);
    paint(all[dir].layer, rect.x, 33, rect.w, 1, 220);
  }
  expect(designConsistency('white waistband', all)).toBeNull();
  expect(before.north.layer.data).not.toEqual(all.north.layer.data);
  const untouched = views(); designConsistency('white waistband', untouched); expect(untouched).toEqual(before);
});

test('intent excludes asymmetric, diagonal, absent and non-waist details', () => {
  for (const prompt of ['white collar', 'robe without a belt', 'no sash around the waist', 'diagonal shoulder sash', 'front-only white belt', 'asymmetric waistband', 'ceremonial sash']) {
    expect(expectsWaistBand(prompt), prompt).toBe(false);
    expect(designConsistency(prompt, views())).toBeNull();
  }
  for (const prompt of ['white sash at the waist', 'black coat and belt', 'contrasting waistband']) expect(expectsWaistBand(prompt)).toBe(true);
});

test('a minority, sparse direction set or uniform light clothing cannot establish a missing band', () => {
  expect(designConsistency('white belt', views(['south', 'east', 'west']))).toBeNull();
  expect(designConsistency('white belt', { south: view(), east: view(), north: view(false) })).toBeNull();
  const white = Object.fromEntries(DIRECTIONS.map(dir => [dir, view(true, 220, 220)]));
  expect(designConsistency('white belt', white)).toBeNull();
  const lowContrast = Object.fromEntries(DIRECTIONS.map(dir => [dir, view(!dir.startsWith('north'), 100, 130)]));
  expect(designConsistency('gray belt', lowContrast)).toBeNull();
});

test('collars, cuffs and small buckles do not count as horizontal waist bands', () => {
  const all = views([]);
  for (const v of Object.values(all)) {
    paint(v.layer, 25, 22, 14, 1, 220); paint(v.layer, 31, 33, 3, 1, 220);
    paint(v.layer, 23, 34, 3, 1, 220); paint(v.layer, 38, 34, 3, 1, 220);
  }
  expect(designConsistency('white belt with a buckle', all)).toBeNull();
});

test('occluded or uncovered missing waist regions remain unclassified', () => {
  const all = views();
  all.north.pose['LEFT ELBOW'] = { x: 32, y: 31, z: 0 }; all.north.pose['LEFT ARM'] = { x: 32, y: 35, z: 0 };
  all['north-east'].layer = makeImg(64, 64);
  const result = designConsistency('white belt', all);
  expect(result?.missingDirections).toEqual(['north-west']);
  delete all['north-west'].pose.NECK;
  expect(designConsistency('white belt', all)).toBeNull();
});

test('fragmented light pixels and shadow gray can still establish a continuous contrasting band', () => {
  const all = views();
  for (const dir of ['south', 'south-east', 'east', 'west', 'south-west'] as const) {
    paint(all[dir].layer, 25, 33, 14, 1, 150);
    paint(all[dir].layer, 30, 33, 1, 1, 25);
  }
  expect(designConsistency('gray sash at the waist', all)?.missingDirections).toEqual(['north-east', 'north', 'north-west']);
});

test('per-view evidence keeps sparse or occluded output distinct from a successful repair', () => {
  expect(waistBandEvidence(view())).toBe('present');
  expect(waistBandEvidence(view(false))).toBe('missing');
  const sparse = view(false); sparse.layer = makeImg(64, 64);
  expect(waistBandEvidence(sparse)).toBe('unknown');
  const hidden = view(false);
  hidden.pose['LEFT ELBOW'] = { x: 32, y: 31, z: 0 }; hidden.pose['LEFT ARM'] = { x: 32, y: 35, z: 0 };
  expect(waistBandEvidence(hidden)).toBe('unknown');
  delete hidden.pose.NECK;
  expect(waistBandEvidence(hidden)).toBe('unknown');
});
