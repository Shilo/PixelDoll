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
  import { EQUIPMENT,dressEquipment,poseEquipment,type EquipmentName } from './motion-lab/equipment.ts';
  import type { DirectionName } from '../lib/rig/rig.ts';
  import { CALIBRATION_KEY,calibrationOf,calibratedDocument,readCalibrations,type CalibrationProfile } from './motion-lab/calibration.ts';
  import { templateContactMotion,loopJointStep } from './motion-lab/diagnostics.ts';
  const motionControls=['gain','travel','contact','facing'] as const,partControls=['torso','legs','leftArm','rightArm'] as const;
  let library=$state<MotionLibrary>(),doc=$state<MotionDocument>(),image=$state<Img>(),error=$state(''),status=$state('Loading offline examples…');
  let frame=$state(0),playing=$state(false),joint=$state('RIGHT ARM'),referenceMode=$state(false),orbit=$state(25),seed=$state(7),busy=$state(false),reserved=$state(0),candidateId=$state('');
  let x=$state(0),y=$state(0),depth=$state(128),theme=$state('dark');
  let equipmentBody=$state(''),equipmentPartner=$state(''),equipmentDress=$state(''),equipmentName=$state<EquipmentName>('helmet');
  let overlay=$state<HTMLCanvasElement>(),sourceCanvas=$state<HTMLCanvasElement>(),targetCanvas=$state<HTMLCanvasElement>(),puppetCanvas=$state<HTMLCanvasElement>();
  let history:MotionDocument[]=[],future:MotionDocument[]=[],undoCount=$state(0),redoCount=$state(0),dragging=false;
  let profiles=$state<CalibrationProfile[]>([]),selectionToken=0;
  const result=$derived.by(()=>{if(!doc)return null;try{return buildDocument(doc);}catch(e){return {failure:(e as Error).message};}});
  const fit=$derived(result&&'frames'in result?result:null),selected=$derived(fit?.frames[frame]);
  const issues=$derived(fit?[...new Set(fit.frames.flatMap(f=>f.issues))]:[]);
  const contacts=$derived.by(()=>{if(!fit||!doc)return null;try{return{value:templateContactMotion(doc)};}catch(e){return{error:(e as Error).message};}});
  const connected=$derived.by(()=>{const snapshot=$labQueue;return snapshot.paused!=='auth'&&!!labQueue.key;});
  const inspected=$derived($labQueue.jobs.find(j=>j.id===candidateId)??$labQueue.jobs.at(-1));
  const mirroredFrom=$derived(doc?.fixture.directions.find(d=>d.id===doc!.direction)?.mirrorOf);
  const campaign=$derived.by(()=>{const rows=readLedger().reservations,jobs=$labQueue.jobs;return{reserved,reported:jobs.reduce((n,j)=>n+j.gens,0),withoutJob:rows.filter(r=>!r.jobId).length,byJob:new Map(rows.flatMap(r=>r.jobId?[[r.jobId,r] as const]:[]))};});
  const bodyCandidates=$derived($labQueue.jobs.filter(j=>j.state==='done'&&!campaign.byJob.get(j.id)?.context));
  const dressedCandidates=$derived($labQueue.jobs.filter(j=>j.state==='done'&&campaign.byJob.get(j.id)?.context?.kind==='equipment-dress'));
  async function equipmentAction(pose:boolean){if(busy)return;busy=true;error='';try{candidateId=pose?await poseEquipment(equipmentBody,equipmentDress,seed):await dressEquipment(equipmentBody,equipmentPartner,equipmentName,seed);if(!pose)equipmentDress=candidateId;status='Equipment qualification queued. The original frozen body and pose parameters are retained.';}catch(e){error=(e as Error).message;}finally{reserved=readLedger().reservations.reduce((n,r)=>n+r.estimate,0);busy=false;}}
  function snapshot(){if(!doc)return;history.push(JSON.parse(JSON.stringify(doc)));history=history.slice(-30);future=[];undoCount=history.length;redoCount=0;}
  function change(fn:(d:MotionDocument)=>void){if(!doc)return;snapshot();const next:MotionDocument=JSON.parse(JSON.stringify(doc));fn(next);doc=next;error='';}
  function undo(){if(!doc||!history.length)return;future.push(JSON.parse(JSON.stringify(doc)));doc=history.pop()!;undoCount=history.length;redoCount=future.length;}
  function redo(){if(!doc||!future.length)return;history.push(JSON.parse(JSON.stringify(doc)));doc=future.pop()!;undoCount=history.length;redoCount=future.length;}
  async function choose(fixtureId:string,clipId:string,direction:DirectionName){if(!library)return;const token=++selectionToken;try{const fixture=doc?.fixture.id===fixtureId?doc.fixture:library.fixtures.find(f=>f.id===fixtureId),clip=doc?.clip.id===clipId?doc.clip:library.clips.find(c=>c.id===clipId);if(!fixture||!clip)throw new Error('The selected body or source motion is unavailable.');let next=newDocument(library,fixture,clip,direction);if(doc?.fixture.id===fixtureId&&doc.direction===direction){next.elevation=doc.elevation;next.azimuth=doc.azimuth;}else next=await calibratedDocument(JSON.parse(JSON.stringify(next)),profiles);if(token!==selectionToken)return;snapshot();doc=next;frame=0;playing=false;error='';}catch(e){if(token===selectionToken)error=(e as Error).message;}}
  async function saveCalibration(){if(!doc)return;try{const profile=await calibrationOf(JSON.parse(JSON.stringify(doc))),next=[...profiles.filter(p=>p.fixtureId!==profile.fixtureId||p.direction!==profile.direction),profile];localStorage.setItem(CALIBRATION_KEY,JSON.stringify(next));profiles=next;status='Calibration saved for this body artwork and view. Other presets reuse it after reload.';error='';}catch(e){error=(e as Error).message;}}
  function clearCalibrations(){try{localStorage.removeItem(CALIBRATION_KEY);profiles=[];status='Saved calibrations cleared. Current edits remain available to save as a motion document.';error='';}catch(e){error=(e as Error).message;}}
  const download=(name:string,value:unknown)=>{const url=URL.createObjectURL(new Blob([JSON.stringify(value)],{type:'application/json'}));const a=document.createElement('a');a.href=url;a.download=name;a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);};
  function loadDocument(value:unknown,message:string){const next=validateDocument(value);selectionToken++;snapshot();doc=next;frame=0;playing=false;status=message;error='';}
  async function imported(event:Event){try{const file=(event.target as HTMLInputElement).files?.[0];if(!file)return;if(file.size>5_000_000)throw new Error('Motion document exceeds 5 MB.');loadDocument(JSON.parse(await file.text()),'Imported motion document. No generation was requested.');}catch(e){error=(e as Error).message;}}
  async function sourceControl(action:string){if(!['idle','walk','run','attack','hurt','death'].includes(action))return;try{const response=await fetch(`/fixtures/motion-lab/kaykit-${action}.json`);if(!response.ok)throw new Error(`KayKit control could not load (${response.status}). Run compare-kaykit.mts.`);loadDocument(await response.json(),'Loaded an independent CC0 KayKit control. Geometry only; rendered quality is unqualified.');}catch(e){error=(e as Error).message;}}
  async function generate(){if(!doc||busy)return;busy=true;error='';try{candidateId=await generateCandidate(JSON.parse(JSON.stringify(doc)),seed);status='Candidate queued. Existing job IDs resume after reload.';}catch(e){error=(e as Error).message;}finally{reserved=readLedger().reservations.reduce((n,r)=>n+r.estimate,0);busy=false;}}
  function applyJoint(nx=x,ny=y,nd=depth,remember=true){if(!doc)return;try{if(remember)snapshot();if(referenceMode){const next:MotionDocument=JSON.parse(JSON.stringify(doc)),k=next.reference.find(k=>k.label===joint)!;k.x=(nx*(next.fixture.cell.w+2*next.padding)-next.padding)/next.fixture.cell.w;k.y=(ny*(next.fixture.cell.h+2*next.padding)-next.padding)/next.fixture.cell.h;if(k.x<0||k.x>1||k.y<0||k.y>1)throw new Error('Reference joints must remain inside the original image.');next.fixture.references[next.direction]!.keypoints=next.reference.map(k=>({...k}));next.edits={};doc=next;}else doc=editPose(JSON.parse(JSON.stringify(doc)),frame,joint,nx,ny,nd);error='';}catch(e){error=(e as Error).message;}}
  function drag(event:PointerEvent){if(!dragging||!overlay)return;const rect=overlay.getBoundingClientRect();applyJoint((event.clientX-rect.left)/rect.width,(event.clientY-rect.top)/rect.height,depth,false);}
  function startDrag(event:PointerEvent){if(!fit||!overlay)return;const rect=overlay.getBoundingClientRect(),nx=(event.clientX-rect.left)/rect.width,ny=(event.clientY-rect.top)/rect.height,points=referenceMode?fit.rest:selected?.keypoints;if(!points)return;const nearest=points.reduce((a,b)=>Math.hypot(a.x-nx,a.y-ny)<Math.hypot(b.x-nx,b.y-ny)?a:b);if(Math.hypot(nearest.x-nx,nearest.y-ny)>0.07)return;joint=nearest.label;x=nearest.x;y=nearest.y;depth='depth'in nearest?nearest.depth:128;playing=false;snapshot();dragging=true;overlay.setPointerCapture(event.pointerId);}
  $effect(()=>{if(!doc)return;let disposed=false;const png=doc.fixture.references[doc.direction]!.png,pad=doc.padding;void decodePngBytes(base64ToBytes(png)).then(im=>{if(!disposed)image=paddedReference(im,pad);}).catch(e=>error=(e as Error).message);return()=>{disposed=true;};});
  $effect(()=>{if(!fit||!selected)return;const k=(referenceMode?fit.rest:selected.keypoints).find(k=>k.label===joint);if(k){x=k.x;y=k.y;depth='depth'in k?k.depth:128;}});
  $effect(()=>{if(!fit||!selected||!image||!overlay||!sourceCanvas||!targetCanvas||!puppetCanvas)return;drawOverlay(overlay,image,referenceMode?fit.rest:selected.keypoints,joint,!referenceMode&&frame>0?fit.frames[frame-1].keypoints:undefined);drawRig3(sourceCanvas,completePose(fit.clip.samples[frame].points),completePose(doc!.clip.reference),orbit);drawRig3(targetCanvas,selected.points,fit.reference,orbit);drawPuppet(puppetCanvas,image,fit.rest,selected.keypoints);});
  $effect(()=>{if(!playing||!doc)return;const timer=setTimeout(()=>{if(frame===doc!.times.length-1&&!doc!.clip.loop)playing=false;else frame=(frame+1)%doc!.times.length;},doc.durations[frame]);return()=>clearTimeout(timer);});
  $effect(()=>{document.documentElement.dataset.theme=theme;});
  onMount(()=>{let active=true;void(async()=>{const response=await fetch('/fixtures/motion-lab/library.json',{cache:'no-store'});if(!response.ok)throw new Error(`Offline library could not load (${response.status}). Run the source bake.`);const value=await response.json() as MotionLibrary;if(value.version!==1)throw new Error('Unsupported offline library.');if(!active)return;library=value;doc=newDocument(value);try{profiles=readCalibrations(localStorage.getItem(CALIBRATION_KEY));const restored=await calibratedDocument(newDocument(value),profiles);if(!active)return;doc=restored;}catch(e){error=(e as Error).message;}status='Offline lab ready. Editing and preview spend no generations.';reserved=readLedger().reservations.reduce((n,r)=>n+r.estimate,0);try{const balance=await connectLab();if(balance)status='Agent mode connected. Generation happens only when you request a candidate.';}catch(e){error=(e as Error).message;}})().catch(e=>error=(e as Error).message);const leave=()=>labQueue.disconnect();addEventListener('pagehide',leave);return()=>{active=false;labQueue.disconnect();removeEventListener('pagehide',leave);};});
</script>

<main class="lab bu-stack">
  <header><div><h1>Motion Lab</h1><p class="bu-muted">Offline calibration and motion preview. Red is anatomical right; blue is anatomical left.</p></div><div class="bu-actions"><label>Theme <select class="bu-select" bind:value={theme}><option value="dark">Dark</option><option value="light">Light</option></select></label><a class="bu-btn" href="/">Studio</a></div></header>
  {#if import.meta.env.MODE==='agent'}<p class="bu-badge">Agent mode</p>{/if}
  <p role="status">{status}</p>{#if error}<p class="bu-error" role="alert">{error}</p>{/if}
  {#if doc&&library}
    <section class="bu-dialog-surface controls" aria-label="Motion source and calibration">
      <label class="bu-field">KayKit control<select class="bu-input" value="" onchange={e=>sourceControl(e.currentTarget.value)}><option value="">Load independent source</option>{#each ['idle','walk','run','attack','hurt','death'] as action}<option value={action}>{action}</option>{/each}</select></label>
      <p>Current source: {doc.clip.source}</p>
      <label class="bu-field">Body<select class="bu-input" value={doc.fixture.id} onchange={e=>choose(e.currentTarget.value,doc!.clip.id,'south')}>{#if !library.fixtures.some(f=>f.id===doc!.fixture.id)}<option value={doc.fixture.id}>{doc.fixture.name}</option>{/if}{#each library.fixtures as f}<option value={f.id}>{f.name}</option>{/each}</select></label>
      <label class="bu-field">Preset<select class="bu-input" value={doc.clip.id} onchange={e=>choose(doc!.fixture.id,e.currentTarget.value,doc!.direction)}>{#if !library.clips.some(c=>c.id===doc!.clip.id)}<option value={doc.clip.id}>{doc.clip.name}</option>{/if}{#each library.clips as c}<option value={c.id}>{c.name}</option>{/each}</select></label>
      <label class="bu-field">Direction<select class="bu-input" value={doc.direction} onchange={e=>choose(doc!.fixture.id,doc!.clip.id,e.currentTarget.value as DirectionName)}>{#each Object.keys(doc.fixture.references) as d}<option value={d}>{d}</option>{/each}</select></label>
      <label class="bu-field">Padding, px<input class="bu-input" type="number" min="0" max="48" step="4" value={doc.padding} onchange={e=>change(d=>{d.padding=+e.currentTarget.value;d.edits={};})}></label>
      <label class="bu-field">Camera elevation<input class="bu-input" type="number" min="0" max="80" step="1" value={doc.elevation} onchange={e=>change(d=>{d.elevation=+e.currentTarget.value;d.edits={};})}></label>
      <label class="bu-field">Camera bearing<input class="bu-input" type="number" value={doc.azimuth} onchange={e=>change(d=>{d.azimuth=+e.currentTarget.value;d.edits={};})}></label>
      <label class="bu-field">Motion plane, degrees<input class="bu-input" type="number" step="15" value={doc.options.plane??0} onchange={e=>change(d=>{d.options.plane=+e.currentTarget.value;d.edits={};})}></label>
      {#each motionControls as option}<label class="bu-field">{option}<input class="bu-input" type="number" min="0" max={option==='gain'?3:option==='travel'?2:1} step="0.1" value={doc.options[option]} onchange={e=>change(d=>{d.options[option]=+e.currentTarget.value;d.edits={};})}></label>{/each}
      {#each partControls as part}<label class="bu-field">{part} weight<input class="bu-input" type="number" min="0" max="1" step="0.05" value={doc.options.weights?.[part]??1} onchange={e=>change(d=>{d.options.weights??={torso:1,legs:1,leftArm:1,rightArm:1};d.options.weights[part]=+e.currentTarget.value;d.edits={};})}></label>{/each}
      <button class="bu-btn" onclick={saveCalibration}>Save body/view calibration</button><button class="bu-btn" onclick={clearCalibrations}>Clear saved calibrations</button>
      <p>Save reference joints and camera once per body artwork and view. Preset timing and pose edits remain in the motion document. {profiles.length} saved calibration(s).</p>
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
        <div class="bu-actions"><button class="bu-btn" onclick={()=>{if(!playing&&!doc!.clip.loop&&frame===doc!.times.length-1)frame=0;playing=!playing;}}>{playing?'Pause':'Play'}</button><button class="bu-btn" disabled={!undoCount} onclick={undo}>Undo</button><button class="bu-btn" disabled={!redoCount} onclick={redo}>Redo</button><label>3D orbit <input type="range" min="0" max="360" bind:value={orbit}></label><label><input type="checkbox" bind:checked={referenceMode}> Correct reference joints</label></div>
        <div class="frame-buttons">{#each doc.times as time,i}<button class="bu-btn" aria-label={`Select pose ${i+1}`} aria-pressed={frame===i} onclick={()=>{frame=i;playing=false;}}>{i+1}{doc.edits[i]?' *':''}</button>{/each}</div>
        <div class="joint-fields"><label class="bu-field">Joint<select class="bu-input" bind:value={joint}>{#each LABELS as l}<option>{l}</option>{/each}</select></label><label class="bu-field">X, fraction<input class="bu-input" type="number" step="0.005" bind:value={x}></label><label class="bu-field">Y, fraction<input class="bu-input" type="number" step="0.005" bind:value={y}></label><label class="bu-field">Depth<input class="bu-input" type="number" step="1" bind:value={depth} disabled={referenceMode}></label><button class="bu-btn" onclick={()=>applyJoint()}>Apply joint edit</button></div>
        <p class="bu-muted">Wrists and ankles use two-bone IK. Other joints rotate their subtree. Head landmarks move together. Reference changes clear pose edits; Undo restores them.</p>
        <div class="joint-fields"><label class="bu-field">Source time, seconds<input class="bu-input" type="number" min="0" max={doc.clip.duration} step="0.01" value={doc.times[frame]} onchange={e=>change(d=>{d.times[frame]=+e.currentTarget.value;d.edits={};})}></label><label class="bu-field">Frame duration, ms<input class="bu-input" type="number" min="10" max="10000" value={doc.durations[frame]} onchange={e=>change(d=>d.durations[frame]=+e.currentTarget.value)}></label><label><input type="checkbox" checked={doc.buffer} onchange={e=>change(d=>d.buffer=e.currentTarget.checked)}> Append terminal buffer</label></div>
      </section>
      <section class="bu-dialog-surface diagnostics" aria-label="Pose diagnostics"><h2>Diagnostics</h2><p>{doc.revision} · {fit.frames.length} poses · {fit.calibration.width} × {fit.calibration.height} px · {Object.keys(doc.edits).length} edited frames</p>{#if issues.length}<ul>{#each issues as issue}<li>{issue}</li>{/each}</ul>{:else}<p>No reach or joint-boundary warnings. This does not certify natural motion, silhouette clearance, or output quality.</p>{/if}
        {#if contacts?.error}<p class="bu-error">{contacts.error}</p>{:else if contacts?.value}<p>Requested ankle-path fit: target-world speed {contacts.value.speed.toFixed(2)} px/s; residual sliding RMS {contacts.value.rms.toFixed(2)} px/s across {contacts.value.samples} support intervals.</p>{:else}<p>No overlapping support intervals for an ankle-path speed fit.</p>{/if}
        {#if doc.clip.loop}<p>Last-to-first requested joint step: {loopJointStep(fit.frames).toFixed(2)} px. This is one playback interval, not an exact cycle closure test.</p>{/if}
        <p class="bu-muted">The contact fit uses dense template samples and source confidence. Manual pose edits are excluded. It does not measure rendered soles or prescribe engine speed. Review actual frames and movement together.</p>
      </section>
    {:else if result&&'failure'in result}<p class="bu-error" role="alert">{result.failure}</p>{/if}
    <section class="bu-dialog-surface controls" aria-label="Save and render">
      <button class="bu-btn" onclick={()=>download('pixeldoll-motion.json',doc)}>Save motion document</button><label class="bu-btn">Import motion document<input type="file" accept="application/json" onchange={imported}></label>
      <label class="bu-field">Candidate seed<input class="bu-input" type="number" min="1" step="1" bind:value={seed}></label>
      <button class="bu-btn" data-variant="primary" disabled={!fit||busy||!connected||!!mirroredFrom} onclick={generate}>Generate candidate ({poseCallGens(doc.times.length+(doc.buffer?1:0))} gens)</button>
      {#if mirroredFrom}<p>This view is a pixel mirror of {mirroredFrom}. Derive it from frozen {mirroredFrom} outputs without another generation. Mirroring also flips visible handedness.</p>{/if}
      <button class="bu-btn" onclick={async()=>{try{download('pixeldoll-motion-evidence.json',await exportEvidence());}catch(e){error=(e as Error).message;}}}>Export all evidence</button>
      <p>{campaign.reserved}/{LAB_CAP} generations reserved in this campaign. Live requests use the existing queue; prior candidates and unknown outcomes are never automatically resent.</p>
      <p>{campaign.reported} provider-reported generations. {campaign.withoutJob} reservations have no queued job; inspect the evidence before any further action.</p>
    </section>
    <section class="bu-dialog-surface controls" aria-label="Equipment qualification">
      <h2>Equipment qualification</h2>
      <label class="bu-field">Frozen body candidate<select class="bu-input" bind:value={equipmentBody}><option value="">Choose a completed body</option>{#each bodyCandidates as job}<option value={job.id}>{job.label}</option>{/each}</select></label>
      <label class="bu-field">Partner body view<select class="bu-input" bind:value={equipmentPartner}><option value="">Choose another view of the same body</option>{#each bodyCandidates as job}<option value={job.id}>{job.label}</option>{/each}</select></label>
      <label class="bu-field">Equipment design<select class="bu-input" bind:value={equipmentName}>{#each Object.entries(EQUIPMENT) as [id,item]}<option value={id}>{item.name}</option>{/each}</select></label>
      <button class="bu-btn" disabled={!connected||busy||!equipmentBody||!equipmentPartner} onclick={()=>equipmentAction(false)}>Dress paired standing references</button>
      <label class="bu-field">Dressed equipment reference<select class="bu-input" bind:value={equipmentDress}><option value="">Choose a completed design</option>{#each dressedCandidates as job}<option value={job.id}>{job.label}</option>{/each}</select></label>
      <button class="bu-btn" disabled={!connected||busy||!equipmentBody||!equipmentDress} onclick={()=>equipmentAction(true)}>Pose equipment on frozen body</button>
      <p class="bu-muted">Uses production chroma dressing and posing builders. Dressing reserves 10-25 gens by canvas; posing reserves 2-4 by frame count. Reuse a design only with the identical standing image and view. Raw results require extraction and alignment review before use.</p>
    </section>
    <section aria-label="Generated candidates" class="bu-stack">
      <label class="bu-field">Inspect candidate<select class="bu-input" bind:value={candidateId}><option value="">Most recent candidate</option>{#each $labQueue.jobs as job}<option value={job.id}>{job.label} · {job.state} · {job.gens} gens</option>{/each}</select></label>
      <p>{$labQueue.counts.done} completed · {$labQueue.counts.running} running · {$labQueue.counts.pending} queued · {$labQueue.counts.failed} failed</p>
      <p class="bu-muted">Queue {$labQueue.role} · {$labQueue.paused??'ready'} · {$labQueue.current}/{$labQueue.concurrency} remote slots</p>
      {#if inspected}{#key inspected.id}<Candidate job={inspected} buffer={campaign.byJob.get(inspected.id)?.document.buffer}/>{/key}{/if}
    </section>
  {/if}
</main>
<style>
  .lab{max-width:1600px;margin:auto;padding:24px}.lab header{display:flex;justify-content:space-between;gap:16px;flex-wrap:wrap}h1,h2,p{margin:0}h1{font-size:28px}.controls,.joint-fields{display:flex;gap:16px;flex-wrap:wrap;align-items:end}.controls,.timeline,.diagnostics{padding:16px}.controls .bu-field{width:160px}.previews{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:16px}.previews figure{margin:0;padding:12px;min-width:0}.previews canvas{width:100%;max-height:360px;object-fit:contain;image-rendering:pixelated;touch-action:none}.previews figcaption{min-height:48px}.timeline{display:grid;gap:16px}.frame-buttons{display:flex;gap:6px;overflow:auto}.frame-buttons button{min-width:44px}.joint-fields .bu-field{width:150px}.diagnostics{display:grid;gap:8px}.controls input[type=file]{max-width:200px}.bu-field input[type=number]{font-variant-numeric:tabular-nums}@media(max-width:1050px){.previews{grid-template-columns:repeat(2,minmax(0,1fr))}}@media(max-width:560px){.lab{padding:12px}.previews{grid-template-columns:1fr}.controls .bu-field{width:100%}}
</style>
