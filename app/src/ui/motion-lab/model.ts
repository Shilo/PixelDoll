import { DEFAULT_MOTION_OPTIONS, MOTION_EDGES, completePose, add3, sub3, mul3, swing3, solveLimb, dot3, length3, projectMotionPose, retargetMotion, sampleMotion, type MotionClip, type MotionCalibration, type MotionOptions, type MotionPoint, type Pose3 } from '../../lib/rig/motion.ts';
import { LABELS, hasAll } from '../../lib/rig/poses.ts';
import { makeImg, type Img } from '../../lib/image/png.ts';
import type { DirectionName, Keypoint } from '../../lib/rig/rig.ts';
export interface MotionFixture { id:string;name:string;cell:{w:number;h:number};camera:{elev:number;yaw:number};directions:{id:DirectionName;mirrorOf?:DirectionName}[];references:Partial<Record<DirectionName,{keypoints:Keypoint[];png:string}>> }
export interface MotionLibrary { version:1;provenance:{source:string;license:string;url:string;sha256:string};camera:{elev:number;yaw:number};fixtures:MotionFixture[];clips:MotionClip[] }
export interface MotionDocument {
  version:1;fixture:MotionFixture;direction:DirectionName;clip:MotionClip;reference:Keypoint[];
  times:number[];durations:number[];padding:number;elevation:number;azimuth:number;options:MotionOptions;
  edits:Record<number,MotionPoint[]>;buffer:boolean;
}
export function newDocument(library:MotionLibrary,fixture=library.fixtures[0],clip=library.clips[0],direction:DirectionName='south'):MotionDocument{
  if(!fixture.camera||![fixture.camera.elev,fixture.camera.yaw].every(Number.isFinite))throw new Error('The offline library needs body-camera calibration. Run the source bake and reload the lab.');
  const reference=fixture.references[direction];if(!reference)throw new Error('This fixture has no reference for that direction.');
  const count=clip.id==='hurt'?6:clip.id==='death'?9:12;
  const bearing:Record<DirectionName,number>={south:0,'south-east':45,east:90-fixture.camera.yaw,'north-east':135,north:180,'north-west':225,west:270+fixture.camera.yaw,'south-west':315};
  const d:MotionDocument={version:1,fixture,direction,clip,reference:reference.keypoints.map(k=>({...k})),times:Array.from({length:count},(_,i)=>clip.duration*i/(clip.loop?count:count-1)),durations:Array.from({length:count},()=>Math.round(clip.duration*1000/count)),padding:clip.id==='death'?Math.round(fixture.cell.w*0.3):0,elevation:fixture.camera.elev,azimuth:bearing[direction],options:{...DEFAULT_MOTION_OPTIONS,travel:clip.loop?0.5:1},edits:{},buffer:clip.id==='death'};
  if(clip.id==='attack'){
    // Concentrate samples around the measured wrist-speed peak at 0.4 s, and restrain the non-striking arm and squat.
    d.times=[0,0.15,0.27,0.33,0.37,0.4,0.44,0.5,0.62,0.85,1.1,clip.duration];
    d.durations=[150,120,60,40,30,40,60,120,230,250,430,140];
    d.options.weights={torso:0.7,legs:0.35,leftArm:0.25,rightArm:1};d.options.travel=0.3;
  }
  // Backward falls are end-on in front/back drawings. This is a view-specific motion adaptation, not a camera change.
  if(clip.id==='death'&&(direction==='south'||direction==='north'))d.options.plane=90;
  return d;
}
export function validateDocument(value:unknown):MotionDocument{
  const d=value as MotionDocument;
  if(!d||d.version!==1||!d.fixture?.references?.[d.direction]||!d.clip?.samples||!Array.isArray(d.times)||d.times.length<3||d.times.length>14||!Array.isArray(d.durations)||d.durations.length!==d.times.length||d.durations.some(n=>!Number.isFinite(n)||n<10||n>10000)||!Number.isSafeInteger(d.padding)||d.padding<0||d.padding>64||!hasAll(d.reference)||!d.options||typeof d.buffer!=='boolean')throw new Error('Unsupported or invalid motion document. Expected version 1, 3-14 poses, valid joints and durations.');
  if(d.clip.samples.length>3000||d.fixture.cell.w+2*d.padding>256||d.fixture.cell.h+2*d.padding>256)throw new Error('The motion or padded canvas exceeds its supported size.');
  for(const sample of [d.clip.reference,...d.clip.samples.map(s=>s.points)])for(const label of LABELS)if(!sample[label]||sample[label].length!==3||!sample[label].every(Number.isFinite))throw new Error('Source motion contains a missing or invalid joint.');
  for(const edit of Object.values(d.edits??{}))if(!hasAll(edit)||edit.some(k=>!Number.isFinite(k.depth)||!Number.isSafeInteger(k.z_index)))throw new Error('A saved pose edit has invalid coordinates or depth.');
  const fit=buildDocument(d);
  for(const index of Object.keys(d.edits))for(const[a,b]of MOTION_EDGES)if(Math.abs(length3(sub3(fit.frames[+index].points[b],fit.frames[+index].points[a]))-length3(sub3(fit.reference[b],fit.reference[a])))>0.01)throw new Error('A saved pose edit changes calibrated bone lengths. Correct it before import.');
  return d;
}
export function buildDocument(d:MotionDocument){
  const width=d.fixture.cell.w+2*d.padding,height=d.fixture.cell.h+2*d.padding;
  const rest=d.reference.map(k=>({...k,x:(k.x*d.fixture.cell.w+d.padding)/width,y:(k.y*d.fixture.cell.h+d.padding)/height}));
  const calibration:MotionCalibration={width,height,rest,direction:d.direction,elevation:d.elevation,azimuth:d.azimuth};
  const clip=sampleMotion(d.clip,d.times),result=retargetMotion(clip,calibration,d.options);
  const frames=result.frames.map((frame,i)=>{
    const edit=d.edits[i];if(!edit)return frame;
    const points:Pose3=Object.fromEntries(edit.map(k=>[k.label,add3(add3(mul3(result.camera.right,k.x*width-result.origin[0]),mul3(result.camera.up,result.origin[1]-k.y*height)),mul3(result.camera.toward,dot3(frame.points.PELVIS,result.camera.toward)+(k.depth-128)/result.depthScale))]));
    const issues=edit.flatMap(k=>k.x<0||k.x>1||k.y<0||k.y>1||k.depth<0||k.depth>255?[`${k.label}: edited pose exceeds the supported canvas or depth range`]:[]);
    return{...frame,points:completePose(points),keypoints:edit,issues};
  });
  return{...result,frames,calibration,clip};
}
export function paddedReference(image:Img,padding:number):Img{
  if(!Number.isSafeInteger(padding)||padding<0)throw new Error('Padding must be a nonnegative whole number.');
  const out=makeImg(image.w+padding*2,image.h+padding*2);
  if(out.w>256||out.h>256)throw new Error('Padded reference exceeds 256 px.');
  for(let y=0;y<image.h;y++)out.data.set(image.data.subarray(y*image.w*4,(y+1)*image.w*4),((y+padding)*out.w+padding)*4);
  return out;
}
export function renderPoses(d:MotionDocument){
  const result=buildDocument(d);
  const poses=result.frames.map(f=>f.keypoints);
  if(d.buffer)poses.push(structuredClone(poses.at(-1)!));
  if(poses.some(p=>!hasAll(p)||p.some(k=>!Number.isFinite(k.depth)||k.depth<0||k.depth>255)))throw new Error('A requested pose extends outside the supported canvas or depth range. Add padding or edit it before generation.');
  return {result,poses};
}
/** Edit target geometry first, then derive its XY/depth together. Endpoint IK and subtree FK retain calibrated lengths. */
export function editPose(d:MotionDocument,index:number,label:string,x:number,y:number,depth:number):MotionDocument{
  if(![x,y,depth].every(Number.isFinite))throw new Error('Joint coordinates must be finite numbers.');
  const fit=buildDocument(d),frame=fit.frames[index];if(!frame)throw new Error('No frame selected.');
  const k=frame.keypoints.find(k=>k.label===label);if(!k)throw new Error('Unknown joint.');
  const p=structuredClone(frame.points),delta=add3(add3(mul3(fit.camera.right,(x-k.x)*fit.calibration.width),mul3(fit.camera.up,(k.y-y)*fit.calibration.height)),mul3(fit.camera.toward,(depth-k.depth)/fit.depthScale)),target=add3(p[label],delta);
  const side=label.startsWith('RIGHT')?'RIGHT':'LEFT';
  if(label.endsWith(' ARM')||label.endsWith(' LEG')){
    const a=label.endsWith(' ARM')?`${side} SHOULDER`:`${side} HIP`,b=label.endsWith(' ARM')?`${side} ELBOW`:`${side} KNEE`;
    const solved=solveLimb(p[a],p[b],p[label],target,p[b]);if(solved.unreachable)throw new Error('That target exceeds the limb reach. Move it closer.');p[b]=solved.joint;p[label]=solved.end;
  }else{
    const facial=['NOSE','RIGHT EYE','LEFT EYE','RIGHT EAR','LEFT EAR'].includes(label);
    const parent=facial?'NECK':MOTION_EDGES.find(([,b])=>b===label)?.[0];if(!parent)throw new Error('Edit pelvis placement through calibration or the root-motion control.');
    const descendants=new Set<string>([label]);if(facial){descendants.add('HEAD');for(const l of ['NOSE','RIGHT EYE','LEFT EYE','RIGHT EAR','LEFT EAR'])descendants.add(l);}
    // The virtual pelvis is the hip midpoint. Rotate both hip branches so editing one cannot move that midpoint.
    if(label.endsWith(' HIP')){descendants.add('RIGHT HIP');descendants.add('LEFT HIP');}
    for(const[a,b]of MOTION_EDGES)if(descendants.has(a))descendants.add(b);
    if(descendants.has('HEAD'))for(const l of ['NOSE','RIGHT EYE','LEFT EYE','RIGHT EAR','LEFT EAR'])descendants.add(l);
    const from=sub3(p[label],p[parent]),to=sub3(target,p[parent]);
    for(const child of descendants)p[child]=add3(p[parent],swing3(sub3(p[child],p[parent]),from,to));
  }
  const out=structuredClone(d);out.edits[index]=projectMotionPose(p,fit.calibration,fit.camera,fit.origin,fit.depthScale);return out;
}
