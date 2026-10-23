import { expect, test } from 'vitest';
import { repairBodyPalette } from '../../src/lib/rig/palette.ts';
import { makeImg } from '../../src/lib/image/png.ts';
const frame = (rgb: number[], count = 20) => { const im = makeImg(count, 1); for (let i = 0; i < count; i++) im.data.set([...rgb, 255], i * 4); return im; };
const pixel = (rgb: number[], reference: number[] = [0, 0, 0]) => { const rest = frame(reference), im = frame(reference); im.data.set([...rgb, 255], 0); return { rest, im }; };

test.each([13, 14, 15, 16])('repairs unique same-family near-black drift of %ipx channel units', n => {
  const { rest, im } = pixel([n, 5, 2]), before = structuredClone(im);
  const result = repairBodyPalette(rest, [im]);
  expect(result.changedPixels).toBe(1); expect(result.changedFrames).toEqual([0]);
  expect([...result.frames[0].data.slice(0, 4)]).toEqual([0, 0, 0, 255]);
  expect(result).toMatchObject({ rawOutliers: 1, remainingOutliers: 0, rawPaletteFit: .95, paletteFit: 1 });
  expect(im).toEqual(before);
});
test.each([17, 24, 60])('leaves unsafe %i-unit drift unchanged even when the palette gate still fails', n => {
  const { rest, im } = pixel([n, 5, 2]), result = repairBodyPalette(rest, [im]);
  expect(result.frames[0]).toEqual(im); expect(result.changedPixels).toBe(0);
  expect(result.paletteFit).toBe(.95); expect(result.remainingOutliers).toBe(1);
});
test('already tolerated12-unit colours stay untouched rather than full palette quantization', () => {
  const { rest, im } = pixel([12, 5, 2]), r = repairBodyPalette(rest, [im]);
  expect(r.frames[0]).toEqual(im); expect(r.rawOutliers).toBe(0); expect(r.changedPixels).toBe(0);
});
test('equally close reference colours are refused regardless of palette iteration order', () => {
  const { rest, im } = pixel([16, 16, 16]); rest.data.set([32, 32, 32, 255], 4);
  const r = repairBodyPalette(rest, [im]); expect(r.changedPixels).toBe(0); expect(r.frames[0]).toEqual(im);
});
test('small warm-to-warm and neutral-to-neutral changes preserve their shade families', () => {
  for (const [source, target] of [[[176, 110, 80], [189, 106, 67]], [[46, 58, 77], [50, 54, 61]]] as const) {
    const { rest, im } = pixel([...source], [...target]), r = repairBodyPalette(rest, [im]);
    expect(r.changedPixels).toBe(1); expect([...r.frames[0].data.slice(0, 3)]).toEqual([...target]);
  }
});
test.each([[[84, 84, 76], [100, 70, 60]], [[100, 64, 76], [100, 80, 60]]])('refuses neutral/warm crossing or a large hue change despite16-unit proximity', (source, target) => {
  const { rest, im } = pixel(source, target), r = repairBodyPalette(rest, [im]); expect(r.changedPixels).toBe(0); expect(r.frames[0]).toEqual(im);
});
test('broad drift over5% refuses the whole operation without mutating inputs', () => {
  const { rest, im } = pixel([13, 5, 2]); im.data.set([13, 5, 2, 255], 4); const before = structuredClone(im);
  expect(() => repairBodyPalette(rest, [im])).toThrow('Too much colour drift'); expect(im).toEqual(before);
});
test('transparent RGB, every alpha value and all unaffected pixels are preserved exactly', () => {
  const { rest, im } = pixel([13, 5, 2], [0, 0, 0]); im.data.set([88, 99, 111, 0], 4);
  // Keep exactly5% outliers across the two frames, despite the invisible pixel.
  const second = frame([0, 0, 0]), before = structuredClone([im, second]); const r = repairBodyPalette(rest, [im, second]);
  expect([...r.frames[0].data.slice(4, 8)]).toEqual([88, 99, 111, 0]);
  for (const [n, f] of r.frames.entries()) for (let i = 3; i < f.data.length; i += 4) expect(f.data[i]).toBe(before[n].data[i]);
  expect([im, second]).toEqual(before); expect(r.changedFrames).toEqual([0]);
});
test('a palette-valid invented grey object is left unchanged; palette repair does not certify geometry', () => {
  const rest = frame([80, 80, 80]), im = structuredClone(rest), r = repairBodyPalette(rest, [im]);
  expect(r.changedPixels).toBe(0); expect(r.frames[0]).toEqual(im); expect(r.paletteFit).toBe(1);
});
test('missing reference or incompatible frame geometry is rejected', () => {
  expect(() => repairBodyPalette(makeImg(20, 1), [frame([0, 0, 0])])).toThrow('visible reference');
  expect(() => repairBodyPalette(frame([0, 0, 0]), [makeImg(2, 2)])).toThrow('matching complete frames');
});
