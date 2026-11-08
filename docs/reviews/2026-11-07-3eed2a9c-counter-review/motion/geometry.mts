import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import assert from 'node:assert/strict';
import { decisiveAction } from '../../../../app/src/lib/items/items.ts';
import { hasAll } from '../../../../app/src/lib/rig/poses.ts';
import type { Keypoint, Rig } from '../../../../app/src/lib/rig/rig.ts';

const root=fileURLToPath(new URL('../../../../',import.meta.url));
const here=fileURLToPath(new URL('./',import.meta.url));
const temp=here+'temp.local/geometry/';mkdirSync(temp,{recursive:true});
execFileSync('git',['archive','--format=tar','--output',temp+'before.tar','50eeea36','app/src','app/package.json'],{cwd:root});
execFileSync('tar',['-xf',temp+'before.tar','-C',temp]);
const before=await import(pathToFileURL(temp+'app/src/lib/items/items.ts').href);
const source=readFileSync(root+'app/src/lib/items/items.ts');
if(!source.equals(execFileSync('git',['show','3eed2a9c:app/src/lib/items/items.ts'],{cwd:root})))throw new Error('Source drift');
const upper=/NOSE|NECK|SHOULDER|ELBOW|ARM|EYE|EAR/;
const mid=(p:Keypoint[],a:string,b:string)=>{const r=p.find(k=>k.label===a)!,l=p.find(k=>k.label===b)!;return[(r.x+l.x)/2,(r.y+l.y)/2];};
const rotate=(p:Keypoint[],deg:number,onlyUpper:boolean)=>{
 const[hx,hy]=mid(p,'RIGHT HIP','LEFT HIP'),t=deg*Math.PI/180,c=Math.cos(t),s=Math.sin(t);
 return p.map(k=>!onlyUpper||upper.test(k.label)?{...k,x:hx+(k.x-hx)*c-(k.y-hy)*s,y:hy+(k.x-hx)*s+(k.y-hy)*c}:{...k});
};
const rig=(rest:Keypoint[],frame:Keypoint[])=>({cell:{w:64,h:64},rest:{south:{keypoints:rest}},animations:[{id:'walk',sources:{south:{measured:[rest,frame,rest]}}}]}) as unknown as Rig;
const decide=(rest:Keypoint[],frame:Keypoint[])=>{const r=rig(rest,frame);return{before:before.decisiveAction(r,'walk','south'),after:decisiveAction(r,'walk','south')};};
const rows:any[]=[];
for(const body of ['A','B','C','N']){
 const bench=JSON.parse(readFileSync(root+'app/test/fixtures/bench/body'+body+'.json','utf8')).rig;
 for(const [dir,view]of Object.entries(bench.rest) as [string,any][])
 for(const aspect of [0.5,0.75,1,1.5,2])for(const inclination of [-45,-30,-15,0,15,30,45]){
  let rest:Keypoint[]=view.keypoints.map((p:Keypoint)=>({...p,x:.5+(p.x-.5)*aspect}));
  rest=rotate(rest,inclination,false);
  // Uniformly scale the complete rig into the cell, leaving ample room for a 60 degree upper-body rotation.
  const[hx,hy]=mid(rest,'RIGHT HIP','LEFT HIP');
  rest=rest.map(p=>({...p,x:.5+(p.x-hx)*.42,y:.6+(p.y-hy)*.42}));
  for(const turn of [-60,-45,-30,0,30,45,60]){
   const frame=rotate(rest,turn,true);
   if(!hasAll(rest)||!hasAll(frame))throw new Error('Invalid property fixture');
   rows.push({body,dir,aspect,inclination,turn,...decide(rest,frame)});
  }
 }
}
// Both hips moving under an otherwise fixed trunk must remain nondecisive, even when the starting pose is inclined.
const hipRows:any[]=[];
for(const body of ['A','B','C','N']){
 const bench=JSON.parse(readFileSync(root+'app/test/fixtures/bench/body'+body+'.json','utf8')).rig;
 for(const [dir,view]of Object.entries(bench.rest) as [string,any][])
 for(const dx of [-.24,-.18,-.12,-.06,0,.06,.12,.18,.24])for(const dy of [-.18,-.12,-.06,0,.06,.12,.18]){
  const rest=view.keypoints as Keypoint[],frame=rest.map(p=>p.label.endsWith('HIP')?{...p,x:p.x+dx,y:p.y+dy}:{...p});
  if(hasAll(frame))hipRows.push({body,dir,dx,dy,...decide(rest,frame)});
 }
}
const missed=rows.filter(r=>Math.abs(r.turn)>=40&&!r.after),newSmallPositives=rows.filter(r=>Math.abs(r.turn)<40&&!r.before&&r.after);
assert.equal(missed.length,0,'Every coherent 45/60 degree lean must remain decisive');
assert.equal(newSmallPositives.length,0,'The calibration must not newly decide the 0/30 degree controls');
assert(hipRows.every(r=>!r.after),'Translating both hips under a fixed trunk must not decide');
const result={before:'50eeea36',after:'3eed2a9c',sourceHash:createHash('sha256').update(source).digest('hex'),
 property:{count:rows.length,missed,newSmallPositives,previousSmallPositives:rows.filter(r=>Math.abs(r.turn)<40&&r.before&&r.after),
 changes:rows.filter(r=>r.after!==r.before).length,
 byTurn:[-60,-45,-30,0,30,45,60].map(turn=>({turn,count:rows.filter(r=>r.turn===turn).length,beforeDecisive:rows.filter(r=>r.turn===turn&&r.before).length,afterDecisive:rows.filter(r=>r.turn===turn&&r.after).length})),
 changedExamples:rows.filter(r=>r.after!==r.before).slice(0,12)},
 translatedHips:{count:hipRows.length,decisive:hipRows.filter(r=>r.after),changes:hipRows.filter(r=>r.before!==r.after)}};
writeFileSync(here+'geometry-results.json',JSON.stringify(result,null,2)+'\n');
console.log(JSON.stringify({coherentCases:rows.length,missedLeans:missed.length,newSmallPositives:newSmallPositives.length,previousSmallPositives:result.property.previousSmallPositives.length,coherentChanges:result.property.changes,hipCases:hipRows.length,decisiveHipSlides:result.translatedHips.decisive.length,hipChanges:result.translatedHips.changes.length}));
