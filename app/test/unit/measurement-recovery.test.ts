import { accountBalance } from './account-fixture.ts'
import { afterEach, expect, test, vi } from 'vitest'
import { addMove, b64, bodyPaletteRepairPlan, measurementRecoveryPlan, type MoveSpec } from '../../src/studio/create.ts'
import { Queue, queue, requestIdentity, type Deps, type JobRec } from '../../src/lib/pixellab/queue.ts'
import { ApiError } from '../../src/lib/pixellab/client.ts'
import { png, routes } from '../../src/lib/pixellab/routes.ts'
import { LABELS, authoredPoses, fromApi, toApi } from '../../src/lib/rig/poses.ts'
import { repairBodyPalette } from '../../src/lib/rig/palette.ts'
import { rawClip } from '../../src/lib/rig/clips.ts'
import { cellHash, type Keypoint } from '../../src/lib/rig/rig.ts'
import { makeImg, base64ToBytes } from '../../src/lib/image/png.ts'
import { encodePngBytes } from '../../src/lib/image/pngraw.ts'
import { sha256 } from '../../src/lib/image/hash.ts'
import * as db from '../../src/lib/store/db.ts'
import * as projects from '../../src/lib/store/project.ts'
import type { Manifest } from '../../src/lib/store/manifest.ts'
import * as itemRun from '../../src/lib/items/run.ts'

afterEach(()=>vi.restoreAllMocks())
async function fixture(palette:boolean|'partial'=false) {
 const im=makeImg(64,64);for(let y=10;y<60;y++)for(let x=25;x<39;x++)im.data.set([180,140,120,255],(y*64+x)*4)
 if(palette)im.data.set([0,0,0,255],(10*64+25)*4)
 const hash=await cellHash(im),points:Keypoint[]=LABELS.map((label,i)=>({label,x:.3+i*.01,y:.3+i*.015})),dirs=['south','east','north','west'] as const
 const rig:Manifest['rig']={cell:{w:64,h:64},pivot:{x:32,y:60},baseHash:hash,baseItem:'base',directions:dirs.map(id=>({id})),animations:[{id:'idle',cells:4,loop:true,frames:[0,1,2,3].map(cell=>({cell,ms:100})),sources:Object.fromEntries(dirs.map(d=>[d,{route:'skeleton-v3',reference:hash,keypoints:[points,points,points,points],measured:[points,points,points,points],motion:'old',provenance:[]}]))}],rest:Object.fromEntries(dirs.map(d=>[d,{image:hash,keypoints:points}]))}
 const manifest:Manifest={format:'pixeldoll/1',name:'Recover',app:'',rig,slots:[],materials:[],presets:[],items:[{id:'base',name:'Body',slot:'body',status:'accepted',mirror:'generate',prompt:'body',materials:[],baseHash:hash,provenance:[],layers:[{id:'main',role:'fg',z:0,cells:{idle:Object.fromEntries(dirs.map(d=>[d,[hash,hash,hash,hash]]))}}]}]}
 let saved:projects.StoredProject={id:'rig-recover',savedAt:'old',manifest,character:{id:'managed',looks:'body'},skeletons:{},rigQa:{warnings:[]}}
 const before=structuredClone(saved),records=new Map<string,JobRec>(),blobs=new Map<string,Blob>(),expected=new Map<string,Keypoint[]>();let time=10,posts=0,inflight=0,maxInflight=0,bad=false,failOnce=false
 const spec:MoveSpec={id:'idle',action:'idle',frames:4,items:[],seed:23,replace:true,dirs:['east','west'],poseStyle:'visible-side-v1'}
 const lostIds:string[]=[]
 for(const [di,d] of (['east','west'] as const).entries()) {
  const keypoints=authoredPoses('idle',fromApi(points,rig.cell),d,64,spec.poseStyle).map(p=>toApi(p,rig.cell)),outputs=[],frames=[]
  for(let i=0;i<4;i++){
   const frame=structuredClone(im);frame.data[(10*64+26)*4]=181+di*4+i
   if(palette&&d==='west'&&i>0)for(let j=0;j<(palette==='partial'?40:30);j++){const x=25+j%14,y=12+Math.floor(j/14);frame.data.set(palette==='partial'&&j>=5?[40,0,0,255]:[13,5,2,255],(y*64+x)*4)}
   frames.push(frame)
   const bytes=await encodePngBytes(frame),sha=await sha256(bytes);blobs.set(sha,new Blob([bytes as Uint8Array<ArrayBuffer>],{type:'image/png'}));outputs.push({label:String(i),sha});expected.set(sha,keypoints[i])
   const measurement=await requestIdentity(routes.estimateSkeleton(png(await b64(frame))))
   if(d==='west') {const id='old-'+i;lostIds.push(id);records.set(id,{id,method:'POST',endpoint:'/estimate-skeleton',label:id,...measurement,state:i<2?'lost':'cancelled',...(i>=2?{autoCancelledAttempts:[23]}:{}),createdAt:time++,attempts:1,nextAt:0,jobs:[],gens:0,usd:0,error:'HTTP 500'})}
  }
  if(palette&&d==='west'){const fixed=repairBodyPalette(im,frames);for(let i=0;i<fixed.frames.length;i++)expected.set(await sha256(await encodePngBytes(fixed.frames[i])),keypoints[i])}
  const raw=rawClip({first:await b64(im),rest:points,keypoints,description:'body',action:'breathing idle, empty hands, no weapon, no props, no effects',dir:d,seed:spec.seed+101})
  records.set('raw-'+d,{id:'raw-'+d,label:'raw '+d,method:'POST',endpoint:raw.path,...await requestIdentity(raw),state:'done',createdAt:time++,attempts:1,nextAt:0,jobs:[{id:'remote-'+d,status:'completed',done:true,results:outputs}],gens:3,usd:0})
 }
 const deps:Partial<Deps>={locks:null,online:()=>true,now:()=>++time,
  put:async(id,r)=>{records.set(id,structuredClone(r))},get:async id=>structuredClone(records.get(id)),all:async()=>[...records.values()].map(r=>structuredClone(r)),
  putBlob:async bytes=>{const h=await sha256(bytes);blobs.set(h,new Blob([bytes as Uint8Array<ArrayBuffer>],{type:'image/png'}));return h},getBlob:async h=>blobs.get(h),
  claimEstimate:async(r,choose)=>{const prior=choose([...records.values()].map(v=>structuredClone(v)));if(prior)return prior;if(records.has(r.id))throw Error('duplicate');records.set(r.id,structuredClone(r));return r},
  api:async<T>(_key:string,_method:string,path:string,body?:unknown):Promise<T>=>{if(path==='/balance')return accountBalance as T;expect(path).toBe('/estimate-skeleton');posts++;inflight++;maxInflight=Math.max(maxInflight,inflight);await new Promise(r=>setTimeout(r,1));const h=await sha256(base64ToBytes((body as {image:{base64:string}}).image.base64));inflight--;if(failOnce){failOnce=false;throw new ApiError(500,'retry','HTTP 500')}const ps=expected.get(h)!;expect(ps).toBeTruthy();return{keypoints:ps.map(p=>({...p,x:bad&&p.label.includes('ARM')?Math.min(1,p.x+.2):p.x})),usage:{type:'generations',generations:.1}} as T}}
 const q=new Queue(deps);q.setKey('synthetic-key');await q.load()
 const finishOriginalChecks=async()=>{for(const raw of [...records.values()].filter(r=>r.endpoint==='/animate-with-skeleton-v3'))for(const out of raw.jobs[0].results){const bytes=new Uint8Array(await blobs.get(out.sha)!.arrayBuffer());const request=routes.estimateSkeleton(png(await b64(await (await import('../../src/lib/image/png.ts')).decodePng(new Blob([bytes])))));await q.enqueue(request,{estimateRetry:{id:'original-checks',recordIds:lostIds}});await q.tick()}}
 vi.spyOn(queue,'snapshot').mockImplementation(()=>q.snapshot());vi.spyOn(queue,'settled').mockImplementation(id=>q.settled(id))
 const enqueue=vi.spyOn(queue,'enqueue').mockImplementation(async(...args)=>{const r=await q.enqueue(...args);queueMicrotask(()=>void q.tick());return r})
 vi.spyOn(projects,'loadProject').mockImplementation(async()=>{const rec=structuredClone(saved);return{rec,project:{manifest:rec.manifest,images:new Map([[hash,im]])}}})
 vi.spyOn(db,'updateCharacter').mockImplementation(async(_id,_blobs,change)=>{saved=change(structuredClone(saved)) as projects.StoredProject});
 vi.spyOn(db,'get').mockImplementation(async()=>structuredClone(saved));vi.spyOn(db,'getBlob').mockImplementation(async h=>blobs.get(h));const put=vi.spyOn(db,'put').mockResolvedValue(undefined),update=vi.spyOn(db,'update').mockImplementation(async(_s,_id,fn)=>{saved=fn(structuredClone(saved)) as projects.StoredProject})
 return{spec,q,records,blobs,lostIds,finishOriginalChecks,before,saved:()=>saved,posts:()=>posts,max:()=>maxInflight,enqueue,put,update,bad:()=>{bad=true},failCheck:()=>{failOnce=true},changeRig:()=>{saved.manifest.rig.pivot.x++},addItem:()=>{const it=structuredClone(saved.manifest.items[0]);it.id='hat';it.slot='head';saved.manifest.items.push(it);spec.items=['hat']},recovery:async()=>{const plan=await measurementRecoveryPlan('rig-recover',spec);return{...spec,measurementRecovery:{id:'explicit-review',recordIds:plan.recordIds,rigVersion:plan.rigVersion}}}}
}

test('review is API-free and finds only exact cached raw-frame checks with honest estimates',async()=>{const f=await fixture(),plan=await measurementRecoveryPlan('rig-recover',f.spec);expect(plan).toMatchObject({recordIds:f.lostIds.sort(),checks:8,gens:.8,usd:.04104});expect(plan.rawHashes).toHaveLength(2);expect(f.enqueue).not.toHaveBeenCalled();expect(f.posts()).toBe(0)})

test('explicit recovery reuses both body renders, checks sequentially and publishes genuine measured output',async()=>{const f=await fixture(),spec=await f.recovery(),old=f.lostIds.map(id=>structuredClone(f.records.get(id)));await addMove('rig-recover',spec);expect(f.posts()).toBe(8);expect(f.max()).toBe(1);expect(f.update).toHaveBeenCalledTimes(1);for(let i=0;i<f.lostIds.length;i++)expect(f.records.get(f.lostIds[i])).toEqual(old[i]);expect(f.saved().manifest.rig.animations[0].sources!.east!.measured).toHaveLength(4);expect(f.saved().manifest.rig.animations[0].sources!.west!.measured).toHaveLength(4)})

test('stale rig consent and unrelated reviewed check IDs fail before any enqueue',async()=>{const f=await fixture(),spec=await f.recovery();f.changeRig();await expect(addMove('rig-recover',spec)).rejects.toThrow('changed');expect(f.enqueue).not.toHaveBeenCalled();expect(f.posts()).toBe(0);vi.restoreAllMocks();const g=await fixture(),invalid=await g.recovery();invalid.measurementRecovery.recordIds.push('unrelated');await expect(addMove('rig-recover',invalid)).rejects.toThrow('do not match');expect(g.enqueue).not.toHaveBeenCalled()})

test('missing original raw results or a changed original seed cannot buy replacement artwork',async()=>{const f=await fixture();f.records.delete('raw-west');await f.q.sync();await expect(measurementRecoveryPlan('rig-recover',f.spec)).rejects.toThrow('unavailable');expect(f.enqueue).not.toHaveBeenCalled();vi.restoreAllMocks();const g=await fixture();await expect(measurementRecoveryPlan('rig-recover',{...g.spec,seed:99})).rejects.toThrow('unavailable');expect(g.posts()).toBe(0)})

test('bad real recovered measurements never trigger an uncached raw reroll or publish a weakened result',async()=>{const f=await fixture(),spec=await f.recovery();f.bad();await expect(addMove('rig-recover',spec)).rejects.toThrow('replacement still fails body-pose quality checks');expect(f.enqueue.mock.calls.filter(([r])=>r.path==='/animate-with-skeleton-v3')).toHaveLength(2);expect(f.posts()).toBeLessThanOrEqual(8);expect(f.put).not.toHaveBeenCalled();expect(f.update).not.toHaveBeenCalled();expect(f.saved()).toEqual(f.before)})


test('body publication receipt survives a failed item step and resumes only missing equipment without rerender',async()=>{
 const f=await fixture();f.addItem();const spec=await f.recovery();const pose=vi.spyOn(itemRun,'poseItemClip').mockRejectedValueOnce(Error('synthetic item failure')).mockResolvedValue({} as Awaited<ReturnType<typeof itemRun.poseItemClip>>)
 await expect(addMove('rig-recover',spec)).rejects.toThrow('synthetic item failure');expect(f.posts()).toBe(8);expect(f.saved().moveRecovery?.id).toBe('explicit-review');const published=structuredClone(f.saved().manifest.rig)
 const calls=f.enqueue.mock.calls.length;await addMove('rig-recover',spec);expect(f.posts()).toBe(8);expect(f.enqueue.mock.calls).toHaveLength(calls);expect(f.saved().manifest.rig).toEqual(published);expect(pose).toHaveBeenCalledTimes(2)
})


test('bounded color plan is API-free and reuses complete real original measurements',async()=>{
 const f=await fixture(true);await expect(bodyPaletteRepairPlan('rig-recover',f.spec)).rejects.toThrow('all original joint checks');await f.finishOriginalChecks();const before=f.posts(),plan=await bodyPaletteRepairPlan('rig-recover',f.spec)
 expect(plan.directions).toEqual(['west']);expect(plan.changedPixels).toBe(90);expect(plan.rawOutliers).toBe(90);expect(plan.remainingOutliers).toBe(0);expect(plan.changedFrames).toBe(3);expect(plan.checks).toBe(3);expect(plan.gens).toBeCloseTo(.3);expect(f.posts()).toBe(before)
})

test('color repair remeasures only changed PNGs and persists exact raw/final provenance without body generation',async()=>{
 const f=await fixture(true);await f.finishOriginalChecks();const plan=await bodyPaletteRepairPlan('rig-recover',f.spec),before=f.posts()
 const spec:MoveSpec={...f.spec,bodyPaletteRepair:{id:'color-consent',version:'near-rest-v1',rigVersion:plan.rigVersion}};await addMove('rig-recover',spec)
 expect(f.posts()-before).toBe(3);expect(f.max()).toBe(1);const source=f.saved().manifest.rig.animations[0].sources!.west!,processing=source.processing!
 expect(processing).toMatchObject({version:'near-rest-v1',changedPixels:90,rawOutliers:90,remainingOutliers:0,changedFrames:[1,2,3]});expect(processing.rawPaletteFit).toBeLessThan(.97)
 expect(processing.inputHashes[0]).toBe(processing.rawInputHashes[0]);for(const i of [1,2,3])expect(processing.inputHashes[i]).not.toBe(processing.rawInputHashes[i]);expect(source.measured).toHaveLength(4);expect(f.saved().manifest.rig.animations[0].sources!.east!.processing).toBeUndefined()
 const calls=f.enqueue.mock.calls.length;await addMove('rig-recover',spec);expect(f.posts()-before).toBe(3);expect(f.enqueue.mock.calls).toHaveLength(calls);expect(f.saved().moveRecovery?.id).toBe('color-consent')
})

test('palette-only repair refuses failed real pose checks before buying any color check',async()=>{const f=await fixture(true);f.bad();await f.finishOriginalChecks();const before=f.posts();await expect(bodyPaletteRepairPlan('rig-recover',f.spec)).rejects.toThrow('cannot repair pose');expect(f.posts()).toBe(before);expect(f.update).not.toHaveBeenCalled()})


test('unknown corrected-PNG checks require new explicit consent and never reopen body renders',async()=>{
 const f=await fixture(true);await f.finishOriginalChecks();const plan=await bodyPaletteRepairPlan('rig-recover',f.spec),before=f.posts()
 const spec:MoveSpec={...f.spec,bodyPaletteRepair:{id:'color-consent',version:'near-rest-v1',rigVersion:plan.rigVersion}};f.failCheck();await expect(addMove('rig-recover',spec)).rejects.toThrow('lost');expect(f.posts()-before).toBe(1);expect(f.update).not.toHaveBeenCalled()
 await expect(addMove('rig-recover',spec)).rejects.toThrow('lost');expect(f.posts()-before).toBe(1)
 const retry=await measurementRecoveryPlan('rig-recover',spec);expect(retry.recordIds).toHaveLength(1);expect(retry.checks).toBe(3)
 await addMove('rig-recover',{...spec,measurementRecovery:{id:'explicit-corrected-checks',recordIds:retry.recordIds,rigVersion:retry.rigVersion}})
 expect(f.posts()-before).toBe(4);expect(f.saved().manifest.rig.animations[0].sources!.west!.processing?.changedPixels).toBe(90);expect(f.saved().moveRecovery?.id).toBe('explicit-corrected-checks')
})


test('known insufficient bounded color correction refuses new paid measurements before enqueue',async()=>{
 const f=await fixture('partial');await f.finishOriginalChecks();const before=f.posts(),enqueues=f.enqueue.mock.calls.length
 await expect(bodyPaletteRepairPlan('rig-recover',f.spec)).rejects.toThrow('still fails the palette quality check')
 expect(f.posts()).toBe(before);expect(f.enqueue.mock.calls).toHaveLength(enqueues);expect(f.update).not.toHaveBeenCalled()
})
