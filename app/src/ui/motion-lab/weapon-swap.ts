// One source-bound swap diagnostic. Its pin records a limited review, not a global equipment pass.
import {base64ToBytes} from '../../lib/image/png.ts';
import {decodePngBytes} from '../../lib/image/pngraw.ts';
import {sha256,stableStringify} from '../../lib/image/hash.ts';
import {cutGrid} from '../../lib/items/items.ts';
import type {InpaintV3} from '../../lib/pixellab/routes.ts';
import {DISARM_PACKET_SHA256,exportDisarm,maskBits} from './weapon-aware.ts';
import {dispatchFixedInpaint,exportFixedInpaint,readFixedInpaint} from './fixed-inpaint.ts';
export const SWAP_KEY='pixeldoll.motionPilot.weaponSwap.2026-11-02';
export const SWAP_PACKET_SHA256='287f215152db5ea978fd4319b1c3025344a9046a6c28b665f7e44402d261a56b';
interface SwapFrame {index:number;png:string;sha256:string;rgbaSha256:string;weaponMask:string;bodyMask:string;unknownMask:string;editMask:string;grip:{x:number;y:number};frozenBase:{png:string;sha256:string;rgbaSha256:string}}
export interface SwapPacket {version:1;kind:'weapon-aware-swap';cell:144;cols:2;indices:number[];frames:SwapFrame[];sourceDisarmJobId:string;sourceDisarmResultSha:string;sourceDisarmCallId:string;sourceArmedPacketCanonicalHash:string;gridSha256:string;maskSha256:string;canonicalHash:string;request:InpaintV3;[key:string]:unknown}
const indices=[1,3,4,6];
export function parseSwapPacket(value:unknown):SwapPacket {
  const p=value as SwapPacket;
  if(p?.version!==1||p.kind!=='weapon-aware-swap'||p.cell!==144||p.cols!==2||JSON.stringify(p.indices)!=='[1,3,4,6]'||!Array.isArray(p.frames)||p.frames.length!==4||p.frames.some((f,i)=>f.index!==indices[i]||!f.frozenBase||!Number.isFinite(f.grip?.x)||!Number.isFinite(f.grip?.y)))throw new Error('Expected the fixed four-frame weapon swap packet.');
  if(p.request?.seed!==733||p.request.no_background!==true||typeof p.request.description!=='string'||!p.request.description.trim())throw new Error('Invalid swap prompt or fixed seed.');
  for(const image of [p.request.inpainting_image,p.request.mask_image])if(image?.image?.type!=='base64'||typeof image.image.base64!=='string'||image.image.base64.length>2_000_000||image.size?.width!==288||image.size.height!==288)throw new Error('The swap requires two bounded 288 by 288 PNG grids.');
  return p;
}
export async function submitSwap(value:unknown){
  const packet=parseSwapPacket(value);
  if(packet.canonicalHash!==SWAP_PACKET_SHA256||await sha256(stableStringify({...packet,canonicalHash:undefined}))!==SWAP_PACKET_SHA256)throw new Error('The swap file differs from the reviewed source-bound diagnostic.');
  // The exact hash-bound source was reviewed for one swap despite its twelve uncertain source-rim pixels.
  const prior=await exportDisarm();
  if(prior.probe?.callId!==packet.sourceDisarmCallId||prior.probe.jobId!==packet.sourceDisarmJobId||prior.probe.packet.canonicalHash!==DISARM_PACKET_SHA256||packet.sourceArmedPacketCanonicalHash!==DISARM_PACKET_SHA256||prior.job?.state!=='done'||prior.job.id!==packet.sourceDisarmJobId||prior.images.length!==1||prior.images[0].sha!==packet.sourceDisarmResultSha)throw new Error('The exact reviewed completed disarm receipt is required for this swap.');
  if(await sha256(stableStringify({...prior.probe.packet,canonicalHash:undefined}))!==DISARM_PACKET_SHA256||packet.gridSha256!==prior.probe.packet.gridSha256)throw new Error('The reviewed armed source packet or original input identity changed.');
  const bareBytes=base64ToBytes(prior.images[0].png),inputBytes=base64ToBytes(packet.request.inpainting_image.image.base64),maskBytes=base64ToBytes(packet.request.mask_image.image.base64);
  if(await sha256(bareBytes)!==packet.sourceDisarmResultSha||await sha256(inputBytes)!==packet.gridSha256||await sha256(maskBytes)!==packet.maskSha256||!prior.job.inputs.includes(packet.gridSha256))throw new Error('The frozen disarm result or original armed input hash changed.');
  const bare=await decodePngBytes(bareBytes),input=await decodePngBytes(inputBytes);
  if(bare.w!==288||bare.h!==288||input.w!==288||input.h!==288)throw new Error('The swap source has a different canvas.');
  const bodies=cutGrid(bare,4,144,144,2),armed=cutGrid(input,4,144,144,2),mask=await maskBits(packet.request.mask_image.image.base64,288);
  for(const [i,frame]of packet.frames.entries()){
    const image=armed[i],body=bodies[i],frozenBytes=base64ToBytes(frame.frozenBase.png),frozen=await decodePngBytes(frozenBytes),sourceBytes=base64ToBytes(frame.png),source=await decodePngBytes(sourceBytes);
    if(source.w!==144||source.h!==144||frozen.w!==144||frozen.h!==144||await sha256(sourceBytes)!==frame.sha256||await sha256(new Uint8Array(source.data))!==frame.rgbaSha256||await sha256(new Uint8Array(image.data))!==frame.rgbaSha256||await sha256(frozenBytes)!==frame.frozenBase.sha256||await sha256(new Uint8Array(frozen.data))!==frame.frozenBase.rgbaSha256||await sha256(new Uint8Array(body.data))!==frame.frozenBase.rgbaSha256)throw new Error('A swap frame differs from its frozen source pixels.');
    const original=prior.probe.packet.frames[i];
    if(frame.grip.x!==original.grip?.x||frame.grip.y!==original.grip?.y)throw new Error('A swap grip differs from its reviewed source observation.');
    const [weapon,known,unknown,edit,oldWeapon,oldKnown,oldUnknown]=await Promise.all([frame.weaponMask,frame.bodyMask,frame.unknownMask,frame.editMask,original.weaponMask,original.bodyMask,original.unknownMask].map(s=>maskBits(s,144)));
    for(let p=0;p<144*144;p++){const alpha=image.data[p*4+3],x=p%144,y=Math.floor(p/144),global=(Math.floor(i/2)*144+y)*288+(i%2)*144+x;
      if(![0,255].includes(alpha)||weapon[p]!==oldWeapon[p]||known[p]!==oldKnown[p]||unknown[p]!==oldUnknown[p]||weapon[p]+known[p]+unknown[p]!==Number(alpha>0)||edit[p]!==mask[global]||((known[p]||unknown[p])&&edit[p])||(weapon[p]&&!edit[p])||(!alpha&&edit[p]&&Math.hypot(x+.5-frame.grip.x,y+.5-frame.grip.y)>40))throw new Error('The swap edit exceeds its reviewed weapon/transparent envelope, changes source labels or exposes visible fingers.');
    }
  }
  return dispatchFixedInpaint({key:SWAP_KEY,label:'Frozen weapon-aware body, one-handed hatchet swap',units:25},packet,packet.request);
}
export const readSwap=()=>readFixedInpaint<SwapPacket>(SWAP_KEY);
export const exportSwap=()=>exportFixedInpaint<SwapPacket>(SWAP_KEY);
