import { accountBalance } from './account-fixture.ts'
import { expect, test } from 'vitest'
import { Queue, requestIdentity, type Deps, type JobRec } from '../../src/lib/pixellab/queue.ts'
import { ApiError } from '../../src/lib/pixellab/client.ts'
import { png, routes } from '../../src/lib/pixellab/routes.ts'
import { sha256 } from '../../src/lib/image/hash.ts'

const req = routes.estimateSkeleton(png('AQID'))
function fixture() {
 const records = new Map<string,JobRec>(); let posts=0, fail=true, now=1000
 const deps:Partial<Deps>={locks:null,online:()=>true,now:()=>++now,
  put:async(id,r)=>{records.set(id,structuredClone(r))},get:async id=>structuredClone(records.get(id)),all:async()=>[...records.values()].map(r=>structuredClone(r)),
  putBlob:sha256,getBlob:async()=>new Blob([new Uint8Array([1,2,3])]),
  claimEstimate:async(r,choose)=>{const existing=choose([...records.values()].map(v=>structuredClone(v)));if(existing)return existing;if(records.has(r.id))throw Error('collision');records.set(r.id,structuredClone(r));return r},
  api:async<T>(_key:string,_method:string,path:string):Promise<T>=>{if(path==='/balance')return accountBalance as T;posts++;if(fail)throw new ApiError(500,'retry','HTTP 500');return{keypoints:[],usage:{type:'generations',generations:.1}} as T}}
 const make=()=>{const q=new Queue(deps);q.setKey('synthetic-key');return q}
 return{records,deps,make,posts:()=>posts,succeed:()=>{fail=false}}
}
async function lost(f:ReturnType<typeof fixture>){const q=f.make(),r=await q.enqueue(req);await q.tick();expect(r.state).toBe('lost');return{q,r}}

test('request-only identity exactly matches the persisted enqueue identity without storing an image',async()=>{const f=fixture(),q=f.make(),identity=await requestIdentity(req),r=await q.enqueue(req);expect(r.requestHash).toBe(identity.requestHash);expect(r.params).toEqual(identity.params);expect(r.inputs).toEqual(identity.inputs)})

test('explicit estimate retry preserves unknown original and resumes one persisted result without another POST',async()=>{
 const f=fixture(),{q,r}=await lost(f);const original=structuredClone(f.records.get(r.id));f.succeed()
 const intent={id:'explicit-1',recordIds:[r.id]},retry=await q.enqueue(req,{estimateRetry:intent});expect(retry.id).not.toBe(r.id);expect(retry.estimateRecovery).toEqual({id:'explicit-1',retryOf:r.id});await q.tick()
 expect(f.records.get(r.id)).toEqual(original);expect(f.posts()).toBe(2)
 const resumed=f.make();await resumed.load();expect((await resumed.enqueue(req,{estimateRetry:intent})).id).toBe(retry.id);await resumed.tick();expect(f.posts()).toBe(2)
})

test('a failed explicit retry cannot resend on reload; only new consent to its newer lost record forks again',async()=>{
 const f=fixture(),{q,r}=await lost(f),intent={id:'attempt-1',recordIds:[r.id]};const retry=await q.enqueue(req,{estimateRetry:intent});await q.tick();expect(retry.state).toBe('lost')
 const resumed=f.make();await resumed.load();expect((await resumed.enqueue(req,{estimateRetry:intent})).id).toBe(retry.id);await resumed.tick();expect(f.posts()).toBe(2)
 await expect(resumed.enqueue(req,{estimateRetry:{id:'stale-new-consent',recordIds:[r.id]}})).rejects.toThrow('changed')
 f.succeed();const next=await resumed.enqueue(req,{estimateRetry:{id:'attempt-2',recordIds:[retry.id]}});expect(next.estimateRecovery?.retryOf).toBe(retry.id);await resumed.tick();expect(f.posts()).toBe(3)
})

test('different tab consent UUIDs claim one source-linked retry and never overwrite its progressed state',async()=>{
 const f=fixture(),{r}=await lost(f),a=f.make(),b=f.make();await a.load();await b.load();f.succeed()
 const first=await a.enqueue(req,{estimateRetry:{id:'tab-a',recordIds:[r.id]}});await a.tick();const progressed=structuredClone(f.records.get(first.id))
 const second=await b.enqueue(req,{estimateRetry:{id:'tab-b',recordIds:[r.id]}});expect(second.id).toBe(first.id);expect(second.state).toBe('done');expect(f.records.get(first.id)).toEqual(progressed);await b.tick();expect(f.posts()).toBe(2)
 const reloaded=f.make();await reloaded.load();await reloaded.tick();expect(f.posts()).toBe(2)
})

test('fresh unsent checks also atomically reuse a completed check from a stale follower',async()=>{
 const f=fixture(),a=f.make(),b=f.make();f.succeed();const intent={id:'a',recordIds:['reviewed-other-frame']}
 const first=await a.enqueue(req,{estimateRetry:intent});await a.tick();const second=await b.enqueue(req,{estimateRetry:{...intent,id:'b'}})
 expect(second.id).toBe(first.id);expect(second.state).toBe('done');await b.tick();expect(f.posts()).toBe(1)
})

test('accepted job evidence and unrelated terminal records never become explicit estimate retries',async()=>{
 const f=fixture(),{q,r}=await lost(f);r.jobs=[{id:'accepted',done:false,status:'pending',results:[]}];f.records.set(r.id,structuredClone(r))
 await expect(q.enqueue(req,{estimateRetry:{id:'bad',recordIds:[r.id]}})).rejects.toThrow('changed')
 expect((await q.enqueue(req,{estimateRetry:{id:'unrelated',recordIds:['other']}})).id).toBe(r.id)
 await expect(q.enqueue({method:'POST',path:'/animate-with-skeleton-v3',body:{}},{estimateRetry:{id:'bad',recordIds:[r.id]}})).rejects.toThrow('only available')
 expect(f.posts()).toBe(1)
})

test('ordinary enqueue cannot dispatch during a delayed or failed first ledger write',async()=>{
 let finish!:()=>void,fail!: (e:Error)=>void,writing!:()=>void,posts=0;const blocked=new Promise<void>((resolve,reject)=>{finish=resolve;fail=reject}),written=new Promise<void>(resolve=>{writing=resolve})
 const q=new Queue({locks:null,online:()=>true,put:async()=>{writing();return blocked},api:async<T>(_key:string,_method:string,path:string)=>{if(path==='/balance')return accountBalance as T;posts++;return{} as T}});q.setKey('synthetic')
 const creating=q.enqueue({method:'POST',path:'/ordinary',body:{}});await written;await q.tick();expect(posts).toBe(0);finish();await creating;await q.tick();expect(posts).toBe(1)
 const broken=new Queue({locks:null,online:()=>true,put:async()=>{throw Error('quota')},api:async<T>(_key:string,_method:string,path:string)=>{if(path==='/balance')return accountBalance as T;posts++;return{} as T}});broken.setKey('synthetic');await expect(broken.enqueue({method:'POST',path:'/ordinary',body:{}})).rejects.toThrow('quota');await broken.tick();expect(posts).toBe(1);expect(broken.snapshot().jobs).toHaveLength(0);void fail
})

test('failed atomic recovery claim publishes nothing schedulable and leaves the unknown source intact',async()=>{
 const f=fixture(),{r}=await lost(f),before=structuredClone(f.records.get(r.id));const q=new Queue({...f.deps,claimEstimate:async()=>{throw Error('storage failed')}});q.setKey('synthetic');await q.load()
 await expect(q.enqueue(req,{estimateRetry:{id:'explicit',recordIds:[r.id]}})).rejects.toThrow('storage failed');await q.tick();expect(f.posts()).toBe(1);expect(f.records.get(r.id)).toEqual(before)
})


test('a delayed same-ID claim cannot replace the authoritative terminal in-memory job',async()=>{
 const f=fixture(),{r}=await lost(f);f.succeed();let count=0,release!:()=>void,entered!:()=>void
 const waiting=new Promise<void>(resolve=>{entered=resolve}),hold=new Promise<void>(resolve=>{release=resolve})
 const claim=f.deps.claimEstimate!
 const q=new Queue({...f.deps,claimEstimate:async(record,choose)=>{const result=await claim(record,choose);if(++count===2){entered();await hold}return result}});q.setKey('synthetic');await q.load()
 const a=q.enqueue(req,{estimateRetry:{id:'a',recordIds:[r.id]}}),b=q.enqueue(req,{estimateRetry:{id:'b',recordIds:[r.id]}})
 // enqueue hashes before claiming, so either call may claim second: race() returns whichever was not held
 const first=await Promise.race([a,b]);await waiting;await q.tick();expect(first.state).toBe('done');release()
 for(const second of await Promise.all([a,b]))expect(second).toBe(first);expect(first.state).toBe('done');expect(f.posts()).toBe(2)
})

test('scope aborted before atomic insertion leaves no new queued record',async()=>{
 const f=fixture(),{r}=await lost(f),scope=new AbortController();let release!:()=>void,entered!:()=>void
 const waiting=new Promise<void>(resolve=>{entered=resolve}),hold=new Promise<void>(resolve=>{release=resolve}),claim=f.deps.claimEstimate!
 const q=new Queue({...f.deps,claimEstimate:async(record,choose)=>{entered();await hold;return claim(record,choose)}});q.setKey('synthetic');await q.load()
 const pending=q.enqueue(req,{estimateRetry:{id:'explicit',recordIds:[r.id]},signal:scope.signal,attempt:99});await waiting;scope.abort(Error('scope stopped'));release();await expect(pending).rejects.toThrow('scope stopped');await q.tick();expect(f.posts()).toBe(1);expect(f.records.size).toBe(1)
})

test('scope aborted after commit cancels only the newly owned queued claim before scheduling',async()=>{
 const f=fixture(),{r}=await lost(f),scope=new AbortController();let release!:()=>void,entered!:()=>void
 const waiting=new Promise<void>(resolve=>{entered=resolve}),hold=new Promise<void>(resolve=>{release=resolve}),claim=f.deps.claimEstimate!
 const q=new Queue({...f.deps,claimEstimate:async(record,choose)=>{const result=await claim(record,choose);entered();await hold;return result}});q.setKey('synthetic');await q.load()
 const pending=q.enqueue(req,{estimateRetry:{id:'explicit',recordIds:[r.id]},signal:scope.signal,attempt:99});await waiting;scope.abort(Error('scope stopped'));release();await expect(pending).rejects.toThrow('scope stopped');await q.tick();expect(f.posts()).toBe(1)
 const retry=[...f.records.values()].find(v=>v.id!==r.id)!;expect(retry.state).toBe('canceled');expect(retry.autoCanceledAttempts).toEqual([99]);expect(f.records.get(r.id)?.state).toBe('lost')
})
