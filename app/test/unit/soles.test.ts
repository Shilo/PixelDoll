import {expect,test} from 'vitest';
import {measureSoles,validateSoles,type SoleReview} from '../../src/ui/motion-lab/soles.ts';
test('visible sole measurements compensate root projection and wrapped cycles without inventing missing landmarks',()=>{
  const doc:SoleReview={version:1,kind:'pixeldoll-rendered-sole-review',notes:'Synthetic projection test.',binding:{jobId:'test',hashes:['a','b','c'],cell:{w:80,h:80},direction:'east',elevation:0,azimuth:90,times:[0.05,0.5,0.95],duration:1,loop:true,plan:{version:1,velocity:[0,10],windows:[{foot:'RIGHT LEG',start:-0.1,end:0.1,fade:0,anchor:[0,0,0]}]}},frames:[{'RIGHT LEG':{x:29.5,y:70,landmark:'heel'}},{},{'RIGHT LEG':{x:30.5,y:70,landmark:'heel'}}]};
  expect(measureSoles(doc)[0]).toMatchObject({expected:2,marked:2,complete:true,worldSpan:0});
  doc.frames[2]['RIGHT LEG']!.x+=3;expect(measureSoles(doc)[0].worldSpan).toBe(3);
  delete doc.frames[2]['RIGHT LEG'];expect(measureSoles(doc)[0]).toMatchObject({complete:false,worldSpan:null});
  doc.binding.times=[0,0.5,1];doc.frames[2]['RIGHT LEG']={x:29.5,y:70,landmark:'heel'};expect(measureSoles(doc)[0]).toMatchObject({complete:false,temporalSpan:0,worldSpan:null});
  expect(()=>validateSoles(doc,{...doc.binding,hashes:['other']})).toThrow('exact frozen');
});
