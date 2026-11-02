// Fixed reverse experiment: adopt an armed source, remove its prop, then review a newly frozen base.
import {base64ToBytes} from '../../lib/image/png.ts';
import {decodePngBytes} from '../../lib/image/pngraw.ts';
import {hardMaskBits} from '../../lib/image/hard-mask.ts';
import {sha256,stableStringify} from '../../lib/image/hash.ts';
import {cutGrid} from '../../lib/items/items.ts';
import {keyScore,KT} from '../../lib/image/chroma.ts';
import type {InpaintV3} from '../../lib/pixellab/routes.ts';
import type {JobRec} from '../../lib/pixellab/queue.ts';
import * as db from '../../lib/store/db.ts';
import {dispatchFixedInpaint,readFixedInpaint,exportFixedInpaint} from './fixed-inpaint.ts';
export const DISARM_KEY='pixeldoll.motionPilot.weaponAware.2026-11-02';
export const DISARM_PACKET_SHA256='834ba23d967c560dc61fd0d11dc17c2fa826c7f662e69b642f75f70447d4d341';
export const COMPLETION_DISARM_KEY='pixeldoll.motionPilot.completionDisarm.2026-11-02';
export const COMPLETION_DISARM_PACKET_SHA256='d7bb854ba6c6eb013e2541e6b3bc830ed50741f16aa7760cd41fdf26f8d5fbcd';
interface Correction {x:number;y:number;from:number[];to:number[];reason:string}
interface DisarmFrame {index:number;png:string;sha256:string;rgbaSha256:string;rawRgbaSha256:string;weaponMask:string;bodyMask:string;unknownMask:string;editMask:string;cleanup:Correction[];grip:{x:number;y:number}}
export interface DisarmPacket {version:1;kind:'weapon-aware-disarm';cell:144;cols:2;indices:number[];frames:DisarmFrame[];sourceJobId:string;sourceRequestHash:string;sourceGridSha256:string;gridSha256:string;maskSha256:string;canonicalHash:string;request:InpaintV3;[key:string]:unknown}
const indices=[1,3,4,6],hex=(s:unknown)=>typeof s==='string'&&/^[0-9a-f]{64}$/.test(s);
const completionIndices=[0,2,5,7],completionCleanupCounts=[27,1,114,2];
const profileOf=(p:DisarmPacket)=>p.request.seed===735?{key:COMPLETION_DISARM_KEY,sha:COMPLETION_DISARM_PACKET_SHA256,label:'Reviewed completion-source disarm, east frames 0/2/5/7'}:{key:DISARM_KEY,sha:DISARM_PACKET_SHA256,label:'Weapon-aware source disarm, east frames 1/3/4/6'};
export function parseDisarmPacket(value:unknown):DisarmPacket {
  const p=value as DisarmPacket;
  const selected=p?.request?.seed===735?completionIndices:indices;
  if(p?.version!==1||p.kind!=='weapon-aware-disarm'||p.cell!==144||p.cols!==2||JSON.stringify(p.indices)!==JSON.stringify(selected)||!Array.isArray(p.frames)||p.frames.length!==4||p.frames.some((f,i)=>f.index!==selected[i]||![f.sha256,f.rgbaSha256,f.rawRgbaSha256].every(hex)||!Array.isArray(f.cleanup)))throw new Error('Expected the fixed four-frame weapon-aware disarm packet.');
  if(!hex(p.canonicalHash)||!hex(p.sourceGridSha256)||!hex(p.sourceRequestHash)||typeof p.sourceJobId!=='string'||!hex(p.gridSha256)||!hex(p.maskSha256)||typeof p.request?.description!=='string'||!p.request.description.trim()||![732,735].includes(p.request.seed??0)||p.request.no_background!==true)throw new Error('The disarm source, prompt or receipt contract is invalid.');
  for(const image of [p.request.inpainting_image,p.request.mask_image])if(image?.image?.type!=='base64'||typeof image.image.base64!=='string'||image.image.base64.length>2_000_000||image.size?.width!==288||image.size.height!==288)throw new Error('The disarm probe requires two bounded 288 by 288 PNG grids.');
  return p;
}
export async function maskBits(png:string,width:number,height=width){
  const image=await decodePngBytes(base64ToBytes(png));if(image.w!==width||image.h!==height)throw new Error('A disarm mask has the wrong canvas.');
  return hardMaskBits(image);
}
export async function verifiedOriginalSourceFrames(job:JobRec){
  const originalHash=(job.params as {inpainting_image?:{image?:{$blob?:string}}}).inpainting_image?.image?.$blob;
  if(typeof originalHash!=='string'||!hex(originalHash)||!job.inputs.includes(originalHash))throw new Error('The completion source is missing its original input identity.');
  const originalBlob=await db.getBlob(originalHash);if(!originalBlob)throw new Error('The completion source original input is missing.');
  const originalBytes=new Uint8Array(await originalBlob.arrayBuffer());if(await sha256(originalBytes)!==originalHash)throw new Error('The completion source original input hash changed.');
  const original=await decodePngBytes(originalBytes);if(original.w!==432||original.h!==288)throw new Error('The completion source original input has a different canvas.');
  return cutGrid(original,6,144,144,3);
}
export async function submitDisarm(value:unknown){
  const packet=parseDisarmPacket(value),profile=profileOf(packet),completion=packet.request.seed===735,unsigned={...packet,canonicalHash:undefined};
  if(packet.canonicalHash!==profile.sha||await sha256(stableStringify(unsigned))!==profile.sha)throw new Error('The disarm file differs from the reviewed packet. No request was submitted.');
  const job=await db.get<JobRec>('jobs',packet.sourceJobId),results=job?.jobs.flatMap(j=>j.results);
  if(job?.state!=='done'||job.requestHash!==packet.sourceRequestHash||results?.length!==1||results[0].sha!==packet.sourceGridSha256)throw new Error('The exact completed armed source receipt is required before disarming.');
  const blob=await db.getBlob(results[0].sha);if(!blob)throw new Error('The frozen armed source grid is missing.');
  const bytes=new Uint8Array(await blob.arrayBuffer());if(await sha256(bytes)!==packet.sourceGridSha256)throw new Error('The armed source PNG hash changed.');
  const source=await decodePngBytes(bytes),inputBytes=base64ToBytes(packet.request.inpainting_image.image.base64),maskBytes=base64ToBytes(packet.request.mask_image.image.base64),input=await decodePngBytes(inputBytes);
  if(source.w!==432||source.h!==288||input.w!==288||input.h!==288||await sha256(inputBytes)!==packet.gridSha256||await sha256(maskBytes)!==packet.maskSha256)throw new Error('The source or prepared grid differs from the reviewed dimensions/hash.');
  const raw=cutGrid(source,6,144,144,3),targets=cutGrid(input,4,144,144,2),mask=await maskBits(packet.request.mask_image.image.base64,288);
  const originals=completion?await verifiedOriginalSourceFrames(job):undefined;
  for(const [i,frame]of packet.frames.entries()){
    const image=raw[i];if(await sha256(new Uint8Array(image.data))!==frame.rawRgbaSha256)throw new Error('A source frame differs from the retained provider pixels.');
    const corrected=new Set<number>();if(completion&&frame.cleanup.length!==completionCleanupCounts[i])throw new Error('The completion source correction count differs from its reviewed ledger.');
    for(const correction of frame.cleanup){const expected=frame.index===1?[63,55]:frame.index===4?[68,101]:null;
      if(completion){
        const {x,y,from,to}=correction,p=y*144+x;
        if(!Number.isInteger(x)||!Number.isInteger(y)||x<0||y<0||x>=144||y>=144||corrected.has(p)||!Array.isArray(from)||from.length!==4||!from.every(v=>Number.isInteger(v)&&v>=0&&v<=255)||JSON.stringify(to)!=='[0,0,0,0]'||originals![i].data.subarray(p*4,p*4+4).some(Boolean))throw new Error('A completion correction is duplicated, invalid or overwrites original source pixels.');
        corrected.add(p);
      }else if(!expected||correction.x!==expected[0]||correction.y!==expected[1]||JSON.stringify(correction.from)!=='[255,255,255,255]'||JSON.stringify(correction.to)!=='[0,0,0,0]')throw new Error('An unreviewed source cleanup was requested.');
      const p=(correction.y*144+correction.x)*4;if(image.data.subarray(p,p+4).some((v,k)=>v!==correction.from[k]))throw new Error('An approved cleanup pixel no longer matches the raw source.');image.data.set(correction.to,p);
    }
    const frameBytes=base64ToBytes(frame.png),frameImage=await decodePngBytes(frameBytes);
    if(frameImage.w!==144||frameImage.h!==144||await sha256(new Uint8Array(frameImage.data))!==frame.rgbaSha256||await sha256(new Uint8Array(image.data))!==frame.rgbaSha256||await sha256(new Uint8Array(targets[i].data))!==frame.rgbaSha256||await sha256(frameBytes)!==frame.sha256)throw new Error(completion?'The derived target changed beyond its reviewed source correction ledger.':'The derived target changed beyond its documented two-pixel cleanup.');
    const [weapon,body,unknown,edit]=await Promise.all([frame.weaponMask,frame.bodyMask,frame.unknownMask,frame.editMask].map(s=>maskBits(s,144)));
    for(let p=0;p<144*144;p++){const q=p*4,alpha=image.data[q+3],sum=weapon[p]+body[p]+unknown[p],global=(Math.floor(i/2)*144+Math.floor(p/144))*288+(i%2)*144+p%144;
      if(![0,255].includes(alpha)||sum!==(alpha?1:0)||edit[p]!==weapon[p]+unknown[p]||mask[global]!==edit[p]||(!alpha&&edit[p])||(body[p]&&edit[p]))throw new Error('The disarm mask must protect known body and transparency with disjoint weapon/body/unknown labels and binary source alpha.');
      if(alpha>=128&&keyScore('green',image.data[q],image.data[q+1],image.data[q+2])>=KT&&!body[p])throw new Error('A known key-colored body pixel was exposed to disarm editing.');
    }
  }
  return dispatchFixedInpaint({key:profile.key,label:profile.label,units:25},packet,packet.request);
}
export const readDisarm=()=>readFixedInpaint<DisarmPacket>(DISARM_KEY);
export const exportDisarm=()=>exportFixedInpaint<DisarmPacket>(DISARM_KEY);
export const readCompletionDisarm=()=>readFixedInpaint<DisarmPacket>(COMPLETION_DISARM_KEY);
export const exportCompletionDisarm=()=>exportFixedInpaint<DisarmPacket>(COMPLETION_DISARM_KEY);
