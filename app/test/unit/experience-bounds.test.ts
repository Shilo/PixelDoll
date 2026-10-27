import { describe, expect, test } from 'vitest';
import { bakedFrame } from '../../src/lib/compose/compose.ts';
import { makeImg, type Img } from '../../src/lib/image/png.ts';
import type { Item, Layer, Project, Sha256 } from '../../src/lib/store/manifest.ts';
import { paintedFrame } from '../../src/studio/experience/bounds.ts';

const bodyHash: Sha256 = 'sha256:body';
function rectangle(w: number, h: number, x: number, y: number, width = 1, height = 1): Img {
  const image = makeImg(w, h);
  for (let row = y; row < y + height; row++) for (let col = x; col < x + width; col++) image.data.set([60, 80, 100, 255], (row * w + col) * 4);
  return image;
}
function item(id: string, slot: string, layers: Layer[]): Item {
  return { id, name: id, slot, layers, prompt: '', baseHash: bodyHash, status: 'accepted', mirror: 'flip', materials: [], provenance: [] };
}
function fixture(): Project {
  return {
    manifest: {
      format: 'pixeldoll/2', name: 'Bounds fixture', app: '', materials: [], presets: [],
      rig: { cell: { w: 64, h: 64 }, pivot: { x: 32, y: 56 }, baseItem: 'body', baseHash: bodyHash, directions: [{ id: 'south' }], animations: [] },
      slots: [{ id: 'body', z: 0, class: 'base' }, { id: 'main_hand', z: 3, class: 'held' }, { id: 'head', z: 2, class: 'rigid' }, { id: 'hair', z: 1, class: 'worn' }],
      items: [item('body', 'body', [{ id: 'main', role: 'fg', z: 0, cells: { walk: { south: [bodyHash] } } }])],
    },
    images: new Map([[bodyHash, rectangle(64, 64, 20, 8, 24, 48)]]),
  };
}
function weapon(project: Project, image: Img, hash: Sha256 = 'sha256:weapon'): Item {
  project.images.set(hash, image);
  const result = item('weapon', 'main_hand', [{ id: 'main', role: 'fg', z: 3, cell: { w: 96, h: 96 }, pivot: { x: 48, y: 72 }, cells: { walk: { south: [hash] } } }]);
  project.manifest.items.push(result);
  return result;
}

describe('stable painted outfit frame', () => {
  test('ignores blank oversize padding without changing the baked drawing frame or pixels', () => {
    const p = fixture(); weapon(p, makeImg(96, 96));
    const before = [...p.images.get(bodyHash)!.data];
    expect(bakedFrame(p.manifest)).toEqual({ w: 96, h: 96, x: 48, y: 72 });
    expect(paintedFrame(p, { main_hand: 'weapon' })).toEqual({ w: 24, h: 48, x: 12, y: 48 });
    expect([...p.images.get(bodyHash)!.data]).toEqual(before);
    expect(bakedFrame(p.manifest)).toEqual({ w: 96, h: 96, x: 48, y: 72 });
  });

  test('includes animation extremes across every clip, direction and cell', () => {
    const p = fixture(), layer = p.manifest.items[0].layers[0];
    p.images.set('sha256:extreme', rectangle(64, 64, 5, 1, 2, 2));
    layer.cells!.attack = { north: [null, 'sha256:extreme'] };
    expect(paintedFrame(p, {})).toEqual({ w: 39, h: 55, x: 27, y: 55 });
  });

  test('unions oversize equipment around its own pivot, including later weapon extremes', () => {
    const p = fixture(), gear = weapon(p, rectangle(96, 96, 2, 60));
    p.images.set('sha256:reach', rectangle(96, 96, 94, 10));
    gear.layers[0].cells!.attack = { east: ['sha256:reach'] };
    expect(paintedFrame(p, { main_hand: 'weapon' })).toEqual({ w: 93, h: 62, x: 46, y: 62 });
    expect(paintedFrame(p, {})).toEqual({ w: 24, h: 48, x: 12, y: 48 });
  });

  test('excludes hidden equipped slots and uses compositor baked tuck variants', () => {
    const p = fixture();
    const gear = weapon(p, rectangle(96, 96, 0, 0));
    p.manifest.items[0].hides = ['main_hand'];
    expect(paintedFrame(p, { main_hand: gear.id })).toEqual({ w: 24, h: 48, x: 12, y: 48 });
    p.images.set('sha256:hair', rectangle(64, 64, 0, 8, 64, 12));
    p.images.set('sha256:tucked', rectangle(64, 64, 22, 30, 20, 10));
    p.manifest.slots.find(slot => slot.id === 'head')!.clips = ['hair'];
    p.manifest.items.push(item('hat', 'head', []), item('hair', 'hair', [{ id: 'main', role: 'fg', z: 1, cells: { walk: { south: ['sha256:hair'] } } }]), {
      ...item('hair~hat', 'hair', [{ id: 'main', role: 'fg', z: 1, cells: { walk: { south: ['sha256:tucked'] } } }]), variantOf: 'hair', under: 'hat',
    });
    expect(paintedFrame(p, { hair: 'hair', head: 'hat' })).toEqual({ w: 24, h: 48, x: 12, y: 48 });
  });

  test('uses owner-local image overrides rather than another layer sharing the hash', () => {
    const p = fixture(), layer = p.manifest.items[0].layers[0];
    p.layerImages = new Map([[layer, new Map([[bodyHash, rectangle(64, 64, 25, 10, 10, 40)]])]]);
    expect(paintedFrame(p, {})).toEqual({ w: 10, h: 40, x: 7, y: 46 });
  });

  test('conservatively includes horizontal counterparts for declared mirrors', () => {
    const p = fixture(); p.images.set(bodyHash, rectangle(64, 64, 10, 10, 2, 3));
    p.manifest.rig.directions.push({ id: 'west', mirrorOf: 'east' }, { id: 'east' });
    expect(paintedFrame(p, {})).toEqual({ w: 44, h: 3, x: 22, y: 46 });
  });

  test('falls back to the full baked frame for empty or missing artwork', () => {
    const p = fixture(); weapon(p, makeImg(96, 96));
    p.images.set(bodyHash, makeImg(64, 64));
    expect(paintedFrame(p, {})).toEqual(bakedFrame(p.manifest));
    p.images.delete(bodyHash);
    expect(paintedFrame(p, {})).toEqual(bakedFrame(p.manifest));
  });

  test('falls back for mismatched images, sparse cells and malformed originals', () => {
    const p = fixture(); p.images.set(bodyHash, makeImg(32, 32));
    expect(paintedFrame(p, {})).toEqual(bakedFrame(p.manifest));
    p.images.set(bodyHash, rectangle(64, 64, 20, 8));
    p.manifest.items[0].layers[0].cells!.walk.south = new Array(2);
    expect(paintedFrame(p, {})).toEqual(bakedFrame(p.manifest));
    p.manifest.items[0].layers[0].cells = {};
    p.manifest.rig.rest = { south: { image: 'sha256:absent', keypoints: [] } };
    expect(paintedFrame(p, {})).toEqual(bakedFrame(p.manifest));
  });

  test('keeps a finite rig fallback when a layer has malformed frame metadata', () => {
    const p = fixture(); p.manifest.items[0].layers[0].pivot = { x: NaN, y: 40 };
    expect(paintedFrame(p, {})).toEqual({ w: 64, h: 64, x: 32, y: 56 });
  });

  test('falls back for malformed pixel buffers and preserves a zero pivot offset', () => {
    const p = fixture(); p.images.set(bodyHash, { w: 64, h: 64, data: new Uint8ClampedArray(3) });
    expect(paintedFrame(p, {})).toEqual(bakedFrame(p.manifest));
    p.images.set(bodyHash, rectangle(64, 64, 32, 56));
    expect(paintedFrame(p, {})).toEqual({ w: 1, h: 1, x: 0, y: 0 });
  });

  test('caches alpha scans by image identity across repeated outfit calculations', () => {
    const p = fixture(), image = p.images.get(bodyHash)!;
    const data = image.data; let reads = 0;
    Object.defineProperty(image, 'data', { get: () => { reads++; return data; } });
    expect(paintedFrame(p, {})).toEqual({ w: 24, h: 48, x: 12, y: 48 });
    expect(paintedFrame(p, {})).toEqual({ w: 24, h: 48, x: 12, y: 48 });
    expect(reads).toBe(1);
    p.images.set(bodyHash, rectangle(64, 64, 30, 30));
    expect(paintedFrame(p, {})).toEqual({ w: 1, h: 1, x: 2, y: 26 });
  });
});
