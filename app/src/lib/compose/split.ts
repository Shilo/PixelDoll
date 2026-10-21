// fg/bg split for wrap-around items (architecture §3.4): fg = layer ∩ base opaque, bg = the rest.
// Drawing bg → base → fg reproduces base + layer exactly [S1 E5].
import { makeImg, type Img } from '../image/png.ts';

export function splitFgBg(layer: Img, base: Img): { fg: Img; bg: Img } {
  const fg = makeImg(layer.w, layer.h), bg = makeImg(layer.w, layer.h);
  for (let i = 0; i < layer.data.length; i += 4)
    if (layer.data[i + 3]) (base.data[i + 3] ? fg : bg).data.set(layer.data.subarray(i, i + 4), i);
  return { fg, bg };
}

export function selfTest() {
  const base: Img = { w: 3, h: 1, data: new Uint8ClampedArray([0, 0, 0, 0, 9, 9, 9, 255, 0, 0, 0, 0]) };
  const layer: Img = { w: 3, h: 1, data: new Uint8ClampedArray([1, 1, 1, 255, 2, 2, 2, 255, 0, 0, 0, 0]) };
  const { fg, bg } = splitFgBg(layer, base);
  console.assert(fg.data.join() === '0,0,0,0,2,2,2,255,0,0,0,0', 'fg = layer on base');
  console.assert(bg.data.join() === '1,1,1,255,0,0,0,0,0,0,0,0', 'bg = layer off base');
}
