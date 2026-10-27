<script lang="ts">
  import Sheet from './Sheet.svelte'
  import { customize } from './experience/state.svelte.ts'
  import { default as ApiPeek } from './ApiPeek.svelte'
  import { createPlan } from './apiPlans.ts'
  import { formDrafts } from './formDrafts.ts'
  import Sprite from './Sprite.svelte'
  import { composeCell } from '../lib/compose/compose.ts'
  import { loadProject } from '../lib/store/project.ts'
  import type { Project } from '../lib/store/manifest.ts'
  import type { ClipQa } from '../lib/rig/clips.ts'
  import { STEPS, estimate, type CreateSpec } from './create.ts'
  import BaseMoves from './BaseMoves.svelte'
  import CharacterForm from './CharacterForm.svelte'
  import { autoFrame, draftErrors, facingOf, freshSeed, newCharacterDraft } from './characterConfig.ts'
  import { nameFrom, bodyQualityNote as plain } from './model.ts'
  import { ui, creating, startCreate, createBusy, cancelCreate, openProject, withKey } from './state.svelte.ts'
  import { Check, CircleAlert, TriangleAlert } from './icons.ts'
  let d = $state(formDrafts.character ?? newCharacterDraft())
  let enhancing = $state(false)
  const frameSize = $derived(d.auto && Number.isFinite(d.body) ? autoFrame(d.body!) : d.frame)
  const errors = $derived(draftErrors(d))
  const formSpec = $derived<CreateSpec>({ description: d.prompt, name: d.name.trim() || (d.details ? nameFrom(d.details) : d.kind !== 'Not set' ? d.kind : 'My character'), seed: d.seed ? Number(d.seed) : 0, size: d.body || 0, frame: frameSize, view: d.view, directions: facingOf(d), exactPrompt: true })
  const est = $derived(estimate(creating.spec ?? formSpec))
  const lo = $derived(Math.round(est.gens)), hi = $derived(Math.ceil((est.maxGens) / 5) * 5)
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
      failedNotes = Object.entries(qa?.clips ?? {}).flatMap(([clip, qa]) => [...qa.fails, ...(qa.warnings ?? [])].map(f => `${clip}: ${f}`))
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
    withKey(() => { if (!createBusy()) formDrafts.character = undefined; void startCreate(spec); ui.sheet = 'create' }, true) // refused (a resumed create runs): keep the form
  }
  const nice = (id: string) => id[0].toUpperCase() + id.slice(1).replace(/-/g, ' ')
  async function open() {
    const id = creating.projectId
    await cancelCreate()
    ui.sheet = null
    ui.welcome = false
    await openProject(id)
    customize()
  }
</script>

<Sheet title="New character" cancel={running ? 'Hide' : creating.projectId ? 'Close' : 'Cancel'} onclose={() => (ui.sheet = null)} className="character-sheet" wide>
  {#snippet heading()}{#if !creating.spec}<label class="character-name-field"><span>Name</span><input class="bu-input input character-name" aria-label="Name" title="Library and export name; not part of the prompt" bind:value={d.name} placeholder="Name" maxlength="80" /></label>{/if}{/snippet}
  {#if creating.projectId}
    <div class="create-review">
      <ApiPeek scope="character-create-result" label="Completed character generation" plan={creating.spec ? createPlan(creating.spec) : []} activityScope={creating.spec?.activityScope} />
      <h3 style="font-size:var(--fs-title)">{creating.spec?.name} is ready</h3>
      {#if result}
        {@const a = result.manifest.rig.animations.find((x) => x.id === 'walk') ?? result.manifest.rig.animations[0]}
        <div class="review-grid">
          {#each result.manifest.rig.directions as d (d.id)}
            <figure><Sprite img={composeCell(result, {}, a.id, d.id, a.frames[frame % a.frames.length].cell)} w={result.manifest.rig.cell.w} h={result.manifest.rig.cell.h} {k} checker label="{creating.spec?.name} {a.id} {d.id}" />{nice(d.id)}</figure>
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
      {#if creating.views.length}
        <div class="review-grid">
          {#each creating.views as v (v.id)}<figure><Sprite img={v.img} {k} checker label="{creating.spec?.name} standing {v.id}" />{nice(v.id)}</figure>{/each}
        </div>
      {/if}
      {#if creating.error}
        <p class="notice bad small"><CircleAlert size={14} />{creating.error.includes('5000') || /policy/i.test(creating.error) ? 'PixelLab declined this description. Try different words.' : creating.error}</p>
      {:else}
        <p class="muted small">Estimated time: about {est.minutes} minutes plus PixelLab queue time. Busy queues and quality checks can take much longer. You can hide this sheet and keep working. After a reload, check Activity if a request needs attention.</p>
      {/if}
    </div>
  {:else}
    <CharacterForm bind:draft={d} bind:busy={enhancing} onconnect={connectEnhance} />
  {/if}

  {#snippet footer()}
    {#if creating.projectId}
      <span class="foot-note">Saved on this device.</span>
      {#if result}<BaseMoves projectId={creating.projectId} manifest={result.manifest} onadd={() => void open()} />{/if}
      <button class="bu-action btn primary lg" data-variant="primary" onclick={open}>Start dressing up</button>
    {:else if creating.error}
      <button class="bu-action btn plain" data-variant="quiet" onclick={cancelCreate}>Start over</button>
      <span class="api-action"><ApiPeek scope="character-create-retry" label="Create character again" plan={creating.spec ? createPlan(creating.spec, true) : []} /><button class="bu-action btn primary" data-variant="primary" onclick={() => creating.spec && withKey(() => { void startCreate({ ...$state.snapshot(creating.spec!), projectId: undefined, seed: 1 + Math.floor(Math.random() * 1_000_000) }); ui.sheet = 'create' }, true)}>Try again <span class="cost">{lo}–{hi} gens</span></button></span><!-- new seed: the same one re-reads the cached (bad) results (R6 P2-7) -->
    {:else if running}
      <span class="foot-note">Estimated {lo}–{hi} gens</span>
      <button class="bu-action btn" data-variant="outline" onclick={() => (ui.sheet = null)}>Keep working</button>
    {:else}
      <span class="foot-note creator-cost" title="The standing views in every direction; add idle, walk and other moves afterward. A missing standing joint may cost a little more">~{lo}–{hi} gens</span>
      <span class="api-action"><ApiPeek scope="character-create" label="Create character" plan={createPlan(formSpec, !d.seed)} /><button class="bu-action btn primary lg" data-variant="primary" disabled={!!errors.length || enhancing} onclick={go}>Create character</button></span>
    {/if}
  {/snippet}
</Sheet>

<style>
  .quality-notes { width:100%; text-align:left; color:var(--text-2); }
  summary { cursor:pointer; padding-block:8px; }
  .reasons { padding-top:4px; }
</style>
