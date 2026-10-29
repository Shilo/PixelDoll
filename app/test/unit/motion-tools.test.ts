import {readFileSync} from 'node:fs';
import {test,expect} from 'vitest';
import {newDocument,type MotionLibrary} from '../../src/ui/motion-lab/model.ts';
import {calibrationOf,calibratedDocument,readCalibrations} from '../../src/ui/motion-lab/calibration.ts';
import {contactMotion,templateContactMotion} from '../../src/ui/motion-lab/diagnostics.ts';
import {rigidAttachment} from '../../src/ui/motion-lab/attachment.ts';
import {makeImg} from '../../src/lib/image/png.ts';
import type {MotionFrame} from '../../src/lib/rig/motion.ts';
import {expectPixels} from './pixels.ts';
const library=JSON.parse(readFileSync(new URL('../../dev-fixtures/motion-lab/library.json',import.meta.url),'utf8')) as MotionLibrary;
test('calibration follows the exact body artwork and view across presets without saving pose edits',async()=>{
  const d=newDocument(library);d.elevation=17;d.azimuth=12;d.reference[0].x+=0.01;
  const profile=await calibrationOf(d),parsed=readCalibrations(JSON.stringify([profile]));
  const walk=newDocument(library,library.fixtures[0],library.clips.find(c=>c.id==='walk')!),restored=await calibratedDocument(walk,parsed);
  expect(restored.reference).toEqual(d.reference);expect(restored.elevation).toBe(17);expect(restored.azimuth).toBe(12);expect(restored.clip.id).toBe('walk');expect(restored.edits).toEqual({});expect(walk.reference).not.toEqual(d.reference);
  const east=newDocument(library,library.fixtures[0],library.clips[0],'east');expect(await calibratedDocument(east,parsed)).toBe(east);
  const different=newDocument(library);different.fixture.references.south!.png=library.fixtures[1].references.south!.png;await expect(calibratedDocument(different,parsed)).rejects.toThrow('different reference artwork');
});
test('stale, invalid and duplicate calibrations fail explicitly',async()=>{
  const p=await calibrationOf(newDocument(library));expect(()=>readCalibrations('{')).toThrow();expect(()=>readCalibrations(JSON.stringify([{...p,revision:'old'}]))).toThrow('different converter');expect(()=>readCalibrations(JSON.stringify([p,p]))).toThrow('duplicate');expect(()=>readCalibrations(JSON.stringify([{...p,elevation:90}]))).toThrow();
});
const frames=(xs:number[]):MotionFrame[]=>xs.map(x=>({points:{'RIGHT LEG':[x,0,0]},contacts:{'RIGHT LEG':{weight:1}},keypoints:[],issues:[]}));
test('contact fit recovers known world travel and quantifies variable contact sliding',()=>{
  const planted=contactMotion(frames([0,-2,-4]),[0,0.5,1]);expect(planted?.velocity.x).toBe(4);expect(planted?.rms).toBe(0);
  const variable=contactMotion(frames([0,-1,-4]),[0,0.5,1]);expect(variable?.velocity.x).toBe(4);expect(variable?.rms).toBe(2);
  const airborne=frames([0,1]);airborne.forEach(f=>f.contacts={});expect(contactMotion(airborne,[0,1])).toBeNull();expect(()=>contactMotion(frames([0,1]),[0,0])).toThrow('strictly increasing');
  const run=newDocument(library,library.fixtures[0],library.clips.find(c=>c.id==='run')!);expect(templateContactMotion(run)?.samples).toBeGreaterThan(0);
});
test('rigid placement preserves a calibrated weapon exactly at rest and rotates around its grip',()=>{
  const blade=makeImg(5,5);for(let y=0;y<4;y++)blade.data.set([170,180,190,255],(y*5+2)*4);
  expectPixels(rigidAttachment(blade,{x:2.5,y:3.5},{x:2.5,y:3.5},0,blade).image,blade,'unchanged calibrated rest');
  const rotated=rigidAttachment(blade,{x:2.5,y:3.5},{x:1.5,y:2.5},Math.PI/2,{w:6,h:6});expect(rotated.clippedSourcePixels).toBe(0);
  for(let x=1;x<=4;x++)expect(rotated.image.data[(2*6+x)*4+3]).toBe(255);
  expect(rigidAttachment(blade,{x:2.5,y:3.5},{x:-3,y:0},0,blade).clippedSourcePixels).toBe(4);expect(()=>rigidAttachment(blade,{x:-1,y:0},{x:0,y:0},0,blade)).toThrow('grip');
});
