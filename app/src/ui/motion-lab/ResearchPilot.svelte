<script lang="ts">
  import {labQueue,reconcileResearchJobs} from './run.ts';
  import {importPilot,verifyPilot,pilotInstructions,pilotCustom,refreshPilot,exportPilot,readPilot} from './pilot.ts';
  import {readResearchBudget,researchBudgetUsage,recordResearchGate,RESEARCH_STAGE_CAPS,type ResearchStage} from './research-budget.ts';
  import type {MotionFixture} from './model.ts';
  import WeaponAwareProbe from './WeaponAwareProbe.svelte';
  import {parseManagedEquipment,submitManagedEquipment,exportManagedEquipment,readManagedEquipment,type ManagedEquipmentProbe} from './managed-equipment.ts';
  let {connected,fixture,download}:{connected:boolean;fixture:MotionFixture;download:(name:string,value:unknown)=>void}=$props();
  let pilotState=$state(readPilot()),budget=$state(readResearchBudget()),busy=$state(false),error=$state(''),result=$state<unknown>(),stage=$state<ResearchStage>('body'),notes=$state(''),evidence=$state('');
  const usage=$derived(researchBudgetUsage(budget));
  let equipmentPacket=$state<ManagedEquipmentProbe>(),equipmentReceipt=$state(readManagedEquipment()),equipmentFile:HTMLInputElement;
  async function importEquipment(event:Event){try{const file=(event.target as HTMLInputElement).files?.[0];if(!file)return;equipmentPacket=parseManagedEquipment(JSON.parse(await file.text()));error='';}catch(e){error=(e as Error).message;}}
  async function equipmentAction(submit:boolean){if(busy)return;busy=true;error='';try{if(submit){if(!equipmentPacket)throw new Error('Import the reviewed diagnostic first.');result=await submitManagedEquipment(equipmentPacket);}else download('pixeldoll-managed-equipment-diagnostic.json',await exportManagedEquipment());}catch(e){error=(e as Error).message;}finally{equipmentReceipt=readManagedEquipment();budget=readResearchBudget();busy=false;}}
  const importJob=$derived($labQueue.jobs.find(j=>j.id===pilotState?.importJobId));
  async function action(kind:'import'|'verify'|'instructions'|'custom'|'refresh'|'export'|'pass'|'fail'){
    if(busy)return;busy=true;error='';try{
      if(kind==='import')result=await importPilot(fixture);
      else if(kind==='verify')result=await verifyPilot(fixture);
      else if(kind==='instructions')result=await pilotInstructions();
      else if(kind==='custom')result=await pilotCustom();
      else if(kind==='refresh'){await reconcileResearchJobs();result=connected?await refreshPilot():readResearchBudget();}
      else if(kind==='export')download('pixeldoll-controlled-workflow-pilot.json',await exportPilot());
      else result=await recordResearchGate(stage,{passed:kind==='pass',notes,evidence:evidence.split('\n').map(s=>s.trim()).filter(Boolean)});
    }catch(e){error=(e as Error).message;}finally{pilotState=readPilot();budget=readResearchBudget();busy=false;}
  }
  const shown=$derived.by(()=>{const value=result as {content?:{type:string;text?:string}[]}|undefined;return value?.content?{...value,content:value.content.filter(c=>c.type==='text')}:result;});
</script>
<section class="bu-dialog-surface research" aria-label="Controlled workflow research pilot">
  <h2>Controlled workflow research pilot</h2>
  <p>998 generations settled before this phase. Additional allowance: 1,000. Initial staged pilot: 200 maximum. Historical ledgers stay intact.</p>
  <p>{usage.billedUnits} new units reported; {usage.reservedUnits}/200 conservatively reserved. Body {usage.stageUnits.body}/{RESEARCH_STAGE_CAPS.body}, equipment {usage.stageUnits.equipment}/{RESEARCH_STAGE_CAPS.equipment}, replication {usage.stageUnits.replication}/{RESEARCH_STAGE_CAPS.replication}.</p>
  <p>Exact adult reference import, south/east motion comparison. West is supplied as its recorded mirrored derivative. Imported pixels must match before animation. Mask and grip authoring are internal research tools.</p>
  <div class="bu-actions">
    <button class="bu-btn" disabled={!connected||busy||!!pilotState} onclick={()=>action('import')}>Import exact benchmark views (reserve 1 gen)</button>
    <button class="bu-btn" disabled={!connected||busy||importJob?.state!=='done'} onclick={()=>action('verify')}>Verify imported reference pixels (free)</button>
    <button class="bu-btn" disabled={!connected||busy||!pilotState?.verification||pilotState.verification.some(v=>v.changedPixels)} onclick={()=>action('instructions')}>Read controlled authoring instructions (free)</button>
    <button class="bu-btn" disabled={!connected||busy||!pilotState?.instructions||!!pilotState.customCallId} onclick={()=>action('custom')}>Render controlled custom south and east (reserve 8 gens)</button>
    <button class="bu-btn" disabled={busy} onclick={()=>action('refresh')}>Refresh pilot receipts and costs</button>
    <button class="bu-btn" disabled={busy} onclick={()=>action('export')}>Export controlled pilot evidence</button>
  </div>
  <p aria-live="polite">{busy?'Working on the selected research action.':`Import: ${importJob?.state??'not submitted'}; exact-reference check: ${pilotState?.verification?.every(v=>v.changedPixels===0)?'passed':'not passed'}.`}</p>
  <details><summary>Internal qualification gate</summary><p>Review actual anatomy, visible sole landmarks, grip, perspective, occlusion and item design. A pixel metric alone cannot pass this gate.</p><label>Research stage<select class="bu-input" bind:value={stage}>{#each Object.keys(RESEARCH_STAGE_CAPS) as key}<option value={key}>{key}</option>{/each}</select></label><label>Qualification notes<textarea class="bu-input" bind:value={notes}></textarea></label><label>Evidence references, one per line<textarea class="bu-input" bind:value={evidence}></textarea></label><div class="bu-actions"><button class="bu-btn" disabled={busy||!notes.trim()||!evidence.trim()} onclick={()=>action('pass')}>Record reviewed gate pass</button><button class="bu-btn" disabled={busy||!notes.trim()||!evidence.trim()} onclick={()=>action('fail')}>Record gate failure</button></div><pre>{JSON.stringify(budget.gates,null,2)}</pre></details>
  <details><summary>One frozen managed-frame equipment diagnostic</summary><p>Four reviewed east frames and the existing sword design. This tests grip and perspective; protected pixels must remain exact. Editable body pixels and hidden contacts remain qualification risks. Reserve 25 units, once.</p><input hidden type="file" accept="application/json,.json" bind:this={equipmentFile} onchange={importEquipment}/><div class="bu-actions"><button class="bu-btn" disabled={busy||!!equipmentReceipt} onclick={()=>equipmentFile.click()}>Import frozen equipment diagnostic</button><button class="bu-btn" disabled={!connected||busy||!equipmentPacket||!!equipmentReceipt||!budget.gates.body?.passed} onclick={()=>equipmentAction(true)}>Render frozen equipment diagnostic (reserve 25 gens)</button><button class="bu-btn" disabled={busy} onclick={()=>equipmentAction(false)}>Export frozen equipment diagnostic</button></div><p>{equipmentPacket?'Diagnostic packet loaded; exact reviewed-file check runs before rendering.':'No diagnostic packet loaded.'} Receipt: {equipmentReceipt?.jobId??'not submitted'}.</p></details>
  <WeaponAwareProbe {connected} {download} onbudget={()=>budget=readResearchBudget()}/>
  {#if error}<p class="bu-error" role="alert">{error}</p>{/if}{#if shown}<details open><summary>Latest pilot result, full response retained in export</summary><pre>{JSON.stringify(shown,null,2)}</pre></details>{/if}
</section>
<style>.research{padding:16px;display:grid;gap:12px}.research pre{max-height:420px;overflow:auto;white-space:pre-wrap;overflow-wrap:anywhere}.research label{display:grid;gap:6px}</style>
