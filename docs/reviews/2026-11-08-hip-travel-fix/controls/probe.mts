import {mkdirSync,readFileSync,writeFileSync} from 'node:fs';
import {execFileSync} from 'node:child_process';
import {fileURLToPath,pathToFileURL} from 'node:url';
import {createHash} from 'node:crypto';
import assert from 'node:assert/strict';
const here=fileURLToPath(new URL('./',import.meta.url)),root=fileURLToPath(new URL('../../../../',import.meta.url)),temp=here+'temp.local/';
const pin='c1024a0c';
mkdirSync(temp,{recursive:true});
for(const name of ['baseline','candidate']){
 const dir=temp+name+'/';mkdirSync(dir,{recursive:true});const tar=temp+name+'.tar';
 execFileSync('git',['archive','--format=tar','--output',tar,pin,'app/src','app/package.json'],{cwd:root});execFileSync('tar',['-xf',tar,'-C',dir]);
}
const path=temp+'candidate/app/src/lib/items/items.ts',original=readFileSync(path,'utf8');
const from="const from = (l: string, q: string) => Math.hypot(p[l].x - dx - rest[q].x, p[l].y - dy - rest[q].y);\n    const moved = Math.max(0, ...Object.keys(rest).filter(plausible).map((l) => Math.min(from(l, l), rest[mirror(l)] ? from(l, mirror(l)) : Infinity))) / H;\n    const rise = Math.max(-1, ...['RIGHT ARM', 'LEFT ARM'].filter(plausible).map((l) => (rest[l].y - (p[l].y - dy)) / H));";
const to="const offsets = [[dx, dy], ...['RIGHT HIP', 'LEFT HIP'].map(l => [p[l].x - rest[l].x, p[l].y - rest[l].y])];\n    const from = (l: string, q: string, offset: number[]) => Math.hypot(p[l].x - offset[0] - rest[q].x, p[l].y - offset[1] - rest[q].y);\n    const moved = Math.max(0, ...Object.keys(rest).filter(plausible).map(l => Math.min(...offsets.map(offset => Math.min(from(l,l,offset), rest[mirror(l)] ? from(l,mirror(l),offset) : Infinity))))) / H;\n    const rise = Math.max(-1, ...['RIGHT ARM', 'LEFT ARM'].filter(plausible).map(l => Math.min(...offsets.map(offset => (rest[l].y - (p[l].y - offset[1])) / H))));";
assert(original.includes(from));writeFileSync(path,original.replace(from,to));
const candidatePath=process.argv[2]??path,output=process.argv[3]??'results.json';
if(!/^[a-z0-9-]+\.json$/.test(output))throw new Error('Use an owned result file name');
const baseline=await import(pathToFileURL(temp+'baseline/app/src/lib/items/items.ts').href),candidate=await import(pathToFileURL(candidatePath).href);
const {hasAll,toApi,fromApi,authoredPoses}=await import(pathToFileURL(temp+'baseline/app/src/lib/rig/poses.ts').href);
const {newDocument,renderPoses}=await import(pathToFileURL(temp+'baseline/app/src/ui/motion-lab/model.ts').href);
const get=(p:string)=>JSON.parse(execFileSync('git',['show',pin+':'+p],{cwd:root,encoding:'utf8'}));
const rows:any[]=[],frames:any[]=[];
function decide(rig:any,id:string,dir:string){return{before:baseline.decisiveAction(rig,id,dir),after:candidate.decisiveAction(rig,id,dir)}}
function evaluate(rig:any,tag:string){for(const a of rig.animations)for(const dir of Object.keys(a.sources??{})){
 rows.push({tag,id:a.id,dir,...decide(rig,a.id,dir)});
 const src=a.sources[dir],seq=src.measured?.length&&src.measured.every(hasAll)?src.measured:src.keypoints;if(!seq)continue;
 for(let i=0;i<seq.length;i++)for(const swapHip of[false,true]){const r=structuredClone(rig),s=r.animations.find((x:any)=>x.id===a.id).sources[dir];
  const f=seq[i].map((p:any)=>swapHip&&p.label.endsWith('HIP')?{...p,label:p.label.startsWith('RIGHT')?'LEFT HIP':'RIGHT HIP'}:p);
  s.keypoints=[f];s.measured=[f];frames.push({tag,id:a.id,dir,frame:i,swapHip,...decide(r,a.id,dir)});
 }
}}
for(const b of['A','B','C','N']){
 const rig=get('app/test/fixtures/bench/body'+b+'.json').rig;evaluate(rig,'bench-'+b);
 for(const [dir,ref]of Object.entries(rig.rest)as[string,any][])for(const action of['idle','slash','cast','hurt','death']){
  const poses=authoredPoses(action,fromApi(ref.keypoints,rig.cell),dir,rig.cell.w).map((p:any)=>toApi(p,rig.cell));
  const r={cell:rig.cell,rest:{[dir]:ref},animations:[{id:action,sources:{[dir]:{keypoints:poses,measured:poses}}}]};evaluate(r,'authored-'+b);
 }
}
const library=get('app/dev-fixtures/motion-lab/library.json');
for(const fixture of library.fixtures)for(const clip of library.clips)for(const dir of['south','east','north','west']){
 const doc=newDocument(library,fixture,clip,dir as any),p=renderPoses(doc),rig={cell:{w:fixture.cell.w+2*doc.padding,h:fixture.cell.h+2*doc.padding},rest:{[dir]:{keypoints:p.result.rest}},animations:[{id:clip.id,sources:{[dir]:{keypoints:p.poses,measured:p.poses}}}]};evaluate(rig,'projected-'+fixture.id);
}
const ordinaryChanges=rows.filter(r=>r.before!==r.after),frameChanges=frames.filter(r=>r.before!==r.after);
const result={pin,baselineHash:createHash('sha256').update(original).digest('hex'),candidateHash:createHash('sha256').update(readFileSync(candidatePath)).digest('hex'),candidate:process.argv[2]?'Externally supplied candidate module, identified by source hash':'Per-joint minimum over midpoint and both individual-hip translations; same thresholds and all other checks unchanged',rowCount:rows.length,ordinaryChanges,frameCount:frames.length,frameChanges,counts:{stored:rows.filter(r=>r.tag.startsWith('bench')).length,authored:rows.filter(r=>r.tag.startsWith('authored')).length,projected:rows.filter(r=>r.tag.startsWith('projected')).length}};
writeFileSync(here+output,JSON.stringify(result,null,2)+'\n');console.log(JSON.stringify(result));
export{baseline,candidate,get,decide,temp,root,here};
