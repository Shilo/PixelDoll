import { expect, test } from 'vitest';
import { makeImg } from '../../src/lib/image/png.ts';
import { itemQa, slotOf, type CellOut } from '../../src/lib/items/items.ts';
import { LABELS } from '../../src/lib/rig/poses.ts';
import type { Rig } from '../../src/lib/rig/rig.ts';

const size = 48;
const pose = LABELS.map(label => ({
  label,
  x: (label.startsWith('LEFT') ? 20 : 38) / size,
  y: (label.endsWith('ARM') ? 26 : 15) / size,
}));

function heldCell(index: number, degrees: number): CellOut {
  const base = makeImg(size, size), layer = makeImg(size, size), mask = new Uint8Array(size * size);
  const angle = degrees * Math.PI / 180;
  let area = 0;
  for (let y = -8; y <= 8; y++) {
    for (let x = -8; x <= 8; x++) {
      const along = x * Math.cos(angle) + y * Math.sin(angle);
      const across = -x * Math.sin(angle) + y * Math.cos(angle);
      if (Math.abs(along) > 8 || Math.abs(across) > 1.3) continue;
      const pixel = (y + 26) * size + x + 20;
      mask[pixel] = 1;
      layer.data.set([120, 70, 30, 255], pixel * 4);
      area++;
    }
  }
  return {
    key: `walk/south/${index}`, call: 0, base, input: base, out: layer, layer, mask,
    area, outBand: 0, baseBand: 0, specks: 0, pinholes: 0,
    shifted: false, offset: [0, 0], stray: 0, posed: true,
  };
}

function check(angles: number[], timeline: number[], loop = false, missing: number[] = []) {
  const rig: Rig = {
    cell: { w: size, h: size }, pivot: { x: 24, y: 46 }, baseItem: 'base', baseHash: 'sha256:test',
    directions: [{ id: 'south' }],
    animations: [{
      id: 'walk', cells: angles.length, loop, frames: timeline.map(cell => ({ cell, ms: 100 })),
      sources: { south: { route: 'skeleton-v3', reference: 'sha256:test', keypoints: angles.map(() => pose), provenance: [] } },
    }],
  };
  const cells = angles.map((angle, index) => heldCell(index, angle)).filter((_, index) => !missing.includes(index));
  const result = itemQa(rig, slotOf('off_hand'), 'green', cells, 0);
  return { failures: [...result.failCalls.values()].flat(), minIoU: result.clips[0].minIoU, qa: result.qa, warnings: result.warnings };
}

test('a large turn from the last pose to the first is a loop observation only', () => {
  const once = check([0, 22, 44], [0, 1, 2]);
  const loop = check([0, 22, 44], [0, 1, 2], true);
  expect(once.failures).toEqual([]);
  expect(loop.failures).toEqual([]);
  expect(loop.minIoU).toBeLessThan(once.minIoU);
  expect(once.qa).not.toHaveProperty('heldLoopReviewClips');
  expect(loop.qa).toMatchObject({ status: 'warn', heldLoopReviewClips: 1, clips: { 'walk/south': { heldLoopReviewClips: 1 } } });
  expect(loop.warnings).toContain('G9 walk/south: the held item changes shape or angle when the move loops');
});

test('held QA follows reordered and repeated cells without comparing an unused cell', () => {
  const result = check([0, 44, 22, 90], [0, 2, 2, 1]);
  expect(result.failures.filter(reason => reason.startsWith('G9'))).toEqual([]);
  expect(result.minIoU).toBe(check([0, 22, 44], [0, 1, 2]).minIoU);
});

test('a missing candidate does not invent an edge between its available neighbors', () => {
  const result = check([0, 22, 44], [0, 1, 2], false, [1]);
  expect(result.failures.filter(reason => reason.startsWith('G9'))).toEqual([]);
  expect(result.minIoU).toBe(1);
});

test('a large turn on an authored transition still fails', () => {
  const result = check([0, 22, 44], [0, 2, 1]);
  expect(result.failures).toEqual([expect.stringContaining('G9 walk/south: the item turns 44°')]);
});

/** A blade drawn on one side of the wrist (pommel in the hand), pointing `degrees` from +x. */
function bladeCell(index: number, degrees: number): CellOut {
  const cell = heldCell(index, 0), angle = degrees * Math.PI / 180;
  cell.mask.fill(0); cell.layer.data.fill(0);
  let area = 0;
  for (let y = -18; y <= 18; y++) for (let x = -18; x <= 18; x++) {
    const along = (x + 0.5) * Math.cos(angle) + (y + 0.5) * Math.sin(angle), across = -(x + 0.5) * Math.sin(angle) + (y + 0.5) * Math.cos(angle);
    if (along < 0 || along > 16 || Math.abs(across) > 1.3) continue;
    const pixel = (y + 26) * size + x + 20;
    cell.mask[pixel] = 1; cell.layer.data.set([120, 70, 30, 255], pixel * 4); area++;
  }
  return { ...cell, area };
}
function checkBlades(angles: number[]) {
  const rig: Rig = {
    cell: { w: size, h: size }, pivot: { x: 24, y: 46 }, baseItem: 'base', baseHash: 'sha256:test', directions: [{ id: 'south' }],
    animations: [{ id: 'walk', cells: angles.length, loop: false, frames: [], sources: { south: { route: 'skeleton-v3', reference: 'sha256:test', keypoints: angles.map(() => pose), provenance: [] } } }],
  };
  return [...itemQa(rig, slotOf('off_hand'), 'green', angles.map((a, i) => bladeCell(i, a)), 0).failCalls.values()].flat();
}

test('a blade reversed about the hand fails G9 although its unsigned axis is unchanged', () => {
  expect(checkBlades([90, 100, 95])).toEqual([]);
  // 90 and 270 degrees share one principal axis; only the signed direction from the wrist tells them apart.
  expect(checkBlades([90, 100, 280])).toEqual(['G9 walk/south: the item turns 180° against the hand between frames']);
});
