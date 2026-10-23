import { expect, test } from 'vitest';
import { clearMovePoseData, invalidateMoveItems, moveRigVersion } from '../../src/studio/replaceMove.ts';
import { makeImg } from '../../src/lib/image/png.ts';
import { itemQa, slotOf, type CellOut } from '../../src/lib/items/items.ts';
import type { Item, Manifest } from '../../src/lib/store/manifest.ts';
import { composeCell } from '../../src/lib/compose/compose.ts';

const hash = 'sha256:' + 'a'.repeat(64) as `sha256:${string}`;
function fixture(legacy = false): Manifest {
  const img = makeImg(64, 64); img.data.set([255, 0, 0, 255], (32 * 64 + 32) * 4);
  const rig: Manifest['rig'] = { cell: { w: 64, h: 64 }, pivot: { x: 32, y: 60 }, baseItem: 'base', baseHash: hash, directions: [{ id: 'south' }], animations: ['idle', 'slash'].map(id => ({ id, cells: 1, loop: true, frames: [{ cell: 0, ms: 100 }] })) };
  const cells: CellOut[] = ['idle', 'slash'].map((a) => ({ key: `${a}/south/0`, call: 0, base: img, input: img, out: img, layer: img, mask: new Uint8Array(4096), area: 1, outBand: 0, baseBand: 0, specks: 0, pinholes: 0, shifted: false, offset: [0, 0], stray: 0, posed: true, keyKept: 1, keyOutside: 0 }));
  const qa = itemQa(rig, slotOf('head'), 'green', cells, 2).qa;
  if (legacy) delete qa.clips;
  const item: Item = { id: 'hat', name: 'Hat', slot: 'head', status: 'accepted', mirror: 'flip', materials: [], prompt: '', baseHash: hash, provenance: [], dressed: { south: hash }, anchorCell: 'slash/south/0', qa, layers: [{ id: 'main', role: 'fg', z: 10, cells: { idle: { south: [hash] }, slash: { south: [hash] } } }] };
  return { format: 'pixeldoll/1', name: 'Test', app: '', rig, slots: [{ id: 'head', z: 10, class: 'rigid' }], materials: [], items: [item], presets: [] };
}

test('replacement hides obsolete fitted pixels while retaining every unaffected move and rest design', () => {
  const manifest = fixture(), item = manifest.items[0], design = structuredClone(item.dressed);
  const img = makeImg(64, 64); img.data.set([255, 0, 0, 255], (32 * 64 + 32) * 4);
  const project = { manifest, images: new Map([[hash, img]]) };
  expect(composeCell(project, { head: 'hat' }, 'slash', 'south', 0).data.some(Boolean)).toBe(true);
  invalidateMoveItems(manifest, 'slash');
  expect(composeCell(project, { head: 'hat' }, 'slash', 'south', 0).data.some(Boolean)).toBe(false);
  expect(composeCell(project, { head: 'hat' }, 'idle', 'south', 0).data.some(Boolean)).toBe(true);
  expect(item.layers[0].cells?.slash).toBeUndefined();
  expect(item.qa?.cells['slash/south/0']).toBeUndefined();
  expect(Object.keys(item.qa?.clips ?? {})).toEqual(['idle/south']);
  expect(item.qa?.rerolls).toBe(2);
  expect(item.dressed).toEqual(design);
  expect(item.anchorCell).toBeUndefined();
  const before = structuredClone(manifest);
  invalidateMoveItems(manifest, 'slash');
  expect(manifest).toEqual(before);
});

test('legacy summaries remain explicitly incomplete only for retained coverage', () => {
  const m = fixture(true);
  invalidateMoveItems(m, 'slash');
  expect(m.items[0].qa?.legacy?.clips).toEqual(['idle/south']);
  expect(m.items[0].qa?.status).toBe('warn');
  invalidateMoveItems(m, 'idle');
  expect(m.items[0].qa).toBeUndefined();
});

test('replaced clip drops missing old skeleton measurements and anchor tracks without touching other moves', () => {
  const m = fixture();
  const rig = m.rig;
  rig.anchors = { head: { idle: { south: [[32, 10]] }, slash: { south: [[40, 15]] } } };
  const skeletons = { 'idle/south/0': { head: [32, 10] }, 'slash/south/0': { head: [40, 15] } } as unknown as Parameters<typeof clearMovePoseData>[1];
  clearMovePoseData(rig, skeletons, 'slash');
  expect(Object.keys(skeletons)).toEqual(['idle/south/0']);
  expect(rig.anchors.head).toEqual({ idle: { south: [[32, 10]] } });
});


test('move input version detects same-body rig/reference changes while allowing outfit edits', () => {
  const original = { manifest: fixture(), character: { id: 'managed-original', looks: 'plain mannequin' } }
  const version = moveRigVersion(original)
  const outfit = structuredClone(original)
  outfit.manifest.name = 'New name'
  outfit.manifest.presets = [{ id: 'new-outfit', name: 'New outfit', items: {}, variants: {} }]
  expect(moveRigVersion(outfit)).toBe(version)
  const rest = structuredClone(original)
  rest.manifest.rig.rest = { south: { image: hash, keypoints: [{ label: 'NOSE', x: 0.5, y: 0.5 }] } }
  expect(rest.manifest.rig.baseHash).toBe(original.manifest.rig.baseHash)
  expect(moveRigVersion(rest)).not.toBe(version)
  const managed = structuredClone(original)
  managed.character.id = 'managed-replaced'
  expect(moveRigVersion(managed)).not.toBe(version)
  const source = structuredClone(original)
  source.manifest.rig.animations[0].sources = { south: { route: 'import', reference: hash, provenance: [] } }
  expect(moveRigVersion(source)).not.toBe(version)
})


test('direction-scoped replacement invalidates the target and mirror children while preserving other coverage', () => {
  const m = fixture(), item = m.items[0], h = item.layers[0].cells!.slash!.south![0]
  m.rig.directions = [{id:'south'},{id:'east'},{id:'west',mirrorOf:'east'},{id:'north'}]
  for (const d of ['east','west','north'] as const) { item.layers[0].cells!.slash![d] = [h]; item.qa!.clips![`slash/${d}`] = structuredClone(item.qa!.clips!['slash/south']); item.qa!.cells[`slash/${d}/0`] = structuredClone(item.qa!.cells['slash/south/0']); }
  const south = structuredClone(item.layers[0].cells!.slash!.south), idle = structuredClone(item.layers[0].cells!.idle)
  invalidateMoveItems(m,'slash',['east'])
  expect(item.layers[0].cells!.slash).toEqual({south,north:[h]}); expect(item.layers[0].cells!.idle).toEqual(idle)
  expect(item.qa!.clips!['slash/south']).toBeDefined(); expect(item.qa!.clips!['slash/north']).toBeDefined(); expect(item.qa!.clips!['slash/east']).toBeUndefined(); expect(item.qa!.cells['slash/west/0']).toBeUndefined()
  expect(item.anchorCell).toBe('slash/south/0')
})

test('direction-scoped pose cleanup retains unrelated measured tracks byte-for-byte', () => {
  const m=fixture();m.rig.directions=[{id:'south'},{id:'east'},{id:'west',mirrorOf:'east'},{id:'north'}]
  m.rig.anchors={hand_r:{slash:{south:[[1,2]],east:[[3,4]],west:[[5,6]],north:[[7,8]]},idle:{south:[[9,10]]}}}
  const skeletons=Object.fromEntries(['south','east','west','north'].map(d=>[`slash/${d}/0`,{NOSE:{x:1,y:2,z:0}}]))
  clearMovePoseData(m.rig,skeletons,'slash',['east'])
  expect(Object.keys(skeletons)).toEqual(['slash/south/0','slash/north/0'])
  expect(m.rig.anchors.hand_r).toEqual({slash:{south:[[1,2]],north:[[7,8]]},idle:{south:[[9,10]]}})
})
