import { describe, expect, test } from 'vitest';
import { makeImg } from '../../src/lib/image/png.ts';
import type { DirectionName, Item, Layer, Manifest, Project, Sha256 } from '../../src/lib/store/manifest.ts';
import { advancePlayback, buildPresentation, renderPresentation, resolveLive, resolvePreview, southStill } from '../../src/studio/experience/presentation.ts';

const bodyHash: Sha256 = 'sha256:body', gearHash: Sha256 = 'sha256:gear';
function fixture(directions: DirectionName[] = ['south', 'east', 'north', 'west'], clips = ['walk', 'idle']): Project {
  const body = makeImg(2, 1); body.data.set([40, 0, 0, 255]);
  const gear = makeImg(2, 1); gear.data.set([90, 0, 0, 255], 4);
  const layers: Layer[] = [{ id: 'main', role: 'fg', z: 1, cells: Object.fromEntries(clips.map(clip => [clip, Object.fromEntries(directions.map(dir => [dir, [bodyHash, bodyHash]]))])) }];
  const item = (id: string, slot: string, ls: Layer[]): Item => ({ id, slot, layers: ls, name: id, prompt: '', baseHash: bodyHash, status: 'accepted', mirror: 'flip', materials: [], provenance: [] });
  const manifest: Manifest = {
    format: 'pixeldoll/2', name: 'Offline character', app: '', materials: [], presets: [],
    rig: { cell: { w: 2, h: 1 }, pivot: { x: 1, y: 1 }, baseItem: 'base', baseHash: bodyHash, directions: directions.map(id => ({ id })), animations: clips.map(id => ({ id, cells: 2, loop: true, frames: [{ cell: 0, ms: 100 }, { cell: 1, ms: 200 }] })) },
    slots: [{ id: 'body', z: 1, class: 'base' }, { id: 'head', z: 2, class: 'rigid' }], items: [item('base', 'body', layers), item('hat', 'head', [{ id: 'main', role: 'fg', z: 2, cells: { walk: { south: [gearHash, null] }, idle: { south: [gearHash, gearHash] } } }])],
  };
  return { manifest, images: new Map([[bodyHash, body], [gearHash, gear]]) };
}
const moving = { x: 1, y: 1 };

describe('production body presentation', () => {
  test('intentional E/W directions retain remembered vertical facing without missing-coverage warnings', () => {
    const a = buildPresentation(fixture(['east', 'west']));
    const east = resolveLive(a, { velocity: moving });
    const north = resolveLive(a, { velocity: { x: 0, y: 1 }, previous: east });
    const south = resolveLive(a, { velocity: { x: 0, y: -1 }, previous: north });
    expect([east.direction, north.direction, south.direction]).toEqual(['east', 'east', 'east']);
    expect([east.issue, north.issue, south.issue]).toEqual([null, null, null]);
    const west = resolveLive(a, { velocity: { x: -1, y: 0 } });
    expect(resolveLive(a, { velocity: { x: 0, y: 1 }, previous: west }).direction).toBe('west');
  });

  test('one-direction quantization is normal, while an unexpected reverse-facing gait falls back to Idle', () => {
    const one = buildPresentation(fixture(['north']));
    expect(resolveLive(one, { velocity: { x: 0, y: -1 } })).toMatchObject({ direction: 'north', clip: 'walk', issue: null });
    const project = fixture(['south', 'north']);
    delete project.manifest.items[0].layers[0].cells!.walk.south;
    const a = buildPresentation(project), presentation = resolveLive(a, { velocity: { x: 0, y: -1 } });
    expect(presentation).toMatchObject({ moving: true, intendedDirection: 'south', direction: 'south', clip: 'idle', issueKey: 'walk:south' });
  });

  test('an eight-direction missing diagonal chooses a stable neighbor with a stable coverage identity', () => {
    const project = fixture(['south', 'south-east', 'east', 'north-east', 'north', 'north-west', 'west', 'south-west']);
    delete project.manifest.items[0].layers[0].cells!.walk['north-west'];
    const a = buildPresentation(project);
    const west = resolveLive(a, { velocity: { x: -1, y: 0 } });
    const northwest = resolveLive(a, { velocity: { x: -1, y: 1 }, previous: west });
    expect(northwest).toMatchObject({ direction: 'west', intendedDirection: 'north-west', issueKey: 'walk:north-west' });
    const nearNorth = resolveLive(a, { velocity: { x: -0.9, y: 1 }, previous: northwest });
    expect(nearNorth.direction).toBe('north');
    expect(nearNorth.issueKey).toBe(northwest.issueKey);
  });

  test('missing locomotion moves with Idle, stops never loop Walk, and Idle comes before Default', () => {
    const idleOnly = buildPresentation(fixture(['south'], ['idle']));
    expect(resolveLive(idleOnly, { velocity: { x: 0, y: -1 } })).toMatchObject({ moving: true, clip: 'idle', issueKey: 'walk:all' });
    const project = fixture(['south'], ['walk']);
    const a = buildPresentation(project), moving = resolveLive(a, { velocity: { x: 0, y: -1 } });
    const stopped = resolveLive(a, { velocity: { x: 0, y: 0 }, previous: moving });
    expect(stopped).toMatchObject({ moving: false, kind: 'still', direction: 'south', clip: 'walk', cell: 0, issueKey: 'idle:all' });
    const rendered = renderPresentation(a, { head: 'hat' }, stopped);
    expect(rendered.hiddenItems).toEqual([]);
    expect([rendered.image?.data[0], rendered.image?.data[4]]).toEqual([40, 90]);
    expect(resolveLive(buildPresentation(fixture(['south'], ['default', 'idle'])), { velocity: { x: 0, y: 0 } })).toMatchObject({ kind: 'animation', clip: 'idle', issue: null });
    expect(resolveLive(buildPresentation(fixture(['south'], ['default', 'walk'])), { velocity: { x: 0, y: 0 } })).toMatchObject({ kind: 'animation', clip: 'default', issue: null });
  });

  test('Preview preserves requested clip and exact declared facing across gaps and never substitutes another direction', () => {
    const project = fixture(['south', 'north'], ['walk', 'default']);
    delete project.manifest.items[0].layers[0].cells!.walk.north;
    let a = buildPresentation(project);
    expect(resolvePreview(a, { clip: 'walk', direction: 'north' })).toMatchObject({ requestedClip: 'walk', intendedDirection: 'north', direction: 'north', kind: 'still', clip: 'default' });
    delete project.manifest.items[0].layers[0].cells!.default.north;
    a = buildPresentation(project);
    expect(resolvePreview(a, { clip: 'walk', direction: 'north' })).toMatchObject({ requestedClip: 'walk', intendedDirection: 'north', direction: null, kind: 'unavailable' });
    expect(resolvePreview(a, { clip: 'walk', direction: 'south' }).kind).toBe('animation');
  });

  test('short playlists, missing referenced image blobs, and invalid cells never certify animation coverage', () => {
    const project = fixture(['south'], ['walk']);
    project.manifest.items[0].layers[0].cells!.walk.south = [bodyHash];
    let a = buildPresentation(project);
    expect(a.animations.get('walk')?.size).toBe(0);
    expect(resolveLive(a, { velocity: { x: 0, y: -1 } }).kind).toBe('still');
    project.manifest.items[0].layers[0].cells!.walk.south = [bodyHash, 'sha256:absent'];
    a = buildPresentation(project);
    expect(a.animations.get('walk')?.size).toBe(0);
    project.manifest.rig.animations[0].frames[1].cell = 8;
    expect(buildPresentation(project).animations.get('walk')?.size).toBe(0);
    project.images.delete(bodyHash);
    expect(resolveLive(buildPresentation(project), { velocity: moving }).kind).toBe('unavailable');
  });

  test('authorized mirrors resolve resources and coverage, while cycles terminate without invented artwork', () => {
    const project = fixture(['east', 'west'], ['walk']);
    project.manifest.rig.directions[1].mirrorOf = 'east';
    delete project.manifest.items[0].layers[0].cells!.walk.west;
    let a = buildPresentation(project);
    const west = resolveLive(a, { velocity: { x: -1, y: 0 } });
    expect(west).toMatchObject({ direction: 'west', kind: 'animation', issue: null });
    expect(renderPresentation(a, {}, west).image?.data[4]).toBe(40);
    delete project.manifest.items[0].layers[0].cells!.walk.east;
    project.manifest.rig.directions[0].mirrorOf = 'west';
    a = buildPresentation(project);
    expect(a.metadataIssues).toContain('Cyclic mirror: east');
    expect(resolveLive(a, { velocity: { x: -1, y: 0 } }).kind).toBe('unavailable');
    expect(renderPresentation(a, {}, resolveLive(a, { velocity: moving })).image).toBeNull();
  });

  test('phase carries across facing and timeline durations while export-only once choices keep previewing in a loop', () => {
    const project = fixture(['south', 'east']);
    project.manifest.rig.animations[0].loop = false;
    const a = buildPresentation(project);
    const south = resolvePreview(a, { clip: 'walk', direction: 'south' });
    let clock = advancePlayback(south, null, 500);
    expect(clock.cell).toBe(0);
    clock = advancePlayback(south, clock, 150);
    expect(clock.cell).toBe(1);
    const east = resolvePreview(a, { clip: 'walk', direction: 'east' });
    const stretched = { ...east, sequence: { ...east.sequence!, duration: 600, frames: [{ cell: 1, ms: 200 }, { cell: 0, ms: 400 }] } };
    const carried = advancePlayback(stretched, clock, 0);
    expect(carried).toMatchObject({ elapsedMs: 300, cell: 0 });
    expect(advancePlayback(resolvePreview(a, { clip: 'idle', direction: 'south' }), carried, 0).elapsedMs).toBe(0);
    expect(advancePlayback(south, advancePlayback(south, null, 0), 9999)).toMatchObject({ elapsedMs: 99, cell: 0 });
    const live = resolveLive(a, { velocity: moving });
    expect(advancePlayback(live, advancePlayback(live, null, 0), 9999)).toMatchObject({ elapsedMs: 99, cell: 0 });
  });

  test('pending loading suppresses missing coverage diagnostics', () => {
    const a = buildPresentation(fixture(['south'], []), { loading: true });
    expect(resolveLive(a, { velocity: moving })).toMatchObject({ kind: 'unavailable', loading: true, issue: null, issueKey: null });
  });

  test('partial loading retains existing valid artwork until the requested sequence becomes available', () => {
    const project = fixture(['south', 'north']);
    const previous = resolveLive(buildPresentation(project), { velocity: { x: 0, y: -1 } });
    delete project.manifest.items[0].layers[0].cells!.walk.north;
    const a = buildPresentation(project, { loading: true });
    expect(resolveLive(a, { velocity: { x: 0, y: 1 }, previous })).toMatchObject({ direction: 'south', clip: 'walk', intendedDirection: 'north', issue: null });
    expect(resolveLive(buildPresentation(project), { velocity: { x: 0, y: 1 }, previous })).toMatchObject({ direction: 'north', clip: 'idle', issueKey: 'walk:north' });
  });

  test('invalid input stops simulation presentation safely and reports an input issue', () => {
    const a = buildPresentation(fixture());
    expect(resolveLive(a, { velocity: { x: NaN, y: Infinity } })).toMatchObject({ moving: false, clip: 'idle', issueKey: 'invalid-velocity' });
  });
});

describe('synchronized production equipment', () => {
  test('authored transparent cells are covered, incomplete sequences hide the entire item, and repair restores it', () => {
    const project = fixture(['south']);
    let a = buildPresentation(project), walk = resolvePreview(a, { clip: 'walk', direction: 'south' });
    expect(renderPresentation(a, { head: 'hat' }, walk, 0).image?.data[7]).toBe(255);
    expect(renderPresentation(a, { head: 'hat' }, walk, 1).hiddenItems).toEqual([]);
    delete project.manifest.items[1].layers[0].cells!.walk.south![1];
    a = buildPresentation(project); walk = resolvePreview(a, { clip: 'walk', direction: 'south' });
    const first = renderPresentation(a, { head: 'hat' }, walk, 0), second = renderPresentation(a, { head: 'hat' }, walk, 1);
    expect(first.hiddenItems.map(item => item.id)).toEqual(['hat']);
    expect(first.image?.data[7]).toBe(0);
    expect(first.issueKey).toBe(second.issueKey);
    expect(renderPresentation(a, { head: 'hat' }, resolvePreview(a, { clip: 'idle', direction: 'south' })).hiddenItems).toEqual([]);
    expect(project.manifest.items[1].id).toBe('hat');
  });

  test('explicit item coverage controls transparent cells and resolves authorized source-direction coverage', () => {
    const project = fixture(['south']);
    const hat = project.manifest.items[1]; hat.coverage = ['walk/south/0'];
    let a = buildPresentation(project), result = resolvePreview(a, { clip: 'walk', direction: 'south' });
    expect(renderPresentation(a, { head: 'hat' }, result).hiddenItems).toHaveLength(1);
    hat.coverage.push('walk/south/1');
    a = buildPresentation(project); result = resolvePreview(a, { clip: 'walk', direction: 'south' });
    expect(renderPresentation(a, { head: 'hat' }, result).hiddenItems).toHaveLength(0);
  });

  test('outfit thumbnails use the current south composite and preserve production pivots and oversized layers', () => {
    const project = fixture(['south']);
    const big = makeImg(4, 3); big.data.set([123, 0, 0, 255], (1 * 4 + 3) * 4);
    project.images.set(gearHash, big);
    Object.assign(project.manifest.items[1].layers[0], { cell: { w: 4, h: 3 }, pivot: { x: 2, y: 2 } });
    const a = buildPresentation(project), thumbnail = southStill(a);
    expect(thumbnail.kind).toBe('still');
    const dressed = renderPresentation(a, { head: 'hat' }, thumbnail), bare = renderPresentation(a, {}, thumbnail);
    expect(dressed.frame).toEqual({ w: 4, h: 3, x: 2, y: 2 });
    expect(dressed.image?.data[(1 * 4 + 3) * 4]).toBe(123);
    expect(bare.image?.data[(1 * 4 + 3) * 4]).toBe(0);
  });

  test('a worn draft still generating a view shows as loading, never as a hidden or transparent item', () => {
    const project = fixture(['south', 'east', 'west'], ['walk']);
    project.manifest.rig.directions = [{ id: 'south' }, { id: 'east' }, { id: 'west', mirrorOf: 'east' }];
    // the draft's preview: south landed, east (and so the mirrored west) still on its way, its entries null
    project.manifest.items.push({ id: 'sword', name: 'Sword', slot: 'head', prompt: '', baseHash: bodyHash, status: 'draft', mirror: 'flip', materials: [], provenance: [],
      layers: [{ id: 'main', role: 'fg', z: 2, cells: { walk: { south: [gearHash, gearHash], east: [null, null] } } }],
      coverage: ['walk/south/0', 'walk/south/1'], pending: ['walk/east/0', 'walk/east/1'] });
    const a = buildPresentation(project), at = (direction: DirectionName) => renderPresentation(a, { head: 'sword' }, resolvePreview(a, { clip: 'walk', direction }));
    expect(at('south')).toMatchObject({ loading: null, hiddenItems: [], issue: null });
    expect(at('south').image?.data[4]).toBe(90);
    for (const direction of ['east', 'west'] as const) {
      expect(at(direction)).toMatchObject({ loading: 'Sword loading — East', hiddenItems: [], issue: null });
      expect(at(direction).image?.data[4]).toBe(0);
    }
    // the same gap after generating stopped is missing: hidden and reported, not drawn as authored transparency
    delete project.manifest.items.at(-1)!.pending;
    const done = buildPresentation(project), east = renderPresentation(done, { head: 'sword' }, resolvePreview(done, { clip: 'walk', direction: 'east' }));
    expect(east.loading).toBeNull();
    expect(east.hiddenItems.map(item => item.id)).toEqual(['sword']);
  });
});
