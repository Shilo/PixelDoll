// Offline CC0 source bake. Does not read a token or call PixelLab. Run from spikes/api.
import fs from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { sourcePose, clipLength, calibrate } from './mocap.mts';
import { completePose, type MotionClip, type MotionSample } from '../../../app/src/lib/rig/motion.ts';
const root=path.resolve(import.meta.dirname,'../../..'),out=path.join(root,'app/dev-fixtures/motion-lab');
fs.mkdirSync(out,{recursive:true});
const glbPath=process.env.UAL1_GLB??'C:/Users/shilo/Downloads/photon-fusion-godot-starter_3.0.0.407/3rdparty/universal_animation_library/UAL1.glb';
const reference=completePose(sourcePose(null));
const specs=[
  {id:'idle',name:'Breathing idle',source:'Idle_Loop',loop:true,speed:0},
  {id:'walk',name:'Walk',source:'Walk_Loop',loop:true,speed:0.85},
  {id:'run',name:'Run',source:'Jog_Fwd_Loop',loop:true,speed:2},
  {id:'attack',name:'Standing overhead strike',source:'Sword_Attack_Standing',loop:false,speed:0},
  {id:'hurt',name:'Chest hit reaction',source:'Hit_Chest',loop:false,speed:0},
  {id:'death',name:'Fall',source:'Death01',loop:false,speed:0},
];
const smooth=(v:number)=>{const t=Math.max(0,Math.min(1,v));return t*t*(3-2*t);};
const clips:MotionClip[]=specs.map(spec=>{
  const duration=Math.min(clipLength(spec.source),spec.id==='death'?2.2:Infinity),n=Math.ceil(duration*60);
  const samples:MotionSample[]=Array.from({length:n+1},(_,i)=>({time:duration*i/n,points:completePose(sourcePose([spec.source,duration*i/n])),contacts:{}}));
  const ground=Math.min(...samples.flatMap(s=>[s.points['RIGHT LEG'][1],s.points['LEFT LEG'][1]]));
  for(const sample of samples)for(const foot of ['RIGHT LEG','LEFT LEG'] as const){
    // Fixed clip ground plus smooth weighting avoids the old discontinuous lowest-ankle support switch.
    sample.contacts[foot]={weight:spec.id==='death'?0:smooth((ground+0.06-sample.points[foot][1])/0.06),target:sample.points[foot]};
  }
  return {id:spec.id,name:spec.name,source:spec.source,duration,loop:spec.loop,nominalSpeed:spec.speed,reference,samples,events:spec.id==='attack'?[{name:'impact',time:0.4}]:[]};
});
const fixtures=['c27man','chibi','body128'].map(id=>{
  const saved=JSON.parse(fs.readFileSync(path.join(root,`spikes/api/out/c25/${id}.json`),'utf8'));
  return{id,name:id==='c27man'?'Adult 64 px':id==='chibi'?'Chibi 64 px':'Adult 128 px',cell:saved.rig.cell,camera:calibrate(saved),directions:saved.rig.directions,
    references:Object.fromEntries(Object.entries<any>(saved.rig.rest).map(([dir,r])=>[dir,{keypoints:r.keypoints,png:saved.images[r.image]}]))};
});
const provenance={source:'Quaternius Universal Animation Library',license:'CC0-1.0',url:'https://quaternius.itch.io/universal-animation-library',sha256:createHash('sha256').update(fs.readFileSync(glbPath)).digest('hex')};
const json=JSON.stringify({version:1,provenance,camera:calibrate(),clips,fixtures});
fs.writeFileSync(path.join(out,'library.json'),json);
fs.writeFileSync(path.join(out,'LICENSE.txt'),fs.readFileSync(path.join(path.dirname(glbPath),'License.txt')));
console.log(JSON.stringify({bytes:Buffer.byteLength(json),clips:clips.map(c=>({id:c.id,duration:c.duration,samples:c.samples.length})),fixtures:fixtures.map(f=>f.name),provenance},null,2));
