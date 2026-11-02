// One source-bound clean-input experiment. The failed equipment gate is not changed here.
import {base64ToBytes,type Img} from '../../lib/image/png.ts';
import {decodePngBytes} from '../../lib/image/pngraw.ts';
import {sha256,stableStringify} from '../../lib/image/hash.ts';
import {chromaMask} from '../../lib/image/chroma.ts';
import {cutGrid} from '../../lib/items/items.ts';
import {hardMaskBits} from '../../lib/image/hard-mask.ts';
import type {InpaintV3} from '../../lib/pixellab/routes.ts';
import type {JobRec} from '../../lib/pixellab/queue.ts';
import * as db from '../../lib/store/db.ts';
import {BODY_STAR_RECIPE_SHA256,COMPLETION_SWAP_PACKET_SHA256,SWAP_PACKET_SHA256,readCompletionSwap} from './weapon-swap.ts';
import {dispatchFixedInpaint,readFixedInpaint,exportFixedInpaint} from './fixed-inpaint.ts';

export const CLEAN_GRIP_KEY='pixeldoll.motionPilot.cleanGrip.2026-11-02';
// Only the reviewed frame4-contact alternative is allowed; the original corner-touch draft is rejected.
export const CLEAN_GRIP_PACKET_SHA256='516a48a77fea477e0c3bc7d39ba35bfad8d6ca78a9e169dfa70314ca60daba0c';
interface PinnedImage {png:string;sha256:string;rgbaSha256:string}
interface CleanGripFrame {index:number;frozenGreen:PinnedImage;frozenSkin:PinnedImage;editMask:PinnedImage;desiredLayer:PinnedImage;visibleDesiredLayer:PinnedImage}
interface CleanGripSource {jobId:string;requestHash:string;resultSha256:string;sourcePacketCanonicalHash:string}
interface CleanGripReference extends PinnedImage {index:number;sourceCell:number;gridCell:number;sourceJobId:string;sourceRequestHash:string;sourceResultSha256:string;sourcePacketCanonicalHash:string}
export interface CleanGripPacket {version:1;kind:'clean-grip-control';cell:144;cols:2;indices:number[];frames:CleanGripFrame[];sourceBodyRecipeCanonicalHash:string;sourceCompletionSwapPacketCanonicalHash:string;sourceCompletionSwap:CleanGripSource;sourceAsset:PinnedImage;references:CleanGripReference[];gridSha256:string;maskSha256:string;canonicalHash:string;request:InpaintV3;[key:string]:unknown}
const hex=(v:unknown):v is string=>typeof v==='string'&&/^[a-f0-9]{64}$/.test(v);
export function parseCleanGripPacket(value:unknown):CleanGripPacket {
  const p=value as CleanGripPacket;
  if(!hex(CLEAN_GRIP_PACKET_SHA256))throw new Error('The clean-grip packet is not reviewed for submission yet.');
  if(p?.version!==1||p.kind!=='clean-grip-control'||p.cell!==144||p.cols!==2||JSON.stringify(p.indices)!=='[3,4]'||!Array.isArray(p.frames)||p.frames.length!==2||p.frames.some((f,i)=>f.index!==[3,4][i])||!Array.isArray(p.references)||p.references.length!==2)throw new Error('Expected the fixed two-frame clean-grip packet.');
  if(p.request?.seed!==738||p.request.no_background!==true||typeof p.request.description!=='string'||!p.request.description.trim()||p.sourceBodyRecipeCanonicalHash!==BODY_STAR_RECIPE_SHA256||p.sourceCompletionSwapPacketCanonicalHash!==COMPLETION_SWAP_PACKET_SHA256)throw new Error('The clean-grip source or fixed request contract changed.');
  for(const image of [p.request.inpainting_image,p.request.mask_image])if(image?.image?.type!=='base64'||typeof image.image.base64!=='string'||image.image.base64.length>2_000_000||image.size?.width!==288||image.size.height!==288)throw new Error('Clean-grip requires two bounded288 by288 PNG grids.');
  return p;
}
function same(a:Img,b:Img,label:string){if(a.w!==b.w||a.h!==b.h||a.data.some((v,i)=>v!==b.data[i]))throw new Error(label+' differs from the reviewed source pixels.');}
async function checkedImage(value:PinnedImage,label:string){
  if(!value||typeof value.png!=='string'||value.png.length>2_000_000||!hex(value.sha256)||!hex(value.rgbaSha256))throw new Error(label+' is missing its image identity.');
  const bytes=base64ToBytes(value.png),image=await decodePngBytes(bytes);
  if(image.w!==144||image.h!==144||await sha256(bytes)!==value.sha256||await sha256(new Uint8Array(image.data))!==value.rgbaSha256)throw new Error(label+' dimensions or image hash changed.');
  if(image.data.some((v,i)=>i%4===3&&v!==0&&v!==255))throw new Error(label+' must have binary alpha.');
  return image;
}
async function sourceGrid(source:CleanGripSource,completion:boolean){
  const expected=completion?COMPLETION_SWAP_PACKET_SHA256:SWAP_PACKET_SHA256;
  if(source?.sourcePacketCanonicalHash!==expected||!hex(source.requestHash)||!hex(source.resultSha256)||typeof source.jobId!=='string')throw new Error('The clean-grip reference ancestry changed.');
  const job=await db.get<JobRec>('jobs',source.jobId),results=job?.jobs.flatMap(j=>j.results);
  if(job?.state!=='done'||job.requestHash!==source.requestHash||results?.length!==1||results[0].sha!==source.resultSha256)throw new Error('The exact completed clean-grip source receipt is required.');
  const blob=await db.getBlob(source.resultSha256);if(!blob)throw new Error('A clean-grip source result is missing.');
  const bytes=new Uint8Array(await blob.arrayBuffer());if(await sha256(bytes)!==source.resultSha256)throw new Error('A clean-grip source result hash changed.');
  const image=await decodePngBytes(bytes);
  if(image.w!==(completion?432:288)||image.h!==288)throw new Error('A clean-grip source result has the wrong canvas.');
  return cutGrid(image,completion?6:4,144,144,completion?3:2);
}
export async function submitCleanGrip(value:unknown){
  // Snapshot before asynchronous reads so a caller cannot change a verified mask before dispatch.
  const packet=parseCleanGripPacket(structuredClone(value));
  if(packet.canonicalHash!==CLEAN_GRIP_PACKET_SHA256||await sha256(stableStringify({...packet,canonicalHash:undefined}))!==CLEAN_GRIP_PACKET_SHA256)throw new Error('The clean-grip file differs from the reviewed packet. No request was submitted.');
  const receipt=readCompletionSwap(),source=packet.sourceCompletionSwap,ancestor=receipt?.packet;
  if(!ancestor||receipt?.jobId!==source?.jobId||ancestor.canonicalHash!==COMPLETION_SWAP_PACKET_SHA256||await sha256(stableStringify({...ancestor,canonicalHash:undefined}))!==COMPLETION_SWAP_PACKET_SHA256)throw new Error('The stored completed736 packet is required for the clean-grip body ancestry.');
  const recipe=ancestor.bodyRecipe;
  if(recipe?.canonicalHash!==BODY_STAR_RECIPE_SHA256||await sha256(stableStringify({...recipe,canonicalHash:undefined}))!==BODY_STAR_RECIPE_SHA256||recipe.cell!==144||recipe.frames.length!==8)throw new Error('The clean-grip body recipe differs from authored445.');
  const completed=await sourceGrid(source,true),inputBytes=base64ToBytes(packet.request.inpainting_image.image.base64),maskBytes=base64ToBytes(packet.request.mask_image.image.base64);
  if(await sha256(inputBytes)!==packet.gridSha256||await sha256(maskBytes)!==packet.maskSha256)throw new Error('The clean-grip prepared grid or mask hash changed.');
  const input=await decodePngBytes(inputBytes),mask=await decodePngBytes(maskBytes);
  if(input.w!==288||input.h!==288||mask.w!==288||mask.h!==288)throw new Error('The clean-grip PNG grids have the wrong canvas.');
  hardMaskBits(mask);
  const cells=cutGrid(input,4,144,144,2),masks=cutGrid(mask,4,144,144,2);
  for(const [i,frame]of packet.frames.entries()){
    const body=await checkedImage(frame.frozenGreen,'Frozen green body'),skin=await checkedImage(frame.frozenSkin,'Frozen skin body'),desired=await checkedImage(frame.desiredLayer,'Desired item control'),visible=await checkedImage(frame.visibleDesiredLayer,'Visible item control'),edit=await checkedImage(frame.editMask,'Target edit mask');
    const original=recipe.frames.find(f=>f.index===frame.index);if(!original||frame.frozenGreen.sha256!==original.sha256)throw new Error('The clean-grip body is not the exact authored recipe frame.');
    same(body,await checkedImage(original,'Authored recipe body'),'Frozen body');same(body,cells[i],'Packed clean body');same(edit,masks[i],'Packed edit mask');
    const bits=hardMaskBits(edit);
    for(let p=0;p<bits.length;p++){
      const q=p*4,x=p%144,y=Math.floor(p/144),opaque=body.data[q+3]>0;
      if(skin.data[q+3]!==body.data[q+3])throw new Error('Frozen skin and green body alpha differ.');
      let near=false;
      for(let dy=-1;dy<=1;dy++)for(let dx=-1;dx<=1;dx++){const X=x+dx,Y=y+dy;if(X>=0&&X<144&&Y>=0&&Y<144&&desired.data[(Y*144+X)*4+3])near=true;}
      if(bits[p]!==Number(!opaque&&near&&x>=16&&x<128&&y>=16&&y<128))throw new Error('The clean-grip mask must be exactly the desired item margin on transparent pixels; all body pixels stay protected.');
      for(let k=0;k<4;k++)if(visible.data[q+k]!==(!opaque?desired.data[q+k]:0))throw new Error('The visible item control does not preserve body occlusion.');
      if(desired.data[q+3]&&(x<16||x>=128||y<16||y>=128))throw new Error('A clean-grip desired item exceeds the held window.');
    }
  }
  for(const [i,ref]of packet.references.entries()){
    const completion=i===0;
    if(ref.index!==(completion?5:6)||ref.sourceCell!==(completion?2:3)||ref.gridCell!==i+2)throw new Error('The clean-grip reference cell layout changed.');
    const sourceRef={jobId:ref.sourceJobId,requestHash:ref.sourceRequestHash,resultSha256:ref.sourceResultSha256,sourcePacketCanonicalHash:ref.sourcePacketCanonicalHash};
    if(completion&&stableStringify(sourceRef)!==stableStringify({jobId:source.jobId,requestHash:source.requestHash,resultSha256:source.resultSha256,sourcePacketCanonicalHash:source.sourcePacketCanonicalHash}))throw new Error('The clean-grip reference does not match its completed736 ancestor.');
    const actual=completion?completed:await sourceGrid(sourceRef,false),image=await checkedImage(ref,'Actual hatchet reference');
    same(image,actual[ref.sourceCell],'Hatchet reference');same(image,cells[i+2],'Packed reference');
    if(hardMaskBits(masks[i+2]).some(Boolean))throw new Error('Clean-grip reference cells must be fully protected.');
  }
  const asset=await checkedImage(packet.sourceAsset,'Clean source asset'),reference=completed[2],nonkey=chromaMask(reference,'green');
  for(let p=0;p<144*144;p++)if(asset.data[p*4+3]&&(!nonkey[p]||asset.data.subarray(p*4,p*4+4).some((v,k)=>v!==reference.data[p*4+k])))throw new Error('The clean source asset is not drawn from the actual736 frame5 item pixels.');
  return dispatchFixedInpaint({key:CLEAN_GRIP_KEY,label:'Clean-input protected-body grip control, east frames3/4',units:25},packet,packet.request);
}
export const readCleanGrip=()=>readFixedInpaint<CleanGripPacket>(CLEAN_GRIP_KEY);
export const exportCleanGrip=()=>exportFixedInpaint<CleanGripPacket>(CLEAN_GRIP_KEY);
