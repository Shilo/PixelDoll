import type { Manifest } from '../../src/lib/store/manifest.ts';
export const gdFixture = () => ({ name: 'Native doll', app: 'test', format: 'pixeldoll/2',
  rig: { baseHash: 'sha256:' + '1'.repeat(64), baseItem: 'base', cell: { w: 2, h: 2 }, pivot: { x: 1, y: 2 }, directions: [{ id: 'south' }, { id: 'east' }], animations: [
    { id: 'walk', cells: 2, directions: ['south'], loop: true, frames: [{ cell: 1, ms: 80 }, { cell: 0, ms: 180 }, { cell: 1, ms: 100 }] },
    { id: 'stop', cells: 2, directions: ['south'], loop: false, frames: [{ cell: 0, ms: 50 }, { cell: 1, ms: 70 }] },
  ] },
  materials: [{ id: 'skin', owner: 'base', ramp: ['#646464'], defaultVariant: 'blue', variants: { blue: ['#0000ff'], red: ['#ff0000'] } },
    { id: 'hair', owner: 'hair', ramp: ['#646464'], linkTo: 'skin', variants: { blue: ['#00ffff'], red: ['#ff00ff'] } }],
  slots: [{ id: 'body' }, { id: 'hair' }, { id: 'head', clips: ['hair'], zOverrides: [{ layer: 'fg', cell: 0, z: -10 }] }],
  items: [
    { id: 'base', slot: 'body', materials: ['skin'], layers: [{ id: 'main', role: 'fg', z: 10, sheets: { walk: 'base.png', stop: 'base.png' }, sourceSheets: { walk: 'source.png', stop: 'source.png' } }] },
    { id: 'hair', slot: 'hair', materials: ['hair'], layers: [{ id: 'main', role: 'fg', z: 20, sheets: { walk: 'hair.png', stop: 'hair.png' } }] },
    { id: 'hat', slot: 'head', materials: [], layers: [{ id: 'main', role: 'fg', z: 20, cell: { w: 4, h: 4 }, pivot: { x: 2, y: 3 }, sheets: { walk: 'hat.png', stop: 'hat.png' } }] },
    { id: 'hair~hat', variantOf: 'hair', under: 'hat', slot: 'hair', materials: ['hair'], layers: [{ id: 'main', role: 'fg', z: 20, sheets: { walk: 'tucked.png', stop: 'tucked.png' } }] },
  ], presets: [{ id: 'default', items: { hair: 'hair', head: 'hat' }, variants: {} }, { id: 'red', items: { hair: 'hair' }, variants: { skin: 'red' } }],
}) as unknown as Manifest;

export function gdSheets() {
  return new Map(['base.png', 'source.png', 'hair.png', 'hat.png', 'tucked.png'].map((path) => {
    const n = path === 'hat.png' ? 8 : 4, data = new Uint8ClampedArray(n * n * 4);
    for (let i = 0; i < data.length; i += 4) data.set(path === 'base.png' ? [12, 34, 56, 255] : [100, 100, 100, 255], i);
    if (path === 'source.png') for (let row = 0; row < 2; row++) for (let cell = 0; cell < 2; cell++) {
      data.set(cell === 0 ? [255, 200, 0, 255] : [0, 200, 0, 255], ((row * 2 + 1) * n + cell * 2 + 1) * 4);
    }
    return [path, { w: n, h: n, data }];
  }));
}
