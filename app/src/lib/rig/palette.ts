// Explicit small-drift repair for an existing body palette; never a replacement for artwork or pose QA.
import type { Img } from '../image/png.ts';
import { paletteFit } from './clips.ts';

const TOLERANCE = 12, MAX_CHANGE = 16, MAX_SHARE = 0.05;
type RGB = [number, number, number];
const color = (data: Uint8ClampedArray, i: number): RGB => [data[i], data[i + 1], data[i + 2]];
const keyOf = (c: RGB) => (c[0] << 16) | (c[1] << 8) | c[2];
const distance = (a: RGB, b: RGB) => Math.max(...a.map((v, i) => Math.abs(v - b[i])));
function hue(c: RGB): number {
  const max = Math.max(...c), min = Math.min(...c), delta = max - min;
  if (!delta) return 0;
  const h = max === c[0] ? (c[1] - c[2]) / delta : max === c[1] ? (c[2] - c[0]) / delta + 2 : (c[0] - c[1]) / delta + 4;
  return (h * 60 + 360) % 360;
}
function compatible(a: RGB, b: RGB): boolean {
  const am = Math.max(...a), bm = Math.max(...b), ac = am - Math.min(...a), bc = bm - Math.min(...b);
  if (am <= 32 && bm <= 32) return true; // near-black outlines
  if (ac <= 32 && bc <= 32) return true; // neutral shades
  if (ac <= 32 || bc <= 32) return false;
  const delta = Math.abs(hue(a) - hue(b));
  return Math.min(delta, 360 - delta) <= 30;
}

export interface BodyPaletteRepair {
  frames: Img[];
  rawPaletteFit: number;
  paletteFit: number;
  rawOutliers: number;
  changedPixels: number;
  remainingOutliers: number;
  changedFrames: number[];
}
/** Correct only unique nearest same-family colors at most 16/255 per channel from the actual reference.
 * Colors already within the unchanged 12/255 gate tolerance stay untouched. Larger/ambiguous/hue-changing
 * matches stay outliers; a result need not pass QA. Refuse broad drift rather than quantizing a new design. */
export function repairBodyPalette(rest: Img, frames: Img[]): BodyPaletteRepair {
  if (!frames.length || !rest.w || !rest.h || rest.data.length !== rest.w * rest.h * 4 || frames.some(f => f.w !== rest.w || f.h !== rest.h || f.data.length !== rest.data.length)) throw new Error('Body palette repair requires matching complete frames.');
  const reference = new Map<number, RGB>();
  for (let i = 0; i < rest.data.length; i += 4) if (rest.data[i + 3]) {
    const c = color(rest.data, i); reference.set(keyOf(c), c);
  }
  if (!reference.size) throw new Error('Body palette repair needs visible reference colors.');
  const decisions = new Map<number, { outlier: boolean; replacement?: RGB }>();
  const decide = (c: RGB) => {
    const id = keyOf(c), prior = decisions.get(id);
    if (prior) return prior;
    let nearest = Infinity, choices: RGB[] = [];
    for (const candidate of reference.values()) {
      const d = distance(c, candidate);
      if (d < nearest) { nearest = d; choices = [candidate]; }
      else if (d === nearest) choices.push(candidate);
    }
    const outlier = nearest > TOLERANCE;
    const decision = { outlier, ...(outlier && nearest <= MAX_CHANGE && choices.length === 1 && compatible(c, choices[0]) ? { replacement: choices[0] } : {}) };
    decisions.set(id, decision);
    return decision;
  };
  let opaque = 0, rawOutliers = 0, changedPixels = 0;
  const changedFrames: number[] = [];
  const repaired = frames.map((frame, index) => {
    const out = { ...frame, data: new Uint8ClampedArray(frame.data) };
    let changed = 0;
    for (let i = 0; i < frame.data.length; i += 4) {
      if (!frame.data[i + 3]) continue; // preserve invisible RGB and alpha bit-for-bit
      opaque++;
      const decision = decide(color(frame.data, i));
      if (decision.outlier) rawOutliers++;
      if (decision.replacement) { out.data.set(decision.replacement, i); changed++; }
    }
    changedPixels += changed;
    if (changed) changedFrames.push(index);
    return out;
  });
  if (opaque && (rawOutliers / opaque > MAX_SHARE || changedPixels / opaque > MAX_SHARE)) throw new Error('Too much color drift for a small palette repair. Existing artwork was kept.');
  return { frames: repaired, rawPaletteFit: paletteFit(rest, frames), paletteFit: paletteFit(rest, repaired), rawOutliers, changedPixels, remainingOutliers: rawOutliers - changedPixels, changedFrames };
}
