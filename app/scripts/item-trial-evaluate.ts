// Shared offline evaluation for retained paid output and explicitly labeled local counterfactuals.
import { base64ToBytes, binaryAlpha, type Img } from '../src/lib/image/png.ts';
import { decodePngBytes } from '../src/lib/image/pngraw.ts';
import { keyScore, KT } from '../src/lib/image/chroma.ts';
import { colorCounts } from '../src/lib/dress/palette.ts';
import { hardMaskBits } from '../src/lib/image/hard-mask.ts';
import { bandOf, cutAllow, cutGrid, cutRows, extractCell, f0Last, GATES, itemQa, paletteDistance, posedTol, postProcess, slotOf, unrotate } from '../src/lib/items/items.ts';
import { fromApi } from '../src/lib/rig/poses.ts';
import { withH4 } from '../src/lib/items/run.ts';
import type { TrialArm, TrialPacket } from '../src/ui/item-trial/trial.ts';

const decode = (png: string) => decodePngBytes(base64ToBytes(png));
const mask = (pixels: number, cut?: number[]) => {
  const values = new Uint8Array(pixels);
  for (const p of cut ?? []) values[p] = 1;
  return values;
};

/** Does not submit, alter receipts or rewrite outputs. Inputs are decoded provider-order images, including edit's anchor. */
export async function evaluateTrialFrames(packet: TrialPacket, arm: TrialArm, outputs: Img[], label = packet.id) {
  const posed = arm === 'pose' || arm === 'grid';
  let frames = [...outputs];
  const expectedResults = arm === 'edit' ? packet.targets.length + 1 : arm === 'grid' ? 1 : packet.targets.length;
  if (frames.length !== expectedResults) throw new Error(`${label} returned ${frames.length} images instead of ${expectedResults}.`);
  if (arm === 'edit') frames = frames.slice(1);
  if (arm === 'grid') frames = cutGrid(frames[0], packet.targets.length, packet.cell.w, packet.cell.h, packet.grid!.cols);
  if (arm === 'pose') frames = unrotate(frames, f0Last(packet.slot, packet.rig.rest![packet.direction]!.keypoints, packet.targets.map(target => target.poses!), packet.cell));
  const slot = slotOf(packet.slot), standing = await decode(packet.reference.layer);
  const standingPalette = [...colorCounts([standing]).keys()];
  const standingCut = mask(packet.cell.w * packet.cell.h, packet.reference.cut);
  const expected = await Promise.all(packet.targets.map(target => decode(target.expectedLayer)));
  const base = await Promise.all(packet.targets.map(target => decode(target.base)));
  const raw = [...frames];
  frames = frames.map(frame => binaryAlpha(frame));
  const stencils = arm === 'grid' ? cutGrid(await decode(packet.grid!.mask), packet.targets.length, packet.cell.w, packet.cell.h, packet.grid!.cols).map(hardMaskBits) : undefined;
  const cells = frames.map((frame, index) => {
    if (frame.w !== packet.cell.w || frame.h !== packet.cell.h) throw new Error(`${label} has an incorrectly sized frame.`);
    const target = packet.targets[index];
    const cellIndex = Number(target.key.split('/')[2]);
    const measured = packet.rig.animations.find(a => a.id === packet.anim)?.sources?.[packet.direction]?.measured?.[cellIndex];
    const skeleton = measured ? fromApi(measured, packet.cell) : undefined;
    const maxY = cutRows(packet.slot, skeleton, frame.h);
    const allow = !posed || maxY === undefined ? undefined : cutAllow(packet.rig, target.key, standingCut, frame.w, posedTol(frame.w, frame.h));
    return extractCell({ key: target.key, call: 0, base: base[index], out: frame, route: packet.key,
      band: bandOf(packet.slot, skeleton, frame.h), posed, clip: slot.band, held: slot.class === 'held',
      ...(allow ? { cut: { maxY: maxY!, allow } } : {}),
      ...(stencils ? { stencil: stencils[index] } : {}),
    });
  });
  const beforePalette = cells.map(cell => paletteDistance(standingPalette, [cell.layer]));
  postProcess(packet.rig, slot, cells, { [packet.direction]: standing }, 0);
  const qa = withH4(itemQa(packet.rig, slot, packet.key, cells, 0, posed ? GATES.keyOutsidePosed : GATES.keyOutside, 0, undefined, new Map([[packet.direction, standingPalette]])), slot, cells, { [packet.direction]: standing }, packet.rig, { [packet.direction]: await decode(packet.reference.base) }, packet.prompt);
  const perFrame = cells.map((cell, index) => {
    const target = packet.targets[index], wanted = expected[index];
    let intersection = 0, union = 0, expectedPixels = 0, retainedPixels = 0, protectedBody = 0, protectedOffKey = 0, softAlpha = 0;
    const cut = new Set(target.expectedCut ?? []);
    for (let p = 0; p < cell.mask.length; p++) {
      const i = p * 4, actual = !!cell.layer.data[i + 3], want = !!wanted.data[i + 3];
      if (want) expectedPixels++;
      if (actual) retainedPixels++;
      if (want && actual) intersection++;
      if (want || actual) union++;
      const alpha = raw[index].data[i + 3];
      if (alpha > 0 && alpha < 255) softAlpha++;
      if (base[index].data[i + 3] && !want && !cut.has(p)) {
        protectedBody++;
        if (alpha >= 128 && keyScore(packet.key, raw[index].data[i], raw[index].data[i + 1], raw[index].data[i + 2]) < KT) protectedOffKey++;
      }
    }
    return { key: target.key, expectedPixels, retainedPixels, intersection, union, iou: union ? intersection / union : 1,
      protectedBody, protectedOffKey, softAlpha, paletteDistance: beforePalette[index], keyKept: cell.keyKept, keyOutside: cell.keyOutside, offset: cell.offset };
  });
  const expectedCuts = packet.targets.map(target => mask(packet.cell.w * packet.cell.h, target.expectedCut));
  return { raw, base, expected, expectedCuts, cells, qa, perFrame };
}
