import { expect, test, vi } from 'vitest';
import { makeImg, decodePng, type Img } from '../../src/lib/image/png.ts';
import { encodePngBytes } from '../../src/lib/image/pngraw.ts';
import { toChroma } from '../../src/lib/image/chroma.ts';
import { over } from '../../src/lib/compose/compose.ts';
import { LABELS } from '../../src/lib/rig/poses.ts';
import { cellHash, cellKey, baseHashOf, type DirectionName, type Keypoint } from '../../src/lib/rig/rig.ts';
import type { CellKey } from '../../src/lib/store/manifest.ts';
import type { Project, Item } from '../../src/lib/store/manifest.ts';
import type { JobRec } from '../../src/lib/pixellab/queue.ts';
import { createDesign } from '../../src/lib/equipment/design.ts';
import { qualifiedFit, restFitRequests, poseFitRequests, evaluateRestFit, evaluatePoseFit, type FitRecord } from '../../src/lib/equipment/generate.ts';

const { blobs } = vi.hoisted(() => ({ blobs: new Map<string, Blob>() }));
vi.mock('../../src/lib/store/db.ts', () => ({ getBlob: async (id: string) => blobs.get(id) }));
const dirs: DirectionName[] = ['south','east','north','west'];
const points: Keypoint[] = LABELS.map((label,i) => ({label,x:0.4+(i%2)*0.15,y:label==='NECK'?0.35:0.2+Math.floor(i/2)*0.07}));
async function project(w: number, source = false): Promise<Project> {
  const body=makeImg(64,64), layer=makeImg(64,64);
  for(let y=10;y<60;y++)for(let x=32-w;x<32+w;x++)body.data.set([170,120,90,255],(y*64+x)*4);
  for(let y=9;y<18;y++)for(let x=26;x<38;x++)layer.data.set([140,145,150,255],(y*64+x)*4);
  const bh=await cellHash(body), lh=await cellHash(layer), images=new Map([[bh,body],[lh,layer]]);
  const base:Item={id:'base',name:'Base',slot:'body',status:'accepted',baseHash:bh,mirror:'flip',materials:[],prompt:'humanoid',provenance:[],layers:[{id:'main',role:'fg',z:10,cells:{}}]};
  const clips=source?[{id:'rest',cells:1}]:[{id:'rest',cells:1},{id:'blink',cells:2},{id:'long',cells:16}];
  const animations=clips.map(c=>({...c,loop:true,frames:Array.from({length:c.cells},(_,cell)=>({cell,ms:100})),sources:Object.fromEntries(dirs.map(d=>[d,{route:'import' as const,reference:bh,keypoints:Array.from({length:c.cells},()=>structuredClone(points)),motion:c.id==='rest'?'imported-rest':'estimated:frozen-import',provenance:[]}]))}));
  for(const a of animations)base.layers[0].cells![a.id]=Object.fromEntries(dirs.map(d=>[d,Array(a.cells).fill(bh)]));
  const rig={cell:{w:64,h:64},pivot:{x:32,y:60},view:'low top-down' as const,template:'mannequin',directions:dirs.map(id=>({id})),animations,rest:Object.fromEntries(dirs.map(d=>[d,{image:bh,keypoints:structuredClone(points)}])),baseItem:'base',baseHash:bh};
  rig.baseHash=await baseHashOf(rig,Object.fromEntries(animations.flatMap(a=>dirs.flatMap(d=>Array.from({length:a.cells},(_,i)=>[`${a.id}/${d}/${i}`,bh])))));base.baseHash=rig.baseHash;
  const items=[base];
  if(source){const dressed=toChroma(body,'green');over(dressed,layer);const dh=await cellHash(dressed);images.set(dh,dressed);items.push({id:'helmet',name:'Steel helmet',slot:'head',status:'accepted',mirror:'flip',materials:[],prompt:'simple iron helmet',baseHash:rig.baseHash,route:'skeleton-pose',key:'green',dressed:Object.fromEntries(dirs.map(d=>[d,dh])),provenance:[],layers:[{id:'main',role:'fg',z:130,cells:{rest:Object.fromEntries(dirs.map(d=>[d,[lh]]))}}]});}
  return {manifest:{format:'pixeldoll/2',name:'Fixture',app:'test',rig,items,materials:[],presets:[{id:'base',name:'Base',items:{body:'base'},variants:{}}],slots:[{id:'body',class:'base',z:10},{id:'head',class:'rigid',anchor:'head',z:130}]},images};
}
async function record(cells: string[], images: Img[], endpoint='/transfer-outfit-v2'): Promise<FitRecord> {
  const results=await Promise.all(images.map(async(im,i)=>{const sha=`result-${blobs.size}-${i}`;blobs.set(sha,new Blob([await encodePngBytes(im) as Uint8Array<ArrayBuffer>]));return {label:String(i),sha};}));
  return {call:{cells,seed:99},rec:{id:crypto.randomUUID(),label:'test',method:'POST',endpoint,params:{},inputs:[],requestHash:'a'.repeat(64),state:'done',attempts:1,nextAt:0,createdAt:1,jobs:[{id:'remote',status:'completed',done:true,results}],gens:10,usd:0} as JobRec};
}
test('paid fitting fails closed for unknown profiles, offsets, missing references and unsafe colourways',async()=>{
  const source=await project(5,true), target=await project(7), design=await createDesign(source,'helmet');
  expect(qualifiedFit(design,target)).toBeNull();
  design.source.materials.push({id:'accent',owner:design.itemId,label:'Accent',ramp:['#ff0000'],variants:{}});expect(qualifiedFit(design,target)).toContain('single-material');design.source.materials.pop();
  delete target.manifest.rig.view;expect(qualifiedFit(design,target)).toContain('known');target.manifest.rig.view='low top-down';
  design.source.items[1].layers[0].pivot={x:33,y:60};expect(qualifiedFit(design,target)).toContain('offset');delete design.source.items[1].layers[0].pivot;
  target.manifest.items[0].layers[0].cells!.blink!.south![1]=null;expect(qualifiedFit(design,target)).toContain('missing, empty');
  await expect(restFitRequests(design,source,target,33)).rejects.toThrow('missing, empty');
  target.manifest.items[0].layers[0].cells!.blink!.south![1]=target.manifest.rig.rest!.south!.image;
  delete design.source.items[1].dressed!.west;expect(qualifiedFit(design,target)).toContain('every requested direction');
});
test('reference transfer preserves target inputs; posing uses real target joints and covers short/long clips exactly',async()=>{
  const source=await project(5,true), target=await project(7), design=await createDesign(source,'helmet');
  const [rest]=await restFitRequests(design,source,target,12);expect(rest.limit).toBe(10);expect(rest.cells).toHaveLength(4);
  const body=rest.req.body as {frames:{image:{base64:string}}[];reference_image:{image:{base64:string}}};
  const decoded=await decodePng(Uint8Array.from(atob(body.frames[0].image.base64),c=>c.charCodeAt(0)));
  expect(decoded).toEqual(toChroma(target.images.get(target.manifest.rig.rest!.south!.image)!,'green'));
  const approved=Object.fromEntries(dirs.map(d=>[d,decoded]));
  const calls=await poseFitRequests(design,target,approved,100);
  expect(calls.flatMap(c=>c.cells)).toHaveLength((2+16)*4);expect(new Set(calls.flatMap(c=>c.cells)).size).toBe(72);
  expect(calls.some(c=>c.cells[0].startsWith('rest/'))).toBe(false);
  const blink=calls.find(c=>c.cells[0]==='blink/south/0')!.req.body as {first_frame_keypoints:Keypoint[];keypoints:Keypoint[][]};
  expect(blink.first_frame_keypoints).toEqual(target.manifest.rig.rest!.south!.keypoints);expect(blink.keypoints).toHaveLength(3);
  expect(calls.every(c=>(c.req.body as {keypoints:unknown[]}).keypoints.length>=3&&(c.req.body as {keypoints:unknown[]}).keypoints.length<=15)).toBe(true);
});
test('rest review uses actual API pixels, rejects malformed output, and flags altered bodies',async()=>{
  const source=await project(5,true), target=await project(7), design=await createDesign(source,'helmet');
  const im=toChroma(target.images.get(target.manifest.rig.rest!.south!.image)!,'green'), hat=source.images.get(source.manifest.items[1].layers[0].cells!.rest!.south![0]!)!;over(im,hat);
  const paths=dirs.map(d=>`rest/${d}/0`), clean=await record(paths,dirs.map(()=>im));
  const review=await evaluateRestFit(design,target,[clean]);expect(review.fails).toEqual([]);expect(Object.keys(review.rest)).toHaveLength(4);
  const malformed=await record(paths,[im]);await expect(evaluateRestFit(design,target,[malformed])).rejects.toThrow('frame count');
  const altered=makeImg(64,64);over(altered,hat);const bad=await record(paths,dirs.map(()=>altered));expect((await evaluateRestFit(design,target,[bad])).fails.length).toBe(4);
  const stray=structuredClone(im);for(let y=0;y<2;y++)for(let x=0;x<2;x++)stray.data.set([100,100,100,255],(y*64+x)*4);
  const border=await record(paths,dirs.map(()=>stray));const flagged=await evaluateRestFit(design,target,[border]);expect(flagged.fails.some(f=>f.startsWith('G7'))).toBe(true);expect(flagged.warnings.some(w=>w.includes('detached'))).toBe(true);
});
test('pose review cannot publish missing coverage as a complete fit',async()=>{
  const source=await project(5,true), target=await project(7), design=await createDesign(source,'helmet');
  const im=toChroma(target.images.get(target.manifest.rig.rest!.south!.image)!,'green');
  const restRecord=await record(dirs.map(d=>`rest/${d}/0`),dirs.map(()=>im));
  await expect(evaluatePoseFit(design,target,Object.fromEntries(dirs.map(d=>[d,im])),[],[restRecord])).rejects.toThrow('coverage');
});
test('reused standing cells and dressed references retain their actual transfer producer',async()=>{
  const source=await project(5,true), target=await project(7), design=await createDesign(source,'helmet');
  target.manifest.rig.animations=target.manifest.rig.animations.filter(a=>a.id==='rest');
  const im=toChroma(target.images.get(target.manifest.rig.rest!.south!.image)!,'green');over(im,source.images.get(source.manifest.items[1].layers[0].cells!.rest!.south![0]!)!);
  const transferred=await record(dirs.map(d=>`rest/${d}/0`),dirs.map(()=>im));
  const result=await evaluatePoseFit(design,target,Object.fromEntries(dirs.map(d=>[d,im])),[],[transferred]);
  const item=result.project.manifest.items.find(i=>i.id===result.itemId)!;
  expect(item.provenance).toHaveLength(1);expect(item.provenance[0].endpoint).toBe('/transfer-outfit-v2');
  expect(item.provenance[0].produced).toEqual(dirs.map(d=>`rest/${d}/0`));
  expect(Object.keys(item.qa!.cells)).toHaveLength(4);
  expect(Object.values(item.qa!.cells).every(q=>q.provenance===0)).toBe(true);
});
test('uniform palette drift across all posed outputs is checked against the approved rest, not itself',async()=>{
  const source=await project(5,true), target=await project(7), design=await createDesign(source,'helmet');
  target.manifest.rig.animations=target.manifest.rig.animations.filter(a=>a.id==='blink');
  const approved=toChroma(target.images.get(target.manifest.rig.rest!.south!.image)!,'green'), original=source.images.get(source.manifest.items[1].layers[0].cells!.rest!.south![0]!)!;
  over(approved,original);const changed=structuredClone(original);for(let i=0;i<changed.data.length;i+=4)if(changed.data[i+3])for(let c=0;c<3;c++)changed.data[i+c]+=20;
  const posed=toChroma(target.images.get(target.manifest.rig.rest!.south!.image)!,'green');over(posed,changed);
  const transfers=await record(dirs.map(d=>`rest/${d}/0`),dirs.map(()=>approved));
  const records=await Promise.all(dirs.map(d=>record([`blink/${d}/0`,`blink/${d}/1`],[posed,posed,posed],'/animate-with-skeleton-v3')));
  const result=await evaluatePoseFit(design,target,Object.fromEntries(dirs.map(d=>[d,approved])),records,[transfers]);
  const item=result.project.manifest.items.find(i=>i.id===result.itemId)!;
  expect(result.fails.some(f=>f.includes('approved rest'))).toBe(true);expect(item.qa!.maxPaletteDist).toBe(20);
  expect(Object.values(item.qa!.clips!).every(c=>c.maxPaletteDist===20&&c.status==='fail')).toBe(true);
});
test('extension reuses approved raw references only with exact body, pose, profile and colour baseline proof',async()=>{
  const source=await project(5,true);
  source.manifest.items[1].provenance.push({endpoint:'/edit-animation-v2',params:{},seed:1,requestHash:`sha256:${'a'.repeat(64)}`,produced:dirs.map(d=>cellKey('rest',d,0) as CellKey),createdAt:'2026-10-22T00:00:00Z'});
  const design=await createDesign(source,'helmet'), target=await project(5), refs=Object.fromEntries(dirs.map(d=>[d,source.images.get(source.manifest.items[1].dressed![d]!)!]));
  target.manifest.rig.animations=target.manifest.rig.animations.filter(a=>a.id==='blink');
  const records=await Promise.all(dirs.map(d=>record([`blink/${d}/0`,`blink/${d}/1`],[refs[d],refs[d],refs[d]],'/animate-with-skeleton-v3')));
  const result=await evaluatePoseFit(design,target,refs,records,[],{reuseApprovedSourceRest:true});
  const item=result.project.manifest.items.find(i=>i.id===result.itemId)!;expect(item.provenance[0].endpoint).toBe('/edit-animation-v2');
  for(const [key,q]of Object.entries(item.qa!.cells)) {
    expect(q.provenance).toBeGreaterThan(0);
    expect(item.provenance[q.provenance!].produced).toContain(key);
  }
  target.manifest.rig.rest!.south!.keypoints[0].x+=0.001;
  await expect(evaluatePoseFit(design,target,refs,records,[],{reuseApprovedSourceRest:true})).rejects.toThrow('changed body, pose');
});
