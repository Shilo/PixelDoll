import {writeFileSync,readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {pathToFileURL} from 'node:url';
import {baseline,candidate,get,temp,here} from './probe.mts';
const {hasAll}=await import(pathToFileURL(temp+'baseline/app/src/lib/rig/poses.ts').href);
const rows:any[]=[],skipped:any[]=[];
for(const body of ['A','B','C','N']){
 const original=get('app/test/fixtures/bench/body'+body+'.json').rig;
 for(const a of original.animations)for(const dir of Object.keys(a.sources??{})){
  const before=baseline.decisiveAction(original,a.id,dir),after=candidate.decisiveAction(original,a.id,dir);
  const cases=[...[-.1,-.05,.05,.1].map(dx=>({name:'translate-x-'+dx,point:(p:any)=>({...p,x:p.x+dx}),cell:original.cell})),
   ...[-.1,-.05,.05,.1].map(dy=>({name:'translate-y-'+dy,point:(p:any)=>({...p,y:p.y+dy}),cell:original.cell})),
   {name:'reflect-x',point:(p:any)=>({...p,x:1-p.x}),cell:original.cell},
   {name:'reflect-and-swap',point:(p:any)=>({...p,x:1-p.x,label:p.label.replace(/^(RIGHT|LEFT)/,(s:string)=>s==='RIGHT'?'LEFT':'RIGHT')}),cell:original.cell},
   ...[16,32,64,96,128,256].map(size=>({name:'uniform-cell-'+size,point:(p:any)=>({...p}),cell:{w:size,h:size}}))];
  for(const c of cases){const r=structuredClone(original),ref=r.rest[dir],s=r.animations.find((x:any)=>x.id===a.id).sources[dir];r.cell=c.cell;ref.keypoints=ref.keypoints.map(c.point);if(s.keypoints)s.keypoints=s.keypoints.map((f:any[])=>f.map(c.point));if(s.measured)s.measured=s.measured.map((f:any[])=>f.map(c.point));
   const seq=s.measured??s.keypoints;if(!hasAll(ref.keypoints)||!seq?.every(hasAll)){skipped.push({body,id:a.id,dir,case:c.name});continue;}
   rows.push({body,id:a.id,dir,case:c.name,before,after,beforeTransformed:baseline.decisiveAction(r,a.id,dir),afterTransformed:candidate.decisiveAction(r,a.id,dir)});
  }
 }
}
const result={baselinePin:'c1024a0c',candidateHash:createHash('sha256').update(readFileSync(process.argv[2]??temp+'candidate/app/src/lib/items/items.ts')).digest('hex'),total:rows.length,skipped:skipped.length,baselineChanges:rows.filter(r=>r.before!==r.beforeTransformed),candidateChanges:rows.filter(r=>r.after!==r.afterTransformed),betweenImplementations:rows.filter(r=>r.beforeTransformed!==r.afterTransformed)};
writeFileSync(here+(process.argv[2]?'policy-invariance-results.json':'invariance-results.json'),JSON.stringify(result,null,2)+'\n');console.log(JSON.stringify(result));
