import { mkdirSync, readFileSync, writeFileSync, existsSync, readdirSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { fileURLToPath, pathToFileURL } from 'node:url';
import * as current from '../../../../app/src/lib/items/items.ts';
import { LABELS } from '../../../../app/src/lib/rig/poses.ts';
import { newDocument, renderPoses } from '../../../../app/src/ui/motion-lab/model.ts';
import { validateRig } from '../../../../app/src/lib/rig/rig.ts';
import { makeImg } from '../../../../app/src/lib/image/png.ts';
import { clipQa } from '../../../../app/src/lib/rig/clips.ts';
const here=fileURLToPath(new URL('./',import.meta.url)),root=fileURLToPath(new URL('../../../../',import.meta.url));
const temp=here+'temp.local/';mkdirSync(temp,{recursive:true});
execFileSync('git',['archive','--format=tar','--output',temp+'before.tar','6006a55c','app/src','app/package.json'],{cwd:root});
execFileSync('tar',['-xf',temp+'before.tar','-C',temp]);
const before=await import(pathToFileURL(temp+'app/src/lib/items/items.ts').href);
const currentSource=readFileSync(root+'app/src/lib/items/items.ts');
if(!currentSource.equals(execFileSync('git',['show','50eeea36:app/src/lib/items/items.ts'],{cwd:root})))throw new Error('Reviewed module drifted from 50eeea36.');
const positions:Record<string,[number,number]>={NOSE:[32,10],NECK:[32,20],'RIGHT SHOULDER':[24,22],'LEFT SHOULDER':[40,22],'RIGHT ELBOW':[20,27],'LEFT ELBOW':[44,27],'RIGHT ARM':[20,35],'LEFT ARM':[44,35],'RIGHT HIP':[28,40],'LEFT HIP':[36,40],'RIGHT KNEE':[28,50],'LEFT KNEE':[36,50],'RIGHT LEG':[28,60],'LEFT LEG':[36,60],'RIGHT EYE':[30,9],'LEFT EYE':[34,9],'RIGHT EAR':[28,10],'LEFT EAR':[36,10]};
const pose=LABELS.map(label=>({label,x:positions[label][0]/64,y:positions[label][1]/64}));
const upper=/NOSE|NECK|SHOULDER|ELBOW|ARM|EYE|EAR/;
function rigFor(frames:any[],id='run-dodge'){
 return {cell:{w:64,h:64},pivot:{x:32,y:60},baseItem:'body',baseHash:'sha256:'+'0'.repeat(64),directions:[{id:'south'}],rest:{south:{image:'sha256:'+'0'.repeat(64),keypoints:structuredClone(pose)}},animations:[{id,cells:frames.length,loop:false,frames:frames.map((_,cell)=>({cell,ms:100})),sources:{south:{route:'skeleton-v3',keypoints:frames,measured:structuredClone(frames)}}}]};
}
const rotated=(angle:number)=>pose.map(p=>{
 if(!upper.test(p.label))return {...p};const a=angle*Math.PI/180,dx=p.x-.5,dy=p.y-40/64;
 return {...p,x:.5+dx*Math.cos(a)-dy*Math.sin(a),y:40/64+dx*Math.sin(a)+dy*Math.cos(a)};
});
const decisions=(rig:any,id:string,dir:string)=>({beforeDecisive:before.decisiveAction(rig,id,dir),afterDecisive:current.decisiveAction(rig,id,dir),beforeAction:before.isAction(id+'/'+dir,rig),afterAction:current.isAction(id+'/'+dir,rig)});
const synthetic=[];
for(const angle of [0,20,39,40,41,45,50,55,60,70])for(const count of [1,4,8]){
 const seq=Array.from({length:count},(_,i)=>rotated(i===Math.floor(count/2)?angle:0)),rig=rigFor(seq);
 synthetic.push({angle,count,validateErrors:validateRig(rig as any),inBounds:seq.every(f=>f.every(p=>p.x>=0&&p.x<=1&&p.y>=0&&p.y<=1)),...decisions(rig,'run-dodge','south')});
}
const neckRig=rigFor(Array.from({length:6},()=>structuredClone(pose)),'walk');
Object.assign(neckRig.animations[0].sources.south.measured[2].find(p=>p.label==='NECK')!,{x:.05,y:.5});
const neck=decisions(neckRig,'walk','south');
function bodyFor(points:any[]){
 const image=makeImg(64,64),map=Object.fromEntries(points.map(p=>[p.label,p]));
 const dot=(x:number,y:number,r:number)=>{for(let yy=Math.floor(y-r);yy<=y+r;yy++)for(let xx=Math.floor(x-r);xx<=x+r;xx++)if(xx>=0&&yy>=0&&xx<64&&yy<64&&Math.hypot(xx+.5-x,yy+.5-y)<=r)image.data.set([160,110,80,255],(yy*64+xx)*4);};
 for(const p of points)dot(p.x*64,p.y*64,p.label==='NOSE'?5:2);
 for(const [a,b]of [['NOSE','NECK'],['NECK','RIGHT SHOULDER'],['NECK','LEFT SHOULDER'],['RIGHT SHOULDER','RIGHT ELBOW'],['RIGHT ELBOW','RIGHT ARM'],['LEFT SHOULDER','LEFT ELBOW'],['LEFT ELBOW','LEFT ARM'],['NECK','RIGHT HIP'],['NECK','LEFT HIP'],['RIGHT HIP','RIGHT KNEE'],['RIGHT KNEE','RIGHT LEG'],['LEFT HIP','LEFT KNEE'],['LEFT KNEE','LEFT LEG']])for(let i=0;i<=30;i++)dot((map[a].x+(map[b].x-map[a].x)*i/30)*64,(map[a].y+(map[b].y-map[a].y)*i/30)*64,2);
 return image;
}
function torchCase(id:string,angle:number){
 const frames=Array.from({length:6},(_,i)=>rotated(i===2?angle:0)),rig=rigFor(frames,id),cells=frames.map((points,i)=>{
  const layer=makeImg(64,64),base=bodyFor(points),wrist=points.find(p=>p.label==='RIGHT ARM')!,x=Math.round(wrist.x*64),y=Math.round(wrist.y*64);
  // An upright carried torch keeps its world orientation while the arm/torso tips. Intent and ownership are fixture labels.
  for(let yy=y-16;yy<y;yy++)for(let xx=x-1;xx<x+1;xx++)layer.data.set(yy<y-12?[235,170,35,255]:[130,80,40,255],(yy*64+xx)*4);
  const mask=new Uint8Array(64*64);for(let p=0;p<mask.length;p++)mask[p]=layer.data[p*4+3]?1:0;
  return{key:id+'/south/'+i,call:0,base,input:base,out:layer,layer,mask,area:32,outBand:0,baseBand:base.data.filter((v,j)=>j%4===3&&v).length,specks:0,pinholes:0,shifted:false,offset:[0,0],stray:0,posed:true,keyKept:1,keyOutside:0};
 });
 const judge=(module:any)=>{const work=structuredClone(cells),cleanup=module.postProcess(rig,module.slotOf('main_hand'),work,{south:structuredClone(cells[0].layer)});const q=module.itemQa(rig,module.slotOf('main_hand'),'green',work,0);return{classification:module.isAction(id+'/south',rig),status:q.qa.status,failures:[...q.failCalls.values()].flat(),warnings:q.warnings,cleanup,layerHashes:work.map(c=>createHash('sha256').update(c.layer.data).digest('hex'))};};
 const bones=[['NOSE','NECK'],['RIGHT SHOULDER','NECK'],['LEFT SHOULDER','NECK'],['RIGHT ELBOW','RIGHT SHOULDER'],['LEFT ELBOW','LEFT SHOULDER'],['RIGHT ARM','RIGHT ELBOW'],['LEFT ARM','LEFT ELBOW'],['RIGHT KNEE','RIGHT HIP'],['LEFT KNEE','LEFT HIP'],['RIGHT LEG','RIGHT KNEE'],['LEFT LEG','LEFT KNEE'],['RIGHT EYE','NOSE'],['LEFT EYE','NOSE'],['RIGHT EAR','NOSE'],['LEFT EAR','NOSE']];
 const length=(points:any[],a:string,b:string)=>{const aa=points.find(p=>p.label===a)!,bb=points.find(p=>p.label===b)!;return Math.hypot(aa.x-bb.x,aa.y-bb.y)*64;};
 const maxBoneLengthChangePx=Math.max(...frames.flatMap(f=>bones.map(([a,b])=>Math.abs(length(f,a,b)-length(pose,a,b)))));
 const wristContactPx=frames.map((f,i)=>{const wr=f.find(p=>p.label==='RIGHT ARM')!;return Math.min(...Array.from(cells[i].mask).flatMap((v,p)=>v?[Math.hypot((p%64)+.5-wr.x*64,Math.floor(p/64)+.5-wr.y*64)]:[]));});
 const bodyQa=clipQa({anim:id,rest:bodyFor(pose),frames:cells.map(c=>c.base),requested:frames,measured:frames,stray:0,facing:{dir:'south',rest:pose}});
 return{id,angle,rigValid:validateRig(rig as any),maxBoneLengthChangePx,wristContactPx,sourceBodyQa:{adherence:bodyQa.adherence,fails:bodyQa.fails,warnings:bodyQa.warnings},bodyHashes:cells.map(c=>createHash('sha256').update(c.base.data).digest('hex')),layerHashes:cells.map(c=>createHash('sha256').update(c.layer.data).digest('hex')),before:judge(before),after:judge(current)};
}
const uprightTorch=[torchCase('run-dodge',0),torchCase('run-dodge',45),torchCase('dodge',45),torchCase('run-dodge',70)];
const rigFiles=['A','B','C','N'].map(b=>'app/test/fixtures/bench/body'+b+'.json').concat('app/test/fixtures/helmet-occlusion.json');
const exportRoot='docs/testing/img/audit-worktree-39533f7/testing-img/professional-audit/';
if(existsSync(root+exportRoot))for(const d of readdirSync(root+exportRoot)){const p=exportRoot+d+'/export/manifest.json';if(existsSync(root+p))rigFiles.push(p);}
const stored:any[]=[],subsamples:any[]=[];
for(const path of rigFiles){const text=readFileSync(root+path,'utf8'),obj=JSON.parse(text),rig=obj.rig??obj.manifest?.rig;
 for(const a of rig.animations)for(const dir of Object.keys(a.sources??{})){
  stored.push({path,sourceHash:createHash('sha256').update(text).digest('hex'),anim:a.id,dir,...decisions(rig,a.id,dir)});
  if(a.id==='slash')for(const off of [0,1]){const n=a.sources[dir].keypoints?.length??0;if(n<8)continue;const picks=Array.from({length:4},(_,i)=>Math.floor((i*2+off)*n/8)),sub=structuredClone(rig),clip=sub.animations.find(c=>c.id===a.id),src=clip.sources[dir];clip.cells=4;src.keypoints=picks.map(i=>src.keypoints[i]);if(src.measured)src.measured=picks.map(i=>src.measured[i]);subsamples.push({path,dir,picks,...decisions(sub,a.id,dir)});}
 }
}
const library=JSON.parse(readFileSync(root+'app/dev-fixtures/motion-lab/library.json','utf8')),retargeted=[];
for(const fixture of library.fixtures)for(const clip of library.clips)for(const dir of ['south','east','north','west']){
 const doc=newDocument(library,fixture,clip,dir as any),r=renderPoses(doc),rig=rigFor(r.poses,clip.id) as any;
 rig.cell={w:fixture.cell.w+2*doc.padding,h:fixture.cell.h+2*doc.padding};rig.rest={[dir]:{image:rig.baseHash,keypoints:r.result.rest}};rig.animations[0].sources={[dir]:{keypoints:r.poses}};
 retargeted.push({fixture:fixture.id,clip:clip.id,dir,...decisions(rig,clip.id,dir)});
}
const result={before:'6006a55c',after:'50eeea36',beforeSourceHash:createHash('sha256').update(readFileSync(temp+'app/src/lib/items/items.ts')).digest('hex'),sourceHash:createHash('sha256').update(currentSource).digest('hex'),synthetic,originalNeck:neck,uprightTorch,storedRigCount:rigFiles.length,stored,subsamples,retargeted};
writeFileSync(here+'results.json',JSON.stringify(result,null,2)+'\n');
console.log(JSON.stringify({neck,syntheticChanges:synthetic.filter(r=>r.beforeDecisive!==r.afterDecisive),storedRigCount:rigFiles.length,storedRows:stored.length,storedChanges:stored.filter(r=>r.beforeDecisive!==r.afterDecisive).length,slash:stored.filter(r=>r.anim==='slash'&&r.afterDecisive).length+'/'+stored.filter(r=>r.anim==='slash').length,subsamples:subsamples.filter(r=>r.afterDecisive).length+'/'+subsamples.length,retargeted:retargeted.length,retargetedChanges:retargeted.filter(r=>r.beforeDecisive!==r.afterDecisive).length}));
