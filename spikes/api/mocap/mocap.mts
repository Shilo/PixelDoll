// Offline: CC0 mocap (Quaternius UAL1.glb) -> PixelLab animate-with-skeleton-v3 keypoint sequences + PNG previews.
// No network. Usage (spikes/api): node mocap/mocap.mts [--elev deg] [--yaw-east deg]; UAL1_GLB overrides the library path.
import { writeFileSync, mkdirSync, readFileSync } from 'node:fs';
import { strict as assert } from 'node:assert';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { parseGlb, worldMatrices, animByName, animDuration, xformPoint, xformDir, sub, add, mul, dot, cross, norm, len, type V3, type M4 } from './glb.mts';
import { encodePngBytes } from '../../../app/src/lib/image/pngraw.ts';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const OUT = join(ROOT, 'out', 'mocap');
// Quaternius Universal Animation Library (CC0, License.txt beside it); not committed (23 MB).
const GLB = process.env.UAL1_GLB ?? 'C:/Users/shilo/Downloads/photon-fusion-godot-starter_3.0.0.407/3rdparty/universal_animation_library/UAL1.glb';
const arg = (k: string) => { const i = process.argv.indexOf(k); return i > 0 ? +process.argv[i + 1] : undefined; };

const LABELS = ['NOSE', 'NECK', 'RIGHT SHOULDER', 'RIGHT ELBOW', 'RIGHT ARM', 'LEFT SHOULDER', 'LEFT ELBOW', 'LEFT ARM', 'RIGHT HIP', 'RIGHT KNEE', 'RIGHT LEG',
  'LEFT HIP', 'LEFT KNEE', 'LEFT LEG', 'RIGHT EYE', 'LEFT EYE', 'RIGHT EAR', 'LEFT EAR'] as const;
type Label = typeof LABELS[number];
// Bone joints; the hip label sits on the thigh bone head (pelvis is the parent, centered).
const BONE: Partial<Record<Label, string>> = {
  NECK: 'neck_01', 'RIGHT SHOULDER': 'upperarm_r', 'RIGHT ELBOW': 'lowerarm_r', 'RIGHT ARM': 'hand_r', 'LEFT SHOULDER': 'upperarm_l', 'LEFT ELBOW': 'lowerarm_l', 'LEFT ARM': 'hand_l',
  'RIGHT HIP': 'thigh_r', 'RIGHT KNEE': 'calf_r', 'RIGHT LEG': 'foot_r', 'LEFT HIP': 'thigh_l', 'LEFT KNEE': 'calf_l', 'LEFT LEG': 'foot_l',
};
// Face points in the rest pose's world basis (right=-X... see basis below), meters from the Head bone origin, as
// [lateral toward character's LEFT, up, forward]. Measured from the head mesh (Head-weighted verts: x ±0.087,
// y 1.551..1.829, z -0.112..0.118; Head bone at y 1.569).
const FACE: Partial<Record<Label, V3>> = {
  NOSE: [0, 0.10, 0.115], 'RIGHT EYE': [-0.035, 0.14, 0.10], 'LEFT EYE': [0.035, 0.14, 0.10], 'RIGHT EAR': [-0.087, 0.11, 0], 'LEFT EAR': [0.087, 0.11, 0],
};

interface Kp { label: string; x: number; y: number; depth?: number; z_index?: number }
const CELL = 80;

// ---------- mocap ----------
const g = parseGlb(GLB);
const nodeId = (n: string) => { const i = g.json.nodes.findIndex((x: any) => x.name === n); if (i < 0) throw new Error(`bone ${n} missing`); return i; };
const pos = (W: M4[], n: string) => xformPoint(W[nodeId(n)], [0, 0, 0]);

// Character basis from the rest (T) pose: up=+Y (glTF), right = upperarm_r - upperarm_l, forward = up x right.
const REST = worldMatrices(g, null, 0);
const UP: V3 = [0, 1, 0];
const RIGHT = norm(((v: V3) => [v[0], 0, v[2]] as V3)(sub(pos(REST, 'upperarm_r'), pos(REST, 'upperarm_l'))));
const FWD = cross(UP, RIGHT);
assert(dot(sub(pos(REST, 'ball_l'), pos(REST, 'foot_l')), FWD) > 0, 'forward axis should point toward the toes');
// Face offsets -> Head-local (the head's own forward axis comes from its rest world rotation).
const headRest = REST[nodeId('Head')];
const toHeadLocal = (w: V3): V3 => { // inverse of the (orthonormal) rest head rotation = transpose
  const cols = [xformDir(headRest, [1, 0, 0]), xformDir(headRest, [0, 1, 0]), xformDir(headRest, [0, 0, 1])].map(norm);
  return [dot(cols[0], w), dot(cols[1], w), dot(cols[2], w)];
};
const FACE_LOCAL = Object.fromEntries(Object.entries(FACE).map(([k, [l, u, f]]) => [k, toHeadLocal(add(add(mul(RIGHT, -l), mul(UP, u)), mul(FWD, f)))])) as Record<string, V3>;
const ARM_LEN = len(sub(pos(REST, 'hand_r'), pos(REST, 'upperarm_r')));

function joints(W: M4[]): Record<Label, V3> {
  const o: any = {};
  for (const l of LABELS) o[l] = BONE[l] ? pos(W, BONE[l]!) : xformPoint(W[nodeId('Head')], FACE_LOCAL[l]);
  return o;
}

// ---------- camera ----------
// Orthographic, camera on horizontal direction H from the character, raised by `elev`. Screen x = p.SX, y down = -p.CU,
// depth (toward camera) = p.V. east: camera on the character's right (right side nearer), optionally yawed toward the front.
interface Cam { SX: V3; CU: V3; V: V3 }
function camera(dir: 'south' | 'east', elevDeg: number, yawDeg: number): Cam {
  const e = elevDeg * Math.PI / 180, y = yawDeg * Math.PI / 180;
  const H = norm(dir === 'south' ? FWD : add(mul(RIGHT, Math.cos(y)), mul(FWD, Math.sin(y))));
  return { SX: cross(UP, H), V: add(mul(H, Math.cos(e)), mul(UP, Math.sin(e))), CU: sub(mul(UP, Math.cos(e)), mul(H, Math.sin(e))) };
}
const project = (c: Cam, p: V3) => ({ x: dot(p, c.SX), y: -dot(p, c.CU), z: dot(p, c.V) });

// ---------- body ----------
const body = JSON.parse(readFileSync(join(ROOT, 'out', 'c25', process.env.MOCAP_BODY ?? 'c27man.json'), 'utf8'));
const restPx = (dir: string) => Object.fromEntries(body.rig.rest[dir].keypoints.map((k: Kp) => [k.label, { x: k.x * CELL, y: k.y * CELL }])) as Record<Label, { x: number; y: number }>;
const height = (p: Record<Label, { y: number }>) => (p['RIGHT LEG'].y + p['LEFT LEG'].y) / 2 - p.NOSE.y;

// Calibrate low top-down from the stored PixelLab walk: near (RIGHT) joints in east drop by sin(e)*width*cos(yaw);
// east yaw from how far the far shoulder/hip leads the near one at rest.
function calibrate() {
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
  return { elev: deg(Math.asin(sins.reduce((a, b) => a + b) / sins.length)), yaw: deg(yaw), elevSamples: sins.map((v) => +deg(Math.asin(v)).toFixed(1)), yawSamples: yaws.map((v) => +deg(v).toFixed(1)) };
}

// ---------- retarget ----------
// Two modes, both exact at the reference frame (frame == body rest there):
//  'delta': keypoint = rest + (mocap joint(t) - mocap joint(ref)) * scale, projected. Literal spec; limbs shrink or flip
//           whenever the mocap's reference stance differs from the body's rest (e.g. bladed sword stance vs square body).
//  'rot'  : the body's own rest skeleton (lifted to 3D from the south rest) is posed by each mocap bone's world-rotation
//           change since ref, keeping the body's bone lengths; the support (lowest) foot follows the mocap foot so planted
//           feet stay planted. Screen result = dir rest + (posed body - rest body), projected with the dir camera.
type Mode = 'rot' | 'delta';
interface Seq { name: string; anim: string; ref: number; times: number[] }
const rot3 = (W: M4) => [xformDir(W, [1, 0, 0]), xformDir(W, [0, 1, 0]), xformDir(W, [0, 0, 1])].map(norm);
/** Apply R_t * R_ref^T (world rotation change of a bone) to v. */
const turn = (Wt: M4, Wr: M4, v: V3): V3 => { const ct = rot3(Wt), cr = rot3(Wr); const l = [dot(cr[0], v), dot(cr[1], v), dot(cr[2], v)];
  return add(add(mul(ct[0], l[0]), mul(ct[1], l[1])), mul(ct[2], l[2])); };
/** Rotate v by the minimal rotation taking direction a to b (Rodrigues). */
function swing(a: V3, b: V3, v: V3): V3 {
  a = norm(a); b = norm(b); const ax = cross(a, b), s = len(ax), c = dot(a, b);
  if (s < 1e-9) return v;
  const k = mul(ax, 1 / s);
  return add(add(mul(v, c), mul(cross(k, v), s)), mul(k, dot(k, v) * (1 - c)));
}
const mid = (a: V3, b: V3) => mul(add(a, b), 0.5);
const SIDES = ['RIGHT', 'LEFT'] as const;
const sfx = (s: string) => s === 'RIGHT' ? '_r' : '_l';

function build(seq: Seq, dir: 'south' | 'east', elev: number, yaw: number, mode: Mode) {
  const anim = animByName(g, seq.anim);
  const cam = camera(dir, elev, dir === 'east' ? yaw : 0);
  const rest = restPx(dir);
  const tpose = joints(REST);
  const tp = Object.fromEntries(LABELS.map((l) => [l, project(cam, tpose[l])])) as Record<Label, { y: number }>;
  const scale = height(rest) / height(tp); // px per meter (mocap height -> body height)
  const W = (t: number) => worldMatrices(g, anim, t);
  const Wref = W(seq.ref);

  // Body rest in 3D (px, origin at the feet pivot), lifted from the south rest: depth 0 except face points.
  const S = restPx('south'), camS = camera('south', elev, 0), e = elev * Math.PI / 180;
  const earW = S['LEFT EAR'].x - S['RIGHT EAR'].x;
  const body0 = Object.fromEntries(LABELS.map((l) => { const f = (FACE[l]?.[2] ?? 0) / (2 * FACE['LEFT EAR']![0]) * earW;
    const h = (f * Math.sin(e) - (S[l].y - body.rig.pivot.y)) / Math.cos(e);
    return [l, add(add(mul(camS.SX, S[l].x - body.rig.pivot.x), mul(UP, h)), mul(FWD, f))]; })) as Record<Label, V3>;
  const armPx = len(sub(body0['RIGHT ELBOW'], body0['RIGHT SHOULDER'])) + len(sub(body0['RIGHT ARM'], body0['RIGHT ELBOW']));
  const hip0 = mid(body0['RIGHT HIP'], body0['LEFT HIP']);

  function posed(t: number): Record<Label, V3> {
    const Wt = W(t), T = (bone: string, v: V3) => turn(Wt[nodeId(bone)], Wref[nodeId(bone)], v);
    const o: any = {};
    const B = (l: string) => body0[l as Label];
    for (const sd of SIDES) {
      o[sd + ' HIP'] = T('pelvis', sub(B(sd + ' HIP'), hip0));
      o[sd + ' KNEE'] = add(o[sd + ' HIP'], T('thigh' + sfx(sd), sub(B(sd + ' KNEE'), B(sd + ' HIP'))));
      o[sd + ' LEG'] = add(o[sd + ' KNEE'], T('calf' + sfx(sd), sub(B(sd + ' LEG'), B(sd + ' KNEE'))));
    }
    const chord = (Wx: M4[]) => sub(pos(Wx, 'neck_01'), mid(pos(Wx, 'thigh_l'), pos(Wx, 'thigh_r')));
    o.NECK = swing(chord(Wref), chord(Wt), sub(body0.NECK, hip0));
    for (const sd of SIDES) {
      o[sd + ' SHOULDER'] = add(o.NECK, T('clavicle' + sfx(sd), sub(B(sd + ' SHOULDER'), body0.NECK)));
      o[sd + ' ELBOW'] = add(o[sd + ' SHOULDER'], T('upperarm' + sfx(sd), sub(B(sd + ' ELBOW'), B(sd + ' SHOULDER'))));
      o[sd + ' ARM'] = add(o[sd + ' ELBOW'], T('lowerarm' + sfx(sd), sub(B(sd + ' ARM'), B(sd + ' ELBOW'))));
    }
    for (const l of Object.keys(FACE)) o[l] = add(o.NECK, T('Head', sub(B(l), body0.NECK)));
    // Root: support foot (within 2 cm of the lowest mocap foot) lands where the mocap moved it, scaled.
    const feet = SIDES.map((sd) => ({ sd, now: pos(Wt, 'foot' + sfx(sd)), was: pos(Wref, 'foot' + sfx(sd)) }));
    const low = Math.min(...feet.map((f) => f.now[1]));
    const sup = feet.filter((f) => f.now[1] < low + 0.02);
    const root = mul(sup.reduce((acc, f) => add(acc, sub(add(B(f.sd + ' LEG'), mul(sub(f.now, f.was), scale)), o[f.sd + ' LEG'])), [0, 0, 0] as V3), 1 / sup.length);
    for (const l of LABELS) o[l] = add(o[l], root);
    // Two-bone IK pins each support foot exactly on its target; the FK knee gives the bend direction.
    for (const f of sup) {
      const H: V3 = o[f.sd + ' HIP'], K: V3 = o[f.sd + ' KNEE'], A = add(B(f.sd + ' LEG'), mul(sub(f.now, f.was), scale));
      const a = len(sub(B(f.sd + ' KNEE'), B(f.sd + ' HIP'))), b = len(sub(B(f.sd + ' LEG'), B(f.sd + ' KNEE')));
      const d = norm(sub(A, H)), r = Math.min(len(sub(A, H)), a + b - 1e-6);
      const kv = sub(K, H), pole = sub(kv, mul(d, dot(kv, d))), cosA = (a * a + r * r - b * b) / (2 * a * r);
      o[f.sd + ' KNEE'] = add(H, add(mul(d, a * cosA), mul(len(pole) > 1e-9 ? norm(pole) : FWD, a * Math.sqrt(Math.max(0, 1 - cosA * cosA)))));
      o[f.sd + ' LEG'] = add(H, mul(d, r));
    }
    return o;
  }

  // Per frame: screen px offsets from the reference + depth (camera z relative to the hip center).
  let at: (t: number) => Record<Label, { x: number; y: number; z: number }>, k: number;
  if (mode === 'rot') {
    k = 62 / armPx; // per px: a straight arm pointing at the camera ~190, away ~66
    const p0 = Object.fromEntries(LABELS.map((l) => [l, project(cam, body0[l])])) as Record<Label, { x: number; y: number }>;
    if (dir === 'south') for (const l of LABELS) assert(Math.abs(p0[l].x + body.rig.pivot.x - S[l].x) < 1e-6 && Math.abs(p0[l].y + body.rig.pivot.y - S[l].y) < 1e-6, 'south lift must reproject exactly');
    at = (t) => { const P = posed(t), pel = project(cam, mid(P['RIGHT HIP'], P['LEFT HIP']));
      return Object.fromEntries(LABELS.map((l) => { const p = project(cam, P[l]); return [l, { x: p.x - p0[l].x, y: p.y - p0[l].y, z: p.z - pel.z }]; })) as any; };
  } else {
    k = 62 / ARM_LEN; // per meter
    const proj = (t: number) => { const Wt = W(t), j = joints(Wt), pel = project(cam, pos(Wt, 'pelvis'));
      return Object.fromEntries(LABELS.map((l) => { const p = project(cam, j[l]); return [l, { x: p.x, y: p.y, z: p.z - pel.z }]; })) as Record<Label, { x: number; y: number; z: number }>; };
    const r0 = proj(seq.ref);
    at = (t) => { const m = proj(t); return Object.fromEntries(LABELS.map((l) => [l, { x: (m[l].x - r0[l].x) * scale, y: (m[l].y - r0[l].y) * scale, z: m[l].z }])) as any; };
  }
  const clamp = (v: number) => Math.min(0.98, Math.max(0.02, v));
  const frame = (t: number): Kp[] => { const m = at(t);
    return LABELS.map((l) => { const depth = Math.round(Math.min(255, Math.max(0, 128 + k * m[l].z)));
      return { label: l, x: +clamp((rest[l].x + m[l].x) / CELL).toFixed(4), y: +clamp((rest[l].y + m[l].y) / CELL).toFixed(4), depth, z_index: Math.round((depth - 128) / 16) }; }); };
  // Un-retargeted mocap (same camera/scale, reference hip center pinned to the body's) for visual checks.
  const hipScreen = (Wx: M4[]) => project(cam, mid(pos(Wx, 'thigh_l'), pos(Wx, 'thigh_r')));
  const hr = hipScreen(Wref), hipC = { x: (rest['RIGHT HIP'].x + rest['LEFT HIP'].x) / 2, y: (rest['RIGHT HIP'].y + rest['LEFT HIP'].y) / 2 };
  const raw = (t: number): Kp[] => { const Wt = W(t), j = joints(Wt), pel = project(cam, pos(Wt, 'pelvis'));
    return LABELS.map((l) => { const p = project(cam, j[l]); return { label: l, x: (hipC.x + (p.x - hr.x) * scale) / CELL, y: (hipC.y + (p.y - hr.y) * scale) / CELL, depth: 128 + (62 / ARM_LEN) * (p.z - pel.z) }; }); };
  return { raw: [raw(seq.ref), ...seq.times.map(raw)], restKps: frame(seq.ref), frames: seq.times.map(frame),
    meta: { anim: seq.anim, mode, refTime: seq.ref, times: seq.times, dir, elevation: +elev.toFixed(2), yaw: dir === 'east' ? +yaw.toFixed(2) : 0, k: +k.toFixed(3), kUnit: mode === 'rot' ? 'per px' : 'per m', scale: +scale.toFixed(3), duration: +animDuration(g, anim).toFixed(3) } };
}

// ---------- preview ----------
const BONES: [Label, Label][] = [['NOSE', 'NECK'], ['NOSE', 'RIGHT EYE'], ['NOSE', 'LEFT EYE'], ['RIGHT EYE', 'RIGHT EAR'], ['LEFT EYE', 'LEFT EAR'],
  ['NECK', 'RIGHT SHOULDER'], ['RIGHT SHOULDER', 'RIGHT ELBOW'], ['RIGHT ELBOW', 'RIGHT ARM'], ['NECK', 'LEFT SHOULDER'], ['LEFT SHOULDER', 'LEFT ELBOW'], ['LEFT ELBOW', 'LEFT ARM'],
  ['NECK', 'RIGHT HIP'], ['RIGHT HIP', 'RIGHT KNEE'], ['RIGHT KNEE', 'RIGHT LEG'], ['NECK', 'LEFT HIP'], ['LEFT HIP', 'LEFT KNEE'], ['LEFT KNEE', 'LEFT LEG'], ['RIGHT HIP', 'LEFT HIP']];
const side = (l: string): [number, number, number] => l.startsWith('RIGHT') ? [235, 70, 70] : l.startsWith('LEFT') ? [80, 140, 255] : [235, 220, 120];
const Z = 4, P = CELL * Z;
async function strip(path: string, rest: Kp[], frames: Kp[][]) {
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
  writeFileSync(path, await encodePngBytes({ w, h: P, data }));
}

// ---------- run ----------
const SEQS: Seq[] = [
  // Sword_Attack: wind-up (0.20, 0.30 sword hand high behind) -> strike (0.37, 0.43) -> follow-through (0.55) -> recover (0.87, 1.15).
  { name: 'sword_slash', anim: 'Sword_Attack', ref: 0, times: [0, 0.2, 0.3, 0.37, 0.43, 0.55, 0.87, 1.15] },
  { name: 'sword_slash_standing', anim: 'Sword_Attack_Standing', ref: 0, times: [0, 0.2, 0.3, 0.37, 0.43, 0.55, 0.87, 1.15] },
  { name: 'idle', anim: 'Idle_Loop', ref: 0, times: [0, 1, 2, 3, 4, 5, 6, 7].map((i) => +(i * 2.5 / 8).toFixed(4)) },
  // Hit_Chest starts at the impact pose and eases back to idle (its last key = Idle_Loop's first), so idle is the reference.
  { name: 'hurt', anim: 'Hit_Chest', ref: 0.3333, times: [0.3333, 0, 0.05, 0.1, 0.15, 0.2, 0.25, 0.3333] },
];

const cal = calibrate();
const elev = arg('--elev') ?? cal.elev, yaw = arg('--yaw-east') ?? cal.yaw;
mkdirSync(join(OUT, 'delta'), { recursive: true });
const report: string[] = [`calibration from the body walk/rest: elevation ${cal.elev.toFixed(1)} deg (samples ${cal.elevSamples}), east yaw ${cal.yaw.toFixed(1)} deg (samples ${cal.yawSamples}); using elev ${elev.toFixed(1)}, yaw ${yaw.toFixed(1)}`];

// Which hand swings the sword: total path length over the clip.
{ const an = animByName(g, 'Sword_Attack'), D = animDuration(g, an); const path = { hand_r: 0, hand_l: 0 }; let prev: M4[] | null = null;
  for (let i = 0; i <= 60; i++) { const W = worldMatrices(g, an, D * i / 60); if (prev) for (const h of ['hand_r', 'hand_l'] as const) path[h] += len(sub(pos(W, h), pos(prev, h))); prev = W; }
  report.push(`Sword_Attack hand path: hand_r ${path.hand_r.toFixed(2)} m, hand_l ${path.hand_l.toFixed(2)} m -> sword hand = ${path.hand_r > path.hand_l ? 'RIGHT ARM' : 'LEFT ARM'}`);
  assert(path.hand_r > path.hand_l); }

for (const mode of ['rot', 'delta'] as const) for (const seq of SEQS) for (const dir of ['south', 'east'] as const) {
  const r = build(seq, dir, elev, yaw, mode);
  // Self-checks: frame 0 of the reference pose = body rest; east near side (RIGHT) has more depth; nose in front.
  const rest = body.rig.rest[dir].keypoints as Kp[];
  r.restKps.forEach((k, i) => { assert.equal(k.label, rest[i].label); assert(Math.abs(k.x - rest[i].x) < 1e-3 && Math.abs(k.y - rest[i].y) < 1e-3, `${seq.name}/${dir} rest mismatch ${k.label}`); });
  const T = joints(REST), cam = camera(dir, elev, dir === 'east' ? yaw : 0);
  if (dir === 'east') { assert(project(cam, T['RIGHT SHOULDER']).z > project(cam, T['LEFT SHOULDER']).z); assert(project(cam, T.NOSE).x > project(cam, T.NECK).x, 'east nose should lead'); }
  else { assert(project(cam, T['RIGHT SHOULDER']).x < project(cam, T['LEFT SHOULDER']).x); assert(project(cam, T.NOSE).z > project(cam, T.NECK).z, 'south nose toward camera'); }

  const base = join(OUT, mode === 'rot' ? '' : 'delta', `${seq.name}_${dir}`);
  writeFileSync(base + '.json', JSON.stringify({ rest: r.restKps, frames: r.frames, meta: r.meta }, null, 1));
  const strip0 = (k: Kp) => ({ label: k.label, x: k.x, y: k.y });
  writeFileSync(base + '_nodepth.json', JSON.stringify({ rest: r.restKps.map(strip0), frames: r.frames.map((f) => f.map(strip0)), meta: r.meta }, null, 1));
  await strip(base + '.png', r.restKps, r.frames);
  if (mode === 'rot') await strip(base + '_raw.png', r.raw[0], r.raw.slice(1));

  const by = (f: Kp[]) => Object.fromEntries(f.map((k) => [k.label, k]));
  const R = by(r.restKps), d = (f: Record<string, Kp>, l: string) => Math.hypot(f[l].x - R[l].x, f[l].y - R[l].y) * CELL;
  report.push(`\n[${mode}] ${seq.name} ${dir}  (${seq.anim}; scale ${r.meta.scale} px/m, k ${r.meta.k}/m)\n frame  t      RWrist LWrist  RHip LHip  RKnee LKnee  RAnkle LAnkle | depth RWr LWr RHip LHip`);
  r.frames.forEach((f0, i) => { const f = by(f0);
    report.push(` ${String(i).padStart(3)}  ${seq.times[i].toFixed(3).padStart(6)}  ${['RIGHT ARM', 'LEFT ARM', 'RIGHT HIP', 'LEFT HIP', 'RIGHT KNEE', 'LEFT KNEE', 'RIGHT LEG', 'LEFT LEG'].map((l) => d(f, l).toFixed(1).padStart(5)).join(' ')}  | ${['RIGHT ARM', 'LEFT ARM', 'RIGHT HIP', 'LEFT HIP'].map((l) => String(f[l].depth).padStart(4)).join('')}`); });
}
writeFileSync(join(OUT, 'report.txt'), report.join('\n') + '\n');
console.log(report.join('\n'));
