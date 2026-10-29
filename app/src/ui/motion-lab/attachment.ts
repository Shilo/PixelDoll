import { makeImg,type Img } from '../../lib/image/png.ts';
export interface PixelPoint {x:number;y:number}
/** Rigid, nearest-neighbor placement around an explicitly calibrated grip. No pose or occlusion inference. */
export function rigidAttachment(source:Img,grip:PixelPoint,target:PixelPoint,radians:number,cell:{w:number;h:number}){
  if(![grip.x,grip.y,target.x,target.y,radians,cell.w,cell.h].every(Number.isFinite)||!Number.isSafeInteger(cell.w)||!Number.isSafeInteger(cell.h)||cell.w<1||cell.h<1||cell.w>512||cell.h>512)throw new Error('Attachment placement needs finite pixel coordinates and a 1-512 px canvas.');
  if(grip.x<0||grip.y<0||grip.x>=source.w||grip.y>=source.h)throw new Error('Calibrate the grip inside the attachment image.');
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
