// Offline before/after conversion evidence. Historical converter remains unchanged for reproduction.
import fs from 'node:fs';
import path from 'node:path';
import { build as oldBuild } from './retarget2.mts';
import { strip } from './mocap.mts';
import { newDocument,buildDocument,type MotionLibrary } from '../../../app/src/ui/motion-lab/model.ts';
const root=path.resolve(import.meta.dirname,'../../..'),out=path.join(root,'spikes/api/out/motion-lab-2026-10-28');fs.mkdirSync(out,{recursive:true});
const library=JSON.parse(fs.readFileSync(path.join(root,'app/dev-fixtures/motion-lab/library.json'),'utf8')) as MotionLibrary;
const comparisons=[];
for(const direction of ['south','east'] as const)for(const clip of library.clips){
  const doc=newDocument(library,library.fixtures[0],clip,direction),fit=buildDocument(doc);
  const old=oldBuild(doc.times.map(t=>[clip.source,t]),direction,{face:1,travel:doc.options.travel,gain:doc.options.gain});
  await strip(path.join(out,`before-${clip.id}-${direction}.png`),old.rest,old.frames);
  await strip(path.join(out,`after-${clip.id}-${direction}.png`),fit.rest,fit.frames.map(f=>f.keypoints));
  comparisons.push({clip:clip.id,source:clip.source,direction,padding:doc.padding,times:doc.times,correctedIssues:fit.issues});
}
const old=oldBuild([['Walk_Loop',0.5954],['Walk_Loop',0.5955]],'south',{face:1,travel:0.5});
const doc=newDocument(library,library.fixtures[0],library.clips.find(c=>c.id==='walk')!);doc.times=[0.5954,0.5955];doc.durations=[100,100];const current=buildDocument(doc);
const maxStep=(frames:{x:number;y:number}[][])=>Math.max(...frames[0].map((k,i)=>Math.hypot(k.x-frames[1][i].x,k.y-frames[1][i].y)*80));
const oldZero=oldBuild([['Walk_Loop',0],['Walk_Loop',0.6]],'south',{gain:0});doc.options.gain=0;const zero=buildDocument(doc);
const depthChange=(frames:{depth?:number}[][])=>Math.max(...frames[0].map((k,i)=>Math.abs((k.depth??128)-(frames[1][i].depth??128))));
const summary={supportSwitch:{beforeMaxPixelStep:maxStep(old.frames),afterMaxPixelStep:maxStep(current.frames.map(f=>f.keypoints))},zeroGain:{beforeMaxDepthChange:depthChange(oldZero.frames),afterMaxDepthChange:depthChange(zero.frames.map(f=>f.keypoints))},comparisons};
fs.writeFileSync(path.join(out,'conversion-comparison.json'),JSON.stringify(summary,null,2));console.log(JSON.stringify({supportSwitch:summary.supportSwitch,zeroGain:summary.zeroGain,cases:comparisons.length}));
