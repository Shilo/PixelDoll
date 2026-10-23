import { expect,test } from 'vitest';
import { makeImg } from '../../src/lib/image/png.ts';
import { normaliseItemPalette } from '../../src/lib/equipment/palette.ts';

test('small isolated shade drift normalizes to one known raw colour, preserving alpha and source pixels',()=>{
  const image=makeImg(2,1);image.data.set([123,123,123,255,99,88,77,0]);
  const result=normaliseItemPalette(image,new Set([0x787878,0x161614]));
  expect([...result.image.data]).toEqual([120,120,120,255,99,88,77,0]);expect(result.changed).toBe(1);expect(result.unmatched).toBe(0);
  expect(image.data[0]).toBe(123);
});
test('ambiguous nearest shades and distant new colours remain visible failures',()=>{
  const image=makeImg(2,1);image.data.set([122,122,122,255,255,0,0,255]);
  const result=normaliseItemPalette(image,new Set([0x787878,0x7c7c7c]));
  expect(result.changed).toBe(0);expect(result.unmatched).toBe(2);expect(result.image).toEqual(image);
});
