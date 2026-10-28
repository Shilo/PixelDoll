import { Queue, type JobRec } from '../../lib/pixellab/queue.ts';
import { api } from '../../lib/pixellab/client.ts';
import { rawClip, poseCallGens } from '../../lib/rig/clips.ts';
import { encodePngBytes } from '../../lib/image/pngraw.ts';
import { base64ToBytes, bytesToBase64 } from '../../lib/image/png.ts';
import { decodePngBytes } from '../../lib/image/pngraw.ts';
import * as db from '../../lib/store/db.ts';
import { paddedReference, renderPoses, type MotionDocument } from './model.ts';
import type { Balance } from '../../lib/pixellab/routes.ts';
import { sha256, stableStringify } from '../../lib/image/hash.ts';
export const LAB_TAG='motion-lab-2026-10-28',LAB_CAP=914;
// Isolated records/channel prevent this lab from resuming unrelated Studio work on the same origin.
export const labQueue=new Queue({all:async()=>(await db.all<JobRec>('jobs')).filter(r=>r.tag===LAB_TAG),channel:LAB_TAG});
type DocumentRecord=Omit<MotionDocument,'fixture'|'clip'>&{fixture:Pick<MotionDocument['fixture'],'id'|'name'|'cell'>;clip:Pick<MotionDocument['clip'],'id'|'name'|'source'|'duration'|'loop'|'nominalSpeed'|'events'>};
export interface CandidateReview { accepted:boolean[];status:'unreviewed'|'needs-work'|'accepted'|'rejected';notes:string;terminalHold:number }
interface Reservation { id:string;jobId?:string;estimate:number;label:string;document:DocumentRecord;seed:number;createdAt:string;error?:string;review?:CandidateReview }
export interface LabLedger { version:1;reservations:Reservation[] }
const LEDGER='pixeldoll.motionLab.2026-10-28';
export function readLedger():LabLedger{
  const text=localStorage.getItem(LEDGER);if(!text)return{version:1,reservations:[]};
  const ledger=JSON.parse(text) as LabLedger;if(ledger.version!==1||!Array.isArray(ledger.reservations))throw new Error('Unsupported motion lab ledger. Export it before clearing this origin.');return ledger;
}
const save=(ledger:LabLedger)=>localStorage.setItem(LEDGER,JSON.stringify(ledger));
export function candidateRecord(jobId:string){return readLedger().reservations.find(r=>r.jobId===jobId);}
export async function saveReview(jobId:string,review:CandidateReview){
  if(!Number.isFinite(review.terminalHold)||review.terminalHold<0||review.terminalHold>10000||!Array.isArray(review.accepted)||review.accepted.some(v=>typeof v!=='boolean')||!['unreviewed','needs-work','accepted','rejected'].includes(review.status)||typeof review.notes!=='string')throw new Error('Review needs valid frame selections, status, notes and a 0-10000 ms final hold.');
  if(!navigator.locks)throw new Error('Saving a candidate review requires browser Web Locks.');
  await navigator.locks.request(LAB_TAG+'-budget',()=>{const ledger=readLedger(),row=ledger.reservations.find(r=>r.jobId===jobId);if(!row)throw new Error('Candidate reservation is missing.');row.review=structuredClone(review);save(ledger);});
}
export async function exportReviewed(jobId:string){
  const row=candidateRecord(jobId),job=(await db.all<JobRec>('jobs')).find(j=>j.id===jobId);
  if(!row?.review||row.review.status!=='accepted'||!row.review.notes.trim()||job?.state!=='done')throw new Error('Finish the job, record review notes and mark it accepted before exporting a reviewed clip.');
  const results=job.jobs.flatMap(j=>j.results),frames=[];
  for(let i=0;i<results.length;i++)if(row.review.accepted[i]){
    const blob=await db.getBlob(results[i].sha);if(!blob)throw new Error('A reviewed image is missing.');
    frames.push({sourceIndex:i,sha:results[i].sha,duration:row.document.durations[Math.min(i,row.document.durations.length-1)],png:bytesToBase64(new Uint8Array(await blob.arrayBuffer()))});
  }
  if(frames.length<3)throw new Error('Select at least three reviewed frames.');
  frames.at(-1)!.duration+=row.review.terminalHold;
  return{version:1,kind:'pixeldoll-reviewed-motion',label:row.label,source:row.document.clip,fixture:row.document.fixture,direction:row.document.direction,padding:row.document.padding,review:row.review,frames};
}
export async function connectLab():Promise<Balance|null>{
  await labQueue.connect();
  let off=false;try{off=localStorage.getItem('pixeldoll.agentKey')==='off';}catch{/* An unavailable optional kill switch does not create a credential. */}
  if(!import.meta.env.DEV||import.meta.env.MODE!=='agent'||window.top!==window||off)return null;
  const response=await fetch('/__dev/pixellab-key',{cache:'no-store'});
  if(!response.ok)throw new Error(`Agent access is unavailable (${response.status}). Offline editing still works.`);
  const key=await response.text();labQueue.setKey(key);
  const balance=await api<Balance>(key,'GET','/balance');labQueue.setBalance(balance,key);return balance;
}
export async function generateCandidate(document:MotionDocument,seed:number):Promise<string>{
  if(!Number.isSafeInteger(seed)||seed<1)throw new Error('Use a positive seed for an intentional, resumable candidate.');
  if(!labQueue.key)throw new Error('Live generation requires the localhost agent server.');
  const {result,poses}=renderPoses(document),gens=poseCallGens(poses.length);
  const id=await sha256(new TextEncoder().encode(stableStringify({document,seed})));
  if(!navigator.locks)throw new Error('Safe live generation requires browser Web Locks. Offline editing is available.');
  const reservation=await navigator.locks.request(LAB_TAG+'-budget',()=>{
    const ledger=readLedger(),old=ledger.reservations.find(r=>r.id===id);
    if(old){if(old.jobId)return old;throw new Error('This candidate has an unresolved reservation. Inspect it; do not send it again.');}
    if(ledger.reservations.reduce((n,r)=>n+r.estimate,0)+gens>LAB_CAP)throw new Error('The approved remaining generation allowance is exhausted.');
    const {samples:_samples,reference:_reference,...clip}=document.clip;
    const {references:_references,...fixture}=document.fixture;
    const row:Reservation={id,estimate:gens,label:`${document.fixture.name} / ${document.clip.name} / ${document.direction} / ${seed} / ${id.slice(-8)}`,document:structuredClone({...document,clip,fixture}),seed,createdAt:new Date().toISOString()};
    ledger.reservations.push(row);save(ledger);return row;
  });
  if(reservation.jobId)return reservation.jobId;
  const update=async(fields:Partial<Reservation>)=>navigator.locks.request(LAB_TAG+'-budget',()=>{const ledger=readLedger(),row=ledger.reservations.find(r=>r.id===id);if(!row)throw new Error('The reserved candidate record is missing.');Object.assign(row,fields);save(ledger);});
  try{
    const ref=document.fixture.references[document.direction]!;
    const image=paddedReference(await decodePngBytes(base64ToBytes(ref.png)),document.padding);
    const first=bytesToBase64(await encodePngBytes(image));
    const request=rawClip({first,rest:result.rest,keypoints:poses,description:document.fixture.id==='chibi'?'a short bald humanoid in a gray shirt and dark pants':'a bald humanoid with the same appearance and colors as the reference, empty hands',action:document.clip.id==='attack'?'overhead arm strike, empty hands, no weapon, no props, no effects':document.clip.id==='death'?'falling down and lying still, no effects':document.clip.id,dir:document.direction,seed});
    const job=await labQueue.enqueue(request,{label:reservation.label,tag:LAB_TAG,activityScope:LAB_TAG});
    await update({jobId:job.id});return job.id;
  }catch(e){await update({error:(e as Error).message});throw e;}
}
export async function exportEvidence(){
  const ledger=readLedger(),jobs=await db.all<JobRec>('jobs'),records=[];
  for(const reservation of ledger.reservations){const job=jobs.find(j=>j.id===reservation.jobId);const images=[],inputs=[];
    for(const sha of job?.inputs??[]){const blob=await db.getBlob(sha);if(!blob)throw new Error('A saved request image is missing.');inputs.push({sha,png:bytesToBase64(new Uint8Array(await blob.arrayBuffer()))});}
    for(const sub of job?.jobs??[])for(const r of sub.results){const blob=await db.getBlob(r.sha);if(!blob)throw new Error('A saved candidate image is missing.');images.push({...r,png:bytesToBase64(new Uint8Array(await blob.arrayBuffer()))});}
    records.push({...reservation,job,inputs,images});
  }
  return{version:1,cap:LAB_CAP,reserved:ledger.reservations.reduce((n,r)=>n+r.estimate,0),records};
}
