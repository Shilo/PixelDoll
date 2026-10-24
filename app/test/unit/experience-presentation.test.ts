import { describe, expect, test } from 'vitest';
import { makeImg } from '../../src/lib/image/png.ts';
import { recolour } from '../../src/lib/dress/dress.ts';
import type { DirectionName, Item, Layer, Manifest, Project, Sha256 } from '../../src/lib/store/manifest.ts';
import { advancePlayback, buildPresentation, renderPresentation, resolveLive, resolvePreview, southStill } from '../../src/studio/experience/presentation.ts';

const bodyHash: Sha256 = 'sha256:body', gearHash: Sha256 = 'sha256:gear', restHash: Sha256 = 'sha256:rest';
function fixture(directions: DirectionName[] = ['south', 'east', 'north', 'west'], clips = ['walk', 'idle']): Project {
  const body = makeImg(2, 1); body.data.set([40, 0, 0, 255]);
  const gear = makeImg(2, 1); gear.data.set([90, 0, 0, 255], 4);
  const rest = makeImg(2, 1); rest.data.set([70, 0, 0, 255]);
  const layers: Layer[] = [{ id: 'main', role: 'fg', z: 1, cells: Object.fromEntries(clips.map(clip => [clip, Object.fromEntries(directions.map(dir => [dir, [bodyHash, bodyHash]]))])) }];
  const item = (id: string, slot: string, ls: Layer[]): Item => ({ id, slot, layers: ls, name: id, prompt: '', baseHash: bodyHash, status: 'accepted', mirror: 'flip', materials: [], provenance: [] });
  const manifest: Manifest = {
    format: 'pixeldoll/2', name: 'Offline character', app: '', materials: [], presets: [],
    rig: { cell: { w: 2, h: 1 }, pivot: { x: 1, y: 1 }, baseItem: 'base', baseHash: bodyHash, directions: directions.map(id => ({ id })), animations: clips.map(id => ({ id, cells: 2, loop: true, frames: [{ cell: 0, ms: 100 }, { cell: 1, ms: 200 }] })) },
    slots: [{ id: 'body', z: 1, class: 'base' }, { id: 'head', z: 2, class: 'rigid' }], items: [item('base', 'body', layers), item('hat', 'head', [{ id: 'main', role: 'fg', z: 2, cells: { walk: { south: [gearHash, null] }, idle: { south: [gearHash, gearHash] } } }])],
  };
  return { manifest, images: new Map([[bodyHash, body], [gearHash, gear], [restHash, rest]]) };
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

  test('missing locomotion moves with Idle, stops never loop Walk, and rest is a separate source', () => {
    const idleOnly = buildPresentation(fixture(['south'], ['idle']));
    expect(resolveLive(idleOnly, { velocity: { x: 0, y: -1 } })).toMatchObject({ moving: true, clip: 'idle', issueKey: 'walk:all' });
    const project = fixture(['south'], ['walk']);
    project.manifest.rig.rest = { south: { image: restHash, keypoints: [] } };
    const a = buildPresentation(project), moving = resolveLive(a, { velocity: { x: 0, y: -1 } });
    const stopped = resolveLive(a, { velocity: { x: 0, y: 0 }, previous: moving });
    expect(stopped).toMatchObject({ moving: false, kind: 'rest', direction: 'south', clip: null, issueKey: 'idle:all' });
    const rendered = renderPresentation(a, { head: 'hat' }, stopped);
    expect(rendered.hiddenItems.map(item => item.id)).toEqual(['hat']);
    expect(rendered.image?.data[0]).toBe(70);
    expect(rendered.image?.data[7]).toBe(0);
  });

  test('legacy still rescue can use an original outside D without changing intended directions', () => {
    const project = fixture(['east'], []);
    project.manifest.rig.rest = { south: { image: restHash, keypoints: [] } };
    const a = buildPresentation(project), result = resolveLive(a, { velocity: { x: 1, y: 0 } });
    expect(result).toMatchObject({ intendedDirection: 'east', direction: 'south', kind: 'rest', moving: true, issueKey: 'walk:all' });
    expect(a.directions).toEqual(['east']);
  });

  test('Preview preserves requested clip and exact declared facing across gaps and never substitutes another direction', () => {
    const project = fixture(['south', 'north'], ['walk']);
    delete project.manifest.items[0].layers[0].cells!.walk.north;
    project.manifest.rig.rest = { north: { image: restHash, keypoints: [] } };
    let a = buildPresentation(project);
    expect(resolvePreview(a, { clip: 'walk', direction: 'north' })).toMatchObject({ requestedClip: 'walk', intendedDirection: 'north', direction: 'north', kind: 'rest', clip: null });
    delete project.manifest.rig.rest.north;
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

  test('phase carries across facing and different timeline durations, with authored cell order and nonlooping endings', () => {
    const a = buildPresentation(fixture(['south', 'east']));
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
    const once = { ...south, sequence: { ...south.sequence!, loop: false } };
    expect(advancePlayback(once, advancePlayback(once, null, 0), 9999)).toMatchObject({ elapsedMs: 300, cell: 1 });
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
  test('original rest equipment requires exact authored cells while clip mirrors and transparent rest cells remain valid', () => {
    const project = fixture(['east', 'west'], ['walk']);
    project.manifest.rig.directions[1].mirrorOf = 'east';
    project.manifest.rig.rest = { west: { image: restHash, keypoints: [] } };
    delete project.manifest.items[0].layers[0].cells!.walk.west;
    const layer = project.manifest.items[1].layers[0];
    layer.cells = { walk: { east: [gearHash, gearHash] }, rest: { east: [gearHash] } };
    let a = buildPresentation(project);
    const walking = renderPresentation(a, { head: 'hat' }, resolvePreview(a, { clip: 'walk', direction: 'west' }));
    expect(walking.hiddenItems).toEqual([]);
    expect(walking.image?.data[0]).toBe(90); // Authorized animated mirror still draws.
    let pose = resolvePreview(a, { clip: 'idle', direction: 'west' });
    expect(pose.kind).toBe('rest');
    expect(renderPresentation(a, { head: 'hat' }, pose).hiddenItems.map(item => item.id)).toEqual(['hat']);
    layer.cells.rest.west = [null];
    a = buildPresentation(project); pose = resolvePreview(a, { clip: 'idle', direction: 'west' });
    const transparent = renderPresentation(a, { head: 'hat' }, pose);
    expect(transparent.hiddenItems).toEqual([]);
    expect(transparent.image?.data[0]).toBe(70);
    layer.cells.rest.west = [gearHash];
    a = buildPresentation(project); pose = resolvePreview(a, { clip: 'idle', direction: 'west' });
    const exact = renderPresentation(a, { head: 'hat' }, pose);
    expect(exact.hiddenItems).toEqual([]);
    expect(exact.image?.data[0]).toBe(70);
    expect(exact.image?.data[4]).toBe(90);
  });

  test('original rest fallbacks use current body variants without recolouring shared gear hashes or persisted pixels', () => {
    const raw = fixture(['south'], []);
    raw.manifest.rig.rest = { south: { image: restHash, keypoints: [] } };
    raw.manifest.materials = [
      { id: 'body-palette', owner: 'base', label: 'Body', ramp: ['#280000', '#460000'], variants: { cool: ['#002800', '#004600'] } },
      { id: 'gear-palette', owner: 'hat', label: 'Gear', ramp: ['#460000'], variants: { cool: ['#000046'] }, defaultVariant: 'cool' },
    ];
    raw.manifest.items[0].materials = ['body-palette'];
    raw.manifest.items[1].materials = ['gear-palette'];
    raw.manifest.items[1].layers[0].cells = { rest: { south: [restHash] } };
    const variants = { 'body-palette': 'cool' }, view = recolour(raw, variants);
    // The global image map now contains the gear owner's colour for this shared hash.
    expect([...view.images.get(restHash)!.data.slice(0, 3)]).toEqual([0, 0, 70]);
    const a = buildPresentation(view, { sourceProject: raw, variants });
    const pose = resolvePreview(a, { clip: 'idle', direction: 'south' });
    expect(pose.kind).toBe('rest');
    const body = renderPresentation(a, {}, pose), dressed = renderPresentation(a, { head: 'hat' }, pose);
    expect([...body.image!.data.slice(0, 3)]).toEqual([0, 70, 0]);
    expect([...dressed.image!.data.slice(0, 3)]).toEqual([0, 0, 70]);
    expect(dressed.hiddenItems).toEqual([]);
    expect([...raw.images.get(restHash)!.data.slice(0, 3)]).toEqual([70, 0, 0]);
    expect(raw.manifest.rig.rest.south!.image).toBe(restHash);
  });

  test('approved default body variants also apply to rest originals when no explicit outfit colour is selected', () => {
    const raw = fixture(['south'], []);
    raw.manifest.rig.rest = { south: { image: restHash, keypoints: [] } };
    raw.manifest.materials = [{ id: 'skin', owner: 'base', label: 'Skin', ramp: ['#460000'], variants: { moss: ['#004600'] }, defaultVariant: 'moss' }];
    raw.manifest.items[0].materials = ['skin'];
    const a = buildPresentation(recolour(raw, {}), { sourceProject: raw });
    const image = renderPresentation(a, {}, resolveLive(a, { velocity: { x: 0, y: 0 } })).image;
    expect([...image!.data.slice(0, 3)]).toEqual([0, 70, 0]);
  });

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
    project.manifest.rig.rest = { south: { image: restHash, keypoints: [] } };
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
});
