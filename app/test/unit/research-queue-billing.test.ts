import {afterEach,expect,test,vi} from 'vitest';
import {readFileSync} from 'node:fs';
import type {JobRec,SubJob} from '../../src/lib/pixellab/queue.ts';
const snapshot=vi.hoisted(()=>({jobs:[] as JobRec[],enqueue:vi.fn()}));
vi.mock('../../src/lib/pixellab/queue.ts',async original=>{const {live,MOTION_LAB_TAG}=await original<typeof import('../../src/lib/pixellab/queue.ts')>();return{live,MOTION_LAB_TAG,Queue:class{key='synthetic-test-key';subscribe(read:(value:typeof snapshot)=>void){read(snapshot);return()=>{};}enqueue(...args:unknown[]){return snapshot.enqueue(...args);}},requestIdentity:vi.fn(async()=>({requestHash:'synthetic'}))};});
import {reconcileResearchJobs,existingLabRequest,enqueueLab,readLedger} from '../../src/ui/motion-lab/run.ts';
import {readResearchBudget,reserveResearchCall,recordResearchOutcome,researchBudgetUsage} from '../../src/ui/motion-lab/research-budget.ts';
import {runCustomTest} from '../../src/ui/motion-lab/custom-test.ts';
import {importPilot,readPilot} from '../../src/ui/motion-lab/pilot.ts';
import {newDocument,type MotionLibrary} from '../../src/ui/motion-lab/model.ts';
const library=JSON.parse(readFileSync(new URL('../../dev-fixtures/motion-lab/library.json',import.meta.url),'utf8')) as MotionLibrary;

afterEach(()=>{snapshot.jobs=[];snapshot.enqueue.mockReset();vi.unstubAllGlobals();});
async function fixture(job:Partial<JobRec>={}){
  const saved=new Map<string,string>(),tails=new Map<string,Promise<unknown>>();vi.stubGlobal('localStorage',{getItem:(key:string)=>saved.get(key)??null,setItem:(key:string,value:string)=>saved.set(key,value)});vi.stubGlobal('navigator',{locks:{request:<T>(key:string,run:()=>T)=>{const next=(tails.get(key)??Promise.resolve()).catch(()=>undefined).then(run);tails.set(key,next);return next;}}});
  const row:JobRec={id:'local-job',label:'Synthetic billing fixture',tag:'motion-lab-2026-10-28',method:'POST',endpoint:'/animate-with-skeleton-v3',params:{},inputs:[],requestHash:'synthetic',state:'done',attempts:1,nextAt:0,createdAt:1,jobs:[],gens:0,usd:0,...job};snapshot.jobs=[row];
  await reserveResearchCall({id:'research-call',label:'Synthetic request',stage:'body',units:8});await recordResearchOutcome('research-call',{status:'accepted',jobIds:[row.id]});return row;
}
const remote=(id:string,status:string,units?:number):SubJob=>({id,status,done:status==='completed'||status==='failed',results:[],...(units===undefined?{}:{usage:{type:'generations',generations:units}})});

test('a synchronous queue result without explicit usage does not become a settled zero-cost call',async()=>{
  await fixture({response:{character_id:'synthetic-character'}});await reconcileResearchJobs();
  expect(readResearchBudget().calls[0]).toMatchObject({status:'accepted',billedUnits:0,note:expect.stringContaining('not settled')});expect(researchBudgetUsage().reservedUnits).toBe(8);
});

test('a synchronous fractional import settles from its explicit submission receipt',async()=>{
  await fixture({response:{usage:{type:'generations',generations:0.25}},gens:0.25});await reconcileResearchJobs();
  expect(readResearchBudget().calls[0]).toMatchObject({status:'completed',billedUnits:0.25,note:expect.stringContaining('settled')});
});

test('remote queue results retain partial failed and pending charges before the aggregate gens counter settles',async()=>{
  const row=await fixture({state:'running',jobs:[remote('failed','failed',2),remote('pending','processing',1)]});await reconcileResearchJobs();
  expect(readResearchBudget().calls[0]).toMatchObject({status:'accepted',billedUnits:3,note:expect.stringContaining('not settled')});
  row.state='done';row.jobs[1]=remote('pending','completed',3);row.gens=5;await reconcileResearchJobs();
  expect(readResearchBudget().calls[0]).toMatchObject({status:'failed',billedUnits:5});
});

test('missing remote usage remains unsettled until an explicit bill arrives and stale smaller bills cannot reduce it',async()=>{
  const row=await fixture({jobs:[remote('remote-job','completed')]});await reconcileResearchJobs();expect(readResearchBudget().calls[0].status).toBe('accepted');
  row.jobs[0].usage={type:'generations',generations:3};row.gens=3;await reconcileResearchJobs();expect(readResearchBudget().calls[0]).toMatchObject({status:'completed',billedUnits:3});
  row.jobs[0].usage={type:'generations',generations:0};row.gens=0;await reconcileResearchJobs();expect(readResearchBudget().calls[0].billedUnits).toBe(3);
});

test('lost queue outcomes retain the unknown state and invalid charges are surfaced',async()=>{
  const row=await fixture({state:'lost'});await reconcileResearchJobs();expect(readResearchBudget().calls[0]).toMatchObject({status:'unknown',note:expect.stringContaining('not settled')});
  row.state='done';row.response={usage:{type:'generations',generations:-1}};await expect(reconcileResearchJobs()).rejects.toThrow('invalid generation charge');expect(readResearchBudget().calls[0].status).toBe('unknown');
});

test('later higher billing persists without replacing a retained final outcome',async()=>{
  const row=await fixture({state:'failed',response:{usage:{type:'generations',generations:1}},gens:1});await reconcileResearchJobs();expect(readResearchBudget().calls[0]).toMatchObject({status:'failed',billedUnits:1});
  row.state='done';row.response={usage:{type:'generations',generations:4}};row.gens=4;await reconcileResearchJobs();expect(readResearchBudget().calls[0]).toMatchObject({status:'failed',billedUnits:4});
});

test('an MCP error without usage retains an unverified bill rather than recording a free request',async()=>{
  await fixture();await runCustomTest(async()=>({isError:true,content:[{type:'text',text:'Synthetic tool failure with no billing receipt.'}]}));
  const call=readResearchBudget().calls.find(c=>c.id==='workflow-reconciliation-legacy-custom')!;
  expect(call.status).toBe('failed');expect(call.billedUnits).toBeUndefined();expect(call.note).toContain('Billing is unverified');expect(researchBudgetUsage().reservedUnits).toBe(16);
});

const request={method:'POST' as const,path:'/animate-with-skeleton-v3',body:{seed:731}};
test.each(['queued','submitting','running','failed','lost','canceled','done'] as const)('existing %s receipts block a new raw reservation unless a completed candidate is attributable',async state=>{
  const row=await fixture({state});const before=readResearchBudget().calls.length;
  await expect(enqueueLab(newDocument(library),731,request,3)).rejects.toThrow(`receipt ${row.id}`);
  expect(snapshot.enqueue).not.toHaveBeenCalled();expect(readResearchBudget().calls).toHaveLength(before);expect(readLedger().reservations).toHaveLength(0);
});

test('completed attributed raw candidates are reused without a new reservation or transport',async()=>{
  const row=await fixture();localStorage.setItem('pixeldoll.motionLab.2026-10-28',JSON.stringify({version:1,reservations:[{id:'historical',phase:'earlier-phase',jobId:row.id}]}));
  expect(await enqueueLab(newDocument(library),731,request,3)).toBe(row.id);expect(snapshot.enqueue).not.toHaveBeenCalled();expect(readResearchBudget().calls).toHaveLength(1);
});

test('request preflight honors active receipts before complete ones and newer complete receipts before older failures',async()=>{
  const old=await fixture({id:'old-failed',state:'failed',createdAt:1});snapshot.jobs.push({...old,id:'complete',state:'done',createdAt:2},{...old,id:'active',state:'running',createdAt:3});
  expect(existingLabRequest('synthetic')?.id).toBe('active');snapshot.jobs.pop();expect(existingLabRequest('synthetic')?.id).toBe('complete');expect(existingLabRequest('different')).toBeUndefined();
});

test('concurrent different provenance documents for one paid request reserve and dispatch it only once',async()=>{
  await fixture({requestHash:'unrelated'});const first=newDocument(library),second=structuredClone(first);second.fixture.name+=' / alternate notes';
  snapshot.enqueue.mockResolvedValue({id:'new-queue-job'});
  const results=await Promise.allSettled([enqueueLab(first,731,request,3),enqueueLab(second,731,request,3)]);
  expect(results.filter(r=>r.status==='fulfilled').length).toBeGreaterThanOrEqual(1);expect(snapshot.enqueue).toHaveBeenCalledTimes(1);expect(readLedger().reservations).toHaveLength(1);expect(readResearchBudget().calls).toHaveLength(2);
});

test('an existing import receipt must be completed with a character identity before free reuse',async()=>{
  const row=await fixture({endpoint:'/create-character-v3',state:'lost'}),before=readResearchBudget().calls.length;
  await expect(importPilot(library.fixtures[0])).rejects.toThrow(`receipt ${row.id}`);expect(readPilot()).toBeNull();expect(readResearchBudget().calls).toHaveLength(before);
  row.state='done';await expect(importPilot(library.fixtures[0])).rejects.toThrow(`receipt ${row.id}`);
  row.response={character_id:'00000000-0000-4000-8000-000000000001'};await importPilot(library.fixtures[0]);
  expect(readPilot()).toMatchObject({importJobId:row.id,reusedImport:true});expect(snapshot.enqueue).not.toHaveBeenCalled();expect(readResearchBudget().calls).toHaveLength(before);
});
