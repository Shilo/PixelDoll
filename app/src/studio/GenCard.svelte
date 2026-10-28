<script lang="ts">
  // A generating item: progress from the ledger and its landed frames, then an optional review (round 10: a clean draft saves
  // itself; Keep it / Try again / Discard stay available for the rest). Wear shows the draft on the character meanwhile.
  import { bakedFrame, composeCell } from '../lib/compose/compose.ts'
  import { queue } from '../lib/pixellab/queue.ts'
  import { failsOf, gensOf, usdOf, hasStructuralFailure, incompleteCoverage, isClean } from '../lib/items/run.ts'
  import { loadProject } from '../lib/store/project.ts'
  import { itemRoute } from './itemRoute.ts'
  import Sprite from './Sprite.svelte'
  import { groupOf, plainReason } from './model.ts'
  import { ui, doc, store, genProgress, acceptGen, discardGen, retryGen, wearDraft, type Gen } from './state.svelte.ts'
  import { CircleAlert, CircleCheck, ChevronRight, LoaderCircle, TriangleAlert } from './icons.ts'
  import { app } from '../lib/app.svelte.ts'
  import { default as ApiPeek } from './ApiPeek.svelte'
  import { draftPlan, draftQueueIds } from './apiPlans.ts'

  let { g }: { g: Gen } = $props()
  const p = $derived(genProgress(g, $queue.jobs))
  const spent = $derived(gensOf(g.draft, $queue.jobs))
  const spentUsd = $derived(usdOf(g.draft, $queue.jobs))
  const res = $derived(store.results[g.draft.spec.id])
  const prev = $derived(res?.preview)
  const anims = $derived(prev?.manifest.rig.animations.filter((a) => g.draft.spec.anims.includes(a.id)) ?? [])
  const anim = $derived(anims.find((a) => a.id === ui.anim) ?? anims[0])
  const dirs = $derived(prev && anim ? prev.manifest.rig.directions.filter((d) => (g.draft.spec.clipDirs?.[anim.id] ?? g.draft.spec.dirs).includes(d.mirrorOf ?? d.id)) : [])
  const k = $derived(Math.max(1, Math.floor(ui.dpr)))
  const frame = $derived(prev ? bakedFrame(prev.manifest) : undefined) // a 96 px held item shows whole
  const reasons = $derived(res ? [...new Set(g.draft.calls.flatMap((_, i) => failsOf(res, i)).map(plainReason))] : [])
  const warns = $derived(res?.qa?.warnings.map(plainReason) ?? [])
  const incomplete = $derived(!res || !prev || incompleteCoverage(g.draft, prev.manifest.rig, res))
  const clean = $derived(!!res && !incomplete && isClean(res))
  const worn = $derived(doc.drafts[g.draft.spec.slot] === g.draft.spec.id)
  // views whose frames are still generating (the preview item lists them as pending)
  const loadingDirs = $derived(g.phase === 'running' && anim ? new Set(prev?.manifest.items.find((i) => i.id === g.draft.spec.id)?.pending?.filter((k) => k.startsWith(`${anim.id}/`)).map((k) => k.split('/')[1])) : new Set<string>())
  let retryGens = $state<number | null>(null)
  let retryEstimateError = $state('')
  $effect(() => {
    const projectId = g.draft.rigId, input = $state.snapshot(g.input)
    void store.project?.manifest // Re-price when the character's coverage changes.
    let current = true
    retryGens = null; retryEstimateError = ''
    // Try again creates a fresh item plan; old fallback calls are not the next attempt's plan.
    void loadProject(projectId).then((ctx) => {
      const plan = itemRoute.plan(ctx.rec.manifest.rig, ctx, input)
      if (current) retryGens = plan.gens
    }).catch(() => { if (current) retryEstimateError = 'Could not estimate this retry. Reopen the character and try again.' })
    return () => { current = false }
  })
  let busy = $state(false)
  async function accept() { busy = true; try { await acceptGen(g) } finally { busy = false } }
  // wear the draft in the review previews
  const outfit = $derived({ [g.draft.spec.slot]: g.draft.spec.id })
</script>

<div class="gen">
  <header class="insp-head">
    <div class="api-action"><h2 class="insp-title">{g.input.name}</h2><ApiPeek scope={`item-generation-${g.draft.spec.id}`} label={`Generate ${g.input.name}`} plan={draftPlan(g.draft)} queueIds={draftQueueIds(g.draft)} /></div>
    <p class="insp-sub">
      <span>{groupOf(g.input.slot).id}</span>
      {#if g.phase === 'review'}
        {#if clean}<span class="badge clean"><CircleCheck size={12} />Clean</span>{:else}<span class="badge look"><TriangleAlert size={12} />Needs a look</span>{/if}
      {:else if g.phase === 'failed'}<span class="badge look"><CircleAlert size={12} />Failed</span>
      {:else}<span class="badge accent">Generating</span>{/if}
    </p>
  </header>

  {#if g.phase === 'running'}
    <div class="field">
      <div class="field-row small"><span>{g.status || 'Starting'}</span><span class="num muted">{p.pct}%</span></div>
      <div class="track" role="progressbar" aria-valuenow={p.pct} aria-valuemin={0} aria-valuemax={100} aria-label="{g.input.name} progress"><div class="fill" style:width="{Math.max(4, p.pct)}%"></div></div>
      <p class="muted small">
        {#if !app.key}Waiting for your PixelLab key.{:else if $queue.paused === 'offline'}Paused while you’re offline. Submitted jobs may still finish or charge.{:else if $queue.paused}PixelLab paused the queue ({$queue.paused}).{:else}{g.draft.calls.length} batches of frames · about {5 + Math.ceil(g.draft.calls.length / 3) * 2} min + queue time. Keep this tab open while PixelLab responds. You can keep dressing up. Unknown outcomes stop for review in Activity.{/if}
      </p>
    </div>
  {/if}

  {#if g.draft.rigId === doc.id && g.phase !== 'failed'}
    <button class="bu-action btn" data-variant="outline" onclick={() => wearDraft(g.draft.spec.id)}>{worn ? 'Take off' : 'Wear'}</button>
  {/if}

  {#if prev && anim}
    <label class="field"><span class="label small">Preview move</span><select class="bu-input input" value={anim.id} onchange={(e) => { ui.anim = e.currentTarget.value; ui.frame = 0 }}>{#each anims as a (a.id)}<option value={a.id}>{a.id[0].toUpperCase() + a.id.slice(1).replace(/-/g, ' ')}</option>{/each}</select></label>
    <div class="review-grid" aria-label="Preview in every direction">
      {#each dirs as d (d.id)}
        <figure>
          <Sprite img={composeCell(prev, outfit, anim.id, d.id, anim.frames[ui.frame % anim.frames.length].cell, frame)} {k} w={frame?.w} h={frame?.h} checker label="{g.input.name} facing {d.id}" />
          <span class="dir-caption">{#if loadingDirs.has(d.mirrorOf ?? d.id)}<LoaderCircle size={12} class="spin" aria-label="loading" />{/if}{d.id[0].toUpperCase() + d.id.slice(1)}</span>
        </figure>
      {/each}
    </div>
  {/if}

  {#if g.phase === 'review'}
    {#if !res?.qa}
      <p class="muted small">Checking the frames…</p>
    {:else if reasons.length || warns.length}
      <ul class="reasons small">{#each [...new Set([...reasons, ...warns])] as r (r)}<li><TriangleAlert size={12} />{r}</li>{/each}</ul>
    {:else if clean}
      <p class="muted small">Every frame passed the checks.</p>
    {:else}
      <p class="muted small">Some checks need review.</p>
    {/if}
    <div class="actions">
      <button class="bu-action btn primary" data-variant="primary" onclick={accept} disabled={busy || !res?.qa || hasStructuralFailure(res) || incomplete}>Keep it</button>
      <span class="api-action"><ApiPeek scope={`item-retry-${g.draft.spec.id}`} label={`Try ${g.input.name} again`} plan={draftPlan(g.draft)} /><button class="bu-action btn" data-variant="outline" onclick={() => retryGen(g)} disabled={busy || retryGens === null}>Try again <span class="cost">Est. {retryGens ?? '–'} gens</span></button></span>
      <button class="bu-action btn plain danger" data-variant="quiet" onclick={() => discardGen(g)} disabled={busy}>Discard</button>
    </div>
    {#if incomplete}<p class="notice warn small">Some frames were not generated. Try again to resolve the standing design before animation continues.</p>{/if}
  {:else if g.phase === 'failed'}
    <p class="notice bad small"><CircleAlert size={14} />{g.error?.includes('5000') || g.error?.toLowerCase().includes('policy') ? 'PixelLab declined this prompt. Try different words.' : 'This item could not be made.'}</p>
    <div class="actions">
      <span class="api-action"><ApiPeek scope={`item-retry-${g.draft.spec.id}`} label={`Try ${g.input.name} again`} plan={draftPlan(g.draft)} /><button class="bu-action btn primary" data-variant="primary" onclick={() => retryGen(g)} disabled={busy || retryGens === null}>Try again <span class="cost">Est. {retryGens ?? '–'} gens</span></button></span>
      <button class="bu-action btn plain danger" data-variant="quiet" onclick={() => discardGen(g)}>Discard</button>
    </div>
  {/if}

  {#if g.phase !== 'running' && retryEstimateError}<p class="notice bad small"><CircleAlert size={14} />{retryEstimateError}</p>{/if}
  {#if g.phase !== 'running'}<p class="faint small">PixelLab may bill some calls in dollars. Retries and fallbacks cost extra; queue time varies.</p>{/if}
  <details class="disclosure">
    <summary><ChevronRight size={14} />Details</summary>
    <div>
      <dl class="kv">
        <dt>Prompt</dt><dd>{g.draft.spec.prompt}</dd>
        <dt>Slot</dt><dd>{g.draft.spec.slot} · {g.draft.spec.key} key</dd>
        <dt>Moves</dt><dd>{g.draft.spec.anims.join(', ')} × {g.draft.spec.dirs.join(', ')}</dd>
        <dt>Calls</dt><dd>{g.draft.calls.map((c, i) => `${i + 1}: ${c.cells.length} cells${c.rerolls ? `, ${c.rerolls} re-rolls` : ''}`).join(' · ')}</dd>
        <dt>Spent</dt><dd>{+spent.toFixed(2)} gens{spentUsd ? ` + $${spentUsd.toFixed(3)}` : ''}</dd>
        {#if g.error}<dt>Error</dt><dd>{g.error}</dd>{/if}
      </dl>
      {#if g.draft.log.length}<p class="faint small">{g.draft.log.join(' · ')}</p>{/if}
    </div>
  </details>
</div>
