<script lang="ts">
  import { onMount } from 'svelte'
  import Sheet from './Sheet.svelte'
  import Sprite from './Sprite.svelte'
  import { bakedFrame, composeCell } from '../lib/compose/compose.ts'
  import { moveDirs, recolour } from '../lib/dress/dress.ts'
  import { alignCharacter, planAlignment, type AlignedCharacter, type AlignmentPlan } from '../lib/rig/align.ts'
  import type { DirectionName } from '../lib/store/manifest.ts'
  import { ui, prepareAlignmentSource, saveAlignmentCopy, alignmentBlocked, type AlignmentSource } from './state.svelte.ts'

  let source = $state.raw<AlignmentSource | null>(null)
  let plan = $state.raw<AlignmentPlan | null>(null)
  let aligned = $state.raw<AlignedCharacter | null>(null)
  let selected = $state<DirectionName[]>([])
  let name = $state(''), error = $state(''), saveError = $state('')
  let preparing = $state(true), saving = $state(false), loaded = $state(false)
  let mode = $state<'before' | 'aligned'>('aligned'), move = $state(''), frameIndex = $state(0)
  let alive = true
  const blocked = $derived(alignmentBlocked())
  const offsets = $derived.by(() => {
    const out: Partial<Record<DirectionName, number>> = {}
    for (const group of plan?.groups ?? []) if (selected.includes(group.id)) {
      for (const dir of group.directions) out[dir] = group.offset
    }
    return out
  })
  const hasChanges = $derived(Object.values(offsets).some(Boolean))

  onMount(() => {
    void prepareAlignmentSource().then((s) => {
      if (!alive) return
      source = s
      plan = planAlignment(s.project)
      name = `${s.project.manifest.name} aligned`.slice(0, 80)
      selected = plan.groups.filter((g) => g.offset !== 0).map((g) => g.id)
      loaded = true
    }).catch((e: unknown) => { if (alive) { error = e instanceof Error ? e.message : String(e); preparing = false } })
    return () => { alive = false }
  })

  $effect(() => {
    const s = source, chosen = offsets
    if (!s) return
    let stale = false
    aligned = null; error = ''; saveError = ''; preparing = true
    if (!Object.values(chosen).some(Boolean) && !plan?.errors.length) {
      preparing = false
      return
    }
    void alignCharacter(s.project, s.record, chosen).then((result) => {
      if (!stale && alive) { aligned = result; preparing = false }
    }).catch((e: unknown) => {
      if (!stale && alive) { error = e instanceof Error ? e.message : String(e); preparing = false }
    })
    return () => { stale = true }
  })

  const preview = $derived(mode === 'before' || !hasChanges ? source?.project : aligned?.project)
  const dressed = $derived(preview && source ? recolour(preview, source.outfit.variants) : null)
  const animations = $derived(source?.project.manifest.rig.animations ?? [])
  const clip = $derived(animations.find((a) => a.id === move) ?? animations[0])
  // Keep a single union frame for both sides, including oversized equipment.
  const frame = $derived(source ? bakedFrame(source.project.manifest) : null)
  const dirs = $derived(source && clip ? moveDirs(source.project.manifest, clip.id) : [])
  const k = $derived(Math.max(1, Math.round((ui.size === 'compact' || ui.size === 'landscape' ? 1 : 2) * ui.dpr)))
  $effect(() => {
    const animation = clip
    if (!animation?.frames.length) return
    const timeout = setTimeout(() => frameIndex++, animation.frames[frameIndex % animation.frames.length].ms)
    return () => clearTimeout(timeout)
  })
  function toggle(id: DirectionName) {
    selected = selected.includes(id) ? selected.filter((d) => d !== id) : [...selected, id]
  }
  async function save() {
    if (!source || !aligned || !name.trim() || !hasChanges || preparing || saving || blocked) return
    saving = true; saveError = ''
    try { await saveAlignmentCopy(source, aligned, name.trim()) }
    catch (e: unknown) { if (alive) { saveError = e instanceof Error ? e.message : String(e); saving = false } }
  }
  const label = (d: string) => d[0].toUpperCase() + d.slice(1).replace(/-/g, ' ')
</script>

<Sheet title="Align directions" wide cancelDisabled={saving} onclose={() => (ui.sheet = null)} className="alignment-sheet">
  <p class="small muted alignment-intro">Moves every frame and layer together. Preserves motion; does not repair poses.</p>
  {#if source && plan}
    <div class="alignment-layout">
      <div class="alignment-settings">
        <label class="field"><span class="label">Copy name</span><input class="input" maxlength="80" bind:value={name} disabled={saving} /></label>
        <fieldset disabled={saving} class="alignment-groups">
          <legend class="label">Directions</legend>
          {#each plan.groups as group (group.id)}
            <label class="alignment-group" class:unchanged={!group.offset}>
              <input type="checkbox" checked={selected.includes(group.id)} disabled={!group.offset} onchange={() => toggle(group.id)} />
              <span>{group.directions.map(label).join(' / ')}</span>
              <span class="faint num">{group.offset > 0 ? '+' : ''}{group.offset} px</span>
            </label>
          {/each}
        </fieldset>
        {#if !plan.groups.some((g) => g.offset)}<p class="small muted">Standing directions already share a baseline.</p>{/if}
        <p class="faint small">Applies to every move. Mirrored views stay linked. Original stays unchanged.</p>
      </div>
      <section class="alignment-review" aria-label="Alignment preview">
        <div class="alignment-controls">
          <div class="seg" role="group" aria-label="Alignment comparison">
            <button aria-pressed={mode === 'before'} onclick={() => (mode = 'before')}>Before</button>
            <button aria-pressed={mode === 'aligned'} onclick={() => (mode = 'aligned')}>Aligned</button>
          </div>
          <label class="alignment-move"><span class="sr">Preview move</span><select class="input" value={clip?.id ?? ''} onchange={(e) => { move = e.currentTarget.value; frameIndex = 0 }}>{#each animations as a (a.id)}<option value={a.id}>{label(a.id)}</option>{/each}</select></label>
        </div>
        <div class="alignment-art" aria-busy={preparing}>
          {#if dressed && source && clip && frame}
            {#each dirs as dir (dir)}
              <figure><Sprite img={composeCell(dressed, source.outfit.items, clip.id, dir, clip.frames[frameIndex % clip.frames.length].cell, frame)} w={frame.w} h={frame.h} {k} limit={ui.size === 'compact' || ui.size === 'landscape' ? 110 : 180} checker label="{label(dir)}, {mode}, {clip.id}" /><figcaption class="faint small">{label(dir)}</figcaption></figure>
            {/each}
          {:else if preparing}<span class="small muted" role="status">Preparing preview…</span>
          {:else}<span class="small muted">Select Before to review the original.</span>{/if}
        </div>
      </section>
    </div>
  {:else if !error}<p class="small muted" role="status">Loading character…</p>{/if}
  {#if error}<p class="notice bad small" role="alert">{error}</p>{/if}
  {#if saveError}<p class="notice bad small" role="alert">{saveError}</p>{/if}
  {#if blocked}<p class="notice warn small" role="status">{blocked}</p>{/if}
  {#snippet footer()}
    <span class="foot-note">Local processing · no credits</span>
    <button class="btn primary" disabled={!loaded || !aligned || preparing || saving || !!error || !!blocked || !hasChanges || !name.trim()} onclick={save}>{saving ? 'Saving…' : 'Create aligned copy'}</button>
  {/snippet}
</Sheet>

<style>
  .alignment-intro { margin: 0; }
  .alignment-layout { display: grid; grid-template-columns: minmax(200px, 0.8fr) minmax(0, 1.5fr); gap: 24px; min-width: 0; }
  .alignment-settings { display: flex; flex-direction: column; gap: 16px; min-width: 0; }
  .alignment-settings p { margin: 0; }
  .alignment-groups { border: 0; padding: 0; margin: 0; min-width: 0; }
  .alignment-groups legend { margin-bottom: 8px; }
  .alignment-group { display: flex; align-items: center; gap: 8px; min-height: 40px; border-bottom: 1px solid var(--line); font-size: 12px; }
  .alignment-group > span:first-of-type { flex: 1; min-width: 0; }
  .alignment-group > span:last-child { white-space: nowrap; }
  .alignment-group.unchanged { color: var(--text-3); }
  .alignment-review { min-width: 0; }
  .alignment-controls { display: flex; align-items: center; justify-content: space-between; gap: 12px; flex-wrap: wrap; }
  .alignment-move { min-width: 0; max-width: 180px; }
  .alignment-art { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 12px; min-height: 160px; margin-top: 16px; align-items: center; }
  .alignment-art figure { margin: 0; min-width: 0; text-align: center; }
  .alignment-art figcaption { margin-top: 4px; }
  @media (max-width: 640px) {
    .alignment-layout { grid-template-columns: minmax(0, 1fr); gap: 20px; }
    .alignment-art { gap: 8px; }
    .alignment-group { min-height: 44px; }
  }
</style>
