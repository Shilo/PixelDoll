// One bounded continuation of the original 1,000-generation research allowance.
import {api} from '../../lib/pixellab/client.ts';
import type {Job} from '../../lib/pixellab/routes.ts';
export const CUSTOM_TEST_KEY='pixeldoll.motionLab.custom-v3.2026-11-01';
export const CUSTOM_CHARACTER='f69d3f89-043e-4e04-b904-dd97871c5d06';
export const customRequest=()=>({character_id:CUSTOM_CHARACTER,mode:'skeleton-v3',animation_name:'Motion Lab planted overhead comparison 2026-11-01',action_description:'overhead strike with closed right fist',directions:['south','east'],frame_count:8,move:{name:'chop',energy:0.8},poses:Array.from({length:8},(_,i)=>({frame:i+1,right_foot:[0,0,0],left_foot:[0,0,0]}))});
export function customTestRecord(){const saved=localStorage.getItem(CUSTOM_TEST_KEY);return saved?JSON.parse(saved) as {reserved:number;status:string;request:ReturnType<typeof customRequest>;result?:unknown;error?:string;at:string}:null;}
export function canCorrectCustomTest(row=customTestRecord()){
  const result=row?.result as {isError?:boolean;content?:{type:string;text?:string}[]}|undefined;
  return !!row&&row.status==='receipt'&&Object.hasOwn(row.request,'seed')&&result?.isError===true&&result.content?.some(c=>c.type==='text'&&c.text?.includes('1 validation error for call[animate_character]\nseed\n  Unexpected keyword argument'))===true;
}
export async function customBilling(key:string){
  const result=customTestRecord()?.result as {isError?:boolean;content?:{type:string;text?:string}[]}|undefined;
  const ids=[...new Set((result?.content??[]).flatMap(c=>[...(c.text??'').matchAll(/job ([0-9a-f-]{36})\b/g)].map(m=>m[1])))];
  if(result?.isError||ids.length!==2)throw new Error('An accepted two-job receipt is required before reading billing.');
  return Promise.all(ids.map(async id=>{const job=await api<Job>(key,'GET',`/background-jobs/${id}`);return{id:job.id,status:job.status,usage:job.usage??null,lastResponseStatus:job.last_response?.status??null};}));
}
export async function runCustomTest(submit:(args:ReturnType<typeof customRequest>)=>Promise<unknown>){
  if(!navigator.locks)throw new Error('This comparison requires browser Web Locks.');
  return navigator.locks.request(CUSTOM_TEST_KEY,async()=>{
    const previous=customTestRecord();
    if(previous&&!canCorrectCustomTest(previous))throw new Error('This comparison already has a reservation. Export and inspect its outcome; it will not be resent.');
    // Only the confirmed pre-dispatch seed validation refusal can be corrected by a new explicit click.
    const row={reserved:8,status:'submitted',request:customRequest(),at:new Date().toISOString(),previous:previous??undefined,result:undefined as unknown,error:undefined as string|undefined};
    // Reserve the entire remaining allowance before the network call, retaining unknown outcomes.
    localStorage.setItem(CUSTOM_TEST_KEY,JSON.stringify(row));
    try{row.result=await submit(row.request);row.status='receipt';localStorage.setItem(CUSTOM_TEST_KEY,JSON.stringify(row));return row.result;}
    catch(e){row.status='unknown';row.error=(e as Error).message;localStorage.setItem(CUSTOM_TEST_KEY,JSON.stringify(row));throw e;}
  });
}
