import { sub3,length3,type MotionFrame } from '../../lib/rig/motion.ts';
import { buildDocument,type MotionDocument } from './model.ts';
/** Fit a constant world velocity to the calibrated ankle paths, in target pixel units per second.
 * Contact confidence is a source heuristic; this measures requested geometry, not rendered sole contact. */
export function contactMotion(frames:MotionFrame[],times:number[]){
  if(frames.length!==times.length||times.some((t,i)=>!Number.isFinite(t)||(i>0&&t<=times[i-1])))throw new Error('Contact diagnostics need matching frames and strictly increasing source times.');
  const samples:{vx:number;vz:number;weight:number}[]=[];
  for(let i=1;i<frames.length;i++)for(const foot of ['RIGHT LEG','LEFT LEG'] as const){
    const confidence=Math.min(frames[i-1].contacts[foot]?.weight??0,frames[i].contacts[foot]?.weight??0),dt=times[i]-times[i-1];
    if(confidence<0.5)continue;
    const delta=sub3(frames[i].points[foot],frames[i-1].points[foot]);samples.push({vx:-delta[0]/dt,vz:-delta[2]/dt,weight:confidence*dt});
  }
  if(!samples.length)return null;
  const weight=samples.reduce((n,s)=>n+s.weight,0),x=samples.reduce((n,s)=>n+s.vx*s.weight,0)/weight,z=samples.reduce((n,s)=>n+s.vz*s.weight,0)/weight;
  return{velocity:{x,z},speed:Math.hypot(x,z),rms:Math.sqrt(samples.reduce((n,s)=>n+s.weight*((s.vx-x)**2+(s.vz-z)**2),0)/weight),supportSeconds:weight,samples:samples.length};
}
export function loopJointStep(frames:MotionFrame[]){
  if(frames.length<2)return 0;
  return Math.max(...Object.keys(frames[0].points).map(label=>length3(sub3(frames.at(-1)!.points[label],frames[0].points[label]))));
}
/** Dense source sampling avoids missing short running contacts between authored render poses.
 * Sparse manual pose edits are deliberately excluded rather than inventing their interpolation. */
export function templateContactMotion(doc:MotionDocument){
  const times=doc.clip.samples.map(s=>s.time),fit=buildDocument({...doc,times,edits:{}});
  return contactMotion(fit.frames,times);
}
