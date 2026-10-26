// Lists the animation clips in the mocap library with durations. Usage (spikes/api): node mocap/list.mts
import { parseGlb, animDuration } from './glb.mts';
const g = parseGlb(process.env.UAL1_GLB ?? 'C:/Users/shilo/Downloads/photon-fusion-godot-starter_3.0.0.407/3rdparty/universal_animation_library/UAL1.glb');
for (const a of g.json.animations) console.log(a.name.padEnd(32), animDuration(g, a).toFixed(2));
