import { accountBalance } from './account-fixture.ts'
import { afterEach, expect, test, vi } from 'vitest'
import { addMove, b64, bodyPaletteRepairPlan, measurementRecoveryPlan, parallelGeneration, reviewMoveRecovery, run, type MoveSpec } from '../../src/studio/create.ts'
import { Queue, queue, requestIdentity, type Deps, type JobRec } from '../../src/lib/pixellab/queue.ts'
import { ApiError } from '../../src/lib/pixellab/client.ts'
import { png, routes } from '../../src/lib/pixellab/routes.ts'
import { LABELS, authoredPoses, fromApi, toApi } from '../../src/lib/rig/poses.ts'
import { repairBodyPalette } from '../../src/lib/rig/palette.ts'
import { rawClip } from '../../src/lib/rig/clips.ts'
import { cellHash, type Keypoint } from '../../src/lib/rig/rig.ts'
import { makeImg, base64ToBytes, decodePng } from '../../src/lib/image/png.ts'
import { encodePngBytes } from '../../src/lib/image/pngraw.ts'
import { sha256 } from '../../src/lib/image/hash.ts'
import * as db from '../../src/lib/store/db.ts'
import * as projects from '../../src/lib/store/project.ts'
import type { Manifest } from '../../src/lib/store/manifest.ts'
import * as itemRun from '../../src/lib/items/run.ts'

afterEach(()=>vi.restoreAllMocks())
async function fixture(palette:boolean|'partial'|'broad'=false) {
 const im=makeImg(64,64);for(let y=10;y<60;y++)for(let x=25;x<39;x++)im.data.set([180,140,120,255],(y*64+x)*4)
 if(palette)im.data.set([0,0,0,255],(10*64+25)*4)
 const hash=await cellHash(im),points:Keypoint[]=LABELS.map((label,i)=>({label,x:.3+i*.01,y:.3+i*.015})),dirs=['south','east','north','west'] as const
 const rig:Manifest['rig']={cell:{w:64,h:64},pivot:{x:32,y:60},baseHash:hash,baseItem:'base',directions:dirs.map(id=>({id})),animations:[{id:'idle',cells:4,loop:true,frames:[0,1,2,3].map(cell=>({cell,ms:100})),sources:Object.fromEntries(dirs.map(d=>[d,{route:'skeleton-v3',reference:hash,keypoints:[points,points,points,points],measured:[points,points,points,points],motion:'old',provenance:[]}]))}],rest:Object.fromEntries(dirs.map(d=>[d,{image:hash,keypoints:points}]))}
 const manifest:Manifest={format:'pixeldoll/1',name:'Recover',app:'',rig,slots:[],materials:[],presets:[],items:[{id:'base',name:'Body',slot:'body',status:'accepted',mirror:'generate',prompt:'body',materials:[],baseHash:hash,provenance:[],layers:[{id:'main',role:'fg',z:0,cells:{idle:Object.fromEntries(dirs.map(d=>[d,[hash,hash,hash,hash]]))}}]}]}
 let saved:projects.StoredProject={id:'rig-recover',savedAt:'old',manifest,character:{id:'managed',looks:'body'},skeletons:{},rigQa:{warnings:[]}}
 const before=structuredClone(saved),records=new Map<string,JobRec>(),blobs=new Map<string,Blob>(),expected=new Map<string,Keypoint[]>();let time=10,posts=0,inflight=0,maxInflight=0,bad=false,failOnce=false
 blobs.set(hash.slice(7),new Blob([await encodePngBytes(im) as Uint8Array<ArrayBuffer>],{type:'image/png'}))
 const spec:MoveSpec={id:'idle',action:'idle',frames:4,items:[],seed:23,replace:true,dirs:['east','west'],poseStyle:'visible-side-v1'}
 const lostIds:string[]=[]
 for(const [di,d] of (['east','west'] as const).entries()) {
  const keypoints=authoredPoses('idle',fromApi(points,rig.cell),d,64,spec.poseStyle).map(p=>toApi(p,rig.cell)),outputs=[],frames=[]
  for(let i=0;i<4;i++){
   const frame=structuredClone(im);frame.data[(10*64+26)*4]=181+di*4+i
   if(palette&&d==='west'&&i>0)for(let j=0;j<(palette==='partial'?40:palette==='broad'?60:30);j++){const x=25+j%14,y=12+Math.floor(j/14);frame.data.set(palette==='partial'&&j>=5?[40,0,0,255]:[13,5,2,255],(y*64+x)*4)}
   frames.push(frame)
   const bytes=await encodePngBytes(frame),sha=await sha256(bytes);blobs.set(sha,new Blob([bytes as Uint8Array<ArrayBuffer>],{type:'image/png'}));outputs.push({label:String(i),sha});expected.set(sha,keypoints[i])
   const measurement=await requestIdentity(routes.estimateSkeleton(png(await b64(frame))))
   if(d==='west') {const id='old-'+i;lostIds.push(id);records.set(id,{id,method:'POST',endpoint:'/estimate-skeleton',label:id,...measurement,state:i<2?'lost':'canceled',...(i>=2?{autoCanceledAttempts:[23]}:{}),createdAt:time++,attempts:1,nextAt:0,jobs:[],gens:0,usd:0,error:'HTTP 500'})}
  }
  if(palette&&palette!=='broad'&&d==='west'){const fixed=repairBodyPalette(im,frames);for(let i=0;i<fixed.frames.length;i++)expected.set(await sha256(await encodePngBytes(fixed.frames[i])),keypoints[i])}
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
 // Queue.tick() returns early while another tick's work() runs, so this wake-up relies on work() awaiting only microtasks
 // (fake storage and API). If work() ever awaits a timer or real IndexedDB, a lost wake-up leaves the job queued and the test fails loudly.
 const enqueue=vi.spyOn(queue,'enqueue').mockImplementation(async(...args)=>{const r=await q.enqueue(...args);queueMicrotask(()=>void q.tick());return r})
 vi.spyOn(projects,'loadProject').mockImplementation(async()=>{const rec=structuredClone(saved);return{rec,project:{manifest:rec.manifest,images:new Map([[hash,im]])}}})
 vi.spyOn(db,'updateCharacter').mockImplementation(async(_id,_blobs,change)=>{saved=change(structuredClone(saved)) as projects.StoredProject});
 vi.spyOn(db,'get').mockImplementation(async()=>structuredClone(saved));vi.spyOn(db,'getBlob').mockImplementation(async h=>blobs.get(h));const put=vi.spyOn(db,'put').mockResolvedValue(undefined),update=vi.spyOn(db,'update').mockImplementation(async(_s,_id,fn)=>{saved=fn(structuredClone(saved)) as projects.StoredProject})
 return{spec,q,records,blobs,lostIds,finishOriginalChecks,before,saved:()=>saved,posts:()=>posts,max:()=>maxInflight,enqueue,put,update,bad:()=>{bad=true},failCheck:()=>{failOnce=true},changeRig:()=>{saved.manifest.rig.pivot.x++},addItem:()=>{const it=structuredClone(saved.manifest.items[0]);it.id='hat';it.slot='head';saved.manifest.items.push(it);spec.items=['hat']},recovery:async()=>{const plan=await measurementRecoveryPlan('rig-recover',spec);return{...spec,measurementRecovery:{id:'explicit-review',recordIds:plan.recordIds,checkHashes:plan.checkHashes,rigVersion:plan.rigVersion}}}}
}

function addUnrelatedMove(record: projects.StoredProject) {
 const animation = structuredClone(record.manifest.rig.animations[0])
 const original = animation.id; animation.id = 'another-move'
 record.manifest.rig.animations.push(animation)
 for (const layer of record.manifest.items.find(item => item.id === record.manifest.rig.baseItem)!.layers) layer.cells![animation.id] = structuredClone(layer.cells![original])
}

test('review is API-free and finds only exact cached raw-frame checks with honest estimates',async()=>{const f=await fixture(),plan=await measurementRecoveryPlan('rig-recover',f.spec);expect(plan).toMatchObject({recordIds:f.lostIds.sort(),checks:8,gens:.8,usd:.04104});expect(plan.rawHashes).toHaveLength(2);expect(f.enqueue).not.toHaveBeenCalled();expect(f.posts()).toBe(0)})

test('recovery reads only selected standing and cached raw images, never the full equipment project', async () => {
 const f = await fixture()
 vi.mocked(projects.loadProject).mockRejectedValue(new Error('Unrelated equipment must not be decoded'))
 const plan = await measurementRecoveryPlan('rig-recover', f.spec)
 expect(plan.recordIds).toEqual(f.lostIds.sort())
 expect(projects.loadProject).not.toHaveBeenCalled()
 expect(db.getBlob).toHaveBeenCalledTimes(9)
 expect(f.enqueue).not.toHaveBeenCalled()
})

test('one combined review skips color work while joint checks are unfinished and decodes repeated images once', async () => {
 const f = await fixture(), first = f.records.get('raw-west')!.jobs[0].results[0].sha
 for (const raw of ['raw-east', 'raw-west']) for (const result of f.records.get(raw)!.jobs[0].results) result.sha = first
 await f.q.sync()
 const review = await reviewMoveRecovery('rig-recover', f.spec)
 expect(review.recovery).toMatchObject({ recordIds: ['old-0'], checks: 1 })
 expect(review.colorRepair).toBeUndefined()
 expect(db.getBlob).toHaveBeenCalledTimes(2)
 expect(f.enqueue).not.toHaveBeenCalled()
})

test('combined review distinguishes ineligibility from real storage failures and does not cache across reviews', async () => {
 const f = await fixture()
 expect(await reviewMoveRecovery('rig-recover', { ...f.spec, action: undefined })).toEqual({})
 f.records.delete('raw-west'); await f.q.sync()
 expect((await reviewMoveRecovery('rig-recover', f.spec)).unavailable).toContain('unavailable')
 vi.mocked(db.getBlob).mockRejectedValue(new Error('Storage read failed'))
 await expect(reviewMoveRecovery('rig-recover', f.spec)).rejects.toThrow('Storage read failed')
 expect(f.posts()).toBe(0)
})

test('combined review shares image reads with color checking after all original joint checks finish', async () => {
 const f = await fixture(true); await f.finishOriginalChecks()
 vi.mocked(db.getBlob).mockClear()
 const before = f.posts(), review = await reviewMoveRecovery('rig-recover', f.spec)
 expect(review.recovery).toBeUndefined()
 expect(review.colorRepair).toMatchObject({ directions: ['west'], changedPixels: 90, checks: 3 })
 expect(db.getBlob).toHaveBeenCalledTimes(9)
 expect(f.posts()).toBe(before)
})

test('completed original checks with no color drift need no recovery notice', async () => {
 const f = await fixture(); await f.finishOriginalChecks()
 const before = f.posts()
 expect(await reviewMoveRecovery('rig-recover', f.spec)).toEqual({})
 await expect(bodyPaletteRepairPlan('rig-recover', f.spec)).rejects.toThrow('No palette-only body failure')
 expect(f.posts()).toBe(before)
})

test('broad color drift is an explained policy limit rather than a failed cached-frame check', async () => {
 const f = await fixture('broad'); await f.finishOriginalChecks()
 const before = f.posts(), review = await reviewMoveRecovery('rig-recover', f.spec)
 expect(review).toEqual({ unavailable: 'Too much color drift for a small palette repair. Existing artwork was kept.' })
 expect(f.posts()).toBe(before)
})

test('explicit recovery reuses both body renders, checks sequentially and publishes genuine measured output',async()=>{const f=await fixture(),spec=await f.recovery(),old=f.lostIds.map(id=>structuredClone(f.records.get(id)));await addMove('rig-recover',spec);expect(f.posts()).toBe(8);expect(f.max()).toBe(1);expect(f.update).toHaveBeenCalledTimes(1);for(let i=0;i<f.lostIds.length;i++)expect(f.records.get(f.lostIds[i])).toEqual(old[i]);expect(f.saved().manifest.rig.animations[0].sources!.east!.measured).toHaveLength(4);expect(f.saved().manifest.rig.animations[0].sources!.west!.measured).toHaveLength(4)})

test('stale rig consent and unrelated reviewed check IDs fail before any enqueue',async()=>{const f=await fixture(),spec=await f.recovery();f.changeRig();await expect(addMove('rig-recover',spec)).rejects.toThrow('changed');expect(f.enqueue).not.toHaveBeenCalled();expect(f.posts()).toBe(0);vi.restoreAllMocks();const g=await fixture(),invalid=await g.recovery();invalid.measurementRecovery.recordIds.push('unrelated');await expect(addMove('rig-recover',invalid)).rejects.toThrow('do not match');expect(g.enqueue).not.toHaveBeenCalled()})

test('an unrelated move invalidates old consent but permits a fresh exact-frame review and new consent', async () => {
 const f = await fixture(), spec = await f.recovery()
 addUnrelatedMove(f.saved())
 await expect(addMove('rig-recover', spec)).rejects.toThrow('changed')
 expect(f.enqueue).not.toHaveBeenCalled()
 const fresh = (await reviewMoveRecovery('rig-recover', spec)).recovery!
 expect(fresh).toMatchObject({ recordIds: f.lostIds.sort(), checks: 8 })
 expect(fresh.rigVersion).not.toBe(spec.measurementRecovery.rigVersion)
 expect(f.posts()).toBe(0)
 await addMove('rig-recover', { ...spec, measurementRecovery: { id: 'fresh-explicit-review', recordIds: fresh.recordIds, checkHashes: fresh.checkHashes, rigVersion: fresh.rigVersion } })
 expect(f.posts()).toBe(8)
 expect(f.saved().moveRecovery?.id).toBe('fresh-explicit-review')
})

test('an interrupted joint-recovery publication can offer already measured cached frames after an unrelated move', async () => {
 const f = await fixture(), spec = await f.recovery()
 await expect(addMove('rig-recover', spec, progress => { if (progress.step === 'save') throw new Error('Interrupted before body publication') })).rejects.toThrow('Interrupted before body publication')
 expect(f.posts()).toBe(8); expect(f.saved().moveRecovery).toBeUndefined()
 addUnrelatedMove(f.saved())
 await expect(addMove('rig-recover', spec)).rejects.toThrow('changed')
 const fresh = await measurementRecoveryPlan('rig-recover', { ...spec, measurementRecovery: undefined })
 expect(fresh).toMatchObject({ checks: 0, recordIds: [], gens: 0, usd: 0 })
 const reviewed = (await reviewMoveRecovery('rig-recover', spec)).recovery!
 expect(reviewed).toBeDefined(); expect(reviewed.rawHashes).toEqual(fresh.rawHashes)
 expect(reviewed.rigVersion).toBe(fresh.rigVersion)
 const calls = f.enqueue.mock.calls.length
 await addMove('rig-recover', { ...spec, measurementRecovery: { id: 'cached-body-consent', recordIds: [], checkHashes: reviewed.checkHashes, rigVersion: reviewed.rigVersion } })
 expect(f.posts()).toBe(8); expect(f.enqueue.mock.calls).toHaveLength(calls)
 expect(f.saved().moveRecovery?.id).toBe('cached-body-consent')
})

test.each([false, true])('empty reviewed IDs cannot authorize unfinished or unknown joint checks (missing=%s)', async missing => {
 const f = await fixture(), plan = await measurementRecoveryPlan('rig-recover', f.spec)
 if (missing) {
  for (const record of f.records.values()) if (record.endpoint === '/estimate-skeleton') f.records.delete(record.id)
  await f.q.sync()
 }
 await expect(addMove('rig-recover', { ...f.spec, measurementRecovery: { id: 'empty-is-not-paid-consent', recordIds: [], checkHashes: plan.checkHashes, rigVersion: plan.rigVersion } })).rejects.toThrow()
 expect(f.posts()).toBe(0); expect(f.enqueue).not.toHaveBeenCalled()
})

test('cached reuse cannot enqueue a missing measurement removed after its strict preflight', async () => {
 const f = await fixture(); await f.finishOriginalChecks()
 const plan = await measurementRecoveryPlan('rig-recover', f.spec)
 expect(plan.checks).toBe(0)
 const spec: MoveSpec = { ...f.spec, measurementRecovery: { id: 'cached-only-consent', recordIds: [], checkHashes: plan.checkHashes, rigVersion: plan.rigVersion } }
 const load = vi.mocked(projects.loadProject).getMockImplementation()!, before = f.posts()
 let loads = 0
 vi.mocked(projects.loadProject).mockImplementation(async (...args) => {
  if (++loads === 2) {
   // addMove completed the exact, zero-check preflight; remove its cached measurements before body execution.
   for (const record of f.records.values()) if (record.endpoint === '/estimate-skeleton') f.records.delete(record.id)
   await f.q.sync()
  }
  return load(...args)
 })
 await expect(addMove('rig-recover', spec)).rejects.toThrow('Cached joint results changed')
 expect(loads).toBe(2)
 expect(f.posts()).toBe(before); expect(f.enqueue).not.toHaveBeenCalled()
 expect(f.saved().moveRecovery).toBeUndefined()
})

test('a rig change between strict recovery preflight and body execution cannot spend or publish', async () => {
 const f = await fixture(), spec = await f.recovery()
 const load = vi.mocked(projects.loadProject).getMockImplementation()!
 let loads = 0
 vi.mocked(projects.loadProject).mockImplementation(async (...args) => {
  if (++loads === 2) f.changeRig()
  return load(...args)
 })
 await expect(addMove('rig-recover', spec)).rejects.toThrow('changed since these joint checks were reviewed')
 expect(loads).toBe(2)
 expect(f.posts()).toBe(0); expect(f.enqueue).not.toHaveBeenCalled()
 expect(f.update).not.toHaveBeenCalled(); expect(f.saved().moveRecovery).toBeUndefined()
})

test.each(['null', 'primitive', 'missing-records', 'non-array', 'hole', 'giant-hole', 'empty-id', 'numeric-id', 'whitespace-id', 'invalid-record', 'empty-record', 'duplicate', 'invalid-version'] as const)('strict recovery rejects malformed %s intent without spending', async broken => {
 const f = await fixture(), plan = await measurementRecoveryPlan('rig-recover', f.spec)
 const valid = { id: 'reviewed', rigVersion: plan.rigVersion, recordIds: [...f.lostIds], checkHashes: plan.checkHashes }
 let intent: unknown = valid
 if (broken === 'null') intent = null
 if (broken === 'primitive') intent = 'reviewed'
 if (broken === 'missing-records') intent = { id: valid.id, rigVersion: valid.rigVersion }
 if (broken === 'non-array') intent = { ...valid, recordIds: 'old-0' }
 if (broken === 'hole') intent = { ...valid, recordIds: Array<string>(2) }
 if (broken === 'giant-hole') { const ids = Array<string>(2 ** 31); ids[0] = 'old-0'; intent = { ...valid, recordIds: ids } }
 if (broken === 'empty-id') intent = { ...valid, id: '' }
 if (broken === 'numeric-id') intent = { ...valid, id: 42 }
 if (broken === 'whitespace-id') intent = { ...valid, id: ' ' }
 if (broken === 'invalid-record') intent = { ...valid, recordIds: [42] }
 if (broken === 'empty-record') intent = { ...valid, recordIds: [''] }
 if (broken === 'duplicate') intent = { ...valid, recordIds: ['old-0', 'old-0'] }
 if (broken === 'invalid-version') intent = { ...valid, rigVersion: 42 }
 const spec = { ...f.spec, measurementRecovery: intent } as unknown as MoveSpec
 await expect(measurementRecoveryPlan('rig-recover', spec)).rejects.toThrow('recovery intent is invalid')
 await expect(addMove('rig-recover', spec)).rejects.toThrow('recovery intent is invalid')
 expect(f.posts()).toBe(0); expect(f.enqueue).not.toHaveBeenCalled(); expect(f.update).not.toHaveBeenCalled()
})

test.each([{}, { recordIds: [] }, { id: 'old', rigVersion: 'old' }])('a fresh API-free review ignores malformed old consent %j but execution never trusts it', async intent => {
 const f = await fixture()
 const spec = { ...f.spec, measurementRecovery: intent } as unknown as MoveSpec
 expect((await reviewMoveRecovery('rig-recover', spec)).recovery).toMatchObject({ checks: 8, recordIds: f.lostIds.sort() })
 await expect(addMove('rig-recover', spec)).rejects.toThrow('recovery intent is invalid')
 expect(f.posts()).toBe(0); expect(f.enqueue).not.toHaveBeenCalled()
})

test.each(['before-preflight', 'after-preflight'] as const)('a priced recovery cannot buy a previously completed check evicted %s', async timing => {
 const f = await fixture(); await f.finishOriginalChecks()
 const completed = [...f.records.values()].filter(record => record.endpoint === '/estimate-skeleton' && record.state === 'done')
 const forbidden = completed[0].requestHash
 f.records.delete(completed.at(-1)!.id); await f.q.sync()
 const spec = await f.recovery(), plan = await measurementRecoveryPlan('rig-recover', f.spec)
 expect(plan.checks).toBe(1)
 const evict = async () => {
  for (const record of f.records.values()) if (record.requestHash === forbidden) f.records.delete(record.id)
  await f.q.sync()
 }
 if (timing === 'before-preflight') await evict()
 else {
  const load = vi.mocked(projects.loadProject).getMockImplementation()!
  let loads = 0
  vi.mocked(projects.loadProject).mockImplementation(async (...args) => { if (++loads === 2) await evict(); return load(...args) })
 }
 const before = f.posts()
 await expect(addMove('rig-recover', spec)).rejects.toThrow()
 const submitted = await Promise.all(f.enqueue.mock.calls.map(async ([request]) => (await requestIdentity(request)).requestHash))
 expect(submitted).not.toContain(forbidden)
 if (timing === 'before-preflight') expect(f.posts()).toBe(before)
 else expect(f.posts() - before).toBeLessThanOrEqual(1)
 expect(f.saved().moveRecovery).toBeUndefined()
})

test.each([false, true])('a reviewed measurement hash is consumed once even if its completed row later disappears (already completed=%s)', async cached => {
 const f = await fixture(); await f.finishOriginalChecks()
 const image = f.records.get('raw-east')!.jobs[0].results[0].sha
 const request = routes.estimateSkeleton(png(await b64(await decodePng(f.blobs.get(image)!))))
 const { requestHash } = await requestIdentity(request)
 const evict = async () => { for (const record of f.records.values()) if (record.requestHash === requestHash) f.records.delete(record.id); await f.q.sync() }
 if (!cached) await evict()
 const before = f.posts()
 await expect(parallelGeneration([async signal => {
  await run(request, 'Reviewed check', 'test', true, true, signal)
  await evict()
  await run(request, 'Repeated frame', 'test', true, true, signal)
 }], f.spec.seed, { intent: { id: 'one-check-consent', recordIds: [] }, rawHashes: new Set(), checkHashes: new Set([requestHash]), tail: Promise.resolve() })).rejects.toThrow('Cached joint results changed')
 expect(f.posts() - before).toBe(cached ? 0 : 1)
 expect(f.enqueue).toHaveBeenCalledTimes(cached ? 0 : 1)
})

test.each(['missing', 'non-array', 'hole', 'giant-hole', 'invalid', 'uppercase', 'duplicate'] as const)('both persisted recovery kinds reject %s check-hash authorization before execution', async broken => {
 const f = await fixture(), plan = await measurementRecoveryPlan('rig-recover', f.spec)
 let hashes: unknown
 if (broken === 'non-array') hashes = 'a'.repeat(64)
 if (broken === 'hole') hashes = Array<string>(2)
 if (broken === 'giant-hole') { const array = Array<string>(2 ** 31); array[0] = 'a'.repeat(64); hashes = array }
 if (broken === 'invalid') hashes = ['not-a-request-hash']
 if (broken === 'uppercase') hashes = ['A'.repeat(64)]
 if (broken === 'duplicate') hashes = ['a'.repeat(64), 'a'.repeat(64)]
 for (const kind of ['measurementRecovery', 'bodyPaletteRepair'] as const) {
  const intent = kind === 'measurementRecovery' ? { id: 'consent', rigVersion: plan.rigVersion, recordIds: plan.recordIds, checkHashes: hashes } : { id: 'consent', rigVersion: plan.rigVersion, version: 'near-rest-v1', checkHashes: hashes }
  const spec = { ...f.spec, [kind]: intent } as MoveSpec
  await expect(measurementRecoveryPlan('rig-recover', spec)).rejects.toThrow('reviewed joint-check hashes are invalid')
  await expect(addMove('rig-recover', spec)).rejects.toThrow('reviewed joint-check hashes are invalid')
 }
 expect(f.posts()).toBe(0); expect(f.enqueue).not.toHaveBeenCalled()
})

test('completing reviewed checks before execution reduces the allowlist to cached-only reuse', async () => {
 const f = await fixture(), spec = await f.recovery()
 expect(spec.measurementRecovery.checkHashes).toHaveLength(8)
 await f.finishOriginalChecks()
 const plan = await measurementRecoveryPlan('rig-recover', spec)
 expect(plan.checkHashes).toEqual([]); expect(plan.checks).toBe(0)
 const before = f.posts()
 await addMove('rig-recover', spec)
 expect(f.posts()).toBe(before); expect(f.enqueue).not.toHaveBeenCalled()
 expect(f.saved().moveRecovery?.id).toBe(spec.measurementRecovery.id)
})

test.each(['rest', 'action', 'seed', 'raw'] as const)('fresh review cannot use old cached identity after %s changes', async changed => {
 const f = await fixture(), spec = await f.recovery()
 if (changed === 'rest') f.saved().manifest.rig.rest!.east!.keypoints[0].x += .01
 if (changed === 'action') spec.action = 'slash'
 if (changed === 'seed') spec.seed++
 if (changed === 'raw') { f.records.delete('raw-west'); await f.q.sync() }
 const review = await reviewMoveRecovery('rig-recover', spec)
 expect(review.recovery).toBeUndefined(); expect(review.colorRepair).toBeUndefined()
 expect(review.unavailable).toContain('original completed body render is unavailable')
 await expect(addMove('rig-recover', spec)).rejects.toThrow()
 expect(f.enqueue).not.toHaveBeenCalled(); expect(f.posts()).toBe(0)
})

test('missing original raw results or a changed original seed cannot buy replacement artwork',async()=>{const f=await fixture();f.records.delete('raw-west');await f.q.sync();await expect(measurementRecoveryPlan('rig-recover',f.spec)).rejects.toThrow('unavailable');expect(f.enqueue).not.toHaveBeenCalled();vi.restoreAllMocks();const g=await fixture();await expect(measurementRecoveryPlan('rig-recover',{...g.spec,seed:99})).rejects.toThrow('unavailable');expect(g.posts()).toBe(0)})

test('bad real recovered measurements never trigger an uncached raw reroll or publish a weakened result',async()=>{const f=await fixture(),spec=await f.recovery();f.bad();await expect(addMove('rig-recover',spec)).rejects.toThrow('replacement still fails body-pose quality checks');expect(f.enqueue.mock.calls.filter(([r])=>r.path==='/animate-with-skeleton-v3')).toHaveLength(0);expect(f.posts()).toBeLessThanOrEqual(8);expect(f.put).not.toHaveBeenCalled();expect(f.update).not.toHaveBeenCalled();expect(f.saved()).toEqual(f.before)})


test('body publication receipt survives a failed item step and resumes only missing equipment without rerender',async()=>{
 const f=await fixture();f.addItem();const spec=await f.recovery();const pose=vi.spyOn(itemRun,'poseItemClip').mockRejectedValueOnce(Error('synthetic item failure')).mockResolvedValue({} as Awaited<ReturnType<typeof itemRun.poseItemClip>>)
 await expect(addMove('rig-recover',spec)).rejects.toThrow('synthetic item failure');expect(f.posts()).toBe(8);expect(f.saved().moveRecovery?.id).toBe('explicit-review');const published=structuredClone(f.saved().manifest.rig)
 vi.mocked(db.getBlob).mockClear()
 expect(await reviewMoveRecovery('rig-recover', spec)).toEqual({})
 expect(db.getBlob).not.toHaveBeenCalled()
 const calls=f.enqueue.mock.calls.length;await addMove('rig-recover',spec);expect(f.posts()).toBe(8);expect(f.enqueue.mock.calls).toHaveLength(calls);expect(f.saved().manifest.rig).toEqual(published);expect(pose).toHaveBeenCalledTimes(2)
})

test.each([false, true])('only an exact publication receipt skips fresh evidence review; execution remains strict (palette=%s)', async palette => {
 const f = await fixture(palette); f.addItem()
 if (palette) await f.finishOriginalChecks()
 const plan = palette ? await bodyPaletteRepairPlan('rig-recover', f.spec) : await measurementRecoveryPlan('rig-recover', f.spec)
 const spec: MoveSpec = palette
  ? { ...f.spec, bodyPaletteRepair: { id: 'published-colors', version: 'near-rest-v1', checkHashes: plan.checkHashes, rigVersion: plan.rigVersion } }
  : { ...f.spec, measurementRecovery: { id: 'published-checks', recordIds: plan.recordIds, checkHashes: plan.checkHashes, rigVersion: plan.rigVersion } }
 const pose = vi.spyOn(itemRun, 'poseItemClip').mockRejectedValueOnce(Error('synthetic item failure')).mockResolvedValue({} as Awaited<ReturnType<typeof itemRun.poseItemClip>>)
 await expect(addMove('rig-recover', spec)).rejects.toThrow('synthetic item failure')
 const receipt = structuredClone(f.saved().moveRecovery!), before = f.posts(), calls = f.enqueue.mock.calls.length
 vi.mocked(db.getBlob).mockClear()
 expect(await reviewMoveRecovery('rig-recover', spec)).toEqual({})
 expect(db.getBlob).not.toHaveBeenCalled()
 for (const field of ['id', 'originalRigVersion', 'bodyRigVersion', 'specHash'] as const) {
  f.saved().moveRecovery = { ...receipt, [field]: 'not-the-published-intent' }
  vi.mocked(db.getBlob).mockClear()
  const refreshed = await reviewMoveRecovery('rig-recover', spec)
  expect(refreshed.recovery).toMatchObject({ checks: 0, recordIds: [] })
  if (palette) expect(refreshed.recovery?.palette).toMatchObject({ changedPixels: 90 })
  expect(db.getBlob).toHaveBeenCalled()
  await expect(addMove('rig-recover', spec)).rejects.toThrow('changed')
 }
 f.saved().moveRecovery = receipt
 expect((await reviewMoveRecovery('rig-recover', { ...spec, seed: spec.seed + 1 })).unavailable).toContain('original completed body render is unavailable')
 await expect(addMove('rig-recover', { ...spec, seed: spec.seed + 1 })).rejects.toThrow('changed')
 await addMove('rig-recover', spec)
 expect(pose).toHaveBeenCalledTimes(2)
 expect(f.posts()).toBe(before); expect(f.enqueue.mock.calls).toHaveLength(calls)
 f.changeRig()
 vi.mocked(db.getBlob).mockClear()
 const refreshed = await reviewMoveRecovery('rig-recover', spec)
 expect(refreshed.recovery).toMatchObject({ checks: 0, recordIds: [] })
 if (palette) expect(refreshed.recovery?.palette).toMatchObject({ changedPixels: 90 })
 expect(db.getBlob).toHaveBeenCalled()
 await expect(addMove('rig-recover', spec)).rejects.toThrow('changed')
 expect(f.posts()).toBe(before); expect(f.enqueue.mock.calls).toHaveLength(calls)
})


test('bounded color plan is API-free and reuses complete real original measurements',async()=>{
 const f=await fixture(true);await expect(bodyPaletteRepairPlan('rig-recover',f.spec)).rejects.toThrow('all original joint checks');await f.finishOriginalChecks();const before=f.posts(),plan=await bodyPaletteRepairPlan('rig-recover',f.spec)
 expect(plan.directions).toEqual(['west']);expect(plan.changedPixels).toBe(90);expect(plan.rawOutliers).toBe(90);expect(plan.remainingOutliers).toBe(0);expect(plan.changedFrames).toBe(3);expect(plan.checks).toBe(3);expect(plan.gens).toBeCloseTo(.3);expect(f.posts()).toBe(before)
})

test('color repair remeasures only changed PNGs and persists exact raw/final provenance without body generation',async()=>{
 const f=await fixture(true);await f.finishOriginalChecks();const plan=await bodyPaletteRepairPlan('rig-recover',f.spec),before=f.posts()
 const spec:MoveSpec={...f.spec,bodyPaletteRepair:{id:'color-consent',version:'near-rest-v1',checkHashes:plan.checkHashes,rigVersion:plan.rigVersion}};await addMove('rig-recover',spec)
 expect(f.posts()-before).toBe(3);expect(f.max()).toBe(1);const source=f.saved().manifest.rig.animations[0].sources!.west!,processing=source.processing!
 expect(processing).toMatchObject({version:'near-rest-v1',changedPixels:90,rawOutliers:90,remainingOutliers:0,changedFrames:[1,2,3]});expect(processing.rawPaletteFit).toBeLessThan(.97)
 expect(processing.inputHashes[0]).toBe(processing.rawInputHashes[0]);for(const i of [1,2,3])expect(processing.inputHashes[i]).not.toBe(processing.rawInputHashes[i]);expect(source.measured).toHaveLength(4);expect(f.saved().manifest.rig.animations[0].sources!.east!.processing).toBeUndefined()
 const calls=f.enqueue.mock.calls.length;await addMove('rig-recover',spec);expect(f.posts()-before).toBe(3);expect(f.enqueue.mock.calls).toHaveLength(calls);expect(f.saved().moveRecovery?.id).toBe('color-consent')
})

test('palette-only repair refuses failed real pose checks before buying any color check',async()=>{const f=await fixture(true);f.bad();await f.finishOriginalChecks();const before=f.posts();await expect(bodyPaletteRepairPlan('rig-recover',f.spec)).rejects.toThrow('cannot repair pose');expect(f.posts()).toBe(before);expect(f.update).not.toHaveBeenCalled()})


test('unknown corrected-PNG checks require new explicit consent and never reopen body renders',async()=>{
 const f=await fixture(true);await f.finishOriginalChecks();const plan=await bodyPaletteRepairPlan('rig-recover',f.spec),before=f.posts()
 const spec:MoveSpec={...f.spec,bodyPaletteRepair:{id:'color-consent',version:'near-rest-v1',checkHashes:plan.checkHashes,rigVersion:plan.rigVersion}};f.failCheck();await expect(addMove('rig-recover',spec)).rejects.toThrow('lost');expect(f.posts()-before).toBe(1);expect(f.update).not.toHaveBeenCalled()
 await expect(addMove('rig-recover',spec)).rejects.toThrow('lost');expect(f.posts()-before).toBe(1)
 const review = await reviewMoveRecovery('rig-recover', spec)
 expect(review.recovery?.recordIds).toHaveLength(1); expect(review.recovery?.checks).toBe(3)
 expect(review.colorRepair).toBeUndefined()
 const retry=await measurementRecoveryPlan('rig-recover',spec);expect(retry.recordIds).toHaveLength(1);expect(retry.checks).toBe(3)
 await addMove('rig-recover',{...spec,measurementRecovery:{id:'explicit-corrected-checks',recordIds:retry.recordIds,checkHashes:retry.checkHashes,rigVersion:retry.rigVersion}})
 expect(f.posts()-before).toBe(4);expect(f.saved().manifest.rig.animations[0].sources!.west!.processing?.changedPixels).toBe(90);expect(f.saved().moveRecovery?.id).toBe('explicit-corrected-checks')
})

test('stale unpublished color consent reviews the corrected PNGs and requires new consent for the current rig', async () => {
 const f = await fixture(true); await f.finishOriginalChecks()
 const plan = await bodyPaletteRepairPlan('rig-recover', f.spec)
 const spec: MoveSpec = { ...f.spec, bodyPaletteRepair: { id: 'original-color-consent', version: 'near-rest-v1', checkHashes: plan.checkHashes, rigVersion: plan.rigVersion } }
 f.failCheck(); await expect(addMove('rig-recover', spec)).rejects.toThrow('lost')
 expect(f.posts()).toBe(9); expect(f.saved().moveRecovery).toBeUndefined()
 addUnrelatedMove(f.saved())
 await expect(addMove('rig-recover', spec)).rejects.toThrow('changed')
 await expect(measurementRecoveryPlan('rig-recover', spec)).rejects.toThrow('changed')
 const fresh = (await reviewMoveRecovery('rig-recover', spec)).recovery!
 expect(fresh).toMatchObject({ checks: 3, rawHashes: plan.rawHashes, palette: { directions: ['west'], changedPixels: 90 } })
 expect(fresh.recordIds).toHaveLength(1); expect(fresh.rigVersion).not.toBe(plan.rigVersion)
 expect(f.posts()).toBe(9)
 await addMove('rig-recover', { ...spec, bodyPaletteRepair: { ...spec.bodyPaletteRepair!, rigVersion: fresh.rigVersion }, measurementRecovery: { id: 'fresh-corrected-frame-consent', recordIds: fresh.recordIds, checkHashes: fresh.checkHashes, rigVersion: fresh.rigVersion } })
 expect(f.posts()).toBe(12)
 expect(f.saved().manifest.rig.animations.find(animation => animation.id === 'idle')!.sources!.west!.processing?.changedPixels).toBe(90)
 expect(f.saved().moveRecovery?.id).toBe('fresh-corrected-frame-consent')
})

test('a color publication interrupted after completed checks offers fresh consent without buying checks again', async () => {
 const f = await fixture(true); await f.finishOriginalChecks()
 const plan = await bodyPaletteRepairPlan('rig-recover', f.spec)
 const spec: MoveSpec = { ...f.spec, bodyPaletteRepair: { id: 'unpublished-color-consent', version: 'near-rest-v1', checkHashes: plan.checkHashes, rigVersion: plan.rigVersion } }
 await expect(addMove('rig-recover', spec, progress => { if (progress.step === 'save') throw new Error('Interrupted before body publication') })).rejects.toThrow('Interrupted before body publication')
 expect(f.posts()).toBe(11); expect(f.saved().moveRecovery).toBeUndefined()
 addUnrelatedMove(f.saved())
 await expect(addMove('rig-recover', spec)).rejects.toThrow('changed')
 const fresh = (await reviewMoveRecovery('rig-recover', spec)).recovery!
 expect(fresh).toMatchObject({ checks: 0, recordIds: [], gens: 0, usd: 0, rawHashes: plan.rawHashes, palette: { directions: ['west'], changedPixels: 90 } })
 expect(fresh.rigVersion).not.toBe(plan.rigVersion)
 const calls = f.enqueue.mock.calls.length
 await addMove('rig-recover', { ...spec, bodyPaletteRepair: { ...spec.bodyPaletteRepair!, rigVersion: fresh.rigVersion }, measurementRecovery: { id: 'fresh-cached-color-consent', recordIds: [], checkHashes: fresh.checkHashes, rigVersion: fresh.rigVersion } })
 expect(f.posts()).toBe(11)
 expect(f.enqueue.mock.calls).toHaveLength(calls)
 expect(f.saved().moveRecovery?.id).toBe('fresh-cached-color-consent')
 expect(f.saved().manifest.rig.animations.find(animation => animation.id === 'idle')!.sources!.west!.processing?.changedPixels).toBe(90)
})

test.each(['version', 'id'] as const)('fresh color review rejects an invalid %s instead of replacing its policy', async field => {
 const f = await fixture(true); await f.finishOriginalChecks()
 const plan = await bodyPaletteRepairPlan('rig-recover', f.spec)
 const spec: MoveSpec = { ...f.spec, bodyPaletteRepair: { id: 'color-consent', version: 'near-rest-v1', checkHashes: plan.checkHashes, rigVersion: plan.rigVersion } }
 if (field === 'version') (spec.bodyPaletteRepair as { version: string }).version = 'unknown-policy'
 else spec.bodyPaletteRepair!.id = ''
 addUnrelatedMove(f.saved())
 const before = f.posts()
 await expect(reviewMoveRecovery('rig-recover', spec)).rejects.toThrow('color-repair policy changed')
 await expect(addMove('rig-recover', spec)).rejects.toThrow('color-repair policy changed')
 expect(f.posts()).toBe(before)
})


test('known insufficient bounded color correction refuses new paid measurements before enqueue',async()=>{
 const f=await fixture('partial');await f.finishOriginalChecks();const before=f.posts(),enqueues=f.enqueue.mock.calls.length
 await expect(bodyPaletteRepairPlan('rig-recover',f.spec)).rejects.toThrow('still fails the palette quality check')
 expect(f.posts()).toBe(before);expect(f.enqueue.mock.calls).toHaveLength(enqueues);expect(f.update).not.toHaveBeenCalled()
})
