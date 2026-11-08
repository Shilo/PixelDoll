import {mkdirSync,readFileSync,writeFileSync,existsSync} from 'node:fs';
import {execFileSync} from 'node:child_process';
import {fileURLToPath,pathToFileURL} from 'node:url';
import {createHash} from 'node:crypto';
import assert from 'node:assert/strict';
const here=fileURLToPath(new URL('./',import.meta.url)),root=fileURLToPath(new URL('../../../../',import.meta.url)),temp=here+'temp.local/';
const modulePath=process.argv[2];if(!modulePath)throw new Error('Pass the complete candidate items.ts path');
mkdirSync(temp+'baseline/',{recursive:true});
if(!existsSync(temp+'baseline/app/src/lib/items/items.ts')){execFileSync('git',['archive','--format=tar','--output',temp+'baseline.tar','c1024a0c','app/src','app/package.json'],{cwd:root});execFileSync('tar',['-xf',temp+'baseline.tar','-C',temp+'baseline/']);}
const source=readFileSync(temp+'baseline/app/src/lib/items/items.ts');assert(source.equals(execFileSync('git',['show','c1024a0c:app/src/lib/items/items.ts'],{cwd:root})));
const before=await import(pathToFileURL(temp+'baseline/app/src/lib/items/items.ts').href),after=await import(pathToFileURL(modulePath).href),{LABELS,hasAll}=await import(pathToFileURL(temp+'baseline/app/src/lib/rig/poses.ts').href),{makeImg}=await import(pathToFileURL(temp+'baseline/app/src/lib/image/png.ts').href);
const px:Record<string,[number,number]>={NOSE:[32,10],NECK:[32,20],'RIGHT SHOULDER':[24,22],'LEFT SHOULDER':[40,22],'RIGHT ELBOW':[20,27],'LEFT ELBOW':[44,27],'RIGHT ARM':[20,35],'LEFT ARM':[44,35],'RIGHT HIP':[28,40],'LEFT HIP':[36,40],'RIGHT KNEE':[28,50],'LEFT KNEE':[36,50],'RIGHT LEG':[28,60],'LEFT LEG':[36,60],'RIGHT EYE':[30,9],'LEFT EYE':[34,9],'RIGHT EAR':[28,10],'LEFT EAR':[36,10]};
const rest=LABELS.map((label:string)=>({label,x:px[label][0]/64,y:px[label][1]/64}));
const pose=(lean:number,swing:number)=>rest.map((p:any)=>{const upper=/NOSE|NECK|SHOULDER|ELBOW|ARM|EYE|EAR/.test(p.label),leg=/^LEFT (KNEE|LEG)$/.test(p.label),t=(upper?lean:leg?swing:0)*Math.PI/180,hx=leg?.5625:.5,dx=p.x-hx,dy=p.y-.625;return{...p,x:hx+dx*Math.cos(t)-dy*Math.sin(t),y:.625+dx*Math.sin(t)+dy*Math.cos(t)}});
function judge(m:any,size:number,slot:string,id:string,dir:string,motion:string,kind:string){
 const lean=motion==='rest'?0:motion==='residual'?35:60,swing=motion==='residual'?60:0,f=pose(lean,swing),frames=[rest,rest,f,rest,rest,rest];
 const measured=frames.map((p,i)=>motion==='residual'&&i===2?p.map((q:any)=>q.label==='LEFT HIP'?{...q,x:.175,y:.525}:q):p);
 assert(frames.every(hasAll)&&measured.every(hasAll));
 const rig:any={cell:{w:size,h:size},pivot:{x:size/2,y:size*60/64},baseItem:'body',baseHash:'sha256:test',directions:[{id:dir}],rest:{[dir]:{image:'sha256:test',keypoints:rest}},animations:[{id,cells:6,loop:false,frames:frames.map((_,cell)=>({cell,ms:100})),sources:{[dir]:{route:'skeleton-v3',reference:'sha256:test',keypoints:frames,measured,provenance:[]}}}]};
 const cells=frames.map((p,i)=>{const base=makeImg(size,size),layer=makeImg(size,size),mask=new Uint8Array(size*size),w=p.find((p:any)=>p.label===(slot==='off_hand'?'LEFT ARM':'RIGHT ARM'))!,deg=i===2?(kind==='flip'?lean+180:lean):0,t=deg*Math.PI/180;
  const length=kind==='empty-all'||kind==='empty-one'&&i===2?0:kind==='size'&&i>=3?8:16,scale=size/64;
  for(let s=0;s<length*scale;s+=.25)for(let o=-scale;o<scale;o+=.5){const x=Math.floor(w.x*size+s*Math.sin(t)+o*Math.cos(t)),y=Math.floor(w.y*size-s*Math.cos(t)+o*Math.sin(t));if(x>=0&&y>=0&&x<size&&y<size){const q=y*size+x;mask[q]=1;layer.data.set([130,80,40,255],q*4);}}
  return{key:`${id}/${dir}/${i}`,call:0,base,input:base,out:layer,layer,mask,area:mask.reduce((a,b)=>a+b,0),outBand:0,baseBand:0,specks:0,pinholes:0,shifted:false,offset:[0,0],stray:0,posed:true};
 });
 const q=m.itemQa(rig,m.slotOf(slot),'green',cells,0);return{action:m.isAction(id+'/'+dir,rig),status:q.qa.status,failures:[...q.failCalls.values()].flat(),soft:[...q.softCalls.values()].flat(),warnings:q.warnings,qa:q.qa};
}
const rows:any[]=[];
for(const size of[32,64,128])for(const slot of['main_hand','off_hand','torso_outer'])for(const dir of['south','east','north','west'])for(const id of['run','dodge'])for(const motion of['rest','residual','clear'])for(const kind of['clean','flip','size','empty-one','empty-all']){
 const b=judge(before,size,slot,id,dir,motion,kind),a=judge(after,size,slot,id,dir,motion,kind);
 assert.equal(a.action,b.action,'The selected policy must preserve classification exactly');
 assert.deepEqual(a.failures,b.failures,'New uncertainty cannot create or hide hard failures');
 rows.push({size,slot,dir,id,motion,kind,before:b,after:a});
}
const changed=rows.filter(r=>JSON.stringify(r.before)!==JSON.stringify(r.after));
const result={baselinePin:'c1024a0c',baselineHash:createHash('sha256').update(source).digest('hex'),candidateHash:createHash('sha256').update(readFileSync(modulePath)).digest('hex'),count:rows.length,changed:changed.length,changes:changed.map(r=>({...r,before:{...r.before,qa:undefined},after:{...r.after,qa:undefined}})),summary:rows.filter(r=>r.size===64&&r.slot==='main_hand'&&r.dir==='south').map(r=>({id:r.id,motion:r.motion,kind:r.kind,before:r.before.status,after:r.after.status,soft:r.after.soft,warnings:r.after.warnings,qa:r.after.qa}))};
writeFileSync(here+'policy-results.json',JSON.stringify(result,null,2)+'\n');console.log(JSON.stringify({count:rows.length,changed:changed.length,sourceHash:result.candidateHash,summary:result.summary.map(({qa,...r})=>r)}));
