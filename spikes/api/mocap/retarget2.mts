// Offline: 2D cut-out retarget of CC0 mocap onto the body's drawn rest views (alternative to mocap.mts build()).
// Each drawn 2D bone keeps its drawn length and turns by the change of the mocap bone's projected screen angle, measured
// from a neutral stand (bind pose, arms hanging), not from Idle_Loop's staggered stance. Torso widths and the face move
// by projected 3D deltas, the root by the scaled pelvis travel, and the support foot is held on the ground vertically.
// Usage (spikes/api): node mocap/retarget2.mts -> self-checks + <move>_<dir>.old/.new.png strips and new keypoints in out/mocap/r2/.
import { strict as assert } from 'node:assert';
import { join } from 'node:path';
import { writeFileSync } from 'node:fs';
import { body, LABELS, span, strip, calibrate, OUT, build as buildOld, type At, type Opts, type Dir, type Kp } from './mocap.mts';
import { parseGlb, worldMatrices, animByName, xformPoint, xformDir, sub, add, mul, dot, cross, norm, len, type V3, type M4 } from './glb.mts';

type Label = typeof LABELS[number];
type P2 = [number, number];
export interface Opts2 extends Opts {
  /** Foreshortening kept on limbs and torso: 0 = drawn lengths (pure cut-out), 1 = full projection; clamped to 0.4..1.2. */
  fore?: number;
  /** Watch the mocap from this many degrees around the character (+ = toward its right): 90 turns a backward fall, which
   *  south would see end-on (squashed into a few px), into a sideways fall across the screen. */
  az?: number;
  /** Extra gain on the arms (below 1 calms flailing balance arms, which read as a T-pose at sprite size). */
  arms?: number;
}

// ponytail: mocap.mts keeps its glb handle, bone map and face points private; re-derived here instead of editing it.
const g = parseGlb(process.env.UAL1_GLB ?? 'C:/Users/shilo/Downloads/photon-fusion-godot-starter_3.0.0.407/3rdparty/universal_animation_library/UAL1.glb');
const ids = new Map<string, number>(g.json.nodes.map((n: any, i: number) => [n.name, i]));
const node = (n: string) => { const i = ids.get(n); if (i === undefined) throw new Error(`bone ${n} missing`); return i; };
const pos = (W: M4[], n: string) => xformPoint(W[node(n)], [0, 0, 0]);
const BONE: Partial<Record<Label, string>> = {
  NECK: 'neck_01', 'RIGHT SHOULDER': 'upperarm_r', 'RIGHT ELBOW': 'lowerarm_r', 'RIGHT ARM': 'hand_r', 'LEFT SHOULDER': 'upperarm_l', 'LEFT ELBOW': 'lowerarm_l', 'LEFT ARM': 'hand_l',
  'RIGHT HIP': 'thigh_r', 'RIGHT KNEE': 'calf_r', 'RIGHT LEG': 'foot_r', 'LEFT HIP': 'thigh_l', 'LEFT KNEE': 'calf_l', 'LEFT LEG': 'foot_l',
};
// [toward the character's LEFT, up, forward] meters from the Head bone in the bind pose (same measurements as mocap.mts).
const FACE: Partial<Record<Label, V3>> = { NOSE: [0, 0.10, 0.115], 'RIGHT EYE': [-0.035, 0.14, 0.10], 'LEFT EYE': [0.035, 0.14, 0.10], 'RIGHT EAR': [-0.087, 0.11, 0], 'LEFT EAR': [0.087, 0.11, 0] };

const BIND = worldMatrices(g, null, 0);
const UP: V3 = [0, 1, 0];
const flat = (v: V3): V3 => [v[0], 0, v[2]];
const RIGHT = norm(flat(sub(pos(BIND, 'upperarm_r'), pos(BIND, 'upperarm_l'))));
const FWD = cross(UP, RIGHT);
const rot3 = (W: M4) => [xformDir(W, [1, 0, 0]), xformDir(W, [0, 1, 0]), xformDir(W, [0, 0, 1])].map(norm);
const headBind = rot3(BIND[node('Head')]);
const faceBind = Object.fromEntries(Object.entries(FACE).map(([k, [l, u, f]]) => {
  const w = add(add(mul(RIGHT, -l), mul(UP, u)), mul(FWD, f));
  return [k, headBind.map((c) => dot(c, w)) as V3]; // head-local
})) as Record<string, V3>;

type Pose = Record<Label | 'PELVIS' | 'HEAD', V3>;
const mid = (a: V3, b: V3) => mul(add(a, b), 0.5);
const yawAbout = (p: V3, c: V3, a: number): V3 => { const d = sub(p, c), r = dot(d, RIGHT), f = dot(d, FWD);
  return add(c, add(add(mul(RIGHT, r * Math.cos(a) - f * Math.sin(a)), mul(FWD, r * Math.sin(a) + f * Math.cos(a))), mul(UP, dot(d, UP)))); };
const heading = (l: V3, r: V3) => { const v = sub(r, l); return Math.atan2(dot(v, FWD), dot(v, RIGHT)); };
const wrap = (a: number) => Math.atan2(Math.sin(a), Math.cos(a));
const UPPER: Label[] = ['RIGHT SHOULDER', 'RIGHT ELBOW', 'RIGHT ARM', 'LEFT SHOULDER', 'LEFT ELBOW', 'LEFT ARM', 'NOSE', 'RIGHT EYE', 'LEFT EYE', 'RIGHT EAR', 'LEFT EAR'];
const FACE_L = Object.keys(FACE) as Label[];

/** Mocap joints (meters), turned back to face forward (face share) and with part of the chest twist removed. */
function pose(W: M4[], face: number, twist: number): Pose {
  const p: any = { PELVIS: mid(pos(W, 'thigh_l'), pos(W, 'thigh_r')) };
  for (const [l, b] of Object.entries(BONE)) p[l] = pos(W, b!);
  const hc = rot3(W[node('Head')]), hp = pos(W, 'Head');
  for (const [l, v] of Object.entries(faceBind)) p[l] = add(hp, add(add(mul(hc[0], v[0]), mul(hc[1], v[1])), mul(hc[2], v[2])));
  const hips = heading(p['LEFT HIP'], p['RIGHT HIP']), chest = heading(p['LEFT SHOULDER'], p['RIGHT SHOULDER']);
  const tw = (1 - twist) * wrap(chest - hips);
  // The head keeps its own heading (runners hold it forward); untwisting it with the chest swings the face.
  for (const l of UPPER) if (!(l in FACE)) p[l] = yawAbout(p[l], p.NECK, -tw);
  p.HEAD = mid(p['LEFT EAR'], p['RIGHT EAR']);
  // Facing comes from the hips alone: averaging in the chest (as mocap.mts does) feeds half of every arm-swing twist
  // into the legs and head, which then yaw +-20 deg per stride in a jog.
  const h = face * hips;
  for (const l of Object.keys(p)) p[l] = yawAbout(p[l], p.PELVIS, -h);
  return p;
}
// Neutral stand: the bind pose (straight legs, upright spine, head level) with the T-pose arms hung straight down.
const NEUTRAL = (() => { const p = pose(BIND, 0, 1);
  for (const s of ['RIGHT', 'LEFT'] as const) {
    const sh = p[`${s} SHOULDER`], ua = len(sub(p[`${s} ELBOW`], sh)), fa = len(sub(p[`${s} ARM`], p[`${s} ELBOW`]));
    p[`${s} ELBOW`] = sub(sh, mul(UP, ua)); p[`${s} ARM`] = sub(sh, mul(UP, ua + fa));
  }
  return p; })();

// ---------- camera (same model and calibration as mocap.mts) ----------
const CAL = calibrate();
const E = CAL.elev * Math.PI / 180;
function camera(dir: Dir, az = 0) {
  // Camera bearing around the character, 0 = in front (south), + toward its right side; east is yawed toward the front.
  const t = ((dir === 'south' ? 0 : dir === 'north' ? 180 : 90 - CAL.yaw) + az) * Math.PI / 180;
  const H = norm(add(mul(RIGHT, Math.sin(t)), mul(FWD, Math.cos(t))));
  return { SX: cross(UP, H), V: add(mul(H, Math.cos(E)), mul(UP, Math.sin(E))), CU: sub(mul(UP, Math.cos(E)), mul(H, Math.sin(E))) };
}

const CELL = body.rig.cell.w;
const restPx = (dir: string) => Object.fromEntries(body.rig.rest[dir].keypoints.map((k: Kp) => [k.label, [k.x * CELL, k.y * CELL]])) as Record<Label, P2>;
const S = restPx('south');
const d2 = (a: P2, b: P2): P2 => [b[0] - a[0], b[1] - a[1]];
const l2 = (v: P2) => Math.hypot(v[0], v[1]);
const plus = (a: P2, b: P2, k = 1): P2 => [a[0] + b[0] * k, a[1] + b[1] * k];
const rot2 = (v: P2, a: number): P2 => [v[0] * Math.cos(a) - v[1] * Math.sin(a), v[0] * Math.sin(a) + v[1] * Math.cos(a)];
const mid2 = (a: P2, b: P2): P2 => [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2];
// px per mocap meter: legs for travel and foot height, drawn widths for hips/shoulders, drawn ear span for the (big) head.
const LEG_PX = l2(d2(S['RIGHT HIP'], S['RIGHT KNEE'])) + l2(d2(S['RIGHT KNEE'], S['RIGHT LEG']));
const LEG_SCALE = LEG_PX / (len(sub(NEUTRAL['RIGHT KNEE'], NEUTRAL['RIGHT HIP'])) + len(sub(NEUTRAL['RIGHT LEG'], NEUTRAL['RIGHT KNEE'])));
const HIP_SCALE = l2(d2(S['RIGHT HIP'], S['LEFT HIP'])) / len(sub(NEUTRAL['RIGHT HIP'], NEUTRAL['LEFT HIP']));
const SH_SCALE = l2(d2(S['RIGHT SHOULDER'], S['LEFT SHOULDER'])) / len(sub(NEUTRAL['RIGHT SHOULDER'], NEUTRAL['LEFT SHOULDER']));
const HEAD_SCALE = l2(d2(S['RIGHT EAR'], S['LEFT EAR'])) / len(sub(NEUTRAL['RIGHT EAR'], NEUTRAL['LEFT EAR']));
const ARM_PX = l2(d2(S['RIGHT SHOULDER'], S['RIGHT ELBOW'])) + l2(d2(S['RIGHT ELBOW'], S['RIGHT ARM']));

/** Same shape as mocap.mts build(). ref = a mocap frame drawn as the rest view; default: the neutral stand. */
export function build(frames: At[], dir: Dir, o: Opts2 = {}, ref: At | null = null) {
  const { face = 0, twist = 1, lean = 1, travel = 1, margin = 2, depth = true, gain = 1, legs = 1, fore = 0.5, az = 0, arms = 1 } = o;
  const cam = camera(dir, az), rest = restPx(dir);
  const pr = (v: V3): P2 => [dot(v, cam.SX), -dot(v, cam.CU)];
  const ang = (v: P2) => Math.atan2(v[1], v[0]);
  const N = ref ? pose(worldMatrices(g, animByName(g, ref[0]), ref[1]), face, twist) : NEUTRAL;
  const restHip = mid2(rest['RIGHT HIP'], rest['LEFT HIP']);
  const horiz = (v: V3) => sub(v, mul(UP, dot(v, UP)));

  const px = frames.map(([a, t]) => {
    const P = pose(worldMatrices(g, animByName(g, a), t), face, twist);
    const q = {} as Record<Label, P2>;
    /** Screen-angle change and foreshortening ratio of the mocap bone a->b against the neutral. */
    const turn = (a: Label | 'PELVIS', b: Label | 'HEAD') => {
      const vt = pr(norm(sub(P[b], P[a]))), vn = pr(norm(sub(N[b], N[a])));
      // A bone near the view axis has a tiny, erratic screen direction: fade its turn out below 70% projected length
      // (drawn shortened in its rest direction) instead of whipping a half-length limb sideways.
      const f = l2(vt) / l2(vn), w = Math.min(1, Math.max(0, (f - 0.25) / 0.45));
      return { da: w * wrap(ang(vt) - ang(vn)), k: Math.min(1.2, Math.max(0.4, f ** fore)) };
    };
    const bone = (from: P2, a: Label, b: Label, gn: number): P2 => {
      const { da, k } = turn(a, b);
      return plus(from, rot2(d2(rest[a], rest[b]), gn * da), 1 + gn * (k - 1));
    };
    /** Rigid offset (widths, face): drawn offset + gain x the change of its projected 3D offset. */
    const rigid = (from: P2, a: Label | 'PELVIS' | 'HEAD', b: Label, s: number, restFrom: P2): P2 =>
      plus(plus(from, d2(restFrom, rest[b])), d2(pr(sub(N[b], N[a])), pr(sub(P[b], P[a]))), gain * s);
    // Root: pelvis travel (horizontal share = travel); height comes from the foot pin below.
    const hip = plus(restHip, pr(horiz(sub(P.PELVIS, N.PELVIS))), LEG_SCALE * travel * gain);
    for (const s of ['RIGHT', 'LEFT'] as const) {
      q[`${s} HIP`] = rigid(hip, 'PELVIS', `${s} HIP`, HIP_SCALE, restHip);
      q[`${s} KNEE`] = bone(q[`${s} HIP`], `${s} HIP`, `${s} KNEE`, gain * legs);
      q[`${s} LEG`] = bone(q[`${s} KNEE`], `${s} KNEE`, `${s} LEG`, gain * legs);
    }
    const torso = turn('PELVIS', 'NECK');
    q.NECK = plus(hip, rot2(d2(restHip, rest.NECK), gain * lean * torso.da), 1 + gain * (torso.k - 1));
    for (const s of ['RIGHT', 'LEFT'] as const) {
      q[`${s} SHOULDER`] = rigid(q.NECK, 'NECK', `${s} SHOULDER`, SH_SCALE, rest.NECK);
      q[`${s} ELBOW`] = bone(q[`${s} SHOULDER`], `${s} SHOULDER`, `${s} ELBOW`, gain * arms);
      q[`${s} ARM`] = bone(q[`${s} ELBOW`], `${s} ELBOW`, `${s} ARM`, gain * arms);
    }
    // The drawn head rides the neck's screen angle at its drawn distance; only the face turns (yaw, nod) by projected deltas
    // about the head center, so a nod cannot pull the nose into the neck.
    const restHead = mid2(rest['RIGHT EAR'], rest['LEFT EAR']);
    const head = plus(q.NECK, rot2(d2(rest.NECK, restHead), gain * turn('NECK', 'HEAD').da));
    for (const l of FACE_L) q[l] = rigid(head, 'HEAD', l, HEAD_SCALE, restHead);
    // Arms and head ride the chest: undo the share of the torso turn that lean removed.
    for (const l of UPPER) q[l] = plus(q.NECK, rot2(d2(q.NECK, q[l]), -gain * (1 - lean) * torso.da));
    // Support foot (within 2 cm of the lowest) sits at its ground height: drawn rest foot + the mocap foot's projected
    // change (travel-scaled), so the hips bob with the body's own leg geometry and planted feet do not float or sink.
    const low = Math.min(P['RIGHT LEG'][1], P['LEFT LEG'][1]);
    const sup = (['RIGHT LEG', 'LEFT LEG'] as const).filter((l) => P[l][1] < low + 0.02);
    const dy = sup.reduce((acc, l) => {
      const ch = sub(sub(P[l], N[l]), mul(horiz(sub(P.PELVIS, N.PELVIS)), 1 - travel));
      return acc + rest[l][1] + pr(ch)[1] * LEG_SCALE * gain - q[l][1];
    }, 0) / sup.length;
    const z = (l: Label) => dot(sub(P[l], P.PELVIS), cam.V) * LEG_SCALE;
    return LABELS.map((l) => ({ label: l, x: q[l][0], y: q[l][1] + dy, z: z(l) }));
  });

  // One clip-wide shift keeps everything inside the cell (as mocap.mts).
  const all = px.flat(), lo = (v: number) => Math.max(0, margin - v), hi = (v: number) => Math.max(0, v - (CELL - margin));
  const dx = Math.max(...all.map((q) => lo(q.x))) - Math.max(...all.map((q) => hi(q.x)));
  const dy = Math.max(...all.map((q) => lo(q.y)));
  const clamp = (v: number) => Math.min(0.99, Math.max(0.01, v));
  const kz = 62 / ARM_PX;
  const out: Kp[][] = px.map((f) => f.map((q) => { const kp: Kp = { label: q.label, x: +clamp((q.x + dx) / CELL).toFixed(4), y: +clamp((q.y + dy) / CELL).toFixed(4) };
    if (depth) { kp.depth = Math.round(Math.min(255, Math.max(0, 128 + kz * q.z))); kp.z_index = Math.round((kp.depth - 128) / 16); }
    return kp; }));
  return { rest: body.rig.rest[dir].keypoints as Kp[], frames: out, meta: { dir, frames, ref, opts: { face, twist, lean, travel, margin, depth, gain, legs, fore, az, arms }, shift: [+dx.toFixed(1), +dy.toFixed(1)], scale: +LEG_SCALE.toFixed(2), elev: +CAL.elev.toFixed(1), yaw: +CAL.yaw.toFixed(1) } };
}

if (import.meta.main) {
  const SPRITE: Opts = { face: 1, twist: 0.5, lean: 0.6, travel: 0.5 };
  const near = (a: Kp[], b: Kp[], labels: readonly string[], msg: string) => a.forEach((k, i) => { if (labels.includes(k.label)) assert(Math.abs(k.x - b[i].x) < 2e-3 && Math.abs(k.y - b[i].y) < 2e-3, `${msg} ${k.label}`); });
  for (const dir of ['south', 'east', 'north'] as const) {
    // An explicit ref frame reproduces the drawn rest exactly; the bind pose (A_TPose clip) matches it below the arms.
    const r = build([['Idle_Loop', 0]], dir, { ...SPRITE, margin: 0 }, ['Idle_Loop', 0]);
    near(r.frames[0], r.rest, LABELS, `${dir} ref`);
    const t = build([['A_TPose', 0]], dir, { ...SPRITE, margin: 0 });
    near(t.frames[0], t.rest, ['NECK', 'RIGHT HIP', 'LEFT HIP', 'RIGHT KNEE', 'LEFT KNEE', 'RIGHT LEG', 'LEFT LEG', 'NOSE', 'RIGHT SHOULDER', 'LEFT SHOULDER'], `${dir} neutral`);
  }
  // Drawn bone lengths survive within the foreshortening clamp on every frame of a walk.
  const lim = (rest: Kp[], fr: Kp[][], a: string, b: string) => { const at = (f: Kp[], l: string) => f.find((k) => k.label === l)!, L = (f: Kp[]) => Math.hypot(at(f, a).x - at(f, b).x, at(f, a).y - at(f, b).y);
    for (const f of fr) { const k = L(f) / L(rest); assert(k > 0.39 && k < 1.21, `${a}-${b} length ${k}`); } };
  const w = build(span('Walk_Loop', 8), 'east', SPRITE);
  lim(w.rest, w.frames, 'RIGHT HIP', 'RIGHT KNEE'); lim(w.rest, w.frames, 'LEFT ELBOW', 'LEFT ARM');

  const sword = [0.1, 0.2, 0.28, 0.33, 0.37, 0.4, 0.44, 0.5, 0.62, 0.85, 1.1, 1.4].map((t): At => ['Sword_Attack', t]);
  const CLIPS: [string, At[], Opts][] = [
    ['walk', span('Walk_Loop', 8), SPRITE], ['run', span('Jog_Fwd_Loop', 8), SPRITE], ['run_tw1', span('Jog_Fwd_Loop', 8), { ...SPRITE, twist: 1 }],
    ['slash_k', sword, SPRITE],
    ['hurt', [['Idle_Loop', 0], ...span('Hit_Chest', 5, 0, 0.33, true)], { ...SPRITE, lean: 1 }],
    ['die', span('Death01', 10, 0, 2.4, true), { face: 1, twist: 0.5, lean: 1, travel: 0.6 }],
  ];
  for (const [id, fr, opts] of CLIPS) for (const dir of ['south', 'east'] as const) {
    const old = buildOld(fr, dir, opts), neu = build(fr, dir, opts);
    await strip(join(OUT, 'r2', `${id}_${dir}.old.png`), old.rest, old.frames);
    await strip(join(OUT, 'r2', `${id}_${dir}.new.png`), neu.rest, neu.frames);
    writeFileSync(join(OUT, 'r2', `${id}_${dir}.json`), JSON.stringify(neu.frames));
  }
  console.log('ok', CAL, `${join(OUT, 'r2')}`);
}
