<script lang="ts">
  import { onDestroy,untrack } from 'svelte';
  import type { JobRec } from '../../lib/pixellab/queue.ts';
  import { getBlob } from '../../lib/store/db.ts';
  import { candidateRecord, saveReview, exportReviewed, type CandidateReview } from './run.ts';
  import {decodePngBytes} from '../../lib/image/pngraw.ts';
  import {borderPx,bodyComponents} from '../../lib/rig/clips.ts';
  import AttachmentEditor from './AttachmentEditor.svelte';
  import SoleEditor from './SoleEditor.svelte';
  import type {Img} from '../../lib/image/png.ts';
  import type {Keypoint} from '../../lib/rig/rig.ts';
  let {job,buffer=false}:{job:JobRec;buffer?:boolean}=$props();
  let urls=$state<string[]>([]),error=$state(''),index=$state(0),playing=$state(false),saved=$state('');
  let diagnostics=$state<{border:number;detached:number}[]>([]);
  let images=$state<Img[]>([]),authorAttachment=$state(false),measureFeet=$state(false);
  let review=$state<CandidateReview>({accepted:[],status:'unreviewed',notes:'',terminalHold:0});
  const record=$derived.by(()=>{const candidate=candidateRecord(job.id);return candidate?.document?candidate:undefined;}),durations=$derived(record?.document.durations??[]);
  const results=$derived(job.jobs.flatMap(j=>j.results));
  const finished=$derived(job.state==='done'),resultKey=$derived(results.map(r=>r.sha).join(':'));
  $effect(()=>{if(!finished||!resultKey)return;const values=untrack(()=>results),stored=untrack(()=>record?.review);let disposed=false;const created:string[]=[];
    void(async()=>{const measured=[],decoded=[];for(const result of values){const blob=await getBlob(result.sha);if(disposed)return;if(!blob)throw new Error('Candidate image is missing from storage.');created.push(URL.createObjectURL(blob));const image=await decodePngBytes(new Uint8Array(await blob.arrayBuffer()));decoded.push(image);measured.push({border:borderPx(image),detached:bodyComponents(image).detachedPixels});}if(!disposed){urls=created;images=decoded;diagnostics=measured;review=stored??{accepted:created.map((_,i)=>!buffer||i<created.length-1),status:'unreviewed',notes:'',terminalHold:buffer?600:0};}})().catch(e=>{if(!disposed)error=(e as Error).message;});
    return()=>{disposed=true;for(const url of created)URL.revokeObjectURL(url);};
  });
  $effect(()=>{if(!record||!playing||!urls.length)return;const last=review.accepted.lastIndexOf(true),next=()=>{if(index===last&&!record.document.clip.loop){playing=false;return;}const start=index;do{index=(index+1)%urls.length;}while(!review.accepted[index]&&index!==start);};const timer=setTimeout(next,(review.durationOverrides?.[index]??durations[Math.min(index,durations.length-1)]??120)+(index===last?review.terminalHold:0));return()=>clearTimeout(timer);});
  async function persist(){try{await saveReview(job.id,JSON.parse(JSON.stringify(review)));saved='Review saved locally.';error='';}catch(e){error=(e as Error).message;}}
  async function exported(){try{await persist();const value=await exportReviewed(job.id),url=URL.createObjectURL(new Blob([JSON.stringify(value)],{type:'application/json'})),a=document.createElement('a');a.href=url;a.download=`motion-${job.id}.json`;a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);}catch(e){error=(e as Error).message;}}
  onDestroy(()=>playing=false);
</script>
<article class="bu-dialog-surface candidate">
  <h3>{job.label}</h3>
  <p>{job.state} · {job.gens} generations{job.error?` · ${job.error}`:''}</p>
  {#if error}<p role="alert" class="bu-error">{error}</p>{/if}
  {#if urls.length}
    <div class="bu-actions">{#if record}<button class="bu-btn" disabled={!review.accepted.some(Boolean)} onclick={()=>{if(!review.accepted[index]||(!playing&&!record.document.clip.loop&&index===review.accepted.lastIndexOf(true)))index=review.accepted.indexOf(true);playing=!playing;}}>{playing?'Pause candidate':'Play candidate'}</button><label><input type="checkbox" bind:checked={review.accepted[index]}> Use selected frame</label>{/if}<span>Raw frame {index+1}/{urls.length}{record&&buffer&&index===urls.length-1?' · terminal buffer':''}</span></div>
    <img class="preview" src={urls[index]} alt={`Raw generated frame ${index+1}`}>
    {#if diagnostics[index]}<p>Raw frame diagnostics: {diagnostics[index].border} border pixels; {diagnostics[index].detached} pixels outside the largest connected component. Inspect these details before accepting. Pixels are retained.</p>{/if}
    {#if record}<label>Selected frame duration, ms <input class="bu-input" type="number" min="10" max="10000" value={review.durationOverrides?.[index]??durations[Math.min(index,durations.length-1)]??120} onchange={e=>{review.durationOverrides??={};review.durationOverrides[index]=+e.currentTarget.value;saved='';}}></label>{/if}
    <div class="frames">{#each urls as url,i}<button class="bu-action" aria-label={`Inspect raw frame ${i+1}`} aria-pressed={index===i} onclick={()=>{index=i;playing=false;}}><img src={url} alt="">{i+1}{record&&!review.accepted[i]?' excluded':''}</button>{/each}</div>
    {#if record}
    <div class="bu-actions"><label>Review status <select class="bu-select" bind:value={review.status}><option value="unreviewed">Unreviewed</option><option value="needs-work">Needs work</option><option value="accepted">Accepted by reviewer</option><option value="rejected">Rejected</option></select></label><label>Final local hold, ms <input class="bu-input" type="number" min="0" max="10000" step="50" bind:value={review.terminalHold}></label></div>
    <label>Review notes: anatomy, contacts, silhouette, timing, identity and terminal frame<textarea class="bu-input" bind:value={review.notes}></textarea></label>
    <div class="bu-actions"><button class="bu-btn" onclick={persist}>Save review</button><button class="bu-btn" disabled={review.status!=='accepted'||!review.notes.trim()||urls.length<3||!!record?.context} onclick={exported}>Export reviewed clip</button><span role="status">{saved}</span></div>
    <p class="bu-muted">Selected frames play with authored durations. A local final hold costs no generations. Raw outputs and exclusions remain in the evidence export. Acceptance applies only to this candidate.</p>
    {#if record?.document.planting&&!record.context}
      <button class="bu-btn" onclick={()=>{playing=false;measureFeet=!measureFeet}}>{measureFeet?'Close sole qualification':'Measure rendered soles'}</button>
      {#if measureFeet}<SoleEditor {images} {index} pause={()=>playing=false} binding={{jobId:job.id,hashes:results.map(r=>r.sha),cell:{w:images[0].w,h:images[0].h},direction:record.document.direction,elevation:record.document.elevation,azimuth:record.document.azimuth,times:record.document.times,duration:record.document.clip.duration,loop:record.document.clip.loop,plan:record.document.planting}}/>{/if}
    {/if}
    {#if record&&!record.context&&record.document.fixture.pivot}
      <button class="bu-btn" onclick={()=>authorAttachment=!authorAttachment}>{authorAttachment?'Close held item authoring':'Author held item'}</button>
      {#if authorAttachment}<AttachmentEditor jobId={job.id} hashes={results.map(r=>r.sha)} {images} keypoints={(job.params as {keypoints:Keypoint[][]}).keypoints} durations={images.map((_,i)=>(review.durationOverrides?.[i]??durations[Math.min(i,durations.length-1)]??120)+(i===review.accepted.lastIndexOf(true)?review.terminalHold:0))} included={review.accepted} loop={record.document.clip.loop} pivot={{x:record.document.fixture.pivot.x+record.document.padding,y:record.document.fixture.pivot.y+record.document.padding}} direction={record.document.direction}/>{/if}
    {/if}
    {:else}
      <p>This research grid has no authored motion document. Use the selected experiment's evidence export for offline assessment.</p>
    {/if}
  {/if}
</article>
<style>
  .candidate{padding:16px;display:grid;gap:12px}.preview{width:240px;max-width:100%;image-rendering:pixelated}.frames{display:flex;gap:8px;overflow:auto}.frames button{padding:6px;min-width:88px}.frames img{width:80px;image-rendering:pixelated}h3,p{margin:0}
</style>
