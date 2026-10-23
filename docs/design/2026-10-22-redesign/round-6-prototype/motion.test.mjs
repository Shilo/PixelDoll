import test from 'node:test';
import assert from 'node:assert/strict';
import {unit,nearest,resolveMotion,frameAt,advance} from './motion.mjs';
test('two-direction mapping retains a side for vertical travel',()=>{
  assert.equal(nearest(['east','west'],unit(1,1),'west'),'east');
  assert.equal(nearest(['east','west'],unit(1,-1),'west'),'east');
  assert.equal(nearest(['east','west'],unit(0,1),'west'),'west');
  assert.equal(nearest(['east','west'],unit(0,-1),'east'),'east');
});
test('normal cardinal diagonal ties use remembered facing, without missing-data errors',()=>{
  const r=resolveMotion({velocity:[1,1],dirs:['south','east','north','west'],available:{walk:['south','east','north','west']},previous:'north'});
  assert.equal(r.dir,'north');assert.equal(r.issue,null);
});
test('missing northwest animation resolves neighboring direction and reports intended hole',()=>{
  const r=resolveMotion({velocity:[-1,1],dirs:['northwest','north','west'],available:{walk:['north','west']},previous:'west'});
  assert.equal(r.intended,'northwest');assert.equal(r.dir,'west');assert.equal(r.issue,'walk:northwest');
});
test('opposite Walk is rejected in favor of correct-facing Idle',()=>{
  const r=resolveMotion({velocity:[0,-1],dirs:['south','north'],available:{walk:['north'],idle:['south']}});
  assert.equal(r.clip,'idle');assert.equal(r.dir,'south');assert.equal(r.moving,true);
});
test('intentional single-direction movement is not a coverage error',()=>{
  const r=resolveMotion({velocity:[0,-1],dirs:['north'],available:{walk:['north']}});
  assert.equal(r.dir,'north');assert.equal(r.issue,null);
});
test('missing Idle holds an actual source frame; never loops Walk while stopped',()=>{
  const r=resolveMotion({velocity:[0,0],dirs:['east','west'],available:{walk:['east','west']},previous:'west',still:{east:{clip:'walk',cell:0},west:{clip:'walk',cell:0}}});
  assert.equal(r.dir,'west');assert.equal(r.still,true);assert.equal(r.cell,0);assert.equal(r.moving,false);
});
test('zero/nonfinite input and empty artwork terminate safely',()=>{
  assert.deepEqual(unit(0,0),[0,0]);assert.deepEqual(unit(Infinity,0),[0,0]);
  assert.equal(resolveMotion({velocity:[0,0],dirs:[],available:{}}).clip,null);
});
test('authored durations and independent position/camera simulation',()=>{
  const frames=[{cell:0,ms:100},{cell:4,ms:200}];assert.equal(frameAt(frames,150),4);assert.equal(frameAt(frames,350),0);
  const p={x:0,y:0},c={x:0,y:0};for(let i=0;i<20;i++)advance(p,c,unit(1,1),.05,100,9);
  assert.ok(Math.abs(Math.hypot(p.x,p.y)-100)<1e-8);assert.ok(c.x>0&&c.x<p.x);
  const x=p.x;advance(p,c,[0,0],.05,100,9);assert.equal(p.x,x);assert.ok(c.x<p.x);
});
