// Body A: the S3/S4 rig (48 px body padded to 64; S/E/N; walk + authored slash, 8 frames) as a production Rig, plus its frames.
import fs from 'node:fs';
import path from 'node:path';
import { load, items, type Img } from './lib.mts';
const OUT = path.resolve(import.meta.dirname, '../out');
const req = (clip: string, d: string) => JSON.parse(fs.readFileSync(`${OUT}/s3_k1/${clip === 'walk' ? `walk_${d}_v3tpl_s7` : `slash_${d}_v3_s7`}.req.json`, 'utf8'));
const toRig = (k: Record<string, { x: number; y: number }>) => Object.entries(k).map(([label, p]) => ({ label, x: p.x / 64, y: p.y / 64 }));
export const DIRS = ['south', 'east', 'north'] as const;
export function rigA() {
  const rest: any = {}, anims: any[] = [];
  for (const d of DIRS) rest[d] = { image: 'sha256:x', keypoints: toRig(req('walk', d).rest) };
  for (const clip of ['walk', 'slash']) {
    const sources: any = {};
    for (const d of DIRS) sources[d] = { keypoints: req(clip, d).poses.map((p: any) => toRig(p)) };
    anims.push({ id: clip, cells: 8, loop: true, frames: Array.from({ length: 8 }, (_, cell) => ({ cell, ms: 100 })), sources });
  }
  return { view: 'low top-down', cell: { w: 64, h: 64 }, pivot: { x: 32, y: 60 }, directions: DIRS.map((id) => ({ id })), animations: anims, baseItem: 'base', baseHash: 'sha256:x', rest };
}
export const baseA = (d: string, clip: string, i: number): Promise<Img> => load(`${OUT}/s4_items/sk_${d}.base${(clip === 'slash' ? 8 : 0) + i}.png`);
export const restA = (d: string): Promise<Img> => load(`${OUT}/s3_k6/rot_base_${d}.png`);
/** S4's six items: exact prompts and the stored dressed keyframes (edit-animation-v2, seed 7). */
export const S4_ITEMS: Record<string, { slot: string; prompt: string }> = {
  helmet: { slot: 'head', prompt: 'a simple grey steel knight helmet covering the top and sides of the head, face visible' },
  cape: { slot: 'back', prompt: 'a long red cloth cape hanging from the shoulders behind the back, visible at both sides of the figure' },
  chest: { slot: 'torso_outer', prompt: 'a brown leather chest armor vest covering the torso' },
  boots: { slot: 'feet', prompt: 'a pair of brown leather boots on the feet, reaching up to just below the knees' },
  hair: { slot: 'hair', prompt: 'short messy dark brown hair covering the top, back and sides of the head, face visible, no hat' },
  sword: { slot: 'main_hand', prompt: 'a steel longsword' },
};
export const keyframeA = (item: string, d: string) => load(`${OUT}/s4_q3e/dress_ea2_${item}_${d}.png`);
export const padOf = (slot: string) => items.padOf(slot, 'skel', { w: 64, h: 64 });
