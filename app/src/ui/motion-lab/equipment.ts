// Qualification only: production request builders, frozen body images and the exact stored body poses.
import { itemRoute,itemPrompt,heldPhrase,padOf,padImg,restKey,editGens,f0Last,packGrid,gridPrompt,gridEstimate } from '../../lib/items/items.ts';
import { toChroma,pickKey } from '../../lib/image/chroma.ts';
import { decodePngBytes,encodePngBytes } from '../../lib/image/pngraw.ts';
import { bytesToBase64,makeImg } from '../../lib/image/png.ts';
import {routes,png} from '../../lib/pixellab/routes.ts';
import {validateAttachment,attachmentPalmIsOpaque,ATTACHMENT_PALM_ERROR} from './attachment.ts';
import { poseCallGens } from '../../lib/rig/clips.ts';
import type { Keypoint } from '../../lib/rig/rig.ts';
import * as db from '../../lib/store/db.ts';
import { candidateRecord,enqueueLab,type EquipmentContext } from './run.ts';
import type { JobRec } from '../../lib/pixellab/queue.ts';
import {actionOfMotion} from './model.ts';
export const EQUIPMENT={helmet:{name:'Helmet',slot:'head',prompt:'a simple steel open-face helmet, no plume'},tunic:{name:'Tunic',slot:'torso_inner',prompt:'a sleeveless red tunic covering the torso and hips, no belt, no cape'},sword:{name:'Sword',slot:'main_hand',prompt:'a steel longsword with a simple brown grip'}} as const;
export type EquipmentName=keyof typeof EQUIPMENT;
interface BodyParams {first_frame:{$blob:string};first_frame_keypoints:Keypoint[];keypoints:Keypoint[][]}
async function bodyOf(id:string){
  const row=candidateRecord(id),job=await db.get<JobRec>('jobs',id);
  if(!row||row.context||job?.state!=='done'||job.endpoint!=='/animate-with-skeleton-v3')throw new Error('Select a completed frozen body candidate.');
  const params=job.params as BodyParams,sha=params.first_frame?.$blob,blob=sha&&await db.getBlob(sha);
  if(!blob||!Array.isArray(params.first_frame_keypoints)||!Array.isArray(params.keypoints))throw new Error('The frozen body reference or original pose parameters are missing.');
  const image=await decodePngBytes(new Uint8Array(await blob.arrayBuffer()));
  return{row,job,params,image,sha};
}
export async function dressEquipment(bodyId:string,partnerId:string,name:EquipmentName,seed:number,thirdId=''){
  const bodies=await Promise.all([bodyId,partnerId,...(thirdId?[thirdId]:[])].map(bodyOf)),body=bodies[0];
  if(new Set(bodies.map(b=>b.row.document.direction)).size!==bodies.length||bodies.some(b=>body.row.document.fixture.id!==b.row.document.fixture.id||body.image.w!==b.image.w||body.image.h!==b.image.h))throw new Error('Choose different native views of the same body and standing canvas.');
  const item=EQUIPMENT[name],key=pickKey(item.prompt),cell={w:body.image.w,h:body.image.h},pad=padOf(item.slot,'skel',cell),images=bodies.map(b=>padImg(toChroma(b.image,key),pad));
  const prompt=itemPrompt(item.slot==='main_hand'?heldPhrase(item.prompt,item.slot):item.prompt,key,bodies.map(b=>restKey(b.row.document.direction)));
  const request=itemRoute.edit(await Promise.all(images.map(async image=>bytesToBase64(await encodePngBytes(image)))),prompt,seed,images[0]);
  const references=Object.fromEntries(bodies.map((b,index)=>[b.row.document.direction,{sha:b.sha,index}]));
  const context:EquipmentContext={kind:'equipment-dress',name:item.name,slot:item.slot,prompt:item.prompt,key,pad,referenceSha:body.sha,bodyId,bodyIds:[bodyId,partnerId,...(thirdId?[thirdId]:[])],references};
  return enqueueLab(body.row.document,seed,request,editGens(images[0]),context);
}
export async function poseEquipment(bodyId:string,dressId:string,seed:number){
  const body=await bodyOf(bodyId),row=candidateRecord(dressId),dress=await db.get<JobRec>('jobs',dressId),context=row?.context;
  if(context?.kind!=='equipment-dress'||dress?.state!=='done')throw new Error('Select a completed equipment reference.');
  const reference=context.references?.[body.row.document.direction];
  if(reference?.sha!==body.sha)throw new Error('Equipment and body must use the identical standing reference and view.');
  const result=dress.jobs.flatMap(j=>j.results);if(result.length!==context.bodyIds.length)throw new Error('The paired equipment reference outputs are incomplete.');
  const blob=await db.getBlob(result[reference.index].sha);if(!blob)throw new Error('The dressed equipment image is missing.');
  const cell={w:body.image.w,h:body.image.h},doc=body.row.document;
  const action=actionOfMotion(doc.clip);
  const request=itemRoute.pose({keyframePngB64:bytesToBase64(new Uint8Array(await blob.arrayBuffer())),rest:body.params.first_frame_keypoints,poses:body.params.keypoints,item:context.prompt,slot:context.slot,key:context.key,anim:action==='attack'?'overhead arm strike':action,dir:doc.direction,seed,cell,pad:context.pad,view:'low top-down'});
  return enqueueLab(doc,seed,request,poseCallGens(body.params.keypoints.length),{...context,kind:'equipment-pose',bodyId,dressId,referenceSha:body.sha,rotated:f0Last(context.slot,body.params.first_frame_keypoints,body.params.keypoints,cell)});
}
/** A bounded two-frame experiment: actual frozen pixels and manually authored visible hand grips, not inferred wrists. */
export async function repairEquipmentProbe(bodyId:string,dressId:string,seed:number){
  const body=await bodyOf(bodyId),dressRow=candidateRecord(dressId),dress=await db.get<JobRec>('jobs',dressId),context=dressRow?.context,doc=body.row.document;
  if(doc.fixture.id!=='c27man'||doc.direction!=='east'||doc.clip.id!=='attack'||doc.padding!==0||context?.kind!=='equipment-dress'||context.slot!=='main_hand'||dress?.state!=='done'||context.references.east?.sha!==body.sha)throw new Error('This probe needs the adult 64 px east attack and its identical sword standing reference.');
  const results=body.job.jobs.flatMap(j=>j.results),text=localStorage.getItem('pixeldoll.motionAttachment.'+bodyId);if(!text)throw new Error('Import and save an authored attachment on this exact body first. The probe needs measured grip positions.');
  const track=validateAttachment(JSON.parse(text),{jobId:bodyId,hashes:results.map(r=>r.sha),cell:{w:body.image.w,h:body.image.h},pivot:doc.fixture.pivot!,direction:doc.direction,padding:40}),indices=[6,7],pad=context.pad,cell={w:body.image.w+2*pad,h:body.image.h+2*pad},images=[],masks=[];
  const imageOf=async(sha:string)=>{const blob=await db.getBlob(sha);if(!blob)throw new Error('Probe input artwork is missing.');return decodePngBytes(new Uint8Array(await blob.arrayBuffer()))};
  for(const i of indices){if(!results[i]||!track.frames[i])throw new Error('Probe frames are missing.');const frozen=await imageOf(results[i].sha);const grip=track.frames[i].grip;if(!grip)throw new Error('Mark the visible palm on each probe frame before planning a held-item repair mask.');if(!attachmentPalmIsOpaque(track.frames[i],padImg(frozen,track.body.padding)))throw new Error(ATTACHMENT_PALM_ERROR);images.push(padImg(toChroma(frozen,context.key),pad));const x=grip.x-track.body.padding+pad,y=grip.y-track.body.padding+pad,mask=new Uint8Array(cell.w*cell.h);for(let py=0;py<cell.h;py++)for(let px=0;px<cell.w;px++)if(Math.hypot(px+0.5-x,py+0.5-y)<=34)mask[py*cell.w+px]=1;masks.push(mask);}
  const outputs=dress.jobs.flatMap(j=>j.results),dirs=['east','south'] as const;for(const dir of dirs){const reference=context.references[dir];if(!reference||!outputs[reference.index])throw new Error('Probe requires east and south dressed reference art.');images.push(await imageOf(outputs[reference.index].sha));masks.push(null);}
  const estimate=gridEstimate(cell,indices.length,dirs.length),grid=packGrid(images,masks),sized=async(image:ReturnType<typeof makeImg>)=>({image:png(bytesToBase64(await encodePngBytes(image))),size:{width:image.w,height:image.h}});
  const request=routes.inpaintV3({description:gridPrompt({item:context.prompt,slot:context.slot,key:context.key,anim:'overhead arm strike',dir:doc.direction,n:indices.length,refs:[...dirs],cell}),inpainting_image:await sized(grid.image),mask_image:await sized(grid.mask),no_background:true,seed});
  // The 448x112 live probe cost 15 (quoted 10 by the area rule then in use). Reserve the supported grid ceiling: the mean-side estimate is still inferred.
  return enqueueLab(doc,seed,request,Math.max(estimate.gens,25),{...context,kind:'equipment-grid',bodyId,dressId,indices});
}
