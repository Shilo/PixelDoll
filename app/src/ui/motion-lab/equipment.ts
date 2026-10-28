// Qualification only: production request builders, frozen body images and the exact stored body poses.
import { itemRoute,itemPrompt,heldPhrase,padOf,padImg,restKey,editGens,f0Last } from '../../lib/items/items.ts';
import { toChroma,pickKey } from '../../lib/image/chroma.ts';
import { decodePngBytes,encodePngBytes } from '../../lib/image/pngraw.ts';
import { bytesToBase64 } from '../../lib/image/png.ts';
import { poseCallGens } from '../../lib/rig/clips.ts';
import type { Keypoint } from '../../lib/rig/rig.ts';
import * as db from '../../lib/store/db.ts';
import { candidateRecord,enqueueLab,type EquipmentContext } from './run.ts';
import type { JobRec } from '../../lib/pixellab/queue.ts';
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
export async function dressEquipment(bodyId:string,partnerId:string,name:EquipmentName,seed:number){
  const [body,partner]=await Promise.all([bodyOf(bodyId),bodyOf(partnerId)]);
  if(body.row.document.fixture.id!==partner.row.document.fixture.id||body.row.document.direction===partner.row.document.direction||body.image.w!==partner.image.w||body.image.h!==partner.image.h)throw new Error('Choose two different views of the same body and standing canvas.');
  const item=EQUIPMENT[name],key=pickKey(item.prompt),cell={w:body.image.w,h:body.image.h},pad=padOf(item.slot,'skel',cell),images=[body,partner].map(b=>padImg(toChroma(b.image,key),pad));
  const prompt=itemPrompt(item.slot==='main_hand'?heldPhrase(item.prompt,item.slot):item.prompt,key,[body,partner].map(b=>restKey(b.row.document.direction)));
  const request=itemRoute.edit(await Promise.all(images.map(async image=>bytesToBase64(await encodePngBytes(image)))),prompt,seed,images[0]);
  const references=Object.fromEntries([body,partner].map((b,index)=>[b.row.document.direction,{sha:b.sha,index}]));
  const context:EquipmentContext={kind:'equipment-dress',name:item.name,slot:item.slot,prompt:item.prompt,key,pad,referenceSha:body.sha,bodyId,bodyIds:[bodyId,partnerId],references};
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
  const request=itemRoute.pose({keyframePngB64:bytesToBase64(new Uint8Array(await blob.arrayBuffer())),rest:body.params.first_frame_keypoints,poses:body.params.keypoints,item:context.prompt,slot:context.slot,key:context.key,anim:doc.clip.id==='attack'?'overhead arm strike':doc.clip.id,dir:doc.direction,seed,cell,pad:context.pad,view:'low top-down'});
  return enqueueLab(doc,seed,request,poseCallGens(body.params.keypoints.length),{...context,kind:'equipment-pose',bodyId,dressId,referenceSha:body.sha,rotated:f0Last(context.slot,body.params.first_frame_keypoints,body.params.keypoints,cell)});
}
