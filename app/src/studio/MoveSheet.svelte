<script lang="ts">
  // Add a move: an authored action (raw skeleton-v3 keypoints from the rest pose, S3) or a described one (pixminimax motion,
  // re-rendered through raw skeleton-v3), plus one pose call per worn item x direction so the items follow the new clip.
  import Sheet from './Sheet.svelte'
  import { default as ApiPeek } from './ApiPeek.svelte'
  import { movePlan } from './apiPlans.ts'
  import { formDrafts } from './formDrafts.ts'
  import * as db from '../lib/store/db.ts'
  import type { StoredProject } from '../lib/store/project.ts'
  import { posable, poseGens } from '../lib/items/run.ts'
  import { AUTHORED } from '../lib/rig/poses.ts'
  import { MOVE_STEPS, isV13, moveEstimate } from './create.ts'
  import { bodyQualityNote } from './model.ts'
  import { ui, doc, store, isDemo, moving, settingUp, startMove, dismissMove, withKey } from './state.svelte.ts'
  import { Check, ChevronRight, CircleAlert } from './icons.ts'

  const m = $derived(store.project?.manifest)
  let rec = $state.raw<StoredProject | null>(null)
  $effect(() => { if (!isDemo()) void db.get<StoredProject>('projects', doc.id).then((r) => (rec = r ?? null)) })
  const ok = $derived(!!m && isV13(rec ? { ...rec, manifest: m } : null))
  const have = $derived(new Set(m?.rig.animations.map((a) => a.id) ?? []))
  const options = ['idle', 'walk', ...AUTHORED]
  const draft = formDrafts.move?.projectId === doc.id ? formDrafts.move : undefined
  let action = $state(draft?.action ?? options.find((a) => !have.has(a)) ?? '')
  let text = $state(draft?.text ?? '')
  const slug = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 24)
  const id = $derived(text.trim() ? slug(text.split(/[,.]/)[0].split(/\s+/).slice(0, 2).join(' ')) : action)
  const items = $derived(m ? posable(m).filter((item) => !item.design) : [])
  const sharedItems = $derived(m?.items.filter((item) => item.design && item.status === 'accepted') ?? [])
  let skip = $state<string[]>(draft?.skip ?? [])
  const chosen = $derived(items.filter((i) => !skip.includes(i.id)).map((i) => i.id))
  const sharedChosen = $derived(sharedItems.filter((i) => !skip.includes(i.id)).map((i) => i.id))
  const est = $derived(m && id ? moveEstimate(m, { action: text.trim() ? undefined : action, frames: 8, items: chosen }) : null)
  const dirs = $derived(m ? m.rig.directions.filter((d) => !d.mirrorOf).length : 3)
  const mine = $derived(!!moving.spec && moving.projectId === doc.id)
  const stepIx = $derived(MOVE_STEPS.findIndex((s) => s.id === moving.progress?.step))
  const nice = (s: string) => s[0].toUpperCase() + s.slice(1).replace(/-/g, ' ')

  function go() {
    const projectId = doc.id
    const spec = { id, action: text.trim() ? undefined : action, text: text.trim() || undefined, frames: 8, items: chosen, sharedItems: sharedChosen, seed: 1 + Math.floor(Math.random() * 1_000_000) }
    formDrafts.move = { projectId, action, text, skip: $state.snapshot(skip) }
    withKey(() => { formDrafts.move = undefined; void startMove(projectId, spec); ui.sheet = 'move' }, true)
  }
</script>

{#snippet foot()}
  {#if mine && moving.done}
    <button class="btn primary" onclick={() => { void dismissMove(); ui.sheet = null }}>Done</button>
  {:else if mine && moving.error}
    <button class="btn plain" onclick={dismissMove}>Start over</button>
    <span class="api-action"><ApiPeek scope="move-retry" label="Try move again" plan={moving.spec ? movePlan(rec, { ...moving.spec, seed: undefined }) : []} /><button class="btn primary" onclick={() => moving.spec && withKey(() => void startMove(moving.projectId, { ...$state.snapshot(moving.spec!), seed: 1 + Math.floor(Math.random() * 1_000_000) }), true)}>Try again</button></span><!-- new seed re-rolls body + item poses (R6 P2-7) -->
  {:else if mine}
    <span class="foot-note">You can keep working.</span>
    <button class="btn" onclick={() => (ui.sheet = null)}>Hide</button>
  {:else if ok}
    <span class="foot-note">{est ? `About ${est.minutes} min · body ${Math.ceil(est.body)}${est.items ? ` + items ${est.items}` : ''} gens` : ''}</span>
    <span class="api-action"><ApiPeek scope="move-add" label="Add move" plan={movePlan(rec, { id, action: text.trim() ? undefined : action, text: text.trim() || undefined, frames: 8, items: chosen, sharedItems: sharedChosen })} /><button class="btn primary lg" disabled={!id || have.has(id) || !!moving.spec || (!!settingUp.spec && !settingUp.done)} onclick={go}>Add {id ? nice(id) : 'move'} <span class="cost">{est ? Math.ceil(est.gens) : '–'} gens</span></button></span>
  {/if}
{/snippet}

<Sheet title="Add a move" cancel={mine && !moving.done ? 'Hide' : 'Cancel'} onclose={() => (ui.sheet = null)} footer={isDemo() || (!ok && !mine) ? undefined : foot}>
  {#if mine}
    <div class="form">
      <div class="api-action"><p style="font-weight:600">{nice(moving.spec!.id)}</p><ApiPeek scope="move-progress" label="Current move generation" plan={moving.spec ? movePlan(rec, moving.spec) : []} activityScope={moving.spec?.activityScope} /></div>
      <ol class="steps-list">
        {#each MOVE_STEPS as s, i (s.id)}
          {@const done = moving.done || i < stepIx}
          <li class:done class:now={!moving.done && i === stepIx}>
            {#if done}<Check size={16} />{:else if i === stepIx && !moving.error}<span class="ring spin" aria-hidden="true"></span>{:else}<span class="dot" aria-hidden="true"></span>{/if}
            {s.label}{#if !moving.done && i === stepIx && moving.progress && moving.progress.total > 1}<span class="muted num small">&nbsp;{moving.progress.done}/{moving.progress.total}</span>{/if}
          </li>
        {/each}
      </ol>
      {#if moving.error}<p class="notice bad small"><CircleAlert size={14} />{moving.error}</p>{/if}
      {#if moving.done && moving.fitIds.length}<p class="notice small"><Check size={14} /><span>The body move is ready. {moving.fitIds.length} shared equipment {moving.fitIds.length === 1 ? 'copy needs' : 'copies need'} a separately priced animation review.</span><button class="btn sm" onclick={() => (ui.sheet = 'activity')}>Review equipment fits</button></p>{/if}
      {#each moving.warnings as warning (warning)}<p class="notice warn small"><CircleAlert size={14} />{bodyQualityNote(warning)}</p>{/each}
    </div>
  {:else if isDemo() || !ok}
    <p class="notice small"><CircleAlert size={14} />{isDemo() ? 'Moves are added to your own character.' : 'Set up this character’s pose rig to add moves. Your existing artwork and layers stay aligned.'}</p>
    {#if !isDemo()}<button class="btn primary" onclick={() => (ui.sheet = 'setup')}>Set up character</button>{/if}
  {:else}
    <div class="form">
      <div class="field">
        <span class="label" id="act">Move</span>
        <div class="chips" role="radiogroup" aria-labelledby="act">
          {#each options as a (a)}
            <button class="chip" role="radio" aria-checked={!text.trim() && action === a} disabled={have.has(a)} onclick={() => { action = a; text = '' }}>{#if have.has(a)}<Check size={12} />{/if}{nice(a)}{have.has(a) ? ' · added' : ''}</button>
          {/each}
        </div>
      </div>
      <label class="field">
        <span class="label">Or describe it <span class="faint">(optional)</span></span>
        <input class="input" bind:value={text} placeholder="e.g. jumping in place" maxlength="120" />
      </label>
      {#if items.length}
        <div class="field">
          <span class="label">Animate these items too</span>
          {#each items as it (it.id)}
            <label class="check"><input type="checkbox" checked={!skip.includes(it.id)} onchange={(e) => (skip = e.currentTarget.checked ? skip.filter((x) => x !== it.id) : [...skip, it.id])} />{it.name}
              <span class="faint small">{poseGens(1, est?.frames ?? 8, dirs)} gens</span></label>
          {/each}
          <p class="faint small">Items you leave out stay hidden in this move until they are made again.</p>
        </div>
      {/if}
      {#if sharedItems.length}
        <div class="field">
          <span class="label">Prepare shared equipment reviews</span>
          {#each sharedItems as it (it.id)}<label class="check"><input type="checkbox" checked={!skip.includes(it.id)} onchange={(e) => (skip = e.currentTarget.checked ? skip.filter((x) => x !== it.id) : [...skip, it.id])} />{it.name}<span class="faint small">No charge now</span></label>{/each}
          <p class="faint small">After the body move is ready, review each fitted copy in Activity. Its animation price is shown before you start. Existing item frames stay unchanged until you keep the reviewed result.</p>
        </div>
      {/if}
      <details class="disclosure">
        <summary><ChevronRight size={14} />Details</summary>
        <div>
          <p class="faint small">{text.trim() ? 'pixminimax motion (unarmed, no props, no effects) → joints → raw skeleton-v3 on the rest view' : action === 'walk' ? 'walking skeleton-v3 motion → joints → raw skeleton-v3 on the rest view' : 'keypoints authored from the rest pose → raw skeleton-v3'} · {est?.frames} frames × {dirs} directions{m?.rig.directions.some((d) => d.mirrorOf) ? ' (west mirrored)' : ''} · body ≈ {est?.body.toFixed(1)} gens, items {est?.items} gens · body review notes do not trigger redraws.</p>
        </div>
      </details>
    </div>
  {/if}
</Sheet>
