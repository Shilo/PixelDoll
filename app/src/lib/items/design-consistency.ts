import type { Img } from '../image/png.ts';
import type { Rect } from '../image/diff.ts';
import type { DirectionName } from '../rig/rig.ts';
import type { Skeleton } from '../rig/skeleton.ts';

export interface StandingDesignView { body: Img; layer: Img; pose: Skeleton }
export interface WaistBandConsistency {
  kind: 'waist-band';
  referenceDirections: DirectionName[];
  missingDirections: DirectionName[];
  targetRects: Partial<Record<DirectionName, Rect>>;
}

/** Only a wraparound waist detail is comparable across front and back; knots and collars need not match. */
export function expectsWaistBand(prompt: string): boolean {
  if (!/\b(?:belts?|waistbands?|sashes|sash)\b/i.test(prompt)) return false;
  if (/\b(?:without|no|not|absent|omit)\b.{0,35}\b(?:belt|waistband|sash)\b/i.test(prompt)) return false;
  if (/\b(?:diagonal|diagonally|shoulder|cross[- ]body|baldric|asymmetr\w*|front[- ]only|back[- ]only|one[- ]sided)\b/i.test(prompt)) return false;
  return !/\bsash\b/i.test(prompt) || /\bwaist\b|\bwaistband\b|\bobi\b/i.test(prompt);
}

interface WaistView { rect: Rect; neck: number; hips: number; width: number; center: number; bandY?: number }
const shade = (im: Img, x: number, y: number) => {
  const p = (y * im.w + x) * 4;
  return im.data[p + 3] ? (im.data[p] + im.data[p + 1] + im.data[p + 2]) / 3 : undefined;
};
function waist(view: StandingDesignView): WaistView | undefined {
  const { body, layer, pose } = view;
  if (body.w !== layer.w || body.h !== layer.h) throw new Error('Standing design checks require matching body and equipment canvases.');
  const labels = ['NECK', 'LEFT HIP', 'RIGHT HIP', 'LEFT SHOULDER', 'RIGHT SHOULDER'];
  if (labels.some(label => !pose[label] || !Number.isFinite(pose[label].x) || !Number.isFinite(pose[label].y))) return undefined;
  const neck = pose.NECK.y, hips = (pose['LEFT HIP'].y + pose['RIGHT HIP'].y) / 2, torso = hips - neck;
  if (torso < Math.max(4, body.h * 0.08)) return undefined;
  const center = (pose['LEFT HIP'].x + pose['RIGHT HIP'].x) / 2;
  const width = Math.max(Math.abs(pose['LEFT SHOULDER'].x - pose['RIGHT SHOULDER'].x), Math.abs(pose['LEFT HIP'].x - pose['RIGHT HIP'].x), body.h * 0.07);
  const x = Math.max(0, Math.floor(center - width / 2)), end = Math.min(body.w, Math.ceil(center + width / 2));
  const y = Math.max(0, Math.floor(neck + torso * 0.45)), bottom = Math.min(body.h, Math.ceil(hips + torso * 0.05));
  if (end - x < 3 || bottom <= y) return undefined;
  // Crossed forearms can hide a belt. Boundary wrists at the sides of a standing body are not occlusion evidence.
  let occluded = false;
  for (const side of ['LEFT', 'RIGHT']) {
    const a = pose[`${side} ELBOW`], b = pose[`${side} ARM`];
    if (!a || !b) continue;
    for (let t = 0; t <= 1; t += 0.2) {
      const X = a.x + (b.x - a.x) * t, Y = a.y + (b.y - a.y) * t;
      if (X > x + 1 && X < end - 1 && Y >= y && Y < bottom) occluded = true;
    }
  }
  let bodyPixels = 0, dressedPixels = 0;
  for (let Y = y; Y < bottom; Y++) for (let X = x; X < end; X++) {
    const p = (Y * body.w + X) * 4 + 3;
    if (body.data[p]) { bodyPixels++; if (layer.data[p]) dressedPixels++; }
  }
  if (bodyPixels < 6 || dressedPixels / bodyPixels < 0.8) return undefined;
  let bandY: number | undefined, best = 0;
  const scale = Math.max(1, Math.round(body.h / 64));
  for (let Y = y; Y < bottom; Y++) {
    let run = 0, longest = 0, gap = 0, bright = 0, brightSum = 0, adjacent = 0, adjacentN = 0;
    for (let X = x; X < end; X++) {
      const p = (Y * layer.w + X) * 4, rgb = layer.data.subarray(p, p + 3), value = shade(layer, X, Y);
      const light = value !== undefined && value >= 120 && Math.max(...rgb) - Math.min(...rgb) <= 80;
      if (light) { run++; gap = 0; bright++; brightSum += value!; longest = Math.max(longest, run); }
      else if (run && !gap) { run++; gap++; }
      else { run = 0; gap = 0; }
      for (const offset of [-2 * scale, 2 * scale]) {
        if (Y + offset < 0 || Y + offset >= layer.h) continue;
        const neighbor = shade(layer, X, Y + offset);
        if (neighbor !== undefined) { adjacent += neighbor; adjacentN++; }
      }
    }
    if (longest < Math.max(3, Math.ceil((end - x) * 0.5)) || bright < (end - x) * 0.6 || !adjacentN || brightSum / bright - adjacent / adjacentN < 60) continue;
    if (bright > best) { best = bright; bandY = Y; }
  }
  if (occluded && bandY === undefined) return undefined;
  return { rect: { x, y, w: end - x, h: bottom - y }, neck, hips, width, center, ...(bandY !== undefined ? { bandY } : {}) };
}

export function waistBandEvidence(view: StandingDesignView): 'present' | 'missing' | 'unknown' {
  const observed = waist(view);
  return !observed ? 'unknown' : observed.bandY !== undefined ? 'present' : 'missing';
}

/** A majority's clear light band can expose a missing wraparound detail. Ambiguous designs remain unclassified. */
export function designConsistency(prompt: string, views: Partial<Record<DirectionName, StandingDesignView>>): WaistBandConsistency | null {
  if (!expectsWaistBand(prompt)) return null;
  const observed = (Object.entries(views) as [DirectionName, StandingDesignView][]).flatMap(([dir, view]) => {
    const sample = waist(view); return sample ? [{ dir, view, sample }] : [];
  });
  const references = observed.filter(v => v.sample.bandY !== undefined);
  if (observed.length < 4 || references.length < 3 || references.length * 2 <= observed.length) return null;
  const heights = references.map(v => (v.sample.bandY! - v.sample.neck) / (v.sample.hips - v.sample.neck)).sort((a, b) => a - b);
  if (heights.at(-1)! - heights[0] > 0.3) return null;
  const position = heights[Math.floor(heights.length / 2)], missing = observed.filter(v => v.sample.bandY === undefined);
  if (!missing.length) return null;
  const targetRects: WaistBandConsistency['targetRects'] = {};
  for (const { dir, view, sample } of missing) {
    const pad = Math.max(1, Math.ceil(view.body.h / 64)), cy = sample.neck + position * (sample.hips - sample.neck);
    const x = Math.max(0, sample.rect.x - pad), y = Math.max(0, Math.floor(cy - 2 * pad));
    targetRects[dir] = { x, y, w: Math.min(view.body.w, sample.rect.x + sample.rect.w + pad) - x, h: Math.min(view.body.h, Math.ceil(cy + 2 * pad + 1)) - y };
  }
  return { kind: 'waist-band', referenceDirections: references.map(v => v.dir), missingDirections: missing.map(v => v.dir), targetRects };
}
