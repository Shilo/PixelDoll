import { readFileSync } from 'node:fs';
import { expect, test } from 'vitest';
import { DEFAULT_MOTION_OPTIONS, MOTION_EDGES, length3, sub3, retargetMotion, sampleMotion, solveLimb, swing3, type MotionClip, type MotionCalibration } from '../../src/lib/rig/motion.ts';
import type { Keypoint, DirectionName } from '../../src/lib/rig/rig.ts';
const library=JSON.parse(readFileSync(new URL('../../dev-fixtures/motion-lab/library.json',import.meta.url),'utf8')) as { clips:MotionClip[]; fixtures:{cell:{w:number;h:number};references:Record<string,{keypoints:Keypoint[]}>}[];camera:{elev:number;yaw:number} };
const walk=library.clips.find(c=>c.id==='walk')!;
const calibration=(direction:DirectionName='south',fixture=0):MotionCalibration=>({width:library.fixtures[fixture].cell.w,height:library.fixtures[fixture].cell.h,rest:library.fixtures[fixture].references[direction].keypoints,direction,elevation:library.camera.elev,azimuth:direction==='east'?90-library.camera.yaw:undefined});

test('zero gain preserves every calibrated XY and depth on both source-facing views',()=>{
  for(const direction of ['south','east'] as const){
    const fit=retargetMotion(walk,calibration(direction),{...DEFAULT_MOTION_OPTIONS,gain:0});
    for(const frame of fit.frames)for(const [i,k]of frame.keypoints.entries()){
      expect(k.x).toBeCloseTo(fit.rest[i].x,12);expect(k.y).toBeCloseTo(fit.rest[i].y,12);expect(k.depth).toBeCloseTo(fit.rest[i].depth,10);
    }
  }
});
test('the former lowest-ankle threshold introduces no whole-body jump',()=>{
  const clip=sampleMotion(walk,[0.5954,0.5955]),fit=retargetMotion(clip,calibration());
  const jumps=fit.frames[0].keypoints.map((k,i)=>Math.hypot(k.x-fit.frames[1].keypoints[i].x,k.y-fit.frames[1].keypoints[i].y)*80);
  expect(Math.max(...jumps)).toBeLessThan(0.05);
});
test('ground support cannot import the source actor horizontal stride into a target foot',()=>{
  const run=library.clips.find(c=>c.id==='run')!,clip=sampleMotion(run,[0,run.samples[1].time]),cal=calibration('east',2);
  const supported=retargetMotion(clip,cal),free=retargetMotion(clip,cal,{...DEFAULT_MOTION_OPTIONS,contact:0});
  for(let i=0;i<2;i++)for(const foot of ['LEFT LEG','RIGHT LEG'])for(const axis of [0,2])expect(supported.frames[i].points[foot][axis]).toBeCloseTo(free.frames[i].points[foot][axis],3);
});
test('3D segment lengths remain fixed through contact IK for every baked move and proportion',()=>{
  for(let fixture=0;fixture<library.fixtures.length;fixture++)for(const clip of library.clips){
    const fit=retargetMotion(clip,calibration('south',fixture));
    for(const frame of fit.frames)for(const[a,b]of MOTION_EDGES){
      expect(length3(sub3(frame.points[b],frame.points[a])),`${fixture}/${clip.id}/${a}-${b}`).toBeCloseTo(length3(sub3(fit.reference[b],fit.reference[a])),7);
    }
  }
});
test('projection fits reference joints without discarding latent depth',()=>{
  const cal=calibration('east'),fit=retargetMotion(walk,cal);
  fit.rest.forEach((k,i)=>{expect(k.x).toBeCloseTo(cal.rest[i].x,12);expect(k.y).toBeCloseTo(cal.rest[i].y,12);});
  expect(new Set(fit.rest.map(k=>Math.round(k.depth))).size).toBeGreaterThan(3);
});
test('toward-camera and antiparallel swings remain finite and preserve length',()=>{
  for(const to of [[0,0,1],[0,0,-1],[0,-1,0]] as [number,number,number][]){const v=swing3([0,2,0],[0,1,0],to);expect(v.every(Number.isFinite)).toBe(true);expect(length3(v)).toBeCloseTo(2,12);}
});
test('unreachable IK reports reach limits without stretching a limb',()=>{
  const solved=solveLimb([0,0,0],[0,1,0],[0,2,0],[10,0,0],[0,1,1]);
  expect(solved.unreachable).toBe(true);expect(length3(solved.joint)).toBeCloseTo(1,9);expect(length3(sub3(solved.end,solved.joint))).toBeCloseTo(1,9);
});
test('overflow is surfaced and coordinates remain unclamped',()=>{
  const clip=structuredClone(walk);for(const s of clip.samples)for(const p of Object.values(s.points))p[0]+=20;
  const result=retargetMotion(clip,calibration());
  expect(result.issues.some(s=>s.includes('outside the canvas'))).toBe(true);
  expect(result.frames.some(f=>f.keypoints.some(k=>k.x>1))).toBe(true);
});
test('invalid calibration and out-of-order source times fail explicitly',()=>{
  expect(()=>retargetMotion(walk,{...calibration(),rest:[]})).toThrow('18 finite');
  expect(()=>sampleMotion(walk,[0.5,0.2])).toThrow('ordered');
});
