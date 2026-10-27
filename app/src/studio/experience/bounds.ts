import { bakedFrame, equipped, hiddenSlots, layerFrame, rigFrame, shownItems, type Frame } from '../../lib/compose/compose.ts';
import type { Img } from '../../lib/image/png.ts';
import type { Preset, Project } from '../../lib/store/manifest.ts';

interface Pixels { left: number; top: number; right: number; bottom: number }
// Images are immutable project assets. Replacing an image invalidates its entry
// naturally; palette copies have their own identities. Null means transparent.
const pixels = new WeakMap<Img, Pixels | null | false>();
function paintedPixels(image: Img): Pixels | null | false {
  const cached = pixels.get(image);
  if (cached !== undefined) return cached;
  const { w, h, data } = image;
  if (!Number.isInteger(w) || !Number.isInteger(h) || w <= 0 || h <= 0 || !data || data.length !== w * h * 4) {
    pixels.set(image, false); return false;
  }
  let left = w, top = h, right = 0, bottom = 0;
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    if (!data[(y * w + x) * 4 + 3]) continue;
    left = Math.min(left, x); top = Math.min(top, y);
    right = Math.max(right, x + 1); bottom = Math.max(bottom, y + 1);
  }
  const bounds = right ? { left, top, right, bottom } : null;
  pixels.set(image, bounds);
  return bounds;
}
const validFrame = (frame: Frame): boolean => Number.isInteger(frame.w) && frame.w > 0 && Number.isInteger(frame.h) && frame.h > 0 && Number.isFinite(frame.x) && Number.isFinite(frame.y);

/** Stable painted union of every pose of the current visible outfit, including
 * original body rests. Frame.x/y locate the pivot within this union, exactly as
 * bakedFrame does. Use only for fitting; render/export still use the full frame.
 * Call on project/outfit changes, never once per animation frame. */
export function paintedFrame(project: Project, items: Preset['items']): Frame {
  const m = project.manifest;
  const baked = bakedFrame(m), rig = rigFrame(m.rig);
  // If even the baked metadata is broken, keep a finite rig-sized fallback.
  const fallback = validFrame(baked) ? baked : validFrame(rig) ? rig : { w: 64, h: 64, x: 32, y: 64 };
  if (!validFrame(baked) || !validFrame(rig)) return fallback;
  const mirrored = m.rig.directions.some(direction => !!direction.mirrorOf);
  const on = equipped(m, items), hidden = hiddenSlots(m, on);
  let left = Infinity, top = Infinity, right = -Infinity, bottom = -Infinity;
  function include(image: Img | undefined, frame: Frame): boolean {
    if (!image || image.w !== frame.w || image.h !== frame.h || !validFrame(frame)) return false;
    const bounds = paintedPixels(image);
    if (bounds === false) return false;
    if (!bounds) return true;
    const x0 = mirrored ? Math.min(bounds.left, frame.w - bounds.right) : bounds.left;
    const x1 = mirrored ? Math.max(bounds.right, frame.w - bounds.left) : bounds.right;
    left = Math.min(left, x0 - frame.x); right = Math.max(right, x1 - frame.x);
    top = Math.min(top, bounds.top - frame.y); bottom = Math.max(bottom, bounds.bottom - frame.y);
    return true;
  }
  for (const item of shownItems(m, on)) {
    if (hidden.has(item.slot)) continue;
    if (!m.slots.some(slot => slot.id === item.slot)) return fallback;
    for (const layer of item.layers) {
      const frame = layerFrame(m.rig, layer);
      if (!validFrame(frame)) return fallback;
      for (const directions of Object.values(layer.cells ?? {})) {
        if (!directions || typeof directions !== 'object' || Array.isArray(directions)) return fallback;
        for (const cells of Object.values(directions)) {
          if (!Array.isArray(cells)) return fallback;
          for (const hash of cells) {
            if (hash === null) continue; // Authored transparent cell.
            if (typeof hash !== 'string' || !include(project.layerImages?.get(layer)?.get(hash) ?? project.images.get(hash), frame)) return fallback;
          }
        }
      }
    }
  }
  return Number.isFinite(left) ? { w: right - left, h: bottom - top, x: left === 0 ? 0 : -left, y: top === 0 ? 0 : -top } : fallback;
}

/** Fit the complete pivot-relative frame. Oversize gear and large imported
 * sprites must not cross controls. Prefer whole device pixels; a source larger
 * than the available stage is minified with nearest-neighbor sampling. */
export function actorScale(frame: {w:number;h:number;x:number;y:number}, area: {width:number;height:number}, dpr=1, preferred=6, anchorRatio=.77): number {
  const density = Math.max(1,dpr)
  const fit = Math.max(0,Math.min(preferred,
    area.width*.5/Math.max(1,frame.x),
    area.width*.5/Math.max(1,frame.w-frame.x),
    frame.y > 0 ? area.height*anchorRatio/frame.y : Infinity,
    frame.h-frame.y > 0 ? area.height*(1-anchorRatio)/(frame.h-frame.y) : Infinity));
  return fit*density<1 ? fit : Math.floor(fit*density)/density;
}
