// Pure motion geometry shared by the offline lab and the source bake. Coordinates: +X anatomical left, +Y up, +Z forward.
import { LABELS, hasAll } from './poses.ts';
import type { Keypoint, DirectionName } from './rig.ts';

export type Vec3 = [number, number, number];
export const MOTION_REVISION='ground-support-v2' as const;
export type Joint = typeof LABELS[number];
export type Pose3 = Record<string, Vec3>;
export type Foot = 'RIGHT LEG' | 'LEFT LEG';
export interface MotionSample {
  time: number;
  points: Pose3;
  contacts: Partial<Record<Foot, { weight: number }>>;
}
export interface MotionClip {
  id: string; name: string; source: string; duration: number; loop: boolean; nominalSpeed: number;
  action?:string;
  reference: Pose3; samples: MotionSample[]; events: { name: string; time: number }[];
}
export interface MotionCamera { right: Vec3; up: Vec3; toward: Vec3 }
export interface MotionCalibration {
  width: number; height: number; rest: Keypoint[]; direction: DirectionName; elevation: number; azimuth?: number;
  depthReference?: Pose3;
}
export interface MotionOptions { gain: number; travel: number; contact: number; facing: number; plane?:number; weights?:{torso:number;legs:number;leftArm:number;rightArm:number} }
export interface MotionPoint extends Keypoint { depth: number; z_index: number }
export interface MotionFrame { points: Pose3; keypoints: MotionPoint[]; contacts: MotionSample['contacts']; issues: string[];planting?:{foot:Foot;weight:number;target:Vec3;error:number}[] }
export const DEFAULT_MOTION_OPTIONS: MotionOptions = { gain: 1, travel: 1, contact: 1, facing: 1 };
export const MOTION_EDGES: [string, string][] = [
  ['PELVIS', 'RIGHT HIP'], ['RIGHT HIP', 'RIGHT KNEE'], ['RIGHT KNEE', 'RIGHT LEG'],
  ['PELVIS', 'LEFT HIP'], ['LEFT HIP', 'LEFT KNEE'], ['LEFT KNEE', 'LEFT LEG'], ['PELVIS', 'NECK'],
  ['NECK', 'RIGHT SHOULDER'], ['RIGHT SHOULDER', 'RIGHT ELBOW'], ['RIGHT ELBOW', 'RIGHT ARM'],
  ['NECK', 'LEFT SHOULDER'], ['LEFT SHOULDER', 'LEFT ELBOW'], ['LEFT ELBOW', 'LEFT ARM'], ['NECK', 'HEAD'],
];
export const add3 = (a: Vec3, b: Vec3): Vec3 => [a[0]+b[0],a[1]+b[1],a[2]+b[2]];
export const sub3 = (a: Vec3, b: Vec3): Vec3 => [a[0]-b[0],a[1]-b[1],a[2]-b[2]];
export const mul3 = (a: Vec3, s: number): Vec3 => [a[0]*s,a[1]*s,a[2]*s];
export const dot3 = (a: Vec3, b: Vec3) => a[0]*b[0]+a[1]*b[1]+a[2]*b[2];
export const cross3 = (a: Vec3, b: Vec3): Vec3 => [a[1]*b[2]-a[2]*b[1],a[2]*b[0]-a[0]*b[2],a[0]*b[1]-a[1]*b[0]];
export const length3 = (a: Vec3) => Math.hypot(...a);
export const mix3 = (a: Vec3, b: Vec3, t: number) => add3(a,mul3(sub3(b,a),t));
export function unit3(v: Vec3): Vec3 { const n=length3(v); if(n<1e-9||!Number.isFinite(n))throw new Error('A rig segment has no usable length. Correct its reference joints.');return mul3(v,1/n); }
export function rotate3(v: Vec3, axis: Vec3, radians: number): Vec3 {
  const a=unit3(axis),c=Math.cos(radians),s=Math.sin(radians);
  return add3(add3(mul3(v,c),mul3(cross3(a,v),s)),mul3(a,dot3(a,v)*(1-c)));
}
/** Shortest 3D swing, including a stable antiparallel case. No projected screen angles or bone twist are transferred. */
export function swing3(v: Vec3, from: Vec3, to: Vec3, gain=1): Vec3 {
  const a=unit3(from),b=unit3(to),c=Math.max(-1,Math.min(1,dot3(a,b))),axis=cross3(a,b);
  if(length3(axis)<1e-8){if(c>0)return [...v];return rotate3(v,cross3(a,Math.abs(a[0])<0.8?[1,0,0]:[0,1,0]),Math.PI*gain);}
  return rotate3(v,axis,Math.acos(c)*gain);
}
export function motionCamera(direction: DirectionName, elevation: number, azimuth?: number): MotionCamera {
  const bearings: Record<DirectionName,number>={south:0,'south-east':45,east:90,'north-east':135,north:180,'north-west':225,west:270,'south-west':315};
  if(!Number.isFinite(elevation)||elevation<0||elevation>80)throw new Error('Camera elevation must be between 0 and 80 degrees.');
  if(azimuth!==undefined&&!Number.isFinite(azimuth))throw new Error('Camera bearing must be a finite angle.');
  const a=(azimuth??bearings[direction])*Math.PI/180,e=elevation*Math.PI/180;
  return {right:[Math.cos(a),0,Math.sin(a)],up:[Math.sin(a)*Math.sin(e),Math.cos(e),-Math.cos(a)*Math.sin(e)],toward:[-Math.sin(a)*Math.cos(e),Math.sin(e),Math.cos(a)*Math.cos(e)]};
}
const pelvis=(p:Pose3)=>mul3(add3(p['RIGHT HIP'],p['LEFT HIP']),0.5);
const head=(p:Pose3)=>mul3(add3(p['RIGHT EAR'],p['LEFT EAR']),0.5);
export function completePose(p: Pose3): Pose3 { return {...p,PELVIS:pelvis(p),HEAD:head(p)}; }
export function validateDepthReference(value: unknown): asserts value is Pose3 {
  const p=value as Pose3;
  if(!p||LABELS.some(label=>!Array.isArray(p[label])||p[label].length!==3||!p[label].every(Number.isFinite)))throw new Error('Target depth reference needs 18 finite 3D joints.');
  const full=completePose(p);
  if(MOTION_EDGES.some(([a,b])=>{const n=length3(sub3(full[b],full[a]));return !Number.isFinite(n)||n<1e-9;}))throw new Error('Target depth reference contains a zero-length or nonfinite rig segment.');
}
const legLength=(p:Pose3)=>length3(sub3(p['RIGHT KNEE'],p['RIGHT HIP']))+length3(sub3(p['RIGHT LEG'],p['RIGHT KNEE']));
const clonePose=(p:Pose3):Pose3=>Object.fromEntries(Object.entries(p).map(([k,v])=>[k,[...v] as Vec3]));
export function projectMotionPose(points:Pose3,calibration:MotionCalibration,camera:MotionCamera,origin:[number,number],depthScale:number):MotionPoint[]{
  return LABELS.map(label=>{const p=points[label],z=128+dot3(sub3(p,points.PELVIS),camera.toward)*depthScale;
    return{label,x:(dot3(p,camera.right)+origin[0])/calibration.width,y:(origin[1]-dot3(p,camera.up))/calibration.height,depth:z,z_index:Math.round((z-128)/16)};});
}

/** Fit each directional drawing exactly in XY. Latent rest depth is explicit proxy calibration, not inferred anatomy. */
export function liftReference(calibration: MotionCalibration, sourceReference: Pose3): { points: Pose3; camera: MotionCamera; origin: [number,number]; scale: number } {
  const {width,height,rest}=calibration;
  if(!hasAll(rest)||!Number.isInteger(width)||!Number.isInteger(height)||width<16||height<16||width>256||height>256)throw new Error('Reference needs 18 finite in-frame joints and a 16-256 px canvas.');
  if(calibration.depthReference!==undefined)validateDepthReference(calibration.depthReference);
  // A supplied target rest changes the latent-depth proxy only; source rotations and camera remain separate.
  const source=completePose(calibration.depthReference??sourceReference),camera=motionCamera(calibration.direction,calibration.elevation,calibration.azimuth);
  const by=Object.fromEntries(rest.map(k=>[k.label,k]));
  const origin:[number,number]=[(by['RIGHT HIP'].x+by['LEFT HIP'].x)*width/2,(by['RIGHT HIP'].y+by['LEFT HIP'].y)*height/2];
  const visibleLeg=Math.hypot((by['RIGHT KNEE'].x-by['RIGHT HIP'].x)*width,(by['RIGHT KNEE'].y-by['RIGHT HIP'].y)*height)+Math.hypot((by['RIGHT LEG'].x-by['RIGHT KNEE'].x)*width,(by['RIGHT LEG'].y-by['RIGHT KNEE'].y)*height);
  if(visibleLeg<2)throw new Error('The reference leg is too short or occluded to calibrate. Correct its joints.');
  const scale=visibleLeg/legLength(source);
  const points:Pose3=Object.fromEntries(rest.map(k=>{
    const z=dot3(sub3(source[k.label],source.PELVIS),camera.toward)*scale;
    return[k.label,add3(add3(mul3(camera.right,k.x*width-origin[0]),mul3(camera.up,origin[1]-k.y*height)),mul3(camera.toward,z))];
  }));
  return {points:completePose(points),camera,origin,scale};
}

/** Analytic two-bone IK retains exact segment lengths and a continuous bend pole. Unreachable targets are reported. */
export function solveLimb(root: Vec3, elbow: Vec3, end: Vec3, target: Vec3, pole: Vec3): { joint:Vec3; end:Vec3; unreachable:boolean } {
  const a=length3(sub3(elbow,root)),b=length3(sub3(end,elbow));
  if(a<1e-7||b<1e-7)throw new Error('Cannot solve a zero-length limb.');
  const delta=sub3(target,root),distance=length3(delta),axis=distance>1e-7?mul3(delta,1/distance):unit3(sub3(end,root));
  const d=Math.max(Math.abs(a-b)+1e-6,Math.min(a+b-1e-6,distance));
  const x=(a*a-b*b+d*d)/(2*d),y=Math.sqrt(Math.max(0,a*a-x*x));
  let bend=sub3(sub3(pole,root),mul3(axis,dot3(sub3(pole,root),axis)));
  if(length3(bend)<1e-6)bend=cross3(axis,Math.abs(axis[0])<0.8?[1,0,0]:[0,0,1]);
  return {joint:add3(add3(root,mul3(axis,x)),mul3(unit3(bend),y)),end:add3(root,mul3(axis,d)),unreachable:Math.abs(distance-d)>0.01};
}
function faceAngles(p:Pose3){
  const forward=sub3(p.NOSE,p.HEAD),ears=sub3(p['LEFT EAR'],p['RIGHT EAR']);
  return {yaw:Math.atan2(forward[0],forward[2]),pitch:Math.atan2(forward[1],Math.hypot(forward[0],forward[2])),roll:Math.atan2(ears[1],Math.hypot(ears[0],ears[2]))};
}
const wrap=(n:number)=>Math.atan2(Math.sin(n),Math.cos(n));
function faceForward(p:Pose3,reference:Pose3,amount:number):Pose3{
  const hips=sub3(p['LEFT HIP'],p['RIGHT HIP']),restHips=sub3(reference['LEFT HIP'],reference['RIGHT HIP']);
  const angle=wrap(Math.atan2(hips[2],hips[0])-Math.atan2(restHips[2],restHips[0]))*amount;
  return Object.fromEntries(Object.entries(p).map(([k,v])=>[k,add3(p.PELVIS,rotate3(sub3(v,p.PELVIS),[0,1,0],angle))]));
}
export function retargetMotion(clip: MotionClip, calibration: MotionCalibration, options: MotionOptions=DEFAULT_MOTION_OPTIONS): { rest:MotionPoint[]; frames:MotionFrame[]; reference:Pose3; camera:MotionCamera; origin:[number,number]; depthScale:number; issues:string[] } {
  if(!clip.samples.length||clip.samples.some(s=>!Number.isFinite(s.time)))throw new Error('Motion has no finite samples.');
  if([options.gain,options.travel,options.contact,options.facing].some(n=>!Number.isFinite(n))||options.gain<0||options.gain>3||options.contact<0||options.contact>1||options.facing<0||options.facing>1||options.travel<0||options.travel>2)throw new Error('Invalid motion options.');
  const weights=options.weights??{torso:1,legs:1,leftArm:1,rightArm:1};
  if(['torso','legs','leftArm','rightArm'].some(k=>{const n=weights[k as keyof typeof weights];return !Number.isFinite(n)||n<0||n>1;}))throw new Error('Body-part motion weights must be between 0 and 1.');
  const plane=(options.plane??0)*Math.PI/180;
  if(!Number.isFinite(plane))throw new Error('Motion plane must be a finite angle.');
  const inPlane=(v:Vec3)=>plane?rotate3(v,[0,1,0],plane):v;
  const sourceReference=completePose(clip.reference),fit=liftReference(calibration,sourceReference),targetRest=fit.points;
  const source=faceForward(sourceReference,sourceReference,options.facing),targetLeg=legLength(targetRest),sourceLeg=legLength(source),scale=targetLeg/sourceLeg;
  const paths:Record<string,number>={PELVIS:0};for(const[a,b]of MOTION_EDGES)paths[b]=paths[a]+length3(sub3(targetRest[b],targetRest[a]));
  const maxPath=Math.max(...Object.values(paths),...['NOSE','LEFT EYE','RIGHT EYE','LEFT EAR','RIGHT EAR'].map(l=>paths.HEAD+length3(sub3(targetRest[l],targetRest.HEAD))));
  const depthScale=100/maxPath;
  const project=(points:Pose3)=>projectMotionPose(points,calibration,fit.camera,fit.origin,depthScale);
  const rest=project(targetRest);
  const frames=clip.samples.map(sample=>{
    const p=faceForward(completePose(sample.points),sourceReference,options.facing),q:Pose3={},issues:string[]=[];
    const delta=inPlane(sub3(p.PELVIS,source.PELVIS));
    q.PELVIS=mul3([delta[0]*options.travel,delta[1]*weights.legs,delta[2]*options.travel],scale*options.gain);
    for(const[a,b]of MOTION_EDGES){
      const bind=sub3(targetRest[b],targetRest[a]),from=inPlane(sub3(source[b],source[a])),to=inPlane(sub3(p[b],p[a]));
      const part=b.includes('HIP')||b.includes('KNEE')||b.includes('LEG')?weights.legs:b.startsWith('LEFT')?weights.leftArm:b.startsWith('RIGHT')?weights.rightArm:weights.torso;
      const mapped=swing3(to,from,bind),direction=swing3(bind,bind,mapped,options.gain*part);
      q[b]=add3(q[a],mul3(unit3(direction),length3(bind)));
    }
    const oldFace=faceAngles(source),newFace=faceAngles(p);
    for(const label of ['NOSE','RIGHT EYE','LEFT EYE','RIGHT EAR','LEFT EAR']){
      let offset=sub3(targetRest[label],targetRest.HEAD);
      offset=rotate3(offset,[0,1,0],wrap(newFace.yaw-oldFace.yaw)*options.gain*weights.torso);
      offset=rotate3(offset,inPlane([1,0,0]),wrap(newFace.pitch-oldFace.pitch)*options.gain*weights.torso);
      offset=rotate3(offset,inPlane([0,0,1]),wrap(newFace.roll-oldFace.roll)*options.gain*weights.torso);
      q[label]=add3(q.HEAD,offset);
    }
    const footTargets:Partial<Record<Foot,Vec3>>={};
    let rootY=0;
    for(const foot of ['RIGHT LEG','LEFT LEG'] as const){
      const contact=sample.contacts[foot];if(!contact||!options.gain||!options.contact)continue;
      if(!Number.isFinite(contact.weight)||contact.weight<0||contact.weight>1)throw new Error('Contact weights must be 0-1.');
      if(!contact.weight)continue;
      const side=foot.startsWith('RIGHT')?'RIGHT':'LEFT',hip=`${side} HIP`,knee=`${side} KNEE`;
      // Ground support must not pull a foot toward the source actor's foreign stride or proportions.
      // Keep the target FK path in X/Z; confidence blends only toward its calibrated ankle-ground height.
      const target:Vec3=[q[foot][0],targetRest[foot][1],q[foot][2]];
      const blended=mix3(q[foot],target,contact.weight*options.contact);
      footTargets[foot]=blended;
      const reach=length3(sub3(q[knee],q[hip]))+length3(sub3(q[foot],q[knee]))-0.001;
      const horizontal=(q[hip][0]-blended[0])**2+(q[hip][2]-blended[2])**2;
      if(horizontal<reach*reach)rootY=Math.min(rootY,blended[1]+Math.sqrt(reach*reach-horizontal)-q[hip][1]);
    }
    // The feasible pelvis-height envelope is continuous. There is no discrete choice of a supporting ankle.
    if(rootY<0)for(const label of Object.keys(q))q[label]=add3(q[label],[0,rootY,0]);
    for(const foot of ['RIGHT LEG','LEFT LEG'] as const){
      const blended=footTargets[foot];if(!blended)continue;
      const side=foot.startsWith('RIGHT')?'RIGHT':'LEFT',hip=`${side} HIP`,knee=`${side} KNEE`;
      const solved=solveLimb(q[hip],q[knee],q[foot],blended,q[knee]);
      q[knee]=solved.joint;q[foot]=solved.end;
      if(solved.unreachable)issues.push(`${side.toLowerCase()} foot target exceeds the calibrated leg reach`);
    }
    const keypoints=project(q);
    for(const k of keypoints){
      if(![k.x,k.y,k.depth].every(Number.isFinite))throw new Error('Retargeting produced a nonfinite joint.');
      if(k.x<0||k.x>1||k.y<0||k.y>1)issues.push(`${k.label}: outside the canvas; add padding or edit the pose`);
      if(k.depth<0||k.depth>255)issues.push(`${k.label}: depth exceeds the provider range`);
    }
    return {points:q,keypoints,contacts:sample.contacts,issues};
  });
  return {rest,frames,reference:clonePose(targetRest),camera:fit.camera,origin:fit.origin,depthScale,issues:[...new Set(frames.flatMap(f=>f.issues))]};
}

export function sampleMotion(clip:MotionClip,times:number[]):MotionClip{
  if(times.some((t,i)=>!Number.isFinite(t)||t<0||t>clip.duration||(i>0&&t<times[i-1])))throw new Error('Sample times must be ordered within the source duration.');
  const samples=times.map(time=>{
    const next=clip.samples.findIndex(s=>s.time>=time),b=clip.samples[next<0?clip.samples.length-1:next],a=clip.samples[Math.max(0,(next<0?clip.samples.length:next)-1)];
    const u=b.time===a.time?0:(time-a.time)/(b.time-a.time);
    const points:Pose3=Object.fromEntries(Object.keys(a.points).map(k=>[k,mix3(a.points[k],b.points[k],u)]));
    const contacts:MotionSample['contacts']={};
    for(const foot of ['RIGHT LEG','LEFT LEG'] as const){const ca=a.contacts[foot],cb=b.contacts[foot];if(ca&&cb)contacts[foot]={weight:ca.weight+(cb.weight-ca.weight)*u};}
    return {time,points,contacts};
  });return {...clip,samples};
}
