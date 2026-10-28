import { expect, test } from 'vitest';
import { footwearWarnings } from '../../src/lib/items/footwear-review.ts';
import { makeImg, type Img } from '../../src/lib/image/png.ts';
import type { Skeleton } from '../../src/lib/rig/skeleton.ts';

const joints = (): Skeleton => ({ 'LEFT LEG': { x: 16, y: 26, z: 0 }, 'RIGHT LEG': { x: 26, y: 26, z: 0 } });
const paintFoot = (im: Img, x: number, pixels = 5) => {
  for (let n = 0; n < pixels; n++) im.data.set([110, 150, 90, 255], (26 * im.w + x - 2 + n) * 4);
  return im;
};
const feet = () => paintFoot(paintFoot(makeImg(32, 32), 16), 26);

test('warns when an approved covered foot becomes exposed even with intact pants', () => {
  const body = feet(), design = feet(), layer = paintFoot(makeImg(32, 32), 26), before = layer.data.slice();
  for (let y = 10; y < 25; y++) for (let x = 12; x < 30; x++) layer.data.set([20, 20, 20, 255], (y * layer.w + x) * 4);
  const painted = layer.data.slice();
  expect(footwearWarnings(body, design, body, layer, joints(), joints())).toEqual(['left']);
  expect(layer.data).toEqual(painted);
  expect(before).not.toEqual(painted);
});

test('ordinary boots retain coverage without inspecting their RGB colors', () => {
  const body = feet(), design = feet(), layer = feet();
  for (let p = 0; p < layer.data.length; p += 4) if (layer.data[p + 3]) layer.data.set([240, 220, 180], p);
  expect(footwearWarnings(body, design, body, layer, joints(), joints())).toEqual([]);
});

test('open or uncovered reference feet do not establish missing footwear', () => {
  const body = feet(), design = paintFoot(paintFoot(makeImg(32, 32), 16, 2), 26, 2);
  expect(footwearWarnings(body, design, body, makeImg(32, 32), joints(), joints())).toEqual([]);
});

test('absent or tiny visible target feet are ambiguous rather than missing shoes', () => {
  const reference = feet(), design = feet(), target = paintFoot(paintFoot(makeImg(32, 32), 16, 2), 26);
  expect(footwearWarnings(reference, design, target, paintFoot(makeImg(32, 32), 26), joints(), joints())).toEqual([]);
  expect(footwearWarnings(reference, design, makeImg(32, 32), makeImg(32, 32), joints(), joints())).toEqual([]);
});

test('partial target coverage at the conservative threshold does not warn', () => {
  const body = feet(), partial = paintFoot(paintFoot(makeImg(32, 32), 16, 2), 26, 2);
  expect(footwearWarnings(body, feet(), body, partial, joints(), joints())).toEqual([]);
});

test('missing joint observations remain unverified and inconsistent canvases fail clearly', () => {
  const body = feet();
  expect(footwearWarnings(body, feet(), body, makeImg(32, 32), {}, joints())).toEqual([]);
  expect(footwearWarnings(body, feet(), body, makeImg(32, 32), joints(), {})).toEqual([]);
  expect(() => footwearWarnings(body, makeImg(16, 16), body, feet(), joints(), joints())).toThrow('matching body and equipment canvases');
});
