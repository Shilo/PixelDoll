import { Queue, requestIdentity, live, MOTION_LAB_TAG, type JobRec } from '../../lib/pixellab/queue.ts';
import { api } from '../../lib/pixellab/client.ts';
import { rawClip, poseCallGens } from '../../lib/rig/clips.ts';
import { encodePngBytes } from '../../lib/image/pngraw.ts';
import { base64ToBytes, bytesToBase64,pngSize } from '../../lib/image/png.ts';
import { decodePngBytes } from '../../lib/image/pngraw.ts';
import * as db from '../../lib/store/db.ts';
import { paddedReference, renderPoses,actionOfMotion, type MotionDocument } from './model.ts';
import type { Balance,Req,SubmitResponse } from '../../lib/pixellab/routes.ts';
import { sha256, stableStringify } from '../../lib/image/hash.ts';
import { hasAll } from '../../lib/rig/poses.ts';
import type { MotionPoint } from '../../lib/rig/motion.ts';
import {get} from 'svelte/store';
import {RESEARCH_PHASE,RESEARCH_PHASE_CAP,readResearchBudget,reserveResearchCall,recordResearchOutcome,type ResearchStage} from './research-budget.ts';
import {summarizeResearchBilling} from './research-billing.ts';
export const LAB_TAG=MOTION_LAB_TAG,LAB_PHASE=RESEARCH_PHASE,LAB_CAP=RESEARCH_PHASE_CAP;
// Isolated records/channel prevent this lab from resuming unrelated Studio work on the same origin.
export const labQueue=new Queue({recordTag:LAB_TAG,channel:LAB_TAG,lockName:LAB_TAG});
if(import.meta.hot)import.meta.hot.dispose(()=>labQueue.disconnect());
export type DocumentRecord=Omit<MotionDocument,'fixture'|'clip'>&{fixture:Pick<MotionDocument['fixture'],'id'|'name'|'cell'>&Partial<Pick<MotionDocument['fixture'],'pivot'|'camera'|'directions'|'depthReference'|'depthSource'>>;clip:Pick<MotionDocument['clip'],'id'|'name'|'source'|'duration'|'loop'|'nominalSpeed'|'events'|'action'>};
export interface EquipmentContext {kind:'equipment-dress'|'equipment-pose'|'equipment-grid';name:string;slot:string;prompt:string;key:'green'|'magenta'|'blue'|'azure';pad:number;referenceSha:string;bodyId:string;bodyIds:string[];references:Partial<Record<MotionDocument['direction'],{sha:string;index:number}>>;dressId?:string;rotated?:boolean;indices?:number[]}
export interface CandidateReview { accepted:boolean[];status:'unreviewed'|'needs-work'|'accepted'|'rejected';notes:string;terminalHold:number;durationOverrides?:Record<number,number> }
interface Reservation { id:string;phase?:string;jobId?:string;estimate:number;label:string;document:DocumentRecord;seed:number;createdAt:string;error?:string;review?:CandidateReview;context?:EquipmentContext }
export interface LabLedger { version:1;reservations:Reservation[] }
const LEDGER='pixeldoll.motionLab.2026-10-28';
export function readLedger():LabLedger{
  const text=localStorage.getItem(LEDGER);if(!text)return{version:1,reservations:[]};
  const ledger=JSON.parse(text) as LabLedger;if(ledger.version!==1||!Array.isArray(ledger.reservations))throw new Error('Unsupported motion lab ledger. Export it before clearing this origin.');return ledger;
}
const save=(ledger:LabLedger)=>localStorage.setItem(LEDGER,JSON.stringify(ledger));
export const phaseReserved=(ledger:LabLedger,charges=new Map(get(labQueue).jobs.map(j=>[j.id,j.gens])))=>ledger.reservations.filter(r=>r.phase===LAB_PHASE).reduce((n,r)=>n+Math.max(r.estimate,r.jobId?(charges.get(r.jobId)??0):0),0);
export function candidateRecord(jobId:string){return readLedger().reservations.findLast(r=>r.jobId===jobId);}
export async function saveReview(jobId:string,review:CandidateReview){
  if(!Number.isFinite(review.terminalHold)||review.terminalHold<0||review.terminalHold>10000||!Array.isArray(review.accepted)||review.accepted.some(v=>typeof v!=='boolean')||!['unreviewed','needs-work','accepted','rejected'].includes(review.status)||typeof review.notes!=='string')throw new Error('Review needs valid frame selections, status, notes and a 0-10000 ms final hold.');
  if(Object.entries(review.durationOverrides??{}).some(([i,ms])=>!Number.isSafeInteger(+i)||+i<0||+i>=review.accepted.length||!Number.isFinite(ms)||ms<10||ms>10000))throw new Error('Timing overrides need valid frame indexes and 10-10000 ms durations.');
  if(!navigator.locks)throw new Error('Saving a candidate review requires browser Web Locks.');
  await navigator.locks.request(LAB_TAG+'-budget',()=>{const ledger=readLedger(),row=ledger.reservations.findLast(r=>r.jobId===jobId);if(!row)throw new Error('Candidate reservation is missing.');row.review=structuredClone(review);save(ledger);});
}
export async function exportReviewed(jobId:string){
  const row=candidateRecord(jobId),job=(await db.all<JobRec>('jobs')).find(j=>j.id===jobId);
  if(!row?.review||row.review.status!=='accepted'||!row.review.notes.trim()||job?.state!=='done')throw new Error('Finish the job, record review notes and mark it accepted before exporting a reviewed clip.');
  if(row.context)throw new Error('Equipment requires layer extraction and alignment review. Export the raw evidence for the offline evaluator.');
  const pivot=row.document.fixture.pivot;if(!pivot)throw new Error('This historical candidate lacks its original pivot. Keep the raw evidence; use a current body document for reviewed export.');
  const cell={w:row.document.fixture.cell.w+2*row.document.padding,h:row.document.fixture.cell.h+2*row.document.padding};
  const params=job.params as {first_frame?:{$blob?:string};first_frame_keypoints?:MotionPoint[];keypoints?:MotionPoint[][]};
  if(!params.first_frame?.$blob||!hasAll(params.first_frame_keypoints)||!params.keypoints?.every(hasAll))throw new Error('The candidate is missing its original reference or requested rig poses.');
  const reference=await db.getBlob(params.first_frame.$blob);if(!reference)throw new Error('The candidate reference artwork is missing.');
  const results=job.jobs.flatMap(j=>j.results),frames=[];
  if(params.keypoints.length!==results.length)throw new Error('The image and rig pose counts differ.');
  for(let i=0;i<results.length;i++)if(row.review.accepted[i]){
    const blob=await db.getBlob(results[i].sha);if(!blob)throw new Error('A reviewed image is missing.');
    const bytes=new Uint8Array(await blob.arrayBuffer()),size=pngSize(bytes);if(size?.w!==cell.w||size.h!==cell.h)throw new Error('A reviewed image does not match its recorded padded canvas.');
    frames.push({sourceIndex:i,sha:results[i].sha,duration:row.review.durationOverrides?.[i]??row.document.durations[Math.min(i,row.document.durations.length-1)],keypoints:params.keypoints[i],png:bytesToBase64(bytes)});
  }
  if(frames.length<3)throw new Error('Select at least three reviewed frames.');
  frames.at(-1)!.duration+=row.review.terminalHold;
  return{version:1,kind:'pixeldoll-reviewed-motion',label:row.label,source:row.document.clip,fixture:row.document.fixture,direction:row.document.direction,loop:row.document.clip.loop,cell,pivot:{x:pivot.x+row.document.padding,y:pivot.y+row.document.padding},padding:row.document.padding,reference:{png:bytesToBase64(new Uint8Array(await reference.arrayBuffer())),keypoints:params.first_frame_keypoints},review:row.review,frames};
}
export async function connectLab():Promise<Balance|null>{
  await labQueue.connect();
  let off=false;try{off=localStorage.getItem('pixeldoll.agentKey')==='off';}catch{/* An unavailable optional kill switch does not create a credential. */}
  if(!import.meta.env.DEV||import.meta.env.MODE!=='agent'||window.top!==window||off)return null;
  const response=await fetch('/__dev/pixellab-key',{cache:'no-store'});
  if(!response.ok)throw new Error(`Agent access is unavailable (${response.status}). Offline editing still works.`);
  const key=await response.text();
  const balance=await api<Balance>(key,'GET','/balance');labQueue.setKey(key);labQueue.setBalance(balance,key);return balance;
}
export async function generateCandidate(document:MotionDocument,seed:number,stage:ResearchStage='body'):Promise<string>{
  if(document.fixture.directions.find(d=>d.id===document.direction)?.mirrorOf)throw new Error('This view derives from mirrored frozen source frames. Generate and review its source direction instead.');
  const {result,poses}=renderPoses(document),ref=document.fixture.references[document.direction]!;
  const image=paddedReference(await decodePngBytes(base64ToBytes(ref.png)),document.padding),first=bytesToBase64(await encodePngBytes(image));
  const action=actionOfMotion(document.clip);
  const description=(document.fixture.id==='chibi'?'a short bald humanoid in a gray shirt and dark pants':'a bald humanoid with the same appearance and colors as the reference, empty hands')+(document.hands==='closed-fists'?'; both empty hands clenched into closed fists ready to grasp a weapon handle, no weapon or props':'');
  const request=rawClip({first,rest:result.rest,keypoints:poses,description,action:action==='attack'?'overhead arm strike, empty hands, no weapon, no props, no effects':action==='death'?'falling down and lying still, no effects':action,dir:document.direction,seed});
  return enqueueLab(document,seed,request,poseCallGens(poses.length),undefined,stage);
}
/** Reconcile persisted queue receipts before another paid reservation or evidence export. */
export async function reconcileResearchJobs(){
  const jobs=new Map(get(labQueue).jobs.map(j=>[j.id,j]));
  for(const call of readResearchBudget().calls){const owned=(call.jobIds??[]).flatMap(id=>jobs.get(id)?[jobs.get(id)!]:[]);if(!owned.length)continue;
    // Queue.gens defaults to zero when usage is absent. Only explicit provider usage can settle a bill.
    const reports=owned.flatMap(j=>j.jobs.length?j.jobs.map(s=>({id:s.id,status:s.status,usage:s.usage})):[{id:j.id,status:j.state==='done'?'completed':j.state==='failed'?'failed':j.state,usage:(j.response as SubmitResponse|undefined)?.usage}]);
    const billing=summarizeResearchBilling(reports),observed=billing.status==='accepted'&&owned.some(j=>j.state==='lost')?'unknown':billing.status;
    const status=call.status==='completed'||call.status==='failed'?call.status:observed;
    if(status===call.status&&billing.billedUnits<=(call.billedUnits??0)&&billing.note===call.note)continue;
    await recordResearchOutcome(call.id,{...billing,status});
  }
}
/** All research POSTs are resume-safe: inspect the receipt Queue would reuse before reserving new money. */
export function existingLabRequest(requestHash:string):JobRec|undefined{
  const matches=[...get(labQueue).jobs].reverse().filter(j=>j.requestHash===requestHash).sort((a,b)=>b.createdAt-a.createdAt);
  return matches.find(live)??matches.find(j=>j.state==='done')??matches[0];
}
/** Every paid lab route shares the same atomic budget and unresolved-outcome contract. Preparation is free. */
export async function enqueueLab(document:DocumentRecord,seed:number,request:Req,gens:number,context?:EquipmentContext,stage:ResearchStage=context?'equipment':'body'):Promise<string>{
  if(!Number.isSafeInteger(seed)||seed<1)throw new Error('Use a positive seed for an intentional, resumable candidate.');
  if(!labQueue.key)throw new Error('Live generation requires the localhost agent server.');
  if(!Number.isSafeInteger(gens)||gens<1)throw new Error('A paid request needs a positive whole generation reservation.');
  const {requestHash}=await requestIdentity(request);
  // Seeded queue receipts are reused even with cache:false. Reuse is an offline control, not a new charge.
  const cached=existingLabRequest(requestHash);if(cached){if(cached.state==='done'&&candidateRecord(cached.id))return cached.id;throw new Error(`Existing ${cached.state} receipt ${cached.id} matches this request. Inspect it; no new reservation or request was created.`);}
  // Metadata describes the experiment; the provider request hash identifies the paid work across documents and tabs.
  const id=LAB_PHASE+'-'+requestHash;
  if(!navigator.locks)throw new Error('Safe live generation requires browser Web Locks. Offline editing is available.');
  await reconcileResearchJobs();
  const reservation=await navigator.locks.request(LAB_TAG+'-budget',async()=>{
    const ledger=readLedger(),old=ledger.reservations.find(r=>r.id===id);
    if(old){if(old.jobId)return old;throw new Error('This candidate has an unresolved reservation. Inspect it; do not send it again.');}
    if(phaseReserved(ledger)+gens>LAB_CAP)throw new Error('The approved remaining generation allowance is exhausted.');
    const {id:clipId,name,source,duration,loop,nominalSpeed,events,action}=document.clip,clip={id:clipId,name,source,duration,loop,nominalSpeed,events,action};
    const {id:fixtureId,name:fixtureName,cell,pivot,camera,directions,depthReference,depthSource}=document.fixture,fixture={id:fixtureId,name:fixtureName,cell,pivot,camera,directions,...(depthReference?{depthReference,depthSource}:{})};
    const row:Reservation={id,phase:LAB_PHASE,estimate:gens,label:`${context?`${context.name} ${context.kind} / `:''}${document.fixture.name} / ${document.clip.name} / ${document.direction} / ${seed} / ${id.slice(-8)}`,document:structuredClone({...document,clip,fixture}),seed,createdAt:new Date().toISOString(),...(context?{context}: {})};
    const approved=await reserveResearchCall({id,label:row.label,stage,units:gens});if(!approved.created)throw new Error('This research call already has a reservation. Inspect its receipt; do not resend it.');
    ledger.reservations.push(row);save(ledger);return row;
  });
  if(reservation.jobId)return reservation.jobId;
  const update=async(fields:Partial<Reservation>)=>navigator.locks.request(LAB_TAG+'-budget',()=>{const ledger=readLedger(),row=ledger.reservations.find(r=>r.id===id);if(!row)throw new Error('The reserved candidate record is missing.');Object.assign(row,fields);save(ledger);});
  try{
    const job=await labQueue.enqueue(request,{label:reservation.label,tag:LAB_TAG,activityScope:LAB_TAG});
    await update({jobId:job.id});await recordResearchOutcome(id,{status:'accepted',jobIds:[job.id]});return job.id;
  }catch(e){await update({error:(e as Error).message});await recordResearchOutcome(id,{status:'unknown',note:(e as Error).message});throw e;}
}
export async function exportEvidence(phase?:string){
  await reconcileResearchJobs();
  const ledger=readLedger(),jobs=new Map((await db.all<JobRec>('jobs')).map(j=>[j.id,j])),records=[],pngs=new Map<string,Promise<string>>();
  const pngOf=(sha:string)=>{let value=pngs.get(sha);if(!value){value=(async()=>{const blob=await db.getBlob(sha);if(!blob)throw new Error('A saved evidence image is missing.');return bytesToBase64(new Uint8Array(await blob.arrayBuffer()));})();pngs.set(sha,value);}return value;};
  for(const reservation of ledger.reservations.filter(row=>!phase||row.phase===phase)){const job=reservation.jobId?jobs.get(reservation.jobId):undefined;
    const inputs=await Promise.all((job?.inputs??[]).map(async sha=>({sha,png:await pngOf(sha)})));
    const images=await Promise.all((job?.jobs.flatMap(j=>j.results)??[]).map(async r=>({...r,png:await pngOf(r.sha)})));
    records.push({...reservation,job,inputs,images});
  }
  const uniqueJobs=new Map(records.filter(r=>r.job).map(r=>[r.job!.id,r.job!]));
  return{version:1,phase:LAB_PHASE,...(phase?{selectedPhase:phase}:{}),cap:LAB_CAP,researchBudget:readResearchBudget(),reserved:phaseReserved(ledger,new Map([...uniqueJobs.values()].map(j=>[j.id,j.gens]))),estimatedReserved:ledger.reservations.filter(r=>r.phase===LAB_PHASE).reduce((n,r)=>n+r.estimate,0),historicalReserved:ledger.reservations.reduce((n,r)=>n+r.estimate,0),priorResearchGenerations:86,originalCap:1000,uniqueJobs:uniqueJobs.size,providerGenerations:[...uniqueJobs.values()].reduce((n,j)=>n+j.gens,0),records};
}
