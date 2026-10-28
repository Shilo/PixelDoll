import type { Img } from '../image/png.ts';
import type { Skeleton } from '../rig/skeleton.ts';

export type FootwearSide = 'left' | 'right';

/** Missing coverage is evidence for review, not proof of a missing shoe: joints and occlusion remain uncertain. */
export function footwearWarnings(referenceBody: Img, designLayer: Img, targetBody: Img, layer: Img, rest: Skeleton, pose: Skeleton): FootwearSide[] {
  if (referenceBody.w !== designLayer.w || referenceBody.h !== designLayer.h || targetBody.w !== layer.w || targetBody.h !== layer.h) throw new Error('Footwear review requires matching body and equipment canvases.');
  const sample = (body: Img, equipment: Img, joints: Skeleton, label: string) => {
    const ankle = joints[label];
    if (!ankle || !Number.isFinite(ankle.x) || !Number.isFinite(ankle.y) || ankle.x < 0 || ankle.x > body.w || ankle.y < 0 || ankle.y > body.h) return undefined;
    const radius = Math.max(3, body.h / 16);
    let pixels = 0, covered = 0;
    // The lower disk excludes most trouser pixels, so intact pants cannot hide an uncovered foot.
    for (let y = Math.max(0, Math.ceil(ankle.y - 1)); y < Math.min(body.h, Math.ceil(ankle.y + radius)); y++) {
      for (let x = Math.max(0, Math.floor(ankle.x - radius)); x < Math.min(body.w, Math.ceil(ankle.x + radius)); x++) {
        if (Math.hypot(x + 0.5 - ankle.x, y + 0.5 - ankle.y) > radius) continue;
        const alpha = (y * body.w + x) * 4 + 3;
        if (!body.data[alpha]) continue;
        pixels++;
        if (equipment.data[alpha]) covered++;
      }
    }
    return { pixels, coverage: pixels ? covered / pixels : 0 };
  };
  const warnings: FootwearSide[] = [];
  for (const side of ['left', 'right'] as const) {
    const label = `${side.toUpperCase()} LEG`, reference = sample(referenceBody, designLayer, rest, label), target = sample(targetBody, layer, pose, label);
    // An open-toed reference or an invisible foot cannot establish missing coverage.
    if (reference && target && reference.pixels >= 3 && reference.coverage >= 0.7 && target.pixels >= 3 && target.coverage < 0.4) warnings.push(side);
  }
  return warnings;
}
