<script lang="ts">
  // Add a move: an authored action (raw skeleton-v3 keypoints from the rest pose, S3) or a described one (pixminimax motion,
  // re-rendered through raw skeleton-v3), plus one pose call per worn item x direction so the items follow the new clip.
  import Sheet from './Sheet.svelte'
  import { untrack } from 'svelte'
  import { default as ApiPeek } from './ApiPeek.svelte'
  import { movePlan } from './apiPlans.ts'
  import { formDrafts } from './formDrafts.ts'
  import * as db from '../lib/store/db.ts'
  import type { StoredProject } from '../lib/store/project.ts'
  import type { DirectionName } from '../lib/store/manifest.ts'
  import { queue } from '../lib/pixellab/queue.ts'
  import { posable, poseGens } from '../lib/items/run.ts'
  import { AUTHORED } from '../lib/rig/poses.ts'
  import { DEFAULT_MOVE } from '../lib/rig/rig.ts'
  import { MOVE_STEPS, isV13, bodyPaletteRepairPlan, measurementRecoveryPlan, moveEstimate } from './create.ts'
  import { ui, doc, store, isDemo, moving, settingUp, startMove, queueMoves, matchMoveBodyColors, retryMoveMeasurements, dismissMove, openProject, withKey } from './state.svelte.ts'
  import { bodyQualityNote } from './model.ts'
  import { Check, ChevronRight, CircleAlert } from './icons.ts'

  const m = $derived(store.project?.manifest)
  let rec = $state.raw<StoredProject | null>(null)
  $effect(() => { if (!isDemo()) void db.get<StoredProject>('projects', doc.id).then((r) => (rec = r ?? null)) })
  const ok = $derived(!!m && isV13(rec ? { ...rec, manifest: m } : null))
  const have = $derived(new Set(m?.rig.animations.map((a) => a.id) ?? []))
  // Default is the standing views themselves: nothing to generate or replace.
  const options = $derived([...new Set(['idle', 'walk', ...AUTHORED, ...(m?.rig.animations.map((a) => a.id) ?? [])])].filter((a) => a !== DEFAULT_MOVE))
  const draft = formDrafts.move?.projectId === doc.id ? formDrafts.move : undefined
  let action = $state(draft?.action ?? untrack(() => options.find((a) => !have.has(a))) ?? '')
  let text = $state(draft?.text ?? '')
  const slug = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 24)
  const id = $derived(text.trim() ? slug(text.split(/[,.]/)[0].split(/\s+/).slice(0, 2).join(' ')) : action)
  const items = $derived(m ? posable(m).filter((item) => !item.design) : [])
  const sharedItems = $derived(m?.items.filter((item) => item.design && item.status === 'accepted') ?? [])
  const replacing = $derived(have.has(id))
  const availableDirs = $derived(m?.rig.directions.filter((d) => !d.mirrorOf).map((d) => d.id) ?? [])
  let selectedDirs = $state<DirectionName[]>(draft?.dirs ?? untrack(() => [...availableDirs]))
  const targetDirs = $derived(replacing ? availableDirs.filter((d) => selectedDirs.includes(d)) : availableDirs)
  const frames = $derived(m?.rig.animations.find((a) => a.id === id)?.cells ?? 8)
  let skip = $state<string[]>(draft?.skip ?? [])
  const chosen = $derived(items.filter((i) => !skip.includes(i.id)).map((i) => i.id))
  const sharedChosen = $derived(sharedItems.filter((i) => !skip.includes(i.id)).map((i) => i.id))
  const est = $derived(m && id && targetDirs.length ? moveEstimate(m, { action: text.trim() ? undefined : action, frames, items: chosen, dirs: targetDirs, replace: replacing }) : null)
  const dirs = $derived(targetDirs.length)
  const mine = $derived(!!moving.spec && moving.projectId === doc.id)
  // another character's failed move holds every new move; only its own sheet can try it again or start over
  const holder = $derived(!mine && moving.spec && moving.error ? store.projects.find((p) => p.id === moving.projectId)?.name ?? 'that character' : '')
  const stepIx = $derived(MOVE_STEPS.findIndex((s) => s.id === moving.progress?.step))
  const nice = (s: string) => s[0].toUpperCase() + s.slice(1).replace(/-/g, ' ')
  let recovery = $state<Awaited<ReturnType<typeof measurementRecoveryPlan>> | null>(null)
  let recoveryError = $state('')
  let colorRepair = $state<Awaited<ReturnType<typeof bodyPaletteRepairPlan>> | null>(null)
  const recoveryItemGens = $derived(recovery && m && moving.spec ? moveEstimate(m, moving.spec).items : 0)
  const ledgerStates = $derived($queue.jobs.map((r) => `${r.id}:${r.state}`).join('|'))
  $effect(() => {
    void ledgerStates // Re-check finished siblings without decoding PNGs on every progress poll.
    const projectId = moving.projectId, spec = moving.spec && $state.snapshot(moving.spec), error = moving.error
    let current = true
    recovery = null; colorRepair = null; recoveryError = ''
    if (mine && error && spec && !moving.done && spec.itemMethod !== 'grid') {
      void measurementRecoveryPlan(projectId, { ...spec, measurementRecovery: undefined }).then((plan) => { if (current && plan.checks > 0 && plan.recordIds.length > 0) recovery = plan }).catch(() => {})
      if (!spec.bodyPaletteRepair) void bodyPaletteRepairPlan(projectId, { ...spec, measurementRecovery: undefined }).then((plan) => { if (current && plan.changedPixels > 0 && plan.changedFrames > 0 && plan.directions.length) colorRepair = plan }).catch(() => {})
    }
    return () => { current = false }
  })
  function retryChecks() {
    if (!moving.spec || !recovery) return
    const projectId = moving.projectId, spec = $state.snapshot(moving.spec), reviewed = $state.snapshot(recovery)
    withKey(() => {
      ui.sheet = 'move'
      void retryMoveMeasurements(projectId, spec, reviewed).catch((e) => { recoveryError = e instanceof Error ? e.message : String(e) })
    })
  }

  function matchColors() {
    if (!moving.spec || !colorRepair) return
    const projectId = moving.projectId, spec = $state.snapshot(moving.spec), reviewed = $state.snapshot(colorRepair)
    withKey(() => {
      ui.sheet = 'move'
      void matchMoveBodyColors(projectId, spec, reviewed).catch((e) => { recoveryError = e instanceof Error ? e.message : String(e) })
    })
  }


  function go() {
    const projectId = doc.id
    const spec = { id, action: text.trim() ? undefined : action, text: text.trim() || undefined, frames, items: chosen, sharedItems: sharedChosen, poseStyle: 'visible-side-v1' as const, seed: 1 + Math.floor(Math.random() * 1_000_000), ...(replacing ? { replace: true, dirs: [...targetDirs] } : {}) }
    formDrafts.move = { projectId, action, text, skip: $state.snapshot(skip), dirs: [...selectedDirs], poseStyle: 'visible-side-v1' }
    withKey(() => { formDrafts.move = undefined; void queueMoves(projectId, [spec]); ui.sheet = 'move' }, true)
  }
  function chooseAction(next: string) {
    action = next; text = ''
    const clips = (rec?.rigQa as { clips?: Record<string, { fails?: unknown[] }> } | undefined)?.clips
    const flagged = availableDirs.filter((d) => clips?.[`${next}/${d}`]?.fails?.length)
    selectedDirs = flagged.length ? flagged : [...availableDirs]
  }
</script>

{#snippet foot()}
  {#if mine && moving.done}
    <button class="bu-action btn primary" data-variant="primary" onclick={() => { void dismissMove(); ui.sheet = null }}>Done</button>
  {:else if mine && moving.error}
    <button class="bu-action btn plain" data-variant="quiet" onclick={dismissMove}>Start over</button>
    <span class="api-action"><ApiPeek scope="move-retry" label="Generate move again" plan={moving.spec ? movePlan(rec, { ...moving.spec, measurementRecovery: undefined, bodyPaletteRepair: undefined, seed: undefined }) : []} /><button class="bu-action btn" data-variant="outline" onclick={() => moving.spec && withKey(() => { void startMove(moving.projectId, { ...$state.snapshot(moving.spec!), measurementRecovery: undefined, bodyPaletteRepair: undefined, seed: 1 + Math.floor(Math.random() * 1_000_000) }); ui.sheet = 'move' }, true)}>{recovery || colorRepair ? 'Generate new frames' : 'Try again'}</button></span>
    {#if recovery}<button class="bu-action btn primary" data-variant="primary" onclick={retryChecks}>Retry joint checks</button>{/if}
    {#if colorRepair}<button class="bu-action btn primary" data-variant="primary" onclick={matchColors}>Match body colors</button>{/if}<!-- new seed re-rolls body + item poses (R6 P2-7) -->
  {:else if mine}
    <span class="foot-note">You can keep working.</span>
    <button class="bu-action btn" data-variant="outline" onclick={() => (ui.sheet = null)}>Hide</button>
  {:else if ok}
    <span class="foot-note">{est ? `About ${est.minutes} min · body ${Math.ceil(est.body)}${est.items ? ` + items ${est.items}` : ''} gens` : ''}</span>
    <span class="api-action"><ApiPeek scope="move-add" label="Add or replace move" plan={movePlan(rec, { id, action: text.trim() ? undefined : action, text: text.trim() || undefined, frames, items: chosen, sharedItems: sharedChosen, poseStyle: 'visible-side-v1', ...(replacing ? { replace: true, dirs: [...targetDirs] } : {}) })} /><button class="bu-action btn primary lg" data-variant="primary" disabled={!id || !targetDirs.length || !!moving.spec || (!!settingUp.spec && !settingUp.done)} onclick={go}>{replacing ? 'Replace' : 'Add'} {id ? nice(id) : 'move'}{replacing ? ' views' : ''} <span class="cost">Est. {est ? Math.ceil(est.gens) : '–'} gens</span></button></span>
  {/if}
{/snippet}

<Sheet title={mine && moving.spec?.itemMethod === 'grid' ? 'Repair item frames' : (mine ? moving.spec?.replace : replacing) ? 'Replace move views' : 'Add a move'} cancel={mine && !moving.done ? 'Hide' : 'Cancel'} onclose={() => (ui.sheet = null)} footer={isDemo() || (!ok && !mine) ? undefined : foot}>
  {#if holder}<p class="notice small"><CircleAlert size={14} /><span>{nice(moving.spec!.id)} failed on {holder}, so new moves wait. Open it to try again or start over.</span><button class="bu-action btn sm" data-variant="outline" onclick={() => void openProject(moving.projectId)}>Open {holder}</button></p>{/if}
  {#if mine}
    <div class="form">
      <p style="font-weight:600">{nice(moving.spec!.id)}{moving.spec?.dirs ? ` · ${moving.spec.dirs.map(nice).join(', ')}` : ''}<ApiPeek scope="move-progress" label="Current move generation" plan={moving.spec ? movePlan(rec, moving.spec) : []} activityScope={moving.spec?.activityScope} /></p>
      {#if moving.spec?.itemMethod === 'grid'}<p class="muted small">Only the selected item frames are redrawn; the body stays fixed. Results that fail hard checks keep the previous item frames.</p>{/if}
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
      {@const ownQueued = moving.queued.filter((q) => q.projectId === moving.projectId)}
      {#if ownQueued.length}<p class="muted small">Queued next: {ownQueued.map((q) => nice(q.spec.id)).join(', ')}{moving.error ? '. Try again continues with them; Start over drops them.' : ''}</p>{/if}
      {#if recovery}
        <p class="notice warn small">Reuse the completed body frames and joint results. Retry {recovery.checks} unfinished joint {recovery.checks === 1 ? 'check' : 'checks'} · estimated {recovery.gens.toFixed(1)} gens or ${recovery.usd.toFixed(3)}. Unknown checks may already have charged; retrying can charge again. PixelLab billing and queue time vary.{#if recoveryItemGens} Selected equipment poses follow after the body passes · estimated {Math.ceil(recoveryItemGens)} additional gens, with retries and dollar billing possible.{/if}</p>
      {/if}
      {#if colorRepair}
        <p class="notice warn small">Match {colorRepair.changedPixels} nearby color {colorRepair.changedPixels === 1 ? 'pixel' : 'pixels'} to the standing palette across {colorRepair.changedFrames} cached {colorRepair.directions.map(nice).join(', ')} {colorRepair.changedFrames === 1 ? 'frame' : 'frames'}. The body shape stays fixed; other colors are left alone. Recheck {colorRepair.checks} changed frames · estimated {colorRepair.gens.toFixed(1)} gens or ${colorRepair.usd.toFixed(3)}.{#if colorRepair.itemGens} Selected equipment poses follow after the body passes · estimated {Math.ceil(colorRepair.itemGens)} additional gens.{/if} PixelLab may bill dollars; quality retries cost extra and queue time varies. Existing body views are kept if a check still fails.</p>
      {/if}
      {#if recoveryError}<p class="notice bad small"><CircleAlert size={14} />{recoveryError}</p>{/if}
      {#if moving.done && moving.fitIds.length}<p class="notice small"><Check size={14} /><span>The body move is ready. {moving.fitIds.length} shared equipment {moving.fitIds.length === 1 ? 'copy needs' : 'copies need'} a separately priced animation review.</span><button class="bu-action btn sm" data-variant="outline" onclick={() => (ui.sheet = 'activity')}>Review equipment fits</button></p>{/if}
      {#each moving.warnings as warning (warning)}<p class="notice warn small"><CircleAlert size={14} />{bodyQualityNote(warning)}</p>{/each}
    </div>
  {:else if isDemo() || !ok}
    <p class="notice small"><CircleAlert size={14} />{isDemo() ? 'Moves are added to your own character.' : 'Set up this character’s pose rig to add moves. Your existing artwork and layers stay aligned.'}</p>
    {#if !isDemo()}<button class="bu-action btn primary" data-variant="primary" onclick={() => (ui.sheet = 'setup')}>Set up character</button>{/if}
  {:else}
    <div class="form">
      <div class="field">
        <span class="label" id="act">Move</span>
        <div class="chips" role="radiogroup" aria-labelledby="act">
          {#each options as a (a)}
            <button class="chip" role="radio" aria-checked={!text.trim() && action === a} tabindex={(text.trim() ? options[0] === a : action === a) ? 0 : -1} onclick={() => chooseAction(a)}>{#if have.has(a)}<Check size={12} />{/if}{nice(a)}{have.has(a) ? ' · added' : ''}</button>
          {/each}
        </div>
      </div>
      {#if replacing}
        <div class="field">
          <span class="label">Views to replace</span>
          {#each availableDirs as dir (dir)}<label class="check"><input type="checkbox" checked={selectedDirs.includes(dir)} onchange={(e) => (selectedDirs = e.currentTarget.checked ? [...selectedDirs, dir] : selectedDirs.filter((d) => d !== dir))} />{nice(dir)}</label>{/each}
          <p class="notice warn small">Only selected body views are replaced. Equipment checked below is re-posed for those views; other equipment stays hidden there until remade. Other views and moves stay fixed.{#if m?.rig.directions.some((d) => d.mirrorOf)} Mirrored views follow their source.{/if}</p>
        </div>
      {:else}<p class="faint small">Choose an existing move to replace selected views.</p>{/if}
      <label class="field">
        <span class="label">Or describe it <span class="faint">(optional)</span></span>
        <input class="bu-input input" bind:value={text} placeholder="e.g. jumping in place" maxlength="120" />
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
      <p class="faint small">PixelLab may bill some calls in dollars. Retries and fallbacks cost extra; queue time varies.</p>
      <details class="disclosure">
        <summary><ChevronRight size={14} />Details</summary>
        <div>
          <p class="faint small">{text.trim() ? 'pixminimax motion (unarmed, no props, no effects) → joints → raw skeleton-v3 on the rest view' : action === 'walk' ? 'walking skeleton-v3 motion → joints → raw skeleton-v3 on the rest view' : 'keypoints authored from the rest pose → raw skeleton-v3'} · {est?.frames} frames × {dirs} directions{m?.rig.directions.some((d) => d.mirrorOf) ? ` (${m.rig.directions.filter((d) => d.mirrorOf).map((d) => d.id.replaceAll('-', ' ')).join(', ')} mirrored)` : ''} · body ≈ {est?.body.toFixed(1)} gens, items {est?.items} gens · body review notes do not trigger redraws.</p>
        </div>
      </details>
    </div>
  {/if}
</Sheet>
