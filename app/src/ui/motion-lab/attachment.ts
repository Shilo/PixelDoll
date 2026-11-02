import {makeImg,base64ToBytes,pngSize,type Img} from '../../lib/image/png.ts';
import {decodePngBytes} from '../../lib/image/pngraw.ts';
export interface PixelPoint {x:number;y:number}
export const ATTACHMENT_DOCUMENT_MAX_BYTES=5_000_000;
export const ATTACHMENT_PALM_ERROR='Choose an opaque visible palm pixel on the frozen body. Hidden hands remain unmarked.';
export function attachmentPointIsOpaque(p:PixelPoint|undefined,image:Img){
  return !!p&&[p.x,p.y].every(Number.isFinite)&&p.x>=0&&p.y>=0&&p.x<image.w&&p.y<image.h&&image.data[(Math.floor(p.y)*image.w+Math.floor(p.x))*4+3]===255;
}
/** Rigid, nearest-neighbor placement around an explicitly calibrated grip. No pose or occlusion inference. */
export function rigidAttachment(source:Img,grip:PixelPoint,target:PixelPoint,radians:number,cell:{w:number;h:number}){
  if(![grip.x,grip.y,target.x,target.y,radians,cell.w,cell.h].every(Number.isFinite)||!Number.isSafeInteger(cell.w)||!Number.isSafeInteger(cell.h)||cell.w<1||cell.h<1||cell.w>512||cell.h>512)throw new Error('Attachment placement needs finite pixel coordinates and a 1-512 px canvas.');
  if(!attachmentPointIsOpaque(grip,source))throw new Error('Calibrate the source grip inside an opaque attachment pixel.');
  const image=makeImg(cell.w,cell.h),c=Math.cos(radians),s=Math.sin(radians);let clippedSourcePixels=0;
  for(let y=0;y<source.h;y++)for(let x=0;x<source.w;x++)if(source.data[(y*source.w+x)*4+3]){
    const dx=x+0.5-grip.x,dy=y+0.5-grip.y,tx=target.x+c*dx-s*dy,ty=target.y+s*dx+c*dy;
    if(tx<0||ty<0||tx>=cell.w||ty>=cell.h)clippedSourcePixels++;
  }
  for(let y=0;y<cell.h;y++)for(let x=0;x<cell.w;x++){
    const dx=x+0.5-target.x,dy=y+0.5-target.y,sx=Math.floor(grip.x+c*dx+s*dy),sy=Math.floor(grip.y-s*dx+c*dy);
    if(sx>=0&&sy>=0&&sx<source.w&&sy<source.h)image.data.set(source.data.subarray((sy*source.w+sx)*4,(sy*source.w+sx)*4+4),(y*cell.w+x)*4);
  }
  return{image,clippedSourcePixels};
}
export interface AttachmentBinding {jobId:string;hashes:string[];cell:{w:number;h:number};pivot:PixelPoint;direction:string;padding:number}
export interface AttachmentFrame {grip?:PixelPoint;angle:number;occluder:string;authoredPng?:string}
export interface AttachmentDocument {version:1;kind:'pixeldoll-authored-attachment';body:AttachmentBinding;asset:{png:string;grip:PixelPoint;axis:PixelPoint};frames:AttachmentFrame[];notes:string}
/** A geometric body-contact check only; it does not identify anatomical fingers or a palm. */
export function attachmentPalmIsOpaque(frame:AttachmentFrame,body:Img){
  return attachmentPointIsOpaque(frame.grip,body);
}
export function validateAttachment(value:unknown,binding:AttachmentBinding):AttachmentDocument{
  const d=value as AttachmentDocument;
  if(d?.version!==1||d.kind!=='pixeldoll-authored-attachment'||!d.body||d.body.jobId!==binding.jobId||d.body.direction!==binding.direction||d.body.padding!==binding.padding||d.body.cell?.w!==binding.cell.w||d.body.cell.h!==binding.cell.h||d.body.pivot?.x!==binding.pivot.x||d.body.pivot.y!==binding.pivot.y||JSON.stringify(d.body.hashes)!==JSON.stringify(binding.hashes)||!Array.isArray(d.frames)||d.frames.length!==binding.hashes.length||typeof d.notes!=='string')throw new Error('Attachment document does not match these exact frozen frames, canvas, pivot and direction.');
  if(new TextEncoder().encode(JSON.stringify(d)).byteLength>ATTACHMENT_DOCUMENT_MAX_BYTES)throw new Error('Attachment document exceeds 5 MB. Use smaller native PNGs before saving or exporting.');
  if(!d.asset?.grip||!d.asset.axis)throw new Error('Attachment source needs a grip and blade-axis point.');
  const size=pngSize(base64ToBytes(d.asset?.png??''));if(!size||size.w>512||size.h>512||![d.asset.grip.x,d.asset.grip.y,d.asset.axis.x,d.asset.axis.y].every(Number.isFinite)||d.asset.grip.x<0||d.asset.grip.y<0||d.asset.grip.x>=size.w||d.asset.grip.y>=size.h||Math.hypot(d.asset.axis.x-d.asset.grip.x,d.asset.axis.y-d.asset.grip.y)<1)throw new Error('Calibrate a valid attachment grip and blade-axis point.');
  const w=binding.cell.w+2*binding.padding,h=binding.cell.h+2*binding.padding;
  for(const f of d.frames){if(!f||typeof f.occluder!=='string')throw new Error('Attachment frame is missing its occlusion mask.');const mask=pngSize(base64ToBytes(f.occluder));if(!Number.isFinite(f.angle)||(f.grip!==undefined&&(!f.grip||![f.grip.x,f.grip.y].every(Number.isFinite)||f.grip.x<0||f.grip.y<0||f.grip.x>=w||f.grip.y>=h))||mask?.w!==w||mask.h!==h)throw new Error('Attachment frames need a finite angle, matching native occlusion masks and a valid grip when marked.');
    if(f.authoredPng!==undefined){if(typeof f.authoredPng!=='string'||f.authoredPng.length>2_800_000)throw new Error('Authored frame PNG exceeds 2 MB.');const size=pngSize(base64ToBytes(f.authoredPng));if(size?.w!==w||size.h!==h)throw new Error('Authored frame PNG must match the padded native canvas.');}
  }
  return d;
}
/** Native frame art bypasses rotation; both routes share the same body-only occlusion. */
export async function renderAttachmentFrame(source:Img,asset:AttachmentDocument['asset'],frame:AttachmentFrame,body:Img){
  if(!frame.grip)throw new Error('Mark this frame\'s visible palm on the frozen body before rendering or exporting its attachment.');
  if(!attachmentPalmIsOpaque(frame,body))throw new Error(ATTACHMENT_PALM_ERROR);
  const authored=frame.authoredPng!==undefined;
  const placed=authored?{image:await decodePngBytes(base64ToBytes(frame.authoredPng!)),clippedSourcePixels:0}:rigidAttachment(source,asset.grip,frame.grip,frame.angle*Math.PI/180-Math.atan2(asset.axis.y-asset.grip.y,asset.axis.x-asset.grip.x),body);
  if(authored&&placed.image.data.some((v,i)=>i%4===3&&v!==0&&v!==255))throw new Error('Authored frame PNG must use opaque or transparent pixels, without partial alpha.');
  const out=occludeAttachment(placed.image,body,await decodePngBytes(base64ToBytes(frame.occluder)));
  return{...out,clippedSourcePixels:placed.clippedSourcePixels,source:authored?'authored-frame' as const:'rigid-source' as const};
}
/** Only the equipment layer changes. An occluder is effective only on actual frozen body pixels. */
export function occludeAttachment(layer:Img,body:Img,occluder:Img){
  if([body,occluder].some(im=>im.w!==layer.w||im.h!==layer.h))throw new Error('Body, item and occlusion masks must share one native canvas.');
  const image={...layer,data:new Uint8ClampedArray(layer.data)};let hidden=0;
  for(let p=0;p<image.w*image.h;p++)if(body.data[p*4+3]&&occluder.data[p*4+3]){if(image.data[p*4+3])hidden++;image.data.fill(0,p*4,p*4+4);}
  return{image,hidden};
}
