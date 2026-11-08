import { execFileSync } from 'node:child_process';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { fileURLToPath, pathToFileURL } from 'node:url';
import assert from 'node:assert/strict';
import * as after from '../../../../app/src/lib/items/items.ts';
import { LABELS } from '../../../../app/src/lib/rig/poses.ts';
import { makeImg } from '../../../../app/src/lib/image/png.ts';
const root=fileURLToPath(new URL('../../../../',import.meta.url)),here=fileURLToPath(new URL('./',import.meta.url)),scratch=here+'temp.local/';
const reviewedSource=readFileSync(root+'app/src/lib/items/items.ts'),pinnedSource=execFileSync('git',['show','3eed2a9c:app/src/lib/items/items.ts'],{cwd:root});
assert(reviewedSource.equals(pinnedSource),'Reviewed module drifted from 3eed2a9c.');
mkdirSync(scratch,{recursive:true});
execFileSync('git',['archive','--format=tar','--output',scratch+'before.tar','50eeea36','app/src','app/package.json'],{cwd:root});
execFileSync('tar',['-xf',scratch+'before.tar','-C',scratch]);
const before=await import(pathToFileURL(scratch+'app/src/lib/items/items.ts').href);
const px:Record<string,number[]>={NOSE:[32,10],NECK:[32,20],'RIGHT SHOULDER':[24,22],'LEFT SHOULDER':[40,22],'RIGHT ELBOW':[20,27],'LEFT ELBOW':[44,27],'RIGHT ARM':[20,35],'LEFT ARM':[44,35],'RIGHT HIP':[28,40],'LEFT HIP':[36,40],'RIGHT KNEE':[28,50],'LEFT KNEE':[36,50],'RIGHT LEG':[28,60],'LEFT LEG':[36,60],'RIGHT EYE':[30,9],'LEFT EYE':[34,9],'RIGHT EAR':[28,10],'LEFT EAR':[36,10]};
const rest=LABELS.map(label=>({label,x:px[label][0]/64,y:px[label][1]/64}));
const tip=(deg:number)=>rest.map(p=>{if(!/NOSE|NECK|SHOULDER|ELBOW|ARM|EYE|EAR/.test(p.label))return {...p};const t=deg*Math.PI/180,dx=p.x-.5,dy=p.y-40/64;return {...p,x:.5+dx*Math.cos(t)-dy*Math.sin(t),y:40/64+dx*Math.sin(t)+dy*Math.cos(t)}});
function run(module:any,id:string,dir:string,angle:number,kind:string){
 const poses=[rest,rest,tip(angle),rest,rest,rest];
 const rig:any={cell:{w:64,h:64},pivot:{x:32,y:60},baseItem:'base',baseHash:'sha256:test',directions:[{id:dir}],rest:{[dir]:{image:'sha256:test',keypoints:rest}},animations:[{id,cells:6,loop:false,frames:poses.map((_,cell)=>({cell,ms:100})),sources:{[dir]:{route:'skeleton-v3',reference:'sha256:test',keypoints:poses,measured:poses,provenance:[]}}}]};
 const cells=poses.map((p,i)=>{
  const base=makeImg(64,64),layer=makeImg(64,64),mask=new Uint8Array(4096),wr=p.find(v=>v.label==='RIGHT ARM')!;
  const length=kind==='empty-all'?0:kind==='empty-one'&&i===2?0:kind==='shrink'&&i===2?5:20;
  const rotate=kind==='flip'&&i===2?Math.PI:0;
  for(let s=0;s<length;s+=.25)for(const o of [-.5,.5]){const x=Math.floor(wr.x*64+s*Math.sin(rotate)+o*Math.cos(rotate)),y=Math.floor(wr.y*64-s*Math.cos(rotate)+o*Math.sin(rotate));if(x>=0&&y>=0&&x<64&&y<64){mask[y*64+x]=1;layer.data.set([150,90,40,255],(y*64+x)*4)}}
  return {key:`${id}/${dir}/${i}`,call:0,base,input:base,out:layer,layer,mask,area:mask.reduce((a,b)=>a+b,0),outBand:0,baseBand:0,specks:0,pinholes:0,shifted:false,offset:[0,0],stray:0,posed:true};
 });
 const q=module.itemQa(rig,module.slotOf('main_hand'),'green',cells,0);return {action:module.isAction(`${id}/${dir}`,rig),status:q.qa.status,failures:[...q.failCalls.values()].flat(),warnings:q.warnings};
}
const rows:any[]=[];
for(const id of ['run-dodge','dodge'])for(const dir of ['south','north'])for(const angle of [0,30,45,70])for(const kind of ['steady','shrink','empty-one','empty-all','flip'])rows.push({id,dir,angle,kind,before:run(before,id,dir,angle,kind),after:run(after,id,dir,angle,kind)});
const changed=rows.filter(r=>JSON.stringify(r.before)!==JSON.stringify(r.after));
assert(changed.every(r=>r.id==='run-dodge'&&r.angle===45));
for(const row of rows.filter(r=>r.kind==='empty-all'))assert(row.after.failures.some((f:string)=>f.startsWith('G4 ')));
for(const row of rows.filter(r=>r.kind==='empty-one'&&r.dir==='south'))assert(row.after.failures.some((f:string)=>f.startsWith('G4 ')));
for(const row of rows.filter(r=>r.id==='run-dodge'&&r.angle===45))assert.equal(JSON.stringify(row.after).replaceAll('run-dodge','dodge'),JSON.stringify(rows.find(r=>r.id==='dodge'&&r.dir===row.dir&&r.angle===row.angle&&r.kind===row.kind)!.after));
writeFileSync(here+'results.json',JSON.stringify({before:'50eeea36',after:'3eed2a9c',beforeSourceHash:createHash('sha256').update(readFileSync(scratch+'app/src/lib/items/items.ts')).digest('hex'),sourceHash:createHash('sha256').update(reviewedSource).digest('hex'),rows,changed},null,2)+'\n');
console.log(JSON.stringify({rows:rows.length,changes:changed.length,changesOutsideModerateGaitLean:changed.filter(r=>r.id!=='run-dodge'||r.angle!==45).length,changed:changed.map(({id,dir,angle,kind,before,after})=>({id,dir,angle,kind,before,after}))}));
