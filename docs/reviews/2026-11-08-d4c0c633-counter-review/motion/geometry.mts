import{mkdirSync,readFileSync,writeFileSync}from'node:fs';
import{execFileSync}from'node:child_process';
import{fileURLToPath,pathToFileURL}from'node:url';
import{createHash}from'node:crypto';
import assert from'node:assert/strict';
const root=fileURLToPath(new URL('../../../../',import.meta.url)),here=fileURLToPath(new URL('./',import.meta.url)),temp=here+'temp.local/';
mkdirSync(temp,{recursive:true});
const modules:any={},hashes:any={};
for(const[label,rev]of[['before','3eed2a9c'],['after','d4c0c633'],['old','50eeea36']]){
 const d=temp+label+'/';mkdirSync(d,{recursive:true});execFileSync('git',['archive','--format=tar','--output',temp+label+'.tar',rev,'app/src','app/package.json'],{cwd:root});execFileSync('tar',['-xf',temp+label+'.tar','-C',d]);
 modules[label]=await import(pathToFileURL(d+'app/src/lib/items/items.ts').href);hashes[label]=createHash('sha256').update(readFileSync(d+'app/src/lib/items/items.ts')).digest('hex');
}
const poses=await import(pathToFileURL(temp+'after/app/src/lib/rig/poses.ts').href);
const mid=(p:any[],a:string,b:string)=>{const x=p.find(q=>q.label===a)!,y=p.find(q=>q.label===b)!;return[(x.x+y.x)/2,(x.y+y.y)/2]};
const upper=/NOSE|NECK|SHOULDER|ELBOW|ARM|EYE|EAR/;
const turn=(p:any[],deg:number,kind:string)=>{const[hx,hy]=mid(p,'RIGHT HIP','LEFT HIP'),t=deg*Math.PI/180,c=Math.cos(t),s=Math.sin(t);return p.map(q=>kind==='all'||upper.test(q.label)||kind==='upper-hips'&&q.label.endsWith('HIP')?{...q,x:hx+(q.x-hx)*c-(q.y-hy)*s,y:hy+(q.x-hx)*s+(q.y-hy)*c}:{...q})};
const rig=(rest:any[],frame:any[])=>({cell:{w:64,h:64},rest:{south:{keypoints:rest}},animations:[{id:'run-dodge',sources:{south:{keypoints:[rest,frame,rest],measured:[rest,frame,rest]}}}]});
const rows:any[]=[],examples:any[]=[];
for(const body of['A','B','C','N']){
 const b=JSON.parse(execFileSync('git',['show',`d4c0c633:app/test/fixtures/bench/body${body}.json`],{cwd:root,encoding:'utf8'})).rig;
 for(const[dir,v]of Object.entries(b.rest)as[string,any][])for(const aspect of[.5,.75,1,1.5,2])for(const tilt of[-45,-30,-15,0,15,30,45]){
  let r=v.keypoints.map((p:any)=>({...p,x:.5+(p.x-.5)*aspect}));r=turn(r,tilt,'all');const[hx,hy]=mid(r,'RIGHT HIP','LEFT HIP');r=r.map((p:any)=>({...p,x:.5+(p.x-hx)*.42,y:.6+(p.y-hy)*.42}));
  for(const kind of['upper','all','upper-hips'])for(const deg of[-60,-45,-41,-40,-30,0,30,40,41,45,60]){
   const frame=turn(r,deg,kind);if(!poses.hasAll(r)||!poses.hasAll(frame))continue;const g=rig(r,frame),row={body,dir,aspect,tilt,kind,deg,before:modules.before.decisiveAction(g,'run-dodge','south'),after:modules.after.decisiveAction(g,'run-dodge','south'),old:modules.old.decisiveAction(g,'run-dodge','south')};rows.push(row);if(row.before&&!row.after&&Math.abs(deg)>=45)examples.push({...row,rest:r,frame});
  }
 }
}
const results={hashes,total:rows.length,changed:rows.filter(r=>r.before!==r.after),newFalseNegatives45plus:examples.slice(0,20),countsByKind:['upper','all','upper-hips'].map(kind=>({kind,total:rows.filter(r=>r.kind===kind).length,changed:rows.filter(r=>r.kind===kind&&r.before!==r.after).length,falseNegatives45plus:examples.filter(r=>r.kind===kind).length})),newPositives:rows.filter(r=>!r.before&&r.after)};
writeFileSync(here+'geometry-results.json',JSON.stringify(results,null,2)+'\n');console.log(JSON.stringify({total:rows.length,counts:results.countsByKind,newPositives:results.newPositives.length,examples:examples.slice(0,3).map(({rest,frame,...r})=>r)}));
