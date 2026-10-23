<script lang="ts">
  import Sheet from './Sheet.svelte'
  import { default as ApiPeek } from './ApiPeek.svelte'
  import { itemPlan } from './apiPlans.ts'
  import { formDrafts } from './formDrafts.ts'
  import GroupIcon from './GroupIcon.svelte'
  import DesignLibrary from './DesignLibrary.svelte'
  import { GROUPS, slotLabel, itemNameFrom } from './model.ts'
  import { itemRoute } from './itemRoute.ts'
  import { ui, doc, store, isDemo, startItem, withKey, copyDemo } from './state.svelte.ts'
  import * as db from '../lib/store/db.ts'
  import { SWATCHES } from '../lib/dress/dress.ts'
  import type { RigCtx } from '../lib/items/run.ts'
  import { rigReady } from '../lib/rig/setup.ts'
  import { ChevronDown, ChevronRight, Sparkles, TriangleAlert } from './icons.ts'

  const draft = formDrafts.item?.projectId === doc.id && formDrafts.item.sourceGroup === ui.newItem.group && !ui.newItem.prompt ? formDrafts.item : undefined
  let group = $state(draft?.group ?? ui.newItem.group)
  let slot = $state(draft?.slot ?? ui.newItem.slot)
  let prompt = $state(draft?.prompt ?? ui.newItem.prompt)
  let colour = $state(draft?.colour ?? '')
  let name = $state(draft?.name ?? '')
  let busy = $state(false)
  const g = $derived(GROUPS.find((x) => x.id === group)!)
  $effect(() => { if (!g.slots.includes(slot)) slot = g.slots[0] })

  const m = $derived(store.project?.manifest)
  const fullPrompt = $derived(`${prompt.trim()}${colour ? `, ${colour} coloured` : ''}`)
  const itemName = $derived(name.trim() || itemNameFrom(prompt) || 'New item')
  const input = $derived({ name: itemName, slot, prompt: fullPrompt })
  // the project record (skeletons decide the route); pixels are not needed for the plan
  let rec = $state.raw<RigCtx['rec'] | null>(null)
  $effect(() => { if (!isDemo()) void db.get<RigCtx['rec']>('projects', doc.id).then((r) => (rec = r ?? null)) })
  const planned = $derived.by(() => {
    try { return { plan: m && rec ? itemRoute.plan(m.rig, { rec: { ...rec, manifest: m } } as RigCtx, input) : null, error: '' } }
    catch (e) { return { plan: null, error: (e as Error).message } }
  })
  const plan = $derived(planned.plan)

  async function make(i: typeof input) {
    formDrafts.item = undefined
    busy = true
    try {
      ui.sheet = null
      await startItem(i)
      if (ui.size === 'expanded' || ui.size === 'medium') ui.inspTab = 'item'
      else ui.tab = 'wardrobe'
    } finally { busy = false }
  }
  async function useCopy() {
    busy = true
    try { await copyDemo() } finally { busy = false }
  }
  function go() {
    formDrafts.item = { projectId: doc.id, sourceGroup: ui.newItem.group, group, slot, prompt, colour, name }
    const i = $state.snapshot(input)
    withKey(() => void make(i), !!plan?.minimumTier)
  }
</script>

{#snippet foot()}
      <span class="foot-note">{plan ? `About ${plan.minutes + 2} min. You can keep working.` : ''}</span>
      <span class="api-action"><ApiPeek scope="item-make" label="Make item" plan={itemPlan(m && rec ? { rec: { ...rec, manifest: m } } as RigCtx : null, input)} /><button class="btn primary lg" disabled={!prompt.trim() || busy || !plan?.calls} onclick={go}>Make <span class="cost">{plan?.gens ?? '–'} gens</span></button></span>
{/snippet}

<Sheet title="New item" onclose={() => (ui.sheet = null)} footer={isDemo() || ui.newItemTab === 'designs' ? undefined : foot}>
  <div class="seg full" role="tablist" aria-label="Item source"><button role="tab" aria-selected={ui.newItemTab === 'create'} onclick={() => (ui.newItemTab = 'create')}>Create</button><button role="tab" aria-selected={ui.newItemTab === 'designs'} onclick={() => (ui.newItemTab = 'designs')}>Saved designs</button></div>
  {#if ui.newItemTab === 'designs'}
    {#if isDemo()}<p class="notice small"><Sparkles size={16} /><span>Make an editable copy of the demo before adding a fitted item.</span><button class="btn sm" disabled={busy} onclick={useCopy}>Copy demo body</button></p>{/if}
    {#key doc.id}<DesignLibrary />{/key}
  {:else if isDemo()}
    <div class="notice small">
      <Sparkles size={16} />
      <span>Items are drawn for your own character. Create one, or make an editable copy of the demo body to add items to it.</span>
    </div>
    <div class="actions">
      <button class="btn primary" onclick={() => (ui.sheet = 'create')}>Create your character</button>
      <button class="btn copy-demo" onclick={useCopy} disabled={busy}>
        <span class:copy-hidden={busy}>Copy the demo body</span>
        <span class:copy-hidden={!busy}>Copying…</span>
      </button>
    </div>
  {:else}
    {#if rec && !rigReady(rec)}<p class="notice small"><TriangleAlert size={16} /><span>Set up this character to use skeleton-posed equipment, oversize weapons and new moves.</span><button class="btn small" onclick={() => (ui.sheet = 'setup')}>Set up character</button></p>{/if}
    {#if planned.error}<p class="notice warn small" role="alert"><TriangleAlert size={16} /><span>This character’s frames cannot use the item generator: {planned.error}</span></p>{/if}
    <div class="form">
      <div class="field">
        <span class="label" id="where">Where does it go?</span>
        <div class="chips" role="radiogroup" aria-labelledby="where">
          {#each GROUPS as x (x.id)}
            <button class="chip" role="radio" aria-checked={group === x.id} onclick={() => (group = x.id)}><GroupIcon group={x.id} size={14} />{x.id}</button>
          {/each}
        </div>
      </div>
      <label class="field">
        <span class="label">What is it?</span>
        <textarea class="input" rows="2" bind:value={prompt} placeholder="e.g. {g.ideas[0]?.label ?? 'a leather hat'}" maxlength="300"></textarea>
      </label>
      <div class="chips" aria-label="Ideas">
        {#each g.ideas as idea (idea.label)}
          <button class="chip" onclick={() => { prompt = idea.label; if (idea.slot) slot = idea.slot }}>{idea.label}</button>
        {/each}
      </div>
      <div class="field">
        <span class="label">Colour hint <span class="faint">(optional)</span></span>
        <div class="dots" role="radiogroup" aria-label="Colour hint">
          <button class="dot-swatch none" role="radio" aria-checked={!colour} onclick={() => (colour = '')}>Any</button>
          {#each Object.entries(SWATCHES) as [n, hex] (n)}
            <button class="dot-swatch" role="radio" aria-checked={colour === n} aria-label={n} title={n} style:background={hex} onclick={() => (colour = n)}></button>
          {/each}
        </div>
      </div>
      <details class="disclosure">
        <summary><ChevronRight size={14} />Details</summary>
        <div>
          <label class="field"><span class="label small">Name</span><input class="input" bind:value={name} placeholder={itemName} /></label>
          {#if g.slots.length > 1}
            <label class="field"><span class="label small">Exact slot</span>
              <span class="select-wrap boxed"><select class="select" bind:value={slot}>{#each g.slots as s (s)}<option value={s}>{slotLabel(s)}</option>{/each}</select><ChevronDown size={12} /></span>
            </label>
          {/if}
          {#if plan}<p class="faint small">{plan.calls} PixelLab calls · {plan.cells} frames · {itemRoute.label}{plan.cell ? ` · ${plan.cell} px canvas so long weapons are never cut off` : ''}. Failed checks re-roll automatically (up to 2×).</p>{/if}
        </div>
      </details>
    </div>
  {/if}
</Sheet>

<style>
  .copy-demo { display: inline-grid; }
  .copy-demo > span { grid-area: 1 / 1; }
  .copy-hidden { visibility: hidden; }
</style>
