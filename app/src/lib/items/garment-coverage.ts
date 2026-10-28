import type { Img } from '../image/png.ts';
import type { Rect } from '../image/diff.ts';
import type { Skeleton } from '../rig/skeleton.ts';
import { opaqueBox } from '../rig/normalize.ts';
import type { DirectionName, Rig } from '../rig/rig.ts';

export function referenceBodies(rig: Rig, images: ReadonlyMap<string, Img>): Partial<Record<DirectionName, Img>> {
  return Object.fromEntries(Object.entries(rig.rest ?? {}).map(([dir, rest]) => {
    const body = images.get(rest!.image);
    if (!body) throw new Error(`The original standing body image for ${dir} is missing. Equipment review could not finish.`);
    return [dir, body];
  }));
}

const level = (s: Skeleton | undefined, labels: string[]) => {
  const ys = labels.flatMap(l => Number.isFinite(s?.[l]?.y) ? [s![l].y] : []);
  return ys.length ? Math.max(...ys) : undefined;
};
const joints = [['NECK'], ['LEFT HIP', 'RIGHT HIP'], ['LEFT KNEE', 'RIGHT KNEE'], ['LEFT LEG', 'RIGHT LEG']];

/** Follow the approved garment's vertical extent, including hems and footwear outside its wardrobe slot. */
export function garmentBand(nominal: Rect, design: Img, rest?: Skeleton, pose?: Skeleton): Rect {
  const box = opaqueBox(design);
  if (!box) return nominal;
  const anchors: { from: number; to: number }[] = [];
  for (const labels of joints) {
    const from = level(rest, labels), to = level(pose, labels);
    if (from != null && to != null && (!anchors.length || from > anchors.at(-1)!.from)) anchors.push({ from, to });
  }
  const map = (y: number) => {
    if (!anchors.length) return y;
    const last = anchors.at(-1)!;
    if (y <= anchors[0].from) return y + anchors[0].to - anchors[0].from;
    if (y >= last.from) return y + last.to - last.from;
    const i = anchors.findIndex(p => p.from >= y), a = anchors[i - 1], b = anchors[i];
    return a.to + (y - a.from) / (b.from - a.from) * (b.to - a.to);
  };
  // Include intermediate joints when a bent pose folds the interval back onto itself.
  const ys = [box.y0, box.y1, ...anchors.filter(p => p.from > box.y0 && p.from < box.y1).map(p => p.from)].map(map);
  const tolerance = Math.max(2, Math.ceil(design.h / 32));
  const y = Math.max(0, Math.min(nominal.y, Math.floor(Math.min(...ys) - tolerance)));
  const end = Math.min(design.h, Math.max(nominal.y + nominal.h, Math.ceil(Math.max(...ys) + tolerance + 1)));
  return { ...nominal, y, h: end - y };
}

/** A disappearing lower garment can retain a stable total area and palette. Judge that region separately. */
export function missingLowerGarment(design: Img, layer: Img, rest?: Skeleton, pose?: Skeleton): boolean {
  const from = level(rest, ['LEFT KNEE', 'RIGHT KNEE']), to = level(pose, ['LEFT KNEE', 'RIGHT KNEE']);
  if (from == null || to == null) return false;
  const count = (im: Img, y0: number) => {
    let n = 0;
    for (let y = Math.max(0, Math.ceil(y0)); y < im.h; y++) for (let x = 0; x < im.w; x++) if (im.data[(y * im.w + x) * 4 + 3]) n++;
    return n;
  };
  const lower = count(design, from), total = count(design, 0);
  // Ignore tiny details. One occluded leg or foot must not fail; near-total loss must.
  return lower >= 12 && lower >= total * 0.1 && count(layer, to) < lower * 0.15;
}
