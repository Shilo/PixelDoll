import * as db from '../../src/lib/store/db.ts';
import { recoverIdle, lostEstimateInputs, type RecoverySpec, type RecoveryJob } from './recovery.ts';
const element=<T extends HTMLElement>(id:string)=>document.getElementById(id) as T;
const status=element('status'),report=element('report'),diagnostics=element('diagnostics'),download=element<HTMLButtonElement>('download'),inspect=element<HTMLButtonElement>('inspect');
let artifact:Awaited<ReturnType<typeof recoverIdle>>|undefined;
try{localStorage.setItem('pixeldoll.agentKey','off');}catch{element('connection').textContent='Could not persist agent opt-out. Keep Studio closed until storage is available.';inspect.disabled=true;}
element('keyless').onclick=()=>{localStorage.setItem('pixeldoll.agentKey','off');};
element('enable').onclick=()=>{localStorage.removeItem('pixeldoll.agentKey');element('connection').textContent='Agent connection may be enabled on the next Studio load. No credential was fetched; no page was opened.';};
inspect.onclick=async()=>{inspect.disabled=true;download.disabled=true;artifact=undefined;report.textContent='';diagnostics.replaceChildren();status.textContent='Reading saved creation and completed results only…';try{
 const [pending,jobs]=await Promise.all([db.get<{spec?:RecoverySpec}>('projects','studio-create'),db.all<RecoveryJob>('jobs')]);if(!pending?.spec)throw Error('No saved failed creation was found. This helper does not start or recreate a creation.');
 const spec={...pending.spec},seed=element<HTMLInputElement>('seed').value;if(seed.trim())spec.seed=Number(seed);
 for(const item of await lostEstimateInputs(spec,jobs,db.getBlob)){const row=document.createElement('section'),heading=document.createElement('h2'),img=document.createElement('img'),details=document.createElement('pre');heading.textContent='Lost estimator input (not resent)';img.alt=`Saved ${item.w} by ${item.h} input: ${item.opaquePixels} opaque pixels`;img.src=URL.createObjectURL(new Blob([item.png as Uint8Array<ArrayBuffer>],{type:'image/png'}));const {png:_,...evidence}=item;details.textContent=JSON.stringify(evidence,null,2);row.append(heading,img,details);diagnostics.append(row);}
 artifact=await recoverIdle(spec,jobs,db.getBlob,element<HTMLInputElement>('name').value||`${spec.name} recovered idle`);report.textContent=JSON.stringify(artifact.report,null,2);status.textContent=`Validated idle only: four independent views, ${artifact.project.manifest.rig.animations[0].cells} frames per view. Review warnings below. No API requests or writes occurred.`;download.disabled=false;
}catch(e){status.textContent=`Recovery stopped: ${(e as Error).message}`;}finally{inspect.disabled=false;}};
download.onclick=()=>{if(!artifact)return;const url=URL.createObjectURL(new Blob([artifact.zip as Uint8Array<ArrayBuffer>],{type:'application/zip'})),a=document.createElement('a');a.href=url;a.download='audit-recovered-independent-idle.pixeldoll.zip';a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);};
