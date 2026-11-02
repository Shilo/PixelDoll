// Offline calibration audit. No credentials, network, rendering or paid requests.
// Run from the repository root: node spikes/api/mocap/audit-native-depth.mts
import fs from 'node:fs';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {LABELS} from '../../../app/src/lib/rig/poses.ts';
import {completePose,dot3,length3,liftReference,motionCamera,MOTION_EDGES,projectMotionPose,sub3,type MotionCalibration,type Pose3} from '../../../app/src/lib/rig/motion.ts';
import type {Keypoint} from '../../../app/src/lib/rig/rig.ts';
import type {MotionLibrary} from '../../../app/src/ui/motion-lab/model.ts';

const root=path.resolve(import.meta.dirname,'../../..');
const out=path.join(root,'spikes/api/out/workflow-reconciliation-2026-11-01');
const inputFile=path.join(out,'verified-import.json');
const libraryFile=path.join(root,'app/dev-fixtures/motion-lab/library.json');
const bytes=fs.readFileSync(inputFile),libraryBytes=fs.readFileSync(libraryFile);
const library=JSON.parse(libraryBytes.toString()) as MotionLibrary;
const fixture=library.fixtures.find(f=>f.id==='c27man');
if(!fixture)throw new Error('The controlled adult fixture is missing.');
type NativeDirection='south'|'east'|'north';
type AuditDirection=NativeDirection|'west';
interface VerifiedImport {
  pilot:{source:Record<string,string>;derived:string[];verification:{direction:string;changedPixels:number;canvas:[number,number]}[];character:{size:{width:number;height:number};skeletons:{'3d':{keypoints:Record<string,number[]>};'2d_references':Record<string,{source?:string;keypoints:Record<string,{x:number;y:number}>}>}}};
}
const input=JSON.parse(bytes.toString()) as VerifiedImport;
const character=input.pilot.character,provider=character.skeletons;
const allDirections:AuditDirection[]=['south','east','north','west'];
const nativeDirections:NativeDirection[]=['south','east','north'];
const sha=(data:Uint8Array)=>createHash('sha256').update(data).digest('hex');
if(character.size.width!==fixture.cell.w||character.size.height!==fixture.cell.h)throw new Error('Imported and frozen fixture canvases differ.');
for(const direction of allDirections){
  const ref=fixture.references[direction],verification=input.pilot.verification.find(v=>v.direction===direction);
  if(!ref||sha(Buffer.from(ref.png,'base64'))!==input.pilot.source[direction])throw new Error(direction+': fixture artwork differs from the verified import source.');
  if(!verification||verification.changedPixels!==0||verification.canvas[0]!==fixture.cell.w||verification.canvas[1]!==fixture.cell.h)throw new Error(direction+': imported pixel identity has not been verified.');
  if(!provider['2d_references'][direction])throw new Error(direction+': provider 2D reference is missing.');
}
const mapped:Pose3={};
for(const label of LABELS){
  const v=provider['3d'].keypoints[label];
  if(!Array.isArray(v)||v.length!==3||!v.every(Number.isFinite))throw new Error(label+': provider needs three finite coordinates.');
  // Inferred from labeled coordinates and checked against the provider's 2D estimates.
  // Provider x is anatomical-left, z is up, and y runs backward from the nose.
  mapped[label]=[v[0],v[2],-v[1]];
}
const providerPose=completePose(mapped),sourcePose=completePose(library.clips[0].reference);
const providerCentered:Pose3=Object.fromEntries(Object.entries(providerPose).map(([label,p])=>[label,sub3(p,providerPose.PELVIS)]));
const bearings:Record<AuditDirection,number>={south:0,east:90-fixture.camera.yaw,north:180,west:270+fixture.camera.yaw};
const providerRest=(direction:AuditDirection):Keypoint[]=>LABELS.map(label=>{
  const point=provider['2d_references'][direction].keypoints[label];
  if(!point||![point.x,point.y].every(Number.isFinite))throw new Error(`${direction}/${label}: provider 2D estimate is missing or invalid.`);
  return{label,...point};
});
function calibration(direction:AuditDirection,rest:Keypoint[]):MotionCalibration{
  return{width:fixture!.cell.w,height:fixture!.cell.h,rest,direction,elevation:fixture!.camera.elev,azimuth:bearings[direction]};
}

/** Direct 3D projection, without enforcing the target 2D coordinates. One scale, two translations. */
function directFit(direction:AuditDirection,bearing:number,elevation:number){
  const cam=motionCamera(direction,elevation,bearing),rest=providerRest(direction);
  const rows=rest.map(k=>({label:k.label,u:dot3(providerCentered[k.label],cam.right),v:-dot3(providerCentered[k.label],cam.up),x:k.x*fixture!.cell.w,y:k.y*fixture!.cell.h}));
  const mean=(key:'u'|'v'|'x'|'y')=>rows.reduce((sum,row)=>sum+row[key],0)/rows.length;
  const u=mean('u'),v=mean('v'),x=mean('x'),y=mean('y');
  const denominator=rows.reduce((sum,r)=>sum+(r.u-u)**2+(r.v-v)**2,0);
  if(denominator<1e-12)throw new Error('The provider reference has no usable projected extent.');
  const scale=rows.reduce((sum,r)=>sum+(r.u-u)*(r.x-x)+(r.v-v)*(r.y-y),0)/denominator;
  if(!Number.isFinite(scale)||scale<=0)throw new Error('Direct fit requires a positive uniform scale.');
  const origin:[number,number]=[x-scale*u,y-scale*v];
  const errors=rows.map(r=>({label:r.label,errorPx:Math.hypot(scale*r.u+origin[0]-r.x,scale*r.v+origin[1]-r.y)}));
  return{bearing,elevation,scale,origin,rmsPx:Math.sqrt(errors.reduce((sum,r)=>sum+r.errorPx**2,0)/errors.length),maximumErrorPx:Math.max(...errors.map(r=>r.errorPx)),errors};
}
const directProjection=allDirections.map(direction=>{
  const current=directFit(direction,bearings[direction],fixture.camera.elev);
  let best=current;
  const cardinal={south:0,east:90,north:180,west:270}[direction];
  for(let a=cardinal-35;a<=cardinal+35;a+=0.5)for(let e=0;e<=30;e+=0.5){const candidate=directFit(direction,a,e);if(candidate.rmsPx<best.rmsPx)best=candidate;}
  return{direction,derived:input.pilot.derived.includes(direction),currentCamera:current,bestFitCamera:best};
});

function liftAudit(direction:AuditDirection,rest:Keypoint[]){
  const cal=calibration(direction,rest);
  const variants=Object.entries({quaterniusProxy:sourcePose,providerDepth:providerPose}).map(([variant,reference])=>{
    // Existing liftReference(reference) suffices; do not rely on the optional depthReference API.
    const fit=liftReference(cal,reference);
    const projected=projectMotionPose(fit.points,cal,fit.camera,fit.origin,1);
    const byLabel=Object.fromEntries(rest.map(k=>[k.label,k]));
    const maximumRestXYErrorPx=Math.max(...projected.map(k=>Math.hypot((k.x-byLabel[k.label].x)*cal.width,(k.y-byLabel[k.label].y)*cal.height)));
    if(!Number.isFinite(maximumRestXYErrorPx)||maximumRestXYErrorPx>1e-8)throw new Error('Rest projection no longer preserves the requested 2D joints.');
    const rightLegLengthPx=length3(sub3(fit.points['RIGHT KNEE'],fit.points['RIGHT HIP']))+length3(sub3(fit.points['RIGHT LEG'],fit.points['RIGHT KNEE']));
    if(!Number.isFinite(rightLegLengthPx)||rightLegLengthPx<1e-9||!Number.isFinite(fit.scale))throw new Error('Lifted reference has no usable right-leg scale.');
    const bones=MOTION_EDGES.map(([a,b])=>({bone:`${a}->${b}`,lengthPx:length3(sub3(fit.points[b],fit.points[a])),relativeToRightLeg:length3(sub3(fit.points[b],fit.points[a]))/rightLegLengthPx}));
    return{variant,scale:fit.scale,maximumRestXYErrorPx,rightLegLengthPx,bones};
  });
  return{direction,derived:input.pilot.derived.includes(direction),variants};
}
function setAudit(set:'frozenFixture'|'providerEstimatedReferences'){
  const views=allDirections.map(direction=>liftAudit(direction,set==='frozenFixture'?fixture!.references[direction]!.keypoints:providerRest(direction)));
  const crossViewBoneCV=['quaterniusProxy','providerDepth'].map(variant=>({variant,bones:MOTION_EDGES.map(([a,b],index)=>{
    const samples=nativeDirections.map(direction=>views.find(view=>view.direction===direction)!.variants.find(v=>v.variant===variant)!.bones[index].relativeToRightLeg);
    const mean=samples.reduce((sum,n)=>sum+n,0)/samples.length;
    if(mean<=0)throw new Error('Cannot compare zero-length bones.');
    const cv=Math.sqrt(samples.reduce((sum,n)=>sum+(n-mean)**2,0)/samples.length)/mean;
    return{bone:`${a}->${b}`,samples,mean,coefficientOfVariation:cv};
  })}));
  return{jointSet:set,views,crossViewBoneCV};
}
const restDifferences=allDirections.map(direction=>{
  const byLabel=Object.fromEntries(providerRest(direction).map(k=>[k.label,k]));
  const errors=fixture.references[direction]!.keypoints.map(k=>({label:k.label,errorPx:Math.hypot((k.x-byLabel[k.label].x)*fixture.cell.w,(k.y-byLabel[k.label].y)*fixture.cell.h)}));
  return{direction,rmsPx:Math.sqrt(errors.reduce((sum,r)=>sum+r.errorPx**2,0)/errors.length),maximumErrorPx:Math.max(...errors.map(r=>r.errorPx)),errors};
});
const sets=[setAudit('frozenFixture'),setAudit('providerEstimatedReferences')];
const output={
  version:1,kind:'offline-native-rest-depth-audit',fixtureId:fixture.id,
  inputs:{verifiedImport:'spikes/api/out/workflow-reconciliation-2026-11-01/verified-import.json',verifiedImportSha256:sha(bytes),library:'app/dev-fixtures/motion-lab/library.json',librarySha256:sha(libraryBytes),sourceImageSha256:input.pilot.source,sourceClipReference:{id:library.clips[0].id,source:library.clips[0].source}},
  conventions:{mapping:'[provider x, provider z, -provider y]',canonical:'anatomical-left / up / forward',providerPelvis:providerPose.PELVIS,pelvisCentering:'Subtract midpoint of provider left and right hips after axis mapping.',directFit:'Pelvis-centered provider coordinates projected orthographically; one positive uniform scale and independent screen x/y translations fit all 18 joints. RMS is Euclidean pixels per joint.',cameraGrid:'Bearing within 35 degrees of cardinal and elevation 0..30 degrees, both sampled every 0.5 degree. Fit diagnostic only, not an automatic camera recommendation.',lift:'Each target 2D view is enforced exactly. Camera-toward rest depth is supplied by the selected reference, centered at its pelvis and scaled by visible right-leg length divided by its 3D right-leg length.',cv:'Population standard deviation / mean of bone lengths normalized by each view right-leg length, over south/east/north only. Derived west is excluded.'},
  currentCamera:fixture.camera,directProjection,jointSetDifferences:restDifferences,sets,
  limitations:['Static provider 3D is an estimate, not anatomical ground truth.','Provider 2D and 3D estimates share input evidence; agreement is not independent validation.','Exact lifted rest XY is true by construction for both references, not evidence that either produces better motion.','Cross-view proportion consistency is not a naturalness or raster-quality score.','The source animation reference stays unchanged; only the optional target depth prior is being compared.','The static rest does not provide managed per-frame motion, pivot or timing.','West is a derived view and is not an independent native-camera control.','No PixelLab requests, credential reads, camera replacement or application edits occur in this audit.'],
};
fs.mkdirSync(out,{recursive:true});
const outputFile=path.join(out,'native-depth-audit.json');
fs.writeFileSync(outputFile,JSON.stringify(output,null,2));
console.log(JSON.stringify({artifact:path.relative(root,outputFile).replaceAll('\\','/'),fixtureId:fixture.id,jointSetMaximumDifferences:restDifferences.map(r=>({direction:r.direction,px:r.maximumErrorPx})),directProjection:directProjection.map(r=>({direction:r.direction,currentRmsPx:r.currentCamera.rmsPx,bestRmsPx:r.bestFitCamera.rmsPx})),frozenFixtureCV:sets[0].crossViewBoneCV.map(v=>({variant:v.variant,bones:v.bones.filter(b=>['PELVIS->RIGHT HIP','NECK->RIGHT SHOULDER','NECK->LEFT SHOULDER','LEFT SHOULDER->LEFT ELBOW'].includes(b.bone)).map(b=>({bone:b.bone,cv:b.coefficientOfVariation}))})),note:'Offline consistency evidence only; native calibration is not production-qualified.'},null,2));
