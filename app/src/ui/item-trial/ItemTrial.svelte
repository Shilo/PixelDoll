<script lang="ts">
  import { onMount } from 'svelte';
  import { connectLab } from '../motion-lab/run.ts';
  import { exportTrial, exportTrialPlan, parseTrialPacket, persistPreparedTrialPlan, prepareTrial, prepareTrialPlan, readTrials, restorePreparedTrialPlan, submitTrial, submitTrialPlan, trialQueue, type PreparedTrial, type PreparedTrialPlan, type TrialArm, type TrialPacket, type TrialPlan, type TrialRecord } from './trial.ts';

  let packet = $state<TrialPacket>();
  let arm = $state<TrialArm>('edit');
  let prepared = $state<PreparedTrial>();
  let plan = $state<TrialPlan>();
  let preparedPlan = $state<PreparedTrialPlan>();
  let records = $state<TrialRecord[]>([]);
  let connected = $state(false);
  let busy = $state(false);
  let error = $state('');
  let message = $state('Import a frozen public-fixture packet to begin.');
  let evidenceDownload = $state<{ url: string; name: string }>();

  onMount(() => {
    void action(async () => {
      const restored = await restorePreparedTrialPlan();
      if (restored) {
        plan = restored.plan;
        preparedPlan = restored;
        message = `Restored ${restored.plan.label}. Connect Agent mode to submit its unclaimed requests.`;
        if (import.meta.env.MODE === 'agent') await connectQueue();
      }
    });
    return () => { if (evidenceDownload) URL.revokeObjectURL(evidenceDownload.url); };
  });
  async function action(work: () => Promise<void>) {
    if (busy) return;
    busy = true;
    error = '';
    try { await work(); } catch (e) { error = e instanceof Error ? e.message : String(e); }
    finally { try { records = readTrials(); } catch (e) { error = (e as Error).message; } busy = false; }
  }
  async function imported(event: Event) {
    const file = (event.target as HTMLInputElement).files?.[0];
    if (!file) return;
    await action(async () => { packet = await parseTrialPacket(JSON.parse(await file.text())); prepared = undefined; plan = undefined; preparedPlan = undefined; message = `Loaded ${packet.label}. Preparation is free.`; });
  }
  async function importedPlan(event: Event) {
    const file = (event.target as HTMLInputElement).files?.[0];
    if (!file) return;
    await action(async () => {
      const checked = await prepareTrialPlan(JSON.parse(await file.text()));
      plan = checked.plan;
      preparedPlan = undefined;
      packet = undefined;
      prepared = undefined;
      message = `Loaded ${plan.label}. Prepare the entire plan to review each fixed request.`;
    });
  }
  async function connectQueue() {
    const balance = await connectLab(trialQueue);
    connected = !!balance;
    message = connected ? 'Agent connected. This trial queue resumes only its own retained receipts.' : 'Agent access is unavailable on this server.';
  }
  async function connect() { await action(connectQueue); }
  async function prepare() {
    await action(async () => { if (!packet) throw new Error('Import a trial packet first.'); prepared = await prepareTrial($state.snapshot(packet), arm); message = 'Request prepared. Review the endpoint, seed and inputs before submitting.'; });
  }
  async function submit() {
    await action(async () => { if (!prepared) throw new Error('Prepare the trial first.'); await submitTrial($state.snapshot(prepared)); records = readTrials(); message = 'The claim and queue receipt were saved. Watch the receipt below.'; });
  }
  async function preparePlan() {
    await action(async () => {
      if (!plan) throw new Error('Import a frozen trial plan first.');
      const next = await prepareTrialPlan($state.snapshot(plan));
      await persistPreparedTrialPlan(next);
      preparedPlan = next;
      message = 'All planned requests prepared and retained for reload. Review every row before submitting.';
    });
  }
  async function submitPlan() {
    await action(async () => {
      if (!preparedPlan) throw new Error('Prepare the plan first.');
      const result = await submitTrialPlan($state.snapshot(preparedPlan));
      message = `Queued ${result.submitted} planned requests. ${result.skipped} existing claims were retained for inspection.`;
    });
  }
  function downloadJson(name: string, value: unknown) {
    if (evidenceDownload) URL.revokeObjectURL(evidenceDownload.url);
    const url = URL.createObjectURL(new Blob([JSON.stringify(value)], { type: 'application/json' }));
    evidenceDownload = { url, name };
    message = 'Evidence is ready. Download the prepared file below.';
  }
  async function download(record: TrialRecord) {
    await action(async () => {
      const evidence = await exportTrial($state.snapshot(record));
      downloadJson(`item-trial-${record.packet.id}-${record.arm}.json`, evidence);
    });
  }
  async function downloadPlan() {
    await action(async () => { if (!preparedPlan) throw new Error('Prepare a plan before exporting its evidence.'); downloadJson(`item-trial-plan-${preparedPlan.plan.id}.json`, await exportTrialPlan($state.snapshot(preparedPlan))); });
  }
  const requestHash = $derived(prepared?.requestHash);
  const claimed = $derived(!!requestHash && records.some(record => record.requestHash === requestHash));
  const pendingPlan = $derived(preparedPlan?.trials.filter(trial => !records.some(record => record.requestHash === trial.requestHash)) ?? []);
  const pendingGenerations = $derived(pendingPlan.reduce((sum, trial) => sum + trial.estimatedGenerations, 0));
</script>

<main>
  <h1>Item Trials</h1>
  {#if import.meta.env.MODE === 'agent'}<p>Agent mode</p>{/if}
  <p>Development research using frozen inputs and real PixelLab credits.</p>
  <div class="actions">
    <button class="bu-btn" disabled={busy || connected} onclick={connect}>{connected ? 'Agent connected' : 'Connect Agent mode'}</button>
    <a href="/">Open Studio</a>
  </div>
  <label>Frozen trial packet<input type="file" accept="application/json,.json" disabled={busy} onchange={imported} /></label>
  <label>Frozen trial plan<input type="file" accept="application/json,.json" disabled={busy} onchange={importedPlan} /></label>
  {#if plan}<button class="bu-btn" disabled={busy} onclick={preparePlan}>Prepare trial plan</button>{/if}
  <label>Comparison arm<select class="bu-input" bind:value={arm} disabled={busy} onchange={() => prepared = undefined}>
    <option value="edit">Anchored edit</option><option value="transfer">Reference transfer</option><option value="pose">Skeleton pose</option><option value="grid">Frozen inpaint grid</option>
  </select></label>
  <button class="bu-btn" disabled={busy || !packet} onclick={prepare}>Prepare request</button>
  <p role="status">{message}</p>
  {#if evidenceDownload}<a href={evidenceDownload.url} download={evidenceDownload.name}>Download prepared evidence</a>{/if}
  {#if error}<p role="alert" class="bu-error">{error}</p>{/if}
  {#if prepared}
    <section aria-label="Prepared request">
      <h2>{prepared.packet.label}</h2>
      <p>{prepared.request.path} · seed {prepared.packet.seed} · {prepared.packet.targets.length} target frames · {prepared.expectedResults} expected returned images</p>
      <p>Reserve {prepared.estimatedGenerations} estimated generations. PixelLab may bill cash. The actual charge is reported in the retained receipt, and this estimate is not a provider quote.</p>
      <p>Request {prepared.requestHash}</p>
      <p>Packet {prepared.packetHash}</p>
      <p>Target palette: {prepared.packet.targetPalette ? `${prepared.packet.targetPalette.colors.length} exact colors` : 'Provider default'}</p>
      <div class="images"><img src={`data:image/png;base64,${prepared.sourcePng}`} alt="Dressed reference" />{#each prepared.targetPngs as target, i}<img src={`data:image/png;base64,${target}`} alt={prepared.packet.targets[i].key} />{/each}</div>
      <button class="bu-btn" disabled={busy || !connected || claimed} onclick={submit}>{claimed ? 'Request already claimed' : 'Submit one paid request'}</button>
    </section>
  {/if}
  {#if preparedPlan}
    <section aria-label="Prepared trial plan">
      <h2>{preparedPlan.plan.label}</h2>
      <p>{pendingPlan.length} unclaimed requests · {preparedPlan.trials.length - pendingPlan.length} existing claims · {pendingGenerations} estimated generations for unclaimed requests.</p>
      <p>PixelLab may bill cash. Actual charges come from provider receipts. Existing claims, including failed or unknown outcomes, remain available for inspection.</p>
      <p>Plan {preparedPlan.planHash}</p>
      <button class="bu-btn" disabled={busy || !connected || !pendingPlan.length} onclick={submitPlan}>Submit {pendingPlan.length} planned paid requests</button>
      <button class="bu-btn" disabled={busy} onclick={downloadPlan}>Export plan evidence</button>
      <div class="table-scroll"><table>
        <thead><tr><th>Trial</th><th>Endpoint</th><th>Seed</th><th>Targets</th><th>Target palette</th><th>Estimated gens</th><th>Claim</th></tr></thead>
        <tbody>{#each preparedPlan.trials as trial (trial.requestHash)}
          <tr><td>{trial.packet.label} · {trial.arm}</td><td>{trial.request.path}</td><td>{trial.packet.seed}</td><td>{trial.packet.targets.length}</td><td>{trial.packet.targetPalette ? `${trial.packet.targetPalette.colors.length} exact colors` : 'Provider default'}</td><td>{trial.estimatedGenerations}</td><td>{records.some(record => record.requestHash === trial.requestHash) ? 'Inspect existing claim' : 'Unclaimed'}</td></tr>
        {/each}</tbody>
      </table></div>
    </section>
  {/if}
  <section aria-label="Retained trial receipts">
    <h2>Retained trial receipts</h2>
    {#each records as record (record.requestHash)}
      {@const job = $trialQueue.jobs.find(j => j.id === record.jobId)}
      <article>
        <h3>{record.packet.label} · {record.arm}</h3>
        <p>{job?.state ?? (record.error ? 'Unknown submission outcome' : record.jobId ? 'Retained historical receipt; export for state' : 'Claim saved')} · {record.jobId ?? 'No queue ID recorded'}</p>
        {#if job}<p>Reported charges ${job.usd.toFixed(2)} and {job.gens} generations. {job.jobs.flatMap(j => j.results).length} retained images.</p>{/if}
        {#if record.error}<p role="alert">{record.error}</p>{/if}
        {#if job?.error}<p role="alert">{job.error}</p>{/if}
        <button class="bu-btn" disabled={busy} onclick={() => download(record)}>Export evidence</button>
      </article>
    {/each}
  </section>
</main>

<style>
  main { max-width: 1100px; margin: auto; padding: 24px; display: grid; gap: 16px; }
  h1, h2, h3, p { margin: 0; }
  p { overflow-wrap: anywhere; }
  label, section, article { display: grid; gap: 10px; }
  section, article { padding-block: 12px; }
  .actions, .images { display: flex; flex-wrap: wrap; align-items: center; gap: 12px; }
  .images img { width: 120px; height: 120px; object-fit: contain; image-rendering: pixelated; }
  button { justify-self: start; }
  .table-scroll { overflow: auto; }
  table { width: 100%; text-align: left; border-spacing: 12px; }
</style>
