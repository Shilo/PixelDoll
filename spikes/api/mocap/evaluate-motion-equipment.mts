// Offline qualification of the exact production item builders against frozen corrected-motion frames.
import fs from 'node:fs';
import path from 'node:path';
import { decodePngBytes,encodePngBytes } from '../../../app/src/lib/image/pngraw.ts';
import { binaryAlpha,type Img } from '../../../app/src/lib/image/png.ts';
import { fromApi } from '../../../app/src/lib/rig/poses.ts';
import type { Rig,DirectionName,Keypoint } from '../../../app/src/lib/rig/rig.ts';
import { padImg,extractCell,postProcess,itemQa,dirGate,slotOf,bandOf,cutRows,cutAllow,posedTol,g2Fails,GATES,recompose,contactSheet,unrotate,type CellOut } from '../../../app/src/lib/items/items.ts';
import type { EquipmentContext } from '../../../app/src/ui/motion-lab/run.ts';
const root=path.resolve(import.meta.dirname,'../../..'),out=path.join(root,'spikes/api/out/motion-lab-2026-10-28');
const evidence=JSON.parse(fs.readFileSync(process.argv[2]??path.join(out,'evidence.json'),'utf8'));
const byJob=new Map<string,any>(),inputs=new Map<string,string>();
for(const row of evidence.records){if(row.job)byJob.set(row.job.id,row);for(const input of row.inputs)inputs.set(input.sha,input.png);}
const decode=async(png:string)=>binaryAlpha(await decodePngBytes(new Uint8Array(Buffer.from(png,'base64'))));
const save=async(name:string,image:Img)=>fs.writeFileSync(path.join(out,name),await encodePngBytes(image));
const designs=[];
for(const row of byJob.values())if(row.context?.kind==='equipment-dress'&&row.job.state==='done'){
  const name=`equipment-${row.context.name.toLowerCase()}-references.png`;
  await save(name,contactSheet([await Promise.all(row.images.map((im:any)=>decode(im.png)))],3));
  designs.push({jobId:row.job.id,equipment:row.context.name,frames:row.images.length,gens:row.job.gens,image:name});
}
const rows=[];
for(const [jobId,row]of byJob){
  const context=row.context as EquipmentContext|undefined;if(context?.kind!=='equipment-pose'||row.job.state!=='done')continue;
  const body=byJob.get(context.bodyId),dress=byJob.get(context.dressId!);
  if(!body||!dress||body.job.state!=='done'||dress.job.state!=='done')throw new Error('Frozen body or dressed reference evidence is incomplete.');
  const doc=body.document,params=body.job.params,cell=await decode(inputs.get(params.first_frame.$blob)!),direction=doc.direction as DirectionName,n=body.images.length,pad=context.pad,slot=slotOf(context.slot);
  const rig={cell:{w:cell.w,h:cell.h},pivot:{x:cell.w/2,y:cell.h},directions:[{id:direction}],animations:[{id:doc.clip.id,cells:n,loop:doc.clip.loop,frames:doc.durations.map((ms:number,cell:number)=>({ms,cell})),sources:{[direction]:{keypoints:params.keypoints}}}],rest:{[direction]:{keypoints:params.first_frame_keypoints}}} as unknown as Rig;
  const keys:Partial<Record<DirectionName,Img>>={},cuts:Partial<Record<DirectionName,Uint8Array>>={},keyframes:CellOut[]=[],references:Partial<Record<DirectionName,Img>>={};
  for(const [dir,ref]of Object.entries(context.references)){
    const d=dir as DirectionName,source=byJob.get(context.bodyIds[ref!.index]),reference=await decode(inputs.get(ref!.sha)!),dressed=await decode(dress.images[ref!.index].png),rest=source.job.params.first_frame_keypoints;
    const maxY=pad?undefined:cutRows(context.slot,fromApi(rest,cell),cell.h);
    const k=extractCell({key:`rest/${dir}/0`,call:0,base:padImg(reference,pad),out:dressed,route:context.key,band:bandOf(context.slot,undefined,dressed.h),...(maxY===undefined?{}:{cut:{maxY}})});
    keys[d]=k.layer;cuts[d]=k.cut;references[d]=reference;keyframes.push(k);
  }
  const generated=unrotate(await Promise.all(row.images.map((im:any)=>decode(im.png))),!!context.rotated);
  if(generated.length!==n)throw new Error('Equipment and frozen body frame counts differ.');
  const cells:CellOut[]=[];
  for(let i=0;i<n;i++){
    const base=padImg(await decode(body.images[i].png),pad),skel=pad?undefined:fromApi(params.keypoints[i] as Keypoint[],cell),key=`${doc.clip.id}/${direction}/${i}`,maxY=pad?undefined:cutRows(context.slot,skel,base.h),allow=maxY===undefined?undefined:cutAllow(rig,key,cuts[direction],cell.w,posedTol(cell.w,cell.h));
    cells.push(extractCell({key,call:1,base,out:generated[i],route:context.key,band:bandOf(context.slot,skel,base.h),posed:true,clip:slot.band,held:slot.class==='held',pad,...(allow?{cut:{maxY:maxY!,allow}}:{})}));
  }
  const id=`equipment-${jobId.slice(0,8)}-${context.name.toLowerCase()}-${doc.clip.id}-${direction}`;
  await save(`${id}.before.png`,contactSheet([cells.map(recompose)],2));
  const cleanup=postProcess(rig,slot,cells,keys,pad),qa=itemQa(rig,slot,context.key,cells,0,GATES.keyOutsidePosed,pad),design=dirGate(slot,cells,keys,rig,references);
  const keyFailures=keyframes.flatMap(k=>[g2Fails(k)?`G2 ${k.key}`:'',(k.keyOutside??0)>GATES.keyOutside?`G3 ${k.key}`:'',k.area?'':`G4 ${k.key}`].filter(Boolean));
  const failures=[...keyFailures,...qa.failCalls.values(),...design.fails.values()].flat(),warnings=[...qa.warnings,...design.warnings];
  await save(`${id}.after.png`,contactSheet([[keys[direction]!,...cells.map(recompose)]],2));
  await save(`${id}.layers.png`,contactSheet([cells.map(c=>c.layer)],2));
  rows.push({id,jobId,bodyId:context.bodyId,dressId:context.dressId,fixture:doc.fixture.id,direction,clip:doc.clip.id,equipment:context.name,status:failures.length?'fail':warnings.length?'warn':'pass',failures,warnings,cleanup,cells:cells.map(c=>({key:c.key,area:c.area,shifted:c.shifted,offset:c.offset,keyKept:c.keyKept,keyOutside:c.keyOutside,specks:c.specks,pinholes:c.pinholes,stray:c.stray,repaired:c.repaired}))});
}
fs.writeFileSync(path.join(out,'equipment-analysis.json'),JSON.stringify({designs,cases:rows.length,rows},null,2));console.log(JSON.stringify({designs,cases:rows.map(r=>({id:r.id,status:r.status,failures:r.failures.length,warnings:r.warnings.length,cleanup:r.cleanup}))}));
