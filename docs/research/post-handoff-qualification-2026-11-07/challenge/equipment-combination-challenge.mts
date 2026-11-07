// Exhaustive finite fixture, not a claim of coverage over arbitrary real equipment.
import { readFileSync, writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { makeImg, type Img } from '../../../../app/src/lib/image/png.ts';
import { cellHash } from '../../../../app/src/lib/rig/rig.ts';
import { composeCell, withTuckVariants, bodyCutVariantCount } from '../../../../app/src/lib/compose/compose.ts';
import { recolor } from '../../../../app/src/lib/dress/dress.ts';
import type { Project, Item, DirectionName, Hex } from '../../../../app/src/lib/store/manifest.ts';

const sha = (bytes: Uint8Array | string) => createHash('sha256').update(bytes).digest('hex');
const C = 32, gray = [128, 128, 128, 255];
const names = ['a', 'b', 'c'];
const gear = [[[14, 16], [12, 8]], [[15, 17], [24, 12]], [[16, 17], [18, 24]]];
const cuts = [[[14, 16], [15, 16]], [[15, 16], [15, 17]], [[15, 17], [16, 17]]];
const variants: Record<string, Hex>[] = [{}, { a: '#dc1e28' }, { b: '#1e3cdc' }, { a: '#dc1e28', b: '#1e3cdc', c: '#1ea050' }];
const paint = (image: Img, x: number, y: number, rgba: number[]) => image.data.set(rgba, (y * C + x) * 4);
const coordinate = ([x, y]: number[], direction: DirectionName) => {
  const X = x + (direction === 'south' ? 0 : 2);
  return [direction === 'west' ? C - 1 - X : X, y];
};
const images = new Map<string, Img>();
const baseHash = `sha256:${'d'.repeat(64)}` as const;
const project: Project = { images, manifest: { format: 'pixeldoll/2', name: 'Finite combinations', app: 'qualification',
  rig: { baseItem: 'base', baseHash, cell: { w: C, h: C }, pivot: { x: 16, y: 28 }, view: 'low top-down',
    directions: [{ id: 'south' }, { id: 'east' }, { id: 'west', mirrorOf: 'east' }],
    animations: [{ id: 'idle', cells: 1, frames: [{ cell: 0, ms: 100 }], loop: true }] },
  slots: [{ id: 'body', class: 'base', z: 10 }, ...names.map((id, i) => ({ id, class: 'worn' as const, z: 20 + i }))],
  items: [], materials: [], presets: [{ id: 'default', name: 'Default', items: { body: 'base' }, variants: {} }] } };
for (const [itemIndex, id] of ['base', ...names].entries()) {
  const item: Item = { id, name: id, prompt: id, slot: id === 'base' ? 'body' : id, status: 'accepted', baseHash,
    mirror: 'flip', materials: [id], provenance: [], layers: [{ id: 'main', role: 'fg', z: itemIndex === 0 ? 10 : 19 + itemIndex, cells: { idle: {} } }],
    ...(itemIndex ? { baseCut: { idle: {} } } : {}) };
  for (const direction of ['south', 'east'] as const) {
    const image = makeImg(C, C);
    if (!itemIndex) for (let y = 10; y < 24; y++) for (let x = 10; x < 23; x++) { const [X, Y] = coordinate([x, y], direction); paint(image, X, Y, gray); }
    else for (const point of gear[itemIndex - 1]) { const [X, Y] = coordinate(point, direction); paint(image, X, Y, gray); }
    const hash = await cellHash(image); images.set(hash, image); item.layers[0].cells!.idle![direction] = [hash];
    if (itemIndex) item.baseCut!.idle![direction] = [cuts[itemIndex - 1].map(point => { const [x, y] = coordinate(point, direction); return y * C + x; })];
  }
  project.manifest.items.push(item);
  project.manifest.materials.push({ id, owner: id, label: id, ramp: ['#808080'], variants: {} });
}
const inputHash = sha(JSON.stringify({ manifest: project.manifest, images: [...images].map(([id, image]) => [id, sha(image.data)]) }));
const baked = await withTuckVariants(project);
let checked = 0, exactGolden = 0, bakedParity = 0, orderInvariant = 0, restoration = 0;
const failures: unknown[] = [];
for (let on = 0; on < 8; on++) for (const direction of ['south', 'east', 'west'] as const) for (const selection of variants) {
  const outfit: Record<string, string> = { body: 'base' };
  const expected = makeImg(C, C);
  for (let y = 10; y < 24; y++) for (let x = 10; x < 23; x++) { const [X, Y] = coordinate([x, y], direction); paint(expected, X, Y, gray); }
  for (let k = 0; k < 3; k++) if (on & (1 << k)) {
    outfit[names[k]] = names[k];
    for (const point of cuts[k]) { const [x, y] = coordinate(point, direction); paint(expected, x, y, [0, 0, 0, 0]); }
  }
  for (let k = 0; k < 3; k++) if (on & (1 << k)) {
    const hex = selection[names[k]], rgba = hex ? [parseInt(hex.slice(1, 3), 16), parseInt(hex.slice(3, 5), 16), parseInt(hex.slice(5, 7), 16), 255] : gray;
    for (const point of gear[k]) { const [x, y] = coordinate(point, direction); paint(expected, x, y, rgba); }
  }
  const rendered = composeCell(recolor(project, selection), outfit, 'idle', direction, 0);
  const exported = composeCell(recolor(baked, selection), outfit, 'idle', direction, 0);
  const reordered = { ...project, manifest: { ...project.manifest, items: [...project.manifest.items].reverse() } };
  const reorderedResult = composeCell(recolor(reordered, selection), Object.fromEntries(Object.entries(outfit).reverse()), 'idle', direction, 0);
  checked++; const golden = sha(rendered.data) === sha(expected.data), parity = sha(exported.data) === sha(rendered.data), order = sha(reorderedResult.data) === sha(rendered.data);
  exactGolden += Number(golden); bakedParity += Number(parity); orderInvariant += Number(order);
  if (!golden || !parity || !order) failures.push({ on, direction, selection, golden, parity, order });
  const bare = composeCell(recolor(project, selection), { body: 'base' }, 'idle', direction, 0);
  const originalBare = composeCell(project, { body: 'base' }, 'idle', direction, 0);
  restoration += Number(sha(bare.data) === sha(originalBare.data));
}
const report = { runtime: process.version, paidCalls: 0, states: checked, exactGolden, bakedParity, orderInvariant, restoration,
  bodyVariants: bodyCutVariantCount(project.manifest),
  inputsUnchanged: inputHash === sha(JSON.stringify({ manifest: project.manifest, images: [...images].map(([id, image]) => [id, sha(image.data)]) })),
  sourceHashes: Object.fromEntries(['compose/compose.ts', 'dress/dress.ts'].map(path => [path, sha(readFileSync(new URL(`../../../../app/src/lib/${path}`, import.meta.url)))])),
  failures,
  limits: 'Exhaustive only over this three-slot binary-alpha synthetic fixture. No renderer/native engine, flexible cloth, arbitrary real compatibility, or within-item same-RGB semantic ownership is qualified.' };
writeFileSync(fileURLToPath(new URL('equipment-combination-results.json', import.meta.url)), JSON.stringify(report, null, 2) + '\n');
console.log(JSON.stringify(report));
