<script lang="ts">
  // A generating item: progress from the ledger, then the review (auto-finish with accept / try again at the end, PLAN D7).
  import { bakedFrame, composeCell } from '../lib/compose/compose.ts'
  import { queue } from '../lib/pixellab/queue.ts'
  import { failsOf } from '../lib/items/run.ts'
  import { itemRoute } from './itemRoute.ts'
  import { planGens } from '../lib/items/items.ts'
  import Sprite from './Sprite.svelte'
  import { groupOf, plainReason } from './model.ts'
  import { ui, store, genProgress, acceptGen, discardGen, retryGen, type Gen } from './state.svelte.ts'
  import { CircleAlert, CircleCheck, ChevronRight, TriangleAlert } from './icons.ts'
  import { app } from '../lib/app.svelte.ts'
  import { default as ApiPeek } from './ApiPeek.svelte'
  import { draftPlan, draftQueueIds } from './apiPlans.ts'

  let { g }: { g: Gen } = $props()
  const p = $derived(genProgress(g, $queue.jobs))
  const res = $derived(store.results[g.draft.spec.id])
  const prev = $derived(res?.preview)
  const anim = $derived(prev?.manifest.rig.animations.find((a) => a.id === g.draft.spec.anims[0]))
  const k = $derived(Math.max(1, Math.floor(ui.dpr)))
  const frame = $derived(prev ? bakedFrame(prev.manifest) : undefined) // a 96 px held item shows whole
  const reasons = $derived(res ? [...new Set(g.draft.calls.flatMap((_, i) => failsOf(res, i)).map(plainReason))] : [])
  const warns = $derived(res?.qa?.warnings.map(plainReason) ?? [])
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
        {#if res?.qa?.qa.status === 'pass'}<span class="badge clean"><CircleCheck size={12} />Clean</span>{:else}<span class="badge look"><TriangleAlert size={12} />Needs a look</span>{/if}
      {:else if g.phase === 'failed'}<span class="badge look"><CircleAlert size={12} />Failed</span>
      {:else}<span class="badge accent">Generating</span>{/if}
    </p>
  </header>

  {#if g.phase === 'running'}
    <div class="field">
      <div class="field-row small"><span>{g.status || 'Starting'}</span><span class="num muted">{p.pct}%</span></div>
      <div class="track" role="progressbar" aria-valuenow={p.pct} aria-valuemin={0} aria-valuemax={100} aria-label="{g.input.name} progress"><div class="fill" style:width="{Math.max(4, p.pct)}%"></div></div>
      <p class="muted small">
        {#if !app.key}Waiting for your PixelLab key.{:else if $queue.paused === 'offline'}Paused while you're offline; it continues by itself.{:else if $queue.paused}PixelLab paused the queue ({$queue.paused}).{:else}{g.draft.calls.length} batches of frames · about {5 + Math.ceil(g.draft.calls.length / 3) * 2} min. You can keep dressing up or close the tab; it picks up where it left off.{/if}
      </p>
    </div>
  {/if}

  {#if prev && anim}
    <div class="review-grid" aria-label="Preview in every direction">
      {#each prev.manifest.rig.directions as d (d.id)}
        <figure>
          <Sprite img={composeCell(prev, outfit, anim.id, d.id, anim.frames[ui.frame % anim.frames.length].cell, frame)} {k} w={frame?.w} h={frame?.h} checker label="{g.input.name} facing {d.id}" />
          {d.id[0].toUpperCase() + d.id.slice(1)}
        </figure>
      {/each}
    </div>
  {/if}

  {#if g.phase === 'review'}
    {#if !res?.qa}
      <p class="muted small">Checking the frames…</p>
    {:else if reasons.length || warns.length}
      <ul class="reasons small">{#each [...new Set([...reasons, ...warns])] as r (r)}<li><TriangleAlert size={12} />{r}</li>{/each}</ul>
    {:else}
      <p class="muted small">Every frame passed the checks.</p>
    {/if}
    <div class="actions">
      <button class="btn primary" onclick={accept} disabled={busy || !res?.qa}>Keep it</button>
      <span class="api-action"><ApiPeek scope={`item-retry-${g.draft.spec.id}`} label={`Try ${g.input.name} again`} plan={draftPlan(g.draft)} /><button class="btn" onclick={() => retryGen(g)} disabled={busy}>Try again <span class="cost">{planGens(g.draft.calls.map((c) => ({ kind: c.kind ?? 'edit', cells: c.cells })))} gens</span></button></span>
      <button class="btn plain danger" onclick={() => discardGen(g)} disabled={busy}>Discard</button>
    </div>
  {:else if g.phase === 'failed'}
    <p class="notice bad small"><CircleAlert size={14} />{g.error?.includes('5000') || g.error?.toLowerCase().includes('policy') ? 'PixelLab declined this prompt. Try different words.' : 'This item could not be made.'}</p>
    <div class="actions">
      <span class="api-action"><ApiPeek scope={`item-retry-${g.draft.spec.id}`} label={`Try ${g.input.name} again`} plan={draftPlan(g.draft)} /><button class="btn primary" onclick={() => retryGen(g)}>Try again</button></span>
      <button class="btn plain danger" onclick={() => discardGen(g)}>Discard</button>
    </div>
  {/if}

  <details class="disclosure">
    <summary><ChevronRight size={14} />Details</summary>
    <div>
      <dl class="kv">
        <dt>Prompt</dt><dd>{g.draft.spec.prompt}</dd>
        <dt>Slot</dt><dd>{g.draft.spec.slot} · {g.draft.spec.key} key</dd>
        <dt>Moves</dt><dd>{g.draft.spec.anims.join(', ')} × {g.draft.spec.dirs.join(', ')}</dd>
        <dt>Calls</dt><dd>{g.draft.calls.map((c, i) => `${i + 1}: ${c.cells.length} cells${c.rerolls ? `, ${c.rerolls} re-rolls` : ''}`).join(' · ')}</dd>
        <dt>Spent</dt><dd>{+itemRoute.spent(g.draft).toFixed(1)} gens</dd>
        {#if g.error}<dt>Error</dt><dd>{g.error}</dd>{/if}
      </dl>
      {#if g.draft.log.length}<p class="faint small">{g.draft.log.join(' · ')}</p>{/if}
    </div>
  </details>
</div>
