import { afterEach, expect, test, vi } from 'vitest'
import { addMove, b64, measurementRecoveryPlan, type MoveSpec } from '../../src/studio/create.ts'
import { Queue, queue, requestIdentity, type Deps, type JobRec } from '../../src/lib/pixellab/queue.ts'
import { png, routes } from '../../src/lib/pixellab/routes.ts'
import { LABELS, authoredPoses, fromApi, toApi } from '../../src/lib/rig/poses.ts'
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
async function fixture() {
 const im=makeImg(64,64);for(let y=10;y<60;y++)for(let x=25;x<39;x++)im.data.set([180,140,120,255],(y*64+x)*4)
 const hash=await cellHash(im),points:Keypoint[]=LABELS.map((label,i)=>({label,x:.3+i*.01,y:.3+i*.015})),dirs=['south','east','north','west'] as const
 const rig:Manifest['rig']={cell:{w:64,h:64},pivot:{x:32,y:60},baseHash:hash,baseItem:'base',directions:dirs.map(id=>({id})),animations:[{id:'idle',cells:4,loop:true,frames:[0,1,2,3].map(cell=>({cell,ms:100})),sources:Object.fromEntries(dirs.map(d=>[d,{route:'skeleton-v3',reference:hash,keypoints:[points,points,points,points],measured:[points,points,points,points],motion:'old',provenance:[]}]))}],rest:Object.fromEntries(dirs.map(d=>[d,{image:hash,keypoints:points}]))}
 const manifest:Manifest={format:'pixeldoll/1',name:'Recover',app:'',rig,slots:[],materials:[],presets:[],items:[{id:'base',name:'Body',slot:'body',status:'accepted',mirror:'generate',prompt:'body',materials:[],baseHash:hash,provenance:[],layers:[{id:'main',role:'fg',z:0,cells:{idle:Object.fromEntries(dirs.map(d=>[d,[hash,hash,hash,hash]]))}}]}]}
 let saved:projects.StoredProject={id:'rig-recover',savedAt:'old',manifest,character:{id:'managed',looks:'body'},skeletons:{},rigQa:{warnings:[]}}
 const before=structuredClone(saved),records=new Map<string,JobRec>(),blobs=new Map<string,Blob>(),expected=new Map<string,Keypoint[]>();let time=10,posts=0,inflight=0,maxInflight=0,bad=false
 const spec:MoveSpec={id:'idle',action:'idle',frames:4,items:[],seed:23,replace:true,dirs:['east','west'],poseStyle:'visible-side-v1'}
 const lostIds:string[]=[]
 for(const [di,d] of (['east','west'] as const).entries()) {
  const keypoints=authoredPoses('idle',fromApi(points,rig.cell),d,64,spec.poseStyle).map(p=>toApi(p,rig.cell)),outputs=[]
  for(let i=0;i<4;i++){
   const frame=structuredClone(im);frame.data[(10*64+25)*4]=181+di*4+i
   const bytes=await encodePngBytes(frame),sha=await sha256(bytes);blobs.set(sha,new Blob([bytes as Uint8Array<ArrayBuffer>],{type:'image/png'}));outputs.push({label:String(i),sha});expected.set(sha,keypoints[i])
   const measurement=await requestIdentity(routes.estimateSkeleton(png(await b64(frame))))
   if(d==='west') {const id='old-'+i;lostIds.push(id);records.set(id,{id,method:'POST',endpoint:'/estimate-skeleton',label:id,...measurement,state:i<2?'lost':'cancelled',...(i>=2?{autoCancelledAttempts:[23]}:{}),createdAt:time++,attempts:1,nextAt:0,jobs:[],gens:0,usd:0,error:'HTTP 500'})}
  }
  const raw=rawClip({first:await b64(im),rest:points,keypoints,description:'body',action:'breathing idle, empty hands, no weapon, no props, no effects',dir:d,seed:spec.seed+101})
  records.set('raw-'+d,{id:'raw-'+d,label:'raw '+d,method:'POST',endpoint:raw.path,...await requestIdentity(raw),state:'done',createdAt:time++,attempts:1,nextAt:0,jobs:[{id:'remote-'+d,status:'completed',done:true,results:outputs}],gens:3,usd:0})
 }
 const deps:Partial<Deps>={locks:null,online:()=>true,now:()=>++time,
  put:async(id,r)=>{records.set(id,structuredClone(r))},get:async id=>structuredClone(records.get(id)),all:async()=>[...records.values()].map(r=>structuredClone(r)),
  putBlob:async bytes=>{const h=await sha256(bytes);blobs.set(h,new Blob([bytes as Uint8Array<ArrayBuffer>],{type:'image/png'}));return h},getBlob:async h=>blobs.get(h),
  claimEstimate:async(r,choose)=>{const prior=choose([...records.values()].map(v=>structuredClone(v)));if(prior)return prior;if(records.has(r.id))throw Error('duplicate');records.set(r.id,structuredClone(r));return r},
  api:async<T>(_key:string,_method:string,path:string,body?:unknown):Promise<T>=>{expect(path).toBe('/estimate-skeleton');posts++;inflight++;maxInflight=Math.max(maxInflight,inflight);await new Promise(r=>setTimeout(r,1));const h=await sha256(base64ToBytes((body as {image:{base64:string}}).image.base64));inflight--;const ps=expected.get(h)!;expect(ps).toBeTruthy();return{keypoints:ps.map(p=>({...p,x:bad&&p.label.includes('ARM')?Math.min(1,p.x+.2):p.x})),usage:{type:'generations',generations:.1}} as T}}
 const q=new Queue(deps);q.setKey('synthetic-key');await q.load()
 vi.spyOn(queue,'snapshot').mockImplementation(()=>q.snapshot());vi.spyOn(queue,'settled').mockImplementation(id=>q.settled(id))
 const enqueue=vi.spyOn(queue,'enqueue').mockImplementation(async(...args)=>{const r=await q.enqueue(...args);queueMicrotask(()=>void q.tick());return r})
 vi.spyOn(projects,'loadProject').mockImplementation(async()=>{const rec=structuredClone(saved);return{rec,project:{manifest:rec.manifest,images:new Map([[hash,im]])}}})
 vi.spyOn(db,'get').mockImplementation(async()=>structuredClone(saved));vi.spyOn(db,'getBlob').mockImplementation(async h=>blobs.get(h));const put=vi.spyOn(db,'put').mockResolvedValue(undefined),update=vi.spyOn(db,'update').mockImplementation(async(_s,_id,fn)=>{saved=fn(structuredClone(saved)) as projects.StoredProject})
 return{spec,q,records,blobs,lostIds,before,saved:()=>saved,posts:()=>posts,max:()=>maxInflight,enqueue,put,update,bad:()=>{bad=true},changeRig:()=>{saved.manifest.rig.pivot.x++},addItem:()=>{const it=structuredClone(saved.manifest.items[0]);it.id='hat';it.slot='head';saved.manifest.items.push(it);spec.items=['hat']},recovery:async()=>{const plan=await measurementRecoveryPlan('rig-recover',spec);return{...spec,measurementRecovery:{id:'explicit-review',recordIds:plan.recordIds,rigVersion:plan.rigVersion}}}}
}

test('review is API-free and finds only exact cached raw-frame checks with honest estimates',async()=>{const f=await fixture(),plan=await measurementRecoveryPlan('rig-recover',f.spec);expect(plan).toMatchObject({recordIds:f.lostIds.sort(),checks:8,gens:.8,usd:.04104});expect(plan.rawHashes).toHaveLength(2);expect(f.enqueue).not.toHaveBeenCalled();expect(f.posts()).toBe(0)})

test('explicit recovery reuses both body renders, checks sequentially and publishes genuine measured output',async()=>{const f=await fixture(),spec=await f.recovery(),old=f.lostIds.map(id=>structuredClone(f.records.get(id)));await addMove('rig-recover',spec);expect(f.posts()).toBe(8);expect(f.max()).toBe(1);expect(f.update).toHaveBeenCalledTimes(1);for(let i=0;i<f.lostIds.length;i++)expect(f.records.get(f.lostIds[i])).toEqual(old[i]);expect(f.saved().manifest.rig.animations[0].sources!.east!.measured).toHaveLength(4);expect(f.saved().manifest.rig.animations[0].sources!.west!.measured).toHaveLength(4)})

test('stale rig consent and unrelated reviewed check IDs fail before any enqueue',async()=>{const f=await fixture(),spec=await f.recovery();f.changeRig();await expect(addMove('rig-recover',spec)).rejects.toThrow('changed');expect(f.enqueue).not.toHaveBeenCalled();expect(f.posts()).toBe(0);vi.restoreAllMocks();const g=await fixture(),invalid=await g.recovery();invalid.measurementRecovery.recordIds.push('unrelated');await expect(addMove('rig-recover',invalid)).rejects.toThrow('do not match');expect(g.enqueue).not.toHaveBeenCalled()})

test('missing original raw results or a changed original seed cannot buy replacement artwork',async()=>{const f=await fixture();f.records.delete('raw-west');await f.q.sync();await expect(measurementRecoveryPlan('rig-recover',f.spec)).rejects.toThrow('unavailable');expect(f.enqueue).not.toHaveBeenCalled();vi.restoreAllMocks();const g=await fixture();await expect(measurementRecoveryPlan('rig-recover',{...g.spec,seed:99})).rejects.toThrow('unavailable');expect(g.posts()).toBe(0)})

test('bad real recovered measurements never trigger an uncached raw reroll or publish a weakened result',async()=>{const f=await fixture(),spec=await f.recovery();f.bad();await expect(addMove('rig-recover',spec)).rejects.toThrow('cannot generate or re-roll');expect(f.enqueue.mock.calls.filter(([r])=>r.path==='/animate-with-skeleton-v3')).toHaveLength(2);expect(f.posts()).toBeLessThanOrEqual(8);expect(f.put).not.toHaveBeenCalled();expect(f.update).not.toHaveBeenCalled();expect(f.saved()).toEqual(f.before)})


test('body publication receipt survives a failed item step and resumes only missing equipment without rerender',async()=>{
 const f=await fixture();f.addItem();const spec=await f.recovery();const pose=vi.spyOn(itemRun,'poseItemClip').mockRejectedValueOnce(Error('synthetic item failure')).mockResolvedValue({} as Awaited<ReturnType<typeof itemRun.poseItemClip>>)
 await expect(addMove('rig-recover',spec)).rejects.toThrow('synthetic item failure');expect(f.posts()).toBe(8);expect(f.saved().moveRecovery?.id).toBe('explicit-review');const published=structuredClone(f.saved().manifest.rig)
 const calls=f.enqueue.mock.calls.length;await addMove('rig-recover',spec);expect(f.posts()).toBe(8);expect(f.enqueue.mock.calls).toHaveLength(calls);expect(f.saved().manifest.rig).toEqual(published);expect(pose).toHaveBeenCalledTimes(2)
})
