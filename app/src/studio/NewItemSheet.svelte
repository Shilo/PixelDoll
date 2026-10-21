<script lang="ts">
  import Sheet from './Sheet.svelte'
  import GroupIcon from './GroupIcon.svelte'
  import { GROUPS, slotLabel, titleCase } from './model.ts'
  import { itemRoute } from './itemRoute.ts'
  import { ui, doc, store, isDemo, startItem, withKey, copyDemo } from './state.svelte.ts'
  import * as db from '../lib/store/db.ts'
  import { SWATCHES } from '../lib/dress/dress.ts'
  import type { RigCtx } from '../lib/items/run.ts'
  import { ChevronDown, ChevronRight, Sparkles } from './icons.ts'

  let group = $state(ui.newItem.group)
  let slot = $state(ui.newItem.slot)
  let prompt = $state(ui.newItem.prompt)
  let colour = $state('')
  let name = $state('')
  let busy = $state(false)
  const g = $derived(GROUPS.find((x) => x.id === group)!)
  $effect(() => { if (!g.slots.includes(slot)) slot = g.slots[0] })

  const m = $derived(store.project?.manifest)
  const fullPrompt = $derived(`${prompt.trim()}${colour ? `, ${colour} coloured` : ''}`)
  const itemName = $derived(name.trim() || titleCase(prompt.trim().split(/[,.]/)[0].split(/\s+/).slice(0, 3).join(' ')) || 'New item')
  const input = $derived({ name: itemName, slot, prompt: fullPrompt })
  // the project record (skeletons decide the route); pixels are not needed for the plan
  let rec = $state.raw<RigCtx['rec'] | null>(null)
  $effect(() => { if (!isDemo()) void db.get<RigCtx['rec']>('projects', doc.id).then((r) => (rec = r ?? null)) })
  const plan = $derived(m && rec ? itemRoute.plan(m.rig, { rec: { ...rec, manifest: m } } as RigCtx, input) : null)

  async function make(i: typeof input) {
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
</script>

{#snippet foot()}
      <span class="foot-note">{plan ? `About ${plan.minutes + 2} min. You can keep working.` : ''}</span>
      <button class="btn primary lg" disabled={!prompt.trim() || busy || !plan?.calls} onclick={() => { const i = $state.snapshot(input); withKey(() => void make(i)) }}>Make <span class="cost">{plan?.gens ?? '–'} gens</span></button>
{/snippet}

<Sheet title="New item" onclose={() => (ui.sheet = null)} footer={isDemo() ? undefined : foot}>
  {#if isDemo()}
    <div class="notice small">
      <Sparkles size={16} />
      <span>Items are drawn for your own character. Create one, or make an editable copy of the demo body to add items to it.</span>
    </div>
    <div class="actions">
      <button class="btn primary" onclick={() => (ui.sheet = 'create')}>Create your character</button>
      <button class="btn" onclick={useCopy} disabled={busy}>{busy ? 'Copying…' : 'Copy the demo body'}</button>
    </div>
  {:else}
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
          {#if plan}<p class="faint small">{plan.calls} PixelLab calls · {plan.cells} frames · {itemRoute.label}. Failed checks re-roll automatically (up to 2×).</p>{/if}
        </div>
      </details>
    </div>
  {/if}
</Sheet>
