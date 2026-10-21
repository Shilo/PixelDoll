// S3/K1: procedural keypoint sequences authored from ONE estimated rest pose per direction (px, 64x64 rig cell).
// Angles: screen degrees, 0 = +x, 90 = down, -90 = up. Tables are written for SOUTH/EAST; NORTH mirrors south (a -> 180-a)
// because in north view the character's right arm is on the viewer's right.
import { clonePose, setArm, rotate, shift, mid, UPPER } from './lib/skel.mjs';

const HIPS = ['RIGHT HIP', 'LEFT HIP'];
const mir = a => (a == null ? a : 180 - a);
// arms: [[rUpper, rFore] | null, [lUpper, lFore] | null] per frame; null = keep rest arm
function armSeq(rest, dir, frames, extra = () => p => p) {
  return frames.map(([r, l, opt = {}], i) => {
    let p = clonePose(rest);
    if (opt.dy || opt.dx) p = shift(p, UPPER, opt.dx || 0, opt.dy || 0);
    if (opt.lean) p = rotate(p, mid(p, HIPS), UPPER, dir === 'north' ? -opt.lean : opt.lean);
    const m = dir === 'north' ? mir : a => a;
    if (r) p = setArm(p, 'RIGHT', m(r[0]), m(r[1]));
    if (l) p = setArm(p, 'LEFT', m(l[0]), m(l[1]));
    if (opt.rz != null) for (const k of ['RIGHT ELBOW', 'RIGHT ARM']) p[k].z = opt.rz;
    return extra(i)(p);
  });
}

export const ACTIONS = {
  // one-handed overhead sword slash with the CHARACTER'S RIGHT arm: wind-up up/out -> overhead -> diagonal down across -> recover
  slash: (rest, dir) => dir === 'east'
    ? armSeq(rest, dir, [
      [[95, 80], null], [[-120, -150], null], [[-80, -60], null, { dx: 1 }], [[-20, 0], null, { dx: 1, dy: 1, lean: 6 }],
      [[30, 50], null, { dx: 1, dy: 1, lean: 8 }], [[70, 100], null, { dy: 1, lean: 4 }], [[85, 95], null], [[92, 88], null]])
    : armSeq(rest, dir, [
      [[100, 80], null], [[-150, -120], [70, 100]], [[-110, -80], [70, 100]], [[-30, 10], [60, 110], { dy: 1, rz: 2 }],
      [[40, 60], [70, 110], { dy: 1, rz: 2 }], [[70, 90], [80, 100], { dy: 1, rz: 2 }], [[90, 100], null], [[96, 92], null]]),
  // two-handed spell cast: raise both arms -> thrust both hands forward/centre -> release
  cast: (rest, dir) => dir === 'east'
    ? armSeq(rest, dir, [
      [[95, 85], [95, 85]], [[-100, -80], [-110, -90]], [[-80, -70], [-90, -80]], [[-85, -75], [-95, -85]],
      [[-5, 0], [-10, -5], { dx: 1, lean: 5 }], [[0, 5], [-5, 0], { dx: 1, lean: 5 }], [[60, 40], [65, 45]], [[90, 85], [90, 85]]])
    : armSeq(rest, dir, [
      [[105, 95], [75, 85]], [[150, 140], [30, 40]], [[-150, -120], [-30, -60]], [[-120, -100], [-60, -80]],
      [[30, 0], [150, 180], { rz: 2 }], [[35, 5], [145, 175], { dy: 1, rz: 2 }], [[70, 60], [110, 120]], [[98, 90], [82, 90]]]),
  // hit reaction, 6 frames: recoil (lean back / sideways, arms fling) -> recover
  hurt: (rest, dir) => dir === 'east'
    ? armSeq(rest, dir, [
      [[100, 90], null], [[-20, 30], [-10, 20], { lean: -12, dx: -1 }], [[-30, 20], [-20, 10], { lean: -16, dx: -2 }],
      [[20, 60], [30, 60], { lean: -8, dx: -1 }], [[70, 90], [70, 90], { lean: -3 }], [[92, 88], null]])
    : armSeq(rest, dir, [
      [[100, 85], [80, 95]], [[150, 120], [30, 60], { lean: -8, dy: -1 }], [[160, 130], [20, 50], { lean: -12, dy: -1 }],
      [[130, 110], [50, 70], { lean: -6 }], [[105, 95], [75, 85], { lean: -2 }], [[98, 90], [82, 90]]]),
  // death, 8 frames: stagger -> knees buckle -> kneel -> fall over to the floor (rotate upper body about the hips) -> lie still
  death: (rest, dir) => {
    const H0 = mid(rest, HIPS), out = []; // falls toward -x in every view
    const kneel = dy => { let p = shift(rest, [...UPPER, ...HIPS], 0, dy); for (const k of ['RIGHT KNEE', 'LEFT KNEE']) p[k].y = Math.min(rest[k].y + dy * 0.7, 58); for (const k of ['RIGHT LEG', 'LEFT LEG']) p[k].y = Math.min(rest[k].y, 60); return p; };
    const limp = p => setArm(setArm(p, 'RIGHT', dir === 'north' ? 80 : 100, dir === 'north' ? 85 : 95), 'LEFT', dir === 'north' ? 100 : 80, dir === 'north' ? 95 : 85);
    out.push(clonePose(rest));
    out.push(rotate(limp(rest), H0, UPPER, -6));
    out.push(limp(kneel(4)));
    out.push(limp(kneel(9)));
    // [upper-body rotation, leg angle from the hip (deg, 0 = +x; null = stay kneeling), extra hip drop]
    for (const [up, lg, dy] of [[-35, null, 10], [-65, 25, 11], [-90, 5, 12]]) {
      let p = limp(kneel(dy)); const H = mid(p, HIPS);
      if (lg != null) for (const side of ['RIGHT', 'LEFT']) { const hp = p[`${side} HIP`], a = lg * Math.PI / 180;
        p[`${side} KNEE`] = { ...p[`${side} KNEE`], x: hp.x + 8 * Math.cos(a), y: hp.y + 8 * Math.sin(a) };
        p[`${side} LEG`] = { ...p[`${side} LEG`], x: hp.x + 15 * Math.cos(a), y: hp.y + 15 * Math.sin(a) }; }
      out.push(rotate(p, H, UPPER, up));
    }
    out.push(clonePose(out[out.length - 1]));
    return out;
  },
};
// 3 key poses for the legacy 3-frame engine (wind-up, overhead, strike) — same tables as v3 slash frames 1, 2, 4.
export const legacySlash = (rest, dir) => { const f = ACTIONS.slash(rest, dir); return [f[1], f[2], f[4]]; };
