// Rig contract (manifest-spec §2 `Rig`), per-cell hashes, baseHash and validation.
import { sha256 } from '../image/hash.ts';
import type { Img } from '../image/png.ts';

export type DirectionName = 'south' | 'south-east' | 'east' | 'north-east' | 'north' | 'north-west' | 'west' | 'south-west';
export const DIRECTIONS: DirectionName[] = ['south', 'south-east', 'east', 'north-east', 'north', 'north-west', 'west', 'south-west'];
export type Sha256 = `sha256:${string}`;
export type AnchorId = 'head' | 'neck' | 'hand_r' | 'hand_l' | 'hip' | 'foot_r' | 'foot_l';
export const ANCHORS: AnchorId[] = ['head', 'neck', 'hand_r', 'hand_l', 'hip', 'foot_r', 'foot_l'];

export interface RigDirection { id: DirectionName; mirrorOf?: DirectionName }
export interface RigAnimation {
  id: string;
  cells: number;
  loop: boolean;
  frames: { cell: number; ms: number }[];
  source?: { endpoint: string; mode?: string; template_animation_id?: string; action_description?: string };
}
/** points[anim][dir][cell] = [x, y] pixel index (column, row). Mirrored directions included. */
export type AnchorTrack = Record<string, Partial<Record<DirectionName, [number, number][]>>>;
export interface Rig {
  cell: { w: number; h: number };
  pivot: { x: number; y: number }; // pixel-edge coords
  directions: RigDirection[];
  animations: RigAnimation[];
  baseItem: string;
  baseHash: Sha256;
  pad?: { x: number; y: number }; // translation applied at freeze (48 px base padded to 64: x 8, y 16)
  anchors?: Partial<Record<AnchorId, AnchorTrack>>;
}

export const cellKey = (anim: string, dir: DirectionName, cell: number) => `${anim}/${dir}/${cell}`;
export const defaultMs = (anim: string) => (anim.includes('idle') ? 150 : 100);
export const playlist = (cells: number, ms: number) => Array.from({ length: cells }, (_, cell) => ({ cell, ms }));

export const cellHash = async (im: Img): Promise<Sha256> =>
  `sha256:${await sha256(new Uint8Array(im.data.buffer, im.data.byteOffset, im.data.byteLength))}`;

/** Canonical cell order: animations, then directions, then cell index (rig array order). */
export function cellKeys(rig: Pick<Rig, 'directions' | 'animations'>): string[] {
  return rig.animations.flatMap((a) => rig.directions.flatMap((d) => Array.from({ length: a.cells }, (_, i) => cellKey(a.id, d.id, i))));
}

/** sha256 over the cell hashes joined by "\n" in canonical order. */
export async function baseHashOf(rig: Pick<Rig, 'directions' | 'animations'>, hashes: Record<string, Sha256>): Promise<Sha256> {
  return `sha256:${await sha256(cellKeys(rig).map((k) => hashes[k] ?? 'missing').join('\n'))}`;
}

const ID = /^[a-z0-9][a-z0-9_-]*$/;

/** Invariants of a frozen rig. Returns human-readable errors (empty = valid). */
export function validateRig(rig: Rig, hashes?: Record<string, Sha256>): string[] {
  const e: string[] = [];
  const { w, h } = rig.cell;
  if (w !== h || (w !== 64 && w !== 32)) e.push(`cell ${w}x${h}: must be 64x64 or 32x32`);
  const { x, y } = rig.pivot;
  if (!Number.isInteger(x) || !Number.isInteger(y) || x < 0 || x > w || y < 0 || y > h) e.push(`pivot ${x},${y} outside 0..${w}`);
  const ids = rig.directions.map((d) => d.id);
  if (!rig.directions.length) e.push('no directions');
  if (new Set(ids).size !== ids.length) e.push('duplicate direction');
  for (const d of rig.directions) {
    if (!DIRECTIONS.includes(d.id)) e.push(`unknown direction ${d.id}`);
    if (d.mirrorOf && !rig.directions.some((s) => s.id === d.mirrorOf && !s.mirrorOf)) e.push(`${d.id}.mirrorOf ${d.mirrorOf} is not a generated direction of the rig`);
  }
  if (!rig.animations.length) e.push('no animations');
  if (new Set(rig.animations.map((a) => a.id)).size !== rig.animations.length) e.push('duplicate animation id');
  for (const a of rig.animations) {
    if (!ID.test(a.id)) e.push(`animation id "${a.id}" must match ${ID}`);
    if (!(a.cells >= 1)) e.push(`${a.id}: no cells`);
    if (!a.frames.length) e.push(`${a.id}: empty playlist`);
    for (const f of a.frames) if (!(f.cell >= 0 && f.cell < a.cells) || !Number.isInteger(f.ms) || f.ms <= 0) e.push(`${a.id}: bad frame ${JSON.stringify(f)}`);
  }
  if (!/^sha256:[0-9a-f]{64}$/.test(rig.baseHash)) e.push('baseHash missing');
  for (const [id, track] of Object.entries(rig.anchors ?? {}))
    for (const a of rig.animations)
      for (const d of rig.directions) {
        const pts = track?.[a.id]?.[d.id];
        if (pts && pts.length !== a.cells) e.push(`anchor ${id} ${a.id}/${d.id}: ${pts.length} points for ${a.cells} cells`);
      }
  if (hashes) for (const k of cellKeys(rig)) if (!hashes[k]) e.push(`cell ${k} missing`);
  return e;
}

export async function selfTest() {
  const im: Img = { w: 1, h: 1, data: new Uint8ClampedArray([1, 2, 3, 255]) };
  const h = await cellHash(im);
  console.assert(h === `sha256:${await sha256(new Uint8Array([1, 2, 3, 255]))}`, 'cellHash = sha256 of RGBA');
  const rig: Rig = {
    cell: { w: 64, h: 64 },
    pivot: { x: 32, y: 60 },
    directions: [{ id: 'south' }, { id: 'east' }, { id: 'west', mirrorOf: 'east' }],
    animations: [{ id: 'idle', cells: 2, loop: true, frames: playlist(2, defaultMs('idle')) }],
    baseItem: 'base',
    baseHash: 'sha256:x',
  };
  console.assert(cellKeys(rig).join() === 'idle/south/0,idle/south/1,idle/east/0,idle/east/1,idle/west/0,idle/west/1', 'cellKeys order');
  const hashes = Object.fromEntries(cellKeys(rig).map((k) => [k, h]));
  rig.baseHash = await baseHashOf(rig, hashes);
  console.assert(validateRig(rig, hashes).length === 0, `valid rig: ${validateRig(rig, hashes).join('; ')}`);
  const swapped = { ...hashes, 'idle/south/0': 'sha256:other' as Sha256 };
  console.assert((await baseHashOf(rig, swapped)) !== rig.baseHash, 'baseHash depends on cells');
  const bad: Rig = { ...rig, cell: { w: 48, h: 48 }, directions: [{ id: 'west', mirrorOf: 'east' }], animations: [{ id: 'Walk', cells: 2, loop: true, frames: [{ cell: 2, ms: 0 }] }] };
  console.assert(validateRig(bad).length === 5, `invalid rig errors: ${validateRig(bad).join('; ')}`);
  console.assert(rig.animations[0].frames[0].ms === 150 && defaultMs('walk') === 100, 'default ms');
}
