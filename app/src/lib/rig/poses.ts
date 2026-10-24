// Authored keypoint sequences for raw skeleton-v3 actions (port of S3 spikes/api/lib/skel.mjs + s3_poses.mjs). A pose is a
// Skeleton in pixels; labels are the CHARACTER's left/right, "ARM" = wrist, "LEG" = ankle. Angles are screen degrees
// (0 = +x, 90 = down). Tables are written for south/east; north mirrors south (a -> 180 - a): in a back view the right arm is
// on the viewer's right. 8 directions (B15): south-east uses the south table, north-east the mirrored one (front / back 3/4
// views keep the arm on the same side of the screen as south / north); only the pure side view uses the east table.
import type { DirectionName, Keypoint } from './rig.ts';
import { flipSkeleton } from './skeleton.ts';
import type { Kp, Skeleton } from './skeleton.ts';

export const LABELS = ['NOSE', 'NECK', 'RIGHT SHOULDER', 'RIGHT ELBOW', 'RIGHT ARM', 'LEFT SHOULDER', 'LEFT ELBOW', 'LEFT ARM', 'RIGHT HIP', 'RIGHT KNEE', 'RIGHT LEG', 'LEFT HIP', 'LEFT KNEE', 'LEFT LEG', 'RIGHT EYE', 'LEFT EYE', 'RIGHT EAR', 'LEFT EAR'];
const UPPER = ['NOSE', 'NECK', 'RIGHT SHOULDER', 'RIGHT ELBOW', 'RIGHT ARM', 'LEFT SHOULDER', 'LEFT ELBOW', 'LEFT ARM', 'RIGHT EYE', 'LEFT EYE', 'RIGHT EAR', 'LEFT EAR'];
const HIPS = ['RIGHT HIP', 'LEFT HIP'];
export const ARMS = ['RIGHT SHOULDER', 'RIGHT ELBOW', 'RIGHT ARM', 'LEFT SHOULDER', 'LEFT ELBOW', 'LEFT ARM'];

/** px skeleton -> API keypoints (0-1, all 18 labels, z omitted so depth comes from the mannequin template: S3). */
export const toApi = (s: Skeleton, cell: { w: number; h: number }): Keypoint[] =>
  LABELS.map((l) => ({ label: l, x: +Math.min(1, Math.max(0, s[l].x / cell.w)).toFixed(4), y: +Math.min(1, Math.max(0, s[l].y / cell.h)).toFixed(4) }));
export const fromApi = (k: Keypoint[], cell: { w: number; h: number }): Skeleton => Object.fromEntries(k.map((p) => [p.label, { x: p.x * cell.w, y: p.y * cell.h, z: 0 }]));
export const hasAll = (k?: Keypoint[]) => Array.isArray(k) && k.length === LABELS.length && new Set(k.map((p) => p?.label)).size === LABELS.length && k.every((p) => p && LABELS.includes(p.label) && Number.isFinite(p.x) && Number.isFinite(p.y) && p.x >= 0 && p.x <= 1 && p.y >= 0 && p.y <= 1);

const clone = (p: Skeleton): Skeleton => Object.fromEntries(Object.entries(p).map(([l, k]) => [l, { ...k }]));
const mid = (p: Skeleton, ls: string[]) => ({ x: ls.reduce((s, l) => s + p[l].x, 0) / ls.length, y: ls.reduce((s, l) => s + p[l].y, 0) / ls.length });
/** Rotate joints about a point by deg (screen coords, + = clockwise). */
export function rotate(p: Skeleton, c: { x: number; y: number }, labels: string[], deg: number): Skeleton {
  const o = clone(p), a = (deg * Math.PI) / 180, cs = Math.cos(a), sn = Math.sin(a);
  for (const l of labels) { const dx = p[l].x - c.x, dy = p[l].y - c.y; o[l].x = c.x + dx * cs - dy * sn; o[l].y = c.y + dx * sn + dy * cs; }
  return o;
}
/** Shoulder fixed; upper arm at a1, forearm at a2 (deg), bone lengths kept. */
export function setArm(p: Skeleton, side: 'RIGHT' | 'LEFT', a1: number, a2: number): Skeleton {
  const o = clone(p), S = p[`${side} SHOULDER`], E = p[`${side} ELBOW`], W = p[`${side} ARM`], r = (d: number) => (d * Math.PI) / 180;
  const l1 = Math.hypot(E.x - S.x, E.y - S.y), l2 = Math.hypot(W.x - E.x, W.y - E.y);
  o[`${side} ELBOW`] = { ...E, x: S.x + l1 * Math.cos(r(a1)), y: S.y + l1 * Math.sin(r(a1)) };
  o[`${side} ARM`] = { ...W, x: o[`${side} ELBOW`].x + l2 * Math.cos(r(a2)), y: o[`${side} ELBOW`].y + l2 * Math.sin(r(a2)) };
  return o;
}
export const shift = (p: Skeleton, labels: string[], dx: number, dy: number): Skeleton => { const o = clone(p); for (const l of labels) { o[l].x += dx; o[l].y += dy; } return o; };

type Arm = [number, number] | null;
type Frame = [Arm, Arm, { dx?: number; dy?: number; lean?: number }?];
/** Back views (north, north-east): the south tables mirrored. */
export const backView = (dir: string) => dir.startsWith('north');
function armSeq(rest: Skeleton, dir: string, frames: Frame[]): Skeleton[] {
  const m = backView(dir) ? (a: number) => 180 - a : (a: number) => a;
  return frames.map(([r, l, o = {}]) => {
    let p = clone(rest);
    if (o.dy || o.dx) p = shift(p, UPPER, o.dx ?? 0, o.dy ?? 0);
    if (o.lean) p = rotate(p, mid(p, HIPS), UPPER, backView(dir) ? -o.lean : o.lean);
    if (r) p = setArm(p, 'RIGHT', m(r[0]), m(r[1]));
    if (l) p = setArm(p, 'LEFT', m(l[0]), m(l[1]));
    return p;
  });
}

/** A visible high guard in profile: the active wrist stays in front of the face rather than behind the head.
 * The other arm counterbalances outside the torso so image-based joint measurement can distinguish both wrists.
 * These are authored targets before generation, never substitutes for the independently measured output joints. */
function sideSlash(rest: Skeleton, dir: string): Skeleton[] {
  const brace: Arm = rest['LEFT SHOULDER'].x >= rest.NECK.x ? [65, 75] : [115, 105];
  return armSeq(rest, dir, [[null, null], [[-35, -35], brace], [[-45, -35], brace], [[0, 0], brace],
    [[35, 55], brace], [[70, 90], null], [[88, 78], null], [null, null]]);
}

/** S3 K1 tables (adherence 0.4-1.1 px, right hand moved in 100 % of slash frames). */
export const ACTIONS: Record<string, (rest: Skeleton, dir: string) => Skeleton[]> = {
  // B9: base idle authored from the rest pose (B7: the managed breathing-idle copied a hunched forward lean into the side
  // view). Breathing = head, shoulders and arms sink up to 1 px and come back; hips and legs never move (feet drift 0).
  idle: (rest) => [0, 0.5, 1, 0.5].map((dy) => shift(rest, UPPER, 0, dy)),
  // one-handed overhead slash with the character's RIGHT arm: wind-up -> overhead -> diagonal down across -> recover
  slash: (rest, dir) => dir === 'east'
    ? armSeq(rest, dir, [[[95, 80], null], [[-120, -150], null], [[-80, -60], null, { dx: 1 }], [[-20, 0], null, { dx: 1, dy: 1, lean: 6 }],
      [[30, 50], null, { dx: 1, dy: 1, lean: 8 }], [[70, 100], null, { dy: 1, lean: 4 }], [[85, 95], null], [[92, 88], null]])
    : armSeq(rest, dir, [[[100, 80], null], [[-150, -120], [70, 100]], [[-110, -80], [70, 100]], [[-30, 10], [60, 110], { dy: 1 }],
      [[40, 60], [70, 110], { dy: 1 }], [[70, 90], [80, 100], { dy: 1 }], [[90, 100], null], [[96, 92], null]]),
  // two-handed cast: raise both arms -> thrust -> release
  cast: (rest, dir) => dir === 'east'
    ? armSeq(rest, dir, [[[95, 85], [95, 85]], [[-100, -80], [-110, -90]], [[-80, -70], [-90, -80]], [[-85, -75], [-95, -85]],
      [[-5, 0], [-10, -5], { dx: 1, lean: 5 }], [[0, 5], [-5, 0], { dx: 1, lean: 5 }], [[60, 40], [65, 45]], [[90, 85], [90, 85]]])
    : armSeq(rest, dir, [[[105, 95], [75, 85]], [[150, 140], [30, 40]], [[-150, -120], [-30, -60]], [[-120, -100], [-60, -80]],
      [[30, 0], [150, 180]], [[35, 5], [145, 175], { dy: 1 }], [[70, 60], [110, 120]], [[98, 90], [82, 90]]]),
  // hit reaction, 6 frames: recoil (lean back, arms fling) -> recover
  hurt: (rest, dir) => dir === 'east'
    ? armSeq(rest, dir, [[[100, 90], null], [[-20, 30], [-10, 20], { lean: -12, dx: -1 }], [[-30, 20], [-20, 10], { lean: -16, dx: -2 }],
      [[20, 60], [30, 60], { lean: -8, dx: -1 }], [[70, 90], [70, 90], { lean: -3 }], [[92, 88], null]])
    : armSeq(rest, dir, [[[100, 85], [80, 95]], [[150, 120], [30, 60], { lean: -8, dy: -1 }], [[160, 130], [20, 50], { lean: -12, dy: -1 }],
      [[130, 110], [50, 70], { lean: -6 }], [[105, 95], [75, 85], { lean: -2 }], [[98, 90], [82, 90]]]),
  // death, 8 frames: stagger -> kneel -> fall over (upper body rotates about the hips) -> lie still. Falls toward -x.
  death: (rest, dir) => {
    const floor = Math.max(rest['RIGHT LEG'].y, rest['LEFT LEG'].y);
    const kneel = (dy: number) => {
      const p = shift(rest, [...UPPER, ...HIPS], 0, dy);
      for (const k of ['RIGHT KNEE', 'LEFT KNEE']) p[k].y = Math.min(rest[k].y + dy * 0.7, floor - 2);
      return p;
    };
    const n = backView(dir), limp = (p: Skeleton) => setArm(setArm(p, 'RIGHT', n ? 80 : 100, n ? 85 : 95), 'LEFT', n ? 100 : 80, n ? 95 : 85);
    const out = [clone(rest), rotate(limp(rest), mid(rest, HIPS), UPPER, -6), limp(kneel(4)), limp(kneel(9))];
    for (const [up, lg, dy] of [[-35, null, 10], [-65, 25, 11], [-90, 5, 12]] as [number, number | null, number][]) {
      const p = limp(kneel(dy));
      if (lg != null) for (const side of ['RIGHT', 'LEFT']) {
        const hp = p[`${side} HIP`], a = (lg * Math.PI) / 180;
        const hip = rest[`${side} HIP`], knee = rest[`${side} KNEE`], ankle = rest[`${side} LEG`];
        const thigh = Math.hypot(knee.x - hip.x, knee.y - hip.y), leg = thigh + Math.hypot(ankle.x - knee.x, ankle.y - knee.y);
        p[`${side} KNEE`] = { ...p[`${side} KNEE`], x: hp.x + thigh * Math.cos(a), y: hp.y + thigh * Math.sin(a) };
        p[`${side} LEG`] = { ...p[`${side} LEG`], x: hp.x + leg * Math.cos(a), y: hp.y + leg * Math.sin(a) };
      }
      out.push(rotate(p, mid(p, HIPS), UPPER, up));
    }
    // ponytail: S3 duplicated the last pose (smear FX on the final frame); a 1 px settle keeps the hold without a duplicate
    out.push(shift(out.at(-1)!, UPPER, 0, 1));
    return out;
  },
};
/** Moves the user can add (idle is part of every base). */
export const AUTHORED = Object.keys(ACTIONS).filter((a) => a !== 'idle');

/** Use eastern action math on the actual western rest pose, reflecting coordinates without changing art or joint labels. */
export function authoredPoses(action: string, rest: Skeleton, dir: DirectionName, width = 64, poseStyle?: 'visible-side-v1'): Skeleton[] {
  const source = ({ west: 'east', 'south-west': 'south-east', 'north-west': 'north-east' } as Partial<Record<DirectionName, DirectionName>>)[dir];
  const fn = ACTIONS[action];
  if (!fn) throw new Error(`Unknown authored action: ${action}`);
  const pose = (r: Skeleton, d: DirectionName) => action === 'slash' && poseStyle === 'visible-side-v1' && d === 'east' ? sideSlash(r, d) : fn(r, d);
  return source ? pose(flipSkeleton(rest, width), source).map((p) => flipSkeleton(p, width)) : pose(rest, dir);
}

/** Mean px distance of `labels` between requested and measured poses (pose adherence, rig QA §3.2). */
export function adherence(req: Skeleton[], got: (Skeleton | undefined)[], labels = ARMS): number {
  // Every requested observation must be measured. Dropping missing frames/joints biases the mean toward the good frames.
  if (req.length !== got.length) return Infinity;
  const d: number[] = [];
  for (const [i, r] of req.entries()) for (const l of labels.filter((l) => r[l])) {
    const p = got[i]?.[l];
    if (!p || ![r[l].x, r[l].y, p.x, p.y].every(Number.isFinite)) return Infinity;
    d.push(Math.hypot(r[l].x - p.x, r[l].y - p.y));
  }
  return d.length ? d.reduce((s, v) => s + v, 0) / d.length : Infinity;
}

export function selfTest() {
  const kp = (x: number, y: number): Kp => ({ x, y, z: 0 });
  const p: Skeleton = { 'RIGHT SHOULDER': kp(10, 10), 'RIGHT ELBOW': kp(10, 20), 'RIGHT ARM': kp(10, 30) };
  const q = rotate(p, p['RIGHT SHOULDER'], ['RIGHT ELBOW', 'RIGHT ARM'], -90);
  console.assert(Math.abs(q['RIGHT ARM'].x - 30) < 1e-9 && Math.abs(q['RIGHT ARM'].y - 10) < 1e-9, 'rotate');
  const r = setArm(p, 'RIGHT', -90, -90);
  console.assert(Math.abs(r['RIGHT ARM'].y + 10) < 1e-9 && Math.abs(r['RIGHT ARM'].x - 10) < 1e-9, 'setArm straight up');
  // a plausible rest pose: every action gives 3-15 frames, all 18 labels inside the cell, the right hand moves most on slash
  const rest: Skeleton = Object.fromEntries(LABELS.map((l, i) => [l, kp(32 + (l.startsWith('RIGHT') ? -5 : l.startsWith('LEFT') ? 5 : 0), 14 + i * 2.4)]));
  for (const [id, f] of Object.entries(ACTIONS))
    for (const dir of ['south', 'south-east', 'east', 'north-east', 'north']) {
      const seq = f(rest, dir), api = seq.map((s) => toApi(s, { w: 64, h: 64 }));
      console.assert(seq.length >= 3 && seq.length <= 15 && api.every(hasAll), `${id}/${dir}: ${seq.length} frames`);
    }
  const sl = ACTIONS.slash(rest, 'south'), moved = (l: string) => Math.max(...sl.map((s) => Math.hypot(s[l].x - rest[l].x, s[l].y - rest[l].y)));
  console.assert(moved('RIGHT ARM') > 2 * moved('LEFT ARM'), 'slash swings the right hand');
  const idle = ACTIONS.idle(rest, 'east'), still = ['RIGHT HIP', 'LEFT HIP', 'RIGHT KNEE', 'LEFT KNEE', 'RIGHT LEG', 'LEFT LEG'];
  console.assert(idle.length === 4 && idle.every((p) => still.every((l) => p[l].x === rest[l].x && p[l].y === rest[l].y)) && idle[2].NOSE.y - rest.NOSE.y === 1 && idle[2].NOSE.x === rest.NOSE.x && !AUTHORED.includes('idle'), 'idle: upper body bobs 1 px, legs still, no lean');
  const north = ACTIONS.slash(rest, 'north');
  console.assert(JSON.stringify(ACTIONS.slash(rest, 'north-east')) === JSON.stringify(north) && JSON.stringify(ACTIONS.slash(rest, 'south-east')) === JSON.stringify(sl), '8 dirs: NE = north table, SE = south table');
  console.assert(Math.sign(north[1]['RIGHT ARM'].x - rest['RIGHT SHOULDER'].x) === -Math.sign(sl[1]['RIGHT ARM'].x - rest['RIGHT SHOULDER'].x), 'north mirrors south');
  const back = fromApi(toApi(rest, { w: 64, h: 64 }), { w: 64, h: 64 });
  console.assert(adherence([rest], [back]) < 0.01 && adherence([rest], [undefined]) === Infinity, 'api round trip + adherence');
}
