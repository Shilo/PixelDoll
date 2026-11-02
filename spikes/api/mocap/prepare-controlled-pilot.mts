// Offline only. Two eight-frame raw controls share the exact imported adult artwork.
import fs from 'node:fs';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {completePose,sub3} from '../../../app/src/lib/rig/motion.ts';
import {newDocument,buildDocument,validateDocument,type MotionLibrary} from '../../../app/src/ui/motion-lab/model.ts';
const root=path.resolve(import.meta.dirname,'../../..'),out=path.join(root,'spikes/api/out/workflow-reconciliation-2026-11-01');
const library=JSON.parse(fs.readFileSync(path.join(root,'app/dev-fixtures/motion-lab/library.json'),'utf8')) as MotionLibrary;
const fixture=structuredClone(library.fixtures.find(f=>f.id==='c27man')!),clip=library.clips.find(c=>c.id==='attack')!,native=process.argv.includes('--native-depth');
if(native){const imported=JSON.parse(fs.readFileSync(path.join(out,'verified-import.json'),'utf8')).pilot;if(imported.verification?.length!==4||imported.verification.some((v:{changedPixels:number})=>v.changedPixels))throw new Error('Exact imported reference verification is required.');for(const [direction,hash]of Object.entries(imported.source))if(createHash('sha256').update(Buffer.from(fixture.references[direction as keyof typeof fixture.references]!.png,'base64')).digest('hex')!==hash)throw new Error('Imported artwork differs from the controlled source.');
  const points=completePose(Object.fromEntries(Object.entries(imported.character.skeletons['3d'].keypoints as Record<string,number[]>).map(([name,v])=>[name,[v[0],v[2],-v[1]]])));fixture.depthReference=Object.fromEntries(Object.entries(points).map(([name,v])=>[name,sub3(v,points.PELVIS)]));fixture.depthSource=`PixelLab static imported rest estimate, [x,z,-y], exact reference ${imported.characterId}`;fixture.name+=' / provider-depth control';}
const report=[];fs.mkdirSync(out,{recursive:true});
for(const direction of ['south','east'] as const){
  const doc=newDocument(library,fixture,clip,direction);doc.times=[0,0.15,0.27,0.37,0.44,0.62,1.1,clip.duration];if(doc.times.some((t,i)=>i>0&&t<=doc.times[i-1]))throw new Error('The selected source duration no longer fits this authored timing.');
  doc.durations=doc.times.map((t,i)=>i<doc.times.length-1?Math.round((doc.times[i+1]-t)*1000):140);doc.buffer=false;doc.hands='closed-fists';
  const rest=buildDocument(doc).reference;doc.planting={version:1,velocity:[0,0],windows:(['RIGHT LEG','LEFT LEG']as const).map(foot=>({foot,start:0,end:clip.duration,fade:0,anchor:[...rest[foot]]}))};
  validateDocument(doc);const fit=buildDocument(doc),issues=[...new Set(fit.frames.flatMap(f=>f.issues))];if(issues.length)throw new Error(direction+': '+issues.join('; '));
  const file=`raw-${native?'native-depth':'control'}-${direction}.json`;fs.writeFileSync(path.join(out,file),JSON.stringify(doc));report.push({direction,file,frames:doc.times.length,source:clip.source,duration:clip.duration,renderSeed:731,times:doc.times,durations:doc.durations,issues,depthSource:fixture.depthSource??'Quaternius proxy',maxAnchorError:Math.max(...fit.frames.flatMap(f=>(f.planting??[]).map(p=>p.error))),note:'Fixed requested ankle anchors are geometry checks, not measured rendered soles. Raw and managed clips use different motion authoring; a complete-workflow comparison, not isolated renderer causality.'});
}
fs.writeFileSync(path.join(out,`raw-${native?'native-depth':'control'}-plan.json`),JSON.stringify(report,null,2));console.log(JSON.stringify(report,null,2));
