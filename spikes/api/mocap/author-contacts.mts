// Target-body stance authoring and before/after audit. No PixelLab calls.
import fs from 'node:fs';
import path from 'node:path';
import {newDocument,buildDocument,renderPoses,type MotionLibrary} from '../../../app/src/ui/motion-lab/model.ts';
import {proposePlanting,templateContactMotion,contactSampling} from '../../../app/src/ui/motion-lab/diagnostics.ts';
import {MOTION_EDGES,length3,sub3,dot3} from '../../../app/src/lib/rig/motion.ts';
const root=path.resolve(import.meta.dirname,'../../..'),out=path.join(root,'spikes/api/out/motion-targeted-2026-10-28');fs.mkdirSync(out,{recursive:true});
const library=JSON.parse(fs.readFileSync(path.join(root,'app/dev-fixtures/motion-lab/library.json'),'utf8')) as MotionLibrary;
const rows=[];
const angularStep=(fit:ReturnType<typeof buildDocument>)=>{let max=0;for(let i=1;i<fit.frames.length;i++)for(const[a,b]of MOTION_EDGES){const u=sub3(fit.frames[i-1].points[b],fit.frames[i-1].points[a]),v=sub3(fit.frames[i].points[b],fit.frames[i].points[a]);max=Math.max(max,Math.acos(Math.max(-1,Math.min(1,dot3(u,v)/length3(u)/length3(v))))*180/Math.PI)}return max};
for(const fixture of library.fixtures)for(const clip of library.clips.filter(c=>c.id==='walk'||c.id==='run')){
  const south=newDocument(library,fixture,clip,'south'),velocity=templateContactMotion(south)!.velocity;
  for(const direction of ['south','east','north'] as const){
    const doc=newDocument(library,fixture,clip,direction),before=buildDocument({...doc,times:clip.samples.map(s=>s.time)});
    doc.planting=proposePlanting(doc,[0,velocity.z]);
    Object.assign(doc,contactSampling(doc));
    const after=buildDocument({...doc,times:clip.samples.map(s=>s.time)}),full=after.frames.flatMap(f=>f.planting?.filter(c=>c.weight>0.999)??[]),maxError=Math.max(0,...full.map(c=>c.error));
    const maxLengthError=Math.max(...after.frames.flatMap(f=>MOTION_EDGES.map(([a,b])=>Math.abs(length3(sub3(f.points[a],f.points[b]))-length3(sub3(after.reference[a],after.reference[b]))))));
    let blocked:string|null=null;try{renderPoses(doc)}catch(e){blocked=(e as Error).message}
    const name=`${fixture.id}-${clip.id}-${direction}.json`;fs.writeFileSync(path.join(out,name),JSON.stringify(doc));
    rows.push({fixture:fixture.id,clip:clip.id,direction,file:name,plan:doc.planting,times:doc.times,durations:doc.durations,renderFullSupportSamples:buildDocument(doc).frames.flatMap(f=>f.planting?.filter(c=>c.weight>0.999)??[]).length,beforeContactFit:templateContactMotion({...doc,planting:undefined}),afterContactFit:templateContactMotion(doc),fullSupportSamples:full.length,maxAnchorError:maxError,maxLengthError,beforeMaxBoneStep:angularStep(before),afterMaxBoneStep:angularStep(after),issues:after.issues,blocked,ready:!blocked&&!after.issues.length&&maxError<0.1});
  }
}
fs.writeFileSync(path.join(out,'contact-authoring.json'),JSON.stringify({phase:'authored-contact-v1',paidRequests:0,rootPolicy:'One forward world speed per body/action, fitted to south target; lateral root speed authored zero across all native views.',rows},null,2));
console.log(JSON.stringify(rows.map(r=>({body:r.fixture,clip:r.clip,view:r.direction,support:r.fullSupportSamples,error:r.maxAnchorError,beforeStep:r.beforeMaxBoneStep,afterStep:r.afterMaxBoneStep,issues:r.issues.length,blocked:r.blocked})),null,2));
