// Offline only: reuse historical retargets and frames, measure inputs, prepare controlled browser requests.
import fs from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { MOVES, seq } from '../x27/moves.mts';
import { body, calibrate } from '../mocap/mocap.mts';
import { parseGlb } from '../mocap/glb.mts';

const root = path.resolve(import.meta.dirname, '..');
const out = path.join(root, 'out/animation-research-2026-10-27');
fs.mkdirSync(out, { recursive: true });
const image = (b: string) => ({ type: 'base64', base64: b, format: 'png' });
const base64 = (dir: string) => body.images[body.rig.rest[dir].image];
type K = { label: string; x: number; y: number; depth?: number; z_index?: number };
const xy = (k: K[]) => k.map(({ label, x, y }) => ({ label, x, y }));
const rest = (dir: string): K[] => body.rig.rest[dir].keypoints;
const looks = 'a bald human man with plain bare skin, barefoot and empty hands';
const cases: any[] = [];
function skeleton(id: string, dir: string, frames: K[][], action: string, options: { seed?: number; reference?: K[]; first?: string; group?: string; durations?: number | number[] } = {}) {
  cases.push({ id, group: options.group ?? 'motion', durations: options.durations ?? 120, estimate: 3, path: '/animate-with-skeleton-v3', body: {
    description: looks, action, direction: dir, view: 'low top-down', first_frame: image(options.first ?? base64(dir)),
    first_frame_keypoints: options.reference ?? rest(dir), keypoints: frames, seed: options.seed ?? 7, no_background: true,
  } });
}
for (const dir of ['south', 'east']) {
  for (const seed of [7, 17]) skeleton(`hold_${dir}_${seed}`, dir, Array.from({ length: 8 }, () => xy(rest(dir))), 'standing still', { seed, group: 'reference' });
  const shifted = rest(dir).map(k => ({ ...k, y: k.y - 4 / body.rig.cell.h }));
  skeleton(`hold_badref_${dir}`, dir, Array.from({ length: 8 }, () => xy(rest(dir))), 'standing still', { reference: shifted, group: 'reference' });
  const walk = body.rig.animations.find((a: any) => a.id === 'walk').sources[dir].keypoints;
  skeleton(`stored_walk_${dir}`, dir, walk.map(xy), 'walking');
  for (const name of ['walk', 'walk2', 'slash2', 'die2s']) {
    const m = MOVES.find(m => m.id === name)!;
    const frames = seq(m, dir as any).frames;
    skeleton(`${name}_${dir}_depth`, dir, frames, m.action, {durations:m.ms});
    if (name === 'slash2') {
      skeleton(`${name}_${dir}_xy`, dir, frames.map(xy), m.action, {durations:m.ms});
      skeleton(`${name}_${dir}_short`, dir, frames, 'attack', {durations:m.ms});
    }
  }
  // Repeated, unclamped lying pose isolates pose transfer from an internally changing target sequence.
  const lying = seq(MOVES.find(m=>m.id==='die2s')!,dir as any).frames[7];
  const lyingFirst=fs.readFileSync(path.join(root,`out/x27/M2/body_die2s_${dir}.7.png`)).toString('base64');
  skeleton(`lying_from_standing_${dir}`,dir,Array.from({length:8},()=>xy(lying)),'lying still, no effects',{group:'lying'});
  skeleton(`lying_from_lying_${dir}`,dir,Array.from({length:8},()=>xy(lying)),'lying still, no effects',{group:'lying',first:lyingFirst,reference:xy(lying)});
  const fallMove=MOVES.find(m=>m.id==='die2s')!,fall=seq(fallMove,dir as any).frames;
  skeleton(`die2s_repairedlast_${dir}`,dir,[...fall.slice(0,-1),fall.at(-2)!],fallMove.action,{group:'fall settle',durations:fallMove.ms});
  cases.push({ id: `text_attack_${dir}`, group: 'alternative', estimate: 1, path: '/animate-with-text-v3', body: {
    first_frame: image(base64(dir)), last_frame: image(base64(dir)), frame_count: 8, seed: 7, no_background: true,
    action: 'A single controlled empty-hand overhead strike with anticipation, a planted stance, weight transfer, follow-through and recovery to the original stance. Empty hands, no props, no effects.',
  } });
}
// A control for shape/size, not a claim of universal retargeting. These holds have no motion conversion.
for (const name of ['chibi', 'body128']) {
  const b = JSON.parse(fs.readFileSync(path.join(root, `out/c25/${name}.json`), 'utf8'));
  const dir = 'south';
  cases.push({ id: `hold_${name}_south`, group: 'shape', estimate: 3, path: '/animate-with-skeleton-v3', body: {
    description: name === 'chibi' ? 'a short stocky chibi dwarf' : 'a human character', action: 'standing still', direction: dir,
    view: 'low top-down', first_frame: image(b.images[b.rig.rest[dir].image]), first_frame_keypoints: b.rig.rest[dir].keypoints,
    keypoints: Array.from({ length: 8 }, () => xy(b.rig.rest[dir].keypoints)), seed: 7, no_background: true,
  } });
}
const edges = [['RIGHT SHOULDER','RIGHT ELBOW'], ['RIGHT ELBOW','RIGHT ARM'], ['LEFT SHOULDER','LEFT ELBOW'], ['LEFT ELBOW','LEFT ARM'], ['RIGHT HIP','RIGHT KNEE'], ['RIGHT KNEE','RIGHT LEG'], ['LEFT HIP','LEFT KNEE'], ['LEFT KNEE','LEFT LEG']];
const W = body.rig.cell.w;
const distance = (a: K, b: K) => Math.hypot(a.x - b.x, a.y - b.y) * W;
const center = (f: K[]) => {
  const a = f.find(k => k.label === 'RIGHT HIP')!, b = f.find(k => k.label === 'LEFT HIP')!;
  return { x: (a.x+b.x)/2, y: (a.y+b.y)/2 };
};
const range = (ns: number[]) => Math.max(...ns)-Math.min(...ns);
const audit = cases.filter(c => c.body.keypoints).map(c => {
  const frames: K[][] = c.body.keypoints, reference: K[] = c.body.first_frame_keypoints;
  const mapped = (f: K[]) => Object.fromEntries(f.map(k => [k.label, k]));
  const rm = mapped(reference), maps = frames.map(mapped);
  const ratios = maps.flatMap(f => edges.map(([a,b]) => distance(f[a],f[b])/distance(rm[a],rm[b])));
  const hips = frames.map(center);
  const jointSteps = frames.slice(1).flatMap((f,i) => f.map((k,j) => distance(k,frames[i][j])));
  return { id: c.id, minBoneRatio: Math.min(...ratios), maxBoneRatio: Math.max(...ratios),
    hipRangeX: range(hips.map(h=>h.x))*W, hipRangeY: range(hips.map(h=>h.y))*W,
    maxJointStep: Math.max(...jointSteps), loopClosureMax: Math.max(...frames[0].map((k,i)=>distance(k,frames.at(-1)![i]))),
    boundaryClampedJoints: frames.flat().filter(k => k.x <= 0.01001 || k.y <= 0.01001 || k.x >= 0.98999 || k.y >= 0.98999).length };
});
const glbPath = process.env.UAL1_GLB ?? 'C:/Users/shilo/Downloads/photon-fusion-godot-starter_3.0.0.407/3rdparty/universal_animation_library/UAL1.glb';
const glb = parseGlb(glbPath);
const input = { date: '2026-10-27', cap: 1000, pilotEstimate: cases.reduce((n,c)=>n+c.estimate,0), cases };
fs.writeFileSync(path.join(out,'inputs.json'),JSON.stringify(input));
fs.writeFileSync(path.join(out,'offline-audit.json'),JSON.stringify({ calibration:calibrate(),
  glb: { sha256:createHash('sha256').update(fs.readFileSync(glbPath)).digest('hex'), generator:glb.json.asset,
    animations:glb.json.animations.map((a:any)=>a.name), samplerInterpolations:[...new Set(glb.json.animations.flatMap((a:any)=>a.samplers.map((s:any)=>s.interpolation??'LINEAR')))] }, audit }, null, 2));
for (const dir of ['south','east']) fs.writeFileSync(path.join(out,`reference_${dir}.png`),Buffer.from(base64(dir),'base64'));
console.log(JSON.stringify({ cases: cases.length, estimate: input.pilotEstimate, calibration:calibrate(), audit },null,2));
