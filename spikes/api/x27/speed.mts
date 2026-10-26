// Prints a clip's right/left hand height and speed over time (to pick key poses). Usage: node x27/speed.mts <clip> [step]
import { parseGlb, worldMatrices, animByName, animDuration, xformPoint, sub, len } from '../mocap/glb.mts';
const g = parseGlb(process.env.UAL1_GLB ?? 'C:/Users/shilo/Downloads/photon-fusion-godot-starter_3.0.0.407/3rdparty/universal_animation_library/UAL1.glb');
const a = animByName(g, process.argv[2]), D = animDuration(g, a), dt = +(process.argv[3] ?? 0.0333);
const id = (n: string) => g.json.nodes.findIndex((x: any) => x.name === n), P = (W: any, n: string) => xformPoint(W[id(n)], [0, 0, 0]);
let prev: any = null;
for (let t = 0; t <= D + 1e-6; t += dt) { const W = worldMatrices(g, a, t), r = P(W, 'hand_r'), l = P(W, 'hand_l'), pel = P(W, 'pelvis');
  const v = prev ? len(sub(r, prev)) / dt : 0; prev = r;
  console.log(t.toFixed(3), 'R y', r[1].toFixed(2), 'speed', v.toFixed(1).padStart(5), '#'.repeat(Math.round(v * 2)).padEnd(30), 'L y', l[1].toFixed(2), 'pelvis y', pel[1].toFixed(2)); }
