import {readFileSync,writeFileSync}from'node:fs';
import{fileURLToPath,pathToFileURL}from'node:url';
import{createHash}from'node:crypto';
import assert from'node:assert/strict';
const here=fileURLToPath(new URL('./',import.meta.url));
const modules=Object.fromEntries(await Promise.all(['before','after','ancestor'].map(async k=>[k,await import(pathToFileURL(here+`temp.local/${k}/app/src/lib/items/items.ts`).href)])));
const{LABELS,hasAll}=await import(pathToFileURL(here+'temp.local/after/app/src/lib/rig/poses.ts').href),{makeImg}=await import(pathToFileURL(here+'temp.local/after/app/src/lib/image/png.ts').href);
const positions:Record<string,[number,number]>={NOSE:[32,10],NECK:[32,20],'RIGHT SHOULDER':[24,22],'LEFT SHOULDER':[40,22],'RIGHT ELBOW':[20,27],'LEFT ELBOW':[44,27],'RIGHT ARM':[20,35],'LEFT ARM':[44,35],'RIGHT HIP':[28,40],'LEFT HIP':[36,40],'RIGHT KNEE':[28,50],'LEFT KNEE':[36,50],'RIGHT LEG':[28,60],'LEFT LEG':[36,60],'RIGHT EYE':[30,9],'LEFT EYE':[34,9],'RIGHT EAR':[28,10],'LEFT EAR':[36,10]};
const rest=LABELS.map(label=>({label,x:positions[label][0]/64,y:positions[label][1]/64}));
function pose(lean:number,swing:number){return rest.map(p=>{const leg=/^LEFT (KNEE|LEG)$/.test(p.label),upper=/NOSE|NECK|SHOULDER|ELBOW|ARM|EYE|EAR/.test(p.label),t=(upper?lean:leg?swing:0)*Math.PI/180,hx=leg?.5625:.5,dx=p.x-hx,dy=p.y-.625;return{...p,x:hx+dx*Math.cos(t)-dy*Math.sin(t),y:.625+dx*Math.sin(t)+dy*Math.cos(t)}})}
function run(mod:any,id:string,dir:string,lean:number,swing:number,bad:boolean|{label:string,x:number,y:number},kind:string){
 const f=pose(lean,swing),frames=[rest,rest,f,rest,rest,rest],measured=frames.map((ps,i)=>i===2&&bad?ps.map(p=>p.label===(typeof bad==='object'?bad.label:'RIGHT HIP')?{...p,x:typeof bad==='object'?bad.x:.32,y:typeof bad==='object'?bad.y:.54}:p):ps);
 const rig:any={cell:{w:64,h:64},pivot:{x:32,y:60},baseItem:'body',baseHash:'sha256:test',directions:[{id:dir}],rest:{[dir]:{image:'sha256:test',keypoints:rest}},animations:[{id,cells:6,loop:false,frames:frames.map((_,cell)=>({cell,ms:100})),sources:{[dir]:{route:'skeleton-v3',reference:'sha256:test',keypoints:frames,measured,provenance:[]}}}]};
 const cells=frames.map((ps,i)=>{const base=makeImg(64,64),layer=makeImg(64,64),mask=new Uint8Array(4096),wr=ps.find(p=>p.label==='RIGHT ARM')!,deg=i===2?(kind==='flip'?lean+180:lean):0,t=deg*Math.PI/180,length=kind==='empty-all'||kind==='empty-one'&&i===2?0:kind==='shrink'&&i===2?4:16;
 for(let s=0;s<length;s+=.25)for(const o of[-.5,.5]){const x=Math.floor(wr.x*64+s*Math.sin(t)+o*Math.cos(t)),y=Math.floor(wr.y*64-s*Math.cos(t)+o*Math.sin(t));if(x>=0&&y>=0&&x<64&&y<64){const q=y*64+x;mask[q]=1;layer.data.set(s>12?[235,170,35,255]:[130,80,40,255],q*4)}}
 return{key:`${id}/${dir}/${i}`,call:0,base,input:base,out:layer,layer,mask,area:mask.reduce((a,b)=>a+b,0),outBand:0,baseBand:0,specks:0,pinholes:0,shifted:false,offset:[0,0],stray:0,posed:true};});
 const q=mod.itemQa(rig,mod.slotOf('main_hand'),'green',cells,0);return{action:mod.isAction(`${id}/${dir}`,rig),status:q.qa.status,failures:[...q.failCalls.values()].flat(),warnings:q.warnings,valid:frames.every(hasAll)&&measured.every(hasAll)};
}
const rows:any[]=[];
for(const id of['run','dodge'])for(const dir of['south','north'])for(const lean of[0,30,45,60])for(const swing of[0,45,-45])for(const bad of[false,true])for(const kind of['clean','flip','empty-one','empty-all','shrink']){
 const row:any={id,dir,lean,swing,badMeasuredHip:bad,kind};for(const[k,m]of Object.entries(modules))row[k]=run(m,id,dir,lean,swing,bad,kind);rows.push(row);
}
const n1=rows.filter(r=>r.id==='run'&&r.lean===30&&r.swing===45);
for(const r of n1){assert(!r.after.action);if(r.kind==='flip')assert(r.after.failures.some((f:string)=>f.startsWith('G9 ')));if(r.kind==='clean')assert.equal(r.after.status,'pass');}
for(const r of rows.filter(r=>r.kind==='empty-all'))assert(r.after.failures.some((f:string)=>f.startsWith('G4 ')));
for(const r of rows.filter(r=>r.id==='dodge'))assert.deepEqual(r.before,r.after);
const clean45=rows.filter(r=>r.id==='run'&&r.lean===45&&r.swing===0&&!r.badMeasuredHip);assert(clean45.every(r=>r.after.action));
assert(rows.every(r=>r.after.valid));
const changed=rows.filter(r=>JSON.stringify(r.before)!==JSON.stringify(r.after));
const result={before:'3eed2a9c',after:'d4c0c633',ancestor:'50eeea36',sourceHashes:Object.fromEntries(['before','after','ancestor'].map(k=>[k,createHash('sha256').update(readFileSync(here+`temp.local/${k}/app/src/lib/items/items.ts`)).digest('hex')])),rows:rows.length,changed:changed.length,changedSummaries:changed.map(({id,dir,lean,swing,badMeasuredHip,kind,before,after})=>({id,dir,lean,swing,badMeasuredHip,kind,before,after})),n1,originalC1:clean45};
writeFileSync(here+'results.json',JSON.stringify(result,null,2)+'\n');console.log(JSON.stringify({rows:rows.length,changed:changed.length,n1:n1.length,changedCoordinates:[...new Set(changed.map(r=>`${r.id}/${r.lean}/${r.swing}/${r.badMeasuredHip}`))]}));
export{run,pose,rest,modules};
