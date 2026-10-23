<script lang="ts">
  import { onMount } from 'svelte'
  import Sheet from './Sheet.svelte'
  import DesignPreview from './DesignPreview.svelte'
  import { createDesign, saveCreatedDesign, designPreview, type EquipmentDesign } from '../lib/equipment/index.ts'
  import type { Project } from '../lib/store/manifest.ts'
  import { ui, designSource, toast } from './state.svelte.ts'
  import { Bookmark, TriangleAlert } from './icons.ts'

  const source = designSource.project
  const itemId = designSource.itemId
  const variants = designSource.variants
  let name = $state((source?.manifest.items.find((i) => i.id === itemId)?.name ?? '').slice(0, 60))
  let design = $state.raw<EquipmentDesign | null>(null)
  let project = $state.raw<Project | null>(null)
  let busy = $state(false)
  let error = $state('')
  let alive = true
  onMount(() => () => { alive = false })
  $effect(() => {
    let stale = false
    if (source) void createDesign(source, itemId, variants).then(async (d) => {
      const p = await designPreview(d)
      if (!stale) { design = d; project = p }
    }).catch((e: unknown) => { if (!stale) error = e instanceof Error ? e.message : 'Could not prepare this design.' })
    return () => { stale = true }
  })
  async function save() {
    if (!design || !name.trim()) return
    busy = true; error = ''
    try {
      const saved = await saveCreatedDesign({ ...design, name: name.trim() })
      toast(saved.id === design.id ? `Saved ${saved.name} to shared designs` : `This colourway is already saved as ${saved.name}`)
      if (alive && ui.sheet === 'savedesign') ui.sheet = null
    } catch (e) { error = e instanceof Error ? e.message : 'Could not save this design.' }
    finally { busy = false }
  }
</script>

{#snippet footer()}
  <span class="foot-note">Free · saved in this browser</span>
  <button class="btn primary lg" disabled={!design || !project || !name.trim() || busy} onclick={save}><Bookmark size={16} />{busy ? 'Saving…' : 'Save design'}</button>
{/snippet}
<Sheet title="Save shared design" {footer} cancelDisabled={busy} onclose={() => (ui.sheet = null)}>
  <label class="field"><span class="label">Design name</span><input class="input" bind:value={name} maxlength="60" /></label>
  <p class="muted small">Saves this item’s current colours and references. Each character gets an independent fitted copy; later changes to the original item stay with that character.</p>
  {#if error}<p class="notice bad small" role="alert"><TriangleAlert size={14} />{error}</p>
  {:else if project && design}<DesignPreview {project} itemId={design.itemId} itemOnly />
  {:else}<p class="muted" role="status">Preparing the current colourway…</p>{/if}
</Sheet>
