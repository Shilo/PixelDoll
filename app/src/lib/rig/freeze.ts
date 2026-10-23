// Source frames -> rig candidate (normalized cells, mirrors, pivot, hashes, QA) and keypoints -> anchor tracks.
import { makeImg, type Img } from '../image/png.ts';
import { normalize, opaqueBox, feetY, pivotOf, type Box } from './normalize.ts';
import { planDirections, flipH, flipX, type DirMode } from './mirror.ts';
import { ANCHORS, baseHashOf, cellHash, cellKey, defaultMs, playlist, validateRig, type AnchorTrack, type DirectionName, type Rig, type RigAnimation, type RigDirection, type Sha256 } from './rig.ts';
import { anchorsOf, flipSkeleton, PATCH_R, refineAnchor, type Skeleton } from './skeleton.ts';

export interface SourceAnim { id: string; dirs: Partial<Record<DirectionName, Img[]>>; source?: RigAnimation['source'] }
export interface Cell { img: Img; hash: Sha256; box: Box | null; mirrorOf?: DirectionName; offset: [number, number] }
export interface Built { rig: Rig; cells: Record<string, Cell>; errors: string[]; warnings: string[]; pivotFrom: string }

export const HEADROOM_MIN = 6;

export async function buildRig(anims: SourceAnim[], { size = 64, mode = '4', directions }: { size?: number; mode?: DirMode; directions?: RigDirection[] } = {}): Promise<Built> {
  const errors: string[] = [], warnings: string[] = [];
  const dirsOf = (a: SourceAnim) => (Object.keys(a.dirs) as DirectionName[]).filter((d) => a.dirs[d]?.length);
  const common = anims.length ? dirsOf(anims[0]).filter((d) => anims.every((a) => dirsOf(a).includes(d))) : [];
  for (const a of anims) for (const d of dirsOf(a)) if (!common.includes(d)) warnings.push(`${a.id}/${d}: direction missing in other animations, dropped`);
  const { dirs, missing } = directions ? { dirs: directions.map(d => ({ ...d })), missing: directions.filter(d => !d.mirrorOf && !common.includes(d.id)).map(d => d.id) } : planDirections(mode, common);
  if (directions && missing.length) errors.push(`selected directions have missing frames: ${missing.join(', ')}`);
  if (missing.length) warnings.push(`directions not available for the ${mode}-dir plan: ${missing.join(', ')}`);

  const cells: Record<string, Cell> = {};
  const animations: RigAnimation[] = [];
  for (const a of anims) {
    const generated = dirs.filter(d => !d.mirrorOf).map(d => d.id);
    const counts = generated.map(d => a.dirs[d]?.length ?? 0);
    const n = counts.length ? Math.min(...counts) : 0;
    if (!n) errors.push(`${a.id}: no frames for the selected directions`);
    if (new Set(counts).size > 1) errors.push(`${a.id}: frame count differs between directions (${generated.map((d, i) => `${d} ${counts[i]}`).join(', ')})`);
    animations.push({ id: a.id, cells: n, loop: true, frames: playlist(n, defaultMs(a.id)), ...(a.source ? { source: a.source } : {}) });
    for (const d of dirs.filter((d) => !d.mirrorOf)) {
      let semi = 0;
      for (let i = 0; i < n; i++) {
        const src = a.dirs[d.id]![i];
        if (!src) { errors.push(`${cellKey(a.id, d.id, i)}: missing frame`); continue; }
        const r = normalize(src, size, size);
        semi += r.semiAlpha;
        if (r.cutPx) errors.push(`${cellKey(a.id, d.id, i)}: crop ${src.w}x${src.h} -> ${size} cuts ${r.cutPx} opaque px`);
        cells[cellKey(a.id, d.id, i)] = { img: r.img, hash: await cellHash(r.img), box: opaqueBox(r.img), offset: r.offset };
      }
      if (semi) warnings.push(`${a.id}/${d.id}: ${semi} semi-transparent px binarized (alpha >= 128 kept)`);
    }
    for (const d of dirs.filter((d) => d.mirrorOf))
      for (let i = 0; i < n; i++) {
        const s = cells[cellKey(a.id, d.mirrorOf!, i)];
        if (!s) continue;
        const img = flipH(s.img);
        cells[cellKey(a.id, d.id, i)] = { img, hash: await cellHash(img), box: opaqueBox(img), mirrorOf: d.mirrorOf, offset: s.offset };
      }
  }

  // pivot from idle/south/0, else the first animation / direction
  const pa = animations.find((a) => a.id === 'idle') ?? animations[0];
  const pd = dirs.find((d) => d.id === 'south') ?? dirs[0];
  const pivotFrom = pa && pd ? cellKey(pa.id, pd.id, 0) : '';
  if (!directions && pivotFrom && pivotFrom !== 'idle/south/0') warnings.push(`no idle/south/0: pivot taken from ${pivotFrom}`);
  const ref = cells[pivotFrom]?.img;
  const pivot = ref ? pivotOf(ref) : { x: Math.floor(size / 2), y: size };
  for (const a of animations)
    for (const d of dirs) {
      const cs = Array.from({ length: a.cells }, (_, i) => cells[cellKey(a.id, d.id, i)]).filter(Boolean);
      const drift = Math.max(0, ...cs.map((c) => Math.abs(feetY(c.img) - pivot.y)));
      if (drift > 1) warnings.push(`${a.id}/${d.id}: feet drift ${drift} px from pivot y ${pivot.y}`);
      const head = Math.min(...cs.map((c) => c.box?.y0 ?? size));
      if (head < HEADROOM_MIN) warnings.push(`${a.id}/${d.id}: headroom ${head} px < ${HEADROOM_MIN} (hats/hair will clip)`);
      if (cs.some((c) => !c.box)) warnings.push(`${a.id}/${d.id}: empty cell`);
    }

  const off = Object.values(cells)[0]?.offset;
  const rig: Rig = { cell: { w: size, h: size }, pivot, directions: dirs, animations, baseItem: 'base', baseHash: 'sha256:', ...(off && (off[0] > 0 || off[1] > 0) ? { pad: { x: off[0], y: off[1] } } : {}) };
  const hashes = Object.fromEntries(Object.entries(cells).map(([k, c]) => [k, c.hash]));
  rig.baseHash = await baseHashOf(rig, hashes);
  errors.push(...validateRig(rig, hashes));
  return { rig, cells, errors, warnings, pivotFrom };
}

export interface TrackStat { anchor: string; animDir: string; maxDev: number; meanSad: number; points: [number, number][] }

/**
 * Anchor tracks: per generated direction the keyframe is the pivot animation's cell 0; every cell = keyframe anchor + patch-tracked
 * translation seeded by the cell's keypoint anchor. Mirrored directions flip the source track. maxDev = max |tracked − keypoint|.
 */
export function anchorTracks(b: Built, skel: Record<string, Skeleton | undefined>): { anchors: Rig['anchors']; stats: TrackStat[] } {
  const { rig, cells } = b;
  const keyAnim = b.pivotFrom.split('/')[0];
  const anchors: NonNullable<Rig['anchors']> = {};
  const stats: TrackStat[] = [];
  for (const d of rig.directions.filter((d) => !d.mirrorOf)) {
    const key = cells[cellKey(keyAnim, d.id, 0)];
    const keyA = key && skel[key.hash] ? anchorsOf(skel[key.hash]!) : null;
    if (!keyA) continue;
    for (const id of ANCHORS) {
      const at = keyA[id];
      if (!at) continue;
      const track = (anchors[id] ??= {} as AnchorTrack);
      for (const a of rig.animations) {
        if (!cells[cellKey(a.id, d.id, 0)]) continue;
        const pts: [number, number][] = [];
        let maxDev = 0, sad = 0;
        for (let i = 0; i < a.cells; i++) {
          const c = cells[cellKey(a.id, d.id, i)];
          const s = c && skel[c.hash];
          const seed = s ? anchorsOf(s)[id] : undefined;
          const r = refineAnchor(key.img, at, c?.img ?? makeImg(rig.cell.w, rig.cell.h), seed, PATCH_R[id]);
          pts.push(r.at);
          sad += r.sad;
          if (seed) maxDev = Math.max(maxDev, Math.abs(r.at[0] - seed[0]), Math.abs(r.at[1] - seed[1]));
        }
        (track[a.id] ??= {})[d.id] = pts;
        stats.push({ anchor: id, animDir: `${a.id}/${d.id}`, maxDev, meanSad: +(sad / a.cells).toFixed(1), points: pts });
      }
    }
  }
  for (const d of rig.directions.filter((d) => d.mirrorOf))
    for (const track of Object.values(anchors))
      for (const a of rig.animations) {
        const src = track[a.id]?.[d.mirrorOf!];
        if (src) track[a.id]![d.id] = src.map(([x, y]) => [flipX(x, rig.cell.w), y]);
      }
  return { anchors, stats };
}

/** Skeleton for any cell; mirrored cells reuse the flipped source skeleton. */
export function skeletonOf(b: Built, key: string, skel: Record<string, Skeleton | undefined>): Skeleton | undefined {
  const c = b.cells[key];
  if (!c) return;
  if (!c.mirrorOf) return skel[c.hash];
  const [a, , i] = key.split('/');
  const s = skel[b.cells[cellKey(a, c.mirrorOf, +i)]?.hash];
  return s && flipSkeleton(s, b.rig.cell.w);
}

export async function selfTest() {
  // a 4x8 "body" with feet at row 59 on a 64 canvas, walking 1 px right per frame
  const frame = (dx: number, top = 10) => {
    const im = makeImg(64, 64);
    for (let y = top; y < 60; y++) for (let x = 28 + dx; x < 32 + dx; x++) im.data.set([(x - dx) * 7, y * 5, 99, 255], (y * 64 + x) * 4);
    return im;
  };
  const anims: SourceAnim[] = [
    { id: 'idle', dirs: { south: [frame(0), frame(0)], east: [frame(0), frame(1)] } },
    { id: 'walk', dirs: { south: [frame(0), frame(1), frame(2)], east: [frame(0), frame(1), frame(2, 3)] } },
  ];
  const b = await buildRig(anims, { mode: '4' });
  console.assert(b.errors.length === 0, `no errors: ${b.errors.join('; ')}`);
  console.assert(b.rig.directions.map((d) => d.id).join() === 'south,east,west' && b.rig.pivot.x === 32 && b.rig.pivot.y === 60, 'dirs + pivot');
  console.assert(b.warnings.some((w) => w.includes('north')) && b.warnings.some((w) => w.startsWith('walk/east: headroom 3')), `warnings: ${b.warnings.join('; ')}`);
  console.assert(Object.keys(b.cells).length === 15 && b.cells['walk/west/1'].mirrorOf === 'east' && b.cells['walk/west/1'].box?.x0 === 64 - 33, 'mirrored cells');
  const again = await buildRig(anims, { mode: '4' });
  console.assert(again.rig.baseHash === b.rig.baseHash && /^sha256:[0-9a-f]{64}$/.test(b.rig.baseHash), 'baseHash deterministic');
  const bad = await buildRig([{ id: 'walk', dirs: { south: [frame(0), frame(1)], east: [frame(0)] } }]);
  console.assert(bad.errors.some((e) => e.includes('frame count')), 'frame count mismatch is an error');
  // anchors: fake skeleton = neck at the body top-centre of each cell
  const skel: Record<string, Skeleton> = {};
  for (const c of Object.values(b.cells)) if (!c.mirrorOf) skel[c.hash] = { NECK: { x: (c.box!.x0 + c.box!.x1 + 1) / 2, y: 20, z: 0 } };
  const { anchors, stats } = anchorTracks(b, skel);
  console.assert(anchors?.neck?.walk?.east?.map((p) => p[0]).join() === '30,31,32', `tracked neck x ${anchors?.neck?.walk?.east}`);
  console.assert(anchors?.neck?.walk?.west?.map((p) => p[0]).join() === '33,32,31', 'mirrored track');
  console.assert(stats.every((s) => s.maxDev === 0), 'tracked == keypoints on rigid motion');
  console.assert(skeletonOf(b, 'idle/west/0', skel)?.NECK.x === 64 - 30, 'mirrored skeleton');
}
