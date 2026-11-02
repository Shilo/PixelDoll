// One fixed authoring discriminator. Its guide is a drawing control, not physical ground truth.
import {base64ToBytes} from '../../lib/image/png.ts';
import {decodePngBytes} from '../../lib/image/pngraw.ts';
import {sha256,stableStringify} from '../../lib/image/hash.ts';
import {maskBits} from './weapon-aware.ts';
import {readFixedInpaint,exportFixedInpaint} from './fixed-inpaint.ts';
import type {SwapPacket} from './weapon-swap.ts';
export const AXIS_REPAIR_KEY='pixeldoll.motionPilot.axisRepair.2026-11-02';
export const AXIS_REPAIR_PACKET_SHA256='dc4a43c87bc995d99390d7b3b3c8779e2c39997a4d6ea757c2122dbf0353f160';
export const AXIS_CALIBRATION_SHA256='eea742e7f7e7699cbc5f83942d6f639bfb84a0ca5d4215e531ab40ec593c23d6';
export interface AxisHeadGuide {kind:'reference-projected-rectangle';referenceIndex:number;referenceDesignSourceIndex:number;referenceSourceCell:number;referenceResultSha256:string;referenceGrip:{x:number;y:number};referenceAxisRadians:number;sourceAlong:{min:number;max:number;length:number};sourceAcross:{min:number;max:number;length:number};alongTranslation:number;coreAlong:{min:number;max:number};coreAcross:{min:number;max:number};rasterMargin:number;sourceHeadMaskPng:string;sourceHeadMaskSha256:string;sourceHeadCoordinates:{x:number;y:number}[];sourceHeadPixelCount:number}
export interface AxisGuide {sourceBladeAxisDegrees:number;sourceBladeAxisRadians:number;distalReach:number;headCenterReach:number;headCenterAcross:number;headAlongMin:number;headAlongMax:number;headAcrossMin:number;headAcrossMax:number;headRasterMargin:number;shaftHalfWidth:number;pommelReach:number;headCenter:{x:number;y:number};maximumGripRadius:number;heldWindow:{x:number;y:number;w:number;h:number};grip:{x:number;y:number}}
const near=(a:number,b:number)=>Number.isFinite(a)&&Number.isFinite(b)&&Math.abs(a-b)<=1e-9;
export async function axisRepairPermission(packet:SwapPacket,frame:SwapPacket['frames'][number]){
  const g=frame.geometry,h=packet.authoringControl?.headGuide,ref=packet.references?.[0],expectedAxis=frame.index===3?40.126509991802564:frame.index===4?29.164058074145856:NaN;
  if(packet.sourceCalibrationSha256!==AXIS_CALIBRATION_SHA256||!g||!h||g.distalReach!==21.925670335979355||g.shaftHalfWidth!==2.5||g.pommelReach!==-8||g.maximumGripRadius!==40||stableStringify(g.heldWindow)!==stableStringify({x:16,y:16,w:112,h:112})||g.grip.x!==frame.grip.x||g.grip.y!==frame.grip.y||!near(g.sourceBladeAxisDegrees*Math.PI/180,g.sourceBladeAxisRadians)||!frame.guidePermissionMask||await sha256(base64ToBytes(frame.guidePermissionMask))!==frame.guidePermissionMaskSha256)throw new Error('The fixed axis-repair calibration or guide contract changed.');
  if(h.kind!=='reference-projected-rectangle'||h.referenceIndex!==5||h.referenceDesignSourceIndex!==0||h.referenceSourceCell!==2||h.referenceResultSha256!==packet.designSources?.[0]?.resultSha256||ref?.index!==5||ref.designSourceIndex!==0||h.referenceGrip.x!==93||h.referenceGrip.y!==82||h.referenceAxisRadians!==0.47525070861863555||h.rasterMargin!==1||h.sourceHeadPixelCount!==85||h.sourceHeadCoordinates.length!==85||await sha256(base64ToBytes(h.sourceHeadMaskPng))!==h.sourceHeadMaskSha256)throw new Error('The empirical reference-head contract changed.');
  const reference=await decodePngBytes(base64ToBytes(ref.png)),head=await maskBits(h.sourceHeadMaskPng,144),seen=new Set<number>(),along:number[]=[],across:number[]=[],rx=Math.cos(h.referenceAxisRadians),ry=Math.sin(h.referenceAxisRadians);
  for(const c of h.sourceHeadCoordinates){
    const p=c.y*144+c.x;if(!Number.isInteger(c.x)||!Number.isInteger(c.y)||c.x<0||c.y<0||c.x>=144||c.y>=144||seen.has(p)||!head[p])throw new Error('The empirical reference-head coordinates changed.');seen.add(p);
    const rgb=reference.data.subarray(p*4,p*4+3);if(reference.data[p*4+3]!==255||Math.max(...rgb)-Math.min(...rgb)>4)throw new Error('A reviewed reference-head pixel differs from the neutral source head.');
    const dx=c.x+.5-h.referenceGrip.x,dy=c.y+.5-h.referenceGrip.y;along.push(dx*rx+dy*ry);across.push(-dx*ry+dy*rx);
  }
  if(head.reduce((n,v)=>n+v,0)!==85)throw new Error('The empirical reference-head mask changed.');
  const support=.5*(Math.abs(rx)+Math.abs(ry)),a0=Math.min(...along)-support,a1=Math.max(...along)+support,b0=Math.min(...across)-support,b1=Math.max(...across)+support,translation=g.distalReach-a1;
  if(!near(h.sourceAlong.min,a0)||!near(h.sourceAlong.max,a1)||!near(h.sourceAlong.length,a1-a0)||!near(h.sourceAcross.min,b0)||!near(h.sourceAcross.max,b1)||!near(h.sourceAcross.length,b1-b0)||!near(h.alongTranslation,translation)||!near(h.coreAlong.min,a0+translation)||!near(h.coreAlong.max,g.distalReach)||!near(h.coreAcross.min,b0)||!near(h.coreAcross.max,b1)||!near(g.headAlongMin,h.coreAlong.min)||!near(g.headAlongMax,h.coreAlong.max)||!near(g.headAcrossMin,b0)||!near(g.headAcrossMax,b1)||g.headRasterMargin!==1||!near(g.headCenterReach,(g.headAlongMin+g.headAlongMax)/2)||!near(g.headCenterAcross,(b0+b1)/2))throw new Error('The empirical head size, chirality or distal translation changed.');
  const ux=Math.cos(g.sourceBladeAxisRadians),uy=Math.sin(g.sourceBladeAxisRadians);
  if(g.sourceBladeAxisDegrees!==expectedAxis||!near(g.headCenter.x,frame.grip.x+ux*g.headCenterReach-uy*g.headCenterAcross)||!near(g.headCenter.y,frame.grip.y+uy*g.headCenterReach+ux*g.headCenterAcross))throw new Error('The axis-repair head center or source axis changed.');
  const guide=await maskBits(frame.guidePermissionMask,144);
  for(let p=0;p<guide.length;p++){
    const x=p%144,y=Math.floor(p/144),dx=x+.5-frame.grip.x,dy=y+.5-frame.grip.y,along=dx*ux+dy*uy,across=-dx*uy+dy*ux;
    const shaft=along>=g.pommelReach&&along<=g.distalReach&&Math.abs(across)<=g.shaftHalfWidth,inHead=along>=g.headAlongMin-1&&along<=g.headAlongMax+1&&across>=g.headAcrossMin-1&&across<=g.headAcrossMax+1;
    if(guide[p]!==Number(x>=16&&x<128&&y>=16&&y<128&&(shaft||inHead)))throw new Error('The axis-repair permission differs from its reviewed shaft/head guide.');
  }
  const edit=await maskBits(frame.editMask,144);
  for(let i=0;i<along.length;i++){const t=along[i]+translation,v=across[i],x=Math.floor(frame.grip.x+ux*t-uy*v),y=Math.floor(frame.grip.y+uy*t+ux*v);if(x<0||y<0||x>=144||y>=144||!guide[y*144+x]||!edit[y*144+x])throw new Error('The target mask clips a reviewed empirical head pixel.');}
  return guide;
}
export const readAxisRepair=()=>readFixedInpaint<SwapPacket>(AXIS_REPAIR_KEY);
export const exportAxisRepair=()=>exportFixedInpaint<SwapPacket>(AXIS_REPAIR_KEY);
