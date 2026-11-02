import { makeImg, type Img } from '../image/png.ts';
import { simAligned } from '../image/similarity.ts';
import { fixedFacingLocomotion } from '../rig/pose-review.ts';
import type { DirectionName } from '../rig/rig.ts';
import type { StandingDesignView } from './design-consistency.ts';

export interface TorsoConsistency { own: number; opposite: number; referenceSimilarity: number }
interface Chest { image: Img; x: number; y: number; width: number }

/** Isolate the visible neckline/upper chest; moving sleeves, the waist and legs cannot vote on facing. */
function chest(view: StandingDesignView): Chest | undefined {
  const { body, layer, pose } = view;
  if (body.w !== layer.w || body.h !== layer.h) throw new Error('Torso consistency checks require matching body and equipment canvases.');
  const labels = ['NECK', 'LEFT SHOULDER', 'RIGHT SHOULDER', 'LEFT HIP', 'RIGHT HIP'];
  if (labels.some(label => !pose[label] || !Number.isFinite(pose[label].x) || !Number.isFinite(pose[label].y))) return undefined;
  const neck = pose.NECK, hipY = (pose['LEFT HIP'].y + pose['RIGHT HIP'].y) / 2;
  if (hipY - neck.y < Math.max(4, layer.h * 0.08)) return undefined;
  const xs = labels.filter(label => label !== 'NECK').map(label => pose[label].x), width = Math.max(...xs) - Math.min(...xs);
  if (width < Math.max(3, layer.w * 0.06)) return undefined;
  const tolerance = Math.max(1, Math.round(layer.h / 64));
  const x0 = Math.max(0, Math.floor(Math.min(...xs) - tolerance)), x1 = Math.min(layer.w, Math.ceil(Math.max(...xs) + tolerance));
  const y0 = Math.max(0, Math.floor(neck.y - tolerance)), y1 = Math.min(layer.h, Math.ceil(neck.y + (hipY - neck.y) * 0.5));
  if (x1 <= x0 || y1 <= y0) return undefined;
  // A forearm hiding the neckline is not evidence that the garment has turned around.
  for (const side of ['LEFT', 'RIGHT']) {
    const elbow = pose[`${side} ELBOW`], wrist = pose[`${side} ARM`];
    if (!elbow || !wrist || ![elbow.x, elbow.y, wrist.x, wrist.y].every(Number.isFinite)) return undefined;
    for (let step = 0; step <= 8; step++) {
      const x = elbow.x + (wrist.x - elbow.x) * step / 8, y = elbow.y + (wrist.y - elbow.y) * step / 8;
      if (x > x0 + tolerance && x < x1 - tolerance && y >= y0 && y < y1) return undefined;
    }
  }
  const image = makeImg(layer.w, layer.h); let opaque = 0;
  for (let y = y0; y < y1; y++) for (let x = x0; x < x1; x++) {
    const p = (y * layer.w + x) * 4;
    image.data.set(layer.data.subarray(p, p + 4), p);
    if (layer.data[p + 3]) opaque++;
  }
  if (opaque < Math.max(12, Math.round(layer.w * layer.h * 12 / (64 * 64)))) return undefined;
  return { image, x: neck.x, y: neck.y, width };
}

/** Strong opposite-view appearance only. A null result does not prove semantic identity in unobservable details. */
export function torsoConsistency(anim: string, dir: DirectionName, own: StandingDesignView, opposite: StandingDesignView, target: StandingDesignView): TorsoConsistency | null {
  if (!fixedFacingLocomotion(anim) || dir !== 'south' && dir !== 'north') return null;
  const reference = chest(own), other = chest(opposite), frame = chest(target);
  if (!reference || !other || !frame) return null;
  if (frame.image.w !== reference.image.w || frame.image.h !== reference.image.h || other.image.w !== reference.image.w || other.image.h !== reference.image.h) throw new Error('Torso consistency references must share a frame size.');
  // Turning/foreshortening or doubtful projected joints make this observation ambiguous.
  if (frame.width / reference.width < 0.75 || frame.width / reference.width > 1.35 || other.width / reference.width < 0.75 || other.width / reference.width > 1.35) return null;
  const compare = (a: Chest, b: Chest) => simAligned(a.image, b.image, undefined, [Math.round(b.x - a.x), Math.round(b.y - a.y)]);
  const referenceSimilarity = compare(reference, other);
  if (referenceSimilarity > 0.88) return null;
  const ownScore = compare(frame, reference), oppositeScore = compare(frame, other);
  // The margin scales with the observable distinction between the standing designs, rather than whole-garment overlap.
  if (ownScore > 0.9 || oppositeScore < 0.9 || oppositeScore - ownScore < Math.max(0.05, 0.5 * (1 - referenceSimilarity))) return null;
  return { own: ownScore, opposite: oppositeScore, referenceSimilarity };
}
