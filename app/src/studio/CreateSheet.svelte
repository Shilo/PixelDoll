<script lang="ts">
  import Sheet from './Sheet.svelte'
  import { default as ApiPeek } from './ApiPeek.svelte'
  import { createPlan } from './apiPlans.ts'
  import { formDrafts } from './formDrafts.ts'
  import Sprite from './Sprite.svelte'
  import { composeCell } from '../lib/compose/compose.ts'
  import { loadProject } from '../lib/store/project.ts'
  import type { Project } from '../lib/store/manifest.ts'
  import type { ClipQa } from '../lib/rig/clips.ts'
  import { STEPS, estimate, type CreateSpec } from './create.ts'
  import CharacterForm from './CharacterForm.svelte'
  import { autoFrame, draftErrors, facingOf, freshSeed, newCharacterDraft } from './characterConfig.ts'
  import { nameFrom } from './model.ts'
  import { ui, creating, startCreate, cancelCreate, openProject, withKey } from './state.svelte.ts'
  import { Check, CircleAlert, TriangleAlert } from './icons.ts'
  let d = $state(formDrafts.character ?? newCharacterDraft())
  let enhancing = $state(false)
  const frameSize = $derived(d.auto && Number.isFinite(d.body) ? autoFrame(d.body!) : d.frame)
  const errors = $derived(draftErrors(d))
  const formSpec = $derived<CreateSpec>({ description: d.prompt, name: d.name.trim() || (d.details ? nameFrom(d.details) : d.kind !== 'Not set' ? d.kind : 'My character'), seed: d.seed ? Number(d.seed) : 0, size: d.body || 0, frame: frameSize, view: d.view, directions: facingOf(d), exactPrompt: true })
  const est = $derived(estimate(creating.spec ?? formSpec))
  const lo = $derived(Math.round(est.gens)), hi = $derived(Math.ceil((est.gens * 1.3) / 5) * 5)
  $effect(() => { if (!creating.spec) formDrafts.character = $state.snapshot(d) })
  function connectEnhance(target: 'details' | 'prompt') {
    const draft = $state.snapshot(d)
    delete draft.enhanceOnConnect
    formDrafts.character = draft
    withKey(() => { formDrafts.character = { ...draft, enhanceOnConnect: target }; ui.sheet = 'create' }, false)
  }
  const running = $derived(!!creating.spec && !creating.projectId && !creating.error)
  const stepIx = $derived(STEPS.findIndex((s) => s.id === creating.progress?.step))
  let result = $state.raw<Project | null>(null)
  let failedNotes = $state<string[]>([])
  const qualityNotes = $derived([...new Set([...failedNotes, ...creating.warnings])])
  $effect(() => {
    const id = creating.projectId
    let active = true
    result = null; failedNotes = []
    if (id) void loadProject(id).then(({ rec, project }) => {
      if (!active) return
      result = project
      const qa = rec.rigQa as { clips?: Record<string, ClipQa> } | undefined
      failedNotes = Object.entries(qa?.clips ?? {}).flatMap(([clip, qa]) => qa.fails.map(f => `${clip}: ${f}`))
    })
    return () => { active = false }
  })
  let frame = $state(0)
  $effect(() => { const t = setInterval(() => frame++, 110); return () => clearInterval(t) })
  const k = $derived(Math.max(1, Math.floor(ui.dpr * (ui.size === 'compact' ? 1.25 : 2))))

  function go() {
    if (errors.length || enhancing) return
    formDrafts.character = $state.snapshot(d)
    const spec = { ...$state.snapshot(formSpec), seed: d.seed ? Number(d.seed) : freshSeed() }
    withKey(() => { formDrafts.character = undefined; void startCreate(spec); ui.sheet = 'create' }, true)
  }
  async function open() {
    const id = creating.projectId
    await cancelCreate()
    ui.sheet = null
    ui.welcome = false
    await openProject(id)
  }
  const plain = (w: string) => w.replace(/^([^/]+)\/([^:]+): /, (_, clip: string, direction: string) => `${clip[0].toUpperCase() + clip.slice(1)} ${direction}: `).replace(/feet drift (\d+) px from pivot y \d+/, 'footprint differs up to $1 px from the shared ground line').replace(/feet drift (\d+) px.*/, 'feet move up to $1 px').replace(/headroom (\d+) px.*/, 'little room above the head ($1 px): tall hats may be cut off')
</script>

<Sheet title="New character" cancel={running ? 'Hide' : creating.projectId ? 'Close' : 'Cancel'} onclose={() => (ui.sheet = null)} className="character-sheet" wide>
  {#snippet heading()}{#if !creating.spec}<input class="input character-name" aria-label="Name" title="Library and export name; not part of the prompt" bind:value={d.name} placeholder="Name" maxlength="80" />{/if}{/snippet}
  {#if creating.projectId}
    <div class="create-review">
      <ApiPeek scope="character-create-result" label="Completed character generation" plan={creating.spec ? createPlan(creating.spec) : []} activityScope={creating.spec?.activityScope} />
      <h3 style="font-size:var(--fs-title)">{creating.spec?.name} is ready</h3>
      {#if result}
        {@const a = result.manifest.rig.animations.find((x) => x.id === 'walk') ?? result.manifest.rig.animations[0]}
        <div class="review-grid">
          {#each result.manifest.rig.directions as d (d.id)}
            <figure><Sprite img={composeCell(result, {}, a.id, d.id, a.frames[frame % a.frames.length].cell)} w={result.manifest.rig.cell.w} h={result.manifest.rig.cell.h} {k} checker label="{creating.spec?.name} walking {d.id}" />{d.id[0].toUpperCase() + d.id.slice(1)}</figure>
          {/each}
        </div>
      {/if}
      {#if qualityNotes.length}
        <details class="quality-notes small" open={failedNotes.length > 0}>
          <summary>{qualityNotes.length} quality {qualityNotes.length === 1 ? 'note' : 'notes'}</summary>
          <ul class="reasons">{#each qualityNotes as w (w)}<li><TriangleAlert size={12} />{plain(w)}</li>{/each}</ul>
        </details>
      {/if}
    </div>
  {:else if running || creating.error}
    <div class="form">
      <div class="api-action"><p style="font-weight:600">{creating.spec?.name}</p><ApiPeek scope="character-create-progress" label="Current character generation" plan={creating.spec ? createPlan(creating.spec) : []} activityScope={creating.spec?.activityScope} /></div>
      <ol class="steps-list">
        {#each STEPS as s, i (s.id)}
          <li class:done={i < stepIx} class:now={i === stepIx}>
            {#if i < stepIx}<Check size={16} />{:else if i === stepIx && !creating.error}<span class="ring spin" aria-hidden="true"></span>{:else}<span class="dot" aria-hidden="true"></span>{/if}
            {s.label}{#if i === stepIx && creating.progress && creating.progress.total > 1}<span class="muted num small">&nbsp;{creating.progress.done}/{creating.progress.total}</span>{/if}
          </li>
        {/each}
      </ol>
      {#if creating.error}
        <p class="notice bad small"><CircleAlert size={14} />{creating.error.includes('5000') || /policy/i.test(creating.error) ? 'PixelLab declined this description. Try different words.' : creating.error}</p>
      {:else}
        <p class="muted small">This takes about {est.minutes} minutes. You can close this sheet, keep dressing up the demo or even close the tab: it picks up where it left off.</p>
      {/if}
    </div>
  {:else}
    <CharacterForm bind:draft={d} bind:busy={enhancing} onconnect={connectEnhance} />
  {/if}

  {#snippet footer()}
    {#if creating.projectId}
      <span class="foot-note">Saved on this device.</span>
      <button class="btn primary lg" onclick={open}>Start dressing up</button>
    {:else if creating.error}
      <button class="btn plain" onclick={cancelCreate}>Start over</button>
      <span class="api-action"><ApiPeek scope="character-create-retry" label="Create character again" plan={creating.spec ? createPlan(creating.spec, true) : []} /><button class="btn primary" onclick={() => creating.spec && withKey(() => void startCreate({ ...$state.snapshot(creating.spec!), seed: 1 + Math.floor(Math.random() * 1_000_000) }), true)}>Try again</button></span><!-- new seed: the same one re-reads the cached (bad) results (R6 P2-7) -->
    {:else if running}
      <span class="foot-note">Spending {lo}–{hi} gens</span>
      <button class="btn" onclick={() => (ui.sheet = null)}>Keep working</button>
    {:else}
      <span class="foot-note creator-cost" title="Includes idle and walk; extra attempts may cost more">~{lo}–{hi} gens</span>
      <span class="api-action"><ApiPeek scope="character-create" label="Create character" plan={createPlan(formSpec, !d.seed)} /><button class="btn primary lg" disabled={!!errors.length || enhancing} onclick={go}>Create character</button></span>
    {/if}
  {/snippet}
</Sheet>

<style>
  .quality-notes { width:100%; text-align:left; color:var(--text-2); }
  summary { cursor:pointer; padding-block:8px; }
  .reasons { padding-top:4px; }
</style>
