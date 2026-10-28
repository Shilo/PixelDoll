<script lang="ts">
  import { onMount } from 'svelte';
  import { LABELS } from '../lib/rig/poses.ts';
  import { poseCallGens } from '../lib/rig/clips.ts';
  import { base64ToBytes, type Img } from '../lib/image/png.ts';
  import { decodePngBytes } from '../lib/image/pngraw.ts';
  import { completePose } from '../lib/rig/motion.ts';
  import { buildDocument, editPose, newDocument, paddedReference, validateDocument, type MotionDocument, type MotionLibrary } from './motion-lab/model.ts';
  import { connectLab, exportEvidence, generateCandidate, labQueue, readLedger, LAB_CAP } from './motion-lab/run.ts';
  import { drawOverlay, drawPuppet, drawRig3 } from './motion-lab/preview.ts';
  import Candidate from './motion-lab/Candidate.svelte';
  import type { DirectionName } from '../lib/rig/rig.ts';
  const motionControls=['gain','travel','contact','facing'] as const,partControls=['torso','legs','leftArm','rightArm'] as const;
  let library=$state<MotionLibrary>(),doc=$state<MotionDocument>(),image=$state<Img>(),error=$state(''),status=$state('Loading offline examples…');
  let frame=$state(0),playing=$state(false),joint=$state('RIGHT ARM'),referenceMode=$state(false),orbit=$state(25),seed=$state(7),busy=$state(false),reserved=$state(0);
  let x=$state(0),y=$state(0),depth=$state(128),theme=$state('dark');
  let overlay=$state<HTMLCanvasElement>(),sourceCanvas=$state<HTMLCanvasElement>(),targetCanvas=$state<HTMLCanvasElement>(),puppetCanvas=$state<HTMLCanvasElement>();
  let history:MotionDocument[]=[],future:MotionDocument[]=[],undoCount=$state(0),redoCount=$state(0),dragging=false;
  const result=$derived.by(()=>{if(!doc)return null;try{return buildDocument(doc);}catch(e){return {failure:(e as Error).message};}});
  const fit=$derived(result&&'frames'in result?result:null),selected=$derived(fit?.frames[frame]);
  const issues=$derived(fit?[...new Set(fit.frames.flatMap(f=>f.issues))]:[]);
  const connected=$derived.by(()=>{const snapshot=$labQueue;return snapshot.paused!=='auth'&&!!labQueue.key;});
  function snapshot(){if(!doc)return;history.push(JSON.parse(JSON.stringify(doc)));history=history.slice(-30);future=[];undoCount=history.length;redoCount=0;}
  function change(fn:(d:MotionDocument)=>void){if(!doc)return;snapshot();const next:MotionDocument=JSON.parse(JSON.stringify(doc));fn(next);doc=next;error='';}
  function undo(){if(!doc||!history.length)return;future.push(JSON.parse(JSON.stringify(doc)));doc=history.pop()!;undoCount=history.length;redoCount=future.length;}
  function redo(){if(!doc||!future.length)return;history.push(JSON.parse(JSON.stringify(doc)));doc=future.pop()!;undoCount=history.length;redoCount=future.length;}
  function choose(fixtureId:string,clipId:string,direction:DirectionName){if(!library)return;try{snapshot();doc=newDocument(library,library.fixtures.find(f=>f.id===fixtureId),library.clips.find(c=>c.id===clipId),direction);frame=0;playing=false;error='';}catch(e){error=(e as Error).message;}}
  const download=(name:string,value:unknown)=>{const url=URL.createObjectURL(new Blob([JSON.stringify(value)],{type:'application/json'}));const a=document.createElement('a');a.href=url;a.download=name;a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);};
  async function imported(event:Event){try{const file=(event.target as HTMLInputElement).files?.[0];if(!file)return;if(file.size>5_000_000)throw new Error('Motion document exceeds 5 MB.');const next=validateDocument(JSON.parse(await file.text()));snapshot();doc=next;frame=0;status='Imported motion document. No generation was requested.';error='';}catch(e){error=(e as Error).message;}}
  async function generate(){if(!doc||busy)return;busy=true;error='';try{await generateCandidate(JSON.parse(JSON.stringify(doc)),seed);reserved=readLedger().reservations.reduce((n,r)=>n+r.estimate,0);status='Candidate queued. Existing job IDs resume after reload.';}catch(e){error=(e as Error).message;}finally{busy=false;}}
  function applyJoint(nx=x,ny=y,nd=depth,remember=true){if(!doc)return;try{if(remember)snapshot();if(referenceMode){const next:MotionDocument=JSON.parse(JSON.stringify(doc)),k=next.reference.find(k=>k.label===joint)!;k.x=(nx*(next.fixture.cell.w+2*next.padding)-next.padding)/next.fixture.cell.w;k.y=(ny*(next.fixture.cell.h+2*next.padding)-next.padding)/next.fixture.cell.h;if(k.x<0||k.x>1||k.y<0||k.y>1)throw new Error('Reference joints must remain inside the original image.');next.edits={};doc=next;}else doc=editPose(JSON.parse(JSON.stringify(doc)),frame,joint,nx,ny,nd);error='';}catch(e){error=(e as Error).message;}}
  function drag(event:PointerEvent){if(!dragging||!overlay)return;const rect=overlay.getBoundingClientRect();applyJoint((event.clientX-rect.left)/rect.width,(event.clientY-rect.top)/rect.height,depth,false);}
  function startDrag(event:PointerEvent){if(!fit||!overlay)return;const rect=overlay.getBoundingClientRect(),nx=(event.clientX-rect.left)/rect.width,ny=(event.clientY-rect.top)/rect.height,points=referenceMode?fit.rest:selected?.keypoints;if(!points)return;const nearest=points.reduce((a,b)=>Math.hypot(a.x-nx,a.y-ny)<Math.hypot(b.x-nx,b.y-ny)?a:b);if(Math.hypot(nearest.x-nx,nearest.y-ny)>0.07)return;joint=nearest.label;x=nearest.x;y=nearest.y;depth='depth'in nearest?nearest.depth:128;playing=false;snapshot();dragging=true;overlay.setPointerCapture(event.pointerId);}
  $effect(()=>{if(!doc)return;let disposed=false;const png=doc.fixture.references[doc.direction]!.png,pad=doc.padding;void decodePngBytes(base64ToBytes(png)).then(im=>{if(!disposed)image=paddedReference(im,pad);}).catch(e=>error=(e as Error).message);return()=>{disposed=true;};});
  $effect(()=>{if(!fit||!selected)return;const k=(referenceMode?fit.rest:selected.keypoints).find(k=>k.label===joint);if(k){x=k.x;y=k.y;depth='depth'in k?k.depth:128;}});
  $effect(()=>{if(!fit||!selected||!image||!overlay||!sourceCanvas||!targetCanvas||!puppetCanvas)return;drawOverlay(overlay,image,referenceMode?fit.rest:selected.keypoints,joint,!referenceMode&&frame>0?fit.frames[frame-1].keypoints:undefined);drawRig3(sourceCanvas,completePose(fit.clip.samples[frame].points),completePose(doc!.clip.reference),orbit);drawRig3(targetCanvas,selected.points,fit.reference,orbit);drawPuppet(puppetCanvas,image,fit.rest,selected.keypoints);});
  $effect(()=>{if(!playing||!doc)return;const timer=setTimeout(()=>frame=(frame+1)%doc!.times.length,doc.durations[frame]);return()=>clearTimeout(timer);});
  $effect(()=>{document.documentElement.dataset.theme=theme;});
  onMount(()=>{let active=true;void(async()=>{const response=await fetch('/fixtures/motion-lab/library.json',{cache:'no-store'});if(!response.ok)throw new Error(`Offline library could not load (${response.status}). Run the source bake.`);const value=await response.json() as MotionLibrary;if(value.version!==1)throw new Error('Unsupported offline library.');if(!active)return;library=value;doc=newDocument(value);status='Offline lab ready. Editing and preview spend no generations.';reserved=readLedger().reservations.reduce((n,r)=>n+r.estimate,0);try{const balance=await connectLab();if(balance)status='Agent mode connected. Generation happens only when you request a candidate.';}catch(e){error=(e as Error).message;}})().catch(e=>error=(e as Error).message);const leave=()=>labQueue.disconnect();addEventListener('pagehide',leave);return()=>{active=false;labQueue.disconnect();removeEventListener('pagehide',leave);};});
</script>

<main class="lab bu-stack">
  <header><div><h1>Motion Lab</h1><p class="bu-muted">Offline calibration and motion preview. Red is anatomical right; blue is anatomical left.</p></div><div class="bu-actions"><label>Theme <select class="bu-select" bind:value={theme}><option value="dark">Dark</option><option value="light">Light</option></select></label><a class="bu-btn" href="/">Studio</a></div></header>
  {#if import.meta.env.MODE==='agent'}<p class="bu-badge">Agent mode</p>{/if}
  <p role="status">{status}</p>{#if error}<p class="bu-error" role="alert">{error}</p>{/if}
  {#if doc&&library}
    <section class="bu-dialog-surface controls" aria-label="Motion source and calibration">
      <label class="bu-field">Body<select class="bu-input" value={doc.fixture.id} onchange={e=>choose(e.currentTarget.value,doc!.clip.id,'south')}>{#each library.fixtures as f}<option value={f.id}>{f.name}</option>{/each}</select></label>
      <label class="bu-field">Preset<select class="bu-input" value={doc.clip.id} onchange={e=>choose(doc!.fixture.id,e.currentTarget.value,doc!.direction)}>{#each library.clips as c}<option value={c.id}>{c.name}</option>{/each}</select></label>
      <label class="bu-field">Direction<select class="bu-input" value={doc.direction} onchange={e=>choose(doc!.fixture.id,doc!.clip.id,e.currentTarget.value as DirectionName)}>{#each Object.keys(doc.fixture.references) as d}<option value={d}>{d}</option>{/each}</select></label>
      <label class="bu-field">Padding, px<input class="bu-input" type="number" min="0" max="48" step="4" value={doc.padding} onchange={e=>change(d=>{d.padding=+e.currentTarget.value;d.edits={};})}></label>
      <label class="bu-field">Camera elevation<input class="bu-input" type="number" min="0" max="80" step="1" value={doc.elevation} onchange={e=>change(d=>{d.elevation=+e.currentTarget.value;d.edits={};})}></label>
      <label class="bu-field">Camera bearing<input class="bu-input" type="number" value={doc.azimuth} onchange={e=>change(d=>{d.azimuth=+e.currentTarget.value;d.edits={};})}></label>
      <label class="bu-field">Motion plane, degrees<input class="bu-input" type="number" step="15" value={doc.options.plane??0} onchange={e=>change(d=>{d.options.plane=+e.currentTarget.value;d.edits={};})}></label>
      {#each motionControls as option}<label class="bu-field">{option}<input class="bu-input" type="number" min="0" max={option==='gain'?3:option==='travel'?2:1} step="0.1" value={doc.options[option]} onchange={e=>change(d=>{d.options[option]=+e.currentTarget.value;d.edits={};})}></label>{/each}
      {#each partControls as part}<label class="bu-field">{part} weight<input class="bu-input" type="number" min="0" max="1" step="0.05" value={doc.options.weights?.[part]??1} onchange={e=>change(d=>{d.options.weights??={torso:1,legs:1,leftArm:1,rightArm:1};d.options.weights[part]=+e.currentTarget.value;d.edits={};})}></label>{/each}
    </section>
    {#if fit&&selected&&image}
      <section class="previews" aria-label="Motion previews">
        <figure class="bu-dialog-surface"><figcaption>{referenceMode?'Reference calibration':'Requested pose over reference'}</figcaption><canvas bind:this={overlay} tabindex="0" aria-label="Joint editor, drag a marker or use coordinate fields" onpointerdown={startDrag} onpointermove={drag} onpointerup={()=>dragging=false} onpointercancel={()=>dragging=false} onkeydown={e=>{if(['ArrowLeft','ArrowRight','ArrowUp','ArrowDown'].includes(e.key)){e.preventDefault();applyJoint(x+(e.key==='ArrowLeft'?-1:e.key==='ArrowRight'?1:0)/fit.calibration.width,y+(e.key==='ArrowUp'?-1:e.key==='ArrowDown'?1:0)/fit.calibration.height);}}}></canvas></figure>
        <figure class="bu-dialog-surface"><figcaption>Source 3D rig, relative to pelvis</figcaption><canvas bind:this={sourceCanvas} aria-label="Original source rig"></canvas></figure>
        <figure class="bu-dialog-surface"><figcaption>Target 3D rig, relative to pelvis</figcaption><canvas bind:this={targetCanvas} aria-label="Retargeted rig"></canvas></figure>
        <figure class="bu-dialog-surface"><figcaption>Rough paper puppet</figcaption><canvas bind:this={puppetCanvas} aria-label="Approximate paper puppet"></canvas></figure>
      </section>
      <p class="bu-muted">The puppet cannot invent hidden surfaces or predict PixelLab art. Latent reference depth is a proxy assumption. Inspect the pose and actual output separately.</p>
      <section class="bu-dialog-surface timeline" aria-label="Pose timeline">
        <div class="bu-actions"><button class="bu-btn" onclick={()=>playing=!playing}>{playing?'Pause':'Play'}</button><button class="bu-btn" disabled={!undoCount} onclick={undo}>Undo</button><button class="bu-btn" disabled={!redoCount} onclick={redo}>Redo</button><label>3D orbit <input type="range" min="0" max="360" bind:value={orbit}></label><label><input type="checkbox" bind:checked={referenceMode}> Correct reference joints</label></div>
        <div class="frame-buttons">{#each doc.times as time,i}<button class="bu-btn" aria-label={`Select pose ${i+1}`} aria-pressed={frame===i} onclick={()=>{frame=i;playing=false;}}>{i+1}{doc.edits[i]?' *':''}</button>{/each}</div>
        <div class="joint-fields"><label class="bu-field">Joint<select class="bu-input" bind:value={joint}>{#each LABELS as l}<option>{l}</option>{/each}</select></label><label class="bu-field">X, fraction<input class="bu-input" type="number" step="0.005" bind:value={x}></label><label class="bu-field">Y, fraction<input class="bu-input" type="number" step="0.005" bind:value={y}></label><label class="bu-field">Depth<input class="bu-input" type="number" step="1" bind:value={depth} disabled={referenceMode}></label><button class="bu-btn" onclick={()=>applyJoint()}>Apply joint edit</button></div>
        <p class="bu-muted">Wrists and ankles use two-bone IK. Other joints rotate their subtree. Head landmarks move together. Reference changes clear pose edits; Undo restores them.</p>
        <div class="joint-fields"><label class="bu-field">Source time, seconds<input class="bu-input" type="number" min="0" max={doc.clip.duration} step="0.01" value={doc.times[frame]} onchange={e=>change(d=>{d.times[frame]=+e.currentTarget.value;d.edits={};})}></label><label class="bu-field">Frame duration, ms<input class="bu-input" type="number" min="10" max="10000" value={doc.durations[frame]} onchange={e=>change(d=>d.durations[frame]=+e.currentTarget.value)}></label><label><input type="checkbox" checked={doc.buffer} onchange={e=>change(d=>d.buffer=e.currentTarget.checked)}> Append terminal buffer</label></div>
      </section>
      <section class="bu-dialog-surface diagnostics" aria-label="Pose diagnostics"><h2>Diagnostics</h2><p>{fit.frames.length} poses · {fit.calibration.width} × {fit.calibration.height} px · {Object.keys(doc.edits).length} edited frames</p>{#if issues.length}<ul>{#each issues as issue}<li>{issue}</li>{/each}</ul>{:else}<p>No reach or joint-boundary warnings. This does not certify natural motion, silhouette clearance, or output quality.</p>{/if}</section>
    {:else if result&&'failure'in result}<p class="bu-error" role="alert">{result.failure}</p>{/if}
    <section class="bu-dialog-surface controls" aria-label="Save and render">
      <button class="bu-btn" onclick={()=>download('pixeldoll-motion.json',doc)}>Save motion document</button><label class="bu-btn">Import motion document<input type="file" accept="application/json" onchange={imported}></label>
      <label class="bu-field">Candidate seed<input class="bu-input" type="number" min="1" step="1" bind:value={seed}></label>
      <button class="bu-btn" data-variant="primary" disabled={!fit||busy||!connected} onclick={generate}>Generate candidate ({poseCallGens(doc.times.length+(doc.buffer?1:0))} gens)</button>
      <button class="bu-btn" onclick={async()=>{try{download('pixeldoll-motion-evidence.json',await exportEvidence());}catch(e){error=(e as Error).message;}}}>Export all evidence</button>
      <p>{reserved}/{LAB_CAP} generations reserved in this campaign. Live requests use the existing queue; prior candidates and unknown outcomes are never automatically resent.</p>
    </section>
    <section aria-label="Generated candidates" class="bu-stack">{#each $labQueue.jobs as job(job.id)}<Candidate {job} buffer={readLedger().reservations.find(r=>r.jobId===job.id)?.document.buffer}/>{/each}</section>
  {/if}
</main>
<style>
  .lab{max-width:1600px;margin:auto;padding:24px}.lab header{display:flex;justify-content:space-between;gap:16px;flex-wrap:wrap}h1,h2,p{margin:0}h1{font-size:28px}.controls,.joint-fields{display:flex;gap:16px;flex-wrap:wrap;align-items:end}.controls,.timeline,.diagnostics{padding:16px}.controls .bu-field{width:160px}.previews{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:16px}.previews figure{margin:0;padding:12px;min-width:0}.previews canvas{width:100%;max-height:360px;object-fit:contain;image-rendering:pixelated;touch-action:none}.previews figcaption{min-height:48px}.timeline{display:grid;gap:16px}.frame-buttons{display:flex;gap:6px;overflow:auto}.frame-buttons button{min-width:44px}.joint-fields .bu-field{width:150px}.diagnostics{display:grid;gap:8px}.controls input[type=file]{max-width:200px}.bu-field input[type=number]{font-variant-numeric:tabular-nums}@media(max-width:1050px){.previews{grid-template-columns:repeat(2,minmax(0,1fr))}}@media(max-width:560px){.lab{padding:12px}.previews{grid-template-columns:1fr}.controls .bu-field{width:100%}}
</style>
