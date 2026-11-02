// One reviewed, frozen-frame diagnostic. This is not a production fitting route.
import {get} from 'svelte/store';
import {routes,png,type InpaintV3} from '../../lib/pixellab/routes.ts';
import {requestIdentity,type JobRec} from '../../lib/pixellab/queue.ts';
import {base64ToBytes,bytesToBase64,pngSize} from '../../lib/image/png.ts';
import {decodePngBytes} from '../../lib/image/pngraw.ts';
import {toChroma} from '../../lib/image/chroma.ts';
import {padImg} from '../../lib/items/items.ts';
import {sha256,stableStringify} from '../../lib/image/hash.ts';
import * as db from '../../lib/store/db.ts';
import {readPilot} from './pilot.ts';
import {labQueue,LAB_TAG,reconcileResearchJobs,existingLabRequest} from './run.ts';
import {RESEARCH_PHASE,reserveResearchCall,recordResearchOutcome,readResearchBudget} from './research-budget.ts';
export interface ManagedEquipmentProbe {
  version:1;kind:'managed-equipment-probe';characterId:string;animationGroupId:string;direction:'east';cell:144;cols:3;
  indices:number[];frames:{index:number;sha256:string}[];request:InpaintV3;
  [key:string]:unknown;
}
const KEY='pixeldoll.motionPilot.equipment.2026-11-01',indices=[1,3,4,6];
// Binds the reviewed prompt, mask, references and provenance, not just a mutable file's dimensions.
export const MANAGED_PROBE_SHA256='3c20bfe77c4198521731c283082a00d6445e92beaf8d01298cc7db69c04aa43f';
interface ProbeRecord {version:1;packet:ManagedEquipmentProbe;callId:string;jobId?:string;error?:string}
export function readManagedEquipment():ProbeRecord|null {const text=localStorage.getItem(KEY);if(!text)return null;const row=JSON.parse(text) as ProbeRecord;if(row.version!==1)throw new Error('Unsupported managed equipment receipt.');return row;}
export function parseManagedEquipment(value:unknown):ManagedEquipmentProbe {
  const p=value as ManagedEquipmentProbe;
  if(p?.version!==1||p.kind!=='managed-equipment-probe'||p.direction!=='east'||p.cell!==144||p.cols!==3||typeof p.characterId!=='string'||typeof p.animationGroupId!=='string'||JSON.stringify(p.indices)!==JSON.stringify(indices)||!Array.isArray(p.frames)||p.frames.length!==4||p.frames.some((f,i)=>f.index!==indices[i]||!/^[a-f0-9]{64}$/.test(f.sha256)))throw new Error('Expected the reviewed four-frame east managed equipment diagnostic.');
  if(typeof p.request?.description!=='string'||!p.request.description.trim()||p.request.description.length>10000||p.request.seed!==731||p.request.no_background!==true)throw new Error('The diagnostic prompt, seed or transparency contract is invalid.');
  for(const image of [p.request.inpainting_image,p.request.mask_image]) {
    if(image?.image?.type!=='base64'||typeof image.image.base64!=='string'||image.image.base64.length>2_000_000||image.size?.width!==432||image.size.height!==288)throw new Error('The diagnostic needs two bounded 432 by 288 PNG grids.');
    const size=pngSize(base64ToBytes(image.image.base64));if(size?.w!==432||size.h!==288)throw new Error('Diagnostic PNG dimensions do not match their declared grid.');
  }
  return p;
}
async function verifyFrozenFrames(packet:ManagedEquipmentProbe) {
  const pilot=readPilot();if(pilot?.characterId!==packet.characterId||pilot.verification?.length!==4||pilot.verification.some(v=>v.changedPixels))throw new Error('This probe does not belong to the verified exact-artwork pilot.');
  const character=pilot.character as {animations?:{animation_group_id:string;directions:{direction:string;frames:string[]}[]}[]};
  const direction=character?.animations?.find(a=>a.animation_group_id===packet.animationGroupId)?.directions.find(d=>d.direction==='east');
  if(direction?.frames.length!==8)throw new Error('The completed managed east clip is missing. Refresh its existing receipt first.');
  const grid=await decodePngBytes(base64ToBytes(packet.request.inpainting_image.image.base64)),mask=await decodePngBytes(base64ToBytes(packet.request.mask_image.image.base64));
  let editable=0;
  for(let y=0;y<288;y++)for(let x=0;x<432;x++){const i=(y*432+x)*4,v=mask.data[i],cell=Math.floor(y/144)*3+Math.floor(x/144);if(mask.data[i+3]!==255||![0,255].includes(v)||mask.data[i+1]!==v||mask.data[i+2]!==v)throw new Error('The diagnostic requires an opaque binary hard mask.');if(v===255){if(cell>=4)throw new Error('The sword reference cells must remain fully protected.');editable++;}}
  if(!editable||editable>432*288/2)throw new Error('The diagnostic edit region is empty or exceeds its reviewed scope.');
  for(const [cell,frame]of packet.frames.entries()) {
    const url=direction.frames[frame.index];if(!url?.startsWith('https://backblaze.pixellab.ai/'))throw new Error('Unexpected managed asset origin.');
    const response=await fetch(url);if(!response.ok)throw new Error(`Frozen-frame verification failed (${response.status}).`);
    const bytes=new Uint8Array(await response.arrayBuffer());if(await sha256(bytes)!==frame.sha256)throw new Error('A managed frame differs from the reviewed frozen input.');
    const native=await decodePngBytes(bytes);if(native.w!==112||native.h!==112)throw new Error('The managed diagnostic needs the original 112 px canvas.');
    const image=padImg(toChroma(native,'green'),16);
    for(let y=0;y<144;y++)for(let x=0;x<144;x++) {const source=(y*144+x)*4,target=((Math.floor(cell/3)*144+y)*432+(cell%3)*144+x)*4;if((image.data[source+3]||grid.data[target+3])&&image.data.subarray(source,source+4).some((v,k)=>v!==grid.data[target+k]))throw new Error('The diagnostic grid differs from the exact frozen body chroma copy.');}
  }
}
export async function submitManagedEquipment(value:unknown) {
  if(!labQueue.key)throw new Error('Connect the localhost agent session first.');
  const packet=parseManagedEquipment(value);if(await sha256(stableStringify(packet))!==MANAGED_PROBE_SHA256)throw new Error('This file differs from the one reviewed equipment diagnostic. No request was submitted.');await verifyFrozenFrames(packet);await reconcileResearchJobs();
  if(!navigator.locks)throw new Error('Safe diagnostic accounting requires browser Web Locks.');
  return navigator.locks.request(KEY,async()=>{
    if(readManagedEquipment())throw new Error('This one-shot diagnostic already has a receipt or unknown outcome. It will not be resent.');
    const request=routes.inpaintV3({description:packet.request.description,inpainting_image:{image:png(packet.request.inpainting_image.image.base64),size:{width:432,height:288}},mask_image:{image:png(packet.request.mask_image.image.base64),size:{width:432,height:288}},seed:731,no_background:true});
    const {requestHash}=await requestIdentity(request),existing=existingLabRequest(requestHash);if(existing)throw new Error(`This request already has receipt ${existing.id}. Inspect it instead of reserving or resending.`);
    const callId=RESEARCH_PHASE+'-managed-equipment-'+requestHash,approval=await reserveResearchCall({id:callId,label:'Frozen managed east sword diagnostic, frames 1/3/4/6',stage:'equipment',units:25});
    if(!approval.created)throw new Error('This diagnostic already has a reservation. Inspect its existing result.');
    const state:ProbeRecord={version:1,packet,callId};localStorage.setItem(KEY,JSON.stringify(state));
    try{const job=await labQueue.enqueue(request,{label:approval.record.label,tag:LAB_TAG,activityScope:LAB_TAG,playerRequested:true});state.jobId=job.id;localStorage.setItem(KEY,JSON.stringify(state));await recordResearchOutcome(callId,{status:'accepted',jobIds:[job.id]});return state;}
    catch(e){state.error=(e as Error).message;localStorage.setItem(KEY,JSON.stringify(state));await recordResearchOutcome(callId,{status:'unknown',note:state.error});throw e;}
  });
}
export async function exportManagedEquipment() {
  await reconcileResearchJobs();const probe=readManagedEquipment(),job=probe?.jobId?await db.get<JobRec>('jobs',probe.jobId):undefined;
  const images=await Promise.all((job?.jobs.flatMap(j=>j.results)??[]).map(async r=>{const blob=await db.getBlob(r.sha);if(!blob)throw new Error('A diagnostic result image is missing.');return{...r,png:bytesToBase64(new Uint8Array(await blob.arrayBuffer()))};}));
  return{version:1,probe,job,images,budget:readResearchBudget(),currentQueueState:probe?.jobId?get(labQueue).jobs.find(j=>j.id===probe.jobId)?.state:null};
}
