import {afterEach,expect,test,vi} from 'vitest';
import type {InpaintV3} from '../../src/lib/pixellab/routes.ts';
const controls=vi.hoisted(()=>({key:'synthetic-session',hash:'synthetic-payload-hash',jobs:[] as {id:string;state:string}[],existing:undefined as {id:string}|undefined,enqueue:vi.fn(),reconcile:vi.fn(async()=>{}),get:vi.fn(),getBlob:vi.fn()}));
vi.mock('../../src/ui/motion-lab/run.ts',()=>({labQueue:{get key(){return controls.key;},enqueue:(...args:unknown[])=>controls.enqueue(...args),subscribe:(read:(s:{jobs:typeof controls.jobs})=>void)=>{read({jobs:controls.jobs});return()=>{};}},LAB_TAG:'synthetic-fixed-inpaint',reconcileResearchJobs:controls.reconcile,existingLabRequest:()=>controls.existing}));
vi.mock('../../src/lib/pixellab/queue.ts',()=>({requestIdentity:async()=>({requestHash:controls.hash})}));
vi.mock('../../src/lib/store/db.ts',()=>({get:(...args:unknown[])=>controls.get(...args),getBlob:(...args:unknown[])=>controls.getBlob(...args)}));
import {dispatchFixedInpaint,exportFixedInpaint,readFixedInpaint} from '../../src/ui/motion-lab/fixed-inpaint.ts';
import {readResearchBudget,recordResearchGate,recordResearchOutcome,reserveResearchCall,researchBudgetUsage,RESEARCH_PHASE} from '../../src/ui/motion-lab/research-budget.ts';

const profile={key:'synthetic-fixed-profile',label:'Bounded synthetic inpaint diagnostic',units:25 as const},packet={kind:'synthetic-approved-packet',source:'offline-source'};
const input:InpaintV3={description:'Synthetic bounded disarm.',inpainting_image:{image:{type:'base64',base64:'c3ludGhldGlj'},size:{width:288,height:144}},mask_image:{image:{type:'base64',base64:'bWFzaw=='},size:{width:288,height:144}},seed:731,no_background:true};
afterEach(()=>{controls.key='synthetic-session';controls.hash='synthetic-payload-hash';controls.jobs=[];controls.existing=undefined;controls.enqueue.mockReset();controls.reconcile.mockClear();controls.get.mockReset();controls.getBlob.mockReset();vi.unstubAllGlobals();});
async function fixture(body=true){
  const saved=new Map<string,string>([['historical-ledger','retained-original']]),tails=new Map<string,Promise<unknown>>();
  vi.stubGlobal('localStorage',{getItem:(key:string)=>saved.get(key)??null,setItem:(key:string,value:string)=>saved.set(key,value)});
  vi.stubGlobal('navigator',{locks:{request:<T>(key:string,run:()=>T)=>{const next=(tails.get(key)??Promise.resolve()).then(run);tails.set(key,next.catch(()=>undefined));return next;}}});
  controls.enqueue.mockResolvedValue({id:'synthetic-local-receipt'});
  if(body)await recordResearchGate('body',{passed:true,notes:'Synthetic limited body hypothesis.',evidence:['synthetic/body-review.json']});return saved;
}

test('dispatch persists the one-shot packet and equipment reservation before rebuilding only allowed inpaint fields',async()=>{
  const saved=await fixture();controls.enqueue.mockImplementation(async request=>{
    expect(readFixedInpaint(profile.key)).toEqual({version:1,packet,callId:RESEARCH_PHASE+'-synthetic-payload-hash'});
    expect(readResearchBudget().calls[0]).toMatchObject({stage:'equipment',units:25,status:'reserved'});
    expect(request).toEqual({method:'POST',path:'/inpaint-v3',body:{...input,inpainting_image:{...input.inpainting_image,image:{...input.inpainting_image.image,format:'png'}},mask_image:{...input.mask_image,image:{...input.mask_image.image,format:'png'}}}});return{id:'synthetic-local-receipt'};
  });
  const result=await dispatchFixedInpaint(profile,packet,{...input,endpoint:'/forbidden-route',unapproved:'not forwarded'} as InpaintV3);
  expect(result.jobId).toBe('synthetic-local-receipt');expect(readResearchBudget().calls[0]).toMatchObject({status:'accepted',jobIds:[result.jobId]});expect(saved.get('historical-ledger')).toBe('retained-original');
});

test('a failed equipment qualification remains failed while a separate bounded hypothesis is charged to the same stage',async()=>{
  await fixture();await recordResearchGate('equipment',{passed:false,notes:'Prior equipment grip failed.',evidence:['synthetic/rejected-equipment.json']});
  const before=structuredClone(readResearchBudget().gates);await dispatchFixedInpaint(profile,packet,input);
  expect(readResearchBudget().gates).toEqual(before);expect(researchBudgetUsage().stageUnits.equipment).toBe(25);
  await expect(reserveResearchCall({id:'blocked-replication',label:'Must remain blocked',stage:'replication',units:1})).rejects.toThrow('equipment qualification gate');
});

test.each([false,true])('missing or failed body qualification still blocks the new hypothesis, explicit failure=%s',async failed=>{
  await fixture(false);if(failed)await recordResearchGate('body',{passed:false,notes:'Synthetic body rejected.',evidence:['synthetic/body-failure.json']});
  await expect(dispatchFixedInpaint(profile,packet,input)).rejects.toThrow('body qualification gate');expect(controls.enqueue).not.toHaveBeenCalled();expect(readFixedInpaint(profile.key)).toBeNull();expect(readResearchBudget().calls).toHaveLength(0);
});

test('concurrent identical calls across different profile keys share one paid request identity',async()=>{
  await fixture();const outcomes=await Promise.allSettled([dispatchFixedInpaint(profile,packet,input),dispatchFixedInpaint({...profile,key:'synthetic-second-profile'},packet,input)]);
  expect(outcomes.filter(result=>result.status==='fulfilled')).toHaveLength(1);expect(controls.enqueue).toHaveBeenCalledTimes(1);expect(readResearchBudget().calls).toHaveLength(1);expect(researchBudgetUsage().reservedUnits).toBe(25);
});

test('concurrent calls under one profile and later repeats cannot resend',async()=>{
  await fixture();const outcomes=await Promise.allSettled([dispatchFixedInpaint(profile,packet,input),dispatchFixedInpaint(profile,packet,input)]);
  expect(outcomes.filter(result=>result.status==='fulfilled')).toHaveLength(1);await expect(dispatchFixedInpaint(profile,packet,input)).rejects.toThrow('will not be resent');expect(controls.enqueue).toHaveBeenCalledTimes(1);
});

test.each(['queued','done','failed','lost'])('a matching existing %s receipt blocks reservation and dispatch',async state=>{
  await fixture();controls.existing={id:'historical-'+state};await expect(dispatchFixedInpaint(profile,packet,input)).rejects.toThrow('receipt historical-'+state);
  expect(controls.enqueue).not.toHaveBeenCalled();expect(readResearchBudget().calls).toHaveLength(0);expect(readFixedInpaint(profile.key)).toBeNull();
});

test('an interrupted submission retains an unknown reservation and cannot resend under another profile',async()=>{
  await fixture();controls.enqueue.mockRejectedValue(new Error('Synthetic connection interruption.'));
  await expect(dispatchFixedInpaint(profile,packet,input)).rejects.toThrow('connection interruption');expect(readResearchBudget().calls[0]).toMatchObject({status:'unknown',units:25});expect(readFixedInpaint(profile.key)?.error).toContain('interruption');
  await expect(dispatchFixedInpaint(profile,packet,input)).rejects.toThrow('will not be resent');
  await expect(dispatchFixedInpaint({...profile,key:'synthetic-other-profile'},packet,input)).rejects.toThrow('already has a reservation');expect(controls.enqueue).toHaveBeenCalledTimes(1);expect(researchBudgetUsage().reservedUnits).toBe(25);
});

test('historical saved one-shot receipts and their original call IDs are read without modification',async()=>{
  const saved=await fixture(),old={version:1,packet,callId:RESEARCH_PHASE+'-managed-equipment-historical',jobId:'old-queue-receipt',error:'Prior diagnostic ended.'},json=JSON.stringify(old);saved.set(profile.key,json);
  expect(readFixedInpaint(profile.key)).toEqual(old);await expect(dispatchFixedInpaint(profile,packet,input)).rejects.toThrow('will not be resent');expect(saved.get(profile.key)).toBe(json);expect(controls.enqueue).not.toHaveBeenCalled();expect(readResearchBudget().calls).toHaveLength(0);
});

test('old and new stage spending share the same conservative holds and higher late bills can block dispatch',async()=>{
  await fixture();await reserveResearchCall({id:'prior-body',label:'Prior body evidence',stage:'body',units:21});await reserveResearchCall({id:'prior-equipment',label:'Prior equipment evidence',stage:'equipment',units:25});
  await recordResearchOutcome('prior-body',{status:'completed',billedUnits:18.25});await recordResearchOutcome('prior-equipment',{status:'completed',billedUnits:25});
  await dispatchFixedInpaint(profile,packet,input);expect(researchBudgetUsage()).toMatchObject({reservedUnits:71,billedUnits:43.25,stageUnits:{body:21,equipment:50,replication:0},pilotRemaining:129});
  await recordResearchOutcome('prior-equipment',{status:'completed',billedUnits:126});
  controls.hash='synthetic-different-payload';
  await expect(dispatchFixedInpaint({...profile,key:'synthetic-new-profile'},packet,input)).rejects.toThrow('billed stage exceeded');expect(controls.enqueue).toHaveBeenCalledTimes(1);expect(researchBudgetUsage()).toMatchObject({reservedUnits:172,stageUnits:{equipment:151}});
});

test('failure to persist the one-shot receipt keeps the reservation and prevents any paid submission or later resend',async()=>{
  const saved=await fixture();let fail=true;
  vi.stubGlobal('localStorage',{getItem:(key:string)=>saved.get(key)??null,setItem:(key:string,value:string)=>{if(fail&&key===profile.key)throw new Error('Synthetic storage failure.');saved.set(key,value);}});
  await expect(dispatchFixedInpaint(profile,packet,input)).rejects.toThrow('storage failure');expect(controls.enqueue).not.toHaveBeenCalled();expect(readResearchBudget().calls[0]).toMatchObject({status:'reserved',units:25});expect(readFixedInpaint(profile.key)).toBeNull();
  fail=false;await expect(dispatchFixedInpaint(profile,packet,input)).rejects.toThrow('already has a reservation');expect(controls.enqueue).not.toHaveBeenCalled();expect(researchBudgetUsage().reservedUnits).toBe(25);
});

test('evidence export reconciles freely and includes only stored images, receipts and shared accounting',async()=>{
  await fixture();await dispatchFixedInpaint(profile,packet,input);controls.jobs=[{id:'synthetic-local-receipt',state:'done'}];
  const job={id:'synthetic-local-receipt',state:'done',jobs:[{results:[{sha:'synthetic-image-sha',label:'0'}]}]};controls.get.mockResolvedValue(job);controls.getBlob.mockResolvedValue(new Blob([new Uint8Array([1,2,3])]));
  const exported=await exportFixedInpaint(profile.key);expect(exported).toMatchObject({version:1,probe:{packet,jobId:job.id},job,images:[{sha:'synthetic-image-sha',label:'0',png:'AQID'}],currentQueueState:'done'});
  expect(JSON.stringify(exported)).not.toContain(controls.key);expect(controls.enqueue).toHaveBeenCalledTimes(1);expect(controls.reconcile).toHaveBeenCalledTimes(2);
  controls.getBlob.mockResolvedValue(undefined);await expect(exportFixedInpaint(profile.key)).rejects.toThrow('image is missing');expect(controls.enqueue).toHaveBeenCalledTimes(1);
});
