import {expect,test} from 'vitest';
import {makeImg,type Img} from '../../src/lib/image/png.ts';
import {toChroma} from '../../src/lib/image/chroma.ts';
import {extractCell,itemQa,postProcess,slotOf} from '../../src/lib/items/items.ts';
import {LABELS} from '../../src/lib/rig/poses.ts';
import type {Rig} from '../../src/lib/rig/rig.ts';

const gray=[130,130,140,255];
function paint(image:Img,x:number,y:number,color=gray){image.data.set(color,(y*image.w+x)*4);}
const pose=LABELS.map(label=>({label,x:36/64,y:32/64}));
const rig:Rig={cell:{w:64,h:64},pivot:{x:32,y:60},baseItem:'body',baseHash:'sha256:synthetic',directions:[{id:'south'}],rest:{south:{image:'sha256:synthetic',keypoints:pose}},animations:[{id:'slash',cells:3,loop:false,frames:[0,1,2].map(cell=>({cell,ms:100})),sources:{south:{route:'skeleton-v3',reference:'sha256:synthetic',keypoints:[pose,pose,pose],provenance:[]}}}]};
function fixture(){
  const base=makeImg(64,64);
  for(let y=12;y<52;y++)for(let x=20;x<40;x++)paint(base,x,y,[180,100,60,255]);
  const out=toChroma(base,'green'),stencil=new Uint8Array(64*64);
  for(let y=31;y<34;y++)for(let x=37;x<50;x++){paint(out,x,y);stencil[y*64+x]=1;}
  for(let y=34;y<36;y++)for(let x=34;x<36;x++){paint(out,x,y);stencil[y*64+x]=1;}
  paint(out,35,30,[48,46,11,255]);paint(out,36,30,[120,80,40,255]);
  const options={key:'slash/south/0',call:0,base,out,route:'green' as const,band:{x:0,y:0,w:64,h:64},posed:true,held:true};
  return{base,out,stencil,options};
}
function contained(c:ReturnType<typeof extractCell>,stencil:Uint8Array){
  for(let p=0;p<stencil.length;p++)if(!stencil[p]){expect(c.mask[p]).toBe(0);expect(c.layer.data.subarray(p*4,p*4+4)).toEqual(new Uint8ClampedArray(4));if(c.cut)expect(c.cut[p]).toBe(0);}
  expect(c.area).toBe(c.mask.reduce((n,v)=>n+v,0));
}

test('the optional stencil removes protected low-green and finger pixels while retaining genuine foreground over the bare body and split pommel parts',()=>{
  const f=fixture(),baseBefore=f.base.data.slice(),outBefore=f.out.data.slice(),before=f.stencil.slice(),legacy=extractCell(f.options),c=extractCell({...f.options,stencil:f.stencil});
  expect(legacy.mask[30*64+35]).toBe(1);expect(legacy.mask[30*64+36]).toBe(1);
  contained(c,before);expect(c.mask[32*64+38]).toBe(1);expect(f.base.data[(32*64+38)*4+3]).toBe(255);
  postProcess(rig,slotOf('main_hand'),[c],{});contained(c,before);
  expect(c.mask[34*64+34]).toBe(1);expect(c.mask[35*64+35]).toBe(1);expect(c.mask[32*64+38]).toBe(1);
  expect(f.base.data).toEqual(baseBefore);expect(f.out.data).toEqual(outBefore);expect(f.stencil).toEqual(before);expect(c.stencil).not.toBe(f.stencil);
  expect(c.out).toBe(f.out);expect(c.rawKeyOutside).toEqual(legacy.rawKeyOutside);expect(c.keyKept).toBe(legacy.keyKept);expect(c.keyOutside).toBe(legacy.keyOutside);
});

test('a one-pixel body redraw registers without a stencil but remains a hard G10 failure with exact stencil coordinates',()=>{
  const f=fixture(),shifted=makeImg(64,64);
  for(let y=0;y<64;y++)for(let x=0;x<63;x++)shifted.data.set(f.out.data.subarray((y*64+x)*4,(y*64+x+1)*4),(y*64+x+1)*4);
  const legacy=extractCell({...f.options,out:shifted}),c=extractCell({...f.options,out:shifted,stencil:new Uint8Array(4096).fill(1)});
  expect(legacy.offset).toEqual([-1,-0]);expect(c.offset.every(v=>v===0)).toBe(true);expect(c.out).toBe(shifted);expect(c.out.data).toEqual(shifted.data);expect(c.shifted).toBe(true);
  expect(c.rawKeyOutside).toEqual(legacy.rawKeyOutside);
  const legacyQa=itemQa(rig,slotOf('main_hand'),'green',[legacy],0),boundedQa=itemQa(rig,slotOf('main_hand'),'green',[c],0);
  expect(legacy.shifted).toBe(false);expect([...legacyQa.failCalls.values()].flat().some(reason=>reason.startsWith('G10 '))).toBe(false);
  expect(boundedQa.failCalls.get(0)).toContain('G10 slash/south/0: misregistered (fits the base better 1 px off)');expect(boundedQa.qa.status).toBe('fail');
});

test.each(['short','nonbinary','wrong-type'] as const)('invalid %s stencils fail clearly without modifying image inputs',mode=>{
  const f=fixture(),before=f.out.data.slice();
  const stencil=mode==='short'?new Uint8Array(2):mode==='nonbinary'?new Uint8Array(4096).fill(255):new Array(4096).fill(1) as unknown as Uint8Array;
  expect(()=>extractCell({...f.options,stencil})).toThrow('binary Uint8Array matching the cell canvas');expect(f.out.data).toEqual(before);
});

test('the result owns its stencil so later mutation of the caller input cannot expand permission',()=>{
  const f=fixture(),allowed=f.stencil.slice(),c=extractCell({...f.options,stencil:f.stencil});f.stencil.fill(1);
  postProcess(rig,slotOf('main_hand'),[c],{});contained(c,allowed);expect(c.stencil).toEqual(allowed);
});

test('raw-frame cleanup cannot fill an explicitly protected key-colored hole during closeGrip',()=>{
  const base=makeImg(64,64),out=makeImg(64,64),stencil=new Uint8Array(4096);
  for(let y=28;y<33;y++)for(let x=28;x<33;x++){paint(out,x,y);stencil[y*64+x]=1;}
  paint(out,30,30,[0,180,0,255]);stencil[30*64+30]=0;
  const options={key:'slash/south/0',call:0,base,out,route:'green' as const,band:{x:0,y:0,w:64,h:64},posed:true,held:true},legacy=extractCell(options),c=extractCell({...options,stencil});
  expect(legacy.mask[30*64+30]).toBe(0);postProcess(rig,slotOf('main_hand'),[legacy],{});expect(legacy.mask[30*64+30]).toBe(1);
  const result=postProcess(rig,slotOf('main_hand'),[c],{});expect(result.removed).toBeGreaterThanOrEqual(1);contained(c,stencil);expect(c.mask[30*64+30]).toBe(0);
});

test('dropped-frame keyframe repair cannot paste beyond the supplied stencil',()=>{
  const base=makeImg(64,64),key=makeImg(64,64),stencil=new Uint8Array(4096);
  for(let y=30;y<34;y++)for(let x=32;x<42;x++){paint(key,x,y);if(x>=37)stencil[y*64+x]=1;}
  const options={call:0,base,route:'none' as const,band:{x:0,y:0,w:64,h:64},posed:true,held:true};
  const c=extractCell({...options,key:'slash/south/0',out:makeImg(64,64),stencil}),others=[1,2].map(i=>extractCell({...options,key:`slash/south/${i}`,out:key})),before=key.data.slice();
  const result=postProcess(rig,slotOf('main_hand'),[c,...others],{south:key});
  expect(result.repaired).toContain(c.key);expect(c.repaired).toBe(true);contained(c,stencil);expect(c.area).toBe(20);expect(result.removed).toBeGreaterThanOrEqual(20);expect(key.data).toEqual(before);
});

test('body cuts are bounded along with the item without rewriting raw source diagnostics',()=>{
  const f=fixture();for(let y=28;y<31;y++)f.out.data.fill(0,(y*64+39)*4,(y*64+40)*4);
  const options={...f.options,posed:false,cut:{maxY:40}},legacy=extractCell(options);expect(legacy.cut?.reduce((n,v)=>n+v,0)).toBe(3);
  f.stencil[30*64+39]=1;const c=extractCell({...options,stencil:f.stencil});expect(c.cut?.reduce((n,v)=>n+v,0)).toBe(1);expect(c.cut![30*64+39]).toBe(1);contained(c,f.stencil);
  expect(c.keyKept).toBe(legacy.keyKept);expect(c.keyOutside).toBe(legacy.keyOutside);
  c.cut![28*64+39]=1;postProcess(rig,slotOf('main_hand'),[c],{});expect(c.cut![28*64+39]).toBe(0);
});

test('omitting the stencil preserves the entire existing extraction and post-processing result',()=>{
  const f=fixture(),original=extractCell(f.options),omitted=extractCell({...f.options,stencil:undefined});expect(omitted).toEqual(original);expect(original).not.toHaveProperty('stencil');
  expect(postProcess(rig,slotOf('main_hand'),[omitted],{})).toEqual(postProcess(rig,slotOf('main_hand'),[original],{}));expect(omitted).toEqual(original);
});
