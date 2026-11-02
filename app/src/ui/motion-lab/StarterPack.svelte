<script lang="ts">
  import { onMount } from 'svelte';
  import { listProjects, loadProject, type StoredProject } from '../../lib/store/project.ts';
  import { DIRECTIONS, defaultMs, type DirectionName } from '../../lib/rig/rig.ts';
  import { STARTER_PRESETS, type StarterPresetId } from '../../lib/rig/starter-presets.ts';
  import { projectEntries } from '../../lib/store/import.ts';
  import { zip } from '../../lib/store/zip.ts';
  import { emptyStarter, readStarter, prepareStarter, submitStarter, starterJobs, starterHeld, starterFrames, loadStarterSource, describeStarterPilot, STARTER_CAP, type StarterPilotReview } from './starter-pack.ts';
  import { buildStarterProject, placeStarterImage, type StarterLayout, type StarterProjectClip } from './starter-project.ts';
  import { starterRequest } from '../../lib/rig/starter-presets.ts';
  let { connected }: { connected: boolean } = $props();
  let projects = $state<StoredProject[]>([]), selected = $state(''), session = $state(emptyStarter()), jobs = $state.raw<Awaited<ReturnType<typeof starterJobs>>>(new Map());
  let busy = $state(false), error = $state(''), renderError = $state(''), status = $state(''), preset = $state<StarterPresetId>('slash'), direction = $state<DirectionName>('south'), frame = $state(0), playing = $state(false);
  let review = $state(''), layout = $state<StarterLayout>(), source = $state.raw<Awaited<ReturnType<typeof loadProject>>>(), clips = $state.raw<StarterProjectClip[]>([]);
  let idleSource = $state<StarterLayout['idleSource']>('standing');
  let inspectedPilot = $state<Omit<StarterPilotReview,'notes'>>();
  let bodyCanvas = $state<HTMLCanvasElement>(), restCanvas = $state<HTMLCanvasElement>();
  const ids = Object.keys(STARTER_PRESETS) as StarterPresetId[];
  const sourceMaps = () => Object.fromEntries(ids.map(id=>[id,id==='idle'&&idleSource==='standing'?[]:Array.from({length:STARTER_PRESETS[id].frames},(_,i)=>i)])) as StarterLayout['sourceFrames'];
  const usage = $derived.by(()=>{try{return{held:starterHeld(session,jobs),error:''}}catch(e){return{held:null,error:e instanceof Error?e.message:String(e)}}});
  const prepared = $derived(selected===session.projectId&&!!session.plans[preset]);
  const originalAvailable = $derived(projects.some(p=>p.id===selected));
  const stillIdle = $derived(preset==='idle'&&idleSource==='standing');
  const complete = $derived(['walk','slash',...(idleSource==='generated'?['idle']:[])].every(id=>clips.some(c=>c.plan.preset===id)));
  async function refresh() { session = readStarter(); jobs = await starterJobs(session); projects = await listProjects(); }
  async function action(fn: () => Promise<void>) { if (busy) return; busy = true; error = ''; try { await fn(); } catch (e) { error = e instanceof Error ? e.message : String(e); } finally { busy = false; } }
  async function prepare() {
    session = await prepareStarter(selected); layout = undefined; clips = []; source = undefined; review=''; inspectedPilot=undefined; renderError=''; idleSource='standing';
    status = 'Prepared eight exact native views. Preparation is free. Existing paid calls and reservations are retained.';
  }
  async function submit(extend: boolean) {
    if(!prepared)throw new Error('Prepare the selected source before purchasing motion.');
    if(stillIdle)throw new Error('Still idle uses the standing artwork and needs no generation.');
    const dirs = extend ? DIRECTIONS.filter(d => !['south','east'].includes(d)) : ['south','east'] as DirectionName[];
    const notes=layout?`Reviewed shared native source-frame map ${JSON.stringify(layout.sourceFrames[preset])}. ${review}`:review;
    session = await submitStarter(preset, dirs, extend&&inspectedPilot?{...$state.snapshot(inspectedPilot),notes}:undefined);
    status = 'Paid call reserved once. Refresh its saved results; no automatic retry or next action is started.';
    await refresh();
  }
  function propose(nextSource: NonNullable<typeof source>, nextClips: StarterProjectClip[]) {
    source=nextSource; clips=nextClips;
    const rig=source.project.manifest.rig,w=Math.max(rig.cell.w,rig.cell.h,...nextClips.flatMap(c=>c.entries.flatMap(e=>[e.image.w,e.image.h])));
    const maps=layout?$state.snapshot(layout.sourceFrames):sourceMaps();
    if(idleSource==='standing')maps.idle=[];
    layout={cell:{w,h:w},restOffset:{x:Math.floor((w-rig.cell.w)/2),y:Math.floor((w-rig.cell.h)/2)},idleSource,sourceFrames:maps,
      offsets:Object.fromEntries(ids.map(id=>[id,Object.fromEntries(DIRECTIONS.map(d=>{const cell=nextClips.find(c=>c.plan.preset===id)?.entries.find(e=>e.direction===d)?.image??rig.cell;return[d,{x:Math.floor((w-cell.w)/2),y:Math.floor((w-cell.h)/2)}]}))])) as StarterLayout['offsets'],reviewed:false,notes:''};
    frame=0;playing=false;
  }
  async function previewPilot() {
    if(!prepared)throw new Error('Select the prepared source before inspecting its motion.');
    await refresh();
    if(stillIdle){inspectedPilot=undefined;propose(await loadStarterSource($state.snapshot(session)),clips);direction='south';status='Still idle uses the exact standing artwork in every view. No generation or animated breathing is claimed.';return;}
    const clip = await starterFrames($state.snapshot(session), preset, jobs, false);
    inspectedPilot=clip.receipts.length===1?await describeStarterPilot(clip):undefined;
    propose(await loadStarterSource($state.snapshot(session)),[clip]);
    direction = clip.native.directions[0]; frame = 0; playing = false;
    status = 'Pilot native frames loaded. Centered padding is only a proposed authored layout, not a provider pivot. Review motion, palms, soles and perspective.';
  }
  async function loadPack() {
    if(!prepared)throw new Error('Select the prepared source before loading its pack.');
    await refresh();
    const current=$state.snapshot(session),idleCalls=current.calls.filter(c=>c.plan.binding===current.plans.idle?.binding);
    const retainedIdle=idleCalls.length>0&&idleCalls.every(c=>!!c.recordId&&jobs.get(c.recordId)?.state==='done')&&DIRECTIONS.every(d=>idleCalls.some(c=>c.directions.includes(d)));
    const wanted=ids.filter(id=>id!=='idle'||idleSource==='generated');
    const result=await Promise.all(wanted.map(id=>starterFrames(current,id,jobs)));
    let idleJournal='';
    if(idleSource==='standing'&&idleCalls.length){
      if(retainedIdle){
        try{result.unshift(await starterFrames(current,'idle',jobs));}
        catch(e){idleJournal=` Generated idle could not be archived: ${e instanceof Error?e.message:String(e)} It is retained in the saved job journal, not included in this free pack.`;}
      }else idleJournal=' Incomplete generated idle is retained in the saved job journal, not included in this free pack.';
    }
    propose(await loadStarterSource(current),result);
    status='The starter pack has eight views. Still idle is free; any retained generated idle is research evidence. Review alignment before exporting.'+idleJournal;
  }
  const clip = $derived(clips.find(c=>c.plan.preset===preset));
  const frames = $derived(stillIdle&&source?Array.from({length:STARTER_PRESETS.idle.frames},(_,index)=>({direction,index,image:source!.project.images.get(source!.project.manifest.rig.rest![direction]!.image)!})):clip?.entries.filter(e=>e.direction===direction).sort((a,b)=>a.index-b.index)??[]);
  $effect(()=>{ if (!layout || !source || !bodyCanvas || !restCanvas || !frames[frame]) return;
    renderError='';
    try {
      const sample=stillIdle?frame:layout.sourceFrames[preset][frame];
      if(!Number.isSafeInteger(sample)||!frames[sample])throw new Error('Choose a valid native source sample for this playback slot.');
      const native=frames[sample].image,rig=source.project.manifest.rig,rest=source.project.images.get(rig.rest![direction]!.image)!;
      const show=(canvas:HTMLCanvasElement,image:typeof native)=>{canvas.width=image.w;canvas.height=image.h;canvas.getContext('2d')!.putImageData(new ImageData(new Uint8ClampedArray(image.data),image.w,image.h),0,0)};
      show(restCanvas,placeStarterImage(rest,layout.cell,layout.restOffset));
      show(bodyCanvas,placeStarterImage(native,layout.cell,stillIdle?layout.restOffset:layout.offsets[preset][direction]!));
    } catch(e) {bodyCanvas.getContext('2d')!.clearRect(0,0,bodyCanvas.width,bodyCanvas.height);restCanvas.getContext('2d')!.clearRect(0,0,restCanvas.width,restCanvas.height);renderError=e instanceof Error?e.message:String(e);playing=false;}
  });
  $effect(()=>{if(!playing||!frames.length)return;const timer=setTimeout(()=>{if(!STARTER_PRESETS[preset].loop&&frame===frames.length-1){playing=false;return;}frame=(frame+1)%frames.length},defaultMs(preset));return()=>clearTimeout(timer)});
  function changed(){if(layout)layout.reviewed=false;playing=false;error='';}
  function changeIdleSource(){if(layout){layout.idleSource=idleSource;layout.sourceFrames.idle=idleSource==='standing'?[]:Array.from({length:STARTER_PRESETS.idle.frames},(_,i)=>i);}changed();frame=0;review='';inspectedPilot=undefined;}
  async function exportPack() {
    if(!source||!layout)throw new Error('Load the complete pack and review its layout first.');
    const built=await buildStarterProject(source.project,$state.snapshot(clips),$state.snapshot(layout)),entries=await projectEntries(built.project);
    entries.push({name:'starter-evidence.json',data:new TextEncoder().encode(JSON.stringify(built.evidence,null,2))},...built.rawEntries);
    const bytes=await zip(entries),url=URL.createObjectURL(new Blob([bytes as Uint8Array<ArrayBuffer>],{type:'application/zip'})),a=document.createElement('a');a.href=url;a.download='experimental-eight-direction-starter.pixeldoll.zip';a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);
    status='Exported a body-only experimental pack for Studio import. Pose setup and equipment/weapon qualification remain separate.';
  }
  onMount(()=>{void action(async()=>{await refresh();selected=session.projectId;})});
</script>

<section class="starter bu-stack" aria-label="Eight-direction starter pack">
  <h2>Eight-direction starter pack</h2>
  <p>Experimental body pack: free still idle, walk and one right-handed overhead attack. Walk and attack each share one Skeleton V3 motion across views. No 2D pose rerender, mirrored views or automatic paid retries.</p>
  {#if error||renderError||usage.error}<p class="bu-error" role="alert">{[error,renderError,usage.error].filter(Boolean).join(' ')}</p>{/if}
  {#if status}<p role="status">{status}</p>{/if}
  <div class="bu-actions"><label>Studio source<select class="bu-select" disabled={busy} bind:value={selected} onchange={()=>{layout=undefined;source=undefined;clips=[];review='';inspectedPilot=undefined;renderError=''}}><option value="">Choose a Unique 8 humanoid</option>{#each projects as p}<option value={p.id}>{p.manifest.name}</option>{/each}{#if session.sourceSnapshotId&&session.projectId&&!projects.some(p=>p.id===session.projectId)}<option value={session.projectId}>Retained prepared source</option>{/if}</select></label><button class="bu-btn" disabled={busy||!selected||!originalAvailable} onclick={()=>action(prepare)}>Prepare native source</button><button class="bu-btn" disabled={busy} onclick={()=>action(refresh)}>Refresh saved results</button></div>
  {#if session.projectId}<p>Prepared source: {projects.find(p=>p.id===session.projectId)?.manifest.name??session.projectId}</p>{/if}
  <p>Preparation and inspection are free. Each generation button purchases only its named views. Reserved or billed: {usage.held===null?'unverified':usage.held.toFixed(2)} / {STARTER_CAP} units in this bounded pilot. Estimates are not guaranteed billing caps.</p>
  <div class="bu-actions"><label>Starter action<select class="bu-select" disabled={busy} bind:value={preset} onchange={()=>{frame=0;playing=false;review='';inspectedPilot=undefined;renderError=''}}><option value="idle">Idle</option><option value="walk">Walk</option><option value="slash">Right-handed overhead attack</option></select></label><button class="bu-btn" disabled={busy||stillIdle||!prepared||!originalAvailable||!connected||!!usage.error} onclick={()=>action(()=>submit(false))}>Generate south + east · Est. 8 gens</button><button class="bu-btn" disabled={busy||!prepared} onclick={()=>action(previewPilot)}>Inspect completed action</button></div>
  {#if preset==='idle'}<label>Idle art source<select class="bu-select" disabled={busy} bind:value={idleSource} onchange={changeIdleSource}><option value="standing">Still idle from standing · Free</option><option value="generated">Generated breathing · Experimental</option></select></label><p>Still idle reuses the unchanged standing pose. Generated breathing can add unwanted effects and is not the recommended pack source.</p>{/if}
  {#if session.plans[preset]&&!stillIdle}<details><summary>Inspect pilot API request</summary><pre>{JSON.stringify(starterRequest(session.plans[preset]!,['south','east']),null,2)}</pre></details>{/if}
  <label>Pilot review notes<textarea class="bu-input" bind:value={review} placeholder="Review body, hand, feet, canvas and transitions before expanding."></textarea></label>
  <button class="bu-btn" disabled={busy||stillIdle||!prepared||!originalAvailable||!inspectedPilot||!review.trim()||!connected||!!usage.error} onclick={()=>action(()=>submit(true))}>Add remaining six to same motion · Est. 24 gens</button>
  <ul>{#each session.calls as call}<li>{call.plan.preset}: {call.directions.join(', ')} · {call.recordId?jobs.get(call.recordId)?.state??'saved job missing':'reserved; no replay'}{call.error?` · ${call.error}`:''}</li>{/each}</ul>
  <button class="bu-btn" disabled={busy||!prepared} onclick={()=>action(loadPack)}>Load complete three-action pack</button>
  {#if layout&&source}
    <p>Layout is an explicit authoring choice. Only one integer translation per action/view applies to all its frames. Raw PNGs stay in the ZIP. Changing alignment clears layout approval.</p>
    <div class="bu-actions"><label>Canvas size<input class="bu-input" type="number" min="32" max="256" bind:value={layout.cell.w} onchange={()=>{layout!.cell.h=layout!.cell.w;changed()}}></label><label>Standing X<input class="bu-input" type="number" bind:value={layout.restOffset.x} onchange={changed}></label><label>Standing Y<input class="bu-input" type="number" bind:value={layout.restOffset.y} onchange={changed}></label></div>
    <div class="bu-actions"><label>Native view<select class="bu-select" bind:value={direction} onchange={()=>{frame=0;playing=false}}>{#each DIRECTIONS as d}<option value={d}>{d}</option>{/each}</select></label><label>Motion X<input class="bu-input" type="number" disabled={stillIdle} bind:value={layout.offsets[preset][direction]!.x} onchange={changed}></label><label>Motion Y<input class="bu-input" type="number" disabled={stillIdle} bind:value={layout.offsets[preset][direction]!.y} onchange={changed}></label></div>
    {#if frames.length}{#if !stillIdle}<label>Native source sample<select class="bu-select" bind:value={layout.sourceFrames[preset][frame]} onchange={()=>{changed();review=''}}>{#each frames as sample}<option value={sample.index}>Sample {sample.index+1}</option>{/each}</select></label>{/if}
    <p>Sample selection applies to this playback slot in every view of this action. Holds reuse a complete native pose; they never erase or invent anatomy. All originals remain in raw evidence, while only selected samples enter playable sheets.</p>
    <div class="views"><figure><figcaption>Standing reference on authored canvas</figcaption><canvas bind:this={restCanvas} aria-label="Starter standing reference"></canvas></figure><figure><figcaption>{preset} {direction}, frame {frame+1}/{frames.length} · {stillIdle?'standing reference':`native sample ${layout.sourceFrames[preset][frame]+1}`}</figcaption><canvas bind:this={bodyCanvas} aria-label="Starter native motion"></canvas></figure></div>
    <div class="bu-actions"><button class="bu-btn" onclick={()=>{playing=false;frame=(frame+frames.length-1)%frames.length}}>Previous native frame</button><button class="bu-btn" onclick={()=>{if(!playing&&frame===frames.length-1)frame=0;playing=!playing}}>{playing?'Pause native motion':'Play native motion'}</button><button class="bu-btn" onclick={()=>{playing=false;frame=(frame+1)%frames.length}}>Next native frame</button></div>{:else}<p>No completed artwork for this action/view. Existing views are not mirrored into it.</p>{/if}
    <label>Layout review notes<textarea class="bu-input" bind:value={layout.notes}></textarea></label>
    <label><input type="checkbox" bind:checked={layout.reviewed}>I reviewed whole-view alignment and the common pivot. This does not certify anatomy or weapon quality.</label>
    <button class="bu-btn" disabled={busy||!layout.reviewed||!layout.notes.trim()||!complete} onclick={()=>action(exportPack)}>Export experimental Studio pack · Free</button>
  {/if}
</section>
<style>.starter{padding:16px}.starter textarea{min-height:72px}.starter pre{overflow:auto;max-width:100%}.views{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:16px}.views figure{margin:0}.views canvas{width:100%;image-rendering:pixelated}.starter input[type=number]{width:100px}@media(max-width:560px){.views{grid-template-columns:1fr}}</style>
