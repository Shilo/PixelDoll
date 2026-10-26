// Offline: CC0 mocap (Quaternius UAL1.glb) -> PixelLab animate-with-skeleton-v3 keypoint sequences for one body + previews.
// No network. Import build()/strip() (x27/moves.mts), or run it for a quick check: node mocap/mocap.mts (spikes/api).
// Env: UAL1_GLB overrides the library path; MOCAP_BODY picks the body export in out/c25 (default c27man.json).
import { writeFileSync, mkdirSync, readFileSync } from 'node:fs';
import { strict as assert } from 'node:assert';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { parseGlb, worldMatrices, animByName, animDuration, xformPoint, xformDir, sub, add, mul, dot, cross, norm, len, type V3, type M4 } from './glb.mts';
import { encodePngBytes } from '../../../app/src/lib/image/pngraw.ts';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
export const OUT = join(ROOT, 'out', 'mocap');
// Quaternius Universal Animation Library (CC0, License.txt beside it); not committed (23 MB).
const GLB = process.env.UAL1_GLB ?? 'C:/Users/shilo/Downloads/photon-fusion-godot-starter_3.0.0.407/3rdparty/universal_animation_library/UAL1.glb';

export const LABELS = ['NOSE', 'NECK', 'RIGHT SHOULDER', 'RIGHT ELBOW', 'RIGHT ARM', 'LEFT SHOULDER', 'LEFT ELBOW', 'LEFT ARM', 'RIGHT HIP', 'RIGHT KNEE', 'RIGHT LEG',
  'LEFT HIP', 'LEFT KNEE', 'LEFT LEG', 'RIGHT EYE', 'LEFT EYE', 'RIGHT EAR', 'LEFT EAR'] as const;
type Label = typeof LABELS[number];
// Bone joints; the hip label sits on the thigh bone head (pelvis is the parent, centered).
const BONE: Partial<Record<Label, string>> = {
  NECK: 'neck_01', 'RIGHT SHOULDER': 'upperarm_r', 'RIGHT ELBOW': 'lowerarm_r', 'RIGHT ARM': 'hand_r', 'LEFT SHOULDER': 'upperarm_l', 'LEFT ELBOW': 'lowerarm_l', 'LEFT ARM': 'hand_l',
  'RIGHT HIP': 'thigh_r', 'RIGHT KNEE': 'calf_r', 'RIGHT LEG': 'foot_r', 'LEFT HIP': 'thigh_l', 'LEFT KNEE': 'calf_l', 'LEFT LEG': 'foot_l',
};
// Face points as [lateral toward the character's LEFT, up, forward], meters from the Head bone origin, measured from the head
// mesh (Head-weighted verts: x ±0.087, y 1.551..1.829, z -0.112..0.118; Head bone at y 1.569).
const FACE: Partial<Record<Label, V3>> = {
  NOSE: [0, 0.10, 0.115], 'RIGHT EYE': [-0.035, 0.14, 0.10], 'LEFT EYE': [0.035, 0.14, 0.10], 'RIGHT EAR': [-0.087, 0.11, 0], 'LEFT EAR': [0.087, 0.11, 0],
};

export interface Kp { label: string; x: number; y: number; depth?: number; z_index?: number }

// ---------- mocap ----------
const g = parseGlb(GLB);
const nodeId = (n: string) => { const i = g.json.nodes.findIndex((x: any) => x.name === n); if (i < 0) throw new Error(`bone ${n} missing`); return i; };
const pos = (W: M4[], n: string) => xformPoint(W[nodeId(n)], [0, 0, 0]);
export const clipLength = (anim: string) => animDuration(g, animByName(g, anim));

// Character basis from the rest (T) pose: up=+Y (glTF), right = upperarm_r - upperarm_l, forward = up x right.
const REST = worldMatrices(g, null, 0);
const UP: V3 = [0, 1, 0];
const flat = (v: V3): V3 => [v[0], 0, v[2]];
const RIGHT = norm(flat(sub(pos(REST, 'upperarm_r'), pos(REST, 'upperarm_l'))));
const FWD = cross(UP, RIGHT);
assert(dot(sub(pos(REST, 'ball_l'), pos(REST, 'foot_l')), FWD) > 0, 'forward axis should point toward the toes');
const headRest = REST[nodeId('Head')];
const toHeadLocal = (w: V3): V3 => { // inverse of the (orthonormal) rest head rotation = transpose
  const cols = [xformDir(headRest, [1, 0, 0]), xformDir(headRest, [0, 1, 0]), xformDir(headRest, [0, 0, 1])].map(norm);
  return [dot(cols[0], w), dot(cols[1], w), dot(cols[2], w)];
};
const FACE_LOCAL = Object.fromEntries(Object.entries(FACE).map(([k, [l, u, f]]) => [k, toHeadLocal(add(add(mul(RIGHT, -l), mul(UP, u)), mul(FWD, f)))])) as Record<string, V3>;

// ---------- camera ----------
// Orthographic, camera on horizontal direction H from the character, raised by `elev`. Screen x = p.SX, y down = -p.CU,
// depth (toward camera) = p.V. east: camera on the character's right, yawed toward the front by the measured turn.
export type Dir = 'south' | 'east' | 'north';
interface Cam { SX: V3; CU: V3; V: V3 }
function camera(dir: Dir, elevDeg: number, yawDeg: number): Cam {
  const e = elevDeg * Math.PI / 180, y = yawDeg * Math.PI / 180;
  const H = norm(dir === 'south' ? FWD : dir === 'north' ? mul(FWD, -1) : add(mul(RIGHT, Math.cos(y)), mul(FWD, Math.sin(y))));
  return { SX: cross(UP, H), V: add(mul(H, Math.cos(e)), mul(UP, Math.sin(e))), CU: sub(mul(UP, Math.cos(e)), mul(H, Math.sin(e))) };
}
const project = (c: Cam, p: V3) => ({ x: dot(p, c.SX), y: -dot(p, c.CU), z: dot(p, c.V) });

// ---------- body ----------
export const body = JSON.parse(readFileSync(join(ROOT, 'out', 'c25', process.env.MOCAP_BODY ?? 'c27man.json'), 'utf8'));
const CELL = body.rig.cell.w;
const restPx = (dir: string) => Object.fromEntries(body.rig.rest[dir].keypoints.map((k: Kp) => [k.label, { x: k.x * CELL, y: k.y * CELL }])) as Record<Label, { x: number; y: number }>;

/** Low top-down from the body's stored PixelLab walk: east near-side joints drop by sin(e)*width*cos(yaw); east yaw from how far the far shoulder/hip leads at rest. */
export function calibrate() {
  const px = (kps: Kp[]) => Object.fromEntries(kps.map((k) => [k.label, [k.x * CELL, k.y * CELL]]));
  const s = px(body.rig.rest.south.keypoints), e = px(body.rig.rest.east.keypoints);
  const walk = body.rig.animations.find((a: any) => a.id === 'walk');
  const E = walk.sources.east.keypoints.map(px), S = walk.sources.south.keypoints.map(px);
  const width = (p: string) => s['LEFT ' + p][0] - s['RIGHT ' + p][0];
  const yaws = ['SHOULDER', 'HIP'].map((p) => Math.asin((e['LEFT ' + p][0] - e['RIGHT ' + p][0]) / width(p)));
  const yaw = yaws.reduce((a, b) => a + b) / yaws.length;
  const sins = ['SHOULDER', 'HIP', 'KNEE', 'LEG'].map((p) => E.reduce((a: number, f: any) => a + f['RIGHT ' + p][1] - f['LEFT ' + p][1], 0) / E.length / (width(p) * Math.cos(yaw)));
  const range = (v: number[]) => Math.max(...v) - Math.min(...v);
  sins.push(range(S.map((f: any) => f['LEFT LEG'][1] - f['RIGHT LEG'][1])) / (range(E.map((f: any) => f['LEFT LEG'][0] - f['RIGHT LEG'][0])) / Math.cos(yaw)));
  const deg = (r: number) => r * 180 / Math.PI;
  return { elev: deg(Math.asin(sins.reduce((a, b) => a + b) / sins.length)), yaw: deg(yaw) };
}
const CAL = calibrate();

// ---------- retarget ----------
// The body's own rest skeleton (lifted to 3D from the south rest) is posed by each mocap bone's world-rotation change since
// the reference pose, keeping the body's bone lengths; the support (lowest) foot follows the mocap foot so planted feet stay
// planted. Screen = dir rest + (posed body - rest body), projected with the dir camera. The reference is a mocap pose that
// stands for the body's rest view (Idle_Loop at 0 by default), so every move starts from the same stance.
/** One frame = [clip, seconds]. */
export type At = [string, number];
export interface Opts {
  /** Remove this share of the whole-body turn (mean hip+shoulder heading change), so the sprite keeps facing its direction. */
  face?: number;
  /** Keep this share of the upper body's twist against the hips (1 = mocap). */
  twist?: number;
  /** Keep this share of the spine's bend (1 = mocap). */
  lean?: number;
  /** Scale of the root's horizontal travel (steps, lunges); vertical travel (jumps, falls) is kept. */
  travel?: number;
  /** Shift the whole clip (one offset for all frames) so every keypoint stays this many px inside the cell. */
  margin?: number;
  /** Send depth + z_index (0-255 camera depth, nearer = higher). */
  depth?: boolean;
  /** Scale every rotation and the root's travel away from the reference (2 = twice the motion; for subtle idles). */
  gain?: number;
  /** Extra gain on the pelvis and legs (below 1 = shallower squats and lunges). */
  legs?: number;
}
const rot3 = (W: M4) => [xformDir(W, [1, 0, 0]), xformDir(W, [0, 1, 0]), xformDir(W, [0, 0, 1])].map(norm);
/** Apply R_t * R_ref^T (world rotation change of a bone) to v, its angle scaled by gain. */
function turn(Wt: M4, Wr: M4, v: V3, gain = 1): V3 {
  const ct = rot3(Wt), cr = rot3(Wr), R = (u: V3): V3 => { const l = [dot(cr[0], u), dot(cr[1], u), dot(cr[2], u)]; return add(add(mul(ct[0], l[0]), mul(ct[1], l[1])), mul(ct[2], l[2])); };
  if (gain === 1) return R(v);
  const [cx, cy, cz] = [R([1, 0, 0]), R([0, 1, 0]), R([0, 0, 1])]; // columns of the rotation change
  const ax: V3 = [cy[2] - cz[1], cz[0] - cx[2], cx[1] - cy[0]], s = len(ax) / 2, c = (cx[0] + cy[1] + cz[2] - 1) / 2;
  return s < 1e-9 ? v : rotAxis(mul(ax, 1 / (2 * s)), gain * Math.atan2(s, c), v);
}
/** Rodrigues rotation of v about unit axis k by angle a. */
const rotAxis = (k: V3, a: number, v: V3): V3 => add(add(mul(v, Math.cos(a)), mul(cross(k, v), Math.sin(a))), mul(k, dot(k, v) * (1 - Math.cos(a))));
/** Direction a turned toward b by t times the angle between them (t > 1 overshoots). */
const toward = (a: V3, b: V3, t: number): V3 => { const ax = cross(a, b), s = len(ax); return s < 1e-9 ? a : rotAxis(mul(ax, 1 / s), t * Math.atan2(s, dot(a, b)), a); };
/** Rotate v by the minimal rotation taking direction a to b (Rodrigues). */
function swing(a: V3, b: V3, v: V3): V3 {
  a = norm(a); b = norm(b); const ax = cross(a, b), s = len(ax), c = dot(a, b);
  if (s < 1e-9) return v;
  const k = mul(ax, 1 / s);
  return add(add(mul(v, c), mul(cross(k, v), s)), mul(k, dot(k, v) * (1 - c)));
}
/** Rotate p about the vertical axis through c by angle a (radians, + = RIGHT toward FWD). */
const yawAbout = (p: V3, c: V3, a: number): V3 => { const d = sub(p, c); const r = dot(d, RIGHT), f = dot(d, FWD), u = dot(d, UP);
  return add(c, add(add(mul(RIGHT, r * Math.cos(a) - f * Math.sin(a)), mul(FWD, r * Math.sin(a) + f * Math.cos(a))), mul(UP, u))); };
const heading = (l: V3, r: V3) => { const v = sub(r, l); return Math.atan2(dot(v, FWD), dot(v, RIGHT)); };
const wrap = (a: number) => Math.atan2(Math.sin(a), Math.cos(a));
const mid = (a: V3, b: V3) => mul(add(a, b), 0.5);
const SIDES = ['RIGHT', 'LEFT'] as const;
const sfx = (s: string) => s === 'RIGHT' ? '_r' : '_l';
const UPPER: Label[] = ['NECK', 'RIGHT SHOULDER', 'RIGHT ELBOW', 'RIGHT ARM', 'LEFT SHOULDER', 'LEFT ELBOW', 'LEFT ARM', 'NOSE', 'RIGHT EYE', 'LEFT EYE', 'RIGHT EAR', 'LEFT EAR'];

export function build(frames: At[], dir: Dir, o: Opts = {}, ref: At = ['Idle_Loop', 0]) {
  const { face = 0, twist = 1, lean = 1, travel = 1, margin = 2, depth = true, gain = 1, legs = 1 } = o;
  const cam = camera(dir, CAL.elev, dir === 'east' ? CAL.yaw : 0);
  const rest = restPx(dir);
  const W = ([a, t]: At) => worldMatrices(g, animByName(g, a), t);
  const Wref = W(ref);

  // Body rest in 3D (px, origin at the feet pivot), lifted from the south rest: depth 0 except face points.
  const S = restPx('south'), camS = camera('south', CAL.elev, 0), e = CAL.elev * Math.PI / 180;
  const earW = S['LEFT EAR'].x - S['RIGHT EAR'].x;
  const body0 = Object.fromEntries(LABELS.map((l) => { const f = (FACE[l]?.[2] ?? 0) / (2 * FACE['LEFT EAR']![0]) * earW;
    const h = (f * Math.sin(e) - (S[l].y - body.rig.pivot.y)) / Math.cos(e);
    return [l, add(add(mul(camS.SX, S[l].x - body.rig.pivot.x), mul(UP, h)), mul(FWD, f))]; })) as Record<Label, V3>;
  const hip0 = mid(body0['RIGHT HIP'], body0['LEFT HIP']);
  const legPx = len(sub(body0['RIGHT KNEE'], body0['RIGHT HIP'])) + len(sub(body0['RIGHT LEG'], body0['RIGHT KNEE']));
  const legM = len(sub(pos(Wref, 'calf_r'), pos(Wref, 'thigh_r'))) + len(sub(pos(Wref, 'foot_r'), pos(Wref, 'calf_r')));
  const scale = legPx / legM; // px per mocap meter, from leg length (the body's proportions decide the rest)
  const armPx = len(sub(body0['RIGHT ELBOW'], body0['RIGHT SHOULDER'])) + len(sub(body0['RIGHT ARM'], body0['RIGHT ELBOW']));
  const headingOf = (Wx: M4[]) => (heading(pos(Wx, 'thigh_l'), pos(Wx, 'thigh_r')) + heading(pos(Wx, 'upperarm_l'), pos(Wx, 'upperarm_r'))) / 2;
  const twistOf = (Wx: M4[]) => wrap(heading(pos(Wx, 'upperarm_l'), pos(Wx, 'upperarm_r')) - heading(pos(Wx, 'thigh_l'), pos(Wx, 'thigh_r')));
  const h0 = headingOf(Wref), tw0 = twistOf(Wref);

  function posed(at: At): Record<Label, V3> {
    const Wt = W(at), T = (bone: string, v: V3) => turn(Wt[nodeId(bone)], Wref[nodeId(bone)], v, /^(pelvis|thigh|calf)/.test(bone) ? gain * legs : gain);
    const p: any = {};
    const B = (l: string) => body0[l as Label];
    for (const sd of SIDES) {
      p[sd + ' HIP'] = T('pelvis', sub(B(sd + ' HIP'), hip0));
      p[sd + ' KNEE'] = add(p[sd + ' HIP'], T('thigh' + sfx(sd), sub(B(sd + ' KNEE'), B(sd + ' HIP'))));
      p[sd + ' LEG'] = add(p[sd + ' KNEE'], T('calf' + sfx(sd), sub(B(sd + ' LEG'), B(sd + ' KNEE'))));
    }
    const chord = (Wx: M4[]) => sub(pos(Wx, 'neck_01'), mid(pos(Wx, 'thigh_l'), pos(Wx, 'thigh_r')));
    const c0 = norm(chord(Wref)), c1 = toward(c0, norm(chord(Wt)), gain), cl = toward(c0, c1, lean);
    p.NECK = swing(c0, cl, sub(body0.NECK, hip0));
    // The lean the limbs inherit is undone with the spine's (1 - lean) share, so arms and head keep their pose relative to the chest.
    const unlean = (v: V3) => swing(c1, cl, v);
    for (const sd of SIDES) {
      p[sd + ' SHOULDER'] = add(p.NECK, unlean(T('clavicle' + sfx(sd), sub(B(sd + ' SHOULDER'), body0.NECK))));
      p[sd + ' ELBOW'] = add(p[sd + ' SHOULDER'], unlean(T('upperarm' + sfx(sd), sub(B(sd + ' ELBOW'), B(sd + ' SHOULDER')))));
      p[sd + ' ARM'] = add(p[sd + ' ELBOW'], unlean(T('lowerarm' + sfx(sd), sub(B(sd + ' ARM'), B(sd + ' ELBOW')))));
    }
    for (const l of Object.keys(FACE)) p[l] = add(p.NECK, unlean(T('Head', sub(B(l), body0.NECK))));
    // Untwist the upper body about the neck's vertical axis, then turn the whole figure back toward its facing.
    const dTw = (1 - twist) * gain * wrap(twistOf(Wt) - tw0);
    for (const l of UPPER) if (l !== 'NECK') p[l] = yawAbout(p[l], p.NECK, -dTw);
    const dH = face * gain * wrap(headingOf(Wt) - h0), hc = mid(p['RIGHT HIP'], p['LEFT HIP']);
    for (const l of LABELS) p[l] = yawAbout(p[l], hc, -dH);
    // Root: support foot (within 2 cm of the lowest mocap foot) lands where the mocap moved it, scaled.
    const move = (v: V3): V3 => { const r = yawAbout(mul(v, gain), [0, 0, 0], -dH); return add(mul(sub(r, mul(UP, dot(r, UP))), travel), mul(UP, dot(r, UP))); };
    const feet = SIDES.map((sd) => ({ sd, now: pos(Wt, 'foot' + sfx(sd)), was: pos(Wref, 'foot' + sfx(sd)) }));
    const low = Math.min(...feet.map((f) => f.now[1]));
    const sup = feet.filter((f) => f.now[1] < low + 0.02);
    const target = (f: typeof feet[number]) => add(B(f.sd + ' LEG'), mul(move(sub(f.now, f.was)), scale));
    const root = mul(sup.reduce((acc, f) => add(acc, sub(target(f), p[f.sd + ' LEG'])), [0, 0, 0] as V3), 1 / sup.length);
    for (const l of LABELS) p[l] = add(p[l], root);
    // Two-bone IK pins each support foot on its target; the FK knee gives the bend direction.
    for (const f of sup) {
      const H: V3 = p[f.sd + ' HIP'], K: V3 = p[f.sd + ' KNEE'], A = target(f);
      const a = len(sub(B(f.sd + ' KNEE'), B(f.sd + ' HIP'))), b = len(sub(B(f.sd + ' LEG'), B(f.sd + ' KNEE')));
      const d = norm(sub(A, H)), r = Math.min(len(sub(A, H)), a + b - 1e-6);
      const kv = sub(K, H), pole = sub(kv, mul(d, dot(kv, d))), cosA = (a * a + r * r - b * b) / (2 * a * r);
      p[f.sd + ' KNEE'] = add(H, add(mul(d, a * cosA), mul(len(pole) > 1e-9 ? norm(pole) : FWD, a * Math.sqrt(Math.max(0, 1 - cosA * cosA)))));
      p[f.sd + ' LEG'] = add(H, mul(d, r));
    }
    return p;
  }

  const k = 62 / armPx; // depth per px: a straight arm pointing at the camera ~190, away ~66
  const p0 = Object.fromEntries(LABELS.map((l) => [l, project(cam, body0[l])])) as Record<Label, { x: number; y: number }>;
  const px = frames.map((at) => { const P = posed(at), pel = project(cam, mid(P['RIGHT HIP'], P['LEFT HIP']));
    return LABELS.map((l) => { const q = project(cam, P[l]); return { label: l, x: rest[l].x + q.x - p0[l].x, y: rest[l].y + q.y - p0[l].y, z: q.z - pel.z }; }); });
  // One clip-wide shift keeps everything inside the cell (a per-frame shift would read as sliding).
  const all = px.flat(), lo = (v: number) => Math.max(0, margin - v), hi = (v: number) => Math.max(0, v - (CELL - margin));
  const dx = Math.max(...all.map((q) => lo(q.x))) - Math.max(...all.map((q) => hi(q.x)));
  const dy = Math.max(...all.map((q) => lo(q.y))); // never push feet below their line
  const clamp = (v: number) => Math.min(0.99, Math.max(0.01, v));
  const out: Kp[][] = px.map((f) => f.map((q) => { const kp: Kp = { label: q.label, x: +clamp((q.x + dx) / CELL).toFixed(4), y: +clamp((q.y + dy) / CELL).toFixed(4) };
    if (depth) { kp.depth = Math.round(Math.min(255, Math.max(0, 128 + k * q.z))); kp.z_index = Math.round((kp.depth - 128) / 16); }
    return kp; }));
  return { rest: body.rig.rest[dir].keypoints as Kp[], frames: out, meta: { dir, frames, ref, opts: { face, twist, lean, travel, margin, depth, gain, legs }, shift: [+dx.toFixed(1), +dy.toFixed(1)], scale: +scale.toFixed(2), elev: +CAL.elev.toFixed(1), yaw: +CAL.yaw.toFixed(1) } };
}

/** Evenly spaced times over [from, to) (a loop: the end equals the start, so it is left out) or [from, to] when closed. */
export const span = (anim: string, n: number, from = 0, to = clipLength(anim), closed = false): At[] =>
  Array.from({ length: n }, (_, i) => [anim, +(from + (to - from) * i / (closed ? n - 1 : n)).toFixed(4)]);

// ---------- preview ----------
const BONES: [Label, Label][] = [['NOSE', 'NECK'], ['NOSE', 'RIGHT EYE'], ['NOSE', 'LEFT EYE'], ['RIGHT EYE', 'RIGHT EAR'], ['LEFT EYE', 'LEFT EAR'],
  ['NECK', 'RIGHT SHOULDER'], ['RIGHT SHOULDER', 'RIGHT ELBOW'], ['RIGHT ELBOW', 'RIGHT ARM'], ['NECK', 'LEFT SHOULDER'], ['LEFT SHOULDER', 'LEFT ELBOW'], ['LEFT ELBOW', 'LEFT ARM'],
  ['NECK', 'RIGHT HIP'], ['RIGHT HIP', 'RIGHT KNEE'], ['RIGHT KNEE', 'RIGHT LEG'], ['NECK', 'LEFT HIP'], ['LEFT HIP', 'LEFT KNEE'], ['LEFT KNEE', 'LEFT LEG'], ['RIGHT HIP', 'LEFT HIP']];
const side = (l: string): [number, number, number] => l.startsWith('RIGHT') ? [235, 70, 70] : l.startsWith('LEFT') ? [80, 140, 255] : [235, 220, 120];
const Z = 4, P = CELL * Z;
/** Skeleton strip: rest, then each frame over a gray rest ghost; red = right side, blue = left, dot size = depth. */
export async function strip(path: string, rest: Kp[], frames: Kp[][]) {
  const panels = [rest, ...frames], w = P * panels.length, data = new Uint8ClampedArray(w * P * 4);
  const disc = (ox: number, cx: number, cy: number, r: number, c: number[], a = 1) => {
    for (let y = Math.floor(cy - r); y <= cy + r; y++) for (let x = Math.floor(cx - r); x <= cx + r; x++) {
      if (x < 0 || y < 0 || x >= P || y >= P || (x - cx) ** 2 + (y - cy) ** 2 > r * r) continue;
      const i = (y * w + ox + x) * 4; for (let k = 0; k < 3; k++) data[i + k] = data[i + k] * (1 - a) + c[k] * a; } };
  const line = (ox: number, a: Kp, b: Kp, c: number[], r: number, al = 1) => { const n = Math.ceil(Math.hypot(b.x - a.x, b.y - a.y) * P) + 1;
    for (let s = 0; s <= n; s++) disc(ox, (a.x + (b.x - a.x) * s / n) * P, (a.y + (b.y - a.y) * s / n) * P, r, c, al); };
  const figure = (ox: number, kps: Kp[], ghost: boolean) => {
    const by = Object.fromEntries(kps.map((k) => [k.label, k]));
    for (const [a, b] of BONES) line(ox, by[a], by[b], ghost ? [120, 120, 120] : side(a === 'NECK' || a === 'NOSE' ? b : a), ghost ? 1.5 : 2.5, ghost ? 0.6 : 1);
    if (ghost) return;
    for (const k of [...kps].sort((a, b) => (a.depth ?? 128) - (b.depth ?? 128))) disc(ox, k.x * P, k.y * P, 3 + Math.max(0, ((k.depth ?? 128) - 60) / 140) * 6, side(k.label));
  };
  panels.forEach((kps, i) => { const ox = i * P;
    for (let y = 0; y < P; y++) for (let x = 0; x < P; x++) { const j = (y * w + ox + x) * 4; const v = i === 0 ? 40 : 24; data[j] = data[j + 1] = data[j + 2] = (x < 2 || y < 2) ? 70 : v; data[j + 3] = 255; }
    for (let x = 0; x < P; x++) for (let t = 0; t < 2; t++) { const j = ((body.rig.pivot.y * Z + t) * w + ox + x) * 4; data[j] = data[j + 1] = data[j + 2] = 90; } // feet line
    if (i > 0) figure(ox, rest, true);
    figure(ox, kps, false);
  });
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, await encodePngBytes({ w, h: P, data }));
}

if (import.meta.main) {
  // Self-checks: the reference pose reproduces each rest view; the east near side (RIGHT) is nearer the camera.
  for (const dir of ['south', 'east', 'north'] as const) {
    const r = build([['Idle_Loop', 0]], dir, { face: 1, twist: 0.5, lean: 0.5, travel: 0.5, margin: 0 });
    r.frames[0].forEach((k, i) => assert(Math.abs(k.x - r.rest[i].x) < 2e-3 && Math.abs(k.y - r.rest[i].y) < 2e-3, `${dir} rest mismatch ${k.label}`));
  }
  const east = Object.fromEntries(build([['Idle_Loop', 0]], 'east').frames[0].map((k) => [k.label, k]));
  assert(east['RIGHT SHOULDER'].depth! > east['LEFT SHOULDER'].depth!);
  // gain ~1 through the axis-angle path matches the direct rotation.
  const g1 = build(span('Sword_Attack', 4), 'east').frames.flat(), g2 = build(span('Sword_Attack', 4), 'east', { gain: 1 + 1e-9 }).frames.flat();
  g1.forEach((k, i) => assert(Math.abs(k.x - g2[i].x) < 2e-3 && Math.abs(k.y - g2[i].y) < 2e-3, `gain path ${k.label}`));
  const r = build(span('Sword_Attack', 8), 'south', { face: 1 });
  await strip(join(OUT, 'check_sword_south.png'), r.rest, r.frames);
  console.log('ok', CAL, r.meta.shift);
}
