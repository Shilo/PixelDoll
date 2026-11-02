import { expect, test } from 'vitest';
import { torsoConsistency } from '../../src/lib/items/torso-consistency.ts';
import type { StandingDesignView } from '../../src/lib/items/design-consistency.ts';
import { makeImg, type Img } from '../../src/lib/image/png.ts';

const paint = (im: Img, x: number, y: number, w: number, h: number, value: number) => {
  for (let Y = y; Y < y + h; Y++) for (let X = x; X < x + w; X++) im.data.set([value, value, value, 255], (Y * im.w + X) * 4);
};
function view(front: boolean, dx = 0, dy = 0): StandingDesignView {
  const body = makeImg(64, 64), layer = makeImg(64, 64), p = (x: number, y: number) => ({ x: x + dx, y: y + dy, z: 0 });
  paint(body, 25 + dx, 20 + dy, 14, 40, 160); paint(layer, 25 + dx, 20 + dy, 14, 40, 30);
  if (front) paint(layer, 28 + dx, 21 + dy, 8, 5, 220);
  return { body, layer, pose: { NECK: p(32, 20), 'LEFT HIP': p(28, 36), 'RIGHT HIP': p(36, 36), 'LEFT SHOULDER': p(26, 20), 'RIGHT SHOULDER': p(38, 20), 'LEFT ELBOW': p(22, 27), 'RIGHT ELBOW': p(42, 27), 'LEFT ARM': p(22, 39), 'RIGHT ARM': p(42, 39) } };
}

test('clearly opposite upper-torso pixels are detected after anatomical translation in front and back views', () => {
  const front = view(true), back = view(false), before = structuredClone(front);
  const result = torsoConsistency('walking', 'south', front, back, view(false, 2, 2));
  expect(result).not.toBeNull(); expect(result!.opposite).toBeGreaterThanOrEqual(0.9); expect(result!.opposite).toBeGreaterThan(result!.own);
  expect(torsoConsistency('walk', 'north', back, front, view(true))).not.toBeNull();
  expect(front).toEqual(before);
});

test('correct chest appearance, changing sleeves, a different waist band and trousers do not suggest a turn', () => {
  const front = view(true), back = view(false), target = view(true);
  paint(target.layer, 5, 30, 20, 8, 230); paint(target.layer, 25, 33, 14, 2, 220); paint(target.layer, 25, 42, 14, 15, 220);
  expect(torsoConsistency('walking', 'south', front, back, target)).toBeNull();
  expect(torsoConsistency('walking', 'north', back, front, back)).toBeNull();
});

test('near-identical references cannot establish facing, and an unrelated drawing is not called the opposite', () => {
  const front = view(true), back = view(false), unrelated = view(false);
  paint(unrelated.layer, 25, 20, 14, 8, 120);
  expect(torsoConsistency('walking', 'south', front, front, back)).toBeNull();
  expect(torsoConsistency('walking', 'south', front, back, unrelated)).toBeNull();
});

test('side views, action turns and torso foreshortening remain outside this evidence', () => {
  const front = view(true), back = view(false), narrow = view(false);
  narrow.pose['LEFT SHOULDER'].x = 30; narrow.pose['RIGHT SHOULDER'].x = 34;
  narrow.pose['LEFT HIP'].x = 31; narrow.pose['RIGHT HIP'].x = 33;
  expect(torsoConsistency('walking', 'east', front, back, back)).toBeNull();
  expect(torsoConsistency('slash', 'south', front, back, back)).toBeNull();
  expect(torsoConsistency('walking-turn-around', 'south', front, back, back)).toBeNull();
  expect(torsoConsistency('walking', 'south', front, back, narrow)).toBeNull();
});

test('a crossing forearm, missing joints or an empty region cannot establish the opposite view', () => {
  const front = view(true), back = view(false), hidden = view(false);
  hidden.pose['LEFT ELBOW'] = { x: 27, y: 22, z: 0 }; hidden.pose['LEFT ARM'] = { x: 37, y: 25, z: 0 };
  expect(torsoConsistency('walking', 'south', front, back, hidden)).toBeNull();
  delete hidden.pose.NECK;
  expect(torsoConsistency('walking', 'south', front, back, hidden)).toBeNull();
  expect(torsoConsistency('walking', 'south', front, back, { ...back, layer: makeImg(64, 64) })).toBeNull();
});
