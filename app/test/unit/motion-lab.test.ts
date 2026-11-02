import { readFileSync } from 'node:fs';
import { expect,test } from 'vitest';
import { newDocument,validateDocument,renderPoses,buildDocument,editPose,paddedReference,type MotionLibrary } from '../../src/ui/motion-lab/model.ts';
import { MOTION_EDGES,length3,sub3 } from '../../src/lib/rig/motion.ts';
import { makeImg } from '../../src/lib/image/png.ts';
import type { DirectionName } from '../../src/lib/rig/rig.ts';
const library=JSON.parse(readFileSync(new URL('../../dev-fixtures/motion-lab/library.json',import.meta.url),'utf8')) as MotionLibrary;
test('all preset, body and view documents retain valid native pixels and provider geometry',()=>{
  for(const fixture of library.fixtures)for(const clip of library.clips)for(const direction of Object.keys(fixture.references) as DirectionName[]){
    const d=newDocument(library,fixture,clip,direction),{result,poses}=renderPoses(validateDocument(d));
    expect(poses.length).toBe(d.times.length+(d.buffer?1:0));expect(result.calibration.width).toBe(fixture.cell.w+d.padding*2);
    if(d.buffer)expect(poses.at(-1)).toEqual(poses.at(-2));
  }
});
test('pose IK edits survive a document roundtrip without stretching bones or mutating source data',()=>{
  const d=newDocument(library),before=buildDocument(d),k=before.frames[0].keypoints.find(k=>k.label==='RIGHT ARM')!;
  const edited=editPose(d,0,k.label,k.x+0.005,k.y-0.005,k.depth),after=buildDocument(validateDocument(JSON.parse(JSON.stringify(edited))));
  expect(Object.keys(d.edits)).toHaveLength(0);expect(after.frames[0].keypoints).not.toEqual(before.frames[0].keypoints);
  for(const[a,b]of MOTION_EDGES)expect(length3(sub3(after.frames[0].points[b],after.frames[0].points[a]))).toBeCloseTo(length3(sub3(before.frames[0].points[b],before.frames[0].points[a])),7);
  expect(edited.clip).toEqual(d.clip);
});
test('padding copies every native pixel without resampling and preserves transparency',()=>{
  const image=makeImg(2,2);image.data.set([1,2,3,255,4,5,6,128,7,8,9,255,10,11,12,0]);const padded=paddedReference(image,2);
  expect([padded.w,padded.h]).toEqual([6,6]);expect([...padded.data.slice((2*6+2)*4,(2*6+4)*4)]).toEqual([...image.data.slice(0,8)]);expect(padded.data[3]).toBe(0);
});
test('invalid imports and unreachable edits fail before a paid request can be constructed',()=>{
  const d=newDocument(library);expect(()=>validateDocument({...d,durations:[100]})).toThrow('invalid motion document');
  expect(()=>validateDocument({...d,clip:{...d.clip,action:[]}})).toThrow('Source action');
  expect(()=>validateDocument({...d,times:[0.3,0.2,0.4]})).toThrow();expect(()=>editPose(d,0,'RIGHT ARM',3,3,128)).toThrow('limb reach');
  const broken=structuredClone(d);broken.fixture.references.south!.png='';expect(()=>renderPoses(broken)).toThrow('artwork');
  for(const fixture of library.fixtures){expect(Object.keys(fixture.references)).toHaveLength(4);expect(()=>newDocument(library,fixture,library.clips[0],'north-east')).toThrow('stored artwork');}
});
test('view-specific fall and restrained strike preserve calibration and bone lengths',()=>{
  for(const id of ['attack','death']){
    const d=newDocument(library,library.fixtures[0],library.clips.find(c=>c.id===id)!),fit=buildDocument(d);
    expect(id==='death'?d.options.plane:d.options.weights?.leftArm).toBe(id==='death'?90:0.25);
    for(const frame of fit.frames)for(const[a,b]of MOTION_EDGES)expect(length3(sub3(frame.points[b],frame.points[a]))).toBeCloseTo(length3(sub3(fit.reference[b],fit.reference[a])),7);
  }
  const d=newDocument(library),fit=buildDocument(d),k=fit.frames[0].keypoints.find(k=>k.label==='RIGHT HIP')!;
  expect(()=>validateDocument(editPose(d,0,k.label,k.x+0.01,k.y,k.depth))).not.toThrow();
});
test('non-looping preset playback follows source intervals and the fall samples its fast phase',()=>{
  for(const clip of library.clips.filter(c=>!c.loop)){
    const d=newDocument(library,library.fixtures[0],clip);
    for(let i=0;i<d.times.length-1;i++)expect(Math.abs(d.durations[i]-(d.times[i+1]-d.times[i])*1000)).toBeLessThan(1);
    expect(d.durations.at(-1)).toBeGreaterThanOrEqual(100);
    if(clip.id==='death'){expect(d.times).toHaveLength(13);expect(d.times).toContain(1);}
  }
});

test('optional target depth calibration and its provenance survive model roundtrips without replacing source motion',()=>{
  const fixture=structuredClone(library.fixtures[0]),clip=library.clips.find(c=>c.id==='walk')!;
  fixture.depthReference=Object.fromEntries(Object.entries(clip.reference).map(([label,p])=>[label,[p[0]*1.5,p[1],p[2]*0.6]]));fixture.depthSource='Experimental target rest; fixed 2D camera remains unchanged.';
  const document=newDocument(library,fixture,clip,'east'),roundtrip=validateDocument(JSON.parse(JSON.stringify(document))),fit=buildDocument(roundtrip);
  expect(roundtrip.fixture.depthReference).toEqual(fixture.depthReference);expect(roundtrip.fixture.depthSource).toBe(fixture.depthSource);
  expect(fit.calibration.depthReference).toEqual(fixture.depthReference);expect(fit.clip.reference).toEqual(clip.reference);
  expect(fit.calibration.elevation).toBe(document.elevation);expect(fit.calibration.azimuth).toBe(document.azimuth);
  fit.rest.forEach((k,i)=>{expect(k.x).toBeCloseTo(document.reference[i].x,12);expect(k.y).toBeCloseTo(document.reference[i].y,12);});
});

test('model input rejects invalid optional target depth and provenance before using it',()=>{
  const fixture=structuredClone(library.fixtures[0]);fixture.depthReference=structuredClone(library.clips[0].reference);delete fixture.depthReference['LEFT ARM'];
  expect(()=>newDocument(library,fixture)).toThrow('18 finite 3D joints');
  fixture.depthReference=structuredClone(library.clips[0].reference);fixture.depthReference['LEFT LEG']=[...fixture.depthReference['LEFT KNEE']];expect(()=>newDocument(library,fixture)).toThrow('zero-length');
  delete fixture.depthReference;fixture.depthSource=' ';expect(()=>newDocument(library,fixture)).toThrow('nonempty label');
});
