<script lang="ts">
  // Add a move: an authored action (raw skeleton-v3 keypoints from the rest pose, S3) or a described one (pixminimax motion,
  // re-rendered through raw skeleton-v3), plus one pose call per worn item x direction so the items follow the new clip.
  import Sheet from './Sheet.svelte'
  import { untrack } from 'svelte'
  import { formDrafts } from './formDrafts.ts'
  import * as db from '../lib/store/db.ts'
  import type { StoredProject } from '../lib/store/project.ts'
  import type { DirectionName } from '../lib/store/manifest.ts'
  import { queue } from '../lib/pixellab/queue.ts'
  import { posable, poseGens } from '../lib/items/run.ts'
  import { AUTHORED } from '../lib/rig/poses.ts'
  import { MOVE_STEPS, isV13, measurementRecoveryPlan, moveEstimate } from './create.ts'
  import { ui, doc, store, isDemo, moving, settingUp, startMove, retryMoveMeasurements, dismissMove, withKey } from './state.svelte.ts'
  import { Check, ChevronRight, CircleAlert } from './icons.ts'

  const m = $derived(store.project?.manifest)
  let rec = $state.raw<StoredProject | null>(null)
  $effect(() => { if (!isDemo()) void db.get<StoredProject>('projects', doc.id).then((r) => (rec = r ?? null)) })
  const ok = $derived(!!m && isV13(rec ? { ...rec, manifest: m } : null))
  const have = $derived(new Set(m?.rig.animations.map((a) => a.id) ?? []))
  const options = $derived([...new Set(['idle', 'walk', ...AUTHORED, ...(m?.rig.animations.map((a) => a.id) ?? [])])])
  const draft = formDrafts.move?.projectId === doc.id ? formDrafts.move : undefined
  let action = $state(draft?.action ?? untrack(() => options.find((a) => !have.has(a))) ?? '')
  let text = $state(draft?.text ?? '')
  const slug = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 24)
  const id = $derived(text.trim() ? slug(text.split(/[,.]/)[0].split(/\s+/).slice(0, 2).join(' ')) : action)
  const items = $derived(m ? posable(m) : [])
  const replacing = $derived(have.has(id))
  const availableDirs = $derived(m?.rig.directions.filter((d) => !d.mirrorOf).map((d) => d.id) ?? [])
  let selectedDirs = $state<DirectionName[]>(draft?.dirs ?? untrack(() => [...availableDirs]))
  const targetDirs = $derived(replacing ? availableDirs.filter((d) => selectedDirs.includes(d)) : availableDirs)
  const frames = $derived(m?.rig.animations.find((a) => a.id === id)?.cells ?? 8)
  let skip = $state<string[]>(draft?.skip ?? [])
  const chosen = $derived(items.filter((i) => !skip.includes(i.id)).map((i) => i.id))
  const est = $derived(m && id && targetDirs.length ? moveEstimate(m, { action: text.trim() ? undefined : action, frames, items: chosen, dirs: targetDirs, replace: replacing }) : null)
  const dirs = $derived(targetDirs.length)
  const mine = $derived(!!moving.spec && moving.projectId === doc.id)
  const stepIx = $derived(MOVE_STEPS.findIndex((s) => s.id === moving.progress?.step))
  const nice = (s: string) => s[0].toUpperCase() + s.slice(1).replace(/-/g, ' ')
  let recovery = $state<Awaited<ReturnType<typeof measurementRecoveryPlan>> | null>(null)
  let recoveryError = $state('')
  const ledgerStates = $derived($queue.jobs.map((r) => `${r.id}:${r.state}`).join('|'))
  $effect(() => {
    void ledgerStates // Re-check finished siblings without decoding PNGs on every progress poll.
    const projectId = moving.projectId, spec = moving.spec && $state.snapshot(moving.spec), error = moving.error
    let current = true
    recovery = null; recoveryError = ''
    if (mine && error && spec && !moving.done && spec.itemMethod !== 'grid') {
      void measurementRecoveryPlan(projectId, { ...spec, measurementRecovery: undefined }).then((plan) => { if (current && plan.checks > 0 && plan.recordIds.length > 0) recovery = plan }).catch(() => {})
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


  function go() {
    const projectId = doc.id
    const spec = { id, action: text.trim() ? undefined : action, text: text.trim() || undefined, frames, items: chosen, poseStyle: 'visible-side-v1' as const, seed: 1 + Math.floor(Math.random() * 1_000_000), ...(replacing ? { replace: true, dirs: [...targetDirs] } : {}) }
    formDrafts.move = { projectId, action, text, skip: $state.snapshot(skip), dirs: [...selectedDirs], poseStyle: 'visible-side-v1' }
    withKey(() => { formDrafts.move = undefined; void startMove(projectId, spec); ui.sheet = 'move' })
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
    <button class="btn primary" onclick={() => { void dismissMove(); ui.sheet = null }}>Done</button>
  {:else if mine && moving.error}
    <button class="btn plain" onclick={dismissMove}>Start over</button>
    <button class="btn" onclick={() => moving.spec && withKey(() => { void startMove(moving.projectId, { ...$state.snapshot(moving.spec!), measurementRecovery: undefined, seed: 1 + Math.floor(Math.random() * 1_000_000) }); ui.sheet = 'move' })}>{recovery ? 'Generate new frames' : 'Try again'}</button>
    {#if recovery}<button class="btn primary" onclick={retryChecks}>Retry joint checks</button>{/if}<!-- new seed re-rolls body + item poses (R6 P2-7) -->
  {:else if mine}
    <span class="foot-note">You can keep working.</span>
    <button class="btn" onclick={() => (ui.sheet = null)}>Hide</button>
  {:else if ok}
    <span class="foot-note">{est ? `About ${est.minutes} min · body ${Math.ceil(est.body)}${est.items ? ` + items ${est.items}` : ''} gens` : ''}</span>
    <button class="btn primary lg" disabled={!id || !targetDirs.length || !!moving.spec || (!!settingUp.spec && !settingUp.done)} onclick={go}>{replacing ? 'Replace' : 'Add'} {id ? nice(id) : 'move'}{replacing ? ' views' : ''} <span class="cost">Est. {est ? Math.ceil(est.gens) : '–'} gens</span></button>
  {/if}
{/snippet}

<Sheet title={mine && moving.spec?.itemMethod === 'grid' ? 'Repair item frames' : (mine ? moving.spec?.replace : replacing) ? 'Replace move views' : 'Add a move'} cancel={mine && !moving.done ? 'Hide' : 'Cancel'} onclose={() => (ui.sheet = null)} footer={isDemo() || (!ok && !mine) ? undefined : foot}>
  {#if mine}
    <div class="form">
      <p style="font-weight:600">{nice(moving.spec!.id)}{moving.spec?.dirs ? ` · ${moving.spec.dirs.map(nice).join(', ')}` : ''}</p>
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
      {#if recovery}
        <p class="notice warn small">Reuse the completed body frames and joint results. Retry {recovery.checks} unfinished joint checks · estimated {recovery.gens.toFixed(1)} gens or ${recovery.usd.toFixed(3)}. Unknown checks may already have charged; retrying can charge again. PixelLab billing and queue time vary.</p>
      {/if}
      {#if recoveryError}<p class="notice bad small"><CircleAlert size={14} />{recoveryError}</p>{/if}
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
            <button class="chip" role="radio" aria-checked={!text.trim() && action === a} tabindex={(text.trim() ? options[0] === a : action === a) ? 0 : -1} onclick={() => chooseAction(a)}>{#if have.has(a)}<Check size={12} />{/if}{nice(a)}{have.has(a) ? ' · added' : ''}</button>
          {/each}
        </div>
      </div>
      {#if replacing}
        <div class="field">
          <span class="label">Views to replace</span>
          {#each availableDirs as dir (dir)}<label class="check"><input type="checkbox" checked={selectedDirs.includes(dir)} onchange={(e) => (selectedDirs = e.currentTarget.checked ? [...selectedDirs, dir] : selectedDirs.filter((d) => d !== dir))} />{nice(dir)}</label>{/each}
          <p class="notice warn small">Only selected body views are replaced. Equipment ticked below is re-posed for those views; other equipment stays hidden there until remade. Other views and moves stay fixed.{#if m?.rig.directions.some((d) => d.mirrorOf)} Mirrored views follow their source.{/if}</p>
        </div>
      {:else}<p class="faint small">Choose an existing move to replace selected views.</p>{/if}
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
      <p class="faint small">PixelLab may bill some calls in dollars. Retries and fallbacks cost extra; queue time varies.</p>
      <details class="disclosure">
        <summary><ChevronRight size={14} />Details</summary>
        <div>
          <p class="faint small">{text.trim() ? 'pixminimax motion (unarmed, no props, no effects) → joints → raw skeleton-v3 on the rest view' : action === 'walk' ? 'walking skeleton-v3 motion → joints → raw skeleton-v3 on the rest view' : 'keypoints authored from the rest pose → raw skeleton-v3'} · {est?.frames} frames × {dirs} directions{m?.rig.directions.some((d) => d.mirrorOf) ? ' (west mirrored)' : ''} · body ≈ {est?.body.toFixed(1)} gens, items {est?.items} gens · failed checks re-roll once.</p>
        </div>
      </details>
    </div>
  {/if}
</Sheet>
