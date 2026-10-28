<script lang="ts">
  import { onDestroy } from 'svelte';
  import type { JobRec } from '../../lib/pixellab/queue.ts';
  import { getBlob } from '../../lib/store/db.ts';
  import { candidateRecord, saveReview, exportReviewed, type CandidateReview } from './run.ts';
  let {job,buffer=false}:{job:JobRec;buffer?:boolean}=$props();
  let urls=$state<string[]>([]),error=$state(''),index=$state(0),playing=$state(false),saved=$state('');
  let review=$state<CandidateReview>({accepted:[],status:'unreviewed',notes:'',terminalHold:0});
  const record=$derived.by(()=>candidateRecord(job.id)),durations=$derived(record?.document.durations??[]);
  const results=$derived(job.jobs.flatMap(j=>j.results));
  $effect(()=>{const finished=job.state==='done';if(!finished)return;const values=results;let disposed=false;const created:string[]=[];
    void(async()=>{for(const result of values){const blob=await getBlob(result.sha);if(!blob)throw new Error('Candidate image is missing from storage.');created.push(URL.createObjectURL(blob));}if(!disposed){urls=created;review=record?.review??{accepted:created.map((_,i)=>!buffer||i<created.length-1),status:'unreviewed',notes:'',terminalHold:buffer?600:0};}})().catch(e=>{error=(e as Error).message;});
    return()=>{disposed=true;for(const url of created)URL.revokeObjectURL(url);};
  });
  $effect(()=>{if(!playing||!urls.length)return;const next=()=>{const start=index;do{index=(index+1)%urls.length;}while(!review.accepted[index]&&index!==start);};const last=review.accepted.lastIndexOf(true),timer=setTimeout(next,(durations[Math.min(index,durations.length-1)]??120)+(index===last?review.terminalHold:0));return()=>clearTimeout(timer);});
  async function persist(){try{await saveReview(job.id,JSON.parse(JSON.stringify(review)));saved='Review saved locally.';error='';}catch(e){error=(e as Error).message;}}
  async function exported(){try{await persist();const value=await exportReviewed(job.id),url=URL.createObjectURL(new Blob([JSON.stringify(value)],{type:'application/json'})),a=document.createElement('a');a.href=url;a.download=`motion-${job.id}.json`;a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);}catch(e){error=(e as Error).message;}}
  onDestroy(()=>playing=false);
</script>
<article class="bu-dialog-surface candidate">
  <h3>{job.label}</h3>
  <p>{job.state} · {job.gens} generations{job.error?` · ${job.error}`:''}</p>
  {#if error}<p role="alert" class="bu-error">{error}</p>{/if}
  {#if urls.length}
    <div class="bu-actions"><button class="bu-btn" disabled={!review.accepted.some(Boolean)} onclick={()=>{if(!review.accepted[index])index=review.accepted.indexOf(true);playing=!playing;}}>{playing?'Pause candidate':'Play candidate'}</button><span>Raw frame {index+1}/{urls.length}{buffer&&index===urls.length-1?' · terminal buffer':''}</span><label><input type="checkbox" bind:checked={review.accepted[index]}> Use selected frame</label></div>
    <img class="preview" src={urls[index]} alt={`Raw generated frame ${index+1}`}>
    <div class="frames">{#each urls as url,i}<button class="bu-action" aria-label={`Inspect raw frame ${i+1}`} aria-pressed={index===i} onclick={()=>{index=i;playing=false;}}><img src={url} alt="">{i+1}{review.accepted[i]?'':' excluded'}</button>{/each}</div>
    <div class="bu-actions"><label>Review status <select class="bu-select" bind:value={review.status}><option value="unreviewed">Unreviewed</option><option value="needs-work">Needs work</option><option value="accepted">Accepted by reviewer</option><option value="rejected">Rejected</option></select></label><label>Final local hold, ms <input class="bu-input" type="number" min="0" max="10000" step="50" bind:value={review.terminalHold}></label></div>
    <label>Review notes: anatomy, contacts, silhouette, timing, identity and terminal frame<textarea class="bu-input" bind:value={review.notes}></textarea></label>
    <div class="bu-actions"><button class="bu-btn" onclick={persist}>Save review</button><button class="bu-btn" disabled={review.status!=='accepted'||!review.notes.trim()} onclick={exported}>Export reviewed clip</button><span role="status">{saved}</span></div>
    <p class="bu-muted">Selected frames play with authored durations. A local final hold costs no generations. Raw outputs and exclusions remain in the evidence export. Acceptance applies only to this candidate.</p>
  {/if}
</article>
<style>
  .candidate{padding:16px;display:grid;gap:12px}.preview{width:240px;max-width:100%;image-rendering:pixelated}.frames{display:flex;gap:8px;overflow:auto}.frames button{padding:6px;min-width:88px}.frames img{width:80px;image-rendering:pixelated}h3,p{margin:0}
</style>
