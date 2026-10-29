// Select inspectable frozen candidates, not automatic professional acceptance. No API calls.
import fs from 'node:fs';
import path from 'node:path';
import {newDocument,buildDocument,type MotionLibrary} from '../../../app/src/ui/motion-lab/model.ts';
import {templateContactMotion,loopJointStep} from '../../../app/src/ui/motion-lab/diagnostics.ts';
const root=path.resolve(import.meta.dirname,'../../..'),out=path.join(root,'spikes/api/out/motion-lab-2026-10-28');
const read=(name:string)=>JSON.parse(fs.readFileSync(path.join(out,name),'utf8'));
const summary=read('qualification-summary.json'),reports=read('render-analysis.json'),equipment=read('equipment-analysis.json'),evidence=read('evidence.json');
const library=JSON.parse(fs.readFileSync(path.join(root,'app/dev-fixtures/motion-lab/library.json'),'utf8')) as MotionLibrary;
const latest=new Map(summary.cases.map((c:any)=>[c.jobId,c]));
const groups=Map.groupBy(reports.records.filter((r:any)=>latest.has(r.jobId)),(r:any)=>[r.fixture,r.clip,r.direction].join('/'));
const presets=[];
for(const [key,rows]of groups){
  const score=(r:any)=>(r.review?.status==='accepted'?-1000000:0)+r.playbackBorderPixels.reduce((a:number,b:number)=>a+b,0)*1000+r.playbackDetachedPixels.reduce((a:number,b:number)=>a+b,0)*10+r.seed;
  const chosen=[...rows].sort((a:any,b:any)=>score(a)-score(b))[0] as any,record=evidence.records.findLast((r:any)=>r.jobId===chosen.jobId),tested=equipment.rows.filter((r:any)=>r.bodyId===chosen.jobId);
  const fixture=library.fixtures.find(f=>f.id===chosen.fixture)!,clip=library.clips.find(c=>c.id===chosen.clip)!,doc=newDocument(library,fixture,clip,chosen.direction),fit=buildDocument(doc);
  // Report the current authored geometry separately; paid frames retain their exact historical request.
  const status=chosen.review?.status==='accepted'?'reviewed-experimental':chosen.playbackDetachedPixels.some((n:number)=>n>0)||chosen.playbackBorderPixels.some((n:number)=>n>0)?'needs-work':'candidate';
  presets.push({key,jobId:chosen.jobId,seed:chosen.seed,status,professionalQualification:false,reference:latest.get(chosen.jobId),bodyDiagnostics:{borderPixels:chosen.playbackBorderPixels,detachedPixels:chosen.playbackDetachedPixels},equipment:tested.length?{status:tested.every((r:any)=>r.status==='pass')?'passed-tested-cases':'failed',cases:tested.map((r:any)=>({equipment:r.equipment,status:r.status,jobId:r.jobId,failures:r.failures}))}:{status:'untested',cases:[]},currentGeometry:{revision:doc.revision,contactFit:templateContactMotion(doc),loopJointStep:clip.loop?loopJointStep(fit.frames):null,note:'Dense current template, excluding manual edits, in target pixel units. Ankle proxies, not measured rendered soles or engine speed.'},alternatives:(rows as any[]).filter(r=>r.jobId!==chosen.jobId).map(r=>({jobId:r.jobId,seed:r.seed,detachedPixels:r.playbackDetachedPixels,borderPixels:r.playbackBorderPixels})),review:record?.review??null});
}
const catalog={version:1,date:'2026-10-28',paidRequests:0,source:library.provenance,presets,limits:['Ranking by pixel diagnostics does not judge naturalness','Only explicit saved reviews count as reviewed','Equipment approval applies only to the exact tested body frames and layers','No Studio defaults changed']};
fs.writeFileSync(path.join(out,'preset-catalog.json'),JSON.stringify(catalog,null,2));
fs.writeFileSync(path.join(root,'docs/research/2026-10-28-motion-preset-catalog.json'),JSON.stringify(catalog,null,2)+'\n');
console.log(JSON.stringify({presets:presets.length,statuses:Object.fromEntries([...Map.groupBy(presets,p=>p.status)].map(([k,v])=>[k,v.length]))}));
