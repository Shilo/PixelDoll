import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { fileURLToPath, pathToFileURL } from 'node:url';
import path from 'node:path';
import { stripTypeScriptTypes } from 'node:module';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, '../../../..');
const work = path.join(here, 'temp.local');
execFileSync('git', ['check-ignore', '--', path.relative(root, work)], { cwd: root, stdio: 'pipe' });
mkdirSync(work, { recursive: true });
const revisions = { baseline: 'bb830dfb', head: '8ea08c28' };
async function load(label: keyof typeof revisions) {
  const dir = path.join(work, label), archive = path.join(work, `${label}.tar`);
  mkdirSync(dir, { recursive: true });
  execFileSync('git', ['archive', '--format=tar', '--output', archive, revisions[label], 'app/src', 'app/package.json'], { cwd: root });
  execFileSync('tar', ['-xf', archive, '-C', dir]);
  const src = path.join(dir, 'app/src');
  const modelSource = readFileSync(path.join(src, 'studio/model.ts'), 'utf8');
  const lexicalSource = modelSource.split(/\r?\n/).filter(line => line.startsWith('const OFF_HAND = ') || line.startsWith('export const heldSlotFor = ')).join('\n')
    + '\n' + modelSource.match(/export function itemNameFrom\([\s\S]*?\n}/)![0];
  const lexical = await import('data:text/javascript;base64,' + Buffer.from(stripTypeScriptTypes(lexicalSource, { mode: 'transform' })).toString('base64'));
  return {
    lexical,
    items: await import(pathToFileURL(path.join(src, 'lib/items/items.ts')).href),
    clips: await import(pathToFileURL(path.join(src, 'lib/rig/clips.ts')).href),
    design: await import(pathToFileURL(path.join(src, 'lib/items/design-consistency.ts')).href),
    png: await import(pathToFileURL(path.join(src, 'lib/image/png.ts')).href),
    poses: await import(pathToFileURL(path.join(src, 'lib/rig/poses.ts')).href),
    sourceHash: createHash('sha256').update(readFileSync(path.join(src, 'lib/items/items.ts'))).digest('hex'),
  };
}
const [baseline, head] = await Promise.all([load('baseline'), load('head')]);
const W = 64;
const rect = (image: any, x: number, y: number, w: number, h: number, rgb = [150, 90, 40]) => {
  for (let yy = y; yy < y + h; yy++) for (let xx = x; xx < x + w; xx++) image.data.set([...rgb, 255], (yy * image.w + xx) * 4);
};
const pose = head.poses.LABELS.map((label: string) => {
  const positions: Record<string, [number, number]> = {
    NOSE: [32, 10], NECK: [32, 20], 'RIGHT SHOULDER': [24, 22], 'LEFT SHOULDER': [40, 22],
    'RIGHT ELBOW': [20, 27], 'LEFT ELBOW': [44, 27], 'RIGHT ARM': [20, 35], 'LEFT ARM': [44, 35],
    'RIGHT HIP': [28, 40], 'LEFT HIP': [36, 40], 'RIGHT KNEE': [28, 50], 'LEFT KNEE': [36, 50],
    'RIGHT LEG': [28, 60], 'LEFT LEG': [36, 60], 'RIGHT EYE': [30, 9], 'LEFT EYE': [34, 9],
    'RIGHT EAR': [28, 10], 'LEFT EAR': [36, 10],
  };
  return { label, x: positions[label][0] / W, y: positions[label][1] / W };
});
const rigOf = (frames = 6, outlier = false) => {
  const requested = Array.from({ length: frames }, () => structuredClone(pose));
  const measured = structuredClone(requested);
  if (outlier) Object.assign(measured[2].find((k: any) => k.label === 'RIGHT EYE'), { x: 0.95, y: 0.95 });
  return { cell: { w: W, h: W }, pivot: { x: 32, y: 60 }, baseItem: 'base', baseHash: 'sha256:synthetic',
    directions: [{ id: 'south' }], rest: { south: { image: 'sha256:synthetic', keypoints: structuredClone(pose) } },
    animations: [{ id: 'walk', cells: frames, loop: false, frames: [], sources: { south: { route: 'skeleton-v3', reference: 'sha256:synthetic', keypoints: requested, measured, provenance: [] } } }] };
};
const cellOf = (layer: any, frame = 0, base = head.png.makeImg(W, W)) => {
  const mask = new Uint8Array(W * W); let area = 0;
  for (let p = 0; p < mask.length; p++) if (layer.data[p * 4 + 3]) { mask[p] = 1; area++; }
  return { key: `walk/south/${frame}`, call: 0, base, input: base, out: layer, layer, mask, area,
    outBand: 0, baseBand: 0, specks: 0, pinholes: 0, shifted: false, offset: [0, 0], stray: 0, posed: true };
};
function chainCase(module: typeof head, connector: boolean) {
  const image = head.png.makeImg(W, W);
  rect(image, 8, 20, 10, 10); // 100 px main part
  if (connector) rect(image, 20, 24, 1, 2); // small stylized chain link, beyond the wrist exception
  rect(image, 23, 22, 4, 5); // 20 px terminal part
  const body = head.png.makeImg(W, W);
  rect(body, 32, 15, 13, 45, [160, 110, 80]); rect(body, 32, 5, 11, 12, [160, 110, 80]);
  // A connected bent arm reaches the handle above the chain gap; body pixels do not bridge the component gaps.
  for (const [a, b] of [[[10, 24], [20, 14]], [[20, 14], [32, 20]]]) for (let i = 0; i <= 20; i++) {
    const x = Math.round(a[0] + (b[0] - a[0]) * i / 20), y = Math.round(a[1] + (b[1] - a[1]) * i / 20);
    body.data.set([160, 110, 80, 255], (y * W + x) * 4);
  }
  const cell = cellOf(image, 0, body);
  const before = cell.area;
  const rig = rigOf();
  for (const frame of [rig.rest.south.keypoints, ...rig.animations[0].sources.south.keypoints]) {
    const arm = frame.find((p: any) => p.label === 'RIGHT ARM')!;
    arm.x = 10 / W; arm.y = 24 / W;
    Object.assign(frame.find((p: any) => p.label === 'RIGHT ELBOW')!, { x: 20 / W, y: 14 / W });
    Object.assign(frame.find((p: any) => p.label === 'RIGHT SHOULDER')!, { x: 32 / W, y: 20 / W });
  }
  // This source fixture explicitly includes its terminal head; the cleanup receives the same standing design evidence.
  const source = structuredClone(cell.layer), cells = Array.from({ length: 6 }, (_, frame) => cellOf(structuredClone(image), frame, structuredClone(body)));
  const result = module.items.postProcess(rig, module.items.slotOf('main_hand'), cells, { south: source });
  return { before, after: cells[0].area, removed: result.removed / cells.length, frames: cells.length,
    allCellsUniform: cells.every(c => c.area === cells[0].area),
    terminalPixels: Array.from({ length: 5 }, (_, y) => Array.from({ length: 4 }, (_, x) => cells[0].mask[(22 + y) * W + 23 + x])).flat().reduce((n, p) => n + p, 0) };
}
function buckleCase(module: typeof head) {
  const layer = head.png.makeImg(W, W), body = head.png.makeImg(W, W), source = head.png.makeImg(W, W);
  rect(layer, 8, 20, 10, 10); rect(source, 8, 20, 10, 10);
  rect(body, 18, 20, 8, 21); rect(body, 24, 32, 4, 5);
  rect(layer, 26, 28, 1, 2); // unapproved fleck bridging across the torso
  rect(layer, 24, 32, 4, 5); // unapproved body-colored-area repaint
  const rig = rigOf();
  for (const frame of [rig.rest.south.keypoints, ...rig.animations[0].sources.south.keypoints]) {
    Object.assign(frame.find((p: any) => p.label === 'RIGHT ARM')!, { x: 10 / W, y: 24 / W });
  }
  const cells = Array.from({ length: 6 }, (_, frame) => cellOf(structuredClone(layer), frame, structuredClone(body)));
  const result = module.items.postProcess(rig, module.items.slotOf('main_hand'), cells, { south: source });
  return { after: cells[0].area, removed: result.removed / cells.length, frames: cells.length,
    allCellsUniform: cells.every(c => c.area === cells[0].area),
    unwantedBucklePixels: Array.from({ length: 5 }, (_, y) => Array.from({ length: 4 }, (_, x) => cells[0].mask[(32 + y) * W + 24 + x])).flat().reduce((n, p) => n + p, 0) };
}
function blade(frame: number, flipped: boolean, body: any) {
  const image = head.png.makeImg(W, W), [wx, wy] = [20, 35];
  for (let y = 0; y < W; y++) for (let x = 0; x < W; x++) {
    const along = flipped ? wy - (y + 0.5) : y + 0.5 - wy;
    if (along >= 0 && along <= 16 && Math.abs(x + 0.5 - wx) <= 1.3) image.data.set([150, 90, 40, 255], (y * W + x) * 4);
  }
  return cellOf(image, frame, body);
}
function actionCase(module: typeof head, outlier: boolean, defective: boolean) {
  const rig = rigOf(6, outlier);
  const body = head.png.makeImg(W, W);
  for (const box of [[24, 20, 16, 24], [27, 7, 11, 11], [19, 21, 3, 16], [43, 21, 3, 16], [20, 21, 24, 3], [27, 40, 3, 21], [35, 40, 3, 21]]) rect(body, ...box as [number, number, number, number], [160, 110, 80]);
  const cells = Array.from({ length: 6 }, (_, i) => blade(i, defective && i === 3, body));
  const result = module.items.itemQa(rig, module.items.slotOf('main_hand'), 'green', cells, 0);
  const source = rig.animations[0].sources.south;
  const sourceQa = module.clips.clipQa({ anim: 'walk', rest: body, frames: Array.from({ length: 6 }, () => body), requested: source.keypoints, measured: source.measured, stray: 0, facing: { dir: 'south', rest: rig.rest.south.keypoints } });
  return { action: module.items.isAction('walk/south', rig), status: result.qa.status,
    failures: [...result.failCalls.values()].flat(), warnings: result.warnings,
    sourceClipQa: { adherence: sourceQa.adherence, failures: sourceQa.fails, warnings: sourceQa.warnings },
    completeMeasuredPose: rig.animations[0].sources.south.measured.every((frame: any) => module.poses.hasAll(frame)),
    sourceCoordinatesInBounds: rig.animations[0].sources.south.measured.every((frame: any) => frame.every((p: any) => p.x >= 0 && p.x <= 1 && p.y >= 0 && p.y <= 1)),
    sourceBodyHash: createHash('sha256').update(body.data).digest('hex'),
    requestedPoseHash: createHash('sha256').update(JSON.stringify(source.keypoints)).digest('hex'),
    layerHashes: cells.map((c: any) => createHash('sha256').update(c.layer.data).digest('hex')) };
}
function hiddenCase(module: typeof head) {
  const body = head.png.makeImg(W, W); rect(body, 24, 10, 16, 50);
  const keys: Record<string, any> = { south: head.png.makeImg(W, W), east: head.png.makeImg(W, W), north: head.png.makeImg(W, W) };
  rect(keys.east, 20, 20, 6, 15); rect(keys.north, 27, 18, 10, 17);
  const cells = Object.entries(keys).map(([dir, image]) => ({ ...cellOf(image, 0, body), key: `rest/${dir}/0` }));
  const hidden = module.items.hiddenViews(cells, keys, 'back');
  const posed = [0, 1, 2].map(frame => cellOf(head.png.makeImg(W, W), frame, body));
  const result = module.items.itemQa(rigOf(3), module.items.slotOf('back'), 'green', posed, 0, undefined, 0, hidden);
  return { hidden: [...hidden], status: result.qa.status, failures: [...result.failCalls.values()].flat(), warnings: result.warnings,
    note: 'Same inferred visibility for a valid plain flat backpack and an invalid requested-front-strap omission; prompt is not an input of hiddenViews.' };
}
function detailCase(size: number, motifPixels: number, remaining: number) {
  const design = head.png.makeImg(size, size), frame = head.png.makeImg(size, size);
  for (const image of [design, frame]) for (let y = 15; y < 45; y++) for (let x = 15; x < 45; x++) image.data.set([30, 90, 200, 255], (y * size + x) * 4);
  for (let i = 0; i < motifPixels; i++) design.data.set([230, 190, 60, 255], ((25 + (i >> 2)) * size + 25 + (i & 3)) * 4);
  for (let i = 0; i < remaining; i++) frame.data.set([230, 190, 60, 255], ((25 + (i >> 2)) * size + 25 + (i & 3)) * 4);
  return { size, motifPixels, remaining, minPx: head.items.detailMinPx(design), lost: head.items.lostDetails(head.items.detailColors(design), frame) };
}
const front = head.png.makeImg(W, W), side = head.png.makeImg(W, W), back = head.png.makeImg(W, W);
for (const image of [front, side, back]) rect(image, 22, 25, 20, 24, [30, 90, 200]);
rect(front, 28, 32, 7, 7, [240, 235, 210]);
const charcoal = structuredClone(side); rect(charcoal, 27, 31, 9, 9, [20, 20, 20]);
const results = {
  version: 1, reviewedRange: revisions, sourceHashes: { baseline: baseline.sourceHash, head: head.sourceHash },
  provenance: 'Own synthetic fixtures with explicit intended ownership. No paid generation or external asset used.',
  heldChain: Object.fromEntries((['baseline', 'head'] as const).map(key => [key, { linked: chainCase(key === 'head' ? head : baseline, true), detachedInvalidControl: chainCase(key === 'head' ? head : baseline, false), bridgedRepaintControl: buckleCase(key === 'head' ? head : baseline) }])),
  actionOverride: Object.fromEntries((['baseline', 'head'] as const).map(key => [key, {
    valid: actionCase(key === 'head' ? head : baseline, false, false),
    defective: actionCase(key === 'head' ? head : baseline, false, true),
    defectiveOneEyeOutlier: actionCase(key === 'head' ? head : baseline, true, true),
  }])),
  asymmetricNeutralDesign: { prompt: 'a blue tunic with an ivory medallion on the front',
    headFlags: head.items.smudgedViews('torso_outer', 'a blue tunic with an ivory medallion on the front', [front, side, back]),
    baselineFlags: [front, side, back].map(im => baseline.items.designGraySmudges('torso_outer', 'a blue tunic with an ivory medallion on the front', im)) },
  charcoalDesign: { prompt: 'a blue tunic with a charcoal medallion on the front',
    baselineShare: baseline.items.grayShare(charcoal), headShare: head.items.grayShare(charcoal),
    baselineFlags: [charcoal, side, back].map(im => baseline.items.designGraySmudges('torso_outer', 'a blue tunic with a charcoal medallion on the front', im)),
    headFlags: head.items.smudgedViews('torso_outer', 'a blue tunic with a charcoal medallion on the front', [charcoal, side, back]),
    headAllViewsIntendedControl: head.items.smudgedViews('torso_outer', 'a blue tunic with charcoal medallions', [charcoal, charcoal, charcoal]),
    headUnrequestedBlotchControl: head.items.smudgedViews('torso_outer', 'a plain blue tunic', [charcoal, side, back]) },
  hiddenBack: { baseline: hiddenCase(baseline), head: hiddenCase(head) },
  lexical: ['a scutum', 'a steel sword with a scutum emblem', 'shield-breaker axe', 'a shield breaker axe'].map(prompt => ({ prompt,
    baseline: baseline.lexical.heldSlotFor(prompt), head: head.lexical.heldSlotFor(prompt) })),
  names: ['iron lantern hanging from a short chain', 'a cloak of shadows', 'a pair of leather boots'].map(prompt => ({ prompt,
    baseline: baseline.lexical.itemNameFrom(prompt), head: head.lexical.itemNameFrom(prompt) })),
  detailBounds: [detailCase(64, 16, 16), detailCase(64, 16, 0), detailCase(64, 16, 1), detailCase(128, 4, 0), detailCase(128, 16, 0)],
  poseBatchBounds: [1, 2, 3, 14, 15, 16, 29, 30, 31].map(count => ({ count, batches: head.clips.poseBatches(count),
    paddedCounts: head.clips.poseBatches(count).map((batch: any) => head.clips.paddedPoses(Array.from({ length: batch.count }, () => pose)).length) })),
};
writeFileSync(path.join(here, 'results.json'), JSON.stringify(results, null, 2) + '\n');
console.log(JSON.stringify({ output: path.join(here, 'results.json'), heldChain: results.heldChain,
  actionOverride: Object.fromEntries(Object.entries(results.actionOverride).map(([key, value]: any) => [key,
    Object.fromEntries(Object.entries(value).map(([name, result]: any) => [name, { action: result.action, status: result.status, failures: result.failures, warnings: result.warnings, sourceClipQa: result.sourceClipQa }]))])),
  charcoalDesign: results.charcoalDesign, lexical: results.lexical, names: results.names }));
