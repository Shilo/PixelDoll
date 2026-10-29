import { expect, test } from 'vitest';
import { designGraySmudges, grayShare } from '../../src/lib/items/items.ts';
import { makeImg } from '../../src/lib/image/png.ts';

function glyph(area: number, size = 64) {
  const layer = makeImg(size, size);
  for (let p = 0; p < area; p++) layer.data.set(p < Math.ceil(area / 3) ? [35, 35, 35, 255] : [110, 135, 30, 255], p * 4);
  return layer;
}

test('normal neutral pixels in tiny colorful facial glyphs do not trigger D1 or change the raw metric', () => {
  const layer = glyph(12), before = layer.data.slice();
  expect(grayShare(layer)).toBeCloseTo(1 / 3);
  expect(designGraySmudges('face_acc', 'serious eyes and eyebrows and nose', layer)).toBe(false);
  expect(layer.data).toEqual(before);
});

test.each(['hair', 'head', 'torso_inner', 'back'])('the same gray contamination still triggers D1 in %s', slot => {
  expect(designGraySmudges(slot, 'a colorful design', glyph(12))).toBe(true);
});

test('the facial exemption stops at exactly 32 opaque pixels on a 64px canvas', () => {
  expect(designGraySmudges('face_acc', 'a colorful face accessory', glyph(32))).toBe(false);
  expect(designGraySmudges('face_acc', 'a colorful face accessory', glyph(33))).toBe(true);
  expect(designGraySmudges('face_acc', 'a colorful mask', glyph(96))).toBe(true);
});

test('the facial limit scales with canvas area and preserves the exact 128px boundary', () => {
  expect(designGraySmudges('face_acc', 'eyes', glyph(128, 128))).toBe(false);
  expect(designGraySmudges('face_acc', 'eyes', glyph(129, 128))).toBe(true);
  expect(designGraySmudges('face_acc', 'eyes', glyph(8, 32))).toBe(false);
  expect(designGraySmudges('face_acc', 'eyes', glyph(9, 32))).toBe(true);
});

test('existing gray-color intent exemptions and clean colorful designs keep their behavior', () => {
  expect(designGraySmudges('torso_inner', 'a black coat with white trim', glyph(96))).toBe(false);
  const colorful = makeImg(64, 64);
  for (let p = 0; p < 96; p++) colorful.data.set([190, 30, 45, 255], p * 4);
  expect(designGraySmudges('face_acc', 'a red mask', colorful)).toBe(false);
  expect(designGraySmudges('face_acc', 'eyes', makeImg(64, 64))).toBe(false);
});
