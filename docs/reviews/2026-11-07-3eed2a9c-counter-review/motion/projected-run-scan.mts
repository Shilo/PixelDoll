import {readFileSync,mkdirSync,writeFileSync}from'node:fs';import {pathToFileURL,fileURLToPath}from'node:url';import{execFileSync}from'node:child_process';import assert from'node:assert/strict';
import {decisiveAction}from'../../../../app/src/lib/items/items.ts';import{newDocument,renderPoses}from'../../../../app/src/ui/motion-lab/model.ts';
const root=fileURLToPath(new URL('../../../../',import.meta.url)),here=fileURLToPath(new URL('./',import.meta.url)),temp=here+'temp.local/run-scan/';mkdirSync(temp,{recursive:true});
assert(readFileSync(root+'app/src/lib/items/items.ts').equals(execFileSync('git',['show','3eed2a9c:app/src/lib/items/items.ts'],{cwd:root})));
execFileSync('git',['archive','--format=tar','--output',temp+'before.tar','50eeea36','app/src','app/package.json'],{cwd:root});execFileSync('tar',['-xf',temp+'before.tar','-C',temp]);
const before=await import(pathToFileURL(temp+'app/src/lib/items/items.ts').href);
const library=JSON.parse(readFileSync(root+'app/dev-fixtures/motion-lab/library.json','utf8'));let total=0;
for(const fixture of library.fixtures)for(const clip of library.clips.filter((x:any)=>x.id==='run'))for(const dir of['east','west','south','north']){
const doc=newDocument(library,fixture,clip,dir as any),r=renderPoses(doc);const rig:any={cell:{w:fixture.cell.w+2*doc.padding,h:fixture.cell.h+2*doc.padding},rest:{[dir]:{keypoints:r.result.rest}},animations:[{id:'run',sources:{[dir]:{keypoints:r.poses,measured:r.poses}}}]};
if(decisiveAction(rig,'run',dir as any)||before.decisiveAction(rig,'run',dir))continue;
for(let i=0;i<r.poses.length;i++)for(const label of['LEFT HIP','RIGHT HIP'])for(let x=.025;x<1;x+=.025)for(let y=.025;y<1;y+=.025){
const measured=[r.poses[i].map((p:any)=>p.label===label?{...p,x,y}:p)];rig.animations[0].sources[dir].measured=measured;total++;
if(decisiveAction(rig,'run',dir as any)&&!before.decisiveAction(rig,'run',dir)){const result={before:'50eeea36',after:'3eed2a9c',fixture:fixture.id,clip:clip.id,dir,i,label,x,y,rig,total};writeFileSync(here+'projected-run-scan-results.json',JSON.stringify(result,null,2)+'\n');console.log(JSON.stringify(result));process.exit(1);}
}
}
const result={before:'50eeea36',after:'3eed2a9c',fixtures:library.fixtures.map((f:any)=>f.id),clip:'run',directions:['east','west','south','north'],step:.025,noNewHits:true,total};writeFileSync(here+'projected-run-scan-results.json',JSON.stringify(result,null,2)+'\n');console.log(JSON.stringify(result));
