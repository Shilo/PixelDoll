import { makeImg, type Img } from '../image/png.ts';
import type { Keypoint } from './rig.ts';

/** estimate-skeleton accepts power-of-two squares. Padding preserves every source pixel and its scale. */
export function skeletonInput(source: Img): { image: Img; x: number; y: number } {
  const size = [16, 32, 64, 128, 256].find(size => size >= Math.max(source.w, source.h));
  if (!size) throw new Error('Skeleton estimation supports images up to 256 × 256.');
  const x = Math.floor((size - source.w) / 2), y = Math.floor((size - source.h) / 2);
  if (source.w === size && source.h === size) return { image: source, x, y };
  const image = makeImg(size, size);
  for (let row = 0; row < source.h; row++) image.data.set(source.data.subarray(row * source.w * 4, (row + 1) * source.w * 4), ((row + y) * size + x) * 4);
  return { image, x, y };
}
export function unpadSkeleton(keypoints: Keypoint[], input: ReturnType<typeof skeletonInput>, source: Pick<Img, 'w' | 'h'>): Keypoint[] {
  return keypoints.map(k => ({ ...k, x: (k.x * input.image.w - input.x) / source.w, y: (k.y * input.image.h - input.y) / source.h }));
}
