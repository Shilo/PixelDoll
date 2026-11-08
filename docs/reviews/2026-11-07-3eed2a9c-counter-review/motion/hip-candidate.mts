import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { createHash } from 'node:crypto';
import assert from 'node:assert/strict';
import * as current from '../../../../app/src/lib/items/items.ts';
import { LABELS, hasAll } from '../../../../app/src/lib/rig/poses.ts';
import { makeImg } from '../../../../app/src/lib/image/png.ts';
import { validateRig } from '../../../../app/src/lib/rig/rig.ts';
import { clipQa } from '../../../../app/src/lib/rig/clips.ts';
const root=fileURLToPath(new URL('../../../../',import.meta.url)),here=fileURLToPath(new URL('./',import.meta.url)),temp=here+'temp.local/hip/';
mkdirSync(temp,{recursive:true});execFileSync('git',['archive','--format=tar','--output',temp+'before.tar','50eeea36','app/src','app/package.json'],{cwd:root});execFileSync('tar',['-xf',temp+'before.tar','-C',temp]);
const before=await import(pathToFileURL(temp+'app/src/lib/items/items.ts').href);
const source=readFileSync(root+'app/src/lib/items/items.ts');assert(source.equals(execFileSync('git',['show','3eed2a9c:app/src/lib/items/items.ts'],{cwd:root})));
const positions:Record<string,[number,number]>={NOSE:[32,10],NECK:[32,20],'RIGHT SHOULDER':[24,22],'LEFT SHOULDER':[40,22],'RIGHT ELBOW':[20,27],'LEFT ELBOW':[44,27],'RIGHT ARM':[20,35],'LEFT ARM':[44,35],'RIGHT HIP':[28,40],'LEFT HIP':[36,40],'RIGHT KNEE':[28,50],'LEFT KNEE':[36,50],'RIGHT LEG':[28,60],'LEFT LEG':[36,60],'RIGHT EYE':[30,9],'LEFT EYE':[34,9],'RIGHT EAR':[28,10],'LEFT EAR':[36,10]};
const rest=LABELS.map(label=>({label,x:positions[label][0]/64,y:positions[label][1]/64}));
const upper=/NOSE|NECK|SHOULDER|ELBOW|ARM|EYE|EAR/;
const bound=rest.map(p=>{
 const deg=upper.test(p.label)?30:/KNEE|LEG/.test(p.label)&&p.label.startsWith('LEFT')?45:0,t=deg*Math.PI/180,hx=/KNEE|LEG/.test(p.label)?(p.label.startsWith('RIGHT')?.4375:.5625):.5,dx=p.x-hx,dy=p.y-.625;
 return{...p,x:hx+dx*Math.cos(t)-dy*Math.sin(t),y:.625+dx*Math.sin(t)+dy*Math.cos(t)};
});
const thrown=bound.map(p=>p.label==='RIGHT HIP'?{...p,x:.32,y:.54}:p);
const poses=[rest,rest,bound,rest,rest,rest];
function rigFor(bad:boolean){return{cell:{w:64,h:64},pivot:{x:32,y:60},baseItem:'body',baseHash:'sha256:'+'0'.repeat(64),directions:[{id:'south'}],rest:{south:{image:'sha256:'+'0'.repeat(64),keypoints:rest}},animations:[{id:'run',cells:6,loop:true,frames:poses.map((_,cell)=>({cell,ms:100})),sources:{south:{route:'skeleton-v3',reference:'sha256:'+'0'.repeat(64),keypoints:poses,measured:poses.map((p,i)=>bad&&i===2?thrown:p),provenance:[]}}}]};}
const bones=[['NOSE','NECK'],['RIGHT SHOULDER','NECK'],['LEFT SHOULDER','NECK'],['RIGHT ELBOW','RIGHT SHOULDER'],['LEFT ELBOW','LEFT SHOULDER'],['RIGHT ARM','RIGHT ELBOW'],['LEFT ARM','LEFT ELBOW'],['RIGHT KNEE','RIGHT HIP'],['LEFT KNEE','LEFT HIP'],['RIGHT LEG','RIGHT KNEE'],['LEFT LEG','LEFT KNEE'],['RIGHT EYE','NOSE'],['LEFT EYE','NOSE'],['RIGHT EAR','NOSE'],['LEFT EAR','NOSE']];
const lookup=(p:any[])=>Object.fromEntries(p.map(k=>[k.label,k]));
const len=(p:any[],a:string,b:string)=>{const q=lookup(p);return Math.hypot(q[a].x-q[b].x,q[a].y-q[b].y)*64;};
function bodyFor(points:any[]){const image=makeImg(64,64),map=lookup(points);const dot=(x:number,y:number,r:number)=>{for(let yy=Math.floor(y-r);yy<=y+r;yy++)for(let xx=Math.floor(x-r);xx<=x+r;xx++)if(xx>=0&&yy>=0&&xx<64&&yy<64&&Math.hypot(xx+.5-x,yy+.5-y)<=r)image.data.set([160,110,80,255],(yy*64+xx)*4);};
 for(const p of points)dot(p.x*64,p.y*64,p.label==='NOSE'?4:2);
 for(const[a,b]of bones.concat([['NECK','RIGHT HIP'],['NECK','LEFT HIP']]))for(let i=0;i<=30;i++)dot((map[a].x+(map[b].x-map[a].x)*i/30)*64,(map[a].y+(map[b].y-map[a].y)*i/30)*64,2);return image;}
const hash=(data:Uint8ClampedArray)=>createHash('sha256').update(data).digest('hex');
function cellsFor(flip:boolean){return poses.map((points,i)=>{const base=bodyFor(points),layer=makeImg(64,64),w=lookup(points)['RIGHT ARM'],deg=i===2?(flip?210:30):0,t=deg*Math.PI/180,mask=new Uint8Array(4096);
 for(let s=0;s<16;s+=.25)for(const o of[-.5,.5]){const x=Math.floor(w.x*64+s*Math.sin(t)+o*Math.cos(t)),y=Math.floor(w.y*64-s*Math.cos(t)+o*Math.sin(t));if(x>=0&&y>=0&&x<64&&y<64){const q=y*64+x;mask[q]=1;layer.data.set(s>12?[235,170,35,255]:[130,80,40,255],q*4);}}
 return{key:'run/south/'+i,call:0,base,input:base,out:layer,layer,mask,area:mask.reduce((a,b)=>a+b,0),outBand:0,baseBand:base.data.filter((v,j)=>j%4===3&&v).length,specks:0,pinholes:0,shifted:false,offset:[0,0],stray:0,posed:true,keyKept:1,keyOutside:0};});}
function judge(module:any,bad:boolean,flip:boolean){const rig=rigFor(bad),cells=cellsFor(flip),inputHashes=cells.map(c=>hash(c.layer.data)),cleanup=module.postProcess(rig,module.slotOf('main_hand'),cells,{south:structuredClone(cells[0].layer)}),q=module.itemQa(rig,module.slotOf('main_hand'),'green',cells,0);return{action:module.isAction('run/south',rig),status:q.qa.status,failures:[...q.failCalls.values()].flat(),warnings:q.warnings,cleanup,inputHashes,outputHashes:cells.map(c=>hash(c.layer.data))};}
const qa=[];for(const bad of[false,true])for(const flip of[false,true])qa.push({badMeasuredHip:bad,reversedItem:flip,before:judge(before,bad,flip),after:judge(current,bad,flip)});
assert(qa.filter(r=>!r.badMeasuredHip).every(r=>!r.before.action&&!r.after.action));
assert(qa.filter(r=>r.badMeasuredHip).every(r=>!r.before.action&&r.after.action));
assert(qa.find(r=>!r.badMeasuredHip&&r.reversedItem)!.after.failures.some(s=>s.startsWith('G9 ')));
assert(qa.find(r=>r.badMeasuredHip&&r.reversedItem)!.before.failures.some(s=>s.startsWith('G9 ')));
assert(!qa.find(r=>r.badMeasuredHip&&r.reversedItem)!.after.failures.some(s=>s.startsWith('G9 ')));
assert(qa.filter(r=>!r.reversedItem).every(r=>!r.before.failures.some(s=>s.startsWith('G9 '))&&!r.after.failures.some(s=>s.startsWith('G9 '))));
const R=lookup(rest),P=lookup(thrown),middle=(p:any,a:string,b:string)=>[(p[a].x+p[b].x)/2,(p[a].y+p[b].y)/2],A=(a:number[],b:number[])=>Math.atan2(a[0]-b[0],b[1]-a[1])*180/Math.PI;
const s0=middle(R,'RIGHT SHOULDER','LEFT SHOULDER'),s1=middle(P,'RIGHT SHOULDER','LEFT SHOULDER'),h0=middle(R,'RIGHT HIP','LEFT HIP'),h1=middle(P,'RIGHT HIP','LEFT HIP'),k0=middle(R,'RIGHT KNEE','LEFT KNEE'),k1=middle(P,'RIGHT KNEE','LEFT KNEE');
const H=Math.hypot(R.NOSE.x-middle(R,'RIGHT LEG','LEFT LEG')[0],R.NOSE.y-middle(R,'RIGHT LEG','LEFT LEG')[1]);
const a=40*Math.PI/180,dx=s0[0]-h0[0],dy=s0[1]-h0[1],calibration=Math.abs(A([h0[0]+dx*Math.cos(a)-dy*Math.sin(a),h0[1]+dx*Math.sin(a)+dy*Math.cos(a)],k0)-A(s0,k0));
const kneeRaw=Math.abs(A(s1,k1)-A(s0,k0));
const sourceQa=(bad:boolean)=>{const q=clipQa({anim:'run',rest:bodyFor(rest),frames:poses.map(bodyFor),requested:poses,measured:rigFor(bad).animations[0].sources.south.measured,stray:0,facing:{dir:'south',rest}});return{adherence:q.adherence,fails:q.fails,warnings:q.warnings};};
const gripPx=cellsFor(true).map((c,i)=>{const w=lookup(poses[i])['RIGHT ARM'];return Math.min(...Array.from(c.mask).flatMap((v,p)=>v?[Math.hypot((p%64)+.5-w.x*64,Math.floor(p/64)+.5-w.y*64)]:[]));});
const result={before:'50eeea36',after:'3eed2a9c',sourceHash:createHash('sha256').update(source).digest('hex'),fixture:{rest,requested:poses,measured:rigFor(true).animations[0].sources.south.measured},
 rigErrors:validateRig(rigFor(true) as any),allPointsValid:[rest,bound,thrown].every(hasAll),
 maxActualBoneLengthChangePx:Math.max(...bones.map(([a,b])=>Math.abs(len(rest,a,b)-len(bound,a,b)))),
 changedMeasuredLabels:bound.filter((p,i)=>JSON.stringify(p)!==JSON.stringify(thrown[i])).map(p=>p.label),
 angles:{neckHip:Math.abs(A([P.NECK.x,P.NECK.y],h1)-A([R.NECK.x,R.NECK.y],h0)),shoulderHip:Math.abs(A(s1,h1)-A(s0,h0)),kneeRaw,calibration,scaledKnee:kneeRaw*40/calibration},
 guardedGrowthBodyHeights:Object.fromEntries([['RIGHT HIP','LEFT HIP'],['RIGHT KNEE','RIGHT HIP'],['LEFT KNEE','LEFT HIP']].map(([a,b])=>[a+' to '+b,(len(thrown,a,b)-len(rest,a,b))/(64*H)])),sourceQa:{correctMeasured:sourceQa(false),badMeasured:sourceQa(true)},gripPx,qa};
assert(result.allPointsValid);assert.deepEqual(result.rigErrors,[]);assert.deepEqual(result.changedMeasuredLabels,['RIGHT HIP']);
assert(result.maxActualBoneLengthChangePx<1e-10);assert(result.gripPx.every(v=>v<=1));
assert(Object.values(result.guardedGrowthBodyHeights).every(v=>v<=.2));
for(const q of Object.values(result.sourceQa)){assert.deepEqual(q.fails,[]);assert.deepEqual(q.warnings,[]);}
for(const row of qa){
 assert.deepEqual(row.before.inputHashes,row.after.inputHashes);
 for(const q of[row.before,row.after]){assert.equal(q.cleanup.removed,0);assert.deepEqual(q.cleanup.repaired,[]);assert.deepEqual(q.inputHashes,q.outputHashes);}
}
writeFileSync(here+'hip-candidate-results.json',JSON.stringify(result,null,2)+'\n');
console.log(JSON.stringify({valid:result.allPointsValid,rigErrors:result.rigErrors,boneError:result.maxActualBoneLengthChangePx,changed:result.changedMeasuredLabels,angles:result.angles,guardedGrowth:result.guardedGrowthBodyHeights,qa:qa.map(({badMeasuredHip,reversedItem,before,after})=>({badMeasuredHip,reversedItem,before:{action:before.action,failures:before.failures},after:{action:after.action,failures:after.failures}}))}));
