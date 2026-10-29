import { sub3,length3,type MotionFrame } from '../../lib/rig/motion.ts';
import { buildDocument,type MotionDocument } from './model.ts';
import type {PlantingPlan,PlantWindow} from '../../lib/rig/planting.ts';
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
/** Propose editable stance windows from the source confidence, then anchor the calibrated target.
 * The proposal is an authoring draft; actual soles and short running contacts still require review. */
export function proposePlanting(doc:MotionDocument,velocity?:[number,number]):PlantingPlan{
  const times=doc.clip.samples.map(s=>s.time),fit=buildDocument({...doc,planting:undefined,times,edits:{}}),estimated=contactMotion(fit.frames,times),v=velocity??(estimated?[estimated.velocity.x,estimated.velocity.z]:null);
  if(!v)throw new Error('No support intervals for a contact draft. Author the stance timing first.');
  const windows:PlantWindow[]=[],duration=doc.clip.duration;
  for(const foot of ['RIGHT LEG','LEFT LEG'] as const){
    const spans:{start:number;end:number}[]=[];let start=-1;
    for(let i=0;i<=fit.frames.length;i++){
      const supported=i<fit.frames.length&&(fit.frames[i].contacts[foot]?.weight??0)>=0.5;
      if(supported&&start<0)start=i;
      if(!supported&&start>=0){if(i-1>start)spans.push({start:times[start],end:times[i-1]});start=-1;}
    }
    if(doc.clip.loop&&spans.length>1&&spans[0].start===0&&Math.abs(spans.at(-1)!.end-duration)<1e-6){const first=spans.shift()!,last=spans.pop()!;spans.unshift({start:last.start-duration,end:first.end});}
    for(const span of spans){
      const mid=(span.start+span.end)/2,phase=mid<0?mid+duration:mid;let i=times.findIndex(t=>t>=phase);if(i<0)i=times.length-1;
      const a=Math.max(0,i-1),u=i===a?0:(phase-times[a])/(times[i]-times[a]),p=fit.frames[a].points[foot],q=fit.frames[i].points[foot];
      windows.push({foot,...span,fade:Math.min(0.04,(span.end-span.start)/4),anchor:[p[0]+(q[0]-p[0])*u+v[0]*mid,fit.reference[foot][1],p[2]+(q[2]-p[2])*u+v[1]*mid]});
    }
  }
  if(!windows.length)throw new Error('The sampled source has no usable stance spans. Author them explicitly.');
  return{version:1,velocity:v,windows};
}
/** Include full-support endpoints before filling the longest gaps; source timing stays explicit. */
export function contactSampling(doc:MotionDocument,count=12){
  if(!doc.planting||!doc.clip.loop)throw new Error('Contact sampling currently needs an authored looping motion.');
  const duration=doc.clip.duration,times=[0],spacing=0.010001;
  for(const w of doc.planting.windows)for(const time of [w.start+w.fade,w.end-w.fade]){
    const t=((time%duration)+duration)%duration;
    if(t<spacing||duration-t<spacing||times.some(v=>Math.abs(v-t)<spacing))continue;times.push(t);
  }
  if(times.length>count)throw new Error('Too many contact events for this render frame count.');
  times.sort((a,b)=>a-b);
  while(times.length<count){const gaps=times.map((t,i)=>({start:t,end:times[i+1]??duration})).sort((a,b)=>(b.end-b.start)-(a.end-a.start));const g=gaps[0];if(g.end-g.start<spacing*2)throw new Error('Motion is too short for the requested sample count.');times.push((g.start+g.end)/2);times.sort((a,b)=>a-b);}
  return{times,durations:times.map((t,i)=>Math.round((times[i+1]??duration)*1000)-Math.round(t*1000))};
}
